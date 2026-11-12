/* كتاب قواعد حديد التسليح — ACI 318-19 (الفصل 25 + بنود الجسور 9 والأعمدة 10 والزلازل 18 والتشقق 24).
   دوال نقية بلا واجهة، تُستعمل في: دليل العنصر بالمعالج، ومركز الحديد ومختبراته، وفحص جداول الأوتوكاد.
   الأرقام مطابقة لدوال الخادم (engine.dev_length · rebar.hook_full · detail.cover) حتى لا يختلف الدليل
   عمّا حسبه المعالج. الأطوال بالمليمتر · الإجهادات MPa · القوى kN. */
(function () {
  const R = window.REBAR = {};
  const sq = Math.sqrt, PI = Math.PI;
  const r1 = x => Math.round(x * 10) / 10;

  /* ---------------- الأقطار والرتب ---------------- */
  R.SIZES = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40];
  R.bar = db => ({ db, A: PI * db * db / 4, kg: 0.00617 * db * db, per: PI * db,
    us: { 10: '#3', 12: '#4', 16: '#5', 20: '#6', 22: '#7', 25: '#8', 28: '#9', 32: '#10', 36: '#11' }[db] || '—' });
  R.GRADES = [
    { k: 'A615-280', fy: 280, fu: 420, el: 11, note: 'حديد طري — للأساور القديمة والأعمال الثانوية', seismic: false },
    { k: 'A615-420', fy: 420, fu: 620, el: 9, note: 'الأشيع (Grade 60) — كل عناصر المشروع', seismic: 'مسموح بشروط 20.2.2.5' },
    { k: 'A706-420', fy: 420, fu: 550, el: 14, note: 'قابل للّحام ومطيلية مضمونة — المفضّل للإطارات الزلزالية الخاصة', seismic: true },
    { k: 'A615-520', fy: 520, fu: 690, el: 7, note: 'عالي المقاومة — ψg = 1.15 وطول نشر أكبر', seismic: false },
    { k: 'A706-550', fy: 550, fu: 690, el: 12, note: 'عالي المقاومة ومطيلي — مسموح بالأعمدة الزلزالية (20.2.2.4)', seismic: true }
  ];
  R.psiG = fy => fy <= 420 ? 1.0 : fy <= 550 ? 1.15 : 1.3;          // جدول 25.4.2.5

  /* ---------------- الغطاء (20.5.1.3.1) ---------------- */
  R.cover = function (el, exp, db) {
    if (exp === 'ground') return 75;
    if (exp === 'weather') return db >= 19 ? 50 : 40;
    if (el === 'slab' || el === 'wall' || el === 'joist') return db <= 36 ? 20 : 40;
    return 40;
  };
  R.COVER_TABLE = [
    ['خرسانة مصبوبة على التربة ومعرّضة لها دائماً', 75, '20.5.1.3.1(أ)'],
    ['معرّضة للطقس أو التربة — Ø19 إلى Ø57', 50, '20.5.1.3.1(ب)'],
    ['معرّضة للطقس أو التربة — Ø16 فأصغر', 40, '20.5.1.3.1(ب)'],
    ['غير معرّضة — بلاطات وجدران وأعصاب (Ø36 فأصغر)', 20, '20.5.1.3.1(ج)'],
    ['غير معرّضة — جسور وأعمدة (الحديد الرئيسي والأساور)', 40, '20.5.1.3.1(ج)']
  ];

  /* ---------------- الثني والعكفات (25.3) ---------------- */
  R.bendDia = function (db, kind) {
    const t = kind === 'tie' ? [[16, 4], [25, 6]] : [[25, 6], [36, 8], [57, 10]];
    for (const [lim, m] of t) if (db <= lim + 1e-9) return m * db;
    return t[t.length - 1][1] * db;
  };
  R.hookExt = function (db, angle, kind) {
    if (kind === 'tie') {
      if (angle === 90) return db <= 16 ? Math.max(6 * db, 75) : 12 * db;
      if (angle === 135) return Math.max(6 * db, 75);
      return Math.max(4 * db, 65);
    }
    return angle === 90 ? 12 * db : Math.max(4 * db, 65);
  };
  R.hook = function (db, angle, kind) {
    const D = R.bendDia(db, kind), rin = D / 2, rax = rin + db / 2, ext = R.hookExt(db, angle, kind);
    const arc = angle * PI / 180 * rax;
    return { db, angle, kind, D, rin, rax, ext, arc, added: arc + ext,
      clause: kind === 'tie' ? 'جدول 25.3.2' + (angle === 135 ? ' + 25.3.4 (عكفة زلزالية)' : '') : 'جدول 25.3.1' };
  };

  /* ---------------- طول النشر بالشد (25.4.2.4) ---------------- */
  R.ld = function (o) {
    const db = o.db, fc = Math.min(o.fc, 69), fy = o.fy || 420, lam = o.lam || 1;
    const pt = o.top ? 1.3 : 1.0;
    let pe = 1.0;
    if (o.coat === 'epoxy') { const clear = o.s ? o.s - db : null; pe = (o.cover < 3 * db || (clear !== null && clear < 6 * db)) ? 1.5 : 1.2; }
    else if (o.coat === 'zinc') pe = 1.2;
    if (pt * pe > 1.7) pe = 1.7 / pt;
    const ps = db <= 19.1 ? 0.8 : 1.0, pg = R.psiG(fy);
    let cb = (o.cover || 40) + db / 2; if (o.s) cb = Math.min(cb, o.s / 2);
    const Ktr = o.Atr && o.str && o.ntr ? 40 * o.Atr / (o.str * o.ntr) : 0;
    const conf = Math.min(2.5, (cb + Ktr) / db);
    const rootfc = Math.min(sq(fc), 8.3);                       // 25.4.1.4: √f'c ≤ 8.3 MPa
    const raw = fy * pt * pe * ps * pg / (1.1 * lam * rootfc * conf) * db;
    const ex = o.excess ? Math.max(0, Math.min(1, o.excess)) : 1;
    const ld = Math.max(raw * ex, 300);
    return { ld, raw, pt, pe, ps, pg, cb, Ktr, conf, ex, ratio: ld / db, clause: '25.4.2.4(أ) + جدول 25.4.2.5' };
  };
  // الجدول المبسّط 25.4.2.3 (للمقارنة): حالتان حسب الخلوص والأساور
  R.ldSimple = function (o) {
    const db = o.db, fy = o.fy || 420, rt = Math.min(sq(o.fc), 8.3), pt = o.top ? 1.3 : 1, pe = 1, pg = R.psiG(fy);
    const good = o.good !== false;
    const k = db <= 19.1 ? (good ? 2.1 : 1.4) : (good ? 1.7 : 1.1);
    return Math.max(300, fy * pt * pe * pg / (k * rt) * db);
  };

  /* ---------------- العكفة القياسية بالشد ldh (25.4.3.1) ---------------- */
  R.ldh = function (o) {
    const db = o.db, fc = o.fc, fy = o.fy || 420, lam = o.lam || 1;
    const pe = o.coat ? 1.2 : 1.0;
    const pr = o.confined && db <= 36 ? 1.0 : 1.6;               // جدول 25.4.3.2: تطويق موازٍ
    const po = o.inCore && db <= 36 ? 1.0 : 1.25;                // داخل لب العمود بغطاء جانبي ≥ 65
    const pc = fc < 40 ? fc / 105 + 0.6 : 1.0;
    const main = fy * pe * pr * po * pc / (23 * lam * sq(fc)) * Math.pow(db, 1.5);
    return { ldh: Math.max(main, 8 * db, 150), main, pe, pr, po, pc, clause: '25.4.3.1 + جدول 25.4.3.2' };
  };
  /* ---------------- السيخ ذو الرأس ldt (25.4.4.2) ---------------- */
  R.ldt = function (o) {
    const db = o.db, fc = o.fc, fy = o.fy || 420;
    const pe = o.coat ? 1.2 : 1.0, pp = o.confined ? 1.0 : 1.6, po = o.inCore ? 1.0 : 1.25, pc = fc < 40 ? fc / 105 + 0.6 : 1.0;
    const main = fy * pe * pp * po * pc / (31 * sq(fc)) * Math.pow(db, 1.5);
    return { ldt: Math.max(main, 8 * db, 150), main, pe, pp, po, pc, clause: '25.4.4.2' };
  };
  /* ---------------- النشر بالانضغاط ldc (25.4.9.2) ---------------- */
  R.ldc = function (o) {
    const db = o.db, fc = o.fc, fy = o.fy || 420, lam = o.lam || 1, pr = o.confined ? 0.75 : 1.0;
    const a = 0.24 * fy * pr / (lam * Math.min(sq(fc), 8.3)) * db, b = 0.043 * fy * pr * db;
    return { ldc: Math.max(a, b, 200), a, b, pr, clause: '25.4.9.2' };
  };
  /* ---------------- الوصلات (25.5) ---------------- */
  R.lapTension = function (o) {
    const d = R.ld(Object.assign({}, o, { excess: 1 }));             // 25.5.2.1: بلا تخفيض الفائض
    const cls = o.cls || ((o.provReq || 1) >= 2 && (o.pctSpliced || 100) <= 50 ? 'A' : 'B');
    const lap = Math.max(300, (cls === 'A' ? 1.0 : 1.3) * d.ld);
    return { lap, cls, ld: d.ld, allowed: o.db <= 36, clause: 'جدول 25.5.2.1',
      note: o.db > 36 ? 'Ø > 36: لا تُوصَل بالتراكب بالشد (25.5.1.1) — وصلة ميكانيكية أو لحام' : '' };
  };
  R.lapComp = function (o) {
    const db = o.db, fy = o.fy || 420;
    let lap = fy <= 420 ? Math.max(0.071 * fy * db, 300) : Math.max((0.13 * fy - 24) * db, 300);
    if (o.fc < 21) lap *= 4 / 3;                                  // 25.5.5.1.1
    return { lap, clause: '25.5.5.1' };
  };

  /* ---------------- المسافات (25.2) والتشقق (24.3.2) ---------------- */
  R.clearMin = (db, dagg, member) => member === 'column'
    ? Math.max(40, 1.5 * db, 4 / 3 * (dagg || 20))                  // 25.2.3
    : Math.max(25, db, 4 / 3 * (dagg || 20));                      // 25.2.1
  R.sMaxCrack = function (fy, cc) {                                 // 24.3.2 بـ fs = ⅔fy
    const fs = 2 / 3 * fy;
    return Math.min(380 * 280 / fs - 2.5 * cc, 300 * 280 / fs);
  };
  R.fit = function (b, cover, dstir, n, db, dagg, member) {
    const avail = b - 2 * cover - 2 * dstir;
    const clear = n > 1 ? (avail - n * db) / (n - 1) : avail - db;
    const need = R.clearMin(db, dagg, member);
    const nMax = Math.max(1, Math.floor((avail + need) / (db + need)));
    return { avail, clear, need, ok: clear >= need - 1e-6, nMax };
  };

  /* ---------------- الجسور (الفصل 9) ---------------- */
  R.asMinBeam = (fc, fy, bw, d) => Math.max(0.25 * sq(fc) / fy, 1.4 / fy) * bw * d;      // 9.6.1.2
  R.beta1 = fc => Math.max(0.65, Math.min(0.85, 0.85 - 0.05 * (fc - 28) / 7));
  R.asMaxBeam = (fc, fy, b, d) => {                                   // εt ≥ 0.004 (9.3.3.1)
    const c = 0.003 / (0.003 + 0.004) * d; return 0.85 * fc * b * R.beta1(fc) * c / fy;
  };
  R.avMin = (fc, bw, s, fyt) => Math.max(0.062 * sq(fc), 0.35) * bw * s / fyt;         // 9.6.3.4
  R.stirrupSmax = function (d, Vs, fc, bw) {                         // 9.7.6.2.2
    const hi = Vs > 0.33 * sq(fc) * bw * d / 1000;
    return { s: hi ? Math.min(d / 4, 300) : Math.min(d / 2, 600), hi, clause: '9.7.6.2.2' };
  };
  R.skin = function (h, cover, fy) {                                 // 9.7.2.3
    if (h <= 900) return { need: false };
    const s = Math.min(R.sMaxCrack(fy, cover + 10), 300);
    return { need: true, zone: h / 2, s, clause: '9.7.2.3' };
  };

  /* ---------------- الأعمدة (10 + 25.7) ---------------- */
  R.tieDbMin = (dbL, bundled) => (dbL >= 36 || bundled) ? 13 : 10;   // 25.7.2.2
  R.tieS = function (dbL, dt, b, h) {                                 // 25.7.2.1
    const lim = [[16 * dbL, '16·db الطولي'], [48 * dt, '48·db الأتاري'], [Math.min(b, h), 'أصغر بُعد']];
    const m = lim.reduce((a, x) => x[0] < a[0] ? x : a);
    return { s: m[0], gov: m[1], all: lim, clause: '25.7.2.1' };
  };
  R.spiralRho = (Ag, Ach, fc, fyt) => 0.45 * (Ag / Ach - 1) * fc / fyt;                 // 25.7.3.3
  R.colRho = rho => ({ ok: rho >= 0.01 && rho <= 0.08, lap: rho <= 0.04, clause: '10.6.1.1' });

  /* ---------------- الزلازل (18.4 متوسط · 18.6/18.7 خاص) ---------------- */
  R.seisBeam = function (o) {                                        // o: d, h, dbL, dt, sys
    if (o.sys === 'smf') {
      const s = Math.min(o.d / 4, 6 * o.dbL, 150);
      return { zone: 2 * o.h, first: 50, s, mid: o.d / 2, clause: '18.6.4.1 + 18.6.4.4',
        rules: ['كانات مغلقة (Hoops) على طول 2h من وجه العمود', 'أول كانة ≤ 50 مم من الوجه', 's ≤ min(d/4 ، 6db ، 150)',
          'ρ ≤ 0.025 وسيخان مستمران أعلى وأسفل على الأقل (18.6.3.1)', 'العزم الموجب بالوجه ≥ ½ السالب (18.6.3.2)',
          'لا وصلات تراكب داخل المفصل: ضمن 2h من الوجه ولا داخل العقدة (18.6.3.3)'] };
    }
    const s = Math.min(o.d / 4, 8 * o.dbL, 24 * o.dt, 300);
    return { zone: 2 * o.h, first: 50, s, mid: o.d / 2, clause: '18.4.2.4',
      rules: ['كانات على طول 2h من وجه العمود', 'أول كانة ≤ 50 مم', 's ≤ min(d/4 ، 8db ، 24dt ، 300)', 'العزم الموجب بالوجه ≥ ⅓ السالب (18.4.2.2)'] };
  };
  R.seisCol = function (o) {                                         // o: b, h, ln, dbL, dt, hx, sys
    const big = Math.max(o.b, o.h), small = Math.min(o.b, o.h);
    if (o.sys === 'smf') {
      const lo = Math.max(big, o.ln / 6, 450);
      const sx = Math.max(100, Math.min(150, 100 + (350 - (o.hx || 200)) / 3));
      const so = Math.min(small / 4, 6 * o.dbL, sx);
      return { lo, so, mid: Math.min(6 * o.dbL, 150), clause: '18.7.5.1 + 18.7.5.3',
        rules: ['منطقة التطويق lo = max(h ، ln/6 ، 450)', 'so ≤ min(b/4 ، 6db ، sx) و100 ≤ sx ≤ 150',
          'خارج lo: s ≤ min(6db ، 150) (18.7.5.5)', 'الوصلات بنصف العمود الأوسط فقط (18.7.4.3)', 'ρ بين 1% و6% (18.7.4.1)'] };
    }
    const lo = Math.max(o.ln / 6, big, 450);
    const so = Math.min(8 * o.dbL, 24 * o.dt, small / 2, 300);
    return { lo, so, mid: R.tieS(o.dbL, o.dt, o.b, o.h).s, clause: '18.4.3.3',
      rules: ['lo = max(ln/6 ، أكبر بُعد ، 450)', 'so ≤ min(8db ، 24dt ، b/2 ، 300)', 'أول طوق ≤ so/2 من وجه العقدة'] };
  };
  R.offsetBend = function (dbL, dcol1, dcol2) {                      // 10.7.4.1
    const e = Math.abs(dcol1 - dcol2) / 2;
    return { e, ok: e <= 75, len: e * 6, clause: '10.7.4.1', note: e > 75 ? 'الإزاحة > 75 مم: دولات منفصلة بدل الثني' : 'ميل الثني ≤ 1:6 مع أتاري إضافية عند الثنية' };
  };

  /* ---------------- طول القطع (MNL-66 / BS 8666 الأساسي) ---------------- */
  // كانة مستطيلة مغلقة بعكفتين 135°: المحيط على محور السيخ − 4 زوايا 90° + عكفتان
  R.stirrupCut = function (b, h, cover, dt, angle) {
    const a = b - 2 * cover - dt, c = h - 2 * cover - dt;           // أبعاد المحور
    const hk = R.hook(dt, angle || 135, 'tie');
    const rax = hk.rax, corner = PI / 2 * rax - 2 * rax;            // تصحيح الزاوية المقوّسة
    const L = 2 * (a + c) + 4 * corner + 2 * hk.added;
    return { L, a, c, hook: hk, shape: angle === 135 ? 'كانة مغلقة بعكفتين 135° (شكل T6 بـ MNL-66)' : 'كانة مغلقة' };
  };
  // سيخ: الطول المستقيم حتى بداية الثنية + (قوس الثنية على المحور + الامتداد) لكل عكفة
  R.barCut = (straight, hooks) => straight + (hooks || []).reduce((a, h) => a + (h ? h.added : 0), 0);
  R.mass = (db, L_mm, n) => 0.00617 * db * db * L_mm / 1000 * (n || 1);

  R.fmt = { r1 };
})();
if (typeof module !== 'undefined') module.exports = window.REBAR;
