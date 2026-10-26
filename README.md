# Read Along Android

Ứng dụng đọc sách PDF kết hợp âm thanh MP3, hỗ trợ tải danh mục sách công khai từ Cloudflare R2.

## Tính năng

- Tải danh mục sách từ Cloudflare R2; PDF và MP3 cần Internet.
- Hiển thị vị trí trang hiện tại / tổng số trang.
- Điều khiển bằng remote Android TV: Play/Pause, trái/phải đổi trang, lên/xuống tua âm thanh 5 giây, và phím Rewind/Fast Forward nếu thiết bị phát ra key event tương ứng.
- Giao diện gọn dùng chung cho APK và Web Local.
- Trong APK có mục **Kiểm tra cập nhật** để kiểm tra GitHub Releases, xem changelog, tải APK qua cầu nối Android native và mở trình cài đặt hệ thống. Người dùng tự xác nhận cài đặt; cập nhật đè yêu cầu APK cùng khóa ký.
- Quy trình build tạo APK release có chữ ký cố định. Trước lần build đầu tiên, phải thiết lập 4 GitHub Actions Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

### Thiết lập khóa ký một lần (Windows)

1. Mở PowerShell trong máy có JDK và chạy:
   ```powershell
   keytool -genkeypair -v -keystore read-along-release.jks -alias readalong -keyalg RSA -keysize 2048 -validity 10000
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\read-along-release.jks")) | Set-Clipboard
   ```
   Hãy giữ an toàn tệp `read-along-release.jks`, mật khẩu keystore, alias và mật khẩu key. Không commit tệp keystore vào Git.
2. Trong GitHub repo, mở **Settings → Secrets and variables → Actions → New repository secret** và tạo:
   - `ANDROID_KEYSTORE_BASE64`: nội dung Base64 vừa sao chép.
   - `ANDROID_KEYSTORE_PASSWORD`: mật khẩu keystore.
   - `ANDROID_KEY_ALIAS`: `readalong` (hoặc alias bạn đã chọn).
   - `ANDROID_KEY_PASSWORD`: mật khẩu key.
3. Từ đó mọi bản build phải dùng đúng keystore này. Nếu mất khóa hoặc đổi khóa, các bản đã cài có thể không cập nhật đè được.

Khi người dùng đồng ý cập nhật, APK tải xuống bằng cầu nối Android native rồi mở trình cài đặt hệ thống. Android có thể yêu cầu cho phép cài ứng dụng từ nguồn này và luôn yêu cầu người dùng xác nhận cài đặt.

## Build và phát hành

Workflow không tự chạy khi push hoặc sửa mã nguồn. Để tạo bản build, mở **Actions → Build and Release Read Along → Run workflow** trên nhánh `main` và chạy workflow; không cần nhập version hoặc changelog.

Workflow tự tăng số phiên bản vá dựa trên Release gần nhất (ví dụ `1.0.2` → `1.0.3`) và tạo changelog từ các commit kể từ Release trước. Nếu chưa có Release, phiên bản đầu tiên là `1.0.0`.

Nếu build thành công, workflow tạo GitHub Release có tag `vVERSION` và đính kèm:
- `read-along-vVERSION-android-debug.apk`
- `read-along-vVERSION-web-local.zip`

Tên artifact cũng có số phiên bản. APK hiện là bản debug để cài thử, chưa phải APK ký phát hành cho Google Play. Không chạy lại cùng số phiên bản nếu release đã tồn tại.

## Bảo mật R2

Không nhúng khóa bí mật vào APK. Danh mục và tệp ở URL công khai có thể được truy cập bởi bất kỳ ai biết URL; không lưu dữ liệu riêng tư trong bucket công khai.
