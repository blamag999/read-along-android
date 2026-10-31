# Read Along Android — RECOVERY

> Nguồn sự thật về thay đổi là Git history + working tree. File này ghi mốc đối chiếu; không thay thế ROADMAP/PLANNING và không chứng minh một thay đổi đã được nghiệm thu.

## Mốc hiện tại

- Repository: `blamag999/read-along-android`
- Branch phát triển: `beta`
- Branch stable: `main` (không cập nhật code trong quy trình khôi phục)
- Last formal handover code/documentation checkpoint: `d13482e6ede435125600328ce05244231af8a14e` (ROADMAP handover record; source review baseline remains `d6faeb3b1667bebf5130a63851c6090785a4945e`).
- Last reviewed functional/source HEAD on beta: `d6faeb3b1667bebf5130a63851c6090785a4945e`
- Recovery status: `DOCUMENTATION POLICY UPDATED — quyết định online-only media đã được ghi rõ; thay đổi lượt này chỉ cập nhật tài liệu, không xác minh lại toàn bộ runtime HEAD`
- Recovery reviewed on: 2026-10-31
- Latest policy update: quyết định không lưu PDF/audio offline đã được ghi vào README/ROADMAP/PLANNING/RECOVERY. Xem mục “Quyết định thay thế kế hoạch kho offline”; các checkpoint cũ bên dưới chỉ là lịch sử.
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


## Recovery checkpoint — header hai action / offline library plan — 2026-10-31

- Beta source được cập nhật để header chỉ còn hai action: Thư viện sách và Menu. Nút Đóng sách không còn trong DOM hoặc app event wiring; Android Back tiếp tục gọi requestCloseBook()/closeCurrentBook() và lưu reading session.
- Điều khiển hiển thị, mục Mốc thời gian và ẩn/hiện khu vực chọn file được chuyển vào readOptionsMenu; sync modal và local JSON import/export vẫn được giữ nguyên.
- Regression contract mới ở tests/modules.test.js kiểm tra hai nút header, không còn ID/JS reference của các nút cũ, và các mục đã chuyển vẫn hiện diện trong menu. Cần CI và device acceptance.
- Kho sách offline 1 GiB, LRU, cùng bảo toàn qua OTA chưa được code. Đây là task tiếp theo; không được tuyên bố đã triển khai. Trước khi sửa cần audit IndexedDB, luồng tải R2, native filesystem và OTA cleanup; không dùng cacheDir hoặc Service Worker Cache cho dữ liệu bền vững.


## 2026-10-31 — Library header layout implementation
- Đã đối chiếu thay đổi bốn commit gần nhất: HTML, CSS, app.js và regression test; không sửa native code, reader/audio lifecycle, marker hoặc IndexedDB schema.
- Số badge hiển thị state.playlist.length, không được diễn giải thành số blob đã lưu offline trên IndexedDB.
- CI/build/device validation chưa thực hiện tại mốc này. Không đặt last_handover_commit/last_reviewed_head vượt quá commit đã kiểm tra.


## Handover checkpoint — responsive library header release verified (2026-10-31)

- Latest functional/release checkpoint on `beta`: `61b383329ac4a6d5fcc1b3e54f3e5249390e50c2` (`[build-apk] Finalize responsive library header and verify beta APK`).
- Workflow [41205868772](https://github.com/blamag999/read-along-android/actions/runs/41205868772), run 186 / attempt 1: completed, conclusion `success`.
- Verified successful steps: dependency install; full regression suite; Pages Functions syntax; isolation constraints; release channel validation; signed release APK build; APK rename/signature verification; OTA object publication to Cloudflare R2; versioned workflow artifact upload; GitHub Release creation and asset attachment.
- Code commits in this batch: HTML `2c9e181255ba94dfff3e865e1f218875d981d205`; CSS `6b24d50fe6e3dc110fe74a8185bf41ed50002523` plus final focus-visible CSS in `61b383329ac4a6d5fcc1b3e54f3e5249390e50c2`; app badge logic `87b81e5e3b8b4686e2022f5b94efb964174936f9`; regression assertions `23cc765849189a1357b89ee73fe47783e59f6aa4`.
- Badge count is `state.playlist.length`; it is not a count of offline IndexedDB blobs. No IndexedDB schema/storage behavior was changed in this batch.
- Remaining acceptance: install/use the generated beta APK on a real touch device; verify portrait widths 320–600 px, visible icon/label/count, no header overlap, library action, menu controls and Android Back close/save behavior. Until user acceptance, do not promote `main`/stable.


## Recovery checkpoint — approved Confirm copy update (2026-10-31)

- Starting functional HEAD was beta `fafa31a3c2b89ec581dc33b0bd28e056ffbea5f5`; stable `main` remains unchanged.
- Test commit: `d219ce0a109a7202c3a10a51b68ceada5b4dd792`. Runtime commit: `4949bae9693d6bf17ccb57af81c80680d74772cf`.
- Exactly four Confirm strings were changed: close book, exit app, resume saved reading position, clear all sync timestamps. All confirmation return conditions and downstream actions remain unchanged. Non-selected dialogs, including OTA update confirmation, remain unchanged.
- Regression assertions were added to `tests/contracts.test.js`; full regression suite and pre-build checks passed in workflow [41211507635](https://github.com/blamag999/read-along-android/actions/runs/41211507635).
- At this checkpoint, APK signing/build verification, R2 OTA publication, workflow artifact upload and GitHub Release creation were still in progress. Do not describe APK as ready until run conclusion and release assets are verified.
- No main/stable promotion and no device acceptance. After successful build, install beta APK and verify all four Confirm dialogs plus unchanged OTA prompt on a real Android device.


## Recovery checkpoint — standardized OTA notifications (2026-10-31)

- Previous Confirm dialog batch remains in place. This batch changes only user-facing OTA messages in `app.js`; the OTA request, manifest validation, version comparison, fixed download endpoint, cache cleanup, native updater and checksum/signature verification flow remain unchanged.
- User-facing states: new release prompt includes versionName, curated manifest notes and Android confirmation explanation; latest-version toast; no-release-on-selected-channel toast; concise network/update error; download progress toast. Removed the versionCode/signing technical alert from the no-update path.
- Regression assertions updated in `tests/contracts.test.js` and `tests/ota-update.test.js`.
- Test commits: `b8841b9fdd3568ea8fc7e3021fffcec03ee91700`, `a36f69ecc67e16a0e8ffb9aa6c513e21f5d2446a`, `ed13753de05d7f28b797c3164f96e6c1be3dfd83`. Runtime commits: `68054fd8a7f60df8c39729ed7cc7296d063fb30a`, `2e5725c4ebaf1948d7a0698d9cd838369375d057`.
- Build workflow [41211770726](https://github.com/blamag999/read-along-android/actions/runs/41211770726) was queued for final runtime commit at the time of this checkpoint. Wait for full regression, signed APK build, signature verification, R2 OTA publication and GitHub Release creation before reporting APK readiness.
- `main` remains unchanged; no device acceptance has been claimed.

## Bàn giao kế hoạch Release Notes và rà soát thông báo — 2026-10-31

- Đối chiếu beta HEAD trước phiên: `5e876ebd12570bd22b6f4a33fbc706150545fb98`; PLANNING/ROADMAP/RECOVERY đã được đọc trước khi cập nhật.
- Đã thêm hai hạng mục chưa hoàn thành vào PLANNING: (1) Release Notes tự động, phân loại commit và lấy mốc theo đúng channel; (2) audit/rút gọn thông báo nội bộ app.
- Đã rà soát các alert/confirm/prompt/toast trong `app.js`, ghi các câu đề xuất và nguyên tắc xử lý lỗi vào PLANNING. Không sửa `app.js` hoặc file runtime nào.
- Commit PLANNING đầu: `3644258c70ea0bbe6e052d030f546a0c356fe08c`; commit PLANNING audit: `3acea281aa64040e4e74b1c25557007dbd56a203`; commit ROADMAP: `96fc15e8dcdcf0ab42961e23ac4d7138618c8174`.
- Không chạy regression/CI, không build APK, không deploy, không thay đổi OTA hoặc main. Việc tiếp theo: người dùng duyệt nội dung; sau đó mới thực hiện batch sửa thông báo với regression tests.

## Quy ước thuật ngữ đã thống nhất — 2026-10-31

- User-facing: “PDF” → “sách” khi nói về tài liệu đang đọc; “audio” → “âm thanh”. Tên định dạng cụ thể (PDF/MP3/M4A) vẫn được dùng trong hướng dẫn chọn tệp.
- Không đổi identifiers/API/metadata/log kỹ thuật. Quy ước được ghi trong PLANNING; runtime chưa thay đổi.
- Docs commits: PLANNING `751ad7311acf43dd445d48a4b443a7161f48dc2c`; ROADMAP `169ae24e8941c6a375ab6c1f255201a08f076d4d`.


## Recovery — Release Notes and app notifications implementation (2026-10-31)

- Starting beta HEAD was `3f35283b34329e58e2830ba4295960272c018c97`; stable main HEAD was `d683282ad319ba4b9a1bc5669a0e12667c20ac8a` and remains unchanged.
- App notification edits: `85b5046b42e81aee3da34510f91ffbec7e4e02a7`, `5c7816f4c1d492843db3db86e2dc06842e43438e`, `9507390a3d9607d2cf7543cca9108b4234a4822e`.
- Release Notes generator/tests/workflow edits: `f0506562ab2ee00181b0fda2bda6ea1c018bb40e`, `2b9a742af049fa0948d0ac44be0a3664474b226a`, `04323771c6059b3477b8e810ed0c25b4346fa17f`, `108158e291302596b2d5be1a935d9214d7edd789`, `5b07dc2a11aa24914eb17843347509ab31d45587`, `9d724505cea2c6437a286394ed5d6a76d740dc6e`, `c1af5b3e302b334ed4a066d89ee4c02b6c1d7de7`, `63fc3f279f6f28e7075d049ff6c423ed8739672a`.
- Implementation is not yet DONE: no regression/CI evidence, release generation has not been exercised in Actions, and the in-app notification audit still has unmodified legacy messages. No APK or OTA publication from this batch.
- Next: validate the Python generator/tests and workflow outputs; complete remaining user-facing notification strings and add coverage; then run one full regression batch and one final beta APK build. Keep main unchanged.


## Recovery update — CI for release notes and notifications (2026-10-31)

- Corrected the Python regression test import for the hyphenated script filename in commit `e679600bd3e7d36e9b98443991eeedf128f137bc`.
- Workflow run [41212943321](https://github.com/blamag999/read-along-android/actions/runs/41212943321): npm test, Pages Functions syntax, isolation and deployed analytics smoke passed. Deployed OTA smoke remained in progress at this handover.
- Earlier failed runs [41212800363](https://github.com/blamag999/read-along-android/actions/runs/41212800363), [41212818586](https://github.com/blamag999/read-along-android/actions/runs/41212818586), and [41212912614](https://github.com/blamag999/read-along-android/actions/runs/41212912614) were caused by the initial Python test module import path; the latest test run has passed the npm test step.
- Last reviewed code/test HEAD: `e679600bd3e7d36e9b98443991eeedf128f137bc`. No APK build or OTA publication has been triggered for this batch; main remains unchanged.


## Recovery — notification batch and OTA smoke correction (2026-10-31)

- Final code/test checkpoint before APK finalization: `b1d3ac247e8e6fd463be813cc7169a6ce26407f4`.
- App UI/notification batch is complete on beta: concise reader/book/audio messages, one final toast for multi-audio loading, reduced duplicate toasts, and consistent “sách” / “âm thanh” labels in static and dynamic UI. Technical exceptions remain in console/diagnostics.
- Regression coverage updated in `tests/contracts.test.js` for message copy, static labels, dynamic empty-state labels, release generator wiring and OTA manifest output contract.
- OTA smoke test failure in run 41212943321 was a stale expectation that the live endpoint must return 404. Live endpoint correctly returned a beta manifest (HTTP 200, version 1.3.20). Smoke test now validates the actual manifest contract and correct regex escaping.
- Full workflow [41213578916](https://github.com/blamag999/read-along-android/actions/runs/41213578916) completed successfully on `b1d3ac247e8e6fd463be813cc7169a6ce26407f4`: npm test PASS; Pages Functions syntax PASS; isolation PASS; analytics smoke PASS; OTA beta manifest smoke PASS.
- Next action: one final beta commit marked `[build-apk]` touching an APK-relevant path. Build workflow will rerun full regression, build/sign APK, verify SHA-256 and publish release/OTA. Do not claim artifact availability until run is complete and release assets are inspected. Keep main unchanged.


## Recovery — final beta APK build in progress (2026-10-31)

- Finalized runtime/UI and tests on commit `5839851550c29a1fcb17d8815426db1783b0936d`. This commit is the exact source selected by build workflow [41213680238](https://github.com/blamag999/read-along-android/actions/runs/41213680238).
- Full regression, Pages Functions syntax, isolation, channel validation, release notes/version generation, web preparation, native updater integration, Android version and launcher icon generation, signing configuration all passed.
- Current step: `Build signed release APK` is in progress. Pending: signature and SHA-256 verification, OTA R2 upload, workflow artifacts, GitHub Release assets.
- Main remains unchanged. Do not treat APK as downloadable/OTA-ready until workflow completes successfully and release assets are checked.


## Recovery — beta v1.3.21 release complete (2026-10-31)

- Build source commit: `5839851550c29a1fcb17d8815426db1783b0936d`.
- GitHub Actions [41213680238](https://github.com/blamag999/read-along-android/actions/runs/41213680238) completed success.
- Version/channel: `1.3.21` / beta; versionCode `199`; release tag `v1.3.21`.
- APK asset: `read-along-v1.3.21-android.apk`, 3,436,157 bytes. Signature verification v1 and v2 passed. OTA object + beta manifest upload passed. SHA-256: `fbe5f4650d1b54c5e29ac4a81a0e895b59321287ef0e923bbd23ba143e667723`.
- GitHub Release assets include APK, SHA-256 text file and Web Local ZIP. Artifact ID `13047033500`, expires 2026-11-30.
- Important outstanding issue: actual Release Notes include English/technical commit titles (e.g. CI regex/script changes). Version/channel baseline and common Release/OTA changelog path worked, but content quality is not acceptable as final user-facing Vietnamese. Fix generator policy before stable promotion; likely use explicit Vietnamese `Release-Note:` body fields and ignore internal maintenance commits.
- Device test has not been performed. User should install beta APK and verify app notifications/labels, reader/audio/marker/orientation and OTA behavior. Main remains unchanged.


## Recovery checkpoint — approved local-open removal and menu cleanup plan (2026-10-31)

- Đã đối chiếu beta HEAD 50b7c4961520a54e84c8400687e00bd7edad1076; ghi nhận yêu cầu bỏ khả năng mở file tùy ý từ thiết bị, mọi sách mở qua catalog/thư viện R2.
- Bảo toàn cache/offline của nội dung tải từ R2, kho offline 1 GiB theo kế hoạch hiện có, IndexedDB/native storage, session/checkpoint, marker và page/audio sync.
- Header mục tiêu: Thư viện sách và Menu; Android Back đóng sách; bỏ entry point chọn file và UI cũ không còn cần; giữ điều khiển reader, checkpoint “Vị trí đọc gần đây” / “Xem tiếp” và OTA.
- Kế hoạch chi tiết được thêm vào PLANNING.md; quyết định và ranh giới dữ liệu được ghi vào ROADMAP.md.
- Không sửa source/runtime, test, workflow, OTA, R2/Cloudflare hoặc main. Không chạy CI/build APK trong bước lập kế hoạch.


## Formal handover — Reader/Menu plan and APK Core boundary (2026-10-31)

- Đã so sánh `50b7c4961520a54e84c8400687e00bd7edad1076...beta`: 6 commits ahead, 0 behind; các file thay đổi chỉ gồm PLANNING.md, ROADMAP.md và RECOVERY.md.
- Reviewed beta source/documentation baseline: `d6faeb3b1667bebf5130a63851c6090785a4945e`. PLANNING commits: `580fc9314baf36d0ecd6f91a0d7553f4df6d56ce`, `d6faeb3b1667bebf5130a63851c6090785a4945e`.
- ROADMAP handover entry committed at `d13482e6ede435125600328ce05244231af8a14e`.
- Formal `[handover]` RECOVERY commit: `768981c40d70024d6503854c7ce339c602f81710`.
- Scope is approved for planning, not implementation. No runtime source changes, tests, CI, APK build, OTA publication, deployment or device acceptance were performed for this handover.
- `main` was not modified. README contents on beta and main are not byte-identical at this review; no README change was made in this handover. Existing README synchronization note references PR #40.
- Next session: verify current branch heads and docs again; audit local-open and marker-write/sync callers before code removal; then implement only on beta under the approved checklist.


## Quyết định thay thế kế hoạch kho offline — 2026-10-31

- Người dùng đã xác nhận không triển khai kho lưu trữ PDF/audio 1 GB. Mọi đề xuất kho offline 1 GiB/LRU trong các checkpoint lịch sử bên trên đã bị hủy và không còn là backlog.
- Chính sách hiện hành: PDF/audio đọc trực tiếp từ R2; không tải trước, không lưu media bền vững trên thiết bị, không hỗ trợ đọc/nghe offline, không Download Manager/LRU/FIFO/quota/tự xóa sách cũ.
- Chỉ giữ cache shell/app assets kỹ thuật và cache tạm nếu cần cho WebView/Service Worker; không cache PDF/audio như thư viện offline.
- Bảo toàn session/checkpoint và trạng thái đọc qua OTA. Marker JSON R2 tiếp tục read-only để đồng bộ trang/audio.
- Online Reading Progress (nếu triển khai) là dữ liệu trạng thái đọc/nghe, tách biệt hoàn toàn với lưu trữ media offline.
- Thay đổi hiện tại chỉ cập nhật tài liệu; không sửa runtime/API/workflow/R2/Cloudflare, không chạy CI/build APK và không thay đổi main.
- Các mục lịch sử cũ được giữ để truy vết quyết định, nhưng khi lập kế hoạch hoặc khôi phục phải áp dụng quyết định mới này.


## Cập nhật tài liệu online-only — 2026-10-31

- PLANNING policy commit: `ff4a4bf0e3da7b71afd3e66d47667e52b52d78b7`; checklist formatting correction: `d8b8cec9e60f4f2a3f636d36b6f13bb4d6df3c91`; wording cleanup was applied afterward.
- ROADMAP policy commit: `51671f1e4b757ca651c9b82b729cd2d175b8dbdc`; architecture-summary clarification was applied afterward.
- RECOVERY decision record commit: `b2c0712cd9a26113e44041ed21fce236a1957184`.
- README policy was committed on beta at `599e7138ff303484d26df49ffeb4abf794fd0e52`. README-only PR [#41](https://github.com/blamag999/read-along-android/pull/41) merged the policy section; PR [#42](https://github.com/blamag999/read-along-android/pull/42) then synchronized the complete shared README byte-for-byte to main at `4fd919f2ad9cc0bacd5bf9c7cdf5c01eefb2890e`.
- Scope: documentation only. No runtime/source, API, workflow, R2/Cloudflare, OTA or signing changes; no CI, APK build, deploy or device test was run.


- README synchronization verification after PR #42: beta blob `2c9e534869ee250de84c134a873879dad18f3a7f`, main blob `2c9e534869ee250de84c134a873879dad18f3a7f`; contents are byte-for-byte identical.
