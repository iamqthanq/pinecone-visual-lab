"""Check unchanged third-party lock records and locally reviewed pinned skill texts."""

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
base = json.loads(subprocess.check_output(["git", "show", "origin/main:package-lock.json"], cwd=ROOT))
current = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
original = {k: v for k, v in base["packages"].items() if k not in ("", "apps/web")}
updated = {k: v for k, v in current["packages"].items() if k not in ("", "apps/web")}
assert original == updated, "Unexpected third-party package/version/integrity change"
sources = []
for path in sorted((ROOT / ".cache/d08-skill-review").glob("*.md")):
    assert path.stat().st_size > 1000
    sources.append({"file": path.name, "bytes": path.stat().st_size,
                    "sha256_local_review_copy": hashlib.sha256(path.read_bytes()).hexdigest()})
assert len(sources) == 9
packages = {}
for name in ("gsap", "@xyflow/react", "@fontsource-variable/manrope", "@fontsource/ibm-plex-mono"):
    data = json.loads((ROOT / "node_modules" / name / "package.json").read_text(encoding="utf-8"))
    packages[name] = {"version": data["version"], "license": data.get("license"),
                      "integrity": current["packages"]["node_modules/" + name]["integrity"]}
report = {"unchanged_third_party_lock_records": len(original), "packages": packages,
          "taste": {"repository": "https://github.com/Leonxlnx/taste-skill", "revision": "f6b76575f949707b4e3c37cd86cb44b0b98643e8", "skill": "design-taste-frontend", "license": "MIT", "upstream_gate": "NOT RUN; project-specific source-guided adaptation"},
          "gsap_skills": {"repository": "https://github.com/greensock/gsap-skills", "revision": "aed9cfd3277740755f6bfc1155c7aa645403b760", "license": "MIT"},
          "gsap_runtime": "Separate standard no-charge GSAP license; not MIT; core only; no animation-authoring tool or paid plugin",
          "execution": "No third-party installer/start/gate/script/global agent configuration changes; written guidance only",
          "reviewed_sources": sources}
(Path(__file__).parent / "dependency-license-manifest.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(f"All {len(original)} third-party package-lock records unchanged. Nine pinned source review copies hashed.")
print(json.dumps(packages, indent=2))
