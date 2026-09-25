let sourcePreviewUrls=[],sourcePreviews=new Map(),editorNodes=new Map(),pdfRendererPromise,activePreview;
let layerMenu;
function closeLayerMenu(){if(layerMenu){layerMenu.remove();layerMenu=null;}}
function openLayerMenu(event,sequence){
  if(busy||dragState||layoutSettingsPending())return;
  event.preventDefault();event.stopPropagation();closeLayerMenu();selectDirectSource(sequence);
  const siblings=sheetLayerIds(sequence),position=siblings.indexOf(sequence);
  const menu=document.createElement('div');menu.className='layer-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','叠放顺序');
  for(const [label,action,disabled] of [['上移一层','forward',position===siblings.length-1],['下移一层','backward',position===0],['置于顶层','front',position===siblings.length-1],['置于底层','back',position===0]]){
    const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label;button.disabled=disabled;
    button.onclick=()=>{closeLayerMenu();changeLayer(sequence,action)};menu.append(button);
  }
  document.body.append(menu);layerMenu=menu;
  const anchor=editorNodes.get(sequence)?.clip.getBoundingClientRect();
  const x=Number.isFinite(event.clientX)&&event.clientX?event.clientX:anchor?.left||0;
  const y=Number.isFinite(event.clientY)&&event.clientY?event.clientY:anchor?.top||0;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
  menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
document.addEventListener('pointerdown',e=>{if(layerMenu&&!layerMenu.contains(e.target))closeLayerMenu()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&layerMenu){e.preventDefault();closeLayerMenu()}},true);
window.addEventListener('scroll',closeLayerMenu,true);
async function previewStep(promise){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('预览处理超时，请点击生成打印稿重试，或将文件分批处理')),45000)})]);}
  finally{clearTimeout(timer);}
}
function disposeDirectPreview(){
  if(activePreview){activePreview.cancelled=true;activePreview.observer?.disconnect();activePreview.task.destroy().catch(()=>{});activePreview=null;}
  sourcePreviewUrls.forEach(URL.revokeObjectURL);sourcePreviewUrls=[];sourcePreviews.clear();editorNodes.clear();$('#paper-editor').replaceChildren();$('#paper-editor').hidden=true;
}
function refreshPreviewObserver(){
  const observer=activePreview?.observer;if(!observer)return;
  observer.disconnect();document.querySelectorAll('.editable-paper').forEach(paper=>observer.observe(paper));
}
async function renderSourcePreview(state,row){
  if(state.cancelled)return;
  const page=await previewStep(state.doc.getPage(row.sequence));let canvas;
  try{
    const view=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:Math.min(2,1200/Math.max(view.width,view.height))});
    canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await previewStep(page.render({canvasContext:canvas.getContext('2d'),viewport}).promise);
    const blob=await previewStep(new Promise(resolve=>canvas.toBlob(resolve,'image/png')));
    if(!blob)throw Error('无法创建文档预览');
    if(state.cancelled)return;
    const src=URL.createObjectURL(blob);sourcePreviewUrls.push(src);sourcePreviews.set(row.sequence,src);
    const node=editorNodes.get(row.sequence);if(node){node.img.src=src;node.img.hidden=false;}
  }finally{if(canvas)canvas.width=canvas.height=0;page.cleanup();}
}
function queueSourcePreview(state,row){
  if(state.cancelled||sourcePreviews.has(row.sequence)||state.queued.has(row.sequence))return;
  state.queued.add(row.sequence);state.queue.push(row);pumpSourcePreviews(state);
}
function pumpSourcePreviews(state){
  while(!state.cancelled&&state.running<2&&state.queue.length){
    const row=state.queue.shift();state.running++;
    renderSourcePreview(state,row).catch(()=>{if(!state.cancelled)editorNodes.get(row.sequence)?.clip.classList.add('preview-error')})
      .finally(()=>{state.running--;state.queued.delete(row.sequence);pumpSourcePreviews(state)});
  }
}
function positionOnPaper(el,box,H=841.89,W=595.28){
  Object.assign(el.style,{left:(box.x/W*100)+'%',top:((H-box.y-box.height)/H*100)+'%',width:(box.width/W*100)+'%',height:(box.height/H*100)+'%'});
}
async function renderDirectPreview(bytes,rows){
  if(!pdfRendererPromise)pdfRendererPromise=import('./assets/pdfjs/pdf.min.mjs').catch(e=>{pdfRendererPromise=null;throw e});
  const renderer=await pdfRendererPromise;
  renderer.GlobalWorkerOptions.workerSrc=new URL('./assets/pdfjs/pdf.worker.min.mjs',location.href).href;
  const task=renderer.getDocument({data:bytes.slice(),isEvalSupported:false,stopAtErrors:true,
    cMapUrl:new URL('./assets/pdfjs/cmaps/',location.href).href,cMapPacked:true,
    standardFontDataUrl:new URL('./assets/pdfjs/standard_fonts/',location.href).href,useWasm:false});
  const state={task,doc:null,queue:[],queued:new Set(),running:0,cancelled:false,observer:null};activePreview=state;
  try{
    state.doc=await previewStep(task.promise);
    const first=rows.filter(row=>row.outputPage===rows[0].outputPage);let next=0;
    const workers=await Promise.allSettled(Array.from({length:Math.min(2,first.length)},async()=>{
      while(next<first.length)await renderSourcePreview(state,first[next++]);
    }));
    const failed=workers.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    rebuildDirectPapers(rows);$('#paper-editor').hidden=false;$('#empty').hidden=true;
    state.observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        const sheet=Number(entry.target.dataset.outputPage);
        for(const row of (adjustmentRows.length?adjustmentRows:rows).filter(row=>row.outputPage===sheet))queueSourcePreview(state,row);
      }
    },{root:null,rootMargin:'400px 0px'});
    refreshPreviewObserver();
  }catch(e){disposeDirectPreview();throw e;}
}
function rebuildDirectPapers(rows){
  const focused=document.activeElement,focusId=focused?.dataset?.sourceId;
  editorNodes.clear();$('#paper-editor').replaceChildren();const papers=new Map();
  if(!rows.length){const message=document.createElement('p');message.className='direct-empty';message.setAttribute('role','status');message.textContent='没有可打印的页面';$('#paper-editor').append(message);}
  for(const row of rows){
    const dims=InvoicePrototype.paperLayout(row.perPage||Number($('#layout').value),row.orientation||$('#orientation').value);
    let paper=papers.get(row.outputPage);
    if(!paper){
      paper=document.createElement('figure');paper.className='editable-paper';paper.style.aspectRatio=dims.W+'/'+dims.H;paper.dataset.outputPage=String(row.outputPage);
      paper.style.setProperty('--source-font',(800/dims.W)+'cqw');paper.setAttribute('aria-label','A4 第 '+row.outputPage+' 页');
      const surface=document.createElement('div');surface.className='paper-surface';paper.append(surface);
      const caption=document.createElement('figcaption');caption.textContent='A4 第 '+row.outputPage+' 页';paper.append(caption);papers.set(row.outputPage,paper);$('#paper-editor').append(paper);
    }
    addSourceToPaper(paper,row,sourcePreviews.get(row.sequence));
  }
  $('#paper-editor').classList.toggle('single-paper',papers.size===1);
  sizePreview();
  refreshPreviewObserver();
  if(focusId&&editorNodes.has(Number(focusId)))editorNodes.get(Number(focusId)).clip.focus({preventScroll:true});
}
function addSourceToPaper(paper,row,src){
  const g=rowGeometry(row),surface=paper.querySelector('.paper-surface');
  const place=(el,box)=>positionOnPaper(el,box,g.H,g.W);
  const border=document.createElement('div');border.className='page-slot';place(border,{x:g.x,y:g.y,width:g.cw,height:g.ch});surface.append(border);
  const clip=document.createElement('div');clip.className='source-clip';clip.tabIndex=0;clip.setAttribute('role','button');clip.setAttribute('aria-label','选择内容 '+row.sequence+'：'+row.file+'，原第 '+row.sourcePage+' 页');
  clip.dataset.sourceId=row.sequence;clip.dataset.control='move';place(clip,g.content);
  const img=document.createElement('img');img.className='source-image';if(src)img.src=src;else img.hidden=true;img.alt='';img.draggable=false;clip.append(img);surface.append(clip);
  const selection=document.createElement('div');selection.className='selection-box';selection.hidden=true;
  const badge=document.createElement('span');badge.className='scale-badge';selection.append(badge);
  for(const [corner,sx,sy]of [['nw',-1,-1],['ne',1,-1],['sw',-1,1],['se',1,1]]){
    const handle=document.createElement('button');handle.className='resize-handle '+corner;handle.setAttribute('aria-label','内容 '+row.sequence+' '+({nw:'左上',ne:'右上',sw:'左下',se:'右下'}[corner])+'角缩放');
    handle.title='横拖改宽，竖拖改高；按住 Shift 保持当前比例。方向键微调。';
    handle.onpointerdown=e=>startDirectResize(e,row,handle,sx,sy);handle.onkeydown=e=>keyboardResize(e,row,sx,sy);selection.append(handle);
  }
  const rotate=document.createElement('button');rotate.type='button';rotate.className='rotate-handle';rotate.textContent='↻';rotate.setAttribute('aria-label','旋转内容 '+row.sequence);
  rotate.title='拖动旋转；接近直角会自动吸附。';rotate.onpointerdown=e=>startDirectRotate(e,row,rotate);selection.append(rotate);
  const remove=document.createElement('button');remove.type='button';remove.className='delete-source';remove.setAttribute('aria-label','从打印稿删除 '+row.file+' 原第 '+row.sourcePage+' 页');remove.title='删除此页（选中后也可按 Delete 或 Enter）';
  remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6"/></svg>';
  remove.onpointerdown=e=>e.stopPropagation();remove.onclick=e=>{e.stopPropagation();deleteDirectSource(row.sequence)};selection.append(remove);
  surface.append(selection);editorNodes.set(row.sequence,{paper,border,clip,img,selection,badge,row});
  border.onpointerdown=e=>startDirectMove(e,row,border);
  border.oncontextmenu=e=>openLayerMenu(e,row.sequence);
  clip.title='拖动页面主体至目标页中央，松手交换；边缘重叠只移动；右键调整层次';
  clip.onclick=()=>{selectDirectSource(row.sequence);clip.focus({preventScroll:true});};
  clip.onpointerdown=e=>startDirectMove(e,row,clip);
  clip.oncontextmenu=e=>openLayerMenu(e,row.sequence);
  clip.onkeydown=e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();openLayerMenu(e,row.sequence)}else if(e.key==='Enter'||e.key==='Delete'){e.preventDefault();if(selectedSource===row.sequence)deleteDirectSource(row.sequence);else selectDirectSource(row.sequence)}else if(e.key===' '){e.preventDefault();selectDirectSource(row.sequence)}else if(e.altKey)keyboardSwap(e,row);else keyboardMove(e,row)};
  paintDirectSource(row.sequence);
}
function paintDirectSource(sequence){
  const node=editorNodes.get(sequence);if(!node)return;
  const {row,img,selection,badge}=node,pct=scaleValue(draftScales,sequence),g=rowGeometry(row),b=g.content,angle=draftAngles[sequence]||0;
  positionOnPaper(node.clip,b,g.H,g.W);
  Object.assign(img.style,{left:'0',top:'0',width:'100%',height:'100%',transform:''});
  node.clip.style.transform=angle?'rotate('+angle+'deg)':'';
  node.clip.style.zIndex=String(1+draftLayerOrder.indexOf(sequence));
  positionOnPaper(selection,b,g.H,g.W);selection.style.transform=angle?'rotate('+angle+'deg)':'';
  selection.hidden=sequence!==selectedSource;selection.classList.toggle('rotation-snapped',dragState?.kind==='rotate'&&dragState.sequence===sequence&&dragState.snapped);
  badge.textContent=scaleText(pct)+' · '+angle+'°';
  node.clip.setAttribute('aria-pressed',String(sequence===selectedSource));
  node.clip.setAttribute('aria-label',(sequence===selectedSource?'已选中，按 Delete 或 Enter 删除：':'选择内容：')+row.file+'，原第 '+row.sourcePage+' 页');
  selection.querySelectorAll('button').forEach(button=>button.disabled=busy||layoutSettingsPending()||!!dragState);
  node.clip.classList.toggle('moving',dragState?.sequence===sequence&&dragState.kind==='move');
}
