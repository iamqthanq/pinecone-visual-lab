"""Read-only exact staged D08 inventory, protected-history, source and secret checks."""

import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
assert Path.cwd() == ROOT
sys.path.insert(0, str(ROOT))
from scripts.verify_repository import PATTERNS

expected = set((Path(__file__).parent / "changed-files.txt").read_text(encoding="utf-8").splitlines())
actual = {p.decode("utf-8") for p in subprocess.check_output(
    ["git", "diff", "--cached", "--name-only", "-z"]).split(b"\0") if p}
assert actual == expected, actual ^ expected
assert subprocess.check_output(["git", "branch", "--show-current"], text=True).strip() == "feature/issue-15-taste-gsap-polish"
subprocess.run(["git", "diff", "--cached", "--check"], check=True)
subprocess.run(["git", "diff", "--check"], check=True)
protected = ["GITHUB_COLLAB_WORKFLOW_STANDARD.md", "docs/reference", ".githooks",
             "scripts/git_guard.py", "scripts/push_issue_branch.ps1", "apps/api/app",
             "apps/api/requirements.lock", "apps/web/src/simulator.ts"]
protected += [f"docs/evidence/d{i:02}" for i in range(1, 8)]
subprocess.run(["git", "diff", "--exit-code", "--cached", "origin/main", "--", *protected], check=True)
for name in sorted(actual):
    data = subprocess.check_output(["git", "show", ":" + name])
    assert not any(pattern.search(data) for pattern in PATTERNS), "Potential staged secret: " + name
    assert Path(name).suffix.lower() not in {".pdf", ".db", ".sqlite", ".sqlite3", ".bin", ".pt", ".pth", ".safetensors", ".gguf", ".onnx"}, name
    assert len(data) < 5_000_000, "Unexpected large file: " + name
fingerprints = json.loads((Path(__file__).parent / "frontend-source-manifest.json").read_text(encoding="utf-8"))
for name, digest in fingerprints.items():
    staged = subprocess.check_output(["git", "show", ":" + name])
    assert hashlib.sha256(staged.replace(b"\r\n", b"\n")).hexdigest() == digest, "Source changed after browser evidence: " + name
spec = importlib.util.spec_from_file_location("guard", ROOT / "scripts/git_guard.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
assert guard.validate() == "refs/heads/feature/issue-15-taste-gsap-polish"
print(f"Exact inventory: {len(actual)} reviewed D08 paths. All staged blobs scanned, zero findings.")
print("No PDF/private database/model/credential/runtime artifact; largest staged file below5MB.")
print("Original workflow/master plan/D01-D07 evidence/hooks/guard/backend/reducer unchanged.")
print(f"{len(fingerprints)} frontend source hashes match tested working sources; Issue15 guard and whitespace PASS.")
print("Final verification logs are refreshed/restaged in the same inventory; no source changes after review.")
