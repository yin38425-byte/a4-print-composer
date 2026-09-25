const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'build.cjs'),'utf8');
const start=source.indexOf('const conversionCache=new WeakMap();');
const end=source.indexOf('return out;\n}',start);
assert(start>=0&&end>start,'conversion bridge must be present');
const code=source.slice(start,end+'return out;\n}'.length);
let calls=0,fail=false;
const ctx=vm.createContext({WeakMap,Map,Uint8Array,Array,crypto:require('crypto').webcrypto,
 status(){},uploadNotice(){},trimWordTrailingBlankPages:async bytes=>({bytes,skipped:0}),
 fetch:async()=>{calls++;return fail?{ok:false,text:async()=> 'temporary failure'}:{ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};}});
vm.runInContext(code+'\nglobalThis.prepareMixed=prepareMixed;',ctx);
(async()=>{
 const file={name:'long.docx',bytes:new Uint8Array([8,9]).buffer,digest:'same',duplicateChecked:true};
 const first=await ctx.prepareMixed([file]),second=await ctx.prepareMixed([file]);
 assert.equal(calls,1,'same imported file must not run Office twice');
 assert.equal(first[0].bytes,second[0].bytes,'regeneration reuses the converted PDF');
 fail=true;const broken={name:'retry.docx',bytes:new Uint8Array([7]).buffer,digest:'retry'};
 assert.match((await ctx.prepareMixed([broken]))[0].error,/temporary failure/);
 fail=false;assert.equal((await ctx.prepareMixed([broken]))[0].formatName,'converted.pdf');
 assert.equal(calls,3,'failed conversions can be retried');
 console.log('PASS: Office conversion is reused within a session and failures are retryable');
})().catch(e=>{console.error(e);process.exitCode=1});
