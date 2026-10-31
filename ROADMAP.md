# Read Along Android — ROADMAP và lịch sử tiến độ

> File này là **hồ sơ những gì đã xây dựng và trạng thái đến hiện tại**. Không dùng làm danh sách việc cần làm. Các đầu việc chưa hoàn thành chỉ quản lý trong [PLANNING.md](./PLANNING.md); quy tắc làm việc nằm trong [README.md](./README.md).

## 1. Tầm nhìn và kiến trúc đã chốt

Mục tiêu dài hạn là **APK Core ổn định + dịch vụ/dữ liệu độc lập**: giữ trải nghiệm đọc PDF/audio và tích hợp Android trong APK; tách catalog, media, marker, cấu hình, quản trị, diagnostics, analytics và nội dung thay đổi thường xuyên sang dữ liệu/dịch vụ riêng. Mục đích là giảm số lần phát hành APK, đồng thời giữ khả năng offline, bảo mật và dễ kiểm thử.

Người dùng đã xác nhận các nguyên tắc A–E:

- **A — Freeze APK Core:** PDF Viewer, Audio Player, đồng bộ trang/audio, Android/WebView lifecycle, lưu/khôi phục phiên và native bridge chỉ thay đổi khi có lỗi nghiêm trọng, bảo mật, tương thích nền tảng hoặc yêu cầu thiết yếu.
- **B — Tách dịch vụ:** Analytics, Diagnostics backend, Catalog Admin, metadata và nội dung trợ giúp/thông báo chạy độc lập với APK.
- **C — Remote Config:** có schema/version, validation, cache và offline fallback.
- **D — Không remote code:** không tải hoặc thực thi JavaScript tùy ý từ server.
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
  - `schemas/remote-config.schema.json`
  - `schemas/analytics-event.schema.json`
- Đã thêm `tests/contracts.test.js` vào `npm test` để kiểm tra schema và các giới hạn contract.
- API overlap review kết luận không nên gộp usage, telemetry, diagnostics, catalog Admin và GitHub marker sync vì khác trách nhiệm/quyền. Không tạo Worker/API Analytics thứ hai khi chưa có nhu cầu kỹ thuật rõ ràng.

## 3. Chương trình tách dịch vụ — các mốc

| Mốc | Phạm vi | Trạng thái hiện tại |
|---|---|---|
| R0 | Hợp nhất master planning, Analytics plan và nguyên tắc APK decoupling | **Hoàn tất** |
| R1 | Inventory API/data, schema và marker/API boundary review | Đã hoàn tất phần inventory/contract; marker runtime conflict policy chưa chốt |
| R2 | Static Remote Config, Data Client, cache và fallback | Đang thực hiện |
| R3 | Analytics ingest + D1 + event thời lượng đọc/nghe | Chưa bắt đầu |
| R4 | Analytics dashboard ngày/tuần/tháng/năm | Chưa bắt đầu |
| R5 | Help/announcements/theme và config ngoài APK | Chưa bắt đầu |
| R6 | Regression tổng thể, kiểm thử thiết bị và freeze APK Core | Chưa bắt đầu |

## 4. Bằng chứng CI và triển khai đã ghi nhận

Các run dưới đây là kết quả của **commit tương ứng**, không mặc nhiên chứng minh HEAD hiện tại đã pass:

| Run / triển khai | Commit liên quan | Kết quả |
|---|---|---|
| [CI 41158627378](https://github.com/blamag999/read-along-android/actions/runs/41158627378) | `24b4058ec05abb1e27ddff65f1ec0978a7fe5558` | Success — schema/contract và manifest seed regression |
| [CI 41159251879](https://github.com/blamag999/read-along-android/actions/runs/41159251879) | `11bdba3ffa20801b8eebaf6728aa9c58f365712c` | Success — marker contract regression sau khi sửa test |
| [CI 41159337454](https://github.com/blamag999/read-along-android/actions/runs/41159337454) | `f5ca28b219a1b03227faedceb1ef48ab1179277f` | Success — remote-config static document contract |
| [Pages deployment 8892563b](https://8892563b.read-along-admin.pages.dev) | `ed083c0c5fe0774c1e4ff69922b5139950491ffe` | Production deployment success; chưa xác minh trực tiếp HTTP body của asset |

Ghi chú:
- CI run mới nhất nêu trên không chạy trên commit tài liệu mới nhất `6e8f9576479bf587220cf1d8685c7f0228f8c1be`; phải kiểm tra lại CI theo HEAD khi bắt đầu đợt mới.
- Pages deployment success xác nhận deploy, không tự chứng minh public URL trả đúng JSON.
- Không có APK build/device test nào được xác nhận trong giai đoạn master planning và schema/Remote Config bootstrap này.

## 5. Trạng thái repository tại lần chuẩn hóa hồ sơ

- Ngày ghi nhận: **2026-10-31**.
- Nhánh làm việc: `beta`.
- HEAD trước đợt chuẩn hóa tài liệu: `6e8f9576479bf587220cf1d8685c7f0228f8c1be`.
- Ba nhánh hiện có đã xác minh: `main`, `beta`, `testing`.
- `beta` là nhánh phát triển/tích hợp; `main` là stable; `testing` chỉ dùng khi cần kiểm chứng riêng.
- Không có promote stable trong đợt schema/Remote Config bootstrap gần nhất.
- Không có runtime APK change hoặc APK build trong đợt đó.
- Remote Config v1 hiện là static JSON với feature/default maps và announcements rỗng; chưa thay đổi hành vi app.

## 6. Những điều cần hiểu khi tiếp nhận dự án

1. Các tính năng reader/audio/OTA/catalog/Admin đã có nền tảng triển khai, nhưng không được mặc định mọi lỗi lịch sử đã hết; kiểm tra Issues, log và test hiện tại trước khi sửa.
2. Marker precedence hiện tại có rủi ro ghi đè nguồn; schema versioned đã có nhưng runtime migration/conflict policy chưa được thực hiện.
3. Remote Config đã có file JSON và schema, nhưng chưa có APK Data Client; endpoint public cần xác minh body trước khi tích hợp.
4. Usage tracking hiện có đo lượt mở/installation, không phải thời lượng đọc/nghe.
5. Không tạo thêm API/Worker hoặc thay đổi APK chỉ để thuận tiện nếu có thể dùng contract/service hiện tại.
6. Các công việc chưa hoàn thành được quản lý duy nhất trong [PLANNING.md](./PLANNING.md).

## 7. Cách cập nhật ROADMAP

Khi một công việc trong PLANNING hoàn tất:
- Ghi ngày, kết quả, commit SHA và bằng chứng CI/deploy/test/device ở đây.
- Cập nhật trạng thái mốc tương ứng.
- Chỉ sau đó xóa mục hoàn tất khỏi PLANNING.
- Giữ lại lịch sử có giá trị; không biến ROADMAP thành backlog mới.


### 2026-10-31 — Remote Config contract hardening and branch CI alignment
- Bổ sung runtime-style contract assertions cho static Remote Config fixture: schema version, config version, timestamp parse, feature flags/default whitelist, announcements, field lạ và expiresAt trước issuedAt.
- Negative tests xác nhận từ chối schema version không hỗ trợ, configVersion không hợp lệ, field ngoài whitelist, feature/default lạ, announcement field lạ và cấu hình hết hạn không hợp lệ.
- Điều chỉnh workflow `.github/workflows/check-readalong-admin.yml`: push validation chỉ áp dụng ba nhánh `beta`, `main`, `testing`; bỏ pattern nhánh `feature/**` và cho phép kiểm thử push trên `testing`.
- CI [41160461292](https://github.com/blamag999/read-along-android/actions/runs/41160461292) success trên commit `e3f448ad778b5db7cf1d945aef827c6b248dd26d`.
- Không thay đổi APK/runtime reader, không build APK.
- Public URL `https://read-along-admin.pages.dev/remote-config.json` chưa xác minh được HTTP response/body trong phiên này; static deployment chưa được xem là hoàn tất tích hợp.


### 2026-10-31 — Remote Config v1 contract and CI preflight validation
- Chuẩn hóa `schemas/remote-config.schema.json`: contract v1 bắt buộc `schemaVersion`, `configVersion`, `issuedAt`, `features`, `readerDefaults`, `announcements`; `expiresAt` là tùy chọn; giới hạn nội dung announcement.
- Thêm `admin/scripts/validate-remote-config.js` làm validator độc lập, có thể chạy trước khi deploy/publish. Validator kiểm tra whitelist top-level/feature/default, kiểu dữ liệu, ISO-8601 date-time có timezone và ngày lịch hợp lệ, expiry, announcement length/level/ID trùng.
- Tích hợp preflight vào `npm test`; bổ sung negative tests và cấu hình workflow để chạy CI khi `schemas/**` hoặc `scripts/**` thay đổi.
- Cấu hình mặc định được người dùng cung cấp được giữ nguyên: schemaVersion 1, configVersion 1, issuedAt 2026-10-31T00:00:00Z, feature/default rỗng, announcements rỗng. Không bật tính năng và không thay đổi hành vi APK.
- CI [41161083538](https://github.com/blamag999/read-along-android/actions/runs/41161083538) success trên commit `0f8a9bbc4645d1e708c4aff5d08d90923e1a178f`; bao gồm toàn bộ `npm test`, preflight validator và các regression suites. Các commit tài liệu theo sau không thay đổi mã chạy.
- Đây là contract + CI preflight, **chưa phải** xác minh Cloudflare Pages production endpoint hoặc bảo đảm mọi đường publish đều bị gate. Endpoint `https://read-along-admin.pages.dev/remote-config.json` chưa đọc được qua công cụ kiểm tra; cần xác minh sau deployment.
- Chưa tích hợp Data Client vào APK, không build APK, không thay đổi main.


### 2026-10-31 — Cloudflare Pages deploy-time Remote Config gate
- Xác minh Cloudflare Pages project hiện tại là `read-along-admin`, source đúng repository `blamag999/read-along-android`, production branch `beta`, root directory `admin`, output directory `public`; không tạo Pages project mới.
- Cấu hình build command của project thành `node scripts/validate-remote-config.js`. Validator được đặt trong `admin/scripts/`, cùng build root; do đó Pages build sẽ dừng nếu Remote Config JSON không đạt contract trước khi publish thư mục `public`.
- Project-level build config đã được API trả về xác nhận có build command mới. Deployment khởi chạy đồng thời với lúc cập nhật setting có snapshot build command cũ, nên cần thêm một commit sau khi setting đã lưu để nghiệm thu deployment dùng gate mới.
- Quy tắc version: mọi thay đổi nội dung Remote Config sau khi phát hành phải tăng `configVersion`; validator kiểm tra kiểu/giá trị dương nhưng không tự tăng version và không so sánh được với bản production trước đó. Người sửa config chịu trách nhiệm tăng version.


### 2026-10-31 — Pages deploy-time validator verified
- Deployment [201aeb20](https://201aeb20.read-along-admin.pages.dev) được Cloudflare xác nhận success cho commit `1d0e557444cb501bf0535fb7d719d0a22cba672c`; deployment snapshot ghi nhận build command `node scripts/validate-remote-config.js`, root `admin`, output `public`. Điều này xác nhận Pages đã chạy build command trước publish thành công.
- Project-level build config hiện giữ build command `node scripts/validate-remote-config.js`; deployment tiếp theo từ beta cũng nhận cấu hình này.
- CI [41161257650](https://github.com/blamag999/read-along-android/actions/runs/41161257650) success trên commit `59a78ea50991afc1df24d945add91892252f1046`, bao gồm validator trong `npm test`.
- Còn thiếu duy nhất bước kiểm tra trực tiếp HTTP status/content-type/body của public URL `https://read-along-admin.pages.dev/remote-config.json`. Hai công cụ truy cập ngoài gặp lỗi DNS/internal error; deployment success không thay thế xác minh response.
