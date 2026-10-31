const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', name), 'utf8'));
const catalog = readJson('catalog.schema.json');
const marker = readJson('marker.schema.json');
const config = readJson('remote-config.schema.json');
const analytics = readJson('analytics-event.schema.json');

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

assert.equal(marker.additionalProperties.oneOf[0].type, 'number', 'Legacy numeric marker values remain supported');
assert.deepEqual(marker.additionalProperties.oneOf[1].required, ['time']);
assert.equal(marker.additionalProperties.oneOf[1].properties.part.type, 'integer');

assert.equal(config.properties.schemaVersion.const, 1);
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
