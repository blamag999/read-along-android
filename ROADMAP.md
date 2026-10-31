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


### 2026-10-31 — Remote Config endpoint body confirmed by user; isolated Data Client added
- Người dùng mở `https://read-along-admin.pages.dev/remote-config.json` và gửi lại JSON:
  `schemaVersion: 1`, `configVersion: 1`, `issuedAt: 2026-10-31T00:00:00Z`, `features: {}`, `readerDefaults: {}`, `announcements: []`. Body khớp chính xác file `admin/public/remote-config.json` trên beta. Đây là xác nhận thủ công về body; không phải bằng chứng độc lập cho HTTP status hoặc Content-Type.
- Thêm `modules/remote-config.js`: endpoint HTTPS/hostname cố định, GET JSON, giới hạn body 32 KiB, timeout 4 giây, tối đa 1 retry, schema/allowlist validation, expiresAt enforcement, từ chối configVersion thấp hơn cache, cache last-known-valid và offline defaults. Không thực thi nội dung server và không áp dụng reader settings.
- Thêm `tests/remote-config.test.js`: network success/cache, offline cache, offline first-run defaults, malformed JSON, HTTP error, wrong content-type, missing/unknown fields, invalid schema/version/types/expiry, duplicate announcement IDs, response quá lớn, version rollback, corrupt/expired cache, timeout và retry giới hạn.
- Bổ sung retry delay cố định 200 ms (tối đa 1 retry), timeout request 4 giây (có thể hạ trong test), không retry vô hạn.
- Tích hợp test module vào `npm test` và syntax check.
- CI [41161695921](https://github.com/blamag999/read-along-android/actions/runs/41161695921) success trên commit `dc63dd35fe51e8008b99ff97c93629f8113c1802`, chạy toàn bộ `npm test` và syntax check bao gồm Data Client; các commit hồ sơ sau đó chỉ sửa tài liệu.
- Data Client hiện được giữ độc lập, **chưa nạp trong `index.html`/APK**. Không build APK.
- P0.1 body được người dùng xác nhận; kiểm tra HTTP status/Content-Type vẫn pending. P0.3 đã hoàn tất module nền và một phần test, chưa tích hợp APK.

- Hồ sơ bàn giao cập nhật sau batch Data Client; beta HEAD tại thời điểm cập nhật: `debd81d7a69c95f2e3acbae2b772106ce5e57cb0`.


### 2026-10-31 — Production endpoint verified; Data Client bootstrapped in app shell
- Thêm workflow `.github/workflows/check-remote-config-endpoint.yml` để kiểm tra endpoint production sau thay đổi Remote Config và có thể chạy thủ công. Workflow chạy trên GitHub-hosted runner, kiểm tra status, Content-Type, kích thước response và cấu trúc v1.
- Endpoint smoke test [41161849355](https://github.com/blamag999/read-along-android/actions/runs/41161849355) success trên commit `a2f7132f45ba76a4b5b6f95ac3e7da444f0b1b52`. Log thực tế xác nhận HTTP **200**, Content-Type **application/json**, schemaVersion **1**, configVersion **1**. Đây là bằng chứng trực tiếp cho P0.1; nội dung body đã được người dùng đối chiếu ở bước trước.
- Tích hợp `modules/remote-config.js` và `modules/remote-config-bootstrap.js` vào `index.html` sau `app.js`; bootstrap tải cấu hình bất đồng bộ, không chặn khởi động reader. Kết quả được lưu tại `window.ReadAlongRemoteConfigState`; chưa consumer nào áp dụng feature/defaults, do đó config rỗng không thay đổi hành vi PDF/audio.
- Sửa timeout bao trùm cả response body parsing; cập nhật Service Worker shell cache từ v48 lên v49 và thêm hai module vào APP_SHELL. Việc dọn cache chỉ tác động shell cache có version, không xóa localStorage hoặc dữ liệu đọc.
- Bổ sung test bootstrap ordering/state; CI [41161982280](https://github.com/blamag999/read-along-android/actions/runs/41161982280) success trên commit `6b9d28d6bbdc279d8f659eda9918a252c5478d30`, gồm toàn bộ npm test và JS syntax checks.
- Đây là thay đổi runtime đóng gói APK. Chưa build/phát hành APK: workflow `build-android-apk.yml` chỉ chạy bằng workflow_dispatch, không có action dispatch khả dụng trong phiên làm việc. Cần chạy workflow thủ công chọn ref `beta`, channel `beta`; sau đó cài và kiểm tra trên thiết bị thật trước khi xem P0.3 hoàn tất.


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
- README ghi quy ước marker, yêu cầu marker nằm ở commit cuối của push, kiểm thử ngay cho thay đổi critical và giữ Remote Config endpoint smoke test riêng. PLANNING ghi nguyên tắc triển khai tương ứng.
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
- Script order hiện tại: page-sync → playlist-layout → catalog-playlist → app.js → remote-config → remote-sync → diagnostics. Có thể thêm collector độc lập sau app.js; tuy nhiên phải giữ collector tách biệt với diagnostics và không gửi bookKey/title/file name.
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

