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


class TestArabicText(unittest.TestCase):
    def test_keyboard_arabic(self):
        self.assertEqual(K.fix_text("Hglsr' HBtrD gg],v HBvqD"), ('المسقط الافقي للدور الارضي', 'keyboard'))
        self.assertEqual(K.fix_text("ovshkm vy,dm sl; lj,s' 7 sL")[0], 'خرسانة رغوية سمك متوسط 7 سم')
        for en in ('drawn by', 'SUMP PIT FOR WASTE WATER', 'for %%C 8 mm', 'span (bb2)', 'TYPICAL DETAIL', 'C1'):
            self.assertIsNone(K.fix_text(en)[1], en)

    def test_word_order_and_codes(self):
        self.assertEqual(K.fix_text('المفصلي المقعد النزول حالة في'), ('في حالة النزول المقعد المفصلي', 'word-order'))
        self.assertIsNone(K.fix_text('انظر التسليح في جدول الجسور')[1])
        self.assertIsNone(K.fix_text('مسقـط الميدات ومحاور الأعمدة')[1])
        self.assertEqual(K.fix_text('abc %%176 x')[0], 'abc ° x')
        self.assertEqual(K.fix_text('عµ؛ڑZ لڈ£• وأµ¸¥ڑ')[1], 'undecodable')

    def test_slab_types(self):
        self.assertEqual(K.slab_type('مقطع في بلاطة هوردي باتجاهين')['key'], 'hordi')
        self.assertEqual(K.slab_type('FLAT SLAB 250 mm')['key'], 'flat')
        self.assertEqual(K.slab_type('BUBBLE DECK')['key'], 'bubble')
        self.assertIsNone(K.slab_type('توصيل الجدران ببلاطات السقف'))
        self.assertEqual(K.slab_type('مقطع طولي في بلاطة معصبة')['key'], 'ribbed')
        self.assertEqual(K.layer_hint('ابيام_السقف'), 'beam')
        self.assertEqual(K.sheet_kind('المسقط الافقي لسقف الدور الرابع'), 'finish')


class TestTablesAndScale(unittest.TestCase):
    def test_generic_table(self):
        import cadread as C
        E = []
        for y in (0, 1, 2, 3):                       # 3 صفوف × 3 أعمدة
            E.append(dict(t='L', l='t', p=[0, y, 9, y]))
        for x in (0, 3, 6, 9):
            E.append(dict(t='L', l='t', p=[x, 0, x, 3]))
        for r, row in enumerate([['DOOR NO.', 'SIZE', 'TYPE'], ['D1', '0.9X2.1', 'WOOD'], ['D2', '1.2X2.1', 'ALUM']]):
            for c, txt in enumerate(row):
                E.append(dict(t='T', l='t', p=[c * 3 + 0.3, 2.3 - r, 0.25], s=txt))
        TG = C._Grid(4.0)
        for i, e in enumerate(E):
            if e['t'] == 'T':
                TG.add(i, e['p'][0], e['p'][1])
        T = C.find_tables(E, C._segments(E), TG)
        self.assertEqual(len(T), 1)
        self.assertEqual(T[0]['rows'][0], ['DOOR NO.', 'SIZE', 'TYPE'])
        self.assertEqual(T[0]['rows'][2], ['D2', '1.2X2.1', 'ALUM'])
        self.assertEqual(T[0]['kind'], 'openings')

    def test_wide_dims_metres_not_feet(self):
        import cadread as C
        vals = [0.3, 21.133, 24.08, 5.246, 0.5, 0.25, 31.483, 0.4, 7.65, 6.49, 24.28, 10.05, 9.79, 34.32, 15.29, 12, 7.52]
        ents = [dict(t='D', l='d', p=[0, 0, v, 0], m=v) for v in vals]
        self.assertEqual(C.scale_from_dims_wide(ents)['scale'], 1.0)


SCHOOL = os.environ.get('SCHOOL_FIXTURE')


@unittest.skipUnless(SCHOOL and os.path.exists(SCHOOL) and FIX and os.path.exists(FIX), 'SCHOOL_FIXTURE غير متوفر')
class TestSchoolMerge(unittest.TestCase):
    """مسقط مدرسة بلا محاور ولا عناوين (جدران حاملة + أعمدة ربط)، ودمجه مع Block_4 بمشروع واحد."""
    def test_school_alone(self):
        import cadread
        R = cadread.read_set(json.load(open(SCHOOL)))
        self.assertEqual(R['scale'], 1.0)
        self.assertEqual(len(R['buildings']), 1)           # نسختا المسقط تُدمجان
        B = R['buildings'][0]
        self.assertTrue(B['masonry'])
        self.assertGreaterEqual(len(B['floors'][0]['columns']), 20)
        self.assertGreaterEqual(len(B['strips']), 20)

    def test_merge_two_files(self):
        import cadread
        fs = []
        for f, n in ((FIX, 'Block_4.dwg'), (SCHOOL, 'school.dwg')):
            d = json.load(open(f))
            fs.append(dict(name=n, ents=d['ents'], layers=d['layers'], insunits=d['insunits']))
        R = cadread.read_set(dict(files=fs))
        self.assertEqual(len(R['buildings']), 3)
        self.assertEqual([f['drawings'] > 0 for f in R['files']], [True, True])
        self.assertEqual(sorted(set(b['file'] for b in R['buildings'])), ['Block_4.dwg', 'school.dwg'])


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
        self.assertIn('arch', k['GROUND FLOOR PLAN'])        # الرئيسي
        # المساقط المكبَّرة (بعنوانها الإنجليزي أو العربي المفكوك من خط SHX) تفاصيل لا مساقط رئيسية
        self.assertIn('detail', k.get('GROUND FLOOR PLAN', set()) | k.get('المسقط الافقي للدور الارضي', set()))
        self.assertEqual(k.get('المسقط الافقي للدور الارضي'), {'detail'})
        self.assertEqual(k['GROUND FLOOR FINISHES PLAN'], {'finish'})
        self.assertEqual(k['FIRST FLOOR FINISHES PLAN'], {'arch'})   # لا مسقط رئيسي للأول

    def test_stairs_full_height(self):
        # درجا المبنى (قلبتان × 12) من منسوب كل طابق حتى الذي فوقه، والصعود من كلمة UP
        B = self.R['buildings'][0]
        g = B['floors'][0]
        drawn = [st for st in g['stairs'] if not st.get('from_well')]
        self.assertEqual(len(drawn), 2)
        for st in drawn:
            self.assertEqual(st['N'], 24)
            self.assertAlmostEqual(st['R'], 0.175, places=3)
            self.assertAlmostEqual(st['flights'][0]['z0'], g['level'], places=3)
            top = st['flights'][-1]['z0'] + st['flights'][-1]['n'] * st['R']
            self.assertAlmostEqual(top, g['level'] + g['h'], places=2)
            self.assertEqual(len(st['landings']), 1)
            self.assertIn('UP', st['src'])

    def test_stairs_connected_floor_to_floor(self):
        # كل درج فوق الأرضي يبدأ من نهاية درج الطابق تحته (الأول بلا UP رُتّب ليتصل)، ولا درج مستنتج من المناور
        B = self.R['buildings'][0]
        for f in B['floors'][1:]:
            for st in f['stairs']:
                if st.get('connect'):
                    self.assertTrue(st['connect']['ok'], (f['key'], st['connect']))
        third = next(f for f in B['floors'] if f['key'] == 'third')
        self.assertFalse(any(st.get('inferred') for st in third['stairs']))


@unittest.skipUnless(SCHOOL, 'SCHOOL_FIXTURE غير مضبوط')
class TestStairWells(unittest.TestCase):
    """درج مرسوم فتحةً بعلامة X بلا نائمات (مدرسة) ودرج مستنتج من فتحة متكررة (Block_4)."""
    def test_school_well_stair(self):
        import cadread
        R = cadread.read_set(json.load(open(SCHOOL)))
        sts = [st for b in R['buildings'] for f in b['floors'] for st in f['stairs']]
        self.assertEqual(len(sts), 1)
        st = sts[0]
        self.assertEqual(st['N'], 20)
        self.assertAlmostEqual(st['R'], 0.175, places=3)
        self.assertEqual(len(st['flights']), 2)
        self.assertEqual(st['flights'][0]['u'], [-x for x in st['flights'][1]['u']])   # قلبتان متعاكستان

    @unittest.skipUnless(FIX, 'CAD_FIXTURE غير مضبوط')
    def test_block4_inferred_stairs_connected(self):
        import cadread
        R = cadread.read_set(json.load(open(FIX)))
        A = R['buildings'][0]
        g, m = A['floors'][0], A['floors'][1]
        self.assertEqual(len(g['stairs']), 2)
        self.assertEqual(len(m['stairs']), 2)
        for st in m['stairs']:
            self.assertTrue(st['inferred'])
            self.assertTrue(st['connect']['ok'])
            self.assertAlmostEqual(st['flights'][0]['z0'], m['level'], places=3)


def _stair_section(x0=0.0, y0=0.0, n=10, R=0.175, T=0.30, land=1.2, waist=0.15):
    """مقطع قلبة صناعي: درجات + بطن مائل + بسطة علوية + منسوب ±0.00 + نداءات تسليح."""
    import math
    E = []
    x, y = x0, y0
    E.append(dict(t='L', l='0', p=[x0 - 1.2, y0, x0, y0]))              # أرضية البداية
    for i in range(n):
        E.append(dict(t='L', l='0', p=[x, y, x, y + R]))
        y += R
        if i < n - 1:
            E.append(dict(t='L', l='0', p=[x, y, x + T, y]))
            x += T
    E.append(dict(t='L', l='0', p=[x, y, x + land, y]))                  # البسطة
    E.append(dict(t='L', l='0', p=[x, y - 0.15, x + land, y - 0.15]))    # بطن البسطة
    th = math.atan2(R, T)
    off = waist / math.cos(th)
    E.append(dict(t='L', l='0', p=[x0, y0 - off, x, y - R - off]))       # البطن
    E.append(dict(t='T', l='0', p=[x0 - 0.6, y0 + 0.05, 0.1], s='%%p0.00', rot=0))
    E.append(dict(t='T', l='0', p=[x0 + 1.0, y0 - 0.5, 0.08], s='7%%c16/m', rot=0))
    E.append(dict(t='T', l='0', p=[x0 + 2.0, y0 - 0.2, 0.08], s='5%%c12/m', rot=0))
    E.append(dict(t='T', l='0', p=[x0 + 0.5, y0 + 1.0, 0.07], s='%.3f' % R, rot=90))
    E.append(dict(t='T', l='0', p=[x0 + 1.5, y0 - 1.3, 0.12], s='أبعاد و تسليح السلم', rot=0))
    return E


class TestStairs(unittest.TestCase):
    """الدرج: القراءة من المقطع، والتكميل حتى منسوب الطابق الذي فوقه، ودرج المسقط بقلبتين."""
    def test_bar_callouts(self):
        import cadstair as CS
        b = CS.bar_callouts('7%%c16/m')[0]
        self.assertEqual((b['n'], b['d'], b['per_m'], b['s']), (7, 16, True, 143))
        b = CS.bar_callouts('%%c10@150')[0]
        self.assertEqual((b['d'], b['s']), (10, 150))
        b = CS.bar_callouts('2%%c16')[0]
        self.assertEqual((b['n'], b['d'], b['per_m']), (2, 16, False))

    def test_half_flight_completed_to_floor(self):
        import cadread as CR, cadkb as K, cadstair as CS
        E = _stair_section()
        titles = [e for e in E if e['t'] == 'T' and K.is_title(e.get('s'))]
        st, unk = CS.find_stairs(E, CR._segments(E), [], titles)
        self.assertEqual(len(st), 1)
        s = st[0]
        f0 = s['flights'][0]
        self.assertTrue(f0['read'])
        self.assertEqual(f0['n'], 10)
        self.assertAlmostEqual(f0['R'], 0.175, places=3)
        self.assertAlmostEqual(f0['T'], 0.30, places=3)
        self.assertAlmostEqual(f0['waist'], 150, delta=3)
        # المرسوم حتى بسطة وسطية عند +1.75 ← يُكمَّل درجاً بقلبتين حتى +3.50
        self.assertAlmostEqual(s['H'], 3.5, places=2)
        self.assertEqual(s['n_risers'], 20)
        self.assertFalse(s['flights'][1]['read'])
        self.assertEqual(s['flights'][1]['s'], -f0['s'])
        self.assertEqual(s['rebar']['main']['d'], 16)
        self.assertEqual(s['rebar']['dist']['d'], 12)
        names = {c['name']: c for c in s['checks']}
        self.assertTrue(names['قاعدة بلوندل 2R+T']['ok'])
        self.assertTrue(names['مجموع القائمات = ارتفاع الطابق']['ok'])

    def test_plan_dogleg_from_step_numbers(self):
        import cadstair as CS
        E, segs = [], []
        for i in range(10):                             # قلبة سفلية: خطوط رأسية y∈[0,1.1]، أرقام 1..10 تزيد مع x
            x = 1.0 + 0.3 * i
            segs.append((x, 0.0, x, 1.1, len(E)))
            E.append(dict(t='T', l='0', p=[x + 0.1, 0.5, 0.1], s=str(i + 1), rot=0))
        for i in range(10):                             # قلبة علوية: y∈[1.3,2.4]، أرقام 11..20 تزيد عكس x
            x = 1.0 + 0.3 * i
            segs.append((x, 1.3, x, 2.4, len(E)))
            E.append(dict(t='T', l='0', p=[x + 0.1, 1.8, 0.1], s=str(20 - i), rot=0))
        runs = CS.tread_runs(segs)
        self.assertEqual(len(runs), 2)
        g = CS.plan_groups(runs, [e for e in E if e['t'] == 'T'], segs)
        self.assertEqual(len(g), 1)
        st = CS.build_plan_stair(g[0], 3.5, 0.0, lambda x, y: (x, y))
        self.assertEqual(st['N'], 20)
        self.assertAlmostEqual(st['R'], 0.175, places=3)
        self.assertEqual(st['flights'][0]['u'], [1.0, 0.0])            # الأرقام الصغرى تصعد باتجاه +x
        self.assertAlmostEqual(st['landings'][0]['z'], 1.75, places=3)
        self.assertGreater(st['landings'][0]['x0'], 3.6)                # بسطة الدوران بالطرف الأيمن

    def test_not_a_stair_rejected(self):
        import cadstair as CS
        segs = [(1.0 + 0.3 * i, 0.0, 1.0 + 0.3 * i, 1.1, i) for i in range(6)]   # 6 خطوط لطابق 3.5 م = قائمة 0.58
        g = CS.plan_groups(CS.tread_runs(segs), [], segs)
        with self.assertRaises(ValueError):
            CS.build_plan_stair(g[0], 3.5, 0.0, lambda x, y: (x, y))


if __name__ == '__main__':
    unittest.main()
