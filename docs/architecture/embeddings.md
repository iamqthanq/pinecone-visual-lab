# D03 local embeddings and inspector

D04 reuses this service unchanged for explicit confirmed-version ingest. Current SQLite schema3 preserves schema2 records and adds [vector storage/manifests](vector-store.md); this page describes the retained D03 inference contract.

## Model and approval

User explicitly approved downloading/running official E5 weights and the CPU runtime on2026-11-11 after disclosure of ~471MB weights, <1GB expected total download,3GB disk and3–4GB available RAM (8GB system recommended). `scripts/setup_embedding_model.py --accept-download` is the sole setup path. It requests only the exact allowlisted assets from `https://huggingface.co/intfloat/multilingual-e5-small/resolve/614241f622f53c4eeff9890bdc4f31cfecc418b3/`, verifies pinned sizes/SHA-256 before atomic replacement, removes incomplete `.part` files, reuses verified cache and checks free disk. On interrupted setup, rerun the same explicit command; already valid files are reused. There is no startup/API/CI download or remote-code execution.

| Asset | Bytes | SHA-256 |
| --- | --- | --- |
| `model.safetensors` |470641600 |`1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477` |
| `config.json` |655 |`69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959` |
| `1_Pooling/config.json` |200 |`987f7a67a38fa564c849bb5d277c52ab9088a84368fc0be31a354125aebb12a0` |
| `modules.json` |387 |`c6e29747481e8b5dd2b58401966aeac910de39092f90cda9a704b1545f902b04` |

Official metadata/file hashes were read directly from the immutable HF snapshot; setup verified actual downloaded bytes. The matching D02 tokenizer remains revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`, SHA `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39`, with `tokenizers0.23.3`. Model cache is ignored `.cache/embedding-model/<revision>/`; optional `PVL_MODEL_DIR` relocates it. Keep custom locations outside Git. The model card declares MIT; [official snapshot](https://huggingface.co/intfloat/multilingual-e5-small/tree/614241f622f53c4eeff9890bdc4f31cfecc418b3) and [configuration](https://huggingface.co/intfloat/multilingual-e5-small/blob/614241f622f53c4eeff9890bdc4f31cfecc418b3/config.json).

The actual snapshot uses **BertModel**, hidden384 /12 layers /12 attention heads, with an **XLMRobertaTokenizer**. A tokenizer family name alone must not select XLMRobertaModel. `AutoModel` reads the verified local BERT config with `trust_remote_code=False`, safetensors only, local files only. PyTorch**2.15.0** and Transformers**5.22.2** preserve compatibility with D02 tokenizers0.23.3; all transitive versions are locked. Runtime is **CPU / float32 / eval / inference_mode**, two intra-op threads, one inter-op thread. There is no embedding inference in the API process itself.

New runtime licenses: [PyTorch core BSD-3-Clause (bundled SPDX licenses in runtime evidence)](https://pypi.org/project/torch/2.15.0/), [Transformers Apache-2.0](https://pypi.org/project/transformers/5.22.2/), [safetensors Apache-2.0](https://pypi.org/project/safetensors/), NumPy BSD. Installed versions/license metadata and actual manifest are in D03 evidence. D02 PDF/Taste/font license decisions are retained. No GSAP runtime or upstream Taste gate result is claimed.

## Prefixes, pooling and numerical contracts

Service accepts raw text and adds **`query: `** or **`passage: `** once. Already-prefixed ad hoc input is rejected with an explanation. Confirmed source chunks are known raw canonical text: literal query:/passage: words inside the document are preserved as content, and the model prefix is prepended once without stripping source text. Canonical sources retain the D02 character cap rather than the smaller ad hoc query cap. Source chunks retain D02 normalization; ad hoc query strings are not rewritten. Entire prefixed token sequence includes special tokens and must be **≤512 IDs**. No truncation/padding is enabled in the shared tokenizer. Worker pads batches with the snapshot tokenizer's `<pad>` ID1 and an explicit attention mask; model config's pad ID alone is not used to infer tokenizer padding.

Pooling masks padded last-hidden-state positions to0, sums valid positions and divides by valid attention-mask count, then L2-normalizes. Every output is checked for384 finite values, nonzero norm and |norm−1|≤1e-5. Real tests independently run official local AutoModel and compute masked pooling/normalization in NumPy float64, comparing float32 results at absolute tolerance2e-5. Repeatability uses the same tolerance; exact bitwise cross-machine identity is not promised.

Cosine independently validates384D finite/nonzero vectors and matching model ID/revision/signature/mode. It uses stable `hypot` norms and normalized dot products, clamped only for floating-point roundoff to[-1,+1]. Decimal and known identical/orthogonal/opposite oracles test it. Raw similarity is neither probability nor Pinecone score. Vietnamese near/far examples are observations, not ranking guarantees. No top-k search is implemented.

## Resource control, status and timing

`TorchProvider` lazily starts one owned spawned worker when an explicit encode operation needs it. A lock serializes requests; contention returns429 after1 second. Batches contain1–8 inputs, each≤512 IDs; query text additionally capped at20000 characters. Embedding JSON bodies are capped at1MiB before parsing. No request can trigger implicit weights installation. Status/health inspect file presence/size and process liveness only; hashes are rechecked on each worker load. `present_unverified` is a cache observation, not a checksum PASS or loaded claim.

States: `not_cached`, `not_loaded` (files present, not loaded), `loading`, `loaded`, `unavailable` with setup/retry instructions. The embedding endpoint reports unavailable503, invalid input422, ownership/mismatch409/404, busy429, cancellation408 and timeout504. Validation errors omit input text/full vectors, including nonfinite JSON values. Uvicorn's normal request logs contain no JSON bodies. Do not enable body logging for private queries.

An async disconnect watcher signals cancellation to the provider. Timeout120 seconds covers load/inference; frontend aborts after130 seconds. Timeout/cancellation stops **only that app-owned worker**, joins/closes it and permits a later explicit retry; app shutdown closes it too. No attempt is made to terminate unrelated Python or browser processes. Run Uvicorn with its default single worker; multiple server processes would each own a model copy.

`inference_ms` measures the whole model-forward/pooling batch using a monotonic clock. Each item identifies `timing_scope=whole_batch`, `batch_size`, and `item_inference_ms=null`; it is not an invented per-item division. `load_ms` is separate. Response `wall_ms` includes request work. Cache hits retain their original source inference measurement and set `cached=true`; an all-cache-hit response has `inference_ms=null`. Best-effort Windows peak working-set measurement observes only the owned worker; it is a process peak, not total system RAM or a performance guarantee.

## Confirmed sources and schema2

Only confirmed source versions can persist embeddings. IDs must resolve to the specified document/version/chunk; stored tokenizer revision/mode/input count are reconciled before use. Any earlier confirmed version may be selected explicitly; creating an embedding does not re-chunk, confirm or activate a version.

Forward migration1→2 adds only:

```sql
CREATE TABLE embeddings (
 id TEXT PRIMARY KEY,
 chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
 model_signature TEXT NOT NULL,
 data TEXT NOT NULL,
 UNIQUE(chunk_id, model_signature)
);
PRAGMA user_version=2;
```

Fresh stores initialize D02 tables then migrate. Original Document/Page/version/Chunk records remain unchanged; newer unknown schemas still fail safely. Migration is transactional. Embedding IDs are UUID5(source chunk UUID + model signature). Signature includes model revision, weights hash and pooling/normalization/precision contract; fixture signatures are different. Inserts are idempotent per chunk/signature. Chunk FK cascade removes embedding records on explicit document deletion. A concurrent source deletion during inference prevents orphan insertion and returns409. Changing chunk settings creates a separate version, not an overwrite. D02 JSONL export remains independent.

Query/ad hoc passage vectors are returned only and never saved. Responses include vector values, dimension, normalization, model/revision/hash/signature, prefix/kind/count, timing and nullable source IDs/page range. Stored chunk vectors retain complete provenance. Typed response models are defined in `embedding_contracts.py`; the reusable `EmbeddingService` is the D04 integration boundary. No Pinecone adapter/index/namespace/upsert/search/RAG operation exists.

## Separate tests

Production has no fixture fallback. CI explicitly launches `testsupport.fixture_server:app` with a deterministic hash/L2 provider labeled **`test-fixture-not-e5`**, model ID **NOT E5**, pooling `fixture-hash-l2-NOT-E5`. It is suitable only for contract/UI regression; its vectors have no semantic claims. The normal app never selects this provider from environment flags.

`scripts/run_pytest.py` creates a fresh ignored test/cache directory each run, preserving user Temp and previous test folders. Default tests exclude `real_model` and `real_tokenizer`. The separate approved real track uses cached official assets and records real-vector samples/oracle results. Edge E2E runs both tracks independently and writes fixture screenshots under `test-results/`, real screenshots/sample under `docs/evidence/d03/`. D01/D02 evidence remains immutable history. See [D03 report](../evidence/d03/REPORT.md).
