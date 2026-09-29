/* ============================================================================
   bar3d.js — عارض **سيخ واحد** بأبعاده، لصفحة التفصيل (MNL-66).

   مستقلّ تماماً عن `viewer3d.js`: مشهد خاصّ وكاميرا خاصّة ومجسّمات خاصّة.
   لا يشارك الأصل حالةً ولا دوالّ، فلا يمسّ اللوحة ثلاثية الأبعاد الأولى بشيء.

   يرسم السيخ كما يُفصَّل بالدليل:
     * كل ضلع بحرفه (A · B · C · D · F · G) وبخطّ قياس مع الرقم بالمليمتر
     * قوس الثنية بنصف قطره الحقيقي (ACI جدول 25.3.1)
     * البُعد الكلي O من الطرف للطرف
     * والكرسي (النوع 26) يُرسم **بمستويين** فيُرى أنه لا يقع مسطّحاً
   ========================================================================= */
(function (global) {
  'use strict';

  var T = null;
  function three() { return global.THREE; }

  /** مسار السيخ بالفضاء من قائمة الأضلاع.
   *  segs = [{k:'A', m:0.12, dir:[x,y,z]}, ...] — الاتجاه متّجه وحدة. */
  function path(segs, radius) {
    // رؤوس السيخ أولاً، ثم تُدوَّر الزوايا بنصف قطر الثني الحقيقي: نقطة قبل
    // الركن بـ r ونقطة بعده بـ r ونقطة وسطية بينهما. وبهذا تبقى الأضلاع
    // **مستقيمة** ولا يميل الضلع كله كما يفعل التنعيم الساذج.
    var V = [new T.Vector3(0, 0, 0)], i;
    for (i = 0; i < segs.length; i++) {
      var d = new T.Vector3().fromArray(segs[i].dir).normalize();
      V.push(V[V.length - 1].clone().addScaledVector(d, segs[i].m));
    }
    var pts = [V[0].clone()];
    for (i = 1; i < V.length - 1; i++) {
      var din = V[i].clone().sub(V[i - 1]).normalize();
      var dout = V[i + 1].clone().sub(V[i]).normalize();
      var r = Math.min(radius, V[i].distanceTo(V[i - 1]) * .42,
        V[i].distanceTo(V[i + 1]) * .42);
      pts.push(V[i].clone().addScaledVector(din, -r));
      pts.push(V[i].clone().addScaledVector(din, -r * .3).addScaledVector(dout, r * .3));
      pts.push(V[i].clone().addScaledVector(dout, r));
    }
    pts.push(V[V.length - 1].clone());
    return pts;
  }

  /** خطّ قياس: خطّ رفيع موازٍ للضلع + شرطتان بطرفيه. */
  function dimLine(a, b, off, col) {
    var g = new T.BufferGeometry();
    var o = new T.Vector3().fromArray(off);
    var a2 = a.clone().add(o), b2 = b.clone().add(o);
    var v = [];
    var push = function (p, q) { v.push(p.x, p.y, p.z, q.x, q.y, q.z); };
    push(a2, b2); push(a, a2); push(b, b2);
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    return new T.LineSegments(g, new T.LineBasicMaterial({ color: col }));
  }

  /** لوحة نصّ صغيرة (Sprite) — الرقم بالمليمتر وحرف الضلع. */
  function label(txt, col, sz) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    var x = c.getContext('2d');
    x.fillStyle = 'rgba(12,18,30,.86)';
    x.fillRect(0, 0, 256, 96);
    x.strokeStyle = col; x.lineWidth = 4; x.strokeRect(2, 2, 252, 92);
    x.fillStyle = '#e8eef8';
    x.font = 'bold 54px system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(txt, 128, 50);
    var tx = new T.CanvasTexture(c);
    tx.minFilter = T.LinearFilter;
    var sp = new T.Sprite(new T.SpriteMaterial({ map: tx, depthTest: false }));
    var k = sz || .30;
    sp.scale.set(k, k * .375, 1);
    return sp;
  }

  /* اتجاهات أضلاع كل نوع ثني — بالمستوى XY إلا الكرسي فبمستويين. */
  function dirsFor(type, n) {
    var d = [];
    if (type === 't26') {                        // كرسي: قدم Z · رجل Y · عرضة X · رجل · قدم
      return [[0, 0, -1], [0, 1, 0], [1, 0, 0], [0, -1, 0], [0, 0, 1]].slice(0, n);
    }
    if (type === 't2') return [[0, 1, 0], [1, 0, 0], [0, 1, 0]].slice(0, n);
    if (type === 't1') return [[0, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0]].slice(0, n);
    if (type === 't6' || type === 't5') {
      return [[1, 0, 0], [0.7, 0.7, 0], [1, 0, 0], [0.7, -0.7, 0],
              [1, 0, 0], [0, 1, 0], [1, 0, 0], [0, 1, 0]].slice(0, n);
    }
    for (var i = 0; i < n; i++) d.push([1, 0, 0]);
    return d;
  }

  /** يبني العارض داخل عنصر ويعيد واجهة { show(bar), dispose() }. */
  function make(host) {
    T = three();
    if (!T || !host) return null;
    var w = host.clientWidth || 640, h = host.clientHeight || 360;
    var rn = new T.WebGLRenderer({ antialias: true, alpha: true });
    rn.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    rn.setSize(w, h);
    host.innerHTML = '';
    rn.domElement.style.width = '100%';
    rn.domElement.style.height = '100%';
    rn.domElement.style.display = 'block';
    host.appendChild(rn.domElement);
    var sc = new T.Scene();
    var cam = new T.PerspectiveCamera(42, w / h, .01, 200);
    sc.add(new T.HemisphereLight(0xd7e8ff, 0x33291c, 1.15));
    var dl = new T.DirectionalLight(0xffffff, .55);
    dl.position.set(3, 6, 4); sc.add(dl);
    var grp = new T.Group(); sc.add(grp);
    var spin = 0, raf = 0, auto = true, last = null;

    function clear() {
      while (grp.children.length) {
        var c = grp.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material && c.material.map) c.material.map.dispose();
        if (c.material) c.material.dispose();
      }
    }

    function show(bar) {
      clear();
      // الحاوية تُصفَّر قبل القياس: `show` السابقة أزاحتها ودارت بها، ولو
      // قيس صندوقها وهي مُزاحة خرج الحجم خطأً فابتعدت الكاميرا بلا سبب.
      grp.position.set(0, 0, 0);
      grp.rotation.set(0, 0, 0);
      grp.updateMatrixWorld(true);
      if (!bar || !bar.dims || !bar.dims.length) return;
      // تُقاس اللوحة **عند العرض** لا عند الإنشاء: قد تُبنى قبل أن يأخذ
      // العنصر مقاسه بالصفحة، فتخرج النسبة خطأً ويبدو المجسّم صغيراً.
      fit();
      var rad = (bar.db || 12) / 2000;
      var bend = (bar.bend_dia || 60) / 2000;
      var dirs = dirsFor(bar.type, bar.dims.length);
      var segs = bar.dims.map(function (d, i) {
        return { k: d.k, m: Math.max(.02, d.m), dir: dirs[i] || [1, 0, 0] };
      });
      var pts = path(segs, bend);
      var curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0);
      var tube = new T.TubeGeometry(curve, Math.max(60, pts.length * 8), rad, 14, false);
      var mesh = new T.Mesh(tube, new T.MeshLambertMaterial({ color: 0xe8443a }));
      grp.add(mesh);

      // خطوط القياس وحروف الأضلاع — حجم اللوحة **نسبةً للمجسّم** لا ثابتاً،
      // وإلا غطّت لوحة 30 سم كرسياً طوله 40 سم.
      var cur = new T.Vector3(0, 0, 0);
      var bb = new T.Box3().setFromObject(mesh);
      var span = Math.max(.2, bb.max.distanceTo(bb.min));
      var oL = span * .10;
      var lsz = Math.max(.06, Math.min(.5, span * .20));
      segs.forEach(function (s) {
        var d = new T.Vector3().fromArray(s.dir).normalize();
        var nxt = cur.clone().addScaledVector(d, s.m);
        var off = Math.abs(d.y) > .5 ? [oL, 0, 0] : [0, -oL, 0];
        grp.add(dimLine(cur, nxt, off, 0x60a5fa));
        var mid = cur.clone().add(nxt).multiplyScalar(.5)
          .add(new T.Vector3().fromArray(off).multiplyScalar(1.55));
        var lb = label(s.k + ' = ' + Math.round(s.m * 1000), '#60a5fa', lsz);
        lb.position.copy(mid);
        grp.add(lb);
        cur = nxt;
      });
      // البُعد الكلي O
      bb = new T.Box3().setFromObject(mesh);
      var a = new T.Vector3(bb.min.x, bb.min.y - oL * 2.8, bb.min.z);
      var b = new T.Vector3(bb.max.x, bb.min.y - oL * 2.8, bb.min.z);
      grp.add(dimLine(a, b, [0, 0, 0], 0xfacc15));
      var lo = label('O = ' + Math.round((bb.max.x - bb.min.x) * 1000), '#facc15', lsz * 1.1);
      lo.position.copy(a.clone().add(b).multiplyScalar(.5).add(new T.Vector3(0, -oL * .9, 0)));
      grp.add(lo);

      // توسيط الكاميرا على المجسّم
      bb = new T.Box3().setFromObject(grp);
      var c2 = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
      grp.position.sub(c2);
      // التأطير على **البُعدين** معاً: اللوحة عريضة قصيرة، فالتأطير على
      // الارتفاع وحده يترك المجسّم صغيراً بوسط فراغ عريض.
      var fv = cam.fov * Math.PI / 180;
      var fh = 2 * Math.atan(Math.tan(fv / 2) * cam.aspect);
      // sz يشمل لوحات الأبعاد أصلاً، فالهامش 6% يكفي — والزيادة عليه هي
      // التي كانت تترك المجسّم صغيراً بوسط اللوحة.
      var dv = sz.y * 1.06 / 2 / Math.tan(fv / 2);
      var dh = sz.x * 1.06 / 2 / Math.tan(fh / 2);
      var R = Math.max(dv, dh, sz.z * 1.3);
      cam.position.set(R * .12, R * .30, R);
      cam.lookAt(0, 0, 0);
      spin = 0;
      last = { sz: [+sz.x.toFixed(3), +sz.y.toFixed(3), +sz.z.toFixed(3)],
        lsz: +lsz.toFixed(3), R: +R.toFixed(3), aspect: +cam.aspect.toFixed(2),
        dv: +dv.toFixed(3), dh: +dh.toFixed(3) };
    }

    function fit() {
      var w2 = host.clientWidth || w, h2 = host.clientHeight || h;
      if (!w2 || !h2) return;
      cam.aspect = w2 / h2; cam.updateProjectionMatrix();
      rn.setSize(w2, h2, false);
    }
    global.addEventListener('resize', fit);

    function loop() {
      raf = requestAnimationFrame(loop);
      if (auto) { spin += .004; grp.rotation.y = Math.sin(spin) * .55; }
      rn.render(sc, cam);
    }
    loop();

    var down = false, lx = 0;
    rn.domElement.addEventListener('pointerdown', function (e) {
      down = true; lx = e.clientX; auto = false;
    });
    global.addEventListener('pointerup', function () { down = false; });
    global.addEventListener('pointermove', function (e) {
      if (!down) return;
      grp.rotation.y += (e.clientX - lx) * .01; lx = e.clientX;
    });

    return {
      show: show,
      info: function () { return last; },
      auto: function (v) { auto = !!v; },
      resize: fit,
      dispose: function () { cancelAnimationFrame(raf); clear(); rn.dispose(); }
    };
  }

  global.BAR3D = { make: make };
})(window);
