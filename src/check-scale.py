"""Check actual PDF raster output: area, centering, isolation and clipping."""
import json, sys
from pathlib import Path
import numpy as np
import pypdfium2 as pdfium

root=Path(sys.argv[1])
def image(path):
    with pdfium.PdfDocument(path) as doc:
        page=doc[0]
        bitmap=page.render(scale=2)
        pixels=np.asarray(bitmap.to_pil().convert('RGB')).copy()
        bitmap.close();page.close()
        return pixels
def red(p): return (p[:,:,0]>240)&(p[:,:,1]<15)&(p[:,:,2]<15)
def blue(p): return (p[:,:,2]>240)&(p[:,:,0]<15)&(p[:,:,1]<15)
report=[]
for n in (2,4):
    baseline=image(root/f'scale-{n}-100.pdf')
    baseline_red=red(baseline); baseline_blue=blue(baseline)
    y0,x0=np.where(baseline_red)
    for pct in (25,50,100,150,200):
        current=image(root/f'scale-{n}-{pct}.pdf'); r=red(current)
        assert np.array_equal(blue(current),baseline_blue), 'Other content must not resize or be covered'
        y,x=np.where(r)
        assert abs(x.mean()-x0.mean())<1 and abs(y.mean()-y0.mean())<1, 'Scaling must stay centered'
        ratio=float(r.sum()/baseline_red.sum())
        if pct<=100: assert abs(ratio-(pct/100)**2)<.01, (pct,ratio)
        # A4 slot boundaries in rendered pixels. Red cannot reach border/label or adjacent slot.
        cw=(595.28-48-16*(n//2-1))/(n//2);ch=(841.89-48-16)/2
        assert x.min()>=59 and x.max()<=(24+cw-6)*2+1
        assert y.min()>=(24+10)*2-1 and y.max()<=(24+ch-20)*2+1
        report.append({'layout':n,'percent':pct,'red_area_ratio':round(ratio,4),'other_page_unchanged':True,'centered_and_clipped':True})
(root/'scale-raster-results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PASS: all 10 PDFs rendered; scale area, centered content, unchanged second page, clipping inside slot')
