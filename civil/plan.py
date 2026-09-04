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
         ('other', 'عرض فقط'), ('off', 'تجاهل')]

_COL_PAT = re.compile(r'(^|[^a-z])(col|column|عمود|اعمدة|أعمدة)', re.I)
_WALL_PAT = re.compile(r'(wall|جدار|جدران|حائط|block|brick)', re.I)
_AXIS_PAT = re.compile(r'(axis|axes|grid|محور|محاور|شبكة)', re.I)
_NOISE_PAT = re.compile(r'(hatch|dim|text|txt|defpoints|title|frame|جداول|numbers)', re.I)

def suggest_role(name):
    """دور مقترح لكل طبقة بالاسم — قابل للتغيير من الواجهة."""
    n = (name or '').strip()
    if _COL_PAT.search(n): return 'col'
    if _AXIS_PAT.search(n): return 'axis'
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

# ---------------------------- كشف الأعمدة ----------------------------
def detect_columns(ents, roles, scale, cmin=0.15, cmax=1.5):
    """يجمع عناصر طبقات الأعمدة إلى عناقيد متجاورة، وكل عنقود بحجم عمود = عمود.
    يعمل سواء رُسم العمود كأربعة خطوط أو كخط متعدد مغلق أو كدائرة."""
    items = []
    for e in ents:
        if roles.get(e['l']) != 'col':
            continue
        pts = _seg_points(e)
        if not pts:
            continue
        if e['t'] == 'C' and e['p'][2] > 0:            # عمود دائري جاهز
            r = e['p'][2] * scale
            if cmin / 2 <= r <= cmax / 2:
                items.append(dict(kind='circle', pts=pts, r=r))
                continue
        items.append(dict(kind='poly', pts=pts, r=0.0))
    if not items:
        return []
    # تعنقد بالتجاور: صندوق محيط لكل عنصر ثم دمج المتقاطعة/المتلامسة
    tol = cmax / scale                                  # بوحدات الرسم
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
                    used[j] = True; g.append(c); changed = True
                    cur = [min(cur[0], c[0]), min(cur[1], c[1]),
                           max(cur[2], c[2]), max(cur[3], c[3])]
        groups.append((cur, [x[4] for x in g]))
    cols = []
    for (x0, y0, x1, y1), idx in groups:
        b = (x1 - x0) * scale
        h = (y1 - y0) * scale
        if not (cmin <= b <= cmax and cmin <= h <= cmax):
            continue
        cols.append(dict(x=(x0 + x1) / 2.0 * scale, y=(y0 + y1) / 2.0 * scale,
                         b=round(b * 1000, 0), h=round(h * 1000, 0), n=len(idx)))
    cols.sort(key=lambda c: (c['y'], c['x']))
    return cols

# --------------------- معايرة المقياس من مقطع العمود ---------------------
# مقاطع الأعمدة القياسية بالتنفيذ المتري (مم)
STD_COL = [200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000]

SCALES = [(0.001, 'مليمتر'), (0.01, 'سنتيمتر'), (0.1, 'ديسيمتر'), (1.0, 'متر'),
          (0.0254, 'إنش'), (0.3048, 'قدم')]

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
def split_plans(cols):
    """ملف DWG واحد يحوي عادةً عدة مخططات جنب بعض (طوابق وواجهات).
    نفصل الأعمدة إلى مجموعات متباعدة، وكل مجموعة = مخطط مستقل."""
    if len(cols) < 2:
        return [list(range(len(cols)))] if cols else []
    d = []
    for i, a in enumerate(cols):
        m = min((math.hypot(a['x'] - b['x'], a['y'] - b['y'])
                 for j, b in enumerate(cols) if j != i), default=0.0)
        d.append(m)
    typ = sorted(d)[len(d) // 2] or 1.0
    gap = max(2.5 * typ, 12.0)
    parent = list(range(len(cols)))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for i, a in enumerate(cols):
        for j in range(i + 1, len(cols)):
            b = cols[j]
            if math.hypot(a['x'] - b['x'], a['y'] - b['y']) <= gap:
                ra, rb = find(i), find(j)
                if ra != rb:
                    parent[ra] = rb
    gr = {}
    for i in range(len(cols)):
        gr.setdefault(find(i), []).append(i)
    out = sorted(gr.values(), key=lambda g: -len(g))
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
    # المقياس: يدوي إن أُعطي، وإلا معايرة من مقطع العمود، وإلا $INSUNITS
    declared = units_scale(insunits)
    sug = None if p.get('scale') else suggest_scale(ents, roles)
    if p.get('scale'):
        scale = float(p['scale'])
    elif sug and sug['ok']:
        scale = sug['scale']
        if abs(scale - declared) > 1e-9:
            warn.append('وحدات الملف المصرّحة «%s» لا تطابق الرسم — عُوير المقياس من مقطع '
                        'العمود الوسيط (%.0f مم) فصار %s. غيّره يدوياً إن كان خطأ.'
                        % (unit_name(insunits), sug['median'], sug['name']))
    else:
        scale = declared
    # فصل المخططات المتجاورة واختيار واحد
    all_cols = detect_columns(ents, roles, scale)
    groups = split_plans(all_cols)
    plans = []
    for gi, idx in enumerate(groups):
        gc = [all_cols[i] for i in idx]
        bb = [min(c['x'] for c in gc), min(c['y'] for c in gc),
              max(c['x'] for c in gc), max(c['y'] for c in gc)]
        plans.append(dict(i=gi, n=len(gc), bbox=[round(v, 2) for v in bb],
                          w=round(bb[2] - bb[0], 2), h=round(bb[3] - bb[1], 2)))
    pick = int(p.get('plan_index', 0))
    if pick >= len(groups):
        pick = 0
    cols = [all_cols[i] for i in groups[pick]] if groups else []
    win = plans[pick]['bbox'] if plans else None
    if len(plans) > 1:
        warn.append('الملف يحوي %d مخططاً منفصلاً — اختير المخطط رقم %d (%d عمود · %.1f × %.1f م). '
                    'بدّله من القائمة إن أردت غيره.'
                    % (len(plans), pick + 1, plans[pick]['n'], plans[pick]['w'], plans[pick]['h']))
    axes = detect_axes(ents, roles, scale, within=win)
    bnd = detect_boundary(ents, roles, scale, win)
    grid = fit_grid(cols)
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
                insunits=insunits, unit=unit_name(insunits), scale=scale,
                declared_scale=declared, suggested=sug, plans=plans, plan_index=pick,
                window=win, extents=ext, n_ents=len(ents), warnings=warn,
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
