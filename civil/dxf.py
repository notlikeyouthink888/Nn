# -*- coding: utf-8 -*-
"""
كاتب ملفات DXF (صيغة R12 ASCII) — مخطط الأسس والشبكة.
نصوص المخطط بالإنجليزية/الأرقام لضمان ظهورها بأي برنامج CAD.
"""

LAYERS = [("GRID", 8), ("COLUMN", 1), ("FOOTING", 3), ("RAFT", 5),
          ("PILE", 6), ("TEXT", 7), ("DIM", 4)]

class Dxf:
    def __init__(self):
        self.e = []

    def line(self, x1, y1, x2, y2, layer="0"):
        self.e.append("0\nLINE\n8\n%s\n10\n%.4f\n20\n%.4f\n30\n0.0\n11\n%.4f\n21\n%.4f\n31\n0.0"
                      % (layer, x1, y1, x2, y2))

    def rect(self, x, y, w, h, layer="0"):
        self.line(x, y, x + w, y, layer); self.line(x + w, y, x + w, y + h, layer)
        self.line(x + w, y + h, x, y + h, layer); self.line(x, y + h, x, y, layer)

    def circle(self, x, y, r, layer="0"):
        self.e.append("0\nCIRCLE\n8\n%s\n10\n%.4f\n20\n%.4f\n30\n0.0\n40\n%.4f" % (layer, x, y, r))

    def text(self, x, y, h, s, layer="TEXT"):
        s = str(s).replace('\n', ' ')
        self.e.append("0\nTEXT\n8\n%s\n10\n%.4f\n20\n%.4f\n30\n0.0\n40\n%.4f\n1\n%s"
                      % (layer, x, y, h, s))

    def out(self):
        t = ["0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n6\n0\nENDSEC"]
        t.append("0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n%d" % len(LAYERS))
        for n, c in LAYERS:
            t.append("0\nLAYER\n2\n%s\n70\n0\n62\n%d\n6\nCONTINUOUS" % (n, c))
        t.append("0\nENDTAB\n0\nENDSEC")
        t.append("0\nSECTION\n2\nENTITIES")
        t.extend(self.e)
        t.append("0\nENDSEC\n0\nEOF")
        return "\n".join(t) + "\n"

def foundation_plan(p):
    """مخطط أسس من نتيجة المعالج."""
    g = p['grid']; d = p.get('design', {}); loads = p.get('loads', [])
    col = p.get('col', dict(b=400, h=500))
    cb = col['b'] / 1000.0; ch = col['h'] / 1000.0
    dx = Dxf()
    L, B = g['L'], g['B']
    # محاور الشبكة
    for i in range(g['nx'] + 1):
        x = i * g['sx']
        dx.line(x, -1.5, x, B + 1.5, "GRID")
        dx.text(x - 0.15, B + 1.7, 0.3, chr(65 + i), "TEXT")
    for j in range(g['ny'] + 1):
        y = j * g['sy']
        dx.line(-1.5, y, L + 1.5, y, "GRID")
        dx.text(-1.9, y - 0.15, 0.3, str(j + 1), "TEXT")
    mode = d.get('mode')
    if mode == 'raft':
        r = d['raft']
        dx.rect(-0.5, -0.5, r['Lx'], r['Ly'], "RAFT")
        dx.text(-0.5, r['Ly'] - 0.1, 0.35,
                "RAFT %.2f x %.2f  t=%d mm" % (r['Lx'], r['Ly'], int(r['h'])), "TEXT")
        dx.text(-0.5, -1.1, 0.28, "TOP %s / BOT %s (both ways)"
                % (r['top']['label'].replace('مم', 'mm'), r['bottom']['label'].replace('مم', 'mm')), "TEXT")
    for k, l in enumerate(loads):
        x, y = l['x'], l['y']
        if mode == 'isolated':
            sz = d['sizes'][k]['B']
            dx.rect(x - sz / 2, y - sz / 2, sz, sz, "FOOTING")
            dx.text(x - sz / 2, y + sz / 2 + 0.08, 0.22, "F%d %.2fx%.2f" % (k + 1, sz, sz), "TEXT")
        elif mode == 'piles':
            pl = d['pile']; s = pl['spacing']
            m, rows = pl['cols'], pl['rows']
            dx.rect(x - pl['cap']['B'] / 2, y - pl['cap']['L'] / 2,
                    pl['cap']['B'], pl['cap']['L'], "FOOTING")
            n = 0
            for rr in range(rows):
                for cc in range(m):
                    if n >= pl['n']: break
                    px = x + (cc - (m - 1) / 2.0) * s
                    py = y + (rr - (rows - 1) / 2.0) * s
                    dx.circle(px, py, pl['D'] / 2, "PILE"); n += 1
            dx.text(x - pl['cap']['B'] / 2, y + pl['cap']['L'] / 2 + 0.1, 0.22,
                    "PC%d %dxD%d" % (k + 1, pl['n'], int(pl['D'] * 1000)), "TEXT")
        dx.rect(x - cb / 2, y - ch / 2, cb, ch, "COLUMN")
    dx.text(-1.5, -2.6, 0.45, "FOUNDATION PLAN - %s" % (mode or '').upper(), "TEXT")
    dx.text(-1.5, -3.2, 0.28, "Plot %.0f m2 | Floors %d | qa=%.0f kPa | fc=%.0f MPa"
            % (p['input']['area'], p['input']['floors'], p['input']['qa'], p['input']['fc']), "TEXT")
    dx.text(-1.5, -3.7, 0.28, "Grid %dx%d @ %.2f x %.2f m | Columns %d"
            % (g['nx'], g['ny'], g['sx'], g['sy'], g['cols']), "TEXT")
    return dx.out()
