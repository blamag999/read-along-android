# Read Along Android — RECOVERY

> Nguồn sự thật về thay đổi là Git history + working tree. File này ghi mốc đối chiếu; không thay thế ROADMAP/PLANNING và không chứng minh một thay đổi đã được nghiệm thu.

## Mốc hiện tại

- Repository: `blamag999/read-along-android`
- Branch phát triển: `beta`
- Branch stable: `main` (không cập nhật code trong quy trình khôi phục)
- Last formal handover commit: `52fd6dba2fc82b811a4228afe39967ac884516d2`
- Last reviewed HEAD on beta: `52fd6dba2fc82b811a4228afe39967ac884516d2`
- Recovery status: `RECONCILED`
- Recovery reviewed on: 2026-10-31
- Latest recovery checkpoint: Core cleanup handover [handover] commit `4c51950df6e881815f77fc1c45be95462ee5ec46`
- README shared policy: beta content updated; main synchronization is pending PR #40 (README-only) because main requires changes through a pull request.

## Phát hiện sau mốc bàn giao trước

Các thay đổi đã được đối chiếu trong lịch sử Git và tài liệu hiện tại:

1. Marker conflict resolver tồn tại tại `modules/marker-resolver.js`; regression test tương ứng tại `tests/marker-resolver.test.js`.
2. Resolver là pure module, **chưa nối vào reader/runtime**. Không được kết luận marker migration hoặc runtime conflict handling đã hoàn tất.
3. Policy và đánh giá nguồn marker được ghi trong `docs/architecture/marker-and-api-review.md`; schema liên quan ở `schemas/marker.schema.json`.
4. Test resolver có CI success được ghi nhận trong ROADMAP: workflow `41164224271`. Không có APK build/runtime acceptance phát sinh từ resolver.
5. Có các commit thêm/xóa draft resolver/test trong quá trình chỉnh sửa; trạng thái cuối cùng phải lấy từ file ở HEAD, không suy ra từ commit trung gian.
6. README được đồng bộ quy tắc hai nhánh và bổ sung quy trình Git-based recovery. Việc cập nhật README trên main cần qua PR; không push trực tiếp lên main.

## Quy trình bắt đầu phiên mới

1. Đọc README → ROADMAP → PLANNING → RECOVERY trên beta; kiểm tra README trên main.
2. Lấy SHA HEAD thực tế của beta/main. So sánh HEAD beta với `last_reviewed_head` và `last formal handover commit`.
3. Kiểm tra commit list và per-commit diff sau mốc handover; không chỉ dựa vào tổng hợp compare nếu Git báo diverged hoặc kết quả quá lớn.
4. Nếu có bản clone, chạy:
   ```bash
   git status --short
   git branch --show-current
   git log -n 30 --oneline --decorate
   git log --oneline LAST_HANDOVER_SHA..HEAD
   git diff --stat LAST_HANDOVER_SHA..HEAD
   git diff --name-status LAST_HANDOVER_SHA..HEAD
   git diff
   git diff --cached
   ```
5. Kiểm tra untracked files riêng bằng `git status --short`; `git diff` không hiển thị file untracked.
6. Phân loại từng việc:
   - `DONE`: có bằng chứng test/CI/deploy/thiết bị phù hợp.
   - `IMPLEMENTED`: code đã có nhưng chưa kiểm chứng đủ.
   - `PARTIAL`: đang làm dở.
   - `UNKNOWN`: thiếu bằng chứng.
7. Bảo toàn thay đổi chưa commit/untracked. Không reset, clean, force-push, rebase hoặc ghi đè.
8. Ghi phát hiện vào ROADMAP, việc còn lại vào PLANNING; sau khi review xong mới cập nhật `last_reviewed_head`.

## Quy trình bàn giao chính thức

1. Hoàn tất và commit code; kiểm thử theo quy tắc README.
2. Cập nhật ROADMAP với SHA, file/phạm vi, CI/test/deploy/build và giới hạn chưa xác minh.
3. Cập nhật PLANNING để chỉ giữ việc chưa hoàn thành.
4. Tạo commit tài liệu bàn giao với `[handover]`.
5. Cập nhật `last_handover_commit` tới commit code/documentation cuối cùng đã được bàn giao, và ghi SHA commit handover riêng trong mục lịch sử bên dưới. Không ghi SHA của chính commit đang chứa giá trị đó.
6. Ghi `last_reviewed_head` bằng HEAD đã được đối chiếu đầy đủ.

## Lịch sử mốc

- 2026-10-31 — Khởi tạo RECOVERY. Handover cũ: `1ea6bb3124bafc9c5819d78146fa2cafb8206f40`; beta HEAD đã review: `fb521a9927fa4e81d414049208f30e296266c80e`.

## Đối chiếu và bàn giao kiến trúc — 2026-10-31

- So sánh `71ba2a1d41cb62dc85723a65ba89bfeb55878155...beta` trước khi bắt đầu cho kết quả `ahead 2`, `behind 0`, thay đổi tổng hợp chỉ gồm `RECOVERY.md` và `ROADMAP.md`; không có file runtime trong compare. Commit `6324daef8a506d0c725707df814df9ac0f10222f` đã được đọc trực tiếp; nó chỉ sửa ghi chú trạng thái PR #40 trong ROADMAP. Commit còn lại thuộc phạm vi RECOVERY theo compare; không có code/runtime delta.
- Đã tạo tài liệu kiến trúc mục tiêu `docs/architecture/core-extensibility.md` (commit `149bb1b9248d569a60eb15fb405bae417313f9e1`).
- Đã cập nhật PLANNING để ghi các audit/implementation task chưa hoàn thành (commit `e2a64eaa9f3d955d73b1829d65578d689f99311f`).
- Đã cập nhật ROADMAP và tạo handover checkpoint (commit `284484f6266d0c9792bd82b36ab1e00ea179ee1b`, sau đó `[handover]` commit `b5ff1d273e0a69ccdf0d37efd94cbe26942d5b09`).
- Recovery status `RECONCILED`: thay đổi từ mốc cũ đã được đối chiếu; batch hiện tại chỉ thay đổi tài liệu. `last_reviewed_head` và `last formal handover commit` được đặt tại checkpoint `b5ff1d273e0a69ccdf0d37efd94cbe26942d5b09`.
- Không chạy test/CI, không deploy, không build APK, không thay đổi R2/D1/Cloudflare, không cập nhật main. PR #40 vẫn là README-only và chưa được merge tại thời điểm đối chiếu.

## Bàn giao sau đợt tinh gọn Core — 2026-10-31

- Đã rà soát cấu trúc source hiện tại và đồng bộ README, PLANNING, ROADMAP, Data Contract cùng tài liệu kiến trúc Core; không còn checklist hoặc mô tả vận hành lỗi thời.
- `index.html`, `sw.js`, `package.json`, module tree, schema/test/workflow references đã được đối chiếu; không phát hiện caller hoặc asset cấu hình thừa trong các đường dẫn đã kiểm tra.
- Cloudflare Pages project `read-along-admin` được xác minh dùng build command `true`, root `admin`, output `public`; production deployment gần nhất được xác nhận success trong ROADMAP.
- README dùng chung đã được cập nhật trên nhánh beta và đồng bộ vào head của PR #40. PR vẫn chỉ thay đổi README.md và còn mở; chưa cập nhật main.
- Không chạy regression suite trong batch tài liệu, không build APK, không thay đổi reader/audio/native, R2, D1 hoặc API nghiệp vụ.
- Last reviewed HEAD trước commit bàn giao này: `52fd6dba2fc82b811a4228afe39967ac884516d2`.
- Commit bàn giao tài liệu hiện tại: `4c51950df6e881815f77fc1c45be95462ee5ec46`.
