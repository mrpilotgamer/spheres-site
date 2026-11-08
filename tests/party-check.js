/* Spheres Character Sheet: share links and parties, end to end, against the Firebase emulators.
   Four browsers: a GM, a player, someone with only a share link, and a second GM. Nothing touches the real database.

     npm i playwright firebase-tools@13 firebase@10.12.2
     npx firebase emulators:exec --config firebase.emulators.json --only firestore,auth --project demo-spheres "node tests/party-check.js"

   (Firestore emulator on 8080 and Auth on 9099, the defaults; the emulator needs Java.) The page is served locally and its
   Firebase code comes from the npm "firebase" package instead of gstatic.com. Exit code 0 = every check passed. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const PUB = path.resolve(__dirname, '..', 'public'), FB = path.dirname(require.resolve('firebase/package.json'));
const PORT = 5055, BASE = `http://127.0.0.1:${PORT}/`;
let pass = 0, fail = 0; const SHOTS = process.env.SHOTS || '';
function check(what, got, want) { const ok = String(got).trim() === String(want); ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok ? '' : `: got "${got}", expected "${want}"`)); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const t = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t > ms) return null; await wait(150); } }

(async () => {
  const server = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(b); }); }).listen(PORT);
  /* start from an empty emulator: no accounts, no data */
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-spheres/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-spheres/accounts', { method: 'DELETE' });
  const browser = await chromium.launch(), errors = [];
  async function user(name) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/*', (route) => { const f = path.join(FB, route.request().url().split('/').pop()); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) }); });
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('dialog', d => d.accept());
    return page;
  }
  const ready = p => p.waitForFunction(() => window.SheetCloud && window.SheetCloud.emu, null, { timeout: 15000 });
  const signIn = (p, email) => p.evaluate(e => window.SheetCloud.testSignIn(e), email);
  const clip = p => p.evaluate(() => navigator.clipboard.readText());
  const go = async (p, group, tab) => { await p.click(`#tabbar [data-tgrp]:has-text("${group}")`); await wait(120); await p.locator('#tabbar [data-tab]', { hasText: tab }).first().click(); await wait(250); };
  const dlgBtn = (p, label) => p.locator('.dlg button', { hasText: label }).click();

  /* ---------- GM creates a party ---------- */
  console.log('GM');
  const gm = await user('gm'); await gm.goto(BASE + '?emu&beta'); await ready(gm); await signIn(gm, 'gm@test.example');
  check('the GM sees “Parties you run”', !!(await until(() => gm.locator('h2', { hasText: 'Parties you run' }).count())), 'true');
  await gm.click('[data-a="partyNew"]'); await gm.fill('.dlg input[name=n]', 'Tuesday group'); await dlgBtn(gm, 'Create');
  check('the party appears', !!(await until(() => gm.locator('.li b', { hasText: 'Tuesday group' }).count())), 'true');
  await gm.click('[data-a="partyInvite"][data-k="player"]'); const invite = await until(async () => { const t = await clip(gm); return /join=/.test(t) ? t : null; });
  if (process.env.DEBUG) console.log('clipboard:', JSON.stringify(await clip(gm)), 'invite:', JSON.stringify(invite));
  check('a player invite link is copied', /\?join=[A-Za-z0-9_]+&code=[A-Za-z0-9]{20,}&n=Tuesday%20group&emu$/.test(invite || ''), 'true');
  await gm.click('[data-a="partyInvite"][data-k="gm"]'); const gmInvite = await until(async () => { const t = await clip(gm); return /gmjoin=/.test(t) ? t : null; });

  /* ---------- a player joins with Tova ---------- */
  console.log('Player');
  const pl = await user('player'); await pl.goto(BASE + '?emu'); await ready(pl); await signIn(pl, 'player@test.example');
  await until(() => pl.locator('[data-a="example"][data-k="striker"]').count());
  check('released: players see parties without ?beta', !!(await until(() => pl.locator('h2', { hasText: 'Parties you run' }).count())), 'true');
  await pl.click('[data-a="example"][data-k="striker"]'); await wait(2000); /* saved to the (emulated) account */
  await pl.goto(invite); await ready(pl);
  check('opening the invite asks which character joins', !!(await until(() => pl.locator('.dlg h2', { hasText: 'Join “Tuesday group”' }).count(), 12000)), 'true');
  await dlgBtn(pl, 'Join');
  check('the player is told it joined', !!(await until(() => pl.locator('#toast', { hasText: 'Joined “Tuesday group”' }).count())), 'true');

  await pl.click('[data-a="home"]');
  check('the player sees “Parties you’re in”', !!(await until(() => pl.locator('section', { hasText: 'Parties you’re in' }).locator('[data-a="openChar"]', { hasText: 'Tova Rask' }).count())), 'true');
  await pl.locator('section', { hasText: 'Parties you’re in' }).locator('[data-a="openChar"]').first().click(); await wait(400);

  /* ---------- the GM's live dashboard ---------- */
  console.log('Dashboard');
  await gm.click('[data-a="partyOpen"]');
  const card = gm.locator('.pcard', { hasText: 'Tova Rask' });
  check('Tova’s card appears', !!(await until(() => card.count())), 'true');
  check('her hit points', (await card.locator('.big').innerText()).trim(), '188');
  check('her AC', (await card.locator('.tile', { hasText: 'AC' }).locator('.v').innerText()).trim(), '28');
  await pl.fill('#amt', '20'); await pl.click('[data-a="hpDo"][data-k="dmg"]');
  await pl.click('[data-a="cond"][data-k="Shaken"]').catch(async () => { await pl.click('.condpick summary'); await pl.click('[data-a="cond"][data-k="Shaken"]'); });
  check('damage shows up live', await until(async () => (await card.locator('.big').innerText()).trim() === '168', 10000) ? '168' : (await card.locator('.big').innerText()), '168');
  if (SHOTS) { await wait(500); await gm.screenshot({ path: SHOTS + '/gm-dashboard.png', fullPage: true }); }
  check('a condition shows up live', !!(await until(() => card.locator('.pcond', { hasText: 'Shaken' }).count(), 10000)), 'true');

  /* ---------- the GM opens the sheet read-only ---------- */
  console.log('Read-only sheet (GM)');
  await card.locator('[data-a="partyView"]').click();
  check('the sheet opens read-only', !!(await until(() => gm.locator('.tag', { hasText: 'Read-only' }).count())), 'true');
  check('it shows Tova', (await gm.locator('#cname').innerText()).trim(), 'Tova Rask');
  check('fields are locked', await gm.locator('#main input:not([disabled])').count(), '0');
  check('no Level up or Undo', await gm.locator('[data-a="levelUp"], [data-a="undo"]').count(), '0');
  check('breakdowns still open', await gm.locator('#main [data-a="why"]:not([disabled])').count() > 0, 'true');
  if (SHOTS) await gm.screenshot({ path: SHOTS + '/gm-readonly.png' });
  await gm.click('[data-a="roExit"]');
  check('back to the party', !!(await until(() => gm.locator('.pcard', { hasText: 'Tova Rask' }).count())), 'true');

  /* ---------- a share link, opened by someone who isn't signed in ---------- */
  console.log('Share link');
  await go(pl, 'Advanced', 'Save'); await pl.click('[data-a="shareOn"]');
  const shareLink = await until(async () => { const v = await pl.locator('#main input[aria-label="Share link"]').inputValue().catch(() => ''); return /share=/.test(v) ? v : null; });
  if (SHOTS) await pl.locator('#main section', { hasText: 'Share and parties' }).screenshot({ path: SHOTS + '/player-share.png' });
  check('a share link is made', /\?share=[A-Za-z0-9_]{20,}&emu$/.test(shareLink || ''), 'true');
  await wait(1500);
  const anon = await user('anon'); await anon.goto(shareLink);
  check('the share link opens without signing in', !!(await until(() => anon.locator('.tag', { hasText: 'Read-only' }).count(), 15000)), 'true');
  check('it shows Tova', (await anon.locator('#cname').innerText()).trim(), 'Tova Rask');
  check('the viewer keeps nothing on that device', await anon.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('spheres-sheet-v1:')).length), '0');
  const shareId = shareLink.match(/share=([A-Za-z0-9_]+)/)[1];
  const copy = await anon.evaluate(id => window.SheetCloud.shareGet(id).then(r => r.json), shareId);
  const inviteCode = decodeURIComponent(invite.match(/code=([^&]+)/)[1]);
  check('the shared copy has no party list or invite code', !copy.includes('"parties"') && !copy.includes(inviteCode) && !copy.includes('"share"'), 'true');
  await pl.click('[data-a="shareOff"]'); await dlgBtn(pl, 'Stop sharing'); await wait(1200);
  const anon2 = await user('anon2'); await anon2.goto(shareLink);
  check('after Stop sharing, the link says so', !!(await until(() => anon2.locator('.dlg', { hasText: 'doesn’t work anymore' }).count(), 15000)), 'true');

  /* ---------- a second GM ---------- */
  console.log('Second GM');
  const gm2 = await user('gm2'); await gm2.goto(BASE + '?emu&beta'); await ready(gm2); await signIn(gm2, 'gm2@test.example');
  await gm2.goto(gmInvite); await ready(gm2);
  check('the GM invite asks to confirm', !!(await until(() => gm2.locator('.dlg h2', { hasText: 'Become a GM' }).count(), 12000)), 'true');
  await dlgBtn(gm2, 'Join as GM');
  check('the second GM sees the dashboard', !!(await until(() => gm2.locator('.pcard', { hasText: 'Tova Rask' }).count(), 12000)), 'true');

  /* ---------- removing and leaving ---------- */
  console.log('Removing');
  await gm.locator('.pcard', { hasText: 'Tova Rask' }).locator('[data-a="partyKick"]').click(); await dlgBtn(gm, 'Remove');
  check('the card goes away', await until(async () => (await gm.locator('.pcard').count()) === 0, 10000) ? 'gone' : 'still there', 'gone');
  await go(pl, 'Play', 'Sheet'); await pl.fill('#amt', '5'); await pl.click('[data-a="hpDo"][data-k="dmg"]');
  check('the removed player is told', !!(await until(() => pl.locator('#toast', { hasText: 'isn’t in the party “Tuesday group” any more' }).count(), 10000)), 'true');
  await go(pl, 'Advanced', 'Save');
  check('the party drops off the character', await pl.locator('#main section', { hasText: 'Share and parties' }).locator('[data-a="partyLeave"]').count(), '0');
  check('the removed player’s own save still works', !!(await until(() => pl.locator('#cloudStat', { hasText: 'Saved to your account' }).count(), 10000)), 'true');

  check('no page errors', errors.length ? errors.join(' | ') : 'none', 'none');
  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
