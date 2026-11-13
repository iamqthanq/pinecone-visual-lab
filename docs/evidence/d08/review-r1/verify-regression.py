"""Read-only D08 R1 evidence/build inspection; never prints a secret or contacts a service."""

import hashlib
import json
import math
import os
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.verify_repository import PATTERNS

build = ROOT / "apps/web/dist"
assert (build / "index.html").is_file(), "Build first"
files = [p for p in build.rglob("*") if p.is_file()]
key = os.getenv("PINECONE_API_KEY", "").encode()
for path in files:
    data = path.read_bytes()
    if any(pattern.search(data) for pattern in PATTERNS) or key and key in data:
        raise SystemExit("Potential secret in build: " + str(path.relative_to(ROOT)))

evidence = Path(__file__).parent / "regression"
for filename, accessor in [
    ("real-local-stored-vector.json", lambda v: [v["adapter_record"]]),
    ("browser-stored-vector.json", lambda v: v["fetched"]["records"]),
    ("real-vector-sample.json", lambda v: [v["record"]]),
    ("browser-vector-sample.json", lambda v: v["records"]),
]:
    for record in accessor(json.loads((evidence / filename).read_text(encoding="utf-8"))):
        values = record["values"]
        assert len(values) == 384 and all(math.isfinite(v) for v in values), filename
        assert abs(math.hypot(*values) - 1) < 1e-5, filename
        assert record.get("mode", record.get("metadata", {}).get("embedding_mode")) == "e5"

lines = (evidence / "synthetic-confirmed.jsonl").read_text(encoding="utf-8").splitlines()
assert lines
for line in lines:
    chunk = json.loads(line)
    assert 0 < chunk["token_count"] <= chunk["chunk_size"]
    assert chunk["model_token_count"] <= 512 and chunk["page_start"] >= 1
print(f"Build secret scan: {len(files)} files, zero findings; no credential values printed.")
print(f"Four real E5 evidence samples validated: 384 finite unit values; JSONL {len(lines)} lines parse/budget PASS.")

for name,mode in [('real-search-example.json','e5'), ('browser-search-example.json','e5'), ('fixture-search-example.json','test-fixture-not-e5')]:
    sample=json.loads((evidence/name).read_text(encoding='utf-8'))
    response=sample['response']
    assert response['embedding']['mode']==mode
    assert response['embedding']['prefix']=='query: '
    assert response['embedding']['input_token_count']<=512
    assert all(-1 <= hit['score'] <= 1 for hit in response['hits'])
    assert all(stage['ms']>=0 and math.isfinite(stage['ms']) for stage in response['trace']['stages'])
    assert response['trace']['total_ms'] >= sum(stage['ms'] for stage in response['trace']['stages'])
print('Search request/response/trace samples: 2 real E5 + 1 explicit NOT E5 fixture PASS.')

for name,mode in [('real-e5-mock-ollama-example.json','e5'), ('browser-rag-example.json','e5'), ('fixture-rag-example.json','test-fixture-not-e5')]:
    sample=json.loads((evidence/name).read_text(encoding='utf-8'))
    response=sample['response']
    assert response['search']['embedding']['mode']==mode
    assert response['llm_model']['mode']=='mock-ollama-not-real-llm'
    assert response['llm_model']['usage']=={}
    assert response['status']=='answered'
    context=json.loads(response['assembled_context'])
    assert response['context_budget']['prompt_bytes']<=3072
    allowed={s['source_id']:s for s in context['sources']}
    for source in response['used_sources']:
        assert source['text']==allowed[source['source_id']]['text']
        assert source['text'] in source['hit']['text']
        assert source['hit']['version_id']==allowed[source['source_id']]['version_id']
        assert source['hit']['source_url'].startswith('/documents?')
    assert all(s['ms']>=0 and math.isfinite(s['ms']) for s in response['trace']['stages'])
    assert response['trace']['total_ms']>=sum(s['ms'] for s in response['trace']['stages'])
print('RAG samples: 2 real-E5 + 1 NOT-E5, all MOCK OLLAMA / NOT REAL LLM; context/citation/budget PASS.')

for name, mode in [('browser-guided-example.json', 'e5'),
                   ('fixture-guided-example.json', 'test-fixture-not-e5')]:
    sample = json.loads((evidence / name).read_text(encoding='utf-8'))
    entries = {item['action']: item for item in sample['entries']}
    confirmed = entries['confirm']['result']
    vector = entries['embedding']['result']['records'][0]
    fetched = entries['fetch']['result']['records'][0]
    assert vector['mode'] == fetched['metadata']['embedding_mode'] == mode
    assert vector['source_version_id'] == fetched['metadata']['version_id'] == confirmed['id']
    assert len(vector['values']) == len(fetched['values']) == 384
    assert abs(math.hypot(*vector['values']) - 1) < 1e-5
    response = entries['search']['result']
    assert response['embedding']['mode'] == mode and response['embedding']['prefix'] == 'query: '
    assert response['hits'] and response['hits'][0]['version_id'] == confirmed['id']
    assert entries['rag']['result']['status'] == 'search_only'
    assert entries['rag']['result']['answer'] is None
    assert entries['reset']['unrelated_preserved']
    assert not any(entries['reset']['session']['completed'].values())
    assert entries['fetch']['session']['target']['mode'] == 'local'
    assert entries['fetch']['session']['target']['namespace'].startswith('pvl-demo-')
print('Guided browser evidence: real-E5 and NOT-E5 separate; source, ACTIVE/fetch, search-only and safe reset PASS.')

sample = json.loads((evidence / 'real-guided-example.json').read_text(encoding='utf-8'))
assert sample['fetched']['result']['records'][0]['metadata']['embedding_mode'] == 'e5'
assert sample['search']['result']['embedding']['mode'] == 'e5'
assert sample['rag']['result']['status'] == 'search_only'
assert not any(sample['reset']['session']['completed'].values())

for mode in ('write', 'read', 'compaction'):
    sample = json.loads((evidence / f'simulator-{mode}.json').read_text(encoding='utf-8'))
    assert sample['label'] == 'SIMULATION / TOY 2D / NOT E5 / NOT PINECONE TELEMETRY'
    state = sample['snapshot']
    if mode == 'read':
        assert [r['id'] for r in state['top']] == ['c-7', 'a-7']
        assert math.isclose(state['top'][0]['score'], 1 / math.sqrt(2), abs_tol=1e-12)
        assert state['top'][1]['score'] == 0
    if mode == 'compaction':
        live_slabs = [s for s in state['slabs'] if s['id'] not in state['retired']]
        assert len(live_slabs) == 1 and live_slabs[0]['id'] == 'L2-1'
        assert next(r for r in live_slabs[0]['records'] if r['id'] == 'b-7')['values'] is None
print('Three simulator snapshots verified as TOY 2D; independent Top-K arithmetic and L2 tombstone checks PASS.')

screenshots = []
for path in sorted(evidence.glob('*.png')):
    raw = path.read_bytes()
    assert raw[:8] == b'\x89PNG\r\n\x1a\n'
    width, height = struct.unpack('>II', raw[16:24])
    if '1440' in path.name:
        assert width == 1440, path.name
    if '390' in path.name:
        assert width == 390, path.name
    screenshots.append(dict(file=path.name, width=width, height=height, bytes=len(raw),
                            sha256=hashlib.sha256(raw).hexdigest()))
(evidence / 'screenshot-manifest.json').write_text(
    json.dumps(screenshots, indent=2) + '\n', encoding='utf-8', newline='\n'
)
print(f'{len(screenshots)} actual PNG dimensions/checksums verified; named desktop1440/mobile390 widths PASS.')
