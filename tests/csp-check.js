/* Spheres Character Sheet: checks the script policy (tools/csp.js) against the page.
   Serves public/ with the policy ENFORCED (stricter than the report-only mode the site uses for now) and checks that:
   the sheet's own scripts run (the hashes match), Firebase's scripts load, nothing the sheet does is blocked while
   clicking around, and a script slipped into the page (the kind of injection the policy is for) is blocked.

     npm i --no-save firebase@10.12.2      (Firebase's own files are served locally: no network needed)
     node tests/csp-check.js

   Sign-in itself can't be tested here (it needs Google's real servers): that's what report-only mode on the live site is for. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { policy } = require('../tools/csp.js');

const PUB = path.resolve(__dirname, '..', 'public'), PORT = 5056, BASE = `http://127.0.0.1:${PORT}/`;
const FB = path.dirname(require.resolve('firebase/package.json'));
let pass = 0, fail = 0;
function check(what, got, want) { const ok = String(got).trim() === String(want); ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok ? '' : `: got "${got}", expected "${want}"`)); }
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'), P = policy(html);
  check('the policy names both of the sheet’s own scripts', P.scripts, 2);
  const server = http.createServer((q, r) => {
    const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(PUB)) { r.writeHead(403); r.end(); return; }
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': /\.json$/.test(f) ? 'application/json' : 'text/html; charset=utf-8', 'Content-Security-Policy': P.text }); r.end(b); });
  }).listen(PORT);
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  /* Firebase's files from the local package; Google's servers and fonts never reached */
  await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/*', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(FB, r.request().url().split('/').pop())) }));
  await ctx.route(/googleapis\.com|fonts\.gstatic\.com|apis\.google\.com/, r => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline'))); });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE); await page.waitForTimeout(800);
  check('the sheet’s main script runs under the policy', await page.locator('button[data-k="striker"]').count() > 0, true);
  check('the Firebase script runs and loads Firebase from gstatic', !!(await page.waitForFunction(() => window.SheetCloud, null, { timeout: 15000 }).catch(() => null)), true);
  await page.click('button[data-k="striker"]'); await page.waitForTimeout(500);
  for (const g of await page.$$eval('#tabbar [data-tgrp]', bs => bs.map(b => b.dataset.tgrp))) {
    await page.click(`#tabbar [data-tgrp="${g}"]`); await page.waitForTimeout(150);
    for (const t of await page.$$eval('#tabbar [data-tab]', bs => bs.map(b => b.dataset.tab))) { await page.click(`#tabbar [data-tab="${t}"]`); await page.waitForTimeout(120); }
  }
  await page.evaluate(() => { window.print = () => {}; const b = document.createElement('button'); b.dataset.a = 'print'; document.getElementById('main').appendChild(b); b.click(); }); await page.waitForTimeout(300);
  check('nothing the sheet does is blocked (every tab, print)', (await page.evaluate(() => window.__csp)).join(' | ') || 'none', 'none');
  check('no page errors', errors.join(' | ') || 'none', 'none');

  /* the point of the policy: a script slipped into the page doesn't run */
  await page.evaluate(() => { window.__pwned = 0; const d = document.createElement('div'); d.innerHTML = '<img src="x" onerror="window.__pwned=1">'; document.body.appendChild(d);
    const s = document.createElement('script'); s.textContent = 'window.__pwned=2'; document.body.appendChild(s); });
  await page.waitForTimeout(400);
  check('an injected inline script and an onerror= attribute are both blocked', [await page.evaluate(() => window.__pwned), (await page.evaluate(() => window.__csp)).filter(v => /^script-src/.test(v)).length >= 2].join(' '), '0 true');

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
