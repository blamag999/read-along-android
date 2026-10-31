# Read Along Android — PLANNING (công việc còn lại)

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
- [ ] Giữ config hiện tại rỗng/không thay đổi hành vi app cho đến khi từng key được whitelist và có consumer đã kiểm thử.

### P0.3 Thiết kế Data Client tối thiểu

- [x] Chốt boundary module độc lập `modules/remote-config.js`; chưa refactor transport API khác.
- [x] Nạp client qua `modules/remote-config-bootstrap.js` sau `app.js`; tải cấu hình bất đồng bộ, không chặn reader startup và chưa áp dụng setting/feature flag vào UI hoặc reader.
- [x] URL HTTPS và hostname cố định `read-along-admin.pages.dev`; không nhận URL/hostname từ payload.
- [x] Có timeout 4 giây, tối đa 1 retry, validate schema v1, cache bản hợp lệ gần nhất và fallback defaults; cache hết hạn/hỏng bị bỏ qua.
- [x] Không thực thi JavaScript/HTML và không có native command/permission trong contract.
- [x] Test JSON lỗi, field thiếu/thừa, schemaVersion, config hết hạn, configVersion rollback, timeout, HTTP error, sai Content-Type, cache hợp lệ/hỏng, retry giới hạn, response quá lớn và offline lần đầu. HTTP status/Content-Type của production endpoint vẫn cần xác minh độc lập.
- [x] Build beta v1.3.5 đã chạy trên HEAD `a30c6a011456befc04e5af83a51694e5e19eaa1d`; workflow run 41162360209 success, artifact đã upload, bước build signed APK và verify signature/SHA-256 đều success; GitHub Release beta đã tạo. Bằng chứng ở ROADMAP.
- [ ] Cài APK beta v1.3.5 lên thiết bị thật; xác minh online nhận source=network, offline lần đầu fallback default, offline lần sau dùng cache; reader/audio vẫn hoạt động bình thường và không bị chặn startup.
- [x] Điều chỉnh workflow: các push beta thông thường không build APK; chỉ commit chốt có `[build-apk]` mới tự build một lần. Manual dispatch vẫn giữ cho stable/ngoại lệ.

## P1 — Chốt marker conflict policy và migration an toàn

- [x] Đọc lại modules/remote-sync.js, modules/page-sync.js, các caller trong app.js và docs/architecture/marker-and-api-review.md; ghi nhận thứ tự nguồn thực tế và điểm ghi đè không có freshness check.
- [x] Chốt policy: explicit import có chủ ý ưu tiên cao nhất; versioned candidates so sánh revision trong cùng book key; legacy fallback giữ nguyên thứ tự tương thích.
- [x] Dùng revision để so sánh các bản versioned thuộc cùng một logical book; updatedAt chỉ tie-break khi revision và marker content giống nhau.
- [x] Định nghĩa conflict cùng revision khác nội dung (không tự ghi đè, ưu tiên local recovery), revision/schema lỗi, clear-all bằng envelope rỗng và legacy data.
- [ ] Thiết kế migration tương thích ngược: không ghi đè nguồn cũ trước khi bản mới được validate và lưu thành công; không tự xóa marker hoặc file JSON.
- [x] Bổ sung pure resolver và regression tests cho revision, stale copy, conflict, import, clear-all, legacy numeric seconds, object {time,part}, marker lỗi và audio-part bounds; chờ CI xác nhận.
- [ ] Chỉ thay đổi runtime sau khi policy/test hoàn chỉnh; nếu cần APK thì gom cùng một đợt Data Client hoặc một đợt APK riêng có phạm vi rõ ràng.

## P1 — Analytics thời lượng đọc/nghe độc lập

### AN1 — Contract và quyền riêng tư

- [ ] Chốt schema event/session, event ID, session ID, sequence, timestamp và quy tắc deduplication.
- [ ] Chỉ ghi sự kiện khi reader thực sự active/foreground hoặc audio đang phát; heartbeat mục tiêu khoảng 60 giây.
- [ ] Xác định start, heartbeat, pause, stop, app hidden/background và audio state.
- [ ] Giới hạn elapsed time mỗi heartbeat; không cộng thời gian offline không xác minh.
- [ ] Không thu tên người dùng, nội dung sách, tên file, URL riêng tư, token, cookie hoặc dữ liệu cá nhân.
- [ ] Xác định retention, xóa dữ liệu, tổng hợp theo ngày và cách xử lý consent/telemetry opt-out.

### AN2 — Backend ingest và D1

- [ ] Ưu tiên dùng hạ tầng API/Worker hiện có của Read Along nếu đáp ứng; không tạo Analytics Worker thứ hai chỉ để tách tên.
- [ ] Triển khai ingest endpoint có validation, rate limit, batch size limit và idempotency.
- [ ] Lưu raw event/session vào D1 và tạo daily aggregates có thể tái tạo.
- [ ] Thêm test chống trùng, sequence sai, thời gian âm/quá lớn, payload lớn, schema cũ/mới và request không hợp lệ.
- [ ] Không thay đổi ý nghĩa API usage/track hiện tại: nó chỉ phản ánh visit/installation, không phải reading duration.

### AN3 — Một lần cập nhật APK cho event collector

- [ ] Chỉ sau khi AN1/AN2 ổn định mới bổ sung collector tối thiểu vào APK.
- [ ] Không làm chậm reader, playback hoặc startup khi telemetry timeout/offline.
- [ ] Queue có giới hạn, retry có giới hạn và không làm tăng dữ liệu nhạy cảm.
- [ ] Có test cho foreground/background, audio pause/resume, rotation, app kill/restart, offline/online và deduplication.
- [ ] Build APK beta một lần cho toàn bộ thay đổi collector liên quan và kiểm thử trên thiết bị thật.

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


> Batch marker-policy resolver: implemented as an isolated pure module with regression tests; not yet wired into reader runtime. No marker files, APK runtime, signing configuration, or main branch behavior changed in this batch.
