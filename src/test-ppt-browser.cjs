// Local synthetic fixtures only; real file picker, converter, preview and PDF downloads.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const [url,fixtures,out]=process.argv.slice(2);
if(!url||!fixtures||!out)throw Error('Provide local helper URL, PPT fixture directory, output directory');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[],conversions=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/convert/'))conversions.push({format:r.url().split('/').pop(),status:r.status()});});
  await page.goto(url);
  const accept=await page.locator('#files').getAttribute('accept');assert(accept.includes('.pptx')&&accept.includes('.ppt'));
  const files=[path.join(fixtures,'synthetic-video.pptx'),path.join(fixtures,'legacy.ppt'),path.join(__dirname,'qa/mixed-chinese.docx'),path.join(__dirname,'qa/中文表格.xlsx'),path.join(__dirname,'../qa/chinese-multipage.pdf'),path.join(__dirname,'../qa/chinese-image.png')];
  await page.locator('#files').setInputFiles(files);
  await page.locator('.swiss-choices button[data-value="8"]').first().click();await page.locator('.swiss-orientation button[data-value="landscape"]').click();
  await page.locator('#build').click();
  await page.waitForFunction(()=>!busy&&preparedForAdjustment&&!adjustmentPending(),null,{timeout:240000});
  const rows=await page.evaluate(()=>adjustmentRows);
  fs.writeFileSync(path.join(out,'initial-import.json'),JSON.stringify({rows,issues:await page.locator('#issues').innerText(),conversions},null,2));
  for(const file of files)assert(rows.some(r=>r.file===path.basename(file)),`Missing file ${file}`);
  assert.deepEqual(rows.filter(r=>r.file==='synthetic-video.pptx').map(r=>r.sourcePage),[1,2,3]);
  assert.equal(rows.filter(r=>r.file==='legacy.ppt').length,1);
  assert.equal(await page.locator('#issues li').count(),0);
  assert.deepEqual(conversions.map(r=>r.format),['pptx','ppt','docx','xlsx']);assert(conversions.every(r=>r.status===200));
  const before=await page.evaluate(()=>{const n=editorNodes.get(2),r=n.img.getBoundingClientRect();return {w:r.width,h:r.height};});
  await page.locator('.source-clip[data-source-id="2"]').click();
  const handle=page.locator('.selection-box:not([hidden]) .se');await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-24,box.y+box.height/2,{steps:6});await page.mouse.up();
  await page.waitForFunction(()=>!busy&&!dragState&&!adjustmentPending());
  const after=await page.evaluate(()=>{const n=editorNodes.get(2),r=n.img.getBoundingClientRect();return {w:r.width,h:r.height};});
  assert(Math.abs(after.w-before.w+24)<.6);assert(Math.abs(after.h-before.h)<.6);
  await page.locator('.source-clip[data-source-id="2"]').focus();await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForFunction(()=>!busy&&!adjustmentPending());
  const reordered=await page.evaluate(()=>adjustmentRows);assert.equal(reordered[0].sourcePage,2);assert.equal(reordered[0].file,'synthetic-video.pptx');
  const dl=page.waitForEvent('download');await page.locator('#downloads a').filter({hasText:'下载 A4 打印稿'}).click();await(await dl).saveAs(path.join(out,'mixed-ppt.pdf'));
  await page.locator('#manifest-details summary').click();const manifest=page.waitForEvent('download');await page.locator('#manifest-export a').filter({hasText:'下载处理清单'}).click();await(await manifest).saveAs(path.join(out,'mixed-ppt.json'));
  await page.screenshot({path:path.join(out,'mixed-ppt-preview.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const token=new URL(url).pathname.split('/')[1],rejected=[];
  for(const name of ['broken.pptx','macro.pptx','external.pptx']){
   const response=await fetch(url+'convert/pptx',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Local-Token':token},body:fs.readFileSync(path.join(fixtures,name))});
   const reason=await response.text();assert.equal(response.status,422);rejected.push({file:name,status:response.status,reason});
  }
  const report={passed:true,sourceFiles:files.map(f=>path.basename(f)),sourcePages:rows.length,conversions,hiddenSlideIncluded:true,independentWidthResize:true,reorderedVideoSlide:true,errors,rejected};
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
