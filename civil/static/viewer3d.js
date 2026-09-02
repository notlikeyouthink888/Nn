/* عارض ثلاثي الأبعاد لطبقات الردم والأسس — Three.js (مستضاف محلياً) */
function Viewer3D(el, M, onPick) {
  if (!window.THREE) { el.innerHTML = '<div class="note">تعذّر تحميل محرك العرض ثلاثي الأبعاد</div>'; return; }
  const g = M.grid, L = g.L, B = g.B, d = M.design || {}, st = (M.earth && M.earth.stack) || [];
  const W = el.clientWidth || 900, H = Math.max(420, Math.round(W * 0.52));
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x0a1020);
  sc.fog = new THREE.Fog(0x0a1020, 60, 190);
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  const R = Math.max(L, B);
  cam.position.set(R * 1.15, R * 0.55, R * 1.35);
  const rn = new THREE.WebGLRenderer({ antialias: true });
  rn.setSize(W, H); rn.setPixelRatio(Math.min(2, devicePixelRatio));
  rn.localClippingEnabled = true;
  el.innerHTML = ''; el.appendChild(rn.domElement);
  const ctl = new THREE.OrbitControls(cam, rn.domElement);
  ctl.target.set(0, -0.8, 0); ctl.enableDamping = true; ctl.dampingFactor = .08;
  sc.add(new THREE.HemisphereLight(0xcfe4ff, 0x2b2418, 0.95));
  const dl = new THREE.DirectionalLight(0xffffff, 0.75); dl.position.set(R, R * 1.5, R * .7); sc.add(dl);
  const grid = new THREE.GridHelper(R * 2.2, 22, 0x334867, 0x1c2942);
  grid.position.y = (M.earth && M.earth.levels ? M.earth.levels.existing : -2) - 0.02;
  sc.add(grid);

  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), R);
  const picks = [];
  const box = (w, h, dp, x, y, z, col, op, info, clipped) => {
    const m = new THREE.MeshLambertMaterial({
      color: col, transparent: op < 1, opacity: op,
      clippingPlanes: clipped === false ? [] : [clip], side: THREE.DoubleSide
    });
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), m);
    o.position.set(x, y, z); o.userData = info || {}; sc.add(o);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry),
      new THREE.LineBasicMaterial({ color: 0x0b1220, transparent: true, opacity: .35 }));
    e.position.copy(o.position); sc.add(e);
    if (info) picks.push(o);
    return o;
  };
  const cyl = (r, h, x, y, z, col, info) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18),
      new THREE.MeshLambertMaterial({ color: col, clippingPlanes: [clip] }));
    o.position.set(x, y, z); o.userData = info || {}; sc.add(o);
    if (info) picks.push(o); return o;
  };
  const px = v => v - L / 2, pz = v => -(v - B / 2);

  // ---------- طبقات الردم والتربة ----------
  st.forEach(s => {
    if (s.kind === 'footing') return;                     // تُرسم كعناصر فعلية
    const wide = (s.kind === 'boulder' || s.kind === 'subbase') ? 0.4 : 0.15;
    box(L + wide, Math.max(s.t, 0.02), B + wide, 0, (s.bottom + s.top) / 2, 0,
      new THREE.Color(s.color), s.kind === 'finish' ? 1 : .93,
      { title: s.name, rows: [['المنسوب', s.bottom.toFixed(2) + ' → ' + s.top.toFixed(2) + ' م'],
        ['السماكة', s.t.toFixed(2) + ' م'], ['الحجم', s.volume.toFixed(1) + ' م³'],
        ['عدد الطبقات', s.layers ? s.layers + ' طبقة × ' + (s.layer_t * 100).toFixed(0) + ' سم' : '—'],
        ['الكمية المشتراة', s.buy ? s.buy.toFixed(1) + ' م³ (سائب)' : '—']] });
  });

  // ---------- الأسس ----------
  const lv = M.earth.levels, fb = lv.found_bot, ft = lv.found_top;
  const cb = (M.col.b || 400) / 1000, ch = (M.col.h || 500) / 1000;
  if (d.mode === 'raft' && d.raft) {
    box(d.raft.Lx, d.raft.h / 1000, d.raft.Ly, 0, fb + d.raft.h / 2000, 0, 0x3f6fa5, 1,
      { title: 'الحصيرة (Raft)', rows: [['الأبعاد', d.raft.Lx.toFixed(2) + ' × ' + d.raft.Ly.toFixed(2) + ' م'],
        ['السماكة', d.raft.h.toFixed(0) + ' مم'], ['ضغط التربة', d.raft.q_serv.toFixed(1) + ' / ' + d.raft.qa.toFixed(0) + ' kPa'],
        ['التسليح العلوي', d.raft.top.label], ['التسليح السفلي', d.raft.bottom.label],
        ['الخرسانة', d.raft.conc.toFixed(1) + ' م³']] });
  }
  (M.loads || []).forEach((l, k) => {
    const X = px(l.x), Z = pz(l.y);
    if (d.mode === 'isolated' && d.sizes) {
      const s = d.sizes[k], h = (d.typical.h || 500) / 1000;
      box(s.B, h, s.B, X, fb + h / 2, Z, 0x4a7fb5, 1,
        { title: 'أساس منفرد F' + (k + 1) + ' — ' + l.kind, rows: [
          ['الأبعاد', s.B.toFixed(2) + ' × ' + s.B.toFixed(2) + ' م'], ['السماكة', h * 1000 + ' مم'],
          ['حمل الخدمة', l.P.toFixed(0) + ' kN'], ['الحمل المعامل', l.Pu.toFixed(0) + ' kN'],
          ['ضغط التربة', (l.P / (s.B * s.B)).toFixed(1) + ' kPa'],
          ['التسليح', d.typical.bars_label]] });
    } else if (d.mode === 'piles' && d.pile) {
      const p = d.pile, sp = p.spacing;
      box(p.cap.B, p.cap.h, p.cap.L, X, fb + p.cap.h / 2, Z, 0x4a7fb5, 1,
        { title: 'هامة ركائز PC' + (k + 1), rows: [['الأبعاد', p.cap.B.toFixed(2) + ' × ' + p.cap.L.toFixed(2) + ' م'],
          ['السماكة', (p.cap.h * 1000).toFixed(0) + ' مم'], ['عدد الركائز', p.n],
          ['حمل الخدمة', l.P.toFixed(0) + ' kN'], ['قدرة المجموعة', p.Qgroup.toFixed(0) + ' kN']] });
      let n = 0;
      for (let rr = 0; rr < p.rows; rr++) for (let cc = 0; cc < p.cols; cc++) {
        if (n >= p.n) break;
        const ax = X + (cc - (p.cols - 1) / 2) * sp, az = Z + (rr - (p.rows - 1) / 2) * sp;
        cyl(p.D / 2, p.L, ax, fb - p.L / 2, az, 0x8b5cf6,
          { title: 'ركيزة D' + (p.D * 1000).toFixed(0) + ' مم', rows: [['الطول', p.L + ' م'],
            ['القدرة المفردة', p.Qall.toFixed(0) + ' kN'], ['مقاومة الجانب Qs', p.Qs.toFixed(0) + ' kN'],
            ['مقاومة القاعدة Qb', p.Qb.toFixed(0) + ' kN'], ['كفاءة المجموعة', p.eff.toFixed(2)]] });
        n++;
      }
    }
    // عمود
    box(cb, Math.max(0.6, -ft + 0.4), ch, X, ft + Math.max(0.6, -ft + 0.4) / 2, Z, 0x93a4c0, 1,
      { title: 'عمود ' + (k + 1) + ' — ' + l.kind, rows: [['المقطع', M.col.b + ' × ' + M.col.h + ' مم'],
        ['المساحة المؤثرة', l.area.toFixed(2) + ' م²'], ['حمل الخدمة', l.P.toFixed(0) + ' kN'],
        ['الحمل المعامل Pu', l.Pu.toFixed(0) + ' kN']] });
  });

  // ---------- التفاعل ----------
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  rn.domElement.addEventListener('pointerdown', ev => {
    const r = rn.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObjects(picks, false)[0];
    if (hit && onPick) onPick(hit.object.userData);
  });
  let alive = true;
  (function loop() { if (!alive || !document.body.contains(rn.domElement)) { alive = false; return; }
    ctl.update(); rn.render(sc, cam); requestAnimationFrame(loop); })();
  return {
    clip: v => { clip.constant = v; },
    xray: on => sc.traverse(o => { if (o.isMesh && o.material && o.userData && o.userData.title) {
      o.material.transparent = on; o.material.opacity = on ? 0.35 : (o.userData.title.indexOf('طبق') >= 0 ? .93 : 1); } }),
    reset: () => { cam.position.set(R * 1.15, R * .55, R * 1.35); ctl.target.set(0, -0.8, 0); },
    top: () => { cam.position.set(0.01, R * 2.2, 0.01); ctl.target.set(0, -1, 0); },
    R: R
  };
}
