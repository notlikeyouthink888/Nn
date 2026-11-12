# -*- coding: utf-8 -*-
"""
Skill: xlsx (openpyxl, live formulas, recalculated by LibreOffice).

A stair schedule workbook for every stair the reader found. Inputs (blue) come from the
drawing; every derived number is an Excel formula that references the Assumptions sheet,
so an engineer can change fc, the live load or a waist and the checks re-evaluate.
"""
import os

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from common import OUT, WHERE, load

BLUE = Font(name='Arial', color='0000FF', size=10)
BLACK = Font(name='Arial', size=10)
BOLD = Font(name='Arial', bold=True, size=10, color='FFFFFF')
HEAD = PatternFill('solid', fgColor='1F4E78')
YEL = PatternFill('solid', fgColor='FFFF00')
THIN = Border(*(Side(style='thin', color='BFBFBF'),) * 4)
RTL = Alignment(horizontal='right', vertical='center', wrap_text=True, readingOrder=2)
CEN = Alignment(horizontal='center', vertical='center')


def assumptions(ws):
    ws.sheet_view.rightToLeft = True
    rows = [('المعامل', 'القيمة', 'الوحدة', 'المصدر'),
            ('وزن الخرسانة γc', 24, 'kN/m³', 'ACI / الكود العراقي'),
            ('وزن مادة الدرجات γm', 27, 'kN/m³', 'مرمر/حجر — كما في civil/stairs.py'),
            ('التشطيب', 1.2, 'kN/m²', 'افتراض المشروع'),
            ('الحمل الحي للأدراج', 3.0, 'kN/m²', 'الكود العراقي للأحمال'),
            ('معامل الحمل الميت', 1.2, '—', 'ACI 318-19 5.3.1b'),
            ('معامل الحمل الحي', 1.6, '—', 'ACI 318-19 5.3.1b'),
            ('الغطاء + نصف القضيب', 26, 'mm', 'ACI 20.6.1.3.1 (20 + 6)'),
            ('fy', 420, 'MPa', 'Grade 60'),
            ('φ الانحناء', 0.9, '—', 'ACI 21.2.2 (مقطع مسيطَر بالشد)')]
    for r, row in enumerate(rows, 1):
        for c, v in enumerate(row, 1):
            cell = ws.cell(r, c, v)
            cell.font = BOLD if r == 1 else (BLUE if c == 2 else BLACK)
            cell.border = THIN
            cell.alignment = RTL if c != 2 else CEN
            if r == 1:
                cell.fill = HEAD
            elif c == 2:
                cell.fill = YEL
    for c, w in zip('ABCD', (28, 10, 10, 34)):
        ws.column_dimensions[c].width = w
    ws.cell(12, 1, 'الخلايا الصفراء بخط أزرق مُدخلات قابلة للتعديل؛ كل الباقي معادلات.').font = BLACK


A = "Assumptions!$B$%d"
GC, GM, FIN, LIVE, KD, KL, COV, FY, PHI = (A % i for i in range(2, 11))

COLS = [  # header, width, kind, formula template (row r) or data key
    ('المصدر', 16, 'in', 'where'), ('الطابق', 10, 'in', 'floor'), ('العنوان', 30, 'in', 'title'),
    ('H م', 7, 'in', 'H'), ('N قائمات', 8, 'in', 'N'), ('R مم', 8, 'in', 'R'), ('T مم', 8, 'in', 'T'),
    ('العرض م', 8, 'in', 'width'), ('السماكة مم', 9, 'in', 'waist'), ('البحر م', 8, 'in', 'span'),
    ("fc' MPa", 8, 'in', 'fc'),
    ('2R+T مم', 9, 'f', '=2*F{r}+G{r}'),
    ('بلوندل', 8, 'f', '=IF(AND(L{r}>=600,L{r}<=650),"✓","✗")'),
    ('R≤190', 7, 'f', '=IF(F{r}<=190,"✓","✗")'),
    ('T≥250', 7, 'f', '=IF(G{r}>=250,"✓","✗")'),
    ('ℓ/20 مم', 8, 'f', '=J{r}*1000/20'),
    ('سماكة≥ℓ/20', 10, 'f', '=IF(I{r}>=P{r}-1,"✓","✗")'),
    ('wD kN/m²', 9, 'f', '=I{r}/1000*%s*SQRT(F{r}^2+G{r}^2)/G{r}+0.5*F{r}/1000*%s+%s' % (GC, GM, FIN)),
    ('wu kN/m²', 9, 'f', '=%s*R{r}+%s*%s' % (KD, KL, LIVE)),
    ('Mu kN·m/م', 10, 'f', '=S{r}*J{r}^2/8'),
    ('d مم', 7, 'f', '=I{r}-%s' % COV),
    ('As مطلوب مم²/م', 12, 'f', '=MAX(0.85*K{r}*1000*U{r}/%s*(1-SQRT(MAX(0,1-2*T{r}*1000000/(%s*0.85*K{r}*1000*U{r}^2)))),0.0018*1000*I{r})' % (FY, PHI)),
    ('يحتاج تسليحاً مضاعفاً؟', 12, 'f', '=IF(1-2*T{r}*1000000/(%s*0.85*K{r}*1000*U{r}^2)<0,"نعم — زد السماكة","لا")' % PHI),
    ('Mu بالمشروع', 10, 'in', 'Mu'), ('As بالمشروع', 10, 'in', 'As'), ('الحديد الرئيسي بالمشروع', 16, 'in', 'main'),
    ('فرق Mu %', 9, 'f', '=IF(X{r}>0,(T{r}-X{r})/X{r},0)'),
]


def main():
    data = load()
    wb = Workbook()
    ws = wb.active
    ws.title = 'Stairs'
    ws.sheet_view.rightToLeft = True
    assumptions(wb.create_sheet('Assumptions'))
    for c, (h, w, _, _) in enumerate(COLS, 1):
        cell = ws.cell(1, c, h)
        cell.font, cell.fill, cell.alignment, cell.border = BOLD, HEAD, CEN, THIN
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.row_dimensions[1].height = 30
    mats = data.get('materials') or {}
    rows = [s for s in data['stairs'] if s['R'] and s['T'] and s['waist'] and s['span'] and not s['spiral']]
    r = 1
    for s in rows:
        r += 1
        vals = dict(s, where=WHERE.get(s['where'], s['where']), R=round(s['R'] * 1000, 1),
                    T=round(s['T'] * 1000, 1), fc=float((mats.get(s['where']) or {}).get('fc') or 25),
                    floor=s['floor'] or '—', title=(s['title'] or s['src'] or '')[:60])
        for c, (_, _, kind, spec) in enumerate(COLS, 1):
            if kind == 'in':
                cell = ws.cell(r, c, vals.get(spec))
                cell.font = BLUE
            else:
                cell = ws.cell(r, c, spec.format(r=r))
                cell.font = BLACK
            cell.border = THIN
            cell.alignment = RTL if c in (1, 2, 3, 23, 26) else CEN
    last = r
    fmt = {'L': '0', 'P': '0', 'R': '0.00', 'S': '0.00', 'T': '0.0', 'U': '0', 'V': '0', 'AA': '0.0%'}
    for col, f in fmt.items():
        for rr in range(2, last + 1):
            ws['%s%d' % (col, rr)].number_format = f
    red = PatternFill('solid', fgColor='F8CBAD')
    green = PatternFill('solid', fgColor='C6EFCE')
    for col in ('M', 'N', 'O', 'Q'):
        rng = '%s2:%s%d' % (col, col, last)
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"✗"'], fill=red))
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"✓"'], fill=green))
    ws.freeze_panes = 'D2'
    ws.auto_filter.ref = 'A1:%s%d' % (get_column_letter(len(COLS)), last)

    sm = wb.create_sheet('Summary', 0)
    sm.sheet_view.rightToLeft = True
    sm['A1'] = 'ملخص فحوص الأدراج (معادلات حيّة من ورقة Stairs)'
    sm['A1'].font = Font(name='Arial', bold=True, size=13)
    hdr = ('الفحص', 'ناجح', 'المجموع', 'النسبة', 'البند')
    for c, h in enumerate(hdr, 1):
        cell = sm.cell(3, c, h)
        cell.font, cell.fill, cell.alignment = BOLD, HEAD, CEN
    checks = [('قاعدة بلوندل 600–650', 'M', 'قاعدة الراحة'), ('القائمة ≤ 190 مم', 'N', 'IBC 1011.5.2'),
              ('النائمة ≥ 250 مم', 'O', 'IBC 1011.5.2'), ('السماكة ≥ ℓ/20', 'Q', 'ACI 318-19 جدول 7.3.1.1')]
    for i, (name, col, ref) in enumerate(checks, 4):
        sm.cell(i, 1, name)
        sm.cell(i, 2, '=COUNTIF(Stairs!%s2:%s%d,"✓")' % (col, col, last))
        sm.cell(i, 3, '=COUNTA(Stairs!%s2:%s%d)' % (col, col, last))
        sm.cell(i, 4, '=IF(C%d>0,B%d/C%d,0)' % (i, i, i)).number_format = '0.0%'
        sm.cell(i, 5, ref)
    i = 4 + len(checks)
    sm.cell(i, 1, 'أكبر فرق Mu بين الورقة والمشروع')
    sm.cell(i, 4, '=MAX(Stairs!AA2:AA%d)' % last).number_format = '0.0%'
    sm.cell(i + 1, 1, 'أدراج تحتاج تسليحاً مضاعفاً (زد السماكة)')
    sm.cell(i + 1, 2, '=COUNTIF(Stairs!W2:W%d,"نعم*")' % last)
    for row in sm.iter_rows(min_row=4, max_row=i + 1):
        for cell in row:
            cell.font, cell.border = BLACK, THIN
            cell.alignment = RTL if cell.column in (1, 5) else CEN
    for c, w in zip('ABCDE', (40, 9, 9, 9, 26)):
        sm.column_dimensions[c].width = w
    sm['A%d' % (i + 3)] = 'الأعمدة الزرقاء مأخوذة من المخطط عبر قارئ المشروع؛ السوداء معادلات. غيّر ورقة Assumptions لتتغيّر الفحوص.'
    sm['A%d' % (i + 3)].font = BLACK
    p = os.path.join(OUT, 's06_stairs_schedule.xlsx')
    wb.save(p)
    print('wrote', p, 'rows', last - 1)


if __name__ == '__main__':
    main()
