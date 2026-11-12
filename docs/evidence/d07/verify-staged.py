import importlib.util,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[3]
assert Path.cwd()==root,'Run from repository root'
sys.path.insert(0,str(root))
from scripts.verify_repository import PATTERNS
expected=set(Path('docs/evidence/d07/changed-files.txt').read_text(encoding='utf-8').splitlines())
actual={p.decode() for p in subprocess.check_output(['git','diff','--cached','--name-only','-z']).split(b'\0') if p}
assert actual==expected,(actual^expected)
assert subprocess.check_output(['git','branch','--show-current'],text=True).strip()=='feature/issue-13-slab-guided-demo'
subprocess.run(['git','diff','--cached','--check'],check=True)
subprocess.run(['git','diff','--check'],check=True)
subprocess.run(['git','diff','--exit-code','--cached','origin/main','--','GITHUB_COLLAB_WORKFLOW_STANDARD.md','docs/reference','docs/evidence/d01','docs/evidence/d02','docs/evidence/d03','docs/evidence/d04','docs/evidence/d05','docs/evidence/d06','.githooks','scripts/git_guard.py','scripts/push_issue_branch.ps1'],check=True)
for p in sorted(actual):
 data=subprocess.check_output(['git','show',':'+p])
 assert not any(pattern.search(data) for pattern in PATTERNS),'Potential secret in staged file: '+p
 assert Path(p).suffix.lower() not in {'.pdf','.db','.sqlite','.sqlite3','.bin','.pt','.pth','.safetensors','.gguf','.onnx'},p
spec=importlib.util.spec_from_file_location('guard',root/'scripts/git_guard.py')
guard=importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
assert guard.validate()=='refs/heads/feature/issue-13-slab-guided-demo'
print(f'Staged inventory exactly matches{len(actual)} reviewed D07 paths.')
print('All staged blobs scanned: zero secret-pattern findings; no PDF/database/model artifacts.')
print('Protected workflow/master plan/D01-D06 evidence/hook/guard implementation unchanged.')
print('Active Issue13/exact source-destination feature ref guard PASS; both diff whitespace checks PASS.')
print('Final publication logs are refreshed/staged after this read-only review; no implementation changes.')
