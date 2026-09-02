# -*- coding: utf-8 -*-
"""
جدول تقطيع الحديد — Bar Bending Schedule.
يحسب لكل عنصر: القطر · الشكل · طول القطعة بعد التقطيع على أطوال السوق (12 م) ·
العدد · الطول الكلي · الوزن · عدد الوصلات وهدرها.
"""
import math
import engine as E

DENS = 7850.0            # كغم/م³

def w_per_m(db):
    return E.ab(db) / 1e6 * DENS          # كغم/م

def _row(mark, elem, db, shape, run, count, fc, fy, top=False, note=''):
    """run = الطول الكامل للسيخ الواحد (م) قبل التقطيع · count = عدد الأسياخ."""
    lap = E.lap_length(db, fc, fy, top=top)
    c = E.cut_run(run, lap)
    steel = c['total_steel'] * count
    return dict(mark=mark, elem=elem, db=int(db), shape=shape,
                run=round(run, 2), pieces=c['n'], piece=round(c['piece'], 2),
                count=count, laps=c['laps'] * count, lap_len=round(c['lap'], 2),
                waste=round(c['waste'] * count, 1),
                total_len=round(steel, 1), weight=round(steel * w_per_m(db), 1), note=note)

def schedule(R):
    """R = ناتج معالج المشروع (project.wizard)."""
    m = R['model']; g = R['grid']; fc = R['input']['fc']; fy = R['input']['fy']
    rows = []
    L, B = g['L'], g['B']
    nf = m['floors']; hs = m['story_h']
    cov = 0.05

    # ------------------------------ الأساس ------------------------------
    rec = R['recommended']; alts = R['alts']
    if rec == 'raft':
        rf = alts['raft']['raft']
        for mk, nm, mesh, top in (('T', 'علوي', rf['top'], True), ('B', 'سفلي', rf['bottom'], False)):
            for d_, lab, ln, wid in (('X', 'بالطول', rf['Lx'], rf['Ly']),
                                     ('Y', 'بالعرض', rf['Ly'], rf['Lx'])):
                n = int(wid * 1000 / mesh['s']) + 1
                rows.append(_row('R-%s%s' % (mk, d_), 'حصيرة — تسليح %s %s' % (nm, lab),
                                 mesh['db'], 'مستقيم', ln - 0.15, n, fc, fy, top=top))
        ch = m['found']['chairs']
        rows.append(_row('R-CH', 'حصيرة — كراسي', ch['db'], 'كرسي', ch['len_each'], ch['n'], fc, fy))
    elif rec == 'isolated':
        iso = alts['isolated']; t = iso['typical']
        for i, s in enumerate(iso['sizes']):
            n = (int(s['B'] * 1000 / t['spacing']) + 1) * 2
            rows.append(_row('F%d' % (i + 1), 'أساس منفرد F%d (%.2f×%.2f م)' % (i + 1, s['B'], s['B']),
                             t['bar_db'], 'مستقيم بخطاف', s['B'] - 0.15, n, fc, fy))
    else:
        pl = alts['piles']['pile']; npc = len(R['loads'])
        rows.append(_row('P-L', 'ركائز — تسليح طولي', pl['rebar']['db'], 'مستقيم',
                         pl['L'] + 0.5, pl['rebar']['n'] * pl['n'] * npc, fc, fy))
        sp_turns = pl['L'] / (pl['rebar']['spiral_s'] / 1000.0)
        rows.append(_row('P-S', 'ركائز — حلزون', pl['rebar']['spiral_db'], 'حلزون',
                         math.pi * (pl['D'] - 0.15) * sp_turns, pl['n'] * npc, fc, fy))
        cr = pl['cap_rebar']; cp = pl['cap']
        n1 = (int(cp['B'] * 1000 / cr['s']) + 1) + (int(cp['L'] * 1000 / cr['s']) + 1)
        rows.append(_row('PC', 'هامات الركائز — سفلي', cr['db'], 'مستقيم',
                         max(cp['B'], cp['L']) - 0.15, n1 * npc, fc, fy))

    # ------------------------------ الأعمدة ------------------------------
    cr = m['col']['rebar']; ncol = len(R['loads'])
    lap_col = E.lap_length(cr['db'], fc, fy) / 1000.0
    rows.append(_row('C-L', 'أعمدة — تسليح طولي (%d عمود × %d طابق)' % (ncol, nf),
                     cr['db'], 'مستقيم', hs + lap_col, cr['n'] * ncol * nf, fc, fy,
                     note='وصلة %.2f م فوق كل سقف — متبادلة 50%%' % lap_col))
    per_tie = 2 * ((m['col']['b'] - 2 * 40) + (m['col']['h'] - 2 * 40)) / 1000.0 + 0.20
    lo = cr['conf_len'] / 1000.0
    n_conf = 2 * max(1, int(lo / (cr['tie_s_conf'] / 1000.0)))
    n_mid = max(1, int(max(0.1, hs - 2 * lo) / (cr['tie_s'] / 1000.0)))
    rows.append(_row('C-T', 'أعمدة — أتاري (وسط + تطويق)', cr['tie_db'], 'أسوار مغلقة',
                     per_tie, (n_conf + n_mid) * ncol * nf, fc, fy,
                     note='تطويق %d + وسط %d لكل عمود/طابق' % (n_conf, n_mid)))

    # ------------------------------ الجسور ------------------------------
    for d_, lab in (('x', 'X'), ('y', 'Y')):
        bm = m['beams'][d_]
        nlines = (g['ny'] + 1) if d_ == 'x' else (g['nx'] + 1)
        nspan = bm['n']
        run = bm['span'] * nspan + 0.3
        rows.append(_row('B%s-B' % lab, 'جسور %s — تسليح سفلي' % lab, bm['rebar']['bottom']['db'],
                         'مستقيم', run, bm['rebar']['bottom']['n'] * nlines * nf, fc, fy))
        rows.append(_row('B%s-T' % lab, 'جسور %s — تسليح علوي' % lab, bm['rebar']['top']['db'],
                         'مستقيم', run, bm['rebar']['top']['n'] * nlines * nf, fc, fy, top=True))
        st = bm['rebar']['stirrup']
        per = 2 * ((bm['b'] - 80) + (bm['h'] - 80)) / 1000.0 + 0.20
        nst = (int(bm['span'] * 1000 / st['s']) + 1) * nspan
        rows.append(_row('B%s-S' % lab, 'جسور %s — أساور' % lab, st['db'], 'أسوار مغلقة',
                         per, nst * nlines * nf, fc, fy))

    # ------------------------------ السقوف ------------------------------
    sl = m['slab']
    for d_, ln, wid in (('X', L, B), ('Y', B, L)):
        n = (int(wid * 1000 / sl['mesh']['bottom']['s']) + 1) * nf
        rows.append(_row('S-B%s' % d_, 'سقوف — شبكة سفلية %s' % d_, sl['mesh']['bottom']['db'],
                         'مستقيم', ln - 0.1, n, fc, fy))
    strip = sl['top_strip']
    for d_, lines, span, wid in (('X', g['ny'] + 1, g['sy'], L), ('Y', g['nx'] + 1, g['sx'], B)):
        n = (int(strip * span * 1000 / sl['mesh']['top']['s']) + 1) * lines * nf
        rows.append(_row('S-T%s' % d_, 'سقوف — تسليح علوي فوق المساند %s' % d_,
                         sl['mesh']['top']['db'], 'مستقيم بثنية', wid - 0.1, n, fc, fy, top=True,
                         note='شريط بعرض %.2f م فوق كل محور جسور' % (strip * span)))
    co = sl['extra']['corner']
    rows.append(_row('S-CR', 'سقوف — تسليح الأركان (علوي وسفلي)', co['db'], 'مستقيم',
                     co['size'] * max(L, B), 4 * 4 * nf, fc, fy, top=True,
                     note='ACI 8.7.3.1 — أركان البلاطة ثنائية الاتجاه'))
    ig = sl['extra']['integrity']
    rows.append(_row('S-IG', 'سقوف — تسليح التماسك خلال الأعمدة', ig['db'], 'مستقيم',
                     max(g['sx'], g['sy']) + 0.5, ig['n'] * 2 * ncol * nf, fc, fy,
                     note='ACI 8.7.4.2 — أسياخ سفلية مستمرة خلال العمود'))
    sch = sl['chairs']
    rows.append(_row('S-CH', 'سقوف — كراسي', sch['db'], 'كرسي', sch['len_each'],
                     sch['n'] * nf, fc, fy))

    # ------------------------------ الملخص ------------------------------
    by_db = {}
    for r in rows:
        b = by_db.setdefault(r['db'], dict(db=r['db'], count=0, length=0.0, weight=0.0, laps=0, waste=0.0))
        b['count'] += r['count']; b['length'] += r['total_len']
        b['weight'] += r['weight']; b['laps'] += r['laps']; b['waste'] += r['waste']
    tot_w = sum(r['weight'] for r in rows)
    tot_waste = sum(r['waste'] * w_per_m(r['db']) for r in rows)
    return dict(rows=rows, by_db=sorted(by_db.values(), key=lambda x: x['db']),
                total_weight=tot_w, total_ton=tot_w / 1000.0,
                lap_weight=tot_waste, lap_pct=(tot_waste / tot_w * 100.0) if tot_w else 0.0,
                stock=E.BAR_STOCK, bars=sum(r['count'] * r['pieces'] for r in rows),
                note='الأطوال محسوبة على أساس أسياخ سوق بطول %.0f م — كل ما زاد يُقطّع ويُوصل '
                     'بوصلة صنف B (1.3·ld) وفق ACI 25.5.2.1' % E.BAR_STOCK)

def csv(R):
    s = schedule(R)
    out = ['الرمز,العنصر,القطر (مم),الشكل,طول السيخ (م),عدد القطع,طول القطعة (م),'
           'العدد,عدد الوصلات,الطول الكلي (م),الوزن (كغم),ملاحظات']
    for r in s['rows']:
        out.append('%s,%s,%d,%s,%.2f,%d,%.2f,%d,%d,%.1f,%.1f,%s' % (
            r['mark'], r['elem'].replace(',', ' '), r['db'], r['shape'], r['run'], r['pieces'],
            r['piece'], r['count'], r['laps'], r['total_len'], r['weight'], r['note'].replace(',', ' ')))
    out.append(',,,,,,,,,,%.1f,الوزن الكلي' % s['total_weight'])
    return '\n'.join(out)
