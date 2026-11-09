#!/usr/bin/env python3
"""Check the class list's talent progressions against the offline wiki (SoP-Claude-Bundles).

For every class in the sheet's class list with Spheres casting, martial or skill training, reads the class table on its
wiki page: the talent columns (Magic / Combat / Blended Training Talents, or Any + Utility for skill talents) and the levels
whose Special column says "Bonus talent". Works out the talents per level and compares them, levels 1-20, with what the
sheet gives (the same rules as classTalentSplit in public/index.html: casting/martial/skill rates, "Talents" setting,
bonus talents, and "More talents from class features").

    python3 tools/verify-classes.py <path to SoP-Claude-Bundles folder>

Prints each mismatch and exits 1 if there is one that isn't listed in KNOWN below. Run it after the wiki bundle or the
class list changes. (2026-11-09: found Conscript, Raveler and Professional missing their bonus talents.)
"""
import json, os, re, sys, glob

# expected differences: the wiki table doesn't show it, or the sheet handles it some other way
KNOWN = {
    'Advisor': 'Leader: Communication sphere + an (assist) talent at 1st, in the text, not the table (sheet: Bonus talents 2)',
    'Scholar': 'Problem Solver: Alchemy and Scout spheres at 1st, in the text, not the table (sheet: Bonus talents 2)',
    'Troubadour': 'magic talents at 5th and every 4 levels are in the text; the table shows combat talents only',
    'Cyborg': 'the 3rd-level bonus talent is a specific Tinker talent from the path (class note says to add it)',
    'Spheres Archwizard': '"+1 level of spherecasting class": advances another class (cast "adv"), not talents of its own',
    'Alternate Justicar': 'Warleader talents are a separate track the sheet doesn\'t count yet (notes: maybe later)',
    'Qahngol (Variant Half-Orc)': 'a variant race, no class page',
}
if len(sys.argv) < 2: sys.exit(__doc__)
D = sys.argv[1]
_html = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'index.html'), encoding='utf8').read()
L = json.loads(re.search(r'id="classLib">(.*?)</script>', _html).group(1))
pages={}
for f in sorted(glob.glob(D+'/*.md')):
    t=open(f,encoding='utf8').read()
    parts=re.split(r'<!-- page: (\S+) -->',t)
    for i in range(1,len(parts),2): pages.setdefault(parts[i],parts[i+1])
def slugs(n):
    b=re.sub(r'[^a-z0-9]+','-',n.lower().replace(' (spheres)','')).strip('-')
    return [b+'-class',b+'-base-class',b+'-prestige-class',b]
def first_tab(t):
    m=re.split(r'\n\*\*Tab: [^*]+\*\*\n',t)
    return m[1] if len(m)>2 else t
def table(t):
    lines=t.split('\n')
    for i,l in enumerate(lines):
        if l.startswith('|') and re.search(r'\b(Level|Lvl)\b',l):
            hdr=[h.strip() for h in l.strip().strip('|').split('|')]
            rows=[]
            for x in lines[i+1:]:
                if not x.startswith('|'): break
                if re.match(r'^\|[\s\-|:]+$',x): continue
                c=[h.strip() for h in x.strip().strip('|').split('|')]
                if lvl(c[0]) is None: continue
                rows.append(c)
            if len(rows)>=5: return hdr,rows
    return None,None
def lvl(c):
    m=re.match(r'(\d+)',c); return int(m.group(1)) if m else None
def num(c):
    m=re.match(r'\s*\+?(\d+)',c); return int(m.group(1)) if m else 0
RATE={'high':1,'mid':.75,'low':.5,'expert':1,'adept':.75,'proficient':.5,'virtuoso':1,'journeyman':.75,'trained':.5}
def rate(r,n):
    return n if r==1 else n*3//4 if r==.75 else n//2 if r==.5 else 0
def sheet(e,n):
    tal=e.get('tal','auto'); v=0
    if tal=='auto': v+=rate(RATE.get(e.get('cast')),n)+rate(RATE.get(e.get('mart')),n)
    elif tal=='0.5up': v+=(n+1)//2
    elif tal in ('1','0.75','0.5'): v+=rate(float(tal),n)
    sk=RATE.get(e.get('skill'))
    if sk: v+= (n-n//4+n//2) if sk==1 else (n//2+(n+1)//2) if sk==.75 else (n//4+(n+1)//2)
    v+=e.get('bt',0) or 0
    tx=e.get('tx','')
    if tx=='odd': v+=(n+1)//2
    elif tx=='m5': v+=(n-1)//4 if n>=5 else 0
    elif tx=='even': v+=n//2
    elif tx=='f4': v+=(n+3)//4
    ux=e.get('ux','')
    if ux=='even': v+=n//2
    elif ux=='odd': v+=(n+1)//2
    return v
out=[]
for e in L:
    if e['c']!='Spheres' and all((e.get(k) or 'none')=='none' for k in ('cast','mart','skill')): continue
    pg=next((pages[s] for s in slugs(e['n']) if s in pages),None)
    if pg is None: out.append(('NOPAGE',e['n'],'')); continue
    hdr,rows=table(first_tab(pg))
    if not hdr: out.append(('NOTABLE',e['n'],'')); continue
    sp=next((j for j,h in enumerate(hdr) if re.search('special',h,re.I)),None)
    tc=[j for j,h in enumerate(hdr) if (re.search(r'talent',h,re.I) or re.fullmatch(r'any|utility',h,re.I)) and not re.search(r'known|per day|granted|pool',h,re.I)]
    data=[]
    for r in rows:
        n=lvl(r[0]) if r else None
        if not n: continue
        bon=1 if sp is not None and sp<len(r) and re.search(r'bonus (magic |combat |skill )?talents?\b',r[sp],re.I) else 0
        cols=[num(r[j]) if j<len(r) else 0 for j in tc]
        data.append((n,bon,cols))
    if not data: out.append(('NOROWS',e['n'],'')); continue
    # talent columns: cumulative if never decreasing and rising overall, else per level
    tot=[]; cum=[0]*len(tc); bon=0
    percol=[]
    for j in range(len(tc)):
        seq=[d[2][j] for d in data]
        percol.append('cum' if all(b>=a for a,b in zip(seq,seq[1:])) and seq[-1]>max(2,len(seq)//3) else 'per')
    for n,b,cols in data:
        bon+=b
        for j,c in enumerate(cols): cum[j]= c if percol[j]=='cum' else cum[j]+c
        tot.append((n,sum(cum)+bon))
    mis=[(n,w,sheet(e,n)) for n,w in tot if w!=sheet(e,n)]
    info='cols=%s(%s) bonusLv=%s sheet(cast=%s mart=%s skill=%s tal=%s bt=%s tx=%s ux=%s)'%([hdr[j] for j in tc],','.join(percol),[d[0] for d in data if d[1]],e.get('cast'),e.get('mart'),e.get('skill'),e.get('tal'),e.get('bt',''),e.get('tx',''),e.get('ux',''))
    out.append(('MISMATCH' if mis else 'ok',e['n'],info+('  first diffs (lvl wiki sheet): '+str(mis[:4]) if mis else '')))
new = 0
for k in ('MISMATCH','NOTABLE','NOPAGE','NOROWS'):
    for o in out:
        if o[0]!=k: continue
        known = KNOWN.get(o[1])
        if not known: new += 1
        print(('known    ' if known else 'CHECK    ')+k+' | '+o[1]+' | '+(known or o[2]))
print('matching the wiki: %d of %d; unexplained: %d' % (sum(1 for o in out if o[0]=='ok'), len(out), new))
sys.exit(1 if new else 0)
