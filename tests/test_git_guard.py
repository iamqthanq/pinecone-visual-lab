"""Policy tests use disposable local Git repositories; no network pushes."""

import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("guard", ROOT / "scripts/git_guard.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
URL = "https://github.com/iamqthanq/pinecone-visual-lab"
BRANCH = "feature/issue-1-foundation"
REF = f"refs/heads/{BRANCH}"
ZERO = "0" * 40


class GitGuardTests(unittest.TestCase):
    def setUp(self):
        self.previous = Path.cwd()
        self.directory = tempfile.TemporaryDirectory(prefix="pvl-guard-")
        self.repo = Path(self.directory.name)
        os.chdir(self.repo)
        self.run_git("init", "-q", "-b", BRANCH)
        self.run_git("config", "user.name", "Policy Fixture")
        self.run_git("config", "user.email", "fixture@example.invalid")
        self.run_git("remote", "add", "origin", URL)
        for key, value in {
            "pinecone.issue": "1", "pinecone.branch": BRANCH,
            "pinecone.workdir": str(self.repo), "push.default": "nothing",
            "core.hooksPath": ".githooks",
        }.items():
            self.run_git("config", "--local", key, value)
        self.run_git("commit", "-q", "--allow-empty", "-m", "fixture")
        self.sha = self.run_git("rev-parse", "HEAD")
        (self.repo / "scripts").mkdir()
        (self.repo / ".githooks").mkdir()
        for name in ("git_guard.py", "push_issue_branch.ps1"):
            shutil.copyfile(ROOT / "scripts" / name, self.repo / "scripts" / name)
        shutil.copyfile(ROOT / ".githooks/pre-push", self.repo / ".githooks/pre-push")

    def tearDown(self):
        os.chdir(self.previous)
        # Windows git marks objects read-only; this only cleans the verified temp fixture.
        def writable_remove(function, path, _):
            os.chmod(path, 0o700)
            function(path)
        self.assertEqual(self.repo.parent.resolve(), Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.repo.name.startswith("pvl-guard-"))
        shutil.rmtree(self.repo, onerror=writable_remove)
        self.directory.cleanup()

    def run_git(self, *args):
        return subprocess.check_output(["git", *args], text=True, encoding="utf-8").strip()

    def line(self, source=REF, destination=REF, sha=None, remote_sha=ZERO):
        return f"{source} {sha or self.sha} {destination} {remote_sha}\n"

    def test_positive_new_branch_and_fast_forward(self):
        self.assertEqual(guard.validate(), REF)
        self.assertEqual(guard.validate("origin", URL, self.line()), REF)
        self.run_git("commit", "-q", "--allow-empty", "-m", "next")
        old = self.sha
        self.sha = self.run_git("rev-parse", "HEAD")
        self.assertEqual(guard.validate("origin", URL, self.line(remote_sha=old)), REF)

    def test_d02_assignment_allows_issue_three_and_rejects_old_issue_one_ref(self):
        branch = 'feature/issue-3-document-chunking'
        self.run_git('switch', '-q', '-c', branch)
        self.run_git('config', 'pinecone.issue', '3')
        self.run_git('config', 'pinecone.branch', branch)
        ref = f'refs/heads/{branch}'
        self.assertEqual(guard.validate('origin', URL, self.line(source=ref, destination=ref)), ref)
        with self.assertRaises(ValueError):
            guard.validate('origin', URL, self.line())

    def test_d03_assignment_allows_issue_five_and_rejects_old_assignments(self):
        branch = 'feature/issue-5-local-embeddings'
        self.run_git('switch', '-q', '-c', branch)
        self.run_git('config', 'pinecone.issue', '5')
        self.run_git('config', 'pinecone.branch', branch)
        ref = f'refs/heads/{branch}'
        self.assertEqual(guard.validate('origin', URL, self.line(source=ref, destination=ref)), ref)
        for old in [REF, 'refs/heads/feature/issue-3-document-chunking']:
            with self.assertRaises(ValueError):
                guard.validate('origin', URL, self.line(source=old, destination=old))

    def test_d04_assignment_allows_issue_seven_and_rejects_prior_assignments(self):
        branch = "feature/issue-7-pinecone-vector-store"
        self.run_git("switch", "-q", "-c", branch)
        self.run_git("config", "pinecone.issue", "7")
        self.run_git("config", "pinecone.branch", branch)
        ref = f"refs/heads/{branch}"
        self.assertEqual(
            guard.validate("origin", URL, self.line(source=ref, destination=ref)), ref
        )
        for old in [
            REF,
            "refs/heads/feature/issue-3-document-chunking",
            "refs/heads/feature/issue-5-local-embeddings",
        ]:
            with self.assertRaises(ValueError):
                guard.validate("origin", URL, self.line(source=old, destination=old))

    def test_d05_assignment_requires_issue_nine_and_rejects_prior_issue_refs(self):
        branch = 'feature/issue-9-semantic-search'
        self.run_git('switch', '-q', '-c', branch)
        self.run_git('config', 'pinecone.issue', '9')
        self.run_git('config', 'pinecone.branch', branch)
        ref = f'refs/heads/{branch}'
        self.assertEqual(guard.validate('origin', URL, self.line(source=ref, destination=ref)), ref)
        for old in [REF, 'refs/heads/feature/issue-3-document-chunking',
                    'refs/heads/feature/issue-5-local-embeddings',
                    'refs/heads/feature/issue-7-pinecone-vector-store']:
            with self.assertRaises(ValueError):
                guard.validate('origin', URL, self.line(source=old, destination=old))

    def test_wrong_refs_tags_deletion_multiple_and_sha(self):
        cases = [
            self.line(destination="refs/heads/main"),
            self.line(source="refs/heads/main"),
            self.line(source="refs/tags/v1", destination="refs/tags/v1"),
            self.line(source="(delete)", sha=ZERO),
            self.line(destination="refs/heads/feature/issue-2-other"),
            self.line(sha="f" * 40), self.line() + self.line(), "", "bad line",
            self.line(remote_sha="not-an-object"),
        ]
        for update in cases:
            with self.subTest(update=update), self.assertRaises(ValueError):
                guard.validate("origin", URL, update)

    def test_wrong_remote_name_url_and_push_urls(self):
        for remote, url in [("elsewhere", URL), ("origin", "https://example.invalid/repo")]:
            with self.subTest(remote=remote, url=url), self.assertRaises(ValueError):
                guard.validate(remote, url, self.line())
        self.run_git("remote", "set-url", "--push", "origin", "https://example.invalid/repo")
        with self.assertRaises(ValueError):
            guard.validate()

    def test_wrong_active_issue_and_main_and_detached(self):
        self.run_git("config", "pinecone.issue", "2")
        with self.assertRaises(ValueError):
            guard.validate()
        self.run_git("config", "pinecone.issue", "1")
        self.run_git("switch", "-q", "-c", "main")
        with self.assertRaises(ValueError):
            guard.validate()
        self.run_git("switch", "-q", "--detach")
        with self.assertRaises(ValueError):
            guard.validate()

    def test_disabled_hooks_and_wrong_workdir(self):
        self.run_git("config", "core.hooksPath", "other")
        with self.assertRaises(ValueError):
            guard.validate()
        self.run_git("config", "core.hooksPath", ".githooks")
        self.run_git("config", "pinecone.workdir", str(self.repo / "elsewhere"))
        with self.assertRaises(ValueError):
            guard.validate()

    def test_d06_assignment_requires_issue_eleven_and_rejects_prior_refs(self):
        branch = 'feature/issue-11-local-rag-chat'
        self.run_git('switch', '-q', '-c', branch)
        self.run_git('config', 'pinecone.issue', '11')
        self.run_git('config', 'pinecone.branch', branch)
        ref = f'refs/heads/{branch}'
        sha = self.run_git('rev-parse', 'HEAD')
        self.assertEqual(guard.validate('origin', URL, f'{ref} {sha} {ref} {ZERO}\n'), ref)
        for old in ['feature/issue-1-foundation', 'feature/issue-3-document-chunking',
                    'feature/issue-5-local-embeddings', 'feature/issue-7-pinecone-vector-store',
                    'feature/issue-9-semantic-search']:
            with self.assertRaises(ValueError):
                guard.validate('origin', URL, f'{ref} {sha} refs/heads/{old} {ZERO}\n')

    def test_non_fast_forward(self):
        self.run_git("switch", "-q", "-c", "other")
        self.run_git("commit", "-q", "--allow-empty", "-m", "divergence")
        divergent = self.run_git("rev-parse", "HEAD")
        self.run_git("switch", "-q", BRANCH)
        with self.assertRaises(ValueError):
            guard.validate("origin", URL, self.line(remote_sha=divergent))

    def test_actual_git_hook_with_git_for_windows_shell(self):
        if sys.platform == "win32":
            shell = Path(shutil.which("git")).resolve().parents[1] / "bin/sh.exe"
        else:
            shell = shutil.which("sh")
        for update, expected in [(self.line(), 0), (self.line(destination="refs/heads/main"), 1),
                                 (self.line() + self.line(), 1),
                                 (self.line(source="(delete)", sha=ZERO), 1)]:
            result = subprocess.run(
                [str(shell), ".githooks/pre-push", "origin", URL],
                input=update, text=True, capture_output=True, check=False,
            )
            self.assertEqual(result.returncode, expected, result.stderr)

    @unittest.skipUnless(sys.platform == "win32", "Windows PowerShell entry point")
    def test_powershell_entry_point_without_network(self):
        # PowerShell function intercepts only push. Python policy still calls real Git.
        script = """
        $ErrorActionPreference = 'Stop'
        function git {
          if ($args[0] -ne 'push') { throw 'Unexpected git invocation' }
          $args | Set-Content -LiteralPath 'push-arguments.txt'
          $global:LASTEXITCODE = 0
        }
        & '.\\scripts\\push_issue_branch.ps1'
        """
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-Command", script],
            text=True, capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.repo / "push-arguments.txt").read_text().splitlines(),
                         ["push", "--set-upstream", "origin", f"{REF}:{REF}"])
        for flag in ("--force", "--no-verify", "--all", "refs/heads/main"):
            result = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "RemoteSigned",
                 "-File", "scripts/push_issue_branch.ps1", flag],
                text=True, capture_output=True, check=False,
            )
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
