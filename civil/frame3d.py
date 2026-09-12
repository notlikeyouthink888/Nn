# -*- coding: utf-8 -*-
"""
محرك تحليل الإطارات الفراغية (3D Space Frame) — 6 درجات حرية لكل عقدة.
مصفوفة عنصر 12×12: محوري + التواء + انحناء حول المحورين.
ديافرام صلب لكل طابق · حل شريطي LDLᵀ · مكتبة بايثون القياسية فقط.
الوحدات: kN و m (E بـ kN/m²).
"""
import math

# --------------------------- ثابت الالتواء J ---------------------------
_BETA = [(1.0, .141), (1.5, .196), (2.0, .229), (2.5, .249), (3.0, .263),
         (4.0, .281), (5.0, .291), (6.0, .299), (10.0, .312), (1e9, .333)]

def torsion_J(b, h):
    """ثابت الالتواء لمقطع مستطيل: J = β·b³·h (b الضلع الأقصر)."""
    b, h = min(b, h), max(b, h)
    r = h / b
    for k in range(len(_BETA) - 1):
        if _BETA[k][0] <= r <= _BETA[k + 1][0]:
            t = (r - _BETA[k][0]) / (_BETA[k + 1][0] - _BETA[k][0])
            beta = _BETA[k][1] + t * (_BETA[k + 1][1] - _BETA[k][1])
            break
    else:
        beta = .333
    return beta * b ** 3 * h

# ------------------------- حل نظام شريطي متماثل -------------------------
def solve_sym_band(A, b, bw):
    """LDLᵀ لمصفوفة متماثلة موجبة بعرض نطاق bw — O(n·bw²)."""
    n = len(b)
    for j in range(n):
        lo = max(0, j - bw)
        for i in range(lo, j):
            s = A[j][i]
            for k in range(max(lo, i - bw), i):
                s -= A[j][k] * A[i][k] * A[k][k]
            A[j][i] = s / A[i][i]
        s = A[j][j]
        for k in range(lo, j):
            s -= A[j][k] * A[j][k] * A[k][k]
        if abs(s) < 1e-12:
            raise ValueError('منشأ غير مستقر عند الدرجة %d' % j)
        A[j][j] = s
    y = list(b)
    for i in range(n):
        for k in range(max(0, i - bw), i):
            y[i] -= A[i][k] * y[k]
    for i in range(n):
        y[i] /= A[i][i]
    for i in range(n - 1, -1, -1):
        for k in range(i + 1, min(n, i + bw + 1)):
            y[i] -= A[k][i] * y[k]
    return y

# ------------------------------- الإطار -------------------------------
class Frame3D:
    def __init__(self, nu=0.2):
        self.nodes = []          # (x, y, z)
        self.members = []
        self.sup = {}            # node -> (fx,fy,fz,mx,my,mz) 1 = مقيّد
        self.nl = {}             # node -> [Fx,Fy,Fz,Mx,My,Mz]
        self.diaph = []          # [{'nodes': [...], 'cx':, 'cy':}]
        self.nu = nu

    def node(self, x, y, z):
        self.nodes.append((x, y, z)); return len(self.nodes) - 1

    def member(self, i, j, E, A, Iy, Iz, J, qy=0.0, qz=0.0, tag='', meta=None, G=None):
        self.members.append(dict(i=i, j=j, E=E, G=G or E / (2 * (1 + self.nu)),
                                 A=A, Iy=Iy, Iz=Iz, J=J, qy=qy, qz=qz,
                                 tag=tag, meta=meta or {}, alive=True))
        return len(self.members) - 1

    def support(self, n, *f):
        self.sup[n] = tuple(f) if f else (1, 1, 1, 1, 1, 1)

    def load(self, n, Fx=0., Fy=0., Fz=0., Mx=0., My=0., Mz=0.):
        p = self.nl.get(n, [0.] * 6)
        for k, v in enumerate((Fx, Fy, Fz, Mx, My, Mz)):
            p[k] += v
        self.nl[n] = p

    def diaphragm(self, nodes):
        xs = [self.nodes[n][0] for n in nodes]; ys = [self.nodes[n][1] for n in nodes]
        self.diaph.append(dict(nodes=list(nodes), cx=sum(xs) / len(xs), cy=sum(ys) / len(ys)))

    # ------------------------ هندسة العنصر ------------------------
    def _geom(self, m):
        xi, yi, zi = self.nodes[m['i']]; xj, yj, zj = self.nodes[m['j']]
        dx, dy, dz = xj - xi, yj - yi, zj - zi
        L = math.sqrt(dx * dx + dy * dy + dz * dz)
        ex = (dx / L, dy / L, dz / L)
        ref = (0., 1., 0.) if abs(ex[2]) > .999 else (0., 0., 1.)
        ey = (ref[1] * ex[2] - ref[2] * ex[1], ref[2] * ex[0] - ref[0] * ex[2],
              ref[0] * ex[1] - ref[1] * ex[0])
        n = math.sqrt(sum(v * v for v in ey)) or 1.0
        ey = tuple(v / n for v in ey)
        ez = (ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2],
              ex[0] * ey[1] - ex[1] * ey[0])
        return L, (ex, ey, ez)

    @staticmethod
    def _kloc(m, L):
        E, G, A, Iy, Iz, J = m['E'], m['G'], m['A'], m['Iy'], m['Iz'], m['J']
        k = [[0.0] * 12 for _ in range(12)]
        ea = E * A / L; gj = G * J / L
        k[0][0] = k[6][6] = ea; k[0][6] = k[6][0] = -ea
        k[3][3] = k[9][9] = gj; k[3][9] = k[9][3] = -gj
        a = 12 * E * Iz / L ** 3; b = 6 * E * Iz / L ** 2
        c = 4 * E * Iz / L; d = 2 * E * Iz / L
        k[1][1] = k[7][7] = a; k[1][7] = k[7][1] = -a
        k[1][5] = k[5][1] = k[1][11] = k[11][1] = b
        k[5][7] = k[7][5] = k[7][11] = k[11][7] = -b
        k[5][5] = k[11][11] = c; k[5][11] = k[11][5] = d
        a = 12 * E * Iy / L ** 3; b = 6 * E * Iy / L ** 2
        c = 4 * E * Iy / L; d = 2 * E * Iy / L
        k[2][2] = k[8][8] = a; k[2][8] = k[8][2] = -a
        k[2][4] = k[4][2] = k[2][10] = k[10][2] = -b
        k[4][8] = k[8][4] = k[8][10] = k[10][8] = b
        k[4][4] = k[10][10] = c; k[4][10] = k[10][4] = d
        return k

    @staticmethod
    def _q0(m, L, R):
        """أحمال التثبيت (الحمل معطى بالإحداثيات العامة qy, qz لكل وحدة طول)."""
        gx, gy, gz = 0.0, m['qy'], m['qz']
        wx = R[0][0] * gx + R[0][1] * gy + R[0][2] * gz
        wy = R[1][0] * gx + R[1][1] * gy + R[1][2] * gz
        wz = R[2][0] * gx + R[2][1] * gy + R[2][2] * gz
        return [-wx * L / 2, -wy * L / 2, -wz * L / 2, 0.0, wz * L * L / 12, -wy * L * L / 12,
                -wx * L / 2, -wy * L / 2, -wz * L / 2, 0.0, -wz * L * L / 12, wy * L * L / 12], (wx, wy, wz)

    # ---------------------------- التجميع ----------------------------
    def _map_dofs(self):
        """يبني خريطة كل درجة حرية → قائمة (رقم المعادلة، المعامل)."""
        nn = len(self.nodes)
        self.dmap = [[[] for _ in range(6)] for _ in range(nn)]
        in_d = {}
        for k, d in enumerate(self.diaph):
            for n in d['nodes']:
                in_d[n] = k
        eq = 0
        # ترتيب: لكل ديافرام (3 معادلات) ثم عقده، وأخيراً العقد الحرة
        self.master = []
        done = set()
        for k, d in enumerate(self.diaph):
            mx, my, mr = eq, eq + 1, eq + 2
            eq += 3
            self.master.append((mx, my, mr))
            for n in d['nodes']:
                s = self.sup.get(n, (0,) * 6)
                x, y, _ = self.nodes[n]
                dm = self.dmap[n]
                if not s[0]: dm[0] = [(mx, 1.0), (mr, -(y - d['cy']))]
                if not s[1]: dm[1] = [(my, 1.0), (mr, (x - d['cx']))]
                if not s[5]: dm[5] = [(mr, 1.0)]
                for q in (2, 3, 4):
                    if not s[q]:
                        dm[q] = [(eq, 1.0)]; eq += 1
                done.add(n)
        for n in range(nn):
            if n in done: continue
            s = self.sup.get(n, (0,) * 6)
            for q in range(6):
                if not s[q]:
                    self.dmap[n][q] = [(eq, 1.0)]; eq += 1
        self.neq = eq
        bw = 0
        for m in self.members:
            if not m['alive']: continue
            idx = [p[0] for q in range(6) for p in self.dmap[m['i']][q]] + \
                  [p[0] for q in range(6) for p in self.dmap[m['j']][q]]
            if idx:
                bw = max(bw, max(idx) - min(idx))
        self.bw = bw
        return eq

    def run(self):
        n = self._map_dofs()
        if n == 0:
            raise ValueError('لا توجد درجات حرية حرة')
        K = [[0.0] * n for _ in range(n)]
        P = [0.0] * n
        for nd, v in self.nl.items():
            for q in range(6):
                for (p, c) in self.dmap[nd][q]:
                    P[p] += c * v[q]
        self._cache = []
        for m in self.members:
            if not m['alive']:
                self._cache.append(None); continue
            L, R = self._geom(m)
            kl = self._kloc(m, L)
            T = [[0.0] * 12 for _ in range(12)]
            for blk in range(4):
                for a in range(3):
                    for b in range(3):
                        T[blk * 3 + a][blk * 3 + b] = R[a][b]
            kt = [[sum(kl[r][k2] * T[k2][c] for k2 in range(12)) for c in range(12)] for r in range(12)]
            kg = [[sum(T[k2][r] * kt[k2][c] for k2 in range(12)) for c in range(12)] for r in range(12)]
            q0, w = self._q0(m, L, R)
            peq = [-sum(T[k2][r] * q0[k2] for k2 in range(12)) for r in range(12)]
            maps = [self.dmap[m['i']][q] for q in range(6)] + [self.dmap[m['j']][q] for q in range(6)]
            for a in range(12):
                for (pa, ca) in maps[a]:
                    P[pa] += ca * peq[a]
                    for b in range(12):
                        kab = kg[a][b]
                        if kab == 0.0: continue
                        for (pb, cb) in maps[b]:
                            K[pa][pb] += ca * cb * kab
            self._cache.append((L, R, kl, T, q0, maps, w))
        self.U = solve_sym_band(K, P, self.bw)
        self.mf = []
        for idx, m in enumerate(self.members):
            c = self._cache[idx]
            if c is None:
                self.mf.append(None); continue
            L, R, kl, T, q0, maps, w = c
            ug = [sum(cf * self.U[p] for (p, cf) in maps[a]) for a in range(12)]
            ul = [sum(T[r][k2] * ug[k2] for k2 in range(12)) for r in range(12)]
            self.mf.append([sum(kl[r][k2] * ul[k2] for k2 in range(12)) + q0[r] for r in range(12)])
        self.reactions = {}
        for nd in self.sup:
            self.reactions[nd] = [0.0] * 6
        for idx, m in enumerate(self.members):
            c = self._cache[idx]
            if c is None: continue
            L, R, kl, T, q0, maps, w = c
            q = self.mf[idx]
            qg = [sum(T[k2][r] * q[k2] for k2 in range(12)) for r in range(12)]
            for nd, off in ((m['i'], 0), (m['j'], 6)):
                if nd in self.reactions:
                    for k2 in range(6):
                        self.reactions[nd][k2] += qg[off + k2]
        for nd in self.reactions:
            v = self.nl.get(nd, [0.] * 6)
            self.reactions[nd] = [self.reactions[nd][k2] - v[k2] for k2 in range(6)]
        return self

    def node_disp(self, n):
        return [sum(c * self.U[p] for (p, c) in self.dmap[n][q]) for q in range(6)]

    def diagram(self, idx, ns=13):
        """القوى الداخلية على طول العنصر: محوري، قص بالاتجاهين، التواء، عزمان."""
        c = self._cache[idx]
        if c is None: return []
        L, R, kl, T, q0, maps, w = c
        q = self.mf[idx]
        wx, wy, wz = w
        out = []
        for k in range(ns + 1):
            x = L * k / ns
            out.append(dict(
                x=x,
                N=-(q[0] + wx * x),
                Vy=q[1] + wy * x,
                Vz=q[2] + wz * x,
                T=-q[3],
                Mz=-q[5] + q[1] * x + wy * x * x / 2,
                My=-q[4] + q[2] * x + wz * x * x / 2))
        return out
