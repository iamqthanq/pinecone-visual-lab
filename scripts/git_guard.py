"""Shared fail-closed policy for the Windows push script and Git pre-push hook."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

REMOTES = {
    "https://github.com/iamqthanq/pinecone-visual-lab",
    "https://github.com/iamqthanq/pinecone-visual-lab.git",
    "git@github.com:iamqthanq/pinecone-visual-lab.git",
}


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], capture_output=True, text=True, encoding="utf-8", check=False
    )
    if result.returncode:
        raise ValueError(f"git {' '.join(args)} failed")
    return result.stdout.strip()


def validate(remote: str | None = None, url: str | None = None,
             updates: str | None = None) -> str:
    root = Path(git("rev-parse", "--show-toplevel")).resolve()
    configured = Path(git("config", "--local", "--get", "pinecone.workdir")).resolve()
    if os.path.normcase(str(root)) != os.path.normcase(str(configured)):
        raise ValueError("Checkout does not match explicitly configured workdir")
    if Path.cwd().resolve() != root:
        raise ValueError("Run push from the repository root")
    issue = git("config", "--local", "--get", "pinecone.issue")
    branch = git("config", "--local", "--get", "pinecone.branch")
    if not re.fullmatch(r"[1-9][0-9]*", issue):
        raise ValueError("Missing/invalid active Issue")
    if not re.fullmatch(rf"feature/issue-{issue}-[a-z0-9]+(?:-[a-z0-9]+)*", branch):
        raise ValueError("Expected branch does not belong to the active Issue")
    if git("symbolic-ref", "--quiet", "--short", "HEAD") != branch:
        raise ValueError("Current branch differs from the assigned Issue branch")
    head = git("rev-parse", "--verify", "HEAD")
    fetch_urls = git("remote", "get-url", "--all", "origin").splitlines()
    push_urls = git("remote", "get-url", "--push", "--all", "origin").splitlines()
    if len(fetch_urls) != 1 or fetch_urls[0] not in REMOTES:
        raise ValueError("Wrong origin fetch URL")
    if len(push_urls) != 1 or push_urls[0] not in REMOTES:
        raise ValueError("Wrong or multiple origin push URLs")
    if git("config", "--local", "--get", "core.hooksPath") != ".githooks":
        raise ValueError("Expected hooks are not active")
    if git("config", "--local", "--get", "push.default") != "nothing":
        raise ValueError("push.default must be nothing")
    ref = f"refs/heads/{branch}"
    if updates is not None:
        if remote != "origin" or url != push_urls[0]:
            raise ValueError("Only the verified origin is permitted")
        lines = [line.split() for line in updates.splitlines() if line.strip()]
        if len(lines) != 1 or len(lines[0]) != 4:
            raise ValueError("Exactly one valid branch update is required")
        source, local_sha, destination, remote_sha = lines[0]
        if source != ref or destination != ref or local_sha != head:
            raise ValueError("Only matching assigned branch refs at HEAD are permitted")
        if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", remote_sha):
            raise ValueError("Invalid remote object ID")
        if set(remote_sha) != {"0"}:
            result = subprocess.run(
                ["git", "merge-base", "--is-ancestor", remote_sha, head], check=False
            )
            if result.returncode:
                raise ValueError("Non-fast-forward or unverifiable remote update rejected")
    return ref


def main() -> int:
    try:
        if sys.argv[1:] == ["check"]:
            print(validate())
        elif len(sys.argv) == 4 and sys.argv[1] == "pre-push":
            validate(sys.argv[2], sys.argv[3], sys.stdin.read())
        else:
            raise ValueError("Unsupported guard invocation")
        return 0
    except (ValueError, OSError) as error:
        print(f"PUSH BLOCKED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
