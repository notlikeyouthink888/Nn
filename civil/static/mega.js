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
      ${TX(36, 118, 'يخف', '#a7f3d0')}${TX(290, 118, 'ينضغط', '#fca5a5')}${TX(160, 108, 'اللب', '#1f2937')}</svg>`],
    lean: ['الوزن المايل يسوي عزماً: جهة تنضغط وجهة تنشد', `<svg viewBox="0 0 320 150" role="img"><defs>${DEFS}</defs>
      <polygon points="150,130 190,130 120,20 80,20" fill="#8fb4d6" opacity=".55"/><rect x="160" y="18" width="16" height="112" fill="#c9b99a"/>
      <rect x="60" y="130" width="200" height="10" fill="#9aa3ad"/>${A(100, 40, 100, 74, '#fbbf24')}${TX(100, 34, 'وزن الطوابق المايلة', '#fde68a')}
      ${A(85, 148, 85, 118, '#f87171')}${A(235, 118, 235, 148, '#34d399')}${TX(52, 128, 'ضغط', '#fca5a5', 'start')}${TX(292, 128, 'شد', '#a7f3d0', 'end')}
      ${TX(168, 12, 'لب مشدود مسبقاً', '#e6edf7')}`],
    hang: ['الطوابق معلّقة: الحمل يصعد بالشد ثم ينزل بالبرجين', `<svg viewBox="0 0 320 150" role="img"><defs>${DEFS}</defs>
      <rect x="20" y="20" width="36" height="125" fill="#c9b99a"/><rect x="264" y="20" width="36" height="125" fill="#c9b99a"/>
      <polyline points="56,20 96,44 136,20 176,44 216,20 264,44" fill="none" stroke="#cbd5e1" stroke-width="2"/><line x1="56" y1="20" x2="264" y2="20" stroke="#f87171" stroke-width="3"/><line x1="56" y1="44" x2="264" y2="44" stroke="#38bdf8" stroke-width="3"/>
      ${[96, 136, 176, 216].map(x => `<line x1="${x}" y1="44" x2="${x}" y2="100" stroke="#a7f3d0" stroke-width="2"/>`).join('')}
      ${[60, 76, 92].map(y => `<line x1="80" y1="${y}" x2="240" y2="${y}" stroke="#8fb4d6" stroke-width="5"/>`).join('')}
      ${A(160, 110, 160, 50, '#34d399')}${A(38, 60, 38, 140, '#fbbf24')}${A(282, 60, 282, 140, '#fbbf24')}${TX(160, 126, 'علّاقات تنشد ← الجملون ← البرجين', '#d1fae5')}`],
    tie: ['الساق المايلة تدفع لبرّه — والبلاطة المشدودة تربطها مثل وتر القوس', `<svg viewBox="0 0 320 150" role="img"><defs>${DEFS}</defs>
      <rect x="60" y="14" width="22" height="116" fill="#c9b99a"/><path d="M98 14 L120 14 Q140 90 250 130 L214 130 Q120 96 98 40 Z" fill="#c9b99a"/>
      <rect x="54" y="130" width="206" height="12" fill="#9aa3ad"/><line x1="58" y1="136" x2="256" y2="136" stroke="#f87171" stroke-width="3"/>
      ${A(236, 118, 286, 118, '#fbbf24')}${TX(290, 108, 'دفع', '#fde68a', 'end')}${TX(158, 150, 'بلاطة القاعدة مشدودة مسبقاً', '#fecaca')}${TX(100, 44, 'جدار ربط', '#fde68a')}</svg>`]
  };
  const ST = { pid: 'burj', sel: null, also: [], mode: 'struct', off: {}, cutH: 100, cutV: false, tour: -1, sky: 'day', pt: null };
  let V = null;
  const proj = () => PR()[ST.pid];

  /* =============================== العارض =============================== */
  function mount(host, labelBox, P) {
    const THREE = T(); if (!THREE || !host) return null;
    const rn = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    rn.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rn.localClippingEnabled = true;
    rn.outputEncoding = THREE.sRGBEncoding;                        // ألوان وإضاءة أقرب للواقع: ترميز sRGB + خرائط نغمية سينمائية
    rn.toneMapping = THREE.ACESFilmicToneMapping; rn.toneMappingExposure = 1.0;
    rn.shadowMap.enabled = true; rn.shadowMap.type = THREE.PCFSoftShadowMap;
    host.innerHTML = ''; host.appendChild(rn.domElement);
    rn.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    const lin = h => new THREE.Color(h).convertSRGBToLinear();
    const sc = new THREE.Scene();
    sc.fog = new THREE.Fog(0x0a1224, P.view.fog[0], P.view.fog[1]);
    const cam = new THREE.PerspectiveCamera(38, 1, 2, P.view.far);
    const VW = P.view, EXT = Math.max(VW.w, VW.h, VW.d) * 0.62;
    const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x3a3f4a, 0.6); sc.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(VW.c[0] + EXT * 1.1, VW.c[1] + EXT * 1.9, VW.c[2] + EXT * 1.3);
    sun.target.position.set(VW.c[0], VW.c[1] * 0.5, VW.c[2]); sc.add(sun); sc.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 1, far: EXT * 6 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = EXT * 0.0012;
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.35); fill.position.set(-0.8, 0.4, -0.6); sc.add(fill);
    // قبة سماء + بيئة انعكاس (الزجاج والماء يعكسون السماء)
    const R0 = P.view.far * 0.45, skyG = new THREE.SphereGeometry(R0, 32, 16), skyCol = new Float32Array(skyG.attributes.position.count * 3);
    skyG.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
    sc.add(new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    const pmrem = new THREE.PMREMGenerator(rn); let envRT = null;
    const SKIES = { day: [0x2a62a8, 0xcfe0ee, 0x5d6168, 0xffffff, 2.3, 0.62, 1.0], night: [0x040814, 0x1a2a48, 0x0a0f1c, 0x9fb6e0, 0.55, 0.38, 0.9] };
    function setSky(mode) {
      const k = SKIES[mode] || SKIES.day, zen = lin(k[0]), hor = lin(k[1]), gnd = lin(k[2]), c = new THREE.Color();
      const P3 = skyG.attributes.position;
      for (let i = 0; i < P3.count; i++) {
        const t = P3.getY(i) / R0;
        if (t >= 0) c.copy(hor).lerp(zen, Math.pow(t, 0.55)); else c.copy(hor).lerp(gnd, Math.min(1, -t * 4));
        skyCol[i * 3] = c.r; skyCol[i * 3 + 1] = c.g; skyCol[i * 3 + 2] = c.b;
      }
      P3.needsUpdate = true; skyG.attributes.color.needsUpdate = true;
      sc.fog.color.copy(hor).lerp(zen, 0.15);
      sun.color.copy(lin(k[3])); sun.intensity = k[4]; hemi.intensity = k[5]; rn.toneMappingExposure = k[6];
      hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.55); hemi.groundColor.copy(gnd);
      const es = new THREE.Scene(), eg = new THREE.SphereGeometry(10, 32, 16), ec = [];
      for (let i = 0; i < eg.attributes.position.count; i++) {
        const t = eg.attributes.position.getY(i) / 10;
        if (t >= 0) c.copy(hor).lerp(zen, Math.pow(t, 0.55)); else c.copy(hor).lerp(gnd, Math.min(1, -t * 3));
        ec.push(c.r, c.g, c.b);
      }
      eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
      es.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const sd = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: mode === 'night' ? 0x6677aa : 0xfff3d6 }));
      sd.position.set(5, 6.5, 5); es.add(sd);
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(es, 0.03); sc.environment = envRT.texture;
      eg.dispose(); sd.geometry.dispose(); sd.material.dispose(); es.children[0].material.dispose();
      if (typeof touch === 'function') touch();
    }
    const ctl = new THREE.OrbitControls(cam, rn.domElement);
    ctl.enableDamping = true; ctl.dampingFactor = 0.09; ctl.screenSpacePanning = true;
    ctl.minDistance = P.view.min; ctl.maxDistance = P.view.max; ctl.maxPolarAngle = Math.PI * 0.74;
    const BIG = 1e7, planeH = new THREE.Plane(new THREE.Vector3(0, -1, 0), BIG), planeV = new THREE.Plane(new THREE.Vector3(0, 0, -1), BIG), CLIP = [planeH, planeV];

    const E = {}, batches = {}, labels = [], trash = [];
    const keep = o => { trash.push(o); return o; };
    /* قوام إجرائي مرسوم بالمتصفح (بلا صور خارجية): زجاج بإطارات، خرسانة، ماء، عشب، خشب، رمل، شبك معدني، بلاط */
    const TEXB = {};
    function texBase(kind) {
      if (TEXB[kind]) return TEXB[kind];
      const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
      const g = cv.getContext('2d'), rnd = (() => { let x = 1234567 + kind.length * 97; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
      const noise = (base, amp, n, sz) => { g.fillStyle = base; g.fillRect(0, 0, N, N); for (let i = 0; i < n; i++) { const v = (rnd() - 0.5) * amp; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(rnd() * N, rnd() * N, sz, sz); } };
      if (kind === 'facade' || kind === 'diamond') {
        const gr = g.createLinearGradient(0, 0, 0, N); gr.addColorStop(0, '#dfeefa'); gr.addColorStop(0.55, '#8fb4d6'); gr.addColorStop(1, '#5d7fa3');
        g.fillStyle = gr; g.fillRect(0, 0, N, N);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(N * 0.45, 0); g.lineTo(0, N * 0.7); g.fill();
        g.strokeStyle = '#3c4b5c'; g.lineWidth = 7;
        if (kind === 'facade') { g.fillStyle = '#56606c'; g.fillRect(0, N * 0.84, N, N * 0.16); g.strokeRect(0, 0, N, N); g.beginPath(); g.moveTo(N / 2, 0); g.lineTo(N / 2, N * 0.84); g.stroke(); }
        else { g.lineWidth = 9; g.beginPath(); g.moveTo(0, N / 2); g.lineTo(N / 2, 0); g.lineTo(N, N / 2); g.lineTo(N / 2, N); g.closePath(); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(N / 4, N / 4); g.lineTo(N * 0.75, N * 0.75); g.stroke(); }
      } else if (kind === 'concrete') { noise('#c3c1bb', 0.16, 2600, 2); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.strokeRect(0, 0, N, N); g.beginPath(); g.moveTo(0, N / 2); g.lineTo(N, N / 2); g.stroke(); }
      else if (kind === 'water') {
        g.fillStyle = '#2380b6'; g.fillRect(0, 0, N, N);
        for (let i = 0; i < 140; i++) { g.strokeStyle = `rgba(255,255,255,${0.04 + rnd() * 0.12})`; g.lineWidth = 1 + rnd() * 2; const x = rnd() * N, y = rnd() * N, l = 10 + rnd() * 30; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke(); }
      } else if (kind === 'grass') noise('#4c7a3a', 0.35, 4000, 2);
      else if (kind === 'deck') { g.fillStyle = '#9a7650'; g.fillRect(0, 0, N, N); for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.12})`; g.fillRect(0, i * N / 8, N, N / 8); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, i * N / 8, N, 2); } }
      else if (kind === 'sand') noise('#d8c7a2', 0.2, 3500, 2);
      else if (kind === 'mesh') { g.fillStyle = '#c9ced4'; g.fillRect(0, 0, N, N); g.fillStyle = 'rgba(40,50,60,.55)'; for (let y = 8; y < N; y += 16) for (let x = (y / 16) % 2 ? 16 : 8; x < N; x += 16) { g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.fill(); } }
      else if (kind === 'stone') { noise('#bfb6a6', 0.14, 1800, 3); g.strokeStyle = 'rgba(70,60,50,.45)'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * N / 4); g.lineTo(N, i * N / 4); g.stroke(); g.beginPath(); g.moveTo(i * N / 4 + ((i % 2) ? 0 : 0), 0); g.lineTo(i * N / 4, N); g.stroke(); } }
      else noise('#bbbbbb', 0.1, 800, 2);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
      t.anisotropy = Math.min(8, rn.capabilities.getMaxAnisotropy ? rn.capabilities.getMaxAnisotropy() : 1);
      TEXB[kind] = keep(t); return t;
    }
    function texOf(kind, rep) {
      const t = texBase(kind).clone(); t.needsUpdate = true;
      const r = rep || { facade: [3, 4], diamond: [4, 6], concrete: [4, 4], water: [30, 30], grass: [10, 10], deck: [4, 4], sand: [20, 20], mesh: [2, 2], stone: [6, 6] }[kind] || [5, 5];
      t.repeat.set(1 / r[0], 1 / r[1]); return keep(t);
    }
    // إحداثيات UV من موقع النقطة بالعالم (متر) — القوام يلتف مستمراً على كل وجه بلا تمدد
    function wuv(g) {
      const P3 = g.attributes.position, N3 = g.attributes.normal; if (!P3 || !N3) return g;
      const uv = new Float32Array(P3.count * 2);
      for (let i = 0; i < P3.count; i++) {
        const x = P3.getX(i), y = P3.getY(i), z = P3.getZ(i), nx = N3.getX(i), ny = N3.getY(i), nz = N3.getZ(i);
        if (Math.abs(ny) > 0.72) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
        else { const l = Math.hypot(nx, nz) || 1; uv[i * 2] = (-nz * x + nx * z) / l; uv[i * 2 + 1] = y; }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
    }
    const ent = el => E[el] || (E[el] = { group: (g => { sc.add(g); return g; })(new THREE.Group()), mats: [], pick: [], box: null });
    function material(el, o) {
      o = o || {};
      const op = o.opacity == null ? 1 : o.opacity;
      const m = keep(new THREE.MeshStandardMaterial({ color: lin(o.color == null ? 0xb9c0cb : o.color), roughness: o.rough == null ? 0.8 : o.rough, metalness: o.metal || 0,
        transparent: true, opacity: op, depthWrite: o.dw === false ? false : op >= 0.9, side: o.side === 2 ? THREE.DoubleSide : o.side === 1 ? THREE.BackSide : THREE.FrontSide,
        vertexColors: !!o.vc, clippingPlanes: CLIP, envMapIntensity: o.env == null ? 1 : o.env }));
      if (o.tex) m.map = texOf(o.tex, o.rep);
      if (o.glow) { m.emissive = lin(o.glow); m.emissiveIntensity = 0; }
      m.userData = { o: op, dw: m.depthWrite, kind: 'mesh', glow: o.glow ? lin(o.glow) : null, shadow: o.shadow !== false && op >= 0.9 };
      ent(el).mats.push(m); return m;
    }
    function addMesh(el, geom, mat, pickable) {
      if (mat.map && !geom.attributes.uv) wuv(geom);
      const me = new THREE.Mesh(keep(geom), mat); me.userData.el = el; me.renderOrder = mat.userData.o < 0.9 ? 2 : 0; ent(el).group.add(me);
      me.castShadow = !!mat.userData.shadow; me.receiveShadow = true;
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
      return wuv(out);
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
        if (!at.length) return;
        const g = new THREE.CylinderGeometry(shape[1], shape[2], shape[3], shape[4] || 10), m = material(el, opt);
        const im = new THREE.InstancedMesh(keep(g), m, at.length);
        at.forEach((p, i) => im.setMatrixAt(i, M4.makeTranslation(p[0], p[1], p[2])));
        im.instanceMatrix.needsUpdate = true; im.userData.el = el; im.castShadow = true; im.receiveShadow = true; ent(el).group.add(im); ent(el).pick.push(im);
        const bx = new THREE.Box3().setFromPoints(at.map(p => new THREE.Vector3(p[0], p[1] + shape[3] / 2, p[2])).concat(at.map(p => new THREE.Vector3(p[0], p[1] - shape[3] / 2, p[2]))));
        ent(el).box = ent(el).box ? ent(el).box.union(bx) : bx;
      },
      surface(el, key, opt, pos, idx, col) {
        const g = geo(pos, idx); if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        addMesh(el, g, material(el, opt));
      },
      lines(el, arr, color, opacity) {
        const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const m = keep(new THREE.LineBasicMaterial({ color: lin(color), transparent: true, opacity: opacity == null ? 1 : opacity, clippingPlanes: CLIP }));
        m.userData = { o: m.opacity, kind: 'line' }; ent(el).mats.push(m);
        const ln = new THREE.LineSegments(g, m); ln.userData.el = el; ent(el).group.add(ln); ent(el).pick.push(ln);
      },
      points(el, arr, color, size) {
        const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const m = keep(new THREE.PointsMaterial({ color: lin(color), size: size || 2, sizeAttenuation: false, transparent: true, opacity: 0.95, clippingPlanes: CLIP }));
        m.userData = { o: 0.95, kind: 'line' }; ent(el).mats.push(m);
        ent(el).group.add(new THREE.Points(g, m));
      },
      label(text, pos, cls, el) {
        const d = document.createElement('div'); d.className = 'mg-lab ' + (cls || ''); d.textContent = text; labelBox.appendChild(d);
        labels.push({ d, p: v3(pos), el: el || null });
      },
      ground(el, R, color, y, opt) {
        const g = new THREE.CircleGeometry(R, 64); g.rotateX(-Math.PI / 2); g.translate(0, y || 0, 0);
        addMesh(el, g, material(el, Object.assign({ color, rough: 0.95 }, opt || {})));
      },
      pit(el, R, yb, bands, groundR, groundColor, cx, cz) {        // حفرة مقطوعة تبيّن ما تحت الأرض + سطح الأرض حولها
        cx = cx || 0; cz = cz || 0;
        const g = new THREE.CylinderGeometry(R, R, -yb, 64, 24, true); g.translate(cx, yb / 2, cz);
        const col = [], c1 = new THREE.Color(), c2 = new THREE.Color();
        for (let i = 0; i < g.attributes.position.count; i++) {
          const y = g.attributes.position.getY(i); let k = 0; while (k < bands.length - 2 && y < bands[k + 1][0]) k++;
          const t = Math.min(1, Math.max(0, (bands[k][0] - y) / ((bands[k][0] - bands[k + 1][0]) || 1)));
          c1.setHex(bands[k][1]); c2.setHex(bands[k + 1][1]); c1.lerp(c2, t); col.push(c1.r, c1.g, c1.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        addMesh(el, g, material(el, { vc: true, color: 0xffffff, rough: 1, side: 1 }));
        const bot = new THREE.CircleGeometry(R, 64); bot.rotateX(-Math.PI / 2); bot.translate(cx, yb, cz);
        addMesh(el, bot, material(el, { color: bands[bands.length - 1][1], rough: 1 }));
        if (!(groundR > R)) return;
        const ring = new THREE.RingGeometry(R, groundR, 64, 1); ring.rotateX(-Math.PI / 2);
        const rm = keep(new THREE.MeshStandardMaterial({ color: lin(groundColor), roughness: 0.95, clippingPlanes: CLIP, map: texOf('sand', [30, 30]) }));
        wuv(ring); const rmM = new THREE.Mesh(keep(ring), rm); rmM.receiveShadow = true; sc.add(rmM);
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
          if (u.kind === 'mesh') {
            m.depthWrite = ghost ? false : u.dw;
            if (hit) { m.emissive.setHex(0x3a2f08); m.emissiveIntensity = 1; }
            else if (u.glow && ST.sky === 'night') { m.emissive.copy(u.glow); m.emissiveIntensity = ghost ? 0.15 : 0.9; }
            else { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
          }
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
      for (let i = 0; i < hits.length; i++) { const p = hits[i].point; if (planeH.distanceToPoint(p) >= 0 && planeV.distanceToPoint(p) >= 0) return { el: hits[i].object.userData.el, p: [p.x, p.y, p.z] }; }
      return null;
    }
    let down = null, hov = 0;
    const el0 = rn.domElement;
    const onDown = e => { down = [e.clientX, e.clientY]; };
    const onUp = e => {
      if (!down) return; const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
      if (moved > 6) return;
      const h = hitAt(e); if (V && V.onPick) V.onPick(h && h.el, h && h.p);
    };
    const onMove = e => {
      if (down || e.pointerType === 'touch') return;
      if (hov) return; hov = requestAnimationFrame(() => { hov = 0; if (dead) return; const hh = hitAt(e), el = hh && hh.el; el0.style.cursor = el ? 'pointer' : 'grab'; if (V && V.onHover) V.onHover(el, e); });
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
      ctl.dispose(); trash.forEach(o => o.dispose && o.dispose()); skyG.dispose(); if (envRT) envRT.dispose(); pmrem.dispose(); rn.dispose();
      labels.forEach(l => l.d.remove());
      if (V && V.rn === rn) V = null;
    }
    size(); setSky(ST.sky); view('home', true); paint(); setCut();
    raf = requestAnimationFrame(tick);
    return { rn, paint, setCut, setMode, view, focus, fly, dispose, touch, sky: m => { setSky(m); paint(); }, has: el => !!E[el], els: () => Object.keys(E) };
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
            <button data-mg="view" data-v="front" title="واجهة">↔️ واجهة</button><button data-mg="sky" id="mgSky" title="نهار / ليل">🌙</button><button data-mg="full" title="ملء الشاشة">⛶</button></div>
          <div class="mg-tip" id="mgTip" hidden></div>
          <div class="mg-tour" id="mgTour"></div>
          <div class="mg-hud bl"><label class="mg-cut">✂️ قطع أفقي <input type="range" min="0" max="100" value="100" id="mgCutH" aria-label="منسوب القطع الأفقي"><b id="mgCutT">كامل الارتفاع</b></label>
            <label class="mg-chk"><input type="checkbox" id="mgCutV"> مقطع عمودي</label></div>
          <div class="mg-ro">👁️ عرض فقط · دوّر بالسحب · قرّب بالعجلة · اضغط أي عنصر</div>
        </div>
        <aside class="mg-side"><div class="mg-layers" id="mgLayers"></div><div id="mgInfo"></div>
          <section class="mg-ai" id="mgAI" aria-label="اسأل الذكاء الاصطناعي"><div class="mg-aih"><b>🤖 اسأل الذكاء الاصطناعي عن أي جزء</b>
            <small>اضغط أي مكان بالمجسم، أو اختار سؤال، أو اكتب سؤالك — يجاوب من معلومات المشروع ومصادره</small></div>
            <div class="mg-aiq" id="mgAIQ"></div><div class="mg-chat" id="mgChat"></div></section></aside>
      </div>
      <div class="mg-below" id="mgBelow"></div></div>`;
  };
  const $ = id => document.getElementById(id);
  function aiQs() {
    const P = proj(), el = ST.sel && P.els[ST.sel], pt = ST.pt, out = [];
    if (pt && pt.y != null) {
      const where = P.cutText(pt.y), nm = pt.el && P.els[pt.el] ? P.els[pt.el].name : 'هذا الجزء';
      out.push(['🎯', 'شنو «' + nm + '» عند منسوب ' + Math.round(pt.y) + ' م (' + where + ')؟ وشنو دوره الإنشائي بهذا المكان؟']);
    }
    if (el) out.push(['📍', 'ليش «' + el.name + '» بهذا المكان بالضبط بـ' + P.name + '؟'], ['⬇️', 'شلون ينتقل الحمل بـ«' + el.name + '» لحد الأرض؟'],
      ['⚠️', 'شنو يصير لو «' + el.name + '» ما موجود أو انصمّم أضعف؟'], ['🏗️', 'شلون نفّذوا «' + el.name + '» بالموقع؟']);
    else out.push(['🏗️', 'شنو النظام الإنشائي لـ' + P.name + ' وليش اختاروه؟'], ['🧗', 'شنو أصعب تحدي إنشائي بـ' + P.name + ' وشلون حلّوه؟'],
      ['🏛️', 'اشرح لي الفكرة المعمارية لـ' + P.name + ' وشلون أثّرت على الهيكل.'], ['🇮🇶', 'شنو الدرس اللي أطبّقه من ' + P.name + ' على مبنى عادي بالعراق؟']);
    return out.slice(0, 5);
  }
  function paintAI() {
    const box = $('mgAIQ'); if (!box) return;
    box.innerHTML = aiQs().map(q => `<button data-mg="aiq" data-q="${esc(q[1])}"><i>${q[0]}</i>${esc(q[1])}</button>`).join('');
    const ch = $('mgChat');
    if (ch && window.AIASK && AIASK.embed && !ch.firstChild) AIASK.embed(ch);
    else if (ch && window.AIASK && AIASK.refresh && ch.firstChild) AIASK.refresh(ch.querySelector('.ai-chat'));
    if (!window.AIASK || !AIASK.embed) box.innerHTML += '<div class="mg-hint">وحدة المساعد غير محمَّلة.</div>';
  }
  function paintUi() {
    const P = proj(); if (!$('mgInfo')) return;
    $('mgModes').innerHTML = P.modes.map(m => `<button class="${ST.mode === m[0] ? 'on' : ''}" data-mg="mode" data-v="${m[0]}">${m[1]}</button>`).join('') +
      `<button class="tour ${ST.tour >= 0 ? 'on' : ''}" data-mg="tour">▶️ جولة مشروحة</button>`;
    $('mgLayers').innerHTML = '<span class="mg-lt">الطبقات:</span>' + P.layers.map(l => `<button class="${ST.off[l[0]] ? '' : 'on'} ${ST.sel === l[0] ? 'sel' : ''}" data-mg="layer" data-el="${l[0]}">${esc(l[1])}</button>`).join('') +
      '<button class="all" data-mg="reset" title="رجّع كل شي مثل البداية">↺</button>';
    $('mgInfo').innerHTML = infoHtml();
    const sk = $('mgSky'); if (sk) { sk.textContent = ST.sky === 'night' ? '☀️' : '🌙'; sk.title = ST.sky === 'night' ? 'نهار' : 'ليل (الأضوية تشتغل)'; }
    paintAI();
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
    ST.pid = PR()[pid] ? pid : 'burj'; ST.tour = -1; ST.pt = null; defaults();
    const P = proj();
    document.querySelectorAll('.mg-proj').forEach(b => b.classList.toggle('on', b.dataset.id === ST.pid));
    $('mgLabels').innerHTML = '';
    try { V = mount($('mgCanvas'), $('mgLabels'), P); } catch (e) { console.error(e); V = null; }
    if (!V) { $('mgCanvas').innerHTML = '<div class="mg-nogl">المتصفح ما قدر يشغّل العرض الثلاثي (WebGL). الشرح والأرقام تحت يشتغلون عادي.</div>'; }
    else {
      V.onPick = (el, p) => {
        if (ST.tour >= 0 && !el) return;
        ST.pt = el && p ? { el, y: p[1], x: p[0], z: p[2] } : null;
        select(el === ST.sel && !p ? null : el);
      };
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
      if (a === 'ask' || a === 'aiq') {
        const ch = $('mgChat'), root = ch && ch.querySelector('.ai-chat');
        if (root && AIASK.sendIn) { AIASK.sendIn(root, b.dataset.q); $('mgAI').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        else if (window.AIASK) AIASK.ask(b.dataset.q, true);
        return;
      }
      if (a === 'full') { const v = $('mgView'); if (document.fullscreenElement) document.exitFullscreen(); else if (v.requestFullscreen) v.requestFullscreen().catch(() => { /* غير مدعوم */ }); return; }
      if (!V) return;
      if (a === 'view') return V.view(b.dataset.v);
      if (a === 'sky') { ST.sky = ST.sky === 'night' ? 'day' : 'night'; V.sky(ST.sky); return paintUi(); }
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
    const pt = ST.pt && ST.pt.y != null ? { element: P.els[ST.pt.el] ? P.els[ST.pt.el].name : ST.pt.el, height_m: Math.round(ST.pt.y * 10) / 10, where: P.cutText(ST.pt.y) } : null;
    return { project: P.name + ' (' + P.en + ')', place: P.place + ' · ' + P.year, idea: P.idea.map(strip).join(' '),
      facts: P.facts.map(f => f[0] + ': ' + f[1] + ' (' + strip(f[2]) + ')').join(' · '),
      elements: Object.keys(P.els).map(k => P.els[k].name).join('، '), clicked_point: pt,
      element: el ? { name: el.name, what: strip(el.what), why: strip(el.why), load: strip(el.load), numbers: (el.nums || []).map(n => n[0] + ': ' + n[1]).join(' · '),
        code: el.aci || '' } : null,
      model_note: P.note, sources: P.sources.map(x => '[' + x[0] + '] ' + x[1]).join(' · ') };
  }
  return { pageHtml, init, current, select, state: () => ST, viewer: () => V, tour: tourGo, start };
})();
window.MEGA = MEGA;
