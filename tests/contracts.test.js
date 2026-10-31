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
assert.ok(!appSource.includes('clearAllSync') && !appSource.includes('exportSyncData') && !appSource.includes('importSyncData'), 'Marker editing and import/export are removed from the APK client');
assert.ok(appSource.includes("if (!shouldResume) {") && appSource.includes("state.sessionRestorePending = false;"), 'Declining reading-position restore keeps the existing start-from-beginning path');
assert.ok(appSource.includes('async function resetAndLoadSyncForBook(') && appSource.includes('fetch(remoteSyncUrl'), 'R2 marker companion remains a read-only input to page/audio synchronization');
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





assert.ok(appSource.includes("alert('Không tải được thư viện sách. Vui lòng thử lại.');"), 'Catalog errors must not expose technical details');
assert.ok(appSource.includes("alert('Không mở được sách. Vui lòng kiểm tra tệp sách và âm thanh.');"), 'Book-load errors use concise recovery guidance');
assert.ok(appSource.includes("showToast('Đã chuyển phần âm thanh. Nhấn Phát để tiếp tục.');"), 'Audio autoplay fallback uses user-facing terminology');
assert.ok(appSource.includes("'Định dạng âm thanh không được hỗ trợ.'"), 'Unsupported media guidance stays concise');
assert.ok(appSource.includes("'Không tải được âm thanh. Hãy kiểm tra tệp và thử lại.'"), 'Audio-load errors provide concise recovery guidance');
assert.ok(appSource.includes("showToast('Vui lòng mở sách trước.');"), 'Reader actions explain when a book must be open');
assert.ok(appSource.includes("showToast('Chưa có âm thanh. Hãy chọn tệp âm thanh trước.');"), 'Playback guidance uses Vietnamese media terminology');
assert.ok(appSource.includes("showToast('Không thể phát lại trang này. Hãy thử nhấn Phát.');"), 'Page replay error gives a concise recovery action');
assert.ok(appSource.includes("showToast('Nhập số trang từ 1 đến ' + state.totalPages + '.');"), 'Page navigation validation uses the current reader terminology');
assert.ok(appSource.includes("console.error('Không thể phát âm thanh:', error);"), 'Technical playback errors remain available in console');
const releaseWorkflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/build-android-apk.yml'), 'utf8');
const releaseNotesGenerator = fs.readFileSync(path.join(__dirname, '..', 'scripts/generate-release-notes.py'), 'utf8');
assert.ok(releaseWorkflow.includes('python3 scripts/generate-release-notes.py'), 'APK workflow must use the tested release notes generator');
assert.ok(releaseWorkflow.includes('CHANGELOG: ${{ steps.release_info.outputs.changelog }}'), 'OTA manifest must receive the generated release notes');
assert.ok(releaseNotesGenerator.includes('latest_channel_release(releases, channel)'), 'Release notes baseline must be selected by channel');
assert.ok(releaseNotesGenerator.includes('"security": "Bảo mật"'), 'Release notes must include the security category');
assert.ok(appSource.includes("showToast('Đã tự động chuyển sang phần âm thanh '"), 'Automatic part switching uses Vietnamese terminology');
assert.ok(appSource.includes("showToast('Đã khôi phục vị trí đọc. Nhấn Phát để nghe.');"), 'Resume notification uses concise Vietnamese terminology');
assert.ok(appSource.includes("showToast('Đang đọc: ' + story.title);"), 'Reader status toast avoids decorative emoji');
assert.ok(appSource.includes("Trình duyệt chưa cho phép phát. Hãy nhấn Phát để thử lại."), 'Autoplay errors provide a direct recovery action');
assert.ok(appSource.includes("Không tải được sách trực tuyến. Hãy kiểm tra kết nối hoặc chọn tệp khác."), 'Remote book errors do not expose exception details');
const readerHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(readerHtml.includes('↶ Vị trí đã xem'), 'Reading checkpoint menu uses the approved title');
assert.ok(readerHtml.includes('>Xem tiếp</button>'), 'Reading checkpoint restore action uses the approved concise label');
assert.ok(!readerHtml.includes('Mốc đọc gần đây') && !readerHtml.includes('>Khôi phục vị trí</button>'), 'Previous reading checkpoint labels stay removed');
assert.ok(!readerHtml.includes('reader-source-status') && !readerHtml.includes('pdfFileName') && !readerHtml.includes('audioFileName'), 'PDF/audio filename status UI is absent from the reader');
assert.ok(!readerHtml.includes('file-status-pill'), 'Obsolete filename status pill classes are absent from HTML');
assert.ok(!appSource.includes('dom.pdfFileName') && !appSource.includes('dom.audioFileName'), 'App runtime has no DOM wiring for removed filename labels');
assert.ok(appSource.includes("state.pdfFileName = fileName || url.split('/').pop() || 'book.pdf';"), 'PDF filename state remains available for reader identity and session logic');
assert.ok(appSource.includes("state.audioFileName = name || url.split('/').pop() || 'audio';"), 'Audio filename state remains available for audio/session logic');
const readerStyles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
assert.ok(!readerStyles.includes('.file-status-pill'), 'Obsolete filename status pill styles are removed');


assert.ok(readerHtml.includes('📖 Đủ sách và âm thanh'), 'Library filter uses consistent reader terminology');
assert.ok(appSource.includes("label.textContent = 'Phần âm thanh:';"), 'Audio part label uses Vietnamese terminology');


console.log('Read Along data contract schema tests passed.');


const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
assert.match(htmlSource, /<section class="ota-settings-group" aria-label="Cập nhật ứng dụng">[\s\S]*?id="chkBetaOta"[\s\S]*?id="installedAppVersion"[\s\S]*?id="menuCheckUpdates"[\s\S]*?<\/section>/, 'OTA channel, installed version and update check are grouped in one compact menu section');
const otaMenuGroup = htmlSource.split('<section class="ota-settings-group"')[1]?.split('</section>')[0] || '';
assert.ok(!otaMenuGroup.includes('Đánh dấu để dùng Beta') && !otaMenuGroup.includes('menu-option-icon'), 'OTA controls omit redundant helper text and decorative icons');
assert.match(styleSource, /\.app-ui-mode \.ota-settings-group[\s\S]*?\.app-ui-mode \.ota-settings-group \.update-check-row/, 'OTA menu group has compact layout styles');
