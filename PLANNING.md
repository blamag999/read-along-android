# Read Along Android — PLANNING (công việc còn lại)

> **Quy tắc nhánh hiện hành (2026-10-31):** chỉ còn hai nhánh dài hạn `beta` (phát triển/tích hợp) và `main` (stable). Làm việc trực tiếp trên beta; chỉ promote qua PR beta → main khi người dùng xác nhận. Không dùng testing. Xem README mục 3. Việc xóa branch testing và bật branch protection cho main đang chờ thao tác quản trị GitHub ngoài khả năng connector hiện tại; không được coi là đã hoàn tất.

> **Chỉ quản lý việc chưa hoàn thành.** Quy tắc làm việc ở [README.md](./README.md); lịch sử và tiến độ đã hoàn thành ở [ROADMAP.md](./ROADMAP.md). Khi một mục hoàn tất, ghi bằng chứng vào ROADMAP trước rồi xóa mục đó khỏi file này. Không giữ checklist đã xong hoặc nhật ký công việc tại đây.

## Nguyên tắc triển khai

- Mặc định làm trực tiếp trên nhánh beta; không tạo nhánh mới, không promote main.
- Mỗi đợt nhỏ, có test và có thể xác minh độc lập. Full regression chạy tại mốc `[test]` hoặc trước `[build-apk]`, không chạy trên commit trung gian. Không build APK cho thay đổi chỉ ở Admin/backend/docs.
- Không thay đổi reader/audio/native hoặc marker runtime khi chưa có test hồi quy và kế hoạch bảo toàn dữ liệu.
- Không tạo API/Worker mới nếu hệ thống hiện có đáp ứng; không gộp endpoint khác trách nhiệm.
- Không đánh dấu hoàn thành nếu thiếu bằng chứng CI, endpoint, deploy hoặc thiết bị tương ứng.

## P1 — Online Reading Progress theo ID thiết bị ổn định

> Quyết định ngày 2026-10-31: tiến trình đọc/nghe là dữ liệu cần khôi phục sau khi clear app data hoặc gỡ/cài lại APK. Server là bản lưu bền vững; local chỉ là cache và hàng đợi đồng bộ offline. Mỗi thiết bị có một device ID ổn định, mỗi sách có một progress record riêng.

### 1. Định danh thiết bị

- [ ] Audit native Android module, Capacitor bridge, minSdk/targetSdk và chữ ký APK hiện hành; xác nhận cách lấy `Settings.Secure.ANDROID_ID` trên điện thoại và Android TV.
- [ ] Xây dựng API native chỉ đọc stable device identifier; ưu tiên ANDROID_ID (Android 8+) và tạo app-scoped ID bằng SHA-256 của package namespace + ANDROID_ID, không gửi raw ANDROID_ID lên server.
- [ ] Không dùng UUID chỉ nằm trong localStorage/SharedPreferences làm identity chính vì clear data/uninstall có thể xóa.
- [ ] Xác định rõ giới hạn: ANDROID_ID ổn định qua clear data và reinstall trong điều kiện cùng Android user, cùng signing key; factory reset, đổi user/profile hoặc đổi signing key có thể làm ID thay đổi. Không quảng cáo là hardware ID bất biến tuyệt đối.
- [ ] Có fallback có kiểm soát nếu ANDROID_ID không khả dụng; không âm thầm tạo ID mới mỗi lần app khởi động. Ghi trạng thái identity degraded và không tự ghi đè progress cloud bằng identity fallback chưa xác minh.
- [ ] Kiểm tra cùng một thiết bị sau reboot, clear cache, clear app data, uninstall/reinstall, OTA update và cài APK ký cùng key; kiểm tra hai thiết bị khác nhau phải có ID khác nhau.

### 2. Backend lưu tiến trình

- [ ] Audit Pages Functions API router, D1 binding/database migration, auth/rate-limit conventions và existing analytics device/install identity; tái sử dụng hạ tầng của repository, không tạo Worker hoặc database mới nếu D1 hiện tại đáp ứng.
- [ ] Tạo bảng riêng trong D1 hiện hữu, khóa duy nhất `(device_id, book_id)`; không nhập chung analytics, marker hoặc catalog. Lưu page, audioIndex/part, audioTime, viewMode và các trường tiến trình thực sự cần thiết.
- [ ] Chỉ chấp nhận stable `book.id` từ catalog; không dùng folder/path/title làm khóa sách. Validate page/audio bounds ở mức hợp lý và giới hạn payload.
- [ ] Thêm endpoint GET danh sách/tiến trình theo device ID và PUT/UPSERT một sách; endpoint phải idempotent, giới hạn tần suất, timeout và trả revision/server timestamp. Không cho client ghi arbitrary SQL hoặc dữ liệu khác.
- [ ] Đánh giá security: device ID là định danh, không phải secret hay bằng chứng xác thực. Không đưa raw Android ID vào log. Vì progress không phải dữ liệu nhạy cảm, có thể bắt đầu với device-scoped access + validation/rate limit; nếu cần chống giả mạo mạnh hơn phải thiết kế pairing/account hoặc attestation riêng, không giả vờ rằng ID tự nó là authentication.
- [ ] Migration SQL có rollback/backup plan; không reset hoặc xóa analytics tables hiện có.

### 3. APK sync engine và local fallback

- [ ] Tạo module progress store/sync riêng, không nhồi thêm logic vào reader engine nếu không cần.
- [ ] Khi mở app: lấy device ID → tải progress cloud → đối chiếu local pending queue → chọn record hợp lệ theo revision/server timestamp → restore trang/audio nhưng tuyệt đối không tự autoplay.
- [ ] Khi thay đổi trang, audio part/time, pause, đổi sách, app background/pagehide: lưu local ngay; debounce/throttle upload để không tạo request mỗi frame hoặc mỗi giây.
- [ ] Khi offline: local cache + outbox giữ thay đổi chưa đồng bộ; retry có giới hạn khi online/resume. Upload lỗi không được chặn PDF/audio/reader.
- [ ] Cloud là bản lưu bền vững; local là cache/outbox. Chỉ xóa pending record sau khi server xác nhận đã nhận đúng revision.
- [ ] Xử lý conflict rõ ràng bằng revision/updatedAt do server quản lý; không để đồng hồ thiết bị sai làm mất tiến trình mới hơn. Giữ bản cloud và local snapshot khi conflict, không silent overwrite.
- [ ] Migration session key `read_along_reading_session_v1`: chỉ migrate sau khi xác nhận book ID; giữ nguyên dữ liệu local cũ đến khi cloud write/read-back thành công. Không ảnh hưởng marker subsystem.

### 4. Điều kiện nghiệm thu bắt buộc

- [ ] Thiết bị A đọc sách X đến trang/audio time đã xác định; đóng/mở app phải restore đúng.
- [ ] Clear cache, clear app data, uninstall/reinstall trên cùng thiết bị A: stable device ID phải giữ nguyên và progress X phải tải lại từ cloud.
- [ ] Thiết bị B có device ID khác: không nhìn thấy/ghi đè progress riêng của A; cùng book ID có progress độc lập.
- [ ] Đọc offline rồi online: outbox đồng bộ đúng, không mất tiến trình và không lặp request vô hạn.
- [ ] Network/API/D1 lỗi: reader/audio vẫn hoạt động, local cache vẫn ghi được và báo trạng thái sync pending.
- [ ] Sách bị đổi folder/đổi tên category nhưng giữ book ID: progress không đổi.
- [ ] Sách bị xóa khỏi catalog hoặc audio part thay đổi: clamp/fallback an toàn, không crash.
- [ ] Kiểm thử orientation, multi-part audio, pause/seek, app background/foreground, process death và OTA update.
- [ ] Có CI regression cho pure sync/store logic và API contract; chỉ build APK một lần ở commit runtime cuối cùng [build-apk], sau khi full test pass.

## P1 — OTA độc lập nhà cung cấp lưu trữ (Cloudflare làm bootstrap hiện tại)

> Quyết định ngày 2026-10-31: ứng dụng chỉ gọi một OTA API ổn định; backend quyết định nơi lưu trữ APK. Đổi storage provider không được yêu cầu build APK lại.

### Hiện trạng đã audit
- [x] Cloudflare Pages project hiện hữu: `read-along-admin`, root `admin`, Functions đang hoạt động; production branch là `beta`.
- [x] Pages Functions có một router dùng chung tại `admin/functions/api/readalong-admin/[[path]].js`; có thể mở rộng route OTA tại đây, không tạo Worker mới.
- [x] Production bindings hiện có: D1 `DB` và R2 `READALONG` → `my-audio-book`. Chưa có binding/bucket OTA riêng.
- [x] Pages project hiện chỉ có `read-along-admin.pages.dev`, chưa gắn custom domain.
- [x] OTA hiện tại lấy GitHub Releases API trong `app.js`; native `ApkUpdaterPlugin.java` chỉ chấp nhận URL bắt đầu bằng `https://github.com/`. Workflow build ký APK và publish GitHub Release.
- [x] Regression hiện tại `tests/ota-update.test.js` chỉ kiểm tra dọn cache shell; chưa có test contract manifest, chữ ký, checksum hoặc URL OTA provider-neutral.

### Thiết kế mục tiêu
- [ ] Ứng dụng chỉ gọi endpoint cố định trên Pages: `GET /api/readalong-admin/ota/latest?channel=beta|official`.
- [ ] APK tải qua endpoint download cố định của cùng backend (proxy/stream từ storage), không nhận URL storage provider trực tiếp; nhờ vậy đổi R2 sang storage khác chỉ cần sửa backend.
- [ ] Dùng bucket R2 riêng `read-along-releases`, binding mới `OTA_RELEASES` trên đúng Pages project `read-along-admin`. Không dùng/chạm bucket sách `my-audio-book`; không dùng tài nguyên dự án khác.
- [ ] Manifest có schemaVersion, channel, version, versionCode, filename, size, SHA-256, release notes, mandatory flag và chữ ký số; public key được pin trong APK, private signing key chỉ lưu ở môi trường phát hành. SHA-256 kiểm tra file; chữ ký manifest xác thực metadata/nguồn phát hành.
- [ ] Giữ nguyên semantics kênh Beta/Official và so sánh version hiện tại; không cho cài downgrade, không thay signing key APK.
- [ ] Native updater chỉ tải HTTPS từ OTA endpoint cố định, giới hạn redirect/host theo chính sách; xác minh kích thước và SHA-256 trước khi mở Android installer. Android vẫn tự xác minh chữ ký APK.
- [ ] GitHub Actions build và xác minh APK như hiện tại, sau đó upload APK + manifest đã ký lên R2 bằng credentials giới hạn riêng bucket; không đưa credentials vào APK hoặc source. Có thể tiếp tục tạo GitHub Release nội bộ trong giai đoạn chuyển đổi.
- [ ] API latest và download fail-closed với manifest không hợp lệ, object thiếu hoặc checksum mismatch; cache manifest ngắn/no-store phù hợp; APK immutable theo version.
- [ ] Kiểm thử API theo hai kênh, version mới/cũ, thiếu APK, sai checksum, sai chữ ký, redirect không hợp lệ, download gián đoạn và installer handoff.
- [ ] Chuyển đổi theo thứ tự: triển khai backend + upload thử → build APK beta chuyển tiếp khi repo còn public → kiểm thử OTA trên thiết bị → xác nhận cập nhật từ endpoint Cloudflare → chỉ sau đó mới chuyển repo Private.
- [ ] Nếu muốn sau này chuyển cả bootstrap/backend khỏi Cloudflare, cần custom domain do người dùng sở hữu và trỏ domain đó tới Pages hiện tại trước khi chuyển. Domain `pages.dev` chỉ ổn định khi giữ Cloudflare Pages làm bootstrap; đổi domain bootstrap sẽ cần một lần cập nhật APK hoặc redirect tương thích.
- [ ] Không tạo bucket, binding, token, secret, domain hoặc deployment cho tới khi hoàn tất contract/code review và có bước triển khai được xác nhận.

## P1 — Hoàn thiện catalog category và stable book ID

- [ ] Audit Admin scanner/publisher và catalog mapper; xác nhận stable book ID không phụ thuộc folder path, filename hoặc category.
- [ ] Bổ sung category/folder metadata theo hướng additive, tương thích catalog cũ; APK cũ tiếp tục hiển thị flat list.
- [ ] Thêm category navigation vào APK; không đổi URL PDF/audio hoặc di chuyển object R2 trong batch này.
- [ ] Test sách thiếu category, category rỗng, trùng ID, đổi folder, đổi tên và catalog cũ.

## P1 — Phân loại thay đổi để tránh build APK không cần thiết

- [ ] Lập bảng path/change ownership cho Admin, schemas, catalog/media, config, runtime JS/CSS/HTML, native Android và release workflows.
- [ ] Kiểm tra workflow path filters hiện tại có phân biệt backend/docs-only với APK runtime hay không; chỉ sửa khi có bằng chứng filter sai.
- [ ] Ghi rõ trong README rằng OTA APK installer không đồng nghĩa với remote JavaScript OTA; không dựa vào remote code update để né quy trình build/kiểm thử APK.
## P2 — Tinh gọn ranh giới APK Core và backend

> Quyết định kiến trúc ngày 2026-10-31: APK tập trung vào tải nội dung từ cloud và trải nghiệm đọc/nghe. Không xây dựng offline PDF/audio hoặc hệ thống cấu hình/điều khiển reader từ xa. PDF/audio lấy từ cloud; timestamp/marker (nếu có) đồng bộ vị trí đọc theo trang. Admin, Dashboard, Analytics backend, catalog, scan và vận hành phát triển độc lập, không kéo theo build APK nếu không thay đổi runtime APK.

### Chốt hợp đồng dữ liệu tối thiểu của APK Core

- [ ] Rà soát data path thực tế của PDF, audio, catalog và marker; lập danh sách endpoint/caller/contract đang được APK sử dụng.
- [ ] Giữ nguyên nguồn PDF/audio trên cloud; app chỉ tải/chạy nội dung khi có kết nối và dữ liệu hợp lệ.
- [ ] Timestamp/marker nếu có phải liên kết đúng trang và audio segment; không tự suy diễn marker khi thiếu hoặc sai dữ liệu.
- [ ] Tách lỗi dịch vụ phụ trợ/quản trị khỏi lỗi tải nội dung; backend phụ trợ lỗi không được làm hỏng reader/audio.
- [ ] Không thêm API, cache/offline content layer hoặc cơ chế điều khiển từ xa nếu chưa có nhu cầu được người dùng xác nhận.

## P2 — Hoàn tất marker migration an toàn

- [x] Đọc lại modules/remote-sync.js, modules/page-sync.js, các caller trong app.js và docs/architecture/marker-and-api-review.md; ghi nhận thứ tự nguồn thực tế và điểm ghi đè không có freshness check.
- [x] Chốt policy: explicit import có chủ ý ưu tiên cao nhất; versioned candidates so sánh revision trong cùng book key; legacy fallback giữ nguyên thứ tự tương thích.
- [x] Dùng revision để so sánh các bản versioned thuộc cùng một logical book; updatedAt chỉ tie-break khi revision và marker content giống nhau.
- [x] Định nghĩa conflict cùng revision khác nội dung (không tự ghi đè, ưu tiên local recovery), revision/schema lỗi, clear-all bằng envelope rỗng và legacy data.
- [ ] Thiết kế migration tương thích ngược: không ghi đè nguồn cũ trước khi bản mới được validate và lưu thành công; không tự xóa marker hoặc file JSON.
- [x] Bổ sung pure resolver và regression tests cho revision, stale copy, conflict, import, clear-all, legacy numeric seconds, object {time,part}, marker lỗi và audio-part bounds. CI [41164224271](https://github.com/blamag999/read-along-android/actions/runs/41164224271) success sau khi sửa conflict-selection.
- [ ] Chỉ thay đổi runtime sau khi policy/test hoàn chỉnh; nếu cần APK thì gom cùng một đợt APK riêng có phạm vi rõ ràng.

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
- [ ] Xác nhận các dịch vụ catalog, marker, Analytics và Diagnostics có contract phù hợp và hoạt động độc lập.
- [ ] Xác nhận Admin/backend có thể thay đổi độc lập mà không cần phát hành APK trong phạm vi đã thiết kế.
- [ ] Đánh giá lần cuối các ranh giới bảo mật, privacy, offline và quyền Android.
- [ ] Chỉ sau nghiệm thu mới đánh dấu APK Core frozen; lỗi bảo mật/nghiêm trọng/tương thích nền tảng vẫn được phép sửa theo quy trình README.

---

## Thứ tự thực hiện khuyến nghị

1. Ưu tiên stable device identity và online progress store trên D1 hiện hữu; nghiệm thu clear app data/uninstall/reinstall và hai thiết bị tách biệt.
2. Chốt stable book ID, category contract và category navigation.
3. Hoàn tất rà soát hợp đồng PDF/audio/catalog/marker và migration marker tương thích ngược.
4. Thực hiện regression reader/audio/orientation/OTA trên thiết bị thật; kiểm thử Android TV khi có thiết bị.
5. Đánh giá bảo mật, privacy, offline/cache và quyết định có đủ điều kiện đóng băng APK Core hay chưa.


Nếu phát sinh lỗi nghiêm trọng ảnh hưởng người dùng, ưu tiên xử lý lỗi đó trước; cập nhật ROADMAP/PLANNING sau khi có bằng chứng.
