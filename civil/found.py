# -*- coding: utf-8 -*-
"""
التربة والأسس والركائز — Soil, foundations and piles.
Terzaghi/Vesic bearing capacity · ACI 318-19 footing & raft design ·
alpha-method (clay) and Meyerhof-SPT (sand) pile capacity.
Units: kN, m, kPa, mm, MPa.
"""
import math
import engine as E

# ------------------------- تحمّل التربة الاسترشادي -------------------------
# قيم افتراضية (kPa) للاستئناس فقط — المرجع هو التقرير الجيوتقني للموقع
SOILS = [
    ("صخر متماسك", 1000.0, "rock"),
    ("حصى وسبيس مدكوك كثيف", 400.0, "sand"),
    ("رمل كثيف", 250.0, "sand"),
    ("رمل متوسط الكثافة", 150.0, "sand"),
    ("رمل مفكك", 90.0, "sand"),
    ("طين قاسي جداً", 300.0, "clay"),
    ("طين قاسي", 180.0, "clay"),
    ("طين متوسط القساوة", 100.0, "clay"),
    ("طين طري", 50.0, "clay"),
    ("طين طري جداً / سبخة", 30.0, "clay"),
    ("ردم غير مدكوك (غير صالح للتأسيس)", 0.0, "fill"),
]
SOIL_MAP = {n: (q, k) for n, q, k in SOILS}

def bearing_capacity(p):
    """قدرة تحمّل التربة السطحية — Terzaghi/Vesic (تحليل شامل)."""
    c = float(p.get('c', 0.0))            # kPa (cu للطين)
    phi = float(p.get('phi', 0.0))        # درجة
    gam = float(p.get('gamma', 18.0))     # kN/m3
    B = float(p.get('B', 2.0)); L = float(p.get('L', B)); Df = float(p.get('Df', 1.5))
    FS = float(p.get('FS', 3.0))
    r = math.radians(phi)
    if phi > 0:
        Nq = math.exp(math.pi * math.tan(r)) * math.tan(math.radians(45 + phi / 2)) ** 2
        Nc = (Nq - 1) / math.tan(r)
    else:
        Nq, Nc = 1.0, 5.14
    Ng = 2 * (Nq + 1) * math.tan(r)
    # معاملات الشكل (Vesic)
    sc = 1 + (B / L) * (Nq / Nc); sq = 1 + (B / L) * math.tan(r); sg = max(0.6, 1 - 0.4 * B / L)
    q = gam * Df
    qu = c * Nc * sc + q * Nq * sq + 0.5 * gam * B * Ng * sg
    qu_net = qu - q
    return dict(Nc=Nc, Nq=Nq, Ng=Ng, sc=sc, sq=sq, sg=sg, q_overburden=q,
                qu=qu, qu_net=qu_net, qa_net=qu_net / FS, qa_gross=qu / FS, FS=FS,
                note="qa الصافي = (qu − γ·Df)/FS — قيم استرشادية، المرجع التقرير الجيوتقني")

# ----------------------------- مستشار الأسس -------------------------------
def advisor(p):
    """يختار نوع الأساس المناسب ويشرح السبب."""
    loads = [float(x) for x in p['loads']]        # أحمال خدمة لكل عمود kN
    qa = float(p['qa'])                            # kPa صافي مسموح
    footprint = float(p['footprint'])              # م² مساحة البناء
    floors = int(p.get('floors', 1))
    Df = float(p.get('Df', 1.5)); gam = float(p.get('gamma', 18.0))
    spacing = float(p.get('spacing', 5.0))         # أقل بحر بين الأعمدة
    # qa المُدخل إجمالي (gross) — الصافي = الإجمالي ناقص وزن التربة فوق منسوب التأسيس
    q_net = max(20.0, qa - Df * gam) if qa > 1.0 else 0.0
    total = sum(loads)
    reasons = []; alts = []
    if q_net <= 1.0:
        pl0 = pile_case(dict(p, q_net=q_net, q_raft=1e9, avg_press=0.0, ratio=9.9))
        return dict(type='piles', name='ركائز (خوازيق)', ratio=9.9, total=total,
                    reasons=['التربة ردم غير مدكوك أو تحمّلها معدوم — لا يجوز التأسيس السطحي'],
                    alts=['استبدال التربة بالكامل بطبقات سبيس مدكوكة ثم أساس سطحي'],
                    q_net=q_net, areas=[], sum_area=0.0, floors=floors,
                    piles=pl0, warn=pl0['triggers'], need_piles=True,
                    avg_press=0.0, Bmax=0.0, overlap=False)
    areas = [P / q_net for P in loads]
    sA = sum(areas)
    ratio = sA / footprint if footprint else 9.9
    Bmax = math.sqrt(max(areas)) if areas else 0.0
    overlap = Bmax > 0.9 * spacing
    avg_press = total / footprint if footprint else 0.0

    if ratio <= 0.35 and not overlap:
        typ, name = 'isolated', 'أسس منفردة (Isolated Footings)'
        reasons.append('مجموع مساحات الأسس = %.0f%% من مساحة البناء (أقل من 35%%) — الأسس المنفردة اقتصادية' % (ratio * 100))
        reasons.append('أكبر أساس %.2f م وأقل بحر %.2f م — لا يوجد تداخل بين الأسس' % (Bmax, spacing))
        alts.append('أسس شريطية إذا كانت الأعمدة قريبة على محور واحد')
    elif ratio <= 0.55:
        if overlap:
            typ, name = 'combined', 'أسس مشتركة / شريطية (Combined / Strip)'
            reasons.append('أبعاد الأساس المنفرد (%.2f م) تقارب البحر بين الأعمدة (%.2f م) — الأسس تتداخل' % (Bmax, spacing))
            reasons.append('الدمج بأساس مشترك يوزّع الحمل ويقلل الهبوط التفاضلي')
            alts.append('حصيرة إذا زاد التداخل بأكثر من اتجاه')
        else:
            typ, name = 'isolated', 'أسس منفردة (Isolated Footings)'
            reasons.append('مجموع مساحات الأسس = %.0f%% من مساحة البناء — ما زال ضمن المدى الاقتصادي' % (ratio * 100))
            alts.append('حصيرة إذا ظهر هبوط تفاضلي بالتقرير الجيوتقني')
    elif ratio <= 1.0:
        typ, name = 'raft', 'حصيرة (Raft / Mat Foundation)'
        reasons.append('مجموع مساحات الأسس = %.0f%% من مساحة البناء (أكثر من 55%%) — الحصيرة أوفر وأسهل تنفيذاً' % (ratio * 100))
        reasons.append('الحصيرة توحّد الهبوط وتمنع الهبوط التفاضلي بين الأعمدة')
        alts.append('أسس مشتركة إذا كانت الأحمال متقاربة والتربة متجانسة')
    else:
        # قبل اللجوء للركائز: هل تكفي حصيرة تغطي كامل مساحة البناء؟
        # ضغط الحصيرة الإجمالي على التربة = الحمل/المساحة + وزن الحصيرة، ويُقارن بالتحمّل الإجمالي
        q_raft = total / footprint + 13.0 if footprint else 1e9
        if q_raft <= qa:
            typ, name = 'raft', 'حصيرة (Raft / Mat Foundation)'
            reasons.append('الأسس المنفردة لا تكفي (المساحة المطلوبة %.0f%% من مساحة البناء)' % (ratio * 100))
            reasons.append('لكن حصيرة تغطي كامل المساحة تعطي ضغطاً %.0f kPa وهو ضمن تحمّل التربة الإجمالي %.0f kPa'
                           % (q_raft, qa))
            reasons.append('الحفر لعمق %.2f م يخفف جزءاً من الضغط الصافي (أساس معوَّض جزئياً)' % Df)
            alts.append('ركائز إذا أظهر التقرير الجيوتقني هبوطاً يتجاوز المسموح')
        else:
            typ, name = 'piles', 'ركائز (خوازيق) مع هامة/حصيرة'
            reasons.append('المساحة المطلوبة للأسس تتجاوز مساحة البناء نفسها (%.0f%%)' % (ratio * 100))
            reasons.append('حتى الحصيرة الكاملة تعطي ضغطاً %.0f kPa وهو أكبر من تحمّل التربة %.0f kPa'
                           % (q_raft, qa))
            alts.append('حصيرة عميقة (أساس معوَّض) مع استبدال تربة إذا كانت الطبقة الضعيفة سطحية فقط')

    pl = pile_case(dict(p, q_net=q_net, q_raft=(total / footprint + 13.0) if footprint else 1e9,
                        avg_press=avg_press, ratio=ratio, typ=typ))
    warn = pl['triggers']
    if pl['need'] and typ != 'piles':
        # التربة نفسها توجب التأسيس العميق ولو كفت المساحة حسابياً — والقرار لها
        alts.insert(0, 'كان المقترح «%s» بحسب المساحة، لكن التربة تمنعه' % name)
        typ, name = 'piles', 'ركائز (خوازيق) مع هامة'
        reasons = ['التربة توجب التأسيس العميق: ' + ' · '.join(warn)] + reasons
    elif typ == 'piles' and not pl['need']:
        # ضاقت المساحة لكن لا سبب تربة — البديل الأرخص أولاً، والركائز آخر الخيارات
        alts.insert(0, 'قبل الركائز: استبدال تربة أو أساس معوَّض أو تكبير الحصيرة')
    return dict(type=typ, name=name, ratio=ratio, sum_area=sA, areas=areas, total=total,
                reasons=reasons, alts=alts, warn=warn, q_net=q_net, avg_press=avg_press,
                Bmax=Bmax, overlap=overlap, floors=floors, piles=pl,
                need_piles=(typ == 'piles'))


# ------------------------- متى الركائز فعلاً؟ (وقلّما تكون) -------------------------
#: أسباب التربة التي **تُوجب** التأسيس العميق. الطوابق والحمل **ليسا** منها:
#: مبنى عشرين طابقاً على طين قاسٍ يقف على حصيرة، ومبنى طابقين على سبخة لا يقف
#: على أي أساس سطحي. القرار للتربة لا للارتفاع.
PILE_SOIL_CASES = [
    ('fill',      'ردم غير مدكوك أو نفايات بناء تحت الأساس',
     'الردم يهبط بالزمن ولو خفّ الحمل — لا يُحسب له تحمّل إطلاقاً'),
    ('sabkha',    'سبخة أو طين طري جداً (qa ≤ 40 kPa)',
     'الهبوط التضاغطي يستمر سنوات ويتجاوز المسموح مهما كبر الأساس'),
    ('soft',      'طين طري (qa ≤ 60 kPa) مع حمل لا تحمله حصيرة كاملة',
     'الحصيرة توحّد الهبوط لكنها لا تلغيه — والطين الطري يهبط كلياً'),
    ('gypsum',    'تربة جبسية انهيارية (Collapsible Gypseous Soil)',
     'الجبس يذوب بالماء فتنهار البنية فجأة — وهذه أخطر تربة بوسط وغرب العراق، '
     'وانهيارها لا ينذر ولا يُقاس بفحص التحمّل الجاف'),
    ('liquefy',   'رمل مفكك مشبع تحت منسوب ماء جوفي عالٍ (خطر تميّع زلزالي)',
     'الرمل المفكك المشبع يفقد تحمّله كلياً لحظة الهزة'),
    ('expansive', 'طين انتفاخي والمنطقة النشطة أعمق من الأساس',
     'الانتفاخ يرفع الأساس بالشتاء ويهبطه بالصيف فيشقّق البناء من الأسفل'),
    ('capacity',  'حتى الحصيرة الكاملة لا تحمل — الضغط يتجاوز التحمّل',
     'لم يبقَ أساس سطحي ممكن'),
    ('uplift',    'قوى شدّ أو قلب على الأعمدة (صوامع · أبراج · جدران قص طويلة)',
     'الأساس السطحي لا يقاوم الشدّ إلا بوزنه، والركيزة تقاومه باحتكاكها'),
]


def pile_case(p):
    """هل تلزم الركائز فعلاً؟ — القرار **من التربة** لا من عدد الطوابق.

    كان المنطق السابق يوصي بالركائز لمجرد «تحمّل منخفض مع ٤ طوابق» أو «١٠ طوابق
    على تربة أقل من 200 kPa» — وهذا يجعلها شبه دائمة، وهو خطأ: أغلب أبنية العراق
    تقف على أسس منفردة أو حصيرة، والركائز استثناء مكلف يُلجأ إليه حين **التربة
    نفسها** لا تصلح، لا حين يعلو المبنى.
    """
    q_net = float(p.get('q_net', 0.0))
    qa = float(p.get('qa', 0.0))
    kind = p.get('soil_kind') or ''
    name = p.get('soil') or ''
    gwt = p.get('gwt')
    Df = float(p.get('Df', 1.5))
    q_raft = float(p.get('q_raft', 0.0))
    trig, why = [], []
    hit = set()

    def add(key):
        if key in hit:
            return
        hit.add(key)
        for k, t, w in PILE_SOIL_CASES:
            if k == key:
                trig.append(t); why.append(w)

    if kind == 'fill' or q_net <= 1.0:
        add('fill')
    if qa and qa <= 40.0:
        add('sabkha')
    elif qa and qa <= 60.0 and q_raft > qa:
        add('soft')
    if p.get('gypseous'):
        add('gypsum')
    if kind == 'sand' and qa and qa <= 100.0 and gwt is not None \
            and float(gwt) > -(Df + 3.0):
        add('liquefy')
    if p.get('expansive'):
        add('expansive')
    if q_raft > qa > 0:
        add('capacity')
    if p.get('uplift'):
        add('uplift')

    need = bool(trig)
    return dict(need=need, triggers=trig, why=why,
                soil=name, kind=kind, q_net=q_net, q_raft=q_raft,
                cases=[dict(k=k, t=t, w=w) for k, t, w in PILE_SOIL_CASES],
                verdict=('التربة توجب التأسيس العميق: ' + ' · '.join(trig)) if need
                        else ('لا سبب تربة يوجب الركائز — الأساس السطحي كافٍ. '
                              'الركائز أساس **استثنائي** كلفته أضعاف السطحي '
                              'وتحتاج جسّاً وفحص تحميل، ولا تُقترح لمجرد ارتفاع '
                              'المبنى أو كِبَر الحمل.'),
                rule='القرار من التربة لا من عدد الطوابق (ACI 13.4 + الممارسة '
                     'الجيوتقنية) — والاختيار النهائي للتقرير الجيوتقني.')

# -------------------------------- الحصيرة ---------------------------------
def raft(p):
    """تصميم حصيرة: السماكة من قص الثقب تحت أثقل عمود + تسليح اتجاهين."""
    total = float(p['total'])                     # حمل خدمة كلي kN
    Pmax = float(p['Pmax'])                       # أثقل عمود (حمل معامل) kN
    Lx = float(p['Lx']); Ly = float(p['Ly'])      # أبعاد الحصيرة م
    qa = float(p['qa']); fc = float(p['fc']); fy = float(p['fy'])
    cx = float(p.get('cx', 400)); cy = float(p.get('cy', 500))
    span = float(p.get('span', 5.0))
    A = Lx * Ly
    q_serv = total / A
    q_u = 1.45 * q_serv                            # ≈ 1.2D+1.6L مكافئ
    h = 400.0; cov = 75.0
    for _ in range(80):
        d = h - cov - 20.0
        b0 = 2 * (cx + d) + 2 * (cy + d)
        beta = max(cx, cy) / min(cx, cy)
        vc = min(0.33, 0.17 * (1 + 2 / beta), 0.083 * (2 + 40 * d / b0)) * math.sqrt(fc)
        phiVc = 0.75 * vc * b0 * d / 1000.0
        Vu = Pmax - q_u * (cx + d) * (cy + d) / 1e6
        if phiVc >= Vu and h >= 300:
            break
        h += 25.0
    d = h - cov - 20.0
    sw = h / 1000.0 * 24.0
    Mu = q_u * span ** 2 / 10.0                    # عزم تقريبي للشريط (kN·m/م)
    top = E.flexure(Mu, 1000.0, d, fc, fy, h, min_rule='slab')
    bot = E.flexure(q_u * span ** 2 / 12.0, 1000.0, d, fc, fy, h, min_rule='slab')
    As_min = 0.0018 * 1000.0 * h
    def bars(As):
        As = max(As, As_min)
        b = E.bar_spacing(As, smax=min(2 * h, 300.0))
        return dict(As=As, db=b['db'], s=b['s'], label=b['label'])
    return dict(h=h, d=d, A=A, Lx=Lx, Ly=Ly, q_serv=q_serv, q_u=q_u, qa=qa,
                ok_press=q_serv <= qa, punch_ok=phiVc >= Vu, phiVc=phiVc, Vu=Vu,
                Mu_top=Mu, top=bars(top['As_req']), bottom=bars(bot['As_req']),
                As_min=As_min, sw=sw, conc=A * h / 1000.0,
                steel=A * h / 1000.0 * 110.0 / 1000.0,
                note='التسليح العلوي فوق الأعمدة والسفلي بوسط البحور — شبكة متعامدة بالاتجاهين')

# -------------------------------- الركائز ---------------------------------
PILE_TYPES = [
    dict(key='bored', name='ركائز مصبوبة بالموقع (Bored / Cast-in-place)',
         D='0.4 – 1.5 م', when='الأكثر شيوعاً بالعراق (بغداد/البصرة). مناسبة للتربة الطينية '
         'والمناطق السكنية المزدحمة لأنها بدون اهتزاز يؤذي الأبنية المجاورة.',
         pros='أقطار وأطوال كبيرة · بدون اهتزاز · يمكن فحص التربة أثناء الحفر',
         cons='تحتاج طين حفر (بنتونايت) أو تغليف مع الماء الجوفي · جودتها تعتمد على التنفيذ'),
    dict(key='driven', name='ركائز مدقوقة سابقة الصب (Driven Precast)',
         D='0.25 – 0.6 م', when='التربة الرملية والمواقع المفتوحة البعيدة عن الأبنية.',
         pros='جودة خرسانة مضمونة (مصنعية) · تنفيذ سريع · كلفة أقل',
         cons='اهتزاز وضوضاء تضر الجوار · صعوبة الاختراق بطبقات قاسية · طول ثابت'),
    dict(key='cfa', name='ركائز CFA (بريمة مستمرة)',
         D='0.4 – 1.0 م', when='وجود ماء جوفي عالٍ أو تربة منهارة، مع الحاجة لسرعة تنفيذ.',
         pros='سريعة جداً · بدون اهتزاز · لا تحتاج طين حفر',
         cons='تحتاج معدات خاصة · صعوبة إنزال قفص التسليح لأعماق كبيرة'),
    dict(key='micro', name='مايكرو بايل (Micropiles)',
         D='0.10 – 0.30 م', when='تقوية أسس قائمة، أو مواقع ضيقة لا تدخلها المعدات الكبيرة.',
         pros='معدات صغيرة · ممتازة للترميم وتحت الأبنية القائمة',
         cons='قدرة حاملة صغيرة لكل ركيزة · عدد كبير · كلفة عالية للطن'),
]

def _alpha(cu):
    if cu <= 25: return 1.0
    if cu >= 70: return 0.5
    return 1.0 - 0.5 * (cu - 25) / 45.0

def pile(p):
    """قدرة الركيزة المفردة والمجموعة."""
    soil = p.get('soil', 'clay')
    D = float(p.get('D', 0.6)); L = float(p.get('L', 15.0))
    P = float(p.get('P', 1200.0))                 # حمل خدمة للعمود kN
    FS = float(p.get('FS', 2.5))
    kind = p.get('kind', 'bored')
    gam = float(p.get('gamma', 18.0))
    Ab = math.pi * D * D / 4.0; As = math.pi * D * L
    steps = []
    if soil == 'clay':
        cu = float(p.get('cu', 60.0))
        al = _alpha(cu)
        fs = al * cu
        Qs = fs * As
        qb = 9.0 * cu
        Qb = qb * Ab
        steps = [("طريقة الحساب", "طريقة α للتربة الطينية (Tomlinson / API)"),
                 ("معامل الالتصاق α", "%.2f (من cu = %.0f kPa)" % (al, cu)),
                 ("احتكاك الجانب fs", "α·cu = %.1f kPa" % fs),
                 ("مساحة الجانب As", "π·D·L = %.2f م²" % As),
                 ("مقاومة الجانب Qs", "fs·As = %.0f kN" % Qs),
                 ("مقاومة القاعدة qb", "9·cu = %.0f kPa" % qb),
                 ("مقاومة القاعدة Qb", "qb·Ab = %.0f kN" % Qb)]
    else:
        N = float(p.get('N', 20.0))               # SPT متوسط
        k = 2.0 if kind == 'driven' else 1.0      # Meyerhof
        fs = min(k * N, 100.0)
        Qs = fs * As
        qb = min(40.0 * N * (L / D), 400.0 * N) * (1.0 if kind == 'driven' else 0.4)
        Qb = qb * Ab
        steps = [("طريقة الحساب", "طريقة Meyerhof بالاعتماد على SPT للتربة الرملية"),
                 ("عدد الضربات N", "%.0f" % N),
                 ("احتكاك الجانب fs", "%s·N = %.1f kPa (حد أقصى 100)" % ("2" if kind == 'driven' else "1", fs)),
                 ("مساحة الجانب As", "π·D·L = %.2f م²" % As),
                 ("مقاومة الجانب Qs", "fs·As = %.0f kN" % Qs),
                 ("مقاومة القاعدة qb", "%.0f kPa" % qb),
                 ("مقاومة القاعدة Qb", "qb·Ab = %.0f kN" % Qb)]
    W = Ab * L * 24.0 * 0.6                        # وزن الركيزة الصافي التقريبي
    Qu = Qs + Qb
    Qall = (Qu - W) / FS
    s = 3.0 * D                                    # التباعد بين الركائز

    def group(n):
        m = 1 if n == 1 else (2 if n <= 4 else 3)
        rows = max(1, math.ceil(n / m))
        if n == 1: return m, rows, 1.0
        if soil != 'clay' and s >= 3 * D: return m, rows, 1.0   # يُهمل بالرملية عند 3D
        th = math.degrees(math.atan(D / s))
        e = 1.0 - th / 90.0 * ((rows - 1) * m + (m - 1) * rows) / (m * rows)
        return m, rows, e

    # ---- أقل عدد ركائز تحت عمود واحد = **ثلاث**، ولا تُقبل ركيزة مفردة أبداً ----
    # الركيزة المفردة تحت عمود لا تقاوم عزماً ولا خروجاً عن المركز: خطأ التنفيذ
    # المسموح بموقع الركيزة (±75 مم بالكود العالمي، وأكثر بالواقع) يحوّل الحمل
    # المحوري إلى عزم على رأس ركيزة نحيلة، وليس لها **بديل** إن ضعفت واحدة.
    # الاثنتان تقاومان بمحور واحد فقط فتحتاجان جسور رابطة بالاتجاه العمودي.
    # ولهذا الممارسة: ثلاث ركائز بمثلث تعطي ثباتاً بكل الاتجاهات بلا جسور رابطة.
    n_min = int(p.get('n_min', 3))
    n = max(n_min, math.ceil(P / max(Qall, 1.0)))
    for _ in range(40):                            # زد العدد حتى تكفي المجموعة
        m, rows, eff = group(n)
        if n * Qall * eff >= P: break
        n += 1
    n = max(n, n_min)
    m, rows, eff = group(n)
    n = max(n, m * rows)          # الشبكة تُبنى كاملة — لا نصف ركيزة بالزاوية
    m, rows, eff = group(n)
    n_cap = dict(
        n_min=n_min, forced=(P / max(Qall, 1.0) <= n_min),
        need_tie=(n <= 2),
        rule='أقل مجموعة تحت عمود = %d ركائز' % n_min,
        why='الركيزة **المفردة** تحت عمود ممنوعة عملياً: خطأ موقعها المسموح '
            'بالتنفيذ يحوّل الحمل المحوري إلى عزم على رأسها، وليس لها بديل إن '
            'ظهر فيها عيب صبّ. والاثنتان تقاومان العزم بمحور واحد فقط فتلزمهما '
            'جسور رابطة (Tie Beams) بالاتجاه العمودي. الثلاث بمثلث ثابتة بكل '
            'الاتجاهات — ولهذا هي الحد الأدنى العملي.',
        note=('عدد الركائز محكوم بالحد الأدنى لا بالحمل — الحمل يحتاج %.1f ركيزة فقط'
              % (P / max(Qall, 1.0))) if P / max(Qall, 1.0) <= n_min else
             'عدد الركائز محكوم بالحمل')
    Qgroup = n * Qall * eff
    cap_B = (m - 1) * s + D + 0.6
    cap_L = (rows - 1) * s + D + 0.6
    cap_h = max(0.6, 0.9 * D + 0.3)

    rec = 'bored'
    if soil == 'sand' and p.get('urban', False) is False: rec = 'driven'
    if p.get('water_table', False): rec = 'cfa'
    if p.get('restricted', False): rec = 'micro'
    # ----- تسليح الركيزة والهامة -----
    fc = float(p.get('fc', 28.0)); fy = float(p.get('fy', 420.0))
    Ast = 0.005 * Ab * 1e6                              # 0.5% من مقطع الركيزة (مم²)
    lb = E.pick_bars(Ast, dbs=(16, 20, 25, 32), nmin=6, nmax=20)
    spiral_s = 150.0 if D <= 0.8 else 200.0
    # انحناء الهامة عند وجه العمود: الركائز خارج المقطع الحرج × ذراعها
    cx = float(p.get('cx', 500)) / 1000.0
    arm = max(0.10, (m - 1) / 2.0 * s - cx / 2.0)     # مسافة الصف الخارجي عن وجه العمود
    piles_side = rows if m > 1 else 0                  # عدد الركائز خارج المقطع
    Pu_pile = 1.45 * P / max(n, 1)
    Mu_cap = Pu_pile * piles_side * arm                # kN·m لكامل عرض الهامة
    d_cap = cap_h * 1000 - 75 - 20
    Mu_m = Mu_cap / max(cap_B, 0.1)                    # kN·m لكل متر عرض
    fx = E.flexure(Mu_m, 1000.0, d_cap, fc, fy, cap_h * 1000, min_rule='slab')
    As_cap = max(fx['As_req'], 0.0018 * 1000.0 * cap_h * 1000)      # مم²/م
    cb_ = E.bar_spacing(As_cap, dbs=(12, 16, 20, 25, 32), smax=250.0)
    s_cap = cb_['s']
    rebar = dict(n=lb['n'], db=lb['db'], As=lb['As'], rho=lb['As'] / (Ab * 1e6),
                 label="%dØ%d" % (lb['n'], lb['db']),
                 spiral_db=10, spiral_s=spiral_s,
                 spiral_label="حلزون Ø10 @ %d مم" % int(spiral_s), cover=75.0)
    cap_rebar = dict(db=cb_['db'], s=s_cap, As=As_cap, Mu=Mu_cap,
                     label="Ø%d @ %d مم بالاتجاهين (سفلي)" % (cb_['db'], int(s_cap)),
                     top_db=16, top_s=200.0, top_label="Ø16 @ 200 مم بالاتجاهين (علوي)")
    return dict(soil=soil, kind=kind, D=D, L=L, Ab=Ab, As=As, Qs=Qs, Qb=Qb, Qu=Qu,
                rebar=rebar, cap_rebar=cap_rebar,
                W=W, FS=FS, Qall=Qall, n=n, spacing=s, eff=eff, Qgroup=Qgroup,
                ok=Qgroup >= P, P=P, steps=steps, rows=rows, cols=m,
                cap=dict(B=cap_B, L=cap_L, h=cap_h, conc=cap_B * cap_L * cap_h),
                types=PILE_TYPES, recommended=rec, group_rule=n_cap,
                notes=['**لا تُنفَّذ ركيزة مفردة تحت عمود** — أقل مجموعة ثلاث ركائز '
                       'بمثلث، أو اثنتان مع جسور رابطة بالاتجاه العمودي عليهما',
                       'يجب تنفيذ فحص تحميل (Pile Load Test) لركيزة واحدة على الأقل لكل 100 ركيزة أو لكل مشروع',
                       'إذا وُجد ردم حديث أو طين طري فوق الطبقة الحاملة يجب حساب الاحتكاك السالب (Negative Skin Friction) وطرحه من القدرة',
                       'كفاءة المجموعة محسوبة بمعادلة Converse-Labarre — تُهمل عادةً بالتربة الرملية عند تباعد ≥ 3D',
                       'هذه الحسابات أولية ولا تُغني عن التقرير الجيوتقني وفحوص التربة الميدانية'])
