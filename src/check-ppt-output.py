"""Independently verify the actual PDF downloaded in the PPT browser test."""
import json
import sys
from pathlib import Path
from pypdf import PdfReader
import pypdfium2 as pdfium

folder = Path(sys.argv[1])
manifest = json.loads((folder/'mixed-ppt.json').read_text(encoding='utf-8'))
reader = PdfReader(folder/'mixed-ppt.pdf')
assert len(reader.pages) == 2
assert len(manifest['files']) == 11 and not manifest['skipped']
assert manifest['files'][0]['file'] == 'synthetic-video.pptx'
assert manifest['files'][0]['sourcePage'] == 2
text = '\n'.join(p.extract_text() for p in reader.pages)
for marker in ['PPTX-1', 'PPTX-2', 'PPTX-3', 'PPT-LEGACY']:
    assert marker in text, f'Missing slide: {marker}'
for p in reader.pages:
    assert abs(float(p.mediabox.width)-841.89)<.1
    assert abs(float(p.mediabox.height)-595.28)<.1
pdf = pdfium.PdfDocument(folder/'mixed-ppt.pdf')
im = pdf[0].render(scale=2).to_pil().convert('RGB')
# Only the first slot: the video slide after swapping, rather than the separate poster image.
region = im.crop((60,48,420,560))
red = sum(r>170 and g<100 and b<130 for r,g,b in region.getdata())
cyan = sum(r<80 and g>130 and b>140 for r,g,b in region.getdata())
assert red>500 and cyan>500, (red,cyan)
im.save(folder/'mixed-ppt-render.png')
report = {'passed':True,'outputPages':2,'sourcePages':11,'slideMarkersPreserved':True,'videoPosterInFirstSlot':True,'redPixels':red,'cyanPixels':cyan}
(folder/'pdf-results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
