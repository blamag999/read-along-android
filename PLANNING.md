# Read Along — Master Planning

> Tài liệu kế hoạch tổng hợp và trạng thái triển khai. Cập nhật sau mỗi đợt công việc. Mọi thay đổi mặc định thực hiện trực tiếp trên `beta`; không promote `main`, không tạo nhánh mới, không build APK nếu thay đổi không yêu cầu mã APK. Không sửa signing key/secrets hoặc xóa dữ liệu người dùng.

## 0. Mục tiêu tổng thể

Xây dựng Read Along theo mô hình **APK Core ổn định + dịch vụ/dữ liệu độc lập**. APK đảm nhiệm trải nghiệm đọc PDF/audio và các tích hợp Android cần thiết. Những phần thay đổi thường xuyên như danh mục, marker, cấu hình, thống kê, nội dung trợ giúp và quản trị được cung cấp qua API hoặc dữ liệu từ xa.

Mục tiêu là giảm số lần build APK nhưng không đánh đổi bảo mật, khả năng offline, độ tin cậy hoặc khả năng kiểm thử.

## 1. Quyết định kiến trúc đã được người dùng xác nhận

Các nguyên tắc A–E được chấp thuận:

- **A — Đóng băng lõi đọc:** PDF Viewer, Audio Player, đồng bộ trang/audio, vòng đời Android/WebView, lưu/khôi phục phiên đọc và native bridge chỉ thay đổi khi có lỗi nặng, vấn đề bảo mật/tương thích nền tảng hoặc yêu cầu thiết yếu.
- **B — Tách dịch vụ quản trị:** Analytics, Diagnostics backend, Catalog Admin, metadata, nội dung trợ giúp/thông báo và báo cáo chạy ngoài APK.
- **C — Remote Config:** có schema/version, kiểm tra dữ liệu, cache, timeout, retry giới hạn và fallback offline.
- **D — Không thực thi JavaScript tùy ý từ server:** không dùng remote code tải về làm cơ chế phát hành tính năng chung.
- **E — Build APK có điều kiện:** chỉ build khi thay đổi mã thực thi đóng gói, UI tương tác mới, native plugin/permission/bridge, bảo mật, hoặc sửa lỗi lõi nghiêm trọng.

## 2. Phân ranh giới thành phần

### 2.1 APK Core — giữ ổn định

- PDF.js renderer và tải/hiển thị PDF.
- Audio playback, seek, multi-part audio và trạng thái phát.
- Đồng bộ marker trang/audio; xử lý seek, next/previous, orientation.
- Điều khiển cảm ứng, remote/keyboard/Android TV.
- Lưu trữ local (IndexedDB/localStorage), favorites và khôi phục phiên.
- Native Android bridge, lifecycle, FileProvider và OTA installer.
- Security boundary: HTTPS, host allowlist, kiểm tra release/version và native permission.

Không đưa các thành phần này ra server vì cần phản hồi tức thời, hoạt động offline và phụ thuộc Android/WebView.

### 2.2 Dịch vụ/dữ liệu độc lập

| Thành phần | Nguồn/đích | Thay đổi không cần build APK |
|---|---|---|
| Catalog sách và metadata | R2 `books.json` / Admin | Có |
| PDF/audio và tài nguyên sách | R2 | Có |
| Marker JSON | R2 hoặc cơ chế sync hiện có | Có |
| Remote Config | Endpoint JSON cùng hệ thống Read Along | Có, sau khi APK có client |
| Analytics dashboard và tổng hợp | Admin Pages + API + D1 | Có, sau khi APK gửi telemetry phù hợp |
| Diagnostics tiếp nhận/phân tích | Worker/API + Admin | Có, trừ khi cần thêm event collector phía APK |
| Nội dung trợ giúp/thông báo | JSON/text có schema | Có, sau khi APK có vùng hiển thị |
| Admin quản lý thư viện | Admin Pages + Pages Functions + R2/D1 | Có |
| OTA metadata/changelog | GitHub Releases | Có; APK installer vẫn cố định |

### 2.3 Thành phần hỗn hợp

- Playlist: danh sách và metadata ở remote; render, search và thao tác nằm trong APK.
- Giao diện: theme, thông báo, nội dung và tham số đã định nghĩa có thể cấu hình; layout tương tác mới vẫn cần APK.
- Cài đặt đọc: chỉ đồng bộ các giá trị mặc định/giới hạn an toàn; xử lý thực tế nằm trong APK.
- Analytics: dashboard/API độc lập; cần một lần cập nhật APK để ghi nhận thời lượng đọc/nghe đáng tin cậy.
- Diagnostics: backend độc lập; bổ sung loại sự kiện mới có thể cần APK nếu chưa có event tương ứng.

## 3. Thiết kế giao tiếp chung

Tạo một Data Client mỏng (tên dự kiến `ReadAlongDataClient`) làm điểm truy cập cho các dữ liệu từ xa. Không tạo nhiều proxy hoặc API trùng lặp.

Yêu cầu bắt buộc:
- Mỗi API có contract và `schemaVersion` rõ ràng.
- Chỉ dùng HTTPS và hostname allowlist của Read Along/GitHub đã được xác nhận.
- Timeout hữu hạn; retry có giới hạn và backoff; không retry vô hạn.
- Validate schema/kiểu dữ liệu trước khi áp dụng.
- Cache bản hợp lệ gần nhất; offline dùng cache hoặc default đóng gói.
- Dữ liệu lỗi/không tương thích bị bỏ qua an toàn; không làm reader crash.
- Không nhận mã thực thi, quyền Android hoặc native command từ remote config.
- Có test cho dữ liệu sai, thiếu field, version mới/cũ, timeout, HTTP error và offline.

## 4. Remote Config

### Mục tiêu
Thay đổi giá trị mặc định, bật/tắt những tính năng APK đã hỗ trợ, thông báo và endpoint được phê duyệt mà không phải phát hành APK mới.

### Schema dự kiến
- `schemaVersion`: version của cấu trúc.
- `configVersion`: số tăng đơn điệu cho từng bản cấu hình.
- `issuedAt` / `expiresAt`: thời hạn cấu hình.
- `features`: chỉ các flag đã được APK khai báo.
- `readerDefaults`: các giá trị mặc định đã whitelist.
- `announcements` / `helpContent`: nội dung thuần, giới hạn độ dài.
- Không hỗ trợ script, HTML tùy ý, URL không allowlist, quyền hoặc lệnh native.

### Fallback
- APK mới cài: dùng defaults đóng gói nếu chưa tải được config.
- APK đã chạy online: dùng bản cache hợp lệ gần nhất.
- Config sai schema/hết hạn/phiên bản không hỗ trợ: bỏ qua và giữ cấu hình trước đó.
- Remote config không được thay đổi hành vi bảo mật hoặc làm reader mất khả năng hoạt động offline.

## 5. Analytics — thống kê đọc/nghe

### Mục tiêu
Thống kê theo ngày/tuần/tháng/năm, theo sách và theo nền tảng; thay đổi dashboard/biểu đồ/chỉ số mà không build APK.

### Hiện trạng
- API `usage/track` hiện ghi nhận lượt mở/visit và installation ẩn danh.
- API `usage/stats` hiện thống kê lượt truy cập, thiết bị và inventory sách.
- Chưa có dữ liệu thời lượng đọc/nghe đủ tin cậy; không được suy ra thời lượng từ lượt mở.
- Cần phân biệt rõ thống kê lượt mở hiện có và analytics thời gian đọc/nghe sẽ bổ sung.

### Thiết kế sự kiện
- Anonymous installation ID; không thu tên người dùng, nội dung sách, tên file hoặc URL tài nguyên.
- Event/session ID và sequence để chống trùng.
- Heartbeat khoảng 60 giây khi reader thực sự foreground/active hoặc audio đang phát.
- Ghi nhận start, heartbeat, pause, stop, app hidden/background, audio state.
- Giới hạn khoảng thời gian hợp lệ mỗi heartbeat; không cộng dồn thời gian offline không xác minh.
- Dữ liệu D1 có retention và cơ chế tổng hợp ngày; dashboard hỗ trợ ngày/tuần/tháng/năm.
- Người dùng có thể tắt telemetry trong tương lai nếu chính sách sản phẩm yêu cầu.

### Giai đoạn
- AN1: thiết kế schema, event contract, retention và privacy.
- AN2: API ingest + D1 + idempotency + tests.
- AN3: một lần cập nhật APK để gửi sự kiện đọc/nghe tối thiểu.
- AN4: Admin dashboard và biểu đồ; từ đây thay đổi báo cáo không cần build APK.
- AN5: xác minh trên thiết bị, đối chiếu số liệu và tối ưu.

## 6. Diagnostics

- Tiếp tục dùng backend riêng của Read Along và quy trình tạo GitHub Issue đơn giản.
- Log không chứa nội dung sách, tên file, URL riêng tư, token, cookie hoặc dữ liệu nhạy cảm.
- Phân biệt event từ JavaScript với lifecycle native.
- Backend, giao diện báo cáo, bộ lọc và cách phân tích được thay đổi độc lập.
- Chỉ cần APK mới nếu bổ sung collector/native event mới hoặc sửa lỗi ghi log.

## 7. Catalog, Admin và dữ liệu sách

- R2 `my-audio-book` là nguồn tài nguyên sách.
- Admin scan inventory → preview → quản trị viên xác nhận → validate R2 HEAD → publish manifest.
- Không tự động xóa/đổi tên tài nguyên gốc khi scan/publish.
- Ghép theo tên chuẩn hóa và cùng thư mục; không fuzzy matching.
- Giữ thứ tự audio part; file WMA được xử lý theo quy trình chuyển đổi riêng, giữ nguyên nguồn.
- Thay đổi sách/metadata/manifest không yêu cầu build APK nếu giữ contract catalog hiện hành.

## 8. OTA và phát hành

- OTA installer/native bridge giữ trong APK.
- Release metadata, changelog và file APK lấy từ GitHub Releases.
- Giữ nguyên chữ ký/keystore; không tìm cách né Play Protect.
- Chỉ build APK khi có thay đổi mã đóng gói hoặc sửa lỗi cần thiết.
- CI/regression phải pass trước build; thiết bị thật là bước nghiệm thu bắt buộc với thay đổi reader/audio/native.
- Không tuyên bố build/device test thành công nếu chưa có bằng chứng.
- Không promote `main` nếu chưa có chỉ thị.

## 9. Kế hoạch triển khai tổng thể

### Phase 0 — Hợp nhất kế hoạch và nguyên tắc
- [x] Ghi nhận Analytics plan trước đó.
- [x] Ghi nhận quyết định A–E đã được người dùng xác nhận.
- [x] Hợp nhất thành master planning và roadmap.
- [x] Rà soát trạng thái beta, workflow và cấu trúc mã hiện tại.

### Phase 1 — Kiểm kê ranh giới và hợp đồng dữ liệu (không build APK)
- [x] Lập inventory endpoint, URL, nguồn dữ liệu và caller trong app/Admin ở `docs/architecture/data-contracts.md`.
- [x] Xác định nguồn hiện tại cho catalog, media, marker, usage, telemetry, diagnostics và OTA; phân biệt rõ phần đang chạy với phần đề xuất.
- [x] Kiểm kê precedence hiện tại và ghi nhận điểm không an toàn: GitHub luôn ghi đè R2 trong nhánh có R2; chưa có revision/timestamp để so sánh. Chi tiết tại `docs/architecture/marker-and-api-review.md`.
- [x] Draft marker envelope schema v1 (`schemaVersion`, `revision`, `updatedAt`, `sourceId`, `markers`) vẫn chấp nhận legacy map và `{}` để tương thích dữ liệu xóa sạch.
- [ ] Chốt policy revision-aware và migration runtime; không so sánh timestamp thiết bị như bằng chứng duy nhất.
- [x] Định nghĩa JSON Schema version 1 cho catalog, marker, remote config và analytics event tại `schemas/`.
- [x] Thêm `tests/contracts.test.js` vào `npm test` để khóa các ranh giới schema quan trọng và ngăn remote config/analytics nhận field không được duyệt.
- [x] CI run `41158627378` thành công trên commit `24b4058ec05abb1e27ddff65f1ec0978a7fe5558`; workflow chạy `npm test`, JS syntax, Pages Functions syntax và isolation checks.
- [x] Regression test đọc manifest seed `admin/public/books.json`, kiểm tra mọi entry hiện tại có PDF/audio và HTTPS trên đúng R2 hostname.
- [x] Rà soát usage/track, usage/stats, telemetry/events, Diagnostics Worker submit, catalog preview/publish và diagnostics scan; không tìm thấy route nào nên gộp vì khác mục đích, quyền và vòng đời dữ liệu. Chi tiết tại `docs/architecture/marker-and-api-review.md`.
- [x] Quyết định giữ endpoint tách biệt; tránh thêm Worker/API trùng lặp. Chỉ gom transport client sau khi có contract chung.
- [x] Không thay đổi thuật toán reader/audio trong đợt kiểm kê.

### Phase 2 — Nền tảng Remote Config/Data Client
- [x] Chọn static JSON trên Cloudflare Pages hiện có (`admin/public/remote-config.json`) để tránh tạo thêm Worker/API.
- [x] Tạo schema config version 1, document khởi tạo và structural regression checks.
- [x] Pages production deployment thành công: `8892563b-a22b-4ccb-a4e4-be5e2e3d7df6`, URL `https://8892563b.read-along-admin.pages.dev`, commit `ed083c0c5fe0774c1e4ff69922b5139950491ffe`.
- [ ] Xác minh trực tiếp HTTP response của URL public; công cụ truy cập trong phiên này không đọc được hostname nên chưa kết luận file trả về đúng JSON.
- [ ] Bổ sung validator runtime phía server/Admin khi có luồng chỉnh sửa; kiểm tra schema trước khi publish.
- [ ] Chuẩn bị cache/fallback/version handling trong APK.
- [ ] Tích hợp Admin chỉnh config an toàn (chỉ khi generic R2/file workflow không đáp ứng).
- [ ] Chỉ sau khi test backend/config hoàn tất mới gom một thay đổi APK tối thiểu để đọc config.

### Phase 3 — Analytics độc lập
- [ ] AN1–AN2: schema, ingest API, D1, chống trùng, retention, tests.
- [ ] AN3: một lần thay đổi APK để gửi telemetry đọc/nghe có kiểm soát.
- [ ] AN4–AN5: dashboard, biểu đồ, device validation.
- [ ] Không xây dựng số liệu thời lượng giả từ dữ liệu usage hiện có.

### Phase 4 — Tách nội dung và UI cấu hình được
- [ ] Nội dung trợ giúp/thông báo từ xa.
- [ ] Theme và tham số hiển thị trong giới hạn whitelist.
- [ ] Không tải HTML/JS tùy ý.
- [ ] Giữ tương thích offline.

### Phase 5 — Ổn định và đóng băng APK Core
- [ ] Regression test PDF/audio/marker/rotation/multi-part.
- [ ] Test OTA, dữ liệu sau cập nhật, cache và offline.
- [ ] Test Android TV/remote/keyboard và thiết bị có notch.
- [ ] Build APK beta một lần cho toàn bộ thay đổi APK đã gom nhóm.
- [ ] Kiểm thử thiết bị thực tế; ghi kết quả/giới hạn.
- [ ] Sau nghiệm thu, áp dụng quy tắc đóng băng lõi.

## 10. Quy tắc quyết định có cần build APK không

Không build APK cho:
- Thay đổi danh mục, metadata, nội dung sách, marker JSON.
- Thay đổi biểu đồ, bộ lọc, cách tổng hợp Analytics.
- Thay đổi Admin UI, công cụ quản trị hoặc báo cáo Diagnostics.
- Thay đổi Remote Config values trong schema đã hỗ trợ.
- Sửa tài liệu, hướng dẫn, thông báo và changelog.

Cần build APK cho:
- Thay đổi JavaScript/HTML/CSS được đóng gói mà không có extension point tương ứng.
- Thêm UI interaction hoặc tính năng mới.
- Thay đổi thuật toán PDF/audio/marker.
- Thay đổi native plugin, Android permission, lifecycle hoặc WebView bridge.
- Thay đổi bảo mật, OTA installer hoặc sửa lỗi nghiêm trọng.

## 11. Tiêu chí hoàn tất chương trình

- Tài liệu API/schema đủ để phát triển Admin/backend độc lập.
- Remote config có cache, fallback, validation và không thực thi code từ xa.
- Catalog/marker/metadata hoạt động không phụ thuộc bản APK mới.
- Analytics đọc/nghe được ghi nhận có kiểm soát, có kiểm thử thiết bị và dashboard độc lập.
- Diagnostics/Admin có thể thay đổi mà không build APK trừ khi cần event collector mới.
- Regression suite bao phủ reader/audio/OTA và các API mới.
- README + ROADMAP + PLANNING phản ánh đúng commit, CI, deploy, thiết bị và pending.
- Không phát hành stable nếu chưa được yêu cầu.

## 12. Nhật ký tiến độ

### 2026-10-31 — Master planning và kiểm kê API/data contract
- Người dùng xác nhận A–E.
- Gộp kế hoạch Analytics trước đó và kiến trúc APK Core + remote services.
- Đã kiểm tra mã hiện tại: `app.js` vẫn là entrypoint lớn; modules page-sync/catalog/playlist/remote-sync/diagnostics được tải từ `index.html`; Service Worker cache shell network-first.
- Đã xác nhận `usage/track` và `usage/stats` hiện chỉ ghi lượt mở/installation và số liệu inventory; chưa có analytics thời lượng đọc/nghe.
- Chưa thay đổi mã runtime hoặc build APK.
- Beta HEAD trước đợt schema: `02d90abaa4f58295e6e53ee409ee0a2cb9275317`.
- CI contract regression: [run 41158627378 — success](https://github.com/blamag999/read-along-android/actions/runs/41158627378), tested commit `24b4058ec05abb1e27ddff65f1ec0978a7fe5558`.
- CI gần nhất được kiểm tra: Admin workflow run `41157267352` success cho commit `8ae1b0df0d8646108302e3230d7c56a00bbb7ec5`; các run kế tiếp thuộc cùng đợt push có run bị cancel. Run này không kiểm thử commit planning mới nhất; cần CI chạy lại cho HEAD hiện tại sau thay đổi tiếp theo.
- Đã tạo `docs/architecture/data-contracts.md`, liệt kê endpoint/caller/trust boundary và các khoảng trống hiện tại.
- Đã tạo `docs/architecture/marker-and-api-review.md`: ghi chính xác thứ tự nạp marker, phát hiện comment 'GitHub newer' không đúng vì không có so sánh freshness; rà soát API và kết luận không gộp các endpoint khác chức năng.
- Draft schema marker envelope v1 trong `schemas/marker.schema.json`, vẫn đọc legacy map, numeric seconds, `{time, part}` và empty map; bổ sung structural assertions.
- CI [41159251879](https://github.com/blamag999/read-along-android/actions/runs/41159251879) success: `npm test`, JS syntax, Pages Functions syntax và isolation checks đều pass.
- Đã thêm JSON Schema v1 cho catalog, marker, Remote Config và Analytics event; thêm structural regression tests vào `npm test`.
- CI `41158627378` đã pass trên commit test `24b4058ec05abb1e27ddff65f1ec0978a7fe5558`; test bao gồm contract schema và manifest seed hiện tại.
- Schema mới chỉ là contract định hướng; chưa tích hợp runtime validator hoặc endpoint Analytics thời lượng.
- Phase 2 đã bắt đầu ở phần không cần APK: chọn static Pages JSON và thêm `admin/public/remote-config.json` phiên bản 1, hiện chỉ có cấu trúc rỗng nên chưa ảnh hưởng reader.
- CI [41159337454](https://github.com/blamag999/read-along-android/actions/runs/41159337454) success trên commit `f5ca28b219a1b03227faedceb1ef48ab1179277f`.
- Cloudflare Pages production deploy success: [deployment `8892563b`](https://8892563b.read-along-admin.pages.dev), commit `ed083c0c5fe0774c1e4ff69922b5139950491ffe`. Direct HTTP verification of `/remote-config.json` remains pending because the current retrieval tools could not access the hostname.
- Phase 1: inventory, JSON Schema v1, manifest compatibility regression, CI validation và API overlap review đã hoàn tất. Marker precedence hiện tại đã được ghi nhận; schema envelope v1 tương thích legacy đã được draft. Còn pending runtime conflict policy/migration.
- CI run `41159251879` pass cho commit `11bdba3ffa20801b8eebaf6728aa9c58f365712c`; run trước `41159157324` fail do lỗi chèn assertion vào giữa file test, đã sửa bằng cách viết lại test file hoàn chỉnh. Không có runtime code bị ảnh hưởng.
- Tiến độ: Phase 0 hoàn tất; Phase 1 đang thực hiện.
