# Read Along diagnostics service (Cloudflare Worker)

This service creates a public GitHub Issue only after an explicit user action and a valid Cloudflare Turnstile challenge. Never put a GitHub token or Turnstile secret in the Android APK or in `diagnostics-config.js`.

## Security model

- GitHub token is a Worker secret and should be a fine-grained token scoped to this repository with **Issues: Read and write** only. Do not grant Contents, Actions, Administration, or organization permissions.
- Turnstile is required for every report. The server verifies the token with Cloudflare before accepting data.
- A Durable Object applies a hard per-IP limit of 3 reports/hour and 10/day. The Durable Object identifier is a SHA-256 hash of the IP plus a deployment salt; raw IP is not written to application storage. Cloudflare's edge may process IP addresses as part of normal request handling.
- CORS allows only Capacitor's `https://localhost` and local development origins. Do not add wildcard CORS.
- Payloads are capped at 64 KiB. The Worker revalidates and rebuilds every field from an allowlist; arbitrary strings and error messages are discarded.
- Issue content is public. Do not send files, book titles, file paths, media URLs, credentials, account identifiers, or raw Android logcat.
- The Worker never stores report bodies. The GitHub Issue is the retained record; close/delete it according to the project's retention policy if needed.

## Deploy

1. Create a Cloudflare Turnstile widget for the app's actual origins. Use managed mode. Copy its **site key** (public) and **secret key** (private).
2. Install Wrangler and authenticate with the Cloudflare account that owns the Worker.
3. From this directory run `npx wrangler deploy`.
4. Set the GitHub fine-grained token: `npx wrangler secret put GITHUB_TOKEN`.
5. Set the Turnstile secret: `npx wrangler secret put TURNSTILE_SECRET`.
6. In Worker Settings > Variables, set `TURNSTILE_SITE_KEY` to the public site key and `RATE_LIMIT_SALT` to a long random value. Keep the Turnstile secret and GitHub token in Secrets, not Variables.
7. In repository root `diagnostics-config.js`, set `window.READ_ALONG_DIAGNOSTICS_API` to the deployed Worker base URL, e.g. `https://read-along-diagnostics.<your-subdomain>.workers.dev`. This is a public URL, not a credential.
8. The GitHub repository must have labels `diagnostics` and `bug`; create them before testing if they do not exist. Test first with a test repository/token if desired, because each successful report creates a public Issue.
9. Build the APK using GitHub Actions on branch `beta`, channel `beta`.

## Local tests

- `npx wrangler dev` runs the Worker locally; use a real Turnstile test key pair only in a local environment.
- Test missing secrets (503), invalid Turnstile token (403), oversized payload (413), disallowed origin (403), rate limit (429), and successful Issue creation.
- Verify that logs contain only event names, timestamps, page numbers, audio times, playback state, viewport size and fixed native lifecycle markers.
