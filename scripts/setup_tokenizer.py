"""Explicit opt-in, allowlisted, checksum-verified tokenizer-only download."""

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from app.tokenization import CACHE, MODEL_ID, REVISION, TOKENIZER_SHA256


def main():
    parser = argparse.ArgumentParser(
        description="Download 17.1 MB E5 tokenizer JSON, never weights."
    )
    parser.add_argument("--accept-download", action="store_true", required=True)
    parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / "tokenizer.json"
    if (
        target.is_file()
        and hashlib.sha256(target.read_bytes()).hexdigest() == TOKENIZER_SHA256
    ):
        print("Verified tokenizer already cached; no download.")
        return
    temporary = CACHE / "tokenizer.json.part"
    request = urllib.request.Request(
        f"https://huggingface.co/{MODEL_ID}/resolve/{REVISION}/tokenizer.json",
        headers={"User-Agent": "Pinecone-Visual-Lab-D02"},
    )
    try:
        size, digest = 0, hashlib.sha256()
        with (
            urllib.request.urlopen(request, timeout=60) as response,
            temporary.open("wb") as output,
        ):
            while block := response.read(1024 * 1024):
                size += len(block)
                if size > 20 * 1024 * 1024:
                    raise ValueError("Tokenizer exceeds the disclosed download cap")
                digest.update(block)
                output.write(block)
        if digest.hexdigest() != TOKENIZER_SHA256:
            raise ValueError("Tokenizer SHA-256 mismatch")
        temporary.replace(target)
        print(
            f"Verified {size} bytes at revision {REVISION}; no model weights downloaded."
        )
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
