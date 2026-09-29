/* قسم الأوتوكاد — ✅ فحص الحديد · 📊 لوحة الملخص · 📘 دليل العنصر بالمختبر الحي.
   إضافة خالصة فوق نتيجة /api/cad/read: تقرأ جداول الجسور والأعمدة وشبكات البلاطات والأساسات
   المصمَّمة كما هي، وتقارن كل تفصيلة بما يطلبه ACI 318-19 عبر قواعد rebarkb.js (نفس قواعد المعالج)،
   وتحسب الكميات (خرسانة وحديد حسب القطر)، وتفتح لكل عنصر دليلاً بطبقات فيه نفس المختبرات الفيزيائية
   الحية مزروعة بأرقام العنصر نفسه. الأحمال تقديرية (مساحة رافدة × أحمال نموذجية) ومعلَّمة كذلك —
   أرقام اللوحة هي المعتمدة ولا يُغيَّر منها شيء. */
(function () {
  const A = window.CADAUDIT = {};
  const RB = () => window.REBAR;
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fin = x => x !== null && x !== undefined && isFinite(x);
  const f0 = x => fin(x) ? Math.round(x).toLocaleString('en-US') : '—';
  const f1 = x => fin(x) ? (+x).toFixed(1) : '—';
  const f2 = x => fin(x) ? (+x).toFixed(2) : '—';
  const sq = Math.sqrt, AR = db => Math.PI * db * db / 4;
  const nb = b => (b && b.n) || 0, As = b => (b && b.n && b.d) ? b.n * AR(b.d) : 0;
  const bl = b => b && b.n ? b.n + 'Ø' + b.d : '—';
  const tl = t => t && t.d ? 'Ø' + t.d + '@' + t.s + (t.sets ? ' (' + t.sets + '/مجموعة)' : '') : '—';
  const AXN = n => String(n || '').replace("'", '′');
  const CK = (name, val, lim, state, clause, why) => ({ name, val: String(val), lim: String(lim), state, clause, why: why || '' });
  const okf = c => c ? 'ok' : 'fail';
  const COV = { beam: 40, col: 40, slab: 20, foot: 75 };
  const SDL = 2.5;                                        // تشطيبات 1.5 + قواطع 1.0 kPa (تقديري)
  const FORDER = ['basement', 'ground', 'mezzanine', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'typical', 'roof'];
  const FNAME = { basement: 'السرداب', ground: 'الأرضي', mezzanine: 'الميزانين', first: 'الأول', second: 'الثاني', third: 'الثالث', fourth: 'الرابع', fifth: 'الخامس',
    sixth: 'السادس', seventh: 'السابع', eighth: 'الثامن', ninth: 'التاسع', tenth: 'العاشر', typical: 'المتكرر', roof: 'السطح' };
  const fname = k => FNAME[k] || k;

  /* ============================ المواد ============================ */
  A.mat = function (RES) {
    const m = (RES && RES.materials) || {};
    const fc = +m.fc > 10 && +m.fc < 120 ? +m.fc : 28, fy = +m.fy > 200 && +m.fy < 700 ? +m.fy : 420;
    return { fc, fy, fcSrc: +m.fc > 10 ? 'من ملاحظات اللوحة' : 'افتراضي — لم يُكتب باللوحة', fySrc: +m.fy > 200 ? 'من ملاحظات اللوحة' : 'افتراضي (Grade 60)' };
  };

  /* ============================ مقاومات المقطع ============================ */
  function flex(As_, b, d, fc, fy) {                    // مقطع مستطيل بحديد شد فقط (22.2)
    if (!As_ || !d) return { phiMn: 0, a: 0, c: 0, et: 0, phi: 0.9 };
    const a = As_ * fy / (0.85 * fc * b), c = a / RB().beta1(fc), et = 0.003 * (d - c) / c;
    const phi = et >= 0.005 ? 0.9 : et <= 0.002 ? 0.65 : 0.65 + 0.25 * (et - 0.002) / 0.003;   // جدول 21.2.2
    return { phiMn: phi * As_ * fy * (d - a / 2) / 1e6, a, c, et, phi };
  }
  function shear(b, d, fc, Av, s) {                     // 22.5.5.1 (المبسّطة) + 22.5.8.5.3
    const Vc = 0.17 * sq(fc) * b * d / 1000, Vs = s ? Math.min(Av * 420 * d / s / 1000, 0.66 * sq(fc) * b * d / 1000) : 0;
    return { Vc, Vs, phiVn: 0.75 * (Vc + Vs) };
  }

  /* ============================ السياق: الجسر ============================ */
  function beamCtx(bm, M, geo) {
    const R = RB(), cover = COV.beam, st = bm.stir || {}, se = st.end || st.mid || null, sm = st.mid || st.end || null;
    const dt = (se && se.d) || 10, sEnd = (se && se.s) || null, sMid = (sm && sm.s) || sEnd;
    const bot = bm.bot || {}, top = bm.top || {}, bc = bot.cont, bx = bot.extra, tc = top.cont, tsu = top.sup;
    const dbB = (bc || bx || {}).d || 16, dbT = (tc || tsu || {}).d || 16;
    const nBot = nb(bc) + nb(bx), nTop = nb(tc) + nb(tsu);
    const fB = R.fit(bm.b, cover, dt, Math.max(1, nBot), dbB, 20), fT = R.fit(bm.b, cover, dt, Math.max(1, nTop), dbT, 20);
    const n1 = Math.min(nBot, fB.nMax), n2 = nBot - n1, t1 = Math.min(nTop, fT.nMax), t2 = nTop - t1;
    const d = bm.h - cover - dt - dbB / 2 - (n2 > 0 ? n2 / nBot * (dbB + 25) : 0);
    const dT = bm.h - cover - dt - dbT / 2 - (t2 > 0 ? t2 / nTop * (dbT + 25) : 0);
    return { kind: 'beam', mark: bm.mark || '', b: bm.b, h: bm.h, cover, dt, sEnd, sMid, dbB, dbT, nBot, nTop, n1, n2, t1, t2, d, dT,
      AsB: As(bc) + As(bx), AsT: As(tc) + As(tsu), AsBc: As(bc), bc, bx, tc, tsu, side: bm.side, fc: M.fc, fy: M.fy, M, bm, geo: geo || null };
  }
  // الشكل والحمل التقديري للجسر من المسقط: الاستمرارية، العرض الرافد، أعمدة الطرفين
  function beamGeo(B, fkey, el, opts) {
    const f = ((B && B.floors) || []).find(x => x.key === fkey);
    if (!f || !el) return null;
    const hz = el.o === 'h', L = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
    const ax = q => hz ? [Math.min(q.x1, q.x2), Math.max(q.x1, q.x2), q.y1] : [Math.min(q.y1, q.y2), Math.max(q.y1, q.y2), q.x1];
    const [a1, a2, c0] = ax(el), same = (f.beams || []).filter(q => q !== el && q.o === el.o);
    const line = same.filter(q => Math.abs(ax(q)[2] - c0) < 0.2);
    const endL = !line.some(q => Math.abs(ax(q)[1] - a1) < 0.8), endR = !line.some(q => Math.abs(ax(q)[0] - a2) < 0.8);
    let up = null, dn = null;
    same.forEach(q => { const [p1, p2, cq] = ax(q), ov = Math.min(p2, a2) - Math.max(p1, a1); if (ov < 0.3 * L) return;
      const dd = cq - c0; if (dd > 0.3 && (up === null || dd < up)) up = dd; if (dd < -0.3 && (dn === null || -dd < dn)) dn = -dd; });
    const cap = v => v === null ? 0 : Math.min(v, 9);
    const trib = (cap(up) + cap(dn)) / 2 || 1.0;
    const colAt = (x, y) => (f.columns || []).find(c => Math.abs(c.x - x) < 0.8 && Math.abs(c.y - y) < 0.8);
    const cA = colAt(el.x1, el.y1), cB = colAt(el.x2, el.y2), cw = c => c ? (hz ? c.b : c.h) : 0;
    const cant = !!el.cant, ln = cant ? L : Math.max(0.5, L - cw(cA) / 2000 - cw(cB) / 2000);
    const t = (f.slab && f.slab.t) || 200, LL = (opts && opts.LL) || 3.0;
    const D = 24 * t / 1000 + SDL, sw = 24 * el.b / 1000 * Math.max(0, el.h - t) / 1000;
    const wD = D * trib + sw, wL = LL * trib, wu = Math.max(1.4 * wD, 1.2 * wD + 1.6 * wL);
    const kind = cant ? 'cant' : endL && endR ? 'single' : endL || endR ? 'end' : 'interior';
    const C = { single: [1 / 8, 1 / 16], end: [1 / 14, 1 / 10], interior: [1 / 16, 1 / 11], cant: [0, 1 / 2] }[kind];
    const Mp = C[0] * wu * ln * ln, Mn = C[1] * wu * ln * ln, Vu = cant ? wu * ln : (kind === 'end' ? 1.15 : 1) * wu * ln / 2;
    return { f, L, ln, trib, t, D, LL, sw, wD, wL, wu, kind, endL, endR, Cp: C[0], Cn: C[1], Mp, Mn, Vu, cwA: cw(cA), cwB: cw(cB), up, dn };
  }

  /* ============================ السياق: العمود ============================ */
  function faces(n, b, h, db, cc) {                     // توزيع الأسياخ على الأوجه: الزوايا + البقية بأوسع خلوص ممكن
    const k = Math.max(0, Math.floor((n - 4) / 2));
    if (!db) { const kb = Math.round(k * b / (b + h)); return { nx: 2 + kb, ny: 2 + (k - kb) }; }
    let best = null;
    for (let kb = 0; kb <= k; kb++) {
      const nx = 2 + kb, ny = 2 + (k - kb), cx = (b - 2 * cc - nx * db) / (nx - 1), cy = (h - 2 * cc - ny * db) / (ny - 1), m = Math.min(cx, cy);
      if (!best || m > best.m + 1e-9) best = { nx, ny, m, cx, cy };
    }
    return best;
  }
  function colCtx(cd, b, h, M, geo, extra) {
    const main = cd && cd.main, ties = cd && cd.ties, circ = extra && extra.circ;
    const n = nb(main), db = main ? main.d : 0, dt = ties ? ties.d : 10, s = ties ? ties.s : null, sets = ties ? (ties.sets || 1) : 1;
    return Object.assign({ kind: 'column', b, h, circ, n, db, dt, s, sets, Ast: As(main), cover: COV.col, fc: M.fc, fy: M.fy, M, cd, geo: geo || null }, extra || {});
  }
  function colGeo(B, fkey, x, y, opts) {
    const fl = (B && B.floors) || [], fi = fl.findIndex(f => f.key === fkey), f = fl[fi];
    if (!f) return null;
    const hb = Math.max(0, ...(f.beams || []).map(q => q.h || 0)) || 600;
    const ft = (B.footings || []).find(q => Math.abs(q.x - x) < 0.35 && Math.abs(q.y - y) < 0.35);
    const nf = fl.length, frac = (nf - fi) / nf, PuBase = ft && ft.Pu ? ft.Pu : null;
    return { f, fi, nf, H: f.h, ts: (f.slab && f.slab.t) || 200, hb, ln: Math.max(0.5, f.h - hb / 1000), PuBase, Pu: PuBase ? PuBase * frac : null, frac, ft };
  }

  /* ============================ السياق: البلاطة والأساس ============================ */
  function panelAt(B, x, y) {                           // اللوح (خلية المحاور) الذي تقع فيه النقطة
    const g = (B && B.grid) || {}, px = (g.x || []).map(a => a.pos).sort((a, b) => a - b), py = (g.y || []).map(a => a.pos).sort((a, b) => a - b);
    const cell = (P, v) => { let lo = null, hi = null; P.forEach(p => { if (p <= v + 1e-6) lo = p; if (hi === null && p > v + 1e-6) hi = p; }); return lo !== null && hi !== null ? hi - lo : null; };
    const wx = cell(px, x), wy = cell(py, y);
    return wx && wy ? { a: Math.min(wx, wy), b: Math.max(wx, wy) } : null;
  }
  function bigPanel(B) {                                // أكبر لوح بالشبكة (الحاكم للسماكة)
    const g = (B && B.grid) || {}, dx = [], dy = [];
    const P = (L, o) => { const s = L.map(a => a.pos).sort((a, b) => a - b); for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 0.5) o.push(s[i] - s[i - 1]); };
    P(g.x || [], dx); P(g.y || [], dy);
    if (!dx.length || !dy.length) return null;
    const a = Math.max(...dx), b = Math.max(...dy);
    return { a: Math.min(a, b), b: Math.max(a, b) };
  }
  function slabCtx(f, M, panel) {
    const s = f.slab || {}, ribs = s.ribs || null, beamless = !!s.beamless || /flat|مسطح|فطر/i.test(String((s.system && s.system.name) || ''));
    return { kind: 'slab', t: s.t || 200, mesh: s.mesh || {}, ribs, sys: (s.system && s.system.name) || '', beamless, drops: (s.drops || []).length,
      fc: M.fc, fy: M.fy, M, f, panel, cover: COV.slab };
  }
  function footCtx(ft, M, col) {
    return { kind: 'footing', B: ft.B, h: ft.h, db: ft.db || 12, s: ft.s || 200, PD: ft.PD, PL: ft.PL, Pu: ft.Pu, ok: ft.ok, designed: ft.designed !== false,
      mark: ft.col || '', cx: col ? col.b : 400, cy: col ? col.h : 400, fc: M.fc, fy: M.fy, M, cover: COV.foot, ft };
  }

  /* ============================ الفحوص ============================ */
  function beamChecks(c) {
    const R = RB(), out = [], fc = c.fc, fy = c.fy;
    if (!c.nBot || !c.nTop) out.push(CK('الحديد مذكور بالجدول', (c.nBot ? 'سفلي ✓' : 'سفلي —') + ' · ' + (c.nTop ? 'علوي ✓' : 'علوي —'), 'سفلي وعلوي', 'fail', '9.6 + 9.7', 'الجدول ناقص لهذه العلامة — ما ينفّذ جسر بلا حديد بأحد الوجهين.'));
    const amB = R.asMinBeam(fc, fy, c.b, c.d), amT = R.asMinBeam(fc, fy, c.b, c.dT);
    if (c.nBot) out.push(CK('أقل حديد سفلي (المنتصف)', f0(c.AsB) + ' مم²', '≥ ' + f0(amB), okf(c.AsB >= amB - 1), '9.6.1.2', 'يمنع الانهيار المفاجئ لحظة التشقق: الحديد يشيل ما كانت تشيله الخرسانة بالشد.'));
    if (c.nTop) out.push(CK('أقل حديد علوي (فوق المساند)', f0(c.AsT) + ' مم²', '≥ ' + f0(amT), okf(c.AsT >= amT - 1), '9.6.1.2', ''));
    const mxB = R.asMaxBeam(fc, fy, c.b, c.d), mxT = R.asMaxBeam(fc, fy, c.b, c.dT);
    if (c.nBot || c.nTop) out.push(CK('أقصى حديد (εt ≥ 0.004)', f0(Math.max(c.AsB, c.AsT)) + ' مم²', '≤ ' + f0(Math.min(mxB, mxT)), okf(c.AsB <= mxB && c.AsT <= mxT), '9.3.3.1', 'حديد أكثر من هذا يخلّي الخرسانة تنسحق قبل ما يخضع الحديد — انهيار بلا إنذار.'));
    if (c.nBot) {
      const fit = R.fit(c.b, c.cover, c.dt, Math.max(1, c.n1), c.dbB, 20);
      out.push(CK('ترتيب الحديد السفلي', c.n2 ? c.n1 + ' + ' + c.n2 + ' بطبقتين' : c.nBot + ' بطبقة واحدة', 'أقصى ' + fit.nMax + ' Ø' + c.dbB + ' بالطبقة', c.n2 ? 'warn' : 'ok', '25.2.1 + 25.2.2',
        c.n2 ? `العرض ${c.b} مم ما يستوعب ${c.nBot} أسياخ Ø${c.dbB} بطبقة وحدة بخلوص ${f0(fit.need)} مم — تصير طبقتين بينهما ≥ 25 مم، وينزل d إلى ${f0(c.d)} مم.` : `الخلوص الصافي ${f1(fit.clear)} مم ≥ ${f1(fit.need)} مم.`));
    }
    if (c.nTop && c.t2) out.push(CK('ترتيب الحديد العلوي', c.t1 + ' + ' + c.t2 + ' بطبقتين', 'أقصى ' + c.t1 + ' بالطبقة', 'warn', '25.2.1 + 25.2.2', 'الحديد العلوي فوق المساند يزدحم — الطبقة الثانية تحت الأولى مباشرة (نفس الخط الشاقولي) حتى تمر الهزّازة.'));
    if (c.n1 > 1) { const sc = (c.b - 2 * c.cover - 2 * c.dt - c.dbB) / (c.n1 - 1), sm = R.sMaxCrack(fy, c.cover + c.dt);
      out.push(CK('تباعد الأسياخ السفلية (التشقق)', f0(sc) + ' مم', '≤ ' + f0(sm), okf(sc <= sm + 0.5), '24.3.2', 'تباعد كبير = شقوق عريضة بالوجه المشدود (fs = ⅔fy).')); }
    if (c.sMid) {
      const Av = 2 * AR(c.dt), avm = R.avMin(fc, c.b, c.sMid, 420), sm = R.stirrupSmax(c.d, 0, fc, c.b);
      out.push(CK('مساحة الكانات Av (رجلين)', f0(Av) + ' مم²', '≥ ' + f0(avm), okf(Av >= avm - 0.5), '9.6.3.4', 'الحد الأدنى يمسك الشق القطري لحظة ظهوره.'));
      out.push(CK('أقصى تباعد للكانات بالمنتصف', c.sMid + ' مم', '≤ d/2 = ' + f0(sm.s), okf(c.sMid <= sm.s + 0.5), '9.7.6.2.2', 'كل شق قطري بزاوية 45° لازم تعبره كانة واحدة على الأقل.'));
      const dbL = Math.min(c.dbB, c.dbT), sz = R.seisBeam({ sys: 'imf', d: c.d, h: c.h, dbL, dt: c.dt }), se = c.sEnd || c.sMid;
      out.push(CK('كانات منطقة المفصل (2h من الوجه)', 'Ø' + c.dt + '@' + se, '≤ ' + f0(sz.s) + ' على ' + f0(sz.zone) + ' مم', se <= sz.s + 0.5 ? 'ok' : 'warn', sz.clause,
        se <= sz.s + 0.5 ? 'التباعد الطرفي يحقق شرط الإطار المتوسط المقاوم للزلازل.' : `للإطار المقاوم للزلازل (متوسط): كثّف إلى Ø${c.dt}@${Math.floor(sz.s / 25) * 25} على ${f0(sz.zone)} مم من كل وجه، وأول كانة على 50 مم — وإذا المبنى بمنطقة غير زلزالية يكفي شرط d/2.`));
      const tdm = R.tieDbMin(Math.max(c.dbB, c.dbT));
      out.push(CK('قطر الكانة', 'Ø' + c.dt, '≥ Ø' + tdm, okf(c.dt >= tdm), '25.7.2.2 + 18.4.2.4', ''));
      const hk = R.hook(c.dt, 135, 'tie');
      out.push(CK('عكفة الكانة', '135° · امتداد ' + f0(hk.ext) + ' مم', '≥ max(6db ، 75)', 'info', '25.3.2 + 25.7.1.3', 'اطلبها 135° بالموقع — عكفة 90° تنفتح عند انقشار الغطاء.'));
    } else out.push(CK('الكانات مذكورة بالجدول', '—', 'Ø@s', 'fail', '9.6.3', 'لا كانات بالجدول لهذه العلامة.'));
    if (c.nBot) { const r = c.AsBc / Math.max(1, c.AsB);
      out.push(CK('الحديد السفلي الداخل للمسند', f0(r * 100) + '% (' + bl(c.bc) + ')', '≥ 25% وسيخان', okf(r >= 0.25 - 1e-6 && nb(c.bc) >= 2), '9.7.3.8.1 + 9.7.7.1', 'ربع الحديد الموجب على الأقل يدخل المسند 150 مم، وسيخان مستمران لسلامة المنشأ.')); }
    if (c.nTop) out.push(CK('الحديد العلوي المستمر', bl(c.tc), '≥ سيخين', okf(nb(c.tc) >= 2), '9.7.7.1 + 18.4.2.1', 'سيخان مستمران على الأقل بالوجه العلوي على طول الجسر.'));
    if (c.nBot && c.nTop) out.push(CK('الموجب عند الوجه ≥ ⅓ السالب', f0(c.AsBc) + ' مم²', '≥ ' + f0(c.AsT / 3), c.AsBc >= c.AsT / 3 - 1 ? 'ok' : 'warn', '18.4.2.2', 'بالزلزال ينعكس العزم عند المسند فيصير موجباً — لازم حديد سفلي كافٍ داخل العمود.'));
    const sk = R.skin(c.h, c.cover, fy);
    out.push(CK('حديد جانبي (Skin)', c.side && c.side.n ? bl(c.side) : 'لا يوجد', c.h > 900 ? 'مطلوب (h > 900)' : 'غير مطلوب (h ≤ 900)', c.h > 900 && !(c.side && c.side.n) ? 'fail' : 'ok', '9.7.2.3',
      c.h > 900 ? 'بتباعد ≤ ' + f0(sk.s) + ' مم على النصف المشدود من كل وجه.' : (c.side && c.side.n ? 'مضاف للتحكم بالتشقق الجانبي — ممارسة جيدة.' : '')));
    if (c.nBot || c.nTop) {
      const lb = R.lapTension({ db: c.dbB, fc, fy, cover: c.cover }), lt = R.lapTension({ db: c.dbT, fc, fy, cover: c.cover, top: true });
      out.push(CK('طول الوصلة (صنف B)', 'سفلي ' + f0(lb.lap) + ' · علوي ' + f0(lt.lap) + ' مم', 'السفلي فوق المساند · العلوي بالمنتصف', lb.allowed && lt.allowed ? 'info' : 'warn', 'جدول 25.5.2.1', lb.note || lt.note || 'اطلب هذه الأطوال بالموقع — الحديد العلوي بمعامل ψt = 1.3.'));
    }
    if (c.geo && c.nBot) {
      const g = c.geo, fb = flex(c.AsB, c.b, c.d, fc, fy), ft = flex(c.AsT, c.b, c.dT, fc, fy);
      const note = `تحقق تقريبي: شريحة ${f2(g.trib)} م × (ميت ${f1(g.D)} + حي ${f1(g.LL)} kPa) بمعاملات ACI §6.5 — أرقام اللوحة هي المعتمدة.`;
      if (g.Mp > 0) out.push(CK('مقاومة الانحناء الموجب (تقديري)', 'φMn = ' + f1(fb.phiMn) + ' kN·m', 'Mu ≈ ' + f1(g.Mp) + ' kN·m', fb.phiMn >= g.Mp ? 'ok' : 'warn', '22.2 + 6.5.2', note));
      if (c.nTop) out.push(CK('مقاومة الانحناء السالب (تقديري)', 'φMn = ' + f1(ft.phiMn) + ' kN·m', 'Mu ≈ ' + f1(g.Mn) + ' kN·m', ft.phiMn >= g.Mn ? 'ok' : 'warn', '22.2 + 6.5.2', g.kind === 'cant' ? 'كابولي: كل الحمل عزم سالب عند المسند.' : ''));
      if (c.sEnd || c.sMid) { const v = shear(c.b, c.d, fc, 2 * AR(c.dt), c.sEnd || c.sMid);
        out.push(CK('مقاومة القص عند المسند (تقديري)', 'φVn = ' + f1(v.phiVn) + ' kN', 'Vu ≈ ' + f1(g.Vu) + ' kN', v.phiVn >= g.Vu ? 'ok' : 'warn', '22.5 + 6.5.4', '')); }
    }
    out.push(CK('الغطاء الخرساني (مفترض)', c.cover + ' مم', '≥ 40 مم', 'info', '20.5.1.3.1', 'للجسور غير المعرّضة — راجع ملاحظات اللوحة.'));
    return out;
  }

  function colChecks(c) {
    const R = RB(), out = [], fc = c.fc, fy = c.fy;
    if (!c.n) { out.push(CK('حديد العمود مذكور بالجدول', '—', 'Main Bars + Ties', 'fail', '10.6 + 25.7', 'لا حديد لهذا العمود بهذا الطابق بالجدول.')); return out; }
    const Ag = c.circ ? Math.PI * c.b * c.b / 4 : c.b * c.h, rho = c.Ast / Ag;
    out.push(CK('نسبة التسليح ρ', (rho * 100).toFixed(2) + '%', '1% ≤ ρ ≤ 8%', rho < 0.01 - 1e-6 || rho > 0.08 ? 'fail' : rho > 0.04 ? 'warn' : 'ok', '10.6.1.1',
      rho > 0.04 && rho <= 0.08 ? 'مقبول، لكن فوق 4% تزدحم الوصلات (ضعف الحديد عند التراكب) — فكّر بوصلة ميكانيكية أو تدريج الوصلات.' : 'أقل من 1% يزحف العمود مع الزمن، وأكثر من 8% ما تنصب الخرسانة.'));
    out.push(CK('عدد الأسياخ', c.n, '≥ ' + (c.circ ? 6 : 4), okf(c.n >= (c.circ ? 6 : 4)), '10.7.3.1', 'سيخ بكل زاوية على الأقل.'));
    const need = R.clearMin(c.db, 20, 'column');
    let clx = null, cly = null, F = null;
    if (!c.circ) {
      F = faces(c.n, c.b, c.h, c.db, c.cover + c.dt);
      clx = F.cx; cly = F.cy;
      const cl = Math.min(clx, cly);
      out.push(CK('الخلوص بين الأسياخ', f1(cl) + ' مم', '≥ ' + f1(need), okf(cl >= need - 0.5), '25.2.3', `توزيع تقديري ${F.nx} × ${F.ny} على الأوجه — الأعمدة تُصب من ارتفاع فتحتاج خلوصاً ≥ max(40 ، 1.5db).`));
    }
    const tdm = R.tieDbMin(c.db);
    out.push(CK('قطر الأتاري', 'Ø' + c.dt, '≥ Ø' + tdm, okf(c.dt >= tdm), '25.7.2.2', c.db >= 36 ? 'الأسياخ Ø36 فأكبر تحتاج أتاري Ø13 على الأقل.' : ''));
    if (c.s) {
      const ts = R.tieS(c.db, c.dt, c.b, c.circ ? c.b : c.h);
      out.push(CK('تباعد الأتاري', c.s + ' مم', '≤ ' + f0(ts.s) + ' (' + ts.gov + ')', okf(c.s <= ts.s + 0.5), '25.7.2.1', 'يمنع انبعاج الأسياخ الطولية بين طوقين.'));
      if (F) {
        const req = (cl, n) => cl > 150 ? n - 2 : Math.floor((n - 2) / 2);
        const needX = req(clx, F.nx), needY = req(cly, F.ny), needT = needX + needY, prov = (c.sets - 1) * 2;
        out.push(CK('إسناد الأسياخ جانبياً', (c.sets > 1 ? c.sets + ' قطع بالمجموعة' : 'طوق خارجي فقط'), needT ? 'مطلوب إسناد ' + needT + ' سيخ داخلي' : 'الزوايا تكفي', prov >= needT ? 'ok' : 'warn', '25.7.2.3',
          'كل سيخ ركني وكل سيخ بديل يُسند بزاوية ≤ 135°، ولا سيخ حر أبعد من 150 مم صافي عن سيخ مسنود. تقدير: كل قطعة داخلية تسند سيخين.'));
      }
      if (c.geo) {
        const sz = R.seisCol({ sys: 'imf', b: c.b, h: c.circ ? c.b : c.h, ln: c.geo.ln * 1000, dbL: c.db, dt: c.dt });
        out.push(CK('تطويق طرفي العمود (زلزالي متوسط)', 'Ø' + c.dt + '@' + c.s, 'so ≤ ' + f0(sz.so) + ' على lo = ' + f0(sz.lo) + ' مم', c.s <= sz.so + 0.5 ? 'ok' : 'warn', sz.clause,
          c.s <= sz.so + 0.5 ? 'التباعد نفسه يحقق التطويق.' : `الجدول يعطي تباعداً واحداً: كثّف إلى Ø${c.dt}@${Math.floor(sz.so / 25) * 25} على ${f0(sz.lo)} مم من كل طرف (تحت الجسر وفوق البلاطة)، وأول طوق على ${f0(sz.so / 2)} مم.`));
      }
    } else out.push(CK('الأتاري مذكورة بالجدول', '—', 'Ø@s', 'fail', '25.7.2', ''));
    if (c.tiesFrom) out.unshift(CK('الأتاري بهذا الطابق', 'خلية فارغة بالجدول', 'Ø@s', 'warn', '25.7.2', `ما لقيت أتاري مكتوبة لهذا الطابق — افترضت نفس أتاري ${fname(c.tiesFrom)} (Ø${c.dt}@${c.s}). تأكد من اللوحة.`));
    const lc = R.lapComp({ db: c.db, fc, fy }), lt = R.lapTension({ db: c.db, fc, fy, cover: c.cover });
    out.push(CK('وصلة الأسياخ الطولية', 'انضغاط ' + f0(lc.lap) + ' مم', 'شد صنف B ' + f0(lt.lap) + ' مم', lt.allowed ? 'info' : 'warn', '25.5.5.1 + 10.7.5.2', lt.note || 'إذا عليه عزم زلزالي يشد الأسياخ تُعتمد وصلة الشد — والأكبر هو الآمن.'));
    if (c.geo && c.geo.Pu) {
      const P0 = (0.85 * fc * (Ag - c.Ast) + fy * c.Ast) / 1000, phiPn = (c.circ ? 0.85 * 0.75 : 0.8 * 0.65) * P0;
      out.push(CK('الحمل المحوري (تقديري)', 'Pu ≈ ' + f0(c.geo.Pu) + ' kN', 'φPn,max = ' + f0(phiPn) + ' kN', c.geo.Pu <= phiPn ? 'ok' : 'warn', '22.4.2.1 + 21.2.2',
        `من حمل الأساس المصمَّم (${f0(c.geo.PuBase)} kN) × الطوابق فوق هذا الطابق (${c.geo.nf - c.geo.fi}/${c.geo.nf}) — بلا عزوم الإطار.`));
    }
    out.push(CK('الغطاء الخرساني (مفترض)', c.cover + ' مم', '≥ 40 مم', 'info', '20.5.1.3.1', ''));
    return out;
  }

  function slabChecks(c) {
    const out = [], rib = !!c.ribs, tt = rib ? (c.ribs.topping || 70) : c.t;
    const rmin = c.fy <= 420 ? 0.0018 : Math.max(0.0014, 0.0018 * 420 / c.fy), asmin = rmin * 1000 * tt;
    const me = [['السفلية', c.mesh.bot], ['العلوية', c.mesh.top]].filter(x => x[1] && x[1].d && x[1].s);
    if (!me.length) out.push(CK('شبكة البلاطة مذكورة باللوحة', '—', 'Ø@s', 'warn', '7.6 / 8.6', 'ما لقيت نداء تسليح (مثل Ø12@200 B) قرب ألواح هذا الطابق.'));
    const main = c.mesh.bot && c.mesh.bot.d ? c.mesh.bot : c.mesh.top;
    if (main && main.d && main.s) {
      const A1 = AR(main.d) * 1000 / main.s;
      out.push(CK('أقل حديد (انكماش وحرارة)' + (rib ? ' — طبقة التغطية' : ''), f0(A1) + ' مم²/م', '≥ ' + rmin + '·b·' + (rib ? 't' : 'h') + ' = ' + f0(asmin), okf(A1 >= asmin - 1), rib ? '9.8.1.6 + 24.4.3.2' : '24.4.3.2 + 7.6.1.1 / 8.6.1.1',
        rib ? `للسقف العصبي يُحسب على طبقة التغطية ${tt} مم، والعزم يشيله حديد الأعصاب.` : ''));
    }
    me.forEach(([nm, m]) => {
      const lim = rib ? Math.min(5 * tt, 450) : Math.min(3 * c.t, 450), crit = rib ? lim : Math.min(2 * c.t, 450);
      out.push(CK('تباعد الشبكة ' + nm, m.s + ' مم', (rib ? '≤ min(5t ، 450) = ' : '≤ min(2h ، 450) = ') + f0(crit), m.s <= crit + 0.5 ? 'ok' : m.s <= lim + 0.5 ? 'warn' : 'fail', rib ? '24.4.3.3' : '8.7.2.2 / 7.7.2.3',
        rib ? '' : m.s <= crit + 0.5 ? '' : 'مقبول بعيداً عن المقاطع الحرجة (≤ 3h) — عند المساند ومنتصف البحر يلزم ≤ 2h للبلاطات باتجاهين.'));
    });
    if (c.panel && !rib) {
      const ln = Math.max(0.5, c.panel.b - 0.4) * 1000, beta = c.panel.b / c.panel.a;
      let hmin, cl, how;
      if (c.beamless) { hmin = Math.max(ln / 33, c.drops ? 100 : 125); cl = 'جدول 8.3.1.1'; how = 'بلاطة مسطحة بلا جسور: ln/33 (لوح داخلي، fy 420)'; }
      else if (beta > 2) { hmin = ln / 28; cl = 'جدول 7.3.1.1'; how = 'باتجاه واحد (β > 2): ln/28 للطرفين المستمرين'; }
      else { hmin = Math.max(ln * (0.8 + c.fy / 1400) / (36 + 9 * beta), 90); cl = '8.3.1.2 (معادلة ب)'; how = 'باتجاهين على جسور صلبة: ln(0.8 + fy/1400)/(36 + 9β)'; }
      out.push(CK('أقل سماكة بلا حساب هطول', c.t + ' مم', '≥ ' + f0(hmin) + ' مم', c.t >= hmin - 0.5 ? 'ok' : 'warn', cl, `${how} — لأكبر لوح ${f2(c.panel.a)}×${f2(c.panel.b)} م. أقل من هذا يحتاج حساب هطول صريح.`));
    }
    out.push(CK('الغطاء', c.cover + ' مم', '≥ 20 مم', 'info', '20.5.1.3.1', 'للبلاطات غير المعرّضة.'));
    return out;
  }

  function footChecks(c) {
    const R = RB(), out = [];
    const A1 = AR(c.db) * 1000 / c.s, amin = 0.0018 * 1000 * c.h;
    out.push(CK('أقل حديد', f0(A1) + ' مم²/م', '≥ 0.0018·b·h = ' + f0(amin), okf(A1 >= amin - 1), '13.3.4 + 7.6.1.1', ''));
    const smax = Math.min(3 * c.h, 450);
    out.push(CK('تباعد الحديد', f0(c.s) + ' مم', '≤ min(3h ، 450) = ' + f0(smax), okf(c.s <= smax + 0.5), '7.7.2.3', ''));
    const d = c.h - c.cover - c.db;
    out.push(CK('العمق فوق الحديد السفلي', f0(d) + ' مم', '≥ 150 مم', okf(d >= 150), '13.3.1.2', 'أقل عمق للأساس فوق الحديد السفلي.'));
    const avail = (c.B * 1000 - Math.max(c.cx, c.cy)) / 2 - c.cover, ld = R.ld({ db: c.db, fc: c.fc, fy: c.fy, cover: c.cover }).ld;
    out.push(CK('نشر الحديد من وجه العمود', 'ld = ' + f0(ld) + ' مم', 'المتاح ' + f0(avail) + ' مم', ld <= avail ? 'ok' : 'warn', '13.2.8.3 + 25.4.2', ld <= avail ? 'السيخ المستقيم يكفي.' : 'اثنِ أطراف الأسياخ بعكفة 90° للأعلى.'));
    out.push(CK('القص (ثقب + اتجاه واحد)', c.ok ? 'مقبول' : 'راجع', 'φVc ≥ Vu', c.ok ? 'ok' : 'fail', 'جدول 22.6.5.2 + 22.5.5.1', 'من تصميم الأساس بالكود (engine.py) على حمل العمود المقدّر.'));
    out.push(CK('الغطاء السفلي', c.cover + ' مم', '≥ 75 (مصبوب على التربة)', 'ok', '20.5.1.3.1', 'مع طبقة نظافة تحت الأساس.'));
    return out;
  }
  A.checks = c => c.kind === 'beam' ? beamChecks(c) : c.kind === 'column' ? colChecks(c) : c.kind === 'slab' ? slabChecks(c) : footChecks(c);

  /* ============================ البحث عن العناصر ============================ */
  function floorOrder(k) { const i = FORDER.indexOf(k); return i < 0 ? 99 : i; }
  function beamSched(RES, mark) { const S = (RES && RES.schedules && RES.schedules.beams) || {}; return mark ? S[mark] : null; }
  function modeSize(list) {
    const cnt = {}; list.forEach(c => { const k = c.b + '×' + c.h; cnt[k] = (cnt[k] || 0) + 1; });
    const k = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    return k ? k.split('×').map(Number) : null;
  }

  /* ============================ التدقيق الشامل ============================ */
  A.audit = function (RES, B, opts) {
    const M = A.mat(RES), S = (RES && RES.schedules) || {}, items = [];
    const fl = (B && B.floors) || [];
    // الجسور: كل علامة بالجدول، وإلا من عناصر المبنى الحاملة لحديد
    const bmap = {};
    Object.values(S.beams || {}).forEach(bm => { if (bm && bm.mark && bm.b && bm.h) bmap[bm.mark] = bm; });
    fl.forEach(f => (f.beams || []).forEach(e => { if (e.mark && e.rebar && !bmap[e.mark]) bmap[e.mark] = Object.assign({ mark: e.mark, b: e.b, h: e.h }, e.rebar); }));
    const Bmarks = new Set(); fl.forEach(f => (f.beams || []).forEach(e => { if (e.mark) Bmarks.add(e.mark); }));
    let skipped = 0;
    Object.keys(bmap).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach(mark => {
      const bm = bmap[mark], inst = [];
      if (Bmarks.size && !Bmarks.has(mark)) { skipped++; return; }
      fl.forEach(f => (f.beams || []).forEach(e => { if (e.mark === mark) inst.push({ f, e }); }));
      const gov = inst.slice().sort((a, b) => (b.e.span || 0) - (a.e.span || 0))[0];
      const geo = gov ? beamGeo(B, gov.f.key, gov.e, opts) : null;
      const c = beamCtx(bm, M, geo), checks = beamChecks(c);
      items.push({ kind: 'beam', key: 'beam|' + mark, mark, c, checks, n: inst.length, gov, title: 'جسر ' + mark,
        size: bm.b + '×' + bm.h, desc: 'سفلي ' + bl(c.bc) + (c.bx ? ' + ' + bl(c.bx) : '') + ' · علوي ' + bl(c.tc) + (c.tsu ? ' + ' + bl(c.tsu) : '') + ' · كانات ' + tl((bm.stir || {}).end) + ((bm.stir || {}).mid ? ' / ' + tl(bm.stir.mid) : '') });
    });
    // الأعمدة: علامة × طابق من الجدول، ثم أعمدة المبنى الحاملة لحديد بلا جدول
    const seen = {};
    const fkeys = new Set(fl.map(f => f.key)), Cmarks = new Set();
    fl.forEach(f => (f.columns || []).forEach(q => { if (q.mark) Cmarks.add(q.mark); }));
    const addCol = (mark, fk, cd, src) => {
      const k = mark + '|' + fk; if (seen[k] || !cd || !cd.main) return; seen[k] = 1;
      let tiesFrom = null;
      if (!cd.ties) {                                   // خلية الأتاري فارغة: أقرب طابق تحته (ثم فوقه) لنفس العلامة
        const per = (S.columns || {})[mark] || {}, ks = Object.keys(per).filter(x => per[x] && per[x].ties).sort((a, b) => Math.abs(floorOrder(a) - floorOrder(fk)) - Math.abs(floorOrder(b) - floorOrder(fk)) || floorOrder(a) - floorOrder(b));
        if (ks.length) { tiesFrom = ks[0]; cd = Object.assign({}, cd, { ties: per[ks[0]].ties }); }
      }
      const onF = []; fl.forEach(f => (f.columns || []).forEach(q => { if (q.mark === mark) onF.push({ f, q }); }));
      const here = onF.filter(o => o.f.key === fk), use = here.length ? here : onF;
      const sz = modeSize(use.map(o => o.q)), circ = use.some(o => o.q.shape === 'circ');
      const first = here[0] || null, geo = first ? colGeo(B, fk, first.q.x, first.q.y, opts) : null;
      const b = sz ? sz[0] : null, h = sz ? sz[1] : null;
      if (!b) { items.push({ kind: 'column', key: 'col|' + k, mark, floor: fk, c: null, n: 0, title: 'عمود ' + mark + ' · ' + fname(fk), size: '؟', desc: bl(cd.main) + ' · ' + tl(cd.ties),
        checks: [CK('مقاس العمود', 'غير معروف', 'من مفتاح الأعمدة', 'warn', '—', 'العلامة موجودة بالجدول لكن ما لقيتها مرسومة بمسقط هذا المبنى — ما أقدر أفحص الخلوص والنسبة بلا مقاس.')] }); return; }
      const c = colCtx(cd, b, h, M, geo, { mark, floor: fk, circ, src, tiesFrom });
      items.push({ kind: 'column', key: 'col|' + k, mark, floor: fk, c, checks: colChecks(c), n: here.length, first, title: 'عمود ' + mark + ' · ' + fname(fk),
        size: circ ? 'Ø' + b : b + '×' + h, desc: bl(cd.main) + ' · ' + tl(cd.ties) });
    };
    Object.keys(S.columns || {}).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach(mark => {
      const per = S.columns[mark] || {};
      const ks = Object.keys(per).filter(fk => per[fk]), anyF = ks.some(fk => fkeys.has(fk));
      if (Cmarks.size && !Cmarks.has(mark)) return;       // علامة تخص مبنى آخر بنفس الجدول
      ks.filter(fk => fkeys.has(fk) || !anyF).sort((a, b) => floorOrder(a) - floorOrder(b)).forEach(fk => addCol(mark, fk, per[fk], 'table'));
    });
    fl.forEach(f => (f.columns || []).forEach(q => { if (q.mark && q.rebar && q.rebar.main) addCol(q.mark, f.key, q.rebar, 'plan'); }));
    // البلاطات: طابق طابق
    const bp = bigPanel(B);
    fl.forEach(f => { if (!f.slab) return; const c = slabCtx(f, M, bp);
      items.push({ kind: 'slab', key: 'slab|' + f.key, c, checks: slabChecks(c), n: (f.slab.rects || []).length, title: 'بلاطة سقف ' + f.name, size: c.t + ' مم',
        desc: (c.sys ? c.sys + ' · ' : '') + 'سفلي ' + (c.mesh.bot ? 'Ø' + c.mesh.bot.d + '@' + c.mesh.bot.s : '—') + ' · علوي ' + (c.mesh.top ? 'Ø' + c.mesh.top.d + '@' + c.mesh.top.s : '—'), fkey: f.key }); });
    // الأساسات المصمَّمة: مجموعات بنفس المقاس والحديد
    const grp = {};
    ((B && B.footings) || []).forEach(ft => { const k = [ft.h, ft.db, ft.s].join('|'); (grp[k] = grp[k] || []).push(ft); });
    Object.values(grp).sort((a, b) => b[0].h - a[0].h).forEach((L, i) => {
      L.sort((a, b) => a.B - b.B);
      const ft = L[0], big = L[L.length - 1], col = fl[0] ? (fl[0].columns || []).find(q => Math.abs(q.x - ft.x) < 0.35 && Math.abs(q.y - ft.y) < 0.35) : null;
      const c = footCtx(Object.assign({}, ft, { ok: L.every(q => q.ok !== false) }), M, col);   // أصغرها يحكم النشر، وأي فشل قص يُحسب
      items.push({ kind: 'footing', key: 'foot|' + i, c, checks: footChecks(c), n: L.length, title: 'أساسات F' + (i + 1) + (ft.designed !== false ? ' (مصمَّمة بالكود)' : ''),
        size: (L.length > 1 ? f2(ft.B) + '–' + f2(big.B) : f2(ft.B)) + ' م × ' + f0(ft.h), desc: 'Ø' + ft.db + '@' + f0(ft.s) + ' بالاتجاهين · ' + L.length + ' أساس', list: L });
    });
    const all = [].concat(...items.map(it => it.checks));
    const sum = { ok: all.filter(k => k.state === 'ok').length, warn: all.filter(k => k.state === 'warn').length, fail: all.filter(k => k.state === 'fail').length, info: all.filter(k => k.state === 'info').length };
    return { items, sum, M, skipped };
  };

  /* ============================ جداول القطع (BBS) ============================ */
  function bbs(c) {
    const R = RB(), rows = [];
    const add = (mark, desc, db, n, L, shape) => { if (n > 0 && db && L > 0) rows.push({ mark, desc, db, n: Math.round(n), L, shape, kg: R.mass(db, L, Math.round(n)) }); };
    if (c.kind === 'beam') {
      const g = c.geo || {}, ln = (g.ln || 5) * 1000, cwA = g.cwA || 400, cwB = g.cwB || 400, eL = g.endL !== false, eR = g.endR !== false;
      const hkB = R.hook(c.dbB, 90, 'bar'), hkT = R.hook(c.dbT, 90, 'bar');
      const lapB = R.lapTension({ db: c.dbB, fc: c.fc, fy: c.fy, cover: c.cover }).lap, lapT = R.lapTension({ db: c.dbT, fc: c.fc, fy: c.fy, cover: c.cover, top: true }).lap;
      const run = (lap, eA, eB) => ln + (eA ? cwA - c.cover : cwA / 2 + lap / 2) + (eB ? cwB - c.cover : cwB / 2 + lap / 2);
      if (g.kind === 'cant') {
        add('T1', 'علوي — كابولي (يُثبَّت داخل البحر المجاور ld)', c.dbT, nb(c.tc) + nb(c.tsu), ln + R.ld({ db: c.dbT, fc: c.fc, fy: c.fy, cover: c.cover, top: true }).ld, 'مستقيم بعكفة 90° بالطرف الحر');
        add('B1', 'سفلي — كابولي', c.dbB, nb(c.bc) + nb(c.bx), ln + 150, 'مستقيم');
      } else {
        add('B1', 'سفلي مستمر', c.dbB, nb(c.bc), R.barCut(run(lapB, eL, eR), [eL ? hkB : null, eR ? hkB : null]), eL || eR ? 'مستقيم بعكفة 90°' : 'مستقيم');
        if (c.bx) add('B2', 'سفلي إضافي بالمنتصف (يُقطع ≈ 0.15ln من الوجه)', c.bx.d, nb(c.bx), 0.7 * ln + 2 * Math.max(c.d, 12 * c.bx.d), 'مستقيم');
        add('T1', 'علوي مستمر (وصلته بالمنتصف)', c.dbT, nb(c.tc), R.barCut(run(lapT, eL, eR), [eL ? hkT : null, eR ? hkT : null]), eL || eR ? 'مستقيم بعكفة 90°' : 'مستقيم');
        if (c.tsu) { const lt = 0.3 * ln;
          add('T2', 'علوي إضافي فوق المسند الأيسر', c.tsu.d, nb(c.tsu), R.barCut(lt + (eL ? cwA - c.cover : cwA / 2 + lt), [eL ? R.hook(c.tsu.d, 90, 'bar') : null]), eL ? 'عكفة 90°' : 'يعبر المسند');
          add('T3', 'علوي إضافي فوق المسند الأيمن', c.tsu.d, nb(c.tsu), R.barCut(lt + (eR ? cwB - c.cover : cwB / 2 + lt), [eR ? R.hook(c.tsu.d, 90, 'bar') : null]), eR ? 'عكفة 90°' : 'يعبر المسند'); }
      }
      if (c.sEnd || c.sMid) {
        const se = c.sEnd || c.sMid, sm = c.sMid || se, z = Math.min(2 * c.h, ln / 2), nE = 2 * (Math.floor((z - 50) / se) + 1), nM = Math.max(0, Math.floor((ln - 2 * z) / sm));
        const st = R.stirrupCut(c.b, c.h, c.cover, c.dt, 135);
        add('S1', `كانة مغلقة (${nE} بالطرفين @${se} + ${nM} بالوسط @${sm})`, c.dt, nE + nM, st.L, st.shape);
      }
      if (c.side && c.side.n) add('K1', 'جانبي (Skin) لكل الوجهين', c.side.d, c.side.n, ln + cwA / 2 + cwB / 2, 'مستقيم');
    } else if (c.kind === 'column') {
      const H = ((c.geo && c.geo.H) || 3.5) * 1000, ts = (c.geo && c.geo.ts) || 200, lap = R.lapComp({ db: c.db, fc: c.fc, fy: c.fy }).lap;
      add('C1', 'طولي (طابق + وصلة فوق البلاطة)', c.db, c.n, H + lap, 'مستقيم بثني مائل 1:6 بالأعلى');
      if (c.s) {
        const cnt = Math.floor((H - ts) / c.s) + 1, st = c.circ ? { L: Math.PI * (c.b - 2 * c.cover - c.dt) + 2 * R.hook(c.dt, 135, 'tie').added, shape: 'طوق دائري بعكفتين 135°' } : R.stirrupCut(c.b, c.h, c.cover, c.dt, 135);
        add('L1', 'طوق خارجي', c.dt, cnt, st.L, st.shape);
        if (c.sets > 1) add('L2', 'أتاري داخلية (تقدير 0.6 من الطوق)', c.dt, cnt * (c.sets - 1), 0.6 * st.L, 'طوق/رابط داخلي بعكفتين');
      }
    } else if (c.kind === 'footing') {
      const Bm = c.B * 1000, n = Math.floor((Bm - 2 * c.cover) / c.s) + 1;
      add('F1', 'سفلي — الاتجاه X', c.db, n, Bm - 2 * c.cover, 'مستقيم');
      add('F2', 'سفلي — الاتجاه Y', c.db, n, Bm - 2 * c.cover, 'مستقيم');
    } else if (c.kind === 'slab' && c.panel) {
      const a = c.panel.a * 1000, b = c.panel.b * 1000;
      [['بلا', c.mesh.bot, 'سفلي'], ['علا', c.mesh.top, 'علوي']].forEach(([k, m, nm], i) => { if (!m || !m.d || !m.s) return;
        add((i ? 'T' : 'S') + 'x', nm + ' — الاتجاه القصير (لوح ' + f2(c.panel.a) + '×' + f2(c.panel.b) + ')', m.d, Math.floor(b / m.s) + 1, a + 2 * 150, 'مستقيم');
        add((i ? 'T' : 'S') + 'y', nm + ' — الاتجاه الطويل', m.d, Math.floor(a / m.s) + 1, b + 2 * 150, 'مستقيم'); });
    }
    return rows;
  }

  /* ============================ الكميات ============================ */
  A.qty = function (RES, B, opts) {
    const R = RB(), M = A.mat(RES), byD = {}, rows = [];
    const addD = (d, kg) => { if (d && kg > 0) byD[d] = (byD[d] || 0) + kg; };
    const sumRows = L => L.reduce((a, r) => { addD(r.db, r.kg); return a + r.kg; }, 0);
    let tot = { col: [0, 0], beam: [0, 0], slab: [0, 0], foot: [0, 0], area: 0 }, miss = { beam: 0, col: 0 };
    ((B && B.floors) || []).forEach(f => {
      const r = { name: f.name, key: f.key, col: [0, 0], beam: [0, 0], slab: [0, 0], area: 0, nC: (f.columns || []).length, nB: (f.beams || []).length };
      const t = (f.slab && f.slab.t) || 200;
      (f.columns || []).forEach(q => {
        const Ag = q.shape === 'circ' ? Math.PI * q.b * q.b / 4 : q.b * q.h;
        r.col[0] += Ag / 1e6 * Math.max(0.5, f.h - t / 1000);
        if (q.rebar && q.rebar.main) r.col[1] += sumRows(bbs(colCtx(q.rebar, q.b, q.h, M, { H: f.h, ts: t }, { circ: q.shape === 'circ' }))); else miss.col++;
      });
      (f.beams || []).forEach(e => {
        const L = e.span || Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
        r.beam[0] += e.b / 1000 * Math.max(0, e.h - t) / 1000 * L;
        const bm = e.rebar ? Object.assign({ mark: e.mark, b: e.b, h: e.h }, e.rebar) : null;
        if (bm) r.beam[1] += sumRows(bbs(beamCtx(bm, M, beamGeo(B, f.key, e, opts)))); else miss.beam++;
      });
      const s = f.slab || {}, area = (s.rects || []).reduce((a, q) => a + Math.abs((q[2] - q[0]) * (q[3] - q[1])), 0);
      const rb = s.ribs, teq = rb ? (rb.topping + (t - rb.topping) * rb.width / (rb.spacing * 1000) * (rb.two_way ? 2 : 1)) / 1000 : t / 1000;
      r.area = area; r.slab[0] = area * teq;
      [s.mesh && s.mesh.bot, s.mesh && s.mesh.top].forEach(m => { if (m && m.d && m.s) { const kg = 2 * area * (1000 / m.s) * 0.00617 * m.d * m.d; r.slab[1] += kg; addD(m.d, kg); } });
      ['col', 'beam', 'slab'].forEach(k => { tot[k][0] += r[k][0]; tot[k][1] += r[k][1]; });
      tot.area += area; rows.push(r);
    });
    ((B && B.footings) || []).forEach(ft => {
      tot.foot[0] += ft.B * ft.B * ft.h / 1000;
      tot.foot[1] += sumRows(bbs(footCtx(ft, M, null)));
    });
    ((B && B.strips) || []).forEach(st => { tot.foot[0] += (st.w || 600) / 1000 * (st.h || 350) / 1000 * Math.hypot(st.x2 - st.x1, st.y2 - st.y1); });
    const conc = tot.col[0] + tot.beam[0] + tot.slab[0] + tot.foot[0], steel = tot.col[1] + tot.beam[1] + tot.slab[1] + tot.foot[1];
    return { rows, tot, conc, steel, byD, miss, M };
  };

  /* ============================ واجهة: فحص الحديد ============================ */
  const ICON = { ok: '✅', warn: '⚠️', fail: '❌', info: 'ℹ️' };
  const KNAME = { beam: '🟩 الجسور (من جدول الجسور)', column: '🟥 الأعمدة (جدول الأعمدة × الطوابق)', slab: '⬜ البلاطات (شبكات التسليح)', footing: '🟫 الأساسات (مصمَّمة بالكود)' };
  function chkTable(checks) {
    return `<div style="overflow-x:auto"><table class="dos-t dos-chk"><thead><tr><th></th><th>البند</th><th>المنفّذ</th><th>المطلوب</th><th>ACI 318-19</th></tr></thead><tbody>${
      checks.map(k => `<tr class="st-${k.state}"><td>${ICON[k.state]}</td><td><b>${esc(k.name)}</b>${k.why ? `<div class="dos-why">${esc(k.why)}</div>` : ''}</td>
        <td><span dir="ltr" class="dos-m">${esc(k.val)}</span></td><td><span dir="ltr" class="dos-m">${esc(k.lim)}</span></td><td class="ltr">§${esc(k.clause)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const badge = L => { const f = L.filter(k => k.state === 'fail').length, w = L.filter(k => k.state === 'warn').length;
    return f ? `<span class="tag t-bad">❌ ${f}</span>${w ? ` <span class="tag t-warn">⚠️ ${w}</span>` : ''}` : w ? `<span class="tag t-warn">⚠️ ${w}</span>` : '<span class="tag t-ok">✓ مطابق</span>'; };
  A.auditHtml = function (RES, B, opts) {
    if (!window.REBAR) return '<div class="note">وحدة قواعد الحديد غير محمَّلة.</div>';
    if (!B) return '<div class="note">لا مبنى.</div>';
    const au = A.audit(RES, B, opts), M = au.M, s = au.sum, tot = s.ok + s.warn + s.fail;
    const score = tot ? Math.round(100 * (s.ok + 0.5 * s.warn) / tot) : 0;
    const worst = [].concat(...au.items.map(it => it.checks.filter(k => k.state === 'fail').map(k => ({ it, k })))).slice(0, 8);
    const groups = ['beam', 'column', 'slab', 'footing'].map(kd => [kd, au.items.filter(it => it.kind === kd)]).filter(g => g[1].length);
    return `<div class="card"><h3>✅ فحص الحديد — كل تفصيلة باللوحات مقابل ACI 318-19</h3>
      <div class="kg">
        <div class="kpi ${score >= 85 ? 'ok' : score >= 60 ? 'warn' : 'bad'}"><div class="v">${score}%</div><div class="l">درجة المطابقة</div></div>
        <div class="kpi ok"><div class="v">${s.ok}</div><div class="l">✅ مطابق</div></div>
        <div class="kpi ${s.warn ? 'warn' : ''}"><div class="v">${s.warn}</div><div class="l">⚠️ توصية</div></div>
        <div class="kpi ${s.fail ? 'bad' : ''}"><div class="v">${s.fail}</div><div class="l">❌ مخالف</div></div>
        <div class="kpi"><div class="v">${au.items.length}</div><div class="l">عنصر/نوع مفحوص</div></div>
        <div class="kpi"><div class="v" dir="ltr" style="font-size:17px">f'c ${M.fc} · fy ${M.fy}</div><div class="l">f'c ${esc(M.fcSrc)} · fy ${esc(M.fySrc)}</div></div>
      </div>
      <div class="note" style="margin-top:8px">القواعد نفسها اللي يطبّقها المعالج (rebarkb.js): أقل وأقصى حديد، الخلوص والطبقات، التشقق، الكانات والأتاري وتباعدها،
        التطويق الزلزالي، الاستمرارية وسلامة المنشأ، الحديد الجانبي، الوصلات، وأقل سماكة للبلاطة. فحوص المقاومة «تقديرية» لأن الأحمال غير مكتوبة باللوحات
        (ميت = وزن البلاطة + ${SDL} kPa، حي ${(opts && opts.LL) || 3} kPa). اضغط 📘 بأي صف لتفتح دليل العنصر بالمختبر الحي.</div>
      ${worst.length ? `<div class="warn" style="margin-top:8px"><b>❌ أهم المخالفات:</b><ul>${worst.map(({ it, k }) => `<li><b>${esc(it.title)}</b> — ${esc(k.name)}: <span dir="ltr" class="dos-m">${esc(k.val)}</span> مقابل <span dir="ltr" class="dos-m">${esc(k.lim)}</span> (§${esc(k.clause)})</li>`).join('')}</ul></div>` : ''}
    </div>
    ${groups.map(([kd, L]) => `<div class="card" style="margin-top:10px"><h3>${KNAME[kd]} — ${L.length}</h3>
      ${L.map(it => `<details class="aud"><summary><span class="aud-t">${esc(it.title)}</span> <span class="ltr aud-s">${esc(it.size)}</span>
          <span class="aud-d">${esc(it.desc)}</span>${it.n ? ` <span class="tag">${it.n}${it.kind === 'slab' ? ' قطعة' : it.kind === 'footing' ? '' : ' بالمسقط'}</span>` : ''} ${badge(it.checks)}
          ${it.c ? `<button class="btn gh aud-open" data-aud="${esc(it.key)}">📘 الدليل</button>` : ''}</summary>
        ${chkTable(it.checks)}</details>`).join('')}</div>`).join('')}`;
  };

  /* ============================ واجهة: لوحة الملخص ============================ */
  function gauge(label, v, lo, hi, unit) {
    const st = !fin(v) || !v ? '' : v < lo * 0.7 || v > hi * 1.4 ? 'bad' : v < lo || v > hi ? 'warn' : 'ok';
    const pos = fin(v) ? Math.max(0, Math.min(100, (v - lo * 0.5) / (hi * 1.5 - lo * 0.5) * 100)) : 0;
    const a = (lo - lo * 0.5) / (hi * 1.5 - lo * 0.5) * 100, b = (hi - lo * 0.5) / (hi * 1.5 - lo * 0.5) * 100;
    return `<div class="dash-g ${st}"><div class="dash-gl">${esc(label)} <b dir="ltr">${fin(v) && v ? f0(v) + ' ' + unit : '—'}</b></div>
      <div class="dash-bar"><i class="dash-band" style="inset-inline-start:${a}%;width:${b - a}%"></i>${fin(v) && v ? `<i class="dash-pin" style="inset-inline-start:${pos}%"></i>` : ''}</div>
      <div class="dash-gr">المعتاد <span dir="ltr">${lo}–${hi} ${unit}</span></div></div>`;
  }
  A.dashHtml = function (RES, B, opts) {
    if (!window.REBAR) return '<div class="note">وحدة قواعد الحديد غير محمَّلة.</div>';
    if (!B) return '<div class="note">لا مبنى.</div>';
    const Q = A.qty(RES, B, opts), au = A.audit(RES, B, opts), t = Q.tot, s = au.sum;
    const ratio = k => t[k][0] > 0.01 ? t[k][1] / t[k][0] : 0, fa = Math.max(1, t.area);
    const mx = Math.max(1, ...Q.rows.map(r => r.col[0] + r.beam[0] + r.slab[0]));
    const mxS = Math.max(1, ...Q.rows.map(r => r.col[1] + r.beam[1] + r.slab[1]));
    const bars = Q.rows.map(r => { const c = r.col[0] + r.beam[0] + r.slab[0], st = r.col[1] + r.beam[1] + r.slab[1];
      return `<div class="dash-fr"><div class="dash-fn">${esc(r.name)}</div><div class="dash-fb">
        <div class="dash-stack" title="خرسانة ${f1(c)} م³">${[['col', '#ef4444'], ['beam', '#22c55e'], ['slab', '#60a5fa']].map(([k, col]) => `<i style="width:${r[k][0] / mx * 100}%;background:${col}"></i>`).join('')}</div>
        <div class="dash-stack st" title="حديد ${f0(st)} كغم">${[['col', '#fca5a5'], ['beam', '#86efac'], ['slab', '#93c5fd']].map(([k, col]) => `<i style="width:${r[k][1] / mxS * 100}%;background:${col}"></i>`).join('')}</div></div>
        <div class="dash-fv" dir="ltr">${f1(c)} m³ · ${f2(st / 1000)} t</div></div>`; }).join('');
    const D = Object.keys(Q.byD).map(Number).sort((a, b) => a - b), totD = D.reduce((a, d) => a + Q.byD[d], 0) || 1;
    const nEl = Q.rows.reduce((a, r) => a + r.nC + r.nB, 0), share = nEl ? (Q.miss.beam + Q.miss.col) / nEl : 0;
    const partial = share > 0.3 ? `<div class="warn" style="margin-top:8px">⚠️ ${Math.round(share * 100)}% من الأعمدة والجسور بلا حديد مقروء (الملف بلا جداول حديد لها) —
      أرقام الحديد ومؤشراته هنا <b>جزئية</b>، والخرسانة كاملة. أضف لوحة الجداول أو ملفها وتكتمل.</div>` : '';
    return `<div class="card"><h3>📊 لوحة الملخص — المبنى ${esc(B.name)} بنظرة وحدة</h3>
      <div class="kg">
        <div class="kpi ok"><div class="v">${B.floors.length}</div><div class="l">طوابق · ارتفاع ${f1(B.height)} م</div></div>
        <div class="kpi"><div class="v">${f0(t.area)} م²</div><div class="l">مساحة السقوف</div></div>
        <div class="kpi"><div class="v">${f0(Q.conc)} م³</div><div class="l">خرسانة (مع الأساسات)</div></div>
        <div class="kpi"><div class="v">${f2(Q.steel / 1000)} طن</div><div class="l">حديد تقديري</div></div>
        <div class="kpi"><div class="v">${f0(Q.steel / Math.max(1, Q.conc))}</div><div class="l">كغم حديد / م³</div></div>
        <div class="kpi"><div class="v">${f1(Q.steel / fa)}</div><div class="l">كغم حديد / م² سقف</div></div>
        <div class="kpi ${s.fail ? 'bad' : s.warn ? 'warn' : 'ok'}"><div class="v">${s.ok}/${s.ok + s.warn + s.fail}</div><div class="l">فحوص ACI مطابقة</div></div>
      </div>${partial}</div>
    <div class="dash-2">
      <div class="card"><h3>🏢 الطوابق — خرسانة (فوق) وحديد (تحت)</h3>${bars || '<div class="note">لا طوابق.</div>'}
        <div class="legend" style="margin-top:8px"><span><i style="background:#ef4444"></i>أعمدة</span><span><i style="background:#22c55e"></i>جسور</span><span><i style="background:#60a5fa"></i>بلاطات</span></div></div>
      <div class="card"><h3>🎯 مؤشرات المعقولية (حديد لكل م³ خرسانة)</h3>
        ${gauge('الأعمدة', ratio('col'), 150, 300, 'kg/m³')}${gauge('الجسور', ratio('beam'), 110, 220, 'kg/m³')}
        ${gauge('البلاطات', ratio('slab'), 50, 120, 'kg/m³')}${gauge('الأساسات', ratio('foot'), 25, 100, 'kg/m³')}
        ${gauge('المبنى — لكل م² سقف', Q.steel / fa, 30, 70, 'kg/m²')}
        <div class="note" style="margin-top:6px">نسب شائعة بالممارسة للمباني الخرسانية — الخروج عنها مو خطأ بالضرورة، لكنه علامة تستاهل مراجعة (حديد ناقص بالجدول، أو مقاطع مبالغ بيها).</div></div>
    </div>
    <div class="dash-2">
      <div class="card"><h3>🧮 الحديد حسب القطر (للتوريد)</h3><table><tr><th>القطر</th><th>الوزن</th><th>النسبة</th><th>≈ أسياخ 12 م</th></tr>
        ${D.map(d => `<tr><td class="ltr">Ø${d}</td><td>${f0(Q.byD[d])} كغم</td><td><div class="dash-pc"><i style="width:${Q.byD[d] / totD * 100}%"></i></div></td><td>${f0(Q.byD[d] / (0.00617 * d * d * 12))}</td></tr>`).join('')}
        <tr><td><b>المجموع</b></td><td><b>${f2(totD / 1000)} طن</b></td><td></td><td></td></tr></table></div>
      <div class="card"><h3>📦 الكميات حسب العنصر</h3><table><tr><th>العنصر</th><th>خرسانة م³</th><th>حديد كغم</th><th>كغم/م³</th></tr>
        ${[['الأعمدة', 'col'], ['الجسور (تحت البلاطة)', 'beam'], ['البلاطات', 'slab'], ['الأساسات', 'foot']].map(([n, k]) => `<tr><td>${n}</td><td>${f1(t[k][0])}</td><td>${f0(t[k][1])}</td><td>${f0(ratio(k))}</td></tr>`).join('')}
        <tr><td><b>المجموع</b></td><td><b>${f1(Q.conc)}</b></td><td><b>${f0(Q.steel)}</b></td><td><b>${f0(Q.steel / Math.max(1, Q.conc))}</b></td></tr></table>
        <div class="note" style="margin-top:6px">تقديري من المقاطع والجداول المقروءة: أطوال القطع بالعكفات والوصلات (MNL-66)، والشبكات بكامل مساحة السقف بالاتجاهين.
          ${Q.miss.beam || Q.miss.col ? `⚠️ ${Q.miss.beam} جسر و${Q.miss.col} عمود بلا حديد بالجدول — غير محسوبة بالحديد.` : ''}</div></div>
    </div>`;
  };

  /* ============================ السياق من الضغطة على المجسم ============================ */
  A.supports = u => !!u && ['beam', 'col', 'slab', 'foot'].includes(u.kind) && !!window.REBAR;
  A.ctxFromPick = function (u, B, RES, opts) {
    if (!u || !B) return null;
    const M = A.mat(RES), f = (B.floors || []).find(x => x.key === u.fkey);
    if (u.kind === 'beam') {
      const el = f ? (f.beams || []).find(e => Math.abs(e.x1 - u.x1) < 1e-3 && Math.abs(e.y1 - u.y1) < 1e-3 && Math.abs(e.x2 - u.x2) < 1e-3 && Math.abs(e.y2 - u.y2) < 1e-3) : null;
      const bm = Object.assign({ mark: u.mark, b: u.b, h: u.h }, u.rebar || beamSched(RES, u.mark) || {});
      bm.b = u.b; bm.h = u.h;
      const c = beamCtx(bm, M, el ? beamGeo(B, u.fkey, el, opts) : null);
      c.floor = u.floor; c.axis = u.axis; c.guess = u.guess; c.fkey = u.fkey; c.el = el;
      return c;
    }
    if (u.kind === 'col') {
      const c = colCtx(u.rebar, u.b, u.h, M, colGeo(B, u.fkey, u.x, u.y, opts), { mark: u.mark, floor: u.floor, fkeyF: u.fkey, circ: u.shape === 'circ', at: u.at });
      c.fkey = u.fkey; c.x = u.x; c.y = u.y;
      return c;
    }
    if (u.kind === 'slab' && f) {
      const r = u.rect, p = r ? panelAt(B, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2) : null;
      const c = slabCtx(f, M, p || bigPanel(B)); c.fkey = u.fkey; c.rect = r; return c;
    }
    if (u.kind === 'foot') {
      const ft = (B.footings || []).find(q => Math.abs(q.x - u.x) < 0.05 && Math.abs(q.y - u.y) < 0.05) || { B: u.B, h: u.h, db: u.db, s: u.s, PD: u.PD, PL: u.PL, Pu: u.Pu, ok: u.ok, col: u.mark, x: u.x, y: u.y };
      const f0_ = (B.floors || [])[0], col = f0_ ? (f0_.columns || []).find(q => Math.abs(q.x - ft.x) < 0.35 && Math.abs(q.y - ft.y) < 0.35) : null;
      const c = footCtx(ft, M, col); c.x = ft.x; c.y = ft.y; return c;
    }
    return null;
  };
  A.ctxFromKey = function (key, B, RES, opts) {
    const au = A.audit(RES, B, opts), it = au.items.find(x => x.key === key);
    if (!it || !it.c) return null;
    const c = it.c;
    if (it.kind === 'beam' && it.gov) { c.floor = it.gov.f.name; c.fkey = it.gov.f.key; c.el = it.gov.e; c.axis = it.gov.e.axis; c.mark = it.mark; c.nInst = it.n; }
    if (it.kind === 'column' && it.first) { c.fkey = it.floor; c.x = it.first.q.x; c.y = it.first.q.y; c.at = (it.first.q.ax || '?') + '×' + (it.first.q.ay || '?'); c.floor = fname(it.floor); }
    if (it.kind === 'slab') c.fkey = it.fkey;
    if (it.kind === 'footing') { c.x = it.c.ft.x; c.y = it.c.ft.y; c.list = it.list; }
    c.title = it.title;
    return c;
  };

  /* ============================ المختبر الحي — مزروع بأرقام العنصر ============================ */
  function gridStep(B, ax) { const s = (((B && B.grid) || {})[ax] || []).map(a => a.pos).sort((a, b) => a - b), d = [];
    for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 1) d.push(s[i] - s[i - 1]);
    d.sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : 5; }
  function labSeed(c, B, opts) {
    const R = RB(), r1 = x => Math.round(x * 10) / 10, LL = (opts && opts.LL) || 3, qa = (opts && opts.qa) || 150;
    if (c.kind === 'beam') {
      const g = c.geo, L = g ? g.L : 5, wu = g ? g.wu : 30, sup = !g ? 'ss' : g.kind === 'cant' ? 'cant' : g.kind === 'single' ? 'ss' : g.kind === 'end' ? 'fp' : 'ff';
      const spc = c.n1 > 1 ? (c.b - 2 * c.cover - 2 * c.dt - c.dbB) / (c.n1 - 1) : 100;
      return { labs: ['beam', 'section', 'rb_cut', 'rb_dev', 'rb_lap', 'rb_fit'],
        note: `مزروعة بأرقام الجسر ${c.mark || ''} من اللوحة: بحر ${f2(L)} م · مقطع ${c.b}×${c.h} · سفلي ${c.nBot}Ø${c.dbB} · علوي ${c.nTop}Ø${c.dbT} · حمل مصعّد تقديري ${f1(wu)} kN/م (شريحة ${g ? f2(g.trib) : '—'} م). الإسناد ${sup === 'ss' ? 'بسيط' : sup === 'fp' ? 'بحر طرفي' : sup === 'cant' ? 'كابولي' : 'بحر داخلي'}.`,
        vals: {
          beam: { sup, L: r1(Math.max(1, L)), w: Math.round(Math.max(1, wu)), P: 0, a: r1(L / 2), b: c.b, h: c.h, fc: c.fc },
          section: { b: c.b, h: c.h, cov: Math.round(c.h - c.d), n: Math.max(1, Math.min(10, c.nBot || 2)), db: c.dbB, np: 0, dbp: 12, fc: c.fc, fy: c.fy, st: 1 },
          rb_cut: { sup: sup === 'ss' ? 'ss' : 'ff', L: r1(Math.max(2, L)), w: Math.min(120, Math.round(Math.max(5, wu))), n: Math.max(2, Math.min(8, c.nBot || 2)), cut: 0, db: c.dbB, h: c.h, fc: c.fc },
          rb_dev: { db: c.dbT, fy: c.fy, fc: c.fc, cov: c.cover, sp: Math.round(Math.max(40, spc)), top: 'y', coat: 'none', tr: (c.sEnd || 200) <= 100 ? 't10b' : (c.sEnd || 200) <= 150 ? 't10a' : 'none', emb: Math.round(Math.min(2000, 0.3 * (g ? g.ln : 5) * 1000)) },
          rb_lap: { mode: 't', db: c.dbB, fc: c.fc, lap: Math.round(Math.min(2000, R.lapTension({ db: c.dbB, fc: c.fc, fy: c.fy, cover: c.cover }).lap)), ratioAs: 1, pct: 100, top: 'n', pos: 0.08 },
          rb_fit: { b: c.b, n: Math.max(2, Math.min(10, c.n1 || 2)), db: c.dbB, agg: 20, cov: c.cover, dt: c.dt }
        } };
    }
    if (c.kind === 'column') {
      const g = c.geo || {}, Po = (0.85 * c.fc * (c.b * (c.circ ? c.b : c.h) - c.Ast) + c.fy * c.Ast) / 1000, Pu = g.Pu || 0.3 * Po;
      return { labs: ['column', 'rb_conf', 'rb_lap', 'rb_dev'],
        note: `مزروعة بأرقام العمود ${c.mark || ''}: ${c.b}×${c.circ ? c.b : c.h} مم · ${c.n}Ø${c.db} · أتاري Ø${c.dt}@${c.s || '—'} · طول حر ${f2(g.ln || 3)} م · Pu ${g.Pu ? '≈ ' + f0(g.Pu) + ' kN (من حمل الأساس)' : 'افتراضي 30% من P0'}.`,
        vals: {
          column: { bc: 'pp', L: r1(Math.max(2, g.ln || 3)), b: Math.min(c.b, c.circ ? c.b : c.h), h: Math.max(c.b, c.circ ? c.b : c.h), fc: c.fc, rho: r1(Math.max(1, Math.min(4, c.Ast / (c.b * (c.circ ? c.b : c.h)) * 100))), P: Math.round(Math.min(8000, Pu)), frame: 'ns', m12: -1 },
          rb_conf: { b: Math.max(300, Math.round(Math.min(c.b, c.circ ? c.b : c.h) / 25) * 25), nb: Math.max(2, Math.min(6, faces(c.n, c.b, c.circ ? c.b : c.h, c.db, c.cover + c.dt).nx)), db: c.db, dt: c.dt, s: Math.max(50, c.s || 150), cross: c.sets > 1 ? 'y' : 'n', fc: c.fc, cov: c.cover, P: Math.round(Math.min(100, Pu / Po * 100)) },
          rb_lap: { mode: 'c', db: c.db, fc: c.fc, lap: Math.round(R.lapComp({ db: c.db, fc: c.fc, fy: c.fy }).lap) },
          rb_dev: { db: c.db, fy: c.fy, fc: c.fc, cov: 75, sp: 150, top: 'n', coat: 'none', tr: 'none', emb: 600 }
        } };
    }
    const Lx = r1(gridStep(B, 'x')), Ly = r1(gridStep(B, 'y')), nfl = ((B && B.floors) || []).length || 1;
    if (c.kind === 'footing') {
      const avail = (c.B * 1000 - Math.max(c.cx, c.cy)) / 2 - c.cover;
      return { labs: ['path', 'rb_dev'], note: `مسار حمل الأساس ${c.mark || ''} (${f2(c.B)}×${f2(c.B)} م) من السقوف حتى التربة، ونشر حديده Ø${c.db} من وجه العمود.`,
        vals: { path: { Lx, Ly, q: r1(24 * 0.2 + SDL + LL), N: nfl, qa, pick: 'c' },
          rb_dev: { db: c.db, fy: c.fy, fc: c.fc, cov: 75, sp: Math.round(c.s), top: 'n', coat: 'none', tr: 'none', emb: Math.round(Math.max(100, Math.min(2000, avail))) } } };
    }
    const p = c.panel || { a: Math.min(Lx, Ly), b: Math.max(Lx, Ly) }, q = r1(24 * c.t / 1000 + SDL + LL);
    return { labs: ['plate', 'path'], note: `لوح ${f2(p.a)}×${f2(p.b)} م بسماكة ${c.t} مم وحمل خدمة ${q} kPa (وزن ذاتي + ${SDL} + حي ${LL}).`,
      vals: { plate: { a: r1(p.a), b: r1(p.b), h: Math.max(100, Math.min(300, c.ribs ? c.t * 0.7 : c.t)), q, fc: c.fc, show: 'w' },
        path: { Lx, Ly, q, N: nfl, qa, pick: 'c' } } };
  }

  /* ============================ «كيف حُسب؟» — خطوات محلية + اشتقاق الخادم ============================ */
  const SR = (n, what, eq, val, cl) => `<tr><td>${n}</td><td><b>${esc(what)}</b></td><td><span dir="auto" class="dos-m">${esc(eq)}</span></td><td><b dir="auto" class="dos-m">${esc(val)}</b></td><td class="ltr">${esc(cl)}</td></tr>`;
  function stepsHtml(c) {
    const T = rows => `<div style="overflow-x:auto"><table class="dos-t dos-steps"><thead><tr><th>#</th><th>الخطوة</th><th>المعادلة</th><th>النتيجة</th><th>ACI</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    if (c.kind === 'beam') {
      const g = c.geo; if (!g) return '<div class="note">ما لقيت موقع الجسر بالمسقط — الفحوص التفصيلية فقط.</div>';
      const fb = flex(c.AsB, c.b, c.d, c.fc, c.fy), ft = flex(c.AsT, c.b, c.dT, c.fc, c.fy), v = shear(c.b, c.d, c.fc, 2 * AR(c.dt), c.sEnd || c.sMid);
      const K = { single: 'بحر منفرد', end: 'بحر طرفي', interior: 'بحر داخلي', cant: 'كابولي' }[g.kind];
      return `<div class="dos-labnote">🧮 تحقق عكسي: المقاطع والحديد <b>من اللوحة</b>، والأحمال <b>تقديرية</b> لأن اللوحات ما تكتبها — الغرض تشوف كيف يشتغل الجسر وشكد احتياطه، مو إعادة تصميمه.</div>` + T([
        SR(1, 'الحمل الميت على المتر المربع', 'D = 24·t + تشطيبات + قواطع', f2(g.D) + ' kPa', '§5.3'),
        SR(2, 'العرض الرافد (نصف المسافة للجسرين الجارين)', `(${f2(g.up || 0)} + ${f2(g.dn || 0)}) / 2`, f2(g.trib) + ' m', '—'),
        SR(3, 'الوزن الذاتي تحت البلاطة', `24 × ${c.b / 1000} × ${f2((c.h - g.t) / 1000)}`, f2(g.sw) + ' kN/m', '—'),
        SR(4, 'الحمل المصعّد', `max(1.4·${f1(g.wD)} ، 1.2·${f1(g.wD)} + 1.6·${f1(g.wL)})`, f1(g.wu) + ' kN/m', '§5.3.1'),
        SR(5, 'البحر الصافي (من وجه لوجه)', `${f2(g.L)} − (${g.cwA} + ${g.cwB})/2000`, K + ' · ' + f2(g.ln) + ' م', '§6.5.4'),
        SR(6, 'العزم الموجب', g.kind === 'cant' ? '—' : `(1/${Math.round(1 / g.Cp)})·wu·ln²`, f1(g.Mp) + ' kN·m', 'جدول 6.5.2'),
        SR(7, 'العزم السالب عند المسند', g.kind === 'cant' ? 'wu·L²/2' : `(1/${Math.round(1 / g.Cn)})·wu·ln²`, f1(g.Mn) + ' kN·m', 'جدول 6.5.2'),
        SR(8, 'القص عند الوجه', g.kind === 'end' ? '1.15·wu·ln/2' : g.kind === 'cant' ? 'wu·L' : 'wu·ln/2', f1(g.Vu) + ' kN', 'جدول 6.5.4'),
        SR(9, 'العمق الفعّال', `d = ${c.h} − ${c.cover} − ${c.dt} − ${c.dbB}/2${c.n2 ? ' − طبقة ثانية' : ''}`, f0(c.d) + ' mm', '—'),
        SR(10, 'عمق كتلة الضغط (سفلي)', `a = As·fy/(0.85·f'c·b) = ${f0(c.AsB)}×${c.fy}/(0.85×${c.fc}×${c.b})`, f1(fb.a) + ' mm', '§22.2.2'),
        SR(11, 'انفعال الحديد ومعامل الأمان', `εt = 0.003(d − c)/c = ${fb.et.toFixed(4)}`, 'φ = ' + fb.phi.toFixed(2), 'جدول 21.2.2'),
        SR(12, 'المقاومة الموجبة', 'φMn = φ·As·fy·(d − a/2)', f1(fb.phiMn) + ' kN·m ' + (fb.phiMn >= g.Mp ? '≥' : '<') + ' ' + f1(g.Mp), '§22.2'),
        SR(13, 'المقاومة السالبة (علوي)', `As = ${f0(c.AsT)} mm² · d = ${f0(c.dT)} mm`, f1(ft.phiMn) + ' kN·m ' + (ft.phiMn >= g.Mn ? '≥' : '<') + ' ' + f1(g.Mn), '§22.2'),
        SR(14, 'مقاومة القص', `0.75·(0.17√f'c·b·d + Av·fy·d/s) = 0.75·(${f1(v.Vc)} + ${f1(v.Vs)})`, f1(v.phiVn) + ' kN ' + (v.phiVn >= g.Vu ? '≥' : '<') + ' ' + f1(g.Vu), '§22.5.5.1 + 22.5.8.5.3')]);
    }
    if (c.kind === 'column') {
      const g = c.geo || {}, Ag = c.circ ? Math.PI * c.b * c.b / 4 : c.b * c.h, P0 = (0.85 * c.fc * (Ag - c.Ast) + c.fy * c.Ast) / 1000, phiPn = (c.circ ? 0.85 * 0.75 : 0.8 * 0.65) * P0;
      return `<div class="dos-labnote">🧮 المقطع والحديد من جدول الأعمدة، والحمل من أساسه المصمَّم (مساحة رافدة × الطوابق × (ميت + حي)) موزّعاً على الطوابق — بلا عزوم الإطار.</div>` + T([
        SR(1, 'حمل الأساس المصعّد', 'Pu,base = 1.2·PD + 1.6·PL', g.PuBase ? f0(g.PuBase) + ' kN' : '—', '§5.3.1'),
        SR(2, 'حصة هذا الطابق (الطوابق فوقه ÷ الكل)', `Pu = Pu,base × ${(g.nf || 1) - (g.fi || 0)} / ${g.nf || 1}`, g.Pu ? f0(g.Pu) + ' kN' : '—', '—'),
        SR(3, 'مساحة المقطع والحديد', `Ag = ${f0(Ag)} · Ast = ${c.n}×${f0(AR(c.db))}`, 'Ast = ' + f0(c.Ast) + ' mm² · ρ = ' + (c.Ast / Ag * 100).toFixed(2) + '%', '§10.6.1.1'),
        SR(4, 'المقاومة الاسمية', `P0 = 0.85·f'c·(Ag − Ast) + fy·Ast`, f0(P0) + ' kN', '§22.4.2.2'),
        SR(5, 'أقصى مقاومة تصميمية', c.circ ? 'φPn,max = 0.85 × 0.75 × P0' : 'φPn,max = 0.80 × 0.65 × P0', f0(phiPn) + ' kN', '§22.4.2.1 + 21.2.2'),
        SR(6, 'نسبة الاستغلال', 'Pu / φPn,max', g.Pu ? f2(g.Pu / phiPn) : '—', '—')]);
    }
    if (c.kind === 'footing') {
      const qs = (c.PD + c.PL) / (c.B * c.B), qu = c.Pu / (c.B * c.B);
      return T([SR(1, 'الحمل الخدمي', 'PD + PL', f0(c.PD + c.PL) + ' kN', '§13.3.1.1'), SR(2, 'المساحة', 'B × B', f2(c.B * c.B) + ' m²', '—'),
        SR(3, 'ضغط التربة الخدمي', '(PD + PL)/A', f1(qs) + ' kPa', '§13.3.1.1'), SR(4, 'الضغط المصعّد للتصميم', 'Pu / A', f1(qu) + ' kPa', '§13.2.6.1'),
        SR(5, 'الحديد', `Ø${c.db}@${f0(c.s)} = ${f0(AR(c.db) * 1000 / c.s)} mm²/m`, '≥ ' + f0(0.0018 * 1000 * c.h) + ' mm²/m', '§7.6.1.1')]);
    }
    const tt = c.ribs ? c.ribs.topping : c.t;
    return T([SR(1, 'الحمل الميت', '24·t + ' + SDL, f2(24 * c.t / 1000 + SDL) + ' kPa', '§5.3'), SR(2, 'أقل حديد', (c.fy <= 420 ? '0.0018' : '0.0018×420/fy') + ' × 1000 × ' + tt, f0(0.0018 * 1000 * tt) + ' mm²/m', '§24.4.3.2'),
      SR(3, 'أقصى تباعد', c.ribs ? 'min(5t ، 450)' : 'min(2h ، 450)', f0(c.ribs ? Math.min(5 * tt, 450) : Math.min(2 * c.t, 450)) + ' mm', c.ribs ? '§24.4.3.3' : '§8.7.2.2')]);
  }
  function calcPayloads(c) {
    if (c.kind === 'beam' && c.geo && c.nBot) return [{ what: 'beam_steel', b: c.b, bw: c.b, h: c.h, d: c.d, Mu: Math.max(1, c.geo.Mp || c.geo.Mn), fc: c.fc, fy: c.fy, db: c.dbB, n_bars: c.nBot, As_used: c.AsB, cover: c.cover }];
    if (c.kind === 'column' && c.n && !c.circ) {
      const g = c.geo || {}, Ag = c.b * c.h, P0 = (0.85 * c.fc * (Ag - c.Ast) + c.fy * c.Ast) / 1000;
      const L = [{ what: 'col_long', b: c.b, h: c.h, db: c.db, n_bars: c.n, Ast: c.Ast, fc: c.fc, fy: c.fy, cover: c.cover, db_tie: c.dt, Pu: g.Pu || null, phiPn: 0.8 * 0.65 * P0 }];
      if (c.s && g.H) { const sz = RB().seisCol({ sys: 'imf', b: c.b, h: c.h, ln: g.ln * 1000, dbL: c.db, dt: c.dt });
        L.push({ what: 'col_ties', H: g.H, b: c.b, h: c.h, db_long: c.db, db_tie: c.dt, s_mid: c.s, s_conf: Math.min(c.s, Math.floor(sz.so / 25) * 25), lo: sz.lo, ln: g.ln }); }
      return L;
    }
    return [];
  }

  /* ============================ المقطع ============================ */
  function secHtml(c) {
    const D = window.DOSSIER; if (!D || !D.secSVG) return '';
    if (c.kind === 'beam') {
      const yb = c.h - c.cover - c.dt - c.dbB / 2, yt = c.cover + c.dt + c.dbT / 2, rows = [];
      if (c.n1) rows.push({ n: c.n1, db: c.dbB, y: yb });
      if (c.n2) rows.push({ n: c.n2, db: c.dbB, y: yb - c.dbB - 25 });
      if (c.t1) rows.push({ n: c.t1, db: c.dbT, y: yt, col: '#fb7185' });
      if (c.t2) rows.push({ n: c.t2, db: c.dbT, y: yt + c.dbT + 25, col: '#fb7185' });
      const lab = [{ y: yt, t: bl(c.tc) + (c.tsu ? ' + ' + bl(c.tsu) : '') + ' علوي' }, { y: yb, t: bl(c.bc) + (c.bx ? ' + ' + bl(c.bx) : '') + ' سفلي' }, { y: c.h / 2, t: 'كانات Ø' + c.dt + '@' + (c.sEnd || '—') + '/' + (c.sMid || '—'), c: '#fbbf24' }];
      if (c.side && c.side.n) { rows.push({ n: 2, db: c.side.d, y: c.h / 2, col: '#a78bfa' }); lab[2].y = c.h * 0.42; lab.push({ y: c.h * 0.6, t: 'جانبي ' + bl(c.side), c: '#c4b5fd' }); }
      const fit = RB().fit(c.b, c.cover, c.dt, Math.max(1, c.n1), c.dbB, 20);
      return D.secSVG({ b: c.b, h: c.h, cover: c.cover, dt: c.dt, rows, slab: c.geo ? Math.min(c.geo.t, c.h * 0.4) : 0, labels: lab,
        clearTxt: 'خلوص ' + f1(fit.clear) + ' مم ≥ ' + f1(fit.need) + ' (25.2.1)', hookExt: Math.max(6 * c.dt, 75) });
    }
    if (c.kind === 'column') {
      if (!c.n) return '';
      const hh = c.circ ? c.b : c.h, off = c.cover + c.dt + c.db / 2, pts = [], F = faces(c.n, c.b, hh, c.db, c.cover + c.dt);
      if (c.circ) { for (let k = 0; k < c.n; k++) { const a = 2 * Math.PI * k / c.n; pts.push([c.b / 2 + (c.b / 2 - off) * Math.cos(a), hh / 2 + (hh / 2 - off) * Math.sin(a), c.db]); } }
      else {
        for (let k = 0; k < F.nx; k++) { const x = off + (c.b - 2 * off) * (F.nx === 1 ? 0.5 : k / (F.nx - 1)); pts.push([x, off, c.db]); pts.push([x, hh - off, c.db]); }
        for (let k = 1; k < F.ny - 1; k++) { const y = off + (hh - 2 * off) * k / (F.ny - 1); pts.push([off, y, c.db]); pts.push([c.b - off, y, c.db]); }
      }
      const cross = [], crossY = [];
      if (!c.circ && c.sets > 1) { for (let k = 2; k < F.nx - 1; k += 2) cross.push(off + (c.b - 2 * off) * k / (F.nx - 1)); for (let k = 2; k < F.ny - 1; k += 2) crossY.push(off + (hh - 2 * off) * k / (F.ny - 1)); }
      return D.secSVG({ b: c.b, h: hh, cover: c.cover, dt: c.dt, pts, cross, crossY, hookExt: Math.max(6 * c.dt, 75),
        labels: [{ y: hh * 0.42, t: c.n + 'Ø' + c.db }, { y: hh * 0.62, t: 'Ø' + c.dt + '@' + (c.s || '—'), c: '#fbbf24' }] });
    }
    if (c.kind === 'footing') {
      const Bm = c.B * 1000, n = Math.max(2, Math.floor((Bm - 2 * c.cover) / c.s) + 1), y = c.h - c.cover - c.db / 2;
      return D.secSVG({ b: Math.round(Bm), h: c.h, cover: c.cover, dt: 0.001, rows: [{ n: Math.min(n, 24), db: c.db, y }], labels: [{ y, t: `Ø${c.db} @ ${f0(c.s)} بالاتجاهين` }], clearTxt: 'مقطع الأساس — غطاء سفلي 75 مم' });
    }
    const m = c.mesh.bot || c.mesh.top || { d: 10, s: 200 }, rows = [{ n: Math.max(2, Math.round(1000 / m.s) + 1), db: m.d, y: c.t - c.cover - m.d / 2 }];
    if (c.mesh.top && c.mesh.top.d) rows.push({ n: Math.max(2, Math.round(1000 / c.mesh.top.s) + 1), db: c.mesh.top.d, y: c.cover + c.mesh.top.d / 2, col: '#22c55e' });
    return D.secSVG({ b: 1000, h: c.t, cover: c.cover, dt: 0.001, rows, labels: [{ y: c.t - 25, t: (c.mesh.bot ? 'Ø' + c.mesh.bot.d + '@' + c.mesh.bot.s + ' سفلي' : '') }], clearTxt: 'شريحة 1 م من البلاطة' });
  }

  /* ============================ موقعه بالمسقط (Key Plan) ============================ */
  function keyPlan(B, c) {
    const f = ((B && B.floors) || []).find(x => x.key === c.fkey) || (B && B.floors && B.floors[0]);
    if (!f) return '<div class="note">لا مسقط.</div>';
    const P = [];
    (f.columns || []).forEach(q => P.push([q.x, q.y])); (f.beams || []).forEach(q => P.push([q.x1, q.y1], [q.x2, q.y2]));
    ((f.slab && f.slab.rects) || []).forEach(r => P.push([r[0], r[1]], [r[2], r[3]]));
    if (c.kind === 'footing') (B.footings || []).forEach(q => P.push([q.x, q.y]));
    if (!P.length) return '<div class="note">لا عناصر بهذا الطابق.</div>';
    const x0 = Math.min(...P.map(p => p[0])) - 2.2, x1 = Math.max(...P.map(p => p[0])) + 1, y0 = Math.min(...P.map(p => p[1])) - 1, y1 = Math.max(...P.map(p => p[1])) + 2.2;
    const W = x1 - x0, H = y1 - y0, X = x => (x - x0).toFixed(2), Y = y => (y1 - y).toFixed(2), k = Math.max(W, H) / 100;
    let s = `<svg viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" class="kp-svg" xmlns="http://www.w3.org/2000/svg">`;
    ((f.slab && f.slab.rects) || []).forEach(r => { s += `<rect x="${X(r[0])}" y="${Y(r[3])}" width="${(r[2] - r[0]).toFixed(2)}" height="${(r[3] - r[1]).toFixed(2)}" fill="${c.kind === 'slab' && (!c.rect || c.rect === r || (c.rect[0] === r[0] && c.rect[1] === r[1])) ? 'rgba(96,165,250,.35)' : '#16213a'}"/>`; });
    ((f.slab && f.slab.openings) || []).forEach(o => { s += `<path d="M${X(o.x0)} ${Y(o.y0)}L${X(o.x1)} ${Y(o.y1)}M${X(o.x0)} ${Y(o.y1)}L${X(o.x1)} ${Y(o.y0)}" stroke="#e879f9" stroke-width="${(k * 0.25).toFixed(3)}" opacity=".6"/>`; });
    const g = B.grid || {};
    (g.x || []).forEach(a => { s += `<line x1="${X(a.pos)}" y1="0" x2="${X(a.pos)}" y2="${H.toFixed(2)}" stroke="#1e3a5f" stroke-width="${(k * 0.12).toFixed(3)}" stroke-dasharray="${(k * 1.2).toFixed(2)} ${(k * 0.6).toFixed(2)}"/><text x="${X(a.pos)}" y="${(k * 2.6).toFixed(2)}" font-size="${(k * 2.2).toFixed(2)}" fill="#38bdf8" text-anchor="middle">${esc(AXN(a.name))}</text>`; });
    (g.y || []).forEach(a => { s += `<line x1="0" y1="${Y(a.pos)}" x2="${W.toFixed(2)}" y2="${Y(a.pos)}" stroke="#1e3a5f" stroke-width="${(k * 0.12).toFixed(3)}" stroke-dasharray="${(k * 1.2).toFixed(2)} ${(k * 0.6).toFixed(2)}"/><text x="${(k * 1.2).toFixed(2)}" y="${(+Y(a.pos) + k * 0.8).toFixed(2)}" font-size="${(k * 2.2).toFixed(2)}" fill="#38bdf8" text-anchor="middle">${esc(AXN(a.name))}</text>`; });
    const hlB = e => c.kind === 'beam' && (e === c.el || (!c.el && e.mark && e.mark === c.mark) || (c.nInst && e.mark === c.mark));
    (f.beams || []).forEach(e => { const on = hlB(e);
      s += `<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" stroke="${on ? '#fbbf24' : e.mark ? '#3f7d5a' : '#6b5a3a'}" stroke-width="${Math.max(e.b / 1000, k * (on ? 0.9 : 0.45)).toFixed(3)}" stroke-linecap="round"/>`; });
    (f.columns || []).forEach(q => { const on = c.kind === 'column' && ((Math.abs(q.x - c.x) < 0.05 && Math.abs(q.y - c.y) < 0.05) || (q.mark && q.mark === c.mark));
      const bw = Math.max(q.b / 1000, k * 0.6), bh = Math.max((q.shape === 'circ' ? q.b : q.h) / 1000, k * 0.6);
      s += `<rect x="${(q.x - bw / 2 - x0).toFixed(2)}" y="${(y1 - q.y - bh / 2).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="${on ? '#fde047' : '#ef4444'}" ${on ? `stroke="#fff" stroke-width="${(k * 0.25).toFixed(3)}"` : ''}/>`; });
    if (c.kind === 'footing') (B.footings || []).forEach(q => { const on = (c.list || []).includes(q) || (Math.abs(q.x - c.x) < 0.05 && Math.abs(q.y - c.y) < 0.05);
      s += `<rect x="${(q.x - q.B / 2 - x0).toFixed(2)}" y="${(y1 - q.y - q.B / 2).toFixed(2)}" width="${q.B.toFixed(2)}" height="${q.B.toFixed(2)}" fill="none" stroke="${on ? '#fbbf24' : '#8b6b4a'}" stroke-width="${(k * (on ? 0.45 : 0.2)).toFixed(3)}"/>`; });
    return s + '</svg>';
  }

  /* ============================ الدليل (نافذة بطبقات) ============================ */
  const TABS = [['sum', '🧾 الملخص'], ['lab', '🔬 المختبر الحي'], ['calc', '🧮 كيف حُسب؟'], ['sec', '📐 المقطع'], ['chk', '✅ فحوص ACI'], ['bbs', '📊 جدول القطع'], ['plan', '📍 موقعه بالمسقط'], ['site', '🛠️ التنفيذ']];
  const SITE = {
    beam: ['الوصلة السفلية فوق المساند، والعلوية بمنتصف البحر — عكس أماكن أقصى عزم.', 'الإضافي السفلي (bb2) يتوسّط البحر، والعلوي الإضافي (tb2) فوق العمود بطول ≈ 0.3 من البحر من كل جهة.',
      'الكانات الطرفية (الأكثف) على 2h من وجه كل عمود، وأول كانة على 50 مم.', 'عكفات الكانات 135° وتتناوب جهتها من كانة لأخرى.', 'الحديد الجانبي (MID REINF) يُربط بالكانات وما يُحسب ضمن حديد الانحناء.'],
    column: ['الوصلة فوق وجه البلاطة مباشرة بثني مائل 1:6، وعند تغيّر الحديد بين طابقين يُوصل الأصغر بطول وصلته.', 'الأتاري تستمر داخل العقدة (التقاء الجسور) — أكثر مكان يُنسى بالموقع.',
      'قطع المجموعة (x/Set) تُركّب كلها بنفس المنسوب: الطوق الخارجي + الروابط الداخلية.', 'كثّف الأتاري بطرفي العمود على lo إذا المبنى بمنطقة زلزالية حتى لو الجدول يعطي تباعداً واحداً.'],
    footing: ['طبقة نظافة 50–75 مم، والغطاء 75 مم فوقها.', 'الدولات تُربط بالشبكة السفلية وتُثبّت بأتاري حتى لا تتحرك وقت الصب.', 'هذا الأساس مصمَّم بالكود لأن الملف بلا مخطط أساسات — راجعه مع تقرير التربة.'],
    slab: ['كراسي الحديد العلوي كل 1 م تقريباً.', 'الحديد العلوي (T) فوق الجسور يمتد ≈ L/3 من الوجه، والسفلي (B) مستمر.', 'افتح الفتحات (علامة X) بتقوية حولها: سيخان إضافيان بكل جهة بطول ld بعد الزاوية.']
  };
  let CUR = null, NDOS = 0;
  A.open = function (c, B, RES, opts, title) {
    if (!c) { alert('ما قدرت أبني دليل هذا العنصر.'); return; }
    CUR = { c, B, RES, opts, checks: A.checks(c), n: ++NDOS };
    if (window.PHYSLAB) PHYSLAB.labs.forEach(l => { if (l._st) Object.keys(l._st).forEach(k => { if (k.startsWith('cdos')) delete l._st[k]; }); });
    let ov = document.getElementById('cdosOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'cdosOv'; ov.className = 'dos-ov'; document.body.appendChild(ov); }
    const K = CUR.checks, nOk = K.filter(k => k.state === 'ok').length, nW = K.filter(k => k.state === 'warn').length, nF = K.filter(k => k.state === 'fail').length;
    const ic = { beam: '🟩', column: '🟥', footing: '🟫', slab: '⬜' }[c.kind];
    const ttl = title || c.title || ({ beam: 'جسر ' + (c.mark || '(بلا علامة)'), column: 'عمود ' + (c.mark || ''), footing: 'أساس ' + (c.mark || ''), slab: 'بلاطة' }[c.kind] + (c.floor ? ' · ' + c.floor : ''));
    ov.innerHTML = `<div class="dos" role="dialog" aria-label="دليل العنصر">
      <div class="dos-h"><div><span class="dos-ic">${ic}</span><b>${esc(ttl)}</b>
        <div class="dos-badges"><span class="tag t-ok">${nOk} مطابق</span>${nW ? `<span class="tag t-warn">${nW} توصية</span>` : ''}${nF ? `<span class="tag t-bad">${nF} مخالف</span>` : ''}
        <span class="dos-code">ACI 318-19</span><span class="dos-code">🧩 من لوحات الأوتوكاد</span></div></div>
        <button class="dos-x" aria-label="إغلاق">✕</button></div>
      <div class="dos-tabs">${TABS.map((t, i) => `<button data-t="${t[0]}" class="${i ? '' : 'on'}">${t[1]}</button>`).join('')}</div>
      <div class="dos-b" id="cdosB"></div></div>`;
    ov.style.display = 'flex';
    ov.onclick = e => {
      if (e.target === ov || e.target.closest('.dos-x')) { A.close(); return; }
      const b = e.target.closest('.dos-tabs [data-t]'); if (b) { ov.querySelectorAll('.dos-tabs button').forEach(x => x.classList.toggle('on', x === b)); render(b.dataset.t); }
    };
    document.addEventListener('keydown', escKey);
    render('sum');
  };
  function escKey(e) { if (e.key === 'Escape') A.close(); }
  A.close = function () {
    const ov = document.getElementById('cdosOv'); if (ov) ov.style.display = 'none';
    const b = document.getElementById('cdosB'); if (b) b.innerHTML = '';
    if (window.PHYSLAB && PHYSLAB.stop) PHYSLAB.stop();
    document.removeEventListener('keydown', escKey);
  };
  A.openPick = (u, B, RES, opts) => A.open(A.ctxFromPick(u, B, RES, opts), B, RES, opts);
  A.openKey = (key, B, RES, opts) => A.open(A.ctxFromKey(key, B, RES, opts), B, RES, opts);

  function sumRows(c) {
    const M = c.M || {};
    if (c.kind === 'beam') return [['العلامة', c.mark || '(بلا علامة)'], ['الطابق · المحور', (c.floor || '—') + ' · ' + AXN(c.axis || '—')], ['المقطع b×h', c.b + '×' + c.h + ' مم'],
      ['البحر', c.geo ? f2(c.geo.L) + ' م (' + { single: 'منفرد', end: 'طرفي', interior: 'داخلي', cant: 'كابولي' }[c.geo.kind] + ')' : '—'],
      ['السفلي: مستمر + إضافي', bl(c.bc) + (c.bx ? ' + ' + bl(c.bx) : '')], ['العلوي: مستمر + فوق المساند', bl(c.tc) + (c.tsu ? ' + ' + bl(c.tsu) : '')],
      ['الكانات: الأطراف / الوسط', 'Ø' + c.dt + '@' + (c.sEnd || '—') + ' / @' + (c.sMid || '—')], ['جانبي', c.side && c.side.n ? bl(c.side) : '—'],
      ['العمق الفعّال d', f0(c.d) + ' مم'], ['المصدر', 'جدول الجسور (SCHEDULE OF BEAMS) + مفتاح الجسور']];
    if (c.kind === 'column') return [['العلامة', c.mark || '—'], ['الطابق · التقاطع', (c.floor || '—') + (c.at ? ' · ' + AXN(c.at) : '')], ['المقطع', c.circ ? 'Ø' + c.b : c.b + '×' + c.h + ' مم'],
      ['الحديد الرئيسي', c.n ? c.n + 'Ø' + c.db : '—'], ['الأتاري', c.s ? 'Ø' + c.dt + '@' + c.s + (c.sets > 1 ? ' (' + c.sets + '/مجموعة)' : '') : '—'],
      ['ρ', c.n ? (c.Ast / (c.b * (c.circ ? c.b : c.h)) * 100).toFixed(2) + '%' : '—'], ['الارتفاع · الطول الحر', c.geo ? f2(c.geo.H) + ' · ' + f2(c.geo.ln) + ' م' : '—'],
      ['Pu تقديري', c.geo && c.geo.Pu ? f0(c.geo.Pu) + ' kN' : '—'], ['المصدر', 'جدول الأعمدة (Columns Reinforcing Schedule) × مفتاح الأعمدة']];
    if (c.kind === 'footing') return [['العمود', c.mark || '—'], ['الأبعاد', f2(c.B) + '×' + f2(c.B) + ' م × ' + f0(c.h) + ' مم'], ['الحديد', 'Ø' + c.db + '@' + f0(c.s) + ' بالاتجاهين'],
      ['PD / PL', f0(c.PD) + ' / ' + f0(c.PL) + ' kN'], ['Pu', f0(c.Pu) + ' kN'], ['المصدر', c.designed ? 'مصمَّم بالكود (الملف بلا مخطط أساسات)' : 'من الملف']];
    return [['الطابق', c.f ? c.f.name : '—'], ['السماكة', c.t + ' مم' + (c.ribs ? ' (تغطية ' + c.ribs.topping + ')' : '')], ['النظام', c.sys || (c.beamless ? 'بلا جسور' : 'على جسور')],
      ['الشبكة السفلية', c.mesh.bot ? 'Ø' + c.mesh.bot.d + '@' + c.mesh.bot.s : '—'], ['الشبكة العلوية', c.mesh.top ? 'Ø' + c.mesh.top.d + '@' + c.mesh.top.s : '—'],
      ['اللوح', c.panel ? f2(c.panel.a) + '×' + f2(c.panel.b) + ' م' : '—'], ['المصدر', 'نداءات التسليح بلوحة «Slab Reinforcement Plan» + عنوانها']];
  }

  function render(tab) {
    const box = document.getElementById('cdosB'); if (!box || !CUR) return;
    const { c, B, checks, opts } = CUR;
    if (tab === 'sum') {
      const worst = checks.filter(k => k.state === 'fail' || k.state === 'warn');
      box.innerHTML = `<div class="dos-grid"><div>${secHtml(c)}</div><div><table class="dos-t"><tbody>${sumRows(c).map(r => `<tr><td>${esc(r[0])}</td><td><b>${esc(r[1])}</b></td></tr>`).join('')}
        <tr><td>المواد</td><td><b dir="ltr">f'c = ${c.fc} MPa · fy = ${c.fy} MPa</b> <span class="hint">(${esc((c.M || {}).fcSrc || '')})</span></td></tr></tbody></table>
        ${worst.length ? `<div class="note" style="margin-top:10px"><b>انتباه:</b><ul class="pl-ul">${worst.map(k => `<li>${k.state === 'fail' ? '❌' : '⚠️'} ${esc(k.name)} — ${esc(k.why || k.lim)}</li>`).join('')}</ul></div>`
          : '<div class="dos-okbox">✓ كل فحوص التفصيل مطابقة لـ ACI 318-19.</div>'}
        <div class="hint">«🔬 المختبر الحي» يشغّل نفس مختبرات الفيزياء على أرقام هذا العنصر، و«📍 موقعه بالمسقط» يبيّن وين هو.</div></div></div>`;
    } else if (tab === 'lab') {
      if (!window.PHYSLAB) { box.innerHTML = '<div class="note">وحدة المختبر غير محمَّلة.</div>'; return; }
      const sd = labSeed(c, B, opts), key = 'cdos' + CUR.n;
      box.innerHTML = `<div class="dos-labnote">🔬 ${esc(sd.note)} — غيّر أي قيمة وشوف التأثير لحظياً؛ أرقام اللوحة نفسها ما تتغيّر.</div>` + PHYSLAB.html({ key, labs: sd.labs, vals: sd.vals });
      PHYSLAB.init();
    } else if (tab === 'calc') {
      const P = calcPayloads(c);
      box.innerHTML = stepsHtml(c) + (P.length ? '<h4 style="margin:14px 0 6px">📜 الاشتقاق التفصيلي (نفس محرّك المعالج)</h4><div id="cdosCalc"></div>' : '');
      if (P.length && window.CALCDOC) window.CALCDOC.into(document.getElementById('cdosCalc'), P, { note: c.kind === 'beam' ? 'Mu هنا تقديري (§6.5)، والحديد المستعمل من جدول الجسور.' : 'المقطع والحديد من جدول الأعمدة.' });
    } else if (tab === 'sec') {
      const R = RB();
      let notes = '';
      if (c.kind === 'beam') { const fit = R.fit(c.b, c.cover, c.dt, Math.max(1, c.n1), c.dbB, 20);
        notes = `<ul class="pl-ul"><li>d = ${f0(c.d)} مم = h − الغطاء − الكانة − نصف السيخ${c.n2 ? ' (لمركز الطبقتين)' : ''}.</li><li>العرض داخل الكانة ${f0(fit.avail)} مم يستوعب ${fit.nMax} أسياخ Ø${c.dbB} بطبقة واحدة.</li>
          <li>قطر ثني الكانة ${f0(R.bendDia(c.dt, 'tie'))} مم (جدول 25.3.2)، والسيخ الرئيسي ${f0(R.bendDia(c.dbB))} مم (جدول 25.3.1).</li>
          <li>طول النشر بالشد: سفلي ${f0(R.ld({ db: c.dbB, fc: c.fc, fy: c.fy, cover: c.cover }).ld)} مم · علوي ${f0(R.ld({ db: c.dbT, fc: c.fc, fy: c.fy, cover: c.cover, top: true }).ld)} مم (25.4.2.4)، والعكفة ldh ${f0(R.ldh({ db: c.dbT, fc: c.fc, fy: c.fy, confined: true, inCore: true }).ldh)} مم (25.4.3.1).</li></ul>`; }
      else if (c.kind === 'column' && c.n) { const lc = R.lapComp({ db: c.db, fc: c.fc, fy: c.fy });
        notes = `<ul class="pl-ul"><li>أقصى تباعد للأتاري ${f0(R.tieS(c.db, c.dt, c.b, c.circ ? c.b : c.h).s)} مم (25.7.2.1).</li><li>وصلة الانضغاط ${f0(lc.lap)} مم (25.5.5.1)، ودفن الدولات ldc ${f0(R.ldc({ db: c.db, fc: c.fc, fy: c.fy }).ldc)} مم (25.4.9.2).</li>
          <li>عكفة الأتاري 135° بامتداد ${f0(R.hookExt(c.dt, 135, 'tie'))} مم (25.3.4).</li></ul>`; }
      box.innerHTML = `<div class="dos-grid"><div>${secHtml(c)}</div><div>${notes}</div></div>`;
    } else if (tab === 'chk') {
      box.innerHTML = chkTable(checks);
    } else if (tab === 'bbs') {
      const rows = bbs(c); let tot = 0;
      box.innerHTML = rows.length ? `<div style="overflow-x:auto"><table class="dos-t"><thead><tr><th>العلامة</th><th>الوصف</th><th>القطر</th><th>العدد</th><th>طول القطع (مم)</th><th>الشكل</th><th>الوزن (كغم)</th></tr></thead><tbody>${
        rows.map(r => { tot += r.kg; return `<tr><td><b>${r.mark}</b></td><td>${esc(r.desc)}</td><td class="ltr">Ø${r.db}</td><td>${r.n}</td><td>${f0(r.L)}</td><td>${esc(r.shape)}</td><td>${f1(r.kg)}</td></tr>`; }).join('')}
        <tr><td colspan="6"><b>المجموع لهذا العنصر</b></td><td><b>${f1(tot)} كغم</b></td></tr></tbody></table></div>
        <div class="hint">طول القطع = المستقيم + (قوس الثنية على محور السيخ + الامتداد) لكل عكفة؛ الكانة = المحيط بزوايا مقوّسة + عكفتا 135° (MNL-66). الوزن 0.00617·db² كغم/م.</div>`
        : '<div class="note">ما في حديد مقروء لهذا العنصر لأبني جدول قطعه.</div>';
    } else if (tab === 'plan') {
      box.innerHTML = `<div class="kp-wrap">${keyPlan(B, c)}</div><div class="hint">🟨 العنصر المختار${c.kind === 'beam' && c.nInst ? ' (كل الجسور بنفس العلامة)' : ''} · 🟥 الأعمدة · خطوط المحاور بأسمائها.</div>`;
    } else if (tab === 'site') {
      box.innerHTML = `<ol class="pl-ul dos-site">${(SITE[c.kind] || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
    }
  }

  A._t = { beamCtx, beamGeo, colCtx, colGeo, slabCtx, footCtx, bbs, flex, shear, faces, labSeed, keyPlan, panelAt, bigPanel };
})();
if (typeof module !== 'undefined') module.exports = window.CADAUDIT;
