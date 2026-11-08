# Spheres Character Sheet: project notes

Hand this file to a new chat together with the latest `Spheres_Character_Sheet.html` (the
same file as `public/index.html` on the site). For rules questions, also attach the wiki
bundle (`SoP-Claude-Bundles` zip, the offline Spheres of Power wiki), or at least the parts
you need.

Game: **Pathfinder 1e with Spheres of Power, Might and Guile** (Drop Dead Studios).

---

## Where things live

| What | Where |
|---|---|
| Live site | https://spheres-character-sheet.web.app |
| Firebase project | `spheres-character-sheet` (console.firebase.google.com, owner's Google account) |
| Hosting folder | Google Cloud Shell, `~/spheres-site` (shell.cloud.google.com) |
| The sheet | `~/spheres-site/public/index.html`, the same file as `Spheres_Character_Sheet.html` |
| Database rules | `~/spheres-site/firestore.rules` |
| Firebase settings | `~/spheres-site/firebase.json`, `~/spheres-site/.firebaserc` |
| Talent and drawback descriptions | `~/spheres-site/public/talents/` (built from the wiki bundle; deployed with the site) |
| Build script | `~/spheres-site/tools/build-talents.py` (not deployed) |
| Tests | `~/spheres-site/tests/` (not deployed) |
| Licence (2026-11-08) | `LICENSE.md`: the sheet's own code and notes under CC BY 4.0 (credit "Spheres Character Sheet by mrpilotgamer"); the wiki rules text (`public/talents/`, the `#…Lib` data blocks) under the OGL 1.0a, text and section 15 notices in `OGL.md` (copied from the wiki's Legal & OGL page, with this site's notice added). Keep both files if the repository goes public |
| GitHub (set up 2026-11-08) | a private repository holding the whole `spheres-site` folder; `.github/workflows/deploy.yml` tests and deploys every push to `main` |

Cloud Shell keeps the folder between visits, but Google deletes it after about 4 months of not
opening Cloud Shell. If it's gone, re-upload the site zip (or rebuild it from the "Hosting
files" section below), then unzip it and run `firebase login --no-localhost`.

## Updating the site

**Once the GitHub repository is set up (see "GitHub and automatic deploys" below), this is the normal way:** on
github.com, open the repository, go into `public/`, choose **Add file → Upload files**, drop in the new sheet *renamed to*
`index.html`, and click **Commit changes**. The **Actions** tab then runs the checks (about 3 minutes) and, if they all
pass, puts it live. A red ✗ means a check failed and nothing changed on the site; click it to see which. The Cloud Shell
steps below still work as a fallback.

**Quick check before every deploy (2026-11-06):** `firebase.json` has `"predeploy": ["node \"$PROJECT_DIR/tests/talents-check.js\""]`,
so every `firebase deploy` (Cloud Shell or GitHub) first checks the description files and stops if one is broken.

1. Open shell.cloud.google.com. Click **⋮ → Upload** and choose the new sheet file.
2. Run:
   ```
   mv ~/Spheres_Character_Sheet.html ~/spheres-site/public/index.html
   cd ~/spheres-site && firebase deploy
   ```
   If `firebase` isn't found, use `npx firebase-tools deploy`.

   **If the upload stalls with `ConnectTimeoutError … upload-firebasehosting.googleapis.com`** (happened 2026-11-06 with
   the 75-file talents deploy): Node in Cloud Shell can't open its connections, even though the server is reachable
   (`curl https://upload-firebasehosting.googleapis.com/` answers 405 at once). Force IPv4, then deploy again; finished
   uploads are kept, and the live site doesn't change until every file is up:
   ```
   export NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"
   cd ~/spheres-site && firebase deploy --only hosting
   ```
   Still failing: restart Cloud Shell (⋮ → Restart), or deploy in two parts (move `public/talents` out, deploy,
   move it back, deploy again; the second deploy is needed or talent rows can't load their text).
3. Players get the new version when they reload. Saved characters aren't touched.

**When the wiki bundle changes** (a new `SoP-Claude-Bundles` zip), rebuild the description files too:
1. Upload the bundle zip to Cloud Shell, then:
   ```
   cd ~ && rm -rf SoP-Claude-Bundles && unzip -q SoP-Claude-Bundles-*.zip
   cd ~/spheres-site && python3 tools/build-talents.py ~/SoP-Claude-Bundles
   node tests/talents-check.js
   firebase deploy
   ```
2. The script prints how many spheres, talents and drawbacks it found and anything odd ("check: ..."). If
   `talents-check.js` fails, the wiki layout probably changed: fix the script before deploying. The old files stay
   live until you deploy.
3. Browsers keep the files for up to an hour (`Cache-Control` in `firebase.json`), so new text can take that long to show.
Normal sheet updates don't need this step; the `talents/` folder stays as it is.

**Checks before deploying (optional):** `tests/check.js` opens the sheet in a headless browser, loads
both example characters and runs 259 checks against values worked out by hand (HP, AC, saves,
DCs, spell points, talents, skill ranks, attacks, toggles, the theme, free sphere ranks, blast augments, Roll20 macros,
raised undead, temporary talents, cohorts, Workshop, wiki descriptions, adding talents from the wiki and more). It sits outside `public/`, so it is never deployed. Run it with:
```
cd ~/spheres-site && npm i playwright && npx playwright install chromium && node tests/check.js
```
When you change an example on purpose, update its expected numbers in the script.

`tests/talents-check.js` (30 checks, no browser, a second) checks the description files in `public/talents/`:
`node tests/talents-check.js`. The wiki-description part of `check.js` reads those files too, so build them first.

The other three tests (`rules-check.js` 70 checks, `party-check.js` 31, `save-check.js` 12) test the database rules and
cloud saving. They need the Firebase emulator, which needs Java (Claude's cloud sessions have it). Install the tools once
with `npm i --no-save firebase-tools@13 firebase@10.12.2 @firebase/rules-unit-testing@3` (not Playwright: a second copy
won't match the installed browser), then:
`npx firebase emulators:exec --only firestore --project demo-spheres "node tests/rules-check.js"` and, for the two that
also need the sign-in emulator, `npx firebase emulators:exec --config firebase.emulators.json --only firestore,auth
--project demo-spheres "node tests/party-check.js"` (same for `save-check.js`). `firebase.emulators.json` is
`firebase.json` plus the auth and emulator settings; it's only for tests. GitHub doesn't run these three.
Last full run: 2026-11-08 (playtest batch), `check.js` 259, `talents-check.js` 30, `rules-check.js` 70, `party-check.js` 31,
`save-check.js` 12: all passed.

**Rollback:** Firebase console → Hosting → release history → roll back. With GitHub: also revert the commit (the
commit's page → "Revert"), or the next push puts the broken version back.

### GitHub and automatic deploys (set up 2026-11-06)
- **Files:** `.gitignore` (leaves out `node_modules/`, `release/`, `.firebase/`, debug logs) and
  `.github/workflows/deploy.yml`: on a push to `main` (or "Run workflow" on the Actions tab) it runs
  `tests/talents-check.js`, installs Playwright and Chromium, runs `tests/check.js`, then deploys hosting with
  `FirebaseExtended/action-hosting-deploy@v0` (`channelId: live`).
- **Secret:** `FIREBASE_SERVICE_ACCOUNT_SPHERES_CHARACTER_SHEET` (repository → Settings → Secrets and variables → Actions),
  made by `firebase init hosting:github`. If that command named it differently, change the name in `deploy.yml` to match.
- **Not deployed by GitHub:** the database rules. After changing `firestore.rules`, run `firebase deploy --only firestore`
  from Cloud Shell (or a computer with the Firebase CLI).
- **Working with Claude:** attach the repository to a Claude Code session instead of uploading zips; it can change the
  files and push, and the push deploys.


**One rule when changing the code:** if you rename or restructure fields that are *saved* on
a character, also convert old saves in `sanitizeChar()`. Old saves are converted there when
they load (for example the old talent settings `'0'`, `'1.5'`, `'2'` via `TALP_OLD`). Adding
fields, layout changes and rules maths don't need this.

---

## How the sheet is built

**One self-contained HTML file.** It has no build step and no external code, except Google Fonts
and (on the website only) the Firebase SDK from gstatic.

Script blocks inside, in order:
1. `#savedState`: a JSON slot. **Save file** writes the character in here, so a downloaded file
   reopens with that character.
2. **Firebase module** (`type="module"`). It only runs on http(s), and it defines `window.SheetCloud`
   (`signIn`, `signOut`, `onUser`, `list`, `get`, `put`, `del`). The config is here; it isn't a secret.
   The SDK is version 10.12.2 from `https://www.gstatic.com/firebasejs/10.12.2/`.
3. **Rules data blocks** (`type="application/json"`, read once at start-up):
   - `#traitLib` (about 65 KB): 160 Alteration traits (see the `#traitLib` entry under Open items).
   - `#classLib` (about 76 KB): 344 classes (see "Class list").
   - `#wsLib` (about 26 KB): Workshop formulae, toxins, mutagens and herbs.
   - `#persLib` (about 23 KB): persona tropes and quirks.
   - `#baseLib` (about 293 KB): base sphere abilities pulled from the wiki for 70 spheres (OGL text),
     keyed by lowercase sphere name: `{n:name, k:'magic'|'combat'|'skill', a:[[ability, markdown], …]}`.
4. **The main script** (classic IIFE), in sections:
   - **Rules engine (no DOM):** `derive(ch)` computes every number into `D`, keeps a breakdown per
     stat in `D.bd[key]`, and puts situational bonuses in `D.sit`.
   - **Formula parser:** `fParse` / `evalF` handle plain-language formulas like "hd, minimum 3" and
     "1 per 2 levels". The variables formulas can use are in `V` (lvl, hd, bab, cl, msb, castmod, pm,
     str…cha, dc, mdc, spmax, close/medium/long, durcl).
   - **Example characters (2026-11-01):** `exampleIncanter()` (Ilyra Voss, Incanter 12) and
     `exampleStriker()` (Tova Rask, Striker 12), built from the wiki to show the sheet's features. They
     replaced the old Bren and Collective examples. Loading one runs it through `sanitizeChar`. Details in
     "Example characters" below.
   - **Dialog** (`modal`), state and storage, then a render function per tab: `rSheet`, `rBuild`,
     `rTrad`, `rSkills`, `rTalents`, `rPicks`, `rMods`, `rActs`, `rGear`, `rRules`, `rSave`, plus
     `homeHTML` for the character list.
   - **Actions:** the `A` object; buttons use `data-a="name"`. They go through `runAction`, which
     records undo and saves.
   - **Field binding:** inputs use `data-f="path.to.field"` and edit the character directly.
   - **Repaint:** `paint()` keeps open sections, scroll positions, half-typed text and focus.
   - **Level-up dialog:** `levelUpFlow`, in 5 steps.
   - **Cloud sync** (`CL`, `cloudSoon`, `cloudPush`, `syncOpen`, `refreshList`).
   - **Tabs (2026-10-26 QOL pass):**
     - `TGROUPS` sorts the tabs into Play, Character and Advanced.
     - `goTab(tab)` switches tab and remembers it in `UI.lastIn`.
     - The sticky `#tabbar` sits outside the header, which scrolls away.
     - Gear and Notes are separate tabs (`rGear`, `rNotes`). Movement and damage reduction moved to Build.
   - **One-line rows:**
     - `itemD(key, summary, form)` wraps a row in `<details class="item" data-keep=…>`.
     - `UI.openNew` opens a row that was just added.
     - Used for talents and feats (`pickRow` = `pickSum` + `pickForm`), tradition grants, weapons and actions.
   - **Toasts:** `say(text)` logs the text and shows a toast with Undo after the action runs (`showToast`).
   - **Dialogs:** `modal({check})` can return an error message, which shows inside the dialog and keeps it open.
   - **Modifiers:** the Affects box is a search input (`data-tgt`, datalist `tgtList`). Formula results (`.fres`) update as you type.
   - **Gear tab (2026-10-27).** Built from the Google AutoSheet Equipment page.
     - **Slots:**
       - `SLOTDEF` lists the 12 slots. `BODIES` lists which slots each body type gets (Ultimate Wilderness, Magic Item Slots).
       - `slotsFor(body, extra)` gives the slot counts. `ch.bodyType` and `ch.slotExtra` hold your setup; companions have their own, with `compBody(c)` as the default.
     - **Items:**
       - Gear items gain these optional fields: `cat` (worn, magic, consumable, alch, gear), `price`, `where`, `uses`, `usesMax` and `dc`.
       - `where` is `''` (on you), `c:<companion id>`, `k:<container id>` or `stored`.
       - `gCat(g)` works out the category for old items from their slot.
     - **Containers** live in `ch.containers` and start from `KPRESETS`. The contents of an extradimensional container don't count toward anyone's load.
     - **Load:** `gearWeight(ch, carrier)` gives the weight. `ch.carry` holds an extra carrying Str and a multiplier; a masterwork backpack adds +1 Str through `strBonus`. Companions get their own load from their Str, size and body type.
     - **Wealth** = coins + price × quantity for items and containers.
     - **Sheet tab:** a "Potions, scrolls & wands" card with Use buttons.

**Wiki descriptions (2026-11-06).** Talent, drawback and boon text from the wiki, loaded on demand.
- **Files** (`public/talents/`, made by `tools/build-talents.py`; 4.1 MB, 1.1 MB gzipped):
  - `<sphere>.json` (72 files, 10–290 KB): `{v, n, k, url, cols, t:[[name, heading, section, kind, md, page], …]}`.
    `kind` is `''`, `'advanced'` or `'legendary'`; `md` is the wiki text; `page` is the wiki page slug.
  - `drawbacks.json`: `{d:[[name, heading, group, md, page, sphere], …]}` (517 rows; `sphere` is set for sphere-specific ones).
  - `index.json` (147 KB, 34 KB gzipped): `{spheres:{slug:{n, k, c, p}}, names:[[name, slug, kind], …]}`.
  - Sphere file names come from `wkSlug()` (the script's `slug()`): lower case, `[…]`/`(…)` and the word "sphere"
    removed, other characters to `-`. "Nature 2" merges into Nature; Origins splits into Aptitude, Essence and Form.
- **What the script keeps:** sphere pages from bundles 02/03/04 plus `equipment-sphere` from 09; drawbacks and boons
  from 08. Only the first `**Tab:**` part of a page (Ultimate). Pages repeat an old copy further down without a tab
  marker; the script stops when a section that already held entries comes again at the same or a higher heading level,
  and skips headings starting with "Old". A talent is any leaf heading (level ≤ 4) under a heading containing
  "Talents" (not "Talent Types", not "Feats"). Talents only in the old copy (War's Greater Rally, Light's Illuminate…)
  are left out on purpose.
- **Loading:** nothing loads until a row opens. `wkBox` draws a placeholder with `data-wkneed`; `wkScan()` (after each
  `paint()` and on every `toggle` of a `<details>`) fetches what open rows need with `wkGet(file)`, once per visit
  (`WK.f[file]` = `'loading'` | `'err'` | data). When a file arrives, `paintSoon()` redraws. From `file://` (a
  downloaded sheet) it fetches from `https://spheres-character-sheet.web.app/talents/`, which works because
  `firebase.json` sends `Access-Control-Allow-Origin: *` for `/talents/**`; offline it says so, with Try again and a wiki link.
- **Matching** (`wkTalent`, `wkDrawback`): names compared by `wkNorm()` (lower case, `[…]` and `(…)` dropped,
  letters and digits only). Order: the pick's `ref` → same name in the pick's sphere → the same name in exactly one
  other sphere (shown with "Found in the X sphere, not Y") → not found, with up to 4 suggestions (letter-pair
  likeness ≥ 0.55, same sphere preferred) and a search box. Drawbacks prefer the row whose sphere matches, then
  general ones, then boon/drawback kind; a trailing "boon" or "drawback" in the name is ignored if that's needed to match.
- **Saved field:** `ref` on a talent pick, tradition grant, drawback, boon or `sphDrawbacks` row:
  `{s: file, n: normalized name, k: sphere (drawbacks only)}`. Only set when a player links by hand.
  `sanitizeChar` (`refOk`) drops a malformed one.
- **UI:** in a talent's row (not base spheres), above the fields: heading, tags, "Advanced"/"Legendary", sphere ·
  section, "Wiki ↗", the text (over 900 characters starts clipped, "Show all"), "Your notes are the same as this text.
  Clear my notes" when the notes repeat it, and "Not the right text?" (search). Linked rows show "Linked by hand",
  "Rename to <wiki name>" (when different) and "Unlink". Drawbacks and boons get a collapsed "Wiki text" under their
  fields (Traditions tab, and the drawback editor on a sphere card). Read-only views show the text without the controls.
- **Actions:** `wkLink`, `wkUnlink`, `wkRename`, `wkClearNotes` (undoable), `wkPick`, `wkMore`, `wkRetry` (UI only).
  The search box (`data-wkq`, id `wkq-<path>`) fills `.wkres` on input without a repaint.
- `mdLite` now also draws numbered lists.
- **Adding talents from the wiki (phase 2, 2026-11-06).** Only `index.html` changed; the `talents/` files are the same.
  - **Search** (`data-wkpick`): the "Add a talent" name box (`tk`) and each level-up talent row (`lu`). Typing two or more
    letters lists up to 8 wiki talents (`wkFind`: every word in the name; the sphere typed in the Sphere box first, then
    spheres you have, then whole-word and starts-with matches, then shorter names), with sphere, Advanced/Legendary and
    "taken" tags. The index loads on focus. A name that isn't on the wiki says "it will be added as you typed it".
  - **Picking** fills name, sphere (the character's own spelling of it when they have it, `wkOwnSph`), type from the
    sphere (`wkKind`: magic/combat/skill, Origins → other) and, once the sphere file arrives, "Counts as" [Utility] when
    the heading has `[utility]` (`wkRoleOf`; only when "Counts as" was Talent or Utility). Typing over the name drops the pick.
  - **Talents tab preview** (`UI.tkPick`, `tkPickBox` in `#tk-prevbox`): the text, "You already have this talent",
    the GM-permission note for Advanced/Legendary, and "Also add the X base sphere" (`#tk-base`, ticked; `UI.tkBaseOff`)
    when the character has no talent in that sphere (`wkHasSphere`, from `talBySphere`). `addTalent` then adds the base
    sphere pick (like `addBase`: `abilities:[]`) before the talent.
  - **Level-up** (step 4): each row is now `<div class="talrow">` holding the inputs row, `.wkres` and `.lu-note`
    (`wkLuNote`: [utility], Advanced, the start of the text, a wiki link, and for a missing sphere "Add a row for the base
    sphere", which fires `wkaddbase` on `#talRows`). A picked row keeps `data-wkn/tk/role`; `read` saves them in
    `W.talMeta[line]` and `build` applies them through `luMeta` (type and utility role; base sphere rows untouched).
  - **Browse** (`wkBrowse(k)` at the bottom of each sphere card, not "(no sphere)"): "Browse the wiki's X talents"
    (`details.wkbrowse`, kept open across repaints). Talents grouped by wiki section, each a `details.wkbi` whose text is
    drawn only when opened (`wkBrowseFill`); a filter box (`data-wkbq`, DOM-only); "Hide the N I have" (`wkbHide`, UI only);
    "Add at level N" (`wkAddTal`: the wiki name, the card's sphere name, role and type as above, at the current level).
  - `wkGet(file, cb)` now takes a callback (`WK.cb`), used by the pickers, which live outside `paint()` (the level-up dialog).

**Saving:**
- **Browser storage:** `localStorage` keys `spheres-sheet-v1:<characterId>`, plus `:last` for
  the last character opened.
- **Google account:** Firestore `users/{uid}/characters/{characterId}` holding
  `{app, v, z (the character JSON, gzipped, as Bytes), enc:'gzip', name, summary, savedAt, updatedAt}`.
  Records saved before 2026-11-01 hold `json` (plain text) instead; they still open, and become `z` on their next save.
  Details in "Compressed account saves and size limits" below.
  - Saves are sent about 1.2 seconds after the last change.
  - On sign-in, on opening a character, and when you switch back to the tab, the newer copy
    wins (compared by `savedAt`).
- **Database rules:** a signed-in player can only read and write their own
  `users/{uid}/characters/*`, and the character must be either `z` under 1,000,000 bytes or
  `json` under 900,000 characters. Parties and share links have their own rules (see "Share links and parties").

**File size (measured 2026-11-06, before the wiki descriptions; they added 15 KB, about 5 KB gzipped):** `index.html` is 1.20 MB, about 350 KB gzipped. Firebase Hosting
compresses it automatically, so players download about 350 KB (less with Brotli). With `Cache-Control: no-cache`,
a reload re-downloads it only after a deploy; otherwise the browser gets a quick "not modified".

| Part | Raw | Gzipped |
|---|---|---|
| Main script | 657 KB | 207 KB |
| `#baseLib` | 293 KB | 86 KB |
| `#classLib` | 76 KB | 6 KB |
| `#traitLib` | 65 KB | 18 KB |
| `#wsLib` + `#persLib` | 49 KB | 14 KB |
| Styles, Firebase module, rest | about 60 KB | about 17 KB |

Downloading isn't a problem at this size. If it grows, the first things to split off are the large text libraries
(`baseLib` is next), fetched on demand like the talent descriptions. Note: **Save file** writes the whole 1.2 MB page
plus the character, so each downloaded character file is about 1.2 MB or more.

---

## Rules it implements (checked against the wiki)

**Spheres of Power:**
- **Caster level:** high = level, mid = ¾, low = ½ (each rounded down), added across classes.
  CL 0 counts as 1 for capabilities.
- **MSB** = levels in casting classes. **MSD** = 11 + MSB.
- **Concentration** = MSB + casting ability modifier.
- **Spell points** = casting class levels + casting ability modifier, minimum 1, plus tradition
  drawback points.
- **Magic DC** = 10 + ½ CL + casting ability modifier.
- **Ranges:** close 25 + 5 per 2 CL, medium 100 + 10/CL, long 400 + 40/CL.

**Spheres of Might:**
- **Martial DC** = 10 + ½ BAB + practitioner modifier (Wisdom if no practitioner class).
  The Martial DC tile shows for anyone with combat talents.
- **Combat talents:** expert 1/level, adept ¾, proficient ½.

**Free skill ranks from spheres (2026-11-01).** Wiki core rules, "Associated Skill":
- A sphere gives 5 ranks in its associated skill, +5 per further talent in it (so 5 × talents in the
  sphere, base included, tradition grants and bonus talents included), capped at Hit Dice. No skill points.
- Applies to the 17 skill spheres and the combat spheres Alchemy, Athletics, Beastmastery, Fencing,
  Gladiator, Leadership, Scoundrel, Scout, Tech, Tinker and Trap. `SSK` (next to `SKILLS`) lists each one's
  allowed skills (`s`), the wiki wording (`w`), talents that add a fixed extra skill (`x`: Read Foe →
  Sense Motive, Great Senses → Perception, Skilled Sneak → Stealth, Experienced Navigator → Knowledge
  (geography), Innate Spellhacking → Spellcraft, Military Training and Ace Pilot → Profession) and talents
  that add one of your choice (`c`).
- **Data:** `ch.sphSkills = {"<sphere name>": [skill ids]}` (extra Craft/Perform/... entries use their own
  ids). Unset = the default: the single allowed skill, if there is only one. `x` talents are always added.
  Renaming a sphere moves its entry.
- **Engine:** `sphRanks(c)` → skill id → [{sphere, v}]. In `deriveCore`, `skR()` combines bought and sphere
  ranks: sphere ranks first (capped at HD), bought ranks fill what's left, and the rest are `retrain`.
  **Two spheres (or packages) on one skill (changed 2026-11-08, owner's reading):** only the highest one's ranks count
  (Tinker: a competence bonus "instead of gaining additional ranks"; core rule: "do not gain more ranks than their usual
  maximum"; nothing online settles it), plus a competence bonus of ½ character level (min +1), passed to `tot()` as an
  `extra` line so it stacks properly. Before, the ranks were added up to the Hit Dice cap. `D.skills[id]` = {ranks (effective), bought, sph, retrain, ...};
  `D.skRetrain` lists the ones to retrain.
- **UI:** an "Associated skill" row on each such sphere card (`assocRow`, `data-assoc` selects, ×
  `assocDel`); "+N sphere" and "must retrain N" under the Ranks input on the Skills tab (`skSph`), and
  a "Must retrain" warning at the top (`retrainNote`). No retrain button: players lower the bought ranks
  themselves (user's choice). The level-up skill step caps each skill at the new level minus its sphere ranks; since
  2026-11-08 it comes after the talents step and counts the spheres picked there (`SPN = sphRanks(build().c2)`).
- The Beastmastery tamed-animal cap now uses effective Handle Animal ranks.

**Spheres of Guile (skill expertise):** each tier gives "Any" and [utility] talents.
- **Virtuoso:** Any = n − ⌊n/4⌋, Utility = ⌊n/2⌋.
- **Journeyman:** Any = ⌊n/2⌋, Utility = ⌈n/2⌉.
- **Trained:** Any = ⌊n/4⌋, Utility = ⌈n/2⌉.
- These match all 60 rows of the wiki table.
- [utility] picks fill utility slots first; any extras count against Any.
- The **Utilitarian Talent Progression** variant is a per-class checkbox. It splits a magic or
  combat progression the same way: full rate uses the Virtuoso numbers, ¾ Journeyman, ½ Trained.
- The **Bravo** is exactly Virtuoso (blended training).

**Talents:**
- **Guide:** "From casting & martial progressions" adds the casting, martial and skill expertise
  progressions, plus each class's bonus talents.
- **+2 bonus magic talents** are added automatically when the character has a casting tradition
  or casting class, except under a unified tradition (which lists them itself).
- **"Counts as" (`role` on a talent pick):**
  - `sphere`: base sphere, costs 1. Base abilities are stored on it, free, with descriptions.
  - `basefree`: a base sphere given by a class feature.
  - `talent`: costs 1.
  - `utility`: a [utility] talent.
  - `bonus`: free.
- **Auto-detected roles:** names like "X sphere" become base spheres, and names containing
  "[utility]" become utility talents.
- Talents and feats a tradition gives are always free.

**Traditions (Traditions tab):**
- **Casting:** each boon costs 2 general drawbacks. Drawbacks left over give bonus spell points:
  - 1 drawback: +1, +1 per 6 casting levels.
  - 2: +1, +1 per 3.
  - 3: +1 per odd casting level.
  - 4: +1, +1 per 1.5 casting levels.
  - 5 or more: +1 per casting level.
- Some general drawbacks count as 2. Each sphere-specific drawback adds 1 magic talent.
- **Martial:** records what the tradition gives; the practitioner ability is set here too.
- **Trade:** rank is competent or adroit; some grants count only at adroit. The tradition replaces
  class skills with Craft, Perception, Perform and Profession plus the skills its trade talents
  give (this can be switched off).
- **Unified:** casting + martial under one name.
- Each tradition can be exported to a file and imported by anyone at the table.

**Class feature choices (Feats & features tab):**
- A class feature pick can hold the choices made under it (knacks, arsenal tricks, haunts…) in
  `p.subs = [{name, lvl, notes}]`.
- A separate feature can be moved in with "Put this under another feature".
- In the level-up dialog, a line "Feature: Choice" files the choice under that feature, and
  creates the feature if it doesn't exist yet.

**Companions tab** (`ch.companions`, functions `compStats` and `compCard`):
- **Kinds:** conjuration, undead, tamed, animal, cohort, other.
- **Conjuration companion** (Table: Companion), worked out from your caster level:
  - Hit Dice = CL − ⌊CL/4⌋. BAB = Hit Dice. d10 Hit Die.
  - Good saves 2 + ⌊HD/2⌋, bad saves ⌊HD/3⌋.
  - Natural armor = the form's base + ⌊HD/2⌋.
  - Feats 1 + ⌊(HD−1)/2⌋, and +1 ability increase per 4 HD.
  - Evasion at 2 HD, Devotion at 5, Multiattack at 7, Improved evasion at 11.
  - The seven base forms (avian, biped, ooze, orb, quadruped, serpentine, vermin) set the
    starting stats. Small: +2 Dex, −2 Str.
- **Other kinds** take HD, Hit die, BAB rate, good saves and abilities. HP is the average per
  Hit Die + Con (or Cha for undead) × HD; a formula can override it.
- **Attacks:** primary natural gets 1½ × Str if it's the only natural attack; secondary is −5
  with ½ Str; melee weapons get iterative attacks.
- **Caps shown:** Death sphere undead (active Hit Dice ≤ 2 × CL), and Beastmastery tamed
  animals (Hit Dice ≤ Handle Animal ranks).
- **Formulas** see your stats plus `chd`, the companion's Hit Dice.
- **Long rest:** conjuration companions heal fully; others heal 1 hp per Hit Die.
- **Sheet tab:** a Companions card shows the ones marked present.

**Added from the Google Sheet checklist** (`SHEET_PARITY_CHECKLIST.md` has the item-by-item record):
- **Class list.** `#classLib` holds 344 classes:
  - from the Google Sheet: Paizo base, hybrid, occult, prestige and NPC classes, creature types, psionics and Path of War (Eberron prestige classes removed 2026-10-26: no source to verify them), with HD, BAB, saves, skills and class skills;
  - from the wiki: Spheres classes with their casting, martial and skill progressions.

  "Add from the class list" on the Build tab, or "From the class list…" in level-up. Archetypes are manual edits afterwards.
- **Class options:**
  - "Prestige class saves" (good ⌊(n+1)/2⌋, poor ⌊(n+1)/3⌋);
  - "Extra [utility] talents" at even or odd levels;
  - Talents "Skill expertise only (blended operative)".
- **Hit points:** a "Hit points & Fortitude use" setting (Con, Cha for undead, none for constructs). Picking Undead or Construct sets it.
- **Attacks:**
  - weapon kinds: melee, ranged, primary or secondary natural, combat maneuver, and core monk flurry;
  - per weapon: hand, light, caster level instead of BAB, any ability including the casting modifier, a custom multiplier and damage type;
  - Combat options: two-weapon fighting level, Double Slice and Multiattack;
  - modifier targets `extra.melee`, `extra.ranged`, `atk.first`, `dmg.first` and `size` (steps). Size changes step weapon dice (`scaleDice`).
- **Conditions:** 26 now. Conditions can halve speed or set it to 0 (`CONDS[i][3].speed`), and set abilities to 0 (`zero`).
- **Movement:** climb, swim, fly and burrow speeds; fly maneuverability feeds the Fly skill; run and charge; and an armor-slowdown override.
- **DR and resistances:** DR entries with a bypass (and optionally a toggle), plus energy resistance targets. Resistances never stack: the best counts.
- **Armor:**
  - armor and shield presets (`ARMORS`, `SHIELDS`) and special materials (`MATS`);
  - materials and tower shields feed modifiers through `gearMods()`;
  - item slots on gear rows, with a duplicate warning.
- **Load:** always shown; penalties only with the "Track encumbrance" house rule.
- **Spheres:**
  - per-sphere targets `dc.sphere.<slug>` and `cl.sphere.<slug>`, shown on each sphere card;
  - actions can name a sphere and get a "How often" tag.
- **Skills:**
  - Artistry and Lore;
  - extra Craft, Perform, Profession, Artistry and Lore entries and custom skills (`ch.extraSkills`; ranks in `skillRanks[id]`);
  - "Minimum 4 + Int" house rule.
- **HP method:** `rules.hpMethod`, on the House rules tab.
- **"Add common toggles…"** (`COMMON`).
- **Optional XP** (`rules.xp`, `XPT`), age category, racial traits, proficiencies, notes on the main sheet cards, and background questions.
- **Print view:** `#printView` and `printHTML()`, filled on `beforeprint`. Main sheet first, then spheres and features.

**Pathfinder core:**
- **Stacking:** same-type bonuses don't stack; untyped, dodge, circumstance and penalties add up.
  The same source never counts twice.
- **AC:** touch and flat-footed computed; armor max Dex applies; masterwork reduces the armor
  check penalty by 1.
- **Size:** Fine to Colossal, affecting AC, attack, CMB/CMD, Stealth and Fly. Tiny or smaller
  use Dex for CMB.
- **CMB** picks up attack-roll bonuses and penalties (Power Attack, Heroism, shaken…).
- **CMD** = 10 + BAB + Str + Dex + size + the AC bonus types that apply; flat-footed loses Dex
  and dodge.
- **Conditions** apply their penalties (shaken also hits initiative; blinded −4 on Str/Dex
  skills; and so on). Negative levels apply once per total.
- **HP:** at least 1 per Hit Die. **Skill budget:** permanent Int only. Iterative attacks.
  Half speed in medium or heavy armor.

**House rules (per character, can be exported for the whole table):**
- Spell pool uses Int.
- Concentration = CL + Wis.
- Wis added to "per caster level" durations.
- DCs use the highest mental modifier.
- SR reduces magic damage.
- SR helps saves.
- Stances last until ended.
- Average HP when levelling.
- Maximum HP at 1st level.

**Checked against Archives of Nethys (2026-10-26).** d20pfsrd was blocked by the network policy, so AoN was the only source.
- **Matched AoN:**
  - carrying capacity (Table 7-4, plus biped and quadruped size multipliers);
  - XP chart (slow, medium, fast);
  - aging effects (cumulative −1/−3/−6 physical, +1/+2/+3 mental);
  - conditions;
  - dice scaling against Table 6-5;
  - Mystery Cultist and Sentinel HD, BAB and saves.
- **Fixed:**
  - Armor stats and weights now follow AoN's armor tables. Twelve armors were added.
  - "Stone Coat" was renamed Stone Lamellar.
  - Shields are split into wooden and steel. Klar, Madu, the dwarven war-shield and snarlshields were added.
  - Eel hide, fire-forged and frost-forged steel, and horacalcum count as masterwork. Horacalcum gives +1/+2/+3 initiative for light, medium and heavy armor.
  - 2d10 scales to 4d8 Large and 2d6 Tiny.
  - The Haste speed bonus is now `min(30, basespeed)`. `basespeed` is a new formula variable: land speed after armor and load.
  - Class skills added for Mystery Cultist and Sentinel.
- **Removed:** all 46 Eberron prestige classes (Windwright Commodore and others could not be verified). Old characters keep their copies.

---

## Open items and ideas

- **Raised undead (Death sphere Reanimate), 2026-11-05.** Undead companions can be worked out from a corpse.
  - **Data (2026-11-05, v3):** `c.rean = {tmpl:'skeleton'|'zombie'|'none', vars:[ids], what, flysrc:'wings'|'magic', hands, ex,
    dur:'timed'|'conc'|'perm', left, total (rounds), v2, v3}`. **The base creature is the companion's own stat block:** `c.hd`
    (racial Hit Dice), all six `c.abil` scores, `c.size`, `c.speed` (read with `parseSpeeds`) and `c.attacks`. The template is
    applied on top (Str +2 / Dex −2 or +2, no Con or Int, Wis and Cha 10 or the variant's); `c.inc`, `c.mods`, `c.traits` add
    after it. Template None shows the same stat block untouched, so a GM's custom creature can be typed in fully and a
    template applied (or removed) afterwards, and the base scores stay editable either way. Presets fill the whole stat line
    (Bestiary scores on Archives of Nethys). The first versions kept a separate corpse in `rean.hd/str/dex/spd/fly/other`;
    `sanitizeChar` moves it into the stat block once (`rean.v3`) unless the template was None. New undead companions start with `reanBlank()` (Human commoner zombie, not present).
    Old hand-entered undead have no `rean` and work as before ("Build it from a corpse" converts).
  - **Template: Zombie / Skeleton / None (2026-11-05, replaces "Stop using the template").** `rean.tmpl:'none'` = a creature typed
    in by hand (a GM's custom undead): the plain fields count, and the corpse data stays in `rean` so picking a template again
    restores it. A GM's custom creature *with* a template goes in the corpse fields. Switching never copies rows, so nothing is
    counted twice. The template's own claws or slam replace a kept attack of the same name.
  - **Cleanup of old copies:** the first version's `reanFreeze` copied template rows into `c.mods`/`c.traits`/`c.attacks`, and
    rebuilding then doubled them. `reanClean` removes them once (on load, or when rebuilding): modifiers from Empowered
    Reanimate, Superior Reanimation, Improved Initiative, Toughness or Revenant Militia on Str/Dex/init/hp/attack, traits that
    match the template's special-ability lines (`RN_TRAIT`), and slams or claws with "plus" extra damage. `rean.v2` marks it done.
    Rows players added themselves are kept unless they match those exact patterns.
  - **Engine:** `compStats` runs `reanView(c)` first (then a shapeshift form, if any), and `reanInfo` after: CR, casting check,
    specials. Tables `RN_NA`, `RN_ZHD`, `RN_CLAW`, `RN_SLAM`, `RN_CR`, variants `RN_VARS`, corpses `RN_PRESETS`.
  - **Rules checked:** skeleton and zombie templates, variants and Table 3-1 natural attacks on Archives of Nethys (2026-11-05);
    brutal undead in the bestiary bundle; the Death sphere talents in the wiki. Skeletons get one claw per *hand*
    (`rean.hands`); a zombie's slam is one size larger; Toughness = max(3, HD); winged skeletons can't fly, winged zombies fly
    clumsy. Expanded Necromancy: ×(1 + variants) Hit Dice when casting, normal once controlled. Single-creature cap 2 × Death
    CL; pool 2×/4×/5× (Greater Reanimate). Sustained undead (`dur:'conc'`) counts half, costs 0 spell points, only one at a time
    (raising another collapses the first). Permanent +2 spell points. Revenant Militia counts *racial* HD. Fortified
    Corpsecraft: +2 natural armor and DR ½ CL/good; if the template's DR 5 is at least as good, it can become DR 5/good instead.
    Reanimated undead don't heal on a long rest ("It does not regain hit points between reanimations"); destroyed at 0 hp
    (bloody: deathless) and then can't be raised again.
  - **Death sphere options** (`ch.deathOpt = {tal:{key:bool}, greater, ranged, warriors, sup, wtxt, cl}`): talents are read from
    your picks by name (`deathAuto`, `DEATH_NAMES`, old names included); a tick or untick that differs from the automatic value
    is stored. `deathCL()` = CL + `cl.sphere.death` modifiers, or the `cl` formula.
  - **UI:** a strip on each undead card (title, CR, time left, Reanimate / Raise again (spends spell points), −1 rd/min/h,
    Collapse, the casting check and warnings); the corpse editor with presets; a "Death sphere" panel on Companions; the cap
    line now uses Greater Reanimate and half counts. The Sheet's companion list shows time left.
  - **Corrections to the mockup (Reanimate_Workbench.html):** horse 2 HD with hooves only, owlbear Str 19, griffon 5 HD,
    skeleton claws only with hands, Revenant Militia on racial HD, Fortified DR replaces rather than adds.
  - **Not built:** raising several at once in one click (Mass Death Magic is noted in the casting line); the Faces of Death
    variants (acid, exploding…); other creature templates (advanced, giant, celestial).
- **Temporary talents, 2026-11-05.** Core rules "Temporary Talents".
  - **Data:** `ch.tempSrc = [{id, name, slots (formula), on, excl, rest:'keep'|'off', notes}]`; a pick with `p.temp = <source id>`
    is temporary. `sanitizeChar` drops `p.temp` that points to a missing source.
  - **Effects:** `talentCosts` skips them (no budget); `talBySphere` skips them (no free skill ranks, and they don't make you
    "have" a sphere, so they can't gain or buy off sphere drawbacks); `allPicks` leaves out ones whose source is off (Death
    and Alteration auto-detection too); modifiers whose source starts with an inactive temporary talent's name pause
    (`TOFF`, set at the start of `derive`, checked in `activeMod`).
  - **UI:** a "Temporary talents" card at the top of Talents (presets in `TEMP_PRESETS`: Quick Study, Spiritualism, Flexible
    Stance, Armiger weapon set, Spontaneous Talent; add talents inline; slots used / allowed; edit; remove with its talents),
    a "Temporary" select in each talent's editor (base spheres too), tags on the rows, dimmed when off, and on/off chips on the
    Sheet (Buffs card). Sources sharing an `excl` word are one-at-a-time (Armiger sets). `rest:'off'` switches off on a long rest.
  - **Armiger:** the author's note says customized-weapon talents aren't truly temporary (lingering benefits stay when you
    switch). The sheet treats them the same way for counting, which matches: no budget, no retrained ranks, active set only.
    The preset's slot formula uses character level; change `lvl` to the Armiger level if multiclassed.
  - **Not built:** actions tied to a temporary talent don't grey out when it's off.
- **Talents and feats taken more than once (2026-11-05).** A pick's `p.n` (whole number, 2–50; missing = 1) is set with "Times
  taken" in its editor (not on base spheres) and shows as "Name ×N". `pN(p)` / `pSum(list)` count it everywhere picks are
  counted: talent budget and [utility] slots (`deriveCore`), feats had, per-sphere costs and the type tiles on Talents, free
  skill ranks (`talBySphere` lists the pick N times), and Death talent detection (Greater Reanimate ×2 → 5 × CL pool).
- **Temporary talents are an optional section (2026-11-05).** Switched in ⚙ Tabs under "Optional sections" (key `temp` in
  `ch.tabsOff`, `TAB_DEFAULT.temp`: on when the character has a source, or an Armiger or Mastermind class). When off, the
  Talents card, the Sheet chips and the "Temporary" select are hidden; existing sources and their rules still apply.
- **Forbidden Lore (Thaumaturge), 2026-11-05.** `loreBonus()`: +2, +1 at 5th and every 4 levels after (max +6 at 17th), from
  Thaumaturge levels (`classLvl(/thaumaturge/i)`), or the formula in `ch.loreOpt.bonus`. An action's `a.lore` (chip "Forbidden lore
  +N CL" beside its augments, only on magic-sphere or magic-DC actions) adds the bonus in `actVars` for that action only (damage,
  range, duration), never the sphere's own caster level. **The sheet never rolls the backlash (owner's choice: rolls are public in
  Roll20).** The action's Roll20 macro, with lore on, gets "(forbidden lore)" in its name and `{{Forbidden lore=+N caster level ·
  backlash on [[1d100]] if 15 or less}}` (`loreOpt.chance`, default 15). Players add the −1 penalty themselves as a modifier.
  (The first version rolled in the sheet and tracked `ch.loreN`; removed the same day.) Invocations per day: use a resource.
- **Leadership (cohort package), 2026-11-05.** With the Leadership sphere:
  - **Cap:** "Recruited cohorts" on Companions: cohort Hit Dice (an advanced cohort counts CR × 2 + `c.advHd`) vs Diplomacy ranks ×
    (1 + Greater Recruitment, max 3). Diplomacy ranks include the sphere's free ranks (5 per Leadership talent, up to Hit Dice).
  - **Panel** (`leadCard`, like the Death sphere one; `ch.leadOpt = {tal, greater, talented}`, read from Leadership picks by name,
    `leadAuto`): the Table: Cohort row for your ranks (`COHORT_T`: max HD, BAB, feats, saves, combat talents, special), the cap
    rule, recruit DC (10 + HD + settlement), and Advanced Cohorts, Drill Sergeant, Squad, Master of the Dead, Constructor, Magic
    Cohort, Brainwash, Greater Recruitment and Talented.
  - **Each cohort's card** (`cohortStrip`): what it counts, the table's maximum, its recruit DC, a warning over the maximum, and
    with Advanced Cohorts an "Advanced cohort" tick (`c.adv`, `c.cr`, `c.advHd`) with a warning above CR ½ × ranks.
- **Prodigy Sequence, 2026-11-05.** A "Sequence" card on the Sheet (`seqCard`; shown with Prodigy levels or a running
  sequence): `ch.seq.n` links, max 4 + ⌊Prodigy level / 3⌋ (`seqMax`); Opener, +1 link, "Turn without a link (−1)", Finish/end;
  the basic finishers ready at the current length; a warning when dazed, helpless, paralyzed, stunned or unconscious.
- **Mass Death Magic, 2026-11-05.** "Raise several at once…" (Companions, with the talent): pick collapsed reanimated undead
  (not your sustained one, not destroyed); the casting limit (2 × CL) and the pool apply to their total; cost 1 + 1 (+2 if any
  are permanent); timers start for each.
- **Prepared and active temporary talents (Bravo), 2026-11-05.** A source can set `act` (active at once, formula) and `uses`
  (per day, formula; `used` counts, a long rest or "reset" refills). With `act`, its talents are prepared and only active ones
  (`p.on`, `p.onAt`) count (`tempLim`, `tempOn`). Tapping a prepared talent (Talents card or the Sheet's chips) makes it active,
  spends a use, and switches off the one active longest when full (`A.tempAct`). A prepared talent from a sphere you don't have
  shows ⚠ (Bravo rule). Preset "Spontaneous Technique (Bravo)": prepared `max(1,om)+floor(max(0,lvl.bravo-4)/3)` (was `pm` before the operative ability existed), active
  `1+min(1,floor(lvl.bravo/8))+min(1,floor(lvl.bravo/14))+min(1,floor(lvl.bravo/18))`, uses `3+floor(lvl.bravo/2)`
  (operative modifier = practitioner modifier, `pm`). Bravo also switches the optional section on.
- **Class levels in formulas, 2026-11-05.** `lvl.<class name>` (lowercase, letters and digits only: `lvl.armiger`, `lvl.bravo`,
  `lvl.thaumaturge`) is that class's level; a class you don't have reads 0 instead of an error. The Armiger preset now uses
  `1+floor((lvl.armiger+1)/4)`.
- **Actions and temporary talents, 2026-11-05.** An action whose name starts with a temporary talent that isn't active is
  greyed on the Sheet with Use off ("temporary talent not active"), the same name rule as modifiers.
- **Workshop tab (TRIAL, 2026-11-05; not deployed yet, may be rolled back).** Optional tab in Play (`ws`), on automatically with
  Alchemy, Herbalism, Tech, Tinker or Trap (`TAB_DEFAULT.ws` → `wsAny`). One card per sphere you have ("Show every card" shows all).
  - **Ranks** (`wsSkill`): the skill linked to the sphere on its card, else a Craft/Profession line with the right label (alchemy,
    herbalist, mechanical, traps), else 0; `ch.ws.<card>.ranks` (Settings) overrides. Tech and Tinker share Craft (mechanical).
  - **Alchemy:** DC 10 + ½ Craft (alchemy) ranks + practitioner (+ `dc.sphere.alchemy`); poison (Fort or fatigued 1 min, potent
    1 + 1 per 4 ranks rounds), toxins and mutagens you know; formulae you know with Craft DC and summary, Make → "Prepared".
    **Limits (added after the owner asked):** at most ½ ranks (min 1) + formulae talents prepared at one time (`wsLimit`, `wsCount`;
    Make turns off at the limit); 1 + 1 per 4 ranks per 30/15-minute session; missing the Craft DC makes it at minimum potency.
    Package from your talents or Settings.
  - **Herbalism:** batch = ranks + operative modifier (`D.om` from Build by default; Settings can pick an ability), batches per day =
    operative, herb duration ½ ranks + operative rounds; herb types you know (pick three) with counters and "Gather a batch";
    concoctions you know (type, herb cost) with Make; 1 + 1 per 4 ranks per 15 minutes; tonics 1 hour per 2 ranks. Remedy
    package: deadly-wounds time steps from Heal ranks, Physician's Efficacy, +operative per non-utility remedy talent.
  - **Tech:** charges (max ranks + Tech talents, min 4, +1 per Extra Gadgets; work adds 1 + 1 per 2 ranks), gadget hardness/hp/saves.
    Gadgets you know (Tech talents tagged (gadget), `WSLIB.gad`, 76 names) with Make → "Prepared" (Disassemble); at most ½ ranks
    (min 1) + gadget talents (+2 per Extra Gadgets) prepared at one time. Gadgets don't expire on a rest.
  - **Tinker:** gizmo list (level defaults to ranks, DC 10 + ½ level + practitioner, battery tick, depleted/ready), gizmo limit =
    ranks + Tinker talents, Maintain restores all.
  - **Trap:** DC 10 + ½ Craft (traps) ranks + practitioner; trap AC 10 + ranks, hardness = ranks, 5 + 5 per 2 ranks hp; dart attack
    max(ranks + Int, BAB + Dex), 1d6 +1d6 at 3 ranks and every 2 after, close range, 20/×3; area 1 + 1 per 5 ranks squares;
    Place from your check result (lasts result − 5 rounds) with a countdown.
  - **Data:** `ch.ws` (see `wsBlank`); library `#wsLib` (JSON, ~27 KB): 30 formulae with Craft DC, 30 toxins/mutagens, 10 herb types,
    22 concoctions with herb cost, 10 remedy talents, pulled from the wiki bundle by `tools/wslib.py` in the scratchpad.
  - **Long rest:** clears formulae and concoctions made, herbs, batches and placed traps; charges, gadgets and gizmos stay.
  - Items added with "Something else you made" count toward the Alchemy/Tech limit (meant for formulae or gadgets the list
    doesn't know).
  - **Rollback:** the file from just before the Workshop is kept (rollback-before-workshop/), with its check.js and notes.
- **Operative ability (2026-11-05).** `ch.opAbil` ('' | int | wis | cha) on Build → Spheres abilities, beside casting and
  practitioner. Rule (core rules, skill talents): chosen from Int, Wis or Cha when you first gain a skill talent (or your old casting
  ability if you traded spellcasting for skill expertise). Not chosen = the highest mental modifier, labelled as such. `D.om` and
  formula variable `om` (listed in the formula help). The Sheet's Spheres card shows an Operative tile when you have skill talents.
  Herbalism uses it by default (its card setting still overrides); the Bravo preset counts `max(1,om)` (existing sources keep
  their formula).
- **Skill-rank variables (2026-11-06).** Formulas can read `ranks.<skill>`: base skills by plain name (`ranks.diplomacy`,
  `ranks.knowledgearcana`), Craft/Profession/Perform/… lines by label (`ranks.alchemy`, `ranks.traps`, `ranks.mechanical`,
  `ranks.herbalist`) and in full (`ranks.craftalchemy`); a skill you don't have reads 0 (same rule as `lvl.<class>`). Set right after
  the skills in `deriveCore`, so actions, resources, the Workshop and Roll20 macros see them; modifiers evaluated before the skills
  (rare) read 0 there. Listed in the formula help with `lvl.<class>`.
- **Faces of Death undead variants (2026-11-06, owner-approved; Paizo, Classic Horrors Revisited, on Archives of Nethys).** In
  `RN_VARS` with a 5th field `'p'` (shown under a "Faces of Death … check with your GM" heading): energy (acid by default, or
  electricity/cold/fire/sonic: `rean.energy`; +1d6 on melee and to attackers using unarmed or natural attacks, immunity, Cha 12,
  CR +1), exploding (1d6 per HD within 10 ft., Reflex DC 10 + ½ HD + Cha), host corpse, mudra (skeleton: Dex +4, four claws with
  hands, Multiweapon Fighting and Weapon Finesse, CR +1), multiplying (skeleton, CR +1), skeletal archer (skeleton). Zombies get
  energy, exploding and host corpse. `RN_EXCL` warns on combinations the source forbids. Magus left out (intelligent; not made by
  Reanimate). Each variant still adds ×HD when casting under Expanded Necromancy.
- **Cohort professions and troops (2026-11-06).** A cohort's card (with the Leadership sphere) has Profession (`c.coh.prof`:
  student, thief, warrior, woodsman; acolyte, mage, pact-bound with Magic Cohort; or Manual) and, with Squad, Troop (`c.coh.troop`).
  `cohView` in `compStats`: the profession's Hit Die and good saves, BAB = HD (½ HD for the casters), Con for hp; picking a
  profession fills the base ability scores (race, increases and enhancements go in Bonus). `cohInfo` lists feats (1 + 1 per odd HD),
  combat talents (½ per HD; casters: magic talents ½ HD + 2, caster level ½ HD, spell pool HD + casting modifier), ability increases
  and enhancements due, the profession ability with its numbers, class skills. Troop: damage 1 die (+1 at 3 Diplomacy ranks and every
  3 after; magical at 5), the profession's ability (Bomb/Volley: 1d6 + 1d6 per 3 of the cohort's HD, an assumption flagged on the
  card; Low Blow and Bomb/Volley saves use your Leadership DC), and the troop traits. Data from the wiki's Leadership page.
- **Personas tab (Troubadour), 2026-11-06.** Optional tab in Play (`pers`), on with Troubadour levels or a persona. See `pers.js` in
  the scratchpad and the code comment. `ch.pers = {list:[{id, name, look, tropes:[{k, alt}], quirks:[{k, n}], notes}], active, qc,
  borrow}`. Limits from Troubadour level t: personas 2 + ⌊t/5⌋; tropes 1/2/3 (7th, 15th); quirks 1 at 3rd + 1 per 2 levels; Quick
  Change 1 + ⌊(t−2)/4⌋ per day (a long rest refills); base persona +1 morale on saves (+1 at 5th and every 4 levels) via `modsFor`
  while you're your true self; Performer's Synergy (10th, 20th) lets the true self borrow 1 (2) tropes. Each persona owns a hidden
  temporary-talent source `ps-<id>` (its feats/talents, no budget, only while active) and a toggle group `pg-<id>` (its modifiers; kept
  off the Sheet's buff chips), both switched by `persSync`. Automatic trope effects: Hero (Troubadour levels give full BAB) and Mentor
  (full caster level) in the class loop via `PERSX` (set in `derive`). Trope notes compute Cunning Servant's inspiration pool and
  Scoundrel's sneak attack. Trope library `#persLib` (~24 KB: 9 tropes with benefit, alternate benefit and 80 quirks from the wiki).
  Sheet: a "Persona" card with two rows of buttons: Quick Change (move action, uses one) and Prepare (10 min, no limit).
- **Bug fix (2026-11-06): long rest on a new character.** The long rest failed ("Cannot read properties of undefined (reading
  'made')") on a character made with New character, until its Workshop tab had been drawn: `blankChar` gave `ws:{}`, and only
  `sanitizeChar` (loading) or `rWs` (drawing the tab) filled in the cards. Fixed three ways: `blankChar` now gives `ws:wsBlank()` and a
  full `pers`; New character runs through `sanitizeChar` like every loaded character (so future fields are covered); the long rest
  fills in any missing Workshop card. Regression check in check.js ("New character"). **Lesson:** new top-level data needs its full
  shape in `blankChar`, not `{}`. A bug sweep (`tools/sweep.js` in the scratchpad: every tab and the new buttons on a new character and
  both examples, Sheet buttons pressed before any tab is drawn) found nothing else; characters saved by the live version open, rest
  and draw every tab in the new file without errors.
- **Fields added to `blankChar`:** `tempSrc:[]`, `deathOpt:{}`, `loreOpt:{}`, `seq:{n:0}`, `leadOpt:{}`, `ws:{}` (Workshop), `pers:{}` (Personas). (`sanitizeChar` only keeps fields `blankChar` lists, so any new
  top-level field must be added there or it vanishes on load.)
- **Tests:** `tests/check.js` now has 180 checks (1 Prepare-from-the-Sheet, 1 new-character regression, 12 Workshop, 2 operative ability, 1 skill-rank variables, 3 Faces of Death, 3 cohorts, 4 personas) (2026-11-05 batch: Mass Death Magic, Forbidden Lore ×5 (no backlash in the sheet; the Roll20 macro rolls it), Leadership ×4, prepared talents ×4, class-level formulas): 28 for raised undead (including Template ↔ None switching, the old-copy cleanup, and a custom creature typed in first with the template applied after) (a bloody burning wolf skeleton and a fast ogre zombie,
  numbers worked by hand) 6 for temporary talents (budget, Bluff ranks, modifier pausing, one-at-a-time sets, long rest), and 3 for "times taken" and the optional section.
  Its `patch` helper reloads before editing a save, because leaving the page writes the open character back.

- **Free-plan savers (2026-11-05).** Fewer Firestore reads and writes, so the Spark plan's daily limits (50,000 reads,
  20,000 writes) stay far away. No rules change.
  - **Save delay:** `cloudSoon` waits for 8 s without changes (`SAVE_WAIT`, was 1.2 s), but never more than 30 s after
    the first unsaved change (`SAVE_MAX`, `pushFirst`), so constant clicking in a fight still saves. The device copy is
    still written at once; hiding or closing the tab sends a waiting save straight away, as before.
  - **No empty saves:** `cloudPush` skips the write when the character is the same as the last copy it sent, ignoring
    `savedAt` (`sentSig`, `CL.sent`, keyed by uid + character id). `save()` always stamps `savedAt`, so comparing plain JSON
    would never match. A condition toggled on and off *is* a change (it adds two log lines).
  - **Coming back to the tab:** `syncOpen` re-reads the account only after 60 s or more away (`SYNC_AWAY`,
    `CL.hiddenAt`). Sign-in and opening a character always check. Trade-off: edit on another device and return within a
    minute, and this tab won't notice the newer copy until the next check.
  - **Party summaries:** member writes go through `pubThrottle('m:'+key, MEMBER_WAIT)`, at most every 12 s per party; the
    latest summary always arrives, and hiding the tab flushes it. The GM dashboard can lag a player by up to ~20 s.
  - **Switching characters:** Home and `openChar` send a waiting save first, so the 8 s delay can't leave the previous
    character's last change only on the device.
  - **Test:** `tests/save-check.js` (12 checks, about 2 minutes, emulators like `party-check.js`) counts the page's own
    `put`/`get`/`memberPut` calls. Against the previous version it fails 4 checks, as it should.
  - **Not done:** a small per-user index document so the Characters list costs 1 read instead of 1 per character
    (needs a rules change and a backfill for existing characters).
  - **Emulator note:** running the emulator tests needs an `emulators` section in `firebase.json`
    (`"auth": {"host": "127.0.0.1", "port": 9099}, "firestore": {"host": "127.0.0.1", "port": 8080}`); without it the Auth
    emulator doesn't start.

- **Review fixes (2026-11-01).**
  - Search fields (`input[type=search]`: Characters, History) now share the dark field styling (`appearance:none`).
  - Restricting the Firebase browser key by HTTP referrer is a Cloud Console step for the owner.
- **Gear tab layout (2026-11-01).** Armor and shield are separate cards (`armH`, `shH` in `rGear`), each with its own preset picker, special abilities and notes (`cardNotes.armor` / `cardNotes.shield`). Left column: Worn items, Weapons, Armor, Combat options. Right column: Wealth and load, Items, Containers, Shield.

- **Talent ordering and armor/shield abilities (2026-11-01).**
  - **Talents tab:**
    - **Spheres:** order is `ch.sphOrder` (names; unlisted ones go alphabetically after; renaming a sphere keeps its place). ↑ ↓ on each sphere card (`sphMv`, via `sphCur()`), and a desktop drag handle (`data-drag="sph"`, the card is `data-drop="sph"`).
    - **Talents inside a sphere:** `p.ord` with ↑ ↓ and drag. The base sphere is pinned; `pkSiblings` for talents means same sphere, not base, not tradition. A drop only works within the same sphere.
    - `dropTarget` finds the nearest drop area of the dragged type, so a sphere can be dropped onto its talent rows.
  - **Armor and shield special abilities (optional):** `armor.props` / `shield.props` = [{id, name, eff: note|fort|sr|resist|skill|dr|mod, val, energy, skill, bypass, target, type, cond, on, res, cost, notes}], with presets in `APROPS`.
    - **Into the numbers:** `apropMods` (via `gearMods`): sr, resist.X, skill.X competence, any modifier (`cond` → situational, and `sitFor` includes them). `apropDR` feeds `D.dr`.
    - **Only while in use:** they apply only while that armor or shield is in use (`apropWorn`). Possession and gear-melding forms replace the armor objects, so they drop out.
    - **On the Sheet:** `apropLine` on the Defense card lists the active abilities (fortification %, notes) with Use buttons for charges (`apropUse`).

- **Compressed account saves and size limits (2026-11-01).**
  - **Saving:** `SheetCloud.put` gzips the character JSON with the browser's `CompressionStream` and stores it as Firestore Bytes in field `z` (`enc:'gzip'`, no `json` field). Characters compress about 3x (Anima 50 KB → 16 KB).
  - **Reading:** `SheetCloud.get` gunzips `z` back into `json`, and old records with `json` still open.
  - **Size check:** before sending, compressed ≥ 990,000 bytes (`LIMIT_Z`), or plain ≥ 900,000 characters, is rejected with `code:'sheet/too-big'`.
  - **Fallbacks:**
    - If the server refuses `z` with permission-denied (old rules still deployed), it retries as plain `json`.
    - Browsers without `CompressionStream` (before about 2023) save plain as before.
  - **Rules (`site/firestore.rules`):** accept `z is bytes && size < 1,000,000` OR `json is string && size < 900,000`. Deploy them with the page (`firebase deploy`, as usual).
  - **Messages:**
    - `cloudErrMsg` gives plain-language reasons (too big, with KB and the next steps; permission-denied near the limit points to size). Used by every account save: auto save, Save to account, Organize/Duplicate, restore.
    - `sizeNote` keeps the last saved size per character (`CL.size`) and toasts once a session at ≥ 750 KB (`SIZE_WARN`).
  - **History tab:**
    - Shows the character's size, its history share and its account size.
    - **Archive old history…** (`histArchive`): pick "before level N", it downloads those entries as .txt (`histText`), removes them, and records an "Archived" entry (Undo works).
  - **Not done:** compressing the copies on the device (localStorage, about 5 MB for all characters). It needs a synchronous compressor (an outside library, which the session's permissions blocked) or moving device storage to async IndexedDB.

- **Playtester requests (2026-11-01).**
  - **Toggle notes:** `group.notes` (notes box at the bottom of each toggle card on Modifiers). On the Sheet, chips with a note show ✎ and a tooltip, and the notes of active toggles are listed under the chips. Exported presets carry the note.
  - **Weapon notes:** multi-line (`notesBox`). The Sheet's attack row shows the first line, with the rest behind "more" (`longNote`).
  - **Weapon special abilities (optional):** a folded "Special abilities" section per weapon. `w.props` = [{id, name, dmg, dtype, when: always | crit | note | "vs …", crit, atk, on, res, cost, notes}].
    - Presets (`WPROPS`): elemental, burst, alignment, bane, merciful, vicious, wounding, keen, speed.
    - **Attack line** (`wpropText`): always-on extra dice show after the damage ("+ 1d6 fire"). Crit dice are scaled by the multiplier (`critDice`: ×3 → 2d10). Conditional ones show as "(+2 to hit, +2d6 vs undead)".
    - An always-on attack bonus is added to the attack. Extra dice aren't added to the damage number, since they're a different damage type.
    - Abilities that spend a resource get a Use button on the Sheet (`wpropUse`).
  - **History tab (Advanced, optional):**
    - `ch.history` = [{at, lvl, t: start|add|remove|rename|level|note, cat, text, k}]; `ch.histSnap` = the last recorded {key: {category, name}} from `histKeys`. `ensureIds` now covers weapons, mods, groups, resources, actions, containers, companions and forms.
    - **When it records:** `histSync` diffs ~4 s after edits stop (`histSoon` from `save`), and immediately on tab change, going home or the page hiding (`histNow`).
    - **Renames:** a new item renamed within the hour updates its "added" line instead of logging a rename.
    - **Level-ups** write one detailed entry (class level, hp rolled, favored class, +1 ability, ranks, picks); that level's picks, class and new resources aren't logged separately.
    - Notes can be added and edited. There's no clear; Undo reverts both the change and its entry.
    - Filter by level, search, download as .txt. A size warning appears above 400 KB.
  - **Organization:**
    - **Always-on modifiers** can sit under headings (`m.grp`; Section menu "Always on › X" / "New heading…"; folding heading blocks with Rename).
    - **Every modifier row** has ↑ ↓ (`modMv` swaps within its section) and a ⠿ drag handle on fine pointers (`FINE`). Dropping onto a row adopts its section or heading.
    - **Feats, traits and features** (not talents or tradition grants): `p.ord` order and `p.grp` heading (Heading field with a datalist). ↑ ↓ in the card summary (`pkMv`), plus desktop drag (`data-drag`/`data-drop`).
    - Drag handles are hidden on coarse pointers.

- **Shapeshift tab (Alteration sphere / Shifter), 2026-10-31.** Optional tab in Play. It's on automatically with an Alteration talent, a Shifter class, or any saved form (`TAB_DEFAULT.shape`).
  - **Data:**
    - `ch.forms` = [{id, name, tf, traits:[{k, p, free, name, notes, group}], meld ''|'1'|'0', group (a toggle that switches on), hybrid (Anthropomorphic), legs8 (Vermin), notes}].
    - `ch.shape` = {form, dur:'conc'|'min', left/total in rounds}.
    - `ch.shapeOpt` = {cl (formula override), extra (extra traits, e.g. Greater Changes)}.
  - **Rules data:**
    - `TF` holds the 14 transformations (Blank, Anthropomorphic, Animalistic, Aquan, Avian, Dragon, Elemental, Object, Ooze, Orb, Plant, Serpentine, Subterranean, Vermin): limbs, speech, hands, legs, gear melding, land/other speeds, maneuverability, natural attacks (Medium dice), natural armor (dodge for Orb) and special notes, all scaling with Alteration CL.
    - `STRAIT` is the curated trait list: the ones hard to free-form (attacks, speeds, AC, size, DR, resistances, situational saves, carrying), plus "Other" (name, notes, optional toggle).
    - `p` = a parameter (steps/energy/bypass/attack name), `cost` = extra spell points, `rep` = can be granted more than once.
  - **Engine:**
    - `derive` → if a form is active (and you're not possessing): `deriveCore(shapeView(ch,f,acl))`. `D.form` = info (name, tf, notes, warnings, hands, speech, meld, sizeSteps, used/limit, cost, attacks); `D.formW` = the form's natural attacks.
    - A non-Blank form drops your natural weapons unless `w.keepShape` ("Keeps in other forms", for bestial traits).
    - Gear melds → armor and shield are blanked; constant gear bonuses stay.
    - Size Change → `size` steps plus ±2 Str/∓2 Dex per step, clamped to 1 + CL/5 steps and to Tiny–Large (Diminutive–Huge from CL 10).
    - Legs: quadruped carrying at 4+, +4 CMD vs trip per extra pair (situational), a "can't be tripped" note at 0.
  - **Alteration CL** (`shapeCL`): your caster level + `cl.sphere.alteration` modifiers, with Shifter levels counted in full ("uses her class level as her caster level for this sphere"); `shapeOpt.cl` overrides it.
  - **UI:**
    - A gold "In form" strip on the Sheet and an "In form" tag in the header.
    - Attacks show the form's natural attacks; manufactured weapons are dimmed with a note in a form without hands.
    - Taking a form: concentration, or 1 min/CL for 1 spell point plus trait costs (a timer with −1 round / −1 min). "Spend 1 spell point" switches from concentration to the timer.
    - Possession and a form can't both be on at once.
  - Each form's editor shows `formPreview` (speeds, natural armor/dodge, size, attacks with dice, gear melding, and every special note at your current Alteration CL). The "In form" card lists natural armor too (`info.na`, `info.dodge`).
  - A form's natural attack is skipped when you already have an attack of the same name (`anm` normalizes the name: count, plural, brackets). Your own attack takes its place (one bite per head; bestial traits). It's listed in `info.replaced` so it isn't dimmed in a form without hands, and a note says so.
  - **All wiki traits (2026-11-01):**
    - `#traitLib` (JSON) holds 160 traits from the 38 trait-granting Alteration talents in the current wiki section (02-magic-spheres-part1.md lines 95–787; the copy after line 1387 is the old version). Each has its group, name, full rules text (`d`), `rep` and `cost`.
    - The generator is `shape/gen.py` and the parser `shape/parse.py` in the scratchpad.
    - At load, the built-in traits get their rules text attached; the other 106 become note traits ("Name: first sentence" on the form).
    - `TRAIT_FX` gives a few of them real effects: Gift of Hands and Gift of Speech set `info.hands`/`info.speech`, and Aquatic Tail adds +1 + 1 per 5 CL to Swim.
    - The editor shows a folded "Rules" block per trait. The trait picker is grouped by talent, with base traits first and Other last.
    - Not included as traits: base-form packages (Serpentine Constrictor/Poisonous, Ooze Amoeba…, Elemental Air/Earth/Fire/Water), which belong to the transformation itself.
  - **Durations (`shapeDur`):**
    - Base: 1 min/CL for a spell point.
    - Lingering Transformation talent (`shapeOpt.lingT`): +2 rounds after concentrating; 1 min → 10 min/CL, or 10 min → 1 hour/CL.
    - Shifter by class level, unless `shapeOpt.noShiftDur` (an archetype replaces them): Lingering 4th (+½ shifter level rounds after concentrating), Extended 9th (10 min/level), Greater 17th (1 hour/level), Second Skin 20th ("free" duration, no spell point).
    - Permanent Transformation (`shapeOpt.permT`, CL 10): a "perm" duration for 2 spell points.
    - The timer counts rounds and shows h/min/rd, with −10 min and −1 hour buttons for long durations.
  - **Packages and choices (`TF_PK`, stored as form.pk / pk2 / xsp / noArms):**
    - Dragon: breath energy and line/cone.
    - Elemental: Air/Earth/Fire/Water (speeds, resistance = CL, Earth's +2 stacking natural armor, Fire's 40 ft land, bonus-trait notes), the arms choice, and the extra spell point option.
    - Ooze: Amoeba/Gelatinous Cube/Jelly/Pudding, plus the extra spell point option.
    - Serpentine: Constrictor (grab +4 + 1 per 5 CL, situational) or Poisonous.
    - Packages don't count as traits.
  - `info.fx` lists the number changes from traits and packages (resistances, DR, skills, AC types) in the preview and on the "In form" card.
  - **Talent filter:** "Alteration talents you have" checklist (`shapeOpt.tal[slug(group)]`).
    - Auto-ticked from your Alteration talents by name (`talAuto`/`talNorm`: brackets and "Transformation" stripped); an explicit tick or untick wins.
    - `talFilter()` limits the trait picker and the transformation list to known talents. Always offered: the base traits, Other, Blank, the form's current transformation, and that transformation's own traits.
    - `shapeOpt.showAll` turns the filter off. Nothing ticked = everything shown.
  - **Trait choices (2026-11-01).** A trait def's `p` is either an option list in `STRAIT_P`, `natatk` (pick from the form's natural attacks, own kept ones included) or `text` (with label `pl`); `chk` is a yes/no stored in `t.legs`.
    - Option lists: Elemental Movement (element), Elemental Empowerment and Elemental Resistance (four energies), Extra head (benefit), Holey (holy/unholy), Amorphous Weaponry (weapon feature).
    - Natural attack: Lunge, Trip, Powerful Charge, Push/Pull, Grab, Daemon Body, Armor Shredder, Razor Claws, Powerful Claws.
    - Text: Graft Weapon, Shape Weapon, Powerful Arms, Assimilate Tool.
    - Yes/no: Aquatic Tail and Serpentine Tail "replaces the legs".
    - Effects that change numbers:
      - Elemental Movement sets the element's speeds.
      - Extra head: +1 on skills, or a situational +2 vs enchantment.
      - Tails: Aquatic sets land to 5 ft. and swim to 30 ft. (or +15); Serpentine takes 10 ft. off land speed. Both make the form untrippable.
    - The note on the form includes the choice, e.g. "Lunge (Bite)".
  - **Companions in a form (2026-11-01).** `c.shape` = {form, dur, left, total}, using your forms, your Alteration CL (`compACL(V)`) and your spell points.
    - `compStats` → `compShaped(c,V)` runs `shapeView` on a stand-in built from the companion (size, attacks mapped primary↔nat1 and secondary↔nat2, speeds from `parseSpeeds`, HD as levels), then maps the result back:
      - size and Size Change Str/Dex;
      - natural armor = the higher of its own and the form's;
      - modifiers the companion supports (`CT_OK` + `resist.*`); skills, situational bonuses and DR with a bypass become notes;
      - attacks with dice re-scaled by size steps; a speed text; gear melding sets armor and shield to 0.
    - Returns `o.form` (info) and `o.view` (the shaped companion).
    - **Possession:** `H.c` = the shaped view, so possessing a shapeshifted creature uses its form (speeds, attacks), and `D.hostHands` respects the form's hands.
    - **Shifter features** (Lingering/Extended/Greater/Second Skin) apply only to yourself (`shapeDur(acl, other)`).
    - **Mass Alteration** (`shapeOpt.massT`): tick several targets in "Take a form", +1 spell point, up to 1 + max(1, CL/2) creatures. The duration and trait costs are paid once.
    - **UI:**
      - Target checkboxes (Yourself unless you're in a form or possessing; present companions not in a form).
      - A "Companions in a form" card with timers and Dismiss.
      - A gold strip on each companion card; an "In form" tag on the Sheet's companion list.
      - "Keeps in other forms" on companion natural attacks.
      - Removing a form ends it on everyone.
    - Not built: forms owned by a companion (a cohort casting Alteration itself).
  - **Scaling traits (2026-11-01).** About 45 note traits now compute their caster-level numbers (`TRAIT_FX`, quiet, with `diceStep` for size-step dice and `ladder` for 1→1d2→1d3…). `x.dc` is the Alteration sphere DC.
    - Damage dice: Burn (+1 size per 5 CL; the Fire elemental package too), Shock, Beam, Acid Spit, Spray Fondue, Thorn Spray, Swallow Whole, Roper Strands, Blood Drain.
    - Areas and ranges: Nauseating Spray, Mucus, Pollen, Sporepod, Sprint, Sticky Tongue, Aquatic Tail riptide, Whirlwind.
    - DCs, percentages and caster-level gates: Shadow Blend 5, Spiritual Touch 6, Blood Drain/Fear Aura 10, Holey 11, Ethereal/Incorporeal 15.
    - Real sheet effects:
      - Appealing Visage: Diplomacy/Perform.
      - Inured, Inevitable, Protean and Angel Body: situational saves and AC.
      - Protean Body: Escape Artist. Affinity for Treasure: Appraise.
      - Earth/Water Mastery: situational attack and damage.
      - Cheese Body: DR/slashing.
  - The Tabs dialog label says what turns each automatic tab on (Possession: Wraith; Shapeshift: Alteration sphere, Shifter or a saved form).
  - **Not built (pinned):** shapeshifting companions or allies; Swarm Shape and other non-transformation forms (use Blank + traits).

- **Armor enhancement on clothing (2026-10-31).** With no armor worn (and not possessing), `armorenh` modifiers apply to clothing or skin as an armor bonus of 0 plus the enhancement (`D.clothEnh`). It's listed as "Clothing or skin" in the AC breakdown. Rule: Oath boon Enhanced Defenses ("or your clothing/skin, if you do not wear armor"); magic vestment works the same way. As an armor-type bonus it competes with mage armor and bracers, and it stays out of touch AC.

- **Characters screen organization and sign-in confirmation (2026-10-30).**
  - **Data:** `ch.meta` = {campaign, status, pin} (`metaOf` normalizes it).
    - It's also written beside name/summary in the account doc as `meta`, plus `level`, so the list doesn't open every character.
    - `SheetCloud.list` returns them. No Firestore rules change: the rules only check `json`.
  - **Statuses** (`STATUSES`): active, npc, concept, retired, dead. Retired and dead are `ARCHIVED` and fold into "Archived (n)" inside their campaign.
  - **List** (`homeList`, `charRow`, `homeHTML`):
    - A "★ Pinned" section on top, then a collapsible `<details class=campgrp>` per campaign (Unsorted last).
    - Each campaign heading has a Rename link (`campRename` moves every character in it).
    - Search (`#homeQ`, `homeFilter`) hides rows without repainting. Sort is Recent / Name / Level (`UI.homeSort`).
  - **Row buttons:** ☆ pin, Open, Organize… (campaign with a datalist of existing ones, status, pin), Duplicate (new id, same campaign, unpinned, saved to the device and the account), Save to account, Delete.
  - **Helpers:**
    - `charFull(id)` gets the newest copy, from this device or the account.
    - `charStore(c)` writes a character back where it lives.
    - `setMeta(ids, patch)` changes campaign/status/pin on characters that aren't open.
  - **Backup:** "Back up all characters" downloads `{app:'spheres-sheet-backup', chars:[…]}`. Import recognizes it (`restoreBackup`), adds new characters, replaces only older copies, and pushes them to the account when signed in.
  - **Sign-in:**
    - The header shows "Signed in as <first name>" (full name and email on hover), and the account card title too.
    - A toast confirms a fresh sign-in.
    - The redirect fallback sets `sessionStorage.sheetAuthRedirect`. On return, `getRedirectResult` errors and "came back signed out" are explained instead of failing silently.
    - App built-in browsers (`INAPP`) get a note that Google blocks sign-in there.
  - **`authDomain` = the site's own hostname** when served from spheres-character-sheet.web.app or .firebaseapp.com.
    - Why: Opera desktop lost popup sign-ins to cross-site storage blocking, and Firebase reported them as "popup closed".
    - **Requires** both handler URLs in the Google Cloud OAuth Web client's Authorized redirect URIs: `https://spheres-character-sheet.web.app/__/auth/handler` and `https://spheres-character-sheet.firebaseapp.com/__/auth/handler`.
  - A popup that closes after more than 4 seconds without signing in now shows an explanation.
  - `SheetCloud.current()` is re-checked on window focus.
  - **Opera desktop "signed in for half a second" (2026-10-31):**
    - Cause: Firebase keeps the login in IndexedDB and re-reads it every 0.8 s (`_POLLING_INTERVAL_MS`). If the write didn't stick, the re-read finds no user, `_onStorageEvent` treats it as a sign-out in another tab, and you're signed out.
    - Fix: `initializeAuth` with `browserLocalPersistence` first, then IndexedDB, then session.
    - A sign-out within 20 s of signing in that the user didn't ask for (`CL.inAt`, `CL.signingOut`) shows an explanation.
    - `save()` toasts once if localStorage is full or blocked (`lsWarned`).

- **Hardness and "no score" abilities (2026-10-30).**
  - **Hardness:**
    - New modifier target `hardness` ("Hardness (objects, constructs)") for both characters and companions.
    - The Sheet shows a Hardness tile when you have any (`D.hardness`).
    - A host's hardness reaches you while you're actively possessing it (the `possView` filter). It's meant for Anima animated plants, which count as animated objects.
  - **No score (—):**
    - A "None" column in the Ability scores table on Build and in each companion's ability table (`ch.noAb`, `c.noAb`).
    - The score shows as "—" with no modifier, and counts as 10 wherever a number is needed.
    - Undead companions with no Con and HP from Cha use Cha for Fortitude.
    - New undead companions start with `noAb.con`. Old ones with Con 0 still read as "—".
  - **Companion cards** now list DR/—, hardness, SR and resistances under the attacks.

- **Second subagent review (2026-10-30): bugs, formatting, rules.**
  - **Rules:**
    - Prestige classes that advance an existing casting class have two new casting settings (`CASTP.adv`, `CASTP.advcl`).
      - `adv` ("+1 level of existing class"): Spheres Archwizard, Justicar, Alternate Justicar, Kinetic Mystic, Spellwyle. Their levels count as levels of your highest casting class (`advBase`) for caster level, spell points and magic talents.
      - `advcl` ("add levels to all caster levels"): Hand of Eternity. It adds to caster level only.
    - The armor/load speed table runs to 120 ft (70→50 … 120→80).
    - Consume Host also shows during passive possession, per its rule text "while possessing".
    - Base spheres (`baseLib`):
      - Every "choose one package" entry is now named "X (package)", and each package's own abilities are folded into it. This covers Athletics, Alchemy, Guardian, Beastmastery, Tinker, Herbalism and Survivalism. "Add all from the wiki" holds packages back (regex `/ \(?package\)?$/`).
      - A "Sphere basics" entry was added (free skill ranks, skill leverage, bonus talent) to Alchemy, Fencing, Gladiator, Scoundrel, Scout, Tech, Tinker (plus Battery), Artifice, Bluster, Body Control, Communication, Faction, Infiltration, Occultism, Performance, Spellhacking, Study, Herbalism and Survivalism.
      - New entries: Trap basics (placing traps), Guardian's Delayed Damage Pool, and the Veilweaving sphere.
  - **Bugs:**
    - Removing a possessed temporary host no longer deletes another companion.
    - Ticking the timer mid-possession starts it.
    - Changing "Willing host" mid-possession recalculates the time left.
    - The Tabs dialog only stores Possession when it differs from the automatic default.
    - Companion-card Possess buttons are hidden while you're possessing (outside Collective mode).
    - Long rest clears companion nonlethal.
    - Exported toggles keep the "Body effect" flag.
    - The level-up skill budget uses permanent Int (`D.intPermMod`).
    - Not changed: a reviewer flagged active↔passive switching as subtracting "in the wrong units". The rule is 1 unit for 1 unit whatever the units, so the existing behaviour is correct.
  - **Formatting:**
    - The selected tab scrolls into view on phones.
    - Skills and Ability scores (`table.stick`) keep the first and last columns pinned on phones.
    - Formula previews in `fF` fields are unsigned; modifier values keep their sign.
    - The "Now" field lines up with the resource fields (`.fields.top`).
    - Checkboxes no longer shrink.
    - Radios on the Possession tab are styled.
    - Sheet tiles are at least 124px, so "CONCENTRATION" fits.
    - Modifier source and section fields span the full width on phones.
    - "Add <name> from the wiki" is used when only one ability is missing.
    - US "Defense" spelling throughout.
    - Action costs read "Spell points −1".
    - Companion cards say "flat-footed" and "Temp hp".
  - **Left as is (minor):**
    - While possessing, the level-up dialog's HP step shows the host's Con.
    - The header reflows on phones while possessing.
    - Shield Max Dex shows 99 when no shield is carried.
    - "Worn items" counts only magic slots.
  - **Class list corrections (user-confirmed):** Kineticist gets 4 + Int skill ranks; Spiritualist has good Fort and Will saves.

- **Possession gaps closed (2026-10-30).** Everything is optional and invisible to characters without the Possession tab.
  - **"Haunts and options" checklist** on the Possession tab, stored in `ch.possessOpt`, all off by default:
    - Haunts: Lengthened Control (its checkbox only shows when ticked, and ticking it takes 1 spell point), Lingering Incorporeality, Disorienting Possession, Amnesiac Possession, Consume Host (`possConsume`).
    - Tracking: time left (`P.left`/`P.total`/`P.unit`, with Renew/Extend; passive and active time traded 1 for 1 on switching), failed attempts (`c.possFails` adds to the cost; it resets on a success).
    - Leaving in wraith form: `wfRes` names the resource it spends from (End in wraith form).
    - Gear: absorbed by default (`D.gearAbsorbed`); `gearCounts` makes it count against the host.
    - The Collective option moved here.
  - **Creature cards:** a folded Possession section (only when the Possession tab is on) holds CR, body type, remove-after, new body each time, and "costs no spell point" (`possFree`).
  - **Toggles:** a "Body effect" flag (`group.body`) pauses the whole toggle while possessing. The common Haste, Enlarge/Reduce Person, Mage Armor and Shield come with it ticked (`BODY_TOGGLES`).
  - **Engine:**
    - Your own racial-type bonuses to Str/Dex/Con skills are set aside.
    - Host modifiers can target DR/—, SR and energy resistance, and they reach you.
    - A body without hands greys out your weapons (`D.hostHands`).
  - **Skipped for now (user decision):** keeping the host's own conditions when you leave.
  - **Not built:** Greater Possession (several hosts at once) and casting the host's spells at 18th.

- **Host traits while possessed (2026-10-29).** Rules: the Wraith's Active Possession table.
  - **The rule:** the host's passive abilities, defensive abilities and racial bonus feats always work. Ex abilities that need activating unlock at wraith 6, Su at 12 and Sp/SLA at 16. The host's other feats unlock at 18.
  - **Data:** each host trait has `use` (`''` auto, `always`, `active`, `feat`). Auto counts (Su)/(Sp) as `active` and everything else as `always` (`traitUse`, `traitNeed`).
  - **Modifiers:** a host modifier named after a trait counts only while that trait is usable (`hostModOk`). Usable host init, skill, CMB and CMD modifiers reach the wraith (`possView` adds them).
  - **Burn:** the user rules it passive.
  - **Racial bonus feats:** these are the ones marked "B" in the creature's stat block on Archives of Nethys.

- **Fixes from the Anima Wraith review (2026-10-29).**
  - **Age:** while possessing, your age no longer touches the host. `gearMods` skips Str/Dex/Con age modifiers when `ch._host`; the mental side stays.
  - **Host speeds:** read from its speed text by `parseSpeeds`. Land speed is 0 if the text doesn't start with a number; fly/swim/climb/burrow and maneuverability are picked up.
  - **CR:** accepts fractions (1/2) and shows them that way (`crText`).
  - **Companions:** a new "New body each time" option (`freshHost`) resets the host's damage when you possess it, for Anima elementals.
- **Casting tradition talents (2026-10-29).** Talents listed under a *separate* casting tradition are the 2 bonus magic talents, so they use those slots (`tradPays`, `tradPaid`). Martial and trade tradition talents, and unified traditions, stay free.
- **Base abilities (2026-10-29).**
  - **Truncated text restored:** six base abilities had been cut at 9,000 characters: Summon, Create, Alternate Divinations, Illusion, Geomancing and Control Weather. Their full text is back from the bundle.
  - **Geomancing:** split into the general rules plus "Geomancing: <Air/Earth/Fire/Metal/Plant/Water> package". "Add all from the wiki" skips the packages, which you add one at a time.
  - **Existing characters:** they keep the base-ability text they already saved.
- **Shapeshift tab: built 2026-10-31** (see its section). Still pinned: shapeshifting companions or allies, and shapeshifting while possessing.

- **Tab toggles (2026-10-29).**
  - Per character in `ch.tabsOff` (`{tabKey:true}` = hidden), set with the ⚙ Tabs button on the tab bar (`A.tabsCfg`).
  - `TAB_LOCKED` keeps Sheet, Build and Save & print. A group with no shown tabs loses its button.
  - A link to a hidden tab still opens it, shown in italics while you're there (`tabsShown`).
- **Possession (built 2026-10-29).** Spec: `wraith-possession-spec.md`, with the rules checked against the Wraith's Possession (Su) in the wiki bundle (classes part 5).
  - **Data:** `ch.possess` = `{host, mode, willing, lengthen, at, held}`. `ch.possessLvl` is a wraith-level formula; `ch.possessCollective` defaults to false. Companions gain `cr` and `tempHost`, and there's a new kind, "Creature to possess" (`host`).
  - **Engine:** `derive()` is a wrapper. It runs `deriveCore(ch, null)`, then, while actively possessing, `deriveCore(possView(ch, H), H)` with `H = compStats(host, V, {bab: wraith BAB})`.
    - `possView` takes away the wraith's armor and shield, its physical modifiers (`POSS_PHYS` targets and the armor/deflection/resistance/shield/natural-armor types), its movement and its DR. It uses the host's size and speed.
    - From the host: Str, Dex and Con; AC, Fort and Ref, with conditions on top; HP; natural attacks (`D.hostAtk`).
  - **Conditions:** `MIND_CONDS` stay with the wraith. The wraith's body conditions are kept in `possess.held` and come back on leaving; the host's body conditions stay with it. A slain host gives Dazed.
  - **Costs and durations:** a spell point comes out of the Spell points resource for an active or unwilling possession. Switching to a cohort under the Collective option is free. Durations come from `possTier` / `POSS_DUR` / `durFill`. Host abilities are gated by their (Ex)/(Su)/(Sp) tags.
  - **UI:** the Possession tab (`rPoss`) is in the Play group. It's off unless the character has a Wraith class (`TAB_DEFAULT`). The Sheet tab shows a strip (`possStrip`); damage and healing go to the host (`hpObj`); the header shows a tag; the print view gets a line. Formulas can use `wlvl`.
  - **Not built:** the extra spell point cost after a failed attempt, Greater Possession, the host's racial skill bonuses, and host DR/immunities as numbers (they stay as text).

- **Tradition base spheres (reported 2026-10-28, fixed).**
  - **Issue:** a tradition could only grant a base sphere if its name ended in "sphere" or matched the sphere name. On the Talents tab, the base sphere's own row also looked like an extra talent sitting above its base abilities.
  - **Fix, Traditions tab:** a talent grant has a **"Base sphere"** checkbox (`data-grbase`, sets `role:'sphere'`). It fills in the name ("Life sphere") and the wiki base abilities.
  - **Fix, Talents tab:** a base sphere shows as a header line (`details.basehead`: tags + Edit) above its base abilities. Base abilities start open while the list is empty, so "Add all from the wiki" is in view.

- **Bug sweep (2026-10-27).** Three reviewers went through the whole file; all confirmed bugs are fixed and tested.
  - **Rules:**
    - The at-least-1-hp-per-HD floor now uses the hp each level actually gives.
    - Combat Expertise affects melee only.
    - Ability **damage** gives −1 per 2 points on the modifier; **drain** lowers the score. These are separate fields: `abilDmg` and `abilDrain`.
    - Bone material now works on shields.
    - A worse condition replaces the milder one: `COND_WORSE`, `condCovered`.
    - Negative levels also lower initiative.
    - `sanitizeChar` checks the enum fields and drops null rows.
  - **UI:**
    - The caret and selection survive a repaint.
    - Level-up Back keeps the class picked from the list, and the HP step checks the die size.
    - Gear, picks and grants get stable ids (`ensureIds`), so open rows follow their item.
    - Deleting a toggle or house rule frees the damage reduction tied to it.
    - Importing table rules remaps modifiers to rules with the same name.
    - Range and duration fields accept plain words.
    - Resources never show more than their max.
    - An empty or invalid import says so.
  - **Known, left as is:** two-weapon penalties apply to every manufactured weapon while two-weapon fighting is on.

- **Color themes, per character (2026-11-01).** "◐ Theme" on the tab bar, next to ⚙ Tabs (`A.themeCfg`).
  - **Data:** `ch.theme = {preset, c: {token: '#rrggbb'}, name?}`; no theme = the standard dark colors. `themeClean`
    (also in `sanitizeChar`) keeps only known presets and 6-digit hex colors, so imported files can't inject CSS.
  - **Tokens:** the 19 CSS variables in `THEME_KEYS` (`--ground` … `--warn`, plus the new `--bad-deep`, which
    replaced the one hard-coded color, active condition chips). `applyTheme` sets them on `<html>` in `render()`;
    the Characters screen always uses the standard colors. Printing stays black on white.
  - **Presets** (`THEMES`): Dark (standard), Light, High contrast, Parchment, Midnight, Forest, Ember, Violet.
    Most are generated by `themeFrom(background, text, accent)`, which the "Quick colors" pickers also use.
  - **Dialog:** presets, quick colors, "Fine-tune every color" (all 19), live preview, readability warnings
    (`themeWarn`: WCAG contrast, 4.5:1 for text, 3:1 for accents and labels), Export/Import theme
    (`{app:'spheres-sheet-theme', name, preset, c}`), Back to standard. Cancel restores the old colors.
    All 8 presets pass the readability check.
- **Example characters (2026-11-01).** Both level 12, both in the "Examples" campaign.
  - **Ilyra Voss, Incanter 12 (human):** Destruction sphere specialization (3 points: bonus sphere, +1 CL via
    `cl.sphere.destruction`, Intense Magic; bonus feats left at 4, 8, 12). Casting tradition Ashwright Academy:
    4 general drawbacks, Easy Focus boon, Energy Focus (fire) → +5 spell points, +1 talent; it grants
    Protection + Armored Magic (the 2 casting bonus talents). 21 magic talents (12 + 6 bonus + 2 + 1).
    Spell points 29. Fire and searing blast actions, Explosive Orb, Summon, Aegis (turns on a toggle whose
    deflection beats her ring), conjuration companion Ember (Powerful + Armored Companion modifiers), two
    shapeshift forms (Avian, Blank + Size Change) with Lingering and Mass Alteration, slots, a wand with
    charges, a handy haversack, and the Ember theme.
  - **Tova Rask, Striker 12 (half-orc):** expert, Con practitioner. Boxing from Bare Knuckles, Brute and Unarmored
    Training from her martial tradition (Ironhand Pit), Athletics (Run package). Extra Skill Talent ×2 → Bluster
    (Intimidate) + Frightening Threat. Free ranks: 10 Acrobatics, 10 Intimidate. 12 unarmed-sphere talents → 2d6
    unarmed strike, amulet of mighty fists +1 flaming. AC bonus = min(Con, level) as an untyped AC modifier
    (untyped AC reaches CMD by itself; don't add a CMD modifier too). Tension resource (max Con + level/3 + 2 for
    High Tension ×2), tension actions that turn on toggles, Power Attack, Tight Guard, Haste.
  - **Rules note:** the sheet counts magic item Int (a headband) toward skill ranks per level, so Ilyra's budget
    shows 156; strict Pathfinder gives 132 (a headband grants ranks only in specific skills). She spends 128.
    Not changed; flag it if the table cares.
- **QOL review:** see `QOL_HANDOFF.md`. Done: all of Priority 1 (the Bren item is moot: the example was replaced); 2.1 (grouped tabs); 2.3 (Gear/Notes split); 3.1 and 3.2; Priority 4; Priority 5; 6.2–6.4.
  - Kept by choice: Sheet order (2.2), removal confirmations (6.1), separate tabs (2.4).

- **Sphere effects on actions (2026-11-01).** An optional "Effect" section in each action's editor (`fxEditor`).
  - **Data (typed dice, 2026-11-01):** `a.fx = {atk: ''|rtouch|mtouch|ranged|melee, dmg, dtype, area}` where `dmg` is typed dice
    (`1d8`, `5d4+2`, `2d6+1d4`), read by `diceParse`/`diceText`. Formulas work like in other fields, no braces needed:
    `ceil(cl/2)d6+floor(lvl/2)`, `(2+3)d(2*4)`. A `d` is a die when it starts a term or follows a number or `)`, and is followed
    by a number or `(`; so names like `dc`, `dex`, `medium` stay names, and a bare name before the d needs parentheses: `(hd)d6`
    (`hdd6` is refused). Braces still work (`{ceil(cl/2)}d6`) and are still how Area and notes take formulas.
    `a.aug = [{id, name, grp, on, cost, add (typed extra damage), addType (its own damage type; blank or the same type = same roll),
    n (replaces the first dice term's count), die (replaces its size, text like d8), dtype, area, save, atk ('' keep, 'none'), note}]`.
    Extra damage of another type is a separate pool: the card reads "1d8 fire + 5d4 acid" and Roll20 rolls each pool on its own.
    Old saves (`fx.n/die/flat`, `aug.nAdd/flat`) are converted by `fxMigrate` in `sanitizeChar`. Reported by the owner: a Scholar
    flashbang (1d8) with an Ooze option (+5d4) couldn't mix die sizes, and the die list was too rigid.
    Augments work without `fx` too (cost and notes only, e.g. Summon's "Lasts without concentration"). `sanitizeChar` checks both.
  - **Engine:** `actVars(a)`: when the action names a magic sphere, `cl` (and close/medium/long/durcl) use that sphere's
    caster level, for the effect and for the action's range, duration, cost and custom DC. `fxCalc(a,V)` applies the augments
    that are on, in order, and returns {hit, dmg, dtype, area, save, notes, cost, names, line}. Area and notes take formulas
    in braces: `{10+5*floor(cl/5)}-ft. burst` (`fxFill`). Attack bonus = BAB + Dex (ranged) or Str (melee) + size + attack modifiers.
  - **Sheet:** the action card shows the effect line in bold ("Ranged touch +8 · 7d6+6 fire"), augment chips (`augChips`,
    `A.augTog`: one per `grp` at a time, the owner's choice of toggles on the card), and notes. Use spends base + augment costs.
  - **Presets:** `FXBASE` (Destructive blast: 1d6 per odd CL, ranged touch; Damage (blank)) and `FXAUG` (one die per CL for a
    spell point; Fire, Frost, Electric, Acid, Thunder, Force and Searing Blast; Explosive Orb, Energy Sphere, Chain Blast,
    Energy Wall), all from the wiki's Destruction page.
  - Formula previews (`fF(path,label,soft,actionIndex)`, `data-fv`) use the action's sphere caster level too.
  - The augment editor shows On, name, group, cost, extra damage (+ its type) and notes; the replace fields (dice count, die size,
    damage type, attack roll, save, area) fold under "More" (`aum-<id>`). Remove is a button at the bottom of each augment.
  - Owner feedback (2026-11-01): "a bit awkward", augments can feel confusing; to playtest before more changes. Labels on the card's
    augment groups were offered and declined. Roll20 export: keep as is for now and see how it goes (the Skills dropdown works well).
- **Sphere-specific drawbacks on the sphere's card (2026-11-02).** Data unchanged: they're still in
  `traditions.casting.drawbacks` with `kind:'sphere'` and `sphere`, so the +1 magic talent each, tradition export/import and old
  saves work as before. Shown under the base sphere's header (`sphDbLines`: "Drawback: name, notes") and edited inside the header,
  above the notes (`sphDbEdit`, `A.sphDbAdd`/`sphDbDel`), on magic spheres or any sphere that has one. The Traditions tab lists
  general drawbacks only, with a summary line of the sphere ones; a sphere drawback with no sphere named still shows there to be
  assigned. Renaming a sphere carries its drawbacks.
  - **Talents it gives (2026-11-02):** a sphere drawback's `weight` (the same field general drawbacks use for "Counts as") is
    now its number of bonus magic talents, default 1, for the rare ones that give more. Edited beside its name on the sphere
    card; the line shows "N talents" above 1. (Before this, sphere drawbacks always counted 1 whatever `weight` held.)
  - **Combat and skill spheres too (2026-11-02):** every sphere card has the drawback box. Magic sphere drawbacks stay in the
    casting tradition (magic talents, only with the tradition on). Combat and skill sphere drawbacks are stored in
    `ch.sphDrawbacks = [{id, name, sphere, weight, notes, tk: 'combat'|'skill'}]` and add their `weight` in bonus talents to the
    expected total, no tradition needed (wiki: "Spheres of Might allows you to take drawbacks in return for additional talents in
    a given sphere"; Guile: "Usually a drawback's benefit is a talent from the same sphere"). `sphDbs(k)` returns both kinds
    with their data path; `A.sphDbAdd` picks the store by `sphereKind(k)`; `A.sphDbDel` takes `data-src` (cast/own).
- **Resources that empty on a rest (2026-11-02).** `reset` can also be `short0` ("Empties on a short rest", and on a long rest) or
  `long0` ("Empties on a long rest"), for pools that build up (tension, delayed damage). Rests report what they emptied.
  Tova's Tension uses `short0`.
- **Base sphere detection fixed (2026-11-02).** `roleOf` used to call any talent with the word "sphere" in its name a base sphere
  ("Energy Sphere", a Destruction blast shape, was labeled one). Now: with a sphere filled in, only "<sphere>" or "<sphere>
  sphere"; without one, "X sphere" when X is a sphere in the wiki library. An explicit "Counts as" (`p.role`) always wins.
- **Point buy (2026-11-02).** "Point buy" beside the Ability scores heading on Build (`A.pointBuy`): Pathfinder 1e costs
  (7 = −4 … 10 = 0 … 18 = 17) for the base scores, 7–18, a running total from 0 (race- and budget-neutral, by the owner's
  choice; the usual budgets are listed as a note), All 10s, and "Use these scores" sets `ch.abil` (racial and level +1s stay
  separate; Undo works). Scores outside 7–18 start the dialog at 10.
- **"Parties you're in" (2026-11-02).** A list on the Characters screen (`partiesInCard`, signed in only, hidden when empty):
  each party with buttons to open your characters in it. Built from `homeList()`: local copies read `ch.parties` directly;
  the account's list record now also stores `parties: [{pid, name}]` (no codes; `partyNames`, `cloudRec`, `SheetCloud.list`),
  filled in the next time each character saves. No extra reads, no rules change (the character rule only checks z/json).
- **Bug hunt (2026-11-02, four reviewers; every fix re-tested).**
  - **Dice and Roll20:** only a number, (formula) or one name may follow the d ("1d6 per caster level" used to make a d72);
    counts capped at 500; Roll20 rolls only text that reads as dice (`r20dice`), other weapon/property dice print as words; a
    save shows even without a DC; total costs never go below 0; augment groups match ignoring case/spaces; `dc`/`mdc` use the
    sphere's DC in an action's formulas; no Skills macro when there are no skills. Old augments' "more dice" (`nAdd`) is kept
    (adds to the main dice, as originally), so converted saves keep their old damage.
  - **Rules:** sphere drawbacks count only once you have the sphere (blank sphere: counted, as before), magic ones with or
    without a casting tradition (wiki: a caster can take one when gaining the sphere); combat/skill drawbacks for spheres you
    don't have are listed on the Talents tab, magic ones stay editable on Traditions. A drawback's bonus talents don't count
    for skill ranks (`sphRankTalents`; wiki "Counting Bonus Talents"). Craft/Profession/Perform/Artistry/Lore have no
    automatic associated skill (`SK_GENERIC`: Craft (alchemy) ≠ Craft (traps)). Level-up doesn't top up pools that start
    empty. Print labels for short0/long0. `roleOf` accepts "base" wording and compares like sphere names; "X sphere" with no
    sphere filled in counts as before. Sphere names that differ only in capitals merge (`normSph` in `render`).
  - **Security (rules + client):** new party and share ids start with the creator's uid (a deleted party or a stopped link
    can't be re-created by someone else); parties record `owner`; non-owner GMs can only add/remove themselves; "New GM
    invite link"; member/sheet/share docs have field allow-lists and size caps, and a member's id must match its `charId`;
    imports and backups drop `share`/`parties` (`noLinks`), Export JSON leaves them out; a party that refuses a character
    (removed or deleted) is dropped from it with a notice; no email as the player name; the viewer blocks drag-and-drop;
    `memberCard` tolerates malformed members; a pending save goes out before the viewer opens.
  - **Robustness/UI:** `sanitizeChar` cleans nested lists (drawbacks, boons, log, companion abil/attacks/mods/traits,
    weapon props), forces names/spheres to strings, normalizes resource resets, and uses own-key checks (`own`) so
    "constructor"/"__proto__" can't pass as a theme, condition, size or form. `paint` catches a drawing failure and falls back
    to the Characters screen with a message (`renderFailed`) instead of a blank page. Undo never changes share/party state.
    Importing a character already in the list makes a separate copy. The theme preview survives repaints (`UI.themeDlg`).
    Print shows action effects, drawbacks, boons and sphere drawbacks. Dice fields have accessible names.
  - **Not changed (noted):** an empty breakdown button on maneuver rows. (Fixed 2026-11-08, see "Playtest batch": focus
    after changing an associated skill, unlabelled text boxes, the level-up skill step and new talents, spheres sharing a
    skill, Athletics Leap + Run, History and drawbacks, one invite code making many member records.)
- **Playtest batch (2026-11-08).** Requests from the table, plus the small fixes left on the list.
  - **Trade overlap +4** (Vocation sphere, "Trade Talents": an overlapping class skill from two (trade) talents that you don't
    swap out gives +4 instead of +3; swaps are limited to 1 per 2 trade talents). `traditions.trade.plus4` = [skill ids], ticked
    in "Overlapping class skills" on the trade card (only skills the tradition makes class skills; only while it replaces
    class skills). `deriveCore` builds `cs4` next to `cs`; class skill lines read "Class skill (trade overlap)" +4, Craft/Perform
    lines follow their base skill; `D.csFrom` says "(overlap, +4)". The swap limit is shown as text, not enforced.
  - **A skill using another ability:** `ch.skillAbil = {skill id: {a, why, sit}}` (in `blankChar`; `sanitizeChar` keeps only
    valid abilities, `why` ≤ 200). The Skills tab's Ability cell is a button (`skAbCell`) opening `A.skAbil` (ability, why, "only
    sometimes", "Back to X"). Always: the skill uses that ability, the line reads "Str (instead of Cha: why)", the cell is marked
    *. Only sometimes: the total doesn't change; `skAbSit(D, …)` adds a situational line "+4 Str instead of Cha (why)" shown
    under the skill (and in Roll20 cards with the other situational bonuses). Works for extra Craft/Perform/… lines too;
    custom skills already pick their ability.
  - **Extra Magic / Combat / Skill Talent feats** count toward "Talents you get" by themselves (`xtalFeats`: feat picks
    named "Extra … Talent", "Times taken" counts; `D.xtal`). Old workarounds are pointed out on the Build tab:
    a class's Bonus talents above 0 ("Lower Bonus talents by N", `xtalFix`) and free talents (Bonus talent / free base sphere)
    whose name or notes mention an Extra Talent feat ("Count them as normal talents", `xtalFree`). Tova's example now counts
    Bluster and Frightening Threat as normal talents (14 / 14).
  - **Shared associated skill:** highest sphere wins (see "Free skill ranks from spheres"). **Athletics** may list Acrobatics
    twice (Leap and Run packages: `SSK.athletics.dup = {acro: 2}`), which gives the shared-skill competence bonus.
  - **Level-up order:** Class, Hit points, Feats & talents, Skills, Review (the skills step sees the new spheres).
  - **Focus:** after choosing or removing an associated skill the keyboard stays on that skill's box (or the "add" box),
    without scrolling (`UI.focusSel`, checked first in `restoreUI`).
  - **Labels:** card notes, the import box, the class-list search and the level-up hit points box have accessible names.
  - **History** records drawbacks and boons (`db:` / `bn:` keys; ids added by `ensureIds`). A history started earlier takes
    the ones already there as known once (`ch.histDb`), so they aren't listed as new.
  - **Party members (database rule):** a member record can only be created for a character saved in the player's account
    (`exists(users/{uid}/characters/{charId})`), so one invite code can't make endless records. Joining saves the character
    to the account first. **Deploy the rules by hand** (`firebase deploy --only firestore`): GitHub only deploys the site.
    The site change works with the old rules too, so the order doesn't matter.
  - **GitHub workflow:** `actions/checkout@v5`, `actions/setup-node@v5` (the v4 ones ran on Node 20, which GitHub is retiring).
- **Sheet tab layout (2026-11-01):** the Companions card moved from the right column to the left, under Spheres, to balance the columns.
  - Ilyra's four blast actions became one "Destructive blast" with augments (Fire Blast on by default).
- **Roll20 export (2026-11-01).** A "Roll20 macros" card on Save & print (`roll20Card`, `roll20Macros`). Free accounts only:
  no Mod (API) scripts, since some of the table's GMs don't have Pro; Roll20 has no way for outside sites to write into a game.
  - **One macro per roll** (owner's choice; no chat menu): Init (with `&{tracker}`), Saves (a dropdown like Skills: pick one
    save and only it rolls, with its situational bonuses in the card; changed 2026-11-02 because rolling all three confused players), Checks (CMB, CMD,
    concentration, magic skill check, DCs), Skills (one dropdown of every usable skill; uses `&#125;`-escaped query options, so
    it must be pasted as a character Ability), one per weapon (full attack: each hit with crit-range highlight `cs>N`, a
    confirmation roll and damage with always-on special ability dice), and one per action (attack, damage, area, save/DC,
    range, duration, notes) using the augments switched on now; its suggested name includes them so versions get distinct names.
  - Every macro uses Roll20's built-in `default` template and asks for an extra modifier (`?{Modifier|0}`,
    `?{Attack modifier|0}`, `?{Damage modifier|0}`). Text from the sheet goes through `r20t` (braces, `[[`, `|` neutralized).
  - Copy buttons (`copyText`: clipboard API, `execCommand` fallback), "Show the text" for manual copying, Download all (.txt),
    step-by-step instructions, and a warning when toggles or conditions are on (their bonuses are baked in).
  - **Not yet tested in a real Roll20 game.** The owner will paste the examples' macros and report back. The Skills macro is the
    likeliest to need a fix (nested query escaping).
- **Share links and parties (2026-11-02; released to everyone the same day).** Controlled by `BETA_ALL` (now true); with it
  false, the features only show with `?beta` (remembered in localStorage `spheres-beta`; `?beta=0` turns it off). Share links
  and invite links work regardless.
  - **Owner's decisions:** only GMs see the dashboard (players never see each other); share links open for anyone with the link,
    read-only; GMs can open full sheets read-only; a character can be in several parties; GMs never edit players' sheets.
  - **Database (`firestore.rules`):** `users/{uid}/characters` unchanged. `shares/{id}`: get by anyone, no list, owner-only
    write (`owner` field). `parties/{pid}` {name, gms[], code, gmCode, by}: only GMs read; a GM edits; anyone can add only
    themselves to `gms` by writing `gmJoin` = `gmCode`. `parties/{pid}/members/{uid_charId}`: the player creates it with the
    current `code`, updates keep the same code, GMs read and delete. `parties/{pid}/sheets/{uid_charId}`: the full copy, only
    while a member doc exists, GMs read. Codes and ids: 22 random characters (`SheetCloud.rnd`).
  - **Client:** `SheetCloud.share*/party*/member*/sheet*/watchMembers` in the module. `publishCopies(c)` runs after each
    successful account save (never blocks it): share copy at most every 60 s, party summary (`partySummary`) only when it
    changes, full sheet copy at most every 30 s, all flushed when the tab is hidden. Copies go through `copyRec`, which strips
    `share` and `parties` (no invite codes in copies). `ch.share = {id, uid}`, `ch.parties = [{pid, code, name, uid}]`;
    only entries whose `uid` is the signed-in user are used (imports and duplicates can't write over someone else's copies;
    Duplicate clears both).
  - **Read-only viewer:** `roOpen`/`roExit`, `UI.ro`; `save`, `cloudPush`, `syncOpen`, `undo`, `histNow` and the change/input
    handlers do nothing while it's on; `roLock` disables every field and every button except `RO_OK` (breakdowns, folding).
  - **Links:** `?share=ID`, `?join=PID&code=…&n=Name&beta=1`, `?gmjoin=…` are read into `LINK` and removed from the address.
    `linkGo()` opens the viewer, or (after sign-in) asks which character joins / confirms becoming a GM.
  - **UI:** Characters screen "Parties you run" (`partiesCard`: create, open, player and GM invite links, rename, new invite
    link, stop being a GM, delete); dashboard (`partyHTML`, `memberCard`, live via `watchMembers`), each card with Open sheet
    and Remove (Remove also changes the player invite code so the old link can't re-add them); Save & print "Share and
    parties" (`shareCard`: make, copy or stop a share link; leave a party).
  - **Tests:** `tests/rules-check.js` (69 checks of the rules) and `tests/party-check.js` (31 end-to-end checks with four
    browsers: GM, player, signed-out share viewer, second GM), both against the Firebase emulators (`?emu` on localhost
    points the page at them; never active on the real site). Commands at the top of each file.
  - **Deploying:** `firebase deploy` sends the page and the rules together. Test on the live site with `?beta` and two Google
    accounts before setting `BETA_ALL`.
  - **Tested live by the owner (2026-11-02):** deployed with the new rules; GM in a normal window, player in an incognito window
    (one Google sign-in per browser profile, so two accounts need separate profiles, browsers or a private window). Joining,
    live HP changes on the dashboard and opening the sheet read-only all worked.
  - **Released to everyone (2026-11-02):** `BETA_ALL=true` at the owner's request (the players know the sheet is in heavy testing).
    The cards still carry a "beta" tag. Invite links no longer add `&beta=1`. To hide the features again, set `BETA_ALL=false`
    and redeploy; existing parties and share links keep working.
- **Feature roadmap (agreed with the owner, 2026-11-01).** Done: new examples, skill sphere ranks, color themes, automated
  checks, sphere effects, Roll20 export, share links and parties (beta). Still to discuss:
  - **Talent descriptions: phase 1 built 2026-11-06** (see "Wiki descriptions" under "How the sheet is built"; the
    numbers below were the plan, the built ones are there). Decisions agreed with the owner:
    - **Scope (phase 1):** all sphere talents (magic, combat, skill), Equipment sphere talents (in
      `09-items-equipment`), and tradition drawbacks and boons (in `08-traditions`). Feats aren't included.
    - **Text:** the Ultimate version only; each page's `**Tab: Original**` part is skipped.
    - **Size (measured from the Oct 2026 bundle):** about 4,000 sphere talents in 68 spheres, 3.5 MB raw, about 0.9 MB gzipped
      (the earlier 6.1 MB figure counted the Original copies too). One sphere is about 30–80 KB; Tinker is the largest (~290 KB raw).
    - **Wiki layout:** talents are `####` headings under any heading (level 1–3) containing "Talents" (but not
      "Talent Types"); tags sit in the heading (`(ghost strike)`, `[utility]`, source like `[Gravecaller's HB]`).
    - **Build:** a script (kept outside `public/`) reads the bundle and writes `public/talents/<sphere>.json`
      (name, type tags, source, section normal/advanced/legendary, markdown, wiki link) plus `public/talents/index.json`
      (all names, sphere, tags; ~150 KB). Rerun only when the wiki bundle updates.
    - **Sheet:** fetch a sphere's file on demand (when a talent row opens) and cache it; show the description
      in the row using the `#baseLib` renderer. Matching is forgiving (case, punctuation, `(…)`/`[…]` ignored); unmatched
      picks show "Couldn't find this talent" with a search to link it, saved as `p.ref` (a new, optional field).
    - **Downloaded file (file://):** can't fetch, so it shows the wiki link instead. (Offline mode isn't wanted.)
    - **Tests:** new `check.js` checks (descriptions load, matching, not-found, file:// fallback) and checks on the
      build output (talent counts per sphere, no empty descriptions).
    - **Deploy:** upload the `talents/` folder only when the wiki changes; normal updates stay one file.
    - **Matching test on the examples (2026-11-06):** sphere talents matched; base abilities are already in `#baseLib`;
      misses were an Equipment talent, a drawback (Energy Focus), and "Summon Ember" (not in the wiki under that name).
    - **Built differently from the plan:** a downloaded sheet loads the text from the website when online (CORS header),
      rather than only showing a link; base sphere picks keep using `#baseLib`.
    - **Tested with Anima (Wraith, Nature sphere), 2026-11-06:** Create Nature (4.4 KB of text), Earth Mastery, Nature Lord
      and Expanded Geomancing match; "Expanded Geomancy" (misspelt) suggests Expanded Geomancing first; Consciousness
      Linked, Innate Curse and Anima's other general drawbacks match; "Drawback Feat boon" matches the Drawback Feat boon. Anima's notes repeat the wiki text on most talents, so
      "Clear my notes" shows there.
    - **Deployed 2026-11-06;** the owner confirmed the talent text shows on the live site.
    - **Phase 2 built 2026-11-06** (owner's choices: search in both the Talents tab and level-up, plus a Browse list on each
      sphere card). See "Adding talents from the wiki" under "Wiki descriptions".
    - **Not covered:** feats; talents typed on the Feats & features tab; martial-tradition drawbacks (the sheet has no
      list for them; the 157 martial sphere drawbacks are in `drawbacks.json` for later).
  - **Feats from the wiki: low priority (owner, 2026-11-06).** The table uses both Spheres feats and core Pathfinder 1e feats,
    and the wiki bundle only has the Spheres ones, so a feat library would always be incomplete. Revisit only with a source
    for PF1e feats too. Martial-tradition drawbacks (already in `drawbacks.json`) could still get a list on their own.
  - **Archetypes from the wiki (watch the size):** same approach; the lightest version records the name, the
    replaced features and a wiki link.
  - **Pinned, low priority:** Mythic (the table doesn't play it). Not wanted: an installable app / offline mode.
- Spell points tracker: **already automatic** (corrected 2026-11-06): level-up adds a Spell points resource (max `spmax`) when a
  casting class arrives, and Martial focus for a martial one.
- Optional confirmations not added: Enter in the HP box, a cap on the resource "Now" field.

---

## Hosting files (to rebuild the site folder from scratch)

`firebase.json`
```json
{
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*"
    ],
    "headers": [
      {
        "source": "**/*.html",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache"
          }
        ]
      },
      {
        "source": "/",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache"
          }
        ]
      },
      {
        "source": "/talents/**",
        "headers": [
          {
            "key": "Access-Control-Allow-Origin",
            "value": "*"
          },
          {
            "key": "Cache-Control",
            "value": "public, max-age=3600"
          }
        ]
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

`.firebaserc`
```json
{ "projects": { "default": "spheres-character-sheet" } }
```

`firestore.rules` (copied from the site zip on 2026-11-06; if they ever differ, the site zip wins)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Each player can read and write only their own characters: users/{their uid}/characters/{character id}
    match /users/{uid}/characters/{charId} {
      allow read, delete: if request.auth != null && request.auth.uid == uid;
      // A character is saved either compressed (z: gzip bytes, about 1 MB) or as plain text (json, older versions).
      allow create, update: if request.auth != null && request.auth.uid == uid
        && ((request.resource.data.z is bytes && request.resource.data.z.size() < 1000000)
            || (request.resource.data.json is string && request.resource.data.json.size() < 900000));
    }

    function signedIn() { return request.auth != null; }
    function sizeOk(d) {
      return (d.z is bytes && d.z.size() < 1000000) || (d.json is string && d.json.size() < 900000);
    }
    // A character copy (share link or a party's full sheet): only these fields, short labels.
    function copyOk(d) {
      return d.keys().hasOnly(['z', 'enc', 'json', 'owner', 'name', 'summary', 'savedAt', 'updatedAt'])
        && sizeOk(d)
        && (!('name' in d) || (d.name is string && d.name.size() <= 200))
        && (!('summary' in d) || (d.summary is string && d.summary.size() <= 400));
    }
    // A party member's summary: only these fields, lists and labels of sensible size.
    function memberOk(d, key) {
      return d.keys().hasOnly(['name', 'player', 'cls', 'lvl', 'race', 'hp', 'ac', 'touch', 'ff', 'cmd', 'fort', 'ref', 'will',
          'init', 'perc', 'conds', 'buffs', 'res', 'form', 'host', 'neg', 'accent', 'code', 'charId', 'owner', 'updatedAt'])
        && d.charId is string && key == request.auth.uid + '_' + d.charId
        && d.get('name', '') is string && d.get('name', '').size() <= 200
        && d.get('player', '') is string && d.get('player', '').size() <= 100
        && d.get('cls', '') is string && d.get('cls', '').size() <= 300
        && d.get('conds', []) is list && d.get('conds', []).size() <= 60
        && d.get('buffs', []) is list && d.get('buffs', []).size() <= 60
        && d.get('res', []) is list && d.get('res', []).size() <= 60;
    }

    // Read-only share links: a copy of one character. Anyone with the link (its long random id) can read it;
    // nobody can list them. Only the player who made it can write or delete it.
    match /shares/{shareId} {
      allow get: if true;
      allow list: if false;
      // New links start with the owner's id, so a stopped link can't be taken over by someone else.
      allow create: if signedIn() && shareId.matches(request.auth.uid + '_.+')
        && request.resource.data.owner == request.auth.uid && copyOk(request.resource.data);
      allow update: if signedIn() && resource.data.owner == request.auth.uid
        && request.resource.data.owner == request.auth.uid && copyOk(request.resource.data);
      allow delete: if signedIn() && resource.data.owner == request.auth.uid;
    }

    // Parties: only their GMs can read them. Players join a character with the invite code; GMs join with the GM code.
    match /parties/{pid} {
      function party() { return get(/databases/$(database)/documents/parties/$(pid)).data; }
      function isGM() { return signedIn() && request.auth.uid in party().gms; }

      allow get, list: if signedIn() && request.auth.uid in resource.data.gms;
      // New parties start with the creator's id (so a deleted party can't be re-created by someone holding its invite),
      // and record the creator as owner.
      allow create: if signedIn() && pid.matches(request.auth.uid + '_.+')
        && request.resource.data.gms == [request.auth.uid] && request.resource.data.owner == request.auth.uid
        && request.resource.data.code is string && request.resource.data.code.size() >= 16
        && request.resource.data.gmCode is string && request.resource.data.gmCode.size() >= 16
        && request.resource.data.name is string && request.resource.data.name.size() <= 120;
      // A GM can rename the party and change its codes. The GM list: anyone may add or remove only themselves;
      // only the creator may change it otherwise. The owner never changes. Anyone else can only join as GM with the GM code.
      function gmsOk() {
        return request.resource.data.gms == resource.data.gms
          || request.resource.data.gms == resource.data.gms.removeAll([request.auth.uid])
          || request.auth.uid == resource.data.get('owner', '');
      }
      allow update: if signedIn() && request.resource.data.gms is list
        && request.resource.data.get('owner', '') == resource.data.get('owner', '') && (
        (request.auth.uid in resource.data.gms && gmsOk()
          && request.resource.data.code.size() >= 16 && request.resource.data.gmCode.size() >= 16
          && request.resource.data.name is string && request.resource.data.name.size() <= 120)
        || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['gms', 'gmJoin'])
          && request.resource.data.gmJoin == resource.data.gmCode
          && request.resource.data.gms == resource.data.gms.concat([request.auth.uid])));
      allow delete: if signedIn() && request.auth.uid in resource.data.gms;

      // One summary per character in the party, written by its player, read by the GMs.
      // The document id is "<player uid>_<character id>".
      match /members/{key} {
        allow get, list: if isGM();
        allow create: if signedIn() && key.matches(request.auth.uid + '_.+')
          && request.resource.data.owner == request.auth.uid
          && request.resource.data.code == party().code
          && memberOk(request.resource.data, key);
        allow update: if signedIn() && resource.data.owner == request.auth.uid
          && request.resource.data.owner == request.auth.uid
          && request.resource.data.code == resource.data.code
          && memberOk(request.resource.data, key);
        allow delete: if signedIn() && (resource.data.owner == request.auth.uid || isGM());
      }
      // The full character, for the GM's read-only view. Only for characters in the party.
      match /sheets/{key} {
        allow get, list: if isGM();
        allow create, update: if signedIn() && key.matches(request.auth.uid + '_.+')
          && request.resource.data.owner == request.auth.uid
          && exists(/databases/$(database)/documents/parties/$(pid)/members/$(key))
          && copyOk(request.resource.data);
        allow delete: if signedIn() && (key.matches(request.auth.uid + '_.+') || isGM());
      }
    }

    // Everything else is closed.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Then put the sheet at `public/index.html`.

## Firebase web config (already in the sheet)
```js
const firebaseConfig = {
  apiKey: "AIzaSyA9AqUEfkvPWQaXlwgLMgugHC8EAMnbNt8",
  authDomain: "spheres-character-sheet.firebaseapp.com",
  projectId: "spheres-character-sheet",
  storageBucket: "spheres-character-sheet.firebasestorage.app",
  messagingSenderId: "415828278170",
  appId: "1:415828278170:web:c720647aa3e4421b205823"
};
```
