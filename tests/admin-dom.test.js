const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'admin/public/index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '..', 'admin/public/admin.js'), 'utf8');
const ids = new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]));
const refs = Array.from(script.matchAll(/\$\(["']([^"']+)["']\)/g), match => match[1]);
const missing = Array.from(new Set(refs.filter(id => !ids.has(id))));
assert.deepEqual(missing, [], 'Admin JavaScript references missing HTML element IDs');
assert.ok(script.includes('async function loadPublicStats()'), 'Dashboard stats loader must exist');
assert.ok(script.includes('window.addEventListener("hashchange", handleRoute)'), 'Admin route handler must be connected');
console.log('Admin DOM reference tests passed.');

assert.ok(!html.includes('id="libraryTabBtn"') && !html.includes('id="diagnosticsTabBtn"'), 'library management must not require switching tabs');
assert.ok(html.includes('<details id="diagnosticsPanel"'), 'diagnostics and publishing tools must be collapsible inside the library view');
assert.ok(html.includes('mục quản lý mỗi trang'), 'pagination size label must describe management items rather than books only');
assert.ok(html.indexOf('<details id="diagnosticsPanel"') > html.indexOf('id="fileRows"') && html.indexOf('<details id="diagnosticsPanel"') < html.indexOf('</section>', html.indexOf('<section id="libraryPanel"')), 'diagnostics tools must be nested inside the library management section');
assert.ok(script.includes('$("diagnosticsPanel").open = true;'), 'running diagnostics must expand the integrated tools panel');
assert.ok(script.includes('mục quản lý') && script.includes('bộ sách') && script.includes('thư mục'), 'library count must distinguish management items, books and folders');
assert.match(fs.readFileSync('admin/public/admin.css', 'utf8'), /library-actions[^]*height:44px/, 'folder and upload buttons must share the same height and alignment');

assert.ok(html.includes('id="libraryErrors"') && html.includes('id="libraryWarnings"'), 'Dashboard must expose library errors and warnings');
assert.ok(html.includes('id="libraryBooks"'), 'Dashboard must expose published book count');
assert.ok(!html.includes('analyticsSessions'), 'Dashboard must not show sessions-per-day KPI');
assert.ok(script.includes('$("libraryErrors")') && script.includes('$("libraryWarnings")'), 'Dashboard must render latest scan findings');

// [test] Final dashboard batch: no daily-session KPI; library health metrics remain visible.

assert.ok(html.includes('id="loginHomeBtn"'), "OTP screen must provide a direct route back to Dashboard");
assert.ok(script.includes('$("homePanel").append($("analyticsPanel"))'), "Analytics dashboard must be the public landing page");
assert.ok(script.includes('$("loginHomeBtn").addEventListener("click"'), "OTP screen must navigate back to Dashboard");
assert.ok(!html.includes('id="showAnalyticsBtn"'), "Analytics must not be hidden behind admin navigation");
