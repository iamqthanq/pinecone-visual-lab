"""Explicit user-approved tokenizer/model setup; allowlist + immutable checksums, no remote code."""

import argparse
import json
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from app.embedding_assets import ASSETS, SETUP, digest, model_directory, verify
from app.tokenization import MODEL_ID, REVISION


def main():
    parser = argparse.ArgumentParser(
        description="Opt-in ~471 MB official E5 weights; no cloud cost."
    )
    parser.add_argument("--accept-download", action="store_true", required=True)
    parser.parse_args()
    target = model_directory().resolve()
    target.mkdir(parents=True, exist_ok=True)
    print(
        f"{MODEL_ID} @ {REVISION}\n470,641,600 weight bytes; reserve 3 GB disk / 4 GB free RAM."
    )
    if shutil.disk_usage(target).free < 3 * 1024**3:
        raise SystemExit("Reserve at least 3 GiB free disk before model setup.")
    for name, (size, sha) in ASSETS.items():
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if (
            destination.is_file()
            and destination.stat().st_size == size
            and digest(destination) == sha
        ):
            print(f"Verified cached {name}; no download.")
            continue
        url = f"https://huggingface.co/{MODEL_ID}/resolve/{REVISION}/{name}"
        print(f"Download {url} ({size} bytes), SHA-256 {sha}", flush=True)
        temporary = destination.with_suffix(destination.suffix + ".part")
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": "Pinecone-Visual-Lab-D03"}
            )
            with (
                urllib.request.urlopen(request, timeout=60) as response,
                temporary.open("wb") as out,
            ):
                received = 0
                while block := response.read(1024 * 1024):
                    received += len(block)
                    if received > size:
                        raise ValueError("Asset exceeded pinned byte limit")
                    out.write(block)
            if temporary.stat().st_size != size or digest(temporary) != sha:
                raise ValueError(f"Asset size/SHA-256 mismatch: {name}")
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    verify(target)
    manifest = {
        "model_id": MODEL_ID,
        "revision": REVISION,
        "assets": {
            name: {"bytes": size, "sha256": sha} for name, (size, sha) in ASSETS.items()
        },
    }
    (target / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"All assets verified. Local-only CPU inference ready. Setup command: {SETUP}"
    )


if __name__ == "__main__":
    main()
