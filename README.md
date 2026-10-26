# Read Along Android

Ứng dụng Android đọc sách PDF kết hợp MP3, dựa trên mã nguồn nhánh `feature/r2-catalog` của repository gốc.

## Hành vi

- Tự tải danh mục sách từ Cloudflare R2 khi mở ứng dụng.
- URL danh mục được đóng gói sẵn:
- Không yêu cầu đăng nhập hoặc nhập URL thủ công.
- PDF và MP3 vẫn được tải từ các URL trong danh mục; cần kết nối Internet.
- Không nhúng khóa bí mật R2 vào APK.

## Quyền truy cập

Ứng dụng không xác thực người dùng. Danh mục và mọi tệp được phục vụ qua URL công khai có thể được truy cập bởi bất kỳ ai biết URL. Không đưa dữ liệu riêng tư vào bucket công khai.

## Build APK

Mỗi lần push lên nhánh `feature/android-r2`, GitHub Actions sẽ đóng gói APK debug. Có thể chạy thủ công tại tab **Actions** bằng workflow **Build Android APK**. Sau khi chạy thành công, tải `app-debug.apk` trong phần Artifacts của lần chạy.

APK này là bản debug để cài trực tiếp và kiểm thử, chưa phải bản phát hành ký số cho Google Play.
