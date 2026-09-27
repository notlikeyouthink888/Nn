/* عارض قسم الأوتوكاد ثلاثي الأبعاد — المبنى كما رُكّب من لوحات الملف.
   مستقل عن viewer3d.js (ذاك موحَّد: مقطع عمود واحد وسماكة واحدة وطوابق متطابقة)،
   وهنا كل عنصر بمقاسه: عمود بمقطعه، جسر بـ b×h من جدول الجسور، بلاطة كل طابق
   بسماكتها وفتحاتها مقطوعة فعلاً، أساسات مصمَّمة بالكود، وحديد من الجداول.

   المحاور: x المخطط → X ، y المخطط → −Z (الشمال للأعلى) ، الارتفاع → Y.
   الرسم عند الطلب فقط (تغيّر الكاميرا/الحجم) لتوفير بطارية الموبايل. */
const CAD3D = (() => {
  const T = () => window.THREE;
  const COL = { col: 0x9aa4b2, beam: 0x7f8ea6, slab: 0xcfd8e3, foot: 0xa8a29e, stub: 0x8c96a4,
                main: 0xef4444, tie: 0xf59e0b, meshB: 0x3b82f6, meshT: 0x22c55e, side: 0xa855f7,
                axis: 0x38bdf8, sel: 0xfacc15, wall: 0xd8cfc0, elev: 0xfbbf24 };

  function mount(host, B, opts) {
    const THREE = T();
    if (!THREE || !host) return null;
    opts = opts || {};
    const W0 = () => Math.max(280, host.clientWidth || 600);
    const H0 = () => Math.max(360, Math.min(720, Math.round(W0() * 0.72)));
    const rn = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    rn.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rn.setSize(W0(), H0());
    rn.setClearColor(0x0b1222);
    host.innerHTML = '';
    host.appendChild(rn.domElement);
    rn.domElement.style.display = 'block';
    rn.domElement.style.borderRadius = '12px';
    rn.domElement.style.touchAction = 'none';

    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, W0() / H0(), 0.1, 5000);
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a2336, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(40, 90, 60);
    sc.add(sun);
    const ctl = new THREE.OrbitControls(cam, rn.domElement);
    ctl.enableDamping = false;
    ctl.screenSpacePanning = true;

    const sx = (B.size && B.size[0]) || 10, sy = (B.size && B.size[1]) || 10;
    const cx = sx / 2, cy = sy / 2;
    const P = (x, y, z) => new THREE.Vector3(x - cx, z, -(y - cy));
    const disposables = [];
    const keep = o => { disposables.push(o); return o; };
    const mats = {};
    const mat = (k, o) => mats[k] || (mats[k] = keep(new THREE.MeshStandardMaterial(Object.assign(
      { color: COL[k], roughness: 0.82, metalness: k === 'main' || k === 'tie' ? 0.35 : 0.05 }, o || {}))));

    const cylR = keep(new THREE.CylinderGeometry(1, 1, 1, 8));
    const floorsG = [];      // مجموعة لكل طابق: خرسانة + حديد
    const concrete = [];     // كل شبكات الخرسانة (للأشعة ووضع «التسليح فقط»)
    const pickables = [];
    const root = new THREE.Group();
    sc.add(root);

    function box(w, h, d, pos, m, info, grp) {
      const g = keep(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)));
      const me = new THREE.Mesh(g, m);
      me.position.copy(pos);
      if (info) { me.userData = info; pickables.push(me); }
      concrete.push(me);
      grp.add(me);
      return me;
    }

    // ---------------- الخرسانة ----------------
    const fl = B.floors || [];
    fl.forEach((f, fi) => {
      const g = new THREE.Group();
      g.userData.floor = f.key;
      const conc = new THREE.Group(); conc.name = 'conc';
      const bars = new THREE.Group(); bars.name = 'bars'; bars.visible = false;
      g.add(conc); g.add(bars);
      root.add(g);
      floorsG.push({ g, conc, bars, f, built: false });
      const top = f.level + f.h, t = (f.slab.t || 200) / 1000;
      (f.columns || []).forEach(c => {
        const b = c.b / 1000, h = c.h / 1000, H = f.h - t;
        const info = { kind: 'col', floor: f.name, mark: c.mark, size: c.b + '×' + c.h,
                       at: (c.ax || '?') + '×' + (c.ay || '?'), rebar: c.rebar, outside: !!c.outside, how: c.how };
        if (c.shape === 'circ') {
          const geo = keep(new THREE.CylinderGeometry(b / 2, b / 2, H, 24));
          const me = new THREE.Mesh(geo, mat('col'));
          me.position.copy(P(c.x, c.y, f.level + H / 2));
          me.userData = info; pickables.push(me); concrete.push(me); conc.add(me);
        } else {
          box(b, H, h, P(c.x, c.y, f.level + H / 2), mat('col'), info, conc);
        }
      });
      (f.beams || []).forEach(bm => {
        const L = Math.hypot(bm.x2 - bm.x1, bm.y2 - bm.y1);
        const b = bm.b / 1000, h = bm.h / 1000;
        const mx = (bm.x1 + bm.x2) / 2, my = (bm.y1 + bm.y2) / 2;
        const info = { kind: 'beam', floor: f.name, mark: bm.mark, size: bm.b + '×' + bm.h,
                       span: L, axis: bm.axis, rebar: bm.rebar, guess: bm.guess };
        const me = bm.o === 'h' ? box(L, h - t, b, P(mx, my, top - t - (h - t) / 2), mat('beam'), info, conc)
                                : box(b, h - t, L, P(mx, my, top - t - (h - t) / 2), mat('beam'), info, conc);
        if (bm.guess) me.material = mat('beamG', { color: 0xb8894a });
      });
      (f.walls || []).forEach(w => {
        const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), th = Math.max(w.t, 80) / 1000, H = f.h - t;
        const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
        const info = { kind: 'wall', floor: f.name, t: w.t, L: L };
        if (w.o === 'h') box(L, H, th, P(mx, my, f.level + H / 2), mat('wall', { transparent: true, opacity: 0.9 }), info, conc);
        else box(th, H, L, P(mx, my, f.level + H / 2), mat('wall', { transparent: true, opacity: 0.9 }), info, conc);
      });
      (f.stairs || []).forEach(st => drawStair(st, conc, f.name));
      const SYS = f.slab.system || null, RB = f.slab.ribs || null;
      const tTop = RB ? RB.topping / 1000 : t;          // هوردي/معصبة: البلاطة العلوية فقط مصمتة
      (f.slab.rects || []).forEach(r => {
        const w = r[2] - r[0], d = r[3] - r[1];
        box(w, tTop, d, P((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, top - tTop / 2),
            mat('slab', { transparent: true, opacity: 0.93 }),
            { kind: 'slab', floor: f.name, t: f.slab.t, mesh: f.slab.mesh, sys: SYS && SYS.name, ribs: RB }, conc);
      });
      // الأعصاب (هوردي/معصبة/وافل): باتجاه البحر القصير لكل لوح (وباتجاهين إن ذُكر)، InstancedMesh واحد للطابق
      if (RB && (f.slab.rects || []).length) {
        const rw = RB.width / 1000, rd = t - tTop, list = [];
        (f.slab.rects || []).forEach(r => {
          const w = r[2] - r[0], d = r[3] - r[1];
          const alongY = w >= d;                          // الأعصاب تمتد بالبحر القصير
          const dirs = RB.two_way ? [true, false] : [alongY];
          dirs.forEach(ay => {
            const L = ay ? d : w, span = ay ? w : d;
            for (let u = RB.spacing / 2; u < span - 0.05; u += RB.spacing)
              list.push(ay ? [r[0] + u, (r[1] + r[3]) / 2, rw, L] : [(r[0] + r[2]) / 2, r[1] + u, L, rw]);
          });
        });
        if (list.length && list.length < 60000) {
          const geo = keep(new THREE.BoxGeometry(1, 1, 1));
          const im = new THREE.InstancedMesh(geo, mat('rib', { color: 0xd8dde6 }), list.length);
          const M = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sv = new THREE.Vector3();
          list.forEach((v, i) => { M.compose(P(v[0], v[1], top - tTop - rd / 2), q0, sv.set(v[2], rd, v[3])); im.setMatrixAt(i, M); });
          im.userData = { kind: 'slab', floor: f.name, t: f.slab.t, sys: SYS && SYS.name, ribs: RB };
          pickables.push(im); conc.add(im);
        }
      }
      // تسقيط حول الأعمدة (Drop Panel) للبلاطات المسطحة
      (f.slab.drops || []).forEach(dp => {
        const dt = dp.t / 1000;
        box(dp.s, dt, dp.s, P(dp.x, dp.y, top - t - dt / 2), mat('slab'), { kind: 'slab', floor: f.name, t: f.slab.t, drop: dp, sys: SYS && SYS.name }, conc);
      });
    });

    // درج منفرد (تبويب «الأدراج»): مجموعة بمفردها كطابق وهمي ليُبنى حديده عند الطلب
    if ((B.stairs || []).length) {
      const g = new THREE.Group(), conc = new THREE.Group(), bars = new THREE.Group();
      bars.visible = false; g.add(conc); g.add(bars); root.add(g);
      B.stairs.forEach(st => drawStair(st, conc, st.title || 'الدرج'));
      floorsG.push({ g, conc, bars, f: { key: 'stairs', name: 'الدرج', stairs: B.stairs, columns: [], beams: [], walls: [],
                                          slab: { rects: [] }, level: 0, h: 0 }, built: false });
    }

    // ---------------- الأدراج: قلبات بمقطعها الجانبي الحقيقي (درجات + بطن مائل) مبثوقة بعرض القلبة ----------------
    function flightM(q) {                             // محاور القلبة المحلية: s على المشي، h رأسي، d عرضي
      const U = new THREE.Vector3(q.u[0], 0, -q.u[1]), V = new THREE.Vector3(q.v[0], 0, -q.v[1]);
      const M = new THREE.Matrix4().makeBasis(U, new THREE.Vector3(0, 1, 0), V);
      M.setPosition(P(q.p0[0], q.p0[1], q.z0));
      return M;
    }
    function rod(a, b, r, m, grp) {
      const d = new THREE.Vector3().subVectors(b, a), L = d.length();
      if (L < 1e-3) return;
      const me = new THREE.Mesh(cylR, m);
      me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      me.scale.set(r, L, r);
      me.position.copy(a).add(b).multiplyScalar(0.5);
      grp.add(me);
    }
    function drawStair(st, grp, fname) {
      const sm = mat('stair', { color: 0xd9d4ca, side: THREE.DoubleSide });
      const FL = st.flights3d || st.flights || [];
      const info0 = { kind: 'stair', floor: fname, title: st.title, H: st.H, N: st.N || st.n_risers, R: st.R, T: st.T,
                      src: st.src || st.H_src, design: st.design, rebar: st.rebar, type: st.type, completed: st.completed };
      FL.forEach((q, i) => {
        const th = Math.atan2(q.R, q.T), wv = (q.waist || 150) / 1000 / Math.cos(th), se = (q.n - 1) * q.T;
        const sh = new THREE.Shape();
        sh.moveTo(0, -wv); sh.lineTo(0, 0);
        for (let k = 0; k < q.n; k++) { sh.lineTo(k * q.T, (k + 1) * q.R); if (k < q.n - 1) sh.lineTo((k + 1) * q.T, (k + 1) * q.R); }
        sh.lineTo(se, (q.n - 1) * q.R - wv); sh.lineTo(0, -wv);
        const geo = keep(new THREE.ExtrudeGeometry(sh, { depth: q.w, bevelEnabled: false }));
        let Mq = flightM(q);
        if (Mq.determinant() < 0) {                    // محاور معكوسة ← الوجوه مقلوبة (سوداء): اعكس العرض وابدأ من الطرف الآخر
          Mq = flightM(Object.assign({}, q, { v: [-q.v[0], -q.v[1]], p0: [q.p0[0] + q.v[0] * q.w, q.p0[1] + q.v[1] * q.w] }));
        }
        geo.applyMatrix4(Mq);
        const me = new THREE.Mesh(geo, q.read === false ? mat('stairC', { color: 0xc7d2fe, side: THREE.DoubleSide }) : sm);
        me.userData = Object.assign({}, info0, { flight: i + 1, n: q.n, z0: q.z0, z1: q.z0 + q.n * q.R, waist: q.waist, read: q.read !== false });
        pickables.push(me); concrete.push(me); grp.add(me);
        // الدرابزين على جهة البئر (نحو القلبة الأخرى) على ارتفاع 0.9 م من أنف الدرجة
        const others = FL.filter(o => o !== q);
        let dR = q.w - 0.05;
        if (others.length) {
          const cq = [q.p0[0] + q.u[0] * se / 2 + q.v[0] * q.w / 2, q.p0[1] + q.u[1] * se / 2 + q.v[1] * q.w / 2];
          const co = others.reduce((a, o) => [a[0] + (o.p0[0] + o.u[0] * (o.n - 1) * o.T / 2 + o.v[0] * o.w / 2) / others.length,
                                              a[1] + (o.p0[1] + o.u[1] * (o.n - 1) * o.T / 2 + o.v[1] * o.w / 2) / others.length], [0, 0]);
          dR = ((co[0] - cq[0]) * q.v[0] + (co[1] - cq[1]) * q.v[1]) > 0 ? q.w - 0.05 : 0.05;
        }
        const M = flightM(q), L = (s, h, d) => new THREE.Vector3(s, h, d).applyMatrix4(M);
        const rm = mat('rail', { color: 0x94a3b8, metalness: 0.6, roughness: 0.35 });
        rod(L(0, q.R + 0.9, dR), L(se, q.n * q.R + 0.9, dR), 0.025, rm, grp);
        [0, se].forEach((s0, j) => rod(L(s0, (j ? q.n : 1) * q.R, dR), L(s0, (j ? q.n : 1) * q.R + 0.9, dR), 0.02, rm, grp));
      });
      (st.landings || []).forEach(l => {
        const t = (l.t || 150) / 1000;
        box(l.x1 - l.x0, t, l.y1 - l.y0, P((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2, l.z - t / 2), sm,
            Object.assign({}, info0, { landing: true, z: l.z, t: l.t, read: l.read }), grp);
      });
      (st.beams3d || []).forEach(bm => {
        const a = P(bm.a[0], bm.a[1], bm.a[2]), b = P(bm.b[0], bm.b[1], bm.b[2]);
        const d = new THREE.Vector3().subVectors(b, a), L = d.length();
        if (L < 0.05) return;
        const bw = bm.bw / 1000, bh = bm.bh / 1000;
        const me = new THREE.Mesh(keep(new THREE.BoxGeometry(L, bh, bw)), mat('beam'));
        me.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
        me.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -bh / 2, 0));
        me.userData = { kind: 'beam', floor: fname, mark: bm.mark || (bm.kind === 'inclined' ? 'جسر مائل' : 'جسر بسطة'),
                        size: bm.bw + '×' + bm.bh, span: L, guess: !bm.mark };
        pickables.push(me); concrete.push(me); grp.add(me);
      });
      if (st.spiral) {                                 // حلزوني: عمود أوسط + درجات إسفينية كل منها قائمة أعلى
        const S = st.spiral, dA = S.step_deg * Math.PI / 180, R = S.H / S.n, tS = 0.12;
        const col = new THREE.Mesh(keep(new THREE.CylinderGeometry(S.r_core, S.r_core, S.H + 1.0, 24)), mat('col'));
        col.position.copy(P(S.x, S.y, S.z0 + (S.H + 1.0) / 2));
        col.userData = Object.assign({}, info0, { spiral: S }); pickables.push(col); concrete.push(col); grp.add(col);
        for (let i = 0; i < S.n; i++) {
          const a = S.a0 + i * dA, sh = new THREE.Shape();
          sh.moveTo(S.r_core * Math.cos(a), S.r_core * Math.sin(a));
          sh.lineTo(S.r_out * Math.cos(a), S.r_out * Math.sin(a));
          sh.absarc(0, 0, S.r_out, a, a + dA * 1.08, false);
          sh.lineTo(S.r_core * Math.cos(a + dA * 1.08), S.r_core * Math.sin(a + dA * 1.08));
          sh.absarc(0, 0, S.r_core, a + dA * 1.08, a, true);
          const g2 = keep(new THREE.ExtrudeGeometry(sh, { depth: tS, bevelEnabled: false }));
          const me = new THREE.Mesh(g2, sm);
          me.rotation.x = -Math.PI / 2;
          me.position.copy(P(S.x, S.y, S.z0 + (i + 1) * R - tS));
          me.userData = Object.assign({}, info0, { step: i + 1, spiral: S }); pickables.push(me); concrete.push(me); grp.add(me);
        }
        const rm = mat('rail', { color: 0x94a3b8, metalness: 0.6, roughness: 0.35 });
        const pts = [];
        for (let i = 0; i <= S.n; i++) { const a = S.a0 + i * dA; pts.push(P(S.x + (S.r_out - 0.05) * Math.cos(a), S.y + (S.r_out - 0.05) * Math.sin(a), S.z0 + i * R + 0.9)); }
        for (let i = 0; i < pts.length - 1; i++) rod(pts[i], pts[i + 1], 0.02, rm, grp);
      }
    }

    // ستارة السطح (من المقطع/الواجهة): جدار رقيق على حواف بلاطة السطح غير الملاصقة لبلاطة أخرى
    const parH = B.levels && B.levels.parapet;
    if (parH && fl.length) {
      const F = fl[fl.length - 1], top = F.level + F.h, R = F.slab.rects || [], th = 0.2;
      const shared = (x1, y1, x2, y2, me) => R.some(r => r !== me && (
        (x1 === x2 && (Math.abs(r[0] - x1) < 0.05 || Math.abs(r[2] - x1) < 0.05) && Math.min(y2, r[3]) - Math.max(y1, r[1]) > 0.5) ||
        (y1 === y2 && (Math.abs(r[1] - y1) < 0.05 || Math.abs(r[3] - y1) < 0.05) && Math.min(x2, r[2]) - Math.max(x1, r[0]) > 0.5)));
      const pg = new THREE.Group();
      floorsG[floorsG.length - 1].conc.add(pg);
      const info = { kind: 'wall', floor: 'السطح', t: 200, L: parH, parapet: parH };
      R.forEach(r => {
        [[r[0], r[1], r[2], r[1]], [r[0], r[3], r[2], r[3]], [r[0], r[1], r[0], r[3]], [r[2], r[1], r[2], r[3]]].forEach(([x1, y1, x2, y2]) => {
          if (shared(x1, y1, x2, y2, r)) return;
          const L = Math.hypot(x2 - x1, y2 - y1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          if (y1 === y2) box(L, parH, th, P(mx, my + (y1 === r[1] ? th / 2 : -th / 2), top + parH / 2), mat('wall', { transparent: true, opacity: 0.9 }), info, pg);
          else box(th, parH, L, P(mx + (x1 === r[0] ? th / 2 : -th / 2), my, top + parH / 2), mat('wall', { transparent: true, opacity: 0.9 }), info, pg);
        });
      });
    }

    // ---------------- الأساسات ----------------
    const found = new THREE.Group();
    root.add(found);
    const Df = 1.5, z0f = (fl[0] ? fl[0].level : 0);
    (B.footings || []).forEach(ft => {
      const hh = ft.h / 1000;
      const zt = (typeof ft.zg === 'number') ? ft.zg : ((typeof ft.z === 'number') ? ft.z : z0f);  // التأسيس من الأرض الطبيعية
      box(ft.B, hh, ft.B, P(ft.x, ft.y, zt - Df + hh / 2), mat('foot'),
          { kind: 'foot', mark: ft.col, size: ft.B.toFixed(2) + '×' + ft.B.toFixed(2) + ' م × ' + ft.h + ' مم',
            PD: ft.PD, PL: ft.PL, Pu: ft.Pu, bars: ft.bars, ok: ft.ok }, found);
    });
    // أساسات شريطية (مرسومة بطبقة الأساس، أو مصمَّمة تحت الجدران الحاملة) + جدار الأساس حتى منسوب الطابق
    (B.strips || []).forEach(st => {
      const L = Math.hypot(st.x2 - st.x1, st.y2 - st.y1), w = st.w / 1000, hh = (st.h || 350) / 1000;
      const zg = Math.min(z0f, 0), mx = (st.x1 + st.x2) / 2, my = (st.y1 + st.y2) / 2, dS = 1.0;
      const info = { kind: 'strip', w: st.w, h: st.h || 350, L: L, P: st.P, designed: !!st.designed };
      if (st.o === 'h') box(L + w, hh, w, P(mx, my, zg - dS + hh / 2), mat('foot'), info, found);
      else box(w, hh, L + w, P(mx, my, zg - dS + hh / 2), mat('foot'), info, found);
      const tw = 0.3, H = z0f - (zg - dS + hh);
      if (st.o === 'h') box(L, H, tw, P(mx, my, zg - dS + hh + H / 2), mat('stub'), null, found);
      else box(tw, H, L, P(mx, my, zg - dS + hh + H / 2), mat('stub'), null, found);
    });
    fl.filter(f => f === fl[0] || f.level <= 0.01).forEach(base => (base.columns || []).forEach(c => {  // رقبة العمود من الأساس للأرض
      const ft = (B.footings || []).find(q => Math.abs(q.x - c.x) < 0.3 && Math.abs(q.y - c.y) < 0.3);
      if (!ft) return;
      const zt = (typeof ft.z === 'number') ? ft.z : z0f;
      if (Math.abs(zt - base.level) > 0.01 && base !== fl[0]) return;
      const zb = (typeof ft.zg === 'number') ? ft.zg : zt;     // رقبة العمود من الأساس حتى منسوب الطابق (+0.70)
      const z0 = zb - Df + ft.h / 1000;
      box(c.b / 1000, zt - z0, c.h / 1000, P(c.x, c.y, (z0 + zt) / 2), mat('stub'), null, found);
    }));

    // ---------------- المحاور بأسمائها ----------------
    const axG = new THREE.Group();
    root.add(axG);
    const lineMat = keep(new THREE.LineDashedMaterial({ color: COL.axis, dashSize: 0.6, gapSize: 0.35, transparent: true, opacity: 0.7 }));
    const label = (txt, pos, prime) => {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
      const x = cv.getContext('2d');
      x.fillStyle = prime ? '#0e7490' : '#0369a1'; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
      x.lineWidth = 6; x.strokeStyle = '#e0f2fe'; x.stroke();
      x.fillStyle = '#fff'; x.font = 'bold ' + (txt.length > 2 ? 44 : 58) + 'px sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 64, 68);
      const tx = keep(new THREE.CanvasTexture(cv));
      const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tx, depthTest: false })));
      sp.position.copy(pos);
      const s = Math.max(1.1, Math.max(sx, sy) / 26);
      sp.scale.set(s, s, 1);
      axG.add(sp);
    };
    const gx = (B.grid && B.grid.x) || [], gy = (B.grid && B.grid.y) || [];
    const ext = 3;
    gx.forEach(a => {
      const geo = keep(new THREE.BufferGeometry().setFromPoints([P(a.pos, -ext, 0.02), P(a.pos, sy + ext, 0.02)]));
      const ln = new THREE.Line(geo, lineMat); ln.computeLineDistances(); axG.add(ln);
      label(a.name.replace("'", '′'), P(a.pos, sy + ext + 1.2, 0.05), a.prime);
    });
    gy.forEach(a => {
      const geo = keep(new THREE.BufferGeometry().setFromPoints([P(-ext, a.pos, 0.02), P(sx + ext, a.pos, 0.02)]));
      const ln = new THREE.Line(geo, lineMat); ln.computeLineDistances(); axG.add(ln);
      label(a.name.replace("'", '′'), P(-ext - 1.2, a.pos, 0.05), a.prime);
    });
    const grd = keep(new THREE.PlaneGeometry(sx + 16, sy + 16));
    const gm = new THREE.Mesh(grd, keep(new THREE.MeshStandardMaterial({ color: 0x142033, roughness: 1, transparent: true, opacity: 0.85 })));
    gm.rotation.x = -Math.PI / 2; gm.position.y = Math.min(0, z0f) - 0.01;
    if ((B.stairs || []).length) {                   // الدرج المنفرد قد يبدأ تحت الصفر (قلبة مدخل −0.70)
      const zs = [];
      B.stairs.forEach(st => { (st.flights3d || []).forEach(q => zs.push(q.z0)); (st.landings || []).forEach(l => zs.push(l.z)); });
      if (zs.length) gm.position.y = Math.min(gm.position.y, Math.min(...zs) - 0.35);
    }
    root.add(gm);

    // ---------------- الواجهات: رسمة الواجهة تُسقَط على وجهها من المبنى ----------------
    // خط الأرض = أطول خط أفقي بأسفل الرسمة؛ العرض يُطابَق مع عرض المبنى على ذلك الوجه
    // (من اليسار لليمين كما يراه الواقف أمام الواجهة)، والارتفاع من خط الأرض.
    const views = new THREE.Group();
    root.add(views);
    const txtSprite = (txt, pos, col) => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const x = cv.getContext('2d');
      x.fillStyle = 'rgba(15,23,42,.85)'; x.fillRect(0, 8, 256, 48);
      x.fillStyle = col || '#fbbf24'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt, 128, 33);
      const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(new THREE.CanvasTexture(cv)), depthTest: false })));
      sp.position.copy(pos); sp.scale.set(2.4, 0.6, 1);
      return sp;
    };
    (B.views || []).forEach(v => {
      if (!(v.sketch || []).length) return;
      if (v.fit) {           // مطابقة دقيقة: محاور الواجهة ← محاور المسقط، وعلامات المنسوب ← الارتفاع
        const F = v.fit, pts = [];
        const map = (ex, ey) => { const u = F.s * ex + F.b, z = (ey - F.y0) / F.k;
          return F.along === 'x' ? P(u, F.face, z) : P(F.face, u, z); };
        v.sketch.forEach(l => { if (l[4] !== 'a') pts.push(map(l[0], l[1]), map(l[2], l[3])); });  // خطوط المحاور تُحذف — تزحم الواجهة
        const geo = keep(new THREE.BufferGeometry().setFromPoints(pts));
        views.add(new THREE.LineSegments(geo, keep(new THREE.LineBasicMaterial({
          color: v.kind === 'section' ? 0x22d3ee : COL.elev, transparent: true, opacity: 0.9 }))));
        return;
      }
      if (!v.view) return;
      const L = v.sketch;
      const hl = L.filter(l => Math.abs(l[3] - l[1]) < 0.01);
      const wmax = Math.max(...L.map(l => Math.max(l[0], l[2]))) - Math.min(...L.map(l => Math.min(l[0], l[2])));
      const longH = hl.filter(l => Math.abs(l[2] - l[0]) > 0.4 * wmax).sort((a, b) => a[1] - b[1]);
      if (!longH.length) return;
      const g = longH[0];
      const gy = g[1], ex0 = Math.min(g[0], g[2]), ex1 = Math.max(g[0], g[2]);
      const face = (v.view === 'S' || v.view === 'N') ? sx : sy;
      const k = Math.abs((ex1 - ex0) - face) < 0.25 * face ? face / (ex1 - ex0) : 1;
      const off = Math.abs((ex1 - ex0) - face) < 0.25 * face ? 0 : (face - (ex1 - ex0)) / 2;
      const pts = [];
      const map = (ex, ey) => {
        const u = (ex - ex0) * k + off, z = (ey - gy);
        if (v.view === 'S') return P(u, -0.25, z);
        if (v.view === 'N') return P(sx - u, sy + 0.25, z);
        if (v.view === 'E') return P(sx + 0.25, u, z);
        return P(-0.25, sy - u, z);
      };
      L.forEach(l => { if (l[1] >= gy - 0.05 && l[3] >= gy - 0.05) { pts.push(map(l[0], l[1]), map(l[2], l[3])); } });
      if (!pts.length) return;
      const geo = keep(new THREE.BufferGeometry().setFromPoints(pts));
      views.add(new THREE.LineSegments(geo, keep(new THREE.LineBasicMaterial({ color: COL.elev, transparent: true, opacity: 0.85 }))));
    });
    if (B.levels && views.children.length) {        // المناسيب المقاسة بجانب المبنى
      const lv = B.levels.chain.concat(B.levels.extra || []);
      lv.forEach((z, i) => {
        const t = Math.abs(z) < 0.005 ? '±0.00' : (z > 0 ? '+' : '') + z.toFixed(2);
        views.add(txtSprite(t, P(-1.6, -0.3, z), i < B.levels.chain.length ? '#fbbf24' : '#94a3b8'));
        const g2 = keep(new THREE.BufferGeometry().setFromPoints([P(-0.9, -0.12, z), P(0, -0.12, z)]));
        views.add(new THREE.Line(g2, keep(new THREE.LineBasicMaterial({ color: 0xfbbf24 }))));
      });
      if (B.levels.ngl && Math.abs(B.ffl0 || 0) > 0.005) views.add(txtSprite('±0.00', P(-1.6, -0.3, 0), '#94a3b8'));
    }
    views.visible = false;

    // ---------------- الحديد (يُبنى عند الطلب لكل طابق) ----------------
    const cyl = keep(new THREE.CylinderGeometry(1, 1, 1, 6));
    const up = new THREE.Vector3(0, 1, 0);
    function barSet(list, color) {                  // list: [[p1(Vector3), p2(Vector3), dia(mm)]]
      if (!list.length) return null;
      const m = keep(new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.35 }));
      const im = new THREE.InstancedMesh(cyl, m, list.length);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), dir = new THREE.Vector3();
      list.forEach((b, i) => {
        dir.subVectors(b[1], b[0]);
        const L = dir.length() || 0.001;
        q.setFromUnitVectors(up, dir.normalize());
        const r = Math.max(b[2], 6) / 2000;
        s.set(r, L, r);
        M.compose(new THREE.Vector3().addVectors(b[0], b[1]).multiplyScalar(0.5), q, s);
        im.setMatrixAt(i, M);
      });
      im.instanceMatrix.needsUpdate = true;
      return im;
    }
    function loopBars(out, pts, d) {                // مضلع مغلق من نقاط Vector3 = أتاري
      for (let i = 0; i < pts.length; i++) out.push([pts[i], pts[(i + 1) % pts.length], d]);
    }
    let nBars = 0;
    function buildBars(F) {
      if (F.built) return;
      F.built = true;
      const f = F.f, top = f.level + f.h, t = (f.slab.t || 200) / 1000;
      const main = [], ties = [], side = [], mB = [], mT = [];
      // أعمدة: قضبان رئيسية حول المحيط + أتاري بتباعدها
      (f.columns || []).forEach(c => {
        const rb = c.rebar || {};
        const mb = rb.main || { n: 8, d: 16 }, tie = rb.ties || { d: 10, s: 200 };
        const b = c.b / 1000, h = c.h / 1000, cv = 0.04 + (tie.d || 10) / 1000 + mb.d / 2000;
        const z0 = f.level, z1 = f.level + f.h - 0.05;
        const pts = [];
        if (c.shape === 'circ') {
          for (let i = 0; i < mb.n; i++) {
            const a = i / mb.n * Math.PI * 2, r = b / 2 - cv;
            pts.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a)]);
          }
        } else {
          // توزيع n على المحيط: 4 أركان + الباقي على الأضلاع بنسبة أطوالها
          const bx = b - 2 * cv, hy = h - 2 * cv, per = 2 * (bx + hy);
          for (let i = 0; i < mb.n; i++) {
            let u = i / mb.n * per, x, y;
            if (u < bx) { x = -bx / 2 + u; y = -hy / 2; }
            else if ((u -= bx) < hy) { x = bx / 2; y = -hy / 2 + u; }
            else if ((u -= hy) < bx) { x = bx / 2 - u; y = hy / 2; }
            else { u -= bx; x = -bx / 2; y = hy / 2 - u; }
            pts.push([c.x + x, c.y + y]);
          }
        }
        pts.forEach(p => main.push([P(p[0], p[1], z0), P(p[0], p[1], z1), mb.d]));
        const s = (tie.s || 200) / 1000, ct = 0.04 + (tie.d || 10) / 2000;
        for (let z = z0 + 0.05; z < z1; z += s) {
          if (c.shape === 'circ') {
            const ring = []; const r = b / 2 - ct;
            for (let i = 0; i < 12; i++) ring.push(P(c.x + r * Math.cos(i / 12 * 6.283), c.y + r * Math.sin(i / 12 * 6.283), z));
            loopBars(ties, ring, tie.d || 10);
          } else {
            loopBars(ties, [P(c.x - b / 2 + ct, c.y - h / 2 + ct, z), P(c.x + b / 2 - ct, c.y - h / 2 + ct, z),
                            P(c.x + b / 2 - ct, c.y + h / 2 - ct, z), P(c.x - b / 2 + ct, c.y + h / 2 - ct, z)], tie.d || 10);
          }
        }
      });
      // جسور: مستمر سفلي/علوي + إضافي بالمنتصف + فوق المساند + أتاري أكثف بالأطراف + جانبي
      (f.beams || []).forEach(bm => {
        const rb = bm.rebar || {};
        const L = Math.hypot(bm.x2 - bm.x1, bm.y2 - bm.y1);
        if (L < 0.3) return;
        const ux = (bm.x2 - bm.x1) / L, uy = (bm.y2 - bm.y1) / L;   // اتجاه الجسر
        const vx = -uy, vy = ux;                                      // العرضي
        const b = bm.b / 1000, h = bm.h / 1000, cv = 0.05;
        const zb = top - h + cv, zt = top - cv;
        const at = (s, w, z) => P(bm.x1 + ux * s + vx * w, bm.y1 + uy * s + vy * w, z);
        const row = (spec, z, s0, s1, out) => {
          if (!spec || !spec.n) return;
          const n = spec.n, wid = b - 2 * cv;
          for (let i = 0; i < n; i++) {
            const w = n === 1 ? 0 : -wid / 2 + wid * i / (n - 1);
            out.push([at(s0, w, z), at(s1, w, z), spec.d]);
          }
        };
        const bot = rb.bot || {}, tp = rb.top || {}, st = rb.stir || {};
        row(bot.cont || { n: 3, d: 16 }, zb, 0, L, main);
        row(bot.extra, zb + 0.05, L * 0.15, L * 0.85, main);
        row(tp.cont || { n: 2, d: 12 }, zt, 0, L, main);
        if (tp.sup) { row(tp.sup, zt - 0.05, 0, L / 3, main); row(tp.sup, zt - 0.05, L * 2 / 3, L, main); }
        if (rb.side && rb.side.n) {
          const per = Math.max(1, Math.round(rb.side.n / 2));
          for (let k = 1; k <= per; k++) {
            const z = zb + (zt - zb) * k / (per + 1);
            side.push([at(0, -(b / 2 - cv), z), at(L, -(b / 2 - cv), z), rb.side.d]);
            side.push([at(0, b / 2 - cv, z), at(L, b / 2 - cv, z), rb.side.d]);
          }
        }
        const sEnd = ((st.end || st.mid || { s: 150 }).s || 150) / 1000;
        const sMid = ((st.mid || st.end || { s: 200 }).s || 200) / 1000;
        const dT = (st.end || st.mid || { d: 10 }).d || 10;
        for (let s = 0.05; s < L - 0.02;) {
          const ww = b / 2 - cv + 0.01;
          loopBars(ties, [at(s, -ww, zb - 0.015), at(s, ww, zb - 0.015), at(s, ww, zt + 0.015), at(s, -ww, zt + 0.015)], dT);
          s += (s < L / 4 || s > L * 3 / 4) ? sEnd : sMid;
        }
      });
      // البلاطة: شبكة سفلية وعلوية بقطرها وتباعدها من نداءات اللوحة
      const mesh = f.slab.mesh || {};
      const mb = mesh.bot || { d: 12, s: 200 }, mt = mesh.top;
      (f.slab.rects || []).forEach(r => {
        const zB = top - t + 0.03, zT = top - 0.03;
        const lay = (spec, z, out) => {
          const s = (spec.s || 200) / 1000;
          for (let x = r[0] + s / 2; x < r[2]; x += s) out.push([P(x, r[1] + 0.03, z), P(x, r[3] - 0.03, z), spec.d]);
          for (let y = r[1] + s / 2; y < r[3]; y += s) out.push([P(r[0] + 0.03, y, z + 0.012), P(r[2] - 0.03, y, z + 0.012), spec.d]);
        };
        lay(mb, zB, mB);
        if (mt) lay(mt, zT, mT);
      });
      // الدرج: رئيسي سفلي موازٍ للميل ويمتد بالبسطة، توزيع عرضي فوقه، وحديد علوي عند الانكسار (ربع البحر)
      (f.stairs || []).forEach(st => {
        const rb = st.rebar || {}, mm = rb.main || { d: 12, s: 150 }, dd = rb.dist || { d: 10, s: 200 }, tt = rb.top || mm;
        (st.flights3d || st.flights || []).forEach(q => {
          const th = Math.atan2(q.R, q.T), tn = Math.tan(th), wv = (q.waist || 150) / 1000 / Math.cos(th), se = (q.n - 1) * q.T;
          const M = flightM(q), L = (s0, h, d) => new THREE.Vector3(s0, h, d).applyMatrix4(M), c = 0.025;
          const sm_ = (mm.s || 150) / 1000, sd_ = (dd.s || 200) / 1000;
          const hb = s0 => s0 * tn - wv + c / Math.cos(th);
          for (let d = c; d <= q.w - c + 1e-6; d += sm_) {
            main.push([L(-0.25, hb(0) , d), L(se, hb(se), d), mm.d]);
            main.push([L(se, hb(se), d), L(se + 0.6, hb(se), d), mm.d]);
            const tz = s0 => s0 * tn - c;
            mT.push([L(se - Math.max(0.8, se / 4), tz(se - Math.max(0.8, se / 4)), d), L(se, tz(se), d), tt.d]);
            mT.push([L(se, tz(se), d), L(se + 0.7, tz(se), d), tt.d]);
          }
          for (let s0 = 0.05; s0 <= se; s0 += sd_ * Math.cos(th))
            mB.push([L(s0, hb(s0) + (mm.d + dd.d) / 2000, c), L(s0, hb(s0) + (mm.d + dd.d) / 2000, q.w - c), dd.d]);
        });
      });
      [[main, COL.main], [ties, COL.tie], [side, COL.side], [mB, COL.meshB], [mT, COL.meshT]].forEach(([l, c]) => {
        const im = barSet(l, c);
        if (im) { F.bars.add(im); nBars += l.length; }
      });
    }

    // ---------------- الكاميرا والرسم ----------------
    const Htot = B.height || 3.5;
    // تأطير الكاميرا على ما هو ظاهر (المبنى كله أو الطابق المختار) بالكرة المحيطة
    function fit(obj, dirv) {
      const bx = new THREE.Box3();
      (obj || root).traverse(o => { if (o.isMesh && o.visible && o.geometry && o !== gm) {
        let p = o.parent, vis = true;
        while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
        if (vis) bx.expandByObject(o);
      } });
      if (bx.isEmpty()) bx.setFromCenterAndSize(new THREE.Vector3(0, Htot / 2, 0), new THREE.Vector3(sx, Htot, sy));
      if (views.visible) bx.expandByObject(views);
      const c = bx.getCenter(new THREE.Vector3()), r = bx.getSize(new THREE.Vector3()).length() / 2;
      const fov = cam.fov * Math.PI / 180, asp = Math.min(1, cam.aspect);
      const dist = r / Math.sin(fov / 2) / Math.max(0.55, asp) * 0.82;
      const dir = (dirv || new THREE.Vector3(0.62, 0.62, 0.8)).clone().normalize();
      cam.position.copy(c).addScaledVector(dir, dist);
      cam.near = Math.max(0.05, dist / 200); cam.far = dist * 20; cam.updateProjectionMatrix();
      ctl.target.copy(c);
      ctl.update(); draw();
    }
    function reset() {
      const F = floorsG.find(F => F.f.key === floorSel);
      fit(floorSel === 'all' || !F ? null : F.g);
    }
    let raf = 0;
    function draw() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (rn) rn.render(sc, cam); });
    }
    ctl.addEventListener('change', draw);
    const ro = window.ResizeObserver ? new ResizeObserver(() => {
      rn.setSize(W0(), H0()); cam.aspect = W0() / H0(); cam.updateProjectionMatrix(); draw();
    }) : null;
    if (ro) ro.observe(host);

    // ---------------- التحكم ----------------
    let floorSel = 'all', rebarOn = false, onlyBars = false, xrayOn = false;
    function apply() {
      floorsG.forEach((F, i) => {
        const vis = floorSel === 'all' || floorSel === F.f.key;
        F.g.visible = vis;
        if (vis && (rebarOn || onlyBars)) buildBars(F);
        F.bars.visible = vis && (rebarOn || onlyBars);
      });
      found.visible = floorSel === 'all' || (fl[0] && floorSel === fl[0].key);
      // الخرسانة تبقى ظاهرة شبحاً شفافاً في «التسليح فقط» والأشعة — ليبقى الحديد مقروءاً بمكانه
      Object.keys(mats).forEach(k => {
        const m = mats[k];
        const o = onlyBars ? 0.06 : (xrayOn ? 0.22 : (k === 'slab' ? 0.93 : 1));
        m.transparent = o < 1; m.opacity = o; m.depthWrite = o >= 1; m.needsUpdate = true;
      });
      draw();
    }
    // اختيار عنصر بلمسة (بلا سحب)
    const ray = new THREE.Raycaster(), mv = new THREE.Vector2();
    let down = null, selMesh = null, selMat = null;
    rn.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    rn.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = rn.domElement.getBoundingClientRect();
      mv.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(mv, cam);
      const hits = ray.intersectObjects(pickables.filter(m => m.visible && m.parent && m.parent.visible
        && (!m.parent.parent || m.parent.parent.visible)), false);
      if (selMesh) { selMesh.material = selMat; selMesh = null; }
      if (hits.length) {
        selMesh = hits[0].object; selMat = selMesh.material;
        selMesh.material = mat('sel', { color: COL.sel, emissive: 0x3a2f00 });
        opts.onPick && opts.onPick(selMesh.userData);
      } else if (opts.onPick) opts.onPick(null);
      draw();
    });

    reset();
    setTimeout(reset, 0);
    const api = {
      floor(k) { floorSel = k || 'all'; apply(); reset(); },
      rebar(on) { rebarOn = !!on; apply(); },
      only(on) { onlyBars = !!on; apply(); },
      xray(on) { xrayOn = !!on; apply(); },
      views(on) {          // تشغيل الواجهات = نظرة أمامية على الواجهة المطابَقة لرؤية التطابق
        views.visible = !!on;
        const v = on && (B.views || []).find(q => q.fit && q.kind === 'elev');
        if (v) {
          const F = v.fit, mid = F.along === 'x' ? sy / 2 : sx / 2;
          const d = F.along === 'x' ? (F.face <= mid ? new THREE.Vector3(0.12, 0.1, 1) : new THREE.Vector3(-0.12, 0.1, -1))
                                    : (F.face >= mid ? new THREE.Vector3(1, 0.1, -0.12) : new THREE.Vector3(-1, 0.1, 0.12));
          fit(null, d);
        } else reset();
      },
      hasViews: () => views.children.length > 0,
      reset,
      stats() { return { floors: floorsG.length, pick: pickables.length, bars: nBars }; },
      canvas: () => rn.domElement,
      dispose() {
        try { ro && ro.disconnect(); } catch (e) { /* */ }
        ctl.dispose();
        disposables.forEach(d => { try { d.dispose(); } catch (e) { /* */ } });
        floorsG.forEach(F => F.bars.children.forEach(im => { try { im.dispose && im.dispose(); } catch (e) { /* */ } }));
        rn.dispose();
        if (rn.domElement.parentNode) rn.domElement.parentNode.removeChild(rn.domElement);
      }
    };
    return api;
  }
  return { mount };
})();

window.CAD3D = CAD3D;
