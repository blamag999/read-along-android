# Marker Sources & API Boundary Review

> Read-only review of the `beta` implementation on 2026-10-31. This document records observed behavior and a safe migration direction. It does not change runtime behavior.

## 1. Marker sources currently used

| Source | Read path | Write path | Current role |
|---|---|---|---|
| Explicit JSON selected with a local book/folder | File/Blob passed to `resetAndLoadSyncForBook()` | Local file auto-save/download | User-provided local marker file |
| R2 marker URL from catalog | `story.json.url` → `resetAndLoadSyncForBook()` | Admin publishes catalog reference; marker file itself managed separately | Public marker source associated with online book |
| GitHub repository | Raw URL `sync_data/<stem>.json` on branch `main` | GitHub Contents API PUT on branch `main` | Optional cross-device marker sync |
| Browser localStorage | `sync_<bookKey>` | `saveSyncToStorage()` | Local persistence/fallback |

## 2. Exact current load behavior

Observed in `app.js` and `modules/remote-sync.js`:

1. `resetAndLoadSyncForBook()` clears in-memory markers, sets the new book key and resets the page/audio position.
2. If an explicit JSON Blob was supplied, it is parsed and applied immediately; the function returns. R2/GitHub/localStorage are not consulted.
3. If a catalog R2 marker URL is supplied and returns a valid object, it is applied and saved to localStorage. The code then calls `loadCloudSyncForBook()`; if GitHub has a matching file, that file replaces the R2 markers.
4. If R2 is absent/invalid, the function searches selected folder files named `<bookKey>_sync.json` then `<bookKey>.json`.
5. It then tries GitHub raw marker files, and only after that tries localStorage.
6. If no source succeeds, markers remain empty.

### Important findings

- The code comment says GitHub is used when it is newer than R2, but the implementation does not compare timestamps, version numbers, hashes or sequence numbers. A valid GitHub file always replaces R2 data in this path.
- There is no merge. Each accepted source replaces the entire marker map.
- The relative order of folder JSON, GitHub and localStorage differs depending on whether a valid R2 marker URL exists.
- GitHub marker sync is pinned to branch `main`, while application code development is on `beta`. This is a deliberate data/code separation in the current module, but it must be documented because it is easy to confuse with code promotion.
- Legacy marker values are numeric seconds; multi-part audio also supports objects `{ "time": seconds, "part": zeroBasedAudioIndex }`.
- Existing sources do not carry a reliable common `updatedAt`, schema version, revision or origin field. Therefore the app cannot safely determine which whole map is newest.

## 3. Recommended target behavior — pending implementation

Do not silently change the existing precedence until the marker contract is versioned. The safe migration sequence is:

1. Keep legacy numeric/object marker parsing.
2. A proposed versioned envelope is now specified in `schemas/marker.schema.json`: `schemaVersion: 1`, monotonically increasing `revision`, ISO `updatedAt`, `sourceId` and a `markers` object. Legacy page-number maps remain accepted by the same schema.
3. Proposed conflict rules for the runtime migration:
   - A user-selected local file is an explicit import and remains highest priority only when the user intentionally selects/imports it.
   - For normal online book opening, compare `revision` only among versioned copies of the same logical book; use `updatedAt` only as a deterministic tie-breaker. Never compare timestamps from untrusted device clocks as the sole freshness proof.
   - LocalStorage is a recovery candidate; use its revision when present. Legacy localStorage without metadata follows the documented legacy fallback order.
   - If legacy sources have no revision metadata and conflict, do not merge guesses. Preserve current legacy order for backward compatibility: R2 is loaded first, then a valid GitHub copy replaces it; if no valid R2 marker is available, folder JSON is tried, then GitHub, then localStorage.
   - An empty `markers` object is valid and means the user intentionally cleared all markers; do not treat it as a missing file.
4. Add tests for stale/newer revisions, equal revisions, missing metadata, invalid JSON, offline fallback, part-index bounds and legacy values.
5. Migrate only after the reader can read both legacy and versioned formats. Do not rewrite or delete existing marker files automatically.


## 3A. Resolved marker conflict policy (pure resolver; runtime integration pending)

The policy applies only to candidates already scoped to the same logical book key. The current envelope has no independent book identifier, so callers must never compare revisions across different books.

1. An explicit user import is authoritative for that import action. A valid legacy map or versioned envelope is accepted; an empty versioned `markers: {}` is an intentional clear-all. An invalid explicit import must be rejected and must not silently fall back to another source.
2. For normal book opening, validate every candidate before comparison. Reject arrays, malformed page keys, negative/non-finite timestamps, invalid part indices, unknown envelope fields, unsupported schema versions and invalid dates.
3. If at least one valid versioned envelope exists, ignore legacy candidates for freshness selection and choose the highest integer revision. Do not compare device timestamps across different revisions.
4. If multiple highest-revision envelopes have identical marker content, use `updatedAt` only as a deterministic tie-breaker; then use source priority `localStorage → R2 → GitHub → folder`.
5. If highest-revision envelopes have different marker content, report a conflict. Preserve the localStorage candidate when present; otherwise use deterministic fallback `R2 → GitHub → folder`. Never auto-persist a conflict result or overwrite any source.
6. If no valid versioned envelope exists, preserve legacy behavior exactly: when R2 exists, GitHub replaces it if a valid GitHub legacy map exists; otherwise retain R2. If R2 is absent, use folder JSON, then GitHub, then localStorage. This is compatibility order, not a claim that one legacy copy is newer.
7. Never merge marker maps automatically. Empty legacy `{}` remains invalid/ambiguous; use the versioned empty envelope to represent an intentional clear-all.
8. During migration, keep legacy readers and writers intact until dual-format read/write, atomic persistence and recovery tests are complete. Do not rewrite or delete source files automatically.

Implementation boundary:
- `modules/marker-resolver.js` is a pure, isolated policy implementation and is not yet called by `app.js` or `modules/remote-sync.js`.
- `tests/marker-resolver.test.js` covers version ordering, same-revision identical/conflicting content, local recovery, legacy fallback, explicit import, clear-all, malformed values and audio-part bounds.
- This batch does not change reader behavior, marker storage, native code or APK runtime. Runtime migration remains a separate step after review of the policy and migration/write semantics.

## 4. API overlap review

| Endpoint/service | Data / purpose | Authentication | Overlap assessment |
|---|---|---|---|
| Admin Pages `POST usage/track` | Anonymous launch/visit and installation counts | Public with input validation and hashed IDs | Not the same as event telemetry; it is a compact visit counter |
| Admin Pages `GET usage/stats` | Inventory counts and visit/device aggregates | Public read | Dashboard query; not an ingest endpoint |
| Admin Pages `POST telemetry/events` | Bounded client diagnostic event batches in D1 | Origin-checked | Not the same as public issue submission; event diagnostics |
| Diagnostics Worker `POST /submit` | User-consented full report creates GitHub Issue | Public, rate-limited; GitHub token server-side | Distinct workflow: explicit issue submission |
| Admin Pages `GET diagnostics/scan` | Scans R2 inventory and stores scan audit | Admin session | Operational library diagnostics; not app telemetry |
| Admin Pages catalog preview/publish | Validates R2 inventory and publishes `books.json` | Admin session + origin checks for publish | Catalog management; no duplicate endpoint found |
| GitHub Contents API `sync_data/*.json` | User-authorized marker sync | User-provided session token | Separate storage provider/legacy sync path, not duplicate Admin API |

### Decision

- **Do not merge `usage/track` into `telemetry/events` now.** They have different volume, data retention and query patterns; combining them would make visit counting dependent on diagnostic event ingestion.
- **Do not merge Diagnostics Worker `/submit` with `telemetry/events`.** One creates a public GitHub Issue after explicit user consent; the other stores bounded event records for operational analysis.
- **Do not merge catalog preview/publish with usage stats.** They have different authorization and mutation boundaries.
- Keep the single Admin Pages Functions router for Admin APIs. Do not add a second Analytics Worker unless a concrete scaling or isolation requirement appears.
- The main duplication risk is not duplicated API routes; it is multiple marker storage sources with unclear freshness semantics. Address that with a versioned marker contract before changing code.
- The diagnostics client currently calls more than one endpoint for distinct events/reporting. Keep the behavior separate but centralize URL, timeout and payload handling only when a shared client is introduced; do not funnel full reports into the generic event collector.

## 5. Phase 1 completion checklist

- [x] Inventory current marker sources, read/write paths and current precedence.
- [x] Identify the incorrect "GitHub newer" assumption: there is no freshness comparison.
- [x] Review current Admin usage, telemetry, diagnostics and catalog routes for actual functional overlap.
- [x] Decide not to merge semantically distinct endpoints.
- [x] Draft versioned marker envelope schema v1 while retaining legacy map support; allow empty maps for clear-all behavior.
- [ ] Implement and test revision-aware conflict policy in the APK only after runtime migration is scheduled.
- [ ] Add contract tests and backward-compatible reader migration.
- [ ] Only then change runtime marker loading/sync behavior.

No runtime code or user marker data was changed by this review. The schema update is documentation/contract only; no marker files were rewritten.
