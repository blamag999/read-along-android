/* Read Along Remote Config client. Data-only: never executes remote content. */
(function (root) {
  'use strict';
  const CONFIG_URL = 'https://read-along-admin.pages.dev/remote-config.json';
  const CACHE_KEY = 'read_along_remote_config_v1';
  const MAX_RESPONSE_BYTES = 32768;
  const REQUEST_TIMEOUT_MS = 4000;
  const RETRIES = 1;
  const DEFAULT_CONFIG = Object.freeze({
    schemaVersion: 1, configVersion: 1, issuedAt: '1970-01-01T00:00:00Z',
    features: Object.freeze({}), readerDefaults: Object.freeze({}), announcements: Object.freeze([])
  });
  const FEATURE_KEYS = new Set(['showReadingStats', 'showAnnouncements', 'enableOnlineCatalog']);
  const DEFAULT_RULES = {
    pageTurnMode: value => ['next', 'markers', 'off'].includes(value),
    viewMode: value => ['fit-height', 'fit-width', 'two-pages'].includes(value),
    autoSeekAudio: value => typeof value === 'boolean'
  };

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return false;
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
    if (!parts) return false;
    const [, y, m, d, h, min, sec] = parts.map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() &&
      h <= 23 && min <= 59 && sec <= 59;
  }

  function validate(config, now) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    const allowed = new Set(['schemaVersion', 'configVersion', 'issuedAt', 'expiresAt', 'features', 'readerDefaults', 'announcements']);
    if (Object.keys(config).some(key => !allowed.has(key))) return false;
    if (config.schemaVersion !== 1 || !Number.isInteger(config.configVersion) || config.configVersion < 1) return false;
    if (!validDate(config.issuedAt) || (config.expiresAt !== undefined && !validDate(config.expiresAt))) return false;
    if (config.expiresAt !== undefined && Date.parse(config.expiresAt) <= Date.parse(config.issuedAt)) return false;
    if (config.expiresAt !== undefined && Date.parse(config.expiresAt) <= now) return false;
    if (!config.features || typeof config.features !== 'object' || Array.isArray(config.features)) return false;
    if (Object.entries(config.features).some(([key, value]) => !FEATURE_KEYS.has(key) || typeof value !== 'boolean')) return false;
    if (!config.readerDefaults || typeof config.readerDefaults !== 'object' || Array.isArray(config.readerDefaults)) return false;
    if (Object.entries(config.readerDefaults).some(([key, value]) => !DEFAULT_RULES[key] || !DEFAULT_RULES[key](value))) return false;
    if (!Array.isArray(config.announcements) || config.announcements.length > 10) return false;
    const ids = new Set();
    for (const item of config.announcements) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      if (Object.keys(item).some(key => !['id', 'text', 'level'].includes(key))) return false;
      if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 80 || ids.has(item.id)) return false;
      if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500) return false;
      if (item.level !== undefined && !['info', 'warning'].includes(item.level)) return false;
      ids.add(item.id);
    }
    return true;
  }

  function safeClone(value) { return JSON.parse(JSON.stringify(value)); }
  function createClient(options) {
    const opts = options || {};
    const fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const nowFn = opts.now || (() => Date.now());
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? Math.max(250, Math.min(10000, opts.timeoutMs)) : REQUEST_TIMEOUT_MS;
    const retryCount = Number.isInteger(opts.retries) ? Math.max(0, Math.min(RETRIES, opts.retries)) : RETRIES;
    const retryDelayMs = Number.isFinite(opts.retryDelayMs) ? Math.max(0, Math.min(1000, opts.retryDelayMs)) : 200;
    function readCache() {
      try {
        const raw = storage && storage.getItem(CACHE_KEY);
        if (!raw || raw.length > MAX_RESPONSE_BYTES) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !validate(parsed.config, nowFn())) return null;
        return parsed.config;
      } catch (_) { return null; }
    }
    async function requestOnce() {
      if (!fetchFn) throw new Error('fetch unavailable');
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            if (controller) controller.abort();
            reject(new Error('Remote Config request timed out'));
          }, timeoutMs);
        });
        const response = await Promise.race([fetchFn(CONFIG_URL, {
          method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store',
          signal: controller ? controller.signal : undefined
        }), timeout]);
        if (!response || !response.ok) throw new Error('Remote Config HTTP error');
        const type = (response.headers && response.headers.get && response.headers.get('content-type') || '').toLowerCase();
        if (!type.includes('application/json')) throw new Error('Remote Config content type is not JSON');
        const text = await response.text();
        if (typeof text !== 'string' || text.length > MAX_RESPONSE_BYTES) throw new Error('Remote Config response too large');
        let parsed;
        try { parsed = JSON.parse(text); } catch (_) { throw new Error('Remote Config JSON invalid'); }
        if (!validate(parsed, nowFn())) throw new Error('Remote Config contract invalid or expired');
        return parsed;
      } finally { if (timer) clearTimeout(timer); }
    }
    async function load() {
      const cached = readCache();
      let lastError = null;
      for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
          const fresh = await requestOnce();
          if (cached && fresh.configVersion < cached.configVersion) throw new Error('Remote Config version rollback rejected');
          if (storage) {
            try { storage.setItem(CACHE_KEY, JSON.stringify({ config: fresh })); } catch (_) {}
          }
          return { config: safeClone(fresh), source: 'network', error: null };
        } catch (error) {
          lastError = error;
          if (attempt < retryCount && retryDelayMs) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
      return { config: safeClone(cached || DEFAULT_CONFIG), source: cached ? 'cache' : 'default', error: lastError ? lastError.message : 'Remote Config unavailable' };
    }
    return { load, getDefaults: () => safeClone(DEFAULT_CONFIG), validate: config => validate(config, nowFn()) };
  }

  root.ReadAlongRemoteConfig = Object.freeze({
    createClient, validate: config => validate(config, Date.now()),
    configUrl: CONFIG_URL, cacheKey: CACHE_KEY
  });
})(typeof window !== 'undefined' ? window : globalThis);
