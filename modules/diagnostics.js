/* Diagnostic event collection and report submission. */
// CHẨN ĐOÁN: gửi log qua Worker trung gian, người dùng không cần đăng nhập GitHub
// GitHub token chỉ được lưu trong secret của Cloudflare Worker.
// =======================================================
(() => {
  const MAX_EVENTS = 350;
  const USAGE_ENDPOINT = 'https://read-along-admin.pages.dev/api/readalong-admin/usage/track';
  function randomUsageId() {
    try { return crypto.randomUUID().replace(/-/g, ''); } catch (_) {
      const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
  }
  function usageId(storage, key) {
    try {
      let value = storage.getItem(key);
      if (!value || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) { value = randomUsageId(); storage.setItem(key, value); }
      return value;
    } catch (_) { return randomUsageId(); }
  }
  function reportAppUsage() {
    let installId, launchId;
    try {
      installId = usageId(localStorage, 'read_along_install_id_v1');
      launchId = usageId(sessionStorage, 'read_along_launch_id_v1');
    } catch (_) { return; }
    const version = document.querySelector('meta[name="app-version"]')?.content || 'unknown';
    const platform = window.Capacitor?.getPlatform?.() || 'web';
    fetch(USAGE_ENDPOINT, { method: 'POST', mode: 'cors', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId, launchId, platform, appVersion: version })
    }).catch(() => {});
  }

  const SUBMIT_URL = 'https://read-along-diagnostics.ndhung475.workers.dev/submit';
  const events = [];
  let lastOrientation = '';
  const modal = document.getElementById('diagnosticsModal');
  const status = document.getElementById('diagnosticsStatus');
  const submit = document.getElementById('btnSubmitDiagnostics');
  const consent = document.getElementById('chkDiagnosticsConsent');
  const safeEventNames = new Set([
    'app.started','audio.play','audio.pause','audio.ended','audio.waiting','audio.stalled',
    'audio.seeking','audio.seeked','audio.error','audio.metadata','pdf.render.start',
    'pdf.render.end','pdf.render.error','viewport.change','orientation.change',
    'orientation.settled','document.hidden','window.error','promise.rejection',
    'page.turn.manual','page.turn.auto','page.turn.waiting','page.turn.no-marker','page.turn.ignored-stale-marker','page.replay','page.replay.error','audio.play.failure','diagnostics.open'
  ]);
  const diagnosticDedupeKeys = new Set();
  function sanitizeDiagnosticText(value) {
    return String(value || '')
      .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
      .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s"'<>]+[\\/])*[^\s"'<>]*/g, '[path]')
      .replace(/\b[^\s"'<>]+\.(?:mp3|m4a|aac|wav|pdf|json|html|js|kt|java)\b/gi, '[file]')
      .slice(0, 180);
  }
  function record(name, details = {}) {
    if (!safeEventNames.has(name)) return;
    if (name === 'page.turn.no-marker') {
      const key = [details.page, details.toPage, details.part, details.reason].join(':');
      if (diagnosticDedupeKeys.has(key)) return;
      diagnosticDedupeKeys.add(key);
    }
    const item = { at: new Date().toISOString(), event: name };
    for (const key of ['page','fromPage','toPage','part','targetTime','fromTime','toTime','width','height','code','line','column']) {
      if (Number.isFinite(details[key])) {
        const value = details[key];
        item[key] = ['targetTime','fromTime','toTime'].includes(key)
          ? Math.round(Math.max(0, Math.min(864000, value)) * 10) / 10
          : Math.max(0, Math.min(1000000, Math.trunc(value)));
      }
    }
    if (Number.isFinite(details.time)) item.audioTime = Math.round(Math.max(0, Math.min(864000, details.time)) * 10) / 10;
    if (typeof details.paused === 'boolean') item.paused = details.paused;
    if (typeof details.beforePaused === 'boolean') item.beforePaused = details.beforePaused;
    if (typeof details.readyState === 'number') item.readyState = Math.max(0, Math.min(4, details.readyState));
    if (typeof details.duration === 'number' && Number.isFinite(details.duration)) item.duration = Math.round(Math.max(0, Math.min(864000, details.duration)) * 10) / 10;
    for (const key of ['orientation','reason','mode','errorName']) {
      if (typeof details[key] === 'string' && details[key]) item[key] = sanitizeDiagnosticText(details[key]);
    }
    if (typeof details.errorMessage === 'string' && details.errorMessage) item.errorMessage = sanitizeDiagnosticText(details.errorMessage);
    events.push(item);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  }
  window.__raDiagRecord = record;
  function audioState() {
    const a = document.getElementById('audioElement');
    const pageEl = document.getElementById('lblCurrentPage');
    const displayedPage = Number(pageEl?.textContent);
    return {
      page: Number.isFinite(state.pageNum) ? state.pageNum : (Number.isFinite(displayedPage) ? displayedPage : 0),
      time: Number.isFinite(a?.currentTime) ? a.currentTime : 0,
      paused: a ? a.paused : true,
      readyState: a ? a.readyState : 0,
      duration: Number.isFinite(a?.duration) ? a.duration : 0
    };
  }
  function snapshot(name, extra = {}) { record(name, { ...audioState(), ...extra }); }
  const audio = document.getElementById('audioElement');
  if (audio) {
    for (const name of ['play','pause','ended','waiting','stalled','seeking','seeked','error','loadedmetadata']) {
      audio.addEventListener(name, () => {
        const extra = name === 'error' && audio.error
          ? { code: audio.error.code, errorName: 'MediaError', errorMessage: audio.error.message || '' }
          : {};
        snapshot(name === 'loadedmetadata' ? 'audio.metadata' : 'audio.' + name, extra);
      }, { passive: true });
    }
  }
  let lastViewportSignature = '';
  const recordViewportChange = () => {
    const orientation = (screen.orientation && screen.orientation.type) || 'unknown';
    const signature = [window.innerWidth || 0, window.innerHeight || 0, orientation].join('x');
    if (signature === lastViewportSignature) return;
    lastViewportSignature = signature;
    snapshot('viewport.change', { orientation, width: window.innerWidth || 0, height: window.innerHeight || 0 });
  };
  window.addEventListener('orientationchange', () => {
    lastOrientation = (screen.orientation && screen.orientation.type) || 'unknown';
    const before = audioState();
    snapshot('orientation.change', { orientation: lastOrientation, fromTime: before.time, beforePaused: before.paused });
    setTimeout(() => {
      const after = audioState();
      snapshot('orientation.settled', {
        orientation: (screen.orientation && screen.orientation.type) || lastOrientation,
        fromTime: before.time,
        toTime: after.time,
        beforePaused: before.paused,
        reason: before.paused === after.paused ? 'playback-state-unchanged' : 'playback-state-changed'
      });
    }, 350);
    recordViewportChange();
  }, { passive: true });
  window.addEventListener('resize', recordViewportChange, { passive: true });
  window.visualViewport?.addEventListener('resize', recordViewportChange, { passive: true });
  document.addEventListener('visibilitychange', () => snapshot('document.hidden', { orientation: document.hidden ? 'hidden' : 'visible' }));
  window.addEventListener('error', event => record('window.error', {
    errorName: event.error?.name || 'Error',
    errorMessage: event.message || '',
    line: event.lineno || 0,
    column: event.colno || 0
  }));
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    record('promise.rejection', {
      errorName: reason?.name || typeof reason,
      errorMessage: reason?.message || (typeof reason === 'string' ? reason : '')
    });
  });
  record('app.started');
  reportAppUsage();
  try { window.Capacitor?.Plugins?.Diagnostics?.markWebViewReady?.(); } catch (_) {}
  function makeReport(nativeResult) {
    const version = document.querySelector('meta[name="app-version"]')?.content || 'unknown';
    const platform = window.Capacitor?.getPlatform?.() || 'web';
    return {
      schemaVersion: 1,
      app: 'Read Along',
      version: /^[0-9A-Za-z.+-]{1,40}$/.test(version) ? version : 'unknown',
      platform: ['android','ios','web'].includes(platform) ? platform : 'other',
      generatedAt: new Date().toISOString(),
      viewport: { width: Math.min(10000, window.innerWidth || 0), height: Math.min(10000, window.innerHeight || 0), orientation: (screen.orientation && screen.orientation.type) || 'unknown' },
      current: audioState(),
      events: events.slice(-MAX_EVENTS),
      nativeLifecycleAvailable: nativeResult.available,
      nativeLifecycle: nativeResult.lines
    };
  }
  async function getNativeLogs() {
    const plugin = window.Capacitor?.Plugins?.Diagnostics;
    if (!plugin?.getLogs) return { available: false, lines: [] };
    try {
      const result = await plugin.getLogs();
      return { available: true, lines: Array.isArray(result.lines) ? result.lines.slice(-250).map(String) : [] };
    } catch (_) { return { available: false, lines: [] }; }
  }
  function downloadText(name, content) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function showIssueLink(url) {
    if (!status) return;
    status.textContent = 'Đã gửi log thành công. ';
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Mở báo cáo vừa tạo';
    status.appendChild(link);
  }

  document.getElementById('menuDiagnostics')?.addEventListener('click', () => {
    snapshot('diagnostics.open');
    modal?.classList.remove('hidden');
    if (submit) submit.disabled = false;
    if (status) status.textContent = 'Nhật ký sẽ được gửi qua dịch vụ trung gian và tạo báo cáo công khai. Bạn không cần đăng nhập.';
  });
  document.getElementById('btnCloseDiagnostics')?.addEventListener('click', () => modal?.classList.add('hidden'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  consent?.addEventListener('change', () => {
    if (consent.checked && status) status.textContent = 'Đã đồng ý. Khi nhấn gửi, nhật ký sẽ được đưa vào báo cáo công khai.';
  });
  document.getElementById('btnExportDiagnostics')?.addEventListener('click', async () => {
    const report = makeReport(await getNativeLogs());
    downloadText('read-along-diagnostics-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json', JSON.stringify(report, null, 2));
    if (status) status.textContent = 'Đã xuất tệp log JSON. Kiểm tra nội dung trước khi chia sẻ.';
  });
  submit?.addEventListener('click', async () => {
    if (!consent?.checked) {
      if (status) status.textContent = 'Vui lòng đánh dấu ô đồng ý trước khi tiếp tục.';
      consent?.focus();
      return;
    }
    submit.disabled = true;
    if (status) status.textContent = 'Đang gửi nhật ký chẩn đoán…';
    let json = '';
    try {
      const report = makeReport(await getNativeLogs());
      json = JSON.stringify(report, null, 2);
      const response = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report })
      });
      let result = {};
      try { result = await response.json(); } catch (_) {}
      if (!response.ok || !result.success || !result.issueUrl) {
        const message = result.error || ('Máy chủ trả về HTTP ' + response.status);
        throw new Error(message);
      }
      showIssueLink(result.issueUrl);
    } catch (error) {
      if (json) downloadText('read-along-diagnostics-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json', json);
      console.warn('Không thể gửi nhật ký chẩn đoán:', error);
      if (status) status.textContent = 'Chưa gửi được nhật ký. Đã tải tệp JSON để bạn có thể gửi thủ công.';
    } finally {
      submit.disabled = false;
    }
  });
})();
