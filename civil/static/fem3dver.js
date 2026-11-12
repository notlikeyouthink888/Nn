/* ============================================================================
   fem3dver.js — حالات التحقّق ذات الحلّ المغلق

   كل ميزة في المحرّك لها هنا حالة اختبار حلُّها منشور في مرجع قياسي. ليس
   الغرض «إظهار نجاح» بل كشف الخطأ: أي انحراف يتجاوز خطأ الفاصلة العائمة
   (≈10⁻¹³٪) يعني خللاً في المعادلة لا في التقريب.

   الحالات تغطّي: الانحناء · القصّ (Timoshenko) · الالتواء · المحوري ·
   الاستمرارية · تحرير الأطراف · الإزاحات الصلبة · الوزن الذاتي ·
   تراكُب حالات الأحمال · والاتزان العام.
   ========================================================================= */
(function (global) {
  'use strict';
  var F = global.FEM3D;
  if (!F) return;
  var Frame = F.Frame, torsionJ = F.torsionJ;

  function props(b, h, E, nu, shear) {
    var A = b * h;
    return { E: E, G: E / (2 * (1 + (nu === undefined ? 0.2 : nu))), A: A,
      As2: F.KAPPA_RECT * A, As3: F.KAPPA_RECT * A,
      I33: b * h * h * h / 12, I22: h * b * b * b / 12, J: torsionJ(b, h),
      b: b, h: h, shear: !!shear, rho: 0 };
  }

  /** جائز بمحور X بين عقدتين، بحمل شاقولي موزّع. */
  function beam(L, P, supA, supB, w, opt) {
    opt = opt || {};
    var f = new Frame({ cases: ['DEAD'], gamma: 0 });
    var a = f.node(0, 0, 0), c = f.node(L, 0, 0);
    var pp = {}; for (var q in P) pp[q] = P[q];
    if (opt.relI) pp.relI = opt.relI;
    if (opt.relJ) pp.relJ = opt.relJ;
    if (opt.offI !== undefined) { pp.offI = opt.offI; pp.offJ = opt.offJ; pp.rz = opt.rz; }
    var k = f.member(a, c, pp);
    if (w) f.udl(k, 'DEAD', { gz: -w });
    f.support(a, supA); f.support(c, supB);
    f.run(); return f;
  }

  var PIN = [1, 1, 1, 1, 0, 1], FIX = [1, 1, 1, 1, 1, 1], FREE = [0, 0, 0, 0, 0, 0];

  function run() {
    var out = [], E = 25e6, nu = 0.2, L = 6, w = 20;
    var PB = props(.3, .6, E, nu, false);        // بلا قصّ — Euler–Bernoulli
    var PT = props(.3, .6, E, nu, true);         // مع القصّ — Timoshenko
    var G = PB.G, I33 = PB.I33, I22 = PB.I22, A = PB.A, J = PB.J, As = PB.As2;
    function add(grp, name, q, ref, exact, got, src) {
      out.push({ grp: grp, name: name, q: q, ref: ref, exact: exact, got: got, src: src });
    }

    /* ─── المجموعة ١: الانحناء الكلاسيكي (Euler–Bernoulli) ─── */
    var g1 = 'الانحناء — Euler–Bernoulli';
    var f = beam(L, PB, PIN, PIN, w);
    var st = f.stations(0, 21, 'DEAD');
    add(g1, 'جائز بسيط الإسناد · حمل منتظم', 'M₃₃ عند الوسط', 'wL²/8',
      w * L * L / 8, Math.abs(st[10].M33), 'Hibbeler Ex. 11-1');
    add(g1, 'جائز بسيط الإسناد · حمل منتظم', 'هبوط الوسط δ', '5wL⁴/384EI',
      5 * w * Math.pow(L, 4) / (384 * E * I33), f.shape(0, 21, 'DEAD')[10].d,
      'AISC Table 3-23');

    f = beam(L, PB, FIX, FIX, w); st = f.stations(0, 21, 'DEAD');
    add(g1, 'جائز مثبّت الطرفين · حمل منتظم', 'M₃₃ عند الركيزة', 'wL²/12',
      w * L * L / 12, Math.abs(st[0].M33), 'Hibbeler Table 11-1');
    add(g1, 'جائز مثبّت الطرفين · حمل منتظم', 'M₃₃ عند الوسط', 'wL²/24',
      w * L * L / 24, Math.abs(st[10].M33), 'Hibbeler Table 11-1');
    add(g1, 'جائز مثبّت الطرفين · حمل منتظم', 'V₂ عند الركيزة', 'wL/2',
      w * L / 2, Math.abs(st[0].V2), 'اتزان');
    add(g1, 'جائز مثبّت الطرفين · حمل منتظم', 'هبوط الوسط δ', 'wL⁴/384EI',
      w * Math.pow(L, 4) / (384 * E * I33), f.shape(0, 21, 'DEAD')[10].d,
      'AISC Table 3-23');

    f = beam(L, PB, FIX, FREE, w); st = f.stations(0, 21, 'DEAD');
    add(g1, 'كابولي · حمل منتظم', 'M₃₃ عند التثبيت', 'wL²/2',
      w * L * L / 2, Math.abs(st[0].M33), 'Hibbeler Ex. 4-6');
    add(g1, 'كابولي · حمل منتظم', 'هبوط الطرف δ', 'wL⁴/8EI',
      w * Math.pow(L, 4) / (8 * E * I33), f.shape(0, 21, 'DEAD')[20].d,
      'AISC Table 3-23');

    /* ─── المجموعة ٢: تشوّه القصّ (Timoshenko) ─── */
    var g2 = 'تشوّه القصّ — Timoshenko';
    f = beam(L, PT, PIN, PIN, w);
    var dEx = 5 * w * Math.pow(L, 4) / (384 * E * I33) + w * L * L / (8 * G * As);
    add(g2, 'جائز بسيط الإسناد · مع القصّ', 'هبوط الوسط δ',
      '5wL⁴/384EI + wL²/8GAs', dEx, f.shape(0, 21, 'DEAD')[10].d,
      'Timoshenko Beam Theory');
    add(g2, 'جائز بسيط الإسناد · مع القصّ', 'M₃₃ عند الوسط (لا يتأثّر)', 'wL²/8',
      w * L * L / 8, Math.abs(f.stations(0, 21, 'DEAD')[10].M33), 'اتزان ساكن');

    // كابولي بحمل مركّز عند الطرف: δ = PL³/3EI + PL/GAs
    var Pt = 60;
    f = new Frame({ cases: ['DEAD'], gamma: 0 });
    var n0 = f.node(0, 0, 0), n1 = f.node(L, 0, 0);
    f.member(n0, n1, PT); f.support(n0, FIX);
    f.load('DEAD', n1, [0, 0, -Pt, 0, 0, 0]); f.run();
    add(g2, 'كابولي · حمل مركّز بالطرف', 'هبوط الطرف δ', 'PL³/3EI + PL/GAs',
      Pt * Math.pow(L, 3) / (3 * E * I33) + Pt * L / (G * As),
      Math.abs(f.nodeDisp(n1, 'DEAD')[2]), 'Timoshenko Beam Theory');

    // جائز مثبّت الطرفين: العزوم لا تتأثّر بالقصّ (حمل متماثل)
    f = beam(L, PT, FIX, FIX, w);
    add(g2, 'جائز مثبّت الطرفين · مع القصّ', 'M₃₃ عند الركيزة (لا يتأثّر)', 'wL²/12',
      w * L * L / 12, Math.abs(f.stations(0, 21, 'DEAD')[0].M33), 'Przemieniecki §5.6');

    // جائز عميق قصير: الفرق بين النظريتين يجب أن يظهر بوضوح
    var Ld = 3.0, Pd = props(.3, .8, E, nu, true), Pd0 = props(.3, .8, E, nu, false);
    var fd = beam(Ld, Pd, PIN, PIN, w), fd0 = beam(Ld, Pd0, PIN, PIN, w);
    var dd = fd.shape(0, 21, 'DEAD')[10].d, dd0 = fd0.shape(0, 21, 'DEAD')[10].d;
    var exD = 5 * w * Math.pow(Ld, 4) / (384 * E * Pd.I33) + w * Ld * Ld / (8 * Pd.G * Pd.As2);
    add(g2, 'جائز عميق 300×800 بحر 3 م', 'هبوط الوسط مع القصّ', '5wL⁴/384EI + wL²/8GAs',
      exD, dd, 'Timoshenko Beam Theory');
    out.push({ grp: g2, name: 'جائز عميق 300×800 بحر 3 م', q: 'زيادة الهبوط بسبب القصّ',
      ref: 'نسبة', exact: null, got: (dd / dd0 - 1) * 100, unit: '%',
      note: 'إهمال القصّ يعطي هبوطاً أقلّ من الحقيقي بهذه النسبة',
      src: 'أثر النظرية' });

    /* ─── المجموعة ٣: الالتواء والمحوري ─── */
    var g3 = 'الالتواء والمحوري';
    f = new Frame({ cases: ['DEAD'], gamma: 0 });
    var t0 = f.node(0, 0, 0), t1 = f.node(L, 0, 0);
    f.member(t0, t1, PB); f.support(t0, FIX);
    f.load('DEAD', t1, [0, 0, 0, 30, 0, 0]); f.run();
    add(g3, 'التواء · عزم لَيّ 30 kN·m', 'زاوية اللَّي φ', 'TL/GJ',
      30 * L / (G * J), Math.abs(f.nodeDisp(t1, 'DEAD')[3]), 'Timoshenko §11');

    f = new Frame({ cases: ['DEAD'], gamma: 0 });
    var x0 = f.node(0, 0, 0), x1 = f.node(L, 0, 0);
    f.member(x0, x1, PB); f.support(x0, FIX);
    f.load('DEAD', x1, [100, 0, 0, 0, 0, 0]); f.run();
    add(g3, 'شدّ محوري · قوة 100 kN', 'استطالة δ', 'PL/EA',
      100 * L / (E * A), Math.abs(f.nodeDisp(x1, 'DEAD')[0]), 'Hibbeler Ex. 4-1');
    add(g3, 'شدّ محوري · قوة 100 kN', 'القوة الداخلية N (شدّ موجب)', 'P',
      100, f.stations(0, 3, 'DEAD')[0].N, 'اتزان');

    /* ─── المجموعة ٤: تحرير الأطراف (Static Condensation) ─── */
    var g4 = 'تحرير الأطراف — End Releases';
    // مثبّت-مفصلي: تحرير الدوران حول المحور 3 عند الطرف j
    f = beam(L, PB, FIX, FIX, w, { relJ: [0, 0, 0, 0, 0, 1] });
    st = f.stations(0, 21, 'DEAD');
    add(g4, 'مثبّت-مفصلي (كابولي مسنود) · حمل منتظم', 'M₃₃ عند التثبيت', 'wL²/8',
      w * L * L / 8, Math.abs(st[0].M33), 'Hibbeler Table 11-1');
    add(g4, 'مثبّت-مفصلي · حمل منتظم', 'رد الفعل عند المفصل', '3wL/8',
      3 * w * L / 8, Math.abs(st[20].V2), 'Hibbeler Table 11-1');
    add(g4, 'مثبّت-مفصلي · حمل منتظم', 'M₃₃ عند الطرف المحرَّر', '0',
      0, Math.abs(st[20].M33), 'شرط التحرير');
    add(g4, 'مثبّت-مفصلي · حمل منتظم', 'أقصى M₃₃ موجب', '9wL²/128',
      9 * w * L * L / 128,
      Math.abs(f.stations(0, 33, 'DEAD')[Math.round(32 * 5 / 8)].M33),
      'Hibbeler Table 11-1');
    // تحرير الطرفين ⟹ جائز بسيط الإسناد
    f = beam(L, PB, FIX, FIX, w, { relI: [0, 0, 0, 0, 0, 1], relJ: [0, 0, 0, 0, 0, 1] });
    add(g4, 'تحرير الطرفين ⟹ بسيط الإسناد', 'M₃₃ عند الوسط', 'wL²/8',
      w * L * L / 8, Math.abs(f.stations(0, 21, 'DEAD')[10].M33), 'تكافؤ');

    /* ─── المجموعة ٥: الإزاحات الصلبة عند الأطراف ─── */
    var g5 = 'الإزاحات الصلبة — Rigid End Offsets';
    var od = 0.25;                                   // نصف عمق العمود
    // كابولي بمنطقة صلبة كاملة: البحر الفعّال Lc = L − od
    f = beam(L, PB, FIX, FREE, 0, { offI: od, offJ: 0, rz: 1 });
    f.load('DEAD', 1, [0, 0, -50, 0, 0, 0]); f.run();
    add(g5, 'كابولي بمنطقة صلبة 0.25 م · حمل طرفي 50 kN', 'M₃₃ عند العقدة', 'P·L',
      50 * L, Math.abs(f.stations(0, 21, 'DEAD')[0].M33), 'اتزان (لا يتغيّر)');
    // المنطقة الصلبة ملتحمة بالركيزة المثبّتة، فالكابولي المرن بحرُه Lc = L − d
    add(g5, 'كابولي بمنطقة صلبة 0.25 م · حمل طرفي 50 kN', 'هبوط الطرف δ',
      'P·Lc³/3EI  (Lc = L − d)',
      50 * Math.pow(L - od, 3) / (3 * E * I33),
      Math.abs(f.nodeDisp(1, 'DEAD')[2]), 'كابولي بالبحر الفعّال');
    // قراءة العزم عند وجه الركيزة أصغر من قيمته عند المحور — ACI 318-19 §6.5.4
    f = beam(L, PB, FIX, FIX, w, { offI: od, offJ: od, rz: 0 });
    var fc = f.faces(0, 'DEAD'), sc = f.stations(0, 21, 'DEAD');
    add(g5, 'جائز مثبّت · قراءة عند وجه الركيزة', 'M₃₃ عند الوجه',
      'M(x=0) − V·d − w·d²/2',
      Math.abs(sc[0].M33 - Math.abs(sc[0].V2) * od + w * od * od / 2),
      Math.abs(fc.i.M33), 'ACI 318-19 §6.5.4');
    out.push({ grp: g5, name: 'جائز مثبّت · قراءة عند وجه الركيزة',
      q: 'نقص عزم التصميم', ref: 'نسبة', exact: null,
      got: (1 - Math.abs(fc.i.M33) / Math.abs(sc[0].M33)) * 100, unit: '%',
      note: 'ما يوفّره التصميم عند الوجه بدل المحور', src: 'ACI 318-19 §6.5.4' });

    /* إزاحة صلبة عند الطرفين **مع** تشوّه القصّ — الحالة التي ينحرف فيها
       ElasticTimoshenkoBeam في OpenSees عن الحلّ المغلق (يهمل -jntOffset)،
       فتُثبَّت هنا بالحلّ التحليلي: ذراع صلب + كابولي Timoshenko مرن.
         الذراع ينقل للطرف المرن قوةً P وعزماً M = P·d
         δ_طرف مرن = PLc³/3EI + MLc²/2EI + PLc/GAs
         θ_طرف مرن = PLc²/2EI + MLc/EI      (دوران المقطع، لا الميل)
         δ_العقدة  = δ_طرف مرن + θ·d */
    var d2 = 0.5, Pr = 50, Lc2 = L - 2 * d2, Mr = Pr * d2;
    [false, true].forEach(function (sh) {
      var PP = sh ? PT : PB;
      var fr = new Frame({ cases: ['DEAD'], gamma: 0 });
      var r0 = fr.node(0, 0, 0), r1 = fr.node(L, 0, 0);
      var pr2 = {}; for (var qq2 in PP) pr2[qq2] = PP[qq2];
      pr2.offI = d2; pr2.offJ = d2; pr2.rz = 1;
      fr.member(r0, r1, pr2); fr.support(r0, FIX);
      fr.load('DEAD', r1, [0, 0, -Pr, 0, 0, 0]); fr.run();
      var dF = Pr * Math.pow(Lc2, 3) / (3 * E * I33) + Mr * Lc2 * Lc2 / (2 * E * I33)
             + (sh ? Pr * Lc2 / (G * As) : 0);
      var tF = Pr * Lc2 * Lc2 / (2 * E * I33) + Mr * Lc2 / (E * I33);
      add(g5, 'إزاحة صلبة بالطرفين ' + (sh ? '+ تشوّه القصّ' : '(انحناء فقط)'),
        'إزاحة العقدة الحرّة δ', 'δ_مرن + θ·d',
        dF + tF * d2, Math.abs(fr.nodeDisp(r1, 'DEAD')[2]),
        'ذراع صلب + كابولي مرن');
    });

    /* ─── المجموعة ٦: الوزن الذاتي ─── */
    var g6 = 'الوزن الذاتي — Self Weight';
    var gam = 24;
    f = new Frame({ cases: ['DEAD'], gamma: gam, swCase: 'DEAD', swMult: 1 });
    var s0 = f.node(0, 0, 0), s1 = f.node(L, 0, 0);
    var ps = {}; for (var qq in PB) ps[qq] = PB[qq]; ps.rho = gam;
    f.member(s0, s1, ps); f.support(s0, FIX); f.support(s1, FIX); f.run();
    var wsw = gam * A;
    var swSeg = f.wloc.DEAD[0];                 // مقاطع الحمل المحلّية للعنصر
    add(g6, 'جائز مثبّت · وزنه الذاتي فقط', 'الحمل المتولّد w', 'γ·A',
      wsw, swSeg.length ? Math.abs(swSeg[0].w2a) : 0,
      'ETABS Self Weight Multiplier = 1');
    add(g6, 'جائز مثبّت · وزنه الذاتي فقط', 'M₃₃ عند الركيزة', 'γAL²/12',
      wsw * L * L / 12, Math.abs(f.stations(0, 21, 'DEAD')[0].M33), 'اتزان');
    var Rz = 0; for (var sn in f.reactions.DEAD) Rz += f.reactions.DEAD[sn][2];
    add(g6, 'جائز مثبّت · وزنه الذاتي فقط', 'مجموع رد الفعل', 'γ·A·L',
      wsw * L, Rz, 'اتزان عام');

    /* ─── المجموعة ٧: تراكُب حالات الأحمال ─── */
    var g7 = 'حالات الأحمال والتراكيب';
    f = new Frame({ cases: ['DEAD', 'LIVE'], gamma: 0 });
    var c0 = f.node(0, 0, 0), c1 = f.node(L, 0, 0);
    var kk = f.member(c0, c1, PB);
    f.udl(kk, 'DEAD', { gz: -10 }); f.udl(kk, 'LIVE', { gz: -15 });
    f.support(c0, FIX); f.support(c1, FIX); f.run();
    var mD = Math.abs(f.stations(kk, 21, 'DEAD')[0].M33);
    var mL = Math.abs(f.stations(kk, 21, 'LIVE')[0].M33);
    var combo = { name: '1.2D+1.6L', f: { DEAD: 1.2, LIVE: 1.6 } };
    var mC = Math.abs(f.comboStations(kk, 21, combo)[0].M33);
    add(g7, 'حالتا حمل ميت وحي', 'M من الحمل الميت (w=10)', 'wL²/12',
      10 * L * L / 12, mD, 'فصل الحالات');
    add(g7, 'حالتا حمل ميت وحي', 'M من الحمل الحي (w=15)', 'wL²/12',
      15 * L * L / 12, mL, 'فصل الحالات');
    add(g7, 'حالتا حمل ميت وحي', 'التركيب 1.2D + 1.6L', '1.2·M_D + 1.6·M_L',
      1.2 * mD + 1.6 * mL, mC, 'ACI 318-19 §5.3.1 — تراكُب خطّي');
    var env = f.envelope(kk, 21, [{ name: '1.4D', f: { DEAD: 1.4 } }, combo]);
    add(g7, 'غلاف تركيبين', 'أقصى |M₃₃| عند الركيزة', 'max(1.4D , 1.2D+1.6L)',
      Math.max(1.4 * mD, 1.2 * mD + 1.6 * mL),
      Math.max(Math.abs(env[0].M33max), Math.abs(env[0].M33min)), 'Envelope');
    add(g7, 'غلاف تركيبين', 'أدنى |M₃₃| عند الركيزة', 'min(1.4D , 1.2D+1.6L)',
      Math.min(1.4 * mD, 1.2 * mD + 1.6 * mL),
      Math.min(Math.abs(env[0].M33max), Math.abs(env[0].M33min)), 'Envelope');
    add(g7, 'غلاف تركيبين', 'التركيب الحاكم', '1.2D+1.6L',
      1, env[0].M33maxC === '1.2D+1.6L' ? 1 : 0, 'تتبّع التركيب الحاكم');

    /* ─── المجموعة ٧ب: أشكال الأحمال (مثلثي · شبه منحرف) ───
       هذه هي الأحمال الحقيقية التي تصل الجسور من البلاطة بخطوط 45°،
       وهي ما يوزّعه ETABS. استبدالها بحمل منتظم مكافئ يغيّر العزم. */
    var g7b = 'أشكال الأحمال — مثلثي وشبه منحرف';
    function loaded(segsFn) {
      var ff = new Frame({ cases: ['DEAD'], gamma: 0 });
      var p = ff.node(0, 0, 0), r2 = ff.node(L, 0, 0);
      var kx = ff.member(p, r2, PB);
      segsFn(ff, kx);
      ff.support(p, PIN); ff.support(r2, PIN);
      ff.run(); return { f: ff, k: kx };
    }
    var w0 = 30;
    // (أ) مثلثي متماثل: صفر بالطرفين وقمّة w₀ بالوسط — الجسر القصير بلوح مربّع
    var tri = loaded(function (ff, kx) {
      ff.vdl(kx, 'DEAD', { a: 0, b: L / 2, gza: 0, gzb: -w0 });
      ff.vdl(kx, 'DEAD', { a: L / 2, b: L, gza: -w0, gzb: 0 });
    });
    add(g7b, 'مثلثي متماثل · قمّة w₀ بالوسط', 'M₃₃ عند الوسط', 'w₀L²/12',
      w0 * L * L / 12, Math.abs(tri.f.stations(tri.k, 21, 'DEAD')[10].M33),
      'AISC Table 3-23 حالة 3');
    add(g7b, 'مثلثي متماثل · قمّة w₀ بالوسط', 'هبوط الوسط δ', 'w₀L⁴/120EI',
      w0 * Math.pow(L, 4) / (120 * E * I33), tri.f.shape(tri.k, 41, 'DEAD', 960)[20].d,
      'AISC Table 3-23 حالة 3');
    add(g7b, 'مثلثي متماثل · قمّة w₀ بالوسط', 'رد الفعل (نصف الحمل)', 'w₀L/4',
      w0 * L / 4, Math.abs(tri.f.reactions.DEAD[0][2]), 'اتزان');

    // (ب) مثلثي غير متماثل: صفر عند i وقمّة w₀ عند j
    var tr2 = loaded(function (ff, kx) {
      ff.vdl(kx, 'DEAD', { a: 0, b: L, gza: 0, gzb: -w0 });
    });
    var pk = tr2.f.peak(tr2.k, 'M33', 'DEAD'), mT = Math.abs(pk.M33), xT = pk.x;
    add(g7b, 'مثلثي متزايد · قمّة w₀ عند الطرف', 'أقصى M₃₃', 'w₀L²/(9√3)',
      w0 * L * L / (9 * Math.sqrt(3)), mT, 'Hibbeler Ex. 6-7');
    add(g7b, 'مثلثي متزايد · قمّة w₀ عند الطرف', 'موضع أقصى عزم', 'L/√3',
      L / Math.sqrt(3), xT, 'Hibbeler Ex. 6-7');
    add(g7b, 'مثلثي متزايد · قمّة w₀ عند الطرف', 'رد الفعل عند i', 'w₀L/6',
      w0 * L / 6, Math.abs(tr2.f.reactions.DEAD[0][2]), 'اتزان');

    // (ج) شبه منحرف: توزيع 45° لبلاطة على جسر طويل — a = نصف البحر القصير
    var aTr = 1.5;
    var trp = loaded(function (ff, kx) {
      ff.vdl(kx, 'DEAD', { a: 0, b: aTr, gza: 0, gzb: -w0 });
      ff.vdl(kx, 'DEAD', { a: aTr, b: L - aTr, gza: -w0, gzb: -w0 });
      ff.vdl(kx, 'DEAD', { a: L - aTr, b: L, gza: -w0, gzb: 0 });
    });
    add(g7b, 'شبه منحرف (توزيع 45°) · a = 1.5 م', 'M₃₃ عند الوسط',
      'w₀(L²/8 − a²/6)', w0 * (L * L / 8 - aTr * aTr / 6),
      Math.abs(trp.f.stations(trp.k, 21, 'DEAD')[10].M33), 'اشتقاق مباشر');
    add(g7b, 'شبه منحرف (توزيع 45°) · a = 1.5 م', 'مجموع الحمل المنقول', 'w₀(L − a)',
      w0 * (L - aTr), Math.abs(trp.f.reactions.DEAD[0][2] + trp.f.reactions.DEAD[1][2]),
      'حفظ الحمل الكلّي');
    // الفرق بين الشكل الحقيقي والحمل المنتظم المكافئ
    var wEq = w0 * (L - aTr) / L;
    var uni = loaded(function (ff, kx) { ff.udl(kx, 'DEAD', { gz: -wEq }); });
    var mTrp = Math.abs(trp.f.stations(trp.k, 21, 'DEAD')[10].M33);
    var mUni = Math.abs(uni.f.stations(uni.k, 21, 'DEAD')[10].M33);
    out.push({ grp: g7b, name: 'شبه منحرف مقابل منتظم مكافئ',
      q: 'فرق عزم الوسط', ref: 'نسبة', exact: null,
      got: (mUni / mTrp - 1) * 100, unit: '%',
      note: 'الحمل المنتظم المكافئ يعطي عزماً أكبر بهذه النسبة رغم تساوي الحمل الكلّي',
      src: 'أثر شكل الحمل' });

    /* ─── المجموعة ٨: الاستمرارية والإطار ─── */
    var g8 = 'الاستمرارية والإطارات';
    f = new Frame({ cases: ['DEAD'], gamma: 0 });
    var a5 = f.node(0, 0, 0), b5 = f.node(L, 0, 0), c5 = f.node(2 * L, 0, 0);
    var k1 = f.member(a5, b5, PB), k2 = f.member(b5, c5, PB);
    f.udl(k1, 'DEAD', { gz: -w }); f.udl(k2, 'DEAD', { gz: -w });
    f.support(a5, PIN); f.support(b5, PIN); f.support(c5, PIN); f.run();
    add(g8, 'جائز مستمر بفتحتين · حمل منتظم', 'M₃₃ عند الركيزة الوسطى', 'wL²/8',
      w * L * L / 8, Math.abs(f.stations(k1, 21, 'DEAD')[20].M33), 'Hibbeler Ex. 12-2');
    add(g8, 'جائز مستمر بفتحتين · حمل منتظم', 'M₃₃ الموجب بالفتحة', '9wL²/128',
      9 * w * L * L / 128,
      Math.abs(f.stations(k1, 33, 'DEAD')[Math.round(32 * 3 / 8)].M33),
      'Hibbeler Ex. 12-2');
    add(g8, 'جائز مستمر بفتحتين · حمل منتظم', 'رد الفعل الأوسط', '10wL/8',
      10 * w * L / 8, Math.abs(f.reactions.DEAD[b5][2]), 'Hibbeler Ex. 12-2');

    // عمود كابولي بحمل أفقي
    f = new Frame({ cases: ['DEAD'], gamma: 0 });
    var v0 = f.node(0, 0, 0), v1 = f.node(0, 0, L);
    f.member(v0, v1, PB); f.support(v0, FIX);
    f.load('DEAD', v1, [50, 0, 0, 0, 0, 0]); f.run();
    add(g8, 'عمود كابولي · قوة أفقية 50 kN', 'M₃₃ عند القاعدة', 'P·h',
      50 * L, Math.abs(f.stations(0, 3, 'DEAD')[0].M33), 'Hibbeler Ex. 4-3');
    add(g8, 'عمود كابولي · قوة أفقية 50 kN', 'إزاحة القمّة Δ', 'Ph³/3EI',
      50 * Math.pow(L, 3) / (3 * E * I33), Math.abs(f.nodeDisp(v1, 'DEAD')[0]),
      'AISC Table 3-23');

    /* حساب الخطأ.
       الحارس على NaN ضروري: `NaN >= 1e-8` تساوي false، فحالةٌ تُنتج NaN
       كانت تمرّ صامتةً وكأنها مضبوطة — وهي ثغرة في المِصفاة لا في المحرّك. */
    out.forEach(function (r) {
      if (r.exact === null) {
        r.err = null;
        if (!isFinite(r.got)) { r.err = Infinity; r.exact = 0; r.ref = 'قيمة غير عددية'; }
        return;
      }
      if (!isFinite(r.got) || !isFinite(r.exact)) { r.err = Infinity; return; }
      var d = Math.abs(r.got - r.exact);
      r.err = Math.abs(r.exact) > 1e-12 ? d / Math.abs(r.exact) * 100
            : (d < 1e-9 ? 0 : 100);
    });
    return out;
  }

  /** فحص الاتزان العام لأي نموذج محلول — مجموع ردود الأفعال = مجموع الأحمال. */
  function equilibrium(f, cs) {
    var R = [0, 0, 0, 0, 0, 0], sn, q, k;
    for (sn in f.reactions[cs]) for (q = 0; q < 6; q++) R[q] += f.reactions[cs][sn][q];
    var W = [0, 0, 0];
    for (k = 0; k < f.members.length; k++) {
      var m = f.members[k], L = f.cache[k].L, ww = m.w[cs];
      if (ww) {
        W[0] += (ww.gx || 0) * L; W[1] += (ww.gy || 0) * L; W[2] += (ww.gz || 0) * L;
        // المقاطع المتغيّرة خطّياً: محصّلتها = متوسّط الطرفين × الطول
        for (var si = 0; ww.segs && si < ww.segs.length; si++) {
          var g = ww.segs[si], dl = g.b - g.a;
          W[0] += (g.gxa + g.gxb) / 2 * dl;
          W[1] += (g.gya + g.gyb) / 2 * dl;
          W[2] += (g.gza + g.gzb) / 2 * dl;
        }
      }
      if (f.swCase === cs) W[2] -= f.swMult * m.rho * m.A * L;
    }
    var nlc = f.nl[cs] || {};
    for (var nd in nlc) for (q = 0; q < 3; q++) W[q] += nlc[nd][q];
    // المقياس المرجعي هو **أكبر حمل في النموذج** لا حمل المحور نفسه: بقيّةُ
    // تقريبٍ مقدارها 10⁻¹⁵ kN على محور حملُه صفر تعطي نسبة 100% لو قيست
    // بنفسها، وهي في الحقيقة صفر عدديّ.
    var ref = Math.max(Math.abs(W[0]), Math.abs(W[1]), Math.abs(W[2]),
                       Math.abs(R[0]), Math.abs(R[1]), Math.abs(R[2]), 1e-9);
    var e = [], nm = ['X', 'Y', 'Z'];
    for (q = 0; q < 3; q++)
      e.push({ axis: nm[q], load: W[q], reac: R[q],
               err: Math.abs(W[q] + R[q]) / ref, ref: ref });
    return e;
  }

  global.FEM3DVER = { run: run, equilibrium: equilibrium, props: props,
                      PIN: PIN, FIX: FIX, FREE: FREE };
})(typeof window !== 'undefined' ? window : globalThis);
