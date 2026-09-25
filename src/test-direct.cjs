const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {resizeAxes,visibleBox,cornerOffset,moveOffset}=require('./direct-geometry.js');
const {geometry,arrange}=require('./layout-core.js');
for(const angle of [0,90,180,270]){
  const d=require('./direct-geometry.js');assert.equal(d.snapAngle(angle+3).angle,angle);
  assert.equal(d.snapAngle(angle+7,true).angle,angle);
  assert.notEqual(d.snapAngle(angle+10,true).angle,angle);
}
const PDFLib=require('pdf-lib');
(async()=>{
 for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){
  assert.deepEqual(resizeAxes(100,sx*125,0,sx,sy,500,200),{x:125,y:100});
  assert.deepEqual(resizeAxes(100,0,sy*50,sx,sy,500,200),{x:100,y:125});
  assert.deepEqual(resizeAxes(100,sx*125,-sy*50,sx,sy,500,200),{x:125,y:75});
  assert.deepEqual(resizeAxes(100,-sx*500,-sy*200,sx,sy,500,200),{x:25,y:25});
  assert.deepEqual(resizeAxes(100,sx*500,sy*200,sx,sy,500,200),{x:200,y:200});
  assert.deepEqual(resizeAxes(100,sx*1500,sy*600,sx,sy,500,200),{x:400,y:400});
  const locked=resizeAxes({x:140,y:70},sx*70,sy*150,sx,sy,500,200,true);
  assert(Math.abs(locked.x/locked.y-2)<1e-10,'Shift preserves the existing aspect ratio after a free stretch');
 }
 let freeCases=0;
 for(const orientation of ['portrait','landscape'])for(const layout of [2,4,6,8])for(const [width,height]of [[1000,500],[500,1000]])
 for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]])for(const start of [{x:100,y:100},{x:70,y:130},{x:170,y:60}])
 for(const [dx,dy]of [[-30,0],[0,-30],[35,-20],[-90,60]])for(const shift of [false,true]){
  const g=geometry(layout,layout-1,width,height,start,{orientation,offset:{x:8,y:-12},clampOffset:false}),b=g.content;
  const anchor={x:sx>0?b.x:b.x+b.width,y:sy>0?b.y+b.height:b.y};
  const next=resizeAxes(start,dx,dy,sx,sy,width*g.fit,height*g.fit,shift);
  const offset=cornerOffset(g,start,next,sx,sy),end=geometry(layout,layout-1,width,height,next,{orientation,offset,clampOffset:false});
  const v=end.content,fixed={x:sx>0?v.x:v.x+v.width,y:sy>0?v.y+v.height:v.y};
  assert(Math.abs(fixed.x-anchor.x)<1e-8&&Math.abs(fixed.y-anchor.y)<1e-8,'free resize keeps the opposite content corner fixed');
  if(!shift&&dx===0){assert.equal(end.content.width,g.content.width);assert.equal(end.content.x,g.content.x);}
  if(!shift&&dy===0){assert.equal(end.content.height,g.content.height);assert.equal(end.content.y,g.content.y);}
  if(shift)assert(Math.abs(next.x/next.y-start.x/start.y)<1e-8);
  assert.deepEqual(moveOffset(end,0,0),offset);freeCases++;
 }
 let anchoredCases=0;
 for(const orientation of ['portrait','landscape'])for(const layout of [2,4,6,8])for(const [width,height]of [[1000,500],[500,1000]])
 for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]])for(const [start,next]of [[100,70],[70,100],[100,150],[150,25],[25,200]]){
  const g=geometry(layout,layout-1,width,height,start,{orientation,offset:{x:8,y:-12}}),b=g.content;
  const anchor={x:sx>0?b.x:b.x+b.width,y:sy>0?b.y+b.height:b.y};
  const offset=cornerOffset(g,start,next,sx,sy),end=geometry(layout,layout-1,width,height,next,{orientation,offset,clampOffset:false});
  const v=end.content,fixed={x:sx>0?v.x:v.x+v.width,y:sy>0?v.y+v.height:v.y};
  assert(Math.abs(fixed.x-anchor.x)<1e-8&&Math.abs(fixed.y-anchor.y)<1e-8,'opposite content corner must remain fixed');
  assert(Math.abs(end.content.width/end.content.height-width/height)<1e-8,'aspect ratio must not change');
  assert.deepEqual(moveOffset(end,0,0),offset,'starting a move must not snap the anchored result');
  assert.deepEqual(cornerOffset(end,next,next,sx,sy),offset,'hitting scale limits must not introduce drift');
  anchoredCases++;
 }
 for(const layout of [2,4])for(let slot=0;slot<layout;slot++){
  const g=geometry(layout,slot,595,842,200),b=g.content;
  assert(b.width>g.clip.width||b.height>g.clip.height,'enlarged content may cross its original cell');
 } const source=await PDFLib.PDFDocument.create(),font=await source.embedFont(PDFLib.StandardFonts.Helvetica);
 const p=source.addPage([400,300]);p.drawText('SOURCE-CONTENT',{font,x:30,y:140});p.setCropBox(20,20,200,180);
 const input=[{name:'crop.pdf',bytes:await source.save()}];
 const result=await arrange(PDFLib,input,2,{includePreview:true,scales:{1:75}});
 assert.equal(result.manifest[0].zoomPercent,75);
 const preview=await PDFLib.PDFDocument.load(result.previewBytes),out=await PDFLib.PDFDocument.load(result.bytes);
 assert.deepEqual(preview.getPage(0).getSize(),{width:400,height:300});assert.equal(out.getPageCount(),1);
 assert.deepEqual([result.manifest[0].width,result.manifest[0].height],[400,300]);
 const stretched=await arrange(PDFLib,input,2,{scales:{1:{x:140,y:70}},clampOffsets:false});
 assert.equal(stretched.manifest[0].zoomPercent,null);
 assert.equal(stretched.manifest[0].zoomXPercent,140);assert.equal(stretched.manifest[0].zoomYPercent,70);
 for(const invalid of [{x:20,y:100},{x:100,y:1001},{x:NaN,y:100},{x:100},{x:'50',y:100}])
  await assert.rejects(()=>arrange(PDFLib,input,2,{scales:{1:invalid}}),/25%/);
 if(process.argv[2]){fs.mkdirSync(process.argv[2],{recursive:true});fs.writeFileSync(path.join(process.argv[2],'direct-source-preview.pdf'),result.previewBytes);fs.writeFileSync(path.join(process.argv[2],'direct-export.pdf'),result.bytes)}
 console.log('PASS: '+freeCases+' free/Shift resize cases + '+anchoredCases+' proportional anchor cases; independent axes, fixed corner, both orientations, 2/4/6/8 layouts, overlapping layout, limits and manifest dimensions');
})().catch(e=>{console.error(e);process.exitCode=1});
