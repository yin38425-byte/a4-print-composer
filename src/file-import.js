let duplicateDecision=null;
function askDuplicate(file,original){
  uploadNotice();
  $('#duplicate-message').textContent='「'+file.name+'」与已添加的「'+original.name+'」内容相同。';
  $('#duplicate-choice').hidden=false;
  return new Promise(resolve=>{duplicateDecision=resolve;});
}
function decideDuplicate(keep){
  if(!duplicateDecision)return;
  const resolve=duplicateDecision;duplicateDecision=null;$('#duplicate-choice').hidden=true;resolve(keep);
}
$('#duplicate-skip').onclick=()=>decideDuplicate(false);
$('#duplicate-keep').onclick=()=>decideDuplicate(true);
async function loadFiles(files){
  if(typeof location!=='undefined'&&location.protocol==='file:'){
    if(typeof showLocalLaunchNotice==='function')showLocalLaunchNotice();
    return;
  }
  if(busy)return;const batch=[...files];if(!batch.length)return;
  setBusy(true);uploadNotice('正在读取并检查文件','','progress');status('正在读取本地文件…');
  try{
    const oversized=batch.filter(f=>f.size>100*1024*1024);
    if(oversized.length)throw Error(oversized.map(f=>'「'+f.name+'」大小 '+(Math.ceil(f.size/1024/1024*100)/100)+' MB，超过单文件 100 MB 上限。').join('\n'));
    if(batch.length>100)throw Error('一次最多选择 100 个文件，请分批处理。');
    const next=[];
    for(const f of batch){
      let bytes;try{bytes=await f.arrayBuffer();}catch(e){throw Error('「'+f.name+'」读取失败，请确认文件已下载到本机且可以正常打开。');}
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
      next.push({name:f.name,bytes,digest,duplicateChecked:true});
    }
    const known=new Map(inputs.map(f=>[f.digest,f])),unique=[],duplicates=[];
    for(const f of next){if(known.has(f.digest))duplicates.push({file:f,original:known.get(f.digest)});else{unique.push(f);known.set(f.digest,f);}}
    if(inputs.length+unique.length>100)throw Error('添加后不能超过 100 个文件；原有文件已保留。');
    if(unique.length){inputs=inputs.concat(unique);show(true);}
    uploadNotice();
    let added=unique.length,skipped=0;
    const addedFiles=[...unique];
    for(const {file,original}of duplicates){
      if(await askDuplicate(file,original)){
        if(inputs.length>=100){skipped++;uploadNotice('未添加重复文件','已达到 100 个文件上限。');continue;}
        inputs.push(file);show(true);added++;addedFiles.push(file);
      }else skipped++;
    }
    status('已添加 '+added+' 个文件'+(skipped?'，跳过 '+skipped+' 个重复文件':'')+'。');
    if(typeof prefetchMixed==='function')prefetchMixed(addedFiles);
  }catch(err){uploadNotice('本次文件未添加',err.message+'\n原有文件和已生成的打印稿已保留。');status(err.message,'error');}
  finally{$('#files').value='';setBusy(false);}
}
