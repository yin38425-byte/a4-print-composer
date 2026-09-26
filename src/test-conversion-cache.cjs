const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'build.cjs'),'utf8');
const start=source.indexOf('const conversionCache=new WeakMap();');
const match=/return out;\s*\}/.exec(source.slice(start));
assert(start>=0&&match,'conversion bridge must be present');
const code=source.slice(start,start+match.index+match[0].length);
function context(fetch){
 const ctx=vm.createContext({WeakMap,Map,Set,Uint8Array,Array,Promise,crypto:require('crypto').webcrypto,
  status(){},uploadNotice(){},trimWordTrailingBlankPages:async bytes=>({bytes,skipped:0}),fetch});
 vm.runInContext(code+'\nglobalThis.prepareMixed=prepareMixed;globalThis.prefetchMixed=prefetchMixed;',ctx);
 return ctx;
}
const file=(name,digest,value)=>({name,bytes:new Uint8Array([value]).buffer,digest,duplicateChecked:true});
(async()=>{
 let calls=0,fail=false;
 const ctx=context(async()=>{calls++;return fail?{ok:false,text:async()=> 'temporary failure'}:
  {ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};});
 const word=file('long.docx','same',8);
 const first=await ctx.prepareMixed([word]),second=await ctx.prepareMixed([word]);
 assert.equal(calls,1,'same imported file must not run Office twice');
 assert.equal(first[0].bytes,second[0].bytes,'regeneration reuses the converted PDF');
 const reimported=file('renamed.docx','same',8);
 assert.equal((await ctx.prepareMixed([reimported]))[0].formatName,'converted.pdf');
 assert.equal(calls,1,'re-importing identical bytes in the same tab reuses conversion');
 fail=true;const broken=file('retry.docx','retry',7);
 assert.match((await ctx.prepareMixed([broken]))[0].error,/temporary failure/);
 fail=false;assert.equal((await ctx.prepareMixed([broken]))[0].formatName,'converted.pdf');
 assert.equal(calls,3,'failed conversions can be retried');

 let resolvePrefetch,prefetchCalls=0;
 const prefetched=context(()=>{prefetchCalls++;return new Promise(resolve=>{resolvePrefetch=resolve;});});
 const ahead=file('ahead.docx','ahead',9);
 prefetched.prefetchMixed([ahead]);
 assert.equal(prefetchCalls,1,'Office conversion starts after import, before Generate');
 const awaited=prefetched.prepareMixed([ahead]);
 assert.equal(prefetchCalls,1,'Generate awaits the already running conversion');
 resolvePrefetch({ok:true,arrayBuffer:async()=>new Uint8Array([9]).buffer});
 assert.equal((await awaited)[0].formatName,'converted.pdf');

 const requests=[];
 const parallel=context((url,options)=>new Promise(resolve=>{
  requests.push({url,value:new Uint8Array(options.body)[0],resolve});
 }));
 const mixed=[
  file('first.docx','word-1',11),file('second.docx','word-2',12),
  file('sheet.xlsx','excel-1',21),file('slides.pptx','ppt-1',31),
  file('picture.png','image-1',41)
 ];
 const pending=parallel.prepareMixed(mixed);
 assert.deepEqual(requests.map(r=>r.url),['./convert/docx','./convert/xlsx','./convert/pptx'],
  'different Office families start together, second Word waits');
 const answer=request=>request.resolve({ok:true,arrayBuffer:async()=>new Uint8Array([request.value]).buffer});
 answer(requests[0]);
 await new Promise(setImmediate);
 assert.equal(requests.length,4,'second Word starts after first Word finishes');
 assert.equal(requests[3].url,'./convert/docx');
 answer(requests[1]);answer(requests[2]);answer(requests[3]);
 const result=await pending;
 assert.deepEqual(result.map(r=>r.name),mixed.map(r=>r.name),'source order is preserved');
 assert.deepEqual(result.slice(0,4).map(r=>new Uint8Array(r.bytes)[0]),[11,12,21,31]);
 assert.equal(result[4],mixed[4],'non-Office files pass through untouched');
 console.log('PASS: conversion cache, retry, mixed-family concurrency and stable order');
})().catch(e=>{console.error(e);process.exitCode=1});
