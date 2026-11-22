/* Spheres Character Sheet: database rules checks.
   Runs firestore.rules in the Firebase emulator (a throwaway demo project, never the real database) and tries what
   each kind of user should and shouldn't be able to do.

     npm i firebase-tools@13 firebase@10.12.2 @firebase/rules-unit-testing@3
     npx firebase emulators:exec --only firestore --project demo-spheres "node tests/rules-check.js"

   (The emulator needs Java.) Exit code 0 = every check passed. */
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, arrayUnion, arrayRemove, Bytes, getCountFromServer, setLogLevel } = require('firebase/firestore');
setLogLevel('silent'); /* refused writes are expected here; don't print each one */

let pass = 0, fail = 0;
async function check(what, p) {
  try { await p; pass++; console.log('  ok   ' + what); }
  catch (e) { fail++; console.log('  FAIL ' + what + ': ' + (e && e.message || e).split('\n')[0]); }
}
const CODE = 'PlayerCode-0123456789', GMCODE = 'GmCode-0123456789abcd', z = Bytes.fromUint8Array(new Uint8Array([1, 2, 3]));

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-spheres',
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 }
  });
  await env.clearFirestore();
  const gm = env.authenticatedContext('gm1').firestore(), gm2 = env.authenticatedContext('gm2').firestore();
  const pl = env.authenticatedContext('pl1').firestore(), other = env.authenticatedContext('pl2').firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log('Own characters (unchanged rule)');
  await check('a player saves their own character', assertSucceeds(setDoc(doc(pl, 'users/pl1/characters/c1'), { z, enc: 'gzip', name: 'Tova' })));
  await check('another player can’t read it', assertFails(getDoc(doc(other, 'users/pl1/characters/c1'))));
  await check('another player can’t write it', assertFails(setDoc(doc(other, 'users/pl1/characters/c1'), { z })));
  await check('signed out can’t read it', assertFails(getDoc(doc(anon, 'users/pl1/characters/c1'))));

  console.log('Portraits beside the sheet, and the Characters list index (2026-11-22)');
  const img = Bytes.fromUint8Array(new Uint8Array(1000)), bigImg = Bytes.fromUint8Array(new Uint8Array(170000));
  await check('a character saves with its portrait as bytes', assertSucceeds(setDoc(doc(pl, 'users/pl1/characters/c2'), { z, enc: 'gzip', img, name: 'Tova' })));
  await check('a portrait over 160 KB is refused', assertFails(setDoc(doc(pl, 'users/pl1/characters/c3'), { z, img: bigImg })));
  await check('a portrait that isn’t bytes is refused', assertFails(setDoc(doc(pl, 'users/pl1/characters/c3'), { z, img: 'data:image/webp;base64,AAAA' })));
  await check('a share carries a portrait', assertSucceeds(setDoc(doc(pl, 'shares/pl1_S9'), { owner: 'pl1', z, img, name: 'Tova' })));
  await check('a share with an oversized portrait is refused', assertFails(setDoc(doc(pl, 'shares/pl1_S8'), { owner: 'pl1', z, img: bigImg })));
  await check('the player writes their list index', assertSucceeds(setDoc(doc(pl, 'users/pl1/index/chars'), { v: 1, chars: { c1: { name: 'Tova', savedAt: 1 } } })));
  await check('…and updates one entry', assertSucceeds(setDoc(doc(pl, 'users/pl1/index/chars'), { chars: { c2: { name: 'Ilyra' } } }, { merge: true })));
  await check('the player reads their list index', assertSucceeds(getDoc(doc(pl, 'users/pl1/index/chars'))));
  await check('the player counts their characters', assertSucceeds(getCountFromServer(collection(pl, 'users/pl1/characters'))));
  await check('another player can’t read the index', assertFails(getDoc(doc(other, 'users/pl1/index/chars'))));
  await check('another player can’t write the index', assertFails(setDoc(doc(other, 'users/pl1/index/chars'), { v: 1, chars: {} })));
  await check('another player can’t count the characters', assertFails(getCountFromServer(collection(other, 'users/pl1/characters'))));
  await check('an index with other fields is refused', assertFails(setDoc(doc(pl, 'users/pl1/index/chars'), { v: 1, chars: {}, x: 1 })));
  await check('an index whose chars isn’t a map is refused', assertFails(setDoc(doc(pl, 'users/pl1/index/chars'), { v: 1, chars: 'x' })));
  await check('other documents beside the index are closed', assertFails(setDoc(doc(pl, 'users/pl1/index/other'), { v: 1, chars: {} })));
  await check('the user document itself stays closed', assertFails(setDoc(doc(pl, 'users/pl1'), { a: 1 })));

  console.log('Share links');
  await check('the owner creates a share', assertSucceeds(setDoc(doc(pl, 'shares/pl1_S1'), { owner: 'pl1', z, name: 'Tova' })));
  await check('can’t create a share in someone else’s name', assertFails(setDoc(doc(other, 'shares/pl1_S2'), { owner: 'pl1', z })));
  await check('anyone with the link reads it (signed out)', assertSucceeds(getDoc(doc(anon, 'shares/pl1_S1'))));
  await check('another player reads it', assertSucceeds(getDoc(doc(other, 'shares/pl1_S1'))));
  await check('nobody can list shares', assertFails(getDocs(collection(anon, 'shares'))));
  await check('another player can’t change it', assertFails(setDoc(doc(other, 'shares/pl1_S1'), { owner: 'pl2', z })));
  await check('another player can’t delete it', assertFails(deleteDoc(doc(other, 'shares/pl1_S1'))));
  await check('signed out can’t write it', assertFails(setDoc(doc(anon, 'shares/pl1_S1'), { owner: 'pl1', z })));
  await check('a share without a sheet is refused', assertFails(setDoc(doc(pl, 'shares/pl1_S3'), { owner: 'pl1' })));
  await check('the owner updates it', assertSucceeds(setDoc(doc(pl, 'shares/pl1_S1'), { owner: 'pl1', z, name: 'Tova 2' })));
  await check('the owner deletes it', assertSucceeds(deleteDoc(doc(pl, 'shares/pl1_S1'))));

  console.log('Parties');
  await check('a GM creates a party', assertSucceeds(setDoc(doc(gm, 'parties/gm1_P1'), { name: 'Tuesday', gms: ['gm1'], owner: 'gm1', code: CODE, gmCode: GMCODE })));
  await check('can’t create a party for someone else', assertFails(setDoc(doc(pl, 'parties/pl1_P2'), { name: 'X', gms: ['gm1'], owner: 'gm1', code: CODE, gmCode: GMCODE })));
  await check('can’t create a party with a short code', assertFails(setDoc(doc(gm, 'parties/gm1_P3'), { name: 'X', gms: ['gm1'], owner: 'gm1', code: 'short', gmCode: GMCODE })));
  await check('the GM reads it', assertSucceeds(getDoc(doc(gm, 'parties/gm1_P1'))));
  await check('the GM lists their parties', assertSucceeds(getDocs(query(collection(gm, 'parties'), where('gms', 'array-contains', 'gm1')))));
  await check('a player can’t read it', assertFails(getDoc(doc(pl, 'parties/gm1_P1'))));
  await check('a player can’t list it', assertFails(getDocs(query(collection(pl, 'parties'), where('gms', 'array-contains', 'gm1')))));
  await check('a player can’t rename it', assertFails(updateDoc(doc(pl, 'parties/gm1_P1'), { name: 'Mine now' })));

  console.log('Joining');
  const key = 'pl1_c1';
  await check('a player joins with the invite code', assertSucceeds(setDoc(doc(pl, 'parties/gm1_P1/members/' + key), { owner: 'pl1', code: CODE, charId: 'c1', name: 'Tova', hp: { cur: 30, max: 40 } })));
  await check('joining with a character that isn’t saved in the account is refused', assertFails(setDoc(doc(pl, 'parties/gm1_P1/members/pl1_c5'), { owner: 'pl1', code: CODE, charId: 'c5', name: 'Ghost' })));
  await check('joining with a wrong code is refused', assertFails(setDoc(doc(other, 'parties/gm1_P1/members/pl2_c9'), { owner: 'pl2', code: 'WrongCode-0123456789', name: 'X', charId: 'c9' })));
  await check('can’t join under someone else’s id', assertFails(setDoc(doc(other, 'parties/gm1_P1/members/pl1_c7'), { owner: 'pl2', code: CODE, charId: 'c7' })));
  await check('can’t join a party that doesn’t exist', assertFails(setDoc(doc(pl, 'parties/gm1_NOPE/members/pl1_c1'), { owner: 'pl1', code: CODE, charId: 'c1' })));
  await check('the player updates their summary', assertSucceeds(setDoc(doc(pl, 'parties/gm1_P1/members/' + key), { owner: 'pl1', code: CODE, charId: 'c1', name: 'Tova', hp: { cur: 12, max: 40 } })));
  await check('another player can’t change it', assertFails(setDoc(doc(other, 'parties/gm1_P1/members/' + key), { owner: 'pl2', code: CODE, charId: 'c1' })));
  await check('the player can’t read the party’s summaries', assertFails(getDocs(collection(pl, 'parties/gm1_P1/members'))));
  await check('another player can’t read them', assertFails(getDoc(doc(other, 'parties/gm1_P1/members/' + key))));
  await check('the GM reads the summaries', assertSucceeds(getDocs(collection(gm, 'parties/gm1_P1/members'))));
  await check('the player uploads the full sheet', assertSucceeds(setDoc(doc(pl, 'parties/gm1_P1/sheets/' + key), { owner: 'pl1', z, name: 'Tova' })));
  await check('no full sheet without joining first', assertFails(setDoc(doc(other, 'parties/gm1_P1/sheets/pl2_c9'), { owner: 'pl2', z })));
  await check('the GM opens the full sheet', assertSucceeds(getDoc(doc(gm, 'parties/gm1_P1/sheets/' + key))));
  await check('the GM can’t edit the full sheet', assertFails(setDoc(doc(gm, 'parties/gm1_P1/sheets/' + key), { owner: 'pl1', z })));
  await check('the GM can’t edit the summary', assertFails(setDoc(doc(gm, 'parties/gm1_P1/members/' + key), { owner: 'pl1', code: CODE, charId: 'c1', hp: { cur: 0 } })));
  await check('another player can’t open the full sheet', assertFails(getDoc(doc(other, 'parties/gm1_P1/sheets/' + key))));

  console.log('Co-GMs');
  await check('joining as GM with a wrong code is refused', assertFails(updateDoc(doc(gm2, 'parties/gm1_P1'), { gms: arrayUnion('gm2'), gmJoin: 'nope' })));
  await check('joining as GM can’t change anything else', assertFails(updateDoc(doc(gm2, 'parties/gm1_P1'), { gms: arrayUnion('gm2'), gmJoin: GMCODE, name: 'Hijacked' })));
  await check('can’t add someone else as GM', assertFails(updateDoc(doc(other, 'parties/gm1_P1'), { gms: arrayUnion('gm2'), gmJoin: GMCODE })));
  await check('a second GM joins with the GM code', assertSucceeds(updateDoc(doc(gm2, 'parties/gm1_P1'), { gms: arrayUnion('gm2'), gmJoin: GMCODE })));
  await check('the second GM reads the summaries', assertSucceeds(getDocs(collection(gm2, 'parties/gm1_P1/members'))));

  console.log('Leaving and removing');
  await check('a GM changes the invite code', assertSucceeds(updateDoc(doc(gm, 'parties/gm1_P1'), { code: 'NewPlayerCode-0123456' })));
  await check('existing members keep updating after a code change', assertSucceeds(setDoc(doc(pl, 'parties/gm1_P1/members/' + key), { owner: 'pl1', code: CODE, charId: 'c1', hp: { cur: 5, max: 40 } })));
  await check('the GM removes a member', assertSucceeds(deleteDoc(doc(gm, 'parties/gm1_P1/members/' + key))));
  await check('a removed member can’t rejoin with the old code', assertFails(setDoc(doc(pl, 'parties/gm1_P1/members/' + key), { owner: 'pl1', code: CODE, charId: 'c1' })));
  await check('another player can’t remove a member', assertFails(deleteDoc(doc(other, 'parties/gm1_P1/members/pl1_c2'))));
  await check('a GM leaves the party', assertSucceeds(updateDoc(doc(gm2, 'parties/gm1_P1'), { gms: arrayRemove('gm2') })));
  await check('after leaving, they can’t read it', assertFails(getDoc(doc(gm2, 'parties/gm1_P1'))));
  await check('a player can’t delete the party', assertFails(deleteDoc(doc(pl, 'parties/gm1_P1'))));
  await check('the GM deletes the party', assertSucceeds(deleteDoc(doc(gm, 'parties/gm1_P1'))));

  await check('set up P4', assertSucceeds(setDoc(doc(gm, 'parties/gm1_P4'), { name: 'P4', gms: ['gm1'], owner: 'gm1', code: CODE, gmCode: GMCODE })));
  console.log('Hardening (bug hunt)');
  await check('a member with an unknown field is refused', assertFails(setDoc(doc(pl, 'parties/gm1_P4/members/pl1_c1'), { owner: 'pl1', code: CODE, charId: 'c1', junk: 'x'.repeat(1000) })));
  await check('a member whose id doesn’t match its character is refused', assertFails(setDoc(doc(pl, 'parties/gm1_P4/members/pl1_c1'), { owner: 'pl1', code: CODE, charId: 'c2' })));
  await check('a member with a non-list conditions field is refused', assertFails(setDoc(doc(pl, 'parties/gm1_P4/members/pl1_c1'), { owner: 'pl1', code: CODE, charId: 'c1', conds: 'boom' })));
  await check('a well-formed member joins', assertSucceeds(setDoc(doc(pl, 'parties/gm1_P4/members/pl1_c1'), { owner: 'pl1', code: CODE, charId: 'c1', name: 'Tova', conds: ['Shaken'], hp: { cur: 1, max: 2 } })));
  /* the portrait's round thumbnail (pic): empty, or a small base64 PNG, JPEG or WebP */
  const M = extra => setDoc(doc(pl, 'parties/gm1_P4/members/pl1_c1'), Object.assign({ owner: 'pl1', code: CODE, charId: 'c1', name: 'Tova' }, extra));
  await check('a member with a thumbnail updates', assertSucceeds(M({ pic: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=' })));
  await check('…an empty thumbnail is fine', assertSucceeds(M({ pic: '' })));
  await check('…an SVG “thumbnail” is refused (it could carry script)', assertFails(M({ pic: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })));
  await check('…so is a link instead of a picture', assertFails(M({ pic: 'javascript:alert(1)' })));
  await check('…so is one with markup after the picture', assertFails(M({ pic: 'data:image/png;base64,AAAA"><script>' })));
  await check('…so is one over 8000 characters', assertFails(M({ pic: 'data:image/png;base64,' + 'A'.repeat(8000) })));
  await check('…so is a thumbnail that isn’t text', assertFails(M({ pic: 5 })));
  await check('a share copy with an extra field is refused', assertFails(setDoc(doc(pl, 'shares/pl1_S9'), { owner: 'pl1', z, junk: 1 })));
  await check('a share id must start with its owner', assertFails(setDoc(doc(pl, 'shares/S9'), { owner: 'pl1', z })));
  await check('after Stop sharing, someone else can’t take the link', assertFails(setDoc(doc(other, 'shares/pl1_S1'), { owner: 'pl2', z })));
  await check('a party id must start with its creator', assertFails(setDoc(doc(gm, 'parties/ANY'), { name: 'X', gms: ['gm1'], owner: 'gm1', code: CODE, gmCode: GMCODE })));
  await check('after a party is deleted, someone else can’t re-create it', assertFails(setDoc(doc(other, 'parties/gm1_P1'), { name: 'Mine', gms: ['pl2'], owner: 'pl2', code: CODE, gmCode: GMCODE })));
  await check('a co-GM joins P4', assertSucceeds(updateDoc(doc(gm2, 'parties/gm1_P4'), { gms: arrayUnion('gm2'), gmJoin: GMCODE })));
  await check('a co-GM can’t remove the creator', assertFails(updateDoc(doc(gm2, 'parties/gm1_P4'), { gms: ['gm2'] })));
  await check('a co-GM can’t change the owner', assertFails(updateDoc(doc(gm2, 'parties/gm1_P4'), { owner: 'gm2' })));
  await check('a co-GM can make a new GM link', assertSucceeds(updateDoc(doc(gm2, 'parties/gm1_P4'), { gmCode: 'AnotherGmCode-0123456' })));
  await check('the old GM link stops working', assertFails(updateDoc(doc(other, 'parties/gm1_P4'), { gms: arrayUnion('pl2'), gmJoin: GMCODE })));
  await check('the creator can remove a co-GM', assertSucceeds(updateDoc(doc(gm, 'parties/gm1_P4'), { gms: ['gm1'] })));

  console.log('Review fixes (2026-11-09)');
  const NEW = 'NewPlayerCode-0123456';
  await check('set up P5 with a member', assertSucceeds((async () => {
    await setDoc(doc(gm, 'parties/gm1_P5'), { name: 'P5', gms: ['gm1'], owner: 'gm1', code: CODE, gmCode: GMCODE });
    await setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: CODE, charId: 'c1', name: 'Tova' }); })()));
  await updateDoc(doc(gm, 'parties/gm1_P5'), { code: NEW });
  await check('a member who opens the newer invite link again keeps their place (code becomes the new one)', assertSucceeds(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: NEW, charId: 'c1', name: 'Tova' })));
  await check('…but not any other code', assertFails(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: 'MadeUpCode-0123456789', charId: 'c1' })));
  await check('a member summary with an over-long race is refused', assertFails(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: NEW, charId: 'c1', race: 'x'.repeat(5000) })));
  await check('a member summary with a text AC is refused', assertFails(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: NEW, charId: 'c1', ac: 'x'.repeat(100) })));
  await check('a member summary with extra hit point fields is refused', assertFails(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: NEW, charId: 'c1', hp: { cur: 1, junk: 'x' } })));
  await check('a full member summary of the right kinds is taken', assertSucceeds(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: NEW, charId: 'c1', name: 'Tova', player: 'Pat', cls: 'Striker 12', lvl: 12, race: 'Human',
    hp: { cur: 1, max: 2, temp: 0, non: 0 }, ac: 20, touch: 12, ff: 18, cmd: 25, fort: 9, ref: 7, will: 4, init: 3, perc: 10, conds: [], buffs: [], res: [], form: '', host: '', neg: 0, accent: '#c9a14a' })));
  await check('a party with an unknown field is refused', assertFails(updateDoc(doc(gm, 'parties/gm1_P5'), { junk: 'x' })));
  await check('a party code that isn’t text is refused', assertFails(updateDoc(doc(gm, 'parties/gm1_P5'), { code: ['x'.repeat(20)] })));
  await check('a co-GM joins P5', assertSucceeds(updateDoc(doc(gm2, 'parties/gm1_P5'), { gms: arrayUnion('gm2'), gmJoin: GMCODE })));
  await check('a co-GM can’t delete the party', assertFails(deleteDoc(doc(gm2, 'parties/gm1_P5'))));
  await check('a GM marks the party as closing (the first step of deleting it)', assertSucceeds(updateDoc(doc(gm, 'parties/gm1_P5'), { closing: true })));
  await check('while it closes, a member’s save is refused', assertFails(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: NEW, charId: 'c1', name: 'Tova' })));
  await check('…and so is its full sheet', assertFails(setDoc(doc(pl, 'parties/gm1_P5/sheets/pl1_c1'), { owner: 'pl1', z, name: 'Tova' })));
  await check('…and joining', assertFails(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c3'), { owner: 'pl1', code: NEW, charId: 'c1' })));
  await check('the GM still clears the members', assertSucceeds(deleteDoc(doc(gm, 'parties/gm1_P5/members/pl1_c1'))));
  await check('the creator deletes the party', assertSucceeds(deleteDoc(doc(gm, 'parties/gm1_P5'))));
  await check('a member left behind can’t keep writing to a deleted party', assertFails(setDoc(doc(pl, 'parties/gm1_P5/members/pl1_c1'), { owner: 'pl1', code: NEW, charId: 'c1' })));
  await check('set up P6: the creator stops being a GM', assertSucceeds((async () => {
    await setDoc(doc(gm, 'parties/gm1_P6'), { name: 'P6', gms: ['gm1'], owner: 'gm1', code: CODE, gmCode: GMCODE });
    await updateDoc(doc(gm2, 'parties/gm1_P6'), { gms: arrayUnion('gm2'), gmJoin: GMCODE });
    await updateDoc(doc(gm, 'parties/gm1_P6'), { gms: arrayRemove('gm1') }); })()));
  await check('then a remaining GM can delete it', assertSucceeds(deleteDoc(doc(gm2, 'parties/gm1_P6'))));

  console.log('Everything else');
  await check('other collections are closed', assertFails(setDoc(doc(gm, 'secrets/x'), { a: 1 })));

  await env.cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
