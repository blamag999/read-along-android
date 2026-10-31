# Read Along Android — Mở rộng Core bằng contract dữ liệu

> Kiến trúc mục tiêu đã được người dùng xác nhận: APK Core ổn định, tập trung tải PDF/audio từ cloud và trải nghiệm đọc/nghe. Thay đổi nội dung và metadata được thực hiện qua catalog/Admin khi contract hiện tại hỗ trợ; capability mới cần thay đổi runtime và phát hành APK.

## 1. Nguyên tắc

- Không duy trì hệ thống cấu hình hoặc điều khiển reader từ xa.
- Không tải hay thực thi JavaScript, HTML, CSS hoặc plugin từ server.
- Không tạo API, Worker, database hoặc service mới nếu endpoint/cơ chế hiện tại đáp ứng.
- APK chỉ tải dữ liệu nội dung qua các nguồn đã cấu hình và kiểm tra hostname/contract.
- Lỗi Admin/analytics/diagnostics không được ảnh hưởng việc mở PDF, phát audio hoặc đồng bộ trang.
- Không thay đổi reader/audio/native/marker runtime nếu không có yêu cầu cụ thể và regression phù hợp.

## 2. Ranh giới thành phần

### 2.1 APK Core

| Thành phần | Trách nhiệm |
|---|---|
| Catalog Engine | Đọc manifest, map danh sách sách, tìm kiếm/lọc |
| Content Resolver | Resolve PDF/audio/marker URL từ catalog và kiểm tra host hợp lệ |
| Reader Engine | PDF rendering, page navigation, zoom |
| Audio Engine | Playback, multi-part audio, timestamp/page synchronization |
| Progress Store | Lưu/khôi phục tiến trình theo stable book ID |
| Marker subsystem | Đọc marker theo contract hiện tại; không thay đổi precedence khi chưa có policy/test |
| UI Renderer | Hiển thị các màn hình và điều khiển đã được đóng gói trong APK |
| Diagnostics | Ghi nhận lỗi theo chính sách privacy hiện hành |

Bảng trên mô tả trách nhiệm logic, không yêu cầu tách toàn bộ `app.js` thành nhiều module. Chỉ tách khi cải thiện rõ rệt khả năng kiểm thử và bảo trì.

### 2.2 Backend và dữ liệu

- R2 tiếp tục là nguồn PDF/audio và catalog hiện tại.
- `books.json` tiếp tục là manifest sách; mọi mở rộng phải additive và tương thích ngược.
- Admin scan/preview/publish quản lý inventory và manifest; không tự động xóa hoặc di chuyển object.
- Marker, diagnostics, analytics và usage là các miền dữ liệu độc lập, không nhập chung.
- Admin/backend/dashboard phải có thể thay đổi độc lập mà không kéo theo build APK nếu không thay đổi runtime hoặc contract caller APK.

## 3. Mở rộng catalog

Nếu triển khai category/folder, chỉ mở rộng contract `books.json` theo hướng additive:

- Giữ nguyên các field hiện hành như `id`, `title`, `pdf`, `audios`, `sync`.
- Có thể thêm metadata category/folder; APK cũ phải bỏ qua field không hiểu an toàn.
- `book.id` phải ổn định, duy nhất toàn catalog và không phụ thuộc folder path.
- Chuyển sách giữa folder hoặc đổi tên category không được làm mất reading progress.
- Giữ nguyên URL/asset resolver và host allowlist hiện tại.
- Catalog cũ không có category phải tiếp tục hiển thị bằng flat list.
- Validate duplicate IDs, category không hợp lệ, asset thiếu và đường dẫn sai trước khi publish.
- Không tự động di chuyển object R2. Nếu cần đổi key, thực hiện copy → HEAD/verify → cập nhật manifest → xác nhận; chỉ xem xét xóa object cũ sau bước xác nhận riêng.

Ví dụ cấu trúc folder R2 chỉ là prefix của object key, không phải một API hoặc dịch vụ mới:

```text
books.json
DISNEY/
  Frozen.pdf
  Frozen.mp3
  Frozen.json
GRIMM/
  ...
```

## 4. Tiến trình đọc/nghe

- Lưu tiến trình riêng theo stable `book.id`, độc lập với category và asset path.
- Progress tách biệt marker JSON và remote sync.
- Lưu tối thiểu page, audio part/index, audio time và timestamp cập nhật.
- Migration từ session key hiện tại phải an toàn: chỉ đánh dấu hoàn tất sau khi dữ liệu mới ghi và đọc kiểm tra thành công; giữ dữ liệu cũ trong giai đoạn chuyển đổi.
- Restore không tự phát audio; clamp page/audio time theo tài nguyên hiện có; fallback an toàn khi audio part hoặc PDF không còn tồn tại.
- Giai đoạn đầu lưu local; không thêm API/D1/cloud sync nếu chưa có yêu cầu riêng.
- Kiểm thử chuyển sách A → B → A, multi-part audio, pause/seek, app background/foreground, orientation và OTA APK update.

## 5. Quy tắc build

| Thay đổi | Có cần build APK? |
|---|---|
| Thêm/sửa/xóa sách, PDF, MP3, marker data hợp lệ | Không |
| Đổi tên/thứ tự/category/folder trong contract được APK hỗ trợ | Không |
| Sửa Admin scan/preview/publish hoặc dashboard | Không |
| Thêm màn hình, layout hoặc logic runtime mới | Có |
| Thay đổi PDF/audio engine, marker runtime hoặc lifecycle | Có |
| Thay đổi native bridge, permission hoặc OTA installer | Có |

OTA hiện tại là cơ chế tải/cài APK qua GitHub Releases và Android PackageInstaller. Không gọi cơ chế này là cập nhật JavaScript từ xa.

## 6. Bảo mật và độ tin cậy

- HTTPS và hostname allowlist; không tin URL tùy ý trong manifest.
- Timeout hữu hạn, retry có giới hạn và validate dữ liệu trước khi sử dụng.
- Catalog lỗi phải được xử lý riêng; không làm reader/audio crash.
- Không log token, URL riêng tư, nội dung sách hoặc dữ liệu cá nhân.
- Không mở public write API; Admin publish tiếp tục yêu cầu authentication và revalidation object.
- Không thay đổi marker precedence hoặc dữ liệu progress trong một batch chỉ nhằm cập nhật catalog.

## 7. Trình tự triển khai

1. Audit catalog schema, Admin scanner/publisher và app mapper.
2. Chốt stable book ID và khả năng tương thích manifest cũ.
3. Cập nhật Admin scan/preview/publish và regression tests; không di chuyển/xóa object R2 trong cùng batch.
4. Thêm category navigation trong APK với fallback flat list.
5. Thêm per-book progress store và migration regression.
6. Gom runtime changes, chạy full regression và chỉ build APK beta một lần ở commit chốt.
7. Kiểm thử thiết bị thật, Android TV và OTA; ghi SHA/build/test evidence trong ROADMAP.

## 8. Giới hạn nghiệm thu

Không coi các mục sau là hoàn thành nếu chưa có bằng chứng:

- Catalog hiện tại đã hỗ trợ category UI hay chỉ flat list.
- Book ID hiện tại có ổn định khi đổi folder hay không.
- Progress đã được tách theo từng sách hay chỉ lưu phiên cuối cùng.
- Reader/audio/marker regression đã được kiểm thử trên thiết bị thật.
- APK beta mới đã được build, ký và kiểm tra OTA.
