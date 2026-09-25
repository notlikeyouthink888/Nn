# -*- coding: utf-8 -*-
"""
قارئ مجموعة اللوحات الإنشائية وتركيب المبنى منها — محرّك قسم «🧩 الأوتوكاد».

المدخل: العناصر من القارئ الأمين بالمتصفح (`PlanIO.read(file, cb, {full:true})`):
بلوكات مفكوكة، نصوص كاملة بدورانها، نوع الخط، فضاء النموذج فقط.

المراحل (كل مرحلة محمية: فشلها تحذير عربي لا انهيار):
  ١) المقياس إلى المتر (الأبعاد المكتوبة) وتدوير المخطط المائل — من plan.py.
  ٢) فقاعات المحاور ← عنقدة إلى «رسمات»، ولكل رسمة محاورها بإحداثي دقيق من خط
     المحور المارّ بمركز الفقاعة، والمحاور الثانوية (Prime) باسمها «H'».
  ٣) عنوان كل رسمة ← نوعها وطابقها وسماكتها ومقياسها (cadkb).
  ٤) الجداول: جدول الجسور وجدول تسليح الأعمدة ← سجلات مهيكلة.
  ٥) العناصر بكل رسمة: أعمدة (بلوك/مضلع/خطّين) · جسور (خطّان متوازيان + علامة)
     · فتحات (X) · نداءات تسليح البلاطة · ألواح البلاطة بين المحاور.
  ٦) تجميع الرسمات بمبانٍ (نظام محاور لكل مبنى، أو دمجها باختيار المستخدم)
     وتسجيلها على شبكة واحدة بأسماء المحاور.
  ٧) التركيب طابقاً طابقاً + أحمال الأعمدة بالمساحة الرافدة + تصميم الأساسات.

كل عنصر يحمل مصدره (رقم الرسمة) وثقته. ما بلا دليل كافٍ يُعلَّم «تخمين» ولا
يدخل التركيب إلا إن طلب المستخدم ذلك صراحةً (opts.use_guesses).
"""
import math
import re

import plan as PL
import cadkb as K
from engine import footing_module

# ------------------------------------------------------------------ أدوات
def _med(v, default=0.0):
    v = sorted(v)
    return v[len(v) // 2] if v else default


class _Grid:
    """فهرس مكاني بسيط بخلايا مربعة — يبقي البحث خطياً تقريباً."""
    def __init__(self, cell):
        self.c = float(cell)
        self.b = {}

    def _r(self, v):
        return int(math.floor(v / self.c))

    def add(self, i, x0, y0, x1=None, y1=None):
        x1 = x0 if x1 is None else x1
        y1 = y0 if y1 is None else y1
        for gx in range(self._r(min(x0, x1)), self._r(max(x0, x1)) + 1):
            for gy in range(self._r(min(y0, y1)), self._r(max(y0, y1)) + 1):
                self.b.setdefault((gx, gy), []).append(i)

    def query(self, x0, y0, x1, y1):
        out = set()
        for gx in range(self._r(x0), self._r(x1) + 1):
            for gy in range(self._r(y0), self._r(y1) + 1):
                out.update(self.b.get((gx, gy), ()))
        return out


def _to_m(e, s):
    """نسخة من العنصر بالمتر."""
    f = dict(e)
    p = e['p']
    t = e['t']
    if t in ('L', 'P', 'D'):
        f['p'] = [v * s for v in p]
    elif t == 'C':
        f['p'] = [p[0] * s, p[1] * s, p[2] * s]
    elif t == 'A':
        f['p'] = [p[0] * s, p[1] * s, p[2] * s, p[3], p[4]]
    elif t == 'T':
        f['p'] = [p[0] * s, p[1] * s, p[2] * s]
    return f


def _segments(E):
    """كل خطوط الرسم كقطع مستقيمة (x0,y0,x1,y1, رقم العنصر)."""
    out = []
    for i, e in enumerate(E):
        p = e['p']
        if e['t'] == 'L':
            out.append((p[0], p[1], p[2], p[3], i))
        elif e['t'] == 'P' and not e.get('hatch'):
            n = len(p) // 2
            for k in range(n - 1):
                out.append((p[2 * k], p[2 * k + 1], p[2 * k + 2], p[2 * k + 3], i))
            if e.get('closed') and n > 2:
                out.append((p[2 * n - 2], p[2 * n - 1], p[0], p[1], i))
    return out


def _is_center(e):
    lt = (e.get('lt') or '').upper()
    return 'CENTER' in lt or 'DASHDOT' in lt or K.layer_hint(e.get('l')) == 'axis'


_COL_BLOCK = re.compile(r'(^|[^a-z])(col|colom|column|عمود)', re.I)


def _col_block(name):
    return bool(name) and bool(_COL_BLOCK.search(name))


# ------------------------------------------------------------------ ٢) المحاور
def find_bubbles(E, TG):
    """فقاعات المحاور: دائرة 0.2–2.5 م وبداخلها نص محور (A · 17 · H`)."""
    out = []
    for i, e in enumerate(E):
        if e['t'] != 'C':
            continue
        cx, cy, r = e['p']
        if not (0.2 <= r <= 2.5):
            continue
        best, bd = None, None
        for j in TG.query(cx - 1.4 * r, cy - 1.4 * r, cx + 1.4 * r, cy + 1.4 * r):
            t = E[j]
            lab = K.axis_label(t.get('s'))
            if not lab:
                continue
            d = math.hypot(t['p'][0] - cx, t['p'][1] - cy)
            if d <= 1.25 * r and (bd is None or d < bd):
                best, bd = lab, d
        if best:
            out.append(dict(name=best['name'], base=best['base'], prime=best['prime'],
                            numeric=best['numeric'], x=cx, y=cy, r=r, src=i))
    # إزالة المكرّر (دائرتان متطابقتان)
    ded = []
    for b in out:
        if not any(o['name'] == b['name'] and abs(o['x'] - b['x']) < 0.05 and abs(o['y'] - b['y']) < 0.05
                   for o in ded):
            ded.append(b)
    return ded


def cluster(items, thr, key=lambda b: (b['x'], b['y'])):
    """عنقدة بالربط المفرد."""
    n = len(items)
    par = list(range(n))

    def f(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i
    G = _Grid(thr)
    for i, b in enumerate(items):
        x, y = key(b)
        G.add(i, x, y)
    for i, b in enumerate(items):
        x, y = key(b)
        for j in G.query(x - thr, y - thr, x + thr, y + thr):
            if j <= i:
                continue
            x2, y2 = key(items[j])
            if math.hypot(x - x2, y - y2) <= thr:
                par[f(i)] = f(j)
    groups = {}
    for i in range(n):
        groups.setdefault(f(i), []).append(items[i])
    return list(groups.values())


def resolve_axes(bubs, E, SG, segs):
    """اتجاه كل محور وإحداثيه الدقيق: الخط الطولي المارّ بمركز فقاعته.

    المحور العمودي (ثابت x) فقاعته فوق/تحت الرسمة؛ الأفقي (ثابت y) على جانبيها.
    إن لم يوجد خط، يُستنتج الاتجاه من ترتيب فقاعات الفئة نفسها (أرقام/حروف)."""
    det = {}
    for b in bubs:
        cx, cy, r = b['x'], b['y'], b['r']
        best = None
        for k in SG.query(cx - 6 * r, cy - 6 * r, cx + 6 * r, cy + 6 * r):
            x0, y0, x1, y1, i = segs[k]
            dx, dy = x1 - x0, y1 - y0
            L = math.hypot(dx, dy)
            if L < 3.0:
                continue
            w = 2.0 if _is_center(E[i]) else 1.0
            if abs(dx) <= 0.02 * L and abs(x0 - cx) <= 0.35 * r:           # عمودي
                gap = 0 if min(y0, y1) <= cy <= max(y0, y1) else min(abs(cy - y0), abs(cy - y1))
                if gap <= 4 * r:
                    sc = w * L / (1 + gap)
                    if best is None or sc > best[0]:
                        best = (sc, 'x', (x0 + x1) / 2.0, min(y0, y1), max(y0, y1))
            elif abs(dy) <= 0.02 * L and abs(y0 - cy) <= 0.35 * r:         # أفقي
                gap = 0 if min(x0, x1) <= cx <= max(x0, x1) else min(abs(cx - x0), abs(cx - x1))
                if gap <= 4 * r:
                    sc = w * L / (1 + gap)
                    if best is None or sc > best[0]:
                        best = (sc, 'y', (y0 + y1) / 2.0, min(x0, x1), max(x0, x1))
        if best:
            det.setdefault(b['name'], []).append((best[1], best[2], best[3], best[4], True))
    # بلا خط: من ترتيب فقاعات الفئة نفسها
    for numeric in (True, False):
        grp = [b for b in bubs if b['numeric'] == numeric and b['name'] not in det]
        allg = [b for b in bubs if b['numeric'] == numeric]
        if not grp or len(allg) < 2:
            continue
        sx = max(b['x'] for b in allg) - min(b['x'] for b in allg)
        sy = max(b['y'] for b in allg) - min(b['y'] for b in allg)
        o = 'x' if sx >= sy else 'y'
        for b in grp:
            det.setdefault(b['name'], []).append((o, b['x'] if o == 'x' else b['y'], None, None, False))
    ax = {'x': {}, 'y': {}}
    for name, v in det.items():
        ox = sum(1 for t in v if t[0] == 'x')
        o = 'x' if ox * 2 >= len(v) else 'y'
        vv = [t for t in v if t[0] == o]
        pos = _med([t[1] for t in vv])
        lo = [t[2] for t in vv if t[2] is not None]
        hi = [t[3] for t in vv if t[3] is not None]
        ax[o][name] = dict(name=name, pos=pos, prime=name.endswith("'"),
                           lo=min(lo) if lo else None, hi=max(hi) if hi else None,
                           from_line=any(t[4] for t in vv))
    return ax


def _sorted_axes(d):
    return sorted(d.values(), key=lambda a: a['pos'])


# ------------------------------------------------------------------ ٤) الجداول
_BEAM_HDR = [('type', r'^(type|mark)$'), ('size', r'^(size|\(bxh\))$'),
             ('bb1', r'\(bb1\)'), ('bb2', r'\(bb2\)'), ('tb1', r'\(tb1\)'), ('tb2', r'\(tb2\)'),
             ('s_end', r'1/4\s*span|the\s+ends'), ('s_mid', r'1/2\s*span|mid\s+span'),
             ('side', r'mid\s*reinf|side\s*bars|skin')]


def _rows(texts, tol=0.35):
    rows = []
    for t in sorted(texts, key=lambda t: -t['p'][1]):
        if rows and abs(rows[-1][0] - t['p'][1]) <= tol:
            rows[-1][1].append(t)
        else:
            rows.append([t['p'][1], [t]])
    return rows


def read_beam_schedule(title, E, TG):
    """جدول الجسور: صف لكل علامة B، والأعمدة بعناوينها (bb1/bb2/tb1/tb2 · ¼ · ½)."""
    tx, ty = title['p'][0], title['p'][1]
    h = max(title['p'][2], 0.3)
    region = [E[j] for j in TG.query(tx - 3 * h, ty - 60 * h, tx + 60 * h, ty + h)]
    region = [t for t in region if t['t'] == 'T' and t['p'][1] < ty - 0.2 * h]
    marks = [t for t in region if K.mark_kind(t.get('s'))[0] == 'beam' and t['p'][0] <= tx + 6 * h]
    if not marks:
        return {}
    first_y = max(t['p'][1] for t in marks)
    hdr = {}
    for t in region:
        if t['p'][1] <= first_y + 0.2 * h:
            continue
        s = K.clean_text(t.get('s')).lower()
        for key, rx in _BEAM_HDR:
            if re.search(rx, s) and key not in hdr:
                hdr[key] = t['p'][0]
    mark_x = _med([t['p'][0] for t in marks])
    out = {}
    for t in marks:
        y = t['p'][1]
        row = [c for c in region if abs(c['p'][1] - y) <= 0.45 * h and c is not t and c['p'][0] > mark_x + 0.3 * h]
        row.sort(key=lambda c: c['p'][0])
        rec = dict(mark=K.mark_kind(t.get('s'))[1], b=None, h=None,
                   bot=dict(cont=None, extra=None), top=dict(cont=None, sup=None),
                   stir=dict(end=None, mid=None), side=None, src=dict(x=round(t['p'][0], 2), y=round(y, 2)))
        bars, ties = [], []
        for c in row:
            s = c.get('s')
            sz = K.parse_size(s)
            if sz and rec['b'] is None and not re.search(r'%%c', s or '', re.I):
                rec['b'], rec['h'] = sz['b'], sz['h']
                continue
            if K.is_not_present(s):
                bars.append((c['p'][0], None))
                continue
            ti = K.parse_ties(s)
            if ti:
                ties.append((c['p'][0], ti))
                continue
            br = K.parse_bars(s)
            if br:
                bars.append((c['p'][0], br))

        def near(x, keys):
            ks = [k for k in keys if k in hdr]
            if not ks:
                return None
            return min(ks, key=lambda k: abs(hdr[k] - x))
        slots = {}
        if hdr:
            for x, v in bars:
                k = near(x, ('bb1', 'bb2', 'tb1', 'tb2', 'side'))
                if k and k not in slots:
                    slots[k] = v
            for x, v in ties:
                k = near(x, ('s_end', 's_mid'))
                if k and k not in slots:
                    slots[k] = v
        else:                                    # بلا عناوين: الترتيب القياسي للجدول
            for k, (x, v) in zip(('bb1', 'bb2', 'tb1', 'tb2', 'side'), bars):
                slots[k] = v
            for k, (x, v) in zip(('s_end', 's_mid'), ties):
                slots[k] = v
        rec['bot'] = dict(cont=slots.get('bb1'), extra=slots.get('bb2'))
        rec['top'] = dict(cont=slots.get('tb1'), sup=slots.get('tb2'))
        rec['stir'] = dict(end=slots.get('s_end'), mid=slots.get('s_mid') or slots.get('s_end'))
        rec['side'] = slots.get('side')
        if rec['b'] or rec['bot']['cont']:
            out[rec['mark']] = rec
    return out


def read_column_schedule(title, E, TG):
    """جدول تسليح الأعمدة: عناوين C1…C5 أفقياً × صفوف الطوابق عمودياً.
    الخلية: قضبان رئيسية + أتاري، أو NOT PRESENT (العمود غير موجود بالطابق)."""
    tx, ty = title['p'][0], title['p'][1]
    h = max(title['p'][2], 0.3)
    region = [E[j] for j in TG.query(tx - 120 * h, ty - 120 * h, tx + 120 * h, ty + h)]
    region = [t for t in region if t['t'] == 'T' and t['p'][1] < ty]
    heads = [t for t in region if K.mark_kind(t.get('s'))[0] == 'col']
    if len(heads) < 2:
        return {}
    # صف العناوين = الصف الأكثر علامات أعمدة
    rows = _rows(heads, tol=0.5 * h)
    hy, hrow = max(rows, key=lambda r: len(r[1]))
    hrow = sorted(hrow, key=lambda t: t['p'][0])
    cols = [(K.mark_kind(t.get('s'))[1], t['p'][0]) for t in hrow]
    step = _med([b[1] - a[1] for a, b in zip(cols, cols[1:])], 5.0)
    labels = []
    for t in region:
        if t['p'][1] >= hy - 0.3 * h:
            continue
        fl = K.parse_floor(t.get('s'))
        if fl and not fl['roof_of'] and t['p'][0] < cols[0][1] - 0.3 * step:
            labels.append((t['p'][1], fl))
    labels.sort(key=lambda a: -a[0])
    if not labels:
        return {}
    out = {m: {} for m, _ in cols}
    for li, (ly, fl) in enumerate(labels):
        top = ly + 1.2 * h if li == 0 else (ly + labels[li - 1][0]) / 2.0 + 0.6 * h
        bot = (ly + labels[li + 1][0]) / 2.0 + 0.6 * h if li + 1 < len(labels) else ly - 10 * h
        top = min(top, ly + 2.5 * h)
        cells = {m: [] for m, _ in cols}
        for t in region:
            y = t['p'][1]
            if not (bot < y <= top) or t['p'][0] < cols[0][1] - 0.6 * step:
                continue
            m = min(cols, key=lambda c: abs(c[1] - t['p'][0]))
            if abs(m[1] - t['p'][0]) <= 0.75 * step:
                cells[m[0]].append(t)
        for m, lst in cells.items():
            txt = [K.clean_text(t.get('s')) for t in lst]
            if not txt:
                continue
            if any(K.is_not_present(s) for s in txt) and not any(K.parse_bars(s) for s in txt):
                out[m][fl['key']] = None
                continue
            main = next((K.parse_bars(s) for s in txt if re.search(r'main|%%c', s, re.I) and K.parse_bars(s)), None)
            ties = next((K.parse_ties(s) for s in txt if K.parse_ties(s)), None)
            if main or ties:
                out[m][fl['key']] = dict(main=main, ties=ties)
    return {m: v for m, v in out.items() if v}


# ------------------------------------------------------------------ ٥) العناصر
def detect_openings(segs, E, rect):
    """علامة X: قطران متقاطعان رؤوسهما زوايا مستطيل واحد = فتحة بالسقف."""
    diag = []
    for x0, y0, x1, y1, i in segs:
        L = math.hypot(x1 - x0, y1 - y0)
        if L < 1.2:
            continue
        a = abs(math.degrees(math.atan2(y1 - y0, x1 - x0))) % 180
        if not (8 < a < 82 or 98 < a < 172):
            continue
        bx = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
        if rect and not (rect[0] - 1 <= bx[0] and bx[2] <= rect[2] + 1 and rect[1] - 1 <= bx[1] and bx[3] <= rect[3] + 1):
            continue
        slope = (y1 - y0) * (x1 - x0)
        diag.append((bx, slope, i))
    out, used = [], set()
    for a in range(len(diag)):
        if a in used:
            continue
        ba, sa, ia = diag[a]
        for b in range(a + 1, len(diag)):
            if b in used:
                continue
            bb, sb, ib = diag[b]
            if sa * sb >= 0:
                continue
            if all(abs(ba[k] - bb[k]) <= 0.15 for k in range(4)):
                used.update((a, b))
                x0, y0, x1, y1 = [(ba[k] + bb[k]) / 2.0 for k in range(4)]
                if (x1 - x0) >= 0.6 and (y1 - y0) >= 0.6:
                    out.append(dict(x0=x0, y0=y0, x1=x1, y1=y1, src=[ia, ib]))
                break
    return out


def detect_columns(E, segs, rect, ax):
    """الأعمدة: بلوك مفكوك · مضلع/هاتش بمقاس عمود · خطّان متوازيان قصيران —
    ضمن الرسمة، مع التقاط أقرب تقاطع محاور."""
    x0, y0, x1, y1 = rect
    inside = lambda x, y: x0 <= x <= x1 and y0 <= y <= y1
    cols = []
    # أ) بلوكات الأعمدة (col 60x60 …) — كل إدراج عمود واحد
    groups = {}
    for i, e in enumerate(E):
        if e.get('bi') and (_col_block(e.get('blk')) or K.layer_hint(e.get('l')) == 'col'):
            groups.setdefault(e['bi'], []).append(e)
    accepted = set()
    for bi, lst in groups.items():
        pts = []
        circ = False
        for e in lst:
            if e['t'] == 'C' and e['p'][2] > 0:
                circ = True
                c = e['p']
                pts += [(c[0] - c[2], c[1] - c[2]), (c[0] + c[2], c[1] + c[2])]
            else:
                pts += PL._seg_points(e)
        if not pts:
            continue
        bx = PL._bbox(pts)
        w, h = bx[2] - bx[0], bx[3] - bx[1]
        cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
        if not inside(cx, cy) or not (0.12 <= w <= 2.0 and 0.12 <= h <= 2.0):
            continue
        sz = K.parse_size(lst[0].get('blk') or '')
        if sz and sz['shape'] == 'circ':
            circ = True
        accepted.add(bi)
        cols.append(dict(x=cx, y=cy, b=round(w * 1000), h=round(h * 1000),
                         shape='circ' if circ else 'rect', how='block', blk=lst[0].get('blk')))
    taken = [(c['x'], c['y']) for c in cols]
    near_taken = lambda x, y: any(abs(x - a) < 0.3 and abs(y - b) < 0.3 for a, b in taken)
    xs = [a['pos'] for a in ax['x'].values()]
    ys = [a['pos'] for a in ax['y'].values()]
    near_int = lambda x, y, tol: (xs and ys and min(abs(x - v) for v in xs) <= tol
                                  and min(abs(y - v) for v in ys) <= tol)
    # ب) مضلعات/هاتش مغلقة بمقاس عمود
    for i, e in enumerate(E):
        if (e.get('bi') in accepted) or e['t'] not in ('P', 'C'):
            continue
        sh = PL.shape_of(e, 1.0, cmin=0.15, cmax=1.6)
        if not sh or sh['shape'] == 'C':
            continue
        pts = PL._seg_points(e)
        bx = PL._bbox(pts)
        cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
        if not inside(cx, cy) or near_taken(cx, cy):
            continue
        if not (K.layer_hint(e.get('l')) == 'col' or near_int(cx, cy, 0.6)):
            continue
        cols.append(dict(x=cx, y=cy, b=round(sh['b'] * 1000), h=round(sh['h'] * 1000),
                         shape=sh['shape'], how='outline'))
        taken.append((cx, cy))
    # ج) عمود بخطّين متوازيين قصيرين عند تقاطع
    short = [s for s in segs if 0.15 <= math.hypot(s[2] - s[0], s[3] - s[1]) <= 1.6
             and inside((s[0] + s[2]) / 2, (s[1] + s[3]) / 2) and E[s[4]].get('bi') not in accepted]
    for a in range(len(short)):
        sa = short[a]
        va = abs(sa[2] - sa[0]) < 1e-3
        ha = abs(sa[3] - sa[1]) < 1e-3
        if not (va or ha):
            continue
        for b in range(a + 1, len(short)):
            sb = short[b]
            if va and abs(sb[2] - sb[0]) < 1e-3:
                gap = abs(sa[0] - sb[0])
                ov = min(max(sa[1], sa[3]), max(sb[1], sb[3])) - max(min(sa[1], sa[3]), min(sb[1], sb[3]))
                L = abs(sa[3] - sa[1])
            elif ha and abs(sb[3] - sb[1]) < 1e-3:
                gap = abs(sa[1] - sb[1])
                ov = min(max(sa[0], sa[2]), max(sb[0], sb[2])) - max(min(sa[0], sa[2]), min(sb[0], sb[2]))
                L = abs(sa[2] - sa[0])
            else:
                continue
            if not (0.15 <= gap <= 1.6 and ov >= 0.9 * L):
                continue
            pts = [(sa[0], sa[1]), (sa[2], sa[3]), (sb[0], sb[1]), (sb[2], sb[3])]
            bx = PL._bbox(pts)
            cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
            if near_taken(cx, cy) or not near_int(cx, cy, 0.5):
                continue
            cols.append(dict(x=cx, y=cy, b=round((bx[2] - bx[0]) * 1000), h=round((bx[3] - bx[1]) * 1000),
                             shape='rect', how='two-lines'))
            taken.append((cx, cy))
    return cols


def _snap(v, axes, tol):
    best = None
    for a in axes:
        d = abs(a['pos'] - v)
        if d <= tol and (best is None or d < best[0]):
            best = (d, a)
    return best[1] if best else None


def detect_beams(E, segs, rect, ax, cols):
    """الجسور: خطّان متوازيان بفاصل 0.18–0.85 م موازيان للمحاور، على محور (أو يصلان
    بين مساند)، تُدمج قطعهما على الخط نفسه ثم تُقسَم بحورًا عند المساند."""
    x0, y0, x1, y1 = rect
    lines = {'h': [], 'v': []}
    for s in segs:
        e = E[s[4]]
        if e.get('bi') and _col_block(e.get('blk')):
            continue
        hint = K.layer_hint(e.get('l'))
        if _is_center(e) or hint in ('dim', 'text', 'frame', 'rebar'):
            continue
        sx0, sy0, sx1, sy1 = s[:4]
        L = math.hypot(sx1 - sx0, sy1 - sy0)
        if L < 0.9:
            continue
        mx, my = (sx0 + sx1) / 2, (sy0 + sy1) / 2
        if not (x0 <= mx <= x1 and y0 <= my <= y1):
            continue
        hid = 'HIDDEN' in (e.get('lt') or '').upper() or 'DASH' in (e.get('lt') or '').upper()
        if abs(sy1 - sy0) <= 0.01 * L:
            lines['h'].append((min(sx0, sx1), max(sx0, sx1), (sy0 + sy1) / 2, hid))
        elif abs(sx1 - sx0) <= 0.01 * L:
            lines['v'].append((min(sy0, sy1), max(sy0, sy1), (sx0 + sx1) / 2, hid))
    out = []
    for o, axes in (('h', _sorted_axes(ax['y'])), ('v', _sorted_axes(ax['x']))):
        L = sorted(lines[o], key=lambda t: t[2])
        # «السلّم»: ≥4 خطوط متوازية متقاربة بتباعد منتظم صغير = درج لا جسور
        stair = set()
        for i in range(len(L)):
            run = [i]
            for j in range(i + 1, len(L)):
                if L[j][2] - L[run[-1]][2] > 0.42:
                    break
                if abs((L[j][1] - L[j][0]) - (L[i][1] - L[i][0])) < 0.3 and \
                        min(L[j][1], L[i][1]) - max(L[j][0], L[i][0]) > 0.5:
                    run.append(j)
            if len(run) >= 4:
                stair.update(run)
        pairs = []
        for i, a in enumerate(L):
            if i in stair:
                continue
            best = None
            for j in range(i + 1, len(L)):
                b = L[j]
                gap = b[2] - a[2]
                if gap > 0.85:
                    break
                if gap < 0.18 or j in stair:
                    continue
                ov0, ov1 = max(a[0], b[0]), min(a[1], b[1])
                if ov1 - ov0 < 0.6:
                    continue
                best = (gap, ov0, ov1, (a[2] + b[2]) / 2, a[3] and b[3])
                break
            if best:
                pairs.append(best)
        # دمج القطع على الخط نفسه
        pairs.sort(key=lambda p: (round(p[3], 1), p[1]))
        merged = []
        for gap, a0, a1, c, hid in pairs:
            m = merged[-1] if merged else None
            if m and abs(m['c'] - c) <= 0.12 and a0 <= m['a1'] + 1.0:
                m['a1'] = max(m['a1'], a1)
                m['w'].append(gap)
                m['hid'] = m['hid'] and hid
                continue
            merged.append(dict(c=c, a0=a0, a1=a1, w=[gap], hid=hid))
        for m in merged:
            w = _med(m['w'])
            axis = _snap(m['c'], axes, max(0.45, 0.8 * w))
            length = m['a1'] - m['a0']
            # خارج المحاور: لا خط مخفي (عناصر تحت البلاطة: درج/طابق أسفل)، ولا أقصر من 2 م،
            # ولا عرض أكبر من 0.6 م — ويُشترط لاحقاً أن يُسند من طرفيه.
            if not axis and (m['hid'] or length < 2.0 or w > 0.6):
                continue
            out.append(dict(o=o, c=axis['pos'] if axis else m['c'], a0=m['a0'], a1=m['a1'],
                            w=round(w * 1000), axis=axis['name'] if axis else None, hid=m['hid']))
    # ——— تقسيم كل خط جسر إلى بحور عند المساند (أعمدة + جسور متعامدة) ———
    spans = []
    for bm in out:
        sup = []
        for c in cols:
            u, v = (c['x'], c['y']) if bm['o'] == 'h' else (c['y'], c['x'])
            half = max(c['b'], c['h']) / 2000.0
            if abs(v - bm['c']) <= half + 0.35 and bm['a0'] - half - 0.9 <= u <= bm['a1'] + half + 0.9:
                sup.append(u)
        for other in out:
            if other['o'] == bm['o']:
                continue
            if other['a0'] - 0.5 <= bm['c'] <= other['a1'] + 0.5 and bm['a0'] - 0.5 <= other['c'] <= bm['a1'] + 0.5:
                sup.append(other['c'])
        sup = sorted(set(round(u, 2) for u in sup))
        pts = [u for u in sup]
        if not pts or pts[0] > bm['a0'] + 0.9:
            pts = [bm['a0']] + pts
        if pts[-1] < bm['a1'] - 0.9:
            pts = pts + [bm['a1']]
        for a, b in zip(pts, pts[1:]):
            if b - a < 0.8:
                continue
            sa, sb = a in sup, b in sup
            if not bm['axis'] and not (sa and sb):
                continue                          # جسر خارج المحاور بلا مسندين = ليس جسراً
            spans.append(dict(o=bm['o'], c=bm['c'], a=a, b=b, w=bm['w'], axis=bm['axis'],
                              hid=bm.get('hid', False), cant=not (sa and sb)))
    return spans


def label_beams(spans, E, TG, rect):
    """كل علامة B تُنسب لأقرب بحر جسر (مسافة عمودية + خروج عن مداه)."""
    labels = []
    for j in TG.query(*rect):
        t = E[j]
        if t['t'] != 'T':
            continue
        k, mk = K.mark_kind(t.get('s'))
        if k == 'beam':
            labels.append((t['p'][0], t['p'][1], mk, t['p'][2]))
    for lx, ly, mk, h in labels:
        best = None
        for s in spans:
            u, v = (lx, ly) if s['o'] == 'h' else (ly, lx)
            out_of = max(0.0, s['a'] - u, u - s['b'])
            d = abs(v - s['c']) + 2 * out_of
            if d <= 2.2 and (best is None or d < best[0]):
                best = (d, s)
        if best:
            s = best[1]
            if 'mark' not in s or best[0] < s.get('_md', 9e9):
                s['mark'], s['_md'] = mk, best[0]
    for s in spans:
        s.pop('_md', None)


def label_columns(cols, E, TG, rect):
    labs = []
    for j in TG.query(*rect):
        t = E[j]
        if t['t'] == 'T':
            k, mk = K.mark_kind(t.get('s'))
            if k == 'col':
                labs.append((t['p'][0], t['p'][1], mk))
    pairs = []
    for i, c in enumerate(cols):
        for lx, ly, mk in labs:
            d = math.hypot(lx - c['x'], ly - c['y'])
            if d <= 2.6:
                pairs.append((d, i, mk, lx, ly))
    pairs.sort()
    used_c, used_l = set(), set()
    for d, i, mk, lx, ly in pairs:
        if i in used_c or (lx, ly) in used_l:
            continue
        cols[i]['mark'] = mk
        used_c.add(i)
        used_l.add((lx, ly))


def slab_callouts(E, TG, rect):
    out = []
    for j in TG.query(*rect):
        t = E[j]
        if t['t'] != 'T':
            continue
        c = K.parse_callout(t.get('s'))
        if c:
            rot = (t.get('rot') or 0) % 180
            out.append(dict(x=t['p'][0], y=t['p'][1], d=c['dia'], s=c['sp'], pos=c['pos'],
                            dir='x' if rot < 45 or rot > 135 else 'y', text=K.clean_text(t.get('s'))))
    return out


def slab_panels(ax, spans, openings, callouts):
    """ألواح البلاطة = خلايا بين محاور متتالية، تُقبل إن كانت محاطة بجسور من
    الجهات الأربع أو فيها نداء تسليح — ثم تُطرح الفتحات منها."""
    xs = [a['pos'] for a in _sorted_axes(ax['x'])]
    ys = [a['pos'] for a in _sorted_axes(ax['y'])]
    if len(xs) < 2 or len(ys) < 2:
        return []
    H = [s for s in spans if s['o'] == 'h']
    V = [s for s in spans if s['o'] == 'v']

    def hit_h(cx, cy, up):
        return any(s['a'] - 0.3 <= cx <= s['b'] + 0.3 and ((s['c'] > cy) if up else (s['c'] < cy)) for s in H)

    def hit_v(cx, cy, right):
        return any(s['a'] - 0.3 <= cy <= s['b'] + 0.3 and ((s['c'] > cx) if right else (s['c'] < cx)) for s in V)
    cells = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            a0, a1, b0, b1 = xs[i], xs[i + 1], ys[j], ys[j + 1]
            if a1 - a0 < 0.3 or b1 - b0 < 0.3:
                continue
            cx, cy = (a0 + a1) / 2, (b0 + b1) / 2
            enclosed = hit_h(cx, cy, True) and hit_h(cx, cy, False) and hit_v(cx, cy, True) and hit_v(cx, cy, False)
            has_call = any(a0 <= c['x'] <= a1 and b0 <= c['y'] <= b1 for c in callouts)
            if enclosed or has_call:
                cells.append([a0, b0, a1, b1])
    # طرح الفتحات
    rects = cells
    for op in openings:
        nxt = []
        for r in rects:
            nxt += _rect_minus(r, [op['x0'], op['y0'], op['x1'], op['y1']])
        rects = nxt
    return _merge_rects(rects)


def _rect_minus(r, o):
    x0, y0, x1, y1 = r
    ox0, oy0, ox1, oy1 = max(o[0], x0), max(o[1], y0), min(o[2], x1), min(o[3], y1)
    if ox1 - ox0 <= 0.05 or oy1 - oy0 <= 0.05:
        return [r]
    out = []
    if oy0 - y0 > 0.05: out.append([x0, y0, x1, oy0])
    if y1 - oy1 > 0.05: out.append([x0, oy1, x1, y1])
    if ox0 - x0 > 0.05: out.append([x0, oy0, ox0, oy1])
    if x1 - ox1 > 0.05: out.append([ox1, oy0, x1, oy1])
    return out


def _merge_rects(rects):
    """دمج المستطيلات المتجاورة أفقياً ثم عمودياً — أقل عناصر للرسم."""
    rs = sorted([list(r) for r in rects], key=lambda r: (round(r[1], 3), round(r[3], 3), r[0]))
    row = []
    for r in rs:
        if row and abs(row[-1][1] - r[1]) < 1e-3 and abs(row[-1][3] - r[3]) < 1e-3 and abs(row[-1][2] - r[0]) < 1e-3:
            row[-1][2] = r[2]
        else:
            row.append(r)
    row.sort(key=lambda r: (round(r[0], 3), round(r[2], 3), r[1]))
    out = []
    for r in row:
        if out and abs(out[-1][0] - r[0]) < 1e-3 and abs(out[-1][2] - r[2]) < 1e-3 and abs(out[-1][3] - r[1]) < 1e-3:
            out[-1][3] = r[3]
        else:
            out.append(r)
    return out


# ------------------------------------------------------------------ الرسم المصغّر
def _sketch(segs, E, rect, cap=2500):
    x0, y0, x1, y1 = rect
    out = []
    for s in segs:
        if not (x0 <= s[0] <= x1 and y0 <= s[1] <= y1 and x0 <= s[2] <= x1 and y0 <= s[3] <= y1):
            continue
        e = E[s[4]]
        k = 'a' if _is_center(e) else ('c' if e.get('bi') and _col_block(e.get('blk')) else 'l')
        out.append([round(s[0], 2), round(s[1], 2), round(s[2], 2), round(s[3], 2), k])
        if len(out) >= cap:
            break
    return out


# ------------------------------------------------------------------ الرئيسي
def read_set(d, opts=None):
    opts = opts or {}
    warn, stages = [], []

    def stage(name, fn, default=None):
        try:
            return fn()
        except Exception as ex:                 # مرحلة فاشلة = تحذير لا انهيار
            warn.append('تعذّرت مرحلة «%s»: %s — أُكمل الباقي بدونها.' % (name, ex))
            stages.append(dict(name=name, ok=False))
            return default

    ents, dropped = PL.sanitize_ents(d.get('ents'))
    if dropped:
        warn.append('تجاوزت %d عنصراً مشوَّهاً بالملف.' % dropped)
    empty = dict(ok=False, warnings=warn, drawings=[], buildings=[], schedules=dict(beams={}, columns={}),
                 definitions=[], materials={}, scale=None, n_ents=len(ents), dictionary=K.dictionary())
    if not ents:
        warn.append('الملف فارغ أو لا يحوي عناصر رسم مقروءة.')
        return empty

    # ---- ١) المقياس والتدوير ----
    scale, src = None, None
    if opts.get('scale'):
        scale, src = PL._safe_float(opts['scale'], 0.0) or None, 'يدوي'
    if not scale:
        dimc = stage('المقياس', lambda: PL.scale_from_dims(ents))
        if dimc and dimc.get('ok'):
            scale, src = dimc['scale'], 'الأبعاد المكتوبة'
    if not scale:
        scale, src = PL.units_scale(d.get('insunits', 4)), 'وحدات الملف'
        warn.append('المقياس مأخوذ من وحدات الملف لا من الأبعاد المكتوبة — تأكد منه (تقدر تحدده يدوياً).')
    E = [_to_m(e, scale) for e in ents]
    roles = {e['l']: PL.suggest_role(e['l']) for e in E}
    ang, share = stage('اتجاه المخطط', lambda: PL.plan_angle(E, roles), (0.0, 0.0))
    if share >= 0.5 and abs((ang + 45.0) % 90.0 - 45.0) > 1.0:
        E = PL.rotate_ents(E, ang)
        warn.append('المخطط مرسوم مائلاً %.1f° — دُوِّر لمحاور المبنى.' % ang)
    else:
        ang = 0.0

    TG = _Grid(4.0)
    for i, e in enumerate(E):
        if e['t'] == 'T':
            TG.add(i, e['p'][0], e['p'][1])
    segs = _segments(E)
    SG = _Grid(5.0)
    for k, s in enumerate(segs):
        SG.add(k, min(s[0], s[2]), min(s[1], s[3]), max(s[0], s[2]), max(s[1], s[3]))

    # ---- مواد وتعريفات من نصوص الملف ----
    materials, defs = {}, []
    for e in E:
        if e['t'] != 'T':
            continue
        s = e.get('s') or ''
        if len(s) > 12:
            for k2, v in K.parse_materials(s).items():
                materials.setdefault(k2, v)
        df = K.parse_definition(s)
        if df:
            defs.append(df)

    # ---- ٢) المحاور والرسمات ----
    bubs = stage('فقاعات المحاور', lambda: find_bubbles(E, TG), [])
    drawings = []
    if bubs:
        thr = min(40.0, max(6.0, 12.0 * _med([b['r'] for b in bubs], 1.0)))
        for grp in cluster(bubs, thr):
            ax = stage('محاور رسمة', lambda g=grp: resolve_axes(g, E, SG, segs), {'x': {}, 'y': {}})
            if len(ax['x']) < 2 or len(ax['y']) < 2:
                continue
            xs = [a['pos'] for a in ax['x'].values()]
            ys = [a['pos'] for a in ax['y'].values()]
            pad = 3.0
            rect = [min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad]
            bb = [min(b['x'] for b in grp), min(b['y'] for b in grp),
                  max(b['x'] for b in grp), max(b['y'] for b in grp)]
            drawings.append(dict(id=len(drawings), ax=ax, rect=rect, bub=bb,
                                 n_bubbles=len(grp)))
    if not drawings:
        warn.append('ما لقيت فقاعات محاور (دائرة وبداخلها حرف/رقم) — القسم يحتاج لوحات إنشائية بمحاور مرقّمة.')

    # ---- ٣) العناوين ----
    titles = [e for e in E if e['t'] == 'T' and K.is_title(e.get('s'))]
    for dw in drawings:
        bx0, by0, bx1, by1 = dw['bub']
        best = None
        for t in titles:
            tx, ty = t['p'][0], t['p'][1]
            if not (bx0 - 6 <= tx <= bx1 + 4):
                continue
            k = K.sheet_kind(t.get('s'))
            if k in ('beam_sched', 'col_sched', 'foot_sched', 'slab_sched'):
                continue
            if by0 - 14 <= ty <= by0 + 0.5:
                sc = (by0 - ty) - 2 * t['p'][2]
            elif by1 - 0.5 <= ty <= by1 + 8:
                sc = 20 + (ty - by1)
            else:
                continue
            if best is None or sc < best[0]:
                best = (sc, t)
        info = K.parse_title(best[1].get('s')) if best else dict(text=None, kind=None, floor=None,
                                                                   thickness=None, scale=None, building=None)
        ov = (opts.get('drawings') or {}).get(str(dw['id'])) or {}
        if ov.get('kind'):
            info['kind'] = ov['kind']
        if ov.get('floor') and ov['floor'] in K.FLOOR_ORDER:
            info['floor'] = dict(key=ov['floor'], order=K.FLOOR_ORDER[ov['floor']],
                                 name=K.FLOOR_NAMES[ov['floor']], roof_of=True)
        dw.update(title=info['text'], kind=info['kind'], kind_name=K.SHEET_NAMES.get(info['kind']),
                  floor=info['floor'], thickness=info['thickness'], scale_note=info['scale'],
                  building_name=info['building'], title_trusted=bool(best))

    # ---- ٤) الجداول ----
    beam_scheds, col_sched = [], {}
    for t in titles:
        k = K.sheet_kind(t.get('s'))
        if k == 'beam_sched':
            rec = stage('جدول الجسور', lambda t=t: read_beam_schedule(t, E, TG), {})
            if rec:
                beam_scheds.append(dict(x=t['p'][0], y=t['p'][1], beams=rec))
        elif k == 'col_sched':
            rec = stage('جدول الأعمدة', lambda t=t: read_column_schedule(t, E, TG), {})
            for m, v in (rec or {}).items():
                col_sched.setdefault(m, {}).update(v)
    for dw in drawings:                            # كل جدول جسور لأقرب مفتاح جسور
        dw['beam_sched'] = None
    for i, bs in enumerate(beam_scheds):
        cand = [dw for dw in drawings if dw['kind'] == 'beams_key'] or drawings
        if not cand:
            continue
        def dist(dw):
            r = dw['rect']
            dx = max(r[0] - bs['x'], 0, bs['x'] - r[2])
            dy = max(r[1] - bs['y'], 0, bs['y'] - r[3])
            return math.hypot(dx, dy)
        near = min(cand, key=dist)
        if near['beam_sched'] is None:
            near['beam_sched'] = i
    beams_all = {}
    for bs in beam_scheds:
        for m, v in bs['beams'].items():
            beams_all.setdefault(m, v)
    # تعريفات المستخدم والملف تتقدّم على الجدول/الافتراضي
    user_defs = []
    for x in (opts.get('definitions') or []):     # نص «C1 = 400x600» أو قاموس جاهز
        df = K.parse_definition(x) if isinstance(x, str) else x
        if isinstance(df, dict) and df.get('mark'):
            df['user'] = True
            user_defs.append(df)
    col_defs = {}
    for df in defs + user_defs:
        if df.get('kind') == 'col' and df.get('size'):
            col_defs[df['mark']] = df['size']
    for df in defs + user_defs:
        if df.get('kind') == 'beam' and df.get('size'):
            rec = beams_all.setdefault(df['mark'], dict(mark=df['mark'], bot=dict(cont=None, extra=None),
                                                         top=dict(cont=None, sup=None),
                                                         stir=dict(end=None, mid=None), side=None))
            if df.get('user'):                    # تعريف المستخدم: نسخة مستقلة تتقدّم على كل الجداول
                rec = beams_all[df['mark']] = dict(rec, bot=dict(rec['bot']), user=True)
            rec['b'], rec['h'] = df['size']['b'], df['size']['h']
            if df.get('bars'):
                rec['bot']['cont'] = df['bars']

    # ---- ٥) العناصر بكل رسمة ----
    for dw in drawings:
        r = dw['rect']
        dw['openings'] = stage('فتحات السقف', lambda r=r: detect_openings(
            [segs[k] for k in SG.query(*r)], E, r), [])
        dw['columns'] = stage('الأعمدة', lambda r=r, dw=dw: detect_columns(
            E, [segs[k] for k in SG.query(*r)], r, dw['ax']), [])
        label_columns(dw['columns'], E, TG, r)
        dw['beams'] = stage('الجسور', lambda r=r, dw=dw: detect_beams(
            E, [segs[k] for k in SG.query(*r)], r, dw['ax'], dw['columns']), [])
        label_beams(dw['beams'], E, TG, r)
        dw['callouts'] = stage('تسليح البلاطة', lambda r=r: slab_callouts(E, TG, r), [])
        dw['sketch'] = _sketch([segs[k] for k in SG.query(*r)], E, r)
        for c in dw['columns']:
            ax_ = _snap(c['x'], dw['ax']['x'].values(), 0.9)
            ay_ = _snap(c['y'], dw['ax']['y'].values(), 0.9)
            c['ax'], c['ay'] = (ax_['name'] if ax_ else None), (ay_['name'] if ay_ else None)
        for op in dw['openings']:
            op['between'] = _between(op, dw['ax'])

    # ---- ٦) المباني ----
    merge = bool(opts.get('merge'))
    groups = _group_drawings(drawings, merge)
    # علامات الأعمدة بأسماء المحاور من كل مفاتيح الأعمدة بالملف: العمود عند 17×H
    # هو نفسه بكل لوحة تسمّي المحورين نفسيهما، ولو كانت بمبنى/نظام محاور آخر.
    key_names = {}
    for dw in drawings:
        if dw['kind'] == 'cols_key':
            for c in dw['columns']:
                if c.get('mark') and c.get('ax') and c.get('ay'):
                    key_names.setdefault((c['ax'], c['ay']), c['mark'])
    buildings = []
    for gi, grp in enumerate(groups):
        b = stage('تركيب مبنى', lambda g=grp, gi=gi: _assemble(
            gi, g, beam_scheds, beams_all, col_sched, materials, opts, warn, key_names, col_defs), None)
        if b:
            buildings.append(b)

    for dw in drawings:                          # إخراج مختصر
        for c in dw['columns']:
            c['x'], c['y'] = round(c['x'], 3), round(c['y'], 3)
        for s in dw['beams']:
            for k2 in ('c', 'a', 'b'):
                s[k2] = round(s[k2], 3)
        for op in dw['openings']:
            for k2 in ('x0', 'y0', 'x1', 'y1'):
                op[k2] = round(op[k2], 3)
        dw['ax'] = {o: sorted(({'name': a['name'], 'pos': round(a['pos'], 3), 'prime': a['prime'],
                                'from_line': a['from_line']} for a in dw['ax'][o].values()),
                              key=lambda a: a['pos']) for o in ('x', 'y')}
        dw['rect'] = [round(v, 2) for v in dw['rect']]
        dw['bub'] = [round(v, 2) for v in dw['bub']]

    same_bld = len(set(dw['building_name'] for dw in drawings if dw['building_name'])) == 1
    return dict(ok=bool(buildings), scale=scale, scale_src=src, angle=round(ang, 2),
                n_ents=len(E), drawings=drawings, buildings=buildings,
                schedules=dict(beams=beams_all, columns=col_sched,
                               beam_tables=[dict(id=i, x=round(bs['x'], 2), y=round(bs['y'], 2), beams=bs['beams'],
                                                 near=next((dw['id'] for dw in drawings if dw.get('beam_sched') == i), None))
                                            for i, bs in enumerate(beam_scheds)]),
                definitions=defs + user_defs, materials=materials, merged=merge,
                can_merge=(not merge and len(groups) > 1 and same_bld),
                warnings=warn, stages=stages, dictionary=K.dictionary())


def _between(op, ax):
    """اسم الفتحة بالمحاور: «I'→L' × 17→18»."""
    def rng(lo, hi, axes):
        a = [x for x in axes if lo - 0.4 <= x['pos'] <= hi + 0.4]
        a.sort(key=lambda x: x['pos'])
        return (a[0]['name'], a[-1]['name']) if a else None
    return dict(x=rng(op['x0'], op['x1'], ax['x'].values()), y=rng(op['y0'], op['y1'], ax['y'].values()))


def _group_drawings(drawings, merge):
    """الرسمات بمبانٍ: نظام المحاور نفسه (تشابه أسماء المحاور بالاتجاهين) = مبنى واحد.
    الدمج (باختيار المستخدم): يكفي اسم مشترك بكل اتجاه."""
    def names(dw, o):
        return set(dw['ax'][o].keys())
    groups = []
    for dw in sorted(drawings, key=lambda d: -(len(d['ax']['x']) * len(d['ax']['y']))):
        placed = False
        for g in groups:
            m = g[0]
            jx = len(names(dw, 'x') & names(m, 'x')) / float(len(names(dw, 'x') | names(m, 'x')) or 1)
            jy = len(names(dw, 'y') & names(m, 'y')) / float(len(names(dw, 'y') | names(m, 'y')) or 1)
            ok = (jx >= 0.6 and jy >= 0.6) if not merge else \
                 (names(dw, 'x') & names(m, 'x') and names(dw, 'y') & names(m, 'y'))
            if ok:
                g.append(dw)
                placed = True
                break
        if not placed:
            groups.append([dw])
    return groups


def _register(dw, master):
    """إزاحة الرسمة إلى إحداثيات الرسمة الرئيسية بأسماء المحاور المشتركة."""
    dx = [master['ax']['x'][n]['pos'] - a['pos'] for n, a in dw['ax']['x'].items() if n in master['ax']['x']]
    dy = [master['ax']['y'][n]['pos'] - a['pos'] for n, a in dw['ax']['y'].items() if n in master['ax']['y']]
    tx, ty = _med(dx), _med(dy)
    res = max([abs(v - tx) for v in dx] + [abs(v - ty) for v in dy] + [0.0])
    return tx, ty, res


def _assemble(gi, grp, beam_scheds, beams_all, col_sched, materials, opts, warn, key_names=None,
              col_defs=None):
    master = max(grp, key=lambda d: (d['kind'] == 'cols_key', len(d['ax']['x']) * len(d['ax']['y'])))
    # الشبكة الموحّدة = اتحاد محاور كل الرسمات بعد التسجيل
    grid = {'x': {}, 'y': {}}
    for dw in grp:
        tx, ty, res = _register(dw, master)
        dw['reg'] = dict(dx=round(tx, 3), dy=round(ty, 3), residual=round(res, 3))
        if res > 0.25:
            warn.append('الرسمة %d لا تنطبق على الشبكة بدقة (انحراف %.2f م) — راجع محاورها.' % (dw['id'] + 1, res))
        for o, t in (('x', tx), ('y', ty)):
            for n, a in dw['ax'][o].items():
                grid[o].setdefault(n, []).append(a['pos'] + t)
    gx = sorted(({'name': n, 'pos': _med(v), 'prime': n.endswith("'")} for n, v in grid['x'].items()),
                key=lambda a: a['pos'])
    gy = sorted(({'name': n, 'pos': _med(v), 'prime': n.endswith("'")} for n, v in grid['y'].items()),
                key=lambda a: a['pos'])
    ox, oy = gx[0]['pos'], gy[0]['pos']
    for a in gx:
        a['pos'] = round(a['pos'] - ox, 3)
    for a in gy:
        a['pos'] = round(a['pos'] - oy, 3)
    for i, a in enumerate(gx):
        a['next'] = round(gx[i + 1]['pos'] - a['pos'], 3) if i + 1 < len(gx) else None
    for i, a in enumerate(gy):
        a['next'] = round(gy[i + 1]['pos'] - a['pos'], 3) if i + 1 < len(gy) else None

    def T(dw, x, y):
        return (x + dw['reg']['dx'] - ox, y + dw['reg']['dy'] - oy)

    # ---- أعمدة مرجعية بعلاماتها من مفتاح الأعمدة ----
    key_cols = []
    for dw in grp:
        if dw['kind'] == 'cols_key':
            for c in dw['columns']:
                x, y = T(dw, c['x'], c['y'])
                key_cols.append(dict(c, x=x, y=y))

    by_floor = {}
    for dw in grp:
        fl = dw.get('floor')
        if dw['kind'] in ('slab_rft', 'beams_key') and fl:
            by_floor.setdefault(fl['key'], {})[dw['kind']] = dw
    if not by_floor and grp:                        # لوحات بلا عناوين طوابق: طابق واحد افتراضي
        by_floor['ground'] = {('slab_rft' if master['kind'] == 'slab_rft' else 'beams_key'): master}
        warn.append('ما لقيت أسماء طوابق بعناوين المبنى %d — عُرض طابقاً واحداً (تقدر تحدد الطابق لكل لوحة).' % (gi + 1))
    order = sorted(by_floor, key=lambda k: K.FLOOR_ORDER.get(k, 0))
    hmap = opts.get('floor_h') or {}
    level = 0.0
    floors = []
    for fk in order:
        sheets = by_floor[fk]
        sl, bk = sheets.get('slab_rft'), sheets.get('beams_key')
        src_b = bk or sl
        h = PL._safe_float(hmap.get(fk), 0.0) or 3.5
        # جسور الطابق
        sched = beam_scheds[src_b['beam_sched']]['beams'] if src_b and src_b.get('beam_sched') is not None else beams_all
        beams = []
        for s in (src_b['beams'] if src_b else []):
            mk = s.get('mark')
            rec = beams_all.get(mk) if mk and beams_all.get(mk, {}).get('user') else None
            rec = rec or (sched.get(mk) if mk else None)
            rec = rec or (beams_all.get(mk) if mk else None)
            if s['o'] == 'h':
                x1, y1 = T(src_b, s['a'], s['c'])
                x2, y2 = T(src_b, s['b'], s['c'])
            else:
                x1, y1 = T(src_b, s['c'], s['a'])
                x2, y2 = T(src_b, s['c'], s['b'])
            bw = rec['b'] if rec and rec.get('b') else s['w']
            bh = rec['h'] if rec and rec.get('h') else None
            guess = bh is None
            if guess:
                depths = [v['h'] for v in sched.values() if v.get('h')]
                bh = _med(depths, 600)
            beams.append(dict(x1=round(x1, 3), y1=round(y1, 3), x2=round(x2, 3), y2=round(y2, 3),
                              b=int(bw), h=int(bh), mark=mk, axis=s.get('axis'), o=s['o'],
                              span=round(abs(s['b'] - s['a']), 3), cant=s.get('cant', False),
                              rebar=_beam_rebar(rec), guess=guess, src=src_b['id']))
        # الأعمدة
        cand = []
        for dw in (bk, sl):
            if dw:
                for c in dw['columns']:
                    x, y = T(dw, c['x'], c['y'])
                    if not any(abs(x - q['x']) < 0.3 and abs(y - q['y']) < 0.3 for q in cand):
                        cand.append(dict(c, x=x, y=y, src=dw['id']))
        if not cand:
            cand = [dict(c, src=None) for c in key_cols]
        cols = []
        for c in cand:
            mk = c.get('mark')
            if not mk:
                near = [k for k in key_cols if abs(k['x'] - c['x']) < 0.5 and abs(k['y'] - c['y']) < 0.5]
                mk = near[0].get('mark') if near else None
            if not mk and key_names and c.get('ax') and c.get('ay'):
                mk = key_names.get((c['ax'], c['ay']))
            entry = (col_sched.get(mk) or {}) if mk else {}
            if mk and fk in entry and entry[fk] is None:
                continue                          # NOT PRESENT بهذا الطابق
            rb = entry.get(fk) if mk else None
            dfs = (col_defs or {}).get(mk) if mk else None
            if dfs:                               # تعريف المهندس/المستخدم يتقدّم على الرسم
                c = dict(c, b=dfs['b'], h=dfs['h'], shape=dfs.get('shape', c.get('shape', 'rect')))
            cols.append(dict(x=round(c['x'], 3), y=round(c['y'], 3), b=int(c['b']), h=int(c['h']),
                             shape=c.get('shape', 'rect'), mark=mk, ax=c.get('ax'), ay=c.get('ay'),
                             rebar=rb, how=c.get('how'), src=c.get('src')))
        # البلاطة
        sdw = sl or bk
        opens, calls = [], []
        for dw in (sl, bk):                      # علامات X من لوحة السقف ولوحة الجسور معاً
            if not dw:
                continue
            for op in dw['openings']:
                a = T(dw, op['x0'], op['y0'])
                b = T(dw, op['x1'], op['y1'])
                q = dict(x0=round(a[0], 3), y0=round(a[1], 3), x1=round(b[0], 3), y1=round(b[1], 3),
                         between=op.get('between'), src=dw['id'])
                if not any(abs(q['x0'] - o['x0']) < 0.4 and abs(q['y0'] - o['y0']) < 0.4 and
                           abs(q['x1'] - o['x1']) < 0.4 and abs(q['y1'] - o['y1']) < 0.4 for o in opens):
                    opens.append(q)
        if sdw:
            for c in sdw['callouts']:
                x, y = T(sdw, c['x'], c['y'])
                calls.append(dict(c, x=round(x, 3), y=round(y, 3)))
        loc_ax = {'x': {a['name']: dict(a) for a in gx}, 'y': {a['name']: dict(a) for a in gy}}
        loc_spans = []
        for bm in beams:
            if bm['o'] == 'h':
                loc_spans.append(dict(o='h', c=bm['y1'], a=min(bm['x1'], bm['x2']), b=max(bm['x1'], bm['x2'])))
            else:
                loc_spans.append(dict(o='v', c=bm['x1'], a=min(bm['y1'], bm['y2']), b=max(bm['y1'], bm['y2'])))
        rects = slab_panels(loc_ax, loc_spans, opens, calls)
        t = (sl or {}).get('thickness') or (bk or {}).get('thickness') or 200
        mesh = _slab_mesh(calls)
        floors.append(dict(key=fk, name=K.FLOOR_NAMES.get(fk, fk), level=round(level, 3), h=h,
                           columns=cols, beams=beams,
                           slab=dict(t=t, rects=[[round(v, 3) for v in r] for r in rects],
                                     openings=opens, callouts=calls, mesh=mesh,
                                     t_from_title=bool((sl or {}).get('thickness'))),
                           sheets=dict(slab=sl['id'] if sl else None, beams=bk['id'] if bk else None)))
        level += h
    footings = _footings(floors, materials, opts, warn)
    ext = [gx[-1]['pos'] if gx else 0, gy[-1]['pos'] if gy else 0]
    names = sorted(set(dw['building_name'] for dw in grp if dw['building_name']))
    return dict(id=gi, name=(names[0] if names else 'مبنى %d' % (gi + 1)),
                axes_sig='%s→%s × %s→%s' % (gx[0]['name'], gx[-1]['name'], gy[0]['name'], gy[-1]['name']),
                grid=dict(x=gx, y=gy), size=[round(v, 2) for v in ext],
                drawings=[dw['id'] for dw in grp], floors=floors, footings=footings,
                height=round(level, 3))


def _beam_rebar(rec):
    if not rec:
        return None
    return dict(bot=rec.get('bot'), top=rec.get('top'), stir=rec.get('stir'), side=rec.get('side'))


def _slab_mesh(calls):
    """الشبكة الغالبة: سفلي وعلوي بقطرها وتباعدها (أكثر نداء تكراراً لكل موضع)."""
    out = {}
    for pos in ('B', 'T'):
        cnt = {}
        for c in calls:
            p = c.get('pos') or 'B'
            if p == pos or p == 'B&T':
                k = (c['d'], c['s'] or 200)
                cnt[k] = cnt.get(k, 0) + 1
        if cnt:
            (d, s), n = max(cnt.items(), key=lambda kv: kv[1])
            out['bot' if pos == 'B' else 'top'] = dict(d=d, s=s, n=n)
    return out


def _footings(floors, materials, opts, warn):
    """أساس منفرد لكل عمود بالطابق الأسفل: حمله من المساحة الرافدة بكل طابق فوقه
    (أخذ عينات 0.75 م على ألواح البلاطة ونسبة كل عينة لأقرب عمود)، ثم تصميمه
    بـ`engine.footing_module` — ACI 318-19. مُعلَّم «مصمَّم بالكود — ليس من الملف»."""
    if not floors or not floors[0]['columns']:
        return []
    qa = PL._safe_float(opts.get('qa'), 150.0) or 150.0
    fc = PL._safe_float(opts.get('fc'), 0.0) or materials.get('fc') or 28.0
    fy = PL._safe_float(opts.get('fy'), 0.0) or materials.get('fy') or 420.0
    LL = PL._safe_float(opts.get('LL'), 0.0) or 3.0           # إداري kN/m²
    SDL = PL._safe_float(opts.get('SDL'), 0.0) or 2.5         # تشطيب + قواطع
    base = floors[0]['columns']
    PD = [0.0] * len(base)
    PLv = [0.0] * len(base)
    step = 0.75
    for f in floors:
        cols = f['columns']
        if not cols:
            continue
        # مطابقة أعمدة الطابق بأعمدة الأساس (نفس الموقع)
        idx = []
        for c in cols:
            j = min(range(len(base)), key=lambda k: math.hypot(base[k]['x'] - c['x'], base[k]['y'] - c['y']))
            idx.append(j if math.hypot(base[j]['x'] - c['x'], base[j]['y'] - c['y']) < 0.6 else None)
        area = [0.0] * len(cols)
        for r in f['slab']['rects']:
            nx = max(1, int((r[2] - r[0]) / step))
            ny = max(1, int((r[3] - r[1]) / step))
            da = (r[2] - r[0]) * (r[3] - r[1]) / float(nx * ny)
            for i in range(nx):
                for j in range(ny):
                    px = r[0] + (i + 0.5) * (r[2] - r[0]) / nx
                    py = r[1] + (j + 0.5) * (r[3] - r[1]) / ny
                    k = min(range(len(cols)), key=lambda q: (cols[q]['x'] - px) ** 2 + (cols[q]['y'] - py) ** 2)
                    area[k] += da
        t = f['slab']['t'] / 1000.0
        slab_area = sum(area) or 1.0
        beam_w = sum(b['b'] / 1000.0 * max(b['h'] / 1000.0 - t, 0) * 25.0 *
                     math.hypot(b['x2'] - b['x1'], b['y2'] - b['y1']) for b in f['beams'])
        wD = t * 25.0 + SDL + beam_w / slab_area
        for q, c in enumerate(cols):
            j = idx[q]
            if j is None:
                continue
            PD[j] += area[q] * wD + c['b'] / 1000.0 * c['h'] / 1000.0 * f['h'] * 25.0
            PLv[j] += area[q] * LL
    out = []
    for j, c in enumerate(base):
        if PD[j] <= 0:
            continue
        try:
            r = footing_module(dict(PD=PD[j], PL=PLv[j], qa=qa, fc=fc, fy=fy,
                                    cx=max(c['b'], 200), cy=max(c['h'], 200), Df=1.5))
        except Exception as ex:
            warn.append('تعذّر تصميم أساس العمود %s: %s' % (c.get('mark') or j + 1, ex))
            continue
        out.append(dict(x=c['x'], y=c['y'], col=c.get('mark'), B=r['B'], h=r['h'], PD=round(PD[j], 1),
                        PL=round(PLv[j], 1), Pu=round(r['Pu'], 1), bars=r['bars_label'], db=r['bar_db'],
                        s=r['spacing'], ok=r['ok'], designed=True))
    return out
