(function(root){
  const axes=value=>typeof value==='number'?{x:value,y:value}:value;
  function resizeAxes(start,dx,dy,sx,sy,baseWidth,baseHeight,lockAspect=false){
    const s=axes(start),clamp=n=>Math.max(25,Math.min(1000,n));
    if(!lockAspect)return {x:clamp(s.x+100*dx*sx/baseWidth),y:clamp(s.y+100*dy*sy/baseHeight)};
    const w=baseWidth*s.x/100,h=baseHeight*s.y/100;
    const ratio=Math.max(Math.max(25/s.x,25/s.y),Math.min(Math.min(1000/s.x,1000/s.y),1+(dx*sx*w+dy*sy*h)/(w*w+h*h)));
    return {x:clamp(s.x*ratio),y:clamp(s.y*ratio)};
  }
  function visibleBox(content,clip){
    const x=Math.max(content.x,clip.x),y=Math.max(content.y,clip.y);
    return {x,y,width:Math.max(0,Math.min(content.x+content.width,clip.x+clip.width)-x),height:Math.max(0,Math.min(content.y+content.height,clip.y+clip.height)-y)};
  }
  function cornerOffset(g,start,next,sx,sy){
    const s=axes(start),n=axes(next);
    if(s.x===n.x&&s.y===n.y)return {...g.offset};
    // Opposite visible corner is the pivot, including when the source is cropped.
    const b=g.content,a={x:sx>0?b.x:b.x+b.width,y:sy>0?b.y+b.height:b.y};
    return {x:s.x===n.x?g.offset.x:a.x+(g.content.x+g.content.width/2-a.x)*n.x/s.x-(g.clip.x+g.clip.width/2),
      y:s.y===n.y?g.offset.y:a.y+(g.content.y+g.content.height/2-a.y)*n.y/s.y-(g.clip.y+g.clip.height/2)};
  }
  function moveOffset(g,dx,dy){return {x:g.offset.x+dx,y:g.offset.y+dy};}
  function snapAngle(angle,latched=false){
    const normalized=((angle%360)+360)%360,nearest=Math.round(normalized/90)*90;
    const distance=Math.abs(normalized-nearest),snap=distance<=(latched?8:4);
    return {angle:snap?nearest%360:normalized,snapped:snap};
  }
  function rotatedCornerOffset(g,start,next,sx,sy,angle){
    if(!angle)return cornerOffset(g,start,next,sx,sy);
    const s=axes(start),n=axes(next),r=angle*Math.PI/180,c=Math.cos(r),si=Math.sin(r);
    const dw=g.content.width*(n.x/s.x-1)/2,dh=g.content.height*(n.y/s.y-1)/2;
    return {x:g.offset.x+c*sx*dw-si*sy*dh,y:g.offset.y-si*sx*dw-c*sy*dh};
  }
  function localResizeDelta(dx,dy,angle){const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return {x:c*dx+s*dy,y:-s*dx+c*dy};}
  root.DirectGeometry={resizeAxes,visibleBox,cornerOffset,rotatedCornerOffset,localResizeDelta,snapAngle,moveOffset};
  if(typeof module!=='undefined')module.exports=root.DirectGeometry;
})(typeof globalThis!=='undefined'?globalThis:this);
