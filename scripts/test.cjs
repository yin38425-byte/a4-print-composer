const path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
for(const args of [['src/test-conversion-cache.cjs'],['src/test-file-launch.cjs'],['src/test-segments.cjs'],['src/test-direct.cjs'],['src/test-free-state.cjs'],['src/test-append.cjs','dist/index.html'],['qa/check-blank.cjs']]){
 const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
}
