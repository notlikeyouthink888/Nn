# -*- coding: utf-8 -*-
"""
تصميم غرفة كاملة — معماري + إنشائي.
الجدران والفتحات وأحمالها · البلاطة (طريقة Grashof للبانل المسند على أربع جهات) ·
الجسور الأربعة · الأعمدة الركنية وأسسها · الكميات ونموذج ثلاثي الأبعاد للغرفة.
"""
import math
import engine as E
import project as P

# الاسم، السماكة (م)، الكثافة kN/m³، عدد الطابوق/م²
WALLS = [
    ("طابوق 240 مم", 0.24, 18.0, 125),
    ("طابوق 120 مم", 0.12, 18.0, 62),
    ("بلوك خرساني 200 مم", 0.20, 14.0, 12.5),
    ("بلوك خرساني 100 مم", 0.10, 14.0, 12.5),
    ("ثرمستون 200 مم", 0.20, 8.0, 8.3),
]
WALL_MAP = {w[0]: w for w in WALLS}
PLASTER = 0.02 * 2 * 20.0        # لبخ الوجهين kN/m²

def _wall_segments(x1, y1, x2, y2, t, z0, z1, ops):
    """يقسّم الجدار إلى كتل حول الفتحات (أرجل + عتبات + جلسات)."""
    Lw = math.hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / Lw, (y2 - y1) / Lw
    segs = []
    def put(a, b, za, zb, tag):
        if b - a < 1e-6 or zb - za < 1e-6: return
        segs.append(dict(x1=x1 + ux * a, y1=y1 + uy * a, x2=x1 + ux * b, y2=y1 + uy * b,
                         z0=za, z1=zb, t=t, tag=tag))
    n = len(ops)
    marks = []
    for i, o in enumerate(ops):
        c = Lw * (i + 0.5) / max(1, n)
        a = max(0.02, c - o['w'] / 2.0); b = min(Lw - 0.02, c + o['w'] / 2.0)
        marks.append((a, b, o))
    cur = 0.0
    for a, b, o in marks:
        put(cur, a, z0, z1, 'pier')
        sill = z0 + (o.get('sill', 0.0))
        head = sill + o['h']
        put(a, b, z0, sill, 'sill')                  # تحت الشباك
        put(a, b, min(head, z1), z1, 'lintel')       # فوق الفتحة
        cur = b
    put(cur, Lw, z0, z1, 'pier')
    return segs, Lw, marks

def room(p):
    L = float(p.get('L', 5.0)); Wd = float(p.get('W', 4.0))
    hs = float(p.get('h', 3.2))
    wall_name = p.get('wall', 'طابوق 240 مم')
    wn, wt, wg, wblk = WALL_MAP.get(wall_name, WALLS[0])
    fc = float(p.get('fc', 25.0)); fy = float(p.get('fy', 420.0))
    use = p.get('use', 'سكني / غرف نوم')
    live = dict(E.LIVE).get(use, 2.0)
    qa = float(p.get('qa') or 150.0); Df = float(p.get('Df', 1.5))
    floors_above = max(1, int(p.get('floors', 1)))
    doors = p.get('doors') or [dict(w=1.0, h=2.1, n=1)]
    windows = p.get('windows') or [dict(w=1.5, h=1.2, n=2, sill=0.9)]

    lo, hi = min(L, Wd), max(L, Wd)
    r = hi / lo
    two_way = r <= 2.0
    # ---------------- البلاطة ----------------
    t_slab = max(120.0, math.ceil((2 * (L + Wd) * 1000 / 180.0) / 10) * 10) if two_way \
        else max(120.0, math.ceil(lo * 1000 / 24.0 / 10) * 10)
    fl = E.floor_load(dict(slab=t_slab, live=live))
    wD = fl['D']; wu = 1.2 * wD + 1.6 * live
    d_s = t_slab - 20.0 - 5.0
    if two_way:                                   # طريقة Grashof للبانل المسند على 4 جهات
        Lx, Ly = lo, hi
        kx = Ly ** 4 / (Lx ** 4 + Ly ** 4); ky = Lx ** 4 / (Lx ** 4 + Ly ** 4)
        Mx = kx * wu * Lx ** 2 / 8.0; My = ky * wu * Ly ** 2 / 8.0
        method = 'طريقة Grashof–Rankine لبانل مسند على أربع جهات'
    else:
        Lx, Ly = lo, hi
        kx, ky = 1.0, 0.0
        Mx = wu * Lx ** 2 / 8.0; My = 0.0018 * 1000 * t_slab * 0.0
        method = 'بلاطة أحادية الاتجاه — الحمل ينتقل بالاتجاه القصير'
    def mesh_for(M):
        f = E.flexure(max(M, 0.1), 1000.0, d_s, fc, fy, t_slab, min_rule='slab')
        As = max(f['As_req'], 0.0018 * 1000.0 * t_slab)
        b = E.bar_spacing(As, dbs=(10, 12, 16), smax=min(3 * t_slab, 450))
        return dict(M=M, As=As, db=b['db'], s=b['s'], label=b['label'], As_prov=b['As'])
    m_short = mesh_for(Mx); m_long = mesh_for(My if two_way else Mx * 0.25)
    m_top = mesh_for(0.5 * max(Mx, My))            # تسليح علوي فوق الجسور
    slab = dict(h=t_slab, two_way=two_way, ratio=r, method=method, wu=wu, wD=wD, wL=live,
                short=m_short, long=m_long, top=m_top, Lx=Lx, Ly=Ly, kx=kx, ky=ky,
                mesh=dict(bottom=m_short, top=m_top))

    # ---------------- الجدران والفتحات ----------------
    ops_all = []
    for o in doors:
        for _ in range(int(o.get('n', 1))):
            ops_all.append(dict(w=float(o['w']), h=float(o['h']), sill=0.0, kind='باب'))
    for o in windows:
        for _ in range(int(o.get('n', 1))):
            ops_all.append(dict(w=float(o['w']), h=float(o['h']),
                                sill=float(o.get('sill', 0.9)), kind='شباك'))
    corners = [(0, 0), (L, 0), (L, Wd), (0, Wd)]
    walls = []
    for i in range(4):
        x1, y1 = corners[i]; x2, y2 = corners[(i + 1) % 4]
        mine = [o for k, o in enumerate(ops_all) if k % 4 == i]
        hw = hs - t_slab / 1000.0
        segs, Lw, marks = _wall_segments(x1, y1, x2, y2, wt, 0.0, hw, mine)
        area_g = Lw * hw
        area_op = sum(o['w'] * o['h'] for o in mine)
        area_net = max(0.0, area_g - area_op)
        udl = (area_net / Lw) * (wt * wg) + (area_net / Lw) * PLASTER
        walls.append(dict(i=i + 1, x1=x1, y1=y1, x2=x2, y2=y2, L=Lw, h=hw, t=wt,
                          openings=[dict(kind=o['kind'], w=o['w'], h=o['h'], sill=o['sill'],
                                         a=a, b=b) for a, b, o in marks],
                          area=area_g, area_open=area_op, area_net=area_net,
                          udl=udl, blocks=int(area_net * wblk),
                          plaster=area_net * 2))
    wall_type = dict(name=wn, t=wt, gamma=wg, blocks_m2=wblk)

    # ---------------- الجسور الأربعة ----------------
    beams = []
    for i, w in enumerate(walls):
        span = w['L']
        other = Wd if i % 2 == 0 else L
        short_dir = (span <= other)
        if two_way:
            w_eq = (wu * lo / 3.0) if short_dir else (wu * lo / 2.0) * (1 - 1 / (3 * r * r))
            share = 'حمل مثلثي' if short_dir else 'حمل شبه منحرف'
        else:
            w_eq = (wu * lo / 2.0) if not short_dir else 0.20 * wu * lo
            share = 'يحمل البلاطة' if not short_dir else 'حمل ثانوي'
        bw = 250.0
        hb = max(400.0, math.ceil(span * 1000 / 12.0 / 50.0) * 50.0)
        for _ in range(6):
            bm = E.beam_module(dict(spans=[dict(L=span, wD=w_eq / 1.45 + w['udl'], wL=0.0)],
                                    b=bw, h=hb, fc=fc, fy=fy))
            if all(d['flex']['ok'] and d['shear']['ok'] and d['defl_ok'] for d in bm['design']):
                break
            hb += 50.0
        des = bm['design'][0]
        beams.append(dict(i=i + 1, span=span, b=bw, h=hb, w_slab=w_eq, w_wall=w['udl'],
                          share=share, Mu=des['Mpos'], Vu=des['Vu'],
                          bottom=des['flex']['bars'], top=E.pick_bars(des['flex']['As_req'] * 0.35,
                                                                     width=bw, nmin=2),
                          stirrup=dict(db=des['shear']['db_stirrup'], s=des['shear']['s'],
                                       legs=des['shear']['legs'], label=des['shear']['label']),
                          defl=des['d_long'], defl_lim=des['d_limit'],
                          x1=w['x1'], y1=w['y1'], x2=w['x2'], y2=w['y2']))

    # ---------------- الأعمدة والأسس ----------------
    Rb = sum(b['span'] * (b['w_slab'] + b['w_wall'] + b['b'] * b['h'] / 1e6 * 24.0) / 2.0
             for b in beams) / 4.0
    Pu_col = 1.25 * Rb * floors_above + 15.0
    Ps_col = Rb * floors_above / 1.2 + 12.0
    Ag = Pu_col * 1000.0 / (0.35 * fc)
    cb = max(300.0, math.ceil(math.sqrt(Ag) / 50.0) * 50.0)
    col_rebar = P.design_column(cb, cb, Pu_col, 0.10 * Pu_col, fc, fy)
    ft = E.footing_module(dict(PD=Ps_col * 0.7, PL=Ps_col * 0.3, qa=qa, fc=fc, fy=fy,
                               cx=cb, cy=cb, Df=Df))
    ch = P.chairs(L, Wd, t_slab, 20.0, m_top['db'], m_short['db'])

    # ---------------- الكميات ----------------
    conc_slab = L * Wd * t_slab / 1000.0
    conc_beam = sum(b['b'] * b['h'] / 1e6 * b['span'] for b in beams)
    conc_col = cb * cb / 1e6 * hs * 4
    conc_ft = 4 * ft['B'] ** 2 * ft['h'] / 1000.0
    blocks = sum(w['blocks'] for w in walls)
    plaster = sum(w['plaster'] for w in walls) + L * Wd
    q = [("خرسانة البلاطة", conc_slab, "م³"), ("خرسانة الجسور", conc_beam, "م³"),
         ("خرسانة الأعمدة", conc_col, "م³"), ("خرسانة الأسس", conc_ft, "م³"),
         ("بناء الجدران", sum(w['area_net'] for w in walls), "م²"),
         ("عدد الطابوق/البلوك", blocks, "قطعة"), ("اللبخ والإكساء", plaster, "م²"),
         ("حديد تقريبي", (conc_slab * 85 + conc_beam * 120 + conc_col * 140 + conc_ft * 90) / 1000.0, "طن")]

    model = dict(kind='room', L=L, W=Wd, h=hs, story_h=hs, floors=1,
                 walls=[dict(segments=_wall_segments(w['x1'], w['y1'], w['x2'], w['y2'], w['t'],
                                                     0.0, w['h'],
                                                     [dict(w=o['w'], h=o['h'], sill=o['sill'])
                                                      for o in w['openings']])[0],
                             i=w['i'], openings=w['openings']) for w in walls],
                 slab=dict(h=t_slab, mesh=dict(bottom=m_short, top=m_top), long=m_long,
                           chairs=ch, name=('بلاطة ثنائية الاتجاه' if two_way else 'بلاطة أحادية الاتجاه')),
                 beams=beams, col=dict(b=cb, h=cb, rebar=col_rebar),
                 foot=dict(B=ft['B'], h=ft['h'], db=ft['bar_db'], s=ft['spacing'],
                           label=ft['bars_label']),
                 laps={int(d): round(E.lap_length(d, fc, fy) / 1000.0, 3)
                       for d in set([col_rebar['db'], m_short['db'], m_top['db'],
                                     ft['bar_db']] + [b['bottom']['db'] for b in beams])},
                 stock=E.BAR_STOCK)

    return dict(input=dict(L=L, W=Wd, h=hs, wall=wn, use=use, fc=fc, fy=fy, qa=qa,
                           floors=floors_above),
                slab=slab, walls=walls, wall_type=wall_type, beams=beams,
                col=dict(b=cb, h=cb, Pu=Pu_col, Ps=Ps_col, rebar=col_rebar),
                foot=ft, chairs=ch, model=model,
                quantities=[dict(name=a, q=b, unit=c) for a, b, c in q],
                summary=[
                    "غرفة %.2f × %.2f م بارتفاع %.2f م — %s" % (L, Wd, hs, wn),
                    "%s سماكة %d مم — %s" % (model['slab']['name'], t_slab, method),
                    "جسور %d×%d مم · أعمدة %d×%d مم %s · أسس %.2f×%.2f م" % (
                        beams[0]['b'], beams[0]['h'], cb, cb, col_rebar['label'], ft['B'], ft['B']),
                    "الفتحات: %d (مساحتها %.1f م²)" % (len(ops_all),
                                                       sum(w['area_open'] for w in walls)),
                ])
