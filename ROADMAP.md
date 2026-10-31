# Read Along — Roadmap

> Roadmap triển khai theo mục tiêu APK Core ổn định, dịch vụ và dữ liệu độc lập. Chi tiết kỹ thuật, schema và checklist nằm trong [PLANNING.md](./PLANNING.md).

## Mục tiêu sản phẩm
Giảm số lần build APK bằng cách tách catalog, marker, cấu hình, analytics, diagnostics, nội dung trợ giúp và quản trị sang dữ liệu/API độc lập; giữ PDF/audio/native lifecycle trong APK.

## Nguyên tắc đã xác nhận
- Đóng băng PDF Viewer, Audio Player, đồng bộ trang/audio và native bridge sau nghiệm thu; chỉ sửa khi lỗi nặng, bảo mật hoặc tương thích.
- Tách Analytics, Diagnostics backend, Catalog Admin và nội dung quản trị khỏi APK.
- Remote Config có schema/version, cache và offline fallback.
- Không tải/thực thi JavaScript tùy ý từ máy chủ.
- Chỉ build APK khi cần đổi mã đóng gói, UI tương tác, native plugin/permission, bảo mật hoặc sửa lỗi lõi.

## Các mốc

| Mốc | Nội dung | Trạng thái |
|---|---|---|
| R0 | Hợp nhất Analytics plan và APK decoupling thành master planning | <badge>Hoàn tất</badge> |
| R1 | Kiểm kê API, URL, nguồn dữ liệu và caller; chuẩn hóa contract | Đang thực hiện — inventory + JSON Schema v1 + structural tests; CI/compatibility và marker precedence còn pending |
| R2 | Remote Config + Data Client + fallback offline | Chưa bắt đầu |
| R3 | Analytics ingest/D1 và sự kiện thời lượng đọc/nghe | Chưa bắt đầu |
| R4 | Admin Analytics dashboard ngày/tuần/tháng/năm | Chưa bắt đầu |
| R5 | Nội dung trợ giúp/thông báo và theme/config độc lập | Chưa bắt đầu |
| R6 | Regression, Android device validation và đóng băng APK Core | Chưa bắt đầu |

## Tiến độ hiện tại — 2026-10-31
- R0 hoàn tất: quyết định A–E đã được người dùng xác nhận và kế hoạch tổng đã được hợp nhất.
- R1 đang thực hiện: đã kiểm kê endpoint/caller, tạo JSON Schema v1 cho catalog/marker/config/analytics và thêm structural tests vào `npm test`. Còn pending CI, kiểm tra catalog thực tế và marker precedence.
- Chưa thay đổi mã runtime, chưa build APK, chưa promote stable.
- Usage API hiện có chỉ ghi lượt mở/installation và thống kê inventory; analytics thời lượng đọc/nghe vẫn cần thiết kế và triển khai.
- CI cần được xác nhận trên commit mới nhất; không lấy run cũ làm bằng chứng cho HEAD mới.

## Quy tắc cập nhật
Sau mỗi đợt: ghi commit SHA, thay đổi, test/CI, Pages deployment nếu có, APK build nếu có, kết quả thiết bị và mục còn pending. Không đánh dấu hoàn tất nếu thiếu bằng chứng.
