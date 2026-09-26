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
        # الأولى: اتجاه محاور الفئة نفسها المقروءة من خطوطها (أرقام أفقية ⇒ الباقي أفقي)
        seen = [t[0] for bb in allg for t in det.get(bb['name'], ()) if t[4]]
        if seen:
            o = 'x' if seen.count('x') * 2 >= len(seen) else 'y'
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


# ------------------------------------------------------------------ لوحات بلا فقاعات
_SKIP_LAYER = re.compile(r'(hatch|^dim|dimension|text|txt|frame|border|title|numbers|جداول|print|defpoints)', re.I)
_WALL_LAYER = re.compile(r'(wall|جدار|جدران|حائط|block|brick|بلوك)', re.I)
_TABLE_TITLE = re.compile(r'^\s*(جدول|المحتويات|contents|schedule|legend|مفتاح\s*الرموز)', re.I)


def _components(E, segs, cell=0.8):
    """عناقيد الرسم المتصلة (شبكة إشغال 8-جوار) — كل رسمة بالورقة عنقود أو أكثر."""
    occ = set()
    for s in segs:
        e = E[s[4]]
        if _SKIP_LAYER.search(e.get('l') or '') or e.get('hatch'):
            continue
        L = math.hypot(s[2] - s[0], s[3] - s[1])
        if L > 60:
            continue
        n = max(1, int(L / cell))
        for i in range(n + 1):
            x = s[0] + (s[2] - s[0]) * i / n
            y = s[1] + (s[3] - s[1]) * i / n
            occ.add((int(math.floor(x / cell)), int(math.floor(y / cell))))
    seen, comps = set(), []
    for c0 in occ:
        if c0 in seen:
            continue
        stack, cells = [c0], []
        seen.add(c0)
        while stack:
            c = stack.pop()
            cells.append(c)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (c[0] + dx, c[1] + dy)
                    if q in occ and q not in seen:
                        seen.add(q)
                        stack.append(q)
        xs = [c[0] for c in cells]
        ys = [c[1] for c in cells]
        comps.append(dict(x0=min(xs) * cell, y0=min(ys) * cell, x1=(max(xs) + 1) * cell,
                          y1=(max(ys) + 1) * cell, n=len(cells)))
    return comps


def _overlap(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    sa = max((a[2] - a[0]) * (a[3] - a[1]), 1e-6)
    sb = max((b[2] - b[0]) * (b[3] - b[1]), 1e-6)
    return ix * iy / min(sa, sb)


def titled_drawing(t, comps, taken):
    """الرسمة التي فوق عنوانها مباشرة (العنوان يُكتب تحت الرسمة): أكبر عنقود يقع
    فوقه ويغطي موضعه أفقياً، ثم تُضم إليه قطعه المتناثرة ضمن حدوده الموسّعة."""
    tx, ty, h = t['p'][0], t['p'][1], max(t['p'][2], 0.1)
    cand = [c for c in comps if c['x0'] - 2.5 <= tx <= c['x1'] + 2.5
            and ty - 1.5 * h <= c['y0'] <= ty + 9.0 and c['n'] >= 6]
    if not cand:
        return None
    main = max(cand, key=lambda c: c['n'])
    r = [main['x0'], main['y0'], main['x1'], main['y1']]
    grow = True
    while grow:
        grow = False
        for c in comps:
            cr = [c['x0'], c['y0'], c['x1'], c['y1']]
            if c['y0'] < ty - 1.5 * h:
                continue
            inside = cr[0] >= r[0] and cr[2] <= r[2] and cr[1] >= r[1] and cr[3] <= r[3]
            if not inside and cr[0] >= r[0] - 1.2 and cr[2] <= r[2] + 1.2 and cr[1] >= r[1] - 1.2 and cr[3] <= r[3] + 1.2:
                r = [min(r[0], cr[0]), min(r[1], cr[1]), max(r[2], cr[2]), max(r[3], cr[3])]
                grow = True
    if any(_overlap(r, q) > 0.45 for q in taken):
        return None
    return r


def detect_walls(E, segs, rect):
    """الجدران: خطّان متوازيان بفاصل 7–50 سم على طبقات الجدران (مسقط معماري)."""
    x0, y0, x1, y1 = rect
    lines = {'h': [], 'v': []}
    for s in segs:
        e = E[s[4]]
        if not _WALL_LAYER.search(e.get('l') or '') or e.get('hatch'):
            continue
        sx0, sy0, sx1, sy1 = s[:4]
        L = math.hypot(sx1 - sx0, sy1 - sy0)
        if L < 0.3:
            continue
        mx, my = (sx0 + sx1) / 2, (sy0 + sy1) / 2
        if not (x0 <= mx <= x1 and y0 <= my <= y1):
            continue
        if abs(sy1 - sy0) <= 0.01 * L:
            lines['h'].append((min(sx0, sx1), max(sx0, sx1), (sy0 + sy1) / 2))
        elif abs(sx1 - sx0) <= 0.01 * L:
            lines['v'].append((min(sy0, sy1), max(sy0, sy1), (sx0 + sx1) / 2))
    out = []
    for o in ('h', 'v'):
        L = sorted(lines[o], key=lambda t: t[2])
        used = set()
        pieces = []
        for i, a in enumerate(L):
            for j in range(i + 1, len(L)):
                b = L[j]
                gap = b[2] - a[2]
                if gap > 0.5:
                    break
                if gap < 0.07 or j in used:
                    continue
                ov0, ov1 = max(a[0], b[0]), min(a[1], b[1])
                if ov1 - ov0 >= 0.3:
                    pieces.append(((a[2] + b[2]) / 2, ov0, ov1, gap))
                    used.add(j)
                    break
        pieces.sort(key=lambda p: (round(p[0], 2), p[1]))
        mine = []
        for c, a0, a1, t in pieces:
            m = mine[-1] if mine else None
            if m and abs(m['c'] - c) <= 0.04 and a0 <= m['b'] + 0.05:
                m['b'] = max(m['b'], a1)
                continue
            mine.append(dict(o=o, c=c, a=a0, b=a1, t=round(t * 1000)))
        out += mine
    return out


def _reg_by_cols(dw, master):
    """إزاحة تطابق أكبر عدد من الأعمدة (±20 سم) — لمخطط بلا محاور مشتركة."""
    A = [(c['x'], c['y']) for c in master.get('columns', [])]
    Bc = [(c['x'], c['y']) for c in dw.get('columns', [])]
    if len(A) < 3 or len(Bc) < 3:
        return None
    cell = 0.2
    H = {}
    for x, y in A:
        H.setdefault((round(x / cell), round(y / cell)), []).append((x, y))

    def hits(tx, ty):
        n, err = 0, []
        for x, y in Bc:
            X, Y = x + tx, y + ty
            k = (round(X / cell), round(Y / cell))
            best = None
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for a in H.get((k[0] + dx, k[1] + dy), ()):
                        d = math.hypot(a[0] - X, a[1] - Y)
                        if d <= 0.2 and (best is None or d < best):
                            best = d
            if best is not None:
                n += 1
                err.append(best)
        return n, (max(err) if err else 9.9)
    best = (0, None)
    for a in A[:80]:
        for b in Bc[:80]:
            n, e = hits(a[0] - b[0], a[1] - b[1])
            if n > best[0]:
                best = (n, (a[0] - b[0], a[1] - b[1], e))
    if best[0] >= 3:
        return best[1] + (best[0],)
    return None


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
        dw['_t'] = best[1] if best else None
        _title_info(dw, best[1] if best else None, opts)

    # لوحات بلا فقاعات محاور (مساقط معمارية · واجهات · مقاطع · تفاصيل): كل عنوان
    # لوحة لم تأخذه رسمة بمحاور → الرسمة المتصلة فوقه مباشرة.
    used_t = set(id(dw['_t']) for dw in drawings if dw.get('_t'))
    comps = stage('عناقيد الرسم', lambda: _components(E, segs), [])
    for t in sorted(titles, key=lambda t: (-t['p'][1], t['p'][0])):
        if id(t) in used_t:
            continue
        k = K.sheet_kind(t.get('s'))
        if k in ('beam_sched', 'col_sched', 'foot_sched', 'slab_sched') or _TABLE_TITLE.search(K.clean_text(t.get('s'))):
            continue
        r = titled_drawing(t, comps, [dw['rect'] for dw in drawings])
        if not r:
            continue
        dw = dict(id=len(drawings), ax={'x': {}, 'y': {}}, rect=[r[0] - 0.3, r[1] - 0.3, r[2] + 0.3, r[3] + 0.3],
                  bub=list(r), n_bubbles=0, _t=t)
        _title_info(dw, t, opts)
        drawings.append(dw)
        used_t.add(id(t))

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
    circles = [i for i, e in enumerate(E) if e['t'] == 'C']
    dims_i = [i for i, e in enumerate(E) if e['t'] == 'D']
    sec_letters = set()
    for dw in drawings:
        if dw['kind'] == 'section':
            for m in _SEC_RX.finditer(dw.get('title') or ''):
                sec_letters.add(m.group(1))
            dw['letter'] = next(iter(m.group(1) for m in _SEC_RX.finditer(dw.get('title') or '')), None)
    for dw in drawings:
        if dw['kind'] in ('elev', 'section'):
            dw['levels'] = stage('المناسيب', lambda dw=dw: read_levels(
                dw, E, TG, [segs[k] for k in SG.query(*dw['rect'])], circles, dims_i), None)
        elif dw['kind'] not in VIEW_KINDS and sec_letters:
            dw['cuts'] = stage('خطوط القطع', lambda dw=dw: section_cuts(dw, E, TG, sec_letters, bubs), {})
    for dw in drawings:
        r = dw['rect']
        dw['openings'], dw['columns'], dw['beams'], dw['callouts'], dw['walls'] = [], [], [], [], []
        view_only = dw['kind'] in ('elev', 'section', 'detail', 'site')
        if not view_only:
            dw['openings'] = stage('فتحات السقف', lambda r=r: detect_openings(
                [segs[k] for k in SG.query(*r)], E, r), [])
            dw['columns'] = stage('الأعمدة', lambda r=r, dw=dw: detect_columns(
                E, [segs[k] for k in SG.query(*r)], r, dw['ax']), [])
            if dw['kind'] == 'arch':
                dw['columns'] = _arch_columns(dw['columns'])
            label_columns(dw['columns'], E, TG, r)
            if dw['kind'] != 'arch':               # المسقط المعماري: خطوط متوازية = جدران لا جسور
                dw['beams'] = stage('الجسور', lambda r=r, dw=dw: detect_beams(
                    E, [segs[k] for k in SG.query(*r)], r, dw['ax'], dw['columns']), [])
                label_beams(dw['beams'], E, TG, r)
            dw['callouts'] = stage('تسليح البلاطة', lambda r=r: slab_callouts(E, TG, r), [])
            dw['walls'] = stage('الجدران', lambda r=r: detect_walls(E, [segs[k] for k in SG.query(*r)], r), [])
        dw['sketch'] = _sketch([segs[k] for k in SG.query(*r)], E, r, cap=4000 if view_only else 2500)
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
        dw.pop('_t', None)
        for w in dw.get('walls', []):
            for k2 in ('c', 'a', 'b'):
                w[k2] = round(w[k2], 3)

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


# ------------------------------------------------------------------ المناسيب (واجهات · مقاطع)
_LEVEL_RX = re.compile(r'^\s*(?:(?:F\.?F\.?L|S\.?S\.?L|T\.?O\.?S|EL|LEVEL|LVL|منسوب)\.?\s*[:=]?\s*)?'
                       r'([+\-±]|%%[Pp])?\s*(\d{1,2}[.,]\d{2,3}|\d{1,4})\s*(?:m|م)?\s*$', re.I)
_SIGN_TXT = ('+', '-', '±', '%%P', '%%p', '−')


def _med_f(v):
    v = sorted(v)
    n = len(v)
    return (v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2.0) if n else None


def read_levels(dw, E, TG, segs, circles, dims=()):
    """قراءة لوحة واجهة/مقطع كما يقرؤها المهندس:
    - علامات المنسوب: رقم (±0.00 · +3.50 · 420 سم) فوق خط أفقي قصير ومثلث رأسه على المنسوب،
      وقد تُكتب الإشارة نصاً مستقلاً بجانب الرقم.
    - معايرة الرسم: y = y0 + k·المنسوب بمطابقة العلامات (العلامة المخالفة للرسم تُعلَّم تعارضاً).
    - البلاطات بالمقطع: خطّان أفقيان طويلان متوازيان بينهما 8–40 سم ولا خط بينهما، والتشطيب فوقها.
    - فقاعات المحاور فوق الواجهة: لمطابقة الواجهة أفقياً مع محاور المسقط."""
    x0, y0, x1, y1 = dw['rect']
    inside = lambda x, y: x0 <= x <= x1 and y0 <= y <= y1
    texts = [E[j] for j in TG.query(x0, y0, x1, y1) if inside(E[j]['p'][0], E[j]['p'][1])]
    signs = [t for t in texts if (t.get('s') or '').strip() in _SIGN_TXT]
    toks = []
    for t in texts:
        rot = (t.get('rot') or 0) % 360
        if min(rot, 360 - rot) > 1:
            continue
        m = _LEVEL_RX.match(PL.clean_text(t.get('s') or '') or '')
        if m:
            toks.append((t, m.group(1), m.group(2)))
    ints = [int(n) for _, _, n in toks if n.isdigit()]
    cm = bool(ints) and max(ints) >= 30              # أعداد صحيحة كبيرة = سنتمتر (420 = +4.20)
    hs = [sg for sg in segs if abs(sg[3] - sg[1]) < 0.005 and abs(sg[2] - sg[0]) > 0.02]
    marks = []
    for t, sg, n in toks:
        tx, ty = t['p'][0], t['p'][1]
        line = [q for q in hs if 0.25 <= abs(q[2] - q[0]) <= 4.0 and ty - 0.45 <= q[1] <= ty + 0.02
                and min(q[0], q[2]) <= tx + 0.3 and max(q[0], q[2]) >= tx]
        if not sg:
            near = [q['s'].strip() for q in signs
                    if -1.0 <= q['p'][0] - tx <= 1.5 and -0.2 <= q['p'][1] - ty <= 0.25]
            if '+' in near and ('-' in near or '−' in near):
                sg = '±'
            elif near:
                sg = near[0]
        if not line and not sg:
            continue                                   # رقم عادي (بُعد/مقاس) لا علامة منسوب
        v = float(n.replace(',', '.'))
        if '.' not in n and ',' not in n and cm:
            v /= 100.0
        if sg in ('-', '−'):
            v = -v
        ly = ty
        if line:
            q = max(line, key=lambda q: q[1])
            lx0, lx1, ly = min(q[0], q[2]) - 0.2, max(q[0], q[2]) + 0.2, q[1]
            tri = [p for g in segs if abs(g[2] - g[0]) + abs(g[3] - g[1]) < 0.9
                   for p in ((g[0], g[1]), (g[2], g[3]))
                   if lx0 <= p[0] <= lx1 and ly - 0.4 <= p[1] <= ly + 0.01]
            if tri:
                ly = min(p[1] for p in tri)            # رأس المثلث = المنسوب نفسه
        if not any(abs(m['v'] - v) < 1e-6 and abs(m['y'] - ly) < 0.05 for m in marks):
            marks.append(dict(v=round(v, 3), y=round(ly, 3), x=round(tx, 3), exact=bool(line)))
    vd = set()
    for i in dims:                                     # الأبعاد الرأسية المكتوبة (للتحقق من الارتفاعات)
        q = E[i]['p']
        if len(q) >= 4 and abs(q[2] - q[0]) < 0.01 and inside(q[0], q[1]):
            vd.add(round(abs(q[3] - q[1]), 2))
    out = dict(marks=marks, cm=cm, k=None, y0=None, slabs=[], axes=[], ground_y=None, vdims=sorted(vd))
    # ---- المعايرة ----
    if len({m['v'] for m in marks}) >= 2:
        ks = [(a['y'] - b['y']) / (a['v'] - b['v']) for i, a in enumerate(marks) for b in marks[i + 1:]
              if abs(a['v'] - b['v']) >= 0.5]
        k = _med_f(ks)
        if k and 0.2 <= k <= 5.0:
            y00 = _med_f([m['y'] - k * m['v'] for m in marks])
            ok = [m for m in marks if abs(m['y'] - (y00 + k * m['v'])) <= 0.05 * k]
            if len(ok) >= 2:
                mv = sum(m['v'] for m in ok) / len(ok)
                my = sum(m['y'] for m in ok) / len(ok)
                den = sum((m['v'] - mv) ** 2 for m in ok)
                if den > 1e-9:
                    k = sum((m['v'] - mv) * (m['y'] - my) for m in ok) / den
                    y00 = my - k * mv
                for m in marks:
                    m['ok'] = abs(m['y'] - (y00 + k * m['v'])) <= 0.05 * k
                    m['drawn'] = round((m['y'] - y00) / k, 3)
                out['k'], out['y0'] = round(k, 5), round(y00, 4)
    # ---- خط الأرض + البلاطات ----
    inr = [q for q in hs if inside(q[0], q[1]) and inside(q[2], q[3])]
    if inr:
        wmax = max(abs(q[2] - q[0]) for q in inr)
        longs = sorted([q for q in inr if abs(q[2] - q[0]) >= max(2.0, 0.4 * wmax)], key=lambda q: q[1])
        g = [q for q in inr if abs(q[2] - q[0]) >= 0.4 * wmax]
        out['ground_y'] = round(min(q[1] for q in g), 4) if g else None

        def ov(a, b):
            return min(max(a[0], a[2]), max(b[0], b[2])) - max(min(a[0], a[2]), min(b[0], b[2]))
        slabs = []
        for i, a in enumerate(longs):
            for b in longs[i + 1:]:
                d = b[1] - a[1]
                if d > 0.40:
                    break
                if d < 0.08:
                    continue
                o = ov(a, b)
                if o < 0.6 * min(abs(a[2] - a[0]), abs(b[2] - b[0])):
                    continue
                if any(a[1] + 0.004 < c[1] < b[1] - 0.004 and ov(c, a) > 0.3 * o for c in longs):
                    continue
                fin = [c[1] - b[1] for c in inr if b[1] + 0.005 < c[1] <= b[1] + 0.2 and ov(c, b) >= 0.5 * o]
                slabs.append(dict(top=b[1], t=round(d, 3), L=round(o, 2), fin=round(max(fin), 3) if fin else 0.0))
        # البلاطة الإنشائية فوق طبقة النظافة/الفرشة: من كل مجموعة متقاربة (40 سم) تبقى العليا
        slabs.sort(key=lambda q: -q['top'])
        keep = []
        for q in slabs:
            if not any(0 < k2['top'] - q['top'] <= 0.4 for k2 in keep):
                keep.append(q)
        for q in keep:
            q['level'] = round((q['top'] - out['y0']) / out['k'], 3) if out['k'] else None
        out['slabs'] = sorted(keep, key=lambda q: q['top'])
    # ---- فقاعات المحاور (للمطابقة الأفقية) ----
    for i in circles:
        cx, cy, r = E[i]['p']
        if not (inside(cx, cy) and 0.1 <= r <= 1.5):
            continue
        for j in TG.query(cx - 1.3 * r, cy - 1.3 * r, cx + 1.3 * r, cy + 1.3 * r):
            lab = K.axis_label(E[j].get('s'))
            if lab and math.hypot(E[j]['p'][0] - cx, E[j]['p'][1] - cy) <= 1.25 * r:
                if not any(a['name'] == lab['name'] for a in out['axes']):
                    out['axes'].append(dict(name=lab['name'], x=round(cx, 3), y=round(cy, 3)))
                break
    return out


_SEC_RX = re.compile(r'(?<![A-Za-z])([A-Z])\s*[-–]\s*\1(?![A-Za-z])')


def section_cuts(dw, E, TG, letters, bubs):
    """خط القطع بالمسقط: الحرف نفسه (A) على جانبي المسقط خارج فقاعات المحاور."""
    if not letters:
        return {}
    x0, y0, x1, y1 = dw['rect']
    W, H = x1 - x0, y1 - y0
    pts = {}
    for j in TG.query(x0 - 3, y0 - 3, x1 + 3, y1 + 3):
        s = (E[j].get('s') or '').strip()
        if s not in letters:
            continue
        x, y = E[j]['p'][0], E[j]['p'][1]
        if any(math.hypot(x - b['x'], y - b['y']) <= 1.4 * b['r'] for b in bubs):
            continue
        pts.setdefault(s, []).append((x, y))
    cuts = {}
    for L, P in pts.items():
        best = None
        for i, a in enumerate(P):
            for b in P[i + 1:]:
                if abs(a[1] - b[1]) <= 1.0 and abs(a[0] - b[0]) >= 0.5 * W:
                    c = dict(o='h', c=round((a[1] + b[1]) / 2, 3), span=abs(a[0] - b[0]))
                elif abs(a[0] - b[0]) <= 1.0 and abs(a[1] - b[1]) >= 0.5 * H:
                    c = dict(o='v', c=round((a[0] + b[0]) / 2, 3), span=abs(a[1] - b[1]))
                else:
                    continue
                if best is None or c['span'] > best['span']:
                    best = c
        if best:
            cuts[L] = best
    return cuts


def _measure_levels(views, order, g0):
    """مناسيب الطوابق من الواجهات والمقاطع: سلسلة منسوب لكل طابق + سطح الأخير، يختارها
    كما يختارها المهندس: ارتفاعات 2.6–6.0 م، أكثرها انتظاماً، ومفضَّلٌ المنسوب المؤيَّد ببلاطة
    مرسومة بالمقطع على علامة نصية فقط. الطوابق تحت الأرض إن لم تُقَس تبقى افتراضية."""
    cand = []

    def add(v, kind, src):
        for c in cand:
            if abs(c['v'] - v) <= 0.03:
                c['sup'].add(kind)
                c['src'].add(src)
                return
        cand.append(dict(v=v, sup={kind}, src={src}))
    conflicts, slabs = [], []
    for v in views:
        L = v.get('levels') or {}
        if not L.get('k'):
            continue
        for m in L['marks']:
            if m.get('ok'):
                add(m['v'], 'mark', v['id'])
            elif m.get('drawn') is not None:
                conflicts.append(dict(v=m['v'], drawn=m['drawn'], src=v['id']))
        if v['kind'] == 'section':
            for q in L['slabs']:
                if q.get('level') is not None:
                    add(q['level'], 'slab', v['id'])
                    slabs.append(dict(q, src=v['id']))
    if len(cand) < 2:
        return None
    cand.sort(key=lambda c: c['v'])
    if len(cand) > 16:                                      # حدّ للتوافيق — الأقوى دعماً
        cand = sorted(sorted(cand, key=lambda c: -len(c['sup']))[:16], key=lambda c: c['v'])
    import itertools

    def best_chain(n, gi):
        best = None
        for ch in itertools.combinations(cand, n):
            vs = [c['v'] for c in ch]
            d = [b - a for a, b in zip(vs, vs[1:])]
            if not d or min(d) < 2.6 or max(d) > 6.0:
                continue
            if gi is not None and not (-0.3 <= vs[gi] <= 1.8):
                continue
            mu = sum(d) / len(d)
            sc = math.sqrt(sum((x - mu) ** 2 for x in d) / len(d)) + \
                0.25 * sum(1 for c in ch if 'slab' not in c['sup'])
            if best is None or sc < best[0]:
                best = (sc, ch)
        return best
    n = len(order) + 1
    gi = g0 if any(K.FLOOR_ORDER.get(k, 0) >= 0 for k in order) else None
    b = best_chain(n, gi)
    first = 0
    if not b and gi:
        b = best_chain(n - gi, 0)                           # فوق الأرض فقط، السرداب افتراضي
        first = gi
    if not b:
        return None
    ch = b[1]
    vs = [c['v'] for c in ch]
    roof = vs[-1]
    extra = [c['v'] for c in cand if c['v'] > roof + 0.3]
    mids = [c['v'] for c in cand if vs[0] < c['v'] < roof and all(abs(c['v'] - x) > 0.03 for x in vs)]
    below = [c['v'] for c in cand if c['v'] < vs[0] - 0.03]
    on = [q for q in slabs if any(abs(q['level'] - x) <= 0.03 for x in vs)]
    tvals = [round(q['t'] * 1000 / 10.0) * 10 for q in on]
    t = max(set(tvals), key=tvals.count) if tvals else None
    fin = [q['fin'] for q in on if q.get('fin')]
    ngl = any(abs(c['v']) <= 0.005 for c in cand)
    if ngl and abs(vs[min(g0, len(vs) - 1)] if first == 0 else vs[0]) > 0.005:
        mids = [x for x in mids if abs(x) > 0.005]          # ±0.00 = الأرض الطبيعية لا بسطة
    vd = set()
    for v in views:
        if v['kind'] == 'section':
            vd |= set((v.get('levels') or {}).get('vdims') or [])
    checks = []
    for h in [round(b2 - a, 3) for a, b2 in zip(vs, vs[1:])]:
        clear = round(h - (t or 0) / 1000.0, 2) if t else None
        checks.append(dict(h=h, clear=clear, h_dim=round(h, 2) in vd,
                           clear_dim=bool(clear) and clear in vd))
    return dict(chain=[round(x, 3) for x in vs], first=first, heights=[round(b2 - a, 3) for a, b2 in zip(vs, vs[1:])],
                src=sorted(set().union(*[c['src'] for c in ch])), from_slab=[('slab' in c['sup']) for c in ch],
                extra=extra, mids=mids, below=below, conflicts=conflicts, t=t,
                fin=round(_med_f(fin) * 1000) if fin else None, ngl=ngl, checks=checks)


def _view_fit(v, gx, gy, box, cuts):
    """تحويل رسمة الواجهة/المقطع إلى المجسم بدقة: أفقياً من فقاعات محاورها مطابَقةً بأسماء
    محاور المسقط (u = s·x + b)، وعمودياً من معايرة علامات المنسوب (z = (y − y0)/k)،
    والعمق: وجه المبنى حسب الجهة، أو خط القطع المرسوم بالمسقط للمقطع."""
    L = v.get('levels') or {}
    gxd = {a['name']: a['pos'] for a in gx}
    gyd = {a['name']: a['pos'] for a in gy}
    ax = L.get('axes') or []
    mx = [(a['x'], gxd[a['name']]) for a in ax if a['name'] in gxd]
    my = [(a['x'], gyd[a['name']]) for a in ax if a['name'] in gyd]
    along, P = ('x', mx) if len(mx) >= len(my) else ('y', my)
    if v.get('view') in ('S', 'N') and len(mx) >= 2:
        along, P = 'x', mx
    elif v.get('view') in ('E', 'W') and len(my) >= 2:
        along, P = 'y', my
    if len(P) < 2:
        return None
    mxv = sum(p[0] for p in P) / len(P)
    mu = sum(p[1] for p in P) / len(P)
    den = sum((p[0] - mxv) ** 2 for p in P)
    if den < 1e-9:
        return None
    sl = sum((p[0] - mxv) * (p[1] - mu) for p in P) / den
    b = mu - sl * mxv
    res = max(abs(sl * p[0] + b - p[1]) for p in P)
    if L.get('k'):
        y0, k, vhow = L['y0'], L['k'], 'levels'
    elif L.get('ground_y') is not None:
        y0, k, vhow = L['ground_y'], abs(sl), 'ground'
    else:
        return None
    X0, Y0, X1, Y1 = box
    face, fhow = None, 'face'
    if v['kind'] == 'section':
        c = cuts.get(v.get('letter')) if v.get('letter') else None
        if c and ((c['o'] == 'h') == (along == 'x')):
            face, fhow = c['c'], 'cut'
        else:
            face, fhow = ((Y0 + Y1) / 2 if along == 'x' else (X0 + X1) / 2), 'center'
    else:
        vw = v.get('view')
        if along == 'x':
            face = Y1 + 0.12 if vw == 'N' else Y0 - 0.12
        else:
            face = X0 - 0.12 if vw == 'W' else X1 + 0.12
    return dict(along=along, s=round(sl, 5), b=round(b, 4), y0=y0, k=k, face=round(face, 3),
                res=round(res, 3), vhow=vhow, fhow=fhow, n_axes=len(P))


def _arch_columns(cols):
    """المسقط المعماري يرسم أعمدته بمقاس موحّد تقريباً: المقاس الغالب (≥4 أعمدة) هو العمود،
    وما سواه (مربعات درج/أثاث صغيرة، أو خطّا جدار) يُستبعد، ثم يُزال المكرّر المتقارب."""
    if len(cols) < 4:
        return cols
    key = lambda c: (int(round(min(c['b'], c['h']) / 50.0)), int(round(max(c['b'], c['h']) / 50.0)))
    cnt = {}
    for c in cols:
        if c.get('how') in ('block', 'outline'):
            cnt[key(c)] = cnt.get(key(c), 0) + 1
    if not cnt:
        return cols
    mode, n = max(cnt.items(), key=lambda kv: kv[1])
    if n < 4 or n * 2 < len(cols) * 0.8:
        return cols
    ok = lambda c: (c.get('how') in ('block', 'outline')
                    and abs(key(c)[0] - mode[0]) <= 1 and abs(key(c)[1] - mode[1]) <= 1)
    keep = []
    for c in sorted(cols, key=lambda c: (key(c) != mode, c.get('how') != 'outline')):
        if not ok(c) or any(math.hypot(c['x'] - k['x'], c['y'] - k['y']) < 0.7 for k in keep):
            continue
        keep.append(c)
    return keep


def _title_info(dw, t, opts):
    info = K.parse_title(t.get('s')) if t else dict(text=None, kind=None, floor=None,
                                                    thickness=None, scale=None, building=None)
    ov = (opts.get('drawings') or {}).get(str(dw['id'])) or {}
    if ov.get('kind'):
        info['kind'] = ov['kind']
    if ov.get('floor') and ov['floor'] in K.FLOOR_ORDER:
        info['floor'] = dict(key=ov['floor'], order=K.FLOOR_ORDER[ov['floor']],
                             name=K.FLOOR_NAMES[ov['floor']], roof_of=True)
    txt = info['text'] or ''
    view = None
    if info['kind'] in ('elev', 'section'):
        for key, rx in (('S', r'south|جنوب'), ('N', r'north|شمال'), ('E', r'east|شرق'), ('W', r'west|غرب')):
            if re.search(rx, txt, re.I):
                view = key
                break
    if info['kind'] in ('detail', 'site') and not ov.get('floor'):
        info['floor'] = None        # «TYPICAL DETAIL» ليست طابقاً متكرراً
    dw.update(title=info['text'], kind=info['kind'], kind_name=K.SHEET_NAMES.get(info['kind']),
              floor=info['floor'], thickness=info['thickness'], scale_note=info['scale'],
              building_name=info['building'], title_trusted=bool(t), view=view)


def _between(op, ax):
    """اسم الفتحة بالمحاور: «I'→L' × 17→18»."""
    def rng(lo, hi, axes):
        a = [x for x in axes if lo - 0.4 <= x['pos'] <= hi + 0.4]
        a.sort(key=lambda x: x['pos'])
        return (a[0]['name'], a[-1]['name']) if a else None
    return dict(x=rng(op['x0'], op['x1'], ax['x'].values()), y=rng(op['y0'], op['y1'], ax['y'].values()))


VIEW_KINDS = ('elev', 'section', 'detail', 'site')


def _group_drawings(drawings, merge):
    """الرسمات بمبانٍ: نظام المحاور نفسه (تشابه أسماء المحاور بالاتجاهين) = مبنى واحد.
    الدمج (باختيار المستخدم): يكفي اسم مشترك بكل اتجاه. المسقط بلا محاور ينضم للمبنى
    الذي تنطبق أعمدته على أعمدته. الواجهات والمقاطع تُلحق بالمبنى «مناظرَ» له."""
    def names(dw, o):
        return set(dw['ax'][o].keys())
    plans = [dw for dw in drawings if dw['kind'] not in VIEW_KINDS]
    views = [dw for dw in drawings if dw['kind'] in VIEW_KINDS]
    axd = [dw for dw in plans if dw['ax']['x'] and dw['ax']['y']]
    groups = []
    for dw in sorted(axd, key=lambda d: -(len(d['ax']['x']) * len(d['ax']['y']))):
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
    for dw in sorted([p for p in plans if p not in axd], key=lambda d: -len(d['columns'])):
        best = None
        for g in groups:
            r = _reg_by_cols(dw, g[0])
            if r and (best is None or r[3] > best[0]):
                best = (r[3], g)
        if best:
            best[1].append(dw)
        else:
            groups.append([dw])
    for v in views:
        if not groups:
            groups.append([])
        g = next((g for g in groups if v.get('building_name') and
                  any(d.get('building_name') == v['building_name'] for d in g)), groups[0])
        g.append(v)
    return [g for g in groups if any(d['kind'] not in VIEW_KINDS for d in g)] or groups


def _register(dw, master):
    """إزاحة الرسمة إلى إحداثيات الرسمة الرئيسية: بأسماء المحاور المشتركة إن انطبقت،
    وإلا بتطابق الأعمدة، وإلا بمحاذاة حدود الرسمة (يُحذَّر منها)."""
    if dw is master:
        return 0.0, 0.0, 0.0, 'master'
    dx = [master['ax']['x'][n]['pos'] - a['pos'] for n, a in dw['ax']['x'].items() if n in master['ax']['x']]
    dy = [master['ax']['y'][n]['pos'] - a['pos'] for n, a in dw['ax']['y'].items() if n in master['ax']['y']]
    if dx and dy:
        tx, ty = _med(dx), _med(dy)
        res = max([abs(v - tx) for v in dx] + [abs(v - ty) for v in dy] + [0.0])
        if res <= 0.3:
            return tx, ty, res, 'axes'
    rc = _reg_by_cols(dw, master)
    if rc:
        return rc[0], rc[1], rc[2], 'cols'
    if dx and dy:
        return tx, ty, res, 'axes'
    return master['bub'][0] - dw['bub'][0], master['bub'][1] - dw['bub'][1], 9.9, 'bbox'


def _clusters1(vals, tol=0.3):
    out = []
    for v in sorted(vals):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(c) / len(c) for c in out]


def _assemble(gi, grp, beam_scheds, beams_all, col_sched, materials, opts, warn, key_names=None,
              col_defs=None):
    plans = [d for d in grp if d['kind'] not in VIEW_KINDS]
    views = [d for d in grp if d['kind'] in VIEW_KINDS]
    if not plans:
        return None
    master = max(plans, key=lambda d: (d['kind'] == 'cols_key', len(d['ax']['x']) * len(d['ax']['y']),
                                       len(d['columns'])))
    for dw in plans:
        tx, ty, res, how = _register(dw, master)
        dw['reg'] = dict(dx=round(tx, 3), dy=round(ty, 3), residual=round(res, 3), how=how)
        if how == 'bbox':
            warn.append('الرسمة %d بلا محاور ولا أعمدة مشتركة — وُضعت بمحاذاة حدودها (تقريبي).' % (dw['id'] + 1))
        elif how == 'axes' and res > 0.25:
            warn.append('الرسمة %d لا تنطبق على الشبكة بدقة (انحراف %.2f م) — راجع محاورها.' % (dw['id'] + 1, res))
    # ---- الحدود بإحداثيات الرسمة الرئيسية ثم الأصل ----
    xs_all, ys_all = [], []
    grid = {'x': {}, 'y': {}}
    for dw in plans:
        R = dw['reg']
        for o, t in (('x', R['dx']), ('y', R['dy'])):
            for n, a in dw['ax'][o].items():
                grid[o].setdefault(n, []).append(a['pos'] + t)
                (xs_all if o == 'x' else ys_all).append(a['pos'] + t)
        for c in dw['columns']:
            xs_all.append(c['x'] + R['dx']); ys_all.append(c['y'] + R['dy'])
        for w in dw.get('walls', []):
            if w['o'] == 'h':
                xs_all += [w['a'] + R['dx'], w['b'] + R['dx']]; ys_all.append(w['c'] + R['dy'])
            else:
                ys_all += [w['a'] + R['dy'], w['b'] + R['dy']]; xs_all.append(w['c'] + R['dx'])
    if not xs_all or not ys_all:
        return None
    ox, oy = min(xs_all), min(ys_all)
    gx = sorted(({'name': n, 'pos': round(_med(v) - ox, 3), 'prime': n.endswith("'")} for n, v in grid['x'].items()),
                key=lambda a: a['pos'])
    gy = sorted(({'name': n, 'pos': round(_med(v) - oy, 3), 'prime': n.endswith("'")} for n, v in grid['y'].items()),
                key=lambda a: a['pos'])
    for arr in (gx, gy):
        for i, a in enumerate(arr):
            a['next'] = round(arr[i + 1]['pos'] - a['pos'], 3) if i + 1 < len(arr) else None

    def T(dw, x, y):
        return (x + dw['reg']['dx'] - ox, y + dw['reg']['dy'] - oy)

    key_cols = []
    for dw in plans:
        if dw['kind'] == 'cols_key':
            for c in dw['columns']:
                x, y = T(dw, c['x'], c['y'])
                key_cols.append(dict(c, x=x, y=y))

    by_floor = {}
    for dw in plans:
        fl = dw.get('floor')
        if dw['kind'] in ('slab_rft', 'beams_key', 'arch', 'found') and fl:
            by_floor.setdefault(fl['key'], {})[dw['kind']] = dw
    if not by_floor:                                # لوحات بلا عناوين طوابق: طابق واحد افتراضي
        by_floor['ground'] = {(master['kind'] if master['kind'] in ('slab_rft', 'beams_key', 'arch') else 'arch'): master}
        warn.append('ما لقيت أسماء طوابق بعناوين المبنى %d — عُرض طابقاً واحداً (تقدر تحدد الطابق لكل لوحة).' % (gi + 1))
    order = sorted(by_floor, key=lambda k: K.FLOOR_ORDER.get(k, 0))
    hmap = opts.get('floor_h') or {}
    # منسوب الصفر = الطابق الأرضي (أو أول طابق فوقه)، وما تحته بالسالب (سرداب/قبو)
    g0 = next((i for i, fk in enumerate(order) if K.FLOOR_ORDER.get(fk, 0) >= 0), 0)
    # الارتفاعات: تعديل المستخدم ← المقاس من الواجهة/المقطع ← 3.5 م
    meas = None
    if views and not opts.get('no_measure'):
        try:
            meas = _measure_levels(views, order, g0)
        except Exception as ex:
            warn.append('تعذّر قياس المناسيب من الواجهات: %s' % ex)
    h_src, hs = [], []
    for i, fk in enumerate(order):
        u = PL._safe_float(hmap.get(fk), 0.0)
        j = i - meas['first'] if meas else -1
        if u:
            hs.append(u); h_src.append('user')
        elif meas and 0 <= j < len(meas['heights']):
            hs.append(meas['heights'][j]); h_src.append('measured')
        else:
            hs.append(3.5); h_src.append('default')
    base0 = meas['chain'][g0 - meas['first']] if meas and 0 <= g0 - meas['first'] < len(meas['chain']) else 0.0
    levels = [base0 + (-sum(hs[i:g0]) if i < g0 else sum(hs[g0:i])) for i in range(len(order))]
    if meas:
        vn = ' و'.join('%d' % (i + 1) for i in meas['src'])
        warn.append('📏 المناسيب مقاسة من الواجهة/المقطع (لوحة %s): %s — ارتفاع الطوابق %s م.' % (
            vn, ' · '.join(_fmt_lv(x) for x in meas['chain']), ' · '.join('%.2f' % x for x in meas['heights'])))
        for c in meas['conflicts']:
            warn.append('⚠️ علامة المنسوب %s باللوحة %d مرسومة فعلياً عند %s — اعتُمد القياس من الرسم.' % (
                _fmt_lv(c['v']), c['src'] + 1, _fmt_lv(c['drawn'])))
    floors = []
    for fi, fk in enumerate(order):
        sheets = by_floor[fk]
        sl, bk, ar = sheets.get('slab_rft'), sheets.get('beams_key'), sheets.get('arch')
        src_b = bk or sl
        h = hs[fi]
        sched = beam_scheds[src_b['beam_sched']]['beams'] if src_b and src_b.get('beam_sched') is not None else beams_all
        # ---- الأعمدة ----
        cand = []
        for dw in (bk, sl, ar):
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
        # ---- الجسور: من مفتاح الجسور، وإلا تُفترض بين الأعمدة المتجاورة (مُعلَّمة تخميناً) ----
        beams = []
        for s in (src_b['beams'] if src_b else []):
            mk = s.get('mark')
            rec = beams_all.get(mk) if mk and beams_all.get(mk, {}).get('user') else None
            rec = rec or (sched.get(mk) if mk else None)
            rec = rec or (beams_all.get(mk) if mk else None)
            if s['o'] == 'h':
                x1, y1 = T(src_b, s['a'], s['c']); x2, y2 = T(src_b, s['b'], s['c'])
            else:
                x1, y1 = T(src_b, s['c'], s['a']); x2, y2 = T(src_b, s['c'], s['b'])
            bw = rec['b'] if rec and rec.get('b') else s['w']
            bh = rec['h'] if rec and rec.get('h') else None
            guess = bh is None
            if guess:
                bh = _med([v['h'] for v in sched.values() if v.get('h')], 600)
            beams.append(dict(x1=round(x1, 3), y1=round(y1, 3), x2=round(x2, 3), y2=round(y2, 3),
                              b=int(bw), h=int(bh), mark=mk, axis=s.get('axis'), o=s['o'],
                              span=round(abs(s['b'] - s['a']), 3), cant=s.get('cant', False),
                              rebar=_beam_rebar(rec), guess=guess, src=src_b['id']))
        assumed = False
        if not beams and len(cols) >= 2:
            fr = PL.build_frame([dict(x=c['x'], y=c['y'], b=c['b'], h=c['h']) for c in cols])
            for bm in (fr or {}).get('beams', []):
                L = bm['span']
                o = 'h' if bm['dir'] == 'x' else 'v'
                bh = int(min(900, max(450, math.ceil(L * 1000 / 12 / 50.0) * 50)))
                beams.append(dict(x1=bm['x1'], y1=bm['y1'], x2=bm['x2'], y2=bm['y2'], b=250, h=bh, mark=None,
                                  axis=None, o=o, span=round(L, 3), cant=False, rebar=None, guess=True, src=None))
            assumed = bool(beams)
        # ---- الجدران (مسقط معماري) ----
        walls = []
        for dw in (ar,):
            if not dw:
                continue
            for w in dw.get('walls', []):
                if w['o'] == 'h':
                    a, b = T(dw, w['a'], w['c']), T(dw, w['b'], w['c'])
                else:
                    a, b = T(dw, w['c'], w['a']), T(dw, w['c'], w['b'])
                walls.append(dict(x1=round(a[0], 3), y1=round(a[1], 3), x2=round(b[0], 3), y2=round(b[1], 3),
                                  t=w['t'], o=w['o']))
        # ---- البلاطة ----
        sdw = sl or bk or ar
        opens, calls = [], []
        for dw in (sl, bk, ar):
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
        spans = []
        for bm in beams:
            if bm['o'] == 'h':
                spans.append(dict(o='h', c=bm['y1'], a=min(bm['x1'], bm['x2']), b=max(bm['x1'], bm['x2'])))
            else:
                spans.append(dict(o='v', c=bm['x1'], a=min(bm['y1'], bm['y2']), b=max(bm['y1'], bm['y2'])))
        for w in walls:
            if w['o'] == 'h':
                spans.append(dict(o='h', c=w['y1'], a=min(w['x1'], w['x2']), b=max(w['x1'], w['x2'])))
            else:
                spans.append(dict(o='v', c=w['x1'], a=min(w['y1'], w['y2']), b=max(w['y1'], w['y2'])))
        if gx and gy:
            loc_ax = {'x': {a['name']: dict(a) for a in gx}, 'y': {a['name']: dict(a) for a in gy}}
        else:                                      # بلا محاور: خطوط الأعمدة والجدران تقسم الألواح
            px = _clusters1([c['x'] for c in cols] + [sp['c'] for sp in spans if sp['o'] == 'v'])
            py = _clusters1([c['y'] for c in cols] + [sp['c'] for sp in spans if sp['o'] == 'h'])
            loc_ax = {'x': {str(i): dict(name=str(i), pos=v) for i, v in enumerate(px)},
                      'y': {str(i): dict(name=str(i), pos=v) for i, v in enumerate(py)}}
        rects = slab_panels(loc_ax, spans, opens, calls)
        t = (sl or {}).get('thickness') or (bk or {}).get('thickness')
        t_src = 'title' if t else None
        if not t and meas and meas.get('t'):
            t, t_src = meas['t'], 'section'           # سماكة البلاطة المرسومة بالمقطع
        t = t or 200
        floors.append(dict(key=fk, name=K.FLOOR_NAMES.get(fk, fk), level=round(levels[fi], 3), h=h,
                           h_src=h_src[fi], t_src=t_src,
                           columns=cols, beams=beams, walls=walls, beams_assumed=assumed,
                           slab=dict(t=t, rects=[[round(v, 3) for v in r] for r in rects],
                                     openings=opens, callouts=calls, mesh=_slab_mesh(calls),
                                     t_from_title=bool((sl or {}).get('thickness'))),
                           sheets=dict(slab=sl['id'] if sl else None, beams=bk['id'] if bk else None,
                                       arch=ar['id'] if ar else None)))
        if assumed:
            warn.append('سقف %s: لا مخطط جسور — افتُرضت جسور 250 مم بين الأعمدة المتجاورة (عمقها ≈ البحر/12)، '
                        'معلَّمة «تخمين».' % K.FLOOR_NAMES.get(fk, fk))
    footings = _footings(floors, materials, opts, warn)
    ext = [round(max(xs_all) - ox, 2), round(max(ys_all) - oy, 2)]
    names = sorted(set(dw['building_name'] for dw in grp if dw['building_name']))
    box = [0.0, 0.0, ext[0], ext[1]]
    cuts = {}
    for dw in plans:                                # خطوط القطع بإحداثيات المبنى
        for L_, c in (dw.get('cuts') or {}).items():
            if L_ not in cuts:
                cuts[L_] = dict(c, c=round(c['c'] + (dw['reg']['dy'] - oy if c['o'] == 'h' else dw['reg']['dx'] - ox), 3))
    vout = []
    for v in views:
        fit = None
        try:
            fit = _view_fit(v, gx, gy, box, cuts) if v['kind'] in ('elev', 'section') else None
        except Exception as ex:
            warn.append('تعذّرت مطابقة اللوحة %d على المبنى: %s' % (v['id'] + 1, ex))
        vout.append(dict(id=v['id'], title=v['title'], kind=v['kind'], view=v.get('view'), rect=v['rect'],
                         sketch=v['sketch'], fit=fit, letter=v.get('letter')))
    lv_info = None
    if meas:
        lv_info = dict(chain=meas['chain'], heights=meas['heights'], first=meas['first'], src=meas['src'],
                       from_slab=meas['from_slab'], extra=meas['extra'], mids=meas['mids'], below=meas['below'],
                       conflicts=meas['conflicts'], t=meas['t'], fin=meas['fin'], ngl=meas['ngl'],
                       checks=meas['checks'],
                       parapet=next((round(x - meas['chain'][-1], 3) for x in meas['extra']
                                     if 0.3 <= x - meas['chain'][-1] <= 1.6), None),
                       keys=order[meas['first']:])
    return dict(id=gi, name=(names[0] if names else 'مبنى %d' % (gi + 1)),
                axes_sig=('%s→%s × %s→%s' % (gx[0]['name'], gx[-1]['name'], gy[0]['name'], gy[-1]['name'])
                          if gx and gy else 'بلا محاور'),
                grid=dict(x=gx, y=gy), size=ext,
                drawings=[dw['id'] for dw in grp], floors=floors, footings=footings, views=vout,
                height=round(sum(hs[g0:]), 3), depth=round(sum(hs[:g0]), 3),
                levels=lv_info, ffl0=round(base0, 3))


def _fmt_lv(v):
    return '±0.00' if abs(v) < 0.005 else ('%+.2f' % v)


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
    # قاعدة الأعمدة: أعمدة الطابق الأسفل + كل عمود يبدأ بطابق منسوبه ≤ 0 وليس تحته عمود
    # (مثل أعمدة المدخل خارج حدود السرداب) — كلٌّ عند منسوب طابقه. العمود المبتدئ بطابق علوي لا أساس له.
    lv0 = floors[0].get('level', 0.0) or 0.0
    base = [dict(c, _z=lv0) for c in floors[0]['columns']]
    gnd = next((f.get('level', 0.0) or 0.0 for f in floors if K.FLOOR_ORDER.get(f['key'], 0) >= 0), 0.0)
    for f in floors[1:]:
        lv = f.get('level', 0.0) or 0.0
        if lv > max(gnd, 0.0) + 0.01:              # الأرضي (ولو مرفوعاً +0.70) آخر طابق يرتكز على أساسات
            break
        for c in f['columns']:
            if not any(math.hypot(q['x'] - c['x'], q['y'] - c['y']) < 0.6 for q in base):
                base.append(dict(c, _z=lv))
    PD = [0.0] * len(base)
    PLv = [0.0] * len(base)
    step = 0.75
    for f in floors:
        cols = f['columns']
        if not cols:
            continue
        # مطابقة أعمدة الطابق بأعمدة الأساس (نفس الموقع)
        idx = []
        lvf = f.get('level', 0.0) or 0.0
        for c in cols:
            j = min(range(len(base)), key=lambda k: (base[k]['_z'] > lvf + 0.01,
                                                     math.hypot(base[k]['x'] - c['x'], base[k]['y'] - c['y'])))
            if base[j]['_z'] > lvf + 0.01:
                idx.append(None)
                continue
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
                        s=r['spacing'], ok=r['ok'], designed=True, z=c['_z'], zg=round(min(c['_z'], 0.0), 3)))
    return out
