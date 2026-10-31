const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin/public/index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '..', 'admin/public/admin.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'admin/public/admin.css'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '..', 'admin/functions/api/readalong-admin/[[path]].js'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '..', 'admin/README.md'), 'utf8');

const ids = Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]);
const uniqueIds = new Set(ids);
assert.equal(ids.length, uniqueIds.size, 'Admin HTML must not contain duplicate IDs');
const refs = Array.from(script.matchAll(/\$\(["']([^"']+)["']\)/g), match => match[1]);
const missing = Array.from(new Set(refs.filter(id => !uniqueIds.has(id))));
assert.deepEqual(missing, [], 'Admin JavaScript references missing HTML element IDs');

const expectedTabs = [
  ['tabLibraryBtn', 'libraryTab'],
  ['tabOverviewBtn', 'overviewTab'],
  ['tabDiagnosticsBtn', 'diagnosticsTab'],
  ['tabAnalyticsBtn', 'analyticsTab'],
  ['tabAuditBtn', 'auditTab']
];
for (const [button, panel] of expectedTabs) {
  assert.ok(html.includes(`id="${button}"`), `Missing tab button: ${button}`);
  assert.ok(html.includes(`id="${panel}"`), `Missing tab panel: ${panel}`);
  assert.ok(script.includes(`"${button}"`), `Tab button is not wired: ${button}`);
}
assert.ok(html.indexOf('id="tabLibraryBtn"') < html.indexOf('id="tabOverviewBtn"'), 'Library must be the first tab');
assert.ok(script.includes('switchTab("library")'), 'Successful login/session must default to Library');
assert.ok(script.includes('function switchTab(name)'), 'Horizontal tab navigation must be implemented');

for (const tab of ['library', 'overview', 'diagnostics', 'analytics', 'audit']) {
  assert.ok(html.includes(`id="${tab}StatusBar"`), `Missing tab-local status bar: ${tab}`);
  assert.ok(script.includes(`${tab}: "${tab === 'library' ? 'status' : tab === 'overview' ? 'overviewStatus' : tab === 'diagnostics' ? 'diagnosticsStatus' : tab === 'analytics' ? 'analyticsTabStatus' : 'auditStatus'}"`), `Missing status routing for ${tab}`);
}
assert.ok(script.includes('function applyTheme(theme, persist = false)'), 'Theme controller must exist');
assert.ok(script.includes('prefers-color-scheme: light'), 'System theme preference must be supported');
assert.ok(script.includes('readalong-admin-theme'), 'Manual theme preference must persist');
assert.ok(css.includes(':root[data-theme="light"]'), 'Light theme styles must exist');

assert.ok(html.includes('id="uploadProgressText"'), 'Upload progress details must be visible in Library');
assert.ok(script.includes('failures.push({ name: file.name'), 'Upload must retain per-file failures');
assert.ok(script.includes('await uploadOne(file, i, files.length)'), 'Upload must report per-file progress');
assert.ok(script.includes('Xác nhận xóa tệp?') && script.includes('entry.key'), 'Delete confirmation must identify the exact file');
assert.ok(script.includes('Đang đổi tên/di chuyển: '), 'Rename must report its in-progress state');
assert.ok(script.includes('Đã đổi tên/di chuyển thành công: '), 'Rename must report its result');

assert.ok(api.includes('best.score>=0.95'), 'Fuzzy rename suggestions must require at least 95% name similarity');
assert.ok(script.includes('Number(finding.similarity) >= 95'), 'UI must enforce the 95% rename threshold');
assert.ok(api.includes('Thay tệp WMA thủ công'), 'WMA compatibility finding must recommend manual replacement');
assert.ok(script.includes('Admin không chuyển đổi audio.'), 'Diagnostics must clearly state that audio is not converted');
assert.ok(!script.match(/FFmpeg|ffmpeg|convertWmaGroup|Chuyển WMA/), 'Admin browser must not contain audio conversion code');
assert.ok(!api.includes('Chuyển đổi sang PDF, MP3'), 'Unsupported format guidance must not suggest in-app conversion');
assert.ok(readme.includes('does not transcode audio') || readme.includes('does not transcode'), 'Admin documentation must state that audio conversion is not available');

assert.ok(script.includes('async function loadAnalyticsDashboard()'), 'Analytics loader must exist');
assert.ok(script.includes('async function loadAuditEntries()'), 'Audit tab loader must exist');
assert.ok(html.includes('id="overviewTrend"'), 'Overview must display a trend chart');
assert.ok(html.includes('id="analyticsPlatforms"'), 'Statistics tab must retain platform breakdown');
assert.ok(html.includes('id="diagnosticsPanel"'), 'Diagnostics and catalog publishing tools must remain available');
assert.ok(html.includes('id="publishBooksBtn"'), 'Catalog publishing action must remain available');
assert.ok(html.indexOf('id="publishBooksBtn"') < html.indexOf('id="diagnosticsPanel"'), 'Catalog publishing must remain outside the Diagnostics tab');
assert.ok(html.includes('id="publicStatusBar"') && html.includes('id="publicReading"'), 'Public dashboard must keep its compact metrics and status bar');
assert.ok(script.includes('window.addEventListener("hashchange", handleRoute)'), 'Admin route handler must be connected');

console.log('Admin dashboard, task status, theme, library operation and diagnostics tests passed.');
