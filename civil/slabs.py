# -*- coding: utf-8 -*-
"""
أنواع السقوف وتصميمها — مصمتة · فلات سلاب · هوردي · وافل · ببل ديك.
ACI 318-19: السماكات الدنيا (7.3.1.1 و8.3.1.1) · الأعصاب كمقاطع T (9.8) ·
قص الثقب (22.6) · التصميم المباشر (8.10).
"""
import math
import engine as E
import detail as D

TYPES = [
    ('solid', 'بلاطة مصمتة (Solid Slab)', '3–7 م', 'الأبسط تنفيذاً · وزن أعلى'),
    ('flat', 'فلات سلاب (Flat Slab)', '5–9 م', 'بلا جسور — قص الثقب حاكم · ارتفاع طابق أقل'),
    ('hordi', 'هوردي (عصبي بالبلوك)', '4–8 م', 'الأشيع بالعراق · وزن أقل 25–35% · عزل حراري'),
    ('waffle', 'وافل (Waffle)', '8–14 م', 'أعصاب متعامدة · بحور كبيرة · قوالب خاصة'),
    ('bubble', 'ببل ديك (Bubble Deck)', '8–14 م', 'كرات تلغي 30–35% من الوزن · تنفيذ متخصص'),
]
TYPE_MAP = {t[0]: t for t in TYPES}

# block_W = البُعد العمودي على العصب (يُضاف لعرض العصب ليعطي التباعد)
# block_L = البُعد باتجاه العصب · block_H = الارتفاع
HORDI_DEFAULT = dict(block_W=400.0, block_L=200.0, block_H=240.0, rib_w=120.0,
                     topping=70.0, block_kg=12.0)

def recommend(span_max, span_min, live, budget='عادي'):
    """يقترح نوع السقف مع السبب."""
    r = span_max / max(span_min, 0.1)
    out = []
    if span_max <= 5.0:
        out.append(('solid', 'البحر %.1f م قصير — المصمتة أبسط وأرخص تنفيذاً' % span_max))
    if 4.0 <= span_max <= 8.0:
        out.append(('hordi', 'البحر %.1f م ضمن المدى المثالي للهوردي — وزن أقل وعزل أفضل' % span_max))
    if 5.0 <= span_max <= 9.0 and r <= 1.5:
        out.append(('flat', 'البحور متقاربة (نسبة %.2f) وبلا حاجة لجسور بارزة — فلات سلاب مناسب' % r))
    if span_max > 8.0:
        out.append(('waffle', 'البحر %.1f م كبير — الوافل يقلل الوزن ويتحمل البحور الكبيرة' % span_max))
        out.append(('bubble', 'بديل للبحور الكبيرة إذا توفر التنفيذ المتخصص'))
    if not out:
        out = [('solid', 'الخيار الافتراضي الآمن')]
    return dict(best=out[0][0], options=[dict(kind=k, why=w, name=TYPE_MAP[k][1]) for k, w in out])

# ------------------------------- الهوردي -------------------------------
def hordi(p):
    q = dict(HORDI_DEFAULT); q.update({k: float(v) for k, v in p.items()
                                       if k in HORDI_DEFAULT and v not in (None, '')})
    span = float(p.get('span', 5.0)); nspan = int(p.get('nspans', 3))
    live = float(p.get('live', 2.0)); wD_super = float(p.get('wD', 2.5))
    fc = float(p.get('fc', 25.0)); fy = float(p.get('fy', 420.0))
    cont = bool(p.get('continuous', nspan > 1))
    bW, bH, bL, rw, top = q['block_W'], q['block_H'], q['block_L'], q['rib_w'], q['topping']
    s = bW + rw                                   # تباعد الأعصاب (مم)
    h = bH + top                                  # السماكة الكلية
    ribs_m = 1000.0 / s
    blocks_m2 = 1e6 / (bL * s)
    conc_m2 = (rw * bH * ribs_m / 1e6) + top / 1000.0      # م³ خرسانة لكل م²
    sw = conc_m2 * 24.0 + blocks_m2 * q['block_kg'] * 9.81 / 1000.0
    hmin = span * 1000.0 / (18.5 if cont else 16.0) * (0.4 + fy / 700.0)
    wu = 1.2 * (wD_super + sw) + 1.6 * live
    w_rib = wu * s / 1000.0                                 # kN/m لكل عصب
    cov = D.cover('joist', 'interior')
    db = float(p.get('db', 16.0))
    d = h - cov - 6.0 - db / 2.0
    bf = min(s, span * 1000.0 / 4.0)                        # عرض الشفة الفعّال (ACI 6.3.2.1)
    Mu = w_rib * span ** 2 / (10.0 if cont else 8.0)
    fl = E.flexure(Mu, bf, d, fc, fy, h)
    fl['bars'] = E.pick_bars(fl['As_req'], dbs=(12, 16, 20), nmin=2, nmax=4, width=rw)
    a = fl['bars']['As'] * fy / (0.85 * fc * bf)
    Vu = w_rib * span / 2.0 * (1.15 if cont else 1.0)
    phiVc = 0.75 * 1.1 * 0.17 * math.sqrt(fc) * rw * d / 1000.0     # ACI 9.8.1.5 (+10%)
    solid_len = 0.0
    if Vu > phiVc:
        x = (Vu - phiVc) / (w_rib if w_rib else 1.0)
        solid_len = max(0.30, math.ceil(x * 20) / 20.0)
    Ash = 0.0018 * 1000.0 * top
    mesh = E.bar_spacing(max(Ash, 100.0), dbs=(6, 8, 10), smax=min(5 * top, 300.0))
    return dict(kind='hordi', name='هوردي (عصبي بالبلوك)', h=h, hmin=hmin, ok_h=h >= hmin,
                block=dict(L=bL, W=bW, H=bH, kg=q['block_kg']), rib_w=rw, spacing=s,
                topping=top, ribs_per_m=ribs_m, blocks_per_m2=blocks_m2,
                conc_per_m2=conc_m2, sw=sw, wu=wu, w_rib=w_rib, span=span, nspan=nspan,
                bf=bf, d=d, Mu=Mu, rebar=fl['bars'], As=fl['As_req'],
                top_bars=E.pick_bars(fl['As_req'] * 0.5, dbs=(10, 12, 16), nmin=1, nmax=3, width=rw),
                Vu=Vu, phiVc=phiVc, shear_ok=Vu <= phiVc or solid_len > 0,
                solid_head=solid_len, mesh=mesh, flange_ok=a <= top,
                cover=cov,
                rows=[('تباعد الأعصاب', '%d مم (بلوك %d + عصب %d)' % (s, bW, rw)),
                      ('السماكة الكلية', '%d مم (بلوك %d + طبقة %d)' % (h, bH, top)),
                      ('الوزن الذاتي', '%.2f kN/m² (مقابل %.2f للمصمتة بنفس السماكة)' % (sw, h / 1000.0 * 24.0)),
                      ('عدد البلوك', '%.1f قطعة/م² (بلوك %d×%d×%d مم)' % (blocks_m2, bW, bL, bH)),
                      ('الخرسانة', '%.3f م³/م²' % conc_m2),
                      ('العصب كمقطع T', 'عرض الشفة %d مم · العنق %d مم · d = %d مم' % (bf, rw, d)),
                      ('تسليح العصب السفلي', fl['bars']['label']),
                      ('القص', 'Vu = %.1f kN مقابل φVc = %.1f kN%s' % (
                          Vu, phiVc, ' → منطقة مصمتة %.2f م عند المسند' % solid_len if solid_len else ' ✓')),
                      ('شبكة الطبقة العلوية', mesh['label'] + ' (حديد انكماش)')],
                note='الأعصاب بلا أساور — لذلك تُصمّم مناطق مصمتة عند المساند إذا تجاوز القص المقاومة، '
                     'ويُصمّم العصب كمقطع T وفق ACI 9.8')

# ----------------------------- الفلات سلاب -----------------------------
def flat(p):
    Lx = float(p.get('Lx', 6.0)); Ly = float(p.get('Ly', 6.0))
    cx = float(p.get('cx', 500.0)); cy = float(p.get('cy', 500.0))
    live = float(p.get('live', 2.0)); wD = float(p.get('wD', 2.5))
    fc = float(p.get('fc', 28.0)); fy = float(p.get('fy', 420.0))
    Pu = float(p.get('Pu', 0.0))
    drop = bool(p.get('drop', False))
    ln = max(Lx, Ly) - max(cx, cy) / 1000.0
    div = (33.0 if drop else 30.0)                       # ACI 8.3.1.1 (طرفي، fy=420)
    hmin = max(ln * 1000.0 / div, 100.0 if drop else 125.0)
    h = float(p.get('h') or math.ceil(hmin / 10.0) * 10.0)
    sw = h / 1000.0 * 24.0
    wu = 1.2 * (wD + sw) + 1.6 * live
    cov = D.cover('slab', 'interior')
    dbb = 12.0
    ml = D.mesh_layers(h, cov, cov, dbb, dbb)
    Pu = Pu or wu * Lx * Ly
    d_avg = (ml['d_short'] + ml['d_long']) / 2.0
    pun = E.punching(Pu - wu * (cx + d_avg) * (cy + d_avg) / 1e6, cx, cy, d_avg, fc, 'interior')
    dp = None
    if not pun['ok']:
        hd = h
        while hd < h + 200:
            hd += 25
            dd = hd - cov - dbb
            t = E.punching(Pu - wu * (cx + dd) * (cy + dd) / 1e6, cx, cy, dd, fc, 'interior')
            if t['ok']:
                break
        dp = dict(h=hd, size=round(max(Lx, Ly) / 6.0 * 2, 2), punch=t,
                  note='رأس عمود (Drop Panel) بسماكة %d مم وامتداد %.2f م — ACI 8.2.4' % (hd, max(Lx, Ly) / 6.0))
    out = []
    for nm, ln_, l2 in (('الاتجاه X', Lx, Ly), ('الاتجاه Y', Ly, Lx)):
        lnn = max(ln_ - max(cx, cy) / 1000.0, 0.65 * ln_)
        Mo = wu * l2 * lnn ** 2 / 8.0
        d_ = ml['d_short'] if ln_ >= l2 else ml['d_long']
        rows = []
        for lbl, coef, strip, is_top in (('مسند داخلي — شريط أعمدة', -0.65 * 0.75, 0.5, True),
                                         ('مسند داخلي — شريط وسطي', -0.65 * 0.25, 0.5, True),
                                         ('فضاء — شريط أعمدة', 0.35 * 0.60, 0.5, False),
                                         ('فضاء — شريط وسطي', 0.35 * 0.40, 0.5, False)):
            M = coef * Mo
            bw = strip * l2 * 1000.0
            f = E.flexure(abs(M), bw, d_, fc, fy, h, min_rule='slab')
            As_m = max(f['As_req'], 0.0018 * bw * h) / (bw / 1000.0)
            bs = E.bar_spacing(As_m, dbs=(10, 12, 16, 20), smax=min(2 * h, 450))
            rows.append(dict(name=lbl, M=M, As_m=As_m, top=is_top, **bs))
        out.append(dict(dir=nm, Mo=Mo, ln=lnn, rows=rows))
    top_ext = max(Lx, Ly) / 4.0
    return dict(kind='flat', name='فلات سلاب', h=h, hmin=hmin, sw=sw, wu=wu, drop=dp,
                layers=ml, dirs=out, punch=pun, cover=cov, Lx=Lx, Ly=Ly,
                top_ext=top_ext,
                top_len_x=2 * (Lx / 4.0) + cx / 1000.0, top_len_y=2 * (Ly / 4.0) + cy / 1000.0,
                rows=[('السماكة', '%d مم (الدنيا %d مم = ln/%d)' % (h, hmin, div)),
                      ('الوزن الذاتي', '%.2f kN/m²' % sw),
                      ('قص الثقب', 'النسبة %.2f %s' % (pun['ratio'], '✓' if pun['ok'] else '✗ ' + pun['rec'])),
                      ('التسليح العلوي', 'يمتد L/4 = %.2f م لكل جهة من مركز العمود '
                                         '(طول السيخ %.2f م بالاتجاه الطويل)' % (top_ext, 2 * top_ext + cx / 1000.0)),
                      ('الفرش والغطاء', 'd الفرش %.0f مم · d الغطاء %.0f مم' % (ml['d_short'], ml['d_long']))],
                note='الفلات سلاب بلا جسور: التسليح العلوي يتركّز فوق الأعمدة بشرائح الأعمدة، '
                     'والحمل ينتقل مباشرة للأعمدة — لذلك قص الثقب هو الحاكم')

# ------------------------------- الوافل -------------------------------
def waffle(p):
    span = float(p.get('span', 10.0))
    rw = float(p.get('rib_w', 150.0)); s = float(p.get('spacing', 900.0))
    top = float(p.get('topping', 80.0)); bH = float(p.get('rib_h', 400.0))
    live = float(p.get('live', 2.5)); wD = float(p.get('wD', 2.5))
    fc = float(p.get('fc', 30.0)); fy = float(p.get('fy', 420.0))
    h = bH + top
    ribs_m = 1000.0 / s
    conc_m2 = 2 * (rw * bH * ribs_m / 1e6) + top / 1000.0 - (rw * rw * bH * ribs_m * ribs_m / 1e9)
    sw = conc_m2 * 24.0
    hmin = span * 1000.0 / 21.0
    wu = 1.2 * (wD + sw) + 1.6 * live
    w_rib = wu * s / 1000.0
    cov = D.cover('joist')
    d = h - cov - 6.0 - 8.0
    Mu = w_rib * span ** 2 / 10.0
    fl = E.flexure(Mu, min(s, span * 1000 / 4), d, fc, fy, h)
    fl['bars'] = E.pick_bars(fl['As_req'], dbs=(12, 16, 20, 25), nmin=2, nmax=4, width=rw)
    solid = round(span / 6.0, 2)
    return dict(kind='waffle', name='وافل', h=h, hmin=hmin, sw=sw, wu=wu, spacing=s,
                rib_w=rw, rib_h=bH, topping=top, ribs_per_m=ribs_m, conc_per_m2=conc_m2,
                d=d, Mu=Mu, rebar=fl['bars'], solid_head=solid, span=span,
                rows=[('الشبكة', 'أعصاب %d مم @ %d مم بالاتجاهين' % (rw, s)),
                      ('السماكة', '%d مم (عصب %d + طبقة %d)' % (h, bH, top)),
                      ('الوزن الذاتي', '%.2f kN/m² (مقابل %.2f مصمتة)' % (sw, h / 1000.0 * 24.0)),
                      ('تسليح العصب', fl['bars']['label']),
                      ('المنطقة المصمتة حول الأعمدة', '%.2f م لكل جهة (لقص الثقب)' % solid)],
                note='الوافل أعصاب متعامدة — يُصمّم كبلاطة ثنائية الاتجاه بأعصاب، '
                     'وتُصمّت مساحة حول كل عمود لمقاومة قص الثقب')

# ----------------------------- الببل ديك -----------------------------
def bubble(p):
    span = float(p.get('span', 10.0))
    h = float(p.get('h') or max(230.0, span * 1000.0 / 30.0))
    dia = float(p.get('ball', h * 0.65))
    live = float(p.get('live', 2.5)); wD = float(p.get('wD', 2.5))
    fc = float(p.get('fc', 30.0)); fy = float(p.get('fy', 420.0))
    s = dia * 1.1
    void = (math.pi * dia ** 3 / 6.0) / (s * s * h)
    sw = h / 1000.0 * 24.0 * (1 - void)
    wu = 1.2 * (wD + sw) + 1.6 * live
    cov = D.cover('slab')
    d = h - cov - 12.0
    Mu = wu * span ** 2 / 10.0
    fl = E.flexure(Mu, 1000.0, d, fc, fy, h, min_rule='slab')
    bs = E.bar_spacing(max(fl['As_req'], 0.0018 * 1000 * h), dbs=(12, 16, 20), smax=min(2 * h, 300))
    return dict(kind='bubble', name='ببل ديك', h=h, sw=sw, wu=wu, ball=dia, spacing=s,
                void_ratio=void, d=d, Mu=Mu, mesh=bs, span=span,
                solid_head=round(span / 6.0, 2),
                rows=[('السماكة', '%d مم' % h), ('قطر الكرة', '%d مم @ %d مم' % (dia, s)),
                      ('نسبة الفراغ', '%.0f%%' % (void * 100)),
                      ('الوزن الذاتي', '%.2f kN/m² (مقابل %.2f مصمتة)' % (sw, h / 1000.0 * 24.0)),
                      ('التسليح', bs['label'] + ' بالاتجاهين'),
                      ('المنطقة المصمتة حول الأعمدة', '%.2f م — تُزال الكرات لمقاومة القص' % (span / 6.0))],
                note='مقاومة القص تُخفّض إلى ~0.6 من المصمتة (لا كرات حول الأعمدة) — ACI لا يغطيها '
                     'صراحةً وتُصمّم وفق موافقة فنية (ETA)')

def design(kind, p):
    return {'hordi': hordi, 'flat': flat, 'waffle': waffle, 'bubble': bubble}.get(kind, hordi)(p)
