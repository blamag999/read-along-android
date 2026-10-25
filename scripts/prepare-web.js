const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of ['index.html', 'app.js', 'styles.css', 'manifest.json', 'sw.js']) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
for (const dir of ['assets']) {
  const source = path.join(root, dir);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(out, dir), { recursive: true });
}
console.log('Prepared web assets in www/');
