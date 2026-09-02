# -*- coding: utf-8 -*-
"""
معالج المشروع — من مساحة القطعة إلى حزمة أساسات كاملة.
مساحة (م²) + عدد الطوابق + التربة والمناسيب → شبكة أعمدة → أحمال → نوع الأساس
→ تصميمه → الحفريات والردم → الكميات، مع حفظ/استرجاع المشاريع.
"""
import json, os, re, time, math
import engine as E
import found as F
import earth as W

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'projects')

# ------------------------------ شبكة الأعمدة ------------------------------
def grid_from_area(area, ratio=1.25, target=5.0):
    L = math.sqrt(area * ratio); B = area / L
    L = round(L * 20) / 20.0; B = round(B * 20) / 20.0
    def split(d):
        n = max(1, int(round(d / target)))
        while d / n > 6.5: n += 1
        while n > 1 and d / n < 3.2: n -= 1
        return n, d / n
    nx, sx = split(L); ny, sy = split(B)
    return dict(L=L, B=B, nx=nx, ny=ny, sx=sx, sy=sy,
                cols=(nx + 1) * (ny + 1), bays=nx * ny)

def tributary(g):
    """مساحة مؤثرة لكل عمود حسب موقعه."""
    sx, sy, nx, ny = g['sx'], g['sy'], g['nx'], g['ny']
    out = []
    for j in range(ny + 1):
        for i in range(nx + 1):
            fx = 1.0 if 0 < i < nx else 0.5
            fy = 1.0 if 0 < j < ny else 0.5
            kind = 'داخلي' if (0 < i < nx and 0 < j < ny) else (
                'ركني' if (i in (0, nx) and j in (0, ny)) else 'حافة')
            out.append(dict(i=i, j=j, x=i * sx, y=j * sy, area=fx * sx * fy * sy, kind=kind))
    return out

# -------------------------------- المعالج ---------------------------------
def wizard(p):
    area = float(p.get('area', 200.0))
    floors = max(1, int(p.get('floors', 2)))
    use = p.get('use', 'سكني / غرف نوم')
    fc = float(p.get('fc', 25.0)); fy = float(p.get('fy', 420.0))
    soil_name = p.get('soil', 'طين قاسي')
    qa = float(p.get('qa') or F.SOIL_MAP.get(soil_name, (150.0, 'clay'))[0])
    soil_kind = F.SOIL_MAP.get(soil_name, (qa, 'clay'))[1]
    ground = float(p.get('ground', -0.30))
    old_depth = float(p.get('old_depth', 0.0))
    Df = float(p.get('Df', 1.50))
    hs = float(p.get('story_h', 3.2))
    cover = float(p.get('coverage', 1.0))          # نسبة البناء من القطعة
    fp = area * min(1.0, max(0.3, cover))

    g = grid_from_area(fp)
    trib = tributary(g)

    # ------------------------- الأحمال -------------------------
    live = dict(E.LIVE).get(use, 2.0)
    span_max = max(g['sx'], g['sy'])
    t_slab = max(120.0, math.ceil(span_max * 1000 / 28.0 / 10) * 10)      # سماكة تقريبية
    fl = E.floor_load(dict(slab=t_slab, live=live))
    beams_allow = 1.5                                                     # بدل وزن الجسور kN/m²
    D = fl['D'] + beams_allow
    Droof = D - 0.6                                                       # سطح بدون قواطع
    Lroof = 1.0
    # عمود ابتدائي من الحمل
    P_serv_max = 0.0
    for t in trib:
        P = (D + live) * t['area'] * (floors - 1) + (Droof + Lroof) * t['area']
        P_serv_max = max(P_serv_max, P)
    Pu_guess = 1.35 * P_serv_max
    Ag = Pu_guess * 1000.0 / (0.35 * fc)
    cb = max(300.0, math.ceil(math.sqrt(Ag / 1.25) / 50.0) * 50.0)
    ch = max(300.0, math.ceil(cb * 1.25 / 50.0) * 50.0)
    col_sw = cb * ch / 1e6 * 24.0 * hs * floors                            # kN لكل عمود

    loads = []
    for t in trib:
        Ps = (D + live) * t['area'] * (floors - 1) + (Droof + Lroof) * t['area'] + col_sw
        Pu = (1.2 * D + 1.6 * live) * t['area'] * (floors - 1) + \
             (1.2 * Droof + 1.6 * Lroof) * t['area'] + 1.2 * col_sw
        loads.append(dict(kind=t['kind'], i=t['i'], j=t['j'], x=t['x'], y=t['y'],
                          area=t['area'], P=Ps, Pu=Pu))
    Ps = [l['P'] for l in loads]
    total = sum(Ps)

    # ------------------------- الأساس -------------------------
    adv = F.advisor(dict(loads=Ps, qa=qa, footprint=fp, floors=floors, Df=Df,
                         spacing=min(g['sx'], g['sy'])))
    design = {}
    Pmax = max(Ps); Pumax = max(l['Pu'] for l in loads)
    sum_foot_area = adv['sum_area']
    if adv['type'] in ('isolated', 'combined'):
        des = E.footing_module(dict(PD=Pmax * 0.7, PL=Pmax * 0.3, qa=qa, fc=fc, fy=fy,
                                    cx=cb, cy=ch, Df=Df))
        # أساس نموذجي لكل موقع
        sizes = []
        for l in loads:
            B = math.ceil(math.sqrt(l['P'] / adv['q_net']) * 20) / 20.0
            sizes.append(dict(kind=l['kind'], i=l['i'], j=l['j'], x=l['x'], y=l['y'],
                              P=l['P'], B=max(B, 1.0)))
        design = dict(mode='isolated', typical=des, sizes=sizes,
                      conc=sum(s['B'] ** 2 * des['h'] / 1000.0 for s in sizes))
        sum_foot_area = sum(s['B'] ** 2 for s in sizes)
    elif adv['type'] == 'raft':
        rf = F.raft(dict(total=total, Pmax=Pumax, Lx=g['L'] + 1.0, Ly=g['B'] + 1.0,
                         qa=qa, fc=fc, fy=fy, cx=cb, cy=ch, span=span_max))
        design = dict(mode='raft', raft=rf, conc=rf['conc'])
        sum_foot_area = rf['A']
    else:
        # cu و N تقديرياً من تحمّل التربة إن لم تُعطَ
        cu = float(p.get('cu') or max(20.0, qa * 0.58))
        Nspt = float(p.get('N') or max(5.0, qa / 10.0))
        cand = [(0.6, 15), (0.6, 20), (0.8, 20), (0.8, 25), (1.0, 25), (1.0, 30), (1.2, 30)]
        if p.get('pile_D'):
            cand = [(float(p['pile_D']), float(p.get('pile_L', 15)))]
        pl = None
        for Dp, Lp in cand:
            pl = F.pile(dict(soil='clay' if soil_kind == 'clay' else 'sand', cu=cu, N=Nspt,
                             D=Dp, L=Lp, P=Pmax, kind=p.get('pile_kind', 'bored')))
            if pl['n'] <= 6: break
        design = dict(mode='piles', pile=pl, total_piles=pl['n'] * len(loads),
                      conc=pl['n'] * len(loads) * math.pi * pl['D'] ** 2 / 4 * pl['L'] +
                           len(loads) * pl['cap']['conc'])
        sum_foot_area = len(loads) * pl['cap']['B'] * pl['cap']['L']

    # ------------------------- الحفريات والردم -------------------------
    foot_h = design.get('raft', {}).get('h', design.get('typical', {}).get('h', 500)) / 1000.0
    ew = W.earthwork(dict(plot=area, footprint=fp, ground=ground, old_depth=old_depth,
                          Df=Df, foot_h=foot_h, foot_area=sum_foot_area,
                          dig_mode='full' if adv['type'] in ('raft', 'piles') else 'trench'))

    # ------------------------- الكميات -------------------------
    steel_rate = 110.0 if adv['type'] == 'raft' else 90.0
    conc = design.get('conc', 0.0)
    q = dict(
        excav=ew['cut_vol'], boulder=ew['boulder_buy'], subbase=ew['subbase_buy'],
        blinding=ew['blinding'], found_conc=conc, found_steel=conc * steel_rate / 1000.0,
        slab_conc=sum(s['volume'] for s in ew['stack'] if s['kind'] == 'slab'),
        columns=len(loads),
    )
    rates = p.get('rates') or {}
    r = lambda k, d: float(rates.get(k, d))
    cost = [
        ("حفريات", q['excav'], "م³", r('excav', 15000)),
        ("ردم جلمود/مختار", q['boulder'], "م³", r('boulder', 18000)),
        ("سبيس مدكوك", q['subbase'], "م³", r('subbase', 25000)),
        ("خرسانة نظافة", q['blinding'], "م³", r('blinding', 110000)),
        ("خرسانة الأساس المسلحة", q['found_conc'], "م³", r('concrete', 150000)),
        ("حديد تسليح الأساس", q['found_steel'], "طن", r('steel', 1200000)),
        ("أرضية خرسانية", q['slab_conc'], "م³", r('concrete', 150000)),
    ]
    rows = [dict(name=a, q=b, unit=c, rate=d, cost=b * d) for a, b, c, d in cost]
    grand = sum(x['cost'] for x in rows)

    # ------------------------- الزلازل السريع -------------------------
    Wt = total
    seis = E.seismic(dict(city=p.get('city', 'بغداد'), site=p.get('site', 'D'), hn=hs * floors,
                          W=Wt, stories=[dict(name='طابق %d' % k, w=Wt / floors, h=hs * k)
                                         for k in range(1, floors + 1)]))
    summary = [
        "القطعة %.0f م² · البناء %.0f م² · %d طوابق بارتفاع %.2f م" % (area, fp, floors, hs),
        "شبكة الأعمدة %d × %d بحر (%.2f × %.2f م) — عدد الأعمدة %d" % (g['nx'], g['ny'], g['sx'], g['sy'], g['cols']),
        "مقطع عمود ابتدائي %d×%d مم · سماكة سقف مقترحة %d مم" % (cb, ch, t_slab),
        "الحمل الكلي على التربة %.0f kN · أثقل عمود %.0f kN" % (total, Pmax),
        "التوصية: %s" % adv['name'],
    ]
    return dict(input=dict(area=area, floors=floors, use=use, qa=qa, soil=soil_name,
                           ground=ground, old_depth=old_depth, Df=Df, fc=fc, fy=fy,
                           story_h=hs, coverage=cover, city=p.get('city', 'بغداد')),
                grid=g, footprint=fp, loads=loads, total=total, Pmax=Pmax, Pumax=Pumax,
                floor=dict(D=D, L=live, Droof=Droof, slab=t_slab, items=fl['items'],
                           beams=beams_allow),
                col=dict(b=cb, h=ch, sw=col_sw), advisor=adv, design=design,
                earth=ew, boq=dict(rows=rows, total=grand), seismic=seis,
                summary=summary, span_max=span_max)

# ------------------------------ حفظ المشاريع ------------------------------
def _safe(name):
    s = re.sub(r'[^\w؀-ۿ\- ]+', '', str(name)).strip().replace(' ', '_')
    return (s or 'project')[:60]

def save(p):
    os.makedirs(DATA, exist_ok=True)
    name = _safe(p.get('name', 'مشروع'))
    fn = os.path.join(DATA, name + '.json')
    body = dict(name=p.get('name', name), saved=time.strftime('%Y-%m-%d %H:%M'),
                input=p.get('input', {}), note=p.get('note', ''))
    with open(fn, 'w', encoding='utf-8') as f:
        json.dump(body, f, ensure_ascii=False, indent=1)
    return dict(ok=True, file=name, saved=body['saved'])

def listing(p=None):
    if not os.path.isdir(DATA):
        return dict(projects=[])
    out = []
    for fn in sorted(os.listdir(DATA)):
        if not fn.endswith('.json'): continue
        try:
            with open(os.path.join(DATA, fn), encoding='utf-8') as f:
                d = json.load(f)
            out.append(dict(file=fn[:-5], name=d.get('name', fn[:-5]),
                            saved=d.get('saved', ''), input=d.get('input', {})))
        except Exception:
            continue
    return dict(projects=out)

def load(p):
    fn = os.path.join(DATA, _safe(p['file']) + '.json')
    if not os.path.isfile(fn):
        raise ValueError('المشروع غير موجود')
    with open(fn, encoding='utf-8') as f:
        return json.load(f)

def delete(p):
    fn = os.path.join(DATA, _safe(p['file']) + '.json')
    if os.path.isfile(fn):
        os.remove(fn)
    return dict(ok=True)
