/* Spheres Character Sheet: checks on the talent description files (public/talents/), no browser needed.

     python3 tools/build-talents.py <path to SoP-Claude-Bundles>
     node tests/talents-check.js

   Run it after rebuilding the files from a new wiki bundle. It checks every file the index names is there and
   matches it, that no entry has empty text, and that some well-known talents and drawbacks are found where
   they should be. Exit code 0 = every check passed. */
const fs = require('fs'), path = require('path');
const DIR = path.resolve(__dirname, '..', 'public', 'talents');
let pass = 0, fail = 0;
function check(what, ok, detail) { if (typeof ok === 'string' && typeof detail === 'string') { const got = ok; ok = got === detail; detail = 'got "' + got + '", expected "' + detail + '"'; } if (ok) pass++; else fail++; console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok || !detail ? '' : ': ' + detail)); }
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const norm = s => String(s || '').normalize('NFKD').replace(/’/g, "'").toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^a-z0-9]/g, '');

const I = read('index.json');
const slugs = Object.keys(I.spheres);
check('index lists at least 70 spheres', slugs.length >= 70, slugs.length);
check('index lists at least 4,000 talents', I.names.length >= 4000, I.names.length);
const missing = [], badCount = [], empty = [], dupes = [];
let total = 0;
for (const s of slugs) {
  if (!fs.existsSync(path.join(DIR, s + '.json'))) { missing.push(s); continue; }
  const F = read(s + '.json');
  if (F.t.length !== I.spheres[s].c) badCount.push(s);
  total += F.t.length;
  const seen = new Set();
  for (const t of F.t) {
    if (!String(t[4] || '').trim()) empty.push(F.n + ' / ' + t[0]);
    const n = norm(t[0]); if (seen.has(n)) dupes.push(F.n + ' / ' + t[0]); seen.add(n);
  }
}
check('every sphere in the index has its file', !missing.length, missing.join(', '));
check('each file has the number of talents the index says', !badCount.length, badCount.join(', '));
check('no talent has empty text', !empty.length, empty.slice(0, 10).join('; '));
check('no talent appears twice in one sphere', !dupes.length, dupes.slice(0, 10).join('; '));
const orphans = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !['index.json', 'drawbacks.json'].includes(f) && !I.spheres[f.slice(0, -5)]);
check('no leftover files from an older build', !orphans.length, orphans.join(', '));

/* well-known entries, in the sphere they belong to */
const has = (sphere, name) => fs.existsSync(path.join(DIR, sphere + '.json')) && read(sphere + '.json').t.some(t => norm(t[0]) === norm(name));
const known = [['nature', 'Create Nature'], ['nature', 'Expanded Geomancing'], ['nature', 'Earth Mastery'], ['nature', 'Nature Lord'], ['nature', 'Cyclone'],
  ['death', 'Greater Reanimate'], ['death', 'Mass Death Magic'], ['destruction', 'Fire Blast'], ['conjuration', 'Expendable Summons'],
  ['boxing', 'Corkscrew Set Up'], ['pilot', 'Assured Repair'], ['polished-dark', 'Following Darkness'], ['equipment', 'Unarmored Training'],
  ['vocation', 'Adept Administrator'], ['form', 'Additional Wings'], ['leadership', 'Greater Recruitment']];
for (const [s, n] of known) check(`${n} is in ${s}`, has(s, n));
const kindOf = (sphere, name) => (read(sphere + '.json').t.find(t => norm(t[0]) === norm(name)) || [])[3];
check('talent kinds: advanced, legendary and exceptional are tagged', [kindOf('nature', 'Cyclone'), kindOf('alchemy', 'Ambrosia'), kindOf('artifice', 'Bizarre Artistry'), kindOf('nature', 'Create Nature')].join(','), 'advanced,legendary,exceptional,');
/* only the current (Ultimate) text: talents that exist only in a page's old copy are left out */
check('old-only talents are left out (War: Greater Rally)', !has('war', 'Greater Rally'));

const D = read('drawbacks.json');
check('at least 450 drawbacks and boons', D.d.length >= 450, D.d.length);
const db = name => D.d.filter(d => norm(d[0]) === norm(name));
check('Consciousness Linked is a general drawback', db('Consciousness Linked').some(d => /General Drawbacks/.test(d[2]) && !d[5]));
check('Energy Focus is a Destruction drawback', db('Energy Focus').some(d => d[5] === 'Destruction'));
check('Easy Focus is a boon', db('Easy Focus').some(d => /Boons/.test(d[2])));
check('no drawback has empty text', D.d.every(d => String(d[3] || '').trim()), D.d.filter(d => !String(d[3] || '').trim()).map(d => d[0]).slice(0, 10).join(', '));
const size = fs.readdirSync(DIR).reduce((a, f) => a + fs.statSync(path.join(DIR, f)).size, 0);
check('all files together under 6 MB', size < 6 * 1048576, (size / 1048576).toFixed(1) + ' MB');

console.log(`\n${pass} passed, ${fail} failed (${slugs.length} spheres, ${total} talents, ${D.d.length} drawbacks and boons)`);
process.exit(fail ? 1 : 0);
