const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', name), 'utf8'));
const catalog = readJson('catalog.schema.json');
const marker = readJson('marker.schema.json');
const analytics = readJson('analytics-event.schema.json');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'admin', 'public', 'books.json'), 'utf8'));

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(appSource.includes("window.confirm('Đóng sách “' + title + '”?')"), 'Close-book confirmation uses the approved concise copy');
assert.ok(appSource.includes("window.confirm('Bạn muốn thoát Read Along?')"), 'Exit confirmation uses the approved concise copy');
assert.ok(appSource.includes("window.confirm('Tiếp tục xem: ' + resumeLabel + '?')"), 'Reading-position confirmation uses the approved concise copy');
assert.ok(appSource.includes("confirm('Xóa tất cả mốc thời gian của sách?')"), 'Clear-markers confirmation uses the approved concise copy');
assert.ok(appSource.includes("if (!shouldResume) {") && appSource.includes("state.sessionRestorePending = false;"), 'Declining reading-position restore keeps the existing start-from-beginning path');
assert.ok(appSource.includes("if (confirm('Xóa tất cả mốc thời gian của sách?')) {") && appSource.includes('state.pageTimestamps = {};'), 'Marker deletion remains guarded by confirmation');
assert.ok(appSource.includes("'Có bản cập nhật Read Along ' + manifest.version + '.\\n\\n' +"), 'OTA confirmation identifies the new app version');

for (const schema of [catalog, marker, analytics]) {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(schema.$id.startsWith('https://read-along-admin.pages.dev/'));
}

assert.deepEqual(catalog.required, ['books']);
assert.deepEqual(catalog.properties.books.items.required, ['id', 'title', 'pdf', 'audios']);
assert.ok(catalog.properties.books.items.properties.sync.oneOf.some(x => x.type === 'null'), 'Catalog sync remains optional/null-compatible');
assert.equal(catalog.properties.books.items.properties.pdf.$ref, '#/$defs/asset');
assert.ok(catalog.$defs.asset.oneOf.some(x => x.type === 'string'), 'Legacy string asset references remain supported');
assert.ok(catalog.$defs.asset.oneOf.some(x => x.type === 'object'), 'Named asset references remain supported');

assert.ok(Array.isArray(manifest.books) && manifest.books.length > 0, 'Repository catalog fixture must contain books');
for (const book of manifest.books) {
  assert.equal(typeof book.id, 'string');
  assert.ok(book.id.length > 0 && book.id.length <= 160);
  assert.equal(typeof book.title, 'string');
  assert.ok(book.title.length > 0 && book.title.length <= 300);
  assert.ok(typeof book.pdf === 'string' && Array.isArray(book.audios) && book.audios.length > 0, 'Every book must have a PDF and at least one audio');
  const assets = [book.pdf, ...book.audios, ...(book.sync ? [book.sync] : [])];
  for (const asset of assets) {
    assert.equal(typeof asset, 'string', 'Current published catalog uses legacy string asset URLs');
    const url = new URL(asset);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'pub-763a3a5ae235415cbef15b64f7a20820.r2.dev');
  }
}

assert.equal(marker.oneOf.length, 2, 'Marker schema must accept legacy and versioned formats during migration');
const legacyMap = marker.$defs.legacyMap;
assert.equal(legacyMap.propertyNames.pattern, '^[1-9][0-9]*$');
assert.equal(marker.$defs.markerValue.oneOf[0].type, 'number', 'Legacy numeric marker values remain supported');
assert.deepEqual(marker.$defs.markerValue.oneOf[1].required, ['time']);
assert.equal(marker.$defs.markerValue.oneOf[1].properties.part.type, 'integer');
assert.equal(marker.$defs.markerMap.propertyNames.pattern, '^[1-9][0-9]*$');
assert.equal(marker.$defs.versionedEnvelope.properties.schemaVersion.const, 1);
assert.deepEqual(marker.$defs.versionedEnvelope.required, ['schemaVersion', 'revision', 'updatedAt', 'sourceId', 'markers']);
assert.equal(marker.$defs.versionedEnvelope.properties.markers.$ref, '#/$defs/markerMap');
assert.equal(marker.$defs.versionedEnvelope.additionalProperties, false, 'Versioned marker envelope rejects unknown fields');
assert.equal(marker.$defs.markerMap.minProperties, undefined, 'An empty marker map must represent clear-all');

assert.equal(analytics.properties.schemaVersion.const, 1);
assert.ok(analytics.required.includes('eventId') && analytics.required.includes('sessionId') && analytics.required.includes('installId') && analytics.required.includes('sequence'));
assert.equal(analytics.properties.readingSeconds.maximum, 120);
assert.equal(analytics.properties.listeningSeconds.maximum, 120);
assert.equal(analytics.properties.durationSeconds, undefined, 'Reading and listening time must be tracked separately');
assert.equal(analytics.properties.bookId.pattern, '^[A-Za-z0-9_-]{1,160}$', 'Only opaque catalog IDs may identify a book');
assert.equal(analytics.additionalProperties, false, 'Analytics payload must reject unapproved personal/content fields');
assert.equal(analytics.properties.type.enum.includes('heartbeat'), true);
assert.equal(analytics.allOf.length, 5, 'Duration fields are required for heartbeat and state-ending events');




console.log('Read Along data contract schema tests passed.');
