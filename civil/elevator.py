# -*- coding: utf-8 -*-
"""
المصعد — بئره وأحماله وعزومه وتسليحه.

المصعد ليس فتحة بالسقف. هو **نواة قصّ** (Shear Core) كاملة الارتفاع:
  * جدرانه الأربعة أقسى عنصر بالمبنى بالمستوى الأفقي، فتجذب حصة كبيرة من
    القوة الجانبية — وإن أُهمِلت بالتحليل خرجت الأعمدة مصمَّمة على قوة لا
    تصل إليها فعلاً، وخرجت النواة بلا تسليح لقوة تصل إليها.
  * وله أحمال **خاصّة به** لا علاقة لها بحمل السقف: وزن السيارة والثقل
    الموازن والحمل الاسمي، وردود أفعالها على جائز الماكينة أعلى البئر وعلى
    قاع البئر (المصدّات) بمعاملات صدم.
  * وفتحته تقطع حديد السقف بكل طابق فيحتاج تعويضاً وتطويقاً.
  * وقاعه ينزل تحت منسوب الأساس بعمق الحفرة (Pit).

الأبعاد والأوزان هنا **جدول سعات قياسي** للمصاعد الكهربائية عديمة غرفة
الماكينة (MRL)، وهي كافية للتصميم الأولي. والمرجع النهائي **مخطط مورّد
المصعد** (Layout Drawing) — يُقال هذا صراحةً بكل مخرَج.

الوحدات: kN · م · مم · ميغاباسكال.
"""
import math
import engine as E
import detail as DT
import stairs as ST

G = 9.81 / 1000.0            # تحويل كغم → kN

#: جدول السعات القياسي — (السعة كغم · الركاب · وزن السيارة كغم · مقاس البئر مم
#: · مقاس السيارة مم · أقل عمق حفرة م · أقل ارتفاع علوي م)
CAPACITY = [
    dict(Q=320,  persons=4,  car=500,  shaft=(1500, 1600), cabin=(900, 1100),
         pit=1.40, over=3.60),
    dict(Q=450,  persons=6,  car=620,  shaft=(1500, 1750), cabin=(1000, 1250),
         pit=1.40, over=3.60),
    dict(Q=630,  persons=8,  car=750,  shaft=(1600, 1750), cabin=(1100, 1400),
         pit=1.50, over=3.70),
    dict(Q=800,  persons=10, car=900,  shaft=(1800, 1900), cabin=(1350, 1400),
         pit=1.50, over=3.70),
    dict(Q=1000, persons=13, car=1100, shaft=(1900, 2100), cabin=(1600, 1400),
         pit=1.60, over=3.80),
    dict(Q=1275, persons=17, car=1350, shaft=(2000, 2300), cabin=(1600, 1700),
         pit=1.60, over=3.80),
]

#: معاملات الصدم — الحمل المتحرّك يصل ضِعف قيمته الساكنة لحظة الإقلاع والوقوف
#: وعلى المصدّات. القيم من الممارسة ومن متطلبات EN 81-20 لتحميل المصدّات،
#: وتُطبَّق على **رد الفعل الساكن** لا على وزن المبنى.
IMPACT_TOP = 2.0      # جائز الماكينة أعلى البئر
IMPACT_PIT = 2.0      # مصدّات قاع البئر


def pick(Q):
    """أقرب سعة قياسية ≥ المطلوبة."""
    for c in CAPACITY:
        if c['Q'] >= Q - 1:
            return c
    return CAPACITY[-1]


def loads(p):
    """أحمال المصعد وردود أفعالها — **حمل المصعد لا حمل السقف**."""
    cap = pick(float(p.get('Q', 630)))
    Q = cap['Q'] * G                       # الحمل الاسمي kN
    P = cap['car'] * G                     # وزن السيارة kN
    # الثقل الموازن يوازن السيارة + نصف الحمل الاسمي — القاعدة العالمية
    Wc = P + 0.5 * Q
    R_top = (P + Q + Wc) * IMPACT_TOP
    R_car = (P + Q) * IMPACT_PIT
    R_cw = Wc * IMPACT_PIT
    R_pit = R_car + R_cw
    return dict(cap=cap, Q=round(Q, 2), P=round(P, 2), Wc=round(Wc, 2),
                R_top=round(R_top, 2), R_car=round(R_car, 2), R_cw=round(R_cw, 2),
                R_pit=round(R_pit, 2), impact_top=IMPACT_TOP, impact_pit=IMPACT_PIT,
                rows=[('السعة الاسمية', '%d كغم = %d راكب' % (cap['Q'], cap['persons'])),
                      ('الحمل الاسمي Q', '%.1f kN' % Q),
                      ('وزن السيارة P', '%.1f kN' % P),
                      ('الثقل الموازن Wc', 'P + 0.5·Q = %.1f kN — يوازن السيارة '
                                           'ونصف الحمل، فالماكينة ترفع الفرق فقط' % Wc),
                      ('رد الفعل أعلى البئر', '(P + Q + Wc) × %.1f = %.1f kN — على '
                       'جائز الماكينة أو البلاطة العلوية' % (IMPACT_TOP, R_top)),
                      ('رد فعل مصدّ السيارة', '(P + Q) × %.1f = %.1f kN على قاع البئر'
                       % (IMPACT_PIT, R_car)),
                      ('رد فعل مصدّ الثقل', 'Wc × %.1f = %.1f kN على قاع البئر'
                       % (IMPACT_PIT, R_cw)),
                      ('مجموع أحمال قاع البئر', '%.1f kN' % R_pit)],
                note='معاملا الصدم 2.0 لأن الحمل **متحرّك**: يصل ضِعف قيمته الساكنة '
                     'لحظة الإقلاع والوقوف وعلى المصدّات. والأرقام النهائية من مخطط '
                     'مورّد المصعد (Layout Drawing) — وهذه قيم تصميم أوّلي بجدول '
                     'سعات قياسي لمصعد كهربائي عديم غرفة الماكينة (MRL).')


def core_section(w, h, t):
    """مقطع النواة كصندوق مغلق: المساحة وعزوما القصور الذاتي حول المحورين.

    هذا هو المقدار الذي **يجذب** القوة الجانبية: صلابة الجدار بمستواه تتناسب
    مع I، وصندوق 1.6×1.75 م بجدار 20 سم يعطي I أكبر من عمود 40×60 سم بنحو
    مئتي ضعف — ولهذا لا يجوز إهماله بالتحليل.
    """
    wo, ho = w + t / 1000.0, h + t / 1000.0        # الأبعاد الخارجية م
    wi, hi = w, h                                   # الداخلية م
    A = wo * ho - wi * hi
    Ix = (wo * ho ** 3 - wi * hi ** 3) / 12.0
    Iy = (ho * wo ** 3 - hi * wi ** 3) / 12.0
    # الالتواء لمقطع صندوقي مغلق — Bredt: J = 4·Am²·t/perimeter
    Am = (wo - t / 1000.0) * (ho - t / 1000.0)
    per = 2 * ((wo - t / 1000.0) + (ho - t / 1000.0))
    J = 4 * Am ** 2 * (t / 1000.0) / per if per else 0.0
    return dict(A=A, Ix=Ix, Iy=Iy, J=J, wo=wo, ho=ho, t=t)


def rigidity(sec, cols, col_b, col_h):
    """حصة النواة من القوة الجانبية مقابل الأعمدة — بنسبة الصلابات."""
    Ic = col_b / 1000.0 * (col_h / 1000.0) ** 3 / 12.0
    I_cols = max(1e-9, cols * Ic)
    I_core = max(sec['Ix'], sec['Iy'])
    share = I_core / (I_core + I_cols)
    return dict(I_core=I_core, I_cols=I_cols, n_cols=cols, ratio=I_core / I_cols,
                share=share,
                note='النواة تجذب حصة من القوة الجانبية تتناسب مع صلابتها: '
                     'I النواة = %.3f م⁴ مقابل %.3f م⁴ لكل الأعمدة (%d عموداً) — '
                     'أي **%.0f ضعفاً**، فتأخذ نحو %.0f%% من قوة الطابق. '
                     'وهذه الحصة إن أُهملت خرجت الأعمدة مصمَّمة على قوة لا تصلها، '
                     'والنواة بلا تسليح لقوة تصلها.'
                     % (I_core, I_cols, cols, I_core / I_cols, share * 100))


def wall_design(p):
    """تصميم جدار النواة: محوري + قصّ بالمستوى + الحديد الأدنى (ACI 11)."""
    t = float(p['t']); hs = float(p['story_h']); floors = int(p['floors'])
    fc = float(p['fc']); fy = float(p['fy'])
    Pu = float(p['Pu'])                 # الحمل المحوري المعامل على الجدار kN
    Vu = float(p['Vu'])                 # قص المستوى المعامل kN
    Lw = float(p['Lw'])                 # طول الجدار بمستوى القص م
    Mu = float(p.get('Mu', 0.0))        # عزم القلب بالمستوى kN·م
    # 11.5.3.1 — الطريقة المبسّطة للحمل المحوري
    k = 0.8                              # مقيّد الدوران بطرف واحد (11.5.3.2)
    lc = hs * 1000.0
    phiPn = 0.55 * 0.65 * fc * (t * Lw * 1000.0) * (1 - (k * lc / (32.0 * t)) ** 2) / 1000.0
    # 11.5.4.3 — قصّ الخرسانة بالمستوى
    d = 0.8 * Lw * 1000.0
    phiVc = 0.75 * 0.17 * math.sqrt(fc) * t * d / 1000.0
    Vn_max = 0.83 * math.sqrt(fc) * t * d / 1000.0        # 11.5.4.3 الحدّ الأعلى
    # 11.6 — الحديد الأدنى
    rho_l, rho_t = 0.0012, 0.0025 if Vu > 0.5 * phiVc else 0.0020
    Asl = rho_l * t * 1000.0
    Ast = rho_t * t * 1000.0
    need_shear = Vu > phiVc
    if need_shear:
        Ast = max(Ast, (Vu / 0.75 - phiVc / 0.75) * 1000.0 / (fy * d) * 1000.0)
    two_layers = t >= 250.0
    smax = min(3 * t, 450.0)
    vl = E.bar_spacing(Asl * (0.5 if two_layers else 1.0), dbs=(10, 12, 16), smax=smax)
    vt = E.bar_spacing(Ast * (0.5 if two_layers else 1.0), dbs=(10, 12, 16), smax=smax)
    # 18.10.6 — عنصر الحدّ (Boundary Element) عند طرف الجدار
    sig = (Pu * 1000.0 / (t * Lw * 1000.0)
           + Mu * 1e6 / (t * (Lw * 1000.0) ** 2 / 6.0)) if Lw > 0 else 0.0
    need_be = sig > 0.20 * fc
    return dict(t=t, Lw=Lw, Pu=Pu, Vu=Vu, Mu=Mu, phiPn=round(phiPn, 1),
                ok_axial=Pu <= phiPn, phiVc=round(phiVc, 1), Vn_max=round(Vn_max, 1),
                ok_shear=Vu <= max(phiVc, 0.0) or need_shear,
                ok_section=Vu <= 0.75 * Vn_max,
                rho_l=rho_l, rho_t=rho_t, need_shear=need_shear,
                two_layers=two_layers, vert=vl, horiz=vt,
                sigma=round(sig, 2), need_boundary=need_be,
                rows=[('سماكة الجدار', '%d مم%s' % (int(t),
                       ' — شبكتان (السماكة 250 مم فأكثر · 11.7.2.3)' if two_layers
                       else ' — شبكة واحدة')),
                      ('الحمل المحوري φPn', '%.0f kN مقابل Pu = %.0f kN (11.5.3.1 '
                       'الطريقة المبسّطة)' % (phiPn, Pu)),
                      ('قصّ الخرسانة φVc', '%.0f kN مقابل Vu = %.0f kN (11.5.4.3)'
                       % (phiVc, Vu)),
                      ('حدّ المقطع', 'Vu لا يتجاوز 0.75·Vn,max = %.0f kN — وإلا '
                       'وجب تثخين الجدار' % (0.75 * Vn_max)),
                      ('الحديد الرأسي', '%s — ρ = %.4f (11.6.1)' % (vl['label'], rho_l)),
                      ('الحديد الأفقي', '%s — ρ = %.4f%s'
                       % (vt['label'], rho_t,
                          ' (زِيد لمقاومة القصّ 11.5.4.8)' if need_shear else '')),
                      ('إجهاد الضغط بالطرف', '%.2f ميغا — %s' % (sig,
                       'يتجاوز 0.2·f\'c فيلزم **عنصر حدّ** مطوَّق (18.10.6.3)'
                       if need_be else 'أقلّ من 0.2·f\'c فلا يلزم عنصر حدّ')),
                      ])


def design(p):
    """الحزمة الكاملة للمصعد: الأحمال · النواة · الجدران · الفتحة · الحفرة."""
    Qv = float(p.get('Q', 630))
    ld = loads(dict(Q=Qv))
    cap = ld['cap']
    w = float(p.get('w') or cap['shaft'][0] / 1000.0)
    h = float(p.get('h') or cap['shaft'][1] / 1000.0)
    hs = float(p['story_h']); floors = int(p['floors'])
    fc = float(p['fc']); fy = float(p['fy'])
    t = float(p.get('t') or max(200.0, math.ceil(hs * 1000.0 / 25.0 / 10.0) * 10.0))
    sec = core_section(w, h, t)
    H = hs * floors
    # وزن الجدران الذاتي
    sw = sec['A'] * H * 24.0
    # الحمل المحوري على الجدار الواحد: نصيبه من وزن الجدران + رد فعل الماكينة
    Lw = w + t / 1000.0                       # طول الجدار بمستوى X
    Pu_wall = 1.2 * (sw / 4.0) + 1.4 * ld['R_top'] / 4.0
    # قص الطابق الذي تجذبه النواة — يُمرَّر من المشروع إن حُسب، وإلا صفر
    Vu = float(p.get('V_core', 0.0))
    Mu = Vu * H * 0.55                         # ذراع مكافئ لقوة موزّعة بالارتفاع
    wl = wall_design(dict(t=t, story_h=hs, floors=floors, fc=fc, fy=fy,
                          Pu=Pu_wall, Vu=Vu / 2.0, Lw=Lw, Mu=Mu / 2.0))
    op = ST.opening(dict(w=w, h=h, slab_h=p.get('slab_h', 200.0), fc=fc, fy=fy,
                         mesh_db=p.get('mesh_db', 12), mesh_s=p.get('mesh_s', 200),
                         kind='مصعد', span=p.get('span', 4.0)))
    # قاع البئر: بلاطة مثخّنة تتلقّى صدم المصدّات — تُفحص بالثقب تحت المصدّ
    pit_d = float(p.get('pit') or cap['pit'])
    t_pit = 300.0
    for _ in range(40):
        dpit = t_pit - 75.0 - 20.0
        b0 = 4 * (300.0 + dpit)                # مصدّ 300×300 مم
        phiVc = 0.75 * 0.33 * math.sqrt(fc) * b0 * dpit / 1000.0
        if phiVc >= ld['R_car'] or t_pit >= 800.0:
            break
        t_pit += 25.0
    return dict(Q=cap['Q'], persons=cap['persons'], w=round(w, 2), h=round(h, 2), t=t,
                shaft=cap['shaft'], cabin=cap['cabin'],
                pit=pit_d, over=cap['over'], H=round(H, 2), floors=floors,
                loads=ld, section=dict(A=round(sec['A'], 4), Ix=round(sec['Ix'], 4),
                                       Iy=round(sec['Iy'], 4), J=round(sec['J'], 4),
                                       wo=round(sec['wo'], 3), ho=round(sec['ho'], 3)),
                sw=round(sw, 1), wall=wl, opening=op,
                pit_slab=dict(t=t_pit, phiVc=round(phiVc, 1), Vu=ld['R_car'],
                              ok=phiVc >= ld['R_car'], depth=pit_d),
                # مساران منفصلان لا يُجمعان: رد فعل الماكينة ينزل بالجدران إلى
                # الأساس، وصدم المصدّات ينزل مباشرةً على بلاطة قاع البئر. ولا
                # يقعان معاً — أحدهما عند الوقوف الطبيعي والآخر عند تجاوز الحدّ.
                on_found=round(1.2 * sw + 1.4 * ld['R_top'], 1),
                on_pit=round(ld['R_pit'], 1),
                rows=[('مقاس البئر الداخلي', '%.2f × %.2f م' % (w, h)),
                      ('مقاس السيارة', '%d × %d مم' % cap['cabin']),
                      ('سماكة الجدار', '%d مم' % int(t)),
                      ('ارتفاع البئر', '%.2f م (%d طابق)' % (H, floors)),
                      ('عمق الحفرة (Pit)', '%.2f م تحت أدنى منسوب وقوف' % pit_d),
                      ('الارتفاع العلوي (Overrun)', '%.2f م فوق أعلى منسوب وقوف' % cap['over']),
                      ('وزن الجدران الذاتي', '%.0f kN' % sw),
                      ('سماكة بلاطة قاع البئر', '%d مم — تُفحص بالثقب تحت المصدّ '
                       '(%.0f kN)' % (int(t_pit), ld['R_car'])),
                      ('الحمل على أساس الجدران', '1.2·الوزن الذاتي + 1.4·رد فعل '
                       'الماكينة = %.0f kN' % (1.2 * sw + 1.4 * ld['R_top'])),
                      ('الحمل على بلاطة قاع البئر', '%.0f kN (صدم المصدّات) — '
                       'مسار منفصل لا يُجمع مع الأول' % ld['R_pit'])],
                note='المصعد **نواة قصّ** لا فتحة: جدرانه تقاوم الحمل الجانبي، '
                     'وأحماله الخاصّة (السيارة والثقل والصدم) تنزل على قاع البئر '
                     'وعلى جائز الماكينة، وفتحته تقطع حديد السقف بكل طابق فتحتاج '
                     'تطويقاً. والحفرة تنزل تحت منسوب التأسيس فتحتاج عزلاً وجدران '
                     'حجز.',
                supplier='المرجع النهائي **مخطط مورّد المصعد** (Layout Drawing): '
                         'مقاس البئر ومواضع المصدّات وردود الأفعال ومنسوب الماكينة '
                         'تختلف بين مورّد وآخر، وهذه قيم تصميم أوّلي بجدول سعات قياسي.')
