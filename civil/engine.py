# -*- coding: utf-8 -*-
"""
Civil / Structural engineering calculation engine.
Codes: ACI 318-19 (SI), ASCE 7-16 (ELF), Iraqi Code for Loads & Forces.
Units: mm, MPa, kN, kN.m, m  (frame analysis internally uses kN, m).
"""
import math

# ============================== linear algebra ==============================
def solve(A, b):
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for k in range(n):
        p = max(range(k, n), key=lambda r: abs(M[r][k]))
        if abs(M[p][k]) < 1e-10:
            raise ValueError("Unstable structure (singular stiffness matrix)")
        M[k], M[p] = M[p], M[k]
        pv = M[k][k]
        for r in range(k + 1, n):
            f = M[r][k] / pv
            if f:
                for c in range(k, n + 1):
                    M[r][c] -= f * M[k][c]
    x = [0.0] * n
    for k in range(n - 1, -1, -1):
        s = M[k][n] - sum(M[k][c] * x[c] for c in range(k + 1, n))
        x[k] = s / M[k][k]
    return x

# ============================ 2D frame (stiffness) ==========================
class Frame:
    """Planar frame, 3 DOF/node (ux, uy, rz). kN, m."""
    def __init__(self):
        self.nodes = []; self.members = []; self.sup = {}; self.nl = {}

    def node(self, x, y):
        self.nodes.append((x, y)); return len(self.nodes) - 1

    def member(self, i, j, E, A, I, qx=0.0, qy=0.0, tag="", meta=None):
        self.members.append(dict(i=i, j=j, E=E, A=A, I=I, qx=qx, qy=qy,
                                 tag=tag, meta=meta or {}))
        return len(self.members) - 1

    def support(self, n, fx=1, fy=1, mz=1):
        self.sup[n] = (fx, fy, mz)

    def load(self, n, Fx=0.0, Fy=0.0, Mz=0.0):
        p = self.nl.get(n, [0.0, 0.0, 0.0])
        self.nl[n] = [p[0] + Fx, p[1] + Fy, p[2] + Mz]

    def _geo(self, m):
        xi, yi = self.nodes[m['i']]; xj, yj = self.nodes[m['j']]
        dx, dy = xj - xi, yj - yi; L = math.hypot(dx, dy)
        return L, dx / L, dy / L

    @staticmethod
    def _kloc(E, A, I, L):
        ea = E * A / L; a = 12 * E * I / L ** 3; b = 6 * E * I / L ** 2
        c = 4 * E * I / L; d = 2 * E * I / L
        return [[ea, 0, 0, -ea, 0, 0],
                [0, a, b, 0, -a, b],
                [0, b, c, 0, -b, d],
                [-ea, 0, 0, ea, 0, 0],
                [0, -a, -b, 0, a, -b],
                [0, b, d, 0, -b, c]]

    @staticmethod
    def _T(c, s):
        return [[c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0],
                [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1]]

    @staticmethod
    def _w(m, c, s):
        return m['qx'] * c + m['qy'] * s, -m['qx'] * s + m['qy'] * c   # wx, wy local

    def run(self):
        nn = len(self.nodes); nd = 3 * nn
        K = [[0.0] * nd for _ in range(nd)]
        P = [0.0] * nd
        for n, v in self.nl.items():
            P[3 * n] += v[0]; P[3 * n + 1] += v[1]; P[3 * n + 2] += v[2]
        self._cache = []
        for m in self.members:
            L, c, s = self._geo(m)
            kl = self._kloc(m['E'], m['A'], m['I'], L); T = self._T(c, s)
            # kg = T' kl T
            kt = [[sum(kl[r][k] * T[k][cc] for k in range(6)) for cc in range(6)] for r in range(6)]
            kg = [[sum(T[k][r] * kt[k][cc] for k in range(6)) for cc in range(6)] for r in range(6)]
            wx, wy = self._w(m, c, s)
            q0 = [-wx * L / 2, -wy * L / 2, -wy * L * L / 12,
                  -wx * L / 2, -wy * L / 2, wy * L * L / 12]
            peq = [-sum(T[k][r] * q0[k] for k in range(6)) for r in range(6)]
            dof = [3 * m['i'], 3 * m['i'] + 1, 3 * m['i'] + 2,
                   3 * m['j'], 3 * m['j'] + 1, 3 * m['j'] + 2]
            for a in range(6):
                P[dof[a]] += peq[a]
                for b in range(6):
                    K[dof[a]][dof[b]] += kg[a][b]
            self._cache.append((L, c, s, kl, T, q0, dof, wx, wy))
        fixed = set()
        for n, f in self.sup.items():
            for k in range(3):
                if f[k]:
                    fixed.add(3 * n + k)
        free = [d for d in range(nd) if d not in fixed]
        Kr = [[K[a][b] for b in free] for a in free]
        Pr = [P[a] for a in free]
        ur = solve(Kr, Pr)
        U = [0.0] * nd
        for i, d in enumerate(free):
            U[d] = ur[i]
        self.U = U
        self.mf = []
        for idx, m in enumerate(self.members):
            L, c, s, kl, T, q0, dof, wx, wy = self._cache[idx]
            ug = [U[d] for d in dof]
            ul = [sum(T[r][k] * ug[k] for k in range(6)) for r in range(6)]
            q = [sum(kl[r][k] * ul[k] for k in range(6)) + q0[r] for r in range(6)]
            self.mf.append(q)
        # reactions
        self.reactions = {}
        for n in self.sup:
            self.reactions[n] = [0.0, 0.0, 0.0]
        for idx, m in enumerate(self.members):
            L, c, s, kl, T, q0, dof, wx, wy = self._cache[idx]
            q = self.mf[idx]
            qg = [sum(T[k][r] * q[k] for k in range(6)) for r in range(6)]
            for nd_, off in ((m['i'], 0), (m['j'], 3)):
                if nd_ in self.reactions:
                    for k in range(3):
                        self.reactions[nd_][k] += qg[off + k]
        for n in self.reactions:
            v = self.nl.get(n, [0, 0, 0])
            self.reactions[n] = [self.reactions[n][k] - v[k] for k in range(3)]
        return self

    def diagram(self, idx, ns=25):
        L, c, s, kl, T, q0, dof, wx, wy = self._cache[idx]
        m = self.members[idx]; q = self.mf[idx]
        EI = m['E'] * m['I']
        ug = [self.U[d] for d in dof]
        ul = [sum(T[r][k] * ug[k] for k in range(6)) for r in range(6)]
        vi, ti, vj, tj = ul[1], ul[2], ul[4], ul[5]
        out = []
        for k in range(ns + 1):
            x = L * k / ns; xi = x / L
            N = -(q[0] + wx * x)
            V = q[1] + wy * x
            M = -q[2] + q[1] * x + wy * x * x / 2
            h1 = 1 - 3 * xi ** 2 + 2 * xi ** 3; h2 = L * (xi - 2 * xi ** 2 + xi ** 3)
            h3 = 3 * xi ** 2 - 2 * xi ** 3; h4 = L * (-xi ** 2 + xi ** 3)
            d = h1 * vi + h2 * ti + h3 * vj + h4 * tj + wy * x * x * (L - x) ** 2 / (24 * EI)
            out.append(dict(x=x, N=N, V=V, M=M, d=d * 1000.0))  # d in mm
        return out

# ================================ ACI 318-19 ================================
ES = 200000.0
BARS = [10, 12, 16, 20, 25, 32, 40]
def ab(db): return math.pi * db * db / 4.0

def beta1(fc):
    if fc <= 28: return 0.85
    return max(0.65, 0.85 - 0.05 * (fc - 28) / 7.0)

def phi_flex(et, fy=420.0):
    ety = fy / ES
    if et <= ety: return 0.65
    if et >= ety + 0.003: return 0.90
    return 0.65 + 0.25 * (et - ety) / 0.003

def as_min(fc, fy, b, d):
    return max(0.25 * math.sqrt(fc) / fy, 1.4 / fy) * b * d

def pick_bars(As_req, dbs=(12, 16, 20, 25), nmin=2, nmax=10, width=None):
    """يختار عدد وقطر الأسياخ — أقل عدد أسياخ ضمن 15% من أقل مساحة كافية،
    مع مراعاة ما يتسع بعرض المقطع (25 مم خلوص) إن أُعطي العرض."""
    cands = []
    for db in dbs:
        n = max(nmin, math.ceil(As_req / ab(db)))
        if width:
            per = max(2, int((width - 2 * 40 - 2 * 10 + max(25.0, db)) // (db + max(25.0, db))))
            if n > 2 * per:
                continue
        if n > nmax:
            continue
        cands.append(dict(n=n, db=db, As=n * ab(db)))
    if not cands:
        db = dbs[-1]; n = max(nmin, math.ceil(As_req / ab(db)))
        cands = [dict(n=n, db=db, As=n * ab(db))]
    mn = min(c['As'] for c in cands)
    ok = [c for c in cands if c['As'] <= mn * 1.15]
    best = min(ok, key=lambda c: (c['n'], c['As']))
    best['label'] = "%dØ%d" % (best['n'], best['db'])
    return best

def bar_spacing(As, dbs=(10, 12, 16, 20, 25, 32), smin=100.0, smax=300.0, target=200.0):
    """يختار قطر السيخ وتباعده لشبكة (As بـ مم²/م) — أقرب تباعد عملي إلى 200 مم."""
    best = None
    for db in dbs:
        s = math.floor(1000.0 * ab(db) / As / 25.0) * 25.0
        if s < smin:
            continue
        s = min(s, smax)
        cand = dict(db=db, s=s, As=1000.0 * ab(db) / s,
                    label="Ø%d @ %d مم" % (db, int(s)))
        if best is None or abs(s - target) < abs(best['s'] - target) - 1e-9:
            best = cand
    if best is None:
        db = dbs[-1]
        best = dict(db=db, s=smin, As=1000.0 * ab(db) / smin,
                    label="Ø%d @ %d مم" % (db, int(smin)))
    return best

def flexure(Mu, b, d, fc, fy, h=None, min_rule='beam'):
    """Mu kN.m ; b,d,h mm.  min_rule: 'beam' = ACI 9.6.1.2 ،
    'slab' = حديد الانكماش 0.0018bh للبلاطات والأسس (ACI 7.6.1.1 / 13.3.2.1)."""
    def _min(b_, d_):
        if min_rule == 'slab':
            return 0.0018 * b_ * (h if h else d_ / 0.9)
        return as_min(fc, fy, b_, d_)
    Mu = abs(Mu)
    r = dict(Mu=Mu, b=b, d=d, fc=fc, fy=fy)
    if Mu < 1e-9:
        As = _min(b, d)
        r.update(As_req=As, As_min=As, doubly=False, phi=0.9, et=0.05,
                 ok=True, note="أقل حديد (عزم مهمل)")
        r['bars'] = pick_bars(As); r['phiMn'] = 0.0; r['ratio'] = 0.0
        return r
    Mn_u = Mu * 1e6  # N.mm  (phi applied by iteration)
    b1 = beta1(fc)
    # limit c for et = 0.004 (min for flexural members ACI 9.3.3.1)
    c_lim = 0.003 * d / (0.003 + 0.004)
    Mn_lim = 0.85 * fc * b1 * c_lim * b * (d - b1 * c_lim / 2)
    phi = 0.9
    for _ in range(40):
        Rn = (Mu * 1e6) / (phi * b * d * d)
        rad = 1 - 2 * Rn / (0.85 * fc)
        if rad < 0:
            break
        rho = 0.85 * fc / fy * (1 - math.sqrt(rad))
        As = rho * b * d
        a = As * fy / (0.85 * fc * b); c = a / b1
        et = 0.003 * (d - c) / c
        ph2 = phi_flex(et, fy)
        if abs(ph2 - phi) < 1e-4: break
        phi = ph2
    if rad < 0 or Mu * 1e6 > 0.9 * Mn_lim:
        # doubly reinforced
        dp = 60.0
        phi = 0.9
        As1 = 0.85 * fc * b1 * c_lim * b / fy
        Mn1 = 0.85 * fc * b1 * c_lim * b * (d - b1 * c_lim / 2)
        Mn2 = max(0.0, Mu * 1e6 / phi - Mn1)
        fsp = min(fy, ES * 0.003 * (c_lim - dp) / c_lim)
        As2 = Mn2 / (fy * (d - dp))
        Asp = Mn2 / (fsp * (d - dp)) if Mn2 > 0 else 0.0
        As = As1 + As2
        r.update(doubly=True, As_comp=Asp, phi=phi, et=0.004)
        r['bars_comp'] = pick_bars(Asp) if Asp > 0 else None
    else:
        r.update(doubly=False, phi=phi, et=et)
    Asmin = _min(b, d)
    As = max(As, Asmin)
    r['As_req'] = As; r['As_min'] = Asmin
    r['bars'] = pick_bars(As)
    Asp = r['bars']['As']
    a = min(Asp, 0.85 * fc * b1 * (0.003 * d / 0.003) * b / fy) * fy / (0.85 * fc * b)
    c = a / beta1(fc); et = 0.003 * (d - c) / c
    ph = phi_flex(et, fy)
    r['phiMn'] = ph * Asp * fy * (d - a / 2) / 1e6
    if r.get('doubly'):
        r['phiMn'] += ph * (r.get('As_comp', 0.0)) * fy * (d - 60.0) / 1e6
    r['rho'] = As / (b * d)
    r['ratio'] = Mu / r['phiMn'] if r['phiMn'] > 0 else 9.9
    r['ok'] = r['ratio'] <= 1.001
    r['note'] = ("مقطع مزدوج التسليح" if r.get('doubly')
                 else "مقطع مفرد التسليح")
    return r

def shear(Vu, bw, d, fc, fy, fyt=420.0, legs=2, db_stirrup=10, lam=1.0):
    """Vu kN. ACI 318-19 ch.22 (simplified Vc, Av>=Av,min)."""
    Vu = abs(Vu); phi = 0.75
    Vc = 0.17 * lam * math.sqrt(fc) * bw * d / 1000.0          # kN
    Vsmax = 0.66 * math.sqrt(fc) * bw * d / 1000.0
    r = dict(Vu=Vu, Vc=Vc, phiVc=phi * Vc, ok=True)
    Av = legs * ab(db_stirrup)
    if Vu <= 0.5 * phi * Vc:
        r.update(case="لا يحتاج أساور (يوضع الحد الأدنى)", Vs=0.0)
        s = min(d / 2, 600)
    elif Vu <= phi * Vc:
        r.update(case="أساور بالحد الأدنى", Vs=0.0)
        s = min(d / 2, 600)
    else:
        Vs = Vu / phi - Vc
        r['Vs'] = Vs
        if Vs > Vsmax:
            r['ok'] = False
            r['case'] = "المقطع غير كافٍ للقص — زد الأبعاد"
            s = 100.0
        else:
            r['case'] = "أساور محسوبة"
            s = Av * fyt * d / (Vs * 1000.0)
            smax = min(d / 2, 600) if Vs <= 0.33 * math.sqrt(fc) * bw * d / 1000.0 else min(d / 4, 300)
            s = min(s, smax)
    s_minreq = Av * fyt / max(0.062 * math.sqrt(fc) * bw, 0.35 * bw)
    s = min(s, s_minreq)
    s = max(75.0, math.floor(s / 25.0) * 25.0)
    r['s'] = s; r['Av'] = Av; r['db_stirrup'] = db_stirrup; r['legs'] = legs
    r['phiVn'] = phi * (Vc + Av * fyt * d / (s * 1000.0))
    r['ratio'] = Vu / r['phiVn'] if r['phiVn'] > 0 else 9.9
    r['ok'] = r['ok'] and r['ratio'] <= 1.001
    r['label'] = "Ø%d@%d (%dأرجل)" % (db_stirrup, int(s), legs)
    return r

BAR_STOCK = 12.0          # أقصى طول سيخ متوفر بالسوق (م)

LAP_MODES = [('code', 'محسوب وفق ACI 25.5.2.1 (صنف B = 1.3·ld)'),
             ('40db', 'قاعدة الموقع 40·db'), ('50db', 'قاعدة الموقع 50·db'),
             ('60db', 'قاعدة الموقع 60·db'), ('max', 'الأكبر من الكودي و 60·db')]

def lap_length(db, fc, fy, top=False, class_b=True, mode='code'):
    """طول الوصلة (Lap Splice). الكودي: ACI 25.5.2.1 صنف B = 1.3·ld ≥ 300 مم.
    وقواعد الموقع (40/50/60·db) متاحة كخيار."""
    ld = dev_length(db, fc, fy, top=top)
    code = max(300.0, (1.3 if class_b else 1.0) * ld)
    site = {'40db': 40.0, '50db': 50.0, '60db': 60.0}.get(mode)
    if site:
        return max(300.0, site * db)
    if mode == 'max':
        return max(code, 60.0 * db)
    return code

def cut_run(total_len, lap, max_len=BAR_STOCK):
    """تقطيع سيخ طويل على أطوال السوق مع وصلات — كل الأطوال بالمتر.
    يرجع مواضع القطع وأطوالها وعدد الوصلات والهدر."""
    lapm = lap / 1000.0
    if total_len <= max_len + 1e-9:
        return dict(n=1, piece=total_len, laps=0, lap=lapm, total_steel=total_len,
                    waste=0.0, starts=[0.0], lengths=[total_len])
    n = 1
    while (total_len + (n - 1) * lapm) / n > max_len:
        n += 1
        if n > 200:
            break
    piece = (total_len + (n - 1) * lapm) / n
    starts, lengths, x = [], [], 0.0
    for i in range(n):
        starts.append(x); lengths.append(piece)
        x += piece - lapm
    return dict(n=n, piece=piece, laps=n - 1, lap=lapm,
                total_steel=total_len + (n - 1) * lapm,
                waste=(n - 1) * lapm, starts=starts, lengths=lengths)

def punching(Vu, c1, c2, d, fc, pos='interior', lam=1.0):
    """قص الثقب (Two-way shear) — ACI 318-19 المادة 22.6.
    Vu بـ kN · c1,c2,d بالمليمتر · النتيجة kN."""
    d = max(d, 50.0)
    if pos == 'interior':
        b0 = 2 * (c1 + d) + 2 * (c2 + d); als = 40.0
    elif pos == 'edge':
        b0 = 2 * (c1 + d / 2) + (c2 + d); als = 30.0
    else:
        b0 = (c1 + d / 2) + (c2 + d / 2); als = 20.0
    beta = max(c1, c2) / min(c1, c2)
    v1 = 0.33 * lam * math.sqrt(fc)
    v2 = 0.17 * (1 + 2 / beta) * lam * math.sqrt(fc)
    v3 = 0.083 * (2 + als * d / b0) * lam * math.sqrt(fc)
    vc = min(v1, v2, v3)
    phiVc = 0.75 * vc * b0 * d / 1000.0
    r = Vu / phiVc if phiVc > 0 else 9.9
    if r <= 1.0:
        rec = 'مقبول'
    elif r <= 1.3:
        rec = 'زد سماكة العنصر 50–100 مم أو كبّر مقطع العمود'
    else:
        rec = 'يحتاج معالجة: زيادة السماكة أو رأس عمود (Drop Panel) أو مسامير قص (Shear Studs)'
    return dict(b0=b0, d=d, beta=beta, alpha_s=als, pos=pos, vc=vc, phiVc=phiVc,
                Vu=Vu, ratio=r, ok=r <= 1.0, rec=rec,
                govern=('0.33√f\'c' if vc == v1 else ('0.17(1+2/β)√f\'c' if vc == v2 else '0.083(2+αs·d/b0)√f\'c')))

def dev_length(db, fc, fy, top=False, epoxy=False, lam=1.0):
    pt = 1.3 if top else 1.0; pe = 1.5 if epoxy else 1.0
    ps = 0.8 if db <= 20 else 1.0
    cb_ktr = 1.5
    ld = (fy * pt * pe * ps / (1.1 * lam * math.sqrt(fc) * cb_ktr)) * db
    return max(ld, 300.0)

# --------------------------- column interaction ----------------------------
def col_layers(b, h, nb, nh, db, cover=40, ds=10):
    """bars on 4 faces: nb per top/bottom face, nh per side face (incl corners)."""
    d1 = cover + ds + db / 2
    layers = []
    layers.append([d1, nb * ab(db)])
    layers.append([h - d1, nb * ab(db)])
    inner = max(0, nh - 2)
    if inner > 0:
        sp = (h - 2 * d1) / (inner + 1)
        for k in range(1, inner + 1):
            layers.append([d1 + sp * k, 2 * ab(db)])
    return layers

def circ_layers(D, n, db, cover=40, ds=10):
    """أسياخ عمود دائري: موزّعة بالتساوي على دائرة، وعمق كل سيخ من ليف الضغط
    الأقصى d = R − r·cos φ. تُدمج الأسياخ المتساوية العمق بطبقة واحدة."""
    R = D / 2.0
    r = max(R - cover - ds - db / 2.0, 1.0)
    acc = {}
    for k in range(max(4, int(n))):
        phi = 2.0 * math.pi * k / max(4, int(n))
        d = R - r * math.cos(phi)
        key = round(d, 1)
        acc[key] = acc.get(key, 0.0) + ab(db)
    return sorted([[d, a] for d, a in acc.items()], key=lambda t: t[0])

def _circ_block(D, a):
    """قطعة الضغط بمقطع دائري: مساحتها وذراعها عن مركز الدائرة (a عمق الكتلة)."""
    R = D / 2.0
    a = max(0.0, min(a, D))
    if a <= 0:
        return 0.0, 0.0
    if a >= D:
        return math.pi * R * R, 0.0
    th = math.acos(max(-1.0, min(1.0, (R - a) / R)))       # نصف الزاوية المركزية
    A = R * R * (th - math.sin(th) * math.cos(th))
    if A <= 1e-9:
        return 0.0, 0.0
    ybar = (2.0 * R ** 3 * math.sin(th) ** 3) / (3.0 * A)  # عن مركز الدائرة
    return A, ybar

def col_interaction(b, h, fc, fy, layers, npts=40, shape='rect', D=None):
    """منحني التفاعل P–M. shape='circ' يستعمل هندسة القطعة الدائرية الحقيقية
    (مساحة القطعة الدائرية وذراعها) بدل كتلة مستطيلة — فالعمود الدائري يُصمَّم
    على مقطعه لا على مربع مكافئ."""
    b1 = beta1(fc)
    circ = (shape == 'circ' and D)
    if circ:
        h = float(D)
    Ast = sum(l[1] for l in layers)
    Ag = (math.pi * D * D / 4.0) if circ else (b * h)
    P0 = 0.85 * fc * (Ag - Ast) + fy * Ast
    dmax = max(l[0] for l in layers)
    pts = []
    # pure compression
    pts.append(dict(P=0.65 * 0.80 * P0 / 1000.0, M=0.0, phi=0.65, et=0.0,
                    Pn=P0 / 1000.0, Mn=0.0))
    cs = [dmax * (3.0 - 2.9 * i / (npts - 1.0)) for i in range(npts)]
    for c in cs:
        a = min(b1 * c, h)
        if circ:
            Ac, ybar = _circ_block(D, a)
            Cc = 0.85 * fc * Ac
            Pn = Cc; Mn = Cc * ybar
        else:
            Cc = 0.85 * fc * a * b
            Pn = Cc; Mn = Cc * (h / 2 - a / 2)
        for d_i, As_i in layers:
            e = 0.003 * (c - d_i) / c
            fs = max(-fy, min(fy, ES * e))
            if d_i <= a:
                fs -= 0.85 * fc
            Pn += As_i * fs
            Mn += As_i * fs * (h / 2 - d_i)
        et = 0.003 * (dmax - c) / c
        ph = phi_flex(et, fy)
        Pn_k = Pn / 1000.0; Mn_k = Mn / 1e6
        Pmax = 0.80 * P0 / 1000.0
        pts.append(dict(P=min(ph * Pn_k, 0.65 * Pmax) if et < fy / ES else ph * Pn_k,
                        M=ph * Mn_k, phi=ph, et=et, Pn=Pn_k, Mn=Mn_k))
    # pure tension
    pts.append(dict(P=-0.9 * Ast * fy / 1000.0, M=0.0, phi=0.9, et=0.05,
                    Pn=-Ast * fy / 1000.0, Mn=0.0))
    pts.sort(key=lambda p: -p['P'])
    return pts, P0 / 1000.0, Ast

def col_check(Pu, Mu, pts):
    """Return phiMn at Pu and utilization."""
    Pu = float(Pu); Mu = abs(float(Mu))
    lo = None
    for i in range(len(pts) - 1):
        a, b_ = pts[i], pts[i + 1]
        if (a['P'] - Pu) * (b_['P'] - Pu) <= 0 and abs(a['P'] - b_['P']) > 1e-9:
            t = (Pu - a['P']) / (b_['P'] - a['P'])
            lo = a['M'] + t * (b_['M'] - a['M'])
            break
    if lo is None:
        lo = 0.0
    ratio = 9.9 if lo <= 1e-6 else Mu / lo
    if Pu > pts[0]['P']:
        ratio = max(ratio, Pu / pts[0]['P'])
    return lo, ratio

# ======================= Iraqi Code — loads & materials =====================
LIVE = [  # الكود العراقي للأحمال والقوى — أحمال حية kN/m2
    ("سكني / غرف نوم", 2.0), ("مكاتب", 2.5), ("صفوف دراسية", 3.0),
    ("ممرات وأدراج ومخارج", 4.0), ("شرفات (بلكونات)", 4.0),
    ("قاعات اجتماعات - مقاعد ثابتة", 4.0), ("قاعات اجتماعات - بدون مقاعد", 5.0),
    ("مستشفى - غرف مرضى", 2.0), ("مستشفى - عمليات ومختبرات", 3.0),
    ("محلات تجارية - طابق أرضي", 5.0), ("محلات تجارية - طوابق عليا", 4.0),
    ("مخازن خفيفة", 6.0), ("مخازن ثقيلة", 12.0), ("مصانع خفيفة", 6.0),
    ("مواقف سيارات خاصة", 2.5), ("مكتبة - قاعة مطالعة", 3.0),
    ("مكتبة - رفوف كتب", 7.5), ("سطح غير قابل للاستخدام", 1.0),
    ("سطح قابل للاستخدام", 2.0), ("مطاعم", 4.0),
]
DENS = [  # kN/m3
    ("خرسانة مسلحة", 24.0), ("خرسانة عادية", 23.0), ("طابوق (بناء)", 18.0),
    ("بلوك خرساني", 14.0), ("ثرمستون", 8.0), ("بلاستر / جص", 17.0),
    ("مونة إسمنت", 21.0), ("كاشي / سيراميك", 23.0), ("رمل", 18.0),
    ("حصى (سبيس)", 20.0), ("تراب مدكوك", 18.0), ("حديد", 78.5), ("ماء", 10.0),
]
SEISMIC_CITIES = {  # قيم استرشادية Ss,S1 (g) — تُدقق مع خرائط الكود العراقي
    "بغداد": (0.20, 0.08), "البصرة": (0.15, 0.06), "الموصل": (0.35, 0.12),
    "أربيل": (0.40, 0.15), "السليمانية": (0.50, 0.18), "دهوك": (0.40, 0.15),
    "كركوك": (0.30, 0.11), "ديالى": (0.25, 0.10), "الأنبار": (0.15, 0.06),
    "النجف": (0.15, 0.06), "كربلاء": (0.15, 0.06), "بابل": (0.17, 0.07),
    "واسط": (0.20, 0.08), "ميسان": (0.17, 0.07), "ذي قار": (0.15, 0.06),
    "المثنى": (0.13, 0.05), "صلاح الدين": (0.28, 0.10), "القادسية": (0.15, 0.06),
}
SYSTEMS = {
    "إطارات خرسانية مقاومة للعزوم - عادية (OMF)": dict(R=3.0, Cd=2.5, O=3.0, Ct=0.0466, x=0.9),
    "إطارات خرسانية مقاومة للعزوم - متوسطة (IMF)": dict(R=5.0, Cd=4.5, O=3.0, Ct=0.0466, x=0.9),
    "إطارات خرسانية مقاومة للعزوم - خاصة (SMF)": dict(R=8.0, Cd=5.5, O=3.0, Ct=0.0466, x=0.9),
    "جدران قص خرسانية عادية": dict(R=4.0, Cd=4.0, O=2.5, Ct=0.0488, x=0.75),
    "جدران قص خرسانية خاصة": dict(R=5.0, Cd=5.0, O=2.5, Ct=0.0488, x=0.75),
    "نظام ثنائي: جدران خاصة + إطارات خاصة": dict(R=7.0, Cd=5.5, O=2.5, Ct=0.0488, x=0.75),
}
FA = {"A": [0.8]*5, "B": [0.9, 0.9, 1.0, 1.0, 1.0], "C": [1.3, 1.3, 1.2, 1.2, 1.2],
      "D": [1.6, 1.4, 1.2, 1.1, 1.0], "E": [2.4, 1.7, 1.3, 1.1, 0.9]}
FV = {"A": [0.8]*5, "B": [0.8, 0.8, 0.8, 0.8, 0.8], "C": [1.5, 1.5, 1.5, 1.5, 1.4],
      "D": [2.4, 2.2, 2.0, 1.9, 1.8], "E": [4.2, 3.3, 2.8, 2.4, 2.4]}
SS_PTS = [0.25, 0.5, 0.75, 1.0, 1.25]; S1_PTS = [0.1, 0.2, 0.3, 0.4, 0.5]

def _interp(xs, ys, x):
    if x <= xs[0]: return ys[0]
    if x >= xs[-1]: return ys[-1]
    for i in range(len(xs) - 1):
        if xs[i] <= x <= xs[i + 1]:
            t = (x - xs[i]) / (xs[i + 1] - xs[i])
            return ys[i] + t * (ys[i + 1] - ys[i])
    return ys[-1]

def seismic(p):
    city = p.get('city', 'بغداد')
    Ss, S1 = SEISMIC_CITIES.get(city, (0.20, 0.08))
    Ss = float(p.get('Ss') or Ss); S1 = float(p.get('S1') or S1)
    sc = p.get('site', 'D'); sysname = p.get('system', list(SYSTEMS)[1])
    sy = SYSTEMS.get(sysname, list(SYSTEMS.values())[1])
    Ie = float(p.get('Ie', 1.0)); hn = float(p['hn']); W = float(p['W'])
    Fa = _interp(SS_PTS, FA[sc], Ss); Fv = _interp(S1_PTS, FV[sc], S1)
    SMS = Fa * Ss; SM1 = Fv * S1; SDS = 2 * SMS / 3.0; SD1 = 2 * SM1 / 3.0
    Ta = sy['Ct'] * hn ** sy['x']
    T = float(p.get('T') or Ta)
    R = float(p.get('R') or sy['R'])
    Cs = SDS / (R / Ie)
    Cs_max = SD1 / (T * (R / Ie))
    Cs_min = max(0.044 * SDS * Ie, 0.01)
    Cs_use = max(min(Cs, Cs_max), Cs_min)
    V = Cs_use * W
    k = 1.0 if T <= 0.5 else (2.0 if T >= 2.5 else 1.0 + (T - 0.5) / 2.0)
    ws = p.get('stories') or []
    tot = sum(s['w'] * s['h'] ** k for s in ws) if ws else 0
    dist = []
    for s in ws:
        cvx = (s['w'] * s['h'] ** k / tot) if tot else 0
        dist.append(dict(level=s.get('name', ''), h=s['h'], w=s['w'],
                         cvx=cvx, Fx=cvx * V))
    acc = 0.0
    for d in reversed(dist):
        acc += d['Fx']; d['Vx'] = acc
    sdc = "A"
    for lim, cat in ((0.167, "B"), (0.33, "C"), (0.50, "D")):
        if SDS >= lim: sdc = cat
    return dict(city=city, Ss=Ss, S1=S1, site=sc, Fa=Fa, Fv=Fv, SMS=SMS, SM1=SM1,
                SDS=SDS, SD1=SD1, Ta=Ta, T=T, R=R, Ie=Ie, Cs=Cs, Cs_max=Cs_max,
                Cs_min=Cs_min, Cs_use=Cs_use, V=V, k=k, W=W, dist=dist, sdc=sdc,
                system=sysname, note="قيم Ss,S1 استرشادية — تُدقق مع خرائط الكود العراقي للمقاومة الزلزالية")

def wind(p):
    V = float(p.get('V', 34.0)); exp = p.get('exposure', 'B')
    h = float(p.get('h', 12.0)); B = float(p.get('B', 20.0))
    zg, al = {"B": (365.76, 7.0), "C": (274.32, 9.5), "D": (213.36, 11.5)}[exp]
    Kd = 0.85; Kzt = 1.0; G = 0.85
    lv = []
    z = 0.0; step = max(1.0, h / 8.0)
    while z < h + 1e-9:
        zz = max(z, 4.6)
        Kz = 2.01 * (zz / zg) ** (2.0 / al)
        qz = 0.613 * Kz * Kzt * Kd * V * V / 1000.0   # kPa
        lv.append(dict(z=round(z, 2), Kz=Kz, qz=qz, pw=G * 0.8 * qz))
        z += step
    qh = lv[-1]['qz']
    pl = G * (-0.5) * qh
    Ftot = sum((lv[i]['pw'] + abs(pl)) * B * step for i in range(len(lv))) * 0.5
    return dict(V=V, exposure=exp, levels=lv, qh=qh, p_lee=pl, B=B, h=h,
                F_total=Ftot, note="ضغط الرياح وفق ASCE 7 / الكود العراقي - طريقة الاتجاه")

def floor_load(p):
    t = float(p.get('slab', 150)); items = []
    items.append(("بلاطة خرسانية %d مم" % t, t / 1000.0 * 24.0))
    for nm, th, g in (("رمل", p.get('sand', 50), 18.0), ("مونة", p.get('mortar', 25), 21.0),
                      ("كاشي/سيراميك", p.get('tiles', 25), 23.0),
                      ("بلاستر سقف", p.get('plaster', 20), 17.0)):
        th = float(th or 0)
        if th > 0: items.append(("%s %d مم" % (nm, int(th)), th / 1000.0 * g))
    part = float(p.get('partitions', 1.0))
    if part > 0: items.append(("قواطع", part))
    extra = float(p.get('extra', 0.0))
    if extra > 0: items.append(("أحمال إضافية", extra))
    D = sum(i[1] for i in items)
    L = float(p.get('live', 2.0))
    combos = [("1.4D", 1.4 * D), ("1.2D + 1.6L", 1.2 * D + 1.6 * L),
              ("1.2D + 1.0L (زلزالي)", 1.2 * D + 1.0 * L), ("D + L (تشغيلي)", D + L)]
    return dict(items=[dict(name=a, v=b) for a, b in items], D=D, L=L,
                wu=1.2 * D + 1.6 * L, ws=D + L,
                combos=[dict(name=a, v=b) for a, b in combos])

# ================================= modules =================================
def Ec(fc): return 4700.0 * math.sqrt(fc)          # MPa
def _EI(fc, b, h): return Ec(fc) * 1000.0, b * h ** 3 / 12.0 / 1e12   # kN/m2 , m4

def cracked_I(b, h, d, As, fc, Ma, lam=1.0):
    """Effective moment of inertia (ACI 24.2.3, Branson). mm^4, Ma kN.m"""
    Ig = b * h ** 3 / 12.0
    fr = 0.62 * lam * math.sqrt(fc)
    Mcr = fr * Ig / (h / 2.0) / 1e6
    n = ES / Ec(fc)
    A = b / 2.0; B = n * As; C = -n * As * d
    kd = (-B + math.sqrt(B * B - 4 * A * C)) / (2 * A)
    Icr = b * kd ** 3 / 3.0 + n * As * (d - kd) ** 2
    if Ma <= Mcr or Ma <= 0: return Ig, Ig, Icr, Mcr
    r = (Mcr / Ma) ** 3
    Ie = min(Ig, r * Ig + (1 - r) * Icr)
    return Ie, Ig, Icr, Mcr

def min_h_beam(L, cond, fy=420.0):
    f = {"simple": 16.0, "one_end": 18.5, "both": 21.0, "cant": 8.0}.get(cond, 18.5)
    return L * 1000.0 / f * (0.4 + fy / 700.0)

def beam_module(p):
    sp = p['spans']; b = float(p['b']); h = float(p['h'])
    fc = float(p['fc']); fy = float(p['fy']); cov = float(p.get('cover', 40))
    dbs = float(p.get('db_stirrup', 10)); dbm = float(p.get('db_main', 16))
    d = h - cov - dbs - dbm / 2.0
    E, I = _EI(fc, b, h)
    sw = b * h / 1e6 * 24.0                      # kN/m self weight
    lf = bool(p.get('fix_left')); rf = bool(p.get('fix_right'))
    n = len(sp)
    def build(fac):
        f = Frame(); x = 0.0; nd = [f.node(0, 0)]
        for s in sp:
            x += float(s['L']); nd.append(f.node(x, 0))
        for k, s in enumerate(sp):
            wD = float(s['wD']) + sw; wL = float(s['wL'])
            f.member(nd[k], nd[k + 1], E, b * h / 1e6, I, qy=-(fac[k][0] * wD + fac[k][1] * wL))
        f.support(nd[0], 1, 1, 1 if lf else 0)
        f.support(nd[n], 0, 1, 1 if rf else 0)
        for k in range(1, n):
            f.support(nd[k], 0, 1, 0)
        return f.run()
    pats = [[(1.2, 1.6)] * n,
            [((1.2, 1.6) if k % 2 == 0 else (1.2, 0.0)) for k in range(n)],
            [((1.2, 1.6) if k % 2 == 1 else (1.2, 0.0)) for k in range(n)],
            [(1.4, 0.0)] * n]
    NS = 40
    env = []; xoff = 0.0
    for k, s in enumerate(sp):
        env.append([dict(x=xoff + float(s['L']) * i / NS, Mmax=-1e18, Mmin=1e18,
                         Vmax=0.0, V=0.0, M=0.0) for i in range(NS + 1)])
        xoff += float(s['L'])
    for fac in pats:
        fr = build(fac)
        for k in range(n):
            dg = fr.diagram(k, NS)
            for i, pt in enumerate(dg):
                e = env[k][i]
                e['Mmax'] = max(e['Mmax'], pt['M']); e['Mmin'] = min(e['Mmin'], pt['M'])
                if abs(pt['V']) > abs(e['Vmax']): e['Vmax'] = pt['V']
    fr1 = build(pats[0])
    for k in range(n):
        for i, pt in enumerate(fr1.diagram(k, NS)):
            env[k][i]['M'] = pt['M']; env[k][i]['V'] = pt['V']
    # service run for deflection
    frs = build([(1.0, 1.0)] * n)
    defl = []; dmax = 0.0; span_defl = []
    for k in range(n):
        dg = frs.diagram(k, NS)
        dd = min(pt['d'] for pt in dg)
        span_defl.append(dd)
        defl.append([dict(x=env[k][i]['x'], d=pt['d']) for i, pt in enumerate(dg)])
        dmax = min(dmax, dd)
    # design
    des = []
    for k, s in enumerate(sp):
        L = float(s['L'])
        Mpos = max(e['Mmax'] for e in env[k]); Mpos = max(Mpos, 0.0)
        fl = flexure(Mpos, b, d, fc, fy, h)
        fl['bars'] = pick_bars(fl['As_req'], width=b)
        i_d = min(NS, max(1, int(round(d / 1000.0 / L * NS))))
        Vu = max(abs(env[k][i_d]['Vmax']), abs(env[k][NS - i_d]['Vmax']))
        sh = shear(Vu, b, d, fc, fy, db_stirrup=int(dbs))
        Ma = max(abs(max(e['M'] for e in env[k])), 1.0)     # service moment
        Ie, Ig, Icr, Mcr = cracked_I(b, h, d, fl['bars']['As'], fc, Ma)
        dserv = span_defl[k] * (Ig / Ie if Ie > 0 else 1.0)
        lim = L * 1000.0 / 240.0
        des.append(dict(idx=k + 1, L=L, Mpos=Mpos, flex=fl, Vu=Vu, shear=sh,
                        d_imm=dserv, d_long=dserv * 2.0, d_limit=lim,
                        defl_ok=abs(dserv * 2.0) <= L * 1000.0 / 240.0,
                        h_min=min_h_beam(L, "both" if n > 1 else ("simple" if not (lf or rf) else "one_end"), fy),
                        Ie=Ie, Ig=Ig, Mcr=Mcr))
    sup = []
    for k in range(n + 1):
        M = 0.0
        if k > 0: M = min(M, env[k - 1][NS]['Mmin'])
        if k < n: M = min(M, env[k][0]['Mmin'])
        if k == 0 and not lf: M = min(M, 0.0)
        if abs(M) < 1e-6:
            sup.append(dict(idx=k, M=0.0, flex=None)); continue
        _f = flexure(M, b, d, fc, fy, h)
        _f['bars'] = pick_bars(_f['As_req'], width=b)
        sup.append(dict(idx=k, M=M, flex=_f))
    ld = dev_length(dbm, fc, fy, top=True)
    return dict(b=b, h=h, d=d, fc=fc, fy=fy, sw=sw, env=env, defl=defl,
                spans=[float(s['L']) for s in sp], design=des, supports=sup,
                ld_top=ld, ld_bot=dev_length(dbm, fc, fy), Ec=Ec(fc),
                total_L=sum(float(s['L']) for s in sp))

def column_module(p):
    b = float(p['b']); h = float(p['h']); fc = float(p['fc']); fy = float(p['fy'])
    nb = int(p.get('nb', 3)); nh = int(p.get('nh', 3)); db = float(p.get('db', 20))
    Pu = float(p['Pu']); Mu = float(p['Mu'])
    lu = float(p.get('lu', 3.0)); kf = float(p.get('k', 1.0))
    braced = bool(p.get('braced', True)); M1 = float(p.get('M1', 0.0))
    layers = col_layers(b, h, nb, nh, db)
    pts, P0, Ast = col_interaction(b, h, fc, fy, layers)
    rho = Ast / (b * h)
    r = 0.3 * h / 1000.0
    slend = kf * lu / r
    lim = min(40.0, 34 - 12 * (M1 / Mu if Mu else 0.0)) if braced else 22.0
    delta = 1.0; Mc = abs(Mu)
    if slend > lim:
        EIe = 0.4 * Ec(fc) * (b * h ** 3 / 12.0) / 1e6      # kN.m2
        Pc = math.pi ** 2 * EIe / (kf * lu) ** 2
        Cm = max(0.4, 0.6 + 0.4 * (M1 / Mu if Mu else 0.0)) if braced else 1.0
        delta = max(1.0, Cm / max(0.05, 1 - Pu / (0.75 * Pc)))
        Mc = delta * abs(Mu)
    phiMn, ratio = col_check(Pu, Mc, pts)
    dbt = 10 if db <= 32 else 12
    s_tie = min(16 * db, 48 * dbt, min(b, h))
    s_tie = math.floor(s_tie / 25.0) * 25.0
    return dict(b=b, h=h, fc=fc, fy=fy, Ast=Ast, rho=rho, P0=P0, pts=pts,
                Pu=Pu, Mu=Mu, Mc=Mc, delta=delta, slend=slend, slend_lim=lim,
                slender=slend > lim, phiMn=phiMn, ratio=ratio, ok=ratio <= 1.001,
                bars="%d Ø%d" % (2 * nb + 2 * (nh - 2) if nh > 2 else 2 * nb, db),
                nbars=2 * nb + 2 * max(0, nh - 2), db=db,
                ties="Ø%d @ %d mm" % (dbt, int(s_tie)), s_tie=s_tie,
                rho_ok=0.01 <= rho <= 0.08, phiPn_max=pts[0]['P'],
                Ag=b * h, layers=layers)

def footing_module(p):
    PD = float(p['PD']); PL = float(p['PL']); M = float(p.get('M', 0.0))
    qa = float(p['qa']); fc = float(p['fc']); fy = float(p['fy'])
    cx = float(p.get('cx', 400)); cy = float(p.get('cy', 400))
    Df = float(p.get('Df', 1.5)); cov = 75.0
    Ps = PD + PL; Pu = 1.2 * PD + 1.6 * PL; Mu = 1.6 * M
    q_net = qa - Df * 20.0
    A = Ps * 1.08 / max(q_net, 1.0)
    B = math.ceil(math.sqrt(A) * 20) / 20.0                     # 50 mm steps
    if M > 0:
        for _ in range(60):
            e = M / Ps
            if e <= B / 6.0 and Ps / (B * B) * (1 + 6 * e / B) <= q_net: break
            B += 0.05
    Bm = B * 1000.0
    qu = Pu / (B * B); qu_max = qu
    e = Mu / Pu if Pu else 0.0
    if e > 1e-6:
        qu_max = Pu / (B * B) * (1 + 6 * e / B) if e <= B / 6 else 2 * Pu / (3 * B * (B / 2 - e))
    h = 300.0
    for _ in range(60):
        d = h - cov - 16.0
        b0 = 2 * (cx + d) + 2 * (cy + d)
        beta = max(cx, cy) / min(cx, cy)
        vc = min(0.33, 0.17 * (1 + 2 / beta), 0.083 * (2 + 40 * d / b0)) * math.sqrt(fc)
        phiVc2 = 0.75 * vc * b0 * d / 1000.0
        Vu2 = qu_max * (B * B - (cx + d) * (cy + d) / 1e6)
        arm = (Bm - cx) / 2.0 - d
        Vu1 = qu_max * B * max(arm, 0.0) / 1000.0
        phiVc1 = 0.75 * 0.17 * math.sqrt(fc) * Bm * d / 1000.0
        if phiVc2 >= Vu2 and phiVc1 >= Vu1: break
        h += 25.0
    armf = (Bm - cx) / 2000.0
    Mu_f = qu_max * B * armf ** 2 / 2.0
    fl = flexure(Mu_f / B, 1000.0, d, fc, fy, h, min_rule='slab')
    As_min = 0.0018 * 1000.0 * h
    As = max(fl['As_req'], As_min)
    bar = bar_spacing(As, smax=min(3 * h, 300.0))
    s = bar['s']
    nb_tot = int(B * 1000.0 / s) + 1
    Ab_col = cx * cy
    phi_br = 0.65 * 0.85 * fc * Ab_col / 1000.0 * min(2.0, math.sqrt(B * B * 1e6 / Ab_col))
    return dict(B=B, h=h, d=d, qu=qu, qu_max=qu_max, q_net=q_net, Ps=Ps, Pu=Pu,
                Vu2=Vu2, phiVc2=phiVc2, Vu1=Vu1, phiVc1=phiVc1, Mu=Mu_f,
                As=As, As_min=As_min, bar=bar, spacing=s, nbars=nb_tot,
                bars_label="%s بالاتجاهين" % bar['label'], bar_db=bar['db'],
                punch_ratio=Vu2 / phiVc2 if phiVc2 else 9.9,
                oneway_ratio=Vu1 / phiVc1 if phiVc1 else 9.9,
                bearing=phi_br, dowels=0.005 * Ab_col, conc=B * B * h / 1000.0,
                ok=(Vu2 <= phiVc2 and Vu1 <= phiVc1), cx=cx, cy=cy, Df=Df, fc=fc, fy=fy)

def slab_module(p):
    kind = p.get('kind', 'one'); fc = float(p['fc']); fy = float(p['fy'])
    Lx = float(p['Lx']); Ly = float(p.get('Ly', Lx)); nsp = int(p.get('nspans', 3))
    wD = float(p['wD']); wL = float(p['wL']); cov = float(p.get('cover', 20))
    if kind == 'one':
        hmin = min_h_beam(Lx, "both" if nsp > 2 else "one_end", fy) / (16.0 / 20.0)
        hmin = Lx * 1000.0 / (24.0 if nsp > 1 else 20.0) * (0.4 + fy / 700.0)
        h = float(p.get('h') or math.ceil(hmin / 10.0) * 10.0)
        sw = h / 1000.0 * 24.0
        wu = 1.2 * (wD + sw) + 1.6 * wL
        ln = Lx
        cases = [("عزم موجب - الفضاء الطرفي", wu * ln ** 2 / 14.0, 1),
                 ("عزم موجب - الفضاء الداخلي", wu * ln ** 2 / 16.0, 1),
                 ("عزم سالب - وجه أول مسند داخلي", -wu * ln ** 2 / (9.0 if nsp == 2 else 10.0), -1),
                 ("عزم سالب - مساند داخلية أخرى", -wu * ln ** 2 / 11.0, -1),
                 ("عزم سالب - المسند الخارجي", -wu * ln ** 2 / 24.0, -1)]
        d = h - cov - 6.0
        res = []
        for nm, M, sgn in cases:
            fl = flexure(M, 1000.0, d, fc, fy, h, min_rule='slab')
            As = max(fl['As_req'], 0.0018 * 1000.0 * h)
            bar = bar_spacing(As, dbs=(10, 12, 16, 20), smax=min(3 * h, 450))
            res.append(dict(name=nm, M=M, As=As, db=bar['db'], s=bar['s'], label=bar['label']))
        Ash = 0.0018 * 1000.0 * h
        bsp = bar_spacing(Ash, dbs=(10, 12), smax=min(5 * h, 450))
        bs = dict(db=bsp['db']); ssh = bsp['s']
        V = 1.15 * wu * ln / 2.0
        phiVc = 0.75 * 0.17 * math.sqrt(fc) * 1000.0 * d / 1000.0
        return dict(kind=kind, h=h, hmin=hmin, d=d, sw=sw, wu=wu, results=res,
                    shrink=dict(As=Ash, label="Ø%d @ %d مم" % (bs['db'], int(ssh))),
                    V=V, phiVc=phiVc, shear_ok=V <= phiVc, Lx=Lx, fc=fc, fy=fy)
    else:
        L1, L2 = max(Lx, Ly), min(Lx, Ly)
        beta = L1 / L2
        hmin = (L1 * 1000.0) * (0.8 + fy / 1400.0) / 36.0
        h = float(p.get('h') or math.ceil(hmin / 10.0) * 10.0)
        sw = h / 1000.0 * 24.0
        wu = 1.2 * (wD + sw) + 1.6 * wL
        d = h - cov - 10.0
        out = []
        cw = float(p.get('col', 0.4))
        for nm, ln, l2 in (("الاتجاه الطويل L1", L1, L2), ("الاتجاه القصير L2", L2, L1)):
            Mo = wu * l2 * max(ln - cw, 0.65 * ln) ** 2 / 8.0
            rows = [("مسند داخلي (سالب)", -0.65 * Mo), ("فضاء داخلي (موجب)", 0.35 * Mo),
                    ("مسند خارجي (سالب)", -0.26 * Mo), ("فضاء طرفي (موجب)", 0.52 * Mo)]
            det = []
            for r_, M in rows:
                Mcs = 0.75 * M if M < 0 else 0.60 * M     # column strip share
                bstrip = min(0.25 * ln, 0.25 * l2) * 2 * 1000.0
                fl = flexure(Mcs, bstrip, d, fc, fy, h, min_rule='slab')
                As = max(fl['As_req'], 0.0018 * bstrip * h)
                Asm = As / (bstrip / 1000.0)                 # مم²/م
                bar = bar_spacing(Asm, dbs=(10, 12, 16, 20), smax=min(2 * h, 450))
                det.append(dict(name=r_, M=M, Mcs=Mcs, As=As, As_m=Asm,
                                db=bar['db'], s=bar['s'], label=bar['label']))
            out.append(dict(dir=nm, Mo=Mo, rows=det))
        return dict(kind=kind, h=h, hmin=hmin, d=d, sw=sw, wu=wu, beta=beta,
                    L1=L1, L2=L2, dirs=out, fc=fc, fy=fy,
                    two_way=beta <= 2.0)

# ============================== X-RAY (full frame) ==========================
def xray(p):
    bays = [float(x) for x in p['bays']]
    hts = [float(x) for x in p['heights']]
    bb, hb = float(p['beam_b']), float(p['beam_h'])
    bc, hc = float(p['col_b']), float(p['col_h'])
    fc = float(p['fc']); fy = float(p['fy'])
    wD = float(p['wD']); wL = float(p['wL']); trib = float(p.get('trib', 4.0))
    cov = 40.0; dbm = 16.0
    E = Ec(fc) * 1000.0
    Ib = bb * hb ** 3 / 12.0 / 1e12 * 0.35     # cracked stiffness ACI 6.6.3.1.1
    Ic = bc * hc ** 3 / 12.0 / 1e12 * 0.70
    Ab = bb * hb / 1e6; Ac = bc * hc / 1e6
    nb = len(bays); ns = len(hts)
    xs = [0.0]
    for b in bays: xs.append(xs[-1] + b)
    ys = [0.0]
    for h in hts: ys.append(ys[-1] + h)
    swb = Ab * 24.0
    gD = wD * trib + swb
    gL = wL * trib
    W_floor = (wD + 0.25 * wL) * trib * xs[-1]
    seis = None; F = [0.0] * (ns + 1)
    if p.get('seismic'):
        st = [dict(name="طابق %d" % i, w=W_floor, h=ys[i]) for i in range(1, ns + 1)]
        seis = seismic(dict(city=p.get('city', 'بغداد'), site=p.get('site', 'D'),
                            system=p.get('system', list(SYSTEMS)[1]),
                            hn=ys[-1], W=W_floor * ns, stories=st))
        for i, d in enumerate(seis['dist']):
            F[i + 1] = d['Fx']
    def build(cD, cL, cE):
        f = Frame(); nid = {}
        for j in range(ns + 1):
            for i in range(nb + 1):
                nid[(i, j)] = f.node(xs[i], ys[j])
        mem = []
        for j in range(ns):
            for i in range(nb + 1):
                idx = f.member(nid[(i, j)], nid[(i, j + 1)], E, Ac, Ic, tag="col",
                               meta=dict(story=j + 1, line=i + 1))
                mem.append(('col', j + 1, i + 1, idx))
        for j in range(1, ns + 1):
            for i in range(nb):
                idx = f.member(nid[(i, j)], nid[(i + 1, j)], E, Ab, Ib,
                               qy=-(cD * gD + cL * gL), tag="beam",
                               meta=dict(story=j, bay=i + 1))
                mem.append(('beam', j, i + 1, idx))
        for i in range(nb + 1):
            f.support(nid[(i, 0)])
        if cE:
            for j in range(1, ns + 1):
                f.load(nid[(0, j)], Fx=cE * F[j])
        return f.run(), mem
    combos = [("1.4D", 1.4, 0.0, 0.0), ("1.2D+1.6L", 1.2, 1.6, 0.0)]
    if seis:
        combos += [("1.2D+1.0L+1.0E", 1.2, 1.0, 1.0), ("1.2D+1.0L-1.0E", 1.2, 1.0, -1.0),
                   ("0.9D+1.0E", 0.9, 0.0, 1.0), ("0.9D-1.0E", 0.9, 0.0, -1.0)]
    env = {}; drift = [0.0] * (ns + 1); base = 0.0
    for nm, cD, cL, cE in combos:
        fr, mem = build(cD, cL, cE)
        for kind, a, b_, idx in mem:
            key = (kind, a, b_)
            dg = fr.diagram(idx, 12)
            Mx = max(pt['M'] for pt in dg); Mn_ = min(pt['M'] for pt in dg)
            Vx = max(abs(pt['V']) for pt in dg); Nx = min(pt['N'] for pt in dg)
            Nt = max(pt['N'] for pt in dg)
            e_ = env.setdefault(key, dict(Mmax=-1e18, Mmin=1e18, V=0.0, Nc=0.0, Nt=0.0,
                                          i=fr.members[idx]['i'], j=fr.members[idx]['j']))
            e_['Mmax'] = max(e_['Mmax'], Mx); e_['Mmin'] = min(e_['Mmin'], Mn_)
            e_['V'] = max(e_['V'], Vx); e_['Nc'] = min(e_['Nc'], Nx); e_['Nt'] = max(e_['Nt'], Nt)
        if cE:
            for j in range(1, ns + 1):
                drift[j] = max(drift[j], abs(fr.U[3 * (j * (nb + 1))] * 1000.0))
        if nm == "1.2D+1.6L":
            base = sum(fr.reactions[n][1] for n in fr.reactions)
    dcol = hc - cov - 10 - 20 / 2.0
    dbeam = hb - cov - 10 - dbm / 2.0
    layers = col_layers(bc, hc, int(p.get('nb_bars', 3)), int(p.get('nh_bars', 3)),
                        float(p.get('db_col', 20)))
    pts, P0, Ast = col_interaction(bc, hc, fc, fy, layers)
    members = []; worst = 0.0
    for (kind, a, b_), e_ in sorted(env.items()):
        if kind == 'beam':
            Mpos = max(0.0, e_['Mmax']); Mneg = abs(min(0.0, e_['Mmin']))
            f1 = flexure(Mpos, bb, dbeam, fc, fy, hb); f1['bars'] = pick_bars(f1['As_req'], width=bb)
            f2 = flexure(Mneg, bb, dbeam, fc, fy, hb); f2['bars'] = pick_bars(f2['As_req'], width=bb)
            sh = shear(e_['V'], bb, dbeam, fc, fy)
            ratio = max(f1['ratio'], f2['ratio'], sh['ratio'])
            det = dict(bot=f1['bars']['label'], top=f2['bars']['label'], stirrups=sh['label'],
                       Mpos=Mpos, Mneg=-Mneg, V=e_['V'], phiMn=f1['phiMn'], phiVn=sh['phiVn'])
        else:
            Pu = abs(e_['Nc']); Mu = max(abs(e_['Mmax']), abs(e_['Mmin']))
            phiMn, ratio = col_check(Pu, Mu, pts)
            det = dict(P=Pu, M=Mu, phiMn=phiMn, phiPn_max=pts[0]['P'],
                       bars="%d Ø%d" % (len(layers) and (2 * int(p.get('nb_bars', 3)) +
                            2 * max(0, int(p.get('nh_bars', 3)) - 2)), int(p.get('db_col', 20))))
        worst = max(worst, ratio)
        members.append(dict(kind=kind, story=a, pos=b_, ratio=ratio,
                            xi=None, det=det, forces=dict(Mmax=e_['Mmax'], Mmin=e_['Mmin'],
                            V=e_['V'], Nc=e_['Nc'], Nt=e_['Nt']), ni=e_['i'], nj=e_['j']))
    nodes = []
    for j in range(ns + 1):
        for i in range(nb + 1):
            nodes.append(dict(x=xs[i], y=ys[j]))
    Cd = SYSTEMS.get(p.get('system', list(SYSTEMS)[1]), list(SYSTEMS.values())[1])['Cd']
    drift = [d * Cd for d in drift]
    drift_lim = [0.02 * h * 1000.0 for h in hts]
    conc = (sum(bays) * ns * Ab) + ((nb + 1) * sum(hts) * Ac)
    return dict(nodes=nodes, nb=nb, ns=ns, xs=xs, ys=ys, members=members,
                worst=worst, seismic=seis, drift=drift[1:], drift_lim=drift_lim,
                base=base, gD=gD, gL=gL, W=W_floor * ns, conc=conc,
                beam=dict(b=bb, h=hb, d=dbeam), col=dict(b=bc, h=hc, d=dcol),
                col_pts=pts, fc=fc, fy=fy, combos=[c[0] for c in combos])

# ================================== BOQ ====================================
def boq(p):
    rows = []
    rate = p.get('rates', {})
    r_c = float(rate.get('concrete', 150000)); r_s = float(rate.get('steel', 1200000))
    r_f = float(rate.get('form', 25000)); r_e = float(rate.get('excav', 15000))
    r_b = float(rate.get('block', 20000)); r_p = float(rate.get('plaster', 12000))
    tot_c = tot_s = tot_f = 0.0
    for it in p.get('items', []):
        n = int(it.get('n', 1)); typ = it.get('type', 'beam')
        b = float(it.get('b', 0)) / 1000.0; h = float(it.get('h', 0)) / 1000.0
        L = float(it.get('L', 0))
        if typ == 'slab':
            v = float(it.get('area', 0)) * h * n
            fa = float(it.get('area', 0)) * n
            rho = float(it.get('rho', 90))
        else:
            v = b * h * L * n
            fa = (2 * h + b) * L * n if typ == 'beam' else 2 * (b + h) * L * n
            rho = float(it.get('rho', 120 if typ == 'beam' else 140))
        st = v * rho / 1000.0    # ton (kg/m3 -> ton)
        tot_c += v; tot_s += st; tot_f += fa
        rows.append(dict(name=it.get('name', typ), n=n, conc=v, steel=st, form=fa,
                         cost=v * r_c + st * 1000 * r_s / 1000.0 + fa * r_f))
    exc = float(p.get('excav', 0.0)); blk = float(p.get('block', 0.0)); pl = float(p.get('plaster', 0.0))
    extra = [dict(name="حفريات", q=exc, unit="م3", rate=r_e, cost=exc * r_e),
             dict(name="بناء طابوق/بلوك", q=blk, unit="م2", rate=r_b, cost=blk * r_b),
             dict(name="لبخ وإكساء", q=pl, unit="م2", rate=r_p, cost=pl * r_p)]
    total = sum(r['cost'] for r in rows) + sum(e['cost'] for e in extra)
    return dict(rows=rows, extra=extra, conc=tot_c, steel=tot_s, form=tot_f,
                total=total, cement=tot_c * 7.0, sand=tot_c * 0.45, gravel=tot_c * 0.85,
                rates=dict(concrete=r_c, steel=r_s, form=r_f, excav=r_e, block=r_b, plaster=r_p))
