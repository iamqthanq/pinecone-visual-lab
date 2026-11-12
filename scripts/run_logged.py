"""Run a requested local check once, recording its real command, output, and exit code."""

import os
import subprocess
import sys
import time
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    if len(sys.argv) < 3:
        raise SystemExit("Usage: run_logged.py <workspace-log-path> <command> [args...]")
    destination = (root / sys.argv[1]).resolve()
    if not destination.is_relative_to(root):
        raise SystemExit("Log destination must stay inside the workspace")
    command = sys.argv[2:]
    environment = dict(os.environ, PYTHONIOENCODING="utf-8", NO_COLOR="1")
    environment.pop("FORCE_COLOR", None)
    started = time.monotonic()
    result = subprocess.run(
        command, cwd=root, env=environment, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, check=False,
    )
    report = (
        f"COMMAND: {subprocess.list2cmdline(command)}\n"
        + result.stdout.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "")
        + f"\nEXIT_CODE: {result.returncode}\nELAPSED_SECONDS: {time.monotonic() - started:.2f}\n"
    )
    report = '\n'.join(line.rstrip() for line in report.splitlines()) + '\n'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(report, encoding="utf-8", newline="\n")
    sys.stdout.reconfigure(encoding="utf-8")
    print(report)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
