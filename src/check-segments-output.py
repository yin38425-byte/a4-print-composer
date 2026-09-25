"""Check downloaded PDFs independently of the JS layout implementation."""
import json, re, sys
from pathlib import Path
from pypdf import PdfReader
import pypdfium2 as pdfium

folder=Path(sys.argv[1]);results=[]
for name in ['segmented-landscape','segmented-portrait','six-portrait','six-landscape']:
    manifest=json.loads((folder/(name+'.json')).read_text(encoding='utf-8'))
    reader=PdfReader(folder/(name+'.pdf'))
    assert len(manifest['files'])==18 and not manifest['skipped']
    assert len(reader.pages)==(5 if name.startswith('segmented') else 3)
    landscape=manifest['orientation']=='landscape'
    found=[]
    for index,page in enumerate(reader.pages,1):
        assert abs(float(page.mediabox.width)-(841.89 if landscape else 595.28))<.01
        assert abs(float(page.mediabox.height)-(595.28 if landscape else 841.89))<.01
        text=page.extract_text();assert 'source p.' not in text
        found.extend(map(int,re.findall(r'SYNTHETIC PAGE (\d+)',text)))
        operations=page.get_contents().operations
        # Frames/text added by the tool would be strokes or text operators on the output page.
        assert not any(op in [b'S',b's',b'B',b'B*',b'b',b'b*',b'BT'] for _,op in operations)
        rows=[r for r in manifest['files'] if r['outputPage']==index]
        assert sum(op==b'Do' for _,op in operations)==len(rows)
        assert [r['slot'] for r in rows]==list(range(1,len(rows)+1))
    assert found==[r['sourcePage'] for r in manifest['files']]
    assert sorted(found)==list(range(1,19))
    results.append({'name':name,'outputPages':len(reader.pages),'sourcePages':18,'noAddedBordersOrLabels':True,'orderMatchesManifest':True})
pdf=pdfium.PdfDocument(folder/'segmented-landscape.pdf')
pdf[2].render(scale=1.5).to_pil().save(folder/'six-page-render.png')
(folder/'pdf-results.json').write_text(json.dumps({'passed':True,'downloads':results},indent=2),encoding='utf-8')
print('PASS: 4 real downloads; 72 source placements; no missing/duplicate pages, added borders or source labels')
