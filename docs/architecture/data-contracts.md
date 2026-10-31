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

### Remote Config (proposed; not deployed)
- Read-only public endpoint or static JSON on the existing Read Along origin/R2.
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

## 5. Migration rules

- Do not change existing public URLs or API behavior until all callers and backward compatibility are identified.
- No parallel duplicate API for a domain without a migration reason.
- Introduce new contract first; add tests; then integrate one caller at a time.
- Keep remote data optional and fail-open to local defaults for non-critical features.
- Reader playback, PDF rendering and page/audio sync must never wait on config/analytics endpoints.
- Document every endpoint, payload schema, authentication model, retention and caller in this file as implementation proceeds.

## 6. Phase 1 status

- [x] Enumerate current app-facing catalog, media, marker, usage, telemetry, diagnostics and OTA sources.
- [x] Identify existing Admin API route families and trust boundaries.
- [x] Identify current gaps: no remote config; usage tracking is not reading-time analytics.
- [ ] Confirm exact marker JSON precedence and conflict resolution before modifying sync behavior.
- [ ] Define machine-readable JSON schemas and regression tests for catalog/marker/config/analytics.
- [ ] Review endpoint overlap and choose any consolidation only after compatibility analysis.

No runtime code was changed as part of this inventory.
