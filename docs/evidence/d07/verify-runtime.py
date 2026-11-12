"""Read-only pinned runtime/model verification and machine resource inventory; no Ollama call."""

import ctypes
import hashlib
import json
import platform
import shutil
import sys
from datetime import UTC, datetime
from importlib.metadata import metadata, version
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/api"))
from app.embedding_assets import ASSETS, SIGNATURE, model_directory, verify
from app.tokenization import MODEL_ID, REVISION, TOKENIZER_SHA256

verify(model_directory())
manifest = dict(
    recorded_utc=datetime.now(UTC).isoformat(),
    os=platform.platform(), python=platform.python_version(),
    model=dict(name=MODEL_ID, revision=REVISION, signature=SIGNATURE, dimension=384,
               tokenizer_sha256=TOKENIZER_SHA256,
               assets={name: dict(bytes=size, sha256=sha, verified=True)
                       for name, (size, sha) in ASSETS.items()},
               download="Reused owner-approved D03 cache; no D07 download"),
    packages={name: dict(version=version(name), license=metadata(name).get("License-Expression")
                        or metadata(name).get("License"))
              for name in ("httpx", "fastapi", "pinecone", "torch", "transformers", "tokenizers")},
    requirements_lock_sha256=hashlib.sha256((ROOT / "apps/api/requirements.lock").read_bytes()).hexdigest(),
    package_lock_sha256=hashlib.sha256((ROOT / "package-lock.json").read_bytes()).hexdigest(),
    disk_free_bytes=shutil.disk_usage(ROOT).free,
    ollama=dict(binary_in_path=shutil.which("ollama") is not None, installed_version=None,
                downloaded_models=None, daemon_probe="NOT RUN", inference="NOT RUN",
                status="REAL OLLAMA NOT VERIFIED — NEEDS USER INSTALL/APPROVAL",
                mock_label="MOCK OLLAMA / NOT REAL LLM; usage absent, not fabricated"),
    live="LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION", sqlite_schema=3, guided_journal_schema=1,
)
if sys.platform == "win32":
    class MemoryStatus(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
            (name, ctypes.c_ulonglong) for name in (
                "total_physical", "available_physical", "total_page", "available_page",
                "total_virtual", "available_virtual", "extended")]
    memory = MemoryStatus()
    memory.length = ctypes.sizeof(memory)
    if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
        manifest["memory_snapshot_bytes"] = dict(total=memory.total_physical,
                                                available=memory.available_physical)
out = Path(__file__).parent / "runtime-model-manifest.json"
out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print("Cached E5 assets/tokenizer checksum PASS. Runtime/license/resource manifest recorded.")
print("No Ollama binary invoked, daemon probed, model downloaded/loaded, or cloud contacted.")
