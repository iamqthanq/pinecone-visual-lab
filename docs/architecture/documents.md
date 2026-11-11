# D02 documents: extraction, SQLite and provenance

## Storage and limits

Default `.data/` is Git ignored: `<uuid>.pdf` / `<uuid>.txt` plus `documents.sqlite3`. Display filenames are sanitized (Windows separators, reserved device names and invalid characters), never used as storage paths. IDs are validated UUIDs. An explicit `PVL_DATA_DIR` can relocate storage; it must remain private/untracked. Tests use temporary or ignored isolated stores, never user libraries. Repository checks reject accidentally tracked `.data`, cache, PDFs, databases and model-weight formats.

Upload validates extension, MIME and actual content. TXT is strict UTF-8 with optional BOM; binary controls/invalid encoding/whitespace-only inputs and PDF masquerading as TXT are rejected. PDF requires signature/end marker and successful strict parser extraction; encrypted/malformed files are rejected. No document content is executed or rendered as HTML. React displays text with normal escaping.

Default file cap10 MiB (configurable1 byte–50 MiB). A capped ASGI body reader rejects requests over file cap +64 KiB multipart allowance **before** multipart spooling; route streaming separately enforces the file cap. PDF max200 pages; extracted text max500,000 characters; page streams max8 MiB with pypdf decompression/work caps (32 MiB work). Preview max5000 chunks. The local demo does not implement PDF process isolation/CPU deadlines and is not intended as a public hostile-file upload service. Strict parsing may reject otherwise repairable PDFs; re-export a valid text-layer PDF.

No-text pages are empty with warnings. A fully image-only/blank PDF is preserved with `needs_ocr`; mixed PDFs retain their empty pages. Empty and scanned pages cannot always be distinguished reliably using text extraction alone, so the UI states the ambiguity and **OCR NOT AVAILABLE**. Original bytes are preserved; no OCR or fabricated text.

## Three representations

1. Original uploaded bytes, unchanged in the UUID file.
2. `Page.extracted_text`: pypdf's extracted Unicode for each PDF page, or TXT decoded with UTF-8 BOM removed. This is extracted reading order, not a promise of visual PDF layout fidelity.
3. `Page.text`: deterministic NFC + CRLF/CR→LF. No trimming or whitespace collapse. Canonical document text joins these normalized page strings with exactly two LF, including empty pages.

Each page is **1-based** with normalized `character_count` and half-open `[start_offset,end_offset)` into canonical text. TXT always has one logical page, independent of line/form-feed layout (binary control characters are rejected). Offsets use **Python Unicode code points**, not UTF-8 bytes or JavaScript UTF-16 indices. Consumers must slice by code point (e.g. `Array.from(text)` in JavaScript). The UI renders server-provided text/overlap substrings; it does not derive slices from JS offset indices.

Canonical offsets trace directly to a normalized page substring; raw extracted text and original file allow inspection before normalization. NFC may change code-point length, so canonical offsets are not raw-file byte offsets. Synthetic page separators have no original glyph; chunks intersect all nonempty page spans they cover. Page numbering includes empty pages. [Tokenizer contract](../tokenizer.md) specifies source token vs independently re-tokenized body counts and actual overlap.

## SQLite schema1

Implemented in `app.documents.Store.db()`, with FK enforcement and `PRAGMA user_version=1`:

| Table | Keys and stored fields |
| --- | --- |
| `documents` | UUID PK; safe name/kind/byte size; created_at/status/warnings; canonical_text; active confirmed_id |
| `pages` | PK(document_id,page_number); document FK CASCADE; JSON data: raw/normalized text, offsets, count/status |
| `versions` | UUID PK; document FK CASCADE; unique(document_id,version); draft/confirmed CHECK; created_at; JSON config(size,overlap) |
| `chunks` | UUID PK; version FK CASCADE; unique(version_id,ordinal); JSON chunk metadata/text/counts/spans |

Fresh/unversioned empty stores initialize schema1; existing schema1 is reused. Newer/unknown schema versions fail with503 and preserve data; no destructive migration/reset is attempted. D01 had no document database to migrate. SQLite connections commit/rollback via context manager and always close. Preview allocation uses `BEGIN IMMEDIATE` to serialize per-document version numbering; failed chunk generation rolls back without a partial draft. Concurrent version allocation and restart persistence are tested.

`confirmed_id` is an application-maintained pointer; confirm validates the document/version relationship before updating it. Each preview persists a separate immutable chunk set. Confirm changes that version state/pointer, retaining earlier versions. Changing UI inputs alone changes no database records. A new preview leaves the current confirmed pointer intact. Reload selects confirmed, otherwise newest draft; saved-version selector can inspect history.

Original-file creation is cleaned up on extraction/storage failure. Explicit `DELETE ?confirm=true` removes only the selected UUID file and cascaded document/page/version/chunk records. An interrupted filesystem/database operation is not a distributed transaction; a process crash at a commit boundary can leave an orphan file. No background purge or user-file deletion occurs. Backups/reconciliation remain future operational work.

## API and JSONL

- `GET/POST /api/documents`: list with cap / upload and extract.
- `GET/DELETE /api/documents/{id}`: source metadata/pages/versions / explicit confirmed deletion.
- `GET /api/tokenizer`: real availability/revision/budget or actionable missing-assets state.
- `POST /api/documents/{id}/preview`: strict integer size/overlap → new draft.
- `GET /api/documents/{id}/versions/{version_id}`: exact saved version.
- `POST .../versions/{version_id}/confirm`: explicit save/activate.
- `GET .../versions/{version_id}/export`:409 for draft, UTF-8 NDJSON attachment for confirmed.

Chunk IDs are UUID5(versionUUID,ordinal): stable within saved versions and distinct across versions. JSONL has one complete JSON object per ordered chunk, including document_id/source_name/chunk_id/index/text, token_count/model_token_count, page_start/end, canonical and source-token offsets, overlap_text/actual count, tokenizer/revision/mode, chunk_size/overlap/version/version_id. Each line parses independently; Unicode is retained, with newlines escaped by JSON encoding. Exported sample is from synthetic real-E5 E2E. No endpoint embeds or upserts anything.
