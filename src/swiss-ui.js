// Presentation adapter: keep the existing import, editor, and export elements alive.
function swissChoices(selectId,options,className=''){
  const select=document.getElementById(selectId),field=select.closest('.field');
  select.classList.add('swiss-select-source');
  select.setAttribute('aria-hidden','true');
  select.tabIndex=-1;
  const group=document.createElement('div');
  group.className='swiss-choices '+className;
  group.setAttribute('role','group');
  group.setAttribute('aria-label',field.querySelector('label').textContent);
  const buttons=options.map(([value,text])=>{
    const button=document.createElement('button');
    button.type='button';button.dataset.value=value;button.textContent=text;
    button.onclick=()=>{
      if(button.disabled)return;
      select.value=value;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      sync();
    };
    group.append(button);return button;
  });
  function sync(){
    for(const button of buttons){
      button.setAttribute('aria-pressed',String(button.dataset.value===select.value));
      button.disabled=select.disabled;
    }
  }
  select.addEventListener('change',sync);
  new MutationObserver(sync).observe(select,{attributes:true,attributeFilter:['disabled']});
  field.append(group);sync();
}
swissChoices('layout',[[2,'2 页'],[4,'4 页'],[6,'6 页'],[8,'8 页']]);
swissChoices('orientation',[['portrait','纵向'],['landscape','横向']],'swiss-orientation');
document.getElementById('orientation').closest('.field').after(document.querySelector('.segment-settings'));

const previewHead=document.querySelector('.preview-head');
const adjustmentToolbar=document.getElementById('adjustment');
const previewViewTools=adjustmentToolbar.querySelector('.view-tools');
previewHead.querySelector('#preview-title').remove();
document.querySelector('.preview-area').removeAttribute('aria-labelledby');
document.querySelector('.preview-area').setAttribute('aria-label','打印预览');
const previewActions=document.createElement('div');
previewActions.className='preview-head-actions';
previewHead.append(previewActions);
previewActions.append(document.getElementById('downloads'),document.getElementById('preview-expand'),document.getElementById('preview-close'));
function syncPreviewToolbar(){
  const generated=!adjustmentToolbar.hidden;
  previewHead.hidden=generated;
  (generated?previewViewTools:previewActions).append(document.getElementById('downloads'),document.getElementById('preview-expand'),document.getElementById('preview-close'));
}
new MutationObserver(syncPreviewToolbar).observe(adjustmentToolbar,{attributes:true,attributeFilter:['hidden']});
syncPreviewToolbar();
const manifestExport=document.createElement('div');
manifestExport.id='manifest-export';
document.getElementById('manifest-details').append(manifestExport);
const downloads=document.getElementById('downloads');
new MutationObserver(()=>{
  const secondary=downloads.querySelector('.secondary-link');
  if(secondary)manifestExport.replaceChildren(secondary);
  else if(!downloads.querySelector('.primary'))manifestExport.replaceChildren();
}).observe(downloads,{childList:true});

function showLocalLaunchNotice(){
  uploadNotice('请通过启动程序打开','当前直接打开了 index.html，浏览器无法加载 PDF 预览。请关闭此页，在同一文件夹双击「启动文档拼版.exe」，使用自动打开的网页。');
  document.getElementById('upload-notice-close').hidden=true;
}
if(location.protocol==='file:'){
  document.body.classList.add('needs-local-launch');
  document.getElementById('choose-label').textContent='请先启动本机程序';
  document.getElementById('files').disabled=true;
  document.getElementById('layout').disabled=true;
  document.getElementById('orientation').disabled=true;
  document.getElementById('segments-toggle').disabled=true;
  document.getElementById('build').disabled=true;
  const dropzone=document.getElementById('dropzone');
  dropzone.setAttribute('aria-disabled','true');
  for(const eventName of ['dragover','drop'])dropzone.addEventListener(eventName,event=>{
    event.preventDefault();event.stopImmediatePropagation();showLocalLaunchNotice();
  },true);
  showLocalLaunchNotice();
}
