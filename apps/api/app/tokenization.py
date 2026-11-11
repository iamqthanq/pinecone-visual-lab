"""Offline-only E5 tokenizer loading; no network calls or embedding model imports."""

import hashlib
import os
from functools import lru_cache
from pathlib import Path

from tokenizers import Tokenizer

from app.documents import DocumentError

MODEL_ID = "intfloat/multilingual-e5-small"
REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
TOKENIZER_SHA256 = "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39"
PREFIX = "passage: "
MODEL_LIMIT = 512
ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / ".cache" / "tokenizer" / REVISION


class TokenizerEngine:
    def __init__(self, tokenizer: Tokenizer, *, fixture: bool = False):
        self.tokenizer = tokenizer
        self.tokenizer.no_truncation()
        self.tokenizer.no_padding()
        self.mode = "test-fixture-not-e5" if fixture else "e5"
        self.model_id = "offline-byte-fixture-NOT-E5" if fixture else MODEL_ID
        self.revision = "fixture-v1" if fixture else REVISION
        self.overhead = len(self.encode(PREFIX, special=True).ids)
        self.max_size = MODEL_LIMIT - self.overhead

    def encode(self, text: str, special: bool = False):
        return self.tokenizer.encode(text, add_special_tokens=special)

    def info(self) -> dict:
        return {
            "available": True,
            "mode": self.mode,
            "id": self.model_id,
            "revision": self.revision,
            "model_limit": MODEL_LIMIT,
            "prefix": PREFIX,
            "prefix_special_overhead": self.overhead,
            "max_chunk_size": self.max_size,
        }


@lru_cache(maxsize=2)
def load_tokenizer(directory: str) -> TokenizerEngine:
    path = Path(directory) / "tokenizer.json"
    if not path.is_file():
        raise DocumentError(
            "E5 tokenizer is not cached. Run: .venv\\Scripts\\python.exe "
            "scripts/setup_tokenizer.py --accept-download (tokenizer only, no weights).",
            503,
        )
    if hashlib.sha256(path.read_bytes()).hexdigest() != TOKENIZER_SHA256:
        raise DocumentError(
            "Tokenizer checksum mismatch. Rerun the tokenizer-only setup command.", 503
        )
    return TokenizerEngine(Tokenizer.from_file(str(path)))


def real_tokenizer() -> TokenizerEngine:
    return load_tokenizer(os.getenv("PVL_TOKENIZER_DIR", str(CACHE)))
