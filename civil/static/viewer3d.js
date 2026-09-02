/* عارض X-Ray ثلاثي الأبعاد — المبنى كامل مع حديد التسليح (Three.js محلي) */
function Viewer3D(el, M, onPick) {
  if (!window.THREE) { el.innerHTML = '<div class="note">تعذّر تحميل محرك العرض ثلاثي الأبعاد</div>'; return; }
  const T = THREE;
  const g = M.grid, L = g.L, B = g.B, md = M.model, alts = M.alts || {}, st = (M.earth.stack) || [];
  const lv = M.earth.levels, fb = lv.found_bot, ft = lv.found_top;
  const nf = md.floors, hs = md.story_h;
  const W = el.clientWidth || 900, H = Math.max(460, Math.round(W * 0.58));

  const sc = new T.Scene();
  sc.background = new T.Color(0x0a1020);
  const R = Math.max(L, B, nf * hs);
  const cam = new T.PerspectiveCamera(45, W / H, 0.05, 2000);
  const home = new T.Vector3(R * 1.05, R * 0.75, R * 1.35);
  cam.position.copy(home);
  const rn = new T.WebGLRenderer({ antialias: true });
  rn.setSize(W, H); rn.setPixelRatio(Math.min(2, devicePixelRatio));
  rn.localClippingEnabled = true;
  el.innerHTML = ''; el.appendChild(rn.domElement);
  const ctl = new T.OrbitControls(cam, rn.domElement);
  const mid = new T.Vector3(0, (nf * hs + fb) / 2, 0);
  ctl.target.copy(mid); ctl.enableDamping = true; ctl.dampingFactor = .08;
  sc.add(new T.HemisphereLight(0xd7e8ff, 0x33291c, 1.0));
  const dl = new T.DirectionalLight(0xffffff, 0.7); dl.position.set(R, R * 1.6, R * .8); sc.add(dl);
  const dl2 = new T.DirectionalLight(0xffffff, 0.25); dl2.position.set(-R, R * .6, -R); sc.add(dl2);
  const gh = new T.GridHelper(R * 2.4, 24, 0x2b3d5c, 0x18243a);
  gh.position.y = lv.existing - 0.02; sc.add(gh);

  const clip = new T.Plane(new T.Vector3(-1, 0, 0), R * 1.5);
  const G = {};
  ['layers', 'raft', 'isolated', 'piles', 'columns', 'beams', 'slabs', 'rebar'].forEach(k => {
    G[k] = new T.Group(); G[k].name = k; sc.add(G[k]);
  });
  const picks = [];
  const on = { layers: 1, raft: 1, isolated: 1, piles: 1, columns: 1, beams: 1, slabs: 1 };
  const px = v => v - L / 2, pz = v => -(v - B / 2);
  const xs = [], ys = [];
  for (let i = 0; i <= g.nx; i++) xs.push(i * g.sx);
  for (let j = 0; j <= g.ny; j++) ys.push(j * g.sy);
  const kg = (vol, rate) => (vol * rate).toFixed(0);

  const mat = (col, op) => new T.MeshLambertMaterial({
    color: col, transparent: op < 1, opacity: op, clippingPlanes: [clip],
    side: T.DoubleSide, depthWrite: op > 0.6
  });
  function box(grp, w, h, d, x, y, z, col, op, info) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(col, op));
    m.position.set(x, y, z); m.userData = info || {}; grp.add(m);
    const e = new T.LineSegments(new T.EdgesGeometry(m.geometry),
      new T.LineBasicMaterial({ color: 0x08101f, transparent: true, opacity: .45, clippingPlanes: [clip] }));
    e.position.copy(m.position); grp.add(e); m.userData._edge = e;
    if (info) picks.push(m);
    return m;
  }

  /* ------------------------- طبقات التربة والردم ------------------------- */
  st.forEach(s => {
    if (s.kind === 'footing') return;
    const wide = (s.kind === 'boulder' || s.kind === 'subbase') ? 0.4 : 0.15;
    box(G.layers, L + wide, Math.max(s.t, 0.02), B + wide, 0, (s.bottom + s.top) / 2, 0,
      new T.Color(s.color), .95,
      { title: s.name, kind: 'layer', rows: [['المنسوب', s.bottom.toFixed(2) + ' → ' + s.top.toFixed(2) + ' م'],
        ['السماكة', s.t.toFixed(2) + ' م'], ['الحجم', s.volume.toFixed(1) + ' م³'],
        ['عدد الطبقات', s.layers ? s.layers + ' × ' + (s.layer_t * 100).toFixed(0) + ' سم' : '—'],
        ['الكمية المشتراة', s.buy ? s.buy.toFixed(1) + ' م³ سائب' : '—']] });
  });

  /* ------------------------------- الأساس ------------------------------- */
  const CONC = 0x5b83b0, CONC2 = 0x4a6f99;
  const rf = alts.raft && alts.raft.raft;
  const iso = alts.isolated;
  const pil = alts.piles && alts.piles.pile;
  const recIs = k => (M.recommended === k);
  if (rf) {
    box(G.raft, rf.Lx, rf.h / 1000, rf.Ly, 0, fb + rf.h / 2000, 0, 0x3f6fa5, recIs('raft') ? 1 : .32,
      { title: 'الحصيرة (Raft)' + (recIs('raft') ? ' ✓ الموصى بها' : ''), kind: 'raft',
        rows: [['الأبعاد', rf.Lx.toFixed(2) + ' × ' + rf.Ly.toFixed(2) + ' م'],
          ['السماكة', rf.h.toFixed(0) + ' مم'],
          ['ضغط التربة', rf.q_serv.toFixed(1) + ' / ' + rf.qa.toFixed(0) + ' kPa'],
          ['تسليح علوي', rf.top.label], ['تسليح سفلي', rf.bottom.label],
          ['الخرسانة', rf.conc.toFixed(1) + ' م³'], ['الحديد', rf.steel.toFixed(1) + ' طن']] });
  }
  (M.loads || []).forEach((l, k) => {
    const X = px(l.x), Z = pz(l.y);
    if (iso && iso.sizes) {
      const s = iso.sizes[k], h = iso.typical.h / 1000;
      box(G.isolated, s.B, h, s.B, X, fb + h / 2, Z, 0x4a7fb5, recIs('isolated') ? 1 : .35,
        { title: 'أساس منفرد F' + (k + 1) + ' (' + l.kind + ')' + (recIs('isolated') ? ' ✓' : ''),
          kind: 'footing', rows: [['الأبعاد', s.B.toFixed(2) + ' × ' + s.B.toFixed(2) + ' م'],
            ['السماكة', iso.typical.h.toFixed(0) + ' مم'], ['حمل الخدمة', l.P.toFixed(0) + ' kN'],
            ['ضغط التربة', (l.P / (s.B * s.B)).toFixed(1) + ' kPa'],
            ['التسليح', iso.typical.bars_label]] });
    }
    if (pil) {
      const cp = pil.cap;
      box(G.piles, cp.B, cp.h, cp.L, X, fb + cp.h / 2, Z, 0x4a7fb5, recIs('piles') ? 1 : .3,
        { title: 'هامة ركائز PC' + (k + 1) + (recIs('piles') ? ' ✓' : ''), kind: 'cap',
          rows: [['الأبعاد', cp.B.toFixed(2) + ' × ' + cp.L.toFixed(2) + ' م'],
            ['السماكة', (cp.h * 1000).toFixed(0) + ' مم'], ['عدد الركائز', pil.n],
            ['التسليح', pil.cap_rebar.label]] });
      let n = 0;
      for (let rr = 0; rr < pil.rows; rr++) for (let cc = 0; cc < pil.cols; cc++) {
        if (n >= pil.n) break;
        const ax = X + (cc - (pil.cols - 1) / 2) * pil.spacing;
        const az = Z + (rr - (pil.rows - 1) / 2) * pil.spacing;
        const o = new T.Mesh(new T.CylinderGeometry(pil.D / 2, pil.D / 2, pil.L, 16),
          mat(0x7c6ad8, recIs('piles') ? 1 : .3));
        o.position.set(ax, fb - pil.L / 2, az);
        o.userData = { title: 'ركيزة Ø' + (pil.D * 1000).toFixed(0) + ' مم', kind: 'pile',
          rows: [['الطول', pil.L + ' م'], ['القدرة المسموحة', pil.Qall.toFixed(0) + ' kN'],
            ['Qs / Qb', pil.Qs.toFixed(0) + ' / ' + pil.Qb.toFixed(0) + ' kN'],
            ['التسليح الطولي', pil.rebar.label], ['الحلزون', pil.rebar.spiral_label]] };
        G.piles.add(o); picks.push(o); n++;
      }
    }
  });

  /* --------------------- الأعمدة والجسور والسقوف ------------------------ */
  const cb = md.col.b / 1000, ch = md.col.h / 1000;
  const colTop = nf * hs;
  (M.loads || []).forEach((l, k) => {
    const X = px(l.x), Z = pz(l.y);
    for (let s = 0; s < nf; s++) {
      const z0 = s === 0 ? ft : s * hs, z1 = (s + 1) * hs;
      const m = box(G.columns, cb, z1 - z0, ch, X, (z0 + z1) / 2, Z, 0x8ea6c4, 1,
        { title: 'عمود C' + (k + 1) + ' — طابق ' + (s + 1), kind: 'column', floor: s + 1,
          rows: [['المقطع', md.col.b + ' × ' + md.col.h + ' مم'],
            ['الارتفاع', (z1 - z0).toFixed(2) + ' م'], ['حمل الخدمة', l.P.toFixed(0) + ' kN'],
            ['Pu', l.Pu.toFixed(0) + ' kN'], ['التسليح', md.col.rebar.label],
            ['الأتاري', md.col.rebar.tie_label], ['التطويق', md.col.rebar.conf_label],
            ['نسبة الاستغلال', md.col.rebar.ratio.toFixed(2)]] });
      m.userData.floor = s + 1;
    }
  });
  const bxs = md.beams.x, bys = md.beams.y;
  for (let s = 1; s <= nf; s++) {
    const z = s * hs, th = md.slab.h / 1000;
    for (let j = 0; j <= g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const hB = bxs.h / 1000, len = g.sx - cb;
      box(G.beams, len, hB, bxs.b / 1000, px((xs[i] + xs[i + 1]) / 2), z - th - hB / 2 + th, pz(ys[j]),
        0x7f97b8, 1, { title: 'جسر X — طابق ' + s, kind: 'beam', floor: s,
          rows: [['المقطع', bxs.b + ' × ' + bxs.h + ' مم'], ['البحر', g.sx.toFixed(2) + ' م'],
            ['تسليح سفلي', bxs.rebar.bottom.label], ['تسليح علوي', bxs.rebar.top.label],
            ['الأساور', bxs.rebar.stirrup.label]] });
    }
    for (let i = 0; i <= g.nx; i++) for (let j = 0; j < g.ny; j++) {
      const hB = bys.h / 1000, len = g.sy - ch;
      box(G.beams, bys.b / 1000, hB, len, px(xs[i]), z - th - hB / 2 + th, pz((ys[j] + ys[j + 1]) / 2),
        0x7f97b8, 1, { title: 'جسر Y — طابق ' + s, kind: 'beam', floor: s,
          rows: [['المقطع', bys.b + ' × ' + bys.h + ' مم'], ['البحر', g.sy.toFixed(2) + ' م'],
            ['تسليح سفلي', bys.rebar.bottom.label], ['تسليح علوي', bys.rebar.top.label],
            ['الأساور', bys.rebar.stirrup.label]] });
    }
    box(G.slabs, L, md.slab.h / 1000, B, 0, z - md.slab.h / 2000, 0, 0xa8bcd4, 1,
      { title: md.slab.name + ' — سقف طابق ' + s, kind: 'slab', floor: s,
        rows: [['السماكة', md.slab.h + ' مم'], ['المساحة', (L * B).toFixed(1) + ' م²'],
          ['تسليح سفلي', md.slab.mesh.bottom.label], ['تسليح علوي', md.slab.mesh.top.label],
          ['الخرسانة', (L * B * md.slab.h / 1000).toFixed(1) + ' م³']] });
  }

  /* ============================== التسليح ============================== */
  const STEEL = 0xe8443a, TIE = 0xff9f1c;
  let rebarBuilt = false, rebarStats = { bars: 0, meshes: 0, weight: 0, byGrp: {} };
  function tally(grp, bars, wt) {
    const b = rebarStats.byGrp[grp] || (rebarStats.byGrp[grp] = { bars: 0, weight: 0 });
    b.bars += bars; b.weight += wt;
    rebarStats.bars += bars; rebarStats.weight += wt; rebarStats.meshes++;
  }
  function visibleStats() {
    let bars = 0, weight = 0;
    Object.entries(rebarStats.byGrp).forEach(([k, v2]) => {
      if (on[k] !== 0) { bars += v2.bars; weight += v2.weight; }
    });
    return { bars: bars, weight: weight, meshes: rebarStats.meshes, byGrp: rebarStats.byGrp };
  }
  const AX = { x: new T.Vector3(0, 0, 1), z: new T.Vector3(1, 0, 0) };
  function barGeo(len, db, dir) {
    const gm = new T.CylinderGeometry(db / 2000, db / 2000, len, 6, 1);
    if (dir === 'x') gm.rotateZ(Math.PI / 2);
    if (dir === 'z') gm.rotateX(Math.PI / 2);
    return gm;
  }
  let CURG = 'rebar';
  function addBars(len, db, dir, pos, info, col) {
    if (!pos.length) return;
    if (info) info.grp = info.grp || CURG;
    const im = new T.InstancedMesh(barGeo(len, db, dir),
      new T.MeshLambertMaterial({ color: col || STEEL, clippingPlanes: [clip] }), pos.length);
    const mx = new T.Matrix4();
    pos.forEach((p, i) => { mx.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, mx); });
    im.instanceMatrix.needsUpdate = true;
    im.userData = info || {}; G.rebar.add(im); if (info) picks.push(im);
    tally((info && info.grp) || CURG, pos.length,
      pos.length * len * Math.PI * Math.pow(db / 2000, 2) * 7850);
    return im;
  }
  function ringGeo(w, d, db) {                    // أسوار/أتاري مستطيلة بزوايا منحنية
    const r = Math.min(w, d) * 0.12;
    const pts = [];
    const seg = [[w / 2 - r, d / 2], [-w / 2 + r, d / 2], [-w / 2, d / 2 - r], [-w / 2, -d / 2 + r],
                 [-w / 2 + r, -d / 2], [w / 2 - r, -d / 2], [w / 2, -d / 2 + r], [w / 2, d / 2 - r]];
    seg.forEach(q => pts.push(new T.Vector3(q[0], 0, q[1])));
    const cv = new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.1);
    return new T.TubeGeometry(cv, 40, db / 2000, 5, true);
  }
  function addRings(w, d, db, pos, info, col) {
    if (!pos.length) return;
    if (info) info.grp = info.grp || CURG;
    const im = new T.InstancedMesh(ringGeo(w, d, db),
      new T.MeshLambertMaterial({ color: col || TIE, clippingPlanes: [clip] }), pos.length);
    const mx = new T.Matrix4();
    pos.forEach((p, i) => { mx.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, mx); });
    im.instanceMatrix.needsUpdate = true;
    im.userData = info || {}; G.rebar.add(im); if (info) picks.push(im);
    tally((info && info.grp) || CURG, pos.length,
      pos.length * 2 * (w + d) * Math.PI * Math.pow(db / 2000, 2) * 7850);
    return im;
  }
  function meshGrid(x0, z0, lx, lz, s, db, y, info) {   // شبكة بالاتجاهين
    if (info) info.grp = info.grp || CURG;
    const nx = Math.max(2, Math.floor(lz / (s / 1000)) + 1);
    const nz = Math.max(2, Math.floor(lx / (s / 1000)) + 1);
    const px_ = [], pz_ = [];
    for (let i = 0; i < nx; i++) px_.push([x0 + lx / 2, y, z0 + i * lz / (nx - 1)]);
    for (let i = 0; i < nz; i++) pz_.push([x0 + i * lx / (nz - 1), y + db / 1000, z0 + lz / 2]);
    addBars(lx, db, 'x', px_, info);
    addBars(lz, db, 'z', pz_, info);
  }

  function buildRebar() {
    if (rebarBuilt) return;
    rebarBuilt = true;
    const cvr = 0.05;
    // ---- الحصيرة ----
    CURG = 'raft';
    if (rf) {
      const t = rf.h / 1000;
      meshGrid(-rf.Lx / 2, -rf.Ly / 2, rf.Lx, rf.Ly, rf.bottom.s, rf.bottom.db, fb + 0.075,
        { title: 'تسليح الحصيرة السفلي', kind: 'rebar', rows: [['القطر والتباعد', rf.bottom.label],
          ['الاتجاه', 'بالاتجاهين'], ['المنسوب', (fb + 0.075).toFixed(2) + ' م']] });
      meshGrid(-rf.Lx / 2, -rf.Ly / 2, rf.Lx, rf.Ly, rf.top.s, rf.top.db, fb + t - 0.075,
        { title: 'تسليح الحصيرة العلوي', kind: 'rebar', rows: [['القطر والتباعد', rf.top.label],
          ['الاتجاه', 'بالاتجاهين'], ['المنسوب', (fb + t - 0.075).toFixed(2) + ' م']] });
    }
    // ---- الأسس المنفردة ----
    CURG = 'isolated';
    if (iso && iso.sizes) {
      const db = iso.typical.bar_db || 16, s = iso.typical.spacing || 200;
      iso.sizes.forEach((sz, k) => {
        const X = px(M.loads[k].x) - sz.B / 2, Z = pz(M.loads[k].y) - sz.B / 2;
        meshGrid(X, Z, sz.B, sz.B, s, db, fb + 0.075,
          { title: 'تسليح الأساس F' + (k + 1), kind: 'rebar',
            rows: [['التسليح', iso.typical.bars_label], ['المنسوب', (fb + 0.075).toFixed(2) + ' م']] });
      });
    }
    // ---- الركائز ----
    CURG = 'piles';
    if (pil) {
      const rb = pil.rebar, cp = pil.cap;
      M.loads.forEach((l, k) => {
        const X = px(l.x), Z = pz(l.y);
        meshGrid(X - cp.B / 2, Z - cp.L / 2, cp.B, cp.L, pil.cap_rebar.s, pil.cap_rebar.db, fb + 0.075,
          { title: 'تسليح هامة الركائز', kind: 'rebar', rows: [['التسليح', pil.cap_rebar.label]] });
        let n = 0;
        for (let rr = 0; rr < pil.rows; rr++) for (let cc = 0; cc < pil.cols; cc++) {
          if (n >= pil.n) break;
          const ax = X + (cc - (pil.cols - 1) / 2) * pil.spacing;
          const az = Z + (rr - (pil.rows - 1) / 2) * pil.spacing;
          const rad = pil.D / 2 - 0.075, pos = [];
          for (let b = 0; b < rb.n; b++) {
            const a = b * 2 * Math.PI / rb.n;
            pos.push([ax + rad * Math.cos(a), fb - pil.L / 2, az + rad * Math.sin(a)]);
          }
          addBars(pil.L, rb.db, 'y', pos,
            { title: 'تسليح الركيزة الطولي', kind: 'rebar', rows: [['التسليح', rb.label],
              ['نسبة التسليح', (rb.rho * 100).toFixed(2) + '%'], ['الحلزون', rb.spiral_label]] });
          const sp = [], ns = Math.floor(pil.L / (rb.spiral_s / 1000));
          for (let i = 0; i < ns; i++) sp.push([ax, fb - 0.1 - i * rb.spiral_s / 1000, az]);
          addRings(rad * 2, rad * 2, rb.spiral_db, sp,
            { title: 'حلزون الركيزة', kind: 'rebar', rows: [['التفصيل', rb.spiral_label]] });
          n++;
        }
      });
    }
    // ---- الأعمدة ----
    CURG = 'columns';
    const cr = md.col.rebar, nbf = cr.nb;
    M.loads.forEach((l, k) => {
      const X = px(l.x), Z = pz(l.y);
      for (let s = 0; s < nf; s++) {
        const z0 = s === 0 ? ft : s * hs, z1 = (s + 1) * hs, len = z1 - z0;
        const ix = cb / 2 - cvr, iz = ch / 2 - cvr, pos = [];
        for (let a = 0; a < nbf; a++) {
          const t2 = nbf === 1 ? .5 : a / (nbf - 1);
          pos.push([X - ix + 2 * ix * t2, (z0 + z1) / 2, Z - iz]);
          pos.push([X - ix + 2 * ix * t2, (z0 + z1) / 2, Z + iz]);
        }
        for (let a = 1; a < nbf - 1; a++) {
          const t2 = a / (nbf - 1);
          pos.push([X - ix, (z0 + z1) / 2, Z - iz + 2 * iz * t2]);
          pos.push([X + ix, (z0 + z1) / 2, Z - iz + 2 * iz * t2]);
        }
        addBars(len, cr.db, 'y', pos,
          { title: 'أسياخ العمود C' + (k + 1) + ' — طابق ' + (s + 1), kind: 'rebar', floor: s + 1,
            rows: [['التسليح', cr.label], ['نسبة التسليح', (cr.rho * 100).toFixed(2) + '%'],
              ['نسبة الاستغلال', cr.ratio.toFixed(2)]] });
        const tp = [], sc_ = cr.tie_s_conf / 1000, sm = cr.tie_s / 1000, lo = cr.conf_len / 1000;
        for (let y2 = z0 + 0.05; y2 < z0 + lo; y2 += sc_) tp.push([X, y2, Z]);
        for (let y2 = z0 + lo; y2 < z1 - lo; y2 += sm) tp.push([X, y2, Z]);
        for (let y2 = Math.max(z1 - lo, z0 + lo); y2 < z1 - 0.05; y2 += sc_) tp.push([X, y2, Z]);
        addRings(cb - 2 * cvr, ch - 2 * cvr, cr.tie_db, tp,
          { title: 'أتاري العمود — طابق ' + (s + 1), kind: 'rebar', floor: s + 1,
            rows: [['الوسط', cr.tie_label], ['التطويق', cr.conf_label]] });
      }
    });
    // ---- الجسور والسقوف ----
    const th = md.slab.h / 1000;
    for (let s = 1; s <= nf; s++) {
      const z = s * hs;
      [['x', bxs], ['y', bys]].forEach(([dir, bm]) => {
        const hB = bm.h / 1000, bW = bm.b / 1000;
        const yTop = z - th - hB + th - 0.0 + hB - cvr, yBot = z - hB + th - th + 0.0;
        const yb = z - th - hB + cvr + th - th + (th - th);      // أسفل الجسر + غطاء
        const bot = [], top = [], stp = [];
        const nb2 = bm.rebar.bottom.n, nt = bm.rebar.top.n, sdb = bm.rebar.stirrup;
        const lines = dir === 'x' ? ys : xs, spanA = dir === 'x' ? xs : ys;
        const len = (dir === 'x' ? g.sx : g.sy) - (dir === 'x' ? cb : ch);
        for (let a = 0; a < lines.length; a++) for (let b2 = 0; b2 < spanA.length - 1; b2++) {
          const cX = dir === 'x' ? px((spanA[b2] + spanA[b2 + 1]) / 2) : px(lines[a]);
          const cZ = dir === 'x' ? pz(lines[a]) : pz((spanA[b2] + spanA[b2 + 1]) / 2);
          const yb2 = z - hB + cvr, yt2 = z - cvr - th;
          for (let i = 0; i < nb2; i++) {
            const o = nb2 === 1 ? 0 : (i / (nb2 - 1) - .5) * (bW - 2 * cvr);
            bot.push(dir === 'x' ? [cX, yb2, cZ + o] : [cX + o, yb2, cZ]);
          }
          for (let i = 0; i < nt; i++) {
            const o = nt === 1 ? 0 : (i / (nt - 1) - .5) * (bW - 2 * cvr);
            top.push(dir === 'x' ? [cX, yt2, cZ + o] : [cX + o, yt2, cZ]);
          }
          const ns = Math.max(2, Math.floor(len / (sdb.s / 1000)));
          for (let i = 0; i <= ns; i++) {
            const t2 = -len / 2 + i * len / ns;
            stp.push(dir === 'x' ? [cX + t2, z - hB / 2, cZ] : [cX, z - hB / 2, cZ + t2]);
          }
        }
        const info = t => ({ title: t + ' — جسور ' + dir.toUpperCase() + ' طابق ' + s, kind: 'rebar', floor: s,
          rows: [['المقطع', bm.b + ' × ' + bm.h + ' مم'], ['سفلي', bm.rebar.bottom.label],
            ['علوي', bm.rebar.top.label], ['الأساور', bm.rebar.stirrup.label]] });
        CURG = 'beams';
        addBars(len, bm.rebar.bottom.db, dir === 'x' ? 'x' : 'z', bot, info('تسليح سفلي'));
        addBars(len, bm.rebar.top.db, dir === 'x' ? 'x' : 'z', top, info('تسليح علوي'));
        const rw = dir === 'x' ? bW - 2 * cvr : bW - 2 * cvr;
        const im = addRings(dir === 'x' ? rw : hB - 2 * cvr, dir === 'x' ? hB - 2 * cvr : rw,
          sdb.db, stp, info('أساور'));
        if (im) { im.geometry.rotateX(Math.PI / 2); if (dir === 'y') im.geometry.rotateY(Math.PI / 2); }
      });
      // شبكات السقف
      CURG = 'slabs';
      const mb = md.slab.mesh.bottom, mt = md.slab.mesh.top;
      meshGrid(-L / 2, -B / 2, L, B, mb.s, mb.db, z - th + 0.025,
        { title: 'تسليح السقف السفلي — طابق ' + s, kind: 'rebar', floor: s,
          rows: [['القطر والتباعد', mb.label], ['الاتجاه', 'بالاتجاهين'], ['السماكة', md.slab.h + ' مم']] });
      meshGrid(-L / 2, -B / 2, L, B, mt.s, mt.db, z - 0.025,
        { title: 'تسليح السقف العلوي — طابق ' + s, kind: 'rebar', floor: s,
          rows: [['القطر والتباعد', mt.label], ['الاتجاه', 'بالاتجاهين'],
            ['ملاحظة', 'يُركّز فوق المساند والجسور']] });
    }
    G.rebar.traverse(o => { if (o.isInstancedMesh) o.frustumCulled = false; });
  }

  /* ------------------------------ التفاعل ------------------------------- */
  const ray = new T.Raycaster(), mouse = new T.Vector2();
  let floorSel = 'all';
  function applyVis() {
    [G.columns, G.beams, G.slabs].forEach(grp => grp.children.forEach(o => {
      const f = o.userData && o.userData.floor;
      o.visible = (floorSel === 'all' || !f || f === floorSel);
    }));
    G.rebar.children.forEach(o => {
      const u = o.userData || {};
      o.visible = (on[u.grp] !== 0) && (floorSel === 'all' || !u.floor || u.floor === floorSel);
    });
  }
  rn.domElement.addEventListener('pointerdown', ev => {
    const r = rn.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObjects(picks.filter(o => o.visible && o.parent.visible), false)[0];
    if (hit && onPick) {
      onPick(hit.object.userData);
      const b = new T.Box3().setFromObject(hit.object);
      const c = b.getCenter(new T.Vector3()), sz = b.getSize(new T.Vector3()).length();
      ctl.target.copy(c);
      const dir = cam.position.clone().sub(c).normalize();
      cam.position.copy(c.clone().add(dir.multiplyScalar(Math.max(2.5, sz * 1.6))));
    }
  });
  let alive = true;
  (function loop() {
    if (!alive || !document.body.contains(rn.domElement)) { alive = false; return; }
    ctl.update(); rn.render(sc, cam); requestAnimationFrame(loop);
  })();

  let xrayOn = false;
  return {
    R: R,
    group: (n, v2) => { on[n] = v2 ? 1 : 0; if (G[n]) G[n].visible = !!v2; applyVis();
      return visibleStats(); },
    rebar: v2 => { buildRebar(); G.rebar.visible = v2; applyVis(); return visibleStats(); },
    xray: on => {
      xrayOn = on;
      [G.layers, G.slabs, G.beams, G.columns, G.raft, G.isolated, G.piles].forEach(grp =>
        grp.children.forEach(o => {
          if (o.isLineSegments) { o.material.opacity = on ? .25 : .45; return; }
          if (!o.material) return;
          if (o.userData._op === undefined) o.userData._op = o.material.opacity;
          o.material.transparent = true;
          o.material.opacity = on ? Math.min(o.userData._op, .13) : o.userData._op;
          o.material.depthWrite = !on;
        }));
    },
    floor: v => { floorSel = v; applyVis(); },
    clip: v => { clip.constant = v; },
    reset: () => { cam.position.copy(home); ctl.target.copy(mid); },
    top: () => { cam.position.set(0.01, R * 2.4, 0.01); ctl.target.set(0, 0, 0); },
    stats: () => visibleStats()
  };
}
