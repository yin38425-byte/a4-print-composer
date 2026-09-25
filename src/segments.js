const segmentCounts=[2,4,6,8];
const segmentDirections={portrait:'纵向',landscape:'横向'};
function markSegmentPending(){
  $('#segment-message').textContent='';
  if(preparedForAdjustment)$('#build span').textContent='更新打印稿';
}
function appendSegmentRule(rule){
  const row=document.createElement('div');row.className='segment-rule';
  const lead=document.createElement('span');lead.className='segment-muted';lead.textContent='从第';
  const from=document.createElement('input');from.type='number';from.min='2';from.max=String(InvoicePrototype.MAX_OUTPUT_SHEETS);from.step='1';from.value=rule.fromSheet;
  from.className='segment-from';from.setAttribute('aria-label','从第几张 A4 起');from.oninput=markSegmentPending;
  const middle=document.createElement('span');middle.className='segment-muted';middle.textContent='张 A4 改为';
  const count=document.createElement('button');count.type='button';count.className='segment-count';
  count.dataset.value=String(rule.perPage);count.textContent=rule.perPage+' 页';
  count.setAttribute('aria-label','每张排入 '+rule.perPage+' 页，点击切换');
  count.title='点击切换：2、4、6、8 页';
  count.onclick=()=>{
    const next=segmentCounts[(segmentCounts.indexOf(Number(count.dataset.value))+1)%segmentCounts.length];
    count.dataset.value=String(next);count.textContent=next+' 页';
    count.setAttribute('aria-label','每张排入 '+next+' 页，点击切换');markSegmentPending();
  };
  const slash=document.createElement('span');slash.className='segment-slash';slash.textContent='/';
  const direction=document.createElement('button');direction.type='button';direction.className='segment-orientation';
  direction.dataset.value=rule.orientation||$('#orientation').value;
  const syncDirection=()=>{
    direction.textContent=segmentDirections[direction.dataset.value];
    direction.setAttribute('aria-label','纸张方向：'+direction.textContent+'，点击切换');
  };
  syncDirection();direction.title='点击切换纵向或横向';
  direction.onclick=()=>{
    direction.dataset.value=direction.dataset.value==='portrait'?'landscape':'portrait';
    syncDirection();markSegmentPending();
  };
  const remove=document.createElement('button');remove.type='button';remove.className='segment-remove';
  remove.textContent='×';remove.setAttribute('aria-label','删除从第 '+rule.fromSheet+' 张 A4 起的分段');
  remove.onclick=()=>{row.remove();markSegmentPending();syncSegmentBadge();};
  row.append(lead,from,middle,count,slash,direction,remove);
  $('#segment-rules').append(row);
  syncSegmentBadge();
}
function syncSegmentBadge(){
  const badge=$('#segment-badge'),n=$('#segment-rules').children.length;
  badge.textContent=String(n);badge.hidden=!n;
}
function renderSegmentForm(){
  $('#segment-rules').replaceChildren();
  draftSegments.forEach(appendSegmentRule);
  $('#segment-message').textContent='';
  syncSegmentBadge();syncSegmentControls();
}
function syncSegmentControls(){
  document.querySelectorAll('.segment-settings button,.segment-settings input').forEach(el=>el.disabled=busy||!!dragState);
  if(adjustmentRows.length)$('#preview-caption').textContent='A4 '+($('#orientation').value==='landscape'?'横向':'纵向')+' · '+(draftSegments.length?'分段排版':'每张纸 '+$('#layout').value+' 页内容');
}
function readSegmentForm(){
  return InvoicePrototype.normalizeSegments([...document.querySelectorAll('.segment-rule')].map(row=>({
    fromSheet:Number(row.querySelector('.segment-from').value),
    perPage:Number(row.querySelector('.segment-count').dataset.value),
    orientation:row.querySelector('.segment-orientation').dataset.value
  })));
}
$('#segments-toggle').onclick=()=>{
  const open=$('#segments-panel').hidden;
  $('#segments-panel').hidden=!open;
  $('#segments-toggle').setAttribute('aria-expanded',String(open));
  if(open&&!$('#segment-rules').children.length&&!draftSegments.length)
    appendSegmentRule({fromSheet:2,perPage:Number($('#layout').value),orientation:$('#orientation').value});
};
$('#segment-add').onclick=()=>{
  const used=[...document.querySelectorAll('.segment-from')].map(el=>Number(el.value));
  const next=Math.max(1,...used)+1;
  if(next>InvoicePrototype.MAX_OUTPUT_SHEETS){$('#segment-message').textContent='最多设置到第 '+InvoicePrototype.MAX_OUTPUT_SHEETS+' 张 A4。';return;}
  appendSegmentRule({fromSheet:next,perPage:Number($('#layout').value),orientation:$('#orientation').value});
  $('#segment-rules').lastElementChild.querySelector('input').focus();
  markSegmentPending();
};
async function generateWithSegmentForm(){
  if(busy||dragState||!inputs.length)return;
  let next;
  try{next=readSegmentForm();}
  catch(e){$('#segment-message').textContent=e.message;return;}
  if(preparedForAdjustment&&(JSON.stringify(next)!==JSON.stringify(draftSegments)||layoutSettingsPending())){
    let plan;
    try{plan=InvoicePrototype.pagePlan(draftOrder.length,Number($('#layout').value),effectiveSegments(draftOrder.length,next),$('#orientation').value);}
    catch(e){$('#segment-message').textContent=e.message;return;}
    const before=editorState();
    const changed=plan.findIndex((placement,i)=>['outputPage','slot','perPage','orientation'].some(key=>placement[key]!==adjustmentRows[i][key]));
    if(changed>=0)for(const id of draftOrder.slice(changed)){delete draftScales[id];delete draftOffsets[id];delete draftAngles[id];}
    draftSegments=next;applyOrder();renderSegmentForm();
    if(changedState(before,editorState())){undoHistory.push(before);redoHistory=[];}
    await generatePrint(true);
    return;
  }
  draftSegments=next;renderSegmentForm();
  await generatePrint(false);
}
$('#build').onclick=generateWithSegmentForm;
renderSegmentForm();
