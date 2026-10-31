# Read Along Android — Kiến trúc Core mở rộng bằng dữ liệu và cấu hình

> Trạng thái: **Target architecture / đề xuất đã được người dùng chấp thuận để triển khai theo giai đoạn**. Tài liệu này không khẳng định các thành phần target đã được code, deploy hoặc nghiệm thu. Cập nhật theo bằng chứng thực tế trong ROADMAP.

## 1. Mục tiêu

Giữ APK Core ổn định và giảm tối đa số lần build APK khi thay đổi chỉ liên quan đến nội dung, phân loại, metadata hoặc các tùy chọn mà phiên bản APK hiện tại đã hỗ trợ.

Nguyên tắc thiết kế:

- APK chứa sẵn các engine và renderer có phạm vi rõ ràng.
- Backend cung cấp dữ liệu và giá trị cấu hình theo JSON contract có version; không gửi code thực thi.
- Thay đổi dữ liệu/cấu hình trong capability đã có không yêu cầu build APK.
- Thay đổi hành vi hoặc capability chưa có trong APK vẫn phải phát triển, kiểm thử và phát hành APK.
- Không tạo API, Worker, database hoặc framework mới nếu file tĩnh R2/Pages và các module hiện có đã đáp ứng.
- Không làm reader/audio phụ thuộc vào dịch vụ cấu hình; lỗi cấu hình không được ngăn mở sách.

## 2. Ranh giới thành phần

### 2.1 APK Core — khả năng được đóng gói sẵn

| Engine / module | Trách nhiệm |
|---|---|
| Catalog Engine | Parse manifest, category/folder, book list, search/filter và thứ tự |
| Content Resolver | Resolve PDF/audio/marker URL từ catalog; kiểm tra host hợp lệ |
| Reader Engine | PDF rendering, page navigation, zoom |
| Audio Engine | Playback, multi-part audio, timestamp/page synchronization |
| Progress Store | Lưu/khôi phục tiến trình theo stable book ID |
| Marker subsystem | Đọc marker theo contract hiện tại; migration chỉ sau khi policy được nghiệm thu |
| Configuration Client | Tải, validate, cache và fallback cấu hình tĩnh |
| Feature Registry | Danh sách capability được code sẵn và whitelist cấu hình được phép |
| UI Renderer | Render các layout/component đã lập trình sẵn; không render HTML/JS tùy ý từ server |
| Diagnostics | Ghi nhận lỗi tải catalog/config và lỗi runtime theo chính sách privacy hiện hành |

Bảng trên là phân chia trách nhiệm mục tiêu, không yêu cầu tách ngay toàn bộ app.js thành nhiều module. Chỉ tách code khi có lợi ích kiểm thử và bảo trì cụ thể.

### 2.2 Backend / data

- R2 tiếp tục là nguồn PDF/audio và catalog hiện tại.
- `books.json` giữ tương thích với contract hiện tại; metadata category/folder được bổ sung theo hướng additive.
- Một static `app-config.json` có thể dùng để điều khiển các giá trị/flag đã whitelist. Ưu tiên static Pages/R2 file hiện có, không tạo API mới.
- Admin scan/preview/publish quản lý dữ liệu và xác thực object; không tự ý di chuyển hoặc xóa object.
- Marker, diagnostics, analytics và usage vẫn là các miền dữ liệu độc lập; không nhập chung vào app config.

## 3. Contract mục tiêu

### 3.1 Catalog

Các trường hiện hành như `id`, `title`, `pdf`, `audios`, `sync` phải tiếp tục hoạt động. Phần mở rộng category là additive, ví dụ:

```json
{
  "schemaVersion": 1,
  "catalogVersion": 12,
  "categories": [
    { "id": "disney", "name": "DISNEY", "order": 1, "parentId": null },
    { "id": "grimm", "name": "GRIMM", "order": 2, "parentId": null }
  ],
  "books": [
    {
      "id": "frozen",
      "categoryId": "disney",
      "title": "Frozen",
      "pdf": "DISNEY/Frozen.pdf",
      "audios": ["DISNEY/Frozen.mp3"],
      "sync": "DISNEY/Frozen.json"
    }
  ]
}
```

Đây là ví dụ contract mục tiêu, không phải manifest đang được publish.

Quy tắc bắt buộc:

- `book.id` là định danh ổn định, duy nhất toàn catalog và không được tạo từ folder path.
- `category.id` ổn định, độc lập với tên hiển thị; `parentId` hỗ trợ phân cấp khi cần.
- Chuyển sách giữa folder hoặc đổi tên category không làm thay đổi book ID và không làm mất reading progress.
- Giữ nguyên URL/asset resolver và host allowlist hiện tại.
- APK cũ phải bỏ qua metadata mới mà không crash; APK mới phải có fallback cho manifest cũ không có categories.
- Validate duplicate IDs, category cha không tồn tại, vòng lặp parent, asset thiếu và đường dẫn không hợp lệ trước khi publish.
- Không tự động di chuyển object R2. Việc chuyển key phải là quy trình copy → HEAD/verify → cập nhật manifest → xác nhận → mới cân nhắc xóa object cũ.

### 3.2 App configuration

Cấu hình app tách khỏi catalog. Ví dụ tối thiểu:

```json
{
  "configVersion": 1,
  "minimumAppVersion": "1.0.0",
  "features": {
    "categories": true,
    "readingProgress": true,
    "bookSearch": true
  },
  "ui": {
    "homeLayout": "categories",
    "showBookProgress": true
  }
}
```

Đây là ví dụ target, không phải cấu hình đã được xác minh đang phục vụ ở production.

Quy tắc:

- Chỉ chấp nhận key, enum, kiểu dữ liệu và giới hạn được schema whitelist.
- Feature flag chỉ bật/tắt capability đã có trong APK; không thể cài đặt capability mới.
- Giá trị UI chỉ chọn layout/component đã được đóng gói sẵn; không nhận HTML, CSS, JavaScript, URL script hoặc biểu thức tùy ý.
- Config thiếu, hết hạn, sai schema, sai version hoặc không truy cập được phải fallback về packaged defaults và last-known-good nếu cơ chế cache đã được triển khai, kiểm thử.
- `minimumAppVersion` chỉ được dùng để cảnh báo/chặn theo policy rõ ràng; không được làm app mất khả năng đọc khi metadata lỗi.
- Cấu hình không chứa token, secret, dữ liệu người dùng hoặc marker/progress.
- Tăng `configVersion` khi nội dung cấu hình được phát hành; không tái sử dụng version cho payload khác.

### 3.3 Feature Registry / capability compatibility

APK tự khai báo capability trong code, ví dụ:

- `catalog.categories.v1`
- `catalog.nested-folders.v1`
- `reader.pdf.v1`
- `audio.multiple-parts.v1`
- `audio.timestamp-sync.v1`
- `progress.per-book.v1`
- `ui.home-layout.v1`

Backend chỉ được gửi cấu hình thuộc capability mà APK hỗ trợ. Registry là whitelist nội bộ, không phải cơ chế tải plugin. APK cũ phải bỏ qua trường không hiểu và tiếp tục dùng contract cũ. Khi cần thay đổi contract không tương thích, tăng schema version và duy trì fallback/migration rõ ràng.

## 4. Tiến trình đọc/nghe

- Lưu tiến trình riêng theo stable `book.id`, độc lập với category và asset path.
- Giữ progress tách biệt marker JSON và remote sync.
- Lưu tối thiểu page, audio part/index, audio time và timestamp cập nhật; chỉ lưu thêm view preferences khi có giá trị thực tế.
- Migration từ session key hiện tại phải an toàn: chỉ đánh dấu migration hoàn tất sau khi dữ liệu mới ghi và đọc kiểm tra thành công; giữ nguyên dữ liệu cũ trong giai đoạn chuyển đổi.
- Restore không tự phát audio; clamp page/audio time theo tài nguyên hiện có; fallback an toàn khi audio part hoặc PDF không còn tồn tại.
- Giai đoạn đầu lưu local; không thêm API/D1/cloud sync nếu chưa có yêu cầu riêng.
- Kiểm thử chuyển sách A → B → A, multi-part audio, pause/seek, app background/foreground, orientation và OTA APK update.

## 5. Ranh giới build và cập nhật

| Thay đổi | Có cần build APK? |
|---|---|
| Thêm/sửa/xóa sách, PDF, MP3, marker data hợp lệ | Không |
| Đổi tên/thứ tự/category/folder trong contract được hỗ trợ | Không |
| Thay đổi config value/flag đã whitelist | Không |
| Sửa Admin scan/preview/publish hoặc dashboard | Không |
| Thêm UI layout/component đã có renderer và được cấu hình | Không |
| Thêm capability, thuật toán reader/audio hoặc logic runtime mới | Có |
| Thay đổi native bridge, permission, lifecycle hoặc installer | Có |

Lưu ý: luồng OTA APK hiện có là cơ chế tải/cài APK qua Android PackageInstaller; không được gọi đó là remote JavaScript OTA. Chỉ xem xét cập nhật web runtime từ xa nếu repository có một cơ chế độc lập, được xác minh về chữ ký, integrity, compatibility, rollback và bảo mật. Không thực thi code tùy ý từ backend.

## 6. Bảo mật và độ tin cậy

- HTTPS và hostname allowlist; không tin URL tùy ý trong manifest/config.
- Timeout hữu hạn, retry có giới hạn, payload size limit và schema validation.
- Cache/fallback không được ghi đè last-known-good bằng dữ liệu lỗi.
- Config/catalog failure không được chặn reader/audio; tách lỗi phụ trợ khỏi lỗi nội dung.
- Không log token, URL riêng tư, nội dung sách hoặc dữ liệu cá nhân.
- Không mở public write API; Admin publish tiếp tục yêu cầu authentication và revalidation object.
- Không dùng config để thay đổi marker precedence, remote-sync target hoặc dữ liệu progress.

## 7. Trình tự triển khai

1. **Audit hiện trạng:** kiểm tra code thực tế, schema, caller, static config asset, cache/fallback và CI; đối chiếu README/ROADMAP/PLANNING để loại bỏ mô tả lỗi thời.
2. **Data contract:** thiết kế schema additive cho categories và stable IDs; cập nhật Admin scanner/publisher và tests; không di chuyển/xóa object R2 trong cùng batch.
3. **Config foundation:** chỉ tái sử dụng static JSON/Pages và schema hiện có nếu xác minh được. Bổ sung client/cache/fallback vào APK chỉ khi cần và gộp với một runtime batch; không tạo API/Worker mới.
4. **Catalog UI:** thêm category navigation bằng engine/renderer có sẵn, fallback flat list.
5. **Progress Store:** per-book migration và regression, giữ marker subsystem riêng.
6. **Acceptance:** chạy test batch, một lần build APK beta sau khi toàn bộ runtime changes pass; test thiết bị thật, Android TV và OTA; ghi SHA/build/test evidence.
7. **Freeze:** chỉ đóng băng Core sau khi contract và regression được nghiệm thu.

## 8. Các giới hạn hiện tại cần xác minh

Tại thời điểm viết tài liệu, không được coi các mục sau là đã hoàn thành chỉ vì đã có thiết kế:

- Remote Config static asset có thể đã được thêm vào Pages nhưng HTTP body/production URL phải được smoke-test.
- Data Client, cache và fallback runtime phải được xác minh từ source thật; tài liệu hiện có mô tả chưa thống nhất.
- Catalog hiện tại cần xác minh hỗ trợ category metadata hay chỉ flat list.
- Progress hiện tại cần migration từ global session sang per-book store.
- OTA APK installer không đồng nghĩa với web runtime OTA.
- Marker resolver chưa được tích hợp runtime; không gộp marker migration vào đợt catalog/config nếu chưa có test riêng.
