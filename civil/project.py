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

# ---------------------- تصميم عناصر الهيكل الفوقي ------------------------
def design_slab(g, t_slab, wD_super, live, fc, fy, col_b):
    """يختار نوع السقف ويصممه، ويرجع شبكتي التسليح للرسم."""
    lo, hi = min(g['sx'], g['sy']), max(g['sx'], g['sy'])
    kind = 'two' if hi / lo <= 2.0 else 'one'
    r = E.slab_module(dict(kind=kind, Lx=g['sx'], Ly=g['sy'], nspans=max(g['nx'], g['ny']),
                           wD=wD_super, wL=live, h=t_slab, fc=fc, fy=fy, col=col_b / 1000.0))
    if kind == 'one':
        pos = [x for x in r['results'] if x['M'] > 0]
        neg = [x for x in r['results'] if x['M'] < 0]
        bot = max(pos, key=lambda x: x['As']); top = max(neg, key=lambda x: x['As'])
        mesh = dict(bottom=dict(db=bot['db'], s=bot['s'], label=bot['label']),
                    top=dict(db=top['db'], s=top['s'], label=top['label']))
    else:
        rows = [x for d in r['dirs'] for x in d['rows']]
        pos = [x for x in rows if x['M'] > 0]; neg = [x for x in rows if x['M'] < 0]
        bot = max(pos, key=lambda x: x['As_m']); top = max(neg, key=lambda x: x['As_m'])
        mesh = dict(bottom=dict(db=bot['db'], s=bot['s'], label=bot['label']),
                    top=dict(db=top['db'], s=top['s'], label=top['label']))
    r['kind_name'] = ('بلاطة مصمتة ثنائية الاتجاه' if kind == 'two'
                      else 'بلاطة مصمتة أحادية الاتجاه')
    r['why'] = ('نسبة البحور %.2f ≤ 2 — تعمل بالاتجاهين وتوزّع الحمل على كل الجسور'
                % (hi / lo)) if kind == 'two' else (
               'نسبة البحور %.2f > 2 — الحمل ينتقل بالاتجاه القصير فقط' % (hi / lo))
    r['mesh'] = mesh
    return r

def design_beam(span, nspan, trib, wD_floor, live, fc, fy, col_b):
    """جسر مستمر نموذجي: مقطع + تسليح + أساور."""
    bw = max(250.0, min(col_b, 400.0))
    hb = max(400.0, math.ceil(span * 1000.0 / 12.0 / 50.0) * 50.0)
    for _ in range(6):
        r = E.beam_module(dict(spans=[dict(L=span, wD=wD_floor * trib, wL=live * trib)] * max(1, nspan),
                               b=bw, h=hb, fc=fc, fy=fy))
        ok = all(d['flex']['ok'] and d['shear']['ok'] and d['defl_ok'] for d in r['design'])
        if ok: break
        hb += 50.0
    sup = [s for s in r['supports'] if s['flex']]
    top = max(sup, key=lambda s: s['flex']['As_req'])['flex'] if sup else r['design'][0]['flex']
    bot = max(r['design'], key=lambda d: d['flex']['As_req'])['flex']
    sh = max(r['design'], key=lambda d: d['shear']['Vu'])['shear']
    r['section'] = dict(b=bw, h=hb, span=span, nspan=nspan, trib=trib)
    r['rebar'] = dict(bottom=bot['bars'], top=top['bars'], stirrup=dict(db=sh['db_stirrup'],
                      s=sh['s'], legs=sh['legs'], label=sh['label']), cover=40.0)
    return r

def design_column(b, h, Pu, Mu, fc, fy):
    """تسليح العمود بمنحني التفاعل + الأتاري."""
    best = None
    for nb, db in ((3, 16), (3, 20), (4, 20), (3, 25), (4, 25), (5, 25), (4, 32), (5, 32), (6, 32)):
        layers = E.col_layers(b, h, nb, nb, db)
        pts, P0, Ast = E.col_interaction(b, h, fc, fy, layers)
        phiMn, ratio = E.col_check(Pu, Mu, pts)
        rho = Ast / (b * h)
        cand = dict(nb=nb, db=db, n=4 * nb - 4, Ast=Ast, rho=rho, ratio=ratio,
                    phiMn=phiMn, phiPn_max=pts[0]['P'], ok=(ratio <= 1.0 and 0.01 <= rho <= 0.06))
        if best is None or (cand['ok'] and not best['ok']) or \
           (cand['ok'] == best['ok'] and cand['ratio'] < best['ratio'] and not best['ok']):
            best = cand
        if cand['ok']:
            best = cand; break
    dbt = 10 if best['db'] <= 32 else 12
    # التباعد العادي (ACI 25.7.2.1) بحد أقصى عملي 300 مم
    st = min(math.floor(min(16 * best['db'], 48 * dbt, min(b, h)) / 25.0) * 25.0, 300.0)
    # منطقة التطويق عند طرفي العمود (ACI 18.7.5) — مناطق زلزالية
    sc = math.floor(min(min(b, h) / 4.0, 6 * best['db'], 150.0) / 25.0) * 25.0
    lo = max(max(b, h), 3200.0 / 6.0, 450.0)
    best.update(tie_db=dbt, tie_s=st, tie_s_conf=sc, conf_len=lo, cover=40.0,
                label="%dØ%d" % (best['n'], best['db']),
                tie_label="أتاري Ø%d @ %d مم" % (dbt, int(st)),
                conf_label="تطويق Ø%d @ %d مم على مسافة %d مم من كل طرف" % (dbt, int(sc), int(lo)))
    return best

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
    cover = float(p.get('coverage', 1.0))
    fp = area * min(1.0, max(0.3, cover))

    g = grid_from_area(fp)
    trib = tributary(g)

    # ------------------------- الأحمال -------------------------
    live = dict(E.LIVE).get(use, 2.0)
    span_max = max(g['sx'], g['sy'])
    t_slab = max(120.0, math.ceil(span_max * 1000 / 28.0 / 10) * 10)
    fl = E.floor_load(dict(slab=t_slab, live=live))
    beams_allow = 1.5
    D = fl['D'] + beams_allow
    Droof = D - 0.6
    Lroof = 1.0
    P_serv_max = max((D + live) * t['area'] * (floors - 1) + (Droof + Lroof) * t['area'] for t in trib)
    Ag = 1.35 * P_serv_max * 1000.0 / (0.35 * fc)
    cb = max(300.0, math.ceil(math.sqrt(Ag / 1.25) / 50.0) * 50.0)
    ch = max(300.0, math.ceil(cb * 1.25 / 50.0) * 50.0)
    col_sw = cb * ch / 1e6 * 24.0 * hs * floors

    loads = []
    for t in trib:
        Ps = (D + live) * t['area'] * (floors - 1) + (Droof + Lroof) * t['area'] + col_sw
        Pu = (1.2 * D + 1.6 * live) * t['area'] * (floors - 1) + \
             (1.2 * Droof + 1.6 * Lroof) * t['area'] + 1.2 * col_sw
        loads.append(dict(kind=t['kind'], i=t['i'], j=t['j'], x=t['x'], y=t['y'],
                          area=t['area'], P=Ps, Pu=Pu))
    Ps = [l['P'] for l in loads]
    total = sum(Ps)
    Pmax = max(Ps); Pumax = max(l['Pu'] for l in loads)

    # ------------------- الهيكل الفوقي: سقف وجسور وأعمدة -------------------
    slab = design_slab(g, t_slab, fl['D'] - t_slab / 1000.0 * 24.0, live, fc, fy, cb)
    bx = design_beam(g['sx'], g['nx'], g['sy'], fl['D'], live, fc, fy, cb)
    by = design_beam(g['sy'], g['ny'], g['sx'], fl['D'], live, fc, fy, cb)
    Mcol = 0.40 * max(abs(min(s['M'] for s in bx['supports'])),
                      abs(min(s['M'] for s in by['supports'])))
    col_rebar = design_column(cb, ch, Pumax, Mcol, fc, fy)

    # ------------------------- بدائل الأساس -------------------------
    adv = F.advisor(dict(loads=Ps, qa=qa, footprint=fp, floors=floors, Df=Df,
                         spacing=min(g['sx'], g['sy'])))
    q_net = adv['q_net'] or 1.0

    des_i = E.footing_module(dict(PD=Pmax * 0.7, PL=Pmax * 0.3, qa=qa, fc=fc, fy=fy,
                                  cx=cb, cy=ch, Df=Df))
    sizes = []
    for l in loads:
        Bf = math.ceil(math.sqrt(l['P'] / q_net) * 20) / 20.0
        sizes.append(dict(kind=l['kind'], i=l['i'], j=l['j'], x=l['x'], y=l['y'],
                          P=l['P'], B=max(Bf, 1.0)))
    conc_i = sum(s['B'] ** 2 * des_i['h'] / 1000.0 for s in sizes)
    iso = dict(mode='isolated', name='أسس منفردة', typical=des_i, sizes=sizes, conc=conc_i,
               area=sum(s['B'] ** 2 for s in sizes), steel=conc_i * 90.0 / 1000.0,
               ok=(sum(s['B'] ** 2 for s in sizes) <= fp))

    rf = F.raft(dict(total=total, Pmax=Pumax, Lx=g['L'] + 1.0, Ly=g['B'] + 1.0,
                     qa=qa, fc=fc, fy=fy, cx=cb, cy=ch, span=span_max))
    raft_a = dict(mode='raft', name='حصيرة', raft=rf, conc=rf['conc'], area=rf['A'],
                  steel=rf['steel'], ok=rf['ok_press'] and rf['punch_ok'])

    cu = float(p.get('cu') or max(20.0, qa * 0.58))
    Nspt = float(p.get('N') or max(5.0, qa / 10.0))
    cand = [(0.6, 15), (0.6, 20), (0.8, 20), (0.8, 25), (1.0, 25), (1.0, 30), (1.2, 30)]
    if p.get('pile_D'):
        cand = [(float(p['pile_D']), float(p.get('pile_L', 15)))]
    pl = None
    for Dp, Lp in cand:
        pl = F.pile(dict(soil='clay' if soil_kind == 'clay' else 'sand', cu=cu, N=Nspt,
                         D=Dp, L=Lp, P=Pmax, kind=p.get('pile_kind', 'bored'),
                         fc=fc, fy=fy, cx=cb))
        if pl['n'] <= 6:
            break
    conc_p = (pl['n'] * len(loads) * math.pi * pl['D'] ** 2 / 4 * pl['L']
              + len(loads) * pl['cap']['conc'])
    piles_a = dict(mode='piles', name='ركائز', pile=pl, total_piles=pl['n'] * len(loads),
                   conc=conc_p, area=len(loads) * pl['cap']['B'] * pl['cap']['L'],
                   steel=conc_p * 100.0 / 1000.0, ok=pl['ok'])

    alts = dict(isolated=iso, raft=raft_a, piles=piles_a)
    rec = 'isolated' if adv['type'] in ('isolated', 'combined') else adv['type']
    design = alts[rec]
    sum_foot_area = design['area']

    # ------------------------- الحفريات والردم -------------------------
    foot_h = (rf['h'] if rec == 'raft' else
              (pl['cap']['h'] * 1000 if rec == 'piles' else des_i['h'])) / 1000.0
    ew = W.earthwork(dict(plot=area, footprint=fp, ground=ground, old_depth=old_depth,
                          Df=Df, foot_h=foot_h, foot_area=sum_foot_area,
                          dig_mode='full' if rec in ('raft', 'piles') else 'trench'))

    # ------------------------- الكميات -------------------------
    conc = design.get('conc', 0.0)
    steel = design.get('steel', conc * 90.0 / 1000.0)
    beam_conc = (bx['section']['b'] * bx['section']['h'] / 1e6 * g['L'] * (g['ny'] + 1)
                 + by['section']['b'] * by['section']['h'] / 1e6 * g['B'] * (g['nx'] + 1)) * floors
    slab_conc = fp * slab['h'] / 1000.0 * floors
    col_conc = cb * ch / 1e6 * hs * floors * len(loads)
    rates = p.get('rates') or {}
    r_ = lambda k, d: float(rates.get(k, d))
    cost = [
        ("حفريات", ew['cut_vol'], "م³", r_('excav', 15000)),
        ("ردم جلمود/مختار", ew['boulder_buy'], "م³", r_('boulder', 18000)),
        ("سبيس مدكوك", ew['subbase_buy'], "م³", r_('subbase', 25000)),
        ("خرسانة نظافة", ew['blinding'], "م³", r_('blinding', 110000)),
        ("خرسانة الأساس", conc, "م³", r_('concrete', 150000)),
        ("حديد الأساس", steel, "طن", r_('steel', 1200000)),
        ("خرسانة الأعمدة", col_conc, "م³", r_('concrete', 150000)),
        ("خرسانة الجسور", beam_conc, "م³", r_('concrete', 150000)),
        ("خرسانة السقوف", slab_conc, "م³", r_('concrete', 150000)),
        ("حديد الهيكل الفوقي", (col_conc * 140 + beam_conc * 120 + slab_conc * 85) / 1000.0,
         "طن", r_('steel', 1200000)),
    ]
    rows = [dict(name=a, q=b, unit=c, rate=d, cost=b * d) for a, b, c, d in cost]
    grand = sum(x['cost'] for x in rows)

    # ------------------------- الزلازل -------------------------
    seis = E.seismic(dict(city=p.get('city', 'بغداد'), site=p.get('site', 'D'), hn=hs * floors,
                          W=total, stories=[dict(name='طابق %d' % k, w=total / floors, h=hs * k)
                                            for k in range(1, floors + 1)]))

    # ------------------------- نموذج العرض ثلاثي الأبعاد -------------------
    model = dict(
        floors=floors, story_h=hs, levels=[k * hs for k in range(floors + 1)],
        col=dict(b=cb, h=ch, rebar=col_rebar),
        beams=dict(x=dict(b=bx['section']['b'], h=bx['section']['h'], rebar=bx['rebar']),
                   y=dict(b=by['section']['b'], h=by['section']['h'], rebar=by['rebar'])),
        slab=dict(h=slab['h'], kind=slab['kind'], mesh=slab['mesh'], name=slab['kind_name']),
    )

    summary = [
        "القطعة %.0f م² · البناء %.0f م² · %d طوابق بارتفاع %.2f م" % (area, fp, floors, hs),
        "شبكة الأعمدة %d × %d بحر (%.2f × %.2f م) — عدد الأعمدة %d" % (g['nx'], g['ny'], g['sx'], g['sy'], g['cols']),
        "عمود %d×%d مم %s · جسور %d×%d و %d×%d مم · %s سماكة %d مم" % (
            cb, ch, col_rebar['label'], bx['section']['b'], bx['section']['h'],
            by['section']['b'], by['section']['h'], slab['kind_name'], slab['h']),
        "الحمل الكلي على التربة %.0f kN · أثقل عمود %.0f kN" % (total, Pmax),
        "التوصية: %s" % adv['name'],
    ]
    return dict(input=dict(area=area, floors=floors, use=use, qa=qa, soil=soil_name,
                           ground=ground, old_depth=old_depth, Df=Df, fc=fc, fy=fy,
                           story_h=hs, coverage=cover, city=p.get('city', 'بغداد')),
                grid=g, footprint=fp, loads=loads, total=total, Pmax=Pmax, Pumax=Pumax,
                floor=dict(D=D, L=live, Droof=Droof, slab=t_slab, items=fl['items'],
                           beams=beams_allow),
                col=dict(b=cb, h=ch, sw=col_sw, rebar=col_rebar, Mu=Mcol),
                slab=slab, beams=dict(x=bx, y=by),
                advisor=adv, alts=alts, recommended=rec, design=design, model=model,
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
