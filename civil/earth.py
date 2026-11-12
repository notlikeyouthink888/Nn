# -*- coding: utf-8 -*-
"""
الحفريات والردم والمناسيب — Earthworks.
كل المناسيب بالنسبة لنقطة البنج مارك BM = 0.00 (منسوب التشطيب النهائي للطابق الأرضي)،
والموجب للأعلى. الوحدات: متر و م³.
"""
import math

# كثافات ومعاملات
BULK = 1.25       # معامل الانتفاش: حجم التربة بعد الحفر / حجمها بالموقع
COMP = 0.88       # حجم مدكوك / حجم سائب مُشترى (أي: المشترى = المدكوك ÷ 0.88)
LAYER_BOULDER = 0.30   # سماكة طبقة الجلمود/الردم المختار (مدكوكة)
LAYER_SUBBASE = 0.25   # سماكة طبقة السبيس المدكوكة

def _n_layers(t, tl):
    return int(math.ceil(round(t / tl, 6))) if t > 1e-6 else 0

def earthwork(p):
    plot = float(p.get('plot', 200.0))              # مساحة القطعة م²
    fp = float(p.get('footprint', plot))            # مساحة البناء م²
    bm = 0.0                                        # منسوب التشطيب FFL
    ground = float(p.get('ground', -0.30))          # منسوب الأرض الطبيعية
    old_depth = float(p.get('old_depth', 0.0))      # عمق حفريات/هدم قديمة تحت الأرض الطبيعية
    Df = float(p.get('Df', 1.50))                   # عمق قاعدة الأساس تحت FFL
    foot_h = float(p.get('foot_h', 0.50))           # سماكة الأساس
    blind = float(p.get('blind', 0.10))             # خرسانة نظافة تحت الأساس
    finish = float(p.get('finish', 0.05))           # كاشي ومونة
    slab_h = float(p.get('slab_h', 0.15))           # أرضية خرسانية
    blind_slab = float(p.get('blind_slab', 0.10))   # مفرش تحت الأرضية
    sub_t = float(p.get('subbase', 0.25))           # سماكة السبيس تحت الأرضية
    dig_mode = p.get('dig_mode', 'trench')          # trench | full
    foot_area = float(p.get('foot_area', 0.0))      # مجموع مساحات الأسس (لوضع الخنادق)
    over = float(p.get('over_dig', 0.50))           # زيادة الحفر حول الأساس للعمل

    existing = ground - old_depth                   # منسوب سطح العمل الحالي (قعر الهدم إن وُجد)
    found_bot = bm - Df                             # قاعدة الأساس
    blind_bot = found_bot - blind                   # قعر خرسانة النظافة = منسوب التأسيس
    found_top = found_bot + foot_h                  # أعلى الأساس

    # ---------- الحفر أو الردم للوصول لمنسوب التأسيس ----------
    if existing > blind_bot:
        cut_depth = existing - blind_bot
        fill_to_found = 0.0
    else:
        cut_depth = 0.0
        fill_to_found = blind_bot - existing        # ردم هندسي تحت الأساس (الحالة اللي عندك)

    if dig_mode == 'full':
        dig_area = fp
    else:
        dig_area = min(fp, (foot_area or fp * 0.35) * 1.6 + fp * 0.05)
        dig_area = max(dig_area, foot_area * 1.2 if foot_area else dig_area)
    cut_vol = cut_depth * dig_area
    cut_loose = cut_vol * BULK

    # ---------- طبقات الردم تحت الأساس (إن لزم) ----------
    stack = []
    def add(name, bot, top, kind, layer_t=None, area=fp, color="#7c6a52"):
        t = round(top - bot, 4)
        if t <= 1e-6: return
        v = t * area
        stack.append(dict(name=name, bottom=round(bot, 3), top=round(top, 3), t=t,
                          kind=kind, area=area, volume=v, color=color,
                          layers=_n_layers(t, layer_t) if layer_t else None,
                          layer_t=layer_t,
                          buy=(v / COMP if kind in ('boulder', 'subbase') else None)))

    if fill_to_found > 1e-6:
        # الجزء الأكبر جلمود/ردم مختار وآخر 25 سم سبيس مدكوك تحت خرسانة النظافة
        sub_under = min(sub_t, fill_to_found)
        boul = fill_to_found - sub_under
        add("ردم جلمود/ردم مختار تحت الأساس", existing, existing + boul, "boulder",
            LAYER_BOULDER, dig_area or fp, "#8a6f4e")
        add("سبيس مدكوك تحت الأساس", existing + boul, blind_bot, "subbase",
            LAYER_SUBBASE, dig_area or fp, "#a08b6a")

    add("خرسانة نظافة (بلوكاجة)", blind_bot, found_bot, "blinding", None, dig_area or fp, "#9aa3ad")
    add("الأساس الخرساني المسلح", found_bot, found_top, "footing", None, foot_area or fp * 0.35, "#5b7fa6")

    # ---------- من أعلى الأساس إلى منسوب التشطيب ----------
    fin_bot = bm - finish
    slab_bot = fin_bot - slab_h
    mat_bot = slab_bot - blind_slab
    sub_bot = mat_bot - sub_t
    back_t = max(0.0, sub_bot - found_top)
    add("ردم مختار خلف/فوق الأساس", found_top, found_top + back_t, "boulder",
        LAYER_BOULDER, fp, "#8a6f4e")
    add("سبيس مدكوك تحت الأرضية", sub_bot, mat_bot, "subbase", LAYER_SUBBASE, fp, "#a08b6a")
    add("مفرش خرساني (نظافة)", mat_bot, slab_bot, "blinding", None, fp, "#9aa3ad")
    add("أرضية خرسانية", slab_bot, fin_bot, "slab", None, fp, "#6b8fb5")
    add("تشطيب (مونة وكاشي)", fin_bot, bm, "finish", None, fp, "#c9b28a")

    boulder = sum(s['volume'] for s in stack if s['kind'] == 'boulder')
    subbase = sum(s['volume'] for s in stack if s['kind'] == 'subbase')
    blinding = sum(s['volume'] for s in stack if s['kind'] == 'blinding')
    n_bo = sum(s['layers'] or 0 for s in stack if s['kind'] == 'boulder')
    n_sb = sum(s['layers'] or 0 for s in stack if s['kind'] == 'subbase')

    # أعمال خارجية بسيطة (ساحات القطعة خارج البناء)
    yard = max(0.0, plot - fp)
    yard_sub = yard * 0.20

    steps = [
        ("منسوب التشطيب (BM)", "0.00"),
        ("منسوب الأرض الطبيعية", "%+.2f" % ground),
        ("عمق الهدم/الحفريات القديمة", "%.2f م تحت الأرض الطبيعية" % old_depth if old_depth else "لا يوجد"),
        ("منسوب سطح العمل الحالي", "%+.2f" % existing),
        ("منسوب قاعدة الأساس", "%+.2f  (عمق %.2f م تحت التشطيب)" % (found_bot, Df)),
        ("منسوب التأسيس (تحت خرسانة النظافة)", "%+.2f" % blind_bot),
        ("الأساس يأخذ من الفرق", "%.2f م (سماكة الأساس %.2f + نظافة %.2f)" % (foot_h + blind, foot_h, blind)),
    ]
    if fill_to_found > 1e-6:
        steps.append(("مطلوب ردم هندسي تحت الأساس", "%.2f م — لأن قعر الحفر القديم (%+.2f) أوطأ من منسوب التأسيس (%+.2f)"
                      % (fill_to_found, existing, blind_bot)))
    else:
        steps.append(("مطلوب حفر", "%.2f م للوصول من %+.2f إلى منسوب التأسيس %+.2f" % (cut_depth, existing, blind_bot)))

    return dict(levels=dict(bm=bm, ground=ground, existing=existing, found_bot=found_bot,
                            found_top=found_top, blind_bot=blind_bot, ffl=bm),
                cut_depth=cut_depth, cut_vol=cut_vol, cut_loose=cut_loose, dig_area=dig_area,
                fill_to_found=fill_to_found, stack=stack, steps=steps,
                boulder=boulder, boulder_buy=boulder / COMP, boulder_layers=n_bo,
                subbase=subbase, subbase_buy=subbase / COMP, subbase_layers=n_sb,
                blinding=blinding, yard=yard, yard_subbase=yard_sub,
                plot=plot, footprint=fp, bulk=BULK, comp=COMP,
                notes=[
                    "الردم تحت الأساس يجب أن يكون ردماً هندسياً مدكوكاً بطبقات لا تزيد عن %d سم وبكثافة لا تقل عن 95%% من بروكتور المعدّل" % int(LAYER_BOULDER * 100),
                    "معامل الانتفاش %.2f يُستعمل لحساب حجم التربة المنقولة خارج الموقع، ومعامل الدك %.2f لحساب الكمية المشتراة" % (BULK, COMP),
                    "لا يجوز التأسيس على ردم قديم غير مدكوك — يُزال بالكامل ويُستبدل بردم هندسي أو يُنزل الأساس لطبقة سليمة",
                    "يُنفّذ فحص كثافة حقلي (Field Density Test) لكل طبقة قبل صب الطبقة التي فوقها",
                ])
