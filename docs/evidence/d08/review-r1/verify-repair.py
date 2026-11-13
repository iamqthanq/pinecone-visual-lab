"""Validate R1's fixed profile, historical preservation and actual local gate evidence."""

import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
BASE = '8625597393d1d467b90ae83630fd280177d5b590'


def blob(name):
    return subprocess.check_output(['git', 'show', f'{BASE}:{name}'], cwd=ROOT)


def main():
    protected = ['apps/api/app', 'apps/api/requirements.lock', 'package-lock.json',
                 '.githooks', 'scripts/git_guard.py', 'scripts/push_issue_branch.ps1',
                 'GITHUB_COLLAB_WORKFLOW_STANDARD.md', 'docs/reference',
                 'docs/evidence/d08/before', 'docs/evidence/d08/after', 'docs/evidence/d08/regression']
    protected += [f'docs/evidence/d{i:02}' for i in range(1, 8)]
    subprocess.run(['git', 'diff', '--exit-code', BASE, '--', *protected], cwd=ROOT, check=True)
    web_changes = subprocess.check_output(['git', 'diff', '--name-only', BASE, '--', 'apps/web/src'], cwd=ROOT).decode().splitlines()
    assert set(web_changes) == {'apps/web/src/ArchitectureLab.tsx', 'apps/web/src/ArchitectureLab.test.tsx', 'apps/web/src/App.test.tsx'}
    source = blob('apps/web/src/ArchitectureLab.tsx').decode('utf-8')
    expected = source.replace('      const focus = graphArea.current!.clientWidth',
                              '      const area = graphArea.current\n      if (!area) return // A queued resize can arrive after route unmount clears the ref.\n      const focus = area.clientWidth')
    assert (ROOT / 'apps/web/src/ArchitectureLab.tsx').read_text(encoding='utf-8') == expected
    original_navigation = blob('apps/web/src/App.test.tsx').decode('utf-8')
    expected_navigation = original_navigation.replace(
        "    expect(await screen.findByRole('heading', { name: 'Follow a write. Unpack a read.' })).toBeInTheDocument()",
        "    // This route cold-loads React Flow/GSAP; wait for the actual heading, not a 1s import budget.\n"
        "    expect(await screen.findByRole('heading', { name: 'Follow a write. Unpack a read.' }, { timeout: 5000 })).toBeInTheDocument()",
    ).replace("    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()\n  })",
              "    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()\n  }, 10000)")
    assert (ROOT / 'apps/web/src/App.test.tsx').read_text(encoding='utf-8') == expected_navigation
    tests = list((ROOT / 'tests/e2e').glob('*.ts')) + list((ROOT / 'apps/api/tests').glob('test_real_*.py'))
    for path in tests:
        original = blob(path.relative_to(ROOT).as_posix()).decode('utf-8')
        current = path.read_text(encoding='utf-8').replace('docs/evidence/d08/review-r1/regression', 'docs/evidence/d08/regression')
        assert current == original, f'Functional assertions changed: {path.name}'
    print(f'{len(tests)} functional test files preserve every original assertion; only evidence destinations differ.')
    old_manifest = json.loads(blob('docs/evidence/d08/visual-reference-manifest.json'))
    comparisons = json.loads((HERE / 'reference-comparison.json').read_text(encoding='utf-8'))
    references = comparisons['references']
    assert {r['file'] for r in references} == {r['file'] for r in old_manifest['references']}
    for item in references:
        candidate = HERE / 'software-references' / item['file']
        assert hashlib.sha256(candidate.read_bytes()).hexdigest() == item['proposal_sha256']
    assert comparisons['acceptance'] == {'maxDiffPixels': 100, 'threshold': 0.1, 'updateSnapshots': 'none'}
    state = json.loads((ROOT / '.cache/d08-visual-verify/fixture/manifest.json').read_text(encoding='utf-8'))
    assert state['environment']['gpu']['featureStatus']['gpu_compositing'] == 'disabled_software'
    assert state['environment']['gpu']['featureStatus']['rasterization'] == 'disabled_software'
    assert len([c for c in state['captures'] if 'file' in c]) == 64
    assert len(state['captures']) == 80 and len(state['accessibility']) == 32
    assert not any(c['overflow'] for c in state['captures'])
    assert not any(v['impact'] in ('serious', 'critical') for scan in state['accessibility'] for v in scan['violations'])
    print('64 exact original state names retained; proposed reference hashes/profile/axe/five-width overflow verified.')
    capture_files = list((ROOT / 'test-results/d08-visual').glob('*/capture-states.json'))
    assert len(capture_files) == 1
    captures = json.loads(capture_files[0].read_text(encoding='utf-8'))
    assert len(captures) == 64
    proposed = {item['file']: item['proposal_sha256'] for item in references}
    identical = 0
    for capture in captures:
        actual = ROOT / '.cache/d08-visual-verify/fixture' / capture['file']
        assert hashlib.sha256(actual.read_bytes()).hexdigest() == capture['sha256']
        identical += capture['sha256'] == proposed[capture['file']]
    print(f'{identical}/64 actual local PNG hashes equal software proposals byte for byte (diagnostic; tolerance unchanged).')
    architecture = next(c for c in captures if c['file'] == 'architecture-write-1440.png')
    assert architecture['sha256'] == 'c3ba27ba2c8dd973db35eb9d4ebe1b4e9de76b3e4c4f8e56de36949bd910ca51'
    assets = json.loads((HERE / 'bundle-after-lifecycle.json').read_text(encoding='utf-8'))['assets']
    for asset in assets:
        assert hashlib.sha256((ROOT / 'apps/web/dist/assets' / asset['file']).read_bytes()).hexdigest() == asset['sha256']
    print(f'{len(assets)} current production assets verified; sole product change is the queued resize null guard (no layout change).')
    counts = {'real-e5-tests.txt': '6 passed', 'edge-fixture.txt': '20 passed',
              'edge-real-e5.txt': '20 passed', 'visual-final.txt': '9 passed',
              'full-check.txt': '220 passed', 'harness-typecheck.txt': 'EXIT_CODE: 0'}
    for name, marker in counts.items():
        text = (HERE / name).read_text(encoding='utf-8')
        assert marker in text and 'EXIT_CODE: 0' in text, f'Gate not verified: {name}'
    assert '77 passed' in (HERE / 'full-check.txt').read_text(encoding='utf-8')
    print('Full quality, real E5, fixture/real Edge and 9 visual cases have actual completed exit 0 logs.')
    print('Independent visual approval pending; GitHub CI is reported separately, never inferred from local PASS.')


if __name__ == '__main__':
    main()
