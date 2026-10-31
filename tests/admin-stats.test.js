const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const worker = fs.readFileSync(path.join(__dirname, '..', 'admin/functions/api/readalong-admin/[[path]].js'), 'utf8');
const start = worker.indexOf('if (route === "usage/stats" && method === "GET")');
const end = worker.indexOf('if (route === "telemetry/events" && method === "POST")', start);
assert.ok(start >= 0 && end > start, 'Public usage stats route must exist');
const route = worker.slice(start, end);

assert.ok(route.includes('env.READALONG.get("books.json")'), 'Stats should prefer the published manifest');
assert.ok(route.includes('Array.isArray(parsed.books) && parsed.books.length'), 'Empty or malformed manifests must trigger fallback');
assert.ok(route.includes('env.READALONG.list({ limit: 1000'), 'Stats must fall back to R2 inventory');
assert.ok(route.includes('if (ext === ".pdf") inventory.pdfs++'), 'PDF objects must be counted');
assert.ok(route.includes('audioExtensions.has(ext)'), 'Audio objects must be counted');
assert.ok(route.includes('ext === ".json" && key !== "books.json"'), 'Sync JSON count must exclude the manifest');
assert.ok(route.includes('books: inventory.pdfs'), 'Fallback book count must use PDF count');
assert.ok(route.includes('source = "r2_inventory"'), 'Response must identify its data source');
assert.ok(route.includes('inventory.objects > 10000'), 'Large inventories must not silently return partial counts');
console.log('Admin statistics regression tests passed.');

const dashboardStart = worker.indexOf('if (route === "analytics/dashboard" && method === "GET")');
const dashboardEnd = worker.indexOf('if (route === "catalog/preview" && method === "GET")', dashboardStart);
assert.ok(dashboardStart >= 0 && dashboardEnd > dashboardStart, 'Authenticated analytics dashboard route must exist');
const dashboard = worker.slice(dashboardStart, dashboardEnd);
assert.ok(dashboard.includes('env.READALONG.get("books.json")'), 'Dashboard book count must use published catalog');
assert.ok(dashboard.includes('admin_scan_logs'), 'Dashboard must expose latest library scan status');
assert.ok(dashboard.includes('errors: Number(latestScan.errors || 0)'), 'Dashboard must expose library errors');
assert.ok(dashboard.includes('warnings: Number(latestScan.warnings || 0)'), 'Dashboard must expose library warnings');
assert.ok(dashboard.includes('Date range cannot exceed 24 months'), 'Dashboard must cap aggregate query range');
assert.ok(dashboard.includes('Math.max(startMs, cutoff)'), 'Raw breakdown must respect 90-day retention while retaining aggregate range');
assert.ok(dashboard.includes('!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)'), 'Dashboard date parser must validate YYYY-MM-DD');
assert.ok(!dashboard.includes('activeSessionDays'), 'Dashboard must not promote daily session count as a KPI');
const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'admin/public/index.html'), 'utf8');
assert.ok(!dashboardHtml.includes('analyticsSessions'), 'Dashboard HTML must not render sessions-per-day KPI');
console.log('Analytics dashboard API regression tests passed.');

// [test] Re-run full dashboard regression after fixing library table placement assertion.

// [test] Dashboard no longer returns unused session-count data.
