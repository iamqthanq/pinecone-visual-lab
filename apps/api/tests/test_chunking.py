from uuid import uuid4

import pytest

from app.chunking import chunk_document
from app.documents import normalize
from app.tokenization import CACHE, MODEL_LIMIT, PREFIX, real_tokenizer
from testsupport.fixture_server import fixture_engine


def document(texts):
    pages, cursor = [], 0
    for index, text in enumerate(texts, 1):
        text = normalize(text)
        pages.append(
            {
                "page_number": index,
                "start_offset": cursor,
                "end_offset": cursor + len(text),
                "text": text,
            }
        )
        cursor += len(text) + 2
    return {
        "id": str(uuid4()),
        "name": "synthetic.txt",
        "pages": pages,
        "canonical_text": "\n\n".join(p["text"] for p in pages),
    }


def assert_oracle(doc, chunks, engine, size, overlap):
    # Independent character coverage oracle, not the chunker's reconstruction function.
    text = doc["canonical_text"]
    coverage = [False] * len(text)
    prior_start, prior_end, prior_token_end = -1, 0, 0
    for index, chunk in enumerate(chunks):
        start, end = chunk["start_offset"], chunk["end_offset"]
        assert prior_start < start <= prior_end if index else start == 0
        assert chunk["text"] == text[start:end]
        assert chunk["index"] == index
        assert chunk["token_count"] == len(engine.encode(chunk["text"]).ids) <= size
        assert chunk["model_token_count"] == len(engine.encode(PREFIX + chunk["text"], True).ids)
        assert chunk["model_token_count"] <= MODEL_LIMIT
        assert chunk["overlap_token_count"] == max(0, prior_token_end - chunk["source_token_start"])
        assert chunk["overlap_token_count"] <= overlap
        assert (
            chunk["overlap_text"] == text[start : min(end, prior_end)]
            if index
            else not chunk["overlap_text"]
        )
        for position in range(start, end):
            coverage[position] = True
        expected_pages = [
            p["page_number"]
            for p in doc["pages"]
            if p["end_offset"] > start and p["start_offset"] < end
        ]
        assert [chunk["page_start"], chunk["page_end"]] == [
            min(expected_pages),
            max(expected_pages),
        ]
        prior_start, prior_end = start, end
        prior_token_end = chunk["source_token_end"]
    assert chunks[-1]["end_offset"] == len(text)
    assert all(coverage)


@pytest.mark.parametrize("overlap", [0, 50])
@pytest.mark.parametrize(
    "texts",
    [
        ["Short text."],
        ["a" * 300],
        ["a" * 301],
        ["Tiếng Vie\u0323̂t. " * 100, "", "Trang ba.\n\n" * 40],
        ["LongParagraphWithoutSpaces" * 100],
        ["😀" * 100 + "\n\nFinish."],
    ],
)
def test_fixture_token_spans_budgets_and_independent_coverage(texts, overlap):
    engine, doc = fixture_engine(), document(texts)
    chunks = chunk_document(doc, 300, overlap, engine, 1, str(uuid4()))
    assert_oracle(doc, chunks, engine, 300, overlap)
    assert all(c["tokenizer_mode"] == "test-fixture-not-e5" for c in chunks)


@pytest.mark.real_tokenizer
@pytest.mark.skipif(
    not (CACHE / "tokenizer.json").exists(), reason="Run explicit tokenizer-only setup"
)
def test_real_e5_correctness_and_metadata():
    engine = real_tokenizer()
    assert engine.info()["mode"] == "e5"
    assert engine.max_size == 507
    for size in [300, engine.max_size]:
        for overlap in [0, 50]:
            doc = document(
                ["Cơ sở dữ liệu tiếng Việt.\n\n" * 200, "", "😀 Tìm kiếm ngữ nghĩa. " * 30]
            )
            chunks = chunk_document(doc, size, overlap, engine, 1, str(uuid4()))
            assert_oracle(doc, chunks, engine, size, overlap)
            assert all(c["tokenizer"] == "intfloat/multilingual-e5-small" for c in chunks)
