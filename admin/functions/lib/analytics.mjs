const ID_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const BOOK_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const APP_VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,40}$/;
const EVENT_TYPES = new Set([
  "reader_start", "heartbeat", "reader_pause", "reader_resume", "reader_stop",
  "audio_play", "audio_pause", "audio_stop"
]);
const ALLOWED_FIELDS = new Set([
  "schemaVersion", "eventId", "sessionId", "installId", "sequence", "type",
  "occurredAt", "readingSeconds", "listeningSeconds", "platform", "appVersion", "bookId"
]);

function validIsoDate(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!parts) return false;
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  return month >= 1 && month <= 12 && day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
    hour <= 23 && minute <= 59 && second <= 59;
}

function validateAnalyticsEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return { valid: false, error: "Event must be an object" };
  if (Object.keys(event).some(key => !ALLOWED_FIELDS.has(key))) return { valid: false, error: "Unknown event field" };
  if (event.schemaVersion !== 1) return { valid: false, error: "Unsupported schemaVersion" };
  for (const field of ["eventId", "sessionId", "installId"]) {
    if (typeof event[field] !== "string" || !ID_PATTERN.test(event[field])) return { valid: false, error: "Invalid " + field };
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) return { valid: false, error: "Invalid sequence" };
  if (!EVENT_TYPES.has(event.type)) return { valid: false, error: "Invalid event type" };
  if (!validIsoDate(event.occurredAt)) return { valid: false, error: "Invalid occurredAt" };
  if (!["android", "web"].includes(event.platform)) return { valid: false, error: "Invalid platform" };
  if (typeof event.appVersion !== "string" || !APP_VERSION_PATTERN.test(event.appVersion)) return { valid: false, error: "Invalid appVersion" };
  for (const field of ["readingSeconds", "listeningSeconds"]) {
    if (event[field] !== undefined && (!Number.isInteger(event[field]) || event[field] < 0 || event[field] > 120)) {
      return { valid: false, error: "Invalid " + field };
    }
  }
  if (event.bookId !== undefined && (typeof event.bookId !== "string" || !BOOK_ID_PATTERN.test(event.bookId))) {
    return { valid: false, error: "Invalid bookId" };
  }
  if (["heartbeat", "reader_pause", "reader_stop"].includes(event.type) &&
      event.readingSeconds === undefined && event.listeningSeconds === undefined) {
    return { valid: false, error: "Duration required for " + event.type };
  }
  if (["audio_pause", "audio_stop"].includes(event.type) && event.listeningSeconds === undefined) {
    return { valid: false, error: "listeningSeconds required for " + event.type };
  }
  return { valid: true, error: null };
}

function validateAnalyticsBatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { valid: false, error: "Invalid request body" };
  if (body.consent !== true) return { valid: false, error: "Analytics consent required" };
  if (Object.keys(body).some(key => !["consent", "events"].includes(key))) return { valid: false, error: "Unknown request field" };
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 25) return { valid: false, error: "Invalid event batch" };
  let installId = null, sessionId = null;
  for (const event of body.events) {
    const result = validateAnalyticsEvent(event);
    if (!result.valid) return result;
    if (installId === null) installId = event.installId;
    if (sessionId === null) sessionId = event.sessionId;
    if (event.installId !== installId || event.sessionId !== sessionId) return { valid: false, error: "A batch must contain one install and one session" };
  }
  const sorted = body.events.slice().sort((a, b) => a.sequence - b.sequence);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].sequence === sorted[i - 1].sequence && sorted[i].eventId !== sorted[i - 1].eventId) {
      return { valid: false, error: "Conflicting sequence in batch" };
    }
  }
  return { valid: true, error: null, installId, sessionId };
}

export { validateAnalyticsEvent, validateAnalyticsBatch };
