"""Source-span chunking: real token budgets, safe Unicode cuts, explicit token overlap."""

import bisect
import re
from uuid import UUID, uuid5

from app.documents import DocumentError
from app.tokenization import MODEL_LIMIT, PREFIX, TokenizerEngine


def chunk_document(
    doc: dict, size: int, overlap: int, engine: TokenizerEngine, version: int, version_id: str
) -> list[dict]:
    if not 0 < size <= engine.max_size or not 0 <= overlap < size:
        raise DocumentError(f"Use size 1–{engine.max_size}, and 0 ≤ overlap < size.")
    text = doc["canonical_text"]
    if not text.strip():
        raise DocumentError("No selectable text to chunk. OCR NOT AVAILABLE.")
    encoded = engine.encode(text)
    offsets, total = encoded.offsets, len(encoded.ids)
    if not total:
        raise DocumentError("The tokenizer produced no content tokens for this document.")
    # Byte/subword tokens can share the same Unicode character offsets: never split them.
    cuts = {0: 0, total: len(text)}
    for index in range(1, total):
        if offsets[index - 1][1] <= offsets[index][0] and offsets[index][0] > cuts[0]:
            cuts[index] = offsets[index][0]
    indices = sorted(cuts)
    boundaries = {match.end() for match in re.finditer(r"\n\n+|[.!?。！？]\s+", text)}
    chunks, start, previous_end = [], 0, 0
    while start < total:
        maximum = min(total, start + size)
        end_index = bisect.bisect_right(indices, maximum) - 1
        end = indices[end_index]
        # Prefer an existing sentence/paragraph cut in the last third of the token window.
        candidates = [
            i
            for i in indices[max(0, end_index - size) : end_index + 1]
            if i > start + max(overlap, size * 2 // 3) and cuts[i] in boundaries
        ]
        if end < total and candidates:
            end = candidates[-1]
            end_index = bisect.bisect_left(indices, end)
        while end > start:
            source = text[cuts[start] : cuts[end]]
            content_tokens = len(engine.encode(source).ids)
            model_tokens = len(engine.encode(PREFIX + source, special=True).ids)
            if content_tokens <= size and model_tokens <= MODEL_LIMIT and source.strip():
                break
            end_index -= 1
            end = indices[end_index] if end_index >= 0 else start
        if end <= start:
            raise DocumentError("Chunk size is too small for a Unicode token group. Increase size.")
        char_start, char_end = cuts[start], cuts[end]
        pages = [
            p["page_number"]
            for p in doc["pages"]
            if p["end_offset"] > char_start and p["start_offset"] < char_end
        ]
        # Page separators are canonical source characters; attach them to adjacent pages.
        if not pages:
            raise DocumentError("Unable to map this chunk to source pages. Increase chunk size.")
        overlap_end = min(char_end, chunks[-1]["end_offset"]) if chunks else char_start
        chunks.append(
            {
                "chunk_id": str(uuid5(UUID(version_id), str(len(chunks)))),
                "document_id": doc["id"],
                "source_name": doc["name"],
                "index": len(chunks),
                "text": source,
                "token_count": content_tokens,
                "model_token_count": model_tokens,
                "page_start": min(pages),
                "page_end": max(pages),
                "start_offset": char_start,
                "end_offset": char_end,
                "source_token_start": start,
                "source_token_end": end,
                "overlap_token_count": max(0, previous_end - start),
                "overlap_text": text[char_start:overlap_end],
                "tokenizer": engine.model_id,
                "tokenizer_revision": engine.revision,
                "tokenizer_mode": engine.mode,
                "chunk_size": size,
                "overlap": overlap,
                "version": version,
                "version_id": version_id,
            }
        )
        if len(chunks) > 5000:
            raise DocumentError("Preview exceeds 5,000 chunks. Increase the chunk size.")
        if end == total:
            break
        target = end - overlap
        next_index = bisect.bisect_left(indices, max(start + 1, target))
        next_start = indices[next_index]
        # If the requested overlap cannot respect a Unicode character, actual overlap is smaller.
        previous_end, start = end, min(end, next_start)
    return chunks
