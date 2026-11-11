"""Numerical contracts shared by local providers and the similarity mini-lab."""

import math

from app.documents import DocumentError
from app.embedding_assets import DIMENSION


def checked_vector(values: list[float]) -> list[float]:
    if len(values) != DIMENSION or any(
        isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v)
        for v in values
    ):
        raise DocumentError("Expected exactly 384 finite numeric vector values.")
    norm = math.hypot(*values)
    if not math.isfinite(norm) or norm <= 1e-12:
        raise DocumentError("Zero or nonfinite vector norm is invalid.")
    return values


def cosine(left: list[float], right: list[float]) -> float:
    checked_vector(left)
    checked_vector(right)
    left_norm, right_norm = math.hypot(*left), math.hypot(*right)
    return max(
        -1.0,
        min(
            1.0,
            math.fsum((a / left_norm) * (b / right_norm) for a, b in zip(left, right, strict=True)),
        ),
    )


def masked_mean_pool(hidden, mask):
    """Official E5 recipe: ignore padded positions, mean over valid tokens, then L2."""
    import torch.nn.functional as functional

    if (mask.sum(dim=1) == 0).any():
        raise DocumentError("Cannot pool an all-padding input.")
    pooled = (
        hidden.masked_fill(~mask[..., None].bool(), 0.0).sum(dim=1) / mask.sum(dim=1)[..., None]
    )
    return functional.normalize(pooled, p=2, dim=1)
