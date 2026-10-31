# Read Along Android — ROADMAP và lịch sử tiến độ

> File này là **hồ sơ những gì đã xây dựng và trạng thái đến hiện tại**. Không dùng làm danh sách việc cần làm. Các đầu việc chưa hoàn thành chỉ quản lý trong [PLANNING.md](./PLANNING.md); quy tắc làm việc nằm trong [README.md](./README.md).

## 1. Tầm nhìn và kiến trúc đã chốt

Mục tiêu dài hạn là **APK Core ổn định + dịch vụ/dữ liệu độc lập**: giữ trải nghiệm đọc PDF/audio và tích hợp Android trong APK; tách catalog, media, marker, quản trị, diagnostics, analytics và nội dung thay đổi thường xuyên sang dữ liệu/dịch vụ riêng. Mục đích là giảm số lần phát hành APK, đồng thời giữ khả năng khôi phục trạng thái đọc/nghe, bảo mật và dễ kiểm thử; PDF/audio vẫn online-only từ R2.

Người dùng đã xác nhận các nguyên tắc A, B và E:

- **A — Freeze APK Core:** PDF Viewer, Audio Player, đồng bộ trang/audio, Android/WebView lifecycle, lưu/khôi phục phiên và native bridge chỉ thay đổi khi có lỗi nghiêm trọng, bảo mật, tương thích nền tảng hoặc yêu cầu thiết yếu.
- **B — Tách dịch vụ:** Analytics, Diagnostics backend, Catalog Admin, metadata và nội dung trợ giúp/thông báo chạy độc lập với APK.
- **E — Build có điều kiện:** chỉ build APK khi thay đổi runtime đóng gói, UI interaction, native plugin/permission/bridge, bảo mật hoặc lỗi lõi.

## 2. Các giai đoạn đã xây dựng

### 2.1 Ứng dụng Android và trải nghiệm đọc

- Xây dựng ứng dụng Read Along chạy trên Android/Web bằng Capacitor và WebView.
- PDF viewer kết hợp audio playback, đồng bộ trang theo marker/timestamp và hỗ trợ nhiều phần audio.
- Có điều khiển cảm ứng, bàn phím/remote và định hướng hỗ trợ Android TV.
- Tổ chức logic thành các module, gồm page sync, playlist layout, catalog playlist, remote sync và diagnostics.
- PDF.js được tải từ CDN phiên bản đã pin; đây vẫn là một phụ thuộc khởi động cần được cân nhắc khi thay đổi.
- Service Worker quản lý cache shell; không cache PDF/audio Range requests theo cách làm ảnh hưởng seek/streaming.

### 2.2 Đồng bộ marker và dữ liệu đọc

- Hỗ trợ marker JSON cho đồng bộ trang/audio; dữ liệu cũ có thể là map số giây hoặc object `{time, part}`.
- Có các nguồn dữ liệu marker gồm file JSON người dùng chọn, R2 catalog marker, GitHub Contents API trong `sync_data/` và localStorage.
- Đã kiểm tra luồng nạp hiện tại và ghi nhận precedence/xung đột nguồn tại [docs/architecture/marker-and-api-review.md](./docs/architecture/marker-and-api-review.md).
- Đã draft marker envelope schema v1 gồm `schemaVersion`, `revision`, `updatedAt`, `sourceId`, `markers`; schema vẫn chấp nhận legacy map và empty map.
- Chưa thay đổi runtime marker precedence hoặc tự động migrate dữ liệu. Đây là quyết định bảo toàn tương thích và tránh mất marker khi chưa có conflict policy hoàn chỉnh.

### 2.3 OTA và quy trình APK

- Khôi phục luồng OTA qua GitHub Releases.
- Native Android plugin tải APK từ URL GitHub HTTPS đã kiểm tra, lưu trong cache và mở Android PackageInstaller qua FileProvider.
- Workflow build/release có bước xác minh chữ ký APK bằng `apksigner` và tạo SHA-256.
- OTA không phải cài đặt im lặng: Android vẫn có thể yêu cầu quyền “Install unknown apps” và xác nhận cài đặt.
- Quy tắc duy trì cùng signing key và không né Play Protect đã được ghi trong README.
- Trạng thái build/release hoặc kiểm thử thiết bị chỉ được xác nhận theo workflow/release cụ thể; tài liệu này không khẳng định một APK stable mới đã được kiểm thử thiết bị nếu chưa có bằng chứng.

### 2.4 R2 catalog và nội dung sách

- R2 bucket dự án: `my-audio-book`; catalog manifest `books.json` được phục vụ từ public R2 hostname đã cấu hình trong repository.
- Admin catalog workflow: scan inventory → normalize/group theo tên và thư mục → preview complete/incomplete/duplicates/malformed/orphans → người quản trị xác nhận → revalidate từng object bằng HEAD → publish manifest.
- Không tự động xóa/đổi tên/di chuyển object R2; nếu HEAD validation lỗi thì không thay manifest đang hoạt động.
- Ghép sách theo tên chuẩn hóa chính xác và cùng thư mục, không fuzzy matching.
- Audio part có hậu tố `_P1`, `_P2`… được sắp xếp theo số phần.
- WMA không được đưa vào manifest playback. Công cụ chuyển WMA sang MP3 chạy browser-side FFmpeg.wasm single-thread, giữ file gốc, không ghi đè MP3 đã tồn tại và upload về cùng thư mục.
- Admin Library hiển thị sách theo nhóm thu gọn PDF/audio/JSON, nhóm chưa ghép riêng; thao tác file chỉ hiện khi mở nhóm.

### 2.5 Admin và diagnostics

- Có Admin web độc lập trong thư mục `admin/`, triển khai qua Cloudflare Pages/Functions, quản lý inventory R2, catalog, file/folder và chẩn đoán.
- Có các API usage tracking/stats, telemetry events, catalog preview/publish, diagnostics scan và multipart/file management. Endpoint được giữ riêng khi khác mục đích, quyền hoặc vòng đời dữ liệu.
- Diagnostics Worker tiếp nhận báo cáo được người dùng đồng ý và có thể tạo GitHub Issue; token GitHub nằm phía server, không đưa vào APK.
- Đã sửa lỗi Admin JavaScript đăng ký event listener trên phần tử DOM không tồn tại; bổ sung regression tests.
- Đã cải thiện thống kê Admin: ưu tiên manifest hợp lệ; khi manifest thiếu/rỗng/JSON lỗi thì fallback inventory R2, và trả lỗi nếu scan R2 thất bại thay vì giả lập số liệu bằng 0.
- Đã thêm regression test cho Admin DOM, OTA cache behavior và các luồng liên quan trong những đợt sửa trước.

### 2.6 Quy trình test và tài liệu kiến trúc

- Có `npm test` và CI workflow kiểm tra contract, JS syntax, Pages Functions syntax và isolation.
- Đã tạo [docs/architecture/data-contracts.md](./docs/architecture/data-contracts.md) để kiểm kê endpoint, caller, nguồn dữ liệu và trust boundary.
- Đã tạo [docs/architecture/marker-and-api-review.md](./docs/architecture/marker-and-api-review.md) để ghi nhận marker precedence và API overlap.
- Đã tạo JSON Schema v1:
  - `schemas/catalog.schema.json`
  - `schemas/marker.schema.json`
  - `schemas/analytics-event.schema.json`
- Đã thêm `tests/contracts.test.js` vào `npm test` để kiểm tra schema và các giới hạn contract.
- API overlap review kết luận không nên gộp usage, telemetry, diagnostics, catalog Admin và GitHub marker sync vì khác trách nhiệm/quyền. Không tạo Worker/API Analytics thứ hai khi chưa có nhu cầu kỹ thuật rõ ràng.

## 3. Chương trình tách dịch vụ — các mốc

| Mốc | Phạm vi | Trạng thái hiện tại |
|---|---|---|
| R0 | Hợp nhất master planning, Analytics plan và nguyên tắc APK decoupling | **Hoàn tất** |
| R1 | Inventory API/data, schema và marker/API boundary review | Đã hoàn tất phần inventory/contract; marker runtime conflict policy chưa chốt |
| R3 | Analytics ingest + D1 + event thời lượng đọc/nghe | Chưa bắt đầu |
| R4 | Analytics dashboard ngày/tuần/tháng/năm | Chưa bắt đầu |
| R5 | Help/announcements/theme content | Chưa bắt đầu |
| R6 | Regression tổng thể, kiểm thử thiết bị và freeze APK Core | Chưa bắt đầu |

## 4. Bằng chứng CI và triển khai đã ghi nhận

Các run dưới đây là kết quả của **commit tương ứng**, không mặc nhiên chứng minh HEAD hiện tại đã pass:

| Run / triển khai | Commit liên quan | Kết quả |
|---|---|---|
| [CI 41158627378](https://github.com/blamag999/read-along-android/actions/runs/41158627378) | `24b4058ec05abb1e27ddff65f1ec0978a7fe5558` | Success — schema/contract và manifest seed regression |
| [CI 41159251879](https://github.com/blamag999/read-along-android/actions/runs/41159251879) | `11bdba3ffa20801b8eebaf6728aa9c58f365712c` | Success — marker contract regression sau khi sửa test |
| [Pages deployment 8892563b](https://8892563b.read-along-admin.pages.dev) | `ed083c0c5fe0774c1e4ff69922b5139950491ffe` | Production deployment success; chưa xác minh trực tiếp HTTP body của asset |

Ghi chú:
- CI run mới nhất nêu trên không chạy trên commit tài liệu mới nhất `6e8f9576479bf587220cf1d8685c7f0228f8c1be`; phải kiểm tra lại CI theo HEAD khi bắt đầu đợt mới.
- Pages deployment success xác nhận deploy, không tự chứng minh public URL trả đúng JSON.

## 5. Trạng thái repository tại lần chuẩn hóa hồ sơ

- Ngày ghi nhận: **2026-10-31**.
- Nhánh làm việc: `beta`.
- HEAD trước đợt chuẩn hóa tài liệu: `6e8f9576479bf587220cf1d8685c7f0228f8c1be`.
- Ba nhánh hiện có đã xác minh: `main`, `beta`, `testing`.
- `beta` là nhánh phát triển/tích hợp; `main` là stable; `testing` chỉ dùng khi cần kiểm chứng riêng.
- Không có runtime APK change hoặc APK build trong đợt đó.

## 6. Những điều cần hiểu khi tiếp nhận dự án

1. Các tính năng reader/audio/OTA/catalog/Admin đã có nền tảng triển khai, nhưng không được mặc định mọi lỗi lịch sử đã hết; kiểm tra Issues, log và test hiện tại trước khi sửa.
2. Marker precedence hiện tại có rủi ro ghi đè nguồn; schema versioned đã có nhưng runtime migration/conflict policy chưa được thực hiện.
4. Usage tracking hiện có đo lượt mở/installation, không phải thời lượng đọc/nghe.
5. Không tạo thêm API/Worker hoặc thay đổi APK chỉ để thuận tiện nếu có thể dùng contract/service hiện tại.
6. Các công việc chưa hoàn thành được quản lý duy nhất trong [PLANNING.md](./PLANNING.md).

## 7. Cách cập nhật ROADMAP

Khi một công việc trong PLANNING hoàn tất:
- Ghi ngày, kết quả, commit SHA và bằng chứng CI/deploy/test/device ở đây.
- Cập nhật trạng thái mốc tương ứng.
- Chỉ sau đó xóa mục hoàn tất khỏi PLANNING.
- Giữ lại lịch sử có giá trị; không biến ROADMAP thành backlog mới.


### 2026-10-31 — Beta APK v1.3.5 built and one-shot finalization workflow configured

- Người dùng xác nhận đã chạy build; kiểm tra GitHub Actions xác nhận run [41162360209](https://github.com/blamag999/read-along-android/actions/runs/41162360209) trên branch `beta`, commit `a30c6a011456befc04e5af83a51694e5e19eaa1d`, kết quả `success`.
- Các bước `Build signed release APK`, `Rename and verify signed APK`, upload artifact và tạo GitHub Release đều success. Artifact `read-along-v1.3.5-build` (artifact ID `13027347763`) còn hạn đến 2026-11-30; Release [v1.3.5 beta](https://github.com/blamag999/read-along-android/releases/tag/v1.3.5) có APK, file SHA-256 và Web Local ZIP.
- Không build lại trong lần chỉnh workflow này; không thay đổi runtime APK. Device acceptance vẫn pending.
- Sửa `.github/workflows/build-android-apk.yml`: push lên `beta` chỉ chạy job build nếu commit message chứa `[build-apk]`; các commit trung gian không build APK. Khi hoàn tất một đợt, commit chốt có marker sẽ tự kích hoạt build beta, không cần Run workflow thủ công. Giữ `workflow_dispatch` cho stable release/ngoại lệ.
- Quy trình này bảo đảm một build cho một commit chốt; không tự động build lặp theo mỗi commit. Nếu build chốt thất bại và phải sửa, cần một commit chốt mới để thử lại.


### 2026-10-31 — CI regression kiểm thử theo mốc batch

- Thay đổi `.github/workflows/check-readalong-admin.yml`: push lên `beta`, `main`, `testing` chỉ chạy full regression khi commit cuối cùng có marker `[test]`; Pull Request vẫn tự động chạy đầy đủ. Bổ sung `workflow_dispatch` để chạy thủ công.
- Thay đổi `.github/workflows/build-android-apk.yml`: mọi build được kích hoạt bằng `[build-apk]` hoặc manual dispatch đều cài dependencies và chạy `npm test`, Pages Functions syntax check, isolation checks trước khi chuẩn bị assets/native và build. Các bước kiểm thử thất bại sẽ chặn phát hành.
- Tránh chạy trùng: commit `[build-apk]` không mang marker `[test]`; workflow build tự kiểm tra chính xác commit đóng gói.
- Các commit triển khai:
  - Check workflow: `fab4d53e9a5b8c2b69696f7dffb83bf67fd4fa77`
  - APK workflow: `4b529ddc1e98313e16bb8331b1b8b3822f42cf87`
  - README: `4eb7e19cd5e462b8984be8359192895be430d2a5`
  - PLANNING: `b97e3a3387110545f7c81ef12085e12ec7209a45`
- Chưa chạy full regression hoặc build APK trong batch tài liệu/workflow này; commit cuối cùng chỉ cập nhật ROADMAP. Cần kiểm chứng thực tế bằng một commit `[test]` ở batch kế tiếp hoặc chạy workflow thủ công. Không có thay đổi APK runtime và không promote `main`.


- Đóng batch CI bằng commit chốt có marker `[build-apk]` để xác minh end-to-end chính sách mới và tạo APK beta mới nhất; build sẽ bị chặn nếu full regression hoặc isolation checks thất bại. Đây là build xác minh workflow, không có thay đổi runtime APK.

### 2026-10-31 — Marker conflict policy resolver isolated and regression-verified

- Rà soát `modules/remote-sync.js`, `modules/page-sync.js`, các caller trong `app.js` và tài liệu marker/API review. Xác nhận dữ liệu GitHub legacy có thể ghi đè R2 mà không có phép so sánh freshness; thứ tự fallback legacy thay đổi theo trường hợp có/không có R2.
- Chốt policy cho migration: explicit import được ưu tiên trong thao tác import; versioned candidates chỉ so revision trong cùng logical book; `updatedAt` chỉ tie-break khi cùng revision và cùng nội dung; conflict cùng revision khác nội dung không tự ghi đè và ưu tiên local recovery; empty versioned envelope là clear-all; không tự merge.
- Thêm pure module `modules/marker-resolver.js` và `tests/marker-resolver.test.js`; thêm test vào `npm test`. Module hiện **chưa được nối vào reader runtime**.
- Cập nhật `docs/architecture/marker-and-api-review.md` và `PLANNING.md`. Không thay đổi `app.js`, `modules/remote-sync.js`, dữ liệu marker, native bridge, APK runtime, signing key hoặc nhánh `main`.
- CI lần đầu [41164173039](https://github.com/blamag999/read-along-android/actions/runs/41164173039) thất bại do test phát hiện resolver chưa ưu tiên localStorage recovery khi conflict có revision thấp hơn; đã sửa resolver và chạy lại.
- Full regression + JS syntax + Pages Functions syntax + isolation checks **success** tại CI [41164224271](https://github.com/blamag999/read-along-android/actions/runs/41164224271) trên commit `1ef3b6a3b1a9dc07105d299b1f2e3b53eea7d183`.
- Không build APK vì batch chỉ gồm resolver cô lập, test và tài liệu. Không promote `main`.
- Còn pending: thiết kế atomic migration/write/recovery; runtime vẫn giữ hành vi legacy hiện tại cho đến khi migration được kiểm thử riêng.


### 2026-10-31 — Analytics AN1 contract and privacy policy defined

- Chuẩn hóa `schemas/analytics-event.schema.json` thành contract v1 cho session analytics: eventId, sessionId, installId, sequence, event type, occurredAt, platform/appVersion và hai số đo riêng `readingSeconds` / `listeningSeconds` (mỗi field tối đa 120 giây).
- Chỉ chấp nhận bookId dạng opaque catalog ID; không cho phép title, filename, path, URL, document content hoặc free-form details.
- Chốt semantics reader_start/heartbeat/pause/resume/stop và audio_play/pause/stop; reading chỉ tính khi reader foreground, listening chỉ tính khi audio đang phát và foreground. Hai số đo có thể chồng thời gian nhưng được tổng hợp riêng.
- Chốt explicit opt-in (default off), opt-out dừng gửi, không queue/cộng offline time, request lỗi thì drop interval; server received_at là nguồn ngày tổng hợp, occurredAt chỉ là context.
- Đề xuất endpoint `analytics/events` trong Pages Functions router hiện có, tách khỏi `usage/track` và `telemetry/events`; dedupe theo eventId và (sessionId, sequence); raw events 90 ngày, daily aggregates 24 tháng.
- Cập nhật `docs/architecture/data-contracts.md`, `tests/contracts.test.js` và PLANNING. Không triển khai collector, API route, D1 table hoặc dashboard; không thay đổi APK/runtime.
- CI regression + JS syntax + Pages Functions syntax + isolation checks **success** tại [41164377952](https://github.com/blamag999/read-along-android/actions/runs/41164377952) trên commit `6441085ee49bc2c0d4a32704d296316a2c7de9bb`. Hai lần chạy trước phát hiện lỗi cú pháp trong test assertion do chỉnh sửa nội dung; đã dọn test và run cuối thành công.
- AN1 hoàn tất; AN2 backend ingest/D1 chưa bắt đầu.


### 2026-10-31 — Analytics AN2 backend and D1 migration deployed to beta Pages production

- Added `admin/functions/lib/analytics.mjs` for strict event/batch validation, explicit consent, one install/session per batch, ID/sequence collision checks, ISO date validation, bounded durations and opaque book IDs.
- Added `POST /api/readalong-admin/analytics/events` to the existing Read Along Pages Functions router. Requires `consent: true`, max 25 events, max 64 KiB streamed body, local-origin CORS allowlist, 150 events/install/hour, hashed install ID and idempotent `INSERT OR IGNORE`.
- Added `admin/migrations/0002_reading_analytics.sql`: raw event table, unique session sequence, daily totals, unique daily sessions and insert trigger. Raw events are pruned after 90 days; daily aggregates after 24 months.
- Applied additive migration to the existing D1 database `read-along-admin-db` already bound as `DB` to Pages project `read-along-admin`; verified all 3 tables and the daily trigger. Also appended the same definitions to `admin/schema.sql` for clean database bootstrap.
- Added unit/contract/API-boundary tests and a GitHub Actions production smoke test. Smoke test verified OPTIONS 204 + exact Capacitor CORS origin and POST without explicit consent returns 400 `Analytics consent required`.
- CI full regression, JavaScript syntax, Pages Functions syntax, isolation and deployed consent smoke **success**: [41166166847](https://github.com/blamag999/read-along-android/actions/runs/41166166847), commit `e8691fdd320eec71cdddfba67b22c8b0891d8fbe`.
- Cloudflare Pages production deployment for commit `e8691fdd320eec71cdddfba67b22c8b0891d8fbe` completed successfully. A synthetic D1 trigger smoke test inserted a temporary event, verified 12 reading seconds + 3 listening seconds + one event + one unique session in the daily aggregate, then removed all synthetic rows. No test data remains.
- Not implemented: APK/client consent UI and collector, valid event write/deduplication/aggregate end-to-end test, analytics dashboard. No APK build and no `main` promotion.


### 2026-10-31 — Workflow path filters refined and continuous handover rule enforced

- Kiểm tra lại cả hai workflow trên beta. Xác nhận Check Read Along Admin đã lọc push theo admin/app shell/modules/services/schemas/package/tests; full regression vẫn yêu cầu marker `[test]`, PR và workflow_dispatch vẫn giữ nguyên.
- Xác nhận Build and Release Read Along đã lọc push beta theo runtime/assets/native Android/build manifests; job build vẫn yêu cầu `[build-apk]`, manual dispatch giữ nguyên. Backend/Admin/docs không thuộc path filter nên không tạo APK workflow run.
- Thu hẹp `.github/workflows/build-android-apk.yml` từ `scripts/**` thành đúng `scripts/prepare-web.js`, tránh script tiện ích không liên quan làm phát sinh APK workflow run.
- Cập nhật README mục “Sau mỗi bước / batch”: bắt buộc cập nhật ROADMAP và PLANNING ngay sau mỗi kết quả độc lập, cập nhật README ngay khi thay đổi quy tắc nền tảng; trước khi kết thúc phiên phải đối chiếu ba hồ sơ với HEAD/CI/deploy. Không chờ đến cuối phiên.
- Workflow/path filtering và handover policy đã được kiểm tra ở source trên beta. Không có thay đổi runtime/APK; không chạy build APK. Do các file thay đổi chỉ là README, ROADMAP và workflow build, path filters không tự tạo regression/build run; CI đầy đủ vẫn có thể gọi thủ công khi cần.
- Workflow commit: `733b731e0a7d1a06674eb942072ecb4880785240`; README commit: `e7d278799d44f49bb865bcdab34a2b2bc5986588`. Hồ sơ này được cập nhật tiếp theo sau từng commit như quy tắc mới.
- Beta HEAD lúc ghi nhận: `e7d278799d44f49bb865bcdab34a2b2bc5986588`. `main` không thay đổi.


### 2026-10-31 — Đồng bộ README quy tắc trên cả ba nhánh

- Người dùng yêu cầu README phải đồng nhất giữa các nhánh để tránh hướng dẫn mâu thuẫn.
- Chọn README mới nhất trên `beta` làm nguồn chuẩn; bổ sung quy tắc README dùng chung: mọi thay đổi phải đồng bộ byte-for-byte sang `main`, `beta`, `testing`; chỉ commit README riêng lẻ, không merge/cherry-pick code hoặc promote runtime; mỗi phiên kiểm tra cả ba nhánh.
- Đồng bộ nội dung README (15,038 ký tự) sang cả ba nhánh. Xác minh lại bằng GitHub fetch: nội dung ba file giống hệt nhau và cùng blob SHA `b2827219f11043b93225306ede69340ea2a0da01`.
- Commit README: `beta` `261af9c8556482252e07761fd4857c91e4a9a8e5`; `main` `4d804f173656cf8c47817c9fb6d71499b61b113a`; `testing` `ef1cde5203a7af9e3846162de8ae4b693a124d9d`.
- Đây là thay đổi tài liệu README-only trên `main` và `testing`; không merge/promote code, không thay đổi runtime, không build APK. ROADMAP/PLANNING không bị sao chép giữa nhánh vì phản ánh trạng thái code riêng.
- README trên cả ba nhánh đã được xác minh đồng nhất byte-for-byte. `main` vẫn giữ nguyên vai trò stable; `beta` vẫn là nhánh phát triển.


### 2026-10-31 — Bổ sung production HTTP smoke test cho Analytics AN2

- Cập nhật `.github/workflows/check-readalong-admin.yml` để smoke test production không chỉ kiểm tra OPTIONS/CORS và từ chối consent=false, mà còn gửi một event hợp lệ có ID ngẫu nhiên, xác nhận lần đầu `accepted=1, duplicates=0`, gửi lại nguyên event và xác nhận `accepted=0, duplicates=1`.
- Smoke test in ra session/install ID để truy vấn và dọn dữ liệu tổng hợp thử nghiệm sau khi workflow chạy. Không sử dụng dữ liệu sách/tên file hoặc thông tin người dùng.
- Commit: `0b013fa54a87d8a5e24e9de8c68d9394f19cbf12`.
- **Trạng thái tại lúc ghi:** mới thêm kiểm thử; chưa có kết quả CI/HTTP. Không đánh dấu nghiệm thu trước khi workflow hoàn tất và xác minh D1.
- Không thay đổi app runtime, không thêm collector, không build APK, không thay đổi main/testing. README không đổi nên vẫn giữ đồng nhất ba nhánh.


### 2026-10-31 — Sửa path filter để tự kiểm thử thay đổi workflow

- Lần push thêm production smoke test không tạo workflow run vì push path filter trước đó không bao gồm chính file `.github/workflows/check-readalong-admin.yml`. Đã xác định đây là nguyên nhân, không phải lỗi GitHub Actions.
- Bổ sung workflow file vào push paths để thay đổi CI definition có thể tự kích hoạt regression khi commit có marker `[test]`; PR filter đã có đường dẫn này.
- Commit: `d4d53504160de89e4d916be9bc4da1f0e32f3999`.
- Run của commit smoke test trước `0b013fa` không được tạo; không dùng làm bằng chứng. Chờ run mới trên commit này.
- Không thay đổi runtime/APK hoặc nhánh khác. README giữ nguyên và vẫn đồng nhất ba nhánh.


### 2026-10-31 — Sửa accepted count của Analytics ingest sau production smoke test

- Production smoke test run [#41166904866](https://github.com/blamag999/read-along-android/actions/runs/41166904866) đã chạy qua `npm test`, Pages Functions syntax và isolation; bước HTTP ingest phát hiện API trả `accepted=4, duplicates=-3` cho một event hợp lệ.
- Root cause: D1 `meta.changes` tính cả các thay đổi phát sinh từ trigger daily aggregate (event + daily row + daily session + daily update), không chỉ số event được insert trực tiếp.
- Đã kiểm tra D1 production: chỉ có đúng một event smoke test, duration 7s reading + 11s listening, một session/day aggregate. Đã xóa event, session row và daily row thử nghiệm; truy vấn xác nhận event_rows=0, session_rows=0, daily_rows=0. Không còn dữ liệu thử nghiệm.
- Sửa route ingest: sau mỗi `INSERT OR IGNORE`, chạy `SELECT changes() AS inserted`; SQLite `changes()` đếm thay đổi trực tiếp của statement và không cộng side effects từ trigger. API accepted count đọc kết quả select tương ứng, duplicates = batch length - accepted.
- Thêm API-boundary regression assertions để giữ semantics này.
- Commits: route fix `426ffbe4223d072459bf0996c03e0bc54322078c`; regression assertion `c841083c99d69429b543ae6de9ba55d6fcda69c9`.
- **Chưa nghiệm thu:** cần CI mới pass, Pages production deploy route fix, sau đó production HTTP smoke test phải chứng minh accepted=1/duplicates=0 ở lần đầu và accepted=0/duplicates=1 khi replay; cuối cùng xác minh và dọn dữ liệu D1.
- Không thay đổi APK/client, không build APK, không thay đổi main/testing. README không đổi, vẫn đồng nhất ba nhánh.


### 2026-10-31 — Sửa regression assertion cho accepted-count fix

- CI [#41166981068](https://github.com/blamag999/read-along-android/actions/runs/41166981068) thất bại ở bước `npm test` do chèn hai assertion vào giữa assertion nhiều dòng hiện có trong `tests/api-boundaries.test.js`, làm phát sinh SyntaxError. Các test trước đó trong suite đã chạy qua; Pages smoke test bị skip do suite dừng sớm.
- Đã sắp xếp lại assertion block và giữ hai kiểm tra: SQL `SELECT changes() AS inserted` tồn tại; accepted count đọc result slot theo cặp statement.
- Commit sửa test: `072740af9a3de31a5129edd265029fb386667dd5`.
- Chờ CI mới trên commit này; chưa deploy route fix lên production và chưa chạy lại HTTP valid event/replay.
- Không thay đổi runtime ngoài route fix đã ghi; không build APK; README giữ nguyên đồng nhất ba nhánh.


### 2026-10-31 — Điều chỉnh regex test Analytics SQL

- CI [#41167021058](https://github.com/blamag999/read-along-android/actions/runs/41167021058) tiếp tục dừng tại `npm test`: regex trong regression assertion dùng escape kép, nên không khớp literal SQL `SELECT changes()`; implementation route không bị kiểm tra tới production smoke trong run này.
- Đã sửa regex về escape đúng cho regex literal JavaScript ở commit `cefe81173d63f785ebd29608d22e7712a439080d`.
- Chờ CI mới; chưa coi accepted-count fix đã pass.
- Không có thay đổi APK/runtime bổ sung; README vẫn đồng nhất ba nhánh.


### 2026-10-31 — Production HTTP write/replay idempotency pass

- CI [#41167053210](https://github.com/blamag999/read-along-android/actions/runs/41167053210) **completed success** on commit `cefe81173d63f785ebd29608d22e7712a439080d`: full `npm test`, Pages Functions syntax, isolation, production CORS/consent gate, valid event POST and exact replay all passed.
- Production HTTP response for first write matched `accepted=1, duplicates=0`; exact replay matched `accepted=0, duplicates=1`. This confirms the route fix is active in Pages production; Pages deployment `9adc0c1b-7d95-469d-a89d-f3e84fb997f1` for route-fix commit `426ffbe4223d072459bf0996c03e0bc54322078c` is `success/deploy`.
- D1 inspection found two smoke-test events (one from an interrupted earlier run and one from the successful run). Daily aggregate reflected 14 reading seconds, 22 listening seconds, 2 events, 2 sessions. Both synthetic events and their daily session rows were removed; aggregate counters were decremented and empty daily row deleted. Final verification: smoke_events=0, smoke_sessions=0, daily_row_count=0.
- **Still pending:** test conflicting eventId with the same (sessionId, sequence) through HTTP; verify daily aggregate remains single-counted; avoid leaving production smoke rows after future CI runs.
- No APK/client collector/dashboard changes. No APK build or main promotion.


### 2026-10-31 — Bổ sung HTTP test cho sequence collision

- Mở rộng production smoke test để gửi event thứ hai có `eventId` khác nhưng giữ nguyên `sessionId + sequence` của event đầu.
- Acceptance kỳ vọng: HTTP 200, `accepted=0`, `duplicates=1`; không được tạo event thứ hai hoặc kích hoạt aggregate lần nữa.
- Commit: `404f5c3899649f9f1f617c2cd3863c23ecb755f7`.
- Đây là kiểm thử một lần trên production; sau khi có bằng chứng và dọn sạch D1, sẽ bỏ phần production write khỏi CI thường trực để tránh tích lũy dữ liệu thử nghiệm.
- Chờ CI/Pages deploy/smoke test; không thay đổi APK/runtime.


### 2026-10-31 — Analytics AN2 production HTTP acceptance completed

- Production CI [#41167147802](https://github.com/blamag999/read-along-android/actions/runs/41167147802) **success** trên commit `404f5c3899649f9f1f617c2cd3863c23ecb755f7`: full regression, JS/Pages Functions syntax, isolation, CORS, explicit consent, valid write, exact replay và session-sequence collision.
- HTTP acceptance: first event `accepted=1, duplicates=0`; exact replay `accepted=0, duplicates=1`; different eventId với cùng sessionId+sequence `accepted=0, duplicates=1`.
- D1 kiểm chứng sau test: đúng 1 raw event, daily aggregate đúng 7 reading seconds + 11 listening seconds + 1 event + 1 unique session; replay và sequence collision không tăng aggregate.
- Đã xóa raw event, daily session và đảo ngược đúng 7/11 giây + event count/session count; final query xác nhận `smoke_events=0, smoke_sessions=0, daily_rows=0`.
- Để tránh làm bẩn production analytics ở những lần CI sau, bỏ phần POST ghi dữ liệu khỏi smoke test thường trực; CI giữ OPTIONS/CORS và consent rejection (non-mutating). Production write/replay/collision là nghiệm thu một lần đã có bằng chứng.
- Commit loại bỏ mutating smoke test: `20319939c6874df2a6ae3ccc9fb86962c96fcad8`; chờ CI regression cuối cho workflow non-mutating.
- AN2 production HTTP acceptance hoàn tất. Không có APK/client collector/dashboard trong batch này.


### 2026-10-31 — Hoàn tất AN2 và khảo sát AN3 collector

- CI [#41167200825](https://github.com/blamag999/read-along-android/actions/runs/41167200825) **success** trên commit `20319939c6874df2a6ae3ccc9fb86962c96fcad8`: regression, syntax, isolation và production CORS/consent smoke test non-mutating.
- AN2 đã có bằng chứng production HTTP write/replay/sequence collision ở [#41167147802](https://github.com/blamag999/read-along-android/actions/runs/41167147802); D1 aggregate đúng một lần và tất cả smoke rows đã được dọn. Production write smoke được bỏ khỏi CI thường trực để không làm bẩn analytics.
- Khảo sát AN3: `app.js` global state có `state.pdfDoc`, `state.currentBookKey`, `state.currentStoryAudios`; PDF load thành công trong `loadPdfFromBlob` và `loadPdfFromUrl`; audio lifecycle có play/pause/ended/error listeners; app lưu reading session ở localStorage và flush khi pause/pagehide.
- `modules/diagnostics.js` đã có event capture và diagnostics consent riêng, nhưng consent này chỉ áp dụng cho việc người dùng chủ động gửi báo cáo công khai; không được tái sử dụng cho analytics opt-in.
- UI hiện có read menu với mục Diagnostics; đề xuất thêm mục Analytics/Thống kê ẩn danh và modal opt-in riêng. Consent mặc định off, lưu key riêng; opt-out dừng ngay và không queue event offline.
- Không có thay đổi runtime trong batch khảo sát. Không build APK. AN3 implementation chưa bắt đầu.


### 2026-10-31 — AN3 collector skeleton and opt-in UI added (CI pending)

- Thêm `modules/analytics-collector.js` độc lập: consent key riêng mặc định off, install/session/event IDs riêng, heartbeat 60 giây, monotonic clock, clamp interval 120 giây, foreground/PDF/audio state, no offline queue/retry, fixed endpoint và no bookId/title/file/URL.
- Thêm mục `Thống kê sử dụng` trong read menu và modal opt-in riêng; diagnostics consent không được dùng lại. Opt-out dừng session, xóa install ID analytics và không gửi thêm event.
- Nạp collector sau `app.js`; thêm module vào Service Worker shell cache và bump cache version v49 → v50.
- Thêm `tests/analytics-collector.test.js` cho default-off, consent, reader start, heartbeat duration, audio pause, foreground pause, opt-out và privacy boundary; thêm vào `npm test` và `check:js`.
- Commits: collector `1633bab2291119277cb6f346a7ca234ae0a3dd7f`, duration fix `dc80ede46ab3a1bb133c4bf7ba865cd1e27694e9`, UI `15551faccbdb9e870352de580b4c2933e529903b`, service worker `085d8fc58fc54b5936608a9f9c50530bf11c2b44`, package `1ca7f664b80ffbc8594f86933a30606f5d0ca7e3`, test `807fa30a7dd594343ef77b17959a3445929dab78`.
- **Chưa nghiệm thu:** CI mới, review code/diff, WebView timing, consent UI thực tế, offline/network behavior và APK build/device test đều pending. Không build APK trong batch này.
- Không thay đổi marker runtime, diagnostics reporting, native bridge hoặc main. README không đổi và vẫn phải đồng nhất ba nhánh.


### 2026-10-31 — Mở rộng AN3 lifecycle regression tests

- Mở rộng `tests/analytics-collector.test.js` để kiểm tra audio ended → audio_stop, visibility hidden/visible → reader_pause/resume, pagehide/pageshow → pause/resume và PDF đóng → reader_stop.
- Commit: `d57969b7da63f9c33cf9a21a5cb205cb2dfba06a`.
- Chờ CI [test]; chưa nghiệm thu runtime hoặc APK. README không đổi.


### 2026-10-31 — Điều chỉnh kỳ vọng heartbeat trong collector test

- CI [#41167459727](https://github.com/blamag999/read-along-android/actions/runs/41167459727) phát hiện test kỳ vọng 60s nhưng collector đã bắt đầu session ngay khi bật consent; test thêm 5s tick sau đó nên tổng thời lượng hợp lệ là 65s. Đây là sai lệch kỳ vọng test, không phải collector đếm vượt thời gian.
- Điều chỉnh test để tick thêm 55s sau 5s đầu, tổng đúng 60s tại heartbeat threshold.
- Commit: `75d6f0e39cc2f492c185ef60b1ba9927e85cde11`.
- Chờ CI mới; chưa nghiệm thu collector runtime. README không đổi.


### 2026-10-31 — Bảo toàn lifecycle events khi fetch khác đang chờ

- CI [#41167501926](https://github.com/blamag999/read-along-android/actions/runs/41167501926) phát hiện `reader_pause` bị bỏ qua khi request `audio_stop` trước đó chưa settle do guard `requestInFlight`. Cách này vô tình tạo drop event không liên quan đến lỗi mạng/offline.
- Bỏ guard serialize request: mỗi event gửi trực tiếp, độc lập; fetch lỗi vẫn drop, không queue/retry và không chặn reader/audio. Sequence vẫn tăng đơn điệu; server dedupe theo eventId và sessionId+sequence.
- Commit: `d79b010a6906c33464852b8719defff0e37f94af`.
- Chờ CI mới; chưa nghiệm thu collector. README không đổi.


### 2026-10-31 — Chốt batch AN3 collector để chạy full regression

- Bổ sung assertion xác nhận entry point `window.ReadAlongAnalytics.openSettings` có sẵn; giữ các test consent/timing/audio/visibility/page lifecycle/PDF close/privacy.
- Commit chốt batch: `c9450a150add931fb971934a6234b7b452f4f10b`; marker `[test]` yêu cầu chạy full regression.
- Code collector đã bỏ in-flight serialization guard theo finding trước đó. Chờ run mới; không build APK trước khi CI pass và review xong.


### 2026-10-31 — AN3 collector follow-up: PDF switch and pagehide duration coverage

- Sửa collector để `pagehide` gửi cả readingSeconds và listeningSeconds, tránh mất phần nghe foreground đã tích lũy.
- Mở rộng test: không tạo install ID trước opt-in; đổi PDF tạo session mới; pagehide khi audio đang phát flush đúng reading/listening duration.
- Commits: collector `577416ac22e21b2d9ffd8626ed8374dc6fd665fb`; test `197eb3c23d65b4e4af404d689aa0dcad9deb6c9f`.
- Chờ CI trên commit test mới; không build APK.


### 2026-10-31 — AN3 collector offline/session sequence tests added

- Bổ sung test cho PDF switch tạo sessionId mới; heartbeat lỗi mạng chỉ được thử một lần, không retry/queue; eventId duy nhất và sequence tăng đơn điệu trong từng session; tên PDF không xuất hiện trong payload.
- Commit test: `723a38ead8458cf04e4a3b8bb31cf13dda946737`.
- Chờ CI; chưa build APK hoặc kiểm thử Android thật.


### 2026-10-31 — Chỉnh expected duration sau offline heartbeat

- CI [#41167683913](https://github.com/blamag999/read-along-android/actions/runs/41167683913) thất bại do test kỳ vọng pagehide reading=4s nhưng trước đó còn 5s foreground sau heartbeat failure; collector đúng khi chỉ giữ 9s kể từ lần flush lỗi (5s + 4s), listening=4s.
- Sửa assertion readingSeconds=9 và ghi rõ semantics: heartbeat failure drop interval trước đó; thời gian mới sau lỗi vẫn được tính đến lần flush kế tiếp.
- Commit: `cab0bf478abd8785d61c5fdc3fe075315c9d1d89`.
- Chờ CI mới; không build APK.


### 2026-10-31 — AN3 collector automated regression pass

- CI [#41167718138](https://github.com/blamag999/read-along-android/actions/runs/41167718138) **success** trên commit `cab0bf478abd8785d61c5fdc3fe075315c9d1d89`: full npm test, JavaScript syntax, Pages Functions syntax, isolation và production non-mutating consent/CORS smoke.
- Collector tests hiện bao phủ default-off/no install ID before opt-in, opt-in/opt-out, random IDs, PDF open/switch/close, heartbeat timing, audio play/pause/ended, foreground/background, pagehide/pageshow, offline drop/no retry, sequence monotonicity và không gửi book title/file name.
- Chưa build APK; rotation trên WebView/Android và đo tác động startup/playback cần nghiệm thu thực tế sau khi hoàn tất batch.


### 2026-10-31 — Hoàn thiện minh bạch consent và rotation test

- Sửa disclosure Analytics để liệt kê chính xác event type + timestamp bên cạnh IDs/version/platform/durations; nêu rõ raw retention 90 ngày và daily aggregate 24 tháng; nhắc không queue offline.
- Thêm test orientationchange không tạo reader session trùng sau khi đổi PDF.
- Commits: UI disclosure `7dfe09eddd4da96b06c4413454189a7e31e85bd0`; orientation test `9b9dce7b7ebd5bb0ba4ab71c48c2422237087077`.
- Chờ CI cuối; không build APK cho đến khi automated tests và review pass.


### 2026-10-31 — Thêm kiểm thử telemetry không chặn reader/playback

- Test collector với fetch promise không bao giờ resolve; thao tác opt-in, timer heartbeat và lifecycle vẫn tiếp tục đồng bộ, chứng minh collector không await network request và không chặn UI/audio.
- Commit: `cb797654d019936b345d51231dd7bc714a9ace1b`.
- Chờ CI mới; chưa build APK.


### 2026-10-31 — AN3 automated acceptance complete; ready for one beta APK build

- CI [#41167810567](https://github.com/blamag999/read-along-android/actions/runs/41167810567) **success** trên commit `cb797654d019936b345d51231dd7bc714a9ace1b`: full regression, JS syntax, Pages Functions syntax, isolation và non-mutating production CORS/consent smoke.
- CI [#41167772447](https://github.com/blamag999/read-along-android/actions/runs/41167772447) success sau khi thêm orientation regression.
- Automated collector coverage hiện gồm: default off/no ID before consent; opt-in/out; unique opaque IDs; reader open/close/PDF switch; heartbeat 60s; audio play/pause/end; foreground/background; orientationchange; pagehide/pageshow; offline drop/no retry; sequence monotonicity; không gửi book/title/file/path/URL/content; pending fetch không block reader lifecycle.
- Code review xác nhận `scripts/prepare-web.js` copy toàn bộ `modules/` vào `www/`, build workflow path filter bao gồm index.html, modules/**, sw.js và package.json; collector được đóng gói vào APK và Service Worker cache v50.
- **Ready for one beta APK build** bằng commit cuối có marker `[build-apk]`. Chưa build trong entry này; kiểm thử WebView/Android thật và Android TV vẫn pending.


### 2026-10-31 — Chốt commit build beta APK cho Analytics collector

- Tạo commit cuối có marker `[build-apk]` để workflow Build and Release Read Along chạy full regression trước khi build APK: `85475373bab4813589cf0d3c0777fe8c27df1da7`.
- Thay đổi source trong commit chỉ là comment giải thích polling boundary; toàn bộ collector/UI/Service Worker/tests đã có ở các commit trước và CI [41167810567](https://github.com/blamag999/read-along-android/actions/runs/41167810567) success.
- Build workflow dự kiến tạo beta APK, verify signature/SHA-256 và GitHub prerelease. Chưa có kết quả build tại thời điểm ghi; không tuyên bố APK đã phát hành.



## 2026-10-31 — Chuẩn hóa Git workflow còn hai nhánh

- Người dùng xác nhận chuyển sang mô hình hai nhánh dài hạn: `beta` (phát triển/tích hợp) và `main` (stable).
- Quy trình mới: làm việc trực tiếp trên `beta`; kiểm thử theo batch; nếu có thay đổi APK runtime thì build beta ở commit chốt `[build-apk]` và nghiệm thu trên thiết bị; chỉ promote sang `main` qua PR khi người dùng xác nhận phát hành stable.
- Hotfix là ngoại lệ: nhánh tạm `hotfix/*` tạo từ `main`, PR vào `main`, sau đó back-merge về `beta`. Không tạo nhánh tạm cho từng lỗi thông thường.
- Kiểm tra lịch sử `testing`: HEAD `ef1cde5203a7af9e3846162de8ae4b693a124d9d`, chỉ ahead `beta` 1 commit và behind 290 commits; commit duy nhất có message “Sync shared working rules README from beta”, chỉ sửa README. Blob README là `b2827219f11043b93225306ede69340ea2a0da01`, trùng blob README hiện tại trên `beta`. Không có code/runtime commit riêng cần bảo toàn. Việc bỏ nhánh này không làm mất thay đổi nội dung.
- Workflow `.github/workflows/check-readalong-admin.yml` đã bỏ `testing` khỏi push branch filter; PR checks vẫn áp dụng cho `beta` và `main`.
- README được chuẩn hóa cho hai nhánh và đồng bộ byte-for-byte trên `beta`/ `main` bằng commit README-only. Chi tiết commit SHA sẽ được bổ sung sau khi xác minh các lần ghi.
- Trạng thái giới hạn: connector GitHub hiện không cung cấp thao tác xóa branch hoặc quản trị branch protection. Không tuyên bố `testing` đã xóa hoặc `main` đã được bảo vệ cho đến khi xác minh trực tiếp trên GitHub Settings. Không force-update hoặc ghi đè lịch sử.
- Không thay đổi APK/runtime/backend/Cloudflare, không build APK và không promote code sang `main` trong đợt chuẩn hóa workflow này.


- Kết quả xác minh sau cập nhật: README blob trên cả `beta` và `main` cùng SHA `7ba8a6a23ec02f151681394993d2f27098253713` (byte-for-byte giống nhau).
- Commit cập nhật: beta README `43176eee6a394b4fc728e788ee714c5a44fc8bee`; main README-only `d683282ad319ba4b9a1bc5669a0e12667c20ac8a`; CI workflow `55499860003adbfa3c1c5ffa013a38d713c34cc6`; ROADMAP `8fe5d18af1c51dfd3016044f67e4f4f78de4ea45`; PLANNING `eaa3ff9a4ee930a80f22201113b8cd4e0255fee4`.
- Lưu ý: sau các commit cập nhật tài liệu, HEAD beta đã tiến thêm; so sánh mới nhất cho thấy `testing` vẫn chỉ có đúng 1 commit riêng (README-only) và không có source code khác biệt cần giữ. Branch vẫn tồn tại do connector không cung cấp delete-ref action.


### 2026-10-31 — Analytics AN3.8 beta APK build verified

- Workflow [41167887202](https://github.com/blamag999/read-along-android/actions/runs/41167887202) completed successfully on `85475373bab4813589cf0d3c0777fe8c27df1da7`; npm regression, Pages Functions syntax, isolation, signed APK build, signature verification, artifact upload and GitHub Release steps all passed.
- Release `v1.3.7` (prerelease/beta) published: https://github.com/blamag999/read-along-android/releases/tag/v1.3.7
- APK asset: `read-along-v1.3.7-android.apk`; SHA-256: `a4f4f5e85f04af05a53925888685ed28b82ba02867571a4ffe84769bcaf06299`.
- Device acceptance is not yet confirmed. User should install/update this APK and test Analytics consent, opt-in/out, reading/listening counters, offline behavior and playback stability. Android TV remains pending.
- Next after AN3 device acceptance: design safe marker migration; AN4 dashboard follows AN3 collector acceptance and can be developed independently without APK build.


### 2026-10-31 — AN3 device acceptance confirmed; AN4 dashboard scope and implementation batch

- Người dùng xác nhận hoàn tất kiểm tra APK beta v1.3.7; đợt kiểm tra không phát hiện lỗi. Đối chiếu số liệu Analytics chuyển sang bước nghiệm thu Dashboard; Android TV vẫn pending.
- Theo yêu cầu người dùng, loại bỏ KPI “phiên hoạt động/ngày”; KPI sử dụng gồm thời gian đọc, thời gian nghe, tổng thời gian sử dụng và thiết bị hoạt động.
- Bổ sung nhóm Library Health: số đầu sách trong manifest đã xuất bản, số PDF, phần audio, sách có sync JSON; lỗi/cảnh báo/tệp đã quét/thời điểm của lần quét thư viện gần nhất.
- Dashboard API và UI đã được thêm trên beta; các commit batch gồm API 1aca05e/d664b73/d586fd6/2097370, UI 238b8f8/e1044de/4decafe/658b968, render a543bc9/61b9350, tests bf4fd4c/d669aa3, styles 6d3bf84.
- Chú ý privacy: không có thống kê sách đã đọc theo đầu sách vì Analytics collector không gửi bookId/tên sách. Số đầu sách trên Dashboard là số sách hiện có trong manifest đã xuất bản, không phải số sách từng được mở.
- Chú ý freshness: lỗi/cảnh báo phản ánh lần quét gần nhất trong admin_scan_logs; Dashboard không tự chạy scan khi mở để tránh tốn tải và tránh tác động dữ liệu vận hành.
- Còn pending: chạy regression CI, kiểm tra Pages deployment, kiểm tra authenticated Dashboard và đối chiếu thời lượng đọc/nghe thật sau opt-in. Chưa tuyên bố Dashboard hoàn tất.


### 2026-10-31 — AN4 dashboard regression CI passed

- CI [41169858843](https://github.com/blamag999/read-along-android/actions/runs/41169858843) success trên commit e03acee6141ddc064f162475fad0e2c67655c994: full npm regression, JS syntax, Pages Functions syntax, isolation và non-mutating production consent smoke đều pass.
- Trong quá trình test đã sửa assertion catalog.test.js để kiểm tra đúng bảng file trong library (không nhầm bảng phân bổ analytics), bỏ hoàn toàn activeSessionDays khỏi API response vì người dùng không cần KPI này.
- Cloudflare Pages deployment của commit e03acee đang ở trạng thái Building tại thời điểm ghi; chưa xác nhận production dashboard hoạt động. Chưa kiểm tra số liệu thật và chưa đóng AN4.


### 2026-10-31 — AN4 dashboard navigation and public read-only access (beta)

- Theo xác nhận của người dùng, Dashboard thống kê được đưa thành trang mặc định của Admin; nút “Quản lý nâng cao” là lối vào duy nhất khu vực OTP/quản lý thư viện.
- Màn hình OTP có nút “Về Dashboard”; khu vực quản lý sau đăng nhập chỉ còn điều hướng quản lý thư viện, không lặp Dashboard.
- Chuyển riêng `GET /analytics/dashboard` ra trước OTP guard. API chỉ trả dữ liệu tổng hợp theo ngày, thời lượng đọc/nghe, số thiết bị theo nền tảng, số liệu manifest và kết quả scan gần nhất; không trả install/session IDs, book IDs, tiêu đề sách hay dữ liệu tệp cá nhân. Không có mutation route nào được chuyển ra public.
- Toàn bộ API upload/rename/delete/scan/publish/catalog/audit tiếp tục nằm sau `requireAuth` OTP. Các API ingest analytics/telemetry là các endpoint riêng theo contract sẵn có, không thay đổi trong batch này.
- Regression mới kiểm tra dashboard landing/OTP back button và thứ tự public GET so với auth guard. Full regression, JS syntax, Pages Functions syntax, isolation và production consent smoke đã pass trong CI [41170506777](https://github.com/blamag999/read-along-android/actions/runs/41170506777) trên commit `07bd866af16de1dc33d989ac8f6da90349cd539c`. Cloudflare Pages deployment đang chạy; cần xác minh trang chủ mặc định, public GET và OTP chặn API quản trị sau deploy. Không cần build APK.


### 2026-10-31 — AN4 Dashboard được người dùng xác nhận hoạt động thành công

- Người dùng xác nhận Dashboard production hoạt động thành công; đóng nghiệm thu AN4 theo xác nhận thực tế ngày 2026-10-31.
- Dashboard mặc định là trang chủ Admin; khu vực “Quản lý nâng cao” vẫn đi qua OTP. Public endpoint chỉ đọc dữ liệu tổng hợp; các API thay đổi dữ liệu tiếp tục được bảo vệ.
- Regression CI gần nhất của batch điều hướng/API: [41170506777](https://github.com/blamag999/read-along-android/actions/runs/41170506777), success trên commit `07bd866af16de1dc33d989ac8f6da90349cd539c`. Tài liệu hiện tại ở beta HEAD `3d9f4d49509c52b6f9ca9fc8ad9a47ec4a220b36`.
- Giới hạn nghiệm thu: xác nhận Dashboard hoạt động từ người dùng; không ghi nhận việc đối chiếu số liệu thực tế với một khoảng đọc/nghe có thời lượng đo độc lập. Không cần build APK cho AN4.

### 2026-10-31 — Reset thống kê và sửa nguyên nhân có thể nhân đôi installation identity

- Trước khi reset, D1 production `read-along-admin-db` có 21 `admin_reading_events`, 1 ngày aggregate, 4 daily-session rows; Dashboard query đếm 2 `install_hash` Android. Nhóm usage cũ có 24 visits và 1 installation. Điều này cho thấy số 2 nằm ở Analytics reading collector, không phải bằng chứng có hai thiết bị vật lý.
- Xác định collector hiện tại xóa `read_along_analytics_install_id_v1` khi opt-out. Nếu người dùng tắt rồi bật lại consent trên cùng app install, `ensureInstallId()` tạo mã mới; dashboard đếm mã cài đặt mới thành một thiết bị khác. Cài lại/xóa dữ liệu app cũng có thể tạo mã mới; ID ngẫu nhiên không chứng minh danh tính thiết bị vật lý.
- Đã sửa collector để giữ random installation ID cục bộ qua lần opt-out/re-consent; trong thời gian consent=false không gửi event. Bổ sung regression test xác nhận re-consent trên cùng app install giữ nguyên installId. Commits: collector `8f7bb96123f8a2584bde887ead668edda794f9c2`; test `4865e9c00df5116082884de8b53aa8ab46617cc8`. Chưa có CI trên commit test cuối, chưa build APK.
- Theo yêu cầu người dùng, đã xóa dữ liệu thống kê trong đúng D1 `read-along-admin-db`: `admin_reading_events`, `admin_reading_daily_sessions`, `admin_reading_daily`, `admin_app_visits`, `admin_app_installations`; reset `admin_app_totals.total_visits` và `admin_app_platform_totals.total_visits` về 0. D1 batch thành công; truy vấn xác minh sau xóa trả 0 cho tất cả bảng/counter trên.
- Không xóa `admin_audit_log`, `admin_scan_logs`, `admin_scan_cache`, `admin_client_events`, `admin_server_errors`, `admin_sessions`, `admin_auth_attempts`, `admin_totp_state` hoặc dữ liệu thư viện/R2. Đây là nhật ký vận hành, bảo mật, diagnostics hoặc nội dung, không phải thống kê sử dụng; giữ nguyên để không làm mất khả năng quản trị/chẩn đoán.
- Dashboard có thể nhận thống kê mới ngay khi collector bản APK hiện tại gửi event trở lại; việc giữ installId qua opt-out có hiệu lực sau khi cài APK chứa commit sửa. Dữ liệu cũ đã reset nên không thể truy nguyên hai hash cũ sau thao tác xóa.
### 2026-10-31 — APK Core decoupling and install identity correction
- Giữ nguyên catalog R2, PDF/audio cloud path, marker sync, OTA, Diagnostics và Analytics collector; không xóa API/backend độc lập.
- Collector giữ install ID qua opt-out/re-consent; regression test cập nhật để xác nhận cùng một ID trong cùng app data. Commit code: 8f7bb961; test: 3eada363, 4865e9c.
- Production usage statistics đã reset và query xác nhận 0 cho reading events/daily/session, app visits/installations và app/platform totals; audit/security/diagnostics/library/content data được giữ.
- Các thay đổi trên đã push beta. Chưa tuyên bố APK Core freeze hoặc APK build thành công cho đến khi full regression + build workflow hoàn tất.

### 2026-10-31 — Admin Dashboard redesign and management UX (beta deployment)

- Tái cấu trúc Admin ban đầu thành 5 tab ngang; sau đó đã bỏ tab Tổng quan trùng Dashboard công khai, còn 4 tab: **Thư viện → Kiểm tra → Thống kê → Nhật ký**. Sau khi khôi phục session hoặc đăng nhập OTP, tab mặc định là Thư viện. Public dashboard vẫn có KPI gọn và nút vào quản trị.
- Bố cục được tinh gọn, tăng chiều rộng nội dung, giảm khoảng trắng dư thừa; hỗ trợ Light/Dark, lần đầu theo `prefers-color-scheme`, lựa chọn thủ công được lưu trong localStorage.
- Mỗi tab có Status Bar riêng, thống nhất kiểu hiển thị và giữ trạng thái tại tab khởi tạo tác vụ. Thêm Status Bar cho public dashboard.
- Thư viện: upload nhiều file có tiến trình tổng thể, kết quả từng file và tiếp tục các file còn lại nếu một file thất bại; đổi tên hiển thị tên nguồn/đích và kết quả; xóa file/thư mục yêu cầu xác nhận trong giao diện và nêu đường dẫn đối tượng.
- Tách xuất bản `books.json` sang thao tác trong Thư viện; tab Kiểm tra tập trung vào quét và báo cáo. Bỏ toàn bộ FFmpeg/WMA→MP3 conversion từ Admin JS/CSS; gỡ CSP allowances cho jsDelivr, blob worker và WebAssembly không còn cần. WMA/định dạng không hỗ trợ chỉ được cảnh báo thay file thủ công.
- Gợi ý ghép tên chỉ được backend cung cấp khi độ tương đồng tên chuẩn hóa >=95%; mức thấp hơn không có nút duyệt đổi tên tự động và chỉ hướng dẫn đối chiếu thủ công. Quy tắc đặt tên audio-part xác định được vẫn có thể đưa ra gợi ý tất định. Tăng scan rule version lên `2026-10-31.1` để buộc rà soát lại cache theo rule mới.
- Bảo toàn TOTP/session/cookie, API quản lý R2, upload multipart, rename/move, delete, diagnostics scan, catalog preview/publish, Analytics và audit. Không thay đổi D1 schema, dữ liệu R2, APK hoặc native Android.
- Files changed: `admin/public/index.html`, `admin/public/admin.css`, `admin/public/admin.js`, `admin/public/_headers`, `admin/functions/api/readalong-admin/[[path]].js`, `admin/README.md`, `tests/admin-dom.test.js`, `tests/catalog.test.js`.
- Final beta commit: `4a6fff53bce9b1bd251bd1d129ecf784b56ca651`. Full regression workflow [41178300718](https://github.com/blamag999/read-along-android/actions/runs/41178300718) completed successfully, including `npm test`, JavaScript syntax checks and Admin DOM/API isolation tests.
- Cloudflare Pages project `read-along-admin` deployed successfully from beta commit to deployment [0547791f](https://0547791f.read-along-admin.pages.dev); deployment ID `0547791f-5b21-41fe-b673-0424ea1ebb45`. Existing Production D1 binding `read-along-admin-db`, R2 binding `my-audio-book`, and TOTP secret binding remain configured.
- No APK build, no D1 migration, no R2 mutation, no main branch update or stable promotion. **Pending:** user acceptance test of the deployed beta UI; see P1 in PLANNING.



### 2026-10-31 — Bỏ tab Tổng quan trùng Dashboard công khai (beta)

- Theo yêu cầu tinh gọn điều hướng, bỏ tab **Tổng quan** khỏi khu vực quản trị vì nội dung KPI/xu hướng trùng Dashboard công khai.
- Điều hướng quản trị còn 4 tab: **Thư viện → Kiểm tra → Thống kê → Nhật ký**; mặc định sau đăng nhập/khôi phục session vẫn là Thư viện.
- Dashboard công khai giữ nguyên KPI và trạng thái; thống kê chi tiết vẫn tải trong tab Thống kê. Không thay đổi API, D1, R2, TOTP/session, dữ liệu thư viện hoặc APK.
- Cập nhật regression DOM để xác nhận không còn tab/panel/handler Tổng quan và Dashboard công khai vẫn còn số liệu. CI/deployment sẽ được ghi bổ sung sau khi xác minh.


### 2026-10-31 — Người dùng nghiệm thu Admin Dashboard beta

- Người dùng xác nhận Dashboard đã chạy ổn sau khi triển khai; đóng hạng mục nghiệm thu Dashboard trong PLANNING.
- Điều hướng Admin đã được tinh gọn còn 4 tab: **Thư viện → Kiểm tra → Thống kê → Nhật ký**; tab Tổng quan trùng với Dashboard công khai đã bị loại bỏ. Dashboard công khai và các KPI vẫn được giữ.
- Commit bỏ tab Tổng quan: `fb1facd2478e7afd80b934a5056fecb559d92126`; commit cập nhật kiểm thử: `7d88475bfaf2d6e3676228eeb1244d3a6afa7ccf`.
- Phạm vi nghiệm thu theo xác nhận người dùng: Dashboard beta hoạt động ổn. Không suy diễn đây là nghiệm thu toàn bộ regression APK Core, Android TV, OTA hoặc marker migration; các việc đó tiếp tục nằm trong PLANNING.
- Không thay đổi `main`, APK, D1 schema hoặc dữ liệu R2.


### 2026-10-31 — Git-based recovery và đối chiếu sau handover

- Bổ sung quy trình khôi phục tiến trình vào README: Git history/working tree là nguồn sự thật về thay đổi; tài liệu handover không được xem là trạng thái hiện tại nếu HEAD hoặc working tree đã vượt mốc.
- Tạo `RECOVERY.md` trên beta để ghi `last_handover_commit`, `last_reviewed_head`, trạng thái recovery, phát hiện sau bàn giao và quy trình đối chiếu. README hướng dẫn kiểm tra cả commit đã push lẫn staged/unstaged/untracked trong working tree; thay đổi local chưa push không thể phục hồi từ GitHub.
- Đối chiếu hiện trạng marker: `modules/marker-resolver.js`, `tests/marker-resolver.test.js`, `docs/architecture/marker-and-api-review.md` đã tồn tại ở beta. Resolver là pure module, chưa tích hợp reader/runtime. CI resolver được ghi nhận success: [41164224271](https://github.com/blamag999/read-along-android/actions/runs/41164224271). Không có cơ sở kết luận migration/runtime đã hoàn tất; tiếp tục giữ các mục tương ứng trong PLANNING.
- Mốc handover trước: `1ea6bb3124bafc9c5819d78146fa2cafb8206f40`. Beta README recovery commit: `fb521a9927fa4e81d414049208f30e296266c80e`; RECOVERY file commit được ghi trong GitHub sau khi tạo.
- README beta blob: `0fac10f7d304663ff96726971b2eab046e564ee6`. Mở PR README-only #40 để đồng bộ main; PR chưa merge. Không bypass branch rule và không push trực tiếp.
- Không thay đổi APK runtime, không build APK, không promote code hoặc sửa main trực tiếp.


### Mốc bàn giao kiến trúc — 2026-10-31

- Đã cập nhật tài liệu kiến trúc Core APK theo hướng mở rộng catalog/metadata mà không thay đổi engine PDF/audio khi không cần thiết.
- Các hạng mục catalog category và per-book progress vẫn là kế hoạch, chưa được nghiệm thu runtime.
- HEAD đã được đối chiếu trước checkpoint: `284484f6266d0c9792bd82b36ab1e00ea179ee1b`.

### 2026-10-31 — Tinh gọn cấu trúc Core APK và Pages

- Rà soát beta HEAD xác nhận không còn module client/bootstrap cấu hình, schema tương ứng, validator, test fixture, static JSON hoặc endpoint smoke workflow trong source tree. Các đường dẫn cũ đều không còn tồn tại.
- `index.html` không nạp client cấu hình; thứ tự script hiện hành giữ page-sync, playlist/catalog, app, remote-sync và diagnostics. `sw.js` cache shell v52 không khai báo asset cấu hình. `package.json` không còn test/syntax script cho phần đã loại bỏ.
- Tài liệu README, PLANNING, ROADMAP, RECOVERY, Data Contract và kiến trúc Core đã được làm sạch; không còn checklist hoặc mô tả vận hành của hệ thống này. Core chỉ dựa trên các nguồn catalog/media/marker hiện có.
- Cloudflare Pages `read-along-admin` được xác minh có `build_command: true`, `root_dir: admin`, `destination_dir: public`; không còn custom pre-publish validator. Production deployment [28123f6e](https://28123f6e.read-along-admin.pages.dev) success trên commit `8722c5673f01e9e7ec2ac9430217146d88b324c5`.
- PR #40 được cập nhật theo README beta mới nhất; diff vẫn chỉ chứa `README.md`, PR còn mở để đồng bộ quy tắc dùng chung sang `main`. Không merge/promote stable trong batch này.
- Chưa xác minh trực tiếp HTTP 404 của URL asset cũ do endpoint không truy cập được qua công cụ kiểm tra; không dùng deployment success để khẳng định response status. Không có thay đổi R2/D1, API nghiệp vụ, reader/audio engine, OTA installer hoặc APK build trong batch tài liệu này.

### 2026-10-31 — Chốt ưu tiên Core: Online Reading Progress theo device ID

- Người dùng xác nhận yêu cầu: tiến trình đọc/nghe phải lưu online theo từng thiết bị; mỗi thiết bị có identity ổn định, mỗi sách có progress riêng. Local không còn là bản lưu duy nhất mà chỉ là cache/outbox.
- Chọn hướng kỹ thuật để audit/triển khai: Android `Settings.Secure.ANDROID_ID` làm identity source trên native, tạo app-scoped identifier; không dùng UUID chỉ nằm trong app data. Theo tài liệu Android, từ Android 8.0 ID được scope theo signing key + user + device và không đổi qua uninstall/reinstall thông thường; có thể đổi sau factory reset hoặc đổi signing key. Đây không phải hardware ID bất biến tuyệt đối. <https://developer.android.com/reference/android/provider/Settings.Secure>
- Backend dự kiến: bảng progress riêng trong D1 hiện hữu, khóa `(device_id, book_id)`; endpoint qua Pages Functions/router hiện có sau audit. Không tạo Worker/database mới, không nhập chung analytics/marker/catalog.
- Kế hoạch chi tiết, identity fallback, API contract, offline outbox, conflict handling, migration và acceptance cases được ghi trong PLANNING và `docs/architecture/core-extensibility.md`.
- Trạng thái: quyết định/plan đã ghi nhận; chưa triển khai native identity, D1 schema/API, APK sync engine hoặc kiểm thử clear-data/uninstall trên thiết bị. Không có dữ liệu progress nào được migrate hoặc upload trong bước này.

### 2026-10-31 — Audit và chốt kiến trúc OTA provider-neutral (chưa triển khai)

- Người dùng đồng ý dùng hạ tầng Cloudflare hiện có và yêu cầu đổi nơi lưu trữ APK về sau chỉ cần thay đổi backend, không phải build APK.
- Audit Cloudflare xác nhận Pages project `read-along-admin` đang chạy Pages Functions, root `admin`, production branch `beta`; router API dùng chung nằm trong `admin/functions/api/readalong-admin/[[path]].js`. Không cần tạo Worker mới cho OTA.
- Production binding hiện tại của đúng Pages project gồm D1 `DB` và R2 `READALONG` trỏ tới `my-audio-book`. Chưa có bucket/binding riêng cho APK; không thay đổi hoặc ghi vào bucket sách. Pages project hiện chỉ có `read-along-admin.pages.dev`, chưa gắn custom domain.
- Audit mã nguồn beta xác nhận `app.js` đọc GitHub Releases API và chỉ chấp nhận asset URL có hostname `github.com`; `native/android/ApkUpdaterPlugin.java` cũng hardcode prefix `https://github.com/`. Workflow `.github/workflows/build-android-apk.yml` ký APK, kiểm tra chữ ký/SHA-256 và tạo GitHub Release. `tests/ota-update.test.js` hiện chỉ kiểm tra cleanup cache, chưa kiểm tra manifest/chữ ký/checksum.
- Kiến trúc mục tiêu: Pages Functions làm bootstrap/API ổn định; bucket R2 riêng `read-along-releases` + binding `OTA_RELEASES`; manifest có version/channel/versionCode/size/SHA-256/chữ ký số; download được proxy qua endpoint backend cố định để APK không phụ thuộc hostname storage provider. GitHub Actions upload APK + manifest ký số. Không dùng D1 cho OTA MVP.
- Chuyển đổi an toàn: backend + upload test trước; build một APK beta chuyển tiếp khi repo còn public; nghiệm thu OTA trên thiết bị; chỉ sau đó mới chuyển repository sang Private. Giữ nguyên khóa ký APK.
- Domain hiện tại là `read-along-admin.pages.dev`. Nếu chỉ đổi storage provider trong khi Pages Functions vẫn là bootstrap thì APK không cần build lại. Nếu muốn chuyển cả bootstrap khỏi Cloudflare, cần custom domain do người dùng sở hữu; domain `pages.dev` không thể mang sang nhà cung cấp khác.
- Trạng thái: audit và plan đã ghi vào PLANNING; chưa tạo bucket/binding/domain/token/secret, chưa sửa router, workflow, APK runtime hoặc dữ liệu Cloudflare; chưa build APK và chưa chạy OTA acceptance. Không thay đổi main.

### 2026-10-31 — OTA backend, fixed client endpoint và native checksum gate (beta)

- Tạo bucket R2 riêng `read-along-releases` ở APAC và gắn binding production `OTA_RELEASES` vào Pages project `read-along-admin`. Binding sách `READALONG` → `my-audio-book`, D1 `DB` và dữ liệu sách được giữ nguyên.
- Mở rộng Pages Functions router hiện hữu bằng public read-only routes `GET /api/readalong-admin/ota/latest?channel=beta|official` và `GET /api/readalong-admin/ota/download?channel=...&version=...`. Manifest được validate nghiêm ngặt; object key suy ra server-side; size và R2 custom metadata SHA-256 phải khớp; file được stream qua Pages API, không expose storage URL.
- Đổi app.js sang API Pages cố định; thêm meta app-version-code và so sánh versionName + versionCode. Native updater khóa host/path Pages, tắt redirect, giới hạn APK tối đa 250 MiB, tính SHA-256 khi stream và không mở installer nếu checksum/size mismatch.
- GitHub Actions được bổ sung bước upload APK rồi manifest bằng S3-compatible R2 API; dùng token chỉ có Object Read & Write trên bucket riêng. Workflow fail-closed nếu thiếu hai GitHub secrets `R2_ACCESS_KEY_ID` và `R2_SECRET_ACCESS_KEY`. GitHub Releases vẫn được giữ trong giai đoạn chuyển tiếp.
- Full regression, JS syntax, Pages Functions syntax, isolation và production OTA API smoke pass tại [41183506939](https://github.com/blamag999/read-along-android/actions/runs/41183506939); production API smoke cũng pass tại [41183146147](https://github.com/blamag999/read-along-android/actions/runs/41183146147).
- Cloudflare Pages backend deployment đã thành công và binding được xác minh. OTA API hiện trả 404 có chủ đích khi chưa có manifest; chưa có APK/manifest thật trên R2.
- Chưa tạo R2 API token, chưa thêm GitHub secrets, chưa upload APK, chưa chạy APK build/Gradle compile hoặc OTA install trên thiết bị. Người dùng cần tạo token bucket-scoped và lưu hai secrets theo PLANNING trước khi tạo bản APK beta chuyển tiếp.
- Không đổi main, không chuyển repository sang Private, không đổi signing key và không xóa GitHub Releases.



### 2026-10-31 — Giữ ba mốc đọc gần nhất theo từng cuốn sách

- Reader local session được nâng thành record riêng theo book key gồm mốc hiện tại và tối đa hai mốc trước đó (tổng cộng ba mốc).
- Khi đổi trang/part audio, tua lùi hoặc nhảy audio đáng kể, vị trí trước đó được lưu thành checkpoint; các lần cập nhật tiến trình bình thường trên cùng vị trí chỉ cập nhật mốc hiện tại, tránh làm đầy lịch sử bởi mỗi sự kiện timeupdate.
- Bổ sung bộ chọn ba mốc gần nhất và nút khôi phục ngay khu vực trạng thái đọc. Khôi phục không tự phát audio; vị trí đang đọc trước khi khôi phục vẫn được giữ trong lịch sử.
- Dữ liệu legacy một-mốc được migrate sang cấu trúc mới khi đọc; không xóa dữ liệu cũ.
- Regression assertions được bổ sung vào `tests/ota-update.test.js`. CI và build APK beta được kích hoạt tại commit chốt của batch; nghiệm thu thiết bị vẫn pending.
- Không thay đổi D1/API, native updater, signing key hoặc nhánh `main`.


### 2026-10-31 — Sửa đồng bộ mốc audio 0 giây ở trang 2

- Audit `modules/page-sync.js` xác nhận `findTargetPage()` loại bỏ mọi marker có `time === 0` trên trang lớn hơn 1. Quy tắc này khiến dữ liệu hợp lệ `{ "2": 0 }` không thể đồng bộ reader sang trang 2 khi audio bắt đầu.
- Đã bỏ điều kiện loại trừ theo số trang; mốc 0 được xử lý như timestamp hợp lệ. Nếu nhiều trang cùng có timestamp 0, thuật toán hiện vẫn chọn trang có số nhỏ nhất do chỉ thay target khi timestamp mới lớn hơn target hiện tại.
- Cập nhật `tests/modules.test.js`: kiểm tra riêng mốc trang 2 bằng 0, tie giữa trang 2 và 3, và tie 0 trên trang 1–3.
- Commit runtime: `968b7142ea13a42e29a94878d240ea6104dd047a` (`modules/page-sync.js`); commit regression: `c8f6dd488a98ced98309f6fa16485d34816c7ceb` (`tests/modules.test.js`).
- CI/build chưa chạy cho hai commit này vì commit không mang marker `[build-apk]`; APK chưa được tạo. Device acceptance còn pending.
- Chưa thay đổi main, OTA backend, Cloudflare resources, dữ liệu R2/D1 hoặc signing key.


### 2026-10-31 — Touch-first reader, timestamp spreads và foreground-only audio (beta)

- Mở rộng pure page-sync helper để quyết định ghép trang theo cặp: trang có timestamp được ghép với trang lân cận không có timestamp; nếu cả hai trang trong cặp đều có timestamp thì chỉ hiển thị trang được đánh dấu. Mốc 0 giây vẫn hợp lệ; marker thuộc audio part khác không được coi là marker hợp lệ cho part hiện tại.
- Runtime tự chuyển giữa trang đơn và cặp trang theo marker đang hoạt động. Sau marker cuối cùng không tự lật hoặc ước tính thời gian; người đọc tự chuyển tiếp. Tệp không có marker giữ chế độ trang đơn.
- Bổ sung nút Đóng sách: lưu phiên, dừng audio, giải phóng PDF/canvas/audio source và quay lại danh sách sách. Khi mở lại sách có phiên đã lưu, hỏi có tiếp tục vị trí gần nhất hay bắt đầu từ đầu; ba checkpoint hiện có vẫn dùng được và khôi phục không tự phát.
- Bổ sung chính sách Back: khi đang đọc hỏi đóng sách; khi không có sách hỏi thoát app. Native lifecycle bridge chuyển Android Back và onUserLeaveHint thành sự kiện JS; Home/background lưu vị trí và dừng audio, không tự phát lại. Thêm native AppLifecyclePlugin.exitApp() để đóng Activity sau khi người dùng xác nhận thoát.
- Bổ sung ba vùng chạm mờ trên trang: 25% trái lật trang trước, 50% giữa play/pause, 25% phải lật trang sau; vuốt ngang vẫn lật trang và tránh kích hoạt tap lần hai.
- Regression coverage mới trong tests/modules.test.js và tests/native-lifecycle.test.js. Phạm vi thiết kế/kiểm thử của batch này là điện thoại Android màn hình cảm ứng; không thực hiện tối ưu Android TV.
- Tại thời điểm ghi mục này, code đã được chuẩn bị cho commit beta; CI/build APK và nghiệm thu thiết bị chưa được xác nhận. Xem PLANNING để biết các bước acceptance còn lại.


### CI status — 2026-10-31

- Functional implementation commit: c988a4ab31d70f41a2bc672eac7541f7b4c1c67e (beta).
- Full npm test suite, Pages Functions syntax and isolation checks passed in workflow run 41189021463.
- Native updater/lifecycle integration and Android asset preparation passed.
- At last status check, the signed APK Gradle build step was still in progress; APK checksum verification and R2 OTA publication are not yet confirmed. Do not treat this batch as install-ready until run 41189021463 completes successfully.


### Beta APK v1.3.12 — build verified 2026-10-31

- Workflow run 41189021463 completed successfully: full npm regression suite, Pages Functions syntax, isolation checks, native integration, signed APK build, APK verification, R2 OTA publication, artifact upload and GitHub Release all passed.
- Beta release: https://github.com/blamag999/read-along-android/releases/tag/v1.3.12
- APK: read-along-v1.3.12-android.apk (3,437,002 bytes). The release also includes its SHA-256 sidecar and Web Local ZIP.
- R2 OTA publish step completed successfully for the beta channel. Do not promote to main/stable before device acceptance.
- Remaining: install/test on a touch-screen Android phone and report any regression. Android TV remains out of scope.


## Touch reader corrections — 2026-10-31

- Scope: touch-screen Android phones; Android TV remains out of scope for this batch.
- Work item 1 — notification layout/content: preserve newline formatting in toast messages; shorten OTA confirmation notes to user-visible changes and a concise install prompt. Release notes are generated only from explicit [feature], [fix], and [perf] commit-body entries; omit hashes, versionCode and internal build metadata.
- Work item 2 — header layout: compact Playlist and Close Book actions so Playlist, Close Book and Read Menu remain on one row on narrow screens.
- Work item 3 — checkpoints: move the existing per-book three-position selector/restore action into the reader menu so it is reachable while reading. The underlying local checkpoint storage remains unchanged; restore must not autoplay.
- Work item 4 — backward timestamp navigation: when the requested previous page lacks a marker, resolve the nearest preceding valid marker for the current audio part, render its page spread, and seek to that marker. Preserve forward auto-sync and do not accept markers from another audio part.
- Work item 5 — PDF touch bounds: compute the visible PDF canvas bounds and constrain both tap zones and horizontal swipe handling to that region. Recalculate after rendering and resize/orientation changes.
- Verification result: implementation and automated regression passed; signed beta APK v1.3.13 was built, verified and published to R2 OTA. Device acceptance remains pending. Do not promote to main/stable until the user accepts the APK on a touch-screen phone.



### Delivery result — beta v1.3.13

- Code commit: d83b284d8d57863763560f812f41521f897c9a3e.
- GitHub Actions run 41191629320 completed SUCCESS: full npm regression suite, JavaScript/Pages checks, Android integration, signed Gradle APK build, APK signature verification, R2 beta OTA publication, workflow artifact upload and GitHub Release creation.
- Release: [Read Along Beta v1.3.13](https://github.com/blamag999/read-along-android/releases/tag/v1.3.13).
- APK size: 3,438,317 bytes. SHA-256: 51ee1ff153d093633a3f7125c31cb85ff1e3adc86f136c18a466ee93c854d689.
- Release notes now contain only the user-facing new feature, improvements/fixes and one performance/stability line; no commit hashes or versionCode are shown.
- Device acceptance is still pending. Test on a touch-screen phone, especially page 5 → pages 3–4 with page 4 unmarked, three checkpoints, single-row header, notifications and touch zones limited to the PDF canvas.
- No main/stable promotion. Android TV remains out of scope.



## 2026-10-31 — Touch header và tinh gọn menu (beta, đang chờ kiểm chứng)

- Header portrait: bổ sung responsive layout cho chiều rộng ≤600px và ≤380px; header title được phép ellipsis, header actions không co tràn, nhãn chữ Playlist/Đóng sách ẩn ở màn hình hẹp để giữ nút Danh sách truyện, Đóng sách và Menu tách biệt.
- Marker: bỏ nút cập nhật marker trực tuyến, token GitHub và UI đồng bộ marker GitHub; bỏ tải remote-sync client khỏi app. Giữ marker JSON đi kèm nội dung/catalog R2 và chức năng nhập/xuất JSON cục bộ. Không thay đổi R2 object hoặc API/backend.
- Menu: bỏ mục Chẩn đoán/Báo lỗi và không nạp diagnostics client; bỏ màn hình xin đồng ý thống kê; analytics mặc định bật. Bộ thu thập hiện hữu chỉ đo sự kiện và thời lượng đọc/nghe ẩn danh, không gửi tên sách, tên file hoặc nội dung.
- Đổi nhãn checkpoint từ “Mốc đã đọc gần đây” thành “Mốc đọc gần đây”.
- Regression assertions bổ sung trong `tests/modules.test.js` cho menu đã tinh gọn, header responsive, nhãn checkpoint và bảo toàn export marker local.
- Code batch được mở rộng thêm bằng commit `163abfbeab279b479e358e39ada6f3fa63fda3dd`: loại bỏ fallback `loadCloudSyncForBook()` để không còn nạp đè marker R2 bằng nguồn đồng bộ online. Regression assertions bổ sung tại `f2bebf47071a712021e29e6645551e8bdc910475`, cùng analytics default-on test tại `2298de525308f5dd257e818a5a9c1e966169dd69`.
- Trạng thái: IMPLEMENTED; full regression, Pages syntax/isolation, channel validation và web/native preparation PASS trong workflow [41193683584](https://github.com/blamag999/read-along-android/actions/runs/41193683584). Signed APK build và R2 publication đang chạy tại thời điểm cập nhật; R2 marker smoke test và nghiệm thu thiết bị chưa xác nhận. Không promote main.


## Incident fix — sách không tải sau batch tinh gọn menu (2026-10-31)

- Nguyên nhân gốc: khi gỡ UI cloud sync/analytics/diagnostics, phần cuối HTML của `syncModal` bị cắt thiếu `importSyncInput`, `btnClearSync` và `syncTableBody`. `initEvents()` có listener registration không null-guard nên throw trước khi `DOMContentLoaded` tiếp tục gọi `loadR2Catalog()`; vì vậy danh sách sách R2 không được tải.
- Khắc phục ở commit `c8dd29208097064c79e36ba97ac2434fbf55f882`: khôi phục local-only marker modal với export/import/clear/table. Cloud sync buttons và token controls không được khôi phục.
- Khắc phục ở commit `ace4aa65d6a8ad3cb2c776437c713c2bd5a0a43f`: xóa các lời gọi `scheduleGitHubSync()` còn sót; local export tự tạo filename, không phụ thuộc remote-sync module.
- Regression guard tại `0e16c8b21533f997a8bc5e3dd8368a3a6e500c69` kiểm tra DOM IDs thiết yếu và không có cloud sync invocation.
- Full regression, Pages syntax/isolation, channel validation và chuẩn bị assets đều pass trong workflow [41202909931](https://github.com/blamag999/read-along-android/actions/runs/41202909931); signed APK build/verification/R2 publish đang chạy tại thời điểm ghi nhận.
- Trạng thái: code fix implemented + regression pass; device acceptance pending. Không promote main.


## Header hai action và kế hoạch kho offline — 2026-10-31

- Đã sửa beta: header chỉ còn Thư viện sách và Menu. Điều khiển vừa trang/hai trang/zoom, ẩn-hiện vùng chọn file và quản lý mốc thời gian đều nằm trong Menu. Nút Đóng sách riêng bị loại bỏ; Android Back vẫn đi qua luồng đóng sách hiện hữu và lưu phiên đọc.
- Các thao tác ẩn/hiện vùng chọn tệp và quản lý mốc thời gian được chuyển vào Menu; chức năng quản lý marker local vẫn được giữ.
- Đã bổ sung regression assertions cho cấu trúc header và menu. Chưa có CI sau batch này và chưa nghiệm thu trên thiết bị.
- **Đã bị quyết định ngày 2026-10-31 thay thế:** không có kho offline 1 GiB/LRU. Ứng dụng đọc PDF/audio trực tiếp từ R2, không lưu media offline, không tự xóa sách và không có Download Manager. Đoạn kế hoạch cũ chỉ còn giá trị lịch sử.


### 2026-10-31 — Portrait library button visual correction (implementation; validation pending)

- Cập nhật header trên beta: nút Thư viện có icon sách riêng, nhãn ngắn “Thư viện” và badge số lượng luôn hiển thị, kể cả giá trị 0; accessible label cũng phản ánh số lượng.
- Điều chỉnh CSS cuối file để ghi đè các media rule cũ đang xung đột: giữ header một hàng, giữ nhãn thư viện ở màn hình dọc, co giãn tiêu đề app thay vì làm nút thư viện co còn icon đơn lẻ; nút Thư viện có độ tương phản, kích thước chạm và badge nổi bật hơn.
- Số đếm hiện lấy từ state.playlist.length (danh sách sách đã được nạp vào thư viện/catalog trong phiên), không phải tổng bản ghi PDF/audio blob riêng trong IndexedDB. Không thay đổi schema hoặc dữ liệu IndexedDB.
- Commit code: HTML 2c9e181255ba94dfff3e865e1f218875d981d205; CSS 6b24d50fe6e3dc110fe74a8185bf41ed50002523; app.js 87b81e5e3b8b4686e2022f5b94efb964174936f9; regression assertion 23cc765849189a1357b89ee73fe47783e59f6aa4.
- Chưa có CI trên commit chốt, chưa build APK và chưa kiểm tra thiết bị thật. Không promote main.


### 2026-10-31 — Portrait library header: CI, signed APK and OTA release verified

- Commit chốt code: `61b383329ac4a6d5fcc1b3e54f3e5249390e50c2` (`[build-apk] Finalize responsive library header and verify beta APK`). Bao gồm HTML nút Thư viện, CSS responsive/focus-visible, badge số lượng trong app và regression assertions ở các commit trước đó.
- GitHub Actions [run 41205868772](https://github.com/blamag999/read-along-android/actions/runs/41205868772), run attempt 1, trên branch `beta` và đúng commit chốt: **completed / success**.
- Full regression suite, Pages Functions syntax, isolation constraints và release channel validation đều success trước khi build.
- Build signed release APK và bước rename/verify APK success; publish OTA objects lên Cloudflare R2 success; upload workflow artifacts và tạo GitHub Release/đính kèm files đều success.
- Phạm vi runtime chỉ là giao diện header Thư viện. Badge biểu thị `state.playlist.length` (số sách trong playlist/catalog đã nạp), không phải tổng số file lưu offline IndexedDB.
- Device acceptance vẫn pending: cần kiểm tra portrait 320–600 px, nút Thư viện/badge, Menu và thao tác mở sách trên thiết bị thật. Không promote `main`/stable.


## 2026-10-31 — Rút gọn 4 hộp thoại Confirm (beta)

- Người dùng duyệt chính xác 4 nội dung: đóng sách `Đóng sách “[Tên sách]”?`; thoát ứng dụng `Bạn muốn thoát Read Along?`; khôi phục vị trí `Tiếp tục xem: [Thông tin vị trí]?`; xóa marker `Xóa tất cả mốc thời gian của sách?`.
- Runtime chỉ thay 4 chuỗi trong `app.js`; giữ nguyên điều kiện confirm, nhánh Có/Không, `closeCurrentBook()`, luồng thoát Capacitor, xử lý từ chối khôi phục vị trí và thao tác xóa/lưu marker. Các toast/alert/confirm khác không được chọn không thay đổi.
- Regression assertions mới trong `tests/contracts.test.js` xác nhận 4 chuỗi đã duyệt, nhánh từ chối khôi phục, guard trước khi xóa marker và xác nhận OTA vẫn nguyên văn.
- Test commit: `d219ce0a109a7202c3a10a51b68ceada5b4dd792`; runtime commit chốt: `4949bae9693d6bf17ccb57af81c80680d74772cf` (`[build-apk]`).
- GitHub Actions [run 41211507635](https://github.com/blamag999/read-along-android/actions/runs/41211507635): full regression suite, Pages syntax, isolation và release-channel validation đã PASS; signed APK build/verify, R2 OTA publication, artifact upload và GitHub Release còn đang chạy tại thời điểm ghi nhật ký.
- Không thay đổi nội dung hộp thoại OTA `Tải và cài đặt bản cập nhật? Android có thể yêu cầu xác nhận.`; không chỉnh các toast/alert khác. Chưa promote main. Device acceptance chờ APK và kiểm tra thực tế.


## 2026-10-31 — Chuẩn hóa thông báo cập nhật OTA (beta)

- Chuẩn hóa các trạng thái OTA trong `app.js`: có phiên bản mới (hiển thị versionName + release notes + câu hỏi cài đặt và giải thích Android xác nhận); phiên bản hiện tại đã mới nhất; chưa có manifest phát hành trên kênh đang chọn; lỗi kiểm tra/cài đặt; đang tải APK (có hướng dẫn không đóng app).
- Loại bỏ alert kỹ thuật ở nhánh đã mới nhất (versionCode, so sánh versionName và thông tin khóa ký). Các kiểm tra versionName/versionCode, xác thực manifest, fixed download URL, cleanup cache, native download/install, expected size và SHA-256 vẫn giữ nguyên.
- Release notes vẫn lấy từ `manifest.notes`, giới hạn 400 ký tự. Không thay đổi cách backend tạo manifest hoặc cách workflow publish OTA.
- Regression assertions cập nhật trong `tests/contracts.test.js` và `tests/ota-update.test.js` cho từng trạng thái thông báo và xác nhận không lộ chi tiết version/signing ở nhánh không có bản mới.
- Test commits: `b8841b9fdd3568ea8fc7e3021fffcec03ee91700`, `a36f69ecc67e16a0e8ffb9aa6c513e21f5d2446a`, `ed13753de05d7f28b797c3164f96e6c1be3dfd83`. Runtime commits: `68054fd8a7f60df8c39729ed7cc7296d063fb30a`, `2e5725c4ebaf1948d7a0698d9cd838369375d057`.
- GitHub Actions build [run 41211770726](https://github.com/blamag999/read-along-android/actions/runs/41211770726) đã được kích hoạt trên commit runtime cuối; trạng thái lúc ghi nhận: QUEUED. Không tuyên bố APK mới sẵn sàng cho tới khi workflow build/signature/OTA hoàn tất.
- Không promote `main`. Cần kiểm tra APK beta sau khi workflow thành công; Android device acceptance vẫn riêng biệt.

## 2026-10-31 — Lập kế hoạch Release Notes và rà soát thông báo nội bộ

- Đã ghi vào PLANNING hai hạng mục chưa triển khai: chuẩn hóa Release Notes cho mọi bản build và rà soát/rút gọn thông báo nội bộ trong app.
- Release Notes đề xuất dùng bốn nhóm `[feature]`, `[improve]`, `[fix]`, `[security]`; workflow phải lấy commit từ Release gần nhất cùng kênh, dùng một changelog chung cho GitHub Release/OTA, rút gọn tối đa khoảng 400 ký tự khi hiển thị trong app.
- Đã rà soát chỉ đọc các thông báo trong `app.js`; ghi bảng nội dung đề xuất vào PLANNING. Các thông báo close/exit/resume/clear markers và OTA đã chuẩn hóa ở batch trước được giữ nguyên.
- Phát hiện cần xử lý ở batch sau: một số alert/toast đang đưa `error.message` trực tiếp ra người dùng; một thao tác nạp audio có thể tạo nhiều toast nối tiếp; một số thông báo dài hoặc trộn hướng dẫn và trạng thái.
- Chưa sửa runtime, chưa chạy test/CI, chưa build APK, chưa thay đổi OTA, không cập nhật main. Commit kế hoạch: `3644258c70ea0bbe6e052d030f546a0c356fe08c`; commit ghi kết quả audit: `3acea281aa64040e4e74b1c25557007dbd56a203`.

## 2026-10-31 — Thống nhất thuật ngữ thông báo

- Đã thống nhất cách gọi hướng tới người dùng: “PDF” được gọi là “sách” khi nói về tài liệu/hoạt động đọc; “audio” được gọi là “âm thanh” trong thông báo giao diện.
- Tên định dạng cụ thể như PDF, MP3, M4A vẫn được giữ khi cần hướng dẫn chọn đúng loại tệp. Không đổi tên kỹ thuật trong code/API/log.
- Quy ước đã ghi vào PLANNING và sẽ áp dụng cho batch chuẩn hóa thông báo tiếp theo. Chưa sửa runtime trong lượt này.


## 2026-10-31 — Triển khai Release Notes và thông báo trong app (beta, đang kiểm chứng)

- Đã cập nhật `app.js` trên beta để rút gọn một nhóm thông báo lỗi/tác vụ: catalog, mở sách, tải/chọn âm thanh, tệp không hỗ trợ, marker và đọc lại trang. Lỗi kỹ thuật được ghi console ở các nhánh đã chỉnh; OTA/confirm đã chuẩn hóa trước đó được giữ nguyên.
- Đã thêm `scripts/generate-release-notes.py`: chọn release baseline theo đúng channel (beta chỉ prerelease, stable chỉ non-prerelease); phân loại bốn nhóm tiếng Việt; lọc commit nội bộ; bỏ mục trùng; không tự thêm câu hiệu năng chung; xử lý first release; hỗ trợ `[perf]` cũ như alias của `[improve]`.
- Workflow build gọi script này để tạo output changelog dùng chung cho GitHub Release và OTA manifest. Version/prerelease output cũng được giữ trong script, cần CI xác nhận.
- Thêm `tests/release-notes.test.py`, nối vào `npm test`, và thêm assertion thông báo vào `tests/contracts.test.js`.
- Các commit code/test/workflow hiện tại nằm trên beta; chưa chạy regression/CI và chưa xác minh nội dung release notes trên Release thực tế. Chưa build APK/OTA và chưa nghiệm thu thiết bị. Batch thông báo trong app vẫn còn phần cần rà soát tiếp.
- Không thay đổi main, endpoint OTA, bucket, manifest contract, signing key hoặc native installer.


### CI kiểm tra đầu tiên cho Release Notes — 2026-10-31

- Run [41212943321](https://github.com/blamag999/read-along-android/actions/runs/41212943321) trên commit `e679600bd3e7d36e9b98443991eeedf128f137bc`: full `npm test` PASS, Pages Functions syntax PASS, isolation PASS, deployed analytics smoke PASS. Deployed OTA smoke đang chạy khi cập nhật nhật ký.
- Run trước đó fail vì test import module tên file script có dấu gạch nối; lỗi đã được sửa bằng importlib và commit test mới.
- Release Notes workflow mới chưa được thực thi qua APK build. Không khẳng định release notes/OTA output thực tế đã được xác minh.
- Notification batch còn một số thông báo cũ chưa xử lý; APK build và nghiệm thu thiết bị chưa thực hiện.


## 2026-10-31 — Hoàn tất batch Release Notes và chuẩn hóa thông báo/thuật ngữ UI (beta)

- Tiếp tục audit các thông báo còn lại trong `app.js`: khôi phục phiên đọc, catalog, page-turn mode, lỗi phát âm thanh, nạp nhiều tệp, marker và thao tác đọc lại. Đã rút gọn câu, bỏ emoji trang trí và không hiển thị lỗi kỹ thuật trực tiếp cho người dùng.
- Gộp thông báo nạp nhiều âm thanh thành một toast kết quả; bỏ toast trung gian và toast tự mở sách gây nhiễu. Lỗi chi tiết vẫn được ghi trong console/diagnostics.
- Chuẩn hóa nhãn trong `index.html` và dynamic UI trong `app.js`: “sách” / “âm thanh”; giữ PDF/MP3/M4A ở vị trí nêu tên định dạng tệp.
- Bổ sung regression assertions cho thông báo và nhãn tĩnh/động.
- Sửa OTA smoke test: endpoint đã có manifest beta hợp lệ, nên test giờ xác nhận schemaVersion/channel/version/versionCode/size/SHA-256/filename/notes/downloadUrl thay vì kỳ vọng 404. Đã sửa escape regex để chạy đúng trong JavaScript heredoc.
- Full workflow [41213578916](https://github.com/blamag999/read-along-android/actions/runs/41213578916) trên code/test HEAD `b1d3ac247e8e6fd463be813cc7169a6ce26407f4`: completed/success; npm test, Pages syntax, isolation, analytics smoke và OTA manifest smoke đều PASS.
- Chưa build APK từ batch này. Bước kế tiếp: tạo một commit chốt `[build-apk]` có thay đổi runtime path, để workflow chạy regression lần cuối, build/sign APK, verify SHA-256 và publish beta Release/OTA. Không promote main.


### Final beta build — in progress (2026-10-31)

- Finalization commit: `5839851550c29a1fcb17d8815426db1783b0936d` (`[build-apk]`).
- Workflow [41213680238](https://github.com/blamag999/read-along-android/actions/runs/41213680238): completed successfully through full regression, Pages Functions syntax, isolation, release channel validation, release version/changelog generation, web asset preparation, version embedding, Web Local ZIP, native updater integration, Android version, launcher icons and signing configuration.
- APK Gradle build is still in progress. Signature/SHA-256 verification, OTA R2 publication, artifact upload and GitHub Release creation remain pending. Do not report APK available until all steps and assets are verified.


## 2026-10-31 — Beta v1.3.21 đã build, ký và phát hành

- Finalization commit: `5839851550c29a1fcb17d8815426db1783b0936d`; version `1.3.21`, versionCode `199`, channel beta, GitHub Release prerelease.
- GitHub Actions [41213680238](https://github.com/blamag999/read-along-android/actions/runs/41213680238): completed/success. Full regression, Pages syntax, isolation, channel validation, release version/changelog generation, Web Local packaging, native updater integration, Android version, launcher icons, signing setup, signed APK build, rename/signature verification, OTA R2 publication, artifact upload and GitHub Release creation all passed.
- APK: `read-along-v1.3.21-android.apk`, 3,436,157 bytes. Signature verification: v1/JAR and v2 true. OTA manifest SHA-256: `fbe5f4650d1b54c5e29ac4a81a0e895b59321287ef0e923bbd23ba143e667723`.
- Release assets: APK, SHA-256 file, Web Local ZIP. Workflow artifact `read-along-v1.3.21-build` ID `13047033500` (expires 2026-11-30).
- Release Notes generator correctly used previous beta tag `v1.3.20` and generated `1.3.21`; however, actual notes include English/technical commit subjects for workflow/test fixes. This is a content-quality defect; generator is implemented but Release Notes quality remains pending correction before stable promotion.
- Runtime notification/UI terminology batch is complete. Device acceptance remains pending; do not promote main.


## 2026-10-31 — Quyết định bỏ mở sách cục bộ và tinh gọn Menu (beta)

- Người dùng xác nhận bỏ hoàn toàn khả năng mở PDF/audio/thư mục tùy ý từ thiết bị; nội dung mở qua thư viện R2.
- **Ghi chú lịch sử đã bị thay thế:** đề xuất giữ kho offline/cache 1 GiB cho nội dung R2 đã bị người dùng hủy ngày 2026-10-31. Chính sách hiện hành: không lưu PDF/audio offline; chỉ giữ cache shell/app assets kỹ thuật và dữ liệu session/checkpoint.
- Header chỉ có hai action **Thư viện sách** và **Menu**; không có nút Đóng sách riêng vì Android Back đảm nhiệm thao tác này.
- Kế hoạch Menu: gỡ UI chọn file và vùng điều khiển cũ không còn cần; giữ điều khiển reader, checkpoint “Vị trí đọc gần đây” / “Xem tiếp” và OTA. Rà soát UI quản lý marker thủ công riêng; không xóa marker runtime, marker JSON R2, schema hoặc dữ liệu.
- Kế hoạch chi tiết và kiểm thử được ghi trong PLANNING.md. Đây là phạm vi đã duyệt, chưa phải code đã triển khai.
- Chưa sửa HTML/CSS/JavaScript/native, chưa chạy test/CI, chưa build APK, chưa thay đổi R2/Cloudflare/OTA hoặc main.


## 2026-10-31 — Bàn giao kế hoạch tinh gọn Reader/Menu và ranh giới APK Core

- Đối chiếu Git từ mốc handover trước `50b7c4961520a54e84c8400687e00bd7edad1076` đến beta HEAD đã xác nhận `d6faeb3b1667bebf5130a63851c6090785a4945e`: 6 commit mới, chỉ thay đổi `PLANNING.md`, `ROADMAP.md`, `RECOVERY.md`; không có file runtime trong delta.
- Kế hoạch P1 đã được cập nhật tại commit `580fc9314baf36d0ecd6f91a0d7553f4df6d56ce`; bổ sung ranh giới APK Core và chính sách giảm số lần build tại `d6faeb3b1667bebf5130a63851c6090785a4945e`.
- Phạm vi đã thống nhất: bỏ mở file tùy ý từ thiết bị; mở sách từ catalog/R2; header chỉ còn Thư viện sách và Menu; Android Back đóng sách; Menu gọn còn Tự lật trang, Vị trí đọc gần đây (tối đa 3 checkpoint, restore không autoplay), OTA và Phiên bản.
- Reader tiếp tục đọc PDF/audio trực tiếp từ R2; giữ marker JSON R2 ở chế độ read-only để đồng bộ trang/audio. Auto-seek khi lật trang thủ công luôn bật; logic hiển thị một/hai trang tự động theo marker. Không triển khai cache media offline trong batch này.
- Ranh giới APK Core: giữ runtime tối thiểu và contract catalog additive/fallback; không remote executable code/config, không thêm API/Worker/database/service; không refactor rộng nếu không có lợi ích test/bảo trì. Online Reading Progress được tách thành hạng mục riêng.
- Kiểm thử/build theo batch: kiểm tra nhỏ trong quá trình làm; full regression tại commit `[test]`; chỉ một APK beta ở commit `[build-apk]` sau khi runtime batch hoàn tất.
- Trạng thái: **PLANNED / APPROVED SCOPE, NOT IMPLEMENTED**. Chưa sửa runtime, chưa chạy test/CI cho kế hoạch này, chưa build APK, chưa deploy hoặc kiểm tra thiết bị. Không thay đổi `main`.
- Việc tiếp theo: trước khi triển khai, đọc lại các tài liệu theo README, kiểm tra HEAD/diff mới nhất, audit đầy đủ caller của local-file opening và marker write/sync; sau đó triển khai theo checklist P1 trên beta.


## 2026-10-31 — Quyết định cuối cùng: không lưu trữ PDF/audio offline

- Người dùng xác nhận **không triển khai kho lưu trữ sách/âm thanh 1 GB**. Ứng dụng tiếp tục stream/đọc PDF và audio trực tiếp từ R2.
- Không tải trước hoặc lưu bản media bền vững trên thiết bị; không hỗ trợ đọc/nghe offline; không LRU/FIFO, quota, Download Manager, tự xóa sách cũ hay media cache layer.
- Chỉ giữ cache shell/app assets và cache tạm kỹ thuật cần cho WebView/Service Worker; không dùng các cache này làm kho PDF/audio.
- Bảo toàn session/checkpoint và trạng thái đọc qua OTA; OTA không được xóa dữ liệu trạng thái đọc.
- Marker JSON companion từ R2 vẫn được đọc read-only để đồng bộ trang/audio. Nếu có đồng bộ tiến trình đọc/nghe online, đó là dữ liệu trạng thái riêng, không phải media offline.
- Đây là quyết định hiện hành và thay thế mọi đề xuất kho offline 1 GiB/LRU ghi trước đó trong ROADMAP/PLANNING/RECOVERY. Các đoạn cũ được giữ như lịch sử, không phải công việc cần thực hiện.
- Phạm vi cập nhật lần này chỉ là tài liệu; không sửa runtime, workflow, API, R2/Cloudflare, không chạy CI, không build APK và không thay đổi `main`.


## Hotfix source audit — 2026-10-31

- Starting beta HEAD: `350be680119c4b300d565d98e7ed8064254f3fe8`.
- Source audit found a JavaScript syntax error in `onAudioTimeUpdate()`: `let alignedPage` and a second `const alignedPage` were declared in the same scope. This would fail the repository's `node --check app.js` validation and block the beta build.
- Removed the unused `let alignedPage` declaration. Runtime logic is otherwise unchanged. Code commit: `d2a7733fb864fb26786cdc2aab057463ebcbdc5b`.
- This is a source hotfix only; regression CI, APK build, OTA publication and device acceptance have not yet run. The broader Reader/Menu and R2-only cleanup remain in progress; do not mark Phase 1 accepted.


## 2026-10-31 — Đợt triển khai tiếp theo: Library catalog retry (beta)

- Starting point: beta HEAD `e9d85e2b6e19e6583864c7f0e4447b673e7298f4`.
- `app.js`: nút Thư viện sách luôn khả dụng; khi danh sách chưa có, thao tác gọi lại `loadR2Catalog()` thay vì return và để nút disabled. `loadR2Catalog()` có cờ `state.catalogLoading` để ngăn request tải catalog trùng nhau; trạng thái loading của nút phụ trong modal vẫn được hoàn tất ở finally.
- `tests/modules.test.js`: bổ sung assertion cho retry từ action Thư viện, không disable nút và deduplicate request.
- Code commit: `4539b6f79ac8635b0a8133955cb78febf752ebcd`; test assertion commit: `cbf7515e6f3de252dbc4ff474608c023f75806b6`.
- Chưa chạy test/CI; assertion mới chưa được xác nhận bằng `npm test`. Đây là thay đổi source, không phải nghiệm thu.
- Audit tiếp tục xác nhận UI marker cũ còn menu/modal, ghim/xóa/sửa marker, import/export và ghi marker local; các phần này phụ thuộc vào cùng state `pageTimestamps` được dùng cho read-only R2 sync. Phải tách rõ read path khỏi write path trước khi xóa. Không xóa marker JSON R2, parser, IndexedDB/localStorage legacy hoặc session/checkpoint.
- Phạm vi file picker/local media vẫn chưa được gỡ. Không có thay đổi API, R2, Cloudflare, OTA, signing key hoặc `main`.


## 2026-10-31 — Gỡ marker manager, giữ marker R2 read-only (beta)

- `index.html`: đã bỏ menu quản lý mốc, modal marker, bảng mốc, nút ghim/lưu mốc, import/export/clear và các nhãn trạng thái chỉ phục vụ chỉnh marker.
- `app.js`: đã bỏ handler/UI DOM và các hàm tạo/sửa/xóa/nhập/xuất marker cùng ghi marker vào thư mục cục bộ. Giữ `state.pageTimestamps`, `normalizeMarker`/lookup/resolve spread và luồng đồng bộ PDF/audio.
- `resetAndLoadSyncForBook()` hiện chỉ nạp marker companion qua URL R2; nếu tải thất bại/không có URL thì dùng localStorage marker cũ như fallback read-only. Không xóa key localStorage/IndexedDB cũ. Việc lưu snapshot R2 vào localStorage là cache trạng thái đọc cũ, không phải chức năng chỉnh sửa marker.
- Sửa caller playlist để truyền URL companion R2 đúng tham số sau khi loại bỏ nhánh JSON Blob local.
- Test contract cập nhật để cấm marker manager/import/export UI. Các commit: `c6b8e2b` (app), `a2d4e4f` (HTML), `df032da` (test), cùng caller correction ở commit sau đó.
- Source audit hiện còn `state.pageTimestamps` chỉ được gán khi reset, nạp R2 hoặc fallback localStorage; `saveSyncToStorage()` chỉ được gọi sau khi nạp marker companion R2. Chưa chạy npm test/CI, chưa build APK và chưa kiểm thử thiết bị; không đánh dấu nghiệm thu.
- Chưa gỡ local PDF/audio/folder picker, Blob loading, drag/drop hoặc các hàm IndexedDB legacy. Không thay đổi API/Admin/R2 objects/Cloudflare/OTA/signing key/main.


## 2026-10-31 — Loại bỏ local media loading, chuyển sang R2-only (beta)

- `app.js`: đã bỏ file/folder picker handlers, local playlist builder, drag-and-drop, PDF/audio Blob loader, IndexedDB media-library API và các entry point ẩn còn lại. Playlist mở nội dung bằng URL PDF/audio R2; không có fallback sang Blob hoặc tệp thiết bị.
- `index.html`: đã bỏ vùng chọn tệp, input file, modal chọn folder/PDF, drop overlay và menu ẩn/hiện cài đặt. Giữ danh sách sách R2, header 2 action, menu, reader, footer và chỉ báo tên sách/audio hiện tại.
- IndexedDB `PdfAudioSyncDB` cũ không bị xóa, clear, upgrade hay migrate; app không còn mở database này. Dữ liệu legacy hiện nằm nguyên trên thiết bị nhưng không còn được dùng làm thư viện offline.
- Giữ session/checkpoint localStorage, favorites, marker companion R2 read-only, PDF/audio R2 URL và playlist. Không thay đổi cơ chế Back/session save.
- Các commit: `9eb40d5` (app), `dbec01f` (HTML), `db86284` (tests), `ed97539` (bổ sung remote media status indicator).
- Chưa chạy `npm test`/CI, chưa build APK và chưa nghiệm thu thiết bị. Chưa xóa CSS dead styles hoặc schema dữ liệu IndexedDB cũ; cleanup CSS chỉ sau khi audit selector usage. Không thay đổi API/Worker/R2/OTA/signing key/main.

## 2026-10-31 — Reader/Menu R2-only batch: recovery review and Library retry correction

- Đối chiếu aggregate Git diff từ formal handover `d13482e6ede435125600328ce05244231af8a14e` tới beta HEAD `ca31fc283a54905831e3913e353820aecd96a9c4`: beta ahead 50 commits, behind 0. Các file thay đổi trong compare: `app.js`, `index.html`, `tests/contracts.test.js`, `tests/modules.test.js`, `README.md`, `PLANNING.md`, `ROADMAP.md`, `RECOVERY.md`; không thấy thay đổi native Android, API/backend, R2/Cloudflare hay OTA trong delta tổng hợp.
- Source hiện tại đã loại bỏ entry point mở PDF/audio/thư mục cục bộ, Blob media loaders, drag/drop và việc sử dụng IndexedDB media library; playlist mở PDF/audio bằng URL catalog R2. Marker manager/import/export đã được gỡ khỏi APK; marker companion R2 và logic page/audio sync vẫn được giữ. IndexedDB legacy và session/checkpoint localStorage không bị xóa.
- Phát hiện lỗi còn sót: nút Library trong `index.html` khởi tạo với `disabled`, trong khi JavaScript chỉ bỏ disabled sau khi catalog tải thành công. Nếu lần tải đầu lỗi, người dùng không thể bấm để retry. Đã sửa markup để nút luôn khả dụng ngay lần mở app.
- Code fix: `588b3808f3d57a36be447d92523d73d72b7d27c9`. Regression assertions: `f588259634e24d96f12f161af74da2dc4d77b4be` và commit chốt test `ca31fc283a54905831e3913e353820aecd96a9c4` (message có marker `[test]`).
- Workflow `Check Read Along Admin` có path filter `tests/**` và job push yêu cầu marker `[test]`; commit test đáp ứng điều kiện kích hoạt. Tại thời điểm ghi nhật ký, GitHub combined-status endpoint chưa trả status check cho commit này; **chưa xác nhận CI pass**.
- Chưa build APK mới và chưa kiểm thử thiết bị. CSS dead styles chưa được xóa; cần audit selector/caller trước khi cleanup.
- Trạng thái: source R2-only/marker read-only đã được triển khai; Library retry đã được sửa; regression và nghiệm thu runtime vẫn pending. Không thay đổi `main`.

### 2026-10-31 — Cập nhật regression contract theo UI Reader/Menu thực tế

- Audit `tests/modules.test.js` phát hiện hai assertion còn yêu cầu các control view/zoom phải nằm trong Menu, trong khi HTML hiện tại đã loại bỏ các control này theo phạm vi tinh gọn đã duyệt. Đây là test contract lỗi thời, không phải thiếu UI.
- Đã thay hai assertion cũ bằng contract xác nhận `view-controls-bar`, `menu-view-controls`, fit-height, two-page và zoom controls không còn trong UI tối giản.
- Test commit có marker `[test]`: `4a26e502bad452dd637dcfa6ed9f0c93706c350f`. Workflow path filter bao gồm `tests/**`; combined-status query tại thời điểm kiểm tra chưa trả status entries. CI vẫn pending/UNKNOWN, không kết luận pass hoặc fail.
- Xác minh README beta và main có cùng blob SHA `2c9e534869ee250de84c134a873879dad18f3a7f` (byte-identical). Không thay đổi main.
- CSS audit sơ bộ trên `index.html`, `app.js` và các module runtime tìm thấy 81 class selector không có tham chiếu trong source hiện tại. Đây mới là candidate list; chưa xóa CSS vì cần phân loại rule compound/media và tránh xóa nhầm selector được sinh động.

### 2026-10-31 — Sửa regex regression cho trạng thái disabled của Library

- Rà soát assertion mới phát hiện regex kiểm tra thuộc tính `disabled` bị escape thừa, có thể không phát hiện trạng thái disabled thực tế.
- Đã sửa regex thành whitespace matcher đúng trong `tests/modules.test.js`; source HTML vẫn xác nhận nút Library không có `disabled` và có `aria-disabled="false"`.
- Commit test mới nhất có marker `[test]`: `98cd19cda1c307046078f97093d7eb03f0ecd377`. Chưa có status check được trả về để xác nhận CI; chưa tuyên bố pass.

### 2026-10-31 — Remove obsolete manual auto page-turn control

- The confirmed product requirement says auto page-turn is always enabled and does not need a user-facing setting. Source audit found the old menu button and toggle listener remained in HTML/JS.
- Removed `menuAutoFlip`, its DOM refs, click handler, `updateReadMenuState()` and the menu button. Both legacy restoration paths now normalize `pageTurnMode` to `next`.
- Added regression assertions for absence of the toggle and normalization of legacy `off` sessions.
- Commits: `0f022d816ffadaab633bf086431ddfc902771e80` (HTML), `21edd11be35570fd21bdcb0e36a4b84135d1c77d` (JS), `[test]` `8dae0179bc64c98bd91ddc7e3b5635d70dc540a0`.
- CI result remains unconfirmed; no APK build has been started.


## 2026-11-01 — Dọn CSS legacy sau audit Reader/Menu (beta)

- Đối chiếu selector trong styles.css với index.html, app.js và các module runtime được tải bởi reader (page-sync, playlist-layout, catalog-playlist, remote-sync, diagnostics).
- Đã loại bỏ các rule chỉ phục vụ UI đã gỡ: file/folder picker và drag-drop cũ, nhóm nút chọn tệp, view/zoom/two-page controls, speed control, marker manager/history/table, diagnostics/checkpoint control cũ và tutorial layout cũ không còn được render.
- Giữ nguyên style của reader hiện tại, menu, checkpoint đang dùng, touch zones, playlist/audio parts, safe-area/responsive/Android TV và các selector APK/native chưa thể xác minh độc lập như .apk-mode/icon/story styles.
- CSS giảm từ 91,946 xuống 66,287 ký tự (giảm 25,659 ký tự, khoảng 27.9%). Không thay đổi HTML/JS runtime, API, R2, OTA, native lifecycle hoặc main.
- Thêm regression contract trong tests/modules.test.js để ngăn các selector/ID UI đã gỡ quay lại. Đã kiểm tra tĩnh: các selector bị loại không còn trong CSS sau khi bỏ comment; không selector đã loại nào còn được tham chiếu trong các source runtime đã rà; CSS braces cân bằng.
- Commit CSS: 03826306ddcb4c53d2f721c9363448e7832beb3c, fe22a15e917c3a5f350c7fa4b26ea899384d0dd8. Test commits: 9c20bd867a1dc5995f97dc44ea23e708fd9a2c6d, aa251299b56779bff0675099ed4e4abc0e1cee87, f50d1c766ce084cde6d2a08e19cb513ed4a85774.
- Chưa chạy được npm test trong môi trường connector; GitHub combined status hiện chưa trả status entries. CI/regression vẫn CHƯA xác nhận pass. Chưa build APK và chưa nghiệm thu thiết bị.


## 2026-11-01 — Regression pass sau CSS cleanup

- Tạo PR kiểm thử riêng #43 nhắm vào beta để kích hoạt workflow PR (không đụng main). Trong quá trình chạy, CI phát hiện nhiều assertion trong tests/contracts.test.js vẫn khớp thông báo/UI cũ; đã cập nhật assertion để phản ánh chính xác reader R2-only hiện tại, không thay đổi runtime để chiều theo test cũ.
- PR #43 đã chạy thành công workflow `Check Read Along Admin` run #543: `npm test` (toàn bộ contracts/release-notes/analytics/modules/marker/catalog/API/admin/OTA/native lifecycle và check:js), Pages Functions syntax, isolation checks đều pass. Hai smoke test phụ thuộc deployment bị skip theo điều kiện workflow.
- PR #43 được squash-merge vào beta: `d10459e9788eb1d961e3dfba08a5ab95324233c6`. Không merge vào main.
- Đã xác nhận regression pass trên merge commit. Có thể tiến hành một lần build APK beta cuối đợt; APK/OTA/device acceptance vẫn đang chờ.


## 2026-11-01 — Finalize beta build sau regression pass

- Sau khi PR #43 được merge và workflow regression pass, tạo commit `[build-apk]` trên beta: `fd0d4909994ab3d065ad4bbb3fc4221e6db8f0fc`.
- Commit chỉ thêm CSS comment đánh dấu finalization, không thay đổi giao diện hoặc logic runtime. File `styles.css` nằm trong path filter của workflow Build and Release Read Along; commit message có marker `[build-apk]`, đáp ứng hai điều kiện trigger của build workflow.
- Connector GitHub hiện chỉ truy xuất được workflow run gắn với PR; không có endpoint liệt kê push-triggered build runs, và combined status không có entries. Vì vậy chưa xác nhận được trạng thái build, APK artifact, GitHub Release hay R2 OTA. Không khẳng định build đã thành công.
- Chưa thay đổi main. Sau khi có artifact, cần kiểm tra APK ký số, SHA-256, OTA manifest và thực hiện nghiệm thu trên thiết bị.


## 2026-11-01 — Chuẩn hóa nguyên tắc branch và quy trình làm việc

- Người dùng yêu cầu hạn chế branch: từ nay chỉ duy trì `beta` làm nhánh phát triển/tích hợp và `main` làm nhánh stable/phát hành.
- Không tạo branch phụ cho từng tính năng/đợt, không tạo branch thử nghiệm CI và không mở PR giả lập chỉ để kích hoạt workflow. Thực hiện công việc thông thường trực tiếp trên `beta`.
- `main` không sửa trực tiếp; chỉ cập nhật từ `beta` sau khi APK beta được kiểm thử và người dùng xác nhận nghiệm thu. Không tự ý promote stable.
- Gom thay đổi thành các commit theo nhóm công việc; chạy regression ở các mốc quan trọng và chỉ build APK ở cuối đợt sau khi regression pass.
- Không tạo commit giả hoặc thay đổi nội dung không cần thiết chỉ để kích hoạt build. Nếu trigger workflow chưa phù hợp, điều chỉnh workflow hiện có một lần để quy trình ổn định.
- PR #43 đã được merge vào beta trước khi nguyên tắc này được chốt; giữ nguyên lịch sử, không tạo thêm branch để xử lý. Không thay đổi main trong cập nhật này.


## Reader UI cleanup — remove PDF/audio filename status row (2026-11-01)

- Removed the PDF and audio filename status row above the PDF canvas to recover reader viewport space.
- Kept filename values in application state for book identity and session behavior; only display DOM wiring was removed.
- Removed unused filename-pill CSS and added regression guards.
- Commits: HTML `b7c696a45e856e383b1c9859cae07b5a3d3d546f`; JS `86d3a95a2491fffa61a0289d79fb7513a389f696`; CSS `b527223e38ac2943cfa288af4432b47f26e80cc6`; contract tests `ced2edb14dca5b398f2dced0f899b94ade4fdbe1`; module test correction `921833ce96b1740e103f99828db55f481bdc859e`.
- Regression passed in workflow run #550. APK build and device acceptance remain pending.


## Bàn giao — Tinh gọn nhóm cập nhật OTA trong Menu (2026-11-01)

- [x] Gom **Kênh OTA**, **Phiên bản đang cài** và **Kiểm tra cập nhật** vào một nhóm “Cập nhật ứng dụng”.
- [x] Bỏ icon trang trí và dòng mô tả phụ “Đánh dấu để dùng Beta”; công tắc vẫn có nhãn trợ năng mô tả rõ Beta/Official.
- [x] Thu gọn chiều cao, padding và kiểu chữ của phiên bản; nút kiểm tra cập nhật hiển thị gọn trong cùng nhóm.
- [x] Giữ nguyên ID DOM và luồng JavaScript OTA hiện có; không thay endpoint, lưu lựa chọn kênh, installer hay cơ chế ký APK.
- [ ] Chờ CI regression, sau đó build APK beta và kiểm tra Menu trên thiết bị thật; chưa nghiệm thu runtime.

- [x] GitHub Actions regression run #554 (`0243a8177c282758369f11e0503c7a89cd467d2b`) completed successfully: npm test, JS/Pages syntax, isolation and deployment smoke tests all passed.
- [ ] Build APK beta and verify the compact Menu on a real Android device; no APK/device acceptance is claimed yet.


## Handover — R2 folder migration and folder-aware catalog (2026-11-01)

### Scope and inventory

- Bucket: `my-audio-book`.
- Inventory at survey time: 204 objects total; 180 root objects including the root `books.json`; 24 objects under `ONE STORY A DAY LEVEL 2 FULL/` (12 PDF + 12 MP3).
- Current catalog seed/live snapshot: 82 books referencing 175 media objects; all 175 references resolve to existing R2 keys.
- Four additional root objects are not in the current catalog but form two complete PDF/MP3 pairs: `Oliver_Company` and `Sleeping Beauty`.
- Root migration scope: 179 media objects, approximately 1.65 GB. Keep root `books.json` in place and leave `ONE STORY A DAY LEVEL 2 FULL/` untouched.

### Implementation

- Added optional `folder` metadata to catalog mapping, preview and publish. Legacy entries without the field infer it from their PDF/audio URL path.
- Added folder selector to the reader library; it filters the existing catalog list without changing PDF/audio loading, book IDs, reading sessions or marker resolution.
- Added an Admin bulk-migration action for root-level assets. It excludes `books.json`, limits itself to root files, checks destination collisions, reuses the existing authenticated rename operation, verifies the copied object size before deleting the source, and processes two objects concurrently.
- After a successful move, Admin generates a live R2 inventory preview and requires confirmation before publishing `books.json`. If preview excludes any groups, publication is stopped.
- Updated catalog schema and regression tests for folder mapping/filtering and the Admin migration entry point.

### Verification and remaining work

- Beta source commit: `410e292477519143176fc7b5bf45b9b8099ccc0a`.
- Regression and isolation: PASS — [GitHub Actions run 41226438099](https://github.com/blamag999/read-along-android/actions/runs/41226438099).
- Cloudflare Pages deployment: [c3dbf307](https://c3dbf307.read-along-admin.pages.dev), production deployment for beta commit `410e292...`; build and deploy stages both completed successfully.
- **R2 data migration has not yet run.** No source objects were deleted or moved during this implementation batch.
- Post-deploy read-only inventory recheck confirms no R2 mutation: still 204 objects total, 180 root objects, 24 under `ONE STORY A DAY LEVEL 2 FULL/`, 0 under `DISNEY/`; root `books.json` remains 34,440 bytes with ETag `65ea559196d5fc691ce7e366903a36a0`.
- **Live `books.json` has not yet been rebuilt/published.**
- Expected catalog after successful preview: 84 books in `DISNEY` and 12 in `ONE STORY A DAY LEVEL 2 FULL` (96 total); this is a target to verify, not a result.
- APK build and device acceptance remain pending. Do not promote to main as part of this batch.

### Next operator steps

1. Open https://read-along-admin.pages.dev and sign in.
2. At the bucket root, run **Chuyển sách ngoài thư mục vào DISNEY**. Confirm the scope and wait for the completion result; if errors are reported, keep the failed source files and resolve them before retrying.
3. Review the generated catalog preview. Require zero excluded groups and confirm the folder counts before approving publication.
4. Verify live `books.json` and all referenced PDF/audio/JSON objects; compare folder paths against the R2 inventory.
5. Run the beta app, test folder filtering and open books from both folders; verify marker JSON and audio synchronization.
6. Run the final regression, build one beta APK, complete device acceptance, then update this handover with actual R2/catalog/APK evidence.



## Admin migration destination picker (2026-11-01)

- Replaced the DISNEY-specific bulk-move button with **Chuyển tệp ngoài thư mục…**.
- Admin recursively discovers existing R2 folders and allows selecting a nested folder; it also supports creating a new top-level folder.
- Selected destination is shown in the confirmation step and progress status. Existing collision protection, root-only file scope, `books.json` exclusion, and copy → verify size → delete source behavior are retained.
- Catalog preview and explicit `books.json` publication confirmation remain unchanged.
- Source commit: `73a95d5d03d3cd61739fb703751f7079faaec396`; regression/isolation [41227211811](https://github.com/blamag999/read-along-android/actions/runs/41227211811) passed. Cloudflare Pages production deployment [daa09798](https://daa09798.read-along-admin.pages.dev) completed successfully.
- The destination-picker code change did not itself move R2 objects. A later read-only inventory recheck is recorded below; no APK build is needed for this Admin-only refinement.



## R2 data inventory recheck (2026-11-01)

- Read-only inventory now shows 204 objects: 179 in `DISNEY/`, 24 in `ONE STORY A DAY LEVEL 2 FULL/`, and one root object `books.json`. No root-level media remains.
- `DISNEY/`: 84 PDF, 87 MP3, 8 JSON; total 1,647,458,551 bytes.
- The root `books.json` metadata changed from the initial 34,440 bytes / ETag `65ea559196d5fc691ce7e366903a36a0` to 38,453 bytes / ETag `509b78ea46ee0cca7c36a5ac44cbcf73`.
- The public object body could not be retrieved through the available connector; do not claim its book count, folder fields or URL validation until Admin preview or app smoke testing confirms them.
- The R2 object inventory reflects that the media move has occurred; the exact operator/time of that action is not asserted here.

