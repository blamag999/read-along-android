const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
const context = vm.createContext({ window, Object, Number, Math });
for (const file of ['modules/page-sync.js', 'modules/playlist-layout.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
const sync = window.ReadAlongPageSync;
const layout = window.ReadAlongPlaylistLayout;

assert.deepEqual(JSON.parse(JSON.stringify(sync.findTargetPage({
  pageTimestamps: { 1: 0, 2: 0, 3: 0 }, totalPages: 3, currentTime: 0,
  currentPart: 0, audioCount: 1, duration: 100
}))), { page: 1, time: 0, part: 0 }, 'ties at zero must prefer the first page');
assert.deepEqual(JSON.parse(JSON.stringify(sync.findTargetPage({
  pageTimestamps: { 2: 0 }, totalPages: 4, currentTime: 0,
  currentPart: 0, audioCount: 1, duration: 100
}))), { page: 2, time: 0, part: 0 }, 'a valid zero-second marker on page 2 must align the reader to page 2');
assert.deepEqual(JSON.parse(JSON.stringify(sync.findTargetPage({
  pageTimestamps: { 2: 0, 3: 0, 4: 12 }, totalPages: 4, currentTime: 0,
  currentPart: 0, audioCount: 1, duration: 100
}))), { page: 2, time: 0, part: 0 }, 'equal zero-second markers must select the earliest marked page');
assert.equal(sync.findTargetPage({
  pageTimestamps: { 2: { time: 20, part: 1 } }, totalPages: 3, currentTime: 30,
  currentPart: 0, audioCount: 2, duration: 100
}), null, 'markers from another audio part must be ignored');
assert.equal(sync.findTargetPage({
  pageTimestamps: { 2: 120 }, totalPages: 3, currentTime: 130,
  currentPart: 0, audioCount: 1, duration: 100
}), null, 'markers beyond the audio duration must be ignored');
assert.equal(sync.isConfirmedBackwardSeek(92, 87.9, 87.9), true, 'a completed backward seek to its target is confirmed');
assert.equal(sync.isConfirmedBackwardSeek(92, 87.9, 92), false, 'an unfinished or mismatched seek must not authorize backward sync');
assert.equal(sync.isConfirmedBackwardSeek(87.9, 92, 92), false, 'a forward seek must not authorize backward sync');
assert.equal(sync.shouldAllowPageChange(4, 2, false), false, 'stale markers must not move pages backwards');
assert.equal(sync.shouldAllowPageChange(4, 2, true), true, 'an explicit backward seek may move pages backwards');
assert.equal(sync.shouldAllowPageChange(2, 4, false), true, 'forward synchronization remains enabled');
assert.equal(sync.alignPage(8, 'two-pages'), 7, 'two-page mode aligns even pages to the spread start');
assert.deepEqual(JSON.parse(JSON.stringify(sync.resolveTimestampSpread({
  pageTimestamps: { 2: 0 }, page: 2, totalPages: 6, currentPart: 0, audioCount: 1
}))), { startPage: 1, endPage: 2, spread: true, reason: 'adjacent-page-marker-missing' },
'a page-2 marker with no page-1 marker displays pages 1 and 2 together');
assert.deepEqual(JSON.parse(JSON.stringify(sync.resolveTimestampSpread({
  pageTimestamps: { 3: 4, 5: 5 }, page: 3, totalPages: 6, currentPart: 0, audioCount: 1
}))), { startPage: 3, endPage: 4, spread: true, reason: 'adjacent-page-marker-missing' },
'a page-3 marker with an unmarked page 4 displays pages 3 and 4 together');
assert.deepEqual(JSON.parse(JSON.stringify(sync.resolveTimestampSpread({
  pageTimestamps: { 3: 4, 4: 4.8 }, page: 3, totalPages: 6, currentPart: 0, audioCount: 1
}))), { startPage: 3, endPage: 3, spread: false, reason: 'both-pages-have-markers' },
'consecutive pages with markers display separately');
assert.deepEqual(JSON.parse(JSON.stringify(sync.resolveTimestampSpread({
  pageTimestamps: { 4: 4 }, page: 4, totalPages: 6, currentPart: 0, audioCount: 1
}))), { startPage: 3, endPage: 4, spread: true, reason: 'adjacent-page-marker-missing' },
'an even marked page pairs with the preceding unmarked page');
assert.equal(sync.resolveTimestampSpread({
  pageTimestamps: { 5: { time: 5, part: 1 } }, page: 5, totalPages: 6, currentPart: 0, audioCount: 2
}).spread, false, 'markers from another audio part do not create a spread');
assert.deepEqual(JSON.parse(JSON.stringify(sync.resolveTimestampSpread({
  pageTimestamps: { 6: 10 }, page: 6, totalPages: 6, currentPart: 0, audioCount: 1
}))), { startPage: 5, endPage: 6, spread: true, reason: 'adjacent-page-marker-missing' },
'an even final page pairs with its preceding unmarked page');
assert.equal(sync.resolveTimestampSpread({
  pageTimestamps: { 7: 10 }, page: 7, totalPages: 7, currentPart: 0, audioCount: 1
}).spread, false, 'an odd final page cannot create a spread beyond the PDF');
assert.equal(layout.calculatePageSize(240, 48, 30), 5, 'short screens should show fewer rows');
assert.equal(layout.calculatePageSize(520, 48, 30), 10, 'taller screens should show more rows');
assert.equal(layout.calculatePageSize(240, 78, 30), 3, 'multi-audio rows should use a conservative estimate');
assert.equal(layout.clampPage(5, 3), 3, 'page index must stay within the computed range');
const appSource = fs.readFileSync('app.js', 'utf8');
const htmlSource = fs.readFileSync('index.html', 'utf8');
const styleSource = fs.readFileSync('styles.css', 'utf8');
assert.ok(appSource.includes('resolvePreviousMarkedSpread'), 'manual page navigation must use the previous valid timestamp marker');
assert.ok(appSource.includes('pendingManualBackwardMarker'), 'manual backward navigation must seek to the resolved marker');
assert.ok(appSource.includes("dom.canvasWrapper.addEventListener('touchstart'"), 'swipe navigation must be scoped to the PDF canvas wrapper');
assert.ok(!appSource.includes("dom.viewerContainer.addEventListener('touchstart'"), 'swipes outside the PDF must not turn pages');
assert.ok(appSource.includes('getRenderedPdfBounds'), 'touch zones must be bounded by rendered PDF canvases');
assert.ok(htmlSource.includes('readingCheckpointMenuGroup'), 'three recent checkpoints must be reachable from the reader menu');
assert.ok(htmlSource.includes('id="btnOpenPlaylist"') && htmlSource.includes('id="btnOpenReadMenu"'), 'header must retain the library and menu actions');
assert.ok(htmlSource.includes('class="playlist-icon"') && htmlSource.includes('class="playlist-label"'), 'library button must expose a recognizable icon and readable label');
assert.ok(styleSource.includes('.playlist-btn .playlist-label { display: inline !important; }'), 'portrait library action must keep its label visible');
assert.ok(appSource.includes("dom.lblPlaylistCount.classList.remove('hidden')") && appSource.includes("setAttribute('aria-label', 'Thư viện sách, ' + count + ' cuốn')"), 'library badge and accessible label must always reflect the loaded book count');
assert.ok(appSource.includes("else loadR2Catalog();"), 'the Library action must retry loading the R2 catalog when no books are loaded');
assert.ok(appSource.includes("dom.btnOpenPlaylist.disabled = false;"), 'the Library action must never remain disabled after an initial catalog load failure');
assert.ok(appSource.includes('if (state.catalogLoading) return;'), 'concurrent catalog retries must be deduplicated');
const headerSource = htmlSource.slice(htmlSource.indexOf('<header'), htmlSource.indexOf('</header>'));
assert.ok(!headerSource.includes('view-controls-bar') && headerSource.indexOf('id="btnFitHeight"') > headerSource.indexOf('id="readOptionsMenu"') && headerSource.indexOf('id="btnTwoPages"') > headerSource.indexOf('id="readOptionsMenu"'), 'view and zoom controls must be nested inside the menu, not beside the top-bar actions');
assert.deepEqual([...headerSource.matchAll(/<button id="([^"]+)"/g)].map(match => match[1]).filter(id => ['btnOpenPlaylist', 'btnOpenReadMenu'].includes(id)).sort(), ['btnOpenPlaylist', 'btnOpenReadMenu'], 'top bar must expose exactly the library and menu buttons');
assert.ok(htmlSource.includes('class="menu-view-controls"'), 'view and zoom controls must remain available inside the menu');
assert.ok(!htmlSource.includes('id="btnCloseBook"') && !htmlSource.includes('id="btnToggleSettings"') && !htmlSource.includes('id="btnOpenSyncModal"'), 'header must not expose separate close-book, settings, or marker buttons');
assert.ok(!htmlSource.includes('id="menuToggleSettings"') && !htmlSource.includes('id="menuOpenSyncModal"'), 'settings visibility and marker management must be removed from the menu');
assert.ok(!appSource.includes('btnCloseBook') && !appSource.includes('btnToggleSettings') && !appSource.includes('btnOpenSyncModal'), 'removed header controls must not be referenced by reader initialization');
assert.ok(appSource.includes('if (state.pdfDoc) {\n    requestCloseBook();'), 'Android Back must retain the existing close-book and save-session flow');

assert.ok(styleSource.includes('white-space: pre-line'), 'toast messages must preserve line breaks');
assert.ok(styleSource.includes('.app-ui-mode .header-right { flex: 0 0 auto; flex-wrap: nowrap;'), 'reader header actions must stay on one row');

assert.ok(!htmlSource.includes('menuReloadMarkers') && !htmlSource.includes('btnReloadMarkers'), 'online marker refresh controls must be removed from the reader UI');
assert.ok(!htmlSource.includes('diagnosticsModal') && !htmlSource.includes('menuDiagnostics'), 'diagnostics UI must be removed from the personal app');
assert.ok(!htmlSource.includes('menuAnalytics') && !htmlSource.includes('analyticsModal'), 'analytics must not require a settings/consent dialog');
assert.ok(htmlSource.includes('Mốc đọc gần đây'), 'checkpoint label must use the concise Vietnamese name');
assert.ok(styleSource.includes('Compact touch header') && styleSource.includes('@media (max-width: 600px)'), 'portrait header must use compact responsive controls');
assert.ok(!appSource.includes('saveSyncToDirectoryOrDownload') && !appSource.includes('exportSyncData') && !appSource.includes('importSyncData'), 'marker editing and import/export must be removed from the APK client');
assert.ok(!/loadPdfFromBlob|loadAudioFromBlob|handlePdfFileSelect|handleAudioFileSelect|handleFolderPick|handleFileList|initDragAndDrop|saveBookToLibrary|getBookFromLibrary|indexedDB\\.open|showDirectoryPicker/.test(appSource), 'APK must not expose local PDF/audio/folder or offline media-library flows');
for (const localId of ['filePickerSection','folderInput','pdfFileInput','audioFileInput','btnTriggerFolderPicker','btnTriggerPdfPicker','node1Modal','dropOverlay','btnChooseAudio']) assert.ok(!htmlSource.includes('id="' + localId + '"'), 'local media UI must not contain ' + localId);
assert.ok(!appSource.includes('loadCloudSyncForBook'), 'marker loading must not depend on online cloud synchronization');
assert.ok(!htmlSource.includes('remote-sync.js'), 'the obsolete remote marker sync client must not be loaded');

for (const removedId of ['syncModal', 'btnCloseSyncModal', 'btnExportSync', 'importSyncInput', 'btnClearSync', 'syncTableBody', 'btnPinCurrentTime', 'btnSaveToFolder']) {
  assert.ok(!htmlSource.includes('id="' + removedId + '"'), 'marker management UI must not contain ' + removedId);
}
assert.ok(!appSource.includes('scheduleGitHubSync('), 'local marker edits must not call the removed GitHub sync client');

console.log('Module behavior and touch-reader UI contract tests passed.');
