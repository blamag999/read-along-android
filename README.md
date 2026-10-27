# Read Along

Ứng dụng hỗ trợ đọc tài liệu PDF kết hợp lời đọc bằng âm thanh.

## Tính năng chính

- Mở nội dung từ danh mục trực tuyến được cấu hình hoặc từ tệp trên thiết bị.
- Theo dõi trang đọc cùng âm thanh, đổi trang và điều chỉnh tốc độ phát.
- Hỗ trợ điều khiển bằng bàn phím và remote trên thiết bị tương thích.
- Lưu và đồng bộ mốc thời gian đọc khi người dùng chủ động cấu hình tính năng này.

## Hướng dẫn sử dụng

1. Mở danh sách nội dung hoặc chọn tệp/thư mục trên thiết bị.
2. Chọn tập cần đọc và nhấn phát.
3. Dùng các nút điều khiển để đổi trang, tua âm thanh và điều chỉnh tốc độ.
4. Có thể tạo hoặc nhập tệp mốc thời gian để đồng bộ trang với âm thanh.

## Chạy bản Web Local

Trên Windows, giải nén gói Web Local, cài Python 3 nếu máy chưa có, sau đó chạy tệp khởi động đi kèm. Giữ cửa sổ dòng lệnh mở trong khi sử dụng. Một số nội dung trực tuyến cần kết nối Internet.

## Quy trình nhánh và phát hành

- Mọi thay đổi mới phải được phát triển trên nhánh riêng (ví dụ `fix/...`, `feat/...` hoặc `chore/...`), không sửa trực tiếp `main`.
- Bản thử nghiệm được build từ nhánh làm việc với kênh **Beta**. Beta được gắn nhãn rõ trong tên Release và số phiên bản, ví dụ `1.1.0-beta.1`, `1.1.0-beta.2`; GitHub Release được đánh dấu **Pre-release**.
- Chỉ sau khi lỗi đã được xử lý và kiểm tra ổn định, mới merge Pull Request vào `main` và tạo bản **Official/Stable**. Bản stable đầu tiên theo quy ước mới là `1.1.0`; sau đó tăng minor theo từng bản ổn định tiếp theo (`1.2.0`, `1.3.0`, ...).
- Khi bắt đầu kiểm thử cho phiên bản stable tiếp theo, beta sẽ theo phiên bản đích đó, ví dụ `1.2.0-beta.1`. Workflow chỉ cho phép kênh stable khi chạy trên `main`.
- Vào **Actions → Build and Release Read Along → Run workflow**, chọn nhánh muốn build và chọn `beta` hoặc `stable`. Kênh beta là lựa chọn mặc định.

Sử dụng quy trình build/phát hành được cung cấp trong kho mã. Thông tin xác thực và khóa ký phải được cấu hình trong kho lưu trữ bí mật của hệ thống build; không đưa token, mật khẩu, khóa ký hoặc tệp cá nhân vào mã nguồn.

Các bản Android cập nhật đè cần được ký bằng cùng khóa phát hành. Hãy sao lưu khóa ký an toàn và giới hạn quyền truy cập.

Để giảm rủi ro bảo mật khi phân phối APK ngoài Google Play, ứng dụng chỉ mở trang GitHub Releases để người dùng tự tải và xác nhận cài đặt qua Android; ứng dụng không tự tải rồi khởi chạy trình cài đặt APK. Mỗi bản phát hành kèm tệp SHA-256 để kiểm tra tính toàn vẹn. Chữ ký hợp lệ và SHA-256 khớp không đảm bảo Play Protect sẽ không cảnh báo; nếu vẫn bị phân loại nhầm là có hại, cần gửi APK và thông tin phát hành để Google xem xét.

## Lưu ý bảo mật

- Không commit dữ liệu cá nhân, thông tin xác thực hoặc nội dung chưa được phép công khai.
- Các tệp và danh mục đặt tại nguồn công khai có thể được người khác truy cập.
- Không nhúng khóa bí mật vào ứng dụng.