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
  // preserveDrawingBuffer يسمح بطباعة المجسم وأخذ لقطة له
  const rn = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  rn.setSize(W, H); rn.setPixelRatio(Math.min(2, devicePixelRatio));
  rn.localClippingEnabled = true;
  rn.shadowMap.enabled = true; rn.shadowMap.type = T.PCFSoftShadowMap;
  el.innerHTML = ''; el.appendChild(rn.domElement);
  const ctl = new T.OrbitControls(cam, rn.domElement);
  const mid = new T.Vector3(0, (nf * hs + fb) / 2, 0);
  ctl.target.copy(mid); ctl.enableDamping = true; ctl.dampingFactor = .08;
  const hemi1 = new T.HemisphereLight(0xd7e8ff, 0x33291c, 1.0); sc.add(hemi1);
  const dl = new T.DirectionalLight(0xffffff, .7); dl.position.set(R, R * 1.6, R * .8); sc.add(dl);
  const dl2 = new T.DirectionalLight(0xffffff, .25); dl2.position.set(-R, R * .6, -R); sc.add(dl2);
  const gh = new T.GridHelper(R * 2.4, 24, 0x2b3d5c, 0x18243a);
  gh.position.y = ROOM ? fb - 0.2 : lv.existing - 0.02; sc.add(gh);

  const clip = new T.Plane(new T.Vector3(-1, 0, 0), R * 1.5);
  const GN = ['ghost', 'soil', 'stress', 'layers', 'walls', 'raft', 'isolated', 'piles', 'columns', 'beams', 'slabs',
              'canti', 'stairs', 'rebar', 'extra', 'chairs', 'moments', 'field', 'punch', 'defl',
              'human', 'plan', 'site'];
  const G = {}; GN.forEach(k => { G[k] = new T.Group(); G[k].name = k; sc.add(G[k]); });
  G.field.visible =
  G.moments.visible = G.punch.visible = G.defl.visible = G.rebar.visible = G.extra.visible =
    G.chairs.visible = G.human.visible = G.plan.visible = G.ghost.visible =
    G.soil.visible = G.stress.visible = false;
  const on = {}; GN.forEach(k => on[k] = 1);
  /* ---- حالة التسليح وألوانه: تُعرَّف مبكراً لأن بناء الكانتيليفر
     يستدعي inst و addRings قبل الوصول لقسم التسليح ---- */
  const STEEL = 0xe8443a, TIE = 0xff9f1c, EXTRA = 0x22d3ee, CHAIR = 0x86efac,
    DOWEL = 0xc084fc, CTOP = 0xfacc15, CBOT = 0x60a5fa;
  let built = false, S = { bars: 0, meshes: 0, weight: 0, byGrp: {} }, CURG = 'rebar';
  const stock = md.stock || 12.0, LAPS = md.laps || {};
  const lapOf = db => { const l = LAPS[db] || LAPS[String(db)];
    return l ? (typeof l === 'object' ? l.bottom : l) : 0.6; };
  function tally(grp, n, w) {
    const b = S.byGrp[grp] || (S.byGrp[grp] = { bars: 0, weight: 0 });
    b.bars += n; b.weight += w; S.bars += n; S.weight += w; S.meshes++;
  }

  const picks = [];
  const px = v => v - L / 2, pz = v => -(v - B / 2);
  const SHAPE_AR = { rect: 'مستطيل', circ: 'دائري (O)', L: 'زاوية (L)', T: 'تي (T)' };
  /* تحويل إحداثيات المشروع إلى المشهد: بالشبكة التلقائية px/pz، وبهيكل المخطط
     يُصفَّر على مركز الأعمدة — وشبح العمود المضاف يستعمل التحويل الجاري نفسه. */
  let MAPX = px, MAPZ = pz;
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
  /* عمود دائري (O): أسطوانة بقطره الحقيقي — لا صندوق */
  function cyl(grp, D, h, x, y, z, col, op, info) {
    const m = new T.Mesh(new T.CylinderGeometry(D / 2, D / 2, h, 20), mat(col, op));
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
    if (pil && pil.mode !== 'raft') {
      const cp = pil.cap;
      const nHere = (pil.per_col && pil.per_col[k] != null) ? pil.per_col[k] : pil.n;
      box(G.piles, cp.B, cp.h, cp.L, X, fb + cp.h / 2, Z, 0x4a7fb5, recIs('piles') ? 1 : .3,
        { title: 'هامة ركائز PC' + (k + 1), kind: 'cap', grp: 'piles',
          rows: [['الأبعاد', cp.B.toFixed(2) + ' × ' + cp.L.toFixed(2) + ' م'],
            ['عدد الركائز', nHere], ['التسليح', pil.cap_rebar.label]] });
      /* مواقع الركائز تحت العمود — **مثلث** عند الثلاث لا صفّاً. */
      const pos = [];
      if (nHere === 3) {
        const R2 = pil.spacing / Math.sqrt(3);
        for (let i = 0; i < 3; i++) {
          const th = -Math.PI / 2 + i * 2 * Math.PI / 3;
          pos.push([X + R2 * Math.cos(th), Z + R2 * Math.sin(th)]);
        }
      } else {
        const m2 = nHere <= 1 ? 1 : (nHere <= 4 ? 2 : 3);
        const rw = Math.max(1, Math.ceil(nHere / m2));
        for (let rr = 0; rr < rw; rr++) for (let cc = 0; cc < m2; cc++) {
          if (pos.length >= nHere) break;
          pos.push([X + (cc - (m2 - 1) / 2) * pil.spacing,
                    Z + (rr - (rw - 1) / 2) * pil.spacing]);
        }
      }
      for (const [ax, az] of pos) {
        const o = new T.Mesh(new T.CylinderGeometry(pil.D / 2, pil.D / 2, pil.L, 16),
          mat(0x7c6ad8, recIs('piles') ? 1 : .3));
        o.position.set(ax, fb - pil.L / 2, az);
        o.userData = { title: 'ركيزة Ø' + (pil.D * 1000).toFixed(0), kind: 'pile', grp: 'piles',
          rows: [['الطول', pil.L + ' م'], ['القدرة', pil.Qall.toFixed(0) + ' kN'],
            ['التسليح', pil.rebar.label], ['الحلزون', pil.rebar.spiral_label]] };
        G.piles.add(o); picks.push(o);
      }
    }
    for (let s = 0; s < nf; s++) {
      const z0 = s === 0 ? ft : s * hs, z1 = (s + 1) * hs;
      const cShape = l.shape || md.col.shape || 'rect';
      const cD = (l.D || md.col.D || md.col.b) / 1000;
      const drawCol = cShape === 'circ' ? cyl : box;
      const cargs = cShape === 'circ' ? [cD, z1 - z0] : [cb, z1 - z0, ch];
      drawCol(G.columns, ...cargs, X, (z0 + z1) / 2, Z, 0x8ea6c4, 1,
        { title: 'عمود C' + (k + 1) + (ROOM ? '' : ' — طابق ' + (s + 1)), kind: 'column',
          grp: 'columns', floor: s + 1,
          gk: ROOM ? null : 'col|' + l.i + '|' + l.j + '|' + (s + 1),
          rows: [['الشكل', SHAPE_AR[cShape] || 'مستطيل'],
            ['المقطع', cShape === 'circ' ? ('Ø' + Math.round(cD * 1000) + ' مم')
              : (Math.round(cb * 1000) + ' × ' + Math.round(ch * 1000) + ' مم')],
            ['الموقع', l.kind || '—'],
            ['استمرارية الجسور', l.cont_x === undefined ? '—' :
              ('X ' + (l.cont_x ? 'مستمر' : 'طرفي') + ' · Y ' + (l.cont_y ? 'مستمر' : 'طرفي'))],
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
    /* ------- ملحقات نوع السقف: أعصاب وبلوك · رؤوس أعمدة · كرات ------- */
    function slabGeom(z, s) {
      const gm = md.slab.geom;
      if (!gm) return;
      const yb = z - th, name = md.slab.name;
      const inf = (t, rows) => ({ title: t + ' — طابق ' + s, kind: 'slab', grp: 'slabs',
        floor: s, rows: rows });
      if (gm.kind === 'hordi') {
        // أعصاب باتجاه واحد + بلوك بينها + مناطق مصمتة عند المساند
        const sp = gm.spacing / 1000, rw = gm.rib_w / 1000, rh = gm.rib_h / 1000;
        const bw2 = sp - rw, bl = gm.block ? gm.block.L / 1000 : .2;
        const solid = gm.solid_head || 0, pos = [];
        const ribInfo = inf('أعصاب ' + name,
          [['عرض العصب', Math.round(gm.rib_w) + ' مم'], ['ارتفاع العصب', Math.round(gm.rib_h) + ' مم'],
           ['التباعد', Math.round(gm.spacing) + ' مم (بلوك ' + Math.round(bw2 * 1000) + ' + عصب ' + Math.round(rw * 1000) + ')'],
           ['عدد الأعصاب/م', (gm.ribs_per_m || 0).toFixed(2)],
           ['التسليح السفلي', (gm.rib_rebar || {}).label || '—'],
           ['طبقة التغطية', Math.round(gm.topping) + ' مم'],
           ['المنطقة المصمتة', solid ? solid.toFixed(2) + ' م عند كل مسند' : 'غير مطلوبة']]);
        let first = true;
        for (let z0 = -B / 2; z0 + sp <= B / 2 + 1e-6; z0 += sp) {
          box(G.slabs, L, rh, rw, 0, yb + rh / 2, z0 + rw / 2, 0x9fb4cc, 1,
            first ? ribInfo : null);
          for (let xx = -L / 2 + solid; xx + bl <= L / 2 - solid + 1e-6; xx += bl)
            pos.push([xx + bl / 2, yb + rh / 2, z0 + rw + bw2 / 2]);
          first = false;
        }
        if (pos.length && pos.length < 20000) {
          const im = new T.InstancedMesh(new T.BoxGeometry(bl * .98, rh * .98, bw2 * .98),
            mat(0xd9c08a, 1), pos.length);
          const mx2 = new T.Matrix4();
          pos.forEach((p, i) => { mx2.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, mx2); });
          im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
          im.userData = inf('بلوك الهوردي', [
            ['المقاس', Math.round(gm.block.W) + '×' + Math.round(gm.block.L) + '×' + Math.round(gm.block.H) + ' مم'],
            ['العدد بالمتر المربع', (gm.blocks_per_m2 || 0).toFixed(1) + ' قطعة'],
            ['العدد بالسقف الواحد', pos.length + ' قطعة'], ['وزن القطعة', (gm.block.kg || 12) + ' كغم'],
            ['المنطقة المصمتة', solid ? solid.toFixed(2) + ' م عند المساند (بلا بلوك)' : 'لا يوجد']]);
          picks.push(im); G.slabs.add(im);
        }
        // المناطق المصمتة عند المساند (بلا بلوك)
        if (solid > 0) for (const xx of [-L / 2, L / 2 - solid])
          box(G.slabs, solid, rh, B, xx + solid / 2, yb + rh / 2, 0, 0x9fb4cc, .85, null);
      } else if (gm.kind === 'waffle') {
        // شبكة أعصاب متعامدة — تُرسم الفراغات (الكوفرات) بدل الكتلة
        const sp = gm.spacing / 1000, rw = gm.rib_w / 1000, rh = gm.rib_h / 1000;
        const cf = sp - rw, solid = gm.solid_head || 0, pos = [];
        const info2 = inf('أعصاب الوافل', [
          ['الشبكة', 'أعصاب ' + Math.round(gm.rib_w) + ' مم @ ' + Math.round(gm.spacing) + ' مم بالاتجاهين'],
          ['ارتفاع العصب', Math.round(gm.rib_h) + ' مم'], ['طبقة التغطية', Math.round(gm.topping) + ' مم'],
          ['التسليح', (gm.rib_rebar || {}).label || '—'],
          ['المصمت حول الأعمدة', solid.toFixed(2) + ' م لكل جهة']]);
        let first = true;
        for (let z0 = -B / 2; z0 + sp <= B / 2 + 1e-6; z0 += sp) {
          box(G.slabs, L, rh, rw, 0, yb + rh / 2, z0 + rw / 2, 0x9fb4cc, 1, first ? info2 : null);
          first = false;
        }
        for (let x0 = -L / 2; x0 + sp <= L / 2 + 1e-6; x0 += sp)
          box(G.slabs, rw, rh, B, x0 + rw / 2, yb + rh / 2, 0, 0x9fb4cc, 1, null);
        // المصمت حول الأعمدة
        COLS.forEach(l => box(G.slabs, 2 * solid, rh, 2 * solid, px(l.x), yb + rh / 2, pz(l.y),
          0x8fa8c6, .9, null));
      } else if (gm.kind === 'flat') {
        // رأس عمود (Drop Panel) إن لزم قص الثقب، وإلا تاج عمود يوضّح انتقال الحمل مباشرةً
        const need = !!gm.drop;
        const dh = need ? (gm.drop.h - md.slab.h) / 1000 : Math.max(.08, th * .45);
        const sz = need ? gm.drop.size : (gm.capital || 1.2);
        COLS.forEach((l, k2) => box(G.slabs, sz, dh, sz, px(l.x), yb - dh / 2, pz(l.y),
          need ? 0x8fa8c6 : 0x7f97b8, 1, k2 ? null :
          inf(need ? 'رأس عمود (Drop Panel)' : 'تاج عمود (Column Capital)',
            [['السماكة المضافة', Math.round(dh * 1000) + ' مم'],
             ['المقاس', sz.toFixed(2) + ' × ' + sz.toFixed(2) + ' م'],
             ['السبب', need ? 'قص الثقب تجاوز المقاومة — رأس عمود مطلوب (ACI 8.2.4)'
               : 'قص الثقب مقبول بلا رأس عمود — التاج لتوضيح انتقال الحمل'],
             ['النظام', 'فلات سلاب: لا جسور داخلية — الحمل ينتقل من البلاطة للعمود مباشرة'],
             ['شريحة الأعمدة', 'تعمل كجسر مخفي داخل سماكة البلاطة']])));
      } else if (gm.kind === 'bubble') {
        const dia = gm.ball / 1000, sp = gm.spacing / 1000, pos = [], sd = gm.solid_head || 0;
        for (let xx = -L / 2 + sp; xx < L / 2 - sp; xx += sp)
          for (let zz = -B / 2 + sp; zz < B / 2 - sp; zz += sp) {
            if (COLS.some(l => Math.abs(px(l.x) - xx) < sd && Math.abs(pz(l.y) - zz) < sd)) continue;
            pos.push([xx, z - th / 2, zz]);
          }
        if (pos.length && pos.length < 12000) {
          const im = new T.InstancedMesh(new T.SphereGeometry(dia / 2, 10, 8),
            mat(0x30455f, .9), pos.length);
          const mx2 = new T.Matrix4();
          pos.forEach((p, i) => { mx2.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, mx2); });
          im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
          im.userData = inf('كرات الببل ديك', [['القطر', Math.round(gm.ball) + ' مم'],
            ['التباعد', Math.round(gm.spacing) + ' مم'],
            ['نسبة الفراغ', ((gm.void_ratio || 0) * 100).toFixed(0) + '%'],
            ['العدد بالسقف', pos.length],
            ['المصمت حول الأعمدة', sd.toFixed(2) + ' م — تُزال الكرات']]);
          picks.push(im); G.slabs.add(im);
        }
      }
    }
    /* ---- هيكل مأخوذ من مخطط DWG: أعمدة وجسور بمواقعها الحقيقية ---- */
    const FR = md.frame;
    function buildFrameReal() {
      const cb2 = md.col.b / 1000, ch2 = md.col.h / 1000;
      const bw = md.beams.x.b / 1000, bh = md.beams.x.h / 1000;
      const ox = (Math.min(...FR.nodes.map(n => n.x)) + Math.max(...FR.nodes.map(n => n.x))) / 2;
      const oy = (Math.min(...FR.nodes.map(n => n.y)) + Math.max(...FR.nodes.map(n => n.y))) / 2;
      const PX = v => v - ox, PZ = v => -(v - oy);
      MAPX = PX; MAPZ = PZ;                  // نفس التحويل يستعمله شبح العمود المضاف
      for (let s = 1; s <= nf; s++) {
        const z = s * hs;
        FR.nodes.forEach((n, k) => {
          const z0 = s === 1 ? ft : (s - 1) * hs;
          const rnd = n.shape === 'circ';
          const info = { title: 'عمود C' + (k + 1) + ' — طابق ' + s, kind: 'column', grp: 'columns',
              floor: s, gk: 'col|' + (n.i || 0) + '|' + (n.j || 0) + '|' + s,
              rows: [['المصدر', 'موقعه وشكله الحقيقيان من المخطط'],
                ['الشكل', SHAPE_AR[n.shape] || 'مستطيل'],
                ['الإحداثي', n.x.toFixed(2) + ' , ' + n.y.toFixed(2) + ' م'],
                ['المقطع', rnd ? ('Ø' + Math.round(n.D || n.b) + ' مم')
                  : (Math.round(n.b || md.col.b) + ' × ' + Math.round(n.h || md.col.h) + ' مم')],
                ['التسليح', md.col.rebar.label], ['الأتاري', md.col.rebar.tie_label]] };
          if (rnd)
            cyl(G.columns, (n.D || n.b) / 1000, z - z0,
              PX(n.x), (z0 + z) / 2, PZ(n.y), 0x8ea6c4, 1, info);
          else
            box(G.columns, n.b / 1000 || cb2, z - z0, n.h / 1000 || ch2,
              PX(n.x), (z0 + z) / 2, PZ(n.y), 0x8ea6c4, 1, info);
        });
        (FR.beams || []).forEach((b2, k) => {
          const dx = b2.x2 - b2.x1, dy = b2.y2 - b2.y1;
          const len = Math.hypot(dx, dy), horiz = Math.abs(dx) >= Math.abs(dy);
          const bm2 = horiz ? md.beams.x : md.beams.y;
          const hB = bm2.h / 1000, wB = bm2.b / 1000;
          box(G.beams, horiz ? len - cb2 : wB, hB, horiz ? wB : len - ch2,
            PX((b2.x1 + b2.x2) / 2), z - hB / 2, PZ((b2.y1 + b2.y2) / 2), 0x7f97b8, 1,
            { title: 'جسر ' + (horiz ? 'X' : 'Y') + ' — طابق ' + s, kind: 'beam',
              grp: 'beams', floor: s, gk: (horiz ? 'bx|' : 'by|') + k + '|0|' + s,
              rows: [['المصدر', 'محور حقيقي من المخطط'],
                ['البحر', len.toFixed(2) + ' م'],
                ['المقطع', bm2.b + ' × ' + bm2.h + ' مم'],
                ['سفلي', bm2.rebar.bottom.label], ['علوي', bm2.rebar.top.label],
                ['الأساور', bm2.rebar.stirrup.label]] });
        });
        slabGeom(z, s);
        box(G.slabs, L, th, B, 0, z - th / 2, 0, 0xa8bcd4, 1,
          { title: md.slab.name + ' — سقف طابق ' + s, kind: 'slab', grp: 'slabs', floor: s,
            rows: [['السماكة', md.slab.h + ' مم'], ['النوع', md.slab.name],
              ['المصدر', 'حدّ البناء من المخطط'],
              ['فرش', (md.slab.mesh.short || md.slab.mesh.bottom).label],
              ['غطاء', (md.slab.mesh.long || md.slab.mesh.bottom).label]] });
        buildStairs(z, s, PX, PZ);
        buildCanti(z, s);
      }
    }
    /* ============ الكانتيليفر (الشناشيل والبلكونات) ============
       العنصر الوحيد الذي **كل** حديده الرئيسي بالوجه العلوي، ولذلك يُرسم هنا
       بلونين مختلفين صراحةً: العلوي أصفر ناصع فوق منتصف السماكة (حديد الشدّ)،
       والسفلي أزرق باهت تحته (انكماش وتماسك فقط). المشهد نفسه يقول القاعدة. */
    function buildCanti(z, s) {
      const C = md.canti;
      if (!C || !C.on || !C.items || !C.items.length) return;
      C.items.forEach((it, k) => {
        const Lc = it.L, th2 = it.h / 1000, y = z - th2 / 2;
        const along = it.along_x;                       // البروز على حافة شمالية/جنوبية
        const sgn = it.side.indexOf('-') > 0 ? -1 : 1;
        const wide = along ? L : B;                     // طول الحافة
        const cx = along ? 0 : sgn * (L / 2 + Lc / 2);
        const cz = along ? -sgn * (B / 2 + Lc / 2) : 0;
        const info = k2 => ({ title: k2 + ' — ' + it.side_name + ' · طابق ' + s,
          kind: 'canti', grp: 'canti', floor: s,
          rows: [['البروز', Lc.toFixed(2) + ' م'],
            ['السماكة', Math.round(it.h) + ' مم (الأدنى ' + Math.round(it.hmin) +
              ' مم = ℓ/8 — جدول ACI 9.3.1.1)'],
            ['عزم وجه المسند', it.Mu.toFixed(1) + ' kN·م لكل متر'],
            ['القص عند المسند', it.Vu.toFixed(1) + ' kN لكل متر'],
            ['الحديد **العلوي**', it.top.label + ' — وجه الشدّ'],
            ['الحديد السفلي', it.bottom.label + ' — انكماش وتماسك فقط'],
            ['نشر العلوي', it.anchor.rule],
            ['الترخيم', it.d_imm.toFixed(2) + ' مم فوري · ' +
              (it.defl.ok ? 'ضمن الحدّ' : 'يتجاوز الحدّ')]] });
        // البلاطة
        box(G.canti, along ? wide : Lc, th2, along ? Lc : wide, cx, y, cz,
          0xb9c9dd, 1, info('بلاطة كانتيليفر'));
        // درابزين على الطرف الحرّ إن وُجد حمل
        if (C.parapet > 0) {
          const ph = 0.9, pt = 0.15;
          box(G.canti, along ? wide : pt, ph, along ? pt : wide,
            along ? 0 : sgn * (L / 2 + Lc - pt / 2), z + ph / 2 - th2,
            along ? -sgn * (B / 2 + Lc - pt / 2) : 0, 0xa3b4c9, 1,
            Object.assign(info('درابزين الطرف الحرّ'), { rows: [
              ['الحمل', C.parapet.toFixed(1) + ' kN/م على الطرف الحرّ'],
              ['الأثر', 'يزيد عزم وجه المسند بمقدار P·ℓ = ' +
                (C.parapet * Lc).toFixed(1) + ' kN·م/م — وهو أشدّ موقع ممكن للحمل']] }));
        }
        // ---- الحديد: علوي (شدّ) ثم سفلي (انكماش) ----
        const cvT = 0.025, dbT = it.top.db / 1000, dbB = it.bottom.db / 1000;
        const sT = (it.top.s || 200) / 1000, sB = (it.bottom.s || 200) / 1000;
        const yT = z - cvT - dbT / 2, yB = z - th2 + cvT + dbB / 2;
        const back = Math.min(it.anchor.ld, it.back_span * 0.9);   // النشر داخل البحر الخلفي
        const runT = Lc + back;                        // من داخل البحر إلى الطرف الحرّ
        const nT = Math.max(2, Math.floor(wide / sT) + 1);
        const posT = [], posB = [];
        for (let i = 0; i < nT; i++) {
          const t = -wide / 2 + i * (wide / Math.max(1, nT - 1));
          const c0 = along ? -sgn * (B / 2 + Lc / 2 - back / 2) : sgn * (L / 2 + Lc / 2 - back / 2);
          posT.push(along ? [t, yT, c0] : [c0, yT, t]);
        }
        const nB = Math.max(2, Math.floor(wide / sB) + 1);
        for (let i = 0; i < nB; i++) {
          const t = -wide / 2 + i * (wide / Math.max(1, nB - 1));
          const c0 = along ? -sgn * (B / 2 + Lc / 2) : sgn * (L / 2 + Lc / 2);
          posB.push(along ? [t, yB, c0] : [c0, yB, t]);
        }
        // العلوي: عكفة 90° هابطة عند الطرف الحرّ، ومستقيم داخل البحر الخلفي
        const dirC = along ? 'z' : 'x';
        inst(barGeo(runT, it.top.db, dirC, { a: 0, b: 90, up: -1 }), CTOP, posT,
          Object.assign(info('حديد الكانتيليفر **العلوي** — وجه الشدّ'), { rows: [
            ['الموضع', '**الوجه العلوي** — عزم البروز سالب على طوله كله'],
            ['المقطع', it.top.label],
            ['الطول', runT.toFixed(2) + ' م = بروز ' + Lc.toFixed(2) +
              ' + نشر داخل البحر الخلفي ' + back.toFixed(2) + ' م'],
            ['الطرف الحرّ', 'عكفة 90° هابطة (ACI 9.7.3.3 يستثني الطرف الحرّ من ' +
              'تمديد d أو 12db، والعكفة لتثبيت الأسوار وحماية الطرف)'],
            ['الخطأ الشائع', 'وضع هذا الحديد بالأسفل — انهيار فوري عند فكّ القالب']] }),
          G.canti, posT.length * runT * Math.PI * Math.pow(it.top.db / 2000, 2) * 7850);
        inst(barGeo(Lc + 0.3, it.bottom.db, dirC, { a: 90, b: 90, up: 1 }), CBOT, posB,
          Object.assign(info('حديد الكانتيليفر السفلي'), { rows: [
            ['الموضع', 'الوجه السفلي — وجه **الضغط**، فلا حديد شدّ فيه'],
            ['المقطع', it.bottom.label],
            ['الوظيفة', 'انكماش وحرارة 0.0018·Ag (ACI 7.6.1.1) + تماسك إنشائي ' +
              'يدخل المسند (9.7.7) — لا يقاوم عزم البروز']] }),
          G.canti, posB.length * (Lc + 0.3) * Math.PI * Math.pow(it.bottom.db / 2000, 2) * 7850);
        // أساور البروز — لبلاطة البروز **لا أساور**: البلاطات تُصمَّم بلا حديد قص
        // (ACI 22.5 مع λs) وتزداد سماكتها بدل ذلك. الأساور تظهر فقط إن كان
        // البروز جسراً ضيّقاً لا بلاطة.
        if (it.wide) return;
        const stp = [], ss = (it.shear.s || 200) / 1000;
        for (let t = -wide / 2 + ss / 2; t < wide / 2; t += ss * 2) {
          const c0 = along ? -sgn * (B / 2 + Lc * 0.25) : sgn * (L / 2 + Lc * 0.25);
          stp.push(along ? [t, z - th2 / 2, c0] : [c0, z - th2 / 2, t]);
        }
        if (stp.length) addRings(Lc * 0.5, th2 - 2 * cvT, it.shear.db_stirrup || 10, stp,
          Object.assign(info('أساور البروز'), { rows: [
            ['التباعد', it.shear.label],
            ['الموضع', 'مكثّفة عند **وجه المسند** — القص أقصى ما يكون هناك، ' +
              'بعكس البحر البسيط الذي يكون قصّه أقصى عند المسندين وصفراً بالوسط'],
            ['العكفة', 'زلزالية 135° (ACI 25.3.4)']] }),
          TIE, G.canti, along ? 'z' : 'x', 0.075);
      });
    }

    /* ---- الدرج والمصاعد وفتحات السقف ---- */
    function buildStairs(z, s, PX, PZ) {
      const SP = md.stairs;
      if (!SP) return;
      (SP.flights || []).forEach((f, k) => {
        if (!f.bbox) return;
        const b2 = f.bbox, cx = PX((b2[0] + b2[2]) / 2), cz = PZ((b2[1] + b2[3]) / 2);
        const w = Math.abs(b2[2] - b2[0]), d = Math.abs(b2[3] - b2[1]);
        const along = f.dir === 'x' ? w : d;
        const rise = f.rise, tread = f.tread;
        const inf = k ? null : { title: 'قلبة درج', kind: 'stair', grp: 'stairs', floor: s,
          rows: f.rows.map(r => [r[0], r[1]]) };
        for (let i = 0; i < f.steps; i++) {
          const t = (i + 0.5) / f.steps - 0.5;
          const y = z - hs + rise * (i + 1);
          box(G.stairs, f.dir === 'x' ? tread : f.width, rise,
            f.dir === 'x' ? f.width : tread,
            cx + (f.dir === 'x' ? t * along : 0), y - rise / 2,
            cz + (f.dir === 'x' ? 0 : t * along), 0xb9c9dc, 1, i ? null : inf);
        }
        stairRebar(f, cx, cz, z - hs, along, s, k);
      });
      // ---- حديد القلبة: وِتر مائل + شبكتان + شنّاطات عند الانكسارات ----
      function stairRebar(f, cx, cz, z0, along, s, k) {
        const R = f.rebar;
        if (!R) return;
        const ax = f.dir === 'x';                       // اتجاه صعود القلبة
        const W = f.width, th = f.waist / 1000, cv = R.cover / 1000;
        const rise = f.rise, tread = f.tread, run = f.steps * tread;
        const H = f.steps * rise;                        // ارتفاع القلبة
        const sl = Math.hypot(run, H);                   // الطول المائل للوِتر
        const ang = Math.atan2(H, run);
        const inf = (t, x) => k ? null : Object.assign({ title: t + ' — قلبة درج',
          kind: 'rebar', grp: 'stairs', floor: s }, { rows: x });
        // محور الوِتر: من أسفل القلبة إلى أعلاها بمنتصف السماكة
        const mid = (u, off) => {                        // u∈[0,1] على الميل · off عمودي
          const px = (u - 0.5) * run, py = z0 + u * H - th / 2 + off * Math.cos(ang);
          const pu = off * Math.sin(ang);
          return ax ? [cx + px - pu, py, cz] : [cx, py, cz + px - pu];
        };
        // --- الحديد الرئيسي (سفلي) على الميل ---
        const yB = -(th / 2 - cv - R.main.db / 2000);     // إزاحة للوجه السفلي
        const nM = Math.max(2, R.main.n | 0);
        const posM = [];
        for (let i = 0; i < nM; i++) {
          const t2 = -W / 2 + cv + (W - 2 * cv) * (nM === 1 ? .5 : i / (nM - 1));
          const p = mid(0.5, yB);
          posM.push(ax ? [p[0], p[1], cz + t2] : [cx + t2, p[1], p[2]]);
        }
        const gM = slopeBar(sl + 0.3, R.main.db, ang, ax, 90);
        inst(gM, STEEL, posM, inf('Main bars — الحديد الرئيسي (سفلي)', [
          ['المقطع', R.main.label], ['الموضع', 'الوجه **السفلي** موازياً للميل'],
          ['الطول', R.main.len.toFixed(2) + ' م'], ['الملاحظة', R.main.note]]),
          G.stairs, posM.length * sl * Math.PI * Math.pow(R.main.db / 2000, 2) * 7850);
        // --- حديد التوزيع (عمودي على الرئيسي) ---
        const nD = Math.max(2, Math.min(40, R.dist.n | 0));
        const posD = [];
        for (let i = 0; i < nD; i++) {
          const u = (i + 0.5) / nD;
          posD.push(mid(u, yB + R.main.db / 1000));
        }
        inst(barGeo(W - 2 * cv, R.dist.db, ax ? 'z' : 'x', { a: 90, b: 90, up: 1 }),
          EXTRA, posD, inf('Distribution bars — حديد التوزيع', [
            ['المقطع', R.dist.label], ['الموضع', 'عمودي على الرئيسي و**فوقه**'],
            ['الملاحظة', R.dist.note]]),
          G.stairs, posD.length * W * Math.PI * Math.pow(R.dist.db / 2000, 2) * 7850);
        // --- الشنّاطات والحديد العلوي عند الانكسارين ---
        const yT = th / 2 - cv - R.top.db / 2000;
        const zone = Math.min(R.top.zone / Math.max(sl, .1), 0.45);
        const nT = Math.max(2, R.top.n | 0);
        [0, 1].forEach(end => {
          const posT = [];
          for (let i = 0; i < nT; i++) {
            const t2 = -W / 2 + cv + (W - 2 * cv) * (nT === 1 ? .5 : i / (nT - 1));
            const u = end ? 1 - zone / 2 : zone / 2;
            const p = mid(u, yT);
            posT.push(ax ? [p[0], p[1], cz + t2] : [cx + t2, p[1], p[2]]);
          }
          inst(slopeBar(zone * sl * 2, R.top.db, ang, ax, 90), TIE, posT,
            end ? null : inf('Hanger / Top anchor bars — الشنّاطات', [
              ['المقطع', R.top.label], ['الموضع', 'الوجه **العلوي** عند الانكسار'],
              ['الطول لكل جهة', R.top.zone.toFixed(2) + ' م'],
              ['لماذا', R.top.note],
              ['الركن الداخل', (R.corners[0] || {}).rule || ''],
              ['السبب', (R.corners[0] || {}).why || '']]),
            G.stairs, posT.length * zone * sl * 2 * Math.PI * Math.pow(R.top.db / 2000, 2) * 7850);
        });
        // --- أسياخ الانتظار (Starter) عند قدم القلبة ---
        const posS = [];
        for (let i = 0; i < nM; i++) {
          const t2 = -W / 2 + cv + (W - 2 * cv) * (nM === 1 ? .5 : i / (nM - 1));
          const p = mid(0.06, yB);
          posS.push(ax ? [p[0] - 0.15, p[1], cz + t2] : [cx + t2, p[1], p[2] - 0.15]);
        }
        inst(barGeo(R.starter.len, R.starter.db, 'y', { a: 90, b: 0, up: 1 }),
          DOWEL, posS, inf('Starter bars — أسياخ الانتظار', [
            ['المقطع', 'Ø' + R.starter.db + ' @ ' + Math.round(R.starter.s) + ' مم'],
            ['الطول البارز', R.starter.len.toFixed(2) + ' م'],
            ['الملاحظة', R.starter.note],
            ['الوصلة', R.lap.note]]),
          G.stairs, posS.length * R.starter.len * Math.PI * Math.pow(R.starter.db / 2000, 2) * 7850);
      }

      // سيخ مائل بزاوية الوِتر — يُبنى مستقيماً ثم يُدار حول محور الميل
      function slopeBar(len, db, ang, ax, hook) {
        const g = barGeo(len, db, ax ? 'x' : 'z', { a: hook, b: hook, up: 1 });
        if (ax) g.rotateZ(ang); else g.rotateX(-ang);
        return g;
      }

      // فتحات السقف تُعلَّم بإطار ملوّن (البلاطة نفسها تُخصم بالكميات)
      (SP.openings || []).forEach((o, k) => {
        if (o.x === null || o.x === undefined) return;
        box(G.extra, o.w, .05, o.h, PX(o.x), z - th + .03, PZ(o.y), 0xf59e0b, .5,
          k ? null : { title: 'فتحة بالسقف — ' + o.kind, kind: 'opening', grp: 'extra',
            floor: s, rows: o.rows.map(r => [r[0], r[1]]) });
      });
      (SP.shafts || []).forEach((sh, k) => {
        if (sh.x === null || sh.x === undefined) return;
        const t2 = sh.t / 1000;
        [[sh.w, t2, 0, -sh.h / 2], [sh.w, t2, 0, sh.h / 2],
         [t2, sh.h, -sh.w / 2, 0], [t2, sh.h, sh.w / 2, 0]].forEach(([ww, dd, ax, az]) =>
          box(G.walls, ww, hs, dd, PX(sh.x) + ax, z - hs / 2, PZ(sh.y) + az, 0x9aa8bd, 1,
            k ? null : { title: 'بئر مصعد — جدران قص', kind: 'shaft', grp: 'walls',
              floor: s, rows: sh.rows.map(r => [r[0], r[1]]) }));
      });
    }
    /* ركائز تحت حصيرة: شبكة واحدة على كامل المساحة، لا مجموعة تحت كل عمود.
       هذا هو الترتيب المنفَّذ فعلاً (Piled Raft) — والحصيرة تربط الرؤوس. */
    if (pil && pil.mode === 'raft' && pil.grid) {
      const gx = pil.grid.nx, gy = pil.grid.ny, sgx = pil.grid.s;
      const WX = rf ? rf.Lx : L, WZ2 = rf ? rf.Ly : B;
      let first = true;
      for (let i = 0; i < gx; i++) for (let j = 0; j < gy; j++) {
        const ax = -WX / 2 + (WX / gx) * (i + .5);
        const az = -WZ2 / 2 + (WZ2 / gy) * (j + .5);
        const o = new T.Mesh(new T.CylinderGeometry(pil.D / 2, pil.D / 2, pil.L, 14),
          mat(0x7c6ad8, recIs('piles') ? 1 : .3));
        o.position.set(ax, fb - pil.L / 2, az);
        o.userData = first ? { title: 'ركائز تحت الحصيرة (Piled Raft)', kind: 'pile',
          grp: 'piles', rows: [['الترتيب', pil.layout],
            ['العدد الكلي', pil.n_total + ' ركيزة للمبنى كله'],
            ['القطر والطول', 'Ø' + (pil.D * 1000).toFixed(0) + ' مم · ' + pil.L + ' م'],
            ['قدرة الركيزة', pil.Qall.toFixed(0) + ' kN'],
            ['الحمل الكلي', (pil.P_total || 0).toFixed(0) + ' kN'],
            ['التسليح', pil.rebar.label]] } : {};
        if (first) picks.push(o);
        G.piles.add(o); first = false;
      }
    }
    buildLift();
    const bxs = md.beams.x, bys = md.beams.y;
    const edgeOnly = !!((md.slab.geom || {}).edge_beams_only);
    // هيكل المخطط الحقيقي إن وُجد، وإلا مولّد الشبكة المنتظمة كما هو
    if (FR && FR.nodes && FR.nodes.length) buildFrameReal();
    else for (let s = 1; s <= nf; s++) {
      const z = s * hs;
      for (let j = 0; j <= g.ny; j++) for (let i = 0; i < g.nx; i++) {
        if (edgeOnly && j !== 0 && j !== g.ny) continue;   // فلات سلاب: جسور محيطية فقط
        box(G.beams, g.sx - cb, bxs.h / 1000, bxs.b / 1000, px((xs[i] + xs[i + 1]) / 2),
          z - bxs.h / 2000, pz(ys[j]), 0x7f97b8, 1,
          { title: 'جسر X — طابق ' + s, kind: 'beam', grp: 'beams', floor: s,
            gk: 'bx|' + i + '|' + j + '|' + s,
            rows: [['المقطع', bxs.b + ' × ' + bxs.h + ' مم'], ['البحر', g.sx.toFixed(2) + ' م'],
              ['سفلي', bxs.rebar.bottom.label], ['علوي', bxs.rebar.top.label],
              ['الأساور', bxs.rebar.stirrup.label],
              ['الهطول', Math.abs(bxs.d_long).toFixed(1) + ' / ' + bxs.d_limit.toFixed(1) + ' مم'],
              ['النظام', edgeOnly ? 'جسر محيطي — لا جسور داخلية بالفلات سلاب' : 'إطار جسور كامل']] });
      }
      for (let i = 0; i <= g.nx; i++) for (let j = 0; j < g.ny; j++) {
        if (edgeOnly && i !== 0 && i !== g.nx) continue;
        box(G.beams, bys.b / 1000, bys.h / 1000, g.sy - ch, px(xs[i]), z - bys.h / 2000,
          pz((ys[j] + ys[j + 1]) / 2), 0x7f97b8, 1,
          { title: 'جسر Y — طابق ' + s, kind: 'beam', grp: 'beams', floor: s,
            gk: 'by|' + i + '|' + j + '|' + s,
            rows: [['المقطع', bys.b + ' × ' + bys.h + ' مم'], ['البحر', g.sy.toFixed(2) + ' م'],
              ['سفلي', bys.rebar.bottom.label], ['علوي', bys.rebar.top.label],
              ['الأساور', bys.rebar.stirrup.label],
              ['النظام', edgeOnly ? 'جسر محيطي — لا جسور داخلية بالفلات سلاب' : 'إطار جسور كامل']] });
      }
      slabGeom(z, s);
      // السقف العصبي (هوردي/وافل) = طبقة تغطية فقط فوق الأعصاب — لا كتلة مصمتة تخفيها
      const gmS = md.slab.geom || {};
      const ribbed = gmS.kind === 'hordi' || gmS.kind === 'waffle';
      const tSlab = ribbed ? gmS.topping / 1000 : th;
      box(G.slabs, L, tSlab, B, 0, z - tSlab / 2, 0, 0xa8bcd4,
        gmS.kind === 'bubble' ? .55 : 1,
        { title: md.slab.name + ' — سقف طابق ' + s, kind: 'slab', grp: 'slabs', floor: s,
          rows: [['السماكة', md.slab.h + ' مم'], ['المساحة', (L * B).toFixed(1) + ' م²'],
            ['النوع', md.slab.name],
            ['فرش (قصير)', (md.slab.mesh.short || md.slab.mesh.bottom).label],
            ['غطاء (طويل)', (md.slab.mesh.long || md.slab.mesh.bottom).label],
            ['علوي فوق المساند', md.slab.mesh.top.label],
            ['الخرسانة', (L * B * md.slab.h / 1000).toFixed(1) + ' م³']] });
      buildCanti(z, s);
      // الدرج كان يُرسم **فقط** حين يوجد مخطط DWG — والآن يُرسم بالشبكة
      // التلقائية أيضاً، فالمشروع بلا مخطط يرى درجه وتسليحه كذلك.
      buildStairs(z, s, px, pz);
    }
  }

  /* ===================== نواة المصعد — جدران بكامل الارتفاع =====================
     تُرسم من قاع الحفرة (Pit) تحت منسوب التأسيس حتى أعلى البئر، لا كفتحة
     بالسقف: أربعة جدران متصلة تشكّل صندوقاً مغلقاً هو أقسى عنصر بالمبنى. */
  function buildLift() {
    const e = md.elevator;
    if (!e || ROOM) return;
    const t2 = e.t / 1000, X = MAPX(e.x), Z = MAPZ(e.y);
    const yBot = fb - (e.pit || 1.5);                     // قاع الحفرة
    const yTop = nf * hs + (e.over || 3.6);               // أعلى البئر
    const rows = [['السعة', e.Q + ' كغم · ' + e.persons + ' راكب'],
      ['البئر الداخلي', e.w.toFixed(2) + ' × ' + e.h.toFixed(2) + ' م'],
      ['سماكة الجدار', Math.round(e.t) + ' مم'],
      ['حصة النواة من القوة الجانبية', Math.round(e.rigidity.share * 100) + '%'],
      ['الحديد الرأسي', e.wall.vert.label], ['الحديد الأفقي', e.wall.horiz.label],
      ['عمق الحفرة', (e.pit || 0).toFixed(2) + ' م'],
      ['الارتفاع العلوي', (e.over || 0).toFixed(2) + ' م'],
      ['الحمل على الأساس', Math.round(e.on_found) + ' kN']];
    const H = yTop - yBot;
    [[e.w + t2, t2, 0, -(e.h + t2) / 2], [e.w + t2, t2, 0, (e.h + t2) / 2],
     [t2, e.h + t2, -(e.w + t2) / 2, 0], [t2, e.h + t2, (e.w + t2) / 2, 0]]
      .forEach(([ww, dd, ax, az], k) =>
        box(G.walls, ww, H, dd, X + ax, yBot + H / 2, Z + az, 0x8fa3bd, 1,
          k ? null : { title: 'نواة المصعد — جدران قصّ', kind: 'lift', grp: 'walls',
            rows: rows }));
    // بلاطة قاع البئر
    box(G.walls, e.w + 2 * t2, e.pit_slab.t / 1000, e.h + 2 * t2, X,
      yBot + e.pit_slab.t / 2000, Z, 0x6f86a6, 1,
      { title: 'بلاطة قاع بئر المصعد', kind: 'lift', grp: 'walls',
        rows: [['السماكة', Math.round(e.pit_slab.t) + ' مم'],
          ['صدم المصدّ', Math.round(e.pit_slab.Vu) + ' kN'],
          ['مقاومة الثقب φVc', Math.round(e.pit_slab.phiVc) + ' kN']] });
  }

  /* ============================== التسليح ============================== */
  /* ============ هندسة العكفة القياسية — ACI 318M-14 جدولا 25.3.1 و25.3.2 ============
     قطر الثني الداخلي: للأسياخ 6db (≤Ø25) · 8db (Ø29–36) · 10db (Ø43–57)
                        للأساور 4db (≤Ø16) · 6db (Ø19–25)
     الامتداد بعد الثنية: أسياخ 12db لـ90° و max(4db,65) لـ180°
                          أساور max(6db,75) لـ135° · و12db لـ90° فوق Ø16    */
  // تُعرَّف بـ function لا const: البناء الإنشائي (الكانتيليفر) يستدعيها قبل
  // أن يصل التنفيذ لهذا السطر، والـ const بمنطقة موت زمني فترمي خطأً.
  function bendDia(db, tie) {
    return tie ? (db <= 16 ? 4 : 6) * db : (db <= 25 ? 6 : db <= 36 ? 8 : 10) * db;
  }
  function hookExt(db, ang, tie) {
    return tie ? (ang === 90 ? (db <= 16 ? Math.max(6 * db, 75) : 12 * db)
      : Math.max(6 * db, 75)) : (ang === 90 ? 12 * db : Math.max(4 * db, 65));
  }

  /* نقاط العكفة بمستوى محلي: السيخ ممتد على +u، والعكفة تنثني نحو −v.
     تُرجع مصفوفة نقاط [u,v] بالمتر تبدأ من نهاية الجزء المستقيم. */
  function hookPts(db, ang, tie, sign) {
    const d = db / 1000, R = (bendDia(db, tie) / 2 + db / 2) / 1000;
    const e = hookExt(db, ang, tie) / 1000, a = ang * Math.PI / 180, s = sign || 1;
    const p = [], N = 7, cy = -s * R;                     // مركز قوس الثني
    for (let i = 0; i <= N; i++) {
      const t = a * i / N;
      p.push([R * Math.sin(t), cy + s * R * Math.cos(t)]);
    }
    const tip = p[p.length - 1];
    p.push([tip[0] + e * Math.cos(a), tip[1] + s * e * Math.sin(a)]);
    return p;
  }

  /* سيخ مستقيم **بعكفاته الحقيقية** بالطرفين — لا أسطوانة عارية.
     hk = {a:زاوية بداية, b:زاوية نهاية, tie:أسوار؟, up:اتجاه العكفة (+1 لأعلى)}
     الصفر أو null يعني طرفاً مقطوعاً بلا عكفة (وسط الوصلة مثلاً). */
  function barGeo(len, db, dir, hk) {
    if (!hk || (!hk.a && !hk.b)) {
      const gm = new T.CylinderGeometry(db / 2000, db / 2000, len, 6, 1);
      if (dir === 'x') gm.rotateZ(Math.PI / 2);
      if (dir === 'z') gm.rotateX(Math.PI / 2);
      return gm;
    }
    const up = hk.up === undefined ? 1 : hk.up, tie = !!hk.tie, h = len / 2, pts = [];
    if (hk.a) {                                    // عكفة البداية (مرآة على −u)
      const q = hookPts(db, hk.a, tie, up);
      for (let i = q.length - 1; i >= 0; i--) pts.push([-h - q[i][0], q[i][1]]);
    } else pts.push([-h, 0]);
    pts.push([-h + 0.001, 0], [h - 0.001, 0]);
    if (hk.b) hookPts(db, hk.b, tie, up).forEach(q => pts.push([h + q[0], q[1]]));
    else pts.push([h, 0]);
    const v = pts.map(q => dir === 'x' ? new T.Vector3(q[0], q[1], 0)
      : dir === 'z' ? new T.Vector3(0, q[1], q[0])
        : new T.Vector3(q[1], q[0], 0));           // dir 'y' = عمودي (أسياخ العمود)
    return new T.TubeGeometry(new T.CatmullRomCurve3(v, false, 'catmullrom', 0),
      Math.max(24, pts.length * 3), db / 2000, 6, false);
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
  /* hook: زاوية عكفة الطرفين (افتراضياً 90° لكل سيخ مستقيم كما يُنفَّذ بالموقع
     وكما يُحسب بجدول التقطيع). العكفة تُرسم على **الطرفين الحقيقيين للسيخ**
     لا على أطراف القطع الوسطية — فالوصلة تراكب لا نهاية سيخ. */
  function addRun(len, db, dir, pos, info, col, grp, hook) {
    const lap = lapOf(db);
    let n = 1;
    while ((len + (n - 1) * lap) / n > stock && n < 60) n++;
    const piece = (len + (n - 1) * lap) / n;
    const hA = hook === undefined ? 90 : hook, up = (hook && hook.up) || 1;
    const ang = (typeof hA === 'object') ? (hA.ang || 90) : hA;
    const w1 = piece * Math.PI * Math.pow(db / 2000, 2) * 7850;
    for (let i = 0; i < n; i++) {
      const startC = i * (piece - lap) + piece / 2 - len / 2;
      const off = (i % 2) ? db / 1000 : 0;                 // إزاحة لإظهار التداخل
      const pp = pos.map(p => dir === 'x' ? [p[0] + startC, p[1], p[2] + off]
        : dir === 'z' ? [p[0] + off, p[1], p[2] + startC] : [p[0] + off, p[1] + startC, p[2]]);
      const hk = ang ? { a: i === 0 ? ang : 0, b: i === n - 1 ? ang : 0, up: up } : null;
      const ex = ang ? [['العكفة', 'عكفة ' + ang + '° بطرفي السيخ — ثني داخلي ' +
        Math.round(bendDia(db, false)) + ' مم وامتداد ' + Math.round(hookExt(db, ang, false)) +
        ' مم (ACI جدول 25.3.1)']] : [];
      const inf = i === 0 && info ? Object.assign({}, info, { rows: (info.rows || []).concat(
        [['التقطيع', n + ' قطعة × ' + piece.toFixed(2) + ' م (سوق ' + stock + ' م)'],
         ['الوصلات', (n - 1) + ' وصلة × ' + lap.toFixed(2) + ' م (1.3·ld)']]).concat(ex) }) : null;
      const meta = { grp: (info && info.grp) || CURG, floor: info && info.floor };
      inst(barGeo(piece, db, dir, hk), col || STEEL, pp, inf, grp, w1 * pp.length, meta);
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
  /* ============ العكفة الزلزالية 135° للأساور — ACI 318M-14 المادة 25.3.4 ============
     البند يوجب ثلاثة أشياء معاً، وكلها مرسومة هنا كما تُنفَّذ:
       (١) ثني ≥ 135° لكل الأساور غير الدائرية
       (٢) العكفة **تلتفّ حول سيخ طولي** (engage) لا بالهواء
       (٣) الامتداد يتّجه إلى **داخل** السوار لا خارجه
     العكفتان بركنين **متقابلين قطرياً** لا بركن واحد — فلو انفتحت واحدة بقيت
     الأخرى تمسك اللبّ. والرسم يُظهر ذلك بالعين. */
  function tieHookGeo(w, d, db, corner) {
    const R = ((db <= 16 ? 4 : 6) * db / 2 + db / 2) / 1000;   // نصف قطر محور الثني
    const e = Math.max(6 * db, 75) / 1000;                     // امتداد 6db ≥ 75 مم
    const sx = corner ? 1 : -1, sz = corner ? 1 : -1;
    const cx = sx * (w / 2), cz = sz * (d / 2);
    // القوس يبدأ باتجاه الضلع ثم ينثني 135° نحو قطر المقطع (إلى الداخل)
    const p = [], N = 9, a0 = Math.atan2(-sz, -sx);            // اتجاه القطر للداخل
    const st = Math.atan2(0, -sx);                             // اتجاه الضلع
    for (let i = 0; i <= N; i++) {
      const t = st + (3 * Math.PI / 4) * (i / N) * sz * (sx > 0 ? 1 : -1);
      p.push(new T.Vector3(cx + R * Math.cos(t) * 0 + R * Math.sin(t) * -sx,
        0, cz - R * (1 - Math.cos(t)) * sz));
    }
    const dirI = new T.Vector3(-sx, 0, -sz).normalize();
    const tip = p[p.length - 1].clone().add(dirI.multiplyScalar(e));
    p.push(tip);
    return new T.TubeGeometry(new T.CatmullRomCurve3(p, false, 'catmullrom', 0),
      18, db / 2000, 5, false);
  }
  /* الأتاري الداخلي (Crosstie) — ACI 25.3.5: متصل بين طرفيه، 135° بطرف و90° بالآخر */
  function crossGeo(span, db, ang2) {
    const R = ((db <= 16 ? 4 : 6) * db / 2 + db / 2) / 1000;
    const e1 = Math.max(6 * db, 75) / 1000, e2 = Math.max(6 * db, 75) / 1000;
    const h = span / 2, p = [];
    p.push(new T.Vector3(-h - R * .7 - e1 * .7, 0, R * .7 + e1 * .7));   // ذيل 135°
    p.push(new T.Vector3(-h - R * .4, 0, R * .4));
    p.push(new T.Vector3(-h, 0, 0), new T.Vector3(h, 0, 0));             // الساق
    p.push(new T.Vector3(h + R * .4, 0, R * .4));
    p.push(new T.Vector3(h + R * .4, 0, R * .4 + e2));                   // ذيل 90°
    return new T.TubeGeometry(new T.CatmullRomCurve3(p, false, 'catmullrom', 0),
      20, db / 2000, 5, false);
  }
  function addRings(w, d, db, pos, info, col, grp, rot, hookExt, cross) {
    if (!pos.length) return null;
    const geo = ringGeo(w, d, db);
    const h1 = tieHookGeo(w, d, db, true), h2 = tieHookGeo(w, d, db, false);
    const gs = [geo, h1, h2];
    // أتاري داخلية: عدد الأرجل الإضافية بكل اتجاه ومواقعها
    const cx = (cross && cross.x) || 0, cz = (cross && cross.z) || 0;
    for (let i = 0; i < cx; i++) {
      const g = crossGeo(d, db); g.rotateY(Math.PI / 2);
      g.translate((-0.5 + (i + 1) / (cx + 1)) * w, 0, 0); gs.push(g);
    }
    for (let i = 0; i < cz; i++) {
      const g = crossGeo(w, db);
      g.translate(0, 0, (-0.5 + (i + 1) / (cz + 1)) * d); gs.push(g);
    }
    gs.forEach(g => {
      if (rot === 'x') g.rotateX(Math.PI / 2);
      if (rot === 'z') { g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2); }
    });
    const per = 2 * (w + d) + (cx * d + cz * w);
    const im = inst(gs[0], col || TIE, pos, info, grp,
      pos.length * per * Math.PI * Math.pow(db / 2000, 2) * 7850);
    const meta = { grp: (info && info.grp) || CURG, floor: info && info.floor };
    for (let i = 1; i < gs.length; i++) inst(gs[i], col || TIE, pos, null, grp, 0, meta);
    return im;
  }
  /* الكرسي حسب نوعه وزاويته — z90 أرجل عمودية · s135 ميل 45° · sb مستمر · ihc منفرد.
     القدمان تمتدان أفقياً بطول تباعد الشبكة فتستندان فعلياً على أسياخ الطبقة السفلى،
     والعرضة العلوية تلامس أسفل الشبكة العلوية وتُربط بها بالسلك. */
  function chairGeo(kind, ht, db, tr, foot) {
    tr = (tr || 250) / 1000; foot = Math.max((foot || 80) / 1000, .12);
    const t2 = tr / 2, run = (kind === 's135') ? ht : 0;   // الإزاحة الأفقية للرجل
    if (kind === 'sb') {
      // Slab Bolster: سلك واحد مستمر زكزاك بطول متر — كل قمة تحمل الشبكة العلوية
      const zz = [new T.Vector3(-t2 - foot, 0, -.5)];
      for (let o = -.5; o <= .5001; o += .25)
        zz.push(new T.Vector3(0, 0, o), new T.Vector3(0, ht, o + .125));
      zz.push(new T.Vector3(0, 0, .5), new T.Vector3(t2 + foot, 0, .5));
      return new T.TubeGeometry(new T.CatmullRomCurve3(zz, false, 'catmullrom', 0),
        zz.length * 3, db / 2000, 5, false);
    }
    /* الشكل المنفَّذ بالموقع (z90): قدم أفقية على الشبكة السفلى · ثنية 90° ·
       رجل عمودية · ثنية 90° · عرضة علوية تحمل الشبكة العلوية · ثم رجل وقدم.
       الثنيات **حادّة بنصف قطر حقيقي** لا منحنى ناعم: `CatmullRom` كان يقوّس
       الرجل كلها فيخرج الكرسي أعرض ممّا يُصنَع فعلاً ويبرز عن حافة البلاطة. */
    const r = Math.min(2.5 * db / 1000, ht / 3, foot / 2);   // نصف قطر الثنية
    const pts = [];
    const push = (x, yv) => pts.push(new T.Vector3(x, yv, 0));
    push(-t2 - run - foot, 0);                     // طرف القدم اليسرى
    push(-t2 - run - r, 0);                        // بداية الثنية السفلى
    push(-t2 - run + (run ? r * .7 : 0), r);       // داخل الثنية
    push(-t2 - (run ? r * .7 : 0), ht - r);        // أعلى الرجل
    push(-t2 + r, ht);                             // بداية العرضة
    push(t2 - r, ht);                              // نهاية العرضة
    push(t2 + (run ? r * .7 : 0), ht - r);
    push(t2 + run - (run ? r * .7 : 0), r);
    push(t2 + run + r, 0);
    push(t2 + run + foot, 0);                      // طرف القدم اليمنى
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', 0),
      kind === 's135' ? 30 : 22, db / 2000, 6, false);
  }
  /* mesh = {sx,sz,x0,z0} خطوط الشبكة السفلى — تُثبّت عليها أقدام الكراسي.
     bound = {x0,z0,lx,lz} حدّ الخرسانة الفعلي الذي **لا يجوز** أن يخرج عنه أي
     جزء من الكرسي (قد يكون أوسع من شريط التوزيع نفسه). */
  function addChairs(x0, z0, lx, lz, sp, ht, db, y, info, ch, snap, bound) {
    const pos = [], kind = (ch && ch.kind) || 'z90';
    const foot = (ch && ch.foot) || 100;
    // نصف العرض يُقاس من **المجسم نفسه** لا بحساب تقريبي: قوس الثنية ونصف قطر
    // الأنبوب يزيدان بضعة مليمترات، وهي التي كانت تُبقي طرف القدم خارج الحافة.
    const geo = chairGeo(kind, ht, db, ch && ch.top_run, foot);
    geo.computeBoundingBox();
    const gb = geo.boundingBox;
    const hw = Math.max(gb.max.x, -gb.min.x), hz = Math.max(gb.max.z, -gb.min.z);
    const bd = bound || { x0: x0, z0: z0, lx: lx, lz: lz };
    // الحدّ الذي يجوز أن يقف عليه **مركز** الكرسي حتى يبقى طرفه داخل الخرسانة
    const xLo = bd.x0 + hw, xHi = bd.x0 + bd.lx - hw;
    const zLo = bd.z0 + hz, zHi = bd.z0 + bd.lz - hz;
    if (xHi < xLo || zHi < zLo) return 0;      // العنصر أضيق من كرسي واحد
    const at = (v, v0, st) => st ? v0 + Math.round((v - v0) / st) * st : v;   // تثبيت على خط سيخ
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const seen = new Set();
    for (let a = sp / 2; a < lx; a += sp) for (let b2 = sp / 2; b2 < lz; b2 += sp) {
      let X = snap ? at(x0 + a, snap.x0, snap.sx) : x0 + a;
      let Z = snap ? at(z0 + b2, snap.z0, snap.sz) : z0 + b2;
      // التثبيت على خط السيخ قد يدفع الكرسي خارج الحافة — يُردّ لأقرب موضع مقبول
      X = clamp(X, xLo, xHi); Z = clamp(Z, zLo, zHi);
      const key = X.toFixed(3) + '|' + Z.toFixed(3);
      if (seen.has(key)) continue;             // الردّ قد يُكرّر موضعاً — لا كرسيّان بمكان
      seen.add(key);
      pos.push([X, y, Z]);
    }
    const each = (ch && ch.len_each) || (2 * ht + .3);
    return inst(geo, CHAIR, pos, info,
      G.chairs, pos.length * each * Math.PI * Math.pow(db / 2000, 2) * 7850);
  }
  /* سيخ سفلي مثني 45° عند ln/7 من كل مسند */
  function bentGeo(len, rise, bendAt, db, dir) {
    const a = len / 2, b3 = Math.max(.05, a - bendAt);
    const p = [[-a, rise], [-b3 - rise, rise], [-b3, 0], [b3, 0], [b3 + rise, rise], [a, rise]];
    const v = p.map(q => dir === 'x' ? new T.Vector3(q[0], q[1], 0)
      : new T.Vector3(0, q[1], q[0]));
    return new T.TubeGeometry(new T.CatmullRomCurve3(v, false, 'catmullrom', 0),
      24, db / 2000, 5, false);
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
      if (fc2) {
        const yb2 = fb + .075 + rf.bottom.db / 1000;          // ظهر الشبكة السفلى للحصيرة
        const ht2 = Math.max(.06, (fb + t - .075 - rf.top.db / 1000) - yb2);
        addChairs(-rf.Lx / 2, -rf.Ly / 2, rf.Lx, rf.Ly, fc2.spacing, ht2, fc2.db, yb2,
          { title: 'كراسي الحصيرة', kind: 'rebar', grp: 'raft',
            rows: [['النوع', fc2.name || fc2.label], ['الزاوية', (fc2.angle || 90) + '°'],
              ['الارتفاع الصافي', Math.round(ht2 * 1000) + ' مم'],
              ['الاستناد', 'القدمان على الشبكة السفلى · العرضة تحمل الشبكة العلوية'],
              ['العدد', fc2.n], ['الوزن', fc2.weight.toFixed(2) + ' طن']] }, fc2,
          { x0: -rf.Lx / 2, z0: -rf.Ly / 2, sx: rf.bottom.s / 1000, sz: rf.bottom.s / 1000 },
          { x0: -rf.Lx / 2 + .075, z0: -rf.Ly / 2 + .075, lx: rf.Lx - .15, lz: rf.Ly - .15 });
      }
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
        const sup = cr.support || {};
        addRings(cb - 2 * cvr, ch - 2 * cvr, cr.tie_db, tp,
          { title: 'أتاري العمود بعكفة 135° — طابق ' + (s + 1), kind: 'rebar', floor: s + 1,
            rows: [['الوسط', cr.tie_label], ['التطويق', cr.conf_label || '—'],
              ['العكفة', (cr.hook && cr.hook.label) || 'عكفة زلزالية 135° (ACI 25.3.4)'],
              ['العكفتان', 'بركنين **متقابلين قطرياً** — لو انفتحت واحدة بقيت الأخرى'],
              ['الأتاري الداخلية', (sup.total || 0) + ' — ' + (sup.why || 'ACI 25.7.2.3')],
              ['التباعد الحاكم', (cr.tie_rule && cr.tie_rule.note) || '—'],
              ['العدد', tp.length]],
          }, null, null, null, cr.hook ? cr.hook.ext / 1000 : .075,
          { x: (sup.x && sup.x.n) || 0, z: (sup.y && sup.y.n) || 0 });
        // ---- الدولات (أشاير الربط) عند قاعدة العمود ----
        if (s === 0 && cr.dowels) {
          const dw = cr.dowels, em = dw.embed / 1000, pj = dw.project / 1000;
          const dp = [], ixd = cb / 2 - cvr, izd = ch / 2 - cvr;
          for (let a = 0; a < Math.max(2, Math.round(dw.n / 4) + 1); a++) {
            const t3 = a / Math.max(1, Math.round(dw.n / 4));
            dp.push([X - ixd + 2 * ixd * t3, ft - em + (em + pj) / 2, Z - izd]);
            dp.push([X - ixd + 2 * ixd * t3, ft - em + (em + pj) / 2, Z + izd]);
          }
          inst(barGeo(em + pj, dw.db, 'y'), DOWEL, dp,
            { title: 'دولات ربط العمود C' + (k + 1) + ' بالأساس', kind: 'rebar', floor: 1,
              grp: 'columns',
              rows: [['التفصيل', dw.label], ['القاعدة', dw.mode],
                ['الدفن بالأساس', Math.round(dw.embed) + ' مم'],
                ['البروز بالعمود', Math.round(dw.project) + ' مم'],
                ['ldc الكودي', Math.round(dw.ldc) + ' مم'],
                ['ملاحظة', dw.warn || 'مطابق للكود ✓']] }, null,
            dp.length * (em + pj) * Math.PI * Math.pow(dw.db / 2000, 2) * 7850,
            { grp: 'columns', floor: 1 });
        }
      }
    });
    // ---- الجسور ----
    CURG = 'beams';
    const drawBeam = (cX, cZ, len, bw, hB, z, reb, dir, floor, ttl, det, ends) => {
      const bot = [], bnt = [], top = [], stp = [];
      const nb2 = reb.bottom.n, nt = reb.top.n, sdb = reb.stirrup;
      const cv = (reb.cover || 40) / 1000;
      const yb = z - hB + cv, yt = z - cv - th;
      const nBent = (det && det.bent) ? (det.n_bent || 0) : 0;
      for (let i = 0; i < nb2; i++) {
        const o = nb2 === 1 ? 0 : (i / (nb2 - 1) - .5) * (bw - 2 * cv);
        (i < nBent ? bnt : bot).push(dir === 'x' ? [cX, yb, cZ + o] : [cX + o, yb, cZ]);
      }
      for (let i = 0; i < nt; i++) {
        const o = nt === 1 ? 0 : (i / (nt - 1) - .5) * (bw - 2 * cv);
        top.push(dir === 'x' ? [cX, yt, cZ + o] : [cX + o, yt, cZ]);
      }
      const ns = Math.max(2, Math.floor(len / (sdb.s / 1000)));
      for (let i = 0; i <= ns; i++) {
        const t2 = -len / 2 + i * len / ns;
        stp.push(dir === 'x' ? [cX + t2, z - hB / 2, cZ] : [cX, z - hB / 2, cZ + t2]);
      }
      const inf = (t, more) => ({ title: t + ' — ' + ttl, kind: 'rebar', floor: floor,
        rows: [['المقطع', Math.round(bw * 1000) + ' × ' + Math.round(hB * 1000) + ' مم'],
          ['سفلي', reb.bottom.label], ['علوي', reb.top.label], ['الأساور', sdb.label],
          ['الغطاء', Math.round(cv * 1000) + ' مم']].concat(more || []) });
      addRun(len, reb.bottom.db, dir, bot, inf('تسليح سفلي مستقيم'));
      // الأسياخ المثنية 45° عند ln/7 (نصف الحديد السفلي)
      if (bnt.length && det) {
        const rise = hB - 2 * cv - reb.bottom.db / 1000;
        const geo = bentGeo(len, rise, det.bend_at, reb.bottom.db, dir);
        inst(geo, STEEL, bnt, Object.assign(inf('تسليح سفلي مثني 45°'), { rows:
          inf('').rows.concat([['نقطة الثني', 'ln/7 = ' + det.bend_at.toFixed(2) + ' م من وجه المسند'],
            ['ارتفاع الثنية', Math.round(det.bar.rise) + ' مم'],
            ['الزيادة بالطول', Math.round(det.bar.extra_total * 1000) + ' مم للسيخ'],
            ['عدد المثني', nBent + ' من ' + nb2 + ' سيخ (50%)']]) }), null,
          bnt.length * (len + det.bar.extra_total) * Math.PI * Math.pow(reb.bottom.db / 2000, 2) * 7850,
          { grp: CURG, floor: floor });
      }
      // الحديد العلوي: يمتد ln/3 لكل جهة من المسند (قطع عند ln/5 لنصفه)
      // عند المسند الطرفي يمتد للداخل فقط — لا يبرز خارج المبنى
      if (det) {
        const half = Math.ceil(top.length / 2);
        const ed = ends || [false, false];
        [[top.slice(0, half), det.top1_len, 'الطبقة الأولى — تمتد ln/3 = ' + det.top1.toFixed(2) + ' م'],
         [top.slice(half), det.top2_len, 'الطبقة الثانية — تُقطع عند ln/5 = ' + det.top2.toFixed(2) + ' م']]
          .forEach(([pp, L2, why], qi) => {
            if (!pp.length) return;
            [[-len / 2, ed[0], +1], [len / 2, ed[1], -1]].forEach(([e, outer, into]) => {
              const Lb = outer ? L2 / 2 : L2;             // الطرفي: نصف السيخ للداخل
              const ctr = e + (outer ? into * L2 / 4 : 0);
              const sh = pp.map(p => dir === 'x' ? [p[0] + ctr, p[1], p[2]] : [p[0], p[1], p[2] + ctr]);
              addRun(Lb, reb.top.db, dir, sh, e < 0 && qi === 0 ? Object.assign(
                inf('تسليح علوي فوق المسند'), { rows: inf('').rows.concat(
                  [['الامتداد', why], ['طول السيخ', Lb.toFixed(2) + ' م'],
                   ['المسند', outer ? 'طرفي — يمتد للداخل فقط بعكفة 90° بالعمود' : 'داخلي — متصل بالفضاءين'],
                   ['المرجع', 'ACI 9.7.3.8 — L/3 و L/5 من وجه المسند']]) }) : null);
            });
          });
      } else {
        addRun(len, reb.top.db, dir, top, inf('تسليح علوي'));
      }
      const bLegs = (sdb.legs || 2) - 2;      // أرجل زائدة على السوار المحيط = أتاري
      addRings(dir === 'x' ? bw - 2 * cv : hB - 2 * cv, dir === 'x' ? hB - 2 * cv : bw - 2 * cv,
        sdb.db, stp, inf('أساور بعكفة زلزالية 135°', [
          ['لماذا هنا', 'ثلاث وظائف: تحمل القص · تحصر لبّ الخرسانة · تمنع انبعاج ' +
            'الأسياخ الطولية بعد انقشار الغطاء'],
          ['العكفة', 'ثني 135° يلتفّ على سيخ طولي وامتداده **داخل** السوار ' +
            '(ACI 25.3.4) — العكفة 90° تنفتح عند انقشار الغطاء'],
          ['الأرجل', (sdb.legs || 2) + ' — ' + (bLegs > 0 ? bLegs + ' أتاري داخلية'
            : 'سوار محيط وحده')]]),
        null, null, dir === 'x' ? 'x' : 'z', Math.max(6 * sdb.db / 1000, .075),
        { x: 0, z: Math.max(0, bLegs) });
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
            md.beams.x.h / 1000, z, md.beams.x.rebar, 'x', s, 'جسور X طابق ' + s,
            md.beams.x.detail, [i === 0, i === g.nx - 1]);
        for (let i = 0; i <= g.nx; i++) for (let j = 0; j < g.ny; j++)
          drawBeam(px(xs[i]), pz((ys[j] + ys[j + 1]) / 2), g.sy - ch, md.beams.y.b / 1000,
            md.beams.y.h / 1000, z, md.beams.y.rebar, 'z', s, 'جسور Y طابق ' + s,
            md.beams.y.detail, [j === 0, j === g.ny - 1]);
      }
    }
    // ---- السقوف ----
    CURG = 'slabs';
    const msh = md.slab.mesh, mS = msh.short || msh.bottom, mLg = msh.long || msh.bottom,
      mt = msh.top;
    const cvS = (md.slab.cover || 20) / 1000;
    const shortIsX = L <= B;                       // اتجاه الفرش = البعد الأقصر
    const floorsList = ROOM ? [1] : Array.from({ length: nf }, (_, i) => i + 1);
    floorsList.forEach(s => {
      const z = ROOM ? hs : s * hs;
      // ---- الفرش (الاتجاه القصير) ثم الغطاء (الطويل) فوقه بقطر سيخ واحد ----
      const yF = z - th + cvS + mS.db / 2000, yG = yF + (mS.db + mLg.db) / 2000;
      const lay = (run, across, dirC, s2, db2, y2, ttl, ord, dd) => {
        const n2 = Math.max(2, Math.ceil(across / (s2 / 1000)) + 1), p = [];
        for (let i = 0; i < n2; i++) {
          const o = -across / 2 + Math.min(i * s2 / 1000, across);
          p.push(dirC === 'x' ? [0, y2, o] : [o, y2, 0]);
        }
        addRun(run - 2 * cvS + .4, db2, dirC, p,
          { title: ttl + ' — طابق ' + s, kind: 'rebar', floor: s,
            rows: [['التفصيل', (dd && dd.label) || ''], ['الترتيب بالتنفيذ', ord],
              ['العدد', n2 + ' سيخ = ⌈' + across.toFixed(2) + ' ÷ ' + (s2 / 1000).toFixed(2) + '⌉ + 1'],
              ['طول السيخ', (run - 2 * cvS + .4).toFixed(2) + ' م'],
              ['العمق الفعّال d', Math.round((dd && dd.d) || 0) + ' مم']] });
      };
      lay(shortIsX ? L : B, shortIsX ? B : L, shortIsX ? 'x' : 'z', mS.s, mS.db, yF,
        'فرش السقف (الاتجاه القصير)', 'الطبقة الأولى من الأسفل', mS);
      lay(shortIsX ? B : L, shortIsX ? L : B, shortIsX ? 'z' : 'x', mLg.s, mLg.db, yG,
        'غطاء السقف (الاتجاه الطويل)', 'الطبقة الثانية فوق الفرش', mLg);
      const sch = md.slab.chairs;
      if (sch) {
        // القاعدة على ظهر الشبكة السفلى · القمة تلامس أسفل الشبكة العلوية
        const yBase = yG + mLg.db / 2000;
        const yTopM = z - cvS - mt.db / 1000;
        const htC = Math.max(.06, yTopM - yBase);
        const snap = { x0: -L / 2, z0: -B / 2,
          sx: (shortIsX ? mLg.s : mS.s) / 1000, sz: (shortIsX ? mS.s : mLg.s) / 1000 };
        const cinf = (n) => ({ title: 'كراسي السقف — طابق ' + s, kind: 'rebar', grp: 'slabs',
          floor: s, rows: [['النوع', sch.name || sch.label], ['الزاوية', (sch.angle || 90) + '°'],
            ['الارتفاع الصافي', Math.round(htC * 1000) + ' مم (بين ظهر الفرش وأسفل العلوي)'],
            ['الاستناد', 'القدمان على أسياخ الشبكة السفلى · العرضة تحمل الشبكة العلوية'],
            ['الموضع', 'تحت شرائط الحديد العلوي فوق المساند فقط'],
            ['طول القطعة', (sch.len_each || 0).toFixed(2) + ' م'],
            ['العدد الكلي', n], ['بسكويت الغطاء السفلي', sch.spacers]] });
        // شرائط فوق محاور المساند فقط — حيث يوجد حديد علوي يحتاج حملاً
        const zs = sch.zones;
        if (zs && zs.length) {
          zs.forEach((zn, zi) => {
            const w = Math.min(zn.w, zn.dir === 'x' ? B : L);
            const bnd = { x0: -L / 2 + cvS, z0: -B / 2 + cvS,
                          lx: L - 2 * cvS, lz: B - 2 * cvS };
            if (zn.dir === 'x')
              addChairs(-L / 2, pz(zn.at) - w / 2, L, w, sch.spacing, htC, sch.db, yBase,
                zi ? null : cinf(sch.n), sch, snap, bnd);
            else
              addChairs(px(zn.at) - w / 2, -B / 2, w, B, sch.spacing, htC, sch.db, yBase,
                null, sch, snap, bnd);
          });
        } else {
          addChairs(-L / 2, -B / 2, L, B, sch.spacing, htC, sch.db, yBase, cinf(sch.n), sch, snap,
            { x0: -L / 2 + cvS, z0: -B / 2 + cvS, lx: L - 2 * cvS, lz: B - 2 * cvS });
        }
      }
      // ---- التسليح العلوي: أسياخ محدودة فوق المساند تمتد L/4 لكل جهة ----
      CURG = 'slabs';
      if (ROOM) {
        meshGrid(-L / 2, -B / 2, L, B, mt.s, mt.db, z - .025,
          { title: 'تسليح السقف العلوي', kind: 'rebar', floor: s,
            rows: [['التفصيل', mt.label]] });
      } else {
        const tl = md.slab.top_len || { x: g.sx / 2, y: g.sy / 2, ext: .25 };
        const yT = z - cvS - mt.db / 2000;
        // فوق محاور جسور X: الأسياخ عمودية عليها (باتجاه Z) بطول 2·sy/4 + عرض المسند
        // المحور الطرفي: نصف السيخ للداخل فقط حتى لا يبرز خارج البلاطة
        for (let j = 0; j <= g.ny; j++) {
          const edge = (j === 0 || j === g.ny), into = j === 0 ? -1 : 1;
          const Lb = edge ? tl.y / 2 : tl.y, off = edge ? into * tl.y / 4 : 0;
          const p = [], n2 = Math.max(2, Math.ceil(L / (mt.s / 1000)) + 1);
          for (let i = 0; i < n2; i++) p.push([-L / 2 + Math.min(i * mt.s / 1000, L), yT, pz(ys[j]) + off]);
          addRun(Lb, mt.db, 'z', p, j === 1 || (g.ny === 1 && !j) ? null :
            { title: 'تسليح علوي فوق محاور جسور X', kind: 'rebar', floor: s,
              rows: [['التفصيل', mt.label], ['طول السيخ', Lb.toFixed(2) + ' م'],
                ['الامتداد', 'L/4 = ' + (g.sy / 4).toFixed(2) + ' م لكل جهة من محور المسند'],
                ['المحور', edge ? 'طرفي — نصف السيخ للداخل بعكفة 90°' : 'داخلي — سيخ متماثل'],
                ['العدد بالمحور الواحد', n2 + ' سيخ'],
                ['المرجع', 'التسليح العلوي فوق الأعمدة والمساند فقط — لا يمتد على البلاطة كاملة']] });
        }
        for (let i = 0; i <= g.nx; i++) {
          const edge = (i === 0 || i === g.nx), into = i === 0 ? 1 : -1;
          const Lb = edge ? tl.x / 2 : tl.x, off = edge ? into * tl.x / 4 : 0;
          const p = [], n2 = Math.max(2, Math.ceil(B / (mt.s / 1000)) + 1);
          for (let k2 = 0; k2 < n2; k2++) p.push([px(xs[i]) + off, yT, -B / 2 + Math.min(k2 * mt.s / 1000, B)]);
          addRun(Lb, mt.db, 'x', p, i === 1 || (g.nx === 1 && !i) ? null :
            { title: 'تسليح علوي فوق محاور جسور Y', kind: 'rebar', floor: s,
              rows: [['التفصيل', mt.label], ['طول السيخ', Lb.toFixed(2) + ' م'],
                ['الامتداد', 'L/4 = ' + (g.sx / 4).toFixed(2) + ' م لكل جهة'],
                ['المحور', edge ? 'طرفي — نصف السيخ للداخل' : 'داخلي — سيخ متماثل']] });
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
          const lx = Math.min(g.sx, L) * .9, lz = Math.min(g.sy, B) * .9;
          // يُقيَّد المركز حتى لا يبرز السيخ خارج البلاطة عند الأعمدة الطرفية
          const cx2 = Math.max(-L / 2 + lx / 2, Math.min(L / 2 - lx / 2, px(l.x)));
          const cz2 = Math.max(-B / 2 + lz / 2, Math.min(B / 2 - lz / 2, pz(l.y)));
          for (let i = 0; i < ex.integrity.n; i++) {
            const o = (i - (ex.integrity.n - 1) / 2) * .08;
            p1.push([cx2 + o, z - th + .03, pz(l.y)]);
            p2.push([px(l.x), z - th + .05, cz2 + o]);
          }
          addRun(lx, ex.integrity.db, 'x', p1,
            { title: 'تسليح التماسك خلال العمود', kind: 'extra', floor: s,
              rows: [['المرجع', 'ACI 8.7.4.2'], ['التفصيل', ex.integrity.n + 'Ø' + ex.integrity.db + ' مستمر'],
                ['السبب', 'يمنع الانهيار التدريجي عند فشل قص الثقب']] }, EXTRA, G.extra);
          addRun(lz, ex.integrity.db, 'z', p2, null, EXTRA, G.extra);
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
      // محور Z **معكوس** بالمشهد (pz = −(v − B/2))، فالسير بطول الجسر باتجاه Y
      // يكون بالطرح لا بالجمع. الجمع كان يخرج بالمغلّف من أول محور إلى خارج
      // المبنى، فتظهر «أجنحة» عزوم معلّقة بالفراغ لا تلامس أي جسر.
      if (dir === 'x') { v.push(cX + p[0], y0, cZ, cX + p[0], y0 + off, cZ); }
      else { v.push(cX, y0, cZ - p[0], cX, y0 + off, cZ - p[0]); }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    g2.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g2.setIndex(idx); g2.computeVertexNormals();
    const m = new T.Mesh(g2, new T.MeshBasicMaterial({ color: col, transparent: true,
      opacity: .55, side: T.DoubleSide, depthWrite: false }));
    m.userData = info || {}; if (info) picks.push(m);
    return m;
  }
  /* ===================== حقل عزوم السقف (كنتور ملوّن) =====================
     الحقل يأتي محسوباً من الخادم (`moments.field`) كشبكة قيم kN·م/م، ويُرسم
     سطحاً ملوّناً على السقف. السُّلَّم **ثنائي الاتجاه حول الصفر**: الأحمر عزم
     موجب (شدّ بالوجه السفلي ⇒ حديد سفلي) والأزرق سالب (شدّ علوي ⇒ حديد علوي).
     ولهذا لا يصلح سُلَّم أحادي: إشارة العزم هي التي تقرّر **أين** يوضع الحديد. */
  let fBuilt = false, fldMode = 'gov';
  function fieldColor(t) {
    // t ∈ [-1, 1] — أزرق(سالب) → رمادي(صفر) → أحمر(موجب) بتدرّج مطابق للمرجع
    const st = [[-1.00, 0x1e3a8a], [-0.66, 0x2563eb], [-0.33, 0x38bdf8],
                [0.00, 0xe2e8f0], [0.33, 0xfacc15], [0.66, 0xf97316], [1.00, 0xdc2626]];
    t = Math.max(-1, Math.min(1, t));
    for (let i = 0; i < st.length - 1; i++) {
      if (t <= st[i + 1][0]) {
        const f = (t - st[i][0]) / (st[i + 1][0] - st[i][0] || 1);
        const a = st[i][1], b2 = st[i + 1][1];
        const mix = (sh) => (((a >> sh) & 255) * (1 - f) + ((b2 >> sh) & 255) * f) / 255;
        return [mix(16), mix(8), mix(0)];
      }
    }
    return [1, 0, 0];
  }
  function fieldVal(F, i, j) {
    const a = F.mx[j][i], b2 = F.my[j][i];
    return fldMode === 'x' ? a : fldMode === 'y' ? b2
      : (Math.abs(a) >= Math.abs(b2) ? a : b2);      // الحاكم: الأكبر مطلقاً
  }
  function buildField() {
    const F = md.slab && md.slab.field;
    if (!F || ROOM || !F.xs || !F.xs.length) return;
    while (G.field.children.length) G.field.remove(G.field.children[0]);
    const nxp = F.xs.length, nyp = F.ys.length;
    /* تموّج الأعصاب يُطبَّق **هنا** لا بالخادم: دوره أدقّ من خطوة العيّنة،
       فتُنعَّم الشبكة بعامل sub ليقع 6 نقاط على كل عصب فلا يتشوّه بالتقطيع. */
    const rb = F.ribs;
    const stepX = (F.xs[nxp - 1] - F.xs[0]) / (nxp - 1);
    const stepZ = (F.ys[nyp - 1] - F.ys[0]) / (nyp - 1);
    let subX = 1, subZ = 1;
    if (rb && rb.spacing > 0) {
      const need = rb.spacing / 6;
      if (rb.dir === 'x' || rb.dir === 'both') subZ = Math.min(8, Math.max(1, Math.ceil(stepZ / need)));
      if (rb.dir === 'y' || rb.dir === 'both') subX = Math.min(8, Math.max(1, Math.ceil(stepX / need)));
    }
    const NX = (nxp - 1) * subX + 1, NZ = (nyp - 1) * subZ + 1;
    const gx = k => F.xs[0] + (F.xs[nxp - 1] - F.xs[0]) * k / (NX - 1);
    const gz = k => F.ys[0] + (F.ys[nyp - 1] - F.ys[0]) * k / (NZ - 1);
    const comb = (v, on) => (rb && on) ? Math.max(0,
      1 + rb.amp * Math.cos(2 * Math.PI * (v - F.xs[0] * 0) / rb.spacing)) : 1;
    // قيمة منعّمة بالاستيفاء الثنائي من شبكة الخادم
    const at = (kx, kz) => {
      const fx = kx / subX, fz = kz / subZ;
      const i = Math.min(nxp - 2, Math.floor(fx)), j = Math.min(nyp - 2, Math.floor(fz));
      const a = fx - i, b2 = fz - j;
      const v = fieldVal(F, i, j) * (1 - a) * (1 - b2) + fieldVal(F, i + 1, j) * a * (1 - b2)
        + fieldVal(F, i, j + 1) * (1 - a) * b2 + fieldVal(F, i + 1, j + 1) * a * b2;
      if (!rb) return v;
      // الأعصاب باتجاه x تتكرّر على z، والعكس بالعكس
      let f = 1;
      if (rb.dir === 'x' || rb.dir === 'both') f *= comb(gz(kz), true);
      if (rb.dir === 'y' || rb.dir === 'both') f *= comb(gx(kx), true);
      return v * f;
    };
    let amp = 1e-6;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++)
      amp = Math.max(amp, Math.abs(at(i, j)));

    for (let s = 1; s <= nf; s++) {
      const y = s * hs + .012;                     // فوق سطح السقف بقليل
      const pos = [], col = [], idx = [];
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        pos.push(MAPX(gx(i)), y, MAPZ(gz(j)));
        const c = fieldColor(at(i, j) / amp);
        col.push(c[0], c[1], c[2]);
      }
      for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
        const a = j * NX + i;
        idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1);
      }
      const g2 = new T.BufferGeometry();
      g2.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g2.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g2.setIndex(idx); g2.computeVertexNormals();
      const m = new T.Mesh(g2, new T.MeshBasicMaterial({ vertexColors: true,
        transparent: true, opacity: .82, side: T.DoubleSide, depthWrite: false }));
      m.userData = { title: 'حقل عزوم ' + F.name + ' — سقف طابق ' + s,
        kind: 'field', grp: 'moments', floor: s,
        rows: [['النظام', F.name], ['الشكل', F.shape],
          F.per_rib ? ['عزم العصب الواحد', 'موجب ' + F.per_rib.pos + ' · سالب ' +
            F.per_rib.neg + ' kN·م (تباعد ' + F.per_rib.spacing + ' م)'] : ['', ''],
          ['المعروض', fldMode === 'x' ? 'Mx (أسياخ باتجاه X)'
            : fldMode === 'y' ? 'My (أسياخ باتجاه Y)' : 'الحاكم — الأكبر مطلقاً'],
          ['أقصى موجب', F.hi.toFixed(1) + ' kN·م/م (شدّ سفلي ⇒ حديد سفلي)'],
          ['أقصى سالب', F.lo.toFixed(1) + ' kN·م/م (شدّ علوي ⇒ حديد علوي)'],
          ['توزيع الحمل', F.split.rule]] };
      G.field.add(m); picks.push(m);
    }
    fBuilt = true;
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

  /* ============ خلفية مخطط DWG/DXF تحت المجسم ============ */
  const ACAD = [0x000000, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff,
                0xffffff, 0x808080, 0xc0c0c0];
  let planData = null, planX = { scale: 1, rot: 0, dx: 0, dy: 0, level: 0, op: 0.85 };
  function acadColor(i) {
    if (i === undefined || i === null || i === 256 || i === 7) return 0x9fb4cc;
    return ACAD[i] !== undefined ? ACAD[i] : 0x9fb4cc;
  }
  /* يبني قطعاً مستقيمة مدمجة لكل طبقة — 7000 عنصر تصير عشرات الكائنات فقط */
  function buildPlan(d) {
    G.plan.clear ? G.plan.clear() : (G.plan.children.length = 0);
    planData = d;
    if (!d || !d.ents || !d.ents.length) return { layers: 0, segs: 0 };
    const sc = d.scale || 0.001;
    const off = d.origin || [0, 0];                 // نقطة التصفير بوحدات الرسم
    const byLayer = {};
    const seg = (lay, x1, y1, x2, y2) => {
      (byLayer[lay] = byLayer[lay] || []).push(
        (x1 - off[0]) * sc, (y1 - off[1]) * sc, (x2 - off[0]) * sc, (y2 - off[1]) * sc);
    };
    const arc = (lay, cx, cy, r, a0, a1) => {
      const n = Math.max(6, Math.min(48, Math.ceil(r * sc * 24)));
      let s = a0 * Math.PI / 180, e = a1 * Math.PI / 180;
      if (e <= s) e += 2 * Math.PI;
      for (let i = 0; i < n; i++) {
        const t0 = s + (e - s) * i / n, t1 = s + (e - s) * (i + 1) / n;
        seg(lay, cx + r * Math.cos(t0), cy + r * Math.sin(t0),
                 cx + r * Math.cos(t1), cy + r * Math.sin(t1));
      }
    };
    const off_ = d.roles || {};
    for (const e of d.ents) {
      if (off_[e.l] === 'off') continue;
      const p = e.p;
      if (e.t === 'L') seg(e.l, p[0], p[1], p[2], p[3]);
      else if (e.t === 'P') {
        for (let i = 0; i + 3 < p.length; i += 2) seg(e.l, p[i], p[i + 1], p[i + 2], p[i + 3]);
        if (e.closed && p.length >= 6)
          seg(e.l, p[p.length - 2], p[p.length - 1], p[0], p[1]);
      } else if (e.t === 'C' && p[2] > 0) arc(e.l, p[0], p[1], p[2], 0, 360);
      else if (e.t === 'A') arc(e.l, p[0], p[1], p[2], p[3], p[4]);
    }
    const colors = {};
    (d.layers || []).forEach(l => colors[l.name] = acadColor(l.color));
    let segs = 0;
    Object.entries(byLayer).forEach(([lay, arr]) => {
      const g2 = new T.BufferGeometry();
      const v = new Float32Array(arr.length / 2 * 3);
      for (let i = 0, j = 0; i < arr.length; i += 2) {
        v[j++] = arr[i]; v[j++] = 0; v[j++] = -arr[i + 1];   // مستوى XZ مثل بقية المشهد
      }
      g2.setAttribute('position', new T.BufferAttribute(v, 3));
      const m = new T.LineSegments(g2, new T.LineBasicMaterial({
        color: colors[lay] || 0x9fb4cc, transparent: true, opacity: planX.op,
        depthWrite: false, clippingPlanes: [clip] }));
      m.userData = { title: 'مخطط — طبقة ' + lay, kind: 'plan', grp: 'plan',
        rows: [['الطبقة', lay], ['عدد القطع', arr.length / 4],
               ['الدور', ({ col: 'أعمدة', wall: 'جدران', axis: 'محاور',
                            other: 'عرض فقط' })[off_[lay]] || 'عرض فقط'],
               ['المقياس', (1 / sc).toFixed(0) + ' وحدة رسم = 1 م']] };
      picks.push(m); G.plan.add(m);
      segs += arr.length / 4;
    });
    applyPlanX();
    return { layers: Object.keys(byLayer).length, segs: segs };
  }
  function applyPlanX() {
    G.plan.position.set(planX.dx, planX.level, planX.dy);
    G.plan.rotation.y = planX.rot * Math.PI / 180;
    G.plan.scale.set(planX.scale, 1, planX.scale);
    G.plan.children.forEach(o => { if (o.material) o.material.opacity = planX.op; });
  }

  /* ============ التربة الطبيعية وطبقات الردم بشكل أقرب للواقع ============
     تحت الحفر تُرسم أسرّة التربة بألوانها حسب صنفها، ويُرسم منسوب الماء الجوفي
     كسطح شفاف. وطبقات الجلمود والسبيس تُكسى بحبيبات بأحجامها الحقيقية:
     الجلمود حصى خشن 4–10 سم والسبيس ناعم 1–3 سم — فيُفرَّق بينهما بالنظر. */
  let soilBuilt = false;
  /* ---- ملمس الطبقة: يُولَّد على كانفاس بنمط منتظم لكل صنف ----
     الطين ناعم بخطوط أفقية · الرمل حبيبات صغيرة متراصّة · الحصى كتل خشنة ·
     الصخر مكعّبات متشقّقة · العضوية بقع داكنة. كله بدالة تجزئة حتمية لا عشوائية،
     فالمقطع يتكرّر بالضبط في كل مرة. */
  const TEXCACHE = {};
  function strataTex(kind, hex, seed) {
    const key = kind + hex;
    if (TEXCACHE[key]) return TEXCACHE[key];
    const N = 128, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = hex; g.fillRect(0, 0, N, N);
    const h01 = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7 + seed * 7.3) * 43758.5453;
      return x - Math.floor(x); };
    const shade = (a, f) => { g.globalAlpha = a;
      g.fillStyle = f < 0 ? '#000' : '#fff'; };
    if (kind === 'clay') {
      for (let i = 0; i < 26; i++) {
        shade(.05 + h01(i, 1) * .05, h01(i, 2) > .5 ? 1 : -1);
        g.fillRect(0, h01(i, 3) * N, N, 1 + h01(i, 4) * 2);
      }
    } else if (kind === 'sand') {
      for (let i = 0; i < 900; i++) {
        shade(.10 + h01(i, 1) * .12, h01(i, 2) > .45 ? 1 : -1);
        g.fillRect(h01(i, 3) * N, h01(i, 4) * N, 2, 2);
      }
    } else if (kind === 'gravel') {
      for (let i = 0; i < 150; i++) {
        shade(.14 + h01(i, 1) * .16, h01(i, 2) > .5 ? 1 : -1);
        const r = 2 + h01(i, 5) * 5;
        g.beginPath(); g.arc(h01(i, 3) * N, h01(i, 4) * N, r, 0, 6.29); g.fill();
      }
    } else if (kind === 'rock') {
      g.globalAlpha = .22; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      for (let r = 0; r < 5; r++) for (let q = 0; q < 4; q++) {
        const x = q * N / 4 + (r % 2) * N / 8, y = r * N / 5;
        g.strokeRect(x, y, N / 4, N / 5);
      }
      for (let i = 0; i < 40; i++) {
        shade(.08 + h01(i, 1) * .10, -1);
        g.fillRect(h01(i, 3) * N, h01(i, 4) * N, 3 + h01(i, 5) * 6, 1);
      }
    } else if (kind === 'rubble') {
      for (let i = 0; i < 90; i++) {
        shade(.16 + h01(i, 1) * .18, h01(i, 2) > .55 ? 1 : -1);
        g.save(); g.translate(h01(i, 3) * N, h01(i, 4) * N);
        g.rotate(h01(i, 6) * 3.14); g.fillRect(-4, -2, 8, 4); g.restore();
      }
    } else {                                   // organic — تربة سطحية
      for (let i = 0; i < 220; i++) {
        shade(.12 + h01(i, 1) * .14, h01(i, 2) > .7 ? 1 : -1);
        g.beginPath(); g.arc(h01(i, 3) * N, h01(i, 4) * N, 1 + h01(i, 5) * 2, 0, 6.29); g.fill();
      }
    }
    g.globalAlpha = 1;
    const tx = new T.CanvasTexture(c);
    tx.wrapS = tx.wrapT = T.RepeatWrapping;
    tx.repeat.set(6, 3);
    TEXCACHE[key] = tx;
    return tx;
  }

  /* بطاقة نصّية على وجه المقطع — اسم الطبقة وتحمّلها كما بمقطع الجسّة */
  function soilLabel(txt, x, y, z, hot) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = hot ? 'rgba(6,95,70,.92)' : 'rgba(11,18,32,.82)';
    g.fillRect(0, 0, 512, 64);
    g.strokeStyle = hot ? '#34d399' : '#3b4a63'; g.lineWidth = 3;
    g.strokeRect(1, 1, 510, 62);
    g.fillStyle = hot ? '#a7f3d0' : '#cbd5e1';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.direction = 'rtl';
    g.fillText(txt, 496, 34, 480);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c),
      transparent: true, depthTest: false }));
    sp.position.set(x, y, z);
    sp.scale.set(3.4, .42, 1);
    sp.renderOrder = 9;
    G.soil.add(sp);
    return sp;
  }

  /* أسهم القوى: الحمل نازل من الأعمدة · والاحتكاك الجانبي والارتكاز الطرفي للركائز */
  function arrow(from, to, color, head) {
    const dir = new T.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < .05) return null;
    const a = new T.ArrowHelper(dir.clone().normalize(), from, len, color,
      Math.min(head || len * .28, len * .5), Math.min(head || len * .28, len * .5) * .55);
    a.line.material.clippingPlanes = [clip];
    a.cone.material.clippingPlanes = [clip];
    G.soil.add(a);
    return a;
  }

  function soilForces(so, w, d) {
    const fb = so.found_bot, gr = so.ground;
    // حمل نازل من كل عمود إلى قاعدة الأساس
    const pts = COLS && COLS.length ? COLS.slice(0, 12)
      : [{ x: 0, y: 0 }];
    pts.forEach(l => {
      const X = COLS && COLS.length ? MAPX(l.x) : 0, Z = COLS && COLS.length ? MAPZ(l.y) : 0;
      arrow(new T.Vector3(X, gr + 1.1, Z), new T.Vector3(X, fb + .12, Z), 0xef4444, .22);
    });
    const pl = so.piles;
    if (!pl) {
      // انتشار الضغط تحت الأساس السطحي (2:1) — أسهم قصيرة متفرّقة
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        arrow(new T.Vector3(i * w / 4, fb - .05, j * d / 4),
              new T.Vector3(i * w / 4, fb - .7, j * d / 4), 0xf97316, .16);
      }
      return;
    }
    // الركائز: احتكاك جانبي صاعد على طول الجذع + ارتكاز طرفي عند الطرف
    const tip = pl.tip;
    [-1, 1].forEach(sgn => {
      const X = sgn * Math.min(w / 5, 2.0);
      for (let y = fb - 1.0; y > tip + 1.0; y -= Math.max(1.2, (fb - tip) / 8)) {
        arrow(new T.Vector3(X + .45 * sgn, y - .55, 0),
              new T.Vector3(X + .45 * sgn, y, 0), 0xfbbf24, .18);
      }
      arrow(new T.Vector3(X, tip - 1.1, 0), new T.Vector3(X, tip - .08, 0), 0xef4444, .3);
    });
    soilLabel('احتكاك جانبي (Skin Friction)', -w / 2 - .05, (fb + tip) / 2 + .6, 2.2, false);
    soilLabel('ارتكاز طرفي (End Bearing) — ' + pl.end_bed, -w / 2 - .05, tip - .6, 2.2, true);
  }

  function buildSoil() {
    if (soilBuilt) return; soilBuilt = true;
    const so = M.soil;
    const w = L + 3.0, d = B + 3.0;
    if (so && so.beds) {
      so.beds.forEach((bd, bi) => {
        const t = Math.max(.05, bd.top - bd.bottom);
        const yc = (bd.top + bd.bottom) / 2;
        const mat = new T.MeshLambertMaterial({
          map: strataTex(bd.texture, bd.color, bi), color: 0xffffff,
          transparent: true, opacity: .98, clippingPlanes: [clip] });
        const bx2 = new T.Mesh(new T.BoxGeometry(w, t, d), mat);
        bx2.position.set(0, yc, 0);
        bx2.userData = { title: bd.name + (bd.bearing ? ' — الطبقة الحاملة' : ''),
          kind: 'soil', grp: 'soil',
          rows: [['المنسوب', bd.bottom.toFixed(2) + ' → ' + bd.top.toFixed(2) + ' م'],
            ['السماكة', t.toFixed(2) + ' م'],
            ['تحمّل استرشادي', bd.qa ? bd.qa.toFixed(0) + ' kPa' : 'لا يُحسب له تحمّل'],
            ['الحالة', bd.bearing ? '**عليها يجلس الأساس**'
              : (bd.excavated ? 'فوق قاعدة الأساس — تُحفَر وتُزال' : 'تحت قاعدة الأساس')],
            ['الوصف', bd.note || '—'],
            ...(bd.gypseous ? [['⚠️ الجبس', 'تربة جبسية انهيارية — تذوب بالماء ' +
              'فتنهار البنية فجأة']] : [])] };
        G.soil.add(bx2); picks.push(bx2);
        // بطاقة اسم الطبقة على وجه المقطع — كما بمقاطع الجسّات
        soilLabel(bd.name + '   ' + (bd.qa ? bd.qa + ' kPa' : ''),
          -w / 2 - .05, yc, 0, bd.bearing);
        // خط فاصل بين الطبقات
        if (bi) {
          const ln = new T.Mesh(new T.BoxGeometry(w + .04, .03, d + .04),
            new T.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: .6,
              clippingPlanes: [clip] }));
          ln.position.set(0, bd.top, 0); G.soil.add(ln);
        }
        if (bd.bearing) {                       // إطار يميّز الطبقة الحاملة
          const eg = new T.LineSegments(
            new T.EdgesGeometry(new T.BoxGeometry(w + .02, t, d + .02)),
            new T.LineBasicMaterial({ color: 0x34d399, clippingPlanes: [clip] }));
          eg.position.set(0, yc, 0); G.soil.add(eg);
        }
      });
      soilForces(so, w, d);
      if (so.gwt !== null && so.gwt !== undefined) {
        const wm = new T.Mesh(new T.BoxGeometry(w + .6, .06, d + .6),
          new T.MeshLambertMaterial({ color: 0x2f9bd8, transparent: true, opacity: .45,
            clippingPlanes: [clip] }));
        wm.position.set(0, so.gwt, 0);
        wm.userData = { title: '💧 منسوب الماء الجوفي', kind: 'gwt', grp: 'soil',
          rows: [['المنسوب', so.gwt.toFixed(2) + ' م من البنج مارك'],
            ['الأثر', 'يرفع الضغط على الأساس ويقلّل تحمّل التربة — يحتاج نزح أثناء الحفر وعزلاً'],
            ['العمق تحت قاع الأساس', (so.found_bot - so.gwt).toFixed(2) + ' م']] };
        G.soil.add(wm); picks.push(wm);
      }
    }
    // ---- الردم المدكوك يُنفَّذ **طبقات** بسماكة معلومة، فيُرسم طبقات ----
    // لا شيء عشوائي: الحبيبات على شبكة منتظمة بخطوة = قطر الحبيبة، مُزاحة
    // نصف خطوة بين الصفوف (رصّ مُتداخل كما يحصل بالدكّ الحقيقي)، وأي تفاوت
    // بالحجم والدوران يأتي من **دالة تجزئة على رقم الحبيبة** لا من عشوائية —
    // فالمشهد يتكرر بالضبط في كل مرة، وكل حبيبة موقعها محسوب.
    const hash01 = (i, k) => {           // مولّد حتمي في [0,1) — لا Math.random
      let x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    st.forEach((sl, si) => {
      if (sl.kind !== 'boulder' && sl.kind !== 'subbase') return;
      const coarse = sl.kind === 'boulder';
      const dg = coarse ? .07 : .02;                    // قطر الحبيبة الاسمي (م)
      const step = dg * 1.25;                           // خطوة الرصّ
      const wx = L + .3, wz = B + .3;
      const nx = Math.max(1, Math.floor(wx / step));
      const nz = Math.max(1, Math.floor(wz / step));
      const nl = Math.max(1, sl.layers || Math.max(1, Math.round(sl.t / (sl.layer_t || .25))));
      const tl = sl.t / nl;                             // سماكة الطبقة الواحدة
      const cap = 26000;
      let per = nx * nz;
      let stride = Math.max(1, Math.ceil(per * nl / cap));
      const total = Math.floor(per * nl / stride);
      const geo = new T.SphereGeometry(dg / 2, coarse ? 8 : 6, coarse ? 6 : 4);
      const im = new T.InstancedMesh(geo, new T.MeshLambertMaterial({
        color: new T.Color(sl.color).multiplyScalar(coarse ? .82 : 1.06),
        clippingPlanes: [clip] }), total);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), sc3 = new T.Vector3();
      let c = 0;
      for (let li = 0; li < nl && c < total; li++) {
        const yl = sl.bottom + (li + .5) * tl;          // مركز الطبقة المدكوكة
        const off = (li % 2) * step / 2;                // تداخل بين الطبقات
        for (let ix = 0; ix < nx && c < total; ix++) {
          for (let iz = 0; iz < nz && c < total; iz++) {
            if ((ix * nz + iz + li) % stride) continue;
            const id = si * 1e6 + li * 1e4 + ix * 100 + iz;
            const px2 = -wx / 2 + (ix + .5) * step + off + (iz % 2) * step / 2;
            const pz2 = -wz / 2 + (iz + .5) * step;
            if (px2 > wx / 2 || pz2 > wz / 2) continue;
            const k2 = .82 + hash01(id, 1) * .30;       // تفاوت حجم حتمي ±15%
            sc3.set(k2, k2 * (.80 + hash01(id, 2) * .30), k2);
            q.setFromEuler(new T.Euler(hash01(id, 3) * 3.1, hash01(id, 4) * 3.1,
                                       hash01(id, 5) * 3.1));
            m4.compose(new T.Vector3(px2, yl + (hash01(id, 6) - .5) * tl * .5, pz2), q, sc3);
            im.setMatrixAt(c++, m4);
          }
        }
      }
      im.count = c;
      im.userData = { title: sl.name + ' — مرصوصة طبقات بحبيبات بحجمها الحقيقي',
        kind: 'grain', grp: 'soil',
        rows: [['نوع الحبيبة', coarse ? 'جلمود/حصى خشن — قطر اسمي 7 سم'
                                      : 'سبيس ناعم — قطر اسمي 2 سم'],
          ['السماكة الكلية', sl.t.toFixed(2) + ' م'],
          ['طبقات الدكّ', nl + ' × ' + (tl * 100).toFixed(0) + ' سم'],
          ['خطوة الرصّ', (step * 100).toFixed(1) + ' سم (رصّ متداخل بين الصفوف)'],
          ['حبيبات معروضة', c + ' من ' + (nx * nz * nl)],
          ['الحجم', sl.volume.toFixed(1) + ' م³'],
          ['المشترى سائباً', sl.buy ? sl.buy.toFixed(1) + ' م³' : '—'],
          ['التوزيع', 'شبكة منتظمة محسوبة — لا عشوائية: المشهد يتكرر بالضبط']] };
      G.soil.add(im); picks.push(im);
      // خط فاصل رفيع عند كل مستوى دكّ ليُرى عدد الطبقات بالعين
      for (let li = 1; li < nl; li++) {
        const y2 = sl.bottom + li * tl;
        const ln = new T.Mesh(new T.BoxGeometry(wx, .012, wz),
          new T.MeshBasicMaterial({ color: 0x1b2436, transparent: true, opacity: .55,
            clippingPlanes: [clip] }));
        ln.position.set(0, y2, 0);
        G.soil.add(ln);
      }
    });
  }

  /* ============ مناطق الشد والضغط على العناصر الحاملة ============
     الجسر المستمر: ليفه السفلي بالشدّ وسط البحر وعلويه بالشدّ فوق المسند،
     والمنطقة المقابلة بالضغط — وهذا بالضبط سبب مكان الحديد أعلى وأسفل.
     تُرسم شرائح ملوّنة على وجهَي كل جسر: أحمر شدّ · أزرق ضغط. */
  let stressBuilt = false;
  function buildStress() {
    if (stressBuilt) return; stressBuilt = true;
    const RED = 0xe8443a, BLU = 0x2f6fb8;
    const skin = (w, h, d, x, y, z, col, info) => {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial({
        color: col, transparent: true, opacity: .78, clippingPlanes: [clip], depthWrite: false }));
      m.position.set(x, y, z); m.userData = info || {}; G.stress.add(m);
      if (info) picks.push(m); return m;
    };
    const bh = md.beams.x.h / 1000, bw = md.beams.x.b / 1000, tSk = Math.max(.05, bh * .22);
    const rowsFor = (zone, where) => [['المنطقة', zone],
      ['الموقع', where], ['الحديد المناسب', zone === 'شدّ' ? 'الحديد يُوضع هنا — الخرسانة لا تقاوم الشدّ'
        : 'الخرسانة تقاوم الضغط — الحديد للتطويق ومنع الانبعاج'],
      ['القاعدة', 'العزم الموجب يشدّ الليف السفلي · العزم السالب يشدّ الليف العلوي']];
    const mkBeam = (x1, z1, x2, z2, ytop) => {
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < .4) return;
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const ang = Math.atan2(dz, dx);
      const mid = Math.max(.3, len * .5), end = Math.max(.3, len * .25);
      const put = (frac, off, ln, col, zone, where) => {
        const t2 = frac, ox2 = cx + Math.cos(ang) * (t2 * len), oz2 = cz + Math.sin(ang) * (t2 * len);
        const m = skin(ln, tSk, bw * .98, ox2, ytop + off, oz2, col, {
          title: (zone === 'شدّ' ? '🔴 شدّ' : '🔵 ضغط') + ' — ' + where, kind: 'stress',
          grp: 'stress', rows: rowsFor(zone, where) });
        m.rotation.y = -ang;
      };
      // وسط البحر: سفلي شدّ · علوي ضغط
      put(0, -bh + tSk / 2, mid, RED, 'شدّ', 'الليف السفلي وسط البحر');
      put(0, -tSk / 2, mid, BLU, 'ضغط', 'الليف العلوي وسط البحر');
      // عند المسندين: علوي شدّ · سفلي ضغط
      [-.5 + .12, .5 - .12].forEach(f => {
        put(f, -tSk / 2, end, RED, 'شدّ', 'الليف العلوي فوق المسند');
        put(f, -bh + tSk / 2, end, BLU, 'ضغط', 'الليف السفلي فوق المسند');
      });
    };
    G.beams.children.forEach(o => {
      const u = o.userData;
      if (!u || u.kind !== 'beam' || !o.geometry || !o.geometry.parameters) return;
      const pr = o.geometry.parameters, horiz = pr.width >= pr.depth;
      const ln = horiz ? pr.width : pr.depth;
      const x1 = o.position.x - (horiz ? ln / 2 : 0), z1 = o.position.z - (horiz ? 0 : ln / 2);
      const x2 = o.position.x + (horiz ? ln / 2 : 0), z2 = o.position.z + (horiz ? 0 : ln / 2);
      mkBeam(x1, z1, x2, z2, o.position.y + pr.height / 2);
    });
    // الأعمدة: ضغط بالكامل مع شدّ محتمل بوجه واحد تحت الحمل الجانبي
    G.columns.children.forEach(o => {
      if (!o.userData || o.userData.kind !== 'column' || !o.geometry) return;
      const pr = o.geometry.parameters || {};
      const w2 = (pr.width || (pr.radiusTop * 2) || .4) * 1.03;
      const d2 = (pr.depth || (pr.radiusTop * 2) || .4) * 1.03;
      const h2 = (pr.height || 3) * .98;
      skin(w2, h2, d2, o.position.x, o.position.y, o.position.z, BLU,
        { title: '🔵 ضغط — العمود', kind: 'stress', grp: 'stress',
          rows: rowsFor('ضغط', 'جسم العمود كله')
            .concat([['تنبيه', 'تحت الزلزال ينقلب الوجهان: وجه بالشدّ ووجه بالضغط — '
              + 'ولهذا يُسلَّح العمود بأربعة أوجه ويُطوَّق عند طرفيه']]) });
    });
  }

  /* ==================== إنسان بطول 1.85 م للمقياس ==================== */
  let humanBuilt = false;
  function buildHuman() {
    if (humanBuilt) return; humanBuilt = true;
    const H = 1.85, sk = 0xffd9a0, cl = 0x2f6fb8;
    const mk = (geo, col, x, y, z, rz) => {
      const m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: col, clippingPlanes: [clip] }));
      m.position.set(x, y, z); if (rz) m.rotation.z = rz;
      G.human.add(m); return m;
    };
    const body = new T.Group();
    const part = (geo, col, x, y, z, rz) => {
      const m = mk(geo, col, x, y, z, rz); G.human.remove(m); body.add(m); return m;
    };
    part(new T.SphereGeometry(H * .062, 14, 12), sk, 0, H * .935, 0);           // الرأس
    part(new T.CylinderGeometry(H * .028, H * .034, H * .10, 10), sk, 0, H * .855, 0); // الرقبة
    part(new T.CylinderGeometry(H * .105, H * .092, H * .30, 12), cl, 0, H * .655, 0); // الجذع
    [-1, 1].forEach(sd => {
      part(new T.CylinderGeometry(H * .028, H * .024, H * .30, 8), cl,
        sd * H * .125, H * .655, 0, sd * .13);                                  // الذراعان
      part(new T.CylinderGeometry(H * .046, H * .036, H * .48, 10), 0x243b57,
        sd * H * .052, H * .255, 0);                                            // الساقان
      part(new T.BoxGeometry(H * .055, H * .022, H * .13), 0x11203a,
        sd * H * .052, H * .012, H * .022);                                     // القدمان
    });
    body.position.set(px(0) - L / 2 - 1.2, ROOM ? fb : (M.earth ? lv.existing : fb), pz(0) + B / 2 + 1.2);
    body.userData = { title: 'إنسان للمقياس — طول 1.85 م', kind: 'human', grp: 'human',
      rows: [['الطول', '1.85 م'], ['الفائدة', 'مقارنة أبعاد المبنى والعناصر بالحجم الطبيعي'],
        ['ارتفاع الطابق', hs.toFixed(2) + ' م = ' + (hs / 1.85).toFixed(2) + ' × طول الإنسان'],
        ['ارتفاع المبنى', (nf * hs).toFixed(2) + ' م = ' + (nf * hs / 1.85).toFixed(1) + ' × طوله']] };
    body.children.forEach(c => { c.userData = body.userData; picks.push(c); });
    G.human.add(body);
    G.human.userData.body = body;
  }
  /* ينقل الإنسان إلى منسوب طابق معيّن ليقارن ارتفاعه به */
  function humanTo(level) {
    buildHuman();
    const b = G.human.userData.body; if (!b) return;
    b.position.y = level;
  }

  /* ===================== وضع المختبر: الإنشائيات والتجربة ===================== */
  let labOn = false;
  function labApply(res, removed) {
    /* res = { "col|i|j|k": {after, mode_ar, before, modes} } — تلوين حسب نسبة الاستغلال */
    const key = o => {
      const u = o.userData || {};
      if (!u.gk) return null;
      return u.gk;
    };
    [G.columns, G.beams].forEach(grp => grp.children.forEach(o => {
      const k = key(o); if (!k || !o.material) return;
      if (o.userData._c0 === undefined) o.userData._c0 = o.material.color.getHex();
      if (removed && removed.indexOf(k) >= 0) { o.visible = false; o.userData._gone = true; return; }
      o.userData._gone = false;
      const r = res && res[k];
      if (!res) { o.material.color.setHex(o.userData._c0); o.userData.labRows = null; return; }
      const v = r ? r.after : 0;
      o.material.color.setHex(!r ? 0x2e4258 : v > 1 ? 0xf87171 : v > .7 ? 0xfbbf24 : 0x34d399);
      o.userData.labRows = r ? [['نسبة الاستغلال قبل الحذف', r.before.toFixed(2)],
        ['بعد الحذف', r.after.toFixed(2)], ['النمط الحاكم', r.mode_ar],
        ['انحناء', (r.modes.bending || 0).toFixed(2)], ['قص', (r.modes.shear || 0).toFixed(2)],
        ['التواء', (r.modes.torsion || 0).toFixed(2)],
        ['ضغط/انبعاج', (r.modes.buckling || 0).toFixed(2)],
        ['شد', (r.modes.tension || 0).toFixed(2)]] : null;
    }));
    labOn = !!res;
    applyVis();
  }

  /* ============================== التفاعل ============================== */
  const ray = new T.Raycaster(), mouse = new T.Vector2();
  let floorSel = 'all', anim = null;
  function applyVis() {
    [G.columns, G.beams, G.slabs, G.walls, G.rebar, G.extra, G.chairs, G.moments, G.defl]
      .forEach(grp => grp.children.forEach(o => {
        const u = o.userData || {};
        const okG = u.grp ? on[u.grp] !== 0 : true;
        o.visible = okG && !u._gone && (floorSel === 'all' || !u.floor || u.floor === floorSel);
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
    if (hit) {
      last = hit.object;
      const u = hit.object.userData;
      if (onPick) onPick(labOn && u.labRows
        ? Object.assign({}, u, { rows: u.labRows.concat(u.rows || []) }) : u);
    }
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
  /* ======================================================================
     ============== وضع البناء الواقعي — الموقع بمراحله الفعلية ==============
     ======================================================================
     ليس إظهار/إخفاء طبقات: هنا **ترتيب التنفيذ** كما يجري بالموقع —
     أرض عشب ← حفر ← ضنبان ← حديد أساس ← شدّة ← صبّ ← فكّ ← جسور أرضية ←
     ردم رملي ← أقفاص أعمدة ← شدّة ← صبّ ← فكّ ← طابوق ← شدّة سقف ودعامات ←
     حديد سقف ← صبّ ← الطابق التالي.
     كل مرحلة مجموعة مستقلة تُظهَر بالتراكم، فالمشهد ينمو مثل البناء الحقيقي. */
  const CO = {};                      // مجموعات المراحل: CO['كود المرحلة'] = Group
  let siteBuilt = false, siteOn = false;
  const skyDark = sc.background;

  function coGrp(k) {
    if (!CO[k]) { CO[k] = new T.Group(); CO[k].name = 'co_' + k; CO[k].visible = false;
      G.site.add(CO[k]); }
    return CO[k];
  }

  /* شمس ومساقط ظلال — تُنشأ مرة واحدة عند أول دخول لوضع البناء */
  let sun = null, sky = null, hemi2 = null;
  function siteLights() {
    if (sun) return;
    sun = new T.DirectionalLight(0xfff6e6, 0.95);
    sun.position.set(R * 1.1, R * 1.9, R * .7);
    sun.castShadow = true;
    const sh = sun.shadow;
    sh.mapSize.width = sh.mapSize.height = 2048;
    sh.camera.near = 0.5; sh.camera.far = R * 6;
    sh.camera.left = -R * 1.6; sh.camera.right = R * 1.6;
    sh.camera.top = R * 1.6; sh.camera.bottom = -R * 1.6;
    sh.bias = -0.0008;
    sun.visible = false; sc.add(sun);
    hemi2 = new T.HemisphereLight(0xbcd9ff, 0x7d6a4c, .52);
    hemi2.visible = false; sc.add(hemi2);
  }

  /* الأرض الطبيعية — لوح عشب واسع يستقبل الظلال.
     `holes` = فتحات الحُفَر: تُقصّ من اللوح فعلاً بـ THREE.Shape حتى تُرى
     الحفرة فتحةً لا خطاً على السطح. */
  function groundMesh(holes) {
    const C = window.CONSTRUCT;
    const w = Math.max(L, B) * 2.6;
    const sh = new T.Shape();
    sh.moveTo(-w / 2, -w / 2); sh.lineTo(w / 2, -w / 2);
    sh.lineTo(w / 2, w / 2); sh.lineTo(-w / 2, w / 2); sh.closePath();
    (holes || []).forEach(h2 => {
      const p = new T.Path();
      p.moveTo(h2.x - h2.w / 2, h2.z - h2.w / 2);
      p.lineTo(h2.x + h2.w / 2, h2.z - h2.w / 2);
      p.lineTo(h2.x + h2.w / 2, h2.z + h2.w / 2);
      p.lineTo(h2.x - h2.w / 2, h2.z + h2.w / 2);
      p.closePath(); sh.holes.push(p);
    });
    const geo = new T.ShapeGeometry(sh);
    // إحداثيات الخامة: ShapeGeometry تعطي uv بالمقياس العالمي، فتُقسَم على الخطوة
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, pos.getX(i) / 1.2, pos.getY(i) / 1.2);
    uv.needsUpdate = true;
    const m = new T.Mesh(geo, C.mat('grass', { rx: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = lv.existing - 0.01;
    m.receiveShadow = true;
    return m;
  }

  function buildGround(holes) {
    const gp = coGrp('ground');
    const gm = groundMesh(null);
    gm.userData = { title: 'الأرض الطبيعية', kind: 'site', grp: 'site',
      rows: [['المنسوب', lv.existing.toFixed(2) + ' م'],
        ['المرحلة', 'قبل أي عمل — الموقع كما تسلّمته']] };
    gp.add(gm); picks.push(gm);
    // نسخة مثقوبة تظهر مع مرحلة الحفر وتُخفي المصمتة
    const gd = coGrp('dig');
    const gh2 = groundMesh(holes);
    gh2.userData = { title: 'الأرض بعد الحفر', kind: 'site', grp: 'site',
      rows: [['الحُفَر', (holes || []).length],
        ['المرحلة', '١ · الحفر']] };
    gd.add(gh2); picks.push(gh2);
  }

  /* مواقع الأسس بالمشروع (مركز كل عمود + مقاس الأساس) */
  function footPts() {
    const out = [];
    const sizes = ((M.alts || {}).isolated || {}).sizes || [];
    const typ = ((M.alts || {}).isolated || {}).typical || {};
    (COLS || []).forEach((l, i) => {
      const s2 = sizes[i] || sizes[0] || {};
      out.push({ x: MAPX(l.x), z: MAPZ(l.y),
        B: s2.B || typ.B || 1.6, h: (typ.h || 400) / 1000, kind: l.kind });
    });
    return out;
  }

  /* ------------------------- المراحل واحدة واحدة ------------------------- */
  function buildSite() {
    if (siteBuilt) return; siteBuilt = true;
    const C = window.CONSTRUCT;
    if (!C) return;
    siteLights();
    const cb2 = md.col.b / 1000, ch2 = md.col.h / 1000;
    const fts = footPts();
    const depth = lv.existing - fb;                      // عمق الحفر
    const bl = 0.08;                                     // سماكة الضنبان
    buildGround(fts.map(f => ({ x: f.x, z: f.z, w: f.B + .6 })));

    // ١) الحفر — حفرة لكل أساس
    const gDig = coGrp('dig');
    fts.forEach((f, i) => {
      const w = f.B + .6;
      C.pit(gDig, w, w, depth, f.x, lv.existing, f.z, { clip: clip,
        info: { title: 'حفرة أساس F' + (i + 1), kind: 'site', grp: 'site',
          rows: [['المقاس', w.toFixed(2) + ' × ' + w.toFixed(2) + ' م (الأساس + 30 سم عمل)'],
            ['العمق', depth.toFixed(2) + ' م من الأرض الطبيعية'],
            ['المرحلة', '١ · الحفر']] } });
    });

    // ٢) الضنبان (خرسانة النظافة)
    const gBl = coGrp('blind');
    fts.forEach((f, i) => C.slab(gBl, f.B + .2, bl, f.B + .2, f.x, fb - bl / 2, f.z,
      C.mat('blinding', { clip: clip }),
      i ? null : { title: 'الضنبان — خرسانة النظافة', kind: 'site', grp: 'site',
        rows: [['السماكة', (bl * 1000).toFixed(0) + ' مم'],
          ['الغاية', 'سطح نظيف مستوٍ يُفرش عليه الحديد، ويمنع امتصاص التربة لماء الخلطة'],
          ['الامتداد', '10 سم خارج حدّ الأساس لكل جهة'],
          ['المرحلة', '٢ · الضنبان']] }));

    // ٣) حديد الأساس + أشاير الأعمدة (تُستنسخ من مجموعة التسليح لاحقاً)
    // ٤) شدّة الأسس
    const gFf = coGrp('form_f');
    fts.forEach((f, i) => C.formBox(gFf, f.B, f.B, f.h, f.x, fb + f.h / 2, f.z,
      { clip: clip, info: { title: 'شدّة الأساس F' + (i + 1), kind: 'site', grp: 'site',
        rows: [['اللوح', 'بليوود 25 مم'], ['الجنائب', 'كل 55 سم'],
          ['المرحلة', '٤ · شدّة الأسس']] } }));

    // ٥) صبّ الأسس
    const gFc = coGrp('conc_f');
    fts.forEach((f, i) => C.slab(gFc, f.B, f.h, f.B, f.x, fb + f.h / 2, f.z,
      C.mat('concrete', { rx: f.B / 1.2, clip: clip }),
      i ? null : { title: 'الأسس المصبوبة', kind: 'site', grp: 'site',
        rows: [['العدد', fts.length + ' أساس'],
          ['المقاس النموذجي', fts[0].B.toFixed(2) + ' × ' + fts[0].B.toFixed(2) +
            ' × ' + (fts[0].h * 1000).toFixed(0) + ' مم'],
          ['المرحلة', '٥ · صبّ الأسس']] }));

    // ٦) الجسور الأرضية (Tie / Ground beams) — تربط الأسس بمحيط المبنى
    const gGb = coGrp('gbeam'), gGbF = coGrp('form_gb');
    // الجسر الأرضي يجلس **تحت منسوب الأرضية مباشرة** لا فوق قاعدة الأساس،
    // فيُرى بالمشهد كما بالموقع ويحمل جدار الطابق الأرضي فوقه.
    const gbH = .45, gbW = .30, gbY = lv.existing - .05 - gbH / 2;
    const lines = [];
    for (let j = 0; j <= g.ny; j++) lines.push({ dir: 'x', len: L, x: 0, z: pz(ys[j]) });
    for (let i = 0; i <= g.nx; i++) lines.push({ dir: 'z', len: B, x: px(xs[i]), z: 0 });
    lines.forEach((ln, i) => {
      C.formBeam(gGbF, ln.len, gbW, gbH, ln.x, gbY, ln.z, ln.dir,
        { clip: clip, info: i ? null : { title: 'شدّة الجسور الأرضية', kind: 'site',
          grp: 'site', rows: [['المقطع', (gbW * 1000) + ' × ' + (gbH * 1000) + ' مم'],
            ['المرحلة', '٦ · شدّة الجسور الأرضية']] } });
      C.slab(gGb, ln.dir === 'x' ? ln.len : gbW, gbH, ln.dir === 'x' ? gbW : ln.len,
        ln.x, gbY, ln.z, C.mat('concrete', { rx: ln.len / 1.2, clip: clip }),
        i ? null : { title: 'الجسور الأرضية (Tie Beams)', kind: 'site', grp: 'site',
          rows: [['المقطع', (gbW * 1000) + ' × ' + (gbH * 1000) + ' مم'],
            ['الوظيفة', 'تربط الأسس فتمنع حركتها النسبية، وتحمل جدران الطابق الأرضي'],
            ['المرحلة', '٧ · صبّ الجسور الأرضية']] });
    });

    // ٨) الردم الرملي داخل شبكة الجسور
    const gSand = coGrp('sand');
    const sTop = lv.existing + .01;                      // سطح الردم = منسوب الأرضية
    const sm = C.slab(gSand, L - .1, Math.max(.25, sTop - fb), B - .1,
      0, (fb + sTop) / 2, 0, C.mat('sand', { rx: L / 1.2, clip: clip }),
      { title: 'الردم الرملي داخل الجسور', kind: 'site', grp: 'site',
        rows: [['السماكة', (sTop - fb).toFixed(2) + ' م'],
          ['الدكّ', 'طبقات 20–25 سم مدكوكة'],
          ['الغاية', 'يستقبل أرضية الطابق الأرضي ويمنع هبوطها'],
          ['المرحلة', '٨ · الردم والدكّ']] });
    sm.receiveShadow = true;

    // ٩–١٢) لكل طابق: أقفاص ← شدّة ← صبّ ← فكّ ← طابوق ← شدّة سقف ← صبّ
    for (let f2 = 1; f2 <= nf; f2++) {
      const z0 = f2 === 1 ? Math.max(gbY + gbH / 2, lv.existing) : (f2 - 1) * hs;
      const z1 = f2 * hs;
      const hcol = z1 - z0 - md.beams.x.h / 1000;
      // شدّة الأعمدة
      const gCf = coGrp('form_c' + f2), gCc = coGrp('conc_c' + f2);
      (COLS || []).forEach((l, i) => {
        const X = MAPX(l.x), Z = MAPZ(l.y);
        C.formBox(gCf, cb2, ch2, hcol, X, z0 + hcol / 2, Z,
          { clip: clip, info: i ? null : { title: 'شدّة الأعمدة — طابق ' + f2,
            kind: 'site', grp: 'site',
            rows: [['المقطع', md.col.b + ' × ' + md.col.h + ' مم'],
              ['الارتفاع', hcol.toFixed(2) + ' م'],
              ['المرحلة', '٩ · شدّة أعمدة الطابق ' + f2]] } });
        C.slab(gCc, cb2, hcol, ch2, X, z0 + hcol / 2, Z,
          C.mat('concrete', { rx: 2, clip: clip }),
          i ? null : { title: 'أعمدة مصبوبة — طابق ' + f2, kind: 'site', grp: 'site',
            rows: [['العدد', (COLS || []).length + ' عمود'],
              ['المقطع', md.col.b + ' × ' + md.col.h + ' مم'],
              ['المرحلة', '١٠ · صبّ أعمدة الطابق ' + f2]] });
      });
      // جدران الطابوق بين الأعمدة — على المحيط
      const gBr = coGrp('brick' + f2);
      const bh = hcol * .92, th2 = .24;
      const per = [];
      for (let i = 0; i < g.nx; i++) {
        per.push({ dir: 'x', len: g.sx - cb2, x: px((xs[i] + xs[i + 1]) / 2), z: pz(ys[0]) });
        per.push({ dir: 'x', len: g.sx - cb2, x: px((xs[i] + xs[i + 1]) / 2), z: pz(ys[g.ny]) });
      }
      for (let j = 0; j < g.ny; j++) {
        per.push({ dir: 'z', len: g.sy - ch2, x: px(xs[0]), z: pz((ys[j] + ys[j + 1]) / 2) });
        per.push({ dir: 'z', len: g.sy - ch2, x: px(xs[g.nx]), z: pz((ys[j] + ys[j + 1]) / 2) });
      }
      per.forEach((w2, i) => C.brickWall(gBr, w2.len, bh, th2, w2.x, z0 + bh / 2, w2.z,
        w2.dir, { clip: clip, info: i ? null : { title: 'جدران الطابوق — طابق ' + f2,
          kind: 'site', grp: 'site',
          rows: [['السماكة', (th2 * 1000) + ' مم'], ['الارتفاع', bh.toFixed(2) + ' م'],
            ['الموضع', 'بين الأعمدة على المحيط — جدار حشو لا يحمل'],
            ['المرحلة', '١١ · بناء الطابوق بالطابق ' + f2]] } }));
      // شدّة السقف: دك + عروق + دعامات
      const gDk = coGrp('deck' + f2);
      C.formDeck(gDk, L, B, 0, z1 - md.slab.h / 1000, 0, z1 - z0 - md.slab.h / 1000,
        { clip: clip, info: { title: 'شدّة السقف ودعاماته — طابق ' + f2,
          kind: 'site', grp: 'site',
          rows: [['الدكّ', 'بليوود 20 مم'], ['العروق', 'كل 60 سم'],
            ['الدعامات (الشمعات)', 'شبكة ~1.2 م'],
            ['الملاحظة', 'لا تُفكّ قبل بلوغ الخرسانة قوتها — عادةً 14 يوماً للسقوف'],
            ['المرحلة', '١٢ · شدّة سقف الطابق ' + f2]] } });
      // السقف والجسور مصبوبة
      const gSl = coGrp('conc_s' + f2);
      const bh2 = md.beams.x.h / 1000, bw2 = md.beams.x.b / 1000;
      lines.forEach(ln => C.slab(gSl, ln.dir === 'x' ? ln.len : bw2, bh2,
        ln.dir === 'x' ? bw2 : ln.len, ln.x, z1 - md.slab.h / 1000 - bh2 / 2 + bh2, ln.z,
        C.mat('concrete', { rx: ln.len / 1.2, clip: clip })));
      C.slab(gSl, L, md.slab.h / 1000, B, 0, z1 - md.slab.h / 2000, 0,
        C.mat('concrete', { rx: L / 1.5, clip: clip }),
        { title: (md.slab.name || 'السقف') + ' — طابق ' + f2, kind: 'site', grp: 'site',
          rows: [['السماكة', md.slab.h + ' مم'], ['النوع', md.slab.name || '—'],
            ['المرحلة', '١٣ · صبّ سقف الطابق ' + f2]] });
    }
    G.site.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  /* تفعيل وضع البناء: سماء نهارية وشمس وظلال، وإخفاء العرض التحليلي */
  function siteMode(v) {
    siteBuilt || buildSite();
    siteOn = !!v;
    G.site.visible = siteOn;
    if (sun) sun.visible = siteOn;
    if (hemi2) hemi2.visible = siteOn;
    // الإضاءة التحليلية تُطفأ بوضع البناء وإلا تراكمت مع الشمس وغسلت الألوان
    hemi1.visible = !siteOn; dl.visible = !siteOn; dl2.visible = !siteOn;
    sc.background = siteOn ? new T.Color(0xdce9f5) : skyDark;
    gh.visible = !siteOn;
    ['layers', 'walls', 'raft', 'isolated', 'piles', 'columns', 'beams', 'slabs',
     'canti', 'stairs', 'soil'].forEach(k => { if (G[k]) G[k].visible = !siteOn && on[k] !== 0; });
    if (siteOn) { G.rebar.visible = false; G.extra.visible = false; G.chairs.visible = false; }
    return { on: siteOn, stages: Object.keys(CO).length };
  }

  /* إظهار المراحل حتى مرحلة معيّنة (تراكمياً) */
  function siteUpTo(keys) {
    Object.entries(CO).forEach(([k, v]) => { v.visible = keys.indexOf(k) >= 0; });
  }


  const ret = {
    R: R, room: ROOM,
    group: (n, v) => { on[n] = v ? 1 : 0; if (G[n]) G[n].visible = !!v; applyVis(); return visStats(); },
    rebar: v => { if (v) buildRebar(); G.rebar.visible = v; G.extra.visible = v && on.extra !== 0;
      G.chairs.visible = v && on.chairs !== 0; applyVis(); return visStats(); },
    moments: v => { if (v) { buildMoments(); buildField(); }
      G.moments.visible = v; G.field.visible = v; applyVis(); },
    /* Mx أو My أو الحاكم — إشارة العزم تقرّر وجه الحديد، فالتبديل مهم */
    fieldMode: m => { fldMode = m || 'gov'; buildField();
      G.field.visible = G.moments.visible; applyVis(); return fldMode; },
    fieldInfo: () => (md.slab && md.slab.field) || null,
    /* موضع أول كرسي + كاميرا قريبة — للتحقق البصري من شكل الكرسي */
    chairSpot: () => { buildRebar();
      const m4 = new T.Matrix4(), v = new T.Vector3();
      let r = null;
      G.chairs.traverse(o => { if (r || !o.isInstancedMesh || !o.count) return;
        if ((o.userData && o.userData.grp) !== 'slabs') return;
        o.getMatrixAt(0, m4); v.setFromMatrixPosition(m4); r = [v.x, v.y, v.z]; });
      return r || [0, 0, 0];
    },
    camTo: (c, d) => { cam.position.set(c[0] + d * .75, c[1] + d * .45, c[2] + d * .75);
      ctl.target.set(c[0], c[1], c[2]); ctl.update(); anim = null; },
    /* تدقيق الكراسي: أبعد نقطة يبلغها أي كرسي مقابل حدّ الخرسانة */
    chairAudit: () => {
      buildRebar();
      let n = 0, out = 0, worst = 0, w = 0, ht = 0;
      const m4 = new T.Matrix4(), v = new T.Vector3();
      G.chairs.traverse(o => {
        if (!o.isInstancedMesh) return;
        o.geometry.computeBoundingBox();
        const g2 = o.geometry.boundingBox;
        w = Math.max(w, g2.max.x - g2.min.x); ht = Math.max(ht, g2.max.y - g2.min.y);
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); n++;
          const raft = (o.userData && o.userData.grp) === 'raft' && rf;
          const HX = raft ? rf.Lx / 2 : L / 2, HZ = raft ? rf.Ly / 2 : B / 2;
          const ex = Math.max(Math.abs(v.x) + (g2.max.x - g2.min.x) / 2 - HX,
                              Math.abs(v.z) + (g2.max.z - g2.min.z) / 2 - HZ);
          if (ex > 1e-4) { out++; worst = Math.max(worst, ex); }
        }
      });
      return { chairs: n, outside: out, worstOverhang_mm: +(worst * 1000).toFixed(1),
               chairWidth_mm: +(w * 1000).toFixed(0), chairHeight_mm: +(ht * 1000).toFixed(0),
               slab: [+L.toFixed(2), +B.toFixed(2)] };
    },
    /* صناديق إحاطة المجموعات — للتحقق أن كل رسم داخل الخرسانة لا خارجها */
    groupBox: k => {
      buildRebar();
      const bb = new T.Box3().setFromObject(G[k]);
      return { x: [+bb.min.x.toFixed(3), +bb.max.x.toFixed(3)],
               y: [+bb.min.y.toFixed(3), +bb.max.y.toFixed(3)],
               z: [+bb.min.z.toFixed(3), +bb.max.z.toFixed(3)],
               bx: [+(-L / 2).toFixed(3), +(L / 2).toFixed(3)],
               bz: [+(-B / 2).toFixed(3), +(B / 2).toFixed(3)],
               n: G[k].children.length };
    },
    /* حدود مغلّف العزوم مقابل حدود المبنى — للتحقق أن الرسم فوق الجسور لا خارجها */
    momentBox: () => {
      buildMoments();
      const bb = new T.Box3().setFromObject(G.moments);
      return { mx: [+bb.min.x.toFixed(2), +bb.max.x.toFixed(2)],
               mz: [+bb.min.z.toFixed(2), +bb.max.z.toFixed(2)],
               bx: [+(-L / 2).toFixed(2), +(L / 2).toFixed(2)],
               bz: [+(-B / 2).toFixed(2), +(B / 2).toFixed(2)] };
    },
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
    floor: v => {
      floorSel = v; applyVis();
      if (G.human.visible && v !== 'all') humanTo((v - 1) * hs);
      else if (G.human.visible) humanTo(ROOM ? fb : (M.earth ? lv.existing : fb));
    },
    human: v => { if (v) buildHuman(); G.human.visible = !!v; return !!v; },
    /* التربة الطبيعية تحت الحفر + الماء الجوفي + حبيبات الجلمود والسبيس */
    soil: v => { if (v) buildSoil(); G.soil.visible = !!v; applyVis();
      return { on: !!v, beds: (M.soil && M.soil.beds || []).length,
               grains: G.soil.children.filter(o => o.isInstancedMesh).length }; },
    /* مناطق الشدّ والضغط على الجسور والأعمدة */
    stress: v => { if (v) buildStress(); G.stress.visible = !!v; applyVis();
      return { on: !!v, n: G.stress.children.length }; },
    /* خلفية المخطط: بناء · إظهار · تحريك ومقياس ودوران ومنسوب وشفافية */
    planBuild: d => buildPlan(d),
    plan: v => { G.plan.visible = !!v && G.plan.children.length > 0; return G.plan.visible; },
    planHas: () => G.plan.children.length > 0,
    planXform: o => { Object.assign(planX, o || {}); applyPlanX(); return Object.assign({}, planX); },
    /* يوسّط المخطط على المبنى تلقائياً بمطابقة مركز الأعمدة المكتشَفة بمركز الشبكة */
    planAlign: (cx, cy) => {
      planX.dx = -(cx - L / 2); planX.dy = (cy - B / 2);
      applyPlanX(); return { dx: planX.dx, dy: planX.dy };
    },
    /* يحدّد عنصراً بمفتاحه (col|i|j|k) ويقرّب عليه ويعرض تفاصيله */
    focus: gk => {
      let hit = null;
      [G.columns, G.beams].forEach(grp => grp.children.forEach(o => {
        if (!hit && o.userData && o.userData.gk === gk && o.material) hit = o;
      }));
      if (!hit) return null;
      last = hit;
      const u = hit.userData;
      if (onPick) onPick(labOn && u.labRows
        ? Object.assign({}, u, { rows: u.labRows.concat(u.rows || []) }) : u);
      zoomTo(hit);
      return u.title;
    },
    /* removed = قائمة عناصر محذوفة (عنصر واحد أو أكثر) */
    lab: (rows, removed) => {
      if (!rows) return labApply(null, null);
      const res = {};
      rows.forEach(r => { res[r.key.join('|')] = r; });
      const rm = !removed ? null
        : (Array.isArray(removed[0]) ? removed : [removed]).map(r => r.join('|'));
      labApply(res, rm);
    },
    /* إبراز العناصر المرشّحة للحذف قبل تنفيذه (تحديد متعدد) */
    labMark: keys => {
      const set = new Set(keys || []);
      [G.columns, G.beams].forEach(grp => grp.children.forEach(o => {
        const u = o.userData || {};
        if (!u.gk || !o.material) return;
        if (u._c0 === undefined) u._c0 = o.material.color.getHex();
        if (set.has(u.gk)) { o.material.color.setHex(0xf59e0b); u._marked = true; }
        else if (u._marked) { o.material.color.setHex(u._c0); u._marked = false; }
      }));
      return set.size;
    },
    clip: v => { clip.constant = v; },
    /* شبح العمود المزمع إضافته: يتحرك مع مؤشّري X وY فترى مكانه قبل تثبيته */
    ghost: o => {
      while (G.ghost.children.length) {
        const c = G.ghost.children.pop();
        if (c.geometry) c.geometry.dispose();
      }
      if (!o) { G.ghost.visible = false; return null; }
      const X = MAPX(o.x), Z = MAPZ(o.y);
      const h = nf * hs - ft, yc = ft + h / 2;
      const gmat = new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: .40,
        depthWrite: false, clippingPlanes: [clip] });
      const geo = o.shape === 'circ'
        ? new T.CylinderGeometry((o.D || 400) / 2000, (o.D || 400) / 2000, h, 20)
        : new T.BoxGeometry((o.b || 400) / 1000, h, (o.h || o.b || 400) / 1000);
      const m = new T.Mesh(geo, gmat);
      m.position.set(X, yc, Z); G.ghost.add(m);
      const e = new T.LineSegments(new T.EdgesGeometry(geo),
        new T.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: .95 }));
      e.position.copy(m.position); G.ghost.add(e);
      // خيط شاقولي من الأساس إلى السقف يوضّح موضع المحور بدقّة
      const pts = [new T.Vector3(X, ft - 1.2, Z), new T.Vector3(X, nf * hs + 1.0, Z)];
      G.ghost.add(new T.Line(new T.BufferGeometry().setFromPoints(pts),
        new T.LineDashedMaterial({ color: 0x22d3ee, dashSize: .25, gapSize: .18 })));
      G.ghost.children[G.ghost.children.length - 1].computeLineDistances();
      G.ghost.visible = true;
      return { x: +X.toFixed(3), z: +Z.toFixed(3) };
    },
    zoomSel: () => zoomTo(last),
    reset: () => { anim = { t: 0, p0: cam.position.clone(), t0: ctl.target.clone(),
      p1: home.clone(), t1: mid.clone() }; },
    top: () => { anim = { t: 0, p0: cam.position.clone(), t0: ctl.target.clone(),
      p1: new T.Vector3(.01, R * 2.4, .01), t1: new T.Vector3(0, 0, 0) }; },
    /* تقريب على نقطة داخل السقف بنصف قطر معيّن (للفحص والاختبار) */
    look: (dist, y) => {
      const c = new T.Vector3(0, (y === undefined ? nf * hs : y), 0);
      anim = { t: 0, p0: cam.position.clone(), t0: ctl.target.clone(),
        p1: c.clone().add(new T.Vector3(dist * .8, dist * .5, dist * .8)), t1: c };
    },
    /* منظر من الأسفل — لرؤية بطن السقف: الأعصاب والبلوك ورؤوس الأعمدة */
    soffit: () => {
      const y = nf * hs;
      anim = { t: 0, p0: cam.position.clone(), t0: ctl.target.clone(),
        p1: new T.Vector3(R * .55, y - R * 1.15, R * .55), t1: new T.Vector3(0, y - hs * .35, 0) };
    },
    /* فحص: يرجع أسماء المجموعات التي تخرج أسياخها خارج حدود المبنى */
    outside: (mx, mz) => {
      const bad = [], bb = new T.Box3(), gb = new T.Box3(), m4 = new T.Matrix4();
      Object.entries(G).forEach(([gn, grp]) => grp.traverse(o => {
        if (!o.geometry || o === grp) return;
        o.geometry.computeBoundingBox();
        const g0 = o.geometry.boundingBox;
        bb.makeEmpty();
        if (o.isInstancedMesh) {
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, m4); gb.copy(g0).applyMatrix4(m4); bb.union(gb);
          }
          bb.applyMatrix4(o.matrixWorld);
        } else { bb.copy(g0).applyMatrix4(o.matrixWorld); }
        if (!isFinite(bb.min.x)) return;
        const over = Math.max(bb.max.x - mx, -mx - bb.min.x,
          bb.max.z - mz, -mz - bb.min.z);
        if (over > 0.35) bad.push([gn, (o.userData && (o.userData.title || o.userData.grp)) || o.type,
          +over.toFixed(2)]);
      }));
      return bad.slice(0, 40);
    },
    debug: () => ({ picks: picks.length, vis: picks.filter(o => o.visible && o.parent && o.parent.visible).length,
      groups: Object.fromEntries(Object.entries(G).map(([k, v2]) => [k, v2.children.length + '/' + v2.visible])) }),
    hit: (nx, ny) => { mouse.set(nx, ny); ray.setFromCamera(mouse, cam);
      const h = ray.intersectObjects(picks.filter(o => o.visible && o.parent && o.parent.visible), false)[0];
      return h ? h.object.userData.title : null; },
    cam: () => [+cam.position.x.toFixed(3), +cam.position.y.toFixed(3), +cam.position.z.toFixed(3)],
    canvas: () => rn.domElement,
    /* وضع البناء الواقعي: سماء نهارية وشمس وظلال وخامات موقع */
    site: v => siteMode(v),
    siteStages: () => Object.keys(CO),
    siteUpTo: keys => siteUpTo(keys),
    /* ================= سيناريو فيديو البناء =================
       **ترتيب التنفيذ الحقيقي** لا إظهار طبقات: كل مشهد يضيف ما يُنفَّذ فعلاً
       بالموقع بذلك اليوم، والمشهد ينمو بالتراكم مثل البناء. */
    movieScenes: () => {
      siteBuilt || buildSite();
      const H = nf * hs, digD = lv.existing - fb;
      const P = (a, b2, c2) => new T.Vector3(a, b2, c2);
      const sc2 = [];
      let acc = [];
      const add = (o) => {
        acc = acc.concat(o.add || []);
        sc2.push(Object.assign({ dur: 3.0, spin: 0, site: true, stages: acc.slice() }, o));
      };
      /* الكاميرا بزاوية **ارتفاع** حقيقية حول نقطة النظر بدل ارتفاع مطلق —
         وإلا صارت اللقطة أفقية فلا تُرى داخل الحُفَر ولا تُقرأ المساقط.
         t = نقطة النظر · d = البعد بمضاعفات نصف قطر المبنى · az = السمت
         · el = زاوية الارتفاع بالدرجات (25 قريبة · 55 علوية) */
      const eye = (t, d, az, el) => {
        const D = R * d, e = (el === undefined ? 32 : el) * Math.PI / 180;
        const a = az === undefined ? .8 : az;
        return P(t.x + Math.cos(a) * D * Math.cos(e), t.y + D * Math.sin(e),
                 t.z + Math.sin(a) * D * Math.cos(e));
      };

      const T0 = P(0, lv.existing, 0), TF = P(0, fb + .3, 0);
      add({ id: 'land', title: '١ · الأرض الطبيعية', sub: 'الموقع قبل أي عمل',
        add: ['ground'], cam: eye(T0, 1.15, .8, 22), look: T0, dur: 3.4, spin: .35 });
      add({ id: 'dig', title: '٢ · الحفر', sub: 'حفرة لكل أساس بعمق ' + digD.toFixed(2) + ' م',
        add: ['dig'], drop: ['ground'],   // الأرض المصمتة تُستبدل بالمثقوبة
        cam: eye(TF, .85, .8, 48), look: TF, dur: 3.6, spin: .25 });
      add({ id: 'blind', title: '٣ · الضنبان — خرسانة النظافة',
        sub: 'سطح نظيف يُفرش عليه الحديد ويمنع امتصاص التربة لماء الخلطة',
        add: ['blind'], cam: eye(TF, .45, 1.9, 42), look: TF, dur: 3.4 });
      add({ id: 'reb_f', title: '٤ · حديد الأسس وأشاير الأعمدة',
        sub: 'الشبكة السفلية وأقفاص الانتظار قبل الشدّة',
        add: [], rebar: ['isolated', 'raft', 'piles'],
        cam: eye(TF, .55, 2.4, 40), look: TF, dur: 3.8, spin: .3 });
      add({ id: 'form_f', title: '٥ · شدّة الأسس',
        sub: 'بليوود 25 مم بجنائب كل 55 سم', add: ['form_f'], rebar: true,
        rebar: ['isolated', 'raft', 'piles'], cam: eye(TF, .62, 0.5, 38), look: TF, dur: 3.2 });
      add({ id: 'conc_f', title: '٦ · صبّ الأسس', sub: 'ثم تُفكّ الشدّة',
        add: ['conc_f'], rebar: false, drop: ['form_f'],
        cam: eye(TF, .75, .8, 44), look: TF, dur: 3.2, spin: .25 });
      add({ id: 'form_gb', title: '٧ · شدّة الجسور الأرضية',
        sub: 'الجسور الرابطة تمنع حركة الأسس النسبية', add: ['form_gb'],
        cam: eye(P(0, fb + .5, 0), .85, 1.2, 34), look: P(0, fb + .5, 0), dur: 3.0 });
      add({ id: 'gbeam', title: '٨ · صبّ الجسور الأرضية', sub: 'وفكّ الشدّة',
        add: ['gbeam'], drop: ['form_gb'],
        cam: eye(P(0, fb + .5, 0), .95, 2.1, 40), look: P(0, fb + .5, 0), dur: 3.0 });
      add({ id: 'sand', title: '٩ · الردم الرملي والدكّ',
        sub: 'طبقات 20–25 سم مدكوكة تستقبل أرضية الطابق الأرضي',
        add: ['sand'], cam: eye(P(0, fb + .6, 0), .9, 2.8, 46), look: P(0, fb + .6, 0),
        dur: 3.2, spin: .25 });

      for (let f2 = 1; f2 <= nf; f2++) {
        const yTop = f2 * hs, yMid = (f2 - .5) * hs;
        add({ id: 'cage' + f2, title: '١٠ · أقفاص أعمدة الطابق ' + f2,
          sub: 'الحديد الطولي والأتاري بعكفة زلزالية 135°',
          add: [], rebar: ['columns'], floor: f2,
          cam: eye(P(0, yMid, 0), .85, .9, 26), look: P(0, yMid, 0), dur: 3.0, spin: .3 });
        add({ id: 'formc' + f2, title: '١١ · شدّة أعمدة الطابق ' + f2,
          sub: 'ألواح بليوود بجنائب — تُفكّ بعد ٢٤–٤٨ ساعة',
          add: ['form_c' + f2], rebar: ['columns'], floor: f2,
          cam: eye(P(0, yMid, 0), .95, 1.6, 24), look: P(0, yMid, 0), dur: 2.8 });
        add({ id: 'concc' + f2, title: '١٢ · صبّ أعمدة الطابق ' + f2, sub: 'وفكّ الشدّة',
          add: ['conc_c' + f2], drop: ['form_c' + f2], rebar: false, floor: 'all',
          cam: eye(P(0, yMid, 0), 1.15, 2.5, 28), look: P(0, yMid, 0), dur: 2.8 });
        add({ id: 'brick' + f2, title: '١٣ · بناء الطابوق — طابق ' + f2,
          sub: 'جدار حشو بين الأعمدة لا يحمل', add: ['brick' + f2],
          cam: eye(P(0, yMid, 0), 1.30, .4, 24), look: P(0, yMid, 0), dur: 3.4, spin: .3 });
        add({ id: 'deck' + f2, title: '١٤ · شدّة سقف الطابق ' + f2,
          sub: 'دكّ + عروق كل 60 سم + دعامات (شمعات) بشبكة 1.2 م',
          add: ['deck' + f2],
          cam: eye(P(0, yTop - hs * .35, 0), 1.15, 2.0, 26),
          look: P(0, yTop - hs * .35, 0), dur: 3.2 });
        add({ id: 'rebs' + f2, title: '١٥ · حديد السقف والجسور — طابق ' + f2,
          sub: 'الفرش ثم الغطاء ثم العلوي فوق المساند',
          add: [], rebar: ['beams', 'slabs'], extra: true, floor: f2,
          cam: eye(P(0, yTop, 0), .95, 1.1, 42), look: P(0, yTop, 0), dur: 3.2, spin: .3 });
        add({ id: 'concs' + f2, title: '١٦ · صبّ سقف الطابق ' + f2,
          sub: 'ولا تُفكّ الدعامات قبل ١٤ يوماً',
          add: ['conc_s' + f2], drop: ['deck' + f2], rebar: false, floor: 'all',
          cam: eye(P(0, yTop - hs * .2, 0), 1.25, 2.9, 34),
          look: P(0, yTop - hs * .2, 0), dur: 3.0 });
      }
      if (M.stairs && (M.stairs.flights || []).length) {
        const bb = (M.stairs.flights[0].bbox) || [0, 0, 1, 1];
        const sx2 = MAPX((bb[0] + bb[2]) / 2), sz2 = MAPZ((bb[1] + bb[3]) / 2);
        add({ id: 'stair', title: 'الدرج وتسليحه',
          sub: 'الرئيسي سفلي · التوزيع فوقه · الشنّاطات علوية عند الانكسار',
          site: false, show: ['columns', 'beams', 'stairs'], rebar: true, floor: 1,
          cam: P(sx2 + R * .8, hs * 1.5, sz2 + R * .8), look: P(sx2, hs * .55, sz2),
          dur: 4.2, spin: .35 });
      }
      if (M.canti && M.canti.on) {
        const it0 = (M.canti.items || [])[0] || {};
        const sg = (it0.side || 'x+').indexOf('-') > 0 ? -1 : 1;
        const ax0 = (it0.side || 'x+')[0] === 'z';
        const cxx = ax0 ? 0 : sg * (L / 2 + (it0.L || 1) / 2);
        const czz = ax0 ? -sg * (B / 2 + (it0.L || 1) / 2) : 0;
        const cy2 = nf * hs - hs * .25;
        add({ id: 'canti', title: 'الكانتيليفر — الشناشيل',
          sub: 'الحديد **كله علوي** — الأصفر شدّ والأزرق انكماش',
          site: false, show: null, rebar: true, floor: 'all', groups: { canti: 1 },
          cam: P(cxx * 1.7 + (ax0 ? R * .5 : 0), cy2 + hs * .55,
                 czz * 1.7 + (ax0 ? 0 : R * .5)),
          look: P(cxx, cy2, czz), dur: 4.0, spin: .3 });
      }
      add({ id: 'xray', title: 'الأشعة — الحديد داخل الخرسانة',
        sub: 'الخرسانة شفافة والتسليح كاملاً', site: false, show: null,
        rebar: true, floor: 'all', xray: true,
        cam: P(R * 1.15, H * .75, R * 1.15), look: P(0, H / 2, 0), dur: 4.2, spin: .5 });
      add({ id: 'full', title: 'المبنى كاملاً', sub: (M.summary && M.summary[0]) || '',
        site: true, add: [], rebar: false, floor: 'all', xray: false,
        cam: eye(P(0, H * .42, 0), 1.6, .8, 24), look: P(0, H * .42, 0),
        dur: 6.0, spin: 1.0 });
      // «drop» يشيل مرحلة من التراكم (فكّ الشدّة) — يُطبَّق على ما بعده
      let seen = [];
      sc2.forEach(x => {
        seen = seen.concat(x.add || []).filter(k => (x.drop || []).indexOf(k) < 0);
        x.stages = seen.slice();
      });
      return sc2;
    },
    /* ينفّذ مشهداً: يضبط الطبقات والكاميرا فوراً (بلا انتقال) أو بانتقال ناعم */
    playScene: (s2, smooth) => {
      const all = ['soil', 'layers', 'raft', 'isolated', 'piles', 'walls', 'columns',
        'beams', 'slabs', 'canti', 'stairs', 'rebar', 'extra', 'chairs'];
      if (s2.site) {
        // ---- وضع البناء: الموقع بمراحله، والعرض التحليلي مُطفأ ----
        siteMode(true);
        siteUpTo(s2.stages || []);
        // الترتيب مهمّ: floor() تستدعي applyVis التي تعيد ضبط الرؤية،
        // فتُنفَّذ **قبل** فلترة التسليح وإلا محت الفلترة.
        if (s2.floor !== undefined) API.floor(s2.floor);
        if (s2.rebar) {
          buildRebar();
          G.rebar.visible = true; G.extra.visible = !!s2.extra;
          G.chairs.visible = false;
          // يُعرض حديد **العنصر الجاري تنفيذه** فقط: بمرحلة أقفاص الأعمدة
          // لا معنى لظهور شبكة السقف — الموقع ما بناها بعد.
          const want = s2.rebar === true ? null
            : (Array.isArray(s2.rebar) ? s2.rebar : [s2.rebar]);
          [G.rebar, G.extra].forEach(gr => gr.children.forEach(o => {
            o.visible = !want || want.indexOf((o.userData || {}).grp) >= 0;
          }));
        } else { G.rebar.visible = false; G.extra.visible = false; G.chairs.visible = false; }
        if (G.stairs) G.stairs.visible = false;
      } else {
        siteMode(false);
        // التربة والتسليح يُبنيان بكسل عند أول طلب — فالمشهد يطلبهما صراحةً
        const wantSoil = !s2.show || s2.show.indexOf('soil') >= 0;
        if (wantSoil) API.soil(true);
        if (s2.xray !== undefined) { API.xray(!!s2.xray); }
        if (s2.rebar !== undefined) { API.rebar(!!s2.rebar); }
        if (s2.floor !== undefined) API.floor(s2.floor);
        if (s2.show) {
          all.forEach(g => { if (g !== 'rebar') API.group(g, s2.show.indexOf(g) >= 0); });
        } else {
          all.forEach(g => API.group(g, true));
        }
        if (s2.groups) Object.entries(s2.groups).forEach(([g, v]) => API.group(g, !!v));
        if (!wantSoil) API.group('soil', false);
      }
      if (s2.cam) {
        if (smooth) anim = { t: 0, p0: cam.position.clone(), t0: ctl.target.clone(),
          p1: s2.cam.clone(), t1: (s2.look || mid).clone() };
        else { cam.position.copy(s2.cam); ctl.target.copy(s2.look || mid); anim = null; }
      }
    },
    /* دوران بطيء حول المبنى أثناء المشهد */
    orbit: (rad) => {
      const t2 = ctl.target, r2 = Math.hypot(cam.position.x - t2.x, cam.position.z - t2.z);
      const a = Math.atan2(cam.position.z - t2.z, cam.position.x - t2.x) + rad;
      cam.position.set(t2.x + r2 * Math.cos(a), cam.position.y, t2.z + r2 * Math.sin(a));
      cam.lookAt(t2);
    },
    stats: () => visStats()
  };
  const API = ret;
  return ret;
}
