/* المختبر — الجزء الديناميكي والتطبيقي: اهتزاز المبنى بالزلزال، مسار الحمل حتى التربة، والدرج. */
(function () {
  const PL = window.PHYSLAB; if (!PL) return;
  const { C, math: M, nf } = PL;
  const T = PL.text;

  /* ====================================================================
     ٤) مبنى قصّي تحت الزلزال — أنماط ذاتية + تكامل نيومارك
     ==================================================================== */
  PL.calc.shear = function (o) {
    const N = o.N, m = o.m, k = o.k, A = new Float64Array(N * N);
    for (let i = 0; i < N; i++) {
      A[i * N + i] = (k + (i < N - 1 ? k : 0)) / m;
      if (i < N - 1) { A[i * N + i + 1] = -k / m; A[(i + 1) * N + i] = -k / m; }
    }
    const ev = M.jacobi(A, N);
    const w = ev.map(e => Math.sqrt(Math.max(0, e.val)));
    const modes = ev.map(e => { const top = e.vec[N - 1] || 1; return e.vec.map(v => v / top); });
    const gam = modes.map(ph => ph.reduce((s, v) => s + v, 0) / ph.reduce((s, v) => s + v * v, 0));  // معامل المشاركة (كتل متساوية)
    const mass = modes.map((ph, i) => gam[i] ** 2 * ph.reduce((s, v) => s + v * v, 0) / N);         // نسبة الكتلة المشاركة
    return { w, T: w.map(x => 2 * Math.PI / x), f: w.map(x => x / (2 * Math.PI)), modes, gam, mass };
  };

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const QUAKE = (() => { const r = rng(7), c = [];
    for (let i = 0; i < 14; i++) c.push({ f: 0.4 + 7.6 * r() ** 1.4, p: r() * 6.283, a: 0.4 + r() });
    const n = c.reduce((s, q) => s + q.a, 0); c.forEach(q => { q.a /= n * 0.42; }); return c; })();

  function groundAcc(s, t) {                                     // م/ث²
    const A = s.A * 9.81, f = s.f;
    if (s.exc === 'harm') return A * Math.min(1, t / 1.5) * Math.sin(2 * Math.PI * f * t);
    if (s.exc === 'pulse') { const t0 = 0.5, d = 1 / f; return t > t0 && t < t0 + d ? A * Math.sin(2 * Math.PI * (t - t0) / d) : 0; }
    if (s.exc === 'quake') {
      const env = t < 2 ? (t / 2) ** 2 : t < 9 ? 1 : Math.exp(-0.45 * (t - 9));
      return A * env * QUAKE.reduce((acc, q) => acc + q.a * Math.sin(2 * Math.PI * q.f * t + q.p), 0);
    }
    return 0;
  }

  function simReset(s, r) {
    const N = s.N;
    s._t = 0; s._u = new Float64Array(N); s._v = new Float64Array(N); s._a = new Float64Array(N);
    s._hist = []; s._env = new Float64Array(N); s._Vmax = 0;
    if (s.exc === 'free') { const ph = r.dyn.modes[0], H = N * s.hs; ph.forEach((v, i) => { s._u[i] = v * 0.006 * H; }); }
    // مصفوفات نيومارك (تسارع متوسط)
    const m = r.m, k = r.k, dt = r.dt, be = 0.25, ga = 0.5, w1 = r.dyn.w[0], w2 = r.dyn.w[Math.min(1, N - 1)] || w1;
    const z = s.zeta / 100, a0 = N > 1 ? 2 * z * w1 * w2 / (w1 + w2) : 2 * z * w1, a1 = N > 1 ? 2 * z / (w1 + w2) : 0;
    const K = new Float64Array(N * N);
    for (let i = 0; i < N; i++) { K[i * N + i] = k + (i < N - 1 ? k : 0); if (i < N - 1) { K[i * N + i + 1] = -k; K[(i + 1) * N + i] = -k; } }
    const Cm = new Float64Array(N * N), Ke = new Float64Array(N * N);
    for (let i = 0; i < N * N; i++) Cm[i] = a1 * K[i];
    for (let i = 0; i < N; i++) Cm[i * N + i] += a0 * m;
    for (let i = 0; i < N * N; i++) Ke[i] = K[i] + ga / (be * dt) * Cm[i];
    for (let i = 0; i < N; i++) Ke[i * N + i] += m / (be * dt * dt);
    s._K = K; s._C = Cm; s._Ki = M.inv(Ke, N); s._dt = dt;
    if (s.exc !== 'mode') {                                        // التسارع الابتدائي من الاتزان
      for (let i = 0; i < N; i++) { let f = 0; for (let j = 0; j < N; j++) f -= K[i * N + j] * s._u[j]; s._a[i] = f / m; }
    }
  }

  function simStep(s, r) {
    const N = s.N, m = r.m, dt = s._dt, be = 0.25, ga = 0.5, K = s._K, Cm = s._C;
    const ag = groundAcc(s, s._t + dt), u = s._u, v = s._v, a = s._a;
    const p = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      p[i] = -m * ag + m * (u[i] / (be * dt * dt) + v[i] / (be * dt) + (1 / (2 * be) - 1) * a[i]);
      let cs = 0; for (let j = 0; j < N; j++) cs += Cm[i * N + j] * (ga / (be * dt) * u[j] + (ga / be - 1) * v[j] + dt * (ga / (2 * be) - 1) * a[j]);
      p[i] += cs;
    }
    const un = new Float64Array(N);
    for (let i = 0; i < N; i++) { let x = 0; for (let j = 0; j < N; j++) x += s._Ki[i * N + j] * p[j]; un[i] = x; }
    for (let i = 0; i < N; i++) {
      const an = (un[i] - u[i]) / (be * dt * dt) - v[i] / (be * dt) - (1 / (2 * be) - 1) * a[i];
      v[i] += dt * ((1 - ga) * a[i] + ga * an); a[i] = an; u[i] = un[i];
    }
    s._t += dt;
    return ag;
  }

  const DRIFT_LIM = 0.020;                                         // ASCE 7-16 جدول 12.12-1 (فئة خطورة I/II)

  PL.register({
    id: 'quake', cat: 'dyn', ic: '🌊', name: 'اهتزاز المبنى بالزلزال', sub: 'أنماط · رنين · إزاحة طابقية',
    title: 'كيف يرقص المبنى وقت الزلزال؟',
    learn: 'مبنى بطوابق كتلها بالسقوف وصلابته من الأعمدة. شغّل زلزالاً أو هزّة توافقية وشوف الإزاحة الطابقية لحظة بلحظة، واضغط «رنين!» حتى تهزّه بتردده الطبيعي وتشوف ليش الرنين خطير. الحل عددي بطريقة نيومارك.',
    ratio: 0.6, ratioSmall: 1.35, minH: 420, maxH: 640, liveKpi: true,
    defaults: { N: 5, hs: 3.2, m: 300, nc: 16, cb: 450, fc: 28, zeta: 5, exc: 'quake', f: 1.5, A: 0.3, mode: 1, speed: 1 },
    presets: [
      { name: 'فيلا طابقين', vals: { N: 2, m: 150, nc: 12, cb: 300, exc: 'quake' } },
      { name: 'عمارة 8 طوابق', vals: { N: 8, m: 400, nc: 20, cb: 500, exc: 'quake' } },
      { name: 'اهتزاز حر', vals: { exc: 'free' } },
      { name: 'شكل النمط الثاني', vals: { exc: 'mode', mode: 2 } }
    ],
    controls: [
      { id: 'exc', type: 'select', label: 'نوع الإثارة', opts: [['quake', 'زلزال صناعي'], ['harm', 'هزّة توافقية (جيبية)'], ['pulse', 'نبضة واحدة'], ['free', 'اهتزاز حر (إفلات)'], ['mode', 'عرض نمط اهتزاز']], onChange: s => { s._reset = true; } },
      { id: 'A', label: 'شدّة التسارع الأرضي', min: 0.05, max: 0.8, step: 0.01, unit: 'g', onChange: s => { s._reset = true; } },
      { id: 'f', label: 'تردد الهزّة', min: 0.2, max: 8, step: 0.05, unit: 'Hz' },
      { id: 'mode', label: 'رقم النمط المعروض', min: 1, max: 5, step: 1 },
      { id: 'speed', label: 'سرعة العرض', min: 0.1, max: 2, step: 0.05, unit: '×' },
      { type: 'sep', label: 'المبنى' },
      { id: 'N', label: 'عدد الطوابق', min: 1, max: 12, step: 1, onChange: s => { s._reset = true; } },
      { id: 'hs', label: 'ارتفاع الطابق', min: 2.8, max: 4.5, step: 0.1, unit: 'م', onChange: s => { s._reset = true; } },
      { id: 'm', label: 'كتلة الطابق', min: 30, max: 1500, step: 10, unit: 'طن', onChange: s => { s._reset = true; } },
      { id: 'nc', label: 'عدد الأعمدة بالطابق', min: 4, max: 60, step: 1, onChange: s => { s._reset = true; } },
      { id: 'cb', label: 'مقاس العمود (مربع)', min: 250, max: 900, step: 25, unit: 'مم', onChange: s => { s._reset = true; } },
      { id: 'zeta', label: 'التخميد ζ', min: 1, max: 20, step: 0.5, unit: '%', onChange: s => { s._reset = true; } },
      { type: 'buttons', items: [['play', '⏯ تشغيل/إيقاف', ''], ['reset', '↺ من البداية'], ['res', '🔔 رنين!']] }
    ],
    layers: [
      { k: 'drift', name: 'الإزاحة الطابقية (ألوان)', color: C.warn, on: true },
      { k: 'hist', name: 'تاريخ إزاحة السطح', color: C.acc, on: true },
      { k: 'shear', name: 'قص الطوابق', color: C.sfd, on: 'lvl', lvl: 2 },
      { k: 'modes', name: 'أنماط الاهتزاز', color: C.ok, on: 'lvl', lvl: 2 },
      { k: 'frf', name: 'منحنى التضخيم', color: C.bmd, on: false, lvl: 3, tip: 'استجابة السطح لكل تردد — القمم = الرنين' }
    ],
    solve(s) {
      s.mode = Math.min(s.mode, s.N);
      const Ec = M.Ec(s.fc) * 1000, I = (s.cb / 1000) ** 4 / 12;
      const k = s.nc * 12 * Ec * I / s.hs ** 3;                    // kN/m — أعمدة مثبّتة الطرفين
      const dyn = PL.calc.shear({ N: s.N, m: s.m, k });
      const Hn = s.N * s.hs, Ta = 0.0466 * Math.pow(Hn, 0.9);       // ASCE 7-16 12.8.2.1 (إطار خرساني مقاوم للعزوم)
      const dt = Math.min(0.01, dyn.T[s.N - 1] / 25);
      const r = { k, m: s.m, dyn, Hn, Ta, dt };
      if (s._reset !== false || !s._u || s._u.length !== s.N) s._reset = true;
      return r;
    },
    init(s) { s._play = true; s._reset = true; },
    action(k, s, r) {
      if (k === 'play') s._play = !s._play;
      if (k === 'reset') { s._reset = true; s._play = true; }
      if (k === 'res') { s.exc = 'harm'; s.f = Math.round(r.dyn.f[0] * 100) / 100; s._reset = true; s._play = true;
        const sel = document.querySelector('#plCtrl [data-k="exc"]'); if (sel) sel.value = 'harm'; }
    },
    tick(dt, s, r) {
      if (s._reset) { simReset(s, r); s._reset = false; }
      if (!s._play) return false;
      if (s.exc === 'mode') { s._t += dt * s.speed; return true; }
      let n = Math.min(600, Math.ceil(dt * s.speed / s._dt)), ag = 0;
      for (let i = 0; i < n; i++) ag = simStep(s, r);
      const N = s.N; let Vb = 0;
      for (let i = 0; i < N; i++) { const dr = Math.abs(s._u[i] - (i ? s._u[i - 1] : 0)) / s.hs; if (dr > s._env[i]) s._env[i] = dr; }
      Vb = Math.abs(r.k * s._u[0]); if (Vb > s._Vmax) s._Vmax = Vb;
      s._hist.push([s._t, s._u[N - 1], ag]);
      while (s._hist.length && s._hist[0][0] < s._t - 12) s._hist.shift();
      if (s._t > 60 && s.exc !== 'harm') s._play = false;
      return true;
    },
    draw(ctx, W, H, s, r, t) {
      const small = W < 620, lay = s._lay, N = s.N;
      const bx0 = small ? W * 0.12 : W * 0.06, bw = small ? W * 0.5 : W * 0.28;
      const gy = small ? H * 0.55 : H - 34, topY = 30, sh = (gy - topY) / N;
      let u;
      if (s.exc === 'mode') { const k = Math.max(0, s.mode - 1), ph = r.dyn.modes[k]; u = ph.map(v => v * 0.008 * r.Hn * Math.sin(r.dyn.w[k] * Math.min(1, 2 / r.dyn.T[k]) * (s._t || 0) * r.dyn.T[k] / 1.2)); }
      else u = Array.from(s._u || new Float64Array(N));
      const sc = bw * 0.3 / (0.01 * r.Hn);                             // 1% انحراف كلي = 30% من العرض
      const ag = s._hist && s._hist.length ? s._hist[s._hist.length - 1][2] : 0;
      const gshift = ag / (s.A * 9.81 || 1) * 5;
      // الأرض
      ctx.fillStyle = '#3f2e1f'; ctx.fillRect(0, gy, small ? W : W * 0.42, 14);
      PL.hatch(ctx, gshift, gy, small ? W : W * 0.42, 14, '#8b6b4a', 8);
      const X = (i, xo) => bx0 + xo + gshift + (i < 0 ? 0 : u[i] * sc);
      const drC = dr => dr < 0.005 ? C.ok : dr < 0.01 ? '#a3e635' : dr < DRIFT_LIM ? C.warn : C.bad;
      for (let i = 0; i < N; i++) {
        const y0 = gy - i * sh, y1 = gy - (i + 1) * sh, dr = Math.abs(u[i] - (i ? u[i - 1] : 0)) / s.hs;
        const col = lay.drift ? drC(dr) : '#94a3b8';
        [0.04, 0.5, 0.96].forEach(fx => {
          const xa = X(i - 1, bw * fx), xb = X(i, bw * fx);
          ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath();
          for (let k = 0; k <= 12; k++) { const q = k / 12, sq = 3 * q * q - 2 * q ** 3; const x = xa + (xb - xa) * sq, y = y0 + (y1 - y0) * q; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        });
        ctx.fillStyle = '#64748b'; ctx.fillRect(X(i, -8), y1 - 5, bw + 16, 9);
        if (lay.drift) T(ctx, `${nf(dr * 100, 2)}%`, X(i, bw + 14), (y0 + y1) / 2, { align: 'left', size: 9.5, color: col });
      }
      T(ctx, `الإزاحة مكبّرة ×${nf(sc / (bw / r.Hn) , 0)} تقريباً`, bx0, 14, { align: 'left', size: 9, color: C.mut });
      const tt = s.exc === 'mode' ? `النمط ${s.mode}: T = ${nf(r.dyn.T[s.mode - 1], 3)} ث` : `t = ${nf(s._t || 0, 1)} ث`;
      T(ctx, tt, bx0 + bw, 14, { align: 'right', size: 10.5, bold: true });
      // لوحات يمين
      const px = small ? 8 : W * 0.44, pw = small ? W - 16 : W * 0.55;
      let py = small ? H * 0.58 : 10;
      const nP = [lay.hist && s.exc !== 'mode', lay.shear && s.exc !== 'mode', lay.modes && !small, lay.frf].filter(Boolean).length;
      const ph = small ? (H * 0.42 - 12) / Math.max(1, Math.min(2, nP)) : (H - 20) / Math.max(1, nP);
      const hist = s._hist || [];
      if (lay.hist && hist.length > 2 && s.exc !== 'mode') {
        const xs = hist.map(h => h[0]);
        PL.chart(ctx, { x: px, y: py, w: pw, h: ph - 6 }, { title: 'إزاحة السطح (مم) والتسارع الأرضي', xs, ydec: 0,
          series: [{ ys: hist.map(h => h[1] * 1000), color: C.acc }, { ys: hist.map(h => h[2] / 9.81 * 100), color: 'rgba(139,107,74,.9)', w: 1 }], xl: 'ث' });
        py += ph;
      }
      if (lay.shear && s.exc !== 'mode') {
        const bx = px, by = py, bwid = pw, bh = ph - 6;
        ctx.fillStyle = 'rgba(10,16,32,.85)'; ctx.fillRect(bx, by, bwid, bh); ctx.strokeStyle = C.line; ctx.strokeRect(bx + .5, by + .5, bwid - 1, bh - 1);
        T(ctx, `قص الطوابق الآن (kN) — أقصى قص قاعدة ${nf(s._Vmax || 0, 0)} kN`, bx + bwid - 6, by + 10, { align: 'right', size: 10, bold: true });
        const Vs = []; for (let i = 0; i < N; i++) Vs.push(r.k * (u[i] - (i ? u[i - 1] : 0)));
        const vm = Math.max(...Vs.map(Math.abs), s._Vmax || 0, 1), rowh = (bh - 24) / N;
        Vs.forEach((v, i) => { const y = by + bh - 6 - (i + 1) * rowh, w = Math.abs(v) / vm * (bwid / 2 - 30);
          ctx.fillStyle = v >= 0 ? C.sfd : '#7c3aed'; ctx.fillRect(bx + bwid / 2 + (v >= 0 ? 0 : -w), y + 2, w, rowh - 4);
          T(ctx, `ط${i + 1}`, bx + 14, y + rowh / 2, { size: 9, color: C.mut }); });
        ctx.strokeStyle = '#64748b'; ctx.beginPath(); ctx.moveTo(bx + bwid / 2, by + 20); ctx.lineTo(bx + bwid / 2, by + bh - 4); ctx.stroke();
        py += ph;
      }
      if (lay.modes && !small) {
        const bx = px, by = py, bwid = pw, bh = ph - 6, nm = Math.min(3, N);
        ctx.fillStyle = 'rgba(10,16,32,.85)'; ctx.fillRect(bx, by, bwid, bh); ctx.strokeStyle = C.line; ctx.strokeRect(bx + .5, by + .5, bwid - 1, bh - 1);
        for (let k = 0; k < nm; k++) {
          const cx = bx + bwid * (k + 0.5) / nm, h0 = by + bh - 16, h1 = by + 34, amp = bwid / nm * 0.3;
          ctx.strokeStyle = '#475569'; ctx.beginPath(); ctx.moveTo(cx, h0); ctx.lineTo(cx, h1); ctx.stroke();
          ctx.strokeStyle = C.ok; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, h0);
          const mx = Math.max(...r.dyn.modes[k].map(Math.abs));
          r.dyn.modes[k].forEach((v, i) => { const y = h0 - (i + 1) * (h0 - h1) / N; ctx.lineTo(cx + v / mx * amp * Math.sin(t * 3), y); ctx.fillStyle = C.ok; });
          ctx.stroke();
          T(ctx, `T${k + 1} = ${nf(r.dyn.T[k], 2)} ث`, cx, by + 12, { size: 10, bold: true, color: C.ok });
          T(ctx, `كتلة ${nf(r.dyn.mass[k] * 100, 0)}%`, cx, by + 26, { size: 9, color: C.mut });
        }
        py += ph;
      }
      if (lay.frf) {
        const fs = [], ys = [], w = r.dyn.w, z = s.zeta / 100;
        for (let i = 0; i <= 160; i++) { const f = 0.1 + 9.9 * i / 160, om = 2 * Math.PI * f; fs.push(f);
          let re = 0, im = 0; for (let k = 0; k < N; k++) { const g = r.dyn.gam[k] * r.dyn.modes[k][N - 1], dr = w[k] ** 2 - om * om, di = 2 * z * w[k] * om, d2 = dr * dr + di * di;
            re += g * dr / d2; im -= g * di / d2; }
          ys.push(Math.hypot(re, im) * 9.81 * 1000); }
        const box = small ? { x: 8, y: H * 0.58, w: W - 16, h: H * 0.4 } : { x: px, y: py, w: pw, h: ph - 6 };
        PL.chart(ctx, box, { title: 'إزاحة السطح لكل 1g (مم) — القمم = الرنين', xs: fs, x0: 0.1, x1: 10, ydec: 0, series: [{ ys, color: C.bmd }],
          vlines: [{ x: s.f, color: '#fff', label: 'f' }, ...r.dyn.f.slice(0, 3).map((f, k) => ({ x: f, color: C.ok, label: 'f' + (k + 1) }))], xl: 'Hz' });
      }
    },
    kpis(s, r) {
      const env = s._env ? Math.max(...s._env) : 0;
      return [['الدور الأساسي T₁', nf(r.dyn.T[0], 3) + ' ث'], ['التردد f₁', nf(r.dyn.f[0], 2) + ' Hz'], ['دور الكود Ta', nf(r.Ta, 3) + ' ث'],
        ['صلابة الطابق', nf(r.k / 1000, 0) + ' MN/م'], ['أقصى إزاحة طابقية', nf(env * 100, 2) + '%', env > DRIFT_LIM ? 'bad' : env > 0.01 ? 'warn' : 'ok'],
        ['أقصى قص قاعدة', nf(s._Vmax || 0, 0) + ' kN']];
    },
    explain(s, r) {
      const d = r.dyn, fr = s.f / d.f[0];
      const see = `<ul class="pl-ul">
        <li>المبنى مثل نابض وكتلة: السقوف هي <b>الكتلة</b> والأعمدة هي <b>النابض</b>. لما الأرض تتحرك، السقوف تتأخر عنها فتنحني الأعمدة.</li>
        <li>الألوان على الأعمدة هي <b>الإزاحة الطابقية</b> (فرق حركة سقفين ÷ الارتفاع): أخضر آمن، أصفر انتباه، أحمر تجاوز حد 2%.</li>
        <li>لكل مبنى <b>دور طبيعي</b> T₁ = ${nf(d.T[0], 2)} ث. لما تتطابق هزّة الأرض معه (اضغط «رنين!») تتراكم الحركة وتكبر كثيراً — نسبة التردد الآن ${nf(fr, 2)}.</li>
        <li>التخميد (${nf(s.zeta, 1)}%) هو اللي يمتص الطاقة؛ قلّله وشوف الاهتزاز الحر يطوّل.</li></ul>`;
      const math = PL.steps([
        ['الصلابة والكتلة'],
        ['صلابة الطابق', 'k = n × 12·Ec·I / h³', nf(r.k, 0) + ' kN/م'],
        ['الكتلة', 'm (طن = kN·ث²/م)', nf(s.m, 0)],
        ['القيم الذاتية'],
        ['معادلة الحركة', 'M·ü + C·u̇ + K·u = −M·1·üg', ''],
        ['الأنماط', 'det(K − ω²M) = 0', d.T.slice(0, 3).map((x, i) => `T${i + 1}=${nf(x, 3)}`).join('، ') + ' ث'],
        ...(s.N === 1 ? [['طابق واحد (حل مغلق)', 'T = 2π√(m/k)', nf(2 * Math.PI * Math.sqrt(s.m / r.k), 4) + ' ث']] : []),
        ['نسبة الكتلة المشاركة', 'Γ²·Σφ² / N', d.mass.slice(0, 3).map(x => nf(x * 100, 1) + '%').join('، ')],
        ['الكود'],
        ['الدور التقريبي', 'Ta = Ct·hn^x = 0.0466 × ' + nf(r.Hn, 1) + '^0.9', nf(r.Ta, 3) + ' ث'],
        ['الحد الأعلى للدور', 'Cu·Ta (Cu ≈ 1.4)', nf(1.4 * r.Ta, 3) + ' ث'],
        ['التكامل العددي'],
        ['نيومارك (β = ¼ ، γ = ½)', 'خطوة Δt', nf(r.dt * 1000, 1) + ' مللي ث — مستقر دائماً'],
        ['تخميد رايلي', 'C = a₀M + a₁K', 'ζ = ' + nf(s.zeta, 1) + '% بالنمطين الأول والثاني']
      ]);
      const code = `<ul class="pl-ul">
        <li><b>الكود العراقي للزلازل</b> و<b>ASCE 7-16 §12.8.2</b> — الدور التقريبي Ta = Ct·hn^x (Ct = 0.0466، x = 0.9 للإطارات الخرسانية)، ولا يُعتمد دور أكبر من Cu·Ta.</li>
        <li><b>ASCE 7-16 جدول 12.12-1</b> — حد الإزاحة الطابقية 0.020·hsx لأغلب المباني (فئة الخطورة I/II).</li>
        <li><b>§12.9.1</b> — التحليل الطيفي يأخذ أنماطاً كافية لمشاركة 90% من الكتلة على الأقل.</li>
        <li><b>ACI 318-19 الفصل 18</b> — تفاصيل الأعمدة والجسور المقاومة للزلازل (أساور محصورة ومطيلية).</li>
        <li class="hint">النموذج هنا «مبنى قصّي» مرن: السقوف صلبة والأعمدة مثبّتة الطرفين (Ig كاملة) — للتعليم والمقارنة، والتصميم الفعلي بصفحة التحليل الزلزالي.</li></ul>`;
      const tr = `<ol class="pl-ul">
        <li>اضغط «🔔 رنين!»: الهزّة بتردد f₁ بالضبط — راقب الإزاحة تكبر دورة بعد دورة.</li>
        <li>غيّر التردد إلى ضعف f₁: الاستجابة تصغر كثيراً رغم نفس شدّة الهزّة.</li>
        <li>اختر «عرض نمط اهتزاز» وغيّر الرقم: النمط الثاني فيه نقطة ثابتة بالنص، والثالث نقطتان.</li>
        <li>كبّر الأعمدة من 450 إلى 700 مم: الدور ينقص (المبنى أصلب) والإزاحة الطابقية تقلّ.</li>
        <li>زِد الكتلة (سقوف ثقيلة أو خزانات): الدور يطول والقص يزيد — ليش نخفّف السقوف بالمناطق الزلزالية.</li></ol>`;
      return { see, math, code, try: tr };
    }
  });

  /* ====================================================================
     ٥) مسار الحمل: من البلاطة إلى الجسور إلى الأعمدة إلى التربة (بوسينسك)
     ==================================================================== */
  const Icorner = (m, n) => {                                     // نيومارك: إجهاد تحت ركن مستطيل m=B/z، n=L/z
    const m2 = m * m, n2 = n * n, s = Math.sqrt(m2 + n2 + 1);
    return (1 / (4 * Math.PI)) * (2 * m * n * s / (m2 + n2 + m2 * n2 + 1) * (m2 + n2 + 2) / (m2 + n2 + 1)
      + Math.atan2(2 * m * n * s, m2 + n2 + 1 - m2 * n2));
  };
  // Δσz تحت نقطة (px,py) بعمق z لحمل q على مستطيل B×L متمركز على الأصل
  PL.calc.boussinesq = function (q, B, L, px, py, z) {
    if (z <= 1e-9) return Math.abs(px) <= B / 2 && Math.abs(py) <= L / 2 ? q : 0;
    const F = (a, b) => Math.sign(a) * Math.sign(b) * Icorner(Math.abs(a) / z, Math.abs(b) / z);
    const x1 = -B / 2 - px, x2 = B / 2 - px, y1 = -L / 2 - py, y2 = L / 2 - py;
    return q * (F(x2, y2) - F(x1, y2) - F(x2, y1) + F(x1, y1));
  };

  PL.register({
    id: 'path', cat: 'geo', ic: '🔻', name: 'مسار الحمل حتى التربة', sub: 'مساحات رافدة · أعمدة · بصلة الإجهاد',
    title: 'وين يروح الحمل اللي فوق السقف؟',
    learn: 'تابع «جزيئات الحمل» وهي تنزل من البلاطة للجسور (بقاعدة 45°) ثم للأعمدة ثم للأساس، وتنتشر بالتربة ببصلة الإجهاد. غيّر البحور وعدد الطوابق وتحمّل التربة وشوف حجم الأساس يتغيّر.',
    ratio: 0.58, ratioSmall: 1.35, minH: 400, maxH: 620,
    defaults: { Lx: 5, Ly: 6, q: 12, N: 4, qa: 180, pick: 'c' },
    presets: [
      { name: 'بلاطة مربعة', vals: { Lx: 5, Ly: 5 } },
      { name: 'بلاطة باتجاه واحد', vals: { Lx: 3, Ly: 7.5 } },
      { name: 'تربة ضعيفة', vals: { qa: 90 } },
      { name: 'عمارة 10 طوابق', vals: { N: 10 } }
    ],
    controls: [
      { id: 'Lx', label: 'البحر Lx', min: 2.5, max: 9, step: 0.1, unit: 'م' },
      { id: 'Ly', label: 'البحر Ly', min: 2.5, max: 9, step: 0.1, unit: 'م' },
      { id: 'q', label: 'حمل الطابق الخدمي (ميت + حي)', min: 5, max: 25, step: 0.5, unit: 'kN/م²' },
      { id: 'N', label: 'عدد الطوابق', min: 1, max: 12, step: 1 },
      { id: 'qa', label: 'تحمّل التربة المسموح qa', min: 60, max: 400, step: 5, unit: 'kPa' },
      { id: 'pick', type: 'select', label: 'العمود المتتبَّع', opts: [['c', 'الوسطي (داخلي)'], ['e', 'الطرفي (واجهة)'], ['k', 'الركني']] }
    ],
    layers: [
      { k: 'trib', name: 'المساحات الرافدة', color: C.acc, on: true },
      { k: 'flow', name: 'جريان الحمل (متحرك)', color: C.load, on: true },
      { k: 'beam', name: 'حمل الجسور', color: C.bmd, on: 'lvl', lvl: 2 },
      { k: 'col', name: 'تراكم حمل العمود', color: C.sfd, on: true },
      { k: 'bulb', name: 'بصلة الإجهاد بالتربة', color: C.soil, on: true },
      { k: 'press', name: 'ضغط التماس تحت الأساس', color: C.warn, on: 'lvl', lvl: 2 }
    ],
    solve(s) {
      const A = { c: s.Lx * s.Ly, e: s.Lx * s.Ly / 2, k: s.Lx * s.Ly / 4 }[s.pick];
      const perFloor = s.q * A, P = perFloor * s.N;
      const B = Math.max(1, Math.ceil(Math.sqrt(P / s.qa) * 10) / 10);    // ACI 13.3.1.1: المساحة من الأحمال غير المصعّدة
      const q0 = P / (B * B);
      const ratio = Math.max(s.Lx, s.Ly) / Math.min(s.Lx, s.Ly), oneWay = ratio > 2;
      const zs = []; for (let i = 0; i <= 40; i++) { const z = B * 4 * i / 40; zs.push([z, PL.calc.boussinesq(1, B, B, 0, 0, z)]); }
      const z10 = (zs.find(p => p[1] < 0.1) || zs[zs.length - 1])[0];
      const lsh = Math.min(s.Lx, s.Ly), lng = Math.max(s.Lx, s.Ly);
      const wShort = oneWay ? 0 : s.q * lsh / 3, wLong = oneWay ? s.q * lsh / 2 : s.q * lsh / 2 * (1 - (lsh / lng) ** 2 / 3);  // مكافئ منتظم تقريبي
      return { A, perFloor, P, B, q0, ratio, oneWay, zs, z10, wShort, wLong };
    },
    init(s) { s._parts = null; },
    animated: s => s._lay.flow,
    draw(ctx, W, H, s, r, t) {
      const small = W < 620, lay = s._lay;
      // --- المسقط
      const pw = small ? W - 20 : W * 0.44, ph = small ? H * 0.46 : H - 40;
      const scl = Math.min((pw - 40) / (2 * s.Lx), (ph - 40) / (2 * s.Ly));
      const ox = 10 + (pw - 2 * s.Lx * scl) / 2, oy = 24 + (ph - 2 * s.Ly * scl) / 2;
      const P = (x, y) => [ox + x * scl, oy + (2 * s.Ly - y) * scl];
      T(ctx, 'المسقط — طابق نموذجي', ox + s.Lx * scl, 12, { size: 10.5, bold: true, color: C.mut });
      ctx.fillStyle = '#1e293b'; ctx.fillRect(ox, oy, 2 * s.Lx * scl, 2 * s.Ly * scl);
      if (lay.trib) {                                            // مساحات رافدة لكل لوح
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const x0 = i * s.Lx, y0 = j * s.Ly, x1 = x0 + s.Lx, y1 = y0 + s.Ly;
          const pts = r.oneWay ? null : 1;
          const cols = ['rgba(56,189,248,.28)', 'rgba(52,211,153,.28)'];
          const poly = (arr, c) => { ctx.fillStyle = c; ctx.beginPath(); arr.forEach((p, k) => { const [a, b] = P(p[0], p[1]); k ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke(); };
          if (r.oneWay) {
            if (s.Lx < s.Ly) { poly([[x0, y0], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1], [x0, y1]], cols[0]); poly([[(x0 + x1) / 2, y0], [x1, y0], [x1, y1], [(x0 + x1) / 2, y1]], cols[0]); }
            else { poly([[x0, y0], [x1, y0], [x1, (y0 + y1) / 2], [x0, (y0 + y1) / 2]], cols[1]); poly([[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2], [x1, y1], [x0, y1]], cols[1]); }
          } else {
            const hlf = Math.min(s.Lx, s.Ly) / 2;
            const a = s.Lx >= s.Ly ? [[x0 + hlf, y0 + hlf], [x1 - hlf, y0 + hlf]] : [[x0 + hlf, y0 + hlf], [x0 + hlf, y1 - hlf]];
            const c1 = a[0], c2 = a[1];
            poly([[x0, y0], [x1, y0], c2, c1], s.Lx >= s.Ly ? cols[1] : cols[0]);
            poly([[x0, y1], [x1, y1], c2, c1], s.Lx >= s.Ly ? cols[1] : cols[0]);
            poly([[x0, y0], [x0, y1], c2[0] === c1[0] ? c2 : c1, c1], s.Lx >= s.Ly ? cols[0] : cols[1]);
            poly([[x1, y0], [x1, y1], c2, c2[0] === c1[0] ? c1 : c2], s.Lx >= s.Ly ? cols[0] : cols[1]);
          }
        }
        // المساحة الرافدة للعمود المختار
        const cx = { c: s.Lx, e: 0, k: 0 }[s.pick], cy = { c: s.Ly, e: s.Ly, k: 0 }[s.pick];
        const ax = Math.max(0, cx - s.Lx / 2), bx = Math.min(2 * s.Lx, cx + s.Lx / 2), ay = Math.max(0, cy - s.Ly / 2), by = Math.min(2 * s.Ly, cy + s.Ly / 2);
        const [a1, b1] = P(ax, by), [a2, b2] = P(bx, ay);
        ctx.setLineDash([6, 4]); ctx.strokeStyle = C.warn; ctx.lineWidth = 2; ctx.strokeRect(a1, b1, a2 - a1, b2 - b1); ctx.setLineDash([]);
        T(ctx, `A = ${nf(r.A, 1)} م²`, (a1 + a2) / 2, (b1 + b2) / 2 - 22, { color: C.warn, bold: true, bg: 'rgba(10,16,32,.7)' });
      }
      // الجسور والأعمدة
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4;
      for (let i = 0; i <= 2; i++) { let [a, b] = P(i * s.Lx, 0), [c, d] = P(i * s.Lx, 2 * s.Ly); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
        [a, b] = P(0, i * s.Ly); [c, d] = P(2 * s.Lx, i * s.Ly); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
        const [a, b] = P(i * s.Lx, j * s.Ly), sel = (s.pick === 'c' && i === 1 && j === 1) || (s.pick === 'e' && i === 0 && j === 1) || (s.pick === 'k' && i === 0 && j === 0);
        ctx.fillStyle = sel ? C.warn : '#e2e8f0'; ctx.fillRect(a - 6, b - 6, 12, 12);
      }
      if (lay.beam) {
        const [a, b] = P(s.Lx / 2, s.Ly), [c, d] = P(s.Lx, s.Ly / 2);
        T(ctx, `w≈${nf(s.Lx >= s.Ly ? r.wLong : r.wShort, 1)}`, a, b - 10, { size: 9.5, color: C.bmd, bg: 'rgba(10,16,32,.75)' });
        T(ctx, `w≈${nf(s.Lx >= s.Ly ? r.wShort : r.wLong, 1)}`, c + 26, d, { size: 9.5, color: C.bmd, bg: 'rgba(10,16,32,.75)' });
        T(ctx, 'kN/m لكل جهة', ox + 2 * s.Lx * scl, oy + 2 * s.Ly * scl + 12, { align: 'right', size: 9, color: C.bmd });
      }
      T(ctx, r.oneWay ? `Ly/Lx = ${nf(r.ratio, 2)} > 2 ⇒ باتجاه واحد` : `Ly/Lx = ${nf(r.ratio, 2)} ≤ 2 ⇒ باتجاهين (45°)`, ox, oy + 2 * s.Ly * scl + 12, { align: 'left', size: 9.5, color: C.mut });
      // --- الجزيئات
      if (lay.flow) {
        if (!s._parts) { const g = rng(3); s._parts = Array.from({ length: 70 }, () => ({ x: g() * 2, y: g() * 2, ph: g() })); }
        s._parts.forEach(p => {
          const tt = (t * 0.22 + p.ph) % 1;
          const X0 = p.x * s.Lx, Y0 = p.y * s.Ly, i = Math.min(1, Math.floor(p.x)), j = Math.min(1, Math.floor(p.y));
          const x0 = i * s.Lx, y0 = j * s.Ly, x1 = x0 + s.Lx, y1 = y0 + s.Ly;
          const dl = X0 - x0, dr = x1 - X0, db = Y0 - y0, dt = y1 - Y0;
          let tgt;
          if (r.oneWay) tgt = s.Lx < s.Ly ? (dl < dr ? [x0, Y0] : [x1, Y0]) : (db < dt ? [X0, y0] : [X0, y1]);
          else { const mn = Math.min(dl, dr, db, dt); tgt = mn === dl ? [x0, Y0] : mn === dr ? [x1, Y0] : mn === db ? [X0, y0] : [X0, y1]; }
          const onV = tgt[0] === x0 || tgt[0] === x1, col = onV ? [tgt[0], Math.round(tgt[1] / s.Ly) * s.Ly] : [Math.round(tgt[0] / s.Lx) * s.Lx, tgt[1]];
          let x, y;
          if (tt < 0.5) { const q = tt / 0.5; x = X0 + (tgt[0] - X0) * q; y = Y0 + (tgt[1] - Y0) * q; }
          else { const q = (tt - 0.5) / 0.5; x = tgt[0] + (col[0] - tgt[0]) * q; y = tgt[1] + (col[1] - tgt[1]) * q; }
          const [a, b] = P(x, y);
          ctx.fillStyle = tt < 0.5 ? 'rgba(244,114,182,.9)' : 'rgba(251,146,60,.95)'; ctx.beginPath(); ctx.arc(a, b, 2.4, 0, 7); ctx.fill();
        });
      }
      // --- المقطع الرأسي
      const ex0 = small ? 10 : W * 0.5, ew = small ? W - 20 : W * 0.48, ey0 = small ? H * 0.5 : 20, eh = small ? H * 0.48 : H - 30;
      const soilTop = ey0 + eh * 0.42, soilBot = ey0 + eh - 4, cx = ex0 + ew / 2;
      const flH = (soilTop - ey0 - 14) / s.N;
      ctx.fillStyle = '#2a2016'; ctx.fillRect(ex0, soilTop, ew, soilBot - soilTop);
      const zmax = 4 * r.B, xmax = 2.5 * r.B, sx = (ew / 2) / xmax, sz = (soilBot - soilTop - 20) / zmax;
      const Bpx = Math.min(ew * 0.45, r.B * Math.min(sx, sz * 1.2));
      if (lay.bulb) {
        const nx = 44, nz = 30;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const xm = -xmax + 2 * xmax * (i + .5) / nx, zm = zmax * (j + .5) / nz, v = PL.calc.boussinesq(1, r.B, r.B, xm, 0, zm);
          const band = v > 0.8 ? 1 : v > 0.5 ? 0.8 : v > 0.3 ? 0.62 : v > 0.2 ? 0.46 : v > 0.1 ? 0.3 : v > 0.05 ? 0.14 : 0;
          if (!band) continue;
          ctx.fillStyle = PL.seq(band); ctx.globalAlpha = 0.75;
          ctx.fillRect(cx + xm * sx - ew / nx / 2 - .5, soilTop + 16 + zm * sz - (soilBot - soilTop) / nz / 2, ew / nx + 1, (soilBot - soilTop - 20) / nz + 1);
          ctx.globalAlpha = 1;
        }
        T(ctx, `عمق التأثير (10% من الضغط) ≈ ${nf(r.z10, 1)} م ≈ ${nf(r.z10 / r.B, 1)}B`, ex0 + ew - 6, soilBot - 10, { align: 'right', size: 9.5, color: '#fff', bg: 'rgba(10,16,32,.7)' });
        [[0.5, '50%'], [0.2, '20%'], [0.1, '10%']].forEach(([v, lab]) => { const p = r.zs.find(q => q[1] < v); if (p) T(ctx, lab, cx + 4, soilTop + 16 + p[0] * sz, { align: 'left', size: 9, color: '#0b1020', bold: true }); });
      }
      PL.hatch(ctx, ex0, soilTop, ew, 4, C.soil, 6);
      // الأساس
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(cx - Bpx / 2, soilTop + 2, Bpx, 14);
      T(ctx, `أساس ${nf(r.B, 1)}×${nf(r.B, 1)} م`, cx + Bpx / 2 + 6, soilTop + 9, { align: 'left', size: 10, color: '#e2e8f0', bold: true });
      if (lay.press) {
        ctx.fillStyle = 'rgba(251,191,36,.35)'; ctx.strokeStyle = C.warn; ctx.fillRect(cx - Bpx / 2, soilTop + 16, Bpx, 12); ctx.strokeRect(cx - Bpx / 2, soilTop + 16, Bpx, 12);
        T(ctx, `q = P/B² = ${nf(r.q0, 0)} ≤ qa = ${nf(s.qa, 0)} kPa`, cx, soilTop + 38, { size: 9.5, color: C.warn, bg: 'rgba(10,16,32,.7)' });
      }
      // الطوابق والعمود
      for (let i = 0; i < s.N; i++) {
        const y = soilTop - (i + 1) * flH;
        ctx.fillStyle = '#475569'; ctx.fillRect(ex0 + 10, y, ew - 20, 5);
        if (lay.col) T(ctx, `${nf(r.perFloor * (s.N - i), 0)} kN`, cx + 10, y + flH / 2 + 2, { align: 'left', size: 9.5, color: C.sfd });
      }
      ctx.fillStyle = '#cbd5e1'; ctx.fillRect(cx - 5, soilTop - s.N * flH, 10, s.N * flH + 2);
      if (lay.col) T(ctx, `عند الأساس P = ${nf(r.P, 0)} kN`, cx - 12, soilTop - 10, { align: 'right', size: 10.5, bold: true, color: C.sfd, bg: 'rgba(10,16,32,.7)' });
      if (lay.flow) {
        for (let k = 0; k < 26; k++) {
          const tt = ((t * 0.3) + k / 26) % 1, yTop = soilTop - s.N * flH;
          let x, y;
          if (tt < 0.6) { x = cx + ((k % 3) - 1) * 2.5; y = yTop + (soilTop - yTop) * tt / 0.6; }
          else { const q = (tt - 0.6) / 0.4, ang = -1.2 + 2.4 * ((k * 0.37) % 1); x = cx + Math.sin(ang) * q * r.z10 * sx * 0.8; y = soilTop + 16 + Math.cos(ang) * q * r.z10 * sz; }
          ctx.fillStyle = tt < 0.6 ? 'rgba(167,139,250,.95)' : 'rgba(251,191,36,.8)'; ctx.beginPath(); ctx.arc(x, y, 2.3, 0, 7); ctx.fill();
        }
      }
      T(ctx, 'مقطع رأسي عبر العمود المتتبَّع', ex0 + ew / 2, ey0 - 6 < 8 ? 10 : ey0 - 6, { size: 10.5, bold: true, color: C.mut });
    },
    kpis(s, r) {
      return [['المساحة الرافدة', nf(r.A, 1) + ' م²'], ['حمل الطابق على العمود', nf(r.perFloor, 0) + ' kN'], ['حمل العمود عند الأساس', nf(r.P, 0) + ' kN'],
        ['مقاس الأساس', nf(r.B, 1) + ' × ' + nf(r.B, 1) + ' م'], ['ضغط التماس', nf(r.q0, 0) + ' kPa', r.q0 > s.qa ? 'bad' : 'ok'], ['عمق التأثير', nf(r.z10, 1) + ' م']];
    },
    explain(s, r) {
      const see = `<ul class="pl-ul">
        <li>كل كيلو على السقف لازم «يوصل» للأرض. البلاطة توزّعه على الجسور المحيطة بخطوط 45° من الزوايا (${r.oneWay ? 'هنا البلاطة طويلة فتشتغل باتجاه واحد وتنقل الحمل للجسرين الطويلين' : 'شبه منحرف للجسر الطويل ومثلث للقصير'}).</li>
        <li>الجسور تنقل الحمل للأعمدة، وكل عمود يشيل «المساحة الرافدة» حوله: الداخلي يشيل ضعف الطرفي وأربعة أضعاف الركني.</li>
        <li>الحمل يتراكم نزولاً: عمود الطابق الأرضي يشيل كل الطوابق فوقه (${nf(r.P, 0)} kN).</li>
        <li>بالتربة الضغط ينتشر مثل <b>البصلة</b>: تحت الأساس بعمق ≈ 2B يصير الإجهاد 10% بس — لهذا فحص التربة لازم يوصل لهذا العمق.</li></ul>`;
      const math = PL.steps([
        ['العمود'],
        ['المساحة الرافدة', { c: 'Lx·Ly', e: 'Lx·Ly/2', k: 'Lx·Ly/4' }[s.pick], nf(r.A, 2) + ' م²'],
        ['حمل الطابق', 'q·A', nf(r.perFloor, 1) + ' kN'],
        ['عند الأساس', 'N·q·A', nf(r.P, 0) + ' kN'],
        ['الأساس'],
        ['المساحة المطلوبة', 'A = P / qa', nf(r.P / s.qa, 2) + ' م²'],
        ['المقاس (مقرّب لـ 10 سم)', 'B = √A', nf(r.B, 2) + ' م'],
        ['ضغط التماس', 'q = P / B²', nf(r.q0, 1) + ' kPa'],
        ['التربة (بوسينسك/نيومارك)'],
        ['تحت المركز', 'Δσz = 4·q·I(m, n) ، m = n = B/2z', ''],
        ['عند z = B', '', nf(PL.calc.boussinesq(1, r.B, r.B, 0, 0, r.B) * 100, 1) + '% من q'],
        ['عند z = 2B', '', nf(PL.calc.boussinesq(1, r.B, r.B, 0, 0, 2 * r.B) * 100, 1) + '% من q'],
        ['الجسور (مكافئ منتظم تقريبي)'],
        ['الجسر الطويل', r.oneWay ? 'q·Lقصير/2' : 'q·Lقصير/2·(1 − r²/3)', nf(r.wLong, 1) + ' kN/م لكل جهة'],
        ['الجسر القصير', r.oneWay ? '— (لا يحمل)' : 'q·Lقصير/3', nf(r.wShort, 1) + ' kN/م لكل جهة']
      ]);
      const code = `<ul class="pl-ul">
        <li><b>ACI 318-19 §13.3.1.1</b> — مساحة الأساس تُحسب من الأحمال غير المصعّدة وتحمّل التربة المسموح.</li>
        <li><b>§8.10.2.3 / §7.1</b> — البلاطة التي نسبة ضلعيها > 2 تُصمَّم باتجاه واحد.</li>
        <li><b>§6.6.2 / §8.4.1</b> — توزيع الأحمال للعناصر الساندة (المساحات الرافدة).</li>
        <li><b>الكود العراقي للأحمال</b> — الأحمال الحية للاستعمالات (سكني 2.0، مكاتب 2.5–3.0 kN/م² …).</li>
        <li>بوسينسك (1885) ونيومارك (1935) لتوزيع الإجهاد بالتربة المرنة — أساس فحص الهبوط بالمرجع الجيوتقني.</li></ul>`;
      const tr = `<ol class="pl-ul">
        <li>اختر «بلاطة باتجاه واحد»: الجزيئات كلها تروح للجسرين الطويلين والقصير ما يشيل من البلاطة.</li>
        <li>بدّل العمود المتتبَّع بين الوسطي والركني: الحمل ينزل للربع.</li>
        <li>اختر «تربة ضعيفة»: الأساس يكبر والبصلة تعمق معه — الأساس الأعرض يوصل تأثيره أعمق.</li>
        <li>زِد الطوابق إلى 12 وشوف ضغط الأساس وحجمه — هنا نبدأ نفكّر بالحصيرة أو الركائز.</li></ol>`;
      return { see, math, code, try: tr };
    }
  });

  /* ====================================================================
     ٦) الدرج — هندسة الخطوة والتصميم وارتفاع الرأس (نفس معادلات stairs.flight)
     ==================================================================== */
  PL.calc.stair = function (s) {
    const R = s.H / s.N, going = (s.N - 1) * s.T, th = Math.atan2(R, s.T), cs = Math.cos(th);
    const span = going + s.land, t = s.t;
    const wD = t / 1000 * 24 / cs + 0.5 * R * 27 + 1.2, wu = 1.2 * wD + 1.6 * 3.0;
    const Mu = wu * span * span / 8, d = t - 26;
    const req = M.asReq(Mu, 1000, d, s.fc, 420);
    const As = Math.max(req === null ? NaN : req, 0.0018 * 1000 * t);
    let main = null;
    for (const db of [10, 12, 16, 20]) { const ab = Math.PI * db * db / 4, sp = Math.floor(1000 * ab / As / 25) * 25;
      if (sp >= 100) { main = { db, s: Math.min(sp, Math.min(3 * t, 450)) }; break; } }
    const Vu = wu * span / 2, ls = Math.min(1, Math.sqrt(2 / (1 + d / 250))), rw = Math.min(0.02, Math.max(0.0025, As / (1000 * d)));
    const phiVc = 0.75 * Math.min(0.66 * ls * Math.cbrt(rw) * Math.sqrt(s.fc), 0.42 * Math.sqrt(s.fc)) * d;   // kN/م — ACI 22.5.5.1
    const blondel = 2 * R + s.T;
    const x0 = (s.H - s.ts - 2.03 - R) / Math.tan(th);                 // بداية فتحة السقف المطلوبة (من أول قائمة)
    const openReq = Math.max(0, going - x0);
    return { R, going, th, span, wD, wu, Mu, d, As, req, main, Vu, phiVc, blondel, openReq, x0,
      ok: { R: R <= 0.19, T: s.T >= 0.25, B: blondel >= 0.6 && blondel <= 0.65, t: t >= span * 1000 / 20 - 1, V: Vu <= phiVc, open: s.open >= openReq - 0.01 } };
  };

  PL.register({
    id: 'stair', cat: 'build', ic: '🪜', name: 'الدرج والإنسان', sub: 'بلوندل · ارتفاع الرأس · تسليح القلبة',
    title: 'ليش الدرج المريح 17.5×28 وكم لازم تكون فتحة السقف؟',
    learn: 'شخص يصعد الدرج بخطواته: غيّر القائمة والنائمة وشوف خطوته تصير مريحة أو متعبة، وقصّر فتحة السقف وشوف راسه يضرب! التصميم الإنشائي للقلبة بنفس معادلات صفحة الأدراج بالمنصة (ACI 318-19).',
    ratio: 0.58, ratioSmall: 1.1, minH: 400, maxH: 620,
    defaults: { H: 3.2, N: 18, T: 0.28, t: 180, land: 1.2, ts: 0.2, open: 3.6, fc: 25 },
    presets: [
      { name: 'مريح (سكني)', vals: { H: 3.2, N: 18, T: 0.28, open: 3.6 } },
      { name: 'شديد الانحدار', vals: { N: 14, T: 0.24 } },
      { name: 'فتحة قصيرة', vals: { open: 1.8 } }
    ],
    controls: [
      { id: 'H', label: 'ارتفاع الطابق', min: 2.6, max: 4.5, step: 0.05, unit: 'م' },
      { id: 'N', label: 'عدد القائمات', min: 10, max: 28, step: 1 },
      { id: 'T', label: 'النائمة T', min: 0.22, max: 0.34, step: 0.005, unit: 'م' },
      { id: 'open', label: 'طول فتحة السقف', min: 0.5, max: 6, step: 0.05, unit: 'م' },
      { type: 'sep', label: 'الإنشائي' },
      { id: 't', label: 'سماكة الوِتر', min: 100, max: 350, step: 10, unit: 'مم' },
      { id: 'land', label: 'طول البسطة السفلية', min: 0, max: 2.5, step: 0.05, unit: 'م' },
      { id: 'ts', label: 'سماكة السقف فوق', min: 0.12, max: 0.35, step: 0.01, unit: 'م' },
      { id: 'fc', label: "f'c", min: 20, max: 40, step: 1, unit: 'MPa' },
      { type: 'buttons', items: [['fit', '✂ فتحة بالضبط', ''], ['walk', '⏯ امشِ/قف']] }
    ],
    layers: [
      { k: 'person', name: 'الإنسان يمشي', color: '#e2e8f0', on: true },
      { k: 'geom', name: 'الأبعاد', color: C.acc, on: true },
      { k: 'head', name: 'غلاف ارتفاع الرأس 2.03م', color: C.warn, on: true },
      { k: 'load', name: 'الأحمال', color: C.load, on: 'lvl', lvl: 2 },
      { k: 'bmd', name: 'مخطط العزم', color: C.bmd, on: 'lvl', lvl: 2 },
      { k: 'rebar', name: 'التسليح', color: C.steel, on: 'lvl', lvl: 2 }
    ],
    solve(s) { return PL.calc.stair(s); },
    init(s) { s._walk = true; s._p = 0; },
    action(k, s, r) { if (k === 'fit') s.open = Math.ceil(r.openReq * 20) / 20; if (k === 'walk') s._walk = !s._walk; },
    tick(dt, s, r) { if (!s._walk || !s._lay.person) return false; s._p = ((s._p || 0) + dt * 1.6) % (s.N + 3); return true; },
    draw(ctx, W, H, s, r, t) {
      const lay = s._lay, small = W < 620;
      const xa = -s.land - 0.4, xb = r.going + 1.6, za = -0.5, zb = s.H + 0.6;
      const sc = Math.min((W - 40) / (xb - xa), (H * (lay.bmd ? 0.78 : 0.95) - 20) / (zb - za));
      const ox = 20 + ((W - 40) - (xb - xa) * sc) / 2 - xa * sc, oy = 12 + (zb) * sc;
      const P = (x, z) => [ox + x * sc, oy - z * sc];
      const R = r.R, tanT = Math.tan(r.th), tw = s.t / 1000 / Math.cos(r.th);
      // الأرضية والسقف العلوي
      ctx.fillStyle = '#475569';
      let [a, b] = P(xa, 0); let [c, d] = P(0, -0.2); ctx.fillRect(a, b, c - a, d - b);
      [a, b] = P(r.going, s.H); [c, d] = P(xb, s.H - s.ts); ctx.fillRect(a, b, c - a, d - b);
      const openStart = r.going - s.open;
      [a, b] = P(xa, s.H); [c, d] = P(openStart, s.H - s.ts); if (c > a) { ctx.fillStyle = '#56657d'; ctx.fillRect(a, b, c - a, d - b); PL.hatch(ctx, a, b, c - a, d - b, '#7c8aa3', 7); }
      // القلبة: الدرجات والوِتر
      ctx.fillStyle = '#3b4a63'; ctx.beginPath();
      [a, b] = P(-s.land, 0); ctx.moveTo(a, b);
      for (let i = 0; i < s.N; i++) { [a, b] = P(i * s.T, i * R); ctx.lineTo(a, b); [a, b] = P(i * s.T, (i + 1) * R); ctx.lineTo(a, b);
        if (i < s.N - 1) { [a, b] = P((i + 1) * s.T, (i + 1) * R); ctx.lineTo(a, b); } }
      [a, b] = P(r.going, s.H - tw * Math.cos(r.th) * 0 - s.t / 1000); ctx.lineTo(a, b);
      [a, b] = P(0, -tw); ctx.lineTo(a, b); [a, b] = P(-s.land, -s.t / 1000); ctx.lineTo(a, b);
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.stroke();
      // الركائز (جسور البسطة والطابق)
      ctx.fillStyle = '#64748b'; [a, b] = P(-s.land - 0.25, 0); ctx.fillRect(a, b, 0.25 * sc, 0.5 * sc);
      [a, b] = P(r.going, s.H); ctx.fillRect(a, b, 0.25 * sc, 0.5 * sc);
      // غلاف ارتفاع الرأس
      if (lay.head) {
        ctx.fillStyle = 'rgba(251,191,36,.12)'; ctx.strokeStyle = C.warn; ctx.setLineDash([5, 4]); ctx.beginPath();
        [a, b] = P(0, R); ctx.moveTo(a, b); [a, b] = P(r.going, s.H); ctx.lineTo(a, b);
        [a, b] = P(r.going, s.H + 2.03); ctx.lineTo(a, b); [a, b] = P(0, R + 2.03); ctx.lineTo(a, b); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        const hit = openStart > r.x0 + 0.01;
        [a, b] = P(Math.max(0, openStart), s.H - s.ts);
        if (hit) { ctx.fillStyle = C.bad; ctx.beginPath(); ctx.arc(a, b, 6 + 2 * Math.sin(t * 8), 0, 7); ctx.fill(); }
        T(ctx, hit ? `⚠ الفتحة قصيرة: المطلوب ${nf(r.openReq, 2)} م` : `ارتفاع الرأس ≥ 2.03 م ✓ (الفتحة المطلوبة ${nf(r.openReq, 2)} م)`, a, b - 14, { color: hit ? C.bad : C.ok, bold: true, bg: 'rgba(10,16,32,.8)', size: 10.5 });
      }
      // الأحمال
      if (lay.load) {
        const n = 12; [a, b] = P(-s.land, s.H * 0.3);
        for (let i = 0; i <= n; i++) { const x = -s.land + (r.span) * i / n, zTop = Math.max(0, x) * tanT + R + 0.9; const [p1, q1] = P(x, zTop), [p2, q2] = P(x, Math.max(0, x) * tanT + R + 0.05); PL.arrow(ctx, p1, q1, p2, q2, C.load, 1.2, 6); }
        const [p, q] = P(r.going / 2, r.going / 2 * tanT + R + 1.1);
        T(ctx, `wu = ${nf(r.wu, 2)} kN/m² (على المسقط)`, p, q, { color: C.load, bold: true, bg: 'rgba(10,16,32,.75)' });
      }
      // التسليح
      if (lay.rebar) {
        const cov = 0.03 / Math.cos(r.th);
        ctx.strokeStyle = C.steel; ctx.lineWidth = 2.2; ctx.beginPath();
        [a, b] = P(-s.land - 0.15, -s.t / 1000 + 0.03); ctx.moveTo(a, b); [a, b] = P(0, -tw + cov); ctx.lineTo(a, b); [a, b] = P(r.going + 0.2, s.H - s.t / 1000 + 0.03); ctx.lineTo(a, b); ctx.stroke();
        ctx.lineWidth = 1.8; ctx.beginPath(); [a, b] = P(r.going - r.span / 4, s.H - r.span / 4 * tanT - 0.04); ctx.moveTo(a, b); [a, b] = P(r.going + 0.2, s.H - 0.03); ctx.lineTo(a, b); ctx.stroke();
        ctx.fillStyle = C.steel; for (let x = 0.15; x < r.going; x += 0.3) { [a, b] = P(x, x * tanT - tw + cov + 0.025); ctx.beginPath(); ctx.arc(a, b, 2, 0, 7); ctx.fill(); }
        [a, b] = P(r.going * 0.45, r.going * 0.45 * tanT - tw - 0.18);
        T(ctx, r.main ? `رئيسي Ø${r.main.db} @ ${r.main.s} مم · علوي عند الانكسار` : 'زِد السماكة', a, b, { color: C.steel, bold: true, size: 10.5, bg: 'rgba(10,16,32,.75)' });
      }
      // الأبعاد
      if (lay.geom) {
        const i = Math.floor(s.N / 2); [a, b] = P(i * s.T, i * R);
        T(ctx, `R = ${nf(R * 1000, 0)}`, a - 6, b - R * sc / 2, { align: 'right', size: 10, color: C.acc, bg: 'rgba(10,16,32,.7)' });
        [a, b] = P(i * s.T + s.T / 2, (i + 1) * R);
        T(ctx, `T = ${nf(s.T * 1000, 0)}`, a, b - 9, { size: 10, color: C.acc, bg: 'rgba(10,16,32,.7)' });
        [a, b] = P(-s.land, -0.35); T(ctx, `البحر ℓ = ${nf(r.span, 2)} م · الزاوية ${nf(r.th * 180 / Math.PI, 1)}° · 2R+T = ${nf(r.blondel * 1000, 0)} مم`, a, b, { align: 'left', size: 10, color: r.ok.B ? C.ok : C.warn });
      }
      // الإنسان
      if (lay.person) {
        const p = s._p || 0, k = Math.min(s.N - 1, Math.max(0, Math.floor(p) - 1)), f = p - Math.floor(p);
        const xs = p < 1 ? -s.land * 0.6 + p * s.land * 0.6 : p > s.N ? r.going + (p - s.N) * 0.4 : k * s.T + s.T / 2 + f * s.T;
        const zs = p < 1 ? 0 : p > s.N ? s.H : (k + 1) * R + f * R;
        const hgt = 1.75, [fx, fz] = P(xs, zs), [hx, hz] = P(xs + 0.05, zs + hgt - 0.12);
        const head = zs + hgt, sof = xs < openStart ? s.H - s.ts : 99, bump = head > sof;
        ctx.strokeStyle = bump ? C.bad : '#e2e8f0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        const [hipx, hipz] = P(xs, zs + 0.95), sw = Math.sin(f * Math.PI * 2) * 0.22;
        ctx.beginPath(); ctx.moveTo(hipx, hipz); ctx.lineTo(...P(xs + sw, zs + (sw > 0 ? R : 0))); ctx.moveTo(hipx, hipz); ctx.lineTo(...P(xs - sw, zs)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hipx, hipz); ctx.lineTo(...P(xs + 0.03, zs + 1.45)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(...P(xs + 0.03, zs + 1.38)); ctx.lineTo(...P(xs - sw * 0.8, zs + 0.95)); ctx.moveTo(...P(xs + 0.03, zs + 1.38)); ctx.lineTo(...P(xs + sw * 0.8, zs + 1.0)); ctx.stroke();
        ctx.fillStyle = bump ? C.bad : '#e2e8f0'; ctx.beginPath(); ctx.arc(hx, hz, 0.11 * sc, 0, 7); ctx.fill(); ctx.lineCap = 'butt';
        if (bump) T(ctx, 'آخ! راسي 💥', hx, hz - 0.25 * sc, { color: C.bad, bold: true, size: 12, bg: 'rgba(10,16,32,.8)' });
      }
      // مخطط العزم
      if (lay.bmd) {
        const y0 = oy + 0.55 * sc + 20, hh = H - y0 - 8; if (hh > 20) {
          const [xL] = P(-s.land, 0), [xR] = P(r.going, 0);
          ctx.strokeStyle = '#475569'; ctx.beginPath(); ctx.moveTo(xL, y0); ctx.lineTo(xR, y0); ctx.stroke();
          ctx.fillStyle = 'rgba(251,146,60,.3)'; ctx.strokeStyle = C.bmd; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xL, y0);
          for (let i = 0; i <= 40; i++) { const x = r.span * i / 40, m = r.wu * x * (r.span - x) / 2; ctx.lineTo(xL + (xR - xL) * i / 40, y0 + m / r.Mu * (hh - 6)); }
          ctx.lineTo(xR, y0); ctx.closePath(); ctx.fill(); ctx.stroke();
          T(ctx, `Mu = wu·ℓ²/8 = ${nf(r.Mu, 1)} kN·m/م`, (xL + xR) / 2, y0 + hh - 4, { color: C.bmd, bold: true, size: 10.5, bg: 'rgba(10,16,32,.75)' });
        }
      }
    },
    kpis(s, r) {
      return [['القائمة R', nf(r.R * 1000, 0) + ' مم', r.ok.R ? 'ok' : 'bad'], ['بلوندل 2R+T', nf(r.blondel * 1000, 0) + ' مم', r.ok.B ? 'ok' : 'warn'],
        ['السماكة ≥ ℓ/20', nf(s.t, 0) + ' / ' + nf(r.span * 50, 0), r.ok.t ? 'ok' : 'warn'], ['Mu', nf(r.Mu, 1) + ' kN·م/م'],
        ['الحديد', r.main ? 'Ø' + r.main.db + '@' + r.main.s : '—', r.main ? '' : 'bad'], ['القص', nf(r.Vu, 1) + ' / ' + nf(r.phiVc, 1), r.ok.V ? 'ok' : 'bad'],
        ['فتحة السقف', nf(s.open, 2) + ' / ' + nf(r.openReq, 2) + ' م', r.ok.open ? 'ok' : 'bad']];
    },
    explain(s, r) {
      const see = `<ul class="pl-ul">
        <li>خطوة الإنسان المريحة على الأرض المستوية ≈ 63 سم، وكل رفعة للأعلى «تكلّف» ضعف طولها — لهذا قاعدة <b>بلوندل 2R + T ≈ 600–650 مم</b>. هنا ${nf(r.blondel * 1000, 0)} مم ${r.ok.B ? '✓ مريح' : '✗ متعب'}.</li>
        <li>الشريط الأصفر فوق الدرجات هو المساحة اللي لازم تبقى فاضية لراس الإنسان (2.03 م). السقف اللي فوق لازم ينقطع (فتحة) بطول ${nf(r.openReq, 2)} م على الأقل.</li>
        <li>القلبة إنشائياً بلاطة مائلة بسيطة الإسناد بين جسر البسطة وجسر الطابق: العزم أكبر بالنص فالحديد الرئيسي تحت على طول الميل.</li>
        <li>عند الانكسار (التقاء القلبة بالبسطة) يصير عزم سالب موضعي، فنضيف حديداً علوياً بطول ربع البحر.</li></ul>`;
      const math = PL.steps([
        ['الهندسة'],
        ['القائمة', 'R = H / N', nf(r.R * 1000, 1) + ' مم'],
        ['طول القلبة الأفقي', '(N − 1)·T', nf(r.going, 2) + ' م'],
        ['البحر', 'ℓ = الطول + البسطة', nf(r.span, 2) + ' م'],
        ['الميل', 'θ = atan(R/T)', nf(r.th * 180 / Math.PI, 1) + '°'],
        ['الأحمال (على المسقط)'],
        ['الميت', 'wD = t·24/cosθ + ½R·27 + 1.2', nf(r.wD, 2) + ' kN/م²'],
        ['المصعّد', 'wu = 1.2wD + 1.6×3.0', nf(r.wu, 2) + ' kN/م²'],
        ['العزم', 'Mu = wu·ℓ²/8', nf(r.Mu, 2) + ' kN·م/م'],
        ['التصميم'],
        ['الحديد', "As = max(ويتني ، 0.0018·b·t)", nf(r.As, 0) + ' مم²/م'],
        ['التوزيع', r.main ? `Ø${r.main.db} @ ${r.main.s} ≤ min(3t، 450)` : 'السماكة غير كافية', ''],
        ['القص', 'Vu = wu·ℓ/2 مقابل φVc (بلا أساور، λs)', nf(r.Vu, 1) + ' / ' + nf(r.phiVc, 1) + ' kN/م ' + PL.ok(r.ok.V)],
        ['ارتفاع الرأس'],
        ['بداية الفتحة', 'x₀ = (H − ts − 2.03 − R) / tanθ', nf(r.x0, 2) + ' م من أول قائمة'],
        ['طول الفتحة المطلوب', '(N−1)T − x₀', nf(r.openReq, 2) + ' م']
      ]);
      const code = `<ul class="pl-ul">
        <li><b>IBC 2021 §1011.5.2</b> — القائمة ≤ 190 مم (المفضّل 150–175) والنائمة ≥ 250–280 مم، و<b>§1011.5.4</b> انتظام القائمات ضمن 10 مم.</li>
        <li><b>IBC §1011.3</b> — ارتفاع الرأس ≥ 2032 مم (80 إنش) مقيساً رأسياً من خط حافات الدرجات.</li>
        <li><b>ACI 318-19 جدول 7.3.1.1</b> — سماكة البلاطة البسيطة ≥ ℓ/20 ما لم يُحسب الهطول.</li>
        <li><b>§7.6.1.1 و24.4.3</b> — أقل حديد 0.0018·b·h، و<b>§7.7.2.3</b> تباعد ≤ min(3h، 450 مم).</li>
        <li><b>§22.5.5.1</b> — مقاومة القص للبلاطة بلا أساور مع معامل الحجم λs.</li>
        <li class="hint">المعادلات مطابقة لدالة <code>stairs.flight</code> المستعملة بقارئ الأوتوكاد وصفحة الأدراج.</li></ul>`;
      const tr = `<ol class="pl-ul">
        <li>اختر «شديد الانحدار»: القائمة تتجاوز 190 مم وبلوندل يطلع من النطاق — لاحظ كيف الشخص يرفع رجله أكثر.</li>
        <li>اختر «فتحة قصيرة» وخلّ الشخص يمشي: راسه يضرب بحافة السقف! اضغط «✂ فتحة بالضبط».</li>
        <li>زِد البسطة من 1.2 إلى 2.4 م: البحر يطول والعزم يتضاعف تقريباً (يتناسب مع ℓ²).</li>
        <li>قلّل السماكة حتى يختفي الحديد المقترح — هذا حد السماكة الإنشائي.</li></ol>`;
      return { see, math, code, try: tr };
    }
  });
})();
