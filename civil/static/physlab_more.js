/* مختبرات إضافية (١): الجملون · خطوط التأثير · البلاطة ثنائية الاتجاه (نافييه) · دائرة مور · مخمّد الكتلة المتوافق */
(function () {
  const PL = window.PHYSLAB; if (!PL) return;
  const { C, math: M, nf } = PL, T = PL.text;

  /* ====================================================================
     ١) الجملون — تحليل بالصلابة لعقد مفصلية
     ==================================================================== */
  PL.calc.truss = function (o) {                              // o: type, n, L, h, P, k (عقدة الحمل)، q (حمل كل عقدة سفلية)
    const n = o.n, dx = o.L / n, nodes = [], mem = [];
    for (let i = 0; i <= n; i++) nodes.push([i * dx, 0]);          // سفلية 0..n
    const top = {};
    if (o.type === 'warren') { for (let i = 0; i < n; i++) { top[i] = nodes.length; nodes.push([(i + .5) * dx, o.h]); } }
    else { for (let i = 1; i < n; i++) { top[i] = nodes.length; nodes.push([i * dx, o.h]); } }
    for (let i = 0; i < n; i++) mem.push([i, i + 1, 'bot']);
    if (o.type === 'warren') {
      for (let i = 0; i < n - 1; i++) mem.push([top[i], top[i + 1], 'top']);
      for (let i = 0; i < n; i++) { mem.push([i, top[i], 'dia']); mem.push([top[i], i + 1, 'dia']); }
    } else {
      for (let i = 1; i < n - 1; i++) mem.push([top[i], top[i + 1], 'top']);
      for (let i = 1; i < n; i++) mem.push([i, top[i], 'ver']);
      mem.push([0, top[1], 'dia']); mem.push([n, top[n - 1], 'dia']);
      for (let i = 1; i < n - 1; i++) {
        const left = (i + .5) < n / 2, pratt = o.type === 'pratt';
        if (left === pratt) mem.push([top[i], i + 1, 'dia']); else mem.push([i, top[i + 1], 'dia']);
      }
    }
    const N = nodes.length, nd = 2 * N, K = new Float64Array(nd * nd), F = new Float64Array(nd), EA = o.EA || 2e5;
    mem.forEach(m => {
      const [a, b] = m, [x1, y1] = nodes[a], [x2, y2] = nodes[b], L = Math.hypot(x2 - x1, y2 - y1), c = (x2 - x1) / L, s = (y2 - y1) / L;
      m.L = L; m.c = c; m.s = s;
      const k = EA / L, kk = [[c * c, c * s], [c * s, s * s]], d = [2 * a, 2 * a + 1, 2 * b, 2 * b + 1];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const sg = (i < 2) === (j < 2) ? 1 : -1;
        K[d[i] * nd + d[j]] += sg * k * kk[i % 2][j % 2];
      }
    });
    for (let i = 1; i < n; i++) F[2 * i + 1] -= o.q || 0;
    if (o.P) F[2 * Math.max(1, Math.min(n - 1, o.k)) + 1] -= o.P;
    const fixed = [0, 1, 2 * n + 1];
    const free = []; for (let i = 0; i < nd; i++) if (!fixed.includes(i)) free.push(i);
    const nf_ = free.length, Kr = new Float64Array(nf_ * nf_), Fr = new Float64Array(nf_);
    free.forEach((gi, i) => { Fr[i] = F[gi]; free.forEach((gj, j) => { Kr[i * nf_ + j] = K[gi * nd + gj]; }); });
    const ur = M.solve(Kr, Fr, nf_), u = new Float64Array(nd); free.forEach((g, i) => { u[g] = ur[i]; });
    mem.forEach(m => { const [a, b] = m; m.N = EA / m.L * ((u[2 * b] - u[2 * a]) * m.c + (u[2 * b + 1] - u[2 * a + 1]) * m.s); });
    const R = fixed.map(g => { let s = -F[g]; for (let j = 0; j < nd; j++) s += K[g * nd + j] * u[j]; return s; });
    return { nodes, mem, u, R, top };
  };

  PL.register({
    id: 'truss', cat: 'mech', ic: '🔺', name: 'الجملون (Truss)', sub: 'شد وضغط · طريقة العقد',
    title: 'ليش الجملون خفيف ويحمل كثير؟',
    learn: 'الجملون يحوّل الانحناء إلى قوى محورية فقط: الأحمر مشدود والأزرق مضغوط، والسماكة تتناسب مع القوة. اسحب الحمل بين العقد وغيّر نوع الجملون والارتفاع — الحل بالمصفوفات (الصلابة المباشرة).',
    ratio: 0.55, ratioSmall: 1.0, minH: 360, maxH: 560,
    defaults: { type: 'pratt', n: 6, L: 18, h: 3, P: 60, k: 3, q: 20 },
    presets: [{ name: 'Pratt', vals: { type: 'pratt' } }, { name: 'Howe', vals: { type: 'howe' } }, { name: 'Warren', vals: { type: 'warren' } }, { name: 'جملون واطي', vals: { h: 1.5 } }],
    controls: [
      { id: 'type', type: 'select', label: 'النوع', opts: [['pratt', 'Pratt (مائل للشد)'], ['howe', 'Howe (مائل للضغط)'], ['warren', 'Warren (مثلثات)']] },
      { id: 'n', label: 'عدد الفتحات', min: 4, max: 12, step: 2 },
      { id: 'L', label: 'البحر', min: 6, max: 40, step: 0.5, unit: 'م' },
      { id: 'h', label: 'الارتفاع', min: 1, max: 6, step: 0.1, unit: 'م' },
      { id: 'q', label: 'حمل كل عقدة سفلية', min: 0, max: 100, step: 1, unit: 'kN' },
      { id: 'P', label: 'حمل مركّز إضافي', min: 0, max: 200, step: 5, unit: 'kN' },
      { id: 'k', label: 'عقدة الحمل المركّز', min: 1, max: 11, step: 1 }
    ],
    layers: [{ k: 'force', name: 'القوى المحورية', color: C.tens, on: true }, { k: 'label', name: 'قيم القوى', color: C.tx, on: 'lvl', lvl: 2 },
      { k: 'defl', name: 'التشوّه (مكبّر)', color: C.defl, on: false }, { k: 'reac', name: 'ردود الأفعال', color: C.react, on: true }],
    solve(s) { s.k = Math.min(s.k, s.n - 1); return PL.calc.truss(s); },
    onDown(x, y, s, r, S) { return y > S.H * 0.55 ? 'P' : false; },
    hover(x, y, s, r, S) { return y > S.H * 0.55; },
    onMove(x, y, s, r, S) { const mx = 50, k = Math.round((x - mx) / (S.W - 2 * mx) * s.n); s.k = M.clamp(k, 1, s.n - 1); return true; },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, mx = 50, sc = Math.min((W - 2 * mx) / s.L, (H * 0.55) / s.h), ox = (W - s.L * sc) / 2, oy = H * 0.72;
      const umax = Math.max(1e-9, ...Array.from(r.u).map(Math.abs)), dsc = lay.defl ? 0.06 * H / umax : 0;
      const P = i => [ox + (r.nodes[i][0] + r.u[2 * i] * dsc / sc) * sc, oy - (r.nodes[i][1] + r.u[2 * i + 1] * dsc / sc) * sc];
      const Nmax = Math.max(1e-9, ...r.mem.map(m => Math.abs(m.N)));
      r.mem.forEach(m => {
        const [x1, y1] = P(m[0]), [x2, y2] = P(m[1]);
        const w = lay.force ? 1.5 + 7 * Math.abs(m.N) / Nmax : 3;
        ctx.strokeStyle = !lay.force ? '#94a3b8' : Math.abs(m.N) < Nmax * 0.01 ? '#64748b' : m.N > 0 ? C.tens : C.comp;
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (lay.label && Math.abs(m.N) > Nmax * 0.01) T(ctx, nf(m.N, 0), (x1 + x2) / 2, (y1 + y2) / 2, { size: 9.5, bg: 'rgba(10,16,32,.75)', color: m.N > 0 ? '#fca5a5' : '#93c5fd' });
      });
      r.nodes.forEach((_, i) => { const [x, y] = P(i); ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); });
      for (let i = 1; i < s.n; i++) { const [x, y] = P(i); if (s.q) PL.arrow(ctx, x, y + 34, x, y + 6, C.load, 1.5, 7); }
      if (s.P) { const [x, y] = P(s.k); PL.arrow(ctx, x, y + 70, x, y + 8, C.load, 3.4, 12); T(ctx, `P = ${nf(s.P, 0)} kN ⇆`, x, y + 82, { color: C.load, bold: true }); }
      const [ax, ay] = P(0), [bx, by] = P(s.n);
      ctx.fillStyle = '#64748b'; [[ax, ay], [bx, by]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 16); ctx.lineTo(x + 10, y + 16); ctx.fill(); });
      if (lay.reac) { T(ctx, `R = ${nf(r.R[1], 1)}`, ax, ay + 30, { color: C.react, bold: true }); T(ctx, `R = ${nf(r.R[2], 1)}`, bx, by + 30, { color: C.react, bold: true }); }
      T(ctx, 'أحمر = شد · أزرق = ضغط · السماكة ∝ القوة', W - 10, 16, { align: 'right', size: 10, color: C.mut });
    },
    kpis(s, r) { const t = Math.max(...r.mem.map(m => m.N)), c = Math.min(...r.mem.map(m => m.N));
      return [['أقصى شد', nf(t, 1) + ' kN'], ['أقصى ضغط', nf(c, 1) + ' kN'], ['عدد الأعضاء', r.mem.length], ['R يسار / يمين', nf(r.R[1], 1) + ' / ' + nf(r.R[2], 1)]]; },
    explain(s, r) {
      const tot = s.q * (s.n - 1) + s.P, Mmid = tot / 2 * s.L / 2 - s.q * [...Array(Math.floor(s.n / 2)).keys()].slice(1).reduce((a, i) => a + (s.L / 2 - i * s.L / s.n), 0) - (s.k < s.n / 2 ? s.P * (s.L / 2 - s.k * s.L / s.n) : s.k > s.n / 2 ? 0 : 0);
      return { see: `<ul class="pl-ul"><li>كل عضو بالجملون مربوط بمفاصل فيشيل قوة محورية فقط (شد أو ضغط) — بلا عزم. لهذا نستعمل مقاطع خفيفة.</li>
        <li>الوتر العلوي مضغوط والسفلي مشدود، مثل الجسر بالضبط: القوة بالوتر ≈ العزم ÷ الارتفاع — ضاعف الارتفاع تنقص القوى للنصف.</li>
        <li>Pratt: الأقطار مشدودة (أحمر) والقوائم مضغوطة — مناسب للحديد. Howe: بالعكس — كان للخشب.</li><li>الأعضاء المضغوطة الطويلة تنبعج — ارجع لمختبر العمود.</li></ul>`,
        math: PL.steps([['التوازن'], ['مجموع ردود الأفعال', 'ΣR = ΣP', nf(r.R[1] + r.R[2], 1) + ' = ' + nf(tot, 1) + ' kN'],
          ['الحل', 'K·u = F (عنصر لكل عضو EA/L)', 'عقد ' + r.nodes.length + ' · أعضاء ' + r.mem.length],
          ['تقريب الوتر', 'N ≈ M / h', 'كلما قلّ h زادت القوى']]),
        code: `<ul class="pl-ul"><li>الجمالونات الحديدية: AISC 360 (الشد D، الضغط E).</li><li>الجمالونات الخرسانية نادرة؛ مبدأ «الدعامة والرابط» (Strut-and-Tie) بالفصل 23 من ACI 318-19 هو نفس فكرة الجملون داخل الخرسانة.</li></ul>`,
        try: `<ol class="pl-ul"><li>بدّل Pratt إلى Howe: الأقطار تصير زرقاء.</li><li>صغّر الارتفاع إلى 1.5 م: الأوتار تتضخم.</li><li>اسحب الحمل المركّز للطرف: القوى تتركز بالنصف القريب.</li></ol>` };
    }
  });

  /* ====================================================================
     ٢) خطوط التأثير — شاحنة متحركة على جسر
     ==================================================================== */
  PL.calc.il = function (o, a) {                                   // تأثير حمل وحدة عند a
    const L = o.L, x0 = o.x0;
    if (o.sup === 'ss') {
      if (o.q === 'R') return 1 - a / L;
      if (o.q === 'V') return a < x0 ? -a / L : 1 - a / L;
      return a <= x0 ? a * (L - x0) / L : x0 * (L - a) / L;
    }
    const r = PL.calc.beam({ L, sup: o.sup, w: 0, P: 1, a: Math.min(L - 1e-6, Math.max(1e-6, a)), E: 1, I: 1, n: 24 });
    if (o.q === 'R') return r.Rl;
    const i = Math.round(x0 / L * 24);
    if (o.q === 'V') return r.Rl - (a < x0 ? 1 : 0);
    return r.Rl * x0 - r.Ml - (a < x0 ? (x0 - a) : 0);
  };
  PL.register({
    id: 'infl', cat: 'mech', ic: '🚚', name: 'خطوط التأثير', sub: 'شاحنة متحركة · أسوأ موضع',
    title: 'وين لازم تكون الشاحنة حتى يصير العزم أكبر؟',
    learn: 'خط التأثير يعطي قيمة (رد فعل أو قص أو عزم) عند نقطة ثابتة لما يتحرك حمل وحدة على الجسر. شغّل الشاحنة وشوف القيمة تتغير، والأقصى يُسجَّل — هكذا تُصمَّم الجسور والأرصفة.',
    ratio: 0.55, ratioSmall: 1.05, minH: 380, maxH: 560,
    defaults: { sup: 'ss', L: 20, x0: 10, q: 'M', P1: 145, P2: 145, gap: 4.3, speed: 1 },
    presets: [{ name: 'عزم المنتصف', vals: { q: 'M', x0: 10 } }, { name: 'رد الفعل', vals: { q: 'R' } }, { name: 'القص بربع البحر', vals: { q: 'V', x0: 5 } }, { name: 'مثبّت الطرفين', vals: { sup: 'ff' } }],
    controls: [
      { id: 'sup', type: 'select', label: 'الإسناد', opts: [['ss', 'بسيط'], ['ff', 'مثبّت الطرفين'], ['fp', 'مثبّت + دحروج'], ['cant', 'كابولي']] },
      { id: 'q', type: 'select', label: 'الكمية', opts: [['M', 'العزم عند النقطة'], ['V', 'القص عند النقطة'], ['R', 'رد الفعل الأيسر']] },
      { id: 'L', label: 'البحر', min: 6, max: 40, step: 0.5, unit: 'م' },
      { id: 'x0', label: 'موقع النقطة', min: 0.5, max: 40, step: 0.1, unit: 'م', onChange: s => { s.x0 = Math.min(s.x0, s.L - 0.5); } },
      { id: 'P1', label: 'حمل المحور الأمامي', min: 10, max: 250, step: 5, unit: 'kN' },
      { id: 'P2', label: 'حمل المحور الخلفي', min: 0, max: 250, step: 5, unit: 'kN' },
      { id: 'gap', label: 'المسافة بين المحورين', min: 1, max: 9, step: 0.1, unit: 'م' },
      { id: 'speed', label: 'السرعة', min: 0.2, max: 3, step: 0.1, unit: '×' },
      { type: 'buttons', items: [['go', '▶ شغّل الشاحنة', ''], ['reset', '↺ صفّر الأقصى']] }
    ],
    layers: [{ k: 'il', name: 'خط التأثير', color: C.acc, on: true }, { k: 'truck', name: 'الشاحنة', color: C.load, on: true }, { k: 'hist', name: 'القيمة مع الموضع', color: C.bmd, on: true }],
    solve(s) {
      s.x0 = Math.min(s.x0, s.L - 0.5);
      const xs = [], ys = []; for (let i = 0; i <= 60; i++) { const a = s.L * i / 60; xs.push(a); ys.push(PL.calc.il(s, a)); }
      let best = -Infinity, bestPos = 0, worst = Infinity;
      for (let i = -10; i <= 110; i++) { const p = s.L * i / 100, v = val(s, p); if (v > best) { best = v; bestPos = p; } if (v < worst) worst = v; }
      return { xs, ys, best, bestPos, worst };
    },
    init(s) { s._x = -s.gap; s._run = true; s._hist = []; },
    onPreset(s) { s._x = -s.gap; s._hist = []; s._run = true; },
    action(k, s) { if (k === 'go') { s._x = -s.gap; s._run = true; s._hist = []; } if (k === 'reset') s._hist = []; },
    tick(dt, s) { if (!s._run) return false; s._x += dt * 3 * s.speed; s._hist.push([s._x, val(s, s._x)]); if (s._x > s.L + s.gap) s._run = false; return true; },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, mx = 40, X = x => mx + x / s.L * (W - 2 * mx), yb = H * 0.3;
      ctx.fillStyle = '#475569'; ctx.fillRect(X(0), yb, X(s.L) - X(0), 12);
      ctx.fillStyle = '#64748b'; [0, s.L].forEach(x => { ctx.beginPath(); ctx.moveTo(X(x), yb + 12); ctx.lineTo(X(x) - 9, yb + 26); ctx.lineTo(X(x) + 9, yb + 26); ctx.fill(); });
      ctx.fillStyle = C.warn; ctx.beginPath(); ctx.arc(X(s.x0), yb + 6, 5, 0, 7); ctx.fill(); T(ctx, 'النقطة', X(s.x0), yb + 38, { size: 9.5, color: C.warn });
      if (lay.truck) {
        const a1 = s._x + s.gap, a2 = s._x;
        [[a1, s.P1], [a2, s.P2]].forEach(([a, P]) => { if (a < -0.5 || a > s.L + 0.5 || !P) return; PL.arrow(ctx, X(a), yb - 50, X(a), yb - 2, C.load, 2.5, 9); });
        const xa = X(Math.min(a1, a2) - 0.8), xb = X(Math.max(a1, a2) + 0.8);
        ctx.fillStyle = 'rgba(244,114,182,.35)'; ctx.fillRect(xa, yb - 86, xb - xa, 30); ctx.fillStyle = 'rgba(244,114,182,.6)'; ctx.fillRect(xb - 30, yb - 100, 30, 44);
        T(ctx, `${nf(s.P1, 0)} + ${nf(s.P2, 0)} kN`, (xa + xb) / 2, yb - 70, { size: 10, bold: true });
      }
      if (lay.il) {
        const y0 = H * 0.62, amp = H * 0.14, mxv = Math.max(...r.ys.map(Math.abs), 1e-9);
        ctx.strokeStyle = '#475569'; ctx.beginPath(); ctx.moveTo(X(0), y0); ctx.lineTo(X(s.L), y0); ctx.stroke();
        ctx.fillStyle = 'rgba(56,189,248,.2)'; ctx.strokeStyle = C.acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), y0);
        r.xs.forEach((x, i) => ctx.lineTo(X(x), y0 - r.ys[i] / mxv * amp)); ctx.lineTo(X(s.L), y0); ctx.closePath(); ctx.fill(); ctx.stroke();
        T(ctx, `خط تأثير ${{ M: 'العزم', V: 'القص', R: 'رد الفعل' }[s.q]} (لحمل 1 kN)`, W - 10, y0 - amp - 12, { align: 'right', size: 10, color: C.acc, bold: true });
        [[s._x + s.gap], [s._x]].forEach(([a]) => { if (a < 0 || a > s.L) return; const v = PL.calc.il(s, a); ctx.fillStyle = C.load; ctx.beginPath(); ctx.arc(X(a), y0 - v / mxv * amp, 4, 0, 7); ctx.fill(); });
      }
      if (lay.hist && s._hist.length > 1) {
        const box = { x: 10, y: H * 0.78, w: W - 20, h: H * 0.2 };
        const xs = s._hist.map(h => h[0]), ys = s._hist.map(h => h[1]);
        PL.chart(ctx, box, { title: `القيمة الآن ${nf(ys[ys.length - 1], 1)} · الأقصى ${nf(Math.max(...ys), 1)}`, xs, x0: -s.gap, x1: s.L + s.gap, series: [{ ys, color: C.bmd }], xl: 'موضع الشاحنة (م)' });
      }
    },
    kpis(s, r) { const u = { M: 'kN·m', V: 'kN', R: 'kN' }[s.q]; return [['الأقصى الموجب', nf(r.best, 1) + ' ' + u], ['الأقصى السالب', nf(r.worst, 1) + ' ' + u], ['موضع المحور الخلفي للأقصى', nf(r.bestPos, 2) + ' م']]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>خط التأثير = «كم يتأثر هذا المكان لو حطّيت 1 kN هناك». القيمة لأي حمولة = مجموع (الحمل × ارتفاع الخط تحته).</li>
        <li>لعزم نقطة بجسر بسيط الخط مثلث قمته عند النقطة نفسها ⇒ أسوأ حالة لما يكون أثقل محور فوق النقطة.</li><li>للقص يقفز الخط بمقدار 1 عند النقطة — الحمل قبلها وبعدها يعطي إشارتين مختلفتين.</li></ul>`,
        math: PL.steps([['جسر بسيط'], ['رد الفعل', 'R(a) = 1 − a/L', ''], ['العزم عند x₀', 'a(L−x₀)/L لـ a ≤ x₀ · x₀(L−a)/L لـ a ≥ x₀', ''], ['القيمة', 'Σ Pi·IL(ai)', 'الأقصى ' + nf(r.best, 1)]]),
        code: `<ul class="pl-ul"><li>أحمال الجسور: AASHTO LRFD (شاحنة HL-93: 35 + 145 + 145 kN) وكود الجسور العراقي.</li><li>ACI 318-19 §6.4 ترتيب الأحمال الحية للحصول على أسوأ الحالات (مبدأ خطوط التأثير نفسه).</li></ul>`,
        try: `<ol class="pl-ul"><li>ضع النقطة بمنتصف البحر وشغّل: الأقصى لما الشاحنة بالمنتصف.</li><li>اختر «القص بربع البحر»: تشوف القفزة.</li><li>اختر مثبّت الطرفين: عزم المنتصف يصغر ويظهر عزم سالب.</li></ol>` };
    }
  });
  function val(s, x) { let v = 0; [[x + s.gap, s.P1], [x, s.P2]].forEach(([a, P]) => { if (a >= 0 && a <= s.L && P) v += P * PL.calc.il(s, a); }); return v; }

  /* ====================================================================
     ٣) البلاطة ثنائية الاتجاه — حل نافييه
     ==================================================================== */
  PL.calc.navier = function (o, x, y, terms) {                      // بلاطة بسيطة الإسناد a×b بحمل منتظم q
    const a = o.a, b = o.b, nu = o.nu, K = terms || 19;
    let w = 0, mx = 0, my = 0;
    for (let m = 1; m <= K; m += 2) for (let n = 1; n <= K; n += 2) {
      const sm = Math.sin(m * Math.PI * x / a), sn = Math.sin(n * Math.PI * y / b), A = m * m / (a * a) + n * n / (b * b);
      const den = m * n * A * A;
      w += sm * sn / den; mx += (m * m / (a * a) + nu * n * n / (b * b)) * sm * sn / den; my += (nu * m * m / (a * a) + n * n / (b * b)) * sm * sn / den;
    }
    const p6 = Math.pow(Math.PI, 6), p4 = Math.pow(Math.PI, 4);
    return { w: 16 * o.q / (p6 * o.D) * w, mx: 16 * o.q / p4 * mx, my: 16 * o.q / p4 * my };
  };
  PL.register({
    id: 'plate', cat: 'mech', ic: '🟦', name: 'البلاطة ثنائية الاتجاه', sub: 'نافييه · هطول وعزوم بالاتجاهين',
    title: 'ليش البلاطة المربعة تشتغل باتجاهين والطويلة باتجاه واحد؟',
    learn: 'حل نافييه الدقيق لبلاطة بسيطة الإسناد: الخريطة اللونية للهطول أو العزم. طوّل البلاطة وشوف العزم ينتقل كله للاتجاه القصير — ليش الكود يعامل البلاطة بنسبة > 2 كأنها باتجاه واحد.',
    ratio: 0.55, ratioSmall: 1.2, minH: 380, maxH: 560,
    defaults: { a: 5, b: 5, h: 150, q: 10, fc: 25, show: 'w' },
    presets: [{ name: 'مربعة', vals: { a: 5, b: 5 } }, { name: 'نسبة 1.5', vals: { a: 4, b: 6 } }, { name: 'نسبة 3 (اتجاه واحد)', vals: { a: 3, b: 9 } }],
    controls: [
      { id: 'show', type: 'select', label: 'الخريطة', opts: [['w', 'الهطول w'], ['mx', 'العزم بالاتجاه القصير Mx'], ['my', 'العزم بالاتجاه الطويل My']] },
      { id: 'a', label: 'البحر القصير a', min: 2, max: 8, step: 0.1, unit: 'م' },
      { id: 'b', label: 'البحر الطويل b', min: 2, max: 12, step: 0.1, unit: 'م' },
      { id: 'h', label: 'السماكة', min: 100, max: 300, step: 10, unit: 'مم' },
      { id: 'q', label: 'الحمل', min: 2, max: 30, step: 0.5, unit: 'kN/م²' },
      { id: 'fc', label: "f'c", min: 20, max: 40, step: 1, unit: 'MPa' }
    ],
    layers: [{ k: 'map', name: 'الخريطة اللونية', color: C.acc, on: true }, { k: 'prof', name: 'مقطعان بالمنتصف', color: C.bmd, on: true }, { k: 'strip', name: 'تقسيم الحمل', color: C.ok, on: 'lvl', lvl: 2 }],
    solve(s) {
      if (s.b < s.a) { const t = s.a; s.a = s.b; s.b = t; }
      const E = M.Ec(s.fc) * 1000, D = E * Math.pow(s.h / 1000, 3) / (12 * (1 - 0.2 * 0.2));
      const o = { a: s.a, b: s.b, q: s.q, nu: 0.2, D }, g = 34, grid = [];
      let wmax = 0, mxmax = 0, mymax = 0;
      for (let j = 0; j <= g; j++) { const row = []; for (let i = 0; i <= g; i++) { const v = PL.calc.navier(o, s.a * i / g, s.b * j / g, 11); row.push(v); } grid.push(row); }
      const c = PL.calc.navier(o, s.a / 2, s.b / 2, 31); wmax = c.w; mxmax = c.mx; mymax = c.my;
      const alpha = wmax * D / (s.q * Math.pow(s.a, 4));
      const r = s.b / s.a, shareA = 1 / (1 + Math.pow(s.a / s.b, 4));      // تقسيم رانكين-غراشوف
      return { o, grid, wmax, mxmax, mymax, alpha, ratio: r, shareA, D };
    },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, small = W < 620, pw = small ? W - 40 : W * 0.55, ph = small ? H * 0.5 : H - 60;
      const sc = Math.min(pw / s.a, ph / s.b), ox = 20, oy = 30, g = r.grid.length - 1;
      const key = s.show, mxv = Math.max(1e-12, ...r.grid.flat().map(v => Math.abs(v[key])));
      if (lay.map) for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
        const v = (r.grid[j][i][key] + r.grid[j][i + 1][key] + r.grid[j + 1][i][key] + r.grid[j + 1][i + 1][key]) / 4;
        ctx.fillStyle = PL.seq(Math.abs(v) / mxv); ctx.fillRect(ox + i * s.a / g * sc, oy + j * s.b / g * sc, s.a / g * sc + 1, s.b / g * sc + 1);
      }
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, s.a * sc, s.b * sc);
      T(ctx, `a = ${nf(s.a, 1)} م`, ox + s.a * sc / 2, oy - 12, { size: 10 }); T(ctx, `b = ${nf(s.b, 1)} م`, ox + s.a * sc + 8, oy + s.b * sc / 2, { align: 'left', size: 10 });
      if (lay.strip) T(ctx, `الاتجاه القصير يشيل ≈ ${nf(r.shareA * 100, 0)}% من الحمل`, ox + s.a * sc / 2, oy + s.b * sc + 16, { size: 10.5, bold: true, color: C.ok });
      if (lay.prof) {
        const box = small ? { x: 8, y: H * 0.62, w: W - 16, h: H * 0.34 } : { x: W * 0.6, y: 20, w: W * 0.38, h: H * 0.6 };
        const xs = [], y1 = [], y2 = [];
        for (let i = 0; i <= 40; i++) { const t = i / 40; xs.push(t); y1.push(PL.calc.navier(r.o, s.a * t, s.b / 2, 9)[key]); y2.push(PL.calc.navier(r.o, s.a / 2, s.b * t, 9)[key]); }
        const k = key === 'w' ? 1000 : 1;
        PL.chart(ctx, box, { title: key === 'w' ? 'الهطول (مم) — أزرق عبر القصير · برتقالي عبر الطويل' : 'العزم (kN·m/m)', xs, x0: 0, x1: 1, ydec: key === 'w' ? 2 : 1,
          series: [{ ys: y1.map(v => v * k), color: C.acc }, { ys: y2.map(v => v * k), color: C.bmd }], xl: 'x/L' });
      }
    },
    kpis(s, r) { return [['الهطول الأقصى', nf(r.wmax * 1000, 2) + ' مم'], ['Mx (قصير)', nf(r.mxmax, 2) + ' kN·m/m'], ['My (طويل)', nf(r.mymax, 2) + ' kN·m/m'],
      ['b/a', nf(r.ratio, 2), r.ratio > 2 ? 'warn' : 'ok'], ['α = wD/qa⁴', nf(r.alpha, 5)]]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>البلاطة تنحني بالاتجاهين، لكن الاتجاه القصير أصلب (الهطول ∝ الطول⁴) فيشيل الحصة الأكبر.</li>
        <li>بنسبة ${nf(r.ratio, 2)} يشيل القصير ≈ ${nf(r.shareA * 100, 0)}% — فوق نسبة 2 يصير > 94% فنصمّمها باتجاه واحد.</li><li>الخريطة الصفراء = أقصى قيمة بالمنتصف، والأطراف صفر (إسناد بسيط).</li></ul>`,
        math: PL.steps([['نافييه (Timoshenko)'], ['الجساءة', 'D = E·h³ / 12(1−ν²)', nf(r.D, 0) + ' kN·m'], ['الهطول', 'w = 16q/(π⁶D) ΣΣ sin·sin / (mn(m²/a² + n²/b²)²)', nf(r.wmax * 1000, 3) + ' مم'],
          ['المعامل', 'α = w·D/(q·a⁴) (مربعة: 0.00406)', nf(r.alpha, 5)], ['تقسيم تقريبي', 'wa = w·b⁴/(a⁴ + b⁴)', nf(r.shareA * 100, 1) + '%']]),
        code: `<ul class="pl-ul"><li>ACI 318-19 الفصل 8 (البلاطات باتجاهين) — طريقة التصميم المباشر 8.10 والإطار المكافئ 8.11.</li><li>§7.1: البلاطة باتجاه واحد عندما تعمل بالانحناء باتجاه واحد (عملياً b/a > 2).</li><li>جدول 8.3.1.1 السماكة الدنيا للبلاطات بلا جسور.</li></ul>`,
        try: `<ol class="pl-ul"><li>اختر «نسبة 3»: خريطة My تكاد تختفي.</li><li>ضاعف السماكة: الهطول ينزل 8 مرات والعزم ما يتغيّر.</li></ol>` };
    }
  });

  /* ====================================================================
     ٤) دائرة مور — تحويل الإجهادات
     ==================================================================== */
  PL.calc.mohr = function (sx, sy, t, th) {
    const avg = (sx + sy) / 2, R = Math.hypot((sx - sy) / 2, t), c = Math.cos(2 * th), s2 = Math.sin(2 * th);
    return { avg, R, s1: avg + R, s2: avg - R, tp: 0.5 * Math.atan2(2 * t, sx - sy), sxp: avg + (sx - sy) / 2 * c + t * s2, syp: avg - (sx - sy) / 2 * c - t * s2, txy: -(sx - sy) / 2 * s2 + t * c };
  };
  PL.register({
    id: 'mohr', cat: 'mech', ic: '⭕', name: 'دائرة مور', sub: 'الإجهادات الرئيسية · اتجاه الشقوق',
    title: 'ليش الشقوق بالجسر تطلع مائلة قرب المساند؟',
    learn: 'دوّر العنصر الصغير وشوف الإجهادات تتغير على دائرة مور. عند زاوية معيّنة يختفي القص ويصير الشد أكبر ما يكون (σ1) — والخرسانة تتشقق عمودياً على σ1. لهذا الشقوق مائلة 45° حيث القص كبير.',
    ratio: 0.55, ratioSmall: 1.15, minH: 380, maxH: 560,
    defaults: { sx: 2, sy: 0, t: 1.5, th: 0, fc: 25 },
    presets: [{ name: 'قص صافٍ (قرب المسند)', vals: { sx: 0, sy: 0, t: 2 } }, { name: 'شد + قص', vals: { sx: 2, sy: 0, t: 1.5 } }, { name: 'انضغاط محوري', vals: { sx: -10, sy: 0, t: 0 } }],
    controls: [
      { id: 'sx', label: 'σx', min: -20, max: 20, step: 0.1, unit: 'MPa' }, { id: 'sy', label: 'σy', min: -20, max: 20, step: 0.1, unit: 'MPa' },
      { id: 't', label: 'τxy', min: -10, max: 10, step: 0.1, unit: 'MPa' }, { id: 'th', label: 'زاوية العنصر θ', min: -90, max: 90, step: 1, unit: '°' },
      { id: 'fc', label: "f'c (للتشقق)", min: 20, max: 50, step: 1, unit: 'MPa' },
      { type: 'buttons', items: [['pr', '🎯 للمستوى الرئيسي', '']] }
    ],
    layers: [{ k: 'circle', name: 'الدائرة', color: C.acc, on: true }, { k: 'elem', name: 'العنصر المدوَّر', color: C.warn, on: true }, { k: 'crack', name: 'اتجاه التشقق', color: C.bad, on: true }],
    solve(s) { const r = PL.calc.mohr(s.sx, s.sy, s.t, s.th * Math.PI / 180); r.ft = 0.33 * Math.sqrt(s.fc); r.crack = r.s1 > r.ft; return r; },
    action(k, s, r) { if (k === 'pr') s.th = Math.round(r.tp * 180 / Math.PI); },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, small = W < 620, cx = small ? W / 2 : W * 0.68, cy = small ? H * 0.68 : H / 2, rad = Math.min(small ? W * 0.4 : W * 0.28, (small ? H * 0.3 : H * 0.42));
      const smax = Math.max(Math.abs(r.avg) + r.R, 1), sc = rad / smax;
      if (lay.circle) {
        ctx.strokeStyle = '#475569'; ctx.beginPath(); ctx.moveTo(cx - rad * 1.1, cy); ctx.lineTo(cx + rad * 1.1, cy); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.stroke();
        const ccx = cx + 0 * sc;
        ctx.strokeStyle = C.acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ccx + (r.avg - 0) * sc - 0, cy, r.R * sc, 0, 7); ctx.stroke();
        const P = (sg, tt) => [cx + sg * sc, cy + tt * sc];
        const [ax, ay] = P(r.sxp, r.txy), [bx, by] = P(r.syp, -r.txy);
        ctx.strokeStyle = C.warn; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = C.warn; [[ax, ay], [bx, by]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); });
        [[r.s1, 'σ1'], [r.s2, 'σ2']].forEach(([v, l]) => { const [x] = P(v, 0); ctx.fillStyle = C.ok; ctx.beginPath(); ctx.arc(x, cy, 4, 0, 7); ctx.fill(); T(ctx, `${l} = ${nf(v, 2)}`, x, cy + 16, { size: 10, color: C.ok, bold: true }); });
        T(ctx, 'σ →', cx + rad * 1.1, cy - 10, { size: 10, color: C.mut }); T(ctx, 'τ ↓', cx + 12, cy + rad - 4, { size: 10, color: C.mut });
      }
      if (lay.elem) {
        const ex = small ? W / 2 : W * 0.22, ey = small ? H * 0.2 : H / 2, a = small ? 34 : 60, th = -s.th * Math.PI / 180;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(th);
        ctx.fillStyle = '#334155'; ctx.fillRect(-a / 2, -a / 2, a, a); ctx.strokeStyle = C.warn; ctx.lineWidth = 2; ctx.strokeRect(-a / 2, -a / 2, a, a);
        const arr = (x1, y1, x2, y2, v) => { if (Math.abs(v) < 0.05) return; PL.arrow(ctx, x1, y1, x2, y2, v > 0 ? C.tens : C.comp, 2, 7); };
        const Ls = Math.min(40, 6 + Math.abs(r.sxp) * 4), Ly = Math.min(40, 6 + Math.abs(r.syp) * 4);
        if (r.sxp > 0) { arr(a / 2, 0, a / 2 + Ls, 0, 1); arr(-a / 2, 0, -a / 2 - Ls, 0, 1); } else { arr(a / 2 + Ls, 0, a / 2, 0, -1); arr(-a / 2 - Ls, 0, -a / 2, 0, -1); }
        if (r.syp > 0) { arr(0, -a / 2, 0, -a / 2 - Ly, 1); arr(0, a / 2, 0, a / 2 + Ly, 1); } else if (r.syp < -0.05) { arr(0, -a / 2 - Ly, 0, -a / 2, -1); arr(0, a / 2 + Ly, 0, a / 2, -1); }
        if (Math.abs(r.txy) > 0.05) { ctx.strokeStyle = C.acc; ctx.lineWidth = 2; const d = r.txy > 0 ? 1 : -1;
          PL.arrow(ctx, a / 2 + 6, d * a / 3, a / 2 + 6, -d * a / 3, C.acc, 2, 6); PL.arrow(ctx, -a / 2 - 6, -d * a / 3, -a / 2 - 6, d * a / 3, C.acc, 2, 6); }
        ctx.restore();
        if (lay.crack) {
          const ang = -(r.tp + Math.PI / 2);                            // الشق عمودي على σ1
          ctx.strokeStyle = r.crack ? C.bad : 'rgba(248,113,113,.35)'; ctx.lineWidth = 2; ctx.setLineDash(r.crack ? [] : [4, 4]);
          ctx.beginPath(); ctx.moveTo(ex - Math.cos(ang) * a, ey - Math.sin(ang) * a); ctx.lineTo(ex + Math.cos(ang) * a, ey + Math.sin(ang) * a); ctx.stroke(); ctx.setLineDash([]);
          T(ctx, r.crack ? `σ1 = ${nf(r.s1, 2)} > ft = ${nf(r.ft, 2)} ⇒ شق بزاوية ${nf(90 - Math.abs(r.tp * 180 / Math.PI), 0)}°` : `σ1 < ft = ${nf(r.ft, 2)} MPa — بلا تشقق`, ex, ey + a + 30, { color: r.crack ? C.bad : C.ok, bold: true, size: 10.5 });
        }
      }
    },
    kpis(s, r) { return [['σ1', nf(r.s1, 2) + ' MPa', r.crack ? 'bad' : ''], ['σ2', nf(r.s2, 2) + ' MPa'], ['τmax', nf(r.R, 2) + ' MPa'], ['θp', nf(r.tp * 180 / Math.PI, 1) + '°'], ['τ على العنصر', nf(r.txy, 2)]]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>نفس النقطة بالجسر لها إجهادات مختلفة حسب الاتجاه اللي تنظر منه — دائرة مور تجمعها كلها.</li><li>قرب المساند القص كبير والانحناء صغير ⇒ σ1 مائل 45° ⇒ شق قطري: لهذا الكانات.</li><li>بالمنتصف الانحناء كبير والقص صفر ⇒ σ1 أفقي ⇒ شقوق رأسية بالأسفل: لهذا الحديد الرئيسي.</li></ul>`,
        math: PL.steps([['الإجهادات الرئيسية'], ['المركز', '(σx + σy)/2', nf(r.avg, 2)], ['نصف القطر', '√(((σx−σy)/2)² + τ²)', nf(r.R, 2)], ['σ1,2', 'المركز ± R', nf(r.s1, 2) + ' / ' + nf(r.s2, 2)],
          ['الزاوية', 'θp = ½·atan(2τ/(σx−σy))', nf(r.tp * 180 / Math.PI, 1) + '°'], ['مقاومة الشد', 'ft ≈ 0.33√f\'c', nf(r.ft, 2) + ' MPa']]),
        code: `<ul class="pl-ul"><li>ACI 318-19 §22.5 القص: Vc يمثّل الحمل عند ظهور الشق القطري.</li><li>§23 الدعامة والرابط: الدعامات تتبع σ2 (الانضغاط) والروابط σ1.</li></ul>`,
        try: `<ol class="pl-ul"><li>اختر «قص صافٍ» واضغط «للمستوى الرئيسي»: θ = 45°.</li><li>زِد σx (انحناء): الشق يصير أقرب للرأسي.</li><li>أضف انضغاطاً σy سالباً (سبق إجهاد): σ1 يقل فيتأخر التشقق.</li></ol>` };
    }
  });

  /* ====================================================================
     ٥) مخمّد الكتلة المتوافق (TMD)
     ==================================================================== */
  PL.calc.tmd = function (o, w) {                                   // استجابة الكتلة الرئيسية لقوة توافقية (مطبّعة: m1 = k1 = 1)
    const mu = o.mu, f = o.f, z1 = o.z1, z2 = o.z2;
    if (!o.on) return 1 / Math.hypot(1 - w * w, 2 * z1 * w);
    const k2 = mu * f * f, c2 = 2 * mu * z2 * f;
    // [a b; c d] مركّبة
    const a = [1 + k2 - w * w, w * (2 * z1 + c2)], b = [-k2, -w * c2], d = [k2 - mu * w * w, w * c2];
    const mul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
    const det = [mul(a, d)[0] - mul(b, b)[0], mul(a, d)[1] - mul(b, b)[1]];
    const n = Math.hypot(...d), dd = Math.hypot(...det);
    return n / dd;
  };
  PL.register({
    id: 'tmd', cat: 'dyn', ic: '🎐', name: 'مخمّد الكتلة المتوافق', sub: 'TMD · دن هارتوغ · تقليل الرنين',
    title: 'كيف كتلة صغيرة فوق البرج تقلّل اهتزازه؟',
    learn: 'كتلة معلّقة بنابض فوق المبنى تتأرجح عكسه تماماً عند الرنين فتسحب طاقته. غيّر نسبة الكتلة والتوافق والتخميد وشوف قمة الرنين تنقسم وتنخفض — نفس فكرة كرة تايبيه 101 الذهبية.',
    ratio: 0.55, ratioSmall: 1.2, minH: 380, maxH: 560, liveKpi: false,
    defaults: { mu: 0.05, f: 0.95, z1: 0.02, z2: 0.12, on: 'y', w: 1 },
    presets: [{ name: 'بلا مخمّد', vals: { on: 'n' } }, { name: 'أمثل (دن هارتوغ)', vals: { on: 'y' } }, { name: 'توافق خاطئ', vals: { on: 'y', f: 1.3 } }],
    controls: [
      { id: 'on', type: 'select', label: 'المخمّد', opts: [['y', 'مركّب'], ['n', 'بدون']] },
      { id: 'mu', label: 'نسبة الكتلة μ', min: 0.005, max: 0.15, step: 0.005 },
      { id: 'f', label: 'نسبة التوافق f', min: 0.6, max: 1.4, step: 0.01 },
      { id: 'z2', label: 'تخميد المخمّد ζd', min: 0.01, max: 0.3, step: 0.005 },
      { id: 'z1', label: 'تخميد المبنى ζ', min: 0.005, max: 0.1, step: 0.005 },
      { id: 'w', label: 'تردد الإثارة ÷ تردد المبنى', min: 0.5, max: 1.5, step: 0.01 },
      { type: 'buttons', items: [['opt', '✨ ضبط أمثل (دن هارتوغ)', '']] }
    ],
    layers: [{ k: 'frf', name: 'منحنى الاستجابة', color: C.acc, on: true }, { k: 'anim', name: 'الحركة', color: C.warn, on: true }],
    solve(s) {
      const o = { mu: s.mu, f: s.f, z1: s.z1, z2: s.z2, on: s.on === 'y' }, xs = [], ys = [], y0 = [];
      for (let i = 0; i <= 200; i++) { const w = 0.5 + i / 200; xs.push(w); ys.push(PL.calc.tmd(o, w)); y0.push(PL.calc.tmd(Object.assign({}, o, { on: false }), w)); }
      const peak = Math.max(...ys), peak0 = Math.max(...y0);
      return { xs, ys, y0, peak, peak0, cur: PL.calc.tmd(o, s.w), fopt: 1 / (1 + s.mu), zopt: Math.sqrt(3 * s.mu / (8 * Math.pow(1 + s.mu, 3))) };
    },
    action(k, s, r) { if (k === 'opt') { s.f = Math.round(r.fopt * 100) / 100; s.z2 = Math.round(r.zopt * 1000) / 1000; s.on = 'y'; const e = document.querySelector('#plCtrl [data-k="on"]'); if (e) e.value = 'y'; } },
    animated: s => s._lay.anim,
    draw(ctx, W, H, s, r, t) {
      const lay = s._lay, small = W < 620;
      if (lay.anim) {
        const bx = small ? W * 0.5 : W * 0.18, gy = small ? H * 0.5 : H - 30, bh = small ? H * 0.38 : H * 0.7, bw = 60;
        const A = Math.min(40, r.cur * 3), ph = t * 2 * Math.PI * 0.8, x1 = A * Math.sin(ph);
        const x2 = s.on === 'y' ? x1 - Math.min(60, A * 1.8) * Math.sin(ph) : x1;
        ctx.fillStyle = '#3f2e1f'; ctx.fillRect(bx - 90, gy, 180, 10);
        ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.moveTo(bx - bw / 2, gy); ctx.lineTo(bx - bw / 2 + x1, gy - bh); ctx.lineTo(bx + bw / 2 + x1, gy - bh); ctx.lineTo(bx + bw / 2, gy); ctx.fill();
        if (s.on === 'y') { ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(bx + x1, gy - bh + 4); ctx.lineTo(bx + x2, gy - bh + 40); ctx.stroke();
          ctx.fillStyle = C.gold || '#eab308'; ctx.beginPath(); ctx.arc(bx + x2, gy - bh + 44, 10 + s.mu * 60, 0, 7); ctx.fill(); }
        T(ctx, `سعة المبنى ×${nf(r.cur, 1)}`, bx, gy + 22, { bold: true, color: r.cur > 10 ? C.bad : C.ok });
      }
      if (lay.frf) {
        const box = small ? { x: 8, y: 10, w: W - 16, h: H * 0.42 } : { x: W * 0.36, y: 14, w: W * 0.62, h: H - 28 };
        PL.chart(ctx, box, { title: 'تكبير الاستجابة مقابل ω/ωn — رمادي بلا مخمّد', xs: r.xs, x0: 0.5, x1: 1.5, y0: 0, xdec: 2,
          series: [{ ys: r.y0, color: '#94a3b8', dash: [5, 4] }, { ys: r.ys, color: C.acc, w: 2.2 }], vlines: [{ x: s.w, color: '#fff', label: 'الإثارة' }],
          marks: [{ x: s.w, y: r.cur, color: C.warn }] });
      }
    },
    kpis(s, r) { return [['قمة بلا مخمّد', '×' + nf(r.peak0, 1)], ['قمة مع المخمّد', '×' + nf(r.peak, 1), r.peak < r.peak0 / 2 ? 'ok' : 'warn'], ['التخفيض', nf(100 * (1 - r.peak / r.peak0), 0) + '%'],
      ['f الأمثل', nf(r.fopt, 3)], ['ζd الأمثل', nf(r.zopt, 3)]]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>بلا مخمّد قمة الرنين تساوي 1/(2ζ) ≈ ${nf(r.peak0, 0)} مرة الإزاحة الساكنة.</li><li>الكتلة الصغيرة المضبوطة على تردد المبنى تتحرك عكسه فتمتص الطاقة؛ القمة تنقسم لقمتين أصغر.</li><li>إذا ضبطت التردد غلط، المخمّد يصير عديم الفائدة — لهذا يُضبط بعد القياس الحقيقي للمبنى.</li></ul>`,
        math: PL.steps([['دن هارتوغ (1956)'], ['التوافق الأمثل', 'f = 1/(1 + μ)', nf(r.fopt, 3)], ['التخميد الأمثل', 'ζd = √(3μ / 8(1+μ)³)', nf(r.zopt, 3)], ['النظام', '2 درجة حرية — حل مركّب لـ |X₁/Xst|', nf(r.cur, 2)]]),
        code: `<ul class="pl-ul"><li>ASCE 7-16 الفصل 18: أنظمة التخميد بالمباني.</li><li>المخمّدات تُستعمل للرياح والراحة (ISO 10137) أكثر من الزلازل الكبيرة.</li></ul>`,
        try: `<ol class="pl-ul"><li>اختر «بلا مخمّد» وضع الإثارة على 1.00: سعة كبيرة.</li><li>اضغط «ضبط أمثل»: القمة تنزل كثيراً.</li><li>اختر «توافق خاطئ»: الفائدة تضيع.</li></ol>` };
    }
  });
})();
