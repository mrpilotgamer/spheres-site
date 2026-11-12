#!/usr/bin/env python3
"""Build the class feature files the sheet loads on demand (2026-11-12).

Reads the offline wiki bundle (SoP-Claude-Bundles) and writes, into public/classes/:
  <slug>.json   one per Spheres class in the sheet's class list: its class features with their wiki text (markdown),
                the choices listed under a feature (striker arts, knacks, tactics...), and which features the class table
                gives at each class level
  index.json    every class written, with its file, page and feature count

Run it again only when the wiki bundle or the class list changes:
  python3 tools/build-classes.py <path to SoP-Claude-Bundles folder>

How a class page is read:
  - The page is found the way tools/verify-classes.py finds it (same slugs and title rules), and only its first
    "**Tab: ...**" part is kept (the Ultimate text), like build-talents.py.
  - The features are the headings under "# Class Features" or "# Class Abilities", up to the next level-1 heading.
    A feature is a level-2 heading (level 3 on pages that have no level-2 ones). Its text runs to its first level-4
    heading or the next feature.
  - Choices: the level-4 headings under a feature (####). Level-3 headings between them are group labels and are kept
    as the choice's group ("g").
  - Levels: the class table's Special column, split at commas. Each entry is matched to a feature by name (ignoring
    (Ex)/(Su), [tags], plurals and trailing numbers like "+2" or "2/day"). Entries that match no feature are kept as
    they are (bonus talents, bonus feats...), so the sheet can still show them.

File layout (short keys keep the files small):
  {"v":1, "n": class name, "p": wiki page slug,
   "f": [[feature name, text, [[choice name, text, group], ...]], ...],
   "lv": {"1": [[table entry, index into f or -1, (index of the choice it names)], ...], ...},
   "a": [[archetype, page, [[feature, text, level, [[base feature index, level or 0 = all, "r" replaced / "m" modified], ...],
          "This replaces ..." text], ...]], ...],
   "pz": 1 on a file for a class that isn't a Spheres class (only its "Sphere X" conversion archetypes, no features)}

Archetypes (2026-11-12): the 06- bundle files. Kept: archetypes of a Spheres class that has a file (the class named in the
title "(X Archetype)", or, untitled, the class whose features its "This replaces ..." lines name), and the sphere conversions
("Sphere Wizard", "Spheres Oathbound (Paladin and Antipaladin Archetype)") of any class in the class list. A feature is a
heading (or, on pages without headings, a bold-lead paragraph "**Name (Ex):**"); its level is the first "at Nth level" in
its text, else the first level of the base feature it replaces or alters, else 1; "This ability replaces X, Y and Z." names the base features it removes (matched by name; the full
sentence is kept for the player either way).
"""
import gzip, json, os, re, sys, unicodedata

V = 1
HERE = os.path.dirname(os.path.abspath(__file__))


def norm(s):
    """Same as the sheet's wkNorm(): lower case, no [tags] or (tags), letters and digits only."""
    s = unicodedata.normalize('NFKD', str(s or '')).replace('’', "'")
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', s.lower())
    return re.sub(r'[^a-z0-9]', '', s)


def slug(name):
    """File name for a class. Same as the sheet's clsSlug()."""
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', str(name).lower())
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def load_pages(bundle):
    pages = {}
    for f in sorted(os.listdir(bundle)):
        if not f.endswith('.md'):
            continue
        t = open(os.path.join(bundle, f), encoding='utf8').read()
        parts = re.split(r'<!-- page: (\S+) -->', t)
        for i in range(1, len(parts), 2):
            pages.setdefault(parts[i], parts[i + 1])
            WHERE.setdefault(parts[i], f)
    return pages


WHERE = {}   # page slug -> bundle file (archetypes are the 06- files)


def page_finder(pages):
    """The same lookup as find_page() in tools/verify-classes.py."""
    titles = {}
    for s, t in pages.items():
        m = re.match(r'\s*# (.+)', t)
        if m:
            titles.setdefault(m.group(1).strip().lower(), (s, t))

    def slugs(n):
        b = re.sub(r'[^a-z0-9]+', '-', n.lower().replace(' (spheres)', '')).strip('-')
        return [b + '-class', b + '-base-class', b + '-prestige-class', b]

    def find(n):
        for s in slugs(n):
            if s in pages:
                return s, pages[s]
        b = re.sub(r'\s*\(spheres\)$', '', n.lower())
        for v in (b, re.sub(r'^(spheres|alternate|the) ', '', b), b + ' (spheres)', 'spheres ' + b):
            for t in (v, v + ' class'):
                if t in titles and re.search(r'\*\*Hit Di', (re.split(r'\n# ', titles[t][1]) + ['', ''])[1]):
                    return titles[t]
        for v in (b, re.sub(r'^(spheres|alternate|the) ', '', b)):
            for s in slugs(v):
                if s in pages:
                    return s, pages[s]
        return None, None
    return find


def first_tab(t):
    m = re.split(r'\n\*\*Tab: [^*]+\*\*\n', t)
    return m[1] if len(m) > 2 else t


def clean_md(txt):
    lines = []
    for l in txt.strip('\n').split('\n'):
        l = re.sub(r'^>\s?', '', l)
        m = re.match(r'^#{3,6}\s+(.*)$', l)
        if m:
            l = '**' + m.group(1).strip() + '**'          # sub-headings inside a feature: a bold line
        lines.append(l.rstrip())
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()


def lvl(c):
    m = re.match(r'\s*(\d+)', c or '')
    return int(m.group(1)) if m else None


def table(t):
    """The class table: (header, rows) of the first markdown table with a Level column and at least 5 level rows."""
    lines = t.split('\n')
    for i, l in enumerate(lines):
        if l.startswith('|') and re.search(r'\b(Level|Lvl)\b', l):
            hdr = [h.strip() for h in l.strip().strip('|').split('|')]
            rows = []
            for x in lines[i + 1:]:
                if not x.startswith('|'):
                    break
                if re.match(r'^\|[\s\-|:]+$', x):
                    continue
                c = [h.strip() for h in x.strip().strip('|').split('|')]
                if lvl(c[0]) is None:
                    continue
                rows.append(c)
            if len(rows) >= 5:
                return hdr, rows
    return None, None


HEAD = re.compile(r'^(#{1,6}) (.+?)\s*$', re.M)


def features(sec):
    """[[name, text, [[choice, text, group], ...]], ...] from the class features section."""
    heads = [(len(m.group(1)), m.group(2).strip(), m.start(), m.end()) for m in HEAD.finditer(sec)]
    F = 2 if any(h[0] == 2 for h in heads) else 3
    out = []
    for i, (lv, name, s, e) in enumerate(heads):
        if lv != F:
            continue
        end = next((h[2] for h in heads[i + 1:] if h[0] <= F), len(sec))
        sub = [h for h in heads[i + 1:] if h[2] < end]
        first4 = next((h[2] for h in sub if h[0] >= 4), end)
        text = clean_md(sec[e:first4])
        opts, group = [], ''
        for j, (lv2, n2, s2, e2) in enumerate(sub):
            if lv2 == 3 and F == 2:
                group = re.sub(r'\s*\[[^\]]*\]', '', n2).strip()
            if lv2 < 4:
                continue
            end2 = next((h[2] for h in sub[j + 1:] if h[0] <= 4), end)
            opts.append([n2, clean_md(sec[e2:end2]), group])
        if text or opts:
            out.append([name, text, opts])
    return out


SPLIT = re.compile(r',\s*(?![^()]*\))|;\s*')


def entry_key(x):
    """Name part of a Special entry: no trailing numbers like +2, 2/day, 1d6, (2), roman numerals or 'x2'."""
    x = re.sub(r'\[[^\]]*\]|\*', '', x).strip()
    x = re.sub(r'(\s+(\+?\d+(/[\w+]+)*|\d+d\d+|[ivx]+|x\d+|\(\d+\)))+$', '', x, flags=re.I)
    x = re.sub(r'^\+\d+\s+', '', x)                                   # "+2 void blade"
    return norm(x)


def bare(key):
    """The key without a leading improved / greater / lesser / mass / imp."""
    return re.sub(r'^(improved|greater|lesser|mass|imp|true|advanced|superior)', '', key)


def match(key, fnorm):
    """Index of the feature this table entry names, or -1."""
    if not key:
        return -1
    best, bl = -1, 0
    for i, f in enumerate(fnorm):
        k2 = [key, key.rstrip('s'), re.sub(r'ies$', 'y', key)]
        f2 = [f, f.rstrip('s'), re.sub(r'ies$', 'y', f)]
        if any(a == b for a in k2 for b in f2):
            return i
        # "tensiontechniques" vs feature "tensiontechniquesex" or "greaterbond" vs "bond": longest prefix wins
        for a in k2:
            for b in f2:
                if len(b) >= 4 and (a.startswith(b) or b.startswith(a)) and min(len(a), len(b)) > bl:
                    best, bl = i, min(len(a), len(b))
    return best if bl >= 5 else -1


REP = re.compile(r'\b(?:This|These|which|it)\s+(?:\w+\s+){0,3}?(replaces?|modif(?:y|ies)|alters?|changes?)\s+([^.\n]{2,200})(?:\.|\n|$)', re.I)   # some pages leave off the full stop
LVL = re.compile(r'\b(?:At|Starting at|Beginning at|Upon reaching|at)\s+(\d+)(?:st|nd|rd|th)\s+level', re.I)


def rep_parts(obj):
    """'drill knuckle, uncanny dodge, and the bonus feat gained at 8th level' -> [(norm name, level or 0), ...]"""
    obj = obj.split('\n')[0]
    out = []
    for p in re.split(r',\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+', obj):
        m = re.search(r'(?:gained |granted )?at (\d+)\w* level', p, re.I) or re.match(r'\s*(?:the\s+)?(\d+)(?:st|nd|rd|th)[- ]level\s+', p, re.I)
        lv = int(m.group(1)) if m else 0
        p = re.sub(r'^\s*(?:the\s+)?\d+(?:st|nd|rd|th)[- ]level\s+', '', p, flags=re.I)
        p = re.sub(r'\s+(?:gained |granted )?at \d+\w* level.*', '', p.strip(), flags=re.I)
        p = re.sub(r"^(?:the\s+)?(?:standard\s+|casting\s+|martial\s+)?(?:[\w-]+(?:'s|’s)\s+)?", '', p, flags=re.I)
        k = re.sub(r'(classfeatures?|abilit(?:y|ies)|features?|improvements?)$', '', norm(p))
        if len(k) >= 3:
            out.append((k, lv))
    return out


def feat_index(k, fnorm):
    for i, f in enumerate(fnorm):
        if k == f or k.rstrip('s') == f.rstrip('s'):
            return i
    best, bl = -1, 0
    for i, f in enumerate(fnorm):
        if len(f) >= 5 and (k.startswith(f) or f.startswith(k)) and len(f) > bl:
            best, bl = i, len(f)
    return best


def arch_features(body):
    """[[name, text, level, replaces text], ...]: the page's headings, or (pages without any) its bold-lead paragraphs."""
    heads = [(len(m.group(1)), m.group(2).strip(), m.start(), m.end()) for m in HEAD.finditer(body) if len(m.group(1)) >= 2]
    out = []
    if heads:
        top = min(h[0] for h in heads)
        hs = [h for h in heads if h[0] == top]
        for i, (lv, name, s, e) in enumerate(hs):
            end = hs[i + 1][2] if i + 1 < len(hs) else len(body)
            out.append([name, body[e:end]])
    else:
        bl = list(re.finditer(r'^\*\*([^*\n]{2,80}?)(?::\*\*|\*\*\s*:)', body, re.M))
        for i, m in enumerate(bl):
            end = bl[i + 1].start() if i + 1 < len(bl) else len(body)
            out.append([m.group(1).strip().rstrip(':'), body[m.end():end]])
    res = []
    for name, txt in out:
        txt = re.split(r'\n#\s', txt)[0]
        lv = LVL.search(txt)
        rtext = '\n'.join(m.group(0).strip() for m in REP.finditer(txt))   # one per line: they are read again, and some lack a full stop
        res.append([cname(name), clean_md(txt), int(lv.group(1)) if lv else 0, rtext])   # 0: no level in the text (set below)
    return [r for r in res if r[1] or r[3]]


# skill names -> the sheet's skill ids (the same maps as tools/verify-classes.py)
SK = {'acrobatics': 'acro', 'appraise': 'appr', 'bluff': 'bluff', 'climb': 'climb', 'craft': 'craft', 'diplomacy': 'diplo', 'disable device': 'disable',
      'disguise': 'disguise', 'escape artist': 'escape', 'fly': 'fly', 'handle animal': 'handle', 'heal': 'heal', 'intimidate': 'intim',
      'linguistics': 'ling', 'perception': 'perc', 'perform': 'perform', 'profession': 'prof', 'ride': 'ride', 'sense motive': 'sense',
      'sleight of hand': 'sleight', 'spellcraft': 'spell', 'stealth': 'stealth', 'survival': 'surv', 'swim': 'swim', 'use magic device': 'umd',
      'artistry': 'art', 'lore': 'lore'}
KN = {'arcana': 'karc', 'dungeoneering': 'kdun', 'engineering': 'keng', 'geography': 'kgeo', 'history': 'khis', 'local': 'kloc', 'nature': 'knat',
      'nobility': 'knob', 'planes': 'kpla', 'religion': 'krel'}


def skill_ids(s):
    """Skill ids named in a piece of text: Knowledge (x) groups first, then the other skills in what is left."""
    s = s.lower()
    out = []
    for m in re.finditer(r'knowledge\s*\(([^)]*)\)', s):
        g = m.group(1)
        if re.search(r'\ball\b', g):
            ex = g.split('except')[-1] if 'except' in g else ''
            out += [v for k, v in KN.items() if k not in ex]
        else:
            out += [v for k, v in KN.items() if k in g]
    rest = re.sub(r'knowledge\s*\([^)]*\)', ' ', s)
    for k, v in sorted(SK.items(), key=lambda kv: -len(kv[0])):
        if re.search(r'\b' + k + r'\b', rest):
            out.append(v)
            rest = re.sub(r'\b' + k + r'\b', ' ', rest)
    return list(dict.fromkeys(out))


BABN = {'full': 'full', '3/4': '3/4', '1/2': '1/2'}


def arch_stats(feats, L, base=None):
    """What an archetype changes in the class's numbers (2026-11-12, owner): from its features named after the stat ("Saving
    Throws", "Base Attack Bonus", "Hit Die(s)", "Skill Ranks per Level", "Class Skills", "Trade Tradition") and inline
    "**Class Skills:**"-style lines. {g: good saves, bab, hd, sk: ranks per level, ca/cr: class skills added/removed,
    cs: the whole class skill list, trade: 1 when a trade tradition replaces the class skills, chk: stat lines not understood}."""
    st, chk = {}, []
    byn = {norm(e['n']): e for e in L}

    def part(name, txt):
        n = name.lower().strip()
        t = re.sub(r'\s+', ' ', txt)
        if re.match(r'saving throws?$', n):
            m = re.search(r'\bgood ((?:Fortitude|Reflex|Will)(?:,? (?:and )?(?:Fortitude|Reflex|Will))*) sav', t, re.I)
            like = re.search(r'((?:Fortitude|Reflex|Will)(?:,? (?:and )?(?:Fortitude|Reflex|Will))*) save progressions? equal to an? ([A-Za-z]+)', t, re.I)
            sv = lambda x: [{'fortitude': 'fort', 'reflex': 'ref', 'will': 'will'}[w.lower()] for w in re.findall(r'Fortitude|Reflex|Will', x)]
            if re.search(r'\ball good saving throws\b|\ball good saves\b', t, re.I):
                st['g'] = ['fort', 'ref', 'will']
            elif m:
                st['g'] = sv(m.group(1))
            elif like and base and (byn.get(norm(like.group(2))) or {}).get('good') is not None:
                # "Fortitude and Will save progressions equal to an armorist": those saves as that class has them, the other as before
                named, other = sv(like.group(1)), byn[norm(like.group(2))]['good']
                st['g'] = [x for x in ('fort', 'ref', 'will') if (x in other if x in named else x in base.get('good', []))]
            else:
                chk.append(name + ': ' + t[:160])
        elif re.match(r'base attack', n):
            m = re.search(r'equal to an? ([A-Za-z]+) of (?:his|her|their|its) class level', t, re.I)
            if re.search(r'equal to (?:their|his|her|its) (?:class|[a-z]+) level\b|equal to their class level', t, re.I) and not re.search(r'½|1/2|half|¾|3/4', t):
                st['bab'] = 'full'
            elif re.search(r'¾|3/4', t):
                st['bab'] = '3/4'
            elif re.search(r'½|1/2|half', t):
                st['bab'] = '1/2'
            elif m and (byn.get(norm(m.group(1))) or {}).get('bab'):
                st['bab'] = byn[norm(m.group(1))]['bab']
            elif m and m.group(1).lower() in ('fighter', 'paladin', 'ranger', 'barbarian'):
                st['bab'] = 'full'
            else:
                chk.append(name + ': ' + t[:160])
        elif re.match(r'hit di', n):
            m = re.search(r'\bd(4|6|8|10|12)s?\b', t)
            if m:
                st['hd'] = int(m.group(1))
            else:
                chk.append(name + ': ' + t[:160])
        elif re.match(r'skill ranks', n):
            m = re.search(r'(\d+) \+ (?:his |her |their )?Int', t)
            if m:
                st['sk'] = int(m.group(1))
            else:
                chk.append(name + ': ' + t[:160])
        elif re.match(r'class skills?$', n):
            t1 = re.split(r'\*\*', t)[0]
            full = re.search(r"class skills (?:\(and the key ability for each\) )?are (.*?)(?:\.\s|$)", t1, re.I)
            if full:
                st['cs'] = skill_ids(full.group(1))
            else:
                ca, cr = [], []
                verbs = list(re.finditer(r'\b(gains?|adds?|loses?|removes?|does not gain|do not gain|instead of|in place of)\b', t1, re.I))
                for i, v in enumerate(verbs):
                    seg = t1[v.end():verbs[i + 1].start() if i + 1 < len(verbs) else len(t1)]
                    seg = re.split(r'\bin addition to\b', seg, flags=re.I)[0]
                    ids = skill_ids(seg)
                    (ca if re.match(r'gain|add', v.group(1), re.I) else cr).extend(ids)
                if ca or cr:
                    st['ca'] = list(dict.fromkeys(st.get('ca', []) + ca))
                    st['cr'] = list(dict.fromkeys(st.get('cr', []) + [x for x in cr if x not in ca]))
                elif not re.search(r'\b(alters?|modif\w+)\b', t1, re.I) or len(t1) > 40:
                    chk.append(name + ': ' + t[:160])
        elif re.match(r'trade tradition', n) and re.search(r"replaces? (?:the [\w’' -]+?)?normal class skills|replaces? (?:its|his|her|their) class skills", t, re.I):
            st['trade'] = 1

    for f in feats:
        part(f[0], f[1])
        # skill ranks stated inside another feature: "gains 4 + Int modifier skills per level", "skill ranks at each level equal to 6 + ..."
        if 'sk' not in st:
            t2 = re.sub(r'\s+', ' ', f[1])
            m = (re.search(r'skill ranks (?:at each level |per level )?equal to (\d+) \+ (?:his |her |their )?Int', t2, re.I) or
                 re.search(r'gains (\d+) \+ (?:his |her |their )?Int(?:elligence)?(?: modifier)?(?: skill ranks| skills| ranks)? (?:at each|per|each) level', t2, re.I))
            if m:
                st['sk'] = int(m.group(1))
    # inline "**Class Skills:** ..." lines inside another feature count only for a stat the page's own features don't set
    # (Darkshaper has its own "Class Skills" feature and a different inline list for a variant)
    keys = {'class skills': ('ca', 'cr', 'cs'), 'saving throws': ('g',), 'hit di': ('hd',), 'base attack': ('bab',), 'skill ranks': ('sk',)}
    for f in feats:
        for m in re.finditer(r'\*\*(Class Skills|Saving Throws|Skill Ranks (?:per|at Each) Level|Hit Dice?|Base Attack Bonus)\s*:\*\*\s*([^\n]+)', f[1], re.I):
            ks = next(v for k, v in keys.items() if m.group(1).lower().startswith(k))
            if not any(k in st for k in ks):
                part(m.group(1), m.group(2))
    if chk:
        st['chk'] = chk
    return st


def first_level(d, fi):
    """The first class level whose table entry names base feature fi (0 if the table never does)."""
    for k in sorted(d.get('lv', {}), key=int):
        if any(e[1] == fi for e in d['lv'][k]):
            return int(k)
    return 0


def cname(s):
    return re.sub(r'\s*\[[^\]]*\]', '', s).strip()


def archetypes(pages, L, files, report):
    """Archetypes for the Spheres classes with a file, plus the "Sphere X" conversions of other classes (a file of their own,
    with no base features: pz). Each: [name, page, [[feature, text, level, [[base feature index, level or 0, r/m]...], replaces text]...]].

    Where they come from (2026-11-12, owner found Bravo had 1 of its 9): first the class page's own "# Archetypes" list
    (its "## Name [book]" entries), each found by its page wherever the bundle keeps it (06- archetype files or the 14-
    "other" files); then archetype pages titled "(X Archetype)"; then, for classes without such a list, untitled 06- pages
    whose "This replaces ..." lines name that class's features. Genius and Wunderkind are archetypes the wiki presents as
    whole classes (class pages with their own table), so they are not read as archetypes here."""
    byname = {norm(e['n']): e for e in L}
    fnorms = {sl: [norm(f[0]) for f in d['f']] for sl, d in files.items()}
    sph = {norm(d['n'].replace(' (Spheres)', '')): sl for sl, d in files.items()}
    titles = {}
    for ps, t in pages.items():
        tm = re.match(r'\s*# (.+)', t)
        if tm:
            tt = re.sub(r'\s*\([^()]*Archetype\)\s*$', '', cname(tm.group(1)), flags=re.I)
            titles.setdefault(norm(tt), []).append(ps)
    seen, listed = set(), set()

    def add(sl, title, ps, body):
        if (sl, norm(title)) in seen:
            return True
        fs = arch_features(body)
        if not fs:
            return False
        seen.add((sl, norm(title)))
        fn, out = fnorms[sl], []
        for f in fs:
            reps = []
            for r in REP.finditer(f[3] or ''):
                how = 'r' if r.group(1).lower().startswith('replac') else 'm'
                for k, lv in rep_parts(r.group(2)):
                    i = feat_index(k, fn)
                    if i >= 0 and not any(x[0] == i and x[1] == lv for x in reps):
                        reps.append([i, lv, how])
            lvl = f[2]
            if not lvl:
                # no "at Nth level": the level of what it replaces or alters (its first level in the class table), else 1
                firsts = [r[1] or first_level(files[sl], r[0]) for r in reps]
                firsts = [x for x in firsts if x]
                lvl = min(firsts) if firsts else 1
            out.append([f[0], f[1], lvl, reps, f[3]])
        files[sl]['a'].append([title, ps, out, arch_stats(fs, L, byname.get(norm(files[sl]['n'])) or byname.get(norm(files[sl]['n'] + ' (Spheres)')))])
        return True

    def body_of(t):
        tm = re.match(r'\s*# (.+)', t)
        return first_tab(t[tm.end():] if tm else t)

    # 1. the class page's own list
    for sl, d in list(files.items()):
        if d.get('pz') or not d.get('p') or d['p'] not in pages:
            continue
        m = re.search(r'\n# Archetypes\s*\n(.*?)(?=\n# |\Z)', pages[d['p']], re.S)
        if not m:
            continue
        listed.add(sl)
        for nm in re.findall(r'^## (.+)$', m.group(1), re.M):
            nm = cname(nm).lstrip('-').strip()         # "-Bearon": a sub-entry of the list, still an archetype
            if re.match(r'old\s', nm, re.I) or re.match(r'favou?red class', nm, re.I):
                continue                                  # superseded versions; a stray section heading
            cands = [c for c in [slug(nm), slug(nm) + '-archetype'] if c in pages] + titles.get(norm(nm), [])
            # an archetype page can sit in the class files too (Famine Spirit); a class page never counts
            cands = [c for c in dict.fromkeys(cands) if not (WHERE.get(c, '').startswith('05-') and re.search(r'\*\*Hit Di', pages[c][:6000]))]
            # prefer the page that names this class, then an archetype file
            cands.sort(key=lambda c: (not re.search(r'\b' + re.escape(d['n'].replace(' (Spheres)', '').lower()), pages[c].lower()), not WHERE.get(c, '').startswith('06-')))
            if not cands or not add(sl, nm, cands[0], body_of(pages[cands[0]])):
                report.append('archetype listed but its page not found: %s / %s' % (d['n'], nm))

    # 2. archetype pages with the class in the title, and the sphere conversions; 3. untitled ones by what they replace
    for ps, t in pages.items():
        if not WHERE.get(ps, '').startswith('06-'):
            continue
        tm = re.match(r'\s*# (.+)', t)
        title = cname(tm.group(1)) if tm else ps
        body = body_of(t)
        bases = []
        m = re.search(r'\(([^()]+?)\s+Archetype\)\s*$', title, re.I)
        cm = re.match(r'Spheres? (.+?)(?:\s*\(.*)?$', title)
        if m:
            bases = [b.strip() for b in re.split(r'/|\band\b', m.group(1).replace('U. ', '').replace('Unchained ', ''))]
            title = title[:m.start()].strip()
        if cm and not m:
            bases = [cm.group(1).strip()]
        if cm:
            for b in bases:
                e = byname.get(norm(b)) or byname.get(norm(b + ' (Unchained)'))
                if not e:
                    continue
                sl = slug(e['n'])
                if sl not in files:
                    files[sl] = {'v': V, 'n': re.sub(r'\s*\(Unchained\)', '', e['n']), 'p': '', 'f': [], 'lv': {}, 'a': [], 'pz': 1}
                    fnorms[sl] = []
                fs = arch_features(body)
                if fs and (sl, norm(title)) not in seen:
                    seen.add((sl, norm(title)))
                    files[sl]['a'].append([title, ps, [[f[0], f[1], f[2] or 1, [], f[3]] for f in fs], arch_stats(fs, L, e)])
            continue
        cands = [sph[norm(b)] for b in bases if norm(b) in sph]
        if not bases:
            fs = arch_features(body)
            votes = {}
            for f in fs:
                for r in REP.finditer(f[3] or ''):
                    for k, lv in rep_parts(r.group(2)):
                        for sl, fn in fnorms.items():
                            if sl not in listed and k in fn:
                                votes[sl] = votes.get(sl, 0) + 1
            if votes:
                best = max(votes, key=votes.get)
                if votes[best] >= 2 or re.search(r'\b' + re.escape(files[best]['n'].lower()), body.lower()):
                    cands = [best]
        for sl in cands:
            add(sl, title, ps, body)
    for sl, d in files.items():
        d['a'].sort(key=lambda a: a[0].lower())


def build(bundle, outdir):
    html = open(os.path.join(HERE, '..', 'public', 'index.html'), encoding='utf8').read()
    L = json.loads(re.search(r'id="classLib">(.*?)</script>', html).group(1))
    pages = load_pages(bundle)
    # pages the bundle doesn't have yet, saved from the live wiki in the bundle's own format (tools/wiki-extra/<slug>.md)
    extra = os.path.join(HERE, 'wiki-extra')
    if os.path.isdir(extra):
        for f in sorted(os.listdir(extra)):
            if f.endswith('.md'):
                parts = re.split(r'<!-- page: (\S+) -->', open(os.path.join(extra, f), encoding='utf8').read())
                for i in range(1, len(parts), 2):
                    if parts[i] not in pages:
                        pages[parts[i]] = parts[i + 1]
                        WHERE[parts[i]] = 'wiki-extra/' + f
    find = page_finder(pages)

    os.makedirs(outdir, exist_ok=True)
    old = [f for f in os.listdir(outdir) if f.endswith('.json')]
    if old:
        try:
            with open(os.path.join(outdir, 'index.json'), encoding='utf8') as fh:
                ours = isinstance(json.load(fh).get('classes'), dict)
        except (OSError, ValueError, AttributeError):
            ours = False
        if not ours:
            sys.exit('%s has .json files but no classes index.json: not clearing it. Give an empty folder or the classes folder.' % outdir)
        for f in old:
            os.remove(os.path.join(outdir, f))

    index = {'v': V, 'classes': {}}
    files = {}
    report, total, gz = [], 0, 0
    for e in L:
        if e.get('c') != 'Spheres':
            continue
        ps, p = find(e['n'])
        if not p:
            report.append('no page: ' + e['n'])
            continue
        t = first_tab(p)
        m = re.search(r'\n# Class (?:Features|Abilities)\s*\n', t)
        if not m:
            report.append('no "Class Features" section: ' + e['n'])
            continue
        rest = t[m.end():]
        nx = re.search(r'\n# ', rest)
        sec = rest[:nx.start()] if nx else rest
        F = features(sec)
        if not F:
            report.append('no features: ' + e['n'])
            continue
        fn = [norm(f[0]) for f in F]
        lv = {}
        hdr, rows = table(t)
        sp = None if not hdr else next((j for j, h in enumerate(hdr) if re.search('special', h, re.I)), None)
        miss = []
        if sp is None:
            report.append('no Special column: ' + e['n'])
        else:
            for r in rows:
                n = lvl(r[0])
                cell = r[sp] if sp < len(r) else ''
                ents = [x.strip() for x in SPLIT.split(cell) if x.strip() and x.strip() not in ('—', '-', '–')]
                got = []
                for x in ents:
                    k = entry_key(x)
                    i = match(k, fn)
                    if i < 0 and bare(k) != k:
                        i = match(bare(k), fn)
                    row = [re.sub(r'\s*\[[^\]]*\]', '', x).strip(), i]
                    if i < 0:
                        # a choice from a feature's list ("harsh words" under Words): [entry, feature, choice]
                        for fi, f in enumerate(F):
                            oi = match(k, [norm(o[0]) for o in f[2]]) if f[2] else -1
                            if oi >= 0:
                                row, i = [row[0], fi, oi], fi
                                break
                    got.append(row)
                    if i < 0 and not re.match(r'bonus (talent|feat)', x, re.I):
                        miss.append(x)
                if got and n and 1 <= n <= 20:
                    lv[str(n)] = got
        if miss:
            report.append('unmatched table entries, %s: %s' % (e['n'], ', '.join(sorted(set(miss)))))
        files[slug(e['n'])] = {'v': V, 'n': e['n'], 'p': ps, 'f': F, 'lv': lv, 'a': []}

    archetypes(pages, L, files, report)
    for sl, data in files.items():
        raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf8')
        with open(os.path.join(outdir, sl + '.json'), 'wb') as fh:
            fh.write(raw)
        total += len(raw)
        gz += len(gzip.compress(raw, 9))
        index['classes'][sl] = {'n': data['n'], 'p': data['p'], 'c': len(data['f']), 'o': sum(len(f[2]) for f in data['f']), 'a': len(data['a'])}
        if data.get('pz'):
            index['classes'][sl]['pz'] = 1
    raw = json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    with open(os.path.join(outdir, 'index.json'), 'wb') as fh:
        fh.write(raw)
    print('classes: %d   features: %d   choices: %d' % (len(index['classes']), sum(c['c'] for c in index['classes'].values()),
                                                       sum(c['o'] for c in index['classes'].values())))
    print('archetypes: %d (%d Paizo classes with sphere conversions)' % (sum(c['a'] for c in index['classes'].values()), sum(1 for c in index['classes'].values() if c.get('pz'))))
    print('files: %d KB (%d KB gzipped)' % (total // 1024, gz // 1024))
    for r in report:
        print('check: ' + r)
    return index


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'public', 'classes')
    build(sys.argv[1], out)
