# QUY TRÌNH LÀM VIỆC GITHUB DÙNG CHUNG CHO NHIỀU DỰ ÁN

**Tên quy tắc:** `GITHUB_COLLAB_WORKFLOW_STANDARD`  
**Phiên bản:** 1.0 — 07/11/2026  
**Phạm vi:** Dự án phát triển phần mềm, nghiên cứu có mã nguồn, ứng dụng, dữ liệu/kiểm thử hoặc tài liệu kỹ thuật được quản lý trên GitHub.  
**Nguyên tắc trung tâm:** **Người dùng giao mục tiêu và quyết định merge; Coding Agent thực hiện và push; ChatGPT quản lý Issue/PR, kiểm tra bằng chứng và ra kết luận review.**

> Đây là **mẫu dùng chung**, không chứa tên repository, tên máy, branch hay thư mục cố định của một dự án cụ thể. Sao chép file vào mỗi repository **một lần** rồi cấu hình phần 1. Mọi quy trình sau đó chỉ cần người dùng mô tả nhiệm vụ, không cần nhắc lại toàn bộ các bước GitHub. File này không tự cài đặt vào các repository khác hoặc tự thay thế `AGENTS.md`/branch protection.

---

## 1. CẤU HÌNH MỘT LẦN CHO MỖI DỰ ÁN

Điền các giá trị dưới đây khi áp dụng file vào một repository. Không được tự đoán các giá trị quan trọng.

| Tham số | Giá trị dự án cần điền | Quy tắc |
|---|---|---|
| `REPOSITORY` | `owner/repository` | Xác minh qua `git remote -v` hoặc GitHub |
| `WORKDIR` | Đường dẫn repository hiện có | Mặc định **một checkout**, không clone/worktree lặp lại |
| `INTEGRATION_BRANCH` | Ví dụ `develop`, `QuangThang` hoặc `main` | Đích của mọi PR công việc; xác minh policy |
| `RELEASE_BRANCH` | Ví dụ `main` | Không push/merge trực tiếp nếu không được người dùng cho phép |
| `FEATURE_BRANCH_PATTERN` | Ví dụ `feature/issue-<N>-<slug>` | Ưu tiên quy ước/hook đã có của repo |
| `TEST_COMMANDS` | Lệnh test/build/lint có thật | Khám phá theo README/CI/config, không bịa |
| `PUSH_COMMAND` | Script của repo nếu có | Ưu tiên hook/script chính thức |
| `ISSUE_LABELS` | Tùy repo | Không tự tạo nhãn không cần thiết |
| `MERGE_POLICY` | User-only | ChatGPT/agent không tự merge |

**Nếu repo có `AGENTS.md`, `GEMINI.md`, `CONTRIBUTING.md`, `docs/BRANCH_POLICY.md`, `.github/` hoặc branch protection**, đọc các file/quy tắc đó trước. Nếu có mâu thuẫn, **không âm thầm bỏ qua hoặc ghi đè**: báo người dùng điểm mâu thuẫn và đồng bộ chính sách trước khi thực hiện hành động xung đột. Các chốt bảo vệ Git và giới hạn quyền luôn được giữ nguyên cho đến khi chủ dự án chấp thuận thay đổi.

---

## 2. PHÂN CÔNG VAI TRÒ — MẶC ĐỊNH CHO MỌI DỰ ÁN

| Người/vai trò | Trách nhiệm | Không được tự làm |
|---|---|---|
| **Người dùng / Chủ dự án** | Đưa yêu cầu, duyệt thay đổi phạm vi lớn, quyết định cuối cùng **merge** và nghiệm thu | Không bắt buộc thao tác Issue/PR thủ công |
| **ChatGPT / Người điều phối & reviewer** | Làm rõ phạm vi từ yêu cầu đã có; **tạo Issue**; đọc repo/commit; **mở Draft PR sau khi agent push**; review diff, test, correctness, security và chứng cứ; yêu cầu sửa; báo kết quả | **Không tự merge**, không tự xóa branch, không tự tuyên bố các test chưa chạy là PASS |
| **Coding Agent (Antigravity / Codex / Gemini Code / IDE Agent...)** | Đọc Issue; làm trên đúng feature branch; chỉnh code; chạy test; commit; **push**; cung cấp SHA, lệnh và logs; sửa theo review | Không tự merge, không tự đóng Issue, không tự mở PR nếu quy trình dự án giao ChatGPT tạo PR; không tự mở Issue phát sinh không được giao |
| **Reviewer thứ hai (tùy chọn)** | Phản biện độc lập trong trường hợp thật sự cần thiết | Mặc định **READ-ONLY**; không sửa/commit/push/merge |

**Phương án mặc định người dùng đã chọn:** ChatGPT tự kiểm tra độc lập so với coding agent ở những yêu cầu thông thường. **Không bắt buộc** đưa mọi PR qua Gemini hoặc một AI phản biện thứ hai. Việc sử dụng reviewer thứ hai chỉ theo điều kiện tại mục 7.

---

## 3. QUY TRÌNH CHUẨN — ISSUE → CODE/PUSH → CHATGPT TẠO PR → REVIEW → USER MERGE

### Bước 0 — Nhận nhiệm vụ

- Khi người dùng giao một công việc có phạm vi thực hiện cụ thể, ChatGPT kiểm tra project/repo hiện tại và thông tin cần thiết; không hỏi lại điều đã biết.
- Xác định kết quả mong muốn, phạm vi *in-scope / out-of-scope*, phụ thuộc, điều kiện nghiệm thu (*Definition of Done*) và test cần có.
- Không tự bắt đầu công việc khác chưa được người dùng giao. Với công việc nghiên cứu, ghi rõ nội dung đã được chốt và nội dung còn đề xuất.

### Bước 1 — ChatGPT tạo GitHub Issue

- Trước tiên tìm Issue đang tồn tại để tránh trùng lặp.
- Nếu chưa có, tạo **một Issue** chứa: bối cảnh, mục tiêu, bài toán, đầu vào/đầu ra, phạm vi, điều kiện nghiệm thu, kiểm thử, tài liệu/baseline tham chiếu, giới hạn rủi ro và quyền hạn.
- Liên kết parent issue / milestone khi có bằng chứng thực tế. Đưa người dùng URL Issue và số `#N`.
- Một Issue được giao một feature branch và thường một PR. Không tạo nhiều PR cho từng commit.
- Việc tạo Issue là một hành động GitHub có quyền ghi: chỉ thực hiện khi người dùng đã giao thực hiện một công việc trong quy trình này hoặc yêu cầu tạo Issue; không tạo Issue ngẫu nhiên để “tiện theo dõi”.

### Bước 2 — Coding Agent triển khai trên branch của Issue

1. Mở **đúng repo và thư mục hiện có**, đọc Issue, hướng dẫn agent, policy và CI.
2. Kiểm tra `git status`; nếu có thay đổi chưa commit thì không tự xóa, stash, reset hay ghi đè.
3. `git fetch origin`; tạo `feature` branch từ **integration base cập nhật** theo tên đã được repo cho phép. Nếu branch Issue đã tồn tại thì tái sử dụng đúng branch đó.
4. Chỉnh sửa đúng scope; viết/thêm kiểm thử tương ứng; chạy build/lint/test hiện có.
5. Kiểm tra diff, bí mật/API keys, dữ liệu riêng tư, file sinh ra, binary/log lớn và thay đổi ngoài phạm vi.
6. Commit với message thể hiện Issue, **push branch lên `origin`** qua script/hook chính thức của repo (nếu có).
7. Báo lại: Issue `#N`, branch, commit SHA, changed files, các lệnh đã chạy, PASS/FAIL, log/bằng chứng, hạn chế chưa kiểm chứng.

> **Không tạo clone/worktree/folder dự án mới chỉ vì đổi Issue**. Chỉ làm điều này khi user yêu cầu hoặc có lý do kỹ thuật rõ ràng được chấp thuận. Không push trực tiếp lên integration/release branch, không force-push/đổi remote/bypass hooks.

### Bước 3 — ChatGPT đọc commit và mở Draft PR

Sau khi coding agent đã **push**:

1. Xác minh remote branch và SHA thật trên GitHub, so với Issue và base branch.
2. Kiểm tra xem PR tương ứng đã tồn tại hay chưa. **Nếu có, sử dụng lại PR hiện tại; không mở PR trùng.**
3. **Nếu chưa có**, ChatGPT mở **một Draft PR**, head = feature branch đã push, base = `INTEGRATION_BRANCH`. Dùng GitHub connector hoặc GitHub CLI qua máy được ủy quyền nếu có quyền.
4. PR body phải có liên kết Issue, tóm tắt thay đổi, điều kiện nghiệm thu, danh sách test thực sự chạy, lệnh tái lập, risk/limitations; không tuyên bố chưa kiểm chứng là đã PASS.
5. ChatGPT gửi URL PR cho người dùng. Nếu môi trường/kết nối không cho phép mở PR, báo rõ trở ngại và cung cấp đường dẫn hoặc hướng dẫn một bước thủ công; **không giả vờ PR đã được tạo**.

### Bước 4 — ChatGPT review độc lập từ artifact thật

Bắt buộc **đọc code/diff thực tế tại commit SHA**; không kết luận chỉ dựa vào báo cáo của agent. Tối thiểu kiểm tra:

- **Requirement traceability:** Mỗi tiêu chí của Issue có code/test/evidence tương ứng.
- **Correctness:** Thuật toán, dữ liệu, nghiệp vụ, trường hợp biên, exception, state transitions và tính toàn vẹn đầu ra.
- **Independent evidence:** So sánh với oracle/reference/expected fixture độc lập khi cần; không dùng chính hàm đang kiểm tra làm đáp án chuẩn.
- **Tests:** Chạy test nếu có môi trường/ủy quyền; nêu rõ test đã chạy và chưa chạy, exit code, thời gian, giới hạn.
- **Regression:** Đảm bảo các module cũ và public interfaces không bị hỏng.
- **Security/privacy:** Không lộ khóa, token, dữ liệu cá nhân; không thêm thao tác nguy hiểm, quyền quá rộng hoặc truy cập không cần thiết.
- **Scope:** Không âm thầm đổi yêu cầu, branch, dependency, dữ liệu baseline hoặc file ngoài phạm vi.
- **Reproducibility:** SHA, các bước tái lập, tool versions, configs, seeds/hardware nếu ảnh hưởng kết quả.
- **Git diff:** Nhận diện file ngoài scope, artifact rác, xung đột, whitespace, generated files.

**Kết luận review:**
- `PASS / APPROVED FOR USER MERGE`: Đủ bằng chứng cho phạm vi Issue và không còn lỗi chặn.
- `FIX REQUIRED`: Có lỗi cụ thể cần sửa; nêu file/dòng, cách tái hiện, kết quả kỳ vọng.
- `BLOCKED`: Thiếu quyền, công cụ, dữ liệu hay quyết định thiết yếu.
- `INCONCLUSIVE`: Bằng chứng chưa đủ để nói đúng/sai; ghi thiếu gì, không suy đoán.

ChatGPT ghi findings vào PR khi được ủy quyền theo quy trình; báo người dùng bản tóm tắt review, nguồn và hạn chế. Với repo trọng yếu có thể tạo báo cáo `.md` đính kèm. **Review của ChatGPT độc lập với agent code nhưng không tự động tương đương kiểm toán bảo đảm tuyệt đối.**

### Bước 5 — Nếu FAIL, sửa trên cùng PR

- ChatGPT giao danh sách finding rõ ràng cho coding agent.
- Agent sửa trên **chính feature branch cũ**, chạy lại test, commit và push.
- GitHub tự cập nhật **cùng PR**; ChatGPT kiểm tra commit mới và re-review.
- Lặp cho tới khi `PASS` hoặc user chấp thuận dừng/đổi phạm vi. Không tạo Issue/PR mới chỉ để sửa lỗi thường lệ của PR hiện tại.

### Bước 6 — Người dùng quyết định merge

- Chỉ sau `PASS` và khi CI/branch protection cho phép, ChatGPT báo **sẵn sàng để user merge**.
- Người dùng là người duy nhất ra quyết định cuối cùng về **Ready for review (nếu còn Draft), merge, nghiệm thu milestone/gate**. Trợ lý chỉ được thao tác hộ khi có **ủy quyền rõ ràng cho hành động cụ thể**.
- Đảm bảo PR hướng đến đúng integration branch; **không** tự mở PR vào `main`/release branch nếu policy chưa cho phép.
- Sau khi user merge, ChatGPT xác minh trạng thái `MERGED`, SHA merge và trạng thái Issue, hướng dẫn cập nhật checkout local. Không tự xóa branch/worktree hoặc đóng milestone có ý nghĩa nghiên cứu khi chưa được phép.

---

## 4. MẪU ĐẦU RA TỐI THIỂU Ở MỖI GIAI ĐOẠN

| Giai đoạn | Ai trả kết quả | Đầu ra bắt buộc |
|---|---|---|
| Giao việc / Issue | ChatGPT | URL Issue, mục tiêu, DoD, phạm vi |
| Code & push | Coding Agent | Branch + SHA + diff + test evidence + hạn chế |
| Draft PR | ChatGPT | URL PR, base/head/SHA và linkage Issue |
| Review | ChatGPT | `PASS/FIX REQUIRED/BLOCKED/INCONCLUSIVE` + bằng chứng |
| Fix | Coding Agent | SHA mới, test rerun, mapping finding→fix |
| Merge | Người dùng | Quyết định/merge; ChatGPT có thể kiểm tra trạng thái sau đó |

**Câu lệnh ngắn dùng lại:** “Làm Issue này theo `GITHUB_COLLAB_WORKFLOW_STANDARD`.” Hoặc chỉ giao nhiệm vụ mới khi file đã được đưa vào hướng dẫn dự án và agent được cấu hình đọc file.

---

## 5. MẪU ISSUE VÀ PR

### Issue body tối thiểu

```markdown
## Goal
[Outcome expected]
## Context / References
[Relevant prior work, code, tickets]
## In Scope / Out of Scope
[Explicit boundaries]
## Inputs / Outputs
[Concrete contract]
## Acceptance Criteria
- [ ] Functional correctness condition
- [ ] Edge/error cases
- [ ] Reproducible verification
## Tests and Evidence
[What must be run and compared]
## Safety / Governance
[What is authorized, what is prohibited]
```

### PR body tối thiểu

```markdown
Refs #ISSUE_NUMBER
## Summary
[What changed and why]
## Files / Interfaces
[Key changes]
## Validation performed
[Exact commands + observed pass/fail]
## Evidence / Reproduction
[SHA, dataset/fixtures, logs]
## Known limitations / Open questions
[Remaining risks]
## Reviewer verdict
PENDING INDEPENDENT CHATGPT REVIEW
```

Dùng `Refs #N` thay vì `Closes #N` nếu không muốn tự đóng Issue ngay khi merge; chọn quy ước đóng Issue theo chính sách của repository.

---

## 6. LỆNH MINH HỌA — CHỈ ÁP DỤNG SAU KHI KIỂM TRA POLICY CỤ THỂ

```bash
# Coding agent, within an existing authorized checkout:
git status --short --branch
git fetch origin
# After verifying clean/safe state and authorized branch name:
git switch -c feature/issue-16-example origin/<INTEGRATION_BRANCH>
# implement + test; commit; use project's approved push script if it exists
# otherwise, where policy explicitly permits:
git push -u origin HEAD:refs/heads/feature/issue-16-example

# ChatGPT, only after verified remote push and if no PR exists:
gh pr create --repo owner/repo \
  --base <INTEGRATION_BRANCH> \
  --head feature/issue-16-example \
  --draft \
  --title 'Issue #16 — ...' \
  --body-file /path/to/pr-description.md

# Reviewer (read-only examples):
gh pr view <PR_NUMBER> --repo owner/repo
gh pr diff <PR_NUMBER> --repo owner/repo
```

Không chạy nguyên mẫu này với placeholder chưa thay. **Ưu tiên `scripts/push_issue_branch.sh`/Git hooks hiện có khi repository yêu cầu**, không dùng lệnh push ví dụ để vượt policy.

---

## 7. KHI NÀO MỚI CẦN REVIEWER THỨ HAI?

**Mặc định: ChatGPT tự review, không gọi Gemini bắt buộc.** Chỉ thêm vòng phản biện READ-ONLY nếu có **ít nhất một** tình huống:

1. Có **tuyên bố nghiên cứu mới**, định lý/chứng minh, thay đổi ngữ nghĩa, correctness khó xác minh, hoặc nguy cơ sai nền tảng.
2. Có **mâu thuẫn giữa hai nguồn bằng chứng**, hoặc coding agent và ChatGPT không đồng ý về một finding quan trọng.
3. PR liên quan **bảo mật/riêng tư/tài chính/sức khỏe/an toàn**, di chuyển dữ liệu, thay đổi quyền hoặc có hậu quả khó khôi phục.
4. Test/CI không tái lập được kết quả quan trọng, có số liệu hiệu năng đáng nghi hoặc oracle độc lập không sẵn có.
5. Người dùng yêu cầu phản biện đối kháng.

Nếu không thuộc các trường hợp trên, **không làm phát sinh vòng Gemini** chỉ vì thói quen. ChatGPT phải nói rõ lý do nếu đề xuất dùng reviewer thứ hai; user quyết định có cần thêm vòng độc lập hay không.

---

## 8. QUY TẮC AN TOÀN VÀ QUYỀN HẠN

- **Issue/PR là tài sản quản trị dự án:** Không tạo, xóa hoặc chỉnh sửa ngoài yêu cầu/phạm vi được giao.
- **User-only merge:** Agent và ChatGPT **không tự merge**, kể cả khi tất cả test PASS. Phân biệt “được kỹ thuật chấp thuận” với “user đã merge/duyệt gate”.
- **Không xóa dữ liệu:** Không tự xóa worktree, branch, commit, file hay dữ liệu người dùng. Nếu cần cleanup phải có phê duyệt.
- **Không force-push hoặc bypass hooks/rules.** Nếu quy trình bị chặn, báo thay vì lách.
- **Không tự cài đặt dependency nặng hoặc chạy tốn tài nguyên** ngoài phạm vi đã giao.
- **Không nói đã kiểm tra khi chưa kiểm tra:** Phân biệt `SOURCE VERIFIED`, `BUILD`, `SMOKE`, `UNIT`, `INTEGRATION`, `CORRECTNESS`, `BENCHMARK`.
- **Những việc không thể thao tác do thiếu tool/permission:** Thông báo minh bạch, không hứa làm sau hoặc khẳng định đã hoàn tất.
- **Bảo mật thực tế:** Nếu người dùng và agent dùng **cùng một GitHub token có quyền admin**, file quy tắc không thể tự ngăn agent merge về mặt kỹ thuật. Nên dùng agent credential giới hạn quyền và GitHub branch protection/rulesets, có phê duyệt người dùng khi cần.

---

## 9. CÁCH ÁP DỤNG CHO DỰ ÁN KHÁC MÀ KHÔNG NHẮC LẠI QUY TRÌNH

**Cài đặt một lần cho mỗi repo:**

1. Đưa bản copy của file này vào repo, ví dụ root `GITHUB_COLLAB_WORKFLOW_STANDARD.md` hoặc `docs/GITHUB_WORKFLOW.md`.
2. Điền bảng cấu hình mục 1 theo repo thực tế. Không sao chép cứng đường dẫn `Seminar_RapidFlow`, branch `QuangThang`, mã Issue/PR từ dự án khác.
3. Nếu agent tự đọc `AGENTS.md`/project instructions, thêm một dòng tham chiếu: **“Follow `GITHUB_COLLAB_WORKFLOW_STANDARD.md` for Issue → push → ChatGPT PR/review → user merge; obey project branch protections.”** Nếu file gốc có quy tắc mâu thuẫn, phải **cập nhật thống nhất** file gốc bằng commit được user phê duyệt, không chỉ thêm một quy tắc xung đột.
4. Dùng file này trong ChatGPT Project instructions hoặc quy tắc tác vụ tương đương để ChatGPT biết mình là người **tạo Issue và mở Draft PR sau push**.
5. Trong các nhiệm vụ sau, người dùng chỉ cần giao **đích công việc**. Agent/ChatGPT tự xác định Issue, branch, PR, tests và review theo quy trình được cấu hình. **Việc chuyển sang dự án khác không tự động mang file này theo nếu chưa cài đặt hoặc liên kết nó ở dự án đó.**

### Lưu ý đối với repository `Seminar_RapidFlow` hiện tại

Repository đang có chính sách riêng trong `AGENTS.md`, `GEMINI.md` và `docs/BRANCH_POLICY.md` theo phiên bản cũ, trong đó **coding agent mở Draft PR** và có vòng phản biện AI mặc định. **File dùng chung này không tự sửa những chính sách cũ.** Để áp dụng quy trình mới cho repo đó, cần đồng bộ các file quản trị theo quyết định của chủ dự án trên một branch/PR hợp lệ; không được tự đổi quy tắc bằng cách bỏ qua policy. Đặc biệt, việc chuyển **quyền mở Draft PR** sang ChatGPT không thay đổi chính sách **user-only merge**.

---

## 10. ĐỊNH NGHĨA HOÀN THÀNH QUY TRÌNH

Một Issue chỉ được báo **READY FOR USER MERGE** khi:

- [ ] Có đúng Issue và PR liên kết, đúng base/head; commit remote được xác minh.
- [ ] Coding agent đã push code và tài liệu cần thiết; diff không vượt scope.
- [ ] ChatGPT đã **đọc code thực** và kiểm chứng những yêu cầu quan trọng với bằng chứng phù hợp.
- [ ] Tất cả test bắt buộc PASS hoặc exception được người dùng chấp thuận công khai.
- [ ] Không còn finding mức BLOCKER/HIGH chưa giải quyết.
- [ ] Known limitations và quyết định mở được ghi rõ.
- [ ] Không có hành động merge/đóng gate nào được thực hiện thay user.

**Trạng thái cuối cùng:** `READY FOR USER MERGE` là một **khuyến nghị kỹ thuật**. `MERGED` chỉ được xác nhận sau khi GitHub có merge thực tế theo quyết định người dùng.
