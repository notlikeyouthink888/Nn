# -*- coding: utf-8 -*-
"""
قسم المساحة — Surveying.
مساحة ومحيط من الإحداثيات (Shoelace) · اتجاهات ومسافات · إغلاق المضلع (Bowditch) ·
دفتر المناسيب بطريقة ارتفاع الجهاز (HI) · حساب القطع والردم بطريقة الشبكة.
الإحداثيات: E شرقيات، N شماليات، Z منسوب — بالمتر.
"""
import math

def dms(deg):
    deg = deg % 360.0
    d = int(deg); m_ = (deg - d) * 60.0; m = int(m_); s = (m_ - m) * 60.0
    return "%d° %02d' %04.1f\"" % (d, m, s)

def bearing(dE, dN):
    b = math.degrees(math.atan2(dE, dN)) % 360.0
    return b

def quadrant(b):
    if b <= 90: return "N %s E" % dms(b)
    if b <= 180: return "S %s E" % dms(180 - b)
    if b <= 270: return "S %s W" % dms(b - 180)
    return "N %s W" % dms(360 - b)

def polygon(p):
    """مساحة ومحيط وأضلاع مضلّع من الإحداثيات."""
    pts = p['points']
    n = len(pts)
    if n < 3:
        raise ValueError("يلزم 3 نقاط على الأقل")
    E = [float(q['E']) for q in pts]; N = [float(q['N']) for q in pts]
    nm = [q.get('name') or ("P%d" % (i + 1)) for i, q in enumerate(pts)]
    a2 = 0.0
    for i in range(n):
        j = (i + 1) % n
        a2 += E[i] * N[j] - E[j] * N[i]
    area = abs(a2) / 2.0
    sides = []; per = 0.0
    for i in range(n):
        j = (i + 1) % n
        dE = E[j] - E[i]; dN = N[j] - N[i]
        L = math.hypot(dE, dN); per += L
        b = bearing(dE, dN)
        sides.append(dict(frm=nm[i], to=nm[j], dE=dE, dN=dN, L=L,
                          brg=b, brg_dms=dms(b), quad=quadrant(b)))
    cx = sum(E) / n; cy = sum(N) / n
    # زوايا داخلية (حسب اتجاه ترقيم النقاط)
    ccw = a2 > 0
    ang = []
    for i in range(n):
        a = sides[(i - 1) % n]['brg']; b = sides[i]['brg']
        ia = ((b + 180 - a) % 360) if ccw else ((a + 180 - b) % 360)
        ang.append(dict(at=nm[i], angle=ia, dms=dms(ia)))
    sum_int = sum(x['angle'] for x in ang)
    theo = (n - 2) * 180.0
    return dict(n=n, area=area, area_donum=area / 2500.0, perimeter=per, ccw=ccw,
                sides=sides, angles=ang, sum_internal=sum_int, theoretical=theo,
                ang_error=sum_int - theo, centroid=dict(E=cx, N=cy),
                points=[dict(name=nm[i], E=E[i], N=N[i]) for i in range(n)],
                note="المساحة بطريقة الإحداثيات (Shoelace) — الدونم العراقي = 2500 م²")

def traverse(p):
    """إغلاق مضلّع مقفل من اتجاهات ومسافات مرصودة + تصحيح Bowditch."""
    legs = p['legs']                        # [{brg: درجات, L: متر}]
    E0 = float(p.get('E0', 1000.0)); N0 = float(p.get('N0', 1000.0))
    rows = []; sE = sN = sL = 0.0
    E, N = E0, N0
    for i, g in enumerate(legs):
        b = float(g['brg']); L = float(g['L'])
        dE = L * math.sin(math.radians(b)); dN = L * math.cos(math.radians(b))
        sE += dE; sN += dN; sL += L
        E += dE; N += dN
        rows.append(dict(i=i + 1, brg=b, brg_dms=dms(b), L=L, dE=dE, dN=dN, E=E, N=N))
    err = math.hypot(sE, sN)
    prec = (sL / err) if err > 1e-9 else float('inf')
    run = 0.0
    for r in rows:
        run += r['L']
        r['cE'] = -sE * run / sL; r['cN'] = -sN * run / sL
        r['Ec'] = E0 + sum(x['dE'] for x in rows[:r['i']]) + r['cE']
        r['Nc'] = N0 + sum(x['dN'] for x in rows[:r['i']]) + r['cN']
    return dict(rows=rows, sum_dE=sE, sum_dN=sN, error=err, length=sL,
                precision=prec, prec_txt=("1 : %.0f" % prec) if err > 1e-9 else "إغلاق تام",
                ok=(prec > 5000), note="التصحيح بطريقة Bowditch — الدقة المقبولة للأعمال الإنشائية 1:5000 فأفضل")

def levels(p):
    """دفتر المناسيب بطريقة ارتفاع الجهاز (Height of Instrument)."""
    bm = float(p.get('bm', 0.0))
    obs = p['obs']            # [{point, bs, is, fs}]  (اترك الفارغ = None)
    rows = []; hi = None; rl = bm
    sbs = sfs = 0.0
    def num(v):
        return float(v) if v not in (None, '') else None
    for i, o in enumerate(obs):
        bs = num(o.get('bs')); fs = num(o.get('fs'))
        is_ = num(o.get('is') if o.get('is') is not None else o.get('is_'))
        if i == 0 and bs is not None:
            rl = bm; hi = rl + bs; sbs += bs
        else:
            if fs is not None:
                rl = hi - fs; sfs += fs
                if bs is not None:
                    hi = rl + bs; sbs += bs
            elif is_ is not None:
                rl = hi - is_
        rows.append(dict(point=o.get('point') or ("N%d" % (i + 1)), bs=bs, is_=is_, fs=fs,
                         hi=hi, rl=rl))
    first = rows[0]['rl']; last = rows[-1]['rl']
    chk1 = sbs - sfs; chk2 = last - first
    return dict(rows=rows, sum_bs=sbs, sum_fs=sfs, check_a=chk1, check_b=chk2,
                ok=abs(chk1 - chk2) < 1e-6, bm=bm,
                note="التدقيق الحسابي: ΣBS − ΣFS = آخر منسوب − أول منسوب")

def cutfill(p):
    """قطع وردم بطريقة الشبكة (Grid Method) — منسوب تصميمي واحد."""
    grid = p['grid']                      # [[z,...], ...] مصفوفة مناسيب أرضية
    a = float(p.get('cell', 5.0))         # ضلع الخلية م
    design = float(p.get('design', 0.0))  # المنسوب التصميمي
    nr = len(grid); nc = len(grid[0])
    cells = []
    cut = fill = 0.0
    for i in range(nr - 1):
        for j in range(nc - 1):
            zs = [float(grid[i][j]), float(grid[i][j + 1]), float(grid[i + 1][j]), float(grid[i + 1][j + 1])]
            hs = [design - z for z in zs]          # موجب = ردم
            avg = sum(hs) / 4.0
            v = avg * a * a
            if v >= 0: fill += v
            else: cut += -v
            cells.append(dict(i=i + 1, j=j + 1, avg=avg, v=v))
    net = fill - cut
    return dict(cells=cells, cut=cut, fill=fill, net=net, cell=a, design=design,
                rows=nr, cols=nc, area=(nr - 1) * (nc - 1) * a * a,
                balance=("يحتاج جلب ردم %.1f م³" % net) if net > 0 else ("يوجد فائض حفر %.1f م³" % -net),
                note="حجم كل خلية = متوسط الأعماق الأربعة × مساحة الخلية (Grid / Prismoidal مبسطة)")
