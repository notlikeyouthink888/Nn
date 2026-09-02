# -*- coding: utf-8 -*-
"""
قواعد التفاصيل الإنشائية — ACI 318-19 + CRSI.
الغطاء الخرساني · الكراسي وأنواعها · العكفات وزواياها · نقاط قطع وثني الحديد ·
الدولات (Dowels) · قواعد الوصلات.  كل الأطوال بالمليمتر ما لم يُذكر خلاف ذلك.
"""
import math
import engine as E

# ============================ الغطاء الخرساني ============================
# ACI 318-19 جدول 20.5.1.3
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
    ('حصيرة/أساس — الوجه السفلي (على التربة)', 75.0, 'ACI 20.5.1.3(a)'),
    ('حصيرة/أساس — الوجه العلوي (معرّض)', 50.0, 'ACI 20.5.1.3(b)'),
    ('بلاطة داخلية Ø36 فأقل', 20.0, 'ACI 20.5.1.3(c)'),
    ('بلاطة معرّضة للجو Ø16 فأقل', 40.0, 'ACI 20.5.1.3(b)'),
    ('جسور وأعمدة داخلية (للأساور)', 40.0, 'ACI 20.5.1.3(c)'),
    ('جسور وأعمدة معرّضة', 50.0, 'ACI 20.5.1.3(b)'),
]

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
