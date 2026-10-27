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

### Automated deployment (recommended)

1. Create a Cloudflare Turnstile widget for the app's actual origins. Use managed mode. Copy its **site key** and **secret key**.
2. Obtain the Cloudflare Account ID. For the first deployment, create an account-scoped API token with the Cloudflare Workers **Admin** role so Wrangler can create the new Worker and Durable Object. After the Worker exists, you can replace this token with one scoped to the individual Worker and the **Editor** role for subsequent deployments. Do not grant DNS, billing, or unrelated product permissions.
3. In GitHub repository **Settings → Secrets and variables → Actions**, add these repository secrets (never commit or paste their values into source files):
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API token.
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID.
   - `READ_ALONG_ISSUES_TOKEN`: GitHub fine-grained token scoped to this repository with **Issues: Read and write** only.
   - `TURNSTILE_SECRET`: Turnstile secret key.
   - `TURNSTILE_SITE_KEY`: Turnstile site key (public, but stored as a secret here to simplify setup).
   - `RATE_LIMIT_SALT`: a long random deployment-specific value.
4. Open **Actions → Deploy diagnostics Worker → Run workflow**. Select branch `beta` and run it. It deploys the Worker and Durable Object, then configures the four Worker secrets.
5. Copy the deployed Worker URL from the deployment log. In repository root `diagnostics-config.js`, set `window.READ_ALONG_DIAGNOSTICS_API` to that base URL, e.g. `https://read-along-diagnostics.<your-subdomain>.workers.dev`. This is a public URL, not a credential.
6. Commit that URL change to `beta`, then build the APK using GitHub Actions on branch `beta`, channel `beta`.
7. Test report submission carefully: every successful report creates a public Issue. The service deliberately does not apply labels, so issue creation does not depend on label configuration.

### Manual deployment

If you prefer not to use GitHub Actions, install Wrangler, authenticate with the Cloudflare account that owns the Worker, and run `npx wrangler deploy` from this directory. Configure the Worker secrets and variables before testing.

## Local tests

- `npx wrangler dev` runs the Worker locally; use a real Turnstile test key pair only in a local environment.
- Test missing secrets (503), invalid Turnstile token (403), oversized payload (413), disallowed origin (403), rate limit (429), and successful Issue creation.
- Verify that logs contain only event names, timestamps, page numbers, audio times, playback state, viewport size and fixed native lifecycle markers.
