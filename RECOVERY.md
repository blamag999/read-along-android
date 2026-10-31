# Read Along Android — RECOVERY

> Nguồn sự thật về thay đổi là Git history + working tree. File này ghi mốc đối chiếu; không thay thế ROADMAP/PLANNING và không chứng minh một thay đổi đã được nghiệm thu.

## Mốc hiện tại

- Repository: `blamag999/read-along-android`
- Branch phát triển: `beta`
- Branch stable: `main` (không cập nhật code trong quy trình khôi phục)
- Last formal handover commit: `650c56059d774ccb2d29131a05d8aed6dfd9dda3`
- Last reviewed functional HEAD on beta: `9c4bf18861122df8f5dc29ac080b17aa2dd456c1`
- Recovery status: `RECONCILED`
- Recovery reviewed on: 2026-10-31
- Latest recovery checkpoint: touch UI/menu simplification implementation `b0a542e75692e5ab3711d43bda68b07e8b328019` (CI/device validation pending)
- README shared policy: beta content updated; main synchronization is pending PR #40 (README-only) because main requires changes through a pull request.

## Phát hiện sau mốc bàn giao trước

- OTA provider-neutral đã được triển khai trên beta: R2 bucket `read-along-releases`, Pages binding `OTA_RELEASES`, latest/download API, app.js fixed API client, native SHA-256 verification và workflow upload qua bucket-scoped S3 credentials.
- Production OTA API smoke pass trong CI [41183506939](https://github.com/blamag999/read-along-android/actions/runs/41183506939); full npm regression, JS syntax, Pages Functions syntax và isolation cũng pass.
- Ghi chú lịch sử tại checkpoint OTA trước đó: lúc ấy chưa có R2 API token/GitHub secrets và chưa phát hành APK. Trạng thái đó đã được giải quyết trong các batch sau; beta v1.3.13 đã build, xác minh chữ ký và publish OTA thành công.
- Cloudflare Pages latest deployment sau commit docs có thể đang chạy; backend API code và binding đã được deploy ở các commit trước và production smoke đã pass. Không xem 404 cho channel chưa có manifest là lỗi; đó là trạng thái mong đợi trước lần upload đầu tiên.


Các thay đổi đã được đối chiếu trong lịch sử Git và tài liệu hiện tại:

1. Marker conflict resolver tồn tại tại `modules/marker-resolver.js`; regression test tương ứng tại `tests/marker-resolver.test.js`.
2. Resolver là pure module, **chưa nối vào reader/runtime**. Không được kết luận marker migration hoặc runtime conflict handling đã hoàn tất.
3. Policy và đánh giá nguồn marker được ghi trong `docs/architecture/marker-and-api-review.md`; schema liên quan ở `schemas/marker.schema.json`.
4. Test resolver có CI success được ghi nhận trong ROADMAP: workflow `41164224271`. Không có APK build/runtime acceptance phát sinh từ resolver.
5. Có các commit thêm/xóa draft resolver/test trong quá trình chỉnh sửa; trạng thái cuối cùng phải lấy từ file ở HEAD, không suy ra từ commit trung gian.
6. README được đồng bộ quy tắc hai nhánh và bổ sung quy trình Git-based recovery. Việc cập nhật README trên main cần qua PR; không push trực tiếp lên main.

## Quy trình bắt đầu phiên mới

1. Đọc README → ROADMAP → PLANNING → RECOVERY trên beta; kiểm tra README trên main.
2. Lấy SHA HEAD thực tế của beta/main. So sánh HEAD beta với `last_reviewed_head` và `last formal handover commit`.
3. Kiểm tra commit list và per-commit diff sau mốc handover; không chỉ dựa vào tổng hợp compare nếu Git báo diverged hoặc kết quả quá lớn.
4. Nếu có bản clone, chạy:
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
5. Kiểm tra untracked files riêng bằng `git status --short`; `git diff` không hiển thị file untracked.
6. Phân loại từng việc:
   - `DONE`: có bằng chứng test/CI/deploy/thiết bị phù hợp.
   - `IMPLEMENTED`: code đã có nhưng chưa kiểm chứng đủ.
   - `PARTIAL`: đang làm dở.
   - `UNKNOWN`: thiếu bằng chứng.
7. Bảo toàn thay đổi chưa commit/untracked. Không reset, clean, force-push, rebase hoặc ghi đè.
8. Ghi phát hiện vào ROADMAP, việc còn lại vào PLANNING; sau khi review xong mới cập nhật `last_reviewed_head`.

## Quy trình bàn giao chính thức

1. Hoàn tất và commit code; kiểm thử theo quy tắc README.
2. Cập nhật ROADMAP với SHA, file/phạm vi, CI/test/deploy/build và giới hạn chưa xác minh.
3. Cập nhật PLANNING để chỉ giữ việc chưa hoàn thành.
4. Tạo commit tài liệu bàn giao với `[handover]`.
5. Cập nhật `last_handover_commit` tới commit code/documentation cuối cùng đã được bàn giao, và ghi SHA commit handover riêng trong mục lịch sử bên dưới. Không ghi SHA của chính commit đang chứa giá trị đó.
6. Ghi `last_reviewed_head` bằng HEAD đã được đối chiếu đầy đủ.

## Lịch sử mốc

- 2026-10-31 — Đối chiếu beta HEAD `cf019c1db5af56f8a59d75938ed7f9e2f2d860bf`; audit OTA provider-neutral và cập nhật PLANNING (`2cab87514c159ea211d72589abdd38c2161669ba`) + ROADMAP (`6b821546ac5f4e420214782b0859aa38f26f556a`). Cloudflare Pages/Functions và OTA code được kiểm tra chỉ đọc; chưa tạo/sửa tài nguyên Cloudflare, chưa thay đổi APK/workflow/router, chưa build hoặc chạy OTA test. `last_reviewed_head` được đặt tại commit ROADMAP trước commit RECOVERY này.

- 2026-10-31 — Khởi tạo RECOVERY. Handover cũ: `1ea6bb3124bafc9c5819d78146fa2cafb8206f40`; beta HEAD đã review: `fb521a9927fa4e81d414049208f30e296266c80e`.

## Đối chiếu và bàn giao kiến trúc — 2026-10-31

- So sánh `71ba2a1d41cb62dc85723a65ba89bfeb55878155...beta` trước khi bắt đầu cho kết quả `ahead 2`, `behind 0`, thay đổi tổng hợp chỉ gồm `RECOVERY.md` và `ROADMAP.md`; không có file runtime trong compare. Commit `6324daef8a506d0c725707df814df9ac0f10222f` đã được đọc trực tiếp; nó chỉ sửa ghi chú trạng thái PR #40 trong ROADMAP. Commit còn lại thuộc phạm vi RECOVERY theo compare; không có code/runtime delta.
- Đã tạo tài liệu kiến trúc mục tiêu `docs/architecture/core-extensibility.md` (commit `149bb1b9248d569a60eb15fb405bae417313f9e1`).
- Đã cập nhật PLANNING để ghi các audit/implementation task chưa hoàn thành (commit `e2a64eaa9f3d955d73b1829d65578d689f99311f`).
- Đã cập nhật ROADMAP và tạo handover checkpoint (commit `284484f6266d0c9792bd82b36ab1e00ea179ee1b`, sau đó `[handover]` commit `b5ff1d273e0a69ccdf0d37efd94cbe26942d5b09`).
- Recovery status `RECONCILED`: thay đổi từ mốc cũ đã được đối chiếu; batch hiện tại chỉ thay đổi tài liệu. `last_reviewed_head` và `last formal handover commit` được đặt tại checkpoint `b5ff1d273e0a69ccdf0d37efd94cbe26942d5b09`.
- Không chạy test/CI, không deploy, không build APK, không thay đổi R2/D1/Cloudflare, không cập nhật main. PR #40 vẫn là README-only và chưa được merge tại thời điểm đối chiếu.

## Bàn giao sau đợt tinh gọn Core — 2026-10-31

- Đã rà soát cấu trúc source hiện tại và đồng bộ README, PLANNING, ROADMAP, Data Contract cùng tài liệu kiến trúc Core; không còn checklist hoặc mô tả vận hành lỗi thời.
- `index.html`, `sw.js`, `package.json`, module tree, schema/test/workflow references đã được đối chiếu; không phát hiện caller hoặc asset cấu hình thừa trong các đường dẫn đã kiểm tra.
- Cloudflare Pages project `read-along-admin` được xác minh dùng build command `true`, root `admin`, output `public`; production deployment gần nhất được xác nhận success trong ROADMAP.
- README dùng chung đã được cập nhật trên nhánh beta và đồng bộ vào head của PR #40. PR vẫn chỉ thay đổi README.md và còn mở; chưa cập nhật main.
- Không chạy regression suite trong batch tài liệu, không build APK, không thay đổi reader/audio/native, R2, D1 hoặc API nghiệp vụ.
- Last reviewed HEAD trước commit bàn giao này: `52fd6dba2fc82b811a4228afe39967ac884516d2`.
- Commit bàn giao tài liệu hiện tại: `1bc2246dc6f47db7a7053db188b98a9d024449c1`.

## Bàn giao kế hoạch Online Reading Progress — 2026-10-31

- Người dùng yêu cầu tiến trình đọc/nghe phải lưu online theo stable device ID, tách riêng theo từng book ID và khôi phục sau clear app data/uninstall/reinstall.
- Đã cập nhật PLANNING với các bước audit native identity, D1/API hiện hữu, progress sync/outbox, migration local session, conflict handling và acceptance test.
- Đã cập nhật tài liệu kiến trúc Core với hướng ANDROID_ID app-scoped, D1 table riêng theo `(device_id, book_id)`, Pages Functions hiện hữu và các giới hạn bảo mật/ổn định của device ID.
- ROADMAP ghi nhận đây là quyết định và kế hoạch, không phải tính năng đã triển khai. Chưa thay đổi native code, API, D1 schema, progress runtime hoặc APK; chưa migrate dữ liệu local.
- Last reviewed HEAD trước commit handover: `48386107f6a924d8bb2f4eff0d8f9f3f9a5ec938`.
- Commit handover tài liệu: `cc09fddd5554c7c39760a9e37122fa0ae181d6ed`.


## Bàn giao batch sửa mốc audio 0 giây — 2026-10-31

- Phát hiện root cause trong `modules/page-sync.js`: `findTargetPage()` loại bỏ marker có thời gian 0 nếu page > 1, khiến marker hợp lệ `{ "2": 0 }` không bao giờ chọn được trang 2 khi audio bắt đầu.
- Đã bỏ điều kiện loại trừ này. Quy tắc tie-break vẫn giữ nguyên: nếu nhiều trang có cùng timestamp, chọn trang được đánh dấu đầu tiên (số trang nhỏ nhất). Marker thuộc audio part khác và marker vượt duration vẫn tiếp tục bị bỏ qua.
- Regression test mới trong `tests/modules.test.js`: (1) trang 2 có marker 0 đơn lẻ → chọn trang 2; (2) trang 2 và 3 cùng marker 0 → chọn trang 2; (3) trang 1–3 cùng marker 0 → chọn trang 1.
- Code commit: `968b7142ea13a42e29a94878d240ea6104dd047a`; test commit: `c8f6dd488a98ced98309f6fa16485d34816c7ceb`; final build-trigger commit / beta HEAD tại thời điểm handover: `ae356159a028bb90bb951e65b10a94ff9940b540`.
- GitHub Actions build run: [41186509296](https://github.com/blamag999/read-along-android/actions/runs/41186509296). Full `npm test`, Pages Functions syntax, isolation, release-channel validation, version generation, web preparation, native updater integration, Android versioning, icon generation và signing setup đều success. Tại thời điểm ghi nhận, bước `Build signed release APK` còn in progress; chưa xác nhận APK hoặc R2 upload thành công.
- Device acceptance pending: cài APK beta mới nhất khi workflow hoàn tất; mở sách có marker trang 2 = 0, bắt đầu audio và xác nhận reader chuyển trang 2; kiểm tra cả một trang/hai trang và các mốc tiếp theo.
- Không thay đổi `main`, signing key, OTA backend, Cloudflare resources, R2 objects hoặc D1 data trong phần sửa runtime này.
- Next step: kiểm tra kết quả run 41186509296; nếu build và OTA publish pass thì hướng dẫn người dùng cài/test thiết bị và cập nhật trạng thái nghiệm thu. Nếu thất bại, dùng step/log cụ thể để sửa, không tuyên bố APK sẵn sàng.


## Batch touch-first reader — 2026-10-31

- Phạm vi thay đổi trên beta gồm app.js, modules/page-sync.js, index.html, styles.css, native/android/AppLifecyclePlugin.java, build workflow, tests/modules.test.js, tests/native-lifecycle.test.js và package.json.
- Chính sách timestamp: mốc hợp lệ xác định trang; nếu trang liền kề trong cặp không có marker hợp lệ cho audio part hiện tại thì ghép đôi; nếu cả hai có marker thì hiển thị riêng. Sau marker cuối cùng không tự lật.
- Phiên đọc local hiện tại và hai checkpoint trước đó được giữ lại; đóng sách lưu và giải phóng tài nguyên. Mở lại hỏi resume; từ chối resume bắt đầu từ đầu và vẫn có thể chọn checkpoint.
- Native MainActivity được workflow tích hợp với readalong-back-pressed và readalong-user-leave; plugin AppLifecycle cung cấp lệnh thoát Activity. Home/background dừng HTML audio và lưu vị trí; không bật foreground service.
- CI/build/device acceptance chưa được đánh dấu DONE cho tới khi workflow thành công và người dùng xác nhận trên điện thoại. Không thay đổi main, OTA backend, R2/D1 hoặc signing key.


## Latest functional commit — 2026-10-31

- Beta functional code commit: c988a4ab31d70f41a2bc672eac7541f7b4c1c67e. This follows the main touch-first implementation commit 160bca36376a9573ca481fbcc67a09eb9cc4cc36 and the corrected final-page spread test commit 88087ece0072c5b55bc7c89fe6e835aa89350442.
- Close-book cleanup additionally invalidates pending audio-load callbacks and queued PDF render requests before the next book is opened.
- Workflow run 41189021463: npm tests and pre-build checks passed; Android native integration passed. APK Gradle build was still running at the last check. No claim of APK availability until signing/checksum and R2 publish steps complete.
- Device acceptance is still required on a touch-screen Android phone. Android TV is out of scope for this batch.


## Beta APK v1.3.12 build result — 2026-10-31

- Workflow run 41189021463: SUCCESS. Run URL: https://github.com/blamag999/read-along-android/actions/runs/41189021463
- Functional code commit built: c988a4ab31d70f41a2bc672eac7541f7b4c1c67e. Current beta branch includes the following docs-only handoff commits.
- Signed APK verified by workflow; APK size 3,437,002 bytes. GitHub beta release v1.3.12 published with APK, SHA-256 sidecar and Web Local ZIP: https://github.com/blamag999/read-along-android/releases/tag/v1.3.12
- R2 OTA beta publication completed successfully. No stable promotion has been performed.
- Only remaining gate is device acceptance on a touch-screen Android phone. Validate timestamp spreads, Back/Home audio stop, close/reopen/resume/checkpoints, and three touch zones. Do not test or modify Android TV in this batch.


## Touch reader correction batch — 2026-10-31

- Starting beta HEAD reviewed: 38a37f1c150a3ea0b5c7fb77f336f63472695c5a. Stable main is unchanged.
- Scope is touch-screen Android phones. Android TV remains explicitly out of scope.
- Existing three-checkpoint persistence was already implemented; the reader controls were not discoverable in the APK layout. The selector and restore action are moved into the reader menu without changing the per-book localStorage schema or autoplay policy.
- Manual backward navigation now resolves the nearest valid timestamp marker at or before the requested prior page, derives the appropriate page spread, and supplies that marker to the render/audio seek path. Regression coverage includes page 5 → pages 3–4 when page 4 is unmarked.
- Touch taps/swipes are scoped to rendered PDF canvases. The visual three-zone overlay follows the actual visible canvas bounds rather than the full viewer; bounds are recalculated after render and resize/orientation changes.
- Header actions are compacted to keep Playlist, Close Book and Read Menu on one row. Toasts preserve line breaks; OTA confirmation copy is shortened. Release notes are generated from explicit user-facing [feature], [fix], and [perf] entries rather than raw commit subjects/hashes.
- Runtime changes and regression coverage were implemented on beta. CI, signed APK verification, R2 OTA publication and release are confirmed in run 41191629320 and v1.3.13. Device acceptance remains pending; do not promote to main.
- Preserve existing OTA endpoints, R2/D1 resources, package signing key and beta/stable separation.



## Touch reader corrections — delivery and recovery checkpoint

- Functional commit: d83b284d8d57863763560f812f41521f897c9a3e.
- GitHub Actions run [41191629320](https://github.com/blamag999/read-along-android/actions/runs/41191629320) completed SUCCESS. Full npm regression, JavaScript and Pages checks, native integration, signed Gradle APK build, APK signature verification, R2 beta OTA publication, artifact upload and release creation all passed.
- Beta release [v1.3.13](https://github.com/blamag999/read-along-android/releases/tag/v1.3.13) is published. APK size: 3,438,317 bytes. SHA-256: 51ee1ff153d093633a3f7125c31cb85ff1e3adc86f136c18a466ee93c854d689.
- Workflow artifact: read-along-v1.3.13-build, artifact ID 13038719304; expires 2026-11-30.
- OTA manifest notes are concise and user-facing: new checkpoint entry point, improvements/fixes, and one performance/stability line.
- The existing three-checkpoint local storage schema is unchanged. The selector/restore UI is now in the reader menu; restore does not autoplay.
- Backward navigation resolves the nearest valid prior marker and corresponding spread; PDF tap/swipe controls use actual rendered canvas bounds.
- Device acceptance is pending. Do not mark accepted or promote main/stable until the user verifies the APK on a touch-screen Android phone.
- No changes to main, signing key, R2/D1 resources or OTA endpoint architecture. Android TV remains outside this batch.



- Documentation handover commit for beta v1.3.13: `650c56059d774ccb2d29131a05d8aed6dfd9dda3`. Runtime source was reviewed at functional commit `d83b284d8d57863763560f812f41521f897c9a3e`; subsequent changes are documentation-only.


## Batch touch UI và tinh gọn menu — 2026-10-31

- Functional source đã cập nhật trên beta tới commit `163abfbeab279b479e358e39ada6f3fa63fda3dd`; regression contract bổ sung tại `f2bebf47071a712021e29e6645551e8bdc910475` và analytics default-on test tại `2298de525308f5dd257e818a5a9c1e966169dd69`.
- Header portrait được bổ sung responsive rules; nhãn chữ playlist/đóng sách ẩn ở màn hình hẹp để tránh chồng nút. Cần kiểm tra thực tế nhiều kích thước màn hình cảm ứng.
- UI cập nhật marker GitHub, token và diagnostics đã được gỡ khỏi app; client remote-sync và diagnostics không còn được nạp từ index.html. Marker JSON từ catalog/R2 và nhập/xuất JSON cục bộ được giữ lại; fallback `loadCloudSyncForBook()` đã bị loại khỏi reader.
- Analytics consent UI đã bỏ; collector ghi nhận mặc định bật. Giữ nguyên schema ingest và trường dữ liệu đã cho phép; không gửi book title, filename, URL, nội dung PDF hoặc audio.
- Checkpoint label đổi thành “Mốc đọc gần đây”. Regression assertions đã thêm, nhưng chưa có bằng chứng full CI sau batch này.
- Full regression CI pass ở run `41193683584`; signed APK build/OTA publish đang chạy. Chưa chạy smoke test marker R2, chưa nghiệm thu thiết bị; không cập nhật main, không thay đổi R2/D1/Cloudflare resource hoặc signing key.
- Next: chạy full regression, sửa test nếu cần, build beta APK, kiểm tra portrait/playlist/menu và xác minh marker JSON tải từ R2; chỉ sau đó cập nhật trạng thái nghiệm thu.


## Incident recovery — catalog not loading after menu cleanup (2026-10-31)

- Root cause: `syncModal` markup lost required local controls (`importSyncInput`, `btnClearSync`, `syncTableBody`). `initEvents()` dereferenced missing DOM nodes, aborting before `loadR2Catalog()` ran.
- Restored complete local-only marker management UI at `c8dd29208097064c79e36ba97ac2434fbf55f882`; online GitHub sync and token controls remain removed.
- Removed dangling `scheduleGitHubSync()` calls and made JSON export filename generation self-contained at `ace4aa65d6a8ad3cb2c776437c713c2bd5a0a43f`.
- Added regression assertions at `0e16c8b21533f997a8bc5e3dd8368a3a6e500c69` for required modal IDs and no remote sync invocation.
- Functional fix commit: `9c4bf18861122df8f5dc29ac080b17aa2dd456c1`. Full regression and Pages checks passed in workflow `41202909931`; APK/R2 completion and device verification pending.
- Do not promote main until user verifies book catalog, PDF and audio loading on device.
