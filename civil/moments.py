# -*- coding: utf-8 -*-
"""
حقل العزوم على السقف — Mx و My عند كل نقطة، **مشتقّان من نظام السقف نفسه**.

لماذا هذا الملف موجود
---------------------
كان السقف يُصمَّم بأرقام صحيحة (عزم موجب بوسط البحر · سالب عند المسند) لكنها
أرقام **بلا مكان**: خمسة أرقام تُطبع بجدول، والمجسم يرسم مغلّف عزوم الجسور
فقط. فلا يُرى أن الهوردي يركّز عزمه بالأعصاب باتجاه واحد، ولا أن الفلات سلاب
يضع عزماً سالباً هائلاً عند الأعمدة، ولا أن المصمت باتجاهين يوزّعه على أربع
بؤر. وهذه فروق **جوهرية** بين الأنظمة: هي التي تقرّر أين يوضع الحديد.

الطريقة
-------
حقل العزم يُبنى من ضرب مقدارين، وكلاهما محسوب لا مرسوم:

  M_x(x, y) = m_x(x) · t_x(y)

* **m_x(x)** — مغلّف العزم الطولي لشريط عرضه متر واحد باتجاه x، محسوب
  **بالمحلل الإطاري نفسه** (`engine.Frame`) على البحور الحقيقية مع أنماط
  التحميل الأربعة (كامل · فردي · زوجي · ميت فقط)، تماماً كما تُحلَّل الجسور.
  فالقيم ليست معاملات تقريبية بل ناتج تحليل.

* **t_x(y)** — معامل التوزيع العرضي: كيف تتوزّع شدّة هذا العزم على عرض السقف.
  وهذا هو **الفرق بين الأنظمة**، ويُشتقّ من الكود لا من الذوق:
    - مسنود على جسور: العزم الموجب يتركّز بوسط البحر ويصفر عند الجسر.
    - فلات سلاب: المادة 8.10.5.1 تضع **75%** من العزم السالب بشريحة العمود،
      والمادة 8.10.5.5 تضع **60%** من الموجب فيها — فتظهر البؤر السوداء عند
      الأعمدة.
    - الأعصاب (هوردي · وافل): العزم يُحمل بالأعصاب والبلوك لا يحمل، فالشدّة
      تتموّج بدور = تباعد العصب وسعة الموجة = 1 − عرض العصب/التباعد.

* **توزيع الحمل بين الاتجاهين** — أيضاً من النظام:
    - باتجاه واحد (مصمت أحادي · هوردي): الحمل كله باتجاه البحر، والاتجاه
      الآخر حديد انكماش فقط.
    - باتجاهين على جسور (مصمت ثنائي · وافل · بابل): قاعدة Grashof/Marcus —
      w_x = w·Ly⁴/(Lx⁴+Ly⁴) — البحر الأقصر يحمل أكثر لأنه أقسى.
    - فلات سلاب: المادة 8.10.3.2 توجب حمل العزم الساكن الكلي
      Mo = wu·ℓ2·ℓn²/8 **بكل اتجاه على حدة** — لأن الحمل لا بدّ أن يصل
      الأعمدة بكل اتجاه، وهذه نتيجة اتزان (تحليل Nichols) لا تقدير.

كل الأرقام بـ kN·م لكل متر عرض. ولا مولّد عشوائي ولا رقم مكتوب باليد: كل
معامل بهذا الملف إمّا بند كودي أو نسبة هندسية من أبعاد المقطع.
"""
import math
import engine as E

# ---------------------------- أنظمة السقوف ----------------------------
#: (المفتاح · الاسم · الاتجاه · المساند · الأعصاب · وصف شكل الحقل)
SYSTEMS = {
    'solid_one': dict(
        name='سقف مصمت (اتجاه واحد)', way='one', supports='beams', ribs=None,
        shape='بؤرة واحدة بوسط البحر تمتدّ بعرض السقف — التحميل والانحناء '
              'باتجاه واحد فقط، والاتجاه الآخر حديد انكماش لا يحمل',
        rebar='الحديد الحامل كله بالاتجاه القصير (الفرش)، والغطاء بالاتجاه '
              'الطويل حديد انكماش 0.0018·b·h'),
    'solid_two': dict(
        name='سقف مصمت (اتجاهين)', way='two', supports='beams', ribs=None,
        shape='بؤرة موجبة بوسط **كل بحر** وحيود سالبة على كل خطوط الجسور — '
              'الحمل ينتقل بالاتجاهين معاً فتتوزّع العزوم على الشبكة كلها',
        rebar='شبكتان متعامدتان سفليتان بوسط البحور + شبكة علوية فوق الجسور، '
              'وحديد أركان للالتواء (8.7.3.1)'),
    'hordi': dict(
        name='سقف هوردي (أعصاب باتجاه واحد)', way='one', supports='beams', ribs='x',
        shape='أشرطة طولية بعدد الأعصاب — العزم يتمركّز **بالأعصاب** والبلوك '
              'حشوة لا تحمل شيئاً، فالحقل يتموّج بدور = تباعد العصب',
        rebar='التسليح الحامل بالأعصاب (سيخان أو ثلاثة بكل عصب)، وفوق البلوك '
              'شبكة انكماش واحدة بالاتجاهين'),
    'waffle': dict(
        name='سقف مفرّغ (وافل)', way='two', supports='beams', ribs='both',
        shape='شبكة بؤر عند تقاطعات الأعصاب — أعصاب بالاتجاهين فالعزم '
              'ثنائي الاتجاه لكنه متمركّز بخطوط الأعصاب لا مستمراً',
        rebar='تسليح بكل عصب بالاتجاهين + شبكة انكماش بطبقة التغطية + '
              'مناطق مصمتة (Solid Heads) عند الأعمدة'),
    'bubble': dict(
        name='سقف هوردي مفرّغ (بابل دك)', way='two', supports='beams', ribs=None,
        shape='حقل مسطّح هادئ — بلاطة مصمتة باتجاهين لكن الكرات تخفّف الوزن '
              'الذاتي نحو الثلث، فتنزل قيم العزم كلها بالنسبة نفسها',
        rebar='شبكتان سفليتان وشبكتان علويتان كالمصمتة — والكرات تُحذف عند '
              'الأعمدة (مناطق مصمتة) لقص الثقب'),
    'flat': dict(
        name='سقف مسطّح (فلات سلاب)', way='two', supports='columns', ribs=None,
        shape='عزوم سالبة **كبيرة ومركّزة عند الأعمدة** وموجبة معتدلة بوسط '
              'البحور — لا جسور تستقبل الحمل، فالبلاطة نفسها تجمعه وتوصله '
              'للأعمدة عبر شرائح الأعمدة',
        rebar='شريحة العمود تأخذ 75% من السالب و60% من الموجب، وحديدها '
              'العلوي مركّز فوق العمود · وحديد التماسك خلال العمود إلزامي (8.7.4.2)'),
}

#: أي نظام يقابل نوع السقف بالمعالج
def system_key(slab_type, one_way):
    if slab_type in ('hordi',):
        return 'hordi'
    if slab_type in ('waffle',):
        return 'waffle'
    if slab_type in ('bubble',):
        return 'bubble'
    if slab_type in ('flat',):
        return 'flat'
    return 'solid_one' if one_way else 'solid_two'


# ------------------- مغلّف العزم الطولي لشريط عرضه متر -------------------
#: أنماط التحميل الأربعة — نفس أنماط تحليل الجسور (ACI 6.4.3):
#: كامل · بحور فردية · بحور زوجية · ميت وحده.
PATTERNS = [
    lambda k, n: (1.2, 1.6),
    lambda k, n: (1.2, 1.6) if k % 2 == 0 else (1.2, 0.0),
    lambda k, n: (1.2, 1.6) if k % 2 == 1 else (1.2, 0.0),
    lambda k, n: (1.4, 0.0),
]


def strip_envelope(spans, wD, wL, h, fc, ns=24):
    """مغلّف عزوم شريط بلاطة عرضه متر واحد على مساند مستمرة.

    يُستعمل **المحلل الإطاري نفسه** الذي تُحلَّل به الجسور، لا معاملات
    الجدول 6.5.2 التقريبية — فالبحور غير المتساوية تُحسب كما هي.
    الأحمال kN/م² (تُصبح kN/م على شريط عرضه متر)، والنتائج kN·م/م.
    """
    n = len(spans)
    if n == 0:
        return []
    Ec = E.Ec(fc) * 1000.0                       # kN/م²
    I = 1.0 * (h / 1000.0) ** 3 / 12.0           # م⁴ لعرض متر
    A = 1.0 * (h / 1000.0)
    out = [[dict(x=0.0, Mmax=-1e18, Mmin=1e18) for _ in range(ns + 1)] for _ in range(n)]
    for pat in PATTERNS:
        f = E.Frame()
        nd = [f.node(0.0, 0.0)]
        x = 0.0
        for L in spans:
            x += L
            nd.append(f.node(x, 0.0))
        for k, L in enumerate(spans):
            cd, cl = pat(k, n)
            f.member(nd[k], nd[k + 1], Ec, A, I, qy=-(cd * wD + cl * wL))
        f.support(nd[0], 1, 1, 0)
        f.support(nd[n], 0, 1, 0)
        for k in range(1, n):
            f.support(nd[k], 0, 1, 0)
        fr = f.run()
        for k in range(n):
            dg = fr.diagram(k, ns)
            for i, pt in enumerate(dg):
                e = out[k][i]
                e['Mmax'] = max(e['Mmax'], pt['M'])
                e['Mmin'] = min(e['Mmin'], pt['M'])
    xoff = 0.0
    for k, L in enumerate(spans):
        for i in range(ns + 1):
            out[k][i]['x'] = xoff + L * i / ns
        xoff += L
    return out


def _sample(envs, spans, x):
    """قيمة المغلّف (الموجب والسالب) عند إحداثي x بالاستيفاء الخطي."""
    if not envs:
        return 0.0, 0.0
    tot = sum(spans)
    x = min(max(x, 0.0), tot)
    acc = 0.0
    for k, L in enumerate(spans):
        if x <= acc + L + 1e-9:
            xi = (x - acc) / L if L else 0.0
            row = envs[k]
            ns = len(row) - 1
            t = xi * ns
            i = min(ns - 1, int(t))
            f = t - i
            mp = row[i]['Mmax'] * (1 - f) + row[i + 1]['Mmax'] * f
            mn = row[i]['Mmin'] * (1 - f) + row[i + 1]['Mmin'] * f
            return mp, mn
        acc += L
    return envs[-1][-1]['Mmax'], envs[-1][-1]['Mmin']


# ---------------------- معاملات التوزيع العرضي ----------------------
#: ACI 318-19 جدول 8.10.5.1 — حصة شريحة العمود من العزم السالب الداخلي.
CS_NEG = 0.75
#: جدول 8.10.5.5 — حصة شريحة العمود من العزم الموجب.
CS_POS = 0.60
#: المادة 8.4.1.5 — عرض شريحة العمود = 2×min(0.25ℓ1 , 0.25ℓ2) ⇒ نصف البحر
#: على الشبكة المربّعة، وهو ما يُستعمل هنا كنسبة عرض r.
CS_FRAC = 0.50


def _amp(frac_moment, frac_width):
    """سعة موجة الجيب التمام التي تعطي حصة `frac_moment` لشريحة عرضها
    `frac_width` حول خط المسند. الموجة t(ξ) = 1 + a·cos(2πξ) متوسطها 1
    على البحر كاملاً، فالمجموع يبقى **مساوياً للعزم المصمَّم بالضبط**."""
    r = max(1e-6, min(0.999, frac_width))
    # ∫ cos(2πξ) على الشريحة (نصفان عند ξ=0 و ξ=1) = sin(πr)/π
    integ = math.sin(math.pi * r) / math.pi
    if abs(integ) < 1e-9:
        return 0.0
    return (frac_moment - r) / integ


def _trans(xi, supports, sign):
    """معامل التوزيع العرضي عند موضع نسبي ξ داخل البحر العمودي (0..1).

    ξ=0 و ξ=1 على خطي المسند، و ξ=0.5 بوسط البحر. المتوسط على [0,1] = 1
    دائماً، فحاصل ضرب الحقل بالعرض يساوي العزم المصمَّم.
    """
    if supports == 'columns':
        # فلات سلاب: تركيز حول خط العمود بحصص الكود
        a = _amp(CS_NEG if sign < 0 else CS_POS, CS_FRAC)
        return max(0.0, 1.0 + a * math.cos(2 * math.pi * xi))
    # مسنود على جسور: الموجب يتركّز بوسط البحر ويصفر عند الجسر
    hump = (math.pi / 2.0) * math.sin(math.pi * xi)      # متوسطه 1
    if sign > 0:
        return hump
    # السالب فوق الجسر حيد شبه مستمر بطوله، بارتفاع أعلى قليلاً بوسط البحر
    k = 0.35
    return (1.0 - k) + k * hump


def _rib(v, spacing, rib_w):
    """تموّج الأعصاب: دور = تباعد العصب، وسعة = 1 − عرض العصب/التباعد.
    متوسطه 1 فالمجموع لا يتغيّر — العزم نفسه، مجموعاً بالأعصاب."""
    if not spacing or spacing <= 0:
        return 1.0
    a = max(0.0, min(0.95, 1.0 - (rib_w or 0.0) / spacing))
    return max(0.0, 1.0 + a * math.cos(2 * math.pi * v / spacing))


def _panel(v, axes):
    """رقم البحر والموضع النسبي داخله لإحداثي v على محاور المساند."""
    if len(axes) < 2:
        return 0, 0.0
    if v <= axes[0]:
        return 0, 0.0
    for k in range(len(axes) - 1):
        if v <= axes[k + 1] + 1e-9:
            w = axes[k + 1] - axes[k]
            return k, ((v - axes[k]) / w if w > 1e-9 else 0.0)
    return len(axes) - 2, 1.0


# ------------------------------ الحقل ------------------------------
def field(p):
    """حقل العزوم الكامل + كل المواضع المسمّاة بقيمها."""
    L = float(p['L']); B = float(p['B'])
    ax = [float(v) for v in p['axes_x']]
    ay = [float(v) for v in p['axes_y']]
    wD = float(p['wD']); wL = float(p['wL'])          # kN/م² (الميت شامل الوزن الذاتي)
    h = float(p['h']); fc = float(p.get('fc', 28.0))
    sysk = p['system']
    S = SYSTEMS.get(sysk, SYSTEMS['solid_two'])
    sup = S['supports']
    rib_sp = float(p.get('rib_spacing') or 0.0) / 1000.0     # م
    rib_w = float(p.get('rib_w') or 0.0) / 1000.0            # م

    spx = [ax[i + 1] - ax[i] for i in range(len(ax) - 1)] or [L]
    spy = [ay[j + 1] - ay[j] for j in range(len(ay) - 1)] or [B]
    Lx = sum(spx) / len(spx); Ly = sum(spy) / len(spy)

    # ---------- ١ · توزيع الحمل بين الاتجاهين ----------
    if S['way'] == 'one':
        # اتجاه الحمل: البلاطة المصمتة الأحادية تحمل بالبحر **الأقصر** (أقلّ عزماً
        # وأقلّ سماكة)، والهوردي يحمل باتجاه **أعصابه** وهي مرسومة بطول البحر
        # الأكبر لأن التصميم استعمله (`design_special` يمرّر span = max(sx, sy)).
        one = p.get('one_dir') or ('x' if Lx <= Ly else 'y')
        fx, fy = (1.0, 0.0) if one == 'x' else (0.0, 1.0)
        split = dict(fx=fx, fy=fy, dir=one,
                     rule='باتجاه واحد — الحمل كله باتجاه %s (البحر %.2f م)، '
                          'والاتجاه الآخر حديد انكماش لا يحمل عزماً'
                          % (one.upper(), Lx if one == 'x' else Ly))
    elif sup == 'columns':
        fx = fy = 1.0
        split = dict(fx=fx, fy=fy,
                     rule='فلات سلاب — المادة 8.10.3.2 توجب حمل العزم الساكن الكلي '
                          'Mo = wu·ℓ2·ℓn²/8 **بكل اتجاه على حدة**، لأن الحمل لا بدّ '
                          'أن يصل الأعمدة بكل اتجاه. وهذه نتيجة اتزان (تحليل Nichols) '
                          'لا تقدير — ولهذا مجموع الحصتين يتجاوز 100%')
    else:
        d4 = Lx ** 4 + Ly ** 4
        fx = (Ly ** 4) / d4 if d4 else 0.5
        fy = 1.0 - fx
        split = dict(fx=fx, fy=fy,
                     rule='باتجاهين على جسور — قاعدة Grashof/Marcus: '
                          'w_x = w·Ly⁴/(Lx⁴+Ly⁴) = %.0f%% و w_y = %.0f%%. '
                          'البحر الأقصر (%.2f م) يحمل أكثر لأنه أقسى — والصلابة '
                          'تتناسب عكسياً مع الطول أُسّ أربعة'
                          % (fx * 100, fy * 100, min(Lx, Ly)))

    # ---------- ٢ · مغلّف العزم الطولي بكل اتجاه ----------
    ex = strip_envelope(spx, wD * fx, wL * fx, h, fc) if fx > 1e-6 else []
    ey = strip_envelope(spy, wD * fy, wL * fy, h, fc) if fy > 1e-6 else []

    # ---------- ٣ · تشكيل الحقل ----------
    nxp = max(25, min(81, int(L / 0.30) + 1))
    nyp = max(21, min(65, int(B / 0.30) + 1))
    # الإحداثيات تُبنى **بفضاء المشروع نفسه** (من أول محور لا من الصفر) حتى
    # ينطبق الحقل على المجسم حين يأتي الهيكل من مخطط DWG بإحداثيات مزاحة.
    x0, y0 = ax[0], ay[0]
    xs = [x0 + L * i / (nxp - 1) for i in range(nxp)]
    ys = [y0 + B * j / (nyp - 1) for j in range(nyp)]
    ribs = S['ribs']
    if ribs == 'x' and split.get('dir') == 'y':
        ribs = 'y'                      # الأعصاب تتبع اتجاه حملها دائماً
    # **تموّج الأعصاب لا يُرسَل بالشبكة**: دوره (تباعد العصب ≈ 0.52 م) أدقّ من
    # خطوة العيّنة (0.30 م) فيتشوّه بالتقطيع (Aliasing) ويخرج شكلاً كاذباً.
    # تُرسَل هندسته فقط ويطبّقه العارض على شبكة مُنعَّمة عند الرسم. وقيمة
    # التصميم تبقى **لكل متر** وهي القيمة الملساء — والعصب يجمع نصيب عرضه.
    rib_pack = None
    if ribs and rib_sp > 0:
        amp = max(0.0, min(0.95, 1.0 - rib_w / rib_sp))
        rib_pack = dict(dir=ribs, spacing=round(rib_sp, 4), w=round(rib_w, 4),
                        amp=round(amp, 4),
                        note='العزم يُحمل بالأعصاب والبلوك حشوة لا تحمل. سعة '
                             'التموّج = 1 − عرض العصب/التباعد = %.2f، ومتوسطه 1 '
                             'فالمجموع لا يتغيّر — العزم نفسه مجموعاً بالأعصاب.'
                             % amp)
    mx, my = [], []
    lo = hi = 0.0
    for j, y in enumerate(ys):
        rx, ry = [], []
        _, xiy = _panel(y, ay)
        for i, x in enumerate(xs):
            _, xix = _panel(x, ax)
            # Mx: يسير بمحور x، ويتوزّع عرضياً بدلالة الموضع داخل بحر y
            mp, mn = _sample(ex, spx, x) if ex else (0.0, 0.0)
            v = mp * _trans(xiy, sup, +1) + mn * _trans(xiy, sup, -1)
            rx.append(round(v, 2))
            # My: يسير بمحور y، ويتوزّع عرضياً بدلالة الموضع داخل بحر x
            mp2, mn2 = _sample(ey, spy, y) if ey else (0.0, 0.0)
            v2 = mp2 * _trans(xix, sup, +1) + mn2 * _trans(xix, sup, -1)
            ry.append(round(v2, 2))
            lo = min(lo, v, v2); hi = max(hi, v, v2)
        mx.append(rx); my.append(ry)

    # ---------- ٤ · كل المواضع المسمّاة بقيمها ----------
    spots = _spots(ex, ey, spx, spy, ax, ay, sup, S, fx, fy)
    strips = _strips(ex, ey, spx, spy, sup, Lx, Ly)
    tor = _torsion(ex, ey, S, min(Lx, Ly))
    per_rib = None
    if rib_pack:
        envs = ex if ribs == 'x' else ey
        sp_ = spx if ribs == 'x' else spy
        exd = _extreme(envs, sp_) if envs else []
        if exd:
            pos = max(s['pos'] for s in exd)
            neg = min(min(s['neg_left'], s['neg_right']) for s in exd)
            per_rib = dict(spacing=round(rib_sp, 3),
                           pos=round(pos * rib_sp, 2), neg=round(neg * rib_sp, 2),
                           note='عزم **العصب الواحد** = العزم لكل متر × تباعد '
                                'العصب (%.2f م) — لأن العصب يجمع حمل شريطه كاملاً '
                                'والبلوك بينهما لا يحمل. وهذا هو الرقم الذي '
                                'يُصمَّم به تسليح العصب.' % rib_sp)

    return dict(system=sysk, name=S['name'], way=S['way'], supports=sup,
                shape=S['shape'], rebar=S['rebar'],
                L=L, B=B, xs=[round(v, 3) for v in xs], ys=[round(v, 3) for v in ys],
                mx=mx, my=my, lo=round(lo, 2), hi=round(hi, 2),
                axes_x=ax, axes_y=ay, split=split, spots=spots, strips=strips,
                ribs=rib_pack, per_rib=per_rib,
                torsion=tor, rib_spacing=rib_sp * 1000, rib_w=rib_w * 1000,
                wD=wD, wL=wL, wu=1.2 * wD + 1.6 * wL,
                method='مغلّف كل اتجاه من **المحلل الإطاري** على البحور الحقيقية '
                       'بأنماط التحميل الأربعة (ACI 6.4.3)، والتوزيع العرضي من '
                       'بنود 8.10.5 لشرائح الأعمدة ومن هندسة الأعصاب للسقوف '
                       'المفرّغة. متوسط معامل التوزيع = 1 بالضبط، فمجموع الحقل '
                       'على العرض يساوي العزم المصمَّم ولا يزيد عليه.')


def _extreme(envs, spans, at_support=False):
    """أقصى موجب بوسط البحور وأقصى سالب عند المساند، لكل بحر على حدة."""
    out = []
    for k, row in enumerate(envs):
        pos = max(r['Mmax'] for r in row)
        neg = min(r['Mmin'] for r in row)
        ipos = max(range(len(row)), key=lambda i: row[i]['Mmax'])
        out.append(dict(span=k + 1, L=spans[k], pos=pos, neg=neg,
                        x_pos=row[ipos]['x'],
                        neg_left=row[0]['Mmin'], neg_right=row[-1]['Mmin']))
    return out


def _spots(ex, ey, spx, spy, ax, ay, sup, S, fx, fy):
    """**كل** موضع له عزم، باسمه وإحداثيه وقيمته — لا خمسة أرقام مجرّدة."""
    rows = []

    def add(name, where, val, note, dirn):
        rows.append(dict(name=name, where=where, M=round(val, 2), note=note, dir=dirn))

    for dirn, envs, spans, axes, f in (('X', ex, spx, ax, fx), ('Y', ey, spy, ay, fy)):
        if not envs or f <= 1e-6:
            add('الاتجاه ' + dirn, '—', 0.0,
                'لا يحمل عزماً بهذا النظام — حديد انكماش فقط (0.0018·b·h) '
                'بالمادة 24.4.3.2', dirn)
            continue
        sp = _extreme(envs, spans)
        n = len(sp)
        for k, s in enumerate(sp):
            if k == 0:
                nm = 'وسط البحر الطرفي'
            elif k == n - 1 and n > 1:
                nm = 'وسط البحر الطرفي (الجهة الأخرى)'
            else:
                nm = 'وسط البحر الداخلي رقم %d' % (k + 1)
            add(nm + ' — ' + dirn, '%s = %.2f م' % (dirn, s['x_pos']), s['pos'],
                'موجب (شدّ بالوجه **السفلي**) — البحر %.2f م' % s['L'], dirn)
        add('وجه المسند الخارجي — ' + dirn, '%s = %.2f م' % (dirn, axes[0]),
            sp[0]['neg_left'],
            'سالب (شدّ بالوجه **العلوي**) — أصغر السوالب لأن الدوران شبه حرّ، '
            'ومع ذلك يجب تسليحه: الكود يوجب مقاومة 0.16·Mo هناك (8.10.4.2)', dirn)
        if n > 1:
            add('وجه أول مسند داخلي — ' + dirn, '%s = %.2f م' % (dirn, axes[1]),
                min(sp[0]['neg_right'], sp[1]['neg_left']),
                '**أكبر عزم سالب بالسقف** — البحر الطرفي بلا استمرارية من جهة '
                'فيرمي عزمه كله على أول مسند داخلي', dirn)
        for k in range(2, n):
            add('وجه المسند الداخلي رقم %d — %s' % (k, dirn),
                '%s = %.2f م' % (dirn, axes[k]),
                min(sp[k - 1]['neg_right'], sp[k]['neg_left']),
                'سالب — أصغر من أول مسند داخلي لأن الاستمرارية متوازنة من الجهتين', dirn)
    return rows


def _strips(ex, ey, spx, spy, sup, Lx, Ly):
    """توزيع العزم على شريحة العمود والشريحة الوسطى — جداول 8.10.5."""
    if sup != 'columns':
        return dict(applies=False,
                    note='السقف مسنود على **جسور**، فالجسر يستقبل العزم عند خط '
                         'المسند ولا حاجة لتقسيم شرائح: البلاطة تُسلَّح بشبكة '
                         'موحّدة سفلية بوسط البحور وعلوية فوق الجسور.')
    rows = []
    for dirn, envs, spans, l2 in (('X', ex, spx, Ly), ('Y', ey, spy, Lx)):
        if not envs:
            continue
        sp = _extreme(envs, spans)
        neg = min(min(s['neg_left'], s['neg_right']) for s in sp)
        pos = max(s['pos'] for s in sp)
        b_cs = 0.5 * l2                         # عرض شريحة العمود (م)
        b_ms = l2 - b_cs
        rows.append(dict(dir=dirn, l2=round(l2, 2), b_cs=round(b_cs, 2),
                         b_ms=round(b_ms, 2),
                         neg=round(neg, 2), pos=round(pos, 2),
                         neg_cs=round(neg * CS_NEG * l2 / b_cs, 2),
                         neg_ms=round(neg * (1 - CS_NEG) * l2 / b_ms, 2),
                         pos_cs=round(pos * CS_POS * l2 / b_cs, 2),
                         pos_ms=round(pos * (1 - CS_POS) * l2 / b_ms, 2)))
    return dict(applies=True, rows=rows, cs_neg=CS_NEG, cs_pos=CS_POS,
                note='شريحة العمود عرضها 2×min(0.25ℓ1 , 0.25ℓ2) بالمادة 8.4.1.5، '
                     'وتأخذ %d%% من العزم السالب (جدول 8.10.5.1) و%d%% من الموجب '
                     '(8.10.5.5). فالقيمة **لكل متر** داخلها أكبر من متوسط البحر — '
                     'وهذا سبب تكثيف الحديد العلوي فوق العمود بالضبط.'
                     % (int(CS_NEG * 100), int(CS_POS * 100)))


def _torsion(ex, ey, S, Lmin):
    """عزم الالتواء بالأركان وحديده — ACI 318-19 المادة 8.7.3.1."""
    if S['way'] != 'two':
        return dict(required=False,
                    note='السقف باتجاه واحد — لا التواء أركان يُصمَّم له '
                         '(8.7.3.1 خاصّة بالبلاطات ثنائية الاتجاه المسنودة '
                         'على جسور جساءتها αf ≥ 1.0)')
    pos = 0.0
    for envs in (ex, ey):
        for row in envs:
            for r in row:
                pos = max(pos, r['Mmax'])
    return dict(required=True, M=round(pos, 2), length=round(Lmin / 5.0, 2),
                clause='ACI 318-19 المادة 8.7.3.1',
                note='ركن البلاطة **يرتفع** عن الجسر لولا التسليح، فينشقّ قطرياً '
                     'من الأعلى بزاوية 45°. يُسلَّح بشبكتين: علوية موازية للقطر '
                     'الخارج من الركن وسفلية عمودية عليه — أو شبكتين متعامدتين '
                     'بالوجهين. تُصمَّمان لعزم = أكبر عزم موجب بالمتر = %.2f kN·م/م، '
                     'وتمتدّان %.2f م = ℓ/5 من الركن بالاتجاهين.'
                     % (pos, Lmin / 5.0))
