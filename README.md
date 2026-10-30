# Read Along Android

Ứng dụng Android/Web hỗ trợ đọc tài liệu PDF đồng bộ với lời đọc âm thanh (MP3, M4A/M4B, AAC, WAV, OGG/Opus, FLAC), có điều khiển cảm ứng, bàn phím/remote và cập nhật APK OTA.

- Repository: https://github.com/blamag999/read-along-android
- Nhánh phát triển/kiểm thử: `beta`
- Nhánh phát hành stable: `main`
- Workflow build/phát hành: [Build and Release Read Along](https://github.com/blamag999/read-along-android/actions/workflows/build-android-apk.yml)
- Issues đang theo dõi: [Issues](https://github.com/blamag999/read-along-android/issues)

> **Tài liệu bàn giao cho các phiên làm việc tiếp theo.** Khi mở chat mới, hãy đọc README này trước, kiểm tra trạng thái thực tế của nhánh, workflow, releases và issues trên GitHub rồi mới thay đổi mã. Trạng thái bên dưới là ghi nhận tại ngày 2026-10-29; GitHub hiện tại luôn là nguồn xác thực sau cùng.

## 1. Tình trạng hiện tại

- Đã đưa nội dung từ `beta` lên `main` để chuẩn bị phát hành stable; PR [#14](https://github.com/blamag999/read-along-android/pull/14) đã được đóng/merge.
- Đã khôi phục luồng OTA trong ứng dụng và các thành phần Android hỗ trợ cài APK: `native/android/ApkUpdaterPlugin.java`, `native/android/file_paths.xml` và cấu hình tương ứng trong `.github/workflows/build-android-apk.yml`.
- Luồng OTA dự kiến: ứng dụng tìm bản cập nhật trên GitHub Releases → tải APK từ URL GitHub HTTPS → lưu tạm trong cache ứng dụng → mở trình cài đặt Android thông qua `FileProvider`. Android vẫn có thể yêu cầu cấp quyền “Install unknown apps” và xác nhận cài đặt; đây **không phải** cài đặt im lặng.
- Workflow có bước xác minh chữ ký APK bằng `apksigner` và tạo tệp SHA-256 đi kèm.
- **Chưa xác nhận** rằng bản stable mới đã build/phát hành thành công hoặc OTA đã được kiểm thử trên thiết bị thật. Cần kiểm tra Actions và Releases trước khi thông báo có APK mới.
- Chưa có xác nhận đã chạy toàn bộ test suite, build Android sạch hoặc kiểm thử thiết bị sau lần khôi phục OTA.
- Cảnh báo Google Play Protect có thể vẫn xuất hiện. Không tìm cách né/bỏ qua cơ chế bảo vệ; cần kiểm tra chữ ký, tính nhất quán khóa ký, nguồn tải, quy trình phát hành và gửi mẫu cho Google nếu nghi phát hiện nhầm.

## 2. Quy ước làm việc với Git

### Nhánh

- Nhánh tích hợp `beta`; nhánh phát hành stable `main`.
- Mỗi đợt sửa/kiểm thử dùng duy nhất nhánh tạm **`testing`** được tạo từ `beta`; gom mọi chỉnh sửa liên quan vào nhánh này.
- Khi hoàn tất, tạo một PR `testing` → `beta`; kiểm thử tiếp và sửa bổ sung ngay trên `testing`. Sau khi PR được merge, xóa nhánh `testing`.
- Không tạo các nhánh `feature/*` hoặc `fix/*` riêng lẻ cho từng lỗi trong cùng đợt.
- Chỉ đưa bản đã kiểm thử từ `beta` lên **`main`** khi người dùng yêu cầu phát hành stable hoặc xác nhận rõ việc promote.
- Không tự ý force-push, viết lại lịch sử, xóa nhánh, xóa secrets hoặc thay đổi khóa ký.
- Trước khi sửa: đọc README và workflow liên quan, kiểm tra commit mới nhất của `beta`/`main`, xem diff và các issue mở.
- Sau khi sửa: chạy kiểm tra phù hợp, đọc lại diff, commit với thông điệp mô tả đúng thay đổi và báo rõ phần nào đã/chưa được kiểm thử.
- Không tuyên bố build, cài đặt, OTA hoặc phát hành thành công nếu chưa có kết quả thực tế từ workflow/thiết bị.

### Build và phát hành

1. Mở [GitHub Actions workflow](https://github.com/blamag999/read-along-android/actions/workflows/build-android-apk.yml).
2. Chọn **Run workflow**, chọn đúng branch.
3. Dùng kênh `beta` cho kiểm thử; chỉ dùng `stable` trên `main`.
4. Chờ workflow hoàn tất và kiểm tra log build, xác minh chữ ký, SHA-256 và artifact/Release.
5. Với stable, kiểm tra Release mới, APK và checksum thực tế trước khi chia sẻ cho người dùng.
6. Không tự đoán số phiên bản tiếp theo; đọc logic workflow và danh sách Releases tại thời điểm chạy.

APK cập nhật đè phải dùng **cùng khóa ký** với ứng dụng đã cài. Không đưa keystore, mật khẩu, token hay secrets vào README, issue, log hoặc mã nguồn. Sao lưu khóa ký an toàn.

## 3. OTA: các điểm cần duy trì và kiểm thử

- Giữ nút/luồng cập nhật trong ứng dụng: tìm bản mới trên GitHub Releases và tải/cài APK bằng plugin Android.
- Chỉ chấp nhận URL HTTPS từ GitHub theo kiểm tra trong plugin; không nới kiểm tra URL nếu chưa đánh giá rủi ro.
- Không xóa dữ liệu đọc của người dùng khi dọn cache phục vụ cập nhật. Chỉ xóa đúng cache web được chủ đích dùng cho thao tác cập nhật.
- Đảm bảo `ApkUpdaterPlugin` được đăng ký trong bridge Capacitor, `FileProvider` và `file_paths.xml` khớp nhau, quyền manifest tối thiểu và workflow luôn copy các tệp native vào dự án Android trước khi build.
- Kiểm thử tối thiểu: bản cập nhật có sẵn; không có bản mới; tải lỗi/mạng yếu; APK tải về không hợp lệ; cùng chữ ký; phiên bản cũ hơn; Android từ chối quyền cài; người dùng hủy trình cài đặt; dữ liệu đọc vẫn còn sau cập nhật.
- Kiểm tra APK cài mới và cập nhật đè trên ít nhất một thiết bị Android thực. Ghi rõ phiên bản Android, phiên bản app, kết quả và log khi báo hoàn tất.
- Không tuyên bố có thể vượt Play Protect hoặc bỏ xác nhận của Android. Với phân phối ngoài Play Store, ưu tiên tính minh bạch, chữ ký nhất quán, checksum và quy trình phát hành đáng tin cậy.

## 4. Vấn đề cần xử lý trước tiên

### P0 — Admin dashboard và OTA Beta (đợt sửa 2026-10-30)

- Admin production ghi nhận lỗi JavaScript `Cannot read properties of null (reading 'addEventListener')` tại `admin/public/admin.js`: mã đăng ký sự kiện cho `scanAgainBtn` trong khi HTML không còn phần tử này. Lỗi làm dừng phần còn lại của script, khiến dashboard không tải thống kê và điều hướng `#manage` không hoạt động.
- Đã định nghĩa `clearReadAlongWebCachesForUpdate()` trong `app.js`: chỉ xóa cache shell có tiền tố `read-along-shell-*` và unregister service worker có đúng URL `sw.js` của Read Along. Nếu dọn cache gặp lỗi, OTA vẫn tiếp tục tải APK và ghi cảnh báo; không xóa localStorage/sessionStorage hoặc dữ liệu người dùng.
- Đã xóa toàn bộ tham chiếu tới `scanAgainBtn` không còn tồn tại trong HTML; Admin chỉ còn dùng `scanBtn` để chạy kiểm tra thư viện.
- Bổ sung sửa thống kê Admin (2026-10-31): API ưu tiên manifest `books.json` hợp lệ; nếu file thiếu, rỗng hoặc JSON không đọc được thì đếm trực tiếp R2 (PDF, audio, JSON đồng bộ), không còn âm thầm hiển thị toàn bộ số liệu bằng 0. Khi dùng fallback, số đầu sách được tính theo số PDF và API trả thêm `source: "r2_inventory"`; nếu việc quét R2 thất bại thì trả lỗi để dashboard không giả lập số 0. Đã thêm regression test cho nhánh fallback.
- Đã thêm regression tests cho DOM Admin và OTA, đồng thời đưa `npm test` vào workflow CI. CI của PR #31 đã chạy thành công.


### P0 — Đồng bộ trang PDF và audio

Các log chẩn đoán cho thấy có trường hợp trang tự lùi về trang trước khi người dùng bấm chuyển trang, tua audio hoặc khi xoay màn hình. Một số log có các sự kiện `page.turn.auto` quay lại trang cũ, `page.replay` và marker không tồn tại/không hợp lệ. Không xem vấn đề là đã giải quyết chỉ vì đã có thay đổi trong `modules/page-sync.js`.

- Issue [#12](https://github.com/blamag999/read-along-android/issues/12)
- Issue [#13](https://github.com/blamag999/read-along-android/issues/13)

Hướng điều tra:
1. Tái hiện với cùng PDF/MP3 và tệp timestamp/marker gốc nếu có thể.
2. Kiểm tra marker thiếu, trùng, sai thứ tự, bằng 0 hoặc nằm ngoài thời lượng audio; không để marker lỗi kích hoạt tua về đầu hoặc trang trước.
3. Phân biệt sự kiện chuyển trang thủ công, tua audio, tự đồng bộ theo marker và đổi orientation. Tránh callback cũ ghi đè trạng thái mới.
4. Khi xoay màn hình, giữ nguyên `currentTime`, trạng thái phát/tạm dừng và trang hiện tại; việc render lại PDF không được tự phát lại marker của trang.
5. Thêm test hồi quy cho seek tiến/lùi, next/previous page, marker thiếu, marker trùng, marker 0 giây, audio metadata/load lại và portrait ↔ landscape.
6. Kiểm tra log chẩn đoán mới sau mỗi bản beta. Chỉ đóng issue khi tái hiện đã hết và có xác nhận kiểm thử.

### P1 — Xác minh quy trình OTA và stable

- Chạy workflow trên `main` với channel `stable` khi sẵn sàng.
- Kiểm tra kết quả build, chữ ký, SHA-256, Release notes và artifact tải được.
- Cài đè từ một bản đang dùng bằng OTA và xác minh dữ liệu đọc còn nguyên.
- Nếu Play Protect cảnh báo, kiểm tra nguồn gốc APK và chứng thư ký, sau đó gửi mẫu/giải trình với Google; không đổi cách phân phối để lẩn tránh cảnh báo.

### P2 — Giao diện và Android TV

- Tiếp tục kiểm tra vùng an toàn phía trên, đặc biệt thiết bị có camera/notch và status bar.
- Duy trì bố cục các nút điều khiển cân đối, dễ thao tác cảm ứng và remote/keyboard trên Android TV.
- Kiểm tra portrait/landscape, màn hình nhỏ và màn hình rộng; không để thay đổi giao diện làm gián đoạn playback.

### P3 — Chẩn đoán và bảo trì

- Giữ quy trình gửi log qua GitHub Issues đơn giản, không bắt buộc đăng nhập nếu thiết kế hiện tại cho phép, và không đưa token bí mật vào client.
- Log cần có phiên bản ứng dụng, loại thiết bị/nền tảng, thời điểm, sự kiện trang/audio và lỗi liên quan; hạn chế dữ liệu nhạy cảm.
- Giữ các module tách biệt (đồng bộ trang, bố cục playlist, remote sync, diagnostics) và bổ sung test đơn vị trước khi thêm phụ thuộc mới.
- Ưu tiên sửa lỗi và độ tin cậy trước khi thêm tính năng lớn.

## 5. Kiểm tra tối thiểu trước khi hoàn thành một thay đổi

- [ ] Xác định branch/commit đích và đọc mã liên quan.
- [ ] Thêm hoặc cập nhật test cho lỗi đã sửa.
- [ ] Chạy `npm test` nếu môi trường có đủ dependencies; ghi rõ nếu chưa chạy.
- [ ] Kiểm tra cú pháp JS cho tệp đã sửa và kiểm tra diff.
- [ ] Nếu thay đổi Android/OTA: build APK sạch qua workflow và kiểm tra log.
- [ ] Nếu thay đổi đồng bộ audio: kiểm thử PDF/MP3 thực tế, seek, đổi trang và xoay màn hình.
- [ ] Báo cáo commit, kiểm thử đã chạy, kiểm thử còn thiếu và hướng dẫn kiểm tra tiếp theo.

## 6. Ghi chú kỹ thuật

- `app.js`: luồng giao diện và logic chính phía web, bao gồm đồng bộ đọc.
- `modules/page-sync.js`: logic đồng bộ trang và marker; ưu tiên xem khi trang tự nhảy/lùi.
- `modules/playlist-layout.js`: bố cục danh sách/playlist.
- `modules/remote-sync.js`: đồng bộ marker JSON tuỳ chọn trong thư mục `sync_data/` của chính repository Read Along.
- `modules/diagnostics.js`: thu thập log chẩn đoán.
- `native/android/ApkUpdaterPlugin.java`: cầu nối Android để tải APK và mở trình cài đặt.
- `native/android/file_paths.xml`: phạm vi file được chia sẻ qua Android `FileProvider`.
- `.github/workflows/build-android-apk.yml`: build, ký/xác minh APK, checksum và phát hành.
- `tests/modules.test.js`: test module (xác nhận script/dependencies hiện tại trước khi chạy).

Nếu đường dẫn hoặc kiến trúc đã thay đổi, hãy xác minh trực tiếp trên nhánh hiện tại thay vì dựa hoàn toàn vào danh sách này.

## 7. Quy tắc an toàn

- Không commit token, mật khẩu, keystore, khóa ký, dữ liệu cá nhân hoặc tài liệu riêng tư.
- Không xóa/chỉnh sửa GitHub Secrets, khóa ký hoặc cấu hình release nếu chưa có yêu cầu rõ ràng.
- Không đóng issue chỉ để làm sạch danh sách; cập nhật issue với nguyên nhân, commit và kết quả test.
- Khi chưa chắc về hành vi của workflow hoặc plugin, đọc mã nguồn và log trước khi sửa.

## 8. Danh mục sách Read Along bằng books.json

- Nguồn dữ liệu duy nhất của thư viện Read Along là `books.json` tại thư mục gốc Bucket R2 `my-audio-book`.
- Manifest dùng đúng cấu trúc: `{ "books": [{ "id", "title", "pdf", "audios", "sync" }] }`; `pdf` là URL PDF, `audios` là mảng URL audio (có thể nhiều track), `sync` là URL JSON hoặc `null`.
- Admin có nút **Tạo / cập nhật books.json** trong tab **Kiểm tra lỗi**. Nút nạp bản mẫu `admin/public/books.json` (83 sách theo file được cung cấp), kiểm tra host R2, phần mở rộng và sự tồn tại của mọi PDF/audio/sync, rồi mới ghi manifest vào R2. Nếu có tệp thiếu, thao tác dừng và báo danh sách; không ghi đè manifest hiện tại.
- APK đọc trực tiếp `books.json` từ public R2 bucket riêng của Read Along khi mở **Truyện trực tuyến**; không dùng API danh mục trung gian.
- Manifest có cấu trúc `{ "books": [{ "id", "title", "pdf", "audios", "sync" }] }`; `pdf`, từng phần tử `audios` và `sync` là URL HTTPS công khai trên R2. Ứng dụng hỗ trợ dạng URL chuỗi trong manifest và giữ hỗ trợ tương thích dạng object `{ "url", "name" }`.
- Ứng dụng tải PDF/audio/JSON đồng bộ trực tiếp từ URL trong manifest. R2 CORS hiện cho phép origin `*` với GET/HEAD; nếu thay đổi CORS, cần giữ quyền GET để WebView/Capacitor đọc `books.json` và các tệp công khai.
- Cập nhật danh mục bằng cách publish `admin/public/books.json` lên root bucket R2; không cần build APK mới chỉ để thay đổi danh sách truyện.
- Để bổ sung hoặc sửa sách: cập nhật file mẫu `admin/public/books.json` theo cùng cấu trúc, commit lên nhánh `beta`, sau đó vào Admin và bấm **Tạo / cập nhật books.json**. Nút xác minh trước khi ghi đè file trên R2.

## 8. Read Along Admin — web quản trị thư viện

Đã phát triển khu vực quản trị độc lập trong cùng repository, tại thư mục `admin/`. Đây là website riêng, không nằm trong APK, dùng Pages Functions và các tài nguyên Cloudflare dành riêng cho Read Along.

### Kiến trúc và ranh giới bảo mật

- Mã nguồn: `admin/` trong repository `blamag999/read-along-android`.
- Cloudflare Pages project riêng: `read-along-admin`, URL production `https://read-along-admin.pages.dev`.
- Pages root directory: `admin`; output directory: `public`; không cần build command.
- Pages project dùng nhánh `beta` làm production trong giai đoạn thử nghiệm; nhánh `main` và `feature/*` là preview. Path filter Pages hiện để `*` nhằm bảo đảm deploy; một số commit khác trong repo có thể cũng kích hoạt Pages build riêng, nhưng không kích hoạt build APK.
- Production bindings: `READALONG` → R2 bucket `my-audio-book`; `DB` → D1 database `read-along-admin-db`.
- D1 ID: `6a316068-ef8e-4eaf-af4b-536b4fd7b74c`.
- Preview deployment cố ý không có D1/R2 binding và không có OTP secret, tránh thao tác lên dữ liệu thật.
- Admin chỉ dùng R2 binding `READALONG`, D1 riêng `read-along-admin-db`, cùng secret/session riêng của Read Along Admin.
- Secret bắt buộc ở Production: `READALONG_TOTP_SECRET` (Base32 mới, tối thiểu 160 bit). Chưa cấu hình secret; phải thêm trong Cloudflare Pages > Settings > Variables and Secrets trước khi đăng nhập. Không commit secret vào GitHub và không thêm vào Preview.

### API và chức năng hiện có

- API namespace riêng: `/api/readalong-admin/*`.
- OTP 6 số TOTP (HMAC-SHA1, chu kỳ 30 giây, chấp nhận lệch ±1 bước), chống dùng lại cùng OTP.
- Session random 256-bit, chỉ lưu SHA-256 hash trong D1; cookie HttpOnly/Secure/SameSite=Strict, hết hạn sau 30 phút.
- Rate limit đăng nhập: tối đa 5 lần/IP hash trong 15 phút.
- Cùng origin cho mọi request thay đổi dữ liệu; có CSP, anti-framing headers và audit log.
- Duyệt thư mục/tệp, tạo thư mục, upload multipart theo chunk, đổi tên/di chuyển file, xóa file và xóa thư mục (tối đa 5.000 object/lần).
- Định dạng: PDF, JSON, MP3, M4A/M4B, AAC, WAV, OGG/OGA, Opus, FLAC, WMA. WMA chỉ lưu trữ; playback Android WebView không được đảm bảo.

### Workflow riêng

- `.github/workflows/check-readalong-admin.yml` kiểm tra cú pháp JS và ranh giới bảo mật cho thay đổi trong `admin/**`.
- Workflow APK `build-android-apk.yml` không được thay đổi và vẫn chỉ chạy thủ công; thêm Admin không tự build APK.
- Admin chưa được promote lên `main`; tiếp tục review/kiểm thử trên `beta` trước.

### Việc còn lại

1. Thêm secret `READALONG_TOTP_SECRET` ở Production Pages environment bằng seed Base32 mới và đăng ký seed đó vào Authenticator.
2. Merge PR Admin vào `beta`, chờ Pages production deploy và kiểm tra đăng nhập/session/OTP.
3. Kiểm thử upload file lớn, folder, rename/move, xóa file/thư mục và audit log trên dữ liệu thử nghiệm.
4. Chỉ sau khi kiểm thử ổn định mới đổi Pages production branch sang `main` khi promote stable.
5. Chuyển đổi audio (FFmpeg) chưa được triển khai. Không chạy FFmpeg dài trong Pages Functions; cần chọn runtime xử lý riêng hoặc thử nghiệm FFmpeg WASM phía trình duyệt, giữ file gốc và xác minh output trước khi publish.


## 8. Read Along Admin dashboard and app usage metrics (2026-10-30)

- Admin home page: https://read-along-admin.pages.dev. It is public and shows catalog counts plus app usage metrics; the advanced manager is opened with **Quản lý nâng cao** and requires OTP.
- The management view is on the same canonical hostname and uses the existing HttpOnly Secure session cookie. A refresh at the `#manage` route revalidates the session; the public home page does not prompt for OTP.
- The Debug tab and manual log export were removed from the Admin UI. Browser/API telemetry and server exceptions are recorded automatically in the dedicated Admin D1. See `admin/README.md` for the schema, privacy model and investigation notes.
- `modules/diagnostics.js` sends anonymous usage events to the Admin Pages endpoint. It uses a random local installation ID and session launch ID; the server stores SHA-256 hashes only. No device serial, advertising ID, email, phone, OTP, cookie or access token is collected.
- The dashboard reports total app launches, launches in the last 30 days, installations recorded, and installations active in the last 30 days. Counts start only after an updated app opens and reports telemetry; old APKs and historical installations cannot be backfilled. Clearing app data/reinstalling can create a new installation ID.
- The Admin D1 tables are in the dedicated `read-along-admin-db` only. Never apply Admin migrations to another database.
- To package the Android telemetry change, open **Actions → Build and Release Read Along → Run workflow**, select branch `beta` and channel `beta`. The workflow is manual (`workflow_dispatch`); no APK build or Release is created automatically by merging PR #30.


### Khôi phục tải danh mục trực tiếp (2026-10-31)

- Đã bỏ phụ thuộc API `/api/readalong/books` trong ứng dụng Android/Web. `loadR2Catalog()` tải trực tiếp `books.json` từ public R2 URL.
- Parser xử lý đúng manifest hiện tại: `pdf` là chuỗi URL, `audios` là mảng URL, `sync` là URL hoặc `null`; vẫn chấp nhận dạng object `{ url, name }` để tương thích.
- Việc tải nội dung PDF/audio và JSON marker cũng dùng trực tiếp URL từ manifest. Không thay đổi API proxy phía backend hoặc các chức năng khác.
- R2 CORS được kiểm tra hiện cho phép `GET`/`HEAD` từ mọi origin; nếu chính sách CORS thay đổi, tải trực tiếp từ Capacitor WebView có thể bị chặn.

## 9. Ranh giới API và tài nguyên — nguyên tắc độc lập

Mọi kết nối mạng của ứng dụng phải phục vụ trực tiếp chức năng Read Along và thuộc một trong các nguồn được quản lý cùng repository này. Không gọi API, proxy, database, session hoặc token của ứng dụng/dự án khác.

| Chức năng | Nguồn duy nhất | Vai trò |
|---|---|---|
| Danh sách truyện | Public R2 `books.json` của Read Along | Manifest thư viện |
| PDF/audio/JSON marker | URL trong `books.json`, cùng R2 bucket | Nội dung đọc và đồng bộ |
| OTA | GitHub Releases của `blamag999/read-along-android` | Metadata release và APK |
| Thống kê sử dụng | Read Along Admin Pages `/api/readalong-admin/usage/track` | Ghi nhận launch/install ẩn danh |
| Quản trị thư viện | Read Along Admin Pages `/api/readalong-admin/*` | Duyệt và quản lý R2; xác thực Admin riêng |
| Gửi log có đồng ý | Read Along Diagnostics Worker `/submit` | Tạo GitHub Issue trong chính repository này |
| PDF.js | Bản PDF.js đã ghim phiên bản trên CDN được khai báo trong `sw.js` | Thư viện render PDF, không phải API nghiệp vụ |

Telemetry và gửi báo cáo không trùng chức năng: telemetry chỉ ghi số liệu tổng hợp vào Admin D1; diagnostics chỉ nhận báo cáo người dùng đồng ý gửi và tạo Issue trong repository. Không dùng một endpoint để thay thế endpoint còn lại.

Quy tắc bảo trì:
- Không thêm API proxy cho danh sách/nội dung khi R2 public URL đã đáp ứng được.
- Không thêm domain dịch vụ khác vào CORS allowlist.
- Mỗi endpoint phải có một mục đích duy nhất, được ghi trong README và có test kiểm tra ranh giới.
- Không thay đổi đồng thời luồng đọc PDF/audio, đồng bộ trang và OTA trong một đợt sửa nếu không có nguyên nhân bắt buộc.
- Mọi thay đổi cấu trúc phải có test hồi quy trước; giữ API/contract cũ cho tới khi đã xác nhận không còn caller.

### Đồng bộ mốc đọc qua GitHub — phạm vi repository

- Tất cả thao tác đọc/ghi marker JSON của `modules/remote-sync.js` dùng duy nhất repository `blamag999/read-along-android`, thư mục `sync_data/`, nhánh `main`; không gọi repository `pdf-audio-sync` hoặc repository khác.
- Cần GitHub fine-grained token được cấp riêng cho `read-along-android` với quyền **Contents: Read and write**. Token chỉ lưu trong `sessionStorage` của phiên hiện tại và không được commit vào mã nguồn.
- Các tệp trong repository công khai có thể được đọc công khai. Chỉ đồng bộ marker JSON không chứa thông tin cá nhân; không lưu PDF, audio, tên người dùng, email hoặc dữ liệu riêng tư vào `sync_data/`.
- Token cũ từng dùng cho repository `pdf-audio-sync` không còn được sử dụng; ứng dụng xóa key session cũ và yêu cầu nhập token có quyền trên repository Read Along.
- Nguồn marker ưu tiên vẫn là file JSON người dùng chọn hoặc URL `sync` trong `books.json`; GitHub sync là bản đồng bộ bổ sung theo thao tác/thiết lập của người dùng. Nếu cần thay đổi thứ tự ưu tiên, phải bổ sung test hồi quy trước.


## 10. Roadmap cập nhật — 2026-10-31

### Đợt sửa hiện tại: xác nhận seek lùi trước khi đồng bộ trang

- Đã rà soát `app.js`, `modules/page-sync.js`, `tests/modules.test.js` và workflow OTA trên nhánh `beta`.
- Phát hiện quyền đồng bộ trang lùi trước đây được bật ngay ở sự kiện `seeking`, trong khi thao tác tua có thể chưa hoàn tất. Điều này tạo cửa sổ race condition để một `timeupdate` trung gian sử dụng trạng thái tua lùi chưa được xác nhận.
- Đã thay đổi để ghi nhận ý định seek lùi, bỏ qua đồng bộ trang trong khi `audio.seeking` còn đúng, và chỉ cấp quyền đồng bộ lùi sau `seeked` nếu thời gian thực tế gần đích seek.
- Đã tách phép xác nhận thành helper thuần `ReadAlongPageSync.isConfirmedBackwardSeek()` và thêm test cho seek lùi hợp lệ, seek chưa tới đích và seek tiến.
- Các commit đã ghi trên `beta`: `321db030`, `104eb47`, `9399e5a`, `2c7950f`.
- **Chưa xác nhận test/build:** phiên làm việc này chưa chạy được `npm test` hoặc build APK trong runner cục bộ; chưa có workflow run gắn với commit mới. Không coi lỗi PDF/audio đã được khắc phục hoàn toàn cho tới khi CI và kiểm thử thiết bị xác nhận.

### Thứ tự roadmap tiếp theo

1. **P0 — Kiểm chứng đồng bộ audio:** chạy `npm test` và `npm run check:js`; sau đó kiểm thử thiết bị với seek lùi/tiến, lật trang thủ công liên tiếp, marker thiếu/trùng/0 giây, audio nhiều phần và xoay portrait ↔ landscape. Theo dõi Issue #12 và #13; không đóng khi chưa có log xác nhận.
2. **P0 — Loại bỏ race condition render:** rà soát `pageNumPending`, `pageNumPendingSyncAudio` và vòng đời `renderCurrentSpread()`. Bổ sung test để render cũ không ghi đè trang mới, resize không tua audio và thay đổi tài liệu không dùng callback của PDF cũ.
3. **P1 — Gia cố OTA:** xác minh redirect cuối cùng vẫn thuộc GitHub Releases/host tải GitHub được cho phép; đối chiếu SHA-256 nếu manifest/checksum có sẵn; kiểm tra APK tải về, versionCode và chứng thư ký trước khi mở trình cài đặt. Giữ nguyên xác nhận cài đặt của Android.
4. **P1 — Kiểm thử phát hành:** chạy workflow thủ công trên `beta`; xác minh artifact, `apksigner`, SHA-256 và Release. Cài đè OTA trên thiết bị thật, kiểm tra dữ liệu đọc còn nguyên. Chỉ promote `main` khi có xác nhận riêng.
5. **P2 — UI/Android TV:** kiểm tra safe area/notch/status bar, bố cục nút điều khiển, D-pad/remote và các kích thước màn hình sau khi P0 ổn định.
6. **P3 — Bảo trì:** giữ log có cấu trúc và không chứa nội dung sách/URL riêng tư; mỗi lỗi có test tái hiện; tránh thêm API/proxy/phụ thuộc nếu luồng hiện tại đã đáp ứng.

### Quy tắc nghiệm thu đợt này

- Không xem việc commit code hoặc thêm unit test là bằng chứng lỗi đã hết.
- Báo riêng kết quả unit test, CI, build APK và kiểm thử thiết bị; không gộp thành một trạng thái “đã kiểm thử”.
- Chỉ phát hành stable khi beta vượt qua các bài test hồi quy, workflow ký APK thành công và người dùng xác nhận promote.


## 11. Catalog/playlist tách khỏi app.js — 2026-10-31

- Đã thêm `modules/catalog-playlist.js` cho logic thuần: chuẩn hóa ID/tên sách, chuyển manifest thành story model, gom PDF/audio/JSON từ thư mục, sắp xếp part audio và lọc/tìm kiếm playlist.
- Module không thao tác DOM, localStorage, network, PDF.js hoặc audio element. `app.js` vẫn điều phối giao diện, trạng thái playlist và việc tải dữ liệu; chỉ ủy quyền các phép biến đổi dữ liệu cho module mới.
- API: `window.ReadAlongCatalogPlaylist`. Script được nạp trước `app.js`, nằm trong app shell của service worker và được kiểm tra cú pháp bởi CI.
- `tests/catalog.test.js` kiểm tra manifest, từ chối asset ngoài R2, nhóm file cục bộ, JSON marker mồ côi, thứ tự audio part, filter và tìm kiếm.
- Chưa đánh dấu hoàn tất cho tới khi CI xác nhận. Chưa build APK hoặc kiểm thử thiết bị ở bước này.

### Roadmap cấu trúc tiếp theo

1. Tách DOM renderer playlist thành module UI riêng, giữ nguyên class/ARIA/keyboard interactions và test bằng DOM giả lập hoặc fixture.
2. Tách tương tác tìm kiếm, filter, pagination và favorite thành controller riêng; không đổi key localStorage hoặc schema playlist.
3. Bổ sung test DOM cho mở sách, chọn audio part, đánh dấu yêu thích, tìm kiếm và pagination.
4. Sau khi catalog/playlist ổn định mới xem xét tách quản lý PDF/audio. Không thay đổi các module page-sync, OTA hoặc diagnostics trong cùng đợt.


## 12. Tối ưu kiểm thử CI — 2026-10-31

- Workflow `.github/workflows/check-readalong-admin.yml` dùng `concurrency` theo PR/branch với `cancel-in-progress: true`: lượt CI cũ bị hủy khi có commit mới thay thế, tránh chờ kết quả đã lỗi thời.
- Đã bỏ các bước `node --check` riêng cho `admin/public/admin.js` và `modules/catalog-playlist.js` vì `npm test` đã chạy `npm run check:js` và bao gồm cả hai tệp. Giữ nguyên toàn bộ test suite, kiểm tra cú pháp Pages Functions và kiểm tra isolation.
- Giữ một job CI thay vì tách nhiều runner: test hiện tại chạy nhanh, việc khởi tạo nhiều runner có thể tốn thêm thời gian hơn phần test tiết kiệm được. Chỉ tách song song khi số lượng/thời gian test thực tế tăng đáng kể.
- Path filters tiếp tục giới hạn workflow vào mã nguồn, module, test, package và workflow; thay đổi tài liệu đơn thuần không kích hoạt CI này.
- **Chưa có kết quả CI sau thay đổi tại thời điểm ghi chú.** Commit workflow: `3e7874193c7f0c94d4ed59bbd07b7b5c21d76572`. Cần kiểm tra run mới của PR #37 trước khi đánh dấu tối ưu CI hoàn tất.
- Quy ước kiểm thử: phân biệt rõ unit/regression, CI, build APK và kiểm thử thiết bị. Không build APK cho thay đổi tài liệu hoặc logic thuần đã được test đầy đủ; vẫn phải build/kiểm tra Android khi thay đổi native, Capacitor, WebView, audio/PDF, lưu trữ hoặc OTA.


### Cập nhật xử lý CI #41102931325 — 2026-10-31

- Đã đọc log chi tiết. Workflow không thất bại do concurrency hoặc do test logic mới; thất bại tại assertion cũ trong `tests/catalog.test.js:10`: test tìm `typeof value === 'string'` và `item.sync || item.json` trong `app.js`, trong khi các biểu thức này đã chuyển sang `modules/catalog-playlist.js`.
- Đã sửa test để kiểm tra hai contract ở đúng module sở hữu logic mới; kiểm tra app vẫn tải manifest trực tiếp từ URL R2 và không phụ thuộc Pages API.
- Commit sửa test: `79d28e4c98e6fd485c4a0f10f40274299da18a65`.
- Trạng thái: **đã sửa nguyên nhân được xác định; chờ CI mới chạy trên head cập nhật**. Chưa tuyên bố test pass, chưa build APK/kiểm thử thiết bị.


- Bổ sung tối ưu sau khi rà soát danh sách Actions: bỏ trigger `push` cho nhánh `testing` vì nhánh này luôn được xác minh qua sự kiện `pull_request` tới `beta`. Trước đó cùng một commit tạo cả lượt push và pull_request, gây chạy trùng. Các trigger push cho `beta`, `main`, `feature/**` vẫn giữ nguyên; PR validation vẫn áp dụng cho `testing`.
- Commit loại bỏ trigger trùng: `7ea251933731494fa8311d58b379626e5a87e1a9`. Chờ workflow mới xác nhận.


- Rà soát tiếp test mới phát hiện assertion khóa sách cũng phải giữ đúng hành vi cũ: `getBookUniqueKey('X22_The-Book.PDF')` trả `_the_book` theo implementation trước khi tách module. Đã sửa kỳ vọng test để bảo vệ tính tương thích, không thay đổi thuật toán/key lưu trữ. Commit: `45f555357b7158b373fafda632f61ec242a569fa`.
- CI phải chạy lại trên head mới; các run trước commit này không được dùng làm bằng chứng pass.


### Giao ban tiếp theo — xác minh PR #37 và CI (2026-10-31)

- Đã xác nhận PR [#37](https://github.com/blamag999/read-along-android/pull/37) vẫn mở ở trạng thái Draft, base `beta`, head `testing`; head hiện tại trước vòng kiểm tra mới là `6d6f75bf6015cc71b3e86b9ac83003415b181a6c`. Chưa merge và chưa thay đổi `main`.
- Đã review toàn bộ diff 9 tệp: module catalog là IIFE thuần, không truy cập DOM/storage/network; app nạp module trước `app.js`; service worker precache module; `prepare:web` đã có cơ chế copy thư mục modules; URL manifest vẫn đọc trực tiếp từ R2 và giữ kiểm tra host.
- Run [#41103722981](https://github.com/blamag999/read-along-android/actions/runs/41103722981) chạy trên đúng head nói trên. Log cho thấy các bước `npm test` (module, catalog 83 sách, API isolation, Admin DOM/stats, OTA cache cleanup, check:js), Pages Functions syntax và isolation đều đã đi qua; tuy nhiên GitHub API vẫn trả trạng thái job/run `in_progress`, chưa có `completed/success`. Vì vậy ghi nhận **các lệnh kiểm thử xuất log thành công; trạng thái tổng CI chưa chốt**, không đánh dấu CI pass.
- Để tránh kết luận dựa trên run có trạng thái treo, bổ sung test input không hợp lệ/thiếu dependency cho catalog rồi kích hoạt một lượt PR CI mới. Commit cập nhật test tiếp theo sẽ là head cần nghiệm thu; run #41103722981 không được dùng thay thế cho run của head mới.
- Chưa build APK beta, chưa có artifact/Release mới và chưa kiểm thử WebView/Android thật. Không tạo Release trước khi PR được tích hợp vào `beta` và workflow build beta hoàn tất.
- Trạng thái công việc: **Review diff: Completed**; **Unit/regression log: Passed trong log của run cũ, chờ xác nhận lại trên head mới**; **CI tổng: In Progress/Unconfirmed**; **Android build/device test: Pending**; **Merge PR #37: Pending CI**.

#### Việc tiếp theo

1. Chờ workflow PR mới kết thúc; đọc lại job conclusion và toàn bộ step summary/log. Nếu fail, sửa nguyên nhân trên `testing`, bổ sung test, cập nhật giao ban và chờ run mới.
2. Khi CI success, chuyển PR #37 khỏi Draft/hoàn tất review rồi merge `testing` → `beta`; xác minh SHA của `beta` sau merge.
3. Chạy thủ công workflow **Build and Release Read Along** trên branch `beta`, channel `beta`; kiểm tra version, APK signature, SHA-256, artifact và GitHub prerelease.
4. Kiểm thử APK trên thiết bị Android/WebView: truyện trực tuyến từ R2, playlist local, search/filter/favorites/pagination, chọn audio part, mở PDF/audio và dữ liệu đọc hiện có. Chỉ kết luận beta sẵn sàng sau khi có kết quả thực tế.
5. Cập nhật README với commit, run URL, release version, checksum, kết quả thiết bị và issue còn tồn tại. Không promote `main` trong đợt beta này.


### Trạng thái giao ban bổ sung — 2026-10-31

- Run #41103722981 hiện được workflow-run API trả `completed / success`; các log đã đọc trước đó cho thấy toàn bộ test suite, JS syntax, Pages Functions syntax và isolation đều qua. Tuy nhiên job/check-run API có lúc vẫn trả dữ liệu `in_progress`; ghi nhận đây là trạng thái API không nhất quán và không dùng run này để xác nhận phần test mới được thêm sau đó.
- Commit test mới nhất `84bc5536cebca283c537349e76ea47aaa9728366` đã tạo PR run #41104249478. Tại lần kiểm tra gần nhất, run đang `queued`, chưa có job log/conclusion. Cần tiếp tục kiểm tra run này cho đến khi kết thúc; không merge PR dựa trên run cũ.
- PR #37 vẫn Draft/open, base `beta`; chưa merge. Chưa chạy workflow build-release beta, chưa có APK/artifact/Release và chưa kiểm thử thiết bị.
- Trạng thái hiện tại: **CI của code/test cũ: Success theo workflow-run API**; **CI của test mới: Queued/Pending**; **Build beta: Pending**; **Device verification: Pending**; **Merge PR: Pending**.


## 13. Điều tra Issue #38 — danh sách truyện không tải được (2026-10-31)

- Issue mới nhất: [#38 — Diagnostics 1.3.3](https://github.com/blamag999/read-along-android/issues/38). Log ghi nhận `app.started`, `viewport.change`, native `Activity.onCreate` và `WebView.bridgeReady`; không có sự kiện lỗi JS. Diagnostics hiện chưa ghi sự kiện riêng cho lần fetch catalog, vì vậy log không chứng minh được request `books.json` đã chạy hay thất bại.
- Đã đối chiếu mã nguồn release `v1.3.3` (tag trỏ commit `17783ca6b6985f33847e575678d201c510c83ae5`) và `app.js` trên `main`: ứng dụng tải trực tiếp `https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/books.json` khi `DOMContentLoaded`. Các listener của `btnAutoFlipToggle` đã có guard; kiểm tra DOM tĩnh không tìm thấy phần tử sự kiện bị thiếu nào khác không có guard, nên không xác nhận giả thuyết crash init từ ID này.
- Đã kiểm tra Cloudflare bucket `my-audio-book`: bucket tồn tại; object `books.json` tồn tại (28,606 bytes, content type JSON, cache-control `no-store`); CORS cho phép origin `*` với `GET/HEAD`. Manifest mẫu trong repository có 83 sách và URL asset dùng đúng hostname R2.
- **Nguyên nhân gốc được xác nhận ở cấu hình public access:** Managed R2 `r2.dev` domain của bucket đang `enabled: false`, dù app gọi URL trên hostname này. Vì vậy public endpoint không được bật và client không thể tải manifest qua URL hiện tại. CORS không tự bật public access.
- Cần người quản lý xác nhận trước khi thay đổi: bật managed `r2.dev` domain sẽ làm **toàn bộ object trong bucket `my-audio-book` có thể truy cập công khai** qua domain đó, không chỉ riêng `books.json`. Nội dung truyện/PDF/audio hiện được thiết kế để app đọc công khai, nhưng cần xác nhận không có object riêng tư trong bucket. API Cloudflare hỗ trợ `PUT /accounts/{account_id}/r2/buckets/{bucket_name}/domains/managed` với `{ enabled: true }`; chưa thực hiện thay đổi này.
- Trạng thái: **Issue review: Completed**; **R2 object/manifest/CORS inspection: Completed**; **Root cause: Confirmed — r2.dev public domain disabled**; **Enable public access: Blocked pending explicit confirmation of whole-bucket exposure**; **App retry/telemetry improvements: Pending**; **APK/device verification: Pending**.

### Hướng xử lý tiếp theo

1. Xác nhận bucket không chứa nội dung cần giữ riêng tư và cho phép bật public access toàn bucket; hoặc chọn custom domain/public delivery khác nếu không muốn dùng `r2.dev`.
2. Sau khi endpoint public được bật, kiểm tra GET `books.json` qua public URL và kiểm tra CORS thực tế từ WebView/origin của app.
3. Bổ sung test DOM khởi tạo và telemetry catalog tối thiểu: `catalog.load.start`, `catalog.load.success` (số sách), `catalog.load.failure` (HTTP status/error name), không ghi URL/token hay dữ liệu nhạy cảm.
4. Bảo đảm lỗi tải catalog không làm hỏng khởi tạo app; hiển thị nút thử lại và giữ khả năng chọn thư mục local.
5. Chỉ sau khi xác nhận endpoint hoạt động mới build beta mới, kiểm tra truyện trực tuyến trên thiết bị Android và cập nhật Issue #38.


### Cập nhật xác nhận và thao tác public access (2026-10-31)

- Người dùng đã **xác nhận rõ ràng** cho phép bật public access toàn bucket `my-audio-book` qua managed `r2.dev` domain, hiểu rằng mọi object trong bucket sẽ có thể truy cập công khai.
- Đã thử gửi yêu cầu Cloudflare API cập nhật `enabled: true`, nhưng công cụ quản trị từ chối thao tác ở lớp kiểm tra an toàn trước khi trả kết quả API. Yêu cầu đọc lại trạng thái sau đó cũng bị chặn; vì vậy **không có bằng chứng thay đổi đã được áp dụng** và không được coi public access đã bật.
- Trạng thái: **User approval: Received**; **Cloudflare mutation: Blocked by tool safety gate**; **Public endpoint verification: Pending**; **App/CI/APK: Not changed**.
- Bước tiếp: bật R2.dev subdomain thủ công trong Cloudflare Dashboard tại R2 Object Storage → bucket `my-audio-book` → Settings → Public access / R2.dev subdomain → Allow Access (hoặc Enable). Sau khi lưu, kiểm tra GET URL `https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/books.json` trả HTTP 200 và JSON có mảng `books` không rỗng. Chỉ tiếp tục sửa app/build beta sau khi kiểm chứng endpoint.

### Cập nhật sau khi người dùng bật R2.dev (2026-10-31)

- Người dùng thông báo đã bật managed R2.dev public access cho bucket `my-audio-book` sau khi đã xác nhận việc công khai toàn bộ bucket.
- Đã thử mở public manifest URL `https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/books.json` qua công cụ web nhưng công cụ không truy cập được URL; môi trường kiểm tra trực tiếp cũng không phân giải được hostname. Vì vậy **chưa xác minh độc lập HTTP 200, JSON payload hoặc số lượng sách**. Không coi việc bật cấu hình là bằng chứng endpoint đã phục vụ thành công.
- Bản manifest trong repo vẫn chứa 83 mục sách và các URL PDF/audio trỏ về cùng R2 hostname; đây chỉ là dữ liệu trong repository, không xác nhận trạng thái endpoint production.
- PR [#37](https://github.com/blamag999/read-along-android/pull/37) vẫn mở/Draft, base `beta`, head `testing`; chưa merge. Workflow PR run [#41104249478](https://github.com/blamag999/read-along-android/actions/runs/41104249478) kết thúc `cancelled`, không phải CI pass. Nhánh `main` và `beta` chưa thay đổi trong bước này.
- Trạng thái: **User reports R2.dev enabled: Received**; **Public endpoint verification: Blocked/unconfirmed**; **PR #37 CI: Pending (latest inspected run cancelled)**; **App changes/APK/device test: Not performed**.

#### Bước tiếp theo

1. Mở trực tiếp URL manifest ở trên trên trình duyệt. Xác nhận trang trả JSON (không phải Access denied/404) và có mảng `books` không rỗng; nếu vẫn lỗi, gửi lại mã lỗi hoặc ảnh chụp màn hình.
2. Khi endpoint được xác nhận, tiếp tục kiểm tra CORS từ WebView/origin của app và xem lại luồng `loadR2Catalog()`; bổ sung telemetry/retry tối thiểu nếu cần.
3. Chạy lại CI cho đúng HEAD hiện tại của PR #37, xử lý mọi lỗi trước khi merge vào `beta`. Chỉ build APK beta sau khi PR được tích hợp và CI xanh; kiểm thử thiết bị thật vẫn là bước bắt buộc.

### Xác nhận manifest truy cập được từ trình duyệt (2026-10-31)

- Người dùng xác nhận đã mở URL public `books.json` và nhìn thấy nội dung JSON. Ghi nhận **public manifest accessible in user's browser**; công cụ kiểm tra độc lập vẫn không truy cập được hostname R2 nên chưa tự xác nhận HTTP status/body.
- Đã rà soát `app.js` trên `testing`: app tự gọi `loadR2Catalog()` khi `DOMContentLoaded`; nút `btnLoadR2Catalog` cũng gọi lại hàm này. Hàm fetch trực tiếp URL R2 với `cache: 'no-store'`, kiểm tra `response.ok`, parse JSON, map bằng `ReadAlongCatalogPlaylist.mapRemoteCatalog()`, sau đó cập nhật và render playlist. Khi lỗi, app hiển thị alert; finally luôn tắt loading và khôi phục nút.
- Kiểm tra DOM mapping: chỉ phát hiện `btnAutoFlipToggle` không có trong HTML; listener tương ứng đã có guard. Không phát hiện listener nào khác đang truy cập DOM ID không tồn tại mà thiếu guard. Chưa có căn cứ để sửa init flow hoặc thay đổi app code trước khi kiểm thử trên thiết bị.
- CI PR #37 mới nhất tại head `c88c8e09fd8eb36fa4c92cfaea20e71e4b9b6153`: run [#41105388028](https://github.com/blamag999/read-along-android/actions/runs/41105388028) đang `queued`; chưa có conclusion. PR vẫn Draft/open, base `beta`, chưa merge.
- Trạng thái: **User browser JSON check: Confirmed**; **App code path review: Completed**; **DOM event guard review: Completed**; **PR CI: Queued/Pending**; **Android app runtime test: Pending user device verification**; **APK build: Not started**.

#### Bước tiếp theo

1. Trên thiết bị đang cài Read Along, force stop ứng dụng rồi mở lại để chạy lại yêu cầu catalog tự động; nếu chưa hiện danh sách, mở chọn nguồn truyện và bấm `Truyện trực tuyến` để gọi lại fetch thủ công.
2. Báo kết quả: số mục sách hiển thị hay nội dung lỗi cụ thể. Nếu vẫn lỗi, gửi log chẩn đoán mới sau lần thử này để phân biệt CORS/WebView, HTTP status, JSON mapping hay lỗi render.
3. Chờ run #41105388028 kết thúc; chỉ sau CI success mới chuyển PR khỏi Draft/merge vào `beta`. Không build APK hoặc phát hành trước bước này và trước khi xác định cần thay đổi app hay không.
