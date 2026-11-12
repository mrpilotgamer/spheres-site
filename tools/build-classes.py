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
   "lv": {"1": [[table entry, index into f or -1, (index of the choice it names)], ...], ...}}
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
    return pages


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
        sl = slug(e['n'])
        data = {'v': V, 'n': e['n'], 'p': ps, 'f': F, 'lv': lv}
        raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf8')
        with open(os.path.join(outdir, sl + '.json'), 'wb') as fh:
            fh.write(raw)
        total += len(raw)
        gz += len(gzip.compress(raw, 9))
        index['classes'][sl] = {'n': e['n'], 'p': ps, 'c': len(F), 'o': sum(len(f[2]) for f in F)}
    raw = json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    with open(os.path.join(outdir, 'index.json'), 'wb') as fh:
        fh.write(raw)
    print('classes: %d   features: %d   choices: %d' % (len(index['classes']), sum(c['c'] for c in index['classes'].values()),
                                                       sum(c['o'] for c in index['classes'].values())))
    print('files: %d KB (%d KB gzipped)' % (total // 1024, gz // 1024))
    for r in report:
        print('check: ' + r)
    return index


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'public', 'classes')
    build(sys.argv[1], out)
