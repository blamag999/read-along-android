# Read Along — Kế hoạch phát triển độc lập

> Tài liệu kế hoạch, chưa đồng nghĩa với việc đã được phê duyệt triển khai. Các hạng mục cần xác nhận sẽ chỉ được thực hiện sau khi người dùng chấp thuận. Mặc định phát triển trên nhánh `beta`; không promote `main` nếu chưa có yêu cầu.

## 1. Module thống kê độc lập (Analytics) — ĐÃ ĐỀ XUẤT, CHỜ TRIỂN KHAI

### Mục tiêu

Bổ sung thống kê thời gian đọc/nghe theo ngày, tuần, tháng, năm và biểu đồ trên trang chủ Admin mà không phải build APK mỗi khi thay đổi giao diện, biểu đồ, chỉ số hoặc cách tổng hợp.

### Kiến trúc

- APK Read Along chỉ gửi các sự kiện hoạt động tối thiểu cần thiết qua API.
- Analytics API trên Cloudflare Worker/Pages Functions tiếp nhận, kiểm tra, chống trùng và tổng hợp dữ liệu.
- Cloudflare D1 lưu phiên đọc/nghe và bảng tổng hợp theo ngày.
- Admin Pages có module giao diện độc lập: JavaScript, CSS, biểu đồ, bộ lọc và báo cáo.
- Phần giao diện/tổng hợp Analytics không được nhúng vào APK.

### Dữ liệu và chỉ số

1. Thời gian đọc PDF và nghe audio: tổng thời lượng, số phiên, trung bình theo phiên/ngày.
2. Tổng hợp theo ngày, tuần, tháng, năm.
3. Theo sách: lượt mở, thời gian đọc/nghe, sách được sử dụng nhiều.
4. Theo audio: thời lượng nghe, số phiên hoàn tất/gián đoạn.
5. Vận hành: thiết bị hoạt động, lượt mở, phiên bản app, OTA và lỗi tải/đồng bộ.

### Quy tắc ghi nhận

- Chỉ tính thời gian khi nội dung đang thực sự được đọc hoặc audio đang phát.
- Heartbeat dự kiến khoảng 60 giây; kết thúc/tạm dừng phiên khi app xuống nền, reader không hoạt động hoặc audio dừng.
- Mỗi phiên/sự kiện có ID và số thứ tự để chống ghi trùng.
- Giới hạn thời lượng hợp lệ cho mỗi heartbeat; không suy diễn thời gian bị mất mạng hoặc ứng dụng treo.
- Dùng mã cài đặt ẩn danh; không thu nội dung sách, tên tệp, URL tài nguyên hay thông tin cá nhân.
- Không thể khôi phục chính xác thời gian đọc trong quá khứ từ số lượt mở hiện có.

### Các giai đoạn

- A1: thiết kế schema D1, API, chính sách lưu trữ và mô hình sự kiện.
- A2: bổ sung cơ chế thu thập tối thiểu trong APK (một lần cập nhật APK có kiểm soát).
- A3: triển khai dashboard Admin với biểu đồ ngày/tuần/tháng/năm và thống kê theo sách.
- A4: mở rộng audio, thiết bị, OTA, lỗi và tối ưu tổng hợp/truy vấn.

### Điều kiện nghiệm thu

- Sự kiện trùng, đến sai thứ tự, mất mạng, app chạy nền và audio tạm dừng không làm sai số thời gian.
- Dữ liệu ẩn danh, tối thiểu và có giới hạn lưu trữ.
- Có thể thay đổi biểu đồ, chỉ số, bộ lọc và báo cáo mà không build APK.
- Có kiểm thử API, D1 và luồng hoạt động thực tế trên Android trước khi công bố số liệu.

Trạng thái: **Chờ xác nhận triển khai**.

## 2. Nguyên tắc giảm số lần build APK

- Giữ APK là một **ứng dụng lõi ổn định**: PDF renderer, audio playback, đồng bộ trang/audio, vòng đời Android/WebView, lưu/khôi phục phiên đọc, quyền và native bridge, OTA installer.
- Chỉ đưa ra ngoài APK những phần có thể biểu diễn bằng dữ liệu/cấu hình/API hoặc giao diện quản trị độc lập.
- Ưu tiên cấu hình từ xa có schema/version, giá trị mặc định đóng gói trong APK, cache và fallback offline. Cấu hình từ xa không được phép vô hiệu hóa bảo vệ an toàn, thay đổi quyền, URL allowlist hoặc hành vi native.
- Không tải và thực thi JavaScript tùy ý từ máy chủ như cơ chế cập nhật tính năng chung. Việc đó tạo một kênh phát hành mã thực thi ngoài quy trình ký APK, làm tăng rủi ro bảo mật, tương thích và chẩn đoán.
- Mọi thay đổi mã lõi, UI tương tác mới, thư viện native, plugin Capacitor, quyền Android hoặc WebView bridge vẫn cần build APK/OTA.
- Dữ liệu sách, marker, nội dung văn bản, metadata, cấu hình hiển thị có schema ổn định và nội dung báo cáo có thể cập nhật độc lập.
- Mỗi API từ xa phải có version, timeout, retry có giới hạn, cache, kiểm tra schema, allowlist host và fallback về hành vi mặc định trong APK.

Trạng thái: **Nguyên tắc nền tảng; chi tiết triển khai chờ người dùng xác nhận sau khi review kiến trúc**.
