// Supply a local presentation for verification; never bundle it in a release.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require('playwright'),{PDFDocument}=require('pdf-lib');
const [url,input,out]=process.argv.slice(2);
if(!url||!input||!out)throw Error('Provide helper URL, local PPTX path and private output directory');
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const originalHash=hash(),errors=[],conversions=[];
 const oversize=path.join(out,'oversized-test.pdf'),broken=path.join(out,'broken-test.pptx');
 fs.closeSync(fs.openSync(oversize,'w'));fs.truncateSync(oversize,100*1024*1024+1);fs.writeFileSync(broken,'not a presentation');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1050}});page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/convert/'))conversions.push(r.status());});
  await page.goto(url);assert.equal(await page.locator('#upload-notice').isVisible(),false);
  await page.locator('#files').setInputFiles(broken);await page.locator('#build').click();
  await page.waitForFunction(()=>!busy,null,{timeout:110000});
  assert.match(await page.locator('#upload-notice-detail').innerText(),/broken-test.pptx/);
  assert.equal(await page.locator('#upload-notice').getAttribute('data-state'),'error');
  await page.locator('#clear').click();
  // Use the file input only to obtain a browser File, then exercise the drop handler.
  const chooser=await page.evaluateHandle(()=>{const el=document.createElement('input');el.type='file';el.hidden=true;document.body.append(el);return el;});
  await chooser.asElement().setInputFiles(input);
  const transfer=await chooser.evaluateHandle(el=>{const data=new DataTransfer();data.items.add(el.files[0]);el.remove();return data;});
  await page.locator('#dropzone').dispatchEvent('drop',{dataTransfer:transfer});await transfer.dispose();
  await page.waitForFunction(()=>!busy&&inputs.length===1);
  assert.equal(await page.locator('#upload-notice').isVisible(),false);
  await page.locator('.swiss-orientation button[data-value="landscape"]').click();await page.locator('.swiss-choices button[data-value="6"]').first().click();
  await page.locator('#build').click();
  await page.waitForFunction(()=>document.querySelector('#upload-notice-title').textContent.includes('正在转换 PPT'));
  await page.locator('.controls').screenshot({path:path.join(out,'conversion-status.png')});
  await page.waitForFunction(()=>!busy,null,{timeout:180000});
  assert.match(await page.locator('#upload-notice-title').innerText(),/已生成/);
  const rows=await page.evaluate(()=>adjustmentRows);assert(rows.length>0);assert.equal(await page.locator('#upload-notice').getAttribute('data-state'),'success');
  assert.equal(await page.locator('#issues li').count(),0);
  const originalOutput=await page.locator('#downloads a').first().getAttribute('href');
  const download=page.waitForEvent('download');await page.locator('#downloads a').first().click();const pdfPath=path.join(out,'large-ppt-output.pdf');await(await download).saveAs(pdfPath);
  const exported=await PDFDocument.load(fs.readFileSync(pdfPath));assert.equal(exported.getPageCount(),Math.ceil(rows.length/6));
  await page.locator('#files').setInputFiles(oversize);await page.waitForFunction(()=>!busy);
  assert.match(await page.locator('#upload-notice-detail').innerText(),/oversized-test.pdf.*100.01 MB.*100 MB/);
  await page.waitForTimeout(5500);assert.equal(await page.locator('#upload-notice').isVisible(),true);
  assert.equal(await page.locator('#downloads a').first().getAttribute('href'),originalOutput);
  assert.equal(await page.locator('.source-image').count(),rows.length);
  await page.locator('.controls').screenshot({path:path.join(out,'persistent-upload-error.png')});
  await page.locator('#upload-notice-close').click();assert.equal(await page.locator('#upload-notice').isVisible(),false);
  assert.equal(hash(),originalHash,'Original PPT must remain unchanged');assert.deepEqual(errors,[]);
  const report={passed:true,sourceBytes:fs.statSync(input).size,originalHash,originalUnchanged:true,dragImport:true,sourcePages:rows.length,outputPages:exported.getPageCount(),conversionProgress:true,persistentError:true,failedAdditionPreservesOutput:true,closeError:true,successClearsError:true,conversionFailureVisible:true,conversions,errors};
  fs.writeFileSync(path.join(out,'upload-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();fs.unlinkSync(oversize);fs.unlinkSync(broken);}
})().catch(e=>{console.error(e);process.exitCode=1});
