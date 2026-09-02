# -*- coding: utf-8 -*-
"""
جدول تقطيع الحديد — Bar Bending Schedule.
يحسب لكل عنصر: القطر · الشكل · طول القطعة بعد التقطيع على أطوال السوق (12 م) ·
العدد · الطول الكلي · الوزن · عدد الوصلات وهدرها.
"""
import math
import engine as E
import detail as D

DENS = 7850.0            # كغم/م³

def w_per_m(db):
    return E.ab(db) / 1e6 * DENS          # كغم/م

def _mkrow(mark, elem, db, shape, run, count, fc, fy, top=False, note='', mode='code', extra=0.0):
    """run = الطول الكامل للسيخ الواحد (م) قبل التقطيع · count = عدد الأسياخ.
    extra = زيادة طول لكل سيخ (ثنيات/عكفات) بالمتر."""
    lap = E.lap_length(db, fc, fy, top=top, mode=mode)
    c = E.cut_run(run + extra, lap)
    steel = c['total_steel'] * count
    return dict(mark=mark, elem=elem, db=int(db), shape=shape,
                run=round(run + extra, 2), pieces=c['n'], piece=round(c['piece'], 2),
                count=count, laps=c['laps'] * count, lap_len=round(c['lap'], 2),
                waste=round(c['waste'] * count, 1),
                total_len=round(steel, 1), weight=round(steel * w_per_m(db), 1), note=note)

def schedule(R):
    """R = ناتج معالج المشروع (project.wizard)."""
    m = R['model']; g = R['grid']; fc = R['input']['fc']; fy = R['input']['fy']
    dt = m.get('detail') or {}
    mode = (dt.get('lap') or {}).get('mode', 'code')
    def _row(*a, **k):                       # القاعدة المختارة للوصلات تُطبَّق على كل الصفوف
        k.setdefault('mode', mode)
        return _mkrow(*a, **k)
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
                n = D.n_bars(wid, mesh['s'] / 1000.0)
                rows.append(_row('R-%s%s' % (mk, d_), 'حصيرة — تسليح %s %s' % (nm, lab),
                                 mesh['db'], 'مستقيم', ln - 0.15, n, fc, fy, top=top))
        ch = m['found']['chairs']
        rows.append(_row('R-CH', 'حصيرة — كراسي (%s)' % ch.get('name', ''), ch['db'],
                         'كرسي %d°' % ch.get('angle', 90), ch['len_each'], ch['n'], fc, fy,
                         note='%d ثنية لكل كرسي · تباعد %.1f م' % (ch.get('bends', 4), ch['spacing'])))
    elif rec == 'isolated':
        iso = alts['isolated']; t = iso['typical']
        for i, s in enumerate(iso['sizes']):
            n = D.n_bars(s['B'], t['spacing'] / 1000.0) * 2
            rows.append(_row('F%d' % (i + 1), 'أساس منفرد F%d (%.2f×%.2f م)' % (i + 1, s['B'], s['B']),
                             t['bar_db'], 'مستقيم بخطاف', s['B'] - 0.15, n, fc, fy))
        ch = m['found']['chairs']
        rows.append(_row('F-CH', 'أسس منفردة — كراسي (%s)' % ch.get('name', ''), ch['db'],
                         'كرسي %d°' % ch.get('angle', 90), ch['len_each'], ch['n'], fc, fy))
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

    # ------------------------------ الدولات ------------------------------
    dw = (m.get('col') or {}).get('rebar', {}).get('dowels')
    if dw:
        rows.append(_row('D-W', 'دولات ربط الأعمدة بالأساس', dw['db'], 'مستقيم بعكفة 90°',
                         dw['total_len'], dw['n'] * len(R['loads']), fc, fy,
                         note='%s — %s%s' % (dw['label'], dw['mode'],
                                             ' ⚠ ' + dw['warn'] if dw.get('warn') else '')))

    # ------------------------------ الأعمدة ------------------------------
    cr = m['col']['rebar']; ncol = len(R['loads'])
    lap_col = E.lap_length(cr['db'], fc, fy, mode=mode) / 1000.0
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
        det = bm.get('detail') or {}
        nlines = (g['ny'] + 1) if d_ == 'x' else (g['nx'] + 1)
        nspan = bm['n']
        run = bm['span'] * nspan + 0.3
        nb = bm['rebar']['bottom']['n']
        n_bent = det.get('n_bent', 0)
        if n_bent:
            rows.append(_row('B%s-B1' % lab, 'جسور %s — سفلي مستقيم' % lab,
                             bm['rebar']['bottom']['db'], 'مستقيم', run,
                             (nb - n_bent) * nlines * nf, fc, fy))
            rows.append(_row('B%s-B2' % lab, 'جسور %s — سفلي مثني 45°' % lab,
                             bm['rebar']['bottom']['db'], 'مثني 45°', run,
                             n_bent * nlines * nf, fc, fy,
                             extra=det['bar']['extra_total'] * nspan,
                             note='الثني عند L/7 = %.2f م — %s' % (det['bend_at'], det['bar']['label'])))
        else:
            rows.append(_row('B%s-B' % lab, 'جسور %s — تسليح سفلي' % lab,
                             bm['rebar']['bottom']['db'], 'مستقيم', run, nb * nlines * nf, fc, fy))
        nt = bm['rebar']['top']['n']
        if det:
            n_in = max(0, nspan - 1)              # مساند داخلية بالمحور الواحد (والطرفيان نصف سيخ)
            half = -(-nt // 2)
            for mk2, cnt, ln2, nm2 in (('T1', half, det['top1_len'], 'الأولى (L/3)'),
                                       ('T2', nt - half, det['top2_len'], 'الثانية (L/5)')):
                if cnt <= 0:
                    continue
                if n_in:
                    rows.append(_row('B%s-%s' % (lab, mk2),
                                     'جسور %s — علوي فوق المساند الداخلية — الطبقة %s' % (lab, nm2),
                                     bm['rebar']['top']['db'], 'مستقيم بعكفة', ln2,
                                     cnt * n_in * nlines * nf, fc, fy, top=True,
                                     note='يمتد لكل جهة من وجه المسند'))
                rows.append(_row('B%s-%sE' % (lab, mk2),
                                 'جسور %s — علوي فوق المسندين الطرفيين — الطبقة %s' % (lab, nm2),
                                 bm['rebar']['top']['db'], 'مستقيم بعكفة 90°', ln2 / 2.0,
                                 cnt * 2 * nlines * nf, fc, fy, top=True,
                                 note='المسند الطرفي: نصف السيخ للداخل بعكفة 90° داخل العمود'))
        else:
            rows.append(_row('B%s-T' % lab, 'جسور %s — تسليح علوي' % lab,
                             bm['rebar']['top']['db'], 'مستقيم', run, nt * nlines * nf, fc, fy, top=True))
        st = bm['rebar']['stirrup']
        hk = det.get('hook_stirrup') or D.hook(st['db'], 135, 'tie')
        cvb = det.get('cover', 40.0)
        per = 2 * ((bm['b'] - 2 * cvb) + (bm['h'] - 2 * cvb)) / 1000.0 + 2 * hk['added'] / 1000.0
        nst = D.n_bars(bm['span'], st['s'] / 1000.0) * nspan
        rows.append(_row('B%s-S' % lab, 'جسور %s — أساور بعكفة 135°' % lab, st['db'], 'أسوار مغلقة',
                         per, nst * nlines * nf, fc, fy,
                         note='عكفتان %s' % hk['label']))

    # ------------------------------ السقوف ------------------------------
    sl = m['slab']
    for lay in sl.get('layout', []):
        rows.append(_row('S-%s' % lay['key'].upper()[:3], 'سقوف — %s' % lay['name'],
                         lay['db'], 'مستقيم بعكفة', lay['length'], lay['n'] * nf, fc, fy,
                         note=lay['note']))
    mt = sl['mesh']['top']; tl = sl.get('top_len') or {}
    # التسليح العلوي: أسياخ محدودة فوق كل محور مساند تمتد L/4 لكل جهة — لا تمتد على البلاطة كاملة
    for d_, lines, across, ln in (('X', g['ny'] + 1, L, tl.get('y', g['sy'] / 2)),
                                  ('Y', g['nx'] + 1, B, tl.get('x', g['sx'] / 2))):
        per = D.n_bars(across, mt['s'] / 1000.0)
        inner, edge = max(0, lines - 2), min(2, lines)
        if inner:
            rows.append(_row('S-T%s' % d_, 'سقوف — تسليح علوي فوق المحاور الداخلية %s' % d_,
                             mt['db'], 'مستقيم بثنية', ln, per * inner * nf, fc, fy, top=True,
                             note='طول السيخ %.2f م = 2×(L/4) + عرض المسند — فوق المساند فقط' % ln))
        rows.append(_row('S-TE%s' % d_, 'سقوف — تسليح علوي فوق المحاور الطرفية %s' % d_,
                         mt['db'], 'مستقيم بعكفة 90°', ln / 2.0, per * edge * nf, fc, fy, top=True,
                         note='المحور الطرفي: نصف السيخ للداخل فقط (%.2f م) بعكفة بالعمود' % (ln / 2.0)))
    gm = sl.get('geom') or {}          # تسليح الأعصاب مُدرَج ضمن layout أعلاه
    co = sl['extra']['corner']
    rows.append(_row('S-CR', 'سقوف — تسليح الأركان (علوي وسفلي)', co['db'], 'مستقيم',
                     co['size'] * max(L, B), 4 * 4 * nf, fc, fy, top=True,
                     note='ACI 8.7.3.1 — أركان البلاطة ثنائية الاتجاه'))
    ig = sl['extra']['integrity']
    rows.append(_row('S-IG', 'سقوف — تسليح التماسك خلال الأعمدة', ig['db'], 'مستقيم',
                     max(g['sx'], g['sy']) + 0.5, ig['n'] * 2 * ncol * nf, fc, fy,
                     note='ACI 8.7.4.2 — أسياخ سفلية مستمرة خلال العمود'))
    if gm.get('kind') == 'hordi':
        blocks = int(round((gm.get('blocks_per_m2') or 0) * R['footprint'] * nf))
        rows.append(dict(mark='S-BLK', elem='سقوف — بلوك الهوردي', db=0, shape='بلوك',
                         run=0.0, pieces=1, piece=0.0, count=blocks, laps=0, lap_len=0.0,
                         waste=0.0, total_len=0.0, weight=round(blocks * (gm['block']['kg'] or 12), 1),
                         note='بلوك %d×%d×%d مم — %.1f قطعة/م² (ليس حديداً)'
                              % (gm['block']['W'], gm['block']['L'], gm['block']['H'],
                                 gm.get('blocks_per_m2') or 0)))
    sch = sl['chairs']
    rows.append(_row('S-CH', 'سقوف — كراسي (%s)' % sch.get('name', ''), sch['db'],
                     'كرسي %d°' % sch.get('angle', 90), sch['len_each'], sch['n'] * nf, fc, fy,
                     note='ارتفاع %d مم · %d ثنية · تباعد %.1f م · بسكويت %d قطعة'
                          % (int(sch['height']), sch.get('bends', 4), sch['spacing'],
                             sch['spacers'] * nf)))

    # ------------------------------ الملخص ------------------------------
    steel_rows = [r for r in rows if r['db'] > 0]       # صفوف الحديد فقط (البلوك ليس حديداً)
    by_db = {}
    for r in steel_rows:
        b = by_db.setdefault(r['db'], dict(db=r['db'], count=0, length=0.0, weight=0.0, laps=0, waste=0.0))
        b['count'] += r['count']; b['length'] += r['total_len']
        b['weight'] += r['weight']; b['laps'] += r['laps']; b['waste'] += r['waste']
    tot_w = sum(r['weight'] for r in steel_rows)
    tot_waste = sum(r['waste'] * w_per_m(r['db']) for r in steel_rows)
    return dict(rows=rows, by_db=sorted(by_db.values(), key=lambda x: x['db']),
                total_weight=tot_w, total_ton=tot_w / 1000.0,
                lap_weight=tot_waste, lap_pct=(tot_waste / tot_w * 100.0) if tot_w else 0.0,
                stock=E.BAR_STOCK, bars=sum(r['count'] * r['pieces'] for r in steel_rows),
                lap_mode=(dt.get('lap') or {}).get('label', 'ACI 25.5.2.1'),
                note='الأطوال محسوبة على أساس أسياخ سوق بطول %.0f م — كل ما زاد يُقطّع ويُوصل. '
                     'قاعدة الوصلات المعتمدة: %s'
                     % (E.BAR_STOCK, (dt.get('lap') or {}).get('label', 'صنف B = 1.3·ld')))

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
