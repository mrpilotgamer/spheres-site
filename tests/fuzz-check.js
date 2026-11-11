/* Spheres Character Sheet: hostile-data check.
   Characters reach other people through share links and party dashboards, so any text in a character that reaches the
   page unescaped would be a real hole. This loads both example characters with a script payload injected into their
   data in four ways, opens every tab, opens every <details>, clicks the "why" (breakdown) buttons, triggers the print
   view and a few dialogs, and after each step looks for injected elements, any element with an on*= attribute, and
   window.__xss (set by the payload if a script ran). The four ways: `text` (payload added to free-text fields; enum-like
   keys left alone), `keys` (also used as a key in the map-like fields), `all` (every string replaced by the payload),
   `nums` (every number replaced by the payload).

     node tests/fuzz-check.js          (needs Playwright: npm i playwright && npx playwright install chromium)

   It takes about a minute; at most 40 "why" buttons are clicked per tab (the same ones render the same way).
   It lives outside public/, so `firebase deploy` never uploads it. */
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', 'public', 'index.html');
const WHY_MAX = 40;
let pass = 0, fail = 0;
function check(what, got, want) {
  const ok = String(got).trim() === String(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok ? '' : `: got "${got}", expected "${want}"`));
}

const PAYLOAD = 'x"\'><img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=(window.__xss||0)+1"></svg></textarea></script><b class=__inj>';
/* keys whose strings are choices the sheet looks up (left alone in `text` mode, so the character still makes sense) */
const ENUM = new Set('ab abil act alignment app armorSpeed bab bodyType cast castAbil cat classSkills cls fcb flyMan form freq good group hpAb id inc k kind martial mode preset pracAbil rank res reset role size skill slot status talents talx tf tkind twfFeat type unit when where xpTrack target dcBase atk dmgAbil utilx opAbil'.split(' '));
const PLAIN = ['abil', 'racial', 'armor', 'shield', 'hp', 'money', 'rules', 'notes', 'traditions', 'casting', 'martial', 'trade', 'move', 'combat', 'carry', 'cardNotes', 'meta', 'ws', 'pers'];
const MAPS = ['sphSkills', 'conds', 'skillRanks', 'skillClass', 'skillLabel', 'tabsOff', 'noAb', 'skillAbil', 'slotExtra'];
function poison(o, k, mode) {
  if (Array.isArray(o)) return o.map(x => poison(x, k, mode));
  if (o && typeof o === 'object') {
    const r = {};
    for (const a in o) r[a] = poison(o[a], a, mode);
    if (mode === 'keys' && MAPS.includes(k)) r[PAYLOAD] = k === 'sphSkills' ? ['acro'] : k === 'skillAbil' ? { a: 'str', why: PAYLOAD } : 1;
    return r;
  }
  if (typeof o === 'string') {
    if (k === 'app') return o;
    if (mode === 'all') return PAYLOAD;
    if (mode === 'nums') return o;
    return ENUM.has(k) ? o : o + PAYLOAD;
  }
  if (typeof o === 'number' && mode === 'nums' && !['v', 'savedAt'].includes(k)) return PAYLOAD;
  return o;
}

/* what the detector looks for; returns [] when the page is clean */
const probeFn = () => {
  const out = [], sel = '.__inj,img[src="x"],svg[onload]';
  document.querySelectorAll(sel).forEach(e => out.push('injected element: ' + (e.parentElement || e).outerHTML.replace(/\s+/g, ' ').slice(0, 200)));
  document.querySelectorAll('*').forEach(e => { const a = [...e.attributes].find(x => /^on/i.test(x.name)); if (a) out.push('on* attribute ' + a.name + ' on ' + e.outerHTML.replace(/\s+/g, ' ').slice(0, 200)); });
  if (window.__xss) out.push('a script ran (window.__xss=' + window.__xss + ')');
  return out;
};
const clean = () => { window.__xss = 0; document.querySelectorAll('.__inj,img[src="x"],svg[onload]').forEach(e => e.remove()); document.querySelectorAll('*').forEach(e => [...e.attributes].filter(x => /^on/i.test(x.name)).forEach(x => e.removeAttribute(x.name))); };

(async () => {
  const browser = await chromium.launch();

  /* the two example characters, as the sheet itself saves them */
  const examples = [];
  {
    const page = await browser.newPage();
    await page.goto(FILE); await page.waitForSelector('[data-a="example"]');
    for (let i = 0; i < 2; i++) {
      await page.locator('[data-a="example"]').nth(i).click();
      await page.waitForSelector('#tabbar:not([hidden])');
      examples.push(await page.evaluate(() => { const id = JSON.parse(localStorage.getItem('spheres-sheet-v1:last')); return localStorage.getItem('spheres-sheet-v1:' + id); }));
      await page.click('[data-a="home"]'); await page.waitForSelector('[data-a="example"]');
    }
    await page.close();
  }
  const names = examples.map(x => JSON.parse(x).name);

  /* the detector must be able to see a hit (otherwise "nothing found" proves nothing) */
  {
    const page = await browser.newPage();
    await page.goto(FILE); await page.waitForSelector('[data-a="example"]');
    check('the detector sees nothing on a clean page', (await page.evaluate(probeFn)).length, 0);
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<img src="x" onerror="window.__xss=1">'));
    await page.waitForFunction(() => window.__xss);   /* the broken image's handler runs */
    const found = await page.evaluate(probeFn);
    check('the detector reports a known-bad element (img onerror)', found.length >= 2 && found.some(s => /^a script ran/.test(s)) && found.some(s => /^injected element/.test(s)) && found.some(s => /^on\* attribute onerror/.test(s)), true);
    await page.evaluate(clean);
    check('…and is clean again after cleaning up', (await page.evaluate(probeFn)).length, 0);
    await page.close();
  }

  for (const mode of ['text', 'keys', 'all', 'nums']) for (let ei = 0; ei < 2; ei++) {
    const tag = `${mode}, ${names[ei]}`;
    const c = poison(JSON.parse(examples[ei]), '', mode); c.id = 'fz' + ei; c.tabsOff = {};
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage(), errors = [], hits = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
    const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const probe = async label => { const f = await page.evaluate(probeFn); if (f.length) { hits.push(label + ': ' + f[0] + (f.length > 1 ? ` (+${f.length - 1} more)` : '')); await page.evaluate(clean); } };

    await page.goto(FILE);
    await page.evaluate(c => { localStorage.setItem('spheres-sheet-v1:' + c.id, JSON.stringify(c)); localStorage.setItem('spheres-sheet-v1:last', JSON.stringify(c.id)); }, c);
    await page.reload();
    const opened = await page.waitForSelector('#tabbar:not([hidden])', { timeout: 5000 }).then(() => true, () => false);
    await settle();
    check(`the poisoned character opened (${tag})`, opened, true);
    if (await page.locator('.dlg').count()) await page.keyboard.press('Escape');
    await probe('load');

    const openAll = () => page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    const seen = new Set(), ng = await page.locator('#tabbar [data-tgrp]').count();
    for (let gi = 0; gi < ng; gi++) {
      await page.locator('#tabbar [data-tgrp]').nth(gi).click().catch(() => {}); await settle();
      const n = await page.locator('#tabbar [data-tab]').count();
      for (let ti = 0; ti < n; ti++) {
        const t = page.locator('#tabbar [data-tab]').nth(ti), id = await t.getAttribute('data-tab').catch(() => null);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        await t.click().catch(() => {}); await settle(); await probe('tab ' + id);
        await openAll(); await settle(); await probe('tab ' + id + ' (details open)');
        const why = await page.locator('[data-a="why"]').count();
        for (let i = 0; i < Math.min(why, WHY_MAX); i++) {
          await page.locator('[data-a="why"]').nth(i).click({ timeout: 800, force: true }).catch(() => {});
          await probe(`tab ${id} why#${i}`); await page.keyboard.press('Escape');
        }
      }
    }
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await settle(); await probe('print view');
    for (const a of ['levelUp', 'theme', 'tabCfg', 'home']) {
      const b = page.locator(`[data-a="${a}"]`).first();
      if (await b.count()) { await b.click({ timeout: 1000 }).catch(() => {}); await settle(); await probe('action ' + a); await page.keyboard.press('Escape'); }
    }
    await probe('home');
    check(`no injected markup or script ran (${tag})`, hits.length ? '\n         ' + hits.slice(0, 5).join('\n         ') : 'none', 'none');
    check(`no page errors (${tag})`, errors.length ? [...new Set(errors)].slice(0, 5).join(' | ') : 'none', 'none');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
