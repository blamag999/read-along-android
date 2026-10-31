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
| R1 | Kiểm kê API, URL, nguồn dữ liệu và caller; chuẩn hóa contract | Gần hoàn tất — API review và CI pass; marker envelope v1 draft tương thích legacy; runtime revision policy còn pending |
| R2 | Remote Config + Data Client + fallback offline | Đang thực hiện — static config v1, CI pass và Pages deploy pass; direct URL response verification còn pending |
| R3 | Analytics ingest/D1 và sự kiện thời lượng đọc/nghe | Chưa bắt đầu |
| R4 | Admin Analytics dashboard ngày/tuần/tháng/năm | Chưa bắt đầu |
| R5 | Nội dung trợ giúp/thông báo và theme/config độc lập | Chưa bắt đầu |
| R6 | Regression, Android device validation và đóng băng APK Core | Chưa bắt đầu |

## Tiến độ hiện tại — 2026-10-31
- R0 hoàn tất: quyết định A–E đã được người dùng xác nhận và kế hoạch tổng đã được hợp nhất.
- R1 gần hoàn tất: API overlap review đã xong và không gộp các endpoint có mục đích/quyền khác nhau. Marker source precedence được ghi tại [marker-and-api-review.md](./docs/architecture/marker-and-api-review.md). Schema marker envelope v1 đã draft, vẫn chấp nhận legacy map và empty map; runtime revision policy/migration còn pending.
- CI [41159251879](https://github.com/blamag999/read-along-android/actions/runs/41159251879) pass sau khi sửa regression test.
- Inventory endpoint/caller và schema đã được CI kiểm tra tại [41158627378](https://github.com/blamag999/read-along-android/actions/runs/41158627378).
- R2 bắt đầu ở lớp dữ liệu: thêm `admin/public/remote-config.json` v1 với feature/default maps rỗng; không thay đổi hành vi app.
- CI [41159337454](https://github.com/blamag999/read-along-android/actions/runs/41159337454) pass; Pages deployment [8892563b](https://8892563b.read-along-admin.pages.dev) success cho commit `ed083c0c5fe0774c1e4ff69922b5139950491ffe`. Chưa xác minh được HTTP body của URL public.
- Chưa thay đổi mã APK runtime, chưa build APK, chưa promote stable.
- Usage API hiện có chỉ ghi lượt mở/installation và thống kê inventory; analytics thời lượng đọc/nghe vẫn cần thiết kế và triển khai.
- CI cần được xác nhận trên commit mới nhất; không lấy run cũ làm bằng chứng cho HEAD mới.

## Quy tắc cập nhật
Sau mỗi đợt: ghi commit SHA, thay đổi, test/CI, Pages deployment nếu có, APK build nếu có, kết quả thiết bị và mục còn pending. Không đánh dấu hoàn tất nếu thiếu bằng chứng.
