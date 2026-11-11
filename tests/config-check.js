/* Spheres Character Sheet: checks that the test config (firebase.emulators.json) matches the real one (firebase.json).
   The emulator config is firebase.json plus the auth and emulator settings; when a header or setting changes in one,
   it has to change in the other, or the tests run against a site that isn't the one that goes live.
   It also reads the GitHub workflow as text and catches the YAML mistake that once got past us: an unquoted step name or
   one-line command that contains ": " (GitHub refuses the whole file). There is no YAML library here, so this is a
   deliberately narrow check, not a parser.

     node tests/config-check.js        (no installs needed) */
const fs = require('fs');
const path = require('path');

const read = f => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'));
const live = read('firebase.json'), emu = read('firebase.emulators.json');
let pass = 0, fail = 0;
function check(what, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? '  ok   ' : '  FAIL ') + what + (ok || !detail ? '' : ': ' + detail)); }

const strip = h => { const x = JSON.parse(JSON.stringify(h || {})); delete x.predeploy; return x; };
const a = JSON.stringify(strip(live.hosting)), b = JSON.stringify(strip(emu.hosting));
check('hosting settings match (headers, ignore list, folder)', a === b, 'firebase.json and firebase.emulators.json differ: copy the "hosting" block across (without "predeploy")');
check('the same database rules file', JSON.stringify(live.firestore) === JSON.stringify(emu.firestore));
check('the emulator config never points at the real project', !('projects' in emu) && !/spheres-character-sheet/.test(JSON.stringify(emu)));

const hdr = (src, key) => ((live.hosting.headers || []).find(h => h.source === src) || { headers: [] }).headers.find(x => x.key === key);
check('pages say: don’t guess file types (nosniff)', !!hdr('**', 'X-Content-Type-Options'));
check('pages can’t be framed by other sites', /frame-ancestors 'self'/.test((hdr('/', 'Content-Security-Policy') || {}).value || '') && /frame-ancestors 'self'/.test((hdr('**/*.html', 'Content-Security-Policy') || {}).value || ''));

/* ---------- .github/workflows/deploy.yml (checked as text; no YAML library) ---------- */
/* Returns the problems on one line: an unquoted `name:` or one-line `run:` value that has ": " in it (or ends in ":"),
   which YAML reads as a second key. A trailing " # comment" is not part of the value. */
function yamlLineProblems(line) {
  const m = /^(\s*)(?:- )?(name|run):[ \t]+(.*?)\s*$/.exec(line);
  if (!m) return [];
  const v = m[3];
  if (!v || /^["'|>]/.test(v)) return [];
  const bare = v.replace(/\s+#.*$/, '');
  return /: |:$/.test(bare) ? ['unquoted ' + m[2] + ' value contains a colon: quote it or reword it'] : [];
}
const wf = fs.readFileSync(path.resolve(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
const wfLines = wf.split('\n');
check('workflow self-test: the mistake that broke GitHub is flagged', yamlLineProblems('      - name: Check the rules engine directly (fast: no clicking)').length === 1);
check('workflow self-test: the quoted version, a plain name, a run line and a URL are not flagged', [
  '      - name: "Check the rules engine directly (fast, no clicking)"', '      - name: Install the test tools', '        run: node tests/talents-check.js && node tests/config-check.js',
  '        run: curl -s https://example.com/x', '        run: |', '      - uses: actions/setup-java@v5   # the Firebase emulators need Java'].every(l => !yamlLineProblems(l).length));
check('workflow self-test: a trailing comment may hold a colon, a name ending in a colon is flagged', !yamlLineProblems('      - name: Fine   # note: ok').length && yamlLineProblems('      - name: Oops:').length === 1);
check('workflow has no tab characters', !/\t/.test(wf));
const wfBad = wfLines.map((l, i) => yamlLineProblems(l).map(p => 'line ' + (i + 1) + ': ' + p + ' (' + l.trim() + ')')).flat();
check('workflow: no unquoted name or run value contains ": "', !wfBad.length, wfBad.join('; '));
check('workflow has both jobs, test and deploy', /^  test:\s*$/m.test(wf) && /^  deploy:\s*$/m.test(wf));
check('workflow: deploy still only runs for pushes to main', wf.includes("if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
