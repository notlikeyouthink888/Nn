/* مختبرات حديد التسليح — ACI 318-19. كل الأطوال والقواعد من rebarkb.js (مطابق لدوال الخادم).
   ١ طول التماسك والنشر · ٢ العكفات والثني · ٣ الوصلات · ٤ ترتيب الحديد ومرور الركام · ٥ التطويق (ماندر) · ٦ قطع الحديد */
(function () {
  const PL = window.PHYSLAB; if (!PL) return;
  const { C, math: M, nf } = PL, T = PL.text;
  const RB = () => window.REBAR;
  const SZ = [[10, 'Ø10'], [12, 'Ø12'], [16, 'Ø16'], [20, 'Ø20'], [25, 'Ø25'], [28, 'Ø28'], [32, 'Ø32'], [36, 'Ø36']];
  const GR = [[280, 'Grade 280 (40)'], [420, 'Grade 420 (60)'], [520, 'Grade 520 (75)'], [550, 'Grade 550 (80)']];
  const num = v => +v;

  /* ====================================================================
     ١) طول التماسك والنشر — سحب سيخ من الخرسانة
     ==================================================================== */
  PL.calc.devlab = function (s) {
    const R = RB(), db = num(s.db), fy = num(s.fy);
    const Atr = s.tr === 'none' ? 0 : 2 * Math.PI * (s.tr === 't10a' || s.tr === 't10b' ? 10 : 12) ** 2 / 4;
    const str = s.tr === 't10a' ? 150 : s.tr === 't10b' ? 100 : s.tr === 't12' ? 100 : 0;
    const o = { db, fc: s.fc, fy, cover: s.cov, s: s.sp, top: s.top === 'y', coat: s.coat, Atr, str, ntr: 3 };
    const d = R.ld(o), h = R.ldh({ db, fc: s.fc, fy, confined: s.tr !== 'none', inCore: s.cov >= 65 }),
      t = R.ldt({ db, fc: s.fc, fy, confined: s.tr !== 'none', inCore: s.cov >= 65 }), c = R.ldc({ db, fc: s.fc, fy, confined: s.tr !== 'none' });
    const simple = R.ldSimple({ db, fc: s.fc, fy, top: s.top === 'y', good: s.sp - db >= 2 * db && s.cov >= db });
    const As = Math.PI * db * db / 4, ratio = Math.min(1, s.emb / d.ld), fs = fy * ratio;
    const u = As * fs / (Math.PI * db * s.emb);                         // إجهاد التماسك المتوسط (MPa)
    return { d, h, t, c, simple, As, ratio, fs, u, T: As * fs / 1000, Ty: As * fy / 1000, mode: s.emb >= d.ld - 1e-6 ? 'yield' : 'pull' };
  };

  PL.register({
    id: 'rb_dev', cat: 'rebar', ic: '🔩', name: 'طول التماسك والنشر', sub: 'ld · ldh · ldt · ldc · المعاملات ψ',
    title: 'كم لازم يندفن السيخ حتى ما ينسحب؟',
    learn: 'السيخ ما يمسك بالخرسانة إلا بالاحتكاك والنتوءات على طوله. اسحب السيخ بزر «اسحب» وغيّر طول الدفن والغطاء والتباعد والأساور: إذا الدفن أقل من ld ينسحب السيخ ويشقّ الغطاء، وإذا أكبر يخضع السيخ نفسه — وهذا المطلوب.',
    ratio: 0.58, ratioSmall: 1.15, minH: 400, maxH: 600,
    defaults: { db: 16, fc: 25, fy: 420, cov: 40, sp: 100, top: 'n', coat: 'none', tr: 'none', emb: 450 },
    presets: [{ name: 'حديد سفلي عادي', vals: { top: 'n', coat: 'none', tr: 'none', cov: 40, sp: 100 } },
      { name: 'حديد علوي (ψt = 1.3)', vals: { top: 'y' } }, { name: 'مطلي إيبوكسي', vals: { coat: 'epoxy', cov: 30 } },
      { name: 'مع أساور كثيفة', vals: { tr: 't10b' } }],
    controls: [
      { id: 'db', type: 'select', label: 'قطر السيخ', opts: SZ, onChange: s => { s.db = +s.db; } },
      { id: 'fy', type: 'select', label: 'رتبة الحديد', opts: GR, onChange: s => { s.fy = +s.fy; } },
      { id: 'fc', label: "f'c", min: 20, max: 60, step: 1, unit: 'MPa' },
      { id: 'emb', label: 'طول الدفن المنفّذ', min: 100, max: 2000, step: 10, unit: 'مم' },
      { type: 'sep', label: 'الظروف (المعاملات)' },
      { id: 'cov', label: 'الغطاء الصافي', min: 15, max: 80, step: 5, unit: 'مم' },
      { id: 'sp', label: 'التباعد بين مراكز الأسياخ', min: 40, max: 300, step: 5, unit: 'مم' },
      { id: 'top', type: 'select', label: 'موقع السيخ', opts: [['n', 'سفلي / عادي'], ['y', 'علوي (> 300 مم خرسانة تحته)']] },
      { id: 'coat', type: 'select', label: 'الطلاء', opts: [['none', 'بلا طلاء'], ['epoxy', 'إيبوكسي'], ['zinc', 'مجلفن']] },
      { id: 'tr', type: 'select', label: 'أساور عرضية (Ktr)', opts: [['none', 'بلا'], ['t10a', 'Ø10 @ 150'], ['t10b', 'Ø10 @ 100'], ['t12', 'Ø12 @ 100']] },
      { type: 'buttons', items: [['pull', '💪 اسحب السيخ', ''], ['fit', '📏 اجعل الدفن = ld']] }
    ],
    layers: [
      { k: 'bond', name: 'إجهاد التماسك', color: C.acc, on: true },
      { k: 'split', name: 'تشقّق الغطاء', color: '#e5e7eb', on: true },
      { k: 'len', name: 'ld المطلوب', color: C.warn, on: true },
      { k: 'cmp', name: 'مقارنة الأنواع', color: C.ok, on: 'lvl', lvl: 2 },
      { k: 'psi', name: 'المعاملات ψ', color: '#c084fc', on: 'lvl', lvl: 2 }
    ],
    solve(s) { s.db = +s.db; s.fy = +s.fy; return PL.calc.devlab(s); },
    action(k, s, r) { if (k === 'pull') { s._p = 0; s._anim = true; } if (k === 'fit') s.emb = Math.ceil(r.d.ld / 10) * 10; },
    tick(dt, s) { if (!s._anim) return false; s._p = Math.min(1.35, (s._p || 0) + dt / 2.4); if (s._p >= 1.35) s._anim = false; return true; },
    draw(ctx, W, H, s, r, t) {
      const small = W < 620, lay = s._lay;
      const bx = 30, bw = small ? W - 60 : W * 0.58, by = 70, bh = small ? H * 0.28 : H * 0.42;
      const Lmax = Math.max(2100, r.d.ld * 1.1), sc = (bw - 40) / Lmax;
      ctx.fillStyle = '#3b4a63'; ctx.fillRect(bx, by, bw, bh); PL.hatch(ctx, bx, by, bw, bh, 'rgba(148,163,184,.15)', 10);
      T(ctx, 'كتلة خرسانة', bx + 50, by - 10, { size: 10, color: C.mut });
      const p = s._anim || s._p ? Math.min(1, s._p || 1) : 1, over = Math.max(0, (s._p || 0) - 1);
      const slip = r.mode === 'pull' && (s._p || 0) > r.ratio ? ((s._p || 0) - r.ratio) * 180 : 0;
      const yb = by + bh * 0.3, xEnd = bx + bw, x0 = xEnd - s.emb * sc - slip * 0;
      const dbp = Math.max(5, Math.min(18, s.db * 0.5));
      const pulled = r.mode === 'pull' && (s._p || 0) > r.ratio;
      const shift = pulled ? Math.min(90, ((s._p || 0) - r.ratio) * 260) : 0;
      // السيخ
      const stress = Math.min(1, p) * r.fs / s.fy;
      ctx.fillStyle = PL.seq(0.2 + 0.8 * stress); ctx.fillRect(x0 + shift, yb - dbp / 2, s.emb * sc + 120, dbp);
      for (let x = x0 + shift; x < xEnd + 120 + shift; x += 7) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(x, yb - dbp / 2); ctx.lineTo(x + 3, yb + dbp / 2); ctx.stroke(); }
      if (r.mode === 'yield' && (s._p || 0) > 1) { ctx.fillStyle = C.bg2; ctx.fillRect(xEnd + 60, yb - dbp / 2, 16, dbp * over * 0.9); T(ctx, 'السيخ خضع خارج الخرسانة ✓ (المطلوب)', xEnd - 10, yb + 40, { align: 'right', color: C.ok, bold: true }); }
      if (pulled) T(ctx, '✗ انسحب السيخ قبل خضوعه — الدفن أقل من ld', bx + bw / 2, by + bh + 16, { color: C.bad, bold: true, bg: 'rgba(10,16,32,.8)' });
      // قوة الشد
      PL.arrow(ctx, xEnd + 40 + shift, yb, xEnd + 110 + shift, yb, C.load, 3, 10);
      T(ctx, `T = ${nf(r.T * Math.min(1, p), 0)} kN`, xEnd + 60, yb - 16, { color: C.load, bold: true });
      // الغطاء
      const cv = Math.max(8, s.cov * sc * 3);
      ctx.strokeStyle = 'rgba(125,211,252,.6)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(bx, yb - dbp / 2 - cv); ctx.lineTo(xEnd, yb - dbp / 2 - cv); ctx.stroke(); ctx.setLineDash([]);
      T(ctx, `غطاء ${s.cov} مم`, bx + 6, yb - dbp / 2 - cv - 8, { align: 'left', size: 9.5, color: '#7dd3fc' });
      // إجهاد التماسك
      if (lay.bond) {
        const n = Math.max(4, Math.floor(s.emb * sc / 18));
        for (let i = 0; i < n; i++) { const x = x0 + shift + (i + .5) * s.emb * sc / n, L = 6 + 10 * Math.min(1, p);
          PL.arrow(ctx, x, yb - dbp / 2 - 2, x - L, yb - dbp / 2 - 2, C.acc, 1.2, 5); PL.arrow(ctx, x, yb + dbp / 2 + 2, x - L, yb + dbp / 2 + 2, C.acc, 1.2, 5); }
        T(ctx, `إجهاد التماسك المتوسط u = ${nf(r.u * Math.min(1, p), 2)} MPa`, x0 + s.emb * sc / 2, yb + dbp / 2 + 22, { size: 10, color: C.acc, bg: 'rgba(10,16,32,.7)' });
      }
      if (lay.split && (pulled || (r.mode === 'pull' && (s._p || 0) > 0.7 * r.ratio))) {
        ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1;
        for (let x = x0 + 10; x < xEnd; x += 22) { ctx.beginPath(); ctx.moveTo(x, yb - dbp / 2); ctx.lineTo(x + 6, yb - dbp / 2 - cv * .6); ctx.lineTo(x + 3, yb - dbp / 2 - cv - 2); ctx.stroke(); }
        T(ctx, 'شقوق انفلاق فوق السيخ (الغطاء أو التباعد صغير ⇒ cb صغير)', bx + bw / 2, by + 16, { size: 9.5, color: '#e5e7eb' });
      }
      if (lay.len) {
        const xl = xEnd - r.d.ld * sc;
        ctx.strokeStyle = C.warn; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(xl, by - 4); ctx.lineTo(xl, by + bh + 4); ctx.stroke(); ctx.setLineDash([]);
        T(ctx, `ld = ${nf(r.d.ld, 0)} مم (${nf(r.d.ratio, 0)}db)`, xl, by - 26, { color: C.warn, bold: true, bg: 'rgba(10,16,32,.75)' });
        T(ctx, `الدفن ${nf(s.emb, 0)} مم`, xEnd - s.emb * sc / 2, by + bh - 12, { color: s.emb >= r.d.ld ? C.ok : C.bad, bold: true });
      }
      if (lay.cmp) {
        const box = small ? { x: 8, y: H * 0.5, w: W - 16, h: H * 0.28 } : { x: W * 0.62, y: 12, w: W * 0.36, h: H * 0.5 };
        ctx.fillStyle = 'rgba(10,16,32,.9)'; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.strokeStyle = C.line; ctx.strokeRect(box.x + .5, box.y + .5, box.w - 1, box.h - 1);
        T(ctx, 'نفس السيخ بأربع طرق تثبيت (مم)', box.x + box.w - 8, box.y + 12, { align: 'right', size: 10, bold: true });
        const items = [['مستقيم بالشد ld', r.d.ld, C.warn], ['بعكفة 90° ldh', r.h.ldh, C.acc], ['برأس ldt', r.t.ldt, C.ok], ['بالانضغاط ldc', r.c.ldc, '#c084fc'], ['الجدول المبسّط', r.simple, '#94a3b8']];
        const mx = Math.max(...items.map(i => i[1])), rowH = (box.h - 30) / items.length;
        items.forEach(([nm, v, col], i) => { const y = box.y + 24 + i * rowH, w = (box.w - 120) * v / mx;
          ctx.fillStyle = col; ctx.fillRect(box.x + box.w - 110 - w, y + 3, w, rowH - 8);
          T(ctx, nm, box.x + box.w - 6, y + rowH / 2, { align: 'right', size: 9.5 });
          T(ctx, nf(v, 0), box.x + box.w - 114 - w, y + rowH / 2, { align: 'right', size: 9.5, color: col }); });
      }
      if (lay.psi) {
        const y = small ? H * 0.82 : H * 0.62, x = small ? 10 : W * 0.62, w = small ? W - 20 : W * 0.36;
        const d = r.d, rows = [['ψt (موقع)', d.pt], ['ψe (طلاء)', d.pe], ['ψs (قطر)', d.ps], ['ψg (رتبة)', d.pg], ['(cb+Ktr)/db', d.conf]];
        rows.forEach(([k, v], i) => { T(ctx, `${k} = ${nf(v, 2)}`, x + w - 6, y + i * 17, { align: 'right', size: 10, color: '#d8b4fe' }); });
      }
    },
    kpis(s, r) {
      return [['ld مستقيم', nf(r.d.ld, 0) + ' مم'], ['ld/db', nf(r.d.ratio, 0) + 'db'], ['ldh بعكفة', nf(r.h.ldh, 0) + ' مم'], ['ldt برأس', nf(r.t.ldt, 0) + ' مم'],
        ['ldc انضغاط', nf(r.c.ldc, 0) + ' مم'], ['الإجهاد الممكن', nf(r.fs, 0) + ' MPa', r.mode === 'yield' ? 'ok' : 'bad']];
    },
    explain(s, r) {
      const d = r.d;
      const see = `<ul class="pl-ul"><li>السيخ ينقل قوته للخرسانة عن طريق <b>إجهاد التماسك</b> على سطحه (النتوءات). كل ما طال الدفن، زادت القوة اللي يقدر ينقلها.</li>
        <li>لما الدفن = ld يقدر السيخ يوصل لإجهاد الخضوع fy كاملاً قبل ما ينسحب — هذا تعريف طول النشر.</li>
        <li>الغطاء الصغير أو الأسياخ المتقاربة تخلّي الخرسانة حول السيخ تنشقّ (انفلاق) قبل ما يوصل للتماسك الكامل — لهذا (cb + Ktr)/db بالمعادلة.</li>
        <li>العكفة تقصّر الطول المطلوب (${nf(r.h.ldh, 0)} بدل ${nf(d.ld, 0)} مم) لأن الثنية تتكئ على الخرسانة؛ والرأس (headed) أقصر بعد.</li></ul>`;
      const math = PL.steps([
        ['طول النشر بالشد — ACI 318-19 (25.4.2.4أ)'],
        ['المعادلة', 'ld = [fy·ψt·ψe·ψs·ψg / (1.1·λ·√f\'c·(cb+Ktr)/db)]·db', ''],
        ['cb', 'min(الغطاء + db/2 ، التباعد/2)', nf(d.cb, 1) + ' مم'],
        ['Ktr', '40·Atr / (s·n)', nf(d.Ktr, 1) + ' مم'],
        ['(cb+Ktr)/db', '≤ 2.5', nf(d.conf, 2)],
        ['المعاملات', 'ψt·ψe·ψs·ψg', `${nf(d.pt, 1)}·${nf(d.pe, 2)}·${nf(d.ps, 1)}·${nf(d.pg, 2)}`],
        ['النتيجة', 'ld ≥ 300 مم', nf(d.ld, 0) + ' مم = ' + nf(d.ratio, 1) + 'db'],
        ['الأنواع الأخرى'],
        ['عكفة 90°', 'ldh = (fy·ψe·ψr·ψo·ψc/(23λ√f\'c))·db^1.5 ≥ 8db ، 150', nf(r.h.ldh, 0) + ' مم'],
        ['رأس', 'ldt = (fy·ψe·ψp·ψo·ψc/(31√f\'c))·db^1.5', nf(r.t.ldt, 0) + ' مم'],
        ['انضغاط', 'ldc = max(0.24fy·ψr/(λ√f\'c) ، 0.043fy·ψr)·db ≥ 200', nf(r.c.ldc, 0) + ' مم'],
        ['السحب'],
        ['الإجهاد الممكن بهذا الدفن', 'fs = fy·(الدفن/ld) ≤ fy', nf(r.fs, 0) + ' MPa'],
        ['إجهاد التماسك', 'u = As·fs / (π·db·الدفن)', nf(r.u, 2) + ' MPa']]);
      const code = `<ul class="pl-ul"><li><b>25.4.2.4</b> المعادلة التفصيلية، و<b>جدول 25.4.2.5</b> المعاملات ψt ψe ψs ψg (ψt·ψe ≤ 1.7).</li>
        <li><b>25.4.2.3</b> الجدول المبسّط (للمقارنة) — أطول لأنه ما يحسب cb و Ktr.</li><li><b>25.4.1.4</b> √f'c ≤ 8.3 MPa.</li>
        <li><b>25.4.3</b> العكفات القياسية ldh، و<b>25.4.4</b> الأسياخ ذات الرأس، و<b>25.4.9</b> النشر بالانضغاط.</li>
        <li><b>25.4.10</b> تخفيض بنسبة As المطلوب/المنفّذ — ممنوع بالوصلات وبالمناطق الزلزالية.</li></ul>`;
      const tr = `<ol class="pl-ul"><li>خلّ الدفن 300 مم واسحب: السيخ ينسحب. اضغط «اجعل الدفن = ld» واسحب مرة ثانية: يخضع.</li>
        <li>اختر «حديد علوي»: ld يزيد 30% لأن الماء والفقاعات تتجمع تحت الأسياخ العلوية فيضعف التماسك.</li>
        <li>صغّر الغطاء إلى 20 مم: (cb+Ktr)/db ينزل و ld يطول — وهنا فائدة الأساور (جرّب «أساور كثيفة»).</li>
        <li>بدّل Grade 420 بـ 550: ld يزيد مرتين تقريباً (fy و ψg = 1.15).</li></ol>`;
      return { see, math, code, try: tr };
    }
  });

  /* ====================================================================
     ٢) العكفات والثني — الهندسة وانفعال الألياف
     ==================================================================== */
  const ASTM_PIN = db => db <= 16 ? 3.5 * db : db <= 25 ? 5 * db : db <= 36 ? 7 * db : 9 * db;   // ASTM A615 اختبار الثني (Grade 420)
  PL.register({
    id: 'rb_hook', cat: 'rebar', ic: '🪝', name: 'العكفات والثني', sub: 'قطر الثني · الامتداد · انفعال الألياف',
    title: 'ليش قطر الثني له حد أدنى؟',
    learn: 'اثنِ السيخ حول «مسمار» بقطر تختاره: كلما صغر المسمار زاد تمدد الألياف الخارجية للسيخ حتى يتشقق. شوف الحد الأدنى بالكود (جدول 25.3.1 و25.3.2) وطول الامتداد المطلوب، والطول المضاف للقطع.',
    ratio: 0.56, ratioSmall: 1.1, minH: 380, maxH: 580,
    defaults: { db: 16, kind: 'bar', ang: 90, dm: 6 },
    presets: [{ name: 'سيخ رئيسي 90°', vals: { kind: 'bar', ang: 90, dm: 6 } }, { name: 'كانة زلزالية 135°', vals: { kind: 'tie', ang: 135, db: 10, dm: 4 } },
      { name: 'عكفة 180°', vals: { kind: 'bar', ang: 180, dm: 6 } }, { name: 'ثني بالمطرقة (خطأ)', vals: { kind: 'bar', ang: 90, dm: 2 } }],
    controls: [
      { id: 'db', type: 'select', label: 'القطر', opts: SZ, onChange: s => { s.db = +s.db; } },
      { id: 'kind', type: 'select', label: 'النوع', opts: [['bar', 'سيخ رئيسي (جدول 25.3.1)'], ['tie', 'كانة / أتاري (جدول 25.3.2)']] },
      { id: 'ang', type: 'select', label: 'زاوية العكفة', opts: [[90, '90°'], [135, '135°'], [180, '180°']], onChange: s => { s.ang = +s.ang; } },
      { id: 'dm', label: 'قطر الثني المستعمل ÷ db', min: 1, max: 12, step: 0.5, fmt: v => nf(v, 1) + 'db' },
      { type: 'buttons', items: [['min', '📐 اجعله الحد الأدنى']] }
    ],
    layers: [{ k: 'dim', name: 'الأبعاد', color: C.acc, on: true }, { k: 'pin', name: 'مسمار الثني', color: '#94a3b8', on: true },
      { k: 'strain', name: 'انفعال الألياف', color: C.tens, on: true }, { k: 'cut', name: 'الطول المضاف للقطع', color: C.ok, on: 'lvl', lvl: 2 }],
    solve(s) {
      s.db = +s.db; s.ang = +s.ang;
      const R = RB(), Dmin = R.bendDia(s.db, s.kind), ext = R.hookExt(s.db, s.ang, s.kind), D = s.dm * s.db;
      const rax = D / 2 + s.db / 2, arc = s.ang * Math.PI / 180 * rax;
      const eps = s.db / (D + s.db), epsCap = s.db / (ASTM_PIN(s.db) + s.db);
      return { Dmin, D, ext, rax, arc, added: arc + ext, eps, epsCap, ok: D >= Dmin - 1e-6, crack: eps > epsCap * 1.02,
        seismic: s.kind === 'tie' && s.ang === 135, clause: s.kind === 'tie' ? 'جدول 25.3.2' : 'جدول 25.3.1' };
    },
    action(k, s, r) { if (k === 'min') s.dm = r.Dmin / s.db; },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, small = W < 620;
      const L0 = 12 * s.db + r.D + r.ext + 4 * s.db, sc = Math.min((small ? W * 0.9 : W * 0.55) / L0, (H * 0.8) / (r.D + r.ext + 6 * s.db));
      const cx = (small ? W * 0.3 : W * 0.3), cy = H * 0.3, R0 = r.rax * sc, lw = Math.max(4, s.db * sc);
      // المستقيم ثم القوس ثم الامتداد (محور y للأسفل)
      const a = s.ang * Math.PI / 180;
      const P = th => [cx + R0 * Math.cos(th), cy + R0 * Math.sin(th)];
      ctx.lineCap = 'round';
      const strainCol = lay.strain ? (r.crack ? C.bad : PL.seq(Math.min(1, r.eps / r.epsCap))) : '#b0b8c4';
      ctx.strokeStyle = '#b0b8c4'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(cx + 12 * s.db * sc, cy - R0); ctx.lineTo(cx, cy - R0); ctx.stroke();
      ctx.strokeStyle = strainCol; ctx.beginPath(); ctx.arc(cx, cy, R0, -Math.PI / 2, -Math.PI / 2 - a, true); ctx.stroke();
      const [qx, qy] = P(-Math.PI / 2 - a);
      // اتجاه الامتداد: مماس للقوس عند نهايته (باتجاه الدوران)
      const ang2 = -Math.PI / 2 - a, tdx = Math.sin(ang2), tdy = -Math.cos(ang2);
      ctx.strokeStyle = '#b0b8c4'; ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + tdx * r.ext * sc, qy + tdy * r.ext * sc); ctx.stroke();
      ctx.lineCap = 'butt';
      if (lay.pin) { ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, r.D / 2 * sc, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(148,163,184,.25)'; ctx.beginPath(); ctx.arc(cx, cy, r.D / 2 * sc, 0, 7); ctx.fill();
        T(ctx, `D = ${nf(r.D, 0)} مم`, cx, cy, { size: 11, bold: true }); }
      if (lay.dim) {
        T(ctx, `امتداد ${nf(r.ext, 0)} مم`, qx + tdx * r.ext * sc / 2 + 14, qy + tdy * r.ext * sc / 2, { align: 'left', color: C.acc, bold: true, bg: 'rgba(10,16,32,.7)' });
        T(ctx, `الحد الأدنى للثني ${nf(r.Dmin, 0)} مم (${nf(r.Dmin / s.db, 0)}db — ${r.clause})`, W / 2, H - 16, { color: r.ok ? C.ok : C.bad, bold: true });
      }
      if (lay.strain) {
        const box = small ? { x: 8, y: H * 0.62, w: W - 16, h: H * 0.28 } : { x: W * 0.6, y: 20, w: W * 0.38, h: H * 0.55 };
        const xs = [], ys = [];
        for (let k = 1; k <= 60; k++) { const m = 1 + 11 * k / 60; xs.push(m); ys.push(100 / (m + 1)); }
        PL.chart(ctx, box, { title: 'انفعال الألياف الخارجية % مقابل D/db', xs, x0: 1, x1: 12, y0: 0, y1: 50, ydec: 0, xdec: 0,
          series: [{ ys, color: C.tens }], vlines: [{ x: r.Dmin / s.db, color: C.ok, label: 'ACI' }, { x: ASTM_PIN(s.db) / s.db, color: C.warn, label: 'ASTM' }],
          marks: [{ x: s.dm, y: r.eps * 100, color: r.crack ? C.bad : '#fff', label: nf(r.eps * 100, 1) + '%' }] });
        if (r.crack) T(ctx, '⚠ الانفعال أكبر من قدرة اختبار الثني — تشققات دقيقة بظهر الثنية', W / 2, 18, { color: C.bad, bold: true, bg: 'rgba(10,16,32,.85)' });
      }
      if (lay.cut) T(ctx, `الطول المضاف للقطع = قوس ${nf(r.arc, 0)} + امتداد ${nf(r.ext, 0)} = ${nf(r.added, 0)} مم`, cx + 12 * s.db * sc / 2, cy - R0 - 22, { color: C.ok, bold: true, bg: 'rgba(10,16,32,.8)' });
    },
    kpis(s, r) {
      return [['قطر الثني الأدنى', nf(r.Dmin, 0) + ' مم'], ['المستعمل', nf(r.D, 0) + ' مم', r.ok ? 'ok' : 'bad'], ['الامتداد', nf(r.ext, 0) + ' مم'],
        ['انفعال الألياف', nf(r.eps * 100, 1) + '%', r.crack ? 'bad' : 'ok'], ['الطول المضاف', nf(r.added, 0) + ' مم']];
    },
    explain(s, r) {
      const see = `<ul class="pl-ul"><li>لما يلتفّ السيخ حول مسمار، الألياف الخارجية تتمدد بنسبة ≈ db/(D + db) — المسمار الصغير يعني تمدد كبير.</li>
        <li>ASTM A615 يختبر كل دفعة حديد بثنيها حول مسمار ${nf(ASTM_PIN(s.db) / s.db, 1)}db بلا تشقق؛ الكود يطلب أكبر (${nf(r.Dmin / s.db, 0)}db) للأمان وحتى ما تنسحق الخرسانة داخل الثنية.</li>
        <li>الثني بالمطرقة على حافة حادة = قطر ثني ~2db ⇒ تشققات دقيقة بظهر السيخ تضعفه — لازم مكينة ثني بمسمار صحيح.</li>
        <li>العكفة 135° للكانات الزلزالية: طرفها ينغرز داخل اللب فما ينفتح لما ينقشر الغطاء.</li></ul>`;
      const math = PL.steps([['الهندسة'], ['قطر الثني الأدنى', r.clause, nf(r.Dmin, 0) + ' مم'], ['نصف قطر المحور', 'r = D/2 + db/2', nf(r.rax, 1) + ' مم'],
        ['طول القوس', 'r·θ', nf(r.arc, 0) + ' مم'], ['الامتداد المستقيم', s.kind === 'tie' ? (s.ang === 90 ? 'max(6db,75) لـ ≤Ø16 وإلا 12db' : s.ang === 135 ? 'max(6db, 75)' : 'max(4db, 65)') : (s.ang === 90 ? '12db' : 'max(4db, 65)'), nf(r.ext, 0) + ' مم'],
        ['الانفعال'], ['الألياف الخارجية', 'ε = db / (D + db)', nf(r.eps * 100, 2) + '%'], ['قدرة اختبار ASTM', 'db / (Dpin + db)', nf(r.epsCap * 100, 2) + '%']]);
      const code = `<ul class="pl-ul"><li><b>25.3.1</b> العكفات القياسية للأسياخ: 90° بامتداد 12db و180° بامتداد max(4db ، 65)، وأقطار الثني 6db / 8db / 10db.</li>
        <li><b>25.3.2</b> الكانات والأتاري: 4db لـ ≤ Ø16 و6db لـ Ø19–Ø25.</li><li><b>25.3.4</b> العكفة الزلزالية 135° بامتداد max(6db ، 75).</li>
        <li><b>26.6.3.1</b> الثني على البارد إلا بإذن المهندس، وممنوع ثني الأسياخ المدفونة جزئياً بالخرسانة.</li><li>ASTM A615 §9: اختبار الثني.</li></ul>`;
      const tr = `<ol class="pl-ul"><li>اختر «ثني بالمطرقة»: الانفعال يتجاوز قدرة الاختبار ويظهر التحذير.</li><li>بدّل من Ø16 إلى Ø32: الحد الأدنى يقفز من 6db إلى 8db.</li><li>اختر كانة 135°: لاحظ الامتداد 75 مم والثني 4db.</li></ol>`;
      return { see, math, code, try: tr };
    }
  });

  /* ====================================================================
     ٣) الوصلات — نقل القوة من سيخ لسيخ
     ==================================================================== */
  PL.register({
    id: 'rb_lap', cat: 'rebar', ic: '🔗', name: 'الوصلات (التراكب)', sub: 'صنف A/B · مكانها · التدريج',
    title: 'شلون تنتقل القوة بين سيخين متراكبين؟',
    learn: 'القوة تعبر من السيخ الأول للثاني عبر «دعامات» خرسانية مائلة. شوف الجزيئات وهي تنتقل، وغيّر طول الوصلة والصنف ومكانها بالجسر: الوصلة القصيرة تفتح شقاً، ووصلة بمكان أقصى عزم خطرة.',
    ratio: 0.6, ratioSmall: 1.2, minH: 400, maxH: 620,
    defaults: { db: 16, fc: 25, top: 'n', ratioAs: 1.2, pct: 100, lap: 700, pos: 0.08, mode: 't' },
    presets: [{ name: 'صنف B اعتيادي', vals: { ratioAs: 1.2, pct: 100 } }, { name: 'صنف A (حديد مضاعف)', vals: { ratioAs: 2.1, pct: 50 } },
      { name: 'وصلة بمنتصف البحر (خطأ)', vals: { pos: 0.5, mode: 't' } }, { name: 'وصلة انضغاط (عمود)', vals: { mode: 'c' } }],
    controls: [
      { id: 'mode', type: 'select', label: 'نوع الوصلة', opts: [['t', 'شد (جسر)'], ['c', 'انضغاط (عمود)']] },
      { id: 'db', type: 'select', label: 'القطر', opts: SZ, onChange: s => { s.db = +s.db; } },
      { id: 'fc', label: "f'c", min: 20, max: 50, step: 1, unit: 'MPa' },
      { id: 'lap', label: 'طول الوصلة المنفّذ', min: 200, max: 2000, step: 10, unit: 'مم' },
      { id: 'ratioAs', label: 'As المنفّذ ÷ المطلوب', min: 1, max: 3, step: 0.05 },
      { id: 'pct', label: 'نسبة الأسياخ الموصولة بنفس المقطع', min: 25, max: 100, step: 25, unit: '%' },
      { id: 'top', type: 'select', label: 'الموقع', opts: [['n', 'سفلي'], ['y', 'علوي (ψt = 1.3)']] },
      { id: 'pos', label: 'مكان الوصلة على البحر (0 مسند … 0.5 منتصف)', min: 0, max: 0.5, step: 0.01 },
      { type: 'buttons', items: [['fit', '📏 الطول المطلوب']] }
    ],
    layers: [{ k: 'flow', name: 'جريان القوة', color: C.load, on: true }, { k: 'strut', name: 'الدعامات المائلة', color: C.comp, on: true },
      { k: 'stress', name: 'إجهاد السيخين', color: C.warn, on: true }, { k: 'where', name: 'المكان بالجسر', color: C.ok, on: true }],
    solve(s) {
      s.db = +s.db; const R = RB();
      if (s.mode === 'c') { const l = R.lapComp({ db: s.db, fc: s.fc, fy: 420 }); return { req: l.lap, cls: 'انضغاط', ld: R.ldc({ db: s.db, fc: s.fc, fy: 420 }).ldc, ok: s.lap >= l.lap - 1 }; }
      const L = R.lapTension({ db: s.db, fc: s.fc, fy: 420, cover: 40, top: s.top === 'y', provReq: s.ratioAs, pctSpliced: s.pct });
      const Mfrac = s.top === 'y' ? Math.max(0, 1 - 4 * s.pos) : Math.min(1, 4 * s.pos * (1 - s.pos) / 1);   // علوي: سالب قرب المسند · سفلي: موجب بالمنتصف
      return { req: L.lap, cls: L.cls, ld: L.ld, ok: s.lap >= L.lap - 1, Mfrac, badPlace: Mfrac > 0.75 };
    },
    action(k, s, r) { if (k === 'fit') s.lap = Math.ceil(r.req / 10) * 10; },
    animated: s => s._lay.flow,
    draw(ctx, W, H, s, r, t) {
      const lay = s._lay, small = W < 620, top = 50, hgt = small ? H * 0.34 : H * 0.42;
      const sc = (W - 120) / Math.max(2400, s.lap * 1.6), cx = W / 2, xa = cx - s.lap * sc / 2, xb = cx + s.lap * sc / 2;
      const y1 = top + hgt * 0.42, y2 = top + hgt * 0.58, dbp = Math.max(6, Math.min(16, s.db * 0.55));
      ctx.fillStyle = '#3b4a63'; ctx.fillRect(40, top, W - 80, hgt);
      ctx.fillStyle = '#b0b8c4'; ctx.fillRect(40, y1 - dbp / 2, xb - 40, dbp); ctx.fillRect(xa, y2 - dbp / 2, W - 40 - xa, dbp);
      T(ctx, 'السيخ ١', 70, y1 - dbp - 6, { size: 10, color: C.mut }); T(ctx, 'السيخ ٢', W - 70, y2 + dbp + 10, { size: 10, color: C.mut });
      PL.arrow(ctx, 60, y1, 18, y1, C.load, 3, 9); PL.arrow(ctx, W - 60, y2, W - 18, y2, C.load, 3, 9);
      if (lay.strut) { ctx.strokeStyle = 'rgba(96,165,250,.6)'; ctx.lineWidth = 1.4;
        for (let x = xa + 10; x < xb - 5; x += 16) { ctx.beginPath(); ctx.moveTo(x, y1 + dbp / 2); ctx.lineTo(x + (y2 - y1) * 0.9, y2 - dbp / 2); ctx.stroke(); } }
      if (lay.flow) { for (let k = 0; k < 30; k++) { const f = (t * 0.35 + k / 30) % 1, x = xa + f * (xb - xa), yy = y1 + (y2 - y1) * ((t * 1.3 + k * 0.37) % 1);
        ctx.fillStyle = 'rgba(244,114,182,.9)'; ctx.beginPath(); ctx.arc(x, yy, 2.4, 0, 7); ctx.fill(); } }
      if (!r.ok) { ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.2; for (let x = xa; x < xb; x += 20) { ctx.beginPath(); ctx.moveTo(x, top + 4); ctx.lineTo(x + 5, y1 - dbp); ctx.stroke(); }
        T(ctx, '✗ الوصلة أقصر من المطلوب — شقوق انفلاق فوق الوصلة', cx, top - 14, { color: C.bad, bold: true }); }
      else T(ctx, `✓ وصلة ${s.mode === 'c' ? 'انضغاط' : 'صنف ' + r.cls} كافية`, cx, top - 14, { color: C.ok, bold: true });
      ctx.strokeStyle = C.warn; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xa, top + hgt + 8); ctx.lineTo(xb, top + hgt + 8); ctx.stroke();
      T(ctx, `الوصلة ${nf(s.lap, 0)} مم · المطلوب ${nf(r.req, 0)} مم`, cx, top + hgt + 20, { color: C.warn, bold: true });
      if (lay.stress) {
        const y0 = top + hgt + 40, h2 = small ? H * 0.16 : H * 0.18;
        const X = x => 40 + x * (W - 80);
        const plotBar = (col, f) => { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
          for (let i = 0; i <= 100; i++) { const x = 40 + i / 100 * (W - 80), v = f(x); i ? ctx.lineTo(x, y0 + h2 - v * h2) : ctx.moveTo(x, y0 + h2 - v * h2); } ctx.stroke(); };
        plotBar(C.acc, x => x < xa ? 1 : x > xb ? 0 : (xb - x) / (xb - xa));
        plotBar(C.warn, x => x < xa ? 0 : x > xb ? 1 : (x - xa) / (xb - xa));
        T(ctx, 'إجهاد السيخ ١ (أزرق) يقل والسيخ ٢ (أصفر) يزيد على طول الوصلة', W - 44, y0 - 6, { align: 'right', size: 9.5, color: C.mut });
      }
      if (lay.where && s.mode === 't') {
        const y0 = small ? H * 0.84 : H * 0.84, bw = W - 80, x0 = 40;
        ctx.strokeStyle = '#475569'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + bw, y0); ctx.stroke();
        ctx.strokeStyle = C.bmd; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= 60; i++) { const q = i / 60, m = s.top === 'y' ? (q < 0.25 ? 1 - 4 * q : q > 0.75 ? 4 * q - 3 : 0) : 4 * q * (1 - q); ctx.lineTo(x0 + q * bw, y0 - m * 26 * (s.top === 'y' ? -1 : 1) * -1); }
        ctx.stroke();
        const xp = x0 + s.pos * bw; ctx.fillStyle = r.badPlace ? C.bad : C.ok; ctx.fillRect(xp - 12, y0 + 4, 24, 6); ctx.fillRect(x0 + bw - (xp - x0) - 12, y0 + 4, 24, 6);
        T(ctx, r.badPlace ? 'الوصلة بمنطقة أقصى إجهاد ✗ — انقلها' : 'مكان الوصلة بمنطقة إجهاد منخفض ✓', W / 2, y0 + 22, { color: r.badPlace ? C.bad : C.ok, bold: true });
      }
    },
    kpis(s, r) { return [['المطلوب', nf(r.req, 0) + ' مم'], ['الصنف', r.cls], ['ld', nf(r.ld, 0) + ' مم'], ['المنفّذ', nf(s.lap, 0) + ' مم', r.ok ? 'ok' : 'bad'], ['المكان', r.badPlace ? 'غير مناسب' : 'مناسب', r.badPlace ? 'bad' : 'ok']]; },
    explain(s, r) {
      const see = `<ul class="pl-ul"><li>السيخان ما يتلامسان بالقوة — القوة تعبر بينهما عبر الخرسانة بدعامات مائلة، لهذا لازم خرسانة جيدة وغطاء كافٍ حولهما.</li>
        <li>صنف B = 1.3·ld هو الأصل. صنف A = 1.0·ld يُسمح فقط إذا الحديد المنفّذ ≥ ضعف المطلوب <b>و</b> لا يوصل أكثر من نصف الأسياخ بنفس المكان.</li>
        <li>الحديد السفلي يوصل قرب المساند، والعلوي بمنتصف البحر — دائماً حيث الإجهاد أقل.</li></ul>`;
      const math = PL.steps([['الوصلة'], ['ld (بلا تخفيض)', '25.4.2.4', nf(r.ld, 0) + ' مم'], ['الصنف', 'A إذا As,prov/As,req ≥ 2 و ≤ 50% موصول', r.cls],
        ['الطول', s.mode === 'c' ? '0.071·fy·db ≥ 300' : 'A: 1.0·ld · B: 1.3·ld ≥ 300', nf(r.req, 0) + ' مم']]);
      const code = `<ul class="pl-ul"><li><b>25.5.2.1</b> جدول صنفي A و B للشد، و<b>25.5.1.1</b> ممنوع تراكب Ø > 36 بالشد.</li><li><b>25.5.5</b> وصلات الانضغاط، و<b>10.7.5</b> وصلات الأعمدة.</li>
        <li><b>25.5.1.3</b> الأسياخ المتراكبة غير المتلامسة بمسافة ≤ min(ℓst/5 ، 150).</li><li><b>18.6.3.3</b> بالإطارات الخاصة: لا وصلات ضمن 2h من وجه العمود ولا داخل العقدة.</li></ul>`;
      const tr = `<ol class="pl-ul"><li>اختر «صنف A» ثم ارفع النسبة الموصولة إلى 100%: يرجع صنف B.</li><li>حرّك مكان الوصلة السفلية للمنتصف: يصير أحمر.</li><li>اختر «علوي»: الطول يزيد 30%.</li></ol>`;
      return { see, math, code, try: tr };
    }
  });

  /* ====================================================================
     ٤) ترتيب الحديد ومرور الركام — الخلوص الأدنى
     ==================================================================== */
  function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
  PL.register({
    id: 'rb_fit', cat: 'rebar', ic: '🪨', name: 'ترتيب الحديد ومرور الركام', sub: 'الخلوص · الطبقات · التعشيش',
    title: 'ليش لازم مسافة بين الأسياخ؟',
    learn: 'اضغط «صبّ» وشوف حبات الركام وهي تنزل بين الأسياخ: إذا الفراغ أصغر من الحبة تعلق فوق الحديد ويبقى فراغ تحته (تعشيش) وما يتماسك الحديد. الكود يطلب خلوصاً ≥ max(25 ، db ، 4/3 الركام).',
    ratio: 0.62, ratioSmall: 1.15, minH: 400, maxH: 620,
    defaults: { b: 300, n: 5, db: 20, agg: 20, cov: 40, dt: 10 },
    presets: [{ name: 'مريح', vals: { n: 4, db: 16 } }, { name: 'مزدحم', vals: { n: 7, db: 25 } }, { name: 'ركام كبير 37.5', vals: { agg: 37.5, n: 5 } }],
    controls: [
      { id: 'b', label: 'عرض الجسر', min: 200, max: 700, step: 25, unit: 'مم' },
      { id: 'n', label: 'عدد الأسياخ بالطبقة', min: 2, max: 10, step: 1 },
      { id: 'db', type: 'select', label: 'القطر', opts: SZ, onChange: s => { s.db = +s.db; } },
      { id: 'agg', type: 'select', label: 'أكبر مقاس للركام', opts: [[10, '10 مم'], [20, '20 مم'], [25, '25 مم'], [37.5, '37.5 مم']], onChange: s => { s.agg = +s.agg; } },
      { id: 'cov', label: 'الغطاء', min: 20, max: 75, step: 5, unit: 'مم' },
      { id: 'dt', type: 'select', label: 'قطر الكانة', opts: [[8, 'Ø8'], [10, 'Ø10'], [12, 'Ø12']], onChange: s => { s.dt = +s.dt; } },
      { type: 'buttons', items: [['pour', '🪣 صبّ الخرسانة', ''], ['best', '✓ أكثر عدد مسموح']] }
    ],
    layers: [{ k: 'agg', name: 'الركام', color: '#a8a29e', on: true }, { k: 'dim', name: 'الخلوص', color: C.ok, on: true }, { k: 'void', name: 'التعشيش', color: C.bad, on: true }],
    solve(s) {
      s.db = +s.db; s.agg = +s.agg; s.dt = +s.dt;
      const R = RB(), f = R.fit(s.b, s.cov, s.dt, s.n, s.db, s.agg, 'beam');
      return Object.assign(f, { smax: R.sMaxCrack(420, s.cov + s.dt), sc: s.n > 1 ? (s.b - 2 * s.cov - 2 * s.dt - s.db) / (s.n - 1) : 0 });
    },
    init(s) { s._pt = -1; },
    onPreset(s) { s._pt = -1; },
    action(k, s, r) { if (k === 'pour') { s._pt = 0; } if (k === 'best') { s.n = r.nMax; s._pt = -1; } },
    tick(dt, s) { if (s._pt < 0 || s._pt > 6) return false; s._pt += dt; return true; },
    draw(ctx, W, H, s, r, t) {
      const lay = s._lay, sc = Math.min((W - 60) / s.b, (H - 80) / 260), x0 = (W - s.b * sc) / 2, y0 = 40, hh = 240 * sc;
      ctx.fillStyle = '#1e293b'; ctx.fillRect(x0, y0, s.b * sc, hh); ctx.strokeStyle = '#94a3b8'; ctx.strokeRect(x0, y0, s.b * sc, hh);
      const yBar = y0 + hh - (s.cov + s.dt + s.db / 2) * sc, xs = [];
      for (let i = 0; i < s.n; i++) xs.push(x0 + (s.cov + s.dt + s.db / 2 + (s.n === 1 ? 0 : i * (s.b - 2 * s.cov - 2 * s.dt - s.db) / (s.n - 1))) * sc);
      ctx.strokeStyle = C.steel; ctx.lineWidth = Math.max(1.5, s.dt * sc); ctx.strokeRect(x0 + (s.cov + s.dt / 2) * sc, y0 + (s.cov + s.dt / 2) * sc, (s.b - 2 * s.cov - s.dt) * sc, hh - (2 * s.cov + s.dt) * sc);
      // الركام المتساقط
      const g = rng(11), N = 140, pt = s._pt < 0 ? 99 : s._pt, gapPx = r.clear * sc;
      let blocked = 0;
      if (lay.agg) for (let i = 0; i < N; i++) {
        const size = s.agg * (0.45 + 0.55 * g()) * sc, xr = x0 + (s.cov + s.dt) * sc + g() * (s.b - 2 * s.cov - 2 * s.dt) * sc, delay = g() * 3.5;
        const fall = Math.max(0, pt - delay) * 260;
        let y = y0 + 10 + fall;
        // هل يمر بين سيخين؟
        const k = xs.findIndex((xb, j) => j < xs.length - 1 && xr > xb && xr < xs[j + 1]);
        const room = k >= 0 ? (xs[k + 1] - xs[k]) - s.db * sc : 999;
        const jam = size * 4 / 3 > room;                          // الحبة تحتاج ≥ 4/3 حجمها لتمرّ بثبات
        const stop = jam ? yBar - s.db * sc / 2 - size / 2 : y0 + hh - size / 2 - (s.cov * .2) * sc;
        if (y > stop) { y = stop; if (jam) blocked++; }
        ctx.fillStyle = jam && y === stop ? 'rgba(248,113,113,.85)' : 'rgba(168,162,158,.9)';
        ctx.beginPath(); ctx.arc(xr, y, size / 2, 0, 7); ctx.fill();
      }
      xs.forEach(x => { ctx.fillStyle = '#b0b8c4'; ctx.beginPath(); ctx.arc(x, yBar, s.db * sc / 2, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = .6; ctx.stroke(); });
      if (lay.void && !r.ok && pt > 3) { ctx.fillStyle = 'rgba(248,113,113,.18)'; ctx.fillRect(x0 + 2, yBar + s.db * sc / 2, s.b * sc - 4, (s.cov + s.dt) * sc - 2);
        T(ctx, 'تعشيش تحت الأسياخ ✗', W / 2, yBar + (s.cov + s.dt) * sc / 2 + s.db * sc / 2, { color: C.bad, bold: true, bg: 'rgba(10,16,32,.8)' }); }
      if (lay.dim && s.n > 1) { const a = xs[0] + s.db * sc / 2, b2 = xs[1] - s.db * sc / 2; ctx.strokeStyle = r.ok ? C.ok : C.bad; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a, yBar - 26); ctx.lineTo(b2, yBar - 26); ctx.stroke();
        T(ctx, `خلوص ${nf(r.clear, 1)} مم ${r.ok ? '≥' : '<'} ${nf(r.need, 1)}`, (a + b2) / 2, yBar - 38, { color: r.ok ? C.ok : C.bad, bold: true, bg: 'rgba(10,16,32,.8)' }); }
      T(ctx, `أقصى عدد بطبقة واحدة: ${r.nMax} أسياخ Ø${s.db}`, W / 2, H - 14, { color: C.acc, bold: true });
    },
    kpis(s, r) { return [['الخلوص', nf(r.clear, 1) + ' مم', r.ok ? 'ok' : 'bad'], ['المطلوب', nf(r.need, 1) + ' مم'], ['أقصى عدد', r.nMax + ' أسياخ'],
      ['تباعد المراكز', nf(r.sc, 0) + ' مم'], ['حد التشقق', nf(r.smax, 0) + ' مم', r.sc <= r.smax ? 'ok' : 'warn']]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>الخرسانة لازم تحيط بكل سيخ من كل الجهات حتى يتماسك. إذا الفراغ بين سيخين أصغر من أكبر حبة ركام، الحبات تعلق فوق الحديد وتبقى تحته فجوات.</li>
        <li>الحل إذا ما يكفي العرض: طبقة ثانية (بخلوص ≥ 25 مم وفوق الأسياخ السفلى مباشرة)، أو قطر أكبر بعدد أقل، أو حزم الأسياخ (25.6).</li></ul>`,
        math: PL.steps([['الخلوص'], ['المتاح داخل الكانة', 'b − 2·غطاء − 2·dt', nf(r.avail, 0) + ' مم'], ['الخلوص الفعلي', '(المتاح − n·db)/(n − 1)', nf(r.clear, 1) + ' مم'],
          ['المطلوب', 'max(25 ، db ، 4/3·dagg)', nf(r.need, 1) + ' مم'], ['أقصى عدد', 'floor((المتاح + خلوص)/(db + خلوص))', r.nMax]]),
        code: `<ul class="pl-ul"><li><b>25.2.1</b> الخلوص الأدنى بين الأسياخ المتوازية بالطبقة، و<b>25.2.2</b> بين الطبقات ≥ 25 مم.</li><li><b>25.2.3</b> الأعمدة: max(40 ، 1.5db ، 4/3 الركام).</li>
          <li><b>26.4.2.1</b> مقاس الركام الأقصى ≤ ¾ الخلوص بين الأسياخ.</li><li><b>24.3.2</b> التباعد الأقصى للتحكم بالتشقق.</li></ul>`,
        try: `<ol class="pl-ul"><li>اختر «مزدحم» واضغط «صبّ»: الحبات الحمراء عالقة.</li><li>اضغط «أكثر عدد مسموح» وصبّ من جديد.</li><li>بدّل الركام إلى 10 مم: يتسع المجال لكن الخرسانة تحتاج إسمنت أكثر.</li></ol>` };
    }
  });

  /* ====================================================================
     ٥) التطويق والأتاري — نموذج ماندر (1988)
     ==================================================================== */
  PL.calc.mander = function (o) {                                   // o: b (=h) mm, cover, nb per side, db, dt, s, cross, fc, fyh
    const bc = o.b - 2 * o.cover - o.dt, dc = bc;                   // أبعاد اللب لمحور الطوق
    const As1 = Math.PI * o.dt * o.dt / 4, nLeg = o.cross ? o.nb : 2;
    const rho = nLeg * As1 / (o.s * bc);                            // لكل اتجاه
    const nTot = 4 * (o.nb - 1), Ast = nTot * Math.PI * o.db * o.db / 4, rcc = Ast / (bc * dc);
    // الفراغات بين الأسياخ المسنودة
    const nSup = o.cross ? o.nb : 2, w = (bc - o.db) / (nSup - 1) - o.db;
    const sumw2 = 4 * (nSup - 1) * w * w;
    const sp = o.s - o.dt;
    const ke = Math.max(0, (1 - sumw2 / (6 * bc * dc)) * (1 - sp / (2 * bc)) * (1 - sp / (2 * dc)) / (1 - rcc));
    const fl = ke * rho * o.fyh;
    const k = fl / o.fc, fcc = o.fc * (-1.254 + 2.254 * Math.sqrt(1 + 7.94 * k) - 2 * k);
    const ecc = 0.002 * (1 + 5 * (fcc / o.fc - 1));
    const rs = 2 * rho, ecu = 0.004 + 1.4 * rs * o.fyh * 0.09 / fcc;  // εsu ≈ 0.09 (Grade 420)
    return { bc, rho, ke, fl, fcc, ecc, ecu, w, nSup, rcc, ratio: fcc / o.fc };
  };
  const popo = (fcc, ecc, e, Ec) => { const rr = Ec / (Ec - fcc / ecc), x = e / ecc; return fcc * x * rr / (rr - 1 + Math.pow(x, rr)); };   // Popovics عبر ماندر
  const manderCurve = (fc, fcc, ecc, ecu, Ec) => {
    const xs = [], ys = [], yu = [];
    for (let i = 0; i <= 80; i++) { const e = ecu * 1.05 * i / 80; xs.push(e * 1000); ys.push(popo(fcc, ecc, e, Ec)); yu.push(e <= 0.004 ? popo(fc, 0.002, e, Ec) : NaN); }
    return { xs, ys, yu };
  };
  PL.register({
    id: 'rb_conf', cat: 'rebar', ic: '⛓️', name: 'التطويق والأتاري', sub: 'ماندر · 25.7.2.3 · انبعاج السيخ',
    title: 'ليش الأطواق المتقاربة تخلّي العمود أقوى وأمطل؟',
    learn: 'الطوق يحبس الخرسانة فتقاوم أكثر وتنضغط أكثر قبل ما تنهار. شوف المناطق غير المطوّقة (الأقواس) بين الأسياخ المسنودة بالمقطع وبين الأطواق بالارتفاع، وكيف يغيّرها الأتاري الداخلي والتباعد. نموذج Mander 1988.',
    ratio: 0.58, ratioSmall: 1.3, minH: 420, maxH: 620,
    defaults: { b: 500, nb: 4, db: 20, dt: 10, s: 150, cross: 'y', fc: 28, cov: 40, P: 50 },
    presets: [{ name: 'بلا أتاري داخلي', vals: { cross: 'n' } }, { name: 'تطويق زلزالي', vals: { s: 100, dt: 12, cross: 'y' } }, { name: 'تباعد كبير', vals: { s: 300, cross: 'n' } }],
    controls: [
      { id: 'b', label: 'ضلع العمود', min: 300, max: 900, step: 25, unit: 'مم' },
      { id: 'nb', label: 'أسياخ بكل وجه', min: 2, max: 6, step: 1 },
      { id: 'db', type: 'select', label: 'القطر الطولي', opts: SZ, onChange: s => { s.db = +s.db; } },
      { id: 'dt', type: 'select', label: 'قطر الطوق', opts: [[8, 'Ø8'], [10, 'Ø10'], [12, 'Ø12'], [16, 'Ø16']], onChange: s => { s.dt = +s.dt; } },
      { id: 's', label: 'تباعد الأطواق', min: 50, max: 400, step: 5, unit: 'مم' },
      { id: 'cross', type: 'select', label: 'أتاري داخلي', opts: [['y', 'نعم — كل سيخ مسنود'], ['n', 'لا — الأركان فقط']] },
      { id: 'fc', label: "f'c", min: 20, max: 50, step: 1, unit: 'MPa' },
      { id: 'P', label: 'مستوى الحمل المحوري', min: 0, max: 100, step: 1, unit: '% من Po' }
    ],
    layers: [{ k: 'arch', name: 'الأقواس (غير مطوّق)', color: C.bad, on: true }, { k: 'rule', name: 'قاعدة 150 مم', color: C.warn, on: true },
      { k: 'buck', name: 'انبعاج السيخ', color: C.tens, on: true }, { k: 'curve', name: 'منحنى الإجهاد-الانفعال', color: C.acc, on: true }],
    solve(s) {
      s.db = +s.db; s.dt = +s.dt;
      const m = PL.calc.mander({ b: s.b, cover: s.cov, nb: s.nb, db: s.db, dt: s.dt, s: s.s, cross: s.cross === 'y', fc: s.fc, fyh: 420 });
      const R = RB(), clearGap = (s.b - 2 * s.cov - 2 * s.dt - s.nb * s.db) / (s.nb - 1);
      const rule150 = s.cross === 'y' || (s.nb <= 2) || (clearGap <= 150 && s.nb === 3);
      const sb = R.tieS(s.db, s.dt, s.b, s.b).s, buck = s.s > 6 * s.db;
      return Object.assign(m, { clearGap, rule150, sb, buck, okS: s.s <= sb, curveC: manderCurve(s.fc, m.fcc, m.ecc, m.ecu, 5000 * Math.sqrt(s.fc)) });
    },
    animated: s => s._lay.buck,
    draw(ctx, W, H, s, r, t) {
      const lay = s._lay, small = W < 620;
      const side = small ? Math.min(W * 0.46, H * 0.4) : Math.min(W * 0.3, H * 0.8), sc = side / s.b, x0 = 20, y0 = 30;
      ctx.fillStyle = '#3b4a63'; ctx.fillRect(x0, y0, side, side);
      const c0 = (s.cov + s.dt / 2) * sc, ci = side - 2 * c0;
      ctx.strokeStyle = C.steel; ctx.lineWidth = Math.max(1.5, s.dt * sc); ctx.strokeRect(x0 + c0, y0 + c0, ci, ci);
      const off = (s.cov + s.dt + s.db / 2) * sc, pos = k => off + (side - 2 * off) * k / (s.nb - 1);
      const supported = k => s.cross === 'y' || k === 0 || k === s.nb - 1;
      if (s.cross === 'y') for (let k = 1; k < s.nb - 1; k++) { ctx.lineWidth = Math.max(1, s.dt * sc * 0.8);
        ctx.beginPath(); ctx.moveTo(x0 + pos(k), y0 + c0); ctx.lineTo(x0 + pos(k), y0 + side - c0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0 + c0, y0 + pos(k)); ctx.lineTo(x0 + side - c0, y0 + pos(k)); ctx.stroke(); }
      if (lay.arch) {                                                  // أقواس قطع مكافئ بزاوية 45° بين الأسياخ المسنودة
        ctx.fillStyle = 'rgba(248,113,113,.3)';
        const sup = []; for (let k = 0; k < s.nb; k++) if (supported(k)) sup.push(pos(k));
        const edge = (fn) => { for (let i = 0; i < sup.length - 1; i++) { const a = sup[i], b = sup[i + 1], w = b - a;
          ctx.beginPath(); for (let q = 0; q <= 20; q++) { const u = a + w * q / 20, d = (w / 4) * 4 * (q / 20) * (1 - q / 20); const [X, Y] = fn(u, d); q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.closePath(); ctx.fill(); } };
        edge((u, d) => [x0 + u, y0 + off + d]); edge((u, d) => [x0 + u, y0 + side - off - d]); edge((u, d) => [x0 + off + d, y0 + u]); edge((u, d) => [x0 + side - off - d, y0 + u]);
      }
      for (let k = 0; k < s.nb; k++) for (const [a, b] of [[k, 0], [k, s.nb - 1], [0, k], [s.nb - 1, k]]) {
        const sup2 = supported(a) && supported(b) || ((a === 0 || a === s.nb - 1) && (b === 0 || b === s.nb - 1));
        const isSup = (a === 0 || a === s.nb - 1) && (b === 0 || b === s.nb - 1) ? true : s.cross === 'y';
        ctx.fillStyle = isSup ? '#e5e7eb' : (lay.rule && !r.rule150 ? C.bad : '#9ca3af');
        ctx.beginPath(); ctx.arc(x0 + pos(a), y0 + pos(b), Math.max(2.5, s.db * sc / 2), 0, 7); ctx.fill();
      }
      T(ctx, `ke = ${nf(r.ke, 2)} (نسبة اللب المطوّق فعلاً)`, x0 + side / 2, y0 + side + 14, { size: 10.5, bold: true, color: C.acc });
      if (lay.rule && !r.rule150) T(ctx, '✗ سيخ غير مسنود أبعد من 150 مم — 25.7.2.3', x0 + side / 2, y0 + side + 32, { size: 10, color: C.bad, bold: true });
      // الارتفاع: أسياخ وأطواق
      const ex = small ? W * 0.58 : x0 + side + 60, eh = small ? H * 0.4 : H - 70, ew = 60;
      const Ls = 900, esc = eh / Ls;
      ctx.fillStyle = '#3b4a63'; ctx.fillRect(ex, y0, ew, eh);
      const P = s.P / 100, bulge = lay.buck && r.buck ? P * Math.min(10, (s.s / (6 * s.db) - 1) * 10) * (0.8 + 0.2 * Math.sin(t * 6)) : 0;
      for (let y = 0; y <= Ls; y += s.s) { ctx.strokeStyle = C.steel; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - 4, y0 + y * esc); ctx.lineTo(ex + ew + 4, y0 + y * esc); ctx.stroke(); }
      [ex + 6, ex + ew - 6].forEach((bx, k) => { ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3; ctx.beginPath();
        for (let y = 0; y <= Ls; y += 5) { const ph = (y % s.s) / s.s, dx = bulge * Math.sin(Math.PI * ph) * (k ? 1 : -1); y ? ctx.lineTo(bx + dx, y0 + y * esc) : ctx.moveTo(bx + dx, y0 + y * esc); } ctx.stroke(); });
      T(ctx, r.buck ? `s = ${s.s} > 6db = ${6 * s.db} ⇒ السيخ ينبعج بين الأطواق` : `s ≤ 6db ✓`, ex + ew / 2, y0 + eh + 14, { size: 10, color: r.buck ? C.bad : C.ok, bold: true });
      if (lay.curve) {
        const box = small ? { x: 8, y: H * 0.64, w: W - 16, h: H * 0.34 } : { x: W * 0.55, y: 12, w: W * 0.43, h: H * 0.7 };
        PL.chart(ctx, box, { title: 'إجهاد الخرسانة (MPa) مقابل الانفعال (‰)', xs: r.curveC.xs, x0: 0, x1: Math.max(r.curveC.xs[r.curveC.xs.length - 1], 4.5), y0: 0, xdec: 1,
          series: [{ ys: r.curveC.ys, color: C.acc }, { ys: r.curveC.yu, color: '#94a3b8', dash: [5, 4] }], xl: '‰',
          marks: [{ x: r.ecc * 1000, y: r.fcc, color: C.acc, label: `f'cc = ${nf(r.fcc, 1)}` }] });
        T(ctx, 'رمادي = غير مطوّق · أزرق = مطوّق', box.x + box.w - 8, box.y + box.h - 30, { align: 'right', size: 9.5, color: C.mut });
      }
    },
    kpis(s, r) { return [['ke', nf(r.ke, 2)], ['f\'cc / f\'c', nf(r.ratio, 2), r.ratio > 1.2 ? 'ok' : ''], ['εcu المطوّق', nf(r.ecu * 1000, 1) + '‰'],
      ['تباعد 25.7.2.1', '≤ ' + nf(r.sb, 0), r.okS ? 'ok' : 'bad'], ['25.7.2.3', r.rule150 ? 'مطابق' : 'مخالف', r.rule150 ? 'ok' : 'bad']]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>لما تنضغط الخرسانة تنتفخ جانبياً؛ الطوق يمنع الانتفاخ فيضغطها للداخل ⇒ تتحمل أكثر (${nf(r.ratio, 2)}×) وتنضغط لانفعال أكبر (${nf(r.ecu * 1000, 1)}‰ بدل 3‰) = مطيلية.</li>
        <li>الطوق يحصر الخرسانة بشكل أقواس بين نقاط الإسناد: كل ما قلّ عدد الأسياخ المسنودة أو زاد التباعد، زادت المساحة الحمراء غير المحصورة.</li>
        <li>الطوق كمان يمنع السيخ الطولي من الانبعاج للخارج بعد انقشار الغطاء — لهذا التباعد ≤ 6db بالمناطق الزلزالية.</li></ul>`,
        math: PL.steps([['ماندر (1988)'], ['نسبة الحديد العرضي', 'ρ = n·Ab/(s·bc)', nf(r.rho * 100, 2) + '%'],
          ['معامل الفعالية', 'ke = (1 − Σw²/6bc·dc)(1 − s′/2bc)(1 − s′/2dc)/(1 − ρcc)', nf(r.ke, 3)],
          ['الضغط الجانبي الفعّال', "f′l = ke·ρ·fyh", nf(r.fl, 2) + ' MPa'],
          ["المقاومة المطوّقة", "f′cc = f′c(−1.254 + 2.254√(1 + 7.94f′l/f′c) − 2f′l/f′c)", nf(r.fcc, 1) + ' MPa'],
          ['الانفعال الأقصى', 'εcu = 0.004 + 1.4ρs·fyh·εsu/f′cc', nf(r.ecu * 1000, 2) + '‰']]),
        code: `<ul class="pl-ul"><li><b>25.7.2.1</b> التباعد ≤ min(16db ، 48dt ، أصغر بُعد)، و<b>25.7.2.2</b> قطر الطوق.</li><li><b>25.7.2.3</b> كل سيخ ركني وبديل مسنود بزاوية طوق ≤ 135°، ولا سيخ حر أبعد من 150 مم خلوصاً.</li>
          <li><b>18.7.5.2–3</b> الإطارات الخاصة: hx ≤ 350 مم، so ≤ min(b/4 ، 6db ، sx)، و<b>18.7.5.4</b> Ash الأدنى.</li><li>Mander, Priestley & Park (1988) للنموذج المطوّق.</li></ul>`,
        try: `<ol class="pl-ul"><li>اختر «بلا أتاري داخلي»: الأقواس تكبر وke ينزل و f'cc يقل.</li><li>اختر «تباعد كبير» وارفع الحمل: السيخ ينبعج بين الأطواق.</li><li>اختر «تطويق زلزالي»: المنحنى الأزرق يطول لليمين = مطيلية.</li></ol>` };
    }
  });

  /* ====================================================================
     ٦) قطع الحديد — مخطط المقاومة فوق مخطط العزم (9.7.3)
     ==================================================================== */
  PL.register({
    id: 'rb_cut', cat: 'rebar', ic: '✂️', name: 'قطع الحديد وتمديده', sub: 'مخطط المواد · d أو 12db · ld',
    title: 'وين نكدر نقطع جزء من الحديد السفلي؟',
    learn: 'العزم يقل من المنتصف للمساند، فمو لازم كل الأسياخ تمتد للآخر. الخط الأخضر الدرجي هو مقاومة الأسياخ الباقية (φMn): اقطع السيخ حيث تكفي الباقية، ثم مدّه d أو 12db (الأكبر) — وتأكد إنه أطول من ld من نقطة أقصى إجهاد.',
    ratio: 0.58, ratioSmall: 1.15, minH: 400, maxH: 600,
    defaults: { L: 7, w: 45, n: 5, cut: 2, db: 20, b: 300, h: 600, fc: 28, sup: 'ss' },
    presets: [{ name: 'بسيط الإسناد', vals: { sup: 'ss' } }, { name: 'مثبّت الطرفين', vals: { sup: 'ff' } }, { name: 'بلا قطع', vals: { cut: 0 } }],
    controls: [
      { id: 'sup', type: 'select', label: 'الإسناد', opts: [['ss', 'بسيط'], ['ff', 'مثبّت الطرفين']] },
      { id: 'L', label: 'البحر', min: 3, max: 12, step: 0.1, unit: 'م' },
      { id: 'w', label: 'الحمل المصعّد', min: 10, max: 120, step: 1, unit: 'kN/م' },
      { id: 'n', label: 'عدد الأسياخ السفلية', min: 2, max: 8, step: 1 },
      { id: 'cut', label: 'عدد الأسياخ المقطوعة', min: 0, max: 6, step: 1, onChange: s => { s.cut = Math.min(s.cut, s.n - 2); } },
      { id: 'db', type: 'select', label: 'القطر', opts: SZ, onChange: s => { s.db = +s.db; } },
      { id: 'h', label: 'العمق h', min: 300, max: 1000, step: 25, unit: 'مم' },
      { id: 'fc', label: "f'c", min: 20, max: 50, step: 1, unit: 'MPa' }
    ],
    layers: [{ k: 'mom', name: 'مخطط العزم Mu', color: C.bmd, on: true }, { k: 'cap', name: 'مقاومة الأسياخ φMn', color: C.ok, on: true },
      { k: 'bars', name: 'الأسياخ بالجسر', color: C.steel, on: true }, { k: 'ext', name: 'التمديد والطول ld', color: C.warn, on: true }],
    solve(s) {
      s.db = +s.db; s.cut = Math.max(0, Math.min(s.cut, s.n - 2));
      const R = RB(), d = s.h - 60, Ab = Math.PI * s.db ** 2 / 4, fy = 420;
      const phiMn = n => { const As = n * Ab, a = As * fy / (0.85 * s.fc * s.b); return 0.9 * As * fy * (d - a / 2) / 1e6; };
      const M = x => s.sup === 'ss' ? s.w * x * (s.L - x) / 2 : s.w / 12 * (6 * s.L * x - 6 * x * x - s.L * s.L);
      const Mmax = s.sup === 'ss' ? s.w * s.L * s.L / 8 : s.w * s.L * s.L / 24;
      const full = phiMn(s.n), rem = phiMn(s.n - s.cut);
      // نقطة القطع النظرية: حيث M(x) = φMn(الباقي) — من اليسار
      let xth = null; for (let i = 0; i <= 400; i++) { const x = s.L / 2 * i / 400; if (M(x) >= rem) { xth = x; break; } }
      const ext = Math.max(d, 12 * s.db) / 1000, ld = R.ld({ db: s.db, fc: s.fc, fy, cover: 40 }).ld / 1000;
      const xcut = xth === null ? null : Math.max(0, xth - ext);
      const len = xcut === null ? null : s.L / 2 - xcut;              // من المنتصف (أقصى إجهاد) إلى نقطة القطع
      return { d, full, rem, Mmax, xth, xcut, ext, ld, okLd: len === null || len >= ld, okM: full >= Mmax, M, save: xcut === null ? 0 : 2 * xcut * s.cut * 0.00617 * s.db * s.db };
    },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, mx = 40, X = x => mx + x / s.L * (W - 2 * mx);
      const y0 = 40, bh = 60, yM = y0 + bh + 40, hM = H - yM - 30;
      ctx.fillStyle = '#3b4a63'; ctx.fillRect(X(0), y0, X(s.L) - X(0), bh);
      [0, s.L].forEach(x => { ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.moveTo(X(x), y0 + bh); ctx.lineTo(X(x) - 9, y0 + bh + 14); ctx.lineTo(X(x) + 9, y0 + bh + 14); ctx.fill(); });
      if (lay.bars) {
        for (let i = 0; i < s.n; i++) { const cutb = i >= s.n - s.cut, a = cutb && r.xcut !== null ? r.xcut : 0.05, b = cutb && r.xcut !== null ? s.L - r.xcut : s.L - 0.05, y = y0 + bh - 8 - i * 4;
          ctx.strokeStyle = cutb ? '#fb923c' : C.steel; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(X(a), y); ctx.lineTo(X(b), y); ctx.stroke(); }
        T(ctx, `${s.n - s.cut} أسياخ مستمرة (أصفر) + ${s.cut} مقطوعة (برتقالي)`, W / 2, y0 - 12, { size: 10.5, bold: true });
      }
      const Mtop = Math.max(r.Mmax, r.full) * 1.1, sy = hM / Mtop, YM = m => yM + m * sy;
      if (lay.mom) { ctx.fillStyle = 'rgba(251,146,60,.25)'; ctx.strokeStyle = C.bmd; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), yM);
        for (let i = 0; i <= 80; i++) { const x = s.L * i / 80; ctx.lineTo(X(x), YM(Math.max(0, r.M(x)))); } ctx.lineTo(X(s.L), yM); ctx.closePath(); ctx.fill(); ctx.stroke();
        T(ctx, `Mu,max = ${nf(r.Mmax, 1)} kN·m`, X(s.L / 2), YM(r.Mmax) + 14, { color: C.bmd, bold: true }); }
      if (lay.cap) {
        ctx.strokeStyle = C.ok; ctx.lineWidth = 2.4; ctx.beginPath();
        if (r.xcut !== null && s.cut) { ctx.moveTo(X(0), YM(r.rem)); ctx.lineTo(X(r.xcut), YM(r.rem)); ctx.lineTo(X(r.xcut + r.ld), YM(r.full)); ctx.lineTo(X(s.L - r.xcut - r.ld), YM(r.full)); ctx.lineTo(X(s.L - r.xcut), YM(r.rem)); ctx.lineTo(X(s.L), YM(r.rem)); }
        else { ctx.moveTo(X(0), YM(r.full)); ctx.lineTo(X(s.L), YM(r.full)); }
        ctx.stroke();
        T(ctx, `φMn (كل الأسياخ) = ${nf(r.full, 0)}`, X(s.L) - 4, YM(r.full) + 12, { align: 'right', size: 10, color: C.ok });
        if (s.cut) T(ctx, `φMn (الباقية) = ${nf(r.rem, 0)}`, X(0) + 4, YM(r.rem) + 12, { align: 'left', size: 10, color: C.ok });
        if (!r.okM) T(ctx, '✗ φMn < Mu — زد الحديد', W / 2, yM - 10, { color: C.bad, bold: true });
      }
      if (lay.ext && r.xth !== null && s.cut) {
        [r.xth, s.L - r.xth].forEach(x => { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(x), y0); ctx.lineTo(X(x), YM(r.rem)); ctx.stroke(); ctx.setLineDash([]); });
        [r.xcut, s.L - r.xcut].forEach(x => { ctx.strokeStyle = C.warn; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(x), y0 - 4); ctx.lineTo(X(x), y0 + bh + 4); ctx.stroke(); });
        T(ctx, `قطع نظري ← تمديد max(d,12db) = ${nf(r.ext * 1000, 0)} مم`, X(r.xcut), y0 + bh + 26, { align: 'left', size: 9.5, color: C.warn });
        T(ctx, r.okLd ? `ld = ${nf(r.ld * 1000, 0)} مم من المنتصف ✓` : `✗ الطول من نقطة أقصى إجهاد < ld (${nf(r.ld * 1000, 0)})`, W / 2, y0 + bh + 44, { size: 10, color: r.okLd ? C.ok : C.bad, bold: true });
      }
    },
    kpis(s, r) { return [['Mu الأقصى', nf(r.Mmax, 1) + ' kN·m'], ['φMn كامل', nf(r.full, 1), r.okM ? 'ok' : 'bad'], ['φMn الباقي', nf(r.rem, 1)],
      ['نقطة القطع', r.xcut === null || !s.cut ? '—' : nf(r.xcut, 2) + ' م من المسند'], ['التوفير', nf(r.save, 1) + ' كغم', r.save > 0 ? 'ok' : '']]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>الخط الأخضر «مخطط المقاومة»: كل ما قطعنا سيخاً تنزل درجة. لازم يبقى الأخضر فوق البرتقالي (العزم) بكل مكان.</li>
        <li>بعد النقطة النظرية نمدّ السيخ d أو 12db لأن العزم الحقيقي يتزحزح بسبب الشقوق المائلة بالقص (Tension shift).</li>
        <li>والسيخ اللي نقطعه لازم ياخذ ld من نقطة أقصى إجهاد حتى يوصل لقوته هناك.</li></ul>`,
        math: PL.steps([['المقاومة'], ['φMn للأسياخ كلها', 'φ·As·fy(d − a/2)', nf(r.full, 1) + ' kN·m'], ['φMn للباقي', '', nf(r.rem, 1) + ' kN·m'],
          ['القطع'], ['النظري', 'M(x) = φMn(الباقي)', r.xth === null ? '—' : nf(r.xth, 3) + ' م'], ['التمديد', 'max(d ، 12db)', nf(r.ext * 1000, 0) + ' مم'],
          ['الفعلي', 'النظري − التمديد', r.xcut === null ? '—' : nf(r.xcut, 3) + ' م'], ['طول النشر', 'ld (25.4.2.4)', nf(r.ld * 1000, 0) + ' مم']]),
        code: `<ul class="pl-ul"><li><b>9.7.3.3</b> التمديد بعد النقطة النظرية ≥ max(d ، 12db) (إلا عند المساند البسيطة وطرف الكابولي).</li><li><b>9.7.3.4</b> الأسياخ المستمرة تمتد ≥ ld بعد نقطة قطع الأسياخ الأخرى.</li>
          <li><b>9.7.3.5</b> القطع بمنطقة الشد ممنوع إلا بشرط من ثلاثة (Vu ≤ ⅔φVn ، أو أساور إضافية ، أو الباقي ضعف المطلوب).</li><li><b>9.7.3.8.1</b> ثلث الحديد الموجب يمتد للمسند البسيط ≥ 150 مم.</li></ul>`,
        try: `<ol class="pl-ul"><li>ارفع عدد المقطوعة إلى 3: نقطة القطع تقرب من المنتصف.</li><li>بدّل إلى «مثبّت الطرفين»: العزم الموجب يصغر فتقدر تقطع أكثر.</li><li>صغّر العمق h: التمديد d يقل لكن φMn يقل أيضاً.</li></ol>` };
    }
  });
})();
