# Read Along diagnostics Worker

Worker nhận log chẩn đoán từ app và tạo GitHub Issue công khai. Người dùng không cần đăng nhập GitHub.

## Runtime

- Worker: `read-along-diagnostics`
- Endpoint: `https://read-along-diagnostics.ndhung475.workers.dev/submit`
- Secret bắt buộc: `GITHUB_TOKEN`
- Không dùng KV, Durable Objects, Turnstile hoặc database.
- Giới hạn best-effort trong bộ nhớ: 3 yêu cầu/IP/15 phút mỗi isolate; payload tối đa 100 KB, report tối đa 80 KB.

## Thiết lập secret (một lần)

1. Tạo fine-grained personal access token tại GitHub, chỉ cấp quyền cho repository `blamag999/read-along-android`.
2. Chỉ cấp **Issues: Read and write**. Không cấp Contents, Administration hay quyền tổ chức.
3. Mở Cloudflare Dashboard → Workers & Pages → `read-along-diagnostics` → Settings → Variables and Secrets.
4. Thêm **Secret** tên `GITHUB_TOKEN`, dán token và lưu. Không đưa token vào mã nguồn, APK hay chat.
5. Gửi thử log từ app sau khi secret đã lưu. Nếu token hết hạn/thu hồi, tạo token mới và thay secret này.

## Triển khai thay đổi

Mã nguồn đang được lưu trong `services/diagnostics/worker.js`. Khi chỉnh sửa, triển khai nội dung file đó vào Worker `read-along-diagnostics` trong Cloudflare Dashboard. Không bật Preview URLs; chỉ cần workers.dev endpoint.

## Quyền riêng tư

Log sẽ được đăng vào Issue công khai. App yêu cầu người dùng đồng ý trước khi gửi. Worker không lưu log riêng. Không gửi PDF, MP3, tên file, URL audio hay nội dung sách.

## Giới hạn chống spam

Rate limit trong bộ nhớ là biện pháp đơn giản, không phải bộ đếm phân tán và có thể bị vượt qua khi Worker chạy trên nhiều isolate. Nếu endpoint bị spam, hãy bật Cloudflare rate-limiting rule cho đường dẫn `/submit`.
