const assert=require('node:assert/strict');
const path=require('node:path');
const lib=require('pdf-lib');
const core=require('../src/layout-core.js');
(async()=>{
  const normal=await lib.PDFDocument.create();normal.addPage().drawText('KEEP THIS CONTENT');
  const blank=await lib.PDFDocument.create();blank.addPage();
  const result=await core.arrange(lib,[{name:'normal.pdf',bytes:await normal.save()},{name:'blank.pdf',bytes:await blank.save()}],2);
  assert.equal(result.manifest.length,1);assert.equal(result.manifest[0].file,'normal.pdf');
  assert.equal(result.rejected.length,1);assert.match(result.rejected[0].reason,/空白页/);
  assert.equal((await lib.PDFDocument.load(result.bytes)).getPageCount(),1);
  const onlyBlank=await core.arrange(lib,[{name:'blank.pdf',bytes:await blank.save()}],2);
  assert.equal(onlyBlank.bytes,null);assert.equal(onlyBlank.rejected.length,1);
  console.log('PASS: mixed blank PDF is isolated; normal output remains readable; blank-only input explains rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
