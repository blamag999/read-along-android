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
assert.equal(layout.calculatePageSize(240, 48, 30), 5, 'short screens should show fewer rows');
assert.equal(layout.calculatePageSize(520, 48, 30), 10, 'taller screens should show more rows');
assert.equal(layout.calculatePageSize(240, 78, 30), 3, 'multi-audio rows should use a conservative estimate');
assert.equal(layout.clampPage(5, 3), 3, 'page index must stay within the computed range');
console.log('Module behavior tests passed.');
