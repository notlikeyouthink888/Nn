/* مختبرات إضافية (٢): الانضمام (ترزاغي) · الجدار الساند (رانكين) · خزان الماء والطفو · الرياح مع الارتفاع ·
   نمو مقاومة الخرسانة مع العمر والحرارة · ضغط الخرسانة الطرية على القالب (ACI 347) */
(function () {
  const PL = window.PHYSLAB; if (!PL) return;
  const { C, math: M, nf } = PL, T = PL.text;

  /* ====================================================================
     ١) الانضمام أحادي البعد — ترزاغي
     ==================================================================== */
  PL.calc.consol = {
    U(Tv) { if (Tv <= 0) return 0; let s = 0; for (let m = 0; m < 60; m++) { const Mm = Math.PI * (2 * m + 1) / 2; s += 2 / (Mm * Mm) * Math.exp(-Mm * Mm * Tv); } return Math.max(0, 1 - s); },
    u(Z, Tv) { if (Tv <= 0) return 1; let s = 0; for (let m = 0; m < 60; m++) { const Mm = Math.PI * (2 * m + 1) / 2; s += 2 / Mm * Math.sin(Mm * Z) * Math.exp(-Mm * Mm * Tv); } return s; }  // Z = z/Hdr
  };
  PL.register({
    id: 'consol', cat: 'geo', ic: '⏳', name: 'الانضمام (هبوط الطين)', sub: 'ترزاغي · ضغط الماء المسامي · الزمن',
    title: 'ليش المبنى على الطين يستمر ينزل سنين؟',
    learn: 'الحمل يضغط الماء داخل مسامات الطين أولاً، والماء يطلع ببطء نحو طبقات الرمل. شغّل الزمن وشوف منحنيات ضغط الماء (الإيزوكرونات) تنخفض والهبوط يزيد — وكيف التصريف من الجهتين يسرّع الهبوط أربع مرات.',
    ratio: 0.56, ratioSmall: 1.2, minH: 400, maxH: 580,
    defaults: { Hc: 6, drain: 'd', cv: 2, ds: 100, mv: 0.4, lt: 0 },
    presets: [{ name: 'تصريف من الجهتين', vals: { drain: 'd' } }, { name: 'تصريف من الأعلى فقط', vals: { drain: 's' } }, { name: 'طين سميك بطيء', vals: { Hc: 12, cv: 0.8 } }],
    controls: [
      { id: 'Hc', label: 'سماكة طبقة الطين', min: 1, max: 20, step: 0.5, unit: 'م' },
      { id: 'drain', type: 'select', label: 'التصريف', opts: [['d', 'من الجهتين (رمل فوق وتحت)'], ['s', 'من الأعلى فقط (صخر تحت)']] },
      { id: 'cv', label: 'معامل الانضمام cv', min: 0.2, max: 20, step: 0.1, unit: 'م²/سنة' },
      { id: 'ds', label: 'زيادة الإجهاد Δσ', min: 20, max: 300, step: 5, unit: 'kPa' },
      { id: 'mv', label: 'معامل الانضغاط mv', min: 0.05, max: 1.5, step: 0.05, unit: 'م²/MN' },
      { id: 'lt', label: 'الزمن (log₁₀ سنة)', min: -2, max: 2, step: 0.02, fmt: v => nf(Math.pow(10, v), Math.pow(10, v) < 1 ? 2 : 1) + ' سنة' },
      { type: 'buttons', items: [['play', '▶ شغّل الزمن', '']] }
    ],
    layers: [{ k: 'iso', name: 'منحنيات ضغط الماء', color: C.acc, on: true }, { k: 'water', name: 'حركة الماء', color: '#38bdf8', on: true }, { k: 'curve', name: 'الهبوط مع الزمن', color: C.bmd, on: true }],
    solve(s) {
      const Hdr = s.drain === 'd' ? s.Hc / 2 : s.Hc, t = Math.pow(10, s.lt), Tv = s.cv * t / (Hdr * Hdr), U = PL.calc.consol.U(Tv);
      const Sf = s.mv / 1000 * s.ds * s.Hc * 1000;                  // مم
      const t50 = 0.197 * Hdr * Hdr / s.cv, t90 = 0.848 * Hdr * Hdr / s.cv;
      return { Hdr, t, Tv, U, Sf, S: U * Sf, t50, t90 };
    },
    action(k, s) { if (k === 'play') { s.lt = -2; s._play = true; } },
    tick(dt, s) { if (!s._play) return false; s.lt = Math.min(2, s.lt + dt * 0.8); if (s.lt >= 2) s._play = false; PL.sync(); return true; },
    animated: s => s._lay.water,
    draw(ctx, W, H, s, r, t) {
      const lay = s._lay, small = W < 620, x0 = 20, w = small ? W - 40 : W * 0.5, y0 = 50, hC = small ? H * 0.34 : H * 0.62;
      ctx.fillStyle = '#c2a36b'; ctx.fillRect(x0, y0 - 24, w, 24); T(ctx, 'رمل (يصرّف)', x0 + w / 2, y0 - 12, { size: 10, color: '#1f1406' });
      const Z = zz => s.drain === 'd' ? (zz <= 0.5 ? zz * 2 : (1 - zz) * 2) : zz;   // z/Hdr من أقرب سطح تصريف
      for (let j = 0; j < 40; j++) { const zz = (j + .5) / 40, uu = PL.calc.consol.u(Z(zz), r.Tv); ctx.fillStyle = PL.seq(0.15 + 0.7 * uu); ctx.globalAlpha = 0.85; ctx.fillRect(x0, y0 + j * hC / 40, w, hC / 40 + 1); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.drain === 'd' ? '#c2a36b' : '#57534e'; ctx.fillRect(x0, y0 + hC, w, 22); T(ctx, s.drain === 'd' ? 'رمل (يصرّف)' : 'صخر (لا يصرّف)', x0 + w / 2, y0 + hC + 11, { size: 10, color: s.drain === 'd' ? '#1f1406' : '#e7e5e4' });
      ctx.fillStyle = '#64748b'; ctx.fillRect(x0 + w * 0.25, y0 - 24 - 20 - r.S / r.Sf * 12, w * 0.5, 20); T(ctx, `مبنى — هبوط ${nf(r.S, 0)} مم`, x0 + w / 2, y0 - 54 - r.S / r.Sf * 12, { bold: true });
      if (lay.water) for (let k = 0; k < 40; k++) {
        const zz = ((k * 0.618) % 1), uu = PL.calc.consol.u(Z(zz), r.Tv); if (uu < 0.03) continue;
        const up = s.drain === 's' || zz < 0.5, prog = (t * 0.25 * (0.3 + uu) + k * 0.13) % 1, y = y0 + (up ? zz * (1 - prog) : zz + (1 - zz) * prog) * hC;
        ctx.fillStyle = 'rgba(56,189,248,.9)'; ctx.beginPath(); ctx.arc(x0 + (k * 37 % (w - 20)) + 10, y, 2.2, 0, 7); ctx.fill();
      }
      if (lay.iso) {
        const bx = small ? x0 : x0 + w + 20, bw = small ? w : W * 0.18, by = small ? y0 + hC + 40 : y0;
        const bh = small ? H * 0.2 : hC;
        ctx.strokeStyle = '#475569'; ctx.strokeRect(bx, by, bw, bh);
        [0.01, 0.05, 0.2, 0.5, r.Tv].forEach((tv, i) => { ctx.strokeStyle = i === 4 ? '#fff' : 'rgba(56,189,248,.5)'; ctx.lineWidth = i === 4 ? 2.4 : 1.2; ctx.beginPath();
          for (let j = 0; j <= 40; j++) { const zz = j / 40, uu = PL.calc.consol.u(Z(zz), tv); const X = bx + Math.min(1, uu) * bw, Y = by + zz * bh; j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); });
        T(ctx, 'u/Δσ بالعمق', bx + bw / 2, by - 8, { size: 10, color: C.acc, bold: true });
      }
      if (lay.curve) {
        const box = small ? { x: 8, y: H * 0.8, w: W - 16, h: H * 0.19 } : { x: W * 0.74, y: 20, w: W * 0.25, h: H * 0.8 };
        const xs = [], ys = []; for (let i = 0; i <= 80; i++) { const l = -2 + 4 * i / 80, tv = s.cv * Math.pow(10, l) / (r.Hdr * r.Hdr); xs.push(l); ys.push(-PL.calc.consol.U(tv) * r.Sf); }
        PL.chart(ctx, box, { title: 'الهبوط (مم) مقابل log(t)', xs, x0: -2, x1: 2, series: [{ ys, color: C.bmd }], marks: [{ x: s.lt, y: -r.S, color: '#fff' }], xl: 'log سنة' });
      }
    },
    kpis(s, r) { return [['الهبوط النهائي', nf(r.Sf, 0) + ' مم'], ['الهبوط الآن', nf(r.S, 0) + ' مم'], ['درجة الانضمام U', nf(r.U * 100, 1) + '%'], ['t50', nf(r.t50, 2) + ' سنة'], ['t90', nf(r.t90, 2) + ' سنة']]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>بالبداية الماء يشيل كل الحمل (اللون الأصفر = ضغط ماء عالٍ) والتربة ما تنضغط بعد.</li><li>الماء يطلع نحو الرمل؛ كل ما طلع، انتقل الحمل للحبيبات ونزل المبنى.</li>
        <li>الزمن يتناسب مع مربع مسافة التصريف: التصريف من الجهتين ينصّفها ⇒ الزمن ربع.</li></ul>`,
        math: PL.steps([['ترزاغي 1925'], ['معامل الزمن', 'Tv = cv·t / Hdr²', nf(r.Tv, 4)], ['درجة الانضمام', 'U = 1 − Σ (2/M²)·e^(−M²Tv)', nf(r.U * 100, 1) + '%'], ['الهبوط النهائي', 'S = mv·Δσ·H', nf(r.Sf, 0) + ' مم'],
          ['الزمن لـ 50%', 't50 = 0.197·Hdr²/cv', nf(r.t50, 3) + ' سنة'], ['الزمن لـ 90%', 't90 = 0.848·Hdr²/cv', nf(r.t90, 3) + ' سنة']]),
        code: `<ul class="pl-ul"><li>ACI 318-19 §13.3.1 يترك تقدير الهبوط لتقرير التربة؛ والهبوط التفاضلي يولّد عزوماً إضافية بالإطار.</li><li>التحميل المسبق (Preloading) والمصارف الرأسية تقصّر Hdr فيتسرّع الانضمام قبل البناء.</li></ul>`,
        try: `<ol class="pl-ul"><li>بدّل التصريف إلى «من الأعلى فقط»: t90 يتضاعف أربع مرات.</li><li>شغّل الزمن وراقب منحنى ضغط الماء الأبيض ينزل.</li></ol>` };
    }
  });

  /* ====================================================================
     ٢) الجدار الساند — رانكين والاستقرار
     ==================================================================== */
  PL.calc.retain = function (s) {
    const d2r = Math.PI / 180, Ka = Math.pow(Math.tan((45 - s.phi / 2) * d2r), 2), Kp = Math.pow(Math.tan((45 + s.phi / 2) * d2r), 2);
    const Ht = s.H + s.tb, g = 18, gc = 24;
    const Pa = 0.5 * Ka * g * Ht * Ht, Pq = Ka * s.q * Ht;
    const Lt = s.B * s.toe, ts = s.tb2, heel = s.B - Lt - ts, a = Math.min(0.25, ts), key = s.key || 0;
    // مركز شبه منحرف وجهه الخلفي شاقولي: (a² + ab + b²) / 3(a + b) من الوجه الخلفي
    const xs = (a * a + a * ts + ts * ts) / (3 * (a + ts));
    const W = [[(a + ts) / 2 * s.H * gc, Lt + ts - xs], [s.B * s.tb * gc, s.B / 2], [Math.max(0, heel) * s.H * g, Lt + ts + heel / 2], [Math.max(0, heel) * s.q, Lt + ts + heel / 2], [key * ts * gc, Lt + ts / 2]];
    const V = W.reduce((a, w) => a + w[0], 0), Mr = W.reduce((a, w) => a + w[0] * w[1], 0), Mo = Pa * Ht / 3 + Pq * Ht / 2;
    const Df = s.tb + key, Pp = 0.5 * Kp * g * Df * Df;   // مقاومة سلبية أمام القاعدة ومفتاح القص
    const mu = Math.tan(2 / 3 * s.phi * d2r), FSs = (mu * V + Pp) / (Pa + Pq), FSo = Mr / Mo;
    const xb = (Mr - Mo) / V, e = s.B / 2 - xb, over = xb <= 0;
    const qmax = over ? Infinity : Math.abs(e) <= s.B / 6 ? V / s.B * (1 + 6 * e / s.B) : 2 * V / (3 * xb), qmin = Math.abs(e) <= s.B / 6 ? V / s.B * (1 - 6 * e / s.B) : 0;
    return { Ka, Kp, Ht, Pa, Pq, Pp, Df, key, V, Mr, Mo, mu, FSs, FSo, xb, e, qmax, qmin, Lt, ts, heel, over, inKern: Math.abs(e) <= s.B / 6 };
  };
  PL.register({
    id: 'retain', cat: 'geo', ic: '🧱', name: 'الجدار الساند', sub: 'رانكين · انقلاب · انزلاق · تحمّل',
    title: 'شنو يمنع الجدار الساند من الانقلاب والانزلاق؟',
    learn: 'التربة خلف الجدار تدفعه بضغط مثلثي (رانكين). وزن الجدار والتربة فوق الكعب يقاومانه. غيّر العرض والكعب والإجهاد الإضافي وشوف معاملات الأمان ووين تقع المحصّلة — لازم داخل الثلث الأوسط.',
    ratio: 0.58, ratioSmall: 1.2, minH: 400, maxH: 600,
    defaults: { H: 4, tb: 0.5, B: 3, toe: 0.25, tb2: 0.35, key: 0.7, phi: 30, q: 10, qa: 200 },
    presets: [{ name: 'تصميم متوازن', vals: { H: 4, B: 3, toe: 0.25, key: 0.7, phi: 30 } }, { name: 'بلا مفتاح قص', vals: { H: 4, B: 3, toe: 0.25, key: 0, phi: 30 } },
      { name: 'قاعدة قصيرة', vals: { H: 4, B: 1.6, toe: 0.25, key: 0.7, phi: 30 } }, { name: 'بلا كعب (كله أمامي)', vals: { H: 4, B: 3, toe: 0.75, key: 0.7, phi: 30 } }],
    controls: [
      { id: 'H', label: 'ارتفاع الجدار', min: 1.5, max: 8, step: 0.1, unit: 'م' }, { id: 'B', label: 'عرض القاعدة', min: 1, max: 6, step: 0.05, unit: 'م' },
      { id: 'toe', label: 'نسبة المقدّمة (toe)', min: 0, max: 0.8, step: 0.01 }, { id: 'tb', label: 'سماكة القاعدة', min: 0.3, max: 1, step: 0.05, unit: 'م' },
      { id: 'tb2', label: 'سماكة الجدار عند القاعدة', min: 0.25, max: 0.8, step: 0.05, unit: 'م' },
      { id: 'key', label: 'عمق مفتاح القص تحت القاعدة', min: 0, max: 1.2, step: 0.05, unit: 'م' },
      { id: 'phi', label: 'زاوية الاحتكاك φ', min: 20, max: 42, step: 1, unit: '°' }, { id: 'q', label: 'حمل إضافي فوق التربة', min: 0, max: 40, step: 1, unit: 'kPa' },
      { id: 'qa', label: 'تحمّل التربة المسموح', min: 80, max: 400, step: 10, unit: 'kPa' }
    ],
    layers: [{ k: 'press', name: 'ضغط التربة', color: C.load, on: true }, { k: 'wedge', name: 'إسفين الانهيار', color: C.bad, on: true }, { k: 'res', name: 'المحصّلة والثلث الأوسط', color: C.ok, on: true }, { k: 'bear', name: 'ضغط الأساس', color: C.warn, on: true }],
    solve(s) { return PL.calc.retain(s); },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, sc = Math.min((W * 0.6) / (s.B + r.Ht * 0.9), (H - 120) / (r.Ht + r.key)), ox = W * 0.14, gy = H - 60 - r.key * sc, X = x => ox + x * sc, Y = z => gy - z * sc;
      ctx.fillStyle = '#6b4f2e'; ctx.fillRect(X(r.Lt + r.ts), Y(r.Ht), W - X(r.Lt + r.ts), r.Ht * sc); PL.hatch(ctx, X(r.Lt + r.ts), Y(r.Ht), W - X(r.Lt + r.ts), r.Ht * sc, 'rgba(0,0,0,.25)', 9);
      ctx.fillStyle = '#6b4f2e'; ctx.fillRect(0, gy, W, H - gy); ctx.fillRect(0, Y(s.tb), X(0), s.tb * sc);
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(X(0), Y(s.tb), s.B * sc, s.tb * sc);
      if (r.key > 0) ctx.fillRect(X(r.Lt), Y(0), r.ts * sc, r.key * sc);
      ctx.beginPath(); ctx.moveTo(X(r.Lt), Y(s.tb)); ctx.lineTo(X(r.Lt + r.ts), Y(s.tb)); ctx.lineTo(X(r.Lt + r.ts), Y(r.Ht)); ctx.lineTo(X(r.Lt + r.ts - 0.25), Y(r.Ht)); ctx.closePath(); ctx.fill();
      if (s.q) for (let x = r.Lt + r.ts + 0.2; x < r.Lt + r.ts + r.Ht; x += 0.4) PL.arrow(ctx, X(x), Y(r.Ht) - 26, X(x), Y(r.Ht) - 2, C.load, 1.2, 5);
      if (lay.wedge) { ctx.strokeStyle = C.bad; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.6; const ang = (45 + s.phi / 2) * Math.PI / 180;
        ctx.beginPath(); ctx.moveTo(X(s.B), Y(0)); ctx.lineTo(X(s.B + r.Ht / Math.tan(ang)), Y(r.Ht)); ctx.stroke(); ctx.setLineDash([]);
        T(ctx, `45° + φ/2 = ${nf(45 + s.phi / 2, 0)}°`, X(s.B + r.Ht / Math.tan(ang) / 2) + 8, Y(r.Ht / 2), { align: 'left', size: 10, color: C.bad }); }
      if (lay.press) { const px = X(s.B), k = 55 / Math.max(1, r.Ka * 18 * r.Ht + r.Ka * s.q);
        ctx.fillStyle = 'rgba(244,114,182,.3)'; ctx.strokeStyle = C.load; ctx.beginPath(); ctx.moveTo(px, Y(r.Ht)); ctx.lineTo(px + r.Ka * s.q * k, Y(r.Ht)); ctx.lineTo(px + (r.Ka * s.q + r.Ka * 18 * r.Ht) * k, Y(0)); ctx.lineTo(px, Y(0)); ctx.closePath(); ctx.fill(); ctx.stroke();
        PL.arrow(ctx, px + 70, Y(r.Ht / 3), px + 8, Y(r.Ht / 3), C.load, 3, 10); T(ctx, `Pa = ${nf(r.Pa + r.Pq, 1)} kN/m`, px + 74, Y(r.Ht / 3), { align: 'left', bold: true, color: C.load });
        // المقاومة السلبية: مثلث رانكين السلبي على المستوى الأمامي بعمق tb + key
        if (r.Pp > 0) { const kp = 34 / (r.Kp * 18 * r.Df), x0 = X(0), zt = s.tb, zb = -r.key;
          ctx.fillStyle = 'rgba(52,211,153,.28)'; ctx.strokeStyle = C.ok; ctx.beginPath(); ctx.moveTo(x0, Y(zt)); ctx.lineTo(x0 - r.Kp * 18 * r.Df * kp, Y(zb)); ctx.lineTo(x0, Y(zb)); ctx.closePath(); ctx.fill(); ctx.stroke();
          const zp = zb + r.Df / 3; PL.arrow(ctx, x0 - 52, Y(zp), x0 - 3, Y(zp), C.ok, 2.4, 9);
          T(ctx, `Pp = ${nf(r.Pp, 1)} kN/m`, Math.max(4, x0 - 96), Y(zb) + 14, { align: 'left', size: 10, bold: true, color: C.ok, bg: 'rgba(10,16,32,.6)' }); } }
      if (lay.res) { ctx.fillStyle = 'rgba(52,211,153,.25)'; ctx.fillRect(X(s.B / 3), Y(0) - 4, s.B / 3 * sc, 8);
        ctx.fillStyle = r.inKern ? C.ok : C.bad; ctx.beginPath(); ctx.arc(X(Math.max(0, r.xb)), Y(0), 6, 0, 7); ctx.fill();
        T(ctx, r.inKern ? 'المحصّلة داخل الثلث الأوسط ✓' : 'المحصّلة خارج الثلث الأوسط ✗', X(s.B / 2), Y(s.tb) - 12, { color: r.inKern ? C.ok : C.bad, bold: true, size: 10.5, bg: 'rgba(10,16,32,.7)' }); }
      const y0 = gy + r.key * sc + 8;
      if (lay.bear && r.over) T(ctx, '⚠ المحصّلة خارج القاعدة — الجدار ينقلب!', X(s.B / 2), y0 + 22, { size: 11.5, color: C.bad, bold: true, bg: 'rgba(10,16,32,.8)' });
      else if (lay.bear) { const k = 30 / Math.max(r.qmax, 1); ctx.fillStyle = 'rgba(251,191,36,.35)'; ctx.strokeStyle = C.warn; ctx.beginPath(); ctx.moveTo(X(0), y0); ctx.lineTo(X(0), y0 + r.qmax * k);
        ctx.lineTo(X(s.B), y0 + r.qmin * k); ctx.lineTo(X(s.B), y0); ctx.closePath(); ctx.fill(); ctx.stroke();
        T(ctx, `qmax ${nf(r.qmax, 0)} · qmin ${nf(r.qmin, 0)} kPa`, X(s.B) + 8, y0 + 14, { align: 'left', size: 10, color: r.qmax <= s.qa ? C.warn : C.bad, bold: true }); }
    },
    kpis(s, r) { return [['Ka', nf(r.Ka, 3)], ['أمان الانقلاب', nf(r.FSo, 2), r.FSo >= 2 ? 'ok' : r.FSo >= 1.5 ? 'warn' : 'bad'], ['أمان الانزلاق', nf(r.FSs, 2), r.FSs >= 1.5 ? 'ok' : 'bad'],
      ['اللامركزية e', nf(r.e, 2) + ' م', r.inKern ? 'ok' : 'bad'], ['qmax', r.over ? 'ينقلب' : nf(r.qmax, 0) + ' kPa', r.qmax <= s.qa ? 'ok' : 'bad']]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>التربة تميل تنزلق على مستوى مائل (إسفين) وتدفع الجدار؛ الضغط يزيد خطياً مع العمق.</li><li>الكعب (خلف الجدار) أذكى من المقدّمة: التربة فوقه وزن مجاني يثبّت الجدار.</li><li>المحصّلة داخل الثلث الأوسط = كل القاعدة مضغوطة، بلا انفصال عن التربة.</li></ul>`,
        math: PL.steps([['رانكين'], ['Ka', 'tan²(45 − φ/2)', nf(r.Ka, 3)], ['قوة التربة', '½·Ka·γ·H²', nf(r.Pa, 1) + ' kN/م'], ['قوة الحمل الإضافي', 'Ka·q·H', nf(r.Pq, 1) + ' kN/م'],
          ['الاستقرار'], ['الانقلاب', 'ΣMr / ΣMo ≥ 2.0', nf(r.FSo, 2)], ['المقاومة السلبية', 'Pp = ½·Kp·γ·(tb + key)²', nf(r.Pp, 1) + ' kN/م'], ['الانزلاق', '(μ·ΣV + Pp) / ΣH ≥ 1.5 (μ = tan⅔φ)', nf(r.FSs, 2)], ['اللامركزية', 'e = B/2 − (Mr − Mo)/ΣV ≤ B/6', nf(r.e, 3) + ' م'],
          ['ضغط التربة', 'ΣV/B·(1 ± 6e/B)', nf(r.qmax, 0) + ' / ' + nf(r.qmin, 0) + ' kPa']]),
        code: `<ul class="pl-ul"><li>ACI 318-19 الفصل 11 (الجدران) و13 (الأساسات)، والجدار الساند كابولي من القاعدة: الحديد الرئيسي بوجه التربة.</li><li>ASCE 7 §3.2 الأحمال الجانبية للتربة (معامل حمل 1.6 للضغط الأفقي H).</li><li>معاملات الأمان 1.5 و 2.0 ممارسة جيوتقنية شائعة (AASHTO و NAVFAC).</li></ul>`,
        try: `<ol class="pl-ul"><li>اختر «بلا مفتاح قص»: الاحتكاك وحده ما يكفي والانزلاق يفشل — لهذا نضيف المفتاح تحت الجدار.</li><li>اختر «قاعدة قصيرة»: الانقلاب يفشل.</li><li>اختر «بلا كعب»: الانزلاق يضعف لأنك خسرت وزن التربة.</li><li>ارفع φ إلى 38°: Ka ينزل والجدار يرتاح.</li></ol>` };
    }
  });

  /* ====================================================================
     ٣) خزان الماء — الضغط الهيدروستاتيكي والطفو
     ==================================================================== */
  PL.register({
    id: 'tank', cat: 'fluid', ic: '💧', name: 'خزان الماء والطفو', sub: 'ضغط هيدروستاتيكي · عزم الجدار · الطفو',
    title: 'ليش الخزان الأرضي الفارغ ممكن يطلع من الأرض؟',
    learn: 'الماء يضغط على الجدار ضغطاً مثلثياً يولّد عزماً كبيراً بقاعدته (∝ الارتفاع³). وبالخزان المدفون الفارغ، الماء الجوفي يدفعه للأعلى — إذا الدفع أكبر من الوزن يطفو! ارفع منسوب الماء الجوفي وشوف.',
    ratio: 0.56, ratioSmall: 1.15, minH: 400, maxH: 580,
    defaults: { mode: 'wall', Hw: 3, hw: 2.7, t: 0.25, L: 6, B: 4, tb: 0.35, gwl: 1.5, proj: 0.3, roof: 0.2 },
    presets: [{ name: 'خزان فوق الأرض', vals: { mode: 'wall', hw: 2.7 } }, { name: 'خزان أرضي فارغ', vals: { mode: 'float', gwl: 0.8 } }, { name: 'منسوب ماء عالي', vals: { mode: 'float', gwl: 0.2 } }],
    controls: [
      { id: 'mode', type: 'select', label: 'الحالة', opts: [['wall', 'مملوء — ضغط على الجدار'], ['float', 'مدفون وفارغ — الطفو']] },
      { id: 'Hw', label: 'ارتفاع الجدار', min: 1.5, max: 6, step: 0.1, unit: 'م' }, { id: 'hw', label: 'عمق الماء داخله', min: 0.5, max: 6, step: 0.1, unit: 'م', onChange: s => { s.hw = Math.min(s.hw, s.Hw); } },
      { id: 't', label: 'سماكة الجدار', min: 0.2, max: 0.6, step: 0.05, unit: 'م' },
      { id: 'L', label: 'الطول', min: 2, max: 20, step: 0.5, unit: 'م' }, { id: 'B', label: 'العرض', min: 2, max: 15, step: 0.5, unit: 'م' },
      { id: 'tb', label: 'سماكة القاعدة', min: 0.25, max: 1, step: 0.05, unit: 'م' }, { id: 'proj', label: 'بروز القاعدة خارج الجدار', min: 0, max: 1.5, step: 0.05, unit: 'م' },
      { id: 'gwl', label: 'عمق الماء الجوفي من السطح', min: 0, max: 6, step: 0.05, unit: 'م' }
    ],
    layers: [{ k: 'press', name: 'الضغط', color: C.acc, on: true }, { k: 'mom', name: 'عزم الجدار', color: C.bmd, on: true }, { k: 'forces', name: 'الوزن والدفع', color: C.ok, on: true }],
    solve(s) {
      s.hw = Math.min(s.hw, s.Hw); const gw = 9.81, gc = 24, D = s.Hw + s.tb;
      const Mb = gw * Math.pow(s.hw, 3) / 6, Vb = gw * s.hw * s.hw / 2, Mu = 1.4 * Mb, d = s.t * 1000 - 60;
      const As = M.asReq(Mu, 1000, d, 30, 420) || NaN, AsMin = 0.003 * 1000 * s.t * 1000;   // ACI 350: 0.003 للجدران المقيّدة
      const Lb = s.L + 2 * (s.t + s.proj), Bb = s.B + 2 * (s.t + s.proj);
      const Vc = (2 * (s.L + s.B + 2 * s.t) * s.t * s.Hw + Lb * Bb * s.tb + (s.L + 2 * s.t) * (s.B + 2 * s.t) * s.roof) * gc;
      const soil = (Lb * Bb - (s.L + 2 * s.t) * (s.B + 2 * s.t)) * (D - s.tb) * 18 * 0.9;
      const sub = Math.max(0, D - s.gwl), U = gw * sub * Lb * Bb, FS = U > 0 ? (Vc + soil) / U : Infinity;
      return { Mb, Vb, Mu, As, AsMin, Vc, soil, U, FS, D, sub };
    },
    draw(ctx, W, H, s, r, t) {
      const lay = s._lay, sc = Math.min((W * 0.55) / (s.B + 2 * s.t + 2 * s.proj + 1), (H - 90) / (r.D + 1)), ox = W * 0.08, gy = 50 + (s.mode === 'float' ? 0 : 0);
      const X = x => ox + x * sc, Y = z => gy + z * sc, wall = s.t, inner = s.B;
      if (s.mode === 'float') { ctx.fillStyle = '#6b4f2e'; ctx.fillRect(0, Y(0), W * 0.68, r.D * sc + 30); ctx.fillStyle = 'rgba(56,189,248,.25)'; ctx.fillRect(0, Y(s.gwl), W * 0.68, (r.D + 1 - s.gwl) * sc);
        T(ctx, '▽ منسوب الماء الجوفي', W * 0.68 - 6, Y(s.gwl) - 8, { align: 'right', size: 10, color: '#7dd3fc' }); }
      const lift = s.mode === 'float' && r.FS < 1 ? Math.min(30, (1 - r.FS) * 60) * (0.5 + 0.5 * Math.sin(t * 2)) : 0;
      ctx.save(); ctx.translate(0, -lift);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(X(0), Y(r.D - s.tb), (inner + 2 * wall + 2 * s.proj) * sc, s.tb * sc);
      ctx.fillRect(X(s.proj), Y(0), wall * sc, (r.D - s.tb) * sc); ctx.fillRect(X(s.proj + wall + inner), Y(0), wall * sc, (r.D - s.tb) * sc);
      if (s.mode === 'float') ctx.fillRect(X(s.proj), Y(0) - s.roof * sc, (inner + 2 * wall) * sc, s.roof * sc);
      if (s.mode === 'wall') { ctx.fillStyle = 'rgba(56,189,248,.45)'; const wt = Y(r.D - s.tb) - s.hw * sc; ctx.fillRect(X(s.proj + wall), wt, inner * sc, s.hw * sc); }
      ctx.restore();
      if (lift) T(ctx, '⚠ الخزان يطفو!', X(s.proj + wall + inner / 2), Y(r.D / 2), { color: C.bad, bold: true, size: 14, bg: 'rgba(10,16,32,.8)' });
      if (lay.press && s.mode === 'wall') { const k = 60 / (9.81 * s.hw), x0 = X(s.proj + wall + inner) + wall * sc + 10, yb = Y(r.D - s.tb);
        ctx.fillStyle = 'rgba(56,189,248,.3)'; ctx.strokeStyle = C.acc; ctx.beginPath(); ctx.moveTo(x0, yb - s.hw * sc); ctx.lineTo(x0 + 9.81 * s.hw * k, yb); ctx.lineTo(x0, yb); ctx.closePath(); ctx.fill(); ctx.stroke();
        T(ctx, `p = γw·h = ${nf(9.81 * s.hw, 1)} kPa`, x0, yb + s.tb * sc + 16, { align: 'left', size: 10, color: C.acc, bold: true }); }
      if (lay.mom && s.mode === 'wall') { const box = { x: W * 0.62, y: 20, w: W * 0.36, h: H * 0.55 }, xs = [], ys = [];
        for (let i = 0; i <= 40; i++) { const z = s.hw * i / 40; xs.push(z); ys.push(9.81 * Math.pow(s.hw - (s.hw - z), 3) / 6); }
        PL.chart(ctx, box, { title: 'عزم الجدار (kN·m/م) مع العمق', xs, x0: 0, x1: s.hw, series: [{ ys, color: C.bmd }], xl: 'العمق (م)' }); }
      if (lay.forces && s.mode === 'float') {
        const cx = X(s.proj + wall + inner / 2);
        PL.arrow(ctx, cx - 30, Y(r.D) + 60, cx - 30, Y(r.D) + 8, '#38bdf8', 3.4, 12); T(ctx, `دفع الماء U = ${nf(r.U, 0)} kN`, cx - 34, Y(r.D) + 72, { align: 'right', color: '#7dd3fc', bold: true });
        PL.arrow(ctx, cx + 30, Y(0) - 50, cx + 30, Y(0) - 4, C.ok, 3.4, 12); T(ctx, `الوزن W = ${nf(r.Vc + r.soil, 0)} kN`, cx + 34, Y(0) - 56, { align: 'left', color: C.ok, bold: true });
      }
    },
    kpis(s, r) { return s.mode === 'wall' ? [['عزم القاعدة', nf(r.Mb, 1) + ' kN·m/م'], ['Mu = 1.4M', nf(r.Mu, 1)], ['القص', nf(r.Vb, 1) + ' kN/م'], ['As المطلوب', nf(Math.max(r.As, r.AsMin), 0) + ' مم²/م'], ['As,min (ACI 350)', nf(r.AsMin, 0)]]
      : [['الوزن', nf(r.Vc + r.soil, 0) + ' kN'], ['دفع الماء', nf(r.U, 0) + ' kN'], ['معامل الأمان', isFinite(r.FS) ? nf(r.FS, 2) : '∞', r.FS >= 1.1 ? 'ok' : 'bad'], ['العمق المغمور', nf(r.sub, 2) + ' م']]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>ضغط الماء = الكثافة × العمق — مثلث من صفر بالسطح لأقصى قيمة بالقاع، فالعزم بقاعدة الجدار ∝ h³: ضاعف العمق يصير العزم 8 مرات.</li>
        <li>أرخميدس: الماء الجوفي يدفع الخزان المدفون للأعلى بوزن الماء المزاح. الخزان الفارغ خفيف نسبياً فممكن يطفو ويتكسّر.</li><li>الحل: بروز القاعدة (تشيل تربة فوقها)، أو قاعدة أسمك، أو ركائز شد، أو صمامات تخفيف.</li></ul>`,
        math: PL.steps([['الجدار (كابولي من القاعدة)'], ['العزم', 'M = γw·h³/6', nf(r.Mb, 2) + ' kN·m/م'], ['القص', 'V = γw·h²/2', nf(r.Vb, 2) + ' kN/م'],
          ['الطفو'], ['الدفع', 'U = γw·h_sub·A', nf(r.U, 0) + ' kN'], ['الوزن المقاوم', 'W = خرسانة + تربة فوق البروز', nf(r.Vc + r.soil, 0) + ' kN'], ['الأمان', 'FS = W / U ≥ 1.1', isFinite(r.FS) ? nf(r.FS, 2) : '∞']]),
        code: `<ul class="pl-ul"><li><b>ACI 350-20</b> (المنشآت الحاوية للسوائل): معامل ديمومة Sd، حد تشقق أشد، غطاء ≥ 50 مم، و As,min = 0.003 للجدران.</li><li>ACI 318-19 §5.3: السوائل F بمعامل 1.4 مع الميت.</li><li>معامل أمان الطفو ≥ 1.1 (ACI 350 R) للحالة الفارغة مع أعلى منسوب ماء.</li></ul>`,
        try: `<ol class="pl-ul"><li>بالخزان فوق الأرض ضاعف عمق الماء: العزم × 8.</li><li>اختر «منسوب ماء عالي»: الخزان يطفو. زِد بروز القاعدة حتى يثبت.</li></ol>` };
    }
  });

  /* ====================================================================
     ٤) الرياح مع الارتفاع — ASCE 7-16
     ==================================================================== */
  const EXPO = { B: { a: 7, zg: 365.76 }, C: { a: 9.5, zg: 274.32 }, D: { a: 11.5, zg: 213.36 } };
  PL.calc.kz = (z, ex) => { const e = EXPO[ex]; return 2.01 * Math.pow(Math.max(z, 4.57) / e.zg, 2 / e.a); };
  PL.register({
    id: 'wind', cat: 'fluid', ic: '💨', name: 'الرياح والمبنى', sub: 'Kz · ضغط/سحب · قص القاعدة',
    title: 'ليش الرياح أقوى فوق؟ وشكد تدفع المبنى؟',
    learn: 'الاحتكاك مع الأرض يبطّئ الرياح قرب السطح، فالسرعة تزيد مع الارتفاع (Kz). الوجه المقابل للرياح ينضغط والخلفي يُسحب. غيّر نوع المنطقة (مدينة/ضواحي/مفتوحة) وارتفاع المبنى وشوف القوى.',
    ratio: 0.58, ratioSmall: 1.2, minH: 400, maxH: 600,
    defaults: { Hb: 40, B: 20, D: 20, V: 45, ex: 'C', hs: 3.5 },
    presets: [{ name: 'داخل المدينة (B)', vals: { ex: 'B' } }, { name: 'منطقة مفتوحة (C)', vals: { ex: 'C' } }, { name: 'ساحل/صحراء (D)', vals: { ex: 'D' } }, { name: 'برج 120 م', vals: { Hb: 120 } }],
    controls: [
      { id: 'ex', type: 'select', label: 'فئة التعرّض', opts: [['B', 'B — مدن وضواحي'], ['C', 'C — أرض مفتوحة'], ['D', 'D — مسطحات/ساحل']] },
      { id: 'V', label: 'سرعة الرياح الأساسية V', min: 25, max: 70, step: 1, unit: 'م/ث' },
      { id: 'Hb', label: 'ارتفاع المبنى', min: 6, max: 150, step: 1, unit: 'م' }, { id: 'B', label: 'العرض المواجه للرياح', min: 6, max: 80, step: 1, unit: 'م' },
      { id: 'D', label: 'العمق باتجاه الرياح', min: 6, max: 80, step: 1, unit: 'م' }, { id: 'hs', label: 'ارتفاع الطابق', min: 3, max: 5, step: 0.1, unit: 'م' }
    ],
    layers: [{ k: 'flow', name: 'جريان الهواء', color: '#7dd3fc', on: true }, { k: 'press', name: 'الضغط والسحب', color: C.load, on: true }, { k: 'kz', name: 'منحنى Kz', color: C.acc, on: true }],
    solve(s) {
      const hr = s.D / s.B, Cpl = hr <= 1 ? -0.5 : hr <= 2 ? -0.5 + 0.2 * (hr - 1) : hr <= 4 ? -0.3 + 0.05 * (hr - 2) : -0.2;
      const q = z => 0.613 * PL.calc.kz(z, s.ex) * 0.85 * s.V * s.V / 1000;       // kPa (Kd = 0.85، Kzt = Ke = 1)
      const G = 0.85, qh = q(s.Hb), n = Math.max(1, Math.round(s.Hb / s.hs)), stories = [];
      let Vb = 0, Mo = 0;
      for (let i = 1; i <= n; i++) { const z = Math.min(s.Hb, i * s.hs), pw = q(z) * G * 0.8, pl = qh * G * Math.abs(Cpl), F = (pw + pl) * s.B * s.hs; stories.push({ z, pw, F }); Vb += F; Mo += F * z; }
      return { Cpl, qh, G, stories, Vb, Mo, kzTop: PL.calc.kz(s.Hb, s.ex), pl: qh * G * Cpl };
    },
    animated: s => s._lay.flow,
    draw(ctx, W, H, s, r, t) {
      const lay = s._lay, small = W < 620, top = small && lay.kz ? H * 0.34 + 26 : 40, sc = (H - 30 - top) / Math.max(s.Hb, 20), gy = H - 30, bx = small ? W * 0.45 : W * 0.3, bw = Math.max(20, Math.min(W * 0.2, s.D * sc));
      ctx.fillStyle = '#3f2e1f'; ctx.fillRect(0, gy, W, 30);
      ctx.fillStyle = '#475569'; ctx.fillRect(bx, gy - s.Hb * sc, bw, s.Hb * sc);
      for (let z = s.hs; z < s.Hb; z += s.hs) { ctx.fillStyle = '#334155'; ctx.fillRect(bx, gy - z * sc, bw, 1.5); }
      if (lay.flow) for (let k = 0; k < 60; k++) {
        const z = (k * 0.618 % 1) * Math.max(s.Hb * 1.4, 20), sp = Math.sqrt(PL.calc.kz(z, s.ex)), x = ((t * 90 * sp + k * 53) % (W + 40)) - 20;
        let y = gy - z * sc;
        if (z < s.Hb * 1.15 && x > bx - 40 && x < bx + bw + 30) y -= Math.max(0, (s.Hb * 1.15 - z)) * sc * Math.min(1, (x - bx + 40) / 40) * (x < bx + bw ? 1 : Math.max(0, 1 - (x - bx - bw) / 30));
        ctx.strokeStyle = 'rgba(125,211,252,.6)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10 * sp, y); ctx.stroke();
      }
      if (lay.press) {
        const pmax = Math.max(...r.stories.map(q => q.pw), Math.abs(r.pl)), k = (bx - 30) * 0.6 / pmax;
        r.stories.forEach(q => { const y = gy - q.z * sc; PL.arrow(ctx, bx - 4 - q.pw * k, y + s.hs * sc / 2, bx - 3, y + s.hs * sc / 2, C.load, 1.4, 6); });
        const lk = Math.abs(r.pl) * k; for (let z = s.hs / 2; z < s.Hb; z += s.hs) { const y = gy - z * sc; PL.arrow(ctx, bx + bw + 3, y, bx + bw + 3 + lk, y, C.comp, 1.4, 6); }
        T(ctx, 'ضغط', bx - 40, gy - s.Hb * sc - 10, { color: C.load, bold: true }); T(ctx, `سحب (Cp = ${nf(r.Cpl, 2)})`, bx + bw + 40, gy - s.Hb * sc - 10, { color: C.comp, bold: true });
      }
      if (lay.kz) { const box = small ? { x: 8, y: 8, w: W - 16, h: H * 0.34 } : { x: W * 0.7, y: 14, w: W * 0.28, h: H * 0.6 }, xs = [], ys = [];
        for (let i = 0; i <= 40; i++) { const z = Math.max(s.Hb, 20) * i / 40; xs.push(z); ys.push(0.613 * PL.calc.kz(z, s.ex) * 0.85 * s.V * s.V / 1000); }
        PL.chart(ctx, box, { title: 'qz (kPa) مع الارتفاع', xs, x0: 0, series: [{ ys, color: C.acc }], xl: 'z (م)', ydec: 2 }); }
    },
    kpis(s, r) { return [['Kz بالسطح', nf(r.kzTop, 2)], ['qh', nf(r.qh, 2) + ' kPa'], ['قص القاعدة', nf(r.Vb, 0) + ' kN'], ['عزم الانقلاب', nf(r.Mo, 0) + ' kN·m'], ['Cp الخلفي', nf(r.Cpl, 2)]]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>السرعة تقل قرب الأرض (احتكاك)؛ بالمدينة (B) المباني تبطّئها أكثر من الأرض المفتوحة (C).</li><li>الضغط ∝ مربع السرعة: رياح أسرع 20% = ضغط أكبر 44%.</li><li>الوجه الخلفي عليه سحب، فالقوة الكلية = ضغط + سحب.</li></ul>`,
        math: PL.steps([['ASCE 7-16'], ['Kz', '2.01·(z/zg)^(2/α) (z ≥ 4.6 م)', nf(r.kzTop, 3) + ' عند السطح'], ['qz', '0.613·Kz·Kzt·Kd·Ke·V²', nf(r.qh, 3) + ' kPa'],
          ['الضغط', 'p = q·G·Cp (G = 0.85 ، Cp = 0.8 / ' + nf(r.Cpl, 2) + ')', ''], ['قص القاعدة', 'Σ (pw + |pl|)·B·h', nf(r.Vb, 0) + ' kN'], ['الانقلاب', 'Σ F·z', nf(r.Mo, 0) + ' kN·m']]),
        code: `<ul class="pl-ul"><li>ASCE 7-16 الفصول 26–27 (الطريقة الاتجاهية)، والكود العراقي للأحمال يعتمد نفس الصيغة بسرعات المدن العراقية.</li><li>ACI 318-19 §5.3: الرياح W بمعامل 1.0 (السرعة الاستراتيجية) بتراكيب 1.2D + 1.0W + L.</li></ul>`,
        try: `<ol class="pl-ul"><li>بدّل B إلى D: القوى تزيد ~40%.</li><li>اختر «برج 120 م»: عزم الانقلاب يقفز لأنه ∝ الارتفاع² تقريباً.</li></ol>` };
    }
  });

  /* ====================================================================
     ٥) عمر الخرسانة — المقاومة والانكماش والزحف (ACI 209)
     ==================================================================== */
  PL.calc.age = function (s, t) {
    const ab = s.cem === 'III' ? [2.3, 0.92] : [4, 0.85];
    const te = t * Math.max(0, s.T + 10) / 30;                      // نضج نيرس-سول (مرجع 20°م، صفر −10°م)
    const f = te <= 0 ? 0 : te / (ab[0] + ab[1] * te);
    const tsh = Math.max(0, t - 7), sh = tsh / (35 + tsh) * 780;       // με
    const tc = Math.max(0, t - 7), cr = Math.pow(tc, 0.6) / (10 + Math.pow(tc, 0.6)) * 2.35;
    return { f, te, sh, cr };
  };
  PL.register({
    id: 'age', cat: 'conc', ic: '📅', name: 'عمر الخرسانة', sub: 'نمو المقاومة · الحرارة · الانكماش · الزحف',
    title: 'متى نشيل الدعامات؟ وليش الشتاء يأخّر الخرسانة؟',
    learn: 'الخرسانة تكسب مقاومتها بالتفاعل الكيميائي مع الماء، وسرعته تعتمد على الحرارة ونوع الإسمنت. حرّك اليوم وشوف متى توصل للنسبة اللازمة لفك القالب الجانبي والدعامات، وكيف الانكماش والزحف يستمران أشهراً.',
    ratio: 0.55, ratioSmall: 1.2, minH: 380, maxH: 560,
    defaults: { fc: 30, cem: 'I', T: 20, day: 7 },
    presets: [{ name: 'صيف 30°م', vals: { T: 30 } }, { name: 'شتاء 5°م', vals: { T: 5 } }, { name: 'إسمنت سريع (III)', vals: { cem: 'III' } }],
    controls: [
      { id: 'fc', label: "f'c بعمر 28 يوم", min: 20, max: 50, step: 1, unit: 'MPa' },
      { id: 'cem', type: 'select', label: 'نوع الإسمنت', opts: [['I', 'Type I — عادي'], ['III', 'Type III — سريع التصلّب']] },
      { id: 'T', label: 'حرارة المعالجة', min: 0, max: 40, step: 1, unit: '°م' },
      { id: 'day', label: 'العمر', min: 0.5, max: 90, step: 0.5, unit: 'يوم' },
      { type: 'buttons', items: [['play', '▶ مرّر الأيام', '']] }
    ],
    layers: [{ k: 'str', name: 'المقاومة', color: C.ok, on: true }, { k: 'marks', name: 'مواعيد الفك', color: C.warn, on: true }, { k: 'shr', name: 'الانكماش والزحف', color: C.bmd, on: 'lvl', lvl: 2 }],
    solve(s) { const now = PL.calc.age(s, s.day), days = [], f = [], sh = [], cr = [];
      for (let i = 0; i <= 120; i++) { const d = 0.5 + 89.5 * i / 120, q = PL.calc.age(s, d); days.push(d); f.push(q.f * 100); sh.push(q.sh); cr.push(q.cr); }
      const when = p => { for (let i = 0; i < days.length; i++) if (f[i] >= p) return days[i]; return null; };
      return { now, days, f, sh, cr, d70: when(70), d50: when(50), fcNow: now.f * s.fc }; },
    action(k, s) { if (k === 'play') { s.day = 0.5; s._play = true; } },
    tick(dt, s) { if (!s._play) return false; s.day = Math.min(90, s.day + dt * 12); if (s.day >= 90) s._play = false; PL.sync(); return true; },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, small = W < 620, cx = small ? W * 0.18 : W * 0.12, cw = 60, ch = H * 0.45, cy = H * 0.2;
      ctx.fillStyle = '#334155'; ctx.fillRect(cx - cw / 2, cy, cw, ch);
      const p = Math.min(1.2, r.now.f), fh = Math.min(1, p) * ch;
      ctx.fillStyle = PL.seq(Math.min(1, p)); ctx.fillRect(cx - cw / 2, cy + ch - fh, cw, fh);
      ctx.strokeStyle = '#e2e8f0'; ctx.strokeRect(cx - cw / 2, cy, cw, ch);
      T(ctx, `${nf(r.fcNow, 1)} MPa`, cx, cy - 14, { bold: true, size: 13 }); T(ctx, `${nf(r.now.f * 100, 0)}% من f'c`, cx, cy + ch + 16, { size: 10.5, color: C.mut });
      T(ctx, `يوم ${nf(s.day, 1)}`, cx, cy + ch + 34, { size: 11, bold: true, color: C.acc });
      const box = small ? { x: 8, y: H * 0.62, w: W - 16, h: H * 0.36 } : { x: W * 0.26, y: 14, w: W * 0.72, h: H - 28 };
      const series = []; if (lay.str) series.push({ ys: r.f, color: C.ok, w: 2.2 });
      if (lay.shr) { series.push({ ys: r.sh.map(v => v / 7.8), color: C.bmd, dash: [5, 3] }); series.push({ ys: r.cr.map(v => v * 100 / 2.35), color: '#c084fc', dash: [2, 3] }); }
      const vl = [{ x: s.day, color: '#fff', label: 'الآن' }];
      if (lay.marks) { if (r.d50) vl.push({ x: r.d50, color: C.acc, label: 'جوانب' }); if (r.d70) vl.push({ x: r.d70, color: C.warn, label: 'دعامات' }); vl.push({ x: 28, color: '#94a3b8', label: '28' }); }
      PL.chart(ctx, box, { title: 'المقاومة % (أخضر) · الانكماش % من النهائي (برتقالي) · الزحف % (بنفسجي)', xs: r.days, x0: 0, x1: 90, y0: 0, y1: 120, series, vlines: vl, xl: 'يوم', xdec: 0 });
    },
    kpis(s, r) { return [['المقاومة الآن', nf(r.fcNow, 1) + ' MPa'], ['العمر المكافئ', nf(r.now.te, 1) + ' يوم'], ['50% (فك الجوانب)', r.d50 ? nf(r.d50, 1) + ' يوم' : '—'], ['70% (فك الدعامات)', r.d70 ? nf(r.d70, 1) + ' يوم' : '> 90'],
      ['الانكماش', nf(r.now.sh, 0) + ' με'], ['معامل الزحف', nf(r.now.cr, 2)]]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>بحرارة 20°م الإسمنت العادي يوصل ~70% بأسبوع و100% بـ 28 يوم.</li><li>البرد يبطّئ التفاعل (تحت −10°م يتوقف) — بالشتاء لا تفك الدعامات بالموعد المعتاد.</li><li>الانكماش (فقدان الماء) والزحف (تشوّه تحت الحمل الدائم) يستمران شهوراً؛ لهذا هطول الجسر بعد سنة أكبر من يوم الفك.</li></ul>`,
        math: PL.steps([['ACI 209R-92'], ['المقاومة', "f'c(t) = t/(a + b·t)·f'c28 (I: a=4، b=0.85)", nf(r.now.f * 100, 1) + '%'], ['العمر المكافئ', 'te = Σ(T + 10)/30·Δt', nf(r.now.te, 1) + ' يوم'],
          ['الانكماش', 'εsh = t/(35 + t)·780 με', nf(r.now.sh, 0) + ' με'], ['الزحف', 'φ = t^0.6/(10 + t^0.6)·2.35', nf(r.now.cr, 2)]]),
        code: `<ul class="pl-ul"><li>ACI 318-19 §26.11.2 إزالة القوالب والدعامات بعد تحقّق المقاومة المطلوبة (باختبار أو نضج)، و§26.5.3 المعالجة ≥ 7 أيام (أو 70% f'c).</li><li>ACI 347R-14 و ACI 228.1R (طريقة النضج).</li><li>§24.2.4.1 مضاعف الهطول طويل الأمد λΔ = ξ/(1 + 50ρ′).</li></ul>`,
        try: `<ol class="pl-ul"><li>اختر «شتاء 5°م»: موعد فك الدعامات يتأخر أكثر من مرتين.</li><li>اختر «إسمنت سريع»: 70% خلال 3–4 أيام.</li></ol>` };
    }
  });

  /* ====================================================================
     ٦) ضغط الخرسانة الطرية على القالب — ACI 347R-14
     ==================================================================== */
  PL.calc.formP = function (s) {
    const g = s.w * 9.81 / 1000, Cw = s.w < 2240 ? Math.max(0.8, 0.5 * (1 + s.w / 2320)) : s.w <= 2400 ? 1.0 : s.w / 2320, Cc = +s.cc, Tt = s.T + 17.8;
    let ccp;
    if (s.el === 'col' || s.R < 2.1 && s.h <= 4.2) ccp = Cw * Cc * (7.2 + 785 * s.R / Tt);
    else ccp = Cw * Cc * (7.2 + 1156 / Tt + 244 * s.R / Tt);
    const hyd = g * s.h, lo = 30 * Cw;
    const p = Math.min(hyd, Math.max(ccp, lo));
    return { ccp, hyd, p, g, zc: p / g, tie: p * Math.pow(s.ts, 2) };
  };
  PL.register({
    id: 'form', cat: 'build', ic: '🪵', name: 'ضغط الخرسانة على القالب', sub: 'ACI 347 · سرعة الصب · الحرارة',
    title: 'ليش القالب ينفجر لما نصب بسرعة؟',
    learn: 'الخرسانة الطرية سائل ثقيل: تضغط على القالب مثل الماء حتى تبدأ تتصلّب من الأسفل. كلما صبّيت أسرع أو كان الجو أبرد، يبقى جزء أطول سائلاً فيزيد الضغط. شغّل الصب وشوف مخطط الضغط وقوة كل رابط (tie).',
    ratio: 0.58, ratioSmall: 1.2, minH: 400, maxH: 600,
    defaults: { el: 'wall', h: 4, R: 2, T: 20, cc: '1', w: 2400, ts: 0.6, tcap: 50 },
    presets: [{ name: 'جدار عادي', vals: { el: 'wall', R: 1.5, T: 20 } }, { name: 'صب سريع بالشتاء', vals: { R: 6, T: 5 } }, { name: 'عمود بالمضخة', vals: { el: 'col', R: 8, h: 3.5 } }],
    controls: [
      { id: 'el', type: 'select', label: 'العنصر', opts: [['wall', 'جدار'], ['col', 'عمود (مسقط ≤ 2 م)']] },
      { id: 'h', label: 'ارتفاع الصب', min: 1, max: 10, step: 0.1, unit: 'م' }, { id: 'R', label: 'سرعة الصب R', min: 0.5, max: 12, step: 0.1, unit: 'م/ساعة' },
      { id: 'T', label: 'حرارة الخرسانة', min: 2, max: 40, step: 1, unit: '°م' },
      { id: 'cc', type: 'select', label: 'كيمياء الإسمنت Cc', opts: [['1', '1.0 — عادي بلا مؤخّر'], ['1.2', '1.2 — مع مؤخّر'], ['1.4', '1.4 — خليط + مؤخّر']] },
      { id: 'w', label: 'كثافة الخرسانة', min: 2000, max: 2600, step: 20, unit: 'كغم/م³' },
      { id: 'ts', label: 'تباعد الروابط', min: 0.3, max: 1.2, step: 0.05, unit: 'م' }, { id: 'tcap', label: 'قدرة الرابط الآمنة', min: 10, max: 150, step: 5, unit: 'kN' },
      { type: 'buttons', items: [['pour', '▶ صبّ', '']] }
    ],
    layers: [{ k: 'press', name: 'مخطط الضغط', color: C.load, on: true }, { k: 'hyd', name: 'الهيدروستاتيكي الكامل', color: C.acc, on: true }, { k: 'ties', name: 'الروابط', color: C.warn, on: true }],
    solve(s) { return PL.calc.formP(s); },
    init(s) { s._lv = 1; },
    action(k, s) { if (k === 'pour') { s._lv = 0; s._play = true; } },
    tick(dt, s) { if (!s._play) return false; s._lv = Math.min(1, s._lv + dt / 5); if (s._lv >= 1) s._play = false; return true; },
    draw(ctx, W, H, s, r) {
      const lay = s._lay, sc = (H - 60) / Math.max(s.h, 3), gy = H - 30, fx = W * 0.25, fw = s.el === 'col' ? 50 : 70;
      const lv = s._lv === undefined ? 1 : s._lv, hc = s.h * lv;
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(fx - 10, gy - s.h * sc, 10, s.h * sc); ctx.fillRect(fx + fw, gy - s.h * sc, 10, s.h * sc);
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(fx, gy - hc * sc, fw, hc * sc);
      const z1 = Math.min(hc, r.zc);                                // عمق الجزء «السائل»
      const gr = ctx.createLinearGradient(0, gy - hc * sc, 0, gy); gr.addColorStop(0, '#a3b1c6'); gr.addColorStop(Math.min(1, z1 / Math.max(hc, 1e-6)), '#64748b'); gr.addColorStop(1, '#475569');
      ctx.fillStyle = gr; ctx.fillRect(fx, gy - hc * sc, fw, hc * sc);
      ctx.fillStyle = '#3f2e1f'; ctx.fillRect(0, gy, W, 30);
      const pmax = Math.max(r.hyd, 1), k = (W * 0.4) / pmax, x0 = fx + fw + 14;
      if (lay.hyd) { ctx.strokeStyle = C.acc; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x0, gy - hc * sc); ctx.lineTo(x0 + r.g * hc * k, gy); ctx.stroke(); ctx.setLineDash([]);
        T(ctx, `هيدروستاتيكي ${nf(r.g * hc, 0)} kPa`, x0 + r.g * hc * k + 6, gy - 10, { align: 'left', size: 10, color: C.acc }); }
      if (lay.press) { const pm = Math.min(r.g * hc, r.p);
        ctx.fillStyle = 'rgba(244,114,182,.3)'; ctx.strokeStyle = C.load; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, gy - hc * sc); ctx.lineTo(x0 + pm * k, gy - (hc - pm / r.g) * sc); ctx.lineTo(x0 + pm * k, gy); ctx.lineTo(x0, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
        T(ctx, `ضغط التصميم ${nf(pm, 1)} kPa`, x0 + pm * k + 6, gy - (hc - pm / r.g) * sc, { align: 'left', bold: true, color: C.load }); }
      if (lay.ties) { const n = Math.floor(s.h / s.ts); for (let i = 1; i <= n; i++) { const y = gy - i * s.ts * sc; if (i * s.ts > hc) continue;
        const depth = hc - i * s.ts, pz = Math.min(r.g * depth, r.p), F = pz * s.ts * s.ts, bad = F > s.tcap;
        ctx.strokeStyle = bad ? C.bad : C.warn; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx - 16, y); ctx.lineTo(fx + fw + 16, y); ctx.stroke();
        T(ctx, nf(F, 0), fx - 20, y, { align: 'right', size: 9.5, color: bad ? C.bad : C.warn }); } T(ctx, 'قوة الرابط (kN)', fx - 20, gy - s.h * sc - 12, { align: 'right', size: 9.5, color: C.warn }); }
    },
    kpis(s, r) { return [['CCP (معادلة 347)', nf(r.ccp, 1) + ' kPa'], ['الهيدروستاتيكي', nf(r.hyd, 1) + ' kPa'], ['ضغط التصميم', nf(r.p, 1) + ' kPa'], ['قوة الرابط الأقصى', nf(r.tie, 1) + ' kN', r.tie <= s.tcap ? 'ok' : 'bad']]; },
    explain(s, r) {
      return { see: `<ul class="pl-ul"><li>أعلى الصب سائل فيضغط مثل الماء (γ·z)؛ الأسفل بدأ يتصلّب فيثبت الضغط عند حدّ أقصى.</li><li>الصب الأسرع أو البرد يطوّل الجزء السائل ⇒ ضغط أكبر. المؤخّرات تعمل نفس الشي.</li><li>كل رابط يشيل الضغط على مساحة s×s: التباعد الكبير = قوة كبيرة = انفجار القالب.</li></ul>`,
        math: PL.steps([['ACI 347R-14'], ['الأعمدة / جدار R < 2.1 و h ≤ 4.2', 'CCP = Cw·Cc·(7.2 + 785R/(T + 17.8))', nf(r.ccp, 1) + ' kPa'],
          ['الجدران الأخرى', 'Cw·Cc·(7.2 + 1156/(T+17.8) + 244R/(T+17.8))', ''], ['الحدود', '30·Cw ≤ CCP ≤ ρ·g·h', nf(r.p, 1) + ' kPa'], ['قوة الرابط', 'p·s²', nf(r.tie, 1) + ' kN']]),
        code: `<ul class="pl-ul"><li>ACI 347R-14 §4.2 الضغط الجانبي للخرسانة، و ACI 318-19 §26.11 تصميم القوالب مسؤولية المقاول بموافقة المهندس.</li><li>الخرسانة ذاتية الدمك (SCC) تُصمَّم قوالبها للضغط الهيدروستاتيكي الكامل.</li></ul>`,
        try: `<ol class="pl-ul"><li>اختر «صب سريع بالشتاء»: الضغط يقترب من الهيدروستاتيكي والروابط تصير حمراء.</li><li>قلّل تباعد الروابط إلى 0.4 م حتى ترجع صفراء.</li></ol>` };
    }
  });
})();
