# Read Along Admin

Standalone web file manager for the Read Along R2 library. This app lives in the Android repository but is deployed as a **separate Cloudflare Pages project**. It does not use the Private Comic Reader API, D1 database, TOTP secret, cookie, or session.

## Architecture and isolation

- Git repository: `blamag999/read-along-android`
- Cloudflare Pages project: `read-along-admin`
- Pages root directory: `admin`
- Build command: empty
- Build output directory: `public`
- Production branch: `beta`; `main` and `feature/*` are preview branches
- R2 binding: `READALONG` -> `my-audio-book` only
- D1 binding: `DB` -> dedicated `read-along-admin-db`
- Secret: `READALONG_TOTP_SECRET` (Base32, at least 32 characters); never reuse the Private Comic Reader `TOTP_SECRET`

Do not add a `COMICS` binding, do not bind the Private Comic Reader D1 database, and do not copy its authentication secrets or cookies into this project.

## Provisioned Cloudflare resources

- Pages project: `read-along-admin` (`read-along-admin.pages.dev`), project ID `373988ad-1b62-4750-80cb-5a39a37f6281`.
- Dedicated D1 database: `read-along-admin-db`, ID `6a316068-ef8e-4eaf-af4b-536b4fd7b74c`; schema has been applied, including TOTP replay protection.
- Pages Git source is this repository; root directory is `admin`, output directory is `public`, production branch is `beta`, and preview branches include `feature/*` and `main`.
- The only Production R2 binding is `READALONG` -> `my-audio-book`. Preview has no R2 or D1 bindings.

## Cloudflare setup

Create/configure the Pages project from the same GitHub repository:

1. Project name: `read-along-admin`.
2. Framework preset: None.
3. Root directory: `admin`.
4. Build command: leave empty.
5. Build output directory: `public`.
6. Production branch: `beta`.
7. Git path filter is currently `*` to keep automatic deployments reliable. Depending on Pages path-filter semantics, commits elsewhere in the repository may also trigger this separate Pages build. The Android APK workflow remains independent and is not triggered by this Pages deployment.
8. Add bindings to **Production only**:
   - R2 bucket binding named `READALONG`, bucket `my-audio-book`.
   - D1 database binding named `DB`, database `read-along-admin-db`.
   Preview deliberately has no D1 or R2 bindings, so preview builds cannot access production library data.
9. Add `READALONG_TOTP_SECRET` as a secret in **Production only**. Generate a new random Base32 secret of at least 160 bits and add it to an authenticator app. Never reuse the Comic Reader seed. Do not add the production secret to Preview.
10. Apply `schema.sql` once to `read-along-admin-db` using the D1 Console or Wrangler.

Example local D1 migration (after installing Wrangler and authenticating):

```sh
npx wrangler d1 execute read-along-admin-db --remote --file=admin/schema.sql
```

Production is the only environment with the `DB` and `READALONG` bindings. Preview must have neither binding and must not receive `READALONG_TOTP_SECRET`. Do not bind this Admin project to the existing `private-comic-reader-db`.

## Authentication and security

- TOTP: 6 digits, HMAC-SHA1, 30-second period, ±1 time-step tolerance.
- Session: 32 cryptographically random bytes; only SHA-256 token hash is stored in D1.
- Cookie: `HttpOnly; Secure; SameSite=Strict; Path=/`, 30-minute lifetime.
- Login rate limit: 5 attempts per IP hash per 15 minutes.
- Mutating requests require a same-origin `Origin` header.
- Strict Content Security Policy and anti-framing headers are in `public/_headers`.
- Audit events are stored in the dedicated D1 database.
- All R2 operations use the fixed `READALONG` binding. The API does not accept a bucket name from the browser.

## Current functions

- OTP login, session check, logout.
- Browse R2 folders and files.
- Create folders.
- Multipart uploads in 8 MiB chunks for large files.
- Rename/move files using copy -> size verification -> source deletion.
- Delete files and recursively delete folders (maximum 5,000 objects per operation).
- View the latest 100 audit events.

Supported library extensions: PDF, JSON, MP3, M4A/M4B, AAC, WAV, OGG/OGA, Opus, FLAC, WMA. WMA can be stored but may not play in Android WebView. Audio transcoding is intentionally not included in this first management layer; it needs a separately tested FFmpeg runtime or browser-side transcoding flow.

## Operational notes

- Do not change the existing Private Comic Reader Pages project, its D1 database, R2 bindings, routes, secrets, or cookies for this Admin app.
- Do not add the Admin directory to the Android APK asset-copy/build pipeline.
- Never commit OTP seeds, Cloudflare API tokens, passwords, or session tokens.
- Before enabling production, verify login lockout, session expiry, upload completion, rename verification, and deletion behavior on a test folder.


## Library Health Check

The Admin UI includes a read-only **Kiểm tra thư viện** scan for the `READALONG` R2 bucket.

- Scans the selected folder and its descendants; root scan is limited to 5,000 objects per run. For larger libraries, scan narrower subfolders.
- Reports unsupported extensions, zero-byte objects, basic PDF/MP3/audio container signature issues, missing PDF/audio pairs (same base filename in the same folder), duplicate same-name assets, invalid JSON syntax, and WMA playback compatibility warnings.
- PDF checks inspect the `%PDF-` header and look for `%%EOF` near the end. Audio checks inspect container/frame signatures only; they do not fully decode or certify every audio frame or duration.
- The scan is read-only: it never deletes, renames, converts, or modifies library objects.
- After correcting files, run the scan again to verify the result.

## Library UI and matching rules

- Admin has three tabs: Library for file browsing, Diagnostics for integrity checks, and Debug for request/scan logs.
- Library listing uses server-side R2 cursor pagination, defaults to 25 entries per page, and allows 25/50/100. The selected size is remembered for the current browser session. Changing folders resets the page.
- R2 objects are the only catalog source; books.json is not used.
- PDF, timestamp JSON and audio use the same normalized book stem.
- A single audio can use the book stem. Multiple audio parts must be named _P1, _P2, _P3... with no gaps or duplicate part numbers.
- Correctly numbered audio parts are valid and are not duplicate warnings.
- Orphan timestamp JSON, unmatched names, invalid file signatures, zero-byte files, malformed JSON and unsupported extensions are reported.
- Near-name matches are suggestions only. Rename requires administrator approval; fuzzy matches are never auto-paired.

## Incremental scan cache and Debug

- Diagnostics compares R2 listing metadata (key, size, upload timestamp and ETag) against the dedicated Admin D1 table `admin_scan_cache`.
- Files whose metadata fingerprint and scan rule version are unchanged reuse their saved per-file inspection findings. New/changed files and files evaluated under a new rule version are inspected again.
- Pairing/name diagnostics are recalculated from the current full inventory on every scan, so a newly added/renamed counterpart can change pairing results even when the other file's binary inspection is reused.
- Temporary content-read failures are not cached; those files are retried on the next scan.
- The first scan after installing this feature, and the first scan after a rule-version change, re-inspects all eligible files. R2 inventory listing and global pairing analysis still run each time.
- Cache entries for objects no longer present in the scanned prefix are removed. Rename naturally creates a new cache key and delete is reconciled on the next scan.
- Scan history is stored in `admin_scan_logs` in the dedicated Admin D1. It records scan ID, status, scanned/changed/skipped counts, error/warning counts, duration, rule version and Cloudflare Ray ID. It does not store OTPs, cookies, tokens or file contents.
- The Debug tab shows recent server scan history and the current tab's in-memory API request log, and can export both as JSON. Browser request logs are cleared when the tab/session is closed; server scan history persists in D1.
- After adding the new tables to an existing production D1 database, apply the updated `admin/schema.sql` once (it uses `CREATE TABLE IF NOT EXISTS`). Never apply it to the Private Comic Reader database.
