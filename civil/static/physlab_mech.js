/* المختبر — الجزء الميكانيكي: الجسر (عناصر محدّدة)، العمود (الانبعاج)، المقطع الخرساني (انفعال/إجهاد/φ).
   كل الحسابات دوال نقية في PHYSLAB.calc لتُختبر بـ node ضد الحلول المغلقة. */
(function () {
  const PL = window.PHYSLAB; if (!PL) return;
  const { C, math: M, nf } = PL;
  const T = PL.text;

  /* ====================================================================
     ١) الجسر — تحليل بالعناصر المحدّدة (أويلر-برنولي، دوال هيرميت)
     ==================================================================== */
  PL.calc.beam = function (o) {
    const n = o.n || 96, L = o.L, le = L / n, EI = o.E * o.I, nd = 2 * (n + 1);
    const K = new Float64Array(nd * nd), F = new Float64Array(nd);
    const k = EI / le ** 3, l = le;
    const ke = [12, 6 * l, -12, 6 * l, 6 * l, 4 * l * l, -6 * l, 2 * l * l, -12, -6 * l, 12, -6 * l, 6 * l, 2 * l * l, -6 * l, 4 * l * l];
    for (let e = 0; e < n; e++) {
      const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[d[i] * nd + d[j]] += k * ke[i * 4 + j];
      const w = o.w || 0;                                    // حمل منتظم للأسفل (الموجب للأعلى)
      F[d[0]] -= w * l / 2; F[d[1]] -= w * l * l / 12; F[d[2]] -= w * l / 2; F[d[3]] += w * l * l / 12;
    }
    const P = o.P || 0, a = M.clamp(o.a || 0, 0, L);
    if (P) {
      const e = Math.min(n - 1, Math.floor(a / le)), s = (a - e * le) / le;
      const N = [1 - 3 * s * s + 2 * s ** 3, le * (s - 2 * s * s + s ** 3), 3 * s * s - 2 * s ** 3, le * (-s * s + s ** 3)];
      for (let i = 0; i < 4; i++) F[2 * e + i] -= P * N[i];
    }
    const last = 2 * n;
    const fixed = { ss: [0, last], cant: [0, 1], ff: [0, 1, last, last + 1], fp: [0, 1, last] }[o.sup] || [0, last];
    const free = []; for (let i = 0; i < nd; i++) if (!fixed.includes(i)) free.push(i);
    const nf_ = free.length, Kr = new Float64Array(nf_ * nf_), Fr = new Float64Array(nf_);
    free.forEach((gi, i) => { Fr[i] = F[gi]; free.forEach((gj, j) => { Kr[i * nf_ + j] = K[gi * nd + gj]; }); });
    const ur = M.solve(Kr, Fr, nf_), u = new Float64Array(nd);
    free.forEach((g, i) => { u[g] = ur[i]; });
    const R = {};                                               // ردود الأفعال = K·u − F
    fixed.forEach(g => { let s = -F[g]; for (let j = 0; j < nd; j++) s += K[g * nd + j] * u[j]; R[g] = s; });
    const Rl = R[0] || 0, Ml = R[1] || 0;                      // قوة وعزم الركيزة اليسرى (عكس عقارب الساعة موجب)
    const xs = [], V = [], Mm = [], v = [];
    for (let i = 0; i <= n; i++) {
      const x = i * le; xs.push(x); v.push(u[2 * i]);
      const pl = x > a + 1e-9 ? P : 0, plm = x > a ? P * (x - a) : 0;
      V.push(Rl - (o.w || 0) * x - pl);
      Mm.push(Rl * x - Ml - (o.w || 0) * x * x / 2 - plm);   // العزم الموجب = ترخيم (شد بالأسفل)
    }
    if (P && a > 0 && a < L) {                                 // قيمة القص يسار ويمين الحمل المركّز
      xs.push(a); V.push(Rl - (o.w || 0) * a); Mm.push(Rl * a - Ml - (o.w || 0) * a * a / 2); v.push(NaN);
    }
    const Mx = Math.max(...Mm), Mn = Math.min(...Mm), Vx = Math.max(...V.map(Math.abs));
    const dmax = Math.max(...v.filter(isFinite).map(Math.abs));
    return { xs: xs.slice(0, n + 1), V: V.slice(0, n + 1), M: Mm.slice(0, n + 1), v: v.slice(0, n + 1), R, Rl, Ml,
      Rr: R[last] || 0, Mr: R[last + 1] || 0, Mmax: Mx, Mmin: Mn, Vmax: Vx, dmax, n, le, fixed };
  };

  // عزم القصور المتشقّق وعزم القصور الفعّال (برانسون-بشوف، ACI 318-19 جدول 24.2.3.5)
  PL.calc.ieff = function (b, h, d, As, fc, Ma) {
    const Ec = M.Ec(fc), n = 200000 / Ec, Ig = b * h ** 3 / 12;
    const Mcr = M.fr(fc) * Ig / (h / 2) / 1e6;
    const A = b / 2, B = n * As, Cc = -n * As * d;
    const kd = (-B + Math.sqrt(B * B - 4 * A * Cc)) / (2 * A);
    const Icr = b * kd ** 3 / 3 + n * As * (d - kd) ** 2;
    if (Ma <= (2 / 3) * Mcr) return { Ig, Icr, Ie: Ig, Mcr, kd };
    const Ie = Icr / (1 - ((2 / 3) * Mcr / Ma) ** 2 * (1 - Icr / Ig));
    return { Ig, Icr, Ie: Math.min(Ig, Ie), Mcr, kd };
  };

  const SUPN = { ss: 'بسيط الإسناد (مفصل + دحروج)', cant: 'كابولي (مثبّت يسار، حر يمين)', ff: 'مثبّت الطرفين', fp: 'مثبّت + دحروج' };

  PL.register({
    id: 'beam', ic: '📏', name: 'الجسر تحت الحمل', sub: 'قص · عزم · هطول · تشقق',
    title: 'كيف يقاوم الجسر الحمل؟',
    learn: 'اسحب الحمل المركّز بالماوس أو بإصبعك وشوف كيف يتغيّر الهطول والقص والعزم ومكان التشقق والحديد لحظياً. الحساب بطريقة العناصر المحدّدة (96 عنصراً) مو رسم تقريبي.',
    ratio: 0.66, ratioSmall: 1.05, minH: 380, maxH: 640,
    defaults: { sup: 'ss', L: 6, w: 20, P: 60, a: 2, b: 300, h: 600, fc: 25 },
    presets: [
      { name: 'بسيط + منتظم', vals: { sup: 'ss', L: 6, w: 25, P: 0 } },
      { name: 'بلكونة كابولي', vals: { sup: 'cant', L: 2.5, w: 18, P: 15, a: 2.5, h: 450 } },
      { name: 'مثبّت الطرفين', vals: { sup: 'ff', L: 7, w: 30, P: 0 } },
      { name: 'حمل بالمنتصف', vals: { sup: 'ss', L: 6, w: 0, P: 120, a: 3 } }
    ],
    controls: [
      { id: 'sup', type: 'select', label: 'نوع الإسناد', opts: Object.entries(SUPN) },
      { id: 'L', label: 'البحر L', min: 1.5, max: 12, step: 0.1, unit: 'م' },
      { id: 'w', label: 'حمل منتظم مصعّد w', min: 0, max: 80, step: 1, unit: 'kN/م' },
      { id: 'P', label: 'حمل مركّز مصعّد P', min: 0, max: 300, step: 5, unit: 'kN' },
      { id: 'a', label: 'موقع الحمل المركّز a', min: 0, max: 12, step: 0.05, unit: 'م', onChange: s => { s.a = Math.min(s.a, s.L); } },
      { type: 'sep', label: 'المقطع والمادة' },
      { id: 'b', label: 'العرض b', min: 200, max: 600, step: 25, unit: 'مم' },
      { id: 'h', label: 'العمق h', min: 250, max: 1200, step: 25, unit: 'مم' },
      { id: 'fc', label: "مقاومة الخرسانة f'c", min: 20, max: 50, step: 1, unit: 'MPa' },
      { type: 'buttons', items: [['anim', '▶ حمّل تدريجياً', ''], ['mid', '⇔ الحمل للمنتصف']] }
    ],
    layers: [
      { k: 'loads', name: 'الأحمال', color: C.load, on: true },
      { k: 'reac', name: 'ردود الأفعال', color: C.react, on: true },
      { k: 'defl', name: 'الهطول (مكبّر)', color: C.defl, on: true },
      { k: 'sfd', name: 'مخطط القص V', color: C.sfd, on: true },
      { k: 'bmd', name: 'مخطط العزم M', color: C.bmd, on: true },
      { k: 'stress', name: 'الإجهادات σ', color: C.tens, on: 'lvl', lvl: 2, tip: 'أزرق = انضغاط، أحمر = شد' },
      { k: 'crack', name: 'التشقّق', color: '#e5e7eb', on: 'lvl', lvl: 2 },
      { k: 'rebar', name: 'التسليح المطلوب', color: C.steel, on: 'lvl', lvl: 2 },
      { k: 'princ', name: 'مسارات الإجهاد الرئيسية', color: '#c084fc', on: false, lvl: 3, tip: 'اتجاه الشد والانضغاط الرئيسيين داخل الجسر' }
    ],
    solve(s) {
      s.a = Math.min(s.a, s.L);
      const E = M.Ec(s.fc) * 1000, I = (s.b / 1000) * (s.h / 1000) ** 3 / 12;
      const r = PL.calc.beam({ L: s.L, sup: s.sup, w: s.w, P: s.P, a: s.a, E, I });
      const d = s.h - 60;
      r.d = d; r.I = I; r.E = E;
      r.Mcr = M.fr(s.fc) * (s.b * s.h ** 3 / 12) / (s.h / 2) / 1e6;
      r.phiVc = 0.75 * 0.17 * Math.sqrt(s.fc) * s.b * d / 1000;          // kN — ACI 22.5.5.1 (أ)
      r.Vc = r.phiVc / 0.75;
      const asMin = Math.max(0.25 * Math.sqrt(s.fc) / 420, 1.4 / 420) * s.b * d;   // ACI 9.6.1.2
      r.asMin = asMin;
      r.AsPos = r.Mmax > 0.5 ? Math.max(asMin, M.asReq(r.Mmax, s.b, d, s.fc, 420) || NaN) : 0;
      r.AsNeg = r.Mmin < -0.5 ? Math.max(asMin, M.asReq(-r.Mmin, s.b, d, s.fc, 420) || NaN) : 0;
      const Ma = Math.max(r.Mmax, -r.Mmin);
      r.ie = PL.calc.ieff(s.b, s.h, d, Math.max(r.AsPos || 0, r.AsNeg || 0, asMin), s.fc, Ma);
      r.dEff = r.dmax * r.ie.Ig / r.ie.Ie;
      return r;
    },
    action(k, s) {
      if (k === 'anim') { s._lf = 0; s._anim = true; }
      if (k === 'mid') s.a = s.L / 2;
    },
    tick(dt, s) { if (!s._anim) return false; s._lf = Math.min(1, (s._lf || 0) + dt / 2.2); if (s._lf >= 1) s._anim = false; return true; },
    geo(W, H, s) {
      const mx = W < 620 ? 34 : 60, X0 = mx, X1 = W - mx;
      const lay = s._lay, diag = ['sfd', 'bmd'].filter(k => lay[k]);
      const top = 0.36 * H * (diag.length ? 1 : 1.5);
      const yb = Math.min(top, H * 0.5), hd = 24;
      const y0 = yb + 82, hh = (H - y0 - 10) / Math.max(1, diag.length);
      const bands = {}; diag.forEach((k, i) => { bands[k] = { y: y0 + i * hh, h: hh }; });
      return { X0, X1, yb, hd, bands, X: x => X0 + x / s.L * (X1 - X0) };
    },
    draw(ctx, W, H, s, r, t) {
      const g = this.geo(W, H, s), { X0, X1, yb, hd, X } = g, lay = s._lay;
      const lf = s._anim || s._lf < 1 ? (s._lf === undefined ? 1 : s._lf) : 1;
      const n = r.n, amp = lay.defl ? 0.09 * H : 0;
      const dsc = r.dmax > 1e-12 ? amp / r.dmax * lf : 0;
      const cy = i => yb - r.v[i] * dsc;                        // الموجب للأعلى ← للأعلى بالرسم
      // ظل الجسر غير المشوّه
      if (lay.defl) { ctx.setLineDash([5, 4]); ctx.strokeStyle = '#475569'; ctx.strokeRect(X0, yb - hd / 2, X1 - X0, hd); ctx.setLineDash([]); }
      // جسم الجسر (مع الإجهادات لو مفعّلة)
      const Mabs = Math.max(Math.abs(r.Mmax), Math.abs(r.Mmin), 1e-9);
      for (let i = 0; i < n; i++) {
        const xa = X(r.xs[i]), xb = X(r.xs[i + 1]), ya = cy(i), yb2 = cy(i + 1);
        if (lay.stress) {
          const rows = 10;
          for (let j = 0; j < rows; j++) {
            const yr = -1 + (2 * j + 1) / rows;                   // −1 أعلى … +1 أسفل
            const mm = (r.M[i] + r.M[i + 1]) / 2 * lf;
            ctx.fillStyle = PL.div(mm / Mabs * yr);
            const ytop = -hd / 2 + j * hd / rows;
            ctx.beginPath(); ctx.moveTo(xa, ya + ytop); ctx.lineTo(xb + .6, yb2 + ytop);
            ctx.lineTo(xb + .6, yb2 + ytop + hd / rows + .6); ctx.lineTo(xa, ya + ytop + hd / rows + .6); ctx.fill();
          }
        } else {
          ctx.fillStyle = '#3b4a63';
          ctx.beginPath(); ctx.moveTo(xa, ya - hd / 2); ctx.lineTo(xb + .6, yb2 - hd / 2); ctx.lineTo(xb + .6, yb2 + hd / 2); ctx.lineTo(xa, ya + hd / 2); ctx.fill();
        }
      }
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.2;
      [-1, 1].forEach(sg => { ctx.beginPath(); for (let i = 0; i <= n; i++) { const x = X(r.xs[i]), y = cy(i) + sg * hd / 2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); });
      if (lay.stress) { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath();
        for (let i = 0; i <= n; i++) { const x = X(r.xs[i]); i ? ctx.lineTo(x, cy(i)) : ctx.moveTo(x, cy(i)); } ctx.stroke(); ctx.setLineDash([]);
        T(ctx, 'المحور المحايد', X1 - 4, yb - hd / 2 - 8, { align: 'right', size: 9, color: C.mut }); }
      // مسارات الإجهاد الرئيسية
      if (lay.princ) {
        const Ipx = 1, nx = 26, ny = 5;
        const Vabs = Math.max(r.Vmax, 1e-9);
        for (let a = 0; a < nx; a++) {
          const fx = (a + .5) / nx, i = Math.round(fx * n), x = X(fx * s.L);
          for (let b = 0; b < ny; b++) {
            const yr = -0.8 + 1.6 * b / (ny - 1);                 // −0.8 أعلى … 0.8 أسفل
            const sig = (r.M[i] / Mabs) * yr * lf;                // شد موجب
            const tau = -(r.V[i] / Vabs) * 0.6 * (1 - yr * yr) * lf; // توزيع القص القطعي
            const th = 0.5 * Math.atan2(2 * tau, sig);
            const s1 = sig / 2 + Math.hypot(sig / 2, tau), s2 = sig / 2 - Math.hypot(sig / 2, tau);
            const y = cy(i) + yr * hd / 2, L1 = 3 + 9 * Math.min(1, Math.abs(s1)), L2 = 3 + 9 * Math.min(1, Math.abs(s2));
            const dx = Math.cos(th), dy = Math.sin(th) * Ipx;
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = 'rgba(248,113,113,.95)'; ctx.beginPath(); ctx.moveTo(x - dx * L1, y + dy * L1); ctx.lineTo(x + dx * L1, y - dy * L1); ctx.stroke();
            ctx.strokeStyle = 'rgba(96,165,250,.95)'; ctx.beginPath(); ctx.moveTo(x + dy * L2, y + dx * L2); ctx.lineTo(x - dy * L2, y - dx * L2); ctx.stroke();
          }
        }
      }
      // التشقق
      if (lay.crack) {
        const sp = Math.max(9, (X1 - X0) / 40);
        for (let x = X0 + sp / 2; x < X1; x += sp) {
          const xm = (x - X0) / (X1 - X0) * s.L, i = Math.min(n, Math.round(xm / s.L * n));
          const m = r.M[i] * lf, v = r.V[i] * lf;
          if (Math.abs(m) > r.Mcr) {
            const f = Math.min(1, 0.35 + 0.5 * (Math.abs(m) - r.Mcr) / Math.max(1e-9, Mabs - r.Mcr));
            const bot = m > 0, y1 = cy(i) + (bot ? hd / 2 : -hd / 2), y2 = y1 + (bot ? -1 : 1) * hd * f * 0.8;
            ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x, y1);
            ctx.lineTo(x + 1.5, (y1 + y2) / 2); ctx.lineTo(x - .5, y2); ctx.stroke();
          } else if (Math.abs(v) > r.Vc) {                          // تشقق قطري بالقص
            const sg = v > 0 ? 1 : -1;
            ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1.1; ctx.beginPath();
            ctx.moveTo(x - sg * hd * .35, cy(i) + hd * .4); ctx.lineTo(x + sg * hd * .35, cy(i) - hd * .4); ctx.stroke();
          }
        }
      }
      // التسليح
      if (lay.rebar) {
        const dm = (s.h - 60) / 1000, drawRun = (pos) => {
          let st = null;
          for (let i = 0; i <= n; i++) {
            const inR = pos ? r.M[i] > 1e-6 : r.M[i] < -1e-6;
            if (inR && st === null) st = i;
            if ((!inR || i === n) && st !== null) {
              const en = inR ? n : i - 1;
              const xa = Math.max(0, r.xs[st] - dm), xb = Math.min(s.L, r.xs[en] + dm);   // تمديد بمقدار d (ACI 9.7.3.3)
              const ia = Math.round(xa / s.L * n), ib = Math.round(xb / s.L * n);
              ctx.strokeStyle = C.steel; ctx.lineWidth = 2.4; ctx.beginPath();
              for (let j = ia; j <= ib; j++) { const y = cy(j) + (pos ? hd / 2 - 4 : -hd / 2 + 4); j === ia ? ctx.moveTo(X(r.xs[j]), y) : ctx.lineTo(X(r.xs[j]), y); }
              ctx.stroke(); st = null;
            }
          }
        };
        if (r.AsPos) drawRun(true);
        if (r.AsNeg) drawRun(false);
        // أساور: أكثف حيث القص أكبر
        for (let x = X0 + 4; x < X1; ) {
          const i = Math.min(n, Math.round((x - X0) / (X1 - X0) * n)), v = Math.abs(r.V[i]);
          const need = v > r.phiVc / 2;
          const gap = need ? Math.max(5, 16 - 10 * Math.min(1, (v - r.phiVc / 2) / Math.max(1e-6, r.Vmax - r.phiVc / 2 + 1e-6))) : 22;
          ctx.strokeStyle = need ? 'rgba(251,191,36,.85)' : 'rgba(251,191,36,.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, cy(i) - hd / 2 + 3); ctx.lineTo(x, cy(i) + hd / 2 - 3); ctx.stroke();
          x += gap;
        }
      }
      // الركائز
      const sup = (x, kind, right) => {
        const y = (right ? cy(n) : cy(0)) + hd / 2;
        ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
        if (kind === 'fixed') {
          const xx = right ? x : x - 12;
          ctx.fillRect(xx, yb - hd * 1.4, 12, hd * 2.8); PL.hatch(ctx, xx, yb - hd * 1.4, 12, hd * 2.8, '#cbd5e1', 6);
        } else if (kind === 'pin' || kind === 'roller') {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 16); ctx.lineTo(x + 10, y + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
          if (kind === 'roller') { [-6, 0, 6].forEach(o => { ctx.beginPath(); ctx.arc(x + o, y + 20, 3, 0, 7); ctx.stroke(); }); }
          ctx.fillRect(x - 14, y + (kind === 'roller' ? 24 : 17), 28, 3);
        }
      };
      const kinds = { ss: ['pin', 'roller'], cant: ['fixed', 'free'], ff: ['fixed', 'fixed'], fp: ['fixed', 'roller'] }[s.sup];
      sup(X0, kinds[0], false); sup(X1, kinds[1], true);
      // الأحمال
      if (lay.loads) {
        if (s.w > 0) {
          const ytop = yb - hd / 2 - 42, cnt = Math.max(6, Math.round((X1 - X0) / 26));
          ctx.strokeStyle = C.load; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X0, ytop); ctx.lineTo(X1, ytop); ctx.stroke();
          for (let i = 0; i <= cnt; i++) { const x = X0 + (X1 - X0) * i / cnt, ib = Math.round(i / cnt * n); PL.arrow(ctx, x, ytop, x, cy(ib) - hd / 2 - 2, C.load, 1.2, 6); }
          T(ctx, `w = ${nf(s.w, 0)} kN/m`, (X0 + X1) / 2, ytop - 10, { color: C.load, size: 11, bold: true });
        }
        if (s.P > 0) {
          const ia = Math.round(s.a / s.L * n), x = X(s.a), y2 = cy(ia) - hd / 2 - 2, y1 = y2 - 70 - Math.min(40, s.P / 6);
          PL.arrow(ctx, x, y1, x, y2, C.load, 3.2, 12);
          ctx.fillStyle = C.load; ctx.beginPath(); ctx.arc(x, y1, 7, 0, 7); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
          T(ctx, `P = ${nf(s.P, 0)} kN`, x, y1 - 14, { color: '#fff', bg: 'rgba(244,114,182,.35)', bold: true });
          T(ctx, '⇆ اسحبني', x, y1 - 32, { color: C.mut, size: 9 });
        }
      }
      // ردود الأفعال
      if (lay.reac) {
        const rx = (x, Rv, Mv, right) => {
          if (Math.abs(Rv) > 1e-6) { const y0 = yb + hd / 2 + 31, up = Rv > 0; PL.arrow(ctx, x, up ? y0 + 22 : y0, x, up ? y0 : y0 + 22, C.react, 2.4, 9);
            T(ctx, `R = ${nf(Math.abs(Rv), 1)} kN`, x + (right ? -10 : 10), y0 + 12, { color: C.react, align: right ? 'right' : 'left', size: 10.5, bold: true, bg: 'rgba(10,16,32,.7)' }); }
          if (Math.abs(Mv) > 1e-6) {
            ctx.strokeStyle = C.react; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, yb, hd * 1.25, right ? -2.4 : -0.9, right ? -0.7 : 0.9 + Math.PI * 0.02, false); ctx.stroke();
            T(ctx, `M = ${nf(Math.abs(Mv), 1)}`, x + (right ? -hd * 1.4 : hd * 1.4), yb - hd * 1.35, { color: C.react, align: right ? 'right' : 'left', size: 10.5, bold: true });
          }
        };
        rx(X0, r.Rl * lf, r.Ml * lf, false); rx(X1, r.Rr * lf, r.Mr * lf, true);
      }
      if (lay.defl && r.dmax > 0) {
        const i = r.v.reduce((b, v, k) => Math.abs(v) > Math.abs(r.v[b]) ? k : b, 0);
        T(ctx, `δ = ${nf(r.dmax * 1000 * lf, 2)} مم (L/${nf(s.L / Math.max(1e-9, r.dmax), 0)})`, X(r.xs[i]), cy(i) + hd / 2 + 16,
          { color: C.defl, bg: 'rgba(10,16,32,.75)', size: 10.5 });
      }
      // مخططات القص والعزم
      const diagram = (key, arr, col, title, invert, unit) => {
        const b = g.bands[key]; if (!b) return;
        const mid = b.y + b.h / 2, mx = Math.max(...arr.map(Math.abs), 1e-9), sc = (b.h / 2 - 12) / mx;
        const Y = v => mid + (invert ? 1 : -1) * v * sc * lf;
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X0, mid); ctx.lineTo(X1, mid); ctx.stroke();
        ctx.fillStyle = col + '33'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X0, mid);
        arr.forEach((v, i) => ctx.lineTo(X(r.xs[i]), Y(v))); ctx.lineTo(X1, mid); ctx.closePath(); ctx.fill();
        ctx.beginPath(); arr.forEach((v, i) => i ? ctx.lineTo(X(r.xs[i]), Y(v)) : ctx.moveTo(X(r.xs[i]), Y(v))); ctx.stroke();
        T(ctx, title, X1, b.y + 8, { align: 'right', color: col, size: 10.5, bold: true });
        const imx = arr.indexOf(Math.max(...arr)), imn = arr.indexOf(Math.min(...arr));
        [imx, imn].forEach(i => { if (Math.abs(arr[i]) < mx * 0.02) return;
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(r.xs[i]), Y(arr[i]), 3, 0, 7); ctx.fill();
          T(ctx, `${nf(arr[i] * lf, 1)} ${unit}`, X(r.xs[i]), Y(arr[i]) + ((arr[i] > 0) === invert ? 12 : -12), { size: 10, bg: 'rgba(10,16,32,.75)' }); });
        if (key === 'bmd' && s._lay.crack) {
          [r.Mcr, -r.Mcr].forEach(m => { ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(229,231,235,.5)'; ctx.beginPath(); ctx.moveTo(X0, Y(m / lf || 0)); ctx.lineTo(X1, Y(m / lf || 0)); ctx.stroke(); ctx.setLineDash([]); });
          T(ctx, 'Mcr', X0 + 4, Y(r.Mcr / (lf || 1)) + 8, { align: 'left', size: 9, color: C.mut });
        }
      };
      diagram('sfd', r.V, C.sfd, 'مخطط القص V (kN)', false, 'kN');
      diagram('bmd', r.M, C.bmd, 'مخطط العزم M (kN·م) — الموجب يُرسم بجهة الشد (للأسفل)', true, '');
    },
    onDown(x, y, s, r, S) {
      if (!s._lay.loads || !(s.P > 0)) return false;
      const g = this.geo(S.W, S.H, s), px = g.X(s.a);
      return Math.abs(x - px) < 26 && y < g.yb + 10 ? 'P' : false;
    },
    hover(x, y, s, r, S) { return this.onDown(x, y, s, r, S); },
    onMove(x, y, s, r, S) {
      const g = this.geo(S.W, S.H, s);
      s.a = Math.round(M.clamp((x - g.X0) / (g.X1 - g.X0) * s.L, 0, s.L) * 20) / 20;
      return true;
    },
    kpis(s, r) {
      const ok = r.Vmax <= r.phiVc;
      return [['أقصى عزم موجب', r.Mmax > 0.05 ? nf(r.Mmax, 1) + ' kN·m' : '—'], ['أقصى عزم سالب', r.Mmin < -0.05 ? nf(r.Mmin, 1) + ' kN·m' : '—'],
        ['أقصى قص', nf(r.Vmax, 1) + ' kN', ok ? '' : 'warn'], ['الهطول المرن', nf(r.dmax * 1000, 2) + ' مم'],
        ['عزم التشقق Mcr', nf(r.Mcr, 1) + ' kN·m', Math.max(r.Mmax, -r.Mmin) > r.Mcr ? 'warn' : 'ok'],
        ['حديد سفلي As⁺', r.AsPos ? nf(r.AsPos, 0) + ' مم²' : '—'], ['حديد علوي As⁻', r.AsNeg ? nf(r.AsNeg, 0) + ' مم²' : '—']];
    },
    explain(s, r) {
      const Ma = Math.max(r.Mmax, -r.Mmin), cracked = Ma > r.Mcr;
      const lim = s.sup === 'cant' ? 180 : 360, ratio = s.L / Math.max(1e-9, r.dEff);
      const see = `<ul class="pl-ul">
        <li><b style="color:${C.load}">الأحمال</b> تضغط الجسر للأسفل، و<b style="color:${C.react}">الركائز</b> تدفعه للأعلى بنفس المجموع: ${nf(r.Rl + r.Rr, 1)} kN = ${nf(s.w * s.L + s.P, 1)} kN ✓ (توازن).</li>
        <li><b style="color:${C.sfd}">القص</b> هو «القوة اللي تحاول تقطع» الجسر عمودياً — أكبر قرب الركائز (${nf(r.Vmax, 1)} kN)، ولهذا الأساور تتكثّف هناك.</li>
        <li><b style="color:${C.bmd}">العزم</b> هو «اللي يحني» الجسر — أكبره ${nf(Ma, 1)} kN·م. حيث العزم موجب يتشقق <b>الوجه السفلي</b> فنحط الحديد تحت، وحيث سالب يتشقق <b>الوجه العلوي</b> فنحط الحديد فوق.</li>
        <li>${cracked ? `العزم تجاوز عزم التشقق (${nf(r.Mcr, 1)}) — <b>الخرسانة تتشقق بالشد</b> وهذا طبيعي؛ الحديد هو اللي يشيل الشد بعدها.` : 'العزم أقل من عزم التشقق — الجسر بعده سليم بلا تشققات.'}</li>
        <li>فعّل طبقة <b>الإجهادات</b>: الأزرق انضغاط والأحمر شد، والخط المتقطع بالنص هو المحور المحايد (إجهاد صفر).</li></ul>`;
      const math = PL.steps([
        ['المادة والمقطع'],
        ['معامل المرونة', 'Ec = 4700√f\'c', nf(M.Ec(s.fc), 0) + ' MPa'],
        ['عزم القصور', 'Ig = b·h³/12', nf(s.b * s.h ** 3 / 12 / 1e6, 0) + '×10⁶ مم⁴'],
        ['عزم التشقق', 'Mcr = fr·Ig/yt ، fr = 0.62√f\'c = ' + nf(M.fr(s.fc), 2), nf(r.Mcr, 1) + ' kN·م'],
        ['الاتزان'],
        ['ردود الأفعال', `R₁ + R₂ = w·L + P = ${nf(s.w, 0)}×${nf(s.L, 1)} + ${nf(s.P, 0)}`, nf(r.Rl, 1) + ' + ' + nf(r.Rr, 1) + ' kN'],
        ...(s.sup === 'ss' && s.P === 0 ? [['عزم المنتصف (حل مغلق)', 'M = wL²/8', nf(s.w * s.L ** 2 / 8, 2) + ' kN·م']] : []),
        ...(s.sup === 'ss' && s.P === 0 ? [['الهطول (حل مغلق)', 'δ = 5wL⁴/384EI', nf(5 * s.w * s.L ** 4 / (384 * r.E * r.I) * 1000, 3) + ' مم']] : []),
        ['نتيجة العناصر المحدّدة', 'Mmax / Mmin / Vmax', `${nf(r.Mmax, 2)} / ${nf(r.Mmin, 2)} / ${nf(r.Vmax, 2)}`],
        ['التصميم'],
        ['العمق الفعّال', 'd = h − 60', nf(r.d, 0) + ' مم'],
        ['الحديد السفلي', 'As = 0.85f\'c·b·d/fy·(1−√(1−2Mu/(φ·0.85f\'c·b·d²)))', r.AsPos ? nf(r.AsPos, 0) + ' مم²' : '—'],
        ['مقاومة القص للخرسانة', 'φVc = 0.75×0.17√f\'c·b·d', nf(r.phiVc, 1) + ' kN'],
        ['الأساور', r.Vmax > r.phiVc ? 'Vu > φVc ⇒ أساور محسوبة' : r.Vmax > r.phiVc / 2 ? 'Vu > φVc/2 ⇒ أساور دنيا' : 'Vu ≤ φVc/2 ⇒ لا تلزم أساور حسابياً', ''],
        ['الهطول بعد التشقق'],
        ['عزم القصور المتشقق', 'Icr = b(kd)³/3 + n·As(d−kd)²', nf(r.ie.Icr / 1e6, 0) + '×10⁶ مم⁴'],
        ['الفعّال (بشوف)', 'Ie = Icr / [1 − (⅔Mcr/Ma)²(1 − Icr/Ig)]', nf(r.ie.Ie / 1e6, 0) + '×10⁶ مم⁴'],
        ['الهطول الفعلي التقريبي', 'δ·Ig/Ie', nf(r.dEff * 1000, 2) + ' مم = L/' + nf(ratio, 0) + ' ' + PL.ok(ratio >= lim, '≥ L/' + lim, '< L/' + lim)]
      ]);
      const code = `<ul class="pl-ul">
        <li><b>ACI 318-19 §19.2.2.1</b> — معامل المرونة Ec = 4700√f'c.</li>
        <li><b>§19.2.3.1</b> — معامل الكسر fr = 0.62λ√f'c لحساب عزم التشقق.</li>
        <li><b>§22.2</b> — مقاومة الانحناء بكتلة ويتني 0.85f'c، و<b>§21.2.2</b> φ = 0.90 للمقطع المسيطَر بالشد.</li>
        <li><b>§9.6.1.2</b> — أقل حديد As,min = max(0.25√f'c/fy ، 1.4/fy)·b·d = ${nf(r.asMin, 0)} مم².</li>
        <li><b>§22.5.5.1</b> — Vc = 0.17λ√f'c·bw·d، و<b>§9.6.3.1</b> أساور دنيا لما Vu > φVc/2.</li>
        <li><b>§9.7.3.3</b> — تمديد الحديد بعد نقطة انتهاء الحاجة إليه بمسافة d أو 12db (المرسوم هنا d).</li>
        <li><b>§24.2.3.5</b> — عزم القصور الفعّال Ie بعد التشقق، و<b>جدول 24.2.2</b> حدود الهطول (L/360 للحي على الأرضيات).</li></ul>
        <div class="hint">الأحمال هنا مصعّدة (Factored) للتصميم، والهطول يُفحص فعلياً تحت أحمال الخدمة — القيم للتعلّم والمقارنة.</div>`;
      const tr = `<ol class="pl-ul">
        <li>اختر «بسيط + منتظم» ثم «مثبّت الطرفين»: لاحظ إن العزم الأقصى نزل من wL²/8 إلى wL²/12 عند الركائز، والهطول صار خُمس القيمة تقريباً.</li>
        <li>اسحب الحمل المركّز فوق الركيزة: يختفي تأثيره على العزم لأن الركيزة تشيله مباشرة.</li>
        <li>بالكابولي: العزم كله سالب ⇒ الحديد الرئيسي <b>فوق</b>. هذا سبب انهيار البلكونات لما ينحط الحديد تحت بالغلط.</li>
        <li>زِد العمق h وشوف الهطول ينزل بسرعة (يتناسب مع 1/h³) بينما العزم ما يتغيّر.</li>
        <li>فعّل «مسارات الإجهاد الرئيسية»: الخطوط الحمراء المائلة قرب الركائز هي سبب التشقق القطري بالقص.</li></ol>`;
      return { see, math, code, try: tr };
    }
  });

  /* ====================================================================
     ٢) العمود — الانبعاج (أويلر) وتكبير العزم بالكود
     ==================================================================== */
  const KT = {
    pp: { K: 1.0, name: 'مفصلي الطرفين (K = 1.0)', base: 'pin', top: 'pin' },
    fp: { K: 0.7, name: 'مثبّت أسفل + مفصلي أعلى (K ≈ 0.7)', base: 'fixed', top: 'pin' },
    ff: { K: 0.5, name: 'مثبّت الطرفين (K = 0.5)', base: 'fixed', top: 'fixed' },
    cf: { K: 2.0, name: 'كابولي: مثبّت أسفل وحر أعلى (K = 2.0)', base: 'fixed', top: 'free' }
  };
  // شكل النمط الأول للانبعاج y(ξ) (ξ = 0 عند القاعدة) مُطبّعاً لأقصى قيمة 1
  PL.calc.bucklingShape = function (type, xi) {
    let y;
    if (type === 'pp') y = Math.sin(Math.PI * xi);
    else if (type === 'cf') y = 1 - Math.cos(Math.PI * xi / 2);
    else if (type === 'ff') y = (1 - Math.cos(2 * Math.PI * xi)) / 2;
    else { const b = 4.493409; y = Math.cos(b * xi) - 1 + xi - Math.sin(b * xi) / b; }
    return y;
  };
  const FP_MAX = (() => { let m = 0; for (let i = 0; i <= 400; i++) m = Math.max(m, Math.abs(PL.calc.bucklingShape('fp', i / 400))); return m; })();
  const shape = (type, xi) => type === 'fp' ? -PL.calc.bucklingShape('fp', xi) / FP_MAX : PL.calc.bucklingShape(type, xi);

  PL.calc.column = function (s) {
    const K = KT[s.bc].K, L = s.L * 1000, b = Math.min(s.b, s.h), h = Math.max(s.b, s.h);
    const Ec = M.Ec(s.fc), Ig = h * b ** 3 / 12, Ag = b * h, Ast = s.rho / 100 * Ag;
    const Pcr = Math.PI ** 2 * Ec * Ig / (K * L) ** 2 / 1000;              // kN — أويلر بعزم القصور الإجمالي
    const Po = (0.85 * s.fc * (Ag - Ast) + 420 * Ast) / 1000;               // ACI 22.4.2.2
    const phiPnmax = 0.65 * 0.80 * Po;                                      // ACI 22.4.2.1 + 21.2.2 (أساور)
    const EIeff = 0.4 * Ec * Ig / (1 + 0.6);                                // ACI 6.6.4.4.4(أ)، βdns = 0.6
    const Pc = Math.PI ** 2 * EIeff / (K * L) ** 2 / 1000;
    const r = 0.3 * b, slend = K * L / r;                                   // ACI 6.2.5.2
    const limNS = Math.min(40, 34 + 12 * s.m12), limit = s.frame === 'sw' ? 22 : limNS;
    const Cm = M.clamp(0.6 - 0.4 * s.m12, 0.2, 1.0);                        // ACI 6.6.4.5.3(أ)
    const den = 1 - s.P / (0.75 * Pc);
    const dns = den <= 0 ? Infinity : Math.max(1, Cm / den);
    const e0 = L / 1000;                                                     // عيب ابتدائي L/1000
    const amp = s.P >= Pcr ? Infinity : 1 / (1 - s.P / Pcr);
    const mode = s.P >= Math.min(Po, Pcr) ? (Pcr < Po ? 'buckle' : 'crush') : 'ok';
    return { K, Pcr, Po, phiPnmax, Pc, EIeff, r, slend, limit, Cm, dns, e0, amp, mode, Ig, Ec, Ag, Ast, b, h };
  };

  PL.register({
    id: 'column', ic: '🏛️', name: 'انبعاج العمود', sub: 'أويلر · الطول الفعّال · النحافة',
    title: 'ليش العمود الطويل ينهار قبل ما تنسحق خرسانته؟',
    learn: 'زِد الحمل P أو طول العمود وشوف كيف الانحراف الصغير يتضخّم حتى ينبعج العمود. غيّر شروط الأطراف ولاحظ الطول الفعّال KL وكيف يغيّر الحمل الحرج أربع مرات.',
    ratio: 0.62, ratioSmall: 1.15, minH: 380, maxH: 620,
    defaults: { bc: 'pp', L: 6, b: 300, h: 300, fc: 25, rho: 1.5, P: 800, frame: 'ns', m12: -1 },
    presets: [
      { name: 'عمود قصير عادي', vals: { bc: 'ff', L: 3.2, b: 400, h: 400, P: 1500 } },
      { name: 'عمود نحيف طويل', vals: { bc: 'pp', L: 9, b: 250, h: 250, P: 600 } },
      { name: 'كابولي (خزان مرتفع)', vals: { bc: 'cf', L: 6, b: 300, h: 300, P: 400 } }
    ],
    controls: [
      { id: 'bc', type: 'select', label: 'شروط الأطراف', opts: Object.entries(KT).map(([k, v]) => [k, v.name]) },
      { id: 'L', label: 'الطول الحر Lu', min: 2, max: 14, step: 0.1, unit: 'م' },
      { id: 'P', label: 'الحمل المحوري Pu', min: 0, max: 8000, step: 10, unit: 'kN' },
      { type: 'sep', label: 'المقطع' },
      { id: 'b', label: 'البُعد b', min: 200, max: 800, step: 25, unit: 'مم' },
      { id: 'h', label: 'البُعد h', min: 200, max: 1000, step: 25, unit: 'مم' },
      { id: 'fc', label: "f'c", min: 20, max: 50, step: 1, unit: 'MPa' },
      { id: 'rho', label: 'نسبة الحديد ρ', min: 1, max: 4, step: 0.1, unit: '%' },
      { type: 'sep', label: 'فحص النحافة بالكود' },
      { id: 'frame', type: 'select', label: 'نوع الإطار', opts: [['ns', 'غير متمايل (مقيّد جانبياً)'], ['sw', 'متمايل']] },
      { id: 'm12', label: 'نسبة العزمين M1/M2', min: -1, max: 1, step: 0.05, unit: '(سالب = انحناء مفرد)' },
      { type: 'buttons', items: [['ramp', '▶ حمّل حتى الانهيار', ''], ['reset', '↺ صفّر الحمل']] }
    ],
    layers: [
      { k: 'shape', name: 'شكل الانبعاج (مكبّر)', color: C.defl, on: true },
      { k: 'le', name: 'الطول الفعّال KL', color: C.warn, on: true },
      { k: 'axial', name: 'الإجهاد المحوري', color: C.comp, on: 'lvl', lvl: 2 },
      { k: 'pdelta', name: 'عزم P·δ', color: C.bmd, on: 'lvl', lvl: 2 },
      { k: 'curve', name: 'منحنى الحمل-الانحراف', color: C.acc, on: true },
      { k: 'aci', name: 'فحص ACI للنحافة', color: C.ok, on: 'lvl', lvl: 3 }
    ],
    solve(s) { return PL.calc.column(s); },
    action(k, s, r) {
      if (k === 'ramp') { s._ramp = true; s.P = 0; }
      if (k === 'reset') { s._ramp = false; s.P = 0; s._bk = 0; }
    },
    tick(dt, s, r) {
      let ch = false;
      if (s._ramp) {
        const lim = Math.min(r.Pcr, r.Po) * 1.04;
        s.P = Math.min(8000, Math.round(s.P + lim * dt / 3.2));
        if (s.P >= lim) s._ramp = false;
        PL.sync(); ch = true;
      }
      const target = r.mode === 'buckle' ? 1 : 0;
      const bk = s._bk || 0;
      if (Math.abs(bk - target) > 1e-3) { s._bk = bk + (target - bk) * Math.min(1, dt * 3); ch = true; }
      return ch || r.mode !== 'ok';
    },
    animated: () => false,
    draw(ctx, W, H, s, r, t) {
      const small = W < 620, lay = s._lay;
      const colX = small ? W * 0.34 : W * 0.26, top = 50, bot = H - (small ? H * 0.42 : 52), Hc = bot - top;
      const wpx = Math.max(10, Math.min(46, r.b / 1000 * Hc / s.L * 1.6));
      const bc = KT[s.bc];
      // الانحراف الظاهر: العيب × التكبير، مكبّراً بصرياً
      let ampPx;
      if (r.mode === 'buckle' || !isFinite(r.amp)) ampPx = Hc * (0.06 + 0.16 * (s._bk || 0)) * (1 + 0.04 * Math.sin(t * 9));
      else ampPx = Math.min(Hc * 0.2, (r.e0 / (s.L * 1000)) * Hc * 60 * r.amp);
      if (!lay.shape) ampPx = 0;
      const yAt = xi => top + (1 - xi) * Hc;
      const xAt = xi => colX + shape(s.bc, xi) * ampPx;
      // مسقط المحور الأصلي
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#475569'; ctx.beginPath(); ctx.moveTo(colX, top); ctx.lineTo(colX, bot); ctx.stroke(); ctx.setLineDash([]);
      // جسم العمود
      const N = 60, sigma = s.P * 1000 / r.Ag, sr = sigma / (0.85 * s.fc);
      for (let i = 0; i < N; i++) {
        const a = i / N, b2 = (i + 1) / N;
        ctx.fillStyle = lay.axial ? PL.div(-Math.min(1, sr)) : '#3b4a63';
        ctx.beginPath(); ctx.moveTo(xAt(a) - wpx / 2, yAt(a)); ctx.lineTo(xAt(b2) - wpx / 2, yAt(b2)); ctx.lineTo(xAt(b2) + wpx / 2, yAt(b2)); ctx.lineTo(xAt(a) + wpx / 2, yAt(a)); ctx.fill();
      }
      ctx.strokeStyle = r.mode === 'ok' ? '#94a3b8' : C.bad; ctx.lineWidth = 1.4;
      [-1, 1].forEach(sg => { ctx.beginPath(); for (let i = 0; i <= N; i++) { const xi = i / N; i ? ctx.lineTo(xAt(xi) + sg * wpx / 2, yAt(xi)) : ctx.moveTo(xAt(xi) + sg * wpx / 2, yAt(xi)); } ctx.stroke(); });
      // الركائز
      const supp = (kind, y, isTop) => {
        ctx.fillStyle = '#64748b';
        if (kind === 'fixed') { const yy = isTop ? y - 14 : y; ctx.fillRect(colX - 46, yy, 92, 14); PL.hatch(ctx, colX - 46, yy, 92, 14, '#cbd5e1', 6); }
        else if (kind === 'pin') {
          ctx.beginPath(); if (isTop) { ctx.moveTo(colX, y); ctx.lineTo(colX - 12, y - 18); ctx.lineTo(colX + 12, y - 18); }
          else { ctx.moveTo(colX, y); ctx.lineTo(colX - 12, y + 18); ctx.lineTo(colX + 12, y + 18); }
          ctx.fill(); ctx.fillRect(colX - 22, isTop ? y - 22 : y + 18, 44, 4);
          if (isTop) { ctx.strokeStyle = '#64748b'; [-30, 30].forEach(o => { ctx.beginPath(); ctx.moveTo(colX + o, y - 30); ctx.lineTo(colX + o, y + 10); ctx.stroke(); }); }
        }
      };
      supp(bc.base, bot, false);
      if (bc.top !== 'free') supp(bc.top, top, true);
      // الحمل
      const tx = xAt(1);
      PL.arrow(ctx, tx, top - 44, tx, top - (bc.top === 'free' ? 2 : 24), C.load, 3.4, 12);
      T(ctx, `Pu = ${nf(s.P, 0)} kN`, tx + 14, top - 40, { align: 'left', color: '#fff', bold: true, bg: 'rgba(244,114,182,.3)' });
      // الطول الفعّال
      if (lay.le) {
        const xL = colX - Math.max(70, wpx + 40);
        let a0 = 0, a1 = 1, note = '';
        if (s.bc === 'ff') { a0 = 0.25; a1 = 0.75; note = 'نقطتا انقلاب عند L/4'; }
        else if (s.bc === 'fp') { a0 = 0.3; a1 = 1; note = 'انقلاب عند ≈0.3L من القاعدة'; }
        else if (s.bc === 'cf') { a0 = 0; a1 = 2; note = 'الكابولي = نصف عمود مفصلي طوله 2L'; }
        if (s.bc === 'cf') {                                       // الصورة المرآتية فوق الكابولي
          ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(251,191,36,.5)'; ctx.beginPath();
          for (let i = 0; i <= 30; i++) { const xi = 1 + i / 30; const y = top - (i / 30) * Hc; const x = colX + (1 - Math.cos(Math.PI * xi / 2)) * ampPx; i ? ctx.lineTo(x, Math.max(6, y)) : ctx.moveTo(x, y); }
          ctx.stroke(); ctx.setLineDash([]);
        }
        const ya = yAt(a0), yb = Math.max(8, top - (a1 - 1) * Hc) * (a1 > 1 ? 1 : 0) || yAt(a1);
        ctx.strokeStyle = C.warn; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(xL, ya); ctx.lineTo(xL, yb); ctx.stroke();
        [ya, yb].forEach(y => { ctx.beginPath(); ctx.moveTo(xL - 7, y); ctx.lineTo(xL + 7, y); ctx.stroke(); });
        T(ctx, `KL = ${nf(r.K, 1)}×${nf(s.L, 1)} = ${nf(r.K * s.L, 2)} م`, xL - 10, (ya + yb) / 2, { align: 'right', color: C.warn, bold: true, size: 11 });
        if (note) T(ctx, note, xL - 10, (ya + yb) / 2 + 16, { align: 'right', color: C.mut, size: 9.5 });
        if (s.bc === 'ff' || s.bc === 'fp') [a0, a1].forEach(a => { if (a < 1) { ctx.fillStyle = C.warn; ctx.beginPath(); ctx.arc(xAt(a), yAt(a), 4, 0, 7); ctx.fill(); } });
      }
      // عزم الدرجة الثانية
      if (lay.pdelta && ampPx > 0.5) {
        const xr = colX + Math.max(64, wpx + 40);
        const mmax = s.P * (isFinite(r.amp) ? r.amp * r.e0 / 1000 : 0);
        ctx.fillStyle = 'rgba(251,146,60,.25)'; ctx.strokeStyle = C.bmd; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(xr, bot);
        for (let i = 0; i <= 40; i++) { const xi = i / 40; ctx.lineTo(xr + Math.abs(shape(s.bc, xi)) * 50, yAt(xi)); }
        ctx.lineTo(xr, top); ctx.closePath(); ctx.fill(); ctx.stroke();
        T(ctx, isFinite(r.amp) ? `P·δ ≈ ${nf(mmax, 1)} kN·m` : 'P·δ → ∞', xr + 56, (top + bot) / 2, { align: 'left', color: C.bmd, size: 10.5, bold: true });
      }
      // الحالة
      const st = r.mode === 'buckle' ? ['⚠ انبعاج! تجاوز الحمل الحرج Pcr', C.bad] : r.mode === 'crush' ? ['⚠ انسحاق المقطع: تجاوز Po', C.bad]
        : s.P > r.phiPnmax ? ['تجاوز المقاومة التصميمية φPn,max', C.warn] : ['مستقر ✓', C.ok];
      T(ctx, st[0], small ? W / 2 : W * 0.26, small ? H * 0.6 - 90 : H - 16, { color: st[1], bold: true, size: 13, bg: 'rgba(10,16,32,.8)' });
      // منحنى الحمل-الانحراف
      if (lay.curve) {
        const box = small ? { x: 8, y: H * 0.6, w: W - 16, h: H * 0.38 } : { x: W * 0.52, y: 14, w: W * 0.46, h: H * 0.5 };
        const Pm = Math.max(r.Pcr, r.Po) * 1.15, xs = [], ys = [], yp = [];
        for (let i = 0; i <= 80; i++) { const P = Pm * i / 80; xs.push(P); ys.push(P < r.Pcr ? Math.min(12, 1 / (1 - P / r.Pcr)) : NaN); }
        PL.chart(ctx, box, { title: 'تكبير الانحراف δ/δ₀ مقابل الحمل P', xs, x0: 0, x1: Pm, y0: 0, y1: 12, xdec: 0,
          series: [{ ys, color: C.acc }],
          vlines: [{ x: r.Pcr, color: C.bad, label: 'Pcr' }, { x: r.Po, color: C.warn, label: 'Po' }, { x: r.phiPnmax, color: C.ok, label: 'φPn' }],
          marks: [{ x: Math.min(s.P, Pm), y: isFinite(r.amp) ? Math.min(12, r.amp) : 12, color: '#fff', label: nf(s.P, 0) }], xl: 'kN' });
      }
      if (lay.aci) {
        const x = small ? 8 : W * 0.52, y = small ? H * 0.6 - 76 : H * 0.55, w = small ? W - 16 : W * 0.46;
        ctx.fillStyle = 'rgba(10,16,32,.9)'; ctx.fillRect(x, y, w, 70); ctx.strokeStyle = C.line; ctx.strokeRect(x + .5, y + .5, w - 1, 69);
        const okS = r.slend <= r.limit;
        T(ctx, `النحافة kLu/r = ${nf(r.slend, 1)} ${okS ? '≤' : '>'} ${nf(r.limit, 1)} ⇒ ${okS ? 'تُهمَل النحافة (عمود قصير)' : 'عمود نحيف: كبّر العزم'}`, x + w - 8, y + 16, { align: 'right', color: okS ? C.ok : C.warn, size: 10.5, bold: true });
        T(ctx, `Pc = ${nf(r.Pc, 0)} kN ، Cm = ${nf(r.Cm, 2)} ، δns = ${isFinite(r.dns) ? nf(r.dns, 2) : '∞ (غير مستقر)'}`, x + w - 8, y + 38, { align: 'right', size: 10.5 });
        T(ctx, 'ACI 318-19: 6.2.5 · 6.6.4.4 · 6.6.4.5', x + w - 8, y + 58, { align: 'right', size: 9, color: C.mut });
      }
    },
    kpis(s, r) {
      return [['الحمل الحرج (أويلر) Pcr', nf(r.Pcr, 0) + ' kN', s.P >= r.Pcr ? 'bad' : ''], ['مقاومة السحق Po', nf(r.Po, 0) + ' kN', s.P >= r.Po ? 'bad' : ''],
        ['φPn,max التصميمية', nf(r.phiPnmax, 0) + ' kN', s.P > r.phiPnmax ? 'warn' : 'ok'], ['النحافة kLu/r', nf(r.slend, 1), r.slend > r.limit ? 'warn' : 'ok'],
        ['تكبير الانحراف', isFinite(r.amp) ? '×' + nf(r.amp, 2) : '∞', isFinite(r.amp) && r.amp < 2 ? '' : 'warn'],
        ['δns (ACI)', isFinite(r.dns) ? nf(r.dns, 2) : '∞ غير مستقر', !isFinite(r.dns) || r.dns > 1.4 ? 'bad' : r.dns > 1.05 ? 'warn' : 'ok']];
    },
    explain(s, r) {
      const gov = r.Pcr < r.Po ? 'الانبعاج (العمود نحيف)' : 'السحق (العمود قصير)';
      const see = `<ul class="pl-ul">
        <li>أي عمود حقيقي فيه ميلان بسيط جداً (L/1000). لما يزيد الحمل، هذا الميلان <b>يتضخّم</b> بمعامل 1/(1−P/Pcr) — شوف المنحنى يطير لفوق قرب Pcr.</li>
        <li>عند الحمل الحرج Pcr = ${nf(r.Pcr, 0)} kN العمود يفقد استقراره وينبعج جانبياً حتى لو الخرسانة بعدها ما انسحقت.</li>
        <li>للعمود هذا الحاكم هو <b>${gov}</b>: السحق عند ${nf(r.Po, 0)} kN والانبعاج عند ${nf(r.Pcr, 0)} kN.</li>
        <li><b style="color:${C.warn}">الطول الفعّال KL</b> هو المسافة بين نقطتي الانقلاب بشكل الانبعاج: التثبيت يقصّره (K = 0.5 ⇒ الحمل الحرج ×4) والكابولي يطوّله (K = 2 ⇒ الحمل الحرج ÷4).</li></ul>`;
      const math = PL.steps([
        ['أويلر'],
        ['عزم القصور (المحور الضعيف)', 'I = h·b³/12', nf(r.Ig / 1e6, 0) + '×10⁶ مم⁴'],
        ['الحمل الحرج', 'Pcr = π²·Ec·I / (K·L)²', nf(r.Pcr, 0) + ' kN'],
        ['التكبير', 'δ/δ₀ = 1 / (1 − P/Pcr)', isFinite(r.amp) ? nf(r.amp, 3) : '∞'],
        ['المقاومة المحورية'],
        ['السحق الاسمي', "Po = 0.85f'c(Ag − Ast) + fy·Ast", nf(r.Po, 0) + ' kN'],
        ['الحد التصميمي', 'φPn,max = 0.65 × 0.80 × Po', nf(r.phiPnmax, 0) + ' kN'],
        ['النحافة بالكود'],
        ['نصف القطر', 'r = 0.3h (مستطيل)', nf(r.r, 0) + ' مم'],
        ['النحافة', 'k·Lu / r', nf(r.slend, 1) + ' مقابل حد ' + nf(r.limit, 1)],
        ['الصلابة الفعّالة', '(EI)eff = 0.4·Ec·Ig / (1 + βdns)', nf(r.EIeff / 1e12, 2) + '×10¹² ن·مم²'],
        ['الحمل الحرج للكود', 'Pc = π²(EI)eff / (kLu)²', nf(r.Pc, 0) + ' kN'],
        ['معامل التكبير', 'δns = Cm / (1 − Pu/(0.75·Pc)) ≥ 1', isFinite(r.dns) ? nf(r.dns, 3) : '∞ ⇒ كبّر المقطع']
      ]);
      const code = `<ul class="pl-ul">
        <li><b>ACI 318-19 §6.2.5.1</b> — تُهمَل النحافة إذا kLu/r ≤ 22 (متمايل) أو ≤ 34 + 12(M1/M2) ≤ 40 (غير متمايل)، و M1/M2 سالبة للانحناء المفرد.</li>
        <li><b>§6.2.5.2</b> — r = 0.3h للمقطع المستطيل.</li>
        <li><b>§6.6.4.4.4</b> — (EI)eff = 0.4EcIg/(1+βdns)، و<b>§6.6.4.4.2</b> Pc = π²(EI)eff/(kLu)².</li>
        <li><b>§6.6.4.5</b> — تكبير العزم δns = Cm/(1 − Pu/0.75Pc) ≥ 1، و Cm = 0.6 − 0.4(M1/M2).</li>
        <li><b>§22.4.2</b> — Po، و<b>§22.4.2.1</b> Pn,max = 0.80Po للأساور، و<b>جدول 21.2.2</b> φ = 0.65 للمسيطَر بالانضغاط.</li>
        <li><b>§10.6.1.1</b> — نسبة الحديد 1% ≤ ρ ≤ 8% (عملياً ≤ 4% للوصلات).</li></ul>`;
      const tr = `<ol class="pl-ul">
        <li>اختر «عمود نحيف طويل» واضغط «حمّل حتى الانهيار»: ينبعج قبل ما يوصل للسحق.</li>
        <li>غيّر الإسناد من مفصلي إلى مثبّت الطرفين: Pcr يتضاعف أربع مرات بنفس المقطع.</li>
        <li>بالكابولي زِد الطول من 4 إلى 8 م: Pcr ينزل للربع (يتناسب مع 1/L²).</li>
        <li>غيّر M1/M2 من −1 إلى +1 (انحناء مزدوج): حد النحافة يرتفع من 22 إلى 40 لأن العمود «يتقسّم» لنصفين.</li></ol>`;
      return { see, math, code, try: tr };
    }
  });

  /* ====================================================================
     ٣) المقطع الخرساني — تحليل الألياف وكتلة ويتني وعامل φ
     ==================================================================== */
  const hog = (e, fc) => {                                    // خرسانة: هوغنستاد
    const e0 = 0.002;
    if (e <= 0) return 0;
    if (e <= e0) return fc * (2 * e / e0 - (e / e0) ** 2);
    return Math.max(0, fc * (1 - 0.15 * (e - e0) / (0.0038 - e0)));
  };
  PL.calc.section = function (p, eTop, crackedBefore) {
    const { b, h, d, As, dp, Asp, fc, fy } = p, Es = 200000, Ec = M.Ec(fc), fr = M.fr(fc), ecr = fr / Ec;
    const nL = 80, dy = h / nL;
    const force = c => {
      let N = 0, Mc = 0;
      for (let i = 0; i < nL; i++) {
        const y = (i + .5) * dy, e = eTop * (c - y) / c;
        let sg = e > 0 ? hog(e, fc) : (-e <= ecr && !crackedBefore ? Ec * e : 0);
        N += sg * b * dy; Mc += sg * b * dy * (h / 2 - y);
      }
      const es = eTop * (c - d) / c, ss = M.clamp(Es * es, -fy, fy);
      const esp = eTop * (c - dp) / c, ssp = M.clamp(Es * esp, -fy, fy) - (esp > 0 ? hog(esp, fc) : 0);
      N += ss * As + ssp * Asp; Mc += ss * As * (h / 2 - d) + ssp * Asp * (h / 2 - dp);
      return { N, M: Mc, es, ss, esp, ssp };
    };
    let lo = 1e-3, hi = 3 * h;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (force(mid).N > 0) hi = mid; else lo = mid; }
    const c = (lo + hi) / 2, f = force(c);
    const eBot = eTop * (c - h) / c;
    return { c, eTop, eBot, phi: eTop / c * 1e6, M: f.M / 1e6, es: f.es, ss: f.ss, esp: f.esp, ssp: f.ssp,
      cracked: crackedBefore || -eBot > ecr, yielded: -f.es >= fy / Es };
  };
  // المقاومة الاسمية بكتلة ويتني عند εcu = 0.003 (ACI 22.2) مع حديد انضغاط اختياري
  PL.calc.whitney = function (p) {
    const { b, d, As, dp, Asp, fc, fy } = p, Es = 200000, b1 = M.beta1(fc);
    const bal = c => {
      const fs = M.clamp(Es * 0.003 * (d - c) / c, -fy, fy), fsp = M.clamp(Es * 0.003 * (c - dp) / c, -fy, fy);
      const a = b1 * c, Cc = 0.85 * fc * b * a, Cs = Asp * (fsp - (c > dp ? 0.85 * fc : 0));
      return { res: Cc + Cs - As * fs, a, Cc, Cs, fs, fsp };
    };
    let lo = 1, hi = 3 * d;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (bal(mid).res > 0) hi = mid; else lo = mid; }
    const c = (lo + hi) / 2, q = bal(c);
    const Mn = (q.Cc * (d - q.a / 2) + q.Cs * (d - dp)) / 1e6;
    const et = 0.003 * (d - c) / c, phi = M.phiFlex(et, fy);
    return { c, a: q.a, b1, Cc: q.Cc / 1000, Cs: q.Cs / 1000, T: As * q.fs / 1000, fs: q.fs, Mn, et, phi, phiMn: phi * Mn, ety: fy / Es };
  };

  PL.register({
    id: 'section', cat: 'conc', ic: '🧱', name: 'داخل المقطع الخرساني', sub: 'انفعال · إجهاد · ويتني · φ',
    title: 'شنو يصير داخل مقطع الجسر من أول حمل لحد الانهيار؟',
    learn: 'حرّك «مرحلة التحميل» من صفر إلى الانهيار وشوف: متى تتشقق الخرسانة، متى يخضع الحديد، وليش الكود يقلّل φ لما يكون الحديد كثير. الحساب بتحليل الألياف (80 شريحة) ومقارن بكتلة ويتني.',
    ratio: 0.52, ratioSmall: 1.25, minH: 380, maxH: 580,
    defaults: { b: 300, h: 600, cov: 60, n: 3, db: 20, np: 0, dbp: 12, fc: 25, fy: 420, st: 0.6 },
    presets: [
      { name: 'مقطع اعتيادي', vals: { n: 3, db: 20, np: 0 } },
      { name: 'حديد كثير جداً', vals: { n: 8, db: 28, np: 0 } },
      { name: 'مزدوج التسليح', vals: { n: 6, db: 25, np: 3, dbp: 20 } }
    ],
    controls: [
      { id: 'st', label: 'مرحلة التحميل (εc/0.003)', min: 0.01, max: 1, step: 0.01, fmt: v => nf(v * 100, 0) + '%' },
      { type: 'sep', label: 'المقطع' },
      { id: 'b', label: 'العرض b', min: 200, max: 800, step: 25, unit: 'مم' },
      { id: 'h', label: 'العمق h', min: 300, max: 1200, step: 25, unit: 'مم' },
      { id: 'cov', label: 'المسافة لمركز الحديد', min: 40, max: 100, step: 5, unit: 'مم' },
      { id: 'n', label: 'عدد القضبان السفلية', min: 2, max: 10, step: 1 },
      { id: 'db', label: 'قطر القضيب السفلي', min: 10, max: 32, step: 2, unit: 'مم' },
      { id: 'np', label: 'قضبان علوية (انضغاط)', min: 0, max: 6, step: 1 },
      { id: 'dbp', label: 'قطر العلوي', min: 10, max: 28, step: 2, unit: 'مم' },
      { id: 'fc', label: "f'c", min: 20, max: 60, step: 1, unit: 'MPa' },
      { id: 'fy', label: 'fy', min: 280, max: 550, step: 10, unit: 'MPa' },
      { type: 'buttons', items: [['anim', '▶ من الصفر للانهيار', '']] }
    ],
    layers: [
      { k: 'strain', name: 'الانفعال ε', color: C.acc, on: true },
      { k: 'stress', name: 'الإجهاد الفعلي σ', color: C.comp, on: true },
      { k: 'whitney', name: 'كتلة ويتني', color: C.warn, on: 'lvl', lvl: 2 },
      { k: 'forces', name: 'القوى وذراع العزم', color: C.ok, on: true },
      { k: 'mphi', name: 'منحنى العزم-الانحناء', color: C.bmd, on: true },
      { k: 'phi', name: 'منطقة φ بالكود', color: '#c084fc', on: 'lvl', lvl: 2 }
    ],
    solve(s) {
      const ab = d => Math.PI * d * d / 4;
      const p = { b: s.b, h: s.h, d: s.h - s.cov, As: s.n * ab(s.db), dp: s.cov, Asp: s.np * ab(s.dbp), fc: s.fc, fy: s.fy };
      const curve = []; let cracked = false, crackAt = null, yieldAt = null;
      for (let i = 1; i <= 90; i++) {
        const e = 0.003 * (i / 90) ** 2;
        const q = PL.calc.section(p, e, cracked);
        if (q.cracked && !cracked) { cracked = true; crackAt = curve.length; }
        if (q.yielded && yieldAt === null) yieldAt = curve.length;
        curve.push(q);
      }
      const eNow = 0.003 * s.st ** 2;
      const crk = crackAt !== null && eNow >= curve[crackAt].eTop;
      const now = PL.calc.section(p, eNow, crk);
      const W = PL.calc.whitney(p);
      const Ig = s.b * s.h ** 3 / 12, Mcr = M.fr(s.fc) * Ig / (s.h / 2) / 1e6;
      const rho = p.As / (s.b * p.d), asMin = Math.max(0.25 * Math.sqrt(s.fc) / s.fy, 1.4 / s.fy) * s.b * p.d;
      return { p, curve, crackAt, yieldAt, now, W, Mcr, rho, asMin };
    },
    action(k, s) { if (k === 'anim') { s.st = 0.01; s._anim = true; } },
    tick(dt, s) { if (!s._anim) return false; s.st = Math.min(1, s.st + dt / 4); if (s.st >= 1) s._anim = false; PL.sync(); return true; },
    draw(ctx, W, H, s, r) {
      const small = W < 620, lay = s._lay, p = r.p, q = r.now;
      const areaH = small ? H * 0.52 : H - 70, top = 42, sc = (areaH - top - 10) / p.h;
      const cols = small ? [0.14, 0.40, 0.66, 0.9] : [0.07, 0.2, 0.33, 0.47];
      const cw = W * (small ? 0.2 : 0.1);
      const Y = y => top + y * sc;
      // المقطع
      const bw = Math.min(cw * 1.1, p.b * sc), sx = W * cols[0] - bw / 2;
      ctx.fillStyle = '#3b4a63'; ctx.fillRect(sx, Y(0), bw, p.h * sc);
      if (q.cracked) {                                           // منطقة التشقق تحت المحور المحايد
        ctx.save(); ctx.beginPath(); ctx.rect(sx, Y(q.c), bw, Y(p.h) - Y(q.c)); ctx.clip();
        ctx.fillStyle = 'rgba(248,113,113,.12)'; ctx.fillRect(sx, Y(q.c), bw, Y(p.h) - Y(q.c));
        ctx.strokeStyle = 'rgba(248,250,252,.55)'; ctx.lineWidth = 1;
        for (let x = sx + 6; x < sx + bw; x += 11) { ctx.beginPath(); ctx.moveTo(x, Y(p.h)); ctx.lineTo(x + 2, Y((p.h + q.c) / 2)); ctx.lineTo(x - 1, Y(q.c) + 4); ctx.stroke(); }
        ctx.restore();
      }
      ctx.strokeStyle = '#94a3b8'; ctx.strokeRect(sx + .5, Y(0) + .5, bw - 1, p.h * sc - 1);
      const bars = (n, db, y, col) => { for (let i = 0; i < n; i++) { const x = sx + 10 + (bw - 20) * (n === 1 ? .5 : i / (n - 1));
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, Y(y), Math.max(2.5, db * sc / 2), 0, 7); ctx.fill(); } };
      bars(s.n, s.db, p.d, q.yielded ? C.bad : C.steel); if (s.np) bars(s.np, s.dbp, p.dp, C.steel);
      T(ctx, `${s.n}Ø${s.db}`, sx + bw / 2, Y(p.h) + 12, { size: 10, color: C.steel });
      T(ctx, 'المقطع', sx + bw / 2, 16, { color: C.mut, size: 10.5, bold: true });
      // المحور المحايد عبر كل الأعمدة
      const xEnd = W * (small ? 0.98 : 0.56);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(sx - 8, Y(q.c)); ctx.lineTo(xEnd, Y(q.c)); ctx.stroke(); ctx.setLineDash([]);
      T(ctx, `c = ${nf(q.c, 0)} مم`, sx - 10, Y(q.c) - 9, { align: 'left', size: 9.5, color: '#fff', bg: 'rgba(10,16,32,.7)' });
      // الانفعال
      if (lay.strain) {
        const x0 = W * cols[1] + cw * 0.15, emx = Math.max(q.eTop, Math.abs(q.eBot), 1e-6), k = cw * 0.5 / emx;
        ctx.strokeStyle = '#64748b'; ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x0, Y(p.h)); ctx.stroke();
        ctx.fillStyle = 'rgba(96,165,250,.35)'; ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x0 + q.eTop * k, Y(0)); ctx.lineTo(x0, Y(q.c)); ctx.fill();
        ctx.fillStyle = 'rgba(248,113,113,.35)'; ctx.beginPath(); ctx.moveTo(x0, Y(q.c)); ctx.lineTo(x0 + q.eBot * k, Y(p.h)); ctx.lineTo(x0, Y(p.h)); ctx.fill();
        ctx.strokeStyle = C.acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + q.eTop * k, Y(0)); ctx.lineTo(x0 + q.eBot * k, Y(p.h)); ctx.stroke();
        T(ctx, `εc = ${nf(q.eTop * 1000, 3)}‰`, x0 + q.eTop * k, Y(0) - 8, { size: 9.5, color: C.comp });
        T(ctx, `εs = ${nf(-q.es * 1000, 2)}‰`, x0 + 4, Y(p.d) + 12, { size: 9.5, align: 'left', color: q.yielded ? C.bad : C.tens, bg: 'rgba(10,16,32,.7)' });
        T(ctx, 'الانفعال', x0, 16, { color: C.mut, size: 10.5, bold: true });
      }
      // الإجهاد
      if (lay.stress || lay.whitney) {
        const x0 = W * cols[2], k = cw * 0.9 / p.fc;
        ctx.strokeStyle = '#64748b'; ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x0, Y(p.h)); ctx.stroke();
        if (lay.stress) {
          ctx.fillStyle = 'rgba(96,165,250,.45)'; ctx.strokeStyle = C.comp; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x0, Y(0));
          for (let i = 0; i <= 40; i++) { const y = q.c * i / 40, e = q.eTop * (q.c - y) / q.c; ctx.lineTo(x0 + hog(e, p.fc) * k, Y(Math.min(p.h, y))); }
          ctx.lineTo(x0, Y(Math.min(p.h, q.c))); ctx.closePath(); ctx.fill(); ctx.stroke();
          if (!q.cracked) { const ecr = M.fr(p.fc) / M.Ec(p.fc); ctx.fillStyle = 'rgba(248,113,113,.45)'; ctx.beginPath(); ctx.moveTo(x0, Y(q.c));
            ctx.lineTo(x0 - Math.min(-q.eBot, ecr) * M.Ec(p.fc) * k, Y(p.h)); ctx.lineTo(x0, Y(p.h)); ctx.fill(); }
          T(ctx, `σ = ${nf(hog(q.eTop, p.fc), 1)} MPa`, x0 + p.fc * k * 0.5, Y(0) - 8, { size: 9.5, color: C.comp });
        }
        if (lay.whitney) {
          const a = r.W.a;
          ctx.setLineDash([5, 3]); ctx.strokeStyle = C.warn; ctx.lineWidth = 1.6; ctx.strokeRect(x0, Y(0), 0.85 * p.fc * k, a * sc); ctx.setLineDash([]);
          T(ctx, `0.85f'c · a=${nf(a, 0)}`, x0 + 0.85 * p.fc * k + 4, Y(a / 2), { align: 'left', size: 9, color: C.warn, bg: 'rgba(10,16,32,.7)' });
        }
        T(ctx, 'الإجهاد', x0, 16, { color: C.mut, size: 10.5, bold: true });
      }
      // القوى
      if (lay.forces) {
        const x0 = W * cols[3], Cc = -q.ss * p.As / 1000 + 0, Tt = -q.ss * p.As / 1000;
        const yC = Math.min(q.c, p.h) * 0.38, z = p.d - yC;
        const Fs = Math.min(1, Math.abs(Tt) / (p.fy * p.As / 1000));
        PL.arrow(ctx, x0 + 12 + 34 * Fs, Y(yC), x0 - 6, Y(yC), C.comp, 3, 10);
        PL.arrow(ctx, x0 - 6, Y(p.d), x0 + 12 + 34 * Fs, Y(p.d), q.yielded ? C.bad : C.tens, 3, 10);
        T(ctx, `C = ${nf(Math.abs(Cc), 0)} kN`, x0 + 18 + 34 * Fs, Y(yC), { align: 'left', size: 10, color: C.comp });
        T(ctx, `T = ${nf(Math.abs(Tt), 0)} kN`, x0 + 18 + 34 * Fs, Y(p.d), { align: 'left', size: 10, color: q.yielded ? C.bad : C.tens });
        ctx.strokeStyle = C.ok; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0 - 14, Y(yC)); ctx.lineTo(x0 - 14, Y(p.d)); ctx.stroke();
        T(ctx, `z ≈ ${nf(z, 0)}`, x0 - 18, Y((yC + p.d) / 2), { align: 'right', size: 9.5, color: C.ok });
        T(ctx, 'القوى', x0, 16, { color: C.mut, size: 10.5, bold: true });
        if (q.yielded) T(ctx, 'الحديد خضع!', x0 + 20, Y(p.d) + 16, { color: C.bad, size: 10, bold: true, align: 'left' });
      }
      // منحنى العزم-الانحناء
      if (lay.mphi) {
        const box = small ? { x: 8, y: H * 0.56, w: W - 16, h: H * 0.42 } : { x: W * 0.6, y: 10, w: W * 0.39, h: H * 0.62 };
        const xs = r.curve.map(c => c.phi), ys = r.curve.map(c => c.M);
        const marks = [{ x: q.phi, y: q.M, color: '#fff', label: nf(q.M, 0) }];
        if (r.crackAt !== null) marks.push({ x: r.curve[r.crackAt].phi, y: r.curve[r.crackAt].M, color: '#e5e7eb', r: 3, label: 'تشقق' });
        if (r.yieldAt !== null) marks.push({ x: r.curve[r.yieldAt].phi, y: r.curve[r.yieldAt].M, color: C.bad, r: 3, label: 'خضوع' });
        PL.chart(ctx, box, { title: 'العزم M (kN·m) مقابل الانحناء φ (1/كم)', xs, x0: 0, y0: 0, xdec: 1,
          series: [{ ys, color: C.bmd }, { ys: xs.map(() => r.W.Mn), color: C.warn, dash: [5, 4], w: 1.2 }, { ys: xs.map(() => r.W.phiMn), color: C.ok, dash: [2, 3], w: 1.2 }],
          marks, xl: '1/km' });
        T(ctx, `Mn (ويتني) = ${nf(r.W.Mn, 0)}   φMn = ${nf(r.W.phiMn, 0)}`, box.x + box.w - 8, box.y + 26, { align: 'right', size: 9.5, color: C.warn });
      }
      // مقياس φ
      if (lay.phi) {
        const bx = small ? 10 : W * 0.6, by = small ? H * 0.52 - 30 : H * 0.7, bwid = small ? W - 20 : W * 0.39, bh = 16;
        const emax = 0.012, X = e => bx + Math.min(1, e / emax) * bwid;
        ctx.fillStyle = 'rgba(248,113,113,.5)'; ctx.fillRect(bx, by, X(r.W.ety) - bx, bh);
        ctx.fillStyle = 'rgba(251,191,36,.5)'; ctx.fillRect(X(r.W.ety), by, X(r.W.ety + 0.003) - X(r.W.ety), bh);
        ctx.fillStyle = 'rgba(52,211,153,.5)'; ctx.fillRect(X(r.W.ety + 0.003), by, bx + bwid - X(r.W.ety + 0.003), bh);
        ctx.fillStyle = '#fff'; const xm = X(Math.max(0, r.W.et)); ctx.fillRect(xm - 1.5, by - 5, 3, bh + 10);
        T(ctx, 'انضغاط φ=0.65', (bx + X(r.W.ety)) / 2, by + bh + 10, { size: 9, color: C.bad });
        T(ctx, 'انتقالي', (X(r.W.ety) + X(r.W.ety + 0.003)) / 2, by + bh + 10, { size: 9, color: C.warn });
        T(ctx, 'مسيطَر بالشد φ=0.90', (X(r.W.ety + 0.003) + bx + bwid) / 2, by + bh + 10, { size: 9, color: C.ok });
        T(ctx, `εt عند الانهيار = ${nf(r.W.et * 1000, 2)}‰ ⇒ φ = ${nf(r.W.phi, 3)}`, bx + bwid, by - 12, { align: 'right', size: 10, bold: true });
      }
    },
    kpis(s, r) {
      const q = r.now, stage = q.eTop >= 0.00299 ? 'الانهيار الاسمي (0.003)' : q.yielded ? 'الحديد خاضع' : q.cracked ? 'متشقق مرن' : 'غير متشقق';
      return [['المرحلة', stage, q.yielded ? 'warn' : ''], ['العزم الآن', nf(q.M, 1) + ' kN·m'], ['عمق المحور c', nf(q.c, 0) + ' مم'],
        ['Mn (ويتني)', nf(r.W.Mn, 1) + ' kN·m'], ['φ', nf(r.W.phi, 3), r.W.phi >= 0.9 ? 'ok' : r.W.phi > 0.65 ? 'warn' : 'bad'], ['φMn', nf(r.W.phiMn, 1) + ' kN·m', 'ok'],
        ['ρ', nf(r.rho * 100, 2) + '%', r.p.As < r.asMin ? 'bad' : '']];
    },
    explain(s, r) {
      const W = r.W, p = r.p;
      const see = `<ul class="pl-ul">
        <li>المقطع ينحني فيصير أعلاه <b style="color:${C.comp}">منضغطاً</b> وأسفله <b style="color:${C.tens}">مشدوداً</b>، والانفعال خطّي (المقاطع المستوية تبقى مستوية).</li>
        <li>بالبداية الخرسانة تشيل الشد، لكن بعزم ${nf(r.Mcr, 1)} kN·م <b>تتشقّق</b> وينتقل كل الشد للحديد — لاحظ الكسرة بالمنحنى.</li>
        <li>بعدها يخضع الحديد (يصير مثل العلك): العزم يزيد قليلاً لكن الانحناء يزيد كثيراً — هذا <b>الإنذار المطاطي</b> اللي نريده قبل الانهيار.</li>
        <li>لو حطّيت حديد كثير («حديد كثير جداً») الخرسانة تنسحق قبل ما يخضع الحديد — انهيار مفاجئ بلا إنذار، ولهذا الكود ينزّل φ إلى 0.65.</li></ul>`;
      const math = PL.steps([
        ['كتلة ويتني عند εcu = 0.003'],
        ['β₁', "0.85 − 0.05(f'c − 28)/7 ضمن [0.65, 0.85]", nf(W.b1, 3)],
        ['عمق المحور المحايد', "اتزان: 0.85f'c·b·β₁c + A's·f's = As·fs", nf(W.c, 1) + ' مم'],
        ['عمق الكتلة', 'a = β₁·c', nf(W.a, 1) + ' مم'],
        ['قوة الانضغاط', "C = 0.85f'c·b·a", nf(W.Cc, 0) + ' kN'],
        ['قوة الشد', 'T = As·fs', nf(W.T, 0) + ' kN (fs = ' + nf(W.fs, 0) + ' MPa)'],
        ['المقاومة الاسمية', 'Mn = C(d − a/2) + Cs(d − d′)', nf(W.Mn, 1) + ' kN·م'],
        ['انفعال الحديد الأبعد', 'εt = 0.003(d − c)/c', nf(W.et * 1000, 2) + '‰'],
        ['عامل المقاومة', `εty = fy/Es = ${nf(W.ety * 1000, 2)}‰ ⇒ φ`, nf(W.phi, 3)],
        ['المقاومة التصميمية', 'φMn', nf(W.phiMn, 1) + ' kN·م'],
        ['تحليل الألياف'],
        ['عند نفس εc = 0.003', 'تكامل σ(ε) على 80 شريحة (هوغنستاد)', nf(r.curve[r.curve.length - 1].M, 1) + ' kN·م'],
        ['الفرق عن ويتني', '', nf(100 * (r.curve[r.curve.length - 1].M / W.Mn - 1), 1) + '%'],
        ['أقل حديد', "As,min = max(0.25√f'c, 1.4)/fy · b·d", nf(r.asMin, 0) + ' مم² ' + PL.ok(p.As >= r.asMin)]
      ]);
      const code = `<ul class="pl-ul">
        <li><b>ACI 318-19 §22.2.1–22.2.2</b> — المقاطع المستوية تبقى مستوية، وεcu = 0.003، ومقاومة الشد للخرسانة تُهمَل.</li>
        <li><b>§22.2.2.4</b> — كتلة إجهاد مستطيلة 0.85f'c بعمق a = β₁c، و<b>جدول 22.2.2.4.3</b> لقيمة β₁.</li>
        <li><b>جدول 21.2.2</b> — φ = 0.65 إذا εt ≤ εty، و0.90 إذا εt ≥ εty + 0.003، وخطي بينهما (تغيّر مهم بطبعة 2019: كان 0.005 ثابتاً).</li>
        <li><b>§9.3.3.1</b> — الجسور غير مسبقة الإجهاد يجب أن يكون εt ≥ 0.004.</li>
        <li><b>§9.6.1.2</b> — أقل حديد للجسور.</li></ul>`;
      const tr = `<ol class="pl-ul">
        <li>اضغط «من الصفر للانهيار» وراقب النقطة البيضاء على المنحنى تمرّ بالتشقق ثم الخضوع.</li>
        <li>اختر «حديد كثير جداً»: المؤشر بمقياس φ يدخل المنطقة الحمراء، والمنحنى يفقد الجزء الأفقي (لا مطيلية).</li>
        <li>بعدها أضف حديد علوي (مزدوج التسليح): c يقلّ وεt يرجع للمنطقة الخضراء — هذا سبب استعمال حديد الانضغاط.</li>
        <li>زِد f'c: كتلة ويتني تصير أقصر وφ يتحسّن، لكن Mn ما يزيد كثيراً لأن الحديد هو الحاكم.</li></ol>`;
      return { see, math, code, try: tr };
    }
  });
})();
