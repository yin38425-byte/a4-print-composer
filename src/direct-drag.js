// Corner handles resize; dragging the page into another page's center swaps on release.
const SWAP_CENTER_INSET=.2,SWAP_MIN_TRAVEL=.35;
function startDirectResize(e,row,handle,sx,sy){startEditorDrag(e,row,handle,'resize',sx,sy);}
function startDirectMove(e,row,handle){startEditorDrag(e,row,handle,'move');}
function startDirectRotate(event,row,handle){
  if(busy||dragState||event.button!==0)return;event.preventDefault();event.stopPropagation();selectedSource=row.sequence;
  const g=rowGeometry(row),paper=editorNodes.get(row.sequence).paper.getBoundingClientRect(),factor=paper.width/g.W;
  const center={x:paper.left+(g.content.x+g.content.width/2)*factor,y:paper.top+(g.H-g.content.y-g.content.height/2)*factor};
  const direction=e=>Math.atan2(e.clientY-center.y,e.clientX-center.x)*180/Math.PI;
  dragState={kind:'rotate',sequence:row.sequence,before:editorState(),pointerId:event.pointerId,start:direction(event),angle:draftAngles[row.sequence]||0,snapped:false};
  handle.setPointerCapture(event.pointerId);syncAdjustmentControls();
  const move=e=>{
    if(!dragState||e.pointerId!==dragState.pointerId)return;
    const raw=dragState.angle+direction(e)-dragState.start;
    const result=e.shiftKey?{angle:Math.round(raw/15)*15,snapped:false}:DirectGeometry.snapAngle(raw,dragState.snapped);
    draftAngles[row.sequence]=((result.angle%360)+360)%360;dragState.snapped=result.snapped;
    paintDirectSource(row.sequence);$('#direct-selected').textContent=row.file+' · '+draftAngles[row.sequence]+'°';
  };
  const finish=e=>{
    if(!dragState||e.pointerId!==dragState.pointerId)return;
    const before=dragState.before;
    if(e.type==='pointerup')move(e);
    dragState=null;for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(type,type==='pointermove'?move:finish);
    document.removeEventListener('keydown',escape);if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
    if(e.type!=='pointerup')restoreEditorState(before);
    else if(draftAngles[row.sequence]===0)delete draftAngles[row.sequence];
    paintDirectSource(row.sequence);if(e.type==='pointerup')commitEditorChange(before,true);else syncAdjustmentControls();
  };
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();finish({type:'pointercancel',pointerId:event.pointerId});}};
  handle.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,finish);document.addEventListener('keydown',escape);
}
function pointInPaper(x,y,node){const r=node.paper.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
function swapTargetAt(x,y,source,travel){
  for(const [id,node]of editorNodes){
    if(id===source)continue;
    const r=node.border.getBoundingClientRect(),padX=r.width*SWAP_CENTER_INSET,padY=r.height*SWAP_CENTER_INSET;
    if(travel>=Math.min(r.width,r.height)*SWAP_MIN_TRAVEL&&
      x>=r.left+padX&&x<=r.right-padX&&y>=r.top+padY&&y<=r.bottom-padY)return id;
  }
  return null;
}
let dragGhost=null;
function clearDragFeedback(){
  if(dragGhost){dragGhost.remove();dragGhost=null;}
  editorNodes.forEach(node=>{node.border.classList.remove('swap-target');node.clip.classList.remove('drag-lifted');});
}
function paintDragFeedback(event,row){
  editorNodes.forEach(node=>node.border.classList.remove('swap-target'));
  const d=dragState,node=editorNodes.get(row.sequence),outside=d.kind==='move'&&d.moved&&d.dropMode!=='position';
  node.clip.classList.toggle('drag-lifted',outside);
  if(d.target!==null)editorNodes.get(d.target).border.classList.add('swap-target');
  if(outside){
    if(!dragGhost){
      dragGhost=document.createElement('div');dragGhost.className='page-drag-ghost';dragGhost.setAttribute('aria-hidden','true');
      const img=document.createElement('img');img.src=node.img.src;img.alt='';const caption=document.createElement('span');
      dragGhost.append(img,caption);document.body.append(dragGhost);
    }
    dragGhost.hidden=false;dragGhost.lastElementChild.textContent=d.target!==null?'松手交换':'拖到目标页中央';
    dragGhost.style.left=Math.max(0,Math.min(event.clientX+16,window.innerWidth-160))+'px';
    dragGhost.style.top=Math.max(0,Math.min(event.clientY+16,window.innerHeight-190))+'px';
  }else if(dragGhost)dragGhost.hidden=true;
  $('#direct-note').textContent=d.kind==='resize'?(event.shiftKey?'对角固定，保持当前宽高比例，松手保存。':'横拖改宽，竖拖改高；按住 Shift 等比例，松手保存。'):d.target!==null?'松手后与目标页交换。':d.dropMode==='cancel'?'此处没有页面，松手会回到原位。':'拖动页面可移动；拖到目标页中央后松手交换，按住 Alt 可越格移动。';
}
function startEditorDrag(event,row,handle,kind,sx=0,sy=0){
  if(busy||dragState||event.button!==0)return;event.preventDefault();event.stopPropagation();
  selectedSource=row.sequence;
  const node=editorNodes.get(row.sequence),g=rowGeometry(row),base=rowGeometry(row,100),factor=node.paper.getBoundingClientRect().width/g.W;
  node.clip.focus({preventScroll:true});
  const sourceRect=node.clip.getBoundingClientRect();
  dragState={kind,sequence:row.sequence,start:scaleValue(draftScales,row.sequence),offset:g.offset,x:event.clientX,y:event.clientY,
    scrollY:typeof currentPreviewScroll==='function'?currentPreviewScroll():window.scrollY,width:row.width*base.fit*factor,height:row.height*base.fit*factor,
    geometry:g,before:editorState(),pointerId:event.pointerId,target:null,dropMode:'position',moved:false,
    center:{x:sourceRect.left+sourceRect.width/2,y:sourceRect.top+sourceRect.height/2}};
  handle.setPointerCapture(event.pointerId);syncAdjustmentControls();
  const move=e=>{
    if(!dragState||e.pointerId!==dragState.pointerId)return;
    const dx=e.clientX-dragState.x,dy=e.clientY-dragState.y+(typeof currentPreviewScroll==='function'?currentPreviewScroll():window.scrollY)-dragState.scrollY;
    if(Math.hypot(dx,e.clientY-dragState.y)>=5)dragState.moved=true;
    if(!dragState.moved)return;
    if(kind==='resize'){
      const local=DirectGeometry.localResizeDelta(dx,dy,draftAngles[row.sequence]||0);
      draftScales[row.sequence]=DirectGeometry.resizeAxes(dragState.start,local.x,local.y,sx,sy,dragState.width,dragState.height,!!e.shiftKey);
      draftOffsets[row.sequence]=DirectGeometry.rotatedCornerOffset(dragState.geometry,dragState.start,draftScales[row.sequence],sx,sy,draftAngles[row.sequence]||0);
    }else{
      const travel=Math.hypot(dx,e.clientY-dragState.y),center=dragState.center;
      dragState.target=e.altKey?null:swapTargetAt(center.x+dx,center.y+e.clientY-dragState.y,row.sequence,travel);
      const onPaper=pointInPaper(e.clientX,e.clientY,node);
      dragState.dropMode=dragState.target!==null?'swap':onPaper?'position':'cancel';
      if(onPaper)draftOffsets[row.sequence]=DirectGeometry.moveOffset(dragState.geometry,dx/factor,-dy/factor);
    }
    paintDirectSource(row.sequence);paintDragFeedback(e,row);
    $('#direct-selected').textContent=row.file+' · 原第 '+row.sourcePage+' 页 · '+scaleText(scaleValue(draftScales,row.sequence));
  };
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();finish({type:'pointercancel',pointerId:event.pointerId});}};
  const finish=e=>{
    if(!dragState||e.pointerId!==dragState.pointerId)return;
    if(e.type==='pointerup')move(e);
    const completed=dragState;dragState=null;clearDragFeedback();
    for(const name of ['pointermove','pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(name,name==='pointermove'?move:finish);
    document.removeEventListener('keydown',escape);
    if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
    if(e.type!=='pointerup'||!completed.moved||completed.dropMode==='cancel'){restoreEditorState(completed.before);syncAdjustmentControls();return;}
    if(completed.dropMode==='swap'){
      restoreEditorState(completed.before);swapSources(row.sequence,completed.target);
    }
    commitEditorChange(completed.before,true);
  };
  handle.addEventListener('pointermove',move);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,finish);
  document.addEventListener('keydown',escape);
}
