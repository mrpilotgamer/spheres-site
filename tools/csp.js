#!/usr/bin/env node
/* Spheres Character Sheet: the page's script policy (Content-Security-Policy).

   The sheet's own scripts are inline (inside index.html), so the policy names them by hash, and the hashes change with every
   edit of the page. That's why the policy isn't written into firebase.json by hand: GitHub works it out from the page
   being deployed, just before each deploy.

     node tools/csp.js                       print the policy for public/index.html
     node tools/csp.js --write firebase.json add it to that config (as Content-Security-Policy-Report-Only), for a deploy

   Report-only (2026-11-09): browsers don't block anything yet; they only list in the console (F12) what the policy would
   have blocked. Watch for "Content-Security-Policy" messages during normal use, sign-in included. Once a while of real use
   shows none, change MODE below to 'enforce' and the policy starts protecting the page.

   Kept out of public/, so it's never deployed. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODE = 'report-only';   // 'report-only' or 'enforce'
const ROOT = path.resolve(__dirname, '..');

/* every inline script the browser runs (type="module" or no type): not the JSON data blocks, not scripts with src= */
function inlineScripts(html) {
  const out = [], re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1], type = (/\btype\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue;
    out.push(m[2]);
  }
  return out;
}
const hash = s => "'sha256-" + crypto.createHash('sha256').update(s, 'utf8').digest('base64') + "'";

function policy(html) {
  const scripts = inlineScripts(html);
  if (!scripts.length) throw new Error('no inline scripts found in the page: is this the sheet?');
  const d = {
    'default-src': ["'self'"],
    /* the sheet's own scripts; Firebase from gstatic; Google sign-in loads its helper from apis.google.com */
    'script-src': ["'self'"].concat(scripts.map(hash), ['https://www.gstatic.com', 'https://apis.google.com']),
    /* the database, sign-in and its tokens */
    'connect-src': ["'self'", 'https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com',
      'https://www.googleapis.com', 'https://apis.google.com', 'https://www.gstatic.com'],
    /* the sign-in window and its hidden helper frame (served from the site itself, or the firebaseapp.com address) */
    'frame-src': ["'self'", 'https://spheres-character-sheet.firebaseapp.com', 'https://spheres-character-sheet.web.app', 'https://accounts.google.com', 'https://apis.google.com'],
    /* account pictures come from Google; downloads and pictures made by the page use blob: and data: */
    'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
    /* the page sets styles inline all over (style="…"), and loads its fonts from Google Fonts */
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
  };
  return { text: Object.keys(d).map(k => k + ' ' + d[k].join(' ')).join('; '), scripts: scripts.length };
}

function write(configPath, text) {
  const file = path.resolve(configPath), cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const h of cfg.hosting.headers || []) {
    /* the page blocks that already carry the framing policy (the same paths also have separate caching blocks) */
    if ((h.source !== '/' && h.source !== '**/*.html') || !h.headers.some(x => x.key === 'Content-Security-Policy')) continue;
    h.headers = h.headers.filter(x => x.key !== 'Content-Security-Policy-Report-Only');
    if (MODE === 'enforce') {
      /* one Content-Security-Policy header holds both the framing rules already there and the script rules */
      const cur = h.headers.find(x => x.key === 'Content-Security-Policy');
      const extra = text.split('; ').filter(d => !/^(object-src|base-uri|form-action) /.test(d)).join('; ');
      if (cur) cur.value = cur.value.replace(/;\s*$/, '') + '; ' + extra; else h.headers.push({ key: 'Content-Security-Policy', value: text });
    } else h.headers.push({ key: 'Content-Security-Policy-Report-Only', value: text });
    n++;
  }
  if (n !== 2) throw new Error(configPath + ': expected the "/" and "**/*.html" header blocks, found ' + n);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  return n;
}

if (require.main === module) {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8'), p = policy(html);
  const i = process.argv.indexOf('--write');
  if (i > 0) { write(process.argv[i + 1] || path.join(ROOT, 'firebase.json'), p.text); console.log('Added the script policy (' + MODE + ', ' + p.scripts + ' inline scripts) to ' + (process.argv[i + 1] || 'firebase.json')); }
  else console.log(p.text);
}
module.exports = { policy, inlineScripts, MODE };
