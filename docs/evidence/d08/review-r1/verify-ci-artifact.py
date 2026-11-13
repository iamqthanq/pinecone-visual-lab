"""Verify a downloaded GitHub artifact's digest and actual visual runtime; no network."""

import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
archive = (ROOT / sys.argv[1]).resolve()
expected_digest = sys.argv[2].removeprefix('sha256:')
destination = (ROOT / sys.argv[3]).resolve()
assert archive.is_relative_to(ROOT / '.cache/d08-r1')
assert destination.is_relative_to(ROOT) and destination.suffix == '.json'
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
assert digest == expected_digest, 'GitHub artifact digest mismatch'
with zipfile.ZipFile(archive) as bundle:
    def read_json(suffix):
        names = [name for name in bundle.namelist() if name.endswith(suffix)]
        assert len(names) == 1, f'Ambiguous or missing artifact entry: {suffix}'
        return json.loads(bundle.read(names[0]))
    environment = read_json('/rendering-environment.json')
    captures = read_json('/capture-states.json')
    result = read_json('d08-visual-results.json')
assert environment['profile']['name'] == 'edge-windows-software-v1'
assert environment['gpu']['featureStatus']['gpu_compositing'] == 'disabled_software'
assert environment['gpu']['featureStatus']['rasterization'] == 'disabled_software'
assert environment['client']['locale'] == 'en-US'
assert environment['client']['dpr'] == 1 and environment['client']['reducedMotion']
stats = result['stats']
assert stats['expected'] == 9 and stats['unexpected'] == stats['skipped'] == stats['flaky'] == 0
references = json.loads((HERE / 'reference-comparison.json').read_text(encoding='utf-8'))['references']
proposals = {item['file']: item['proposal_sha256'] for item in references}
assert len(captures) == 64 and {c['file'] for c in captures} == set(proposals)
assert all(isinstance(c['sha256'], str) and len(c['sha256']) == 64 for c in captures)
identical = [c['file'] for c in captures if c['sha256'] == proposals[c['file']]]
architecture = next(c for c in captures if c['file'] == 'architecture-write-1440.png')
assert architecture['renderingState']['graph']['step'] == '17'
assert architecture['renderingState']['graph']['mode'] == 'write'
assert architecture['renderingState']['graph']['runningAnimations'] == 0
proof = {
    'artifact_bytes': archive.stat().st_size, 'artifact_sha256': digest,
    'environment': environment, 'visual_stats': stats,
    'byte_identical_to_proposal': len(identical), 'total_images': len(captures),
    'write_1440_matches_original_ci_bytes': architecture['sha256'] == 'c3ba27ba2c8dd973db35eb9d4ebe1b4e9de76b3e4c4f8e56de36949bd910ca51',
    'architecture_write_1440': architecture, 'captures': captures,
    'note': 'Actual GitHub artifact bytes; unchanged maxDiffPixels100/threshold0.1. Hash equality is diagnostic, not an added acceptance tolerance.',
}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'GitHub ZIP digest verified: {digest}; Edge {environment["browserVersion"]}; software GPU/raster confirmed.')
print(f'Visual 9 passed, 0 unexpected/skipped/flaky; {len(identical)}/64 actual PNGs byte-identical to software proposals.')
print(f'Architecture Write1440 exact original CI bytes: {proof["write_1440_matches_original_ci_bytes"]}.')
