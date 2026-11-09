/* Spheres Character Sheet: checks that the test config (firebase.emulators.json) matches the real one (firebase.json).
   The emulator config is firebase.json plus the auth and emulator settings; when a header or setting changes in one,
   it has to change in the other, or the tests run against a site that isn't the one that goes live.

     node tests/config-check.js        (no installs needed) */
const fs = require('fs');
const path = require('path');

const read = f => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'));
const live = read('firebase.json'), emu = read('firebase.emulators.json');
let pass = 0, fail = 0;
function check(what, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok || !detail ? '' : ': ' + detail)); }

const strip = h => { const x = JSON.parse(JSON.stringify(h || {})); delete x.predeploy; return x; };
const a = JSON.stringify(strip(live.hosting)), b = JSON.stringify(strip(emu.hosting));
check('hosting settings match (headers, ignore list, folder)', a === b, 'firebase.json and firebase.emulators.json differ: copy the "hosting" block across (without "predeploy")');
check('the same database rules file', JSON.stringify(live.firestore) === JSON.stringify(emu.firestore));
check('the emulator config never points at the real project', !('projects' in emu) && !/spheres-character-sheet/.test(JSON.stringify(emu)));

const hdr = (src, key) => ((live.hosting.headers || []).find(h => h.source === src) || { headers: [] }).headers.find(x => x.key === key);
check('pages say: don’t guess file types (nosniff)', !!hdr('**', 'X-Content-Type-Options'));
check('pages can’t be framed by other sites', /frame-ancestors 'self'/.test((hdr('/', 'Content-Security-Policy') || {}).value || '') && /frame-ancestors 'self'/.test((hdr('**/*.html', 'Content-Security-Policy') || {}).value || ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
