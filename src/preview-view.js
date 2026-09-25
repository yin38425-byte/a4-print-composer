const previewArea=$('.preview-area'),previewCanvas=$('.canvas');
let previewExpanded=false,previewFocus=null,zoomUpdate=0,viewAutoFit=true,fullscreenZoom=60,normalZoom=100,normalAutoFit=true;
function previewScrollsInternally(){return previewExpanded||matchMedia('(min-width:801px)').matches;}
function previewHeightBudget(){
  const style=getComputedStyle(previewCanvas);
  const padding=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+30;
  if(previewScrollsInternally())return Math.max(180,previewCanvas.clientHeight-padding);
  let top=previewCanvas.getBoundingClientRect().top+(previewExpanded?0:window.scrollY);
  if(!previewExpanded&&matchMedia('(max-width:800px)').matches)
    top=Math.min(top,$('.preview-head').offsetHeight+$('#adjustment').offsetHeight);
  return Math.max(180,innerHeight-top-padding);
}
function previewViewportCenter(){
  const rect=previewCanvas.getBoundingClientRect();
  const top=previewScrollsInternally()?rect.top:Math.max(0,rect.top);
  const bottom=previewScrollsInternally()?rect.bottom:Math.min(innerHeight,rect.bottom);
  return {x:rect.left+previewCanvas.clientWidth/2,y:(top+Math.max(top,bottom))/2,top,bottom,left:rect.left,right:rect.right};
}
function viewCenterAnchor(){
  const viewport=previewViewportCenter(),papers=[...document.querySelectorAll('.editable-paper')];
  let el=null,best=Infinity;
  for(const paper of papers){
    const rect=paper.getBoundingClientRect();
    if(rect.bottom<viewport.top||rect.top>viewport.bottom||rect.right<viewport.left||rect.left>viewport.right)continue;
    const dx=Math.max(rect.left-viewport.x,0,viewport.x-rect.right);
    const dy=Math.max(rect.top-viewport.y,0,viewport.y-rect.bottom);
    const distance=dx*dx+dy*dy;
    if(distance<best){best=distance;el=paper;}
  }
  if(!el)return null;
  const rect=el.getBoundingClientRect();
  return {el,x:viewport.x>=rect.left&&viewport.x<=rect.right?(viewport.x-rect.left)/rect.width:.5,
    y:viewport.y>=rect.top&&viewport.y<=rect.bottom?(viewport.y-rect.top)/rect.height:.5};
}
function restoreViewCenterAnchor(anchor,done,isCurrent=()=>true){
  requestAnimationFrame(()=>{
    if(!isCurrent())return;
    if(anchor?.el.isConnected){
      const viewport=previewViewportCenter(),rect=anchor.el.getBoundingClientRect();
      previewCanvas.scrollLeft+=rect.left+rect.width*anchor.x-viewport.x;
      const dy=rect.top+rect.height*anchor.y-viewport.y;
      if(previewScrollsInternally())previewCanvas.scrollTop+=dy;else window.scrollBy(0,dy);
    }
    done?.();
  });
}
function expandedPaperBase(row,width,budget){
  const paper=InvoicePrototype.paperLayout(row.perPage||Number($('#layout').value),row.orientation||$('#orientation').value);
  return Math.max(120,Math.min(width,budget*paper.W/paper.H));
}
function previewBase(){
  const width=Math.max(180,previewCanvas.clientWidth-56);
  if(!previewExpanded||!adjustmentRows.length)return width;
  const budget=previewHeightBudget();
  return Math.max(...adjustmentRows.map(row=>expandedPaperBase(row,width,budget)));
}
function sizePreview(){
  const width=previewCanvas.clientWidth,base=previewBase(),zoom=Number($('#view-zoom').value)/100;
  const papers=[...document.querySelectorAll('.editable-paper')],paperCount=papers.length;
  const budget=previewExpanded?previewHeightBudget():0,fullWidth=Math.max(180,width-56);
  const rowBySheet=new Map(adjustmentRows.map(row=>[row.outputPage,row]));
  for(const el of papers){
    const row=rowBySheet.get(Number(el.dataset.outputPage));
    if(previewExpanded&&row)el.style.setProperty('--paper-base',expandedPaperBase(row,fullWidth,budget)+'px');
    else el.style.removeProperty('--paper-base');
  }
  const sheetWidth=base*zoom,gap=20,columns=paperCount===1?1:Math.max(1,Math.min(8,Math.floor((width-32+gap)/(sheetWidth+gap))));
  const paper=InvoicePrototype.paperLayout(Number($('#layout').value),$('#orientation').value);
  const diagramWidth=Math.max(180,Math.min(width-32,previewHeightBudget()*paper.W/paper.H));
  const style=getComputedStyle(previewCanvas);
  const innerHeight=Math.max(0,previewCanvas.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom));
  previewArea.style.setProperty('--preview-inner-height',innerHeight+'px');
  $('#paper-editor').classList.toggle('single-paper',document.querySelectorAll('.editable-paper').length===1);
  previewArea.style.setProperty('--paper-base',base+'px');
  previewArea.style.setProperty('--diagram-width',diagramWidth+'px');
  previewArea.style.setProperty('--preview-zoom',zoom);
  previewArea.style.setProperty('--preview-columns',columns);
  previewArea.style.setProperty('--editor-width',(columns*sheetWidth+(columns-1)*gap)+'px');
}
new ResizeObserver(sizePreview).observe(previewCanvas);
function fitPreviewPage(){
  const row=adjustmentRows[0];
  const paper=InvoicePrototype.paperLayout(row?.perPage||Number($('#layout').value),row?.orientation||$('#orientation').value);
  const base=Math.max(180,previewCanvas.clientWidth-56);
  const percent=Math.max(10,Math.min(100,Math.floor(previewHeightBudget()*paper.W/paper.H/base*100)));
  viewAutoFit=true;$('#view-zoom').value=String(percent);$('#view-zoom-value').value=String(percent);sizePreview();
}
window.addEventListener('resize',()=>{if(viewAutoFit&&adjustmentRows.length)fitPreviewPage();else sizePreview();});
function setExpanded(open){
  if(dragState||previewExpanded===open)return;
  const anchor=viewCenterAnchor();
  if(open){previewFocus=document.activeElement;normalZoom=Number($('#view-zoom').value);normalAutoFit=viewAutoFit;}
  else fullscreenZoom=Number($('#view-zoom').value);
  previewExpanded=open;previewArea.classList.toggle('preview-expanded',open);document.body.style.overflow=open?'hidden':'';
  $('#preview-expand').setAttribute('aria-expanded',String(open));$('#preview-close').hidden=!open;
  for(const el of document.querySelectorAll('.topbar,.intro,.controls'))el.inert=open;
  if(open){previewArea.setAttribute('role','dialog');previewArea.setAttribute('aria-modal','true');$('#preview-close').focus({preventScroll:true});}
  else{previewArea.removeAttribute('role');previewArea.removeAttribute('aria-modal');if(previewFocus?.isConnected)previewFocus.focus({preventScroll:true});}
  const percent=open?fullscreenZoom:normalZoom;
  $('#view-zoom').value=String(percent);$('#view-zoom-value').value=String(percent);
  viewAutoFit=open?false:normalAutoFit;
  sizePreview();
  restoreViewCenterAnchor(anchor);
}
$('#preview-expand').onclick=()=>setExpanded(true);$('#preview-close').onclick=()=>setExpanded(false);
function applyViewZoom(value){
  if(dragState)return;
  viewAutoFit=false;
  const percent=Math.max(10,Math.min(200,Math.round(Number(value)||100))),update=++zoomUpdate;
  const papers=[...document.querySelectorAll('.editable-paper')];
  for(const el of papers)el.getAnimations().forEach(animation=>animation.cancel());
  const anchor=viewCenterAnchor(),before=new Map(papers.map(el=>[el,el.getBoundingClientRect()]));
  $('#view-zoom').value=String(percent);$('#view-zoom-value').value=String(percent);
  if(previewExpanded)fullscreenZoom=percent;
  sizePreview();restoreViewCenterAnchor(anchor,()=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    for(const [el,from] of before){
      if(!el.isConnected||from.bottom< -300||from.top>innerHeight+300)continue;
      const to=el.getBoundingClientRect();
      const dx=from.left+from.width/2-to.left-to.width/2;
      const dy=from.top+from.height/2-to.top-to.height/2;
      const scale=from.width/to.width;
      if(Math.abs(dx)<1&&Math.abs(dy)<1&&Math.abs(scale-1)<.001)continue;
      const move='translate('+dx+'px, '+dy+'px) scale('+scale+')';
      el.animate([{transform:move,transformOrigin:'center center'},{transform:'none',transformOrigin:'center center'}],
        {duration:250,easing:'cubic-bezier(0.22, 1, 0.36, 1)'});
    }
  },()=>update===zoomUpdate);
}
$('#view-zoom').oninput=e=>applyViewZoom(e.target.value);
$('#view-zoom-value').onchange=e=>applyViewZoom(e.target.value);
for(const [id,delta]of [['view-zoom-out',-10],['view-zoom-in',10]])$('#'+id).onclick=()=>applyViewZoom(Number($('#view-zoom').value)+delta);
$('#view-fit').onclick=()=>applyViewZoom(100);
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!e.defaultPrevented&&!dragState&&previewExpanded){e.preventDefault();setExpanded(false);}
  if(e.key==='Tab'&&previewExpanded){
    const controls=[...previewArea.querySelectorAll('button,select,input,a,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
    if(!controls.length)return;const first=controls[0],last=controls.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
function currentPreviewScroll(){return window.scrollY+previewCanvas.scrollTop;}
sizePreview();updateDiagram();
