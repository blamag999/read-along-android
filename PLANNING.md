# Read Along Android — PLANNING (công việc còn lại)

> **Quy tắc nhánh hiện hành (2026-10-31):** chỉ còn hai nhánh dài hạn `beta` (phát triển/tích hợp) và `main` (stable). Làm việc trực tiếp trên beta; chỉ promote qua PR beta → main khi người dùng xác nhận. Không dùng testing. Xem README mục 3. Việc xóa branch testing và bật branch protection cho main đang chờ thao tác quản trị GitHub ngoài khả năng connector hiện tại; không được coi là đã hoàn tất.

> **Chỉ quản lý việc chưa hoàn thành.** Quy tắc làm việc ở [README.md](./README.md); lịch sử và tiến độ đã hoàn thành ở [ROADMAP.md](./ROADMAP.md). Khi một mục hoàn tất, ghi bằng chứng vào ROADMAP trước rồi xóa mục đó khỏi file này. Không giữ checklist đã xong hoặc nhật ký công việc tại đây.

## Nguyên tắc triển khai

- Mặc định làm trực tiếp trên nhánh beta; không tạo nhánh mới, không promote main.
- Mỗi đợt nhỏ, có test và có thể xác minh độc lập. Full regression chạy tại mốc `[test]` hoặc trước `[build-apk]`, không chạy trên commit trung gian. Không build APK cho thay đổi chỉ ở Admin/backend/docs.
- Không thay đổi reader/audio/native hoặc marker runtime khi chưa có test hồi quy và kế hoạch bảo toàn dữ liệu.
- Không tạo API/Worker mới nếu hệ thống hiện có đáp ứng; không gộp endpoint khác trách nhiệm.
- Không đánh dấu hoàn thành nếu thiếu bằng chứng CI, endpoint, deploy hoặc thiết bị tương ứng.

## P0 — Tiếp tục hoàn tất Reader/Menu và chuyển hẳn sang R2
### Trạng thái cập nhật tại beta test commit `98cd19cda1c307046078f97093d7eb03f0ecd377`

- Đã triển khai R2-only media loading, marker UI read-only và Library retry; sửa trạng thái disabled ban đầu của nút Library tại commit `588b3808f3d57a36be447d92523d73d72b7d27c9`.
- Regression assertion cho trạng thái Library ban đầu được thêm tại `f588259634e24d96f12f161af74da2dc4d77b4be`; test commit `[test]` mới nhất là `98cd19cda1c307046078f97093d7eb03f0ecd377`; regex assertion cho thuộc tính disabled đã được kiểm tra và sửa escape.
- Full regression CI chưa có status được xác nhận tại thời điểm cập nhật. Không đánh dấu nghiệm thu, không build APK cho đến khi CI pass.
- Test contract đã được sửa để khớp UI tối giản thực tế: không còn yêu cầu view/zoom controls trong Menu. CSS audit sơ bộ có 81 selector candidate không được tham chiếu từ HTML/JS hiện tại; chưa xóa vì cần rà soát rule compound/media.
- Việc còn lại của batch: xác nhận CI; hoàn tất audit selector/CSS dead styles; kiểm tra diff; chạy một APK beta cuối batch và nghiệm thu trên điện thoại. Android TV vẫn ngoài phạm vi batch này.


- [x] Audit caller/DOM/event listener cho file picker, marker management, IndexedDB media Blob và local library; các entry point đã được gỡ, dữ liệu legacy không bị xóa.
- [ ] Rút menu về các mục đã duyệt: Tự lật trang, Vị trí đọc gần đây, Cập nhật OTA, Phiên bản; loại bỏ menu ẩn/hiện settings và marker editor.
- [ ] Giữ hành vi lật trang thủ công tự tua audio luôn bật; loại bỏ nhánh pageTurnMode legacy `markers` và session compatibility không còn cần thiết, có regression test.
- [x] Library button mở catalog R2 và retry khi catalog chưa tải/lỗi; nút được bật ngay từ HTML khởi tạo, không phụ thuộc lần tải thành công đầu tiên.
- [x] Giữ read-only marker JSON companion từ R2; đã xóa UI/import/export/editor marker, không thêm API ghi marker.
- [ ] Bổ sung/hoàn thiện regression tests cho menu, auto flip, manual seek, session legacy, R2 catalog retry và không còn luồng mở file cục bộ; assertions đã cập nhật nhưng full CI chưa được xác nhận.
- [ ] Chạy full regression bằng commit `[test]`; chỉ sau khi pass mới tạo một commit `[build-apk]`.

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

> Quyết định ngày 2026-10-31: ứng dụng chỉ gọi một OTA API ổn định; backend quyết định nơi lưu trữ APK. Đổi storage provider không yêu cầu build APK lại.

### Hạ tầng và backend
- [x] Cloudflare Pages project `read-along-admin`, root `admin`, production branch `beta`; dùng Pages Functions router hiện hữu tại `admin/functions/api/readalong-admin/[[path]].js`, không tạo Worker mới.
- [x] Tạo bucket R2 riêng `read-along-releases` tại APAC; production binding `OTA_RELEASES` đã gắn vào Pages project.
- [x] Giữ nguyên binding R2 `READALONG` → `my-audio-book` và D1 `DB`; không di chuyển hay sửa dữ liệu sách.
- [x] Pages hiện có domain `read-along-admin.pages.dev`, chưa có custom domain.
- [x] Đã thêm API `GET /api/readalong-admin/ota/latest?channel=beta|official` và `GET /api/readalong-admin/ota/download?channel=...&version=...`. Backend đọc manifest qua binding `OTA_RELEASES`, tự suy ra object key, kiểm tra schema/channel/version/size/checksum metadata và stream APK; không trả URL storage provider cho client.
- [x] Pages deployment backend thành công; smoke test production xác nhận CORS preflight, channel validation và phản hồi 404 đúng khi channel chưa có manifest. CI [41183146147](https://github.com/blamag999/read-along-android/actions/runs/41183146147), [41183506939](https://github.com/blamag999/read-along-android/actions/runs/41183506939) success.
- [ ] Chờ upload APK/manifest thật vào R2 để kiểm tra nhánh latest/download 200 và checksum end-to-end.

### APK client và phát hành
- [x] `app.js` chuyển từ GitHub Releases API sang Pages OTA API cố định; xác thực manifest, channel, SemVer, versionCode, filename, size và SHA-256; không sử dụng URL storage do manifest cung cấp.
- [x] Workflow nhúng `app-version-code` vào APK để chặn downgrade theo versionCode bên cạnh versionName.
- [x] Native `ApkUpdaterPlugin.java` chỉ chấp nhận HTTPS host/path cố định của Pages; không follow redirect; giới hạn kích thước, tính SHA-256 trên luồng tải và xóa APK nếu checksum/size sai trước khi mở installer.
- [x] GitHub Actions build workflow có bước upload APK trước, manifest sau, qua S3-compatible R2 API; checksum được lưu trong R2 custom metadata. Giữ GitHub Release làm bản phân phối dự phòng.
- [x] Workflow fail-closed nếu thiếu R2 credentials; không tạo release OTA thành công khi chưa upload manifest.
- [x] Regression CI [41183506939](https://github.com/blamag999/read-along-android/actions/runs/41183506939) success: full npm regression, JS syntax, Pages Functions syntax, isolation và production OTA API smoke. Native code mới mới được static-checked; chưa build APK/compile Gradle hoặc nghiệm thu trên thiết bị.
- [ ] Tạo R2 API token chỉ cấp **Object Read & Write** cho đúng bucket `read-along-releases`; không cấp toàn account và không dùng Cloudflare account-wide API token.
- [ ] Lưu hai giá trị token vào GitHub repository secrets:
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
- [ ] Sau khi tạo secrets, chạy một bản Beta để xác nhận workflow upload thành công; kiểm tra manifest latest và tải APK qua Pages API; kiểm tra checksum và cài OTA thực tế.
- [ ] Chỉ sau khi OTA R2 đã nghiệm thu trên thiết bị mới cân nhắc chuyển repository sang Private. Không thay signing key và không xóa GitHub Releases trước khi xác nhận.

### Cấu hình token cần người dùng thực hiện
1. Cloudflare Dashboard → **R2 Object Storage** → **Manage R2 API Tokens** → **Create API token**.
2. Chọn quyền **Object Read & Write**, giới hạn resource vào bucket duy nhất `read-along-releases`; không chọn toàn bộ bucket/account.
3. Sao chép **Access Key ID** và **Secret Access Key** ngay sau khi tạo.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**; tạo đúng hai secret `R2_ACCESS_KEY_ID` và `R2_SECRET_ACCESS_KEY`. Không gửi hai giá trị này trong chat.
5. Workflow dùng account ID công khai đã khai báo sẵn, endpoint S3 `https://27391a829e8e4a38e9411d17ce76b5ba.r2.cloudflarestorage.com`, region `auto`; không cần thêm secret account ID.

### Contract và giới hạn bảo mật
- Manifest schema v1: `schemaVersion`, `channel`, `version`, `versionCode`, `filename`, `size`, `sha256`, `notes`, `mandatory`, `publishedAt`.
- Object layout: `releases/{beta|official}/read-along-vX.Y.Z-android.apk`; `channels/{beta|official}/latest.json`. Manifest được upload sau APK để không công bố release thiếu tệp.
- Không thêm chữ ký manifest riêng trong MVP: TLS bảo vệ API; checksum phát hiện sai lệch nội dung; Android PackageInstaller xác minh chữ ký APK bằng signing key hiện tại. Không thay khóa ký.
- Nếu chỉ đổi storage provider trong khi Pages Functions vẫn là bootstrap thì APK không cần build lại. Nếu chuyển cả bootstrap khỏi Cloudflare, cần custom domain do người dùng sở hữu; `pages.dev` không thể mang sang provider khác.
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
- [ ] Xác minh hành vi online-only: PDF/audio R2 không được lưu thành bản cache offline; dọn shell cache không làm mất session/checkpoint.
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


## P1 — Ba mốc đọc gần nhất cho từng cuốn sách
- [ ] Kiểm thử trên APK beta: mỗi sách giữ tối đa 3 checkpoint (mốc hiện tại + 2 mốc trước); chuyển trang, tua audio lùi/nhảy xa và đổi phần audio phải giữ lại vị trí trước đó.
- [ ] Xác nhận chọn một mốc cũ để khôi phục không tự phát audio, đồng thời vị trí vừa rời đi vẫn được giữ làm mốc phục hồi.
- [ ] Kiểm tra chuyển A → B → A, đóng/mở app và OTA update; dữ liệu checkpoint của các sách không ghi đè lẫn nhau.


## P1 — Đồng bộ mốc audio 0 giây với trang PDF
- [ ] Kiểm thử APK beta: nếu chỉ có mốc `{ "2": 0 }`, khi audio bắt đầu ở giây 0 reader phải chuyển tới trang 2.
- [ ] Xác nhận các mốc bằng nhau vẫn chọn trang có số nhỏ nhất; mốc của audio part khác vẫn bị bỏ qua; kiểm tra cả chế độ một trang và hai trang.


## Nghiệm thu thiết bị cảm ứng — pending

- Cài APK beta của batch touch-reader sau khi GitHub Actions build và R2 publish thành công.
- Kiểm tra thực tế trên điện thoại Android: vuốt Back khi đang đọc hỏi đóng sách; Back tại màn hình chính hỏi thoát; Home/gesture Home dừng audio ngay và không tự phát lại khi quay về.
- Kiểm tra đóng/mở sách: lưu trang + audio part + timestamp; hỏi tiếp tục vị trí gần nhất; chọn được checkpoint cũ trong tối đa ba mốc; không autoplay.
- Kiểm tra ba vùng chạm trái/giữa/phải và vuốt ngang; vùng giữa play/pause; không xung đột thanh tua, menu hoặc nút điều khiển.
- Kiểm tra timestamp thưa, timestamp liền kề, mốc 0 giây, tua audio, audio nhiều part và trang cuối.
- Không mở rộng kiểm thử Android TV trong batch này.


## APK beta v1.3.12 — ready for device acceptance

- GitHub Actions run 41189021463 passed end-to-end, including signed APK verification and R2 beta OTA publication.
- Install from the beta release v1.3.12 and perform the touch-screen acceptance cases listed above.
- Keep beta separate from main until the user confirms device acceptance; no stable promotion has been made.


## P0 — Touch reader usability and timestamp back-navigation (2026-10-31)

- [x] Fix manual previous-page navigation when the immediate previous page has no valid timestamp: resolve the nearest prior valid marker, display the corresponding spread (for example pages 3–4 when page 4 has no marker), and seek audio to that marker when auto-seek is enabled.
- [x] Prevent stale audio timeupdate events from immediately undoing a manual backward page turn; preserve normal forward marker synchronization and multi-part audio behavior.
- [x] Make toast/confirmation text readable with preserved line breaks; keep OTA update notes limited to new features, meaningful improvements/fixes, and one performance/stability line. Do not expose commit IDs, versionCode, or internal build details in the user prompt.
- [x] Keep the Playlist, Close Book, and Read Menu controls on one row on narrow touch screens; compact labels without clipping or overlap.
- [x] Expose the current reading position plus two prior checkpoints directly from the reader menu; selecting a checkpoint restores position without autoplay.
- [x] Constrain touch navigation and play/pause zones to the actual rendered PDF canvas bounds. Touches and swipes outside the PDF must not trigger reader actions. Recalculate bounds after render, zoom, resize, and orientation changes.
- [x] Add regression tests for page 5 → pages 3–4 when page 4 has no marker, exact previous-page markers, other-audio-part markers, touch-zone boundaries, visible checkpoint entry point, notification line breaks, and single-row header layout.
- [x] Build one beta APK after the full regression suite passed. Device acceptance remains pending.



### Beta v1.3.13 — build verified; device acceptance pending

- Commit: d83b284d8d57863763560f812f41521f897c9a3e
- Workflow: https://github.com/blamag999/read-along-android/actions/runs/41191629320 — SUCCESS (full npm test, signed APK build/verification and R2 OTA publication).
- APK: read-along-v1.3.13-android.apk; 3,438,317 bytes.
- SHA-256: 51ee1ff153d093633a3f7125c31cb85ff1e3adc86f136c18a466ee93c854d689
- Release: https://github.com/blamag999/read-along-android/releases/tag/v1.3.13
- Remaining gate: user acceptance on a touch-screen Android phone. Do not promote to main/stable before acceptance.



## Batch touch UI và tinh gọn menu — 2026-10-31

- [x] Sửa header màn hình dọc: thu gọn tên app, ẩn nhãn chữ của nút Danh sách truyện/Đóng sách ở màn hình hẹp, giữ nút không co chồng lấn và chừa không gian cho Menu.
- [x] Bỏ thao tác cập nhật marker từ GitHub và giao diện token/đồng bộ marker online; giữ luồng marker JSON gắn với catalog/media R2 cùng thao tác nhập/xuất JSON cục bộ. Đã bỏ luôn lời gọi fallback `loadCloudSyncForBook()` để tránh phụ thuộc vào remote-sync client.
- [x] Bỏ giao diện Chẩn đoán/Báo lỗi khỏi ứng dụng cá nhân và ngừng nạp diagnostics client.
- [x] Bật usage analytics mặc định, không hiển thị consent modal/menu; payload hiện hữu chỉ gồm event ẩn danh và thời lượng đọc/nghe, không gồm tên sách/tệp/nội dung.
- [x] Đổi nhãn checkpoint thành “Mốc đọc gần đây”.
- [x] Full regression CI đã pass ở run [41193683584](https://github.com/blamag999/read-along-android/actions/runs/41193683584) trên commit `52d56ad795d20def0c5e536587a529db6a9f5ff8`.
- [ ] Build và xác minh signed beta APK (đang chạy workflow 41193683584); kiểm thử portrait trên thiết bị cảm ứng (nhiều chiều rộng), xác nhận nút playlist hoạt động và menu gọn.
- [ ] Kiểm tra mở truyện R2 tải đúng JSON marker đi kèm PDF/audio; xác nhận không còn request đồng bộ marker GitHub.
- [ ] Chỉ đóng batch sau nghiệm thu thiết bị; không promote main trước xác nhận của người dùng.


## Incident: không tải được sách sau batch menu — 2026-10-31

- [x] Xác định nguyên nhân: HTML của `syncModal` bị rút gọn nhầm, làm thiếu `importSyncInput` và `btnClearSync` (cùng bảng `syncTableBody`). `initEvents()` gọi `addEventListener()` trên null, dừng khởi tạo trước khi chạy `loadR2Catalog()`.
- [x] Khôi phục modal marker JSON cục bộ gồm export/import/xóa và bảng marker; không khôi phục GitHub sync/token UI.
- [x] Gỡ toàn bộ lời gọi `scheduleGitHubSync()` còn sót trong app; filename JSON export tự xử lý cục bộ, không phụ thuộc `remote-sync.js`.
- [x] Thêm regression assertions cho các DOM ID bắt buộc của modal và việc không còn gọi online sync.
- [x] Full regression + Pages syntax/isolation pass trong workflow [41202909931](https://github.com/blamag999/read-along-android/actions/runs/41202909931) trên commit `9c4bf18861122df8f5dc29ac080b17aa2dd456c1`.
- [ ] Xác nhận APK ký số và OTA R2 publish hoàn tất; kiểm tra tải catalog và mở PDF/audio thực tế trên thiết bị.


## Tinh gọn header và thư viện R2 online-only — quyết định 2026-10-31

[x] Header chỉ có hai action: **Thư viện sách** và **Menu**; Android Back đóng sách và lưu phiên đọc, không có nút Đóng sách riêng.

[x] Hủy hoàn toàn đề xuất kho lưu trữ sách/âm thanh 1 GB. Ứng dụng **không tải trước, không lưu bản PDF/audio bền vững trên thiết bị và không hỗ trợ đọc/nghe offline**. Nội dung được stream/đọc trực tiếp từ R2 khi mở sách.

[x] Không triển khai LRU/FIFO, quota, Download Manager, offline library, tự xóa sách cũ hoặc cơ chế dọn media theo dung lượng. Không thêm media cache layer mới.

[x] Chỉ giữ cache shell/app assets cần cho WebView/Service Worker và cache tạm kỹ thuật nếu cần; tuyệt đối không biến chúng thành kho PDF/audio. Không thay đổi hoặc xóa dữ liệu session/checkpoint cần thiết.

[x] OTA không được xóa session/checkpoint hoặc dữ liệu trạng thái đọc. Việc cập nhật APK không được thêm hoặc xóa kho media vì kho media offline không tồn tại.

- Marker JSON companion từ R2 vẫn được đọc ở chế độ read-only để đồng bộ trang/audio; không có marker write/sync từ client.
- Việc đồng bộ tiến trình đọc/nghe online (nếu triển khai) là dữ liệu trạng thái riêng, không phải lưu trữ PDF/audio offline. Không gộp hai phạm vi này.
- Các ghi chú lịch sử về kho offline 1 GiB/LRU ở phần dưới hoặc trong nhật ký cũ chỉ phản ánh đề xuất trước đây và đã bị quyết định này thay thế; không được coi là backlog còn mở.

### Header thư viện portrait — code đã cập nhật, chờ CI/device

## P2 — Chuẩn hóa Release Notes cho mọi bản build

> Đã triển khai generator và tích hợp vào workflow beta ngày 2026-10-31. Còn một lỗi chất lượng nội dung được phát hiện khi nghiệm thu Release v1.3.21; chưa coi hạng mục hoàn tất.

- [x] Chuẩn hóa commit subject với bốn nhóm dành cho người dùng: `[feature]`, `[improve]`, `[fix]`, `[security]`; các marker nội bộ như `[test]`, `[docs]`, `[build-apk]`, `[handover]` không xuất hiện trong ghi chú phát hành.
- [x] Điều chỉnh workflow `.github/workflows/build-android-apk.yml` để tổng hợp commit từ mốc phát hành trước **cùng kênh** (beta/official), tránh trộn lịch sử hai kênh; xác minh cách xử lý lần phát hành đầu tiên.
- [x] Sinh Release Notes tiếng Việt theo các nhóm Tính năng mới / Cải tiến / Sửa lỗi / Bảo mật; chỉ hiển thị nhóm có nội dung, loại bỏ trùng lặp và commit nội bộ, không tự thêm câu cải thiện chung nếu không có thay đổi tương ứng.
- [x] Dùng một nội dung changelog duy nhất cho GitHub Release và OTA manifest; thông báo trong app lấy cùng nội dung nhưng rút gọn khoảng 400 ký tự, giữ các thay đổi quan trọng trước.
- [x] Bổ sung regression test cho phân loại commit, lọc marker nội bộ, mốc release theo channel và nội dung rỗng; kiểm tra giới hạn OTA 400 ký tự ở phía app hiện có; không thay đổi versioning, signing hoặc cơ chế tải/cài OTA.
- [ ] Cải thiện chất lượng Release Notes: run v1.3.21 xác nhận generator hoạt động nhưng nội dung còn lẫn commit subject tiếng Anh/kỹ thuật. Cần bổ sung trường `Release-Note:` tiếng Việt tường minh hoặc quy tắc loại commit không hướng người dùng; kiểm thử và xác minh trên beta tiếp theo trước khi đánh dấu hoàn tất.

## P2 — Rà soát và rút gọn thông báo nội bộ trong ứng dụng

> Đợt rà soát chỉ đọc ngày 2026-10-31. Chưa sửa nội dung thông báo trong batch này; giữ nguyên các thông báo OTA vừa chuẩn hóa ở phiên trước.

- [x] Phân loại alert/confirm/prompt/toast theo nhóm: thao tác thành công, hướng dẫn thao tác, cảnh báo có thể tự xử lý, lỗi cần hành động và lỗi kỹ thuật.
- [x] Hoàn tất audit và rút gọn thông báo; thống nhất thuật ngữ trên thông báo, nhãn trạng thái và các hướng dẫn chính; bỏ emoji trang trí không cần thiết.
- [x] Giữ thông tin lỗi kỹ thuật trong console/diagnostics ở các nhánh lỗi catalog, mở sách và nạp âm thanh đã chỉnh; thông báo người dùng chỉ nêu việc không thực hiện được và bước khắc phục phù hợp.
- [x] Không thay đổi điều kiện hiển thị/luồng xử lý của các nhánh đã chỉnh; giữ nguyên Confirm/Prompt dữ liệu động và OTA đã chuẩn hóa; bổ sung regression assertions trước khi sửa.
- [x] Hoàn tất batch thông báo và full regression; chờ commit `[build-apk]` để tạo một APK beta cuối đợt. Device acceptance vẫn cần người dùng kiểm tra.

### Kết quả rà soát thông báo hiện tại — 2026-10-31 (chỉ đề xuất, chưa sửa app.js)

Đã rà soát các alert/confirm/prompt/toast trong `app.js`. Giữ nguyên các nội dung đã chuẩn hóa ở phiên trước: đóng sách, thoát ứng dụng, tiếp tục phiên đọc, xóa mốc thời gian và toàn bộ thông báo OTA. Các nội dung dưới đây là ứng viên rút gọn; cần thêm regression test trước khi áp dụng:

| Tình huống | Nội dung đề xuất |
|---|---|
| Tải catalog lỗi | Không tải được thư viện sách. Vui lòng thử lại. |
| Mở sách lỗi | Không mở được sách. Vui lòng kiểm tra tệp sách và âm thanh. |
| Đổi audio nhưng autoplay bị chặn | Đã chuyển phần audio. Nhấn Phát để tiếp tục. |
| Định dạng âm thanh không hỗ trợ | Định dạng âm thanh không được hỗ trợ. Hãy chọn MP3, M4A hoặc định dạng tương thích. |
| Bỏ qua file không hỗ trợ | Đã bỏ qua {n} file không hỗ trợ. |
| Không nạp được audio | Không tải được âm thanh. Vui lòng chọn lại file. |
| Không tìm thấy PDF/audio trong thư mục | Không tìm thấy file PDF hoặc audio phù hợp trong thư mục. |
| Không mở được PDF | Không mở được PDF. Vui lòng chọn file khác. |
| File audio không hợp lệ | File audio không hợp lệ. Vui lòng chọn lại. |
| Chưa có PDF khi ghim mốc | Hãy mở PDF trước khi ghim mốc. |
| Chưa có mốc để lưu | Chưa có mốc thời gian để lưu. |
| Chưa có audio khi nhấn Play | Chưa có âm thanh. Hãy chọn file audio trước. |
| Nhập số trang không hợp lệ | Nhập số trang từ 1 đến {totalPages}. |
| Trang chưa có mốc | Trang này chưa có mốc thời gian. |
| Chưa có audio khi đọc lại trang | Chưa có âm thanh để đọc lại trang. |
| Không thể đọc lại trang | Không thể phát lại trang này. Hãy thử nhấn Phát. |
| Lỗi audio tải/phát | Không tải/phát được âm thanh. Hãy kiểm tra file và thử lại. |
| Giá trị mốc không hợp lệ | Thời gian không hợp lệ. Hãy nhập giây hoặc MM:SS. |
| JSON nhập không hợp lệ | File mốc thời gian không hợp lệ. |
| Chọn chế độ chờ lật trang | Đến mốc tiếp theo, audio sẽ dừng chờ bạn lật trang. |
| Chọn chế độ tự lật trang | Tự động lật trang theo mốc thời gian. |
| Chọn chế độ đọc liên tục | Đọc liên tục, không tự chuyển trang. |
| Đến cuối trang/chờ lật | Đã đến cuối trang. Lật trang để tiếp tục. |

Các thông báo thành công có thể rút ngắn thêm: `Đã mở sách.`, `Đã tải âm thanh.`, `Đã lưu mốc thời gian.`, `Đã nhập mốc thời gian.`, `Đã khôi phục vị trí đọc. Nhấn Phát để nghe.` Tránh hiển thị đồng thời nhiều toast cho một thao tác (ví dụ nạp nhiều audio vừa báo tải audio, vừa báo tự mở PDF, vừa báo tải xong); ưu tiên một thông báo cuối cùng có ý nghĩa nhất.

Nguyên tắc không thay đổi: không đưa `error.message`, HTTP status, codec nội bộ hoặc chi tiết máy chủ vào alert/toast; ghi chi tiết vào console/diagnostics. Riêng lỗi tải catalog hiện đang nối `error.message` vào alert và cần được sửa theo nguyên tắc này. Prompt nhập mốc thời gian và phần audio cần giữ hướng dẫn + phạm vi hợp lệ; không rút gọn đến mức làm mất cú pháp nhập. Confirm và OTA đã chuẩn hóa ở batch trước không thuộc phạm vi sửa lại.


### Quy ước thuật ngữ giao diện — thống nhất ngày 2026-10-31

- Trong nội dung hướng tới người dùng, dùng **“sách”** thay cho “PDF” khi nói về tài liệu đang đọc hoặc thao tác đọc sách.
- Dùng **“âm thanh”** thay cho “audio” khi nói về tệp, phát, tải, chuyển phần hoặc lỗi âm thanh.
- Vẫn giữ tên định dạng kỹ thuật khi cần chỉ rõ loại tệp: “tệp PDF”, “MP3”, “M4A”. Đây là tên định dạng, không phải cách gọi đối tượng trong giao diện.
- Không đổi tên biến, API, metadata, log kỹ thuật hoặc tên định dạng trong mã nguồn chỉ vì quy ước ngôn ngữ này.
- Mọi thông báo người dùng được rà soát hoặc bổ sung sau này phải tuân thủ quy ước trên.


### Tiến độ triển khai — 2026-10-31 (beta, chưa nghiệm thu)

- Release Notes: đã thêm `scripts/generate-release-notes.py`; workflow lấy mốc release gần nhất cùng channel dựa trên cờ prerelease, hỗ trợ lần phát hành đầu tiên, nhóm `[feature]`, `[improve]`, `[fix]`, `[security]`; alias lịch sử `[perf]` được gom vào Cải tiến. Các marker nội bộ không được render. Cùng output changelog được dùng cho GitHub Release và OTA manifest.
- Version generation trước đó được chuyển vào script và giữ quy tắc tăng version hiện hành; cần xác minh bằng test/CI trước khi phát hành.
- Đã thêm `tests/release-notes.test.py` và nối vào `npm test` để kiểm tra category, deduplication, nội dung rỗng và channel isolation.
- App notification: đã rút gọn một nhóm lỗi catalog/sách/âm thanh, tệp không hỗ trợ, thao tác marker và phát lại; giữ chi tiết lỗi ở console trong các nhánh đã sửa. Một số thông báo cũ/emoji/thuật ngữ chưa được xử lý; batch thông báo chưa hoàn tất.
- Chưa chạy npm test/CI, chưa xác minh release notes thực tế, chưa build APK và chưa kiểm tra thiết bị. Do app.js thay đổi, cần một APK beta sau khi hoàn tất toàn bộ notification batch và full regression.


### CI cập nhật — 2026-10-31

- Workflow [41212943321](https://github.com/blamag999/read-along-android/actions/runs/41212943321) trên commit `e679600bd3e7d36e9b98443991eeedf128f137bc`: `npm test`, Pages Functions syntax và isolation checks đều PASS; smoke test analytics đã PASS. Smoke test OTA contract còn đang chạy tại thời điểm ghi nhận.
- Hai lần CI trước thất bại ở bước import module Python trong test do tên script có dấu gạch nối; đã thay bằng importlib theo đúng đường dẫn. Không coi các run thất bại trước là xác nhận test.
- Còn pending: kết luận cuối cùng run 41212943321, audit thông báo app còn lại, xác minh changelog thực tế trong release beta. Chưa build APK.


### Hoàn tất batch thông báo — 2026-10-31

- Đã chuẩn hóa các toast/alert còn lại: khôi phục phiên đọc, tải thư viện, mở sách, tự động lật trang, lỗi phát, chọn nhiều tệp, và thao tác marker.
- Đã gom thông báo nạp nhiều âm thanh thành một toast cuối; bỏ toast trung gian khi chỉ là bước nạp và khi tự mở sách từ thư viện.
- Đã giữ lỗi kỹ thuật trong console/diagnostics; thông báo người dùng không đưa exception message/codec nội bộ ra UI.
- Đã áp dụng “sách” / “âm thanh” vào nhãn trạng thái rỗng, nút chọn âm thanh, filter thư viện, hướng dẫn thả tệp và nhãn phần âm thanh. Tên định dạng PDF/MP3/M4A chỉ giữ khi cần hướng dẫn loại tệp.
- Regression assertions bao phủ thông báo, nhãn UI tĩnh/động và contract workflow.
- Full regression workflow [41213578916](https://github.com/blamag999/read-along-android/actions/runs/41213578916) trên commit `b1d3ac247e8e6fd463be813cc7169a6ce26407f4`: npm test PASS, Pages Functions syntax PASS, isolation PASS, analytics smoke PASS, OTA manifest smoke PASS.
- Chờ build APK beta chốt đợt để xác minh version/changelog được phát sinh từ generator và kiểm tra signature/SHA-256/artifact/Release.


### Final beta build — 2026-10-31

- Đã tạo commit chốt `[build-apk]` `5839851550c29a1fcb17d8815426db1783b0936d`.
- Workflow build [41213680238](https://github.com/blamag999/read-along-android/actions/runs/41213680238) đã PASS full regression, Pages syntax, isolation, release channel validation và bước generate version/changelog. Prepare web assets, embed version, Web Local ZIP, native updater, Android version, launcher icons và cấu hình ký đều PASS.
- Bước `Build signed release APK` đang chạy; chưa có kết quả signature/SHA-256, R2 publication, artifact upload hoặc GitHub Release tại thời điểm ghi nhận.


### Kết quả nghiệm thu Release Notes trên beta v1.3.21 — 2026-10-31

- Build [41213680238](https://github.com/blamag999/read-along-android/actions/runs/41213680238) thành công; generator chọn đúng mốc cùng channel `v1.3.20`, sinh version `1.3.21`, phát hành prerelease beta.
- Changelog chung đã được đưa vào GitHub Release và OTA manifest. Tuy nhiên, nội dung thực tế còn đưa một số commit subject tiếng Anh/kỹ thuật vào nhóm Cải tiến/Sửa lỗi (ví dụ thay đổi regex, output script, workflow), không phù hợp với người dùng cuối.
- Vì vậy, chức năng channel/version/generation đã hoạt động và được xác minh, nhưng chất lượng nội dung tiếng Việt chưa đạt. Không đánh dấu Release Notes hoàn tất; cần thiết kế trường `Release-Note:` tường minh hoặc lọc commit nội bộ theo policy rồi xác minh ở beta kế tiếp.


## P1 — Bỏ mở sách từ thiết bị và tinh gọn reader/Menu — 2026-10-31

> Phạm vi đã được người dùng xác nhận; đã rà soát lại source beta hiện tại. Chưa triển khai runtime. Chỉ làm trên beta; không cập nhật main. Ứng dụng tiếp tục đọc PDF/audio trực tiếp từ R2, không triển khai cache offline.

### Mục tiêu UX đã chốt

- Header chỉ có hai action: **Thư viện sách** và **Menu**. Không có nút Đóng sách; Android Back đóng sách và lưu phiên đọc.
- Menu chỉ gồm:
  1. **Tự lật trang** — một công tắc bật/tắt. Khi tắt, người đọc tự chuyển trang; không còn các chế độ markers/off như ba lựa chọn riêng.
  2. **Vị trí đọc gần đây** — giữ tối đa ba checkpoint; thao tác **Xem tiếp**, khôi phục không tự phát audio.
  3. **Cập nhật OTA** — giữ chọn kênh và kiểm tra cập nhật.
  4. **Phiên bản** — hiển thị phiên bản đang cài.
- Không đưa các điều khiển đang bị ẩn trong APK vào Menu; các thành phần ẩn thuộc chức năng bị loại bỏ phải được xóa, không chỉ tiếp tục ẩn bằng CSS.
- Không có Menu cài đặt ẩn/hiện, không có nhóm điều khiển fit/two-page/zoom.
- **Lật trang tự tua audio** là hành vi reader mặc định luôn bật: khi người dùng chuyển trang thủ công, audio tự tua đến marker tương ứng. Không có nút bật/tắt; chỉ bỏ checkbox/giao diện cấu hình. Phải ép hành vi runtime luôn bật và không để giá trị false cũ trong session/localStorage vô hiệu hóa nó.
- Cách hiển thị trang là logic tự động hiện có, không phải tùy chọn người dùng: bình thường hiển thị một trang; khi marker cần nhảy qua một trang không có marker, hiển thị đồng thời trang có marker và trang liền kề không có marker (trước hoặc sau tùy chiều điều hướng). Khi không còn tình huống đó, trở về một trang. Không thêm nút một trang/hai trang.
- Bỏ toàn bộ công cụ quản lý marker: chỉnh/thêm/xóa marker, modal/bảng marker, nhập JSON, xuất JSON, xóa marker và mọi luồng đồng bộ/cập nhật marker online do client khởi tạo.
- **Không bỏ dữ liệu marker đọc từ R2**: JSON marker đi kèm catalog vẫn là dữ liệu đầu vào read-only để đồng bộ PDF/audio và xác định trang/spread. Đây không phải chức năng quản lý hay đồng bộ marker online. Không tạo API marker mới.
- Không cache PDF/audio R2; tiếp tục stream/đọc online như hiện tại.

### Ranh giới APK Core và nguyên tắc giảm số lần build

Áp dụng kiến trúc đã chốt trong docs/architecture/core-extensibility.md; batch tinh gọn này không được mở rộng phạm vi thành refactor toàn bộ Core.

- [ ] APK chỉ giữ runtime tối thiểu: catalog client, resolver URL R2/allowlist, PDF reader, audio player/multi-part, page/audio sync dựa trên marker R2, checkpoint/session, UI tối thiểu, Android lifecycle/Back và OTA installer.
- [ ] Nội dung thay đổi thường xuyên (sách, PDF, audio, marker JSON, title, category, thứ tự và metadata được contract hỗ trợ) phải cập nhật qua R2/catalog/Admin, không nhúng vào APK.
- [ ] Giữ books.json là contract dữ liệu ổn định; mọi trường mới phải additive, có default/fallback, không đổi nghĩa hoặc xóa field cũ đột ngột. APK phải bỏ qua field không biết và vẫn mở được catalog cũ.
- [ ] Không tải hoặc thực thi JavaScript, HTML, CSS, plugin hay mã thực thi từ server. Không xây remote-config/remote-control để thay đổi hành vi reader; chỉ dùng dữ liệu catalog/content đã định nghĩa trong contract.
- [ ] Không tạo API, Worker, database, cache media hoặc dịch vụ mới cho batch này. Không cache PDF/audio R2; chỉ giữ cache shell/app assets hiện có nếu không ảnh hưởng cập nhật OTA và streaming/Range.
- [ ] Không refactor rộng app.js hoặc tách module chỉ để “đẹp kiến trúc”. Chỉ tách phần có ranh giới rõ, có nhiều caller hoặc cần unit test độc lập; ưu tiên thay đổi nhỏ, ít phụ thuộc.
- [ ] Phân loại build theo ownership: R2 content/catalog/Admin/backend/docs-only không build APK; HTML/CSS/JS runtime đóng gói trong APK, interaction/menu/reader behavior, native bridge/permission/OTA installer đều phải test và build APK beta.
- [ ] Gom thay đổi runtime đã được phê duyệt thành một batch hoàn chỉnh; chạy unit/contract tests trong các bước nhỏ, full regression một lần tại commit [test], sau đó một APK tại commit [build-apk]. Không tạo APK cho mỗi commit trung gian.
- [ ] Không gộp Online Reading Progress (stable device ID + D1 + sync/outbox) vào batch bỏ local-open/Menu. Đây là dự án runtime/native/backend riêng trong PLANNING, cần audit và nghiệm thu độc lập; chỉ triển khai khi được ưu tiên/phê duyệt riêng.
- [ ] Giữ OTA là cơ chế phát hành APK có ký số; không gọi OTA hiện tại là cập nhật JavaScript từ xa. Không thay signing key hoặc installer trong batch tinh gọn.

### Kết quả rà soát source liên quan

- app.js hiện có state.pageTurnMode với ba giá trị next/markers/off và state.autoSeekAudio; session restore đang đọc cả hai giá trị. Menu menuAutoFlip đang chuyển giữa next/off, trong khi quick-options có select ba mode và checkbox auto-seek.
- app.js hiện dùng state.autoSeekAudio trong xử lý chuyển trang thủ công. Khi triển khai phải giữ logic seek này nhưng chuyển thành luôn bật; bỏ việc restore giá trị false và bỏ mọi listener/DOM cấu hình.
- modules/page-sync.js có resolveTimestampSpread(), resolvePreviousMarkedSpread() và alignPage() phục vụ hiển thị một/hai trang theo marker. Giữ logic này, chỉ sửa nếu test chứng minh không đáp ứng đúng quy tắc trang có marker + trang kề không marker.
- Reader hiện nạp marker JSON companion từ R2 và chuẩn hóa marker để đồng bộ audio/page. Giữ read path này; không giữ các UI/handler ghi hoặc quản lý marker.
- index.html/tests hiện còn một số thành phần và assertion marker cục bộ như syncModal, import/export và clear. Phải rà soát DOM reference và cập nhật test cùng lúc khi loại bỏ.
- Header hiện có Thư viện sách và Menu; Android Back đã đi qua requestCloseBook()/closeCurrentBook(). Giữ hành vi đó.
- Catalog R2 hiện được nạp khi khởi động. Nút Thư viện cần có khả năng mở playlist khi catalog đã sẵn sàng và thử tải lại khi lần nạp trước thất bại; không để nút bị disable vĩnh viễn.
- Các helper Blob/local library và File System Access API cần được kiểm tra caller lần cuối trước khi xóa; không xóa database hoặc Blob cũ của người dùng trong batch này.

### A. Loại bỏ hoàn toàn mở sách từ thiết bị

- [x] Gỡ UI chọn PDF/audio/thư mục: filePickerSection, nút Bắt đầu, node1Modal, input PDF/audio/folder và các trigger chỉ phục vụ mở media cục bộ.
- [ ] Giữ tự tải catalog R2 khi khởi động; nút Thư viện mở playlist khi catalog sẵn sàng và gọi retry loadR2Catalog() khi chưa tải được/lần trước lỗi. Hiển thị loading/error rõ ràng; không cần modal Bắt đầu.
- [x] Gỡ handlePdfFileSelect(), handleAudioFileSelect(), handleFolderPick(), handleFileList(), initDragAndDrop(), drop overlay và listener chỉ phục vụ mở media cục bộ.
- [ ] Bỏ showDirectoryPicker, state.dirHandle, state.folderJsonFiles, nhánh đọc JSON từ thư mục và autoSaveSyncToLocalDirectory().
- [x] Kiểm tra caller và bỏ loadPdfFromBlob(), loadAudioFromBlob(), saveBookToLibrary(), getBookFromLibrary() cùng nhánh mở Blob chỉ phục vụ import media. Giữ loadPdfFromUrl(), loadAudioFromUrl(), loadAudioPart() và URL R2.
- [x] Bỏ PdfAudioSyncDB/book_library khỏi đường chạy mới; không xóa database/Blob legacy đã có trên thiết bị và không thêm migration xóa dữ liệu.
- [x] Bỏ buildPlaylistFromFiles() và local-folder playlist; giữ mapRemoteCatalog(), URL validation/host allowlist R2, playlist filter và stable book ID.
- [x] Không còn drop PDF/audio vào cửa sổ; bảo toàn touch/swipe trên canvas PDF.

### B. Tinh gọn Menu và reader controls

- [ ] Giữ đúng hai action header: Thư viện sách và Menu; giữ Android Back đóng sách và lưu session.
- [ ] Xóa menuToggleSettings, logic ẩn/hiện cài đặt cũ, filePickerSection và các quick-options không còn dùng. Không chuyển các control đang bị ẩn vào Menu.
- [ ] Giữ một control duy nhất Tự lật trang bật/tắt. Thay state.pageTurnMode ba trạng thái bằng trạng thái boolean rõ nghĩa (hoặc adapter tương đương tối thiểu); khi tắt chỉ dừng auto page turn, thao tác lật thủ công vẫn hoạt động. Xóa mode markers (dừng chờ lật) và off (đọc liên tục) như các chế độ riêng.
- [ ] Loại bỏ select selPageTurnMode, checkbox chkAutoSeekAudio và mọi listener/nhãn quick-options liên quan. Auto-seek phải luôn bật trong runtime; bỏ restore giá trị autoSeekAudio=false từ session cũ và bảo đảm thao tác lật trang thủ công luôn seek audio đến marker đúng.
- [ ] Giữ logic hiển thị trang tự động trong modules/page-sync.js: một trang bình thường; spread hai trang chỉ khi marker target cách một trang không có marker; hỗ trợ đúng chiều tiến/lùi và audio part. Không thêm nút điều khiển layout.
- [ ] Xóa syncModal, bảng marker, các nút/handler thêm-sửa-xóa-clear, import/export JSON marker, marker file picker và các thao tác ghi marker local/online từ UI APK.
- [ ] Giữ duy nhất luồng đọc marker JSON companion từ R2 và logic normalize/lookup/align cần cho reader. Không xóa modules/page-sync.js, marker parsing cần thiết hoặc marker URL trong catalog.
- [ ] Rà soát mọi caller marker write/sync (bao gồm localStorage mutation, GitHub/remote sync nếu còn, endpoint/API client và các test). Xóa client write/sync chỉ khi không còn caller khác; không xóa backend/API dùng bởi Admin hoặc dịch vụ khác nếu chưa audit ownership/caller trong repository.
- [ ] Giữ checkpoint gần đây, đổi nhãn thành Vị trí đọc gần đây và nút Xem tiếp; tối đa ba mốc, restore không autoplay.
- [ ] Giữ OTA channel, kiểm tra cập nhật, version label; giữ audio scrubber, transport controls và audio-part selector ở footer.
- [ ] Gỡ CSS ẩn/hiện chỉ còn phục vụ các thành phần đã xóa; không để CSS APK che giấu chức năng thừa thay cho việc loại bỏ DOM/runtime.

### C. Kiểm thử và nghiệm thu

- [ ] Contract/UI test: header chỉ có Thư viện sách + Menu; Menu chỉ có Tự lật trang, Vị trí đọc gần đây, OTA và Phiên bản; không còn file picker, drag/drop, settings toggle, view controls, marker manager/import/export.
- [ ] Test Library: catalog tải lúc khởi động; mở playlist khi thành công; retry được sau lỗi mạng/catalog; không disable vĩnh viễn.
- [ ] Test R2 read path: mở PDF URL, phát audio URL nhiều phần, tải marker JSON companion; host allowlist vẫn chặn nguồn ngoài R2.
- [ ] Test auto page turn: bật thì tự chuyển trang theo marker; tắt thì không tự chuyển nhưng thao tác thủ công vẫn hoạt động; không còn nhánh chờ người dùng theo mode markers hoặc đọc liên tục theo mode off.
- [ ] Test auto-seek cố định bật: lật trang thủ công tua audio đến marker tương ứng; session cũ lưu autoSeekAudio=false không được tắt hành vi; chuyển audio part và marker 0 giây vẫn đúng.
- [ ] Test page spread: trang có marker kèm trang liền kề không marker khi nhảy qua trang thiếu marker; xác minh cả tiến/lùi, biên trang đầu/cuối, marker liên tiếp, marker thiếu và marker thuộc audio part khác; trở lại một trang khi không còn điều kiện spread.
- [ ] Test marker read-only: marker R2 được nạp và dùng cho page/audio sync; không có UI hoặc request client để tạo/sửa/xóa/import/export/đồng bộ marker.
- [ ] Test checkpoint, Android Back, lưu/khôi phục session không autoplay, orientation, audio multi-part và footer controls.
- [ ] Test legacy: không xóa IndexedDB cũ, localStorage session/checkpoint hoặc dữ liệu marker đã có; giá trị auto-seek cũ false không ảnh hưởng hành vi mặc định mới.
- [ ] Test UI APK trên portrait 320–600 px và landscape; không chồng lấn header/Menu, giữ vùng safe area và audio footer.
- [ ] Full regression tại commit [test]; sau đó chỉ build một APK beta tại commit [build-apk], xác minh signature/SHA-256/OTA và kiểm tra thiết bị thật.
- [ ] Cập nhật ROADMAP/PLANNING/RECOVERY bằng bằng chứng thực tế; không promote main nếu chưa có xác nhận riêng.

### Ranh giới bắt buộc

- Không xóa IndexedDB cũ, localStorage session/checkpoint hoặc dữ liệu marker cũ trong batch này.
- Không xóa R2 marker JSON read path hoặc logic page/audio sync.
- Không triển khai cache offline R2; PDF/audio tiếp tục đọc online trực tiếp.
- Không đổi catalog contract, stable book ID, R2 host allowlist, OTA endpoint, signing key hoặc luồng Android Back.
- Không xóa backend/API Admin marker chỉ vì APK không còn quản lý marker; phải audit caller và ownership riêng.
- Đây là kế hoạch triển khai, chưa phải xác nhận runtime đã được sửa hoặc nghiệm thu.


## Bàn giao — Đợt 1 Reader/Menu (2026-10-31)

### Đã cập nhật trên beta
- `index.html`: bỏ selector chế độ đọc ba trạng thái, checkbox “Lật trang tự tua”, nút fit-height/hai trang và cụm zoom nhanh khỏi giao diện.
- `app.js`: thao tác Tự lật trang trong Menu chuyển giữa `next/off`; trạng thái cũ `markers` được chuẩn hóa về `next`, còn `off` tiếp tục là tắt. Giá trị `autoSeekAudio` cũ không còn được đọc/ghi; thao tác lật trang thủ công luôn thực hiện đồng bộ audio.
- Khôi phục session/checkpoint chuẩn hóa layout cũ về fit-height; thuật toán `resolveTimestampSpread()` vẫn quyết định ghép trang theo marker. Giữ nguyên page/audio marker lookup và Android Back/session.
- Loại bỏ các tham chiếu DOM đến selector, checkbox, nút hai trang/fit và zoom đã xóa.

### Commit code
- `d9605126b89b2c42900ab4016d0e3b8780fda13c` — đơn giản hóa page-turn và luôn tua audio khi lật thủ công.
- `fec7a7e18db2211f89b876053622277c4d7c4d39` — loại bỏ quick controls khỏi HTML.
- `35169295e7855a2d50b2319e9a3cccc24128f1f5`, `170a5c5d8ac76fb0897c59442c488e989e3f7f17`, `7e56cd43be4c3d49d2efd6ae4053c20b00eeed2f`, `1cd70bf9b031726a4d799a1e2ad274ea22321753` — dọn wiring còn sót và chuẩn hóa session cũ.

### Kiểm tra và giới hạn
- Đã rà soát lại source trên beta: HTML không còn `selPageTurnMode`, `chkAutoSeekAudio`, `btnTwoPages`, `btnFitHeight`, `btnZoomIn`, `btnZoomOut`; app không còn tham chiếu DOM đến các control đó.
- Chưa chạy `npm test`, chưa chạy CI, chưa build APK và chưa kiểm tra trên Android/Android TV. Vì vậy đợt 1 đã cập nhật source nhưng **chưa được nghiệm thu runtime**.
- Việc tiếp theo bắt buộc trước khi chuyển Đợt 2: cập nhật test hợp đồng cho UI/logic mới, chạy toàn bộ regression, xử lý lỗi nếu có; sau đó build một APK beta và kiểm tra manual page seek, auto flip on/off, auto spread, backward navigation, session/checkpoint, rotation và audio multi-part.
- Không sửa marker manager, local file picker, R2 catalog, API, Worker, database, OTA endpoint hoặc signing key trong đợt này.

### Trạng thái bàn giao
- Đợt 1: source change đã ghi vào beta; chờ test/regression và device acceptance.
- Đợt 2: chưa bắt đầu.


### Progress note — Library catalog retry
- [x] Keep the header Library action enabled when catalog is empty/unavailable; clicking it retries `loadR2Catalog()`.
- [x] Deduplicate concurrent catalog loads with `state.catalogLoading`.
- [x] Add source-level assertions in `tests/modules.test.js`.
- [ ] Run full regression after the Reader/Menu and R2-only cleanup batch; no test pass is claimed yet.
- Code commits: `4539b6f79ac8635b0a8133955cb78febf752ebcd` and `cbf7515e6f3de252dbc4ff474608c023f75806b6`.


### Progress note — Marker manager removal
- [x] Remove marker manager modal, manual pin/edit/delete, clear, import/export and local-folder marker write path from APK UI/runtime.
- [x] Keep R2 marker companion URL read path and timestamp normalization/page/audio synchronization.
- [x] Keep existing localStorage marker data as a read-only legacy fallback; do not delete stored user data.
- [x] Update source contract assertions to reject marker manager UI and client import/export.
- [ ] Run full regression after local-file removal and menu cleanup; no test pass is claimed yet.
- Remaining caller audit: ensure only R2 companion and legacy localStorage read paths assign `state.pageTimestamps`; inspect CSS and native file access before deleting local-file flows.


### Progress note — R2-only media loading
- [x] Remove local file/folder picker UI and event handlers.
- [x] Remove PDF/audio Blob loaders, local folder scanning, drag-and-drop and IndexedDB media-library API usage.
- [x] Keep existing IndexedDB database untouched; no clear/delete/migration.
- [x] Keep R2 PDF/audio URL loading, remote catalog, session/checkpoint and marker read-only paths.
- [ ] Run full regression and fix any missing DOM or source contract issues.
- [ ] Audit and remove dead CSS only after selector usage review.

### Auto page-turn policy correction — 2026-10-31

- Removed the obsolete `Tự lật trang` menu toggle and all DOM/event wiring; automatic page-turn remains built-in and always on.
- Legacy session values `pageTurnMode: off` are normalized to `next` during both checkpoint and session restoration.
- Regression assertions added in `[test]` commit `8dae0179bc64c98bd91ddc7e3b5635d70dc540a0`.
- CI status is still unconfirmed; do not build APK until the test result is available.
