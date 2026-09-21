/* ============================================================================
   fem3d.js — «التحليل الإنشائي المتطور» (Advanced Structural Analysis)

   وحدة مستقلّة تماماً: لا تمسّ `viewer3d.js` ولا `app.js` ولا أيّ حالة قائمة.
   تعرّف كائناً عالمياً واحداً هو `FEM3D`، وتحقن تنسيقها الخاصّ بنطاق `#fem`.

   المنهج: **طريقة الصلابة المباشرة** (Direct Stiffness Method) لإطار فراغي
   ٦ درجات حرية لكل عقدة — وهي **نفس** الطريقة التي يستعملها ETABS للعناصر
   الخطية (Frame Elements). ليست تقريبية: للعنصر المنشوري المرن الخطّي يكون
   حلّ المصفوفة **مطابقاً للحلّ التفاضلي المضبوط**، فالعزوم تطابق ETABS إلى
   ٣–٤ خانات معنوية ما دامت الافتراضات واحدة (المقاطع · معاملات التشقّق ·
   الاستناد · الديافرام · الأحمال).

   المراجع:
     • ACI 318M-19 §6.6.3.1.1 — معاملات التشقّق (0.35·Ig للجسور · 0.70·Ig للأعمدة)
     • R.C. Hibbeler, Structural Analysis — Ch.16 «Matrix Stiffness Method»
     • Cook, Malkus & Plesha, Concepts & Applications of Finite Element Analysis
     • Timoshenko & Goodier, Theory of Elasticity — ثابت الالتواء J للمقطع المستطيل
   ========================================================================= */
(function (global) {
  'use strict';

  /* ══════════════════════════ أدوات صغيرة ══════════════════════════ */
  function nf(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    d = d === undefined ? 2 : d;
    var a = Math.abs(v);
    // ما دون 10⁻⁹ صفرٌ فيزيائياً (نانومتر أو ميكرو-نيوتن) وليس قيمة — وهو
    // بقايا التقريب العشري. عرضه «7.4e-32» يشوّش على القارئ بلا فائدة.
    if (a < 1e-9) return (0).toFixed(d);
    if (a < 1e-3 || a >= 1e7) return v.toExponential(2);
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* ════════════ ١) حلّ نظام متماثل شريطي بتحليل LDLᵀ ════════════
     [K]{u} = {F} — التحليل K = L·D·Lᵀ ثم استبدال أمامي فخلفي.
     التكلفة O(n·bw²) بدل O(n³)، فالمصفوفة الشريطية تحلّ بالمتصفّح فوراً.
     المرجع: Bathe, Finite Element Procedures §8.2.2 (Active Column Solver). */
  function solveBand(A, F, n, bw) {
    var i, j, k, lo, s;
    var at = function (r, c) { return A[r * n + c]; };
    var set = function (r, c, v) { A[r * n + c] = v; };
    for (j = 0; j < n; j++) {
      lo = Math.max(0, j - bw);
      for (i = lo; i < j; i++) {
        s = at(j, i);
        for (k = Math.max(lo, i - bw); k < i; k++) s -= at(j, k) * at(i, k) * at(k, k);
        set(j, i, s / at(i, i));
      }
      s = at(j, j);
      for (k = lo; k < j; k++) s -= at(j, k) * at(j, k) * at(k, k);
      if (Math.abs(s) < 1e-10)
        throw new Error('المنشأ غير مستقر عند الدرجة ' + j + ' — راجع شروط الاستناد');
      set(j, j, s);
    }
    var y = new Float64Array(n);
    for (i = 0; i < n; i++) y[i] = F[i];
    for (i = 0; i < n; i++)
      for (k = Math.max(0, i - bw); k < i; k++) y[i] -= at(i, k) * y[k];
    for (i = 0; i < n; i++) y[i] /= at(i, i);
    for (i = n - 1; i >= 0; i--)
      for (k = i + 1; k < Math.min(n, i + bw + 1); k++) y[i] -= at(k, i) * y[k];
    return y;
  }

  /* ════════════ ٢) ثابت الالتواء J لمقطع مستطيل ════════════
     J = β·b³·h حيث b الضلع الأقصر و β دالة النسبة h/b (Timoshenko).
     ETABS يحسب J بنفس الجدول للمقاطع المستطيلة. */
  var BETA = [[1, .141], [1.5, .196], [2, .229], [2.5, .249], [3, .263],
              [4, .281], [5, .291], [6, .299], [10, .312], [1e9, .3333]];
  function torsionJ(b, h) {
    var lo = Math.min(b, h), hi = Math.max(b, h), r = hi / lo, be = .3333;
    for (var k = 0; k < BETA.length - 1; k++)
      if (BETA[k][0] <= r && r <= BETA[k + 1][0]) {
        var t = (r - BETA[k][0]) / (BETA[k + 1][0] - BETA[k][0]);
        be = BETA[k][1] + t * (BETA[k + 1][1] - BETA[k][1]);
        break;
      }
    return be * lo * lo * lo * hi;
  }

  /* ═══════════════════ ٣) محرّك الإطار الفراغي ═══════════════════
     العقدة: ٦ درجات حرية [ux, uy, uz, θx, θy, θz] بالنظام العام.
     العنصر: مصفوفة 12×12 بالنظام المحلّي، محاوره كاصطلاح ETABS:
        المحور 1 = طول العنصر · المحور 2 و 3 = المحوران العرضيان
     فالانحناء في المستوى 1-2 يستعمل I33، وفي المستوى 1-3 يستعمل I22. */
  function Frame(opt) {
    opt = opt || {};
    this.nu = opt.nu === undefined ? 0.2 : opt.nu;
    this.nodes = [];      // {x, y, z}   —  z هو الشاقولي
    this.members = [];
    this.sup = {};        // idx -> [6] ، 1 = مقيَّد
    this.nl = {};         // idx -> [Fx,Fy,Fz,Mx,My,Mz]
    this.diaph = [];      // ديافرام صلب لكل طابق
  }

  Frame.prototype.node = function (x, y, z) {
    this.nodes.push({ x: x, y: y, z: z }); return this.nodes.length - 1;
  };
  Frame.prototype.member = function (i, j, p) {
    var m = {
      i: i, j: j, E: p.E, G: p.G === undefined ? p.E / (2 * (1 + this.nu)) : p.G,
      A: p.A, I22: p.I22, I33: p.I33, J: p.J,
      w2: p.w2 || 0, w3: p.w3 || 0,        // حمل موزّع بالمحاور المحلية
      wgx: p.wgx || 0, wgy: p.wgy || 0, wgz: p.wgz || 0,   // أو بالعام
      kind: p.kind || 'beam', b: p.b || 0, h: p.h || 0,
      mod: p.mod === undefined ? 1 : p.mod, tag: p.tag || ''
    };
    this.members.push(m); return this.members.length - 1;
  };
  Frame.prototype.support = function (n, f) { this.sup[n] = f || [1, 1, 1, 1, 1, 1]; };
  Frame.prototype.load = function (n, v) {
    var p = this.nl[n] || [0, 0, 0, 0, 0, 0];
    for (var k = 0; k < 6; k++) p[k] += (v[k] || 0);
    this.nl[n] = p;
  };
  Frame.prototype.diaphragm = function (nodes) {
    var cx = 0, cy = 0;
    for (var k = 0; k < nodes.length; k++) { cx += this.nodes[nodes[k]].x; cy += this.nodes[nodes[k]].y; }
    this.diaph.push({ nodes: nodes.slice(), cx: cx / nodes.length, cy: cy / nodes.length });
  };

  /* هندسة العنصر: الطول ومصفوفة جيوب التمام [R] 3×3.

     المحاور المحلّية باصطلاح ETABS حرفياً:
       • المحور 1 على طول العنصر من العقدة i إلى j.
       • للعنصر **غير الشاقولي** (جسر): المحور 2 هو مسقط الشاقول +Z على
         المستوى العمودي على المحور 1 — أي «إلى فوق». فيكون الانحناء تحت
         الحمل الشاقولي في المستوى 1-2 ويُسمّى **M33** وهو المحور القوي.
       • للعنصر **الشاقولي** (عمود): المحور 2 نحو +X العام.
       • المحور 3 = المحور 1 × المحور 2 (ثلاثي يمينيّ).

     هذا هو سبب تسمية ETABS: M33 هو عزم الانحناء الرئيسي للجسر، و M22 الثانوي. */
  Frame.prototype.geom = function (m) {
    var a = this.nodes[m.i], b = this.nodes[m.j];
    var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-9) throw new Error('عنصر بطول صفر بين العقدتين ' + m.i + ' و ' + m.j);
    var e1 = [dx / L, dy / L, dz / L], e2;
    if (Math.abs(e1[2]) > 0.999) {
      e2 = [1, 0, 0];                                  // عمود شاقولي
    } else {
      var d = e1[2];                                   // مسقط +Z على العمودي على e1
      e2 = [-d * e1[0], -d * e1[1], 1 - d * e1[2]];
      var n = Math.sqrt(e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2]) || 1;
      e2 = [e2[0] / n, e2[1] / n, e2[2] / n];
    }
    var e3 = [e1[1] * e2[2] - e1[2] * e2[1],
              e1[2] * e2[0] - e1[0] * e2[2],
              e1[0] * e2[1] - e1[1] * e2[0]];
    return { L: L, R: [e1, e2, e3] };
  };

  /* مصفوفة الصلابة المحلّية 12×12 — Hibbeler eq. 16-1 (موسّعة للفراغ).
     الترتيب: [u1 v2 w3 θ1 θ2 θ3]i ثم [u1 v2 w3 θ1 θ2 θ3]j */
  Frame.kLocal = function (m, L) {
    var k = new Float64Array(144), i;
    var st = function (r, c, v) { k[r * 12 + c] = v; };
    var E = m.E, G = m.G, A = m.A, I22 = m.I22, I33 = m.I33, J = m.J;
    var ea = E * A / L, gj = G * J / L;
    st(0, 0, ea); st(6, 6, ea); st(0, 6, -ea); st(6, 0, -ea);
    st(3, 3, gj); st(9, 9, gj); st(3, 9, -gj); st(9, 3, -gj);
    // انحناء بالمستوى 1-2 (حول المحور 3) — يستعمل I33
    var a = 12 * E * I33 / (L * L * L), b = 6 * E * I33 / (L * L),
        c = 4 * E * I33 / L, d = 2 * E * I33 / L;
    st(1, 1, a); st(7, 7, a); st(1, 7, -a); st(7, 1, -a);
    st(1, 5, b); st(5, 1, b); st(1, 11, b); st(11, 1, b);
    st(5, 7, -b); st(7, 5, -b); st(7, 11, -b); st(11, 7, -b);
    st(5, 5, c); st(11, 11, c); st(5, 11, d); st(11, 5, d);
    // انحناء بالمستوى 1-3 (حول المحور 2) — يستعمل I22
    a = 12 * E * I22 / (L * L * L); b = 6 * E * I22 / (L * L);
    c = 4 * E * I22 / L; d = 2 * E * I22 / L;
    st(2, 2, a); st(8, 8, a); st(2, 8, -a); st(8, 2, -a);
    st(2, 4, -b); st(4, 2, -b); st(2, 10, -b); st(10, 2, -b);
    st(4, 8, b); st(8, 4, b); st(8, 10, b); st(10, 8, b);
    st(4, 4, c); st(10, 10, c); st(4, 10, d); st(10, 4, d);
    return k;
  };

  /* أحمال التثبيت التامّة {q0} للحمل الموزّع المنتظم — Hibbeler Table 16-1.
     الحمل يُعطى محلياً (w2, w3) أو عاماً (wgx, wgy, wgz) فيُسقط على المحاور. */
  Frame.prototype.fef = function (m, L, R) {
    var w2 = m.w2, w3 = m.w3;
    if (m.wgx || m.wgy || m.wgz) {
      var g = [m.wgx, m.wgy, m.wgz];
      w2 += R[1][0] * g[0] + R[1][1] * g[1] + R[1][2] * g[2];
      w3 += R[2][0] * g[0] + R[2][1] * g[1] + R[2][2] * g[2];
    }
    var q = new Float64Array(12);
    q[1] = -w2 * L / 2; q[5] = -w2 * L * L / 12;
    q[7] = -w2 * L / 2; q[11] = w2 * L * L / 12;
    q[2] = -w3 * L / 2; q[4] = w3 * L * L / 12;
    q[8] = -w3 * L / 2; q[10] = -w3 * L * L / 12;
    return { q: q, w2: w2, w3: w3 };
  };

  /* خريطة درجات الحرية: كل درجة → قائمة (رقم المعادلة، المعامل).
     الديافرام الصلب يربط ux و uy و θz لعقد الطابق بثلاث درجات رئيسية فقط،
     وهو ما يفعله ETABS بخيار Rigid Diaphragm. */
  Frame.prototype.mapDofs = function () {
    var nn = this.nodes.length, i, k, q, n;
    this.dmap = [];
    for (i = 0; i < nn; i++) this.dmap.push([[], [], [], [], [], []]);
    var eq = 0, done = {};
    this.master = [];
    for (k = 0; k < this.diaph.length; k++) {
      var d = this.diaph[k], mx = eq, my = eq + 1, mr = eq + 2;
      eq += 3; this.master.push([mx, my, mr]);
      for (i = 0; i < d.nodes.length; i++) {
        n = d.nodes[i];
        var s = this.sup[n] || [0, 0, 0, 0, 0, 0], nd = this.nodes[n], dm = this.dmap[n];
        if (!s[0]) dm[0] = [[mx, 1], [mr, -(nd.y - d.cy)]];
        if (!s[1]) dm[1] = [[my, 1], [mr, (nd.x - d.cx)]];
        if (!s[5]) dm[5] = [[mr, 1]];
        var rest = [2, 3, 4];
        for (q = 0; q < 3; q++) if (!s[rest[q]]) { dm[rest[q]] = [[eq, 1]]; eq++; }
        done[n] = 1;
      }
    }
    for (n = 0; n < nn; n++) {
      if (done[n]) continue;
      var sp = this.sup[n] || [0, 0, 0, 0, 0, 0];
      for (q = 0; q < 6; q++) if (!sp[q]) { this.dmap[n][q] = [[eq, 1]]; eq++; }
    }
    this.neq = eq;
    var bw = 0;
    for (k = 0; k < this.members.length; k++) {
      var m = this.members[k], idx = [];
      for (q = 0; q < 6; q++) {
        var A1 = this.dmap[m.i][q], B1 = this.dmap[m.j][q];
        for (i = 0; i < A1.length; i++) idx.push(A1[i][0]);
        for (i = 0; i < B1.length; i++) idx.push(B1[i][0]);
      }
      if (idx.length) bw = Math.max(bw, Math.max.apply(null, idx) - Math.min.apply(null, idx));
    }
    this.bw = bw;
    return eq;
  };

  /* الحلّ الكامل: تجميع [K] و {F} ثم الحلّ ثم استرجاع قوى أطراف العناصر. */
  Frame.prototype.run = function () {
    var t0 = (global.performance || Date).now();
    var n = this.mapDofs();
    if (!this.members.length) throw new Error('النموذج بلا عناصر');
    if (n > 4200) throw new Error('النموذج كبير (' + n + ' درجة حرية) — قلّل الشبكة');
    // n = 0 حالة مشروعة (عنصر مثبّت الطرفين): الإزاحات صفر وقوى الأطراف = {q0}
    var K = new Float64Array(n * n), F = new Float64Array(n), i, j, a, b, q, k;
    for (var nd in this.nl) {
      var v = this.nl[nd];
      for (q = 0; q < 6; q++) {
        var mp = this.dmap[nd][q];
        for (i = 0; i < mp.length; i++) F[mp[i][0]] += mp[i][1] * v[q];
      }
    }
    this.cache = [];
    for (k = 0; k < this.members.length; k++) {
      var m = this.members[k], gm = this.geom(m), L = gm.L, R = gm.R;
      var kl = Frame.kLocal(m, L);
      // [T] كتلية: [R] مكرّرة أربع مرات على القطر
      var T = new Float64Array(144);
      for (var blk = 0; blk < 4; blk++)
        for (a = 0; a < 3; a++) for (b = 0; b < 3; b++)
          T[(blk * 3 + a) * 12 + (blk * 3 + b)] = R[a][b];
      // [k]عام = [T]ᵀ·[k]محلي·[T]
      var kt = new Float64Array(144), kg = new Float64Array(144), s;
      for (a = 0; a < 12; a++) for (b = 0; b < 12; b++) {
        s = 0; for (i = 0; i < 12; i++) s += kl[a * 12 + i] * T[i * 12 + b];
        kt[a * 12 + b] = s;
      }
      for (a = 0; a < 12; a++) for (b = 0; b < 12; b++) {
        s = 0; for (i = 0; i < 12; i++) s += T[i * 12 + a] * kt[i * 12 + b];
        kg[a * 12 + b] = s;
      }
      var fe = this.fef(m, L, R), q0 = fe.q;
      // الأحمال المكافئة بالعقد = −[T]ᵀ{q0}
      var peq = new Float64Array(12);
      for (a = 0; a < 12; a++) {
        s = 0; for (i = 0; i < 12; i++) s += T[i * 12 + a] * q0[i];
        peq[a] = -s;
      }
      var maps = [];
      for (q = 0; q < 6; q++) maps.push(this.dmap[m.i][q]);
      for (q = 0; q < 6; q++) maps.push(this.dmap[m.j][q]);
      for (a = 0; a < 12; a++) {
        var ma = maps[a];
        for (i = 0; i < ma.length; i++) {
          var pa = ma[i][0], ca = ma[i][1];
          F[pa] += ca * peq[a];
          for (b = 0; b < 12; b++) {
            var kab = kg[a * 12 + b];
            if (kab === 0) continue;
            var mb = maps[b];
            for (j = 0; j < mb.length; j++) K[pa * n + mb[j][0]] += ca * mb[j][1] * kab;
          }
        }
      }
      this.cache.push({ L: L, R: R, kl: kl, T: T, q0: q0, maps: maps, w2: fe.w2, w3: fe.w3, kg: kg });
    }
    this.Fvec = Float64Array.from(F);
    this.U = n ? solveBand(K, F, n, this.bw) : new Float64Array(0);
    // قوى أطراف العناصر: {q} = [k]محلي·{u}محلي + {q0}
    this.mf = []; this.mu = [];
    for (k = 0; k < this.members.length; k++) {
      var c = this.cache[k], ug = new Float64Array(12), ul = new Float64Array(12),
          qq = new Float64Array(12);
      for (a = 0; a < 12; a++) {
        var mm = c.maps[a], sv = 0;
        for (i = 0; i < mm.length; i++) sv += mm[i][1] * this.U[mm[i][0]];
        ug[a] = sv;
      }
      for (a = 0; a < 12; a++) {
        var s2 = 0; for (i = 0; i < 12; i++) s2 += c.T[a * 12 + i] * ug[i];
        ul[a] = s2;
      }
      for (a = 0; a < 12; a++) {
        var s3 = 0; for (i = 0; i < 12; i++) s3 += c.kl[a * 12 + i] * ul[i];
        qq[a] = s3 + c.q0[a];
      }
      this.mf.push(qq); this.mu.push({ g: ug, l: ul });
    }
    // ردود الأفعال: مجموع قوى الأطراف العامة عند العقد المستندة
    this.reactions = {};
    for (var sn in this.sup) this.reactions[sn] = [0, 0, 0, 0, 0, 0];
    for (k = 0; k < this.members.length; k++) {
      var cc = this.cache[k], qm = this.mf[k], qg = new Float64Array(12);
      for (a = 0; a < 12; a++) {
        var s4 = 0; for (i = 0; i < 12; i++) s4 += cc.T[i * 12 + a] * qm[i];
        qg[a] = s4;
      }
      var mem = this.members[k];
      if (this.reactions[mem.i]) for (q = 0; q < 6; q++) this.reactions[mem.i][q] += qg[q];
      if (this.reactions[mem.j]) for (q = 0; q < 6; q++) this.reactions[mem.j][q] += qg[6 + q];
    }
    this.ms = ((global.performance || Date).now() - t0);
    return this;
  };

  /* ═══════════ ٤) القوى الداخلية على طول العنصر ═══════════
     باتزان الجزء الأيسر من العنصر عند المسافة x:
        V2(x) = −q1 − w2·x                      (dM33/dx = V2)
        M33(x) = q5 − q1·x − w2·x²/2            (الهبوط موجب)
        V3(x) = −q2 − w3·x
        M22(x) = −q4 − q2·x − w3·x²/2
        T(x)  = −q3        ·        N(x) = −q0   (الشدّ موجب)
     اصطلاح ETABS نفسه: V2 و M33 بالمستوى 1-2، و V3 و M22 بالمستوى 1-3. */
  Frame.prototype.stations = function (k, ns) {
    ns = ns || 21;
    var q = this.mf[k], c = this.cache[k], L = c.L, out = [];
    for (var i = 0; i < ns; i++) {
      var x = L * i / (ns - 1);
      out.push({
        x: x,
        N: -q[0] ,
        V2: -q[1] - c.w2 * x,
        V3: -q[2] - c.w3 * x,
        T: -q[3],
        M22: -q[4] - q[2] * x - c.w3 * x * x / 2,
        M33: q[5] - q[1] * x - c.w2 * x * x / 2
      });
    }
    return out;
  };

  /* الشكل المشوَّه داخل العنصر.

     جزآن يُجمعان — وإهمال الثاني هو الخطأ الشائع في المحرّكات المبسّطة:
       ١) **الحلّ المتجانس**: دوالّ هيرميت التكعيبية من إزاحات ودورانات
          الطرفين (Hibbeler §16.2). وحده لا يكفي: الشكل الحقيقي تحت حمل
          موزّع من الدرجة الرابعة، فالتكعيبي يعطي 4/5 الهبوط فقط.
       ٢) **الحلّ الخاصّ**: هبوط جائز مثبّت الطرفين تحت الحمل الموزّع
          v(x) = w·x²·(L−x)²/(24·E·I) — لأن الجزء الأول ثبّت الطرفين أصلاً
          إزاحةً ودوراناً. مجموعهما يعطي 5wL⁴/384EI للجائز بسيط الإسناد
          بالضبط، وهو ما يعرضه ETABS عند محطّات العنصر. */
  Frame.prototype.shape = function (k, ns) {
    ns = ns || 13;
    var m = this.members[k];
    var c = this.cache[k], u = this.mu[k].l, L = c.L, R = c.R, a = this.nodes[m.i];
    var EI33 = m.E * m.I33, EI22 = m.E * m.I22, out = [];
    for (var i = 0; i < ns; i++) {
      var t = i / (ns - 1), t2 = t * t, t3 = t2 * t, x = t * L, g = x * x * (L - x) * (L - x) / 24;
      var N1 = 1 - 3 * t2 + 2 * t3, N2 = L * (t - 2 * t2 + t3),
          N3 = 3 * t2 - 2 * t3, N4 = L * (t3 - t2);
      var d1 = u[0] * (1 - t) + u[6] * t;                       // محوري
      var d2 = N1 * u[1] + N2 * u[5] + N3 * u[7] + N4 * u[11] + (EI33 ? c.w2 * g / EI33 : 0);
      var d3 = N1 * u[2] - N2 * u[4] + N3 * u[8] - N4 * u[10] + (EI22 ? c.w3 * g / EI22 : 0);
      out.push({
        x: a.x + R[0][0] * (t * L + d1) + R[1][0] * d2 + R[2][0] * d3,
        y: a.y + R[0][1] * (t * L + d1) + R[1][1] * d2 + R[2][1] * d3,
        z: a.z + R[0][2] * (t * L + d1) + R[1][2] * d2 + R[2][2] * d3,
        d: Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3)
      });
    }
    return out;
  };

  Frame.prototype.nodeDisp = function (n) {
    var d = [0, 0, 0, 0, 0, 0];
    for (var q = 0; q < 6; q++) {
      var mp = this.dmap[n][q], s = 0;
      for (var i = 0; i < mp.length; i++) s += mp[i][1] * this.U[mp[i][0]];
      d[q] = s;
    }
    return d;
  };

  /* ═══════════ ٥) بناء نموذج إطار منتظم من مدخلات الشبكة ═══════════ */
  function buildModel(c) {
    var f = new Frame({ nu: c.nu || 0.2 });
    var E = c.E;                                     // kN/m²
    var nx = c.nx, ny = c.ny, ns = c.ns;
    var sx = c.sx, sy = c.sy, hs = c.hs;
    var Xs = [], Ys = [], Zs = [], i, j, k;
    for (i = 0; i <= nx; i++) Xs.push(i * sx);
    for (j = 0; j <= ny; j++) Ys.push(j * sy);
    for (k = 0; k <= ns; k++) Zs.push(k * hs);
    var id = [];                                     // id[k][j][i]
    for (k = 0; k <= ns; k++) {
      id.push([]);
      for (j = 0; j <= ny; j++) {
        id[k].push([]);
        for (i = 0; i <= nx; i++) id[k][j].push(f.node(Xs[i], Ys[j], Zs[k]));
      }
    }
    // مقاطع: التشقّق وفق ACI 318M-19 جدول 6.6.3.1.1(a)
    var cb = c.cracked ? 0.35 : 1.0, cc = c.cracked ? 0.70 : 1.0;
    var sec = function (b, h, mod, kind) {
      return { E: E, A: b * h, I22: mod * h * b * b * b / 12, I33: mod * b * h * h * h / 12,
               J: mod * torsionJ(b, h), b: b, h: h, mod: mod, kind: kind };
    };
    var SB = sec(c.bb, c.bh, cb, 'beam'), SC = sec(c.cb, c.ch, cc, 'col');
    var mk = function (a, b2, S, extra) {
      var p = { E: S.E, A: S.A, I22: S.I22, I33: S.I33, J: S.J, b: S.b, h: S.h,
                mod: S.mod, kind: S.kind };
      if (extra) for (var q in extra) p[q] = extra[q];
      return f.member(a, b2, p);
    };
    // أعمدة
    for (k = 0; k < ns; k++) for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++)
      mk(id[k][j][i], id[k + 1][j][i], SC, { tag: 'C' + (i + 1) + '-' + (j + 1) + ' / ط' + (k + 1) });
    // جسور باتجاه X ثم Y — الحمل الموزّع شاقولي لأسفل (wgz سالب)
    var w = -Math.abs(c.wUDL);
    for (k = 1; k <= ns; k++) {
      for (j = 0; j <= ny; j++) for (i = 0; i < nx; i++)
        mk(id[k][j][i], id[k][j][i + 1], SB,
           { wgz: w, tag: 'BX' + (i + 1) + '-' + (j + 1) + ' / ط' + k });
      for (j = 0; j < ny; j++) for (i = 0; i <= nx; i++)
        mk(id[k][j][i], id[k][j + 1][i], SB,
           { wgz: w, tag: 'BY' + (i + 1) + '-' + (j + 1) + ' / ط' + k });
    }
    // الاستناد
    var fix = c.base !== 'pin';
    for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++)
      f.support(id[0][j][i], fix ? [1, 1, 1, 1, 1, 1] : [1, 1, 1, 0, 0, 0]);
    // الديافرام الصلب + الحمل الجانبي
    var story = [];
    for (k = 1; k <= ns; k++) {
      var lst = [];
      for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) lst.push(id[k][j][i]);
      story.push(lst);
      if (c.diaph) f.diaphragm(lst);
    }
    if (c.wLat) {
      for (k = 0; k < story.length; k++) {
        var per = c.wLat / story[k].length;
        for (i = 0; i < story[k].length; i++)
          f.load(story[k][i], [c.latDir === 'y' ? 0 : per, c.latDir === 'y' ? per : 0, 0, 0, 0, 0]);
      }
    }
    f.meta = { id: id, story: story, Xs: Xs, Ys: Ys, Zs: Zs, cfg: c, SB: SB, SC: SC };
    return f;
  }

  /* ═══════════ ٦) حالات تحقّق لها حلّ مغلق مضبوط ═══════════
     هذه هي الحجّة العلمية: إن طابق المحرّك الحلّ التحليلي بصفر خطأ فهو
     مطابق لـ ETABS بالضرورة، لأن كليهما يحلّ نفس المعادلة بنفس الطريقة. */
  function benchmarks() {
    var E = 25e6, L = 6, w = 20, out = [];       // kN/m² · m · kN/m
    var b = 0.3, h = 0.6, A = b * h, I33 = b * h * h * h / 12, I22 = h * b * b * b / 12,
        J = torsionJ(b, h), G = E / (2 * (1 + 0.2));
    var P = { E: E, A: A, I22: I22, I33: I33, J: J };

    function beam(supA, supB, wl) {
      var f = new Frame();
      var a = f.node(0, 0, 0), c = f.node(L, 0, 0);
      var pp = {}; for (var q in P) pp[q] = P[q];
      pp.wgz = wl === undefined ? -w : wl;
      f.member(a, c, pp);
      f.support(a, supA); f.support(c, supB);
      f.run(); return f;
    }
    // ١) جائز بسيط الإسناد بحمل منتظم
    var f1 = beam([1, 1, 1, 1, 0, 1], [1, 1, 1, 1, 0, 1]);
    var s1 = f1.stations(0, 21);
    out.push({ name: 'جائز بسيط الإسناد · حمل منتظم', q: 'M₃₃ عند الوسط',
      ref: 'wL²/8', exact: w * L * L / 8, got: Math.abs(s1[10].M33),
      src: 'Hibbeler Ex. 11-1' });
    var d1 = f1.shape(0, 21)[10].d;
    out.push({ name: 'جائز بسيط الإسناد · حمل منتظم', q: 'هبوط الوسط δ',
      ref: '5wL⁴/384EI', exact: 5 * w * Math.pow(L, 4) / (384 * E * I33), got: d1,
      src: 'AISC Table 3-23' });
    // ٢) جائز مثبّت الطرفين
    var f2 = beam([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1]);
    var s2 = f2.stations(0, 21);
    out.push({ name: 'جائز مثبّت الطرفين · حمل منتظم', q: 'M₃₃ عند الركيزة',
      ref: 'wL²/12', exact: w * L * L / 12, got: Math.abs(s2[0].M33),
      src: 'Hibbeler Table 11-1' });
    out.push({ name: 'جائز مثبّت الطرفين · حمل منتظم', q: 'M₃₃ عند الوسط',
      ref: 'wL²/24', exact: w * L * L / 24, got: Math.abs(s2[10].M33),
      src: 'Hibbeler Table 11-1' });
    out.push({ name: 'جائز مثبّت الطرفين · حمل منتظم', q: 'V₂ عند الركيزة',
      ref: 'wL/2', exact: w * L / 2, got: Math.abs(s2[0].V2), src: 'اتزان' });
    // ٣) كابولي بحمل منتظم
    var f3 = beam([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]);
    var s3 = f3.stations(0, 21);
    out.push({ name: 'كابولي · حمل منتظم', q: 'M₃₃ عند التثبيت',
      ref: 'wL²/2', exact: w * L * L / 2, got: Math.abs(s3[0].M33), src: 'Hibbeler Ex. 4-6' });
    out.push({ name: 'كابولي · حمل منتظم', q: 'هبوط الطرف δ',
      ref: 'wL⁴/8EI', exact: w * Math.pow(L, 4) / (8 * E * I33), got: f3.shape(0, 21)[20].d,
      src: 'AISC Table 3-23' });
    // ٤) عمود كابولي بحمل أفقي عند القمّة
    var f4 = new Frame();
    var n0 = f4.node(0, 0, 0), n1 = f4.node(0, 0, L);
    f4.member(n0, n1, P); f4.support(n0, [1, 1, 1, 1, 1, 1]);
    f4.load(n1, [50, 0, 0, 0, 0, 0]); f4.run();
    out.push({ name: 'عمود كابولي · قوة أفقية 50 kN', q: 'M₃₃ عند القاعدة',
      ref: 'P·h', exact: 50 * L, got: Math.abs(f4.stations(0, 3)[0].M33),
      src: 'Hibbeler Ex. 4-3' });
    out.push({ name: 'عمود كابولي · قوة أفقية 50 kN', q: 'إزاحة القمّة Δ',
      ref: 'Ph³/3EI', exact: 50 * Math.pow(L, 3) / (3 * E * I33), got: Math.abs(f4.nodeDisp(n1)[0]),
      src: 'AISC Table 3-23' });
    // ٥) جائز مستمر بفتحتين
    var f5 = new Frame();
    var a5 = f5.node(0, 0, 0), b5 = f5.node(L, 0, 0), c5 = f5.node(2 * L, 0, 0);
    var p5 = {}; for (var q5 in P) p5[q5] = P[q5]; p5.wgz = -w;
    f5.member(a5, b5, p5); f5.member(b5, c5, p5);
    f5.support(a5, [1, 1, 1, 1, 0, 1]); f5.support(b5, [1, 1, 1, 1, 0, 1]);
    f5.support(c5, [1, 1, 1, 1, 0, 1]); f5.run();
    out.push({ name: 'جائز مستمر بفتحتين · حمل منتظم', q: 'M₃₃ عند الركيزة الوسطى',
      ref: 'wL²/8', exact: w * L * L / 8, got: Math.abs(f5.stations(0, 21)[20].M33),
      src: 'Hibbeler Ex. 12-2' });
    out.push({ name: 'جائز مستمر بفتحتين · حمل منتظم', q: 'M₃₃ الموجب بالفتحة',
      ref: '9wL²/128', exact: 9 * w * L * L / 128,
      got: Math.abs(f5.stations(0, 33)[Math.round(32 * 3 / 8)].M33), src: 'Hibbeler Ex. 12-2' });
    // ٦) التواء عمود كابولي
    var f6 = new Frame();
    var t0 = f6.node(0, 0, 0), t1 = f6.node(L, 0, 0);
    f6.member(t0, t1, P); f6.support(t0, [1, 1, 1, 1, 1, 1]);
    f6.load(t1, [0, 0, 0, 30, 0, 0]); f6.run();
    out.push({ name: 'التواء · عزم لَيّ 30 kN·m', q: 'زاوية اللَّي φ',
      ref: 'TL/GJ', exact: 30 * L / (G * J), got: Math.abs(f6.nodeDisp(t1)[3]),
      src: 'Timoshenko §11' });
    // ٧) إجهاد محوري
    var f7 = new Frame();
    var x0 = f7.node(0, 0, 0), x1 = f7.node(L, 0, 0);
    f7.member(x0, x1, P); f7.support(x0, [1, 1, 1, 1, 1, 1]);
    f7.load(x1, [100, 0, 0, 0, 0, 0]); f7.run();
    out.push({ name: 'شدّ محوري · قوة 100 kN', q: 'استطالة δ',
      ref: 'PL/EA', exact: 100 * L / (E * A), got: Math.abs(f7.nodeDisp(x1)[0]),
      src: 'Hibbeler Ex. 4-1' });

    out.forEach(function (r) {
      r.err = r.exact === 0 ? 0 : Math.abs(r.got - r.exact) / Math.abs(r.exact) * 100;
    });
    return out;
  }

  /* ═════════════════════ ٧) التنسيق (بنطاق #fem وحده) ═════════════════════ */
  var CSS = [
    '#fem{--fp:#121d33;--fl:#22304f;--fm:#93a4c0}',
    '#fem .fem-tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--fl);',
      'margin-bottom:14px;padding-bottom:0}',
    '#fem .fem-tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--fm);',
      'padding:9px 14px;cursor:pointer;font:inherit;font-size:13px;border-radius:8px 8px 0 0;transition:.15s}',
    '#fem .fem-tabs button:hover{background:rgba(56,189,248,.08);color:#e6edf7}',
    '#fem .fem-tabs button.on{color:#fff;border-bottom-color:#38bdf8;background:rgba(56,189,248,.12)}',
    '#fem .fem-p{display:none}#fem .fem-p.on{display:block}',
    '#fem .fem-vp{position:relative;height:clamp(340px,56vh,640px);background:#0a1020;',
      'border:1px solid var(--fl);border-radius:12px;overflow:hidden}',
    '#fem .fem-vp canvas{display:block;width:100%;height:100%}',
    '#fem .fem-hud{position:absolute;top:10px;inset-inline-start:10px;background:rgba(10,16,32,.86);',
      'border:1px solid var(--fl);border-radius:9px;padding:8px 11px;font-size:11.5px;',
      'color:var(--fm);pointer-events:none;max-width:60%;line-height:1.6}',
    '#fem .fem-hud b{color:#e6edf7}',
    '#fem .fem-leg{position:absolute;bottom:10px;inset-inline-end:10px;background:rgba(10,16,32,.86);',
      'border:1px solid var(--fl);border-radius:9px;padding:7px 10px;font-size:11px;color:var(--fm)}',
    '#fem .fem-leg i{display:inline-block;width:11px;height:11px;border-radius:2px;',
      'vertical-align:-1px;margin-inline-end:5px}',
    '#fem .fem-bar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:11px 0}',
    '#fem .fem-bar button{background:var(--fp);border:1px solid var(--fl);color:var(--fm);',
      'padding:6px 12px;border-radius:8px;cursor:pointer;font:inherit;font-size:12px;transition:.15s}',
    '#fem .fem-bar button:hover{border-color:#38bdf8;color:#e6edf7}',
    '#fem .fem-bar button.on{background:rgba(56,189,248,.18);border-color:#38bdf8;color:#fff}',
    '#fem .fem-mat{overflow:auto;max-height:340px;border:1px solid var(--fl);border-radius:9px;background:#0a1020}',
    '#fem .fem-mat table{border-collapse:collapse;font-size:9.5px;font-family:ui-monospace,Menlo,Consolas,monospace}',
    '#fem .fem-mat td,#fem .fem-mat th{padding:2px 5px;text-align:center;white-space:nowrap;',
      'border:1px solid rgba(34,48,79,.6)}',
    '#fem .fem-mat th{background:#16233d;color:#93a4c0;position:sticky;top:0;font-weight:600}',
    '#fem .fem-mat td.z{color:#33415c}#fem .fem-mat td.p{color:#7dd3fc}#fem .fem-mat td.n{color:#fca5a5}',
    '#fem .fem-eq{background:#0a1020;border:1px solid var(--fl);border-radius:9px;padding:11px 13px;',
      'margin:9px 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#7dd3fc;',
      'direction:ltr;text-align:left;overflow-x:auto;line-height:1.9}',
    '#fem .fem-step{border-inline-start:3px solid #38bdf8;padding:3px 13px;margin:13px 0}',
    '#fem .fem-step h4{margin:0 0 6px;font-size:13px;color:#fff}',
    '#fem .fem-step p{margin:4px 0;font-size:12.5px;color:var(--fm);line-height:1.8}',
    '#fem .fem-ok{color:#34d399}#fem .fem-bad{color:#f87171}#fem .fem-warn{color:#fbbf24}',
    '#fem .fem-sel{background:rgba(56,189,248,.10);border:1px solid rgba(56,189,248,.35);',
      'border-radius:9px;padding:9px 12px;font-size:12.5px;margin-bottom:11px}',
    '@media(max-width:760px){#fem .fem-vp{height:clamp(280px,44vh,420px)}',
      '#fem .fem-tabs button{padding:8px 10px;font-size:12px}}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('fem3d-css')) return;
    var s = document.createElement('style');
    s.id = 'fem3d-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ═══════════════════ ٨) العارض ثلاثي الأبعاد ═══════════════════ */
  var DIAG = {
    none: { name: 'بلا مخطط', unit: '' },
    M33:  { name: 'M₃₃ — العزم الرئيسي', axis: 2, unit: 'kN·m', col: 0x38bdf8 },
    M22:  { name: 'M₂₂ — العزم الثانوي', axis: 3, unit: 'kN·m', col: 0xa78bfa },
    V2:   { name: 'V₂ — القصّ الرئيسي',  axis: 2, unit: 'kN',   col: 0x34d399 },
    V3:   { name: 'V₃ — القصّ الثانوي',  axis: 3, unit: 'kN',   col: 0x2dd4bf },
    T:    { name: 'T — الالتواء',        axis: 2, unit: 'kN·m', col: 0xfbbf24 },
    N:    { name: 'N — المحوري',         axis: 3, unit: 'kN',   col: 0xf472b6 },
    def:  { name: 'الشكل المشوَّه',       unit: 'مم' }
  };

  function Viewport(host, onPick) {
    var T = global.THREE;
    if (!T) return null;
    var w = host.clientWidth || 800, h = host.clientHeight || 420;
    var rn = new T.WebGLRenderer({ antialias: true, alpha: true });
    rn.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    rn.setSize(w, h);
    host.appendChild(rn.domElement);
    var sc = new T.Scene();
    sc.fog = new T.Fog(0x0a1020, 40, 190);
    var cam = new T.PerspectiveCamera(45, w / h, .1, 500);
    sc.add(new T.HemisphereLight(0xcfe4ff, 0x1a2338, 1.1));
    var dl = new T.DirectionalLight(0xffffff, .6); dl.position.set(14, -18, 26); sc.add(dl);
    var ctl = null;
    try { ctl = new T.OrbitControls(cam, rn.domElement); ctl.enableDamping = true; } catch (e) {}

    var G = { frame: new T.Group(), diag: new T.Group(), def: new T.Group(),
              slab: new T.Group(), axes: new T.Group(), sup: new T.Group() };
    for (var g in G) sc.add(G[g]);
    var picks = [], raf = 0, F = null, R = 10, rad = 10, selected = -1, touched = false;
    // ما إن يحرّك المستخدم الكاميرا بيده حتى نكفّ عن إعادة تأطيرها تلقائياً
    if (ctl) ctl.addEventListener('start', function () { touched = true; });

    function clear(grp) {
      while (grp.children.length) {
        var c = grp.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
      }
    }
    function V(n) { return new T.Vector3(n.x, n.y, n.z); }

    /* ---- بناء الهيكل: كل عنصر صندوق بمقطعه الحقيقي ---- */
    function build(f, solid) {
      clear(G.frame); clear(G.slab); clear(G.sup); picks = [];
      F = f;
      var box = new T.Box3();
      f.nodes.forEach(function (n) { box.expandByPoint(V(n)); });
      var ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
      R = Math.max(size.x, size.y, size.z) || 10;
      G.frame.position.set(0, 0, 0);
      var matB = new T.MeshLambertMaterial({ color: 0x64748b }),
          matC = new T.MeshLambertMaterial({ color: 0x8fa3bf });
      f.members.forEach(function (m, k) {
        var gm = f.geom(m), L = gm.L, Rm = gm.R;
        var a = V(f.nodes[m.i]), b = V(f.nodes[m.j]);
        var bb = solid ? Math.max(m.b || .2, .05) : .07,
            hh = solid ? Math.max(m.h || .2, .05) : .07;
        // الصندوق بطول L على المحور المحلي 1، عرضه على 3 وارتفاعه على 2
        var geo = new T.BoxGeometry(L, hh, bb);
        var mesh = new T.Mesh(geo, m.kind === 'col' ? matC : matB);
        var M = new T.Matrix4().makeBasis(
          new T.Vector3(Rm[0][0], Rm[0][1], Rm[0][2]),
          new T.Vector3(Rm[1][0], Rm[1][1], Rm[1][2]),
          new T.Vector3(Rm[2][0], Rm[2][1], Rm[2][2]));
        mesh.quaternion.setFromRotationMatrix(M);
        mesh.position.copy(a.clone().add(b).multiplyScalar(.5));
        mesh.userData.k = k;
        G.frame.add(mesh); picks.push(mesh);
      });
      // عقد
      var ng = new T.SphereGeometry(Math.max(.05, R * .006), 10, 8);
      var nm = new T.MeshLambertMaterial({ color: 0x38bdf8 });
      f.nodes.forEach(function (n) {
        var s = new T.Mesh(ng, nm); s.position.copy(V(n)); G.frame.add(s);
      });
      // ركائز
      var sg = new T.ConeGeometry(Math.max(.12, R * .014), Math.max(.22, R * .026), 4);
      var sm = new T.MeshLambertMaterial({ color: 0xfbbf24 });
      for (var sn in f.sup) {
        var c = new T.Mesh(sg, sm); c.position.copy(V(f.nodes[sn]));
        c.position.z -= Math.max(.11, R * .013); c.rotation.x = Math.PI / 2;
        G.sup.add(c);
      }
      // بلاطات الطوابق (شفّافة — تمثّل الديافرام لا عنصراً قشرياً)
      if (f.meta && f.meta.Xs) {
        var Xs = f.meta.Xs, Ys = f.meta.Ys, Zs = f.meta.Zs;
        var lx = Xs[Xs.length - 1], ly = Ys[Ys.length - 1];
        var pg = new T.PlaneGeometry(lx, ly);
        var pm = new T.MeshLambertMaterial({ color: 0x38bdf8, transparent: true,
          opacity: .09, side: T.DoubleSide, depthWrite: false });
        for (var z = 1; z < Zs.length; z++) {
          var p = new T.Mesh(pg, pm);
          p.position.set(lx / 2, ly / 2, Zs[z]); G.slab.add(p);
        }
      }
      // توسيط الكاميرا
      G.frame.position.copy(ctr.clone().negate());
      G.diag.position.copy(G.frame.position); G.def.position.copy(G.frame.position);
      G.slab.position.copy(G.frame.position); G.sup.position.copy(G.frame.position);
      G.axes.position.copy(G.frame.position);
      rad = size.length() / 2 * 1.16;          // كرة محيطة + هامش للمخططات
      frameCam();
    }

    /* التأطير على **البُعدين** معاً: اللوحة عريضة قصيرة، فالتأطير على الارتفاع
       وحده يترك المبنى صغيراً بوسط فراغ عريض. */
    function frameCam() {
      var fv = cam.fov * Math.PI / 180;
      var fh = 2 * Math.atan(Math.tan(fv / 2) * cam.aspect);
      var d = rad / Math.sin(Math.min(fv, fh) / 2);
      var v = new T.Vector3(.86, -1, .62).normalize();
      cam.position.copy(v.multiplyScalar(d));
      cam.up.set(0, 0, 1); cam.lookAt(0, 0, 0);
      if (ctl) { ctl.target.set(0, 0, 0); ctl.update(); }
    }

    /* ---- مخططات القوى الداخلية على العناصر ---- */
    function diagram(kind, scl, onlyKind) {
      clear(G.diag); clear(G.def);
      if (!F || kind === 'none') return { max: 0 };
      if (kind === 'def') return deformed(scl);
      var D = DIAG[kind], mx = 0, all = [];
      F.members.forEach(function (m, k) {
        if (onlyKind && onlyKind !== 'all' && m.kind !== onlyKind) { all.push(null); return; }
        var st = F.stations(k, 17);
        all.push(st);
        st.forEach(function (s) { mx = Math.max(mx, Math.abs(s[kind])); });
      });
      if (mx < 1e-9) return { max: 0 };
      var unit = R * .10 * (scl || 1) / mx;
      var pos = [], neg = [], lp = [];
      F.members.forEach(function (m, k) {
        var st = all[k]; if (!st) return;
        var gm = F.geom(m), Rm = gm.R, a = F.nodes[m.i];
        var ax = Rm[D.axis - 1];
        var base = [], tip = [];
        st.forEach(function (s) {
          var bx = a.x + Rm[0][0] * s.x, by = a.y + Rm[0][1] * s.x, bz = a.z + Rm[0][2] * s.x;
          var v = s[kind] * unit;
          base.push([bx, by, bz]);
          tip.push([bx + ax[0] * v, by + ax[1] * v, bz + ax[2] * v]);
        });
        for (var i = 0; i < st.length - 1; i++) {
          var tgt = (st[i][kind] + st[i + 1][kind]) >= 0 ? pos : neg;
          var p0 = base[i], p1 = base[i + 1], t0 = tip[i], t1 = tip[i + 1];
          tgt.push(p0[0], p0[1], p0[2], t0[0], t0[1], t0[2], t1[0], t1[1], t1[2]);
          tgt.push(p0[0], p0[1], p0[2], t1[0], t1[1], t1[2], p1[0], p1[1], p1[2]);
          lp.push(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2]);
        }
      });
      var mk = function (arr, col) {
        if (!arr.length) return;
        var gg = new T.BufferGeometry();
        gg.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
        gg.computeVertexNormals();
        G.diag.add(new T.Mesh(gg, new T.MeshBasicMaterial({ color: col, transparent: true,
          opacity: .58, side: T.DoubleSide, depthWrite: false })));
      };
      mk(pos, D.col); mk(neg, 0xf87171);
      if (lp.length) {
        var lg = new T.BufferGeometry();
        lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
        G.diag.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: D.col })));
      }
      return { max: mx };
    }

    function deformed(scl) {
      var mx = 0, segs = [];
      F.members.forEach(function (m, k) {
        F.shape(k, 11).forEach(function (p) { mx = Math.max(mx, p.d); });
      });
      if (mx < 1e-12) return { max: 0 };
      var amp = R * .07 * (scl || 1) / mx;
      F.members.forEach(function (m, k) {
        var u = F.mu[k].l, c = F.cache[k], Rm = c.R, a = F.nodes[m.i], L = c.L;
        var EI33 = m.E * m.I33, EI22 = m.E * m.I22, pts = [];
        for (var i = 0; i < 11; i++) {
          var t = i / 10, t2 = t * t, t3 = t2 * t, x = t * L,
              gq = x * x * (L - x) * (L - x) / 24;
          var N1 = 1 - 3 * t2 + 2 * t3, N2 = L * (t - 2 * t2 + t3),
              N3 = 3 * t2 - 2 * t3, N4 = L * (t3 - t2);
          var d1 = u[0] * (1 - t) + u[6] * t;
          var d2 = N1 * u[1] + N2 * u[5] + N3 * u[7] + N4 * u[11] + (EI33 ? c.w2 * gq / EI33 : 0);
          var d3 = N1 * u[2] - N2 * u[4] + N3 * u[8] - N4 * u[10] + (EI22 ? c.w3 * gq / EI22 : 0);
          pts.push([a.x + Rm[0][0] * (x + d1 * amp) + Rm[1][0] * d2 * amp + Rm[2][0] * d3 * amp,
                    a.y + Rm[0][1] * (x + d1 * amp) + Rm[1][1] * d2 * amp + Rm[2][1] * d3 * amp,
                    a.z + Rm[0][2] * (x + d1 * amp) + Rm[1][2] * d2 * amp + Rm[2][2] * d3 * amp]);
        }
        for (var q = 0; q < pts.length - 1; q++)
          segs.push(pts[q][0], pts[q][1], pts[q][2], pts[q + 1][0], pts[q + 1][1], pts[q + 1][2]);
      });
      var gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.Float32BufferAttribute(segs, 3));
      G.def.add(new T.LineSegments(gg, new T.LineBasicMaterial({ color: 0x34d399 })));
      return { max: mx, amp: amp };
    }

    /* ---- ثلاثي المحاور المحلّية 1·2·3 للعنصر المختار (اصطلاح ETABS) ---- */
    function axesOf(k) {
      clear(G.axes);
      if (k < 0 || !F) return;
      var m = F.members[k], gm = F.geom(m), Rm = gm.R, a = F.nodes[m.i], b = F.nodes[m.j];
      var mid = new T.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      var len = Math.min(gm.L * .38, R * .12);
      var cols = [0xf87171, 0x34d399, 0x60a5fa];   // 1 أحمر · 2 أخضر · 3 أزرق
      for (var i = 0; i < 3; i++) {
        var dir = new T.Vector3(Rm[i][0], Rm[i][1], Rm[i][2]);
        G.axes.add(new T.ArrowHelper(dir, mid, len, cols[i], len * .26, len * .15));
        G.axes.add(tag(String(i + 1), cols[i], mid.clone().addScaledVector(dir, len * 1.2), R));
      }
      // إبراز العنصر المختار
      picks.forEach(function (p) {
        p.material = p.userData.k === k
          ? new T.MeshLambertMaterial({ color: 0xfbbf24 })
          : (F.members[p.userData.k].kind === 'col'
             ? new T.MeshLambertMaterial({ color: 0x8fa3bf })
             : new T.MeshLambertMaterial({ color: 0x64748b }));
      });
      selected = k;
    }

    function tag(txt, col, pos, scale) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var x = cv.getContext('2d');
      x.fillStyle = '#' + col.toString(16).padStart(6, '0');
      x.font = 'bold 44px system-ui,sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt, 32, 34);
      var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false }));
      sp.position.copy(pos); sp.scale.setScalar(scale * .035);
      return sp;
    }

    /* ---- الالتقاط بالضغط ---- */
    var rc = new T.Raycaster(), m2 = new T.Vector2(), moved = false;
    rn.domElement.addEventListener('pointerdown', function () { moved = false; });
    rn.domElement.addEventListener('pointermove', function () { moved = true; });
    rn.domElement.addEventListener('pointerup', function (e) {
      if (moved || !picks.length) return;
      var r = rn.domElement.getBoundingClientRect();
      m2.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      m2.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      rc.setFromCamera(m2, cam);
      var hit = rc.intersectObjects(picks, false);
      if (hit.length) { axesOf(hit[0].object.userData.k); if (onPick) onPick(hit[0].object.userData.k); }
    });

    /* تُقاس اللوحة **عند العرض** لا عند الإنشاء: تُبنى والتبويب مخفيّ فمقاسها
       صفر، ولو بقيت النسبة كما قُدّرت خرج المبنى صغيراً بوسط اللوحة. */
    function fit() {
      var w2 = host.clientWidth, h2 = host.clientHeight;
      if (!w2 || !h2) return;
      cam.aspect = w2 / h2; cam.updateProjectionMatrix(); rn.setSize(w2, h2, false);
      if (!touched && F) frameCam();
    }
    var onRz = fit; global.addEventListener('resize', onRz);
    var dead = false;
    function loop() {
      if (dead) return;
      // الصفحة تُبدَّل باستبدال innerHTML، فتُنتزع اللوحة دون إشعار — نكتشف
      // ذلك هنا ونحرّر الموارد بدل أن يظلّ عارض يتيم يدور بالخلفية.
      if (!host.isConnected) { api.dispose(); return; }
      raf = requestAnimationFrame(loop);
      if (ctl) ctl.update();
      rn.render(sc, cam);
    }

    var api = {
      build: build, diagram: diagram, axes: axesOf, fit: fit,
      show: function (g, v) { if (G[g]) G[g].visible = v; },
      sel: function () { return selected; },
      dispose: function () {
        if (dead) return;
        dead = true;
        cancelAnimationFrame(raf);
        global.removeEventListener('resize', onRz);
        for (var g2 in G) clear(G[g2]);
        rn.dispose();
        if (rn.domElement.parentNode) rn.domElement.parentNode.removeChild(rn.domElement);
      }
    };
    loop();
    return api;
  }

  /* ═══════════ ٩) دليل الحسابات: مصفوفات بأرقامها واشتقاق خطوة بخطوة ═══════════ */
  function matTable(k, n, labels, dec) {
    var h = '<div class="fem-mat"><table><thead><tr><th></th>';
    for (var c = 0; c < n; c++) h += '<th>' + labels[c] + '</th>';
    h += '</tr></thead><tbody>';
    for (var r = 0; r < n; r++) {
      h += '<tr><th>' + labels[r] + '</th>';
      for (var c2 = 0; c2 < n; c2++) {
        var v = k[r * n + c2];
        var cls = Math.abs(v) < 1e-9 ? 'z' : (v > 0 ? 'p' : 'n');
        h += '<td class="' + cls + '">' + (Math.abs(v) < 1e-9 ? '0' : v.toExponential(dec || 2)) + '</td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  }

  var DOFL = ['u₁', 'v₂', 'w₃', 'θ₁', 'θ₂', 'θ₃'];
  function dofLabels() {
    return DOFL.map(function (s) { return s + 'ᵢ'; }).concat(DOFL.map(function (s) { return s + 'ⱼ'; }));
  }

  function proofHTML(f, k) {
    if (!f || k < 0 || k >= f.members.length) return '<div class="card">اختر عنصراً من المجسّم أولاً.</div>';
    var m = f.members[k], c = f.cache[k], q = f.mf[k], u = f.mu[k].l, L = c.L, R = c.R;
    var st = f.stations(k, 21), x = L / 2, sMid = st[10];
    var mx = 0, mxs = null;
    st.forEach(function (s) { if (Math.abs(s.M33) > mx) { mx = Math.abs(s.M33); mxs = s; } });
    var E = m.E, G = m.G;
    var H = [];

    H.push('<div class="fem-sel">📐 العنصر المختار: <b>' + esc(m.tag || ('#' + k)) + '</b> — '
      + (m.kind === 'col' ? 'عمود' : 'جسر') + ' · مقطع ' + Math.round(m.b * 1000) + '×'
      + Math.round(m.h * 1000) + ' مم · الطول L = ' + nf(L, 3) + ' م · بين العقدتين '
      + m.i + ' و ' + m.j + '</div>');

    /* خطوة ١ — خواصّ المقطع */
    H.push('<div class="fem-step"><h4>الخطوة ١ — خواصّ المقطع والمادة</h4>'
      + '<p>معامل المرونة من <b>ACI 318M §19.2.2.1</b>: Ec = 4700·√f′c. '
      + 'ثابت الالتواء J للمقطع المستطيل من جدول Timoshenko: J = β·b³·h.</p>'
      + '<div class="fem-eq">'
      + 'E&nbsp; = ' + nf(E / 1000, 0) + ' MPa = ' + nf(E, 0) + ' kN/m²<br>'
      + 'G&nbsp; = E / [2(1+ν)] = ' + nf(G, 0) + ' kN/m²&nbsp;&nbsp;(ν = 0.20)<br>'
      + 'A&nbsp; = b·h = ' + nf(m.b, 3) + ' × ' + nf(m.h, 3) + ' = ' + nf(m.A, 5) + ' m²<br>'
      + 'I₃₃ = b·h³/12 × ' + nf(m.mod, 2) + ' = ' + m.I33.toExponential(5) + ' m⁴&nbsp;&nbsp;(المحور القوي)<br>'
      + 'I₂₂ = h·b³/12 × ' + nf(m.mod, 2) + ' = ' + m.I22.toExponential(5) + ' m⁴&nbsp;&nbsp;(المحور الضعيف)<br>'
      + 'J&nbsp; = β·b³·h × ' + nf(m.mod, 2) + ' = ' + m.J.toExponential(5) + ' m⁴'
      + '</div>'
      + (m.mod !== 1 ? '<p class="fem-warn">⚠️ طُبّق معامل التشقّق <b>' + nf(m.mod, 2)
        + '</b> وفق <b>ACI 318M-19 جدول 6.6.3.1.1(a)</b> — '
        + (m.kind === 'col' ? '0.70·Ig للأعمدة' : '0.35·Ig للجسور') + '. '
        + 'هذا بالضبط ما يفعله ETABS بخيار Property Modifiers.</p>' : '')
      + '</div>');

    /* خطوة ٢ — المحاور المحلّية */
    H.push('<div class="fem-step"><h4>الخطوة ٢ — المحاور المحلّية ومصفوفة جيوب التمام [R]</h4>'
      + '<p>المحور 1 على طول العنصر · المحور 2 «إلى فوق» للجسر (أو نحو +X للعمود) · '
      + 'والمحور 3 عمودي عليهما. وهو اصطلاح ETABS نفسه، ولذلك يكون '
      + '<b>M₃₃</b> هو العزم الرئيسي للجسر.</p>'
      + '<div class="fem-eq">'
      + '<span dir="ltr">'
      + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;⎡ ' + nf(R[0][0], 4) + '&nbsp; ' + nf(R[0][1], 4)
        + '&nbsp; ' + nf(R[0][2], 4) + ' ⎤&nbsp; ← axis 1<br>'
      + '[R] = ⎢ ' + nf(R[1][0], 4) + '&nbsp; ' + nf(R[1][1], 4) + '&nbsp; ' + nf(R[1][2], 4)
        + ' ⎥&nbsp; ← axis 2<br>'
      + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;⎣ ' + nf(R[2][0], 4) + '&nbsp; ' + nf(R[2][1], 4)
        + '&nbsp; ' + nf(R[2][2], 4) + ' ⎦&nbsp; ← axis 3<br><br>'
      + '[T]12x12 = diag( [R], [R], [R], [R] )</span>'
      + '</div></div>');

    /* خطوة ٣ — مصفوفة الصلابة */
    H.push('<div class="fem-step"><h4>الخطوة ٣ — مصفوفة صلابة العنصر [k]₁₂ₓ₁₂ بالنظام المحلّي</h4>'
      + '<p>الحدود الأربعة: محوري EA/L · التواء GJ/L · انحناء بالمستوى 1-2 (‏12EI₃₃/L³ · 6EI₃₃/L² · '
      + '4EI₃₃/L · 2EI₃₃/L) · وانحناء بالمستوى 1-3 بنفس الشكل مع I₂₂. '
      + 'المرجع: <b>Hibbeler, Structural Analysis §16.2</b>.</p>'
      + '<div class="fem-eq">'
      + 'EA/L&nbsp;&nbsp;&nbsp; = ' + (E * m.A / L).toExponential(4) + ' kN/m<br>'
      + 'GJ/L&nbsp;&nbsp;&nbsp; = ' + (G * m.J / L).toExponential(4) + ' kN·m/rad<br>'
      + '12EI₃₃/L³ = ' + (12 * E * m.I33 / (L * L * L)).toExponential(4) + ' kN/m<br>'
      + '4EI₃₃/L&nbsp;&nbsp; = ' + (4 * E * m.I33 / L).toExponential(4) + ' kN·m/rad<br>'
      + '12EI₂₂/L³ = ' + (12 * E * m.I22 / (L * L * L)).toExponential(4) + ' kN/m<br>'
      + '4EI₂₂/L&nbsp;&nbsp; = ' + (4 * E * m.I22 / L).toExponential(4) + ' kN·m/rad'
      + '</div>'
      + matTable(c.kl, 12, dofLabels(), 2)
      + '<p style="margin-top:7px">ثم التحويل للنظام العام: <b>[k]<sub>عام</sub> = [T]ᵀ·[k]<sub>محلي</sub>·[T]</b> '
      + '— وهذه المصفوفة تُجمَّع في [K] العامة بمواضع درجات حرية العقدتين.</p></div>');

    /* خطوة ٤ — النظام العام */
    H.push('<div class="fem-step"><h4>الخطوة ٤ — تجميع النظام العام وحلّه</h4>'
      + '<p>تُجمَّع مصفوفات كل العناصر في مصفوفة صلابة عامة واحدة، ثم يُحلّ النظام:</p>'
      + '<div class="fem-eq">{F} = [K]·{u}&nbsp;&nbsp;⟹&nbsp;&nbsp;{u} = [K]⁻¹·{F}<br><br>'
      + 'عدد درجات الحرية n&nbsp;= ' + f.neq + '<br>'
      + 'عرض النطاق bw&nbsp;&nbsp;&nbsp;&nbsp;= ' + f.bw + '<br>'
      + 'عدد العناصر&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= ' + f.members.length + '<br>'
      + 'عدد العقد&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= ' + f.nodes.length + '<br>'
      + 'زمن الحلّ&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= ' + nf(f.ms, 1) + ' ms</div>'
      + '<p>الحلّ بتحليل <b>LDLᵀ</b> لمصفوفة متماثلة شريطية — تكلفة O(n·bw²) بدل O(n³). '
      + 'المرجع: <b>Bathe, Finite Element Procedures §8.2.2</b>.</p></div>');

    /* خطوة ٥ — إزاحات العنصر */
    var uh = '<div class="fem-eq">{u}<sub>محلي</sub>ᵀ = [ ';
    for (var i = 0; i < 12; i++) uh += (i === 6 ? '<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' : '')
      + u[i].toExponential(3) + (i < 11 ? ', ' : '');
    uh += ' ]</div>';
    H.push('<div class="fem-step"><h4>الخطوة ٥ — إزاحات طرفَي العنصر</h4>'
      + '<p>تُستخرج إزاحات العقدتين من {u} العام ثم تُحوَّل محلّياً: '
      + '<b>{u}<sub>محلي</sub> = [T]·{u}<sub>عام</sub></b> (الوحدات m و rad).</p>' + uh + '</div>');

    /* خطوة ٦ — أحمال التثبيت وقوى الأطراف */
    H.push('<div class="fem-step"><h4>الخطوة ٦ — أحمال التثبيت {q₀} وقوى أطراف العنصر {q}</h4>'
      + '<p>للحمل الموزّع المنتظم w على عنصر مثبّت الطرفين (Hibbeler جدول 16-1):</p>'
      + '<div class="fem-eq">'
      + 'w₂ = ' + nf(c.w2, 4) + ' kN/m&nbsp;&nbsp;(بالمحور المحلي 2)<br>'
      + 'w₃ = ' + nf(c.w3, 4) + ' kN/m&nbsp;&nbsp;(بالمحور المحلي 3)<br><br>'
      + 'q₀[V₂] = −w₂·L/2 = ' + nf(c.q0[1], 3) + ' kN<br>'
      + 'q₀[M₃₃] = −w₂·L²/12 = ' + nf(c.q0[5], 3) + ' kN·m<br><br>'
      + '<b>{q} = [k]<sub>محلي</sub>·{u}<sub>محلي</sub> + {q₀}</b></div>'
      + '<div class="fem-eq">'
      + 'عند الطرف i:&nbsp; N = ' + nf(q[0], 2) + '&nbsp; V₂ = ' + nf(q[1], 2)
      + '&nbsp; V₃ = ' + nf(q[2], 2) + '&nbsp; T = ' + nf(q[3], 2)
      + '&nbsp; M₂₂ = ' + nf(q[4], 2) + '&nbsp; M₃₃ = ' + nf(q[5], 2) + '<br>'
      + 'عند الطرف j:&nbsp; N = ' + nf(q[6], 2) + '&nbsp; V₂ = ' + nf(q[7], 2)
      + '&nbsp; V₃ = ' + nf(q[8], 2) + '&nbsp; T = ' + nf(q[9], 2)
      + '&nbsp; M₂₂ = ' + nf(q[10], 2) + '&nbsp; M₃₃ = ' + nf(q[11], 2)
      + '</div></div>');

    /* خطوة ٧ — الاشتقاق الداخلي */
    H.push('<div class="fem-step"><h4>الخطوة ٧ — اشتقاق العزم الداخلي M(x) باتزان الجزء المقطوع</h4>'
      + '<p>يُقطع العنصر عند المسافة x ويُؤخذ اتزان الجزء الأيسر — قوى الطرف i '
      + 'مع محصّلة الحمل الموزّع على الطول x:</p>'
      + '<div class="fem-eq">'
      + 'ΣF₂ = 0&nbsp; ⟹&nbsp; <b>V₂(x) = −q₁ − w₂·x</b><br>'
      + 'ΣM₃ = 0&nbsp; ⟹&nbsp; <b>M₃₃(x) = q₅ − q₁·x − w₂·x²/2</b><br><br>'
      + 'وبالتحقّق: dM₃₃/dx = −q₁ − w₂·x = V₂(x) ✓&nbsp; (علاقة القصّ بالعزم)</div>'
      + '<p>بالتعويض عند منتصف العنصر x = L/2 = ' + nf(x, 3) + ' م:</p>'
      + '<div class="fem-eq">'
      + 'V₂ = −(' + nf(q[1], 3) + ') − (' + nf(c.w2, 3) + ')(' + nf(x, 3) + ') = <b>'
      + nf(sMid.V2, 3) + ' kN</b><br>'
      + 'M₃₃ = (' + nf(q[5], 3) + ') − (' + nf(q[1], 3) + ')(' + nf(x, 3) + ') − ('
      + nf(c.w2, 3) + ')(' + nf(x, 3) + ')²/2 = <b>' + nf(sMid.M33, 3) + ' kN·m</b>'
      + '</div>'
      + '<p>أقصى عزم على طول العنصر: <b class="fem-ok">M₃₃ = ' + nf(mxs ? mxs.M33 : 0, 2)
      + ' kN·m</b> عند x = ' + nf(mxs ? mxs.x : 0, 3) + ' م.</p></div>');

    /* خطوة ٨ — المراجع */
    H.push('<div class="fem-step"><h4>الخطوة ٨ — المراجع المعتمدة</h4><ul style="color:var(--mut);'
      + 'font-size:12.5px;line-height:1.9;margin:4px 0;padding-inline-start:18px">'
      + '<li><b>ACI 318M-19</b> §19.2.2.1 — معامل مرونة الخرسانة Ec = 4700√f′c</li>'
      + '<li><b>ACI 318M-19</b> جدول 6.6.3.1.1(a) — معاملات التشقّق (0.35Ig جسور · 0.70Ig أعمدة)</li>'
      + '<li><b>R.C. Hibbeler</b>, Structural Analysis — الفصل 16 «Matrix Stiffness Method»، '
      + 'وجدول 16-1 لأحمال التثبيت التامّة</li>'
      + '<li><b>K.J. Bathe</b>, Finite Element Procedures §8.2.2 — حلّ LDLᵀ الشريطي</li>'
      + '<li><b>Timoshenko & Goodier</b>, Theory of Elasticity §11 — ثابت الالتواء للمقطع المستطيل</li>'
      + '<li><b>Cook, Malkus & Plesha</b> — تحويل المحاور وتجميع المصفوفة العامة</li>'
      + '</ul></div>');
    return H.join('');
  }

  /* ═════════════════════ ١٠) الصفحة: تبويبات وواجهة ═════════════════════ */
  var VP = null, FR = null, SEL = -1, DK = 'M33', SCL = 1, SOLID = true;

  function $1(s) { return document.querySelector(s); }
  function $n(id) { var e = document.getElementById(id); return e ? parseFloat(e.value) : 0; }
  function $c(id) { var e = document.getElementById(id); return !!(e && e.checked); }
  function fld(lbl, id, v, step, unit, min) {
    return '<div><label>' + lbl + (unit ? ' <span style="opacity:.65">(' + unit + ')</span>' : '')
      + '</label><input type="number" id="' + id + '" value="' + v + '" step="' + (step || 1)
      + '"' + (min !== undefined ? ' min="' + min + '"' : '') + '></div>';
  }
  function chk(lbl, id, on) {
    return '<label style="display:flex;gap:7px;align-items:center;cursor:pointer;margin:0">'
      + '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '')
      + ' style="width:auto;margin:0"><span>' + lbl + '</span></label>';
  }
  function kpiF(t, v, tone) {
    return '<div class="card" style="padding:11px 13px"><div style="font-size:11px;color:var(--mut)">'
      + t + '</div><div style="font-size:17px;font-weight:700;margin-top:3px;color:'
      + (tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)'
        : tone === 'warn' ? 'var(--warn)' : '#fff') + '">' + v + '</div></div>';
  }
  function tbl(head, rows) {
    return '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr>' + head.map(function (h) {
        return '<th style="text-align:start;padding:7px 9px;border-bottom:1px solid var(--line);'
          + 'color:var(--mut);font-weight:600;white-space:nowrap">' + h + '</th>'; }).join('')
      + '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) {
          return '<td style="padding:6px 9px;border-bottom:1px solid rgba(34,48,79,.45);'
            + 'white-space:nowrap">' + c + '</td>'; }).join('') + '</tr>'; }).join('')
      + '</tbody></table></div>';
  }

  function cfgFromForm() {
    var fc = $n('fm_fc') || 28;
    return {
      nx: Math.max(1, Math.min(8, Math.round($n('fm_nx')))),
      ny: Math.max(1, Math.min(8, Math.round($n('fm_ny')))),
      ns: Math.max(1, Math.min(12, Math.round($n('fm_ns')))),
      sx: $n('fm_sx'), sy: $n('fm_sy'), hs: $n('fm_hs'),
      fc: fc, E: 4700 * Math.sqrt(fc) * 1000,       // kN/m²
      bb: $n('fm_bb') / 1000, bh: $n('fm_bh') / 1000,
      cb: $n('fm_cb') / 1000, ch: $n('fm_ch') / 1000,
      wUDL: $n('fm_w'), wLat: $n('fm_lat'),
      latDir: (document.getElementById('fm_dir') || {}).value || 'x',
      cracked: $c('fm_cr'), diaph: $c('fm_dia'),
      base: $c('fm_pin') ? 'pin' : 'fix'
    };
  }

  function pageHTML() {
    return '<div id="fem">'
      + '<div class="fem-tabs">'
      + '<button data-t="model" class="on">① النموذج والأحمال</button>'
      + '<button data-t="view">② المجسّم والمخططات</button>'
      + '<button data-t="res">③ النتائج</button>'
      + '<button data-t="proof">④ دليل الحسابات والمنهجية العلمية</button>'
      + '<button data-t="ver">⑤ التحقّق العلمي</button>'
      + '</div>'

      /* ---------- ① النموذج ---------- */
      + '<div class="fem-p on" data-p="model"><div class="grid g2">'
      + '<div class="card"><h3>الشبكة والطوابق</h3><div class="f">'
      + fld('عدد البحور — X', 'fm_nx', 3, 1, '', 1) + fld('المسافة بين المحاور X', 'fm_sx', 6.0, .5, 'م')
      + fld('عدد البحور — Y', 'fm_ny', 2, 1, '', 1) + fld('المسافة بين المحاور Y', 'fm_sy', 5.0, .5, 'م')
      + fld('عدد الطوابق', 'fm_ns', 3, 1, '', 1) + fld('ارتفاع الطابق', 'fm_hs', 3.2, .1, 'م')
      + '</div><div class="fem-bar" style="margin-top:11px">'
      + chk('قاعدة مفصلية (بدل التثبيت)', 'fm_pin', false)
      + chk('ديافرام صلب لكل طابق', 'fm_dia', true) + '</div></div>'

      + '<div class="card"><h3>المادة والمقاطع</h3><div class="f">'
      + fld('مقاومة الخرسانة f′c', 'fm_fc', 28, 1, 'MPa', 15)
      + '<div><label>معامل المرونة Ec</label><input id="fm_E" value="—" disabled></div>'
      + fld('عرض الجسر b', 'fm_bb', 300, 25, 'مم') + fld('عمق الجسر h', 'fm_bh', 600, 25, 'مم')
      + fld('عرض العمود b', 'fm_cb', 400, 25, 'مم') + fld('عمق العمود h', 'fm_ch', 400, 25, 'مم')
      + '</div><div class="fem-bar" style="margin-top:11px">'
      + chk('معاملات التشقّق ACI 318M §6.6.3.1.1 (0.35 جسور · 0.70 أعمدة)', 'fm_cr', true)
      + '</div></div>'

      + '<div class="card"><h3>الأحمال</h3><div class="f">'
      + fld('حمل موزّع على الجسور w', 'fm_w', 25, 1, 'kN/m')
      + fld('قوة جانبية لكل طابق', 'fm_lat', 50, 5, 'kN')
      + '<div><label>اتجاه القوة الجانبية</label><select id="fm_dir">'
      + '<option value="x">على محور X</option><option value="y">على محور Y</option></select></div>'
      + '</div><div class="fem-bar" style="margin-top:12px">'
      + '<button class="btn" onclick="FEM3D.page.run()" style="background:var(--acc);color:#04121f;'
      + 'font-weight:700;border:0;padding:9px 20px;border-radius:9px;cursor:pointer">▶ حلّل النموذج</button>'
      + '<span id="fm_stat" style="font-size:12px;color:var(--mut)"></span></div></div>'

      + '<div class="card"><h3>ما الذي يُحسب هنا بالضبط؟</h3>'
      + '<p style="font-size:12.5px;color:var(--mut);line-height:1.9;margin:0 0 9px">'
      + 'إطار فراغي (3D Space Frame) بـ <b>٦ درجات حرية لكل عقدة</b>، يُحلّ بـ'
      + '<b> طريقة الصلابة المباشرة</b> — وهي نفسها طريقة ETABS للعناصر الخطّية. '
      + 'لكل عنصر مصفوفة صلابة <b>12×12</b> تشمل الجهد المحوري والالتواء والانحناء حول محورين، '
      + 'تُحوَّل للنظام العام بمصفوفة [T] ثم تُجمَّع في [K] العامة ويُحلّ {F} = [K]{u}.</p>'
      + '<p style="font-size:12.5px;color:var(--mut);line-height:1.9;margin:0">'
      + '<b class="fem-warn">حدود صريحة:</b> البلاطات تُمثَّل ديافرامات صلبة تنقل الحمل، '
      + 'لا عناصر قشرية (Shell) — كما هو حال ETABS بخيار Rigid Diaphragm. '
      + 'والتحليل <b>خطّي ساكن</b>: بلا P-Δ ولا تحليل نمطي ولا لاخطّية.</p></div>'
      + '</div></div>'

      /* ---------- ② المجسّم ---------- */
      + '<div class="fem-p" data-p="view">'
      + '<div class="fem-bar" id="fm_dbar"></div>'
      + '<div class="fem-vp" id="fm_vp">'
      + '<div class="fem-hud" id="fm_hud">جارٍ البناء…</div>'
      + '<div class="fem-leg"><i style="background:#38bdf8"></i>موجب &nbsp;'
      + '<i style="background:#f87171"></i>سالب<br>'
      + '<span style="color:#f87171">1</span> · <span style="color:#34d399">2</span> · '
      + '<span style="color:#60a5fa">3</span> = المحاور المحلّية</div></div>'
      + '<div class="fem-bar">'
      + '<span style="font-size:12px;color:var(--mut)">مقياس المخطط</span>'
      + '<input type="range" id="fm_scl" min="0.2" max="4" step="0.1" value="1" style="width:150px">'
      + '<button id="fm_solid" class="on" onclick="FEM3D.page.solid()">مقاطع مصمتة</button>'
      + '<button id="fm_slab" class="on" onclick="FEM3D.page.tg(\'slab\',this)">بلاطات</button>'
      + '<button id="fm_frame" class="on" onclick="FEM3D.page.tg(\'frame\',this)">الهيكل</button>'
      + '</div>'
      + '<div id="fm_pick" class="card" style="margin-top:12px">'
      + '<h3>تفاصيل العنصر</h3><div style="color:var(--mut);font-size:12.5px">'
      + 'اضغط على أي جسر أو عمود بالمجسّم لعرض محاوره المحلّية وقواه الداخلية.</div></div></div>'

      /* ---------- ③ النتائج ---------- */
      + '<div class="fem-p" data-p="res"><div id="fm_res"></div></div>'

      /* ---------- ④ المنهجية ---------- */
      + '<div class="fem-p" data-p="proof"><div id="fm_proof"></div></div>'

      /* ---------- ⑤ التحقّق ---------- */
      + '<div class="fem-p" data-p="ver"><div id="fm_ver"></div></div>'
      + '</div>';
  }

  function tabTo(t) {
    var ts = document.querySelectorAll('#fem .fem-tabs button');
    for (var i = 0; i < ts.length; i++) ts[i].classList.toggle('on', ts[i].dataset.t === t);
    var ps = document.querySelectorAll('#fem .fem-p');
    for (var j = 0; j < ps.length; j++) ps[j].classList.toggle('on', ps[j].dataset.p === t);
    if (t === 'view' && VP) setTimeout(function () { VP.fit(); }, 30);
  }

  function dbar() {
    var h = '';
    for (var k in DIAG)
      h += '<button data-d="' + k + '" class="' + (k === DK ? 'on' : '') + '" '
        + 'onclick="FEM3D.page.diag(\'' + k + '\')">' + DIAG[k].name + '</button>';
    var e = document.getElementById('fm_dbar'); if (e) e.innerHTML = h;
  }

  function hud(extra) {
    var e = document.getElementById('fm_hud');
    if (!e || !FR) return;
    var c = FR.meta.cfg;
    e.innerHTML = '<b>' + c.nx + '×' + c.ny + ' بحر · ' + c.ns + ' طابق</b><br>'
      + FR.nodes.length + ' عقدة · ' + FR.members.length + ' عنصر · '
      + FR.neq + ' درجة حرية<br>' + (extra || '');
  }

  function drawDiag() {
    if (!VP || !FR) return;
    var r = VP.diagram(DK, SCL);
    var D = DIAG[DK], txt = '';
    if (DK === 'def') txt = '<b>أقصى إزاحة = ' + nf((r.max || 0) * 1000, 2) + ' مم</b>';
    else if (DK !== 'none') txt = '<b>' + D.name + ' — الأقصى = ' + nf(r.max || 0, 2)
      + ' ' + D.unit + '</b>';
    hud(txt);
  }

  function pickHTML(k) {
    if (!FR || k < 0) return '';
    var m = FR.members[k], c = FR.cache[k], q = FR.mf[k], st = FR.stations(k, 21);
    var mx33 = 0, mx22 = 0, mv2 = 0, mt = 0, xm = 0;
    st.forEach(function (s) {
      if (Math.abs(s.M33) > Math.abs(mx33)) { mx33 = s.M33; xm = s.x; }
      if (Math.abs(s.M22) > Math.abs(mx22)) mx22 = s.M22;
      if (Math.abs(s.V2) > Math.abs(mv2)) mv2 = s.V2;
      if (Math.abs(s.T) > Math.abs(mt)) mt = s.T;
    });
    var dmax = 0; FR.shape(k, 15).forEach(function (p) { dmax = Math.max(dmax, p.d); });
    return '<h3>العنصر: ' + esc(m.tag || ('#' + k)) + '</h3>'
      + '<div class="grid g4" style="margin-bottom:11px">'
      + kpiF('أقصى M₃₃', nf(mx33, 2) + ' kN·m', 'ok')
      + kpiF('أقصى M₂₂', nf(mx22, 2) + ' kN·m')
      + kpiF('أقصى V₂', nf(mv2, 2) + ' kN')
      + kpiF('الالتواء T', nf(mt, 2) + ' kN·m')
      + kpiF('القوة المحورية N', nf(st[0].N, 2) + ' kN', st[0].N < 0 ? 'warn' : '')
      + kpiF('أقصى ترخيم', nf(dmax * 1000, 2) + ' مم')
      + kpiF('الطول L', nf(c.L, 3) + ' م')
      + kpiF('موضع أقصى عزم', 'x = ' + nf(xm, 2) + ' م')
      + '</div>'
      + tbl(['الطرف', 'N (kN)', 'V₂ (kN)', 'V₃ (kN)', 'T (kN·m)', 'M₂₂ (kN·m)', 'M₃₃ (kN·m)'],
        [['i — العقدة ' + m.i, nf(q[0], 2), nf(q[1], 2), nf(q[2], 2), nf(q[3], 2), nf(q[4], 2), nf(q[5], 2)],
         ['j — العقدة ' + m.j, nf(q[6], 2), nf(q[7], 2), nf(q[8], 2), nf(q[9], 2), nf(q[10], 2), nf(q[11], 2)]])
      + '<div style="margin-top:11px"><button class="btn" onclick="FEM3D.page.goProof()" '
      + 'style="background:var(--panel2);border:1px solid var(--line);color:var(--tx);padding:7px 14px;'
      + 'border-radius:8px;cursor:pointer">📖 اعرض إثبات حساب هذا العنصر خطوة بخطوة</button></div>';
  }

  function resHTML() {
    if (!FR) return '';
    var beams = [], cols = [], i;
    FR.members.forEach(function (m, k) {
      var st = FR.stations(k, 17), mm = 0, vv = 0, nn = 0, tt = 0, dd = 0;
      st.forEach(function (s) {
        if (Math.abs(s.M33) > Math.abs(mm)) mm = s.M33;
        if (Math.abs(s.V2) > Math.abs(vv)) vv = s.V2;
        if (Math.abs(s.T) > Math.abs(tt)) tt = s.T;
        nn = s.N;
      });
      FR.shape(k, 11).forEach(function (p) { dd = Math.max(dd, p.d); });
      (m.kind === 'col' ? cols : beams).push({ k: k, m: m, M: mm, V: vv, N: nn, T: tt, d: dd });
    });
    beams.sort(function (a, b) { return Math.abs(b.M) - Math.abs(a.M); });
    cols.sort(function (a, b) { return Math.abs(b.N) - Math.abs(a.N); });
    // ردود الأفعال والاتزان
    var Rz = 0, Rx = 0, Ry = 0;
    for (var sn in FR.reactions) {
      Rz += FR.reactions[sn][2]; Rx += FR.reactions[sn][0]; Ry += FR.reactions[sn][1];
    }
    var Wv = 0; FR.members.forEach(function (m) {
      if (m.wgz) Wv += Math.abs(m.wgz) * FR.geom(m).L; });
    var Wl = FR.meta.cfg.wLat * FR.meta.cfg.ns;
    var errV = Wv ? Math.abs(Rz - Wv) / Wv * 100 : 0;
    var errL = Wl ? Math.abs((FR.meta.cfg.latDir === 'y' ? Ry : Rx) + Wl) / Wl * 100 : 0;
    // انحراف الطوابق
    var dr = [], prev = 0, H = FR.meta.cfg.hs;
    FR.meta.story.forEach(function (s, ix) {
      var d = FR.nodeDisp(s[0])[FR.meta.cfg.latDir === 'y' ? 1 : 0];
      dr.push(['طابق ' + (ix + 1), nf(d * 1000, 2), nf((d - prev) * 1000, 2),
        nf(Math.abs(d - prev) / H * 100, 4) + '%',
        Math.abs(d - prev) / H <= 0.02 ? '<span class="fem-ok">✓ ضمن 2%</span>'
          : '<span class="fem-bad">✗ يتجاوز 2%</span>']);
      prev = d;
    });
    var bMax = beams[0] || { M: 0 }, cMax = cols[0] || { N: 0 };
    return '<div class="grid g4" style="margin-bottom:14px">'
      + kpiF('أقصى عزم بالجسور', nf(Math.abs(bMax.M), 1) + ' kN·m', 'ok')
      + kpiF('أقصى قوة محورية بعمود', nf(Math.abs(cMax.N), 1) + ' kN')
      + kpiF('درجات الحرية', FR.neq)
      + kpiF('زمن الحلّ', nf(FR.ms, 1) + ' ms', 'ok')
      + '</div>'
      + '<div class="card" style="margin-bottom:14px"><h3>فحص الاتزان العام — الدليل الحاسم على صحّة الحلّ</h3>'
      + '<p style="font-size:12.5px;color:var(--mut);margin:0 0 10px">مجموع ردود الأفعال يجب أن '
      + 'يساوي مجموع الأحمال المسلَّطة بالضبط. أيّ فرق يتجاوز خطأ التقريب العشري يعني خللاً بالحلّ.</p>'
      + tbl(['المحور', 'الحمل المسلَّط', 'مجموع رد الفعل', 'الفرق النسبي', 'الحكم'],
        [['شاقولي Z', nf(Wv, 3) + ' kN', nf(Rz, 3) + ' kN', errV.toExponential(2) + '%',
          errV < 1e-6 ? '<span class="fem-ok">✓ متّزن</span>' : '<span class="fem-bad">✗</span>'],
         ['أفقي ' + (FR.meta.cfg.latDir === 'y' ? 'Y' : 'X'), nf(Wl, 3) + ' kN',
          nf(FR.meta.cfg.latDir === 'y' ? Ry : Rx, 3) + ' kN', errL.toExponential(2) + '%',
          errL < 1e-6 ? '<span class="fem-ok">✓ متّزن</span>' : '<span class="fem-bad">✗</span>']])
      + '</div>'
      + '<div class="grid g2">'
      + '<div class="card"><h3>أقصى ١٠ جسور بالعزم M₃₃</h3>'
      + tbl(['العنصر', 'M₃₃ (kN·m)', 'V₂ (kN)', 'T (kN·m)', 'ترخيم (مم)'],
        beams.slice(0, 10).map(function (b) {
          return ['<a href="#" onclick="FEM3D.page.pick(' + b.k + ');return false" '
            + 'style="color:var(--acc)">' + esc(b.m.tag) + '</a>',
            nf(b.M, 2), nf(b.V, 2), nf(b.T, 2), nf(b.d * 1000, 2)]; })) + '</div>'
      + '<div class="card"><h3>أقصى ١٠ أعمدة بالقوة المحورية</h3>'
      + tbl(['العنصر', 'N (kN)', 'M₃₃ (kN·m)', 'M₂₂ (kN·m)', 'V₂ (kN)'],
        cols.slice(0, 10).map(function (b) {
          return ['<a href="#" onclick="FEM3D.page.pick(' + b.k + ');return false" '
            + 'style="color:var(--acc)">' + esc(b.m.tag) + '</a>',
            nf(b.N, 2), nf(b.M, 2), nf(FR.stations(b.k, 3)[0].M22, 2), nf(b.V, 2)]; })) + '</div>'
      + '<div class="card"><h3>الإزاحة الجانبية وانحراف الطوابق</h3>'
      + tbl(['الطابق', 'الإزاحة (مم)', 'الانحراف النسبي (مم)', 'النسبة Δ/h', 'ASCE 7 §12.12.1'], dr)
      + '<div style="font-size:11.5px;color:var(--mut);margin-top:9px">الحدّ المسموح للانحراف '
      + 'النسبي 2% من ارتفاع الطابق (ASCE 7-16 جدول 12.12-1 للمنشآت العادية).</div></div>'
      + '</div>';
  }

  function verHTML() {
    var r;
    try { r = benchmarks(); } catch (e) { return '<div class="card">تعذّر التحقّق: ' + esc(e.message) + '</div>'; }
    var pass = r.filter(function (x) { return x.err < 1e-6; }).length;
    return '<div class="card" style="margin-bottom:14px"><h3>لماذا هذا التبويب هو الحجّة العلمية؟</h3>'
      + '<p style="font-size:13px;color:var(--mut);line-height:1.95;margin:0">'
      + 'طريقة الصلابة المباشرة <b>ليست تقريبية</b>: للعنصر المنشوري المرن الخطّي يكون حلّ '
      + 'المصفوفة مطابقاً للحلّ التفاضلي المضبوط تماماً. ولإثبات ذلك تُحلّ أدناه حالات لها '
      + '<b>حلّ مغلق معروف بالمراجع</b>، وتُقارن نتيجة المحرّك بالحلّ المضبوط. '
      + 'وبما أن ETABS يحلّ نفس المعادلة بنفس الطريقة، فمطابقة الحلّ المضبوط تعني '
      + '<b>مطابقة ETABS بالضرورة</b> — ما دامت الافتراضات واحدة.</p></div>'
      + '<div class="grid g4" style="margin-bottom:14px">'
      + kpiF('حالات التحقّق', r.length)
      + kpiF('مطابِقة', pass, pass === r.length ? 'ok' : 'bad')
      + kpiF('أقصى خطأ', r.reduce(function (a, x) { return Math.max(a, x.err); }, 0).toExponential(1) + '%',
        'ok')
      + kpiF('الحكم', pass === r.length ? '✓ مضبوط' : '✗ مراجعة', pass === r.length ? 'ok' : 'bad')
      + '</div>'
      + '<div class="card"><h3>حالات التحقّق ذات الحلّ المغلق</h3>'
      + tbl(['الحالة', 'الكمية', 'الصيغة المرجعية', 'الحلّ المضبوط', 'المحرّك', 'الخطأ %', 'المرجع', ''],
        r.map(function (x) {
          return [esc(x.name), esc(x.q), '<code style="color:#7dd3fc">' + esc(x.ref) + '</code>',
            x.exact.toExponential(6), x.got.toExponential(6),
            x.err.toExponential(2), '<span style="color:var(--mut);font-size:11px">' + esc(x.src) + '</span>',
            x.err < 1e-6 ? '<span class="fem-ok">✓</span>' : '<span class="fem-bad">✗</span>']; }))
      + '<div style="font-size:11.5px;color:var(--mut);margin-top:11px">'
      + 'الخطأ بحدود 10⁻¹⁴٪ هو <b>خطأ التقريب العشري للفاصلة العائمة</b> (دقّة 64-bit)، '
      + 'لا خطأ بالطريقة — أي أن الحلّ مضبوط رياضياً.</div></div>';
  }

  var page = {
    html: pageHTML,
    init: function () {
      injectCSS();
      if (VP) { VP.dispose(); VP = null; }
      var ts = document.querySelectorAll('#fem .fem-tabs button');
      for (var i = 0; i < ts.length; i++)
        ts[i].onclick = (function (t) { return function () { tabTo(t); }; })(ts[i].dataset.t);
      var sc = document.getElementById('fm_scl');
      if (sc) sc.oninput = function () { SCL = +this.value; drawDiag(); };
      var fcEl = document.getElementById('fm_fc');
      var upE = function () {
        var e = document.getElementById('fm_E');
        if (e) e.value = Math.round(4700 * Math.sqrt($n('fm_fc') || 28)) + ' MPa';
      };
      if (fcEl) fcEl.oninput = upE;
      upE();
      dbar();
      var ver = document.getElementById('fm_ver');
      if (ver) ver.innerHTML = verHTML();
      page.run();
    },
    run: function () {
      var st = document.getElementById('fm_stat');
      try {
        var cfg = cfgFromForm();
        if (st) { st.textContent = 'جارٍ الحلّ…'; st.style.color = 'var(--mut)'; }
        FR = buildModel(cfg);
        FR.run();
        SEL = -1;
        // يُعرض التبويب **قبل** بناء العارض ليكون للوحة مقاس حقيقي عند القياس
        tabTo('view');
        var host = document.getElementById('fm_vp');
        if (host && global.THREE) {
          if (VP) VP.dispose();
          VP = Viewport(host, function (k) { page.pick(k, true); });
          if (VP) { VP.build(FR, SOLID); VP.fit(); drawDiag(); }
        }
        document.getElementById('fm_res').innerHTML = resHTML();
        document.getElementById('fm_proof').innerHTML =
          '<div class="card">اختر عنصراً من تبويب المجسّم أو من جداول النتائج، '
          + 'ثم يُعرض هنا إثبات حسابه خطوة بخطوة.</div>';
        if (st) {
          st.innerHTML = '<span class="fem-ok">✓ تمّ الحلّ — ' + FR.members.length + ' عنصر · '
            + FR.neq + ' درجة حرية · ' + nf(FR.ms, 1) + ' ms</span>';
        }
      } catch (e) {
        if (st) { st.textContent = '✗ ' + e.message; st.style.color = 'var(--bad)'; }
        console.error(e);
      }
    },
    diag: function (k) {
      DK = k; dbar(); drawDiag();
      if (VP) { VP.show('def', k === 'def'); VP.show('diag', k !== 'def' && k !== 'none'); }
    },
    tg: function (g, btn) {
      var on = !btn.classList.contains('on');
      btn.classList.toggle('on', on);
      if (VP) VP.show(g, on);
    },
    solid: function () {
      SOLID = !SOLID;
      var b = document.getElementById('fm_solid');
      if (b) { b.classList.toggle('on', SOLID); b.textContent = SOLID ? 'مقاطع مصمتة' : 'خطوط فقط'; }
      if (VP && FR) { VP.build(FR, SOLID); drawDiag(); if (SEL >= 0) VP.axes(SEL); }
    },
    pick: function (k, fromView) {
      SEL = k;
      if (VP && !fromView) VP.axes(k);
      var e = document.getElementById('fm_pick');
      if (e) e.innerHTML = pickHTML(k);
      var p = document.getElementById('fm_proof');
      if (p) p.innerHTML = proofHTML(FR, k);
      if (!fromView) tabTo('view');
    },
    goProof: function () { tabTo('proof'); },
    frame: function () { return FR; }
  };

  global.FEM3D = {
    Frame: Frame, buildModel: buildModel, benchmarks: benchmarks,
    torsionJ: torsionJ, solveBand: solveBand, nf: nf, esc: esc,
    Viewport: Viewport, injectCSS: injectCSS, proofHTML: proofHTML,
    matTable: matTable, dofLabels: dofLabels, DIAG: DIAG, page: page
  };
})(typeof window !== 'undefined' ? window : globalThis);
