/* Privacy-first, opt-in reading/listening duration collector. */
(() => {
  'use strict';

  const ENDPOINT = 'https://read-along-admin.pages.dev/api/readalong-admin/analytics/events';
  const CONSENT_KEY = 'read_along_analytics_consent_v1';
  const INSTALL_KEY = 'read_along_analytics_install_id_v1';
  const HEARTBEAT_MS = 60000;
  const POLL_MS = 5000;
  const MAX_INTERVAL_MS = 120000;

  const audio = document.getElementById('audioElement');
  const modal = document.getElementById('analyticsModal');
  const consentInput = document.getElementById('chkAnalyticsConsent');
  const status = document.getElementById('analyticsStatus');
  const menuButton = document.getElementById('menuAnalytics');
  const closeButton = document.getElementById('btnCloseAnalytics');

  let consent = false;
  let installId = '';
  let sessionId = '';
  let sequence = 0;
  let sessionBookKey = '';
  let sessionActive = false;
  let readingMs = 0;
  let listeningMs = 0;
  let lastAt = performance.now();
  let lastHeartbeatAt = lastAt;
  let previousReadingActive = false;
  let previousListeningActive = false;

  function randomId(prefix) {
    let value = '';
    try {
      value = crypto.randomUUID().replace(/-/g, '');
    } catch (_) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return prefix + value;
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function readConsent() {
    return storageGet(CONSENT_KEY) === 'true';
  }

  function ensureInstallId() {
    if (installId) return installId;
    const saved = storageGet(INSTALL_KEY);
    if (saved && /^[A-Za-z0-9_-]{16,100}$/.test(saved)) {
      installId = saved;
      return installId;
    }
    installId = randomId('install_');
    storageSet(INSTALL_KEY, installId);
    return installId;
  }

  function readerIsOpen() {
    try {
      return typeof state !== 'undefined' && Boolean(state.pdfDoc) && Boolean(state.currentBookKey);
    } catch (_) {
      return false;
    }
  }

  function isVisible() {
    return document.visibilityState !== 'hidden';
  }

  function audioIsPlaying() {
    return Boolean(audio && !audio.paused && !audio.ended);
  }

  function checkpoint() {
    const now = performance.now();
    const delta = Math.max(0, Math.min(MAX_INTERVAL_MS, now - lastAt));
    if (consent && sessionActive) {
      if (previousReadingActive) readingMs += delta;
      if (previousListeningActive) listeningMs += delta;
    }
    lastAt = now;
  }

  function refreshActivityFlags() {
    const active = consent && sessionActive && readerIsOpen() && isVisible();
    previousReadingActive = active;
    previousListeningActive = active && audioIsPlaying();
  }

  function takeDurations() {
    const readingSeconds = Math.min(120, Math.floor(readingMs / 1000));
    const listeningSeconds = Math.min(120, Math.floor(listeningMs / 1000));
    readingMs = Math.max(0, readingMs - readingSeconds * 1000);
    listeningMs = Math.max(0, listeningMs - listeningSeconds * 1000);
    return { readingSeconds, listeningSeconds };
  }

  function sendEvent(type, durations = {}) {
    if (!consent || !sessionId) return false;
    const version = document.querySelector('meta[name="app-version"]')?.content || 'unknown';
    const rawPlatform = window.Capacitor?.getPlatform?.() || 'web';
    const event = {
      schemaVersion: 1,
      eventId: randomId('event_'),
      sessionId,
      installId: ensureInstallId(),
      sequence: sequence++,
      type,
      occurredAt: new Date().toISOString(),
      platform: rawPlatform === 'android' ? 'android' : 'web',
      appVersion: /^[0-9A-Za-z.+-]{1,40}$/.test(version) ? version : 'unknown',
      ...durations
    };
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true, events: [event] })
      }).catch(() => {
        // No offline queue and no retry: failed intervals are intentionally dropped.
      });
    } catch (_) {
      // Synchronous fetch failures are dropped as well; never block reader/audio.
    }
    return true;
  }

  function startSession() {
    if (!consent || sessionActive || !readerIsOpen()) return;
    ensureInstallId();
    sessionId = randomId('session_');
    sequence = 0;
    sessionBookKey = state.currentBookKey;
    sessionActive = true;
    readingMs = 0;
    listeningMs = 0;
    lastHeartbeatAt = performance.now();
    sendEvent('reader_start');
  }

  function stopSession() {
    if (!sessionActive) return;
    checkpoint();
    const durations = takeDurations();
    sendEvent('reader_stop', durations);
    sessionActive = false;
    sessionId = '';
    sessionBookKey = '';
    readingMs = 0;
    listeningMs = 0;
    previousReadingActive = false;
    previousListeningActive = false;
  }

  function syncReaderState() {
    checkpoint();
    const open = readerIsOpen();
    if (sessionActive && (!open || state.currentBookKey !== sessionBookKey)) stopSession();
    if (open && !sessionActive) startSession();

    if (sessionActive) {
      const now = performance.now();
      if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
        const durations = takeDurations();
        lastHeartbeatAt = now;
        if (durations.readingSeconds > 0 || durations.listeningSeconds > 0) {
          sendEvent('heartbeat', durations);
        }
      }
    }
    refreshActivityFlags();
  }

  function handleVisibilityChange() {
    checkpoint();
    const wasReading = previousReadingActive;
    refreshActivityFlags();
    const isReading = previousReadingActive;
    if (sessionActive && wasReading && !isReading) {
      const durations = takeDurations();
      sendEvent('reader_pause', durations);
    } else if (sessionActive && !wasReading && isReading) {
      sendEvent('reader_resume');
    }
    refreshActivityFlags();
  }

  function handleAudioPlay() {
    checkpoint();
    if (sessionActive) sendEvent('audio_play');
    refreshActivityFlags();
  }

  function handleAudioPause() {
    checkpoint();
    if (sessionActive) {
      const durations = takeDurations();
      sendEvent('audio_pause', durations);
    }
    refreshActivityFlags();
  }

  function handleAudioEnded() {
    checkpoint();
    if (sessionActive) {
      const durations = takeDurations();
      sendEvent('audio_stop', durations);
    }
    refreshActivityFlags();
  }

  function handlePageHide() {
    checkpoint();
    if (sessionActive && previousReadingActive) {
      const durations = takeDurations();
      sendEvent('reader_pause', durations);
    }
    previousReadingActive = false;
    previousListeningActive = false;
  }

  function handlePageShow() {
    checkpoint();
    refreshActivityFlags();
    if (sessionActive && previousReadingActive) sendEvent('reader_resume');
  }

  function setConsent(enabled) {
    consent = Boolean(enabled);
    if (consent) {
      storageSet(CONSENT_KEY, 'true');
      ensureInstallId();
      if (status) status.textContent = 'Đã bật thống kê ẩn danh. Chỉ ghi nhận thời lượng khi PDF đang mở và ứng dụng ở foreground.';
      syncReaderState();
      return;
    }
    storageSet(CONSENT_KEY, 'false');
    storageRemove(INSTALL_KEY);
    installId = '';
    sessionId = '';
    sequence = 0;
    sessionBookKey = '';
    sessionActive = false;
    readingMs = 0;
    listeningMs = 0;
    previousReadingActive = false;
    previousListeningActive = false;
    lastAt = performance.now();
    if (status) status.textContent = 'Đã tắt thống kê. Ứng dụng sẽ không gửi thêm dữ liệu sử dụng.';
  }

  function openSettings() {
    if (!modal) return;
    if (consentInput) consentInput.checked = consent;
    if (status) status.textContent = consent
      ? 'Thống kê ẩn danh đang bật. Bạn có thể tắt bất cứ lúc nào.'
      : 'Thống kê đang tắt. Chỉ bật khi bạn chủ động đồng ý.';
    modal.classList.remove('hidden');
  }

  consent = readConsent();
  if (consent) ensureInstallId();

  menuButton?.addEventListener('click', () => {
    document.getElementById('readOptionsMenu')?.classList.add('hidden');
    document.getElementById('btnOpenReadMenu')?.setAttribute('aria-expanded', 'false');
    openSettings();
  });
  closeButton?.addEventListener('click', () => modal?.classList.add('hidden'));
  modal?.addEventListener('click', event => {
    if (event.target === modal) modal.classList.add('hidden');
  });
  consentInput?.addEventListener('change', () => setConsent(consentInput.checked));
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', handlePageShow);
  audio?.addEventListener('play', handleAudioPlay);
  audio?.addEventListener('pause', handleAudioPause);
  audio?.addEventListener('ended', handleAudioEnded);
  setInterval(syncReaderState, POLL_MS);
  syncReaderState();

  window.ReadAlongAnalytics = { openSettings };
})();
