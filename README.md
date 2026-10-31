# Read Along Android — Quy tắc làm việc và bàn giao

> **Đọc file này trước khi thực hiện bất kỳ thay đổi nào.** Đây là quy định làm việc hiện hành cho repository `blamag999/read-along-android`. Khi tài liệu lịch sử hoặc trao đổi cũ mâu thuẫn với quy định tại đây, áp dụng quy định mới nhất trong README.

## 1. Đọc tài liệu theo đúng thứ tự

1. **README.md (file này):** quy tắc làm việc, nhánh, kiểm thử, phát hành và giới hạn an toàn.
2. **ROADMAP.md:** toàn bộ tiến độ đã thực hiện, các quyết định đã chốt, kết quả và trạng thái hiện tại.
3. **PLANNING.md:** chỉ chứa công việc chưa hoàn thành, theo thứ tự ưu tiên/phụ thuộc. Không dùng file này làm nhật ký lịch sử.

Tài liệu kỹ thuật chi tiết chỉ đọc khi công việc liên quan:
- `docs/architecture/data-contracts.md`: endpoint, caller, nguồn dữ liệu và contract.
- `docs/architecture/marker-and-api-review.md`: thứ tự nạp marker, xung đột nguồn và đánh giá API.
- `schemas/`: JSON Schema được áp dụng cho catalog, marker và analytics event.
- `tests/`: kiểm thử hợp đồng và module.

## Quy tắc README dùng chung trên mọi nhánh

- `README.md` là hồ sơ quy tắc làm việc và bàn giao **dùng chung**, nội dung phải đồng nhất tuyệt đối trên `main` và `beta`.
- Khi README thay đổi trên một nhánh, phải đồng bộ cùng nội dung sang hai nhánh còn lại bằng commit chỉ sửa README; không merge/cherry-pick mã nguồn hoặc promote code chỉ để đồng bộ tài liệu.
- Sau mỗi lần đồng bộ, đọc lại README/ROADMAP/PLANNING và RECOVERY trên beta và xác nhận nội dung giống hệt nhau (byte-for-byte), đồng thời ghi SHA commit từng nhánh vào ROADMAP.
- Mỗi phiên mới phải kiểm tra README của cả ba nhánh trước khi làm việc; nếu phát hiện lệch, dùng bản quy tắc mới nhất đã được xác nhận trên beta làm nguồn chuẩn, trừ khi người dùng chỉ định khác.
- Không sửa README riêng lẻ trên một nhánh mà bỏ quên hai nhánh còn lại. Không đồng nhất các file ROADMAP/PLANNING giữa nhánh bằng cách này; chúng phản ánh trạng thái code riêng của từng nhánh.

## 2. Phạm vi dự án — không dùng tài nguyên dự án khác

- Chỉ làm việc trong repository `blamag999/read-along-android` và các dịch vụ/tài nguyên được cấu hình, liên kết trực tiếp từ repository này.
- Không gọi API, dùng token, URL, bucket, Worker, Pages project hoặc cấu hình thuộc dự án khác.
- Không tự suy đoán endpoint hoặc credential. Xác minh từ source code, workflow, config và tài liệu của repository này.
- Không đưa token, mật khẩu, keystore, khóa ký, dữ liệu cá nhân hoặc URL riêng tư vào source, README, issue hay log.

## 3. Quy ước hai nhánh dài hạn — bắt buộc

Repository sử dụng đúng **hai nhánh dài hạn**:

| Nhánh | Vai trò | Cách sử dụng |
|---|---|---|
| `beta` | Phát triển và tích hợp | Nhánh làm việc mặc định; sửa lỗi, phát triển, cập nhật tài liệu và kiểm thử theo batch. |
| `main` | Stable / phát hành chính thức | Chỉ nhận thay đổi đã nghiệm thu từ `beta` qua Pull Request khi người dùng yêu cầu phát hành stable hoặc xác nhận promote. |

### Quy tắc phát triển

- Mặc định commit trực tiếp lên `beta`; không tạo nhánh riêng cho từng tính năng/lỗi và không dùng nhánh `testing`.
- Không push trực tiếp lên `main`; mọi thay đổi thông thường đi theo PR `beta` → `main`.
- Chỉ promote đúng commit/tree đã được kiểm thử trên `beta`; không cherry-pick chọn lọc để phát hành nếu chưa đánh giá đầy đủ phụ thuộc.
- Không force-push, rebase/viết lại lịch sử đã chia sẻ, reset làm mất commit hoặc tự ý xóa nhánh.
- Hotfix khẩn cấp: chỉ khi cần sửa stable trước khi beta sẵn sàng, tạo nhánh tạm `hotfix/*` từ `main`, kiểm thử, PR vào `main`, sau đó back-merge `main` về `beta`; xóa nhánh tạm sau khi xác nhận đã hợp nhất. Không dùng hotfix làm luồng phát triển thường xuyên.
- Nhánh feature riêng chỉ dùng khi có lý do phối hợp song song thực sự; phải ghi rõ mục đích và kế hoạch merge. Mặc định vẫn làm trực tiếp trên `beta`.
- Không tự ý thay đổi GitHub Secrets, Cloudflare secrets, keystore, signing key hoặc quyền truy cập.

### Quy trình phát hành stable

1. Hoàn tất một batch trên `beta`; chạy regression theo marker `[test]` hoặc kiểm thử bắt buộc tương ứng.
2. Nếu có thay đổi APK runtime, chốt commit `[build-apk]`, đợi workflow build beta hoàn tất và kiểm tra signature/SHA-256/artifact.
3. Kiểm thử APK beta trên thiết bị thật; ghi rõ phần đã xác nhận và phần pending.
4. Khi người dùng xác nhận phát hành stable, tạo PR `beta` → `main`; CI của PR phải pass.
5. Merge PR; chỉ build/publish stable từ `main` theo workflow hiện hành. Kiểm tra Release, APK, chữ ký và checksum trước khi thông báo.
6. Sau hotfix trên `main`, đồng bộ lại `beta` trước batch tiếp theo.

### Bảo vệ nhánh và quyền

- `main` cần bật branch protection/ruleset: yêu cầu PR, yêu cầu status checks phù hợp, chặn force-push và xóa nhánh; không bắt buộc review approval nếu repository chỉ có một người duy trì.
- `beta` cho phép push trực tiếp nhưng không force-push; kiểm thử theo batch như mục 7.
- Nếu GitHub connector không có quyền quản trị để bật protection, không được tuyên bố đã bật. Ghi trạng thái pending và hướng dẫn chủ repo cấu hình trong GitHub Settings → Branches/Rulesets.
- Không xóa nhánh hoặc thay đổi protection khi chưa kiểm tra quyền và trạng thái PR/workflow liên quan.

### README dùng chung

- README là quy tắc làm việc dùng chung, nội dung phải đồng nhất byte-for-byte trên `beta` và `main`.
- Khi thay đổi README, cập nhật cùng nội dung lên cả hai nhánh bằng commit README-only; không merge/cherry-pick code chỉ để đồng bộ tài liệu.
- ROADMAP/PLANNING không cần đồng nhất giữa hai nhánh vì phản ánh trạng thái code riêng; hồ sơ bàn giao mới nhất phải được cập nhật trên `beta`.

## 4. Quy trình bắt buộc trước và trong mỗi đợt

### Trước khi sửa

1. Xác nhận repository là `blamag999/read-along-android`.
2. Đọc README, ROADMAP, PLANNING phiên bản mới nhất trên GitHub.
3. Kiểm tra HEAD của `beta` và `main`; xác định branch đang làm và commit cha.
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
7. Không chạy full regression trên mọi commit trung gian. Chốt một batch hoàn chỉnh bằng marker `[test]` ở commit cuối cùng của lần push; thay đổi nhạy cảm/critical phải test ngay, không đợi batch.

### Sau mỗi bước / batch — bắt buộc bàn giao liên tục

- **Không chờ đến cuối phiên.** Sau mỗi bước công việc có kết quả độc lập (sửa code, thay workflow, migration, deploy, kiểm thử hoặc quyết định kiến trúc), phải cập nhật hồ sơ bàn giao ngay trước khi chuyển sang bước tiếp theo.
- ROADMAP ghi kết quả vừa hoàn thành, ngày, commit SHA, file/phạm vi thay đổi, CI/test/deploy thực tế, bằng chứng và giới hạn chưa xác minh.
- PLANNING cập nhật ngay trạng thái phụ thuộc: chỉ giữ việc chưa xong; chuyển kết quả/bằng chứng sang ROADMAP rồi bỏ checklist đã hoàn thành. Nếu bước chưa xong, ghi rõ blocker và bước tiếp theo.
- README cập nhật ngay khi bước đó thay đổi quy tắc làm việc, CI, release hoặc thông tin bàn giao nền tảng; không đợi kết thúc phiên.
- Trước khi kết thúc phiên, kiểm tra ba file README/ROADMAP/PLANNING đồng bộ với HEAD và trạng thái CI/deploy mới nhất.
- Không ghi “đã kiểm thử”, “đã phát hành”, “đã deploy” nếu chưa có bằng chứng thực tế.


## 4A. Khôi phục tiến trình khi bàn giao bị thiếu hoặc lỗi thời — bắt buộc

Git là nguồn sự thật về thay đổi mã nguồn; README/ROADMAP/PLANNING/RECOVERY là hồ sơ giải thích và xác nhận trạng thái. Không được coi tài liệu bàn giao cũ là trạng thái hiện tại nếu Git có commit hoặc thay đổi chưa được ghi nhận sau mốc đó.

### Khi bắt đầu mỗi phiên mới

1. Xác nhận đúng repository và đọc README, ROADMAP, PLANNING, RECOVERY trên `beta`; đọc README trên `main` để xác nhận quy tắc dùng chung.
2. Đọc `RECOVERY.md` lấy `last_handover_commit` và `last_reviewed_head`. Kiểm tra HEAD hiện tại của `beta` và `main`, branch đang làm và working tree nếu có bản clone.
3. So sánh từ `last_handover_commit` đến HEAD bằng Git history và diff; đồng thời kiểm tra thay đổi staged/unstaged/untracked. GitHub commit diff không thể phát hiện thay đổi chưa commit trong một bản clone khác.
4. Nếu HEAD khác mốc đã ghi hoặc working tree không sạch, dừng việc phát triển tính năng mới; lập danh sách commit, file thay đổi, diff và trạng thái CI/test/deploy/build tương ứng.
5. Phân loại từng hạng mục: `DONE` (có bằng chứng nghiệm thu), `IMPLEMENTED` (đã có code nhưng chưa kiểm chứng), `PARTIAL` (dang dở), `UNKNOWN` (không đủ bằng chứng). Commit tồn tại không tự chứng minh tính năng hoàn tất.
6. Bảo toàn mọi thay đổi chưa commit/untracked. Không reset, clean, force-push, rebase hoặc ghi đè để làm working tree “sạch”.
7. Cập nhật ROADMAP với phát hiện và bằng chứng; cập nhật PLANNING chỉ với việc còn lại. Sau khi đối chiếu xong, cập nhật `last_reviewed_head` trong RECOVERY. Chỉ tiếp tục công việc mới khi trạng thái đã rõ.

### Lệnh đối chiếu chuẩn trong bản clone

```bash
git status --short
git branch --show-current
git log -n 30 --oneline --decorate
git log --oneline LAST_HANDOVER_SHA..HEAD
git diff --stat LAST_HANDOVER_SHA..HEAD
git diff --name-status LAST_HANDOVER_SHA..HEAD
git diff
git diff --cached
```

Thay `LAST_HANDOVER_SHA` bằng SHA chính xác trong RECOVERY.md. Kiểm tra thêm untracked files từ `git status --short`; các file này không xuất hiện trong `git diff`.

### Khi kết thúc hoặc bàn giao chính thức

- Cập nhật ROADMAP và PLANNING theo quy tắc hiện hành; ghi rõ SHA commit, CI/test/deploy/build và phần chưa xác minh.
- Tạo commit bàn giao tài liệu trên beta với thông điệp có `[handover]`; commit này là mốc bàn giao chính thức.
- Cập nhật `last_handover_commit` trong RECOVERY.md tới SHA commit code/documentation cuối cùng được bàn giao (commit ngay trước commit chỉ ghi mốc handover nếu cần tránh tham chiếu vòng); ghi rõ quy ước và SHA commit handover thực tế.
- Ghi `last_reviewed_head` là HEAD đã được đối chiếu. Không đặt mốc cao hơn commit đã kiểm tra.
- Nếu phiên bị ngắt trước bước này, phiên sau phải phát hiện và phân tích delta Git; không được tự coi các thay đổi chưa ghi nhật ký là đã bàn giao.

### Quy tắc an toàn khi khôi phục

- Không tự động sửa hoặc xóa code chỉ vì không có mô tả trong ROADMAP.
- Không kết luận CI/test/deploy thành công nếu không có run/deployment cụ thể gắn với commit tương ứng.
- Nếu không thể truy cập working tree của phiên trước, chỉ có thể khôi phục commit đã push lên GitHub; thay đổi local chưa commit và chưa push không thể được tái dựng từ GitHub.
- Nếu phát hiện commit trên main hoặc nhánh khác, không tự merge/promote; tuân thủ quy tắc nhánh và xác nhận của người dùng.

## 5. Quy tắc build APK và OTA

Read Along là ứng dụng Capacitor/WebView. HTML/CSS/JavaScript được đóng gói trong APK cần build APK mới khi thay đổi. Việc cập nhật catalog và media qua các nguồn cloud hiện tại không tự động đòi hỏi build APK. Dịch vụ Admin và dữ liệu độc lập không tự động đòi hỏi build APK.

### Chính sách build một lần ở bước chốt

- Trong suốt quá trình phát triển trên `beta`, mỗi commit chỉ chạy CI/test phù hợp; **không build APK sau từng commit**.
- Khi toàn bộ thay đổi APK của một đợt đã hoàn tất, test pass và tài liệu đã cập nhật, commit cuối cùng phải có chuỗi `[build-apk]` trong commit message. Push commit này lên `beta` sẽ tự kích hoạt đúng một lần build APK beta.
- Các push beta thông thường không có dấu mốc trên sẽ không chạy job build APK.
- Không tạo commit `[build-apk]` khi còn dự định sửa runtime; nếu build cuối thất bại thì sửa lỗi trước, sau đó tạo một commit chốt mới có dấu mốc để thử lại.
- Build APK chỉ cần thiết khi thay đổi JavaScript/HTML/CSS runtime đóng gói, UI interaction, PDF/audio/marker runtime, Android/WebView lifecycle, native plugin/bridge/permission/FileProvider hoặc OTA installer.
- Sửa tài liệu, Admin/backend, schema, test độc lập, catalog/media không tự yêu cầu build APK.
- Workflow dispatch thủ công được giữ lại cho trường hợp phát hành stable có chủ đích từ `main` hoặc thao tác khẩn cấp; không dùng làm bước thường lệ cho beta.

### Không build APK chỉ vì

- Sửa tài liệu, README, roadmap, planning, schema hoặc test.
- Sửa Admin UI/API, báo cáo, dashboard hoặc diagnostics backend.
- Thay đổi catalog, metadata, PDF/audio trên R2, marker JSON APK đã hỗ trợ.

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

Catalog và media trên R2, marker JSON, Admin, Diagnostics backend, Analytics backend/dashboard và nội dung trợ giúp/thông báo.

### Nguyên tắc giao tiếp

- API có contract/schema version rõ ràng; HTTPS và hostname allowlist.
- Timeout hữu hạn, retry có giới hạn; validate dữ liệu trước khi áp dụng.
- Cache bản hợp lệ gần nhất và offline fallback.
- Không làm reader crash hoặc mất khả năng đọc khi catalog, marker hoặc dịch vụ phụ trợ gặp lỗi.
- Giữ API riêng nếu khác mục đích, quyền hoặc vòng đời dữ liệu; chỉ dùng chung transport client khi có lợi ích thực tế.

### Chính sách lưu trữ media — online-only

- PDF và audio được đọc/stream trực tiếp từ R2; không tải trước, không lưu bản media bền vững trên thiết bị và không hỗ trợ đọc/nghe offline.
- Không triển khai kho media 1 GB, LRU/FIFO, quota, Download Manager, media cache layer hoặc tự động xóa sách cũ.
- Chỉ giữ cache shell/app assets và cache tạm kỹ thuật cần thiết cho WebView/Service Worker; tuyệt đối không dùng chúng làm kho PDF/audio offline.
- Giữ session/checkpoint và trạng thái đọc qua OTA; OTA không được xóa dữ liệu trạng thái đọc.
- Marker JSON companion từ R2 chỉ đọc để đồng bộ trang/audio. Đồng bộ tiến trình đọc/nghe online (nếu có) là dữ liệu trạng thái riêng, không phải lưu trữ media offline.
- Quyết định này thay thế mọi ghi chú/đề xuất kho offline 1 GiB/LRU trong tài liệu lịch sử.

## 7. Kiểm thử tối thiểu và điều kiện hoàn tất

### Chính sách CI theo mốc

- Workflow phải lọc `paths` ngay ở cấp trigger để commit tài liệu/README/ROADMAP/PLANNING hoặc thay đổi không liên quan không tạo workflow run.
- `Check Read Along Admin` chỉ nhận push có thay đổi trong `admin/**`, app shell/caller, `modules/**`, `services/**`, schema, package manifests hoặc tests; PR vào `beta`/`main` vẫn tự động kiểm thử theo path filter riêng.
- `Build and Release Read Along` chỉ nhận push lên `beta` có thay đổi liên quan đến runtime/asset/native Android/build manifest. Push chỉ thay đổi Admin/backend/docs không tạo build workflow run.
- Workflow-level path filtering và job-level marker là hai lớp độc lập: path xác định có tạo workflow run hay không; `[test]`/`[build-apk]` xác định có thực thi job nặng hay không.
- Push thông thường lên `beta` hoặc `main`: không chạy full regression suite.
- Khi hoàn tất một batch, đặt `[test]` trong commit cuối cùng của lần push để chạy `npm test`, Pages Functions syntax check và isolation checks.
- Marker phải nằm trong **commit cuối cùng của push** vì workflow đọc `github.event.head_commit.message`. Nếu marker nằm ở commit trước trong cùng push, workflow sẽ không nhận diện.
- Pull request vào `beta`/`main` vẫn tự động chạy đầy đủ regression checks; `workflow_dispatch` cũng cho phép chạy thủ công.
- Commit `[build-apk]` tự chạy lại toàn bộ kiểm thử trên đúng commit sẽ đóng gói APK. Chỉ khi test pass mới tiếp tục build, verify chữ ký và SHA-256, upload artifact và tạo Release.
- `[build-apk]` không đồng thời kích hoạt workflow push `[test]`, tránh chạy trùng hai bộ full test cho cùng commit.
- Lỗi bảo mật, mất dữ liệu, reader/audio, WebView lifecycle hoặc native bridge: chạy kiểm thử ngay khi sửa xong, không chờ batch.
- Không cấu hình full regression workflow làm required status check cho mọi push nếu branch protection không phân biệt marker; PR workflow vẫn tự động kiểm tra.

- [ ] Xác nhận đúng repository, branch và HEAD.
- [ ] Đọc caller/contract của thành phần bị ảnh hưởng.
- [ ] Có regression test cho lỗi hoặc contract liên quan.
- [ ] Chạy `npm test` tại mốc `[test]` hoặc `[build-apk]`; ghi rõ nếu không chạy được.
- [ ] Kiểm tra diff, không có file/token/dữ liệu ngoài phạm vi.
- [ ] Xác minh CI trên commit cần nghiệm thu.
- [ ] Với Pages/Worker: xác minh deployment và endpoint thực tế; deploy success không đồng nghĩa URL/body đã đúng.
- [ ] Với APK: build sạch qua workflow, kiểm tra signature/SHA-256/artifact.
- [ ] Với reader/audio/native: kiểm thử thiết bị thật, ghi model/Android/app version và kết quả.
- [ ] Cập nhật ROADMAP và PLANNING đúng quy tắc.

Không tuyên bố hoàn tất nếu còn thiếu kiểm thử bắt buộc; ghi rõ phần đã xác nhận và phần pending.

## 8. Quy tắc dữ liệu và vận hành

- Cloudflare Pages `read-along-admin` lấy source từ repository này, production branch `beta`, root `admin`, output `public`; build command `true`, không có custom pre-publish validator.
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
