/* Spheres Character Sheet: automated checks.
   Opens public/index.html in a headless browser, loads both example characters, and checks the numbers the
   sheet works out against values worked out by hand from the rules. Run it after changing the sheet:

     node tests/check.js            (needs Playwright: npm i playwright && npx playwright install chromium)

   It lives outside public/, so `firebase deploy` never uploads it. When you change an example on purpose,
   update the expected numbers here too. */
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', 'public', 'index.html');
let pass = 0, fail = 0;
function check(what, got, want) {
  const ok = String(got).trim() === String(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok ? '' : `: got "${got}", expected "${want}"`));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const tile = async label => (await page.locator('.tile', { has: page.locator('.k', { hasText: new RegExp('^' + label + '$', 'i') }) }).first().locator('.v').innerText()).replace(/\s+/g, ' ');
  const tileNote = async label => (await page.locator('.tile', { has: page.locator('.k', { hasText: new RegExp('^' + label + '$', 'i') }) }).first().locator('.n').innerText()).replace(/\s+/g, ' ');
  const go = async (group, tab) => {
    await page.click(`#tabbar [data-tgrp]:has-text("${group}")`); await page.waitForTimeout(120);
    await page.locator('#tabbar [data-tab]', { hasText: tab }).first().click(); await page.waitForTimeout(250);
  };
  const skillTotal = async name => (await page.locator('tr', { has: page.locator('td:first-child', { hasText: new RegExp('^' + name) }) }).first().locator('td').last().innerText()).trim();
  const home = async () => { await page.click('[data-a="home"]'); await page.waitForTimeout(250); };
  const cssVar = async v => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);

  await page.goto(FILE); await page.waitForTimeout(400);

  /* ---------- Ilyra Voss, Incanter 12 ---------- */
  console.log('Ilyra Voss (Incanter 12)');
  await page.click('button[data-k="incanter"]'); await page.waitForTimeout(400);
  check('hit points', (await page.locator('.card .big').first().innerText()), '98');
  check('AC', await tile('AC'), '21');
  check('touch / flat-footed', await tileNote('AC'), 'touch 15 · flat-footed 19');
  check('Fortitude', await tile('Fortitude'), '+9');
  check('Reflex', await tile('Reflex'), '+9');
  check('Will', await tile('Will'), '+12');
  check('caster level', await tile('Caster level'), '12');
  check('magic DC', await tile('Magic DC'), '24');
  check('concentration', await tile('Concentration'), '+20');
  check('spell points', await tile('Spell points'), '29');
  check('theme applied (Ember background)', await cssVar('--ground'), '#181010');
  await page.click('[data-a="grp"]:has-text("Aegis: Armored Magic")'); await page.waitForTimeout(200);
  check('AC with the aegis off (ring counts again)', await tile('AC'), '15');
  await page.click('[data-a="grp"]:has-text("Aegis: Armored Magic")'); await page.waitForTimeout(200);
  /* sphere effect with augments: Destructive blast at Destruction CL 13 */
  const blast = page.locator('.act', { hasText: 'Destructive blast' }).first();
  const fxline = async () => (await blast.locator('.fxline').innerText()).trim();
  const aug = async name => { await blast.locator('[data-a="augTog"]', { hasText: name }).click(); await page.waitForTimeout(150); };
  check('blast: default (Fire Blast)', await fxline(), 'Ranged touch +8 · 7d6+6 fire');
  check('blast: range from the sphere’s caster level', (await blast.locator('.note').first().innerText()).includes('230 ft'), 'true');
  await aug('Searing Blast');
  check('blast: Searing Blast replaces Fire Blast', await fxline(), 'Ranged touch +8 · 7d8+6 fire');
  check('blast: only one blast type on', await blast.locator('[data-a="augTog"][aria-pressed="true"]').count(), '1');
  await aug('Spell point: 1 die');
  check('blast: one die per caster level', await fxline(), 'Ranged touch +8 · 13d8+6 fire');
  await aug('Explosive Orb');
  check('blast: Explosive Orb (no attack roll, burst)', await fxline(), '13d8+6 fire · 20-ft.-radius burst');
  check('blast: save and cost', (await blast.locator('.note').first().innerText()).trim(), 'Spell points −2 · Reflex half DC 25 (Destruction) · 230 ft');
  await blast.locator('[data-a="useAct"]').click(); await page.waitForTimeout(200);
  check('blast: Use spends 2 spell points', await page.inputValue('input[data-f="resources.0.cur"]'), '21');
  /* Roll20 export */
  await go('Advanced', 'Save');
  const macro = async name => page.locator('#roll20 .li', { has: page.locator('b', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) }).first().locator('textarea').inputValue();
  const blastM = await macro('Destructive blast (Searing Blast, Explosive Orb, Spell point: 1 die per caster level)');
  check('Roll20: blast damage roll', blastM.includes('{{Damage=[[13d8+6+?{Damage modifier|0}]] fire}}'), 'true');
  check('Roll20: blast area', blastM.includes('{{Area=20-ft.-radius burst}}'), 'true');
  check('Roll20: concentration', (await macro('Checks')).includes('{{Concentration=[[1d20+20+?{Modifier|0}]]}}'), 'true');
  await go('Character', 'Talents');
  check('talents used', await tile('Talents used'), '21 / 21');
  check('Destruction DC and CL', (await page.locator('#sph-destruction .cardhead .tag').last().innerText()).trim(), 'DC 25 · CL 13');
  await go('Character', 'Skills');
  check('skill ranks', (await page.locator('.cardhead .note').first().innerText()).trim(), 'Ranks 128 of 156');
  await go('Character', 'Traditions');
  check('drawback spell points', (await page.locator('.list .li', { hasText: 'Left over' }).first().locator('b').innerText()).trim(), '2 → +5');
  check('Traditions points to the sphere drawback', (await page.locator('#main p.note', { hasText: 'Sphere-specific' }).innerText()).includes('Energy Focus (Destruction)'), 'true');
  check('the sphere drawback isn’t edited on Traditions any more', await page.locator('#main input[value="Energy Focus"]').count(), '0');
  /* sphere-specific drawbacks on the sphere's own card */
  await go('Character', 'Talents');
  check('“Energy Sphere” is a talent, not a base sphere', await page.locator('#sph-destruction details.item', { hasText: 'Energy Sphere' }).locator('.tag', { hasText: 'Base sphere' }).count(), '0');
  check('Destruction shows its drawback', (await page.locator('#sph-destruction .sphdb').innerText()).replace(/\s+/g, ' ').trim(), 'Drawback: Energy Focus Fire blasts only (and the fire blast type group).');
  await page.locator('#sph-alteration details.basehead > summary').click(); await page.waitForTimeout(150);
  await page.locator('#sph-alteration [data-a="sphDbAdd"]').click(); await page.waitForTimeout(250);
  const nm = page.locator('#sph-alteration .sphdbedit input[data-f$=".name"]').last();
  await nm.fill('Limited Alteration'); await nm.dispatchEvent('change'); await page.waitForTimeout(250);
  check('a drawback added on a sphere card adds a talent', await tile('Talents used'), '21 / 22');
  check('it shows on that sphere', (await page.locator('#sph-alteration .sphdb').innerText()).includes('Limited Alteration'), 'true');
  const wt = page.locator('#sph-alteration .sphdbedit input[data-f$=".weight"]').last();
  await wt.fill('2'); await wt.dispatchEvent('change'); await page.waitForTimeout(250);
  check('a drawback that gives 2 talents adds 2', await tile('Talents used'), '21 / 23');
  check('its line says so', (await page.locator('#sph-alteration .sphdb').innerText()).includes('2 talents'), 'true');
  await page.click('[data-a="undo"]'); await page.waitForTimeout(200); await page.click('[data-a="undo"]'); await page.waitForTimeout(200); await page.click('[data-a="undo"]'); await page.waitForTimeout(250);
  check('undo removes it again', await tile('Talents used'), '21 / 21');
  await go('Character', 'Companions');
  check('Ember hit points', (await page.locator('text=/\\d+ \\/ \\d+ hp/').first().innerText()).trim(), '58 / 58 hp');
  await home();
  check('Characters screen uses the standard colors', await cssVar('--ground'), '#121118');

  /* ---------- Tova Rask, Striker 12 ---------- */
  console.log('Tova Rask (Striker 12)');
  await page.click('button[data-k="striker"]'); await page.waitForTimeout(400);
  check('hit points', (await page.locator('.card .big').first().innerText()), '188');
  check('AC', await tile('AC'), '28');
  check('touch / flat-footed', await tileNote('AC'), 'touch 21 · flat-footed 25');
  check('CMD', await tile('CMD'), '37');
  check('Fortitude', await tile('Fortitude'), '+17');
  check('Reflex', await tile('Reflex'), '+13');
  check('Will', await tile('Will'), '+8');
  check('initiative', await tile('Initiative'), '+6');
  check('speed', await tile('Speed'), '40 ft');
  check('martial DC', await tile('Martial DC'), '22');
  const atk = page.locator('.atk', { hasText: 'Unarmed strike' }).first();
  check('unarmed attacks', (await atk.locator('.hit').innerText()).trim(), '+17/+12/+7');
  check('unarmed damage', (await atk.locator('button[data-k^="dmg:"]').innerText()).replace(/\s+/g, ' ').trim(), '2d6+5 + 1d6 fire');
  /* a pool that empties on a rest */
  await page.locator('[data-a="resAdj"][data-n="1"]').first().click(); await page.locator('[data-a="resAdj"][data-n="1"]').first().click(); await page.waitForTimeout(150);
  check('tension builds up', await page.inputValue('input[data-f="resources.0.cur"]'), '2');
  await page.click('[data-a="rest"][data-k="short"]'); await page.waitForTimeout(200);
  check('a short rest empties tension', await page.inputValue('input[data-f="resources.0.cur"]'), '0');
  check('… and refills martial focus', await page.inputValue('input[data-f="resources.1.cur"]'), '1');
  check('tension says how it resets', (await page.locator('.li', { hasText: 'Tension' }).first().locator('.note').first().innerText()).trim(), 'empties on a short or long rest');
  check('tension maximum', (await page.locator('.li', { hasText: 'Tension' }).first().locator('.stepper .note').innerText()).trim(), '/ 12');
  await page.click('[data-a="grp"]:has-text("Haste")'); await page.waitForTimeout(200);
  check('AC with Haste', await tile('AC'), '29');
  check('attacks with Haste', (await atk.locator('.hit').innerText()).trim(), '+18/+18/+13/+8');
  await page.click('[data-a="grp"]:has-text("Haste")'); await page.waitForTimeout(200);
  /* Pathfinder point buy on the Build tab */
  await go('Character', 'Build');
  await page.click('[data-a="pointBuy"]'); await page.waitForTimeout(200);
  check('point buy: Tova’s base scores cost 22', (await page.innerText('#pbTot')).trim(), '22');
  await page.click('.dlg [data-pb="int"][data-n="1"]'); await page.click('.dlg [data-pb="cha"][data-n="-1"]'); await page.waitForTimeout(100);
  check('point buy: Int 11 (+1) and Cha 7 (−2 more) total 21', (await page.innerText('#pbTot')).trim(), '21');
  check('point buy: 7 is the floor', await page.locator('.dlg [data-pb="cha"][data-n="-1"]').isDisabled(), 'true');
  if (process.env.SHOTS) await page.locator('.dlg').screenshot({ path: process.env.SHOTS + '/pointbuy.png' });
  await page.click('.dlg button:has-text("Use these scores")'); await page.waitForTimeout(250);
  check('point buy: the base scores are set', await page.inputValue('input[data-f="abil.int"]'), '11');
  await page.click('[data-a="undo"]'); await page.waitForTimeout(250);
  check('point buy: undo restores them', await page.inputValue('input[data-f="abil.int"]'), '10');
  /* a combat sphere drawback gives a combat talent */
  await go('Character', 'Talents');
  await page.locator('#sph-boxing details.basehead > summary').click(); await page.waitForTimeout(150);
  await page.locator('#sph-boxing [data-a="sphDbAdd"]').click(); await page.waitForTimeout(250);
  const bn = page.locator('#sph-boxing .sphdbedit input[data-f$=".name"]').last();
  await bn.fill('Test Drawback'); await bn.dispatchEvent('change'); await page.waitForTimeout(250);
  check('a combat sphere drawback adds a talent', await tile('Talents used'), '14 / 15');
  check('its card says it gives a combat talent', (await page.locator('#sph-boxing .sphdbedit').innerText()).includes('bonus combat talent'), 'true');
  await page.click('[data-a="undo"]'); await page.waitForTimeout(200); await page.click('[data-a="undo"]'); await page.waitForTimeout(250);
  check('undo removes it', await tile('Talents used'), '14 / 14');
  /* and a skill sphere drawback a skill talent */
  await page.locator('#sph-bluster details.basehead > summary').click(); await page.waitForTimeout(150);
  await page.locator('#sph-bluster [data-a="sphDbAdd"]').click(); await page.waitForTimeout(250);
  check('a skill sphere drawback adds a talent', await tile('Talents used'), '14 / 15');
  check('its card says it gives a skill talent', (await page.locator('#sph-bluster .sphdbedit').innerText()).includes('bonus skill talent'), 'true');
  await page.click('[data-a="undo"]'); await page.waitForTimeout(250);
  await go('Advanced', 'Save');
  const tm = async name => page.locator('#roll20 .li', { has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) }).first().locator('textarea').inputValue();
  check('Roll20: initiative', await tm('Init'), '&{template:default} {{name=Tova Rask: Initiative}} {{Initiative=[[1d20+6+?{Modifier|0} &{tracker}]]}}');
  const un = await tm('Unarmed strike');
  check('Roll20: three attacks', (un.match(/\{\{Attack \d=/g) || []).length, '3');
  check('Roll20: flaming dice on each hit', (un.match(/\+ \[\[1d6\]\] fire/g) || []).length, '3');
  check('Roll20: first attack', un.includes('{{Attack 1=[[1d20+17+?{Attack modifier|0}]]'), 'true');
  const all = await page.$$eval('#roll20 textarea', ts => ts.map(t => t.value));
  const plain = all.filter(t => !t.includes('?{Skill|') && !t.includes('?{Saving throw|'));
  const svm = all.find(t => t.includes('?{Saving throw|'));
  check('Roll20: saves list has three choices', (svm.match(/\{\{Roll=/g) || []).length, '3');
  check('Roll20: Reflex choice rolls only Reflex', svm.includes('Reflex (+13),Reflex save&#125;&#125; {{Roll=[[1d20+13|'), 'true');
  check('Roll20: braces balance in every macro', plain.every(t => (t.match(/\{\{/g) || []).length === (t.match(/\}\}/g) || []).length && (t.match(/\[\[/g) || []).length === (t.match(/\]\]/g) || []).length), 'true');
  const skm = all.find(t => t.includes('?{Skill|'));
  check('Roll20: skills list (usable skills only)', (skm.match(/\{\{Check=/g) || []).length, '18');
  check('Roll20: skills list Intimidate', skm.includes('Intimidate (+16),Intimidate&#125;&#125; {{Check=[[1d20+16'), 'true');
  await go('Character', 'Talents');
  check('talents used (Extra Skill Talent ×2 counts itself since 2026-11-08)', await tile('Talents used'), '14 / 14');
  await go('Character', 'Skills');
  check('skill ranks', (await page.locator('.cardhead .note').first().innerText()).trim(), 'Ranks 48 of 48');
  check('Acrobatics (2 bought + 10 from Athletics)', await skillTotal('Acrobatics'), '+17');
  check('Intimidate (2 bought + 10 from Bluster)', await skillTotal('Intimidate'), '+16');
  check('no “must retrain” warning', await page.locator('text=Must retrain').count(), '0');
  /* switch Bluster's associated skill to Bluff: Intimidate loses the free ranks, Bluff gains them */
  await go('Character', 'Talents');
  await page.selectOption('select[data-assoc="Bluster|0"]', 'bluff'); await page.waitForTimeout(250);
  await go('Character', 'Skills');
  check('Intimidate after the switch', await skillTotal('Intimidate'), '+6');
  check('Bluff after the switch', await skillTotal('Bluff'), '+9');
  /* buying ranks a sphere already covers asks for a retrain */
  await page.fill('input[data-f="skillRanks.acro"]', '5'); await page.dispatchEvent('input[data-f="skillRanks.acro"]', 'change'); await page.waitForTimeout(250);
  check('“must retrain” after over-buying Acrobatics', (await page.locator('tr', { hasText: 'Acrobatics' }).first().locator('.bad').innerText()).trim(), 'must retrain 3');

  /* ---------- typed dice: an old save converts, and two damage types roll separately ---------- */
  console.log('Typed dice');
  await page.evaluate(() => { const id = 'zz-dice'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Dice Test', levels: [], classes: {},
    actions: [
      { id: 'a1', name: 'Old blast', act: 'standard', res: '', cost: '0', dcBase: 'none', fx: { atk: '', n: '3', die: '6', flat: '2', dtype: 'fire', area: '' },
        aug: [{ id: 'g1', name: 'Extra', grp: '', on: true, cost: '', n: '', nAdd: '1', die: '', flat: '1', dtype: '', area: '', save: '', atk: '', note: '' }] },
      { id: 'a2', name: 'Flashbang', act: 'standard', res: '', cost: '0', dcBase: 'none', fx: { atk: '', dmg: 'max(1, 0)d8', dtype: 'fire', area: '' },
        aug: [{ id: 'g2', name: 'Ooze', grp: '', on: true, cost: '', n: '', die: '', add: '(2+3)d4', addType: 'acid', dtype: '', area: '', save: '', atk: '', note: '' }] }] }));
    localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); });
  await page.reload(); await page.waitForTimeout(500);
  await go('Play', 'Sheet');
  check('old save converts to typed dice', (await page.locator('.act', { hasText: 'Old blast' }).locator('.fxline').innerText()).trim(), '4d6+3 fire');
  check('two damage types', (await page.locator('.act', { hasText: 'Flashbang' }).locator('.fxline').innerText()).trim(), '1d8 fire + 5d4 acid');
  /* the dice field's preview: words or maths after the d are refused instead of changing the die size */
  await go('Advanced', 'Actions');
  await page.locator('details.item', { hasText: 'Old blast' }).first().locator('summary').first().click(); await page.waitForTimeout(200);
  const dmgF = page.locator('input[data-f="actions.0.fx.dmg"]'), prev = async x => { await dmgF.fill(x); await page.waitForTimeout(220); return (await dmgF.locator('xpath=..').locator('.dres').innerText()).trim(); };
  check('“1d6 per caster level” is refused', (await prev('1d6 per caster level')).startsWith('✕'), 'true');
  check('“1d6*2” is refused', (await prev('1d6*2')).startsWith('✕'), 'true');
  check('“(2+1)d6” reads 3d6', await prev('(2+1)d6'), '= 3d6');
  check('“1d(2*4)” reads 1d8', await prev('1d(2*4)'), '= 1d8');
  check('a huge dice count is refused', (await prev('99999d6')).startsWith('✕'), 'true');
  await go('Advanced', 'Save');
  check('Roll20: two damage rolls', (await page.locator('#roll20 .li', { hasText: 'Flashbang' }).locator('textarea').inputValue()).includes('{{Damage=[[1d8+?{Damage modifier|0}]] fire + [[5d4]] acid}}'), 'true');

  /* ---------- damaged saves (from the bug hunt): each must open, and every tab must draw ---------- */
  /* change the open character's save directly, then reload it (for setups that take many clicks) */
  /* reload first: leaving the page saves the open character (and its History entry), which would overwrite the change */
  const patch = async src => { await page.reload(); await page.waitForTimeout(400); await page.evaluate(s => { const id = JSON.parse(localStorage.getItem('spheres-sheet-v1:last')), k = 'spheres-sheet-v1:' + id, c = JSON.parse(localStorage.getItem(k)); (new Function('c', s))(c); localStorage.setItem(k, JSON.stringify(c)); }, src); await page.reload(); await page.waitForTimeout(400); };
  const cardText = async name => (await page.locator('section.card', { has: page.locator(`input[value="${name}"]`) }).first().innerText()).replace(/\s+/g, ' ');

  /* ---------- Raised undead (Ilyra, caster level 12) ----------
     Death talents: Expanded Necromancy, Sustained Necromancy, Empowered Reanimate, Greater Reanimate taken twice (pool 5 × 12 = 60);
     feats Fortified Corpsecraft (+2 natural armor, DR 6/good) and Revenant Militia (+1 attack per 4 racial HD). */
  console.log('Raised undead');
  await home(); await page.click('[data-a="example"][data-k="incanter"]'); await page.waitForTimeout(400);
  await go('Character', 'Talents'); const used0 = parseInt(await tile('Talents used'), 10);
  check('optional section: no Temporary talents card for Ilyra', await page.locator('h2', { hasText: 'Temporary talents' }).count(), '0');
  await patch(`c.extraPicks = (c.extraPicks || []).concat([
      { id: 'd1', kind: 'talent', name: 'Death', sphere: 'Death', role: 'sphere' }, { id: 'd2', kind: 'talent', name: 'Expanded Necromancy', sphere: 'Death' },
      { id: 'd3', kind: 'talent', name: 'Sustained Necromancy', sphere: 'Death' }, { id: 'd4', kind: 'talent', name: 'Empowered Reanimate', sphere: 'Death' },
      { id: 'd5', kind: 'talent', name: 'Greater Reanimate', sphere: 'Death', n: 2 }, { id: 'd6', kind: 'feat', name: 'Fortified Corpsecraft' }, { id: 'd7', kind: 'feat', name: 'Revenant Militia' }]);
    c.companions = (c.companions || []).concat([
      { id: 'u1', name: 'Bone Wolf', kind: 'undead', on: true, size: 'M', attacks: [{ name: 'Bite', kind: 'primary', dice: '1d6', ab: 'str' }], mods: [], traits: [],
        rean: { tmpl: 'skeleton', vars: ['bloody', 'burning'], what: 'Wolf', hd: 2, str: 13, dex: 15, spd: 50, fly: 0, hands: false, dur: 'conc' } },
      { id: 'u2', name: 'Big Ogre', kind: 'undead', on: true, size: 'L', attacks: [], mods: [], traits: [],
        rean: { tmpl: 'zombie', vars: ['fast'], what: 'Ogre', hd: 4, str: 21, dex: 8, spd: 40, fly: 0, hands: true, dur: 'timed' } }]);`);
  await go('Character', 'Talents');
  check('taken twice: 4 Death talents + Greater Reanimate ×2 = 6 more used', parseInt(await tile('Talents used'), 10) - used0, '6');
  check('taken twice: shown as ×2', await page.locator('.nm', { hasText: 'Greater Reanimate' }).first().innerText(), 'Greater Reanimate ×2');
  await page.click('[data-a="tabsCfg"]'); await page.waitForTimeout(200); await page.check('.dlg [name="tab-temp"]'); await page.locator('.dlg button', { hasText: 'Save' }).click(); await page.waitForTimeout(300);
  check('optional section: turned on in ⚙ Tabs', await page.locator('h2', { hasText: 'Temporary talents' }).count(), '1');
  await go('Character', 'Companions');
  /* wolf skeleton, bloody burning: 2 HD; Str 13+4 = 17, Dex 15+2+4 = 21, Cha 14 (bloody); hp 9 + 2×2 = 13;
     AC 10+5+4 (2 natural +2 Fortified) = 19; init +5+4 = +9; bite +1+3 = +4, 1d6+4 (1½ Str) plus 1d6 fire */
  let w = await cardText('Bone Wolf');
  check('wolf skeleton: title and CR', /Wolf bloody burning skeleton CR 3/.test(w), 'true');
  check('wolf skeleton: hp', /13 \/ 13 hp/.test(w), 'true');
  check('wolf skeleton: AC', /AC 19 touch 15 · flat-footed 14/i.test(w), 'true');
  check('wolf skeleton: saves and init', /Fort \+2 Ref \+5 Will \+3 Init \+9/i.test(w), 'true');
  check('wolf skeleton: bite', /Bite \+4 1d6\+4 plus 1d6 fire/.test(w), 'true');
  check('wolf skeleton: no claws without hands', /Claw/.test(w), 'false');
  check('wolf skeleton: casting ×3, counts half', /Counts as 6 HD when casting \(max 24\) · 1 HD of your pool/.test(w), 'true');
  check('wolf skeleton: DR and Fortified', /DR 5\/bludgeoning DR 6\/good/.test(w), 'true');
  check('wolf skeleton: fiery death DC', /Fiery death: 1d6 fire .* \(Reflex DC 13 half\)/.test(w), 'true');
  /* ogre fast zombie: 4+2 = 6 HD; Str 21+2+4 = 27, Dex 8+2+4 = 14; hp 27 + 6 Toughness = 33; AC 10+2+5−1 = 16;
     slam (Large → 1d8) +4+8−1+1 militia = +12, 1d8+12; CMB 4+8+1 = 13, CMD 10+4+8+2+1 = 25; 50 ft.; 12 hours (sustained) */
  w = await cardText('Big Ogre');
  check('ogre zombie: title and CR', /Ogre fast zombie CR 2/.test(w), 'true');
  check('ogre zombie: hp and AC', /33 \/ 33 hp/.test(w) + ' ' + /AC 16 touch 11 · flat-footed 14/i.test(w), 'true true');
  check('ogre zombie: slam', /Slam \+12 1d8\+12/.test(w), 'true');
  check('ogre zombie: CMB / CMD', /CMB \/ CMD \+13 \/ 25/i.test(w), 'true');
  check('ogre zombie: speed, not staggered, quick strikes', /Speed 50 ft\./.test(w) + ' ' + /Staggered/.test(w) + ' ' + /Quick strikes/.test(w), 'true false true');
  check('ogre zombie: casting ×2 and 12 hours', /Counts as 12 HD when casting \(max 24\) · 6 HD of your pool .* 12 hours/.test(w), 'true');
  check('raised undead: pool 7 of 60 (Greater Reanimate ×2)', (await page.locator('.li', { hasText: 'Raised undead' }).first().innerText()).replace(/\s+/g, ' ').includes('7 / 60'), 'true');
  await page.locator('section.card', { has: page.locator('input[value="Big Ogre"]') }).locator('[data-a="reanEnd"]').click(); await page.waitForTimeout(250);
  check('collapsing frees its Hit Dice', (await page.locator('.li', { hasText: 'Raised undead' }).first().innerText()).replace(/\s+/g, ' ').includes('1 / 60'), 'true');
  const spBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last')))).resources.find(r => /spell points/i.test(r.name)).cur);
  await page.locator('section.card', { has: page.locator('input[value="Big Ogre"]') }).locator('[data-a="reanRaise"]').click(); await page.waitForTimeout(250);
  const spAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last')))).resources.find(r => /spell points/i.test(r.name)).cur);
  check('reanimating costs 1 spell point and starts the timer', (spBefore - spAfter) + ' ' + /12 h left/.test(await cardText('Big Ogre')), '1 true');

  /* Template ↔ None: switching never copies rows, so nothing doubles */
  const ogre = () => page.locator('section.card', { has: page.locator('input[value="Big Ogre"]') }).first();
  if (!(await ogre().locator('details[open] > summary', { hasText: 'Edit stats' }).count())) await ogre().locator('summary', { hasText: 'Edit stats' }).click();
  await ogre().locator('select[data-f$=".rean.tmpl"]').selectOption('none'); await page.waitForTimeout(300);
  check('template None: plain stats, no reanimation strip', /Counts as/.test(await cardText('Big Ogre')), 'false');
  await ogre().locator('select[data-f$=".rean.tmpl"]').selectOption('zombie'); await page.waitForTimeout(300);
  w = await cardText('Big Ogre');
  check('back to Zombie: same numbers, one slam, specials once', [/33 \/ 33 hp/.test(w), (w.match(/Slam \+12 1d8\+12/g) || []).length, (w.match(/Quick strikes/g) || []).length].join(' '), 'true 1 1');
  check('back to Zombie: no copied rows', await ogre().locator('input[value="Toughness"], input[value="Empowered Reanimate"]').count(), '0');
  /* a save from the first version, where "Stop using the template" had copied the template's rows in */
  await patch(`c.companions.push({ id: 'u3', name: 'Old Ogre', kind: 'undead', on: false, size: 'L', attacks: [], traits: [{ name: 'Staggered: a single move or standard action each round (it can still charge)' }, { name: 'Bone charm' }],
      mods: [{ src: 'Toughness', target: 'hp', val: '6', type: 'untyped' }, { src: 'Empowered Reanimate', target: 'str', val: '4', type: 'enhancement' }, { src: 'Grave dust', target: 'str', val: '2', type: 'untyped' }],
      rean: { tmpl: 'zombie', vars: [], what: 'Ogre', hd: 4, str: 21, dex: 8, spd: 40, fly: 0, hands: true, dur: 'timed' } });`);
  await go('Character', 'Companions');
  const old = page.locator('section.card', { has: page.locator('input[value="Old Ogre"]') }).first(); await old.locator('summary', { hasText: 'Edit stats' }).click(); await page.waitForTimeout(200);
  check('old copies removed, your own rows kept', [await old.locator('input[value="Toughness"], input[value="Empowered Reanimate"], input[value^="Staggered"]').count(), await old.locator('input[value="Grave dust"], input[value="Bone charm"]').count()].join(' '), '0 2');
  check('old copies: Str 21+2+4+2 = 29, specials once', [/Strength \+2 \(zombie\) 29 \+9/.test((await old.innerText()).replace(/\s+/g, ' ')), ((await cardText('Old Ogre')).match(/Staggered:/g) || []).length].join(' '), 'true 1');

  /* a GM's custom creature: all its stats typed in with no template, then the template applied afterwards (Ilyra has Empowered Reanimate, +4 Str/Dex) */
  await patch(`c.companions.push({ id: 'u4', name: 'Gift', kind: 'undead', on: false, size: 'M', hd: '3', abil: { str: 18, dex: 14, con: 12, int: 9, wis: 16, cha: 13 }, speed: '30 ft.', attacks: [], mods: [], traits: [],
      rean: { v2: true, v3: true, tmpl: 'none', vars: [], what: 'Custom brute', hands: true, dur: 'timed' } });`);
  await go('Character', 'Companions');
  const gift = () => page.locator('section.card', { has: page.locator('input[value="Gift"]') }).first();
  const gtxt = async () => (await gift().innerText()).replace(/\s+/g, ' ');
  await gift().locator('summary', { hasText: 'Edit stats' }).click(); await page.waitForTimeout(200);
  check('custom creature, no template: its own scores', [/Strength 18 \+4/.test(await gtxt()), /Wisdom 16 \+3/.test(await gtxt())].join(' '), 'true true');
  await gift().locator('select[data-f$=".rean.tmpl"]').selectOption('zombie'); await page.waitForTimeout(300);
  check('then Zombie: Str 18+2+4 = 24, Dex 14−2+4 = 16, Wis 10, 3+1 = 4 HD', [/Strength \+2 \(zombie\) 24 \+7/.test(await gtxt()), /Dexterity −2 \(zombie\) 16 \+3/.test(await gtxt()), /Wisdom becomes 10 10 \+0/.test(await gtxt()), /HD · BAB 4 · \+3/i.test(await gtxt())].join(' '), 'true true true true');
  await gift().locator('input[data-f$=".abil.str"]').fill('20'); await gift().locator('input[data-f$=".abil.str"]').press('Tab'); await page.waitForTimeout(300);
  check('base scores stay editable under the template (Str 20 → 26)', /Strength \+2 \(zombie\) 26 \+8/.test(await gtxt()), 'true');
  await gift().locator('select[data-f$=".rean.tmpl"]').selectOption('none'); await page.waitForTimeout(300);
  check('back to None: the creature’s own scores, with the edit', [/Strength 20 \+5/.test(await gtxt()), /Wisdom 16 \+3/.test(await gtxt())].join(' '), 'true true');

  /* Mass Death Magic (still Ilyra): collapse the fast ogre, then raise it and the old ogre in one casting.
     Together 12 + 6 = 18 HD when casting (max 24); pool 1 (wolf) + 6 + 6 = 13 of 60; cost 1 + 1 = 2 spell points. */
  await patch(`c.extraPicks.push({ id: 'd8', kind: 'talent', name: 'Mass Death Magic', sphere: 'Death' });`);
  await go('Character', 'Companions');
  await page.locator('section.card', { has: page.locator('input[value="Big Ogre"]') }).locator('[data-a="reanEnd"]').click(); await page.waitForTimeout(250);
  const spNow = async () => page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last')))).resources.find(r => /spell points/i.test(r.name)).cur);
  const sp0 = await spNow();
  await page.click('[data-a="reanMass"]'); await page.waitForTimeout(200);
  await page.locator('.dlg label', { hasText: 'Big Ogre' }).locator('input').check(); await page.locator('.dlg label', { hasText: 'Old Ogre' }).locator('input').check();
  await page.locator('.dlg button', { hasText: 'Raise' }).click(); await page.waitForTimeout(300);
  check('Mass Death Magic: two raised for 2 spell points, 13 of 60 HD', [sp0 - await spNow(), (await page.locator('.li', { hasText: 'Raised undead' }).first().innerText()).replace(/\s+/g, ' ').includes('13 / 60')].join(' '), '2 true');

  /* ---------- Forbidden lore (Ilyra with a +3 bonus) ----------
     Destructive blast is ceil(cl/2)d6 at Destruction caster level 13 (7d6); +3 for that casting only → 16 → 8d6.
     The sheet doesn't roll the backlash: using it changes nothing else, and the action's Roll20 macro rolls the d100 in public. */
  console.log('Forbidden lore');
  await home(); await page.click('[data-a="example"][data-k="incanter"]'); await page.waitForTimeout(400);
  await patch(`c.loreOpt = { bonus: '3' };`);
  await go('Play', 'Sheet');
  const loreBlast = () => page.locator('.act', { hasText: 'Destructive blast' }).first();
  const will0 = Number((await tile('Will')).replace('−', '-')), cl0 = parseInt(await tile('Caster level'), 10);
  check('lore: off, 7d6', /7d6/.test(await loreBlast().locator('.fxline').innerText()), 'true');
  await loreBlast().locator('[data-a="loreTog"]').click(); await page.waitForTimeout(250);
  check('lore: on, +3 caster level for this blast → 8d6', /8d6/.test(await loreBlast().locator('.fxline').innerText()), 'true');
  check('lore: the sphere’s own caster level is unchanged', parseInt(await tile('Caster level'), 10), String(cl0));
  for (let k = 0; k < 3; k++) { await loreBlast().locator('[data-a="useAct"]').click(); await page.waitForTimeout(150); }
  check('lore: the sheet never rolls a backlash (Will and caster level unchanged after 3 uses)', [Number((await tile('Will')).replace('−', '-')) - will0, parseInt(await tile('Caster level'), 10) - cl0].join(' '), '0 0');
  await go('Advanced', 'Save & print');
  const mac = await page.locator('#roll20 .li', { hasText: 'forbidden lore' }).first().locator('textarea').inputValue();
  check('lore: the Roll20 macro shows +3 and rolls the backlash d100 (15%)', mac.includes('{{Forbidden lore=+3 caster level · backlash on [[1d100]] if 15 or less}}'), 'true');

  /* ---------- Tova: Leadership cap, Sequence, Bravo-style prepared talents, class-level formulas ---------- */
  console.log('Leadership, Sequence, prepared talents');
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await page.waitForTimeout(400);
  await patch(`c.extraPicks = (c.extraPicks || []).concat([{ id: 'l1', kind: 'talent', name: 'Leadership', sphere: 'Leadership', role: 'sphere' }]);
    c.companions = (c.companions || []).concat([{ id: 'k1', name: 'Hired Blade', kind: 'cohort', on: true, size: 'M', hd: '9', attacks: [], mods: [], traits: [] }]);
    c.skillRanks = Object.assign(c.skillRanks || {}, { diplo: 2 }); c.seq = { n: 3 };
    c.tempSrc = [{ id: 'sp', name: 'Spontaneous Technique', slots: '3', on: true, act: '1', uses: '2', used: 0, rest: 'keep' }];
    c.extraPicks = c.extraPicks.concat([{ id: 'pa', kind: 'talent', name: 'Prep A', sphere: 'Boxing', temp: 'sp' }, { id: 'pb', kind: 'talent', name: 'Prep B', sphere: 'Boxing', temp: 'sp' }, { id: 'pc', kind: 'talent', name: 'Prep C', sphere: 'Boxing', temp: 'sp' }]);
    c.mods = (c.mods || []).concat([{ id: 'pm1', src: 'Prep A', target: 'init', val: '1', type: 'untyped', when: 'always' }, { id: 'pm2', src: 'Prep B', target: 'init', val: '2', type: 'untyped', when: 'always' }]);
    c.actions = (c.actions || []).concat([{ id: 'pact', name: 'Prep A strike', act: 'Standard' }]);`);
  await go('Character', 'Companions');
  /* Diplomacy ranks: 5 free from the Leadership sphere + 2 bought = 7 */
  check('Leadership: 9 HD of cohorts over 7 Diplomacy ranks (5 from the sphere + 2), shown as over', [(await page.locator('.li', { hasText: 'Recruited cohorts' }).first().innerText()).replace(/\s+/g, ' ').includes('9 / 7'), await page.locator('.li', { hasText: 'Recruited cohorts' }).first().locator('b.bad').count()].join(' '), 'true 1');
  /* Three Leadership talents now: 15 free Diplomacy ranks, capped at Tova's 12 Hit Dice → 12 ranks. Greater Recruitment ×1: cap 12 × 2 = 24.
     Advanced Cohorts: a CR 7 cohort counts 7 × 2 = 14, but CR is limited to ½ × 12 = 6 (warning). Table: Cohort at 12 ranks: up to 9 HD each.
     Total 9 + 14 = 23 of 24. */
  await patch(`c.extraPicks.push({ id: 'l2', kind: 'talent', name: 'Greater Recruitment', sphere: 'Leadership' }, { id: 'l3', kind: 'talent', name: 'Advanced Cohorts', sphere: 'Leadership' });
    c.companions.push({ id: 'k2', name: 'Owlbear Pal', kind: 'cohort', on: true, size: 'L', hd: '5', adv: true, cr: '7', attacks: [], mods: [], traits: [] });`);
  await go('Character', 'Companions');
  check('Leadership: Greater Recruitment doubles the cap, advanced cohort counts CR × 2', (await page.locator('.li', { hasText: 'Recruited cohorts' }).first().innerText()).replace(/\s+/g, ' ').includes('23 / 24'), 'true');
  check('Leadership: an advanced cohort over CR 6 (½ of 12 ranks) warns', /CR can be at most 6/.test(await cardText('Owlbear Pal')), 'true');
  await page.locator('details[data-keep="leadopt"] summary').click(); await page.waitForTimeout(200);
  check('Leadership: panel shows the table row and the talents', [/up to 9 Hit Dice each/.test((await page.locator('details[data-keep="leadopt"]').innerText()).replace(/\s+/g, ' ')), /Greater Recruitment/.test(await page.locator('details[data-keep="leadopt"] summary').innerText())].join(' '), 'true true');
  await go('Play', 'Sheet');
  const seq = () => page.locator('section.card', { has: page.locator('h2', { hasText: 'Sequence' }) });
  check('Sequence: 3 of 4 links (no Prodigy levels)', /3 \/ 4 links/.test((await seq().innerText()).replace(/\s+/g, ' ')), 'true');
  await seq().locator('[data-a="seqAdd"][data-n="1"]').click(); await page.waitForTimeout(200);
  check('Sequence: capped at 4', await seq().locator('[data-a="seqAdd"][data-n="1"]').isDisabled(), 'true');
  await seq().locator('[data-a="seqEnd"]').first().click(); await page.waitForTimeout(200);
  check('Sequence: ended (card hides without Prodigy levels)', await seq().count(), '0');
  const ini0 = Number((await tile('Initiative')).replace('−', '-'));
  check('prepared: none active yet, Prep A strike greyed', [await page.locator('.act', { hasText: 'Prep A strike' }).locator('[data-a="useAct"]').isDisabled()].join(' '), 'true');
  await page.locator('[data-a="tempAct"]', { hasText: 'Prep A' }).first().click(); await page.waitForTimeout(250);
  check('prepared: Prep A active (+1), its action usable, 1 use left', [Number((await tile('Initiative')).replace('−', '-')) - ini0, await page.locator('.act', { hasText: 'Prep A strike' }).locator('[data-a="useAct"]').isDisabled(), /1 use left/.test(await page.locator('[data-a="tempTog"]').first().innerText())].join(' '), '1 false true');
  await page.locator('[data-a="tempAct"]', { hasText: 'Prep B' }).first().click(); await page.waitForTimeout(250);
  check('prepared: Prep B replaces Prep A (1 at once): +2', [Number((await tile('Initiative')).replace('−', '-')) - ini0, await page.locator('[data-a="tempAct"]', { hasText: 'Prep A' }).first().getAttribute('aria-pressed')].join(' '), '2 false');
  await page.locator('[data-a="tempAct"]', { hasText: 'Prep C' }).first().click(); await page.waitForTimeout(250);
  check('prepared: no uses left, Prep C refused', await page.locator('[data-a="tempAct"]', { hasText: 'Prep C' }).first().getAttribute('aria-pressed'), 'false');
  await go('Character', 'Talents');
  await page.selectOption('#tmp-preset', { label: 'Customized weapon set (Armiger)' }); await page.click('[data-a="tempNew"]'); await page.waitForTimeout(300);
  check('class-level formula: Armiger set with no Armiger levels = 1 talent (lvl.armiger reads 0)', await page.locator('.tag', { hasText: '0 of 1 talents' }).count() > 0, 'true');

  /* ---------- Workshop (Tova with Alchemy, Herbalism and Trap) ----------
     Alchemy: sphere + 4 talents = 25 free Craft (alchemy) ranks, capped at 12 Hit Dice; DC 10 + 6 + 6 (Con practitioner) = 22;
     poison potent 1 + 12/4 = 4 rounds. Trap: 1 talent = 5 ranks; DC 10 + 2 + 6 = 18. A placed trap from a check of 12 lasts 12 − 5 = 7 rounds. */
  console.log('Workshop');
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await page.waitForTimeout(400);
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await page.waitForTimeout(150);
  check('Workshop: no tab without a crafting sphere', await page.locator('#tabbar [data-tab="ws"]').count(), '0');
  await patch(`const T=(id,n,sp,role)=>({id,kind:'talent',name:n,sphere:sp,role:role||undefined});
    c.extraPicks=(c.extraPicks||[]).concat([T('a0','Alchemy','Alchemy','sphere'),T('a1','Improved Alchemist Fire','Alchemy'),T('a2','Salve','Alchemy'),T('a3','Drowsy Venom','Alchemy'),T('a4','Hypervigilance Serum','Alchemy'),
      T('h0','Herbalism','Herbalism','sphere'),T('h1','Healing Poultice','Herbalism'),T('r0','Trap','Trap','sphere'),
      T('t0','Tech','Tech','sphere'),T('t1','Hookshot','Tech'),T('t2','Laser Pack','Tech'),T('t3','Extra Gadgets','Tech')]);
    c.extraSkills=(c.extraSkills||[]).concat([{id:'xa',base:'craft',label:'alchemy'},{id:'xt',base:'craft',label:'traps'},{id:'xh',base:'prof',label:'herbalist'},{id:'xm',base:'craft',label:'mechanical'}]);
    c.sphSkills=Object.assign(c.sphSkills||{},{Alchemy:['xa'],Herbalism:['xh'],Trap:['xt'],Tech:['xm']}); c.resources=(c.resources||[]).concat([{id:'rk1',name:'Rank test',max:'ranks.alchemy+ranks.craftalchemy-ranks.alchemy+ranks.nosuchskill',cur:0,reset:'none'}]); c.ws={herb:{types:['bitter'],herbs:{bitter:4},batches:1}};`);
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await page.waitForTimeout(150);
  await page.locator('#tabbar [data-tab="ws"]').click(); await page.waitForTimeout(300);
  const alch = () => page.locator('section.card', { has: page.locator('h2', { hasText: 'Alchemy' }) }).first();
  const wtx = async loc => (await loc.innerText()).replace(/\s+/g, ' ');
  /* skill-rank variables: ranks.alchemy = ranks.craftalchemy = 12; a skill you don't have reads 0 → 12 + 12 − 12 + 0 = 12 */
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await page.locator('#tabbar [data-tab="sheet"]').click(); await page.waitForTimeout(200);
  check('rank variables: ranks.alchemy and ranks.craftalchemy read 12, a missing skill reads 0', /\/ 12/.test(await page.locator('.li', { hasText: 'Rank test' }).first().innerText()), 'true');
  await page.locator('#tabbar [data-tab="ws"]').click(); await page.waitForTimeout(250);
  check('Workshop: Alchemy 12 ranks, DC 22, poison 4 rounds', [/12 ranks/.test(await wtx(alch())), /ALCHEMY DC 22/i.test(await wtx(alch())), /Potent for 4 rounds/.test(await wtx(alch()))].join(' '), 'true true true');
  check('Workshop: formulae from the wiki with Craft DCs', [/Improved Alchemist Fire Craft DC 20/.test(await wtx(alch())), /Salve Craft DC 15/.test(await wtx(alch()))].join(' '), 'true true');
  await alch().locator('[data-a="wsMake"][data-n="Salve"]').click(); await page.waitForTimeout(200); await alch().locator('[data-a="wsMake"][data-n="Salve"]').click(); await page.waitForTimeout(200);
  check('Workshop: made two salves', /Salve ×2/.test(await wtx(alch())), 'true');
  await alch().locator('[data-a="wsUse"]').first().click(); await page.waitForTimeout(200);
  check('Workshop: used one', /Salve ×1/.test(await wtx(alch())), 'true');
  /* Formulae prepared at one time: ½ × 12 ranks + 2 formulae talents = 8; per session 1 + 12/4 = 4 */
  check('Workshop: formulae limit 8, 4 per session', [/FORMULAE PREPARED 1 \/ 8/i.test(await wtx(alch())), /Craft 4 in 30 minutes/.test(await wtx(alch()))].join(' '), 'true true');
  for (let k = 0; k < 7; k++) { await alch().locator('[data-a="wsMake"][data-n="Improved Alchemist Fire"]').click(); await page.waitForTimeout(120); }
  check('Workshop: at 8 of 8, Make is off', [/FORMULAE PREPARED 8 \/ 8/i.test(await wtx(alch())), await alch().locator('[data-a="wsMake"][data-n="Salve"]').isDisabled()].join(' '), 'true true');
  /* Tech: 4 talents → 12 Craft (mechanical) ranks. Gadgets: ½ × 12 + 2 gadget talents + 2 (Extra Gadgets) = 10. Charges: 12 + 4 talents + 1 = 17. */
  const tech = () => page.locator('section.card', { has: page.locator('h2', { hasText: /^Tech$/ }) }).first();
  check('Workshop: Tech gadgets 0 of 10, charges max 17', [/GADGETS PREPARED 0 \/ 10/i.test(await wtx(tech())), /CHARGES 0 \/ 17/i.test(await wtx(tech()))].join(' '), 'true true');
  await tech().locator('[data-a="wsMake"][data-n="Hookshot"]').click(); await page.waitForTimeout(200);
  check('Workshop: a gadget prepared', [/GADGETS PREPARED 1 \/ 10/i.test(await wtx(tech())), /Hookshot ×1 Disassemble/.test(await wtx(tech()))].join(' '), 'true true');
  const trap = () => page.locator('section.card', { has: page.locator('h2', { hasText: /^Trap$/ }) }).first();
  check('Workshop: Trap 5 ranks, DC 18', /TRAP DC 18/i.test(await wtx(trap())), 'true');
  await page.fill('#trap-check', '12'); await trap().locator('[data-a="trapPlace"]').click(); await page.waitForTimeout(200);
  check('Workshop: a trap from a check of 12 lasts 7 rounds', /Dart 7 rounds left/.test(await wtx(trap())), 'true');
  /* operative modifier: Tova Int +0, Wis +1, Cha −1. Herbalism here is the sphere + 1 talent = 10 ranks. Not chosen → highest mental (+1): batch 10 + 1 = 11 herbs.
     Charisma chosen on Build → 10 − 1 = 9. */
  const herbC = () => page.locator('section.card', { has: page.locator('h2', { hasText: 'Herbalism' }) }).first();
  check('operative: not chosen uses the highest mental (+1): 11-herb batches', /A BATCH 11 herbs/i.test(await wtx(herbC())), 'true');
  await page.click('#tabbar [data-tgrp]:has-text("Character")'); await page.locator('#tabbar [data-tab="build"]').click(); await page.waitForTimeout(250);
  await page.selectOption('select[data-f="opAbil"]', 'cha'); await page.waitForTimeout(250);
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await page.locator('#tabbar [data-tab="ws"]').click(); await page.waitForTimeout(250);
  check('operative: Charisma chosen on Build (−1): 9-herb batches', /A BATCH 9 herbs/i.test(await wtx(herbC())), 'true');
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await page.locator('#tabbar [data-tab="sheet"]').click(); await page.waitForTimeout(200);
  await page.click('[data-a="rest"][data-k="long"]'); await page.waitForTimeout(250);
  await page.locator('#tabbar [data-tab="ws"]').click(); await page.waitForTimeout(250);
  check('Workshop: a long rest expires formulae, herbs and traps, not gadgets', [/Salve ×/.test(await wtx(alch())), /rounds left/.test(await wtx(trap())), /Hookshot ×1/.test(await wtx(tech())), /0 herbs on hand/.test(await wtx(page.locator('section.card', { has: page.locator('h2', { hasText: 'Herbalism' }) }).first()))].join(' '), 'false false true true');

  /* ---------- Faces of Death (Ilyra) ----------
     A Medium mudra electric skeleton (from a human, hands): 4 claws (1d4) with +1d6 electricity; Dex 10 + 4 (mudra) = 14; Cha 12;
     immune to electricity (not cold). Exploding + multiplying can't be combined. */
  console.log('Faces of Death, cohorts, personas');
  await home(); await page.click('[data-a="example"][data-k="incanter"]'); await page.waitForTimeout(400);
  await patch(`c.companions.push({ id: 'u9', name: 'Spark Bones', kind: 'undead', on: false, size: 'M', hd: '1', abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, speed: '30 ft.', attacks: [], mods: [], traits: [],
      rean: { v2: true, v3: true, tmpl: 'skeleton', vars: ['energy', 'mudra', 'exploding', 'multiplying'], energy: 'elec', what: 'Human', hands: true, dur: 'timed' } });`);
  await go('Character', 'Companions');
  w = await cardText('Spark Bones');
  check('Faces of Death: four claws with +1d6 electricity', (w.match(/Claw \+\d+ 1d4\S* plus 1d6 electricity/g) || []).length, '4');
  check('Faces of Death: immune to electricity, not cold; mudra feats', [/Immune electricity, undead traits/.test(w), /Multiweapon Fighting and Weapon Finesse/.test(w)].join(' '), 'true true');
  check('Faces of Death: exploding and multiplying can’t be combined', /Exploding and multiplying can’t be combined/.test(w), 'true');

  /* ---------- Cohorts (Tova: Leadership + Squad, 2 talents → 10 Diplomacy ranks) ----------
     A 5 HD Warrior troop: d10, Con 13 → 27 + 5 = 32 hp; BAB +5; Fort +5 (good), Ref +2 (bad), Will +4 (good);
     troop damage 1 + 10/3 = 4d10, magical from 5 ranks; Batter. */
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await page.waitForTimeout(400);
  await patch(`c.extraPicks=(c.extraPicks||[]).concat([{id:'l1',kind:'talent',name:'Leadership',sphere:'Leadership',role:'sphere'},{id:'l2',kind:'talent',name:'Squad',sphere:'Leadership'}]);
    c.companions=(c.companions||[]).concat([{id:'k1',name:'Iron Company',kind:'cohort',on:true,size:'M',hd:'5',abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},attacks:[],mods:[],traits:[]}]);`);
  await go('Character', 'Companions');
  const ic = () => page.locator('section.card', { has: page.locator('input[value="Iron Company"]') }).first();
  await ic().locator('select[data-cohprof]').selectOption('warrior'); await page.waitForTimeout(300);
  await ic().locator('input[data-f$=".coh.troop"]').check(); await page.waitForTimeout(300);
  w = await cardText('Iron Company');
  check('cohort: Warrior profession fills Str 16 … and sets d10, BAB = HD', [/32 \/ 32 hp/.test(w), /HD · BAB 5 · \+5/i.test(w)].join(' '), 'true true');
  check('cohort: saves good Fort/Will, bad Ref', /Fort \+5 Ref \+2 Will \+4/i.test(w), 'true');
  check('cohort: troop 4d10 magical with Batter', [/Troop damage 4d10 \(magical\)/.test(w), /Batter:/.test(w)].join(' '), 'true true');

  /* ---------- Personas (Tova relabelled a 12th-level Troubadour: ¾ BAB, low caster) ----------
     True self: +3 morale on saves (1 + 1 at 5th + 1 at 9th). Captain Vale (Hero, Resolute +4 Fort as a modifier): BAB 9 → 12,
     Fort −3 (no base bonus) +4 = +1 net. Madame Ink (Mentor): caster level 6 → 12. Quick Change 3/day. */
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await page.waitForTimeout(400);
  await patch(`Object.keys(c.classes).forEach(id=>{ Object.assign(c.classes[id],{name:'Troubadour',bab:'3/4',cast:'low',martial:'none'}); });
    c.pers={list:[{id:'v1',name:'Captain Vale',tropes:[{k:'hero',alt:false}],quirks:[{k:'hero',n:'Resolute'}]},{id:'v2',name:'Madame Ink',tropes:[{k:'mentor',alt:false}],quirks:[]}],active:'',qc:0,borrow:[]};
    c.tempSrc=(c.tempSrc||[]).concat([{id:'ps-v1',name:'Persona: Captain Vale',on:false,pers:'v1'},{id:'ps-v2',name:'Persona: Madame Ink',on:false,pers:'v2'}]);
    c.groups=(c.groups||[]).concat([{id:'pg-v1',name:'Persona: Captain Vale',on:false,kind:'buff'},{id:'pg-v2',name:'Persona: Madame Ink',on:false,kind:'buff'}]);
    c.mods=(c.mods||[]).concat([{id:'pm9',src:'Resolute',target:'fort',val:'2+(1+floor((lvl-5)/4))',type:'untyped',when:'toggle',group:'pg-v1'}]);`);
  await go('Play', 'Sheet');
  const babNow = async () => Number(((await page.locator('.cardhead .note', { hasText: 'BAB' }).first().innerText()).match(/BAB ([+−-]\d+)/) || [])[1].replace('−', '-'));
  const fort0 = Number((await tile('Fortitude')).replace('−', '-')), bab0 = await babNow(), cl0p = parseInt(await tile('Caster level'), 10);
  check('personas: true self BAB 9 (¾ of 12), caster level 6 (low)', [bab0, cl0p].join(' '), '9 6');
  await page.locator('[data-a="persQuick"]', { hasText: 'Captain Vale' }).first().click(); await page.waitForTimeout(300);
  check('personas: Captain Vale (Hero): BAB 12, Fort −3 base bonus +4 Resolute', [await babNow(), Number((await tile('Fortitude')).replace('−', '-')) - fort0].join(' '), '12 1');
  await page.locator('[data-a="persQuick"]', { hasText: 'Madame Ink' }).first().click(); await page.waitForTimeout(300);
  check('personas: Madame Ink (Mentor): caster level 12, BAB back to 9, 1 Quick Change left', [parseInt(await tile('Caster level'), 10), await babNow(), /1 left today/.test(await page.locator('section.card', { has: page.locator('h2', { hasText: 'Persona:' }) }).first().innerText())].join(' '), '12 9 true');
  /* Prepare from the Sheet: switches without using a Quick Change (1 left stays 1) */
  await page.locator('section.card', { has: page.locator('h2', { hasText: 'Persona:' }) }).first().locator('[data-a="persPrep"]', { hasText: 'Captain Vale' }).click(); await page.waitForTimeout(300);
  check('personas: Prepare from the Sheet switches, no Quick Change used', [await babNow(), /1 left today/.test(await page.locator('section.card', { has: page.locator('h2', { hasText: 'Persona:' }) }).first().innerText())].join(' '), '12 true');
  await page.click('[data-a="rest"][data-k="long"]'); await page.waitForTimeout(250);
  check('personas: a long rest refills Quick Changes', /3 left today/.test(await page.locator('section.card', { has: page.locator('h2', { hasText: 'Persona:' }) }).first().innerText()), 'true');

  /* ---------- Temporary talents (Tova) ----------
     Two weapon sets, one at a time. Set A (on) lends Fencing, Set B (off) lends Duelist. A +1 insight modifier named Fencing and a
     +2 one named Duelist both target initiative. Expected: talent budget and Bluff unchanged (no budget, no free ranks), initiative +1;
     switching to Set B turns Set A off: initiative +2 instead. */
  console.log('Temporary talents');
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await page.waitForTimeout(400);
  await go('Character', 'Talents'); const budget0 = await tile('Talents used');
  await go('Character', 'Skills'); const bluff0 = await skillTotal('Bluff');
  await go('Play', 'Sheet'); const init0 = Number((await tile('Initiative')).replace('−', '-'));
  await patch(`c.tempSrc = [{ id: 'tA', name: 'Set A', slots: '2', on: true, excl: 'weapon', rest: 'keep' }, { id: 'tB', name: 'Set B', slots: '2', on: false, excl: 'weapon', rest: 'off' }];
    c.extraPicks = (c.extraPicks || []).concat([{ id: 'x1', kind: 'talent', name: 'Fencing', sphere: 'Fencing', role: 'sphere', temp: 'tA' }, { id: 'x2', kind: 'talent', name: 'Duelist', sphere: 'Duelist', role: 'sphere', temp: 'tB' }]);
    c.mods = (c.mods || []).concat([{ id: 'xm1', src: 'Fencing', target: 'init', val: '1', type: 'insight', when: 'always' }, { id: 'xm2', src: 'Duelist', target: 'init', val: '2', type: 'untyped', when: 'always' }]);`);
  await go('Play', 'Sheet');
  check('temporary: Set A on, its modifier counts', Number((await tile('Initiative')).replace('−', '-')) - init0, '1');
  await go('Character', 'Talents');
  check('temporary: talent budget unchanged', await tile('Talents used'), budget0);
  check('temporary: tagged on the Talents tab', await page.locator('.tag', { hasText: 'Temporary: Set A' }).count() > 0, 'true');
  await go('Character', 'Skills');
  check('temporary: no free Bluff ranks from Fencing', await skillTotal('Bluff'), bluff0);
  await go('Play', 'Sheet'); await page.locator('#tabpanel [data-a="tempTog"], [data-a="tempTog"]', { hasText: 'Set B' }).first().click(); await page.waitForTimeout(250);
  check('temporary: switching sets (one at a time)', (Number((await tile('Initiative')).replace('−', '-')) - init0) + ' ' + await page.locator('[data-a="tempTog"]', { hasText: 'Set A' }).first().getAttribute('aria-pressed'), '2 false');
  await page.click('[data-a="rest"][data-k="long"]').catch(() => {}); await page.waitForTimeout(250);
  check('temporary: a long rest switches off sources set to', await page.locator('[data-a="tempTog"]', { hasText: 'Set B' }).first().getAttribute('aria-pressed'), 'false');

  /* regression (2026-11-06): a brand-new character's long rest failed (its Workshop lists were missing until the Workshop tab was drawn) */
  console.log('New character');
  await home(); const errN = errors.length; await page.click('[data-a="newChar"]'); await page.waitForTimeout(400);
  await go('Play', 'Sheet'); await page.click('[data-a="rest"][data-k="long"]'); await page.waitForTimeout(300);
  check('new character: a long rest works before any other tab is opened', [errors.length - errN, /Long rest \(8 hours\)/.test(await page.locator('#toast').innerText().catch(() => ''))].join(' '), '0 true');

  /* ---------- wiki descriptions (talents/*.json, fetched on demand) ----------
     The sheet runs from file:// here, so it asks the website for the files; these routes answer from public/talents
     with the same CORS header firebase.json sends. Build the files first: python3 tools/build-talents.py <bundle>. */
  console.log('Wiki descriptions');
  const fs = require('fs');
  const TAL = path.resolve(__dirname, '..', 'public', 'talents');
  const SITE = 'https://spheres-character-sheet.web.app/talents/';
  const wkReq = [];
  let wkOnline = true;
  await page.route(SITE + '**', route => {
    const f = decodeURIComponent(route.request().url().slice(SITE.length)); wkReq.push(f);
    if (!wkOnline || !/^[a-z0-9-]+\.json$/.test(f) || !fs.existsSync(path.join(TAL, f))) return route.abort();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(path.join(TAL, f)) });
  });
  const natureLord = JSON.parse(fs.readFileSync(path.join(TAL, 'nature.json'), 'utf8')).t.find(t => t[0] === 'Nature Lord')[4];
  await page.evaluate(lordText => { const id = 'zz-wiki'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Wiki Test', levels: [], classes: {},
    extraPicks: [
      { id: 'w0', kind: 'talent', name: 'Nature sphere', sphere: 'Nature', role: 'sphere', tkind: 'magic' },
      { id: 'w1', kind: 'talent', name: 'Create Nature', sphere: 'Nature', tkind: 'magic' },
      { id: 'w2', kind: 'talent', name: 'Expanded Geomancy', sphere: 'Nature', tkind: 'magic' },
      { id: 'w3', kind: 'talent', name: 'Earth Mastery', sphere: 'Destruction', tkind: 'magic' },
      { id: 'w4', kind: 'talent', name: 'Moonbeam Juggling', sphere: 'Homebrew', tkind: 'magic' },
      { id: 'w5', kind: 'talent', name: 'Nature Lord', sphere: 'Nature sphere', tkind: 'magic', notes: lordText }],
    traditions: { mode: 'separate', casting: { on: true, name: 'Test', drawbacks: [{ name: 'Consciousness Linked', kind: 'general', weight: 1 }, { name: 'Energy Focus', kind: 'sphere', sphere: 'Destruction', weight: 1 }], boons: [{ name: 'Easy Focus' }] } } }));
    localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, natureLord);
  await page.reload(); await page.waitForTimeout(400);
  await go('Character', 'Talents');
  check('nothing is fetched until a row opens', wkReq.length, '0');
  const wkRow = name => page.locator('details.item', { has: page.locator('summary', { hasText: name }) }).first();
  const wkOpen = async name => { const r = wkRow(name); if (!(await r.evaluate(d => d.open))) await r.locator('summary').click(); await page.waitForTimeout(500); return r; };
  const wkText = async r => (await r.locator('.wk').first().innerText()).replace(/\s+/g, ' ');
  const stored = async () => page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:zz-wiki')));
  let r = await wkOpen('Create Nature');
  check('Create Nature: wiki text shows', /Geomancing Talents.*As an instantaneous effect, you may spend a spell point/.test(await wkText(r)), 'true');
  check('only the index and the Nature file were fetched', wkReq.slice().sort().join(','), 'index.json,nature.json');
  check('a long text starts clipped', await r.locator('.wkt.clip').count(), '1');
  await r.locator('[data-a="wkMore"]').click(); await page.waitForTimeout(200);
  check('“Show all” shows the whole text', (await wkRow('Create Nature').locator('.wkt.clip').count()) + ' ' + (await wkRow('Create Nature').locator('[data-a="wkMore"]').innerText()), '0 Show less');
  check('the base sphere row has no wiki box', await wkRow('Nature sphere').locator('.wk').count(), '0');
  r = await wkOpen('Nature Lord');
  check('sphere typed as “Nature sphere” still matches', /Treat your caster level as 5 higher/.test(await wkText(r)), 'true');
  check('notes copied from the wiki are noticed', /Your notes are the same as this text/.test(await wkText(r)), 'true');
  await r.locator('[data-a="wkClearNotes"]').click(); await page.waitForTimeout(300);
  check('“Clear my notes” empties them', (await stored()).extraPicks.find(p => p.id === 'w5').notes, '');
  r = await wkOpen('Expanded Geomancy');
  check('a misspelt name: not found, with suggestions', /Couldn’t find “Expanded Geomancy” in the Nature sphere/.test(await wkText(r)) + ' ' + (await r.locator('.wk [data-a="wkLink"]').first().innerText()).replace(/\s+/g, ' '), 'true Expanded Geomancing · Nature');
  await r.locator('.wk [data-a="wkLink"]').first().click(); await page.waitForTimeout(400);
  r = wkRow('Expanded Geomancy');
  check('linking a suggestion shows its text', /Linked by hand.*Choose and gain a Nature package/.test(await wkText(r)), 'true');
  check('the link is saved on the pick', JSON.stringify((await stored()).extraPicks.find(p => p.id === 'w2').ref), '{"s":"nature","n":"expandedgeomancing"}');
  await page.reload(); await page.waitForTimeout(400); await go('Character', 'Talents');
  r = await wkOpen('Expanded Geomancy');
  check('the link survives a reload', /Linked by hand/.test(await wkText(r)), 'true');
  await r.locator('[data-a="wkRename"]').click(); await page.waitForTimeout(300);
  check('“Rename to” uses the wiki name', (await stored()).extraPicks.find(p => p.id === 'w2').name, 'Expanded Geomancing');
  await page.click('#toast [data-a="undo"]'); await page.waitForTimeout(300);
  check('renaming can be undone', (await stored()).extraPicks.find(p => p.id === 'w2').name, 'Expanded Geomancy');
  r = await wkOpen('Expanded Geomancy');
  await r.locator('[data-a="wkUnlink"]').click(); await page.waitForTimeout(300);
  check('unlinking removes the link', String((await stored()).extraPicks.find(p => p.id === 'w2').ref), 'undefined');
  r = await wkOpen('Earth Mastery');
  check('the wrong sphere: found in the right one, with a warning', /Found in the Nature sphere, not Destruction.*Increase the maximum radius of your Bury/.test(await wkText(r)), 'true');
  r = await wkOpen('Moonbeam Juggling');
  check('an unknown sphere is named', /Couldn’t find “Moonbeam Juggling” on the wiki \(it has no “Homebrew” sphere\)/.test(await wkText(r)), 'true');
  await r.locator('input[data-wkq]').fill('storm lo'); await page.waitForTimeout(200);
  check('search finds talents by part of the name', (await r.locator('.wkres [data-a="wkLink"]').first().innerText()).replace(/\s+/g, ' '), 'Storm Lord · Weather');
  await r.locator('.wkres [data-a="wkLink"]').first().click(); await page.waitForTimeout(400);
  check('linking from the search', /Linked by hand.*Storm Lord/.test(await wkText(wkRow('Moonbeam Juggling'))), 'true');
  r = await wkOpen('Create Nature');
  await r.locator('[data-a="wkPick"]').click(); await page.waitForTimeout(300);
  check('“Not the right text?” opens a search', await wkRow('Create Nature').locator('input[data-wkq]').count(), '1');
  await go('Character', 'Traditions');
  const fold = name => page.locator('.edit', { has: page.locator(`input[value="${name}"]`) }).locator('details.wkfold').first();
  await fold('Consciousness Linked').locator('summary').click(); await page.waitForTimeout(500);
  check('a general drawback shows its wiki text', /General Drawbacks.*Your effects are linked to you/.test((await fold('Consciousness Linked').innerText()).replace(/\s+/g, ' ')), 'true');
  await fold('Easy Focus').locator('summary').click(); await page.waitForTimeout(300);
  check('a boon shows its wiki text', /Boons/.test((await fold('Easy Focus').innerText()).replace(/\s+/g, ' ')), 'true');
  /* Energy Focus is a Destruction drawback, and the character has a Destruction pick, so it sits on that sphere's card */
  await go('Character', 'Talents');
  const efFold = page.locator('.sphdbedit .fields:has(input[value="Energy Focus"]) + details.wkfold').first();
  await efFold.evaluate(d => { for (let x = d.parentElement.closest('details'); x; x = x.parentElement.closest('details')) x.open = true; }); await page.waitForTimeout(200);
  await efFold.locator('summary').click(); await page.waitForTimeout(400);
  check('a sphere drawback (on its sphere card) matches its sphere', /Sphere-Specific Drawbacks · Destruction/.test((await efFold.innerText()).replace(/\s+/g, ' ')), 'true');
  /* offline: a downloaded copy with no internet */
  wkOnline = false; await page.reload(); await page.waitForTimeout(400); await go('Character', 'Talents');
  r = await wkOpen('Create Nature');
  check('offline: says why and links to the wiki', /Couldn’t load the wiki text \(this copy is opened from a file, so it needs the internet\).*Try again.*Open the wiki/.test(await wkText(r)), 'true');
  wkOnline = true; await r.locator('[data-a="wkRetry"]').click(); await page.waitForTimeout(700);
  check('“Try again” loads it once back online', /As an instantaneous effect/.test(await wkText(wkRow('Create Nature'))), 'true');
  const wkErrs = errors.filter(e => /ERR_FAILED|Failed to load resource/.test(e)).length; errors.splice(0, errors.length, ...errors.filter(e => !/ERR_FAILED|Failed to load resource/.test(e)));
  check('only the offline fetches failed', wkErrs > 0, 'true');

  /* ---------- adding talents from the wiki list (phase 2) ---------- */
  console.log('Adding talents from the wiki');
  const picksNow = async () => (await stored()).extraPicks.map(p => [p.name, p.sphere, p.role || '', p.tkind || ''].join('/'));
  const tkSearch = async q => { await page.fill('#tk-name', ''); await page.click('#tk-name'); await page.type('#tk-name', q, { delay: 20 }); await page.waitForTimeout(400); };
  const firstRes = async () => (await page.locator('#tk-res [data-wkchoose]').first().innerText()).replace(/\s+/g, ' ');
  await tkSearch('greater rean');
  check('search: typing finds wiki talents', await firstRes(), 'Greater Reanimate · Death');
  await page.locator('#tk-res [data-wkchoose]').first().click(); await page.waitForTimeout(600);
  check('picking fills name, sphere and type', [await page.inputValue('#tk-name'), await page.inputValue('#tk-sphere'), await page.inputValue('#tk-kind'), await page.inputValue('#tk-role')].join('/'), 'Greater Reanimate/Death/magic/talent');
  const tkPrev = async () => (await page.locator('#tk-prevbox').innerText()).replace(/\s+/g, ' ');
  check('the preview shows its text and offers the missing base sphere', /Also add the Death base sphere.*Increase the total Hit Dice/.test(await tkPrev()) + ' ' + await page.isChecked('#tk-base'), 'true true');
  await page.click('[data-a="addTalent"]'); await page.waitForTimeout(400);
  check('adding it also adds the base sphere', (await picksNow()).slice(-2).join(' | '), 'Death sphere/Death/sphere/magic | Greater Reanimate/Death/talent/magic');
  check('the form is cleared after adding', (await page.inputValue('#tk-name')) + '|' + (await page.locator('#tk-prevbox').innerText()).trim(), '|');
  await tkSearch('gravetongue'); await page.locator('#tk-res [data-wkchoose]').first().click(); await page.waitForTimeout(600);
  check('a [utility] talent counts as a utility talent', await page.inputValue('#tk-role'), 'utility');
  check('no base sphere offer once you have the sphere', await page.locator('#tk-base').count(), '0');
  await page.click('[data-a="addTalent"]'); await page.waitForTimeout(400);
  check('…and is saved that way', (await picksNow()).slice(-1)[0], 'Gravetongue/Death/utility/magic');
  await tkSearch('greater rean');
  check('talents you have are marked “taken”', /taken/.test(await firstRes()), 'true');
  await page.locator('#tk-res [data-wkchoose]').first().click(); await page.waitForTimeout(500);
  check('picking a taken one warns', /You already have this talent/.test(await tkPrev()), 'true');
  await tkSearch('cyclone'); await page.locator('#tk-res [data-wkchoose]').first().click(); await page.waitForTimeout(600);
  check('advanced talents carry the GM-permission note', /Advanced talents are an optional rule: only with GM permission/.test(await tkPrev()), 'true');
  await tkSearch('Moonbeam Sparkles');
  check('a homebrew name says it’s not on the wiki', (await page.locator('#tk-res').innerText()).trim(), 'Not on the wiki: it will be added as you typed it.');
  check('typing over a pick drops it', await page.locator('#tk-prevbox .wk').count(), '0');
  await page.fill('#tk-sphere', 'Homebrew'); await page.click('[data-a="addTalent"]'); await page.waitForTimeout(400);
  check('…and is added as typed', (await picksNow()).slice(-1)[0], 'Moonbeam Sparkles/Homebrew/talent/magic');
  /* browse a sphere's talents on its card */
  const brw = page.locator('details.wkbrowse', { has: page.locator('summary', { hasText: 'Browse the wiki’s Nature talents' }) }).first();
  if (!(await brw.evaluate(d => d.open))) await brw.locator(':scope > summary').click(); await page.waitForTimeout(500);
  const natureCount = JSON.parse(fs.readFileSync(path.join(TAL, 'index.json'), 'utf8')).spheres.nature.c;
  check('browse lists every talent of the sphere', await brw.locator('details.wkbi').count(), String(natureCount));
  await brw.locator('input[data-wkbq]').fill('mastery'); await page.waitForTimeout(200);
  const shown = await brw.locator('details.wkbi:not([hidden]) summary b').allInnerTexts();
  check('the filter narrows the list', shown.length > 3 && shown.every(x => /mastery/i.test(x)), 'true');
  check('talents you have are marked in the list', /taken/.test(await brw.locator('details.wkbi', { hasText: 'Create Nature' }).first().locator('summary').innerText()), 'true');
  await brw.locator('[data-a="wkbHide"]').click(); await page.waitForTimeout(300);
  check('“Hide the ones I have” hides them', await brw.locator('details.wkbi', { hasText: 'Create Nature' }).count(), '0');
  const air = brw.locator('details.wkbi', { has: page.locator('summary b', { hasText: /^Air Mastery$/ }) }).first();
  await air.locator('summary').click(); await page.waitForTimeout(300);
  check('opening one shows its text', /When you use the Gust Of Wind ability/.test(await air.innerText()), 'true');
  await air.locator('[data-a="wkAddTal"]').click(); await page.waitForTimeout(400);
  check('“Add” adds it to that sphere', (await picksNow()).slice(-1)[0], 'Air Mastery/Nature/talent/magic');
  /* the level-up dialog (Ilyra, Incanter 12 → 13) */
  await home(); await page.click('button[data-k="incanter"]'); await page.waitForTimeout(500);
  await page.locator('[data-a="levelUp"]').first().click(); await page.waitForTimeout(300);
  const dlg = () => page.locator('.dlg-back').last();
  await dlg().locator('button', { hasText: 'Next' }).click(); await page.waitForTimeout(300);
  await dlg().locator('input[name="hp"]').fill('4'); await dlg().locator('button', { hasText: 'Next' }).click(); await page.waitForTimeout(300);
  /* the talents step now comes before the skills step (2026-11-08) */
  const tr = dlg().locator('.talrow').first();
  await tr.locator('.tr-nm').click(); await tr.locator('.tr-nm').type('gravetong', { delay: 20 }); await page.waitForTimeout(500);
  check('level-up: the talent box searches the wiki', (await tr.locator('[data-wkchoose]').first().innerText()).replace(/\s+/g, ' '), 'Gravetongue · Death');
  await tr.locator('[data-wkchoose]').first().click(); await page.waitForTimeout(600);
  check('level-up: picking fills the sphere', await tr.locator('.tr-sph').inputValue(), 'Death');
  check('level-up: notes [utility] and the missing sphere', /\[utility\].*You don’t have the Death sphere yet/.test((await tr.locator('.lu-note').innerText()).replace(/\s+/g, ' ')), 'true');
  await tr.locator('.lu-addbase').click(); await page.waitForTimeout(200);
  const rows = dlg().locator('.talrow'), last = rows.last();
  check('level-up: “Add a row for the base sphere” adds one', [await last.locator('.tr-sph').inputValue(), await last.locator('.tr-base').isChecked()].join(' '), 'Death true');
  await dlg().locator('button', { hasText: 'Next' }).click(); await page.waitForTimeout(300);
  check('level-up: the skills step comes after the talents', /4 · Skills/.test(await dlg().locator('.steps .cur').innerText()), 'true');
  await dlg().locator('button', { hasText: 'Next' }).click(); await page.waitForTimeout(300);
  await dlg().locator('button', { hasText: 'Level up' }).click(); await page.waitForTimeout(500);
  const lvl13 = await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last')))); const l = c.levels[c.levels.length - 1]; return [c.levels.length].concat(l.picks.filter(p => p.kind === 'talent').map(p => [p.name, p.sphere, p.role || '', p.tkind || ''].join('/'))).join(' | '); });
  check('level-up: saved with the wiki’s type and [utility] role', lvl13, '13 | Gravetongue/Death/utility/magic | Death sphere/Death/sphere/magic');
  await page.unroute(SITE + '**');

  /* ---------- playtest batch (2026-11-08): trade +4, skill abilities, Extra Talent feats, shared skills, History, level-up ---------- */
  console.log('Playtest batch');
  await page.evaluate(() => { const id = 'zz-play';
    const lv = () => ({ cls: 'c1', hp: 5, picks: [] }), levels = Array.from({ length: 12 }, lv);
    levels[0].picks = [
      { id: 'q1', kind: 'talent', name: 'Bluster sphere', sphere: 'Bluster', role: 'sphere', tkind: 'skill' },
      { id: 'q2', kind: 'talent', name: 'Test Bluster Talent', sphere: 'Bluster', tkind: 'skill' },
      { id: 'q3', kind: 'talent', name: 'Gladiator sphere', sphere: 'Gladiator', role: 'sphere', tkind: 'combat' },
      { id: 'q4', kind: 'talent', name: 'Athletics sphere', sphere: 'Athletics', role: 'sphere', tkind: 'combat' },
      { id: 'q5', kind: 'feat', name: 'Extra Magic Talent', n: 2 },
      { id: 'q6', kind: 'feat', name: 'Extra Combat Talent' },
      { id: 'q7', kind: 'talent', name: 'Brute Test Talent', sphere: 'Brute', role: 'bonus', tkind: 'combat', notes: 'From Extra Combat Talent' }];
    localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Playtest', levels,
      classes: { c1: { name: 'Tester', hd: 8, bab: '3/4', good: ['will'], skills: 4, classSkills: [], cast: 'none', martial: 'none', skill: 'none', talents: '1', bonusTalents: 2 } },
      abil: { str: 16, dex: 12, con: 10, int: 10, wis: 10, cha: 8 }, skillRanks: { handle: 3 },
      sphSkills: { Bluster: ['intim'], Gladiator: ['intim'], Athletics: ['acro', 'acro'] },
      traditions: { mode: 'separate', casting: { on: true, name: 'Test', drawbacks: [{ name: 'Consciousness Linked', kind: 'general', weight: 1 }], boons: [] },
        trade: { on: true, name: 'Aerialist', rank: 'competent', replace: true, skills: ['handle', 'bluff', 'intim'], plus4: ['handle'] } },
      histSnap: {} }));
    localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); });
  await page.reload(); await page.waitForTimeout(500);
  const stP = async () => page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:zz-play')));
  await go('Character', 'Skills');
  check('two spheres on one skill: the higher one’s ranks count, plus the competence bonus (10 − 1 + 3 + 6)', await skillTotal('Intimidate'), '+18');
  const whySk = async id => { await page.click(`[data-a="why"][data-k="skill.${id}"]`); await page.waitForTimeout(200); const tx = (await page.locator('.dlg-back').last().innerText()).replace(/\s+/g, ' '); await page.keyboard.press('Escape'); await page.waitForTimeout(150); return tx; };
  check('…and the breakdown says which sphere', /Ranks from the Bluster sphere \(the highest of/.test(await whySk('intim')), 'true');
  check('trade overlap: +4 instead of +3 (3 − 1 + 4)', await skillTotal('Handle Animal'), '+6');
  check('…shown in the breakdown', /Class skill \(trade overlap\)/.test(await whySk('handle')), 'true');
  check('Athletics Leap + Run: Acrobatics once, plus the shared-skill bonus (5 + 1 + 6)', await skillTotal('Acrobatics'), '+12');
  check('…named as two packages', /Shared associated skill \(Athletics, two packages\)/.test(await whySk('acro')), 'true');
  /* a skill using another ability */
  const abDlg = async () => { await page.click('[data-a="skAbil"][data-k="intim"]'); await page.waitForTimeout(200); return page.locator('.dlg-back').last(); };
  let ad = await abDlg(); await ad.locator('select[name="a"]').selectOption('str'); await ad.locator('input[name="why"]').fill('Intimidating Prowess');
  await ad.locator('button', { hasText: 'Save' }).click(); await page.waitForTimeout(300);
  check('a skill can use another ability (Str +3 instead of Cha −1)', await skillTotal('Intimidate'), '+22');
  const abCell = async () => (await page.locator('tr', { has: page.locator('td:first-child', { hasText: /^Intimidate/ }) }).first().locator('td').nth(3).innerText()).replace(/\s+/g, ' ');
  check('…the Ability cell shows it, marked', await abCell(), 'Str +3 *');
  check('…and the breakdown says why', /Str \(instead of Cha: Intimidating Prowess\)/.test(await whySk('intim')), 'true');
  ad = await abDlg(); await ad.locator('input[name="sit"]').check(); await ad.locator('button', { hasText: 'Save' }).click(); await page.waitForTimeout(300);
  check('“only sometimes” keeps the normal total', await skillTotal('Intimidate'), '+18');
  check('…and shows the other one under the skill', /\+4 Str instead of Cha \(Intimidating Prowess\)/.test((await page.locator('tr', { has: page.locator('td:first-child', { hasText: /^Intimidate/ }) }).first().innerText()).replace(/\s+/g, ' ')) + ' ' + /or Str \+3/.test(await abCell()), 'true true');
  await page.reload(); await page.waitForTimeout(400); await go('Character', 'Skills');
  check('the ability choice is saved', JSON.stringify((await stP()).skillAbil.intim), '{"a":"str","why":"Intimidating Prowess","sit":true}');
  ad = await abDlg(); await ad.locator('button', { hasText: 'Back to Cha' }).click(); await page.waitForTimeout(300);
  check('“Back to Cha” undoes it', String((await stP()).skillAbil.intim) + ' ' + await skillTotal('Intimidate'), 'undefined +18');
  /* Extra Talent feats */
  await go('Character', 'Talents');
  await page.click('[data-a="why"][data-k="talents"]'); await page.waitForTimeout(200);
  const tb = (await page.locator('.dlg-back').last().innerText()).replace(/\s+/g, ' '); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check('Extra Talent feats count toward talents, with “Times taken”', /Extra Magic Talent ×2 \(feat\) \+2/.test(tb) + ' ' + /Extra Combat Talent \(feat\) \+1/.test(tb), 'true true');
  await go('Character', 'Build');
  check('Build warns about Bonus talents raised for them', await page.locator('[data-a="xtalFix"]').innerText(), 'Lower Bonus talents by 2');
  await page.click('[data-a="xtalFix"]'); await page.waitForTimeout(300);
  check('…and one click lowers it', String((await stP()).classes.c1.bonusTalents) + ' ' + await page.locator('[data-a="xtalFix"]').count(), '0 0');
  check('a talent marked free “from Extra Combat Talent” is pointed out', /Brute Test Talent is marked free but came from one/.test(await page.locator('p.warn', { has: page.locator('[data-a="xtalFree"]') }).innerText()), 'true');
  await page.click('[data-a="xtalFree"]'); await page.waitForTimeout(300);
  check('…and one click counts it as a normal talent', (await stP()).levels[0].picks.find(p => p.id === 'q7').role, 'talent');
  /* associated skills: Acrobatics a third time is refused, another skill is added, and the keyboard stays on the new box */
  await go('Character', 'Talents');
  await page.selectOption('select[data-assoc="Athletics|new"]', 'climb'); await page.waitForTimeout(400);
  check('adding an associated skill keeps the keyboard on its new box', JSON.stringify((await stP()).sphSkills.Athletics) + ' ' + await page.evaluate(() => document.activeElement && document.activeElement.dataset.assoc), '["acro","acro","climb"] Athletics|2');
  await page.selectOption('select[data-assoc="Athletics|new"]', 'acro'); await page.waitForTimeout(400);
  check('…Acrobatics can’t go in a third time', JSON.stringify((await stP()).sphSkills.Athletics), '["acro","acro","climb"]');
  /* History: drawbacks and boons are recorded; the ones already there aren't listed as new */
  await go('Character', 'Traditions');
  await page.click('[data-a="tradAdd"][data-p="traditions.casting.boons"]'); await page.waitForTimeout(300);
  await page.fill('[data-f="traditions.casting.boons.0.name"]', 'Easy Focus'); await page.press('[data-f="traditions.casting.boons.0.name"]', 'Tab'); await page.waitForTimeout(4800);
  const hP = ((await stP()).history || []).filter(h => h.cat === 'Boon' || h.cat === 'Drawback').map(h => h.t + ' ' + h.cat + ' ' + h.text);
  check('History records a new boon, not the drawback that was already there', hP.join(' | '), 'add Boon Easy Focus');
  /* level-up: talents first, and the skills step counts the sphere just picked */
  await page.locator('[data-a="levelUp"]').first().click(); await page.waitForTimeout(300);
  await dlg().locator('button', { hasText: 'Next' }).click(); await page.waitForTimeout(300);
  await dlg().locator('input[name="hp"]').fill('5'); await dlg().locator('button', { hasText: 'Next' }).click(); await page.waitForTimeout(300);
  const tr2 = dlg().locator('.talrow').first(); await tr2.locator('.tr-sph').fill('Body Control'); await tr2.locator('.tr-base').check();
  await dlg().locator('button', { hasText: 'Next' }).click(); await page.waitForTimeout(400);
  const esc = dlg().locator('label', { has: page.locator('input[name="sk-escape"]') });
  check('level-up: the skills step counts a sphere picked on the talents step', (await esc.innerText()).replace(/\s+/g, ' ').trim() + ' / max ' + await esc.locator('input').getAttribute('max'), 'Escape Artist 0 +5 sphere / max 8');
  await dlg().locator('button', { hasText: 'Back' }).click(); await page.waitForTimeout(300);
  check('level-up: Back from skills returns to talents', /3 · Feats & talents/.test(await dlg().locator('.steps .cur').innerText()), 'true');
  await dlg().locator('button', { hasText: 'Cancel' }).first().click().catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(300);
  /* every text box has a name a screen reader can read */
  const unl = await page.evaluate(() => [...document.querySelectorAll('textarea,input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select')].filter(e => !e.labels?.length && !e.getAttribute('aria-label') && !e.closest('label')).length);
  check('no unlabelled boxes on the Traditions tab', unl, '0');

  /* ---------- quick fixes (2026-11-08): weapon rows stay open, no empty damage button, paused actions tagged ---------- */
  console.log('Quick fixes');
  await home(); await page.click('button[data-k="striker"]'); await page.waitForTimeout(500);
  check('a combat maneuver has no (empty) damage button', (await page.locator('[data-a="why"][data-k="dmg:w2"]').count()) + ' ' + (await page.locator('[data-a="why"][data-k="dmg:w1"]').count()), '0 1');
  await go('Character', 'Gear');
  await page.click('[data-a="addWeapon"]'); await page.waitForTimeout(400);
  const wKey = await page.locator('details.item[data-keep^="wp-"][open]').last().getAttribute('data-keep');
  const wRow = page.locator(`details.item[data-keep="${wKey}"]`);
  await wRow.locator('[data-f$=".name"]').fill('Longsword'); await wRow.locator('[data-f$=".dice"]').click(); await page.waitForTimeout(500);
  check('a new weapon stays open when you click into the next box', (await wRow.evaluate(d => d.open)) + ' ' + await page.evaluate(() => document.activeElement && document.activeElement.dataset.f), 'true weapons.2.dice');
  await page.keyboard.press('Control+A'); await page.keyboard.type('1d10'); await wRow.locator('[data-f$=".dtype"]').click(); await page.waitForTimeout(500);
  check('…and after the next one', String(await wRow.evaluate(d => d.open)), 'true');
  const wpp = wRow.locator('details.wprops'); await wpp.locator('summary').click(); await page.waitForTimeout(150);
  check('its Special abilities section has its own key', await wpp.getAttribute('data-keep'), wKey.replace(/^wp-/, 'wpp-'));
  /* an action named after a temporary talent that's off */
  await page.evaluate(() => { const id = 'zz-tmp'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Temp', levels: [], classes: {},
    tempSrc: [{ id: 't1', name: 'Quick Study', slots: '1', on: false }],
    extraPicks: [{ id: 'p1', kind: 'talent', name: 'Lingering Darkness', sphere: 'Dark', temp: 't1' }],
    actions: [{ id: 'a1', name: 'Lingering Darkness', act: 'standard', res: '', cost: '0', dcBase: 'none' }, { id: 'a2', name: 'Other thing', act: 'move', res: '', cost: '0', dcBase: 'none' }] }));
    localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); });
  await page.reload(); await page.waitForTimeout(400); await go('Play', 'Sheet');
  check('the Sheet greys out an action whose temporary talent is off', /temporary talent not active/.test(await page.locator('.act', { hasText: 'Lingering Darkness' }).innerText()), 'true');
  await go('Advanced', 'Actions');
  const tags = async n => (await page.locator('details.item', { has: page.locator('summary .nm', { hasText: n }) }).locator(':scope > summary').innerText()).replace(/\s+/g, ' ');
  check('the Actions tab tags it too, and only it', /temporary talent off/.test(await tags('Lingering Darkness')) + ' ' + /temporary talent off/.test(await tags('Other thing')), 'true false');

  /* ---------- house rules (2026-11-08): advanced talent limit, divided casting scores ---------- */
  console.log('House rules');
  await page.route(SITE + '**', route => { const f = decodeURIComponent(route.request().url().slice(SITE.length));
    if (!/^[a-z0-9-]+\.json$/.test(f) || !fs.existsSync(path.join(TAL, f))) return route.abort();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(path.join(TAL, f)) }); });
  await page.evaluate(() => { const id = 'zz-adv', levels = Array.from({ length: 6 }, () => ({ cls: 'c1', hp: 5, picks: [] }));
    levels[0].picks = [
      { id: 'v1', kind: 'talent', name: 'Cyclone', sphere: 'Nature', tkind: 'magic' },
      { id: 'v2', kind: 'talent', name: 'Create Haunt', sphere: 'Death', tkind: 'magic' },
      { id: 'v3', kind: 'talent', name: 'Create Nature', sphere: 'Nature', tkind: 'magic' },
      { id: 'v4', kind: 'talent', name: 'Homebrew Big Talent', sphere: 'Homebrew', tkind: 'magic', adv: 'yes' },
      { id: 'v5', kind: 'talent', name: 'Mercy Killing', sphere: 'Death', tkind: 'magic', adv: 'no' },
      { id: 'v6', kind: 'talent', name: 'Bizarre Artistry', sphere: 'Artifice', tkind: 'skill' },
      { id: 'v7', kind: 'talent', name: 'Ambrosia', sphere: 'Alchemy', tkind: 'combat' }];
    localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Advanced', levels,
      classes: { c1: { name: 'Mage', hd: 6, bab: '1/2', cast: 'high', talents: 'auto' } }, rules: { maxFirst: true, advLimit: true, wisConc: true } }));
    localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); });
  await page.reload(); await page.waitForTimeout(400); await go('Character', 'Talents'); await page.waitForTimeout(600);
  check('advanced, legendary and exceptional talents: counted together from the wiki and your own marks, against 1 + 1 per 5 levels', await tile('Advanced talents'), '5 / 2');
  check('…with a warning naming them', /Too many advanced talents:.*5 \(Cyclone, Create Haunt, Homebrew Big Talent, Bizarre Artistry, Ambrosia\); the house rule allows 2 at level 6/.test((await page.locator('p.warn', { hasText: 'Too many advanced talents' }).innerText()).replace(/\s+/g, ' ')), 'true');
  const advTag = async n => /Advanced/.test(await page.locator('details.item', { has: page.locator('summary .nm', { hasText: new RegExp('^' + n + '$') }) }).locator(':scope > summary').innerText());
  check('advanced rows are tagged (and “no” overrides the wiki)', [await advTag('Cyclone'), await advTag('Create Nature'), await advTag('Mercy Killing')].join(' '), 'true false false');
  const kindTag = async n => (await page.locator('details.item', { has: page.locator('summary .nm', { hasText: new RegExp('^' + n + '$') }) }).locator(':scope > summary .tag.gold').last().innerText()).trim();
  check('legendary and exceptional ones are tagged by their own name', (await kindTag('Ambrosia')) + ' ' + await kindTag('Bizarre Artistry'), 'Legendary Exceptional');
  const hauntRow = page.locator('details.item', { has: page.locator('summary .nm', { hasText: /^Create Haunt$/ }) });
  await hauntRow.locator(':scope > summary').click(); await page.waitForTimeout(200);
  await hauntRow.locator('select[data-f$=".adv"]').selectOption('no'); await page.waitForTimeout(400);
  check('marking one “No” drops it from the count', (await tile('Advanced talents')) + ' ' + await page.locator('p.warn', { hasText: 'Too many advanced talents' }).count(), '4 / 2 1');
  await tkSearch('astral proj'); await page.locator('#tk-res [data-wkchoose]').first().click(); await page.waitForTimeout(600);
  check('the add-talent preview warns before going over', /House rule: 5 of 2 advanced talents at level 6 \(over the limit\)/.test(await tkPrev()), 'true');
  /* divided casting scores: the old switches turned into one */
  await go('Advanced', 'Rules');
  check('an old casting switch turns on “Divided casting scores”', await page.locator('[data-a="rule"][data-k="divCast"]').getAttribute('aria-pressed'), 'true');
  check('…and the four old switches are gone', String(await page.locator('[data-a="rule"][data-k="wisConc"], [data-a="rule"][data-k="intPool"], [data-a="rule"][data-k="highDC"], [data-a="rule"][data-k="wisDur"]').count()), '0');
  await page.click('[data-a="rule"][data-k="advLimit"]'); await page.waitForTimeout(300);
  await go('Character', 'Talents');
  check('switching the advanced rule off hides the count', String(await page.locator('.tile', { has: page.locator('.k', { hasText: /^Advanced talents$/ }) }).count()), '0');
  await page.unroute(SITE + '**');
  await home(); await page.click('button[data-k="incanter"]'); await page.waitForTimeout(500);
  await go('Advanced', 'Rules'); await page.click('[data-a="rule"][data-k="divCast"]'); await page.waitForTimeout(300); await go('Play', 'Sheet');
  check('divided casting scores: concentration = caster level + Wis (12 + 1)', await tile('Concentration'), '+13');
  check('…spell points = class levels + Int, DC = 10 + ½ CL + best mental', (await tile('Spell points')) + ' ' + await tile('Magic DC'), '29 24');

  console.log('Damaged saves');
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
    const before = errors.length;
    await page.evaluate(x => { const id = 'dmg1'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify(Object.assign({ app: 'spheres-sheet', v: 1, id, name: 'Damaged' }, x))); localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, extra);
    await page.reload(); await page.waitForTimeout(300);
    for (const t of ['sheet', 'build', 'trad', 'skills', 'talents', 'picks', 'comp', 'gear', 'mods', 'acts', 'save']) await page.evaluate(tt => { const b = document.querySelector('#tabbar [data-tab="' + tt + '"]'); if (b) b.click(); }, t);
    check('opens with ' + what, (await page.innerText('#cname')).trim() + (errors.length > before ? ' + errors' : ''), 'Damaged');
  }

  console.log('Review fixes');
  {
    /* DR text is escaped on the sheet and in print (it reaches other people through share links and parties) */
    await page.evaluate(() => { const id = 'zz-xss'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Xss', levels: [], classes: {},
      dr: [{ val: '5', bypass: '<img src=x onerror="window.__xss=1">', src: '<b id="xssb">S</b>' }] })); localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); });
    await page.reload(); await page.waitForTimeout(400);
    await page.evaluate(() => { const b = document.querySelector('#tabbar [data-tab="sheet"]'); if (b) b.click(); }); await page.waitForTimeout(200);
    const dr = await tile('DR').catch(() => 'no tile');
    check('DR text shows as text, not markup', dr + ' ' + await page.evaluate(() => !!window.__xss || !!document.getElementById('xssb')), '5/<img src=x onerror="window.__xss=1"> false');
    await page.evaluate(() => { window.print = () => {}; const b = document.createElement('button'); b.dataset.a = 'print'; document.getElementById('main').appendChild(b); b.click(); }); await page.waitForTimeout(300);
    check('…and in the print view', await page.evaluate(() => !!window.__xss || !!document.querySelector('#printView img') || !/<img src=x/.test(document.getElementById('printView').textContent)), false);

    /* a fake account, for the cloud fixes */
    const ex = async k => { const cx = await browser.newContext(), p = await cx.newPage(); await p.goto(FILE); await p.waitForTimeout(300); await p.click(`button[data-k="${k}"]`); await p.waitForTimeout(400);
      const c = await p.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last'))))); await cx.close(); return c; };
    const A = await ex('striker'), B = await ex('incanter');
    const cloudPage = async (signedIn, theirs) => { const cx = await browser.newContext(), p = await cx.newPage(); p.on('pageerror', e => errors.push(e.message));
      await p.addInitScript(([A, B, signedIn, theirs]) => { const K = 'spheres-sheet-v1'; if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', 1); localStorage.clear(); [A, B].forEach(c => localStorage.setItem(K + ':' + c.id, JSON.stringify(c))); localStorage.setItem(K + ':last', JSON.stringify(A.id)); }
        const store = {}; window.__store = store; window.__puts = [];
        window.SheetCloud = { redirectResult: () => Promise.resolve(null), onUser: cb => setTimeout(() => cb(signedIn ? { uid: 'u1', name: 'Pat', email: 'p@x' } : null), 0), current: () => signedIn ? { uid: 'u1' } : null,
          list: () => Promise.resolve(Object.keys(store).map(id => ({ id, name: JSON.parse(store[id].json).name, savedAt: store[id].savedAt, meta: {} }))), get: id => Promise.resolve(store[id] || null),
          put: (id, rec) => new Promise(r => setTimeout(() => { store[id] = rec; window.__puts.push(id + ':' + JSON.parse(rec.json).name); r({ size: 1000 }); }, 1500)),
          partiesMine: () => Promise.resolve([]), shareGet: () => Promise.resolve({ json: JSON.stringify(theirs), savedAt: Date.now() }) }; }, [A, B, signedIn, theirs]);
      return [cx, p]; };
    const clickA = (p, a, id) => p.evaluate(([a, id]) => { const b = document.createElement('button'); b.dataset.a = a; if (id) b.dataset.id = id; document.getElementById('main').appendChild(b); b.click(); }, [a, id]);
    const toBuild = p => p.evaluate(() => { const b = document.createElement('button'); b.dataset.tab = 'build'; document.getElementById('main').appendChild(b); b.click(); });

    /* opening a share link straight after an edit doesn't save the shared character as yours */
    const theirs = JSON.parse(JSON.stringify(B)); theirs.id = 'theirs12345'; theirs.name = 'Their Char'; delete theirs.histSnap;
    let [cx, p] = await cloudPage(false, theirs);
    await p.goto(FILE + '?share=theirs12345'); await p.waitForTimeout(400);
    await toBuild(p); await p.waitForTimeout(150); await p.fill('[data-f="name"]', 'Tova Edited'); await p.press('[data-f="name"]', 'Tab'); await p.waitForTimeout(150);
    await p.evaluate(() => window.dispatchEvent(new Event('sheet-cloud-ready'))); await p.waitForTimeout(4800);
    check('a viewed share link isn’t saved into your characters', await p.evaluate(() => (document.getElementById('cname').textContent || '') + ' ' + Object.keys(localStorage).some(k => /theirs12345/.test(k))), 'Their Char false');
    await cx.close();

    /* switching characters while a save is on its way still sends the one you edited */
    [cx, p] = await cloudPage(true, null);
    await p.goto(FILE); await p.waitForTimeout(300); await p.evaluate(() => window.dispatchEvent(new Event('sheet-cloud-ready'))); await p.waitForTimeout(300);
    await toBuild(p); await p.waitForTimeout(150); await p.fill('[data-f="name"]', 'A edited'); await p.press('[data-f="name"]', 'Tab'); await p.waitForTimeout(100);
    await clickA(p, 'openChar', B.id); await p.waitForTimeout(6000);
    check('an edit made mid-save reaches the account after switching characters', await p.evaluate(id => window.__store[id] && JSON.parse(window.__store[id].json).name, A.id), 'A edited');
    await cx.close();

    /* closing “Two saves found” without choosing keeps the newer copy */
    const fs = require('fs'), os = require('os');
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-')), 'saved.html');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
    const emb = Object.assign(JSON.parse(JSON.stringify(A)), { name: 'File copy', savedAt: 1000 });
    fs.writeFileSync(tmp, html.replace(/(<script type="application\/json" id="savedState">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(emb).replace(/</g, '\\u003c') + b));
    const cx2 = await browser.newContext(), p2 = await cx2.newPage(); p2.on('pageerror', e => errors.push(e.message));
    await p2.addInitScript(c => { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', 1); localStorage.setItem('spheres-sheet-v1:' + c.id, JSON.stringify(Object.assign(c, { name: 'Browser copy', savedAt: Date.now() }))); } }, JSON.parse(JSON.stringify(A)));
    await p2.goto('file://' + tmp); await p2.waitForTimeout(500);
    const asked = await p2.locator('.dlg-back').count(); await p2.keyboard.press('Escape'); await p2.waitForTimeout(400);
    check('closing “Two saves found” keeps the newer copy', asked + ' ' + (await p2.innerText('#cname')).trim() + ' ' + await p2.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)).name, A.id), '1 Browser copy Browser copy');

    /* a damaged character inside a saved file opens instead of leaving a blank page */
    emb.levels = [{ picks: 'y' }]; emb.id = { a: 1 };
    fs.writeFileSync(tmp, html.replace(/(<script type="application\/json" id="savedState">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(emb).replace(/</g, '\\u003c') + b));
    const p3 = await cx2.newPage(); p3.on('pageerror', e => errors.push(e.message)); await p3.goto('file://' + tmp); await p3.waitForTimeout(500);
    check('a damaged character in a saved file still opens', (await p3.innerText('#cname')).trim(), 'File copy');
    await cx2.close(); fs.rmSync(path.dirname(tmp), { recursive: true, force: true });

    /* importing a damaged file says so instead of failing silently */
    await page.evaluate(() => { const b = document.createElement('button'); b.dataset.a = 'importJson'; document.getElementById('main').appendChild(b); b.click(); }); await page.waitForTimeout(200);
    await page.fill('.dlg textarea[name="j"]', JSON.stringify({ app: 'spheres-sheet', id: 'toString', name: 'Imported', levels: [{ picks: 'y' }] }));
    await page.click('.dlg button:has-text("Import")'); await page.waitForTimeout(400);
    check('a file with broken level rows imports', (await page.innerText('#cname')).trim(), 'Imported');
  }

  console.log('Class talents (checked against the wiki class tables)');
  {
    /* the class list itself */
    const html = require('fs').readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
    const LIB = JSON.parse(html.match(/<script type="application\/json" id="classLib">(.*?)<\/script>/)[1]);
    const lib = n => LIB.find(x => x.n === n && x.c === 'Spheres');
    const pick = (e, ...k) => k.map(x => String(e[x] == null ? '' : e[x])).join('/');
    check('class list: Braggart is martial only', pick(lib('Braggart'), 'cast', 'mart'), 'none/expert');
    check('class list: Etherslinger has no sphere casting', pick(lib('Etherslinger'), 'cast'), 'none');
    check('class list: Thaumaturge, a talent every 2 levels', pick(lib('Thaumaturge'), 'cast', 'tal'), 'high/0.5');
    check('class list: Troubadour, ½ combat + magic at 5th and every 4', pick(lib('Troubadour'), 'tal', 'tx'), '0.5/m5');
    check('class list: Magemage, a talent every level', pick(lib('Magemage'), 'tal'), '1');
    check('class list: Mageknight, bonus talent at 1st', pick(lib('Mageknight'), 'bt'), '1');
    check('class list: Incanter, bonus talent at odd levels', pick(lib('Incanter'), 'tx'), 'odd');
    check('class list: Hive, ½ rounded up', pick(lib('Hive'), 'tal'), '0.5up');
    check('class list: Cyborg uses prestige saves', pick(lib('Cyborg'), 'pre'), 'true');

    /* the talent totals those settings give (Talents used tile: 0 / total, incl. the 2 bonus magic talents for casters) */
    const cases = [
      ['Troubadour 20', { cast: 'low', martial: 'proficient', talents: '0.5', talx: 'm5' }, 20, 16],
      ['Troubadour 4', { cast: 'low', martial: 'proficient', talents: '0.5', talx: 'm5' }, 4, 4],
      ['Thaumaturge 20', { cast: 'high', talents: '0.5' }, 20, 12],
      ['Incanter 13', { cast: 'high', talents: 'auto', talx: 'odd' }, 13, 22],
      ['Mageknight 1', { cast: 'low', talents: 'auto', bonusTalents: 1 }, 1, 3],
      ['Hive 5', { cast: 'mid', talents: '0.5up', prestige: true }, 5, 5],
      ['Magemage 5', { cast: 'low', talents: '1', prestige: true }, 5, 7]];
    for (const [what, k, n, want] of cases) {
      await page.evaluate(([k, n]) => { const id = 'zz-cls'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Cls', classes: { c1: Object.assign({ name: 'C', hd: 8, bab: '3/4', good: ['will'], skills: 4 }, k) },
        levels: Array.from({ length: n }, () => ({ cls: 'c1', hp: 5, picks: [] })) })); localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [k, n]);
      await page.reload(); await page.waitForTimeout(300); await go('Character', 'Talents');
      check('talents: ' + what, (await tile('Talents used')).replace(/^\d+ \/ /, ''), String(want));
    }
  }

  check('no page errors', errors.length ? errors.join(' | ') : 'none', 'none');
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
