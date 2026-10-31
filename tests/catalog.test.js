const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('app.js', 'utf8');
const catalogSource = fs.readFileSync('modules/catalog-playlist.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('admin/public/books.json', 'utf8'));

assert.match(app, /https:\/\/pub-763a3a5ae235415cbef15b64f7a20820\.r2\.dev\/books\.json/, 'app must fetch the public R2 manifest directly');
assert.doesNotMatch(app, /private-comic-reader\.pages\.dev\/api\/readalong\/books/, 'catalog loading must not depend on the Pages API');
assert.match(catalogSource, /typeof value === 'string'/, 'catalog module must accept URL strings from books.json');
assert.match(catalogSource, /item\.sync \|\| item\.json/, 'catalog module must read the manifest sync URL');
assert.match(catalogSource, /folder: String\(item\.folder/, 'catalog module must preserve folder metadata');
assert.ok(Array.isArray(manifest.books) && manifest.books.length > 0, 'books.json must contain a non-empty books array');
assert.ok(!manifest.books.some(book => book.id === 'brave'), 'deleted Brave R2 assets must not remain in the publish seed');
const r2Host = 'pub-763a3a5ae235415cbef15b64f7a20820.r2.dev';

for (const [index, book] of manifest.books.entries()) {
  assert.equal(typeof book.id, 'string', 'book ' + index + ' must have an id');
  assert.equal(typeof book.title, 'string', 'book ' + index + ' must have a title');
  assert.equal(typeof book.pdf, 'string', 'book ' + index + ' must have a PDF URL string');
  assert.equal(new URL(book.pdf).hostname, r2Host, 'book ' + index + ' PDF must be hosted on Read Along R2');
  assert.ok(Array.isArray(book.audios), 'book ' + index + ' must have an audios array');
  assert.ok(book.audios.every(url => typeof url === 'string'), 'book ' + index + ' audio entries must be URL strings');
  for (const url of book.audios) assert.equal(new URL(url).hostname, r2Host, 'book ' + index + ' audio must be hosted on Read Along R2');
  assert.ok(book.sync === null || typeof book.sync === 'string', 'book ' + index + ' sync must be a URL string or null');
  if (book.sync) assert.equal(new URL(book.sync).hostname, r2Host, 'book ' + index + ' sync JSON must be hosted on Read Along R2');
}

console.log('Direct R2 catalog regression tests passed (' + manifest.books.length + ' books).');


// Test the extracted catalog and playlist domain logic without the app DOM.
const context = vm.createContext({ window: {}, Object, Number, Math, Set, String, Array });
vm.runInContext(fs.readFileSync('modules/catalog-playlist.js', 'utf8'), context, {
  filename: 'modules/catalog-playlist.js'
});
const catalog = context.window.ReadAlongCatalogPlaylist;
assert.ok(catalog, 'catalog/playlist module must publish its API');
assert.throws(() => catalog.mapRemoteCatalog({}), /đúng cấu trúc.*books/, 'remote catalog must reject a malformed manifest');
assert.throws(() => catalog.mapRemoteCatalog({ books: [] }), /Thiếu bộ kiểm tra URL/, 'remote catalog must require URL validation dependencies');
assert.equal(catalog.getBookUniqueKey('X22_The-Book.PDF'), '_the_book', 'preserve the existing book-key normalization contract');
assert.equal(catalog.normalizeStoryTitle('X22_The_Book_Read_Along_Part_2.pdf'), 'The');

const r2Url = name => 'https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/' + name;
const remoteStories = catalog.mapRemoteCatalog({
  books: [{
    id: 'book-1',
    title: 'Book One',
    folder: 'DISNEY',
    pdf: r2Url('one.pdf'),
    audios: [r2Url('one.mp3'), 'https://example.com/outside.mp3'],
    sync: r2Url('one.json')
  }, {
    id: 'rejected',
    title: 'Untrusted only',
    pdf: 'https://example.com/outside.pdf',
    audios: [],
    sync: null
  }]
}, {
  isAllowedUrl: value => {
    try { return new URL(value).hostname === 'pub-763a3a5ae235415cbef15b64f7a20820.r2.dev'; }
    catch (_) { return false; }
  },
  fileNameFromUrl: (value, fallback) => {
    try { return new URL(value).pathname.split('/').pop() || fallback; }
    catch (_) { return fallback; }
  }
});
assert.equal(remoteStories.length, 1, 'remote catalog must discard entries without permitted R2 assets');
assert.equal(remoteStories[0].audios.length, 1, 'remote catalog must discard assets outside R2');
assert.equal(remoteStories[0].pdf.name, 'one.pdf');
assert.equal(remoteStories[0].folder, 'DISNEY', 'remote catalog must retain the folder group');
assert.equal(remoteStories[0].json.name, 'one.json');

const localItems = [
  { type: 'pdf', name: 'Story_Read_Along.pdf', blob: 'pdf-blob' },
  { type: 'audio', name: 'Story_Part_2.mp3', blob: 'audio-2' },
  { type: 'audio', name: 'Story_Part_1.mp3', blob: 'audio-1' },
  { type: 'json', name: 'Story.json', blob: 'sync-blob' },
  { type: 'json', name: 'orphan.json', blob: 'orphan-blob' }
];
const grouped = catalog.buildPlaylistFromFiles(localItems);
assert.equal(grouped.length, 1, 'orphan marker JSON must not create a playlist row');
assert.equal(grouped[0].pdf.name, 'Story_Read_Along.pdf');
assert.equal(grouped[0].json.name, 'Story.json');
assert.deepEqual(JSON.parse(JSON.stringify(grouped[0].audios.map(item => item.name))),
  ['Story_Part_1.mp3', 'Story_Part_2.mp3'], 'audio parts must be sorted numerically');
assert.deepEqual(JSON.parse(JSON.stringify(grouped[0].audios.map(item => item.partLabel))),
  ['Phần 1', 'Phần 2'], 'audio part labels must be assigned consistently');

const samplePlaylist = [
  { id: 'a', title: 'Alpha', folder: 'DISNEY', pdf: { name: 'alpha.pdf' }, audios: [{ name: 'alpha.mp3' }] },
  { id: 'b', title: 'Beta', folder: 'ONE STORY A DAY LEVEL 2 FULL', pdf: { name: 'beta.pdf' }, audios: [] },
  { id: 'c', title: 'Gamma', folder: '', pdf: null, audios: [{ name: 'gamma.mp3' }] }
];
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'paired' }).map(x => x.id))), ['a']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'pdf' }).map(x => x.id))), ['a', 'b']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'mp3' }).map(x => x.id))), ['a', 'c']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'favorites', favorites: ['c'] }).map(x => x.id))), ['c']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'all', query: 'BETA.PDF' }).map(x => x.id))), ['b']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'all', folder: 'DISNEY' }).map(x => x.id))), ['a']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'all', folder: '__root__' }).map(x => x.id))), ['c']);

console.log('Extracted catalog/playlist module tests passed.');


// Regression: catalog publishing must be generated from live R2 inventory, not the checked-in seed.
const adminScript = fs.readFileSync('admin/public/admin.js', 'utf8');
const adminApi = fs.readFileSync('admin/functions/api/readalong-admin/[[path]].js', 'utf8');
assert.match(adminScript, /api\("catalog\/preview"\)/, 'Admin must request a fresh R2 catalog preview');
assert.doesNotMatch(adminScript, /fetch\("\/books\.json"/, 'Admin must not publish the static Git seed');
assert.match(adminApi, /route === "catalog\/preview"/, 'API must expose an authenticated R2 inventory preview');
assert.match(adminApi, /group\.pdf\.length !== 1/, 'preview must exclude missing or duplicate PDFs');
assert.match(adminApi, /folder: group\.dir\.replace/, 'preview must assign the source R2 folder to each book');
assert.match(adminApi, /book\.folder/, 'publisher must validate and preserve folder metadata');
assert.match(adminApi, /!group\.audios\.length/, 'preview must exclude books without audio');
assert.match(adminApi, /badKeys/, 'preview must exclude files with scan errors');
assert.ok(adminApi.includes("stem.match(/(?:_P(\\d+)"), "preview must recognize numbered audio parts");
console.log('R2-generated catalog preview regression tests passed.');

const libraryGroupingStart = adminScript.indexOf("function libraryAssetGroups(entries) {");
const libraryGroupingEnd = adminScript.indexOf("\nconst expandedLibraryGroups", libraryGroupingStart);
assert.ok(libraryGroupingStart >= 0 && libraryGroupingEnd > libraryGroupingStart, "Admin must expose deterministic book grouping logic");
const libraryContext = vm.createContext({ Set, String, Number, Math, Date });
vm.runInContext(adminScript.slice(libraryGroupingStart, libraryGroupingEnd), libraryContext);
const libraryGroups = libraryContext.libraryAssetGroups([
  { key: "Oliver_Company.pdf", name: "Oliver_Company.pdf", type: "file", size: 100, uploaded: "2026-01-01" },
  { key: "Oliver_Company_P2.mp3", name: "Oliver_Company_P2.mp3", type: "file", size: 20, uploaded: "2026-01-01" },
  { key: "Oliver_Company_P1.wma", name: "Oliver_Company_P1.wma", type: "file", size: 30, uploaded: "2026-01-01" },
  { key: "Oliver_Company.json", name: "Oliver_Company.json", type: "file", size: 10, uploaded: "2026-01-01" },
  { key: "orphan.bin", name: "orphan.bin", type: "file", size: 1, uploaded: "2026-01-01" }
]);
assert.equal(libraryGroups.books.length, 1, "PDF/audio/JSON with the same normalized stem must form one book");
assert.equal(libraryGroups.books[0].pdf[0].name, "Oliver_Company.pdf");
assert.deepEqual(Array.from(libraryGroups.books[0].audio, file => file.name), ["Oliver_Company_P1.wma", "Oliver_Company_P2.mp3"], "numbered audio parts must sort numerically");
assert.equal(libraryGroups.books[0].json[0].name, "Oliver_Company.json");
assert.equal(libraryGroups.books[0].status, "compatibility", "WMA should mark the grouped book as requiring compatibility handling");
assert.deepEqual(Array.from(libraryGroups.ungrouped, file => file.name), ["orphan.bin"], "unsupported files must remain visible in the unmatched section");
console.log("Admin book-grouping regression tests passed.");

// Admin library pagination must use the same filtered entries for rendering and navigation.
assert.match(adminScript, /filteredLibraryEntries = entries;/, 'pagination must store the exact filtered list used by the current render');
assert.ok(adminScript.includes('nextPageBtn') && adminScript.includes('filteredLibraryEntries.length'), 'next-page navigation must use the rendered filtered list');
assert.ok(adminScript.includes('lastPageBtn') && adminScript.includes('filteredLibraryEntries.length'), 'last-page navigation must use the rendered filtered list');
assert.ok(!/FFmpeg|ffmpeg|convertWmaGroup|conversion-progress|Chuyển WMA/.test(adminScript), 'Admin must not ship an audio conversion workflow');
assert.ok(adminScript.includes('Number(finding.similarity) >= 95'), 'Rename suggestions require at least 95% similarity');
assert.ok(adminScript.includes('Cần thay file bằng định dạng được ứng dụng hỗ trợ'), 'Unsupported audio must be replaced manually');
const adminHtml = fs.readFileSync('admin/public/index.html', 'utf8');
const libraryToolsIndex = adminHtml.indexOf('class="library-tools"');
assert.ok(libraryToolsIndex >= 0 && libraryToolsIndex < adminHtml.indexOf('<div class="table-wrap">', libraryToolsIndex), 'library search and sort controls must appear before the library file table');
console.log('Admin pagination, manual compatibility warnings and search placement regression tests passed.');

const adminHeaders = fs.readFileSync('admin/public/_headers', 'utf8');
assert.ok(!adminHeaders.includes('cdn.jsdelivr.net') && !adminHeaders.includes('wasm-unsafe-eval') && !adminHeaders.includes('worker-src'), 'CSP must not retain audio-conversion dependencies');
