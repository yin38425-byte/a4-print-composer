// Word can export a trailing white page created by empty final paragraphs.
// Inspect only the converted Word PDF, leaving intentional PPT and image pages alone.
async function trimWordTrailingBlankPages(bytes){
  const renderer=await import('./assets/pdfjs/pdf.min.mjs');
  renderer.GlobalWorkerOptions.workerSrc=new URL('./assets/pdfjs/pdf.worker.min.mjs',location.href).href;
  const task=renderer.getDocument({data:new Uint8Array(bytes.slice(0)),isEvalSupported:false,stopAtErrors:true,
    cMapUrl:new URL('./assets/pdfjs/cmaps/',location.href).href,cMapPacked:true,
    standardFontDataUrl:new URL('./assets/pdfjs/standard_fonts/',location.href).href,useWasm:false});
  let skipped=0;
  try{
    const doc=await task.promise;
    for(let number=doc.numPages;number>=1;number--){
      const page=await doc.getPage(number),full=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(1,700/Math.max(full.width,full.height))});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:context,viewport,background:'#fff'}).promise;
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let darkPixels=0;
      for(let i=0;i<pixels.length;i+=4){
        if(Math.min(pixels[i],pixels[i+1],pixels[i+2])<252){darkPixels++;break;}
      }
      canvas.width=canvas.height=0;page.cleanup();
      if(darkPixels)break;
      skipped++;
    }
  }finally{await task.destroy();}
  if(!skipped)return {bytes,skipped:0};
  const pdf=await PDFLib.PDFDocument.load(bytes);
  if(skipped===pdf.getPageCount())throw Error('转换后只有空白页，请检查 Word 文档');
  for(let i=0;i<skipped;i++)pdf.removePage(pdf.getPageCount()-1);
  return {bytes:await pdf.save(),skipped};
}
