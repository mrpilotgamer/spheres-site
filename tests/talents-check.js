/* Spheres Character Sheet: checks on the talent description files (public/talents/), no browser needed.

     python3 tools/build-talents.py <path to SoP-Claude-Bundles>
     node tests/talents-check.js

   Run it after rebuilding the files from a new wiki bundle (and the class feature files: python3 tools/build-classes.py <bundle>). It checks every file the index names is there and
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

/* ---------- class feature files (public/classes/, tools/build-classes.py, 2026-11-12) ---------- */
const CDIR = path.resolve(__dirname, '..', 'public', 'classes');
const cread = f => JSON.parse(fs.readFileSync(path.join(CDIR, f), 'utf8'));
const CI = cread('index.json'), cslugs = Object.keys(CI.classes);
check('class index lists at least 110 Spheres classes', cslugs.length >= 110, cslugs.length);
const cmiss = [], cbad = [], cidx = [], cempty = [];
let nfeat = 0;
for (const s of cslugs) {
  if (!fs.existsSync(path.join(CDIR, s + '.json'))) { cmiss.push(s); continue; }
  const F = cread(s + '.json');
  if (F.f.length !== CI.classes[s].c || F.n !== CI.classes[s].n) cbad.push(s);
  nfeat += F.f.length;
  F.f.forEach(f => { if (!String(f[0] || '').trim() || !(String(f[1] || '').trim() || (f[2] || []).length)) cempty.push(F.n + ' / ' + f[0]); });
  Object.entries(F.lv).forEach(([l, es]) => es.forEach(e => {
    if (!(+l >= 1 && +l <= 20) || !(e[1] >= -1 && e[1] < F.f.length) || (e.length > 2 && !(e[1] >= 0 && e[2] >= 0 && e[2] < F.f[e[1]][2].length))) cidx.push(F.n + ' ' + l + ' ' + e[0]); }));
}
check('every class in the index has its file, with the feature count and name it says', !cmiss.length && !cbad.length, cmiss.concat(cbad).join(', '));
check('every class level entry points at a feature (or none) and a choice that exist', !cidx.length, cidx.slice(0, 10).join('; '));
check('no feature without a name or without text and choices', !cempty.length, cempty.slice(0, 10).join('; '));
const corph = fs.readdirSync(CDIR).filter(f => f.endsWith('.json') && f !== 'index.json' && !CI.classes[f.slice(0, -5)]);
check('no leftover class files from an older build', !corph.length, corph.join(', '));
const cfeat = (c, n) => (cread(c + '.json').f.find(f => norm(f[0]) === norm(n)) || null);
check('Striker: Striker Art has its list (at least 30 arts, Adrenaline Rush among them)', (cfeat('striker', 'Striker Art') || [0, 0, []])[2].length >= 30 && cfeat('striker', 'Striker Art')[2].some(o => norm(o[0]) === 'adrenalinerush'));
check('Striker level 2 names Striker Art and Tension Boost', cread('striker.json').lv['2'].map(e => cread('striker.json').f[e[1]][0]).join(', '), 'Striker Art (Ex), Tension Boost (Ex)');
check('Troubadour: Actor Training lists Gossip', (cfeat('troubadour', 'Actor Training') || [0, 0, []])[2].some(o => norm(o[0]) === 'gossip'));
check('Incanter has a Specializations feature with its text', !!cfeat('incanter', 'Incanter Specializations') && cfeat('incanter', 'Incanter Specializations')[1].length > 100);
const csize = fs.readdirSync(CDIR).reduce((a, f) => a + fs.statSync(path.join(CDIR, f)).size, 0);
check('all class files together under 4 MB', csize < 4 * 1048576, (csize / 1048576).toFixed(1) + ' MB');

console.log(`\n${pass} passed, ${fail} failed (${slugs.length} spheres, ${total} talents, ${D.d.length} drawbacks and boons; ${cslugs.length} classes, ${nfeat} class features)`);
process.exit(fail ? 1 : 0);
