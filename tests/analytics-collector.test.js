const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Target {
  constructor() { this.listeners = {}; this.classList = { add() {}, remove() {}, contains() { return false; } }; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name, event = {}) { for (const callback of this.listeners[name] || []) callback({ target: this, ...event }); }
  setAttribute() {}
}

(async () => {
  const audio = new Target();
  audio.paused = true;
  audio.ended = false;
  const modal = new Target();
  const checkbox = new Target();
  checkbox.checked = false;
  const status = { textContent: '' };
  const menu = new Target();
  const readMenu = new Target();
  const readMenuButton = new Target();
  const elements = {
    audioElement: audio,
    analyticsModal: modal,
    chkAnalyticsConsent: checkbox,
    analyticsStatus: status,
    menuAnalytics: menu,
    readOptionsMenu: readMenu,
    btnOpenReadMenu: readMenuButton,
    btnCloseAnalytics: new Target()
  };
  const document = new Target();
  document.visibilityState = 'visible';
  document.getElementById = id => elements[id] || null;
  document.querySelector = () => ({ content: '1.3.5' });
  const window = new Target();
  window.Capacitor = { getPlatform: () => 'android' };
  const values = new Map();
  const localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
  let now = 0;
  let idCounter = 0;
  const timers = [];
  const requests = [];
  let failNextRequest = false;
  let holdRequests = false;
  const context = {
    window, document, state: { pdfDoc: null, currentBookKey: '' }, localStorage,
    performance: { now: () => now },
    crypto: { randomUUID: () => String(++idCounter).padStart(32, '0'), getRandomValues: bytes => bytes.fill(1) },
    Uint8Array, Date, Math, Number, Boolean, String, JSON, Promise,
    setInterval: callback => { timers.push(callback); return timers.length; },
    fetch: (url, options) => {
      requests.push({ url, options });
      if (failNextRequest) { failNextRequest = false; return Promise.reject(new Error('offline')); }
      if (holdRequests) return new Promise(() => {});
      return Promise.resolve({ ok: true });
    },
    console
  };
  vm.runInNewContext(fs.readFileSync('modules/analytics-collector.js', 'utf8'), context);
  const tick = async (ms = 5000) => { now += ms; timers[0](); await Promise.resolve(); await Promise.resolve(); };

  assert.equal(requests.length, 0, 'no event is sent until a book is open');
  assert.equal(values.get('read_along_analytics_consent_v1'), 'true', 'personal usage analytics is enabled by default');
  assert.ok(values.get('read_along_analytics_install_id_v1'), 'default-enabled analytics creates a random installation ID');
  assert.equal(typeof context.window.ReadAlongAnalytics.setEnabled, 'function', 'analytics can still be disabled programmatically');
  context.state.pdfDoc = {};
  context.state.currentBookKey = 'private-book-title.pdf';
  holdRequests = true;
  await tick();
  let sent = requests.map(x => JSON.parse(x.options.body).events[0]);
  assert.equal(sent[0].type, 'reader_start');
  const firstSessionId = sent[0].sessionId;
  const initialInstallId = sent[0].installId;
  assert.equal(sent[0].platform, 'android');
  assert.equal('bookId' in sent[0], false);
  assert.equal(JSON.stringify(sent).includes('private-book-title'), false, 'book key/title must never leave the device');

  await tick(55000);
  sent = requests.map(x => JSON.parse(x.options.body).events[0]);
  const heartbeat = sent.find(x => x.type === 'heartbeat');
  assert.equal(heartbeat.readingSeconds, 60);
  assert.equal(heartbeat.listeningSeconds, 0);

  audio.paused = false;
  audio.dispatch('play');
  await Promise.resolve();
  await tick(10000);
  audio.paused = true;
  audio.dispatch('pause');
  await Promise.resolve();
  sent = requests.map(x => JSON.parse(x.options.body).events[0]);
  const pause = sent.find(x => x.type === 'audio_pause');
  assert.equal(pause.listeningSeconds, 10);
  assert.equal(pause.readingSeconds, 10);

  audio.paused = false;
  audio.ended = false;
  audio.dispatch('play');
  await Promise.resolve();
  await tick(3000);
  audio.ended = true;
  audio.paused = true;
  audio.dispatch('ended');
  await Promise.resolve();
  sent = requests.map(x => JSON.parse(x.options.body).events[0]);
  const stoppedAudio = sent.find(x => x.type === 'audio_stop');
  assert.equal(stoppedAudio.listeningSeconds, 3);

  const countBeforeHidden = requests.length;
  document.visibilityState = 'hidden';
  document.dispatch('visibilitychange');
  await Promise.resolve();
  await tick(60000);
  assert.equal(requests.length, countBeforeHidden + 1, 'hidden time must not create heartbeat telemetry');
  const hiddenEvent = requests.slice(countBeforeHidden).map(x => JSON.parse(x.options.body).events[0]);
  assert.equal(hiddenEvent[0].type, 'reader_pause');

  document.visibilityState = 'visible';
  document.dispatch('visibilitychange');
  await Promise.resolve();
  assert.equal(JSON.parse(requests.at(-1).options.body).events[0].type, 'reader_resume');
  window.dispatch('pagehide');
  await Promise.resolve();
  assert.equal(JSON.parse(requests.at(-1).options.body).events[0].type, 'reader_pause');
  window.dispatch('pageshow');
  await Promise.resolve();
  assert.equal(JSON.parse(requests.at(-1).options.body).events[0].type, 'reader_resume');

  context.state.pdfDoc = null;
  await tick();
  assert.equal(JSON.parse(requests.at(-1).options.body).events[0].type, 'reader_stop');

  context.state.pdfDoc = {};
  context.state.currentBookKey = 'another-private-book.pdf';
  await tick();
  const switchedSessionStart = JSON.parse(requests.at(-1).options.body).events[0];
  assert.equal(switchedSessionStart.type, 'reader_start', 'switching PDF starts a new analytics session');
  assert.notEqual(switchedSessionStart.sessionId, firstSessionId, 'PDF switch must start a distinct session');
  window.dispatch('orientationchange');
  await tick(5000);
  assert.equal(requests.map(item => JSON.parse(item.options.body).events[0]).filter(event => event.type === 'reader_start' && event.sessionId === switchedSessionStart.sessionId).length, 1,
    'rotation must not start a duplicate reader session');

  failNextRequest = true;
  const beforeOfflineHeartbeat = requests.length;
  await tick(60000);
  assert.equal(requests.length, beforeOfflineHeartbeat + 1, 'offline heartbeat is attempted once');
  await tick(5000);
  assert.equal(requests.length, beforeOfflineHeartbeat + 1, 'failed interval is dropped without retry or queue');

  audio.paused = false;
  audio.ended = false;
  audio.dispatch('play');
  await Promise.resolve();
  await tick(4000);
  window.dispatch('pagehide');
  await Promise.resolve();
  const pageHideEvent = JSON.parse(requests.at(-1).options.body).events[0];
  assert.equal(pageHideEvent.type, 'reader_pause');
  assert.equal(pageHideEvent.readingSeconds, 9, 'only time since the failed heartbeat should remain pending');
  assert.equal(pageHideEvent.listeningSeconds, 4, 'pagehide must preserve foreground listening duration');

  context.window.ReadAlongAnalytics.setEnabled(false);
  const countAfterOptOut = requests.length;
  await tick(60000);
  assert.equal(requests.length, countAfterOptOut, 'opt-out must stop collection immediately');
  assert.equal(values.get('read_along_analytics_consent_v1'), 'false');
  const installIdAfterOptOut = values.get('read_along_analytics_install_id_v1');
  assert.ok(installIdAfterOptOut, 'opt-out retains the random local install ID but stops all collection');
  context.window.ReadAlongAnalytics.setEnabled(true);
  await Promise.resolve();
  const reconsentEvent = JSON.parse(requests.at(-1).options.body).events[0];
  assert.equal(reconsentEvent.installId, initialInstallId, 're-consent on the same app install must retain the same installation identity');
  context.window.ReadAlongAnalytics.setEnabled(false);

  const allEvents = requests.map(item => JSON.parse(item.options.body).events[0]);
  assert.equal(new Set(allEvents.map(event => event.eventId)).size, allEvents.length, 'event IDs must be unique');
  for (const session of new Set(allEvents.map(event => event.sessionId))) {
    const sequence = allEvents.filter(event => event.sessionId === session).map(event => event.sequence);
    assert.deepEqual(sequence, sequence.map((_, index) => index), 'sequence must increase monotonically within each session');
  }
  assert.equal(JSON.stringify(allEvents).includes('another-private-book'), false, 'PDF names must not be transmitted');

  console.log('Analytics collector default-on, timing, foreground, privacy and opt-out tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
