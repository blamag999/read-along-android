const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('modules/remote-config.js', 'utf8');
function makeHarness(options = {}) {
  const store = new Map();
  const storage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, value)
  };
  const window = {};
  const context = vm.createContext({
    window, globalThis: window, Date, JSON, Object, Array, Set, Number, Math, String,
    Promise, Error, RegExp, AbortController, setTimeout, clearTimeout,
    fetch: options.fetch, localStorage: storage
  });
  vm.runInContext(source, context, { filename: 'modules/remote-config.js' });
  return { api: window.ReadAlongRemoteConfig, storage, store };
}
const fixture = {
  schemaVersion: 1, configVersion: 1, issuedAt: '2026-10-31T00:00:00Z',
  features: {}, readerDefaults: {}, announcements: []
};
function response(body, status = 200, type = 'application/json; charset=utf-8') {
  return { ok: status >= 200 && status < 300, status, headers: { get: name => name === 'content-type' ? type : null }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
}
(async () => {
  let calls = 0;
  const online = makeHarness({ fetch: async url => { calls++; assert.equal(url, 'https://read-along-admin.pages.dev/remote-config.json'); return response(fixture); } });
  const loaded = await online.api.createClient({ storage: online.storage, now: () => Date.parse('2026-10-31T01:00:00Z'), retries: 0 }).load();
  assert.equal(loaded.source, 'network');
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.config)), fixture);
  assert.equal(calls, 1);
  assert.ok(online.store.has(online.api.cacheKey), 'Valid network config must be cached');

  const offline = makeHarness({ fetch: async () => { throw new Error('offline'); } });
  offline.storage.setItem(offline.api.cacheKey, JSON.stringify({ config: fixture }));
  const cached = await offline.api.createClient({ storage: offline.storage, now: () => Date.parse('2026-10-31T01:00:00Z'), retries: 0 }).load();
  assert.equal(cached.source, 'cache');

  const firstRun = makeHarness({ fetch: async () => { throw new Error('offline'); } });
  const fallback = await firstRun.api.createClient({ storage: firstRun.storage, now: () => Date.parse('2026-10-31T01:00:00Z'), retries: 0 }).load();
  assert.equal(fallback.source, 'default');
  assert.deepEqual(JSON.parse(JSON.stringify(fallback.config)), JSON.parse(JSON.stringify(firstRun.api.createClient().getDefaults())));

  for (const bad of [
    response('{bad json'), response(fixture, 500), response(fixture, 200, 'text/html'),
    response({ ...fixture, schemaVersion: 2 }), response({ ...fixture, configVersion: 0 }),
    response({ ...fixture, unknown: true }), response({ ...fixture, features: { unlisted: true } }),
    response({ ...fixture, features: { showAnnouncements: 'yes' } }),
    response({ ...fixture, readerDefaults: { viewMode: 'free' } }),
    response({ ...fixture, expiresAt: '2026-10-30T00:00:00Z' }),
    response({ ...fixture, issuedAt: '2026-02-30T00:00:00Z' }),
    response({ ...fixture, announcements: [{ id: 'x', text: 'one' }, { id: 'x', text: 'two' }] }),
    response('x'.repeat(32769))
  ]) {
    const h = makeHarness({ fetch: async () => bad });
    const result = await h.api.createClient({ storage: h.storage, now: () => Date.parse('2026-10-31T01:00:00Z'), retries: 0 }).load();
    assert.equal(result.source, 'default', 'Invalid remote response must fall back to defaults');
    assert.equal(h.store.has(h.api.cacheKey), false, 'Invalid config must never enter cache');
  }

  const rollback = makeHarness({ fetch: async () => response({ ...fixture, configVersion: 1 }) });
  rollback.storage.setItem(rollback.api.cacheKey, JSON.stringify({ config: { ...fixture, configVersion: 2 } }));
  const rollbackResult = await rollback.api.createClient({ storage: rollback.storage, now: () => Date.parse('2026-10-31T01:00:00Z'), retries: 0 }).load();
  assert.equal(rollbackResult.source, 'cache', 'Older configVersion must not replace newer cached config');

  const expiredCache = makeHarness({ fetch: async () => { throw new Error('offline'); } });
  expiredCache.storage.setItem(expiredCache.api.cacheKey, JSON.stringify({ config: { ...fixture, expiresAt: '2026-10-31T00:30:00Z' } }));
  const expiredResult = await expiredCache.api.createClient({ storage: expiredCache.storage, now: () => Date.parse('2026-10-31T01:00:00Z'), retries: 0 }).load();
  assert.equal(expiredResult.source, 'default', 'Expired cached config must not be used');

  console.log('Remote Config client tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
