"""Use a new ignored test directory on every run; never alter shared user Temp/cache."""

import subprocess
import sys
from pathlib import Path
from uuid import uuid4

root = Path(__file__).resolve().parents[1]
run = root / ".cache" / "pytest" / uuid4().hex
run.mkdir(parents=True, exist_ok=False)
raise SystemExit(
    subprocess.call(
        [
            sys.executable,
            "-m",
            "pytest",
            "-c",
            "apps/api/pyproject.toml",
            "--basetemp",
            str(run / "temp"),
            "-o",
            f"cache_dir={run / 'cache'}",
            *sys.argv[1:],
        ],
        cwd=root,
    )
)
