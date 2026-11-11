# D02 tokenizer contract and licenses

## Official assets and input limit

- Model/tokenizer family: `intfloat/multilingual-e5-small` (XLM-R fast tokenizer).
- Pinned revision: `614241f622f53c4eeff9890bdc4f31cfecc418b3`.
- Only downloaded asset: `tokenizer.json`, **17,082,730 bytes**.
- SHA-256: `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39` (checked on setup and runtime load).
- [Official tokenizer configuration](https://huggingface.co/intfloat/multilingual-e5-small/blob/614241f622f53c4eeff9890bdc4f31cfecc418b3/tokenizer_config.json) declares `model_max_length: 512` and XLMRobertaTokenizer.
- [Model configuration](https://huggingface.co/intfloat/multilingual-e5-small/blob/614241f622f53c4eeff9890bdc4f31cfecc418b3/config.json) declares `max_position_embeddings: 512`.
- [Official model card](https://huggingface.co/intfloat/multilingual-e5-small/blob/614241f622f53c4eeff9890bdc4f31cfecc418b3/README.md) documents the `passage:` document prefix, 512 truncation and MIT license.
- [Pinned tokenizer JSON](https://huggingface.co/intfloat/multilingual-e5-small/blob/614241f622f53c4eeff9890bdc4f31cfecc418b3/tokenizer.json) is loaded through `tokenizers.Tokenizer.from_file`, without Transformers/model loading.

`scripts/setup_tokenizer.py --accept-download` is the only download path: exact revision/filename allowlist, HTTPS, 20 MiB stream cap, SHA check before atomic replacement, temporary-file cleanup, cache reuse. Default ignored cache is `.cache/tokenizer/<revision>/`. No download occurs on app import, request or test. Missing/corrupt assets return explicit unavailable status/503 with setup instructions. No embedding weights, SentencePiece duplicate assets, Ollama or Pinecone credentials are required.

## Counts, cuts and overlap

`passage: ` with special tokens alone encodes to 5 IDs in this revision. The maximum configurable **content size is conservatively507**, default300. Every candidate is separately encoded as plain content and as `passage: ` + content with special tokens; both `token_count <= size` and `model_token_count <= 512` are enforced. Prefix merging can make actual overhead smaller than5 for particular chunks; the full-input count is authoritative. Automatic truncation/padding are disabled. These are actual tokenizer counts, never word estimates.

The engine encodes the canonical source once and uses tokenizer character offsets to cut windows. It prefers valid paragraph/sentence boundaries in the final third when progress and overlap permit, otherwise falls back to token windows. Cuts never split token groups with overlapping Unicode character offsets. Each body is re-tokenized and the end may shrink until both budgets hold. Tiny sizes that cannot fit a Unicode group receive422 rather than dropping text.

Configured overlap50 means up to50 IDs of the **full canonical source token stream**. Next start is snapped forward to a Unicode-safe cut, so actual overlap may be smaller. `source_token_start/end` are half-open indices into that stream; `overlap_token_count` is the intersection with the previous chunk's source-token span. `overlap_text` is the exact shared canonical substring and is highlighted in the UI. Independent body re-tokenization may differ at boundaries; the UI and JSONL disclose this distinction. No claim is made that re-tokenizing the highlighted substring always equals the source-stream overlap count.

Ordered canonical character spans cover the entire normalized document, including whitespace/page separators, with no gaps; overlap is intentional. Page ranges come from intersections with stored page spans. Independent tests mark a boolean per source character, verify every span/slice/order/page mapping, and recompute actual counts. This oracle does not call an engine reconstruction helper. No empty chunks are emitted; start must advance; preview is capped at5000 chunks.

## Offline verification

Default backend tests and CI E2E use a deterministic byte-BPE fixture built locally from code, labeled **`test-fixture-not-e5` / `offline-byte-fixture-NOT-E5`**. Its counts are explicitly incompatible with E5. Production `app.main:app` never falls back to it; CI uses the separate `testsupport.fixture_server:app` entry. HF offline flags are set; no setup CLI or `from_pretrained` call runs in CI.

Local real integration uses the verified official cache:

```powershell
.\.venv\Scripts\python.exe -m pytest -c apps/api/pyproject.toml -m real_tokenizer -v
npm.cmd run test:e2e
```

Real tests are separately marked and explicitly skip when no assets exist. [Real integration log](evidence/d02/real-tokenizer.txt) and [real browser log](evidence/d02/browser-tests.txt) provide actual local evidence. Fixture mode is tested separately and never overwrites real screenshots/sample JSONL.

## Dependencies and licenses reviewed

Versions are exact in `apps/api/requirements.lock`; `requirements.in` records direct dependencies. New direct pins: **pypdf7.0.1**, **tokenizers0.23.3**, **python-multipart0.0.33**, **reportlab5.1.0**. Existing backend dependencies remain pinned through the lock. ReportLab/Pillow are used to generate non-sensitive test PDFs; no proprietary font files are committed (tests use installed Windows Arial).

| Component | License / primary source | Use |
| --- | --- | --- |
| multilingual-e5-small tokenizer | MIT, official model card above | Document token counts; no weights |
| pypdf | [BSD-3-Clause](https://github.com/py-pdf/pypdf/blob/7.0.1/LICENSE) | Actual per-page text extraction |
| Hugging Face tokenizers | [Apache-2.0](https://github.com/huggingface/tokenizers/blob/v0.23.3/LICENSE) | Offline fast tokenizer runtime |
| python-multipart | [Apache-2.0](https://pypi.org/project/python-multipart/0.0.33/) | FastAPI multipart parsing |
| ReportLab | [BSD](https://pypi.org/project/reportlab/5.1.0/) (also installed package license metadata) | Synthetic PDF fixture generation |

No third-party installer/scripts were executed to install agent skills. Existing pinned Taste source-guided adaptation is documented in `docs/design-foundation.md`; GSAP is unused. This review records source licenses, not a claim of a comprehensive dependency legal audit.
