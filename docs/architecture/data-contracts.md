# Data Contract & Endpoint Inventory

> Inventory captured from the `beta` source on 2026-10-31. This file distinguishes current runtime behavior from the proposed target. Do not treat proposed contracts as deployed endpoints.

## 1. Current app-facing sources

| Domain | Current source / route | Caller | Current responsibility | Notes |
|---|---|---|---|---|
| Book catalog | `https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/books.json` | `app.js: loadR2Catalog()` | Public book manifest | R2 is the catalog source; app validates the R2 hostname before mapping assets |
| PDF/audio assets | Same Read Along R2 public hostname | `app.js` media loaders | Read media assets | Media is not cached by Service Worker; preserve Range requests |
| Marker JSON | R2 public URL, when present; optional GitHub `sync_data/*.json` | `app.js`, `modules/remote-sync.js` | Page/audio timestamps | GitHub sync writer currently targets repository branch `main`; token is entered by user and held in session storage |
| Usage visit tracking | `POST https://read-along-admin.pages.dev/api/readalong-admin/usage/track` | `modules/diagnostics.js` | Anonymous app launch/visit and installation | Uses install/launch identifiers; does not measure reading/listening duration |
| Usage dashboard data | `GET https://read-along-admin.pages.dev/api/readalong-admin/usage/stats` | Admin UI | Book inventory, app visits and devices | Public read endpoint; current data is not time-spent analytics |
| Client event telemetry | `POST /api/readalong-admin/telemetry/events` | `modules/diagnostics.js` | Batches allowlisted diagnostic event types | API validates event count and filters sensitive key names |
| User-submitted diagnostic report | `POST https://read-along-diagnostics.ndhung475.workers.dev/submit` | `modules/diagnostics.js` | Submit consented diagnostic log/report | Linked Read Along diagnostics Worker; separate from Admin usage tracking |
| OTA release metadata | GitHub Releases API | `app.js: checkReadAlongUpdates()` | Find update and APK release | Native plugin downloads GitHub HTTPS APK and invokes Android installer |

## 2. Admin API routes currently present

All routes are implemented in `admin/functions/api/readalong-admin/[[path]].js`.

### Public or app-facing routes
- `POST usage/track`: validates anonymous installation/launch IDs, hashes them and inserts unique visit records.
- `GET usage/stats`: reads catalog counts (manifest or R2 inventory fallback) and aggregate visits/devices.
- `POST telemetry/events`: accepts a bounded event batch, sanitizes details and retains a bounded recent set.

### Authenticated Admin routes
- `login`, `session`, `logout`
- `catalog/preview`, `catalog/publish`
- `diagnostics/scan`
- `files/all`, `files`, `folders`
- `multipart/start`, `multipart/part`, `multipart/complete`, `multipart/abort`
- `rename`, `file`, `folder`, `audit`

Authentication/authorization must be verified from the current implementation before adding any new management route. Do not expose write operations as public endpoints.

## 3. Current architectural findings

1. `app.js` remains a large orchestration module (about 105 KB at the inspected revision). Several pure domains have already been extracted: page sync, playlist layout, catalog mapping, remote marker sync and diagnostics.
2. `index.html` directly loads PDF.js from a pinned CDN and then local scripts. This CDN dependency is a startup dependency; do not change its source/version without a separate compatibility and offline-cache review.
3. Service Worker `sw.js` uses a versioned shell cache with network-first behavior for same-origin app code and intentionally avoids caching PDF/audio files and Range requests.
4. Remote catalog and marker data are already outside the APK. This is the model to extend for config and help/announcement content.
5. Current usage tracking records visits/installations only. Reading/listening duration, session heartbeat, deduplication and date-bucket aggregation are not implemented.
6. The marker sync module writes to the same Read Along repository but currently hardcodes branch `main`; it is a data-sync behavior, not a code-release promotion. Preserve existing compatibility while evaluating whether a dedicated data store would be simpler.
7. There is no current remote-config client or validated remote-config schema in the APK.
8. Admin API already has a single Pages Functions entry point; avoid adding another Worker/service unless an existing route cannot satisfy the requirement.

## 4. Target contract boundaries

### Catalog
Keep the current `books.json` contract stable. Metadata-only additions must be optional and ignored safely by older APK versions. Existing required fields and R2 host validation remain unchanged.

### Markers
Keep current JSON marker shape compatible with `modules/page-sync.js`. Any schema extension must be additive and have a fallback for existing marker files.

### Remote Config (initial static document added; runtime client not deployed)
- Static JSON file: `admin/public/remote-config.json`.
- Expected Pages URL: `https://read-along-admin.pages.dev/remote-config.json` (Pages root `admin`, output `public`; verify after the next successful production deployment).
- Read-only public document; it contains no secrets or user data. Static Pages hosting avoids creating another Worker/API.
- Versioned JSON only; no executable content.
- Whitelisted feature flags and reader defaults only.
- Validate schema/version/expiry; cache last-known-good; fallback to packaged defaults.
- Endpoint host must be allowlisted in the APK.
- Admin write path, if later added, must require existing Admin session and CSRF/origin validation.

### Analytics (proposed; not deployed)
- Separate event schema for reading/listening sessions; do not overload visit counts.
- Anonymous installation ID, event/session ID, sequence, timestamp and bounded duration.
- Server-side idempotency and retention; D1 daily aggregation.
- No book filename, document content, audio URL or personal identifier.
- Dashboard changes stay in Admin; only adding the first reliable event collector requires an APK update.


## 4A. Reading/listening analytics event contract v1 (proposed; not deployed)

The existing `usage/track` route remains visit/install counting and `telemetry/events` remains bounded diagnostic telemetry. Reading-time analytics is a separate data purpose and must use a distinct `analytics/events` route in the existing Read Along Pages Functions router; do not create another Worker by default.

### Consent and collection rules

- Explicit opt-in is required before the client sends any reading/listening analytics event; default is off. Diagnostics-report consent is not reused as analytics consent.
- No analytics request is sent before opt-in. The client must provide a clear explanation and a way to opt out; revocation stops future events.
- Count reading time only while a book is open and the app/document is foreground and visible.
- Count listening time only while audio is actively playing and the app/document is foreground and visible. Reading and listening seconds are separate measures and may overlap by design.
- Emit a heartbeat approximately every 60 seconds. Each duration field is bounded to 0–120 seconds.
- Do not queue or accumulate offline time. If offline or a request fails, drop that interval; analytics must never delay reader startup, PDF rendering or audio playback.
- Event IDs and session IDs are random opaque identifiers. The existing installation ID is hashed server-side before storage. Sequence starts at zero and increments within one session.
- `occurredAt` is client-supplied context only; server `received_at` is authoritative for daily aggregation. Do not infer elapsed time from untrusted client timestamps.
- `bookId` is optional and may contain only an opaque stable catalog ID. If a catalog ID reveals a title, filename or path, omit it. Never send book title, filename, document text, media URL or account/personal identifiers.

### Event semantics

- `reader_start`: a reading session begins after the reader is ready.
- `heartbeat`: periodic bounded `readingSeconds` and/or `listeningSeconds` since the preceding event.
- `reader_pause` / `reader_resume`: the app/document becomes inactive/active while the reading session remains open.
- `reader_stop`: the reader closes or the session ends; include any final bounded duration.
- `audio_play` / `audio_pause` / `audio_stop`: audio playback state transitions; audio duration is attributed only to active playback.

### Payload and server requirements

- Contract is defined by `schemas/analytics-event.schema.json`: schemaVersion 1, eventId, sessionId, installId, sequence, type, occurredAt, platform and appVersion; optional readingSeconds, listeningSeconds and opaque bookId.
- Unknown fields are rejected. Do not add a free-form details object.
- The endpoint accepts bounded batches (maximum 25 events), validates every field, enforces per-install rate limits and rejects malformed or excessive durations.
- D1 deduplication uses unique eventId and unique (sessionId, sequence). Duplicate retries must not increment totals.
- Store only the hash of installId. Keep raw event records for 90 days; retain daily aggregates for 24 months. Retention enforcement is part of the backend implementation, not assumed from the schema.
- This contract is proposed only. No collector, endpoint, D1 analytics tables or dashboard are implemented by this schema change.


### AN2 implementation boundary (backend code staged; deployment pending)

- Route: `POST /api/readalong-admin/analytics/events`, in the existing Pages Functions router. It is separate from visit tracking and diagnostic telemetry; no new Worker.
- Request envelope: `{ consent: true, events: [...] }`; maximum 25 events and 64 KiB. Consent is required by the server, not inferred from diagnostic consent.
- Only app local origins already allowed by this project are accepted when an Origin header is present: localhost and `capacitor://localhost`. No wildcard CORS.
- Installation ID is SHA-256 hashed before persistence. Event and session IDs are opaque random IDs; no free-form metadata.
- Ingest validates the strict v1 contract, caps each duration at 120 seconds, limits each hashed install to 150 events/hour and uses `INSERT OR IGNORE` with unique eventId and (sessionId, sequence) for idempotency.
- D1 migration `admin/migrations/0002_reading_analytics.sql` adds raw events, daily totals, unique daily session IDs and an insert trigger. Raw events are pruned after 90 days; daily aggregates/session IDs after 24 months.
- The additive migration has been applied to the existing `read-along-admin-db` bound as `DB` to Pages project `read-along-admin`; all three tables and the daily trigger were verified via D1. Pages deployment and endpoint smoke test are still pending. Do not point it at another project's database.
- No client collector or analytics dashboard is included in this backend batch. CI [41166166847](https://github.com/blamag999/read-along-android/actions/runs/41166166847) passed, including a production OPTIONS/CORS and explicit-consent rejection smoke test. A valid write/deduplication/aggregate end-to-end test remains pending.

## 5. Migration rules

- Do not change existing public URLs or API behavior until all callers and backward compatibility are identified.
- No parallel duplicate API for a domain without a migration reason.
- Introduce new contract first; add tests; then integrate one caller at a time.
- Keep remote data optional and fail-open to local defaults for non-critical features.
- Reader playback, PDF rendering and page/audio sync must never wait on config/analytics endpoints.
- Document every endpoint, payload schema, authentication model, retention and caller in this file as implementation proceeds.

## 6. Remote Config bootstrap status

- [x] Added an initial versioned static config document with empty feature/default maps and no announcements; it changes no app behavior.
- [x] Added regression checks for the document's required version fields and empty allowlisted sections.
- [x] Cloudflare Pages production deployment completed successfully for the commit containing the static config file.
- [ ] Verify the actual HTTP response/body at `https://read-along-admin.pages.dev/remote-config.json`; deployment success alone does not prove the asset URL.
- [ ] Add a protected Admin editing workflow only if generic file management is not sufficient; do not add another API by default.
- [ ] Integrate an APK client only after backend/schema/cache/fallback tests and one grouped APK update.

## 7. Phase 1 status

- [x] Enumerate current app-facing catalog, media, marker, usage, telemetry, diagnostics and OTA sources.
- [x] Identify existing Admin API route families and trust boundaries.
- [x] Identify current gaps: no remote config; usage tracking is not reading-time analytics.
- [ ] Confirm exact marker JSON precedence and conflict resolution before modifying sync behavior.
- [ ] Define machine-readable JSON schemas and regression tests for catalog/marker/config/analytics.
- [ ] Review endpoint overlap and choose any consolidation only after compatibility analysis.

No APK runtime code was changed as part of this inventory or the initial static config bootstrap.
