const assert = require('node:assert/strict');

(async () => {
  const { validateAnalyticsEvent, validateAnalyticsBatch } = await import('../admin/functions/lib/analytics.mjs');
  const event = (overrides = {}) => ({
    schemaVersion: 1,
    eventId: 'event_0123456789abcde',
    sessionId: 'session_0123456789ab',
    installId: 'install_0123456789ab',
    sequence: 0,
    type: 'reader_start',
    occurredAt: '2026-10-31T03:00:00Z',
    platform: 'android',
    appVersion: '1.3.5',
    ...overrides
  });

  assert.equal(validateAnalyticsEvent(event()).valid, true);
  assert.equal(validateAnalyticsEvent(event({ type: 'heartbeat', readingSeconds: 60, listeningSeconds: 60 })).valid, true);
  assert.equal(validateAnalyticsEvent(event({ type: 'audio_pause', listeningSeconds: 32 })).valid, true);
  assert.equal(validateAnalyticsEvent(event({ type: 'heartbeat' })).valid, false, 'heartbeat requires measured duration');
  assert.equal(validateAnalyticsEvent(event({ type: 'audio_stop' })).valid, false, 'audio stop requires listening duration');
  assert.equal(validateAnalyticsEvent(event({ readingSeconds: 121 })).valid, false);
  assert.equal(validateAnalyticsEvent(event({ listeningSeconds: -1 })).valid, false);
  assert.equal(validateAnalyticsEvent(event({ occurredAt: '2026-02-30T12:00:00Z' })).valid, false);
  assert.equal(validateAnalyticsEvent(event({ bookId: 'book title / private' })).valid, false);
  assert.equal(validateAnalyticsEvent(event({ filename: 'private.pdf' })).valid, false, 'unapproved content fields are rejected');
  assert.equal(validateAnalyticsEvent(event({ eventId: 'short' })).valid, false);

  assert.equal(validateAnalyticsBatch({ consent: true, events: [event()] }).valid, true);
  assert.equal(validateAnalyticsBatch({ consent: false, events: [event()] }).valid, false);
  assert.equal(validateAnalyticsBatch({ events: [event()] }).valid, false, 'consent is required by the ingest contract');
  assert.equal(validateAnalyticsBatch({ consent: true, events: [] }).valid, false);
  assert.equal(validateAnalyticsBatch({ consent: true, events: Array.from({ length: 26 }, (_, i) => event({ sequence: i, eventId: 'event_' + String(i).padStart(12, '0') })) }).valid, false);
  assert.equal(validateAnalyticsBatch({ consent: true, events: [event(), event({ sessionId: 'session_abcdefghijkl' })] }).valid, false, 'one batch must contain one session');
  assert.equal(validateAnalyticsBatch({ consent: true, extra: true, events: [event()] }).valid, false);
  assert.equal(validateAnalyticsBatch({ consent: true, events: [event(), event({ sequence: 0, eventId: 'event_abcdefghijkl' })] }).valid, false, 'sequence collisions in a batch are rejected');
  console.log('Analytics privacy and validation tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
