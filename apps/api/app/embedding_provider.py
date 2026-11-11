"""One bounded CPU worker per app: lazy verified load, cancellation and hard timeout."""

import multiprocessing
import os
import threading
import time
from pathlib import Path

from app.documents import DocumentError
from app.embedding_assets import DIMENSION, SETUP, SIGNATURE, WEIGHTS_HASH, model_directory, present
from app.tokenization import MODEL_ID, REVISION


def cpu_worker(connection, directory: str):
    try:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        started = time.perf_counter()
        from app.embedding_assets import verify

        verify(Path(directory))
        import torch
        from transformers import AutoModel

        from app.embedding_math import masked_mean_pool
        from app.embedding_resources import peak_working_set_bytes

        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)
        model = (
            AutoModel.from_pretrained(
                directory,
                local_files_only=True,
                use_safetensors=True,
                trust_remote_code=False,
                dtype=torch.float32,
                attn_implementation="eager",
            )
            .to("cpu")
            .eval()
        )
        load_ms = (time.perf_counter() - started) * 1000
        while True:
            task = connection.recv()
            length = max(map(len, task))
            ids = torch.full((len(task), length), 1, dtype=torch.long)
            mask = torch.zeros_like(ids)
            for index, tokens in enumerate(task):
                ids[index, : len(tokens)] = torch.tensor(tokens, dtype=torch.long)
                mask[index, : len(tokens)] = 1
            started = time.perf_counter()
            with torch.inference_mode():
                hidden = model(input_ids=ids, attention_mask=mask).last_hidden_state
                vectors = masked_mean_pool(hidden, mask).tolist()
            connection.send(
                {
                    "values": vectors,
                    "inference_ms": (time.perf_counter() - started) * 1000,
                    "load_ms": load_ms,
                    "worker_peak_working_set_bytes": peak_working_set_bytes(),
                }
            )
            load_ms = 0.0
    except (EOFError, BrokenPipeError):
        pass
    except Exception:
        # Never log user text, vectors, paths/credentials or unsafe remote error details.
        try:
            connection.send(
                {
                    "error": "Verified local CPU model could not load/run. "
                    "Check runtime and checksum-verified setup; retry."
                }
            )
        except (OSError, EOFError):
            pass
    finally:
        connection.close()


class TorchProvider:
    mode = "e5"
    model_id = MODEL_ID
    revision = REVISION
    signature = SIGNATURE
    weights_hash = WEIGHTS_HASH

    def __init__(self, directory: Path | None = None, timeout: float = 120):
        self.directory = directory or model_directory()
        self.timeout = timeout
        self.lock = threading.Lock()
        self.process = self.connection = None
        self.loaded = False
        self.error = ""
        self.last_measurement = None

    def status(self):
        process = self.process
        try:
            alive = process is not None and process.is_alive()
        except (ValueError, OSError):
            alive = False
        cached = present(self.directory)
        state = (
            ("loaded" if self.loaded else "loading")
            if alive
            else ("unavailable" if self.error else "not_loaded" if cached else "not_cached")
        )
        return {
            "state": state,
            "mode": self.mode,
            "model_id": self.model_id,
            "model_revision": self.revision,
            "dimension": DIMENSION,
            "model_signature": self.signature,
            "weights_sha256": self.weights_hash,
            "cache_state": "present_unverified" if cached else "missing",
            "message": self.error
            or (
                "Files are checked on explicit generation."
                if cached
                else f"Model not cached. Run {SETUP}"
            ),
            "setup_command": SETUP,
            "device": "cpu",
            "dtype": "float32",
            "max_batch": 8,
        }

    def close(self):
        if self.process is not None:
            if self.process.is_alive():
                self.process.terminate()
            self.process.join(timeout=5)
            self.process.close()
        if self.connection is not None:
            self.connection.close()
        self.process = self.connection = None
        self.loaded = False

    def encode(self, inputs: list[list[int]], cancel: threading.Event | None = None):
        if not self.lock.acquire(timeout=1):
            raise DocumentError("Local CPU model is busy. Wait and retry.", 429)
        try:
            if not present(self.directory):
                raise DocumentError(f"Model not cached. Run {SETUP}", 503)
            if self.process is None or not self.process.is_alive():
                self.close()
                context = multiprocessing.get_context("spawn")
                self.connection, child = context.Pipe()
                self.process = context.Process(
                    target=cpu_worker, args=(child, str(self.directory)), daemon=True
                )
                self.process.start()
                child.close()
                self.error = ""
            self.connection.send(inputs)
            deadline = time.monotonic() + self.timeout
            while not self.connection.poll(0.05):
                if cancel is not None and cancel.is_set():
                    self.close()
                    raise DocumentError("Embedding cancelled; local worker stopped safely.", 408)
                if time.monotonic() >= deadline:
                    self.close()
                    raise DocumentError(
                        "CPU inference timed out. Try a smaller batch and retry.", 504
                    )
                if not self.process.is_alive():
                    raise DocumentError("Local CPU worker stopped. Check setup and retry.", 503)
            result = self.connection.recv()
            if "error" in result:
                self.error = result["error"]
                self.close()
                raise DocumentError(self.error, 503)
            self.loaded = True
            self.last_measurement = {key: value for key, value in result.items() if key != "values"}
            return result
        except (EOFError, OSError) as failure:
            self.close()
            raise DocumentError(
                "Local CPU worker unavailable. Retry model setup.", 503
            ) from failure
        finally:
            self.lock.release()
