"""Read-only D05 evidence/build inspection; never prints a secret or contacts a service."""

import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
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

evidence = Path(__file__).parent
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
