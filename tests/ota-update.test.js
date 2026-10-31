const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(app.includes('async function clearReadAlongWebCachesForUpdate()'), 'OTA cache cleanup function must be defined');
assert.ok(app.includes('await clearReadAlongWebCachesForUpdate()'), 'OTA flow must await cache cleanup');
assert.ok(app.includes("/^read-along-shell-/i.test(key)"), 'Cleanup must be restricted to Read Along shell caches');
assert.ok(app.includes('script.pathname === appWorkerPath'), 'Cleanup must target only the Read Along service worker');
assert.ok(!app.includes('localStorage.clear(') && !app.includes('sessionStorage.clear('), 'OTA cleanup must not erase user storage');
console.log('OTA cache cleanup regression tests passed.');

const router = fs.readFileSync(path.join(__dirname, '..', 'admin/functions/api/readalong-admin/[[path]].js'), 'utf8');
const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/build-android-apk.yml'), 'utf8');

assert.ok(router.includes('async function handleOtaRoute'), 'Pages Functions must expose the provider-neutral OTA handler');
assert.ok(router.includes('route === "ota/latest"'), 'OTA latest manifest route must exist');
assert.ok(router.includes('route === "ota/download"'), 'OTA APK download route must exist');
assert.ok(router.includes('env.OTA_RELEASES'), 'OTA handler must use the dedicated R2 binding');
assert.ok(router.includes('"channels/" + channel + "/latest.json"'), 'OTA manifest lookup must be scoped by release channel');
assert.ok(router.includes('"releases/" + channel + "/" + manifest.filename'), 'APK object keys must be derived server-side');
assert.ok(router.includes('manifest.sha256'), 'OTA manifest must require a SHA-256 checksum');
assert.ok(router.includes('manifest.size'), 'OTA manifest must require and verify the APK size');
assert.ok(router.includes('manifest.channel !== channel'), 'OTA manifest must match the requested channel');
assert.ok(router.includes('apk.customMetadata?.sha256 !== manifest.sha256'), 'R2 object checksum metadata must match the manifest');
assert.ok(router.includes('/^\\\\d{1,3}\\\\.\\\\d{1,3}\\\\.\\\\d{1,4}$/'), 'OTA version must be strictly validated');
assert.ok(router.includes('requestedVersion !== result.manifest.version'), 'Download route must reject stale or arbitrary version requests');
assert.ok(!router.includes('manifest.downloadUrl'), 'Backend must not redirect clients to a storage-provider URL');

assert.ok(workflow.includes('CLOUDFLARE_R2_UPLOAD_TOKEN'), 'Release workflow must use a dedicated, optional R2 upload token');
assert.ok(workflow.includes('read-along-releases/releases/$CHANNEL/$APK'), 'Release workflow must upload APKs to the dedicated OTA bucket');
assert.ok(workflow.includes('x-amz-meta-sha256:$SHA256'), 'Release workflow must store the APK checksum as R2 object metadata');
assert.ok(workflow.includes('read-along-releases/channels/$CHANNEL/latest.json'), 'Release workflow must publish the manifest after the APK');
assert.ok(workflow.includes('"sha256": os.environ["SHA256"]'), 'Published manifest must contain the APK SHA-256');
