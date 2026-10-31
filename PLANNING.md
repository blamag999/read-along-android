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


## Kho sách offline 1 GB và tinh gọn header — 2026-10-31

- [ ] Audit luồng tải PDF/audio từ R2, cơ chế IndexedDB/native storage và quy trình OTA/cache cleanup trước khi chọn nơi lưu bền vững.
- [ ] Thiết kế kho offline riêng trong vùng dữ liệu ứng dụng (không dùng cacheDir/Service Worker Cache); giới hạn tổng dung lượng 1 GiB, quản lý LRU theo lần truy cập gần nhất.
- [ ] Lưu trọn bộ theo book ID: PDF, toàn bộ audio và JSON marker; tải vào vùng tạm rồi xác minh hoàn tất trước khi đưa vào thư viện offline.
- [ ] Không xóa sách đang mở/phát; khi thiếu dung lượng, xóa trọn bộ sách ít dùng gần nhất cho đến khi đủ chỗ; xử lý sách đơn lẻ lớn hơn giới hạn và lỗi thiếu dung lượng rõ ràng.
- [ ] Đảm bảo kho offline, marker và metadata tồn tại qua OTA update, không bị xóa cùng cache shell; chỉ dọn cache tạm/service worker cũ.
- [ ] Bổ sung kiểm thử quota, LRU, tải dở, file thiếu, app restart, OTA update và mở sách offline; build một APK sau full regression.
- [x] Tinh gọn toàn bộ header thành hai action: Thư viện sách và Menu; chuyển điều khiển vừa trang/hai trang/zoom, ẩn-hiện khu vực chọn file và quản lý mốc thời gian vào Menu; bỏ nút Đóng sách riêng.
- [x] CI full regression, Pages Functions syntax, isolation và release channel validation; signed APK build/verification, OTA R2 publish, workflow artifacts và GitHub Release đều success tại [run 41205868772](https://github.com/blamag999/read-along-android/actions/runs/41205868772), commit `61b383329ac4a6d5fcc1b3e54f3e5249390e50c2`.
- [ ] Kiểm tra trên điện thoại cảm ứng: nút Thư viện có icon + nhãn + badge số lượng, hai nút header không chồng lấn ở portrait (kể cả chiều rộng 320 px); Menu còn đủ thao tác; Android Back vẫn đóng sách và lưu phiên đọc.
- Không đánh dấu kho offline là implemented cho đến khi có code, test và xác minh đường dẫn lưu trữ native thực tế.


### Header thư viện portrait — code đã cập nhật, chờ CI/device
- [x] Tách icon, nhãn và badge số lượng thành các phần tử rõ ràng; badge luôn hiện số kể cả 0.
- [x] Sửa CSS responsive ở cuối stylesheet để ưu tiên một hàng và giữ nhãn Thư viện trên màn hình dọc nhỏ.
- [x] Thêm regression assertions cho cấu trúc nút, nhãn portrait và accessible count.
- [ ] Chờ CI/build APK theo commit chốt; kiểm tra thực tế trên thiết bị dọc 320–600 px.


### Kết quả CI/build header Thư viện — 2026-10-31

- Commit chốt `61b383329ac4a6d5fcc1b3e54f3e5249390e50c2`; workflow [41205868772](https://github.com/blamag999/read-along-android/actions/runs/41205868772) hoàn tất success.
- Full regression, Pages syntax/isolation, signed APK build + verification, OTA R2 publication và GitHub Release đều thành công. Không còn pending CI/build cho batch header.
- Chỉ còn nghiệm thu thiết bị thật ở portrait 320–600 px và kiểm tra thao tác Thư viện/Menu/Android Back. Không promote `main` trước khi người dùng xác nhận.
- Badge lấy từ `state.playlist.length`, không đại diện số blob offline trong IndexedDB.
