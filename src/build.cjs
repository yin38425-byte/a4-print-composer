const fs=require('fs'),path=require('path');
const source=path.dirname(__dirname),dest=process.argv[2],version=require(path.join(source,'package.json')).version;
if(!dest)throw Error('Provide build directory');
fs.mkdirSync(dest,{recursive:true});
const pdfLibRoot=path.dirname(require.resolve('pdf-lib/package.json')),pdfjsRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
let html=fs.readFileSync(path.join(source,'workbench-shell.html'),'utf8');
const core=fs.readFileSync(path.join(__dirname,'layout-core.js'),'utf8');
html=html.replace('/*PDFLIB*/',()=>fs.readFileSync(path.join(pdfLibRoot,'dist/pdf-lib.min.js'),'utf8')).replace('/*CORE*/',()=>core);
html=html.replaceAll('票据排版','多格式排版').replaceAll('本地预览版','多格式混排 v'+version);
html=html.replaceAll('文件在当前浏览器处理','文件仅在本机处理');
html=html.replace(/async function loadFiles\(files\)\{[^\r\n]+/,'');
html=html.replace("inputs.length?inputs.length+' 个文件':'尚未选择'","'已添加 '+inputs.length+' 个文件'");
html=html.replace('function show(){clearOutput();','function show(keepOutput=false){if(!keepOutput)clearOutput();');
html=html.replace('inputs.splice(i,1);show();','const keep=!!preparedForAdjustment&&i>=preparedInputCount;inputs.splice(i,1);show(keep);');
html=html.replace('<div class="sample-line">','<div id="duplicate-choice" class="duplicate-choice" hidden><p id="duplicate-message" role="status"></p><div><button id="duplicate-skip" type="button">跳过重复文件</button><button id="duplicate-keep" type="button">仍然添加</button></div></div><div class="sample-line">');
html=html.replace('<div class="spec"><span>内容缩放</span><strong>等比例适配</strong></div>','').replace('<div class="spec"><span>排入顺序</span><strong>文件顺序 → 原始页码</strong></div>','');
html=html.replace('<p class="hint">完全相同的文件会跳过，不覆盖原文件。</p>','');
html=html.replace('示例文件用于演示多页、去重和错误提示。','添加时检查重复文件，可选择跳过或仍然添加。');
html=html.replaceAll('重新选择文件','继续添加文件').replace('重新选择或拖入文件会替换当前列表。','可以多次选择或拖入文件，新增文件会追加到列表末尾；点击“清空全部”才会清除整个列表。');
html=html.replace('id="clear" class="text-button" hidden>清空</button>','id="clear" class="text-button" hidden>清空全部</button>');
html=html.replace('把票据，整齐排在一张纸上。','把文档与图片，整齐排在一起。').replace('PDF 与图片一起整理，预览确认后下载 A4 打印稿。','Word、Excel、PPT、PDF 与图片混合选择，自动转换后生成 A4 打印稿。');
html=html.replace('accept=".pdf,.png,.jpg,.jpeg"','accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx"').replace('选择 PDF 或图片','选择文档或图片').replace('PDF / PNG / JPG · 支持多选','Word / Excel / PPT / PDF / 图片 · 可混合选择');
html=html.replace('选择 PDF、PNG 或 JPG。','支持 DOC、DOCX、RTF、XLS、XLSX、PPT、PPTX、PDF、PNG 和 JPG。Word、Excel与PPT由本机办公软件自动转换。PPT按每张幻灯片一页导入（含隐藏页）；视频仅保留可导出的静态封面，不播放。Excel按原工作簿打印区域和分页导入，隐藏工作表不排入；需要更多区域时请先在Excel中调整打印区域。');
html=html.replace('本地处理，不上传文件。','文件仅在本机处理，办公文件转换经过本机助手，不发给卖家。');
html=html.replace('暂不支持 OFD、加密 PDF 和旋转 PDF 页。','Word/RTF、Excel与PPT需要本机有相应的桌面Word/Excel/PowerPoint或可用的WPS转换接口。复杂版式与字体替代需检查预览。暂不支持带宏或加密文档、OFD及旋转PDF页。');
html=html.replace('<option value="4">4 页内容</option>','<option value="4">4 页内容</option><option value="6">6 页内容</option><option value="8">8 页内容</option>');
html=html.replace('<div class="spec"><span>纸张</span><strong>A4 · 纵向</strong></div>','<div class="field"><label for="orientation">A4 纸张方向</label><select id="orientation"><option value="portrait">纵向 · 210 × 297 mm</option><option value="landscape">横向 · 297 × 210 mm</option></select></div>');
if(!html.includes("['files','layout','clear']"))throw Error('File controls integration point changed');
html=html.replace("['files','layout','clear']","['files','layout','orientation','clear']");
html=html.replace('文件顺序 → 原始页码','生成后可拖动交换');
const diagram=html.match(/function updateDiagram\(\)[^\r\n]+/g);
if(diagram?.length!==1)throw Error('Diagram integration point changed');
html=html.replace(diagram[0],`function updateDiagram(){const n=Number($('#layout').value),orientation=$('#orientation').value,d=InvoicePrototype.paperLayout(n,orientation),s=$('#sheet');$('#preview-caption').textContent='A4 '+(orientation==='landscape'?'横向':'纵向')+' · 每张纸 '+n+' 页内容';s.style.setProperty('--rows',d.rows);s.style.setProperty('--cols',d.cols);s.style.setProperty('--paper-ratio',d.W+'/'+d.H);s.dataset.count=n;s.setAttribute('aria-label',n+'页内容的排版示意');s.replaceChildren();for(let i=1;i<=n;i++){const box=document.createElement('div');box.className='slot';box.textContent='第 '+i+' 页内容';s.append(box);}document.querySelector('.paper-dim').textContent=(orientation==='landscape'?'297 × 210':'210 × 297')+' mm · 版式示意';}`);
// Replace the original generation handler; all output now shares the adjustment path.
const oldHandler=html.match(/\$\('#build'\)\.onclick=async[^\r\n]+/g);
if(oldHandler?.length!==1)throw Error('Generation handler changed; review adjustment integration');
html=html.replace(oldHandler[0],'');
for(const [before,after] of [
 ['function clearOutput(){','function clearOutput(keepAdjustment=false){if(!keepAdjustment)resetAdjustment();'],
 ['document.querySelectorAll(\'.remove\').forEach(b=>b.disabled=value);', 'document.querySelectorAll(\'.remove\').forEach(b=>b.disabled=value);syncAdjustmentControls();'],
 ["['文件','来源页','输出页','位置']","['文件','来源页','输出页','位置','比例']"],
 ['[r.file,r.sourcePage,r.outputPage,r.slot]','[r.file,r.sourcePage,r.outputPage,r.slot,scaleText({x:r.zoomXPercent,y:r.zoomYPercent})]']
]){
 if(!html.includes(before))throw Error('Missing adjustment integration point: '+before);
 html=html.replace(before,after);
}
html=html.replace('<div class="canvas">',()=>fs.readFileSync(path.join(__dirname,'direct-panel.html'),'utf8')+'<div class="canvas">');
html=html.replace('<iframe id="preview"','<div id="paper-editor" class="paper-editor" aria-label="可直接调整的打印文档" hidden></div><iframe id="preview"');
html=html.replace('</style>',()=>fs.readFileSync(path.join(__dirname,'direct-editor.css'),'utf8')+fs.readFileSync(path.join(__dirname,'swiss-ui.css'),'utf8')+'</style>');
html=html.replace('等比例适配</strong>','生成后拖动边角调整</strong>');
html=html.replace('检查预览和未排入文件提示。下载 PDF，用阅读器选择 A4 纸并检查打印缩放。','选择每张纸排2、4、6或8页，以及A4横向或纵向。拖动页面主体可调整位置；当页面中心进入目标页的中央区域，看到“松手交换”后松开即可互换两页，原来的缩放与位置跟随内容。边缘重叠只移动；拖角只缩放。按住 Alt 可越格移动，按 Esc 可取消拖动。拖角时对角固定：横拖改宽，竖拖改高，斜拖同时调整宽高；按住Shift保持当前比例。宽高各可调整25%–1000%，内容可以越过原格子；超出 A4 的部分不会印出。右键可调整叠放顺序。松手自动更新PDF，支持撤销和恢复默认。方向键移动内容，Alt加方向键交换相邻页；角点方向键调整宽高，Shift保持比例，+/-等比缩放。继续添加文件会保留已有调整，点击“更新打印稿”后新页接在末尾；移除文件或清空全部会重置调整。打印时选择对应A4方向与实际大小。');
const bridge=`
const conversionCache=new WeakMap();
const conversionByDigest=new Map();
const conversionCacheLimit=64*1024*1024;
let conversionCacheBytes=0;
function convertedOfficeFile(f,ext){
 const cached=conversionCache.get(f);
 if(cached)return cached;
 const key=ext+':'+f.digest;
 let entry=conversionByDigest.get(key);
 if(entry){conversionByDigest.delete(key);conversionByDigest.set(key,entry);}
 else{
  entry={size:0,pending:true,promise:null};
  entry.promise=(async()=>{
   const response=await fetch('./convert/'+ext,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Local-Token':'__SESSION_TOKEN__'},body:f.bytes});
   if(!response.ok)throw Error(await response.text());
   const bytes=await response.arrayBuffer();
   return ['doc','docx','rtf'].includes(ext)?await trimWordTrailingBlankPages(bytes):{bytes,skipped:0};
  })();
  conversionByDigest.set(key,entry);
  entry.promise.then(result=>{
   entry.pending=false;entry.size=result.bytes.byteLength;
   if(conversionByDigest.get(key)===entry)conversionCacheBytes+=entry.size;
   for(const [oldKey,old] of conversionByDigest){
    if(conversionByDigest.size<=12&&conversionCacheBytes<=conversionCacheLimit)break;
    if(old.pending)continue;
    conversionByDigest.delete(oldKey);conversionCacheBytes-=old.size;
   }
  },()=>{if(conversionByDigest.get(key)===entry)conversionByDigest.delete(key);});
 }
 conversionCache.set(f,entry.promise);
 entry.promise.catch(()=>conversionCache.delete(f));
 return entry.promise;
}
function prefetchMixed(files){
 // Convert while layout options are being chosen; Generate awaits the same promises.
 if(files.some(f=>/\.(docx?|rtf|xlsx?|pptx?)$/i.test(f.name)))prepareMixed(files,{quiet:true}).catch(()=>{});
}
async function prepareMixed(files,{quiet=false}={}){
 const out=new Array(files.length);
 const families={word:[],excel:[],ppt:[]};
 for(let i=0;i<files.length;i++){
  const f=files[i],ext=f.name.split('.').pop().toLowerCase();
  const family=['doc','docx','rtf'].includes(ext)?'word':
   ['xls','xlsx'].includes(ext)?'excel':['ppt','pptx'].includes(ext)?'ppt':null;
  if(family)families[family].push({f,ext,i});else out[i]=f;
 }
 const total=Object.values(families).reduce((n,group)=>n+group.length,0);
 const types=Object.entries(families).filter(([,group])=>group.length)
  .map(([family])=>({word:'Word',excel:'Excel',ppt:'PPT'})[family]);
 let completed=0;
 const report=()=>{
  if(quiet)return;
  status('正在转换文件 '+completed+' / '+total+'，请稍候…');
  uploadNotice('正在'+(types.length>1?'并行转换 ':'转换 ')+types.join('、')+'，请稍候','已完成 '+completed+' / '+total,'progress');
 };
 async function convert({f,ext,i}){
  try{
   const converted=await convertedOfficeFile(f,ext);
   out[i]={name:f.name,formatName:'converted.pdf',bytes:converted.bytes,skippedTrailingBlankPages:converted.skipped,duplicateChecked:f.duplicateChecked};
  }catch(e){out[i]={name:f.name,bytes:f.bytes,error:'未排入：'+e.message};}
  finally{completed++;report();}
 }
 if(total)report();
 await Promise.all(Object.values(families).map(async group=>{
  for(const item of group)await convert(item);
 }));
 return out;
}
`;
html=html.replace('</body>',()=>'<script>'+bridge+'</script>'+['file-import.js','trailing-blank.js','direct-geometry.js','direct-preview.js','direct-ui.js','direct-drag.js','segments.js','preview-view.js','swiss-ui.js'].map(file=>'<script>'+fs.readFileSync(path.join(__dirname,file),'utf8')+'</script>').join('')+'</body>');
html=html.replace('</select></div><div class="field"><label for="orientation">',()=>'</select></div>'+fs.readFileSync(path.join(__dirname,'segments-panel.html'),'utf8')+'<div class="field"><label for="orientation">');
html=html.replaceAll('多格式排版','文档拼版');
html=html.replace(/<header class="topbar">.*?<\/header>/s,'');
html=html.replace('把文档与图片，整齐排在一起。','文档拼版');
html=html.replace(/<div class="intro"><div><h1>文档拼版<\/h1><p>.*?<\/p><\/div><\/div>/s,'<div class="intro"><h1>文档拼版</h1></div>');
html=html.replace('选择文件</h2>','文件</h2>');
html=html.replaceAll('点击选择，或将文件拖到这里','继续添加文件');
html=html.replace(/<details class="help-details">.*?<\/details>/s,'');
html=html.replace('<title>文档拼版 · 本地打印工作台</title>','<title>文档拼版 v'+version+'</title>');
fs.writeFileSync(path.join(dest,'index.html'),html);
fs.writeFileSync(path.join(dest,'core.cjs'),core);
const pdfjs=pdfjsRoot,assets=path.join(dest,'assets','pdfjs');
fs.mkdirSync(assets,{recursive:true});
for(const file of ['pdf.min.mjs','pdf.worker.min.mjs'])fs.copyFileSync(path.join(pdfjs,'build',file),path.join(assets,file));
for(const folder of ['cmaps','standard_fonts'])fs.cpSync(path.join(pdfjs,folder),path.join(assets,folder),{recursive:true});
const notices=path.join(dest,'第三方许可说明');fs.mkdirSync(notices,{recursive:true});
fs.copyFileSync(path.join(pdfjs,'LICENSE'),path.join(notices,'PDF.js_APACHE-2.0.txt'));
fs.writeFileSync(path.join(notices,'PDF.js_说明.txt'),'PDF.js 5.6.205，Mozilla及其贡献者。项目：https://mozilla.github.io/pdf.js/ 。未修改分发的库文件，预览字体与CMap许可证随assets/pdfjs目录提供。所有预览资源本地加载，不需要外网。\n');
console.log('Built '+dest);
