const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const P=require('pdf-lib');
const {arrange,geometry,paperLayout}=require('./layout-core');
const dest=process.argv[2];fs.mkdirSync(dest,{recursive:true});
(async()=>{
 const doc=await P.PDFDocument.create(),font=await doc.embedFont(P.StandardFonts.Helvetica);
 for(let i=1;i<=9;i++){
  const p=doc.addPage([400,250]);p.drawRectangle({x:1,y:1,width:398,height:248,color:P.rgb(i/10,.25,1-i/10)});
  p.drawText('SYNTHETIC-PAGE-'+i,{x:24,y:120,size:24,font,color:P.rgb(1,1,1)});
 }
 const inputs=[{name:'nine-pages.pdf',bytes:await doc.save()}];fs.writeFileSync(path.join(dest,'nine-pages.pdf'),inputs[0].bytes);
 const order=[9,2,3,4,5,6,7,8,1];
 for(const orientation of ['portrait','landscape'])for(const perPage of [2,4,8]){
  const d=paperLayout(perPage,orientation);assert.equal(d.cols*d.rows,perPage);
  for(let slot=0;slot<perPage;slot++)for(const zoom of [25,100,200]){
   const g=geometry(perPage,slot,400,250,zoom,{orientation,offset:{x:9999,y:-9999}}),c=g.clip,b=g.content;
   assert(g.x>=24-1e-8&&g.y>=24-1e-8);assert(g.x+g.cw<=d.W-24+1e-8&&g.y+g.ch<=d.H-24+1e-8);
   assert(b.x<=c.x+c.width&&b.x+b.width>=c.x);assert(b.y<=c.y+c.height&&b.y+b.height>=c.y);
   if(b.width<=c.width){assert(b.x>=c.x-1e-8);assert(b.x+b.width<=c.x+c.width+1e-8);}
   else{assert(b.x<=c.x+1e-8);assert(b.x+b.width>=c.x+c.width-1e-8);}
  }
  const options={orientation,order,scales:{1:60},offsets:{1:{x:20,y:-12}},includePreview:true};
  const r=await arrange(P,inputs,perPage,options),out=await P.PDFDocument.load(r.bytes);
  assert.equal(out.getPageCount(),Math.ceil(9/perPage));out.getPages().forEach(p=>assert.deepEqual(p.getSize(),{width:d.W,height:d.H}));
  assert.deepEqual(r.manifest.map(r=>r.sequence),order);assert.deepEqual(r.manifest.map(r=>r.sourcePage),order);
  assert.equal(r.manifest[8].zoomPercent,60);assert.deepEqual(r.manifest[8].offset,{x:20,y:-12});
  assert.equal(r.manifest[8].outputPage,Math.ceil(9/perPage));assert.equal((await P.PDFDocument.load(r.previewBytes)).getPageCount(),9);
  fs.writeFileSync(path.join(dest,`${orientation}-${perPage}.pdf`),r.bytes);fs.writeFileSync(path.join(dest,`${orientation}-${perPage}.json`),JSON.stringify(r.manifest,null,2));
 }
 await assert.rejects(()=>arrange(P,inputs,8,{order:[1,1]}),/顺序无效/);
 await assert.rejects(()=>arrange(P,inputs,8,{offsets:{1:{x:NaN,y:0}}}),/位置无效/);
 console.log('PASS: 2/4/8-up in both A4 orientations, bounded movement/panning, cross-sheet swap, source identity, transforms and PDF sizes');
})().catch(e=>{console.error(e);process.exitCode=1});
