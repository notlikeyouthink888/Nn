"""أدوات المساعد الذكي — حاسبات المنصة نفسها يستدعيها النموذج (tool calling).

كل أداة غلاف رفيع حول دالة موجودة بـ engine.py / detail.py / aikb.py، فالرقم اللي
يقوله المساعد هو نفس رقم المعالج حرفياً، ومعه بند ACI 318-19 أو جدول الكود العراقي.
المدخلات تُفحص وتُحدّ (لا أرقام شاذة)، والمخرجات تُختصر (تقريب، وقص القوائم الطويلة).
"""
import json
import math

import aikb
import detail as DT
import engine as E


class ToolError(ValueError):
    pass


def _num(a, k, lo, hi, default=None, required=False):
    v = a.get(k, default)
    if v is None or v == '':
        if required:
            raise ToolError('القيمة %s مطلوبة' % k)
        return default
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise ToolError('القيمة %s لازم تكون رقماً' % k)
    if not math.isfinite(v) or v < lo or v > hi:
        raise ToolError('القيمة %s = %s خارج المدى المعقول (%s – %s)' % (k, v, lo, hi))
    return v


def _bool(a, k, default=False):
    v = a.get(k, default)
    if isinstance(v, str):
        return v.strip().lower() in ('1', 'true', 'yes', 'y', 'نعم', 'top', 'علوي')
    return bool(v)


def compact(o, depth=0):
    """تقريب لأربعة أرقام معنوية، وقص القوائم والنصوص الطويلة — حتى تبقى النتيجة خفيفة."""
    if isinstance(o, float):
        if not math.isfinite(o):
            return None
        return float('%.4g' % o)
    if isinstance(o, dict):
        if depth > 3:
            return '…'
        return {k: compact(v, depth + 1) for k, v in o.items() if not (isinstance(v, list) and len(v) > 40)}
    if isinstance(o, (list, tuple)):
        return [compact(v, depth + 1) for v in list(o)[:40]]
    if isinstance(o, str) and len(o) > 400:
        return o[:400] + '…'
    return o


# ------------------------------------------------------------------ الأدوات
def t_development(a):
    db = _num(a, 'db', 6, 57, required=True)
    fc = _num(a, 'fc', 17, 80, 28.0)
    fy = _num(a, 'fy', 280, 690, 420.0)
    cover = _num(a, 'cover', 15, 150, 40.0)
    spacing = _num(a, 'spacing', 20, 1000, None)
    lam = _num(a, 'lam', 0.75, 1.0, 1.0)
    top, epoxy = _bool(a, 'top'), _bool(a, 'epoxy')
    ld = E.dev_length(db, fc, fy, top=top, epoxy=epoxy, lam=lam, cover=cover, spacing=spacing, detail=True)
    ldh = E.hook_dev(db, fc, fy, epoxy=epoxy, lam=lam, detail=True)
    ldc = E.dev_compression(db, fc, fy, lam=lam, detail=True)
    lapB = E.lap_length(db, fc, fy, top=top, class_b=True)
    lapA = E.lap_length(db, fc, fy, top=top, class_b=False)
    return dict(inputs=dict(db=db, fc=fc, fy=fy, cover=cover, spacing=spacing, top=top, epoxy=epoxy, lam=lam),
                ld_mm=ld['ld'], ld_detail=ld, ldh_mm=ldh['ldh'], ldh_detail=ldh, ldc_mm=ldc['ldc'], ldc_detail=ldc,
                lap_class_B_mm=lapB, lap_class_A_mm=lapA,
                clauses=['ACI 318-19 25.4.2.4(a) + جدول 25.4.2.5 (ld)', '25.4.3.1 + جدول 25.4.3.2 (ldh)',
                         '25.4.9.2 (ldc)', 'جدول 25.5.2.1 (الوصلات: صنف A = 1.0·ld · صنف B = 1.3·ld ≥ 300 مم)'])


def t_flexure(a):
    Mu = _num(a, 'Mu', 0.1, 50000, required=True)
    b = _num(a, 'b', 100, 4000, required=True)
    h = _num(a, 'h', 120, 4000, required=True)
    fc = _num(a, 'fc', 17, 80, 28.0)
    fy = _num(a, 'fy', 280, 690, 420.0)
    d = _num(a, 'd', 60, 3990, None) or (h - 65.0)
    if d >= h:
        raise ToolError('العمق الفعّال d لازم يكون أصغر من h')
    r = E.flexure(Mu, b, d, fc, fy, h=h)
    r['assumed_d'] = 'd = h − 65 مم (غطاء 40 + كانة 10 + نصف سيخ)' if a.get('d') in (None, '') else 'd من المستخدم'
    r['clauses'] = ['ACI 318-19 22.2 (ويتني)', '9.6.1.2 (أقل حديد)', '9.3.3.1 + 21.2.2 (εt و φ)', '25.2.1 (الخلوص)']
    return r


def t_shear(a):
    Vu = _num(a, 'Vu', 0.1, 50000, required=True)
    bw = _num(a, 'bw', 100, 4000, required=True)
    d = _num(a, 'd', 60, 4000, required=True)
    fc = _num(a, 'fc', 17, 80, 28.0)
    fy = _num(a, 'fy', 280, 690, 420.0)
    fyt = _num(a, 'fyt', 280, 550, 420.0)
    legs = int(_num(a, 'legs', 2, 8, 2))
    ds = _num(a, 'db_stirrup', 6, 16, 10)
    r = E.shear(Vu, bw, d, fc, fy, fyt=fyt, legs=legs, db_stirrup=int(ds))
    r['clauses'] = ['ACI 318-19 جدول 22.5.5.1 (Vc)', '22.5.8.5.3 (Vs)', '9.6.3.4 (Av,min)', '9.7.6.2.2 (أقصى تباعد)']
    return r


def t_punching(a):
    Vu = _num(a, 'Vu', 1, 100000, required=True)
    c1 = _num(a, 'c1', 150, 3000, required=True)
    c2 = _num(a, 'c2', 150, 3000, None) or c1
    d = _num(a, 'd', 80, 3000, required=True)
    fc = _num(a, 'fc', 17, 80, 28.0)
    pos = a.get('pos') if a.get('pos') in ('interior', 'edge', 'corner') else 'interior'
    return E.punching(Vu, c1, c2, d, fc, pos=pos)


def t_column(a):
    p = dict(b=_num(a, 'b', 200, 3000, required=True), h=_num(a, 'h', 200, 3000, required=True),
             fc=_num(a, 'fc', 17, 80, 28.0), fy=_num(a, 'fy', 280, 690, 420.0),
             nb=int(_num(a, 'nb', 2, 20, 3)), nh=int(_num(a, 'nh', 2, 20, 3)), db=_num(a, 'db', 10, 40, 20),
             Pu=_num(a, 'Pu', 0, 100000, required=True), Mu=_num(a, 'Mu', 0, 50000, 0.0))
    for k in ('L', 'k'):
        if a.get(k) not in (None, ''):
            p[k] = float(a[k])
    r = E.column_module(p)
    r.pop('pts', None)
    r['clauses'] = ['ACI 318-19 22.4 (منحني التفاعل بالتوافق الانفعالي)', '10.6.1.1 (1% ≤ ρ ≤ 8%)',
                    '6.2.5 + 6.6.4 (النحافة وتكبير العزم)', '25.7.2 (الأتاري)']
    return r


def t_footing(a):
    p = dict(PD=_num(a, 'PD', 1, 50000, required=True), PL=_num(a, 'PL', 0, 50000, 0.0),
             qa=_num(a, 'qa', 25, 1500, required=True), fc=_num(a, 'fc', 17, 80, 28.0), fy=_num(a, 'fy', 280, 690, 420.0),
             cx=_num(a, 'cx', 150, 3000, 400), cy=_num(a, 'cy', 150, 3000, 400), M=_num(a, 'M', 0, 20000, 0.0))
    r = E.footing_module(p)
    r['clauses'] = ['ACI 318-19 13.3 (الأساس المنفرد)', 'جدول 22.6.5.2 (قص الثقب)', 'جدول 22.5.5.1 (القص باتجاه واحد)',
                    '7.6.1.1 / 13.3.4 (أقل حديد)', '20.5.1.3.1 (غطاء 75 مم على التربة)']
    return r


def t_live(a):
    q = str(a.get('occupancy') or '').strip()
    rows = [dict(use=u, live_kN_m2=v) for u, v in E.LIVE]
    if q:
        qt = set(aikb.tokens(q))
        hit = [r for r in rows if qt & set(aikb.tokens(r['use']))]
        if hit:
            rows = hit
    return dict(source='الكود العراقي للأحمال والقوى — جدول المنصة (engine.LIVE)', rows=rows,
                note='الحمل الحي يُضرب بـ 1.6 بالتركيب 1.2D + 1.6L (ACI 318-19 §5.3.1).')


def t_densities(a):
    return dict(source='الكود العراقي للأحمال والقوى — جدول المنصة (engine.DENS)',
                rows=[dict(material=m, kN_m3=v) for m, v in E.DENS])


_SYS_KEYS = {'omf': 0, 'imf': 1, 'smf': 2, 'wall_ord': 3, 'wall_special': 4, 'dual': 5}


def t_seismic(a):
    city = str(a.get('city') or 'بغداد')
    if city not in E.SEISMIC_CITIES:
        nc = aikb.norm(city).replace(' ', '')
        city = next((c for c in E.SEISMIC_CITIES if aikb.norm(c).replace(' ', '') in nc or nc in aikb.norm(c).replace(' ', '')), city)
    site = str(a.get('site') or 'D').upper()[:1]
    if site not in E.FA:
        site = 'D'
    names = list(E.SYSTEMS)
    s = str(a.get('system') or 'imf').strip()
    system = names[_SYS_KEYS[s.lower()]] if s.lower() in _SYS_KEYS else (s if s in E.SYSTEMS else names[1])
    p = dict(city=city, site=site, system=system, hn=_num(a, 'hn', 2, 300, required=True),
             W=_num(a, 'W', 10, 5e6, required=True), Ie=_num(a, 'Ie', 1.0, 1.5, 1.0))
    r = E.seismic(p)
    r['known_city'] = city in E.SEISMIC_CITIES
    r['cities'] = list(E.SEISMIC_CITIES)
    r['systems'] = names
    r['clauses'] = ['ASCE 7-16 §12.8 (ELF) كما تعتمدها المنصة للكود العراقي للمقاومة الزلزالية',
                    'ASCE 7-16 جدولا 11.4-1 و 11.4-2 (Fa و Fv)']
    return r


def t_floor(a):
    p = dict(slab=_num(a, 'slab', 50, 1000, 150), sand=_num(a, 'sand', 0, 300, 50), mortar=_num(a, 'mortar', 0, 150, 25),
             tiles=_num(a, 'tiles', 0, 100, 25), plaster=_num(a, 'plaster', 0, 100, 20),
             partitions=_num(a, 'partitions', 0, 10, 1.0), extra=_num(a, 'extra', 0, 50, 0.0), live=_num(a, 'live', 0, 30, 2.0))
    r = E.floor_load(p)
    r['clauses'] = ['الكود العراقي للأحمال والقوى (الكثافات والأحمال الحية)', 'ACI 318-19 §5.3.1 (تراكيب الأحمال)']
    return r


def t_cover(a):
    el = str(a.get('element') or 'beam')
    if el not in ('slab', 'beam', 'column', 'footing', 'wall', 'raft'):
        el = 'beam'
    ex = str(a.get('exposure') or 'interior')
    if ex not in [k for k, _ in DT.EXPOSURES]:
        ex = 'interior'
    db = _num(a, 'db', 6, 57, 16)
    return dict(cover_mm=DT.cover(el, ex, db), element=el, exposure=ex, db=db,
                table=[dict(case=n, cover_mm=v, ref=r) for n, v, r in DT.COVER_TABLE],
                exposures=[dict(key=k, name=n) for k, n in DT.EXPOSURES])


def t_crack(a):
    fy = _num(a, 'fy', 280, 690, 420.0)
    cc = _num(a, 'cc', 15, 150, 50.0)
    fs = _num(a, 'fs', 50, 500, None)
    s = E.crack_spacing(fy, cc, fs) if fs else E.crack_spacing(fy, cc)
    return dict(s_max_mm=s, fy=fy, cc_mm=cc, fs=fs or 2.0 / 3.0 * fy,
                rule='s ≤ min(380·(280/fs) − 2.5·cc ، 300·(280/fs)) و fs = ⅔fy افتراضياً', clause='ACI 318-19 §24.3.2')


def t_min_depth(a):
    L = _num(a, 'L', 0.5, 40, required=True)
    cond = a.get('cond') if a.get('cond') in ('simple', 'one_end', 'both', 'cant') else 'one_end'
    fy = _num(a, 'fy', 280, 690, 420.0)
    return dict(h_min_mm=E.min_h_beam(L, cond, fy), L_m=L, cond=cond, fy=fy,
                rule='L/16 بسيط · L/18.5 طرف مستمر · L/21 الطرفين · L/8 كابولي × (0.4 + fy/700)',
                clause='ACI 318-19 جدول 9.3.1.1 (بلا حساب هطول، لجسور لا تسند قواطع قابلة للتضرر)')


def t_wind(a):
    p = dict(V=_num(a, 'V', 15, 80, 34.0), exposure=(str(a.get('exposure') or 'B').upper()[:1]),
             h=_num(a, 'h', 3, 300, 12.0), B=_num(a, 'B', 3, 500, 20.0))
    if p['exposure'] not in ('B', 'C', 'D'):
        p['exposure'] = 'B'
    r = E.wind(p)
    r['clauses'] = ['ASCE 7-16 الفصلان 26–27 (طريقة الاتجاه) كما تعتمدها المنصة']
    return r


def t_docs(a):
    q = str(a.get('query') or '').strip()
    if not q:
        raise ToolError('اكتب نص البحث')
    return dict(results=aikb.search(q, k=4, budget=5200))


TOOLS = [
    ('development_length', 'Development length ld, hooked ldh, compression ldc and lap splices (class A/B) per ACI 318-19 using the platform engine. طول التماسك/النشر والوصلات.',
     dict(db=('number', 'bar diameter mm, e.g. 25'), fc=('number', "f'c MPa (default 28)"), fy=('number', 'fy MPa (default 420)'),
          top=('boolean', 'top bar (more than 300 mm fresh concrete below) ψt = 1.3'), epoxy=('boolean', 'epoxy-coated'),
          cover=('number', 'clear cover mm (default 40)'), spacing=('number', 'center-to-center bar spacing mm (optional)'),
          lam=('number', 'λ lightweight factor (1.0 normal)')), ['db'], t_development,
     lambda a: 'طول التماسك والوصلات Ø%s' % _fmt(a.get('db')),
     lambda r: 'طول النشر ld = %s مم · العكفة ldh = %s مم · الوصلة صنف B = %s مم' % (_fmt(r['ld_mm']), _fmt(r['ldh_mm']), _fmt(r['lap_class_B_mm']))),
    ('beam_flexure', 'Rectangular beam flexural design: As required, bars, phiMn, strain, min/max steel per ACI 318-19 (platform engine). تصميم الانحناء.',
     dict(Mu=('number', 'factored moment kN·m'), b=('number', 'width mm'), h=('number', 'total depth mm'), d=('number', 'effective depth mm (optional, default h-65)'),
          fc=('number', "f'c MPa"), fy=('number', 'fy MPa')), ['Mu', 'b', 'h'], t_flexure,
     lambda a: 'تصميم انحناء %s×%s لعزم %s kN·m' % (_fmt(a.get('b')), _fmt(a.get('h')), _fmt(a.get('Mu'))),
     lambda r: 'الحديد المطلوب As = %s مم² · المختار %s · المقاومة φMn = %s kN·m' % (_fmt(r.get('As_req')), (r.get('bars') or {}).get('label', ''), _fmt(r.get('phiMn')))),
    ('beam_shear', 'One-way shear and stirrups (Vc, Vs, spacing) per ACI 318-19 Table 22.5.5.1 (platform engine). القص والكانات.',
     dict(Vu=('number', 'factored shear kN'), bw=('number', 'web width mm'), d=('number', 'effective depth mm'), fc=('number', "f'c MPa"),
          fy=('number', 'fy MPa'), fyt=('number', 'stirrup fy MPa'), legs=('integer', 'stirrup legs (default 2)'), db_stirrup=('number', 'stirrup diameter mm (default 10)')),
     ['Vu', 'bw', 'd'], t_shear,
     lambda a: 'قص Vu = %s kN بمقطع %s×%s' % (_fmt(a.get('Vu')), _fmt(a.get('bw')), _fmt(a.get('d'))),
     lambda r: 'مقاومة الخرسانة φVc = %s kN · الكانات %s · النسبة %s' % (_fmt(r.get('phiVc')), r.get('label', ''), _fmt(r.get('ratio')))),
    ('punching_shear', 'Two-way (punching) shear capacity around a column per ACI 318-19 Table 22.6.5.2. قص الثقب.',
     dict(Vu=('number', 'factored punching force kN'), c1=('number', 'column side mm'), c2=('number', 'other column side mm'), d=('number', 'effective depth mm'),
          fc=('number', "f'c MPa"), pos=('string', 'interior | edge | corner')), ['Vu', 'c1', 'd'], t_punching,
     lambda a: 'قص الثقب حول عمود %s' % _fmt(a.get('c1')),
     lambda r: 'المقاومة φVc = %s kN · النسبة %s · %s' % (_fmt(r.get('phiVc')), _fmt(r.get('ratio')), r.get('rec', ''))),
    ('column_check', 'Rectangular tied column check with P-M interaction (strain compatibility) and slenderness per ACI 318-19 (platform engine). فحص العمود.',
     dict(b=('number', 'mm'), h=('number', 'mm'), fc=('number', "f'c MPa"), fy=('number', 'fy MPa'), nb=('integer', 'bars along b face'), nh=('integer', 'bars along h face'),
          db=('number', 'bar diameter mm'), Pu=('number', 'factored axial kN'), Mu=('number', 'factored moment kN·m')), ['b', 'h', 'Pu'], t_column,
     lambda a: 'فحص عمود %s×%s لحمل %s kN' % (_fmt(a.get('b')), _fmt(a.get('h')), _fmt(a.get('Pu'))),
     lambda r: 'الحديد %s · النسبة ρ = %s%% · الاستغلال %s · أقصى حمل φPn,max = %s kN' % (r.get('bars', ''), _fmt((r.get('rho') or 0) * 100), _fmt(r.get('ratio')), _fmt(r.get('phiPn_max')))),
    ('isolated_footing', 'Isolated footing design (size, depth, punching, one-way shear, flexure) per ACI 318-19 Chapter 13 (platform engine). تصميم الأساس المنفرد.',
     dict(PD=('number', 'service dead load kN'), PL=('number', 'service live load kN'), qa=('number', 'allowable soil pressure kPa'), fc=('number', "f'c MPa"),
          fy=('number', 'fy MPa'), cx=('number', 'column size x mm'), cy=('number', 'column size y mm'), M=('number', 'moment kN·m (optional)')), ['PD', 'qa'], t_footing,
     lambda a: 'أساس منفرد لحمل %s + %s kN' % (_fmt(a.get('PD')), _fmt(a.get('PL'))),
     lambda r: 'العرض B = %s م · السماكة h = %s مم · الحديد %s' % (_fmt(r.get('B')), _fmt(r.get('h')), r.get('bars_label', ''))),
    ('iraqi_live_load', 'Live loads by occupancy from the Iraqi Code for Loads and Forces table used by the platform. الأحمال الحية بالكود العراقي.',
     dict(occupancy=('string', 'use in Arabic, e.g. مكاتب، سكني، مدارس (optional — empty returns the full table)')), [], t_live,
     lambda a: 'الحمل الحي (الكود العراقي)%s' % ((' — ' + a['occupancy']) if a.get('occupancy') else ''),
     lambda r: '، '.join('%s = %s' % (x['use'], _fmt(x['live_kN_m2'])) for x in r['rows'][:4]) + ' kN/m²'),
    ('material_densities', 'Material unit weights (kN/m³) per the Iraqi Code for Loads and Forces table used by the platform. كثافات المواد.',
     dict(), [], t_densities, lambda a: 'كثافات المواد (الكود العراقي)', lambda r: '%d مادة' % len(r['rows'])),
    ('seismic_base_shear', 'Seismic equivalent lateral force (ASCE 7-16 ELF as adopted by the platform for the Iraqi seismic code) with governorate Ss/S1. القوة الزلزالية.',
     dict(city=('string', 'Iraqi governorate in Arabic, e.g. بغداد، أربيل'), site=('string', 'site class A-E (default D)'),
          system=('string', 'omf | imf | smf | wall_ord | wall_special | dual'), hn=('number', 'building height m'), W=('number', 'seismic weight kN'),
          Ie=('number', 'importance factor 1.0-1.5')), ['hn', 'W'], t_seismic,
     lambda a: 'القوة الزلزالية — %s' % (a.get('city') or 'بغداد'),
     lambda r: 'التسارع SDS = %s · المعامل Cs = %s · القص القاعدي V = %s kN · الصنف %s' % (_fmt(r.get('SDS')), _fmt(r.get('Cs_use')), _fmt(r.get('V')), r.get('sdc', ''))),
    ('floor_dead_load', 'Floor dead load build-up (slab, sand, mortar, tiles, plaster, partitions) and ACI load combinations. حمل الطابق.',
     dict(slab=('number', 'slab thickness mm'), sand=('number', 'mm'), mortar=('number', 'mm'), tiles=('number', 'mm'), plaster=('number', 'mm'),
          partitions=('number', 'kN/m²'), extra=('number', 'kN/m²'), live=('number', 'live load kN/m²')), [], t_floor,
     lambda a: 'حمل الطابق لبلاطة %s مم' % _fmt(a.get('slab', 150)),
     lambda r: 'الميت D = %s · الحي L = %s · المصعّد wu = %s kN/m²' % (_fmt(r.get('D')), _fmt(r.get('L')), _fmt(r.get('wu')))),
    ('concrete_cover', 'Specified concrete cover per ACI 318-19 Table 20.5.1.3.1 as used by the platform. الغطاء الخرساني.',
     dict(element=('string', 'slab | beam | column | footing | wall | raft'), exposure=('string', 'ground | weather | interior'), db=('number', 'bar diameter mm')),
     [], t_cover, lambda a: 'الغطاء — %s' % (a.get('element') or 'beam'), lambda r: 'الغطاء = %s مم' % _fmt(r['cover_mm'])),
    ('crack_spacing', 'Maximum spacing of tension bars for crack control per ACI 318-19 §24.3.2. تباعد الحديد للتشقق.',
     dict(fy=('number', 'MPa'), cc=('number', 'clear cover to tension bar mm'), fs=('number', 'service stress MPa (optional, default 2/3 fy)')), [], t_crack,
     lambda a: 'أقصى تباعد للتشقق', lambda r: 'أقصى تباعد s ≤ %s مم' % _fmt(r['s_max_mm'])),
    ('beam_min_depth', 'Minimum beam depth without deflection calculation per ACI 318-19 Table 9.3.1.1. أقل عمق للجسر.',
     dict(L=('number', 'span m'), cond=('string', 'simple | one_end | both | cant'), fy=('number', 'MPa')), ['L'], t_min_depth,
     lambda a: 'أقل عمق لجسر بحره %s م' % _fmt(a.get('L')), lambda r: 'أقل عمق h ≥ %s مم' % _fmt(r['h_min_mm'])),
    ('wind_pressure', 'Wind pressure profile and total force (ASCE 7 directional procedure, as used by the platform). ضغط الرياح.',
     dict(V=('number', 'basic wind speed m/s'), exposure=('string', 'B | C | D'), h=('number', 'height m'), B=('number', 'width facing wind m')), [], t_wind,
     lambda a: 'ضغط الرياح', lambda r: 'الضغط qh = %s kPa · القوة الكلية = %s kN' % (_fmt(r.get('qh')), _fmt(r.get('F_total')))),
    ('search_platform_docs', "Search the platform's own references (ACI 318-19 implementation map, platform guide, CAD reader, glossary, Iraqi code tables). ابحث بمراجع المنصة.",
     dict(query=('string', 'search text in Arabic or English, or a clause number like 25.4.2.4')), ['query'], t_docs,
     lambda a: 'بحث بمراجع المنصة: %s' % str(a.get('query', ''))[:40], lambda r: '%d نتيجة' % len(r['results'])),
]


def _fmt(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return str(v if v is not None else '—')
    if not math.isfinite(v):
        return '—'
    return ('%.0f' % v) if abs(v) >= 100 else ('%.2f' % v).rstrip('0').rstrip('.')


_BY = {t[0]: t for t in TOOLS}


def schema():
    """تعريف الأدوات بصيغة OpenAI/OpenRouter."""
    out = []
    for name, desc, params, req, *_ in TOOLS:
        props = {k: {'type': t, 'description': d} for k, (t, d) in params.items()}
        out.append({'type': 'function', 'function': {'name': name, 'description': desc,
                                                     'parameters': {'type': 'object', 'properties': props, 'required': req}}})
    return out


def run(name, args):
    """ينفّذ أداة ويرجع (النتيجة المختصرة، تسمية للواجهة، ملخص سطر واحد)."""
    t = _BY.get(name)
    if not t:
        return dict(error='أداة غير معروفة: %s' % name), name, 'أداة غير معروفة'
    if isinstance(args, str):
        try:
            args = json.loads(args or '{}')
        except ValueError:
            args = {}
    if not isinstance(args, dict):
        args = {}
    label = t[5](args)
    try:
        r = t[4](args)
    except ToolError as e:
        return dict(error=str(e)), label, '⚠️ ' + str(e)
    except Exception as e:                      # لا تُسقط المحادثة بسبب أداة
        return dict(error='تعذّر الحساب: %s' % e), label, '⚠️ تعذّر الحساب'
    r = compact(r)
    try:
        summ = t[6](r)
    except Exception:
        summ = ''
    return r, label, summ


def names():
    return [t[0] for t in TOOLS]
