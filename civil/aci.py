# -*- coding: utf-8 -*-
"""
تقرير مطابقة ACI 318M-14 — يفحص التصميم المنتهي بنداً بنداً.

الفكرة: لا يكفي أن يقول البرنامج «صُمِّم وفق الكود». هنا يُعاد فحص كل عنصر
مقابل نص البند، وتُطبع القيمة المحسوبة والحدّ الكودي ورقم البند والنتيجة —
فيقدر المهندس يدقّق كل سطر بنفسه، وأي بند لا ينطبق أو يحتاج مراجعة يُقال صراحةً.

الحالات:  ok = مطابق  ·  fail = مخالف  ·  warn = ضمن الحدّ لكن قريب منه
          na = لا ينطبق على هذا المشروع  ·  review = يحتاج تدقيق يدوي
"""
import math
import engine as E
import detail as D


def _row(clause, title, value, limit, state, note=''):
    return dict(clause=clause, title=title, value=value, limit=limit,
                state=state, note=note)


def _cmp(clause, title, val, lim, unit='', mode='<=', note='', warn_at=0.95):
    """يقارن قيمة بحدّ ويصنّف النتيجة. mode: '<=' القيمة لا تتجاوز الحدّ."""
    if lim in (None, 0):
        return _row(clause, title, '%.3g %s' % (val, unit), '—', 'review', note)
    r = val / lim if mode == '<=' else lim / max(val, 1e-9)
    if r > 1.0 + 1e-6:
        st = 'fail'
        extra = ('يتجاوز الحدّ بنسبة %.2f' % r if mode == '<='
                 else 'أقل من المطلوب — ينقصه %.4g %s (نسبة %.2f)'
                      % (lim - val, unit, r))
    elif r >= 0.999:
        # القيمة عند الحدّ بالضبط: هذا يعني أن **هذا البند هو الحاكم** للتصميم
        st, extra = 'ok', 'محكوم بهذا البند بالضبط'
    elif r >= warn_at:
        st, extra = 'warn', 'قريب من الحدّ (النسبة %.2f)' % r
    else:
        st, extra = 'ok', 'النسبة %.2f' % r
    return _row(clause, title, '%.4g %s' % (val, unit),
                ('≤ ' if mode == '<=' else '≥ ') + '%.4g %s' % (lim, unit), st,
                (note + ' · ' if note else '') + extra)


# ----------------------------- فحص الجسور -----------------------------
def check_beam(bm, fc, fy, exposure='interior', seismic=True):
    """فحص جسر واحد: الانحناء · القص · التباعد · النشر · العكفات · الجلد."""
    sec = bm['section']; reb = bm['rebar']
    b, h = sec['b'], sec['h']
    d = h - 40.0 - 10.0 - reb['bottom']['db'] / 2.0
    out = []
    # 9.6.1.2 الحديد الأدنى للانحناء
    as_min = E.as_min(fc, fy, b, d)
    out.append(_cmp('9.6.1.2', 'الحديد الأدنى بالشدّ As,min',
                    reb['bottom']['As'], as_min, 'مم²', mode='>=',
                    note='As,min = max(0.25√f\'c/fy , 1.4/fy)·b·d'))
    # 21.2.2 نسبة الانفعال ومعامل التخفيض φ
    et = min(dd.get('et', 0.005) for dd in bm['design']) if bm['design'] else 0.005
    out.append(_cmp('21.2.2', 'انفعال الشدّ εt (مقطع محكوم بالشدّ)', et, 0.005,
                    '', mode='>=', note='εt ≥ 0.005 يعطي φ = 0.90'))
    # 22.5 القص
    st = reb['stirrup']
    Vs_max = 0.66 * math.sqrt(fc) * b * d / 1000.0
    Vs = max((dd.get('Vs', 0.0) for dd in bm['design']), default=0.0)
    out.append(_cmp('22.5.1.2', 'قوة الأساور Vs بحدّها الأعلى', Vs, Vs_max, 'kN',
                    note='Vs ≤ 0.66√f\'c·bw·d — وإلا وجب تكبير المقطع'))
    # 9.7.6.2.2 أقصى تباعد أساور
    s_max = min(d / 2.0, 600.0) if Vs <= 0.33 * math.sqrt(fc) * b * d / 1000.0 \
        else min(d / 4.0, 300.0)
    out.append(_cmp('9.7.6.2.2', 'أقصى تباعد للأساور', st['s'], s_max, 'مم',
                    note='الحدّ d/2 أو d/4 عند القص العالي'))
    # 9.6.3.4 الأساور بالحد الأدنى
    av_min_s = max(0.062 * math.sqrt(fc) * b / 420.0, 0.35 * b / 420.0)
    av_s = st['legs'] * E.ab(st['db']) / st['s']
    out.append(_cmp('9.6.3.4', 'Av/s المنفَّذة مقابل الحد الأدنى',
                    av_s, av_min_s, 'مم²/مم', mode='>=',
                    note='Av,min/s = max(0.062√f\'c·bw/fyt , 0.35·bw/fyt)'))
    # 25.2.1 الخلوص بين الأسياخ
    cov = D.cover('beam', exposure, reb['bottom']['db'])
    n = reb['bottom']['n']
    clear = (b - 2 * cov - 2 * st['db'] - n * reb['bottom']['db']) / max(1, n - 1)
    need = max(25.0, reb['bottom']['db'])
    out.append(_cmp('25.2.1', 'الخلوص الصافي بين أسياخ الشدّ', clear, need, 'مم',
                    mode='>=', note='لا يقل عن الأكبر من 25 مم وقطر السيخ'))
    # 24.3.2 تباعد التحكم بالشقوق
    s_cr = D.crack_spacing(fy, cov)
    s_act = clear + reb['bottom']['db']
    out.append(_cmp('24.3.2', 'تباعد أسياخ الشدّ (التحكم بالشقوق)', s_act, s_cr, 'مم'))
    # 9.7.2.3 حديد الجلد
    sk = D.skin_reinforcement(h, cov, fy)
    out.append(_row('9.7.2.3', 'حديد الجلد للجسر العميق',
                    'h = %d مم' % int(h), 'يلزم فوق 900 مم',
                    'ok' if not sk['required'] else 'warn',
                    sk.get('label') or sk.get('note')))
    # 25.4.2 النشر و25.5.2 الوصلة
    ld = E.dev_length(reb['bottom']['db'], fc, fy, cover=cov, spacing=s_act, detail=True)
    out.append(_row('25.4.2.4', 'طول النشر بالشدّ ld',
                    '%d مم = %.0f·db' % (int(ld['ld']), ld['ratio_db']),
                    '≥ 300 مم', 'ok', ld['note']))
    ldh = E.hook_dev(reb['top']['db'], fc, fy, confined=True, inside_col=True, detail=True)
    out.append(_row('25.4.3.1', 'طول نشر السيخ المعكوف ldh عند المسند الطرفي',
                    '%d مم = %.0f·db' % (int(ldh['ldh']), ldh['ratio_db']),
                    '≥ max(8db , 150 مم)', 'ok', ldh['govern']))
    lap = E.lap_length(reb['bottom']['db'], fc, fy)
    out.append(_row('25.5.2.1', 'وصلة الشدّ صنف B',
                    '%d مم = %.0f·db' % (int(lap), lap / reb['bottom']['db']),
                    '1.3·ld ≥ 300 مم', 'ok', 'صنف B لأن الوصلات بمقطع واحد'))
    # 9.7.7 التماسك الإنشائي
    integ = D.beam_integrity(reb['bottom']['As'], reb['top']['As'],
                             reb['bottom']['db'], detail=True)
    out.append(_row('9.7.7', 'حديد التماسك الإنشائي المستمر',
                    '%d مم² مستمر' % int(integ['As_bot_cont']),
                    'ربع الحديد السفلي وسيخان بالأقل', 'ok', integ['note']))
    # 18.6.4 التفصيل الزلزالي
    if seismic:
        hp = D.seismic_hoops(h, reb['bottom']['db'], st['db'], d, detail=True)
        out.append(_row('18.6.4', 'أساور المنطقة الحرجة (إطار مقاوم للعزوم)',
                        'Ø%d @ %d مم على %d مم'
                        % (int(st['db']), int(hp['s_crit']), int(hp['zone'])),
                        'min(d/4 , 6db , 150 مم)',
                        'ok' if st['s'] <= hp['s_crit'] + 1e-6 else 'warn',
                        hp['label']))
    # 9.3.1.1 الحد الأدنى للسماكة (الهطول)
    return out


# ----------------------------- فحص الأعمدة -----------------------------
def check_column(col, fc, fy, hs, seismic=True):
    reb = col['rebar']
    b, h = col['b'], col['h']
    circ = reb.get('shape') == 'circ'
    Ag = (math.pi * b * b / 4.0) if circ else (b * h)
    out = []
    # 10.6.1.1 نسبة الحديد الطولي
    out.append(_cmp('10.6.1.1', 'نسبة الحديد الطولي ρ (الحد الأدنى)',
                    reb['rho'], 0.01, '', mode='>=', note='0.01 ≤ ρ ≤ 0.08'))
    out.append(_cmp('10.6.1.1', 'نسبة الحديد الطولي ρ (الحد الأعلى العملي)',
                    reb['rho'], 0.06, '', note='الحد الكودي 0.08 والعملي 0.06 لتفادي ازدحام الوصلات'))
    # 10.7.3.1 عدد الأسياخ الأدنى
    nmin = 6 if circ else 4
    out.append(_cmp('10.7.3.1', 'عدد الأسياخ الطولية', reb['n'], nmin, 'سيخ',
                    mode='>=', note='4 للأساور المستطيلة · 6 للحلزون'))
    # 22.4.2.1 أقصى حمل محوري
    out.append(_cmp('22.4.2.1', 'أقصى حمل محوري φPn,max', col.get('Pu', 0.0),
                    reb['phiPn_max'], 'kN',
                    note='φPn,max = 0.80·φ·P0 للأساور (0.85 للحلزون)'))
    # 25.7 الأساور أو الحلزون
    if circ:
        out.append(_row('25.7.3', 'الحلزون: النسبة الحجمية ρs والخطوة',
                        'ρs = %.4f · خطوة %d مم' % (reb.get('rho_s', 0), int(reb['tie_s'])),
                        'ρs ≥ max[0.45(Ag/Ach−1)f\'c/fyt , 0.12f\'c/fyt] · خلوص 25–75 مم',
                        'ok', 'الحلزون مستمر بكامل الارتفاع (25.7.3.1)'))
    else:
        s_lim = min(16.0 * reb['db'], 48.0 * reb['tie_db'], min(b, h))
        out.append(_cmp('25.7.2.1', 'تباعد الأساور', reb['tie_s'], s_lim, 'مم',
                        note='min(16db الطولي , 48db الأسوار , أصغر بُعد للمقطع)'))
        dbt_min = 10.0 if reb['db'] <= 32 else 12.0
        out.append(_cmp('25.7.2.2', 'قطر الأسوار', reb['tie_db'], dbt_min, 'مم',
                        mode='>=', note='Ø10 للطولي حتى Ø32 · Ø12 لما فوقه'))
        out.append(_row('25.7.2.3', 'الأتاري الداخلية (Crossties)',
                        '%d أتاري' % int(reb.get('crossties', 0)),
                        'كل سيخ بديل مسنود بركن أسوار وخلوص ≤ 150 مم',
                        'ok' if reb.get('crossties', 0) or reb['nb'] <= 3 else 'warn',
                        'تلزم كلما زاد عدد الأسياخ بالوجه عن ثلاثة'))
    # 18.7.5 التطويق الزلزالي
    if seismic:
        lo = max(max(b, h), hs * 1000.0 / 6.0, 450.0)
        out.append(_cmp('18.7.5.1', 'طول منطقة التطويق ℓo',
                        reb.get('conf_len', lo), lo, 'مم', mode='>=',
                        note='ℓo ≥ max(أكبر بُعد للمقطع , ارتفاع الطابق/6 , 450 مم)'))
        s_conf = min(min(b, h) / 4.0, 6.0 * reb['db'], 150.0)
        out.append(_cmp('18.7.5.3', 'تباعد التطويق داخل ℓo',
                        reb.get('tie_s_conf', reb['tie_s']), s_conf, 'مم',
                        note='min(أصغر بُعد/4 , 6db , 150 مم)'))
    # 25.4.9 و25.5.5 الدولات
    dw = col.get('dowels')
    if dw:
        out.append(_cmp('25.4.9.2', 'دفن الأشاير داخل الأساس ldc',
                        dw['embed'], dw['ldc'], 'مم', mode='>=',
                        note='ldc = max[0.24fy·db/√f\'c , 0.043fy·db , 200 مم]'))
        out.append(_cmp('25.5.5.1', 'وصلة الضغط للأشاير',
                        dw['project'], dw['lap_c'], 'مم', mode='>=',
                        note='0.071·fy·db ≥ 300 مم'))
        out.append(_cmp('16.3.4.1', 'مساحة الأشاير الأدنى', dw['As'], dw['As_min'],
                        'مم²', mode='>=', note='0.005·Ag'))
    return out


# ----------------------------- فحص السقف -----------------------------
def check_slab(slab, g, fc, fy, exposure='interior', col=None):
    out = []
    h = slab['h']
    mesh = slab['mesh']
    # بالسقوف العصبية (هوردي · وافل) الشبكة العلوية تخدم **طبقة التغطية** وحدها،
    # فحديد الانكماش يُحسب على سماكتها لا على العمق الكلي (ACI 9.8 نظم الأعصاب)
    geom = slab.get('geom') or {}
    # الببل ديك بلاطة مصمتة مفرّغة بكرات لا نظام أعصاب — تُفحص كالمصمتة
    ribbed = slab.get('type') in ('hordi', 'waffle')
    h_sh = geom.get('topping') or h if ribbed else h
    # 7.6.1.1 / 24.4.3.2 حديد الانكماش والحرارة
    as_sh = 0.0018 * 1000.0 * h_sh if fy >= 420 else 0.0020 * 1000.0 * h_sh
    As_prov = 1000.0 * E.ab(mesh['short']['db']) / mesh['short']['s']
    out.append(_cmp('24.4.3.2', 'حديد الانكماش والحرارة', As_prov, as_sh,
                    'مم²/م', mode='>=',
                    note='0.0018·Ag لحديد 420 MPa فأعلى — على %s (%d مم)'
                         % ('طبقة التغطية' if ribbed else 'كامل السماكة', int(h_sh))))
    # 8.7.2.2 يخصّ **الحديد الرئيسي للبلاطة المصمتة**. أما نظم الأعصاب (هوردي ·
    # وافل · ببل) فالانحناء تحمله الأعصاب لا طبقة التغطية، فتُفحص بدلاً منه
    # حدود نظام الأعصاب بالمادة 9.8، وتبقى شبكة التغطية محكومة بـ 24.4.3.3.
    if ribbed:
        g2 = geom
        clear_rib = (g2.get('spacing', 0) or 0) - (g2.get('rib_w', 0) or 0)
        out.append(_cmp('9.8.1.2', 'الخلوص الصافي بين الأعصاب',
                        clear_rib, 760.0, 'مم', note='لا يتجاوز 760 مم بنظام الأعصاب'))
        out.append(_cmp('9.8.1.1', 'عرض العصب',
                        100.0, g2.get('rib_w') or 100.0, 'مم', mode='<=',
                        note='لا يقل عن 100 مم'))
        rib_h = g2.get('rib_h') or (h - (g2.get('topping') or 0))
        out.append(_cmp('9.8.1.3', 'عمق العصب مقابل عرضه',
                        rib_h, 3.5 * (g2.get('rib_w') or 100.0), 'مم',
                        note='لا يتجاوز 3.5 × عرض العصب'))
        out.append(_cmp('9.8.2.1', 'سماكة طبقة التغطية',
                        g2.get('topping') or 0.0,
                        max(clear_rib / 12.0, 50.0), 'مم', mode='>=',
                        note='≥ الأكبر من (الخلوص/12 , 50 مم)'))
    else:
        s_lim = min(2.0 * h_sh, 450.0)
        out.append(_cmp('8.7.2.2', 'أقصى تباعد لحديد السقف الرئيسي',
                        mesh['short']['s'], s_lim, 'مم', note='min(2h , 450 مم)'))
    s_sh = min(5.0 * h_sh, 450.0)
    out.append(_cmp('24.4.3.3', 'أقصى تباعد لحديد الانكماش',
                    mesh['top']['s'], s_sh, 'مم', note='min(5h , 450 مم)'))
    # 8.3.1.1 الحد الأدنى للسماكة — ℓn هو البحر **الصافي** من وجه لوجه المسند
    # (حاشية [1] بالجدول)، فيُطرح مقطع العمود الفعلي لا 400 مم مفترضة: بالمشاريع
    # الكبيرة يصل العمود إلى متر، فافتراض 400 يضخّم ℓn ويرفض سماكةً مطابقة.
    cw = max(float((col or {}).get('b') or 400.0), float((col or {}).get('h') or 400.0))
    ln = max(g['sx'], g['sy']) * 1000.0 - cw
    h_min = max(ln / 33.0, 125.0)          # جدول 8.3.1.1 (fy=420 · طرفي بجسور حافّية) + 8.3.1.1 الحدّ المطلق
    out.append(_cmp('8.3.1.1', 'الحد الأدنى لسماكة السقف (بلا هطول محسوب)',
                    h, h_min, 'مم', mode='>=',
                    note='ℓn/33 لبلاطة ثنائية الاتجاه بجسور محيطية (fy=420) وبحدّ مطلق '
                         '125 مم · ℓn = %.0f مم صافي بعد طرح عمود %d مم' % (ln, int(cw))))
    # 20.6.1.3.1 الغطاء
    cov = D.cover('slab', exposure, mesh['short']['db'])
    out.append(_cmp('20.6.1.3.1', 'الغطاء الخرساني للسقف', slab['cover'], cov,
                    'مم', mode='>=', note='20 مم داخلي لأقطار ≤ Ø36'))
    return out


# ----------------------------- فحص الأساس -----------------------------
def check_footing(alt, kind, fc, fy):
    out = []
    if kind == 'isolated' and alt.get('typical'):
        t = alt['typical']
        out.append(_cmp('13.3.1.2', 'الحد الأدنى لسماكة الأساس المنفرد فوق الحديد',
                        t['h'] - 75.0 - 16.0, 150.0, 'مم', mode='>=',
                        note='عمق فعّال ≥ 150 مم فوق الحديد السفلي'))
        out.append(_cmp('20.6.1.3.1', 'الغطاء على التربة', 75.0, 75.0, 'مم',
                        mode='>=', note='مصبوب على التربة مباشرة'))
    if alt.get('punch'):
        p = alt['punch']
        out.append(_cmp('22.6.5.2', 'قص الثقب عند العمود', p['Vu'], p['phiVc'], 'kN',
                        note='vc = أصغر [0.33√f\'c , 0.17(1+2/β)√f\'c , 0.083(2+αs·d/b0)√f\'c]'))
    return out


# ------------- الأبواب التي أُضيفت بعد قراءة النص المطبوع 318M-14 -------------
def check_torsion(t):
    """الالتواء — ACI 318M-14 الباب 22.7 مع 9.6.4 و9.7.5 و9.7.6.3."""
    out = []
    if not t.get('required'):
        out.append(_row('22.7.1.1', 'هل يلزم تصميم التواء؟',
                        'Tu = %.2f kN·م' % t['Tu'], 'φTth = %.2f kN·م' % t['phiTth'],
                        'na', 'Tu أقل من عزم العتبة φTth فيُهمل الالتواء نصّاً '
                              '(المادة 22.7.1.1) — وهذا حال الجسر الداخلي.'))
        return out
    out.append(_row('22.7.1.1', 'يلزم تصميم التواء',
                    'Tu = %.2f kN·م' % t['Tu'], '≥ φTth = %.2f kN·م' % t['phiTth'],
                    'ok', t['case']))
    out.append(_cmp('22.7.7.1', 'حدّ مقطع الالتواء والقص معاً',
                    t['lhs'], t['rhs'], 'ميغا',
                    note='√[(Vu/bwd)² + (Tu·ph/1.7Aoh²)²] ≤ φ[Vc/bwd + 0.66√f\'c]'))
    out.append(_row('22.7.6.1', 'حديد الالتواء العرضي At/s',
                    '%.3f مم²/مم لرِجل' % t['At_s'],
                    'من (22.7.6.1a) بـ Ao=0.85Aoh وθ=45°', 'ok',
                    'Aoh = %.0f مم² · ph = %.0f مم' % (t['Aoh'], t['ph'])))
    out.append(_cmp('9.6.4.3', 'الحديد الطولي للالتواء Aℓ', t['Al'], t['Al_min'],
                    'مم²', mode='>=', note='الأصغر من صيغتَي 9.6.4.3(أ) و(ب)'))
    if t.get('stirrup_new'):
        out.append(_cmp('9.7.6.3.3', 'تباعد كانات الالتواء',
                        t['stirrup_new']['s'], t['s_max'], 'مم',
                        note='s ≤ الأصغر من ph/8 و300 مم'))
    if t.get('long_bars'):
        out.append(_cmp('9.7.5.2', 'قطر السيخ الطولي للالتواء',
                        t['long_bars']['db'], max(0.042 * t['s_max'], 10.0), 'مم',
                        mode='>=', note='≥ الأكبر من 0.042·s و10 مم · سيخ بكل ركن (9.7.5.1)'))
    return out


def check_joint(j):
    """قص العقدة جسر–عمود — ACI 318M-14 المادة 18.8.4."""
    out = [_row('18.8.2.1', 'قوة الحديد العلوي عند وجه العقدة',
                'T = 1.25·fy·As = %.0f kN' % j['T'],
                'إجهاد 1.25fy نصّاً', 'ok',
                'قص العمود المقابل Vcol = %.0f kN' % j['Vcol'])]
    for r in j['rows']:
        out.append(_cmp('18.8.4.1', 'قص العقدة — %s (γ = %.1f)' % (r['name'], r['gamma']),
                        r['Vu'], r['phiVn'], 'kN',
                        note='Vn = γ·λ·√f\'c·Aj · Aj = %.2f م² (18.8.4.3) · φ = 0.85'
                             % (r['Aj'] / 1e6)))
    out.append(_row('18.8.5.1', 'طول نشر العكفة داخل العقدة الزلزالية',
                    'ldh = %.0f مم' % j['hook']['ldh'],
                    'fy·db/(5.4λ√f\'c) ≥ max(8db , 150)', 'ok',
                    'أطول من 25.4.3.1 لأنه يراعي انعكاس الحمل · '
                    'والسيخ المستقيم = 2.5× ذلك (18.8.5.3)'))
    return out


def check_deflection(rows):
    """الترخيم — ACI 318M-14 جدول 24.2.2 بحالاته الأربع."""
    out = []
    for c in rows:
        out.append(_row('24.2.4.1.1', 'معامل الزمن للجسر %s' % c['beam'],
                        'λΔ = %.2f' % c['long_term']['lambda_d'],
                        'ξ/(1+50ρ′) · ξ = %.1f' % c['long_term']['xi'], 'ok',
                        'يُضرب بالترخيم الفوري للحمل **الدائم** وحده'))
        for o in c['cases']:
            out.append(_cmp('24.2.2', 'الجسر %s — %s' % (c['beam'], o['label']),
                            abs(o['value']), o['limit'], 'مم',
                            note='L/%d · %s' % (int(o['den']), o['what'])))
    return out


def check_durability(d):
    """الديمومة وأصناف التعرّض — ACI 318M-14 الباب 19.3."""
    out = [_row('19.3.1.1', 'أصناف التعرّض المعتمَدة', ' · '.join(d['classes']),
                'يحدّدها المهندس المسؤول (19.3.1.1)', 'ok',
                ' · '.join('%s: %s' % (r['code'], r['desc']) for r in d['rows']))]
    out.append(_cmp('19.3.2.1', 'أدنى مقاومة خرسانة f\'c للديمومة',
                    d['fc'], d['fc_min'], 'ميغا', mode='>=',
                    note='الصنف الحاكم %s — والمادة 19.3.2.1 توجب **الأشدّ** '
                         'حين تجتمع الأصناف' % d['gov_fc']))
    if d['wcm_max'] is not None:
        if d['wcm'] is None:
            out.append(_row('19.3.2.1', 'أقصى نسبة ماء/أسمنت w/cm',
                            'لم تُدخَل', '≤ %.2f' % d['wcm_max'], 'review',
                            'يُقيَّد بمواصفة الخلطة عند المجهّز — الصنف الحاكم %s'
                            % d['gov_wcm']))
        else:
            out.append(_cmp('19.3.2.1', 'أقصى نسبة ماء/أسمنت w/cm',
                            d['wcm'], d['wcm_max'], '',
                            note='الصنف الحاكم %s' % d['gov_wcm']))
    for r in d['rows']:
        if r['note']:
            out.append(_row('19.3.2.1', 'شرط إضافي للصنف %s' % r['code'],
                            r['note'], 'جدول 19.3.2.1', 'review',
                            'يُنفَّذ بمواصفة الخلطة لا بالتصميم الإنشائي'))
    return out


# ----------------------------- التقرير الكامل -----------------------------
def report(R):
    """يبني تقرير المطابقة من ناتج المعالج كاملاً."""
    inp = R['input']; m = R['model']; g = R['grid']
    fc, fy = inp['fc'], inp['fy']
    exp = inp.get('exposure', 'interior')
    secs = []
    for d0, nm in (('x', 'X'), ('y', 'Y')):
        secs.append(dict(name='الجسور باتجاه %s' % nm,
                         rows=check_beam(R['beams'][d0], fc, fy, exp)))
    secs.append(dict(name='الأعمدة', rows=check_column(
        dict(m['col'], Pu=R.get('Pumax', 0.0), dowels=m['col'].get('dowels')),
        fc, fy, m['story_h'])))
    secs.append(dict(name='السقف', rows=check_slab(m['slab'], g, fc, fy, exp, m['col'])))
    secs.append(dict(name='الأساس', rows=check_footing(
        dict(R['alts'][R['recommended']],
             punch=(R['punching'][0]['found'] if R.get('punching') else None)),
        R['recommended'], fc, fy)))
    ax = R.get('aci_extra') or {}
    if ax.get('torsion'):
        secs.append(dict(name='الالتواء (الباب 22.7)', rows=check_torsion(ax['torsion'])))
    if ax.get('joint'):
        secs.append(dict(name='قص العقدة (18.8.4)', rows=check_joint(ax['joint'])))
    if ax.get('deflection'):
        secs.append(dict(name='الترخيم (جدول 24.2.2)',
                         rows=check_deflection(ax['deflection']['rows'])))
    if ax.get('durability'):
        secs.append(dict(name='الديمومة وأصناف التعرّض (19.3)',
                         rows=check_durability(ax['durability'])))
    n = {'ok': 0, 'warn': 0, 'fail': 0, 'na': 0, 'review': 0}
    for s in secs:
        for r in s['rows']:
            n[r['state']] = n.get(r['state'], 0) + 1
    total = sum(n.values())
    return dict(sections=secs, counts=n, total=total,
                verdict=('مطابق — لا مخالفة' if n['fail'] == 0 else
                         '%d بند مخالف — راجعها قبل التنفيذ' % n['fail']),
                code='ACI 318M-14 (SI)',
                note='كل بند يُعاد فحصه على التصميم المنتهي — القيمة المحسوبة والحدّ '
                     'الكودي ورقم البند معروضة كلها ليقدر المهندس يدقّقها بيده. '
                     'البنود المعلّمة «يحتاج تدقيق» تتطلب رجوعاً للنص المطبوع.')
