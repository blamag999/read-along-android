const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', name), 'utf8'));
const catalog = readJson('catalog.schema.json');
const marker = readJson('marker.schema.json');
const config = readJson('remote-config.schema.json');
const analytics = readJson('analytics-event.schema.json');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'admin', 'public', 'books.json'), 'utf8'));
const remoteConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'admin', 'public', 'remote-config.json'), 'utf8'));

for (const schema of [catalog, marker, config, analytics]) {
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

assert.equal(config.properties.schemaVersion.const, 1);
assert.equal(remoteConfig.schemaVersion, 1);
assert.equal(Number.isInteger(remoteConfig.configVersion), true);
assert.ok(remoteConfig.configVersion >= 1);
assert.ok(remoteConfig.issuedAt && !Number.isNaN(Date.parse(remoteConfig.issuedAt)));
assert.deepEqual(Object.keys(remoteConfig.features), []);
assert.deepEqual(Object.keys(remoteConfig.readerDefaults), []);
assert.deepEqual(remoteConfig.announcements, []);
assert.equal(config.properties.readerDefaults.additionalProperties, false);
assert.equal(config.properties.features.additionalProperties, false);
assert.equal(config.additionalProperties, false, 'Remote config must reject unrecognized executable/config fields');
assert.equal(config.properties.readerDefaults.properties.pageTurnMode.enum.join(','), 'next,markers,off');
assert.equal(config.properties.readerDefaults.properties.viewMode.enum.join(','), 'fit-height,fit-width,two-pages');

assert.equal(analytics.properties.schemaVersion.const, 1);
assert.ok(analytics.required.includes('eventId') && analytics.required.includes('sequence'));
assert.equal(analytics.properties.durationSeconds.maximum, 120);
assert.equal(analytics.additionalProperties, false, 'Analytics payload must reject unapproved personal/content fields');
assert.equal(analytics.properties.type.enum.includes('heartbeat'), true);

console.log('Read Along data contract schema tests passed.');
