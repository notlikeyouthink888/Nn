/* عارض X-Ray ثلاثي الأبعاد — مبنى كامل أو غرفة، مع التسليح والوصلات والكراسي
   والعزوم وقص الثقب والتسليح الإضافي والهطول. (Three.js مستضاف محلياً) */
function Viewer3D(el, M, onPick) {
  if (!window.THREE) { el.innerHTML = '<div class="note">تعذّر تحميل محرك العرض</div>'; return; }
  const T = THREE, md = M.model, ROOM = md.kind === 'room';
  const g = M.grid || { L: md.L, B: md.W, nx: 1, ny: 1, sx: md.L, sy: md.W };
  const L = ROOM ? md.L : g.L, B = ROOM ? md.W : g.B;
  const st = (M.earth && M.earth.stack) || [];
  const lv = (M.earth && M.earth.levels) || { found_bot: -1.5, found_top: -1.0, existing: -0.3 };
  const fb = ROOM ? -(M.foot ? 1.5 : 1.2) : lv.found_bot;
  const ft = ROOM ? fb + (M.foot ? M.foot.h / 1000 : 0.3) : lv.found_top;
  const nf = ROOM ? 1 : md.floors, hs = md.story_h;
  const W = el.clientWidth || 900, H = Math.max(470, Math.round(W * 0.58));
  const alts = M.alts || {};

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
  const dl = new T.DirectionalLight(0xffffff, .7); dl.position.set(R, R * 1.6, R * .8); sc.add(dl);
  const dl2 = new T.DirectionalLight(0xffffff, .25); dl2.position.set(-R, R * .6, -R); sc.add(dl2);
  const gh = new T.GridHelper(R * 2.4, 24, 0x2b3d5c, 0x18243a);
  gh.position.y = ROOM ? fb - 0.2 : lv.existing - 0.02; sc.add(gh);

  const clip = new T.Plane(new T.Vector3(-1, 0, 0), R * 1.5);
  const GN = ['layers', 'walls', 'raft', 'isolated', 'piles', 'columns', 'beams', 'slabs',
              'rebar', 'extra', 'chairs', 'moments', 'punch', 'defl'];
  const G = {}; GN.forEach(k => { G[k] = new T.Group(); G[k].name = k; sc.add(G[k]); });
  G.moments.visible = G.punch.visible = G.defl.visible = G.rebar.visible = G.extra.visible =
    G.chairs.visible = false;
  const on = {}; GN.forEach(k => on[k] = 1);
  const picks = [];
  const px = v => v - L / 2, pz = v => -(v - B / 2);
  const xs = [], ys = [];
  for (let i = 0; i <= g.nx; i++) xs.push(i * g.sx);
  for (let j = 0; j <= g.ny; j++) ys.push(j * g.sy);

  const mat = (c, o) => new T.MeshLambertMaterial({ color: c, transparent: o < 1, opacity: o,
    clippingPlanes: [clip], side: T.DoubleSide, depthWrite: o > .6 });
  function box(grp, w, h, d, x, y, z, col, op, info) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(col, op));
    m.position.set(x, y, z); m.userData = info || {}; grp.add(m);
    const e = new T.LineSegments(new T.EdgesGeometry(m.geometry),
      new T.LineBasicMaterial({ color: 0x08101f, transparent: true, opacity: .45, clippingPlanes: [clip] }));
    e.position.copy(m.position); grp.add(e);
    if (info) picks.push(m);
    return m;
  }

  /* ============================ الخرسانة ============================ */
  if (!ROOM) {
    st.forEach(s => {
      if (s.kind === 'footing') return;
      const wide = (s.kind === 'boulder' || s.kind === 'subbase') ? .4 : .15;
      box(G.layers, L + wide, Math.max(s.t, .02), B + wide, 0, (s.bottom + s.top) / 2, 0,
        new T.Color(s.color), .95, { title: s.name, kind: 'layer', grp: 'layers',
          rows: [['المنسوب', s.bottom.toFixed(2) + ' → ' + s.top.toFixed(2) + ' م'],
            ['السماكة', s.t.toFixed(2) + ' م'], ['الحجم', s.volume.toFixed(1) + ' م³'],
            ['عدد الطبقات', s.layers ? s.layers + ' × ' + (s.layer_t * 100).toFixed(0) + ' سم' : '—'],
            ['الكمية المشتراة', s.buy ? s.buy.toFixed(1) + ' م³ سائب' : '—']] });
    });
  }
  const rf = alts.raft && alts.raft.raft, iso = alts.isolated, pil = alts.piles && alts.piles.pile;
  const recIs = k => (M.recommended === k);
  if (rf) box(G.raft, rf.Lx, rf.h / 1000, rf.Ly, 0, fb + rf.h / 2000, 0, 0x3f6fa5,
    recIs('raft') ? 1 : .32, { title: 'الحصيرة' + (recIs('raft') ? ' ✓ الموصى بها' : ''),
      kind: 'raft', grp: 'raft', rows: [['الأبعاد', rf.Lx.toFixed(2) + ' × ' + rf.Ly.toFixed(2) + ' م'],
        ['السماكة', rf.h.toFixed(0) + ' مم'], ['ضغط التربة', rf.q_serv.toFixed(1) + ' / ' + rf.qa.toFixed(0) + ' kPa'],
        ['علوي', rf.top.label], ['سفلي', rf.bottom.label], ['الخرسانة', rf.conc.toFixed(1) + ' م³']] });

  const cb = md.col.b / 1000, ch = md.col.h / 1000;
  const COLS = ROOM ? [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: B }, { x: 0, y: B }]
                    : (M.loads || []);
  COLS.forEach((l, k) => {
    const X = px(l.x), Z = pz(l.y);
    if (ROOM && M.foot) {
      const fB = M.foot.B, fh = M.foot.h / 1000;
      box(G.isolated, fB, fh, fB, X, fb + fh / 2, Z, 0x4a7fb5, 1,
        { title: 'أساس منفرد F' + (k + 1), kind: 'footing', grp: 'isolated',
          rows: [['الأبعاد', fB.toFixed(2) + ' × ' + fB.toFixed(2) + ' م'],
            ['السماكة', M.foot.h.toFixed(0) + ' مم'], ['التسليح', M.foot.bars_label]] });
    } else if (iso && iso.sizes) {
      const s = iso.sizes[k], h = iso.typical.h / 1000;
      box(G.isolated, s.B, h, s.B, X, fb + h / 2, Z, 0x4a7fb5, recIs('isolated') ? 1 : .35,
        { title: 'أساس منفرد F' + (k + 1) + ' (' + l.kind + ')', kind: 'footing', grp: 'isolated',
          rows: [['الأبعاد', s.B.toFixed(2) + ' × ' + s.B.toFixed(2) + ' م'],
            ['السماكة', iso.typical.h.toFixed(0) + ' مم'], ['حمل الخدمة', l.P.toFixed(0) + ' kN'],
            ['ضغط التربة', (l.P / (s.B * s.B)).toFixed(1) + ' kPa'], ['التسليح', iso.typical.bars_label]] });
    }
    if (pil) {
      const cp = pil.cap;
      box(G.piles, cp.B, cp.h, cp.L, X, fb + cp.h / 2, Z, 0x4a7fb5, recIs('piles') ? 1 : .3,
        { title: 'هامة ركائز PC' + (k + 1), kind: 'cap', grp: 'piles',
          rows: [['الأبعاد', cp.B.toFixed(2) + ' × ' + cp.L.toFixed(2) + ' م'],
            ['عدد الركائز', pil.n], ['التسليح', pil.cap_rebar.label]] });
      let n = 0;
      for (let rr = 0; rr < pil.rows; rr++) for (let cc = 0; cc < pil.cols; cc++) {
        if (n >= pil.n) break;
        const ax = X + (cc - (pil.cols - 1) / 2) * pil.spacing;
        const az = Z + (rr - (pil.rows - 1) / 2) * pil.spacing;
        const o = new T.Mesh(new T.CylinderGeometry(pil.D / 2, pil.D / 2, pil.L, 16),
          mat(0x7c6ad8, recIs('piles') ? 1 : .3));
        o.position.set(ax, fb - pil.L / 2, az);
        o.userData = { title: 'ركيزة Ø' + (pil.D * 1000).toFixed(0), kind: 'pile', grp: 'piles',
          rows: [['الطول', pil.L + ' م'], ['القدرة', pil.Qall.toFixed(0) + ' kN'],
            ['التسليح', pil.rebar.label], ['الحلزون', pil.rebar.spiral_label]] };
        G.piles.add(o); picks.push(o); n++;
      }
    }
    for (let s = 0; s < nf; s++) {
      const z0 = s === 0 ? ft : s * hs, z1 = (s + 1) * hs;
      box(G.columns, cb, z1 - z0, ch, X, (z0 + z1) / 2, Z, 0x8ea6c4, 1,
        { title: 'عمود C' + (k + 1) + (ROOM ? '' : ' — طابق ' + (s + 1)), kind: 'column',
          grp: 'columns', floor: s + 1,
          rows: [['المقطع', md.col.b + ' × ' + md.col.h + ' مم'],
            ['الارتفاع', (z1 - z0).toFixed(2) + ' م'],
            ['التسليح', md.col.rebar.label], ['الأتاري', md.col.rebar.tie_label],
            ['التطويق', md.col.rebar.conf_label || '—'],
            ['نسبة الاستغلال', (md.col.rebar.ratio || 0).toFixed(2)]] });
    }
  });

  const th = md.slab.h / 1000;
  if (ROOM) {
    (md.walls || []).forEach(w => w.segments.forEach(s => {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy);
      const cxp = px((s.x1 + s.x2) / 2), czp = pz((s.y1 + s.y2) / 2);
      const horiz = Math.abs(dx) > Math.abs(dy);
      const m = box(G.walls, horiz ? len : s.t, s.z1 - s.z0, horiz ? s.t : len,
        cxp, (s.z0 + s.z1) / 2, czp, 0xc9a882, .97,
        { title: 'جدار ' + w.i + ' — ' + ({ pier: 'رجل', lintel: 'عتب فوق الفتحة', sill: 'جلسة شباك' }[s.tag] || ''),
          kind: 'wall', grp: 'walls',
          rows: [['الطول', len.toFixed(2) + ' م'], ['الارتفاع', (s.z1 - s.z0).toFixed(2) + ' م'],
            ['السماكة', (s.t * 1000).toFixed(0) + ' مم'],
            ['الفتحات', w.openings.map(o => o.kind + ' ' + o.w + '×' + o.h).join(' · ') || 'لا يوجد']] });
      m.userData.floor = 1;
    }));
    (md.beams || []).forEach((b, i) => {
      const dx = b.x2 - b.x1, dy = b.y2 - b.y1, len = Math.hypot(dx, dy);
      const horiz = Math.abs(dx) > Math.abs(dy), hB = b.h / 1000;
      box(G.beams, horiz ? len : b.b / 1000, hB, horiz ? b.b / 1000 : len,
        px((b.x1 + b.x2) / 2), hs - th - hB / 2 + th, pz((b.y1 + b.y2) / 2), 0x7f97b8, 1,
        { title: 'جسر ' + (i + 1), kind: 'beam', grp: 'beams', floor: 1,
          rows: [['المقطع', b.b + ' × ' + b.h + ' مم'], ['البحر', b.span.toFixed(2) + ' م'],
            ['نوع الحمل', b.share], ['Mu', b.Mu.toFixed(1) + ' kN·m'],
            ['سفلي', b.bottom.label], ['الأساور', b.stirrup.label],
            ['الهطول', Math.abs(b.defl).toFixed(1) + ' / ' + b.defl_lim.toFixed(1) + ' مم']] });
    });
    box(G.slabs, L, th, B, 0, hs - th / 2, 0, 0xa8bcd4, 1,
      { title: md.slab.name, kind: 'slab', grp: 'slabs', floor: 1,
        rows: [['السماكة', md.slab.h + ' مم'], ['المساحة', (L * B).toFixed(1) + ' م²'],
          ['سفلي (قصير)', md.slab.mesh.bottom.label], ['سفلي (طويل)', md.slab.long.label],
          ['علوي', md.slab.mesh.top.label]] });
  } else {
    const bxs = md.beams.x, bys = md.beams.y;
    for (let s = 1; s <= nf; s++) {
      const z = s * hs;
      for (let j = 0; j <= g.ny; j++) for (let i = 0; i < g.nx; i++)
        box(G.beams, g.sx - cb, bxs.h / 1000, bxs.b / 1000, px((xs[i] + xs[i + 1]) / 2),
          z - bxs.h / 2000, pz(ys[j]), 0x7f97b8, 1,
          { title: 'جسر X — طابق ' + s, kind: 'beam', grp: 'beams', floor: s,
            rows: [['المقطع', bxs.b + ' × ' + bxs.h + ' مم'], ['البحر', g.sx.toFixed(2) + ' م'],
              ['سفلي', bxs.rebar.bottom.label], ['علوي', bxs.rebar.top.label],
              ['الأساور', bxs.rebar.stirrup.label],
              ['الهطول', Math.abs(bxs.d_long).toFixed(1) + ' / ' + bxs.d_limit.toFixed(1) + ' مم']] });
      for (let i = 0; i <= g.nx; i++) for (let j = 0; j < g.ny; j++)
        box(G.beams, bys.b / 1000, bys.h / 1000, g.sy - ch, px(xs[i]), z - bys.h / 2000,
          pz((ys[j] + ys[j + 1]) / 2), 0x7f97b8, 1,
          { title: 'جسر Y — طابق ' + s, kind: 'beam', grp: 'beams', floor: s,
            rows: [['المقطع', bys.b + ' × ' + bys.h + ' مم'], ['البحر', g.sy.toFixed(2) + ' م'],
              ['سفلي', bys.rebar.bottom.label], ['علوي', bys.rebar.top.label],
              ['الأساور', bys.rebar.stirrup.label]] });
      box(G.slabs, L, th, B, 0, z - th / 2, 0, 0xa8bcd4, 1,
        { title: md.slab.name + ' — سقف طابق ' + s, kind: 'slab', grp: 'slabs', floor: s,
          rows: [['السماكة', md.slab.h + ' مم'], ['المساحة', (L * B).toFixed(1) + ' م²'],
            ['شبكة سفلية', md.slab.mesh.bottom.label],
            ['علوي فوق المساند', md.slab.mesh.top.label],
            ['الخرسانة', (L * B * md.slab.h / 1000).toFixed(1) + ' م³']] });
    }
  }

  /* ============================== التسليح ============================== */
  const STEEL = 0xe8443a, TIE = 0xff9f1c, EXTRA = 0x22d3ee, CHAIR = 0x86efac;
  let built = false, S = { bars: 0, meshes: 0, weight: 0, byGrp: {} }, CURG = 'rebar';
  const stock = md.stock || 12.0, LAPS = md.laps || {};
  const lapOf = db => { const l = LAPS[db] || LAPS[String(db)];
    return l ? (typeof l === 'object' ? l.bottom : l) : 0.6; };
  function tally(grp, n, w) {
    const b = S.byGrp[grp] || (S.byGrp[grp] = { bars: 0, weight: 0 });
    b.bars += n; b.weight += w; S.bars += n; S.weight += w; S.meshes++;
  }
  function barGeo(len, db, dir) {
    const gm = new T.CylinderGeometry(db / 2000, db / 2000, len, 6, 1);
    if (dir === 'x') gm.rotateZ(Math.PI / 2);
    if (dir === 'z') gm.rotateX(Math.PI / 2);
    return gm;
  }
  function inst(geo, col, pos, info, grp, wt, meta) {
    if (!pos.length) return null;
    const im = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ color: col,
      clippingPlanes: [clip] }), pos.length);
    const mx = new T.Matrix4();
    pos.forEach((p, i) => { mx.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, mx); });
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
    if (info) { info.grp = info.grp || CURG; im.userData = info; picks.push(im); }
    else { im.userData = meta || { grp: CURG }; }      // القطع التالية: مجموعة للرؤية فقط
    (grp || G.rebar).add(im);
    tally(im.userData.grp || CURG, pos.length, wt || 0);
    return im;
  }
  /* سيخ مقطوع على أطوال السوق مع وصلات ظاهرة */
  function addRun(len, db, dir, pos, info, col, grp) {
    const lap = lapOf(db);
    let n = 1;
    while ((len + (n - 1) * lap) / n > stock && n < 60) n++;
    const piece = (len + (n - 1) * lap) / n;
    const w1 = piece * Math.PI * Math.pow(db / 2000, 2) * 7850;
    for (let i = 0; i < n; i++) {
      const startC = i * (piece - lap) + piece / 2 - len / 2;
      const off = (i % 2) ? db / 1000 : 0;                 // إزاحة لإظهار التداخل
      const pp = pos.map(p => dir === 'x' ? [p[0] + startC, p[1], p[2] + off]
        : dir === 'z' ? [p[0] + off, p[1], p[2] + startC] : [p[0] + off, p[1] + startC, p[2]]);
      const inf = i === 0 && info ? Object.assign({}, info, { rows: (info.rows || []).concat(
        [['التقطيع', n + ' قطعة × ' + piece.toFixed(2) + ' م (سوق ' + stock + ' م)'],
         ['الوصلات', (n - 1) + ' وصلة × ' + lap.toFixed(2) + ' م (1.3·ld)']]) }) : null;
      const meta = { grp: (info && info.grp) || CURG, floor: info && info.floor };
      inst(barGeo(piece, db, dir), col || STEEL, pp, inf, grp, w1 * pp.length, meta);
    }
    return n;
  }
  function ringGeo(w, d, db) {
    const r = Math.min(w, d) * .12, pts = [];
    [[w / 2 - r, d / 2], [-w / 2 + r, d / 2], [-w / 2, d / 2 - r], [-w / 2, -d / 2 + r],
     [-w / 2 + r, -d / 2], [w / 2 - r, -d / 2], [w / 2, -d / 2 + r], [w / 2, d / 2 - r]]
      .forEach(q => pts.push(new T.Vector3(q[0], 0, q[1])));
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts, true, 'catmullrom', .1), 36, db / 2000, 5, true);
  }
  function addRings(w, d, db, pos, info, col, grp, rot) {
    if (!pos.length) return null;
    const geo = ringGeo(w, d, db);
    if (rot === 'x') geo.rotateX(Math.PI / 2);
    if (rot === 'z') { geo.rotateX(Math.PI / 2); geo.rotateY(Math.PI / 2); }
    return inst(geo, col || TIE, pos, info, grp,
      pos.length * 2 * (w + d) * Math.PI * Math.pow(db / 2000, 2) * 7850);
  }
  function chairGeo(ht, db, wdt) {
    const w2 = (wdt || .25) / 2, pts = [
      new T.Vector3(-w2 - .08, 0, 0), new T.Vector3(-w2, 0, 0), new T.Vector3(-w2, ht, 0),
      new T.Vector3(w2, ht, 0), new T.Vector3(w2, 0, 0), new T.Vector3(w2 + .08, 0, 0)];
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', .05), 24, db / 2000, 5, false);
  }
  function addChairs(x0, z0, lx, lz, sp, ht, db, y, info) {
    const pos = [];
    for (let a = sp / 2; a < lx; a += sp) for (let b2 = sp / 2; b2 < lz; b2 += sp)
      pos.push([x0 + a, y, z0 + b2]);
    return inst(chairGeo(ht, db), CHAIR, pos, info, G.chairs,
      pos.length * (2 * ht + .3) * Math.PI * Math.pow(db / 2000, 2) * 7850);
  }
  function meshGrid(x0, z0, lx, lz, s, db, y, info, col, grp) {
    const n1 = Math.max(2, Math.floor(lz / (s / 1000)) + 1);
    const n2 = Math.max(2, Math.floor(lx / (s / 1000)) + 1);
    const a = [], b2 = [];
    for (let i = 0; i < n1; i++) a.push([x0 + lx / 2, y, z0 + i * lz / (n1 - 1)]);
    for (let i = 0; i < n2; i++) b2.push([x0 + i * lx / (n2 - 1), y + db / 1000, z0 + lz / 2]);
    addRun(lx, db, 'x', a, info, col, grp);
    addRun(lz, db, 'z', b2, info, col, grp);
  }

  function buildRebar() {
    if (built) return; built = true;
    const cvr = .05;
    // ---- الأساس ----
    CURG = 'raft';
    if (rf) {
      const t = rf.h / 1000;
      meshGrid(-rf.Lx / 2, -rf.Ly / 2, rf.Lx, rf.Ly, rf.bottom.s, rf.bottom.db, fb + .075,
        { title: 'تسليح الحصيرة السفلي', kind: 'rebar', rows: [['التفصيل', rf.bottom.label]] });
      meshGrid(-rf.Lx / 2, -rf.Ly / 2, rf.Lx, rf.Ly, rf.top.s, rf.top.db, fb + t - .075,
        { title: 'تسليح الحصيرة العلوي', kind: 'rebar', rows: [['التفصيل', rf.top.label]] });
      const fc2 = md.found && md.found.chairs;
      if (fc2) addChairs(-rf.Lx / 2, -rf.Ly / 2, rf.Lx, rf.Ly, fc2.spacing, fc2.height / 1000,
        fc2.db, fb + .075, { title: 'كراسي الحصيرة', kind: 'rebar', grp: 'raft',
          rows: [['التفصيل', fc2.label], ['العدد', fc2.n], ['الوزن', fc2.weight.toFixed(2) + ' طن']] });
    }
    CURG = 'isolated';
    if (ROOM && M.foot) {
      COLS.forEach((l, k) => meshGrid(px(l.x) - M.foot.B / 2, pz(l.y) - M.foot.B / 2,
        M.foot.B, M.foot.B, M.foot.s, M.foot.db, fb + .075,
        { title: 'تسليح الأساس F' + (k + 1), kind: 'rebar', rows: [['التفصيل', M.foot.label]] }));
    } else if (iso && iso.sizes) {
      iso.sizes.forEach((sz, k) => meshGrid(px(M.loads[k].x) - sz.B / 2, pz(M.loads[k].y) - sz.B / 2,
        sz.B, sz.B, iso.typical.spacing, iso.typical.bar_db, fb + .075,
        { title: 'تسليح الأساس F' + (k + 1), kind: 'rebar', rows: [['التفصيل', iso.typical.bars_label]] }));
    }
    CURG = 'piles';
    if (pil) {
      const rb = pil.rebar, cp = pil.cap;
      M.loads.forEach((l) => {
        const X = px(l.x), Z = pz(l.y);
        meshGrid(X - cp.B / 2, Z - cp.L / 2, cp.B, cp.L, pil.cap_rebar.s, pil.cap_rebar.db, fb + .075,
          { title: 'تسليح هامة الركائز', kind: 'rebar', rows: [['التفصيل', pil.cap_rebar.label]] });
        let n = 0;
        for (let rr = 0; rr < pil.rows; rr++) for (let cc = 0; cc < pil.cols; cc++) {
          if (n >= pil.n) break;
          const ax = X + (cc - (pil.cols - 1) / 2) * pil.spacing;
          const az = Z + (rr - (pil.rows - 1) / 2) * pil.spacing;
          const rad = pil.D / 2 - .075, pos = [];
          for (let b3 = 0; b3 < rb.n; b3++) {
            const a2 = b3 * 2 * Math.PI / rb.n;
            pos.push([ax + rad * Math.cos(a2), fb - pil.L / 2, az + rad * Math.sin(a2)]);
          }
          addRun(pil.L, rb.db, 'y', pos, { title: 'تسليح الركيزة الطولي', kind: 'rebar',
            rows: [['التفصيل', rb.label], ['ρ', (rb.rho * 100).toFixed(2) + '%']] });
          const sp = [], ns = Math.floor(pil.L / (rb.spiral_s / 1000));
          for (let i = 0; i < ns; i++) sp.push([ax, fb - .1 - i * rb.spiral_s / 1000, az]);
          addRings(rad * 2, rad * 2, rb.spiral_db, sp,
            { title: 'حلزون الركيزة', kind: 'rebar', rows: [['التفصيل', rb.spiral_label]] });
          n++;
        }
      });
    }
    // ---- الأعمدة (وصلات فوق كل سقف، متبادلة 50%) ----
    CURG = 'columns';
    const cr = md.col.rebar, nbf = cr.nb || 3, lapC = lapOf(cr.db);
    COLS.forEach((l, k) => {
      const X = px(l.x), Z = pz(l.y);
      for (let s = 0; s < nf; s++) {
        const z0 = s === 0 ? ft : s * hs, z1 = (s + 1) * hs;
        const ix = cb / 2 - cvr, iz = ch / 2 - cvr, pA = [], pB = [];
        let idx = 0;
        const push = (x, z) => { (idx++ % 2 ? pA : pB).push([x, 0, z]); };
        for (let a = 0; a < nbf; a++) {
          const t2 = nbf === 1 ? .5 : a / (nbf - 1);
          push(X - ix + 2 * ix * t2, Z - iz); push(X - ix + 2 * ix * t2, Z + iz);
        }
        for (let a = 1; a < nbf - 1; a++) {
          const t2 = a / (nbf - 1);
          push(X - ix, Z - iz + 2 * iz * t2); push(X + ix, Z - iz + 2 * iz * t2);
        }
        const inf = { title: 'أسياخ العمود C' + (k + 1) + ' — طابق ' + (s + 1), kind: 'rebar',
          floor: s + 1, rows: [['التسليح', cr.label], ['ρ', (cr.rho * 100).toFixed(2) + '%'],
            ['الوصلة', lapC.toFixed(2) + ' م فوق السقف — متبادلة 50%']] };
        // الوصلات فوق السقف مباشرة، متبادلة 50% (نصف بطول وصلة والنصف الآخر بضعفها)
        const top_ = (s === nf - 1);
        [[pA, top_ ? 0 : lapC], [pB, top_ ? 0 : 2 * lapC]].forEach(([pp, prot], qi) => {
          const len = (z1 - z0) + prot;
          const cy2 = z0 + len / 2;
          inst(barGeo(len, cr.db, 'y'), STEEL, pp.map(p => [p[0], cy2, p[2]]),
            qi === 0 ? inf : null, null,
            pp.length * len * Math.PI * Math.pow(cr.db / 2000, 2) * 7850,
            { grp: 'columns', floor: s + 1 });
        });
        const tp = [], sc2 = (cr.tie_s_conf || cr.tie_s) / 1000, sm = cr.tie_s / 1000,
          lo = (cr.conf_len || 450) / 1000;
        for (let y2 = z0 + .05; y2 < z0 + lo; y2 += sc2) tp.push([X, y2, Z]);
        for (let y2 = z0 + lo; y2 < z1 - lo; y2 += sm) tp.push([X, y2, Z]);
        for (let y2 = Math.max(z1 - lo, z0 + lo); y2 < z1 - .05; y2 += sc2) tp.push([X, y2, Z]);
        addRings(cb - 2 * cvr, ch - 2 * cvr, cr.tie_db, tp,
          { title: 'أتاري العمود — طابق ' + (s + 1), kind: 'rebar', floor: s + 1,
            rows: [['الوسط', cr.tie_label], ['التطويق', cr.conf_label || '—'], ['العدد', tp.length]] });
      }
    });
    // ---- الجسور ----
    CURG = 'beams';
    const drawBeam = (cX, cZ, len, bw, hB, z, reb, dir, floor, ttl) => {
      const bot = [], top = [], stp = [];
      const nb2 = reb.bottom.n, nt = reb.top.n, sdb = reb.stirrup;
      const yb = z - hB + cvr, yt = z - cvr - th;
      for (let i = 0; i < nb2; i++) {
        const o = nb2 === 1 ? 0 : (i / (nb2 - 1) - .5) * (bw - 2 * cvr);
        bot.push(dir === 'x' ? [cX, yb, cZ + o] : [cX + o, yb, cZ]);
      }
      for (let i = 0; i < nt; i++) {
        const o = nt === 1 ? 0 : (i / (nt - 1) - .5) * (bw - 2 * cvr);
        top.push(dir === 'x' ? [cX, yt, cZ + o] : [cX + o, yt, cZ]);
      }
      const ns = Math.max(2, Math.floor(len / (sdb.s / 1000)));
      for (let i = 0; i <= ns; i++) {
        const t2 = -len / 2 + i * len / ns;
        stp.push(dir === 'x' ? [cX + t2, z - hB / 2, cZ] : [cX, z - hB / 2, cZ + t2]);
      }
      const inf = t => ({ title: t + ' — ' + ttl, kind: 'rebar', floor: floor,
        rows: [['المقطع', Math.round(bw * 1000) + ' × ' + Math.round(hB * 1000) + ' مم'],
          ['سفلي', reb.bottom.label], ['علوي', reb.top.label], ['الأساور', sdb.label]] });
      addRun(len, reb.bottom.db, dir, bot, inf('تسليح سفلي'));
      addRun(len, reb.top.db, dir, top, inf('تسليح علوي'));
      addRings(dir === 'x' ? bw - 2 * cvr : hB - 2 * cvr, dir === 'x' ? hB - 2 * cvr : bw - 2 * cvr,
        sdb.db, stp, inf('أساور'), null, null, dir === 'x' ? 'x' : 'z');
    };
    if (ROOM) {
      (md.beams || []).forEach((b, i) => {
        const dx = b.x2 - b.x1, horiz = Math.abs(dx) > Math.abs(b.y2 - b.y1);
        drawBeam(px((b.x1 + b.x2) / 2), pz((b.y1 + b.y2) / 2), b.span - .3, b.b / 1000,
          b.h / 1000, hs, { bottom: b.bottom, top: b.top, stirrup: b.stirrup },
          horiz ? 'x' : 'z', 1, 'جسر ' + (i + 1));
      });
    } else {
      for (let s = 1; s <= nf; s++) {
        const z = s * hs;
        for (let j = 0; j <= g.ny; j++) for (let i = 0; i < g.nx; i++)
          drawBeam(px((xs[i] + xs[i + 1]) / 2), pz(ys[j]), g.sx - cb, md.beams.x.b / 1000,
            md.beams.x.h / 1000, z, md.beams.x.rebar, 'x', s, 'جسور X طابق ' + s);
        for (let i = 0; i <= g.nx; i++) for (let j = 0; j < g.ny; j++)
          drawBeam(px(xs[i]), pz((ys[j] + ys[j + 1]) / 2), g.sy - ch, md.beams.y.b / 1000,
            md.beams.y.h / 1000, z, md.beams.y.rebar, 'z', s, 'جسور Y طابق ' + s);
      }
    }
    // ---- السقوف ----
    CURG = 'slabs';
    const mb = md.slab.mesh.bottom, mt = md.slab.mesh.top;
    const floorsList = ROOM ? [1] : Array.from({ length: nf }, (_, i) => i + 1);
    floorsList.forEach(s => {
      const z = ROOM ? hs : s * hs;
      meshGrid(-L / 2, -B / 2, L, B, mb.s, mb.db, z - th + .025,
        { title: 'تسليح السقف السفلي — طابق ' + s, kind: 'rebar', floor: s,
          rows: [['التفصيل', mb.label], ['الاتجاه', 'بالاتجاهين']] });
      const sch = md.slab.chairs;
      if (sch) addChairs(-L / 2, -B / 2, L, B, sch.spacing, sch.height / 1000, sch.db, z - th + .03,
        { title: 'كراسي السقف — طابق ' + s, kind: 'rebar', grp: 'slabs', floor: s,
          rows: [['التفصيل', sch.label], ['العدد', sch.n], ['بسكويت الغطاء', sch.spacers]] });
      // التسليح العلوي: شرائط فوق المساند فقط
      CURG = 'slabs';
      if (ROOM) {
        meshGrid(-L / 2, -B / 2, L, B, mt.s, mt.db, z - .025,
          { title: 'تسليح السقف العلوي', kind: 'rebar', floor: s,
            rows: [['التفصيل', mt.label]] });
      } else {
        const wstrip = md.slab.top_strip || .5;
        for (let j = 0; j <= g.ny; j++) {
          const w2 = wstrip * g.sy;
          addRun(L - .1, mt.db, 'x',
            (() => { const p = []; const n2 = Math.max(2, Math.floor(w2 / (mt.s / 1000)) + 1);
              for (let i = 0; i < n2; i++) p.push([0, z - .025, pz(ys[j]) - w2 / 2 + i * w2 / (n2 - 1)]);
              return p; })(),
            { title: 'تسليح علوي فوق محور جسور X', kind: 'rebar', floor: s,
              rows: [['التفصيل', mt.label], ['عرض الشريط', w2.toFixed(2) + ' م'],
                ['المرجع', 'يمتد 0.25·Ln لكل جهة']] });
        }
        for (let i = 0; i <= g.nx; i++) {
          const w2 = wstrip * g.sx;
          addRun(B - .1, mt.db, 'z',
            (() => { const p = []; const n2 = Math.max(2, Math.floor(w2 / (mt.s / 1000)) + 1);
              for (let k2 = 0; k2 < n2; k2++) p.push([px(xs[i]) - w2 / 2 + k2 * w2 / (n2 - 1), z - .02, 0]);
              return p; })(),
            { title: 'تسليح علوي فوق محور جسور Y', kind: 'rebar', floor: s,
              rows: [['التفصيل', mt.label], ['عرض الشريط', w2.toFixed(2) + ' م']] });
        }
      }
      // ---- التسليح الإضافي (أركان + تماسك) ----
      CURG = 'extra';
      const ex = md.slab.extra;
      if (ex) {
        const sz = (ex.corner.size || .2) * Math.max(L, B);
        [[-L / 2, -B / 2], [L / 2 - sz, -B / 2], [-L / 2, B / 2 - sz], [L / 2 - sz, B / 2 - sz]]
          .forEach(c => {
            meshGrid(c[0], c[1], sz, sz, ex.corner.s, ex.corner.db, z - .03,
              { title: 'تسليح أركان البلاطة (علوي)', kind: 'extra', floor: s,
                rows: [['المرجع', 'ACI 8.7.3.1'], ['التفصيل', 'شبكة ' + sz.toFixed(2) + ' م بالركن'],
                  ['السبب', 'مقاومة عزوم اللي عند الأركان']] }, EXTRA, G.extra);
          });
        COLS.forEach(l => {
          const p1 = [], p2 = [];
          for (let i = 0; i < ex.integrity.n; i++) {
            const o = (i - (ex.integrity.n - 1) / 2) * .08;
            p1.push([px(l.x) + o, z - th + .03, pz(l.y)]);
            p2.push([px(l.x), z - th + .05, pz(l.y) + o]);
          }
          addRun(Math.min(g.sx, L) * .9, ex.integrity.db, 'x', p1,
            { title: 'تسليح التماسك خلال العمود', kind: 'extra', floor: s,
              rows: [['المرجع', 'ACI 8.7.4.2'], ['التفصيل', ex.integrity.n + 'Ø' + ex.integrity.db + ' مستمر'],
                ['السبب', 'يمنع الانهيار التدريجي عند فشل قص الثقب']] }, EXTRA, G.extra);
          addRun(Math.min(g.sy, B) * .9, ex.integrity.db, 'z', p2, null, EXTRA, G.extra);
        });
      }
      CURG = 'slabs';
    });
    G.rebar.traverse(o => { if (o.isInstancedMesh) o.frustumCulled = false; });
  }

  /* ========================= العزوم وقص الثقب والهطول ========================= */
  let mBuilt = false, pBuilt = false, dBuilt = false;
  function ribbon(pts, y0, dir, cX, cZ, col, info, scale) {
    const g2 = new T.BufferGeometry(), v = [], idx = [];
    pts.forEach((p, i) => {
      const off = p[1] * scale;
      if (dir === 'x') { v.push(cX + p[0], y0, cZ, cX + p[0], y0 + off, cZ); }
      else { v.push(cX, y0, cZ + p[0], cX, y0 + off, cZ + p[0]); }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    g2.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g2.setIndex(idx); g2.computeVertexNormals();
    const m = new T.Mesh(g2, new T.MeshBasicMaterial({ color: col, transparent: true,
      opacity: .55, side: T.DoubleSide, depthWrite: false }));
    m.userData = info || {}; if (info) picks.push(m);
    return m;
  }
  function buildMoments() {
    if (mBuilt || ROOM) return; mBuilt = true;
    const scale = Math.max(g.sx, g.sy) / 700.0;
    [['x', md.beams.x], ['y', md.beams.y]].forEach(([dir, bm]) => {
      if (!bm.env) return;
      const lines = dir === 'x' ? ys : xs, spanA = dir === 'x' ? xs : ys;
      for (let s = 1; s <= nf; s++) {
        const z = s * hs;
        for (let a = 0; a < lines.length; a++) for (let b2 = 0; b2 < spanA.length - 1; b2++) {
          const env = bm.env[Math.min(b2, bm.env.length - 1)];
          const cX = dir === 'x' ? px(spanA[b2]) : px(lines[a]);
          const cZ = dir === 'x' ? pz(lines[a]) : pz(spanA[b2]);
          const info = { title: 'مغلّف العزوم — جسر ' + dir.toUpperCase() + ' طابق ' + s,
            kind: 'moment', grp: 'moments', floor: s,
            rows: [['أقصى موجب', Math.max(...env.map(p => p[1])).toFixed(1) + ' kN·m'],
              ['أقصى سالب', Math.min(...env.map(p => p[2])).toFixed(1) + ' kN·m'],
              ['المقياس', 'الأزرق موجب لأسفل · الأحمر سالب لأعلى']] };
          G.moments.add(ribbon(env.map(p => [p[0], -p[1]]), z + .05, dir, cX, cZ, 0x38bdf8, info, scale));
          G.moments.add(ribbon(env.map(p => [p[0], -p[2]]), z + .05, dir, cX, cZ, 0xf87171, null, scale));
        }
      }
    });
  }
  function buildPunch() {
    if (pBuilt) return; pBuilt = true;
    const list = md.punch || [];
    list.forEach((q, k) => {
      const col = q.ratio <= .7 ? 0x34d399 : q.ratio <= 1 ? 0xfbbf24 : 0xf87171;
      const d = q.d / 1000, w = cb + d, dp = ch + d;
      const y = fb + ((rf ? rf.h : (iso ? iso.typical.h : 500)) / 1000) + .02;
      const geo = new T.BoxGeometry(w, .06, dp);
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, transparent: true,
        opacity: .45, depthWrite: false }));
      m.position.set(px(q.x), y, pz(q.y));
      m.userData = { title: 'قص الثقب — ' + q.where + ' (عمود ' + (k + 1) + ')', kind: 'punch',
        grp: 'punch', rows: [['الموقع', q.kind], ['المحيط الحرج b0', q.b0.toFixed(0) + ' مم'],
          ['العمق الفعّال d', q.d.toFixed(0) + ' مم'], ['Vu', q.Vu.toFixed(0) + ' kN'],
          ['φVc', q.phiVc.toFixed(0) + ' kN'], ['النسبة', q.ratio.toFixed(2)],
          ['التوصية', q.rec], ['عند السقف (للاستئناس)', q.slab_ratio.toFixed(2)]] };
      picks.push(m); G.punch.add(m);
      const e = new T.LineSegments(new T.EdgesGeometry(geo),
        new T.LineBasicMaterial({ color: col }));
      e.position.copy(m.position); G.punch.add(e);
    });
  }
  function buildDefl() {
    if (dBuilt || ROOM) return; dBuilt = true;
    const EX = 60;
    [['x', md.beams.x], ['y', md.beams.y]].forEach(([dir, bm]) => {
      if (!bm.env) return;
      const lines = dir === 'x' ? ys : xs, spanA = dir === 'x' ? xs : ys;
      for (let s = 1; s <= nf; s++) {
        const z = s * hs;
        for (let a = 0; a < lines.length; a++) for (let b2 = 0; b2 < spanA.length - 1; b2++) {
          const env = bm.env[Math.min(b2, bm.env.length - 1)];
          const cX = dir === 'x' ? px(spanA[b2]) : px(lines[a]);
          const cZ = dir === 'x' ? pz(lines[a]) : pz(spanA[b2]);
          const v = env.map(p => dir === 'x'
            ? new T.Vector3(cX + p[0], z - bm.h / 2000 + p[3] / 1000 * EX, cZ)
            : new T.Vector3(cX, z - bm.h / 2000 + p[3] / 1000 * EX, cZ + p[0]));
          const ln = new T.Line(new T.BufferGeometry().setFromPoints(v),
            new T.LineBasicMaterial({ color: 0x34d399 }));
          ln.userData = { title: 'شكل الهطول — جسر ' + dir.toUpperCase() + ' طابق ' + s,
            kind: 'defl', grp: 'defl', floor: s,
            rows: [['الهطول بعيد المدى', Math.abs(bm.d_long).toFixed(1) + ' مم'],
              ['الحد المسموح L/240', bm.d_limit.toFixed(1) + ' مم'],
              ['الحالة', Math.abs(bm.d_long) <= bm.d_limit ? 'مقبول ✓' : 'غير مقبول ✗'],
              ['التكبير بالرسم', '×' + EX]] };
          picks.push(ln); G.defl.add(ln);
        }
      }
    });
  }

  /* ============================== التفاعل ============================== */
  const ray = new T.Raycaster(), mouse = new T.Vector2();
  let floorSel = 'all', anim = null;
  function applyVis() {
    [G.columns, G.beams, G.slabs, G.walls, G.rebar, G.extra, G.chairs, G.moments, G.defl]
      .forEach(grp => grp.children.forEach(o => {
        const u = o.userData || {};
        const okG = u.grp ? on[u.grp] !== 0 : true;
        o.visible = okG && (floorSel === 'all' || !u.floor || u.floor === floorSel);
      }));
  }
  function pickAt(ev) {
    const r = rn.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, cam);
    return ray.intersectObjects(picks.filter(o => o.visible && o.parent && o.parent.visible), false)[0];
  }
  let last = null;
  rn.domElement.addEventListener('pointerdown', ev => {
    const hit = pickAt(ev);
    if (hit) { last = hit.object; if (onPick) onPick(hit.object.userData); }
  });
  rn.domElement.addEventListener('dblclick', ev => {
    const hit = pickAt(ev); if (hit) zoomTo(hit.object);
  });
  function zoomTo(obj) {
    if (!obj) return;
    const b = new T.Box3().setFromObject(obj);
    const c = b.getCenter(new T.Vector3()), sz = Math.max(1.2, b.getSize(new T.Vector3()).length());
    const dir = cam.position.clone().sub(ctl.target).normalize();
    anim = { t: 0, p0: cam.position.clone(), t0: ctl.target.clone(),
      p1: c.clone().add(dir.multiplyScalar(sz * 1.9)), t1: c.clone() };
  }
  let alive = true;
  (function loop() {
    if (!alive || !document.body.contains(rn.domElement)) { alive = false; return; }
    if (anim) {
      anim.t = Math.min(1, anim.t + .06);
      const e = anim.t * anim.t * (3 - 2 * anim.t);
      cam.position.lerpVectors(anim.p0, anim.p1, e);
      ctl.target.lerpVectors(anim.t0, anim.t1, e);
      if (anim.t >= 1) anim = null;
    }
    ctl.update(); rn.render(sc, cam); requestAnimationFrame(loop);
  })();

  function visStats() {
    let bars = 0, weight = 0;
    Object.entries(S.byGrp).forEach(([k, v]) => { if (on[k] !== 0) { bars += v.bars; weight += v.weight; } });
    return { bars: bars, weight: weight, meshes: S.meshes, byGrp: S.byGrp };
  }
  let xrayOn = false;
  return {
    R: R, room: ROOM,
    group: (n, v) => { on[n] = v ? 1 : 0; if (G[n]) G[n].visible = !!v; applyVis(); return visStats(); },
    rebar: v => { if (v) buildRebar(); G.rebar.visible = v; G.extra.visible = v && on.extra !== 0;
      G.chairs.visible = v && on.chairs !== 0; applyVis(); return visStats(); },
    moments: v => { if (v) buildMoments(); G.moments.visible = v; applyVis(); },
    punch: v => { if (v) buildPunch(); G.punch.visible = v; },
    defl: v => { if (v) buildDefl(); G.defl.visible = v; applyVis(); },
    xray: v => {
      xrayOn = v;
      [G.layers, G.slabs, G.beams, G.columns, G.raft, G.isolated, G.piles, G.walls].forEach(grp =>
        grp.children.forEach(o => {
          if (o.isLineSegments) { o.material.opacity = v ? .25 : .45; return; }
          if (!o.material) return;
          if (o.userData._op === undefined) o.userData._op = o.material.opacity;
          o.material.transparent = true;
          o.material.opacity = v ? Math.min(o.userData._op, .12) : o.userData._op;
          o.material.depthWrite = !v;
        }));
    },
    floor: v => { floorSel = v; applyVis(); },
    clip: v => { clip.constant = v; },
    zoomSel: () => zoomTo(last),
    reset: () => { anim = { t: 0, p0: cam.position.clone(), t0: ctl.target.clone(),
      p1: home.clone(), t1: mid.clone() }; },
    top: () => { anim = { t: 0, p0: cam.position.clone(), t0: ctl.target.clone(),
      p1: new T.Vector3(.01, R * 2.4, .01), t1: new T.Vector3(0, 0, 0) }; },
    debug: () => ({ picks: picks.length, vis: picks.filter(o => o.visible && o.parent && o.parent.visible).length,
      groups: Object.fromEntries(Object.entries(G).map(([k, v2]) => [k, v2.children.length + '/' + v2.visible])) }),
    hit: (nx, ny) => { mouse.set(nx, ny); ray.setFromCamera(mouse, cam);
      const h = ray.intersectObjects(picks.filter(o => o.visible && o.parent && o.parent.visible), false)[0];
      return h ? h.object.userData.title : null; },
    cam: () => [+cam.position.x.toFixed(3), +cam.position.y.toFixed(3), +cam.position.z.toFixed(3)],
    stats: () => visStats()
  };
}
