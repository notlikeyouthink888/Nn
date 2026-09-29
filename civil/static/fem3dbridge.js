/* ============================================================================
   fem3dbridge.js — جسر «معالج المشروع» ← «التحليل المتطور»

   يقرأ نتيجة معالج المشروع (WZ) ويحوّلها إلى نموذج إطار فراغي كامل.
   **قراءةٌ فقط**: لا يكتب في المعالج ولا يغيّر شيئاً من حالته، فالمعالج يبقى
   كما هو بالضبط.

   نقطتان دقيقتان، إغفال أيٍّ منهما يُضاعف حملاً أو يُسقطه:

     ١) `floor.D` الذي يحسبه المعالج يشمل **وزن البلاطة الذاتي** محسوباً لنوعها
        الحقيقي (الهوردي 310 مم وزنه 4.14 kN/m² لا 24×0.31 = 7.44، لأنه مفرّغ
        بالبلوك). فلا يصحّ أن يعيد محرّكُنا حسابه من السماكة: تُمرَّر سماكةُ
        البلاطة صفراً ويُمرَّر `floor.D` كاملاً كحمل مضاف.

     ٢) `floor.D` يشمل أيضاً بدلاً تقديرياً للجسور (`floor.beams` ≈ 1.5 kN/m²).
        ومحرّكنا يحسب وزن كل جسر وعمود **فعلياً** من γ·A، فيُطرح ذلك البدل
        وإلا حُسب وزن الجسور مرّتين.
   ========================================================================= */
(function (global) {
  'use strict';
  var F = global.FEM3D;
  if (!F) return;

  function num(v, d) { var x = parseFloat(v); return isFinite(x) ? x : d; }

  /** يحوّل نتيجة المعالج إلى إعدادات نموذج + سجلّ اشتقاق كل قيمة. */
  function fromWizard(WZ, opt) {
    if (!WZ || !WZ.grid) return null;
    opt = opt || {};
    var g = WZ.grid, inp = WZ.input || {}, m = WZ.model || {},
        fl = WZ.floor || {}, sq = WZ.seismic || {}, bm = WZ.beams || {};

    var sx = (g.spans_x && g.spans_x.length) ? g.spans_x.slice() : null;
    var sy = (g.spans_y && g.spans_y.length) ? g.spans_y.slice() : null;
    var ns = Math.max(1, Math.round(num(m.floors, num(inp.floors, 1))));
    var hs = num(inp.story_h, 3.2);

    var bX = bm.x || {}, bY = bm.y || bX, col = m.col || {};
    var gamma = num(opt.gamma, 24);

    // (١) و (٢): وزن البلاطة الحقيقي داخل D، وبدل الجسور يُطرح
    var beamAllow = num(fl.beams, 0);
    var sdl = Math.max(0, num(fl.D, 0) - beamAllow);
    var ll = num(fl.L, 2);

    var V = num(sq.V, 0);

    var cfg = {
      spansX: sx, spansY: sy,
      nx: sx ? sx.length : num(g.nx, 3), ny: sy ? sy.length : num(g.ny, 3),
      sx: num(g.sx, 5), sy: num(g.sy, 5),
      ns: ns, hs: hs,
      fc: num(inp.fc, 28), fy: num(inp.fy, 420), gamma: gamma,
      ts: 0,                      // وزن البلاطة مُدرَجٌ في sdl (انظر النقطة ١)
      sdl: sdl, ll: ll,
      bbX: num(bX.b, 300) / 1000, bhX: num(bX.h, 600) / 1000,
      bbY: num(bY.b, 300) / 1000, bhY: num(bY.h, 600) / 1000,
      cb: num(col.b, 300) / 1000, ch: num(col.h, 400) / 1000,
      eqX: opt.eqX !== undefined ? opt.eqX : V,
      eqY: opt.eqY !== undefined ? opt.eqY : V,
      qa: num(inp.qa, 150),
      cracked: opt.cracked !== false,
      shear: opt.shear !== false,
      diaph: opt.diaph !== false,
      base: opt.base || 'fix',
      rz: num(opt.rz, 0),
      loadDist: opt.loadDist || 'tributary45'
    };

    /* سجلّ الاشتقاق: من أين جاءت كل قيمة، لتُعرض بالواجهة بلا تخمين */
    var src = g.source === 'frame' || g.source === 'plan'
      ? 'مستخرَجة من مخطط المستخدم (DWG/DXF)'
      : 'شبكة تلقائية من المساحة';
    var deriv = [
      ['مصدر الشبكة', src,
        cfg.nx + ' × ' + cfg.ny + ' بحر', '', 'معالج المشروع → grid.source'],
      ['بحور X', (sx || []).map(function (v) { return v.toFixed(2); }).join(' · ') || '—',
        cfg.nx + ' بحر', 'م', 'grid.spans_x'],
      ['بحور Y', (sy || []).map(function (v) { return v.toFixed(2); }).join(' · ') || '—',
        cfg.ny + ' بحر', 'م', 'grid.spans_y'],
      ['الطوابق وارتفاعها', 'model.floors × input.story_h',
        ns + ' × ' + hs.toFixed(2), 'م', 'معالج المشروع'],
      ['مقطع جسر X', 'beams.x',
        Math.round(cfg.bbX * 1000) + ' × ' + Math.round(cfg.bhX * 1000), 'مم', 'تصميم المعالج'],
      ['مقطع جسر Y', 'beams.y',
        Math.round(cfg.bbY * 1000) + ' × ' + Math.round(cfg.bhY * 1000), 'مم', 'تصميم المعالج'],
      ['مقطع العمود', 'model.col',
        Math.round(cfg.cb * 1000) + ' × ' + Math.round(cfg.ch * 1000), 'مم', 'تصميم المعالج'],
      ['الحمل الميت على البلاطة', 'floor.D − floor.beams = '
        + num(fl.D, 0).toFixed(3) + ' − ' + beamAllow.toFixed(3),
        sdl.toFixed(3), 'kN/m²',
        'بدل الجسور يُطرح لأن المحرّك يحسب وزنها فعلياً من γ·A'],
      ['الحمل الحي', 'floor.L حسب الإشغال «' + (inp.use || '—') + '»',
        ll.toFixed(3), 'kN/m²', 'الكود العراقي للأحمال'],
      ['وزن البلاطة الذاتي', 'مُدرَج ضمن السطر أعلاه (نوعها: '
        + (fl.slab_type || '—') + ' سماكة ' + num(fl.slab, 0).toFixed(0) + ' مم)',
        num(fl.slab_sw, 0).toFixed(3), 'kN/m²',
        'لا يُعاد حسابه من السماكة: البلاطة المفرّغة أخفّ من γ·t'],
      ['وزن الجسور والأعمدة', 'γ · A لكل عنصر على حدة', 'تلقائي', 'kN/m',
        'يُضاف للحالة DEAD بمعامل 1.0 — مطابق ETABS'],
      ['قصّ القاعدة الزلزالي', 'V = Cs · W = ' + num(sq.Cs, 0).toFixed(5)
        + ' × ' + num(sq.W, 0).toFixed(0), V.toFixed(1), 'kN',
        'ASCE 7 · ' + (sq.city || '') + ' · R = ' + num(sq.R, 0)],
      ['تحمّل التربة المسموح', 'input.qa (' + (inp.soil || '—') + ')',
        cfg.qa.toFixed(0), 'kPa', 'تصميم الأساسات']
    ];

    return { cfg: cfg, deriv: deriv, source: g.source, seismic: sq, wz: WZ };
  }

  /** يقارن عزوم المحرّك المصفوفي بعزوم المعالج المبسّطة على نفس الجسر.
      المعالج يستعمل معاملات ACI التقريبية للجائز المستمر؛ المحرّك يحلّ الإطار
      الفراغي كاملاً. الفرق بينهما هو ما يضيفه التحليل المتطور فعلاً. */
  function compareMoments(WZ, f, combos) {
    if (!WZ || !WZ.beams || !f) return null;
    var out = [];
    ['x', 'y'].forEach(function (d) {
      var b = WZ.beams[d];
      if (!b || !b.env || !b.env.length) return;
      // غلاف المعالج: قائمة من المقاطع، كل مقطع قائمة محطّات
      var wzMax = 0, wzMin = 0;
      b.env.forEach(function (span) {
        (span || []).forEach(function (s) {
          if (s.Mmax > wzMax) wzMax = s.Mmax;
          if (s.Mmin < wzMin) wzMin = s.Mmin;
        });
      });
      /* غلاف المحرّك على الجسور بنفس الاتجاه — عند **المحور** وعند **الوجه**
         كلٌّ على حدة، ليفصل القارئ أثر القراءة عند الوجه عن بقية الأسباب. */
      var cMax = 0, fMax = 0, tag = '', wTot = 0, nb = 0, wPeak = 0;
      f.members.forEach(function (m, k) {
        if (m.kind !== 'beam' || m.dir !== d) return;
        nb++;
        var c = f.cache[k], e = f.envelope(k, 41, combos);
        var xi = m.offI, xj = c.L - m.offJ;
        e.forEach(function (s) {
          var v = Math.max(Math.abs(s.M33max), Math.abs(s.M33min));
          if (v > cMax) { cMax = v; tag = m.tag; }
          if (s.x >= xi - 1e-9 && s.x <= xj + 1e-9 && v > fMax) fMax = v;
        });
        // شدّة الحمل الميت القصوى على هذا الجسر (لمقارنة التوزيع)
        var segs = f.wloc.DEAD[k];
        segs.forEach(function (g) {
          wPeak = Math.max(wPeak, Math.abs(g.w2a || 0), Math.abs(g.w2b || 0));
          wTot += (Math.abs(g.w2a || 0) + Math.abs(g.w2b || 0)) / 2 * (g.b - g.a);
        });
      });
      out.push({ dir: d, wzMax: wzMax, wzMin: wzMin,
                 cMax: cMax, fMax: fMax, tag: tag,
                 wAvg: nb ? wTot / nb : 0, wPeak: wPeak, nb: nb,
                 b: b.b, h: b.h });
    });
    return out;
  }

  global.FEM3DBRIDGE = { fromWizard: fromWizard, compareMoments: compareMoments };
})(typeof window !== 'undefined' ? window : globalThis);
