// Real mouse/keyboard and download regression. All files are synthetic and written to the supplied test directory.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),P=require('pdf-lib');
const [url,out]=process.argv.slice(2);if(!url||!out)throw Error('Provide local helper URL and test output directory');
fs.mkdirSync(out,{recursive:true});
const near=(a,b,label)=>assert(Math.abs(a-b)<.35,`${label}: ${a} != ${b}`);
(async()=>{
 const doc=await P.PDFDocument.create(),font=await doc.embedFont(P.StandardFonts.Helvetica);
 for(let i=1;i<=5;i++){const p=doc.addPage([400,200]);p.drawRectangle({x:0,y:0,width:400,height:200,color:P.rgb(.08*i,.3,.75)});p.drawText('SYNTHETIC PAGE '+i,{x:35,y:100,size:23,font,color:P.rgb(1,1,1)});}
 const fixture=path.join(out,'synthetic-five-pages.pdf');fs.writeFileSync(fixture,await doc.save());
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:1}),errors=[],samples=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.locator('#files').setInputFiles([fixture,path.join(__dirname,'../qa/chinese-image.png')]);
  await page.locator('.swiss-choices button[data-value="4"]').first().click();await page.locator('.swiss-orientation button[data-value="landscape"]').click();await page.locator('#build').click();
  const idle=()=>page.waitForFunction(()=>!busy&&!dragState&&preparedForAdjustment&&!adjustmentPending(),null,{timeout:30000});await idle();
  const select=async id=>{await page.locator(`.source-clip[data-source-id="${id}"]`).click();};
  const box=id=>page.evaluate(id=>{const n=editorNodes.get(id),r=n.img.getBoundingClientRect(),p=n.paper.getBoundingClientRect();return {x:r.x-p.x,y:r.y-p.y,width:r.width,height:r.height}},id);
  const checkAnchor=(before,after,sx,sy)=>{near(after.x+(sx<0?after.width:0),before.x+(sx<0?before.width:0),'fixed x');near(after.y+(sy<0?after.height:0),before.y+(sy<0?before.height:0),'fixed y');};
  async function drag(id,corner,dx,dy,shift=false,cancel=false){
   await select(id);const h=page.locator(`.selection-box:not([hidden]) .${corner}`);await h.scrollIntoViewIfNeeded();
   const r=await h.boundingBox(),before=await box(id);if(shift)await page.keyboard.down('Shift');
   await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:8});
   if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(shift)await page.keyboard.up('Shift');await idle();
   return {before,after:await box(id)};
  }
  async function save(name){
   const expected=await page.evaluate(()=>Array.from(editorNodes.values()).map(n=>{
    const b=n.img.getBoundingClientRect(),p=n.paper.getBoundingClientRect(),W=841.89,H=595.28;
    return {sequence:n.row.sequence,outputPage:n.row.outputPage,slot:n.row.slot,x:(b.x-p.x)/p.width*W,y:(p.y+p.height-b.y-b.height)/p.height*H,width:b.width/p.width*W,height:b.height/p.height*H};
   }).sort((a,b)=>a.outputPage-b.outputPage||a.slot-b.slot));
   const download=page.waitForEvent('download');await page.locator('#downloads a.primary').click();await(await download).saveAs(path.join(out,name+'.pdf'));
   samples.push({name,expected});
  }
  let r=await drag(1,'se',-75,0);near(r.after.width,r.before.width-75,'horizontal width');near(r.after.height,r.before.height,'horizontal height');near(r.after.y,r.before.y,'horizontal y');checkAnchor(r.before,r.after,1,1);await save('width-only');
  await page.locator('#direct-undo').click();await idle();near((await box(1)).width,r.before.width,'undo width');
  r=await drag(1,'ne',0,35);near(r.after.width,r.before.width,'vertical width');near(r.after.height,r.before.height-35,'vertical height');near(r.after.x,r.before.x,'vertical x');checkAnchor(r.before,r.after,1,-1);await save('height-only');
  await page.locator('#direct-undo').click();await idle();
  r=await drag(1,'nw',65,25);near(r.after.width,r.before.width-65,'diagonal width');near(r.after.height,r.before.height-25,'diagonal height');checkAnchor(r.before,r.after,-1,-1);const stretched=r.after;await save('free-diagonal');
  r=await drag(1,'se',-45,-5,true);assert(Math.abs(r.after.width/r.after.height-r.before.width/r.before.height)<.003,'Shift keeps current aspect');checkAnchor(r.before,r.after,1,1);await save('shift-locked');
  await page.locator('#direct-undo').click();await idle();near((await box(1)).width,stretched.width,'undo both width');near((await box(1)).height,stretched.height,'undo both height');
  r=await drag(1,'sw',25,-15,false,true);near(r.after.width,r.before.width,'Escape width');near(r.after.height,r.before.height,'Escape height');near(r.after.x,r.before.x,'Escape x');near(r.after.y,r.before.y,'Escape y');
  await select(1);const keyBefore=await box(1);await page.locator('.selection-box:not([hidden]) .ne').focus();await page.keyboard.press('ArrowLeft');await idle();const keyAfter=await box(1);assert(keyAfter.width<keyBefore.width);near(keyAfter.height,keyBefore.height,'keyboard independent height');checkAnchor(keyBefore,keyAfter,1,-1);await save('keyboard-width');
  await page.locator('#direct-undo').click();await idle();
  // Mouse swap must carry both independent dimensions to the destination slot.
  const first=page.locator('.source-clip[data-source-id="1"]'),second=page.locator('.source-clip[data-source-id="2"]');await first.scrollIntoViewIfNeeded();
  const a=await first.boundingBox(),b=await second.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width*.08,b.y+b.height/2,{steps:10});
  assert.equal(await page.locator('.page-slot.swap-target').count(),0,'edge overlap only moves');
  await page.mouse.up();await idle();
  assert.deepEqual(await page.evaluate(()=>draftOrder.slice(0,2)),[1,2],'edge overlap keeps page order');
  await page.locator('#direct-undo').click();await idle();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});
  assert.equal(await page.locator('.page-slot.swap-target').count(),1,'center drop is ready immediately');
  await page.mouse.up();await idle();
  assert.deepEqual(await page.evaluate(()=>draftOrder.slice(0,2)),[2,1]);near((await box(1)).width,stretched.width,'swap carries width');near((await box(1)).height,stretched.height,'swap carries height');
  r=await drag(6,'sw',40,0);near(r.after.width,r.before.width-40,'PNG independent width');near(r.after.height,r.before.height,'PNG fixed height');checkAnchor(r.before,r.after,-1,1);await save('free-resize-final');
  await page.locator('.editable-paper').first().screenshot({path:path.join(out,'free-resize-preview.png')});
  assert.deepEqual(errors,[]);assert(!/NaN|undefined|null%|\[object Object\]/.test(await page.locator('#manifest').innerText()));
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,tests:['horizontal','vertical','free diagonal','Shift ratio after stretch','undo','Escape','keyboard width','swap preserves axes','PNG resize'],samples,errors},null,2));
  console.log('PASS: real Chrome mouse/keyboard resizing and '+samples.length+' PDF downloads; axis independence, anchors, Shift, undo, Escape, swap and PNG');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
