# Read Along Android — Quy tắc làm việc và bàn giao

> **Đọc file này trước khi thực hiện bất kỳ thay đổi nào.** Đây là quy định làm việc hiện hành cho repository `blamag999/read-along-android`. Khi tài liệu lịch sử hoặc trao đổi cũ mâu thuẫn với quy định tại đây, áp dụng quy định mới nhất trong README.

## 1. Đọc tài liệu theo đúng thứ tự

1. **README.md (file này):** quy tắc làm việc, nhánh, kiểm thử, phát hành và giới hạn an toàn.
2. **ROADMAP.md:** toàn bộ tiến độ đã thực hiện, các quyết định đã chốt, kết quả và trạng thái hiện tại.
3. **PLANNING.md:** chỉ chứa công việc chưa hoàn thành, theo thứ tự ưu tiên/phụ thuộc. Không dùng file này làm nhật ký lịch sử.

Tài liệu kỹ thuật chi tiết chỉ đọc khi công việc liên quan:
- `docs/architecture/data-contracts.md`: endpoint, caller, nguồn dữ liệu và contract.
- `docs/architecture/marker-and-api-review.md`: thứ tự nạp marker, xung đột nguồn và đánh giá API.
- `schemas/`: JSON Schema được áp dụng cho catalog, marker, Remote Config và analytics event.
- `tests/`: kiểm thử hợp đồng và module.

## 2. Phạm vi dự án — không dùng tài nguyên dự án khác

- Chỉ làm việc trong repository `blamag999/read-along-android` và các dịch vụ/tài nguyên được cấu hình, liên kết trực tiếp từ repository này.
- Không gọi API, dùng token, URL, bucket, Worker, Pages project hoặc cấu hình thuộc dự án khác.
- Không tự suy đoán endpoint hoặc credential. Xác minh từ source code, workflow, config và tài liệu của repository này.
- Không đưa token, mật khẩu, keystore, khóa ký, dữ liệu cá nhân hoặc URL riêng tư vào source, README, issue hay log.

## 3. Quy ước ba nhánh — bắt buộc

Repository hiện có đúng ba nhánh làm việc được quy ước:

| Nhánh | Vai trò | Cách sử dụng |
|---|---|---|
| `main` | Stable / phát hành chính thức | Chỉ cập nhật khi người dùng yêu cầu phát hành stable hoặc xác nhận rõ promote từ `beta`. |
| `beta` | Phát triển và tích hợp chính | Nhánh mặc định để sửa lỗi, phát triển, cập nhật tài liệu và chạy CI. |
| `testing` | Kiểm chứng có kiểm soát | Chỉ sử dụng khi có nhu cầu kiểm thử tách biệt thực sự hoặc người dùng yêu cầu. Không bắt buộc cho mọi thay đổi. |

### Không được làm

- Không tạo nhánh mới cho từng tính năng, lỗi, PR hoặc đợt sửa; không tạo `feature/*`, `fix/*`, `testing-*` hay nhánh tạm.
- Không tạo nhánh thay thế khi `testing` cũ/stale; ưu tiên quy trình trực tiếp trên `beta`.
- Không tự ý xóa bất kỳ nhánh nào, kể cả nhánh cũ không còn dùng.
- Không force-push, rebase/viết lại lịch sử đã chia sẻ, reset làm mất commit hoặc thay đổi ref bằng force.
- Không tự ý merge/promote `beta` lên `main`.
- Không tự ý thay đổi GitHub Secrets, Cloudflare secrets, keystore, signing key hoặc quyền truy cập.

Nếu thật sự cần ngoại lệ về nhánh, phải giải thích lý do kỹ thuật và xin xác nhận trước khi thực hiện. Các nhánh phụ từng xuất hiện trong lịch sử chỉ là dấu vết công việc cũ, không phải quy trình hiện hành.

## 4. Quy trình bắt buộc trước và trong mỗi đợt

### Trước khi sửa

1. Xác nhận repository là `blamag999/read-along-android`.
2. Đọc README, ROADMAP, PLANNING phiên bản mới nhất trên GitHub.
3. Kiểm tra HEAD của cả `main`, `beta`, `testing`; xác định branch đang làm và commit cha.
4. Kiểm tra workflow CI gần nhất, trạng thái deploy Pages/Worker liên quan, Releases và Issues liên quan. Không dùng kết quả CI cũ để kết luận commit mới đã pass.
5. Đọc mã và contract hiện tại của đúng thành phần cần sửa; tìm tất cả caller trước khi thay đổi API hoặc luồng dữ liệu.
6. Xác định phạm vi ảnh hưởng, test cần bổ sung và có cần build APK hay không.

### Khi thực hiện

1. Mặc định commit trực tiếp lên `beta`; chỉ dùng nhánh khác theo quy ước ở mục 3.
2. Ưu tiên thay đổi nhỏ, một trách nhiệm, dễ kiểm tra và dễ rollback; tránh refactor rộng không cần thiết.
3. Không tạo API/Worker/Cloudflare service mới nếu endpoint hoặc cơ chế hiện tại đáp ứng được. Không gộp các API có mục đích, quyền hoặc vòng đời dữ liệu khác nhau chỉ để giảm số lượng route.
4. Không thay đổi hành vi reader/audio/native khi công việc chỉ liên quan Admin, catalog, analytics hoặc tài liệu.
5. Bổ sung regression test cho lỗi và contract liên quan. Đọc lại diff để phát hiện thay đổi ngoài phạm vi.
6. Commit trên đúng nhánh; theo dõi CI và xử lý lỗi trên cùng nhánh, không tạo nhánh mới để né CI.

### Sau mỗi đợt

- Cập nhật ROADMAP với kết quả đã hoàn thành, commit SHA, CI/test, deploy, APK/device test và giới hạn chưa xác minh.
- PLANNING chỉ giữ phần chưa xong. Khi một mục hoàn tất: chuyển kết quả/bằng chứng sang ROADMAP rồi xóa mục đó khỏi PLANNING.
- README chỉ cập nhật khi thay đổi quy tắc hoặc thông tin bàn giao nền tảng.
- Không ghi “đã kiểm thử”, “đã phát hành”, “đã deploy” nếu chưa có bằng chứng thực tế.

## 5. Quy tắc build APK và OTA

Read Along là ứng dụng Capacitor/WebView. HTML/CSS/JavaScript được đóng gói trong APK cần build APK mới khi thay đổi, trừ phần đã được thiết kế rõ ràng để lấy dữ liệu/cấu hình từ xa. Dịch vụ Admin và dữ liệu độc lập không tự động đòi hỏi build APK.

### Chỉ build APK khi

- Thay đổi JavaScript/HTML/CSS runtime được đóng gói hoặc UI interaction mới.
- Thay đổi thuật toán PDF/audio/marker, vòng đời Android/WebView hoặc khôi phục phiên đọc.
- Thêm/sửa native plugin, bridge, permission, FileProvider hoặc OTA installer.
- Sửa lỗi lõi nghiêm trọng, bảo mật hoặc tương thích nền tảng.

### Không build APK chỉ vì

- Sửa tài liệu, README, roadmap, planning, schema hoặc test.
- Sửa Admin UI/API, báo cáo, dashboard hoặc diagnostics backend.
- Thay đổi catalog, metadata, PDF/audio trên R2, marker JSON hoặc Remote Config values trong schema APK đã hỗ trợ.

### OTA / release

- Duy trì cập nhật APK qua GitHub Releases và native Android installer hiện có.
- APK cập nhật đè phải giữ **cùng signing key** với bản đã cài. Không đổi khóa ký.
- Workflow phải xác minh chữ ký APK và tạo SHA-256; kiểm tra artifact/Release thực tế trước khi thông báo.
- Android có thể yêu cầu quyền “Install unknown apps” và xác nhận cài đặt. Đây không phải cài đặt im lặng.
- Không tìm cách né hoặc vô hiệu hóa Google Play Protect. Xử lý cảnh báo bằng kiểm tra nguồn APK, chữ ký, tính nhất quán quy trình phát hành và gửi mẫu cho Google nếu cần.
- Chỉ chạy kênh `beta` trên nhánh `beta`; kênh `stable` chỉ phát hành từ `main` sau khi được xác nhận.
- Không tự suy đoán version number; đọc workflow và Releases tại thời điểm phát hành.

## 6. Ranh giới kiến trúc đã thống nhất

### APK Core — ưu tiên ổn định

PDF viewer, audio player, đồng bộ trang/audio, orientation/lifecycle, khôi phục phiên đọc, điều khiển cảm ứng/remote/Android TV, native bridge và OTA installer. Chỉ sửa khi có lỗi nghiêm trọng, bảo mật, tương thích nền tảng hoặc yêu cầu thiết yếu.

### Dịch vụ/dữ liệu độc lập

Catalog và media trên R2, marker JSON, Admin, Diagnostics backend, Analytics backend/dashboard, Remote Config và nội dung trợ giúp/thông báo.

### Nguyên tắc giao tiếp

- API có contract/schema version rõ ràng; HTTPS và hostname allowlist.
- Timeout hữu hạn, retry có giới hạn; validate dữ liệu trước khi áp dụng.
- Cache bản hợp lệ gần nhất và offline fallback.
- Không thực thi JavaScript tùy ý từ server; Remote Config chỉ chứa giá trị/flag/nội dung đã whitelist.
- Không làm reader crash hoặc mất khả năng offline khi API/config lỗi.
- Giữ API riêng nếu khác mục đích, quyền hoặc vòng đời dữ liệu; chỉ dùng chung transport client khi có lợi ích thực tế.

## 7. Kiểm thử tối thiểu và điều kiện hoàn tất

- [ ] Xác nhận đúng repository, branch và HEAD.
- [ ] Đọc caller/contract của thành phần bị ảnh hưởng.
- [ ] Có regression test cho lỗi hoặc contract liên quan.
- [ ] Chạy `npm test` và các kiểm tra cú pháp/lint phù hợp; ghi rõ nếu không chạy được.
- [ ] Kiểm tra diff, không có file/token/dữ liệu ngoài phạm vi.
- [ ] Xác minh CI trên commit cần nghiệm thu.
- [ ] Với Pages/Worker: xác minh deployment và endpoint thực tế; deploy success không đồng nghĩa URL/body đã đúng.
- [ ] Với APK: build sạch qua workflow, kiểm tra signature/SHA-256/artifact.
- [ ] Với reader/audio/native: kiểm thử thiết bị thật, ghi model/Android/app version và kết quả.
- [ ] Cập nhật ROADMAP và PLANNING đúng quy tắc.

Không tuyên bố hoàn tất nếu còn thiếu kiểm thử bắt buộc; ghi rõ phần đã xác nhận và phần pending.

## 8. Quy tắc dữ liệu và vận hành

- R2 bucket sách hiện dùng trong dự án: `my-audio-book`; catalog manifest là `books.json` ở root bucket. Chỉ sử dụng endpoint/hostname được cấu hình trong repository.
- Admin catalog: scan inventory → preview → người quản trị xác nhận → kiểm tra HEAD từng object → publish. Không tự động xóa, đổi tên hoặc di chuyển file gốc.
- Ghép sách theo tên đã chuẩn hóa và cùng thư mục; không fuzzy matching. Audio part `_P1`, `_P2`… phải giữ thứ tự số.
- WMA không được đưa vào catalog playback; quy trình chuyển đổi phải giữ nguyên WMA gốc và không ghi đè MP3 có sẵn.
- Diagnostics phải giới hạn dữ liệu, không gửi nội dung sách, token, cookie, tên file nhạy cảm hoặc URL riêng tư.
- Marker hiện có cả nguồn local/import, R2, GitHub và localStorage. Không tự ý thay đổi precedence, merge hoặc migrate marker khi chưa có policy và regression tests; bảo toàn dữ liệu cũ.
- Không xóa dữ liệu người dùng khi dọn cache. OTA chỉ được xóa đúng shell cache/service worker được xác định; không xóa localStorage/sessionStorage hoặc dữ liệu đọc.

## 9. Liên kết vận hành

- Repository: https://github.com/blamag999/read-along-android
- Actions: https://github.com/blamag999/read-along-android/actions
- Android build/release workflow: https://github.com/blamag999/read-along-android/actions/workflows/build-android-apk.yml
- Issues: https://github.com/blamag999/read-along-android/issues
- Releases: https://github.com/blamag999/read-along-android/releases

---

**Bắt đầu phiên làm việc mới:** đọc README → ROADMAP → PLANNING; kiểm tra trạng thái GitHub thực tế; sau đó chỉ thực hiện mục chưa hoàn thành có ưu tiên cao nhất trong PLANNING.
