# Read Along Android — PLANNING (công việc còn lại)


> **Quy tắc nhánh hiện hành (2026-10-31):** chỉ còn hai nhánh dài hạn `beta` (phát triển/tích hợp) và `main` (stable). Làm việc trực tiếp trên beta; chỉ promote qua PR beta → main khi người dùng xác nhận. Không dùng testing. Xem README mục 3. Việc xóa branch testing và bật branch protection cho main đang chờ thao tác quản trị GitHub ngoài khả năng connector hiện tại; không được coi là đã hoàn tất.

> **Chỉ quản lý việc chưa hoàn thành.** Quy tắc làm việc ở [README.md](./README.md); lịch sử và tiến độ đã hoàn thành ở [ROADMAP.md](./ROADMAP.md). Khi một mục hoàn tất, ghi bằng chứng vào ROADMAP trước rồi xóa mục đó khỏi file này. Không giữ checklist đã xong hoặc nhật ký công việc tại đây.

## Nguyên tắc triển khai

- Mặc định làm trực tiếp trên nhánh beta; không tạo nhánh mới, không promote main.
- Mỗi đợt nhỏ, có test và có thể xác minh độc lập. Full regression chạy tại mốc `[test]` hoặc trước `[build-apk]`, không chạy trên commit trung gian. Không build APK cho thay đổi chỉ ở Admin/backend/docs.
- Không thay đổi reader/audio/native hoặc marker runtime khi chưa có test hồi quy và kế hoạch bảo toàn dữ liệu.
- Không tạo API/Worker mới nếu hệ thống hiện có đáp ứng; không gộp endpoint khác trách nhiệm.
- Không đánh dấu hoàn thành nếu thiếu bằng chứng CI, endpoint, deploy hoặc thiết bị tương ứng.

## P0 — Hoàn tất Remote Config bootstrap và Data Client

> Người dùng đã xác nhận đã kiểm thử APK trên điện thoại; chưa cung cấp chi tiết riêng về online/offline Data Client. Kiểm thử Android TV được quản lý riêng ở P2 và hiện pending.

### P0.1 Xác minh static config đang được publish

- [x] Người dùng mở endpoint và gửi lại JSON body trùng khớp file `admin/public/remote-config.json`; ghi nhận xác nhận thủ công ngày 2026-10-31. HTTP status và Content-Type vẫn chưa được kiểm tra độc lập.
- [x] Đối chiếu Pages project/root/output/production branch và deployment commit; cấu hình Pages hiện tại được xác minh đúng repository/branch/root/output, build gate đã pass.
- [x] GitHub Actions endpoint smoke test xác minh trực tiếp HTTP 200, `Content-Type: application/json`, schemaVersion 1 và configVersion 1 trên production endpoint.
- [x] Ghi URL, thời điểm và giới hạn bằng chứng vào ROADMAP.

### P0.2 Chốt contract và kiểm tra config phía publish

- [x] Chốt contract v1 giữa `schemas/remote-config.schema.json` và `admin/public/remote-config.json`; bắt buộc schemaVersion, configVersion, issuedAt, features, readerDefaults và announcements. Chi tiết/bằng chứng ở ROADMAP.
- [x] Thêm preflight validator `admin/scripts/validate-remote-config.js` chạy trong `npm test`/CI; từ chối field lạ, kiểu dữ liệu sai, feature/default ngoài whitelist, announcement sai/trùng ID, ngày ISO không hợp lệ và config hết hạn khi được kiểm tra theo thời điểm runtime. Negative tests đã bổ sung.
- [x] Nghiệm thu deployment sau khi cấu hình build command: deployment `201aeb20` success, snapshot xác nhận `node scripts/validate-remote-config.js` đã chạy trước publish. Bằng chứng ở ROADMAP.
- [x] Cấu hình Cloudflare Pages project hiện tại để chạy validator trong build step trước khi publish; build gate đã được nghiệm thu thực tế.
- [x] Quy định xử lý schemaVersion, configVersion, issuedAt, expiresAt, field lạ, kiểu dữ liệu sai và config hết hạn trong validator. Mỗi lần sửa config đã phát hành phải tăng configVersion thủ công; validator không tự tăng.
- [x] Giữ config hiện tại rỗng/không thay đổi hành vi app cho đến khi từng key được whitelist và có consumer đã kiểm thử.

### P0.3 Thiết kế Data Client tối thiểu

- [x] Chốt boundary module độc lập `modules/remote-config.js`; chưa refactor transport API khác.
- [x] Nạp client qua `modules/remote-config-bootstrap.js` sau `app.js`; tải cấu hình bất đồng bộ, không chặn reader startup và chưa áp dụng setting/feature flag vào UI hoặc reader.
- [x] URL HTTPS và hostname cố định `read-along-admin.pages.dev`; không nhận URL/hostname từ payload.
- [x] Có timeout 4 giây, tối đa 1 retry, validate schema v1, cache bản hợp lệ gần nhất và fallback defaults; cache hết hạn/hỏng bị bỏ qua.
- [x] Không thực thi JavaScript/HTML và không có native command/permission trong contract.
- [x] Test JSON lỗi, field thiếu/thừa, schemaVersion, config hết hạn, configVersion rollback, timeout, HTTP error, sai Content-Type, cache hợp lệ/hỏng, retry giới hạn, response quá lớn và offline lần đầu. HTTP status/Content-Type của production endpoint vẫn cần xác minh độc lập.
- [x] Build beta v1.3.5 đã chạy trên HEAD `a30c6a011456befc04e5af83a51694e5e19eaa1d`; workflow run 41162360209 success, artifact đã upload, bước build signed APK và verify signature/SHA-256 đều success; GitHub Release beta đã tạo. Bằng chứng ở ROADMAP.
- [x] Người dùng xác nhận đã cài/kiểm thử APK trên điện thoại.
- [ ] Bổ sung nghiệm thu riêng Data Client: online nhận source=network, offline lần đầu fallback default, offline lần sau dùng cache; reader/audio không bị chặn startup. Chưa có log/kết quả cụ thể cho ba tình huống này.
- [x] Điều chỉnh workflow: các push beta thông thường không build APK; chỉ commit chốt có `[build-apk]` mới tự build một lần. Manual dispatch vẫn giữ cho stable/ngoại lệ.

## P1 — Chốt marker conflict policy và migration an toàn

- [x] Đọc lại modules/remote-sync.js, modules/page-sync.js, các caller trong app.js và docs/architecture/marker-and-api-review.md; ghi nhận thứ tự nguồn thực tế và điểm ghi đè không có freshness check.
- [x] Chốt policy: explicit import có chủ ý ưu tiên cao nhất; versioned candidates so sánh revision trong cùng book key; legacy fallback giữ nguyên thứ tự tương thích.
- [x] Dùng revision để so sánh các bản versioned thuộc cùng một logical book; updatedAt chỉ tie-break khi revision và marker content giống nhau.
- [x] Định nghĩa conflict cùng revision khác nội dung (không tự ghi đè, ưu tiên local recovery), revision/schema lỗi, clear-all bằng envelope rỗng và legacy data.
- [ ] Thiết kế migration tương thích ngược: không ghi đè nguồn cũ trước khi bản mới được validate và lưu thành công; không tự xóa marker hoặc file JSON.
- [x] Bổ sung pure resolver và regression tests cho revision, stale copy, conflict, import, clear-all, legacy numeric seconds, object {time,part}, marker lỗi và audio-part bounds. CI [41164224271](https://github.com/blamag999/read-along-android/actions/runs/41164224271) success sau khi sửa conflict-selection.
- [ ] Chỉ thay đổi runtime sau khi policy/test hoàn chỉnh; nếu cần APK thì gom cùng một đợt Data Client hoặc một đợt APK riêng có phạm vi rõ ràng.

## P1 — Analytics thời lượng đọc/nghe độc lập

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
- [x] AN3.7 Automated regression hoàn tất: PDF switch/close, audio play/pause/ended, foreground/background, rotation, pagehide/pageshow, opt-out, privacy, offline drop/no retry, eventId/sequence và fetch pending không block reader lifecycle. CI [41167810567](https://github.com/blamag999/read-along-android/actions/runs/41167810567) success; rotation regression [41167772447](https://github.com/blamag999/read-along-android/actions/runs/41167772447) success. Kiểm thử WebView/Android thật vẫn pending sau APK build.
- [x] AN3.8 Build beta APK hoàn tất từ commit `85475373bab4813589cf0d3c0777fe8c27df1da7`; workflow [41167887202](https://github.com/blamag999/read-along-android/actions/runs/41167887202) success, full regression pass, signed APK build/verification pass, artifact và Release `v1.3.7` đã publish. APK: https://github.com/blamag999/read-along-android/releases/download/v1.3.7/read-along-v1.3.7-android.apk. SHA-256 APK: `a4f4f5e85f04af05a53925888685ed28b82ba02867571a4ffe84769bcaf06299`. Artifact archive SHA-256: `6f70ed03519fc7b0c739908d114ef7c6153e5d5dd17947cd49141b7a47e3576c`. Chưa có xác nhận người dùng cài/kiểm thử thực tế: consent UI, opt-in/off, thời lượng đọc/nghe, offline và playback vẫn pending; Android TV pending.

### AN4 — Dashboard

- [ ] Xây dashboard Admin theo ngày/tuần/tháng/năm.
- [ ] Có tổng thời gian đọc, tổng thời gian nghe, phiên, thiết bị/nền tảng và thống kê theo sách trong phạm vi dữ liệu được phép.
- [ ] Có phân trang/lọc và phân biệt dữ liệu thiếu với giá trị 0.
- [ ] Dashboard/report thay đổi độc lập không cần build APK.

## P2 — Nội dung và cấu hình UI độc lập

- [ ] Xác định cấu trúc dữ liệu trợ giúp, thông báo và changelog dạng JSON/text có schema.
- [ ] Chỉ hiển thị nội dung đã validate; giới hạn độ dài và không cho HTML/JS tùy ý.
- [ ] Xác định các theme/reader defaults có thể whitelist và giới hạn min/max an toàn.
- [ ] Giữ offline fallback; config lỗi không làm thay đổi layout hoặc hành vi đọc.
- [ ] Chỉ thêm UI APK khi đã có contract và nội dung mẫu để kiểm thử; gom vào một lần build APK phù hợp.

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

## P3 — Đóng băng APK Core và hoàn tất chương trình

- [ ] Đánh giá regression suite đã bao phủ reader/audio/marker/rotation/native/OTA.
- [ ] Xác nhận các dịch vụ catalog, marker, Remote Config, Analytics, Diagnostics và nội dung quản trị có contract/cache/fallback phù hợp.
- [ ] Xác nhận Admin/backend có thể thay đổi độc lập mà không cần phát hành APK trong phạm vi đã thiết kế.
- [ ] Đánh giá lần cuối các ranh giới bảo mật, privacy, offline và quyền Android.
- [ ] Chỉ sau nghiệm thu mới đánh dấu APK Core frozen; lỗi bảo mật/nghiêm trọng/tương thích nền tảng vẫn được phép sửa theo quy trình README.

---

## Thứ tự thực hiện khuyến nghị

1. P0.1 xác minh Remote Config URL production.
2. P0.2 hoàn tất xác minh publish gate Cloudflare Pages và quy tắc tăng configVersion.
3. P0.3 Data Client cùng test/fallback; chưa vội tích hợp APK.
4. P1 marker conflict policy và migration an toàn.
5. P1 Analytics AN1 → AN2 → AN3 → AN4.
6. P2 nội dung/config UI.
7. P2 regression nghiệm thu và P3 freeze APK Core.

Nếu phát sinh lỗi nghiêm trọng ảnh hưởng người dùng, ưu tiên xử lý lỗi đó trước; cập nhật ROADMAP/PLANNING sau khi có bằng chứng.


> Batch marker-policy resolver: isolated pure module, tests and documentation complete; CI [41164224271](https://github.com/blamag999/read-along-android/actions/runs/41164224271) success. Not wired into reader runtime; no marker files, APK runtime, signing configuration or main branch behavior changed.


> Analytics AN1: proposed schema and privacy/event semantics documented; no client collector, API route, D1 table or dashboard deployed yet. Full regression phát hiện assertion bị cắt dòng và phần test trùng ở cuối `tests/contracts.test.js`; đã sửa cả hai và cần chạy lại.


> Analytics AN2 backend code staged: endpoint, strict validation helper, D1 migration and regression tests added. Migration is applied to the existing Read Along D1 database and verified. CI [41166166847](https://github.com/blamag999/read-along-android/actions/runs/41166166847) passed including production CORS/consent smoke test. D1 migration is applied and verified. Still pending: valid event write/dedup end-to-end test through the HTTP route, client collector/consent UI, dashboard. Pages production deployment for the backend commit succeeded; D1 trigger aggregation was verified with a temporary event and cleaned up. No client collector, dashboard or APK change.
