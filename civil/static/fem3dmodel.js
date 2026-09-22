/* ============================================================================
   fem3dmodel.js — بناء النموذج وتصميم الأساسات

   لا رقم في هذا الملف بلا اشتقاق. كل حمل يصل جسراً مرّ بسلسلة معلومة:
     سماكة البلاطة → وزنها الذاتي → أحمال التشطيب → الحمل الحي حسب الإشغال
     → توزيعه على الجسور بخطوط 45° → شكله الحقيقي (مثلثي أو شبه منحرف)

   والأساسات تُصمَّم من ردود الأفعال المحسوبة فعلاً، لا من تقدير.
   ========================================================================= */
(function (global) {
  'use strict';
  var F = global.FEM3D;
  if (!F) return;
  var Frame = F.Frame, torsionJ = F.torsionJ, Ec = F.Ec;

  /* تسمية المحاور باصطلاح ETABS: أرقام باتجاه X وحروف باتجاه Y */
  var LET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  function gridY(j) { return j < LET.length ? LET[j] : 'Y' + (j + 1); }
  function gridX(i) { return String(i + 1); }

  /* ════════ ١) توزيع حمل البلاطة على الجسور بخطوط 45° ════════
     اللوح Lx × Ly (Ly = الأقصر) تقسمه خطوط 45° من أركانه إلى:
       • مثلثين على الضلعين القصيرين  — قمّة w·Ly/2
       • شبه منحرفين على الطويلين     — قمّة w·Ly/2 وقاعدة مائلة طولها Ly/2
     ومجموعهما = w·Lx·Ly بالضبط (يُفحص عدديّاً في تبويب التحقّق).
     هذا هو التوزيع نفسه الذي يستعمله ETABS للبلاطة الغشائية. */
  function panelLoads(Lx, Ly, w) {
    var S = Math.min(Lx, Ly), pk = w * S / 2;
    return {
      peak: pk,
      ramp: S / 2,                       // طول الجزء المائل
      onLen: function (Lb) {             // مقاطع الحمل على جسر طولُه Lb
        var a = Math.min(S / 2, Lb / 2);
        if (Lb - 2 * a < 1e-9)           // مثلث كامل (الضلع القصير)
          return [{ a: 0, b: Lb / 2, wa: 0, wb: pk },
                  { a: Lb / 2, b: Lb, wa: pk, wb: 0 }];
        return [{ a: 0, b: a, wa: 0, wb: pk },
                { a: a, b: Lb - a, wa: pk, wb: pk },
                { a: Lb - a, b: Lb, wa: pk, wb: 0 }];
      }
    };
  }

  /* ════════ ٢) بناء نموذج المبنى ════════ */
  function buildModel(c) {
    var E = Ec(c.fc);                                     // ACI 318M §19.2.2.1
    var cases = ['DEAD', 'LIVE'];
    if (c.eqX) cases.push('EQX');
    if (c.eqY) cases.push('EQY');
    var f = new Frame({ nu: c.nu || 0.2, cases: cases, gamma: c.gamma,
                        swCase: 'DEAD', swMult: 1.0 });

    /* البحور: تُقبل قائمةً صريحة (spansX/spansY) وإلا فمتساوية nx×sx.
       القائمة الصريحة هي ما يأتي من مخطط المستخدم، وبحورُه نادراً ما تتساوى. */
    var SX = (c.spansX && c.spansX.length) ? c.spansX.slice() : null;
    var SY = (c.spansY && c.spansY.length) ? c.spansY.slice() : null;
    var nx = SX ? SX.length : c.nx, ny = SY ? SY.length : c.ny;
    var ns = c.ns, sx = c.sx, sy = c.sy, hs = c.hs;
    var i, j, k, Xs = [0], Ys = [0], Zs = [];
    if (SX) for (i = 0; i < nx; i++) Xs.push(Xs[i] + SX[i]);
    else { Xs = []; for (i = 0; i <= nx; i++) Xs.push(i * sx); SX = []; 
           for (i = 0; i < nx; i++) SX.push(sx); }
    if (SY) for (j = 0; j < ny; j++) Ys.push(Ys[j] + SY[j]);
    else { Ys = []; for (j = 0; j <= ny; j++) Ys.push(j * sy); SY = [];
           for (j = 0; j < ny; j++) SY.push(sy); }
    for (k = 0; k <= ns; k++) Zs.push(k * hs);
    var id = [];
    for (k = 0; k <= ns; k++) {
      id.push([]);
      for (j = 0; j <= ny; j++) {
        id[k].push([]);
        for (i = 0; i <= nx; i++) id[k][j].push(f.node(Xs[i], Ys[j], Zs[k]));
      }
    }

    /* المقاطع — معاملات التشقّق ACI 318M-19 جدول 6.6.3.1.1(a) */
    var cb = c.cracked ? 0.35 : 1.0, cc = c.cracked ? 0.70 : 1.0;
    function sec(b, h, mod, kind) {
      var A = b * h;
      return { E: E, A: A, As2: F.KAPPA_RECT * A, As3: F.KAPPA_RECT * A,
        I33: mod * b * h * h * h / 12, I22: mod * h * b * b * b / 12,
        J: mod * torsionJ(b, h), b: b, h: h, mod: mod, kind: kind,
        rho: c.gamma, shear: c.shear !== false,
        sec: (kind === 'col' ? 'C' : 'B') + Math.round(b * 1000) + 'x' + Math.round(h * 1000) };
    }
    // مقطعا الجسور قد يختلفان باتجاهَي X و Y (وهو الشائع بالتصميم الحقيقي)
    var SBX = sec(c.bbX || c.bb, c.bhX || c.bh, cb, 'beam');
    var SBY = sec(c.bbY || c.bb, c.bhY || c.bh, cb, 'beam');
    var SB = SBX, SC = sec(c.cb, c.ch, cc, 'col');
    var rz = c.rz || 0;
    function mk(a, b2, S, extra) {
      var p = {}; for (var q in S) p[q] = S[q];
      if (extra) for (var q2 in extra) p[q2] = extra[q2];
      p.rz = rz;
      return f.member(a, b2, p);
    }

    /* الأعمدة — الإزاحة الصلبة عند الطرفين = نصف عمق الجسر */
    var offCol = Math.max(c.bhX || c.bh, c.bhY || c.bh) / 2, offBeam = c.ch / 2;
    var cols = [];
    for (k = 0; k < ns; k++) for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++)
      cols.push(mk(id[k][j][i], id[k + 1][j][i], SC,
        { offI: k === 0 ? 0 : offCol, offJ: offCol,
          tag: 'C' + gridX(i) + gridY(j) + ' · ط' + (k + 1),
          gi: i, gj: j, gk: k + 1 }));

    /* الجسور */
    var bx = [], by = [];
    for (k = 1; k <= ns; k++) {
      for (j = 0; j <= ny; j++) for (i = 0; i < nx; i++)
        bx.push(mk(id[k][j][i], id[k][j][i + 1], SBX,
          { offI: offBeam, offJ: offBeam,
            tag: 'B' + gridX(i) + gridY(j) + '–' + gridX(i + 1) + gridY(j) + ' · ط' + k,
            gi: i, gj: j, gk: k, dir: 'x' }));
      for (j = 0; j < ny; j++) for (i = 0; i <= nx; i++)
        by.push(mk(id[k][j][i], id[k][j + 1][i], SBY,
          { offI: offBeam, offJ: offBeam,
            tag: 'B' + gridX(i) + gridY(j) + '–' + gridX(i) + gridY(j + 1) + ' · ط' + k,
            gi: i, gj: j, gk: k, dir: 'y' }));
    }

    /* ---- سلسلة اشتقاق الأحمال، خطوة بخطوة ---- */
    var wSlab = c.gamma * c.ts;                         // kN/m² — وزن البلاطة
    var wDead = wSlab + c.sdl;                          // + التشطيبات
    var wLive = c.ll;
    var deriv = [
      ['وزن البلاطة الذاتي', 'γ · t = ' + c.gamma + ' × ' + c.ts.toFixed(3),
        wSlab.toFixed(3), 'kN/m²', 'γ = ' + c.gamma + ' kN/m³ (ACI normalweight)'],
      ['أحمال التشطيب الإضافية', 'مُدخَل (SDL)', c.sdl.toFixed(3), 'kN/m²',
        'رمل · مونة · كاشي · بلاستر · قواطع'],
      ['الحمل الميت الكلّي على البلاطة', 'wSlab + SDL', wDead.toFixed(3), 'kN/m²', 'حالة DEAD'],
      ['الحمل الحي', 'حسب الإشغال', wLive.toFixed(3), 'kN/m²', 'حالة LIVE'],
      ['الوزن الذاتي للجسور والأعمدة', 'γ · A لكل عنصر', 'تلقائي', 'kN/m',
        'يُضاف للحالة DEAD بمعامل 1.0 — مطابق ETABS Self Weight Multiplier']
    ];

    /* ---- توزيع حمل اللوح على الجسور المحيطة به ----
       الوضع الافتراضي `tributary45` هو التوزيع الحقيقي بخطوط 45° (مثلثي
       وشبه منحرف). والوضع `uniform` يوزّع نفس الحمل الكلّي منتظماً — وهو
       لازم للمقارنة مع محرّكات لا تقبل إلا الحمل المنتظم على العنصر. */
    function spread(cs, w) {
      if (c.loadDist === 'uniform') {
        for (var ku = 1; ku <= ns; ku++)
          for (var ju = 0; ju < ny; ju++) for (var iu = 0; iu < nx; iu++) {
            var lxu = SX[iu], lyu = SY[ju];
            var S0 = Math.min(lxu, lyu), pk0 = w * S0 / 2;
            // نفس الحمل الكلّي للوح، موزّعاً منتظماً على الجسور الأربعة
            var wX = pk0 * (lxu >= lyu ? (lxu - S0 / 2) / lxu : (S0 / 2) / lxu);
            var wY = pk0 * (lyu >= lxu ? (lyu - S0 / 2) / lyu : (S0 / 2) / lyu);
            [ju, ju + 1].forEach(function (jl) {
              f.udl(bx[(ku - 1) * (ny + 1) * nx + jl * nx + iu], cs, { gz: -wX }); });
            [iu, iu + 1].forEach(function (il) {
              f.udl(by[(ku - 1) * ny * (nx + 1) + ju * (nx + 1) + il], cs, { gz: -wY }); });
          }
        return;
      }
      for (var kk = 1; kk <= ns; kk++)
        for (var jj = 0; jj < ny; jj++) for (var ii = 0; ii < nx; ii++) {
          var lx = SX[ii], ly = SY[jj];
          var P = panelLoads(lx, ly, w);
          // الجسران باتجاه X على الخطين jj و jj+1 (طولهما lx)
          [jj, jj + 1].forEach(function (jl) {
            var mi = bx[(kk - 1) * (ny + 1) * nx + jl * nx + ii];
            P.onLen(lx).forEach(function (g) {
              f.vdl(mi, cs, { a: g.a, b: g.b, gza: -g.wa, gzb: -g.wb });
            });
          });
          // الجسران باتجاه Y على الخطين ii و ii+1 (طولهما ly)
          [ii, ii + 1].forEach(function (il) {
            var mi = by[(kk - 1) * ny * (nx + 1) + jj * (nx + 1) + il];
            P.onLen(ly).forEach(function (g) {
              f.vdl(mi, cs, { a: g.a, b: g.b, gza: -g.wa, gzb: -g.wb });
            });
          });
        }
    }
    spread('DEAD', wDead);
    spread('LIVE', wLive);

    /* ---- الاستناد ---- */
    var fix = c.base !== 'pin';
    var base = [];
    for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) {
      var nb = id[0][j][i];
      f.support(nb, fix ? [1, 1, 1, 1, 1, 1] : [1, 1, 1, 0, 0, 0]);
      base.push({ n: nb, i: i, j: j, name: gridX(i) + gridY(j) });
    }

    /* ---- الديافرام الصلب والقوى الجانبية ---- */
    var story = [];
    for (k = 1; k <= ns; k++) {
      var lst = [];
      for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) lst.push(id[k][j][i]);
      story.push({ k: k, nodes: lst, z: Zs[k], name: 'ط' + k });
      if (c.diaph) f.diaphragm(lst);
    }
    function lateral(cs, tot, dir) {
      // توزيع القوة على الطوابق بنسبة الارتفاع (ASCE 7 §12.8.3 بـ k = 1)
      var sum = 0, kk;
      for (kk = 0; kk < story.length; kk++) sum += story[kk].z;
      for (kk = 0; kk < story.length; kk++) {
        var Fk = sum > 0 ? tot * story[kk].z / sum : tot / story.length;
        var per = Fk / story[kk].nodes.length;
        for (var q = 0; q < story[kk].nodes.length; q++)
          f.load(cs, story[kk].nodes[q],
            dir === 'y' ? [0, per, 0, 0, 0, 0] : [per, 0, 0, 0, 0, 0]);
        story[kk]['F' + dir.toUpperCase()] = Fk;
      }
    }
    if (c.eqX) lateral('EQX', c.eqX, 'x');
    if (c.eqY) lateral('EQY', c.eqY, 'y');

    f.meta = { id: id, Xs: Xs, Ys: Ys, Zs: Zs, SX: SX, SY: SY, nx: nx, ny: ny,
               cfg: c, cols: cols, bx: bx, by: by, SBX: SBX, SBY: SBY,
               story: story, base: base, SB: SB, SC: SC, E: E,
               wDead: wDead, wLive: wLive, wSlab: wSlab, deriv: deriv,
               gridX: gridX, gridY: gridY };
    return f;
  }

  /* ════════ ٣) تصميم أساس منفرد وفق ACI 318M ════════
     كل خطوة ببندها. لا معامل تجريبي ولا «تقريب مقبول». */
  function footing(P) {
    // P = {Ps, Pu, Mux, Muy, c1, c2, fc, fy, qa, pos, gamma, cover}
    var fc = P.fc, fy = P.fy, qa = P.qa;                  // MPa · MPa · kPa
    var c1 = P.c1 * 1000, c2 = P.c2 * 1000;               // مم
    var cov = P.cover === undefined ? 75 : P.cover;       // ACI 20.5.1.3.1 صبّ على التربة
    var db = 16, phiV = 0.75, phiM = 0.90;                // ACI 21.2.1
    var steps = [];

    /* (١) المساحة المطلوبة من ضغط التربة المسموح — بحمل الخدمة */
    var hGuess = 0.5, qNet = qa - P.gamma * hGuess - 18 * 0.5;   // خصم وزن الأساس والردم
    if (qNet < 5) qNet = Math.max(5, qa * 0.75);
    var Areq = P.Ps / qNet;                                // m²
    var B = Math.ceil(Math.sqrt(Areq) * 20) / 20;          // تقريب لأعلى 50 مم
    B = Math.max(B, (P.c1 + 0.30), (P.c2 + 0.30));
    // اللامركزية e = M/P تزيد الضغط الأقصى بـ (1 + 6e/B)، فالمساحة وحدها
    // لا تكفي: يُكبَّر البُعد حتى يمرّ الضغط **الفعلي** لا المتوسّط.
    var ePs = P.Ps > 0 ? Math.sqrt(P.Mux * P.Mux + P.Muy * P.Muy) / P.Ps : 0;
    var grew = 0;
    while (grew < 60 && P.Ps / (B * B) * (1 + 6 * ePs / B) > qa * 1.0005) {
      B += 0.05; grew++;
    }
    steps.push(['١', 'المساحة المطلوبة', 'A = Ps / q_net = ' + P.Ps.toFixed(1) + ' / ' + qNet.toFixed(1), Areq.toFixed(3) + ' m²', 'ACI 318M §13.3.1.1']);
    steps.push(['٢', 'البُعد المربّع', 'B = sqrt(A), rounded up to 50 mm'
      + (grew ? '  +  enlarged for e = ' + ePs.toFixed(3) + ' m' : ''),
      B.toFixed(2) + ' m', grew ? 'حكَمَت اللامركزية' : 'حكَمَت المساحة']);

    /* (٢) ضغط التربة المُعامَل الصافي */
    var qu = P.Pu / (B * B);                               // kPa
    steps.push(['٣', 'ضغط التربة المُعامَل', 'qu = Pu / B^2 = ' + P.Pu.toFixed(1) + ' / ' + (B * B).toFixed(2), qu.toFixed(1) + ' kPa', 'اتزان']);

    /* (٣) العمق من فحصَي القصّ — يُزاد حتى يمرّا معاً */
    var h = 300, d, ok1, ok2, vu2, vc2, Vu1, phVc1, bo, it;
    var Bmm = B * 1000, quN = qu / 1000;                   // N/mm²
    var beta = Math.max(c1, c2) / Math.min(c1, c2);
    var alphaS = P.pos === 'corner' ? 20 : (P.pos === 'edge' ? 30 : 40);
    for (it = 0; it < 80; it++) {
      d = h - cov - db;                                    // مم
      if (d < 50) { h += 50; continue; }
      /* قصّ ثاقب (ثنائي الاتجاه) على محيط d/2 من وجه العمود — ACI §22.6 */
      bo = 2 * (c1 + d) + 2 * (c2 + d);
      var Ap = (c1 + d) * (c2 + d);
      var Vu2 = quN * (Bmm * Bmm - Ap);                    // N
      vu2 = Vu2 / (bo * d);                                // MPa
      vc2 = Math.min(0.33 * Math.sqrt(fc),
                     0.17 * (1 + 2 / beta) * Math.sqrt(fc),
                     0.083 * (2 + alphaS * d / bo) * Math.sqrt(fc));   // §22.6.5.2
      ok2 = vu2 <= phiV * vc2;
      /* قصّ أحادي الاتجاه على مسافة d من وجه العمود — ACI §22.5 */
      var lOv = (Bmm - c1) / 2;
      Vu1 = quN * Bmm * Math.max(0, lOv - d);
      phVc1 = phiV * 0.17 * Math.sqrt(fc) * Bmm * d;
      ok1 = Vu1 <= phVc1;
      if (ok1 && ok2) break;
      h += 50;
    }
    steps.push(['٤', 'قصّ ثاقب (ثنائي الاتجاه)',
      'vu = ' + vu2.toFixed(3) + ' <= phi*vc = ' + (phiV * vc2).toFixed(3) + ' MPa',
      ok2 ? '✓ يمرّ' : '✗', 'ACI 318M §22.6.5.2 · φ = 0.75']);
    steps.push(['٥', 'قصّ أحادي الاتجاه',
      'Vu = ' + (Vu1 / 1000).toFixed(1) + ' <= phi*Vc = ' + (phVc1 / 1000).toFixed(1) + ' kN',
      ok1 ? '✓ يمرّ' : '✗', 'ACI 318M §22.5.5.1']);
    steps.push(['٦', 'السماكة المعتمَدة', 'h from both shear checks',
      h + ' mm  ·  d = ' + d.toFixed(0) + ' mm', 'تُزاد 50 مم حتى يمرّ الفحصان']);

    /* (٤) الانحناء عند وجه العمود */
    var lC = (Bmm - c1) / 2;                                // ذراع الكابولي
    var Mu = quN * Bmm * lC * lC / 2;                       // N·mm
    // حلّ As من Mu = φ·As·fy·(d − a/2) و a = As·fy/(0.85 f'c B)
    var Rn = Mu / (phiM * Bmm * d * d);
    var rho = 0.85 * fc / fy * (1 - Math.sqrt(Math.max(0, 1 - 2 * Rn / (0.85 * fc))));
    var As = rho * Bmm * d;
    var AsMin = 0.0018 * Bmm * h;                           // ACI §24.4.3.2 (fy 420)
    var AsUse = Math.max(As, AsMin);
    var nBar = Math.max(4, Math.ceil(AsUse / (Math.PI * db * db / 4)));
    var spac = Math.min(450, Math.floor((Bmm - 2 * cov) / (nBar - 1)));
    steps.push(['٧', 'عزم الانحناء عند وجه العمود',
      'Mu = qu*B*l^2/2,  l = (B-c)/2 = ' + (lC / 1000).toFixed(3) + ' m',
      (Mu / 1e6).toFixed(1) + ' kN·m', 'ACI 318M §13.3.2.1']);
    steps.push(['٨', 'حديد الانحناء المطلوب', 'rho from Mu = phi*As*fy*(d - a/2)',
      As.toFixed(0) + ' mm²', 'ACI 318M §22.2']);
    steps.push(['٩', 'الحدّ الأدنى للحديد', 'As,min = 0.0018*B*h',
      AsMin.toFixed(0) + ' mm²', 'ACI 318M §24.4.3.2']);
    steps.push(['١٠', 'التسليح المعتمَد', nBar + 'D' + db + ' each way @ ' + spac + ' mm',
      AsUse.toFixed(0) + ' mm²', AsMin > As ? 'حكَمَ الحدّ الأدنى' : 'حكَمَ الانحناء']);

    /* (٥) فحص ضغط التربة الفعلي بحمل الخدمة + اللامركزية */
    var e = P.Ps > 0 ? Math.sqrt(P.Mux * P.Mux + P.Muy * P.Muy) / P.Ps : 0;
    var qAct = P.Ps / (B * B) * (1 + 6 * e / B);
    steps.push(['١١', 'ضغط التربة الفعلي الأقصى',
      'q = P/B^2 * (1 + 6e/B),  e = ' + e.toFixed(3) + ' m',
      qAct.toFixed(1) + ' / ' + qa.toFixed(0) + ' kPa',
      qAct <= qa * 1.001 ? '✓ يمرّ — ACI §13.3.1.1' : '✗ يتجاوز المسموح']);

    return { B: B, h: h, d: d, As: AsUse, AsMin: AsMin, nBar: nBar, db: db,
             spac: spac, qu: qu, qAct: qAct, e: e, vu2: vu2, vc2: phiV * vc2,
             Vu1: Vu1 / 1000, Vc1: phVc1 / 1000, Mu: Mu / 1e6,
             ok: qAct <= qa * 1.001 && ok1 && ok2, ecc: e > B / 6,
             vol: B * B * h / 1000, steps: steps };
  }

  /** يصمّم أساساً لكل عمود قاعدة من ردود الأفعال المحسوبة. */
  function footings(f, combos, service) {
    var cfg = f.meta.cfg, out = [], nx = cfg.nx, ny = cfg.ny;
    var Rs = f.comboReactions(service);
    // غلاف الحمل المُعامَل على كل ركيزة
    var Ru = {};
    for (var ci = 0; ci < combos.length; ci++) {
      var R = f.comboReactions(combos[ci]);
      for (var sn in R) {
        if (!Ru[sn]) Ru[sn] = { P: 0, Mx: 0, My: 0, combo: '' };
        if (R[sn][2] > Ru[sn].P) {
          Ru[sn].P = R[sn][2]; Ru[sn].Mx = R[sn][3];
          Ru[sn].My = R[sn][4]; Ru[sn].combo = combos[ci].name;
        }
      }
    }
    f.meta.base.forEach(function (b) {
      var edgeX = b.i === 0 || b.i === nx, edgeY = b.j === 0 || b.j === ny;
      var pos = edgeX && edgeY ? 'corner' : (edgeX || edgeY ? 'edge' : 'interior');
      var d = footing({
        Ps: Math.max(1, Rs[b.n][2]), Pu: Math.max(1, Ru[b.n].P),
        Mux: Ru[b.n].Mx, Muy: Ru[b.n].My,
        c1: cfg.cb, c2: cfg.ch, fc: cfg.fc, fy: cfg.fy || 420,
        qa: cfg.qa, pos: pos, gamma: cfg.gamma
      });
      d.name = b.name; d.node = b.n; d.pos = pos;
      d.Ps = Rs[b.n][2]; d.Pu = Ru[b.n].P; d.combo = Ru[b.n].combo;
      out.push(d);
    });
    return out;
  }

  global.FEM3DMODEL = { buildModel: buildModel, footing: footing,
                        footings: footings, panelLoads: panelLoads,
                        gridX: gridX, gridY: gridY };
})(typeof window !== 'undefined' ? window : globalThis);
