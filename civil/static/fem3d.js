/* ============================================================================
   fem3d.js — محرّك «التحليل الإنشائي المتطور»

   إطار فراغي (3D Space Frame) بطريقة الصلابة المباشرة، منفَّذ بنفس الميكانيكا
   التي ينفّذها ETABS للعناصر الخطّية. لا تقريب ولا معاملات تجريبية: كل حدّ في
   المصفوفة له اشتقاق منشور ومرجع مذكور.

   ما ينفّذه هذا المحرّك (وهو ما يفصل محرّكاً جادّاً عن محرّك تعليمي):

     ١) **تشوّه القصّ** (Timoshenko) بمعامل Φ = 12EI/(G·As·L²)، ومساحة القصّ
        As = ⅚·A للمقطع المستطيل — وهو ما يفعله ETABS افتراضياً. إهماله يعطي
        صلابة أعلى من الحقيقة بنسبة تصل إلى 20% في الجسور العميقة القصيرة.

     ٢) **الوزن الذاتي** تلقائياً من γ·A، كما يفعل ETABS بمعامل
        Self Weight Multiplier = 1 في حالة الحمل الميت.

     ٣) **الإزاحات الصلبة عند الأطراف** (End Length Offsets) بمعامل منطقة
        صلبة 0..1، مع قراءة قوى التصميم **عند وجه الركيزة** لا عند محورها —
        وهو ما يجيزه ACI 318M §6.3.2 وما يفعله ETABS.

     ٤) **تحرير الأطراف** (End Releases) بالتكثيف الساكن (Static Condensation).

     ٥) **حالات أحمال متعددة** تُحلّ بتحليل واحد للمصفوفة واستبدال خلفي لكل
        حالة (كما يفعل أي محرّك جادّ)، ثم **تراكيب ACI 318M §5.3.1** وغلاف
        (Envelope) القيم القصوى والدنيا.

     ٦) **ديافرام صلب** لكل طابق (Rigid Diaphragm) بثلاث درجات رئيسية.

   المراجع:
     • ACI 318M-19 §19.2.2.1 · جدول 6.6.3.1.1(a) · §5.3.1 · §6.3.2 · §13.3
     • R.C. Hibbeler, Structural Analysis — Ch.16 Matrix Stiffness Method
     • K.J. Bathe, Finite Element Procedures §8.2.2 — حلّ LDLᵀ الشريطي
     • Przemieniecki, Theory of Matrix Structural Analysis §5.6 — حدّ Timoshenko
     • Cowper (1966), "The Shear Coefficient in Timoshenko's Beam Theory" — κ=5/6
     • Timoshenko & Goodier, Theory of Elasticity §11 — ثابت الالتواء J
   ========================================================================= */
(function (global) {
  'use strict';

  /* ══════════════════════════ أدوات ══════════════════════════ */
  function nf(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    d = d === undefined ? 2 : d;
    var a = Math.abs(v);
    if (a < 1e-9) return (0).toFixed(d);
    if (a < 1e-3 || a >= 1e7) return v.toExponential(2);
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* ════════ ١) الجبر الخطّي: تحليل مرّة واحدة وحلّ لكل حالة حمل ════════
     [K] = [L][D][L]ᵀ يُحسب مرّة (التكلفة O(n·bw²))، ثم كل حالة حمل تُحلّ
     باستبدال أمامي فخلفي فقط (التكلفة O(n·bw)). هذا هو الفرق بين محرّك
     يحلّ عشر حالات في زمن حالة واحدة تقريباً، ومحرّك يعيد كل شيء عشر مرّات. */
  function factorBand(A, n, bw) {
    var i, j, k, lo, s;
    for (j = 0; j < n; j++) {
      lo = Math.max(0, j - bw);
      for (i = lo; i < j; i++) {
        s = A[j * n + i];
        for (k = Math.max(lo, i - bw); k < i; k++)
          s -= A[j * n + k] * A[i * n + k] * A[k * n + k];
        A[j * n + i] = s / A[i * n + i];
      }
      s = A[j * n + j];
      for (k = lo; k < j; k++) s -= A[j * n + k] * A[j * n + k] * A[k * n + k];
      if (Math.abs(s) < 1e-10)
        throw new Error('المنشأ غير مستقرّ عند الدرجة ' + j
          + ' — راجع شروط الاستناد أو تحرير الأطراف');
      A[j * n + j] = s;
    }
    return A;
  }
  function substBand(A, F, n, bw) {
    var y = new Float64Array(n), i, k;
    for (i = 0; i < n; i++) y[i] = F[i];
    for (i = 0; i < n; i++)
      for (k = Math.max(0, i - bw); k < i; k++) y[i] -= A[i * n + k] * y[k];
    for (i = 0; i < n; i++) y[i] /= A[i * n + i];
    for (i = n - 1; i >= 0; i--)
      for (k = i + 1; k < Math.min(n, i + bw + 1); k++) y[i] -= A[k * n + i] * y[k];
    return y;
  }
  function solveBand(A, F, n, bw) { return substBand(factorBand(A, n, bw), F, n, bw); }

  /* ════════ ٢) خواصّ المقطع المستطيل ════════ */
  var BETA = [[1, .141], [1.5, .196], [2, .229], [2.5, .249], [3, .263],
              [4, .281], [5, .291], [6, .299], [10, .312], [1e9, .3333]];
  /** ثابت الالتواء J = β·b³·h للمقطع المستطيل (Timoshenko & Goodier §11).
      وهو نفس الجدول الذي يستعمله ETABS لمقاطع Rectangular. */
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
  /** مساحة القصّ الفعّالة: κ·A و κ = 5/6 للمقطع المستطيل (Cowper 1966).
      ETABS يضع As2 = As3 = (5/6)·A للمقاطع المستطيلة افتراضياً. */
  var KAPPA_RECT = 5 / 6;

  /* معامل مرونة الخرسانة — ACI 318M §19.2.2.1 (بالميغاباسكال ثم kN/m²) */
  function Ec(fcMPa) { return 4700 * Math.sqrt(fcMPa) * 1000; }

  /* ══════════════════ ٣) محرّك الإطار الفراغي ══════════════════ */
  function Frame(opt) {
    opt = opt || {};
    this.nu = opt.nu === undefined ? 0.2 : opt.nu;
    this.cases = (opt.cases || ['DEAD']).slice();
    this.gamma = opt.gamma === undefined ? 24.0 : opt.gamma;   // kN/m³ — ACI normalweight
    this.nodes = [];
    this.members = [];
    this.sup = {};
    this.nl = {};                       // nl[case][node] = [6]
    this.diaph = [];
    this.swCase = opt.swCase || null;   // حالة الحمل التي يُضاف إليها الوزن الذاتي
    this.swMult = opt.swMult === undefined ? 1.0 : opt.swMult;
    for (var i = 0; i < this.cases.length; i++) this.nl[this.cases[i]] = {};
  }

  Frame.prototype.node = function (x, y, z) {
    this.nodes.push({ x: x, y: y, z: z }); return this.nodes.length - 1;
  };

  /** عنصر إطاري. كل الخواصّ صريحة — لا قيمة مخفيّة ولا معامل تجريبي.
      offI/offJ = نصف عمق العنصر المتصل عند كل طرف (طول الإزاحة الصلبة)
      rz        = معامل المنطقة الصلبة 0..1 (ETABS: Rigid Zone Factor)
      relI/relJ = [6] لكل طرف، 1 = درجة محرَّرة */
  Frame.prototype.member = function (i, j, p) {
    var A = p.A, G = p.G === undefined ? p.E / (2 * (1 + this.nu)) : p.G;
    var m = {
      i: i, j: j, E: p.E, G: G, A: A,
      As2: p.As2 === undefined ? KAPPA_RECT * A : p.As2,
      As3: p.As3 === undefined ? KAPPA_RECT * A : p.As3,
      I22: p.I22, I33: p.I33, J: p.J,
      rho: p.rho === undefined ? this.gamma : p.rho,
      offI: p.offI || 0, offJ: p.offJ || 0, rz: p.rz || 0,
      relI: p.relI || null, relJ: p.relJ || null,
      shear: p.shear === undefined ? true : !!p.shear,
      w: {},                              // w[case] = {gx,gy,gz,w2,w3}
      kind: p.kind || 'beam', b: p.b || 0, h: p.h || 0,
      mod: p.mod === undefined ? 1 : p.mod, tag: p.tag || '', sec: p.sec || '',
      // وسوم البنّاء (الاتجاه · خطّا الشبكة · الطابق) تُمرَّر كما هي ليصنّف
      // بها العرضُ والتصميم لاحقاً؛ إسقاطها يفقد ربط العنصر بموقعه بالمبنى.
      dir: p.dir || '', gi: p.gi, gj: p.gj, gk: p.gk
    };
    this.members.push(m); return this.members.length - 1;
  };

  Frame.prototype.support = function (n, f) { this.sup[n] = f || [1, 1, 1, 1, 1, 1]; };

  Frame.prototype.load = function (cs, n, v) {
    if (!this.nl[cs]) this.nl[cs] = {};
    var p = this.nl[cs][n] || [0, 0, 0, 0, 0, 0];
    for (var k = 0; k < 6; k++) p[k] += (v[k] || 0);
    this.nl[cs][n] = p;
  };

  /** حمل موزّع **منتظم** على عنصر ضمن حالة حمل. gz سالب = لأسفل. */
  Frame.prototype.udl = function (k, cs, v) {
    var m = this.members[k], w = m.w[cs] || { gx: 0, gy: 0, gz: 0, w2: 0, w3: 0, segs: [] };
    w.gx += v.gx || 0; w.gy += v.gy || 0; w.gz += v.gz || 0;
    w.w2 += v.w2 || 0; w.w3 += v.w3 || 0;
    m.w[cs] = w;
  };

  /** حمل موزّع **متغيّر خطّياً** على مقطع من العنصر — مثلثي أو شبه منحرف.

      هذا ما يحتاجه توزيع حمل البلاطة على الجسور بخطوط 45°: الجسر القصير
      يحمل مثلثاً والطويل شبه منحرف، لا حملاً منتظماً. واستبدالهما بحمل
      منتظم مكافئ يغيّر العزم بنسبة 5–8%، ولهذا يوزّعه ETABS بشكله الحقيقي.

      a, b  = المسافتان من العقدة i (بالمتر)
      gza/gzb = شدّة الحمل الشاقولي العام عند الطرفين (kN/m، سالب لأسفل) */
  Frame.prototype.vdl = function (k, cs, seg) {
    var m = this.members[k], w = m.w[cs] || { gx: 0, gy: 0, gz: 0, w2: 0, w3: 0, segs: [] };
    if (!w.segs) w.segs = [];
    w.segs.push({ a: seg.a, b: seg.b,
      gza: seg.gza || 0, gzb: seg.gzb === undefined ? (seg.gza || 0) : seg.gzb,
      gya: seg.gya || 0, gyb: seg.gyb === undefined ? (seg.gya || 0) : seg.gyb,
      gxa: seg.gxa || 0, gxb: seg.gxb === undefined ? (seg.gxa || 0) : seg.gxb });
    m.w[cs] = w;
  };

  Frame.prototype.diaphragm = function (nodes) {
    var cx = 0, cy = 0;
    for (var k = 0; k < nodes.length; k++) { cx += this.nodes[nodes[k]].x; cy += this.nodes[nodes[k]].y; }
    this.diaph.push({ nodes: nodes.slice(), cx: cx / nodes.length, cy: cy / nodes.length });
  };

  /* ---- هندسة العنصر: الطول ومصفوفة جيوب التمام [R] باصطلاح ETABS ----
     المحور 1 على طول العنصر · المحور 2 «إلى فوق» للعنصر غير الشاقولي
     (ومنه كان M₃₃ هو العزم الرئيسي) · المحور 2 نحو +X للعمود الشاقولي. */
  Frame.prototype.geom = function (m) {
    var a = this.nodes[m.i], b = this.nodes[m.j];
    var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-9) throw new Error('عنصر بطول صفر بين العقدتين ' + m.i + ' و ' + m.j);
    var e1 = [dx / L, dy / L, dz / L], e2;
    if (Math.abs(e1[2]) > 0.999) {
      e2 = [1, 0, 0];
    } else {
      var d = e1[2];
      e2 = [-d * e1[0], -d * e1[1], 1 - d * e1[2]];
      var n = Math.sqrt(e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2]) || 1;
      e2 = [e2[0] / n, e2[1] / n, e2[2] / n];
    }
    var e3 = [e1[1] * e2[2] - e1[2] * e2[1],
              e1[2] * e2[0] - e1[0] * e2[2],
              e1[0] * e2[1] - e1[1] * e2[0]];
    return { L: L, R: [e1, e2, e3] };
  };

  /* ---- مصفوفة صلابة العنصر المرن بطول Lc، بحدّ تشوّه القصّ ----
     Φ = 12·E·I/(G·As·L²)  —  Przemieniecki §5.6
       k11 = 12EI/(L³(1+Φ))   ·   k12 = 6EI/(L²(1+Φ))
       k22 = (4+Φ)EI/(L(1+Φ)) ·   k24 = (2−Φ)EI/(L(1+Φ))
     عند Φ→0 تعود بالضبط إلى نظرية Euler–Bernoulli (4EI/L و 2EI/L). */
  Frame.kLocal = function (m, L) {
    var k = new Float64Array(144);
    var st = function (r, c, v) { k[r * 12 + c] = v; };
    var E = m.E, G = m.G, A = m.A, I22 = m.I22, I33 = m.I33, J = m.J;
    var ea = E * A / L, gj = G * J / L;
    st(0, 0, ea); st(6, 6, ea); st(0, 6, -ea); st(6, 0, -ea);
    st(3, 3, gj); st(9, 9, gj); st(3, 9, -gj); st(9, 3, -gj);
    var p2 = m.shear && m.As2 > 0 ? 12 * E * I33 / (G * m.As2 * L * L) : 0;
    var p3 = m.shear && m.As3 > 0 ? 12 * E * I22 / (G * m.As3 * L * L) : 0;
    // انحناء بالمستوى 1-2 (حول المحور 3) — I₃₃ وقصّ As2
    var a = 12 * E * I33 / (L * L * L * (1 + p2)),
        b = 6 * E * I33 / (L * L * (1 + p2)),
        c = (4 + p2) * E * I33 / (L * (1 + p2)),
        d = (2 - p2) * E * I33 / (L * (1 + p2));
    st(1, 1, a); st(7, 7, a); st(1, 7, -a); st(7, 1, -a);
    st(1, 5, b); st(5, 1, b); st(1, 11, b); st(11, 1, b);
    st(5, 7, -b); st(7, 5, -b); st(7, 11, -b); st(11, 7, -b);
    st(5, 5, c); st(11, 11, c); st(5, 11, d); st(11, 5, d);
    // انحناء بالمستوى 1-3 (حول المحور 2) — I₂₂ وقصّ As3
    a = 12 * E * I22 / (L * L * L * (1 + p3));
    b = 6 * E * I22 / (L * L * (1 + p3));
    c = (4 + p3) * E * I22 / (L * (1 + p3));
    d = (2 - p3) * E * I22 / (L * (1 + p3));
    st(2, 2, a); st(8, 8, a); st(2, 8, -a); st(8, 2, -a);
    st(2, 4, -b); st(4, 2, -b); st(2, 10, -b); st(10, 2, -b);
    st(4, 8, b); st(8, 4, b); st(8, 10, b); st(10, 8, b);
    st(4, 4, c); st(10, 10, c); st(4, 10, d); st(10, 4, d);
    k.phi2 = p2; k.phi3 = p3;
    return k;
  };

  /* ---- التكثيف الساكن لتحرير درجة حرية عند طرف العنصر ----
     المعادلة r لم تعد تحمل قوة، فتُحذف بتعويضها في بقية المعادلات:
        kᵢⱼ ← kᵢⱼ − kᵢᵣ·kᵣⱼ/kᵣᵣ      ·      q₀ᵢ ← q₀ᵢ − kᵢᵣ·q₀ᵣ/kᵣᵣ
     المرجع: Hibbeler §16.5 / Cook §2.7 (Static Condensation). */
  function condense(k, q0, r) {
    var krr = k[r * 12 + r];
    if (Math.abs(krr) < 1e-12) return;
    // الصفّ والعمود r يُنسخان **قبل** التعديل: الحلقة تصفّر الصفّ r عند i=r،
    // ولو قُرئ بعدها لخرجت بقيةُ المعادلات (i > r) بلا تصحيح. لا يظهر الخطأ
    // عند تحرير طرف واحد لأن r = 11 آخر مؤشّر، ويظهر فوراً عند تحرير طرفين.
    var col = new Float64Array(12), row = new Float64Array(12), i, j;
    for (i = 0; i < 12; i++) { col[i] = k[i * 12 + r]; row[i] = k[r * 12 + i]; }
    var qr = q0[r];
    for (i = 0; i < 12; i++) {
      if (col[i] === 0) continue;
      var c = col[i] / krr;
      for (j = 0; j < 12; j++) k[i * 12 + j] -= c * row[j];
      q0[i] -= c * qr;
    }
    for (i = 0; i < 12; i++) { k[i * 12 + r] = 0; k[r * 12 + i] = 0; }
    q0[r] = 0;
  }

  /* ---- تحويل كل أحمال العنصر إلى تمثيل محلّي موحّد: مقاطع خطّية ----
     الحمل المنتظم والوزن الذاتي والمقاطع المثلثية وشبه المنحرفة كلها تصير
     قائمة {a,b,w2a,w2b,w3a,w3b} بالإحداثيّات المحلّية. ما بعدها يتعامل مع
     شكل واحد فقط، فلا يوجد مسار خاصّ بكل شكل حمل. */
  Frame.prototype.locLoad = function (m, L, R, cs) {
    var segs = [], W = m.w[cs];
    var u2 = 0, u3 = 0, gx = 0, gy = 0, gz = 0;
    if (W) { u2 = W.w2 || 0; u3 = W.w3 || 0; gx = W.gx || 0; gy = W.gy || 0; gz = W.gz || 0; }
    if (this.swCase === cs) gz -= this.swMult * m.rho * m.A;   // الوزن الذاتي
    if (gx || gy || gz) {
      u2 += R[1][0] * gx + R[1][1] * gy + R[1][2] * gz;
      u3 += R[2][0] * gx + R[2][1] * gy + R[2][2] * gz;
    }
    // المركّبة **المحورية** w1 لا تُهمل: الوزن الذاتي للعمود الشاقولي محوريٌّ
    // بالكامل (R[0]·g = −γA) فإهماله يُسقط وزن كل الأعمدة من النموذج.
    var u1 = 0;
    if (gx || gy || gz) u1 = R[0][0] * gx + R[0][1] * gy + R[0][2] * gz;
    if (u1 || u2 || u3)
      segs.push({ a: 0, b: L, w1a: u1, w1b: u1, w2a: u2, w2b: u2, w3a: u3, w3b: u3 });
    if (W && W.segs) for (var i = 0; i < W.segs.length; i++) {
      var s = W.segs[i];
      segs.push({ a: s.a, b: s.b,
        w1a: R[0][0] * s.gxa + R[0][1] * s.gya + R[0][2] * s.gza,
        w1b: R[0][0] * s.gxb + R[0][1] * s.gyb + R[0][2] * s.gzb,
        w2a: R[1][0] * s.gxa + R[1][1] * s.gya + R[1][2] * s.gza,
        w2b: R[1][0] * s.gxb + R[1][1] * s.gyb + R[1][2] * s.gzb,
        w3a: R[2][0] * s.gxa + R[2][1] * s.gya + R[2][2] * s.gza,
        w3b: R[2][0] * s.gxb + R[2][1] * s.gyb + R[2][2] * s.gzb });
    }
    return segs;
  };

  /* شدّة الحمل عند x (مجموع كل المقاطع التي تغطّيه) */
  function wAt(segs, x, key) {
    var s = 0;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (x < g.a - 1e-12 || x > g.b + 1e-12) continue;
      var t = g.b > g.a ? (x - g.a) / (g.b - g.a) : 0;
      var wa = g[key + 'a'] || 0, wb = g[key + 'b'] || 0;
      s += wa + (wb - wa) * t;
    }
    return s;
  }

  /* التكاملان المطلوبان للقوى الداخلية — بصيغة مغلقة للمقطع الخطّي:
        S(x)  = ∫₀ˣ w(s) ds          (محصّلة الحمل يسار المقطع)
        S₁(x) = ∫₀ˣ s·w(s) ds
     ومنهما  ∫₀ˣ (x−s)·w(s) ds = x·S(x) − S₁(x)  وهو عزم الحمل عند المقطع. */
  function loadInts(segs, x, key) {
    var S = 0, S1 = 0;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (x <= g.a) continue;
      var c = Math.min(x, g.b), a = g.a, len = g.b - g.a;
      if (len <= 1e-12) continue;
      var wa = g[key + 'a'] || 0, kk = ((g[key + 'b'] || 0) - wa) / len;
      var d = c - a;
      S += wa * d + kk * d * d / 2;
      S1 += wa * (c * c - a * a) / 2
          + kk * ((c * c * c - a * a * a) / 3 - a * (c * c - a * a) / 2);
    }
    return [S, S1];
  }

  /* ---- أحمال التثبيت التامّة {q₀} بالتكامل المتوافق ----
     {q₀}ₐ = −∫ w(x)·Nₐ(x) dx   —  متّجه الحمل المتوافق (Consistent Load
     Vector, Cook §3.9). دوالّ Nₐ هي دوالّ هيرميت **المعدّلة بـ Φ** نفسها
     المستعملة في مصفوفة الصلابة، فيكون المتّجه متوافقاً معها تماماً.
     التكامل بـ Gauss–Legendre بأربع نقاط: مضبوط حتى الدرجة السابعة، والمكامَل
     هنا من الدرجة الرابعة (حمل خطّي × دالّة شكل تكعيبية) فالنتيجة مضبوطة. */
  var GX = [-0.8611363115940526, -0.3399810435848563,
             0.3399810435848563, 0.8611363115940526];
  var GW = [0.3478548451374538, 0.6521451548625461,
            0.6521451548625461, 0.3478548451374538];

  function hermN(t, p, Lx) {
    var f = 1 / (1 + p), t2 = t * t, t3 = t2 * t;
    return [f * (2 * t3 - 3 * t2 - p * t + 1 + p),
            Lx * f * (t3 - (2 + p / 2) * t2 + (1 + p / 2) * t),
            f * (-2 * t3 + 3 * t2 + p * t),
            Lx * f * (t3 - (1 - p / 2) * t2 - (p / 2) * t)];
  }

  Frame.prototype.fef = function (segs, lc, ra, rb, L, p2, p3) {
    var q = new Float64Array(12), i, gi;
    /* (أ) الجزء المرن [ra, L−rb] — متّجه الحمل المتوافق */
    var bnds = [0, lc];
    for (i = 0; i < segs.length; i++) {                  // حدود المقاطع نقاط كسر
      var a = segs[i].a - ra, b = segs[i].b - ra;
      if (a > 1e-12 && a < lc - 1e-12) bnds.push(a);
      if (b > 1e-12 && b < lc - 1e-12) bnds.push(b);
    }
    bnds.sort(function (x, y) { return x - y; });
    for (var s = 0; s < bnds.length - 1; s++) {
      var lo = bnds[s], hi = bnds[s + 1], h = hi - lo;
      if (h <= 1e-12) continue;
      for (gi = 0; gi < 4; gi++) {
        var xi = lo + h * (GX[gi] + 1) / 2, wt = GW[gi] * h / 2;
        var t = xi / lc;
        var N2 = hermN(t, p2, lc), N3 = hermN(t, p3, lc);
        var w1 = wAt(segs, xi + ra, 'w1');
        q[0] -= w1 * (1 - t) * wt; q[6] -= w1 * t * wt;   // دالّتا شكل خطّيّتان
        var w2 = wAt(segs, xi + ra, 'w2'), w3 = wAt(segs, xi + ra, 'w3');
        q[1] -= w2 * N2[0] * wt; q[5] -= w2 * N2[1] * wt;
        q[7] -= w2 * N2[2] * wt; q[11] -= w2 * N2[3] * wt;
        q[2] -= w3 * N3[0] * wt; q[4] += w3 * N3[1] * wt;
        q[8] -= w3 * N3[2] * wt; q[10] += w3 * N3[3] * wt;
      }
    }
    return q;
  };

  /** حمل المنطقتين الصلبتين ينتقل للعقدتين مباشرة باتزان الجسم الصلب:
        عند i:  q₀[F] = −∫w ds      ·  q₀[M] = ∓∫ s·w ds
        عند j:  q₀[F] = −∫w ds      ·  q₀[M] = ±∫ (L−s)·w ds          */
  function rigidZoneLoads(q, segs, ra, rb, L) {
    if (ra > 1e-12) {
      var A1 = loadInts(segs, ra, 'w1');
      var A2 = loadInts(segs, ra, 'w2'), A3 = loadInts(segs, ra, 'w3');
      q[0] -= A1[0];
      q[1] -= A2[0]; q[5] -= A2[1];
      q[2] -= A3[0]; q[4] += A3[1];
    }
    if (rb > 1e-12) {
      var xj = L - rb;
      var B2 = loadInts(segs, L, 'w2'), b2 = loadInts(segs, xj, 'w2');
      var B3 = loadInts(segs, L, 'w3'), b3 = loadInts(segs, xj, 'w3');
      var C1 = loadInts(segs, L, 'w1'), c1b = loadInts(segs, xj, 'w1');
      var S2 = B2[0] - b2[0], M2 = B2[1] - b2[1];     // ∫w و ∫s·w على المنطقة
      var S3 = B3[0] - b3[0], M3 = B3[1] - b3[1];
      q[6] -= (C1[0] - c1b[0]);
      q[7] -= S2; q[11] += (L * S2 - M2);
      q[8] -= S3; q[10] -= (L * S3 - M3);
    }
    return q;
  }

  /* ---- مصفوفة الجسم الصلب [Tr]: تربط طرفَي الجزء المرن بالعقدتين ----
     إزاحة طرف الجزء المرن = إزاحة العقدة + (دوران العقدة × متّجه الإزاحة).
     متّجه الإزاحة عند i هو (+a,0,0) وعند j هو (−b,0,0) بالإحداثيات المحلّية. */
  function rigidT(a, b) {
    var Tr = new Float64Array(144), i;
    for (i = 0; i < 12; i++) Tr[i * 12 + i] = 1;
    Tr[1 * 12 + 5] = a; Tr[2 * 12 + 4] = -a;          // الطرف i
    Tr[7 * 12 + 11] = -b; Tr[8 * 12 + 10] = b;        // الطرف j
    return Tr;
  }

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

  function mul12(a, b, out) {                 // out = a · b   (12×12)
    var r, c, i, s;
    for (r = 0; r < 12; r++) for (c = 0; c < 12; c++) {
      s = 0; for (i = 0; i < 12; i++) s += a[r * 12 + i] * b[i * 12 + c];
      out[r * 12 + c] = s;
    }
    return out;
  }
  function mulT12(a, b, out) {                // out = aᵀ · b  (12×12)
    var r, c, i, s;
    for (r = 0; r < 12; r++) for (c = 0; c < 12; c++) {
      s = 0; for (i = 0; i < 12; i++) s += a[i * 12 + r] * b[i * 12 + c];
      out[r * 12 + c] = s;
    }
    return out;
  }

  /* ════════════════════════ الحلّ الكامل ════════════════════════ */
  Frame.prototype.run = function () {
    var t0 = (global.performance || Date).now();
    var n = this.mapDofs(), self = this;
    if (!this.members.length) throw new Error('النموذج بلا عناصر');
    if (n > 5000) throw new Error('النموذج كبير (' + n + ' درجة حرية) — قلّل الشبكة');
    var K = new Float64Array(n * n), a, b, i, j, q, k, cs;

    /* ---- بناء مصفوفة كل عنصر مرّة واحدة (مستقلّة عن حالة الحمل) ---- */
    this.cache = [];
    for (k = 0; k < this.members.length; k++) {
      var m = this.members[k], gm = this.geom(m), L = gm.L, R = gm.R;
      var ra = m.rz * m.offI, rb = m.rz * m.offJ;
      var lc = L - ra - rb;
      if (lc < 0.2 * L) {                    // حارس: منطقة صلبة تبتلع العنصر
        var sc = 0.8 * L / (ra + rb || 1);
        ra *= sc; rb *= sc; lc = L - ra - rb;
      }
      var kl = Frame.kLocal(m, lc);
      var Tr = rigidT(ra, rb);
      var rel = [], t;
      if (m.relI) for (t = 0; t < 6; t++) if (m.relI[t]) rel.push(t);
      if (m.relJ) for (t = 0; t < 6; t++) if (m.relJ[t]) rel.push(6 + t);
      var T = new Float64Array(144);
      for (var blk = 0; blk < 4; blk++)
        for (a = 0; a < 3; a++) for (b = 0; b < 3; b++)
          T[(blk * 3 + a) * 12 + (blk * 3 + b)] = R[a][b];
      var maps = [];
      for (q = 0; q < 6; q++) maps.push(this.dmap[m.i][q]);
      for (q = 0; q < 6; q++) maps.push(this.dmap[m.j][q]);
      this.cache.push({ L: L, lc: lc, ra: ra, rb: rb, R: R, T: T, Tr: Tr,
                        klFlex: kl, rel: rel, maps: maps, phi2: kl.phi2, phi3: kl.phi3 });
    }

    /* ---- تجميع [K] العامة (مرّة واحدة لكل الحالات) ---- */
    var tmp = new Float64Array(144);
    for (k = 0; k < this.members.length; k++) {
      var c = this.cache[k];
      // التحرير يغيّر [k]، لكن {q₀} يختلف بين الحالات — فنخزّن نسخة أساس
      var kf = new Float64Array(c.klFlex);
      var zero = new Float64Array(12);
      for (i = 0; i < c.rel.length; i++) condense(kf, zero, c.rel[i]);
      c.klRel = kf;
      // [k]عقدي = [Tr]ᵀ·[k]مرن·[Tr]  ثم  [k]عام = [T]ᵀ·[k]عقدي·[T]
      var kn = mulT12(c.Tr, mul12(kf, c.Tr, tmp), new Float64Array(144));
      c.kNode = kn;
      var kg = mulT12(c.T, mul12(kn, c.T, tmp), new Float64Array(144));
      c.kg = kg;
      for (a = 0; a < 12; a++) {
        var ma = c.maps[a];
        for (i = 0; i < ma.length; i++) {
          var pa = ma[i][0], ca = ma[i][1];
          for (b = 0; b < 12; b++) {
            var kab = kg[a * 12 + b];
            if (kab === 0) continue;
            var mb = c.maps[b];
            for (j = 0; j < mb.length; j++) K[pa * n + mb[j][0]] += ca * mb[j][1] * kab;
          }
        }
      }
    }
    var tAsm = (global.performance || Date).now();

    /* ---- تحليل المصفوفة مرّة واحدة ---- */
    if (n) factorBand(K, n, this.bw);
    var tFac = (global.performance || Date).now();

    /* ---- ثم استبدال خلفي لكل حالة حمل ---- */
    this.U = {}; this.mf = {}; this.mu = {}; this.q0 = {}; this.wloc = {};
    this.reactions = {};
    for (var ci = 0; ci < this.cases.length; ci++) {
      cs = this.cases[ci];
      var F = new Float64Array(n);
      var nlc = this.nl[cs] || {};
      for (var nd in nlc) {
        var v = nlc[nd];
        for (q = 0; q < 6; q++) {
          var mp = this.dmap[nd][q];
          for (i = 0; i < mp.length; i++) F[mp[i][0]] += mp[i][1] * v[q];
        }
      }
      var q0all = [], wall = [];
      for (k = 0; k < this.members.length; k++) {
        var cc = this.cache[k], mm = this.members[k];
        var segs = this.locLoad(mm, cc.L, cc.R, cs);
        var q0f = this.fef(segs, cc.lc, cc.ra, cc.rb, cc.L, cc.phi2, cc.phi3);
        // تحرير الأطراف يعدّل {q₀} كذلك (بمصفوفة الأساس قبل التكثيف)
        if (cc.rel.length) {
          var kk = new Float64Array(cc.klFlex);
          for (i = 0; i < cc.rel.length; i++) condense(kk, q0f, cc.rel[i]);
        }
        // نقل {q₀} من طرفَي الجزء المرن إلى العقدتين: [Tr]ᵀ·{q₀}
        var q0n = new Float64Array(12), s;
        for (a = 0; a < 12; a++) {
          s = 0; for (i = 0; i < 12; i++) s += cc.Tr[i * 12 + a] * q0f[i];
          q0n[a] = s;
        }
        rigidZoneLoads(q0n, segs, cc.ra, cc.rb, cc.L);
        q0all.push(q0n); wall.push(segs);
        // الأحمال المكافئة بالعقد = −[T]ᵀ{q₀}
        for (a = 0; a < 12; a++) {
          s = 0; for (i = 0; i < 12; i++) s += cc.T[i * 12 + a] * q0n[i];
          var mA = cc.maps[a];
          for (i = 0; i < mA.length; i++) F[mA[i][0]] += -mA[i][1] * s;
        }
      }
      this.q0[cs] = q0all; this.wloc[cs] = wall;
      var U = n ? substBand(K, F, n, this.bw) : new Float64Array(0);
      this.U[cs] = U;
      // قوى أطراف العناصر
      var mfc = [], muc = [];
      for (k = 0; k < this.members.length; k++) {
        var c3 = this.cache[k], ug = new Float64Array(12), ul = new Float64Array(12),
            qq = new Float64Array(12), s2;
        for (a = 0; a < 12; a++) {
          var m3 = c3.maps[a]; s2 = 0;
          for (i = 0; i < m3.length; i++) s2 += m3[i][1] * U[m3[i][0]];
          ug[a] = s2;
        }
        for (a = 0; a < 12; a++) {
          s2 = 0; for (i = 0; i < 12; i++) s2 += c3.T[a * 12 + i] * ug[i];
          ul[a] = s2;
        }
        // {q}عقدي = [k]عقدي·{u}عقدي + {q₀}عقدي
        for (a = 0; a < 12; a++) {
          s2 = 0; for (i = 0; i < 12; i++) s2 += c3.kNode[a * 12 + i] * ul[i];
          qq[a] = s2 + q0all[k][a];
        }
        mfc.push(qq); muc.push({ g: ug, l: ul });
      }
      this.mf[cs] = mfc; this.mu[cs] = muc;
      // ردود الأفعال
      var rx = {};
      for (var sn in this.sup) rx[sn] = [0, 0, 0, 0, 0, 0];
      for (k = 0; k < this.members.length; k++) {
        var c4 = this.cache[k], qm = mfc[k], qg = new Float64Array(12), s3;
        for (a = 0; a < 12; a++) {
          s3 = 0; for (i = 0; i < 12; i++) s3 += c4.T[i * 12 + a] * qm[i];
          qg[a] = s3;
        }
        var mem = this.members[k];
        if (rx[mem.i]) for (q = 0; q < 6; q++) rx[mem.i][q] += qg[q];
        if (rx[mem.j]) for (q = 0; q < 6; q++) rx[mem.j][q] += qg[6 + q];
      }
      this.reactions[cs] = rx;
    }
    var t1 = (global.performance || Date).now();
    this.ms = t1 - t0;
    this.msAsm = tAsm - t0; this.msFac = tFac - tAsm; this.msSub = t1 - tFac;
    return this;
  };

  /* ════════ ٤) القوى الداخلية على طول العنصر ════════
     باتزان الجزء الأيسر عند المسافة x من العقدة i — صالح على كامل الطول
     بما فيه المنطقتان الصلبتان، لأن القوة الداخلية عند أي مقطع تحدّدها
     محصّلة كل ما على يساره وحده.
        V₂(x) = −q₁ − w₂·x           ·   M₃₃(x) = q₅ − q₁·x − w₂·x²/2
        V₃(x) = −q₂ − w₃·x           ·   M₂₂(x) = −q₄ − q₂·x − w₃·x²/2
        T(x)  = −q₃                  ·   N(x)   = −q₀     (الشدّ موجب)
     والتحقّق: dM₃₃/dx = −q₁ − w₂·x = V₂(x) ✓ */
  /** القوى الداخلية **عند المسافة x بالضبط** — لا بالتقريب إلى أقرب محطّة.
      التقريب الشبكي كان يعطي قيمة وجه الركيزة عند 0.24 م بدل 0.25 م. */
  Frame.prototype.at = function (k, x, cs) {
    cs = cs || this.cases[0];
    var q = this.mf[cs][k], segs = this.wloc[cs][k];
    var I1 = loadInts(segs, x, 'w1');
    var I2 = loadInts(segs, x, 'w2'), I3 = loadInts(segs, x, 'w3');
    return {
      x: x,
      N: -q[0] - I1[0],
      V2: -q[1] - I2[0],
      V3: -q[2] - I3[0],
      T: -q[3],
      M22: -q[4] - q[2] * x - (x * I3[0] - I3[1]),
      M33: q[5] - q[1] * x - (x * I2[0] - I2[1])
    };
  };

  Frame.prototype.stations = function (k, ns, cs) {
    ns = ns || 21;
    var L = this.cache[k].L, out = [];
    for (var i = 0; i < ns; i++) out.push(this.at(k, L * i / (ns - 1), cs));
    return out;
  };

  /** المواضع الحرجة على طول العنصر — لا بمسح محطّات منفصلة.

      أقصى عزم يقع حيث **ينعدم القصّ** (dM/dx = V = 0)، وقد لا يصادف أي
      محطّة من محطّات العرض. مسحُ 21 أو 601 محطّة يعطي موضعاً قريباً لا
      مضبوطاً، ولذلك يُحلّ هنا V(x) = 0 بالتنصيف إلى 10⁻¹² م.
      المرشّحون: الطرفان · نقاط كسر الحمل · أصفار القصّ. */
  Frame.prototype.critical = function (k, cs) {
    cs = cs || this.cases[0];
    var L = this.cache[k].L, segs = this.wloc[cs][k], self = this;
    var xs = [0, L], i;
    for (i = 0; i < segs.length; i++) {
      if (segs[i].a > 1e-9 && segs[i].a < L - 1e-9) xs.push(segs[i].a);
      if (segs[i].b > 1e-9 && segs[i].b < L - 1e-9) xs.push(segs[i].b);
    }
    ['V2', 'V3'].forEach(function (v) {
      var NS = 400, prev = self.at(k, 0, cs)[v], px = 0;
      for (i = 1; i <= NS; i++) {
        var x = L * i / NS, cur = self.at(k, x, cs)[v];
        if (prev === 0) xs.push(px);
        else if ((prev < 0) !== (cur < 0)) {
          var lo = px, hi = x, flo = prev;            // تنصيف حتى 10⁻¹²
          for (var it = 0; it < 60 && hi - lo > 1e-12; it++) {
            var mid = (lo + hi) / 2, fm = self.at(k, mid, cs)[v];
            if ((flo < 0) !== (fm < 0)) hi = mid; else { lo = mid; flo = fm; }
          }
          xs.push((lo + hi) / 2);
        }
        prev = cur; px = x;
      }
    });
    xs.sort(function (p, q) { return p - q; });
    var out = [];
    for (i = 0; i < xs.length; i++)
      if (!i || xs[i] - xs[i - 1] > 1e-9) out.push(this.at(k, xs[i], cs));
    return out;
  };

  /** أقصى قيمة لكمّية على طول العنصر، بموضعها المضبوط. */
  Frame.prototype.peak = function (k, q, cs) {
    var c = this.critical(k, cs), best = c[0], i;
    for (i = 1; i < c.length; i++)
      if (Math.abs(c[i][q]) > Math.abs(best[q])) best = c[i];
    return best;
  };

  /** القوى عند **وجه الركيزة** — ACI 318M §6.3.2 يجيز التصميم عليها بدل
      قيمة المحور، وهو ما يعرضه ETABS حين تُعرَّف End Length Offsets. */
  Frame.prototype.faces = function (k, cs) {
    var m = this.members[k], L = this.cache[k].L;
    var xi = Math.min(m.offI, L / 2), xj = Math.max(L - m.offJ, L / 2);
    return { i: this.at(k, xi, cs), j: this.at(k, xj, cs),
             xi: xi, xj: xj, clear: xj - xi };
  };

  /* ---- الشكل المشوَّه داخل العنصر ----
     ثلاثة أجزاء تُجمع، وإسقاط أيٍّ منها يعطي هبوطاً أقلّ من الحقيقي:

       ١) **الحلّ المتجانس** بدوالّ هيرميت **المعدّلة بـ Φ** (Timoshenko):
            N₁ = [2ξ³ − 3ξ² − Φξ + 1 + Φ] / (1+Φ)   … إلخ
          وعند Φ→0 تعود بالضبط إلى التكعيبية الكلاسيكية.
       ٢) **الحلّ الخاصّ للانحناء**: w·x²(L−x)²/(24EI) — لأن الشكل الحقيقي
          تحت حمل موزّع رباعي الدرجة والتكعيبي يبلغ ⅘ الهبوط فقط.
       ٣) **الحلّ الخاصّ للقصّ**: w·x(L−x)/(2·G·As) — وهو ما يجعل الجائز
          بسيط الإسناد يعطي 5wL⁴/384EI + wL²/8GAs بالضبط.

     ومع الإزاحات الصلبة: الجزء المرن وحده يتشوّه، والمنطقتان الصلبتان
     تدوران دوراناً جاسئاً حول العقدتين. */
  /* تكامل تراكمي من الرتبة الرابعة (Simpson) على شبكة متساوية.
     مضبوط تماماً لأي مكامَل درجته ≤ 3، وهو حال الانحناء تحت حمل منتظم. */
  function cumSimpson(y, h) {
    var n = y.length, F = new Float64Array(n), i;
    for (i = 0; i + 2 < n; i += 2) {
      F[i + 1] = F[i] + h / 12 * (5 * y[i] + 8 * y[i + 1] - y[i + 2]);
      F[i + 2] = F[i] + h / 3 * (y[i] + 4 * y[i + 1] + y[i + 2]);
    }
    if (i + 1 < n) F[i + 1] = F[i] + h / 12 * (-y[i - 1] + 8 * y[i] + 5 * y[i + 1]);
    return F;
  }

  /* ---- الشكل المشوَّه بتكامل الانحناء ----
     بدل دوالّ الشكل (التي تصحّ لحمل منتظم فقط) يُكامل الانحناء الحقيقي:

        v″(x) = −M(x)/(E·I)          ← انحناء (Euler–Bernoulli)
        v′s(x) = V(x)/(G·As)         ← انزلاق قصّ (Timoshenko)
        v(x) = ∬v″ + ∫v′s + C₀ + C₁x   و C₀,C₁ من إزاحتَي العقدتين

     وهذه هي **طريقة المساحة-العزم** الكلاسيكية، مضبوطة لأي شكل حمل —
     مثلثي أو شبه منحرف أو منتظم — لا لحالة واحدة. وفي المنطقة الصلبة
     يُصفَّر الانحناء فلا تنثني. */
  Frame.prototype.shape = function (k, ns, cs, ng) {
    cs = cs || this.cases[0]; ns = ns || 13;
    var m = this.members[k], c = this.cache[k], un = this.mu[cs][k].l;
    var L = c.L, R = c.R, a = this.nodes[m.i], ra = c.ra, rb = c.rb;
    var EI33 = m.E * m.I33, EI22 = m.E * m.I22;
    var GA2 = m.shear && m.As2 > 0 ? m.G * m.As2 : 0;
    var GA3 = m.shear && m.As3 > 0 ? m.G * m.As3 : 0;
    // شبكة التكامل: خطأ Simpson يتناقص كـ h⁴. 120 عقدة تكفي للرسم،
    // و 960 تنزل بالخطأ إلى ما دون 10⁻¹¹ لفحوص الترخيم التصميمية.
    var NG = ng || 120, h = L / NG, i;
    NG = NG + (NG % 2);
    var k2 = new Float64Array(NG + 1), k3 = new Float64Array(NG + 1),
        g2 = new Float64Array(NG + 1), g3 = new Float64Array(NG + 1);
    for (i = 0; i <= NG; i++) {
      var x = i * h, st = this.at(k, x, cs);
      var rigid = x < ra - 1e-12 || x > L - rb + 1e-12;
      k2[i] = rigid || !EI33 ? 0 : -st.M33 / EI33;
      k3[i] = rigid || !EI22 ? 0 : -st.M22 / EI22;
      g2[i] = rigid || !GA2 ? 0 : st.V2 / GA2;
      g3[i] = rigid || !GA3 ? 0 : st.V3 / GA3;
    }
    var s2 = cumSimpson(k2, h), v2 = cumSimpson(s2, h);
    var s3 = cumSimpson(k3, h), v3 = cumSimpson(s3, h);
    var q2 = cumSimpson(g2, h), q3 = cumSimpson(g3, h);
    for (i = 0; i <= NG; i++) { v2[i] += q2[i]; v3[i] += q3[i]; }
    // ثابتا التكامل من إزاحتَي العقدتين بالإحداثيّات المحلّية
    var c2_0 = un[1] - v2[0], c2_1 = (un[7] - v2[NG] - c2_0) / L;
    var c3_0 = un[2] - v3[0], c3_1 = (un[8] - v3[NG] - c3_0) / L;
    var out = [];
    for (i = 0; i < ns; i++) {
      var t = i / (ns - 1), xx = t * L, gi = Math.round(t * NG);
      var d1 = un[0] * (1 - t) + un[6] * t;
      var d2 = v2[gi] + c2_0 + c2_1 * xx;
      var d3 = v3[gi] + c3_0 + c3_1 * xx;
      out.push({
        x: a.x + R[0][0] * (xx + d1) + R[1][0] * d2 + R[2][0] * d3,
        y: a.y + R[0][1] * (xx + d1) + R[1][1] * d2 + R[2][1] * d3,
        z: a.z + R[0][2] * (xx + d1) + R[1][2] * d2 + R[2][2] * d3,
        d: Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3), d2: d2, d3: d3, t: t, xl: xx
      });
    }
    return out;
  };

  /** أقصى ترخيم **نسبي** عن الوتر الواصل بين العقدتين — وهو ما يُقارن بـ
      L/240 أو L/360 (ACI 318M جدول 24.2.2)، لا الإزاحة المطلقة التي تشمل
      هبوط الركيزتين نفسيهما. */
  Frame.prototype.defl = function (k, ns, cs) {
    var sp = this.shape(k, ns || 81, cs, 960), n = sp.length - 1, i, mx = 0, at = 0;
    var un = this.mu[cs || this.cases[0]][k].l;
    for (i = 1; i < n; i++) {
      var t = i / n;
      var rel2 = sp[i].d2 - (un[1] * (1 - t) + un[7] * t);
      var rel3 = sp[i].d3 - (un[2] * (1 - t) + un[8] * t);
      var r = Math.sqrt(rel2 * rel2 + rel3 * rel3);
      if (r > mx) { mx = r; at = sp[i].xl; }
    }
    return { max: mx, at: at, L: this.cache[k].L,
             ratio: mx > 1e-12 ? this.cache[k].L / mx : Infinity };
  };

  Frame.prototype.nodeDisp = function (n, cs) {
    cs = cs || this.cases[0];
    var d = [0, 0, 0, 0, 0, 0], U = this.U[cs];
    for (var q = 0; q < 6; q++) {
      var mp = this.dmap[n][q], s = 0;
      for (var i = 0; i < mp.length; i++) s += mp[i][1] * U[mp[i][0]];
      d[q] = s;
    }
    return d;
  };

  /* ════════ ٥) تراكيب الأحمال والغلاف ════════
     التحليل خطّي، فالتركيب تراكُبٌ خطّي مضبوط لنتائج الحالات. */
  Frame.prototype.comboStations = function (k, ns, combo) {
    var out = null, cs, f;
    for (cs in combo.f) {
      f = combo.f[cs];
      if (!f || this.cases.indexOf(cs) < 0) continue;
      var st = this.stations(k, ns, cs);
      if (!out) {
        out = st.map(function (s) {
          return { x: s.x, N: s.N * f, V2: s.V2 * f, V3: s.V3 * f,
                   T: s.T * f, M22: s.M22 * f, M33: s.M33 * f };
        });
      } else {
        for (var i = 0; i < st.length; i++) {
          out[i].N += st[i].N * f; out[i].V2 += st[i].V2 * f; out[i].V3 += st[i].V3 * f;
          out[i].T += st[i].T * f; out[i].M22 += st[i].M22 * f; out[i].M33 += st[i].M33 * f;
        }
      }
    }
    return out || this.stations(k, ns, this.cases[0]).map(function (s) {
      return { x: s.x, N: 0, V2: 0, V3: 0, T: 0, M22: 0, M33: 0 }; });
  };

  Frame.prototype.envelope = function (k, ns, combos) {
    var Q = ['N', 'V2', 'V3', 'T', 'M22', 'M33'], env = null, ci, i, qi;
    for (ci = 0; ci < combos.length; ci++) {
      var st = this.comboStations(k, ns, combos[ci]);
      if (!env) {
        env = st.map(function (s) {
          var o = { x: s.x };
          for (var z = 0; z < Q.length; z++) {
            o[Q[z] + 'max'] = s[Q[z]]; o[Q[z] + 'min'] = s[Q[z]];
            o[Q[z] + 'maxC'] = combos[0].name; o[Q[z] + 'minC'] = combos[0].name;
          }
          return o;
        });
      } else {
        for (i = 0; i < st.length; i++) for (qi = 0; qi < Q.length; qi++) {
          var q = Q[qi], v = st[i][q];
          if (v > env[i][q + 'max']) { env[i][q + 'max'] = v; env[i][q + 'maxC'] = combos[ci].name; }
          if (v < env[i][q + 'min']) { env[i][q + 'min'] = v; env[i][q + 'minC'] = combos[ci].name; }
        }
      }
    }
    return env;
  };

  Frame.prototype.comboReactions = function (combo) {
    var out = {}, cs, f, sn, q;
    for (sn in this.sup) out[sn] = [0, 0, 0, 0, 0, 0];
    for (cs in combo.f) {
      f = combo.f[cs];
      if (!f || !this.reactions[cs]) continue;
      for (sn in this.reactions[cs])
        for (q = 0; q < 6; q++) out[sn][q] += this.reactions[cs][sn][q] * f;
    }
    return out;
  };

  /** يصدّر النموذج بصيغة موحّدة تُبنى منها نسخةٌ مطابقة في **OpenSees**.

      الغرض تحقّقٌ متبادل: يُبنى نفس المنشأ بنفس الخواصّ والأحمال في محرّك
      مستقلّ ثم تُقارَن النتائج حدّاً بحدّ. وأدقّ ما في التصدير هو **اصطلاح
      المحاور**: OpenSees يبني المحور y المحلّي بـ (vecxz × المحور x)، فتمرير
      vecxz = محورنا 3 يجعل y عنده = محورنا 2 و z عنده = محورنا 3، وعندها:
          Iz(OpenSees) = I₃₃   ·   Iy(OpenSees) = I₂₂
          Avy(OpenSees) = As2  ·   Avz(OpenSees) = As3
      ولولا هذا التطابق لتبادلت العزوم وخرجت المقارنة بلا معنى.

      الحمل الموزّع يُصدَّر بمحصّلته المنتظمة المكافئة بالمحاور المحلّية،
      لأن `eleLoad -beamUniform` في OpenSees لا يقبل إلا المنتظم. ولذلك
      تُستعمل هذه المقارنة على نماذج بأحمال منتظمة (والأشكال المثلثية
      وشبه المنحرفة لها حالاتها المغلقة في تبويب التحقّق). */
  Frame.prototype.spec = function (cs) {
    cs = cs || this.cases[0];
    var self = this, nodes = this.nodes.map(function (n) { return [n.x, n.y, n.z]; });
    var members = [], eleLoads = [];
    this.members.forEach(function (m, k) {
      var c = self.cache[k];
      members.push({ i: m.i, j: m.j, E: m.E, G: m.G, A: m.A,
        Iy: m.I22, Iz: m.I33, J: m.J,
        Av2: m.As2, Av3: m.As3, shear: !!(m.shear && c.phi2 + c.phi3 > 0),
        ra: c.ra, rb: c.rb,
        vecxz: [c.R[2][0], c.R[2][1], c.R[2][2]] });
      var segs = self.locLoad(m, c.L, c.R, cs), w1 = 0, w2 = 0, w3 = 0;
      segs.forEach(function (g) {
        var d = (g.b - g.a) / c.L;                 // متوسّط موزون بالطول
        w1 += ((g.w1a || 0) + (g.w1b || 0)) / 2 * d;
        w2 += ((g.w2a || 0) + (g.w2b || 0)) / 2 * d;
        w3 += ((g.w3a || 0) + (g.w3b || 0)) / 2 * d;
      });
      if (w1 || w2 || w3) eleLoads.push({ k: k, wx: w1, wy: w2, wz: w3 });
    });
    var sup = {}, sn;
    for (sn in this.sup) sup[sn] = this.sup[sn];
    var nl = {}, nd, src = this.nl[cs] || {};
    for (nd in src) nl[nd] = src[nd];
    return { nodes: nodes, members: members, supports: sup, nodalLoads: nl,
             eleLoads: eleLoads,
             diaphragms: this.diaph.map(function (d) { return d.nodes.slice(); }),
             case: cs };
  };

  /* تراكيب ACI 318M-14 §5.3.1 — W و E بإشارتين لأن الاتجاه انعكاسي */
  function aciCombos(has) {
    has = has || {};
    var C = [{ name: '1.4D', f: { DEAD: 1.4 } }];
    if (has.LIVE) C.push({ name: '1.2D + 1.6L', f: { DEAD: 1.2, LIVE: 1.6 } });
    else C.push({ name: '1.2D', f: { DEAD: 1.2 } });
    ['EQX', 'EQY'].forEach(function (e) {
      if (!has[e]) return;
      var s = e === 'EQX' ? 'Ex' : 'Ey';
      var L = has.LIVE ? 1.0 : 0;
      C.push({ name: '1.2D + 1.0' + s + (L ? ' + 1.0L' : ''),
               f: has.LIVE ? { DEAD: 1.2, LIVE: 1.0 } : { DEAD: 1.2 } });
      C[C.length - 1].f[e] = 1.0;
      C.push({ name: '1.2D − 1.0' + s + (L ? ' + 1.0L' : ''),
               f: has.LIVE ? { DEAD: 1.2, LIVE: 1.0 } : { DEAD: 1.2 } });
      C[C.length - 1].f[e] = -1.0;
      C.push({ name: '0.9D + 1.0' + s, f: { DEAD: 0.9 } });
      C[C.length - 1].f[e] = 1.0;
      C.push({ name: '0.9D − 1.0' + s, f: { DEAD: 0.9 } });
      C[C.length - 1].f[e] = -1.0;
    });
    // تركيب الخدمة (غير مُعامَل) لفحص الترخيم والقدرة التحمّلية للتربة
    C.service = has.LIVE ? { name: 'D + L (خدمة)', f: { DEAD: 1, LIVE: 1 } }
                         : { name: 'D (خدمة)', f: { DEAD: 1 } };
    return C;
  }

  global.FEM3D = {
    Frame: Frame, torsionJ: torsionJ, Ec: Ec, KAPPA_RECT: KAPPA_RECT,
    factorBand: factorBand, substBand: substBand, solveBand: solveBand,
    condense: condense, rigidT: rigidT, aciCombos: aciCombos,
    nf: nf, esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
