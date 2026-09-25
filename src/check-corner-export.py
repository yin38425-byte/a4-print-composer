"""Compare real browser image bounds with independently parsed PDF drawing matrices."""
import json
import sys
from pathlib import Path
from pypdf import PdfReader

root = Path(sys.argv[1])
report = json.loads((root / 'browser-results.json').read_text(encoding='utf-8'))
checked = 0
for sample in report['samples']:
    reader = PdfReader(root / (sample['name'] + '.pdf'))
    expected = sample['expected']
    assert len(reader.pages) == max(row['outputPage'] for row in expected)
    for number, page in enumerate(reader.pages, 1):
        assert abs(float(page.mediabox.width) - 841.89) < .001
        assert abs(float(page.mediabox.height) - 595.28) < .001
        resources = page['/Resources']['/XObject']
        actual = []

        def visit(op, args, matrix, text_matrix):
            if op != b'Do' or args[0] not in resources:
                return
            obj = resources[args[0]]
            a, b, c, d, e, f = map(float, matrix)
            assert abs(b) < 1e-8 and abs(c) < 1e-8
            if obj['/Subtype'] == '/Form':
                x0, y0, x1, y1 = map(float, obj['/BBox'])
            else:
                assert obj['/Subtype'] == '/Image'
                x0, y0, x1, y1 = 0, 0, 1, 1
            actual.append(dict(x=e + a*x0, y=f + d*y0, width=a*(x1-x0), height=d*(y1-y0)))

        page.extract_text(visitor_operand_before=visit)
        rows = [row for row in expected if row['outputPage'] == number]
        assert len(actual) == len(rows), (sample['name'], number)
        for got, want in zip(actual, rows):
            for field in ['x', 'y', 'width', 'height']:
                assert abs(got[field] - want[field]) < .12, (sample['name'], want['sequence'], field, got[field], want[field])
            checked += 1
    text = '\n'.join(page.extract_text() for page in reader.pages)
    for number in range(1, 6):
        assert text.count('SYNTHETIC PAGE ' + str(number)) == 1

result = dict(passed=True, real_downloads=len(report['samples']), content_placements_checked=checked,
              PDF_and_PNG=True, A4_landscape=True, browser_bounds_match_PDF=True,
              all_synthetic_source_pages_preserved=True)
(root / 'pdf-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print('PASS: ' + str(checked) + ' PDF/PNG placements across ' + str(len(report['samples'])) + ' real downloads match browser x/y/width/height')
