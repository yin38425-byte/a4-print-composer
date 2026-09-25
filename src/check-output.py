import json, sys
from pathlib import Path
from pypdf import PdfReader
import pypdfium2 as pdfium
path=Path(sys.argv[1]); output=Path(sys.argv[2])
r=PdfReader(path)
texts=[p.extract_text() for p in r.pages]
full='\n'.join(texts)
assert len(r.pages)==3, len(r.pages)
assert full.count('END-OF-DOCX-2026')==2, full
assert 'FINAL-RTF-MARKER' in full
assert '1234.56' in full
for p in r.pages:
    assert abs(float(p.mediabox.width)-595.28)<1
    assert abs(float(p.mediabox.height)-841.89)<1
doc=pdfium.PdfDocument(path)
for i in range(len(doc)):doc[i].render(scale=1).to_pil().save(output/f'mixed-final-{i+1}.png')
result={'file':str(path),'pages':len(r.pages),'A4':True,'WordLastPageMarkers':full.count('END-OF-DOCX-2026'),'rtfEndMarker':True,'sourceContentPages':9}
(output/'mixed-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
