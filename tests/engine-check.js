/* Spheres Character Sheet: direct checks of the rules engine (fast: no clicking, no waiting).
   Opens public/index.html ONCE and talks to the read-only handle the page offers for tests, window.SheetEngine
   (calculations only: it never exposes the open character and never saves). Everything runs through page.evaluate.

     node tests/engine-check.js         (needs Playwright, like the other checks; takes a few seconds)

   Sections:
     A. the two example characters: the same numbers tests/check.js reads off the screen, asserted on derive(example)
     B. rule tables typed from the rules as written (wiki and Core Rulebook), never from the code's own output
     C. old saves convert (sanitize), damaged saves don't throw
     D. the handle leaves no trace: nothing saved, nothing on screen changes, even with a character open
   tests/check.js still drives the real page (tiles, dialogs, theme, Roll20 text): this file is the fast way to test the numbers. */
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', 'public', 'index.html');
let pass = 0, fail = 0;
const counts = {}; let section = '?';
function check(what, got, want) {
  const ok = String(got).trim() === String(want);
  if (ok) pass++; else fail++;
  counts[section] = (counts[section] || 0) + 1;
  console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok ? '' : `: got "${got}", expected "${want}"`));
}
const T0 = Date.now();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(FILE);
  await page.waitForFunction(() => window.SheetEngine);

  const derive = c => page.evaluate(c => window.SheetEngine.derive(c), c);
  const ex = await page.evaluate(() => window.SheetEngine.examples());
  const copy = o => JSON.parse(JSON.stringify(o));

  /* ---------- A. the two example characters (same numbers as tests/check.js) ---------- */
  section = 'A';
  console.log('Ilyra Voss (Incanter 12)');
  {
    const c = ex.incanter, d = await derive(c);
    check('Ilyra: hit points', d.hpMax, 98);
    check('Ilyra: AC', d.ac, 21);
    check('Ilyra: touch / flat-footed', `touch ${d.touch} · flat-footed ${d.ff}`, 'touch 15 · flat-footed 19');
    check('Ilyra: Fortitude', d.fort, 9);
    check('Ilyra: Reflex', d.ref, 9);
    check('Ilyra: Will', d.will, 12);
    check('Ilyra: caster level', d.cl, 12);
    check('Ilyra: magic DC', d.dc, 24);
    check('Ilyra: concentration', d.conc, 20);
    check('Ilyra: spell points', d.spMax, 29);
    { const x = copy(c); x.groups.find(g => g.id === 'g-aeg').on = false;
      check('Ilyra: AC with the aegis off (ring counts again)', (await derive(x)).ac, 15); }
    check('Ilyra: talents used', `${d.talentsHave} / ${d.talentsExpected}`, '21 / 21');
    { const s = await page.evaluate(c => window.SheetEngine.sphereStats(c, 'Destruction'), c);
      check('Ilyra: Destruction DC and CL', `DC ${s.dc} · CL ${s.cl}`, 'DC 25 · CL 13'); }
    check('Ilyra: skill ranks', `Ranks ${d.skSpent} of ${d.skBudget}`, 'Ranks 128 of 156');
    check('Ilyra: drawback spell points (left over → bonus)', `${d.trad.left} → +${d.trad.sp}`, '2 → +5');
    { const x = copy(c); x.traditions.casting.drawbacks.push({ name: 'Limited Alteration', kind: 'sphere', weight: 1, sphere: 'Alteration', notes: '' });
      let e = await derive(x); check('Ilyra: a drawback added on a sphere card adds a talent', `${e.talentsHave} / ${e.talentsExpected}`, '21 / 22');
      x.traditions.casting.drawbacks[x.traditions.casting.drawbacks.length - 1].weight = 2;
      e = await derive(x); check('Ilyra: a drawback that gives 2 talents adds 2', `${e.talentsHave} / ${e.talentsExpected}`, '21 / 23'); }
    { const k = await page.evaluate(c => window.SheetEngine.compStats(c.companions[0], {}, c), c);
      check('Ilyra: Ember hit points', k.hpMax, 58); }
    { const x = copy(c); x.rules.divCast = true; const e = await derive(x);
      check('Ilyra: divided casting scores: concentration = caster level + Wis (12 + 1)', e.conc, 13);
      check('Ilyra: …spell points = class levels + Int, DC = 10 + ½ CL + best mental', `${e.spMax} ${e.dc}`, '29 24'); }
  }

  console.log('Tova Rask (Striker 12)');
  {
    const c = ex.striker, d = await derive(c);
    check('Tova: hit points', d.hpMax, 188);
    check('Tova: AC', d.ac, 28);
    check('Tova: touch / flat-footed', `touch ${d.touch} · flat-footed ${d.ff}`, 'touch 21 · flat-footed 25');
    check('Tova: CMD', d.cmd, 37);
    { const L = d.bd.cmd.lines;
      check('Tova: Striker CMD breakdown: the AC bonus (striker) CMD modifier counts, not listed as left out', L.some(l => /AC bonus \(striker\)/.test(l.src) && l.counts) && !L.some(l => /^Not counted:.*AC bonus \(striker\)/.test(l.src)), true);
      check('Tova: Striker CMD breakdown: Unarmored Training (armor) is still left out', L.some(l => /^Not counted: Unarmored Training/.test(l.src) && !l.counts), true); }
    check('Tova: Fortitude', d.fort, 17);
    check('Tova: Reflex', d.ref, 13);
    check('Tova: Will', d.will, 8);
    check('Tova: initiative', d.init, 6);
    check('Tova: speed', d.speed, 40);
    check('Tova: martial DC', d.mdc, 22);
    check('Tova: unarmed attacks', d.atk.w1.its.join('/'), '17/12/7');
    check('Tova: unarmed damage', `${d.atk.w1.dice}+${d.atk.w1.dmg}`, '2d6+5');
    check('Tova: tension maximum', d.res.r1.max, 12);
    { const x = copy(c); x.groups.find(g => g.id === 'g-has').on = true; const e = await derive(x);
      check('Tova: AC with Haste', e.ac, 29);
      check('Tova: attacks with Haste', e.atk.w1.its.join('/'), '18/18/13/8'); }
    { const x = copy(c); x.sphDrawbacks.push({ id: 'zz1', name: 'Test Drawback', sphere: 'Boxing', weight: 1, notes: '', tk: 'combat' }); const e = await derive(x);
      check('Tova: a combat sphere drawback adds a talent', `${e.talentsHave} / ${e.talentsExpected}`, '14 / 15'); }
    { const x = copy(c); x.sphDrawbacks.push({ id: 'zz2', name: 'Test Drawback', sphere: 'Bluster', weight: 1, notes: '', tk: 'skill' }); const e = await derive(x);
      check('Tova: a skill sphere drawback adds a talent', `${e.talentsHave} / ${e.talentsExpected}`, '14 / 15'); }
    check('Tova: talents used (Extra Skill Talent ×2 counts itself since 2026-11-08)', `${d.talentsHave} / ${d.talentsExpected}`, '14 / 14');
    check('Tova: skill ranks', `Ranks ${d.skSpent} of ${d.skBudget}`, 'Ranks 48 of 48');
    check('Tova: Acrobatics (2 bought + 10 from Athletics)', d.skills.acro.total, 17);
    check('Tova: Intimidate (2 bought + 10 from Bluster)', d.skills.intim.total, 16);
    check('Tova: no “must retrain” warning', d.skRetrain.length + ' ' + Object.values(d.skills).filter(s => s.retrain > 0).length, '0 0');
    { const x = copy(c); x.sphSkills.Bluster = ['bluff']; let e = await derive(x);
      check('Tova: Intimidate after the switch', e.skills.intim.total, 6);
      check('Tova: Bluff after the switch', e.skills.bluff.total, 9);
      x.skillRanks.acro = 5; e = await derive(x);
      check('Tova: “must retrain” after over-buying Acrobatics', e.skills.acro.retrain, 3); }
  }

  /* ---------- B. rule tables, typed from the rules as written ---------- */
  section = 'B';
  console.log('Rule tables');
  /* Bonus spell points from general drawbacks: Spheres of Power wiki, Traditions page, “Boons” (table: Number of Drawbacks | Bonus Spell Points):
       1 drawback  +1, +1 per 6 levels in casting classes      → 1 + floor(n/6)
       2 drawbacks +1, +1 per 3 levels                         → 1 + floor(n/3)
       3 drawbacks +1 per odd level (1, 3, 5, etc.)            → one for each odd level up to n
       4 drawbacks +1, +1 per 1.5 levels (2, 3, 5, 6, etc.)    → 1, plus one at each of levels 2, 3, 5, 6, 8, 9, …
       5 drawbacks +1 per level                                → n
     Worked by hand for levels 1, 2, 3, 5, 6, 12, 20 (levels of the casting classes). */
  {
    const LV = [1, 2, 3, 5, 6, 12, 20], want = {
      1: [1, 1, 1, 1, 2, 3, 4],        // 1 + floor(n/6): 1,1,1,1,2 (6/6=1), 3 (12/6=2), 4 (20/6=3)
      2: [1, 1, 2, 2, 3, 5, 7],        // 1 + floor(n/3): 1,1,2 (3/3), 2 (5/3=1), 3 (6/3=2), 5 (12/3=4), 7 (20/3=6)
      3: [1, 1, 2, 3, 3, 6, 10],       // odd levels up to n: 1 | 1 | 1,3 | 1,3,5 | 1,3,5 | 1,3,5,7,9,11 | ten odd levels to 19
      4: [1, 2, 3, 4, 5, 9, 14],       // 1 + gains at 2,3 | 5 | 6 …: n=12 gains at 2,3,5,6,8,9,11,12 (8) ; n=20 adds 14,15,17,18,20 (13)
      5: [1, 2, 3, 5, 6, 12, 20] };
    const got = await page.evaluate(LV => { const o = {}; for (const d of [1, 2, 3, 4, 5]) o[d] = LV.map(n => window.SheetEngine.drawbackSP(d, n)); return o; }, LV);
    for (const d of [1, 2, 3, 4, 5]) LV.forEach((n, i) => check(`bonus spell points: ${d} drawback${d > 1 ? 's' : ''} at casting level ${n}`, got[d][i], want[d][i]));
    check('bonus spell points: no drawbacks (or no levels) gives none', await page.evaluate(() => [0, 5].map(n => window.SheetEngine.drawbackSP(0, n)).concat(window.SheetEngine.drawbackSP(3, 0)).join(',')), '0,0,0');
  }

  /* Skill expertise: Spheres of Guile (core rules page), “Table: Skill Talents by Expertise Tier”: for each class level, Any and Utility talents
     for Virtuoso, Journeyman, Trained. The sheet's tierSplit takes '1' (virtuoso), '0.75' (journeyman), '0.5' (trained). 20 levels x 3 tiers = 60 rows. */
  {
    //        Virtuoso  Journeyman  Trained        (Any, Utility) each
    const TBL = [
      [1, 0, 0, 1, 0, 1], [2, 1, 1, 1, 0, 1], [3, 1, 1, 2, 0, 2], [3, 2, 2, 2, 1, 2], [4, 2, 2, 3, 1, 3],
      [5, 3, 3, 3, 1, 3], [6, 3, 3, 4, 1, 4], [6, 4, 4, 4, 2, 4], [7, 4, 4, 5, 2, 5], [8, 5, 5, 5, 2, 5],
      [9, 5, 5, 6, 2, 6], [9, 6, 6, 6, 3, 6], [10, 6, 6, 7, 3, 7], [11, 7, 7, 7, 3, 7], [12, 7, 7, 8, 3, 8],
      [12, 8, 8, 8, 4, 8], [13, 8, 8, 9, 4, 9], [14, 9, 9, 9, 4, 9], [15, 9, 9, 10, 4, 10], [15, 10, 10, 10, 5, 10]];
    const got = await page.evaluate(() => { const o = []; for (let n = 1; n <= 20; n++) o.push(['1', '0.75', '0.5'].map(r => window.SheetEngine.tierSplit(r, n))); return o; });
    TBL.forEach((row, i) => ['Virtuoso', 'Journeyman', 'Trained'].forEach((t, j) => {
      check(`skill expertise, ${t}, class level ${i + 1}: any / utility`, `${got[i][j].any} / ${got[i][j].util}`, `${row[2 * j]} / ${row[2 * j + 1]}`); }));
  }

  /* Conjuration companion: Spheres of Power wiki, Conjuration, “Table: Companion” (caster levels 1-20). Hit Dice, BAB, Feats, Natural Armor Bonus (on top of the
     form's own +2 for a quadruped), Good Saves and Bad Saves are the base values before the companion's ability modifiers. */
  {
    //   CL  HD BAB feats NA good bad
    const TBL = [[1, 1, 1, 1, 0, 2, 0], [2, 2, 2, 1, 1, 3, 0], [3, 3, 3, 2, 1, 3, 1], [4, 3, 3, 2, 1, 3, 1], [5, 4, 4, 2, 2, 4, 1], [6, 5, 5, 3, 2, 4, 1],
      [7, 6, 6, 3, 3, 5, 2], [8, 6, 6, 3, 3, 5, 2], [9, 7, 7, 4, 3, 5, 2], [10, 8, 8, 4, 4, 6, 2], [11, 9, 9, 5, 4, 6, 3], [12, 9, 9, 5, 4, 6, 3],
      [13, 10, 10, 5, 5, 7, 3], [14, 11, 11, 6, 5, 7, 3], [15, 12, 12, 6, 6, 8, 4], [16, 12, 12, 6, 6, 8, 4], [17, 13, 13, 7, 6, 8, 4], [18, 14, 14, 7, 7, 9, 4],
      [19, 15, 15, 8, 7, 9, 5], [20, 15, 15, 8, 7, 9, 5]];
    const got = await page.evaluate(() => { const E = window.SheetEngine, c = E.blankComp('conj'); c.form = 'quadruped'; /* Fort good, Ref good, Will bad; +2 natural armor */
      const o = []; for (let cl = 1; cl <= 20; cl++) { const k = E.compStats(c, { cl }); o.push({ hd: k.hd, bab: k.bab, feats: k.feats, na: k.na, good: k.fort - k.mod.con, good2: k.ref - k.mod.dex, bad: k.will - k.mod.wis }); } return o; });
    TBL.forEach((r, i) => check(`Conjuration companion at caster level ${r[0]}: HD, BAB, feats, natural armor (form +2), good saves, bad save`,
      [got[i].hd, got[i].bab, got[i].feats, got[i].na - 2, got[i].good, got[i].bad].join(' '), r.slice(1).join(' ')));
    check('Conjuration companion: both good saves match the table', got.every((g, i) => g.good === TBL[i][5] && g.good2 === TBL[i][5]), true);
  }

  /* Carrying capacity: Core Rulebook, Table 7-4 (heavy load by Strength score); light is a third and medium two thirds (rounded down). */
  {
    const HEAVY = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 520, 600, 700, 800, 920, 1040, 1200, 1400];
    const got = await page.evaluate(() => { const o = []; for (let s = 1; s <= 29; s++) o.push(window.SheetEngine.heavyLoad(s)); return o.concat([30, 40].map(s => window.SheetEngine.heavyLoad(s))); });
    HEAVY.forEach((h, i) => check(`heavy load, Strength ${i + 1}`, got[i], h));
    check('heavy load, Strength 30 (×4 every 10 points above 29: Table 7-4 note)', got[29], 1600);
    check('heavy load, Strength 40', got[30], 6400);
    const L = await page.evaluate(() => [10, 14, 17].map(s => window.SheetEngine.loadFor(s, 'M', false, 1)));
    [[10, 33, 66, 100], [14, 58, 116, 175], [17, 86, 173, 260]].forEach(([s, l, m, h], i) =>
      check(`light / medium / heavy at Strength ${s}`, `${L[i].light}/${L[i].medium}/${L[i].heavy}`, `${l}/${m}/${h}`));
  }

  /* BAB and base saves: Core Rulebook, Table 3-1 progressions. BAB full = level, ¾ = ⌊3n/4⌋, ½ = ⌊n/2⌋. Base save good = 2 + ⌊n/2⌋, poor = ⌊n/3⌋;
     prestige classes: good ⌊(n+1)/2⌋, poor ⌊(n+1)/3⌋. Taken through derive() of a one-class character at levels 1, 2, 3, 5, 10, 20. */
  {
    const LV = [1, 2, 3, 5, 10, 20];
    const BAB = { full: [1, 2, 3, 5, 10, 20], '3/4': [0, 1, 2, 3, 7, 15], '1/2': [0, 1, 1, 2, 5, 10] };
    const GOOD = [2 + 0, 3, 3, 4, 7, 12], POOR = [0, 0, 1, 1, 3, 6], PGOOD = [1, 1, 2, 3, 5, 10], PPOOR = [0, 1, 1, 2, 3, 7];
    /* hand values: good: 2+floor(n/2) = 2,3,3,4,7,12; poor floor(n/3) = 0,0,1,1,3,6; prestige good floor((n+1)/2) = 1,1,2,3,5,10; prestige poor floor((n+1)/3) = 0,1,1,2,3,7 */
    const mk = (bab, pre, n) => page.evaluate(([bab, pre, n]) => window.SheetEngine.derive(window.SheetEngine.sanitize({ classes: { c1: { name: 'Test', hd: 8, bab, good: ['fort'], prestige: pre } }, levels: Array.from({ length: n }, () => ({ cls: 'c1', hp: 5 })) })), [bab, pre, n]);
    for (const b of Object.keys(BAB)) for (let i = 0; i < LV.length; i++) {
      const d = await mk(b, false, LV[i]);
      check(`BAB, ${b} class, level ${LV[i]}`, d.bab, BAB[b][i]);
      check(`pure helper babFor('${b}', ${LV[i]})`, await page.evaluate(([b, n]) => window.SheetEngine.babFor(b, n), [b, LV[i]]), BAB[b][i]);
    }
    for (let i = 0; i < LV.length; i++) {
      const d = await mk('3/4', false, LV[i]), p = await mk('3/4', true, LV[i]);
      check(`base saves, good Fortitude and poor Reflex/Will, level ${LV[i]}`, `${d.base.fort}/${d.base.ref}/${d.base.will}`, `${GOOD[i]}/${POOR[i]}/${POOR[i]}`);
      check(`base saves, prestige class, level ${LV[i]}`, `${p.base.fort}/${p.base.ref}/${p.base.will}`, `${PGOOD[i]}/${PPOOR[i]}/${PPOOR[i]}`);
    }
  }

  /* Caster level from a class's casting progression (Spheres of Power: high = level, mid = ¾ level, low = ½ level), rounded down. */
  {
    const got = await page.evaluate(() => [1, 2, 3, 4, 5, 8, 20].map(n => ['high', 'mid', 'low', 'none'].map(p => window.SheetEngine.clFor(p, n)).join('/')));
    ['1/0/0/0', '2/1/1/0', '3/2/1/0', '4/3/2/0', '5/3/2/0', '8/6/4/0', '20/15/10/0'].forEach((w, i) => check(`caster level by progression (high/mid/low/none), class level ${[1, 2, 3, 4, 5, 8, 20][i]}`, got[i], w));
  }

  /* Damage dice by size: Core Rulebook, Table 6-5 (weapon damage by size) and the Paizo FAQ for the dice not in the table. Medium → Large and Medium → Small. */
  {
    const CASES = [['1d8', 'L', '2d6'], ['1d6', 'L', '1d8'], ['2d6', 'L', '3d6'], ['1d8', 'S', '1d6'], ['1d6', 'S', '1d4'], ['2d6', 'S', '1d10'], ['1d10', 'S', '1d8'],
      ['1d12', 'L', '3d6'], ['2d4', 'L', '2d6'], ['1d4', 'S', '1d3'], ['2d10', 'L', '4d8']];
    const got = await page.evaluate(CASES => CASES.map(([d, s]) => window.SheetEngine.scaleDice(d, 4 /* Medium */, s === 'L' ? 1 : -1)), CASES);
    CASES.forEach(([d, s, w], i) => check(`dice ${d} Medium → ${s === 'L' ? 'Large' : 'Small'}`, got[i], w));
  }

  /* Formulas: the sheet's own help examples (FEXAMPLES, written and "or say" forms), worked by hand with a variable set typed here. */
  {
    const V = { lvl: 7, hd: 7, bab: 5, cl: 7, str: 3, con: 1, dex: 2, wis: 2, cha: 0, sr: 23 };
    const run = (f, v) => page.evaluate(([f, v]) => { const r = window.SheetEngine.evalF(f, v); return isNaN(r) ? 'NaN' : r; }, [f, v]);
    const CASES = [
      ['max(3, hd)', V, 7], ['max(3, hd)', Object.assign({}, V, { hd: 2 }), 3],                                   // Toughness: hd, at least 3
      ['hd, minimum 3', Object.assign({}, V, { hd: 2 }), 3],
      ['1+floor(bab/4)', V, 2], ['1 + 1 per 4 bab', V, 2],                                                        // 1 + floor(5/4)
      ['floor(lvl/2)', V, 3], ['half lvl', V, 3],                                                                 // floor(7/2)
      ['max(1, floor(lvl/2))', Object.assign({}, V, { lvl: 1 }), 1], ['max(1, floor(lvl/2))', V, 3], ['half lvl, min 1', Object.assign({}, V, { lvl: 1 }), 1],
      ['max(1, wis)', V, 2], ['max(1, wis)', Object.assign({}, V, { wis: -1 }), 1], ['wis, minimum 1', Object.assign({}, V, { wis: -1 }), 1],
      ['max(str,con) - cha', V, 3],                                                                               // 3 - 0
      ['floor(sr/5)', V, 4],                                                                                      // floor(23/5)
      ['cl + wis', V, 9],
      ['3*(1+floor(bab/4))', V, 6],                                                                               // 3 * 2
      ['2+3*4', V, 14], ['(2+3)*4', V, 20], ['-lvl+10', V, 3]];
    for (const [f, v, w] of CASES) check(`formula “${f}” (lvl ${v.lvl}, hd ${v.hd}, bab ${v.bab}, wis ${v.wis})`, await run(f, v), w);
    const FEX = await page.evaluate(() => window.SheetEngine.FEXAMPLES.map(x => x[1]));
    check('the help lists the nine examples used above', FEX.length, 9);
    check('formula: an unknown name is not a number', await run('xx+1', V), 'NaN');
    check('formula: an unclosed bracket is not a number', await run('max(3, hd', V), 'NaN');
    check('formula: ability modifier from a score, floor((s-10)/2): 8, 9, 10, 11, 18, 7', await page.evaluate(() => [8, 9, 10, 11, 18, 7].map(s => window.SheetEngine.amod(s)).join(' ')), '-1 -1 0 0 4 -2');
  }

  /* ---------- C. old saves convert ---------- */
  section = 'C';
  console.log('Old saves');
  {
    const S = o => page.evaluate(o => window.SheetEngine.sanitize(o), o);
    const talp = async v => (await S({ classes: { c1: { name: 'X', talents: v } }, levels: [{ cls: 'c1', hp: 5 }] })).classes.c1.talents;
    check('old talent setting “0” becomes “auto”', await talp('0'), 'auto');
    check('old talent setting “1.5” becomes “0.75”', await talp('1.5'), '0.75');
    check('old talent setting “2” becomes “0.5”', await talp('2'), '0.5');
    check('a current setting (“0.75”) stays', await talp('0.75'), '0.75');
    check('an unknown setting becomes “auto”', await talp('banana'), 'auto');
    check('“constructor” as a talent setting becomes “auto”', await talp('constructor'), 'auto');
    for (const k of ['wisConc', 'intPool', 'highDC', 'wisDur']) {
      const r = (await S({ rules: { maxFirst: true, [k]: true } })).rules;
      check(`an old casting switch (${k}) turns on “Divided casting scores”, and is gone`, `${r.divCast} ${k in r}`, 'true false');
    }
    check('a save with none of the old switches does not turn it on', !!(await S({ rules: { maxFirst: true } })).rules.divCast, false);
    const damaged = [
      ['a null drawback', { traditions: { casting: { on: true, drawbacks: [null], boons: [null] } } }],
      ['a companion with no abilities', { companions: [{ kind: 'cohort', abil: null, mods: 'x' }] }],
      ['a class with odd class skills', { classes: { c1: { name: 'X', classSkills: 'x' } }, levels: [{ cls: 'c1', hp: 5 }] }],
      ['a null log row and a numeric sphere', { log: [null], levels: [{ picks: [{ kind: 'talent', name: 'A', sphere: 5 }] }] }],
      ['broken skill abilities and trade overlaps', { skillAbil: { intim: { a: 'luck' }, bluff: 'x', climb: null, diplo: { a: 'str', why: 5 } }, traditions: { trade: { on: true, plus4: 'handle' } } }],
      ['broken wiki links', { extraPicks: [{ kind: 'talent', name: 'A', sphere: 'Nature', ref: 'x' }, { kind: 'talent', name: 'B', ref: { s: 5, n: null } }], traditions: { casting: { on: true, drawbacks: [{ name: 'C', ref: [] }] } }, sphDrawbacks: [{ sphere: 'Nature', name: 'D', ref: { s: 'drawbacks' } }] }],
      ['“constructor” as a theme, condition and form', { theme: { preset: 'constructor' }, conds: { constructor: true }, forms: [{ id: 'f', tf: 'constructor' }] }],
      ['level picks and ranks that are not lists', { levels: [{ picks: 'y', ranks: 'x', cls: 5 }, { picks: { a: 1 } }] }],
      ['a numeric DR bypass and source', { dr: [{ val: '5', bypass: 5, src: 7 }] }],
      ['fields of the wrong kind', { name: 'Damaged', race: { x: 1 }, player: ['a'], notes: 'x', abil: 'x', baseSpeed: { a: 1 } }]];
    for (const [what, extra] of damaged) {
      const r = await page.evaluate(x => { try { const E = window.SheetEngine, c = E.sanitize(Object.assign({ app: 'spheres-sheet', v: 1, id: 'dmg1', name: 'Damaged' }, x)), d = E.derive(c); return c.name + ' ' + (typeof d.hpMax); } catch (e) { return 'threw ' + e.message; } }, extra);
      check('a damaged save converts and works out its numbers: ' + what, r, 'Damaged number');
    }
    check('something that is not a character becomes a blank one', await page.evaluate(() => [null, 5, 'x'].map(v => window.SheetEngine.sanitize(v).app).join(' ')), 'spheres-sheet spheres-sheet spheres-sheet');
    /* level plan feat and class feature rows (2026-11-12): older entries keep their text, the rows are cleaned */
    const pl = await page.evaluate(() => { const E = window.SheetEngine, base = { app: 'spheres-sheet', v: 1, id: 'pl1', name: 'P', classes: { c1: { name: 'Hero', hd: 10 } }, levels: [{ cls: 'c1', hp: 10, picks: [] }] };
      const old = E.sanitize(Object.assign({}, base, { plan: [{ cls: 'c1', feats: 'Toughness', features: 'Arsenal Tricks: Weapon Summon' }] })).plan[0];
      const neu = E.sanitize(Object.assign({}, base, { plan: [{ cls: 'nope' }, { cls: 'c1', fr: [{ name: ' Iron Will ', kind: 'bonus', mods: [{ target: 'will', val: 2, type: 'odd' }, { target: 'hp', val: '0' }, 'x', { val: 1 }] }, { name: '', kind: 'feat' }, 7, { name: 'Dodge', kind: 'x' }],
        xr: [{ name: 'Weapon Summon', under: 'Arsenal Tricks', notes: 'n', mods: 'bad' }, null] }] })).plan;
      const d = E.derive(E.sanitize(Object.assign({}, base, { plan: [{ cls: 'c1', fr: 5, xr: { a: 1 } }] })));
      return { old: ['fr' in old, 'xr' in old, old.feats, old.features].join(' | '), n: neu.length, fr: JSON.stringify(neu[0].fr), xr: JSON.stringify(neu[0].xr), d: typeof d.hpMax }; });
    check('an older plan entry keeps its typed feats and features (no rows)', pl.old, 'false | false | Toughness | Arsenal Tricks: Weapon Summon');
    check('plan feat rows: trimmed, unknown kinds become Feat, empty and broken rows and effects dropped, unknown bonus type untyped', [pl.n, pl.fr].join(' '),
      '1 [{"name":"Iron Will","notes":"","mods":[{"target":"will","val":"2","type":"untyped"}],"kind":"bonus"},{"name":"Dodge","notes":"","mods":[],"kind":"feat"}]');
    check('plan class feature rows keep the feature they go under', pl.xr, '[{"name":"Weapon Summon","notes":"n","mods":[],"under":"Arsenal Tricks"}]');
    check('plan rows that are not lists still give a working character', pl.d, 'number');
    /* a class's link to its wiki class file (2026-11-12): '' by name, '-' none, or a file name */
    check('class wiki link: kept when valid, cleared when not', await page.evaluate(() => { const E = window.SheetEngine, c = E.sanitize({ app: 'spheres-sheet', v: 1, id: 'w1', name: 'W',
      classes: { a: { name: 'A', wiki: 'striker' }, b: { name: 'B', wiki: '-' }, c: { name: 'C', wiki: '../x' }, d: { name: 'D', wiki: 5 }, e: { name: 'E' } } }).classes;
      return ['a', 'b', 'c', 'd', 'e'].map(k => JSON.stringify(c[k].wiki)).join(' '); }), '"striker" "-" "" "" ""');
    check('class archetypes: a list of names, anything else dropped', await page.evaluate(() => { const E = window.SheetEngine, c = E.sanitize({ app: 'spheres-sheet', v: 1, id: 'w2', name: 'W',
      classes: { a: { name: 'A', arch: ['Black Powder Brawler', 5, '', null, 'Voidrusher'] }, b: { name: 'B', arch: 'x' }, c: { name: 'C' } } }).classes;
      return ['a', 'b', 'c'].map(k => JSON.stringify(c[k].arch)).join(' '); }), '["Black Powder Brawler","Voidrusher"] [] []');
    check('a class’s values from before its archetypes: kept when sound, dropped when not', await page.evaluate(() => { const E = window.SheetEngine, c = E.sanitize({ app: 'spheres-sheet', v: 1, id: 'w3', name: 'W',
      classes: { a: { name: 'A', archBase: { good: ['ref', 'x'], bab: 'full', hd: 30, skills: 6, classSkills: ['acro', 5] } }, b: { name: 'B', archBase: { good: [], bab: 'lots', hd: 8, skills: 2, classSkills: [] } }, c: { name: 'C', archBase: 'x' } } }).classes;
      return [JSON.stringify(c.a.archBase), 'archBase' in c.b, 'archBase' in c.c].join(' '); }), '{"good":["ref"],"bab":"full","hd":12,"skills":6,"classSkills":["acro"]} false false');
  }

  /* ---------- D. the handle leaves no trace ---------- */
  section = 'D';
  console.log('Read-only handle');
  {
    check('the handle is frozen', await page.evaluate(() => Object.isFrozen(window.SheetEngine)), true);
    check('it has no key that is the open character, the cloud object or a save', await page.evaluate(() => Object.keys(window.SheetEngine).filter(k => /^(ch|char|character|current|open|cloud|CL|save|paint|render)$/i.test(k)).join(',') || 'none'), 'none');
    check('assigning to it does nothing', await page.evaluate(() => { try { window.SheetEngine.derive = 1; window.SheetEngine.extra = 1; } catch (e) {} return typeof window.SheetEngine.derive + ' ' + ('extra' in window.SheetEngine); }), 'function false');
    check('the cloud object is not reachable through it', await page.evaluate(() => Object.values(window.SheetEngine).some(v => v === window.SheetCloud)), false);

    /* one synchronous run: snapshot, lots of derive() calls on other characters, snapshot (no timer can fire in between) */
    const SNAP = `(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o) + '|' + document.getElementById('main').innerHTML + '|' + document.getElementById('cname').textContent; })`;
    const run = (what) => page.evaluate(([snap, what]) => {
      const E = window.SheetEngine, snapf = eval(snap), before = snapf(), ex = E.examples(), inB = JSON.stringify(ex);
      const out = [];
      for (let i = 0; i < 5; i++) { out.push(E.derive(ex.incanter).hpMax, E.derive(ex.striker).hpMax, E.derive(E.blank()).hpMax); }
      E.sphereStats(ex.incanter, 'Destruction'); E.compStats(ex.incanter.companions[0], {}, ex.incanter);
      const after = snapf();
      return { same: before === after, inputUntouched: inB === JSON.stringify(ex), hp: out.slice(0, 3).join('/'), keys: localStorage.length };
    }, [SNAP, what]);
    let r = await run('no character open');
    check('no character open: storage and screen are the same after many derive() calls', r.same, true);
    check('…and a derived character is not changed by it', r.inputUntouched, true);
    check('…and each call works out its own numbers', r.hp, '98/188/0');

    /* with an example OPEN on screen (the one place that needs the page itself: open it the way the button does, wait for it to show) */
    await page.click('button[data-k="incanter"]');
    await page.waitForFunction(() => /Ilyra/.test((document.getElementById('cname') || {}).textContent || ''));
    r = await run('Ilyra open');
    check('with Ilyra open: storage and screen are the same after derive() of the others', r.same, true);
    check('…and something was saved (so the comparison does cover her)', r.keys >= 2, true);
    const mix = await page.evaluate(([snap]) => { const E = window.SheetEngine, snapf = eval(snap), before = snapf(), ex = E.examples(), d = E.derive(ex.striker); const again = E.derive(ex.incanter); const after = snapf();
      return { same: before === after, striker: [d.hpMax, d.ac, d.cmd, d.cl].join(' '), incanter: [again.hpMax, again.ac, again.cl].join(' '), screen: (document.querySelector('.card .big') || {}).textContent }; }, [SNAP]);
    check('with Ilyra open: derive of Tova returns Tova’s numbers', mix.striker, '188 28 37 0');
    check('…derive of Ilyra again returns hers', mix.incanter, '98 21 12');
    check('…the screen still shows Ilyra’s hit points', String(mix.screen).trim(), 98);
    check('…and screen and storage are unchanged', mix.same, true);
    check('…and the open character still works out its own numbers afterwards', await page.evaluate(() => (document.querySelector('.card .big') || {}).textContent.trim()), 98);
  }

  check('no page errors', errors.length ? errors.join(' | ') : 'none', 'none');
  await browser.close();
  console.log(`\nA ${counts.A || 0}, B ${counts.B || 0}, C ${counts.C || 0}, D ${counts.D || 0} checks (the last, no page errors, is counted in D)`);
  console.log(`${pass} passed, ${fail} failed in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
