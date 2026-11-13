"""Compare separate software proposals with immutable hardware references; no approval."""

import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
legacy = HERE.parent / 'after/fixture'
proposals = HERE / 'software-references'
diffs = HERE / 'reference-diffs'
diffs.mkdir(exist_ok=True)
manifest = json.loads((proposals / 'manifest.json').read_text(encoding='utf-8'))
verification = json.loads((ROOT / '.cache/d08-visual-verify/fixture/manifest.json').read_text(encoding='utf-8'))
assert manifest['seed'] == verification['seed']
assert manifest['environment']['gpu']['featureStatus']['gpu_compositing'] == 'disabled_software'
files = sorted(proposals.glob('*.png'))
assert len(files) == 64
records = []
for candidate in files:
    original = legacy / candidate.name
    baseline_blob = subprocess.check_output(['git', 'show', '8625597393d1d467b90ae83630fd280177d5b590:' + original.relative_to(ROOT).as_posix()])
    assert original.read_bytes() == baseline_blob, 'Original golden modified'
    with Image.open(original).convert('RGB') as left, Image.open(candidate).convert('RGB') as right:
        assert left.size == right.size, f'Layout dimensions changed: {candidate.name}'
        diff = ImageChops.difference(left, right)
        red, green, blue = diff.split()
        changed = left.width * left.height - ImageChops.lighter(red, ImageChops.lighter(green, blue)).histogram()[0]
        diff.save(diffs / candidate.name)
        records.append({'file': candidate.name, 'width': left.width, 'height': left.height,
                        'original_sha256': hashlib.sha256(baseline_blob).hexdigest(),
                        'proposal_sha256': hashlib.sha256(candidate.read_bytes()).hexdigest(),
                        'raw_different_pixels': changed, 'raw_difference_bbox': diff.getbbox()})
expected = 'c3ba27ba2c8dd973db35eb9d4ebe1b4e9de76b3e4c4f8e56de36949bd910ca51'
assert next(r['proposal_sha256'] for r in records if r['file'] == 'architecture-write-1440.png') == expected
report = {'status': 'PROPOSED — independent baseline approval pending',
          'profile': manifest['environment']['profile'], 'references': records,
          'method': 'Absolute RGB difference; raw pixel counts are diagnostic, not the acceptance comparator',
          'acceptance': {'maxDiffPixels': 100, 'threshold': 0.1, 'updateSnapshots': 'none'},
          'original_commit': '8625597393d1d467b90ae83630fd280177d5b590',
          'proof': 'Software proposal architecture-write-1440 byte-identical to both CI attempt actual PNGs; original goldens untouched'}
(HERE / 'reference-comparison.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
print('64 original golden blobs unchanged;64 software proposals with equal image dimensions and identical fixture IDs.')
print('64 separate raw difference images/sha256 records saved; no approval, tolerance increase or golden overwrite.')
print('Architecture write proposal SHA equals both CI attempt actuals exactly: ' + expected)
