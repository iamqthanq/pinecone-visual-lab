"""Deterministic offline test provider, explicitly NOT E5. No model/network calls."""

import hashlib
import math
import struct
import time


class FixtureProvider:
    mode = "test-fixture-not-e5"
    model_id = "deterministic-384-NOT-E5"
    revision = "fixture-v1"
    signature = "deterministic-384-NOT-E5@fixture-v1"
    weights_hash = None

    def __init__(self):
        self.calls = []

    def status(self):
        return {
            "state": "loaded",
            "mode": self.mode,
            "model_id": self.model_id,
            "model_revision": self.revision,
            "dimension": 384,
            "model_signature": self.signature,
            "cache_state": "test_fixture",
            "message": "TEST FIXTURE — NOT E5",
            "device": "cpu",
            "dtype": "float32",
            "max_batch": 8,
        }

    def encode(self, inputs, cancel=None):
        started = time.perf_counter()
        self.calls.append(inputs)
        values = []
        for tokens in inputs:
            seed = hashlib.sha256(bytes(str(tokens), "ascii")).digest()
            raw = [
                int.from_bytes(hashlib.sha256(seed + i.to_bytes(2, "big")).digest()[:2], "big")
                / 32768
                - 1
                for i in range(384)
            ]
            norm = math.sqrt(math.fsum(v * v for v in raw))
            values.append([struct.unpack("f", struct.pack("f", v / norm))[0] for v in raw])
        return {
            "values": values,
            "inference_ms": (time.perf_counter() - started) * 1000,
            "load_ms": 0.0,
        }

    def close(self):
        pass
