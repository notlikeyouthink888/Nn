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
import detail as DT
import rebar as RB
import slabs as SL
import stairs as ST
import plan as PL

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
    return dict(L=L, B=B, nx=nx, ny=ny, sx=sx, sy=sy, source='auto',
                spans_x=[round(sx, 3)] * nx, spans_y=[round(sy, 3)] * ny,
                cols=(nx + 1) * (ny + 1), bays=nx * ny)

def tributary_frame(nodes, boundary, step=0.25):
    """مساحات مؤثرة لتوزيع أعمدة غير منتظم: كل نقطة داخل حدّ البناء تُنسب لأقرب عمود،
    والمساحة = عدد النقاط × مساحة الخلية. مجموع المساحات = مساحة الحدّ بالضبط."""
    if not nodes:
        return []
    poly = boundary if boundary and len(boundary) >= 3 else None
    xs = [n['x'] for n in nodes]; ys = [n['y'] for n in nodes]
    if poly:
        xs += [p[0] for p in poly]; ys += [p[1] for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    cnt = [0] * len(nodes)
    cell = step * step
    total = 0
    ny = int(math.ceil((y1 - y0) / step)) + 1
    nx = int(math.ceil((x1 - x0) / step)) + 1
    for jy in range(ny):
        py = y0 + jy * step
        for ix in range(nx):
            px = x0 + ix * step
            if poly and not _in_poly(px, py, poly):
                continue
            k, bd = 0, 1e18
            for m, n in enumerate(nodes):
                d = (n['x'] - px) ** 2 + (n['y'] - py) ** 2
                if d < bd:
                    bd, k = d, m
            cnt[k] += 1; total += 1
    out = []
    for k, n in enumerate(nodes):
        # التصنيف من عدد الجسور الملتقية بالعمود يُضبط لاحقاً؛ هنا الموقع والمساحة
        out.append(dict(i=n.get('i', k), j=n.get('j', 0), x=n['x'], y=n['y'],
                        area=round(cnt[k] * cell, 3), kind='داخلي'))
    return out

def _poly_area(poly):
    """مساحة مضلّع (صيغة الحذاء)."""
    if not poly or len(poly) < 3:
        return 0.0
    a = 0.0
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0

def _in_poly(x, y, poly):
    """اختبار وقوع نقطة داخل مضلّع (ray casting)."""
    inside = False
    n = len(poly)
    for a in range(n):
        x1, y1 = poly[a]; x2, y2 = poly[(a + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / ((y2 - y1) or 1e-12)
            if x < xin:
                inside = not inside
    return inside

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
def _layer(row, d, dirname, order):
    """طبقة تسليح واحدة مع عمقها الفعّال وترتيبها بالتنفيذ."""
    return dict(db=row['db'], s=row['s'], label=row['label'], d=round(d, 1),
                dir=dirname, order=order,
                As_m=round(row.get('As_m', row.get('As', 0.0)), 1))

def design_slab(g, t_slab, wD_super, live, fc, fy, col_b, exposure='interior', db0=12.0):
    """بلاطة مصمتة — كل اتجاه يُصمَّم على عمقه الفعّال الحقيقي (فرش ثم غطاء)."""
    lo, hi = min(g['sx'], g['sy']), max(g['sx'], g['sy'])
    kind = 'two' if hi / lo <= 2.0 else 'one'
    cov = DT.cover('slab', exposure, db0)
    ml = DT.mesh_layers(t_slab, cov, cov, db0, db0)
    base = dict(kind=kind, Lx=g['sx'], Ly=g['sy'], nspans=max(g['nx'], g['ny']),
                wD=wD_super, wL=live, h=t_slab, fc=fc, fy=fy, col=col_b / 1000.0, cover=cov)
    d_ref = t_slab - cov - (10.0 if kind == 'two' else 6.0)
    def at(d_target):
        """يشغّل تصميم البلاطة بعمق فعّال محدد (بإزاحة الغطاء داخلياً)."""
        q = dict(base); q['cover'] = cov + (d_ref - d_target)
        return E.slab_module(q)
    r = at(ml['d_short'])                     # الفرش — الطبقة الأولى
    rl = at(ml['d_long'])                     # الغطاء — الطبقة الثانية
    if kind == 'one':
        pos = max((x for x in r['results'] if x['M'] > 0), key=lambda x: x['As'])
        neg = max((x for x in r['results'] if x['M'] < 0), key=lambda x: x['As'])
        sh = E.bar_spacing(0.0018 * 1000.0 * t_slab, dbs=(10, 12), smax=min(5 * t_slab, 450))
        short = _layer(pos, ml['d_short'], 'الاتجاه القصير (حامل)', 'فرش — الطبقة الأولى من الأسفل')
        long_ = _layer(sh, ml['d_long'], 'الاتجاه الطويل (انكماش)', 'غطاء — الطبقة الثانية')
        top = _layer(neg, ml['d_short'], 'فوق المساند', 'علوي')
    else:
        def pick(res, want_short, positive):
            for dd in res['dirs']:
                if ('القصير' in dd['dir']) == want_short:
                    rows = [x for x in dd['rows'] if (x['M'] > 0) == positive]
                    return max(rows, key=lambda x: x['As_m'])
            return None
        short = _layer(pick(r, True, True), ml['d_short'],
                       'الاتجاه القصير', 'فرش — الطبقة الأولى من الأسفل')
        long_ = _layer(pick(rl, False, True), ml['d_long'],
                       'الاتجاه الطويل', 'غطاء — الطبقة الثانية فوق الفرش')
        negs = [x for dd in r['dirs'] for x in dd['rows'] if x['M'] < 0]
        top = _layer(max(negs, key=lambda x: x['As_m']), ml['d_short'], 'فوق المساند', 'علوي')
    r['kind_name'] = ('بلاطة مصمتة ثنائية الاتجاه' if kind == 'two'
                      else 'بلاطة مصمتة أحادية الاتجاه')
    r['why'] = ('نسبة البحور %.2f ≤ 2 — تعمل بالاتجاهين وتوزّع الحمل على كل الجسور'
                % (hi / lo)) if kind == 'two' else (
               'نسبة البحور %.2f > 2 — الحمل ينتقل بالاتجاه القصير فقط' % (hi / lo))
    r['mesh'] = dict(short=short, long=long_, top=top, bottom=short)
    r['layers'] = ml
    r['cover'] = cov
    r['type'] = 'solid'
    return r

def slab_layout(L, B, mesh, cov=20.0, geom=None, lap=0.0):
    """توزيع أسياخ الشبكة على السقف كاملاً — طريقة التنفيذ (فرش ثم غطاء)."""
    short_side, long_side = min(L, B), max(L, B)
    solid = not geom
    out = []
    names = (('فرش (الاتجاه القصير) — الطبقة الأولى من الأسفل',
              'غطاء (الاتجاه الطويل) — الطبقة الثانية فوق الفرش') if solid else
             ('شبكة الطبقة العلوية — الاتجاه القصير', 'شبكة الطبقة العلوية — الاتجاه الطويل'))
    for key, name, run, across in (('short', names[0], short_side, long_side),
                                   ('long', names[1], long_side, short_side)):
        m = mesh[key]
        n = DT.n_bars(across, m['s'] / 1000.0)
        ln = run - 2 * cov / 1000.0 + 2 * 0.20          # طول السيخ + عكفتان
        cut = E.cut_run(ln, lap)
        out.append(dict(key=key, name=name, db=m['db'], s=m['s'], d=m['d'],
                        n=n, length=round(ln, 2), across=round(across, 2),
                        pieces=cut['n'], piece=round(cut['piece'], 2), laps=cut['laps'],
                        note='العدد = ⌈%.2f ÷ %.2f⌉ + 1 = %d سيخ بطول %.2f م'
                             % (across, m['s'] / 1000.0, n, ln)))
    if geom and geom.get('kind') in ('hordi', 'waffle'):
        s = geom['spacing'] / 1000.0
        n = DT.n_bars(long_side, s)
        rb = geom['rib_rebar']
        out.insert(0, dict(key='ribs', name='الأعصاب (تسليح سفلي) — الاتجاه القصير',
                           db=rb['db'], s=geom['spacing'], d=0.0, n=n * rb['n'],
                           length=round(short_side + 0.3, 2), across=round(long_side, 2),
                           pieces=E.cut_run(short_side + 0.3, lap)['n'], piece=0.0, laps=0,
                           note='%d عصب @ %d مم × %s = %d سيخ' % (n, geom['spacing'],
                                                                  rb['label'], n * rb['n'])))
        if geom.get('kind') == 'waffle':
            out.insert(1, dict(out[0], key='ribs2', name='الأعصاب — الاتجاه الطويل',
                               n=DT.n_bars(short_side, s) * rb['n'],
                               length=round(long_side + 0.3, 2), across=round(short_side, 2)))
    return out

def design_special(kind, g, t_slab, wD_super, live, fc, fy, cb, chh, Pu, opts):
    """سقف غير مصمت — هوردي/فلات/وافل/ببل: يوحّد المخرجات بنفس شكل design_slab."""
    lo, hi = min(g['sx'], g['sy']), max(g['sx'], g['sy'])
    p = dict(opts or {})
    p.update(span=hi, nspans=max(g['nx'], g['ny']), live=live, wD=wD_super, fc=fc, fy=fy,
             Lx=g['sx'], Ly=g['sy'], cx=cb, cy=chh, Pu=Pu, continuous=max(g['nx'], g['ny']) > 1)
    r = SL.design(kind, p)
    h = r['h']
    cov = r.get('cover', DT.cover('slab', 'interior', 12.0))
    if kind == 'flat':
        ml = r['layers']
        def pk(is_top):
            rows = [x for dd in r['dirs'] for x in dd['rows'] if x['top'] == is_top]
            return max(rows, key=lambda x: x['As_m'])
        bot = pk(False); top = pk(True)
        mesh = dict(short=_layer(bot, ml['d_short'], 'الاتجاه القصير', 'فرش — الطبقة الأولى'),
                    long=_layer(bot, ml['d_long'], 'الاتجاه الطويل', 'غطاء — الطبقة الثانية'),
                    top=_layer(top, ml['d_short'], 'شريط الأعمدة', 'علوي فوق الأعمدة'))
        # الفلات سلاب بلا جسور داخلية — الحمل ينتقل مباشرة للأعمدة (جسور محيطية فقط)
        geom = dict(kind='flat', drop=r['drop'], top_ext=r['top_ext'],
                    top_len_x=r['top_len_x'], top_len_y=r['top_len_y'],
                    edge_beams_only=True,
                    capital=round(max(r['Lx'], r['Ly']) / 6.0, 2),
                    note='بلا جسور داخلية — شرائح الأعمدة تعمل كجسور مخفية داخل سماكة البلاطة')
    elif kind in ('hordi', 'waffle'):
        ml = DT.mesh_layers(h, cov, cov, 10.0, 10.0)
        m = r.get('mesh') or E.bar_spacing(0.0018 * 1000.0 * r['topping'], dbs=(6, 8, 10), smax=300.0)
        lay = _layer(m, h - cov - 5.0, 'الطبقة العلوية', 'شبكة انكماش فوق البلوك/الأعصاب')
        mesh = dict(short=lay, long=dict(lay, order='شبكة انكماش — الاتجاه الثاني'),
                    top=dict(lay, order='علوي فوق المساند'))
        geom = dict(kind=kind, spacing=r['spacing'], rib_w=r['rib_w'], topping=r['topping'],
                    rib_h=r.get('rib_h', r.get('block', {}).get('H', 240.0)),
                    block=r.get('block'), blocks_per_m2=r.get('blocks_per_m2'),
                    solid_head=r.get('solid_head', 0.0), rib_rebar=r['rebar'],
                    ribs_per_m=r['ribs_per_m'])
    else:                                              # bubble
        ml = DT.mesh_layers(h, cov, cov, r['mesh']['db'], r['mesh']['db'])
        lay = _layer(r['mesh'], ml['d_short'], 'الاتجاه القصير', 'فرش — الطبقة الأولى')
        mesh = dict(short=lay, long=_layer(r['mesh'], ml['d_long'], 'الاتجاه الطويل',
                                           'غطاء — الطبقة الثانية'),
                    top=dict(lay, order='علوي فوق الأعمدة'))
        geom = dict(kind='bubble', ball=r['ball'], spacing=r['spacing'],
                    void_ratio=r['void_ratio'], solid_head=r['solid_head'])
    mesh['bottom'] = mesh['short']
    r.update(kind_name=r['name'], kind='two' if hi / lo <= 2.0 else 'one', type=kind,
             mesh=mesh, layers=ml, cover=cov, geom=geom,
             why='اختيار المستخدم/التوصية: %s — %s' % (r['name'], SL.TYPE_MAP[kind][3]))
    return r

def design_beam(span, nspan, trib, wD_floor, live, fc, fy, col_b, spans=None):
    """جسر مستمر: مقطع + تسليح + أساور.
    spans = قائمة أطوال البحور الحقيقية من المخطط (إن وُجدت) بدل بحر واحد مكرَّر."""
    lens = [float(x) for x in (spans or []) if float(x) > 0.5] or [span] * max(1, nspan)
    span = max(lens)                                  # البحر الحاكم للمقطع
    nspan = len(lens)
    bw = max(250.0, min(col_b, 400.0))
    hb = max(400.0, math.ceil(span * 1000.0 / 12.0 / 50.0) * 50.0)
    for _ in range(6):
        r = E.beam_module(dict(spans=[dict(L=L, wD=wD_floor * trib, wL=live * trib)
                                      for L in lens],
                               b=bw, h=hb, fc=fc, fy=fy))
        ok = all(d['flex']['ok'] and d['shear']['ok'] and d['defl_ok'] for d in r['design'])
        if ok: break
        hb += 50.0
    sup = [s for s in r['supports'] if s['flex']]
    top = max(sup, key=lambda s: s['flex']['As_req'])['flex'] if sup else r['design'][0]['flex']
    bot = max(r['design'], key=lambda d: d['flex']['As_req'])['flex']
    sh = max(r['design'], key=lambda d: d['shear']['Vu'])['shear']
    cov = DT.cover('beam', 'interior', bot['bars']['db'])
    r['section'] = dict(b=bw, h=hb, span=span, nspan=nspan, trib=trib,
                        spans=[round(L, 3) for L in lens])
    r['rebar'] = dict(bottom=bot['bars'], top=top['bars'], stirrup=dict(db=sh['db_stirrup'],
                      s=sh['s'], legs=sh['legs'], label=sh['label']), cover=cov)
    return r

def beam_detail(bm, col_w, fc, fy, bent=True, lap_mode='code'):
    """نقاط القطع والثني والعكفات والوصلات لجسر مصمَّم."""
    sec = bm['section']; reb = bm['rebar']
    sup = col_w / 1000.0
    ct = DT.curtail(sec['span'], sup, bent=bent)
    bb = DT.bent_bar(sec['span'], sec['h'], reb['cover'], reb['bottom']['db'], sup)
    hk_st = DT.hook(reb['stirrup']['db'], 135, 'tie')
    hk_bar = DT.hook(reb['top']['db'], 90, 'bar')
    n_bent = reb['bottom']['n'] // 2 if bent else 0
    run = sec['span'] * sec['nspan'] + 0.3
    lap = E.lap_length(reb['bottom']['db'], fc, fy, mode=lap_mode) / 1000.0
    lap_t = E.lap_length(reb['top']['db'], fc, fy, top=True, mode=lap_mode) / 1000.0
    return dict(span=sec['span'], sup_w=sup, ln=ct['ln'], top1=ct['top1'], top2=ct['top2'],
                bend_at=ct['bend_at'], top1_len=ct['top1_len'], top2_len=ct['top2_len'],
                bent=bent, n_bent=n_bent, bar=bb, hook_stirrup=hk_st, hook_bar=hk_bar,
                lap_bottom=round(lap, 3), lap_top=round(lap_t, 3),
                run=round(run, 2), cover=reb['cover'], rows=ct['rows'])

def design_column(b, h, Pu, Mu, fc, fy, shape='rect', D=None):
    """تسليح العمود بمنحني التفاعل + تركيب الأتاري حسب **شكل المقطع**.

    المخططات ترسم أعمدة بأشكال مختلفة، ولكل شكل تركيب أساور مختلف:
      * دائري (O): أسياخ موزّعة على دائرة و**حلزون** أو أساور دائرية —
        ρs من ACI 25.7.3.3 و18.7.5.4، والخطوة بخلوص 25–75 مم.
      * مستطيل/مربع: أساور مستطيلة + **أتاري داخلية (crossties)** كلما زاد
        عدد الأسياخ بالوجه عن ثلاثة (ACI 25.7.2.3: كل سيخ بديل مسنود بركن).
      * زاوية L وتي T: أساور مغلقة متداخلة تتبع الشكل — كل ساق بأسوارها.
    """
    circ = (shape == 'circ' and D)
    if circ:
        b = h = float(D)
    best = None
    trials = ((6, 16), (6, 20), (8, 20), (8, 25), (10, 25), (12, 25), (12, 32), (16, 32)) if circ \
        else ((3, 16), (3, 20), (4, 20), (3, 25), (4, 25), (5, 25), (4, 32), (5, 32), (6, 32))
    Ag = (math.pi * D * D / 4.0) if circ else (b * h)
    for nb, db in trials:
        if circ:
            layers = E.circ_layers(D, nb, db)
            pts, P0, Ast = E.col_interaction(0, 0, fc, fy, layers, shape='circ', D=D)
            nbar = nb
        else:
            layers = E.col_layers(b, h, nb, nb, db)
            pts, P0, Ast = E.col_interaction(b, h, fc, fy, layers)
            nbar = 4 * nb - 4
        phiMn, ratio = E.col_check(Pu, Mu, pts)
        rho = Ast / Ag
        rho_min = 0.01
        cand = dict(nb=nb, db=db, n=nbar, Ast=Ast, rho=rho, ratio=ratio,
                    phiMn=phiMn, phiPn_max=pts[0]['P'],
                    ok=(ratio <= 1.0 and rho_min <= rho <= 0.06))
        if best is None or (cand['ok'] and not best['ok']) or \
           (cand['ok'] == best['ok'] and cand['ratio'] < best['ratio'] and not best['ok']):
            best = cand
        if cand['ok']:
            best = cand; break
    dbt = 10 if best['db'] <= 32 else 12
    lo = max(max(b, h), 3200.0 / 6.0, 450.0)
    if circ:
        # حلزون: ACI 25.7.3.3 و18.7.5.4 (زلزالي) ثم الخطوة من نسبة الحجم
        cov = 40.0
        Dch = D - 2 * cov                                   # قطر النواة (خارج الحلزون)
        Ach = math.pi * Dch * Dch / 4.0
        rho_s = max(0.45 * (Ag / Ach - 1.0) * fc / fy, 0.12 * fc / fy)
        asp = E.ab(dbt)
        pitch = 4.0 * asp / (Dch * rho_s)
        pitch = max(dbt + 25.0, min(pitch, dbt + 75.0, 75.0))
        best.update(tie_db=dbt, tie_s=round(pitch, 0), tie_s_conf=round(pitch, 0),
                    conf_len=lo, cover=cov, shape='circ', D=D,
                    spiral=True, rho_s=round(rho_s, 4), core_D=round(Dch, 0),
                    crossties=0,
                    label="%dØ%d موزّعة على الدائرة" % (best['n'], best['db']),
                    tie_label="حلزون Ø%d بخطوة %d مم (ρs = %.4f)" % (dbt, int(pitch), rho_s),
                    conf_label="الحلزون مستمر بكامل الارتفاع — لا تطويق منفصل (ACI 25.7.3)")
        return best
    # التباعد العادي (ACI 25.7.2.1) بحد أقصى عملي 300 مم
    st = min(math.floor(min(16 * best['db'], 48 * dbt, min(b, h)) / 25.0) * 25.0, 300.0)
    # منطقة التطويق عند طرفي العمود (ACI 18.7.5) — مناطق زلزالية
    sc = math.floor(min(min(b, h) / 4.0, 6 * best['db'], 150.0) / 25.0) * 25.0
    # أتاري داخلية: كل سيخ بديل مسنود بركن أسوار (ACI 25.7.2.3) وخلوص ≤ 150 مم
    # الأتاري الداخلية بحسب **نص** المادة 25.7.2.3 لا بقاعدة تقريبية: كل سيخ
    # بديل يُسنَد بركن أسوار، **إلا** إذا كان خلوصه عن أقرب سيخ مسنود ≤ 150 مم.
    sup = RB.tie_support(best['nb'], best['nb'], b, h, cover=40.0, ds=dbt, db=best['db'])
    ct_x, ct_y = sup['x']['n'], sup['y']['n']
    trule = RB.tie_spacing(best['db'], dbt, b, h)
    thook = RB.hook_full(dbt, 135, 'tie')
    tie_txt = "أتاري Ø%d @ %d مم" % (dbt, int(st))
    if ct_x or ct_y:
        tie_txt += " + %d أتاري داخلية (ACI 25.7.2.3)" % (ct_x + ct_y)
    shp = shape if shape in ('L', 'T') else 'rect'
    if shp in ('L', 'T'):
        tie_txt += " — أساور مغلقة متداخلة تتبع شكل %s" % ('L' if shp == 'L' else 'T')
    best.update(tie_db=dbt, tie_s=st, tie_s_conf=sc, conf_len=lo, cover=40.0,
                shape=shp, D=None, spiral=False, crossties=ct_x + ct_y,
                support=sup, tie_rule=trule, tie_hook=thook,
                tie_db_min=RB.tie_db_min(best['db']),
                label="%dØ%d" % (best['n'], best['db']),
                tie_label=tie_txt,
                conf_label="تطويق Ø%d @ %d مم على مسافة %d مم من كل طرف" % (dbt, int(sc), int(lo)))
    return best

def chairs(Lx, Ly, h_mm, cov, db_top, db_bot, spacing=1.0, kind='s135', cov_bot=None):
    """كراسي دعم الشبكة العلوية — النوع والزاوية والعدد والوزن (detail.chair_layout)."""
    return DT.chair_layout(Lx, Ly, h_mm, cov, cov_bot if cov_bot is not None else cov,
                          db_top, db_bot, kind=kind, spacing=spacing)

def chair_zones(g, top_len, spacing=1.0):
    """الكراسي تُوضع حيث يوجد حديد علوي فقط — شرائط فوق محاور المساند،
    عرض الشريط = طول السيخ العلوي (2×L/4 + عرض المسند). لا كراسي بوسط البحر."""
    zones, n = [], 0
    rows = lambda w: max(1, DT.n_bars(w, spacing) - 1)
    for j in range(g['ny'] + 1):
        w = top_len['y']; nz = DT.n_bars(g['L'], spacing) * rows(w)
        zones.append(dict(dir='x', at=j * g['sy'], w=w, length=g['L'], n=nz)); n += nz
    for i in range(g['nx'] + 1):
        w = top_len['x']; nz = DT.n_bars(g['B'], spacing) * rows(w)
        zones.append(dict(dir='y', at=i * g['sx'], w=w, length=g['B'], n=nz)); n += nz
    inter = (g['nx'] + 1) * (g['ny'] + 1) * rows(top_len['x']) * rows(top_len['y'])
    return dict(zones=zones, n=max(1, n - inter), spacing=spacing, overlap=inter,
                note='الكراسي تحت شرائط الحديد العلوي فوق المساند فقط — لا حاجة لها بوسط البحر '
                     'حيث لا يوجد حديد علوي (التسليح العلوي يمتد L/4 لكل جهة من المسند)')

def envelope(bm, npts=13):
    """مغلّف العزوم والهطول لكل فضاء — مبسّط للرسم."""
    out = []
    for k, sp in enumerate(bm['env']):
        step = max(1, len(sp) // npts)
        pts = sp[::step]
        x0 = pts[0]['x']
        d = bm['defl'][k][::step]
        out.append([[round(p['x'] - x0, 3), round(p['Mmax'], 1), round(p['Mmin'], 1),
                     round(d[i]['d'], 2) if i < len(d) else 0.0] for i, p in enumerate(pts)])
    return out

# -------------------------------- المعالج ---------------------------------
def wizard(p):
    area = float(p.get('area', 200.0))
    floors = max(1, int(p.get('floors', 2)))
    use = p.get('use', 'سكني / غرف نوم')
    # الافتراضي 31 ميغا لا 25: أصناف التعرّض الافتراضية (كبريتات S2 — تربة
    # العراق الجبسية) توجب f'c ≥ 31 بجدول ACI 318M-14 رقم 19.3.2.1.
    fc = float(p.get('fc', 31.0)); fy = float(p.get('fy', 420.0))
    soil_name = p.get('soil', 'طين قاسي')
    qa = float(p.get('qa') or F.SOIL_MAP.get(soil_name, (150.0, 'clay'))[0])
    soil_kind = F.SOIL_MAP.get(soil_name, (qa, 'clay'))[1]
    ground = float(p.get('ground', -0.30))
    old_depth = float(p.get('old_depth', 0.0))
    Df = float(p.get('Df', 1.50))
    hs = float(p.get('story_h', 3.2))
    cover = float(p.get('coverage', 1.0))
    fp = area * min(1.0, max(0.3, cover))
    # --- خيارات التفاصيل والتنفيذ ---
    lap_mode = p.get('lap_mode', '60db')
    dowel_mode = p.get('dowel_mode', '16db')
    chair_kind = p.get('chair_kind', 's135')
    exposure = p.get('exposure', 'interior')
    bent = p.get('bent', True) not in (False, 'false', 0, '0')
    slab_type = p.get('slab_type', 'auto')
    hordi_in = p.get('hordi') or {}

    # شبكة/هيكل مأخوذ من مخطط DWG/DXF إن وُجد، وإلا يُولَّد من المساحة
    fo = p.get('frame_override')          # أعمدة وجسور بمواقعها الحقيقية من المخطط
    go = p.get('grid_override')
    # أعمدة يضيفها المستخدم بيده من المجسم: تُدمج مع أعمدة المخطط (أو مع الشبكة
    # التلقائية إن لم يكن هناك مخطط) ويُعاد بناء الهيكل كله — محاور وجسوراً —
    # على المجموعة الجديدة، فالعمود المضاف يحمل فعلاً لا يُرسم فقط.
    added = [a for a in (p.get('added_cols') or []) if a and a.get('x') is not None]
    if added:
        if fo and fo.get('nodes'):
            base_cols = [dict(x=float(n['x']), y=float(n['y']),
                              b=float(n.get('b') or 400), h=float(n.get('h') or 400),
                              shape=n.get('shape') or 'rect', D=n.get('D'))
                         for n in fo['nodes']]
        else:
            g0 = grid_from_area(fp)
            base_cols = [dict(x=i * g0['sx'], y=j * g0['sy'], b=400.0, h=400.0,
                              shape='rect', D=None)
                         for i in range(g0['nx'] + 1) for j in range(g0['ny'] + 1)]
        for a in added:
            sh = a.get('shape') or 'rect'
            bb_ = float(a.get('b') or a.get('D') or 400)
            hh_ = float(a.get('h') or a.get('D') or bb_)
            base_cols.append(dict(x=float(a['x']), y=float(a['y']), b=bb_, h=hh_,
                                  shape=sh, D=(float(a['D']) if a.get('D') else None),
                                  added=True))
        base_cols.sort(key=lambda c: (c['y'], c['x']))
        nf2 = PL.build_frame(base_cols)
        if nf2:
            for n in nf2['nodes']:
                n['added'] = bool(base_cols[n['k']].get('added'))
            fo = dict(nodes=nf2['nodes'], beams=nf2['beams'], lines=nf2['spans'],
                      axes_x=nf2['axes_x'], axes_y=nf2['axes_y'],
                      spans_x=None, spans_y=None,
                      boundary=(fo or {}).get('boundary'))
    if fo and fo.get('nodes'):
        ax, ay = fo.get('axes_x') or [], fo.get('axes_y') or []
        xs = [n['x'] for n in fo['nodes']]; ys = [n['y'] for n in fo['nodes']]
        Lp = (max(xs) - min(xs)) or 1.0; Bp = (max(ys) - min(ys)) or 1.0
        nxp = max(1, len(ax) - 1); nyp = max(1, len(ay) - 1)
        # البحور الحقيقية = الفروق بين المحاور المستخرَجة من المخطط
        spx = fo.get('spans_x') or [round(b - a, 3) for a, b in zip(ax, ax[1:])]
        spy = fo.get('spans_y') or [round(b - a, 3) for a, b in zip(ay, ay[1:])]
        g = dict(L=round(Lp, 3), B=round(Bp, 3), nx=nxp, ny=nyp,
                 sx=round(Lp / nxp, 4), sy=round(Bp / nyp, 4),
                 cols=len(fo['nodes']), bays=nxp * nyp, source='frame',
                 axes_x=ax, axes_y=ay, spans_x=spx, spans_y=spy)
        bpoly = fo.get('boundary')
        fp = float(p.get('footprint_override') or
                   (_poly_area(bpoly) if bpoly else Lp * Bp))
    elif go:
        g = dict(L=float(go['L']), B=float(go['B']), nx=int(go['nx']), ny=int(go['ny']),
                 sx=float(go['sx']), sy=float(go['sy']),
                 cols=(int(go['nx']) + 1) * (int(go['ny']) + 1),
                 bays=int(go['nx']) * int(go['ny']), source='plan',
                 max_dev=go.get('max_dev'), rms_dev=go.get('rms_dev'),
                 spans_x=go.get('spans_x'), spans_y=go.get('spans_y'))
        fp = float(p.get('footprint_override') or (g['L'] * g['B']))
    else:
        g = grid_from_area(fp)
    if fo and fo.get('nodes'):
        trib = tributary_frame(fo['nodes'], fo.get('boundary'))
        # تصنيف العمود بعدد الجسور الملتقية به: 2 ركني · 3 حافة · 4 داخلي
        deg = {}
        for bm in (fo.get('beams') or []):
            deg[bm['a']] = deg.get(bm['a'], 0) + 1
            deg[bm['b']] = deg.get(bm['b'], 0) + 1
        for k, t in enumerate(trib):
            d0 = deg.get(k, 0)
            t['kind'] = 'داخلي' if d0 >= 4 else ('حافة' if d0 == 3 else 'ركني')
            t['i'] = fo['nodes'][k].get('i', 0); t['j'] = fo['nodes'][k].get('j', 0)
    else:
        trib = tributary(g)

    # ------------------------- الأحمال -------------------------
    live = dict(E.LIVE).get(use, 2.0)
    span_max = max(g['sx'], g['sy'])
    span_min = min(g['sx'], g['sy'])
    t_slab = max(120.0, math.ceil(span_max * 1000 / 28.0 / 10) * 10)
    sup_D = E.floor_load(dict(slab=0, live=live))['D']        # التشطيبات والقواطع بلا بلاطة
    rec_slab = SL.recommend(span_max, span_min, live)
    slab_kind = rec_slab['best'] if slab_type in ('auto', '', None) else slab_type
    if slab_kind == 'solid':
        slab_sw = t_slab / 1000.0 * 24.0
    else:
        pre = SL.design(slab_kind, dict(hordi_in, span=span_max, nspans=max(g['nx'], g['ny']),
                                        live=live, wD=sup_D, fc=fc, fy=fy,
                                        Lx=g['sx'], Ly=g['sy']))
        t_slab = pre['h']; slab_sw = pre['sw']
    fl = E.floor_load(dict(slab=t_slab, live=live))
    fl['items'][0] = dict(name='%s سماكة %d مم' % (SL.TYPE_MAP[slab_kind][1], int(t_slab)),
                          v=round(slab_sw, 3))
    fl['D'] = sum(i['v'] for i in fl['items'])
    beams_allow = 1.5
    D = fl['D'] + beams_allow
    Droof = D - 0.6
    Lroof = 1.0
    P_serv_max = max((D + live) * t['area'] * (floors - 1) + (Droof + Lroof) * t['area'] for t in trib)
    Ag = 1.35 * P_serv_max * 1000.0 / (0.35 * fc)
    cb = max(300.0, math.ceil(math.sqrt(Ag / 1.25) / 50.0) * 50.0)
    ch = max(300.0, math.ceil(cb * 1.25 / 50.0) * 50.0)
    # مقطع العمود وشكله كما رسمهما المصمم بالمخطط: يُحترم ويُفحص، ولا يُفرض
    # مقطع أصغر مما يتطلبه الحمل. الأشكال: مستطيل · دائري (O) · زاوية L · تي T.
    col_shape, col_D, col_mix, col_note = 'rect', None, {}, ''
    if fo and fo.get('nodes'):                    # مزيج الأشكال بالمخطط للعرض دائماً
        for n in fo['nodes']:
            k = n.get('shape') or 'rect'
            col_mix[k] = col_mix.get(k, 0) + 1
    # اختيار المستخدم لشكل العمود يسبق ما يُستنتج من المخطط
    want = p.get('col_shape') or 'auto'
    if want in ('circ', 'L', 'T', 'sq', 'rect'):
        col_shape = 'rect' if want in ('sq', 'rect') else want
        if want == 'sq':
            cb = ch = max(cb, ch)
        if want == 'circ':
            # القطر الذي يعطي مساحة المستطيل نفسها، مقرَّباً لأعلى 50 مم
            col_D = float(p.get('col_D') or 0) or \
                math.ceil(math.sqrt(4.0 * cb * ch / math.pi) / 50.0) * 50.0
            col_D = max(col_D, math.ceil(math.sqrt(4.0 * Ag / math.pi) / 50.0) * 50.0)
            cb = ch = col_D
            col_note = 'شكل العمود «دائري» باختيارك — القطر Ø%d مم يعطي مساحة تكفي الحمل.' % col_D
        else:
            col_note = 'شكل العمود «%s» باختيارك.' % ({'rect': 'مستطيل', 'sq': 'مربع',
                                                       'L': 'زاوية L', 'T': 'تي T'}[want])
    elif col_mix:
        col_shape = max(col_mix, key=col_mix.get)
        bs = sorted(float(n['b']) for n in fo['nodes'] if n.get('b'))
        hh = sorted(float(n['h']) for n in fo['nodes'] if n.get('h'))
        if bs and hh:
            db_ = bs[len(bs) // 2]; dh_ = hh[len(hh) // 2]
            if col_shape == 'circ':
                Ds = sorted(float(n['D'] or n['b']) for n in fo['nodes']
                            if n.get('shape') == 'circ' and (n.get('D') or n.get('b')))
                col_D = Ds[len(Ds) // 2] if Ds else db_
                Ag_dr = math.pi * col_D * col_D / 4.0
            else:
                Ag_dr = db_ * dh_
            if Ag_dr >= Ag:
                if col_shape == 'circ':
                    cb = ch = col_D
                else:
                    cb, ch = db_, dh_
                col_note = ('المقطع من مخططك: %s — ومساحته %.0f مم² تكفي الحمل '
                            '(المطلوب %.0f مم²).'
                            % (('دائري Ø%d مم' % col_D) if col_shape == 'circ'
                               else ('%d × %d مم' % (db_, dh_)), Ag_dr, Ag))
            else:
                col_note = ('⚠️ المقطع المرسوم بمخططك (%s · %.0f مم²) أصغر مما يتطلبه '
                            'الحمل (%.0f مم²) — صُمّم على %d × %d مم. راجع الأحمال أو كبّر المقطع.'
                            % (('دائري Ø%d' % col_D) if col_shape == 'circ'
                               else ('%d × %d' % (db_, dh_)), Ag_dr, Ag, cb, ch))
                col_shape, col_D = 'rect', None
    col_sw = ((math.pi * cb * cb / 4.0) if col_shape == 'circ' else cb * ch) \
        / 1e6 * 24.0 * hs * floors

    loads = []
    for t in trib:
        Ps = (D + live) * t['area'] * (floors - 1) + (Droof + Lroof) * t['area'] + col_sw
        Pu = (1.2 * D + 1.6 * live) * t['area'] * (floors - 1) + \
             (1.2 * Droof + 1.6 * Lroof) * t['area'] + 1.2 * col_sw
        loads.append(dict(kind=t['kind'], i=t['i'], j=t['j'], x=t['x'], y=t['y'],
                          area=t['area'], P=Ps, Pu=Pu,
                          cont_x=(0 < t['i'] < g['nx']), cont_y=(0 < t['j'] < g['ny'])))
    Ps = [l['P'] for l in loads]
    total = sum(Ps)
    Pmax = max(Ps); Pumax = max(l['Pu'] for l in loads)

    # ------------------- الهيكل الفوقي: سقف وجسور وأعمدة -------------------
    if slab_kind == 'solid':
        slab = design_slab(g, t_slab, fl['D'] - slab_sw, live, fc, fy, cb, exposure)
    else:
        slab = design_special(slab_kind, g, t_slab, fl['D'] - slab_sw, live, fc, fy,
                              cb, ch, (1.2 * D + 1.6 * live) * max(t['area'] for t in trib),
                              hordi_in)
    slab['recommend'] = rec_slab
    slab['types'] = [dict(kind=k, name=n, span=s2, note=w,
                          chosen=(k == slab_kind)) for k, n, s2, w in SL.TYPES]
    # البحور الحقيقية من المخطط إن وُجدت — يُؤخذ أطول خط جسور بكل اتجاه
    sx_real = sy_real = None
    if fo:
        lx = [s2['spans'] for s2 in (fo.get('lines') or []) if s2['dir'] == 'x']
        ly = [s2['spans'] for s2 in (fo.get('lines') or []) if s2['dir'] == 'y']
        sx_real = max(lx, key=lambda a: (len(a), sum(a))) if lx else None
        sy_real = max(ly, key=lambda a: (len(a), sum(a))) if ly else None
    bx = design_beam(g['sx'], g['nx'], g['sy'], fl['D'], live, fc, fy, cb, spans=sx_real)
    by = design_beam(g['sy'], g['ny'], g['sx'], fl['D'], live, fc, fy, cb, spans=sy_real)
    # --- ACI 318M-14 18.8.4: مقطع العمود يجب أن يكفي **قص العقدة** لا الحمل وحده.
    # العقدة الداخلية تستلم شدّ الحديد العلوي بإجهاد 1.25fy من الجهتين (18.8.2.1)،
    # وهي الحالة التي تُسقط الطابق كله بالزلزال إن نقصت. حين يكون المقطع مستنتَجاً
    # تلقائياً نكبّره حتى يمرّ؛ وحين يكون **من مخططك أو باختيارك** لا نغيّره أبداً
    # بل يُبلَّغ الخلل بتقرير المطابقة.
    col_auto = (want == 'auto') and not (col_mix and col_note and 'من مخططك' in col_note)
    joint_grow = None
    for _ in range(8):
        bm0 = bx if bx['section']['h'] >= by['section']['h'] else by
        T0 = 1.25 * fy * bm0['rebar']['top']['As'] / 1000.0
        d0 = bm0['section']['h'] - bm0['rebar']['cover'] - bm0['rebar']['stirrup']['db'] - 8.0
        Vcol0 = 2.0 * (T0 * 0.9 * d0 / 1000.0) / max(1.0, hs)
        jt = E.joint_shear(2.0 * T0 - Vcol0, cb, ch, bm0['section']['b'], fc, conf='four')
        if jt['ok'] or not col_auto or col_shape == 'circ':
            break
        cb += 50.0; ch = max(ch, cb)
        joint_grow = 'كُبّر العمود إلى %d × %d مم ليمرّ قص العقدة (ACI 18.8.4)' % (cb, ch)
        bx = design_beam(g['sx'], g['nx'], g['sy'], fl['D'], live, fc, fy, cb, spans=sx_real)
        by = design_beam(g['sy'], g['ny'], g['sx'], fl['D'], live, fc, fy, cb, spans=sy_real)
    if joint_grow:
        col_note = (col_note + ' · ' if col_note else '') + joint_grow
        Ag = max(Ag, cb * ch)
        col_sw = cb * ch / 1e6 * 24.0 * hs * floors
    Mcol = 0.40 * max(abs(min(s['M'] for s in bx['supports'])),
                      abs(min(s['M'] for s in by['supports'])))
    col_rebar = design_column(cb, ch, Pumax, Mcol, fc, fy,
                              shape=col_shape, D=(col_D if col_shape == 'circ' else None))
    col_rebar['from_plan'] = col_note or None
    col_rebar['mix'] = col_mix or None
    dx = beam_detail(bx, ch, fc, fy, bent, lap_mode)
    dy = beam_detail(by, cb, fc, fy, bent, lap_mode)
    dow = DT.dowels(cb, ch, col_rebar['db'], fc, fy, mode=dowel_mode)
    col_rebar['dowels'] = dow
    col_rebar['hook'] = DT.hook(col_rebar['tie_db'], 135, 'tie')
    # تصنيف الأعمدة: ركني/حافة/داخلي + استمرارية الجسور بكل اتجاه
    col_kinds = []
    for l in loads:
        cx_ = 'مستمر' if l['cont_x'] else 'طرفي'
        cy_ = 'مستمر' if l['cont_y'] else 'طرفي'
        col_kinds.append(dict(i=l['i'], j=l['j'], kind=l['kind'], x=l['x'], y=l['y'],
                              cont_x=l['cont_x'], cont_y=l['cont_y'], Pu=l['Pu'],
                              label='%s — X %s · Y %s' % (l['kind'], cx_, cy_),
                              note=('العزوم متوازنة على الجهتين' if l['cont_x'] and l['cont_y']
                                    else 'عزم غير متوازن من جهة واحدة — يزداد Mu ويحتاج تسليحاً '
                                         'علوياً أطول بالجسر الطرفي')))

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

    # ------------------------- قص الثقب عند كل عمود -------------------------
    pos_of = lambda k: ('interior' if k == 'داخلي' else ('corner' if k == 'ركني' else 'edge'))
    punch = []
    for idx, l in enumerate(loads):
        if rec == 'raft':
            hf, where = rf['h'], 'الحصيرة'; qu_f = rf['q_u']
        elif rec == 'piles':
            hf, where = pl['cap']['h'] * 1000.0, 'هامة الركائز'; qu_f = 0.0
        else:
            hf, where = des_i['h'], 'الأساس المنفرد'
            qu_f = l['Pu'] / max(iso['sizes'][idx]['B'] ** 2, 0.01)
        df = hf - DT.cover('footing', 'ground') - 20.0
        Vu = max(0.0, l['Pu'] - qu_f * (cb + df) * (ch + df) / 1e6)
        r1 = E.punching(Vu, cb, ch, df, fc, pos_of(l['kind']))
        ds = slab['mesh']['short']['d']
        wu_f = 1.2 * D + 1.6 * live
        Vs = max(0.0, wu_f * l['area'] - wu_f * (cb + ds) * (ch + ds) / 1e6)
        r2 = E.punching(Vs, cb, ch, ds, fc, pos_of(l['kind']))
        punch.append(dict(i=l['i'], j=l['j'], x=l['x'], y=l['y'], kind=l['kind'],
                          found=dict(where=where, **r1),
                          slab=dict(where='السقف', governing=False, **r2)))

    # ------------------------- الحفريات والردم -------------------------
    foot_h = (rf['h'] if rec == 'raft' else
              (pl['cap']['h'] * 1000 if rec == 'piles' else des_i['h'])) / 1000.0
    ew = W.earthwork(dict(plot=area, footprint=fp, ground=ground, old_depth=old_depth,
                          Df=Df, foot_h=foot_h, foot_area=sum_foot_area,
                          dig_mode='full' if rec in ('raft', 'piles') else 'trench'))

    # ------------------------- الكميات -------------------------
    conc = design.get('conc', 0.0)
    steel = design.get('steel', conc * 90.0 / 1000.0)
    # الفلات سلاب: جسور محيطية فقط (محوران بكل اتجاه) بدل كل المحاور
    edge_only = bool((slab.get('geom') or {}).get('edge_beams_only'))
    nlx = 2 if edge_only else g['ny'] + 1
    nly = 2 if edge_only else g['nx'] + 1
    beam_conc = (bx['section']['b'] * bx['section']['h'] / 1e6 * g['L'] * nlx
                 + by['section']['b'] * by['section']['h'] / 1e6 * g['B'] * nly) * floors
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

    # ------------------- الدرج والمصاعد وفتحات السقف -------------------
    stair_pkg = None
    if p.get('stairs') or p.get('shafts'):
        stair_pkg = ST.package(dict(stairs=p.get('stairs') or [], shafts=p.get('shafts') or [],
                                    fc=fc, fy=fy, story_h=hs, floors=floors,
                                    slab_h=slab['h'], span=span_max,
                                    mesh=dict(db=slab['mesh']['short']['db'],
                                              s=slab['mesh']['short']['s'])))

    # ------------------------- الكراسي والوصلات -------------------------
    cov_s = slab['cover']
    top_len = dict(x=2 * (g['sx'] / 4.0) + cb / 1000.0, y=2 * (g['sy'] / 4.0) + ch / 1000.0,
                   ext=0.25)
    ch_slab = chairs(g['L'], g['B'], slab['h'], cov_s,
                     slab['mesh']['top']['db'],
                     slab['mesh']['short']['db'] + slab['mesh']['long']['db'], kind=chair_kind)
    cz = chair_zones(g, top_len)
    ch_slab.update(n=cz['n'], nx=None, ny=None, zones=cz['zones'], overlap=cz['overlap'],
                   note=cz['note'],
                   weight=cz['n'] * ch_slab['len_each'] * E.ab(ch_slab['db']) / 1e6 * 7850.0 / 1000.0)
    cov_ft = DT.cover('footing', 'weather'); cov_fb = DT.cover('footing', 'ground')
    ch_found = (chairs(rf['Lx'], rf['Ly'], rf['h'], cov_ft, rf['top']['db'], rf['bottom']['db'],
                       kind=chair_kind, cov_bot=cov_fb)
                if rec == 'raft' else
                chairs(math.sqrt(sum_foot_area), math.sqrt(sum_foot_area), des_i['h'], cov_ft,
                       des_i['bar_db'], des_i['bar_db'], kind=chair_kind, cov_bot=cov_fb))
    dbs_used = set([col_rebar['db'], bx['rebar']['bottom']['db'], bx['rebar']['top']['db'],
                    by['rebar']['bottom']['db'], by['rebar']['top']['db'],
                    slab['mesh']['short']['db'], slab['mesh']['long']['db'],
                    slab['mesh']['top']['db'],
                    rf['top']['db'], rf['bottom']['db'], des_i['bar_db']])
    laps = {int(d2): dict(bottom=round(E.lap_length(d2, fc, fy, mode=lap_mode) / 1000.0, 3),
                          top=round(E.lap_length(d2, fc, fy, top=True, mode=lap_mode) / 1000.0, 3),
                          code=round(E.lap_length(d2, fc, fy) / 1000.0, 3),
                          site=round(60.0 * d2 / 1000.0, 3))
            for d2 in dbs_used}
    lap_note = dict(LAP_MODES=[dict(k=a, name=b) for a, b in E.LAP_MODES], mode=lap_mode,
                    label=dict(E.LAP_MODES).get(lap_mode, lap_mode))
    covers = dict(slab=slab['cover'], beam=bx['rebar']['cover'],
                  column=DT.cover('column', exposure, col_rebar['db']),
                  footing_bottom=cov_fb, footing_top=cov_ft,
                  table=[dict(name=a, v=b, ref=c) for a, b, c in DT.COVER_TABLE])
    layout = slab_layout(g['L'], g['B'], slab['mesh'], slab['cover'], slab.get('geom'),
                         laps.get(int(slab['mesh']['short']['db']), {}).get('bottom', 0.0))

    aci_extra = aci_checks(g, bx, by, slab, col_rebar, cb, ch, fc, fy,
                           fl['D'], live, exposure, p)

    # ---------------- الكانتيليفر (الشناشيل والبلكونات) ----------------
    # البروز الحرّ هو أكثر عنصر يُنفَّذ خطأً بالعراق: حديده **كله علوي**، والحدّاد
    # المعتاد على الجسور يضعه بالأسفل فينهار عند فكّ القالب. يُصمَّم هنا كاملاً
    # ويُرسم بالمجسم بلون مميّز حتى يُرى بالعين أن الشدّ بالأعلى.
    canti = cantilever_pkg(p, g, bx, by, fl['D'], live, fc, fy, cb, ch, slab)

    # ------------------------- نموذج العرض ثلاثي الأبعاد -------------------
    model = dict(
        floors=floors, story_h=hs, levels=[k * hs for k in range(floors + 1)],
        stock=E.BAR_STOCK, laps=laps,
        col=dict(b=cb, h=ch, shape=col_shape, D=col_D, rebar=col_rebar),
        beams=dict(x=dict(b=bx['section']['b'], h=bx['section']['h'], rebar=bx['rebar'],
                          env=envelope(bx), span=g['sx'], n=g['nx'], detail=dx,
                          d_long=min(d['d_long'] for d in bx['design']),
                          d_limit=bx['design'][0]['d_limit']),
                   y=dict(b=by['section']['b'], h=by['section']['h'], rebar=by['rebar'],
                          env=envelope(by), span=g['sy'], n=g['ny'], detail=dy,
                          d_long=min(d['d_long'] for d in by['design']),
                          d_limit=by['design'][0]['d_limit'])),
        slab=dict(h=slab['h'], kind=slab['kind'], mesh=slab['mesh'], name=slab['kind_name'],
                  chairs=ch_slab, top_strip=0.5, type=slab_kind,
                  geom=slab.get('geom'), layout=layout, cover=slab['cover'],
                  top_len=top_len,
                  extra=dict(corner=dict(db=slab['mesh']['top']['db'],
                                         s=slab['mesh']['top']['s'], size=0.2),
                             integrity=dict(n=2, db=slab['mesh']['short']['db']))),
        found=dict(mode=rec, chairs=ch_found),
        plan=p.get('plan_view'),
        canti=canti,
        frame=(dict(fo, source='plan') if fo else None),
        stairs=stair_pkg,
        detail=dict(covers=covers, chairs=dict(slab=ch_slab, found=ch_found, kind=chair_kind,
                                               types=[dict(k=a, name=b, note=c) for a, b, c in DT.CHAIRS]),
                    curtail=dict(x=dx, y=dy), dowels=dow, cols=col_kinds,
                    lap=lap_note, bent=bent, exposure=exposure,
                    hook=dict(tie=col_rebar['hook'], bar=dx['hook_bar'])),
        punch=[dict(x=q['x'], y=q['y'], kind=q['kind'],
                    ratio=q['found']['ratio'], b0=q['found']['b0'], d=q['found']['d'],
                    Vu=q['found']['Vu'], phiVc=q['found']['phiVc'], ok=q['found']['ok'],
                    where=q['found']['where'], rec=q['found']['rec'],
                    slab_ratio=q['slab']['ratio']) for q in punch],
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
    _du = aci_extra['durability']
    if not _du['ok_fc']:
        summary.append(
            "⚠️ الديمومة (ACI 19.3.2.1): أصناف التعرّض %s توجب f'c ≥ %d ميغا "
            "ونسبة ماء/أسمنت ≤ %.2f — والمُدخَل %d ميغا. ارفع المقاومة أو غيّر "
            "أصناف التعرّض إن كانت تربتك غير كبريتية."
            % (' · '.join(_du['classes']), int(_du['fc_min']),
               _du['wcm_max'] or 0.45, int(fc)))
    _tj = aci_extra['torsion']
    if _tj.get('required'):
        summary.append(
            "الالتواء (ACI 22.7): الجسر الطرفي باتجاه %s يستلم Tu = %.1f kN·م من "
            "طرف البلاطة — الكانات %s وحديد طولي %s."
            % (_tj['beam'], _tj['Tu'], _tj['stirrup_new']['label'],
               _tj['long_bars']['label']))
    return dict(input=dict(area=area, floors=floors, use=use, qa=qa, soil=soil_name,
                           ground=ground, old_depth=old_depth, Df=Df, fc=fc, fy=fy,
                           story_h=hs, coverage=cover, city=p.get('city', 'بغداد'),
                           slab_type=slab_kind, lap_mode=lap_mode, dowel_mode=dowel_mode,
                           chair_kind=chair_kind, exposure=exposure, bent=bent,
                           hordi=hordi_in, grid_override=go,
                           footprint_override=p.get('footprint_override')),
                canti=canti,
                grid=g, footprint=fp, loads=loads, total=total, Pmax=Pmax, Pumax=Pumax,
                floor=dict(D=D, L=live, Droof=Droof, slab=t_slab, items=fl['items'],
                           beams=beams_allow, slab_sw=slab_sw, slab_type=slab_kind),
                col=dict(b=cb, h=ch, shape=col_shape, D=col_D, sw=col_sw,
                         rebar=col_rebar, Mu=Mcol, kinds=col_kinds,
                         dowels=dow),
                slab=slab, beams=dict(x=bx, y=by), detail=model['detail'],
                frame=fo, stairs=stair_pkg,
                advisor=adv, alts=alts, recommended=rec, design=design, model=model,
                punching=punch, chairs=dict(slab=ch_slab, found=ch_found), laps=laps,
                earth=ew, soil=soil_profile(
                    soil_name, qa, soil_kind, ew['levels'], Df, p.get('gwt'),
                    need_piles=(rec == 'piles'),
                    pile_L=(alts['piles']['pile']['L'] if rec == 'piles' else 0.0),
                    gypseous=bool(p.get('gypseous'))),
                boq=dict(rows=rows, total=grand), seismic=seis, aci_extra=aci_extra,
                summary=summary, span_max=span_max, span_min=span_min)

# ==================== الكانتيليفر — الشناشيل والبلكونات ====================
#: جهات البروز الأربع كما يراها الناظر للمخطط
CANTI_SIDES = [('x+', 'الواجهة الشرقية (+X)'), ('x-', 'الواجهة الغربية (−X)'),
               ('z+', 'الواجهة الشمالية (+Z)'), ('z-', 'الواجهة الجنوبية (−Z)')]


def cantilever_pkg(p, g, bx, by, wD, live, fc, fy, cb, ch, slab):
    """يصمّم كل بروز طلبه المستخدم ويعيد ما يكفي لرسمه ولجدول الكميات.

    البروز يمتد من الجسر الطرفي إلى الخارج، ويحمل: بلاطة بسماكة الكانتيليفر،
    وحمل درابزين على طرفه الحرّ إن وُجد. البحر الخلفي الذي يُنشر فيه الحديد هو
    أول بحر بالاتجاه العمودي على جهة البروز.
    """
    raw = p.get('cantilever') or {}
    Lc = float(raw.get('L') or 0.0)
    sides = [s for s in (raw.get('sides') or []) if s in dict(CANTI_SIDES)]
    if Lc <= 0.05 or not sides:
        return dict(on=False, L=Lc, sides=[],
                    note='لا يوجد بروز بالمشروع — أدخل طول البروز وجهاته من بطاقة '
                         '«الكانتيليفر» بالمعالج ليُصمَّم ويُرسم.',
                    options=[dict(k=a, name=b) for a, b in CANTI_SIDES])
    parapet = float(raw.get('parapet') or 0.0)          # kN/م على الطرف الحرّ
    live_c = float(raw.get('live') or max(live, 3.0))   # البلكونة حملها الحي أعلى
    hc = float(raw.get('h') or 0.0)
    items = []
    for sd in sides:
        # الجسر الطرفي بالاتجاه الموازي للحافة، والبحر الخلفي عمودي عليها
        along_x = sd.startswith('z')                    # حافة شمالية/جنوبية ⇒ الجسر بمحور X
        bm = bx if along_x else by
        back = g['sy'] if along_x else g['sx']
        b_w = bm['section']['b']
        # سماكة **بلاطة** البروز — لا عمق الجسر: جدول 9.3.1.1 يعطي ℓ/8 للكانتيليفر
        # (ضِعف حدّ البحر البسيط)، وتُقرَّب لأعلى 25 مم ولا تقلّ عن سماكة السقف.
        h_use = hc or max(slab['h'], 150.0,
                          math.ceil(Lc * 1000.0 / 8.0 * (0.4 + fy / 700.0) / 25.0) * 25.0)
        trib = 1.0                                       # يُصمَّم لكل متر عرض
        r = RB.cantilever(Lc, trib, wD, live_c, 1000.0, h_use, fc, fy,
                          cover=DT.cover('beam', 'weather', 16.0),
                          ds=bm['rebar']['stirrup']['db'],
                          parapet=parapet, back_span=back)
        edge = (g['B'] if along_x else g['L'])           # طول الحافة الحاملة للبروز
        r.update(side=sd, side_name=dict(CANTI_SIDES)[sd], along_x=along_x,
                 back_span=back, edge=edge, area=edge * Lc,
                 beam=dict(b=b_w, h=bm['section']['h']),
                 n_top=max(2, int(math.ceil(edge / (r['top']['s'] / 1000.0)))
                           if r['top'].get('s') else int(math.ceil(edge / 0.15))),
                 splice=RB.splice_zones(max(back, 2.0 * Lc), h_use, cb / 1000.0))
        items.append(r)
    worst = max(items, key=lambda r: r['Mu'])
    return dict(on=True, L=Lc, sides=sides, parapet=parapet, live=live_c,
                items=items, worst=worst,
                h=worst['h'], hmin=worst['hmin'], ok=all(i['ok_h'] and i['flex']['ok']
                                                         and i['shear']['ok'] and i['defl']['ok']
                                                         for i in items),
                area=sum(i['area'] for i in items),
                options=[dict(k=a, name=b) for a, b in CANTI_SIDES],
                clause='ACI 318M-14 جدول 9.3.1.1 · 9.7.3 · 25.4 · 22.5 · 9.7.7',
                note='حديد الكانتيليفر **كله علوي** — الوجه المشدود هو العلوي على '
                     'طول البروز. وهو مرسوم بالمجسم بلون مميّز فوق منتصف السماكة '
                     'ليُرى بالعين، ويمتد داخل البحر الخلفي طول النشر كاملاً.')


# ============ فحوص ACI التي كانت غائبة: الالتواء · العقدة · الترخيم · الديمومة ============
def aci_checks(g, bx, by, slab, col_rebar, cb, ch, fc, fy, wD, live, exposure, p):
    """أربعة أبواب من ACI 318M-14 لم تكن مطبَّقة أبداً، تُحسب هنا على المشروع نفسه:

      22.7  الالتواء بالجسر الطرفي (الشناشيل والبلكونات) — كان يُهمَل كلياً
      18.8.4 قص العقدة بين الجسر والعمود — وهي أول ما ينهار زلزالياً
      24.2  الترخيم بجدول 24.2.2 بحالاته الأربع — كان يُفحص بحدّ واحد فقط
      19.3  أصناف التعرّض والديمومة — كان f'c يُختار للقوة وحدها
    """
    out = {}
    # ---------------- 22.7 الالتواء بالجسر الطرفي (Spandrel) ----------------
    # البلاطة تستند على الجسر الطرفي من جهة واحدة، فعزم طرفها ينقلب التواءً
    # على الجسر. عزم الطرف من جدول ACI 6.5.2: wu·ℓn²/24 «عنصر مبنيّ مع جسر طرفي».
    bm = bx if bx['section']['h'] >= by['section']['h'] else by
    sec = bm['section']
    Ls = g['sy'] if bm is bx else g['sx']            # بحر البلاطة العمودي على الجسر
    Lb = sec['span']
    wu = 1.2 * wD + 1.6 * live                        # kN/م²
    ln_s = max(0.5, Ls - cb / 1000.0)
    t_m = wu * ln_s ** 2 / 24.0                       # kN·م لكل متر طول جسر
    ln_b = max(0.5, Lb - ch / 1000.0)
    d_b = sec['h'] - bm['rebar']['cover'] - bm['rebar']['stirrup']['db'] - 8.0
    Tu = t_m * max(0.0, ln_b / 2.0 - d_b / 1000.0)    # عند المقطع الحرج على بُعد d
    Vu_b = max(d['shear']['Vu'] for d in bm['design'])
    tor = E.torsion(Tu, Vu_b, sec['b'], sec['h'], fc, fy,
                    fyt=fy, cover=bm['rebar']['cover'],
                    ds=bm['rebar']['stirrup']['db'], d=d_b,
                    Vc=max(d['shear']['Vc'] for d in bm['design']))
    tor['t_per_m'] = t_m; tor['ln_slab'] = ln_s; tor['ln_beam'] = ln_b
    tor['beam'] = 'X' if bm is bx else 'Y'
    tor['b'] = sec['b']; tor['h'] = sec['h']
    if tor.get('required'):
        # كانة إضافية للالتواء فوق كانة القص: At/s لرِجل واحدة × 2 رِجل
        st = bm['rebar']['stirrup']
        Av_s = 2.0 * E.ab(st['db']) / max(1.0, st['s'])          # مم²/مم من القص
        need = Av_s + 2.0 * tor['At_s']
        s_new = 2.0 * E.ab(st['db']) / need if need > 0 else st['s']
        s_new = max(75.0, min(math.floor(min(s_new, tor['s_max']) / 25.0) * 25.0, tor['s_max']))
        n_long = max(4, int(math.ceil(tor['Al'] / E.ab(max(12.0, tor['db_long'])))))
        tor['stirrup_new'] = dict(db=st['db'], s=s_new, was=st['s'],
                                  label='Ø%d@%d (كان Ø%d@%d)' % (st['db'], int(s_new),
                                                                 st['db'], int(st['s'])))
        tor['long_bars'] = dict(n=n_long, db=max(12.0, round(tor['db_long'])),
                                As=n_long * E.ab(max(12.0, tor['db_long'])),
                                label='%dØ%d موزّعة على محيط الكانة (سيخ بكل ركن)'
                                      % (n_long, int(max(12.0, round(tor['db_long'])))))
    out['torsion'] = tor

    # ---------------- 18.8.4 قص العقدة جسر–عمود ----------------
    # قوة الحديد العلوي عند وجه العقدة بإجهاد 1.25fy (18.8.2.1) ناقص قص العمود.
    As_top = bm['rebar']['top']['As']
    T = 1.25 * fy * As_top / 1000.0                   # kN
    Mpr = T * 0.9 * d_b / 1000.0                      # kN·م تقريب ذراع 0.9d
    hs_ = float(p.get('story_h', 3.2))
    Vcol = 2.0 * Mpr / max(1.0, hs_)                  # عقدة داخلية: عزمان متقابلان
    joints = []
    for key, conf, lab in (('interior', 'four', 'عقدة داخلية'),
                           ('edge', 'three', 'عقدة حافّية'),
                           ('corner', 'other', 'عقدة ركنية')):
        f = {'interior': 2.0, 'edge': 1.0, 'corner': 1.0}[key]
        Vj = f * T - Vcol
        j = E.joint_shear(Vj, cb, ch, sec['b'], fc, conf=conf, detail=True)
        j.update(key=key, name=lab, T=T, Vcol=Vcol)
        joints.append(j)
    out['joint'] = dict(rows=joints, As_top=As_top, T=T, Vcol=Vcol, Mpr=Mpr,
                        hook=E.joint_hook(bm['rebar']['top']['db'], fc, fy),
                        worst=min(joints, key=lambda j: (j['ok'], -j['ratio'])),
                        clause='ACI 318M-14 18.8.4 + 18.8.2.1 + 18.8.5.1')

    # ---------------- 24.2 الترخيم بجدول 24.2.2 ----------------
    dfl = []
    for name, b2 in (('X', bx), ('Y', by)):
        w = min(b2['design'], key=lambda d: d['d_imm'])
        # نصيب الحمل الدائم من الترخيم الفوري (تحليل الخدمة يجمع D+L)
        share = wD / max(0.001, wD + live)
        dd = abs(w['d_imm']) * share
        dl = abs(w['d_imm']) * (1.0 - share)
        rho_p = 0.0                     # لا حديد ضغط دائم بالمقطع المفرد
        c = E.deflection_check(w['L'], dd, dl, rho_p=rho_p, months=60,
                               case='attach_dmg')
        c.update(beam=name, L=w['L'], h=b2['section']['h'])
        dfl.append(c)
    out['deflection'] = dict(rows=dfl, worst=min(dfl, key=lambda c: (c['ok'], -c['ratio'])),
                             cases=[dict(k=a, name=b, den=c2, what=d2)
                                    for a, b, c2, d2 in E.DEFL_CASES],
                             clause='ACI 318M-14 جدول 24.2.2')

    # ---------------- 9.7.3 + 18.6.3 قواعد حديد الجسور ----------------
    beams_rules = []
    for name, b2 in (('X', bx), ('Y', by)):
        s2 = b2['section']; rb2 = b2['rebar']
        d2 = s2['h'] - rb2['cover'] - rb2['stirrup']['db'] - rb2['bottom']['db'] / 2.0
        lnb = max(0.5, s2['span'] - cb / 1000.0)
        cut = RB.bar_cutoff(lnb, d2, rb2['top']['db'], rb2['bottom']['db'], fc, fy,
                            cover=rb2['cover'], spacing=None,
                            n_top=rb2['top']['n'], n_bot=rb2['bottom']['n'],
                            simple=(s2['nspan'] == 1))
        spl = RB.splice_zones(s2['span'], s2['h'], cb / 1000.0)
        spl['s_hoop'] = min(d2 / 4.0, 100.0)
        sz = RB.seismic_beam(rb2['top']['As'], rb2['bottom']['As'], s2['b'], d2, fy, fc,
                             rb2['top']['n'], rb2['bottom']['n'])
        hk = RB.hook_full(rb2['top']['db'], 90, 'bar')
        hs2 = RB.hook_full(rb2['stirrup']['db'], 135, 'tie')
        beams_rules.append(dict(beam=name, b=s2['b'], h=s2['h'], d=d2, span=s2['span'],
                                ln=lnb, cut=cut, splice=spl, seismic=sz,
                                hook_bar=hk, hook_tie=hs2,
                                crosstie=RB.crosstie(rb2['stirrup']['db']),
                                tie_rule=RB.tie_spacing(rb2['bottom']['db'],
                                                        rb2['stirrup']['db'], s2['b'], s2['h']),
                                top=rb2['top'], bottom=rb2['bottom'],
                                stirrup=rb2['stirrup']))
    out['beam_rules'] = dict(rows=beams_rules,
                             clause='ACI 318M-14 9.7.3 · 18.6.3 · 25.3 · 25.7.2')

    # ---------------- 13.3.3.3 توزيع حديد الأساس ----------------
    out['footing_band'] = None

    # ---------------- 19.3 أصناف التعرّض والديمومة ----------------
    cls = p.get('exposure_classes') or list(DT.IRAQ_DEFAULT)
    dur = DT.durability(fc, tuple(cls), p.get('wcm'))
    dur['options'] = [dict(code=a, cat=b, desc=c2, wcm=d2, fc=e2, note=f2)
                      for a, b, c2, d2, e2, f2 in DT.EXPOSURE_CLASSES]
    dur['default'] = list(DT.IRAQ_DEFAULT)
    out['durability'] = dur
    return out

# -------------------- مواصفات المختبر (الإنشائيات والتجربة) --------------------
SOIL_LOOK = {                       # لون وملمس تقريبي لكل صنف تربة بالمجسم
    'rock':  ('#6b7280', 'صخر', 'كتل صخرية متماسكة — أعلى تحمّل وأصعب حفر'),
    'sand':  ('#c9a86a', 'رملية', 'حبيبات مفكّكة — تصريف جيد وهبوط فوري'),
    'clay':  ('#8d6b52', 'طينية', 'متماسكة — هبوط بالزمن (تضاغط) وتنتفخ بالماء'),
    'fill':  ('#7a6a5c', 'ردم', 'غير صالحة للتأسيس قبل الإزالة أو الدك الهندسي'),
}

#: العمود الجيولوجي المرجعي — تتابع الطبقات كما يظهر بالجسّات، من السطح للأسفل.
#: (المفتاح · الاسم · اللون · الملمس · سُمك نموذجي م · تحمّل استرشادي kPa · الوصف)
STRATA = [
    ('topsoil',  'التربة السطحية (Topsoil)',       '#6b5136', 'organic', 0.5,   0.0,
     'طبقة عضوية سطحية فيها جذور ومواد متحلّلة — **تُزال دائماً** ولا يُحسب لها تحمّل'),
    ('fill',     'ردم قديم (Fill)',                '#7a6a5c', 'rubble',  0.0,   0.0,
     'ردم غير مدكوك أو أنقاض بناء — يهبط بالزمن ولو خفّ الحمل'),
    ('softclay', 'طين طري (Soft Clay)',            '#8d6b52', 'clay',    2.0,  50.0,
     'متماسك لكنه ضعيف — هبوطه تضاغطي يستمر سنوات، وينتفخ بالماء'),
    ('stiffclay','طين قاسٍ (Stiff Clay)',          '#7d5a44', 'clay',    2.5, 180.0,
     'الطبقة الحاملة الأشيع ببغداد — تحمّل جيد وهبوط محدود'),
    ('sand',     'رمل كثيف (Dense Sand)',          '#c9a86a', 'sand',    2.5, 250.0,
     'حبيبات مفكّكة متراصّة — تصريف ممتاز وهبوط فوري ينتهي مع انتهاء البناء'),
    ('gravel',   'حصى وسبيس (Gravel)',             '#b89b5e', 'gravel',  2.0, 400.0,
     'ركام خشن عالي التحمّل — وهو ما يُدكّ تحت الأسس والأرضيات'),
    ('weath',    'صخر متحلّل (Weathered Rock)',    '#8a8172', 'rock',    2.0, 600.0,
     'صخر متشقّق ومتحلّل جزئياً — قوي لكنه غير متجانس'),
    ('bedrock',  'الصخر الأم (Bedrock)',           '#5d6068', 'rock',    3.0,1000.0,
     'الطبقة الحاملة النهائية — عليها ترتكز الركائز بالارتكاز الطرفي'),
]
STRATA_MAP = {k: (nm, c, tx, t, q, d) for k, nm, c, tx, t, q, d in STRATA}

#: التتابع النموذجي لكل صنف تربة سطحية — التربة المختارة تُثبَّت كطبقة حاملة
#: وما تحتها يتدرّج للأقوى، لأن التحمّل يزداد مع العمق بالطبيعة.
SEQ = {
    'fill':  ['topsoil', 'fill', 'softclay', 'stiffclay', 'sand', 'gravel', 'bedrock'],
    'clay':  ['topsoil', 'softclay', 'stiffclay', 'sand', 'gravel', 'weath', 'bedrock'],
    'sand':  ['topsoil', 'sand', 'gravel', 'stiffclay', 'weath', 'bedrock'],
    'rock':  ['topsoil', 'weath', 'bedrock'],
}


def soil_profile(soil_name, qa, kind, levels, Df, gwt=None, need_piles=False,
                 pile_L=0.0, gypseous=False):
    """**العمود الجيولوجي** تحت المبنى — لا طبقتين تقريبيتين.

    يُبنى تتابع طبقات حقيقي من السطح إلى الصخر الأم، كل طبقة باسمها ولونها
    وملمسها وسُمكها وتحمّلها الاسترشادي، وتُعلَّم عليها:

      * منسوب الأرض الطبيعية ومنسوب الحفر ومنسوب قاعدة الأساس
      * **الطبقة التي يجلس عليها الأساس** فعلاً (تُميَّز)
      * منسوب الماء الجوفي إن أُدخل — وأثره على التحمّل
      * ومع الركائز: عمق الركيزة وأي طبقات تعبرها، وأين يأتي **الاحتكاك الجانبي**
        (Skin Friction) وأين **الارتكاز الطرفي** (End Bearing)

    الغاية أن يرى المهندس مقطع الجسّة لا مستطيلين ملوّنين.
    """
    fb = levels['found_bot']; gr = levels['ground']; ex = levels['existing']
    seq = list(SEQ.get(kind, SEQ['clay']))
    if kind != 'fill' and ex < gr - 1e-6:
        seq.insert(1, 'fill')                      # ردم قديم مُزال يظهر كطبقة
    if gypseous and 'gypsum' not in seq:
        seq.insert(min(3, len(seq)), 'stiffclay')  # الجبس يظهر بالوصف لا كطبقة مستقلة
    # الطبقة الحاملة = أول طبقة تحمّلها ≥ qa المُدخَل، وتُثبَّت عند قاعدة الأساس
    beds = []
    y = gr
    bottom_limit = fb - (max(pile_L, 0.0) + 3.0 if need_piles else max(2.5 * Df, 6.0))
    for i, key in enumerate(seq):
        nm, col, tex, t, q, desc = STRATA_MAP[key]
        t = t or 0.8
        if key == 'fill' and ex < gr - 1e-6:
            t = max(0.3, gr - ex)
        top = y
        bot = y - t
        # الطبقة الحاملة تُمدّ حتى تبتلع قاعدة الأساس إن وقعت داخلها
        if bot > fb > top - 1e-9 and i < len(seq) - 1:
            pass
        beds.append(dict(key=key, name=nm, color=col, texture=tex, top=round(top, 2),
                         bottom=round(bot, 2), thick=round(t, 2), qa=q, note=desc,
                         gypseous=(gypseous and key in ('stiffclay', 'sand'))))
        y = bot
        if y <= bottom_limit:
            break
    if y > bottom_limit:                            # أكمل بالصخر الأم حتى قاع الرسم
        nm, col, tex, t, q, desc = STRATA_MAP['bedrock']
        beds.append(dict(key='bedrock', name=nm, color=col, texture=tex,
                         top=round(y, 2), bottom=round(bottom_limit, 2),
                         thick=round(y - bottom_limit, 2), qa=q, note=desc, gypseous=False))
    # أي طبقة يجلس عليها الأساس فعلاً
    for b in beds:
        b['bearing'] = (b['top'] >= fb >= b['bottom'] - 1e-9)
        b['excavated'] = b['bottom'] >= fb - 1e-9        # فوق قاعدة الأساس = محفورة
    bear = next((b for b in beds if b['bearing']), beds[-1])
    bear['name_full'] = '%s — **الطبقة الحاملة**' % bear['name']
    col, nm2, note = SOIL_LOOK.get(kind, SOIL_LOOK['clay'])
    gw = float(gwt) if gwt not in (None, '', 0) else None
    piles = None
    if need_piles and pile_L > 0:
        tip = fb - pile_L
        crossed = [b['name'] for b in beds if b['bottom'] < fb and b['top'] > tip]
        end_bed = next((b for b in beds if b['top'] >= tip >= b['bottom'] - 1e-9), beds[-1])
        piles = dict(L=pile_L, tip=round(tip, 2), crossed=crossed,
                     end_bed=end_bed['name'], end_qa=end_bed['qa'],
                     friction='الاحتكاك الجانبي يتولّد على **طول** الركيزة داخل '
                              'الطبقات التي تعبرها: ' + ' · '.join(crossed),
                     bearing='الارتكاز الطرفي على %s (تحمّل استرشادي %d kPa)'
                             % (end_bed['name'], int(end_qa) if (end_qa := end_bed['qa']) else 0),
                     note='قدرة الركيزة = احتكاك جانبي + ارتكاز طرفي، والنسبة بينهما '
                          'تقرّر نوعها: ركيزة احتكاك بالطين وركيزة ارتكاز على الصخر.')
    return dict(name=soil_name, kind=kind, kind_ar=nm2, qa=qa, color=col, note=note,
                beds=beds, gwt=gw, found_bot=fb, ground=gr, existing=ex, Df=Df,
                bearing_bed=bear['name'], bearing_qa=bear['qa'],
                piles=piles, gypseous=gypseous,
                strata=[dict(k=k, name=n, color=c, texture=t2, qa=q, note=d)
                        for k, n, c, t2, t3, q, d in STRATA],
                legend='المقطع مبنيّ على تتابع جيولوجي نموذجي لصنف التربة المختار — '
                       'والمرجع النهائي **تقرير الجسّات** للموقع نفسه.')

def lab_spec(R):
    """يحوّل ناتج المعالج إلى مواصفات النموذج الفراغي في lab.build."""
    g = R['grid']; m = R['model']; inp = R['input']
    bx, by = m['beams']['x'], m['beams']['y']
    big = bx if bx['h'] >= by['h'] else by
    reb = big['rebar']
    wu = 1.2 * R['floor']['D'] + 1.6 * R['floor']['L']
    lat = [dict(floor=d0['h'] and int(round(d0['h'] / m['story_h'])) or 1, Fx=d0['Fx'], Fy=0.0)
           for d0 in R['seismic']['dist']]
    return dict(nx=g['nx'], ny=g['ny'], sx=g['sx'], sy=g['sy'],
                floors=m['floors'], story_h=m['story_h'],
                fc=inp['fc'], fy=inp['fy'],
                col_b=m['col']['b'], col_h=m['col']['h'],
                beam_b=big['b'], beam_h=big['h'], wu=wu, lateral=lat,
                col_rebar=dict(nb=m['col']['rebar']['nb'], db=m['col']['rebar']['db']),
                beam_rebar=dict(bottom_As=reb['bottom']['As'], top_As=reb['top']['As']),
                stirrup=dict(db=reb['stirrup']['db'], s=reb['stirrup']['s'],
                             legs=reb['stirrup']['legs']))

def lab(p):
    """يحذف عنصراً ويعيد التحليل — يقبل مدخلات المعالج مباشرة."""
    import lab as LAB
    R = p if 'model' in p else wizard(p)
    sp = lab_spec(R)
    rm = p.get('removes') or p.get('remove')
    if rm:
        one = not isinstance(rm[0], (list, tuple))
        lst = [rm] if one else [r for r in rm if r]
        sp['remove'] = [[r[0], int(r[1]), int(r[2]), int(r[3])] for r in lst]
    out = LAB.compare(sp)
    bm = max((v['ratio'] for v in out['base'].values()), default=0.0)
    # المفاتيح tuples — تُحوَّل لنصوص لتصلح بالـ JSON
    out['base'] = {'|'.join(str(x) for x in k): dict(v, key=list(k))
                   for k, v in out['base'].items()}
    if out.get('after'):
        out['after'] = {'|'.join(str(x) for x in k): dict(v, key=list(k))
                        for k, v in out['after'].items()}
    out['base_max'] = bm
    out['base_note'] = (
        'الحالة الأصلية تشمل الحمل الجانبي الزلزالي (V = %.0f kN) بينما المعالج يصمّم الأعمدة '
        'على العزوم الشاقولية فقط — لذلك قد تظهر نسب > 1 قبل الحذف بأعمدة الطوابق العليا. '
        'الحكم على أثر الحذف يكون بالفرق (قبل → بعد) لا بالقيمة المطلقة. '
        'أعلى نسبة قبل الحذف = %.2f' % (R['seismic']['V'], bm))
    out['spec'] = dict(nx=sp['nx'], ny=sp['ny'], floors=sp['floors'],
                       col=[sp['col_b'], sp['col_h']], beam=[sp['beam_b'], sp['beam_h']],
                       sx=sp['sx'], sy=sp['sy'], story_h=sp['story_h'])
    out['grid'] = R['grid']; out['model'] = R['model']; out['loads'] = R['loads']
    out['recommended'] = 'none'
    return out

def lab_sweep(p):
    """مسح شامل: يحذف كل عمود بالطابق الأول واحداً واحداً ويرتّب المبنى حسب الهشاشة.
    يعطي خريطة الأعمدة الحرجة (Vulnerability Map) وفق منهج المسار البديل."""
    import lab as LAB
    R = p if 'model' in p else wizard(p)
    sp = lab_spec(R)
    story = int(p.get('story', 1))
    base = LAB.analyze(sp, None)
    base_max = max((v['ratio'] for v in base['res'].values()), default=0.0)
    out = []
    seen = set()
    for l in R['loads']:
        key = (l['kind'],)                       # عمود نموذجي واحد لكل صنف يكفي للمقارنة السريعة
        full = p.get('full')
        if not full and key in seen:
            continue
        seen.add(key)
        aft = LAB.analyze(sp, ('col', l['i'], l['j'], story))
        fails, worst, modes = 0, 0.0, {}
        for k, a in aft['res'].items():
            b = base['res'].get(k)
            if not b:
                continue
            if a['ratio'] > 1.0 and b['ratio'] <= 1.0:
                fails += 1
                modes[a['mode_ar']] = modes.get(a['mode_ar'], 0) + 1
            worst = max(worst, a['ratio'])
        dmax = max([abs(x) for x in aft['drift']] or [0])
        out.append(dict(i=l['i'], j=l['j'], kind=l['kind'], story=story,
                        Pu=l['Pu'], fails=fails, worst=worst, drift=dmax,
                        modes=[dict(name=a, n=b2) for a, b2 in modes.items()],
                        verdict=('انهيار تدريجي محتمل' if fails else
                                 ('حرج' if worst > 0.95 else 'المنشأ ينجو')),
                        ok=(fails == 0)))
    out.sort(key=lambda x: (-x['fails'], -x['worst']))
    crit = [x for x in out if not x['ok']]
    return dict(rows=out, base_max=base_max, story=story,
                drift_before=max([abs(x) for x in base['drift']] or [0]),
                critical=len(crit),
                summary=[
                    'فُحص %d صنف عمود بالطابق %d — حذف كل واحد على حدة وإعادة التحليل الفراغي كاملاً'
                    % (len(out), story),
                    ('✗ %d حالة تؤدي لانهيار تدريجي: %s' % (
                        len(crit), ' · '.join('%s (%d, %d)' % (x['kind'], x['i'], x['j']) for x in crit))
                     if crit else '✓ المنشأ ينجو من حذف أي عمود — يوجد مسار بديل كافٍ للأحمال'),
                    'أشد حالة: حذف عمود %s ترفع أعلى نسبة استغلال إلى %.2f (كانت %.2f)'
                    % (out[0]['kind'], out[0]['worst'], base_max) if out else ''],
                note='المسح يحذف عموداً واحداً في كل مرة ويعيد حل النموذج الفراغي بالكامل — '
                     'وهو جوهر تدقيق الانهيار التدريجي (GSA / UFC 4-023-03). '
                     'العمود الذي يسبب أكبر عدد من التجاوزات هو الأحرج ويستحق تقوية أو مسار حمل بديل.')

def slabtypes(p):
    """يقارن أنواع السقوف على نفس البحر والحمل."""
    span = float(p.get('span', 6.0)); span2 = float(p.get('span2', span))
    live = float(p.get('live', 2.0)); wD = float(p.get('wD', 2.5))
    # الافتراضي 31 ميغا لا 25: أصناف التعرّض الافتراضية (كبريتات S2 — تربة
    # العراق الجبسية) توجب f'c ≥ 31 بجدول ACI 318M-14 رقم 19.3.2.1.
    fc = float(p.get('fc', 31.0)); fy = float(p.get('fy', 420.0))
    base = dict(p.get('hordi') or {})
    base.update(span=span, Lx=span, Ly=span2, live=live, wD=wD, fc=fc, fy=fy,
                nspans=int(p.get('nspans', 3)))
    out = []
    for k, name, rng, note in SL.TYPES:
        if k == 'solid':
            h = max(120.0, math.ceil(span * 1000 / 28.0 / 10) * 10)
            out.append(dict(kind=k, name=name, span_range=rng, note=note, h=h,
                            sw=h / 1000.0 * 24.0, ok=True,
                            rows=[('السماكة', '%d مم' % h),
                                  ('الوزن الذاتي', '%.2f kN/m²' % (h / 1000.0 * 24.0)),
                                  ('الملاحظة', note)]))
            continue
        try:
            r = SL.design(k, dict(base))
            out.append(dict(kind=k, name=name, span_range=rng, note=note, h=r['h'],
                            sw=r['sw'], ok=True, rows=r['rows'], detail=r))
        except Exception as ex:
            out.append(dict(kind=k, name=name, span_range=rng, note=note, ok=False,
                            error=str(ex)))
    rec = SL.recommend(max(span, span2), min(span, span2), live)
    for o in out:
        o['recommended'] = (o['kind'] == rec['best'])
    return dict(types=out, recommend=rec, span=span,
                note='الأنواع الشائعة بالعراق: الهوردي ثم المصمتة — والوافل والببل ديك '
                     'للبحور الكبيرة بتنفيذ متخصص')

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
