# -*- coding: utf-8 -*-
"""اختبارات قسم الأوتوكاد: قاعدة المعرفة (cadkb) وقارئ اللوحات (cadread).

تشغيل:  python3 -m unittest tests_cad -v     (من داخل civil/)
اختبارات Block_4 الذهبية تعمل فقط إن وُجد ملف العناصر المستخرَج بالمتصفح
(متغيّر البيئة CAD_FIXTURE) — الملف نفسه للمستخدم ولا يُحفظ بالمستودع."""
import json
import os
import unittest

import cadkb as K

TITLES = {
    'Slab Reinforcement Plan for Roof of Second Floor Slab Thickness200= mm '
    'Adminstration & Conference Building (Block-4) Sc. 1:300':
        ('slab_rft', 'second', True, 200, 300, 'Block-4'),
    'Slab Reinforcement Plan for Roof of First Floor Slab Thickness200= mm '
    'Adminstration & Conference Building (Block-4) Sc. 1:300':
        ('slab_rft', 'first', True, 200, 300, 'Block-4'),
    'Slab Reinforcement Plan for Roof of Third Floor Slab Thickness200= mm '
    'Adminstration & Conference Building (Block-4) Sc. 1:300':
        ('slab_rft', 'third', True, 200, 300, 'Block-4'),
    'Beams Key Plan for Roof of First Floor Plan Adminstration & Conference Building (Block-4) Sc .1:300':
        ('beams_key', 'first', True, None, 300, 'Block-4'),
    'Beams Key Plan for Roof Slab of Ground Floor Adminstration & Conference Building (Block-4) Sc .1:300':
        ('beams_key', 'ground', True, None, 300, 'Block-4'),
    'Slab Reinforcement Plan for Roof of Mezzanine Floor Slab Thickness200= mm '
    'Adminstration & Conference Building (Block-4) Sc. 1:300':
        ('slab_rft', 'mezzanine', True, 200, 300, 'Block-4'),
    'Columns Key Plan Adminstration & Conference Building (Block-4) Sc .1:300':
        ('cols_key', None, None, None, 300, 'Block-4'),
    '%%uSCHEDULE OF BEAMS': ('beam_sched', None, None, None, None, None),
    'Columns Reinforcing Schedule (Block-4)': ('col_sched', None, None, None, None, 'Block-4'),
    'مخطط تسليح سقف الطابق الأول سمك البلاطة 250': ('slab_rft', 'first', True, 250, None, None),
    'مخطط الأساسات': ('found', None, None, None, None, None),
}


class TestTitles(unittest.TestCase):
    def test_titles(self):
        for s, (kind, fl, roof, t, sc, b) in TITLES.items():
            r = K.parse_title(s)
            self.assertEqual(r['kind'], kind, s)
            self.assertEqual(r['floor'] and r['floor']['key'], fl, s)
            if fl:
                self.assertEqual(r['floor']['roof_of'], roof, s)
            self.assertEqual(r['thickness'], t, s)
            self.assertEqual(r['scale'], sc, s)
            self.assertEqual(r['building'], b, s)

    def test_floor_order(self):
        order = [K.parse_floor(x)['order'] for x in
                 ('Roof of Ground Floor', 'Roof of Mezzanine Floor', 'Roof of First Floor',
                  'Roof of Second Floor', 'Roof of Third Floor')]
        self.assertEqual(order, sorted(order))


class TestTokens(unittest.TestCase):
    def test_axis(self):
        self.assertEqual(K.axis_label('H`'), dict(name="H'", base='H', prime=True, numeric=False))
        self.assertEqual(K.axis_label('19`')['name'], "19'")
        self.assertTrue(K.axis_label('17')['numeric'])
        self.assertIsNone(K.axis_label('B2 '.strip() + 'x'))
        self.assertLess(K.axis_sort_key('G'), K.axis_sort_key("G'"))
        self.assertLess(K.axis_sort_key("G'"), K.axis_sort_key('H'))
        self.assertLess(K.axis_sort_key('9'), K.axis_sort_key('17'))

    def test_ordinal_floors(self):
        for t, k in [('3TH FLOOR PLAN', 'third'), ('SECOUND FLOOR PLAN', 'second'), ('4TH FLOOR PLAN', 'fourth'),
                     ('1ST FLOOR LEVEL', 'first')]:
            self.assertEqual(K.parse_floor(t)['key'], k, t)
        self.assertEqual(K.sheet_kind('GROUND FLOOR FINISHES PLAN'), 'finish')
        self.assertEqual(K.sheet_kind('UPPER ROOF FLOOR PLAN'), 'finish')
        self.assertEqual(K.sheet_kind('ROOF FLOOR PLAN'), 'arch')

    def test_marks(self):
        for s, k in [('C1B', 'col'), ("C3B'", 'col'), ('C5', 'col'), ('B2', 'beam'), ('GB1', 'beam'),
                     ('F3', 'foot'), ('S1', 'slab'), ('17', None), ('Plan', None)]:
            self.assertEqual(K.mark_kind(s)[0], k, s)

    def test_sizes(self):
        self.assertEqual(K.parse_size('350X800'), dict(b=350, h=800, shape='rect'))
        self.assertEqual(K.parse_size('col 60x60'), dict(b=600, h=600, shape='rect'))
        self.assertEqual(K.parse_size('col 30x90'), dict(b=300, h=900, shape='rect'))
        self.assertEqual(K.parse_size('Col dia 60')['shape'], 'circ')
        self.assertEqual(K.parse_size('Col dia 60')['D'], 600)
        self.assertIsNone(K.parse_size('%%C16@200 T'))

    def test_rebar(self):
        self.assertEqual(K.parse_bars('3%%C25'), dict(n=3, d=25))
        self.assertEqual(K.parse_bars('Main Bars 12%%C32'), dict(n=12, d=32))
        self.assertEqual(K.parse_bars('2%%C16'), dict(n=2, d=16))
        self.assertEqual(K.parse_ties('%%C10@150'), dict(d=10, s=150, sets=None))
        self.assertEqual(K.parse_ties('Ties %%C10/250 (3/Set)'), dict(d=10, s=250, sets=3))
        c = K.parse_callout('%%C12@200 B&T')
        self.assertEqual((c['dia'], c['sp'], c['pos']), (12, 200, 'B&T'))
        self.assertTrue(K.is_not_present('NOT PRESENT'))
        self.assertTrue(K.is_not_present('----'))
        self.assertFalse(K.is_not_present('3%%C25'))

    def test_materials_and_defs(self):
        self.assertEqual(K.parse_materials("fc' = 28 MPa, fy = 420, clear cover 25 mm"),
                         dict(fc=28, fy=420, cover=25))
        self.assertEqual(K.parse_definition('C1 = 400x600')['size'], dict(b=400, h=600, shape='rect'))
        d = K.parse_definition('B1 (350X800) 3%%C25')
        self.assertEqual((d['kind'], d['size']['h'], d['bars']['n']), ('beam', 800, 3))
        self.assertIsNone(K.parse_definition('Slab Reinforcement Plan'))

    def test_dictionary(self):
        d = K.dictionary()
        self.assertTrue(len(d['symbols']) >= 12 and len(d['sheets']) >= 10)


class TestLevels(unittest.TestCase):
    """قياس المناسيب من الواجهة/المقطع (بيانات مصطنعة تحاكي فيلا: سرداب + أرضي مرفوع + أول)."""
    def test_token(self):
        import cadread as C
        for t, g in [('0.00', '0.00'), ('+3.50', '3.50'), ('420', '420'), ('FFL +0.70', '0.70'), ('-1.05', '1.05')]:
            self.assertEqual(C._LEVEL_RX.match(t).group(2), g, t)
        self.assertIsNone(C._LEVEL_RX.match('B1 350X800'))

    def test_chain(self):
        import cadread as C
        mk = lambda v, ok=True, drawn=None: dict(v=v, ok=ok, drawn=v if drawn is None else drawn, exact=True)
        sl = lambda lv: dict(level=lv, t=0.15, fin=0.1, L=10.0, top=0)
        views = [dict(id=3, kind='elev', levels=dict(k=1.0, marks=[mk(0), mk(0.7), mk(2.45), mk(4.2), mk(7.7), mk(10.2)],
                                                    slabs=[], vdims=[])),
                 dict(id=4, kind='section', levels=dict(k=1.0, marks=[mk(-2.8, False, -2.1), mk(0.7), mk(4.2), mk(-1.05)],
                                                        slabs=[sl(-2.1), sl(0.7), sl(4.2), sl(7.7)], vdims=[3.35, 2.65]))]
        m = C._measure_levels(views, ['basement', 'ground', 'first'], 1)
        self.assertEqual(m['chain'], [-2.1, 0.7, 4.2, 7.7])
        self.assertEqual(m['heights'], [2.8, 3.5, 3.5])
        self.assertEqual(m['t'], 150)
        self.assertEqual(m['conflicts'][0]['v'], -2.8)
        self.assertTrue(all(c['clear_dim'] for c in m['checks']))
        self.assertIn(10.2, m['extra'])
        # الواجهة وحدها (بلا مقطع): الأرضي والأول يُقاسان، والسرداب يبقى افتراضياً
        m2 = C._measure_levels(views[:1], ['basement', 'ground', 'first'], 1)
        self.assertEqual((m2['first'], m2['chain']), (1, [0.7, 4.2, 7.7]))

    def test_floor_labels_and_plan_ffl(self):
        # مستشفى: «EL. +9.00M» + لافتات «3RD FLOOR LEVEL» + «+0.60 F.F.L.» بالمسقط الأرضي
        import cadread as C
        mk = lambda v, key=None: dict(v=v, ok=True, drawn=v, key=key, label=bool(key))
        views = [dict(id=1, kind='elev', levels=dict(k=1.0, slabs=[], vdims=[], marks=[
            mk(4.8), mk(9.0), mk(17.4), mk(21.6), mk(24.6),
            mk(4.8, 'first'), mk(9.0, 'second'), mk(13.2, 'third'), mk(17.4, 'fourth')]))]
        order = ['ground', 'first', 'second', 'third', 'fourth', 'roof']
        m = C._measure_levels(views, order, 0, {'ground': 0.6})
        self.assertEqual(m['chain'], [0.6, 4.8, 9.0, 13.2, 17.4, 21.6, 24.6])
        self.assertEqual(m['heights'][:5], [4.2] * 5)
        self.assertEqual(m['extra'], [])


FIX = os.environ.get('CAD_FIXTURE')


@unittest.skipUnless(FIX and os.path.exists(FIX), 'CAD_FIXTURE غير متوفر')
class TestBlock4(unittest.TestCase):
    """أرقام مُثبتة بفحص ملف Block_4 الحقيقي — المعيار الذهبي للقبول."""
    @classmethod
    def setUpClass(cls):
        import cadread
        d = json.load(open(FIX))
        cls.R = cadread.read_set(d)

    def test_drawings(self):
        R = self.R
        import cadread
        plans = [dw for dw in R['drawings'] if dw['kind'] not in cadread.VIEW_KINDS]
        self.assertEqual(len(plans), 11)
        views = [dw['kind'] for dw in R['drawings'] if dw['kind'] in cadread.VIEW_KINDS]
        self.assertIn('elev', views)
        self.assertIn('section', views)
        kinds = sorted(dw['kind'] or '-' for dw in plans)
        self.assertEqual(kinds.count('slab_rft'), 5)
        self.assertEqual(kinds.count('beams_key'), 5)
        self.assertEqual(kinds.count('cols_key'), 1)

    def test_axes(self):
        A = [b for b in self.R['buildings'] if len(b['grid']['x']) >= 8][0]
        xs = {a['name']: a['pos'] for a in A['grid']['x']}
        self.assertAlmostEqual(xs['24'] - xs['17'], 46.2, delta=0.05)
        self.assertAlmostEqual(xs["19'"] - xs['19'], 3.3, delta=0.05)
        ys = {a['name']: a['pos'] for a in A['grid']['y']}
        self.assertAlmostEqual(abs(ys['G'] - ys['M']), 39.6, delta=0.05)

    def test_schedules(self):
        S = self.R['schedules']
        self.assertEqual(len(S['beam_tables']), 3)
        # جدول الجناح (قرب مفاتيح جسور الطوابق العليا): B1/B2 350X800 · B3 400X800
        wing = [t for t in S['beam_tables'] if t['beams'].get('B1', {}).get('b') == 350]
        self.assertEqual(len(wing), 1)
        W = wing[0]['beams']
        self.assertEqual((W['B2']['b'], W['B2']['h']), (350, 800))
        self.assertEqual((W['B3']['b'], W['B3']['h']), (400, 800))
        self.assertEqual(W['B1']['bot']['cont'], dict(n=3, d=25))
        self.assertEqual(W['B3']['bot']['cont'], dict(n=4, d=25))
        self.assertEqual(W['B2']['stir']['end'], dict(d=10, s=150, sets=None))
        self.assertEqual(W['B2']['stir']['mid'], dict(d=10, s=250, sets=None))
        self.assertEqual(W['B1']['side'], dict(n=2, d=16))
        cols = S['columns']
        self.assertEqual(len(cols), 15)
        self.assertEqual(len(cols['C1']), 5)
        self.assertEqual(cols["C3B'"]['ground']['main'], dict(n=12, d=32))

    def test_columns_marked_per_floor(self):
        for b in self.R['buildings']:
            for f in b['floors']:
                self.assertTrue(f['columns'])
                self.assertTrue(all(c.get('mark') for c in f['columns']), f['key'])
                self.assertTrue(all(c.get('rebar') for c in f['columns']), f['key'])

    def test_wing_first_floor(self):
        B = [b for b in self.R['buildings'] if len(b['grid']['x']) == 2][0]
        f = [f for f in B['floors'] if f['key'] == 'first'][0]
        at = sorted((c['ax'], c['ay']) for c in f['columns'])
        for ay in ('H', 'I', "J'", "K'", "L'", 'M'):
            self.assertIn(('17', ay), at)
        self.assertEqual([o['between']['y'] for o in f['slab']['openings']], [("L'", "I'")])
        marks = set(bm['mark'] for bm in f['beams'] if bm['mark'])
        self.assertTrue({'B1', 'B2', 'B3'} <= marks)

    def test_openings(self):
        n = sum(len(f['slab']['openings']) for b in self.R['buildings'] for f in b['floors'])
        self.assertGreaterEqual(n, 10)

    def test_heights_unchanged(self):
        # لوحات العرض في Block_4 تفاصيل صغيرة بلا علامات منسوب — الارتفاعات تبقى 3.5
        for b in self.R['buildings']:
            self.assertIsNone(b['levels'])
            self.assertTrue(all(f['h'] == 3.5 for f in b['floors']))

    def test_floors(self):
        names = [[f['key'] for f in b['floors']] for b in self.R['buildings']]
        flat = sorted(sum(names, []), key=lambda k: K.FLOOR_ORDER[k])
        self.assertEqual(flat, ['ground', 'mezzanine', 'first', 'second', 'third'])
        for b in self.R['buildings']:
            for f in b['floors']:
                self.assertEqual(f['slab']['t'], 200)


HOSP = os.environ.get('HOSP_FIXTURE')


@unittest.skipUnless(HOSP and os.path.exists(HOSP), 'HOSP_FIXTURE غير متوفر')
class TestHospital(unittest.TestCase):
    """مجموعة معمارية ضخمة (10 ميغا): بلا وحدات ولا أبعاد حقيقية، عناوين بجدول العنوان،
    مساقط تشطيبات ومكبَّرة، واجهات بمناسيب «EL. +9.00M» ولافتات «3RD FLOOR LEVEL»."""
    @classmethod
    def setUpClass(cls):
        import cadread
        cls.R = cadread.read_set(json.load(open(HOSP)))

    def test_scale_from_room_labels(self):
        self.assertEqual(self.R['scale'], 0.25)

    def test_one_building_six_floors(self):
        self.assertEqual(len(self.R['buildings']), 1)
        B = self.R['buildings'][0]
        self.assertEqual([f['key'] for f in B['floors']], ['ground', 'first', 'second', 'third', 'fourth', 'roof'])
        self.assertAlmostEqual(B['size'][0], 57.3, delta=0.5)
        self.assertEqual(len(B['grid']['x']), 33)

    def test_levels(self):
        B = self.R['buildings'][0]
        self.assertEqual(B['levels']['chain'], [0.6, 4.8, 9.0, 13.2, 17.4, 21.6, 24.6])

    def test_elevation_sides(self):
        B = self.R['buildings'][0]
        sides = {v['title']: v['fit']['side'] for v in B['views'] if v['kind'] == 'elev' and v.get('fit')}
        self.assertEqual(sides.get('MAIN ELEVATION 1'), 'S')
        self.assertEqual(sides.get('REAR ELEVATION 3'), 'N')

    def test_titles(self):
        k = {}
        for dw in self.R['drawings']:
            k.setdefault(dw['title'] or '', set()).add(dw['kind'])
        self.assertIn('arch', k['GROUND FLOOR PLAN'])        # الرئيسي (والمكبَّرات بالعنوان نفسه تفاصيل)
        self.assertIn('detail', k['GROUND FLOOR PLAN'])
        self.assertEqual(k['GROUND FLOOR FINISHES PLAN'], {'finish'})
        self.assertEqual(k['FIRST FLOOR FINISHES PLAN'], {'arch'})   # لا مسقط رئيسي للأول


if __name__ == '__main__':
    unittest.main()
