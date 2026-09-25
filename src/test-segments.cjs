const assert=require('assert/strict'),P=require('pdf-lib'),core=require('./layout-core');
(async()=>{
 assert.deepEqual(core.pagePlan(18,4,[{fromSheet:3,perPage:6},{fromSheet:4,perPage:2}]).reduce((a,r)=>{a[r.outputPage]=(a[r.outputPage]||0)+1;return a;},{}),{1:4,2:4,3:6,4:2,5:2});
 for(const orientation of ['portrait','landscape']){const d=core.paperLayout(6,orientation);assert.equal(d.cols,orientation==='portrait'?2:3);assert.equal(d.rows,orientation==='portrait'?3:2);}
 for(const rules of [[{fromSheet:1,perPage:6}],[{fromSheet:2.5,perPage:6}],[{fromSheet:2,perPage:3}],[{fromSheet:2,perPage:6},{fromSheet:2,perPage:4}],[{fromSheet:99,perPage:6}]])assert.throws(()=>core.pagePlan(18,4,rules));
 const doc=await P.PDFDocument.create();for(let n=1;n<=18;n++)doc.addPage([640,360]).drawText('SYNTHETIC PAGE '+String(n).padStart(2,'0'),{x:35,y:180,size:28});
 const input=[{name:'lesson.pdf',bytes:await doc.save()}],order=Array.from({length:18},(_,i)=>i+1);[order[0],order[1]]=[order[1],order[0]];
 for(const orientation of ['portrait','landscape'])for(const rules of [[],[{fromSheet:3,perPage:6}],[{fromSheet:3,perPage:6},{fromSheet:4,perPage:2}]]){
  const r=await core.arrange(P,input,4,{orientation,segments:rules,order});assert.equal(r.manifest.length,18);assert.deepEqual(r.manifest.map(x=>x.sourcePage),order);
  const expected=core.pagePlan(18,4,rules);assert.deepEqual(r.manifest.map(({outputPage,slot,perPage})=>({outputPage,slot,perPage})),expected);
  const pdf=await P.PDFDocument.load(r.bytes);assert.equal(pdf.getPageCount(),expected.at(-1).outputPage);
 }
 assert.equal(core.MAX_SOURCE_PAGES,300);
 assert.equal(core.pagePlan(300,2).at(-1).outputPage,150);
 assert.throws(()=>core.pagePlan(301,2),/来源页数无效/);
 assert.equal(core.normalizeSegments([{fromSheet:120,perPage:4}])[0].fromSheet,120);
 const longDoc=await P.PDFDocument.create();
 for(let n=1;n<=132;n++)longDoc.addPage([595,842]).drawText('LONG DOCUMENT '+n,{x:35,y:780,size:14});
 const longInput=[{name:'132-page.pdf',bytes:await longDoc.save()}];
 const longResult=await core.arrange(P,longInput,8,{orientation:'portrait',includePreview:true});
 assert.equal(longResult.manifest.length,132);
 assert.equal((await P.PDFDocument.load(longResult.previewBytes)).getPageCount(),132);
 assert.equal((await P.PDFDocument.load(longResult.bytes)).getPageCount(),17);
 const mixed=await core.arrange(P,input,4,{orientation:'portrait',segments:[{fromSheet:2,perPage:6,orientation:'landscape'},{fromSheet:3,perPage:4}]});
 const mixedDoc=await P.PDFDocument.load(mixed.bytes);assert.deepEqual(mixedDoc.getPages().map(p=>p.getWidth()>p.getHeight()),[false,true,false,false]);
 assert.equal(mixed.manifest.find(r=>r.outputPage===2).orientation,'landscape');assert.equal(mixed.manifest.find(r=>r.outputPage===3).orientation,'portrait');
 const retained=order.filter(id=>id!==4&&id!==12);
 const reduced=await core.arrange(P,input,4,{order:retained,orientation:'landscape'});
 assert.deepEqual(reduced.manifest.map(r=>r.sequence),retained);
 assert.deepEqual(reduced.manifest.map(r=>r.sourcePage),retained);
 assert.equal((await P.PDFDocument.load(reduced.bytes)).getPageCount(),4);
 assert.equal((await core.arrange(P,input,4,{order:[]})).bytes,null);
 await assert.rejects(()=>core.arrange(P,input,4,{order:[1,1]}),/页顺序无效/);
 assert.throws(()=>core.normalizeSegments([{fromSheet:2,perPage:4,orientation:'bad'}]));
 console.log('PASS: segmented page counts, mixed PDF paper orientations, inherited global direction, invalid rules');
})().catch(e=>{console.error(e);process.exitCode=1});
