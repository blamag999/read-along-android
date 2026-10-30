# Read Along Android

Ứng dụng Android/Web hỗ trợ đọc tài liệu PDF đồng bộ với lời đọc âm thanh (MP3), có điều khiển cảm ứng, bàn phím/remote và cập nhật APK OTA.

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

- Tiếp tục sửa lỗi và thử nghiệm trên **`beta`** theo yêu cầu dự án.
- Chỉ đưa bản đã kiểm thử lên **`main`** khi người dùng yêu cầu phát hành stable hoặc xác nhận rõ việc promote.
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

## 8. Truy cập thư viện trực tuyến từ R2 riêng tư

- Nhánh phát triển beta chuyển sang lấy danh sách sách từ Pages Functions của dự án `private-comic-reader`; không còn đọc `books.json` hoặc URL `r2.dev`.
- API production: `https://private-comic-reader.pages.dev/api/readalong/books` và `/api/readalong/file?key=...` (Pages Functions đã deploy thành công).
- Pages Functions dùng R2 binding `READALONG` trỏ tới Bucket `my-audio-book`; APK không chứa R2 Access Key/Secret. Binding này tách biệt với `COMICS`/`my-manga` đang phục vụ dự án đọc truyện online.
- API ghép các file PDF, MP3 và JSON theo tên cơ sở, giữ riêng nhóm theo thư mục; hậu tố `part/pt/side/disc` được dùng để ghép nhiều phần audio.
- API file hỗ trợ `HEAD`, HTTP Range (206/416), MIME PDF/MP3/JSON và CORS cho luồng đọc đa nguồn.
- Đây là phương án A: API đọc công khai. Bucket R2 có thể đặt Private, nhưng bất kỳ ai biết endpoint vẫn có thể đọc/tải nội dung qua API. Không coi đây là DRM hoặc cơ chế xác thực người dùng.
- Backend đã merge PR [#11](https://github.com/blamag999/private-comic-reader/pull/11) và Cloudflare Pages Production deploy thành công. Bucket `my-audio-book` đã tắt public `r2.dev`; binding `READALONG` hoạt động qua Pages Functions. API runtime và APK vẫn cần kiểm thử đầu-cuối trên thiết bị trước khi coi là hoàn tất.
- Khi kiểm thử: xác nhận danh sách mới tự xuất hiện sau khi thêm file vào R2; PDF tải theo Range; MP3 tua được; JSON marker nạp được; không có request nào tới `.r2.dev`.
- Kiểm kê Bucket tại thời điểm 2026-10-30: 184 object, 84 cặp PDF+MP3 (9 cặp có JSON). `Oliver_Company` hiện chỉ có PDF và hai track `.wma`; API hiện chỉ ghép `.mp3`, vì vậy sách này chưa xuất hiện trong bộ lọc đủ PDF+MP3. `books.json` cũ vẫn nằm trên Bucket nhưng API không đọc file này.
