# -*- coding: utf-8 -*-
"""
استيراد مخططات AutoCAD وتحليلها هندسياً.

مصدران للعناصر:
  • DWG — يُقرأ داخل المتصفح بـ LibreDWG/WebAssembly ويُرسل بالصيغة الموحّدة أدناه.
  • DXF — يُقرأ هنا ببايثون خالص (DXF النصي = أزواج «رمز، قيمة»).

الصيغة الموحّدة للعنصر (مفاتيح مختصرة لأن العدد بالآلاف):
  {'t': 'L|P|C|A|T', 'l': اسم الطبقة, 'p': [أرقام], 'closed': bool?, 's': نص?}
    L: خط            p = [x1, y1, x2, y2]
    P: خط متعدد      p = [x1, y1, x2, y2, ...]
    C: دائرة         p = [cx, cy, r]
    A: قوس           p = [cx, cy, r, a0, a1]   (بالدرجات)
    T: نص            p = [x, y, h]             s = النص

ثم يُستخرج: الأعمدة · المحاور · حدّ البناء · وأقرب شبكة منتظمة تطابق الأعمدة الحقيقية.
"""
import math, base64, re

# ------------------------- الوحدات (DXF $INSUNITS) -------------------------
UNITS = {0: ('غير محددة', 0.001), 1: ('إنش', 0.0254), 2: ('قدم', 0.3048),
         4: ('مليمتر', 0.001), 5: ('سنتيمتر', 0.01), 6: ('متر', 1.0),
         8: ('مايكرون', 1e-6), 9: ('مليمتر', 0.001), 10: ('يارد', 0.9144),
         14: ('ديسيمتر', 0.1)}

def units_scale(insunits, override=None):
    """معامل التحويل إلى المتر."""
    if override:
        return float(override)
    return UNITS.get(int(insunits or 0), UNITS[4])[1]

def unit_name(insunits):
    return UNITS.get(int(insunits or 0), UNITS[4])[0]

# ------------------------------ قارئ DXF ------------------------------
def _pairs(text):
    """أزواج (رمز، قيمة) من DXF نصي."""
    lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    i, n = 0, len(lines)
    while i + 1 < n:
        code = lines[i].strip()
        val = lines[i + 1]
        i += 2
        if not code:
            continue
        try:
            code = int(code)
        except ValueError:
            continue
        yield code, val.strip()

def read_dxf(text):
    """يقرأ DXF نصي ويرجع الصيغة الموحّدة. لا يعتمد على أي مكتبة خارجية."""
    ents, layers, header = [], {}, {}
    sec, cur, kind, insunits = None, None, None, 4
    hvar = None

    def flush():
        e = _finish(cur, kind)
        if e:
            ents.append(e)
            layers[e['l']] = layers.get(e['l'], 0) + 1

    for code, val in _pairs(text):
        if code == 0:
            if sec == 'ENTITIES' or sec == 'BLOCKS':
                flush()
            if val == 'SECTION':
                sec, cur, kind = '?', None, None
                continue
            if val == 'ENDSEC':
                sec, cur, kind = None, None, None
                continue
            if val == 'EOF':
                break
            if sec == 'ENTITIES':
                kind = val
                cur = {'layer': '0', 'x': [], 'y': [], 'b': []}
            continue
        if sec == '?' and code == 2:
            sec = val
            continue
        if sec == 'HEADER':
            if code == 9:
                hvar = val
            elif hvar == '$INSUNITS' and code == 70:
                try: insunits = int(float(val))
                except ValueError: pass
            elif hvar in ('$EXTMIN', '$EXTMAX') and code in (10, 20):
                header.setdefault(hvar, {})['xy'[code == 20]] = _f(val)
            continue
        if sec == 'ENTITIES' and cur is not None:
            _collect(cur, code, val)
    if sec == 'ENTITIES':
        flush()
    return dict(source='dxf', insunits=insunits, ents=ents,
                layers=[dict(name=k, n=v) for k, v in sorted(layers.items())],
                header=header)

def _f(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0

def _collect(cur, code, val):
    if code == 8: cur['layer'] = val
    elif code in (10, 11): cur['x'].append(_f(val))
    elif code in (20, 21): cur['y'].append(_f(val))
    elif code == 40: cur['r'] = _f(val)
    elif code == 50: cur['a0'] = _f(val)
    elif code == 51: cur['a1'] = _f(val)
    elif code == 70: cur['flag'] = int(_f(val))
    elif code in (1, 3): cur['text'] = cur.get('text', '') + val

def _finish(cur, kind):
    if not cur or not kind:
        return None
    lay, xs, ys = cur['layer'], cur['x'], cur['y']
    if kind == 'LINE' and len(xs) >= 2 and len(ys) >= 2:
        return dict(t='L', l=lay, p=[xs[0], ys[0], xs[1], ys[1]])
    if kind in ('LWPOLYLINE', 'POLYLINE') and len(xs) >= 2:
        n = min(len(xs), len(ys))
        p = []
        for i in range(n):
            p += [xs[i], ys[i]]
        return dict(t='P', l=lay, p=p, closed=bool(cur.get('flag', 0) & 1))
    if kind == 'CIRCLE' and xs and ys:
        return dict(t='C', l=lay, p=[xs[0], ys[0], cur.get('r', 0.0)])
    if kind == 'ARC' and xs and ys:
        return dict(t='A', l=lay, p=[xs[0], ys[0], cur.get('r', 0.0),
                                     cur.get('a0', 0.0), cur.get('a1', 360.0)])
    if kind in ('TEXT', 'MTEXT') and xs and ys:
        return dict(t='T', l=lay, p=[xs[0], ys[0], cur.get('r', 0.25)],
                    s=cur.get('text', ''))
    if kind == 'INSERT' and xs and ys:
        return dict(t='C', l=lay, p=[xs[0], ys[0], 0.0])
    return None

def read_dxf_b64(b64):
    raw = base64.b64decode(b64)
    for enc in ('utf-8', 'cp1256', 'latin-1'):
        try:
            return read_dxf(raw.decode(enc))
        except UnicodeDecodeError:
            continue
    return read_dxf(raw.decode('utf-8', 'replace'))

# --------------------------- أدوار الطبقات ---------------------------
ROLES = [('col', 'أعمدة'), ('wall', 'جدران'), ('axis', 'محاور'),
         ('frame', 'إطار ورقة'), ('other', 'عرض فقط'), ('off', 'تجاهل')]

_COL_PAT = re.compile(r'(^|[^a-z])(col|column|عمود|اعمدة|أعمدة)', re.I)
_WALL_PAT = re.compile(r'(wall|جدار|جدران|حائط|block|brick)', re.I)
_AXIS_PAT = re.compile(r'(axis|axes|grid|محور|محاور|شبكة)', re.I)
_NOISE_PAT = re.compile(r'(hatch|dim|text|txt|defpoints|title|جداول|numbers)', re.I)
# طبقات تشكيلية أو تشطيبية: أشكالها بمقاس عمود أحياناً لكنها ليست بنية —
# تُمنع من الترقية التلقائية إلى «أعمدة» مهما كانت هندستها
_NONSTRUCT_PAT = re.compile(
    r'(win|window|door|glass|furn|furniture|sanit|kitchen|stair.?rail|hand.?rail'
    r'|ston|stone|tile|ceram|marbl|finish|iksa|اكساء|إكساء|شباك|شبابيك|باب|أبواب'
    r'|اثاث|أثاث|صحي|مطبخ|بلاط|رخام|تشطيب|حجر)', re.I)
_FRAME_PAT = re.compile(r'(frame|border|sheet|s\.lines|إطار|برواز)', re.I)

def suggest_role(name):
    """دور مقترح لكل طبقة بالاسم — قابل للتغيير من الواجهة."""
    n = (name or '').strip()
    if _COL_PAT.search(n): return 'col'
    if _AXIS_PAT.search(n): return 'axis'
    if _FRAME_PAT.search(n): return 'frame'
    if _WALL_PAT.search(n): return 'wall'
    if _NOISE_PAT.search(n): return 'off'
    return 'other'

# ------------------------ أدوات هندسية مساعدة ------------------------
def _seg_points(e):
    """نقاط العنصر (للتجميع والحدود) بالصيغة الموحّدة."""
    t, p = e['t'], e['p']
    if t == 'L': return [(p[0], p[1]), (p[2], p[3])]
    if t == 'P': return [(p[i], p[i + 1]) for i in range(0, len(p) - 1, 2)]
    if t in ('C', 'A'):
        cx, cy, r = p[0], p[1], p[2]
        if r <= 0: return [(cx, cy)]
        return [(cx + r * math.cos(a), cy + r * math.sin(a))
                for a in (0.0, math.pi / 2, math.pi, 3 * math.pi / 2)]
    if t == 'T': return [(p[0], p[1])]
    return []

def _bbox(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)

def _cluster(vals, tol):
    """تعنقد قيم أحادية البعد: يرجع مراكز العناقيد وأعضاءها."""
    out = []
    for v in sorted(vals):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return out

# --------------------- شكل العنصر: مربع · دائرة · L · T · C ---------------------
def _verts(e):
    """رؤوس الخط المتعدد بلا تكرار الرأس الأخير ولا رؤوس متطابقة."""
    p = e['p']
    v = [(p[i], p[i + 1]) for i in range(0, len(p) - 1, 2)]
    out = []
    for q in v:
        if not out or math.hypot(q[0] - out[-1][0], q[1] - out[-1][1]) > 1e-7:
            out.append(q)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 1e-7:
        out.pop()
    return out

def shape_of(e, scale, cmin=0.15, cmax=1.6, ring_lo=1.0, ring_hi=5.0, ar_max=4.0):
    """يصنّف عنصراً واحداً إلى شكل إنشائي معروف، أو None إن لم يكن عموداً/نواة.

    المخططات ترسم الأعمدة بأشكال كثيرة لا مستطيلات فقط: دائري (O) · مستطيل ·
    زاوية (L) · تي (T) · وأنوية المصاعد بشكل حرف C (جدار مفتوح من جهة الباب).
    التمييز بعدد الرؤوس ونسبة المساحة الحقيقية إلى صندوقها المحيط:
    المستطيل يملأ صندوقه، وL نصفه تقريباً، وحلقة المصعد ثلثه.
    """
    t = e['t']
    if t == 'C':                                   # عمود دائري
        d = 2.0 * e['p'][2] * scale
        if cmin <= d <= cmax:
            return dict(shape='circ', b=d, h=d, D=d, area=math.pi * d * d / 4.0, n=1)
        return None
    if t != 'P':
        return None
    v = _verts(e)
    n = len(v)
    if n < 4 or n > 24:
        return None
    x0, y0, x1, y1 = _bbox(v)
    w = (x1 - x0) * scale; h = (y1 - y0) * scale
    if w <= 0 or h <= 0:
        return None
    ar = abs(_shoelace(v)) * scale * scale
    fill = ar / (w * h)
    # نواة مصعد/درج: حلقة مفتوحة بجدار رفيع — صندوق متر إلى خمسة وامتلاء ثلث إلى ثلثين
    if ring_lo <= w <= ring_hi and ring_lo <= h <= ring_hi and n >= 8 and 0.15 <= fill <= 0.75:
        t_wall = ar / max(_perimeter(v) * scale / 2.0, 1e-6)   # المساحة ÷ نصف المحيط
        if 0.10 <= t_wall <= 0.45:
            return dict(shape='C', b=w, h=h, area=ar, n=n, wall=round(t_wall, 3))
    if not (cmin <= w <= cmax and cmin <= h <= cmax):
        return None
    # ACI 318-19: عنصر ضغط طوله ≥ 4 × عرضه يُصمَّم **جداراً** لا عموداً —
    # وهذا يمنع قراءة قطع الجدران وأكتافه على أنها أعمدة.
    if max(w, h) / min(w, h) > ar_max:
        return None
    if n <= 5 and fill >= 0.85:
        return dict(shape='rect', b=w, h=h, area=ar, n=n)
    if n == 6 and 0.35 <= fill <= 0.85:
        return dict(shape='L', b=w, h=h, area=ar, n=n)
    if n in (8, 9) and 0.30 <= fill <= 0.85:
        return dict(shape='T', b=w, h=h, area=ar, n=n)
    if fill >= 0.85:
        return dict(shape='rect', b=w, h=h, area=ar, n=n)
    return None

def _perimeter(v):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1])
               for a, b in zip(v, v[1:] + v[:1]))

def promote_column_layers(ents, roles, scale, need=4, gap_min=2.0):
    """كثير من الملفات لا تسمّي طبقة للأعمدة أصلاً وترسمها على الطبقة «0».

    فبدل الاعتماد على اسم الطبقة وحده، تُرقّى الطبقة إلى دور «أعمدة» بدليلين معاً:
      ١) تحمل **٤ أشكال أعمدة فأكثر** (مستطيل · دائرة · L · T بمقاس عمود)، و
      ٢) **تباعد أقرب جار بينها بحرٌ حقيقي** (٢ م فأكثر).

    الشرط الثاني هو الفاصل: الشبابيك والإكساء والأثاث تُرسم بمقاسات تشبه مقطع
    العمود لكنها متلاصقة على خط الجدار — تباعدها الوسيط 0.3 م لا 3.5 م.
    الطبقات المستبعدة صراحةً (تجاهل · إطار ورقة · محاور) لا تُرقّى."""
    per = {}
    for e in ents:
        lay = e['l']
        if roles.get(lay) in ('off', 'frame', 'axis', 'col'):
            continue
        if _NONSTRUCT_PAT.search(lay or ''):          # شبابيك · أبواب · إكساء · أثاث
            continue
        s = shape_of(e, scale)
        if not s or s['shape'] == 'C':
            continue
        x0, y0, x1, y1 = _bbox(_seg_points(e))
        per.setdefault(lay, []).append(dict(x=(x0 + x1) / 2 * scale, y=(y0 + y1) / 2 * scale,
                                            b=s['b'] * 1000, h=s['h'] * 1000))
    out = {}
    for lay, v in per.items():
        v = _dedupe_cols(v)
        if len(v) < need:
            continue
        nn = []
        for i, a in enumerate(v):
            m = min((math.hypot(a['x'] - b['x'], a['y'] - b['y'])
                     for j, b in enumerate(v) if j != i), default=0.0)
            if m > 0:
                nn.append(m)
        if nn and sorted(nn)[len(nn) // 2] >= gap_min:
            out[lay] = len(v)
    return out

# -------------------- اتجاه المبنى: مخططات مرسومة مائلة --------------------
def plan_angle(ents, roles, tol=1.5):
    """زاوية محاور المبنى بالنسبة لمحاور الرسم.

    كثير من المخططات — خاصةً المُسنَدة لإحداثيات مساحية (UTM) — مرسومة مائلة،
    فالمبنى محاذٍ للشارع لا لمحوري الرسم. وكل الكشف هنا يعمل بصناديق محيطة
    محاذية للمحاور، فمقطع عمود 35×70 سم مائل 54° يُقرأ 77×69 سم، وتصير المحاور
    والبحور والشبكة بلا معنى.

    الزاوية = قمة مدرّج زوايا أضلاع طبقات البنية بـ mod 90° موزوناً بالطول.
    والمتوسط حول القمة **دائري** (89.5° و0.5° جاران لا طرفان)، وإلا انزلق
    الناتج إلى منتصف المدى بمخطط محاذٍ أصلاً.
    يرجع (الزاوية بالدرجات، حصة الطول التي تؤيدها)."""
    hist = {}
    for e in ents:
        if roles.get(e['l']) not in ('col', 'wall'):
            continue
        if e['t'] not in ('L', 'P'):
            continue
        p = e['p']
        for i in range(len(p) // 2 - 1):
            x0, y0, x1, y1 = p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]
            ln = math.hypot(x1 - x0, y1 - y0)
            if ln < 1e-9:
                continue
            a = round((math.degrees(math.atan2(y1 - y0, x1 - x0)) % 90.0) * 2) / 2.0
            hist[a] = hist.get(a, 0.0) + ln
    if not hist:
        return 0.0, 0.0
    total = sum(hist.values())
    peak = max(hist, key=hist.get)
    sx = sy = w = 0.0
    for a, ln in hist.items():
        if abs((a - peak + 45.0) % 90.0 - 45.0) <= tol:
            r = math.radians(4.0 * a)                  # ×4 لأن الدورة 90° لا 360°
            sx += ln * math.cos(r); sy += ln * math.sin(r); w += ln
    ang = (math.degrees(math.atan2(sy, sx)) / 4.0) % 90.0 if w else peak
    if abs((ang - peak + 45.0) % 90.0 - 45.0) > 2.0:
        ang = peak
    return ang, (w / total if total else 0.0)

def rotate_ents(ents, deg):
    """يدير كل العناصر بـ −deg حول أصل الرسم، فتصير محاور المبنى محاور الرسم."""
    c = math.cos(math.radians(-deg)); s = math.sin(math.radians(-deg))
    out = []
    for e in ents:
        f = dict(e); p = e['p']
        if e['t'] in ('C', 'T'):
            f['p'] = [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
        elif e['t'] == 'A':
            f['p'] = [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2],
                      p[3] - deg, p[4] - deg]
        else:
            q = []
            for i in range(0, len(p) - 1, 2):
                q += [p[i] * c - p[i + 1] * s, p[i] * s + p[i + 1] * c]
            f['p'] = q
        out.append(f)
    return out

# ---------------------------- كشف الأعمدة ----------------------------
def detect_columns(ents, roles, scale, cmin=0.15, cmax=1.5, col_layers=None):
    """كل أشكال الأعمدة: دائري (O) · مستطيل · مربع · زاوية (L) · تي (T)،
    سواء رُسم العمود شكلاً واحداً مغلقاً أو أربعة خطوط منفصلة.

    مرحلتان: أولاً الأشكال التي تُعرَف بذاتها (`shape_of`) فتؤخذ عموداً كاملاً
    بشكلها ومساحتها الحقيقية، وثانياً بقية هندسة طبقات الأعمدة تُعنقد بالتجاور.

    طبقات الأعمدة تحمل أحياناً خطوط إنشاء أو حدوداً بطول المبنى كله (طبقة
    STR-COLUMNS مثلاً)، وهذه تتلامس مع كل الأعمدة فتلحمها بعنقود واحد بحجم
    المبنى فيُرفض — فيخرج التحليل بصفر أعمدة. لذلك يُستبعد ما هو أكبر من مقطع
    عمود قبل التعنقد أصلاً، وتُضيَّق سماحية التجاور، ويُرفض أي دمج ينتج عنقوداً
    أكبر من مقطع عمود."""
    lays = set(col_layers or ())
    lays |= {k for k, v in roles.items() if v == 'col'}
    shaped, items = [], []
    for e in ents:
        if e['l'] not in lays:
            continue
        s = shape_of(e, scale, cmin, cmax)
        if s and s['shape'] != 'C':                    # شكل عمود يُعرف بذاته
            pts = _seg_points(e)
            x0, y0, x1, y1 = _bbox(pts)
            shaped.append(dict(x=(x0 + x1) / 2.0 * scale, y=(y0 + y1) / 2.0 * scale,
                               b=round(s['b'] * 1000, 0), h=round(s['h'] * 1000, 0),
                               shape=s['shape'], area=round(s['area'], 4),
                               D=round(s.get('D', 0) * 1000, 0) or None, n=1))
            continue
        pts = _seg_points(e)
        if not pts:
            continue
        x0, y0, x1, y1 = _bbox(pts)
        if (x1 - x0) * scale > cmax * 1.05 or (y1 - y0) * scale > cmax * 1.05:
            continue                                   # خط إنشاء/جدار طويل لا عمود
        items.append(dict(kind='poly', pts=pts, r=0.0))
    if not items:
        return _dedupe_cols(shaped)
    # تعنقد بالتجاور: صندوق محيط لكل عنصر ثم دمج المتقاطعة/المتلامسة.
    # أضلاع العمود الواحد متلامسة فعلاً، فسماحية 5 سم تكفي — وسماحية بمقطع
    # عمود كامل تلحم عمودين متجاورين ببعضهما.
    tol = 0.05 / scale                                  # بوحدات الرسم
    boxes = [list(_bbox(it['pts'])) + [i] for i, it in enumerate(items)]
    boxes.sort(key=lambda b: (b[0], b[1]))
    used = [False] * len(boxes)
    groups = []
    for i, b in enumerate(boxes):
        if used[i]:
            continue
        used[i] = True
        g = [b]
        cur = list(b[:4])
        changed = True
        while changed:
            changed = False
            for j in range(i + 1, len(boxes)):
                if used[j]:
                    continue
                c = boxes[j]
                if c[0] > cur[2] + tol:
                    break
                if (c[0] <= cur[2] + tol and c[2] >= cur[0] - tol and
                        c[1] <= cur[3] + tol and c[3] >= cur[1] - tol):
                    nx = [min(cur[0], c[0]), min(cur[1], c[1]),
                          max(cur[2], c[2]), max(cur[3], c[3])]
                    if ((nx[2] - nx[0]) * scale > cmax or
                            (nx[3] - nx[1]) * scale > cmax):
                        continue                        # الدمج يتجاوز مقطع عمود
                    used[j] = True; g.append(c); changed = True
                    cur = nx
        groups.append((cur, [x[4] for x in g]))
    cols = list(shaped)
    for (x0, y0, x1, y1), idx in groups:
        b = (x1 - x0) * scale
        h = (y1 - y0) * scale
        if not (cmin <= b <= cmax and cmin <= h <= cmax):
            continue
        if max(b, h) / min(b, h) > 4.0:            # جدار قص لا عمود (ACI)
            continue
        cols.append(dict(x=(x0 + x1) / 2.0 * scale, y=(y0 + y1) / 2.0 * scale,
                         b=round(b * 1000, 0), h=round(h * 1000, 0),
                         shape='rect', area=round(b * h, 4), D=None, n=len(idx)))
    return _dedupe_cols(cols)

def _dedupe_cols(cols, tol=0.25):
    """العمود الواحد يُرسم أحياناً مرتين (خط فوق خط) أو بحدّ وتظليل معاً —
    فتُدمج المراكز المتقاربة ويبقى أكبر مقطع."""
    cols.sort(key=lambda c: (-(c['b'] * c['h']), c['y'], c['x']))
    out = []
    for c in cols:
        if any(abs(c['x'] - o['x']) < tol and abs(c['y'] - o['y']) < tol for o in out):
            continue
        out.append(c)
    out.sort(key=lambda c: (c['y'], c['x']))
    return out

# --------------------- معايرة المقياس من مقطع العمود ---------------------
# مقاطع الأعمدة القياسية بالتنفيذ المتري (مم)
STD_COL = [200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000]

SCALES = [(0.001, 'مليمتر'), (0.01, 'سنتيمتر'), (0.1, 'ديسيمتر'), (1.0, 'متر'),
          (0.0254, 'إنش'), (0.3048, 'قدم')]

def scale_from_dims(ents):
    """المقياس من الأبعاد المكتوبة بالمخطط — أقوى دليل وأكثره عدداً.

    كل بُعد يحمل: القيمة المكتوبة (measurement) وطرفَي المسافة المقيسة.
      ١) إن اختلفت القيمة المكتوبة عن المسافة الهندسية فنسبتهما (DIMLFAC)
         تعطي الوحدة يقيناً بلا تخمين.
      ٢) وإن تساوتا (الشائع) فالحكم بتوزيع القيم: الوحدة الصحيحة هي التي تجعل
         أغلب الأبعاد مضاعفات 5 سم وضمن مدى معماري معقول (0.3 – 20 م).
    """
    dims = [e for e in ents if e['t'] == 'D' and e.get('m', 0) > 0]
    if len(dims) < 5:
        return None
    ratios, vals = [], []
    for e in dims:
        p = e['p']
        geo = math.hypot(p[2] - p[0], p[3] - p[1])
        m = float(e['m'])
        vals.append(m)
        if geo > 1e-9:
            ratios.append(m / geo)
    # ١) معامل الطول بأنماط القياس
    lfac = 1.0
    if ratios:
        rs = sorted(ratios)
        lfac = rs[len(rs) // 2]
    # ٢) اختيار الوحدة بثلاثة أدلة مرتّبة:
    #    أولاً المدى الفيزيائي (بين سماكة جدار ~8 سم وأطول بحر ~15 م) — فهو يستبعد
    #    المقاييس المستحيلة. ثم **تدوير الأرقام**: المصمم يكتب 4.50 و3.20 لا 1.372،
    #    وهذا هو الدليل الحاسم بين وحدتين تفصل بينهما نسبة ثابتة (متر مقابل قدم).
    #    وأخيراً قرب الوسيط من المتر، وهو مرجّح ضعيف لأنه مضبوط على المساقط
    #    المعمارية (أبواب وسماكات) بينما وسيط المخطط الإنشائي بحر ≈ 4.5 م.
    LO, HI, MID = 80.0, 15000.0, 1200.0                    # مم
    best = None
    for sc, nm in SCALES:
        mm = [v * lfac * sc * 1000.0 for v in vals]
        good = [x for x in mm if LO <= x <= HI]
        if len(good) < max(5, 0.30 * len(mm)):
            continue
        rnd = sum(1 for x in good if abs(x - round(x / 10.0) * 10.0) <= 1.0)
        share_ok = len(good) / float(len(mm))
        share_rnd = rnd / float(len(good))
        med = sorted(good)[len(good) // 2]
        logd = abs(math.log(max(med, 1.0) / MID))          # قرب الوسيط من المتر (لوغاريتمياً)
        score = (round(share_ok, 2), round(share_rnd, 2), -round(logd, 2))
        cand = dict(scale=sc * lfac, name=nm, n=len(dims), lfac=round(lfac, 4),
                    in_range=len(good), median=round(med, 0),
                    round_share=round(share_rnd, 2), ok_share=round(share_ok, 2))
        if best is None or score > best[0]:
            best = (score, cand)
    if not best:
        return None
    c = best[1]
    c['ok'] = c['round_share'] >= 0.5 and c['ok_share'] >= 0.5
    c['why'] = ('عُرف المقياس من %d بُعد مكتوب بالمخطط — %d%% منها أرقام مدوّرة '
                '(مضاعفات 5 سم) والوسيط %.2f م'
                % (c['n'], int(c['round_share'] * 100), c['median'] / 1000.0))
    return c

def suggest_scale(ents, roles, lo=200.0, hi=1000.0):
    """كثير من المخططات تُخزَّن بوحدات مخالفة لما تصرّح به $INSUNITS
    (ملفات كثيرة تقول «مليمتر» وهي مرسومة بالسنتيمتر).
    نجرّب المقاييس ونحكم بثلاثة أدلة: مقطع العمود ضمن 20–100 سم ·
    تشابه مقاطع الأعمدة (بمخطط حقيقي أغلبها متطابقة) · تباعد معقول بينها (2.5–9 م).
    الترجيح بعدد الأعمدة وحده مضلّل لأن المقياس الصغير يُفتّت العنصر الواحد لعدة قطع."""
    best = None
    for sc, nm in SCALES:
        cols = detect_columns(ents, roles, sc)
        if len(cols) < 2:
            continue
        sizes = sorted((c['b'] + c['h']) / 2.0 for c in cols)
        med = sizes[len(sizes) // 2]
        same = sum(1 for s in sizes if abs(s - med) <= 0.15 * med) / float(len(sizes))
        nn = []
        for i, a in enumerate(cols):
            m = min((math.hypot(a['x'] - b['x'], a['y'] - b['y'])
                     for j, b in enumerate(cols) if j != i), default=0.0)
            if m > 0: nn.append(m)
        gap = sorted(nn)[len(nn) // 2] if nn else 0.0
        size_ok = lo <= med <= hi
        gap_ok = 2.5 <= gap <= 9.0
        # مقاطع الأعمدة بالتنفيذ المتري أرقام مدوّرة (25 · 30 · 40 · 50 سم …) —
        # هذا هو الدليل الحاسم بين قراءتين تفصل بينهما 2.54 (سنتيمتر مقابل إنش).
        snap = min(abs(med - m) for m in STD_COL)
        snap_b = 2 if snap <= 10 else (1 if snap <= 30 else 0)
        score = (1 if size_ok else 0, 1 if gap_ok else 0, snap_b,
                 round(same, 2), -abs(med - 400.0))
        cand = dict(scale=sc, name=nm, n=len(cols), median=round(med, 0),
                    same=round(same, 2), gap=round(gap, 2), snap=round(snap, 0),
                    ok=bool(size_ok and gap_ok and snap_b))
        if best is None or score > best[0]:
            best = (score, cand)
    return best[1] if best else None

# ------------------ فصل المخططات المتجاورة بنفس الملف ------------------
_MTEXT_FMT = re.compile(r'\\[A-Za-z][^;\\]*;|\{|\}|\\[PL]|\\~')

def clean_text(s):
    """يزيل رموز تنسيق MTEXT ({\\fArial|b0;...}) ويترك النص المقروء."""
    return _MTEXT_FMT.sub('', str(s or '')).strip()

_TITLE_PAT = re.compile(r'(مسقط|مخطط|طابق|أرضي|ارضي|أول|اول|ثاني|سطح|أساس|اساس|تسليح|'
                        r'plan|floor|ground|first|second|roof|found|layout|section|elev)', re.I)

def split_regions(ents, roles, scale, cell=2.5):
    """ملف DWG واحد يحوي عادةً عدة مخططات جنب بعض (طوابق ومقاطع وواجهات).

    التعنقد يكون على **طبقات البنية فقط** (جدران وأعمدة) — لأن طبقات الأبعاد والنصوص
    والتظليل وإطارات الورقة تمتد على الورقة كلها فتلحم المخططات ببعضها وتجعلها منطقة
    واحدة، وهذا بالضبط سبب ضياع بقية المخططات سابقاً.

    وحجم الخلية يتكيّف مع نوع المخطط: المسقط المعماري جدرانه متصلة فتكفيه خلية 2.5 م،
    أما المخطط الإنشائي فأعمدة متباعدة بحراً كاملاً بلا جدران تصلها — فلو بقيت الخلية
    صغيرة لتفتّت المبنى الواحد إلى شرائح.
    """
    idx = [i for i, e in enumerate(ents) if roles.get(e['l']) in ('wall', 'col')]
    if not idx:
        idx = [i for i, e in enumerate(ents)
               if roles.get(e['l']) not in ('off', 'frame', 'axis')]
    if not idx:
        return []
    nw = sum(len(_seg_points(e)) for e in ents if roles.get(e['l']) == 'wall')
    nc = sum(len(_seg_points(e)) for e in ents if roles.get(e['l']) == 'col')
    if nw < 0.2 * (nw + nc):                              # مخطط إنشائي: أعمدة بلا جدران
        cell = max(cell, 5.0)
    step = cell / scale                                   # حجم الخلية بوحدات الرسم
    occ = {}
    for i in idx:
        for x, y in _seg_points(ents[i]):
            occ.setdefault((int(math.floor(x / step)), int(math.floor(y / step))), []).append(i)
    seen, groups = set(), []
    for k in list(occ):
        if k in seen:
            continue
        stack, cells = [k], []
        seen.add(k)
        while stack:
            c = stack.pop(); cells.append(c)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (c[0] + dx, c[1] + dy)
                    if n in occ and n not in seen:
                        seen.add(n); stack.append(n)
        members = set()
        for c in cells:
            members.update(occ[c])
        groups.append(sorted(members))
    groups.sort(key=lambda g: -len(g))
    return groups

def region_info(ents, group, scale, texts=None):
    """وصف منطقة: أبعادها وطبقاتها واسمها المقترح من أقرب نص عنوان."""
    pts = []
    lay = {}
    for i in group:
        pts += _seg_points(ents[i])
        lay[ents[i]['l']] = lay.get(ents[i]['l'], 0) + 1
    if not pts:
        return None
    x0, y0, x1, y1 = _bbox(pts)
    bb = [x0 * scale, y0 * scale, x1 * scale, y1 * scale]
    name = ''
    if texts:
        best, bd = None, 1e18
        cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
        for t in texts:
            tx, ty = t['p'][0] * scale, t['p'][1] * scale
            if not (bb[0] - 12 <= tx <= bb[2] + 12 and bb[1] - 12 <= ty <= bb[3] + 12):
                continue
            d = math.hypot(tx - cx, ty - cy)
            if d < bd:
                bd, best = d, t
        if best:
            name = clean_text(best.get('s'))[:40]
    return dict(n=len(group), bbox=[round(v, 2) for v in bb],
                w=round(bb[2] - bb[0], 2), h=round(bb[3] - bb[1], 2),
                name=name, layers=sorted(lay.items(), key=lambda a: -a[1])[:5])

def detect_frames(ents, roles, scale, regions):
    """إطارات الورقة والمربعات الكبيرة: ما كان أوسع من أكبر منطقة بمرّتين، أو يشمل
    صندوقه أكثر من منطقة → ليس عنصراً من المبنى بل إطار/برواز، فيُستبعد."""
    if not regions:
        return set()
    areas = [r['w'] * r['h'] for r in regions if r]
    big = max(areas) if areas else 0.0
    boxes = [r['bbox'] for r in regions if r]
    out = set()
    for i, e in enumerate(ents):
        if roles.get(e['l']) in ('off',):
            continue
        pts = _seg_points(e)
        if len(pts) < 2:
            continue
        x0, y0, x1, y1 = _bbox(pts)
        w = (x1 - x0) * scale; h = (y1 - y0) * scale
        if w * h > 2.0 * big and w > 3 and h > 3:
            out.add(i); continue
        covered = sum(1 for b in boxes
                      if x0 * scale <= b[0] + 1 and x1 * scale >= b[2] - 1
                      and y0 * scale <= b[1] + 1 and y1 * scale >= b[3] - 1)
        if covered >= 2:
            out.add(i)
    return out

# ---------------------------- كشف المحاور ----------------------------
def detect_axes(ents, roles, scale, minlen=3.0, within=None):
    """محاور الشبكة: من الخطوط الطويلة على طبقة المحاور، ومن بالونات المحاور
    (الدوائر) التي تقع بأطراف المحاور فتعطي إحداثياتها."""
    vx, vy = [], []
    inside = (lambda x, y: True) if not within else (
        lambda x, y: within[0] - 2 <= x <= within[2] + 2 and within[1] - 2 <= y <= within[3] + 2)
    for e in ents:
        if roles.get(e['l']) != 'axis':
            continue
        if e['t'] in ('L', 'P'):
            pts = _seg_points(e)
            for a, b in zip(pts, pts[1:]):
                dx = (b[0] - a[0]) * scale; dy = (b[1] - a[1]) * scale
                ln = math.hypot(dx, dy)
                if ln < minlen:
                    continue
                mx = (a[0] + b[0]) / 2.0 * scale; my = (a[1] + b[1]) / 2.0 * scale
                if not inside(mx, my):
                    continue
                if abs(dx) < ln * 0.08: vx.append(mx)
                elif abs(dy) < ln * 0.08: vy.append(my)
        elif e['t'] == 'C':                         # بالون محور
            x = e['p'][0] * scale; y = e['p'][1] * scale
            if inside(x, y):
                vx.append(x); vy.append(y)
    ax = [sum(c) / len(c) for c in _cluster(vx, 0.6)]
    ay = [sum(c) / len(c) for c in _cluster(vy, 0.6)]
    return dict(x=[round(v, 3) for v in ax], y=[round(v, 3) for v in ay])

# --------------------------- حدّ البناء ---------------------------
def _hull(pts):
    """غلاف محدّب (Andrew monotone chain) — يرجع المضلّع بترتيب عكس عقارب الساعة."""
    p = sorted(set((round(x, 6), round(y, 6)) for x, y in pts))
    if len(p) < 3:
        return p
    def half(seq):
        out = []
        for q in seq:
            while len(out) >= 2 and ((out[-1][0] - out[-2][0]) * (q[1] - out[-2][1]) -
                                     (out[-1][1] - out[-2][1]) * (q[0] - out[-2][0])) <= 0:
                out.pop()
            out.append(q)
        return out
    return half(p)[:-1] + half(reversed(p))[:-1]

def _offset_poly(poly, d):
    """يوسّع مضلّعاً محدّباً للخارج مسافة d بإزاحة كل رأس بعيداً عن مركزه."""
    if not poly or d <= 0:
        return poly
    cx = sum(q[0] for q in poly) / len(poly); cy = sum(q[1] for q in poly) / len(poly)
    out = []
    for x, y in poly:
        L = math.hypot(x - cx, y - cy) or 1.0
        out.append((x + (x - cx) / L * d, y + (y - cy) / L * d))
    return out

def boundary_from_columns(cols, spans, cover=0.5):
    """حدّ البناء من الأعمدة نفسها: الغلاف المحدّب لمراكزها موسَّعاً نصف بحر طرفي.

    الصندوق المحيط بكل ما رُسم يشمل الأرصفة والشوارع وأسهم الشمال فيعطي مساحة
    أكبر من المبنى بكثير. أما مركز أبعد عمود + نصف البحر الطرفي فهو حدّ البناء
    الذي يحمله الهيكل فعلاً."""
    if len(cols) < 3:
        return None
    pts = [(c['x'], c['y']) for c in cols]
    hull = _hull(pts)
    if len(hull) < 3:
        return None
    sp = [s for s in (spans or []) if s and s > 0]
    d = (sorted(sp)[len(sp) // 2] if sp else 4.0) * cover
    poly = _offset_poly(hull, max(0.5, min(d, 6.0)))
    a = abs(_shoelace(poly))
    if a <= 4.0:
        return None
    return dict(kind='columns', poly=[[round(x, 3), round(y, 3)] for x, y in poly],
                area=round(a, 2), bbox=_rbox(poly))

def plot_from_dims(ents, scale, win=None, lo=15.0):
    """مساحة **القطعة** من أطول بُعدين مكتوبين متعامدين بالمخطط (مثل 45.30 × 92.45).

    هذه مساحة الأرض لا مساحة البناء — تُعرض على حدة، وتُستعمل سقفاً لمساحة البناء
    (فالمبنى لا يتجاوز قطعته) وحدّاً احتياطياً إن تعذّر استخراج حدّ المبنى.
    الأبعاد الأكبر من امتداد المخطط نفسه تُهمل: هذه أبعاد برواز الورقة والجداول."""
    # سقف واحد لا سقف لكل محور: القطعة قد تكون مائلة أو أطول من عرض المخطط
    hix = hiy = 400.0
    if win:
        hix = hiy = max(win[2] - win[0], win[3] - win[1]) * 1.25
    xs, ys = [], []
    for e in ents:
        if e['t'] != 'D' or not e.get('m'):
            continue
        p = e['p']
        v = float(e['m']) * scale
        if v < lo:
            continue
        if abs(p[2] - p[0]) >= abs(p[3] - p[1]):
            if v <= hix: xs.append(v)
        elif v <= hiy:
            ys.append(v)
    if not xs or not ys:
        return None
    L, B = max(xs), max(ys)
    return dict(L=round(L, 2), B=round(B, 2), area=round(L * B, 1),
                note='أطول بُعدين مكتوبين متعامدين — مساحة القطعة لا مساحة البناء')

def detect_boundary(ents, roles, scale, win=None, margin=6.0):
    """أكبر خط متعدد مغلق على طبقات الجدران، وإلا صندوق محيط بعناصر الجدران/الأعمدة.
    win = نافذة المخطط المختار (م) لاستبعاد المخططات المجاورة بنفس الملف."""
    def inwin(pts):
        if not win:
            return True
        xs = [q[0] * scale for q in pts]; ys = [q[1] * scale for q in pts]
        return (min(xs) >= win[0] - margin and max(xs) <= win[2] + margin and
                min(ys) >= win[1] - margin and max(ys) <= win[3] + margin)
    best, best_a = None, 0.0
    for e in ents:
        if e['t'] != 'P' or not e.get('closed'):
            continue
        if roles.get(e['l']) not in ('wall', 'other'):
            continue
        pts = _seg_points(e)
        if len(pts) < 4 or not inwin(pts):
            continue
        a = abs(_shoelace(pts)) * scale * scale
        if a > best_a:
            best_a, best = a, pts
    if best and best_a > 4.0:
        poly = [(x * scale, y * scale) for x, y in best]
        return dict(kind='polyline', poly=[[round(x, 3), round(y, 3)] for x, y in poly],
                    area=round(best_a, 2), bbox=_rbox(poly))
    pts = []
    for e in ents:
        if roles.get(e['l']) in ('wall', 'col'):
            q = _seg_points(e)
            if inwin(q): pts += q
    if not pts:
        for e in ents:
            if roles.get(e['l']) != 'off':
                q = _seg_points(e)
                if inwin(q): pts += q
    if not pts:
        return None
    x0, y0, x1, y1 = _bbox(pts)
    poly = [(x0 * scale, y0 * scale), (x1 * scale, y0 * scale),
            (x1 * scale, y1 * scale), (x0 * scale, y1 * scale)]
    return dict(kind='bbox', poly=[[round(x, 3), round(y, 3)] for x, y in poly],
                area=round((x1 - x0) * (y1 - y0) * scale * scale, 2), bbox=_rbox(poly))

def _shoelace(pts):
    s = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        s += x1 * y2 - x2 * y1
    return s / 2.0

def _rbox(poly):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    return [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)]

# ---------------------- كشف الدرج وآبار المصاعد ----------------------
_LIFT_PAT = re.compile(r'(lift|elev|مصعد|المصعد)', re.I)

def _segments(ents, roles, win=None, scale=1.0):
    """كل القطع المستقيمة (من الخطوط والخطوط المتعددة) داخل نافذة المخطط."""
    out = []
    for e in ents:
        if roles.get(e['l']) in ('off', 'frame'):
            continue
        p = e['p']
        segs = []
        if e['t'] == 'L':
            segs = [(p[0], p[1], p[2], p[3])]
        elif e['t'] == 'P':
            segs = [(p[i], p[i + 1], p[i + 2], p[i + 3]) for i in range(0, len(p) - 3, 2)]
        for s in segs:
            if win:
                mx = (s[0] + s[2]) / 2 * scale; my = (s[1] + s[3]) / 2 * scale
                if not (win[0] - 2 <= mx <= win[2] + 2 and win[1] - 2 <= my <= win[3] + 2):
                    continue
            out.append(s)
    return out

def detect_stairs(ents, roles, scale, win=None, wmin=0.7, wmax=2.6,
                  rise_lo=0.08, rise_hi=0.45, nmin=5):
    """قلبة الدرج = تتابع قطع متوازية متساوية الطول ومتساوية التباعد (الدرجات).
    الكشف هندسي لأن أغلب المخططات ما تسمّي طبقة للدرج."""
    segs = _segments(ents, roles, win, scale)
    found = []
    for horiz in (True, False):
        buckets = {}
        for x1, y1, x2, y2 in segs:
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy) * scale
            if not (wmin <= L <= wmax):
                continue
            isH = abs(dy) * scale < L * 0.06
            isV = abs(dx) * scale < L * 0.06
            if horiz != isH or (horiz and not isH) or (not horiz and not isV):
                continue
            along = ((x1 + x2) / 2 if horiz else (y1 + y2) / 2) * scale   # موضع مركز الدرجة
            across = ((y1 + y2) / 2 if horiz else (x1 + x2) / 2) * scale  # اتجاه الصعود
            key = (round(L, 1), round(along, 1))
            buckets.setdefault(key, []).append(across)
        for (L, along), arr in buckets.items():
            if len(arr) < nmin:
                continue
            v = sorted(arr)
            gaps = [b - a for a, b in zip(v, v[1:]) if rise_lo <= b - a <= rise_hi]
            if len(gaps) < nmin - 1:
                continue
            med = sorted(gaps)[len(gaps) // 2]
            ok = [g for g in gaps if abs(g - med) <= 0.25 * med]
            if len(ok) < nmin - 1:
                continue
            n = len(ok) + 1
            run = n * med
            cx = along if horiz else v[0] + run / 2
            cy = v[0] + run / 2 if horiz else along
            found.append(dict(dir='x' if horiz else 'y', steps=n,
                              tread=round(med, 3), width=round(L, 2), run=round(run, 2),
                              x=round(cx, 2), y=round(cy, 2),
                              bbox=[round(cx - (L / 2 if horiz else run / 2), 2),
                                    round(cy - (run / 2 if horiz else L / 2), 2),
                                    round(cx + (L / 2 if horiz else run / 2), 2),
                                    round(cy + (run / 2 if horiz else L / 2), 2)]))
    # إزالة المكرر (نفس القلبة قد تُلتقط مرتين)
    uniq = []
    for f in sorted(found, key=lambda a: -a['steps']):
        if not any(abs(f['x'] - u['x']) < 1.0 and abs(f['y'] - u['y']) < 1.0 for u in uniq):
            uniq.append(f)
    return uniq

def detect_shafts(ents, roles, scale, win=None, lo=1.2, hi=4.0):
    """نواة المصعد/الدرج: تُرسم بالمخططات الإنشائية **حرفَ C** — جدار قص محيط
    مفتوح من جهة الباب — لا مستطيلاً مغلقاً. فيُكشف الشكلان معاً:

    * حلقة حرف C: خط متعدد بثمانية رؤوس فأكثر، صندوقه بين متر وخمسة، وسماكة
      جداره (المساحة ÷ نصف المحيط) بين 10 و45 سم — وتُقرأ منه سماكة الجدار
      الحقيقية فتدخل التصميم بدل قيمة مفترضة.
    * مستطيل مغلق بسيط، كما بالمساقط المعمارية.

    ووجود نص «مصعد/lift» قريباً يرفع الثقة ولا يُشترط: أغلب المخططات لا تسمّيها."""
    labels = [e for e in ents if e['t'] == 'T' and _LIFT_PAT.search(e.get('s') or '')]
    out = []
    for e in ents:
        if e['t'] != 'P' or roles.get(e['l']) in ('off', 'frame', 'axis'):
            continue
        pts = _seg_points(e)
        if len(pts) < 4:
            continue
        x0, y0, x1, y1 = _bbox(pts)
        w = (x1 - x0) * scale; h = (y1 - y0) * scale
        if not (lo <= w <= hi and lo <= h <= hi):
            continue
        s = shape_of(e, scale, ring_lo=lo, ring_hi=hi)
        wall = None
        if s and s['shape'] == 'C':
            wall = s['wall']                       # حلقة C — سماكة الجدار مقروءة
        elif not e.get('closed') or len(_verts(e)) > 6:
            continue                               # ليس مستطيلاً مغلقاً ولا حلقة
        cx = (x0 + x1) / 2 * scale; cy = (y0 + y1) / 2 * scale
        if win and not (win[0] <= cx <= win[2] and win[1] <= cy <= win[3]):
            continue
        near = any(math.hypot(t['p'][0] * scale - cx, t['p'][1] * scale - cy) < max(w, h)
                   for t in labels)
        out.append(dict(x=round(cx, 2), y=round(cy, 2), w=round(w, 2), h=round(h, 2),
                        kind=('C' if wall else 'box'), wall=wall, labelled=near))
    # تُدمج النوى المتكررة (جدار خارجي وداخلي لنفس البئر)
    out.sort(key=lambda s: (not s['labelled'], s['kind'] != 'C', -s['w'] * s['h']))
    uniq = []
    for s in out:
        if any(abs(s['x'] - o['x']) < max(o['w'], o['h']) * 0.6 and
               abs(s['y'] - o['y']) < max(o['w'], o['h']) * 0.6 for o in uniq):
            continue
        uniq.append(s)
    ring = [s for s in uniq if s['kind'] == 'C']
    if ring:
        return ring
    return [s for s in uniq if s['labelled']] or uniq[:1]

# ------------- الهيكل الحقيقي: أعمدة بمواقعها وجسور على محاورها -------------
def build_frame(cols, tol=0.6):
    """يبني الهيكل من مواقع الأعمدة الحقيقية:
    تُجمَّع الأعمدة بمحاور X ثم Y، ويُوصَل كل عمودين متجاورين على المحور بجسر."""
    if len(cols) < 2:
        return None
    def axes(vals):
        return [sum(c) / len(c) for c in _cluster(vals, tol)]
    ax = axes([c['x'] for c in cols])
    ay = axes([c['y'] for c in cols])
    snap = lambda v, arr: min(range(len(arr)), key=lambda i: abs(arr[i] - v))
    nodes = []
    for k, c in enumerate(cols):
        nodes.append(dict(k=k, x=round(c['x'], 3), y=round(c['y'], 3),
                          b=c['b'], h=c['h'], shape=c.get('shape', 'rect'),
                          D=c.get('D'), i=snap(c['x'], ax), j=snap(c['y'], ay)))
    beams = []
    for key, other in (('j', 'i'), ('i', 'j')):
        rows = {}
        for n in nodes:
            rows.setdefault(n[key], []).append(n)
        for r, arr in rows.items():
            arr.sort(key=lambda n: n[other])
            for a, b in zip(arr, arr[1:]):
                L = math.hypot(b['x'] - a['x'], b['y'] - a['y'])
                if L < 1.0 or L > 14.0:
                    continue
                beams.append(dict(dir='x' if key == 'j' else 'y', a=a['k'], b=b['k'],
                                  x1=a['x'], y1=a['y'], x2=b['x'], y2=b['y'],
                                  span=round(L, 3)))
    lines = {}
    for bm in beams:
        lines.setdefault((bm['dir'], round(bm['y1'] if bm['dir'] == 'x' else bm['x1'], 2)),
                         []).append(bm['span'])
    return dict(nodes=nodes, beams=beams, axes_x=[round(v, 3) for v in ax],
                axes_y=[round(v, 3) for v in ay],
                spans=[dict(dir=k[0], at=k[1], spans=v) for k, v in sorted(lines.items())],
                spans_all=[b['span'] for b in beams],
                n_cols=len(nodes), n_beams=len(beams))

# ------------------- أقرب شبكة منتظمة تطابق الأعمدة -------------------
def fit_grid(cols, axes=None, tol=1.0):
    """يعنقد إحداثيات الأعمدة إلى محاور ثم يبني شبكة منتظمة مكافئة،
    ويرجع أقصى ومتوسط انحراف العمود الحقيقي عنها — بنفس شكل grid_from_area."""
    if len(cols) < 4:
        return None
    gx = [sum(c) / len(c) for c in _cluster([c['x'] for c in cols], tol)]
    gy = [sum(c) / len(c) for c in _cluster([c['y'] for c in cols], tol)]
    if len(gx) < 2 or len(gy) < 2:
        return None
    L = gx[-1] - gx[0]; B = gy[-1] - gy[0]
    nx = len(gx) - 1; ny = len(gy) - 1
    sx = L / nx; sy = B / ny
    devs = []
    for c in cols:
        ix = min(range(len(gx)), key=lambda i: abs(gx[0] + i * sx - c['x']))
        iy = min(range(len(gy)), key=lambda i: abs(gy[0] + i * sy - c['y']))
        devs.append(math.hypot(gx[0] + ix * sx - c['x'], gy[0] + iy * sy - c['y']))
    mx = max(devs); rms = math.sqrt(sum(d * d for d in devs) / len(devs))
    # انحراف المحاور الحقيقية (غير المنتظمة) عن المتساوية
    sxs = [gx[i + 1] - gx[i] for i in range(nx)]
    sys_ = [gy[i + 1] - gy[i] for i in range(ny)]
    return dict(L=round(L, 3), B=round(B, 3), nx=nx, ny=ny,
                sx=round(sx, 4), sy=round(sy, 4),
                cols=(nx + 1) * (ny + 1), bays=nx * ny,
                x0=round(gx[0], 3), y0=round(gy[0], 3),
                axes_x=[round(v, 3) for v in gx], axes_y=[round(v, 3) for v in gy],
                spans_x=[round(v, 3) for v in sxs], spans_y=[round(v, 3) for v in sys_],
                max_dev=round(mx, 4), rms_dev=round(rms, 4),
                regular=bool(mx <= 0.25),
                n_detected=len(cols), n_grid=(nx + 1) * (ny + 1))

# ------------------------------ التحليل ------------------------------
def dim_spans(ents, scale, win=None, tol=0.12):
    """البحور كما كتبها المصمم: الأبعاد الموازية للمحاور داخل المخطط المختار."""
    out = {'x': [], 'y': []}
    for e in ents:
        if e['t'] != 'D' or not e.get('m'):
            continue
        p = e['p']
        mx = (p[0] + p[2]) / 2 * scale; my = (p[1] + p[3]) / 2 * scale
        if win and not (win[0] - 3 <= mx <= win[2] + 3 and win[1] - 3 <= my <= win[3] + 3):
            continue
        dx = abs(p[2] - p[0]) * scale; dy = abs(p[3] - p[1]) * scale
        L = float(e['m']) * scale
        if L < 0.5 or L > 25.0:
            continue
        if dy < tol and dx > tol:
            out['x'].append(round(L, 3))
        elif dx < tol and dy > tol:
            out['y'].append(round(L, 3))
    for k in out:
        out[k].sort()
    return out

def analyze(p):
    """p = {ents, layers, insunits, roles?, scale?, ...} من المتصفح أو من read_dxf."""
    ents = p.get('ents') or []
    insunits = p.get('insunits', 4)
    counts = {}
    for e in ents:
        counts[e['l']] = counts.get(e['l'], 0) + 1
    given = p.get('roles') or {}
    layers = []
    for name in sorted(counts, key=lambda k: -counts[k]):
        layers.append(dict(name=name, n=counts[name],
                           role=given.get(name) or suggest_role(name),
                           suggested=suggest_role(name)))
    roles = {l['name']: l['role'] for l in layers}
    warn = []
    # ---------- المخطط المائل يُدار لمحاور المبنى قبل أي كشف ----------
    ang, ang_share = plan_angle(ents, roles)
    off_axis = abs((ang + 45.0) % 90.0 - 45.0)         # بُعد الزاوية عن المحاور
    if p.get('angle') is not None:
        ang = float(p['angle']); off_axis = abs((ang + 45.0) % 90.0 - 45.0)
        ang_share = 1.0
    if ang_share >= 0.5 and off_axis > 1.0:
        ents = rotate_ents(ents, ang)
        warn.append('المخطط مرسوم مائلاً %.1f° عن محاور الرسم (%d%% من أطوال البنية '
                    'على هذا الاتجاه) — دُوِّر لمحاور المبنى قبل التحليل، وإلا قُرئت '
                    'مقاطع الأعمدة وبحورها خطأً.' % (ang, int(ang_share * 100)))
    else:
        ang = 0.0
    # ---------- المقياس: يدوي · ثم من الأبعاد المكتوبة · ثم من مقطع العمود ----------
    declared = units_scale(insunits)
    dimc = None if p.get('scale') else scale_from_dims(ents)
    sug = None
    if p.get('scale'):
        scale = float(p['scale']); src = 'يدوي'
    elif dimc and dimc['ok']:
        scale = dimc['scale']; src = 'الأبعاد المكتوبة'
        warn.append(dimc['why'] + (' — ووحدات الملف المصرّحة «%s» مخالفة فأُهملت.'
                                   % unit_name(insunits)
                                   if abs(scale - declared) > 1e-9 else '.'))
    else:
        sug = suggest_scale(ents, roles)
        if sug and sug['ok']:
            scale = sug['scale']; src = 'مقطع العمود'
            if abs(scale - declared) > 1e-9:
                warn.append('ما لقيت أبعاداً مكتوبة كافية — عُوير المقياس من مقطع العمود '
                            'الوسيط (%.0f مم) فصار %s.' % (sug['median'], sug['name']))
        else:
            scale = declared; src = 'وحدات الملف'
    # ---------- كل المخططات بالملف (تعنقد على طبقات البنية) ----------
    texts = [e for e in ents if e['t'] == 'T'
             and _TITLE_PAT.search(clean_text(e.get('s')))]
    groups = split_regions(ents, roles, scale)
    regions = []
    for gi, gidx in enumerate(groups):
        info = region_info(ents, gidx, scale, texts)
        if not info or info['w'] < 2.0 or info['h'] < 2.0:
            continue
        info['i'] = len(regions); info['idx'] = gidx
        regions.append(info)
    # إطارات الورقة والمربعات الكبيرة تُستبعد
    frames = detect_frames(ents, roles, scale, regions)
    if frames:
        for i in frames:
            roles.setdefault(ents[i]['l'], 'other')
        regions = [r for r in regions
                   if not set(r['idx']).issubset(frames)]
        for k, r in enumerate(regions):
            r['i'] = k
    # طبقات تحمل أشكال أعمدة ولا تسمّي نفسها «أعمدة» (الطبقة «0» غالباً) تُرقّى
    promoted = promote_column_layers(ents, roles, scale)
    if promoted:
        warn.append('طبقات ما سمّت نفسها «أعمدة» لكنها تحمل أشكال أعمدة فأُخذت: '
                    + ' · '.join('«%s» %d شكل' % (k, v)
                                 for k, v in sorted(promoted.items(), key=lambda t: -t[1])[:4]))
    all_cols = detect_columns(ents, roles, scale, col_layers=promoted.keys())
    for r in regions:
        b = r['bbox']
        r['cols'] = [c for c in all_cols
                     if b[0] - 1 <= c['x'] <= b[2] + 1 and b[1] - 1 <= c['y'] <= b[3] + 1]
        r['ncol'] = len(r['cols'])
    regions.sort(key=lambda r: (-r['ncol'], -(r['w'] * r['h'])))
    for k, r in enumerate(regions):
        r['i'] = k
    pick = int(p.get('plan_index', 0))
    if pick >= len(regions):
        pick = 0
    cols = regions[pick]['cols'] if regions else []
    win = regions[pick]['bbox'] if regions else None
    plans = [dict(i=r['i'], n=r['ncol'], nent=r['n'], name=r['name'], bbox=r['bbox'],
                  w=r['w'], h=r['h'],
                  layers=[dict(name=a, n=b2) for a, b2 in r['layers']]) for r in regions]
    if len(plans) > 1:
        warn.append('الملف يحوي %d مخططاً منفصلاً — معروضة كلها بالجدول. المختار حالياً '
                    'رقم %d (%d عمود · %.1f × %.1f م%s).'
                    % (len(plans), pick + 1, plans[pick]['n'], plans[pick]['w'],
                       plans[pick]['h'],
                       ' · ' + plans[pick]['name'] if plans[pick]['name'] else ''))
    if frames:
        warn.append('استُبعد %d عنصراً كإطارات ورقة/مربعات كبيرة لا تخص المبنى.' % len(frames))
    axes = detect_axes(ents, roles, scale, within=win)
    bnd = detect_boundary(ents, roles, scale, win)
    grid = fit_grid(cols)
    frame = build_frame(cols)
    plot = plot_from_dims(ents, scale, win)
    # مساحة البناء لا تتجاوز مساحة القطعة. فإن جاء الصندوق المحيط أكبر من القطعة
    # فهو يشمل ما حول المبنى (أرصفة · حدود · أسهم شمال) — عندها يُؤخذ حدّ البناء
    # من غلاف الأعمدة نفسها، وهو ما يحمله الهيكل فعلاً.
    if plot and bnd and bnd['kind'] == 'bbox' and bnd['area'] > plot['area'] * 1.02:
        cb = (boundary_from_columns(cols, (frame or {}).get('spans_all'), cover=0.12)
              if len(cols) >= 3 else None)
        if cb and cb['area'] < bnd['area']:
            warn.append('الصندوق المحيط (%.0f م²) أكبر من القطعة نفسها (%.0f م² = '
                        '%.2f × %.2f) — فمساحة البناء أُخذت من غلاف الأعمدة: %.0f م².'
                        % (bnd['area'], plot['area'], plot['L'], plot['B'], cb['area']))
            bnd = cb
        else:
            warn.append('الصندوق المحيط أكبر من القطعة (%.0f م²) — راجع المخطط المختار.'
                        % plot['area'])
    if plot and bnd and bnd['area'] > plot['area'] * 1.02:
        warn.append('مساحة البناء المستخرَجة (%.0f م²) ما زالت أكبر من القطعة (%.0f م²) — '
                    'غالباً المخطط المختار يضم أكثر من كتلة أو يشمل أعمال موقع؛ '
                    'اختر المخطط الصحيح من القائمة أو صحّح دور الطبقات.'
                    % (bnd['area'], plot['area']))
    stairs = detect_stairs(ents, roles, scale, win)
    shafts = detect_shafts(ents, roles, scale, win)
    dspans = dim_spans(ents, scale, win)
    if not any(l['role'] == 'col' for l in layers):
        warn.append('ما تعرّفت على طبقة أعمدة — اختر الطبقة الصحيحة من الجدول ثم أعد التحليل')
    elif len(cols) < 4:
        warn.append('عدد الأعمدة المكتشَفة %d فقط — تأكد من طبقة الأعمدة أو من المقياس' % len(cols))
    if grid and not grid['regular']:
        warn.append('الأعمدة غير منتظمة تماماً: أقصى انحراف عن الشبكة المطابِقة %.0f مم — '
                    'التصميم سيُبنى على الشبكة المطابِقة، راجع الفرق قبل الاعتماد'
                    % (grid['max_dev'] * 1000))
    if bnd and bnd['kind'] == 'bbox':
        warn.append('ما لقيت مضلّعاً مغلقاً للجدران — استُعمل الصندوق المحيط لحساب المساحة')
    ext = None
    if ents:
        pts = []
        for e in ents:
            if roles.get(e['l']) != 'off':
                pts += _seg_points(e)
        if pts:
            x0, y0, x1, y1 = _bbox(pts)
            ext = [round(x0 * scale, 3), round(y0 * scale, 3),
                   round(x1 * scale, 3), round(y1 * scale, 3)]
    return dict(layers=layers, columns=cols, axes=axes, boundary=bnd, grid=grid,
                frame=frame, stairs=stairs, shafts=shafts, dim_spans=dspans,
                plot=plot,
                insunits=insunits, unit=unit_name(insunits), scale=scale,
                scale_src=src, dim_scale=dimc,
                angle=round(ang, 3), angle_share=round(ang_share, 3),
                declared_scale=declared, suggested=sug, plans=plans, plan_index=pick,
                window=win, extents=ext, n_ents=len(ents), warnings=warn,
                n_frames=len(frames),
                scales=[dict(v=a, name=b) for a, b in SCALES],
                roles=[dict(k=a, name=b) for a, b in ROLES],
                note='الأعمدة تُستخرج بتجميع عناصر طبقة الأعمدة إلى عناقيد متجاورة '
                     'وقبول ما كان مقطعه بين 15 و150 سم · الشبكة المطابِقة هي أقرب شبكة '
                     'منتظمة لمواقع الأعمدة الحقيقية، ويُعرض انحرافها عنها بالمليمتر.')

def parse_dxf(p):
    """يقبل {b64: ...} أو {text: ...} ويرجع التحليل كاملاً."""
    d = read_dxf_b64(p['b64']) if p.get('b64') else read_dxf(p.get('text', ''))
    d['roles'] = p.get('roles')
    d['scale'] = p.get('scale')
    out = analyze(d)
    out['ents'] = d['ents']
    return out
