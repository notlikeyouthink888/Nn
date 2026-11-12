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

# ------------------- جدول القرار: تحمّل التربة يقرّر نوع الأساس -------------------
#: **هذا هو القرار العملي المعتمد.** نوع الأساس لا يُشتقّ من نسبة مساحات القواعد
#: إلى مساحة البناء — يُشتقّ أولاً من **نطاق تحمّل التربة**، ثم تأتي المساحة
#: لتفصل بين خيارات النطاق الواحد فقط (منفصلة أم مشتركة، مثلاً).
#:
#: أعمدة الجدول: المفتاح · حدّ التحمّل الأدنى للنطاق (kPa) · المدى المكتوب بالمرجع ·
#: صنف التربة · الحكم · نوع الأساس الأساسي · هل يلزم تحقق هبوط · شرح.
BEAR_BANDS = [
    dict(key='excellent', lo=250.0, span='250 – 1000 kPa',
         soil='صخر · حصى مدكوك · رمل كثيف',
         verdict='قواعد منفصلة — ممتاز جداً',
         base='isolated', settle_chk=False,
         why='التحمّل عالٍ فمساحة القاعدة تخرج صغيرة ولا تتداخل مع جاراتها، '
             'والهبوط فوري ينتهي مع انتهاء البناء'),
    dict(key='good', lo=150.0, span='150 – 180 kPa',
         soil='رمل متوسط الكثافة · طين قاسٍ',
         verdict='قواعد منفصلة أو مشتركة',
         base='isolated', settle_chk=False,
         why='النطاق الأشيع ببغداد. الأصل قواعد منفصلة، فإن تقاربت القواعد حتى '
             'تلامست تُدمج بقاعدة مشتركة أو شريطية'),
    dict(key='fair', lo=80.0, span='90 – 100 kPa',
         soil='طين متوسط القساوة · رمل مفكّك',
         verdict='لبشة (حصيرة) أو قواعد واسعة + تحقّق من الهبوط',
         base='raft', settle_chk=True,
         why='التحمّل يكفي حسابياً لكن القاعدة تخرج واسعة جداً، ومع الاتساع يكبر '
             'بصلة الإجهاد ويكبر الهبوط — فالحاكم هنا **الهبوط** لا التحمّل'),
    dict(key='poor', lo=20.0, span='30 – 50 kPa',
         soil='طين طري · سبخة',
         verdict='ركائز أو إحلال إجباري',
         base='piles', settle_chk=True,
         why='الهبوط التضاغطي يستمر سنوات ويتجاوز المسموح مهما كبرت القاعدة — '
             'ولا يعالجه إلا نقل الحمل لطبقة أعمق أو استبدال التربة'),
    dict(key='unfit', lo=-1.0, span='0 kPa',
         soil='ردم غير مدكوك',
         verdict='ممنوع التأسيس السطحي — ركائز أو إحلال',
         base='piles', settle_chk=True,
         why='الردم غير المدكوك يهبط بالزمن ولو خفّ الحمل، ولا يُحسب له تحمّل إطلاقاً'),
]

#: سُلَّم أنواع الأسس — الترقية مسموحة والتنزيل ممنوع: المساحة تستطيع أن ترفع
#: النوع الذي قرّرته التربة، ولا تستطيع أن تنزل عنه أبداً.
FOUND_RANK = ['isolated', 'combined', 'raft', 'piles']
FOUND_NAME = {
    'isolated': 'أسس منفردة (Isolated Footings)',
    'combined': 'أسس مشتركة / شريطية (Combined / Strip)',
    'raft': 'حصيرة (Raft / Mat Foundation)',
    'piles': 'ركائز (خوازيق) مع هامة',
}


def soil_band(qa):
    """نطاق تحمّل التربة الذي يقع فيه qa — أول نطاق حدّه الأدنى ≤ qa."""
    for b in BEAR_BANDS:
        if qa >= b['lo']:
            return b
    return BEAR_BANDS[-1]


#: معامل المرونة Es (kPa) وقابلية الانضغاط Cr = Cc/(1+e0) — مشتقّان من qa بعلاقات
#: تجريبية معروفة، فلا يُدخل المستخدم رقماً عشوائياً ولا يُخترع رقم داخل البرنامج.
def soil_moduli(qa, kind):
    if kind == 'rock':
        return 2.0e6, 0.0, 'صخر — Es ≈ 2 غيغا باسكال والهبوط مهمَل'
    if kind == 'fill' or qa <= 1.0:
        return 3000.0, 0.25, 'ردم — Es ≈ 3 ميغا و Cr = 0.25 (قابلية انضغاط عالية جداً)'
    if kind == 'sand':
        N = max(4.0, qa / 10.0)
        return 500.0 * (N + 15.0), 0.0, \
            'رمل — N ≈ qa/10 = %.0f ضربة و Es = 500·(N+15) = %.0f kPa (Bowles)' % (N, 500.0 * (N + 15.0))
    cu = qa / 1.71                     # qa الصافي = Nc·cu/FS = 5.14·cu/3 ⇒ cu ≈ qa/1.71
    # Cc/(1+e0) البكر — يزداد بضعف الطين
    Cc = 0.20 if qa < 50 else (0.15 if qa < 75 else (0.12 if qa < 150 else 0.08))
    # الطين الطري **بكر التضاغط** (NC) فيُحسب بـ Cc كاملاً، والطين القاسي
    # **فوق-متضاغط** (OC) والزيادة تبقى تحت ضغط ما قبل التضاغط فيحكمها معامل
    # إعادة الانضغاط Cr ≈ Cc/8 — والخلط بينهما يضخّم الهبوط عشرة أضعاف.
    oc = qa >= 75.0
    idx = Cc / 8.0 if oc else Cc
    return 400.0 * cu, idx, \
        ('طين %s — cu ≈ qa/1.71 = %.0f kPa · Es = 400·cu · Cc/(1+e0) = %.2f'
         % ('فوق-متضاغط (OC) فالحاكم Cr = Cc/8' if oc else 'بكر التضاغط (NC)', cu, Cc)
         + (' ⇒ Cr = %.3f' % idx if oc else ''))


#: الهبوط الكلي المسموح (مم) — Skempton & MacDonald 1956، وهو المرجع الذي
#: تُبنى عليه حدود أغلب الأكواد. والقيم تختلف بصنف التربة وبنوع الأساس:
#:
#:   * الرمل يهبط **فورياً وغير منتظم** (الكثافة تتغيّر من نقطة لأخرى)، فحدّه
#:     أشدّ: 40 مم للقاعدة و50 للحصيرة.
#:   * الطين يهبط **بالزمن وبانتظام**، والحصيرة الصلبة توحّده فيبقى التفاضلي
#:     نصف الكلي تقريباً — و**التفاضلي هو الذي يشقّق البناء** لا الكلي.
#:     فحدّه 50 مم للقاعدة و75 للحصيرة.
#:
#: وكان المطبَّق 25 مم للقاعدة و50 للحصيرة **بكل التُرب** — وهي قيم الرمل
#: مفروضةً على الطين، فترسب حصيرة بيت من طابقين على طين طري وتُدفع للركائز
#: بلا سبب. الحدّ ليس رقماً واحداً: هو دالة التربة ونوع الأساس.
SETTLE_LIMIT = {
    'clay': {'isolated': 50.0, 'combined': 50.0, 'raft': 75.0, 'piles': 50.0},
    'sand': {'isolated': 40.0, 'combined': 40.0, 'raft': 50.0, 'piles': 40.0},
    'rock': {'isolated': 40.0, 'combined': 40.0, 'raft': 50.0, 'piles': 40.0},
    'fill': {'isolated': 40.0, 'combined': 40.0, 'raft': 50.0, 'piles': 40.0},
}


def settle_limit(kind, typ):
    return SETTLE_LIMIT.get(kind, SETTLE_LIMIT['clay']).get(typ, 50.0)


def settlement(p):
    """تقدير أولي للهبوط: آني مرن + تضاغطي للطين. الغاية بوابة قرار لا تصميم."""
    qa = float(p.get('qa', 150.0)); kind = p.get('kind', 'clay')
    q = float(p.get('q', 0.0))                 # ضغط التماس الفعلي kPa
    B = max(0.5, float(p.get('B', 2.0)))       # عرض الأساس (أو الحصيرة) م
    typ = p.get('typ', 'isolated')
    Df = float(p.get('Df', 1.5)); gam = float(p.get('gamma', 18.0))
    Es, Cr, src = soil_moduli(qa, kind)
    nu = 0.50 if kind == 'clay' else 0.30      # الطين غير المصرَّف ν = 0.5
    If = {'isolated': 0.95, 'combined': 1.10, 'raft': 1.30}.get(typ, 0.95)
    # **سُمك الطبقة الانضغاطية محدود**: بصلة الإجهاد تنزل 2B نظرياً، لكنها تقف
    # عند أول طبقة حاملة (صخر أو رمل كثيف) لأن ما تحتها لا ينضغط عملياً. بدون
    # هذا القيد تخرج حصيرة عرضها 25 م بهبوط ربع متر على رمل كثيف — وهو باطل.
    # وفوق ذلك يُقيَّد العرض الفعّال بـ 10 م: الحلّ المرن يفترض Es ثابتاً مع
    # العمق، وهو غير صحيح لحصيرة عرضها عشرات الأمتار (Es يزداد بالحصر)، فيُبالغ
    # بالهبوط مبالغة كبيرة. وما بعد ذلك مرجعه التقرير الجيوتقني.
    Hm = p.get('Hmax')
    Hm = None if Hm is None else max(1.0, float(Hm))
    H = 2.0 * B if Hm is None else min(2.0 * B, Hm)
    Beff = min(B, 10.0) if Hm is None else min(B, Hm, 10.0)
    Si = q * Beff * (1 - nu * nu) * If / Es * 1000.0         # مم
    Sc = 0.0
    if Cr > 0 and H > 0.05:
        s0 = max(10.0, gam * (Df + H / 2.0))                 # الإجهاد الأصلي بوسط الطبقة
        ds = 0.50 * q                                        # متوسط الزيادة داخل البصلة
        Sc = Cr * H * math.log10((s0 + ds) / s0) * 1000.0    # مم
    S = Si + Sc
    lim = settle_limit(kind, typ)
    hsrc = ('محدود بعمق الطبقة الحاملة %.1f م تحت قاعدة الأساس' % Hm) if Hm \
           else 'بصلة الإجهاد 2B كاملة (لا طبقة حاملة ضمن المدى المجسوس)'
    return dict(Si=Si, Sc=Sc, S=S, limit=lim, ok=S <= lim, Es=Es, Cr=Cr, nu=nu,
                If=If, B=B, q=q, src=src, H=H, Hmax=Hm, Beff=Beff,
                steps=[('معامل المرونة Es', src),
                       ('سُمك الطبقة الانضغاطية H', '%.1f م — %s' % (H, hsrc)),
                       ('الهبوط الآني Si', 'q·B·(1−ν²)·I/Es = %.1f مم' % Si),
                       ('الهبوط التضاغطي Sc', ('Cr·H·log((σ₀+Δσ)/σ₀) = %.1f مم' % Sc)
                        if Cr > 0 else 'صفر — التربة غير متضاغطة (رمل أو صخر)'),
                       ('المجموع', '%.1f مم مقابل المسموح %.0f مم' % (S, lim))],
                note='تقدير أولي لاتخاذ القرار — الهبوط النهائي من تقرير الجسّات '
                     'وفحوص التضاغط (Oedometer)')


# -------------------------- الإحلال قبل الركائز --------------------------
#: **الركائز آخر الحلول لا أولها.** بيت بمساحة 200 أو 400 م² وطابقين أو ثلاثة
#: لا يُنفَّذ على ركائز في أي مكان بالدنيا — يُحفر ضعيفه ويُستبدل بسبيس مدكوك
#: ويُبنى عليه أساس سطحي. الركائز لمبنى ثقيل أو لتربة ضعيفة **عميقة** لا
#: يمكن حفرها. وكان البرنامج يقفز للركائز مباشرةً كلما ضعفت التربة، فيخرج
#: ٤٨ ركيزة تحت بيت من طابقين — وهذا خطأ هندسي لا خطأ عرض.
REPLACE_QA = 250.0        # kPa — تحمّل طبقة السبيس المدكوك بكثافة 95% مودفايد
REPLACE_MAX = 3.0         # م — أقصى عمق إحلال عملي بحفر مفتوح
REPLACE_MAX_WET = 1.5     # م — حين يكون الماء الجوفي فوق قاع الإحلال (نزح مكلف)
REPLACE_FLOORS = 6        # طوابق — فوقها يصير الحمل أكبر من أن يحمله الإحلال


def replacement(p):
    """هل يكفي **الإحلال** بدل الركائز؟ وهو الحلّ الأول للمبنى الخفيف.

    الفكرة: التربة الضعيفة سطحية غالباً. تُحفر حتى أول طبقة حاملة، ويُردم
    مكانها سبيس/حصى مدكوك بطبقات 25 سم بكثافة 95% مودفايد، فتصير طبقة حاملة
    مصنّعة تحمّلها ≈ 250 kPa، ويُبنى عليها أساس سطحي عادي.
    """
    Hw = p.get('weak_depth')                 # سُمك الضعيف تحت قاعدة الأساس (م)
    floors = int(p.get('floors', 1))
    q = float(p.get('q_contact', 0.0))       # ضغط التماس المتوقّع kPa
    fp = float(p.get('footprint', 0.0))
    gwt = p.get('gwt'); Df = float(p.get('Df', 1.5))
    if Hw is None:
        return dict(ok=False, reason='لم تُعرف سماكة التربة الضعيفة — يُحدّدها تقرير الجسّات')
    Hw = float(Hw)
    wet = gwt is not None and float(gwt) > -(Df + Hw)
    lim = REPLACE_MAX_WET if wet else REPLACE_MAX
    deep = Hw > lim
    heavy = floors > REPLACE_FLOORS or q > REPLACE_QA
    ok = (not deep) and (not heavy)
    vol = fp * Hw if fp else 0.0
    why = []
    if deep:
        why.append('عمق التربة الضعيفة %.1f م يتجاوز حدّ الحفر المفتوح العملي %.1f م%s'
                   % (Hw, lim, ' (والماء الجوفي فوق قاع الإحلال فيلزم نزح مستمر)'
                      if wet else ''))
    if heavy:
        why.append('المبنى ثقيل (%d طوابق · ضغط تماس %.0f kPa) — الإحلال يعالج '
                   'التحمّل السطحي ولا يمنع هبوط الطبقات العميقة تحته'
                   % (floors, q))
    if ok:
        why.append('التربة الضعيفة سطحية (%.1f م) والمبنى خفيف (%d طوابق) — '
                   'يُحفر الضعيف ويُستبدل بسبيس مدكوك فيصير الأساس سطحياً عادياً'
                   % (Hw, floors))
    return dict(ok=ok, depth=round(Hw, 2), limit=lim, wet=wet, deep=deep, heavy=heavy,
                qa_new=REPLACE_QA, volume=round(vol, 1), q_contact=round(q, 1),
                layers=int(math.ceil(Hw / 0.25)), why=why,
                spec='سبيس أو حصى مدرّج يُفرَش بطبقات لا تزيد على 25 سم ويُدكّ لكثافة '
                     '95%% من مودفايد بروكتور، ويمتدّ **خارج حدّ الأساس** مسافة تساوي '
                     'عمق الإحلال بكل جهة (انتشار الإجهاد 1:1) — %d طبقة دكّ'
                     % int(math.ceil(Hw / 0.25)),
                note='الإحلال أرخص من الركائز بمراتب ولا يحتاج معدات خاصّة ولا فحص '
                     'تحميل. وهو الحلّ المنفَّذ فعلاً لأغلب أبنية العراق على التربة '
                     'الضعيفة السطحية. ولا يصلح حين يعمق الضعيف أو يثقل المبنى.')


# ----------------------------- مستشار الأسس -------------------------------
def advisor(p):
    """يختار نوع الأساس: **تحمّل التربة أولاً**، ثم المساحة ترفع ولا تُنزل."""
    loads = [float(x) for x in p['loads']]        # أحمال خدمة لكل عمود kN
    qa = float(p['qa'])                            # kPa إجمالي مسموح
    footprint = float(p['footprint'])              # م² مساحة البناء
    floors = int(p.get('floors', 1))
    Df = float(p.get('Df', 1.5)); gam = float(p.get('gamma', 18.0))
    spacing = float(p.get('spacing', 5.0))         # أقل بحر بين الأعمدة
    kind = p.get('soil_kind') or 'clay'
    # qa المُدخل إجمالي (gross) — الصافي = الإجمالي ناقص وزن التربة فوق منسوب التأسيس
    q_net = max(20.0, qa - Df * gam) if qa > 1.0 else 0.0
    total = sum(loads)
    band = soil_band(qa)
    reasons = []; alts = []; steps = []

    # ---------- الخطوة ١: النطاق يقرّر النوع الأساسي ----------
    typ = band['base']
    steps.append(dict(k='band', t='نطاق التربة',
                      v='qa = %.0f kPa ← %s (%s)' % (qa, band['soil'], band['span']),
                      r='%s — %s' % (band['verdict'], band['why'])))
    reasons.append('تحمّل التربة %.0f kPa يقع في نطاق «%s» (%s) وحكمه: %s'
                   % (qa, band['soil'], band['span'], band['verdict']))
    reasons.append(band['why'])

    if q_net <= 1.0:
        # الردم غير المدكوك = الحالة النموذجية للإحلال: يُحفر ويُستبدل ويُبنى
        # فوقه أساس سطحي. وكان يُقفَز منه للركائز مباشرةً بلا فحص.
        q0 = (total / footprint + 13.0) if footprint else 1e9
        rep0 = replacement(dict(weak_depth=p.get('weak_depth'), floors=floors,
                                q_contact=q0, footprint=footprint,
                                gwt=p.get('gwt'), Df=Df))
        pl0 = pile_case(dict(p, q_net=q_net, q_raft=1e9, avg_press=0.0, ratio=9.9,
                             band=band, Bmax=0.0, floors=floors))
        steps.append(dict(k='replace', t='الإحلال قبل الركائز',
                          v=('عمق الردم %.1f م · الحدّ العملي %.1f م'
                             % (rep0['depth'], rep0['limit']))
                            if rep0.get('depth') is not None else rep0.get('reason', ''),
                          r=('يكفي الإحلال — لا حاجة للركائز' if rep0['ok']
                             else 'لا يكفي — تبقى الركائز')))
        if rep0['ok']:
            typ0 = 'raft' if (footprint and total / footprint > 0.55 * REPLACE_QA) \
                else 'isolated'
            return dict(type=typ0, name=FOUND_NAME[typ0], ratio=0.0, total=total,
                        reasons=reasons + [
                            '**الإحلال بدل الركائز**: الردم سطحي (%.1f م) والمبنى '
                            'خفيف (%d طوابق) — يُزال كاملاً ويُستبدل بسبيس مدكوك '
                            'تحمّله %d kPa' % (rep0['depth'], floors, int(REPLACE_QA)),
                            rep0['spec']],
                        alts=['الركائز تبقى بديلاً إن كان الردم أعمق ممّا قُدّر'],
                        q_net=REPLACE_QA - Df * gam, areas=[], sum_area=0.0,
                        floors=floors, band=band, bands=BEAR_BANDS, steps=steps,
                        settle=None, replace=rep0, piles=pl0, warn=pl0['triggers'],
                        need_piles=False, avg_press=total / footprint if footprint else 0.0,
                        Bmax=0.0, overlap=False, q_raft=q0,
                        rule='الردم غير المدكوك يُزال ولا يُبنى عليه. وإزالته '
                             'كاملةً ممكنة هنا، فلا داعي للركائز.')
        return dict(type='piles', name=FOUND_NAME['piles'], ratio=9.9, total=total,
                    reasons=reasons + ['التحمّل الصافي معدوم — لا يجوز أي تأسيس سطحي',
                                       'والإحلال لا يكفي: ' + (rep0['why'] or [''])[0]],
                    alts=['استبدال التربة بالكامل بطبقات سبيس مدكوكة ثم أساس سطحي'],
                    q_net=q_net, areas=[], sum_area=0.0, floors=floors, band=band,
                    bands=BEAR_BANDS, steps=steps, settle=None, replace=rep0,
                    piles=pl0, warn=pl0['triggers'], need_piles=True,
                    avg_press=0.0, Bmax=0.0, overlap=False, q_raft=q0)

    areas = [P / q_net for P in loads]
    sA = sum(areas)
    ratio = sA / footprint if footprint else 9.9
    Bmax = math.sqrt(max(areas)) if areas else 0.0
    overlap = Bmax > 0.9 * spacing
    avg_press = total / footprint if footprint else 0.0
    q_raft = (total / footprint + 13.0) if footprint else 1e9

    def raise_to(t, why, key):
        """ترقية النوع — ولا تنزيل أبداً. المساحة لا تُلغي ما قرّرته التربة."""
        nonlocal typ
        if FOUND_RANK.index(t) > FOUND_RANK.index(typ):
            steps.append(dict(k=key, t='ترقية النوع', v='%s ← %s'
                              % (FOUND_NAME[typ], FOUND_NAME[t]), r=why))
            typ = t
            reasons.append(why)
        else:
            steps.append(dict(k=key, t='بلا ترقية', v='يبقى %s' % FOUND_NAME[typ], r=why))

    # ---------- الخطوة ٢: المساحة تفصل داخل النطاق وترفع عند اللزوم ----------
    steps.append(dict(k='area', t='مساحة القواعد',
                      v='مجموع مساحات الأسس %.1f م² = %.0f%% من مساحة البناء · '
                        'أكبر قاعدة %.2f م وأقل بحر %.2f م' % (sA, ratio * 100, Bmax, spacing),
                      r='المساحة تفصل بين خيارات النطاق الواحد، ولا تُنزل النوع تحت حكم التربة'))
    if overlap:
        raise_to('combined', 'أبعاد القاعدة المنفردة (%.2f م) تتجاوز 90%% من البحر '
                             '(%.2f م) — القواعد تتلامس فتُدمج بقاعدة مشتركة'
                 % (Bmax, spacing), 'overlap')
    if ratio > 0.55:
        raise_to('raft', 'مساحات القواعد تتجاوز 55% من مساحة البناء — الحصيرة أوفر '
                         'تنفيذاً من قواعد تكاد تتلاصق، وتوحّد الهبوط', 'ratio55')
    elif ratio > 0.35:
        raise_to('combined', 'مساحات القواعد بين 35% و55% من مساحة البناء — '
                             'الدمج بقواعد مشتركة يوزّع الحمل ويقلّل الهبوط التفاضلي', 'ratio35')
    if ratio > 1.0:
        if q_raft <= qa:
            raise_to('raft', 'المساحة المطلوبة تتجاوز مساحة البناء (%.0f%%) لكن حصيرة '
                             'كاملة تعطي ضغطاً %.0f kPa ضمن التحمّل %.0f kPa'
                     % (ratio * 100, q_raft, qa), 'raftok')
        else:
            raise_to('piles', 'حتى الحصيرة الكاملة تعطي ضغطاً %.0f kPa وهو أكبر من '
                              'تحمّل التربة %.0f kPa — لم يبقَ أساس سطحي ممكن'
                     % (q_raft, qa), 'raftfail')

    # ---------- الخطوة ٣: الهبوط — حالة حدّية تُفحص دائماً ----------
    # التحمّل والهبوط فحصان **منفصلان**: قد يمرّ التحمّل ويرسب الهبوط، والهبوط
    # هو الذي يشقّق البناء. ولهذا يُفحص بكل نطاق لا بالنطاقات الضعيفة فقط.
    def chk(t):
        return settlement(dict(qa=qa, kind=kind, typ=t, Df=Df, gamma=gam,
                               Hmax=p.get('comp_depth'),
                               q=(q_raft if t == 'raft' else q_net),
                               B=(math.sqrt(footprint) if t == 'raft' else Bmax)))

    st = chk(typ)
    steps.append(dict(k='settle', t='تحقّق الهبوط (على %s)' % FOUND_NAME[typ],
                      v='%.1f مم مقابل المسموح %.0f مم' % (st['S'], st['limit']),
                      r=(st['src'] + ' — ' + ('مقبول' if st['ok'] else 'راسب'))))
    if not st['ok'] and typ in ('isolated', 'combined'):
        raise_to('raft', 'الهبوط المقدَّر %.0f مم يتجاوز المسموح %.0f مم للقاعدة '
                         'المنفردة — الحصيرة توحّد الهبوط فيصغر التفاضلي، ويرتفع '
                         'المسموح إلى 50 مم' % (st['S'], st['limit']), 'settle_up')
        st = chk(typ)                      # يُعاد الفحص بهندسة الحصيرة لا القاعدة
        steps.append(dict(k='settle2', t='إعادة تحقّق الهبوط (على الحصيرة)',
                          v='%.1f مم مقابل المسموح %.0f مم' % (st['S'], st['limit']),
                          r='مقبول' if st['ok'] else 'ما زال راسباً'))
    if not st['ok'] and typ == 'raft':
        raise_to('piles', 'الهبوط المقدَّر %.0f مم يتجاوز المسموح %.0f مم حتى '
                          'بالحصيرة — لا يبقى إلا نقل الحمل لطبقة أعمق'
                 % (st['S'], st['limit']), 'settle_pile')

    if band['key'] == 'fair':
        alts.append('قواعد واسعة بدل الحصيرة إن كانت الأعمدة متباعدة وأحمالها متقاربة '
                    '— بشرط تحقّق الهبوط لكل قاعدة على حدة')
    if band['key'] in ('poor', 'unfit'):
        alts.append('الإحلال: استبدال التربة الضعيفة بطبقات سبيس مدكوكة ثم أساس سطحي '
                    '— أرخص من الركائز إذا كانت الطبقة الضعيفة سطحية فقط')
    if typ == 'isolated':
        alts.append('أسس شريطية إذا كانت الأعمدة قريبة على محور واحد')
    if typ == 'combined':
        alts.append('حصيرة إذا زاد التداخل بأكثر من اتجاه')
    if typ == 'raft':
        alts.append('أسس مشتركة إذا كانت الأحمال متقاربة والتربة متجانسة')

    # ---------- الخطوة ٤: جدول الركائز — أسباب التربة تفرض ولا تُرفَض ----------
    pl = pile_case(dict(p, q_net=q_net, q_raft=q_raft, avg_press=avg_press,
                        ratio=ratio, typ=typ, band=band, Bmax=Bmax, floors=floors,
                        settle=st, soil_kind=kind))
    warn = pl['triggers']
    if pl['need'] and typ != 'piles':
        alts.insert(0, 'كان المقترح «%s» بحسب التربة والمساحة، لكن جدول الركائز يمنعه'
                    % FOUND_NAME[typ])
        raise_to('piles', 'جدول الركائز: ' + ' · '.join(warn), 'pile_rule')
    elif typ == 'piles' and not pl['need']:
        alts.insert(0, 'قبل الركائز: استبدال تربة أو أساس معوَّض أو تكبير الحصيرة')

    # ---------- الخطوة ٥: الإحلال — يُفحص **قبل** قبول الركائز ----------
    # هذه الخطوة الوحيدة التي يجوز فيها **تنزيل** النوع، والسبب أن التربة نفسها
    # تُستبدَل فعلاً: لم تعد تربة الموقع الضعيفة بل طبقة سبيس مصنّعة تحمّلها
    # 250 kPa. القاعدة «الترقية فقط» كانت تمنع المساحة من إلغاء حكم التربة —
    # وهنا لا تُلغى التربة، تُغيَّر.
    rep = None
    if typ == 'piles':
        rep = replacement(dict(weak_depth=p.get('weak_depth'), floors=floors,
                               q_contact=q_raft, footprint=footprint,
                               gwt=p.get('gwt'), Df=Df))
        steps.append(dict(k='replace', t='الإحلال قبل الركائز',
                          v=('عمق الضعيف %.1f م · الحدّ العملي %.1f م · ضغط التماس %.0f kPa'
                             % (rep['depth'], rep['limit'], rep['q_contact']))
                            if rep.get('depth') is not None else rep.get('reason', ''),
                          r=('يكفي الإحلال — لا حاجة للركائز' if rep['ok']
                             else 'لا يكفي الإحلال — تبقى الركائز')))
        if rep['ok']:
            # الهبوط يُعاد حسابه على **الوضع بعد الإحلال**: الطبقة المستبدَلة
            # قاسية، والانضغاط يبقى فيما تحتها فقط.
            qa2 = min(REPLACE_QA, float(p.get('qa_under') or REPLACE_QA))
            h_left = p.get('comp_depth')
            if h_left is not None:
                h_left = max(0.5, float(h_left) - rep['depth'])
            st = settlement(dict(qa=qa2, kind=kind, typ='raft', Df=Df, gamma=gam,
                                 Hmax=h_left, q=q_raft,
                                 B=math.sqrt(footprint) if footprint else Bmax))
            steps.append(dict(k='settle3', t='الهبوط بعد الإحلال',
                              v='%.1f مم مقابل المسموح %.0f مم' % (st['S'], st['limit']),
                              r='الانضغاط يبقى بما تحت الطبقة المستبدَلة فقط '
                                '(%s م)' % ('%.1f' % h_left if h_left else '—')))
            band2 = soil_band(REPLACE_QA)
            typ = band2['base']
            if overlap:
                typ = 'combined'
            elif ratio > 0.55:
                typ = 'raft'
            reasons = ['**الإحلال بدل الركائز**: التربة الضعيفة سطحية (%.1f م) '
                       'والمبنى خفيف (%d طوابق) — تُحفر وتُستبدل بسبيس مدكوك '
                       'تحمّله %d kPa، فيصير الأساس سطحياً عادياً'
                       % (rep['depth'], floors, int(REPLACE_QA))] + reasons
            reasons.append(rep['spec'])
            alts.insert(0, 'الركائز تبقى بديلاً إن أظهر تقرير الجسّات أن الضعيف '
                           'أعمق ممّا قُدّر')
            steps.append(dict(k='replace_done', t='النوع بعد الإحلال',
                              v=FOUND_NAME[typ],
                              r='الأساس يجلس على الطبقة المستبدَلة لا على تربة الموقع'))

    return dict(type=typ, name=FOUND_NAME[typ], ratio=ratio, sum_area=sA, areas=areas,
                total=total, reasons=reasons, alts=alts, warn=warn, q_net=q_net,
                avg_press=avg_press, Bmax=Bmax, overlap=overlap, floors=floors, piles=pl,
                band=band, bands=BEAR_BANDS, steps=steps, settle=st, q_raft=q_raft,
                replace=rep,
                rule='القرار بترتيب ثابت: نطاق تحمّل التربة ← مساحة القواعد ← الهبوط ← '
                     'جدول الركائز ← **الإحلال**. كل خطوة ترفع النوع ولا تُنزله، '
                     'إلا الإحلال: هناك تُستبدَل التربة نفسها فيُعاد القرار على '
                     'الطبقة الجديدة. والركائز آخر الحلول لا أولها.',
                need_piles=(typ == 'piles'))


# ------------------------- متى الركائز فعلاً؟ (وقلّما تكون) -------------------------
#: **جدول قرار الركائز** — تحمّل جيد وحده لا يكفي حكماً. تربة بـ 180 kPa قد
#: تُبنى عليها قواعد سطحية وقد تُوجب ركائز، والفارق هذه الشروط الستة لا غير.
#: (المفتاح · الشرط · الحكم · هل يوجب ركائز · شرح · العتبة الرقمية المطبَّقة)
PILE_TABLE = [
    dict(k='shallow_ok',
         cond='تحمّل ضمن نطاق جيد + سماكة الطبقة الحاملة كبيرة + 3–4 طوابق + لا ماء مؤثّر',
         verdict='قواعد سطحية — بدون ركائز', piles=False,
         why='هذه الحالة الطبيعية: الطبقة الحاملة تمتدّ تحت بصلة الإجهاد كلها، '
             'والحمل معتدل، فالأساس السطحي يكفي ويوفّر أضعاف كلفة الركائز',
         gate='لا يشتعل أي شرط من الخمسة أدناه، وتحمّل التربة 150 kPa فأكثر'),
    dict(k='thin_layer',
         cond='الطبقة الحاملة قليلة السماكة وتحتها طبقة ضعيفة',
         verdict='ركائز', piles=True,
         why='القاعدة تنجح على الطبقة العليا وتثقبها إلى الضعيفة تحتها. '
             'بصلة الإجهاد تنزل حتى 2B تحت القاعدة، فإن انتهت الطبقة الحاملة '
             'قبل ذلك فالحمل يصل الضعيفة كاملاً',
         gate='سماكة الطبقة الحاملة أقل من ضعف عرض القاعدة، مع طبقة أضعف تحتها'),
    dict(k='heavy',
         cond='مبنى عالٍ أو أحمال ضخمة',
         verdict='ركائز', piles=True,
         why='القاعدة تكبر حتى تصير حصيرة، والحصيرة نفسها تهبط لأن بصلة إجهادها '
             'تنزل بعمق عرضها — والركيزة تنقل الحمل تحت البصلة كلها',
         gate='عدد الطوابق عشرة فأكثر (خارج نطاق الصخر والرمل الكثيف)، أو عرض القاعدة المنفردة المطلوب أكبر من 6.0 م'),
    dict(k='settle',
         cond='الهبوط المتوقّع أكبر من المسموح',
         verdict='ركائز أو لبشة سميكة', piles=True,
         why='التحمّل يمرّ والهبوط يرسب — وهما فحصان منفصلان. الهبوط هو الذي '
             'يشقّق البناء، لا انهيار القص',
         gate='الهبوط المقدَّر يتجاوز المسموح (25 مم منفردة · 50 مم حصيرة) حتى بالحصيرة'),
    dict(k='swell',
         cond='طين انتفاخي',
         verdict='ركائز', piles=True,
         why='الانتفاخ يرفع الأساس بالشتاء ويهبطه بالصيف فيشقّق البناء من الأسفل، '
             'والركيزة تُمرَّر تحت المنطقة النشطة وتُعزَل عنها',
         gate='خانة «طين انتفاخي» مؤشّرة بالمعالج'),
    dict(k='water_salt',
         cond='ماء جوفي عالٍ وأملاح/كبريتات عالية',
         verdict='ركائز + خرسانة مقاومة للكبريتات', piles=True,
         why='الماء يرفع الضغط المسامي فيخفض التحمّل الفعّال، والكبريتات تهاجم '
             'الخرسانة تحت الأرض — فتلزم ركائز وخلطة مقاومة (ACI 19.3 صنف S2/S3)',
         gate='منسوب الماء فوق قاعدة الأساس، مع خانة «أملاح/كبريتات عالية»'),
]

#: أسباب التربة التي **تُوجب** التأسيس العميق بذاتها (تُفحص فوق الجدول أعلاه).
PILE_SOIL_CASES = [
    ('fill',      'ردم غير مدكوك أو نفايات بناء تحت الأساس',
     'الردم يهبط بالزمن ولو خفّ الحمل — لا يُحسب له تحمّل إطلاقاً'),
    ('sabkha',    'سبخة أو طين طري جداً — التحمّل 40 kPa أو أقل',
     'الهبوط التضاغطي يستمر سنوات ويتجاوز المسموح مهما كبر الأساس'),
    ('soft',      'طين طري (التحمّل 60 kPa أو أقل) مع حمل لا تحمله حصيرة كاملة',
     'الحصيرة توحّد الهبوط لكنها لا تلغيه — والطين الطري يهبط كلياً'),
    ('gypsum',    'تربة جبسية انهيارية (Collapsible Gypseous Soil)',
     'الجبس يذوب بالماء فتنهار البنية فجأة — وهذه أخطر تربة بوسط وغرب العراق، '
     'وانهيارها لا ينذر ولا يُقاس بفحص التحمّل الجاف'),
    ('liquefy',   'رمل مفكك مشبع تحت منسوب ماء جوفي عالٍ (خطر تميّع زلزالي)',
     'الرمل المفكك المشبع يفقد تحمّله كلياً لحظة الهزة'),
    ('capacity',  'حتى الحصيرة الكاملة لا تحمل — الضغط يتجاوز التحمّل',
     'لم يبقَ أساس سطحي ممكن'),
    ('uplift',    'قوى شدّ أو قلب على الأعمدة (صوامع · أبراج · جدران قص طويلة)',
     'الأساس السطحي لا يقاوم الشدّ إلا بوزنه، والركيزة تقاومه باحتكاكها'),
]


def pile_case(p):
    """هل تلزم الركائز فعلاً؟ — بجدول شروط مكتوب، لا بتقدير.

    يُفحص مساران ويُجمعان: أسباب التربة الخمسة أعلاه (PILE_SOIL_CASES) التي
    تُبطل التأسيس السطحي أصلاً، وجدول الشروط الستة (PILE_TABLE) الذي يفصل —
    عند تحمّل جيد نفسه — بين «قواعد سطحية» و«ركائز». كل صفّ يخرج بعتبته الرقمية
    وبقيمة المشروع المقابلة لها، فيُرى **لماذا** اشتعل أو لم يشتعل.
    """
    q_net = float(p.get('q_net', 0.0))
    qa = float(p.get('qa', 0.0))
    kind = p.get('soil_kind') or ''
    name = p.get('soil') or ''
    gwt = p.get('gwt')
    Df = float(p.get('Df', 1.5))
    q_raft = float(p.get('q_raft', 0.0))
    floors = int(p.get('floors', 1))
    Bmax = float(p.get('Bmax', 0.0))
    st = p.get('settle') or {}
    bear_thk = float(p.get('bear_thk') or 0.0)      # سماكة الطبقة الحاملة م (0 = غير مُدخَلة)
    weak_below = bool(p.get('weak_below'))
    salts = bool(p.get('salts'))
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
    if q_raft > qa > 0:
        add('capacity')
    if p.get('uplift'):
        add('uplift')

    # ------------------- جدول الشروط الستة، صفّاً صفّاً -------------------
    bulb = 2.0 * Bmax                                  # عمق بصلة الإجهاد
    gw_high = gwt is not None and float(gwt) > -(Df + 0.5)
    rows = []
    fired = {}
    for c in PILE_TABLE:
        k = c['k']
        if k == 'thin_layer':
            on = bear_thk > 0 and weak_below and bear_thk < bulb
            val = ('سماكة الطبقة الحاملة %.1f م مقابل بصلة الإجهاد (ضعف العرض) %.1f م · '
                   'طبقة ضعيفة تحتها: %s'
                   % (bear_thk, bulb, 'نعم' if weak_below else 'لا')) if bear_thk > 0 \
                else 'سماكة الطبقة الحاملة غير مُدخَلة — أدخلها من تقرير الجسّات ليُفحص الشرط'
        elif k == 'heavy':
            # الارتفاع وحده لا يوجب ركائز على **صخر أو رمل كثيف**: هناك القاعدة
            # تبقى صغيرة مهما ثقل الحمل. الشرط للنطاقات الأضعف فقط، وهو ما يعنيه
            # الجدول حين يضع «مبنى عالٍ» عند 180 kPa لا عند 400.
            band_key = (p.get('band') or {}).get('key', 'good')
            tall = floors >= 10 and band_key != 'excellent'
            # 6 م: أوسع قاعدة منفردة تُنفَّذ عملياً. ما بينها وبين 4 م تعالجه
            # ترقية النوع بالمساحة (مشتركة ← حصيرة) لا الركائز.
            wide = Bmax > 6.0
            on = tall or wide
            val = ('الطوابق %d (العتبة عشرة%s) · أكبر قاعدة مطلوبة %.2f م (العتبة 6.00 م)'
                   % (floors, '، ولا تُطبَّق على الصخر والرمل الكثيف'
                      if band_key == 'excellent' else '', Bmax))
        elif k == 'settle':
            on = bool(st) and not st.get('ok', True)
            val = ('الهبوط المقدَّر %.1f مم مقابل المسموح %.0f مم'
                   % (st.get('S', 0.0), st.get('limit', 25.0))) if st else 'لم يُحسب'
        elif k == 'swell':
            on = bool(p.get('expansive'))
            val = 'خانة «طين انتفاخي»: %s' % ('مؤشّرة' if on else 'غير مؤشّرة')
        elif k == 'water_salt':
            on = gw_high and salts
            val = ('الماء الجوفي %s · أملاح/كبريتات عالية: %s'
                   % (('على %.2f م وهو فوق قاعدة الأساس %.2f م'
                       % (float(gwt), -(Df + 0.5))) if gwt is not None else 'غير مُدخَل',
                      'نعم' if salts else 'لا'))
        else:                                           # shallow_ok — يُحسم بعد الباقي
            on = False
            val = ''
        fired[k] = on
        if on and c['piles']:
            trig.append(c['cond']); why.append(c['why'])
        rows.append(dict(c, on=on, value=val))

    others = any(fired[c['k']] for c in PILE_TABLE if c['k'] != 'shallow_ok')
    rows[0]['on'] = (not others) and not trig and qa >= 150.0
    rows[0]['value'] = ('لا يشتعل أي شرط · qa = %.0f kPa · الطوابق %d' % (qa, floors))

    need = bool(trig)
    sulfate = fired.get('water_salt', False) or bool(p.get('gypseous'))
    return dict(need=need, triggers=trig, why=why,
                soil=name, kind=kind, q_net=q_net, q_raft=q_raft,
                cases=[dict(k=k, t=t, w=w) for k, t, w in PILE_SOIL_CASES],
                table=rows, fired=fired, sulfate=sulfate, bulb=bulb,
                bear_thk=bear_thk, weak_below=weak_below,
                sulfate_note=('الماء والأملاح يوجبان خلطة مقاومة للكبريتات: '
                              'صنف تعرّض S2 على الأقل — f\'c لا تقل عن 31 ميغا و w/cm لا تزيد على 0.45 '
                              'وإسمنت مقاوم نوع V (جدول ACI 318-19 رقم 19.3.2.1)')
                             if sulfate else '',
                verdict=('الركائز لازمة: ' + ' · '.join(trig)) if need
                        else ('لا شرط من شروط الركائز الستة مشتعل — الأساس السطحي '
                              'كافٍ. الركائز أساس **استثنائي** كلفته أضعاف السطحي '
                              'وتحتاج جسّاً وفحص تحميل.'),
                rule='تحمّل جيد وحده لا يعني «بدون ركائز»: تربة 180 kPa قد تُبنى '
                     'عليها قواعد سطحية وقد تُوجب ركائز، والفارق سماكة الطبقة '
                     'الحاملة وما تحتها · الحمل والارتفاع · الهبوط · الانتفاخ · '
                     'الماء والأملاح — وهذه الستة تُفحص بعتباتها أعلاه.')

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
    h = 400.0; cov = 75.0; ls = 1.0
    for _ in range(80):
        d = h - cov - 20.0
        ls = E.lambda_s(d)                     # ACI 318-19 §22.5.5.1.3 — أثر الحجم
        b0 = 2 * (cx + d) + 2 * (cy + d)
        beta = max(cx, cy) / min(cx, cy)
        # جدول 22.6.5.2 — و αs = 40 للعمود الداخلي (المحيط مغلق من جهاته الأربع)
        vc = ls * min(0.33, 0.17 * (1 + 2 / beta),
                      0.083 * (2 + 40 * d / b0)) * math.sqrt(fc)
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
                lambda_s=ls, cover=cov, clause='ACI 318-19 جدول 22.6.5.2 · §22.5.5.1.3',
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


def _capacity(soil, D, L, cu, N, kind, FS=2.5):
    """قدرة ركيزة واحدة — تُستدعى من التصميم ومن اختيار الأبعاد بالسواء."""
    Ab = math.pi * D * D / 4.0; As = math.pi * D * L
    if soil == 'clay':
        al = _alpha(cu); fs = al * cu
        Qs = fs * As; qb = 9.0 * cu; Qb = qb * Ab
        steps = [("طريقة الحساب", "طريقة α للتربة الطينية (Tomlinson / API)"),
                 ("معامل الالتصاق α", "%.2f (من cu = %.0f kPa)" % (al, cu)),
                 ("احتكاك الجانب fs", "α·cu = %.1f kPa" % fs),
                 ("مساحة الجانب As", "π·D·L = %.2f م²" % As),
                 ("مقاومة الجانب Qs", "fs·As = %.0f kN" % Qs),
                 ("مقاومة القاعدة qb", "9·cu = %.0f kPa" % qb),
                 ("مقاومة القاعدة Qb", "qb·Ab = %.0f kN" % Qb)]
    else:
        k = 2.0 if kind == 'driven' else 1.0      # Meyerhof
        fs = min(k * N, 100.0)
        Qs = fs * As
        qb = min(40.0 * N * (L / D), 400.0 * N) * (1.0 if kind == 'driven' else 0.4)
        Qb = qb * Ab
        steps = [("طريقة الحساب", "طريقة Meyerhof بالاعتماد على SPT للتربة الرملية"),
                 ("عدد الضربات N", "%.0f" % N),
                 ("احتكاك الجانب fs", "%s·N = %.1f kPa (حد أقصى 100)"
                  % ("2" if kind == 'driven' else "1", fs)),
                 ("مساحة الجانب As", "π·D·L = %.2f م²" % As),
                 ("مقاومة الجانب Qs", "fs·As = %.0f kN" % Qs),
                 ("مقاومة القاعدة qb", "%.0f kPa" % qb),
                 ("مقاومة القاعدة Qb", "qb·Ab = %.0f kN" % Qb)]
    W = Ab * L * 24.0 * 0.6                        # وزن الركيزة الصافي التقريبي
    Qu = Qs + Qb
    return dict(Ab=Ab, As=As, Qs=Qs, Qb=Qb, Qu=Qu, W=W, FS=FS,
                Qall=(Qu - W) / FS, steps=steps)


#: أقطار الركائز القياسية لكل نوع تنفيذ — القطر يُختار **من هذا السُّلَّم** لا
#: من رقم افتراضي ثابت، والتباعد بعده s = 3D فيتغيّر معه.
PILE_D_LADDER = {
    'bored':  (0.40, 0.50, 0.60, 0.80, 1.00, 1.20, 1.50),
    'driven': (0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60),
    'cfa':    (0.40, 0.50, 0.60, 0.80, 1.00),
    'micro':  (0.15, 0.20, 0.25, 0.30),
}
COMPETENT_QA = 250.0      # kPa — أدنى تحمّل تُعدّ عنده الطبقة «حاملة للركيزة»
PILE_L_MIN = 6.0
PILE_L_MAX = 30.0


def pile_geometry(p):
    """**طول الركيزة من التربة وقطرها من الحمل** — لا قيمة افتراضية ثابتة.

    الخطأ الذي كان: D = 0.60 م و L = 15 م مكتوبتان بالبرنامج مهما تغيّرت التربة
    أو الحمل، فتخرج القدرة نفسها فيخرج العدد نفسه (ثلاث ركائز) بكل مشروع —
    وهذا ما يبدو «عشوائياً» وهو في الحقيقة **ثابت** لا عشوائي.

    الصحيح: الطول تقرّره **الطبقة الحاملة** — تُمدّ الركيزة حتى تخترق أول طبقة
    تحمّلها ≥ 250 kPa بمقدار غرزة (Socket) = 3D على الأقل. فإن لم توجد طبقة
    حاملة ضمن المدى العملي فهي **ركيزة احتكاك** ويُزاد طولها حتى تكفي. والقطر
    يُختار من السُّلَّم القياسي: أصغر قطر تكفي معه المجموعة الدنيا (ثلاث ركائز)،
    فإن لم يكفِ أكبر قطر زِيد العدد.
    """
    beds = p.get('beds') or []
    fb = float(p.get('fb', -1.5))                 # منسوب قاعدة الهامة (سالب)
    P = float(p.get('P', 1200.0))
    soil = p.get('soil', 'clay')
    kind = p.get('kind', 'bored')
    cu = float(p.get('cu', 60.0)); N = float(p.get('N', 20.0))
    FS = float(p.get('FS', 2.5))
    n_min = int(p.get('n_min', 1))
    P_tot = float(p.get('P_total') or 0.0)
    n_cols = int(p.get('n_cols') or 0)
    fp = float(p.get('footprint') or 0.0)
    ladder = PILE_D_LADDER.get(kind, PILE_D_LADDER['bored'])

    # ---- الطبقة الحاملة: أول طبقة تحت قاعدة الهامة تحمّلها ≥ 250 kPa ----
    target = None
    for b in beds:
        if b.get('bottom', 0.0) < fb - 0.05 and float(b.get('qa') or 0.0) >= COMPETENT_QA:
            target = b
            break
    reach = max(0.0, fb - float(target['top'])) if target else 0.0

    cands = []
    for D in ladder:
        if target:
            socket = max(3.0 * D, 1.0)
            L = math.ceil((reach + socket) * 2) / 2.0        # تقريب لأقرب 0.5 م
            L = min(PILE_L_MAX, max(PILE_L_MIN, L))
            grow = False
        else:
            L = PILE_L_MIN
            grow = True
        # **حدّ فيزيائي**: المساحة لا تتسع لأكثر من fp/(3D)² ركيزة، لأن أقلّ
        # تباعد 3D. فإن طلب الحمل عدداً أكبر ممّا تتسع له الأرض، لا يُحلّ
        # بحشر الركائز — تُطوَّل الركيزة فيزيد احتكاكها الجانبي وتقلّ العدد.
        n_max = int(fp / (3.0 * D) ** 2) if fp > 0 else 0
        for _ in range(60):
            cap = _capacity(soil, D, L, cu, N, kind, FS)
            n = max(n_min, math.ceil(P / max(cap['Qall'], 1.0)))
            nr = math.ceil(P_tot / max(cap['Qall'], 1.0)) if P_tot > 0 else 0
            tight = bool(n_max and nr > n_max)
            if (not grow and not tight) or L >= PILE_L_MAX or (n <= n_min and not tight):
                break
            L = min(PILE_L_MAX, L + 1.0)                     # طوِّلها: احتكاك أكثر
        util = P / max(n * cap['Qall'], 1.0)
        # **العدد الكلي هو معيار المفاضلة**، لا عدد ركائز عمود واحد. القطر
        # الأكبر يرفع القدرة فيقلّ العدد ويتّسع التباعد — وهذا هو المطلوب:
        # ركائز قليلة متباعدة لا مئات متلاصقة.
        n_req = max(1, math.ceil(P_tot / max(cap['Qall'], 1.0))) if P_tot > 0 else 0
        if n_req and n_cols and n_req <= n_cols:
            n_all = n_req                       # ركائز تحت حصيرة
        elif n_cols:
            n_all = max(n_req, n * n_cols)      # مجموعات تحت الأعمدة
        else:
            n_all = n
        fits = (not n_max) or n_req <= n_max
        cands.append(dict(D=D, L=L, n=n, util=util, Qall=cap['Qall'],
                          socket_ok=bool(target), n_req=n_req, n_all=n_all,
                          n_max=n_max, fits=fits))
        if fits and n_req and n_cols and n_req <= n_cols:
            break                               # بلغنا وضع الحصيرة — لا داعي لتكبير أكثر

    # ---- الاختيار: أقلّ عدد، ثم **أكبر قطر** ضمن هامش 15% ----
    # المفاضلة بالعدد وحده تختار أصغر قطر: بالطين الطري تنمو قدرة الركيزة
    # خطياً مع القطر (احتكاك) بينما تنمو المساحة التي تشغلها بمربّعه، فيبدو
    # القطر الصغير «أكفأ» عددياً. لكن المنفَّذ بالواقع ركائز **أقلّ وأكبر
    # وأوسع تباعداً** — أرخص تنفيذاً وأسهل تدقيقاً. فيُؤخذ أكبر قطر لا يزيد
    # عدده على أقلّ عدد ممكن بأكثر من 15%.
    ok_c = [c for c in cands if c['fits']] or cands
    nbest = min(c['n_all'] for c in ok_c)
    best = max([c for c in ok_c if c['n_all'] <= nbest * 1.15], key=lambda c: c['D'])

    why = []
    if target:
        why.append('الطول من التربة: قاعدة الهامة على %.2f م وأول طبقة حاملة '
                   '(%s · %d kPa) تبدأ على %.2f م، فالاختراق %.1f م + غرزة '
                   '(Socket) لا تقل عن 3D = %.1f م ⇒ **L = %.1f م**'
                   % (fb, target.get('name', ''), int(target.get('qa') or 0),
                      float(target['top']), reach, max(3.0 * best['D'], 1.0), best['L']))
    else:
        why.append('لا توجد طبقة تحمّلها %d kPa فأكثر ضمن %d م — فهي **ركيزة احتكاك** '
                   '(Friction Pile) وطولها %.1f م هو ما تلزمه القدرة لا ما تلزمه '
                   'طبقة' % (int(COMPETENT_QA), int(PILE_L_MAX), best['L']))
    why.append('القطر من **العدد الكلي**: حمل المبنى كله %.0f kN وقدرة الركيزة '
               'الواحدة %.0f kN، فالمطلوب %d ركيزة للمبنى — والقطر المختار '
               '**Ø%.2f م** هو أصغر قطر بالسُّلَّم %s يبلغ هذا العدد. (تكبير '
               'القطر يرفع القدرة فيقلّ العدد ويتّسع التباعد.)'
               % (P_tot, best['Qall'], best.get('n_all') or best['n'], best['D'],
                  str(tuple(ladder))))
    why.append('والتباعد تابع للقطر: s = 3D = %.2f م — لا رقم مكتوب باليد. '
               'أقل من 3D تتداخل بصلات الإجهاد فتنهار كفاءة المجموعة، وأكثر '
               'من 3D تكبر الهامة بلا فائدة.' % (3.0 * best['D']))
    dense = bool(fp and best['n_req'] and best['n_req'] / fp > 0.25)
    if not best.get('fits', True):
        why0 = ('المساحة لا تتسع للعدد المطلوب: تحتاج %d ركيزة والأرض تسع %d '
                'بأقلّ تباعد 3D. الحلّ ركائز **أعمق** حتى طبقة أقوى (تحتاج جسّة '
                'أعمق من %d م)، أو نظام أساس آخر — والمرجع التقرير الجيوتقني.'
                % (best['n_req'], best['n_max'], int(PILE_L_MAX)))
    elif dense:
        why0 = ('كثافة الركائز عالية: ركيزة لكل %.1f م² (تباعد أقلّ من مترين). '
                'هذا مؤشّر على أن **الموقع لا يصلح لهذا المبنى بهذا العمق** — '
                'المطلوب جسّة أعمق تبحث عن طبقة حاملة حقيقية، أو تحسين تربة '
                '(Stone Columns / حقن)، أو تقليل ارتفاع المبنى.'
                % (fp / max(best['n_req'], 1)))
    else:
        why0 = None
    return dict(D=best['D'], L=best['L'], n=best['n'], util=best['util'], dense=dense,
                n_req=best.get('n_req', 0), n_all=best.get('n_all', best['n']),
                n_max=best.get('n_max', 0), fits=best.get('fits', True), warn=why0,
                Qall=best['Qall'], target=target, reach=reach, ladder=list(ladder),
                spacing=3.0 * best['D'], why=why,
                rule='L من الطبقة الحاملة · D من الحمل · s = 3D — ثلاثة مقادير '
                     'مشتقّة، وليس فيها رقم افتراضي واحد.')


def group_eff(n, soil, D, s):
    """ترتيب المجموعة وكفاءتها — Converse-Labarre. تُستعمل بالتصميم وبالعدّ."""
    if n == 3:
        m, rows = 3, 1                           # مثلث متطابق الأضلاع
    else:
        m = 1 if n == 1 else (2 if n <= 4 else 3)
        rows = max(1, math.ceil(n / m))
    if n == 1:
        return m, rows, 1.0
    if soil != 'clay' and s >= 3 * D:
        return m, rows, 1.0                      # تُهمل بالرملية عند 3D
    th = math.degrees(math.atan(D / s))
    if n == 3:
        return m, rows, 1.0 - th / 90.0 * (2.0 / 3.0)
    e = 1.0 - th / 90.0 * ((rows - 1) * m + (m - 1) * rows) / (m * rows)
    return m, rows, e


def piles_for(P, Qall, soil, D, s, n_min=2):
    """عدد الركائز تحت عمود حمله P — **بحمله هو** لا بحمل أثقل عمود بالمبنى.

    كان العدّ يضرب عدد ركائز أثقل عمود بعدد الأعمدة كلها، فيخرج المبنى بعدد
    ركائز أكبر من الحقيقي بمرّة ونصف: الأعمدة الركنية تحمل ربع حمل الداخلي
    وتأخذ ركائزه نفسها.
    """
    n = max(n_min, math.ceil(P / max(Qall, 1.0)))
    for _ in range(40):
        m, rows, eff = group_eff(n, soil, D, s)
        if n * Qall * eff >= P:
            break
        n += 1
    m, rows, eff = group_eff(n, soil, D, s)
    if n != 3:
        n = max(n, m * rows)
    return n


def pile(p):
    """قدرة الركيزة المفردة والمجموعة."""
    soil = p.get('soil', 'clay')
    D = float(p.get('D', 0.6)); L = float(p.get('L', 15.0))
    P = float(p.get('P', 1200.0))                 # حمل خدمة للعمود kN
    FS = float(p.get('FS', 2.5))
    kind = p.get('kind', 'bored')
    gam = float(p.get('gamma', 18.0))
    cap0 = _capacity(soil, D, L, float(p.get('cu', 60.0)), float(p.get('N', 20.0)),
                     kind, FS)
    Ab, As = cap0['Ab'], cap0['As']
    Qs, Qb, Qu, W = cap0['Qs'], cap0['Qb'], cap0['Qu'], cap0['W']
    steps = cap0['steps']
    Qall = cap0['Qall']
    s = 3.0 * D                                    # التباعد بين الركائز

    def group(n):
        return group_eff(n, soil, D, s)

    # ---- العدد من **الحمل الكلي**، لا ثلاث ركائز تحت كل عمود ----
    # الخطأ الذي كان: يُفرض حدّ أدنى ثلاث ركائز تحت **كل** عمود، فيخرج بيت
    # 200 م² بطابقين على ٤٨ ركيزة. والحقيقة أن حمله الكلي ≈ 2000 kN وركيزة
    # واحدة تحمل 250 kN، فثمان ركائز تكفي **المبنى كله**.
    #
    # فالترتيب يُقرَّر من العدد المطلوب مقابل عدد الأعمدة:
    #   * العدد ≤ الأعمدة ⇒ **ركائز تحت حصيرة** (Piled Raft): الركائز على شبكة
    #     واسعة تحت الحصيرة، والحصيرة نفسها تربطها فلا تحتاج هامات ولا مجموعات.
    #     وهنا **الركيزة المفردة مقبولة** لأن الحصيرة تقيّد رأسها.
    #   * العدد > الأعمدة ⇒ مجموعات تحت الأعمدة، وعندها يسري منع الركيزة
    #     المفردة تحت هامة معزولة.
    P_tot = float(p.get('P_total') or 0.0)
    n_cols = int(p.get('n_cols') or 0)
    fp = float(p.get('footprint') or 0.0)
    n_req = max(1, math.ceil(P_tot / max(Qall, 1.0))) if P_tot > 0 else 0
    # **الترتيب يتبع نوع الأساس الفوقي.** إن كان أساس المبنى حصيرة (أو كانت
    # القواعد ستتلاصق أصلاً) فالركائز تحتها على شبكة — وهذا هو «Piled Raft»
    # المنفَّذ فعلاً بالأبراج. ولا يُبنى ١٥ ركيزة بهامة تحت كل عمود: ذلك ترتيب
    # لا يُنفَّذ بالواقع، وكان البرنامج يخرج به ١٨٦٩ ركيزة لبرج مساحته 3000 م².
    raft_base = bool(p.get('raft_base'))
    raft_mode = bool(fp > 0 and n_req and (raft_base or (n_cols and n_req <= n_cols)))

    if raft_mode:
        # شبكة ركائز تحت الحصيرة — التباعد من المساحة لا من القطر.
        # كفاءة المجموعة تُحسب على تباعد الشبكة وتُرفع بها العدد.
        _e0 = group_eff(max(4, n_req), soil, D, max(3.0 * D, math.sqrt(fp / max(n_req, 1))))[2]
        n_total = max(1, int(math.ceil(n_req / max(_e0, 0.5))))
        ar = max(0.25, min(4.0, float(p.get('aspect') or 1.0)))
        gx = max(2, int(round(math.sqrt(n_total * ar))))
        gy = max(2, int(math.ceil(n_total / float(gx))))
        n_total = gx * gy
        sx_ = math.sqrt(fp * ar) / max(1, gx - 1) if gx > 1 else math.sqrt(fp * ar)
        sy_ = math.sqrt(fp / ar) / max(1, gy - 1) if gy > 1 else math.sqrt(fp / ar)
        s = max(3.0 * D, min(sx_, sy_))
        m, rows, eff, n, tri = gx, gy, 1.0, 1, False
    else:
        n_min = int(p.get('n_min', 2))
        n = max(n_min, math.ceil(P / max(Qall, 1.0)))
        for _ in range(40):                        # زد العدد حتى تكفي المجموعة
            m, rows, eff = group(n)
            if n * Qall * eff >= P: break
            n += 1
        n = max(n, n_min)
        m, rows, eff = group(n)
        if n != 3:                # الشبكة تُبنى كاملة — لا نصف ركيزة بالزاوية
            n = max(n, m * rows)  # (والثلاثة مثلث لا شبكة فلا تُرفَع لأربعة)
            m, rows, eff = group(n)
        tri = (n == 3)
        n_total = n * max(1, n_cols)
        gx = gy = 0
    if raft_mode:
        n_cap = dict(
            n_min=1, forced=False, need_tie=False,
            rule='ركائز تحت حصيرة (Piled Raft) — %d × %d ركيزة بتباعد %.2f م' % (gx, gy, s),
            why='الحمل الكلي %.0f kN وقدرة الركيزة الواحدة %.0f kN، فالمبنى كله '
                'يحتاج **%d ركيزة** لا مجموعة تحت كل عمود. توُزَّع على شبكة واسعة '
                'تحت الحصيرة، والحصيرة تربطها وتقيّد رؤوسها — فلا هامات ولا '
                'جسور رابطة، والركيزة المفردة عند العقدة مقبولة هنا لأن تقييدها '
                'من الحصيرة نفسها. (العدد بعد كفاءة التجاور.)' % (P_tot, Qall, n_total),
            note='العدد محكوم بالحمل الكلي — وهو الترتيب الأوفر بمراتب')
    else:
        n_cap = dict(
            n_min=n_min, forced=(P / max(Qall, 1.0) <= n_min),
            need_tie=(n <= 2),
            rule='مجموعة تحت كل عمود — أقلّها %d ركيزتان مع جسور رابطة' % n_min,
            why='الحمل يحتاج أكثر من ركيزة لكل عمود (%.1f ركيزة)، فتُنفَّذ '
                'مجموعات تحت هامات. والركيزة **المفردة** تحت هامة معزولة ممنوعة: '
                'خطأ موقعها المسموح بالتنفيذ يحوّل الحمل المحوري إلى عزم على '
                'رأسها وليس لها بديل إن ظهر فيها عيب صبّ. والاثنتان تقاومان '
                'العزم بمحور واحد فقط فتلزمهما جسور رابطة (Tie Beams) بالاتجاه '
                'العمودي عليهما.' % (P / max(Qall, 1.0)),
            note=('العدد محكوم بالحد الأدنى لا بالحمل'
                  if P / max(Qall, 1.0) <= n_min else 'العدد محكوم بالحمل'))
    Qgroup = n * Qall * eff
    if tri:
        # مثلث متطابق الأضلاع ضلعه s: عرضه s وارتفاعه s·√3/2
        cap_B = s + D + 0.6
        cap_L = s * math.sqrt(3.0) / 2.0 + D + 0.6
    else:
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
    if tri:                       # رأسا المثلث الخارجيان على بعد s/2 من المحور
        arm = max(0.10, s / 2.0 - cx / 2.0)
        piles_side = 2
    else:
        arm = max(0.10, (m - 1) / 2.0 * s - cx / 2.0)  # بُعد الصف الخارجي عن وجه العمود
        piles_side = rows if m > 1 else 0              # عدد الركائز خارج المقطع
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
                rebar=rebar, cap_rebar=cap_rebar, geom=p.get('geom'), tri=tri,
                mode=('raft' if raft_mode else 'group'), n_total=n_total,
                grid=(dict(nx=gx, ny=gy, s=round(s, 2)) if raft_mode else None),
                n_req=n_req, P_total=P_tot, n_cols=n_cols,
                layout=(('شبكة %d × %d تحت الحصيرة بتباعد %.2f م' % (gx, gy, s))
                        if raft_mode else
                        (('مثلث متطابق الأضلاع ضلعه %.2f م' % s) if tri
                         else ('شبكة %d × %d بتباعد %.2f م' % (m, rows, s)))),
                util=P / max(Qgroup, 1.0),
                W=W, FS=FS, Qall=Qall, n=n, spacing=s, eff=eff, Qgroup=Qgroup,
                ok=Qgroup >= P, P=P, steps=steps, rows=rows, cols=m,
                cap=dict(B=cap_B, L=cap_L, h=cap_h, conc=cap_B * cap_L * cap_h),
                types=PILE_TYPES, recommended=rec, group_rule=n_cap,
                notes=[('**ركائز تحت حصيرة**: الحصيرة تربط الرؤوس فتُقبل الركيزة '
                        'المفردة عند العقدة — ولا هامات ولا جسور رابطة'
                        if raft_mode else
                        '**لا تُنفَّذ ركيزة مفردة تحت هامة معزولة** — أقلّها اثنتان '
                        'مع جسور رابطة بالاتجاه العمودي عليهما، والثلاث بمثلث أثبت'),
                       'يجب تنفيذ فحص تحميل (Pile Load Test) لركيزة واحدة على الأقل لكل 100 ركيزة أو لكل مشروع',
                       'إذا وُجد ردم حديث أو طين طري فوق الطبقة الحاملة يجب حساب الاحتكاك السالب (Negative Skin Friction) وطرحه من القدرة',
                       'كفاءة المجموعة محسوبة بمعادلة Converse-Labarre — تُهمل عادةً بالتربة الرملية عند تباعد 3D فأكثر',
                       'هذه الحسابات أولية ولا تُغني عن التقرير الجيوتقني وفحوص التربة الميدانية'])
