"""Read lockfile and installed license metadata only; no third-party script/network."""

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
base = json.loads(subprocess.check_output(
    ["git", "show", "53ba4924df3f58151c36f1455249de8e5f1bb9f8:package-lock.json"], cwd=ROOT
))
added = {}
for key, entry in lock["packages"].items():
    if key in base["packages"]:
        continue
    manifest_path = ROOT / key / "package.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert entry["version"] == manifest["version"]
    assert entry.get("integrity") and entry.get("resolved", "").startswith("https://registry.npmjs.org/")
    license_value = manifest.get("license", entry.get("license"))
    assert license_value in {"MIT", "ISC", "BSD-3-Clause"} or manifest["name"] == "gsap"
    added[key] = dict(name=manifest["name"], version=entry["version"], license=license_value,
                      resolved=entry["resolved"], integrity=entry["integrity"],
                      package_json_sha256=hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                      license_files={p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                     for p in manifest_path.parent.glob("*LICENSE*") if p.is_file()})
assert lock["packages"]["apps/web"]["dependencies"]["@xyflow/react"] == "12.12.1"
assert lock["packages"]["apps/web"]["dependencies"]["gsap"] == "3.15.1"
assert len(added) == 21
report = dict(
    comparison_base="53ba4924df3f58151c36f1455249de8e5f1bb9f8",
    installation="npm install --workspace apps/web --save-exact @xyflow/react@12.12.1 gsap@3.15.1 --ignore-scripts",
    packages=added,
    gsap_runtime_license=dict(url="https://gsap.com/community/standard-license/",
                              classification="Standard no-charge runtime license; not MIT",
                              scope="Fixed educational simulator, no animation-authoring builder or paid plugin"),
    skills=dict(repository="https://github.com/greensock/gsap-skills",
                revision="aed9cfd3277740755f6bfc1155c7aa645403b760", license="MIT",
                reviewed=["README", "gsap-core", "gsap-timeline", "gsap-react", "gsap-performance"],
                execution="Written guidance only; no upstream installer/script executed"),
)
(Path(__file__).parent / "dependency-license-manifest.json").write_text(
    json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n"
)
print(f"Lock/integrity/installed license metadata: {len(added)} added packages verified.")
print("React Flow MIT; GSAP standard no-charge license, distinct from MIT skill repository.")
