# -*- coding: utf-8 -*-
"""
قواعد التفاصيل الإنشائية — ACI 318M-14 + CRSI.
الغطاء الخرساني · الكراسي وأنواعها · العكفات وزواياها · نقاط قطع وثني الحديد ·
الدولات (Dowels) · قواعد الوصلات.  كل الأطوال بالمليمتر ما لم يُذكر خلاف ذلك.
"""
import math
import engine as E

# ============================ الغطاء الخرساني ============================
# ACI 318M-14 جدول 20.6.1.3.1
EXPOSURES = [
    ('ground', 'مصبوب على التربة مباشرة'),
    ('weather', 'معرّض للجو أو التربة بعد فك القالب'),
    ('interior', 'غير معرّض (داخلي)'),
]
def cover(element, exposure='interior', db=16.0):
    """الغطاء المطلوب حسب العنصر ودرجة التعرّض."""
    if exposure == 'ground':
        return 75.0
    if exposure == 'weather':
        return 50.0 if db >= 19 else 40.0
    if element in ('slab', 'joist', 'wall'):
        return 20.0 if db <= 36 else 40.0
    return 40.0                      # جسور وأعمدة: الغطاء للأساور

COVER_TABLE = [
    ('حصيرة/أساس — الوجه السفلي (على التربة)', 75.0, 'ACI 20.6.1.3.1(a)'),
    ('حصيرة/أساس — الوجه العلوي (معرّض)', 50.0, 'ACI 20.6.1.3.1(b)'),
    ('بلاطة داخلية Ø36 فأقل', 20.0, 'ACI 20.6.1.3.1(c)'),
    ('بلاطة معرّضة للجو Ø16 فأقل', 40.0, 'ACI 20.6.1.3.1(b)'),
    ('جسور وأعمدة داخلية (للأساور)', 40.0, 'ACI 20.6.1.3.1(c)'),
    ('جسور وأعمدة معرّضة', 50.0, 'ACI 20.6.1.3.1(b)'),
]

# ===================== أصناف التعرّض والديمومة — ACI 19.3 =====================
# جدول 19.3.1.1: الأصناف · وجدول 19.3.2.1: ما تفرضه على الخلطة.
# كان الباب 19.3 **غائباً كلياً**: كان f'c يُختار للقوة وحدها، والكود يفرض
# حداً أدنى لـ f'c وحداً أعلى لنسبة الماء/الأسمنت **بسبب البيئة** لا الحمل.
# وهذا هو الباب الذي يقرّر عمر المبنى في تربة العراق الجبسية الكبريتية.
EXPOSURE_CLASSES = [
    # (رمز · الفئة · الشرح · أقصى w/cm · أدنى f'c ميغا · ملاحظة)
    ('F0', 'التجمّد والذوبان (F)', 'لا تتعرّض لدورات تجمّد وذوبان', None, 17.0, ''),
    ('F1', 'التجمّد والذوبان (F)', 'دورات تجمّد وذوبان بتعرّض محدود للماء', 0.55, 24.0, 'هواء مُحتبَس (19.3.3.1)'),
    ('F2', 'التجمّد والذوبان (F)', 'دورات تجمّد وذوبان بتعرّض متكرّر للماء', 0.45, 31.0, 'هواء مُحتبَس (19.3.3.1)'),
    ('F3', 'التجمّد والذوبان (F)', 'تجمّد وذوبان مع أملاح إذابة الثلج', 0.40, 35.0, 'هواء مُحتبَس + قيود 26.4.2.2(ب)'),
    ('S0', 'الكبريتات (S)', 'كبريتات ذائبة في التربة < 0.10% أو بالماء < 150 جزء بالمليون', None, 17.0, 'بلا قيد على نوع الأسمنت'),
    ('S1', 'الكبريتات (S)', 'كبريتات 0.10–0.20% بالتربة أو 150–1500 ج/م بالماء (ومنها ماء البحر)', 0.50, 28.0, 'أسمنت نوع II أو MS'),
    ('S2', 'الكبريتات (S)', 'كبريتات 0.20–2.00% بالتربة أو 1500–10000 ج/م بالماء', 0.45, 31.0, 'أسمنت نوع V أو HS · يُمنع كلوريد الكالسيوم'),
    ('S3', 'الكبريتات (S)', 'كبريتات > 2.00% بالتربة أو > 10000 ج/م بالماء', 0.45, 31.0, 'نوع V + بوزولان أو خبث · يُمنع كلوريد الكالسيوم'),
    ('W0', 'ملامسة الماء (W)', 'جافة بالخدمة أو لا تحتاج نفاذية منخفضة', None, 17.0, ''),
    ('W1', 'ملامسة الماء (W)', 'ملامسة للماء وتحتاج نفاذية منخفضة', 0.50, 28.0, ''),
    ('C0', 'حماية الحديد (C)', 'جافة أو محمية من الرطوبة', None, 17.0, 'كلوريد ذائب ≤ 1.00% من وزن الأسمنت'),
    ('C1', 'حماية الحديد (C)', 'معرّضة للرطوبة بلا مصدر كلوريدات خارجي', None, 17.0, 'كلوريد ذائب ≤ 0.30%'),
    ('C2', 'حماية الحديد (C)', 'رطوبة + مصدر كلوريدات (أملاح · ماء بحر · رذاذ)', 0.40, 35.0, 'كلوريد ≤ 0.15% + غطاء 20.6'),
]
#: أكثر تركيبة يقابلها المهندس العراقي: أساس مصبوب على تربة جبسية رطبة.
IRAQ_DEFAULT = ('F0', 'S2', 'W1', 'C1')

def exposure_req(classes):
    """أشدّ متطلبات جدول 19.3.2.1 لمجموعة أصناف تعرّض — المادة 19.3.2.1
    تنصّ صراحةً على أخذ **الأشدّ** حين تجتمع الأصناف."""
    idx = dict((c[0], c) for c in EXPOSURE_CLASSES)
    picked = [idx[c] for c in classes if c in idx]
    if not picked:
        picked = [idx['F0']]
    wcm = [c[3] for c in picked if c[3] is not None]
    fc_min = max(c[4] for c in picked)
    gov_fc = max(picked, key=lambda c: c[4])
    gov_w = min([c for c in picked if c[3] is not None],
                key=lambda c: c[3]) if wcm else None
    return dict(classes=[c[0] for c in picked],
                wcm_max=(min(wcm) if wcm else None),
                fc_min=fc_min,
                gov_fc=gov_fc[0], gov_wcm=(gov_w[0] if gov_w else None),
                rows=[dict(code=c[0], cat=c[1], desc=c[2], wcm=c[3], fc=c[4], note=c[5])
                      for c in picked],
                clause='ACI 318M-14 جدول 19.3.1.1 + جدول 19.3.2.1')

def durability(fc, classes=IRAQ_DEFAULT, wcm=None):
    """يفحص f'c المختار (ونسبة الماء/الأسمنت إن عُرفت) مقابل أصناف التعرّض."""
    req = exposure_req(classes)
    ok_fc = fc >= req['fc_min'] - 1e-9
    ok_w = True if (wcm is None or req['wcm_max'] is None) else (wcm <= req['wcm_max'] + 1e-9)
    req.update(fc=fc, wcm=wcm, ok_fc=ok_fc, ok_wcm=ok_w, ok=ok_fc and ok_w,
               fc_gap=max(0.0, req['fc_min'] - fc))
    return req

# ================================ العكفات ================================
def hook(db, angle=135, kind='tie'):
    """طول الامتداد بعد الثنية + الطول المضاف للسيخ.
    ACI 25.3.1 (عكفة قياسية) و25.3.2 (عكفة أسوار) و25.3.4 (عكفة زلزالية 135°)."""
    if kind == 'tie':
        ext = max(6 * db, 75.0)                     # 90° أو 135° للأساور
        bend_r = 2 * db if db <= 16 else 3 * db     # نصف قطر الثنية الداخلي (25.3.2)
    else:
        ext = 12 * db if angle == 90 else max(4 * db, 65.0)
        bend_r = 3 * db if db <= 25 else (4 * db if db <= 32 else 5 * db)
    arc = math.radians(angle) * (bend_r + db / 2.0)
    return dict(angle=angle, ext=ext, bend_r=bend_r, added=arc + ext,
                seismic=(angle == 135 and kind == 'tie'),
                label='عكفة %d° بامتداد %d مم' % (angle, int(ext)))

# ================================ الكراسي ================================
CHAIRS = [
    ('z90', 'كرسي Z بزاوية 90°', 'أرجل عمودية — الأبسط تصنيعاً بالموقع'),
    ('s135', 'كرسي مائل 135°', 'أرجل بميل 45° — أثبت جانبياً وأنسب للشبكات الثقيلة'),
    ('sb', 'Slab Bolster (SB)', 'كرسي مستمر جاهز — للشبكات الخفيفة والبلاطات'),
    ('ihc', 'High Chair منفرد (IHC)', 'كرسي منفرد جاهز — للحصائر والارتفاعات الكبيرة'),
]
CHAIR_MAP = {c[0]: c for c in CHAIRS}

def chair(kind, height, db=None, top_run=250.0, foot=80.0):
    """هندسة الكرسي وطول قطعته — الارتفاع بالمليمتر."""
    height = max(50.0, height)
    db = db or (10.0 if height <= 300 else 12.0)
    if kind == 's135':
        leg = height * math.sqrt(2.0)               # ميل 45°
        n_bend, ang = 4, 135
    elif kind == 'sb':
        leg = height * 1.15
        n_bend, ang, top_run = 6, 90, 300.0
    elif kind == 'ihc':
        leg = height
        n_bend, ang, foot = 4, 90, 120.0
    else:                                            # z90
        leg = height
        n_bend, ang = 4, 90
    length = (2 * leg + top_run + 2 * foot) / 1000.0  # متر
    return dict(kind=kind, name=CHAIR_MAP.get(kind, CHAIRS[0])[1], height=height, db=db,
                leg=leg, angle=ang, bends=n_bend, top_run=top_run, foot=foot,
                len_each=length,
                label='%s Ø%d ارتفاع %d مم (زاوية %d°)' % (
                    CHAIR_MAP.get(kind, CHAIRS[0])[1], int(db), int(height), ang))

def chair_layout(Lx, Ly, h, cov_top, cov_bot, db_top, db_bot, kind='s135', spacing=1.0):
    """توزيع الكراسي على مساحة: العدد والارتفاع والوزن."""
    ht = max(60.0, h - cov_top - cov_bot - db_top - db_bot)
    c = chair(kind, ht)
    nx = int(math.ceil(Lx / spacing)) + 1
    ny = int(math.ceil(Ly / spacing)) + 1
    n = nx * ny
    wt = n * c['len_each'] * E.ab(c['db']) / 1e6 * 7850.0 / 1000.0
    c.update(n=n, nx=nx, ny=ny, spacing=spacing, weight=wt,
             spacers=int(math.ceil(Lx * Ly * 4)),
             note='الكراسي تحمل الشبكة العلوية — تباعد %.1f م بالاتجاهين (CRSI 1.0–1.5 م)' % spacing)
    return c

# ======================= عدد الأسياخ ونشر الشبكات =======================
def n_bars(width, spacing):
    """عدد أسياخ الشبكة على عرض معيّن — طريقة التنفيذ: ceil(العرض/التباعد) + 1."""
    return int(math.ceil(round(width / spacing, 6))) + 1

def mesh_layers(h, cov_top, cov_bot, db_short, db_long):
    """أعماق فعّالة مختلفة للفرش والغطاء.
    الفرش = الاتجاه القصير (الطبقة الأوطأ) لأنه يحمل العزم الأكبر."""
    d_short = h - cov_bot - db_short / 2.0                       # فرش
    d_long = h - cov_bot - db_short - db_long / 2.0              # غطاء
    return dict(d_short=d_short, d_long=d_long, cov_bot=cov_bot, cov_top=cov_top,
                order=['فرش (الاتجاه القصير) — الطبقة الأولى من الأسفل',
                       'غطاء (الاتجاه الطويل) — الطبقة الثانية فوقها'],
                note='فرق العمق الفعّال = قطر سيخ الفرش (%d مم) — الاتجاه الطويل يحتاج حديداً أكثر لنفس العزم'
                     % int(db_short))

# ==================== نقاط القطع والثني بالجسور ====================
def curtail(span, sup_w=0.4, kind='interior', bent=True):
    """نقاط قطع الحديد العلوي وثني السفلي — التفصيل الكلاسيكي.
    الأطوال بالمتر."""
    ln = max(0.5, span - sup_w)
    top1 = ln / 3.0                    # الطبقة الأولى من الحديد العلوي
    top2 = ln / 5.0                    # الطبقة الثانية (القطع المبكر)
    bend = ln / 7.0                    # نقطة بدء الثني من وجه المسند
    return dict(ln=ln, top1=top1, top2=top2, bend_at=bend, bent=bent,
                top1_len=2 * top1 + sup_w, top2_len=2 * top2 + sup_w,
                rows=[('الحديد العلوي — الطبقة الأولى', 'يمتد L/3 = %.2f م من وجه المسند لكل جهة' % top1),
                      ('الحديد العلوي — الطبقة الثانية', 'يُقطع عند L/5 = %.2f م' % top2),
                      ('ثني الحديد السفلي', ('50%% من الأسياخ تُثنى 45° عند L/7 = %.2f م' % bend)
                       if bent else 'بدون ثني — أسياخ مستقيمة'),
                      ('الاستمرارية', 'ما لا يقل عن ثلث الحديد السفلي يستمر داخل المسند (ACI 9.7.3.8.2)')])

def bent_bar(span, h, cov, db, sup_w=0.4, angle=45.0):
    """هندسة السيخ المثني: الطول الإضافي والشكل."""
    rise = max(50.0, h - 2 * cov - db)                    # مم
    diag = rise / math.sin(math.radians(angle))
    extra = (diag - rise) / 1000.0                        # زيادة الطول لكل ثنية (م)
    ln = max(0.5, span - sup_w)
    return dict(rise=rise, diag=diag, angle=angle, extra_each=extra,
                extra_total=2 * extra, bend_at=ln / 7.0,
                label='ثني %d° بارتفاع %d مم — زيادة %.0f مم لكل ثنية' % (
                    int(angle), int(rise), extra * 1000),
                note='السيخ المثني يساهم بالقص (ACI 22.5.10.6: Vs = Av·fy·sinα) لكن تصميم القص '
                     'يبقى على الأساور، ولا يُعتمد عليه بالإطارات المقاومة للعزوم بالمناطق الزلزالية (ACI 18.6)')

# ==================== حدود التباعد والحديد الأدنى ====================
def crack_spacing(fy, cc, fs=None, detail=False):
    """أقصى تباعد بين أسياخ الشدّ للتحكم بالشقوق — ACI 318M-14 المادة 24.3.2:

        s ≤ الأصغر من [ 380·(280/fs) − 2.5·cc   ,   300·(280/fs) ]

    و fs = 2·fy/3 إن لم تُحسب (24.3.2.1) · cc = الغطاء الصافي لأقرب سطح.
    كان هذا الحدّ مفقوداً تماماً، فكان ممكناً أن يخرج تباعد يجتاز الانحناء
    ويرسب بعرض الشقّ."""
    fs = fs or (2.0 * fy / 3.0)
    a = 380.0 * (280.0 / fs) - 2.5 * cc
    b = 300.0 * (280.0 / fs)
    s = max(0.0, min(a, b))
    if not detail:
        return s
    return dict(s_max=s, a=a, b=b, fs=fs, cc=cc, clause='ACI 318M-14 24.3.2')

def skin_reinforcement(h, cover, fy, db_skin=12.0, detail=False):
    """حديد الجلد على وجهي الجسر العميق — ACI 318M-14 المادة 9.7.2.3:
    مطلوب حين يتجاوز عمق الجسر **900 مم**، ويُوزّع على مسافة h/2 من وجه الشدّ
    بتباعد لا يتجاوز حدّ 24.3.2. كان مفقوداً — والجسور العميقة تتشقق جانبياً بدونه."""
    if h <= 900.0:
        return dict(required=False, h=h, clause='ACI 318M-14 9.7.2.3',
                    note='عمق الجسر %d مم ≤ 900 مم — لا يلزم حديد جلد' % int(h))
    s = crack_spacing(fy, cover)
    zone = h / 2.0
    n_face = max(2, int(math.ceil(zone / s)))
    return dict(required=True, h=h, zone=zone, s=s, db=db_skin, n_per_face=n_face,
                n_total=2 * n_face, As_face=n_face * E.ab(db_skin),
                clause='ACI 318M-14 9.7.2.3 + 24.3.2',
                label='حديد جلد %dØ%d لكل وجه @ %d مم على ارتفاع %d مم من وجه الشدّ'
                      % (n_face, int(db_skin), int(s), int(zone)),
                note='مطلوب لأن عمق الجسر %d مم > 900 مم' % int(h))

def as_min_relief(As_req, As_min, detail=False):
    """إعفاء الحديد الأدنى — ACI 318M-14 المادة 9.6.1.3: لا يلزم تجاوز
    As,min إذا كان المنفَّذ ≥ 1.33 × المطلوب بالتحليل. يوفّر حديداً بلا مخالفة."""
    gov = min(As_min, 1.33 * As_req) if As_req > 0 else As_min
    if not detail:
        return gov
    return dict(As_req=As_req, As_min=As_min, As_gov=gov,
                relieved=gov < As_min - 1e-6, clause='ACI 318M-14 9.6.1.3',
                note='1.33·As المطلوب = %.0f مم² %s As,min = %.0f مم²'
                     % (1.33 * As_req, '<' if gov < As_min else '≥', As_min))

def beam_integrity(As_pos, As_neg, db, perimeter=False, detail=False):
    """حديد التماسك الإنشائي بالجسور — ACI 318M-14 المادة 9.7.7:
    لا يقل الحديد السفلي المستمر عن **ربع** أكبر حديد سفلي بالبحر ولا عن سيخين،
    ويُوصل عند المسند بوصلة صنف B أو يُنشر بعكفة. وبالجسور المحيطية يُضاف
    **سدس** الحديد العلوي مستمراً، ويُطوَّق الجسر بأساور مغلقة بكامل طوله."""
    As_bot = max(As_pos / 4.0, 2.0 * E.ab(db))
    r = dict(As_bot_cont=As_bot, n_min=2, clause='ACI 318M-14 9.7.7',
             note='ربع الحديد السفلي وبحدّ أدنى سيخان يستمران خلال المسند')
    if perimeter:
        r.update(As_top_cont=As_neg / 6.0, closed_stirrups=True,
                 note=r['note'] + ' · وجسر محيطي: سدس الحديد العلوي مستمر وأساور مغلقة بكامل الطول')
    if not detail:
        return As_bot
    return r

def seismic_hoops(h_beam, db_long, db_hoop, d, detail=False):
    """أساور المنطقة الحرجة بالجسر — ACI 318M-14 المادة 18.6.4:
    تُوضع أساور مغلقة على مسافة **2h** من وجه المسند، بتباعد لا يتجاوز
    الأصغر من [ d/4 , 6·db الطولي , 150 مم ]، وأول أسوار على 50 مم من الوجه.
    وخارج المنطقة الحرجة لا يتجاوز التباعد d/2 (18.6.4.6)."""
    s_cr = min(d / 4.0, 6.0 * db_long, 150.0)
    s_cr = max(50.0, math.floor(s_cr / 25.0) * 25.0)
    s_out = max(50.0, math.floor(min(d / 2.0, 300.0) / 25.0) * 25.0)
    lo = 2.0 * h_beam
    r = dict(zone=lo, s_crit=s_cr, s_outside=s_out, first=50.0, db=db_hoop,
             clause='ACI 318M-14 18.6.4',
             label='أساور مغلقة Ø%d @ %d مم على %d مم من كل وجه مسند · '
                   'ثم Ø%d @ %d مم · أول أسوار على 50 مم'
                   % (int(db_hoop), int(s_cr), int(lo), int(db_hoop), int(s_out)))
    return r if detail else r

# ================================ الدولات ================================
def dowels(col_b, col_h, db, fc, fy, mode='code', tension=False):
    """أشاير ربط العمود بالأساس — ACI 16.3.4.1 و25.4.9 و25.5.5."""
    Ag = col_b * col_h
    As_min = 0.005 * Ag
    n = max(4, int(math.ceil(As_min / E.ab(db))))
    ldc = max(0.24 * fy * db / math.sqrt(fc), 0.043 * fy * db, 200.0)   # دفن ضغط
    lap_c = max(0.071 * fy * db, 300.0)                                  # وصلة ضغط
    lap_t = E.lap_length(db, fc, fy)                                     # وصلة شد
    proj = lap_t if tension else lap_c
    if mode == '16db':
        emb, proj_used, src = 16 * db, 16 * db, 'قاعدة الموقع 16db'
    elif mode == '40db':
        emb, proj_used, src = 40 * db, 40 * db, 'قاعدة الموقع 40db'
    else:
        emb, proj_used, src = ldc, proj, 'محسوب وفق ACI'
    warn = None
    if emb < ldc - 1:
        warn = 'الدفن %d مم أقل من الحد الكودي ldc = %d مم' % (int(emb), int(ldc))
    hk = hook(db, 90, 'bar')
    return dict(n=n, db=db, As=n * E.ab(db), As_min=As_min, ldc=ldc,
                lap_c=lap_c, lap_t=lap_t, embed=emb, project=proj_used, mode=src,
                total_len=(emb + proj_used + hk['added']) / 1000.0, hook=hk, warn=warn,
                label='%dØ%d — دفن %d مم + بروز %d مم' % (n, int(db), int(emb), int(proj_used)),
                rows=[('عدد الأشاير', '%d Ø%d (0.005·Ag = %d مم²)' % (n, int(db), int(As_min))),
                      ('الدفن داخل الأساس', '%d مم%s' % (int(emb), '' if mode == 'code' else ' (%s)' % src)),
                      ('البروز فوق الأساس', '%d مم (وصلة %s)' % (int(proj_used), 'شد' if tension else 'ضغط')),
                      ('ldc الكودي', '%d مم = %.0f·db' % (int(ldc), ldc / db)),
                      ('وصلة الضغط الكودية', '%d مم = %.0f·db' % (int(lap_c), lap_c / db))])
