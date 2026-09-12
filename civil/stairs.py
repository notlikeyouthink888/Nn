# -*- coding: utf-8 -*-
"""
الدرج وآبار المصاعد وفتحات السقف — التصميم الإنشائي.

بلاطة الدرج المائلة (Waist Slab) وفق ACI 318-19:
  الحمل على الميل = وزن الوِتر/cosθ + وزن الدرجات المثلثة + التشطيب،
  والحمل الحي للأدراج 3.0 kN/m² (الكود العراقي للأحمال والقوى).
فتحة السقف: تُخصم من البلاطة، ويوضع حولها جسور تحديد (Trimmer Beams)
وحديد تطويق إضافي على كل جانب (ACI 8.7 و24.4).
بئر المصعد: جدرانه جدران قص بحديد أدنى (ACI 11.6).
"""
import math
import engine as E
import detail as DT
import rebar as RB

LIVE_STAIR = 3.0            # kN/m² — حمل حي للأدراج (الكود العراقي)
W_MARBLE = 27.0             # kN/m³ — مرمر/حجر الدرجات
W_CONC = 24.0

def flight(p):
    """تصميم قلبة درج واحدة كبلاطة مائلة أحادية الاتجاه."""
    steps = max(2, int(p.get('steps', 10)))
    tread = float(p.get('tread', 0.28))          # النائمة (م)
    rise = float(p.get('rise', 0.17))            # القائمة (م)
    width = float(p.get('width', 1.10))
    fc = float(p.get('fc', 25.0)); fy = float(p.get('fy', 420.0))
    finish = float(p.get('finish', 1.2))         # تشطيب kN/m²
    live = float(p.get('live', LIVE_STAIR))
    # البحر الأفقي للقلبة + بسطة إن وُجدت
    run = steps * tread
    land = float(p.get('landing', 1.2))
    span = run + land
    theta = math.atan2(rise, tread)
    cos_t = math.cos(theta)
    # سماكة الوِتر: البحر/20 بحد أدنى 120 مم
    waist = float(p.get('waist') or max(120.0, math.ceil(span * 1000 / 20.0 / 10) * 10))
    # الأحمال على المسقط الأفقي
    w_waist = waist / 1000.0 * W_CONC / cos_t
    w_steps = 0.5 * rise * W_MARBLE
    wD = w_waist + w_steps + finish
    wu = 1.2 * wD + 1.6 * live
    Mu = wu * span ** 2 / 8.0                     # بسيط الإسناد بين جسرين (محافظ)
    cov = DT.cover('slab', 'interior', 12.0)
    d = waist - cov - 6.0
    fl = E.flexure(Mu, 1000.0, d, fc, fy, waist, min_rule='slab')
    As = max(fl['As_req'], 0.0018 * 1000.0 * waist)
    main = E.bar_spacing(As, dbs=(10, 12, 16), smax=min(3 * waist, 450))
    dist = E.bar_spacing(0.0018 * 1000.0 * waist, dbs=(8, 10, 12), smax=min(5 * waist, 450))
    Vu = wu * span / 2.0
    phiVc = 0.75 * 0.17 * math.sqrt(fc) * 1000.0 * d / 1000.0
    react = wu * span / 2.0 * width               # kN على كل جسر عند طرفي القلبة
    reb = flight_rebar(dict(span=span, run=run, land=land, width=width, waist=waist,
                            theta=theta, d=d, cov=cov, fc=fc, fy=fy, Mu=Mu,
                            main=main, dist=dist, rise=rise, tread=tread, steps=steps))
    return dict(rebar=reb, steps=steps, tread=tread, rise=rise, width=width, run=round(run, 2),
                landing=land, span=round(span, 2), angle=round(math.degrees(theta), 1),
                waist=waist, d=round(d, 1), wD=round(wD, 2), wu=round(wu, 2),
                Mu=round(Mu, 1), As=round(As, 0), main=main, dist=dist,
                Vu=round(Vu, 1), phiVc=round(phiVc, 1), shear_ok=Vu <= phiVc,
                reaction=round(react, 1), cover=cov,
                rows=[('عدد الدرجات', '%d درجة · نائمة %.0f سم · قائمة %.0f سم'
                       % (steps, tread * 100, rise * 100)),
                      ('زاوية الميل', '%.1f°' % math.degrees(theta)),
                      ('البحر المحسوب', '%.2f م (قلبة %.2f + بسطة %.2f)' % (span, run, land)),
                      ('سماكة الوِتر', '%d مم (البحر/20)' % waist),
                      ('الحمل الميت على الميل', '%.2f kN/m² (وِتر %.2f + درجات %.2f + تشطيب %.2f)'
                       % (wD, w_waist, w_steps, finish)),
                      ('الحمل الحي', '%.1f kN/m² (الكود العراقي للأدراج)' % live),
                      ('wu', '%.2f kN/m²' % wu),
                      ('Mu', '%.1f kN·m/م' % Mu),
                      ('التسليح الرئيسي', main['label'] + ' (بالاتجاه الطويل للقلبة)'),
                      ('حديد التوزيع', dist['label']),
                      ('القص', 'Vu %.1f مقابل φVc %.1f kN %s'
                       % (Vu, phiVc, '✓' if Vu <= phiVc else '✗ زد السماكة')),
                      ('رد الفعل على كل جسر', '%.1f kN' % react)],
                note='القلبة تُصمَّم كبلاطة مائلة بسيطة الإسناد بين جسري البسطة والطابق — '
                     'وهو الافتراض المحافظ. الحمل يُحسب على المسقط الأفقي بقسمة وزن الوِتر '
                     'على cos(θ) وإضافة وزن الدرجات المثلثة.')

def flight_rebar(p):
    """تفصيل حديد قلبة الدرج كاملاً — وهو **أخطر تفصيل بالمبنى يُنفَّذ خطأً**.

    القلبة ليست بلاطة مستقيمة: عندها **انكسار** عند التقاء الوِتر بالبسطة، وهذا
    الانكسار نوعان ولكل واحد قاعدة معاكسة تماماً:

      * **ركن داخل (Re-entrant corner)** — عند أسفل القلبة حيث تنعطف البلاطة
        للأعلى. حديد الشدّ هنا بالوجه السفلي، ولو ثُني حول الركن **لدفع الخرسانة
        إلى الخارج وطيّرها** (محصّلة قوتَي السيخ تتّجه خارج المقطع). فيجب
        **ألا يُثنى حول الركن أبداً** — بل يُقطع كل سيخ ويُمدّ **مستقيماً** داخل
        العنصر المقابل بطول رباط كامل ld، فتتقاطع الأسياخ ولا تنعطف.
      * **ركن خارج** — عند أعلى القلبة. هنا المحصّلة تتّجه **داخل** المقطع
        فالثني حوله سليم، ويُستعمل الحديد العلوي (Hanger / Top anchor bars).

    والبند الثاني الذي يُنسى: عند الانكسارات يظهر **عزم سالب موضعي** يشدّ الوجه
    العلوي، فيلزم حديد علوي (شنّاطات) بطول ربع البحر لكل جهة بمقدار **نصف**
    الحديد الرئيسي على الأقل.

    المصطلحات كما تُسمّى بالمخططات:
      Main bars · Distribution bars · Hanger bars · Top anchor bars ·
      Starter bars · Lapping bars · Inclined stirrups
    """
    span = float(p['span']); run = float(p['run']); land = float(p['land'])
    width = float(p['width']); waist = float(p['waist']); th = float(p['theta'])
    d = float(p['d']); cov = float(p['cov'])
    fc = float(p['fc']); fy = float(p['fy'])
    main = p['main']; dist = p['dist']
    db_m = float(main['db']); db_d = float(dist['db'])
    cos_t = math.cos(th)

    ld = E.dev_length(db_m, fc, fy)                       # طول الرباط للحديد الرئيسي
    ld_t = E.dev_length(db_m, fc, fy, top=True)           # علوي (صبّ تحته > 300 مم نادراً)
    lap = E.lap_length(db_m, fc, fy)                      # وصلة صنف B
    hk = RB.hook_full(db_m, 90, 'bar')
    # الحديد العلوي عند الانكسارات: نصف الرئيسي وبطول ربع البحر لكل جهة
    As_top = 0.5 * main['As']
    top = E.bar_spacing(As_top, dbs=(10, 12, 16), smax=min(3 * waist, 450.0))
    top_len = max(span / 4.0, (ld + 300.0) / 1000.0)
    # أسياخ الانتظار (Starter) من جسر البسطة: تُصبّ مع البسطة وتُوصل بحديد القلبة
    starter_len = (lap + max(ld, 300.0)) / 1000.0
    # الطول المائل للسيخ الرئيسي على الوِتر + الجزء الأفقي بالبسطة + النشر
    slope_len = run / cos_t
    main_len = slope_len + land + 2.0 * ld / 1000.0
    n_main = DT.n_bars(width, main['s'] / 1000.0)
    n_dist = DT.n_bars(slope_len + land, dist['s'] / 1000.0)
    n_top = DT.n_bars(width, top['s'] / 1000.0)
    # أساور مائلة: لا تلزم إنشائياً ببلاطة (القص يمرّ بلا حديد قص)، لكنها تُربط
    # عملياً بالوِتر السميك لتثبيت الشبكتين ومنع طفو العلوية عند الصبّ على ميل.
    stir = dict(need=waist >= 200.0, db=8, s=300.0,
                label='أساور ربط Ø8 @ 300 مم' if waist >= 200.0 else 'غير مطلوبة',
                why='القص بالبلاطة يمرّ بلا حديد قص (ACI 22.5)، والأساور هنا '
                    '**ربط تنفيذي** تمنع طفو الشبكة العلوية عند الصبّ على ميل — '
                    'وتلزم عملياً حين يزيد الوِتر عن 200 مم.')
    return dict(
        waist=waist, d=d, cover=cov, angle=math.degrees(th),
        main=dict(dict(main), n=n_main, len=round(main_len, 2), pos='سفلي',
                  name='Main bars — الحديد الرئيسي',
                  note='يوضع بالوجه **السفلي** موازياً لميل القلبة، ويستمر داخل '
                       'البسطة. طوله = %.2f م مائل + %.2f م بسطة + نشر %d مم لكل طرف.'
                       % (slope_len, land, int(ld))),
        dist=dict(dict(dist), n=n_dist, len=round(width - 2 * cov / 1000.0, 2),
                  pos='سفلي فوق الرئيسي',
                  name='Distribution bars — حديد التوزيع',
                  note='عمودي على الرئيسي، يوزّع الحمل المركّز ويقاوم الانكماش '
                       '(ACI 7.7.2.3) — ويُربط فوق الرئيسي لا تحته.'),
        top=dict(dict(top), n=n_top, len=round(2.0 * top_len, 2), pos='علوي',
                 name='Hanger / Top anchor bars — الشنّاطات والحديد العلوي',
                 zone=round(top_len, 2),
                 note='عند كل انكسار يظهر عزم سالب موضعي يشدّ الوجه العلوي، '
                      'فيوضع نصف الحديد الرئيسي علوياً بطول %.2f م لكل جهة من '
                      'الانكسار (ربع البحر أو ld+300 مم أيّهما أكبر).' % top_len),
        starter=dict(db=int(db_m), s=main['s'], n=n_main, len=round(starter_len, 2),
                     name='Starter bars — أسياخ الانتظار',
                     note='تُصبّ مع جسر البسطة وتبرز بطول %.2f م لتُوصل بحديد '
                          'القلبة (وصلة %d مم + نشر %d مم).'
                          % (starter_len, int(lap), int(ld))),
        lap=dict(len=round(lap / 1000.0, 2), db=int(db_m),
                 name='Lapping bars — الوصلات',
                 note='وصلة صنف B = 1.3·ld (ACI 25.5.2.1) — وتُوضع **بوسط البحر** '
                      'حيث العزم السالب صفر، لا عند الانكسار.'),
        hook=hk, ld=round(ld, 0), ld_top=round(ld_t, 0), lap_len=round(lap, 0),
        stirrup=stir,
        corners=[
            dict(kind='re', name='الركن الداخل (أسفل القلبة)',
                 rule='**يُمنع** ثني الحديد السفلي حول الركن — يُقطع ويُمدّ مستقيماً '
                      'داخل العنصر المقابل بطول ld = %d مم، فتتقاطع الأسياخ.' % int(ld),
                 why='محصّلة قوتَي السيخ عند الركن الداخل تتّجه **خارج** المقطع، '
                     'فتدفع غطاء الخرسانة وتطيّره وينسلّ السيخ. هذا أشيع سبب '
                     'لتشقّق أسفل الدرج عند البسطة.'),
            dict(kind='out', name='الركن الخارج (أعلى القلبة)',
                 rule='الثني حول الركن مسموح، ويُستعمل الحديد العلوي (Hanger bars) '
                      'ويُنشر داخل البسطة بطول ld.',
                 why='المحصّلة هنا تتّجه **داخل** المقطع فتضغط الخرسانة ولا تطيّرها.'),
        ],
        clause='ACI 318M-14 7.7 · 25.4 · 25.5.2.1 · 9.7.7')


def opening(p):
    """فتحة بالسقف (درج/مصعد/شفت): خصم المساحة + جسور تحديد + حديد تطويق."""
    w = float(p['w']); h = float(p['h'])
    t = float(p.get('slab_h', 200.0))
    fc = float(p.get('fc', 25.0)); fy = float(p.get('fy', 420.0))
    mesh_db = float(p.get('mesh_db', 12.0)); mesh_s = float(p.get('mesh_s', 200.0))
    kind = p.get('kind', 'درج')
    # الحديد المقطوع بالفتحة يُعوَّض بحديد إضافي على كل جانب (ACI 24.4.10)
    n_cut_x = DT.n_bars(w, mesh_s / 1000.0)
    n_cut_y = DT.n_bars(h, mesh_s / 1000.0)
    add_db = mesh_db if mesh_db >= 12 else 12.0
    n_add = max(2, int(math.ceil(n_cut_y * E.ab(mesh_db) / E.ab(add_db) / 2.0)))
    n_add2 = max(2, int(math.ceil(n_cut_x * E.ab(mesh_db) / E.ab(add_db) / 2.0)))
    ld = E.dev_length(add_db, fc, fy)
    ext = max(ld, 600.0) / 1000.0
    big = max(w, h) > 1.5 * max(0.3, float(p.get('span', 4.0))) / 3.0
    return dict(kind=kind, w=round(w, 2), h=round(h, 2), area=round(w * h, 2),
                x=p.get('x'), y=p.get('y'),
                add_db=int(add_db), n_side_x=n_add2, n_side_y=n_add,
                ext=round(ext, 2), trimmer=bool(big),
                rows=[('مقاس الفتحة', '%.2f × %.2f م = %.2f م²' % (w, h, w * h)),
                      ('حديد مقطوع', '%d سيخ باتجاه X · %d باتجاه Y (شبكة Ø%d @ %d)'
                       % (n_cut_x, n_cut_y, int(mesh_db), int(mesh_s))),
                      ('حديد التطويق الإضافي', '%dØ%d على كل جانب موازٍ لـ X · %dØ%d لـ Y'
                       % (n_add2, int(add_db), n_add, int(add_db))),
                      ('امتداد الحديد الإضافي', '%.2f م بعد حافة الفتحة (ld) لكل جهة' % ext),
                      ('جسور التحديد', 'مطلوبة حول الفتحة' if big
                       else 'غير مطلوبة — الفتحة صغيرة نسبةً للبحر')],
                note='الحديد الذي تقطعه الفتحة يُعوَّض بأسياخ إضافية موازية لحوافها تمتد '
                     'طول رباط (ld) بعد الحافة — ACI 24.4.10 · والفتحة الكبيرة تحتاج '
                     'جسور تحديد تحمل حوافها.')

def shaft(p):
    """بئر مصعد: جدرانه جدران قص — سماكة وحديد أدنى (ACI 11.6)."""
    w = float(p['w']); h = float(p['h'])
    hs = float(p.get('story_h', 3.2)); floors = int(p.get('floors', 1))
    fc = float(p.get('fc', 25.0)); fy = float(p.get('fy', 420.0))
    t = float(p.get('t') or max(200.0, math.ceil(hs * 1000 / 25.0 / 10) * 10))
    # ACI 11.6.1 — نسب الحديد الدنيا لجدران القص
    rho_l, rho_t = 0.0012, 0.0020
    Asl = rho_l * t * 1000.0
    Ast = rho_t * t * 1000.0
    vl = E.bar_spacing(Asl, dbs=(10, 12, 16), smax=min(3 * t, 450))
    vt = E.bar_spacing(Ast, dbs=(10, 12, 16), smax=min(3 * t, 450))
    per = 2 * (w + h)
    conc = per * t / 1000.0 * hs * floors
    wt = conc * W_CONC
    return dict(w=round(w, 2), h=round(h, 2), t=t, floors=floors,
                perimeter=round(per, 2), conc=round(conc, 2), weight=round(wt, 1),
                vert=vl, horiz=vt,
                rows=[('مقاس البئر', '%.2f × %.2f م' % (w, h)),
                      ('سماكة الجدار', '%d مم' % t),
                      ('الحديد الرأسي', vl['label'] + ' (ρ = 0.0012 · ACI 11.6.1)'),
                      ('الحديد الأفقي', vt['label'] + ' (ρ = 0.0020)'),
                      ('محيط البئر', '%.2f م' % per),
                      ('خرسانة الجدران', '%.2f م³ لكل %d طابق' % (conc, floors)),
                      ('وزنها', '%.0f kN' % wt)],
                note='جدران بئر المصعد تعمل كجدران قص تقاوم جزءاً كبيراً من الحمل الجانبي، '
                     'ووزنها يدخل بأحمال الأساس. الحديد بشبكتين إن زادت السماكة عن 250 مم.')

def package(p):
    """حزمة كاملة: قلبات الدرج المكتشَفة + فتحاتها + آبار المصاعد."""
    fc = float(p.get('fc', 25.0)); fy = float(p.get('fy', 420.0))
    hs = float(p.get('story_h', 3.2)); floors = int(p.get('floors', 1))
    slab_h = float(p.get('slab_h', 200.0))
    mesh = p.get('mesh') or {}
    out_f, out_o, out_s = [], [], []
    for st in (p.get('stairs') or []):
        tread = float(st.get('tread', 0.28))
        # القائمة من ارتفاع الطابق وعدد الدرجات بالطابق (قلبتان عادةً)
        steps = int(st.get('steps', 10))
        rise = hs / max(2 * steps, 1) if steps else 0.17
        rise = min(max(rise, 0.14), 0.20)
        f = flight(dict(steps=steps, tread=tread, rise=rise,
                        width=float(st.get('width', 1.1)), fc=fc, fy=fy,
                        landing=float(p.get('landing', 1.2))))
        f['x'] = st.get('x'); f['y'] = st.get('y'); f['dir'] = st.get('dir', 'y')
        f['bbox'] = st.get('bbox')
        out_f.append(f)
        b = st.get('bbox') or [0, 0, 1, 1]
        out_o.append(opening(dict(w=abs(b[2] - b[0]) or f['width'],
                                  h=abs(b[3] - b[1]) or f['run'],
                                  slab_h=slab_h, fc=fc, fy=fy, kind='درج',
                                  mesh_db=mesh.get('db', 12), mesh_s=mesh.get('s', 200),
                                  span=float(p.get('span', 4.0)),
                                  x=st.get('x'), y=st.get('y'))))
    for sh in (p.get('shafts') or []):
        s = shaft(dict(w=sh['w'], h=sh['h'], story_h=hs, floors=floors, fc=fc, fy=fy))
        s['x'] = sh.get('x'); s['y'] = sh.get('y')
        out_s.append(s)
        out_o.append(opening(dict(w=sh['w'], h=sh['h'], slab_h=slab_h, fc=fc, fy=fy,
                                  kind='مصعد', mesh_db=mesh.get('db', 12),
                                  mesh_s=mesh.get('s', 200), span=float(p.get('span', 4.0)),
                                  x=sh.get('x'), y=sh.get('y'))))
    area = sum(o['area'] for o in out_o)
    load = sum(f['reaction'] * 2 for f in out_f)
    return dict(flights=out_f, openings=out_o, shafts=out_s,
                open_area=round(area, 2), stair_load=round(load, 1),
                note='مساحة الفتحات تُخصم من مساحة السقف وحديده، وأحمال الدرج تُضاف '
                     'على الجسور المحيطة بالفتحة ومنها إلى الأعمدة.')
