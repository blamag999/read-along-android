const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
vm.runInContext(fs.readFileSync('modules/marker-resolver.js', 'utf8'), vm.createContext({ window, Date, Number, Object, Array, Math, JSON, Set, String }));
const resolver = window.ReadAlongMarkerResolver;
const envelope = (revision, markers, updatedAt = '2026-10-31T00:00:00Z', sourceId = 'device-a') => ({
  schemaVersion: 1, revision, updatedAt, sourceId, markers
});

assert.equal(resolver.classify({ 1: 0, 2: { time: 12, part: 1 } }).kind, 'legacy');
assert.equal(resolver.classify({}).kind, undefined, 'empty legacy maps are not valid imports');
assert.equal(resolver.classify(envelope(1, {})).kind, 'versioned', 'empty versioned map represents clear-all');
assert.equal(resolver.classify(envelope(0, { 1: 0 })), null, 'revision must be positive');
assert.equal(resolver.classify(envelope(1, { 1: -1 })), null, 'negative marker is invalid');
assert.equal(resolver.classify(envelope(1, { 1: { time: 2, part: 2 } }), { audioCount: 2 }), null, 'part index must be within audio count');
assert.equal(resolver.classify({ schemaVersion: 1, revision: 1, updatedAt: 'invalid', sourceId: 'x', markers: {} }), null);
assert.equal(resolver.classify({ schemaVersion: 1, revision: 1, updatedAt: '2026-10-31T00:00:00Z', sourceId: 'x', markers: {}, extra: true }), null);

let result = resolver.resolve([
  { source: 'r2', data: envelope(2, { 1: 20 }) },
  { source: 'github', data: envelope(3, { 1: 30 }) },
  { source: 'localStorage', data: envelope(1, { 1: 10 }) }
]);
assert.equal(result.selected, 'github');
assert.equal(result.revision, 3, 'highest revision wins independent of source order');

result = resolver.resolve([
  { source: 'r2', data: envelope(4, { 1: 40 }, '2026-10-31T00:00:00Z') },
  { source: 'github', data: envelope(4, { 1: 40 }, '2026-10-31T01:00:00Z') }
]);
assert.equal(result.selected, 'github', 'identical content at same revision uses updatedAt as tie-breaker');
assert.equal(result.conflict, false);

result = resolver.resolve([
  { source: 'r2', data: envelope(5, { 1: 50 }) },
  { source: 'github', data: envelope(5, { 1: 55 }) },
  { source: 'localStorage', data: envelope(4, { 1: 44 }) }
]);
assert.equal(result.status, 'conflict', 'same revision with different content must be surfaced');
assert.equal(result.selected, 'localStorage', 'conflict resolution preserves local recovery copy');
assert.equal(result.persist, false, 'conflict must never auto-persist or overwrite another source');

result = resolver.resolve([
  { source: 'r2', data: { 1: 10 } },
  { source: 'github', data: { 1: 20 } },
  { source: 'localStorage', data: { 1: 5 } }
]);
assert.equal(result.selected, 'github', 'legacy fallback preserves historical R2 then GitHub replacement');

result = resolver.resolve([
  { source: 'folder', data: { 1: 15 } },
  { source: 'localStorage', data: { 1: 5 } }
]);
assert.equal(result.selected, 'folder', 'legacy folder data precedes localStorage when cloud is absent');

result = resolver.resolve([
  { source: 'import', data: envelope(1, {}) },
  { source: 'github', data: envelope(99, { 1: 99 }) }
], { explicitImport: true });
assert.equal(result.selected, 'import', 'explicit user import always wins');
assert.deepEqual(JSON.parse(JSON.stringify(result.markers)), {}, 'explicit clear-all import is preserved');

result = resolver.resolve([{ source: 'github', data: { 1: 'bad' } }]);
assert.equal(result.status, 'empty', 'malformed sources are ignored');
console.log('Marker resolver tests passed.');
