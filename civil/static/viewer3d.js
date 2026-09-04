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
              'rebar', 'extra', 'chairs', 'moments', 'punch', 'defl', 'human', 'plan'];
  const G = {}; GN.forEach(k => { G[k] = new T.Group(); G[k].name = k; sc.add(G[k]); });
  G.moments.visible = G.punch.visible = G.defl.visible = G.rebar.visible = G.extra.visible =
    G.chairs.visible = G.human.visible = G.plan.visible = false;
  const on = {}; GN.forEach(k => on[k] = 1);
  const picks = [];
  const px = v => v - L / 2, pz = v => -(v - B / 2);
  const SHAPE_AR = { rect: 'مستطيل', circ: 'دائري (O)', L: 'زاوية (L)', T: 'تي (T)' };
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
          gk: ROOM ? null : 'col|' + l.i + '|' + l.j + '|' + (s + 1),
          rows: [['الموقع', l.kind || '—'],
            ['استمرارية الجسور', l.cont_x === undefined ? '—' :
              ('X ' + (l.cont_x ? 'مستمر' : 'طرفي') + ' · Y ' + (l.cont_y ? 'مستمر' : 'طرفي'))],
            ['المقطع', md.col.b + ' × ' + md.col.h + ' مم'],
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
      }
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
        const inf = k ? null : { title: 'قلبة درج', kind: 'stair', grp: 'slabs', floor: s,
          rows: f.rows.map(r => [r[0], r[1]]) };
        for (let i = 0; i < f.steps; i++) {
          const t = (i + 0.5) / f.steps - 0.5;
          const y = z - hs + rise * (i + 1);
          box(G.slabs, f.dir === 'x' ? tread : f.width, rise,
            f.dir === 'x' ? f.width : tread,
            cx + (f.dir === 'x' ? t * along : 0), y - rise / 2,
            cz + (f.dir === 'x' ? 0 : t * along), 0xb9c9dc, 1, i ? null : inf);
        }
      });
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
    }
  }

  /* ============================== التسليح ============================== */
  const STEEL = 0xe8443a, TIE = 0xff9f1c, EXTRA = 0x22d3ee, CHAIR = 0x86efac,
    DOWEL = 0xc084fc;
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
  /* ذيلا العكفة 135° عند ركن السوار (ACI 25.3.2 — امتداد 6db ≥ 75 مم) */
  function hookGeo(w, d, db, ext) {
    const e = Math.max(ext || 0, .075), s2 = e / Math.SQRT2, pts = [];
    const mk = a => new T.TubeGeometry(new T.CatmullRomCurve3(a, false, 'catmullrom', 0),
      6, db / 2000, 5, false);
    pts.push(new T.Vector3(w / 2, 0, d / 2), new T.Vector3(w / 2 - s2, 0, d / 2 - s2));
    return mk(pts);
  }
  function addRings(w, d, db, pos, info, col, grp, rot, hookExt) {
    if (!pos.length) return null;
    const geo = ringGeo(w, d, db);
    const hg = hookGeo(w, d, db, hookExt);
    if (rot === 'x') { geo.rotateX(Math.PI / 2); hg.rotateX(Math.PI / 2); }
    if (rot === 'z') { geo.rotateX(Math.PI / 2); geo.rotateY(Math.PI / 2);
      hg.rotateX(Math.PI / 2); hg.rotateY(Math.PI / 2); }
    const im = inst(geo, col || TIE, pos, info, grp,
      pos.length * 2 * (w + d) * Math.PI * Math.pow(db / 2000, 2) * 7850);
    inst(hg, col || TIE, pos, null, grp, 0,
      { grp: (info && info.grp) || CURG, floor: info && info.floor });
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
    const pts = [
      new T.Vector3(-t2 - run - foot, 0, 0), new T.Vector3(-t2 - run, 0, 0),
      new T.Vector3(-t2, ht, 0), new T.Vector3(t2, ht, 0),
      new T.Vector3(t2 + run, 0, 0), new T.Vector3(t2 + run + foot, 0, 0)];
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', 0),
      kind === 's135' ? 28 : 14, db / 2000, 5, false);
  }
  /* mesh = {sx,sz,x0,z0} خطوط الشبكة السفلى — تُثبّت عليها أقدام الكراسي */
  function addChairs(x0, z0, lx, lz, sp, ht, db, y, info, ch, snap) {
    const pos = [], kind = (ch && ch.kind) || 'z90';
    // القدم بطول نصف تباعد الشبكة على الأقل حتى تعبر سيخاً سفلياً وتستند عليه
    const foot = snap ? Math.max((ch && ch.foot) || 80, snap.sx / 2) : ((ch && ch.foot) || 80);
    const at = (v, v0, st) => st ? v0 + Math.round((v - v0) / st) * st : v;   // تثبيت على خط سيخ
    for (let a = sp / 2; a < lx; a += sp) for (let b2 = sp / 2; b2 < lz; b2 += sp) {
      const X = snap ? at(x0 + a, snap.x0, snap.sx) : x0 + a;
      const Z = snap ? at(z0 + b2, snap.z0, snap.sz) : z0 + b2;
      if (X < x0 || X > x0 + lx || Z < z0 || Z > z0 + lz) continue;
      pos.push([X, y, Z]);
    }
    const each = (ch && ch.len_each) || (2 * ht + .3);
    return inst(chairGeo(kind, ht, db, ch && ch.top_run, foot), CHAIR, pos, info,
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
          { x0: -rf.Lx / 2, z0: -rf.Ly / 2, sx: rf.bottom.s / 1000, sz: rf.bottom.s / 1000 });
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
        addRings(cb - 2 * cvr, ch - 2 * cvr, cr.tie_db, tp,
          { title: 'أتاري العمود بعكفة 135° — طابق ' + (s + 1), kind: 'rebar', floor: s + 1,
            rows: [['الوسط', cr.tie_label], ['التطويق', cr.conf_label || '—'],
              ['العكفة', (cr.hook && cr.hook.label) || 'عكفة 135°'], ['العدد', tp.length]],
          }, null, null, null, cr.hook ? cr.hook.ext / 1000 : .075);
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
      const inf = t => ({ title: t + ' — ' + ttl, kind: 'rebar', floor: floor,
        rows: [['المقطع', Math.round(bw * 1000) + ' × ' + Math.round(hB * 1000) + ' مم'],
          ['سفلي', reb.bottom.label], ['علوي', reb.top.label], ['الأساور', sdb.label],
          ['الغطاء', Math.round(cv * 1000) + ' مم']] });
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
      addRings(dir === 'x' ? bw - 2 * cv : hB - 2 * cv, dir === 'x' ? hB - 2 * cv : bw - 2 * cv,
        sdb.db, stp, inf('أساور بعكفة 135°'), null, null, dir === 'x' ? 'x' : 'z',
        Math.max(6 * sdb.db / 1000, .075));
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
            if (zn.dir === 'x')
              addChairs(-L / 2, pz(zn.at) - w / 2, L, w, sch.spacing, htC, sch.db, yBase,
                zi ? null : cinf(sch.n), sch, snap);
            else
              addChairs(px(zn.at) - w / 2, -B / 2, w, B, sch.spacing, htC, sch.db, yBase,
                null, sch, snap);
          });
        } else {
          addChairs(-L / 2, -B / 2, L, B, sch.spacing, htC, sch.db, yBase, cinf(sch.n), sch, snap);
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
      if (removed && k === removed) { o.visible = false; o.userData._gone = true; return; }
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
    floor: v => {
      floorSel = v; applyVis();
      if (G.human.visible && v !== 'all') humanTo((v - 1) * hs);
      else if (G.human.visible) humanTo(ROOM ? fb : (M.earth ? lv.existing : fb));
    },
    human: v => { if (v) buildHuman(); G.human.visible = !!v; return !!v; },
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
    lab: (rows, removed) => {
      if (!rows) return labApply(null, null);
      const res = {};
      rows.forEach(r => { res[r.key.join('|')] = r; });
      labApply(res, removed ? removed.join('|') : null);
    },
    clip: v => { clip.constant = v; },
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
    stats: () => visStats()
  };
}
