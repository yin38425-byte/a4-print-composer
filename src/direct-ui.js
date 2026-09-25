let preparedForAdjustment=null,adjustmentRows=[],sourceRows=[],draftScales={},draftOffsets={},draftAngles={},draftOrder=[],draftLayerOrder=[],appliedState=null,selectedSource=null,dragState=null,undoHistory=[];
let draftSegments=[];
let redoHistory=[];
let appliedLayout=null,appliedOrientation=null,preparedInputCount=0;
function scaleValue(map,sequence){return map[sequence]??100;}
function scaleAxes(value){return typeof value==='number'?{x:value,y:value}:value;}
function defaultScale(value){const s=scaleAxes(value);return s.x===100&&s.y===100;}
function scaleText(value){const s=scaleAxes(value),format=n=>Number(n.toFixed(1));return s.x===s.y?format(s.x)+'%':'宽 '+format(s.x)+'% · 高 '+format(s.y)+'%';}
function editorState(){return {scales:structuredClone(Object.fromEntries(Object.entries(draftScales).filter(([,v])=>!defaultScale(v)))),offsets:structuredClone(Object.fromEntries(Object.entries(draftOffsets).filter(([,p])=>p.x||p.y))),angles:structuredClone(Object.fromEntries(Object.entries(draftAngles).filter(([,v])=>v))),order:[...draftOrder],layers:[...draftLayerOrder],segments:structuredClone(draftSegments)};}
function restoreEditorState(s){draftScales=structuredClone(s.scales);draftOffsets=structuredClone(s.offsets);draftAngles=structuredClone(s.angles||{});draftOrder=[...s.order];draftLayerOrder=[...(s.layers||s.order)];draftSegments=structuredClone(s.segments||[]);if(typeof renderSegmentForm==='function')renderSegmentForm();}
function rowGeometry(row,pct=scaleValue(draftScales,row.sequence),offset=draftOffsets[row.sequence]){
  return InvoicePrototype.geometry(row.perPage||Number($('#layout').value),row.slot-1,row.width,row.height,pct,{orientation:row.orientation||$('#orientation').value,offset,clampOffset:false});
}
function changedState(a,b){return JSON.stringify(a)!==JSON.stringify(b);}
function resetAdjustment(){
  preparedForAdjustment=null;adjustmentRows=[];sourceRows=[];draftScales={};draftOffsets={};draftAngles={};draftOrder=[];draftLayerOrder=[];appliedState=null;selectedSource=null;dragState=null;undoHistory=[];
  redoHistory=[];appliedLayout=null;appliedOrientation=null;preparedInputCount=0;disposeDirectPreview();$('#adjustment').hidden=true;
}
function adjustmentPending(){return !!appliedState&&changedState(editorState(),appliedState);}
function fileListPending(){return !!preparedForAdjustment&&preparedInputCount!==inputs.length;}
function layoutSettingsPending(){return !!preparedForAdjustment&&(fileListPending()||appliedLayout!==Number($('#layout').value)||appliedOrientation!==$('#orientation').value);}
function sourceAdjusted(id){const p=draftOffsets[id];return !defaultScale(scaleValue(draftScales,id))||!!(p&&(p.x||p.y))||!!draftAngles[id];}
function syncAdjustmentControls(){
  if(typeof syncSegmentControls==='function')syncSegmentControls();
  const pending=adjustmentPending(),settingsPending=layoutSettingsPending(),row=adjustmentRows.find(r=>r.sequence===selectedSource);
  $('#build span').textContent=busy?'正在处理…':settingsPending?'更新打印稿':'生成打印稿';
  $('#paper-editor').inert=settingsPending;
  $('#downloads').hidden=!$('#downloads').children.length;
  $('#downloads').style.visibility=busy||pending||settingsPending||!!dragState?'hidden':'';
  $('#direct-undo').disabled=busy||settingsPending||!!dragState||!undoHistory.length;
  $('#direct-redo').disabled=busy||settingsPending||!!dragState||!redoHistory.length;
  $('#direct-reset').disabled=busy||settingsPending||!!dragState||!row||!sourceAdjusted(selectedSource);
  $('#rotation-reset').disabled=busy||settingsPending||!!dragState||!row||!draftAngles[selectedSource];
  $('#direct-reset-all').disabled=busy||settingsPending||!!dragState||!(adjustmentRows.some(r=>sourceAdjusted(r.sequence))||draftOrder.length!==sourceRows.length||draftOrder.some((id,i)=>id!==sourceRows[i].sequence)||draftLayerOrder.some((id,i)=>id!==sourceRows[i].sequence));
  $('#direct-selected').textContent=row?row.file+' · 原第 '+row.sourcePage+' 页 · '+scaleText(scaleValue(draftScales,selectedSource))+' · '+(draftAngles[selectedSource]||0)+'°':'点击纸张上的内容';
  $('#direct-note').textContent=dragState?(dragState.kind==='resize'?'横拖改宽，竖拖改高；按住 Shift 保持当前比例，按 Esc 取消。':'拖动页面主体至目标页中央，松手交换；按住 Alt 只移动；按 Esc 取消。'):busy?'正在更新打印稿…':pending?'更新未完成，请点击“重试更新”。':'拖角自由调整宽高，对角固定；按住 Shift 等比例。拖页面可移动，拖到目标页中央后松手交换。';
  $('#direct-retry').hidden=!pending||busy||!!dragState;
  editorNodes.forEach((node,sequence)=>paintDirectSource(sequence));
}
function selectDirectSource(sequence){if(busy||dragState)return;selectedSource=sequence;syncAdjustmentControls();}
function effectiveSegments(count,rules=draftSegments){
  if(count===sourceRows.length)return rules;
  const active=[];
  for(const rule of rules){
    const plan=InvoicePrototype.pagePlan(count,Number($('#layout').value),active,$('#orientation').value);
    if(rule.fromSheet>(plan.at(-1)?.outputPage||0))break;
    active.push(rule);
  }
  return active;
}
function raiseSourceToFront(sequence){
  const index=draftLayerOrder.indexOf(sequence);if(index<0)return;
  draftLayerOrder.splice(index,1);draftLayerOrder.push(sequence);
}
function sheetLayerIds(sequence){
  const row=adjustmentRows.find(r=>r.sequence===sequence);
  return row?draftLayerOrder.filter(id=>adjustmentRows.some(r=>r.sequence===id&&r.outputPage===row.outputPage)):[];
}
function changeLayer(sequence,action){
  if(busy||dragState||layoutSettingsPending())return;
  const siblings=sheetLayerIds(sequence),position=siblings.indexOf(sequence);
  if(position<0)return;
  const target=action==='forward'?siblings[position+1]:action==='backward'?siblings[position-1]:null;
  if((action==='forward'||action==='backward')&&!target)return;
  if(action==='front'&&position===siblings.length-1||action==='back'&&position===0)return;
  const before=editorState(),at=draftLayerOrder.indexOf(sequence);
  if(target){const other=draftLayerOrder.indexOf(target);[draftLayerOrder[at],draftLayerOrder[other]]=[draftLayerOrder[other],draftLayerOrder[at]];}
  else {draftLayerOrder.splice(at,1);const anchor=draftLayerOrder.indexOf(action==='front'?siblings.at(-1):siblings[0]);draftLayerOrder.splice(anchor+(action==='front'?1:0),0,sequence);}
  editorNodes.forEach((_,id)=>paintDirectSource(id));return commitEditorChange(before);
}
function commitEditorChange(before,raise=false){
  if(raise&&selectedSource!==null)raiseSourceToFront(selectedSource);
  if(!changedState(before,editorState())){syncAdjustmentControls();return;}
  undoHistory.push(before);redoHistory=[];return generatePrint(true);
}
function keyboardResize(event,row,sx,sy){
  if(busy||dragState||!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','+','-'].includes(event.key))return;
  event.preventDefault();selectedSource=row.sequence;const before=editorState(),g=rowGeometry(row),start=scaleValue(draftScales,row.sequence),s=scaleAxes(start);
  const w=row.width*g.fit,h=row.height*g.fit,uniform=event.key==='+'||event.key==='-';
  const direction=event.key==='-'?-1:1;
  const dx=uniform?sx*w*s.x/100*.01*direction:event.key==='ArrowRight'?w/100:event.key==='ArrowLeft'?-w/100:0;
  const dy=uniform?sy*h*s.y/100*.01*direction:event.key==='ArrowDown'?h/100:event.key==='ArrowUp'?-h/100:0;
  draftScales[row.sequence]=DirectGeometry.resizeAxes(start,dx,dy,sx,sy,w,h,!!event.shiftKey||uniform);
  draftOffsets[row.sequence]=DirectGeometry.rotatedCornerOffset(g,start,draftScales[row.sequence],sx,sy,draftAngles[row.sequence]||0);paintDirectSource(row.sequence);commitEditorChange(before,true);
}
function keyboardMove(event,row){
  if(busy||dragState||!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(event.key))return;
  event.preventDefault();selectedSource=row.sequence;const before=editorState(),g=rowGeometry(row),step=event.shiftKey?10:1;
  draftOffsets[row.sequence]=DirectGeometry.moveOffset(g,event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0,event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0);
  paintDirectSource(row.sequence);commitEditorChange(before,true);
}
function applyOrder(){
  const byId=new Map(sourceRows.map(r=>[r.sequence,r])),plan=InvoicePrototype.pagePlan(draftOrder.length,Number($('#layout').value),effectiveSegments(draftOrder.length),$('#orientation').value);
  adjustmentRows=draftOrder.map((id,i)=>({...byId.get(id),position:i+1,...plan[i]}));
  rebuildDirectPapers(adjustmentRows);
}
async function deleteDirectSource(sequence){
  if(busy||dragState||layoutSettingsPending())return;
  const index=draftOrder.indexOf(sequence);if(index<0)return;
  const before=editorState();draftOrder.splice(index,1);
  selectedSource=draftOrder[Math.min(index,draftOrder.length-1)]??null;
  applyOrder();
  if(selectedSource!==null)editorNodes.get(selectedSource)?.clip.focus({preventScroll:true});
  const result=await commitEditorChange(before);
  if(!draftOrder.length)$('#direct-undo').focus({preventScroll:true});
  return result;
}
function swapSources(a,b){
  if(a===b)return;const i=draftOrder.indexOf(a),j=draftOrder.indexOf(b);
  if(i<0||j<0)return;[draftOrder[i],draftOrder[j]]=[draftOrder[j],draftOrder[i]];applyOrder();
}
function keyboardSwap(event,row){
  if(busy||dragState||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const i=draftOrder.indexOf(row.sequence),j=i+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
  if(j<0||j>=draftOrder.length)return;const before=editorState();selectedSource=row.sequence;swapSources(row.sequence,draftOrder[j]);commitEditorChange(before);
}
$('#direct-undo').onclick=()=>{if(busy||dragState||!undoHistory.length)return;redoHistory.push(editorState());restoreEditorState(undoHistory.pop());applyOrder();return generatePrint(true);};
$('#direct-redo').onclick=()=>{if(busy||dragState||!redoHistory.length)return;undoHistory.push(editorState());restoreEditorState(redoHistory.pop());applyOrder();return generatePrint(true);};
$('#direct-reset').onclick=()=>{if(busy||dragState||selectedSource===null)return;const before=editorState();delete draftScales[selectedSource];delete draftOffsets[selectedSource];delete draftAngles[selectedSource];return commitEditorChange(before);};
$('#rotation-reset').onclick=()=>{if(busy||dragState||selectedSource===null)return;const before=editorState();delete draftAngles[selectedSource];return commitEditorChange(before);};
$('#direct-reset-all').onclick=()=>{if(busy||dragState)return;const before=editorState();draftScales={};draftOffsets={};draftAngles={};draftOrder=sourceRows.map(r=>r.sequence);draftLayerOrder=[...draftOrder];applyOrder();return commitEditorChange(before);};
$('#direct-retry').onclick=()=>generatePrint(true);
$('#build').onclick=()=>generatePrint(!!preparedForAdjustment);
const onLayoutChange=$('#layout').onchange;
$('#layout').onchange=e=>{
  if(preparedForAdjustment){
    updateDiagram();
    $('#build span').textContent=layoutSettingsPending()?'更新打印稿':'生成打印稿';
    syncAdjustmentControls();
  }else onLayoutChange(e);
  sizePreview();
};
$('#orientation').onchange=$('#layout').onchange;

function renderPrintDownloads(r,prepared){
  urls.forEach(URL.revokeObjectURL);urls=[];$('#downloads').replaceChildren();$('#issues').replaceChildren();$('#manifest').replaceChildren();
  r.rejected.forEach(x=>{const li=document.createElement('li');li.textContent=x.file+'：'+x.reason;$('#issues').append(li);});
  const pages=Math.max(...r.manifest.map(x=>x.outputPage));
  const pdf=URL.createObjectURL(new Blob([r.bytes],{type:'application/pdf'}));urls.push(pdf);
  const blankPagesSkipped=prepared.filter(x=>x.skippedTrailingBlankPages).map(x=>({file:x.name,pages:x.skippedTrailingBlankPages}));
  const json=URL.createObjectURL(new Blob([JSON.stringify({paper:'A4',orientation:$('#orientation').value,perPage:Number($('#layout').value),segments:draftSegments,files:r.manifest,skipped:r.rejected,blankPagesSkipped},null,2)],{type:'application/json'}));urls.push(json);
  for(const [url,name,label,style]of [[pdf,'文档拼版_'+pages+'页.pdf','下载','primary'],[json,'文档拼版_处理清单.json','下载处理清单','secondary-link']]){
    const a=document.createElement('a');a.href=url;a.download=name;a.textContent=label;a.className=style;$('#downloads').append(a);
  }
  renderManifest(r.manifest);return pages;
}
async function generatePrint(adjusting){
  if(busy||dragState||(!adjusting&&!inputs.length)||(adjusting&&!preparedForAdjustment))return;
  const appending=adjusting&&fileListPending();
  const fitAfterGeneration=!adjusting||layoutSettingsPending();
  if(!adjusting)clearOutput();setBusy(true);status(adjusting?'正在更新打印稿…':'正在本地排版…');
  if(!adjusting)uploadNotice('正在处理文档，请稍候','','progress');
  try{
    const prepared=appending?[...preparedForAdjustment,...await prepareMixed(inputs.slice(preparedInputCount))]:
      adjusting?preparedForAdjustment:await prepareMixed(inputs);
    if(!adjusting||appending)uploadNotice('正在生成打印稿，请稍候','','progress');
    if(adjusting&&!draftOrder.length&&!appending){
      urls.forEach(URL.revokeObjectURL);urls=[];$('#downloads').replaceChildren();$('#issues').replaceChildren();$('#manifest').replaceChildren();
      adjustmentRows=[];rebuildDirectPapers([]);appliedState=editorState();
      appliedLayout=Number($('#layout').value);appliedOrientation=$('#orientation').value;
      status('已完成','success');return;
    }
    const r=await InvoicePrototype.arrange(PDFLib,prepared,Number($('#layout').value),{
      scales:draftScales,offsets:draftOffsets,angles:draftAngles,
      order:adjusting?draftOrder:undefined,
      segments:appending?draftSegments:adjusting?effectiveSegments(draftOrder.length):draftSegments,
      orientation:$('#orientation').value,layerOrder:adjusting?draftLayerOrder:undefined,
      includePreview:!adjusting||appending,appendRemaining:appending?sourceRows.length+1:false,clampOffsets:false
    });
    if(!r.bytes){
      r.rejected.forEach(x=>{const li=document.createElement('li');li.textContent=x.file+'：'+x.reason;$('#issues').append(li);});
      uploadIssues(r.rejected);status('没有可排版文件，请检查提示','error');return;
    }
    if(appending){
      const oldSourceCount=sourceRows.length;
      const addedRows=r.manifest.filter(row=>row.sequence>oldSourceCount);
      const addedIds=addedRows.map(row=>row.sequence);
      await renderDirectPreview(r.previewBytes,r.manifest,()=>{
        sourceRows=[...sourceRows,...addedRows];
        draftOrder=r.manifest.map(row=>row.sequence);
        draftLayerOrder=[...draftLayerOrder,...addedIds];
        adjustmentRows=r.manifest;
        for(const history of [undoHistory,redoHistory])
          for(const state of history){state.order.push(...addedIds);state.layers.push(...addedIds);}
      });
    }else if(!adjusting){
      draftLayerOrder=r.manifest.map(row=>row.sequence);
      await renderDirectPreview(r.previewBytes,r.manifest);
    }
    renderPrintDownloads(r,prepared);
    preparedForAdjustment=prepared;preparedInputCount=inputs.length;
    adjustmentRows=r.manifest;draftOrder=r.manifest.map(row=>row.sequence);
    if(!adjusting)sourceRows=[...r.manifest];
    appliedState=editorState();
    appliedLayout=Number($('#layout').value);appliedOrientation=$('#orientation').value;
    $('#adjustment').hidden=false;$('#preview').hidden=true;$('#empty').hidden=true;
    if(fitAfterGeneration)fitPreviewPage();
    if(!adjusting||appending)uploadIssues(r.rejected);
    status('已完成','success');
  }catch(e){
    if(!adjusting){disposeDirectPreview();$('#empty').hidden=false;uploadNotice('未完成文档处理',e.message);}
    status((adjusting?'更新失败，当前调整已保留：':'未生成可编辑预览：')+e.message,'error');
  }finally{setBusy(false);if(preparedForAdjustment)$('#build span').textContent=layoutSettingsPending()?'更新打印稿':'生成打印稿';}
}