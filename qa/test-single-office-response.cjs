// Real Office smoke test for the local helper. Run manually on Windows with PowerPoint installed.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {spawn}=require('child_process'),{PDFDocument}=require('pdf-lib');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),exe=path.join(root,'dist','启动文档拼版.exe');
const inputPath=path.join(root,'src','qa','ppt','synthetic-video.pptx'),input=fs.readFileSync(inputPath);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=()=>Number(process.hrtime.bigint()/1000000n);

(async()=>{
 const helper=spawn(exe,['--headless'],{windowsHide:true,stdio:'ignore'});
 const session=path.join(process.env.LOCALAPPDATA,'LocalLayout',`session-${helper.pid}.txt`);
 try{
  let url;
  for(let i=0;i<60;i++){
   if(fs.existsSync(session)){url=fs.readFileSync(session,'utf8').trim();break;}
   if(helper.exitCode!==null)throw Error(`Local helper exited: ${helper.exitCode}`);
   await sleep(250);
  }
  assert(url,'Local helper did not start');
  const token=new URL(url).pathname.split('/')[1];
  async function convert(){
   const start=now();
   const response=await fetch(url+'convert/pptx',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Local-Token':token},body:input});
   const bytes=Buffer.from(await response.arrayBuffer());
   assert.equal(response.status,200,bytes.toString('utf8'));
   const pdf=await PDFDocument.load(bytes);
   assert.equal(pdf.getPageCount(),3);
   return {ms:now()-start,bytes:bytes.length};
  }
  const rejected=await fetch(url+'convert/pptx',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Local-Token':token},body:Buffer.from('broken')});
  assert.equal(rejected.status,422);
  const first=await convert();
  // The browser's next PPT conversion must queue until the first Office process exits.
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
   const page=await browser.newPage(),errors=[],start=now();
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);
   await page.locator('#files').setInputFiles(inputPath);
   await page.locator('#build').click();
   await page.waitForFunction(()=>!busy&&preparedForAdjustment&&!adjustmentPending(),null,{timeout:120000});
   const rows=await page.evaluate(()=>adjustmentRows);
   assert.deepEqual(rows.map(r=>r.sourcePage),[1,2,3]);
   const download=page.waitForEvent('download');
   await page.locator('#downloads a').first().click();
   const output=path.join(os.tmpdir(),`layout-smoke-${process.pid}.pdf`);
   try{
    await(await download).saveAs(output);
    assert.equal((await PDFDocument.load(fs.readFileSync(output))).getPageCount(),2);
   }finally{fs.rmSync(output,{force:true});}
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({passed:true,rejected:rejected.status,first,browserMs:now()-start,sourcePages:rows.length,errors}));
  }finally{await browser.close();}
 }finally{
  helper.kill();
  for(let i=0;i<40&&fs.existsSync(session);i++)await sleep(100);
  if(fs.existsSync(session))fs.rmSync(session,{force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
