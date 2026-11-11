# PINECONE VISUAL LAB — MASTER DEMO BUILD PLAN v2.1 (WINDOWS)

**Trạng thái:** KẾ HOẠCH, CHƯA PHẢI BÁO CÁO THỰC THI  
**Môi trường chính thức:** Windows 10/11, PowerShell, Git for Windows  
**Loại dự án:** Ứng dụng web demo tương tác cho seminar Vector Database/Pinecone  
**Triết lý:** Tính năng thực sự hoạt động → quan sát được từng bước → giao diện đẹp → kiểm thử được → demo ổn định  
**Quy mô mới:** **09 MỤC LỚN** (mỗi mục giao trọn gói cho Coding Agent và tương ứng **01 GitHub Issue + 01 feature branch + 01 Draft PR**; không chia Issue cho từng công việc nhỏ)  
**Thời gian:** Thực hiện tuần tự theo các gate, **không bị ràng buộc 8 tuần**. Có thể chia lịch theo năng lực máy và tốc độ AI Coding.

---

## 0. CÁCH SỬ DỤNG TÀI LIỆU NÀY — BẮT BUỘC ĐỌC ĐẦU TIÊN

### 0.1. Hai loại prompt — không được lẫn

**Prompt A — Đọc kế hoạch (READ-ONLY):** Người dùng gửi tài liệu này cho Coding Agent. Agent **chỉ đọc, kiểm tra tính khả thi, tóm tắt và xác nhận hiểu**, không clone/cài đặt/code/commit/push/tạo Issue/PR/merge. Chỉ sau khi nhận **Prompt B — Thực thi một mục** mới được bắt đầu làm.

**Prompt B — Thực thi MỤC N:** Người dùng gửi prompt cho **toàn bộ Mục N**, có số GitHub Issue thật và nhánh cần dùng. Agent tự phân rã thành bước nhỏ, tự làm, tự kiểm thử, tự sửa rồi tiếp tục trong cùng mục. **Không ngừng để hỏi xin phép sau mỗi tiểu mục**, trừ các điều kiện BLOCKED về quyền, dữ liệu, nguy cơ mất dữ liệu/chi phí hoặc chính sách Git. Hoàn thành toàn mục mới commit/push/báo cáo. ChatGPT mở Draft PR, review code thật; người dùng quyết định merge; mới bắt đầu Mục tiếp theo.

### 0.2. Danh tính cố định

- GitHub: `https://github.com/iamqthanq/pinecone-visual-lab`
- Repository: `iamqthanq/pinecone-visual-lab`
- **WORKDIR Windows chính thức:** `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab` (thư mục GỐC chứa repository; không tạo thêm thư mục lồng).
- Default branch hiện đã xác minh: `main`; dùng làm integration base **nếu không có chính sách hiện hữu khác**. Không push trực tiếp `main`.
- Mẫu nhánh: `feature/issue-<SỐ_ISSUE_GITHUB_THỰC_TẾ>-<slug>`; mỗi mục một nhánh mới.
- Tên `D01…D09` dưới đây là **mã mục của kế hoạch, không phải số GitHub Issue**.
- **Issue #1 đã tồn tại** với phạm vi bootstrap cũ. Trước khi giao D01, ChatGPT phải kiểm tra repo, đối chiếu và **cập nhật Issue #1** cho khớp phạm vi mới hoặc ghi nhận quyết định thay thế. Không để hai đặc tả xung đột và không tự cho rằng đã cập nhật.
- Quy tắc chuẩn: `GITHUB_COLLAB_WORKFLOW_STANDARD_v1.md` do người dùng cung cấp. Nếu mã nguồn đã có `AGENTS.md`, `GEMINI.md`, `.github/`, branch policy hoặc hooks thì phải đọc và xử lý xung đột theo chính sách hiện hành, không lách.

### 0.4. Windows-first / môi trường thực thi bắt buộc

- Dùng **Windows PowerShell** trong `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab`. Lưu ý có Unicode và dấu cách, nên **luôn đặt đường dẫn trong dấu nháy**.
- **Đã từng kiểm tra máy Windows qua Desktop Commander:** WORKDIR hiện có thư mục `.git`, Git remote trỏ tới `https://github.com/iamqthanq/pinecone-visual-lab`, local `main` báo `No commits yet`, còn `origin/main` có commit chứa `README.md`. Hiện trạng có thể thay đổi trước khi agent bắt đầu: phải xác minh lại. **Không clone, không `git init`, không xóa `.git` khi repository đã tồn tại.**
- Agent phải kiểm tra `git status --short --branch`, `git branch -avv`, `git remote -v`, `git rev-parse --verify HEAD`, `git rev-parse --verify origin/main`, `git diff`, rồi nếu an toàn thì **checkout feature branch mới từ `origin/main`**. Không cần commit trên `main`.
- Tất cả script tự động do project tạo cho người dùng sử dụng Windows cần có bản **PowerShell** (`.ps1`) hoặc chạy cross-platform thực sự. Push guard: `scripts/push_issue_branch.ps1`. Git for Windows hỗ trợ hook `.githooks/pre-push` dưới dạng shell script POSIX; cần test hook bằng Git for Windows và không yêu cầu WSL/Linux.
- Không dùng `sudo`, `apt`, `bash scripts/...` hay đường dẫn `/media/iamqthanq/...` trong script chạy Windows. Khuyến nghị dùng `npm run ...`, `python -m ...`, `scripts/check.ps1`.
- Python virtualenv trên Windows: `.venv\Scripts\python.exe`; không giả định `.venv/bin/python`. Không tự cài Docker Desktop/WSL/Ollama hoặc bật auto-start của chúng khi chưa được giao/duyệt.
- **Cấu hình này thay thế mọi đường dẫn Linux trong bản plan trước.** Các nguồn PDF nằm ở thư mục cha trên Windows vẫn nằm **ngoài scope**, không di chuyển/sửa/xóa.

### 0.3. Ranh giới mục tiêu demo

**Phải có:** Upload PDF/TXT → trích xuất theo trang → tùy chỉnh chunk size/overlap → xem chunk và nguồn → embedding thật → Pinecone vector upsert/fetch → top-k semantic search/filter → inspect kết quả → LLM RAG local khi khả dụng → minh họa Slab Architecture → Guided Demo. Frontend làm bằng Taste Skill, animation dùng GSAP đúng chỗ. Có kiểm thử và chạy cục bộ.

**Không làm:** Hệ thống đa tenant, login/RBAC, billing, Kubernetes, sản phẩm SaaS production, analytics vận hành chuyên sâu, crawler diện rộng, fine-tuning model, triển khai nền tảng Vector DB mới, benchmark học thuật lớn, 3D cầu kỳ không phục vụ seminar.

**Mục tiêu chất lượng:** Khi demo, thầy có thể hỏi “chunk này từ đâu?”, “embedding model nào?”, “384 chiều là gì?”, “vector lưu namespace nào?”, “score lấy từ đâu?”, “nếu tắt LLM thì sao?”, “thành phần slab thật hay mô phỏng?” — hệ thống hiển thị được bằng chứng rõ ràng.

---

## 1. KIẾN TRÚC VÀ NGUYÊN TẮC KỸ THUẬT CHỐT

### 1.1. Công nghệ ưu tiên miễn phí

| Hạng mục | Đề xuất | Ghi chú |
|---|---|---|
| Frontend | React + TypeScript + Vite | Local |
| Styling + primitive | Tailwind CSS + shadcn/ui/Radix (chọn phiên bản phù hợp) | UI có accessibility |
| UI design skill | `Leonxlnx/taste-skill`, skill `design-taste-frontend` | Đọc/kiểm tra skill, pin commit trước khi dùng |
| Animation skill | `greensock/gsap-skills` | `gsap-core`, `gsap-timeline`, `gsap-react`, `gsap-performance` |
| Animation runtime | `gsap`, `@gsap/react` | Chỉ trình bày state có thật |
| Diagram | React Flow | Pipeline và Slab Simulator |
| Backend | FastAPI + Python | API local, giữ API key phía server |
| Metadata + file manifest | SQLite + thư mục local cho upload | Có schema migration nhẹ |
| PDF | `pypdf` hoặc thư viện tương đương có giấy phép phù hợp | PDF scan không có text → cảnh báo, không bịa OCR |
| Chunking | Tokenizer tương thích embedding model | Mặc định **300 tokens / overlap 50**, cho phép chỉnh |
| Embedding | `intfloat/multilingual-e5-small` local | **384 chiều**, `passage:` / `query:`, giới hạn token được kiểm soát |
| Vector DB live | Pinecone Starter | Gói free có hạn mức; cần Internet/API key |
| Offline demo | Local vector adapter tính similarity từ vector thực + SQLite/NumPy | **Không được gọi là Pinecone** |
| LLM optional | Ollama + Qwen2.5 1.5B/3B local | Mô hình nhỏ hơn nếu máy không đủ RAM |
| Test | Pytest + Vitest + Playwright + axe-core | Không cần cloud credentials cho CI mặc định |
| Dev/Build | npm/pnpm (chọn một và lockfile), Python venv, Docker Compose tùy máy | Không tự bật Docker autostart |

### 1.2. Ba mode phải có nhãn nhất quán

1. `LIVE PINECONE`: truy xuất API Pinecone thực, tên index và namespace thật, score thật, latency thật.
2. `LOCAL DEMO`: vận hành offline bằng adapter local, **nếu model đã cache** có thể dùng vector thật; nếu dùng fixture có sẵn phải ghi rõ `sample fixture`. Không nói dữ liệu là từ Pinecone.
3. `SLAB SIMULATOR`: **mô phỏng giáo dục** theo tài liệu kiến trúc; KHÔNG phải telemetry trạng thái memtable/slab thật của Pinecone.

### 1.3. Hành trình UX

Trang chính nên gọn, có 5 khu vực điều hướng, chứa đủ các phân hệ gốc:
- **Overview / Guided Tour**: dashboard, trạng thái model/database, hành trình toàn pipeline.
- **Documents Lab**: upload, extraction, chunking lab, document versions.
- **Vectors Lab**: embedding inspection, index/namespace manager, vector explorer.
- **Search Lab**: top-k semantic search, metadata filters, search trace, RAG chat tab.
- **Architecture Lab**: Slab Simulator write/read/compaction và giải thích.

Dùng sidebar rõ ràng, breadcrumbs và stepper; không bắt người dùng chuyển qua 9 trang rời rạc mỗi lần demo. Mỗi khu vực vẫn có deep link để thầy yêu cầu mở bất kỳ tính năng nào.

### 1.4. Data contract bắt buộc

- `Document`: id, safe filename, type, page count, status, created_at.
- `Page`: document_id, page_number (1-based), extracted_text, extraction status.
- `Chunk`: chunk_id, document_id, version, start/end page, text, token_count, ordinal, strategy, size/overlap.
- `Embedding`: model_id, model_revision, dimension, normalized flag, vector values, source chunk id.
- `VectorManifest`: index, namespace, vector id, chunk id, version, upsert status.
- `SearchHit`: id, score, namespace, source chunk/page, text, metadata, retrieval mode.
- `Trace`: stage, start/end or duration, mode, status, errors (không lộ token/secret).

Stable vector ID cho retry; ingest version mới trước, chỉ chuyển active version khi xác nhận thành công; không tự xóa dữ liệu cũ chưa có xác nhận. Không hứa Pinecone liệt kê toàn bộ vector như bảng SQL: dùng local manifest làm index danh sách ID, sau đó fetch thật khi cần.

---

## 2. QUY TẮC TIẾN ĐỘ: MỘT MỤC = MỘT ĐƠN VỊ GIAO VIỆC

- Mỗi mục `D01` đến `D09`: có **Mục tiêu → Công việc con → Deliverable → Gate kiểm thử → Bằng chứng bàn giao → Phụ thuộc**.
- Một lần gửi **PROMPT THỰC THI MỤC N** thì Coding Agent xử lý hết tất cả công việc con của mục N theo thứ tự phụ thuộc; không hỏi sau từng công việc nhỏ. Mỗi công việc con phải tự chạy kiểm tra liên quan trước khi chuyển tiếp.
- **Không tạo 32 Issue**, không tạo 5 PR trong một mục. Tối đa **9 Issue triển khai chính**, trừ khi người dùng cho phép thay đổi phạm vi.
- Không triển khai sang mục sau khi chưa có review và quyết định merge của người dùng.
- Nếu phát hiện lỗi trong phạm vi mục hiện tại, agent tự sửa và test lại trên cùng nhánh, không mở thêm Issue. Nếu lỗi vượt phạm vi, ghi vấn đề để ChatGPT quyết định đưa vào mục sau.
- Các câu lệnh `scripts/check.ps1` (hoặc npm/Python commands tương đương; có thể tạo make targets tùy chọn) là **giao diện mong muốn**; D01 chịu trách nhiệm tạo công cụ thực thi trước khi xem như có sẵn.

### Tóm tắt 9 mục

| Mục | Tên mục tiêu | Demo khi hoàn thành |
|---|---|---|
| D01 | Nền tảng chạy được + Git/CI + UI shell theo Taste | Mở web đẹp có dashboard khung, API health, CI xanh |
| D02 | Upload và chia Chunk thật, xem được nguồn | Upload PDF mới, chỉnh chunk size/overlap, xem và xuất chunks |
| D03 | Embedding local hoạt động và quan sát được | Biến chunk/query thành vector 384D, hiển thị model/token/latency |
| D04 | Pinecone live + local adapter + vector storage | Tạo/chọn index, namespace, upsert và fetch vector, version an toàn |
| D05 | Semantic Search hoạt động hoàn chỉnh | Nhập câu hỏi, top-k, score, filter, source page, execution trace |
| D06 | RAG Chat local có dẫn nguồn | Ollama tạo câu trả lời từ top-k, tắt LLM vẫn search được |
| D07 | Slab Simulator + Guided Demo trực quan | Chạy write/read/compaction step-by-step; guided pipeline xuyên màn |
| D08 | Taste + GSAP polish toàn bộ | Giao diện ấn tượng, transition mượt, a11y/responsive tốt |
| D09 | Kiểm thử tích hợp + đóng gói + seminar acceptance | Clean build, offline fallback, live smoke có kiểm soát, tài liệu và kịch bản |

---

## 3. CHI TIẾT TỪNG MỤC — CÁI GÌ PHẢI THU ĐƯỢC

### D01 — BOOTSTRAP, DESIGN FOUNDATION, CI

**Mục tiêu cuối:** Repo được tổ chức đúng, web **đã khởi động thật**, backend **đã gọi được**, layout nhìn chuyên nghiệp từ đầu, có công cụ build/test tự động; không chỉ tạo Markdown rỗng.

**Công việc tự thực hiện theo thứ tự:**
1. Inspect repo/workdir và Issue #1 thực tế; xử lý đúng quy tắc bảo toàn file. **Windows workdir đã có `.git` nhưng local `main` ở trạng thái unborn/no commits, trong khi `origin/main` có commit** theo lần kiểm tra gần nhất. Kiểm tra lại, fetch và tạo feature branch an toàn từ `origin/main` mà không xóa `.git`, không clone lại hay reset. Đọc chính sách hiện có.
2. Thiết lập per-Issue feature branch, `AGENTS.md`, `docs/BRANCH_POLICY.md`, `scripts/push_issue_branch.ps1`, `.githooks/pre-push` và test guards. Giữ GitHub workflow chuẩn nguồn thật; không giả nội dung.
3. Khởi tạo `apps/web` (Vite/React/TS/Tailwind), `apps/api` (FastAPI), `.env.example`, `.gitignore`, README, API `/api/health`, API client, route shell.
4. Tạo design brief dành riêng cho Vector Database (không phải template SaaS vô hồn), kiểm tra & áp dụng Taste Skill; define palette, type, spacing, surface, grid, sidebar, top bar, progress stepper, buttons, inputs, cards, toasts, skeleton, empty/error states.
5. Tạo **Dashboard shell có dữ liệu trạng thái thật**: backend online/offline, Pinecone `not configured`, embedding `not loaded`, cùng các entry point; không bịa số record.
6. Tạo Vitest/Pytest ESLint/Ruff/TS strict, `scripts/check.ps1` / npm/Python scripts tương đương, GitHub Actions offline CI lint+unit+build+smoke; lock dependencies. Không ép tải LLM/model nặng.

**Deliverables:** Website mở được ở localhost; FastAPI health; Dashboard shell điều hướng; design tokens và UI components dùng lại; Git guards hoạt động; CI; README hướng dẫn chạy.

**Gate D01:** Frontend production build PASS; backend health PASS; 1+ component test PASS; 1+ API test PASS; negative tests push guard (main/wrong remote/wrong refs) PASS trong test fixture; không secret; screenshot desktop 1440 và mobile 390 không overflow. Nếu GitHub workflow nguồn chưa có, báo rõ BLOCKED cho hạng mục đó, không tự tái tạo bản giả.

**Phụ thuộc:** Không; sử dụng Issue #1 hiện có sau khi ChatGPT cập nhật scope thống nhất với kế hoạch này.

### D02 — DOCUMENT UPLOAD, EXTRACTION & CHUNKING LAB

**Mục tiêu cuối:** Người dùng upload PDF/TXT bất kỳ có text, xem text theo trang và tự thay đổi cách chia chunks ngay trong web; dữ liệu có thể truy nguồn.

**Công việc:**
1. Upload API + drag-drop UI, MIME/size validation, tên file an toàn, xử lý file hỏng/trống/quá lớn.
2. PDF text extraction 1-based page metadata, preview, cảnh báo PDF scan/không có text layer, không OCR tự động.
3. Token-aware chunk engine dùng tokenizer tương thích `multilingual-e5-small`; paragraph/sentence-aware rồi token fallback; kiểm tra chunk size > 0, 0 ≤ overlap < size, giới hạn model (kể cả prefix); không chunk rỗng.
4. UI Chunking Lab có cấu hình size 300/overlap 50 mặc định, nút Generate, danh sách chunk, token count, page range, overlap highlight, preview full text, copy/export JSONL.
5. SQLite Document/Page/Chunk drafts, phân biệt preview và confirmed configuration; thay đổi tham số không tự upsert.
6. Dùng Taste hướng dẫn layout và GSAP nhẹ khi chia chunk nếu có cơ chế reduced-motion, không cần animation hoành tráng.

**Deliverables:** Luồng PDF → pages → preview → configurable chunks → export, có dữ liệu thật.

**Gate D02:** Test file PDF tiếng Việt 1/nhiều trang; text dài/ngắn; overlap 0/50; bad PDF, empty/scan, Unicode; oracle kiểm tra coverage/không mất dữ liệu sau chuẩn hóa có khai báo; E2E upload→chunk; `scripts/check.ps1` + frontend build PASS, screenshot workflow. Không upsert Pinecone ở bước này.

**Phụ thuộc:** D01.

### D03 — LOCAL EMBEDDING & EMBEDDING INSPECTOR

**Mục tiêu cuối:** Người dùng chọn chunk hoặc nhập query, chạy embedding local thật, quan sát vector 384 giá trị, thấy model đang dùng và mối liên hệ giữa 2 câu theo cosine.

**Công việc:**
1. Tích hợp model `intfloat/multilingual-e5-small` (384D); ghi model revision/config; query prefix `query:`, document prefix `passage:`; tokenizer giới hạn đầu vào và thông báo thay vì truncate ngầm.
2. API generate embeddings theo batch; kiểm tra finite values, dimension và normalization cho cosine; thời gian inference + error khi model chưa cache/chưa tải.
3. UI Embedding Inspector: select chunk, view 384D dưới dạng table/bars, copy vector preview, model name/dimension, duration, source chunk.
4. Semantic similarity mini-experiment: 2 câu gần nghĩa vs khác nghĩa, hiển thị cosine; không trình bày score là probability. Nếu làm PCA 2D thì gắn nhãn là projection, không phải không gian 384D thật.
5. Model download có bước opt-in rõ và dung lượng báo trước; CI dùng mock embedding deterministic, không tự tải model.

**Deliverables:** Chunk thật → model local → vector 384D, truy vấn cũng embed được.

**Gate D03:** 384 chiều, hữu hạn, prefix đúng, max token có test, embedding batch, matching model query/chunk, cosine test bằng oracle vector biết trước, model unavailable handling, UI test; build + regression PASS; ghi rõ offline model cache requirement.

**Phụ thuộc:** D02.

### D04 — INDEX / NAMESPACE, PINECONE, UPSERT & VECTOR EXPLORER

**Mục tiêu cuối:** Người dùng kết nối Pinecone Starter bằng key backend, xem index/namespace, chọn hoặc tạo index phù hợp, upsert vector thật, fetch và inspect dữ liệu, có local demo fallback.

**Công việc:**
1. Tạo `VectorStore` interface và hai adapters: `PineconeLiveAdapter`, `LocalDemoAdapter` (tìm/đọc cosine thực trên vectors local, không giả gọi Pinecone).
2. Backend-only credential validation, API index list/create (có xác nhận và kiểm tra quota), select index, dimension=384, metric cosine, namespace; hiển thị rõ model-index compatibility.
3. Local SQLite document version manifest + stable IDs + metadata source/page/filename; upsert batch có progress, retry có giới hạn, throttling, idempotency, partial failure.
4. Chỉ mark active version sau khi ingest thành công; re-chunk/re-index không tạo kết quả lẫn version; cleanup version cũ cần confirmation và hiển thị danh sách ID dự định xóa.
5. Vector Explorer đọc IDs từ local manifest, fetch values/metadata thật (khi live), hiển thị 384D, source chunk, status; thao tác xóa có xác nhận.
6. Offline demo không cần Pinecone key; API errors, 401/403/quota/timeout có hướng dẫn dễ hiểu.

**Deliverables:** Live Pinecone upsert/fetch và offline local vector storage có nhãn mode chính xác.

**Gate D04:** Mock/contract tests, wrong dimension, duplicate index, bad key, empty namespace, retry/partial failure, idempotent ingest, version consistency, delete confirmation, secret scan và regression; live smoke **chỉ khi người dùng cung cấp API key + đồng ý thao tác cloud**; nếu chưa chạy live ghi NOT VERIFIED, không giả PASS.

**Phụ thuộc:** D03.

### D05 — SEMANTIC SEARCH & FILTER EXPLAINABILITY

**Mục tiêu cuối:** Nhập câu hỏi tiếng Việt, hệ thống tìm top-k chunk liên quan từ live Pinecone hoặc local demo, thấy score, filter, trang nguồn và từng bước xử lý.

**Công việc:**
1. `/api/search` dùng same embedding config, namespace, index và top-k hợp lệ, metadata filters (document_id, file, page hoặc metadata cho demo); `SearchHit` có provenance.
2. Search Lab UI: query, top-k 1–10, mode/index/namespace, filter builder, result cards, score, source snippet, document link/page, empty/error/loading.
3. Search trace stage durations (embed/query/fetch), trạng thái real/mock, tùy chọn so sánh with/without filter.
4. Test known-fixture cosine ranking, metadata filtering và namespace isolation; nếu Pinecone live và offline có sai biệt xấp xỉ phải giải thích, không ép exact ranking mọi hoàn cảnh.
5. Không cần LLM. Show complete semantic search output ngay khi Ollama chưa cài.

**Deliverables:** Semantic Search độc lập chạy được, có nguồn và giải thích metric.

**Gate D05:** Query no result/invalid filter/top-k edge, wrong namespace, Unicode/Vietnamese, score not percentage, test E2E search+filter, browser keyboard, production build và existing test suite PASS.

**Phụ thuộc:** D04.

### D06 — OPTIONAL LOCAL RAG QUESTION ANSWERING

**Mục tiêu cuối:** Thầy hỏi trực tiếp trong web, hệ thống trả lời dựa trên top-k chunk đã truy xuất và gắn nguồn; không sử dụng API LLM trả phí.

**Công việc:**
1. Ollama adapter local, select configured Qwen2.5 1.5B/3B, readiness check, timeout và error fallback. Không bắt auto-download model nặng khi test.
2. RAG service: query→retrieval→context assembly→LLM, token budget, provenance, prompt giới hạn dựa trên context; trả `answer`, `used_sources`, `retrieval_hits`, trace.
3. UI RAG Chat tab trong Search Lab, câu trả lời, model info, source links tới đúng document/page/chunk, hiển thị dữ liệu nền đã gửi.
4. Có nút tắt LLM hoặc chuyển Semantic Search; khi Ollama chết search không bị ảnh hưởng.
5. RAG có thể từ chối trả lời khi dữ liệu không đủ; kiểm soát prompt injection trong tài liệu; không giả nguồn.

**Deliverables:** Chat RAG local trả lời kèm nguồn khi model chạy, graceful fallback khi không có.

**Gate D06:** Mock Ollama deterministic, no retrieved source, model missing/timeout, source link correctness, injection fixture, context truncation, E2E chat mock, smoke Ollama real có điều kiện, build+regression PASS. Nếu model chưa tải: đánh dấu LLM LIVE TEST BLOCKED nhưng Semantic Search vẫn PASS.

**Phụ thuộc:** D05.

### D07 — SLAB ARCHITECTURE SIMULATOR & GUIDED DEMO

**Mục tiêu cuối:** Một buổi demo liền mạch từ upload đến tìm kiếm, song song một mô phỏng sinh động về Pinecone Slab Architecture có controls, không lẫn với telemetry thật.

**Công việc:**
1. Xây state machine mô phỏng write path (buffer/memtable→slab levels/compaction) và read path (router→executor→candidate merge→top-k), ghi **SIMULATION**, chỉ minh họa khái niệm theo nguồn tài liệu; không khẳng định mỗi detail là telemetry/implementation thực tại.
2. React Flow graph; GSAP timeline có Play/Pause/Next/Back/Replay/Reset/Speed; state machine quyết định nội dung, GSAP chỉ biểu diễn.
3. Guided Demo trên app: stepper Upload→Extract→Chunks→Embedding→Upsert→Search→RAG optional→Slab; giữ step state giữa các khu vực; có gói tài liệu mẫu có bản quyền sử dụng phù hợp và cách reset riêng dữ liệu demo.
4. Local offline seeded demo (và model cache nếu cần) chạy được không có Pinecone key; hiển thị mode rõ; reset không xóa dữ liệu cá nhân.
5. Nội dung giải thích ngắn gọn cho từng bước và key facts cho giảng viên.

**Deliverables:** Một nút `Start Guided Demo` chạy xuyên pipeline; một Slab Simulator có animation và từng bước điều khiển.

**Gate D07:** State transitions deterministic, reset/seek, reduced motion, unmount cleanup, offline full-tour E2E, không có fabricated metric; source of claims documented, screenshot/recording, app build+regression PASS.

**Phụ thuộc:** D05; tận dụng D06 khi có.

### D08 — PREMIUM FRONTEND PASS WITH TASTE SKILL & GSAP SKILLS

**Mục tiêu cuối:** Web demo đẹp, mượt, có điểm nhấn như một developer tool cao cấp nhưng vẫn dễ hiểu/dễ thao tác trước giảng viên.

**Công việc:**
1. Rà soát tất cả màn hình ở 1440/1024/768/390; audit theo Taste Skill (đọc `SKILL.md`, version pinned, sử dụng browser inspect & screenshots nếu môi trường hỗ trợ), không sử dụng prompt “làm đẹp” chung chung.
2. Tạo design QA checklist: hierarchy, typography, alignment, density, contrast, components, empty/loading/error, visual storytelling, label/số liệu.
3. Tối ưu sidebar, pipeline timeline, chunk card, embedding panel, score, vector explorer, RAG chat, simulator, responsive; tránh glassmorphism dày đặc và trang dashboard template generic.
4. GSAP polish: chuyển trạng thái pipeline, chunk split/cards, embedding vector reveal, upsert feedback, search top-k entrance, Slab timeline. Sử dụng `gsap-react`, timeline, performance guidance; chỉ chạy khi phù hợp.
5. `prefers-reduced-motion` fallback, keyboard and focus, axe-core; animation cleanup/cancel khi đổi tab, route hoặc dữ liệu; không giữ animation vô hạn gây lag.
6. Lưu screenshot trước/sau, chạy visual regression và performance profile ở máy demo.

**Deliverables:** Giao diện visual hoàn thiện trên màn hình seminar, tablet và mobile đọc được; không làm hỏng tính năng.

**Gate D08:** Visual review từng view; Playwright screenshots, screenshot diff có baseline xét duyệt; axe serious/critical = 0 ở main flows; không overflow; no dead buttons; key navigation; reduced-motion tests; no janky main path; build+E2E+regression PASS.

**Phụ thuộc:** D01–D07.

### D09 — FINAL AUTOMATED QA, PACKAGING & SEMINAR HANDOFF

**Mục tiêu cuối:** Checkout sạch có thể khởi chạy lại, demo được ngay, có chứng cứ tính đúng đắn, tài liệu, kịch bản 5–7 phút, và không phụ thuộc vào Internet khi dùng local demo.

**Công việc:**
1. Hoàn thiện `scripts/check.ps1`: frontend lint/typecheck/unit/build, backend lint/unit/API, offline integration, Playwright E2E, a11y, static security; ghi versions/commands.
2. Docker Compose cho web+api (tùy chọn Ollama external/local), healthchecks, compose build/up/down; **không tự bật auto-start khi khởi động máy**, không kéo model rất nặng tự động.
3. Security audit: server-only keys, uploads path traversal, file size, CORS local, scan dependency/license, secrets, endpoints delete with confirmation, untrusted PDF text not instruction.
4. Fault injection: mất mạng, Pinecone rate limit/401, missing model, timeout, corrupt PDF, empty chunks, wrong dimension, partial upsert/reindex.
5. Live Pinecone smoke có kiểm soát bằng dữ liệu demo riêng nếu credentials/quota có sẵn, kiểm tra tạo/chọn index, upsert/query/fetch/delete riêng dataset demo; chi phí và xóa phải được phê duyệt.
6. Clean install runbook, `.env.example`, user guide, architecture/trace docs, demo fixtures, FAQ phản biện thầy hỏi, setup time and fallback plan.
7. Rehearsal trình diễn 5–7 phút và chụp/screenshots kết quả; xử lý mọi lỗi P0/P1; lập bảng known limitations chính xác.

**Deliverables:** Bản demo release-ready, reproducible tests, README từ A–Z, runbook offline/live, kết quả test minh bạch.

**Gate D09:** Clean setup PASS (theo môi trường đã kiểm tra), offline full E2E PASS, build CI PASS, test summary, no blocking security defect, live smoke được phân loại `PASS`/`BLOCKED NOT RUN` trung thực, demo rehearsal, reviewer chấp thuận và user merge. **Không gọi DONE nếu chưa có evidence.**

**Phụ thuộc:** D08.

---

## 4. TASTE SKILL & GSAP SKILLS — QUY TRÌNH ÁP DỤNG THẬT

**Nguồn chính thức được tham khảo:**
- Taste: https://github.com/Leonxlnx/taste-skill — skill cài theo tên `design-taste-frontend`.
- GSAP AI Skills: https://github.com/greensock/gsap-skills — có các skill `gsap-core`, `gsap-timeline`, `gsap-react`, `gsap-performance`.

**Không tự tin rằng đã cài**. Coding Agent ở D01 phải kiểm tra IDE (Antigravity/Codex/Gemini), đường dẫn skills, Node/browser requirements, xem README và SKILL.md, kiểm tra scripts/license, ghi commit SHA khóa phiên bản, xin phép nếu chuẩn bị chạy code bên thứ ba ngoài scope. Có thể tham khảo cách cài được README công bố:

```powershell
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
npx skills add https://github.com/greensock/gsap-skills
```

Lệnh trên chỉ là tham khảo, **không có nghĩa phải chạy ngay**. Có thể dùng skill files đã được kiểm tra thay cho cài trực tiếp từ latest. Đặc biệt Taste có thể cập nhật nhanh; ghi revision dùng cho mỗi mục, tránh đổi skill giữa chừng mà không báo.

**Design brief cố định:** “Interactive developer-tool workbench for Vector Database seminar. Premium technical aesthetic; clear data and status; restrained accent colors; distinct typography; structured but not generic dashboard. Every important animation teaches a processing step.” Không yêu cầu mô phỏng nguyên giao diện Pinecone Console, mà tạo trải nghiệm tốt hơn cho người học.

**Motion budget:** animation hover 120–200ms; trạng thái thông thường khoảng 200–450ms; minh họa pipeline có controls và thời lượng điều chỉnh; ưu tiên transform/opacity; giảm motion theo hệ điều hành; GSAP cleanup khi unmount; giữ ổn định 60fps trên máy demo nếu có thể đo, không đưa số PASS nếu chưa đo.

**Skill không thay test:** design final chỉ được duyệt sau browser screenshot + actual interaction + build + E2E. Nội dung UI phải giải thích thật, không dùng fabricated count/score/latency.

---

## 5. CHUẨN QA CHO CẢ 9 MỤC

### 5.1. Agent tự vận hành trong một mục

Với **mỗi công việc con**, agent tự động đi qua:

```text
Read specification → implement a coherent subtask → run targeted tests
→ fix errors → re-run → record evidence → move to next subtask
→ run integrated flow → run regression/build → inspect diff/security
→ commit → safe push → final report.
```

**Không hỏi người dùng sau từng subtask.** Chỉ hỏi khi cần API key/credential hoặc quyền, thao tác có nguy cơ mất dữ liệu/chi phí, Git policy conflict, hoặc một quyết định thiết kế ảnh hưởng toàn bộ scope không thể giải quyết theo plan. Nếu CI/test có lỗi thuộc scope thì tự sửa trước khi push. Nếu không thể sửa, báo `BLOCKED`, không dán nhãn `COMPLETE`.

### 5.2. Chứng cứ phải có ở cuối mỗi mục

- Github Issue URL và số thực tế; branch name; `git remote -v`; remote commit SHA.
- Danh sách changed files và bảng `requirement → file → test → evidence`.
- Các lệnh đã chạy, exit code, PASS/FAIL/BLOCKED/NOT_RUN/NOT_IMPLEMENTED.
- Frontend build, backend tests, E2E liên quan, screenshots nếu có UI; CI link khi xuất hiện.
- Rủi ro còn lại, giới hạn đã biết, mock vs live test.
- Không được tự PR/merge/close Issue. Review và Draft PR thuộc ChatGPT; merge thuộc người dùng.

### 5.3. Test bắt buộc theo cấp

- D01–D02: smoke, lint, typecheck, backend unit, frontend unit, production build, E2E luồng đã có.
- D03–D05: correctness oracle cho token/chunk/embedding/cosine/ID/version/filter, adapter contract, API tests, E2E, integration, build.
- D06: retrieval→LLM mock, prompt-injection fixture, source mapping, server failure, chat E2E, regression.
- D07–D08: state machine, GSAP lifecycle, reduced-motion, visual regression, keyboard/a11y, E2E guided path, build.
- D09: all checks, clean install, Docker optional path, offline E2E, controlled live smoke, security and performance acceptance.

**CI mặc định không chứa Pinecone API key và không cần Ollama/model download.** External live tests phải có mode rõ và được chạy riêng, tránh quota và phí. Không làm giả `PASS` khi chỉ có mock.

---

## 6. QUY TRÌNH ISSUE → AGENT → PR → REVIEW → USER MERGE

### Bước A — Trước một mục

1. ChatGPT kiểm tra repo, branch protection, trạng thái Issue cũ, merge trước đó.
2. ChatGPT tạo **hoặc cập nhật duy nhất một GitHub Issue** chứa **toàn bộ MỤC N** và acceptance tests; không tạo Issue cho substeps. Với D01 ưu tiên **cập nhật Issue #1 đang mở** sau khi xác nhận không có branch/PR đang triển khai khác, tránh đặc tả mâu thuẫn.
3. ChatGPT cung cấp Prompt B cho MỤC N với Issue number thật, branch pattern, scope, dependencies và test gates.

### Bước B — Agent làm trọn mục

1. Đọc plan này, Issue thật và repo policies. Kiểm tra `git status` và remote, không ghi đè dữ liệu.
2. Tạo/checkout branch riêng cho Issue từ base branch đã xác minh; chỉ sửa file trong scope.
3. Thực hiện **toàn bộ** substeps và tự test/fix khi có lỗi; ghi log và kết luận từng substep.
4. Chạy quality gate của toàn mục; chỉ push khi thỏa điều kiện hoặc báo blocker cụ thể.
5. Commit và push qua script/hook đã duyệt; tuyệt đối không push `main`/không force push/không PR/merge.

### Bước C — ChatGPT độc lập kiểm chứng

1. Xác minh remote SHA và branch thật; check PR trùng; mở **Draft PR** với base verified integration.
2. Review diff thật, đối chiếu gate, code correctness, test quality, secrets, phạm vi, UI screenshots.
3. Verdict `PASS / FIX REQUIRED / BLOCKED / INCONCLUSIVE` kèm finding file/line và cách tái hiện.
4. Nếu FAIL: agent sửa **trên cùng branch/PR**, test lại, push; ChatGPT re-review. Không tạo vòng Issue mới cho lỗi trong mục.
5. Nếu PASS: ChatGPT báo **READY FOR USER MERGE**; **người dùng duy nhất quyết định merge**. Sau merge mới sang mục sau.

### Lưu ý bảo vệ Git

- Kế thừa tinh thần của Seminar_RapidFlow: `AGENTS.md`, push guard script, `.githooks/pre-push`, config `push.default=nothing`, explicit refspec.
- Khác Seminar_RapidFlow: **mỗi Issue một feature branch** (không khóa tên `QuangThang`). Hook/script phải kiểm tra branch có **Issue số thật đang active**; regex branch hợp lệ chưa đủ, vì có thể push nhầm branch của Issue khác. Có thể dùng biến/config file local xác minh Issue active; không commit credential.
- Server-side branch protection/rulesets phải được người dùng bật/chấp thuận; hooks/prompt không thể ngăn tuyệt đối khi agent dùng credential có quyền admin.

---

## 7. DEMO ACCEPTANCE: 5–7 PHÚT

1. **Overview (~30s)**: thấy backend/Pinecone/model mode rõ ràng; nút Start Guided Demo.
2. **Document (~1m)**: upload PDF mới → extract text theo trang → chỉnh size/overlap → chunk cards có nguồn.
3. **Embedding (~1m)**: chọn chunk → vector 384D; model name, query/passages, dimension, latency thật.
4. **Pinecone (~1m)**: index/namespace, upsert, fetch ID, nhìn metadata và liên kết nguồn.
5. **Semantic Search (~1–1.5m)**: nhập câu hỏi → top-k → score/filter → click thấy trang/chunk.
6. **RAG (~30–60s)**: bật/tắt local LLM; có answer/source khi model available.
7. **Architecture (~1m)**: Slab Simulator read/write/compaction, play/pause/next/reset và nhãn SIMULATION.

**Đường demo dự phòng:** khi mất mạng chuyển `LOCAL DEMO`, nêu rõ Pinecone không được gọi; khi Ollama unavailable vẫn trình diễn Search. Thời gian thực sẽ đo trong rehearsal, không đảm bảo bằng lời.

---

## 8. ĐỊNH NGHĨA HOÀN THÀNH TOÀN DỰ ÁN

- [ ] Tất cả 09 mục có PR đã được user duyệt/merge hoặc có waiver rõ ràng.
- [ ] Upload PDF/TXT → pages → chunks → vector 384D → Pinecone upsert → query top-k chạy thật với test/evidence.
- [ ] Local Demo hoạt động được không cần Pinecone cloud, nhãn đúng.
- [ ] RAG local có câu trả lời/source khi Ollama model sẵn sàng; search hoạt động độc lập nếu không có LLM.
- [ ] Slab Simulator và Guided Demo chạy, không nhầm mô phỏng với telemetry.
- [ ] Taste và GSAP được tích hợp có kiểm chứng; responsive/accessibility/reduced-motion ổn định.
- [ ] Các build/test gates và CI phản ánh đúng kết quả; không còn P0/P1 chưa xử lý.
- [ ] Không có API key trong frontend/repo; không tự xóa dữ liệu người dùng hoặc tạo chi phí cloud ngoài quyền.
- [ ] Clean setup hướng dẫn chạy được, kịch bản demo, FAQ phản biện, screenshots và báo cáo kiểm thử có link/sha.

---

## 9. PROMPT A — CHỈ ĐỌC PLAN (GỬI TRƯỚC CHO CODING AGENT)

> **Gửi kèm file master plan này**, và dùng đúng prompt sau:

```text
Bạn là Coding Agent của dự án Pinecone Visual Lab.

Trước tiên hãy ĐỌC TOÀN BỘ file PINECONE_VISUAL_LAB_DEMO_MASTER_PLAN_v2_1_WINDOWS.md và hiểu mục tiêu DEMO, kiến trúc, 09 MỤC, thứ tự phụ thuộc, chuẩn kiểm thử, quy trình GitHub, Taste Skill và GSAP Skills.

Đây là chế độ PLAN-READ-ONLY. Ở bước này TUYỆT ĐỐI KHÔNG:
- sửa/tạo file trong project;
- cài package hay tải model;
- tạo branch, clone, commit hoặc push;
- tạo Issue/PR/merge;
- gọi Pinecone API hay tác động dữ liệu cloud.

Đầu ra tôi cần:
1. Tóm tắt mục tiêu và phạm vi demo trong 8–12 câu.
2. Liệt kê 09 MỤC theo thứ tự, mỗi mục một câu mô tả kết quả cuối.
3. Nêu rõ vòng làm việc: nhận PROMPT MỤC N → tự hoàn thành mọi việc con → tự test/sửa → commit/push feature branch → báo SHA → ChatGPT review/mở PR → tôi merge.
4. Nêu môi trường/repository/path, nhãn LIVE/LOCAL/SIMULATION, 2 repo skill sẽ dùng, và vấn đề rủi ro lớn nhất.
5. Xác nhận chỉ chờ PROMPT THỰC THI MỤC 1, không tự triển khai.

Nếu có sự thiếu nhất quán trong plan, báo bằng câu hỏi ngắn; KHÔNG tự ý sửa scope.
```

## 10. PROMPT B — KHUNG THỰC THI MỘT MỤC (CHATGPT SẼ ĐIỀN CHO MỤC N)

```text
TASK: Execute the ENTIRE Phase D<N> from PINECONE_VISUAL_LAB_DEMO_MASTER_PLAN_v2_1_WINDOWS.md.
GitHub Issue: #<ACTUAL_ISSUE_NUMBER> — <ISSUE_URL>
Repository: iamqthanq/pinecone-visual-lab
Workdir: D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab
Feature branch: feature/issue-<ACTUAL_ISSUE_NUMBER>-<slug>
Integration: main, unless verified repository policy differs.

Read project policy and the exact Phase specification first. Perform ALL subordinate tasks sequentially or in dependency-safe order without pausing to seek approval between subtasks. After EACH subtask, execute its targeted tests and fix defects before proceeding. At the END of the entire phase, run the phase Gate, regression tests, build and security/diff review.

Use approved Taste/GSAP skills when UI/animation is in scope and verify actual browser output. Do not fabricate data or test PASS. Do not introduce paid services. Do not delete user data or perform unapproved destructive actions.

After full verification, commit + safe-push ONLY the assigned feature branch. Do not open PR, merge, close Issue, or start Phase D<N+1>.

Return: Issue URL, branch, local+remote SHA, files changed, subtask checklist, test/build commands with exit codes, screenshots/logs, blockers/limitations, and a clear READY FOR CHATGPT REVIEW or BLOCKED verdict.
```

### Chỉ thay `D<N>`, số Issue thật, URL và branch sau khi ChatGPT đã tạo/cập nhật Issue.

---

## 11. GHI CHÚ CHUYỂN TỪ KẾ HOẠCH CŨ

Bản kế hoạch cũ `8 tuần / 32 Issue` là bản nghiên cứu quy mô lớn hơn nhu cầu hiện tại. **Bản v2 này thay nó về mặt tổ chức công việc**: 9 kết quả demo lớn, 1 Issue/PR mỗi mục, agent tự hoàn thành mọi tiểu mục trước khi bàn giao. Không có nghĩa là 32 Issue đã được tạo hoặc sẽ tự được xóa. Mọi thay đổi GitHub thực tế do ChatGPT thực hiện riêng khi bắt đầu Mục, có kiểm tra tránh xung đột.
