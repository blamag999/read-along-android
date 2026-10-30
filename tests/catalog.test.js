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
assert.ok(Array.isArray(manifest.books) && manifest.books.length > 0, 'books.json must contain a non-empty books array');
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
assert.equal(catalog.getBookUniqueKey('X22_The-Book.PDF'), 'the_book');
assert.equal(catalog.normalizeStoryTitle('X22_The_Book_Read_Along_Part_2.pdf'), 'The');

const r2Url = name => 'https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/' + name;
const remoteStories = catalog.mapRemoteCatalog({
  books: [{
    id: 'book-1',
    title: 'Book One',
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
  { id: 'a', title: 'Alpha', pdf: { name: 'alpha.pdf' }, audios: [{ name: 'alpha.mp3' }] },
  { id: 'b', title: 'Beta', pdf: { name: 'beta.pdf' }, audios: [] },
  { id: 'c', title: 'Gamma', pdf: null, audios: [{ name: 'gamma.mp3' }] }
];
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'paired' }).map(x => x.id))), ['a']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'pdf' }).map(x => x.id))), ['a', 'b']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'mp3' }).map(x => x.id))), ['a', 'c']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'favorites', favorites: ['c'] }).map(x => x.id))), ['c']);
assert.deepEqual(JSON.parse(JSON.stringify(catalog.filterPlaylist(samplePlaylist, { filter: 'all', query: 'BETA.PDF' }).map(x => x.id))), ['b']);

console.log('Extracted catalog/playlist module tests passed.');
