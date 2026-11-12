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
its text (1 if none); "This ability replaces X, Y and Z." names the base features it removes (matched by name; the full
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


REP = re.compile(r'\b(?:This|These|which|it)\s+(?:\w+\s+){0,3}?(replaces?|modif(?:y|ies)|alters?|changes?)\s+([^.]{2,200})\.', re.I)
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
        rtext = ' '.join(m.group(0).strip() for m in REP.finditer(txt))
        res.append([cname(name), clean_md(txt), int(lv.group(1)) if lv else 1, rtext])
    return [r for r in res if r[1] or r[3]]


def cname(s):
    return re.sub(r'\s*\[[^\]]*\]', '', s).strip()


def archetypes(pages, L, files, report):
    """Archetypes for the Spheres classes with a file, plus the "Sphere X" conversions of other classes (a file of their own,
    with no base features: pz). Each: [name, page, [[feature, text, level, [[replaced feature index, level or 0]...], replaces text]...]]."""
    byname = {norm(e['n']): e for e in L}
    fnorms = {sl: [norm(f[0]) for f in d['f']] for sl, d in files.items()}
    sph = {norm(d['n'].replace(' (Spheres)', '')): sl for sl, d in files.items()}
    seen = set()
    for ps, t in pages.items():
        if not WHERE.get(ps, '').startswith('06-'):
            continue
        tm = re.match(r'\s*# (.+)', t)
        title = cname(tm.group(1)) if tm else ps
        body = first_tab(t[tm.end():] if tm else t)
        bases = []
        m = re.search(r'\(([^()]+?)\s+Archetype\)\s*$', title, re.I)
        cm = re.match(r'Spheres? (.+?)(?:\s*\(.*)?$', title)
        if m:
            bases = [b.strip() for b in re.split(r'/|\band\b', m.group(1).replace('U. ', '').replace('Unchained ', ''))]
            title = title[:m.start()].strip()
        if cm and not m:
            bases = [cm.group(1).strip()]
        if cm:
            # a sphere conversion of a Paizo (or other) class: kept for any class in the class list
            for b in bases:
                e = byname.get(norm(b)) or byname.get(norm(b + ' (Unchained)'))
                if not e:
                    continue
                sl = slug(e['n'])
                if sl not in files:
                    files[sl] = {'v': V, 'n': re.sub(r'\s*\(Unchained\)', '', e['n']), 'p': '', 'f': [], 'lv': {}, 'a': [], 'pz': 1}
                fs = arch_features(body)
                if fs and (sl, title) not in seen:
                    seen.add((sl, title))
                    files[sl]['a'].append([title, ps, [[f[0], f[1], f[2], [], f[3]] for f in fs]])
            continue
        fs = arch_features(body)
        if not fs:
            continue
        cands = [sph[norm(b)] for b in bases if norm(b) in sph]
        if not bases:
            # no class in the title: the Spheres class whose features it replaces (at least two names, or one and the class named)
            votes = {}
            for f in fs:
                for r in REP.finditer(f[3] or ''):
                    for k, lv in rep_parts(r.group(2)):
                        for sl, fn in fnorms.items():
                            if feat_index(k, fn) >= 0 and k in fn:
                                votes[sl] = votes.get(sl, 0) + 1
            if votes:
                best = max(votes, key=votes.get)
                if votes[best] >= 2 or re.search(r'\b' + re.escape(files[best]['n'].lower()), body.lower()):
                    cands = [best]
        for sl in cands:
            if (sl, title) in seen:
                continue
            seen.add((sl, title))
            fn, out, miss = fnorms[sl], [], []
            for f in fs:
                reps = []
                for r in REP.finditer(f[3] or ''):
                    how = 'r' if r.group(1).lower().startswith('replac') else 'm'
                    for k, lv in rep_parts(r.group(2)):
                        i = feat_index(k, fn)
                        if i >= 0 and not any(x[0] == i and x[1] == lv for x in reps):
                            reps.append([i, lv, how])
                        elif i < 0:
                            miss.append(k)
                out.append([f[0], f[1], f[2], reps, f[3]])
            files[sl]['a'].append([title, ps, out])
    for sl, d in files.items():
        d['a'].sort(key=lambda a: a[0].lower())


def build(bundle, outdir):
    html = open(os.path.join(HERE, '..', 'public', 'index.html'), encoding='utf8').read()
    L = json.loads(re.search(r'id="classLib">(.*?)</script>', html).group(1))
    pages = load_pages(bundle)
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
