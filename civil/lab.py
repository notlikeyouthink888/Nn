# -*- coding: utf-8 -*-
"""
مختبر الإنشائيات والتجربة — حذف عمود أو جسر ودراسة المسار البديل للأحمال.
يبني نموذجاً فراغياً (Frame3D) بديافرام صلب، يحلل الحالة الأصلية ثم بعد الحذف،
ويصنّف نمط الفشل لكل عنصر: انحناء · قص · التواء · ضغط/انبعاج · شد.
منهجية: المسار البديل (Alternate Load Path) وفق GSA / UFC 4-023-03.
"""
import math
import engine as E
import frame3d as F3
import detail as D

def build(sp, removed=None):
    """يبني النموذج الفراغي من مواصفات المبنى."""
    nx, ny = int(sp['nx']), int(sp['ny'])
    sx, sy = float(sp['sx']), float(sp['sy'])
    nf, hs = int(sp['floors']), float(sp['story_h'])
    fc = float(sp.get('fc', 28.0)); Ec = E.Ec(fc) * 1000.0
    cb, chh = float(sp['col_b']) / 1000.0, float(sp['col_h']) / 1000.0
    bb, bh = float(sp['beam_b']) / 1000.0, float(sp['beam_h']) / 1000.0
    wu = float(sp.get('wu', 12.0))
    f = F3.Frame3D()
    nid = {}
    for k in range(nf + 1):
        for j in range(ny + 1):
            for i in range(nx + 1):
                nid[(i, j, k)] = f.node(i * sx, j * sy, k * hs)
    Ac, Ic1, Ic2 = cb * chh, chh * cb ** 3 / 12 * 0.7, cb * chh ** 3 / 12 * 0.7
    Jc = F3.torsion_J(cb, chh)
    Ab, Ib1, Ib2 = bb * bh, bh * bb ** 3 / 12 * 0.35, bb * bh ** 3 / 12 * 0.35
    Jb = F3.torsion_J(bb, bh) * 0.35
    ids = {}
    for k in range(nf):
        for j in range(ny + 1):
            for i in range(nx + 1):
                key = ('col', i, j, k + 1)
                idx = f.member(nid[(i, j, k)], nid[(i, j, k + 1)], Ec, Ac, Ic1, Ic2, Jc,
                               tag='col', meta=dict(key=key, b=cb, h=chh, story=k + 1, i=i, j=j))
                ids[key] = idx
    # الحمل الشاقولي: كل جسر يحمل نصف الشريط المؤثر له (النصف الآخر على الاتجاه الآخر)،
    # والمحاور الطرفية نصف شريط — فيكون مجموع الأحمال = wu × مساحة الطابق بالضبط.
    for k in range(1, nf + 1):
        for j in range(ny + 1):
            wj = wu * sy * (1.0 if 0 < j < ny else 0.5) / 2.0
            for i in range(nx):
                key = ('bx', i, j, k)
                ids[key] = f.member(nid[(i, j, k)], nid[(i + 1, j, k)], Ec, Ab, Ib1, Ib2, Jb,
                                    qz=-wj, tag='bx',
                                    meta=dict(key=key, b=bb, h=bh, story=k, i=i, j=j, span=sx))
        for i in range(nx + 1):
            wi = wu * sx * (1.0 if 0 < i < nx else 0.5) / 2.0
            for j in range(ny):
                key = ('by', i, j, k)
                ids[key] = f.member(nid[(i, j, k)], nid[(i, j + 1, k)], Ec, Ab, Ib1, Ib2, Jb,
                                    qz=-wi, tag='by',
                                    meta=dict(key=key, b=bb, h=bh, story=k, i=i, j=j, span=sy))
        f.diaphragm([nid[(i, j, k)] for j in range(ny + 1) for i in range(nx + 1)])
    for j in range(ny + 1):
        for i in range(nx + 1):
            f.support(nid[(i, j, 0)])
    # القوة الجانبية تُسلَّط عند مركز الديافرام لا عند ركن — وإلا ولّدت التواءً وهمياً
    ic, jc = nx // 2, ny // 2
    for lat in (sp.get('lateral') or []):
        k = int(lat['floor'])
        if 1 <= k <= nf:
            f.load(nid[(ic, jc, k)], Fx=float(lat.get('Fx', 0.0)), Fy=float(lat.get('Fy', 0.0)))
    # يقبل عنصراً واحداً أو قائمة عناصر — حذف عدة أعمدة معاً هو السيناريو
    # الحقيقي (انفجار · اصطدام مركبة · حريق موضعي يطال أكثر من عمود)
    for rm in _as_list(removed):
        if tuple(rm) in ids:
            f.members[ids[tuple(rm)]]['alive'] = False
    return f, ids, nid

def _as_list(removed):
    """يوحّد الشكل: عنصر واحد ['col',i,j,k] أو قائمة عناصر [[...],[...]]."""
    if not removed:
        return []
    if isinstance(removed[0], (list, tuple)):
        return [list(r) for r in removed if r]
    return [list(removed)]

# ---------------------------- فحوص المقاومة ----------------------------
def capacities(sp):
    fc = float(sp.get('fc', 28.0)); fy = float(sp.get('fy', 420.0))
    cb, chh = float(sp['col_b']), float(sp['col_h'])
    bb, bh = float(sp['beam_b']), float(sp['beam_h'])
    cr = sp.get('col_rebar') or dict(nb=3, db=20)
    layers = E.col_layers(cb, chh, int(cr.get('nb', 3)), int(cr.get('nb', 3)), float(cr.get('db', 20)))
    pts, P0, Ast = E.col_interaction(cb, chh, fc, fy, layers)
    dbe = bh - 40 - 10 - 8
    As_bot = (sp.get('beam_rebar') or {}).get('bottom_As', 0.0) or \
        E.pick_bars(0.004 * bb * dbe, width=bb)['As']
    As_top = (sp.get('beam_rebar') or {}).get('top_As', 0.0) or As_bot
    a = As_bot * fy / (0.85 * fc * bb)
    phiMn_pos = 0.9 * As_bot * fy * (dbe - a / 2) / 1e6
    a2 = As_top * fy / (0.85 * fc * bb)
    phiMn_neg = 0.9 * As_top * fy * (dbe - a2 / 2) / 1e6
    st = sp.get('stirrup') or dict(db=10, s=200, legs=2)
    Av = st['legs'] * E.ab(st['db'])
    phiVn = 0.75 * (0.17 * math.sqrt(fc) * bb * dbe + Av * fy * dbe / st['s']) / 1000.0
    Acp = bb * bh; pcp = 2 * (bb + bh)
    phiTth = 0.75 * 0.083 * math.sqrt(fc) * Acp ** 2 / pcp / 1e6
    Aoh = (bb - 80) * (bh - 80); ph = 2 * ((bb - 80) + (bh - 80))
    phiTn = 0.75 * 2 * 0.85 * Aoh * (Av / 2) * fy / st['s'] / 1e6
    r = 0.3 * chh / 1000.0
    return dict(pts=pts, P0=P0, phiPmax=pts[0]['P'], phiMn_pos=phiMn_pos, phiMn_neg=phiMn_neg,
                phiVn=phiVn, phiTth=phiTth, phiTn=max(phiTn, phiTth), r=r,
                Ec=E.Ec(fc) * 1000.0, Ic=cb * chh ** 3 / 12 / 1e12, fc=fc, fy=fy,
                col=(cb, chh), beam=(bb, bh), d=dbe)

MODES = [('bending', 'انحناء (Bending)'), ('shear', 'قص (Shear)'), ('torsion', 'التواء (Torsion)'),
         ('buckling', 'ضغط وانبعاج (Compression / Buckling)'), ('tension', 'شد (Tension)')]

def check_member(m, dg, cap, hs):
    """نسب الاستغلال لكل نمط + النمط الحاكم."""
    N = min(p['N'] for p in dg); Nt = max(p['N'] for p in dg)
    Mz = max(abs(p['Mz']) for p in dg); My = max(abs(p['My']) for p in dg)
    Vy = max(abs(p['Vy']) for p in dg); Vz = max(abs(p['Vz']) for p in dg)
    Tq = max(abs(p['T']) for p in dg)
    out = dict(N=N, Nt=Nt, M=max(Mz, My), V=max(Vy, Vz), T=Tq)
    if m['tag'] == 'col':
        Pu = abs(min(N, 0.0))
        Mu = math.sqrt(Mz ** 2 + My ** 2)
        phiMn, rb = E.col_check(Pu, Mu, cap['pts'])
        lam = 1.0 * hs / cap['r']
        Pc = math.pi ** 2 * (0.4 * cap['Ec'] * cap['Ic']) / (1.0 * hs) ** 2
        rk = Pu / (0.75 * Pc) if Pc > 0 else 9.9
        out.update(bending=rb, buckling=max(Pu / cap['phiPmax'], rk),
                   shear=max(Vy, Vz) / cap['phiVn'], torsion=Tq / cap['phiTn'],
                   tension=max(0.0, Nt) / (0.9 * cap['P0'] * 0.3) if Nt > 0 else 0.0,
                   slender=lam, Pc=Pc, phiMn=phiMn)
    else:
        Mpos = max(0.0, max(p['Mz'] for p in dg))
        Mneg = abs(min(0.0, min(p['Mz'] for p in dg)))
        out.update(bending=max(Mpos / cap['phiMn_pos'], Mneg / cap['phiMn_neg']),
                   shear=max(Vy, Vz) / cap['phiVn'], torsion=Tq / cap['phiTn'],
                   buckling=0.0, tension=max(0.0, Nt) / 500.0,
                   Mpos=Mpos, Mneg=Mneg)
    best = max(MODES, key=lambda x: out.get(x[0], 0.0))
    out['ratio'] = out.get(best[0], 0.0)
    out['mode'] = best[0]; out['mode_ar'] = best[1]
    return out

def analyze(sp, removed=None):
    f, ids, nid = build(sp, removed)
    f.run()
    cap = capacities(sp)
    hs = float(sp['story_h'])
    res = {}
    for idx, m in enumerate(f.members):
        if not m['alive']:
            continue
        dg = f.diagram(idx, 9)
        r = check_member(m, dg, cap, hs)
        r['key'] = m['meta']['key']; r['tag'] = m['tag']
        r['story'] = m['meta']['story']
        res[m['meta']['key']] = r
    drift, nx, ny = [], int(sp['nx']), int(sp['ny'])
    for k in range(1, int(sp['floors']) + 1):
        ux = [f.node_disp(nid[(i, j, k)])[0] * 1000.0
              for j in range(ny + 1) for i in range(nx + 1)]
        drift.append(max(ux, key=abs))
    return dict(res=res, drift=drift, neq=f.neq, bw=f.bw, cap=cap)

def compare(sp):
    """يقارن الحالة الأصلية بحالة الحذف ويصنّف الأثر."""
    removed = sp.get('remove')
    base = analyze(sp, None)
    if not removed:
        return dict(base=base['res'], after=None, removed=None, drift=base['drift'],
                    summary=['لم يُحذف أي عنصر — هذه الحالة الأصلية'], neq=base['neq'])
    aft = analyze(sp, removed)
    rows, worst = [], None
    for k, a in aft['res'].items():
        b = base['res'].get(k)
        if not b:
            continue
        d = a['ratio'] - b['ratio']
        if abs(d) < 0.02 and a['ratio'] < 1.0:
            continue
        row = dict(key=list(k), tag=a['tag'], story=a['story'],
                   before=b['ratio'], after=a['ratio'], delta=d,
                   mode=a['mode'], mode_ar=a['mode_ar'], fail=a['ratio'] > 1.0,
                   M=a['M'], V=a['V'], T=a['T'], N=a['N'],
                   modes={m: round(a.get(m, 0.0), 3) for m, _ in MODES})
        rows.append(row)
        if worst is None or a['ratio'] > worst['after']:
            worst = row
    rows.sort(key=lambda r: -r['after'])
    fails = [r for r in rows if r['fail']]
    KA = {'col': 'عمود', 'bx': 'جسر باتجاه X', 'by': 'جسر باتجاه Y'}
    rml = _as_list(removed)
    if len(rml) == 1:
        r0 = rml[0]
        summary = ['تم حذف %s عند المحور (%d, %d) بالطابق %d'
                   % (KA.get(r0[0], r0[0]), r0[1], r0[2], r0[3])]
    else:
        summary = ['تم حذف %d عنصراً معاً: %s'
                   % (len(rml), ' · '.join('%s (%d, %d) ط%d'
                                           % (KA.get(r[0], r[0]), r[1], r[2], r[3])
                                           for r in rml))]
    if not fails:
        summary.append('✓ المنشأ نجا: لا يوجد عنصر تجاوز مقاومته التصميمية — يوجد مسار بديل للأحمال')
    else:
        summary.append('✗ %d عنصر تجاوز مقاومته — احتمال انهيار تدريجي (Progressive Collapse)' % len(fails))
        by = {}
        for r in fails:
            by[r['mode_ar']] = by.get(r['mode_ar'], 0) + 1
        summary.append('أنماط الفشل: ' + ' · '.join('%s (%d عنصر)' % (k2, v) for k2, v in by.items()))
    if worst:
        summary.append('أشد عنصر متأثر: %s طابق %d — النسبة %.2f → %.2f (%s)' % (
            {'col': 'عمود', 'bx': 'جسر X', 'by': 'جسر Y'}.get(worst['tag'], worst['tag']),
            worst['story'], worst['before'], worst['after'], worst['mode_ar']))
    dmax = max([abs(x) for x in aft['drift']] or [0])
    summary.append('أقصى انزياح جانبي بعد الحذف %.1f مم (قبله %.1f مم)' % (
        dmax, max([abs(x) for x in base['drift']] or [0])))
    return dict(base=base['res'], after=aft['res'], removed=_as_list(removed), rows=rows[:60],
                fails=len(fails), summary=summary, drift=aft['drift'], drift_before=base['drift'],
                neq=aft['neq'], modes=[dict(k=a, name=b) for a, b in MODES],
                note='المنهجية: حذف عنصر رئيسي وإعادة التحليل الفراغي لدراسة المسار البديل للأحمال '
                     '(GSA / UFC 4-023-03). النسب محسوبة على مقاطع وتسليح المشروع نفسه.')
