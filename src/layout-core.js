/* PROTOTYPE: Can a fixed, local workflow handle mixed files without per-order support? */
(function(root){
  const MAX_SOURCE_PAGES=300,MAX_OUTPUT_SHEETS=Math.ceil(MAX_SOURCE_PAGES/2);
  function inputError(message){const error=new Error(message);error.userMessage=message;return error;}
  function scaleAxes(value=100){
    const axes=typeof value==='number'?{x:value,y:value}:value;
    if(!axes||!Number.isFinite(axes.x)||!Number.isFinite(axes.y)||axes.x<25||axes.x>1000||axes.y<25||axes.y>1000)
      throw new Error('宽度和高度比例需要在 25% 至 1000% 之间');
    return {x:axes.x,y:axes.y};
  }
  function paperLayout(perPage=2,orientation='portrait'){
    if(![2,4,6,8].includes(perPage))throw new Error('每张纸可排 2、4、6 或 8 页内容');
    if(!['portrait','landscape'].includes(orientation))throw new Error('纸张方向无效');
    const landscape=orientation==='landscape',cols=landscape?(perPage===8?4:perPage===6?3:2):(perPage===2?1:2);
    return {W:landscape?841.89:595.28,H:landscape?595.28:841.89,cols,rows:perPage/cols};
  }
  function normalizeSegments(segments=[]){
    if(!Array.isArray(segments))throw new Error('分段设置无效');
    const seen=new Set();
    return segments.map(rule=>{
      if(!rule||!Number.isInteger(rule.fromSheet)||rule.fromSheet<2||rule.fromSheet>MAX_OUTPUT_SHEETS)throw new Error('分段起点请输入 2 至 '+MAX_OUTPUT_SHEETS+' 的整数；第 1 张使用上方默认版式');
      paperLayout(rule.perPage);
      if(rule.orientation&&!['inherit','portrait','landscape'].includes(rule.orientation))throw new Error('分段纸张方向无效');
      if(seen.has(rule.fromSheet))throw new Error('同一张 A4 不能设置两个分段起点');
      seen.add(rule.fromSheet);return {fromSheet:rule.fromSheet,perPage:rule.perPage,...(rule.orientation&&rule.orientation!=='inherit'?{orientation:rule.orientation}:{})};
    }).sort((a,b)=>a.fromSheet-b.fromSheet);
  }
  function pagePlan(count,perPage=2,segments=[],orientation){
    paperLayout(perPage);const rules=normalizeSegments(segments),plan=[];
    if(!Number.isInteger(count)||count<0||count>MAX_SOURCE_PAGES)throw new Error('来源页数无效');
    let cursor=0,current=perPage,outputPage=0,direction=orientation||'portrait';
    while(plan.length<count){
      outputPage++;
      if(rules[cursor]?.fromSheet===outputPage){const rule=rules[cursor++];current=rule.perPage;direction=rule.orientation||orientation||'portrait';}
      for(let slot=1;slot<=current&&plan.length<count;slot++)plan.push({outputPage,slot,perPage:current,...(orientation!==undefined||rules.some(r=>r.orientation)?{orientation:direction}:{})});
    }
    if(count&&cursor<rules.length)throw new Error('第 '+rules[cursor].fromSheet+' 张分段未生效：按前面的规则仅能排成 '+outputPage+' 张 A4，请调整分段起点');
    return plan;
  }
  function geometry(perPage,slot,width,height,zoomPercent=100,options={}){
    const {W,H,cols,rows}=paperLayout(perPage,options.orientation),margin=24,gap=16;
    const cw=(W-margin*2-gap*(cols-1))/cols,ch=(H-margin*2-gap*(rows-1))/rows;
    const col=slot%cols,row=Math.floor(slot/cols),x=margin+col*(cw+gap),y=H-margin-(row+1)*ch-row*gap;
    const fit=Math.min((cw-12)/width,(ch-12)/height),axes=scaleAxes(zoomPercent);
    const clip={x:x+6,y:y+6,width:cw-12,height:ch-12},w=width*fit*axes.x/100,h=height*fit*axes.y/100;
    const requested=options.offset||{x:0,y:0};
    if(!Number.isFinite(requested.x)||!Number.isFinite(requested.y))throw new Error('内容位置无效');
    // Small content stays inside its cell; oversized content can pan to reveal cropped edges.
    const clamp=(value,limit)=>Math.max(-limit,Math.min(limit,value));
    const offset=options.clampOffset===false?{x:requested.x,y:requested.y}:{x:clamp(requested.x,Math.abs(clip.width-w)/2),y:clamp(requested.y,Math.abs(clip.height-h)/2)};
    return {W,H,x,y,cw,ch,fit,clip,offset,
      content:{x:clip.x+(clip.width-w)/2+offset.x,y:clip.y+(clip.height-h)/2+offset.y,width:w,height:h}};
  }
  function rotationAngle(value=0){
    if(!Number.isFinite(value))throw new Error('旋转角度无效');
    return ((value%360)+360)%360;
  }
  function imagePlacement(box,angle){
    const radians=-rotationAngle(angle)*Math.PI/180,co=Math.cos(radians),si=Math.sin(radians);
    const cx=box.x+box.width/2,cy=box.y+box.height/2;
    return {x:cx-co*box.width/2+si*box.height/2,y:cy-si*box.width/2-co*box.height/2};
  }
  async function arrange(PDFLib, inputs, perPage=2, options={}) {
    const {PDFDocument}=PDFLib;
    const out=await PDFDocument.create();
    const entries=[], rejected=[], seen=new Set();
    paperLayout(perPage,options.orientation);
    for (const input of inputs) {
      try {
        if(input.error) throw inputError(input.error);
        const bytes=new Uint8Array(input.bytes),formatName=input.formatName||input.name;
        if (bytes.length>100*1024*1024) throw inputError('文件超过100MB，请压缩文件或拆分后重试');
        const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
        if (seen.has(key)&&!input.duplicateChecked) { rejected.push({file:input.name,reason:'完全相同的文件，本次不重复排入'}); continue; }
        seen.add(key);
        if (/\.pdf$/i.test(formatName)) {
          const doc=await PDFDocument.load(bytes);
          if(doc.getPageCount()>MAX_SOURCE_PAGES) throw inputError('单文件超过'+MAX_SOURCE_PAGES+'页，请拆分后重试');
          if(doc.getPages().some(p=>p.getRotation().angle%360!==0)) throw inputError('含旋转页，原型暂不支持，请先转正');
          if(doc.getPages().some(p=>!p.node.Contents())) throw inputError('含无内容的空白页，本文件未排入；请删除空白页后重试');
          const embeds=await out.embedPdf(doc,doc.getPageIndices());
          embeds.forEach((image,i)=>entries.push({file:input.name,sourcePage:i+1,image,width:image.width,height:image.height,kind:'pdf'}));
        } else if (/\.(png|jpe?g)$/i.test(formatName)) {
          const image=/\.png$/i.test(formatName)?await out.embedPng(bytes):await out.embedJpg(bytes);
          entries.push({file:input.name,sourcePage:1,image,width:image.width,height:image.height,kind:'image'});
        } else throw inputError('格式不支持，请选择PDF、PNG或JPG文件');
      } catch(e) { rejected.push({file:input.name,reason: e.userMessage || (/encrypted/i.test(String(e))?'加密PDF暂不支持，请使用可直接打开的非加密文件':'无法读取文件内容，请确认原文件能正常打开；若仍失败，请重新导出为PDF、PNG或JPG')}); }
    }
    if(entries.length>MAX_SOURCE_PAGES) throw new Error('本次累计超过'+MAX_SOURCE_PAGES+'页，请分批处理');
    if(!entries.length) return {bytes:null,manifest:[],rejected};
    const validIds=ids=>Array.isArray(ids)&&ids.length<=entries.length&&new Set(ids).size===ids.length&&!ids.some(id=>!Number.isInteger(id)||id<1||id>entries.length);
    if(options.order!==undefined&&!validIds(options.order))throw new Error('页顺序无效，请重新生成');
    const order=options.order===undefined?entries.map((_,i)=>i+1):[...options.order];
    if(options.appendRemaining){const included=new Set(order);for(let id=options.appendRemaining===true?1:options.appendRemaining;id<=entries.length;id++)if(!included.has(id))order.push(id);}
    if(!order.length)return {bytes:null,manifest:[],rejected};
    // Render the same embedded source pages in the editor; original PDF crop boxes
    // cannot make the canvas and exported PDF use different content coordinates.
    let previewBytes;
    if(options.includePreview){
      for(const e of entries){
        const p=out.addPage([e.width,e.height]),box={x:0,y:0,width:e.width,height:e.height};
        if(e.kind==='pdf')p.drawPage(e.image,box);else p.drawImage(e.image,box);
      }
      previewBytes=await out.save();
      while(out.getPageCount())out.removePage(0);
    }
    let segments=options.segments;
    if(options.appendRemaining&&segments?.length){
      const active=[];
      for(const rule of normalizeSegments(segments)){
        const prior=pagePlan(order.length,perPage,active,options.orientation||'portrait');
        if(rule.fromSheet>(prior.at(-1)?.outputPage||0))break;
        active.push(rule);
      }
      segments=active;
    }
    const manifest=[],plan=pagePlan(order.length,perPage,segments,options.orientation||'portrait');
    const layerOrder=options.layerOrder===undefined?entries.map((_,i)=>i+1):[...options.layerOrder];
    if(!validIds(layerOrder))throw new Error('层次顺序无效，请重新生成');
    if(options.appendRemaining){const included=new Set(layerOrder);for(let id=1;id<=entries.length;id++)if(!included.has(id))layerOrder.push(id);}
    if(layerOrder.length!==entries.length)throw new Error('层次顺序无效，请重新生成');
    const layerRank=new Map(layerOrder.map((id,i)=>[id,i])),sheetRows=new Map();
    for(let i=0;i<order.length;i++) {
      const sequence=order[i],e=entries[sequence-1],placement=plan[i],slot=placement.slot-1;
      const axes=scaleAxes(options.scales?.[sequence]??100),zoomPercent=axes.x===axes.y?axes.x:null,angle=rotationAngle(options.angles?.[sequence]??0);
      const {W,H,content:b,offset}=geometry(placement.perPage,slot,e.width,e.height,axes,{orientation:placement.orientation,offset:options.offsets?.[sequence],clampOffset:options.clampOffsets!==false});
      if(!sheetRows.has(placement.outputPage))sheetRows.set(placement.outputPage,{W,H,rows:[]});
      sheetRows.get(placement.outputPage).rows.push({sequence,e,b,angle});
      manifest.push({sequence,position:i+1,file:e.file,sourcePage:e.sourcePage,...placement,layer:layerRank.get(sequence)+1,zoomPercent,zoomXPercent:axes.x,zoomYPercent:axes.y,rotationDegrees:angle,offset,width:e.width,height:e.height});
    }
    for(const sheet of sheetRows.values()){
      const page=out.addPage([sheet.W,sheet.H]);
      for(const {sequence,e,b,angle} of sheet.rows.sort((a,b)=>layerRank.get(a.sequence)-layerRank.get(b.sequence))){
        const rotated=angle?{...imagePlacement(b,angle),width:b.width,height:b.height,rotate:PDFLib.degrees(-angle)}:b;
        if(e.kind==='pdf')page.drawPage(e.image,rotated);else page.drawImage(e.image,rotated);
      }
    }    return {bytes:await out.save(),manifest,rejected,previewBytes};
  }
  root.InvoicePrototype={arrange,geometry,paperLayout,normalizeSegments,pagePlan,MAX_SOURCE_PAGES,MAX_OUTPUT_SHEETS};
  if(typeof module!=='undefined')module.exports=root.InvoicePrototype;
})(typeof globalThis!=='undefined'?globalThis:this);
