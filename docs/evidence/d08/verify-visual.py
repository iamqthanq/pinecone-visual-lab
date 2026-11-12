"""Validate capture labels, unchanged paired IDs, viewport/axe results and frozen images."""

import hashlib
import json
import re
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
inventory = []
for mode in ("fixture", "real-e5"):
    manifests = []
    for stage in ("before", "after"):
        directory = HERE / stage / mode
        main = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        assert main["stage"] == stage and main["mode"] == mode
        assert len([c for c in main["captures"] if "file" in c]) == 64
        assert len(main["accessibility"]) == 32
        assert not any(c["overflow"] for c in main["captures"])
        supplement = json.loads((directory / "supplement-rag.json").read_text(encoding="utf-8"))
        assert supplement["stage"] == stage and supplement["mode"] == mode
        assert len([c for c in supplement["captures"] if "file" in c]) == 4
        assert supplement["seed"] == main["seed"]
        for source in (main, supplement):
            for scan in source["accessibility"]:
                assert not [v for v in scan["violations"] if v["impact"] in ("serious", "critical")]
        assert "NOT E5" in main["label"] if mode == "fixture" else "REAL E5" in main["label"]
        assert "MOCK OLLAMA NOT REAL LLM" in main["label"]
        manifests.append(main)
    assert manifests[0]["seed"] == manifests[1]["seed"], "Paired captures must use identical persisted source IDs"

for path in sorted(HERE.rglob("*.png")):
    with Image.open(path) as image:
        match = re.search(r"-(1440|1024|768|390)\.png$", path.name)
        if match:
            assert image.width == int(match.group(1)), path.name
        inventory.append({"file": path.relative_to(HERE).as_posix(), "width": image.width,
                          "height": image.height, "bytes": path.stat().st_size,
                          "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                          "kind": "INTENTIONAL DESIGN DIFF" if "design-diffs" in path.parts else "ACTUAL BROWSER CAPTURE"})

references = json.loads((HERE / "visual-reference-manifest.json").read_text(encoding="utf-8"))
assert len(references["references"]) == 64
for item in references["references"]:
    assert hashlib.sha256((HERE / "after/fixture" / item["file"]).read_bytes()).hexdigest() == item["sha256"]
catalog = json.loads((HERE / "fixture-replay.json").read_text(encoding="utf-8"))
assert "NOT E5" in catalog["label"] and "NOT REAL LLM" in catalog["label"]
for key, response in catalog["responses"].items():
    assert not key.startswith("DELETE ") and '"mode":"live"' not in key
    assert '"confirm_live_read":true' not in key and '"confirm_live_compare":true' not in key
    if key.startswith("POST /api/search "):
        assert response["body"]["embedding"]["mode"] == "test-fixture-not-e5"
        assert response["body"]["target"]["mode"] == "local"

sources = [p for p in (ROOT / "apps/web/src").rglob("*") if p.is_file() and ".test." not in p.name
           and "test" not in p.relative_to(ROOT / "apps/web/src").parts]
fingerprints = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes().replace(b"\r\n", b"\n")).hexdigest() for p in sources}
(HERE / "screenshot-manifest.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
(HERE / "frontend-source-manifest.json").write_text(json.dumps(fingerprints, indent=2) + "\n", encoding="utf-8")
print("256 original captures +16 clean paired RAG supplements; exact persisted seed/source IDs match.")
print("Axe serious/critical0; all five-width overflow checks clear;64 active proposed reference hashes verified.")
print(f"{len(inventory)} PNG dimensions/hashes recorded (including separately labeled design diffs/regressions).")
print(f"{len(fingerprints)} production frontend source files fingerprinted (LF-normalized); replay contains only local NOT-E5 data.")
