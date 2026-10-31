# Read Along Android — PLANNING (công việc còn lại)

## P1 — Nghiệm thu Admin Dashboard beta

> Phần triển khai đã hoàn tất và được deploy trên Pages beta; còn chờ người dùng kiểm tra thao tác thực tế trước khi đóng hạng mục.

- [ ] Đăng nhập OTP, xác nhận mặc định mở tab Thư viện; chuyển qua lại đủ 4 tab và xác nhận không mất trạng thái tác vụ. Kiểm tra thứ tự 4 tab: Thư viện → Kiểm tra → Thống kê → Nhật ký; Dashboard công khai vẫn hiển thị KPI riêng.
- [ ] Thử upload nhiều file gồm file hợp lệ và file lỗi; xác nhận tiến trình, kết quả riêng từng file và tổng kết thành công/thất bại.
- [ ] Thử đổi tên và xóa một file thử nghiệm; xác nhận thông báo đang chạy/kết quả và hộp thoại xóa hiển thị đúng tên file.
- [ ] Chạy rà soát; xác nhận chỉ gợi ý đổi tên khi độ tương đồng tên file >=95% (ngoại lệ là quy tắc hậu tố audio-part xác định được), còn WMA/định dạng không hỗ trợ chỉ cảnh báo thay file thủ công.
- [ ] Kiểm tra Light/Dark, chế độ theo hệ thống, màn hình desktop/mobile, Tổng quan, Thống kê và Nhật ký.
- [ ] Sau khi người dùng xác nhận đạt, ghi nghiệm thu cuối vào ROADMAP và xóa mục P1 này khỏi PLANNING.

> **Quy tắc nhánh hiện hành (2026-10-31):** chỉ còn hai nhánh dài hạn `beta` (phát triển/tích hợp) và `main` (stable). Làm việc trực tiếp trên beta; chỉ promote qua PR beta → main khi người dùng xác nhận. Không dùng testing. Xem README mục 3. Việc xóa branch testing và bật branch protection cho main đang chờ thao tác quản trị GitHub ngoài khả năng connector hiện tại; không được coi là đã hoàn tất.

> **Chỉ quản lý việc chưa hoàn thành.** Quy tắc làm việc ở [README.md](./README.md); lịch sử và tiến độ đã hoàn thành ở [ROADMAP.md](./ROADMAP.md). Khi một mục hoàn tất, ghi bằng chứng vào ROADMAP trước rồi xóa mục đó khỏi file này. Không giữ checklist đã xong hoặc nhật ký công việc tại đây.

## Nguyên tắc triển khai

- Mặc định làm trực tiếp trên nhánh beta; không tạo nhánh mới, không promote main.
- Mỗi đợt nhỏ, có test và có thể xác minh độc lập. Full regression chạy tại mốc `[test]` hoặc trước `[build-apk]`, không chạy trên commit trung gian. Không build APK cho thay đổi chỉ ở Admin/backend/docs.
- Không thay đổi reader/audio/native hoặc marker runtime khi chưa có test hồi quy và kế hoạch bảo toàn dữ liệu.
- Không tạo API/Worker mới nếu hệ thống hiện có đáp ứng; không gộp endpoint khác trách nhiệm.
- Không đánh dấu hoàn thành nếu thiếu bằng chứng CI, endpoint, deploy hoặc thiết bị tương ứng.

## P2 — Tinh gọn ranh giới APK Core và backend

> Quyết định kiến trúc ngày 2026-10-31: APK chỉ tập trung vào tải nội dung từ cloud và trải nghiệm đọc/nghe. Không xây dựng offline PDF/audio. PDF/audio vẫn phải lấy từ cloud; timestamp/marker (nếu có) dùng để đồng bộ vị trí đọc theo trang. Không duy trì Remote Config vì hiện không có kế hoạch điều khiển tính năng/reader từ xa. Admin, Dashboard, Analytics backend, catalog, scan và vận hành phải phát triển độc lập, không kéo theo build APK nếu không thay đổi mã runtime APK.

### P0.1 Remote Config

- [x] Gỡ Remote Config khỏi APK shell, Service Worker, package scripts, schema, validator, test, static JSON và endpoint smoke workflow. Không còn caller trong `index.html`/`app.js`; Pages Admin build command đã đổi sang `true` và GET project xác nhận cấu hình đã lưu. Admin/catalog/D1/R2/Analytics/Diagnostics được giữ nguyên.
- [x] Đổi Service Worker cache version để thiết bị nhận shell mới, không tiếp tục giữ cache entry Remote Config cũ.

### P0.2 Chốt hợp đồng dữ liệu tối thiểu của APK Core

- [ ] Rà soát data path thực tế của PDF, audio, catalog và marker; lập danh sách endpoint/caller/contract đang được APK sử dụng.
- [ ] Giữ nguyên nguồn PDF/audio trên cloud; app chỉ tải/chạy nội dung khi có kết nối và dữ liệu hợp lệ.
- [ ] Timestamp/marker nếu có phải liên kết đúng trang và audio segment; không tự suy diễn marker khi thiếu hoặc sai dữ liệu.
- [ ] Tách lỗi tải config/phân tích/quản trị khỏi lỗi tải nội dung; backend phụ trợ lỗi không được làm hỏng reader/audio.
- [ ] Không thêm API, cache/offline content layer, Remote Config hay cơ chế điều khiển từ xa nếu chưa có nhu cầu được người dùng xác nhận.

### P0.3 Nguyên tắc phân loại thay đổi để tránh build APK không cần thiết

- [ ] Backend/Admin/Dashboard/Analytics API, D1, catalog scan/publish, báo cáo và docs: kiểm thử/deploy độc lập; không build APK nếu không đổi file runtime APK hoặc contract mà APK tiêu thụ.
- [ ] Thay đổi PDF/audio/marker contract chỉ cần build APK khi thay đổi đó yêu cầu sửa caller/runtime trong APK; nếu backend vẫn giữ tương thích ngược thì deploy backend riêng.
- [ ] Thay đổi HTML/CSS/JS trong www/, modules/ được đóng gói, Service Worker hoặc Android native: gom theo batch; full regression ở commit chốt và chỉ một APK beta build.
- [ ] Analytics collector là adapter phía APK, không phải APK Core. Giữ backend/Dashboard độc lập; chỉ sửa collector/consent UI khi có yêu cầu đo lường cụ thể và gom thành một batch APK riêng, không để công việc Dashboard/backend kéo theo build.
- [ ] Không đưa nội dung thông báo/theme/reader defaults từ server vào APK nếu chưa có use case cụ thể; không tạo hạng mục UI cấu hình từ xa mặc định.

## P2 — Chốt marker conflict policy và migration an toàn

- [x] Đọc lại modules/remote-sync.js, modules/page-sync.js, các caller trong app.js và docs/architecture/marker-and-api-review.md; ghi nhận thứ tự nguồn thực tế và điểm ghi đè không có freshness check.
- [x] Chốt policy: explicit import có chủ ý ưu tiên cao nhất; versioned candidates so sánh revision trong cùng book key; legacy fallback giữ nguyên thứ tự tương thích.
- [x] Dùng revision để so sánh các bản versioned thuộc cùng một logical book; updatedAt chỉ tie-break khi revision và marker content giống nhau.
- [x] Định nghĩa conflict cùng revision khác nội dung (không tự ghi đè, ưu tiên local recovery), revision/schema lỗi, clear-all bằng envelope rỗng và legacy data.
- [ ] Thiết kế migration tương thích ngược: không ghi đè nguồn cũ trước khi bản mới được validate và lưu thành công; không tự xóa marker hoặc file JSON.
- [x] Bổ sung pure resolver và regression tests cho revision, stale copy, conflict, import, clear-all, legacy numeric seconds, object {time,part}, marker lỗi và audio-part bounds. CI [41164224271](https://github.com/blamag999/read-along-android/actions/runs/41164224271) success sau khi sửa conflict-selection.
- [ ] Chỉ thay đổi runtime sau khi policy/test hoàn chỉnh; nếu cần APK thì gom cùng một đợt Data Client hoặc một đợt APK riêng có phạm vi rõ ràng.

## P2 — Analytics thời lượng đọc/nghe độc lập

### AN1 — Contract và quyền riêng tư

- [x] Chốt schema event/session v1: eventId, sessionId, installId, sequence, event type, occurredAt, readingSeconds/listeningSeconds và deduplication theo eventId + (sessionId, sequence).
- [x] Chốt quy tắc đếm: reading chỉ khi reader mở + foreground; listening chỉ khi audio phát + foreground; heartbeat khoảng 60 giây, duration tối đa 120 giây.
- [x] Định nghĩa reader_start, heartbeat, reader_pause/resume/stop và audio_play/pause/stop.
- [x] Giới hạn duration 0–120 giây; không queue/cộng thời gian offline; request lỗi thì drop interval.
- [x] Chỉ dùng ID ngẫu nhiên/opaque; hash installId ở server; không gửi title, filename, content, URL, token, cookie hay personal identifier.
- [x] Chốt explicit opt-in (default off), opt-out dừng event; raw event 90 ngày, daily aggregates 24 tháng; received_at phía server là nguồn ngày tổng hợp.

### AN2 — Backend ingest và D1

> AN2 production acceptance completed. Evidence: CI [41167147802](https://github.com/blamag999/read-along-android/actions/runs/41167147802); final non-mutating CI [41167200825](https://github.com/blamag999/read-along-android/actions/runs/41167200825).

- [x] Ưu tiên Pages Functions router hiện có; không tạo Analytics Worker riêng.
- [x] Ingest route có explicit consent, strict validation, 25 events/batch, 64 KiB streaming cap, rate limit theo hashed install ID và idempotency eventId + (sessionId, sequence).
- [x] D1 migration additive đã áp dụng vào đúng `read-along-admin-db`; raw events 90 ngày, daily aggregates 24 tháng.
- [x] Unit/contract/API-boundary tests, CORS/consent smoke và production HTTP write/replay/sequence-conflict acceptance.
- [x] Production HTTP: first write accepted=1; exact replay accepted=0/duplicates=1; conflicting eventId cùng sessionId+sequence accepted=0/duplicates=1.
- [x] D1 aggregate chỉ tăng 7s reading + 11s listening + 1 event + 1 session; toàn bộ smoke rows và aggregate deltas đã cleanup, final query zero.
- [x] Bỏ production mutating POST khỏi CI thường trực; chỉ giữ CORS/consent non-mutating smoke. API usage/track hiện tại không đổi ý nghĩa.

### AN3 — Một lần cập nhật APK cho event collector

- [x] AN3.1 Thêm collector độc lập `modules/analytics-collector.js`; không gộp diagnostics hoặc sửa app.js core.
- [x] AN3.2 Thêm opt-in UI riêng trong read menu/modal; default off; consent key riêng, không dùng diagnostics consent; opt-out dừng collection, xóa install/session state.
- [x] AN3.3 Install/session/event IDs random opaque; analytics install ID riêng, chỉ tạo sau opt-in; sequence tăng đơn điệu trong session.
- [x] AN3.4 Chỉ đo khi PDF mở + document visible; listening chỉ khi audio phát + visible; monotonic clock, heartbeat 60s, clamp interval tối đa 120s.
- [x] AN3.5 Gửi trực tiếp tới endpoint cố định; no offline queue/retry; lỗi request thì drop; không block startup/playback.
- [x] AN3.6 Không gửi bookId, title, filename, path, URL hoặc document/audio content.
- [x] AN3.7 Automated regression hoàn tất: PDF switch/close, audio play/pause/ended, foreground/background, rotation, pagehide/pageshow, opt-out, privacy, offline drop/no retry, eventId/sequence và fetch pending không block reader lifecycle. CI [41167810567](https://github.com/blamag999/read-along-android/actions/runs/41167810567) success; rotation regression [41167772447](https://github.com/blamag999/read-along-android/actions/runs/41167772447) success. Người dùng xác nhận đã hoàn tất kiểm tra thực tế APK v1.3.7, không phát hiện lỗi trong đợt kiểm tra. Đối chiếu số liệu đọc/nghe chờ Dashboard AN4. Android TV vẫn pending.
- [x] AN3.8 Build beta APK hoàn tất từ commit `85475373bab4813589cf0d3c0777fe8c27df1da7`; workflow [41167887202](https://github.com/blamag999/read-along-android/actions/runs/41167887202) success, full regression pass, signed APK build/verification pass, artifact và Release `v1.3.7` đã publish. APK: https://github.com/blamag999/read-along-android/releases/download/v1.3.7/read-along-v1.3.7-android.apk. SHA-256 APK: `a4f4f5e85f04af05a53925888685ed28b82ba02867571a4ffe84769bcaf06299`. Artifact archive SHA-256: `6f70ed03519fc7b0c739908d114ef7c6153e5d5dd17947cd49141b7a47e3576c`. Người dùng xác nhận hoàn tất kiểm tra APK v1.3.7, không phát hiện lỗi trong đợt kiểm tra. Kiểm tra đối chiếu số liệu đọc/nghe chuyển sang AN4 Dashboard; Android TV vẫn pending.


## P2 — Nội dung vận hành độc lập trên backend

- [ ] Chỉ phát triển trợ giúp/thông báo/changelog trong Admin/backend khi có nhu cầu vận hành thực tế; không mặc định đưa các nội dung này vào APK.
- [ ] Nếu sau này cần hiển thị nội dung từ server trong APK, phải có yêu cầu riêng, contract dữ liệu tối thiểu và đánh giá rõ tác động tới APK/build trước khi triển khai.

## P2 — Regression và nghiệm thu APK Core

- [ ] Kiểm tra lại các Issues/log hiện hành liên quan page/audio sync và rotation; xác định lỗi nào còn tái hiện trước khi kết luận.
- [ ] Regression PDF/audio: mở PDF, tải audio, seek tiến/lùi, next/previous page, marker thiếu/trùng/0 giây/ngoài thời lượng, multi-part audio và metadata load.
- [ ] Regression orientation: portrait ↔ landscape không làm audio tua về marker cũ hoặc phát lại trang; giữ currentTime, play/pause và current page.
- [ ] Regression UI điện thoại: status bar/notch/camera safe area, màn hình nhỏ/lớn, touch và keyboard.
- [ ] **PENDING — Android TV:** chưa kiểm thử trên thiết bị thật; để ngoài phạm vi batch hiện tại, không chặn các công việc độc lập khác.
- [ ] Regression OTA: có update/không update, mạng lỗi, APK lỗi, chữ ký không khớp, phiên bản cũ, quyền cài đặt, người dùng hủy và dữ liệu đọc sau update.
- [ ] Xác minh offline và cache; không xóa dữ liệu đọc khi dọn shell cache.
- [ ] Chỉ build APK beta khi tất cả thay đổi APK đã được gom nhóm và CI pass.
- [ ] Ghi model thiết bị, phiên bản Android/app, commit, APK SHA-256 và kết quả test vào ROADMAP.

## P2 — Đóng băng APK Core và hoàn tất chương trình

- [ ] Đánh giá regression suite đã bao phủ reader/audio/marker/rotation/native/OTA.
- [ ] Xác nhận các dịch vụ catalog, marker, Analytics và Diagnostics có contract phù hợp; không còn phụ thuộc Remote Config.
- [ ] Xác nhận Admin/backend có thể thay đổi độc lập mà không cần phát hành APK trong phạm vi đã thiết kế.
- [ ] Đánh giá lần cuối các ranh giới bảo mật, privacy, offline và quyền Android.
- [ ] Chỉ sau nghiệm thu mới đánh dấu APK Core frozen; lỗi bảo mật/nghiêm trọng/tương thích nền tảng vẫn được phép sửa theo quy trình README.

---

## Thứ tự thực hiện khuyến nghị

1. **P1 — DA1 đến DA6:** cải tiến Admin Dashboard theo đặc tả ở trên; đây là ưu tiên triển khai tiếp theo.
2. **P2 — Các công việc còn lại:** xử lý các mục APK Core, marker migration, backend/Admin độc lập, regression và nghiệm thu theo thứ tự phụ thuộc và mức độ rủi ro.


Nếu phát sinh lỗi nghiêm trọng ảnh hưởng người dùng, ưu tiên xử lý lỗi đó trước; cập nhật ROADMAP/PLANNING sau khi có bằng chứng.


> Batch marker-policy resolver: isolated pure module, tests and documentation complete; CI [41164224271](https://github.com/blamag999/read-along-android/actions/runs/41164224271) success. Not wired into reader runtime; no marker files, APK runtime, signing configuration or main branch behavior changed.


> Analytics AN1: proposed schema and privacy/event semantics documented; no client collector, API route, D1 table or dashboard deployed yet. Full regression phát hiện assertion bị cắt dòng và phần test trùng ở cuối `tests/contracts.test.js`; đã sửa cả hai và cần chạy lại.


> Analytics AN2 backend code staged: endpoint, strict validation helper, D1 migration and regression tests added. Migration is applied to the existing Read Along D1 database and verified. CI [41166166847](https://github.com/blamag999/read-along-android/actions/runs/41166166847) passed including production CORS/consent smoke test. D1 migration is applied and verified. Still pending: valid event write/dedup end-to-end test through the HTTP route, client collector/consent UI, dashboard. Pages production deployment for the backend commit succeeded; D1 trigger aggregation was verified with a temporary event and cleaned up. No client collector, dashboard or APK change.
