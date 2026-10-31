const assert = require('node:assert/strict');
const fs = require('node:fs');

const plugin = fs.readFileSync('native/android/AppLifecyclePlugin.java', 'utf8');
const workflow = fs.readFileSync('.github/workflows/build-android-apk.yml', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

assert.match(plugin, /@CapacitorPlugin\(name = "AppLifecycle"\)/);
assert.match(plugin, /public void exitApp\(PluginCall call\)/);
assert.match(plugin, /activity\.finish\(\)/);
assert.match(workflow, /AppLifecyclePlugin\.java/);
assert.match(workflow, /readalong-back-pressed/);
assert.match(workflow, /readalong-user-leave/);
assert.match(app, /readalong-back-pressed/);
assert.match(app, /readalong-user-leave/);
assert.match(app, /visibilitychange/);
assert.match(app, /function stopAudioForBackground/);
console.log('Native app lifecycle integration tests passed.');
