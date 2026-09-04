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
    return dict(steps=steps, tread=tread, rise=rise, width=width, run=round(run, 2),
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
