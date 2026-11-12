# -*- coding: utf-8 -*-
"""
قاعدة معرفة المهندس المدني بمخططات الأوتوكاد الإنشائية.

مصدر واحد لكل ما «يعرفه» قسم الأوتوكاد عن اصطلاحات الرسم: أنواع اللوحات وعناوينها،
الطوابق وترتيبها، علامات العناصر (C1 · B2 · F3)، المقاطع (350X800)، صيغ التسليح
(%%C16@200 T)، السماكة والمقياس، رموز الرسم (فقاعة المحور، X الفتحة، الجسر بخطّين)،
وأسماء الطبقات الشائعة بالمكاتب العراقية والعربية.

القاعدة بيانات قبل أن تكون كوداً: `dictionary()` ترجعها كاملة لتُعرض للمستخدم
(«📖 قاموس الرموز»)، وكل دالة `parse_*` هنا تقرأ نصاً واحداً ولا تعرف شيئاً عن
الهندسة — ربط النص بمكانه عمل `cadread.py`.

الأسبقية عند التعارض: تعريف المستخدم بالواجهة ← تعريف المهندس داخل الملف ← هذه القاعدة.
"""
import functools
import re

from plan import parse_rebar_callout, clean_text as _pl_clean


def clean_text(t):
    """تنظيف النص + حذف التطويل («مسـقط» = «مسقط») قبل أي مطابقة."""
    return (_pl_clean(t) or '').replace('ـ', '')

# ------------------------------ أنواع اللوحات ------------------------------
# الترتيب مهم: الأخصّ أولاً («Schedule of Beams» قبل «Beams Key Plan» قبل «Plan»).
SHEET_KINDS = [
    ('beam_sched', 'جدول الجسور',
     r'(schedule\s+of\s+beams|beams?\s+schedule|جدول\s*(الجسور|الكمرات))'),
    ('col_sched', 'جدول تسليح الأعمدة',
     r'(columns?\s+(reinforc\w*\s+)?schedule|schedule\s+of\s+columns|جدول\s*(تسليح\s*)?الأعمدة)'),
    ('foot_sched', 'جدول الأساسات',
     r'(footings?\s+schedule|schedule\s+of\s+(footings|foundations)|جدول\s*الأساسات)'),
    ('slab_sched', 'جدول البلاطات', r'(slabs?\s+schedule|schedule\s+of\s+slabs|جدول\s*البلاطات)'),
    ('slab_rft', 'مخطط تسليح سقف',
     r'(slab\s+reinforc\w*\s+plan|reinforc\w*\s+plan\s+for\s+(the\s+)?roof|slab\s+layout|'
     r'تسليح\s*(السقف|البلاطة|سقف))'),
    ('beams_key', 'مخطط مفتاح الجسور',
     r'(beams?\s+key\s+plan|beams?\s+layout|framing\s+plan|مفتاح\s*الجسور|مخطط\s*(الجسور|الكمرات))'),
    ('cols_key', 'مخطط مفتاح الأعمدة',
     r'(columns?\s+key\s+plan|columns?\s+layout|setting\s+out\s+of\s+columns|مخطط\s*(الأعمدة|الاعمدة)|'
     r'توقيع\s*الأعمدة)'),
    ('found', 'مخطط الأساسات',
     r'(foundation\s+plan|footings?\s+(plan|layout)|raft\s+plan|piles?\s+(plan|layout)|'
     r'مخطط\s*الأساسات|الأساسات|القواعد|\bالأساس\b|\bالاساس\b|الميدات|\bميدات\b)'),
    # مساقط مرجعية (تشطيبات/أثاث/سقف مستعار/السطح العلوي) — تُعرض ولا تُركَّب بدل المسقط الأصلي
    ('finish', 'مسقط تشطيبات/أثاث', r'(finish(es)?\s+plan|furniture\s+(plan|layout)|sitting\s+layout|seating\s+layout|'
                                   r'reflected\s+ceiling|ceiling\s+plan|upper\s+roof|مسقط\s*(التشطيبات|الأثاث|السقف\s*المستعار)|'
                                   r'لتشطيبات|لتشطبات|تشطيبات\s*الدور|للسقف\s*المستعار|مسقط\s*(ال)?(افقي|أفقي)\s*لسقف|المفروش|مفروش)'),
    # تفاصيل تخصّصية (تُقرأ ملاحظاتها ولا تُركَّب مبنى)
    ('stair', 'تفصيلة درج', r'(stair\s+(detail|plan|section)|\bالسلم\b|\bسلم\b|\bالدرج\b|\bدرج\b|\bللسلم\b|\bللدرج\b)'),
    ('tank', 'خزان', r'(\btank\b|خزان)'),
    ('fence', 'سور', r'(\bfence\b|boundary\s+wall|\bالسور\b|\bسور\b|\bللسور\b)'),
    ('joint', 'فاصل تمدد', r'(expansion\s+joint|فاصل\s*(التمدد|تمدد|القطع))'),
    ('landscape', 'تنسيق موقع', r'(landscape|بركة|نافورة|حوض\s*زرع|تنسيق\s*الموقع)'),
    ('section', 'مقطع', r'(\bsection\b|\bsec\.\s*[a-z0-9]|مقطع)'),
    ('detail', 'تفصيلة', r'(typical\s+detail|\bdetail\b|تفصيل)'),
    ('elev', 'واجهة', r'(\belevation\b|facade|واجهة|واجهات)'),
    ('site', 'موقع عام', r'(site\s+plan|layout\s+plan|الموقع\s*العام|للموقع\s*العام|موقع\s*عام|كروكي\s*الموقع)'),
    ('arch', 'مسقط معماري', r'(floor\s+plan|ground\s+plan|مسقط|مخطط\s+(ال)?(طابق|دور|بيتونة|سطح|قبو|سرداب|بدروم))'),
]
_SHEET_RX = [(k, n, re.compile(p, re.I)) for k, n, p in SHEET_KINDS]
SHEET_NAMES = {k: n for k, n, _ in SHEET_KINDS}
# ما يُبنى عليه المجسم مباشرةً
PLAN_SHEETS = ('slab_rft', 'beams_key', 'cols_key', 'found')

# ------------------------------ الطوابق ------------------------------
# (المفتاح، الترتيب، الاسم العربي، نمط إنجليزي، نمط عربي)
FLOORS = [
    ('basement', -1.0, 'السرداب', r'basement|cellar', r'سرداب|قبو|البدروم'),
    ('ground', 0.0, 'الأرضي', r'ground', r'أرضي|ارضي|الأرضي|الارضي'),
    ('mezzanine', 0.5, 'الميزانين', r'mezzanine|mezz', r'ميزانين|الميزانين'),
    ('first', 1.0, 'الأول', r'first|1st|1th', r'الأول|الاول|أول'),
    ('second', 2.0, 'الثاني', r'secou?nd|2nd|2th', r'الثاني|ثاني'),
    ('third', 3.0, 'الثالث', r'third|3rd|3th', r'الثالث|ثالث'),
    ('fourth', 4.0, 'الرابع', r'fou?rth|4th', r'الرابع|رابع'),
    ('fifth', 5.0, 'الخامس', r'fifth|5th', r'الخامس|خامس'),
    ('sixth', 6.0, 'السادس', r'sixth|6th', r'السادس|سادس'),
    ('seventh', 7.0, 'السابع', r'seventh|7th', r'السابع|سابع'),
    ('eighth', 8.0, 'الثامن', r'eighth|8th', r'الثامن|ثامن'),
    ('ninth', 9.0, 'التاسع', r'ninth|9th', r'التاسع|تاسع'),
    ('tenth', 10.0, 'العاشر', r'tenth|10th', r'العاشر|عاشر'),
    ('typical', 50.0, 'المتكرر', r'typical|repeated', r'متكرر|المتكرر'),
    ('roof', 99.0, 'السطح', r'roof\s+floor|top\s+roof|terrace', r'السطح|سطح|البيتونة|بيتونة'),
]
FLOOR_ORDER = {k: o for k, o, *_ in FLOORS}
FLOOR_NAMES = {k: n for k, _, n, *_ in FLOORS}
_FLOOR_EN = [(k, re.compile(r'\b(' + en + r')\b\s*(floor|flr|level|storey|story)?', re.I)) for k, _, _, en, _ in FLOORS]
_FLOOR_AR = [(k, re.compile('(' + ar + ')')) for k, _, _, _, ar in FLOORS]
_ROOF_OF = re.compile(r'roof\s+(slab\s+)?of\s+(the\s+)?(?P<f>[a-z0-9]+)\s*(floor|flr|level)?', re.I)
_ROOF_OF_AR = re.compile(r'سقف\s*(الطابق)?\s*(?P<f>\S+)')


def parse_floor(text):
    """الطابق الذي تخصّه لوحة من عنوانها.

    «Slab … for Roof of Second Floor» = سقف الطابق الثاني: يُرجَع الطابق الثاني
    بعلَم `roof_of=True` — البلاطة والجسور تُحمل فوق أعمدة ذلك الطابق.
    يرجع dict(key, order, name, roof_of) أو None."""
    s = clean_text(text)
    m = _ROOF_OF.search(s)
    if m:
        f = m.group('f').lower()
        for k, rx in _FLOOR_EN:
            if rx.fullmatch(f) or rx.match(f + ' floor'):
                return dict(key=k, order=FLOOR_ORDER[k], name=FLOOR_NAMES[k], roof_of=True)
    m = _ROOF_OF_AR.search(s)
    if m:
        for k, rx in _FLOOR_AR:
            if rx.search(m.group('f')):
                return dict(key=k, order=FLOOR_ORDER[k], name=FLOOR_NAMES[k], roof_of=True)
    for k, rx in _FLOOR_EN:
        if k == 'roof':
            continue
        if rx.search(s):
            return dict(key=k, order=FLOOR_ORDER[k], name=FLOOR_NAMES[k], roof_of=False)
    for k, rx in _FLOOR_AR:
        if rx.search(s):
            return dict(key=k, order=FLOOR_ORDER[k], name=FLOOR_NAMES[k], roof_of=False)
    if re.search(r'\broof\b', s, re.I):
        return dict(key='roof', order=FLOOR_ORDER['roof'], name=FLOOR_NAMES['roof'], roof_of=False)
    return None


_LEAD_SECTION = re.compile(r'^\s*(مقطع|مقاطع|قطاع|قطاعات|section|sec\.)', re.I)
_LEAD_DETAIL = re.compile(r'^\s*(تفصيلة|تفاصيل|تفصيل|detail|typical\s+detail)', re.I)


def sheet_kind(text):
    s = clean_text(text)
    # الكلمة الأولى تحسم: «مقطع من الأساس» مقطع لا مخطط أساسات، و«تفصيلة …» تفصيلة
    if _LEAD_SECTION.match(s):
        return 'section'
    if _LEAD_DETAIL.match(s) and not re.search(r'(schedule|جدول)', s, re.I):
        return 'detail'
    for k, n, rx in _SHEET_RX:
        if rx.search(s):
            return k
    return None


_THICK = [re.compile(r'thick(?:ness)?\s*[=:]?\s*(\d{2,4})\s*=?\s*mm', re.I),
          re.compile(r'thick(?:ness)?\s*[=:]?\s*(\d{2,3})\s*=?\s*cm', re.I),
          re.compile(r'\bt\s*[=:]\s*(\d{2,4})\s*(mm)?\b', re.I),
          re.compile(r'سمك\s*(البلاطة|السقف)?\s*[=:]?\s*(\d{2,4})')]
_SCALE = re.compile(r'\bsc(ale)?\s*\.?\s*\.?\s*1\s*[:/]\s*(\d{1,5})', re.I)
_BUILDING = re.compile(r'\((block[-\s]?[\w]+)\)|\b(block[-\s]?\d+[a-z]?)\b', re.I)


def parse_thickness(text):
    """سماكة البلاطة بالمليمتر من نص العنوان/الملاحظة، أو None."""
    s = clean_text(text)
    for i, rx in enumerate(_THICK):
        m = rx.search(s)
        if not m:
            continue
        v = int(m.group(m.lastindex if i == 3 else 1))
        if i == 1:
            v *= 10
        if 60 <= v <= 1500:
            return v
    return None


def parse_title(text):
    """عنوان لوحة كامل → نوعها وطابقها وسماكتها ومقياسها واسم المبنى."""
    s = clean_text(text)
    kind = sheet_kind(s)
    fl = parse_floor(s)
    m = _SCALE.search(s)
    b = _BUILDING.search(s)
    return dict(text=s, kind=kind, kind_name=SHEET_NAMES.get(kind),
                floor=fl, thickness=parse_thickness(s),
                scale=int(m.group(2)) if m else None,
                building=(b.group(1) or b.group(2)).replace(' ', '-') if b else None)


_NOTE_START = {'يتم', 'ينفذ', 'تنفذ', 'يجب', 'ملاحظة', 'ملحوظة', 'ملاحظات', 'تهبط', 'تهبّط', 'يكسح', 'يمتد',
               'مساحة', 'أحمال', 'احمال', 'لا', 'انظر', 'راجع', 'يراعى', 'يعمل', 'تعمل', 'يترك', '-', 'ـ', '*'}


def is_title(text):
    """نص يصلح عنواناً للوحة (لا نداء تسليح ولا علامة عنصر ولا جملة ملاحظة)."""
    s = clean_text(text)
    if len(s) < 8 or sheet_kind(s) is None:
        return False
    if re.search('[\u0600-\u06FF]', s):
        ws = s.replace(':', ' ').split()
        if not ws or ws[0] in _NOTE_START or len(ws) > 12:
            return False                       # جملة تنفيذية/ملاحظة فيها كلمة «الأساس» ليست عنوان لوحة
    return True


# ------------------------------ علامات العناصر ------------------------------
MARKS = [
    ('col', 'عمود', r'^C\d{1,3}[A-Z]?[\'`′’]?$'),
    ('beam', 'جسر', r'^(B|GB|TB|RB|SB|PB|CB)\d{1,3}[A-Z]?[\'`′’]?$'),
    ('foot', 'أساس', r'^(F|IF|CF|SF|MF)\d{1,3}[A-Z]?$'),
    ('pile', 'ركيزة', r'^P\d{1,3}$'),
    ('slab', 'بلاطة', r'^S\d{1,3}[A-Z]?$'),
    ('stair', 'درج', r'^(ST|STAIR)\s*\d*$'),
    ('wall', 'جدار قص/ساند', r'^(SW|RW|W)\d{1,3}$'),
]
_MARK_RX = [(k, re.compile(p)) for k, _, p in MARKS]
MARK_NAMES = {k: n for k, n, _ in MARKS}


def mark_kind(text):
    s = clean_text(text).strip().upper().replace(' ', '')
    for k, rx in _MARK_RX:
        if rx.match(s):
            return k, s
    return None, None


# ------------------------------ المحاور ------------------------------
_AXIS = re.compile(r'^([A-Z]{1,2}|\d{1,3})([\'`′’])?$')


def axis_label(text):
    """نص فقاعة محور → (الاسم الأساس، ثانوي؟). «H`» = محور ثانوي قرب H."""
    s = clean_text(text).strip().upper()
    m = _AXIS.match(s)
    if not m:
        return None
    return dict(name=m.group(1) + ("'" if m.group(2) else ''), base=m.group(1), prime=bool(m.group(2)),
                numeric=m.group(1).isdigit())


def axis_sort_key(name):
    base = name.rstrip("'")
    prime = name.endswith("'")
    if base.isdigit():
        return (0, int(base), prime)
    v = 0
    for ch in base:
        v = v * 26 + (ord(ch) - 64)
    return (1, v, prime)


# ------------------------------ المقاطع ------------------------------
_SIZE = re.compile(r'(\d{2,4})\s*[xX×*]\s*(\d{2,4})')
_DIA = re.compile(r'(?:[⌀øØΦφ]|%%c|dia\.?\s*|d\s*=\s*)(\d{2,4})', re.I)


def parse_size(text):
    """مقطع من نص: «350X800» → (350, 800) مم؛ «col 60x60» بالسنتيمتر → (600, 600)؛
    «Col dia 60» → دائري (600,). يرجع dict(b,h,D?,shape) أو None."""
    s = clean_text(text)
    m = _SIZE.search(s)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if a <= 150 and b <= 150:                    # بالسنتيمتر (30x60 · 60x60)
            a, b = a * 10, b * 10
        if 100 <= a <= 3000 and 100 <= b <= 3000:
            return dict(b=a, h=b, shape='rect')
    m = _DIA.search(s)
    if m and not re.search(r'@|%%c\d+\s*@', s, re.I):
        d = int(m.group(1))
        if d <= 150:
            d *= 10
        if 200 <= d <= 3000:
            return dict(b=d, h=d, D=d, shape='circ')
    return None


# ------------------------------ التسليح ------------------------------
_BARS = re.compile(r'(?:main\s*bars?\s*)?(\d{1,3})\s*(?:%%c|[⌀øØΦφ]|T|Y|D|#)\s*(\d{1,2})\b', re.I)
_TIES = re.compile(r'(?:ties?|stirrups?|links?|أتاري|كانات)?\s*(?:%%c|[⌀øØΦφ]|T|Y|D)\s*(\d{1,2})\s*[@/]\s*(\d{2,4})'
                   r'(?:\s*\(\s*(\d{1,2})\s*/\s*set\s*\))?', re.I)
NOT_PRESENT = re.compile(r'^\s*(not\s+present|n\.?\s*p\.?|-{2,}|—+|غير\s+موجود)\s*$', re.I)


def parse_bars(text):
    """«3%%C25» / «Main Bars 12%%C32» / «4T16» → dict(n, d)."""
    s = clean_text(text)
    m = _BARS.search(s)
    if not m:
        return None
    n, d = int(m.group(1)), int(m.group(2))
    if not (1 <= n <= 80 and 6 <= d <= 40):
        return None
    return dict(n=n, d=d)


def parse_ties(text):
    """«%%C10@150» / «Ties %%C10/250 (3/Set)» → dict(d, s, sets)."""
    s = clean_text(text)
    m = _TIES.search(s)
    if not m:
        return None
    d, sp = int(m.group(1)), int(m.group(2))
    if not (6 <= d <= 20 and 50 <= sp <= 400):
        return None
    return dict(d=d, s=sp, sets=int(m.group(3)) if m.group(3) else None)


def parse_callout(text):
    """نداء تسليح كامل بصيغ الأوتوكاد (يعيد استعمال قارئ plan.py)."""
    return parse_rebar_callout(clean_text(text))


def is_not_present(text):
    return bool(NOT_PRESENT.match(clean_text(text)))


# ------------------------------ المواد ------------------------------
_FC = [re.compile(r"f'?c\s*'?\s*[=:]\s*(\d{2,3})\s*(mpa|n/mm)", re.I),
       re.compile(r"f'?c\s*'?\s*[=:]\s*(\d{2,3})\b", re.I),
       re.compile(r'\bC(\d{2})(?:/\d{2})?\b'),
       re.compile(r'\bB(\d{2})\b')]
_FY = [re.compile(r'f\s*y\s*[=:]\s*(\d{3})', re.I), re.compile(r'grade\s*(40|60|75)', re.I)]
_COVER = re.compile(r'(clear\s+)?cover\s*[=:]?\s*(\d{2,3})\s*mm', re.I)


def parse_materials(text):
    s = clean_text(text)
    out = {}
    for i, rx in enumerate(_FC):
        m = rx.search(s)
        if m:
            v = int(m.group(1))
            if i == 3:
                v = round(v * 0.8)                 # صنف B (مكعب) → أسطواني تقريباً
            if 15 <= v <= 80:
                out['fc'] = v
                break
    for rx in _FY:
        m = rx.search(s)
        if m:
            v = int(m.group(1))
            out['fy'] = {40: 280, 60: 420, 75: 520}.get(v, v)
            break
    m = _COVER.search(s)
    if m:
        out['cover'] = int(m.group(2))
    return out


# ------------------------------ تعريفات المهندس داخل الملف ------------------------------
_DEF = re.compile(r'^\s*(?P<mark>[A-Z]{1,3}\d{1,3}[A-Z]?[\'`′]?)\s*(?:[=:]|\(|-|\s)\s*(?P<rest>.+)$', re.I)


def parse_definition(text):
    """«C1 = 400x600» · «B1 (350X800)» · «C2 : 40x40 8Ø16» → تعريف عنصر.
    يرجع dict(mark, kind, size?, bars?, ties?) أو None."""
    s = clean_text(text)
    m = _DEF.match(s)
    if not m:
        return None
    k, mark = mark_kind(m.group('mark'))
    if not k:
        return None
    rest = m.group('rest')
    size, bars, ties = parse_size(rest), parse_bars(rest), parse_ties(rest)
    if not (size or bars or ties):
        return None
    out = dict(mark=mark, kind=k)
    if size:
        out['size'] = size
    if bars:
        out['bars'] = bars
    if ties:
        out['ties'] = ties
    return out


# ------------------------------ الطبقات ------------------------------
LAYER_HINTS = [
    ('axis', 'محاور', r'(axis|axes|grid|center|centre|c-?l\b|محور|محاور)'),
    ('col', 'أعمدة', r'(^|[^a-z])(col|colom|column|s-col|عمود|اعمدة|أعمدة|اعمده)'),
    ('beam', 'جسور', r'(beam|^b-|joist|جسر|جسور|كمرة|كمرات|ابيام|بيم|جوائز|جائز)'),
    ('slab', 'بلاطات', r'(slab|roof|سقف|بلاطة|هوردي|هردي|هــردي|hordi|hourdi)'),
    ('found', 'أساسات', r'(found|fdn|footing|foot|raft|pile|أساس|اساس|قواعد|ميدة|ميدات)'),
    ('rebar', 'تسليح', r'(reinf|rebar|steel|rft|bar|تسليح|حديد)'),
    ('hidden', 'خط مخفي', r'(hidden|dash)'),
    ('dim', 'أبعاد', r'(^dim$|dimension|^dims?$)'),
    ('text', 'نصوص', r'(text|txt|anno|نص)'),
    ('frame', 'إطار ورقة', r'(frame|border|burder|sheet|title|إطار)'),
    # طبقات معمارية وموقع (تُعرف فلا تُعدّ «مجهولة»)
    ('wall', 'جدران', r'(wall|حوائط|حائط|جدار|جدران|بلوك|brick|block|concreat|concrete|خرسان)'),
    ('door', 'أبواب', r'(door|ابواب|أبواب|باب|d&w)'),
    ('window', 'شبابيك', r'(win|glaz|glass|شبابيك|شباك|نوافذ|زجاج|curtain)'),
    ('stair', 'سلالم', r'(stair|سلالم|سلم|درج|handrail|rail)'),
    ('furn', 'أثاث وتجهيزات', r'(furn|fur\.|^fur$|bed|sanit|san$|wc|lav|fixture|equip|أثاث|مغاسل|panel)'),
    ('land', 'موقع وتشجير', r'(tree|arbre|plant|shrub|landscape|green|garden|road|curb|soil|site|موقع|أشجار|تشجير|شعار)'),
    ('hatch', 'تهشير', r'(hatch|hath|hatsh|تهشير|هاتش)'),
    ('finish', 'تشطيبات', r'(finish|marble|tile|رخام|سيراميك|بلاط|gyps|جبس|wood|metal|خشب|الديكور|decor)'),
    ('elev', 'واجهات ومقاطع', r'(elev|^ele|section|cut|visib|اسقاطات|واجهة|مقطع)'),
]
_LAYER_RX = [(k, re.compile(p, re.I)) for k, _, p in LAYER_HINTS]


@functools.lru_cache(maxsize=8192)
def layer_hint(name):
    for k, rx in _LAYER_RX:
        if rx.search(name or ''):
            return k
    return None


# ------------------------------ الرموز ------------------------------
SYMBOLS = [
    dict(key='axis_bubble', name='فقاعة محور',
         how='دائرة قطرها 0.6–4 م (بمقياس الرسم) وبداخلها حرف أو رقم (A · 17)، ومعها خط محور طويل '
             'بخط CENTER يمرّ بمركزها.',
         means='خط وهمي يمر بمراكز الأعمدة؛ الحروف اتجاه والأرقام الاتجاه العمودي عليه.'),
    dict(key='axis_prime', name='محور ثانوي (Prime)',
         how="حرف أو رقم بشرطة: H` · H' · 19`",
         means='عنصر قريب جداً من المحور الرئيسي (جسر ثانوي، حافة بلاطة، تغيّر سماكة) لا يستحق '
               'محوراً مستقلاً — يُسمّى باسم المحور القريب مع الشرطة.'),
    dict(key='axis_dim', name='المسافة بين المحاور',
         how='أرقام الأبعاد بين الفقاعات: 3300 · 6600 · 1780',
         means='بالمليمتر: 3300 = 3.3 م بين المحورين.'),
    dict(key='opening_x', name='فتحة سقف (X)',
         how='خطّان متقاطعان على شكل X رؤوسهما زوايا مستطيل',
         means='منطقة مفتوحة بلا صبة: منور/فناء (Atrium)، أو فتحة درج/مصعد.'),
    dict(key='beam_2l', name='جسر بخطّين',
         how='خطّان متوازيان بفاصل 20–80 سم على امتداد محور، مع علامة B1/B2 قربهما',
         means='الفاصل = عرض الجسر، والعلامة تحيل لجدول الجسور (المقاس والحديد).'),
    dict(key='beam_hidden', name='جسر بخط مخفي',
         how='خطوط متقطعة (HIDDEN/DASHED) موازية للمحور',
         means='جسر تحت البلاطة لا يُرى من الأعلى.'),
    dict(key='col_block', name='عمود (بلوك/مضلع/هاتش)',
         how='مستطيل أو دائرة 15–160 سم مصمت أو بلوك اسمه مثل «col 60x60» عند تقاطع محورين',
         means='عمود بمقطعه الفعلي؛ اسم البلوك أو علامته (C1) تعطي المقاس.'),
    dict(key='col_2l', name='عمود بخطّين',
         how='خطّان متوازيان قصيران (15–160 سم) عند تقاطع محورين',
         means='عمود مرسوم مبسّطاً — الطول والفاصل يعطيان المقطع.'),
    dict(key='slab_callout', name='نداء تسليح بلاطة',
         how='%%C16@200 T · %%C12@200 B&T',
         means='قطر 16 كل 200 مم علوي (T) / سفلي وعلوي (B&T) — %%C هو رمز Ø بالأوتوكاد.'),
    dict(key='col_bars', name='حديد عمود',
         how='Main Bars 12%%C32 · Ties %%C10/250 (3/Set)',
         means='12 قضيباً قطر 32 · أتاري قطر 10 كل 250 مم، 3 أتاري بالمجموعة.'),
    dict(key='not_present', name='غير موجود',
         how='NOT PRESENT · N.P. · ----',
         means='العنصر غير موجود بهذا الطابق (العمود ينتهي تحته).'),
    dict(key='thickness', name='سماكة البلاطة',
         how='Slab Thickness=200 mm بعنوان اللوحة',
         means='سماكة بلاطة ذلك السقف بالمليمتر.'),
    dict(key='roof_of', name='سقف طابق',
         how='«… for Roof of Second Floor»',
         means='بلاطة وجسور السقف المحمول فوق أعمدة الطابق الثاني.'),
    dict(key='stair', name='درج', how='خطوط متوازية متساوية التباعد وكلمة UP',
         means='قلبة درج؛ فتحتها بالسقف مقطوعة.'),
    dict(key='lift', name='مصعد', how='مستطيل بقطرين أو كلمة LIFT/ELEV',
         means='بئر مصعد = جدران قص وفتحة بالسقف.'),
]


def dictionary():
    """القاعدة كاملة بصيغة تُعرض بالواجهة."""
    return dict(
        sheets=[dict(key=k, name=n, pattern=p) for k, n, p in SHEET_KINDS],
        floors=[dict(key=k, order=o, name=n, en=en, ar=ar) for k, o, n, en, ar in FLOORS],
        marks=[dict(key=k, name=n, pattern=p) for k, n, p in MARKS],
        layers=[dict(key=k, name=n, pattern=p) for k, n, p in LAYER_HINTS],
        symbols=SYMBOLS,
        precedence='تعريف المستخدم بالواجهة ← تعريف المهندس داخل الملف ← هذه القاعدة',
        slab_types=[dict(key=k, name=n, pattern=p, t=t, desc=d) for k, n, p, t, d in SLAB_TYPES],
        beam_types=[dict(key=k, name=n, pattern=p) for k, n, p in BEAM_TYPES],
        text_fixes=[dict(key='keyboard', name='عربي بمواضع المفاتيح', how="«Hglsr' HBtrD» ← «المسقط الافقي»"),
                    dict(key='reversed', name='حروف مقلوبة', how='«ةيضرلأا» ← «الأرضية»'),
                    dict(key='word-order', name='ترتيب كلمات مقلوب', how='«المفصلي المقعد النزول حالة في» ← «في حالة النزول المقعد المفصلي»'),
                    dict(key='codes', name='رموز %%nnn', how='«%%176» ← «°» (صفحة 1256)'),
                    dict(key='undecodable', name='خط SHX خاص', how='يُبلَّغ عنه بقسم «ما لم أتعرّف عليه»')],
    )



# ------------------------------ أنظمة البلاطات ------------------------------
# (المفتاح، الاسم، النمط، السماكة الافتراضية مم، الوصف الهندسي)
SLAB_TYPES = [
    ('bubble', 'بلاطة ببل ديك (كرات مفرغة)', r'(bubble\s*deck|bubble|ببل\s*ديك|\bببل\b|كرات\s*بلاستيك|cobiax|u-?boot)', 280,
     'كرات بلاستيك مفرغة بين شبكتين — بلا جسور غالباً؛ وزن أقل ~35%، والقص قرب الأعمدة يُحسب بمنطقة مصمتة.'),
    ('waffle', 'وافل (أعصاب باتجاهين)', r'(waffle|وافل|اعصاب\s*باتجاهين|أعصاب\s*باتجاهين|two[- ]way\s*(rib|joist))', 350,
     'أعصاب متعامدة بقوالب؛ رؤوس مصمتة حول الأعمدة.'),
    ('hordi', 'هوردي (بلوك مفرغ + أعصاب)', r'(hordi|hourdi|hurdi|هوردي|هردي|هــردي|بلوك\s*مفرغ|hollow\s*block)', 300,
     'بلوك مفرغ 40×20×(20–25) سم بين أعصاب 10–15 سم، وبلاطة علوية 5–7 سم؛ الأعصاب باتجاه البحر القصير (أو باتجاهين).'),
    ('ribbed', 'بلاطة معصبة (أعصاب باتجاه واحد)', r'(ribbed|joist|معصب|اعصاب|أعصاب|عصب)', 300,
     'أعصاب متوازية بتباعد 50–70 سم وبلاطة علوية رقيقة.'),
    ('flat', 'بلاطة مسطحة (فلات سلاب) بلا جسور', r'(flat\s*slab|فلات|بلاطة\s*مسطحة|لا\s*كمرية|بدون\s*جسور|بلا\s*جسور)', 250,
     'تحمل مباشرة على الأعمدة؛ القص الثاقب حول العمود هو الحاكم (ACI 318-19 §22.6)، وقد يُضاف تسقيط Drop Panel.'),
    ('hollowcore', 'بلاطات مسبقة الصب (هولوكور)', r'(hollow\s*core|precast|مسبق(ة)?\s*الصب)', 200,
     'ألواح مسبقة الصب مفرغة، ترتكز على جسور/جدران وتُربط بطبقة علوية.'),
    ('solid', 'بلاطة مصمتة على جسور', r'(solid\s*slab|مصمت|مصمتة)', 200, 'بلاطة خرسانية كاملة السماكة على جسور.'),
]
_SLAB_RX = [(k, n, re.compile(p, re.I), t, d) for k, n, p, t, d in SLAB_TYPES]
DROP_RX = re.compile(r'(drop\s*panel|تسقيط|ساقط(ة)?\s*حول|capital|تاج\s*العمود)', re.I)
BEAM_TYPES = [('hidden', 'جسر مخفي (بسماكة البلاطة)', r'(hidden\s*beam|concealed\s*beam|جسر\s*مخفي|جسور\s*مخفية|مدفون|مخفية)'),
              ('inverted', 'جسر مقلوب (فوق البلاطة)', r'(inverted\s*beam|upstand|مقلوب)'),
              ('cantilever', 'كابولي', r'(cantilever|كابولي|كابولية|ظفر)'),
              ('tie', 'ميدة / جسر ربط', r'(tie\s*beam|grade\s*beam|ميدة|ميدات|جسر\s*ربط)')]
_BEAM_RX = [(k, n, re.compile(p, re.I)) for k, n, p in BEAM_TYPES]


def slab_type(text):
    """نظام البلاطة من نص (عنوان/ملاحظة/اسم طبقة) — يرجع (المفتاح، الاسم، السماكة الافتراضية، الوصف) أو None."""
    s = clean_text(text or '')
    for k, n, rx, t, d in _SLAB_RX:
        if rx.search(s):
            return dict(key=k, name=n, t=t, desc=d)
    return None


def beam_types(text):
    s = clean_text(text or '')
    return [dict(key=k, name=n) for k, n, rx in _BEAM_RX if rx.search(s)]


# ------------------------------ إصلاح النص العربي ------------------------------
# ١) عربي مكتوب بخطوط SHX قديمة بمواضع لوحة المفاتيح: «Hglsr' HBtrD gg],v HBvqD» = «المسقط الافقي للدور الارضي».
_KB = {'q': 'ض', 'w': 'ص', 'e': 'ث', 'r': 'ق', 't': 'ف', 'y': 'غ', 'u': 'ع', 'i': 'ه', 'o': 'خ', 'p': 'ح',
       '[': 'ج', ']': 'د', 'a': 'ش', 's': 'س', 'd': 'ي', 'f': 'ب', 'g': 'ل', 'h': 'ا', 'j': 'ت', 'k': 'ن',
       'l': 'م', ';': 'ك', "'": 'ط', 'z': 'ئ', 'x': 'ء', 'c': 'ؤ', 'v': 'ر', 'b': 'لا', 'n': 'ى', 'm': 'ة',
       ',': 'و', '.': 'ز', '/': 'ظ', '`': 'ذ'}
_KB_SHIFT = {'<': ',', '>': '.', ':': ';', '"': "'", '{': '[', '}': ']', '?': '/', '~': '`'}
_KB_WORD = re.compile(r"[A-Za-z',;\[\]`<>:\"{}?~\\_]+")


def _kb_decode(s):
    out = []
    for ch in s:
        c = _KB_SHIFT.get(ch, ch)
        c = c.lower() if c.isalpha() and c.isascii() else c
        if c in ('\\', '_'):
            continue                                  # مدّة/تطويل بالخط القديم
        out.append(_KB.get(c, ch))
    return ''.join(out)


def _looks_kb_arabic(s):
    """نص لاتيني هو في الحقيقة عربي بمواضع المفاتيح: كلمات تبدأ بـ Hg/hg (= ال) أو فيها ,;'[] داخل الكلمة
    وقليلة الحروف الصوتية (الإنجليزية ≈ 38%)."""
    words = _KB_WORD.findall(s or '')
    if not words or re.search(r'[؀-ۿ]', s or ''):
        return False
    if any(w.lower().strip("',;:()") in _ENG for w in words):
        return False                                  # كلمة إنجليزية معروفة = نص إنجليزي
    letters = [c.lower() for w in words for c in w if c.isalpha()]
    if len(letters) < 3:
        return False
    al = sum(1 for w in words if re.match(r"^[Hh]g\S", w) or re.match(r"^[Hh]B", w))
    punct_in = sum(1 for w in words if re.search(r"\w[',;\[\]<>:]\w", w) or re.search(r"\w[',;\]]$", w))
    vow = sum(1 for c in letters if c in 'aeiou') / float(len(letters))
    upper_words = sum(1 for w in words if len(w) > 2 and w.isupper())
    if upper_words >= max(1, len(words) * 0.6):
        return False                                  # «SUMP PIT FOR WASTE WATER» إنجليزي
    return al >= 1 or (punct_in >= 1 and vow < 0.3) or (vow < 0.18 and len(letters) >= 6)


_PREP = {'في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'و', 'ثم', 'او', 'أو', 'لل', 'بين', 'حتى', 'عند', 'تحت', 'فوق'}
_START = {'مسقط', 'مقطع', 'تفصيلة', 'تفاصيل', 'واجهة', 'يتم', 'ينفذ', 'تنفذ', 'ملحوظة', 'ملاحظة', 'ملاحظات',
          'تسليح', 'جدول', 'أبعاد', 'ابعاد', 'حامل', 'مصباح', 'منظور', 'لقطة', 'مخطط', 'قطاع', 'قطاعات',
          'يجب', 'تهبط', 'انظر', 'أنظر', 'راجع', 'تفصيل', 'مساقط'}
_ENG = set('''a an and at by for from in of on or the to with mm cm m kg mpa bar bars top bottom bot mid end ends span
plan section detail typical level floor roof ground first second third fourth wall walls slab beam beams column columns
footing foundation stair stairs door window drawn checked approved date scale sheet no note notes see type size
reinforcement steel concrete cover lap spacing thick thickness main ties rft ref elevation upper lower left right'''.split())


def _norm_ar(w):
    return w.replace('ـ', '')


def _word_order_score(ws):
    if not ws:
        return 0
    sc = 0
    if ws[0] in _START:
        sc += 2
    if ws[-1] in _PREP:
        sc -= 3
    if ws[0] in _PREP and len(ws) > 2:
        sc += 1
    if ws[-1] in _START:
        sc -= 1
    return sc


_MOJIBAKE = re.compile('[£¥µ¸¹º»«‹›“”•–—¾¼¤¨Œœ†‡‰]')


_PCT = re.compile(r'%%(\d{3})')


def _pct_decode(s):
    """«%%195%%218» = رموز الأوتوكاد برقم المحرف (صفحة ويندوز العربية 1256)."""
    def one(m):
        n = int(m.group(1))
        try:
            return bytes([n]).decode('cp1256') if 32 <= n <= 255 else ''
        except Exception:
            return ''
    return _PCT.sub(one, s)


def fix_text(s):
    """يرجع (النص المُصلَح، الطريقة): keyboard = عربي بمواضع المفاتيح · reversed = حروف مقلوبة ·
    word-order = ترتيب كلمات مقلوب (قراءة مقترحة) · undecodable = خط SHX عربي خاص لا يُفكّ · None = سليم."""
    s0 = s or ''
    if not s0.strip():
        return s0, None
    pct = False
    if _PCT.search(s0):
        s0, pct = _pct_decode(s0), True
    if re.search(r'[\u0600-\u06FF]', s0) and re.search(r'\b[Hh]g[a-zA-Z\',;\[\]]*', s0):
        # خليط: بعض الكلمات عربية فعلاً وبعضها بمواضع المفاتيح («hg» + أعم…)
        s1 = re.sub(r"[A-Za-z',;\[\]`<>:{}?~_]+", lambda m: _kb_decode(m.group(0))
                    if _looks_kb_arabic(m.group(0)) or m.group(0).lower().startswith('hg') else m.group(0), s0)
        if s1 != s0:
            return s1, 'keyboard'
    if len(_MOJIBAKE.findall(s0)) >= 2 and re.search(r'[؀-ۿ]', s0) and re.search(r'[A-Za-z|\\\\]', s0):
        return s0, 'undecodable'
    if _looks_kb_arabic(s0):
        return _kb_decode(s0), 'keyboard'
    if re.search(r'[؀-ۿ]', s0):
        ws = s0.split()
        # حروف مقلوبة (ترتيب مرئي): كلمات تنتهي بـ«لا» (= «ال» معكوسة) أكثر من التي تبدأ بـ«ال»
        ends = sum(1 for w in ws if len(w) > 3 and w.endswith('لا'))
        starts = sum(1 for w in ws if len(w) > 3 and w.startswith('ال'))
        if ends >= 2 and ends > starts + 1:
            return s0[::-1], 'reversed'
        wn = [_norm_ar(w) for w in ws]
        # ترتيب كلمات مقلوب (سطر عربي كُتب بمحرر لا يدعم الاتجاه): السطر ينتهي بحرف جر/عطف،
        # أو آخر كلماته كلمة افتتاحية («تفاصيل», «مسقط») وأوله ليس كذلك
        if len(ws) >= 3 and (wn[-1] in _PREP or (wn[-1] in _START and wn[0] not in _START)):
            return ' '.join(ws[::-1]), 'word-order'
    return s0, ('codes' if pct else None)
