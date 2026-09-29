/* المختبر الفيزيائي والميكانيكي — إطار مشترك لمختبرات تفاعلية على <canvas>.
   كل مختبر يسجّل نفسه بـ PHYSLAB.register({...}) ويعطي:
     controls  — منزلقات/قوائم يغيّرها المستخدم
     layers    — طبقات رسم تُفعَّل وتُطفأ فوق بعضها (أحمال، تشوّه، عزوم، إجهادات…)
     solve()   — الحساب الفيزيائي الحقيقي (دوال نقية تُختبر بـ node)
     draw()    — الرسم على اللوحة
     explain() — طبقات الشرح: ماذا ترى / المعادلات بأرقامك / الكود / جرّب بنفسك
   لا يمسّ أي صفحة أخرى: صفحة مستقلة PAGES.phys تستدعيه فقط. */
(function () {
  const PL = window.PHYSLAB = { labs: [], calc: {}, cur: null };
  PL.register = lab => { if (!lab.cat) lab.cat = 'mech'; PL.labs.push(lab); };
  // أقسام المختبرات — تُفلتر تبويبات المختبر (والصفحة الواحدة يمكن تقصرها على أقسام معيّنة)
  PL.CATS = [['mech', '🏗️ ميكانيك الإنشاءات'], ['conc', '🧱 الخرسانة'], ['rebar', '🧵 حديد التسليح'], ['dyn', '🌊 الديناميك والزلازل'],
             ['geo', '🪨 التربة والأساسات'], ['fluid', '💧 الماء والرياح'], ['build', '👷 التنفيذ والاستعمال']];
  // key: مفتاح الحالة (كل صفحة/دليل حالته) · cats: أقسام · labs: مختبرات بعينها · vals: قيم ابتدائية لكل مختبر
  // (دليل العنصر يزرع المختبر بأبعاد العنصر الحقيقية) · fresh: ابدأ من القيم لا من آخر حالة
  let OPTS = { key: 'phys', cats: null };
  const LIST = () => PL.labs.filter(l => (!OPTS.cats || OPTS.cats.includes(l.cat)) && (!OPTS.labs || OPTS.labs.includes(l.id)))
    .sort((a, b) => OPTS.labs ? OPTS.labs.indexOf(a.id) - OPTS.labs.indexOf(b.id) : 0);

  /* ---------------- ألوان متّسقة مع ثيم المنصة ---------------- */
  const C = PL.C = {
    bg: '#0a1020', bg2: '#0e1729', grid: '#16233d', line: '#22304f', tx: '#e6edf7', mut: '#93a4c0',
    acc: '#38bdf8', acc2: '#22d3ee', ok: '#34d399', warn: '#fbbf24', bad: '#f87171',
    comp: '#60a5fa', tens: '#f87171', steel: '#fbbf24', conc: '#334155', load: '#f472b6',
    react: '#34d399', defl: '#22d3ee', sfd: '#a78bfa', bmd: '#fb923c', soil: '#8b6b4a'
  };
  const FONT = '"Segoe UI",Tahoma,"Noto Kufi Arabic",Arial,sans-serif';
  const AR = /[؀-ۿ]/;

  /* ---------------- أدوات رياضية ---------------- */
  const M = PL.math = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    // حلّ Ax=b كثيف بالحذف مع التمحور الجزئي (A مصفوفة مسطّحة n×n، تُنسخ)
    solve(A0, b0, n) {
      const A = Float64Array.from(A0), b = Float64Array.from(b0);
      for (let k = 0; k < n; k++) {
        let p = k, mx = Math.abs(A[k * n + k]);
        for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > mx) { mx = v; p = i; } }
        if (mx < 1e-300) throw new Error('مصفوفة منفردة');
        if (p !== k) {
          for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
          const t = b[k]; b[k] = b[p]; b[p] = t;
        }
        const piv = A[k * n + k];
        for (let i = k + 1; i < n; i++) {
          const f = A[i * n + k] / piv; if (!f) continue;
          for (let j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j];
          b[i] -= f * b[k];
        }
      }
      const x = new Float64Array(n);
      for (let i = n - 1; i >= 0; i--) {
        let s = b[i];
        for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
        x[i] = s / A[i * n + i];
      }
      return x;
    },
    inv(A, n) {                                   // معكوس صغير (n ≤ 20)
      const R = new Float64Array(n * n);
      for (let j = 0; j < n; j++) {
        const e = new Float64Array(n); e[j] = 1;
        const x = M.solve(A, e, n);
        for (let i = 0; i < n; i++) R[i * n + j] = x[i];
      }
      return R;
    },
    // قيم ومتّجهات ذاتية لمصفوفة متماثلة بطريقة جاكوبي (n صغير)
    jacobi(A0, n) {
      const A = Float64Array.from(A0), V = new Float64Array(n * n);
      for (let i = 0; i < n; i++) V[i * n + i] = 1;
      for (let sweep = 0; sweep < 100; sweep++) {
        let off = 0;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
        if (off < 1e-22) break;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
          const apq = A[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
          const th = (A[q * n + q] - A[p * n + p]) / (2 * apq);
          const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = A[k * n + p], akq = A[k * n + q];
            A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p * n + k], aqk = A[q * n + k];
            A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k * n + p], vkq = V[k * n + q];
            V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
          }
        }
      }
      const ev = [];
      for (let i = 0; i < n; i++) ev.push({ val: A[i * n + i], vec: Array.from({ length: n }, (_, k) => V[k * n + i]) });
      ev.sort((a, b) => a.val - b.val);
      return ev;
    },
    // β1 لكتلة ويتني — ACI 318-19 جدول 22.2.2.4.3
    beta1: fc => M.clamp(0.85 - 0.05 * (fc - 28) / 7, 0.65, 0.85),
    // φ للانحناء حسب انفعال الحديد الأبعد — ACI 318-19 جدول 21.2.2 (حديد Grade 420: εty = fy/Es)
    phiFlex(et, fy, Es = 200000) {
      const ety = fy / Es;
      if (et <= ety) return 0.65;
      if (et >= ety + 0.003) return 0.90;
      return 0.65 + 0.25 * (et - ety) / 0.003;
    },
    // As المطلوب من كتلة ويتني بمقطع مستطيل مفرد (مم²)؛ null لو يحتاج مضاعفاً
    asReq(Mu, b, d, fc, fy, phi = 0.9) {
      const Rn = Mu * 1e6 / (phi * b * d * d), k = 1 - 2 * Rn / (0.85 * fc);
      if (k < 0) return null;
      return 0.85 * fc * b * d / fy * (1 - Math.sqrt(k));
    },
    Ec: fc => 4700 * Math.sqrt(fc),             // MPa — ACI 318-19 19.2.2.1(b)
    fr: fc => 0.62 * Math.sqrt(fc)              // MPa — ACI 318-19 19.2.3.1 (λ = 1)
  };

  const nf = (x, n = 2) => (x === null || x === undefined || !isFinite(x)) ? '—' :
    Number(x).toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });
  PL.nf = nf;

  /* ---------------- لوحة الرسم ---------------- */
  PL.text = function (ctx, s, x, y, o = {}) {
    s = String(s);
    ctx.save();
    ctx.font = `${o.bold ? '700 ' : ''}${o.size || 11}px ${FONT}`;
    ctx.fillStyle = o.color || C.tx;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'middle';
    const fs = s.match(/[A-Za-z\u0370-\u03FF\u0600-\u06FF]/);                // اتجاه أول حرف قوي (مثل dir=auto)
    ctx.direction = fs && AR.test(fs[0]) ? 'rtl' : 'ltr';
    if (o.bg) {
      const w = ctx.measureText(s).width + 8, h = (o.size || 11) + 6;
      const ax = o.align === 'left' ? x - 4 : o.align === 'right' ? x - w + 4 : x - w / 2;
      ctx.fillStyle = o.bg; ctx.fillRect(ax, y - h / 2, w, h);
      ctx.fillStyle = o.color || C.tx;
    }
    ctx.fillText(s, x, y);
    ctx.restore();
  };
  PL.arrow = function (ctx, x1, y1, x2, y2, col, w = 2, head = 8) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * head * .6, y2 - Math.sin(a) * head * .6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - .42), y2 - head * Math.sin(a - .42));
    ctx.lineTo(x2 - head * Math.cos(a + .42), y2 - head * Math.sin(a + .42));
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  PL.hatch = function (ctx, x, y, w, h, col = C.mut, gap = 7) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    for (let s = -h; s < w + h; s += gap) { ctx.beginPath(); ctx.moveTo(x + s, y + h); ctx.lineTo(x + s + h, y); ctx.stroke(); }
    ctx.restore();
  };
  // خريطة لونية متباعدة: سالب = أزرق (انضغاط)، موجب = أحمر (شد)
  PL.div = function (v) {
    const t = M.clamp(v, -1, 1), a = Math.abs(t);
    const base = [30, 41, 64];
    const tgt = t < 0 ? [96, 165, 250] : [248, 113, 113];
    return `rgb(${base.map((b, i) => Math.round(b + (tgt[i] - b) * Math.pow(a, .8))).join(',')})`;
  };
  // تدرّج متسلسل (0..1) من الأزرق الداكن إلى الأصفر
  PL.seq = function (v) {
    const stops = [[14, 23, 41], [30, 64, 175], [34, 211, 238], [52, 211, 153], [250, 204, 21], [248, 113, 113]];
    const t = M.clamp(v, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    return `rgb(${stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f)).join(',')})`;
  };

  function makeCanvas(host, lab) {
    const cv = document.createElement('canvas');
    cv.className = 'pl-canvas';
    host.innerHTML = ''; host.appendChild(cv);
    const S = { cv, ctx: cv.getContext('2d'), W: 0, H: 0, dpr: 1 };
    const fit = () => {
      const w = Math.max(280, host.clientWidth);
      const small = w < 620;
      const ratio = (small && lab.ratioSmall) || lab.ratio || 0.6;
      const h = Math.round(M.clamp(w * ratio, lab.minH || 300, lab.maxH || 600));
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      if (w === S.W && h === S.H && dpr === S.dpr) return;
      S.W = w; S.H = h; S.dpr = dpr; S.small = small;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      PL.dirty = true;
    };
    fit();
    if (window.ResizeObserver) { S.ro = new ResizeObserver(fit); S.ro.observe(host); }
    else window.addEventListener('resize', fit);
    return S;
  }

  /* ---------------- الحالة والتشغيل ---------------- */
  let RAF = null, CAN = null, ST = null, RES = null, LAB = null, lastT = 0, explTimer = null;
  PL.dirty = true;

  function level() {
    try { return (window.LAYERS && LAYERS.level()) || 2; } catch (e) { return 2; }
  }

  function ctrlHtml(c, st) {
    if (c.type === 'sep') return `<div class="pl-sep">${c.label}</div>`;
    if (c.type === 'select') return `<div class="pl-ctl"><label>${c.label}</label><select data-k="${c.id}">${
      c.opts.map(([k, t]) => `<option value="${k}"${k == st[c.id] ? ' selected' : ''}>${t}</option>`).join('')}</select></div>`;
    if (c.type === 'buttons') return `<div class="pl-ctl pl-btns">${c.items.map(([k, t, cls]) =>
      `<button class="btn ${cls || 'gh'}" data-act="${k}">${t}</button>`).join('')}</div>`;
    const v = st[c.id];
    return `<div class="pl-ctl"><label>${c.label} <b data-v="${c.id}">${fmtV(c, v)}</b>${c.unit ? ` <span>${c.unit}</span>` : ''}</label>
      <input type="range" data-k="${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}"></div>`;
  }
  const fmtV = (c, v) => c.fmt ? c.fmt(v) : nf(v, c.dec !== undefined ? c.dec : (c.step < 1 ? (c.step < 0.1 ? 2 : 1) : 0));

  PL.html = function (opts) {
    OPTS = Object.assign({ key: 'phys', cats: null }, opts || {});
    if (OPTS.labs) PL.cur = null;
    const lv = level(), L = LIST(), cats = PL.CATS.filter(c => L.some(l => l.cat === c[0]));
    return `<div class="pl-wrap">
      ${cats.length > 1 ? `<div class="pl-cats" id="plCats"><button data-cat="" class="on">الكل (${L.length})</button>${cats.map(c =>
        `<button data-cat="${c[0]}">${c[1]} <small>${L.filter(l => l.cat === c[0]).length}</small></button>`).join('')}</div>` : ''}
      <div class="pl-tabs" id="plTabs">${L.map(l => `<button data-lab="${l.id}" data-lcat="${l.cat}" class="${l.id === (PL.cur || L[0].id) ? 'on' : ''}">
        <span class="ic">${l.ic}</span><span><b>${l.name}</b><small>${l.sub}</small></span></button>`).join('')}</div>
      <div class="pl-intro" id="plIntro"></div>
      <div class="pl-body">
        <div class="card pl-stage">
          <div class="pl-layers" id="plLayers"></div>
          <div class="pl-cv" id="plCv"></div>
          <div class="pl-kpis" id="plKpi"></div>
        </div>
        <div class="card pl-ctrl" id="plCtrl"></div>
      </div>
      <div class="card pl-explain">
        <div class="pl-etabs" id="plETabs">
          <button data-e="see" class="${lv === 1 ? 'on' : ''}">👁️ ماذا ترى؟</button>
          <button data-e="math" class="${lv === 2 ? 'on' : ''}">🧮 المعادلات بأرقامك</button>
          <button data-e="code" class="${lv === 3 ? 'on' : ''}">📘 الكود والمراجع</button>
          <button data-e="try">💡 جرّب بنفسك</button>
        </div>
        <div class="pl-ebody" id="plEBody"></div>
      </div>
    </div>`;
  };

  function mountLab(id) {
    const L = LIST();
    LAB = L.find(l => l.id === id) || L[0];
    PL.cur = LAB.id;
    try { localStorage.setItem('pl_lab_' + OPTS.key, LAB.id); } catch (e) { /* تخزين غير متاح */ }
    document.querySelectorAll('#plTabs button').forEach(b => b.classList.toggle('on', b.dataset.lab === LAB.id));
    LAB._st = LAB._st || {};
    if (OPTS.fresh && !OPTS._seeded) OPTS._seeded = {};
    if (OPTS.fresh && !OPTS._seeded[LAB.id]) { delete LAB._st[OPTS.key]; OPTS._seeded[LAB.id] = 1; }
    ST = LAB._st[OPTS.key] || (LAB._st[OPTS.key] = Object.assign({}, LAB.defaults, (OPTS.vals || {})[LAB.id] || {}, { _lay: {} }));
    LAB.state = ST;
    const lv = level();
    LAB.layers.forEach(L => { if (!(L.k in ST._lay)) ST._lay[L.k] = L.on === true || (L.on === 'lvl' && lv >= (L.lvl || 2)); });
    document.getElementById('plIntro').innerHTML = `<div class="pl-learn"><span class="ic">${LAB.ic}</span><div>
      <b>${LAB.title || LAB.name}</b><p>${LAB.learn}</p></div></div>`;
    document.getElementById('plLayers').innerHTML = '<span class="pl-lt">الطبقات:</span>' + LAB.layers.map(L =>
      `<button data-lay="${L.k}" class="${ST._lay[L.k] ? 'on' : ''}" title="${L.tip || ''}">
        <i style="background:${L.color}"></i>${L.name}${L.lvl === 3 ? ' <sup>★</sup>' : ''}</button>`).join('') +
      '<button data-lay="*all" class="pl-all">الكل</button><button data-lay="*none" class="pl-all">لا شيء</button>';
    document.getElementById('plCtrl').innerHTML = `<h3>🎛️ المتغيّرات</h3>` +
      (LAB.presets ? `<div class="pl-presets">${LAB.presets.map((p, i) => `<button class="btn gh" data-pre="${i}">${p.name}</button>`).join('')}</div>` : '') +
      `<div class="pl-ctls">${LAB.controls.map(c => ctrlHtml(c, ST)).join('')}</div>`;
    CAN && CAN.ro && CAN.ro.disconnect();
    CAN = makeCanvas(document.getElementById('plCv'), LAB);
    bindPointer();
    if (LAB.init) LAB.init(ST);
    recompute(true);
  }

  function recompute(explainNow) {
    try { RES = LAB.solve(ST); ST._err = null; } catch (e) { ST._err = e.message; console.error(e); }
    PL.dirty = true;
    const k = document.getElementById('plKpi');
    if (k && RES && LAB.kpis) k.innerHTML = LAB.kpis(ST, RES).map(([l, v, cls]) =>
      `<div class="kpi ${cls || ''}"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    clearTimeout(explTimer);
    explTimer = setTimeout(renderExplain, explainNow ? 0 : 120);
  }

  function renderExplain() {
    const box = document.getElementById('plEBody'); if (!box || !LAB) return;
    const on = (document.querySelector('#plETabs button.on') || {}).dataset;
    const tab = (on && on.e) || 'math';
    let E = {};
    try { E = (RES && LAB.explain) ? LAB.explain(ST, RES) : {}; } catch (e) { console.error(e); }
    box.innerHTML = E[tab] || '<div class="hint">لا يوجد شرح لهذه الطبقة.</div>';
  }

  function bindPointer() {
    const cv = CAN.cv;
    let drag = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      if (!LAB.onDown) return;
      const [x, y] = pos(e);
      drag = LAB.onDown(x, y, ST, RES, CAN);
      if (drag) { cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; e.preventDefault(); }
    });
    cv.addEventListener('pointermove', e => {
      const [x, y] = pos(e);
      if (drag) { if (LAB.onMove(x, y, ST, RES, CAN, drag)) { syncCtl(); recompute(); } return; }
      cv.style.cursor = LAB.hover && LAB.hover(x, y, ST, RES, CAN) ? 'grab' : 'default';
    });
    const up = () => { drag = null; cv.style.cursor = 'default'; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  // مزامنة المنزلقات مع الحالة بعد السحب أو زر جاهز
  function syncCtl() {
    LAB.controls.forEach(c => {
      if (!c.id) return;
      const el = document.querySelector(`#plCtrl [data-k="${c.id}"]`); if (!el) return;
      if (el.value != ST[c.id]) el.value = ST[c.id];
      const b = document.querySelector(`#plCtrl [data-v="${c.id}"]`); if (b) b.textContent = fmtV(c, ST[c.id]);
    });
  }
  PL.sync = () => { syncCtl(); recompute(); };

  function frame(t) {
    const root = document.getElementById('plCv');
    if (!root || !root.isConnected || !CAN || !CAN.cv.isConnected) { RAF = null; if (CAN && CAN.ro) CAN.ro.disconnect(); return; }
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    let redraw = PL.dirty;
    if (LAB.tick && RES) {
      if (LAB.tick(dt, ST, RES)) {
        redraw = true;
        if (LAB.liveKpi && t - (PL._kT || 0) > 400) {                 // تحديث الأرقام أثناء المحاكاة
          PL._kT = t; const k = document.getElementById('plKpi');
          if (k) k.innerHTML = LAB.kpis(ST, RES).map(([l, v, cls]) => `<div class="kpi ${cls || ''}"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
        }
      }
    }
    if (LAB.animated && LAB.animated(ST)) redraw = true;
    if (redraw && RES) {
      const { ctx, W, H } = CAN;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.bg2; ctx.fillRect(0, 0, W, H);
      try { LAB.draw(ctx, W, H, ST, RES, t / 1000, CAN); } catch (e) { console.error(e); ST._err = e.message; }
      if (ST._err) PL.text(ctx, '⚠ ' + ST._err, W / 2, 16, { color: C.bad, bg: 'rgba(0,0,0,.6)' });
      PL.dirty = false;
    }
    RAF = requestAnimationFrame(frame);
  }

  PL.stop = function () { if (RAF) cancelAnimationFrame(RAF); RAF = null; if (CAN && CAN.ro) CAN.ro.disconnect(); };
  PL.init = function () {
    const L = LIST();
    if (!L.length) return;
    let want = PL.cur && L.some(l => l.id === PL.cur) ? PL.cur : null;
    if (OPTS.labs) want = OPTS.first || L[0].id;                     // مختبر مزروع: ابدأ بالأول دائماً
    try { want = want || localStorage.getItem('pl_lab_' + OPTS.key) || (OPTS.key === 'phys' && localStorage.getItem('pl_lab')); } catch (e) { /* بلا تخزين */ }
    const root = document.querySelector('.pl-wrap');
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lab) { mountLab(b.dataset.lab); return; }
      if (b.dataset.cat !== undefined) {
        document.querySelectorAll('#plCats button').forEach(x => x.classList.toggle('on', x === b));
        document.querySelectorAll('#plTabs button').forEach(x => { x.style.display = !b.dataset.cat || x.dataset.lcat === b.dataset.cat ? '' : 'none'; });
        return;
      }
      if (b.dataset.lay) {
        const k = b.dataset.lay;
        if (k === '*all' || k === '*none') LAB.layers.forEach(L => { ST._lay[L.k] = k === '*all'; });
        else ST._lay[k] = !ST._lay[k];
        document.querySelectorAll('#plLayers button[data-lay]').forEach(x => {
          if (x.dataset.lay[0] !== '*') x.classList.toggle('on', !!ST._lay[x.dataset.lay]); });
        PL.dirty = true; return;
      }
      if (b.dataset.e) {
        document.querySelectorAll('#plETabs button').forEach(x => x.classList.toggle('on', x === b));
        renderExplain(); return;
      }
      if (b.dataset.pre !== undefined) {
        Object.assign(ST, LAB.presets[+b.dataset.pre].vals);
        if (LAB.onPreset) LAB.onPreset(ST);
        syncCtl(); recompute(true); return;
      }
      if (b.dataset.act && LAB.action) { LAB.action(b.dataset.act, ST, RES); syncCtl(); recompute(true); }
    });
    root.addEventListener('input', e => {
      const k = e.target.dataset && e.target.dataset.k; if (!k) return;
      const c = LAB.controls.find(q => q.id === k);
      ST[k] = c && c.type === 'select' ? e.target.value : parseFloat(e.target.value);
      if (c && c.onChange) c.onChange(ST);
      syncCtl(); recompute();
    });
    mountLab(want && L.some(l => l.id === want) ? want : L[0].id);
    if (!document.querySelector('#plETabs button.on')) document.querySelector('#plETabs button').classList.add('on');
    renderExplain();
    if (!RAF) { lastT = 0; RAF = requestAnimationFrame(frame); }
  };

  /* أداة صغيرة لرسم منحنى داخل مستطيل (للمخططات الجانبية) */
  PL.chart = function (ctx, box, o) {
    const { x, y, w, h } = box;
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,32,.85)'; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    const pl = 34, pb = 20, pt = 18, pr = 8;
    const X0 = o.x0 !== undefined ? o.x0 : Math.min(...o.xs), X1 = o.x1 !== undefined ? o.x1 : Math.max(...o.xs);
    const fin = o.series.flatMap(s => s.ys).filter(v => isFinite(v));
    let Y0 = o.y0 !== undefined ? o.y0 : Math.min(0, ...fin);
    let Y1 = o.y1 !== undefined ? o.y1 : Math.max(...fin);
    if (Y1 - Y0 < 1e-12) Y1 = Y0 + 1;
    const X = v => x + pl + (v - X0) / ((X1 - X0) || 1) * (w - pl - pr);
    const Y = v => y + h - pb - (v - Y0) / (Y1 - Y0) * (h - pb - pt);
    ctx.strokeStyle = C.grid;
    for (let i = 0; i <= 4; i++) { const yy = Y(Y0 + (Y1 - Y0) * i / 4); ctx.beginPath(); ctx.moveTo(x + pl, yy); ctx.lineTo(x + w - pr, yy); ctx.stroke();
      PL.text(ctx, nf(Y0 + (Y1 - Y0) * i / 4, o.ydec !== undefined ? o.ydec : 0), x + pl - 4, yy, { align: 'right', size: 9, color: C.mut }); }
    for (let i = 0; i <= 4; i++) { const v = X0 + (X1 - X0) * i / 4;
      PL.text(ctx, nf(v, o.xdec !== undefined ? o.xdec : 1), X(v), y + h - 8, { size: 9, color: C.mut }); }
    (o.bands || []).forEach(b => { ctx.fillStyle = b.color; const ya = Y(Math.min(Y1, b.to)), yb = Y(Math.max(Y0, b.from));
      if (b.axis === 'x') ctx.fillRect(X(b.from), y + pt, X(b.to) - X(b.from), h - pt - pb); else ctx.fillRect(x + pl, ya, w - pl - pr, yb - ya); });
    o.series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.w || 1.8; ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      let pen = false;
      o.xs.forEach((xv, i) => { const yv = s.ys[i]; if (!isFinite(yv)) { pen = false; return; } pen ? ctx.lineTo(X(xv), Y(yv)) : ctx.moveTo(X(xv), Y(yv)); pen = true; });
      ctx.stroke(); ctx.setLineDash([]);
    });
    (o.marks || []).forEach(m => {
      ctx.fillStyle = m.color || '#fff'; ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), m.r || 4, 0, 7); ctx.fill();
      if (m.label) PL.text(ctx, m.label, X(m.x), Y(m.y) - 10, { size: 9, color: m.color || '#fff', bg: 'rgba(10,16,32,.7)' });
    });
    (o.vlines || []).forEach(v => { ctx.strokeStyle = v.color; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(v.x), y + pt); ctx.lineTo(X(v.x), y + h - pb); ctx.stroke(); ctx.setLineDash([]);
      if (v.label) PL.text(ctx, v.label, X(v.x), y + pt + 6, { size: 9, color: v.color }); });
    PL.text(ctx, o.title, x + w - 6, y + 9, { align: 'right', size: 10, color: C.tx, bold: true });
    if (o.xl) PL.text(ctx, o.xl, x + w - pr, y + h - pb - 7, { align: 'right', size: 9, color: C.mut });
    ctx.restore();
    return { X, Y };
  };

  /* جدول بخطوات حساب يُعرض بطبقة المعادلات */
  PL.steps = rows => `<table class="pl-steps"><tbody>${rows.map(r => r.length === 1
    ? `<tr><td colspan="3" class="pl-sh">${r[0]}</td></tr>`
    : `<tr><td>${r[0]}</td><td class="pl-eq">${r[1]}</td><td><b>${r[2]}</b></td></tr>`).join('')}</tbody></table>`;
  PL.ok = (b, t1 = 'مقبول ✓', t2 = 'غير مقبول ✗') => b ? `<span class="tag t-ok">${t1}</span>` : `<span class="tag t-bad">${t2}</span>`;
})();
