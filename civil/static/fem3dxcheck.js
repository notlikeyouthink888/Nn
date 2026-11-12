/* ============================================================================
   fem3dxcheck.js — التحقّق المتبادل مع OpenSees

   OpenSees محرّك العناصر المحدّدة المفتوح المصدر من مركز PEER بجامعة كاليفورنيا
   – بيركلي. هو المرجع المعتمَد في أبحاث الهندسة الزلزالية المحكَّمة، وتُقارَن به
   البرامج التجارية نفسها.

   يُبنى هنا **نفس المنشأ** في المحرّكين — نفس العقد والمقاطع والخواصّ والأحمال
   وشروط الاستناد — ثم تُقارَن الإزاحات وقوى أطراف العناصر وردود الأفعال حدّاً
   بحدّ. وأدقّ ما في المطابقة اصطلاحُ المحاور: يُمرَّر لـ geomTransf متّجهُ
   vecxz الذي يجعل محاور OpenSees المحلّية مطابقةً لمحاورنا، وإلا تبادلت
   I₂₂ و I₃₃ وخرجت المقارنة بلا معنى.

   ثلاثة فروق **اصطلاحية** لا يصحّ إغفالها، ولذلك تُجرى المقارنة على وجهين:

     ١) OpenSees مع `-jntOffset` يسلّط حمل العنصر على **الطول المرن فقط**،
        فيفقد w·(ra+rb) من كل جسر. محرّكنا يسلّطه على الطول الفيزيائي كاملاً
        وينقل حصّة المنطقة الصلبة إلى العقدتين — فيحفظ الحمل الكلّي، وهو ما
        يفعله ETABS ويثبته فحص الاتزان. لذلك تُقارَن حالة الجاذبية بإزاحات
        صلبة صفرية.

     ٢) مع الإزاحات الصلبة يقرأ OpenSees قوى الأطراف عند **طرفَي الجزء المرن**
        لا عند العقدتين، فتُقرأ قيمُنا عند الموضعين نفسيهما.

     ٣) عنصر `ElasticTimoshenkoBeam` في OpenSees **يهمل الإزاحات الصلبة**:
        باختبار كابولي بإزاحة صلبة عند الطرفين يعطي ترخيماً **أقلّ** عند
        تفعيل القصّ، وهو ناتج غير فيزيائي (مرونة القصّ لا تزيد الصلابة).
        الحلّ المغلق يطابق محرّكنا ويخالف OpenSees في هذه الحالة وحدها،
        ولها بند خاصّ في تبويب التحقّق المغلق.
   ========================================================================= */
(function (global) {
  'use strict';
  var F = global.FEM3D, M = global.FEM3DMODEL;
  if (!F || !M) return;

  function post(spec) {
    return fetch('/api/opensees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec)
    }).then(function (r) { return r.json(); });
  }

  /** قوى الأطراف عند طرفَي الجزء المرن — الموضع الذي يقرأ عنده OpenSees
      حين تُعرَّف إزاحات صلبة. عند غيابها تُرجَع قوى العقدتين كما هي. */
  function forcesAtFlexEnds(f, k, cs) {
    var c = f.cache[k];
    if (c.ra < 1e-12 && c.rb < 1e-12) return f.mf[cs][k];
    var a = f.at(k, c.ra, cs), b = f.at(k, c.L - c.rb, cs);
    return [-a.N, -a.V2, -a.V3, -a.T, -a.M22, a.M33,
            b.N, b.V2, b.V3, b.T, b.M22, -b.M33];
  }

  function diff(f, cs, R, flex) {
    var dRef = 0, fRef = 0, rRef = 0, n, q, k, sn;
    for (n = 0; n < R.disp.length; n++) for (q = 0; q < 6; q++)
      dRef = Math.max(dRef, Math.abs(R.disp[n][q]));
    for (k = 0; k < R.forces.length; k++) for (q = 0; q < 12; q++)
      fRef = Math.max(fRef, Math.abs(R.forces[k][q]));
    for (sn in R.reactions) for (q = 0; q < 6; q++)
      rRef = Math.max(rRef, Math.abs(R.reactions[sn][q]));
    var eD = 0, eF = 0, eR = 0, wF = null;
    for (n = 0; n < f.nodes.length; n++) {
      var d = f.nodeDisp(n, cs);
      for (q = 0; q < 6; q++)
        eD = Math.max(eD, Math.abs(d[q] - R.disp[n][q]) / Math.max(dRef, 1e-14));
    }
    for (k = 0; k < f.members.length; k++) {
      var mine = flex ? forcesAtFlexEnds(f, k, cs) : f.mf[cs][k];
      for (q = 0; q < 12; q++) {
        var e = Math.abs(mine[q] - R.forces[k][q]) / Math.max(fRef, 1e-14);
        if (e > eF) { eF = e; wF = { tag: f.members[k].tag, q: q,
          mine: mine[q], os: R.forces[k][q] }; }
      }
    }
    for (sn in f.reactions[cs]) for (q = 0; q < 6; q++)
      eR = Math.max(eR, Math.abs(f.reactions[cs][sn][q] - R.reactions[sn][q])
        / Math.max(rRef, 1e-14));
    return { eD: eD, eF: eF, eR: eR, worst: wF,
             nodes: f.nodes.length, members: f.members.length, neq: f.neq };
  }

  /** يبني الوجهين القابلين للمقارنة من إعدادات النموذج الحالي ويقارنهما. */
  function run(cfg, onStep) {
    var runs = [];
    // الوجه الأول: الجاذبية — حمل منتظم على العنصر، بلا إزاحات صلبة
    runs.push({ key: 'grav', name: 'الجاذبية (ميت + حي) — حمل موزّع على العناصر',
      why: 'حمل منتظم وإزاحات صلبة صفرية، لأن OpenSees يسلّط حمل العنصر على '
         + 'الطول المرن فقط عند تعريف الإزاحات',
      cfg: Object.assign({}, cfg, { loadDist: 'uniform', rz: 0, eqX: 0, eqY: 0 }),
      cases: ['DEAD', 'LIVE'], flex: false });
    // الوجه الثاني: الجانبي — أحمال عقدية، بإزاحات صلبة كما ضبطها المستخدم
    var lat = Object.assign({}, cfg, { loadDist: 'uniform',
      ts: 0, sdl: 0, ll: 0, gamma: 0,
      eqX: cfg.eqX || 200, eqY: cfg.eqY || 0 });
    runs.push({ key: 'lat',
      name: 'الجانبي (زلزالي) — أحمال عقدية بإزاحات صلبة rz = ' + (cfg.rz || 0),
      why: 'أحمال عقدية تعزل صلابة الإزاحة الصلبة، والقوى تُقرأ عند طرفَي '
         + 'الجزء المرن كما يقرؤها OpenSees',
      cfg: lat, cases: lat.eqY ? ['EQX', 'EQY'] : ['EQX'], flex: (cfg.rz || 0) > 0 });

    var out = [], i = 0, chain = Promise.resolve();
    runs.forEach(function (r) {
      // العنصر الذي يهمل الإزاحات الصلبة في OpenSees: نُسقط المقارنة ونشير للحالة المغلقة
      var skipShear = r.flex && cfg.shear;
      var c = Object.assign({}, r.cfg);
      if (skipShear) c.shear = false;
      var f;
      try { f = M.buildModel(c); f.run(); }
      catch (e) { out.push({ name: r.name, error: e.message }); return; }
      r.cases.forEach(function (cs) {
        chain = chain.then(function () {
          if (onStep) onStep(++i, r.name + ' · ' + cs);
          return post(f.spec(cs)).then(function (j) {
            if (!j.ok) { out.push({ name: r.name, cs: cs, error: j.error }); return; }
            var d = diff(f, cs, j.result, r.flex);
            d.name = r.name; d.why = r.why; d.cs = cs; d.ver = j.version;
            d.note = skipShear
              ? 'عُطّل تشوّه القصّ هنا: عنصر ElasticTimoshenkoBeam في OpenSees يهمل '
                + '-jntOffset ويعطي ترخيماً أقلّ عند تفعيل القصّ، وهو ناتج غير فيزيائي. '
                + 'الحالة مثبّتة بالحلّ المغلق في تبويب التحقّق.'
              : '';
            out.push(d);
          }).catch(function (e) { out.push({ name: r.name, cs: cs, error: String(e) }); });
        });
      });
    });
    return chain.then(function () { return out; });
  }

  global.FEM3DX = { run: run, forcesAtFlexEnds: forcesAtFlexEnds };
})(typeof window !== 'undefined' ? window : globalThis);
