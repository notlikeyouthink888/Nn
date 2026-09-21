/* ============================================================================
   fem3dui.js — واجهة «التحليل الإنشائي المتطور»

   مبدأ العرض: لا رقم بلا مصدره، ولا مخطط بلا قيمه. المخططات تحمل قيمها
   الرقمية عند الأطراف وعند الموضع الحرج، والمقياس يُعلَن صراحةً
   (كم kN·m يقابل المتر الواحد على الشاشة) بدل مزلاج بلا معنى.
   ========================================================================= */
(function (global) {
  'use strict';
  var F = global.FEM3D;
  if (!F) return;
  var nf = F.nf, esc = F.esc;

  /* ═══════════════════════ التنسيق (بنطاق #fem) ═══════════════════════ */
  var CSS = [
    '#fem{--fl:#22304f;--fm:#93a4c0}',
    '#fem .ft{display:flex;gap:5px;flex-wrap:wrap;border-bottom:1px solid var(--fl);margin-bottom:14px}',
    '#fem .ft button{background:none;border:0;border-bottom:2px solid transparent;color:var(--fm);',
      'padding:9px 13px;cursor:pointer;font:inherit;font-size:12.5px;border-radius:8px 8px 0 0;transition:.15s}',
    '#fem .ft button:hover{background:rgba(56,189,248,.08);color:#e6edf7}',
    '#fem .ft button.on{color:#fff;border-bottom-color:#38bdf8;background:rgba(56,189,248,.12)}',
    '#fem .fp{display:none}#fem .fp.on{display:block}',
    '#fem .vp{position:relative;height:clamp(340px,58vh,660px);background:#0a1020;',
      'border:1px solid var(--fl);border-radius:12px;overflow:hidden}',
    '#fem .vp canvas{display:block;width:100%;height:100%}',
    '#fem .hud{position:absolute;top:9px;inset-inline-start:9px;background:rgba(10,16,32,.88);',
      'border:1px solid var(--fl);border-radius:9px;padding:8px 11px;font-size:11.5px;',
      'color:var(--fm);pointer-events:none;max-width:66%;line-height:1.65}',
    '#fem .hud b{color:#e6edf7}#fem .hud .sc{color:#fbbf24}',
    '#fem .leg{position:absolute;bottom:9px;inset-inline-end:9px;background:rgba(10,16,32,.88);',
      'border:1px solid var(--fl);border-radius:9px;padding:7px 10px;font-size:11px;color:var(--fm)}',
    '#fem .leg i{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-1px;',
      'margin-inline-end:5px}',
    '#fem .bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0}',
    '#fem .bar button{background:var(--panel);border:1px solid var(--fl);color:var(--fm);',
      'padding:6px 11px;border-radius:8px;cursor:pointer;font:inherit;font-size:11.5px;transition:.15s}',
    '#fem .bar button:hover{border-color:#38bdf8;color:#e6edf7}',
    '#fem .bar button.on{background:rgba(56,189,248,.18);border-color:#38bdf8;color:#fff}',
    '#fem .bar select{width:auto;min-width:130px;font-size:11.5px;padding:5px 8px}',
    '#fem .mt{overflow:auto;max-height:330px;border:1px solid var(--fl);border-radius:9px;background:#0a1020}',
    '#fem .mt table{border-collapse:collapse;font-size:9.5px;font-family:ui-monospace,Menlo,Consolas,monospace}',
    '#fem .mt td,#fem .mt th{padding:2px 5px;text-align:center;white-space:nowrap;border:1px solid rgba(34,48,79,.6)}',
    '#fem .mt th{background:#16233d;color:#93a4c0;position:sticky;top:0;font-weight:600}',
    '#fem .mt td.z{color:#33415c}#fem .mt td.p{color:#7dd3fc}#fem .mt td.n{color:#fca5a5}',
    '#fem .eq{background:#0a1020;border:1px solid var(--fl);border-radius:9px;padding:11px 13px;margin:9px 0;',
      'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:#7dd3fc;',
      'direction:ltr;text-align:left;overflow-x:auto;line-height:1.85}',
    '#fem .stp{border-inline-start:3px solid #38bdf8;padding:3px 13px;margin:13px 0}',
    '#fem .stp h4{margin:0 0 6px;font-size:13px;color:#fff}',
    '#fem .stp p{margin:4px 0;font-size:12.5px;color:var(--fm);line-height:1.8}',
    '#fem .ok{color:#34d399}#fem .bad{color:#f87171}#fem .wr{color:#fbbf24}',
    '#fem .sel{background:rgba(56,189,248,.10);border:1px solid rgba(56,189,248,.35);',
      'border-radius:9px;padding:9px 12px;font-size:12.5px;margin-bottom:11px}',
    '#fem table.dt{width:100%;border-collapse:collapse;font-size:11.5px}',
    '#fem table.dt th{text-align:start;padding:6px 8px;border-bottom:1px solid var(--fl);',
      'color:var(--fm);font-weight:600;white-space:nowrap;position:sticky;top:0;background:var(--panel)}',
    '#fem table.dt td{padding:5px 8px;border-bottom:1px solid rgba(34,48,79,.45);white-space:nowrap}',
    '#fem .sc-wrap{max-height:400px;overflow:auto;border:1px solid var(--fl);border-radius:9px}',
    '@media(max-width:760px){#fem .vp{height:clamp(270px,42vh,400px)}',
      '#fem .ft button{padding:8px 9px;font-size:11.5px}}'
  ].join('');
  function injectCSS() {
    if (document.getElementById('fem3d-css')) return;
    var s = document.createElement('style');
    s.id = 'fem3d-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  /* الكمّيات المعروضة — المحور المحلّي الذي يُرسم عليه المخطط واصطلاح ETABS */
  var DIAG = {
    M33: { nm: 'M₃₃ — العزم الرئيسي', ax: 2, u: 'kN·m', c: 0x38bdf8 },
    M22: { nm: 'M₂₂ — العزم الثانوي', ax: 3, u: 'kN·m', c: 0xa78bfa },
    V2:  { nm: 'V₂ — القصّ الرئيسي',  ax: 2, u: 'kN',   c: 0x34d399 },
    V3:  { nm: 'V₃ — القصّ الثانوي',  ax: 3, u: 'kN',   c: 0x2dd4bf },
    T:   { nm: 'T — الالتواء',        ax: 2, u: 'kN·m', c: 0xfbbf24 },
    N:   { nm: 'N — المحوري',         ax: 3, u: 'kN',   c: 0xf472b6 }
  };

  /* ═════════════════════ العارض ثلاثي الأبعاد ═════════════════════ */
  function Viewport(host, onPick) {
    var T = global.THREE;
    if (!T) return null;
    var w = host.clientWidth || 800, h = host.clientHeight || 420;
    var rn = new T.WebGLRenderer({ antialias: true, alpha: true });
    rn.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    rn.setSize(w, h); host.appendChild(rn.domElement);
    var sc = new T.Scene(); sc.fog = new T.Fog(0x0a1020, 45, 220);
    var cam = new T.PerspectiveCamera(45, w / h, .1, 600);
    sc.add(new T.HemisphereLight(0xcfe4ff, 0x1a2338, 1.1));
    var dl = new T.DirectionalLight(0xffffff, .6); dl.position.set(14, -18, 26); sc.add(dl);
    var ctl = null;
    try { ctl = new T.OrbitControls(cam, rn.domElement); ctl.enableDamping = true; } catch (e) {}
    var G = {}, gn = ['frame', 'diag', 'def', 'slab', 'axes', 'sup', 'lab', 'found'];
    gn.forEach(function (n) { G[n] = new T.Group(); sc.add(G[n]); });
    var picks = [], raf = 0, FR = null, rad = 10, R = 10, sel = -1, touched = false, dead = false;
    if (ctl) ctl.addEventListener('start', function () { touched = true; });

    function clear(g) {
      while (g.children.length) {
        var c = g.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
      }
    }
    function V(n) { return new T.Vector3(n.x, n.y, n.z); }

    function sprite(txt, col, sz) {
      var cv = document.createElement('canvas'), pad = 10;
      var ctx = cv.getContext('2d');
      ctx.font = 'bold 40px ui-monospace,monospace';
      var tw = ctx.measureText(txt).width;
      cv.width = Math.ceil(tw + pad * 2); cv.height = 58;
      ctx = cv.getContext('2d');
      ctx.fillStyle = 'rgba(8,13,26,.9)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, cv.width - 3, cv.height - 3);
      ctx.font = 'bold 40px ui-monospace,monospace';
      ctx.fillStyle = '#e8eef8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, cv.width / 2, cv.height / 2 + 2);
      var tx = new T.CanvasTexture(cv); tx.minFilter = T.LinearFilter;
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tx, depthTest: false }));
      sp.scale.set(sz * cv.width / cv.height, sz, 1);
      return sp;
    }

    function build(f, solid) {
      clear(G.frame); clear(G.slab); clear(G.sup); clear(G.found); picks = [];
      FR = f;
      var box = new T.Box3();
      f.nodes.forEach(function (n) { box.expandByPoint(V(n)); });
      var ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
      R = Math.max(size.x, size.y, size.z) || 10;
      var mB = new T.MeshLambertMaterial({ color: 0x64748b }),
          mC = new T.MeshLambertMaterial({ color: 0x93a5c0 });
      f.members.forEach(function (m, k) {
        var gm = f.geom(m), L = gm.L, Rm = gm.R;
        var a = V(f.nodes[m.i]), b = V(f.nodes[m.j]);
        var bb = solid ? Math.max(m.b || .2, .05) : .06,
            hh = solid ? Math.max(m.h || .2, .05) : .06;
        var mesh = new T.Mesh(new T.BoxGeometry(L, hh, bb),
          m.kind === 'col' ? mC : mB);
        mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(
          new T.Vector3(Rm[0][0], Rm[0][1], Rm[0][2]),
          new T.Vector3(Rm[1][0], Rm[1][1], Rm[1][2]),
          new T.Vector3(Rm[2][0], Rm[2][1], Rm[2][2])));
        mesh.position.copy(a.clone().add(b).multiplyScalar(.5));
        mesh.userData.k = k;
        G.frame.add(mesh); picks.push(mesh);
      });
      var ng = new T.SphereGeometry(Math.max(.05, R * .005), 10, 8);
      var nm2 = new T.MeshLambertMaterial({ color: 0x38bdf8 });
      f.nodes.forEach(function (n) {
        var s = new T.Mesh(ng, nm2); s.position.copy(V(n)); G.frame.add(s);
      });
      var sg = new T.ConeGeometry(Math.max(.12, R * .012), Math.max(.2, R * .022), 4);
      var sm = new T.MeshLambertMaterial({ color: 0xfbbf24 });
      for (var sn in f.sup) {
        var c = new T.Mesh(sg, sm); c.position.copy(V(f.nodes[sn]));
        c.position.z -= Math.max(.1, R * .011); c.rotation.x = Math.PI / 2; G.sup.add(c);
      }
      if (f.meta && f.meta.Xs) {
        var Xs = f.meta.Xs, Ys = f.meta.Ys, Zs = f.meta.Zs;
        var lx = Xs[Xs.length - 1], ly = Ys[Ys.length - 1];
        var pg = new T.PlaneGeometry(lx, ly);
        var pm = new T.MeshLambertMaterial({ color: 0x38bdf8, transparent: true,
          opacity: .09, side: T.DoubleSide, depthWrite: false });
        for (var z = 1; z < Zs.length; z++) {
          var p = new T.Mesh(pg, pm); p.position.set(lx / 2, ly / 2, Zs[z]); G.slab.add(p);
        }
      }
      gn.forEach(function (n) { G[n].position.copy(ctr.clone().negate()); });
      rad = size.length() / 2 * 1.14;
      frameCam();
    }

    function foundations(fts) {
      clear(G.found);
      if (!FR || !fts) return;
      var mt = new T.MeshLambertMaterial({ color: 0x8b6f47 });
      fts.forEach(function (d) {
        var n = FR.nodes[d.node], hh = d.h / 1000;
        var m = new T.Mesh(new T.BoxGeometry(d.B, d.B, hh), mt);
        m.position.set(n.x, n.y, n.z - hh / 2); G.found.add(m);
      });
    }

    function frameCam() {
      var fv = cam.fov * Math.PI / 180;
      var fh = 2 * Math.atan(Math.tan(fv / 2) * cam.aspect);
      var d = rad / Math.sin(Math.min(fv, fh) / 2);
      cam.position.copy(new T.Vector3(.86, -1, .58).normalize().multiplyScalar(d));
      cam.up.set(0, 0, 1); cam.lookAt(0, 0, 0);
      if (ctl) { ctl.target.set(0, 0, 0); ctl.update(); }
    }

    /* المخطط: يُرسم بمقياس **مُعلَن** (وحدة لكل متر) لا بمعامل مجهول. */
    function diagram(kind, getStations, userScale, showLabels) {
      clear(G.diag); clear(G.lab);
      if (!FR || !kind || kind === 'none') return { max: 0, scale: 0 };
      var D = DIAG[kind], all = [], mx = 0;
      FR.members.forEach(function (m, k) {
        var st = getStations(k);
        all.push(st);
        st.forEach(function (s) { mx = Math.max(mx, Math.abs(s[kind])); });
      });
      if (mx < 1e-9) return { max: 0, scale: 0 };
      // ارتفاع المخطط الأقصى = 9% من أكبر بُعد بالمبنى، ما لم يحدّد المستخدم
      var unit = userScale || (R * 0.09 / mx);
      var pos = [], neg = [], lp = [];
      FR.members.forEach(function (m, k) {
        var st = all[k], gm = FR.geom(m), Rm = gm.R, a = FR.nodes[m.i];
        var ax = Rm[D.ax - 1], base = [], tip = [], i;
        for (i = 0; i < st.length; i++) {
          var s = st[i];
          var bx = a.x + Rm[0][0] * s.x, by = a.y + Rm[0][1] * s.x, bz = a.z + Rm[0][2] * s.x;
          var v = s[kind] * unit;
          base.push([bx, by, bz]);
          tip.push([bx + ax[0] * v, by + ax[1] * v, bz + ax[2] * v]);
        }
        for (i = 0; i < st.length - 1; i++) {
          var tgt = (st[i][kind] + st[i + 1][kind]) >= 0 ? pos : neg;
          var p0 = base[i], p1 = base[i + 1], t0 = tip[i], t1 = tip[i + 1];
          tgt.push(p0[0], p0[1], p0[2], t0[0], t0[1], t0[2], t1[0], t1[1], t1[2]);
          tgt.push(p0[0], p0[1], p0[2], t1[0], t1[1], t1[2], p1[0], p1[1], p1[2]);
          lp.push(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2]);
        }
      });
      var mk = function (arr, col) {
        if (!arr.length) return;
        var g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
        g.computeVertexNormals();
        G.diag.add(new T.Mesh(g, new T.MeshBasicMaterial({ color: col, transparent: true,
          opacity: .55, side: T.DoubleSide, depthWrite: false })));
      };
      mk(pos, D.c); mk(neg, 0xf87171);
      if (lp.length) {
        var lg = new T.BufferGeometry();
        lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
        G.diag.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: D.c })));
      }
      // القيم الرقمية على العنصر المختار — هذا ما يجعل المخطط قابلاً للقراءة
      if (showLabels && sel >= 0 && all[sel]) {
        var st2 = all[sel], m2 = FR.members[sel], gm2 = FR.geom(m2),
            Rm2 = gm2.R, a2 = FR.nodes[m2.i], ax2 = Rm2[D.ax - 1];
        var idx = [0, st2.length - 1], best = 0;
        for (var q = 1; q < st2.length - 1; q++)
          if (Math.abs(st2[q][kind]) > Math.abs(st2[best][kind])) best = q;
        if (idx.indexOf(best) < 0) idx.push(best);
        idx.forEach(function (q2) {
          var s = st2[q2], v = s[kind] * unit;
          var px = a2.x + Rm2[0][0] * s.x + ax2[0] * v * 1.18,
              py = a2.y + Rm2[0][1] * s.x + ax2[1] * v * 1.18,
              pz = a2.z + Rm2[0][2] * s.x + ax2[2] * v * 1.18;
          var sp = sprite(nf(s[kind], 1), '#' + D.c.toString(16).padStart(6, '0'),
            Math.max(.18, R * .028));
          sp.position.set(px, py, pz); G.lab.add(sp);
        });
      }
      return { max: mx, scale: unit, perM: 1 / unit };
    }

    function deformed(getShape, userScale) {
      clear(G.diag); clear(G.lab); clear(G.def);
      if (!FR) return { max: 0 };
      var mx = 0, shapes = [];
      FR.members.forEach(function (m, k) {
        var sp = getShape(k); shapes.push(sp);
        sp.forEach(function (p) { mx = Math.max(mx, p.d); });
      });
      if (mx < 1e-12) return { max: 0 };
      var amp = userScale || (R * .05 / mx);
      var segs = [];
      FR.members.forEach(function (m, k) {
        var sp = shapes[k], a = FR.nodes[m.i], gm = FR.geom(m), Rm = gm.R;
        for (var i = 0; i < sp.length - 1; i++) {
          var A = sp[i], B = sp[i + 1];
          var ax = a.x + Rm[0][0] * A.xl, ay = a.y + Rm[0][1] * A.xl, az = a.z + Rm[0][2] * A.xl;
          var bx = a.x + Rm[0][0] * B.xl, by = a.y + Rm[0][1] * B.xl, bz = a.z + Rm[0][2] * B.xl;
          segs.push(ax + (A.x - ax) * amp, ay + (A.y - ay) * amp, az + (A.z - az) * amp,
                    bx + (B.x - bx) * amp, by + (B.y - by) * amp, bz + (B.z - bz) * amp);
        }
      });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(segs, 3));
      G.def.add(new T.LineSegments(g, new T.LineBasicMaterial({ color: 0x34d399 })));
      return { max: mx, scale: amp };
    }

    function axesOf(k) {
      clear(G.axes);
      sel = k;
      picks.forEach(function (p) {
        p.material = p.userData.k === k
          ? new T.MeshLambertMaterial({ color: 0xfbbf24 })
          : (FR.members[p.userData.k].kind === 'col'
             ? new T.MeshLambertMaterial({ color: 0x93a5c0 })
             : new T.MeshLambertMaterial({ color: 0x64748b }));
      });
      if (k < 0 || !FR) return;
      var m = FR.members[k], gm = FR.geom(m), Rm = gm.R,
          a = FR.nodes[m.i], b = FR.nodes[m.j];
      var mid = new T.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      var len = Math.min(gm.L * .34, R * .11);
      var cols = [0xf87171, 0x34d399, 0x60a5fa];
      for (var i = 0; i < 3; i++) {
        var dir = new T.Vector3(Rm[i][0], Rm[i][1], Rm[i][2]);
        G.axes.add(new T.ArrowHelper(dir, mid, len, cols[i], len * .25, len * .14));
        var sp = sprite(String(i + 1), '#' + cols[i].toString(16).padStart(6, '0'),
          Math.max(.16, R * .022));
        sp.position.copy(mid.clone().addScaledVector(dir, len * 1.18));
        G.axes.add(sp);
      }
    }

    var rc = new T.Raycaster(), m2v = new T.Vector2(), moved = false;
    rn.domElement.addEventListener('pointerdown', function () { moved = false; });
    rn.domElement.addEventListener('pointermove', function () { moved = true; });
    rn.domElement.addEventListener('pointerup', function (e) {
      if (moved || !picks.length) return;
      var r = rn.domElement.getBoundingClientRect();
      m2v.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      m2v.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      rc.setFromCamera(m2v, cam);
      var hit = rc.intersectObjects(picks, false);
      if (hit.length && onPick) onPick(hit[0].object.userData.k);
    });

    function fit() {
      var w2 = host.clientWidth, h2 = host.clientHeight;
      if (!w2 || !h2) return;
      cam.aspect = w2 / h2; cam.updateProjectionMatrix(); rn.setSize(w2, h2, false);
      if (!touched && FR) frameCam();
    }
    var onRz = fit; global.addEventListener('resize', onRz);
    function loop() {
      if (dead) return;
      if (!host.isConnected) { api.dispose(); return; }
      raf = requestAnimationFrame(loop);
      if (ctl) ctl.update();
      rn.render(sc, cam);
    }
    var api = {
      build: build, diagram: diagram, deformed: deformed, axes: axesOf,
      foundations: foundations, fit: fit, R: function () { return R; },
      show: function (g, v) { if (G[g]) G[g].visible = v; },
      clearDiag: function () { clear(G.diag); clear(G.lab); clear(G.def); },
      dispose: function () {
        if (dead) return; dead = true;
        cancelAnimationFrame(raf);
        global.removeEventListener('resize', onRz);
        gn.forEach(function (n) { clear(G[n]); });
        rn.dispose();
        if (rn.domElement.parentNode) rn.domElement.parentNode.removeChild(rn.domElement);
      }
    };
    loop();
    return api;
  }

  global.FEM3DUI = { injectCSS: injectCSS, Viewport: Viewport, DIAG: DIAG, sprite: null };
})(typeof window !== 'undefined' ? window : globalThis);
