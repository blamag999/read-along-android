const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');
const app = read('app.js');
const diagnostics = read('modules/diagnostics.js');
const adminApi = read('admin/functions/api/readalong-admin/[[path]].js');
const diagnosticsWorker = read('services/diagnostics/worker.js');
const adminClient = read('admin/public/admin.js');
const remoteSync = read('modules/remote-sync.js');

const runtimeSources = [app, diagnostics, adminApi, diagnosticsWorker, adminClient, remoteSync].join('\n');
assert.doesNotMatch(runtimeSources, /private-comic-reader|comic-reader\.pages\.dev/i,
  'Read Along runtime must not call or allow another project domain');

assert.match(remoteSync, /GITHUB_REPO='read-along-android'/,
  'marker sync must target the Read Along repository only');
assert.doesNotMatch(remoteSync, /pdf-audio-sync/,
  'marker sync must not call the former external repository');

assert.match(app, /function isReadAlongR2Url\(value\)/,
  'manifest asset URLs must pass the Read Along R2 host check');
assert.match(app, /url\.hostname === READ_ALONG_R2_HOST/,
  'manifest assets must not be fetched from arbitrary HTTPS hosts');
assert.match(app, /pub-[a-f0-9]+\.r2\.dev\/books\.json/,
  'online catalog must load directly from the Read Along public R2 manifest');
assert.doesNotMatch(app, /\/api\/readalong\/books/,
  'online catalog must not use a catalog proxy API');
assert.match(app, /api\.github\.com\/repos\/blamag999\/read-along-android\/releases/,
  'OTA must read releases from this repository only');

assert.match(diagnostics, /read-along-admin\.pages\.dev\/api\/readalong-admin\/usage\/track/,
  'anonymous usage telemetry must use the Read Along Admin endpoint');
assert.match(diagnostics, /read-along-diagnostics\.ndhung475\.workers\.dev\/submit/,
  'user-consented diagnostics must use the documented Read Along diagnostics service');
assert.match(diagnosticsWorker, /api\.github\.com\/repos\/blamag999\/read-along-android\/issues/,
  'diagnostics service must create issues in this repository only');

assert.match(adminApi, /JSON\.stringify\(\{ books: normalized \}, null, 2\) \+ "\\n"/,
  "published books.json must end with a real newline, not literal backslash-n characters");

assert.match(adminApi, /const allowedOrigins = new Set\(\["https:\/\/localhost", "http:\/\/localhost", "capacitor:\/\/localhost"\]\)/,
  'Admin CORS must allow only the app local origins it needs');
assert.doesNotMatch(adminApi, /pages\.dev|workers\.dev/,
  'Admin Pages Functions must not allow unrelated project origins');

console.log('Read Along API isolation tests passed.');
