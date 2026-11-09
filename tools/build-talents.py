#!/usr/bin/env python3
"""Build the talent description files the sheet loads on demand.

Reads the offline wiki bundle (SoP-Claude-Bundles) and writes, into public/talents/:
  <sphere>.json   one per sphere: every talent's heading, section and wiki text (markdown)
  drawbacks.json  casting/martial/tinker/... tradition drawbacks and boons
  index.json      every talent name with its sphere (for search and for picks whose sphere is wrong)

Run it again only when the wiki bundle changes:
  python3 tools/build-talents.py <path to SoP-Claude-Bundles folder>

Rules (agreed 2026-11-06):
  - Sphere pages from 02 (magic), 03 (combat), 04 (skill), plus the Equipment sphere page in 09.
  - Ultimate text only: a page's first "**Tab: ...**" part is kept, the rest (Original, ...) is dropped.
  - Many pages repeat an older copy further down without a tab marker. The first copy of a talent wins, and a page
    stops at the first "... Talents" heading that repeats an earlier one, or at any heading that starts with "Old ".
  - A talent is a level-4 heading (####) under a level 1-3 heading whose name has "Talents" in it
    (but not "Talent Types"). Its text runs to the next heading of level 1-4.
"""
import json, os, re, sys, gzip, unicodedata
from collections import OrderedDict

WIKI = 'http://spheresofpower.wikidot.com/'
V = 1


def norm(s):
    """Same as the sheet's wkNorm(): lower case, no [tags] or (tags), letters and digits only."""
    s = unicodedata.normalize('NFKD', str(s or '')).replace('’', "'")
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', s.lower())
    return re.sub(r'[^a-z0-9]', '', s)


def slug(sphere):
    """File name for a sphere. Same as the sheet's wkSlug()."""
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', str(sphere).lower())
    s = re.sub(r'\bsphere\b', ' ', s)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def pages(path):
    t = open(path, encoding='utf8').read()
    for chunk in t.split('<!-- page: ')[1:]:
        pslug, _, rest = chunk.partition(' -->\n')
        title, _, body = rest.partition('\n')
        yield pslug.strip(), title[2:].strip(), body


def first_tab(body):
    """Keep only the first **Tab: X** part of a page (the Ultimate text)."""
    marks = [m.start() for m in re.finditer(r'^\*\*Tab: [^*]+\*\*\s*$', body, re.M)]
    return body[:marks[1]] if len(marks) > 1 else body


def clean_md(txt):
    lines = []
    for l in txt.strip('\n').split('\n'):
        l = re.sub(r'^>\s?', '', l)                       # quoted blocks: plain text
        m = re.match(r'^#{5,6}\s+(.*)$', l)
        if m:
            l = '**' + m.group(1).strip() + '**'          # sub-headings inside a talent: bold line
        lines.append(l.rstrip())
    t = '\n'.join(lines)
    t = re.sub(r'\n{3,}', '\n\n', t).strip()
    return t


HEAD = re.compile(r'^(#{1,6}) (.+?)\s*$', re.M)


def entries(body, is_section, skip_old=True):
    """Yield (section, heading, markdown, sphere) for talents in matching sections, first copy only.

    Headings form a tree. A section matches when it, or a heading above it, passes is_section(). Inside a
    matching section, every leaf heading of level 4 or less (one with no sub-heading of level 4 or less before
    the next heading at its own level or above) is one entry; deeper headings (#####) are part of its text.
    The page stops when a section that already held entries comes again at the same heading level or higher
    (the old copy of the page).
    """
    out, seen_sec, seen = [], {}, set()   # seen_sec: sections that held entries -> their heading level
    heads = [m for m in HEAD.finditer(body) if len(m.group(1)) <= 4]
    stack = []                      # [(level, plain heading, matches)]
    for i, m in enumerate(heads):
        lvl, h = len(m.group(1)), m.group(2).strip().replace('**', '').strip()
        plain = re.sub(r'\[[^\]]*\]', '', h).strip()
        while stack and stack[-1][0] >= lvl:
            stack.pop()
        nxt = heads[i + 1] if i + 1 < len(heads) else None
        leaf = not nxt or len(nxt.group(1)) <= lvl
        inside = [s for s in stack if s[2]]
        old = any(re.match(r'^-?old\b', s[1], re.I) for s in stack) or re.match(r'^-?old\b', plain, re.I)
        if skip_old and old:
            stack.append((lvl, plain, False))
            continue
        if is_section(plain) and not (leaf and inside):
            k = norm(plain)
            if k in seen_sec and not inside and lvl <= seen_sec[k]:
                break                                       # the old copy of the page starts here
            stack.append((lvl, plain, True))
            continue
        if inside and leaf:
            end = nxt.start() if nxt else len(body)
            n = norm(h)
            if n and n not in seen:
                seen.add(n)
                sec = inside[-1][1]
                for s in inside:
                    seen_sec.setdefault(norm(s[1]), s[0])
                sub = [s[1] for s in stack if not s[2] and s[0] > inside[-1][0]]
                out.append((sec, h, clean_md(body[m.end():end]), sub[-1] if sub else ''))
            continue
        stack.append((lvl, plain, False))
    return out


def split_spheres(name, k, pslug, body):
    """A page can hold other spheres under '# <Name> Sphere' (Origins holds Aptitude, Essence and Form).
    Those parts become their own spheres; on Origins the general part before them is only an explainer."""
    cuts = [m for m in re.finditer(r'^# (\w+) Sphere\s*$', body, re.M) if m.group(1).lower() != name.lower()]
    if not cuts:
        return [(name, k, body)]
    out = [] if pslug == 'origins' else [(name, k, body[:cuts[0].start()])]
    for i, m in enumerate(cuts):
        end = cuts[i + 1].start() if i + 1 < len(cuts) else len(body)
        out.append((m.group(1), 'origin' if pslug == 'origins' else k, body[m.start():end]))
    return out


def talent_section(name):
    return bool(re.search(r'talents?\b', name, re.I)) and not re.search(r'talents? types?', name, re.I) \
        and not re.search(r'\bfeats?\b', name, re.I)


def drawback_section(name):
    return bool(re.search(r'drawbacks?|boons?', name, re.I)) and not re.search(r'low technology|balancing', name, re.I)


def kind_of(section):
    s = section.lower()
    return 'legendary' if 'legendary' in s else 'advanced' if 'advanced' in s else 'exceptional' if 'exceptional' in s else ''


def name_of(heading):
    return re.sub(r'\s+', ' ', re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', heading)).strip()


def build(bundle, outdir):
    files = sorted(os.listdir(bundle))
    pick = lambda pre: [os.path.join(bundle, f) for f in files if f.startswith(pre) and f.endswith('.md')]
    kinds = {'02-': 'magic', '03-': 'combat', '04-': 'skill'}
    spheres = OrderedDict()   # slug -> {n, k, page, t: [...], seen}
    clashes = []
    for pre, k in kinds.items():
        for path in pick(pre):
            for pslug, title, body in pages(path):
                name = re.sub(r'\s*\[[^\]]*\]', '', title).strip()
                name = re.sub(r'\s+\d+$', '', name)         # "Nature 2" is the second half of Nature
                if name.lower() in ('tinker packages',):
                    continue
                for name, kk, part in split_spheres(name, k, pslug, first_tab(body)):
                    sl = slug(name)
                    S = spheres.setdefault(sl, {'n': name, 'k': kk, 'page': pslug, 't': [], 'seen': set()})
                    if S['n'] != name:      # two different spheres whose names make the same file name
                        clashes.append('%s and %s both become %s.json' % (S['n'], name, sl))
                    for sec, h, md, _g in entries(part, talent_section):
                        if norm(h) in S['seen']:
                            continue
                        S['seen'].add(norm(h))
                        S['t'].append([name_of(h), h, sec, kind_of(sec), md, pslug])
    # Equipment sphere talents live in the items bundle
    for path in pick('09-'):
        for pslug, title, body in pages(path):
            if pslug == 'equipment-sphere':
                S = spheres.setdefault('equipment', {'n': 'Equipment', 'k': 'combat', 'page': 'equipment', 't': [], 'seen': set()})
                for sec, h, md, _g in entries(body, talent_section):
                    if norm(h) not in S['seen']:
                        S['seen'].add(norm(h))
                        S['t'].append([name_of(h), h, sec, kind_of(sec), md, pslug])
    # drawbacks and boons; sphere-specific ones sit under "### <Sphere>" in a "Sphere-Specific Drawbacks" section
    dbs, dseen = [], set()
    for path in pick('08-'):
        for pslug, title, body in pages(path):
            for sec, h, md, grp in entries(body, drawback_section):
                key = (norm(h), norm(grp) if re.search(r'sphere-specific', sec, re.I) else '', 'boon' if re.search(r'boon', sec, re.I) else '')
                if key in dseen:
                    continue
                dseen.add(key)
                sph = grp if re.search(r'sphere-specific', sec, re.I) and grp.lower() != 'universal' else ''
                where = sec if pslug.startswith('casting-traditions') else title + ' · ' + sec
                dbs.append([name_of(h), h, where, md, pslug, re.sub(r'\s*\[[^\]]*\]', '', sph).strip()])

    os.makedirs(outdir, exist_ok=True)
    # only clear a folder this script made (it holds our index.json), so a wrong path can't wipe someone else's files
    old = [f for f in os.listdir(outdir) if f.endswith('.json')]
    if old:
        try:
            with open(os.path.join(outdir, 'index.json'), encoding='utf8') as fh:
                ours = isinstance(json.load(fh).get('spheres'), dict)
        except (OSError, ValueError, AttributeError):
            ours = False
        if not ours:
            sys.exit('%s has .json files but no talents index.json: not clearing it. Give an empty folder or the talents folder.' % outdir)
        for f in old:
            os.remove(os.path.join(outdir, f))
    index = {'v': V, 'spheres': {}, 'names': []}
    total_raw = total_gz = 0
    report = []
    for sl, S in sorted(spheres.items()):
        if not S['t']:
            if sl not in ('warleader',):            # Warleader is a class page with no talents
                report.append('no talents: ' + S['n'])
            continue
        data = {'v': V, 'n': S['n'], 'k': S['k'], 'url': WIKI + S['page'],
                'cols': ['name', 'heading', 'section', 'kind', 'md', 'page'], 't': S['t']}
        raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf8')
        write(os.path.join(outdir, sl + '.json'), raw)
        total_raw += len(raw); total_gz += len(gzip.compress(raw, 9))
        index['spheres'][sl] = {'n': S['n'], 'k': S['k'], 'c': len(S['t']), 'p': S['page']}
        for t in S['t']:
            index['names'].append([t[0], sl, t[3]])
        for t in S['t']:
            if not t[4].strip():
                report.append('empty text: %s / %s' % (S['n'], t[1]))
    draw = {'v': V, 'url': WIKI + 'casting-traditions', 'cols': ['name', 'heading', 'group', 'md', 'page', 'sphere'], 'd': dbs}
    raw = json.dumps(draw, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    write(os.path.join(outdir, 'drawbacks.json'), raw)
    total_raw += len(raw); total_gz += len(gzip.compress(raw, 9))
    index['drawbacks'] = len(dbs)
    raw = json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    write(os.path.join(outdir, 'index.json'), raw)
    print('spheres: %d   talents: %d   drawbacks/boons: %d' % (len(index['spheres']), len(index['names']), len(dbs)))
    print('index.json: %d KB (%d KB gzipped)' % (len(raw) // 1024, len(gzip.compress(raw, 9)) // 1024))
    print('all files: %.1f MB (%.2f MB gzipped)' % ((total_raw + len(raw)) / 1048576, (total_gz + len(gzip.compress(raw, 9))) / 1048576))
    for r in clashes + report:
        print('  check:', r)
    index['problems'] = len(clashes) + len(report)
    return index


def write(path, raw):
    with open(path, 'wb') as fh:
        fh.write(raw)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', 'public', 'talents')
    # a non-zero exit when something needs a look (a sphere with no talents, empty text, two spheres in one file)
    sys.exit(1 if build(sys.argv[1], out)['problems'] else 0)
