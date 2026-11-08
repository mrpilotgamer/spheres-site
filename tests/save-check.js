/* Spheres Character Sheet: how often the sheet talks to the database, against the Firebase emulators.
   Counts the page's own calls (account saves, account reads, party summaries) while a player clicks around, and checks the
   free-plan savers: saves wait for 8 s of quiet (never more than 30 s), saves that change nothing aren't sent, a quick trip to
   another tab doesn't re-read the account, and party summaries go out at most every 12 s with the latest one always arriving.

     npm i playwright firebase-tools@13 firebase@10.12.2
     npx firebase emulators:exec --config firebase.emulators.json --only firestore,auth --project demo-spheres "node tests/save-check.js"

   Takes about 2 minutes (it waits for the real delays). Exit code 0 = every check passed. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const PUB = path.resolve(__dirname, '..', 'public'), FB = path.dirname(require.resolve('firebase/package.json'));
const PORT = 5056, BASE = `http://127.0.0.1:${PORT}/`;
let pass = 0, fail = 0;
function check(what, got, want) { const ok = String(got).trim() === String(want); ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok ? '' : `: got "${got}", expected "${want}"`)); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const t = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t > ms) return null; await wait(150); } }

(async () => {
  const server = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(b); }); });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-spheres/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-spheres/accounts', { method: 'DELETE' });
  const browser = await chromium.launch(), errors = [];
  async function user(name) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/*', route => { const f = path.join(FB, route.request().url().split('/').pop()); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) }); });
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('dialog', d => d.accept());
    return page;
  }
  const ready = p => p.waitForFunction(() => window.SheetCloud && window.SheetCloud.emu, null, { timeout: 15000 });
  const signIn = (p, email) => p.evaluate(e => window.SheetCloud.testSignIn(e), email);
  const clip = p => p.evaluate(() => navigator.clipboard.readText());
  const dlgBtn = (p, label) => p.locator('.dlg button', { hasText: label }).click();
  /* count the page's database calls by wrapping SheetCloud */
  const count = p => p.evaluate(() => { const S = window.SheetCloud; window.__ops = { put: 0, get: 0, memberPut: 0 };
    ['put', 'get', 'memberPut'].forEach(k => { if (!S['__' + k]) { S['__' + k] = S[k]; S[k] = function () { window.__ops[k]++; if (k === 'put' && !window.__ops.putAt) window.__ops.putAt = Date.now(); return S['__' + k].apply(this, arguments); }; } }); });
  const ops = p => p.evaluate(() => Object.assign({}, window.__ops));
  const reset = p => p.evaluate(() => { window.__ops = { put: 0, get: 0, memberPut: 0 }; });
  const setVis = (p, state) => p.evaluate(s => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s }); document.dispatchEvent(new Event('visibilitychange')); }, state);
  let dealt = 0;
  const dmg = async (p, n) => { dealt += n; await p.fill('#amt', String(n)); await p.click('[data-a="hpDo"][data-k="dmg"]'); };

  /* ---------- a GM and a player in one party ---------- */
  const gm = await user('gm'); await gm.goto(BASE + '?emu'); await ready(gm); await signIn(gm, 'gm@test.example');
  await until(() => gm.locator('h2', { hasText: 'Parties you run' }).count());
  await gm.click('[data-a="partyNew"]'); await gm.fill('.dlg input[name=n]', 'Count group'); await dlgBtn(gm, 'Create');
  await until(() => gm.locator('.li b', { hasText: 'Count group' }).count());
  let invite = null;   /* the clipboard read can race the copy: click again until the link is there */
  for (let i = 0; i < 5 && !invite; i++) { await gm.click('[data-a="partyInvite"][data-k="player"]'); invite = await until(async () => { const t = await clip(gm); return /join=/.test(t) ? t : null; }, 4000); }
  if (!invite) throw new Error('the GM invite link never reached the clipboard');
  const pl = await user('player'); await pl.goto(BASE + '?emu'); await ready(pl); await signIn(pl, 'player@test.example');
  await until(() => pl.locator('[data-a="example"][data-k="striker"]').count());
  await pl.click('[data-a="example"][data-k="striker"]'); await wait(2000);
  await pl.goto(invite); await ready(pl);
  await until(() => pl.locator('.dlg h2', { hasText: 'Join “Count group”' }).count(), 12000); await dlgBtn(pl, 'Join');
  await until(() => pl.locator('#toast', { hasText: 'Joined' }).count());
  await pl.click('[data-a="home"]'); await wait(500);
  await pl.locator('section', { hasText: 'Parties you’re in' }).locator('[data-a="openChar"]').first().click(); await wait(400);
  await gm.click('[data-a="partyOpen"]'); const card = gm.locator('.pcard', { hasText: 'Tova Rask' });
  await until(() => card.count());
  await count(pl); await wait(14000); await reset(pl);   /* let the join's own saves and summaries settle */
  const hp0 = Number((await card.locator('.big').innerText()).trim()); dealt = 0;

  console.log('Account saves');
  for (let i = 0; i < 5; i++) { await dmg(pl, 1); await wait(1000); }
  check('5 quick clicks: nothing sent while clicking', (await ops(pl)).put, 0);
  await wait(8500);
  check('…then one save, 8 s after the last click', (await ops(pl)).put, 1);

  await reset(pl);
  /* a field "changed" to the value it already has still runs save(): only savedAt differs, so nothing is sent */
  const same = await pl.evaluate(() => { const t = document.querySelector('[data-f^="cardNotes."]'); if (!t) return false; t.dispatchEvent(new Event('change', { bubbles: true })); return true; });
  await wait(9500);
  check('a save that changes nothing: not sent', same ? (await ops(pl)).put : 'no field found', 0);

  await reset(pl);
  const t0 = Date.now(), p0 = await pl.evaluate(() => Date.now());
  while (Date.now() - t0 < 36000) { await dmg(pl, 1); await wait(4000); }
  const at = (await ops(pl)).putAt, firstPut = at ? at - p0 : 0;
  console.log('       (first save after ' + (firstPut / 1000).toFixed(1) + ' s of clicking)');
  check('clicking every 4 s without a break still saves within 30 s', firstPut > 0 && firstPut <= 31000, 'true');
  await wait(9000);

  await reset(pl); await dmg(pl, 1); await wait(500);
  await setVis(pl, 'hidden'); await wait(800);
  check('hiding the tab sends a waiting save at once', (await ops(pl)).put, 1);

  console.log('Coming back to the tab');
  await reset(pl); await setVis(pl, 'visible'); await wait(800);
  check('back after under a minute: no account read', (await ops(pl)).get, 0);
  await setVis(pl, 'hidden');
  await pl.evaluate(() => { const real = Date.now; window.__realNow = real; Date.now = () => real() + 61000; });
  await setVis(pl, 'visible'); await wait(1200);
  await pl.evaluate(() => { Date.now = window.__realNow; });
  check('back after more than a minute: one account read', (await ops(pl)).get, 1);

  console.log('Party summaries');
  await wait(13000); await reset(pl);
  await dmg(pl, 1); await wait(9000);          /* save 1 → summary 1 */
  const m1 = (await ops(pl)).memberPut;
  await dmg(pl, 1); await wait(9000);          /* save 2 at about 17 s: the summary waits until 12 s after summary 1 */
  const m2 = (await ops(pl)).memberPut;
  check('first summary goes out with the save', m1, 1);
  check('a second one within 12 s waits', m2, 1);
  await wait(5000);
  check('…and then goes out', (await ops(pl)).memberPut, 2);
  const want = hp0 - dealt;
  check('the GM sees the latest hit points', await until(async () => Number((await card.locator('.big').innerText()).trim()) === want, 8000) ? want : (await card.locator('.big').innerText()).trim(), want);

  check('no page errors', errors.length ? errors.join(' | ') : 'none', 'none');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
