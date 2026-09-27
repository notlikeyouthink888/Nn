# -*- coding: utf-8 -*-
"""الدرج من لوحات الأوتوكاد — يُقرأ ثم يُركَّب **كاملاً** من منسوب الطابق حتى الطابق الذي فوقه.

ما يُقرأ من **المقطع الطولي** (أبعاد وتسليح السلم / السحبة الأولى، الثانية…):
  * الدرجات: سلسلة قائمة/نائمة متناوبة (مستقلة عن مقياس الرسم) ← عددها والقائمة R والنائمة T
    واتجاه الصعود.
  * البطن (الوِتر): أبعد خط مائل موازٍ للميل تحت خط الأركان الداخلة ← سماكة البلاطة المائلة.
  * البسطات: الخط الأفقي بعد آخر قائمة وقبل أول قائمة ← طولها، والخط تحته ← سماكتها.
  * المناسيب (±0.00، +1.75، −0.70) ونصوص الأبعاد الرأسية (1.75، 3.50) ← ارتفاع الطابق.
  * التسليح: n Ø d /m (بالمتر) أو Ø d @ s ← الرئيسي والتوزيع والعلوي، وأسياخ جسور الإسناد
    («جسر كابولي بتسليح علوي 6Ø16 وسفلي 2Ø16»)، وعلامات الجسور/الأعمدة (HB3، K5، BS، C3).
ومن **المسقط**: قلبات بخطوط نائمات متوازية متساوية، والبئر، والدرج الحلزوني (نائمات شعاعية
حول عمود دائري).

**قاعدة الارتفاع:** الدرج لا يُترك عند البسطة. إذا كان المرسوم نصف الطابق (قلبة حتى بسطة
وسطية) يُكمَّل بقلبات بنفس القائمة والنائمة (معكوسة الاتجاه = درج ذو قلبتين) حتى يصل منسوب
الطابق الذي فوقه، ويُكتب بوضوح ما قُرئ وما أُكمل.

الفحوص: ACI 318-19 (سماكة 7.3.1.1، حديد أدنى 7.6.1.1/24.4.3.2، تباعد 7.7.2.3/24.4.3.3،
المقاومة والقص عبر stairs.flight) + قواعد الراحة (2R+T، انتظام القائمات).
"""
import math
import re

import stairs as ST

# ------------------------------------------------------------------ نصوص
_NUM = re.compile(r'^\s*([+\-±]|%%[pP])?\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*$')
_BAR = re.compile(r'(?:(\d{1,2})\s*)?(?:%%[cC]|[ØøΦφ⌀]|\bT|\bY|#)\s*(\d{1,2})\s*'
                  r'(?:(/\s*(?:m|M|م)\b|/\s*متر)|(?:[@/]\s*(\d{2,3})))?')
_MARK = re.compile(r'^\s*((?:HB|SB|LB|BS|GB|TB|K|B|C|SC|ST|S)\d{0,3}[A-Z]?)\s*$')
_STAIR_T = re.compile(r'(سلم|سلالم|درج|stair|flight)', re.I)
_PLAN_T = re.compile(r'(مسقط|plan)', re.I)
_SPIRAL = re.compile(r'(حلزون|spiral|helical)', re.I)
_CANT = re.compile(r'(كابول|cantilever)', re.I)
_INCL = re.compile(r'(جسر\s*مائل|inclined\s*beam|stringer)', re.I)
_FLIGHT_W = [(re.compile(r'(السحبة|القلبة|الشاحط[ةه])\s*(ال)?(أولى|اولى|الأولى|الاولى|1)', re.I), 1),
             (re.compile(r'(السحبة|القلبة)\s*(ال)?(وسطى|الوسطى)', re.I), 2),
             (re.compile(r'(السحبة|القلبة)\s*(ال)?(ثانية|الثانية|2)', re.I), 3),
             (re.compile(r'(السحبة|القلبة)\s*(ال)?(ثالثة|الثالثة|أخيرة|الأخيرة|3)', re.I), 4),
             (re.compile(r'\bflight\s*(1|one|first)\b', re.I), 1), (re.compile(r'\bflight\s*(2|two|second)\b', re.I), 3)]
_WIDTH_T = re.compile(r'(عرض\s*(ال)?(سلم|درج|قلبة)|stair\s*width|width\s*of\s*(stair|flight))\s*[=:]?\s*(\d+(?:[.,]\d+)?)', re.I)
_BEAM_SEC = re.compile(r'^\s*(مقطع|مقاطع|قطاع|section)\b.*(جسر|جسور|الجسر|beam|عمود|أعمدة|اعمدة|column|أساس|اساس)', re.I)
_LIVE = 3.0                                       # kN/m² حمل حي للأدراج (الكود العراقي)


def _num(s):
    m = _NUM.match(s or '')
    if not m:
        return None
    try:
        v = float(m.group(2).replace(',', '.'))
    except ValueError:
        return None
    sg = m.group(1) or ''
    return -v if sg == '-' else v


def bar_callouts(text):
    """«7%%c16/m» ← {n:7, d:16, per_m:True, s:143} · «%%c10@150» ← {d:10, s:150} · «2%%c16» ← {n:2, d:16}."""
    out = []
    s = (text or '').replace('\\P', ' ')
    for m in _BAR.finditer(s):
        d = int(m.group(2))
        if d not in (6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32):
            continue
        n = int(m.group(1)) if m.group(1) else None
        if m.group(3) and n:
            out.append(dict(n=n, d=d, per_m=True, s=round(1000.0 / n)))
        elif m.group(4):
            sp = int(m.group(4))
            if sp < 40:                            # «Ø8/15» = كل 15 سم
                sp *= 10
            out.append(dict(n=n, d=d, per_m=True, s=sp))
        elif n:
            out.append(dict(n=n, d=d, per_m=False))
    return out


def _ab(d):
    return math.pi * d * d / 4.0


# ------------------------------------------------------------------ هندسة
def _split(segs, k_tol=0.02):
    """قطع أفقية/رأسية/مائلة: H=(x0,x1,y,i) · V=(y0,y1,x,i) · I=(x0,y0,x1,y1,i)."""
    H, V, I = [], [], []
    for s in segs:
        x0, y0, x1, y1, i = s[0], s[1], s[2], s[3], s[4]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        if L < 1e-6:
            continue
        if abs(dy) <= k_tol * L:
            H.append((min(x0, x1), max(x0, x1), (y0 + y1) / 2.0, i))
        elif abs(dx) <= k_tol * L:
            V.append((min(y0, y1), max(y0, y1), (x0 + x1) / 2.0, i))
        else:
            I.append((x0, y0, x1, y1, i) if x0 <= x1 else (x1, y1, x0, y0, i))
    return H, V, I


class _PtIx:
    def __init__(self, q):
        self.q, self.d = q, {}

    def add(self, x, y, v):
        self.d.setdefault((int(round(x / self.q)), int(round(y / self.q))), []).append((x, y, v))

    def near(self, x, y, tol):
        kx, ky = int(round(x / self.q)), int(round(y / self.q))
        r = max(1, int(math.ceil(tol / self.q)))
        out = []
        for a in range(kx - r, kx + r + 1):
            for b in range(ky - r, ky + r + 1):
                for p in self.d.get((a, b), ()):
                    if abs(p[0] - x) <= tol and abs(p[1] - y) <= tol:
                        out.append(p[2])
        return out


def step_chains(H, V, q):
    """سلاسل درجات: قائمة ثم نائمة ثم قائمة… باتجاه ثابت. مستقلة عن المقياس (تُقبل بتناسق
    الأطوال لا بقيمتها): ≥3 قائمات متقاربة الطول، ونائمات متقاربة، ونسبة T/R بين 1.1 و3.2."""
    tol = q * 1.5
    hs = _PtIx(q)
    for j, h in enumerate(H):
        hs.add(h[0], h[2], (j, 0))
        hs.add(h[1], h[2], (j, 1))
    vb = _PtIx(q)
    for j, v in enumerate(V):
        vb.add(v[2], v[0], j)                      # أسفل القائمة
    used, chains = set(), []
    order = sorted(range(len(V)), key=lambda j: V[j][0])
    for j0 in order:
        if j0 in used:
            continue
        best = None
        for sgn in (1, -1):
            risers, treads, j = [j0], [], j0
            seen = {j0}
            while True:
                v = V[j]
                nxt = None
                for (hj, end) in hs.near(v[2], v[1], tol):
                    h = H[hj]
                    other = h[1] if end == 0 else h[0]
                    if (other - v[2]) * sgn <= tol:
                        continue
                    for vj in vb.near(other, h[2], tol):
                        if vj not in seen and V[vj][1] - V[vj][0] > tol:
                            nxt = (hj, vj, abs(other - v[2]))
                            break
                    if nxt:
                        break
                if not nxt:
                    break
                # البسطة/الجسر بعد آخر درجة ليسا درجة: نائمة أو قائمة شاذة تُنهي السلسلة
                rl = V[nxt[1]][1] - V[nxt[1]][0]
                if treads and abs(nxt[2] - treads[0]) > 0.2 * treads[0]:
                    break
                if len(risers) >= 2:
                    rm = sorted(V[q_][1] - V[q_][0] for q_ in risers[1:])[(len(risers) - 1) // 2]
                    if abs(rl - rm) > 0.35 * rm:
                        break
                treads.append(nxt[2])
                risers.append(nxt[1])
                seen.add(nxt[1])
                j = nxt[1]
            if len(risers) >= 3 and (best is None or len(risers) > len(best[0])):
                best = (risers, treads, sgn)
        if not best:
            continue
        risers, treads, sgn = best
        R = [V[j][1] - V[j][0] for j in risers]
        # قائمة أولى/أخيرة أطول بكثير = حافة جدار/جسر لا درجة ← تُقصّ
        core = sorted(R[1:-1]) or sorted(R)
        rc = core[len(core) // 2]
        while len(risers) > 3 and R[0] > 1.35 * rc:
            risers, treads, R = risers[1:], treads[1:], R[1:]
        while len(risers) > 3 and R[-1] > 1.35 * rc:
            risers, treads, R = risers[:-1], treads[:-1], R[:-1]
        Rm = sorted(R)[len(R) // 2]
        Tm = sorted(treads)[len(treads) // 2]
        if Rm <= 0 or not (1.1 <= Tm / Rm <= 3.2):
            continue
        # الأولى والأخيرة قد تختلفان قليلاً (تشطيب)، والباقي متقارب
        mid = R[1:-1] if len(R) > 3 else R
        if any(abs(r - Rm) > 0.12 * Rm for r in mid) or any(abs(t - Tm) > 0.12 * Tm for t in treads):
            continue
        used.update(risers)
        a, b = V[risers[0]], V[risers[-1]]
        if any(abs(c['x0'] - a[2]) < tol and abs(c['y0'] - a[0]) < tol and abs(c['x1'] - b[2]) < tol
               and abs(c['y1'] - b[1]) < tol for c in chains):
            continue                               # السلسلة نفسها مرسومة مرتين (خطوط مكررة)
        chains.append(dict(risers=[V[j] for j in risers], R_list=R, T_list=treads, R=Rm, T=Tm, s=sgn,
                           x0=V[risers[0]][2], y0=V[risers[0]][0],
                           x1=V[risers[-1]][2], y1=V[risers[-1]][1]))
    return chains


_KS = (1.0, 0.001, 0.01, 0.1, 0.02, 0.025, 0.04, 0.05, 0.2, 0.25, 0.5, 2.0, 2.5, 4.0, 5.0, 10.0, 20.0, 25.0,
       40.0, 50.0, 100.0, 1000.0)


def pick_k(chains, nums):
    """معامل تحويل الرسمة للمتر: القائمة 0.13–0.21 م والنائمة 0.22–0.40 م، ويُرجَّح بمطابقة
    نصوص الأبعاد المكتوبة (0.175، 0.30، 1.75) للأطوال المرسومة."""
    if not chains:
        return None
    R = sorted(c['R'] for c in chains)[len(chains) // 2]
    T = sorted(c['T'] for c in chains)[len(chains) // 2]
    geo = [R, T] + [c['R'] * len(c['risers']) for c in chains]
    best = None
    for k in _KS:
        if not (0.12 <= R * k <= 0.23 and 0.20 <= T * k <= 0.42):
            continue
        hit = 0
        for v in nums:
            for vv in (v, v / 1000.0, v / 100.0):
                if any(abs(vv - g * k) <= 0.03 * max(vv, 1e-6) for g in geo):
                    hit += 1
                    break
        sc = (hit, k == 1.0)
        if best is None or sc > best[0]:
            best = (sc, k)
    return best[1] if best else None


def _root_offset(ch, seg):
    """البعد العمودي (موجب = تحت) من خط الأركان الداخلة للسلسلة إلى خط مائل."""
    th = math.atan2(ch['R'], ch['T'])
    # خط الأركان الداخلة: يمر بأسفل أول قائمة وميله s·tanθ
    x0, y0, s = ch['x0'], ch['y0'], ch['s']
    xm, ym = (seg[0] + seg[2]) / 2.0, (seg[1] + seg[3]) / 2.0
    yr = y0 + (xm - x0) * s * math.tan(th)
    return (yr - ym) * math.cos(th)


def _chain_box(ch):
    xs = [v[2] for v in ch['risers']]
    return min(xs), max(xs), ch['y0'], ch['y1']




# ------------------------------------------------------------------ فهرس نقطي للعناصر
class _Grid:
    def __init__(self, cell):
        self.c, self.d = cell, {}

    def add(self, i, x, y):
        self.d.setdefault((int(math.floor(x / self.c)), int(math.floor(y / self.c))), []).append(i)

    def query(self, x0, y0, x1, y1):
        out = []
        for a in range(int(math.floor(x0 / self.c)), int(math.floor(x1 / self.c)) + 1):
            for b in range(int(math.floor(y0 / self.c)), int(math.floor(y1 / self.c)) + 1):
                out.extend(self.d.get((a, b), ()))
        return out


def _center(e):
    p = e['p']
    if e['t'] in ('T', 'C', 'A'):
        return p[0], p[1]
    xs, ys = p[0::2], p[1::2]
    return (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0


# ------------------------------------------------------------------ المقطع الطولي
def _levels(texts, polys, H, k):
    """المناسيب: رقم بإشارة (±0.00 ، +1.75 ، −0.70) أو بجانبه نص إشارة، أو فوق مثلث ▽ مغلق،
    ويُقرن بالخط الأفقي الذي تحته مباشرة. يعيد [(القيمة، y المرسوم)]."""
    signs = [t for t in texts if t['s'].strip() in ('+', '-', '_', '±', '%%p', '%%P', '−')]
    tris = []
    for e in polys:
        p = e['p']
        n = len(p) // 2
        if n not in (3, 4):
            continue
        xs, ys = p[0::2], p[1::2]
        if n == 4 and not (abs(xs[0] - xs[3]) < 1e-6 and abs(ys[0] - ys[3]) < 1e-6):
            continue
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        if 0 < w * k < 0.5 and 0 < h * k < 0.4 and 0.6 <= w / max(h, 1e-9) <= 3.0:
            tris.append(((max(xs) + min(xs)) / 2, min(ys), max(ys)))
    out = []
    for t in texts:
        v = _num(t['s'])
        if v is None or abs((t.get('rot') or 0) % 180) > 5 or abs(v) > 60:
            continue
        s0 = t['s'].strip()
        x, y = t['p'][0], t['p'][1]
        sg = s0[:1] in '+-±−' or s0.startswith('%%')
        ns = [g for g in signs if abs(g['p'][1] - y) < 0.25 / k and 0 <= x - g['p'][0] < 0.35 / k]
        tri = any(abs(tx - x) < 1.0 / k and -0.1 / k <= y - ty2 < 0.5 / k for tx, ty, ty2 in tris)
        if not (sg or ns or tri):
            continue
        if ns and not sg and v > 0 and any(g['s'].strip() in ('-', '−') for g in ns) \
                and not any(g['s'].strip() in ('+', '±', '%%p', '%%P') for g in ns):
            v = -v
        cand = [h for h in H if -0.06 / k <= y - h[2] <= 0.45 / k and h[0] - 1.2 / k <= x <= h[1] + 1.2 / k
                and (h[1] - h[0]) * k >= 0.25]
        if cand:
            out.append((v, max(cand, key=lambda h: h[2])[2]))
    return out


def _read_region(E, ids, chains, H, I, k):
    """كل ما حول قلبات درج واحد: المناسيب، البطن، البسطات، التسليح، الجسور، أبعاد الارتفاع."""
    texts = [E[i] for i in ids if E[i]['t'] == 'T' and (E[i].get('s') or '').strip()]
    polys = [E[i] for i in ids if E[i]['t'] == 'P']
    issues = []
    lv = _levels(texts, polys, H, k)
    zmap = None
    if lv:
        v0, y0 = min(lv, key=lambda p: (abs(p[0]), -p[1]))
        zmap = (v0, y0)
        for v, y in lv:
            drawn = v0 + (y - y0) * k
            if abs(drawn - v) > 0.03 + 0.02 * abs(v - v0):
                issues.append('المنسوب %+.2f مكتوب لكنه مرسوم عند %+.2f (فرق %d مم) — اعتُمد المرسوم.'
                              % (v, drawn, round(abs(drawn - v) * 1000)))
    ymin = min(c['y0'] for c in chains)
    Z = (lambda y: zmap[0] + (y - zmap[1]) * k) if zmap else (lambda y: (y - ymin) * k)
    q = 0.004 / k
    flights = []
    for ch in sorted(chains, key=lambda c: c['y0']):
        n = len(ch['risers'])
        R, T = ch['R'] * k, ch['T'] * k
        th = math.atan2(R, T)
        xa, xb, ya, yb = _chain_box(ch)
        wv, lines = None, 0
        for sg in I:
            dx, dy = sg[2] - sg[0], sg[3] - sg[1]
            L = math.hypot(dx, dy)
            if L * k < 0.4 or dy * ch['s'] <= 0:
                continue
            if abs(math.atan2(abs(dy), abs(dx)) - th) > math.radians(3.0):
                continue
            if min(sg[2], xb) - max(sg[0], xa) < 0.3 * min(abs(dx), xb - xa + 1e-9):
                continue
            off = _root_offset(ch, sg) * k
            if 0.02 <= off <= 0.45:
                lines += 1
                if off >= 0.07 and (wv is None or off > wv):
                    wv = off
        top, bot = ch['risers'][-1], ch['risers'][0]
        land_top = _run_h(H, top[2], top[1], ch['s'], q * 2)
        land_bot = _run_h(H, bot[2], bot[0], -ch['s'], q * 2)
        t_land = None
        if land_top:
            xs0, xs1 = sorted((top[2], top[2] + ch['s'] * land_top))
            below = [top[1] - h[2] for h in H if 0.07 / k <= top[1] - h[2] <= 0.4 / k
                     and min(h[1], xs1) - max(h[0], xs0) > 0.4 * (xs1 - xs0)]
            if below:
                t_land = round(min(below) * k * 1000)
        flights.append(dict(n=n, R=round(R, 4), T=round(T, 4), s=ch['s'],
                            R_list=[round(v * k, 4) for v in ch['R_list']],
                            T_list=[round(v * k, 4) for v in ch['T_list']],
                            xd=round(bot[2] * k, 3), z0=round(Z(bot[0]), 3), z1=round(Z(top[1]), 3),
                            waist=round(wv * 1000) if wv else None,
                            land_top=round(land_top * k, 3) if land_top and land_top * k <= 4.5 else None,
                            land_bot=round(land_bot * k, 3) if land_bot and land_bot * k <= 4.5 else None,
                            t_land=t_land, rebar_lines=lines, angle=round(math.degrees(th), 1), read=True))
    # نصوص القائمة والنائمة المكتوبة مقابل المرسوم
    Rd = _med([f['R'] for f in flights])
    Td = _med([f['T'] for f in flights])
    vt = [v for v in (_num(t['s']) for t in texts if abs(((t.get('rot') or 0) % 180) - 90) < 5) if v]
    ht = [v for v in (_num(t['s']) for t in texts if abs((t.get('rot') or 0) % 180) < 5) if v]
    R_txt = sorted(set(round(v, 3) for v in vt if 0.12 <= v <= 0.22))
    T_txt = sorted(set(round(v, 3) for v in ht if 0.22 <= v <= 0.40))
    if R_txt and all(abs(v - Rd) > 0.006 for v in R_txt):
        issues.append('القائمة مكتوبة %s م لكنها مرسومة %.3f م — %s' % (
            ' / '.join('%.3f' % v for v in R_txt), Rd,
            'اعتُمد المرسوم (عدد القائمات × المرسوم = فرق المناسيب).'))
    if T_txt and all(abs(v - Td) > 0.01 for v in T_txt):
        issues.append('النائمة مكتوبة %s م لكنها مرسومة %.3f م.' % (' / '.join('%.2f' % v for v in T_txt), Td))
    bars, beam_bars, marks = [], [], []
    for t in texts:
        s = t['s']
        bc = bar_callouts(s)
        for b in bc:
            b = dict(b, x=t['p'][0], y=t['p'][1], text=s.strip())
            (bars if b['per_m'] else beam_bars).append(b)
        m = _MARK.match(s)
        if m and not bc:
            marks.append(m.group(1))
    rebar = _classify_bars(bars, chains, k)
    beams = _support_beams(polys, texts, beam_bars, chains, k)
    vdims = sorted(set(round(v, 3) for v in vt if 0.3 < v < 8))
    wtxt = None
    for t in texts:
        m = _WIDTH_T.search(t['s'])
        if m:
            wtxt = float(m.group(5).replace(',', '.'))
            wtxt = wtxt / 100.0 if wtxt > 20 else wtxt
    kinds = set()
    for t in texts:
        if _CANT.search(t['s']):
            kinds.add('cantilever_beam')
        if _INCL.search(t['s']):
            kinds.add('inclined_beam')
        if re.search(r'كرسي|pier|مسند', t['s']):
            kinds.add('pier')
        if re.search(r'لبشة|raft', t['s'], re.I):
            kinds.add('raft')
    return dict(flights=flights, rebar=rebar, beams=beams, marks=sorted(set(marks)),
                levels=sorted(set(round(v, 3) for v, _ in lv)), has_levels=bool(lv), vdims=vdims,
                width_text=wtxt, issues=issues, kinds=sorted(kinds),
                texts=[t['s'].strip() for t in texts][:200])


def _med(v, d=None):
    v = sorted(x for x in v if x is not None)
    return v[len(v) // 2] if v else d


def _run_h(H, x, y, sgn, tol):
    """طول الخط الأفقي المتصل الذي يبدأ من (x,y) باتجاه sgn (قطع متتالية على نفس المستوى)."""
    L, cur, moved, it = 0.0, x, True, 0
    while moved and it < 50:
        moved, it = False, it + 1
        for h in H:
            if abs(h[2] - y) > tol:
                continue
            if sgn > 0 and h[0] - tol <= cur <= h[0] + tol and h[1] - cur > tol:
                cur, moved = h[1], True
                break
            if sgn < 0 and h[1] - tol <= cur <= h[1] + tol and cur - h[0] > tol:
                cur, moved = h[0], True
                break
    L = abs(cur - x)
    return L or None


def _classify_bars(bars, chains, k):
    """أكبر قطر بالمتر = الرئيسي؛ وإن تكرر فوق خط الأركان فهو علوي (شنّاطات)، والأصغر ≥10 توزيع،
    و≤10 = أتاري جسور الإسناد."""
    if not bars:
        return {}
    dmax = max(b['d'] for b in bars)
    main = [b for b in bars if b['d'] == dmax]
    rest = [b for b in bars if b['d'] < dmax]
    below, above = [], []
    for b in main:
        side = -1
        for ch in chains:
            xa, xb, ya, yb = _chain_box(ch)
            if xa - 0.6 / k <= b['x'] <= xb + 0.6 / k:
                th = math.atan2(ch['R'], ch['T'])
                yr = ch['y0'] + (b['x'] - ch['x0']) * ch['s'] * math.tan(th)
                side = 1 if b['y'] > yr + ch['R'] else -1
                break
        (above if side > 0 else below).append(b)

    def pick(L):
        cnt = {}
        for b in L:
            cnt[(b['n'], b['d'], b['s'])] = cnt.get((b['n'], b['d'], b['s']), 0) + 1
        key = max(cnt, key=lambda q: (cnt[q], q[0] or 0))
        b = next(b for b in L if (b['n'], b['d'], b['s']) == key)
        return dict(n=b['n'], d=b['d'], s=b['s'], text=b['text'])
    out = {'main': pick(below or main)}
    if above:
        out['top'] = pick(above)
    dist = [b for b in rest if b['d'] >= 10]
    if dist:
        out['dist'] = pick([b for b in dist if b['d'] == max(x['d'] for x in dist)])
    small = [b for b in rest if b['d'] < 10] if dist else [b for b in rest if b['d'] < 10][1:]
    if not dist and rest:
        out['dist'] = pick(rest)
    if small:
        out['stir'] = pick(small)
    out['all'] = sorted(set(b['text'] for b in bars))
    return out


def _support_beams(polys, texts, beam_bars, chains, k):
    """مقاطع جسور الإسناد: مستطيل مغلق عرضه 0.15–0.6 م وعمقه 0.2–1.0 م قرب طرف قلبة، مع علامته
    (HB3/K5/BS) وأسياخه، ووصف «جسر كابولي بتسليح علوي 6Ø16 و بتسليح سفلي 2Ø16»."""
    rects = []
    for e in polys:
        p = e['p']
        n = len(p) // 2
        if not (4 <= n <= 5):
            continue
        xs, ys = p[0::2], p[1::2]
        if not (e.get('closed') or (n == 5 and abs(xs[0] - xs[-1]) < 1e-6 and abs(ys[0] - ys[-1]) < 1e-6)):
            continue
        w, h = (max(xs) - min(xs)) * k, (max(ys) - min(ys)) * k
        if 0.15 <= w <= 0.6 and 0.2 <= h <= 1.0 and h >= 1.15 * w:     # الجسر أعمق من عرضه (المربع مقطع عمود)
            r = [min(xs), min(ys), max(xs), max(ys)]
            if not any(abs(r[0] - q[0]) < 0.02 and abs(r[1] - q[1]) < 0.02 and abs(r[2] - q[2]) < 0.02 for q in rects):
                rects.append(r)
    ends = []
    for ch in chains:
        ends += [(ch['x0'], ch['y0']), (ch['x1'], ch['y1'])]
    out = []
    for rc in rects:
        cx, cy = (rc[0] + rc[2]) / 2, (rc[1] + rc[3]) / 2
        if min((math.hypot(cx - x, cy - y) for x, y in ends), default=9e9) * k > 2.2:
            continue
        mk = None
        best = 9e9
        for t in texts:
            m = _MARK.match(t['s'])
            dd = math.hypot(t['p'][0] - cx, t['p'][1] - cy) * k
            if m and dd < 1.2 and dd < best:
                mk, best = m.group(1), dd
        bb = [b for b in beam_bars if math.hypot(b['x'] - cx, b['y'] - cy) * k < 0.9]
        out.append(dict(b=round((rc[2] - rc[0]) * k * 1000), h=round((rc[3] - rc[1]) * k * 1000), mark=mk,
                        bars=sorted(set('%dØ%d' % (b['n'], b['d']) for b in bb)),
                        x=cx, y=cy))
    desc = {}
    for t in texts:
        s = t['s']
        if not re.search(r'علوي|سفلي|top|bottom', s, re.I):
            continue
        same = [b for b in beam_bars if abs(b['y'] - t['p'][1]) < 0.08 / k and abs(b['x'] - t['p'][0]) < 2.0 / k]
        if not same:
            continue
        b = min(same, key=lambda b: abs(b['x'] - t['p'][0]))
        if re.search(r'علوي|top', s, re.I):
            desc['top'] = '%dØ%d' % (b['n'], b['d'])
        else:
            desc['bot'] = '%dØ%d' % (b['n'], b['d'])
        if _CANT.search(s):
            desc['kind'] = 'cantilever'
    if desc:
        tgt = min(out, key=lambda o: o['h'] or 0, default=None) if out else None
        if tgt is not None:
            tgt['desc'] = desc
        else:
            out.append(dict(b=None, h=None, mark=None, bars=[], desc=desc))
    for o in out:
        o.pop('x', None)
        o.pop('y', None)
    return out


def _clusters(chains):
    """قلبات الرسمة الواحدة متقاربة: صناديقها (بهامش 1.5 م أفقياً و1.0 م رأسياً) متداخلة."""
    n = len(chains)
    par = list(range(n))

    def f(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i
    bx = []
    for c in chains:
        xa, xb, ya, yb = _chain_box(c)
        L = (xb - xa) or 1.0
        bx.append((xa - 0.35 * L, xb + 0.35 * L, ya - 0.3 * L, yb + 0.3 * L))
    for i in range(n):
        for j in range(i + 1, n):
            a, b = bx[i], bx[j]
            if a[0] <= b[1] and b[0] <= a[1] and a[2] <= b[3] and b[2] <= a[3]:
                par[f(i)] = f(j)
    grp = {}
    for i in range(n):
        grp.setdefault(f(i), []).append(chains[i])
    out = []
    for cs in grp.values():
        xs = [v[2] for c in cs for v in c['risers']]
        out.append(dict(chains=cs, box=(min(xs), max(xs), min(c['y0'] for c in cs), max(c['y1'] for c in cs))))
    return out


# ------------------------------------------------------------------ مساقط الدرج
def tread_runs(segs, k=1.0, min_n=4, max_n=26):
    """قلبات بالمسقط: خطوط نائمات متوازية متساوية الطول ومتصفّفة الأطراف بتباعد 0.22–0.40 م.
    يعيد [{o:'h'|'v', a,b (مدى الخط), c0,c1 (مدى الصعود), n, s, width}]."""
    H, V, _ = _split(segs)
    runs = []
    for o, L in (('h', H), ('v', V)):
        groups = {}
        for (a, b, c, i) in L:
            w = (b - a) * k
            if not (0.6 <= w <= 3.2):
                continue
            groups.setdefault((round(a * k / 0.03), round(b * k / 0.03)), []).append(c)
        for key, cs in groups.items():
            cs0 = sorted(set(round(c, 4) for c in cs))
            cs = []
            for c in cs0:                           # خط النائمة مزدوج (حافة الأنف 2–6 سم) ← خط واحد (الأبعد)
                if cs and (c - cs[-1]) * k < 0.07:
                    cs[-1] = c
                    continue
                cs.append(c)
            i = 0
            while i < len(cs) - 1:
                j = i
                sp = cs[i + 1] - cs[i]
                if not (0.22 <= sp * k <= 0.40):
                    i += 1
                    continue
                while j + 1 < len(cs) and abs((cs[j + 1] - cs[j]) - sp) <= max(0.06 * sp, 0.035 / k):
                    j += 1
                n = j - i + 1
                if min_n <= n <= max_n:
                    runs.append(dict(o=o, a=key[0] * 0.03 / k, b=key[1] * 0.03 / k, c0=cs[i], c1=cs[j], n=n,
                                     s=round(sp * k, 3), width=round((key[1] - key[0]) * 0.03, 3)))
                i = j if j > i else i + 1
    # قلبة قطعها خط القطع (Break line) أو تغيّرت طبقتها بمنتصفها ← قطعتان على نفس الخط بنفس التباعد تُدمجان
    runs.sort(key=lambda r: (r['o'], round(r['a'] * k, 1), r['c0']))
    mg = []
    for r in runs:
        p = mg[-1] if mg else None
        if p and p['o'] == r['o'] and abs(p['a'] - r['a']) * k < 0.06 and abs(p['b'] - r['b']) * k < 0.06 \
                and abs(p['s'] - r['s']) < 0.01 and 0 < (r['c0'] - p['c1']) * k <= 4.2 * p['s']:
            m = (r['c0'] - p['c1']) * k / p['s']
            if abs(m - round(m)) < 0.15:
                p['c1'] = r['c1']
                p['n'] = int(round((p['c1'] - p['c0']) * k / p['s'])) + 1
                continue
        mg.append(dict(r))
    runs = [r for r in mg if r['n'] <= max_n]
    # نمط بلاط/كسوة: قلبات كثيرة ملتصقة بنفس التباعد ← ليس درجاً
    out = []
    for r in runs:
        twins = [q for q in runs if q is not r and q['o'] == r['o'] and abs(q['s'] - r['s']) < 0.01
                 and abs(q['c0'] - r['c0']) < 0.05 and abs(q['a'] - r['b']) < 0.05 / k]
        if len(twins) >= 2:
            continue
        out.append(r)
    return out


def spirals(E, ids, segs, k=1.0):
    """درج حلزوني بالمسقط: دائرة (العمود الأوسط) تخرج منها ≥8 خطوط شعاعية (النائمات)."""
    out = []
    for i in ids:
        e = E[i]
        if e['t'] != 'C':
            continue
        cx, cy, r = e['p']
        if not (0.08 <= r * k <= 0.8):
            continue
        rad = []
        for s in segs:
            d0 = math.hypot(s[0] - cx, s[1] - cy)
            d1 = math.hypot(s[2] - cx, s[3] - cy)
            a, b = (d0, d1) if d0 < d1 else (d1, d0)
            if a > r * 1.6 or b < r * 2.0 or (b - a) * k < 0.5:
                continue
            (px, py) = (s[0], s[1]) if d0 > d1 else (s[2], s[3])
            (qx, qy) = (s[2], s[3]) if d0 > d1 else (s[0], s[1])
            # الخط يتجه نحو المركز (لا مماس)
            ux, uy = px - qx, py - qy
            L = math.hypot(ux, uy) or 1
            cr = abs((qx - cx) * uy - (qy - cy) * ux) / L
            if cr > r * 1.2:
                continue
            rad.append((math.atan2(py - cy, px - cx), b))
        if len(rad) < 8:
            continue
        angs = sorted(set(round(a, 2) for a, _ in rad))
        if len(angs) < 8:
            continue
        gaps = sorted(((angs[(j + 1) % len(angs)] - angs[j]) % (2 * math.pi)) for j in range(len(angs)))
        step = _med(gaps)
        if not step or step <= 0.05:
            continue
        span = 2 * math.pi - max(gaps) if max(gaps) > 2.5 * step else 2 * math.pi
        n = int(round(span / step)) + (0 if span >= 2 * math.pi - 0.01 else 1)
        out.append(dict(x=cx, y=cy, r_core=round(r * k, 3), r_out=round(_med([b for _, b in rad]) * k, 3),
                        n=n, step_deg=round(math.degrees(step), 1), a0=round(min(a for a, _ in rad), 3),
                        sweep=round(math.degrees(span), 0)))
    return out


# ------------------------------------------------------------------ التجميع والتكميل
def _base_title(t):
    t = re.sub(r'[-–—]', ' ', t or '')
    for rx, _ in _FLIGHT_W:
        t = rx.sub(' ', t)
    t = re.sub(r'من\s+الدور\s+\S+|من\s+الطابق\s+\S+', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def _flight_no(t):
    for rx, n in _FLIGHT_W:
        if rx.search(t or ''):
            return n
    return None


def complete(st, H_hint=None, H_src=None):
    """يكمل الدرج حتى منسوب الطابق الذي فوقه، ويضع القلبات والبسطات بالمسقط (محلياً).

    الارتفاع: (١) ارتفاع طابق المبنى (٢) بُعد رأسي مكتوب ≥ ارتفاع المرسوم (٣) فرق المناسيب
    (٤) المرسوم نصف طابق (ينتهي ببسطة وسطية) ← ضعفه (درج ذو قلبتين) (٥) المرسوم نفسه."""
    F = sorted(st['flights'], key=lambda f: f['z0'])
    notes, issues = st.setdefault('notes', []), st.setdefault('issues', [])
    floor0 = 0.0 if (st.get('has_levels') and any(abs(v) < 0.005 for v in st.get('levels', []))) else F[0]['z0']
    above = [f for f in F if f['z1'] > floor0 + 0.01]
    rise_drawn = (max(f['z1'] for f in F) - floor0) if above else 0.0
    H, src = None, None
    if H_hint and H_hint > 1.8:
        H, src = H_hint, H_src or 'ارتفاع الطابق من المبنى'
    if H is None:
        c = [v for v in st.get('vdims', []) if 2.2 <= v <= 7.0 and v >= rise_drawn - 0.03]
        if c:
            H, src = min(c, key=lambda v: abs(v - rise_drawn)), 'بُعد رأسي مكتوب باللوحة (%.2f م)' % min(
                c, key=lambda v: abs(v - rise_drawn))
    if H is None:
        lvs = [v for v in st.get('levels', [])]
        if lvs and max(lvs) - floor0 >= 2.2:
            H, src = max(lvs) - floor0, 'فرق المناسيب المكتوبة'
    if H is None:
        if rise_drawn < 0.9:
            H, src = rise_drawn or sum(f['n'] * f['R'] for f in F), 'درجات قصيرة (مدخل/فرق منسوب) — لا تُكمَّل'
        elif rise_drawn < 2.2 and 2 * rise_drawn >= 2.4 and above and (above[-1].get('land_top') or 0) >= 0.6:
            H, src = round(2 * rise_drawn, 3), 'المرسوم ينتهي ببسطة وسطية عند %+.2f ← درج بقلبتين (ضعف المرسوم)' % (
                floor0 + rise_drawn)
        elif rise_drawn < 2.2 and st.get('H_typ'):
            H, src = st['H_typ'], 'المرسوم قلبة واحدة (%.2f م) ← ارتفاع الطابق النموذجي لأدراج الملف %.2f م' % (
                rise_drawn, st['H_typ'])
        elif rise_drawn < 2.2:
            H, src = round(max(2 * rise_drawn, 3.0), 3), 'المرسوم قلبة واحدة (%.2f م) — افتراض درج بقلبتين' % rise_drawn
        else:
            H, src = rise_drawn or sum(f['n'] * f['R'] for f in F), 'المرسوم كاملاً'
    H = round(H, 3)
    st['H'], st['H_src'], st['z_floor'] = H, src, round(floor0, 3)
    # ---- سدّ الفجوات بين قلبات مرسومة (قلبة وسطى بلوحة أخرى أو غير مرسومة)
    Rm = _med([f['R'] for f in above] or [f['R'] for f in F])
    G = [F[0]]
    for f in F[1:]:
        p_ = G[-1]
        gap = f['z0'] - p_['z1']
        if gap > 1.5 * Rm:
            n = max(2, int(round(gap / Rm)))
            G.append(dict(n=n, R=round(gap / n, 4), T=p_['T'], s=-p_['s'] if f['s'] == p_['s'] else p_['s'],
                          perp=f['s'] != p_['s'], z0=p_['z1'], z1=f['z0'], waist=p_.get('waist'),
                          land_top=p_.get('land_top'), land_bot=None, t_land=p_.get('t_land'),
                          R_list=[round(gap / n, 4)] * n, T_list=[p_['T']] * (n - 1), angle=p_.get('angle'), read=False,
                          part=f.get('part', 0)))
            notes.append('بين %+.2f و%+.2f لا قلبة مرسومة ← أُضيفت قلبة %s بـ%d قائمة (%s).' % (
                p_['z1'], f['z0'], 'وسطى متعامدة' if f['s'] != p_['s'] else 'معكوسة', n,
                'درج بثلاث قلبات حول بئر' if f['s'] != p_['s'] else 'درج بقلبتين'))
        G.append(f)
    F = G
    # ---- التكميل
    rem = floor0 + H - max(f['z1'] for f in F)
    added = []
    if rem > 0.5 * Rm:
        base = above[-1] if above else F[-1]
        n_rem = max(1, int(round(rem / Rm)))
        per = base['n']
        s = base['s']
        z = max(f['z1'] for f in F)
        nf = max(1, int(math.ceil(n_rem / float(per))))
        split = [n_rem // nf + (1 if i < n_rem % nf else 0) for i in range(nf)]   # قلبات متوازنة لا بقايا
        for n in split:
            s = -s
            R = rem / max(1, int(round(rem / Rm))) if abs(rem / Rm - round(rem / Rm)) > 0.15 else Rm
            added.append(dict(n=n, R=round(R, 4), T=base['T'], s=s, z0=round(z, 3), z1=round(z + n * R, 3),
                              waist=base.get('waist'), land_top=base.get('land_top'), land_bot=None,
                              t_land=base.get('t_land'), R_list=[round(R, 4)] * n, T_list=[base['T']] * (n - 1),
                              angle=base.get('angle'), read=False))
            z += n * R
        if abs(rem / Rm - round(rem / Rm)) > 0.15:
            issues.append('الارتفاع المتبقي %.2f م لا يقبل القسمة على القائمة %.3f م — القلبات المكمَّلة بقائمة %.3f م.'
                          % (rem, Rm, added[0]['R']))
        notes.append('المرسوم يصل %+.2f والطابق حتى %+.2f ← أُكملت %d قلبة (%d قائمة) بنفس القائمة والنائمة '
                     'ومعكوسة الاتجاه، فالدرج يصل منسوب الطابق الذي فوقه.' % (
                         max(f['z1'] for f in F), floor0 + H, len(added), sum(a['n'] for a in added)))
    elif rem < -0.5 * Rm:
        issues.append('القلبات المرسومة (%.2f م) أعلى من ارتفاع الطابق %.2f م.' % (max(f['z1'] for f in F) - floor0, H))
    st['flights'] = F + added
    _layout(st)
    return st


def _layout(st):
    """مواضع القلبات والبسطات بالمسقط المحلي (x باتجاه المقطع كما رُسم، y عرضي):
    * انعكاس الاتجاه = قلبة بالحارة المجاورة (درج بقلبتين) وبسطة الدوران بعرض الحارتين.
    * قلبة «وسطى متعامدة» (perp) = درج بثلاث قلبات حول بئر: تمشي عرضياً فوق بسطة الطرف.
    * نفس الاتجاه = استمرار بعد بسطة بطولها المقروء."""
    w = st.get('width') or 1.2
    gap = st.get('well') if st.get('well') is not None else 0.10
    F = st['flights']
    p0 = [f for f in F if f.get('read') and f.get('xd') is not None and f.get('part', 0) == F[0].get('part', 0)]
    x_ref = min((f['xd'] for f in p0), default=0.0)
    L0 = _med([f.get('land_top') for f in F if f.get('land_top')], w)
    lands = []
    prev = None
    for i, f in enumerate(F):
        f['going'] = round((f['n'] - 1) * f['T'], 3)
        if prev is None:
            x0, y0 = ((f['xd'] - x_ref) if f.get('xd') is not None else 0.0), 0.0
            u, v = (f['s'], 0.0), (0.0, 1.0)
        elif f.get('perp'):
            xe = prev['xe']
            x0, y0 = xe, prev['y0'] + w                 # فوق بسطة الطرف، تمشي عرضياً
            u, v = (0.0, 1.0), (float(prev['s']), 0.0)
        elif prev.get('perp'):
            x0 = prev['x0']
            y0 = prev['y0'] + prev['going'] + w
            u, v = (f['s'], 0.0), (0.0, 1.0)
            if f['s'] == prev['v'][0]:                  # يعود باتجاه عكس القلبة الأولى
                x0 = prev['x0']
        elif f['s'] != prev['s']:
            x0, y0 = prev['xe'], prev['y0'] + w + gap
            u, v = (f['s'], 0.0), (0.0, 1.0)
        else:
            x0, y0 = prev['xe'] + f['s'] * (prev.get('land_top') or L0), prev['y0']
            u, v = (f['s'], 0.0), (0.0, 1.0)
        if f.get('read') and f.get('xd') is not None and prev is not None and prev.get('read') \
                and prev.get('part', 0) == f.get('part', 0) and not prev.get('perp') and not f.get('perp'):
            x0 = prev['x0'] + (f['xd'] - prev['xd'])  # المرسوم بموضعه الفعلي بالمقطع (نفس اللوحة)
        f['x0'], f['y0'], f['u'], f['v'] = round(x0, 3), round(y0, 3), u, v
        f['xe'] = round(x0 + u[0] * f['going'], 3)
        f['lane'] = 0 if y0 < 0.01 else 1
        prev = f
    for i, f in enumerate(F):
        nxt = F[i + 1] if i + 1 < len(F) else None
        t = (f.get('t_land') or f.get('waist') or 150)
        Lt = f.get('land_top') or L0
        if f.get('perp'):                            # بسطة بعد القلبة الوسطى: مربع عند نهايتها
            ya = f['y0'] + f['going']
            xs = sorted((f['x0'], f['x0'] + f['v'][0] * w))
            lands.append(dict(x0=xs[0], x1=xs[1], y0=round(ya, 3), y1=round(ya + w, 3), z=f['z1'], t=t, read=False))
            continue
        xe = f['xe']
        if nxt is not None and nxt.get('perp'):
            xa, xb = sorted((xe, xe + f['s'] * w))
            y0, y1 = f['y0'], f['y0'] + w
        elif nxt is not None and nxt['s'] != f['s'] and abs(nxt['z0'] - f['z1']) <= 0.02 + f['R']:
            xa, xb = sorted((xe, xe + f['s'] * Lt))
            y0, y1 = min(f['y0'], nxt['y0']), max(f['y0'], nxt['y0']) + w
        else:
            xa, xb = sorted((xe, xe + f['s'] * Lt))
            y0, y1 = f['y0'], f['y0'] + w
        lands.append(dict(x0=round(xa, 3), x1=round(xb, 3), y0=round(y0, 3), y1=round(y1, 3), z=f['z1'], t=t,
                          read=bool(f.get('read') and f.get('land_top'))))
    f0 = F[0]
    Lb = f0.get('land_bot') or L0
    xa, xb = sorted((f0['x0'], f0['x0'] - f0['s'] * Lb))
    lands.insert(0, dict(x0=round(xa, 3), x1=round(xb, 3), y0=f0['y0'], y1=f0['y0'] + w, z=f0['z0'],
                         t=f0.get('t_land') or 150, read=bool(f0.get('land_bot'))))
    st['landings'] = lands
    xs = [l['x0'] for l in lands] + [l['x1'] for l in lands] + [f['x0'] for f in F] + [f['xe'] for f in F]
    ys = [l['y1'] for l in lands] + [f['y0'] + (f['going'] if f.get('perp') else w) for f in F]
    sh = min(xs)
    st['size'] = [round(max(xs) - sh, 3), round(max(ys), 3)]
    for f in F:
        f['x0'], f['xe'] = round(f['x0'] - sh, 3), round(f['xe'] - sh, 3)
    for l in lands:
        l['x0'], l['x1'] = round(l['x0'] - sh, 3), round(l['x1'] - sh, 3)


# ------------------------------------------------------------------ الفحوص (ACI 318-19 + الراحة)
def checks(st, fc=25.0, fy=420.0):
    F = [f for f in st['flights']]
    rd = [f for f in F if f.get('read')] or F
    R = _med([f['R'] for f in rd])
    T = _med([f['T'] for f in rd])
    w = st.get('width') or 1.2
    out = []

    def add(name, val, lim, ok, clause, warn=False):
        out.append(dict(name=name, val=val, lim=lim, ok=bool(ok), warn=bool(warn and not ok), clause=clause))
    if st.get('type') == 'spiral':
        add('القائمة R (حلزوني)', '%.0f مم' % (R * 1000), '≤ 240 مم', R <= 0.24, 'IBC 1011.10')
        add('النائمة عند خط المشي', '%.0f مم' % (T * 1000), '≥ 190 مم', T >= 0.19, 'IBC 1011.10')
        tot = sum(f['n'] * f['R'] for f in F)
        add('مجموع القائمات = ارتفاع الطابق', '%.3f م' % tot, '%.3f م' % st['H'], abs(tot - st['H']) <= 0.02,
            'تناسق المقطع')
        st['checks'] = out
        return out
    bl = 2 * R + T
    add('قاعدة بلوندل 2R+T', '%.0f مم' % (bl * 1000), '600–650 مم', 0.60 <= bl <= 0.65,
        'قاعدة الراحة للدرج', warn=0.58 <= bl <= 0.66)
    add('القائمة R', '%.0f مم' % (R * 1000), '≤ 190 مم (المفضّل 150–175)', 0.12 <= R <= 0.19, 'كود المباني (IBC 1011.5.2)')
    add('النائمة T', '%.0f مم' % (T * 1000), '≥ 250 مم (المفضّل 280–300)', T >= 0.25, 'كود المباني (IBC 1011.5.2)')
    rl = [r for f in rd for r in (f.get('R_list') or [])[1:-1]] or [R]
    spread = max(rl) - min(rl)
    add('انتظام القائمات', 'فرق %.0f مم' % (spread * 1000), '≤ 10 مم', spread <= 0.0101, 'IBC 1011.5.4')
    if len(set(round(f['R'], 3) for f in rd)) > 1:
        dr = max(f['R'] for f in rd) - min(f['R'] for f in rd)
        add('تساوي القائمة بين القلبات', 'فرق %.0f مم' % (dr * 1000), '≤ 10 مم', dr <= 0.0101, 'IBC 1011.5.4')
    # السماكة والتصميم لكل قلبة مقروءة (البحر الأفقي = الامتداد + البسطة)
    cant = 'inclined_beam' in st.get('kinds', []) or st.get('type') == 'cantilever'
    fdes = []
    for f in rd:
        land = min(f.get('land_top') or 1.2, 2.0)
        span = f['going'] + land
        waist = f.get('waist')
        if cant:
            hmin = w / 10.0 * 1000
            add('سماكة البلاطة (قلبة %d)' % (F.index(f) + 1), '%s مم' % (waist or '—'),
                '≥ عرض القلبة/10 = %.0f مم (كابولي من الجسر المائل)' % hmin,
                waist and waist >= hmin - 1, 'ACI 318-19 جدول 7.3.1.1')
        else:
            hmin = span / 20.0 * 1000
            add('سماكة البلاطة (قلبة %d)' % (F.index(f) + 1), '%s مم' % (waist or '—'),
                '≥ البحر/20 = %.0f/20 = %.0f مم' % (span * 1000, hmin),
                waist and waist >= hmin - 1, 'ACI 318-19 جدول 7.3.1.1 (أقل منها مسموح فقط بحساب الهطول 24.2)',
                warn=waist and waist >= span / 28.0 * 1000)
        try:
            d = ST.flight(dict(steps=max(2, f['n'] - 1), tread=f['T'], rise=f['R'], width=w, fc=fc, fy=fy,
                               landing=land, waist=waist or None))
            fdes.append((f, d))
        except Exception:
            pass
    rb = st.get('rebar') or {}
    if fdes:
        f, d = max(fdes, key=lambda q: q[1]['Mu'])
        hh = f.get('waist') or d['waist']
        m = rb.get('main')
        if m and m.get('s'):
            As = _ab(m['d']) * 1000.0 / m['s']
            add('الحديد الرئيسي (المقاومة)', '%s = %.0f مم²/م' % (_lbl(m), As),
                '≥ %.0f مم²/م (Mu=%.1f kN·m/م)' % (d['As'], d['Mu']), As >= d['As'] - 1,
                'ACI 318-19 7.5 · 7.6.1.1')
            add('تباعد الرئيسي', '%.0f مم' % m['s'], '≤ min(3h، 450) = %.0f مم' % min(3 * hh, 450),
                m['s'] <= min(3 * hh, 450) + 1, 'ACI 318-19 7.7.2.3')
        else:
            add('الحديد الرئيسي', 'غير مكتوب', 'مطلوب %s' % d['main']['label'], False, 'ACI 318-19 7.6')
        ds = rb.get('dist')
        if ds and ds.get('s'):
            Ad = _ab(ds['d']) * 1000.0 / ds['s']
            amin = 0.0018 * 1000 * hh
            add('حديد التوزيع (الانكماش)', '%s = %.0f مم²/م' % (_lbl(ds), Ad), '≥ 0.0018·b·h = %.0f مم²/م' % amin,
                Ad >= amin - 1, 'ACI 318-19 24.4.3.2')
            add('تباعد التوزيع', '%.0f مم' % ds['s'], '≤ min(5h، 450) = %.0f مم' % min(5 * hh, 450),
                ds['s'] <= min(5 * hh, 450) + 1, 'ACI 318-19 24.4.3.3')
        else:
            add('حديد التوزيع', 'غير مكتوب', 'مطلوب %s' % d['dist']['label'], False, 'ACI 318-19 24.4.3')
        add('القص', 'Vu=%.1f kN/م' % d['Vu'], 'φVc=%.1f kN/م' % d['phiVc'], d['shear_ok'], 'ACI 318-19 22.5.5.1')
        st['design'] = dict(Mu=d['Mu'], As=d['As'], main=d['main']['label'], dist=d['dist']['label'],
                            wu=d['wu'], waist=d['waist'], span=d['span'], reaction=d['reaction'])
        if rb.get('top') is None:
            add('الحديد العلوي عند الانكسار', 'غير مرسوم', 'نصف الرئيسي بطول ربع البحر', False,
                'تفصيل الدرج (عزم سالب موضعي) — ACI 318-19 9.7.3', warn=True)
    # الارتفاع الصافي فوق كل قلبة (القلبة التي فوقها بنفس الحارة)
    hr = None
    for i, a in enumerate(F):
        for b in F[i + 1:]:
            if abs(b.get('y0', 0) - a.get('y0', 0)) > 0.05 or not (a.get('read') and b.get('read')) \
                    or a.get('part', 0) != b.get('part', 0) or a.get('perp') or b.get('perp'):
                continue
            ax0, ax1 = sorted((a['x0'], a['x0'] + a['s'] * a['going']))
            bx0, bx1 = sorted((b['x0'], b['x0'] + b['s'] * b['going']))
            if min(ax1, bx1) - max(ax0, bx0) < 0.3:
                continue
            th = math.atan2(b['R'], b['T'])
            wv = (b.get('waist') or 150) / 1000.0 / math.cos(th)
            clr = (b['z0'] - wv) - (a['z0'] + a['R'])
            hr = clr if hr is None else min(hr, clr)
    if hr is not None:
        add('الارتفاع الصافي فوق الدرج', '%.2f م' % hr, '≥ 2.03 م', hr >= 2.03, 'IBC 1011.3')
    tot = sum(f['n'] * f['R'] for f in F)
    add('مجموع القائمات = ارتفاع الطابق', '%.3f م' % tot, '%.3f م' % st['H'], abs(tot - st['H']) <= 0.02,
        'تناسق المقطع')
    st['checks'] = out
    return out


def _lbl(b):
    if not b:
        return '—'
    if b.get('n') and b.get('s') and abs(1000.0 / b['n'] - b['s']) < 2:
        return '%dØ%d/م (@%d)' % (b['n'], b['d'], b['s'])
    return 'Ø%d @ %d مم' % (b['d'], b['s']) if b.get('s') else '%dØ%d' % (b.get('n') or 0, b['d'])


# ------------------------------------------------------------------ الواجهة الرئيسية
def find_stairs(E, segs, drawings, titles, materials=None, floor_h=None):
    """كل أدراج الملف: قلبات (سلاسل درجات) تُنسب لأقرب عنوان تحتها، وما عنوانه درج يُقرأ ويُكمَّل.
    titles: عناصر نصوص العناوين. floor_h: {مفتاح الطابق: ارتفاعه} من المباني المركَّبة."""
    materials = materials or {}
    fc = float(materials.get('fc') or 25.0)
    fy = float(materials.get('fy') or 420.0)
    H, V, I = _split(segs)
    chains = step_chains(H, V, 0.003)
    if not chains:
        return [], []
    # المرشحون: كل العناوين (نسبة السلسلة لأقرب عنوان من أي نوع، وتُقبل إن كان عنوان درج)
    # مقاطع الجسور الحاملة للدرج («مقطع من الجسور الكابولية الحاملة للسلم») ليست لوحة الدرج نفسه
    T = [t for t in titles if (t.get('s') or '').strip() and not _BEAM_SEC.search(t['s'])]
    by_t = {}
    for ch in _clusters(chains):
        xa, xb, ya, yb = ch['box']
        cx = (xa + xb) / 2.0
        best = None
        for t in T:
            tx, ty = t['p'][0], t['p'][1]
            if ty > ya + 0.6 or ya - ty > 9.0:
                continue
            dx = max(0.0, abs(tx - cx) - (xb - xa) / 2.0 - 1.0)
            if dx > 7.0:
                continue
            sc = (ya - ty) + 1.3 * dx
            if best is None or sc < best[0]:
                best = (sc, t)
        if best and _STAIR_T.search(best[1]['s']) and not _PLAN_T.search(best[1]['s']):
            if id(best[1]) in by_t and _SPIRAL.search(best[1]['s']):
                by_t[id(best[1])][1].extend(ch['chains'])   # الحلزوني: العمود الأوسط يقطع القلبات بالمقطع
            elif id(best[1]) in by_t:                  # عنوانان لرسمتين: الأقرب يأخذ العنوان، والأخرى باسمه (2)
                t2 = dict(best[1], s=best[1]['s'] + ' (رسمة أخرى)')
                by_t[id(t2)] = (t2, ch['chains'])
            else:
                by_t[id(best[1])] = (best[1], ch['chains'])
    # فهرس العناصر للمنطقة
    G = _Grid(4.0)
    for i, e in enumerate(E):
        if e['t'] in ('T', 'P'):
            x, y = _center(e)
            G.add(i, x, y)
    SGh = _Grid(4.0)
    for j, h in enumerate(H):
        SGh.add(j, (h[0] + h[1]) / 2, h[2])
    SGi = _Grid(4.0)
    for j, s in enumerate(I):
        SGi.add(j, (s[0] + s[2]) / 2, (s[1] + s[3]) / 2)
    stairs, unknown = [], []
    for tid, (t, chs) in by_t.items():
        k = pick_k(chs, []) or 1.0
        xs = [v[2] for c in chs for v in c['risers']]
        ys = [c['y0'] for c in chs] + [c['y1'] for c in chs]
        pad = 2.0 / k
        box = (min(xs) - pad, min(ys) - 1.2 / k, max(xs) + pad, max(ys) + 1.2 / k)
        ids = [i for i in G.query(*box) if box[0] <= _center(E[i])[0] <= box[2] and box[1] <= _center(E[i])[1] <= box[3]]
        texts_nums = [abs(v) for v in (_num(E[i]['s']) for i in ids if E[i]['t'] == 'T') if v]
        k = pick_k(chs, texts_nums) or k
        Hs = [H[j] for j in set(SGh.query(*box))]
        Is = [I[j] for j in set(SGi.query(*box))]
        try:
            reg = _read_region(E, ids, chs, Hs, Is, k)
        except Exception as ex:                    # لا انهيار: الدرج يُبلَّغ عنه
            unknown.append(dict(title=t['s'], why='تعذّرت قراءة الدرج: %s' % ex))
            continue
        title = t['s'].strip()
        st = dict(title=title, base=_base_title(title), fno=_flight_no(title), k=k, x=t['p'][0], y=t['p'][1],
                  **reg)
        st['type'] = 'spiral' if _SPIRAL.search(title) else (
            'cantilever' if ('inclined_beam' in reg['kinds'] or _INCL.search(title)) else 'waist')
        stairs.append(st)
    # قلبات «السحبة الأولى/الوسطى/الثانية» لنفس الدرج ← درج واحد
    merged, done = [], set()
    for i, a in enumerate(stairs):
        if i in done:
            continue
        grp = [a]
        if a['fno']:
            # أقرب لوحة لكل رقم قلبة آخر، لنفس الدرج (العنوان نفسه بلا رقم القلبة) وضمن 25 م
            for fno in sorted(set(b['fno'] for b in stairs if b['fno'] and b['fno'] != a['fno'])):
                cand = [(math.hypot(a['x'] - b['x'], a['y'] - b['y']), j) for j, b in enumerate(stairs)
                        if j != i and j not in done and b['fno'] == fno and b['base'] == a['base']]
                cand = [c for c in cand if c[0] < 25.0]
                if cand:
                    j = min(cand)[1]
                    grp.append(stairs[j])
                    done.add(j)
        if len(grp) > 1:
            grp.sort(key=lambda s: s['fno'])
            m = dict(grp[0], title=' + '.join(s['title'] for s in grp), parts=len(grp))
            fl, z = [], None
            for pi, s in enumerate(grp):
                ff = sorted(s['flights'], key=lambda f: f['z0'])
                for f in ff:
                    f['part'] = pi
                if z is not None and not s.get('has_levels'):
                    dz = z - ff[0]['z0'] if ff[0]['z0'] < z - 0.02 else 0.0
                    for f in ff:
                        f['z0'], f['z1'] = round(f['z0'] + dz, 3), round(f['z1'] + dz, 3)
                fl += ff
                z = max(f['z1'] for f in fl)
                for key in ('issues', 'marks', 'kinds', 'vdims', 'levels'):
                    if s is not grp[0]:
                        m[key] = sorted(set((m.get(key) or []) + (s.get(key) or []))) if key != 'issues' else \
                            (m.get(key) or []) + (s.get(key) or [])
                m['beams'] = (m.get('beams') or []) + ([] if s is grp[0] else s.get('beams') or [])
            # القلبات المكرّرة بين اللوحتين (نفس المنسوب) تُحذف
            uniq = []
            for f in sorted(fl, key=lambda f: f['z0']):
                if not any(abs(f['z0'] - g['z0']) < 0.05 and f['n'] == g['n'] for g in uniq):
                    uniq.append(f)
            m['flights'] = uniq
            merged.append(m)
        else:
            merged.append(a)
    # ارتفاع الطابق النموذجي للملف: من الأدراج التي ارتفاعها مكتوب (بُعد رأسي ≥ 2.2 م)
    typ = [v for st in merged for v in st.get('vdims', []) if 2.4 <= v <= 6.0]
    H_typ = _med(typ) if typ else None
    out = []
    for n, st in enumerate(merged):
        st['H_typ'] = H_typ
        try:
            st['width'] = st.get('width_text') or 1.2
            st['width_src'] = 'مكتوب باللوحة' if st.get('width_text') else 'افتراضي 1.20 م (العرض لا يظهر بالمقطع)'
            fk = _floor_key(st['title'])
            st['floor'] = fk
            hh = (floor_h or {}).get(fk) if fk else None
            complete(st, hh, 'ارتفاع طابق المبنى' if hh else None)
            checks(st, fc, fy)
            st['id'] = n
            st['n_risers'] = sum(f['n'] for f in st['flights'])
            st['R'] = _med([f['R'] for f in st['flights'] if f.get('read')])
            st['T'] = _med([f['T'] for f in st['flights'] if f.get('read')])
            if st['type'] == 'spiral':               # حلزوني: عمود أوسط ودرجات إسفينية حتى منسوب الطابق
                w = st['width']
                rc = 0.15
                n = max(8, int(round(st['H'] / (st['R'] or 0.18))))
                rw = rc + w / 2.0
                st['spiral'] = dict(x=rc + w + 0.2, y=rc + w + 0.2, r_core=rc, r_out=round(rc + w, 3), n=n,
                                    step_deg=round(math.degrees((st['T'] or 0.25) / rw), 1), a0=0.0,
                                    z0=st['z_floor'], H=st['H'])
                st['size'] = [round(2 * (rc + w + 0.2), 3)] * 2
                st['landings'] = []                    # بسطات المقطع لا تخص الحلزوني (العرض من المسقط/الافتراض)
                per = 360.0 / max(st['spiral']['step_deg'], 1.0)
                clr = per * (st['H'] / n) - 0.12
                st['checks'].append(dict(name='الارتفاع الصافي لكل دورة (حلزوني)', val='%.2f م (%.0f درجة/دورة)' % (clr, per),
                                         lim='≥ 1.98 م', ok=clr >= 1.98, warn=False, clause='IBC 1011.10'))
                st['notes'].append('حلزوني: %d درجة إسفينية حول عمود Ø%d مم، كل درجة %.1f° والنائمة %.0f مم عند خط '
                                   'المشي (نصف العرض)، حتى منسوب الطابق.' % (n, rc * 2000, st['spiral']['step_deg'],
                                                                           (st['T'] or 0.25) * 1000))
            for key in ('base', 'fno', 'x', 'y', 'width_text', 'H_typ'):
                st.pop(key, None)
            out.append(st)
        except Exception as ex:
            unknown.append(dict(title=st.get('title'), why='تعذّر تركيب الدرج: %s' % ex))
    return out, unknown


_FLOOR_RX = [(re.compile(r'بدروم|سرداب|قبو|basement', re.I), 'basement'),
             (re.compile(r'أرضي|ارضي|الأرضي|ground', re.I), 'ground'),
             (re.compile(r'ميزانين|mezz', re.I), 'mezzanine'),
             (re.compile(r'متكرر|typical', re.I), 'typical'),
             (re.compile(r'الأول|الاول|first', re.I), 'first'),
             (re.compile(r'الثاني|second', re.I), 'second')]


def _floor_key(t):
    for rx, k in _FLOOR_RX:
        if rx.search(t or ''):
            return k
    return None


# ------------------------------------------------------------------ درج المسقط داخل المبنى
_UP = re.compile(r'^\s*(up|صعود|طلوع|صاعد|↑)\s*$', re.I)


def _run_geom(r):
    """القلبة بالمسقط: محور المشي (c) واتجاهه العرضي. o='v' ← الخطوط رأسية والمشي على x."""
    if r['o'] == 'v':
        return dict(walk='x', lat=(r['a'], r['b']), c=(r['c0'], r['c1']))
    return dict(walk='y', lat=(r['a'], r['b']), c=(r['c0'], r['c1']))


def plan_groups(runs, texts, segs, k=1.0):
    """قلبات المسقط ← أدراج: قلبتان متوازيتان متجاورتان = درج بقلبتين (بسطة دوران بعرضهما)، قلبة
    وحيدة = مستقيم، ومتعامدتان = درج بزاوية. اتجاه الصعود من أرقام الدرجات المكتوبة (17، 18…) أو
    كلمة UP/صعود، وإلا فالبسطة بالطرف الذي أمامه فراغ أكبر حتى الجدار."""
    n = len(runs)
    par = list(range(n))

    def f(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i
    for i in range(n):
        for j in range(i + 1, n):
            a, b = runs[i], runs[j]
            if a['o'] != b['o']:
                continue
            gap = max(a['a'], b['a']) - min(a['b'], b['b'])
            ov = min(a['c1'], b['c1']) - max(a['c0'], b['c0'])
            if -0.05 / k <= gap <= 1.2 / k and ov >= 0.4 * min(a['c1'] - a['c0'], b['c1'] - b['c0']):
                par[f(i)] = f(j)
    grp = {}
    for i in range(n):
        grp.setdefault(f(i), []).append(runs[i])
    nums = []
    for t in texts:
        s0 = (t.get('s') or '').strip()
        if re.match(r'^\d{1,2}$', s0):
            nums.append((int(s0), t['p'][0], t['p'][1]))
    ups = [t for t in texts if _UP.match((t.get('s') or '').strip())]
    out = []
    for rs in grp.values():
        rs = sorted(rs, key=lambda r: r['a'])[:2]
        if len(rs) == 2 and abs(rs[0]['n'] - rs[1]['n']) > 6:
            rs = [max(rs, key=lambda r: r['n'])]
        walk = 'x' if rs[0]['o'] == 'v' else 'y'

        def coords(r, t):
            return (t[1], t[2]) if walk == 'x' else (t[2], t[1])  # (على محور المشي، عرضي)

        def num_dir(r):
            pts = [(v, *coords(r, (v, x, y))) for v, x, y in nums]
            pts = [(v, c, l) for v, c, l in pts if r['a'] - 0.1 / k <= l <= r['b'] + 0.1 / k
                   and r['c0'] - 0.4 / k <= c <= r['c1'] + 0.4 / k]
            if len(pts) < 3:
                return None, None
            vs = [p[0] for p in pts]
            cs = [p[1] for p in pts]
            mv, mc = sum(vs) / len(vs), sum(cs) / len(cs)
            cov = sum((v - mv) * (c - mc) for v, c, _ in pts)
            return (1 if cov > 0 else -1), min(vs)
        dirs = [num_dir(r) for r in rs]
        src = 'أرقام الدرجات'
        if len(rs) == 2:
            if dirs[0][0] and dirs[1][0] and dirs[0][0] != dirs[1][0]:
                order = sorted(range(2), key=lambda i: dirs[i][1])
                d0 = dirs[order[0]][0]
            else:
                order, d0 = [0, 1], None
                for u in ups:
                    c, l = coords(rs[0], (0, u['p'][0], u['p'][1]))
                    for i, r in enumerate(rs):
                        if r['a'] - 0.3 / k <= l <= r['b'] + 0.3 / k:
                            order = [i, 1 - i]
                            d0 = 1 if abs(c - r['c0']) < abs(c - r['c1']) else -1
                            src = 'كلمة UP'
                if d0 is None:
                    d0 = _landing_side(rs, segs, walk, k)
                    src = 'البسطة بالطرف الأوسع حتى الجدار (اتجاه مفترض)'
            seq = [(rs[order[0]], d0), (rs[order[1]], -d0)]
        else:
            d0 = dirs[0][0]
            if d0 is None:
                d0, src = 1, 'اتجاه مفترض'
            seq = [(rs[0], d0)]
        out.append(dict(walk=walk, seq=seq, src=src))
    return out


def _landing_side(rs, segs, walk, k):
    """الطرف الذي تفصله عن أقرب جدار عمودي على المشي مسافة أكبر = بسطة الدوران."""
    lo = min(r['a'] for r in rs)
    hi = max(r['b'] for r in rs)
    c0 = min(r['c0'] for r in rs)
    c1 = max(r['c1'] for r in rs)
    d_lo, d_hi = 9e9, 9e9
    for s in segs:
        if walk == 'x':
            if abs(s[0] - s[2]) > 1e-6:
                continue
            c, a, b = s[0], min(s[1], s[3]), max(s[1], s[3])
        else:
            if abs(s[1] - s[3]) > 1e-6:
                continue
            c, a, b = s[1], min(s[0], s[2]), max(s[0], s[2])
        if min(b, hi) - max(a, lo) < 0.6 * (hi - lo):
            continue
        if c > c1 + 0.05 / k:
            d_hi = min(d_hi, c - c1)
        elif c < c0 - 0.05 / k:
            d_lo = min(d_lo, c0 - c)
    return 1 if d_hi >= d_lo else -1


def build_plan_stair(g, H, z0, T, k=1.0, waist=150):
    """درج مسقط كامل بإحداثيات المبنى (T: تحويل إحداثيات الرسمة): قلبات بعدد قائماتها من منسوب
    الطابق حتى الذي فوقه، وبسطة الدوران بينها. يرفض ما ليس درج طابق (القائمة خارج 130–200 مم)،
    ويكمّل الدرج بقلبتين إن رُسمت خطوطه أقل من اللازم للارتفاع (القائمة ≈ 170 مم)."""
    walk = g['walk']
    seq = g['seq']
    fl, lands = [], []
    base = sum(r['n'] for r, _ in seq)
    best = None
    for extra in (0, 1):
        N = base + extra * len(seq)
        R = H / N
        sc = abs(R - 0.17) + (0 if 0.13 <= R <= 0.2 else 1)
        if best is None or sc < best[0]:
            best = (sc, extra)
    extra = best[1]
    ns = [r['n'] + extra for r, _ in seq]
    R = H / sum(ns)
    completed = False
    if R > 0.2 and len(seq) == 2 and R <= 0.31:
        N = int(round(H / 0.17))                   # خطوط أقل من اللازم ← تكميل حتى منسوب الطابق الذي فوقه
        ns = [N // 2 + (N % 2), N // 2]
        R = H / N
        completed = True
    if not (0.13 <= R <= 0.2):
        raise ValueError('ليس درج طابق (القائمة %.0f مم)' % (R * 1000))
    z = z0
    ends = []
    for fi, ((r, d), n) in enumerate(zip(seq, ns)):
        sp = r['s'] / k
        if len(seq) == 2 and fi == 0:
            end = r['c1'] if d > 0 else r['c0']    # القلبة الأولى تنتهي عند بسطة الدوران
            start = end - d * (n - 1) * sp
        else:
            start = r['c0'] if d > 0 else r['c1']
        if walk == 'x':
            p0, u, v = (start, r['a']), (d, 0.0), (0.0, 1.0)
        else:
            p0, u, v = (r['a'], start), (0.0, d), (1.0, 0.0)
        P0 = T(*p0)
        Pu = T(p0[0] + u[0], p0[1] + u[1])
        Pv = T(p0[0] + v[0], p0[1] + v[1])
        uu = (Pu[0] - P0[0], Pu[1] - P0[1])
        vv = (Pv[0] - P0[0], Pv[1] - P0[1])
        nu = math.hypot(*uu) or 1.0
        nv = math.hypot(*vv) or 1.0
        fl.append(dict(p0=[round(P0[0], 3), round(P0[1], 3)], u=[round(uu[0] / nu, 4), round(uu[1] / nu, 4)],
                       v=[round(vv[0] / nv, 4), round(vv[1] / nv, 4)], w=round(r['width'], 3), n=n, R=round(R, 4),
                       T=round(r['s'], 3), z0=round(z, 3), going=round((n - 1) * r['s'], 3), waist=waist,
                       read=not completed))
        z += n * R
        ends.append(start + d * (n - 1) * sp)
    if len(seq) == 2:                              # بسطة الدوران بعرض القلبتين
        (r1, d1), (r2, _) = seq
        L = max(r1['width'], 1.0) / k
        c_a, c_b = sorted((ends[0], ends[0] + d1 * L))
        l0, l1 = min(r1['a'], r2['a']), max(r1['b'], r2['b'])
        corners = [(c_a, l0), (c_b, l0), (c_b, l1), (c_a, l1)] if walk == 'x' else \
            [(l0, c_a), (l0, c_b), (l1, c_b), (l1, c_a)]
        W = [T(*c) for c in corners]
        xs, ys = [q[0] for q in W], [q[1] for q in W]
        lands.append(dict(x0=round(min(xs), 3), y0=round(min(ys), 3), x1=round(max(xs), 3), y1=round(max(ys), 3),
                          z=round(fl[0]['z0'] + fl[0]['n'] * R, 3), t=waist, read=False))
    src = g['src'] + ('، وأُكمل حتى منسوب الطابق (الخطوط المرسومة أقل من اللازم)' if completed else '')
    return dict(flights=fl, landings=lands, H=round(H, 3), R=round(R, 4), N=sum(ns), src=src, completed=completed,
                T=round(_med([r['s'] for r, _ in seq]), 3), width=round(_med([r['width'] for r, _ in seq]), 3))


def section_to_world(st):
    """درج المقطع (x على اتجاه المقطع، حارات عرضية) ← صيغة القلبات العامة p0/u/v للعارض، مع جسور
    البسطات (الحافة البعيدة للبسطة الوسطية) والجسور المائلة للدرج الكابولي."""
    w = st.get('width') or 1.2
    wdef = (st.get('design') or {}).get('waist') or 150
    fl = []
    for f in st['flights']:
        u, v = f.get('u') or (float(f['s']), 0.0), f.get('v') or (0.0, 1.0)
        fl.append(dict(p0=[f['x0'], f['y0']], u=[float(u[0]), float(u[1])], v=[float(v[0]), float(v[1])], w=w, n=f['n'], R=f['R'],
                       T=f['T'], z0=f['z0'], going=f['going'], waist=f.get('waist') or wdef, lane=f.get('lane', 0),
                       read=bool(f.get('read'))))
    bm = [b for b in st.get('beams') or [] if b.get('h')]
    bb = max(bm, key=lambda b: b['h']) if bm else None
    b_, h_ = ((bb['b'], bb['h']) if bb else (250, 450))
    beams = []
    zf, zt = st.get('z_floor', 0.0), st.get('z_floor', 0.0) + st.get('H', 0.0)
    for L in st.get('landings') or []:
        if abs(L['z'] - zf) < 0.05 or abs(L['z'] - zt) < 0.05:
            continue
        # الحافة البعيدة عن نهايات القلبات
        ends = [f['xe'] for f in st['flights'] if not f.get('perp')] or [0.0]
        far = L['x1'] if min(abs(e - L['x0']) for e in ends) < min(abs(e - L['x1']) for e in ends) else L['x0']
        beams.append(dict(a=[far, L['y0'], L['z']], b=[far, L['y1'], L['z']], bw=b_, bh=h_, kind='landing',
                          mark=(bb or {}).get('mark')))
    if st.get('type') == 'cantilever':             # جسر مائل على الحافة الخارجية لكل قلبة
        for f, q in zip(st['flights'], fl):
            if f.get('perp'):
                continue
            d = -b_ / 2000.0 if q['lane'] == 0 else w + b_ / 2000.0
            y = q['p0'][1] + d
            x0, x1 = q['p0'][0], q['p0'][0] + q['u'][0] * q['going']
            beams.append(dict(a=[x0, y, q['z0']], b=[x1, y, q['z0'] + (q['n'] - 1) * q['R'] + q['R']], bw=b_, bh=max(h_, 400),
                              kind='inclined', mark=(bb or {}).get('mark')))
    st['beams3d'] = beams
    return fl


def plan_design(st, fc=25.0, fy=420.0):
    """تصميم قلبات درج المسقط بالكود (لا تسليح مرسوم بالمسقط): السماكة والحديد من stairs.flight،
    وفحوص الراحة للقائمة والنائمة."""
    q = st['flights'][0]
    w = st.get('width') or q['w']
    d = ST.flight(dict(steps=max(2, q['n'] - 1), tread=q['T'], rise=q['R'], width=w, fc=fc, fy=fy,
                       landing=min(w, 1.5)))
    for f in st['flights']:
        f['waist'] = d['waist']
    for L in st['landings']:
        L['t'] = d['waist']
    R, T = st['R'], st['T']
    bl = 2 * R + T
    st['design'] = dict(Mu=d['Mu'], As=d['As'], main=d['main']['label'], dist=d['dist']['label'], wu=d['wu'],
                        waist=d['waist'], span=d['span'], reaction=d['reaction'])
    st['rebar'] = dict(main=dict(d=d['main']['db'], s=d['main']['s']), dist=dict(d=d['dist']['db'], s=d['dist']['s']))
    st['checks'] = [
        dict(name='قاعدة بلوندل 2R+T', val='%.0f مم' % (bl * 1000), lim='600–650 مم', ok=0.60 <= bl <= 0.65,
             warn=0.58 <= bl <= 0.66 and not (0.60 <= bl <= 0.65), clause='قاعدة الراحة للدرج'),
        dict(name='القائمة R', val='%.0f مم' % (R * 1000), lim='≤ 190 مم', ok=R <= 0.19, warn=False, clause='IBC 1011.5.2'),
        dict(name='النائمة T', val='%.0f مم' % (T * 1000), lim='≥ 250 مم', ok=T >= 0.25, warn=False, clause='IBC 1011.5.2'),
        dict(name='سماكة البلاطة المائلة', val='%d مم (مصمَّمة)' % d['waist'], lim='≥ البحر/20',
             ok=True, warn=False, clause='ACI 318-19 جدول 7.3.1.1'),
        dict(name='الحديد الرئيسي', val=d['main']['label'], lim='Mu=%.1f kN·m/م' % d['Mu'], ok=True, warn=False,
             clause='ACI 318-19 7.5 · 7.6.1.1 · 7.7.2.3'),
        dict(name='حديد التوزيع', val=d['dist']['label'], lim='≥ 0.0018·b·h', ok=True, warn=False,
             clause='ACI 318-19 24.4.3.2'),
        dict(name='القص', val='Vu=%.1f kN/م' % d['Vu'], lim='φVc=%.1f kN/م' % d['phiVc'], ok=d['shear_ok'], warn=False,
             clause='ACI 318-19 22.5.5.1')]
    return st
