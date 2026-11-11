"""Small repository-specific secret/artifact check, not a comprehensive security audit."""

import hashlib
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = [
    re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})"),
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"(?:pcsk_|sk-proj-)[A-Za-z0-9_-]{20,}"),
]


def main() -> int:
    output = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    )
    paths = {path.decode("utf-8") for path in output.split(b"\0") if path}
    failures = []
    workflow = ROOT / "GITHUB_COLLAB_WORKFLOW_STANDARD.md"
    expected_hash = "5cb214cb8cf499a83a480f1b244da5c274dd66c8fcc211db83ed246c82e20e78"
    if not workflow.is_file() or hashlib.sha256(workflow.read_bytes()).hexdigest() != expected_hash:
        failures.append("Authentic workflow SHA-256 mismatch")
    for name in paths:
        path = ROOT / name
        if not path.is_file():
            continue
        if path.suffix in {".pdf", ".gguf", ".safetensors", ".sqlite", ".db"}:
            failures.append(f"Forbidden data artifact: {name}")
        if path.name == ".env" or (path.name.startswith(".env.") and path.name != ".env.example"):
            failures.append(f"Environment secret file: {name}")
        if path.suffix not in {".png", ".jpg", ".woff2", ".ico"}:
            data = path.read_bytes()
            if any(pattern.search(data) for pattern in PATTERNS):
                failures.append(f"Potential secret: {name}")
    for failure in failures:
        print(failure)
    print(f"Checked {len(paths)} tracked/unignored paths; findings: {len(failures)}")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
