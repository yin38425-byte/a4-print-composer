const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(path.join(__dirname,'swiss-ui.js'),'utf8');
const guard=source.slice(source.indexOf('function showLocalLaunchNotice(){'));
assert(guard.startsWith('function showLocalLaunchNotice(){'));

function check(protocol){
  const elements=new Map(),events=new Map(),notices=[];
  function element(id){
    if(!elements.has(id))elements.set(id,{
      disabled:false,hidden:false,textContent:'',attributes:{},classList:{add(){}},
      setAttribute(key,value){this.attributes[key]=value},
      addEventListener(name,handler){events.set(name,handler)}
    });
    return elements.get(id);
  }
  const context={location:{protocol},document:{body:element('body'),getElementById:element},
    uploadNotice:(title,detail)=>notices.push({title,detail})};
  vm.runInNewContext(guard,context);
  if(protocol==='file:'){
    assert.equal(element('files').disabled,true);
    assert.equal(element('build').disabled,true);
    assert.equal(element('upload-notice-close').hidden,true);
    assert.match(notices[0].detail,/启动文档拼版\.exe/);
    assert.equal(element('dropzone').attributes['aria-disabled'],'true');
    let prevented=false,stopped=false;
    events.get('drop')({preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}});
    assert(prevented&&stopped);
  }else{
    assert.equal(element('files').disabled,false);
    assert.equal(element('build').disabled,false);
    assert.equal(notices.length,0);
  }
}
check('file:');check('http:');
console.log('PASS: direct-file launch is blocked with a clear startup message; HTTP remains available');
