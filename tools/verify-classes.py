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

Second part (every class with category "Spheres"): compares the rest of the class data with the first tab of its wiki page:
  HD       "Hit Die: d6"                      against hd
  ranks    "Skill Ranks Per Level: 4 + Int"   against sk
  skills   "Class Skills: ..." (first sentences only; for Guile classes the "Without a Trade Tradition" list, which is what
           the sheet stores), mapped to the sheet's ids, against cs. art (Artistry) and lore (Lore)
           are background skills: compared only if the wiki line mentions them
  BAB, Fort, Ref, Will   every level row of the class table (found by header names) against the sheet's formulas:
           BAB full n, 3/4 floor(3n/4), 1/2 floor(n/2); saves good 2+floor(n/2) / poor floor(n/3), prestige (pre) good
           floor((n+1)/2) / poor floor((n+1)/3).
Each mismatch is one line "MISMATCH | Class | detail", with the first differing level and, for BAB and saves, which setting
would match the whole wiki column (that is what to fix). Pages or tables not found print NOPAGE / NOTABLE. The lines are
grouped by class, with a count per kind at the end. Expected differences of these checks go in KNOWN2 (class, kind) below.
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
# expected differences of the HD / ranks / class skills / BAB / saves checks: (class, kind) -> reason. Kinds: 'HD', 'ranks',
# 'skills', 'BAB', 'Fort', 'Ref', 'Will', 'NOPAGE', 'NOTABLE'. Only for a wiki that is itself non-standard or inconsistent
# and that the sheet cannot represent; real data errors stay out of here so they keep being reported.
KNOWN2 = {
    ('Enlightened Scholar','Ref'): 'the wiki Reflex column is a non-standard progression (+9 at 20th)',
    ('Willshackler','Ref'): 'the wiki Reflex column stays +2 from 7th to 10th where the standard prestige poor save is +3 from 8th, probably a wiki typo',
    ('Advisor','Ref'): 'the wiki Reflex column has +2 at 9th where the standard poor save is +3 (a one-cell wiki typo; same in Conduit)',
    ('Conduit','Ref'): 'the wiki Reflex column has +2 at 9th where the standard poor save is +3 (a one-cell wiki typo; same in Advisor)',
    ('Theurge','Fort'): 'the wiki Fortitude column has +6 at 8th between +2 and +3 (a one-cell wiki typo)',
    ('Theorist','BAB'): 'the wiki BAB column has +6/+1 at 11th where a half-BAB class has +5 (a one-cell wiki typo)',
    ('Shenxue','Fort'): 'the wiki saves are floor(level/2) for all three (+0 at 1st, +3 at 6th): neither good nor poor, prestige or not',
    ('Shenxue','Ref'): 'same as Fort: the wiki Reflex save is floor(level/2), not a standard progression',
    ('Shenxue','Will'): 'same as Fort: the wiki Will save is floor(level/2), not a standard progression',
    ('Cyborg','NOTABLE'): 'the wiki table has "Good Saves" / "Poor Saves" columns, not Fort/Ref/Will, so it is not read here',
    ('Qahngol (Variant Half-Orc)','NOPAGE'): 'a variant race, no class page',
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
titles={}
for _s,_t in pages.items():
    _m=re.match(r'\s*# (.+)',_t)
    if _m: titles.setdefault(_m.group(1).strip().lower(),_t)
def find_page(n):
    """the wiki page text of class n: slugs first, then (case-insensitive) titles with or without '(Spheres)', 'Spheres ', 'Alternate ', 'The '"""
    for s in slugs(n):
        if s in pages: return pages[s]
    b=re.sub(r'\s*\(spheres\)$','',n.lower())
    for v in (b,re.sub(r'^(spheres|alternate|the) ','',b),b+' (spheres)','spheres '+b):
        for t in (v,v+' class'):
            if t in titles and re.search(r'\*\*Hit Di',(re.split(r'\n# ',titles[t])+['',''])[1]): return titles[t]   # a class page, not a race etc.
    for v in (b,re.sub(r'^(spheres|alternate|the) ','',b)):
        for s in slugs(v):
            if s in pages: return pages[s]
    return None
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
    pg=find_page(e['n'])
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

# ---- second part: HD, skill ranks, class skills, BAB and saves of the "Spheres" classes ----
SK={'acrobatics':'acro','appraise':'appr','bluff':'bluff','climb':'climb','craft':'craft','diplomacy':'diplo','disable device':'disable',
    'disguise':'disguise','escape artist':'escape','fly':'fly','handle animal':'handle','heal':'heal','intimidate':'intim',
    'linguistics':'ling','perception':'perc','perform':'perform','profession':'prof','ride':'ride','sense motive':'sense',
    'sleight of hand':'sleight','spellcraft':'spell','stealth':'stealth','survival':'surv','swim':'swim','use magic device':'umd',
    'artistry':'art','lore':'lore'}
KN={'arcana':'karc','dungeoneering':'kdun','engineering':'keng','geography':'kgeo','history':'khis','local':'kloc','nature':'knat',
    'nobility':'knob','planes':'kpla','religion':'krel'}
def parse_skills(s):
    s=re.split(r'\bIn addition\b|\n',s.lower())[0]
    out=set()
    for m in re.finditer(r'knowledge\s*\(([^)]*)\)',s):
        if re.search(r'\ball\b',m.group(1)):   # "all" or "all except Arcana"
            out|={v for k,v in KN.items() if k not in m.group(1).split('except')[-1] or 'except' not in m.group(1)}
        else: out|={v for k,v in KN.items() if k in m.group(1)}
    s=re.sub(r'knowledge\s*\([^)]*\)','',s)
    return out|{v for k,v in SK.items() if re.search(r'\b'+k+r'\b',s)}
def field(t,names):
    m=re.search(r'\*\*\s*(?:'+names+r')\s*[:.]?\s*\*\*\s*[:.]?[ \t]*([^\n]*)',t,re.I)
    return m.group(1) if m else None
def stat_table(t):
    """(level->{'bab','fort','ref','will'}) from the first table whose header has BAB and the three saves, else None"""
    ls=t.split('\n')
    for i,l in enumerate(ls):
        if not l.startswith('|'): continue
        h=[re.sub(r'[*_]','',c).strip().lower() for c in l.strip().strip('|').split('|')]
        col={}
        for j,c in enumerate(h):
            for k,rx in (('lvl',r'\b(level|lvl)\b'),('bab',r'base attack|\bbab\b'),('fort',r'^fort'),('ref',r'^ref'),('will',r'^will')):
                if k not in col and re.search(rx,c): col[k]=j
        if len(col)<5: continue
        rows={}
        for x in ls[i+1:]:
            if not x.startswith('|'): break
            c=[re.sub(r'[*_]','',v).strip() for v in x.strip().strip('|').split('|')]
            m=re.match(r'(\d+)',c[col['lvl']]) if len(c)>max(col.values()) else None
            if not m: continue
            v={}
            for k in ('bab','fort','ref','will'):
                n=re.search(r'[+-]?\d+',c[col[k]]); v[k]=int(n.group()) if n else None
            rows.setdefault(int(m.group(1)),v)
        if rows: return rows
    return None
BAB={'full':lambda n:n,'3/4':lambda n:n*3//4,'1/2':lambda n:n//2}
def save(good,pre,n): return ((n+1)//2 if good else (n+1)//3) if pre else (2+n//2 if good else n//3)
def lv(n): return '%d%s'%(n,'th' if 10<=n%100<=20 else {1:'st',2:'nd',3:'rd'}.get(n%10,'th'))
def cmp_col(rows,stat,fn,hint):
    """None if the wiki column equals fn(n) at every row, else first-difference text plus the settings that would match"""
    bad=[(n,r[stat],fn(n)) for n,r in sorted(rows.items()) if r[stat] is not None and r[stat]!=fn(n)]
    if not bad: return None
    n,w,x=bad[0]
    return 'first differs at %s (wiki +%d, sheet +%d)%s'%(lv(n),w,x,hint(rows))
def bab_hint(rows):
    ok=[k for k,f in BAB.items() if all(r['bab'] is None or r['bab']==f(n) for n,r in rows.items())]
    return '; wiki matches BAB %s'%' or '.join(ok) if ok else '; wiki matches no standard BAB'
def save_hint(stat):
    def h(rows):
        ok=['a %s %s save'%('good' if g else 'poor','prestige' if p else 'normal') for p in (0,1) for g in (1,0)
            if all(r[stat] is None or r[stat]==save(g,p,n) for n,r in rows.items())]
        return '; wiki matches '+(' or '.join(ok) if ok else 'no standard save progression')
    return h
res=[]   # (class, kind, detail)
for e in L:
    if e['c']!='Spheres': continue
    n=e['n']; pg=find_page(n)
    if pg is None: res.append((n,'NOPAGE','no wiki page found')); continue
    t=first_tab(pg)
    hd=field(t,r'Hit Di(?:e|ce)'); m=re.match(r'\s*\d*d(\d+)',hd or '')
    if not m: res.append((n,'HD','no hit die found on the wiki page'))
    elif int(m.group(1))!=e['hd']: res.append((n,'HD','wiki d%s, sheet d%s'%(m.group(1),e['hd'])))
    rk=field(t,r'(?:Class )?Skills?(?: (?:Ranks|Points)(?: (?:per|at Each|each) Level)?| (?:per|at Each|each) Level)'); m=re.match(r'\s*(\d+)',rk or '')
    if not m: res.append((n,'ranks','no skill ranks found on the wiki page'))
    elif int(m.group(1))!=e['sk']: res.append((n,'ranks','wiki %s, sheet %s'%(m.group(1),'unset' if e['sk'] is None else e['sk'])))
    cs=field(t,'Class Skills')
    if cs is None: res.append((n,'skills','no class skills found on the wiki page'))
    else:
        wo=field(t,r'Without[^*:.]*')   # Guile classes: the sheet stores the "Without a Trade Tradition" list
        w=parse_skills(wo if wo else cs); sh=set(e['cs'])
        for b in ('art','lore'):
            if b not in w: sh.discard(b)
        if w!=sh: res.append((n,'skills','wiki-only %s; sheet-only %s'%(sorted(w-sh),sorted(sh-w))))
    rows=stat_table(t)
    if rows is None: res.append((n,'NOTABLE','no class table with BAB and saves in the first tab')); continue
    d=cmp_col(rows,'bab',BAB[e['bab']],bab_hint)
    if d: res.append((n,'BAB','%s; sheet has %s'%(d,e['bab'])))
    for stat,key in (('fort','Fort'),('ref','Ref'),('will','Will')):
        g=stat in e['good']
        d=cmp_col(rows,stat,lambda x:save(g,e['pre'],x),save_hint(stat))
        if d: res.append((n,key,'%s; sheet has %s, %s'%(d,'good' if g else 'poor','prestige' if e['pre'] else 'non-prestige')))
KINDS=['HD','ranks','skills','BAB','Fort','Ref','Will','NOPAGE','NOTABLE']
count={k:0 for k in KINDS}; new2=0; ncls=sum(1 for e in L if e['c']=='Spheres')
print()
for e in L:
    for n,k,d in res:
        if n!=e['n'] or e['c']!='Spheres': continue
        why=KNOWN2.get((n,k))
        if not why: new2+=1; count[k]+=1
        print(('known    ' if why else 'CHECK    ')+('MISMATCH' if k not in ('NOPAGE','NOTABLE') else k)+' | '+n+' | '+(k+': '+d if k not in ('NOPAGE','NOTABLE') else d)+(' [expected: '+why+']' if why else ''))
bad={n for n,k,d in res if not KNOWN2.get((n,k))}
print('class data: %d of %d Spheres classes match their wiki page; unexplained mismatches: %d (%s)' % (ncls-len(bad),ncls,new2,', '.join('%s %d'%(k,c) for k,c in count.items())))
sys.exit(1 if new or new2 else 0)
