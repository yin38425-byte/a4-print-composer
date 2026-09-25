const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const {geometry,paperLayout,pagePlan}=require('./layout-core');
const fields=new Map(),stats={converted:0,previewed:0,exports:0,fail:false},nodes=new Map();
const classes=()=>{const set=new Set();return {add:c=>set.add(c),remove:(...cs)=>cs.forEach(c=>set.delete(c)),contains:c=>set.has(c),toggle:(c,on)=>on?set.add(c):set.delete(c)}};
const el=()=>({value:'2',style:{},hidden:false,disabled:false,children:[],classList:classes(),replaceChildren(){this.children=[]},append(...cs){this.children.push(...cs)},get lastElementChild(){return this.children.at(-1)},removeAttribute(){},setAttribute(){},remove(){},focus(){}});
const $=s=>{if(!fields.has(s))fields.set(s,el());return fields.get(s)};$('#orientation').value='portrait';
const rows=[1,2,3].map(id=>({sequence:id,position:id,sourcePage:id,outputPage:Math.ceil(id/2),slot:(id-1)%2+1,width:500,height:200,file:'a.docx'}));
const rebuild=rs=>{for(const row of rs)nodes.set(row.sequence,{paper:{getBoundingClientRect:()=>({left:row.position*200,right:row.position*200+190,top:0,bottom:390,width:595.28})},border:{getBoundingClientRect:()=>({left:row.position*200,right:row.position*200+190,top:0,bottom:390,width:190,height:390}),classList:classes()},clip:Object.assign(el(),{getBoundingClientRect:()=>({left:row.position*200,right:row.position*200+190,top:0,bottom:390,width:190,height:390})}),img:{src:'blob:synthetic'},row})};rebuild(rows);
const documentListeners=new Map();
const ctx=vm.createContext({$,console,Blob,structuredClone,PDFLib:{},editorNodes:nodes,paintDirectSource:()=>{},rebuildDirectPapers:rebuild,
 DirectGeometry:require('./direct-geometry'),window:{scrollY:0,innerWidth:1000,innerHeight:800},document:{createElement:el,body:el(),addEventListener:(n,f)=>documentListeners.set(n,f),removeEventListener:n=>documentListeners.delete(n)},URL:{createObjectURL:()=>`blob:${Math.random()}`,revokeObjectURL:()=>{}},
 prepareMixed:async f=>{stats.converted++;return f},renderDirectPreview:async()=>{stats.previewed++},disposeDirectPreview:()=>{},fitPreviewPage:()=>{},updateDiagram:()=>{},sizePreview:()=>{},uploadNotice:()=>{},uploadIssues:()=>{},
 InvoicePrototype:{geometry,paperLayout,pagePlan,arrange:async(lib,files,layout,opt)=>{
  stats.exports++;if(stats.fail)throw Error('export failed');const order=opt.order??[1,2,3];
  return {bytes:new Uint8Array([1]),previewBytes:new Uint8Array([2]),manifest:order.map((id,i)=>({...rows[id-1],position:i+1,slot:i%layout+1,outputPage:Math.floor(i/layout)+1,zoomPercent:opt.scales[id]??100})),rejected:[]};}},status:()=>{},renderManifest:()=>{}});
vm.runInContext(`let inputs=[{name:'a.docx'}],busy=false,urls=[];function setBusy(v){busy=v;syncAdjustmentControls()}function clearOutput(){resetAdjustment()}`+['direct-ui.js','direct-drag.js'].map(f=>fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n'),ctx);
const run=c=>vm.runInContext(c,ctx),plain=c=>JSON.parse(JSON.stringify(run(c)));
const idle=async()=>{for(let i=0;i<30&&run('busy');i++)await new Promise(setImmediate);assert.equal(run('busy'),false)};
const listeners=new Map(),handle={setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
const event=(type,x,y)=>({type,clientX:x,clientY:y,pointerId:1,button:0,preventDefault(){},stopPropagation(){}});ctx.handle=handle;
async function drag(kind,from,to,end='pointerup'){
 ctx.row=nodes.get(1).row;ctx.event=event('pointerdown',...from);run(`startEditorDrag(event,row,handle,'${kind}',1,1)`);
 if(kind==='move'&&to[0]>400)listeners.get('pointermove')(event('pointermove',340,330));
 listeners.get('pointermove')(event('pointermove',...to));assert.equal($('#downloads').style.visibility,'hidden');assert.equal($('#downloads').hidden,false);
 if(kind==='move'&&to[0]===650){
  assert.equal(run('dragState.target'),3);assert(nodes.get(3).border.classList.contains('swap-target'));
  assert.match($('#direct-note').textContent,/松手后与目标页交换/);
}
if(kind==='move'&&to[0]===620)assert.equal(run('dragState.target'),null,'edge overlap must not arm swap');
 if(end==='Escape')documentListeners.get('keydown')({key:'Escape',preventDefault(){}});else listeners.get(end)(event(end,...to));await idle();
 assert.equal(documentListeners.size,0);assert.equal(run('dragGhost'),null);
}
(async()=>{
 await run('generatePrint(false)');assert.equal(stats.converted,1);assert.equal(stats.previewed,1);
 await run("changeLayer(1,'forward')");assert.deepEqual(plain('draftLayerOrder'),[2,1,3]);
 await $('#direct-undo').onclick();assert.deepEqual(plain('draftLayerOrder'),[1,2,3]);
 const fit=geometry(2,0,500,200).fit;
 const original=plain('rowGeometry(adjustmentRows[0]).content');
 await drag('resize',[300,300],[300-250*fit,300-100*fit]);assert(Math.abs(run('draftScales[1].x')-50)<1e-8&&Math.abs(run('draftScales[1].y')-50)<1e-8);
 const resized=plain('rowGeometry(adjustmentRows[0]).content'),resizeOffset=plain('draftOffsets[1]');
 assert(Math.abs(resized.x-original.x)<1e-8&&Math.abs(resized.y+resized.height-original.y-original.height)<1e-8,'top-left stays fixed when dragging bottom-right');
 await drag('move',[300,300],[325,315]);assert.deepEqual(plain('draftOffsets[1]'),{x:resizeOffset.x+25,y:resizeOffset.y-15});
 const adjusted=plain('editorState()');
 await drag('move',[300,300],[350,350],'pointercancel');assert.deepEqual(plain('editorState()'),adjusted);
 assert.equal(run('swapTargetAt(650,195,1,10)'),null,'a tiny nudge on an enlarged page must not swap');
 await drag('move',[300,300],[620,300]);assert.deepEqual(plain('draftOrder'),[1,2,3],'edge overlap must not swap');
 assert.deepEqual(plain('editorState()'),adjusted);
 ctx.row=nodes.get(1).row;ctx.event=event('pointerdown',300,300);run("startDirectMove(event,row,handle)");
 const altMove=event('pointermove',650,300);altMove.altKey=true;listeners.get('pointermove')(altMove);
 assert.equal(run('dragState.target'),null,'Alt movement never arms swap');
 listeners.get('pointercancel')(event('pointercancel',650,300));
 await drag('move',[300,300],[650,300]);assert.deepEqual(plain('draftOrder'),[3,2,1]);assert.equal(run('adjustmentRows[2].sequence'),1);
 assert.deepEqual(plain('draftScales[1]'),adjusted.scales[1]);assert.deepEqual(plain('draftOffsets[1]'),adjusted.offsets[1]);assert.equal(stats.converted,1);assert.equal(stats.previewed,1);
 await $('#direct-undo').onclick();assert.deepEqual(plain('draftOrder'),[1,2,3]);assert.deepEqual(plain('editorState()'),adjusted);
 const before=stats.exports;
 ctx.row=nodes.get(1).row;ctx.event=event('pointerdown',300,300);run("startDirectMove(event,row,handle)");
 run('window.scrollY=45');listeners.get('pointerup')(event('pointerup',300,300));await idle();run('window.scrollY=0');
 assert.deepEqual(plain('editorState()'),adjusted);assert.equal(stats.exports,before,'scroll without pointer movement must not edit');
 for(const [to,end]of [[[300,300],'pointerup'],[[302,301],'pointerup'],[[595,500],'pointerup'],[[650,300],'Escape'],[[650,300],'lostpointercapture']]){
  await drag('move',[300,300],to,end);assert.deepEqual(plain('editorState()'),adjusted);assert.equal(stats.exports,before,'click, jitter and cancelled drops must not export');
 }
 stats.fail=true;await drag('move',[300,300],[310,300]);assert.equal($('#direct-retry').hidden,false);assert.equal($('#downloads').style.visibility,'hidden');
 stats.fail=false;await $('#direct-retry').onclick();assert.equal($('#downloads').hidden,false);assert.equal(stats.converted,1);
 await $('#direct-reset-all').onclick();assert.deepEqual(plain('editorState()'),{scales:{},offsets:{},angles:{},order:[1,2,3],layers:[1,2,3],segments:[]});
 const convertedBeforeLayout=stats.converted,previewedBeforeLayout=stats.previewed;
 $('#layout').value='4';$('#layout').onchange({});
 assert.equal(run('preparedForAdjustment!==null'),true,'changing pages per sheet retains the prepared document');
 assert.equal($('#adjustment').hidden,false,'changing layout keeps the preview visible');
 assert.equal($('#build span').textContent,'更新打印稿');
 assert.equal($('#downloads').style.visibility,'hidden','old download is hidden until the layout is updated');
 assert.equal($('#paper-editor').inert,true,'stale preview cannot be edited before updating');
 run('applyOrder()');await $('#build').onclick();
 assert.equal(stats.converted,convertedBeforeLayout,'layout update reuses converted pages');
 assert.equal(stats.previewed,previewedBeforeLayout,'layout update reuses page previews');
 assert.equal(run('appliedLayout'),4);assert.equal($('#downloads').style.visibility,'');assert.equal($('#paper-editor').inert,false);
 $('#orientation').value='landscape';$('#orientation').onchange({});
 assert.equal($('#adjustment').hidden,false,'changing direction keeps the preview visible');
 assert.equal($('#build span').textContent,'更新打印稿');
 run('applyOrder()');await $('#build').onclick();
 assert.equal(run('appliedOrientation'),'landscape');
 await run('deleteDirectSource(2)');assert.deepEqual(plain('draftOrder'),[1,3]);assert.equal(run('adjustmentRows.length'),2);assert.equal($('#downloads').hidden,false);
 await $('#direct-undo').onclick();assert.deepEqual(plain('draftOrder'),[1,2,3]);
 await $('#direct-redo').onclick();assert.deepEqual(plain('draftOrder'),[1,3]);
 await $('#direct-reset-all').onclick();assert.deepEqual(plain('draftOrder'),[1,2,3]);
 assert.equal(run('effectiveSegments(2,[{fromSheet:2,perPage:4}]).length'),0,'unreachable segment stays configured but does not block page deletion');
 assert.equal(run('effectiveSegments(3,[{fromSheet:2,perPage:4}]).length'),1);
 for(const id of [1,2,3])await run(`deleteDirectSource(${id})`);
 assert.equal(run('draftOrder.length'),0);assert.equal(run('adjustmentRows.length'),0);assert.equal($('#downloads').hidden,true);
 await $('#direct-undo').onclick();assert.deepEqual(plain('draftOrder'),[3]);assert.equal($('#downloads').hidden,false);
 run('clearOutput()');assert.equal(run('preparedForAdjustment'),null);assert.equal($('#adjustment').hidden,true);
 console.log('PASS: center drop swaps immediately; edge overlap and tiny nudge only move; target feedback; transforms preserved; free movement; resize; undo; outside/Escape/capture cancellation; jitter threshold; failed-export retry and reset');
})().catch(e=>{console.error(e);process.exitCode=1});
