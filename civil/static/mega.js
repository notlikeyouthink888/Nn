/* 🏙️ المشاريع الكبيرة في الهندسة — عارض تعليمي للعرض فقط (ماكو أي تعديل على المجسم).
   · دوّر وقرّب وحرّك، واضغط أي عنصر: شنو هذا؟ ليش هنا؟ شلون ينتقل الحمل؟
   · طبقات تنطفي وتشتغل، قطع أفقي (مسقط عند أي منسوب) وقطع عمودي، مسار الحمل متحركاً، الريح، وجولة مشروحة.
   · البيانات والمجسمات بـ megaprojects.js — وكل رقم معه مصدره.
   الرسم عند الحاجة فقط (حركة الكاميرا أو وضع متحرك) حتى ما يستهلك بطارية الموبايل. */
const MEGA = (() => {
  const T = () => window.THREE, PR = () => window.MEGAPROJ || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LAB = { beam: 'الجسر تحت الحمل', column: 'انبعاج العمود', section: 'داخل المقطع الخرساني', quake: 'اهتزاز المبنى', path: 'مسار الحمل حتى التربة',
    truss: 'الجملون (شد وضغط)', plate: 'البلاطة ثنائية الاتجاه', wind: 'الرياح والمبنى', age: 'عمر الخرسانة (انكماش وزحف)' };
  const A = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="2" marker-end="url(#mgA${c.slice(1)})"/>`;
  const DEFS = ['#38bdf8', '#fbbf24', '#f87171', '#34d399'].map(c => `<marker id="mgA${c.slice(1)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('');
  const TX = (x, y, t, c, a) => `<text x="${x}" y="${y}" fill="${c || '#e6edf7'}" font-size="11" text-anchor="${a || 'middle'}">${t}</text>`;
  const FIG = {
    web: ['جناح البرج = جسر واقف: الممرات عصب، والمطرقة شفّة', `<svg viewBox="0 0 320 150" role="img"><defs>${DEFS}</defs>
      <polygon points="40,75 52,54 76,54 88,75 76,96 52,96" fill="none" stroke="#d9c9a8" stroke-width="3"/>${TX(64, 79, 'اللب', '#d9c9a8')}
      <line x1="88" y1="66" x2="262" y2="66" stroke="#8fb3d9" stroke-width="4"/><line x1="88" y1="84" x2="262" y2="84" stroke="#8fb3d9" stroke-width="4"/>
      <line x1="266" y1="40" x2="266" y2="110" stroke="#e0a070" stroke-width="7"/>
      ${TX(175, 58, 'جدران الممرات = العصب (قص)', '#bcd6f2')}${TX(262, 128, 'المطرقة = الشفّة (عزم)', '#f2c19a')}
      ${A(175, 138, 175, 96, '#38bdf8')}${TX(175, 148, 'ريح', '#7dd3fc')}${A(292, 60, 292, 90, '#f87171')}${TX(304, 78, 'ضغط', '#fca5a5', 'middle')}</svg>`],
    cant: ['ليش يستدق؟ العزم أكبر شي عند الجذر وصفر عند الطرف', `<svg viewBox="0 0 320 150" role="img"><defs>${DEFS}</defs>
      <rect x="20" y="18" width="16" height="74" fill="#c9b99a"/><polygon points="36,30 280,40 280,48 36,74" fill="#f59e0b" opacity=".9"/>
      ${A(280, 8, 280, 38, '#38bdf8')}${TX(256, 14, 'وزن الحافة', '#7dd3fc')}${TX(34, 108, 'الجذر', '#e6edf7', 'start')}${TX(282, 62, 'الطرف', '#e6edf7', 'end')}
      <polygon points="36,116 280,116 36,146" fill="#f87171" opacity=".55"/><line x1="36" y1="116" x2="280" y2="116" stroke="#93a4c0"/>
      ${TX(120, 140, 'مخطط العزم: M = P × البعد عن الطرف', '#fecaca')}</svg>`],
    truss: ['كل عضو يشتغل شد أو ضغط فقط', `<svg viewBox="0 0 320 130" role="img"><defs>${DEFS}</defs>
      <polyline points="30,40 95,40 160,40 225,40 290,40" fill="none" stroke="#f87171" stroke-width="3"/><polyline points="62,95 127,95 192,95 257,95" fill="none" stroke="#38bdf8" stroke-width="3"/>
      <polyline points="30,40 62,95 95,40 127,95 160,40 192,95 225,40 257,95 290,40" fill="none" stroke="#cbd5e1" stroke-width="1.6"/>
      ${[30, 95, 160, 225, 290].map(x => `<circle cx="${x}" cy="40" r="3.5" fill="#f8fafc"/>`).join('')}${[62, 127, 192, 257].map(x => `<circle cx="${x}" cy="95" r="3.5" fill="#f8fafc"/>`).join('')}
      ${A(160, 6, 160, 32, '#fbbf24')}${TX(160, 122, 'الفوقاني ينضغط (أحمر) · التحتاني ينشد (أزرق) · القطريات تنقل القص', '#cbd5e1')}</svg>`],
    vortex: ['عرض غير بكل مستوى = إيقاع دوامات غير', `<svg viewBox="0 0 320 140" role="img"><defs>${DEFS}</defs>
      ${[[34, 26, '#f472b6'], [74, 14, '#fbbf24'], [114, 8, '#34d399']].map(([y, r, c], i) => `<circle cx="70" cy="${y}" r="${r / 2 + 3}" fill="none" stroke="${c}" stroke-width="2"/>
        <path d="M${82 + r / 2} ${y} ${Array.from({ length: 5 }, (_, k) => `q${(r + 14) / 2} ${k % 2 ? 9 : -9} ${r + 14} 0`).join(' ')}" fill="none" stroke="${c}" stroke-width="1.8"/>`).join('')}
      ${A(8, 74, 40, 74, '#38bdf8')}${TX(24, 66, 'ريح', '#7dd3fc')}${TX(238, 38, 'عريض ← دوامات بطيئة', '#fbcfe8')}${TX(238, 118, 'نحيف ← دوامات سريعة', '#a7f3d0')}</svg>`],
    outr: ['الجدار العميق يربط العمود باللب: مزدوجة ضد الميلان', `<svg viewBox="0 0 320 150" role="img"><defs>${DEFS}</defs>
      <rect x="140" y="14" width="40" height="124" fill="#d9c9a8" opacity=".85"/><rect x="52" y="14" width="9" height="124" fill="#b9c0cb"/><rect x="259" y="14" width="9" height="124" fill="#b9c0cb"/>
      <rect x="61" y="50" width="79" height="22" fill="#f59e0b"/><rect x="180" y="50" width="79" height="22" fill="#f59e0b"/>
      ${A(10, 30, 46, 30, '#38bdf8')}${TX(26, 22, 'ريح', '#7dd3fc')}${A(56, 132, 56, 96, '#34d399')}${A(264, 96, 264, 132, '#f87171')}
      ${TX(36, 118, 'يخف', '#a7f3d0')}${TX(290, 118, 'ينضغط', '#fca5a5')}${TX(160, 108, 'اللب', '#1f2937')}${TX(100, 44, 'جدار ربط', '#fde68a')}</svg>`]
  };
  const ST = { pid: 'burj', sel: null, also: [], mode: 'struct', off: {}, cutH: 100, cutV: false, tour: -1 };
  let V = null;
  const proj = () => PR()[ST.pid];

  /* =============================== العارض =============================== */
  function mount(host, labelBox, P) {
    const THREE = T(); if (!THREE || !host) return null;
    const rn = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    rn.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rn.localClippingEnabled = true;
    rn.setClearColor(0x0a1224);
    host.innerHTML = ''; host.appendChild(rn.domElement);
    rn.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    const sc = new THREE.Scene();
    sc.fog = new THREE.Fog(0x0a1224, P.view.fog[0], P.view.fog[1]);
    const cam = new THREE.PerspectiveCamera(38, 1, 2, P.view.far);
    sc.add(new THREE.HemisphereLight(0xd6e6ff, 0x232d42, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.85); sun.position.set(0.6, 1, 0.75); sc.add(sun);
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.3); fill.position.set(-0.8, 0.4, -0.6); sc.add(fill);
    // قبة سماء بتدرّج هادئ
    const skyG = new THREE.SphereGeometry(P.view.far * 0.45, 24, 12), skyC = [];
    for (let i = 0; i < skyG.attributes.position.count; i++) { const t = Math.max(0, skyG.attributes.position.getY(i) / (P.view.far * 0.45)); skyC.push(0.04 + 0.05 * (1 - t), 0.07 + 0.09 * (1 - t), 0.14 + 0.16 * (1 - t)); }
    skyG.setAttribute('color', new THREE.Float32BufferAttribute(skyC, 3));
    sc.add(new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    const ctl = new THREE.OrbitControls(cam, rn.domElement);
    ctl.enableDamping = true; ctl.dampingFactor = 0.09; ctl.screenSpacePanning = true;
    ctl.minDistance = P.view.min; ctl.maxDistance = P.view.max; ctl.maxPolarAngle = Math.PI * 0.74;
    const BIG = 1e7, planeH = new THREE.Plane(new THREE.Vector3(0, -1, 0), BIG), planeV = new THREE.Plane(new THREE.Vector3(0, 0, -1), BIG), CLIP = [planeH, planeV];

    const E = {}, batches = {}, labels = [], trash = [];
    const keep = o => { trash.push(o); return o; };
    const ent = el => E[el] || (E[el] = { group: (g => { sc.add(g); return g; })(new THREE.Group()), mats: [], pick: [], box: null });
    function material(el, o) {
      o = o || {};
      const op = o.opacity == null ? 1 : o.opacity;
      const m = keep(new THREE.MeshStandardMaterial({ color: o.color == null ? 0xb9c0cb : o.color, roughness: o.rough == null ? 0.8 : o.rough, metalness: o.metal || 0,
        transparent: true, opacity: op, depthWrite: o.dw === false ? false : op >= 0.9, side: o.side === 2 ? THREE.DoubleSide : o.side === 1 ? THREE.BackSide : THREE.FrontSide,
        vertexColors: !!o.vc, clippingPlanes: CLIP }));
      m.userData = { o: op, dw: m.depthWrite, kind: 'mesh' };
      ent(el).mats.push(m); return m;
    }
    function addMesh(el, geom, mat, pickable) {
      const me = new THREE.Mesh(keep(geom), mat); me.userData.el = el; me.renderOrder = mat.userData.o < 0.9 ? 2 : 0; ent(el).group.add(me);
      if (pickable !== false) ent(el).pick.push(me);
      return me;
    }
    function merge(list) {
      let n = 0;
      const parts = list.map(g => { const q = g.index ? g.toNonIndexed() : g; if (q !== g) g.dispose(); n += q.attributes.position.count; return q; });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      parts.forEach(q => { pos.set(q.attributes.position.array, o); nor.set(q.attributes.normal.array, o); o += q.attributes.position.array.length; q.dispose(); });
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      return out;
    }
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    function geo(pos, idx) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (idx) g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    /* ---------- واجهة البناء اللي تستعملها المشاريع ---------- */
    const C = {
      THREE, geo,
      use(el, key, opt) {
        const id = el + '|' + key, b = batches[id] || (batches[id] = { el, opt, list: [] });
        const api = {
          geom(g) { b.list.push(g); return api; },
          box(len, thick, y0, y1, x, z, ang) {
            const g = new THREE.BoxGeometry(Math.max(len, 0.05), Math.max(y1 - y0, 0.05), Math.max(thick, 0.05));
            g.applyMatrix4(M4.makeRotationY(-(ang || 0)).setPosition(x, (y0 + y1) / 2, z)); b.list.push(g); return api;
          },
          cyl(rt, rb, y0, y1, x, z, seg, rot) {
            const g = new THREE.CylinderGeometry(rt, rb, Math.max(y1 - y0, 0.05), seg || 10);
            g.applyMatrix4(M4.makeRotationY(-(rot || 0)).setPosition(x, (y0 + y1) / 2, z)); b.list.push(g); return api;
          },
          strut(p0, p1, r) {
            const a = v3(p0), d = v3(p1).sub(a), len = d.length(); if (len < 0.01) return api;
            const g = new THREE.CylinderGeometry(r, r, len, 6);
            Q.setFromUnitVectors(UP, d.clone().normalize());
            g.applyMatrix4(M4.makeRotationFromQuaternion(Q).setPosition(a.x + d.x / 2, a.y + d.y / 2, a.z + d.z / 2)); b.list.push(g); return api;
          },
          prism(pts, y0, y1) {
            const sh = new THREE.Shape(); pts.forEach((p, i) => (i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1])));
            const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(y1 - y0, 0.05), bevelEnabled: false, curveSegments: 1 });
            g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); b.list.push(g); return api;
          },
          taper(root, tip, w0, d0, w1, d1) {                      // جسر كابولي يستدق: السطح العلوي بين النقطتين والمقطع ينزل تحته
            const ax = tip[0] - root[0], az = tip[2] - root[2], l = Math.hypot(ax, az) || 1, px = -az / l, pz = ax / l;
            const P8 = [[root, w0, d0], [tip, w1, d1]].map(([p, w, d]) => [[p[0] + px * w / 2, p[1], p[2] + pz * w / 2], [p[0] - px * w / 2, p[1], p[2] - pz * w / 2],
              [p[0] - px * w / 2, p[1] - d, p[2] - pz * w / 2], [p[0] + px * w / 2, p[1] - d, p[2] + pz * w / 2]]);
            const A = P8[0], B = P8[1], pos = [], quad = (a, b2, c2, d2) => [a, b2, c2, a, c2, d2].forEach(q => pos.push(q[0], q[1], q[2]));
            quad(A[0], A[1], A[2], A[3]); quad(B[1], B[0], B[3], B[2]);
            for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(A[j], A[i], B[i], B[j]); }
            const g = geo(pos); b.list.push(g); return api;
          },
          tube(pts, r) {
            const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v3)), 18, r, 8, false); b.list.push(g); return api;
          }
        };
        return api;
      },
      inst(el, key, opt, shape, at) {
        const g = new THREE.CylinderGeometry(shape[1], shape[2], shape[3], shape[4] || 10), m = material(el, opt);
        const im = new THREE.InstancedMesh(keep(g), m, at.length);
        at.forEach((p, i) => im.setMatrixAt(i, M4.makeTranslation(p[0], p[1], p[2])));
        im.instanceMatrix.needsUpdate = true; im.userData.el = el; ent(el).group.add(im); ent(el).pick.push(im);
        ent(el).box = new THREE.Box3().setFromPoints(at.map(p => new THREE.Vector3(p[0], p[1] + shape[3] / 2, p[2])).concat(at.map(p => new THREE.Vector3(p[0], p[1] - shape[3] / 2, p[2]))));
      },
      surface(el, key, opt, pos, idx, col) {
        const g = geo(pos, idx); if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        addMesh(el, g, material(el, opt));
      },
      lines(el, arr, color, opacity) {
        const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const m = keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacity == null ? 1 : opacity, clippingPlanes: CLIP }));
        m.userData = { o: m.opacity, kind: 'line' }; ent(el).mats.push(m);
        const ln = new THREE.LineSegments(g, m); ln.userData.el = el; ent(el).group.add(ln); ent(el).pick.push(ln);
      },
      points(el, arr, color, size) {
        const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const m = keep(new THREE.PointsMaterial({ color, size: size || 2, sizeAttenuation: false, transparent: true, opacity: 0.95, clippingPlanes: CLIP }));
        m.userData = { o: 0.95, kind: 'line' }; ent(el).mats.push(m);
        ent(el).group.add(new THREE.Points(g, m));
      },
      label(text, pos, cls, el) {
        const d = document.createElement('div'); d.className = 'mg-lab ' + (cls || ''); d.textContent = text; labelBox.appendChild(d);
        labels.push({ d, p: v3(pos), el: el || null });
      },
      ground(el, R, color, y) {
        const g = new THREE.CircleGeometry(R, 64); g.rotateX(-Math.PI / 2); g.translate(0, y || 0, 0);
        addMesh(el, g, material(el, { color, rough: 0.95 }));
      },
      pit(el, R, yb, bands, groundR, groundColor) {                 // حفرة مقطوعة تبيّن ما تحت الأرض + سطح الأرض حولها
        const g = new THREE.CylinderGeometry(R, R, -yb, 64, 24, true); g.translate(0, yb / 2, 0);
        const col = [], c1 = new THREE.Color(), c2 = new THREE.Color();
        for (let i = 0; i < g.attributes.position.count; i++) {
          const y = g.attributes.position.getY(i); let k = 0; while (k < bands.length - 2 && y < bands[k + 1][0]) k++;
          const t = Math.min(1, Math.max(0, (bands[k][0] - y) / ((bands[k][0] - bands[k + 1][0]) || 1)));
          c1.setHex(bands[k][1]); c2.setHex(bands[k + 1][1]); c1.lerp(c2, t); col.push(c1.r, c1.g, c1.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        addMesh(el, g, material(el, { vc: true, color: 0xffffff, rough: 1, side: 1 }));
        const bot = new THREE.CircleGeometry(R, 64); bot.rotateX(-Math.PI / 2); bot.translate(0, yb, 0);
        addMesh(el, bot, material(el, { color: bands[bands.length - 1][1], rough: 1 }));
        const ring = new THREE.RingGeometry(R, groundR, 64, 1); ring.rotateX(-Math.PI / 2);
        const rm = keep(new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.95, clippingPlanes: CLIP }));
        sc.add(new THREE.Mesh(keep(ring), rm));
      }
    };
    P.build(C);
    Object.keys(batches).forEach(id => { const b = batches[id]; if (b.list.length) addMesh(b.el, merge(b.list), material(b.el, b.opt)); });
    Object.keys(E).forEach(el => { if (!E[el].box) { const bx = new THREE.Box3().setFromObject(E[el].group); E[el].box = bx; } });

    /* ---------- الحالة: الطبقات، الاختيار، القطع ---------- */
    let dirty = true, raf = 0, dead = false, tween = null, anim = null, last = 0;
    const touch = () => { dirty = true; };
    function paint() {
      const sel = ST.sel, also = ST.also || [];
      Object.keys(E).forEach(el => {
        const e = E[el], hit = sel === el, near = also.includes(el), ghost = sel && !hit && !near;
        e.group.visible = !ST.off[el];
        e.mats.forEach(m => {
          const u = m.userData, o = ghost ? Math.min(u.o, u.o < 0.9 ? 0.05 : 0.11) : u.o;
          m.opacity = o;
          if (u.kind === 'mesh') { m.depthWrite = ghost ? false : u.dw; m.emissive.setHex(hit ? 0x3a2f08 : 0x000000); m.emissiveIntensity = hit ? 1 : 0; }
        });
      });
      touch();
    }
    function setCut() {
      const y = ST.cutH >= 100 ? null : P.view.ymin + (P.view.ymax - P.view.ymin) * ST.cutH / 100;
      planeH.constant = y == null ? BIG : y; planeV.constant = ST.cutV ? 0 : BIG; touch();
      return y;
    }
    function fly(pos, tgt, ms) {
      tween = { t0: performance.now(), ms: ms || 900, p0: cam.position.clone(), q0: ctl.target.clone(), p1: v3(pos), q1: v3(tgt) }; touch();
    }
    function fitView(name) {                                       // يحسب بُعد الكاميرا حتى يبيّن المجسم كله مهما كان شكل الشاشة
      const vw = P.view, d = v3(vw.dirs[name] || vw.dirs.home).normalize(), tv = Math.tan(cam.fov * Math.PI / 360), top = name === 'top';
      const tall = top ? vw.d : vw.h, wide = vw.w;
      const dist = Math.min(vw.max * 0.95, Math.max(tall / 2 / tv, wide / 2 / tv / cam.aspect) * 1.06 + (top ? vw.h / 2 : vw.d * 0.2));
      return [[vw.c[0] + d.x * dist, (top ? 0 : vw.c[1]) + d.y * dist, vw.c[2] + d.z * dist], top ? [vw.c[0], 0, vw.c[2]] : vw.c];
    }
    function view(name, fast) {
      const v = fitView(name);
      if (fast) { cam.position.set(v[0][0], v[0][1], v[0][2]); ctl.target.set(v[1][0], v[1][1], v[1][2]); ctl.update(); touch(); } else fly(v[0], v[1]);
    }
    function focus(el) {
      const e = E[el]; if (!e || !e.box || e.box.isEmpty()) return;
      const c = e.box.getCenter(new THREE.Vector3()), s = e.box.getSize(new THREE.Vector3()), d = v3((P.els[el] && P.els[el].dir) || [1, 0.4, 1]).normalize();
      const fov = cam.fov * Math.PI / 360, fit = Math.max(s.y / 2 / Math.tan(fov), Math.max(s.x, s.z) / 2 / Math.tan(fov) / cam.aspect) * 1.12 + Math.min(s.x, s.z) * 0.3;
      const dist = Math.min(P.view.max * 0.9, Math.max(P.view.min * 1.3, fit));
      fly([c.x + d.x * dist, c.y + d.y * dist, c.z + d.z * dist], [c.x, c.y, c.z]);
    }
    /* ---------- الأوضاع المتحركة: مسار الحمل والريح ---------- */
    function clearAnim() {
      if (!anim) return;
      sc.remove(anim.g); anim.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      anim.labels.forEach(l => { l.d.remove(); labels.splice(labels.indexOf(l), 1); });
      anim = null;
    }
    function tmpLabel(text, pos, cls) { const d = document.createElement('div'); d.className = 'mg-lab ' + cls; d.textContent = text; labelBox.appendChild(d); const l = { d, p: v3(pos), el: null }; labels.push(l); return l; }
    function setMode(mode) {
      clearAnim();
      if (mode === 'load' && P.paths) {
        const g = new THREE.Group(), paths = P.paths().map(p => {
          const pts = p.pts.map(v3), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
          const lg = new THREE.BufferGeometry().setFromPoints(pts);
          g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: p.c, transparent: true, opacity: 0.4, depthTest: false })));
          return { pts, cum, L: cum[cum.length - 1], n: p.n, sp: p.sp, c: new THREE.Color(p.c) };
        });
        const N = paths.reduce((a, p) => a + p.n, 0), pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
        let k = 0; paths.forEach(p => { for (let i = 0; i < p.n; i++, k++) { col[k * 3] = p.c.r; col[k * 3 + 1] = p.c.g; col[k * 3 + 2] = p.c.b; } });
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true, opacity: 0.98 })));
        sc.add(g);
        anim = { g, labels: [], step(t) {
          let q = 0;
          paths.forEach(p => { for (let i = 0; i < p.n; i++, q++) {
            const s = (t * p.sp + i * p.L / p.n) % p.L; let j = 1; while (j < p.cum.length - 1 && p.cum[j] < s) j++;
            const f = (s - p.cum[j - 1]) / ((p.cum[j] - p.cum[j - 1]) || 1), a = p.pts[j - 1], b = p.pts[j];
            pos[q * 3] = a.x + (b.x - a.x) * f; pos[q * 3 + 1] = a.y + (b.y - a.y) * f; pos[q * 3 + 2] = a.z + (b.z - a.z) * f;
          } });
          pg.attributes.position.needsUpdate = true;
        } };
      } else if (mode === 'wind' && P.wind) {
        const g = new THREE.Group(), cols = [0x38bdf8, 0x34d399, 0xfbbf24, 0xf472b6], U = 55, D0 = P.windD(P.wind.ys[0]), lab = [];
        const sheets = P.wind.ys.map((y, li) => {
          const D = P.windD(y), R = D / 2, n = 170, arr = new Float32Array(n * 6), ps = [];
          for (let i = 0; i < n; i++) ps.push({ x: -330 + Math.random() * 760, z: (Math.random() * 2 - 1) * 175 });
          const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
          g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: cols[li % 4], transparent: true, opacity: 0.85 })));
          lab.push(tmpLabel(Math.round(y) + ' م · عرض ≈ ' + Math.round(D) + ' م · إيقاع الدوامات ×' + (D0 / D).toFixed(1), [-D0 * 0.5 - 150, y, 190], 'wnd w' + (li % 4)));
          return { y, R, D, n, arr, ps, lg, T: D / (0.2 * U) };
        });
        lab.push(tmpLabel('اتجاه الريح ←', [-360, P.wind.ys[P.wind.ys.length - 1] + 40, 0], 'wnd'));
        sc.add(g);
        anim = { g, labels: lab, step(t, dt) {
          sheets.forEach(s => {
            const R2 = s.R * s.R;
            for (let i = 0; i < s.n; i++) {
              const p = s.ps[i]; let r2 = p.x * p.x + p.z * p.z;
              if (p.x > 430 || r2 < R2 * 1.02 || Math.abs(p.z) > 190) { p.x = -330 - Math.random() * 30; p.z = (Math.random() * 2 - 1) * 175; r2 = p.x * p.x + p.z * p.z; }
              const r4 = r2 * r2; let u = U * (1 - R2 * (p.x * p.x - p.z * p.z) / r4), w = -U * 2 * R2 * p.x * p.z / r4;
              if (p.x > 0.4 * s.R) {                               // أثر البرج: دوامات تتبادل يمين ويسار
                const lat = Math.exp(-Math.pow(p.z / (1.3 * s.R), 2)), grow = Math.min(1, p.x / (2 * s.R)) * Math.exp(-p.x / (16 * s.R));
                w += 0.8 * U * lat * grow * Math.sin(2 * Math.PI * (t / s.T - p.x / (4 * s.D)));
                u *= 1 - 0.45 * Math.exp(-Math.pow(p.z / (0.9 * s.R), 2)) * Math.exp(-p.x / (9 * s.R));
              }
              p.x += u * dt; p.z += w * dt;
              const o = i * 6; s.arr[o] = p.x; s.arr[o + 1] = s.y; s.arr[o + 2] = p.z; s.arr[o + 3] = p.x - u * 0.42; s.arr[o + 4] = s.y; s.arr[o + 5] = p.z - w * 0.42;
            }
            s.lg.attributes.position.needsUpdate = true;
          });
        } };
      }
      touch();
    }
    /* ---------- الاختيار بالضغط والتلميح بالمرور ---------- */
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); ray.params.Line.threshold = P.view.max > 2000 ? 1.5 : 0.7;
    function hitAt(ev) {
      const r = rn.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const list = []; Object.keys(E).forEach(el => { if (!ST.off[el] && P.els[el]) E[el].pick.forEach(o => list.push(o)); });
      const hits = ray.intersectObjects(list, false);
      for (let i = 0; i < hits.length; i++) { const p = hits[i].point; if (planeH.distanceToPoint(p) >= 0 && planeV.distanceToPoint(p) >= 0) return hits[i].object.userData.el; }
      return null;
    }
    let down = null, hov = 0;
    const el0 = rn.domElement;
    const onDown = e => { down = [e.clientX, e.clientY]; };
    const onUp = e => {
      if (!down) return; const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
      if (moved > 6) return;
      const el = hitAt(e); if (V && V.onPick) V.onPick(el);
    };
    const onMove = e => {
      if (down || e.pointerType === 'touch') return;
      if (hov) return; hov = requestAnimationFrame(() => { hov = 0; if (dead) return; const el = hitAt(e); el0.style.cursor = el ? 'pointer' : 'grab'; if (V && V.onHover) V.onHover(el, e); });
    };
    el0.addEventListener('pointerdown', onDown); el0.addEventListener('pointerup', onUp); el0.addEventListener('pointermove', onMove);
    el0.addEventListener('pointerleave', () => { if (V && V.onHover) V.onHover(null); });
    ctl.addEventListener('start', () => { tween = null; });

    /* ---------- الحلقة ---------- */
    const pv = new THREE.Vector3();
    function placeLabels() {
      const w = el0.clientWidth, h = el0.clientHeight;
      labels.forEach(l => {
        pv.copy(l.p).project(cam);
        const ok = pv.z < 1 && pv.z > -1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05 && !(l.el && ST.off[l.el]) && planeH.distanceToPoint(l.p) >= -0.5;
        l.d.style.display = ok ? '' : 'none';
        if (ok) l.d.style.transform = 'translate(' + ((pv.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - pv.y) / 2 * h).toFixed(1) + 'px)';
      });
    }
    function size() {
      const w = Math.max(240, host.clientWidth), h = Math.max(260, host.clientHeight);
      rn.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); touch();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(host); else window.addEventListener('resize', size);
    function tick(now) {
      if (dead) return;
      if (!el0.isConnected) return dispose();
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      if (tween) {
        const k = Math.min(1, (now - tween.t0) / tween.ms), s = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        cam.position.lerpVectors(tween.p0, tween.p1, s); ctl.target.lerpVectors(tween.q0, tween.q1, s);
        if (k >= 1) tween = null; dirty = true;
      }
      if (ctl.update()) dirty = true;
      if (anim) { anim.step(now / 1000, dt); dirty = true; }
      if (dirty) { dirty = false; rn.render(sc, cam); placeLabels(); }
    }
    function dispose() {
      if (dead) return; dead = true; cancelAnimationFrame(raf); clearAnim();
      if (ro) ro.disconnect(); else window.removeEventListener('resize', size);
      ctl.dispose(); trash.forEach(o => o.dispose && o.dispose()); skyG.dispose(); rn.dispose();
      labels.forEach(l => l.d.remove());
      if (V && V.rn === rn) V = null;
    }
    size(); view('home', true); paint(); setCut();
    raf = requestAnimationFrame(tick);
    return { rn, paint, setCut, setMode, view, focus, fly, dispose, touch, has: el => !!E[el], els: () => Object.keys(E) };
  }

  /* =============================== الواجهة =============================== */
  const srcRefs = (P, ids) => (ids || []).map(i => `<a href="#mgSrc" class="mg-ref" data-mg="src">[${i}]</a>`).join('');
  function infoHtml() {
    const P = proj(), el = ST.sel && P.els[ST.sel];
    const modeBox = ST.mode === 'load' ? `<div class="mg-modebox">${P.loadText || ''}</div>` : ST.mode === 'wind' && P.wind ? `<div class="mg-modebox">${P.wind.text}</div>` : '';
    if (!el) {
      return modeBox + `<div class="mg-card"><div class="mg-kick">${esc(P.place)} · ${esc(P.year)}</div><h3>${P.ic} ${esc(P.name)} <small dir="ltr">${esc(P.en)}</small></h3>
        ${P.idea.map(t => `<p>${t}</p>`).join('')}
        <div class="mg-hint">👆 اضغط أي عنصر بالمجسم — أو اختاره من هنا:</div>
        <div class="mg-els">${P.layers.filter(l => P.els[l[0]]).map(l => `<button data-mg="pick" data-el="${l[0]}">${esc(P.els[l[0]].name)}</button>`).join('')}</div></div>`;
    }
    const q = 'اشرح لي «' + el.name + '» بمشروع ' + P.name + ': ليش موجود بهذا المكان وشلون ينتقل الحمل بيه؟';
    return modeBox + `<div class="mg-card sel"><button class="mg-x" data-mg="unsel" title="رجوع لنظرة المشروع">✕</button>
      <div class="mg-kick">${P.ic} ${esc(P.name)}</div><h3>${esc(el.name)} <small dir="ltr">${esc(el.en)}</small></h3>
      <div class="mg-q q1"><h4>🧱 شنو هذا؟</h4><p>${el.what}</p></div>
      <div class="mg-q q2"><h4>📍 ليش هنا؟</h4><p>${el.why}</p></div>
      <div class="mg-q q3"><h4>⬇️ شلون ينتقل الحمل؟</h4><p>${el.load}</p></div>
      ${el.fig && FIG[el.fig] ? `<figure class="mg-fig">${FIG[el.fig][1]}<figcaption>${esc(FIG[el.fig][0])}</figcaption></figure>` : ''}
      ${el.nums && el.nums.length ? `<table class="mg-nums"><tbody>${el.nums.map(n => `<tr><td>${esc(n[0])}</td><td><b>${esc(n[1])}</b></td></tr>`).join('')}</tbody></table>` : ''}
      ${el.aci ? `<div class="mg-aci">📐 ${esc(el.aci)}</div>` : ''}
      <div class="mg-acts">${el.lab && LAB[el.lab] ? `<button class="btn gh" data-mg="lab" data-lab="${el.lab}">🔬 جرّب الفكرة: ${esc(LAB[el.lab])}</button>` : ''}
        ${window.AIASK ? `<button class="btn gh" data-mg="ask" data-q="${esc(q)}">🤖 اسأل المساعد</button>` : ''}</div>
      <div class="mg-srcs">المصدر: ${srcRefs(P, el.src)}</div></div>`;
  }
  function belowHtml() {
    const P = proj();
    return `<div class="card mg-facts"><h3>📊 أرقام منشورة</h3><div class="mg-fgrid">${P.facts.map(f => `<div class="mg-fact"><span>${esc(f[0])}</span><b>${esc(f[1])}</b><small>${esc(f[2]).replace(/\[(\d)\]/g, '<a href="#mgSrc" class="mg-ref" data-mg="src">[$1]</a>')}</small></div>`).join('')}</div></div>
      <div class="card"><h3>🎓 شنو نتعلم منه؟</h3><div class="mg-less">${P.lessons.map((l, i) => `<div><i>${i + 1}</i><b>${esc(l[0])}</b><p>${esc(l[1])}</p></div>`).join('')}</div></div>
      <div class="card" id="mgSrc"><h3>📚 المصادر</h3><ol class="mg-srcl">${P.sources.map(s => `<li value="${s[0]}">${s[2] ? `<a href="${esc(s[2])}" target="_blank" rel="noopener noreferrer">${esc(s[1])} ↗</a>` : esc(s[1])}</li>`).join('')}</ol>
        <div class="mg-note">ℹ️ ${esc(P.note)} هذا القسم تعليمي بحت، وما يُعتمد عليه بتصميم أو تنفيذ.</div></div>`;
  }
  const pageHtml = () => {
    const R = PR();
    if (!R.order || !T()) return '<div class="card">وحدة المشاريع الكبيرة غير محمَّلة.</div>';
    return `<div class="mg">
      <div class="mg-pick">${R.order.map(id => { const P = R[id]; return `<button class="mg-proj ${id === ST.pid ? 'on' : ''}" data-mg="proj" data-id="${id}">
        <span class="ic">${P.ic}</span><span><b>${esc(P.name)}</b><small>${esc(P.place)} · ${esc(P.tag)}</small></span></button>`; }).join('')}</div>
      <div class="mg-stage">
        <div class="mg-view" id="mgView">
          <div class="mg-canvas" id="mgCanvas"></div><div class="mg-labels" id="mgLabels"></div>
          <div class="mg-hud tl" id="mgModes"></div>
          <div class="mg-hud tr"><button data-mg="view" data-v="home" title="المنظر الرئيسي">🏠</button><button data-mg="view" data-v="top" title="مسقط من فوق">⬇️ مسقط</button>
            <button data-mg="view" data-v="front" title="واجهة">↔️ واجهة</button><button data-mg="full" title="ملء الشاشة">⛶</button></div>
          <div class="mg-tip" id="mgTip" hidden></div>
          <div class="mg-tour" id="mgTour"></div>
          <div class="mg-hud bl"><label class="mg-cut">✂️ قطع أفقي <input type="range" min="0" max="100" value="100" id="mgCutH" aria-label="منسوب القطع الأفقي"><b id="mgCutT">كامل الارتفاع</b></label>
            <label class="mg-chk"><input type="checkbox" id="mgCutV"> مقطع عمودي</label></div>
          <div class="mg-ro">👁️ عرض فقط · دوّر بالسحب · قرّب بالعجلة · اضغط أي عنصر</div>
        </div>
        <aside class="mg-side"><div class="mg-layers" id="mgLayers"></div><div id="mgInfo"></div></aside>
      </div>
      <div class="mg-below" id="mgBelow"></div></div>`;
  };
  const $ = id => document.getElementById(id);
  function paintUi() {
    const P = proj(); if (!$('mgInfo')) return;
    $('mgModes').innerHTML = P.modes.map(m => `<button class="${ST.mode === m[0] ? 'on' : ''}" data-mg="mode" data-v="${m[0]}">${m[1]}</button>`).join('') +
      `<button class="tour ${ST.tour >= 0 ? 'on' : ''}" data-mg="tour">▶️ جولة مشروحة</button>`;
    $('mgLayers').innerHTML = '<span class="mg-lt">الطبقات:</span>' + P.layers.map(l => `<button class="${ST.off[l[0]] ? '' : 'on'} ${ST.sel === l[0] ? 'sel' : ''}" data-mg="layer" data-el="${l[0]}">${esc(l[1])}</button>`).join('') +
      '<button class="all" data-mg="reset" title="رجّع كل شي مثل البداية">↺</button>';
    $('mgInfo').innerHTML = infoHtml();
    const t = P.tour[ST.tour], box = $('mgTour'); $('mgView').classList.toggle('touring', !!t);
    box.innerHTML = t ? `<div class="mg-tcard"><div class="mg-tn">${ST.tour + 1} / ${P.tour.length}</div><b>${esc(t.t)}</b><p>${esc(t.x)}</p>
      <div class="mg-tb"><button data-mg="tprev" ${ST.tour ? '' : 'disabled'}>→ السابق</button><button class="go" data-mg="tnext">${ST.tour < P.tour.length - 1 ? 'التالي ←' : 'إنهاء ✓'}</button><button data-mg="tend" title="إغلاق الجولة">✕</button></div></div>` : '';
    const y = ST.cutH >= 100 ? P.view.ymax + 1 : P.view.ymin + (P.view.ymax - P.view.ymin) * ST.cutH / 100;
    $('mgCutH').value = ST.cutH; $('mgCutV').checked = ST.cutV;
    $('mgCutT').textContent = ST.cutH >= 100 ? 'كامل الارتفاع' : Math.round(y) + ' م · ' + P.cutText(y);
  }
  function defaults() { const P = proj(); ST.off = {}; P.layers.forEach(l => { if (!l[2]) ST.off[l[0]] = true; }); ST.sel = null; ST.also = []; ST.mode = 'struct'; ST.cutH = 100; ST.cutV = false; }
  function apply(camFn) { if (!V) return; V.paint(); V.setCut(); V.setMode(ST.mode); paintUi(); if (camFn) camFn(); }
  function select(el, also) {
    const P = proj(); if (el && !P.els[el]) el = null;
    ST.sel = el; ST.also = also || (el && P.els[el].with) || [];
    if (el) { ST.off[el] = false; ST.also.forEach(a => { ST.off[a] = false; }); }
    if (V) { V.paint(); if (el) V.focus(el); }
    paintUi();
  }
  function tourGo(i) {
    const P = proj(); if (i < 0 || i >= P.tour.length) { ST.tour = -1; defaults(); return apply(() => V.view('home')); }
    const t = P.tour[i]; ST.tour = i; defaults();
    (t.on || []).forEach(l => { ST.off[l] = false; }); (t.off || []).forEach(l => { ST.off[l] = true; });
    ST.mode = t.mode || 'struct'; ST.cutV = !!t.cutV;
    if (t.cutH != null) ST.cutH = Math.round(100 * (t.cutH - P.view.ymin) / (P.view.ymax - P.view.ymin));
    ST.sel = t.el || null; ST.also = (t.also || []).concat((t.el && P.els[t.el].with) || []); if (t.el) ST.off[t.el] = false; ST.also.forEach(a => { ST.off[a] = false; });
    apply(() => { if (t.cam) V.fly(t.cam[0], t.cam[1], 1100); else if (t.el) V.focus(t.el); else V.view('home'); });
  }
  function start(pid) {
    if (V) V.dispose();
    ST.pid = PR()[pid] ? pid : 'burj'; ST.tour = -1; defaults();
    const P = proj();
    document.querySelectorAll('.mg-proj').forEach(b => b.classList.toggle('on', b.dataset.id === ST.pid));
    $('mgLabels').innerHTML = '';
    try { V = mount($('mgCanvas'), $('mgLabels'), P); } catch (e) { console.error(e); V = null; }
    if (!V) { $('mgCanvas').innerHTML = '<div class="mg-nogl">المتصفح ما قدر يشغّل العرض الثلاثي (WebGL). الشرح والأرقام تحت يشتغلون عادي.</div>'; }
    else {
      V.onPick = el => { if (ST.tour >= 0 && !el) return; select(el === ST.sel ? null : el); };
      V.onHover = (el, e) => {
        const tip = $('mgTip'); if (!tip) return;
        if (!el || !P.els[el]) { tip.hidden = true; return; }
        const r = $('mgView').getBoundingClientRect(); tip.hidden = false; tip.textContent = P.els[el].name;
        tip.style.transform = 'translate(' + (e.clientX - r.left + 14) + 'px,' + (e.clientY - r.top + 14) + 'px)';
      };
      V.setMode('struct');
    }
    $('mgBelow').innerHTML = belowHtml(); paintUi();
  }
  function init() {
    const root = document.querySelector('#view .mg'); if (!root) return;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-mg]'); if (!b) return;
      const a = b.dataset.mg, P = proj();
      if (a === 'proj') return start(b.dataset.id);
      if (a === 'src') { e.preventDefault(); const s = $('mgSrc'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (a === 'lab') { if (window.LAYERS) LAYERS.openLab(b.dataset.lab); return; }
      if (a === 'ask') { if (window.AIASK) AIASK.ask(b.dataset.q); return; }
      if (a === 'full') { const v = $('mgView'); if (document.fullscreenElement) document.exitFullscreen(); else if (v.requestFullscreen) v.requestFullscreen().catch(() => { /* غير مدعوم */ }); return; }
      if (!V) return;
      if (a === 'view') return V.view(b.dataset.v);
      if (a === 'mode') { ST.mode = ST.mode === b.dataset.v ? 'struct' : b.dataset.v; V.setMode(ST.mode); if (ST.mode !== 'struct') { ST.sel = null; ST.also = []; V.paint(); V.view('home'); } return paintUi(); }
      if (a === 'layer') { const el = b.dataset.el; ST.off[el] = !ST.off[el]; if (ST.off[el] && ST.sel === el) { ST.sel = null; ST.also = []; } V.paint(); return paintUi(); }
      if (a === 'pick') return select(b.dataset.el);
      if (a === 'unsel') return select(null);
      if (a === 'reset') { ST.tour = -1; defaults(); return apply(() => V.view('home')); }
      if (a === 'tour') return tourGo(ST.tour >= 0 ? -1 : 0);
      if (a === 'tnext') return tourGo(ST.tour + 1 >= P.tour.length ? -1 : ST.tour + 1);
      if (a === 'tprev') return tourGo(Math.max(0, ST.tour - 1));
      if (a === 'tend') return tourGo(-1);
    });
    root.addEventListener('input', e => {
      if (!V) return;
      if (e.target.id === 'mgCutH') { ST.cutH = +e.target.value; V.setCut(); paintUi(); }
      if (e.target.id === 'mgCutV') { ST.cutV = e.target.checked; V.setCut(); }
    });
    start(ST.pid);
  }
  // ملخص للمساعد الذكي: المشروع والعنصر المفتوح
  function current() {
    const P = proj(); if (!P || !document.querySelector('#view .mg')) return null;
    const el = ST.sel && P.els[ST.sel], strip = s => String(s || '').replace(/<[^>]+>/g, '');
    return { project: P.name + ' (' + P.en + ')', facts: P.facts.map(f => f[0] + ': ' + f[1]).join(' · '),
      element: el ? { name: el.name, what: strip(el.what), why: strip(el.why), load: strip(el.load), numbers: (el.nums || []).map(n => n[0] + ': ' + n[1]).join(' · ') } : null };
  }
  return { pageHtml, init, current, select, state: () => ST, viewer: () => V, tour: tourGo, start };
})();
window.MEGA = MEGA;
