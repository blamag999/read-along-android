const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('admin/public/books.json', 'utf8'));

assert.match(app, /https:\/\/pub-763a3a5ae235415cbef15b64f7a20820\.r2\.dev\/books\.json/, 'app must fetch the public R2 manifest directly');
assert.doesNotMatch(app, /private-comic-reader\.pages\.dev\/api\/readalong\/books/, 'catalog loading must not depend on the Pages API');
assert.match(app, /typeof value === 'string'/, 'catalog parser must accept URL strings from books.json');
assert.match(app, /item\.sync \|\| item\.json/, 'catalog parser must read the manifest sync URL');
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
