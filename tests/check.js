/* Spheres Character Sheet: automated checks.
   Opens public/index.html in a headless browser, loads both example characters, and checks the numbers the
   sheet works out against values worked out by hand from the rules. Run it after changing the sheet:

     node tests/check.js            (needs Playwright: npm i playwright && npx playwright install chromium)

   It lives outside public/, so `firebase deploy` never uploads it. When you change an example on purpose,
   update the expected numbers here too.

   It takes about a minute and a half. It never sleeps for a fixed time to "let the page catch up": after an action it waits for
   the page to be idle (settle), and for things that really load it waits for them (idle, until…). Only three fixed waits are kept,
   each where the check is that something does NOT happen (marked "kept" below). SHEET_FILE=/path/to/page.html runs the same
   checks against another copy of the page (public/talents must be reachable from it for the wiki sections). */
const path = require('path');
const { chromium } = require('playwright');

/* SHEET_FILE=/path/to/other.html runs the same checks against another copy of the page (used to prove the checks still catch a break) */
const FILE = 'file://' + (process.env.SHEET_FILE ? path.resolve(process.env.SHEET_FILE) : path.resolve(__dirname, '..', 'public', 'index.html'));
let pass = 0, fail = 0;
function check(what, got, want) {
  const ok = String(got).trim() === String(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok ? '' : `: got "${got}", expected "${want}"`));
}

(async () => {
  const browser = await chromium.launch();
  const TIMEOUT = 15000; /* every automatic wait (clicks, reads, selectors) fails after this, instead of Playwright's silent 30 s default */
  const newCtx = async o => { const cx = await browser.newContext(o); cx.setDefaultTimeout(TIMEOUT); return cx; };
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(TIMEOUT);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const tile = async label => (await page.locator('.tile', { has: page.locator('.k', { hasText: new RegExp('^' + label + '$', 'i') }) }).first().locator('.v').innerText()).replace(/\s+/g, ' ');
  const tileNote = async label => (await page.locator('.tile', { has: page.locator('.k', { hasText: new RegExp('^' + label + '$', 'i') }) }).first().locator('.n').innerText()).replace(/\s+/g, ' ');
  const go = async (group, tab) => {
    await page.click(`#tabbar [data-tgrp]:has-text("${group}")`); await settle();
    await page.locator('#tabbar [data-tab]', { hasText: tab }).first().click(); await settle();
  };
  const skillTotal = async name => (await page.locator('tr', { has: page.locator('td:first-child', { hasText: new RegExp('^' + name) }) }).first().locator('td').last().innerText()).trim();
  const home = async () => { await page.click('[data-a="home"]'); await settle(); };
  const cssVar = async v => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
  /* ---------- waiting ----------
     The sheet repaints inside the click (runAction → paint) or one timer tick later (paintSoon), so after an action we wait for
     the page to be idle, not for a fixed time. Waits for something that really loads (wiki files, dialogs, the fake account) wait
     for that thing to show up. A wait that times out prints a FAIL line (and counts as a failure) instead of hanging or hiding. */
  const settle = (p = page) => p.evaluate(() => new Promise(done => { let over = false; const end = () => { if (!over) { over = true; done(); } };
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(end, 0))); setTimeout(end, 250); })); /* the 250 ms is only for a page the browser isn't drawing */
  const until = async (what, fn, arg, p = page, ms = TIMEOUT) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { fail++; console.log('  FAIL waiting for ' + what + ': not there after ' + ms + ' ms'); return false; } };
  const untilText = (what, sel, re, p = page) => until(what, ([s, src]) => { const e = document.querySelector(s); return !!e && new RegExp(src).test(e.textContent); }, [sel, re.source], p);
  /* start listening BEFORE the action that makes the page ask for a file; await the returned function afterwards */
  const untilResponse = (what, re, p = page) => { const got = p.waitForResponse(r => re.test(r.url()), { timeout: TIMEOUT }).then(() => true, () => false); return async () => { if (!(await got)) { fail++; console.log('  FAIL waiting for ' + what + ': not there after ' + TIMEOUT + ' ms'); } }; };
  const untilDialog = (p = page) => until('a dialog to open', () => !!document.querySelector('.dlg-back'), null, p);
  const untilNoDialog = (p = page) => until('the dialog to close', () => !document.querySelector('.dlg-back'), null, p);
  /* idle = settled, and no wiki file still on its way (no visible "Loading…" note; the ones inside closed rows don't load until the row opens) */
  const idle = async (p = page) => { await settle(p); await until('the wiki text to finish loading', () => ![...document.querySelectorAll('[data-wkneed],.note')].some(n => n.getClientRects().length && !n.closest('details:not([open])') && (n.dataset.wkneed != null || /^Loading/.test(n.textContent.trim()))), null, p); await settle(p); };
  /* click a dialog's Cancel button if it's there, else press Escape (no waiting for a button that isn't there) */
  const cancelOrEsc = async loc => { if (await loc.count()) await loc.click({ timeout: 5000 }).catch(() => page.keyboard.press('Escape')); else await page.keyboard.press('Escape'); };

  /* class feature files (2026-11-12) come from the local folder for the whole run, never the live site */
  const CLS = path.resolve(__dirname, '..', 'public', 'classes'), CSITE = 'https://spheres-character-sheet.web.app/classes/', clsReq = [];
  await page.route(CSITE + '**', route => { const f = decodeURIComponent(route.request().url().slice(CSITE.length)); clsReq.push(f);
    if (!/^[a-z0-9-]+\.json$/.test(f) || !require('fs').existsSync(path.join(CLS, f))) return route.abort();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: require('fs').readFileSync(path.join(CLS, f)) }); });
  await page.goto(FILE); await settle();

  /* ---------- Ilyra Voss, Incanter 12 ---------- */
  console.log('Ilyra Voss (Incanter 12)');
  await page.click('button[data-k="incanter"]'); await settle();
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
  await page.click('[data-a="grp"]:has-text("Aegis: Armored Magic")'); await settle();
  check('AC with the aegis off (ring counts again)', await tile('AC'), '15');
  await page.click('[data-a="grp"]:has-text("Aegis: Armored Magic")'); await settle();
  /* sphere effect with augments: Destructive blast at Destruction CL 13 */
  const blast = page.locator('.act', { hasText: 'Destructive blast' }).first();
  const fxline = async () => (await blast.locator('.fxline').innerText()).trim();
  const aug = async name => { await blast.locator('[data-a="augTog"]', { hasText: name }).click(); await settle(); };
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
  await blast.locator('[data-a="useAct"]').click(); await settle();
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
  await page.locator('#sph-alteration details.basehead > summary').click(); await settle();
  await page.locator('#sph-alteration [data-a="sphDbAdd"]').click(); await settle();
  const nm = page.locator('#sph-alteration .sphdbedit input[data-f$=".name"]').last();
  await nm.fill('Limited Alteration'); await nm.dispatchEvent('change'); await settle();
  check('a drawback added on a sphere card adds a talent', await tile('Talents used'), '21 / 22');
  check('it shows on that sphere', (await page.locator('#sph-alteration .sphdb').innerText()).includes('Limited Alteration'), 'true');
  const wt = page.locator('#sph-alteration .sphdbedit input[data-f$=".weight"]').last();
  await wt.fill('2'); await wt.dispatchEvent('change'); await settle();
  check('a drawback that gives 2 talents adds 2', await tile('Talents used'), '21 / 23');
  check('its line says so', (await page.locator('#sph-alteration .sphdb').innerText()).includes('2 talents'), 'true');
  await page.click('[data-a="undo"]'); await settle(); await page.click('[data-a="undo"]'); await settle(); await page.click('[data-a="undo"]'); await settle();
  check('undo removes it again', await tile('Talents used'), '21 / 21');
  await go('Character', 'Companions');
  check('Ember hit points', (await page.locator('text=/\\d+ \\/ \\d+ hp/').first().innerText()).trim(), '58 / 58 hp');
  await home();
  check('Characters screen uses the standard colors', await cssVar('--ground'), '#121118');

  /* ---------- Tova Rask, Striker 12 ---------- */
  console.log('Tova Rask (Striker 12)');
  await page.click('button[data-k="striker"]'); await settle();
  check('hit points', (await page.locator('.card .big').first().innerText()), '188');
  check('AC', await tile('AC'), '28');
  check('touch / flat-footed', await tileNote('AC'), 'touch 21 · flat-footed 25');
  check('CMD', await tile('CMD'), '37');
  { await page.locator('.tile', { has: page.locator('.k', { hasText: /^CMD$/ }) }).first().click(); await settle();
    const cw = await page.evaluate(() => (document.querySelector('.why') || {}).innerText || '');
    check('Striker CMD breakdown: the AC bonus (striker) CMD modifier counts, not listed as left out', /AC bonus \(striker\)/.test(cw) && !/Not counted:[^|\n]*AC bonus \(striker\)/.test(cw), 'true');
    check('Striker CMD breakdown: Unarmored Training (armor) is still left out', /Not counted: Unarmored Training/.test(cw), 'true');
    await page.keyboard.press('Escape'); await settle(); }
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
  await page.locator('[data-a="resAdj"][data-n="1"]').first().click(); await page.locator('[data-a="resAdj"][data-n="1"]').first().click(); await settle();
  check('tension builds up', await page.inputValue('input[data-f="resources.0.cur"]'), '2');
  await page.click('[data-a="rest"][data-k="short"]'); await settle();
  check('a short rest empties tension', await page.inputValue('input[data-f="resources.0.cur"]'), '0');
  check('… and refills martial focus', await page.inputValue('input[data-f="resources.1.cur"]'), '1');
  check('tension says how it resets', (await page.locator('.li', { hasText: 'Tension' }).first().locator('.note').first().innerText()).trim(), 'empties on a short or long rest');
  check('tension maximum', (await page.locator('.li', { hasText: 'Tension' }).first().locator('.stepper .note').innerText()).trim(), '/ 12');
  await page.click('[data-a="grp"]:has-text("Haste")'); await settle();
  check('AC with Haste', await tile('AC'), '29');
  check('attacks with Haste', (await atk.locator('.hit').innerText()).trim(), '+18/+18/+13/+8');
  await page.click('[data-a="grp"]:has-text("Haste")'); await settle();
  /* Pathfinder point buy on the Build tab */
  await go('Character', 'Build');
  await page.click('[data-a="pointBuy"]'); await settle();
  check('point buy: Tova’s base scores cost 22', (await page.innerText('#pbTot')).trim(), '22');
  await page.click('.dlg [data-pb="int"][data-n="1"]'); await page.click('.dlg [data-pb="cha"][data-n="-1"]'); await settle();
  check('point buy: Int 11 (+1) and Cha 7 (−2 more) total 21', (await page.innerText('#pbTot')).trim(), '21');
  check('point buy: 7 is the floor', await page.locator('.dlg [data-pb="cha"][data-n="-1"]').isDisabled(), 'true');
  if (process.env.SHOTS) await page.locator('.dlg').screenshot({ path: process.env.SHOTS + '/pointbuy.png' });
  await page.click('.dlg button:has-text("Use these scores")'); await settle();
  check('point buy: the base scores are set', await page.inputValue('input[data-f="abil.int"]'), '11');
  await page.click('[data-a="undo"]'); await settle();
  check('point buy: undo restores them', await page.inputValue('input[data-f="abil.int"]'), '10');
  /* a combat sphere drawback gives a combat talent */
  await go('Character', 'Talents');
  await page.locator('#sph-boxing details.basehead > summary').click(); await settle();
  await page.locator('#sph-boxing [data-a="sphDbAdd"]').click(); await settle();
  const bn = page.locator('#sph-boxing .sphdbedit input[data-f$=".name"]').last();
  await bn.fill('Test Drawback'); await bn.dispatchEvent('change'); await settle();
  check('a combat sphere drawback adds a talent', await tile('Talents used'), '14 / 15');
  check('its card says it gives a combat talent', (await page.locator('#sph-boxing .sphdbedit').innerText()).includes('bonus combat talent'), 'true');
  await page.click('[data-a="undo"]'); await settle(); await page.click('[data-a="undo"]'); await settle();
  check('undo removes it', await tile('Talents used'), '14 / 14');
  /* and a skill sphere drawback a skill talent */
  await page.locator('#sph-bluster details.basehead > summary').click(); await settle();
  await page.locator('#sph-bluster [data-a="sphDbAdd"]').click(); await settle();
  check('a skill sphere drawback adds a talent', await tile('Talents used'), '14 / 15');
  check('its card says it gives a skill talent', (await page.locator('#sph-bluster .sphdbedit').innerText()).includes('bonus skill talent'), 'true');
  await page.click('[data-a="undo"]'); await settle();
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
  await page.selectOption('select[data-assoc="Bluster|0"]', 'bluff'); await settle();
  await go('Character', 'Skills');
  check('Intimidate after the switch', await skillTotal('Intimidate'), '+6');
  check('Bluff after the switch', await skillTotal('Bluff'), '+9');
  /* buying ranks a sphere already covers asks for a retrain */
  await page.fill('input[data-f="skillRanks.acro"]', '5'); await page.dispatchEvent('input[data-f="skillRanks.acro"]', 'change'); await settle();
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
  await page.reload(); await settle();
  await go('Play', 'Sheet');
  check('old save converts to typed dice', (await page.locator('.act', { hasText: 'Old blast' }).locator('.fxline').innerText()).trim(), '4d6+3 fire');
  check('two damage types', (await page.locator('.act', { hasText: 'Flashbang' }).locator('.fxline').innerText()).trim(), '1d8 fire + 5d4 acid');
  /* the dice field's preview: words or maths after the d are refused instead of changing the die size */
  await go('Advanced', 'Actions');
  await page.locator('details.item', { hasText: 'Old blast' }).first().locator('summary').first().click(); await settle();
  const dmgF = page.locator('input[data-f="actions.0.fx.dmg"]'), prev = async x => { await dmgF.fill(x); await settle(); return (await dmgF.locator('xpath=..').locator('.dres').innerText()).trim(); };
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
  const patch = async src => { await page.reload(); await settle(); await page.evaluate(s => { const id = JSON.parse(localStorage.getItem('spheres-sheet-v1:last')), k = 'spheres-sheet-v1:' + id, c = JSON.parse(localStorage.getItem(k)); (new Function('c', s))(c); localStorage.setItem(k, JSON.stringify(c)); }, src); await page.reload(); await settle(); };
  const cardText = async name => (await page.locator('section.card', { has: page.locator(`input[value="${name}"]`) }).first().innerText()).replace(/\s+/g, ' ');

  /* ---------- Raised undead (Ilyra, caster level 12) ----------
     Death talents: Expanded Necromancy, Sustained Necromancy, Empowered Reanimate, Greater Reanimate taken twice (pool 5 × 12 = 60);
     feats Fortified Corpsecraft (+2 natural armor, DR 6/good) and Revenant Militia (+1 attack per 4 racial HD). */
  console.log('Raised undead');
  await home(); await page.click('[data-a="example"][data-k="incanter"]'); await settle();
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
  await page.click('[data-a="tabsCfg"]'); await settle(); await page.check('.dlg [name="tab-temp"]'); await page.locator('.dlg button', { hasText: 'Save' }).click(); await settle();
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
  await page.locator('section.card', { has: page.locator('input[value="Big Ogre"]') }).locator('[data-a="reanEnd"]').click(); await settle();
  check('collapsing frees its Hit Dice', (await page.locator('.li', { hasText: 'Raised undead' }).first().innerText()).replace(/\s+/g, ' ').includes('1 / 60'), 'true');
  const spBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last')))).resources.find(r => /spell points/i.test(r.name)).cur);
  await page.locator('section.card', { has: page.locator('input[value="Big Ogre"]') }).locator('[data-a="reanRaise"]').click(); await settle();
  const spAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last')))).resources.find(r => /spell points/i.test(r.name)).cur);
  check('reanimating costs 1 spell point and starts the timer', (spBefore - spAfter) + ' ' + /12 h left/.test(await cardText('Big Ogre')), '1 true');

  /* Template ↔ None: switching never copies rows, so nothing doubles */
  const ogre = () => page.locator('section.card', { has: page.locator('input[value="Big Ogre"]') }).first();
  if (!(await ogre().locator('details[open] > summary', { hasText: 'Edit stats' }).count())) await ogre().locator('summary', { hasText: 'Edit stats' }).click();
  await ogre().locator('select[data-f$=".rean.tmpl"]').selectOption('none'); await settle();
  check('template None: plain stats, no reanimation strip', /Counts as/.test(await cardText('Big Ogre')), 'false');
  await ogre().locator('select[data-f$=".rean.tmpl"]').selectOption('zombie'); await settle();
  w = await cardText('Big Ogre');
  check('back to Zombie: same numbers, one slam, specials once', [/33 \/ 33 hp/.test(w), (w.match(/Slam \+12 1d8\+12/g) || []).length, (w.match(/Quick strikes/g) || []).length].join(' '), 'true 1 1');
  check('back to Zombie: no copied rows', await ogre().locator('input[value="Toughness"], input[value="Empowered Reanimate"]').count(), '0');
  /* a save from the first version, where "Stop using the template" had copied the template's rows in */
  await patch(`c.companions.push({ id: 'u3', name: 'Old Ogre', kind: 'undead', on: false, size: 'L', attacks: [], traits: [{ name: 'Staggered: a single move or standard action each round (it can still charge)' }, { name: 'Bone charm' }],
      mods: [{ src: 'Toughness', target: 'hp', val: '6', type: 'untyped' }, { src: 'Empowered Reanimate', target: 'str', val: '4', type: 'enhancement' }, { src: 'Grave dust', target: 'str', val: '2', type: 'untyped' }],
      rean: { tmpl: 'zombie', vars: [], what: 'Ogre', hd: 4, str: 21, dex: 8, spd: 40, fly: 0, hands: true, dur: 'timed' } });`);
  await go('Character', 'Companions');
  const old = page.locator('section.card', { has: page.locator('input[value="Old Ogre"]') }).first(); await old.locator('summary', { hasText: 'Edit stats' }).click(); await settle();
  check('old copies removed, your own rows kept', [await old.locator('input[value="Toughness"], input[value="Empowered Reanimate"], input[value^="Staggered"]').count(), await old.locator('input[value="Grave dust"], input[value="Bone charm"]').count()].join(' '), '0 2');
  check('old copies: Str 21+2+4+2 = 29, specials once', [/Strength \+2 \(zombie\) 29 \+9/.test((await old.innerText()).replace(/\s+/g, ' ')), ((await cardText('Old Ogre')).match(/Staggered:/g) || []).length].join(' '), 'true 1');

  /* a GM's custom creature: all its stats typed in with no template, then the template applied afterwards (Ilyra has Empowered Reanimate, +4 Str/Dex) */
  await patch(`c.companions.push({ id: 'u4', name: 'Gift', kind: 'undead', on: false, size: 'M', hd: '3', abil: { str: 18, dex: 14, con: 12, int: 9, wis: 16, cha: 13 }, speed: '30 ft.', attacks: [], mods: [], traits: [],
      rean: { v2: true, v3: true, tmpl: 'none', vars: [], what: 'Custom brute', hands: true, dur: 'timed' } });`);
  await go('Character', 'Companions');
  const gift = () => page.locator('section.card', { has: page.locator('input[value="Gift"]') }).first();
  const gtxt = async () => (await gift().innerText()).replace(/\s+/g, ' ');
  await gift().locator('summary', { hasText: 'Edit stats' }).click(); await settle();
  check('custom creature, no template: its own scores', [/Strength 18 \+4/.test(await gtxt()), /Wisdom 16 \+3/.test(await gtxt())].join(' '), 'true true');
  await gift().locator('select[data-f$=".rean.tmpl"]').selectOption('zombie'); await settle();
  check('then Zombie: Str 18+2+4 = 24, Dex 14−2+4 = 16, Wis 10, 3+1 = 4 HD', [/Strength \+2 \(zombie\) 24 \+7/.test(await gtxt()), /Dexterity −2 \(zombie\) 16 \+3/.test(await gtxt()), /Wisdom becomes 10 10 \+0/.test(await gtxt()), /HD · BAB 4 · \+3/i.test(await gtxt())].join(' '), 'true true true true');
  await gift().locator('input[data-f$=".abil.str"]').fill('20'); await gift().locator('input[data-f$=".abil.str"]').press('Tab'); await settle();
  check('base scores stay editable under the template (Str 20 → 26)', /Strength \+2 \(zombie\) 26 \+8/.test(await gtxt()), 'true');
  await gift().locator('select[data-f$=".rean.tmpl"]').selectOption('none'); await settle();
  check('back to None: the creature’s own scores, with the edit', [/Strength 20 \+5/.test(await gtxt()), /Wisdom 16 \+3/.test(await gtxt())].join(' '), 'true true');

  /* Mass Death Magic (still Ilyra): collapse the fast ogre, then raise it and the old ogre in one casting.
     Together 12 + 6 = 18 HD when casting (max 24); pool 1 (wolf) + 6 + 6 = 13 of 60; cost 1 + 1 = 2 spell points. */
  await patch(`c.extraPicks.push({ id: 'd8', kind: 'talent', name: 'Mass Death Magic', sphere: 'Death' });`);
  await go('Character', 'Companions');
  await page.locator('section.card', { has: page.locator('input[value="Big Ogre"]') }).locator('[data-a="reanEnd"]').click(); await settle();
  const spNow = async () => page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last')))).resources.find(r => /spell points/i.test(r.name)).cur);
  const sp0 = await spNow();
  await page.click('[data-a="reanMass"]'); await settle();
  await page.locator('.dlg label', { hasText: 'Big Ogre' }).locator('input').check(); await page.locator('.dlg label', { hasText: 'Old Ogre' }).locator('input').check();
  await page.locator('.dlg button', { hasText: 'Raise' }).click(); await settle();
  check('Mass Death Magic: two raised for 2 spell points, 13 of 60 HD', [sp0 - await spNow(), (await page.locator('.li', { hasText: 'Raised undead' }).first().innerText()).replace(/\s+/g, ' ').includes('13 / 60')].join(' '), '2 true');

  /* ---------- Forbidden lore (Ilyra with a +3 bonus) ----------
     Destructive blast is ceil(cl/2)d6 at Destruction caster level 13 (7d6); +3 for that casting only → 16 → 8d6.
     The sheet doesn't roll the backlash: using it changes nothing else, and the action's Roll20 macro rolls the d100 in public. */
  console.log('Forbidden lore');
  await home(); await page.click('[data-a="example"][data-k="incanter"]'); await settle();
  await patch(`c.loreOpt = { bonus: '3' };`);
  await go('Play', 'Sheet');
  const loreBlast = () => page.locator('.act', { hasText: 'Destructive blast' }).first();
  const will0 = Number((await tile('Will')).replace('−', '-')), cl0 = parseInt(await tile('Caster level'), 10);
  check('lore: off, 7d6', /7d6/.test(await loreBlast().locator('.fxline').innerText()), 'true');
  await loreBlast().locator('[data-a="loreTog"]').click(); await settle();
  check('lore: on, +3 caster level for this blast → 8d6', /8d6/.test(await loreBlast().locator('.fxline').innerText()), 'true');
  check('lore: the sphere’s own caster level is unchanged', parseInt(await tile('Caster level'), 10), String(cl0));
  for (let k = 0; k < 3; k++) { await loreBlast().locator('[data-a="useAct"]').click(); await settle(); }
  check('lore: the sheet never rolls a backlash (Will and caster level unchanged after 3 uses)', [Number((await tile('Will')).replace('−', '-')) - will0, parseInt(await tile('Caster level'), 10) - cl0].join(' '), '0 0');
  await go('Advanced', 'Save & print');
  const mac = await page.locator('#roll20 .li', { hasText: 'forbidden lore' }).first().locator('textarea').inputValue();
  check('lore: the Roll20 macro shows +3 and rolls the backlash d100 (15%)', mac.includes('{{Forbidden lore=+3 caster level · backlash on [[1d100]] if 15 or less}}'), 'true');

  /* ---------- Tova: Leadership cap, Sequence, Bravo-style prepared talents, class-level formulas ---------- */
  console.log('Leadership, Sequence, prepared talents');
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await settle();
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
  await page.locator('details[data-keep="leadopt"] summary').click(); await settle();
  check('Leadership: panel shows the table row and the talents', [/up to 9 Hit Dice each/.test((await page.locator('details[data-keep="leadopt"]').innerText()).replace(/\s+/g, ' ')), /Greater Recruitment/.test(await page.locator('details[data-keep="leadopt"] summary').innerText())].join(' '), 'true true');
  await go('Play', 'Sheet');
  const seq = () => page.locator('section.card', { has: page.locator('h2', { hasText: 'Sequence' }) });
  check('Sequence: 3 of 4 links (no Prodigy levels)', /3 \/ 4 links/.test((await seq().innerText()).replace(/\s+/g, ' ')), 'true');
  await seq().locator('[data-a="seqAdd"][data-n="1"]').click(); await settle();
  check('Sequence: capped at 4', await seq().locator('[data-a="seqAdd"][data-n="1"]').isDisabled(), 'true');
  await seq().locator('[data-a="seqEnd"]').first().click(); await settle();
  check('Sequence: ended (card hides without Prodigy levels)', await seq().count(), '0');
  const ini0 = Number((await tile('Initiative')).replace('−', '-'));
  check('prepared: none active yet, Prep A strike greyed', [await page.locator('.act', { hasText: 'Prep A strike' }).locator('[data-a="useAct"]').isDisabled()].join(' '), 'true');
  await page.locator('[data-a="tempAct"]', { hasText: 'Prep A' }).first().click(); await settle();
  check('prepared: Prep A active (+1), its action usable, 1 use left', [Number((await tile('Initiative')).replace('−', '-')) - ini0, await page.locator('.act', { hasText: 'Prep A strike' }).locator('[data-a="useAct"]').isDisabled(), /1 use left/.test(await page.locator('[data-a="tempTog"]').first().innerText())].join(' '), '1 false true');
  await page.locator('[data-a="tempAct"]', { hasText: 'Prep B' }).first().click(); await settle();
  check('prepared: Prep B replaces Prep A (1 at once): +2', [Number((await tile('Initiative')).replace('−', '-')) - ini0, await page.locator('[data-a="tempAct"]', { hasText: 'Prep A' }).first().getAttribute('aria-pressed')].join(' '), '2 false');
  await page.locator('[data-a="tempAct"]', { hasText: 'Prep C' }).first().click(); await settle();
  check('prepared: no uses left, Prep C refused', await page.locator('[data-a="tempAct"]', { hasText: 'Prep C' }).first().getAttribute('aria-pressed'), 'false');
  await go('Character', 'Talents');
  await page.selectOption('#tmp-preset', { label: 'Customized weapon set (Armiger)' }); await page.click('[data-a="tempNew"]'); await settle();
  check('class-level formula: Armiger set with no Armiger levels = 1 talent (lvl.armiger reads 0)', await page.locator('.tag', { hasText: '0 of 1 talents' }).count() > 0, 'true');

  /* ---------- Workshop (Tova with Alchemy, Herbalism and Trap) ----------
     Alchemy: sphere + 4 talents = 25 free Craft (alchemy) ranks, capped at 12 Hit Dice; DC 10 + 6 + 6 (Con practitioner) = 22;
     poison potent 1 + 12/4 = 4 rounds. Trap: 1 talent = 5 ranks; DC 10 + 2 + 6 = 18. A placed trap from a check of 12 lasts 12 − 5 = 7 rounds. */
  console.log('Workshop');
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await settle();
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await settle();
  check('Workshop: no tab without a crafting sphere', await page.locator('#tabbar [data-tab="ws"]').count(), '0');
  await patch(`const T=(id,n,sp,role)=>({id,kind:'talent',name:n,sphere:sp,role:role||undefined});
    c.extraPicks=(c.extraPicks||[]).concat([T('a0','Alchemy','Alchemy','sphere'),T('a1','Improved Alchemist Fire','Alchemy'),T('a2','Salve','Alchemy'),T('a3','Drowsy Venom','Alchemy'),T('a4','Hypervigilance Serum','Alchemy'),
      T('h0','Herbalism','Herbalism','sphere'),T('h1','Healing Poultice','Herbalism'),T('r0','Trap','Trap','sphere'),
      T('t0','Tech','Tech','sphere'),T('t1','Hookshot','Tech'),T('t2','Laser Pack','Tech'),T('t3','Extra Gadgets','Tech')]);
    c.extraSkills=(c.extraSkills||[]).concat([{id:'xa',base:'craft',label:'alchemy'},{id:'xt',base:'craft',label:'traps'},{id:'xh',base:'prof',label:'herbalist'},{id:'xm',base:'craft',label:'mechanical'}]);
    c.sphSkills=Object.assign(c.sphSkills||{},{Alchemy:['xa'],Herbalism:['xh'],Trap:['xt'],Tech:['xm']}); c.resources=(c.resources||[]).concat([{id:'rk1',name:'Rank test',max:'ranks.alchemy+ranks.craftalchemy-ranks.alchemy+ranks.nosuchskill',cur:0,reset:'none'}]); c.ws={herb:{types:['bitter'],herbs:{bitter:4},batches:1}};`);
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await settle();
  await page.locator('#tabbar [data-tab="ws"]').click(); await settle();
  const alch = () => page.locator('section.card', { has: page.locator('h2', { hasText: 'Alchemy' }) }).first();
  const wtx = async loc => (await loc.innerText()).replace(/\s+/g, ' ');
  /* skill-rank variables: ranks.alchemy = ranks.craftalchemy = 12; a skill you don't have reads 0 → 12 + 12 − 12 + 0 = 12 */
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await page.locator('#tabbar [data-tab="sheet"]').click(); await settle();
  check('rank variables: ranks.alchemy and ranks.craftalchemy read 12, a missing skill reads 0', /\/ 12/.test(await page.locator('.li', { hasText: 'Rank test' }).first().innerText()), 'true');
  await page.locator('#tabbar [data-tab="ws"]').click(); await settle();
  check('Workshop: Alchemy 12 ranks, DC 22, poison 4 rounds', [/12 ranks/.test(await wtx(alch())), /ALCHEMY DC 22/i.test(await wtx(alch())), /Potent for 4 rounds/.test(await wtx(alch()))].join(' '), 'true true true');
  check('Workshop: formulae from the wiki with Craft DCs', [/Improved Alchemist Fire Craft DC 20/.test(await wtx(alch())), /Salve Craft DC 15/.test(await wtx(alch()))].join(' '), 'true true');
  await alch().locator('[data-a="wsMake"][data-n="Salve"]').click(); await settle(); await alch().locator('[data-a="wsMake"][data-n="Salve"]').click(); await settle();
  check('Workshop: made two salves', /Salve ×2/.test(await wtx(alch())), 'true');
  await alch().locator('[data-a="wsUse"]').first().click(); await settle();
  check('Workshop: used one', /Salve ×1/.test(await wtx(alch())), 'true');
  /* Formulae prepared at one time: ½ × 12 ranks + 2 formulae talents = 8; per session 1 + 12/4 = 4 */
  check('Workshop: formulae limit 8, 4 per session', [/FORMULAE PREPARED 1 \/ 8/i.test(await wtx(alch())), /Craft 4 in 30 minutes/.test(await wtx(alch()))].join(' '), 'true true');
  for (let k = 0; k < 7; k++) { await alch().locator('[data-a="wsMake"][data-n="Improved Alchemist Fire"]').click(); await settle(); }
  check('Workshop: at 8 of 8, Make is off', [/FORMULAE PREPARED 8 \/ 8/i.test(await wtx(alch())), await alch().locator('[data-a="wsMake"][data-n="Salve"]').isDisabled()].join(' '), 'true true');
  /* Tech: 4 talents → 12 Craft (mechanical) ranks. Gadgets: ½ × 12 + 2 gadget talents + 2 (Extra Gadgets) = 10. Charges: 12 + 4 talents + 1 = 17. */
  const tech = () => page.locator('section.card', { has: page.locator('h2', { hasText: /^Tech$/ }) }).first();
  check('Workshop: Tech gadgets 0 of 10, charges max 17', [/GADGETS PREPARED 0 \/ 10/i.test(await wtx(tech())), /CHARGES 0 \/ 17/i.test(await wtx(tech()))].join(' '), 'true true');
  await tech().locator('[data-a="wsMake"][data-n="Hookshot"]').click(); await settle();
  check('Workshop: a gadget prepared', [/GADGETS PREPARED 1 \/ 10/i.test(await wtx(tech())), /Hookshot ×1 Disassemble/.test(await wtx(tech()))].join(' '), 'true true');
  const trap = () => page.locator('section.card', { has: page.locator('h2', { hasText: /^Trap$/ }) }).first();
  check('Workshop: Trap 5 ranks, DC 18', /TRAP DC 18/i.test(await wtx(trap())), 'true');
  await page.fill('#trap-check', '12'); await trap().locator('[data-a="trapPlace"]').click(); await settle();
  check('Workshop: a trap from a check of 12 lasts 7 rounds', /Dart 7 rounds left/.test(await wtx(trap())), 'true');
  /* operative modifier: Tova Int +0, Wis +1, Cha −1. Herbalism here is the sphere + 1 talent = 10 ranks. Not chosen → highest mental (+1): batch 10 + 1 = 11 herbs.
     Charisma chosen on Build → 10 − 1 = 9. */
  const herbC = () => page.locator('section.card', { has: page.locator('h2', { hasText: 'Herbalism' }) }).first();
  check('operative: not chosen uses the highest mental (+1): 11-herb batches', /A BATCH 11 herbs/i.test(await wtx(herbC())), 'true');
  await page.click('#tabbar [data-tgrp]:has-text("Character")'); await page.locator('#tabbar [data-tab="build"]').click(); await settle();
  await page.selectOption('select[data-f="opAbil"]', 'cha'); await settle();
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await page.locator('#tabbar [data-tab="ws"]').click(); await settle();
  check('operative: Charisma chosen on Build (−1): 9-herb batches', /A BATCH 9 herbs/i.test(await wtx(herbC())), 'true');
  await page.click('#tabbar [data-tgrp]:has-text("Play")'); await page.locator('#tabbar [data-tab="sheet"]').click(); await settle();
  await page.click('[data-a="rest"][data-k="long"]'); await settle();
  await page.locator('#tabbar [data-tab="ws"]').click(); await settle();
  check('Workshop: a long rest expires formulae, herbs and traps, not gadgets', [/Salve ×/.test(await wtx(alch())), /rounds left/.test(await wtx(trap())), /Hookshot ×1/.test(await wtx(tech())), /0 herbs on hand/.test(await wtx(page.locator('section.card', { has: page.locator('h2', { hasText: 'Herbalism' }) }).first()))].join(' '), 'false false true true');

  /* ---------- Faces of Death (Ilyra) ----------
     A Medium mudra electric skeleton (from a human, hands): 4 claws (1d4) with +1d6 electricity; Dex 10 + 4 (mudra) = 14; Cha 12;
     immune to electricity (not cold). Exploding + multiplying can't be combined. */
  console.log('Faces of Death, cohorts, personas');
  await home(); await page.click('[data-a="example"][data-k="incanter"]'); await settle();
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
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await settle();
  await patch(`c.extraPicks=(c.extraPicks||[]).concat([{id:'l1',kind:'talent',name:'Leadership',sphere:'Leadership',role:'sphere'},{id:'l2',kind:'talent',name:'Squad',sphere:'Leadership'}]);
    c.companions=(c.companions||[]).concat([{id:'k1',name:'Iron Company',kind:'cohort',on:true,size:'M',hd:'5',abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},attacks:[],mods:[],traits:[]}]);`);
  await go('Character', 'Companions');
  const ic = () => page.locator('section.card', { has: page.locator('input[value="Iron Company"]') }).first();
  await ic().locator('select[data-cohprof]').selectOption('warrior'); await settle();
  await ic().locator('input[data-f$=".coh.troop"]').check(); await settle();
  w = await cardText('Iron Company');
  check('cohort: Warrior profession fills Str 16 … and sets d10, BAB = HD', [/32 \/ 32 hp/.test(w), /HD · BAB 5 · \+5/i.test(w)].join(' '), 'true true');
  check('cohort: saves good Fort/Will, bad Ref', /Fort \+5 Ref \+2 Will \+4/i.test(w), 'true');
  check('cohort: troop 4d10 magical with Batter', [/Troop damage 4d10 \(magical\)/.test(w), /Batter:/.test(w)].join(' '), 'true true');

  /* ---------- Pilot sphere (2026-11-11): free ranks like Athletics (Tova, 12 HD) ----------
     Packages: Naval = Profession, Stellar = Fly, Terrestrial = Ride. 5 ranks for the base sphere, +5 per further talent, capped at
     Hit Dice 12 (the class-skill +3 comes with the first rank, so the checks compare totals against the base sphere alone). */
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await settle();
  const pil = (n, skills) => `var t=[{id:'pl0',kind:'talent',name:'Pilot',sphere:'Pilot',role:'sphere'}];for(var i=1;i<=${n};i++)t.push({id:'pl'+i,kind:'talent',name:'Cruise Control',sphere:'Pilot'});
    c.extraPicks=(c.extraPicks||[]).filter(function(p){return !/^pl\\d/.test(p.id);}).concat(t);c.sphSkills=Object.assign(c.sphSkills||{},{Pilot:${JSON.stringify(skills)}});`;
  const sk2 = async () => [parseInt(await skillTotal('Fly')), parseInt(await skillTotal('Ride'))];
  await go('Character', 'Skills'); const none0 = await sk2();
  await patch(pil(0, ['fly'])); await go('Character', 'Skills'); const p1 = await sk2();
  await patch(pil(1, ['fly'])); await go('Character', 'Skills'); const p2 = await sk2();
  check('Pilot (Stellar, Fly): the base sphere alone gives 5 ranks (+3 class skill); Ride is untouched', (p1[0] - none0[0]) + ' ' + (p1[1] - none0[1]), '8 0');
  check('…and each further talent adds 5 more (base + 1 talent = 10 ranks)', p2[0] - p1[0], '5');
  await patch(pil(5, ['fly'])); await go('Character', 'Skills'); const p6 = await sk2();
  await patch(pil(2, ['fly'])); await go('Character', 'Skills'); const p3 = await sk2();
  check('…capped at Hit Dice 12: base + 2 talents (15) gives the same as base + 5 (30), 2 ranks above base + 1', (p3[0] - p2[0]) + ' ' + (p6[0] - p3[0]), '2 0');
  await patch(pil(1, ['fly', 'ride'])); await go('Character', 'Skills'); const pr = await sk2();
  check('Pilot with two packages (Stellar + Terrestrial): Ride gets the same ranks as Fly', (pr[0] - p2[0]) + ' ' + (pr[1] - none0[1] - (p2[0] - none0[0])), '0 0');
  await patch(pil(1, [])); await go('Character', 'Skills');
  check('Pilot with no package skill chosen (three choices): no free ranks yet', (await sk2()).map((v, i) => v - none0[i]).join(' '), '0 0');

  /* ---------- Personas (Tova relabelled a 12th-level Troubadour: ¾ BAB, low caster) ----------
     True self: +3 morale on saves (1 + 1 at 5th + 1 at 9th). Captain Vale (Hero, Resolute +4 Fort as a modifier): BAB 9 → 12,
     Fort −3 (no base bonus) +4 = +1 net. Madame Ink (Mentor): caster level 6 → 12. Quick Change 3/day. */
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await settle();
  await patch(`Object.keys(c.classes).forEach(id=>{ Object.assign(c.classes[id],{name:'Troubadour',bab:'3/4',cast:'low',martial:'none'}); });
    c.pers={list:[{id:'v1',name:'Captain Vale',tropes:[{k:'hero',alt:false}],quirks:[{k:'hero',n:'Resolute'}]},{id:'v2',name:'Madame Ink',tropes:[{k:'mentor',alt:false}],quirks:[]}],active:'',qc:0,borrow:[]};
    c.tempSrc=(c.tempSrc||[]).concat([{id:'ps-v1',name:'Persona: Captain Vale',on:false,pers:'v1'},{id:'ps-v2',name:'Persona: Madame Ink',on:false,pers:'v2'}]);
    c.groups=(c.groups||[]).concat([{id:'pg-v1',name:'Persona: Captain Vale',on:false,kind:'buff'},{id:'pg-v2',name:'Persona: Madame Ink',on:false,kind:'buff'}]);
    c.mods=(c.mods||[]).concat([{id:'pm9',src:'Resolute',target:'fort',val:'2+(1+floor((lvl-5)/4))',type:'untyped',when:'toggle',group:'pg-v1'}]);`);
  await go('Play', 'Sheet');
  const babNow = async () => Number(((await page.locator('.cardhead .note', { hasText: 'BAB' }).first().innerText()).match(/BAB ([+−-]\d+)/) || [])[1].replace('−', '-'));
  const fort0 = Number((await tile('Fortitude')).replace('−', '-')), bab0 = await babNow(), cl0p = parseInt(await tile('Caster level'), 10);
  check('personas: true self BAB 9 (¾ of 12), caster level 6 (low)', [bab0, cl0p].join(' '), '9 6');
  await page.locator('[data-a="persQuick"]', { hasText: 'Captain Vale' }).first().click(); await settle();
  check('personas: Captain Vale (Hero): BAB 12, Fort −3 base bonus +4 Resolute', [await babNow(), Number((await tile('Fortitude')).replace('−', '-')) - fort0].join(' '), '12 1');
  await page.locator('[data-a="persQuick"]', { hasText: 'Madame Ink' }).first().click(); await settle();
  check('personas: Madame Ink (Mentor): caster level 12, BAB back to 9, 1 Quick Change left', [parseInt(await tile('Caster level'), 10), await babNow(), /1 left today/.test(await page.locator('section.card', { has: page.locator('h2', { hasText: 'Persona:' }) }).first().innerText())].join(' '), '12 9 true');
  /* Prepare from the Sheet: switches without using a Quick Change (1 left stays 1) */
  await page.locator('section.card', { has: page.locator('h2', { hasText: 'Persona:' }) }).first().locator('[data-a="persPrep"]', { hasText: 'Captain Vale' }).click(); await settle();
  check('personas: Prepare from the Sheet switches, no Quick Change used', [await babNow(), /1 left today/.test(await page.locator('section.card', { has: page.locator('h2', { hasText: 'Persona:' }) }).first().innerText())].join(' '), '12 true');
  await page.click('[data-a="rest"][data-k="long"]'); await settle();
  check('personas: a long rest refills Quick Changes', /3 left today/.test(await page.locator('section.card', { has: page.locator('h2', { hasText: 'Persona:' }) }).first().innerText()), 'true');

  /* ---------- Temporary talents (Tova) ----------
     Two weapon sets, one at a time. Set A (on) lends Fencing, Set B (off) lends Duelist. A +1 insight modifier named Fencing and a
     +2 one named Duelist both target initiative. Expected: talent budget and Bluff unchanged (no budget, no free ranks), initiative +1;
     switching to Set B turns Set A off: initiative +2 instead. */
  console.log('Temporary talents');
  await home(); await page.click('[data-a="example"][data-k="striker"]'); await settle();
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
  await go('Play', 'Sheet'); await page.locator('#tabpanel [data-a="tempTog"], [data-a="tempTog"]', { hasText: 'Set B' }).first().click(); await settle();
  check('temporary: switching sets (one at a time)', (Number((await tile('Initiative')).replace('−', '-')) - init0) + ' ' + await page.locator('[data-a="tempTog"]', { hasText: 'Set A' }).first().getAttribute('aria-pressed'), '2 false');
  await page.click('[data-a="rest"][data-k="long"]').catch(() => {}); await settle();
  check('temporary: a long rest switches off sources set to', await page.locator('[data-a="tempTog"]', { hasText: 'Set B' }).first().getAttribute('aria-pressed'), 'false');

  /* regression (2026-11-06): a brand-new character's long rest failed (its Workshop lists were missing until the Workshop tab was drawn) */
  console.log('New character');
  await home(); const errN = errors.length; await page.click('[data-a="newChar"]'); await settle();
  await go('Play', 'Sheet'); await page.click('[data-a="rest"][data-k="long"]'); await settle();
  check('new character: a long rest works before any other tab is opened', [errors.length - errN, /Long rest \(8 hours\)/.test(await page.locator('#toast').innerText().catch(() => ''))].join(' '), '0 true');
  await page.locator('[data-a="levelUp"]').first().click(); await settle();
  check('level up, first level of a new character: the class list is the default (hand-described still offered)', [await page.locator('.dlg-back').last().locator('select[name="cls"]').inputValue(), await page.locator('.dlg-back').last().locator('select[name="cls"] option[value="__new"]').count()].join(' '), '__lib 1');
  await cancelOrEsc(page.locator('.dlg-back').last().locator('button', { hasText: 'Cancel' })); await settle();

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
  await page.reload(); await idle();
  await go('Character', 'Talents'); await page.waitForTimeout(300); /* kept: the check below is that nothing happens, and a request is only seen by this script a moment after the page sends it */
  check('nothing is fetched until a row opens', wkReq.length, '0');
  const wkRow = name => page.locator('details.item', { has: page.locator('summary', { hasText: name }) }).first();
  const wkOpen = async name => { const r = wkRow(name); if (!(await r.evaluate(d => d.open))) await r.locator('summary').click(); await idle(); return r; };
  const wkText = async r => (await r.locator('.wk').first().innerText()).replace(/\s+/g, ' ');
  const stored = async () => page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:zz-wiki')));
  let r = await wkOpen('Create Nature');
  check('Create Nature: wiki text shows', /Geomancing Talents.*As an instantaneous effect, you may spend a spell point/.test(await wkText(r)), 'true');
  check('only the index and the Nature file were fetched', wkReq.slice().sort().join(','), 'index.json,nature.json');
  check('a long text starts clipped', await r.locator('.wkt.clip').count(), '1');
  await r.locator('[data-a="wkMore"]').click(); await idle();
  check('“Show all” shows the whole text', (await wkRow('Create Nature').locator('.wkt.clip').count()) + ' ' + (await wkRow('Create Nature').locator('[data-a="wkMore"]').innerText()), '0 Show less');
  check('the base sphere row has no wiki box', await wkRow('Nature sphere').locator('.wk').count(), '0');
  r = await wkOpen('Nature Lord');
  check('sphere typed as “Nature sphere” still matches', /Treat your caster level as 5 higher/.test(await wkText(r)), 'true');
  check('notes copied from the wiki are noticed', /Your notes are the same as this text/.test(await wkText(r)), 'true');
  await r.locator('[data-a="wkClearNotes"]').click(); await idle();
  check('“Clear my notes” empties them', (await stored()).extraPicks.find(p => p.id === 'w5').notes, '');
  r = await wkOpen('Expanded Geomancy');
  check('a misspelt name: not found, with suggestions', /Couldn’t find “Expanded Geomancy” in the Nature sphere/.test(await wkText(r)) + ' ' + (await r.locator('.wk [data-a="wkLink"]').first().innerText()).replace(/\s+/g, ' '), 'true Expanded Geomancing · Nature');
  await r.locator('.wk [data-a="wkLink"]').first().click(); await idle();
  r = wkRow('Expanded Geomancy');
  check('linking a suggestion shows its text', /Linked by hand.*Choose and gain a Nature package/.test(await wkText(r)), 'true');
  check('the link is saved on the pick', JSON.stringify((await stored()).extraPicks.find(p => p.id === 'w2').ref), '{"s":"nature","n":"expandedgeomancing"}');
  await page.reload(); await idle(); await go('Character', 'Talents');
  r = await wkOpen('Expanded Geomancy');
  check('the link survives a reload', /Linked by hand/.test(await wkText(r)), 'true');
  await r.locator('[data-a="wkRename"]').click(); await idle();
  check('“Rename to” uses the wiki name', (await stored()).extraPicks.find(p => p.id === 'w2').name, 'Expanded Geomancing');
  await page.click('#toast [data-a="undo"]'); await idle();
  check('renaming can be undone', (await stored()).extraPicks.find(p => p.id === 'w2').name, 'Expanded Geomancy');
  r = await wkOpen('Expanded Geomancy');
  await r.locator('[data-a="wkUnlink"]').click(); await idle();
  check('unlinking removes the link', String((await stored()).extraPicks.find(p => p.id === 'w2').ref), 'undefined');
  r = await wkOpen('Earth Mastery');
  check('the wrong sphere: found in the right one, with a warning', /Found in the Nature sphere, not Destruction.*Increase the maximum radius of your Bury/.test(await wkText(r)), 'true');
  r = await wkOpen('Moonbeam Juggling');
  check('an unknown sphere is named', /Couldn’t find “Moonbeam Juggling” on the wiki \(it has no “Homebrew” sphere\)/.test(await wkText(r)), 'true');
  await r.locator('input[data-wkq]').fill('storm lo'); await idle();
  check('search finds talents by part of the name', (await r.locator('.wkres [data-a="wkLink"]').first().innerText()).replace(/\s+/g, ' '), 'Storm Lord · Weather');
  await r.locator('.wkres [data-a="wkLink"]').first().click(); await idle();
  check('linking from the search', /Linked by hand.*Storm Lord/.test(await wkText(wkRow('Moonbeam Juggling'))), 'true');
  r = await wkOpen('Create Nature');
  await r.locator('[data-a="wkPick"]').click(); await idle();
  check('“Not the right text?” opens a search', await wkRow('Create Nature').locator('input[data-wkq]').count(), '1');
  await go('Character', 'Traditions');
  const fold = name => page.locator('.edit', { has: page.locator(`input[value="${name}"]`) }).locator('details.wkfold').first();
  await fold('Consciousness Linked').locator('summary').click(); await idle();
  check('a general drawback shows its wiki text', /General Drawbacks.*Your effects are linked to you/.test((await fold('Consciousness Linked').innerText()).replace(/\s+/g, ' ')), 'true');
  await fold('Easy Focus').locator('summary').click(); await idle();
  check('a boon shows its wiki text', /Boons/.test((await fold('Easy Focus').innerText()).replace(/\s+/g, ' ')), 'true');
  /* Energy Focus is a Destruction drawback, and the character has a Destruction pick, so it sits on that sphere's card */
  await go('Character', 'Talents');
  const efFold = page.locator('.sphdbedit .fields:has(input[value="Energy Focus"]) + details.wkfold').first();
  await efFold.evaluate(d => { for (let x = d.parentElement.closest('details'); x; x = x.parentElement.closest('details')) x.open = true; }); await idle();
  await efFold.locator('summary').click(); await idle();
  check('a sphere drawback (on its sphere card) matches its sphere', /Sphere-Specific Drawbacks · Destruction/.test((await efFold.innerText()).replace(/\s+/g, ' ')), 'true');
  /* offline: a downloaded copy with no internet */
  wkOnline = false; await page.reload(); await idle(); await go('Character', 'Talents');
  r = await wkOpen('Create Nature');
  check('offline: says why and links to the wiki', /Couldn’t load the wiki text \(this copy is opened from a file, so it needs the internet\).*Try again.*Open the wiki/.test(await wkText(r)), 'true');
  wkOnline = true; await r.locator('[data-a="wkRetry"]').click(); await idle();
  check('“Try again” loads it once back online', /As an instantaneous effect/.test(await wkText(wkRow('Create Nature'))), 'true');
  const wkErrs = errors.filter(e => /ERR_FAILED|Failed to load resource/.test(e)).length; errors.splice(0, errors.length, ...errors.filter(e => !/ERR_FAILED|Failed to load resource/.test(e)));
  check('only the offline fetches failed', wkErrs > 0, 'true');

  /* ---------- adding talents from the wiki list (phase 2) ---------- */
  console.log('Adding talents from the wiki');
  const picksNow = async () => (await stored()).extraPicks.map(p => [p.name, p.sphere, p.role || '', p.tkind || ''].join('/'));
  const tkSearch = async q => { await page.fill('#tk-name', ''); await page.click('#tk-name'); await page.type('#tk-name', q, { delay: 20 }); await idle(); await until('the wiki search results', () => { const r = document.getElementById('tk-res'); return !!r && r.textContent.trim().length > 0; }); };
  const firstRes = async () => (await page.locator('#tk-res [data-wkchoose]').first().innerText()).replace(/\s+/g, ' ');
  await tkSearch('greater rean');
  check('search: typing finds wiki talents', await firstRes(), 'Greater Reanimate · Death');
  await page.locator('#tk-res [data-wkchoose]').first().click(); await idle();
  check('picking fills name, sphere and type', [await page.inputValue('#tk-name'), await page.inputValue('#tk-sphere'), await page.inputValue('#tk-kind'), await page.inputValue('#tk-role')].join('/'), 'Greater Reanimate/Death/magic/talent');
  const tkPrev = async () => (await page.locator('#tk-prevbox').innerText()).replace(/\s+/g, ' ');
  check('the preview shows its text and offers the missing base sphere', /Also add the Death base sphere.*Increase the total Hit Dice/.test(await tkPrev()) + ' ' + await page.isChecked('#tk-base'), 'true true');
  await page.click('[data-a="addTalent"]'); await idle();
  check('adding it also adds the base sphere', (await picksNow()).slice(-2).join(' | '), 'Death sphere/Death/sphere/magic | Greater Reanimate/Death/talent/magic');
  check('the form is cleared after adding', (await page.inputValue('#tk-name')) + '|' + (await page.locator('#tk-prevbox').innerText()).trim(), '|');
  await tkSearch('gravetongue'); await page.locator('#tk-res [data-wkchoose]').first().click(); await idle();
  check('a [utility] talent counts as a utility talent', await page.inputValue('#tk-role'), 'utility');
  check('no base sphere offer once you have the sphere', await page.locator('#tk-base').count(), '0');
  await page.click('[data-a="addTalent"]'); await idle();
  check('…and is saved that way', (await picksNow()).slice(-1)[0], 'Gravetongue/Death/utility/magic');
  await tkSearch('greater rean');
  check('talents you have are marked “taken”', /taken/.test(await firstRes()), 'true');
  await page.locator('#tk-res [data-wkchoose]').first().click(); await idle();
  check('picking a taken one warns', /You already have this talent/.test(await tkPrev()), 'true');
  await tkSearch('cyclone'); await page.locator('#tk-res [data-wkchoose]').first().click(); await idle();
  check('advanced talents carry the GM-permission note', /Advanced talents are an optional rule: only with GM permission/.test(await tkPrev()), 'true');
  await tkSearch('Moonbeam Sparkles');
  check('a homebrew name says it’s not on the wiki', (await page.locator('#tk-res').innerText()).trim(), 'Not on the wiki: it will be added as you typed it.');
  check('typing over a pick drops it', await page.locator('#tk-prevbox .wk').count(), '0');
  await page.fill('#tk-sphere', 'Homebrew'); await page.click('[data-a="addTalent"]'); await idle();
  check('…and is added as typed', (await picksNow()).slice(-1)[0], 'Moonbeam Sparkles/Homebrew/talent/magic');
  /* browse a sphere's talents on its card */
  const brw = page.locator('details.wkbrowse', { has: page.locator('summary', { hasText: 'Browse the wiki’s Nature talents' }) }).first();
  if (!(await brw.evaluate(d => d.open))) await brw.locator(':scope > summary').click(); await idle();
  const natureCount = JSON.parse(fs.readFileSync(path.join(TAL, 'index.json'), 'utf8')).spheres.nature.c;
  check('browse lists every talent of the sphere', await brw.locator('details.wkbi').count(), String(natureCount));
  await brw.locator('input[data-wkbq]').fill('mastery'); await idle();
  const shown = await brw.locator('details.wkbi:not([hidden]) summary b').allInnerTexts();
  check('the filter narrows the list', shown.length > 3 && shown.every(x => /mastery/i.test(x)), 'true');
  check('talents you have are marked in the list', /taken/.test(await brw.locator('details.wkbi', { hasText: 'Create Nature' }).first().locator('summary').innerText()), 'true');
  await brw.locator('[data-a="wkbHide"]').click(); await idle();
  check('“Hide the ones I have” hides them', await brw.locator('details.wkbi', { hasText: 'Create Nature' }).count(), '0');
  const air = brw.locator('details.wkbi', { has: page.locator('summary b', { hasText: /^Air Mastery$/ }) }).first();
  await air.locator('summary').click(); await idle();
  check('opening one shows its text', /When you use the Gust Of Wind ability/.test(await air.innerText()), 'true');
  await air.locator('[data-a="wkAddTal"]').click(); await idle();
  check('“Add” adds it to that sphere', (await picksNow()).slice(-1)[0], 'Air Mastery/Nature/talent/magic');
  /* the level-up dialog (Ilyra, Incanter 12 → 13) */
  await home(); await page.click('button[data-k="incanter"]'); await idle();
  await page.locator('[data-a="levelUp"]').first().click(); await idle();
  const dlg = () => page.locator('.dlg-back').last();
  await dlg().locator('button', { hasText: 'Next' }).click(); await idle();
  await dlg().locator('input[name="hp"]').fill('4'); await dlg().locator('button', { hasText: 'Next' }).click(); await idle();
  /* the talents step now comes before the skills step (2026-11-08) */
  const tr = dlg().locator('.talrow').first();
  await tr.locator('.tr-nm').click(); await tr.locator('.tr-nm').type('gravetong', { delay: 20 }); await idle();
  check('level-up: the talent box searches the wiki', (await tr.locator('[data-wkchoose]').first().innerText()).replace(/\s+/g, ' '), 'Gravetongue · Death');
  await tr.locator('[data-wkchoose]').first().click(); await idle();
  check('level-up: picking fills the sphere', await tr.locator('.tr-sph').inputValue(), 'Death');
  check('level-up: notes [utility] and the missing sphere', /\[utility\].*You don’t have the Death sphere yet/.test((await tr.locator('.lu-note').innerText()).replace(/\s+/g, ' ')), 'true');
  await tr.locator('.lu-addbase').click(); await idle();
  const rows = dlg().locator('.talrow'), last = rows.last();
  check('level-up: “Add a row for the base sphere” adds one', [await last.locator('.tr-sph').inputValue(), await last.locator('.tr-base').isChecked()].join(' '), 'Death true');
  await dlg().locator('button', { hasText: 'Next' }).click(); await idle();
  check('level-up: the skills step comes after the talents', /4 · Skills/.test(await dlg().locator('.steps .cur').innerText()), 'true');
  await dlg().locator('button', { hasText: 'Next' }).click(); await idle();
  await dlg().locator('button', { hasText: 'Level up' }).click(); await idle();
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
  await page.reload(); await settle();
  const stP = async () => page.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:zz-play')));
  await go('Character', 'Skills');
  check('two spheres on one skill: the higher one’s ranks count, plus the competence bonus (10 − 1 + 3 + 6)', await skillTotal('Intimidate'), '+18');
  const whySk = async id => { await page.click(`[data-a="why"][data-k="skill.${id}"]`); await settle(); const tx = (await page.locator('.dlg-back').last().innerText()).replace(/\s+/g, ' '); await page.keyboard.press('Escape'); await settle(); return tx; };
  check('…and the breakdown says which sphere', /Ranks from the Bluster sphere \(the highest of/.test(await whySk('intim')), 'true');
  check('trade overlap: +4 instead of +3 (3 − 1 + 4)', await skillTotal('Handle Animal'), '+6');
  check('…shown in the breakdown', /Class skill \(trade overlap\)/.test(await whySk('handle')), 'true');
  check('Athletics Leap + Run: Acrobatics once, plus the shared-skill bonus (5 + 1 + 6)', await skillTotal('Acrobatics'), '+12');
  check('…named as two packages', /Shared associated skill \(Athletics, two packages\)/.test(await whySk('acro')), 'true');
  /* a skill using another ability */
  const abDlg = async () => { await page.click('[data-a="skAbil"][data-k="intim"]'); await settle(); return page.locator('.dlg-back').last(); };
  let ad = await abDlg(); await ad.locator('select[name="a"]').selectOption('str'); await ad.locator('input[name="why"]').fill('Intimidating Prowess');
  await ad.locator('button', { hasText: 'Save' }).click(); await settle();
  check('a skill can use another ability (Str +3 instead of Cha −1)', await skillTotal('Intimidate'), '+22');
  const abCell = async () => (await page.locator('tr', { has: page.locator('td:first-child', { hasText: /^Intimidate/ }) }).first().locator('td').nth(3).innerText()).replace(/\s+/g, ' ');
  check('…the Ability cell shows it, marked', await abCell(), 'Str +3 *');
  check('…and the breakdown says why', /Str \(instead of Cha: Intimidating Prowess\)/.test(await whySk('intim')), 'true');
  ad = await abDlg(); await ad.locator('input[name="sit"]').check(); await ad.locator('button', { hasText: 'Save' }).click(); await settle();
  check('“only sometimes” keeps the normal total', await skillTotal('Intimidate'), '+18');
  check('…and shows the other one under the skill', /\+4 Str instead of Cha \(Intimidating Prowess\)/.test((await page.locator('tr', { has: page.locator('td:first-child', { hasText: /^Intimidate/ }) }).first().innerText()).replace(/\s+/g, ' ')) + ' ' + /or Str \+3/.test(await abCell()), 'true true');
  await page.reload(); await settle(); await go('Character', 'Skills');
  check('the ability choice is saved', JSON.stringify((await stP()).skillAbil.intim), '{"a":"str","why":"Intimidating Prowess","sit":true}');
  ad = await abDlg(); await ad.locator('button', { hasText: 'Back to Cha' }).click(); await settle();
  check('“Back to Cha” undoes it', String((await stP()).skillAbil.intim) + ' ' + await skillTotal('Intimidate'), 'undefined +18');
  /* Extra Talent feats */
  await go('Character', 'Talents');
  await page.click('[data-a="why"][data-k="talents"]'); await settle();
  const tb = (await page.locator('.dlg-back').last().innerText()).replace(/\s+/g, ' '); await page.keyboard.press('Escape'); await settle();
  check('Extra Talent feats count toward talents, with “Times taken”', /Extra Magic Talent ×2 \(feat\) \+2/.test(tb) + ' ' + /Extra Combat Talent \(feat\) \+1/.test(tb), 'true true');
  await go('Character', 'Build');
  check('Build warns about Bonus talents raised for them', await page.locator('[data-a="xtalFix"]').innerText(), 'Lower Bonus talents by 2');
  await page.click('[data-a="xtalFix"]'); await settle();
  check('…and one click lowers it', String((await stP()).classes.c1.bonusTalents) + ' ' + await page.locator('[data-a="xtalFix"]').count(), '0 0');
  check('a talent marked free “from Extra Combat Talent” is pointed out', /Brute Test Talent is marked free but came from one/.test(await page.locator('p.warn', { has: page.locator('[data-a="xtalFree"]') }).innerText()), 'true');
  await page.click('[data-a="xtalFree"]'); await settle();
  check('…and one click counts it as a normal talent', (await stP()).levels[0].picks.find(p => p.id === 'q7').role, 'talent');
  /* associated skills: Acrobatics a third time is refused, another skill is added, and the keyboard stays on the new box */
  await go('Character', 'Talents');
  await page.selectOption('select[data-assoc="Athletics|new"]', 'climb'); await settle();
  check('adding an associated skill keeps the keyboard on its new box', JSON.stringify((await stP()).sphSkills.Athletics) + ' ' + await page.evaluate(() => document.activeElement && document.activeElement.dataset.assoc), '["acro","acro","climb"] Athletics|2');
  await page.selectOption('select[data-assoc="Athletics|new"]', 'acro'); await settle();
  check('…Acrobatics can’t go in a third time', JSON.stringify((await stP()).sphSkills.Athletics), '["acro","acro","climb"]');
  /* History: drawbacks and boons are recorded; the ones already there aren't listed as new */
  await go('Character', 'Traditions');
  await page.click('[data-a="tradAdd"][data-p="traditions.casting.boons"]'); await settle();
  await page.fill('[data-f="traditions.casting.boons.0.name"]', 'Easy Focus'); await page.press('[data-f="traditions.casting.boons.0.name"]', 'Tab'); await until('the History entry for the new boon (the page writes it 4 s after the last edit)', () => { try { return (JSON.parse(localStorage.getItem('spheres-sheet-v1:zz-play')).history || []).some(h => h.cat === 'Boon'); } catch (e) { return false; } }, null, page, 20000);
  const hP = ((await stP()).history || []).filter(h => h.cat === 'Boon' || h.cat === 'Drawback').map(h => h.t + ' ' + h.cat + ' ' + h.text);
  check('History records a new boon, not the drawback that was already there', hP.join(' | '), 'add Boon Easy Focus');
  /* level-up: talents first, and the skills step counts the sphere just picked */
  await page.locator('[data-a="levelUp"]').first().click(); await settle();
  await dlg().locator('button', { hasText: 'Next' }).click(); await settle();
  await dlg().locator('input[name="hp"]').fill('5'); await dlg().locator('button', { hasText: 'Next' }).click(); await settle();
  const tr2 = dlg().locator('.talrow').first(); await tr2.locator('.tr-sph').fill('Body Control'); await tr2.locator('.tr-base').check();
  await dlg().locator('button', { hasText: 'Next' }).click(); await settle();
  const esc = dlg().locator('label', { has: page.locator('input[name="sk-escape"]') });
  check('level-up: the skills step counts a sphere picked on the talents step', (await esc.innerText()).replace(/\s+/g, ' ').trim() + ' / max ' + await esc.locator('input').getAttribute('max'), 'Escape Artist 0 +5 sphere / max 8');
  await dlg().locator('button', { hasText: 'Back' }).click(); await settle();
  check('level-up: Back from skills returns to talents', /3 · Feats & talents/.test(await dlg().locator('.steps .cur').innerText()), 'true');
  await cancelOrEsc(dlg().locator('button', { hasText: 'Cancel' }).first()); await settle();
  /* every text box has a name a screen reader can read */
  const unl = await page.evaluate(() => [...document.querySelectorAll('textarea,input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select')].filter(e => !e.labels?.length && !e.getAttribute('aria-label') && !e.closest('label')).length);
  check('no unlabelled boxes on the Traditions tab', unl, '0');

  /* ---------- quick fixes (2026-11-08): weapon rows stay open, no empty damage button, paused actions tagged ---------- */
  console.log('Quick fixes');
  await home(); await page.click('button[data-k="striker"]'); await settle();
  check('a combat maneuver has no (empty) damage button', (await page.locator('[data-a="why"][data-k="dmg:w2"]').count()) + ' ' + (await page.locator('[data-a="why"][data-k="dmg:w1"]').count()), '0 1');
  await go('Character', 'Gear');
  await page.click('[data-a="addWeapon"]'); await settle();
  const wKey = await page.locator('details.item[data-keep^="wp-"][open]').last().getAttribute('data-keep');
  const wRow = page.locator(`details.item[data-keep="${wKey}"]`);
  await wRow.locator('[data-f$=".name"]').fill('Longsword'); await wRow.locator('[data-f$=".dice"]').click(); await settle();
  check('a new weapon stays open when you click into the next box', (await wRow.evaluate(d => d.open)) + ' ' + await page.evaluate(() => document.activeElement && document.activeElement.dataset.f), 'true weapons.2.dice');
  await page.keyboard.press('Control+A'); await page.keyboard.type('1d10'); await wRow.locator('[data-f$=".dtype"]').click(); await settle();
  check('…and after the next one', String(await wRow.evaluate(d => d.open)), 'true');
  const wpp = wRow.locator('details.wprops'); await wpp.locator('summary').click(); await settle();
  check('its Special abilities section has its own key', await wpp.getAttribute('data-keep'), wKey.replace(/^wp-/, 'wpp-'));
  /* an action named after a temporary talent that's off */
  await page.evaluate(() => { const id = 'zz-tmp'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Temp', levels: [], classes: {},
    tempSrc: [{ id: 't1', name: 'Quick Study', slots: '1', on: false }],
    extraPicks: [{ id: 'p1', kind: 'talent', name: 'Lingering Darkness', sphere: 'Dark', temp: 't1' }],
    actions: [{ id: 'a1', name: 'Lingering Darkness', act: 'standard', res: '', cost: '0', dcBase: 'none' }, { id: 'a2', name: 'Other thing', act: 'move', res: '', cost: '0', dcBase: 'none' }] }));
    localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); });
  await page.reload(); await settle(); await go('Play', 'Sheet');
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
  const gotIndex = untilResponse('the wiki list (advanced talents are counted from it)', /talents\/index\.json/); await page.reload(); await settle(); await go('Character', 'Talents'); await gotIndex(); await idle();
  check('advanced, legendary and exceptional talents: counted together from the wiki and your own marks, against 1 + 1 per 5 levels', await tile('Advanced talents'), '5 / 2');
  check('…with a warning naming them', /Too many advanced talents:.*5 \(Cyclone, Create Haunt, Homebrew Big Talent, Bizarre Artistry, Ambrosia\); the house rule allows 2 at level 6/.test((await page.locator('p.warn', { hasText: 'Too many advanced talents' }).innerText()).replace(/\s+/g, ' ')), 'true');
  const advTag = async n => /Advanced/.test(await page.locator('details.item', { has: page.locator('summary .nm', { hasText: new RegExp('^' + n + '$') }) }).locator(':scope > summary').innerText());
  check('advanced rows are tagged (and “no” overrides the wiki)', [await advTag('Cyclone'), await advTag('Create Nature'), await advTag('Mercy Killing')].join(' '), 'true false false');
  const kindTag = async n => (await page.locator('details.item', { has: page.locator('summary .nm', { hasText: new RegExp('^' + n + '$') }) }).locator(':scope > summary .tag.gold').last().innerText()).trim();
  check('legendary and exceptional ones are tagged by their own name', (await kindTag('Ambrosia')) + ' ' + await kindTag('Bizarre Artistry'), 'Legendary Exceptional');
  const hauntRow = page.locator('details.item', { has: page.locator('summary .nm', { hasText: /^Create Haunt$/ }) });
  await hauntRow.locator(':scope > summary').click(); await settle();
  await hauntRow.locator('select[data-f$=".adv"]').selectOption('no'); await settle();
  check('marking one “No” drops it from the count', (await tile('Advanced talents')) + ' ' + await page.locator('p.warn', { hasText: 'Too many advanced talents' }).count(), '4 / 2 1');
  await tkSearch('astral proj'); await page.locator('#tk-res [data-wkchoose]').first().click(); await idle();
  check('the add-talent preview warns before going over', /House rule: 5 of 2 advanced talents at level 6 \(over the limit\)/.test(await tkPrev()), 'true');
  /* divided casting scores: the old switches turned into one */
  await go('Advanced', 'Rules');
  check('an old casting switch turns on “Divided casting scores”', await page.locator('[data-a="rule"][data-k="divCast"]').getAttribute('aria-pressed'), 'true');
  check('…and the four old switches are gone', String(await page.locator('[data-a="rule"][data-k="wisConc"], [data-a="rule"][data-k="intPool"], [data-a="rule"][data-k="highDC"], [data-a="rule"][data-k="wisDur"]').count()), '0');
  await page.click('[data-a="rule"][data-k="advLimit"]'); await settle();
  await go('Character', 'Talents');
  check('switching the advanced rule off hides the count', String(await page.locator('.tile', { has: page.locator('.k', { hasText: /^Advanced talents$/ }) }).count()), '0');
  await page.unroute(SITE + '**');
  await home(); await page.click('button[data-k="incanter"]'); await settle();
  await go('Advanced', 'Rules'); await page.click('[data-a="rule"][data-k="divCast"]'); await settle(); await go('Play', 'Sheet');
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
    await page.reload(); await settle();
    for (const t of ['sheet', 'build', 'trad', 'skills', 'talents', 'picks', 'comp', 'gear', 'mods', 'acts', 'save']) await page.evaluate(tt => { const b = document.querySelector('#tabbar [data-tab="' + tt + '"]'); if (b) b.click(); }, t);
    check('opens with ' + what, (await page.innerText('#cname')).trim() + (errors.length > before ? ' + errors' : ''), 'Damaged');
  }

  console.log('Review fixes');
  {
    /* DR text is escaped on the sheet and in print (it reaches other people through share links and parties) */
    await page.evaluate(() => { const id = 'zz-xss'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Xss', levels: [], classes: {},
      dr: [{ val: '5', bypass: '<img src=x onerror="window.__xss=1">', src: '<b id="xssb">S</b>' }] })); localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); });
    await page.reload(); await settle();
    await page.evaluate(() => { const b = document.querySelector('#tabbar [data-tab="sheet"]'); if (b) b.click(); }); await settle();
    const dr = await tile('DR').catch(() => 'no tile');
    check('DR text shows as text, not markup', dr + ' ' + await page.evaluate(() => !!window.__xss || !!document.getElementById('xssb')), '5/<img src=x onerror="window.__xss=1"> false');
    await page.evaluate(() => { window.print = () => {}; const b = document.createElement('button'); b.dataset.a = 'print'; document.getElementById('main').appendChild(b); b.click(); }); await until('the print view', () => document.getElementById('printView').textContent.length > 0); await settle();
    check('…and in the print view', await page.evaluate(() => !!window.__xss || !!document.querySelector('#printView img') || !/<img src=x/.test(document.getElementById('printView').textContent)), false);

    /* a fake account, for the cloud fixes */
    const ex = async k => { const cx = await newCtx(), p = await cx.newPage(); await p.goto(FILE); await settle(p); await p.click(`button[data-k="${k}"]`); await settle(p);
      const c = await p.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last'))))); await cx.close(); return c; };
    const A = await ex('striker'), B = await ex('incanter');
    const cloudPage = async (signedIn, theirs) => { const cx = await newCtx(), p = await cx.newPage(); p.on('pageerror', e => errors.push(e.message));
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
    await p.goto(FILE + '?share=theirs12345'); await settle(p);
    await toBuild(p); await settle(p); await p.fill('[data-f="name"]', 'Tova Edited'); await p.press('[data-f="name"]', 'Tab'); await settle(p);
    await p.evaluate(() => window.dispatchEvent(new Event('sheet-cloud-ready'))); await p.waitForTimeout(4800); /* kept: the check is that nothing was saved, and the page's own timers (cloud save about 1.2 s, History 4 s) must have had time to run */
    check('a viewed share link isn’t saved into your characters', await p.evaluate(() => (document.getElementById('cname').textContent || '') + ' ' + Object.keys(localStorage).some(k => /theirs12345/.test(k))), 'Their Char false');
    await cx.close();

    /* switching characters while a save is on its way still sends the one you edited */
    [cx, p] = await cloudPage(true, null);
    await p.goto(FILE); await settle(p); await p.evaluate(() => window.dispatchEvent(new Event('sheet-cloud-ready'))); await settle(p);
    await toBuild(p); await settle(p); await p.fill('[data-f="name"]', 'A edited'); await p.press('[data-f="name"]', 'Tab'); await settle(p);
    await clickA(p, 'openChar', B.id); await until('the edit to reach the fake account (the page waits about 1.2 s, the fake account 1.5 s)', id => !!window.__store[id] && JSON.parse(window.__store[id].json).name === 'A edited', A.id, p, 20000);
    check('an edit made mid-save reaches the account after switching characters', await p.evaluate(id => window.__store[id] && JSON.parse(window.__store[id].json).name, A.id), 'A edited');
    await cx.close();

    /* closing “Two saves found” without choosing keeps the newer copy */
    const fs = require('fs'), os = require('os');
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-')), 'saved.html');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
    const emb = Object.assign(JSON.parse(JSON.stringify(A)), { name: 'File copy', savedAt: 1000 });
    fs.writeFileSync(tmp, html.replace(/(<script type="application\/json" id="savedState">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(emb).replace(/</g, '\\u003c') + b));
    const cx2 = await newCtx(), p2 = await cx2.newPage(); p2.on('pageerror', e => errors.push(e.message));
    await p2.addInitScript(c => { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', 1); localStorage.setItem('spheres-sheet-v1:' + c.id, JSON.stringify(Object.assign(c, { name: 'Browser copy', savedAt: Date.now() }))); } }, JSON.parse(JSON.stringify(A)));
    await p2.goto('file://' + tmp); await untilDialog(p2);
    const asked = await p2.locator('.dlg-back').count();
    check('“Two saves found” shows both copies side by side', /File copy[\s\S]*Browser copy/.test(await p2.locator('.dlg table').innerText().catch(() => '')) && /Hit points/.test(await p2.locator('.dlg table').innerText().catch(() => '')), true);
    await p2.keyboard.press('Escape'); await settle(p2);
    check('closing “Two saves found” keeps the newer copy', asked + ' ' + (await p2.innerText('#cname')).trim() + ' ' + await p2.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)).name, A.id), '1 Browser copy Browser copy');
    /* the same character again, differing only in when it was saved: no question */
    const same = await p2.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)), A.id); same.savedAt = 1000;
    fs.writeFileSync(tmp, html.replace(/(<script type="application\/json" id="savedState">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(same).replace(/</g, '\\u003c') + b));
    const p2c = await cx2.newPage(); await p2c.goto('file://' + tmp); await untilText('the character', '#cname', /Browser copy/, p2c); await p2c.waitForTimeout(300); /* kept: the check is that no question appears, and it would appear a moment after the page loads */
    check('a saved file that matches this browser’s copy opens without asking', [await p2c.locator('.dlg-back').count(), (await p2c.innerText('#cname')).trim()].join(' '), '0 Browser copy');
    await p2c.close();

    /* a damaged character inside a saved file opens instead of leaving a blank page */
    emb.levels = [{ picks: 'y' }]; emb.id = { a: 1 };
    fs.writeFileSync(tmp, html.replace(/(<script type="application\/json" id="savedState">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(emb).replace(/</g, '\\u003c') + b));
    const p3 = await cx2.newPage(); p3.on('pageerror', e => errors.push(e.message)); await p3.goto('file://' + tmp); await untilText('the character', '#cname', /File copy/, p3);
    check('a damaged character in a saved file still opens', (await p3.innerText('#cname')).trim(), 'File copy');
    await cx2.close(); fs.rmSync(path.dirname(tmp), { recursive: true, force: true });

    /* changed on this device and, separately, in the account: ask instead of overwriting this device's copy */
    const conflict = async (syncedAt) => { const cx = await newCtx(), p = await cx.newPage(); p.on('pageerror', e => errors.push(e.message));
      await p.addInitScript(([A, syncedAt]) => { const K = 'spheres-sheet-v1'; if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', 1); localStorage.clear();
        localStorage.setItem(K + ':' + A.id, JSON.stringify(Object.assign({}, A, { name: 'Device', savedAt: 2000 }))); localStorage.setItem(K + ':last', JSON.stringify(A.id));
        localStorage.setItem('spheres-sheet-sync', JSON.stringify({ ['u1/' + A.id]: syncedAt }));
        const store = { [A.id]: { json: JSON.stringify(Object.assign({}, A, { name: 'Account' })), savedAt: 3000 } }; window.__store = store;
        window.SheetCloud = { redirectResult: () => Promise.resolve(null), onUser: cb => setTimeout(() => cb({ uid: 'u1', name: 'Pat', email: 'p@x' }), 0), current: () => ({ uid: 'u1' }),
          list: () => Promise.resolve(Object.keys(store).map(id => ({ id, name: JSON.parse(store[id].json).name, savedAt: store[id].savedAt, meta: {} }))), get: id => Promise.resolve(store[id] || null),
          put: (id, rec) => { store[id] = rec; return Promise.resolve({ size: 1 }); }, partiesMine: () => Promise.resolve([]) }; }, [A, syncedAt]);
      await p.goto(FILE); await settle(p); await p.evaluate(() => window.dispatchEvent(new Event('sheet-cloud-ready'))); await until('the question or the account copy', () => !!document.querySelector('.dlg h2') || /Account/.test(document.getElementById('cname').textContent), null, p); await settle(p); return [cx, p]; };
    [cx, p] = await conflict(1000);
    const askedC = await p.locator('.dlg h2', { hasText: 'Changed in two places' }).count();
    await p.click('.dlg button:has-text("Keep both")'); await settle(p);
    check('changed in two places: asks, and “Keep both” keeps both', [askedC, (await p.innerText('#cname')).trim(), await p.evaluate(() => Object.keys(localStorage).map(k => { try { return JSON.parse(localStorage.getItem(k)).name; } catch (e) { return ''; } }).includes('Device (this device)'))].join(' '), '1 Account true');
    await cx.close();
    [cx, p] = await conflict(2000);
    check('unchanged here since the last save: the newer account copy just loads', [await p.locator('.dlg').count(), (await p.innerText('#cname')).trim()].join(' '), '0 Account');
    await cx.close();

    /* importing a damaged file says so instead of failing silently */
    await page.evaluate(() => { const b = document.createElement('button'); b.dataset.a = 'importJson'; document.getElementById('main').appendChild(b); b.click(); }); await settle();
    await page.fill('.dlg textarea[name="j"]', JSON.stringify({ app: 'spheres-sheet', id: 'toString', name: 'Imported', levels: [{ picks: 'y' }] }));
    await page.click('.dlg button:has-text("Import")'); await settle();
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
    check('class list: Conscript, bonus talent at odd levels (like Incanter)', pick(lib('Conscript'), 'mart', 'tx'), 'expert/odd');
    check('class list: Raveler, bonus talent at even levels', pick(lib('Raveler'), 'tal', 'tx'), '1/even');
    check('class list: Professional, bonus talent at 1st and every 4', pick(lib('Professional'), 'tx'), 'f4');
    check('class list: Advisor and Scholar, 2 bonus talents at 1st', [pick(lib('Advisor'), 'bt'), pick(lib('Scholar'), 'bt')].join(' '), '2 2');

    /* the talent totals those settings give (Talents used tile: 0 / total, incl. the 2 bonus magic talents for casters) */
    const cases = [
      ['Troubadour 20', { cast: 'low', martial: 'proficient', talents: '0.5', talx: 'm5' }, 20, 16],
      ['Troubadour 4', { cast: 'low', martial: 'proficient', talents: '0.5', talx: 'm5' }, 4, 4],
      ['Thaumaturge 20', { cast: 'high', talents: '0.5' }, 20, 12],
      ['Incanter 13', { cast: 'high', talents: 'auto', talx: 'odd' }, 13, 22],
      ['Mageknight 1', { cast: 'low', talents: 'auto', bonusTalents: 1 }, 1, 3],
      ['Hive 5', { cast: 'mid', talents: '0.5up', prestige: true }, 5, 5],
      ['Magemage 5', { cast: 'low', talents: '1', prestige: true }, 5, 7],
      ['Conscript 3', { martial: 'expert', talents: 'auto', talx: 'odd' }, 3, 5],
      ['Conscript 20', { martial: 'expert', talents: 'auto', talx: 'odd' }, 20, 30],
      ['Raveler 4', { cast: 'mid', talents: '1', talx: 'even' }, 4, 8],
      ['Professional-style 9 (1st, 5th, 9th)', { martial: 'expert', talents: 'auto', talx: 'f4' }, 9, 12]];
    for (const [what, k, n, want] of cases) {
      await page.evaluate(([k, n]) => { const id = 'zz-cls'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Cls', classes: { c1: Object.assign({ name: 'C', hd: 8, bab: '3/4', good: ['will'], skills: 4 }, k) },
        levels: Array.from({ length: n }, () => ({ cls: 'c1', hp: 5, picks: [] })) })); localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [k, n]);
      await page.reload(); await settle(); await go('Character', 'Talents');
      check('talents: ' + what, (await tile('Talents used')).replace(/^\d+ \/ /, ''), String(want));
    }
  }

  console.log('Stacking');
  {
    const mk = (mods, extra) => page.evaluate(([mods, extra]) => { const id = 'zz-stk'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify(Object.assign({ app: 'spheres-sheet', v: 1, id, name: 'Stk', classes: {}, levels: [],
      mods: mods.map((m, i) => Object.assign({ id: 'm' + i, type: 'untyped', when: 'always', group: '' }, m)) }, extra || {}))); localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [mods, extra]);
    const show = async () => { await page.reload(); await settle(); await go('Play', 'Sheet'); };
    await mk([{ src: 'New modifier', target: 'saves', val: '2' }, { src: 'New modifier', target: 'saves', val: '1' }]); await show();
    check('two unnamed untyped modifiers both count', await tile('Will'), '+3');
    await mk([{ src: 'Bless', target: 'saves', val: '2' }, { src: 'Bless', target: 'saves', val: '1' }]); await show();
    check('the same named source still counts once', await tile('Will'), '+2');
    await mk([{ src: 'Enlarge Person', target: 'size', val: '1' }, { src: 'Size Change', target: 'size', val: '1', type: 'size' },
      { src: 'Enlarge Person', target: 'str', val: '2', type: 'size' }, { src: 'Size Change', target: 'str', val: '2', type: 'size' },
      { src: 'Enlarge Person', target: 'dex', val: '-2', type: 'size' }, { src: 'Size Change', target: 'dex', val: '-2', type: 'size' }]); await show();
    check('two size increases: one size larger, one Str bonus, one Dex penalty (AC 10 −1 Dex −1 size)', [await tile('Str'), await tile('Dex'), await tile('AC')].join(' '), '12 8 8');
    await mk([{ src: 'Enlarge Person', target: 'size', val: '1' }, { src: 'Reduce Person', target: 'size', val: '-1' }]); await show();
    check('a size increase and decrease cancel', await tile('AC'), '10');
    await mk([{ src: 'Racial', target: 'sr', val: '17', type: 'racial' }, { src: 'Spell Resistance spell', target: 'sr', val: '22' }, { src: 'R2', target: 'dr', val: '2' }, { src: 'R3', target: 'dr', val: '3' }]); await show();
    check('spell resistance and DR/— take the best, not the sum', [await tile('SR'), await tile('DR')].join(' '), '22 3/—');
    await mk([{ src: 'Power: bonus', target: 'saves', val: '1' }],
      { tempSrc: [{ id: 't1', name: 'Source', slots: '1', on: false }], extraPicks: [{ kind: 'talent', name: 'Power', sphere: 'Destruction', tkind: 'magic', temp: 't1' }, { kind: 'feat', name: 'Power Attack' }],
        actions: [{ id: 'a1', name: 'Power Attack', act: 'free' }, { id: 'a2', name: 'Power blast', act: 'standard' }] }); await show();
    const greyed = async n => page.locator('.act', { hasText: n }).first().locator('[data-a="useAct"]').isDisabled();
    check('a temporary talent that’s off pauses “Power: bonus” and “Power blast”, not the Power Attack feat’s action', [await tile('Will'), await greyed('Power blast'), await greyed('Power Attack')].join(' '), '+0 true false');
    await mk([{ src: 'Half', target: 'saves', val: '.5*4' }, { src: 'Half2', target: 'saves', val: 'half of close' }]); await show();
    check('formulas: “.5*4” and “half of close” (25 ft at CL 0)', await tile('Will'), '+14');
    await mk([], { conds: { Sickened: true, Nauseated: true } }); await show();
    check('Nauseated doesn’t hide Sickened’s −2', await tile('Will'), '−2');
  }

  console.log('CMD and AC modifiers');
  {
    const mk = (mods, extra) => page.evaluate(([mods, extra]) => { const id = 'zz-cmd'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify(Object.assign({ app: 'spheres-sheet', v: 1, id, name: 'Cmd', classes: {}, levels: [],
      mods: mods.map((m, i) => Object.assign({ id: 'm' + i, type: 'untyped', when: 'always', group: '' }, m)) }, extra || {}))); localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [mods, extra]);
    const show = async () => { await page.reload(); await settle(); await go('Play', 'Sheet'); };
    await mk([]); await show();
    check('CMD baseline: AC 10, CMD 10', [await tile('AC'), await tile('CMD')].join(' '), '10 10');
    await mk([{ src: 'Lucky charm', target: 'ac', val: '2' }]); await show();
    check('an untyped +2 AC bonus raises AC but not CMD', [await tile('AC'), await tile('CMD')].join(' '), '12 10');
    await page.locator('.tile', { has: page.locator('.k', { hasText: /^CMD$/ }) }).first().click(); await settle();
    const wtxt = await page.evaluate(() => (document.querySelector('.why') || {}).innerText || '');
    check('the CMD breakdown names the untyped AC bonus left out', /Not counted: Lucky charm/.test(wtxt), 'true');
    await page.keyboard.press('Escape'); await settle();
    await mk([{ src: 'Ward', target: 'ac', val: '2', type: 'deflection' }]); await show();
    check('a deflection +2 AC bonus raises both AC and CMD', [await tile('AC'), await tile('CMD')].join(' '), '12 12');
    await mk([{ src: 'Aura', target: 'ac', val: '2', type: 'sacred' }]); await show();
    check('a sacred +2 AC bonus raises both AC and CMD', [await tile('AC'), await tile('CMD')].join(' '), '12 12');
    await mk([{ src: 'Hex', target: 'ac', val: '-2' }]); await show();
    check('an untyped −2 AC penalty lowers both AC and CMD', [await tile('AC'), await tile('CMD')].join(' '), '8 8');
    await mk([{ src: 'Jinx', target: 'ac', val: '-2', type: 'luck' }, { src: 'Crush', target: 'ac', val: '-1', type: 'armor' }]); await show();
    check('AC penalties of any type lower CMD', [await tile('AC'), await tile('CMD')].join(' '), '7 7');
    await mk([{ src: 'Agile', target: 'dex', val: '4' }], { conds: { Stunned: true } }); await show();
    check('Stunned (−2 AC, loses Dex): CMD 10 + 0 (Dex bonus lost) − 2', await tile('CMD'), '8');
    await mk([{ src: 'Agile', target: 'dex', val: '4' }]); await show();
    check('same character not stunned: CMD 10 + 2 Dex', await tile('CMD'), '12');
  }

  console.log('Undo, redo and importing');
  {
    const K = 'spheres-sheet-v1';
    const fresh = async () => { await page.evaluate(K => { localStorage.clear(); const id = 'zz-imp'; localStorage.setItem(K + ':' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Imp', savedAt: 5000, classes: {}, levels: [] })); localStorage.setItem(K + ':last', JSON.stringify(id)); }, K); await page.reload(); await settle(); };
    const act = a => page.evaluate(a => { const b = document.createElement('button'); b.dataset.a = a; document.getElementById('main').appendChild(b); b.click(); }, a);
    const name = async () => (await page.innerText('#cname')).trim();
    await fresh(); await go('Character', 'Build');
    await page.fill('[data-f="name"]', 'Imp Two'); await page.press('[data-f="name"]', 'Tab'); await settle();
    await page.fill('[data-f="name"]', 'Imp Three'); await page.press('[data-f="name"]', 'Tab'); await settle();
    check('Undo shows how many steps it can go back', (await page.locator('#undoBtn').innerText()).replace(/\s+/g, ' ').trim(), 'Undo 2');
    await page.click('#undoBtn'); await settle();
    check('undo, then a Redo button appears', [await name(), (await page.locator('#redoBtn').innerText()).replace(/\s+/g, ' ').trim()].join(' | '), 'Imp Two | Redo 1');
    await page.click('#redoBtn'); await settle();
    check('Redo puts the change back', [await name(), await page.locator('#redoBtn').count()].join(' '), 'Imp Three 0');
    await page.locator('h1').click(); await page.keyboard.press('Control+z'); await settle(); await page.keyboard.press('Control+y'); await settle();
    check('Ctrl+Z then Ctrl+Y', await name(), 'Imp Three');
    await page.keyboard.press('Control+z'); await settle();
    await page.fill('[data-f="name"]', 'Imp Four'); await page.press('[data-f="name"]', 'Tab'); await settle();
    check('a new edit after undo clears Redo', await page.locator('#redoBtn').count(), '0');

    const paste = async text => { await act('importJson'); await settle(); await page.evaluate(t => { document.querySelector('.dlg textarea[name="j"]').value = t; }, text); await page.click('.dlg button:has-text("Import")'); await settle(); };
    const alertText = async () => { const t = (await page.locator('.dlg').last().innerText().catch(() => '')).replace(/\s+/g, ' '); await page.locator('.dlg button:has-text("OK")').last().click().catch(() => {}); await settle(); return t; };
    await paste('{"app":"spheres-sheet",\n"name": "X",,}');
    check('a broken file says where (line)', /isn’t a valid file.*line 2/.test(await alertText()), true);
    await paste('{"app":"someone-else","name":"X"}');
    check('a file from something else says what it says it is', /“someone-else”/.test(await alertText()), true);
    await paste('[1,2]');
    check('a list instead of a character says so', /holds a list, not a character/.test(await alertText()), true);
    await paste(JSON.stringify({ app: 'spheres-sheet', v: 1, id: 'zz-rep', name: 'Repaired', classes: {}, levels: [{ cls: '' }, null, 7], mods: 'oops' }));
    const toastT = await page.locator('#toast').innerText().catch(() => '');
    check('repairs made while importing are reported', [await name(), /levels: 2 damaged rows left out.*mods: wasn’t the right kind/.test(toastT) || toastT].join(' '), 'Repaired true');

    /* the same character again: compare, then Replace or Keep both */
    const again = JSON.stringify({ app: 'spheres-sheet', v: 1, id: 'zz-imp', name: 'Imp From File', savedAt: 9e12, classes: {}, levels: [] });
    await paste(again);
    const cmp = await page.locator('.dlg').last().innerText().catch(() => '');
    check('importing a character already in the list asks, showing both', [/Already in your characters/.test(cmp), /Imp From File[\s\S]*Imp Four/.test(cmp), /Replace \(the file’s is newer\)/.test(cmp)].join(' '), 'true true true');
    await page.click('.dlg button:has-text("Replace")'); await settle();
    const ids = async () => page.evaluate(K => Object.keys(localStorage).filter(k => k.startsWith(K + ':') && !/:(last|tab)$/.test(k)).map(k => JSON.parse(localStorage.getItem(k)).name).sort().join(','), K);
    check('Replace swaps it in, without a second copy', [await name(), await ids()].join(' | '), 'Imp From File | Imp From File,Repaired');
    await paste(again); await page.click('.dlg button:has-text("Keep both")'); await settle();
    check('Keep both adds a copy', [await name(), await ids()].join(' | '), 'Imp From File (imported) | Imp From File,Imp From File (imported),Repaired');

    /* a sheet saved as a file (.html) imports the character inside it */
    const fs = require('fs');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
    const saved = html.replace(/(<script type="application\/json" id="savedState">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify({ app: 'spheres-sheet', v: 1, id: 'zz-html', name: 'From HTML <b>', classes: {}, levels: [] }).replace(/</g, '\\u003c') + b);
    await paste(saved);
    check('a saved .html sheet imports its character', await name(), 'From HTML <b>');
    await paste(html);
    check('an empty saved sheet says so', /saved before a character was made/.test(await alertText()), true);

    /* dropping a file on the page */
    const drop = (text, fname) => page.evaluate(([text, fname]) => { const dt = new DataTransfer(); dt.items.add(new File([text], fname, { type: 'application/json' }));
      document.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      const shown = document.body.classList.contains('dropping');
      document.getElementById('main').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return shown; }, [text, fname]);
    const shown = await drop(JSON.stringify({ app: 'spheres-sheet', v: 1, id: 'zz-drop', name: 'Dropped', classes: {}, levels: [] }), 'dropped.json'); await until('the dropped character', () => /Dropped/.test(document.getElementById('cname').textContent)); await settle();
    check('dropping a file shows the drop area and imports it', [shown, await name(), await page.evaluate(() => document.body.classList.contains('dropping'))].join(' '), 'true Dropped false');
    await drop('not json', 'x.json'); await untilDialog();
    check('dropping something that isn’t a character says why', /isn’t a valid file/.test(await alertText()), true);
  }

  console.log('Copies, unsent changes and the party dashboard');
  {
    const ex = async k => { const cx = await newCtx(), p = await cx.newPage(); await p.goto(FILE); await settle(p); await p.click(`button[data-k="${k}"]`); await settle(p);
      const c = await p.evaluate(() => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + JSON.parse(localStorage.getItem('spheres-sheet-v1:last'))))); await cx.close(); return c; };
    const A = await ex('striker');
    /* a fake account: opts.cloud = {id: {name, savedAt}}, opts.failPuts = how many saves fail first, opts.members = party members */
    const fake = async (opts, url) => { const cx = await newCtx({ viewport: { width: 1280, height: 1000 } }), p = await cx.newPage(); p.on('pageerror', e => errors.push(e.message));
      /* set up once per test page: the "done" mark lives in localStorage (what a reload must keep), not sessionStorage,
         which file:// pages don't reliably keep across a reload */
      await p.addInitScript(([A, opts]) => { const K = 'spheres-sheet-v1'; if (!localStorage.getItem('__testInit')) { localStorage.clear(); localStorage.setItem('__testInit', '1');
          if (opts.local) { localStorage.setItem(K + ':' + A.id, JSON.stringify(Object.assign({}, A, opts.local))); localStorage.setItem(K + ':last', JSON.stringify(A.id)); } }
        const store = {}; Object.keys(opts.cloud || {}).forEach(id => { store[id] = { json: JSON.stringify(Object.assign({}, A, opts.cloud[id])), savedAt: opts.cloud[id].savedAt, name: opts.cloud[id].name }; });
        let fails = opts.failPuts || 0; window.__puts = 0;
        window.SheetCloud = { redirectResult: () => Promise.resolve(null), onUser: cb => setTimeout(() => cb(opts.signedOut ? null : { uid: 'u1', name: 'Pat', email: 'p@x' }), 0), current: () => opts.signedOut ? null : ({ uid: 'u1' }),
          list: () => Promise.resolve(Object.keys(store).map(id => ({ id, name: store[id].name, savedAt: store[id].savedAt, meta: {} }))), get: id => Promise.resolve(store[id] || null),
          put: (id, rec) => { window.__puts++; if (fails > 0) { fails--; return Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' })); } store[id] = Object.assign({}, rec); return Promise.resolve({ size: 1 }); },
          partiesMine: () => Promise.resolve(opts.members ? [{ id: 'gm_P', name: 'Table', gms: ['u1'], owner: 'u1', code: 'c'.repeat(20), gmCode: 'g'.repeat(20) }] : []),
          watchMembers: (pid, cb) => { setTimeout(() => cb(opts.members.map(m => Object.assign({}, m, { updatedAt: Date.now() - (m.ageMin || 0) * 60000 }))), 0); return () => {}; },
          shareGet: () => Promise.resolve({ json: JSON.stringify(Object.assign({}, A, { id: 'theirs000', name: 'Their Hero' })), savedAt: 1000 }) }; }, [A, opts]);
      await p.goto(FILE + (url || '')); await settle(p); await p.evaluate(() => window.dispatchEvent(new Event('sheet-cloud-ready'))); await settle(p); return [cx, p]; };
    const act = (p, a, ds) => p.evaluate(([a, ds]) => { const b = document.createElement('button'); b.dataset.a = a; Object.assign(b.dataset, ds || {}); document.getElementById('main').appendChild(b); b.click(); }, [a, ds]);

    /* Save a copy to my characters, from a share link */
    let [cx, p] = await fake({ signedOut: true }, '?share=theirs000');
    await until('the shared sheet', () => !!document.querySelector('[data-a="roCopy"]'), null, p); const roBtn = await p.locator('[data-a="roCopy"]').count();
    await p.click('[data-a="roCopy"]'); await settle(p);
    const stored = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('spheres-sheet-v1:') && !/:(last|tab)$/.test(k)).map(k => JSON.parse(localStorage.getItem(k))));
    check('a shared sheet can be saved as your own copy', [roBtn, (await p.innerText('#cname')).trim(), await p.locator('.tag', { hasText: 'Read-only' }).count(), stored.length, stored[0] && stored[0].id !== 'theirs000', stored[0] && !stored[0].share && (stored[0].parties || []).length === 0].join(' '), '1 Their Hero (copy) 0 1 true true');
    await cx.close();

    /* this device is ahead of the account: a tag and Send now */
    [cx, p] = await fake({ local: { name: 'Tova', savedAt: 9e12 }, cloud: { [A.id]: { name: 'Tova', savedAt: 1000 } }, failPuts: 99 });
    await act(p, 'home'); await until('the failed save to show Retry', () => { const b = document.getElementById('cloudRetry'); return !!b && b.offsetParent !== null; }, null, p); await settle(p);
    const row = p.locator('.charrow', { hasText: 'Tova' }).first();
    check('a character with changes the account doesn’t have is marked', [await row.locator('.tag', { hasText: 'Not yet in your account' }).count(), await row.locator('[data-a="uploadChar"]', { hasText: 'Send now' }).count()].join(' '), '1 1');
    check('…and the save that failed offers Retry', [await p.locator('#cloudRetry').isVisible(), /Couldn|offline|unavailable/i.test(await p.locator('#cloudStat').innerText())].join(' '), 'true true');
    await p.evaluate(() => { window.SheetCloud.put = (id, rec) => { window.__puts++; return Promise.resolve({ size: 1 }); }; });
    await p.click('#cloudRetry'); await untilText('the save to go through', '#cloudStat', /Saved to your account/, p); await settle(p);
    check('Retry sends it, and the warning goes', [await p.locator('#cloudRetry').isVisible(), (await p.locator('#cloudStat').innerText()).trim()].join(' | '), 'false | Saved to your account');
    await cx.close();
    [cx, p] = await fake({ local: { name: 'Tova', savedAt: 9e12 }, cloud: { [A.id]: { name: 'Tova', savedAt: 1000 } } });
    await act(p, 'home'); await untilText('the unsent changes to go to the account', '#cloudStat', /Saved to your account/, p); await settle(p);
    check('once it has been sent, no mark', await p.locator('.charrow .tag', { hasText: 'Not yet in your account' }).count(), '0');
    await cx.close();

    /* the GM's dashboard: sort, compact view, "not live" */
    const members = [
      { key: 'u2_a', name: 'Aldo', player: 'Ann', hp: { cur: 30, max: 30 }, ac: 15, init: 1, ageMin: 1 },
      { key: 'u3_b', name: 'Bree', player: 'Bob', hp: { cur: 5, max: 40 }, ac: 17, init: 4, ageMin: 2 },
      { key: 'u4_c', name: 'Cass', player: 'Cy', hp: { cur: 20, max: 40 }, ac: 12, init: 9, ageMin: 25 }];
    [cx, p] = await fake({ members }, '?beta');
    await act(p, 'partyOpen', { id: 'gm_P' }); await until('the party members', () => document.querySelectorAll('.pcard').length === 3, null, p); await settle(p);
    const order = () => p.$$eval('.pcard', cs => cs.map(c => (c.querySelector('h2,b') || {}).textContent).join(','));
    check('dashboard: sorted by name first', await order(), 'Aldo,Bree,Cass');
    await p.click('[data-a="partySort"][data-k="hp"]'); await settle(p);
    check('dashboard: “Most hurt” first', await order(), 'Bree,Cass,Aldo');
    await p.click('[data-a="partySort"][data-k="init"]'); await settle(p);
    check('dashboard: by initiative', await order(), 'Cass,Bree,Aldo');
    check('dashboard: a sheet not updated for 25 minutes is marked “not live”', [await p.locator('.pcard.stale').count(), await p.locator('.pcard.stale', { hasText: 'Cass' }).count()].join(' '), '1 1');
    await p.click('[data-a="partyCompact"]'); await settle(p);
    check('dashboard: compact view', [await p.locator('.pgrid.compact .pcard.compact').count(), await p.locator('.pcard .ptiles').count()].join(' '), '3 0');
    /* remembered: the choice is saved in this browser, and the dashboard draws from what's saved. (No page reload here:
       headless Chromium doesn't reliably keep a file:// page's storage across a reload; the real https site does.) */
    const saved = await p.evaluate(() => localStorage.getItem('spheres-party-view'));
    await act(p, 'home'); await settle(p);
    await p.evaluate(() => localStorage.setItem('spheres-party-view', JSON.stringify({ sort: 'hp', compact: false })));
    await act(p, 'partyOpen', { id: 'gm_P' }); await p.waitForFunction(() => document.querySelectorAll('.pcard').length === 3, null, { timeout: 10000 }).catch(() => {});
    check('dashboard: the sort and the view are saved, and reopening uses what’s saved', [saved, await order(), await p.locator('.pgrid.compact').count()].join(' '), '{"sort":"init","compact":true} Bree,Cass,Aldo 0');
    await cx.close();
  }

  console.log('Trade traditions and multiclassing');
  {
    const mk = (classes, lv, trade) => page.evaluate(([classes, lv, trade]) => { const id = 'zz-trade'; localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Trader',
      classes, levels: lv.map(c => ({ cls: c, hp: 5, picks: [] })), traditions: { trade: Object.assign({ on: true, rank: 'competent', replace: true, skills: [] }, trade) } }));
      localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [classes, lv, trade]);
    const K = (name, skills) => ({ name, hd: 8, bab: '3/4', good: ['will'], skills, talents: 'none' });
    const tradeNote = async () => { await go('Character', 'Traditions'); return (await page.locator('section.card', { hasText: 'Trade rank' }).first().innerText()).replace(/\s+/g, ' '); };
    await mk({ a: K('Rogue', 8) }, ['a', 'a', 'a']); await page.reload(); await settle();
    await go('Character', 'Talents'); const one = (await tile('Talents used')).replace(/^\d+ \/ /, '');
    check('one class: no extra trade talent; a class with 8 + Int ranks suggests adroit', [one, /trade rank adroit: Rogue has 8 \+ Int/i.test(await tradeNote())].join(' '), '0 true');
    await page.click('[data-a="tradeRankSet"][data-k="adroit"]'); await settle();
    check('“Set it to adroit” sets it', /Trade rank adroit: Rogue has 8/.test(await tradeNote()), true);
    await mk({ a: K('Fighter', 2), b: K('Rogue', 8), c: K('Wizard', 2) }, ['a', 'a', 'b', 'c', 'b']); await page.reload(); await settle();
    await go('Character', 'Talents');
    check('each class after the first gives a trade talent (2 here)', (await tile('Talents used')).replace(/^\d+ \/ /, ''), '2');
    check('…and a later class with more skill ranks raises the trade rank to adroit', /adroit: Rogue has more skill ranks per level \(8\) than Fighter \(2\)/.test(await tradeNote()), true);
    await mk({ a: K('Fighter', 2), b: K('Rogue', 8) }, ['a', 'b'], { replace: false }); await page.reload(); await settle();
    await go('Character', 'Talents');
    check('a trade tradition that keeps class lists gives no multiclass talents', (await tile('Talents used')).replace(/^\d+ \/ /, ''), '0');
  }

  console.log('House rule: companion limits and packs');
  {
    const skel = (id, name, extra) => Object.assign({ id, name, kind: 'undead', on: true, hd: '2', abil: { str: 15, dex: 14, con: 10, int: 10, wis: 10, cha: 10 }, attacks: [{ name: 'Claw', kind: 'primary', ab: 'str', dice: '1d4' }] }, extra || {});
    /* a new id each time: the open sheet saves its own copy as the page unloads, which would overwrite a test character with the same id */
    let cid = '', nCid = 0;
    const mk = (lv, comps, rules) => page.evaluate(([lv, comps, rules, id]) => { localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Leader',
      classes: { c1: { name: 'Hero', hd: 8, bab: '3/4', good: ['will'], skills: 4, talents: 'none' } }, levels: Array.from({ length: lv }, () => ({ cls: 'c1', hp: 5, picks: [] })), companions: comps, rules: Object.assign({ maxFirst: true, compLimit: true }, rules || {}) }));
      localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [lv, comps, rules, cid = 'zz-comp' + (++nCid)]);
    const stored = () => page.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)), cid);
    const capLine = async label => { const li = page.locator('#main .li', { hasText: label }).first(); const t = (await li.count()) ? await li.innerText().catch(() => '') : ''; const m = /(\d+)\s*\/\s*(\d+)\s*$/.exec(t.replace(/\s+/g, ' ').trim()); return m ? m[1] + '/' + m[2] : 'none'; };
    const comps = [{ id: 'k1', name: 'Fido', kind: 'conj', on: true }, { id: 'k2', name: 'Rex', kind: 'conj', on: true },
      skel('s1', 'Bones 1', { pack: 'p1' }), skel('s2', 'Bones 2', { pack: 'p1' }), skel('s3', 'Bones 3', { pack: 'p1' }), { id: 't1', name: 'Wolf', kind: 'tamed', on: true }];
    /* the document's table: level → active, with talents */
    for (const [lv, act, tal] of [[1, 2, 1], [3, 3, 1], [4, 3, 2], [9, 5, 3], [12, 6, 4], [16, 7, 5], [20, 8, 6]]) {
      await mk(lv, [], {}); await page.reload(); await settle(); await go('Character', 'Companions');
      await page.evaluate(() => { const b = document.createElement('button'); b.dataset.a = 'cAdd'; document.getElementById('main').appendChild(b); b.click(); }); await settle();
      check('limits at level ' + lv + ' (table: ' + act + ' active, ' + tal + ' with talents)', [(await capLine('Active companions (2')).split('/')[1], (await capLine('that gain talents')).split('/')[1]].join(' '), act + ' ' + tal);
    }
    await mk(4, comps); await page.reload(); await settle(); await go('Character', 'Companions');
    check('level 4: 2 Conjuration companions (talents) + a pack of 3 skeletons (counts 1) + a wolf = 4 active of 3', [await capLine('Active companions (2'), await capLine('that gain talents'), await capLine('Packs active')].join(' '), '4/3 2/2 1/1');
    check('…over a limit shows red', await page.locator('#main .li', { hasText: 'Active companions (2' }).first().locator('b.bad').count(), '1');
    check('the button reads Active / Not active under the rule', (await page.locator('[data-a="cOn"]').first().innerText()).trim(), 'Active');
    const card = n => page.locator('section.card', { has: page.locator(`input[value="${n}"]`) }).first();
    await card('Bones 2').locator('[data-a="cOn"]').click(); await settle();
    check('switching one pack member switches the whole pack', (await stored()).companions.filter(c => c.pack === 'p1').map(c => c.on).join(','), 'false,false,false');
    await card('Bones 1').locator('[data-a="cOn"]').click(); await settle();
    check('making the pack active again warns that it’s over the limit (and doesn’t block it)', [/Over the companion limits: 4 active of 3/.test(await page.locator('#toast').innerText().catch(() => '')), (await stored()).companions.filter(c => c.pack === 'p1').every(c => c.on)].join(' '), 'true true');
    await card('Wolf').locator('select[data-f$=".talents"]').selectOption('yes'); await settle();
    check('“Gains talents: Yes” on the wolf counts it with talents', await capLine('that gain talents'), '3/2');
    await mk(4, comps.slice(0, 5).concat([skel('s4', 'Bones 4', { pack: 'p1', hd: '3' }), skel('s5', 'Bones 5', { pack: 'p1' }), { id: 'k3', name: 'Ace', kind: 'cohort', on: true, pack: 'p1' }])); await page.reload(); await settle(); await go('Character', 'Companions');
    const warn = await page.locator('#main .li', { hasText: 'Pack 1:' }).first().innerText().catch(() => '');
    check('a pack warns: more than 4, a member with talents, members not identical', [/6 members \(at most 4\)/.test(warn), /gains talents can’t be in a pack/.test(warn), /aren’t identical/.test(warn)].join(' '), 'true true true');
    await mk(10, comps.concat([skel('s6', 'Bones 6', { pack: 'p2' }), skel('s7', 'Bones 7', { pack: 'p3' })])); await page.reload(); await settle(); await go('Character', 'Companions');
    check('10th level: 2 packs allowed (3 here)', await capLine('Packs active'), '3/2');
    await go('Play', 'Sheet');
    const pk = (await page.locator('#main section.card', { hasText: 'Pack 1' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('the Sheet shows a pack as one block: each member’s hit points, the attack once', [/3 × Bones 1/.test(pk), (pk.match(/Claw × 3/g) || []).length, /roll one attack/.test(pk), /Bones 3/.test(pk)].join(' '), 'true 1 true true');
    await mk(10, comps, { packBonus: true }); await page.reload(); await settle(); await go('Play', 'Sheet');
    check('the +2 pack-attack switch shows the bonus on pack attacks', /if 2\+ attack one target/.test(await page.locator('#main').innerText()), true);
    await mk(4, comps, { compLimit: false }); await page.reload(); await settle(); await go('Character', 'Companions');
    check('with the rule off: Present, no limits', [(await page.locator('[data-a="cOn"]').first().innerText()).trim(), await capLine('Active companions (2')].join(' '), 'Present none');
  }

  console.log('Mounts');
  {
    let mid = '', nM = 0;
    const horse = { id: 'h1', name: 'Horse', kind: 'tamed', on: true, hd: '2', size: 'L', speed: '50 ft.', abil: { str: 16, dex: 14, con: 15, int: 2, wis: 12, cha: 6 }, attacks: [{ name: 'Bite', kind: 'primary', ab: 'str', dice: '1d4' }] };
    const mkM = (extra) => page.evaluate(([extra, id]) => { localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify(Object.assign({ app: 'spheres-sheet', v: 1, id, name: 'Rider',
      classes: { c1: { name: 'Hero', hd: 8, bab: 'full', good: ['fort'], skills: 4, talents: 'none' } }, levels: Array.from({ length: 8 }, () => ({ cls: 'c1', hp: 5, picks: [] })), skillRanks: { ride: 8 },
      extraPicks: [{ kind: 'talent', name: 'Armored Mount', sphere: 'Beastmastery', tkind: 'combat' }, { kind: 'talent', name: 'Frenzy Rider', sphere: 'Beastmastery', tkind: 'combat' }], rules: { maxFirst: true, compLimit: true } }, extra)));
      localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [extra, mid = 'zz-mount' + (++nM)]);
    const mcard = () => page.locator('#main section.card', { has: page.locator('h2', { hasText: /^Mount:/ }) }).first();
    const mtile = async k => (await mcard().locator('.tile', { has: page.locator('.k', { hasText: new RegExp('^' + k + '$') }) }).first().locator('.v').innerText()).trim();
    const cmbNow = async () => parseInt(((await page.locator('[data-a="why"][data-k="cmb"]').first().innerText()).match(/CMB\s*([+−-]?\d+)/) || [])[1].replace('−', '-'), 10);
    const bite = async () => (await mcard().locator('.atk', { hasText: 'Bite' }).first().locator('.hit').innerText()).trim();
    await mkM({ companions: [horse, { id: 'k1', name: 'Fido', kind: 'conj', on: true }] }); await page.reload(); await settle();
    await go('Character', 'Companions');
    await page.locator('section.card', { has: page.locator('input[value="Horse"]') }).first().locator('[data-a="cMount"]').click(); await settle();
    check('“Use as mount” makes it your mount', (await page.locator('section.card', { has: page.locator('input[value="Horse"]') }).first().locator('[data-a="cMount"]').innerText()).trim(), 'Your mount');
    await go('Play', 'Sheet');
    const ac0 = +await mtile('AC'), b0 = parseInt(await bite(), 10), cmb0 = await cmbNow();
    check('the Sheet shows a mount card, not mounted yet', [await mcard().count(), (await mcard().locator('[data-a="mountOn"]').innerText()).trim()].join(' '), '1 Not mounted');
    await mcard().locator('[data-a="mountOn"]').click(); await settle();
    const R = +((await mcard().innerText()).match(/Ride ranks (\d+)/) || [])[1];
    check('mounted: Armored Mount adds ½ your Ride ranks to its AC (competence)', [R > 0, +await mtile('AC') - ac0].join(' '), 'true ' + Math.max(1, Math.floor(R / 2)));
    check('…and it shows your speed while riding is the mount’s', /you move at its speed \(50 ft\.\)/.test(await mcard().innerText()), true);
    await mcard().locator('[data-a="mountFrenzy"]').click(); await settle();
    const n = 1 + Math.floor(R / 4);
    check('Frenzy Rider: the mount’s natural attack +N, your CMB −N (N = 1 + 1 per 4 Ride ranks)', [parseInt(await bite(), 10) - b0, await cmbNow() - cmb0].join(' '), n + ' ' + (-n));
    await go('Character', 'Companions');
    const act = async () => { const t = (await page.locator('#main .li', { hasText: 'Active companions (2' }).first().innerText()).replace(/\s+/g, ' '); return (/(\d+ \/ \d+)\s*$/.exec(t) || [])[1]; };
    check('companion limits: a ridden mount that doesn’t gain talents doesn’t count', await act(), '1 / 4');
    await page.locator('section.card', { has: page.locator('input[value="Horse"]') }).first().locator('select[data-f$=".talents"]').selectOption('yes'); await settle();
    check('…one that gains talents does', await act(), '2 / 4');
    await go('Play', 'Sheet'); await mcard().locator('[data-a="mountOn"]').click(); await settle();
    check('dismounting ends Frenzy Rider and the Armored Mount bonus', [+await mtile('AC') - ac0, await cmbNow() - cmb0, await page.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)).mount.frenzy, mid)].join(' '), '0 0 false');
    await go('Character', 'Companions');
    await page.locator('section.card', { has: page.locator('input[value="Horse"]') }).first().locator('[data-a="cDel"]').click(); await settle();
    await page.locator('.dlg button', { hasText: /Remove/ }).last().click().catch(() => {}); await settle();
    check('removing the mount companion clears it as your mount', await page.evaluate(id => 'mount' in JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)), mid), false);
  }

  console.log('Times taken on tradition talents; mass level-up');
  /* wiki text from the local talent files, never the live site (these sections open talent boxes that load it) */
  const localTalents = route => { const f = decodeURIComponent(route.request().url().slice(SITE.length));
    if (!/^[a-z0-9-]+\.json$/.test(f) || !fs.existsSync(path.join(TAL, f))) return route.abort();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(path.join(TAL, f)) }); };
  await page.route(SITE + '**', localTalents);
  {
    let lid = '', nL = 0;
    const mkL = (lv, extra) => page.evaluate(([lv, extra, id]) => { localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify(Object.assign({ app: 'spheres-sheet', v: 1, id, name: 'Lv',
      classes: { c1: { name: 'Hero', hd: 10, bab: 'full', good: ['fort'], skills: 4, martial: 'expert', talents: 'auto' } }, levels: Array.from({ length: lv }, () => ({ cls: 'c1', hp: 6, picks: [] })), rules: { maxFirst: true } }, extra)));
      localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [lv, extra || {}, lid = 'zz-lv' + (++nL)]);
    const stored = () => page.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)), lid);
    /* a tradition talent can be marked as taken more than once */
    await mkL(1, { traditions: { trade: { on: true, rank: 'competent', replace: true, skills: [], grants: [{ id: 'g1', kind: 'talent', name: 'Strongarm', sphere: 'Vocation', tkind: 'skill' }] } } });
    await page.reload(); await settle(); await go('Character', 'Talents');
    const sg = page.locator('details', { has: page.locator('summary', { hasText: 'Strongarm' }) }).first();
    if (!(await sg.evaluate(d => d.open))) await sg.locator('summary').first().click(); await settle();
    await sg.locator('input[data-f$=".n"]').fill('2'); await sg.locator('input[data-f$=".n"]').press('Tab'); await settle();
    check('a talent from a tradition has “Times taken”, and it’s kept', (await stored()).traditions.trade.grants[0].n, '2');
    await go('Character', 'Traditions');
    check('…and shows ×2 on the Traditions tab', /Strongarm\s*×2/.test(await page.locator('#main').innerText()), true);

    /* several levels at once */
    const lvUp = async (cnt, incs) => { await page.click('[data-a="levelUp"]'); await settle(); const d = page.locator('.dlg-back').last();
      await d.locator('input[name="cnt"]').fill(String(cnt)); await d.locator('button', { hasText: 'Next' }).click(); await settle();
      for (const [lv, ab] of incs || []) await d.locator(`select[name="inc${lv - 1}"]`).selectOption(ab);
      const form = (await d.innerText()).replace(/\s+/g, ' '); await d.locator('button', { hasText: 'Next' }).click(); await settle();
      const review = (await page.locator('.dlg-back').last().innerText()).replace(/\s+/g, ' '); return [form, review]; };
    await mkL(3, { rules: { maxFirst: true, hpMethod: 'avgup' } }); await page.reload(); await settle();
    const [form, review] = await lvUp(5, [[4, 'str'], [8, 'con']]);
    check('5 levels from 3rd: the form asks for the increases at 4th and 8th', [/levels, 4 to 8/.test(form), /Level 4: ability increase/.test(form), /Level 8: ability increase/.test(form)].join(' '), 'true true true');
    check('…the review shows what you get and what’s left to choose', [/Level 3 → 8/.test(review), /To choose afterwards:.*talent.*feat.*skill rank/.test(review)].join(' '), 'true true');
    await page.locator('.dlg-back').last().locator('button', { hasText: 'Level up ×5' }).click(); await settle();
    const c = await stored();
    check('Level up ×5 adds 5 levels with their increases, picks left empty', [c.levels.length, c.levels[3].inc, c.levels[7].inc, c.levels.slice(3).every(l => l.picks.length === 0)].join(' '), '8 str con true');
    check('…using the table’s hit points (average rounded up: d10 → 6)', c.levels.slice(3).map(l => l.hp).join(','), '6,6,6,6,6');
    check('…and says what’s left to choose', /Now level 8\..*To choose:/.test(await page.locator('#toast').innerText().catch(() => '')), true);
    await mkL(20, { rules: { maxFirst: true, hpMethod: 'max' } }); await page.reload(); await settle();
    const incs40 = []; for (let lv = 24; lv <= 40; lv += 4) incs40.push([lv, 'dex']);
    const [, rev40] = await lvUp(20, incs40);
    check('20 more levels from 20th (past 20 is fine)', /Level 20 → 40/.test(rev40), true);
    await page.locator('.dlg-back').last().locator('button', { hasText: 'Level up ×20' }).click(); await settle();
    check('…40 levels, maximum hit points each', [(await stored()).levels.length, (await stored()).levels.slice(20).every(l => l.hp === 10)].join(' '), '40 true');
    await mkL(2); await page.reload(); await settle();
    await page.click('[data-a="levelUp"]'); await settle();
    check('level up, a character that has a class: the default is still that class', await page.locator('.dlg-back').last().locator('select[name="cls"]').evaluate(e => !/^__/.test(e.value)), true);
    check('1 level is still the usual step-by-step', [await page.locator('.dlg-back').last().locator('input[name="cnt"]').inputValue(), await (async () => { await page.locator('.dlg-back').last().locator('button', { hasText: 'Next' }).click(); await settle(); return /Hit points rolled/.test(await page.locator('.dlg-back').last().innerText()); })()].join(' '), '1 true');
    await cancelOrEsc(page.locator('.dlg-back').last().locator('button', { hasText: 'Cancel' })); await settle();
  }

  console.log('Level plan');
  {
    let pid = '', nP = 0;
    const mkP = extra => page.evaluate(([extra, id]) => { localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify(Object.assign({ app: 'spheres-sheet', v: 1, id, name: 'Planner',
      classes: { c1: { name: 'Hero', hd: 10, bab: 'full', good: ['fort'], skills: 4, martial: 'expert', talents: 'auto' }, c2: { name: 'Mage', hd: 6, bab: '1/2', good: ['will'], skills: 2, cast: 'high', talents: 'auto' } },
      levels: Array.from({ length: 3 }, () => ({ cls: 'c1', hp: 6, picks: [] })), rules: { maxFirst: true, hpMethod: 'avgup' } }, extra || {})));
      localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [extra || {}, pid = 'zz-plan' + (++nP)]);
    const stored = () => page.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)), pid);
    const dlg = () => page.locator('.dlg-back').last();
    const next = async () => { await dlg().locator('button', { hasText: /^Next$/ }).click(); await settle(); };
    /* plan a level: Hero, one talent typed into the first talent row */
    const planOne = async (talent, sphere) => {
      await page.click('[data-a="planLevel"][data-k="-1"]'); await settle();
      const title = (await dlg().locator('h2').innerText()).trim();
      await next(); if (await dlg().locator('select[name="inc"]').count()) await dlg().locator('select[name="inc"]').selectOption('str'); await next();
      const tr = dlg().locator('.talrow').first(); await tr.locator('.tr-nm').fill(talent); await tr.locator('.tr-sph').fill(sphere); await tr.locator('.tr-nm').press('Tab'); await settle();
      await next(); await next();
      const review = (await dlg().innerText()).replace(/\s+/g, ' ');
      await dlg().locator('button', { hasText: 'Save to plan' }).click(); await settle(); return [title, review]; };
    await mkP(); await page.reload(); await settle();
    await go('Advanced', 'Level plan');
    check('Advanced → Level plan: empty to start', /Nothing planned yet/.test(await page.locator('#main').innerText()), true);
    const [t1, rv1] = await planOne('Bash', 'Brute');
    check('planning level 4 runs the Level up dialog, ending in “Save to plan” with what’s planned', [t1, /Planned:.*Talents.*Bash/.test(rv1), /goes into your level plan/.test(rv1)].join(' | '), 'Plan level 4 | true | true');
    let c = await stored();
    check('…nothing changes on the character; the plan has level 4', [c.levels.length, (c.plan || []).length, (c.plan[0].picks || []).some(p => p.name === 'Bash')].join(' '), '3 1 true');
    check('…the page shows it with a preview', /Level 4 · Hero 4.*Bash.*HP \d+/s.test(await page.locator('#main').innerText()), true);
    await planOne('Brute Strength', 'Brute');
    check('planning another adds level 5 (built on top of level 4)', [(await stored()).plan.length, /Level 5 · Hero 5/.test(await page.locator('#main').innerText())].join(' '), '2 true');
    check('the header still shows the real character (level 3)', /Hero 3/.test(await page.locator('#subline').innerText()), true);
    /* editing a planned level opens it filled in; while it's open nothing of the future copy is saved, even when the tab is hidden */
    await page.click('[data-a="planLevel"][data-k="0"]'); await settle();
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await settle(); const during = await stored();
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });
    await next(); await next();
    const editRow = await dlg().locator('.talrow .tr-nm').first().inputValue().catch(() => '');
    await cancelOrEsc(dlg().locator('button', { hasText: 'Cancel' }).first()); await settle();
    check('editing planned level 4 opens with its talent filled in; nothing is saved meanwhile', [editRow, during.levels.length, during.plan.length].join(' '), 'Bash 3 2');
    check('…and after closing it, the real character is back', [/Hero 3/.test(await page.locator('#subline').innerText()), (await stored()).levels.length].join(' '), 'true 3');

    /* levelling up uses the plan */
    await page.click('[data-a="levelUp"]'); await settle();
    const s0 = (await dlg().innerText()).replace(/\s+/g, ' ');
    check('Level up opens with the plan for level 4', [/Your plan for level 4: Hero 4/.test(s0), /Bash/.test(s0), await dlg().locator('button', { hasText: 'Apply as planned' }).count()].join(' '), 'true true 1');
    await dlg().locator('button', { hasText: 'Apply as planned' }).click(); await settle();
    await next();
    const rvA = (await dlg().innerText()).replace(/\s+/g, ' ');
    check('“Apply as planned”: hit points, then the review with what you’re getting', [/What changes/.test(rvA), /You’re getting:.*Bash/.test(rvA)].join(' '), 'true true');
    await dlg().locator('button', { hasText: /^Level up$/ }).click(); await settle();
    c = await stored();
    check('…level 4 is taken with the planned talent; the plan moves on to level 5', [c.levels.length, c.levels[3].picks.some(p => p.name === 'Bash'), c.plan.length, c.plan[0].picks.some(p => p.name === 'Brute Strength')].join(' '), '4 true 1 true');

    /* mass level-up takes planned levels */
    await page.click('[data-a="levelUp"]'); await settle();
    await dlg().locator('button', { hasText: 'Ignore the plan' }).click(); await settle();
    await dlg().locator('input[name="cnt"]').fill('3'); await next();
    const inc7 = dlg().locator('select[name="inc7"]'); if (await inc7.count()) await inc7.selectOption('str').catch(() => {}); await next();
    check('mass level-up says it’s using the plan', /Using your level plan for level 5/.test(await dlg().innerText()), true);
    await dlg().locator('button', { hasText: 'Level up ×3' }).click(); await settle();
    c = await stored();
    check('…level 5 has the planned talent, the others are empty, and the plan is used up', [c.levels.length, c.levels[4].picks.some(p => p.name === 'Brute Strength'), c.levels[5].picks.length, 'plan' in c].join(' '), '7 true 0 false');

    /* a different class than planned */
    await mkP({ plan: [{ cls: 'c1', fcb: 'hp', inc: '', ranks: {}, feats: '', talents: '', features: '', picks: [] }, { cls: 'c1', fcb: 'hp', inc: '', ranks: {}, feats: '', talents: '', features: '', picks: [] }] }); await page.reload(); await settle();
    await page.click('[data-a="levelUp"]'); await settle();
    await dlg().locator('button', { hasText: 'Step through' }).click(); await settle();
    await dlg().locator('select[name="cls"]').selectOption('c2'); await next();
    const notPlanned = await dlg().innerText();
    check('choosing a class other than the planned one asks: keep or drop the plan', /Not the planned class/.test(notPlanned), true);
    await dlg().locator('button', { hasText: 'Drop the plan' }).click(); await settle();
    await dlg().locator('select[name="inc"]').selectOption('dex'); await next(); await next(); await next();
    await dlg().locator('button', { hasText: /^Level up$/ }).click(); await settle();
    c = await stored();
    check('…“Drop the plan” clears it after the level', [c.levels.length, c.levels[3].cls, 'plan' in c].join(' '), '4 c2 false');
    await go('Advanced', 'Level plan');
    check('the page offers to plan level 5 next', (await page.locator('[data-a="planLevel"][data-k="-1"]').innerText()).trim(), 'Plan level 5');

    /* feat and class feature rows (2026-11-12): bonus feat, notes, a choice under a feature, effects; planned, then taken */
    await mkP({ levels: [{ cls: 'c1', hp: 10, picks: [{ kind: 'feature', name: 'Arsenal Tricks', subs: [] }] }, { cls: 'c1', hp: 6, picks: [] }, { cls: 'c1', hp: 6, picks: [] }] }); await page.reload(); await settle();
    const hp3 = await page.evaluate(id => window.SheetEngine.derive(window.SheetEngine.sanitize(JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)))).hpMax, pid);
    await go('Advanced', 'Level plan');
    await page.click('[data-a="planLevel"][data-k="-1"]'); await settle(); await next(); await dlg().locator('select[name="inc"]').selectOption('str'); await next();
    check('feats: no row and no slot at an even level', [await dlg().locator('.ft-item').count(), (await dlg().locator('#ftleft').innerText()).trim()].join(' | '), '0 | No feat slot this level.');
    await dlg().locator('#ftMore').click(); const ft = dlg().locator('.ft-item').first();
    await ft.locator('.lu-nm').fill('Toughness'); await ft.locator('.ft-kind').selectOption('bonus'); await ft.locator('.lu-notes').fill('+3 hp\n\n+1 per Hit Die past 3');
    await ft.locator('.lu-fx').click(); await ft.locator('.fx-t').selectOption('hp'); await ft.locator('.fx-v').fill('3');
    check('notes are a box for paragraphs that grows with the text', [await ft.locator('.lu-notes').evaluate(t => t.tagName), await ft.locator('.lu-notes').evaluate(t => t.clientHeight > 40)].join(' '), 'TEXTAREA true');
    check('…“Add a feat” adds one; a bonus feat is counted apart', (await dlg().locator('#ftleft').innerText()).trim(), 'No feat slot this level · 1 bonus feat.');
    const x1 = dlg().locator('.xr-item').nth(0);
    check('class features: a choice can go under a feature you have', (await x1.locator('.xr-under option').allInnerTexts()).join(' | '), 'New feature | Choice under Arsenal Tricks');
    await x1.locator('.xr-under').selectOption('Arsenal Tricks'); await x1.locator('.lu-nm').fill('Weapon Summon'); await x1.locator('.lu-notes').fill('ws notes');
    await dlg().locator('#xrMore').click(); await dlg().locator('.xr-item').nth(1).locator('.lu-nm').fill('Martial Flexibility');
    await dlg().locator('#xrMore').click(); const x3 = dlg().locator('.xr-item').nth(2);
    check('…or under a new one typed above it', (await x3.locator('.xr-under option').allInnerTexts()).join(' | '), 'New feature | Choice under Arsenal Tricks | Choice under Martial Flexibility');
    await x3.locator('.lu-notes').fill('orphan notes'); await dlg().locator('button', { hasText: /^Next$/ }).click(); await settle();
    check('…notes without a name are stopped', [/needs its name/.test(await dlg().innerText()), /3 · Feats & talents/.test(await dlg().locator('.steps .cur').innerText())].join(' '), 'true true');
    await x3.locator('.lu-del').click();
    check('…and “×” removes the row', await dlg().locator('.xr-item').count(), 2);
    await next(); await next();
    check('the review lists the feats, features and effects', /Planned:.*Toughness \(bonus\).*Arsenal Tricks: Weapon Summon, Martial Flexibility.*Toughness: Hit points \(max\) \+3/.test((await dlg().innerText()).replace(/\s+/g, ' ')), true);
    await dlg().locator('button', { hasText: 'Save to plan' }).click(); await settle();
    c = await stored();
    check('the plan entry keeps the rows', JSON.stringify([c.plan[0].fr, c.plan[0].xr]), '[[{"name":"Toughness","notes":"+3 hp\\n\\n+1 per Hit Die past 3","mods":[{"target":"hp","val":"3","type":"untyped"}],"kind":"bonus"}],[{"name":"Weapon Summon","notes":"ws notes","mods":[],"under":"Arsenal Tricks"},{"name":"Martial Flexibility","notes":"","mods":[],"under":""}]]');
    check('the plan’s preview counts the effect (+6 average, +1 favored, +3 Toughness)', new RegExp('HP ' + (hp3 + 6 + (c.plan[0].fcb === 'hp' ? 1 : 0) + 3) + '\\b').test(await page.locator('#main').innerText()), true);
    await page.click('[data-a="planLevel"][data-k="0"]'); await settle(); await next(); await next();
    check('editing the planned level fills the rows in again', [await dlg().locator('.ft-item .lu-nm').inputValue(), await dlg().locator('.ft-kind').inputValue(), await dlg().locator('.fx-v').inputValue(), await dlg().locator('.xr-item .xr-under').first().inputValue(), await dlg().locator('.xr-item .lu-notes').first().inputValue()].join(' | '), 'Toughness | bonus | 3 | Arsenal Tricks | ws notes');
    await cancelOrEsc(dlg().locator('button', { hasText: 'Cancel' }).first()); await settle();
    await page.click('[data-a="levelUp"]'); await settle();
    await dlg().locator('button', { hasText: 'Apply as planned' }).click(); await settle(); await next();
    await dlg().locator('button', { hasText: /^Level up$/ }).click(); await settle();
    c = await stored();
    check('levelling up: the bonus feat with its notes, the new feature, the choice filed under Arsenal Tricks with its level and notes',
      [c.levels[3].picks.map(p => p.kind + ':' + p.name + ':' + (p.notes || '')).join(','), JSON.stringify(c.levels[0].picks[0].subs)].join(' | '), 'bonus:Toughness:+3 hp\n\n+1 per Hit Die past 3,feature:Martial Flexibility: | [{"name":"Weapon Summon","lvl":4,"notes":"ws notes"}]');
    check('…the effect is an always-on modifier, and the history has one line for the level',
      [c.mods.filter(m => m.src === 'Toughness').map(m => [m.target, m.val, m.when].join(' ')).join(','), (c.history || []).filter(h => /Toughness/.test(h.text)).map(h => h.t).join(',')].join(' | '), 'hp 3 always | level');
  }
  await page.unroute(SITE + '**', localTalents);

  /* ---------- class features from the wiki in the level-up dialog (2026-11-12) ---------- */
  console.log('Class features from the wiki');
  {
    /* each case is its own character: reloading writes the open one back, so editing it in storage first would be lost */
    let sid = '', nS = 0;
    const mkS = (cls, levels, extra) => page.evaluate(([cls, levels, extra, id]) => { localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify(Object.assign({ app: 'spheres-sheet', v: 1, id, name: 'Punch',
      classes: { c1: Object.assign({ name: 'Striker (Brawler)', hd: 10, bab: 'full', good: ['fort', 'ref'], skills: 4, martial: 'expert' }, cls) }, levels, rules: { hpMethod: 'avgup' } }, extra)));
      localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [cls, levels, extra || {}, sid = 'zz-cls' + (++nS)]);
    const stored = () => page.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)), sid);
    const dlg = () => page.locator('.dlg-back').last();
    const next = async () => { await dlg().locator('button', { hasText: /^Next$/ }).click(); await idle(); };
    const rowsNow = async () => { const r = dlg().locator('.xr-item'), out = []; for (let i = 0; i < await r.count(); i++) out.push((await r.nth(i).locator('.xr-under').inputValue()) + '>' + (await r.nth(i).locator('.lu-nm').inputValue())); return out.join(', '); };
    await mkS({}, [{ cls: 'c1', hp: 10, picks: [{ kind: 'feature', name: 'Tension (Ex)' }] }]); await page.reload(); await idle();
    clsReq.length = 0;
    await page.locator('[data-a="levelUp"]').first().click(); await idle(); await next(); await next();
    check('a renamed archetype (“Striker (Brawler)”) loads the Striker file', clsReq.join(' '), 'striker.json');
    check('level 2 fills in the table’s new features, with a choice row under Striker Art', await rowsNow(), '>Striker Art (Ex), Striker Art (Ex)>, >Tension Boost (Ex)');
    check('…and says what the table gives', /From the Striker table at class level 2: Striker art \(pick one from its list\), tension boost/.test((await dlg().innerText()).replace(/\s+/g, ' ')), true);
    const chRow = dlg().locator('.xr-item').nth(1);
    check('the choice row offers the Striker Art list', [await chRow.locator('.lu-nm').getAttribute('list'), await dlg().locator('datalist#' + await chRow.locator('.lu-nm').getAttribute('list') + ' option[value="Adrenaline Rush"]').count()].join(' '), 'cwo5 1');
    await chRow.locator('.lu-nm').fill('Adrenaline Rush');
    check('picking a choice shows its wiki text', /Wiki text: Adrenaline Rush/.test(await chRow.locator('.lu-wk').innerText()), true);
    await dlg().locator('.xr-item').nth(2).locator('.lu-del').click();
    await next(); await next(); await dlg().locator('button', { hasText: /^Level up$/ }).click(); await idle();
    let c = await stored();
    check('levelling up saves the feature with its choice; a removed row is not taken', JSON.stringify(c.levels[1].picks.map(p => [p.name, (p.subs || []).map(x => x.name + '@' + x.lvl)])), '[["Striker Art (Ex)",["Adrenaline Rush@2"]]]');
    /* a feature you have only "improves"; Back to another class takes the untouched rows away */
    await mkS({}, Array.from({ length: 12 }, (x, i) => ({ cls: 'c1', hp: 6, picks: i === 1 ? [{ kind: 'feature', name: 'Tension Boost (Ex)' }] : [] })), { classes: { c1: { name: 'Striker', hd: 10, bab: 'full', good: ['fort', 'ref'], skills: 4, martial: 'expert' }, c2: { name: 'Wanderer', hd: 8, bab: '3/4', good: [], skills: 4 } } });
    await page.reload(); await idle();
    await page.locator('[data-a="levelUp"]').first().click(); await idle(); await next(); await next();
    check('a feature you already have improves: listed, no row', [await rowsNow(), /Tension boost \(you have it: it improves\)/.test((await dlg().innerText()).replace(/\s+/g, ' '))].join(' | '), '> | true');
    await dlg().locator('button', { hasText: 'Back' }).click(); await idle(); await dlg().locator('button', { hasText: 'Back' }).click(); await idle();
    await dlg().locator('select[name="cls"]').selectOption('c2'); await next(); await next();
    check('a class with no wiki file: no rows, no wiki line', [await rowsNow(), /From the .* table/.test(await dlg().innerText())].join(' | '), '> | false');
    await cancelOrEsc(dlg().locator('button', { hasText: 'Cancel' }).first()); await settle();
    /* the Build tab can switch it off */
    await mkS({ wiki: '-' }, [{ cls: 'c1', hp: 10, picks: [] }]); await page.reload(); await idle();
    await page.locator('[data-a="levelUp"]').first().click(); await idle(); await next(); await next();
    check('“None” on the Build tab: no wiki rows', await rowsNow(), '>');
    await cancelOrEsc(dlg().locator('button', { hasText: 'Cancel' }).first()); await settle();
    await go('Character', 'Build');
    check('the Build tab shows the class’s wiki link', await page.locator('select[data-f="classes.c1.wiki"]').inputValue(), '-');
    /* the Feats & features tab shows a feature's wiki text like a talent's, and a choice's under it */
    await mkS({}, [{ cls: 'c1', hp: 10, picks: [{ kind: 'feature', name: 'Tension (Ex)' }] }, { cls: 'c1', hp: 6, picks: [{ kind: 'feature', name: 'Striker Art (Ex)', subs: [{ name: 'Adrenaline Rush', lvl: 2, notes: '' }] }, { kind: 'feature', name: 'My Homebrew Thing' }] }]);
    await page.reload(); await idle(); await go('Character', 'Feats & features');
    const item = n => page.locator('details.item', { has: page.locator('summary', { hasText: n }) }).first();
    for (const n of ['Tension', 'Striker Art', 'My Homebrew']) await item(n).locator('summary').first().click();
    await idle(); await until('the Striker wiki text', () => [...document.querySelectorAll('#main .wk .note')].some(e => /Striker class feature/.test(e.textContent)));
    const box = async n => (await item(n).locator('.wk').count()) ? (await item(n).locator('.wk').first().innerText()).replace(/\s+/g, ' ') : 'none';
    check('a feature pick shows its wiki text, from the class of its level', /^Tension \(Ex\) Wiki ↗ Striker class feature A striker is at home in battle/.test(await box('Tension')), true);
    check('…a feature with a list says how many choices it has', /Striker class feature · 42 choices in its list/.test(await box('Striker Art')), true);
    check('…a homebrew feature shows no wiki box', await box('My Homebrew'), 'none');
    const sub = item('Striker Art').locator('details', { hasText: 'Adrenaline Rush' }).first();
    check('a choice without notes says it has wiki text', /Adrenaline Rush · wiki text/.test((await sub.locator('summary').innerText()).replace(/\s+/g, ' ')), true);
    await sub.locator('summary').click(); await idle();
    check('…and shows it', /From the wiki \(Striker\):.*spend an additional point of tension/.test((await sub.innerText()).replace(/\s+/g, ' ')), true);
    /* archetypes (2026-11-12): ticked on the Build tab, they change what level up fills in and what the tab says */
    await mkS({}, [{ cls: 'c1', hp: 10, picks: [{ kind: 'feature', name: 'Bare Knuckles (Ex)' }] }]); await page.reload(); await idle();
    await go('Character', 'Build'); await until('the Striker archetypes', () => [...document.querySelectorAll('#main summary')].some(e => /^Archetypes \(9 on the wiki\)/.test(e.textContent.trim())));
    const arD = page.locator('details', { has: page.locator('summary', { hasText: /^Archetypes/ }) }).first();
    await arD.locator('summary').click();
    check('the Build tab lists the class’s archetypes with what they replace and change', /Black Powder Brawler Wiki ↗ Replaces Bare Knuckles, Tension Boost at 2, .*; changes Combat Training, Tension, Striker Art at 2/.test((await arD.innerText()).replace(/\s+/g, ' ')), true);
    await arD.locator('label', { hasText: 'Black Powder Brawler' }).locator('input').click(); await idle();
    await dlg().locator('button', { hasText: 'Only change the archetype' }).click(); await idle(); /* a class with levels: the retrain preview; this check is about the archetype only */
    const vr = page.locator('details', { has: page.locator('summary', { hasText: /^Archetypes/ }) }).first().locator('label', { hasText: 'Voidrusher' });
    check('ticking saves it; an archetype that changes the same feature can’t be ticked, and says why', [JSON.stringify((await stored()).classes.c1.arch), await vr.locator('input').isDisabled(), /Can’t combine with Black Powder Brawler: both change Drill Knuckle/.test(await vr.innerText())].join(' '), '["Black Powder Brawler"] true true');
    check('…one that changes different features still can (Barfighter)', await page.locator('details', { has: page.locator('summary', { hasText: /^Archetypes/ }) }).first().locator('label', { hasText: 'Barfighter' }).locator('input').isDisabled(), false);
    await page.locator('[data-a="levelUp"]').first().click(); await idle(); await next(); await next();
    const luT = (await dlg().innerText()).replace(/\s+/g, ' ');
    check('level up: a replaced feature is left out, an altered one is swapped for the archetype’s version', [/tension boost \(replaced by Black Powder Brawler: Gun Genius \(Ex\)\)/.test(luT), /Striker art \(altered by Black Powder Brawler: now Firearm Fighter \(Ex\)\)/.test(luT)].join(' '), 'true true');
    check('…the altered Striker Art keeps its choice row; the archetype’s level-2 features are rows', await rowsNow(), '>Firearm Fighter (Ex), Striker Art (Ex)>, >Gun Genius (Ex)');
    check('…with their wiki text', /Wiki text: Gun Genius \(Ex\) \(Black Powder Brawler\)/.test(await dlg().locator('.xr-item').nth(2).locator('.lu-wk').innerText()), true);
    await cancelOrEsc(dlg().locator('button', { hasText: 'Cancel' }).first()); await settle();
    await go('Character', 'Feats & features'); await item('Bare Knuckles').locator('summary').first().click(); await idle();
    await until('the replaced note', () => /Replaced by your archetype/.test(document.querySelector('#main').textContent));
    check('the tab says when your archetype replaces a feature you have', /Replaced by your archetype Black Powder Brawler: Firearm Proficiency/.test(await item('Bare Knuckles').locator('.wk').innerText()), true);
    /* mass level-up fills in each level's features too, with the archetype */
    await page.locator('[data-a="levelUp"]').first().click(); await idle();
    await dlg().locator('input[name="cnt"]').fill('4'); await next(); if (await dlg().locator('select[name="inc3"]').count()) await dlg().locator('select[name="inc3"]').selectOption('str'); await next();
    const mrv = (await dlg().innerText()).replace(/\s+/g, ' ');
    check('mass level-up: the review lists the features from the wiki and the archetype, and the choices left', [/Class features \(from the wiki, with Black Powder Brawler; class level in brackets\): Firearm Fighter \(Ex\) \(2\), Gun Genius \(Ex\) \(2\), Accurate Shooter \(Ex\) \(3\)/.test(mrv), /To choose afterwards:.*2 Striker Art choices/.test(mrv)].join(' '), 'true true');
    await dlg().locator('button', { hasText: 'Level up ×4' }).click(); await idle();
    c = await stored();
    check('…each level gets its features (replaced ones left out), and the history keeps one line for the levels', [c.levels.slice(1).map(l => l.picks.map(p => p.name).join('+')).join(' | '), c.history.filter(h => /Gun Genius|Accurate Shooter/.test(h.text)).length].join(' # '),
      'Firearm Fighter (Ex)+Gun Genius (Ex) | Accurate Shooter (Ex) | Desperate Tension (Ex) | Striker Art (Ex)+Tension Training (Ex) # 0'); /* only the art at 2nd is altered: the one at 5th brings Striker Art itself */
    /* an older save with two clashing archetypes ticked gets the warning */
    await mkS({ arch: ['Black Powder Brawler', 'Voidrusher'] }, [{ cls: 'c1', hp: 10, picks: [] }]); await page.reload(); await idle();
    await go('Character', 'Build'); await until('the Striker archetypes', () => [...document.querySelectorAll('#main summary')].some(e => /^Archetypes/.test(e.textContent.trim())) && !/Loading the archetypes/.test(document.querySelector('#main').textContent));
    await page.locator('details', { has: page.locator('summary', { hasText: /^Archetypes/ }) }).first().locator('summary').click();
    check('two clashing archetypes ticked (an older save): warned to untick one', /Black Powder Brawler and Voidrusher both change .*can’t be taken together/.test(await page.locator('#main').innerText()), true);
    /* retraining (2026-11-12): ticking an archetype on a class with levels shows what it swaps, at the levels it comes */
    const BF = [['Blended Training (Ex)', 'Confounding Strike (Ex)', 'Moxie (Ex)', 'Whim'], ['Cunning Celerity (Ex)', 'Steadfast (Ex)'], ['Careful Footwork (Ex)', 'Exploit Uncertainty (Ex)'], ['Spontaneous Technique (Ex)'], ['Mercurial Celerity (Ex)']];
    await mkS({ name: 'Bravo', hd: 10, bab: 'full', good: ['ref'], skills: 6 }, BF.map(l => ({ cls: 'c1', hp: 6, picks: l.map(n => ({ kind: 'feature', name: n })) })), { mods: [{ id: 'mcf', src: 'Careful Footwork (Ex)', target: 'ac', val: '1', type: 'dodge', when: 'always' }] });
    await page.reload(); await idle(); await go('Character', 'Build');
    await until('the Bravo archetypes', () => [...document.querySelectorAll('#main summary')].some(e => /^Archetypes \(9 on the wiki\)/.test(e.textContent.trim())));
    await page.locator('details', { has: page.locator('summary', { hasText: /^Archetypes/ }) }).first().locator('summary').click();
    await page.locator('#main input[data-v="Dreadnought"]').click(); await idle();
    const rtx = (await dlg().innerText()).replace(/\s+/g, ' ');
    check('retraining Bravo 5 into Dreadnought: the preview removes the altered and replaced features and adds the archetype’s at their levels', [/Bravo: no archetype → Dreadnought/.test(rtx), /Remove Cunning Celerity \(Ex\) \(level 2\) Careful Footwork \(Ex\) \(level 3\)/.test(rtx), /Tenacious Determination \(level 2, Bravo 2\) Enduring Tenacity \(level 3, Bravo 3\)/.test(rtx), /Remove Careful Footwork \(Ex\) \(AC 1\)/.test(rtx)].join(' '), 'true true true true');
    check('…nothing changes until it’s confirmed; the class change (saves) is in the same preview', [JSON.stringify((await stored()).classes.c1.arch), /Class changes Good saves: Ref → Fort, Will/.test(rtx), /Add Saving Throws/.test(rtx)].join(' '), '[] true false');
    await dlg().locator('button', { hasText: 'Swap features' }).click(); await idle();
    c = await stored();
    check('“Swap features”: the features swap on their levels, the modifier goes, one history line', [JSON.stringify(c.classes.c1.arch), c.levels.slice(1, 3).map(l => l.picks.map(p => p.name).join('+')).join(' | '), c.mods.length, c.history.filter(h => h.t === 'retrain').length, c.history.filter(h => h.t === 'remove' || h.t === 'add').length].join(' # '),
      '["Dreadnought"] # Steadfast (Ex)+Tenacious Determination | Exploit Uncertainty (Ex)+Enduring Tenacity # 0 # 1 # 0');
    check('Allusionist (it alters Cunning Celerity too) can’t be ticked now', await page.locator('#main input[data-v="Allusionist"]').isDisabled(), true);
    await go('Character', 'Feats & features'); await item('Tenacious Determination').locator('summary').first().click(); await idle();
    check('the tab says what an archetype feature alters, with the base feature’s text', /Dreadnought \(Bravo archetype\).*Alters: Cunning Celerity \(Ex\).*Alters: Quicksilver Celerity/.test((await item('Tenacious Determination').locator('.wk').innerText()).replace(/\s+/g, ' ')), true);
    await go('Character', 'Build'); await page.locator('details', { has: page.locator('summary', { hasText: /^Archetypes/ }) }).first().locator('summary').click().catch(() => {});
    await page.locator('#main input[data-v="Dreadnought"]').click(); await idle();
    await dlg().locator('button', { hasText: 'Swap features' }).click(); await idle();
    c = await stored();
    check('unticking it swaps back', [JSON.stringify(c.classes.c1.arch), c.levels.slice(1, 3).map(l => l.picks.map(p => p.name).join('+')).join(' | ')].join(' # '), '[] # Steadfast (Ex)+Cunning Celerity (Ex) | Exploit Uncertainty (Ex)+Careful Footwork (Ex)');
    /* archetypes that change the class's numbers (2026-11-12): saves on a class with no levels, put back when unticked */
    await mkS({ name: 'Bravo', hd: 10, bab: 'full', good: ['ref'], skills: 6, classSkills: ['acro'] }, []); await page.reload(); await idle(); await go('Character', 'Build');
    await until('the Bravo archetypes', () => [...document.querySelectorAll('#main summary')].some(e => /^Archetypes \(9 on the wiki\)/.test(e.textContent.trim())));
    await page.locator('details', { has: page.locator('summary', { hasText: /^Archetypes/ }) }).first().locator('summary').click();
    check('the archetype list says what it changes in the numbers', /Dreadnought Wiki ↗ Replaces .*; good Fort, Will saves/.test((await page.locator('#main label', { has: page.locator('input[data-v="Dreadnought"]') }).innerText()).replace(/\s+/g, ' ')), true);
    await page.locator('#main input[data-v="Dreadnought"]').click(); await idle();
    check('ticking it (no levels yet) asks first, showing the class change', [/^Archetype\s/.test((await dlg().innerText()).trim()), /Class changes Good saves: Ref → Fort, Will/.test((await dlg().innerText()).replace(/\s+/g, ' ')), /Check these by hand/.test(await dlg().innerText())].join(' '), 'true true false');
    await dlg().locator('button', { hasText: /^Apply$/ }).click(); await idle();
    c = await stored();
    check('“Apply”: the class gets the saves, its own are kept', [JSON.stringify(c.classes.c1.good), JSON.stringify(c.classes.c1.archBase.good)].join(' '), '["fort","will"] ["ref"]');
    await page.locator('#main input[data-v="Dreadnought"]').click(); await idle(); await dlg().locator('button', { hasText: /^Apply$/ }).click(); await idle();
    c = await stored();
    check('unticking it puts the class’s own saves back', [JSON.stringify(c.classes.c1.good), 'archBase' in c.classes.c1].join(' '), '["ref"] false');
    /* two archetypes that rewrite the same number can't be combined, even with no feature in common (Hedgewitch: saves) */
    await mkS({ name: 'Hedgewitch', hd: 6, bab: '1/2', good: ['will'], skills: 2, cast: 'high', martial: 'none', arch: ['Iron Mage'] }, []); await page.reload(); await idle(); await go('Character', 'Build');
    await until('the Hedgewitch archetypes', () => !!document.querySelector('#main input[data-v="Dragonblooded Mortal"]'));
    await page.locator('details', { has: page.locator('summary', { hasText: /^Archetypes/ }) }).first().locator('summary').click();
    const dbm = page.locator('#main label', { has: page.locator('input[data-v="Dragonblooded Mortal"]') });
    check('two archetypes that both rewrite saving throws clash', [await dbm.locator('input').isDisabled(), /Can’t combine with Iron Mage: both change saving throws/.test(await dbm.innerText())].join(' '), 'true true');
    /* class presets and paths (2026-11-13) */
    const freshP = async () => { await mkS({ name: 'X', hd: 8 }, [], { classes: {}, levels: [], castAbil: 'cha', abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 16 } }); await page.reload(); await idle(); };
    const fromList = async n => { await page.locator('[data-a="levelUp"]').first().click(); await idle(); await dlg().locator('select[name="cls"]').selectOption('__lib'); await dlg().locator('input[name="lib"]').fill(n); await next(); await next(); };
    await freshP(); await fromList('Elementalist');
    check('Elementalist 1: the dialog says Destruction comes free, and fills it in as a base sphere', [/From Elementalist at 1st level: Destruction sphere, free/.test(await dlg().innerText()), await dlg().locator('.talrow').first().locator('.tr-sph').inputValue(), await dlg().locator('.talrow').first().locator('.tr-base').isChecked()].join(' '), 'true Destruction true');
    await next(); await next(); await dlg().locator('button', { hasText: /^Level up$/ }).click(); await idle();
    c = await stored();
    check('…saved as a free base sphere, and the class keeps its presets', [JSON.stringify(c.levels[0].picks.filter(p => p.kind === 'talent').map(p => [p.name, p.role])), c.classes[Object.keys(c.classes)[0]].scl].join(' '), '[["Destruction sphere","basefree"]] Destruction');
    await freshP(); await fromList('Wraith');
    const hp = dlg().locator('.xr-item').filter({ has: page.locator('.xr-under option:checked', { hasText: 'Haunt Path' }) }).first();
    await hp.locator('.lu-nm').fill('Path of the Anima'); await idle();
    check('Wraith 1: a haunt path row lists the paths, with the path’s text', [!!(await hp.locator('.lu-nm').getAttribute('list')), /Wiki text: Path of the Anima/.test(await hp.locator('.lu-wk').innerText())].join(' '), 'true true');
    await next(); await next(); await dlg().locator('button', { hasText: /^Level up$/ }).click(); await idle();
    c = await stored(); let kc = c.classes[Object.keys(c.classes)[0]];
    check('…the path applies: Knowledge (nature), Nature free with the class level as its caster level', [JSON.stringify(kc.paths), kc.classSkills.includes('knat'), kc.scl, JSON.stringify(c.levels[0].picks.filter(p => p.kind === 'talent').map(p => [p.name, p.role]))].join(' '), '["Path of the Anima"] true Nature [["Nature sphere","basefree"]]');
    await go('Character', 'Build'); await until('the haunt path picker', () => !!document.querySelector('#main select[data-pthsph="Path of the Anima"]'));
    await page.locator('details', { has: page.locator('summary', { hasText: /^Haunt Path/ }) }).first().locator('summary').first().click();
    await page.locator('#main select[data-pthsph="Path of the Anima"]').selectOption('Weather'); await idle();
    c = await stored(); kc = c.classes[Object.keys(c.classes)[0]];
    check('the Build tab switches the path’s sphere: Weather instead of Nature, and its free sphere with it', [kc.scl, kc.bs, JSON.stringify(c.levels[0].picks.filter(p => p.kind === 'talent').map(p => p.name))].join(' '), 'Weather Weather ["Weather sphere"]');
    await freshP(); await fromList('Hedgewitch');
    const hps = dlg().locator('.xr-item').filter({ has: page.locator('.xr-under option:checked', { hasText: 'Paths' }) });
    check('Hedgewitch 1: two path rows', await hps.count(), 2);
    await hps.nth(0).locator('.lu-nm').fill('Academia'); await hps.nth(1).locator('.lu-nm').fill('Astrology');
    await next(); await next(); await dlg().locator('button', { hasText: /^Level up$/ }).click(); await idle();
    c = await stored(); kc = c.classes[Object.keys(c.classes)[0]];
    check('…both apply: four class skills, Light (Astrology) free, the paths filed under Paths', [JSON.stringify(kc.paths), JSON.stringify(kc.pathAdd.cs), JSON.stringify(c.levels[0].picks.filter(p => p.kind === 'talent').map(p => p.name)), JSON.stringify((c.levels[0].picks.find(p => p.name === 'Paths') || {}).subs.map(x => x.name))].join(' '),
      '["Academia","Astrology"] ["kgeo","knat","kpla","perc"] ["Light sphere"] ["Academia","Astrology"]');
    await page.locator('[data-a="levelUp"]').first().click(); await idle(); await next(); await next();
    const sr = dlg().locator('.xr-item').filter({ has: page.locator('.xr-under option:checked', { hasText: /^Choice under Secret/ }) }).first();
    check('Hedgewitch 2: no repeated path rows; the Secret list has the paths’ secrets, with their text', [await dlg().locator('.xr-item').filter({ has: page.locator('.xr-under option:checked', { hasText: 'Paths' }) }).count(), await dlg().locator('datalist#' + await sr.locator('.lu-nm').getAttribute('list') + ' option[value="Academic Training"]').count(), await (async () => { await sr.locator('.lu-nm').fill('Academic Training'); await idle(); return /Wiki text: Academic Training/.test(await sr.locator('.lu-wk').innerText()); })()].join(' '), '0 1 true');
    await cancelOrEsc(dlg().locator('button', { hasText: 'Cancel' }).first()); await settle();
    /* a Paizo class: its sphere conversion fills in its features */
    await mkS({ name: 'Wizard', hd: 6, bab: '1/2', good: ['will'], skills: 2, cast: 'high', martial: 'none', arch: ['Sphere Wizard'] }, []); await page.reload(); await idle();
    await page.locator('[data-a="levelUp"]').first().click(); await idle(); await next(); await next();
    check('a Wizard with Sphere Wizard: level 1 fills in the conversion’s features', [/From Sphere Wizard at class level 1/.test(await dlg().innerText()), await rowsNow()].join(' | '), 'true | >Casting, >Spell Points, >Magic Talents, >Arcane Bond (Ex), >Sphere Specialization');
    await cancelOrEsc(dlg().locator('button', { hasText: 'Cancel' }).first()); await settle();
  }

  /* ---------- armor check penalty with the encumbrance house rule; an action that throws ---------- */
  console.log('Armor check penalty and a failing action');
  {
    let nA = 0, aid = '';
    const mkA = extra => page.evaluate(([extra, id]) => { localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify(Object.assign({ app: 'spheres-sheet', v: 1, id, name: 'Armored',
      classes: { c1: { name: 'Hero', hd: 10, bab: 'full', good: ['fort'], skills: 4, martial: 'expert', talents: 'auto' } },
      levels: Array.from({ length: 3 }, () => ({ cls: 'c1', hp: 6, picks: [] })), rules: { maxFirst: true, hpMethod: 'avgup', encumbrance: true } }, extra)));
      localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [extra, aid = 'zz-arm' + (++nA)]);
    /* Str 10: light load up to 33 lb, medium up to 66 lb (medium load = -3 check penalty) */
    const gear = (aAcp, sAcp, wt, rule) => ({ armor: { name: 'Test armor', bonus: 4, enh: 0, maxDex: 99, acp: aAcp, type: 'light', asf: 0, mw: false, wt, mat: '' },
      shield: { name: 'Test shield', bonus: 2, enh: 0, acp: sAcp, maxDex: 99, mw: false, asf: 0, wt: 0, mat: '', tower: false, },
      rules: { maxFirst: true, hpMethod: 'avgup', encumbrance: rule } });
    const climb = async extra => { await mkA(extra); await page.reload(); await settle(); await go('Character', 'Skills'); return (await skillTotal('Climb')).replace('−', '-'); };
    check('check penalty: armor -2 and shield -2 are worse than a medium load (-3): -4, not -5', await climb(gear(2, 2, 40, true)), '-4');
    check('check penalty: a medium load (-3) is worse than armor -1 and shield -1: -3', await climb(gear(1, 1, 40, true)), '-3');
    check('check penalty: house rule off, only armor and shield count: -2', await climb(gear(1, 1, 40, false)), '-2');
    check('check penalty: house rule on but a light load, armor and shield add up: -4', await climb(gear(2, 2, 10, true)), '-4');

    /* an action that throws half-way leaves the character as it was, says so, and the sheet keeps working */
    await mkA({ hp: { dmg: 5, non: 0, temp: 0 } }); await page.reload(); await settle();
    const errN2 = errors.length, dmgOf = () => page.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)).hp.dmg, aid);
    await go('Play', 'Sheet');
    const dmg0 = await dmgOf();
    await page.evaluate(() => { const orig = Date.now; Date.now = () => { Date.now = orig; throw new Error('boom'); }; });
    await page.click('[data-a="rest"][data-k="long"]'); await settle();
    const msg = (await page.locator('.dlg-back').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('a failing action: the message says it didn’t work and nothing was saved', /That didn’t work: boom\. Nothing was saved\./.test(msg), 'true');
    await page.locator('.dlg button:has-text("OK")').last().click().catch(() => {}); await settle();
    check('…the saved character is unchanged', [dmg0, await dmgOf()].join(' '), '5 5');
    await page.click('[data-a="rest"][data-k="long"]'); await settle();
    check('…and the next action works on the unchanged character (5 − 3 healed = 2)', [await dmgOf(), /Long rest \(8 hours\)/.test(await page.locator('#toast').innerText().catch(() => ''))].join(' '), '2 true');
    errors.length = errN2; /* the failure was logged with console.error on purpose */
  }

  /* ---------- weapon presets (2026-11-11): WEAPONS list on the Gear tab, like the armor list ---------- */
  console.log('Weapon presets');
  const wpChar = async (id, size, extra = []) => { await page.evaluate(([id, size, extra]) => { localStorage.setItem('spheres-sheet-v1:' + id, JSON.stringify({ app: 'spheres-sheet', v: 1, id, name: 'Weaponer', size, levels: [], classes: {},
      abil: { str: 16, dex: 14, con: 10, int: 10, wis: 10, cha: 10 }, weapons: [{ id: 'w1', name: 'Old', kind: 'melee', dice: '1d4', enh: 1, notes: 'my notes' }].concat(extra) }));
    localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(id)); }, [id, size, extra]); await page.reload(); await settle(); await go('Character', 'Gear'); };
  const wpSaved = id => page.evaluate(id => JSON.parse(localStorage.getItem('spheres-sheet-v1:' + id)).weapons, id);
  const addPick = async label => { await page.selectOption('select[data-wpreset="new"]', { label }); await settle(); };
  const atkLine = async name => (await page.locator('.atk', { has: page.locator('.nm', { hasText: new RegExp('^' + name + '$') }) }).first().innerText()).replace(/\s+/g, ' ');
  await wpChar('zz-wp', 'M');
  check('the weapon picker lists every weapon (77 + the prompt) in 13 groups', await page.locator('select[data-wpreset="new"] option').count() + ' ' + await page.locator('select[data-wpreset="new"] optgroup').count(), '78 13');
  await addPick('Longsword (1d8, 19–20/×2)'); await addPick('Longbow (1d8, ×3)'); await addPick('Dagger (1d4, 19–20/×2)'); await addPick('Greatsword (2d6, 19–20/×2)'); await addPick('Quarterstaff (1d6/1d6, ×2)');
  const ws = await wpSaved('zz-wp'), pick = n => ws.filter(w => w.name === n)[0];
  const f = (w, ...k) => k.map(x => w[x]).join(' ');
  check('Longsword: 1d8, 19–20/×2, slashing, melee', f(pick('Longsword'), 'dice', 'crit', 'dtype', 'kind'), '1d8 19–20/×2 slashing melee');
  check('Longbow: ranged, range 100 ft., Dex to hit, no Strength to damage', f(pick('Longbow'), 'kind', 'range', 'abil', 'dmgAbil', 'crit'), 'ranged 100 ft. dex none ×3');
  check('Dagger: light, range 10 ft., piercing or slashing', f(pick('Dagger'), 'light', 'range', 'dtype'), 'true 10 ft. piercing or slashing');
  check('Greatsword: 2d6 with Strength ×1½', f(pick('Greatsword'), 'dice', 'mult', 'light', 'notes'), '2d6 1.5 false Weight 8 lb.');
  check('a double weapon fills the first head and says what the other deals', f(pick('Quarterstaff'), 'dice', 'mult') + ' | ' + /other head deals 1d6/.test(pick('Quarterstaff').notes), '1d6 1 | true');
  await go('Play', 'Sheet');
  /* Str 16 = +3. Greatsword: +3 to hit (BAB 0), damage ⌊3 × 1.5⌋ = +4. Longsword: ×1, +3. Longbow: Dex 14 = +2 to hit, no damage bonus. */
  check('Sheet attack lines: Greatsword +3, 2d6+4; Longsword +3, 1d8+3; Longbow +2, 1d8', [await atkLine('Greatsword'), await atkLine('Longsword'), await atkLine('Longbow')].map(s => s.replace(/ (slashing|piercing).*$/, '')).join(' | '), 'Greatsword +3 2d6+4 | Longsword +3 1d8+3 | Longbow +2 1d8');
  /* picking on an existing row: enhancement and the player's notes stay */
  await go('Character', 'Gear'); await page.locator('details.item[data-keep="wp-w1"] > summary').click();
  await page.locator('details.item[data-keep="wp-w1"] select[data-wpreset]').selectOption({ label: 'Longsword (1d8, 19–20/×2)' }); await settle();
  const w1 = (await wpSaved('zz-wp'))[0];
  check('picking on a row with a +1 enhancement keeps the +1 and the player’s notes', f(w1, 'name', 'dice', 'enh', 'notes'), 'Longsword 1d8 1 my notes');
  await go('Play', 'Sheet');
  check('…and the Sheet shows +4 to hit (Str +3, +1) and 1d8+4', (await atkLine('Longsword')).replace(/ slashing.*$/, ''), 'Longsword +4 1d8+4');
  /* a Small character: the preset converts the table's Medium dice to the character's own size (the sheet only scales for changes from it), so a longsword is 1d6; +1 size to hit */
  await wpChar('zz-wp2', 'S'); await addPick('Longsword (1d6, 19–20/×2)'); /* the label shows the dice a Small character gets */ await go('Play', 'Sheet');
  check('a Small character gets a longsword as 1d6 (not 1d8), also stored as 1d6', (await atkLine('Longsword')).replace(/ slashing.*$/, '') + ' ' + (await wpSaved('zz-wp2')).filter(w => w.name === 'Longsword')[0].dice, 'Longsword +4 1d6+3 1d6');

  /* the picker's labels show the dice the character will get (Small: 1d6), and the fill picker is only on manufactured weapons */
  await go('Character', 'Gear');
  check('a Small character’s picker label for Longsword shows 1d6 (what the row will get)', await page.locator('select[data-wpreset="new"] option', { hasText: /^Longsword / }).first().textContent(), 'Longsword (1d6, 19–20/×2)');
  await wpChar('zz-wp3', 'S', [{ id: 'w2', name: 'Bite', kind: 'nat1', dice: '1d6', count: 1 }, { id: 'w3', name: 'Trip', kind: 'cmb' }]); /* w1 (melee) keeps its picker; Bite (natural) and Trip (maneuver) get none */
  await page.locator('details.item[data-keep="wp-w1"] > summary').click(); await page.locator('details.item[data-keep="wp-w2"] > summary').click(); await page.locator('details.item[data-keep="wp-w3"] > summary').click();
  check('a melee row has the fill picker, a natural attack and a combat maneuver do not', [await page.locator('details.item[data-keep="wp-w1"] select[data-wpreset]').count(), await page.locator('details.item[data-keep="wp-w2"] select[data-wpreset]').count(), await page.locator('details.item[data-keep="wp-w3"] select[data-wpreset]').count()].join(' '), '1 0 0');
  check('the fill picker says what it replaces', (await page.locator('details.item[data-keep="wp-w1"] label:has(select[data-wpreset])').innerText()).includes('replaces the name, kind, dice, critical, type and range'), 'true');
  await page.locator('details.item[data-keep="wp-w1"] select[data-wpreset]').selectOption({ label: 'Longsword (1d6, 19–20/×2)' }); await settle();
  check('filled: name and dice replaced', f((await wpSaved('zz-wp3'))[0], 'name', 'dice'), 'Longsword 1d6');
  await page.click('[data-a="undo"]'); await settle();
  check('Undo restores the old name and dice', f((await wpSaved('zz-wp3'))[0], 'name', 'dice'), 'Old 1d4');

  check('no page errors', errors.length ? errors.join(' | ') : 'none', 'none');
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
