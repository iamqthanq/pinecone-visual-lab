"""Pinned official E5 snapshot; inspection never loads weights or uses the network."""

import hashlib
import json
import os
from pathlib import Path

from app.documents import DocumentError
from app.tokenization import CACHE, MODEL_ID, REVISION, TOKENIZER_SHA256

DIMENSION = 384
WEIGHTS_HASH = "1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477"
ASSETS = {
    "model.safetensors": (470_641_600, WEIGHTS_HASH),
    "config.json": (655, "69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959"),
    "1_Pooling/config.json": (
        200,
        "987f7a67a38fa564c849bb5d277c52ab9088a84368fc0be31a354125aebb12a0",
    ),
    "modules.json": (387, "c6e29747481e8b5dd2b58401966aeac910de39092f90cda9a704b1545f902b04"),
}
SIGNATURE = f"{MODEL_ID}@{REVISION}:{WEIGHTS_HASH}:mean-mask-l2-f32-v1"
SETUP = ".venv\\Scripts\\python.exe scripts/setup_embedding_model.py --accept-download"


def model_directory() -> Path:
    return Path(os.getenv("PVL_MODEL_DIR", str(CACHE.parents[1] / "embedding-model" / REVISION)))


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(1024 * 1024):
            result.update(block)
    return result.hexdigest()


def present(directory: Path) -> bool:
    return all(
        (directory / name).is_file() and (directory / name).stat().st_size == size
        for name, (size, _) in ASSETS.items()
    )


def verify(directory: Path):
    for name, (size, sha) in ASSETS.items():
        path = directory / name
        if not path.is_file() or path.stat().st_size != size or digest(path) != sha:
            raise DocumentError(
                f"Model asset missing or checksum mismatch: {name}. Run {SETUP}", 503
            )
    config = json.loads((directory / "config.json").read_text())
    pooling = json.loads((directory / "1_Pooling/config.json").read_text())
    if (config["model_type"], config["hidden_size"], config["max_position_embeddings"]) != (
        "bert",
        DIMENSION,
        512,
    ) or not pooling["pooling_mode_mean_tokens"]:
        raise DocumentError("Model configuration is incompatible with the pinned E5 contract.", 503)
    tokenizer_path = Path(os.getenv("PVL_TOKENIZER_DIR", str(CACHE))) / "tokenizer.json"
    if not tokenizer_path.is_file() or digest(tokenizer_path) != TOKENIZER_SHA256:
        raise DocumentError(
            "Matching D02 tokenizer is missing or corrupt. Run tokenizer setup.", 503
        )
