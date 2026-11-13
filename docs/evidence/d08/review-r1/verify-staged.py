"""Read-only R1 staging guard; no network, Git mutation, or private data output."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
EXPECTED = 'feature/issue-15-taste-gsap-polish'
BASE = '8625597393d1d467b90ae83630fd280177d5b590'
ALLOWED = {
    'apps/web/src/ArchitectureLab.tsx', 'apps/web/src/ArchitectureLab.test.tsx',
    'apps/web/src/App.test.tsx',
    '.github/workflows/ci.yml', 'README.md', 'docs/architecture/d08-performance.md',
    'docs/design/d08-visual-audit.md', 'docs/evidence/d08/REPORT.md', 'package.json',
    'playwright.visual.config.ts', 'scripts/check.ps1', 'tsconfig.visual.json',
    'tests/visual/audit.spec.ts', 'tests/visual/config.spec.ts',
    'tests/visual/rendering.ts', 'tests/visual/rendering.spec.ts',
}
ALLOWED.update(f'apps/api/tests/test_real_{name}.py' for name in (
    'embeddings', 'guided', 'rag', 'search', 'vector_store'))
ALLOWED.update(f'tests/e2e/{name}.spec.ts' for name in (
    'documents', 'embeddings', 'foundation', 'guided', 'rag', 'search', 'vector-store'))


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode('utf-8').strip()


assert git('branch', '--show-current') == EXPECTED
assert git('config', '--local', 'pinecone.issue') == '15'
assert git('config', '--local', 'pinecone.branch') == EXPECTED
assert git('config', '--local', 'push.default') == 'nothing'
assert git('config', '--local', 'core.hooksPath') == '.githooks'
assert git('remote', 'get-url', '--push', 'origin') == 'https://github.com/iamqthanq/pinecone-visual-lab'
subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, 'HEAD'], cwd=ROOT, check=True)
paths = [name for name in git('diff', '--cached', '--name-only', '-z').split('\0') if name]
assert paths
assert all(p in ALLOWED or p.startswith('docs/evidence/d08/review-r1/') for p in paths), 'Unexpected staged scope'
assert not git('diff', '--cached', '--diff-filter=D', '--name-only'), 'R1 cannot delete files'
for name in paths:
    path = ROOT / name
    assert path.is_file() and not path.is_symlink(), name
    assert path.stat().st_size <= 5 * 1024 * 1024, f'Oversized artifact: {name}'
    if name.startswith('docs/evidence/d08/review-r1/'):
        assert path.suffix in {'.md', '.json', '.jsonl', '.png', '.py', '.txt', '.log'}, name
subprocess.run(['git', 'diff', '--cached', '--check'], cwd=ROOT, check=True)
subprocess.run([str(ROOT / '.venv/Scripts/python.exe'), 'scripts/verify_repository.py'], cwd=ROOT, check=True)
print(f'{len(paths)} staged R1 files; exact branch/Issue/remote/hooks verified; no deletion or oversized/private artifacts.')
print('Safe push remains the existing explicit-refspec script; main and historical evidence are outside this staging scope.')
