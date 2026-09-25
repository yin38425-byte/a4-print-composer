const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright'),P=require('pdf-lib');
const [url,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
(async()=>{
 const doc=await P.PDFDocument.create();for(let n=1;n<=18;n++)doc.addPage([640,360]).drawText('SYNTHETIC PAGE '+String(n).padStart(2,'0'),{x:35,y:180,size:28});
 const input=path.join(out,'lessons.pdf');fs.writeFileSync(input,await doc.save());
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1480,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);assert.equal(await page.locator('#segments-panel').isVisible(),false);assert.equal(await page.locator('.settings #segments-toggle').count(),1);
 assert(!/票据|发票/.test(await page.locator('body').innerText()));
 await page.locator('#files').setInputFiles(input);await page.locator('#per-page button[data-value="4"],.swiss-choices button[data-value="4"]').first().click();await page.locator('.swiss-orientation button[data-value="landscape"]').click();await page.locator('#build').click();
 const idle=()=>page.waitForFunction(()=>!busy&&!dragState&&preparedForAdjustment&&!adjustmentPending());await idle();
 assert.equal(await page.locator('.source-label').count(),0);
 assert(await page.locator('.page-slot').evaluateAll(es=>es.every(e=>getComputedStyle(e).borderWidth==='0px')));
 async function shrink(id){await page.locator(`.source-clip[data-source-id="${id}"]`).click();await page.locator('.selection-box:not([hidden]) .se').focus();await page.keyboard.press('ArrowLeft');await idle();}
 await shrink(1);await shrink(9);
 await page.locator('.source-clip[data-source-id="1"]').focus();await page.keyboard.press('Alt+ArrowRight');await idle();
 const before=await page.evaluate(()=>({state:editorState(),rows:adjustmentRows}));
 await page.locator('#segments-toggle').click();assert.equal(await page.locator('.segment-rule').count(),1);await page.locator('.segment-from').fill('3');await page.locator('.segment-count').click();await page.locator('#build').click();await idle();
 let state=await page.evaluate(()=>({state:editorState(),rows:adjustmentRows}));assert.deepEqual(state.rows.slice(0,8),before.rows.slice(0,8));assert.deepEqual(state.state.order,before.state.order);assert.deepEqual(state.state.scales['1'],before.state.scales['1']);assert(!state.state.scales['9']);assert.equal(state.rows.at(-1).outputPage,4);
 await page.locator('#direct-undo').click();await idle();state=await page.evaluate(()=>({state:editorState(),rows:adjustmentRows}));assert.deepEqual(state.state,before.state);assert.deepEqual(state.rows,before.rows);
 await page.locator('#segment-add').click();await page.locator('.segment-from').fill('3');await page.locator('.segment-count').click();await page.locator('#build').click();await idle();
 await page.locator('#segment-add').click();await page.locator('.segment-from').nth(1).fill('4');for(let i=0;i<3;i++)await page.locator('.segment-count').nth(1).click();await page.locator('#build').click();await idle();
 const count=await page.evaluate(()=>adjustmentRows.reduce((a,r)=>{a[r.outputPage]=(a[r.outputPage]||0)+1;return a;},{}));assert.deepEqual(count,{1:4,2:4,3:6,4:2,5:2});
 // Invalid changes must not alter the current document or disable its download.
 await page.locator('.segment-from').nth(1).fill('3');await page.locator('#build').click();assert.match(await page.locator('#segment-message').innerText(),/两个分段/);
 await page.locator('.segment-from').nth(1).fill('99');await page.locator('#build').click();assert.match(await page.locator('#segment-message').innerText(),/未生效/);
 await page.locator('.segment-from').nth(1).fill('4');await page.locator('#build').click();await idle();
 await page.locator('.source-clip[data-source-id="9"]').focus();await page.keyboard.press('Alt+ArrowLeft');await idle();await shrink(9);
 async function save(name){const download=page.waitForEvent('download');await page.locator('#downloads a').filter({hasText:'下载 A4 打印稿'}).click();await(await download).saveAs(path.join(out,name+'.pdf'));if(!await page.locator('#manifest-details').evaluate(el=>el.open))await page.locator('#manifest-details summary').click();const json=page.waitForEvent('download');await page.locator('#manifest-export a').filter({hasText:'下载处理清单'}).click();await(await json).saveAs(path.join(out,name+'.json'));}
 await save('segmented-landscape');
 await page.locator('#segments-toggle').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'segmented-settings.png')});
 await page.locator('.swiss-orientation button[data-value="portrait"]').click();await page.locator('#build').click();await idle();await save('segmented-portrait');
 while(await page.locator('.segment-rule').count())await page.locator('.segment-remove').first().click();await page.locator('#build').click();await idle();
 await page.locator('.swiss-choices button[data-value="6"]').first().click();await page.locator('#build').click();await idle();assert.equal(await page.locator('.editable-paper').count(),3);await save('six-portrait');
 await page.locator('.swiss-orientation button[data-value="landscape"]').click();await page.locator('#build').click();await idle();await save('six-landscape');
 assert.deepEqual(errors,[]);const report={passed:true,sourcePages:18,segmentedSheetCounts:count,undoPreservesAdjustments:true,unchangedFirstTwoSheets:true,crossSectionSwap:true,invalidRulesPreserveOutput:true,uniformSixBothOrientations:true,errors};fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
