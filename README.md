# Read Along Android

Ứng dụng đọc sách PDF kết hợp âm thanh MP3, hỗ trợ tải danh mục sách công khai từ Cloudflare R2.

## Tính năng

- Tải danh mục sách từ Cloudflare R2; PDF và MP3 cần Internet.
- Hiển thị vị trí trang hiện tại / tổng số trang.
- Điều khiển bằng remote Android TV: Play/Pause, trái/phải đổi trang, lên/xuống tua âm thanh 5 giây, và phím Rewind/Fast Forward nếu thiết bị phát ra key event tương ứng.
- Giao diện gọn dùng chung cho APK và Web Local.

## Build và phát hành

Workflow không tự chạy khi push hoặc sửa mã nguồn. Để tạo bản build, mở **Actions → Build and Release Read Along → Run workflow** trên nhánh `main`, rồi nhập:
1. **Version**: ví dụ `1.0.1` (mỗi bản phải dùng số mới).
2. **Changelog**: nội dung thay đổi của bản phát hành.

Nếu build thành công, workflow tạo GitHub Release có tag `vVERSION` và đính kèm:
- `read-along-vVERSION-android-debug.apk`
- `read-along-vVERSION-web-local.zip`

Tên artifact cũng có số phiên bản. APK hiện là bản debug để cài thử, chưa phải APK ký phát hành cho Google Play. Không chạy lại cùng số phiên bản nếu release đã tồn tại.

## Bảo mật R2

Không nhúng khóa bí mật vào APK. Danh mục và tệp ở URL công khai có thể được truy cập bởi bất kỳ ai biết URL; không lưu dữ liệu riêng tư trong bucket công khai.
