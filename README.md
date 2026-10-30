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
- `modules/remote-sync.js`: hỗ trợ đồng bộ/điều khiển liên quan remote.
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
