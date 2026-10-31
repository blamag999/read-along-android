# Read Along Android — PLANNING (công việc còn lại)

> **Chỉ quản lý việc chưa hoàn thành.** Quy tắc làm việc ở [README.md](./README.md); lịch sử và tiến độ đã hoàn thành ở [ROADMAP.md](./ROADMAP.md). Khi một mục hoàn tất, ghi bằng chứng vào ROADMAP trước rồi xóa mục đó khỏi file này. Không giữ checklist đã xong hoặc nhật ký công việc tại đây.

## Nguyên tắc triển khai

- Mặc định làm trực tiếp trên nhánh beta; không tạo nhánh mới, không promote main.
- Mỗi đợt nhỏ, có test và có thể xác minh độc lập. Không build APK cho thay đổi chỉ ở Admin/backend/docs.
- Không thay đổi reader/audio/native hoặc marker runtime khi chưa có test hồi quy và kế hoạch bảo toàn dữ liệu.
- Không tạo API/Worker mới nếu hệ thống hiện có đáp ứng; không gộp endpoint khác trách nhiệm.
- Không đánh dấu hoàn thành nếu thiếu bằng chứng CI, endpoint, deploy hoặc thiết bị tương ứng.

## P0 — Hoàn tất Remote Config bootstrap và Data Client

### P0.1 Xác minh static config đang được publish

- [ ] Truy cập trực tiếp https://read-along-admin.pages.dev/remote-config.json và kiểm tra HTTP status, content-type, body JSON và nội dung schema v1.
- [ ] Nếu URL production chưa phản ánh file, kiểm tra Pages project/root/output và deployment commit; sửa đúng cấu hình hiện có, không tạo Pages project mới.
- [ ] Ghi URL, thời điểm và kết quả xác minh vào ROADMAP.

### P0.2 Chốt contract và kiểm tra config phía publish

- [x] Chốt contract v1 giữa `schemas/remote-config.schema.json` và `admin/public/remote-config.json`; bắt buộc schemaVersion, configVersion, issuedAt, features, readerDefaults và announcements. Chi tiết/bằng chứng ở ROADMAP.
- [x] Thêm preflight validator `scripts/validate-remote-config.js` chạy trong `npm test`/CI; từ chối field lạ, kiểu dữ liệu sai, feature/default ngoài whitelist, announcement sai/trùng ID, ngày ISO không hợp lệ và config hết hạn khi được kiểm tra theo thời điểm runtime. Negative tests đã bổ sung.
- [x] Nghiệm thu deployment sau khi cấu hình build command: deployment `201aeb20` success, snapshot xác nhận `node scripts/validate-remote-config.js` đã chạy trước publish. Bằng chứng ở ROADMAP.
- [x] Cấu hình Cloudflare Pages project hiện tại để chạy validator trong build step trước khi publish; build gate đã được nghiệm thu thực tế.
- [x] Quy định xử lý schemaVersion, configVersion, issuedAt, expiresAt, field lạ, kiểu dữ liệu sai và config hết hạn trong validator. Mỗi lần sửa config đã phát hành phải tăng configVersion thủ công; validator không tự tăng.
- [ ] Giữ config hiện tại rỗng/không thay đổi hành vi app cho đến khi từng key được whitelist và có consumer đã kiểm thử.

### P0.3 Thiết kế Data Client tối thiểu

- [ ] Chốt boundary và vị trí module cho một Data Client mỏng; không refactor đồng loạt mọi API trong cùng đợt.
- [ ] Chỉ cho phép HTTPS và hostname đã xác nhận của Read Along/GitHub; không nhận host tùy ý từ Remote Config.
- [ ] Có timeout hữu hạn, retry giới hạn/backoff, schema validation, cache bản hợp lệ gần nhất và offline defaults.
- [ ] Không thực thi JavaScript/HTML tùy ý, không nhận native command/permission từ server.
- [ ] Viết test cho: JSON lỗi, field thiếu/thừa, schemaVersion không hỗ trợ, config hết hạn, configVersion cũ, timeout, HTTP error, cache hợp lệ, cache hỏng và offline lần đầu.
- [ ] Chỉ tích hợp vào APK sau khi endpoint và server-side contract đã được xác minh; gom thành một thay đổi APK nhỏ.

## P1 — Chốt marker conflict policy và migration an toàn

- [ ] Đọc lại modules/remote-sync.js, modules/page-sync.js, các caller trong app.js và docs/architecture/marker-and-api-review.md trước khi sửa.
- [ ] Chốt thứ tự ưu tiên nguồn: file người dùng chủ động import, marker versioned từ cloud, local recovery/cache và legacy sources; phân biệt rõ import có chủ ý với tự động đồng bộ.
- [ ] Dùng revision để so sánh các bản versioned thuộc cùng một logical book; không dùng timestamp thiết bị làm bằng chứng freshness duy nhất.
- [ ] Định nghĩa xử lý khi hai nguồn cùng revision nhưng khác nội dung, revision thiếu, schema không hỗ trợ, marker map rỗng (clear-all) và dữ liệu legacy.
- [ ] Thiết kế migration tương thích ngược: không ghi đè nguồn cũ trước khi bản mới được validate và lưu thành công; không tự xóa marker hoặc file JSON.
- [ ] Bổ sung test cho precedence, revision, stale copy, import, clear-all, legacy numeric seconds, object {time,part}, marker hỏng và mất mạng.
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
- [ ] Regression UI: status bar/notch/camera safe area, màn hình nhỏ/lớn, touch, keyboard, remote và Android TV.
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
