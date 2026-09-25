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
        self.assertEqual(len(R['drawings']), 11)
        kinds = sorted(dw['kind'] or '-' for dw in R['drawings'])
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
        self.assertEqual(S['beams']['B1']['b'], 350)
        self.assertEqual(S['beams']['B3']['h'], 800)
        self.assertEqual(S['beams']['B3']['b'], 400)
        self.assertEqual(S['beams']['B1']['bot']['cont'], dict(n=3, d=25))
        self.assertEqual(S['beams']['B2']['stir']['mid'], dict(d=10, s=250, sets=None))
        cols = S['columns']
        self.assertIn('C1', cols)
        self.assertEqual(len(cols['C1']), 5)

    def test_openings(self):
        n = sum(len(f['slab']['openings']) for b in self.R['buildings'] for f in b['floors'])
        self.assertGreaterEqual(n, 10)

    def test_floors(self):
        names = [[f['key'] for f in b['floors']] for b in self.R['buildings']]
        flat = sorted(sum(names, []), key=lambda k: K.FLOOR_ORDER[k])
        self.assertEqual(flat, ['ground', 'mezzanine', 'first', 'second', 'third'])
        for b in self.R['buildings']:
            for f in b['floors']:
                self.assertEqual(f['slab']['t'], 200)


if __name__ == '__main__':
    unittest.main()
