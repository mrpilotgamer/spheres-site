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
/* archetypes (2026-11-12): replaced features point at real base features; the sheet's list of Paizo classes with conversions matches */
const abad = [];
let narch = 0;
for (const s of cslugs) { const F = cread(s + '.json'); (F.a || []).forEach(a => { narch++; a[2].forEach(x => (x[3] || []).forEach(r => { if (!(r[0] >= 0 && r[0] < F.f.length && r[1] >= 0 && r[1] <= 20 && /^[rm]$/.test(r[2]))) abad.push(F.n + ' / ' + a[0] + ' / ' + x[0]); })); }); }
check('at least 150 archetypes', narch >= 150, narch);
check('every replaced or changed feature points at a base feature of that class', !abad.length, abad.slice(0, 10).join('; '));
const bpb = (cread('striker.json').a || []).find(a => a[0] === 'Black Powder Brawler'), gg = bpb && bpb[2].find(x => /^Gun Genius/.test(x[0]));
check('Black Powder Brawler: Gun Genius at 2nd replaces Tension Boost at 2nd and Uncanny Dodge', gg ? [gg[2]].concat(gg[3].map(r => cread('striker.json').f[r[0]][0] + '@' + r[1] + r[2])).join(', ') : 'missing', '2, Tension Boost (Ex)@2r, Uncanny Dodge (Ex)@0r, Improved Uncanny Dodge (Ex)@0r');
check('Black Powder Brawler: Firearm Fighter changes (not replaces) the Striker Art at 2nd', JSON.stringify((bpb[2].find(x => /^Firearm Fighter/.test(x[0])) || [])[3]), '[[5,2,"m"]]');
check('Bravo has all 9 archetypes its class page lists (some live in the bundle’s “other” files)', (cread('bravo.json').a || []).map(a => a[0]).join(', '), 'Allusionist, Daredevil, Dreadnought, Dynamo, Eclectic, Quicksilver, Serendipitist, Smasher, Tracer');
check('a “replaces/modifies” line without a full stop still counts: Allusionist modifies Cunning Celerity, so it clashes with Dreadnought', (() => { const B = cread('bravo.json'), by = n => new Set(B.a.find(a => a[0] === n)[2].flatMap(x => x[3].map(r => r[0]))), cc = B.f.findIndex(f => /^Cunning Celerity/.test(f[0]));
  return by('Allusionist').has(cc) && by('Dreadnought').has(cc); })());
check('Serendipitist: its “replaces careful footwork, dynamic dodge…” stays a replacement after a “modifies” line with no full stop', (() => { const B = cread('bravo.json'), cf = B.f.findIndex(f => /^Careful Footwork/.test(f[0]));
  return B.a.find(a => a[0] === 'Serendipitist')[2].some(x => x[3].some(r => r[0] === cf && r[2] === 'r')); })());
/* what archetypes change in the class's numbers (2026-11-12) */
const ast = (c, n) => JSON.stringify(((cread(c + '.json').a || []).find(a => a[0] === n) || [])[3] || null);
check('archetype saves: Dreadnought has good Fort and Will', ast('bravo', 'Dreadnought'), '{"g":["fort","will"]}');
check('archetype base attack and hit die: Feylord (BAB “equal to an incanter”, d6)', ast('commander', 'Feylord'), '{"bab":"1/2","hd":6}');
check('archetype class skills: Dreadlord adds four and removes four', ast('commander', 'Dreadlord'), '{"ca":["karc","krel","umd","spell"],"cr":["keng","surv","climb","swim"]}');
check('…a list with two Knowledges keeps both (Iron Mage), with its ranks', ast('hedgewitch', 'Iron Mage'), '{"ca":["khis","knob","intim"],"cr":[],"sk":4,"g":["fort","will"]}');
check('…a page’s own Class Skills feature wins over an inline variant (Darkshaper)', ast('armorist', 'Darkshaper'), '{"ca":["stealth"],"cr":["keng"],"sk":4}');
check('…a trade tradition replacing class skills is flagged (Administrator); ranks in a sentence count (Gambler)', [ast('commander', 'Administrator'), ast('thaumaturge', 'Gambler')].join(' '), '{"trade":1} {"trade":1,"sk":6}');
check('…a companion’s saves are not the class’s (Verminspeaker)', ast('truenamer', 'Verminspeaker'), '{}');
check('Genius (a Thaumaturge archetype presented as a class) has its own file: Flexible Training, Eureka and Invocations at 1st', (() => { const G = cread('genius.json'); return G.n === 'Genius' && G.lv['1'].map(e => e[1] >= 0 ? G.f[e[1]][0] : e[0]).join(', '); })(), 'Flexible Training (Ex), Eureka (Ex), Invocations');
check('Hedgewitch paths: 21, chosen 2 at a time, under “Paths”; Academia adds Knowledge (geography, nature, planes) and its secrets', (() => { const H = cread('hedgewitch.json'), P = H.paths, a = P.p.find(x => x.n === 'Academia');
  return [P.p.length, P.n, H.f[P.f][0], JSON.stringify(a.cs), a.sec.map(x => x[0]).join('+'), a.gsec.map(x => x[0]).join('+'), JSON.stringify(P.p.find(x => x.n === 'Astrology').bs)].join(' | '); })(), '21 | 2 | Paths | ["kgeo","knat","kpla"] | Academic Training+Extra Spell Points+Scholarship | Metamagic Knowledge | ["Light"]');
check('Wraith haunt paths: 15, one under “Haunt Path”; Anima offers Nature or Weather', (() => { const W = cread('wraith.json'), P = W.paths; return [P.p.length, P.n, W.f[P.f][0], JSON.stringify(P.p.find(x => x.n === 'Path of the Anima').sph)].join(' | '); })(), '15 | 1 | Haunt Path | ["Nature","Weather"]');
/* 2026-11-14: more of what archetypes replace is matched; paths have their parts at their levels */
check('a page a class’s own list claims isn’t handed to another class (Genius has no archetypes; Darkshaper is Armorist’s only)', [(cread('genius.json').a || []).length, (cread('breakdancer.json').a || []).some(a => a[0] === 'Darkshaper'), (cread('armorist.json').a || []).some(a => a[0] === 'Darkshaper')].join(' '), '0 false true');
check('a feature named with “The” in front matches (Void Stalker’s replacements on The Pressing Void are features, not unmatched)', (() => { const E = cread('ethermagus.json'), pv = E.f.findIndex(f => /^The Pressing Void/.test(f[0])); return E.a.some(a => a[2].some(x => x[3].some(r => r[0] === pv))); })());
check('one choice from a list: Banshee replaces Bound Nexus’s Aid the Dead option, not the whole feature', (() => { const S = cread('soul-weaver.json'), b = S.a.find(a => a[0] === 'Banshee'), x = b[2].find(x => (x[5] || []).length); return S.f[x[5][0][0]][0] + ' / ' + S.f[x[5][0][0]][2][x[5][0][1]][0] + ' / ' + x[5][0][2]; })(), 'Bound Nexus (Su) / Aid the Dead / r');
check('a part named inside a feature: Strong Style Grappler replaces “critical knuckle” in Tension Techniques', (() => { const S = cread('striker.json'), a = S.a.find(a => a[0] === 'Strong Style Grappler'); return a[2].some(x => (x[7] || []).some(c => /critical knuckle/i.test(c[1]) && /^Tension Techniques/.test(S.f[c[0]][0]))); })());
check('path parts at their table levels: Wraith’s Path of the Anima 1/2/4/8/14; Hedgewitch’s Academia mastery at 20', [cread('wraith.json').paths.p.find(x => x.n === 'Path of the Anima').parts.map(q => q[0] + '@' + q[2]).join(', '), cread('hedgewitch.json').paths.p.find(x => x.n === 'Academia').parts.map(q => q[0] + '@' + q[2]).join(', ')].join(' | '),
  'Path Sphere@1, Path Possession@2, Path Skill@4, Improved Path Possession@8, Greater Path Possession@14 | Path Benefit@1, Path Power@1, Path Mastery@20');
check('Commander has Administrator (a page saved from the live wiki, tools/wiki-extra/)', (cread('commander.json').a || []).some(a => a[0] === 'Administrator'));
check('Sphere Wizard is in wizard.json, a class file with no base features', (() => { const W = cread('wizard.json'); return W.pz === 1 && !W.f.length && W.a.some(a => a[0] === 'Sphere Wizard'); })());
const pzList = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8').match(/var CW_PZ=(\[[^\]]*\])/)[1].replace(/'/g, '"'));
check('the sheet’s CW_PZ list is the Paizo classes with a conversion file', pzList.slice().sort().join(' '), cslugs.filter(s => CI.classes[s].pz).sort().join(' '));
const csize = fs.readdirSync(CDIR).reduce((a, f) => a + fs.statSync(path.join(CDIR, f)).size, 0);
check('all class files together under 6 MB', csize < 6 * 1048576, (csize / 1048576).toFixed(1) + ' MB');

console.log(`\n${pass} passed, ${fail} failed (${slugs.length} spheres, ${total} talents, ${D.d.length} drawbacks and boons; ${cslugs.length} classes, ${nfeat} class features, ${narch} archetypes)`);
process.exit(fail ? 1 : 0);
