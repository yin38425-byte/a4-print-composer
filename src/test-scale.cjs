const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const PDFLib=require('pdf-lib');
const {arrange}=require('./layout-core.js');
const dest=process.argv[2];fs.mkdirSync(dest,{recursive:true});
(async()=>{
 const doc=await PDFLib.PDFDocument.create();
 for(const color of [PDFLib.rgb(1,0,0),PDFLib.rgb(0,0,1)]){
  const p=doc.addPage([500,350]);p.drawRectangle({x:0,y:0,width:500,height:350,color});
 }
 const inputs=[{name:'two-pages.docx',formatName:'converted.pdf',bytes:await doc.save()}];
 for(const perPage of [2,4])for(const percent of [25,50,100,150,200]){
  const result=await arrange(PDFLib,inputs,perPage,{scales:{1:percent}});
  assert.deepEqual(result.manifest.map(r=>r.zoomPercent),[percent,100]);
  assert.equal(result.rejected.length,0);assert.equal(result.manifest[1].file,'two-pages.docx');
  fs.writeFileSync(path.join(dest,`scale-${perPage}-${percent}.pdf`),result.bytes);
 }
 for(const invalid of [0,24,201,NaN,Infinity,'50'])await assert.rejects(()=>arrange(PDFLib,inputs,2,{scales:{1:invalid}}),/25%/);
 const defaults=await arrange(PDFLib,inputs);assert.deepEqual(defaults.manifest.map(r=>r.zoomPercent),[100,100]);
 console.log('PASS: per-page scale, 2/4-up, limits, source names, default 100%; exported PDFs ready for raster check');
})().catch(e=>{console.error(e);process.exitCode=1});
