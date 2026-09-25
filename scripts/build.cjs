const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'dist'),version=require(path.join(root,'package.json')).version;
function run(exe,args){const r=spawnSync(exe,args,{cwd:root,stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)throw Error('Build command failed: '+exe);}
if(process.platform!=='win32')throw Error('The Office helper requires Windows.');
const compiler=['Framework64','Framework'].map(f=>path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET',f,'v4.0.30319','csc.exe')).find(f=>fs.existsSync(f));
if(!compiler)throw Error('Install the .NET Framework 4.x compiler before building.');
run(process.execPath,[path.join(root,'src/build.cjs'),dest]);
const helperSource=path.join(dest,'LocalLayout.generated.cs');
const helperTemplate=fs.readFileSync(path.join(root,'src/LocalLayout.cs'),'utf8');
if(!helperTemplate.includes('__APP_VERSION__'))throw Error('Helper version placeholder missing');
fs.writeFileSync(helperSource,helperTemplate.replaceAll('__APP_VERSION__',version));
try{run(compiler,['/nologo','/target:winexe','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/out:'+path.join(dest,'启动文档拼版.exe'),helperSource]);}
finally{fs.rmSync(helperSource,{force:true});}
run(compiler,['/nologo','/target:exe','/r:Microsoft.CSharp.dll','/r:System.Core.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/out:'+path.join(dest,'OfficeConvert.exe'),path.join(root,'src/OfficeConvert.cs')]);
const guide=fs.readFileSync(path.join(root,'src/使用说明.txt'),'utf8');
fs.writeFileSync(path.join(dest,'使用说明.txt'),guide.replace(/^文档拼版[^\r\n]*\r?\n/,'文档拼版 v'+version+' · 本地使用说明\n'));
fs.cpSync(path.join(root,'licenses'),path.join(dest,'第三方许可说明'),{recursive:true});
fs.unlinkSync(path.join(dest,'core.cjs'));
console.log('Ready: '+dest);
