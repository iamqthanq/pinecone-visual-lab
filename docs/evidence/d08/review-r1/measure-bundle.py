"""Record actual production asset bytes/gzip/graph; never changes build thresholds."""

import argparse
import gzip
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("label", choices=["before", "after"])
parser.add_argument("directory")
args = parser.parse_args()
root = Path(__file__).resolve().parents[4]
build = (root / args.directory).resolve()
if not build.is_relative_to(root):
    raise SystemExit("Workspace build directory required")
html = (build / "index.html").read_text(encoding="utf-8")
assets = []
for path in sorted((build / "assets").iterdir()):
    if path.is_file() and path.suffix in (".js", ".css"):
        data = path.read_bytes()
        assets.append({"file": path.name, "bytes": len(data),
                       "gzip_bytes": len(gzip.compress(data, mtime=0)),
                       "sha256": hashlib.sha256(data).hexdigest()})
entry = re.search(r'<script[^>]*src="/assets/([^\"]+)"', html).group(1)
manifest = build / ".vite/manifest.json"
graph = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else None
report = {"label": args.label, "command": "npm.cmd run build", "entry": entry, "assets": assets,
          "total_js_bytes": sum(a["bytes"] for a in assets if a["file"].endswith(".js")),
          "total_js_gzip_bytes": sum(a["gzip_bytes"] for a in assets if a["file"].endswith(".js")),
          "source_maps": [str(p.relative_to(build)) for p in build.rglob("*.map")],
          "manifest": graph,
          "gzip_note": "gzip estimate of emitted bytes; local preview serves uncompressed HTTP"}
output = Path(__file__).parent / "bundle-after-lifecycle.json"
output.parent.mkdir(parents=True, exist_ok=True)
if args.label == "before" and output.exists():
    assert json.loads(output.read_text(encoding="utf-8")) == report, "Refuse replacing original baseline"
else:
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"entry": entry, "total_js_bytes": report["total_js_bytes"], "chunks": len(assets)}))
