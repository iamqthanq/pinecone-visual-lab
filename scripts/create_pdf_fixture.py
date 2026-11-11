"""Create a non-sensitive Vietnamese multi-page PDF for browser tests only."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
sys.path.insert(0, str(ROOT / "apps/api/tests"))
from conftest import make_pdf

target = ROOT / ".cache/e2e-fixtures/vietnamese.pdf"
target.parent.mkdir(parents=True, exist_ok=True)
paragraph = "Cơ sở dữ liệu vector lưu biểu diễn ngữ nghĩa."
target.write_bytes(
    make_pdf(["\n".join([f"Trang {number}", *([paragraph] * 32)]) for number in (1, 2)])
)
print(target)
