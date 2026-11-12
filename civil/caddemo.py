# -*- coding: utf-8 -*-
"""ملف مخططات تجريبي لقسم الأوتوكاد — من صنع المنصة نفسها (مو ملف أي مستخدم).

مبنى مكاتب صغير بطابقين (16.5 × 10 م، شبكة 3 × 2 بحور) مرسوم كمجموعة لوحات إنشائية كاملة بنفس أسلوب
المكاتب الهندسية: مفتاح الأعمدة، مفتاح الجسور وتسليح السقف لكل طابق، جدول الجسور، جدول تسليح الأعمدة،
وملاحظات عامة بالعربي والإنكليزي. يُولَّد عند الطلب (‎/api/cad/demo) ولا يُحفظ ملفاً بالمستودع.

بيه **خطأ تسليح مقصود واحد**: العمود C1 بالطابق الأول 8Ø16 بمقطع 400×600 = 0.67% (أقل من 1% بـ ACI 318-19 §10.6.1.1)،
حتى يشوف الزائر «فحص الحديد» شلون يلقاه. الباقي مصمَّم مطابقاً.

فايدته:
· أي زائر يجرّب القسم بضغطة بلا ما يكون عنده DWG.
· اختبار ثابت للقارئ (tests_cad.py): اللوحات، المحاور، الأعمدة، الجسور، الجداول، والمواد تُقرأ كما رُسمت.

   python3 civil/caddemo.py out.dxf      يكتب الملف (للفحص اليدوي)
"""
import sys

NAME = 'office-block-a-demo.dxf'
BLD = 'Office Building (Block-A)'
XS = [('1', 0.0), ('2', 5.5), ('3', 11.0), ('4', 16.5)]          # محاور رقمية (عمودية)
YS = [('A', 0.0), ('B', 5.0), ('C', 10.0)]                      # محاور حرفية (أفقية)
COLS = {'C1': (400, 600), 'C2': (400, 400)}                     # C2 بالزوايا، C1 بالباقي
BEAMS = {'B1': (300, 600), 'B2': (300, 500)}                    # B1 بالاتجاه الطويل، B2 بالقصير
FLOORS = [('Ground', 'Ground Floor'), ('First', 'First Floor')]
SLAB_T = 200
FC, FY, COVER = 30, 420, 25
LAYERS = [('AXIS', 8, 'CENTER'), ('COLUMN', 1, 'CONTINUOUS'), ('BEAM', 3, 'CONTINUOUS'), ('SLAB', 5, 'CONTINUOUS'),
          ('REBAR', 6, 'CONTINUOUS'), ('TEXT', 7, 'CONTINUOUS'), ('TABLE', 4, 'CONTINUOUS'), ('FRAME', 9, 'CONTINUOUS')]


class Dxf:
    """يكتب DXF (R12 نصي) ويحتفظ بنفس العناصر بصيغة القارئ (ents) — للاختبار بلا متصفح."""

    def __init__(self):
        self.e = []
        self.ents = []

    def _lt(self, layer, lt=None):
        return lt or next((t for n, _, t in LAYERS if n == layer), 'CONTINUOUS')

    def line(self, x1, y1, x2, y2, layer, lt=None):
        self.ents.append(dict(t='L', l=layer, p=[x1, y1, x2, y2], lt=self._lt(layer, lt)))
        self.e.append('0\nLINE\n8\n%s%s\n10\n%.4f\n20\n%.4f\n30\n0.0\n11\n%.4f\n21\n%.4f\n31\n0.0'
                      % (layer, ('\n6\n' + lt) if lt else '', x1, y1, x2, y2))

    def rect(self, x, y, w, h, layer):
        self.line(x, y, x + w, y, layer); self.line(x + w, y, x + w, y + h, layer)
        self.line(x + w, y + h, x, y + h, layer); self.line(x, y + h, x, y, layer)

    def circle(self, x, y, r, layer):
        self.ents.append(dict(t='C', l=layer, p=[x, y, r], lt=self._lt(layer)))
        self.e.append('0\nCIRCLE\n8\n%s\n10\n%.4f\n20\n%.4f\n30\n0.0\n40\n%.4f' % (layer, x, y, r))

    def text(self, x, y, h, s, layer='TEXT', rot=0):
        self.ents.append(dict(t='T', l=layer, p=[x, y, h], s=str(s).replace('\n', ' '), rot=rot, lt=self._lt(layer)))
        self.e.append('0\nTEXT\n8\n%s\n10\n%.4f\n20\n%.4f\n30\n0.0\n40\n%.4f\n1\n%s%s'
                      % (layer, x, y, h, str(s).replace('\n', ' '), ('\n50\n%.1f' % rot) if rot else ''))

    def out(self):
        t = ['0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n6\n0\nENDSEC',
             '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n2',
             '0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0',
             '0\nLTYPE\n2\nCENTER\n70\n0\n3\nCenter ____ _ ____\n72\n65\n73\n4\n40\n2.0\n49\n1.25\n49\n-0.25\n49\n0.25\n49\n-0.25',
             '0\nENDTAB\n0\nTABLE\n2\nLAYER\n70\n%d' % len(LAYERS)]
        for n, c, lt in LAYERS:
            t.append('0\nLAYER\n2\n%s\n70\n0\n62\n%d\n6\n%s' % (n, c, lt))
        t.append('0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES')
        t.extend(self.e)
        t.append('0\nENDSEC\n0\nEOF')
        return '\n'.join(t) + '\n'


def col_mark(i, j):
    return 'C2' if i in (0, len(XS) - 1) and j in (0, len(YS) - 1) else 'C1'


def _axes(d, ox, oy):
    """خطوط المحاور بخط CENTER وفقاعاتها عند الطرفين، وأبعاد البحور بالمليمتر."""
    x0, x1, y0, y1 = XS[0][1], XS[-1][1], YS[0][1], YS[-1][1]
    for n, x in XS:
        d.line(ox + x, oy + y0 - 2.4, ox + x, oy + y1 + 2.4, 'AXIS', 'CENTER')
        for yy in (y0 - 2.8, y1 + 2.8):
            d.circle(ox + x, oy + yy, 0.4, 'AXIS'); d.text(ox + x - 0.12, oy + yy - 0.16, 0.32, n, 'AXIS')
    for n, y in YS:
        d.line(ox + x0 - 2.4, oy + y, ox + x1 + 2.4, oy + y, 'AXIS', 'CENTER')
        for xx in (x0 - 2.8, x1 + 2.8):
            d.circle(ox + xx, oy + y, 0.4, 'AXIS'); d.text(ox + xx - 0.12, oy + y - 0.16, 0.32, n, 'AXIS')
    for (_, a), (_, b) in zip(XS, XS[1:]):
        d.text(ox + (a + b) / 2 - 0.45, oy + y1 + 1.5, 0.25, '%d' % round((b - a) * 1000))
    for (_, a), (_, b) in zip(YS, YS[1:]):
        d.text(ox + x0 - 1.9, oy + (a + b) / 2, 0.25, '%d' % round((b - a) * 1000))


def _columns(d, ox, oy, marks=True):
    for i, (_, x) in enumerate(XS):
        for j, (_, y) in enumerate(YS):
            mk = col_mark(i, j)
            b, h = COLS[mk][0] / 1000.0, COLS[mk][1] / 1000.0
            d.rect(ox + x - b / 2, oy + y - h / 2, b, h, 'COLUMN')
            if marks:
                d.text(ox + x + 0.35, oy + y + 0.45, 0.25, mk)


def _beams(d, ox, oy, marks=True):
    x0, x1, y0, y1 = XS[0][1], XS[-1][1], YS[0][1], YS[-1][1]
    w1, w2 = BEAMS['B1'][0] / 2000.0, BEAMS['B2'][0] / 2000.0
    for _, y in YS:                                               # B1 على المحاور الحرفية (الاتجاه الطويل)
        d.line(ox + x0, oy + y - w1, ox + x1, oy + y - w1, 'BEAM'); d.line(ox + x0, oy + y + w1, ox + x1, oy + y + w1, 'BEAM')
        if marks:
            for (_, a), (_, b) in zip(XS, XS[1:]):
                d.text(ox + (a + b) / 2 - 0.2, oy + y + 0.3, 0.25, 'B1')
    for _, x in XS:                                               # B2 على المحاور الرقمية
        d.line(ox + x - w2, oy + y0, ox + x - w2, oy + y1, 'BEAM'); d.line(ox + x + w2, oy + y0, ox + x + w2, oy + y1, 'BEAM')
        if marks:
            for (_, a), (_, b) in zip(YS, YS[1:]):
                d.text(ox + x + 0.3, oy + (a + b) / 2, 0.25, 'B2')


def _title(d, ox, oy, s):
    """عنوان اللوحة تحتها مباشرة، يبدأ من يسارها (مثل لوحات المكاتب) ومعه خط تحته."""
    x = ox + XS[0][1] - 2.4
    d.text(x, oy + YS[0][1] - 4.6, 0.36, s)
    d.line(x, oy + YS[0][1] - 4.8, x + 0.3 * len(s), oy + YS[0][1] - 4.8, 'TEXT')


def _table(d, x, y, widths, rows, rh=0.9, th=0.26):
    """جدول مرسوم: شبكة خطوط ونص بكل خلية (السطر الأول عناوين)."""
    W = sum(widths)
    for r in range(len(rows) + 1):
        d.line(x, y - r * rh, x + W, y - r * rh, 'TABLE')
    cx = x
    for w in widths + [0]:
        d.line(cx, y, cx, y - len(rows) * rh, 'TABLE')
        cx += w
    for r, row in enumerate(rows):
        cx = x
        for c, cell in enumerate(row):
            if isinstance(cell, (list, tuple)):                   # خلية بسطرين (قضبان + أتاري)
                d.text(cx + 0.25, y - r * rh - 0.36, th * 0.85, cell[0]); d.text(cx + 0.25, y - r * rh - 0.72, th * 0.85, cell[1])
            elif cell:
                d.text(cx + 0.25, y - r * rh - 0.58, th, cell)
            cx += widths[c]


def _draw():
    d = Dxf()
    DX, DY = 44.0, 26.0
    # ---- مفتاح الأعمدة
    _axes(d, 0, 0); _columns(d, 0, 0)
    _title(d, 0, 0, 'Columns Key Plan %s Sc .1:100' % BLD)
    # ---- لكل طابق: مفتاح جسور + تسليح سقف
    for f, (key, _) in enumerate(FLOORS):
        oy = -(f + 1) * DY
        _axes(d, 0, oy); _columns(d, 0, oy, marks=False); _beams(d, 0, oy)
        _title(d, 0, oy, 'Beams Key Plan for Roof of %s Floor Plan %s Sc .1:100' % (key, BLD))
        ox = DX
        _axes(d, ox, oy); _columns(d, ox, oy, marks=False); _beams(d, ox, oy, marks=False)
        for (_, xa), (_, xb) in zip(XS, XS[1:]):
            for (_, ya), (_, yb) in zip(YS, YS[1:]):
                void = f == 0 and xa == XS[1][1] and ya == YS[1][1]   # فتحة الدرج بسقف الأرضي
                if void:
                    vx, vy, vw, vh = ox + xa + 1.2, oy + ya + 0.9, 3.0, 3.2
                    d.rect(vx, vy, vw, vh, 'SLAB'); d.line(vx, vy, vx + vw, vy + vh, 'SLAB'); d.line(vx, vy + vh, vx + vw, vy, 'SLAB')
                    continue
                mx, my = ox + (xa + xb) / 2, oy + (ya + yb) / 2
                d.text(mx - 1.2, my + 0.5, 0.24, '%%C12@150 B', 'REBAR'); d.text(mx - 1.2, my - 0.3, 0.24, '%%C12@200 T', 'REBAR')
                d.text(mx + 1.6, my - 1.2, 0.24, '%%C12@150 B', 'REBAR', rot=90)
        _title(d, ox, oy, 'Slab Reinforcement Plan for Roof of %s Floor Slab Thickness%d= mm %s Sc. 1:100' % (key, SLAB_T, BLD))
    # ---- جدول الجسور
    tx, ty = 2 * DX + 2, 2.0
    d.text(tx, ty + 0.9, 0.42, '%%uSCHEDULE OF BEAMS')
    _table(d, tx, ty, [2.2, 3.0, 2.8, 2.8, 2.8, 2.8, 3.4, 3.4],
           [['TYPE', 'SIZE', '(Bb1)', '(Bb2)', '(Tb1)', '(Tb2)', '1/4 SPAN', '1/2 SPAN'],
            ['B1', '300X600', '3%%C20', '1%%C16', '2%%C16', '2%%C20', '%%C10@100', '%%C10@200'],
            ['B2', '300X500', '3%%C16', '----', '2%%C16', '2%%C16', '%%C10@100', '%%C10@200']])
    # ---- جدول تسليح الأعمدة
    cy = ty - 9.0
    d.text(tx, cy + 0.9, 0.42, 'Columns Reinforcing Schedule (Block-A)')
    _table(d, tx, cy, [5.0, 6.0, 6.0],
           [['', 'C1', 'C2'],
            ['First Floor', ['8%%C16', 'Ties %%C10/125 (2/Set)'], ['8%%C16', 'Ties %%C10/125']],       # C1 هنا 0.67% < 1% — الخطأ المقصود
            ['Ground Floor', ['8%%C20', 'Ties %%C10/125 (2/Set)'], ['8%%C16', 'Ties %%C10/125']]], rh=1.2)
    d.text(tx + 5.3, cy - 4.2, 0.24, 'C1 = 400x600'); d.text(tx + 11.3, cy - 4.2, 0.24, 'C2 = 400x400')
    # ---- ملاحظات عامة (عربي + إنكليزي)
    ny = cy - 8.0
    notes = ['GENERAL NOTES:',
             "1- fc' = %d MPa, fy = %d, clear cover %d mm" % (FC, FY, COVER),
             '2- All dimensions are in millimeters unless noted otherwise.',
             '3- Lap splices shall be staggered and located away from maximum stress regions.',
             '4- الغطاء الخرساني للأساسات 75 مم وللأعمدة والجسور 40 مم.',
             '5- لا يُفك قالب السقف قبل 14 يوماً من الصب.',
             '6- تُعالج الخرسانة بالماء مدة لا تقل عن 7 أيام.']
    for i, s in enumerate(notes):
        d.text(tx, ny - i * 0.75, 0.42 if i == 0 else 0.28, s)
    return d


def build():
    """نص ملف DXF."""
    return _draw().out()


def payload():
    """نفس الرسم بصيغة طلب ‎/api/cad/read (العناصر كما يستخرجها قارئ المتصفح)."""
    d = _draw()
    n = {}
    for e in d.ents:
        n[e['l']] = n.get(e['l'], 0) + 1
    return dict(ents=d.ents, insunits=6, name=NAME,
                layers=[dict(name=k, color=c, n=n.get(k, 0), lt=lt) for k, c, lt in LAYERS if n.get(k)])


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else NAME
    with open(out, 'w', encoding='utf-8') as f:
        f.write(build())
    print(out, len(build()), 'bytes')
