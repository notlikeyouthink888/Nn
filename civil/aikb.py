"""قاعدة معرفة المساعد الذكي — بحث محلي (BM25) بمراجع المنصة نفسها.

المصادر (كلها من داخل المشروع، لا شي من الإنترنت):
  · README.md            دليل المنصة وكيف تحسب كل شي
  · ACI318.md            خريطة تطبيق ACI 318-19: أي بند، بأي معادلة، وأين بالشيفرة
  · CAD_ARCHITECTURE.md  كيف يقرأ قسم الأوتوكاد اللوحات
  · ai_knowledge.md      مرجع المساعد: الأكواد المعتمدة ومصدر كل رقم وحدود المنصة
  · static/layers.js     القاموس الهندسي (رمز · عربي · إنكليزي · تعريف · بند)
  · static/app.js        صفحات المنصة وما تسويه كل صفحة
  · engine.py            جداول الكود العراقي للأحمال والقوى والقيم الزلزالية كما تستعملها المنصة

البحث يفهم العربي (يوحّد الهمزات والتاء المربوطة والياء، ويشيل التشكيل وأل التعريف)
والإنكليزي وأرقام البنود (25.4.2.4)، ويوسّع المرادفات الهندسية (شيش = حديد = rebar).
"""
import math
import os
import re
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
MD_SOURCES = [('README.md', 'دليل المنصة'), ('ACI318.md', 'تطبيق ACI 318-19 بالمنصة'),
              ('CAD_ARCHITECTURE.md', 'قسم الأوتوكاد'), ('ai_knowledge.md', 'مرجع المساعد')]

# ------------------------------------------------------------------ التطبيع
_DIAC = re.compile('[ً-ٰٟـ]')
_MAP = str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ؤ': 'و', 'ئ': 'ي',
                      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7',
                      '٨': '8', '٩': '9', '’': "'", '′': "'", '×': ' x '})
_TOK = re.compile(r"\d+(?:\.\d+)+|[a-zø][a-z0-9ø']*|[ء-ي]+|\d+")
_CLAUSE = re.compile(r'\b\d{1,2}\.\d{1,2}(?:\.\d{1,2}){0,3}\b')
_PRE = ('وبال', 'وال', 'بال', 'كال', 'فال', 'لل', 'ال')
_STOP = set('''من في على الى عن او و ثم هل ما ماذا شنو شلون ليش وين كيف اي هذا هذه هاي هذي ذلك تلك هو هي هم انا انت
احنا اني اكو ماكو كان يكون بعد قبل عند مع بين كل بس لو اذا لان حتى يعني جدا شي شيء the a an of to in on for and or is are
be by with what how why which this that it as at from'''.split())
_STOP = {_DIAC.sub('', w).translate(_MAP).lower() for w in _STOP}

# مرادفات هندسية (عراقي · فصيح · إنكليزي) — كل مجموعة تُطابق بعضها
_SYN = [
    'حديد تسليح شيش شياش اسياخ سيخ rebar reinforcement bars bar steel',
    'جسر جسور كمره كمرات جسره beam beams girder',
    'عمود اعمده column columns',
    'اساس اسس اساسات قاعده قواعد فوتنك footing footings foundation foundations',
    'بلاطه بلاطات سقف سقوف سلاب slab slabs',
    'اتاري كانات كانه اساور حلقات stirrup stirrups tie ties hoop hoops',
    'تماسك نشر تثبيت development ld',
    'وصله وصلات تراكب lap laps splice splices',
    'عكفه عكفات ثنيه ثني hook hooks ldh bend',
    'غطاء cover',
    'زلزال زلزالي زلازل seismic earthquake elf',
    'رياح هواء wind',
    'حمل احمال load loads loading',
    'حي live',
    'ميت dead',
    'قص shear',
    'ثقب punching',
    'عزم انحناء moment flexure bending',
    'هطول ترخيم deflection',
    'تربه تحمل soil bearing',
    'ركائز ركيزه خوازيق pile piles',
    'درج سلم دروج stair stairs staircase',
    'هوردي عصبي ribbed hordi joist',
    'كود مدونه code',
    'عراقي عراقيه iraqi iraq',
    'خرسانه كونكريت concrete',
    'تشقق شقوق crack cracking cracks',
    'خلوص تباعد spacing clear',
    'تطويق confinement',
    'نحافه slenderness buckling',
    'التواء torsion',
    'طابوق بلوك قواطع masonry partitions',
    'اوتوكاد dwg dxf cad autocad',
    'مفتاح key openrouter',
]
_GROUP = {}


def _stem(t):
    if t and 'ء' <= t[0] <= 'ي':
        for p in _PRE:
            if t.startswith(p) and len(t) - len(p) >= 3:
                t = t[len(p):]
                break
        if t.startswith('و') and len(t) >= 5:
            t = t[1:]
        if t.endswith('ات') and len(t) >= 6:
            t = t[:-2]
    return t


def norm(s):
    return _DIAC.sub('', str(s or '')).translate(_MAP).lower()


def tokens(s):
    out = []
    for t in _TOK.findall(norm(s)):
        if t in _STOP or len(t) < 2 and not t.isdigit():
            continue
        t = _stem(t)
        out.append(t)
        g = _GROUP.get(t)
        if g:
            out.append(g)
    return out


for _i, _line in enumerate(_SYN):
    for _w in _line.split():
        _GROUP[_stem(norm(_w))] = '#g%d' % _i

# ------------------------------------------------------------------ بناء المقاطع
def _md_chunks(src, label, text):
    out, path, buf = [], [], []

    def flush():
        body = '\n'.join(buf).strip()
        buf.clear()
        if len(body) < 40:
            return
        title = ' › '.join(path) if path else label
        parts, cur = [], ''
        for para in re.split(r'\n\s*\n', body):
            if len(cur) + len(para) > 1500 and cur:
                parts.append(cur)
                cur = ''
            cur = (cur + '\n\n' + para) if cur else para
        if cur:
            parts.append(cur)
        for k, p in enumerate(parts):
            out.append(dict(src=src, title=title + (' (%d)' % (k + 1) if len(parts) > 1 else ''), text=p))

    for line in text.splitlines():
        m = re.match(r'^(#{1,4})\s+(.*)', line)
        if m:
            flush()
            lvl = len(m.group(1))
            path[:] = path[:lvl - 1] + [m.group(2).strip()]
        else:
            buf.append(line)
    flush()
    return out


_JS_STR = re.compile(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"")


def _js_strings(line):
    return [(a if a else b).replace("\\'", "'").replace('\\"', '"') for a, b in _JS_STR.findall(line)]


def _glossary():
    fn = os.path.join(HERE, 'static', 'layers.js')
    try:
        s = open(fn, encoding='utf-8').read()
    except OSError:
        return []
    i = s.find('GLOSSARY = [')
    j = s.find('];', i)
    out = []
    for line in s[i:j].splitlines():
        v = _js_strings(line)
        if len(v) >= 4:
            sym, ar, en, df = v[:4]
            ref = v[4] if len(v) > 4 else ''
            out.append(dict(src='القاموس الهندسي', title='%s — %s (%s)' % (sym, ar, en),
                            text='%s = %s (%s): %s %s' % (sym, ar, en, df, ('— ' + ref) if ref else '')))
    return out


def _pages():
    fn = os.path.join(HERE, 'static', 'app.js')
    try:
        s = open(fn, encoding='utf-8').read()
    except OSError:
        return []
    rows = []
    for m in re.finditer(r"PAGES\.(\w+)\s*=\s*\{", s):
        blk = s[m.end():m.end() + 1200]
        g = lambda k: ((re.search(k + r":\s*'((?:[^'\\]|\\.)*)'", blk) or [None, ''])[1] or '').replace("\\'", "'")
        if g('name'):
            rows.append('• صفحة «%s» (#%s): %s — %s' % (g('name'), m.group(1), g('ttl'), g('sub') or g('desc')))
    if not rows:
        return []
    out, cur = [], []
    for r in rows:
        cur.append(r)
        if len('\n'.join(cur)) > 1300:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return [dict(src='صفحات المنصة', title='صفحات المنصة وما تسويه كل صفحة (%d)' % (k + 1), text='\n'.join(c))
            for k, c in enumerate(out)]


def _iraqi():
    try:
        import engine as E
    except Exception:
        return []
    out = [dict(src='الكود العراقي (engine.py)', title='الأحمال الحية — الكود العراقي للأحمال والقوى',
                text='الأحمال الحية حسب الاستعمال (kN/m²) كما تستعملها المنصة من الكود العراقي للأحمال والقوى: ' +
                     '، '.join('%s = %.1f' % (a, b) for a, b in E.LIVE) +
                     '. تختار من صفحة «الأحمال» أو من «معالج المشروع» حقل الاستعمال.'),
           dict(src='الكود العراقي (engine.py)', title='كثافات المواد — الكود العراقي للأحمال والقوى',
                text='كثافات المواد (kN/m³) المعتمدة بالمنصة: ' + '، '.join('%s = %.1f' % (a, b) for a, b in E.DENS) +
                     '. الحمل الميت للطابق = مجموع (السماكة × الكثافة) لكل طبقة + القواطع.'),
           dict(src='الكود العراقي (engine.py)', title='القيم الزلزالية للمحافظات Ss و S1',
                text='قيم Ss و S1 (بوحدة g) لكل محافظة كما بالمنصة — قيم استرشادية تُدقق مع خرائط الكود العراقي '
                     'للمقاومة الزلزالية: ' + '، '.join('%s: Ss=%.2f S1=%.2f' % (c, v[0], v[1]) for c, v in E.SEISMIC_CITIES.items()) +
                     '. الطريقة: القوة الجانبية المكافئة ASCE 7-16 (ELF) — SMS=Fa·Ss، SM1=Fv·S1، SDS=⅔SMS، SD1=⅔SM1، '
                     'Ta=Ct·hn^x، Cs=SDS/(R/Ie) بحدود Cs ≤ SD1/(T·R/Ie) و Cs ≥ max(0.044·SDS·Ie ، 0.01)، V=Cs·W، '
                     'والتوزيع على الطوابق Cvx = wx·hx^k / Σ(wi·hi^k).'),
           dict(src='الكود العراقي (engine.py)', title='أنظمة مقاومة الزلازل R و Cd و Ω0',
                text='الأنظمة الإنشائية المعتمدة بالمنصة: ' + '؛ '.join(
                    '%s: R=%.1f, Cd=%.1f, Ω0=%.1f, Ct=%.4f, x=%.2f' % (n, d['R'], d['Cd'], d['O'], d['Ct'], d['x'])
                    for n, d in E.SYSTEMS.items()) +
                     '. معاملا الموقع Fa و Fv بالاستيفاء من جداول ASCE 7-16 لأصناف التربة A–E عند Ss = ' +
                     ', '.join(map(str, E.SS_PTS)) + ' و S1 = ' + ', '.join(map(str, E.S1_PTS)) + '.'),
           dict(src='الكود العراقي (engine.py)', title='تراكيب الأحمال المستعملة بالمنصة',
                text='تراكيب الأحمال (ACI 318-19 §5.3.1): 1.4D ، 1.2D + 1.6L (الحاكمة عادةً للطوابق) ، 1.2D + 1.0L + 1.0E '
                     '(زلزالي) ، و D + L للتشغيل (الهبوط والهطول وضغط التربة الخدمي). الحمل الحي من جدول الكود العراقي '
                     'والميت من طبقات الأرضية والبلاطة والقواطع.')]
    return out


_LOCK = threading.Lock()
_IDX = dict(sig=None, docs=[], df={}, avg=1.0, tok=[])


def _signature():
    files = [os.path.join(HERE, f) for f, _ in MD_SOURCES] + [os.path.join(HERE, 'static', 'layers.js'),
                                                              os.path.join(HERE, 'static', 'app.js'),
                                                              os.path.join(HERE, 'engine.py')]
    return tuple((f, os.path.getmtime(f)) for f in files if os.path.exists(f))


def _build():
    docs = []
    for f, label in MD_SOURCES:
        try:
            docs += _md_chunks(f, label, open(os.path.join(HERE, f), encoding='utf-8').read())
        except OSError:
            pass
    docs += _glossary() + _pages() + _iraqi()
    toks = [tokens(d['title'] + ' ' + d['title'] + ' ' + d['text']) for d in docs]
    df = {}
    for ts in toks:
        for t in set(ts):
            df[t] = df.get(t, 0) + 1
    avg = sum(len(t) for t in toks) / max(1, len(toks))
    for k, d in enumerate(docs):
        d['id'] = k
        d['clauses'] = set(_CLAUSE.findall(d['text'] + ' ' + d['title']))
    return docs, df, avg, toks


def index():
    sig = _signature()
    with _LOCK:
        if _IDX['sig'] != sig:
            docs, df, avg, toks = _build()
            _IDX.update(sig=sig, docs=docs, df=df, avg=avg, tok=toks)
        return _IDX


def search(query, k=6, budget=7000, k1=1.4, b=0.6):
    """أفضل المقاطع للسؤال — [{src, title, text, score}] ضمن ميزانية حروف."""
    ix = index()
    docs, df, avg, toks = ix['docs'], ix['df'], ix['avg'], ix['tok']
    q = tokens(query)
    if not q or not docs:
        return []
    N = len(docs)
    qc = set(_CLAUSE.findall(norm(query)))
    qset = {}
    for t in q:
        qset[t] = qset.get(t, 0) + (0.5 if t.startswith('#g') else 1.0)
    scores = []
    for i, ts in enumerate(toks):
        if not ts:
            continue
        tf = {}
        for t in ts:
            if t in qset:
                tf[t] = tf.get(t, 0) + 1
        if not tf and not (qc & docs[i]['clauses']):
            continue
        s = 0.0
        L = len(ts)
        for t, f in tf.items():
            idf = math.log(1 + (N - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
            s += qset[t] * idf * f * (k1 + 1) / (f + k1 * (1 - b + b * L / avg))
        if qc & docs[i]['clauses']:
            s += 6.0 * len(qc & docs[i]['clauses'])
        scores.append((s, i))
    scores.sort(reverse=True)
    out, used = [], 0
    for s, i in scores[:k * 3]:
        d = docs[i]
        txt = d['text'] if len(d['text']) <= 1600 else d['text'][:1600] + '…'
        if used + len(txt) > budget and out:
            continue
        out.append(dict(src=d['src'], title=d['title'], text=txt, score=round(s, 2)))
        used += len(txt)
        if len(out) >= k:
            break
    return out


def stats():
    ix = index()
    by = {}
    for d in ix['docs']:
        by[d['src']] = by.get(d['src'], 0) + 1
    return dict(chunks=len(ix['docs']), sources=by)
