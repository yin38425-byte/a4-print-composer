const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),PDFLib=require('pdf-lib');
const root=path.resolve(__dirname,'../dist');
(async()=>{
  const document=await PDFLib.PDFDocument.create();document.addPage().drawText('KEEP WORD CONTENT');document.addPage();
  const input=Array.from(await document.save());
  const filled=await PDFLib.PDFDocument.create();filled.addPage().drawText('FIRST PAGE');filled.addPage().drawText('KEEP FINAL PAGE');
  const filledInput=Array.from(await filled.save());
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
    const result=await page.evaluate(async data=>{
      const trimmed=await trimWordTrailingBlankPages(new Uint8Array(data).buffer);
      const count=(await PDFLib.PDFDocument.load(trimmed.bytes)).getPageCount();
      return {skipped:trimmed.skipped,count};
    },input);
    assert.deepEqual(result,{skipped:1,count:1});
    const preserved=await page.evaluate(async data=>{
      const result=await trimWordTrailingBlankPages(new Uint8Array(data).buffer);
      return {skipped:result.skipped,count:(await PDFLib.PDFDocument.load(result.bytes)).getPageCount()};
    },filledInput);
    assert.deepEqual(preserved,{skipped:0,count:2});
    if(process.argv[2]){
      const actual=Array.from(fs.readFileSync(process.argv[2]));
      const observed=await page.evaluate(async data=>{
        const input=new Uint8Array(data).buffer,original=(await PDFLib.PDFDocument.load(input)).getPageCount();
        const trimmed=await trimWordTrailingBlankPages(input);
        return {original,skipped:trimmed.skipped,remaining:(await PDFLib.PDFDocument.load(trimmed.bytes)).getPageCount()};
      },actual);
      console.log('REAL_WORD_PROBE '+JSON.stringify(observed));
    }
    console.log('PASS: converted Word PDF trailing white page is removed; visible final page remains.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
