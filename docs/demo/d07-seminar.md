# Kịch bản Guided Demo D07 — mục tiêu5–7 phút

Đây là thời lượng thuyết trình dự kiến, **không phải benchmark**. Chuẩn bị trước cache E5 đã xác minh; API/web chạy bằng các lệnh PowerShell trong README. Không cần key cloud hoặc Ollama. Lần load E5 đầu tiên phụ thuộc máy, có thể kéo dài phần trình diễn. Thử trước trên máy seminar và giữ bản ghi evidence để đối chiếu, không thay nó cho trạng thái runtime.

Tài liệu mẫu `apps/api/app/demo_sample.txt` do dự án tự biên soạn, tiếng Việt, **CC0-1.0**. Văn bản giải thích embedding, cosine, namespace, nguồn và kiến trúc; không phải telemetry hoặc bài viết được sao chép. Download/Upload ngoài tour vẫn dùng Documents Lab bình thường. Trong tour, nút Upload dùng đúng mẫu này và namespace LOCAL riêng.

| Phần | Thao tác | Giải thích cho giảng viên |
| --- | --- | --- |
| ~30giây | Overview → Start Guided Demo | Phân biệt dữ liệu local thực, E5 thật, LLM tùy chọn và simulation. Chưa có bước nào hoàn thành do chỉ mở trang. |
| ~60giây | Upload sample → Next → Inspect extracted pages | File TXT thật được lưu local ignored, một trang logic, Unicode tiếng Việt. Mở metadata/text để kiểm nguồn. |
| ~45giây | Preview300/50 → đọc chunk/token/page → tích xác nhận → Confirm | Tokenizer E5 thật, preview khác confirmed; ID phiên bản giữ nguồn ổn định. |
| ~45giây | Generate embedding → xem384 giá trị, norm, model/token/source | E5 CPU thật với `passage: `; số chiều và thời gian lấy từ kết quả thực. Nếu thiếu cache, dừng phần model, không dùng fixture rồi gọi là E5. |
| ~45giây | Preview ingest → xác nhận → chạy/resume batch → Fetch | SQLite LocalDemoAdapter thật, chỉ ACTIVE sau verification, namespace riêng. Không gọi Pinecone cloud. |
| ~60giây | Search câu hỏi, Top-K1/3, thử page2 rồi page1, mở exact source | `query: `, lọc trước Top-K; page2 rỗng vì mẫu TXT chỉ một trang. Cosine là độ tương đồng, không phải xác suất. Trace là thời gian đo thực tế. |
| ~20giây | RAG search-only hoặc Skip optional RAG | Thiếu Ollama không làm hỏng Search. Mock chỉ có trong test và luôn ghi NOT REAL LLM; không khẳng định Qwen thật đã chạy. |
| ~90giây | Architecture → ba walkthrough dưới đây | Mọi vector/slab ở đây là mô hình giáo dục2D, tách biệt384D local. Không suy ra latency/QPS Pinecone. |

Câu hỏi tự biên soạn để thử: “Tìm kiếm vector sử dụng embedding và cosine như thế nào?”; “Namespace giúp phân biệt dữ liệu giữa các phiên trình diễn ra sao?”; “Vì sao kết quả tìm kiếm phải có nguồn tài liệu và trang?”. Kết quả thứ hạng phụ thuộc nội dung/cấu hình phiên đã xác nhận, không hardcode đáp án/score.

## Ba walkthrough có thể chạy lại

1. **Write + Flush:** chọn Write, Reset, Next qua Log → Acknowledge → Apply; chỉ ra WAL/memtable và nguồn đầu vào. Flush tạo L0/Object Storage mô phỏng. Play/Pause/Speed chỉ đổi cách xem; Back/Seek/Replay tái tạo cùng snapshot với seed7.
2. **Read + Candidate Merge + Top-K:** chọn Read, Next qua Query Router → fan-out → merge → Top-K. Mở bảng candidates và JSON. Query `[1,0]` cho `c-7` cosine`1/sqrt(2)` và latest`a-7` cosine0. Chỉ ra stale update, tombstone và foreign namespace đã bị loại trước ranking. Đây là phép tính toy có thể kiểm độc lập.
3. **Compaction:** chọn Compaction. Quan sát4 L0 →2 L1 →1 L2 qua plan/publish. Bản ghi mới nhất ở memtable không mất; tombstone`b-7` được giữ để không hồi sinh bản cũ. Mở event log/snapshot, rồi Back/Replay để so sánh. Không khẳng định Pinecone thật dùng đúng ngưỡng/quy tắc toy này.

Màn nhỏ có thể pan/zoom graph, đọc bảng và event log thay cho sơ đồ. Điều khiển dùng bàn phím; reduced-motion bỏ chuyển động GSAP. **Reset tour / simulation only** chỉ xóa tiến độ/receipt của tour, không xóa dữ liệu local hoặc LIVE. Cancel Guided Demo trở lại sử dụng bình thường. Không chạy cleanup dữ liệu cá nhân để làm đẹp buổi diễn.
