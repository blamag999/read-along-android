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
const native = fs.readFileSync(path.join(__dirname, '..', 'native/android/ApkUpdaterPlugin.java'), 'utf8');

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
const versionValidator = router.split("\n").find(line => line.includes('return typeof value === "string" && /^'));
assert.ok(versionValidator && versionValidator.includes('\\d{1,3}'), 'OTA manifest version must use a strict numeric version pattern');
assert.ok(router.includes('requestedVersion !== result.manifest.version'), 'Download route must reject stale or arbitrary version requests');
assert.ok(!router.includes('manifest.downloadUrl'), 'Backend must not redirect clients to a storage-provider URL');

assert.ok(workflow.includes('R2_ACCESS_KEY_ID') && workflow.includes('R2_SECRET_ACCESS_KEY'), 'Release workflow must use bucket-scoped R2 credentials');
assert.ok(workflow.includes('--bucket read-along-releases --key "releases/$CHANNEL/$APK"'), 'Release workflow must upload APKs to the dedicated OTA bucket');
assert.ok(workflow.includes('--metadata "sha256=$SHA256"'), 'Release workflow must store the APK checksum as R2 object metadata');
assert.ok(workflow.includes('--key "channels/$CHANNEL/latest.json"'), 'Release workflow must publish the manifest after the APK');
assert.ok(workflow.includes('"sha256": os.environ["SHA256"]'), 'Published manifest must contain the APK SHA-256');

assert.ok(app.includes('READ_ALONG_OTA_API'), 'APK must use the fixed OTA API origin');
assert.ok(!app.includes('READ_ALONG_RELEASES_API') && !app.includes('api.github.com/repos/blamag999/read-along-android/releases'), 'APK must not query GitHub Releases directly');
assert.ok(app.includes('expectedSize: manifest.size') && app.includes('sha256: manifest.sha256'), 'APK must pass size and checksum to the native verifier');
assert.ok(app.includes("'/download?channel='"), 'APK must construct the download route from the fixed OTA API');
assert.ok(app.includes('app-version-code'), 'APK must compare the embedded versionCode');
assert.ok(native.includes('OTA_HOST = "read-along-admin.pages.dev"'), 'Native updater must pin the OTA host');
assert.ok(native.includes('OTA_PATH = "/api/readalong-admin/ota/download"'), 'Native updater must pin the download path');
assert.ok(native.includes('setInstanceFollowRedirects(false)'), 'Native updater must reject redirects');
assert.ok(native.includes('MessageDigest.getInstance("SHA-256")'), 'Native updater must hash the downloaded APK');
assert.ok(native.includes('safeSha256.equals(actualSha256)'), 'Native updater must reject checksum mismatch');
assert.ok(native.includes('MAX_APK_SIZE = 250 * 1024 * 1024'), 'Native updater must enforce the configured APK size ceiling');
assert.ok(workflow.includes('VERSION_CODE: ${{ github.run_number }}'), 'Release build must embed versionCode');
assert.ok(workflow.includes('app-version-code'), 'Release build must inject the app-version-code meta tag');

assert.ok(workflow.includes('r2.cloudflarestorage.com'), 'Release workflow must use the account R2 S3 endpoint');
assert.ok(workflow.includes('R2_ENDPOINT: https://27391a829e8e4a38e9411d17ce76b5ba.r2.cloudflarestorage.com'), 'Release workflow must target the correct Cloudflare account');
assert.ok(!workflow.includes('CLOUDFLARE_API_TOKEN'), 'R2 uploader must not require an account-wide Cloudflare API token');
