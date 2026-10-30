# Read Along Admin

Standalone web file manager for the Read Along R2 library. This app lives in the Android repository but is deployed as a **separate Cloudflare Pages project**. It does not use the Private Comic Reader API, D1 database, TOTP secret, cookie, or session.

## Architecture and isolation

- Git repository: `blamag999/read-along-android`
- Cloudflare Pages project: `read-along-admin`
- Pages root directory: `admin`
- Build command: empty
- Build output directory: `public`
- Production branch: `main`; `beta` is a preview branch
- R2 binding: `READALONG` -> `my-audio-book` only
- D1 binding: `DB` -> dedicated `read-along-admin-db`
- Secret: `READALONG_TOTP_SECRET` (Base32, at least 32 characters); never reuse the Private Comic Reader `TOTP_SECRET`

Do not add a `COMICS` binding, do not bind the Private Comic Reader D1 database, and do not copy its authentication secrets or cookies into this project.

## Cloudflare setup

Create/configure the Pages project from the same GitHub repository:

1. Project name: `read-along-admin`.
2. Framework preset: None.
3. Root directory: `admin`.
4. Build command: leave empty.
5. Build output directory: `public`.
6. Production branch: `main`.
7. Configure Git path filters so changes under `admin/**` trigger Admin builds. Keep the Android APK workflow independent.
8. Add bindings in both Preview and Production:
   - R2 bucket binding named `READALONG`, bucket `my-audio-book`.
   - D1 database binding named `DB`, database `read-along-admin-db`.
9. Add `READALONG_TOTP_SECRET` as a secret in both environments. Generate a new random Base32 secret of at least 160 bits and add it to an authenticator app. Never reuse the Comic Reader seed.
10. Apply `schema.sql` once to `read-along-admin-db` using the D1 Console or Wrangler.

Example local D1 migration (after installing Wrangler and authenticating):

```sh
npx wrangler d1 execute read-along-admin-db --remote --file=admin/schema.sql
```

If the Cloudflare project is configured through the API, verify that the production and preview environments have the same binding names but their own correct configuration. Do not bind this Admin project to the existing `private-comic-reader-db`.

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
