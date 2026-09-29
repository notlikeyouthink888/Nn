/* دليل العنصر — تضغط على جسر/عمود/أساس/بلاطة بمجسم المعالج فتفتح نافذة بطبقات:
     🧾 الملخص · 🧮 كيف حُسب؟ · 📐 المقطع · 📏 التفصيل الطولي · ✅ فحوص ACI · 📊 جدول القطع · 🛠️ التنفيذ
   إضافة خالصة: تقرأ نتيجة المعالج (WZ) كما هي ولا تغيّر رقماً فيها. الحسابات من calcdoc.py (نفس
   المصدر)، وقواعد التفصيل من rebarkb.js (مطابقة لدوال الخادم)، والفحوص تُقارن ما نفّذه المعالج بما
   يطلبه ACI 318-19 بنداً بنداً — والتوصية تُكتب صراحةً حين يلزم تكثيف أو تمديد. */
(function () {
  const D = window.DOSSIER = {};
  const WZg = () => (typeof WZ !== 'undefined' ? WZ : null);      // نتيجة المعالج (let بـ app.js — ليست خاصية على window)
  const RB = () => window.REBAR;
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f0 = x => (x === null || x === undefined || !isFinite(x)) ? '—' : Math.round(x).toLocaleString('en-US');
  const f1 = x => (x === null || x === undefined || !isFinite(x)) ? '—' : (+x).toFixed(1);
  const f2 = x => (x === null || x === undefined || !isFinite(x)) ? '—' : (+x).toFixed(2);
  const A = db => Math.PI * db * db / 4;

  /* ============================ السياق من نتيجة المعالج ============================ */
  function rowVal(u, key) { const r = (u.rows || []).find(x => x[0] === key); return r ? r[1] : null; }

  function ctxBeam(u) {
    const W = WZg(); if (!W || !W.beams) return null;
    const g = String(u.gk || '').split('|'), dir = g[0] === 'by' ? 'y' : 'x';
    const B = W.beams[dir], m = W.model.beams[dir]; if (!B || !m) return null;
    const nsp = (B.design || []).length || 1, idx = Math.max(0, Math.min(nsp - 1, +g[1] || 0));
    const dg = B.design[idx] || B.design[0], rb = m.rebar, det = m.detail || {};
    const Lrow = parseFloat(rowVal(u, 'البحر')); const L = isFinite(Lrow) ? Lrow : dg.L;
    const col = W.model.col, cw = (dir === 'x' ? col.b : col.h) || Math.min(col.b, col.h);
    const ln = Math.max(0.5, L - cw / 1000);
    const env = (B.env || [])[idx] || [];
    return { kind: 'beam', dir, idx, nsp, endL: idx === 0, endR: idx === nsp - 1, B, m, dg, rb, det, L, ln, cw, env,
      b: m.b, h: m.h, d: B.d, fc: B.fc || W.input.fc, fy: B.fy || W.input.fy, cover: rb.cover,
      dt: rb.stirrup.db, s: rb.stirrup.s, legs: rb.stirrup.legs, floor: +g[3] || u.floor || 1, type: (m.btype || {}).name || 'جسر ساقط' };
  }
  function ctxCol(u) {
    const W = WZg(); if (!W || !W.model || !W.model.col) return null;
    const g = String(u.gk || '').split('|'), i = +g[1] || 0, j = +g[2] || 0, s = +g[3] || u.floor || 1;
    const c = W.model.col, rb = c.rebar, nf = W.model.floors || 1;
    const kinds = (W.col && W.col.kinds) || [];
    const kd = kinds.find(k => k.i === i && k.j === j) || kinds.reduce((a, k) => (!a || k.Pu > a.Pu ? k : a), null);
    const PuBase = kd ? kd.Pu : W.Pumax, Pu = PuBase * (nf - s + 1) / nf;
    const Hr = parseFloat(rowVal(u, 'الارتفاع')), H = isFinite(Hr) && Hr > 1 ? Hr : W.model.story_h, hb = ((W.model.beams && W.model.beams.x) ? W.model.beams.x.h : 600) / 1000;
    return { kind: 'column', c, rb, i, j, s, nf, kd, Pu, PuBase, Pumax: W.Pumax, H, hb, ln: Math.max(0.5, H - hb),
      b: c.b, h: c.h, fc: W.input.fc, fy: W.input.fy, cover: rb.cover, dt: rb.tie_db, db: rb.db };
  }
  function ctxFoot(u) {
    const W = WZg(), t = W && W.design && W.design.typical; if (!t || !t.B) return null;
    const k = (parseInt(String(u.title || '').replace(/[^0-9]/g, ''), 10) || 1) - 1;
    const sz = (W.design.sizes || [])[k] || {};
    return { kind: 'footing', t, k, sz, B: sz.B || t.B, h: t.h, d: t.d, fc: t.fc, fy: t.fy, cover: t.cover || 75, db: t.bar_db, s: t.spacing,
      cx: t.cx, cy: t.cy, Ps: (W.loads && W.loads[k] && W.loads[k].P) || t.Ps };
  }
  function ctxSlab() {
    const W = WZg(), s = W && W.model && W.model.slab; if (!s) return null;
    return { kind: 'slab', s, h: s.h, fc: W.input.fc, fy: W.input.fy, me: s.mesh || {}, cover: 20 };
  }

  /* ============================ الفحوص ============================ */
  const CK = (name, val, lim, state, clause, why) => ({ name, val, lim, state, clause, why });
  const st = b => b ? 'ok' : 'fail';

  function inflection(env, fromLeft) {                // موضع نقطة الانقلاب من محور المسند (م)
    if (!env || env.length < 3) return null;
    const pts = fromLeft ? env : env.slice().reverse(), x0 = pts[0].x;
    for (let k = 1; k < pts.length; k++) {
      if (pts[k - 1].Mmin < -1e-6 && pts[k].Mmin >= -1e-6) {
        const a = pts[k - 1], b = pts[k], t = a.Mmin / (a.Mmin - b.Mmin);
        return Math.abs((a.x + (b.x - a.x) * t) - x0);
      }
    }
    return null;
  }

  function beamChecks(c) {
    const R = RB(), rb = c.rb, bot = rb.bottom, top = rb.top, out = [];
    const asMin = R.asMinBeam(c.fc, c.fy, c.b, c.d), asMax = R.asMaxBeam(c.fc, c.fy, c.b, c.d);
    out.push(CK('أقل حديد سفلي', f0(bot.As) + ' مم²', '≥ ' + f0(asMin), st(bot.As >= asMin - 1), '9.6.1.2', 'يمنع الانهيار المفاجئ لحظة التشقق: الحديد لازم يشيل ما كانت تشيله الخرسانة بالشد.'));
    out.push(CK('أقل حديد علوي (فوق المساند)', f0(top.As) + ' مم²', '≥ ' + f0(asMin), st(top.As >= asMin - 1), '9.6.1.2', ''));
    out.push(CK('أقصى حديد (εt ≥ 0.004)', f0(Math.max(bot.As, top.As)) + ' مم²', '≤ ' + f0(asMax), st(Math.max(bot.As, top.As) <= asMax), '9.3.3.1', 'حديد أكثر من هذا يخلّي الخرسانة تنسحق قبل ما يخضع الحديد — انهيار بلا إنذار.'));
    const cmin = R.clearMin(bot.db, 20);
    out.push(CK('الخلوص بين الأسياخ السفلية', f1(bot.clear) + ' مم', '≥ ' + f1(cmin), st(bot.clear >= cmin - 0.5), '25.2.1', 'حتى تمرّ الخرسانة والركام (4/3 × 20 مم) بين الأسياخ ويتماسك الحديد.'));
    if (bot.layers > 1) out.push(CK('المسافة بين الطبقتين', '≥ 25 مم', '≥ 25 مم', 'ok', '25.2.2', 'الطبقة العليا فوق السفلى مباشرة (نفس الخط الشاقولي).'));
    const cc = c.cover + c.dt, n1 = bot.per_layer ? Math.min(bot.n, bot.per_layer) : bot.n;
    const sc = n1 > 1 ? (c.b - 2 * c.cover - 2 * c.dt - bot.db) / (n1 - 1) : 0, smax = R.sMaxCrack(c.fy, cc);
    out.push(CK('تباعد الأسياخ للتحكّم بالتشقق', f0(sc) + ' مم', '≤ ' + f0(smax), st(sc <= smax + 0.5), '24.3.2', 'تباعد كبير = شقوق عريضة بالوجه المشدود (fs = ⅔fy).'));
    const sh = c.dg.shear || {}, Av = c.legs * A(c.dt), avm = R.avMin(c.fc, c.b, c.s, 420);
    out.push(CK('مساحة الكانات Av', f0(Av) + ' مم²', '≥ ' + f0(avm), st(Av >= avm - 0.5), '9.6.3.4', 'الحد الأدنى لما Vu > ½φVc: يمسك الشق القطري لحظة ظهوره.'));
    const Vs = Math.max(0, (sh.Vs || 0)), sm = R.stirrupSmax(c.d, Vs, c.fc, c.b);
    out.push(CK('أقصى تباعد للكانات', c.s + ' مم', '≤ ' + f0(sm.s) + (sm.hi ? ' (Vs كبير)' : ''), st(c.s <= sm.s + 0.5), sm.clause, 'كل شق قطري بزاوية 45° لازم تعبره كانة واحدة على الأقل ⇒ s ≤ d/2.'));
    out.push(CK('مقاومة القص', f1(sh.Vu) + ' kN', 'φVn = ' + f1(sh.phiVn), st((sh.ratio || 0) <= 1), '22.5 + جدول 22.5.5.1', sh.case || ''));
    out.push(CK('مقاومة الانحناء (البحر)', f1(c.dg.flex.Mu) + ' kN·m', 'φMn = ' + f1(c.dg.flex.phiMn), st(c.dg.flex.ratio <= 1), '9.5 + 22.2', c.dg.flex.note || ''));
    const sz = R.seisBeam({ sys: 'imf', d: c.d, h: c.h, dbL: Math.min(bot.db, top.db), dt: c.dt });   // أصغر سيخ طولي محصور
    out.push(CK('كانات منطقة المفصل (زلزالي متوسط)', 'Ø' + c.dt + '@' + c.s, '≤ ' + f0(sz.s) + ' على ' + f0(sz.zone) + ' مم من الوجه', c.s <= sz.s + 0.5 ? 'ok' : 'warn', sz.clause,
      c.s <= sz.s + 0.5 ? 'التباعد الحالي يحقق شرط منطقة المفصل.' : `التوصية: كثّف الكانات إلى Ø${c.dt}@${Math.floor(sz.s / 25) * 25} على مسافة 2h = ${f0(sz.zone)} مم من وجه كل عمود، وأول كانة على 50 مم.`));
    out.push(CK('الحديد الموجب عند الوجه ≥ ⅓ السالب', f0(bot.As) + ' مم²', '≥ ' + f0(top.As / 3), st(bot.As >= top.As / 3), '18.4.2.2', 'بالزلزال ينعكس العزم عند المسند فيصير موجباً — لازم حديد سفلي يشيله.'));
    const cw = c.cw, avail = cw - c.cover - c.dt;
    [['سفلي', bot.db, false], ['علوي', top.db, true]].forEach(([nm, db, tp]) => {
      const lh = R.ldh({ db, fc: c.fc, fy: c.fy, confined: true, inCore: true }).ldh;
      if (c.endL || c.endR) out.push(CK(`تثبيت الحديد ال${nm} بعكفة داخل العمود الطرفي`, 'ldh = ' + f0(lh) + ' مم', 'المتاح ' + f0(avail) + ' مم', lh <= avail ? 'ok' : 'warn', '25.4.3.1',
        lh <= avail ? 'العكفة 90° تدخل لب العمود وتكفي.' : 'عمق العمود لا يكفي للعكفة: كبّر العمود، أو صغّر القطر، أو استعمل سيخاً برأس (25.4.4).'));
    });
    const ipL = inflection(c.env, true);
    if (ipL !== null && c.det.top1) {
      const need = (ipL - cw / 2000) * 1000 + Math.max(c.d, 12 * top.db, c.ln * 1000 / 16), have = c.det.top1 * 1000;
      out.push(CK('امتداد الحديد العلوي بعد نقطة الانقلاب', f0(have) + ' مم من الوجه', '≥ ' + f0(need) + ' (IP ' + f0((ipL - cw / 2000) * 1000) + ' + max(d,12db,ln/16))', have >= need - 1 ? 'ok' : 'warn', '9.7.3.8.4',
        'ثلث الحديد العلوي على الأقل يعبر نقطة انقلاب العزم بمسافة max(d ، 12db ، ln/16) — نقطة الانقلاب محسوبة من غلاف العزوم نفسه.'));
    }
    out.push(CK('دخول الحديد السفلي للمسند', 'مستمر', '¼ الحديد ≥ 150 مم', 'ok', '9.7.3.8.2', c.det.bent ? 'نصف الأسياخ تُثنى 45° والباقي مستمر داخل المسند.' : ''));
    const lb = R.lapTension({ db: bot.db, fc: c.fc, fy: c.fy, cover: c.cover }), lt = R.lapTension({ db: top.db, fc: c.fc, fy: c.fy, cover: c.cover, top: true });
    if (c.det.lap_bottom) out.push(CK('وصلة الحديد السفلي', f0(c.det.lap_bottom * 1000) + ' مم', '≥ ' + f0(lb.lap) + ' (صنف ' + lb.cls + ')', st(c.det.lap_bottom * 1000 >= lb.lap - 1), 'جدول 25.5.2.1', 'تُعمل فوق المساند حيث العزم الموجب صغير.'));
    if (c.det.lap_top) out.push(CK('وصلة الحديد العلوي', f0(c.det.lap_top * 1000) + ' مم', '≥ ' + f0(lt.lap) + ' (ψt = 1.3)', st(c.det.lap_top * 1000 >= lt.lap - 1), 'جدول 25.5.2.1', 'تُعمل بمنتصف البحر حيث العزم السالب صفر — ومعامل الحديد العلوي 1.3.'));
    const hk = c.det.hook_stirrup || R.hook(c.dt, 135, 'tie');
    out.push(CK('عكفة الكانة', (hk.angle || 135) + '° بامتداد ' + f0(hk.ext) + ' مم', '≥ max(6db ، 75) = ' + f0(Math.max(6 * c.dt, 75)), st(hk.ext >= Math.max(6 * c.dt, 75) - 0.5), '25.3.2 + 25.7.1.3', 'عكفة 135° لا تنفتح عند انقشار الغطاء.'));
    const sk = R.skin(c.h, c.cover, c.fy);
    out.push(CK('حديد جانبي (Skin)', c.h + ' مم', c.h > 900 ? 'مطلوب لكل وجه' : 'غير مطلوب لـ h ≤ 900', c.h > 900 ? 'warn' : 'ok', '9.7.2.3', c.h > 900 ? `ضع أسياخاً جانبية بتباعد ≤ ${f0(sk.s)} مم على النصف المشدود.` : ''));
    out.push(CK('الغطاء الخرساني', c.cover + ' مم', '≥ ' + R.cover('beam', 'interior', bot.db), st(c.cover >= R.cover('beam', 'interior', bot.db)), '20.5.1.3.1', 'للأساور والحديد الرئيسي بالجسور غير المعرّضة.'));
    if (c.dg.defl) out.push(CK('الهطول طويل الأمد', f1(c.dg.defl.d_after) + ' مم', '≤ ' + f1(c.dg.d_limit) + ' مم (L/' + ((c.dg.defl.gov || {}).den || 480) + ')', st(c.dg.defl.ok), 'جدول 24.2.2', (c.dg.defl.gov || {}).label || ''));
    return out;
  }

  function colChecks(c) {
    const R = RB(), rb = c.rb, out = [];
    out.push(CK('نسبة التسليح ρ', (rb.rho * 100).toFixed(2) + '%', '1% ≤ ρ ≤ 8%', st(rb.rho >= 0.01 - 1e-6 && rb.rho <= 0.08), '10.6.1.1', 'أقل من 1% يزحف العمود مع الزمن، وأكثر من 8% ما تنصب الخرسانة (عملياً ≤ 4% عند الوصلات).'));
    out.push(CK('عدد الأسياخ', rb.n, '≥ ' + (rb.shape === 'circ' ? 6 : 4), st(rb.n >= (rb.shape === 'circ' ? 6 : 4)), '10.7.3.1', 'سيخ بكل زاوية على الأقل.'));
    const nb = rb.nb || 2, clear = (Math.min(c.b, c.h) - 2 * c.cover - 2 * c.dt - nb * c.db) / Math.max(1, nb - 1), need = R.clearMin(c.db, 20, 'column');
    out.push(CK('الخلوص بين الأسياخ', f1(clear) + ' مم', '≥ ' + f1(need), st(clear >= need - 0.5), '25.2.3', 'max(40 ، 1.5db ، 4/3 الركام) — الأعمدة تُصب من ارتفاع فتحتاج خلوصاً أكبر.'));
    out.push(CK('قطر الأتاري', 'Ø' + c.dt, '≥ Ø' + R.tieDbMin(c.db), st(c.dt >= R.tieDbMin(c.db)), '25.7.2.2', ''));
    const ts = R.tieS(c.db, c.dt, c.b, c.h);
    out.push(CK('تباعد الأتاري', rb.tie_s + ' مم', '≤ ' + f0(ts.s) + ' (' + ts.gov + ')', st(rb.tie_s <= ts.s + 0.5), '25.7.2.1', 'يمنع انبعاج الأسياخ الطولية بين طوقين.'));
    const sup = rb.support || {};
    out.push(CK('إسناد الأسياخ بزوايا الأتاري', (rb.crossties || 0) + ' أتاري داخلي', 'مطلوب ' + (sup.total || 0), st((rb.crossties || 0) >= (sup.total || 0)), '25.7.2.3', 'كل سيخ ركني وكل سيخ بديل بزاوية ≤ 135°، ولا سيخ حر أبعد من 150 مم عن سيخ مسنود.'));
    const sz = R.seisCol({ sys: 'imf', b: c.b, h: c.h, ln: c.ln * 1000, dbL: c.db, dt: c.dt });
    out.push(CK('طول منطقة التطويق lo', f0(rb.conf_len) + ' مم', '≥ ' + f0(sz.lo), rb.conf_len >= sz.lo - 1 ? 'ok' : 'warn', sz.clause, rb.conf_len >= sz.lo - 1 ? '' : `التوصية: مدّ التطويق إلى ${f0(sz.lo)} مم من كل طرف.`));
    out.push(CK('تباعد التطويق so', f0(rb.tie_s_conf) + ' مم', '≤ ' + f0(sz.so), rb.tie_s_conf <= sz.so + 0.5 ? 'ok' : 'warn', sz.clause, 'أطواق متقاربة بطرفي العمود حيث يتكوّن المفصل اللدن بالزلزال.'));
    out.push(CK('الحمل المحوري لهذا العمود', f0(c.Pu) + ' kN', 'φPn,max = ' + f0(rb.phiPn_max), st(c.Pu <= rb.phiPn_max), '22.4.2.1', `حمل هذا الموقع (${(c.kd && c.kd.kind) || '—'}) بالطابق ${c.s} — والمعالج صمّم مقطعاً نموذجياً لأثقل عمود (${f0(c.Pumax)} kN).`));
    out.push(CK('تفاعل الحمل والعزم (المقطع النموذجي)', 'نسبة ' + f2(rb.ratio), '≤ 1.00', st(rb.ratio <= 1), '22.4 + منحني التفاعل', ''));
    const lc = R.lapComp({ db: c.db, fc: c.fc, fy: c.fy }), lt = R.lapTension({ db: c.db, fc: c.fc, fy: c.fy, cover: c.cover });
    out.push(CK('وصلة الأسياخ الطولية', 'انضغاط ' + f0(lc.lap) + ' مم', 'شد صنف B ' + f0(lt.lap) + ' مم', 'info', '25.5.5.1 + 10.7.5.2', 'إذا العمود عليه عزم زلزالي يشد الأسياخ تُعتمد وصلة الشد — والأكبر هو الآمن.'));
    if (rb.dowels) out.push(CK('دفن الدولات بالأساس', f0(rb.dowels.embed) + ' مم', 'ldc = ' + f0(rb.dowels.ldc) + ' مم', rb.dowels.embed >= rb.dowels.ldc - 1 ? 'ok' : 'warn', '25.4.9 + 13.2.8', rb.dowels.warn || 'الدولات تنقل الانضغاط للأساس.'));
    const hk = rb.tie_hook || R.hook(c.dt, 135, 'tie');
    out.push(CK('عكفة الأتاري', '135° · امتداد ' + f0(hk.ext) + ' مم', '≥ max(6db ، 75)', st(hk.ext >= Math.max(6 * c.dt, 75) - 0.5), '25.3.4', 'عكفة زلزالية تنغرز داخل اللب.'));
    out.push(CK('الغطاء الخرساني', c.cover + ' مم', '≥ 40 مم', st(c.cover >= 40), '20.5.1.3.1', ''));
    return out;
  }

  function footChecks(c) {
    const R = RB(), t = c.t, out = [];
    out.push(CK('ضغط التربة', f1(c.Ps / (c.B * c.B)) + ' kPa', '≤ qa الصافي', st(true), '13.3.1.1', 'المساحة من الأحمال غير المصعّدة.'));
    out.push(CK('قص الثقب حول العمود', 'نسبة ' + f2(t.punch_ratio), '≤ 1.00', st(t.punch_ratio <= 1), 'جدول 22.6.5.2', 'العمود يحاول يخرق الأساس بمخروط على بُعد d/2 من وجهه.'));
    out.push(CK('القص باتجاه واحد', 'نسبة ' + f2(t.oneway_ratio), '≤ 1.00', st(t.oneway_ratio <= 1), 'جدول 22.5.5.1', 'شق قطري على بُعد d من وجه العمود.'));
    out.push(CK('أقل حديد', f0(t.As) + ' مم²/م', '≥ 0.0018·b·h = ' + f0(t.As_min), st(t.As >= t.As_min - 1), '13.3.4 + 7.6.1.1', ''));
    const smax = Math.min(3 * t.h, 450);
    out.push(CK('تباعد الحديد', t.spacing + ' مم', '≤ min(3h ، 450) = ' + f0(smax), st(t.spacing <= smax), '7.7.2.3', ''));
    const avail = (c.B * 1000 - Math.max(c.cx, c.cy)) / 2 - c.cover, ld = R.ld({ db: c.db, fc: c.fc, fy: c.fy, cover: c.cover }).ld;
    out.push(CK('نشر الحديد من وجه العمود', 'ld = ' + f0(ld) + ' مم', 'المتاح ' + f0(avail) + ' مم', ld <= avail ? 'ok' : 'warn', '13.2.8.3 + 25.4.2', ld <= avail ? 'السيخ المستقيم يكفي.' : 'اثنِ أطراف الأسياخ بعكفة 90° للأعلى.'));
    out.push(CK('الغطاء السفلي', c.cover + ' مم', '≥ 75 (مصبوب على التربة)', st(c.cover >= 75), '20.5.1.3.1', 'الخرسانة المصبوبة على التربة مباشرة — مع طبقة نظافة.'));
    return out;
  }
  function slabChecks(c) {
    const R = RB(), me = c.me.short || c.me.bottom || {}, out = [];
    const gm = c.s.geom || {}, rib = gm.kind === 'hordi' || gm.kind === 'waffle', t = rib ? (gm.topping || 70) : c.h;
    const smax = rib ? Math.min(5 * t, 450) : Math.min(2 * c.h, 450), asmin = 0.0018 * 1000 * t, As = me.db && me.s ? A(me.db) * 1000 / me.s : 0;
    out.push(CK('أقل حديد (انكماش وحرارة)' + (rib ? ' — طبقة التغطية' : ''), f0(As) + ' مم²/م', '≥ 0.0018·b·' + (rib ? 't' : 'h') + ' = ' + f0(asmin), st(As >= asmin - 1), rib ? '9.8.1.6 + 24.4.3.2' : '7.6.1.1 / 8.6.1.1',
      rib ? `للسقف العصبي (${gm.kind === 'hordi' ? 'هوردي' : 'وافل'}) يُحسب على سماكة طبقة التغطية ${t} مم، والعزم يشيله حديد الأعصاب.` : ''));
    out.push(CK('أقصى تباعد', (me.s || '—') + ' مم', (rib ? '≤ min(5t ، 450) = ' : '≤ min(2h ، 450) = ') + f0(smax), st(!me.s || me.s <= smax), rib ? '24.4.3.3' : '8.7.2.2', rib ? '' : 'للبلاطات باتجاهين بالمقاطع الحرجة.'));
    out.push(CK('الغطاء', '20 مم', '≥ 20 مم', 'ok', '20.5.1.3.1', ''));
    return out;
  }

  /* ============================ رسم المقطع (SVG) ============================ */
  function secSVG(o) {
    const W = 360, H = 300, pad = 46, sc = Math.min((W - 2 * pad) / o.b, (H - 2 * pad) / o.h);
    const bw = o.b * sc, hh = o.h * sc, x0 = (W - bw) / 2, y0 = (H - hh) / 2;
    const cv = o.cover * sc, dt = Math.max(1.6, o.dt * sc);
    let g = `<rect x="${x0}" y="${y0}" width="${bw}" height="${hh}" fill="#26344d" stroke="#94a3b8" stroke-width="1.2"/>`;
    if (o.slab) g += `<rect x="${x0 - 40}" y="${y0}" width="${bw + 80}" height="${o.slab * sc}" fill="#2f3f5c" stroke="#94a3b8" stroke-width=".8" opacity=".85"/>`;
    const ix = x0 + cv + dt / 2, iy = y0 + cv + dt / 2, iw = bw - 2 * cv - dt, ih = hh - 2 * cv - dt, rr = Math.max(2, 2 * dt);
    g += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${rr}" fill="none" stroke="#fbbf24" stroke-width="${dt}"/>`;
    // عكفتا 135° بالزاوية العليا اليسرى
    const hk = Math.max(10, (o.hookExt || 75) * sc);
    g += `<path d="M${ix + rr} ${iy} l${hk * .7} ${hk * .7} M${ix} ${iy + rr} l${hk * .7} ${hk * .7}" stroke="#fbbf24" stroke-width="${dt}" fill="none" stroke-linecap="round"/>`;
    (o.cross || []).forEach(xx => { const X = x0 + xx * sc; g += `<line x1="${X}" y1="${iy}" x2="${X}" y2="${iy + ih}" stroke="#fbbf24" stroke-width="${dt * .8}" stroke-dasharray="4 3"/>`; });
    (o.crossY || []).forEach(yy => { const Y = y0 + yy * sc; g += `<line x1="${ix}" y1="${Y}" x2="${ix + iw}" y2="${Y}" stroke="#fbbf24" stroke-width="${dt * .8}" stroke-dasharray="4 3"/>`; });
    const bars = [];
    (o.rows || []).forEach(r => {
      const n = r.n, db = r.db, rad = Math.max(2.6, db * sc / 2);
      for (let k = 0; k < n; k++) {
        const x = x0 + cv + dt + db * sc / 2 + (bw - 2 * cv - 2 * dt - db * sc) * (n === 1 ? .5 : k / (n - 1));
        bars.push([x, y0 + r.y * sc, rad, r.col || '#f87171']);
      }
    });
    (o.pts || []).forEach(p => bars.push([x0 + p[0] * sc, y0 + p[1] * sc, Math.max(2.6, p[2] * sc / 2), '#f87171']));
    bars.forEach(([x, y, r, c]) => { g += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#fff" stroke-width=".6"/>`; });
    // الأبعاد
    g += `<line x1="${x0}" y1="${y0 + hh + 16}" x2="${x0 + bw}" y2="${y0 + hh + 16}" stroke="#93a4c0"/><text x="${x0 + bw / 2}" y="${y0 + hh + 30}" fill="#93a4c0" font-size="11" text-anchor="middle">b = ${o.b} مم</text>`;
    g += `<line x1="${x0 - 16}" y1="${y0}" x2="${x0 - 16}" y2="${y0 + hh}" stroke="#93a4c0"/><text x="${x0 - 20}" y="${y0 + hh / 2}" fill="#93a4c0" font-size="11" text-anchor="end">h = ${o.h}</text>`;
    g += `<text x="${x0 - 6}" y="${y0 + hh + 14}" fill="#7dd3fc" font-size="10" text-anchor="end">غطاء ${o.cover} مم</text>`;
    (o.labels || []).forEach(l => { g += `<text x="${x0 + bw + 8}" y="${y0 + l.y * sc + 4}" fill="${l.c || '#fca5a5'}" font-size="11">${esc(l.t)}</text>`; });
    if (o.clearTxt) g += `<text x="${W / 2}" y="${y0 - 10}" fill="#34d399" font-size="10.5" text-anchor="middle">${esc(o.clearTxt)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="dos-svg">${g}</svg>`;
  }
  function secFor(c) {
    const R = RB();
    if (c.kind === 'beam') {
      const bot = c.rb.bottom, top = c.rb.top, yb = c.h - c.cover - c.dt - bot.db / 2, yt = c.cover + c.dt + top.db / 2;
      const rows = [];
      const n1 = Math.min(bot.n, bot.per_layer || bot.n);
      rows.push({ n: n1, db: bot.db, y: yb });
      if (bot.n > n1) rows.push({ n: bot.n - n1, db: bot.db, y: yb - bot.db - Math.max(25, bot.db) });
      rows.push({ n: top.n, db: top.db, y: yt, col: '#fb7185' });
      const hs = (WZg().model.slab || {}).h || 0;
      return secSVG({ b: c.b, h: c.h, cover: c.cover, dt: c.dt, rows, slab: (c.m.btype || {}).slab === 'top' ? Math.min(hs, c.h * .4) : 0,
        labels: [{ y: yt, t: top.n + 'Ø' + top.db + ' علوي' }, { y: yb, t: bot.label || (bot.n + 'Ø' + bot.db) }, { y: c.h / 2, t: 'كانات ' + c.rb.stirrup.label, c: '#fbbf24' }],
        clearTxt: 'خلوص ' + f1(bot.clear) + ' مم ≥ ' + f1(R.clearMin(bot.db, 20)) + ' (25.2.1)', hookExt: Math.max(6 * c.dt, 75) });
    }
    if (c.kind === 'column') {
      const rb = c.rb, nb = rb.nb || 2, pts = [], off = c.cover + c.dt + c.db / 2;
      const xs = k => off + (c.b - 2 * off) * (nb === 1 ? .5 : k / (nb - 1)), ys = k => off + (c.h - 2 * off) * (nb === 1 ? .5 : k / (nb - 1));
      const nh = Math.max(2, Math.round((rb.n - 2 * nb) / 2) + 2);
      for (let k = 0; k < nb; k++) { pts.push([xs(k), off, c.db]); pts.push([xs(k), c.h - off, c.db]); }
      for (let k = 1; k < nh - 1; k++) { const y = off + (c.h - 2 * off) * k / (nh - 1); pts.push([off, y, c.db]); pts.push([c.b - off, y, c.db]); }
      const sp = rb.support || {}, cx = ((sp.x || {}).pos || []).map(v => v), cy = ((sp.y || {}).pos || []).map(v => v);
      return secSVG({ b: c.b, h: c.h, cover: c.cover, dt: c.dt, pts, cross: cx, crossY: cy, hookExt: Math.max(6 * c.dt, 75),
        labels: [{ y: c.h / 2, t: rb.label + ' · ρ ' + (rb.rho * 100).toFixed(2) + '%' }, { y: c.h * 0.62, t: rb.tie_label, c: '#fbbf24' }] });
    }
    if (c.kind === 'footing') {
      const Bm = c.B * 1000, n = Math.max(2, Math.round((Bm - 2 * c.cover) / c.s) + 1), y = c.h - c.cover - c.db / 2;
      return secSVG({ b: Math.round(Bm), h: c.h, cover: c.cover, dt: 0.001, rows: [{ n: Math.min(n, 24), db: c.db, y }],
        labels: [{ y, t: `Ø${c.db} @ ${c.s} بالاتجاهين` }], clearTxt: 'مقطع الأساس — غطاء سفلي 75 مم' });
    }
    const me = c.me.short || c.me.bottom || {};
    return secSVG({ b: 1000, h: c.h, cover: c.cover, dt: 0.001, rows: [{ n: Math.max(2, Math.round(1000 / (me.s || 200)) + 1), db: me.db || 10, y: c.h - c.cover - (me.db || 10) / 2 }],
      labels: [{ y: c.h - 25, t: me.label || '' }], clearTxt: 'شريحة 1 م من البلاطة' });
  }

  /* ============================ التفصيل الطولي (canvas بطبقات) ============================ */
  const ELAY = {
    beam: [['bot', 'السفلي', '#f87171', 1], ['top', 'العلوي', '#fb7185', 1], ['stir', 'الكانات', '#fbbf24', 1], ['seis', 'منطقة المفصل (2h)', '#fb923c', 1],
      ['lap', 'مناطق الوصل', '#34d399', 1], ['env', 'غلاف العزم ونقطة الانقلاب', '#a78bfa', 1], ['dim', 'الأبعاد', '#93a4c0', 1]],
    column: [['bars', 'الأسياخ الطولية', '#f87171', 1], ['ties', 'الأتاري', '#fbbf24', 1], ['conf', 'مناطق التطويق lo', '#fb923c', 1], ['lap', 'الوصلة', '#34d399', 1],
      ['joint', 'العقدة', '#38bdf8', 1], ['dim', 'الأبعاد', '#93a4c0', 1]]
  };
  function drawElev(cv, c, lay) {
    const P = window.PHYSLAB, T = P ? P.text : null;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 700, H = Math.round(Math.max(300, Math.min(460, W * .55)));
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0e1729'; x.fillRect(0, 0, W, H);
    const t = (s, X, Y, o) => T ? T(x, s, X, Y, o) : x.fillText(s, X, Y);
    const R = RB();
    if (c.kind === 'beam') {
      const cwm = c.cw / 1000, Lt = c.ln + 2 * cwm, mx = 40, sx = (W - 2 * mx) / Lt, X = v => mx + v * sx;
      const hpx = Math.min(H * .34, 150), y0 = 70, y1 = y0 + hpx, hs = hpx / c.h;   // mm → px رأسياً
      const Xf1 = cwm, Xf2 = cwm + c.ln;                                           // وجها العمودين (م)
      // العمودان والجسر
      x.fillStyle = '#334155'; x.fillRect(X(0), y0 - 30, cwm * sx, hpx + 60); x.fillRect(X(Xf2), y0 - 30, cwm * sx, hpx + 60);
      x.fillStyle = '#26344d'; x.fillRect(X(Xf1), y0, c.ln * sx, hpx); x.strokeStyle = '#94a3b8'; x.strokeRect(X(0) + .5, y0 + .5, Lt * sx - 1, hpx - 1);
      t('عمود', X(cwm / 2), y0 - 38, { size: 10, color: '#93a4c0' }); t('عمود', X(Xf2 + cwm / 2), y0 - 38, { size: 10, color: '#93a4c0' });
      const cov = c.cover * hs, top1 = (c.det.top1 || c.ln / 3), top2 = (c.det.top2 || c.ln / 5);
      if (lay.seis) {
        const z = 2 * c.h / 1000, sz = R.seisBeam({ sys: 'imf', d: c.d, h: c.h, dbL: Math.min(c.rb.bottom.db, c.rb.top.db), dt: c.dt });
        x.fillStyle = 'rgba(251,146,60,.18)'; x.fillRect(X(Xf1), y0, z * sx, hpx); x.fillRect(X(Xf2 - z), y0, z * sx, hpx);
        t(`2h = ${f0(2 * c.h)} مم · s ≤ ${f0(sz.s)}`, X(Xf1 + z / 2), y1 + 14, { size: 9.5, color: '#fb923c' });
      }
      if (lay.lap) {
        x.fillStyle = 'rgba(52,211,153,.22)';
        x.fillRect(X(Xf1 + c.ln * .35), y0 + 2, c.ln * .3 * sx, 8);                 // وصل العلوي بالمنتصف
        x.fillRect(X(Xf1 - .05), y1 - 10, (0.05 + c.ln * .2) * sx, 8); x.fillRect(X(Xf2 - c.ln * .2), y1 - 10, (0.05 + c.ln * .2) * sx, 8);
        x.fillStyle = 'rgba(248,113,113,.25)'; x.fillRect(X(Xf1 + c.ln * .3), y1 - 10, c.ln * .4 * sx, 8);
        t('وصل العلوي هنا ✓', X(Xf1 + c.ln / 2), y0 - 8, { size: 9.5, color: '#34d399' });
        t('ممنوع وصل السفلي ✗', X(Xf1 + c.ln / 2), y1 + 28, { size: 9.5, color: '#f87171' });
      }
      if (lay.bot) {
        const yb = y1 - cov - (c.dt + c.rb.bottom.db / 2) * hs;
        x.strokeStyle = '#f87171'; x.lineWidth = 2.6; x.beginPath();
        const a = c.endL ? X(0) + cov : X(0) - 10, b2 = c.endR ? X(Lt) - cov : X(Lt) + 10;
        x.moveTo(a, c.endL ? y0 + cov + 12 : yb); x.lineTo(a, yb); x.lineTo(b2, yb); x.lineTo(b2, c.endR ? y0 + cov + 12 : yb); x.stroke();
        t(`${c.rb.bottom.label}`, X(Xf1 + c.ln / 2), yb - 10, { size: 10.5, color: '#fca5a5', bg: 'rgba(14,23,41,.75)' });
        if (c.endL) t('عكفة 90° داخل العمود', a + 6, y0 + cov + 24, { size: 9, color: '#fca5a5', align: 'left' });
      }
      if (lay.top) {
        const yt = y0 + cov + (c.dt + c.rb.top.db / 2) * hs;
        x.strokeStyle = '#fb7185'; x.lineWidth = 2.6;
        [[0, 1], [1, -1]].forEach(([side, dirn]) => {
          const face = side ? Xf2 : Xf1, end = side ? Lt : 0, isEnd = side ? c.endR : c.endL;
          x.beginPath(); x.moveTo(X(face + dirn * top1), yt); x.lineTo(isEnd ? X(end) + (side ? -cov : cov) : X(end) + (side ? 10 : -10), yt);
          if (isEnd) x.lineTo(X(end) + (side ? -cov : cov), y1 - cov - 14); x.stroke();
          x.setLineDash([5, 3]); x.beginPath(); x.moveTo(X(face + dirn * top2), yt + 6); x.lineTo(X(face), yt + 6); x.stroke(); x.setLineDash([]);
        });
        t(`${c.rb.top.label} فوق المساند`, X(Xf1 + top1 / 2), yt + 16, { size: 10, color: '#fda4af', bg: 'rgba(14,23,41,.75)' });
      }
      if (lay.stir) {
        x.strokeStyle = 'rgba(251,191,36,.85)'; x.lineWidth = 1;
        for (let v = Xf1 + 0.05; v <= Xf2 - 0.05 + 1e-6; v += c.s / 1000) { x.beginPath(); x.moveTo(X(v), y0 + cov); x.lineTo(X(v), y1 - cov); x.stroke(); }
        t(`كانات Ø${c.dt}@${c.s} — أول كانة 50 مم من الوجه`, X(Xf1 + c.ln / 2), y0 + hpx / 2, { size: 10, color: '#fde68a', bg: 'rgba(14,23,41,.7)' });
      }
      if (lay.env && c.env.length) {
        const ey = y1 + 50, eh = H - ey - 26, mxM = Math.max(...c.env.map(p => Math.max(Math.abs(p.Mmax), Math.abs(p.Mmin))), 1e-6);
        const EX = xx => X(Xf1 - cwm / 2 + xx * (c.ln + cwm) / Math.max(1e-6, c.env[c.env.length - 1].x)), EY = m => ey + eh / 2 + m / mxM * eh / 2;
        x.strokeStyle = '#475569'; x.beginPath(); x.moveTo(EX(0), EY(0)); x.lineTo(EX(c.env[c.env.length - 1].x), EY(0)); x.stroke();
        [['Mmax', '#a78bfa'], ['Mmin', '#c084fc']].forEach(([k, col]) => { x.strokeStyle = col; x.lineWidth = 2; x.beginPath(); c.env.forEach((p, i) => i ? x.lineTo(EX(p.x), EY(p[k])) : x.moveTo(EX(p.x), EY(p[k]))); x.stroke(); });
        [true, false].forEach(L => { const ip = inflection(c.env, L); if (ip === null) return; const xx = L ? ip : c.env[c.env.length - 1].x - ip;
          x.fillStyle = '#fff'; x.beginPath(); x.arc(EX(xx), EY(0), 3.5, 0, 7); x.fill(); t('IP', EX(xx), EY(0) - 10, { size: 9 }); });
        t('غلاف العزم (الموجب للأسفل = شد سفلي) — نقطتا الانقلاب IP تحدّدان قطع الحديد العلوي', W - 10, ey - 6, { align: 'right', size: 9.5, color: '#c4b5fd' });
      }
      if (lay.dim) {
        const yd = 30; x.strokeStyle = '#93a4c0'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(X(Xf1), yd); x.lineTo(X(Xf2), yd); x.stroke();
        t(`ln = ${f2(c.ln)} م`, X(Xf1 + c.ln / 2), yd - 9, { size: 10.5, color: '#cbd5e1' });
        t(`L/3 = ${f2(top1)} م`, X(Xf1 + top1 / 2), yd + 12, { size: 9.5, color: '#fda4af' });
      }
      return;
    }
    // عمود بطابق واحد
    const Hm = c.H, hb = c.hb, mx = 60, sy = (H - 70) / (Hm + 0.6), Y = v => H - 30 - v * sy;
    const bpx = Math.max(40, Math.min(W * .22, c.b / 1000 * sy * 2.2)), cx = W * .38, xL = cx - bpx / 2, xR = cx + bpx / 2;
    x.fillStyle = '#334155'; x.fillRect(xL - 90, Y(0) - 0, bpx + 180, 14); x.fillRect(xL - 90, Y(Hm), bpx + 180, hb * sy);
    x.fillStyle = '#26344d'; x.fillRect(xL, Y(Hm - hb), bpx, (Hm - hb) * sy);
    t('بلاطة/أساس', xL - 92, Y(0) + 7, { size: 9.5, color: '#93a4c0', align: 'left' }); t('جسر + بلاطة', xL - 92, Y(Hm - hb / 2), { size: 9.5, color: '#93a4c0', align: 'left' });
    const sz = RB().seisCol({ sys: 'imf', b: c.b, h: c.h, ln: c.ln * 1000, dbL: c.db, dt: c.dt });
    const lo = Math.max(c.rb.conf_len, 0) / 1000, cov = 14;
    if (lay.conf) { x.fillStyle = 'rgba(251,146,60,.18)'; x.fillRect(xL, Y(lo), bpx, lo * sy); x.fillRect(xL, Y(Hm - hb), bpx, lo * sy);
      t(`lo = ${f0(c.rb.conf_len)} (المطلوب ${f0(sz.lo)})`, xR + 8, Y(lo / 2), { size: 9.5, color: '#fb923c', align: 'left' }); }
    const lap = RB().lapComp({ db: c.db, fc: c.fc, fy: c.fy }).lap / 1000;
    if (lay.bars) {
      x.strokeStyle = '#f87171'; x.lineWidth = 2.6;
      [xL + cov, xR - cov].forEach((bx, k) => { x.beginPath(); x.moveTo(bx, Y(-0.05)); x.lineTo(bx, Y(Hm) - 4); x.stroke();
        x.beginPath(); x.moveTo(bx + (k ? -5 : 5), Y(Hm - hb)); x.lineTo(bx + (k ? -9 : 9), Y(Hm - hb + 0.12)); x.lineTo(bx + (k ? -9 : 9), Y(Hm + lap)); x.stroke(); });
      t(c.rb.label + ' — ثني مائل 1:6 عند الوصلة', xR + 8, Y(Hm * .55), { size: 10, color: '#fca5a5', align: 'left' });
    }
    if (lay.lap) { x.fillStyle = 'rgba(52,211,153,.25)'; x.fillRect(xL - 6, Y(Hm + lap) - 0, bpx + 12, lap * sy);
      t(`وصلة ${f0(lap * 1000)} مم فوق البلاطة`, xR + 8, Y(Hm + lap / 2), { size: 9.5, color: '#34d399', align: 'left' }); }
    if (lay.ties) {
      x.strokeStyle = 'rgba(251,191,36,.9)'; x.lineWidth = 1.2;
      const sc = c.rb.tie_s_conf / 1000, sm = c.rb.tie_s / 1000;
      for (let v = 0.05; v < Hm - hb; ) { x.beginPath(); x.moveTo(xL + 5, Y(v)); x.lineTo(xR - 5, Y(v)); x.stroke(); v += (v < lo || v > Hm - hb - lo) ? sc : sm; }
      t(`${c.rb.tie_label} · تطويق @${c.rb.tie_s_conf}`, xR + 8, Y(Hm * .35), { size: 10, color: '#fde68a', align: 'left' });
    }
    if (lay.joint) { x.strokeStyle = 'rgba(56,189,248,.9)'; x.lineWidth = 1.2; for (let v = Hm - hb + 0.08; v < Hm; v += 0.15) { x.beginPath(); x.moveTo(xL + 5, Y(v)); x.lineTo(xR - 5, Y(v)); x.stroke(); }
      t('أتاري تستمر داخل العقدة (15.7.1)', xR + 8, Y(Hm - hb / 2), { size: 9.5, color: '#7dd3fc', align: 'left' }); }
    if (lay.dim) { x.strokeStyle = '#93a4c0'; x.beginPath(); x.moveTo(xL - 20, Y(0)); x.lineTo(xL - 20, Y(Hm)); x.stroke();
      t(`H = ${f2(Hm)} م · ln = ${f2(c.ln)} م`, xL - 26, Y(Hm / 2), { size: 10, color: '#cbd5e1', align: 'right' }); }
  }

  /* ============================ جدول قطع العنصر ============================ */
  function bbs(c) {
    const R = RB(), rows = [];
    const add = (mark, desc, db, n, L, shape) => rows.push({ mark, desc, db, n, L, shape, kg: R.mass(db, L, n) });
    if (c.kind === 'beam') {
      const bot = c.rb.bottom, top = c.rb.top, cw = c.cw, ln = c.ln * 1000;
      const hkB = R.hook(bot.db, 90, 'bar'), hkT = R.hook(top.db, 90, 'bar');
      const lapB = (c.det.lap_bottom || 0) * 1000, lapT = (c.det.lap_top || 0) * 1000;
      const bL = ln + (c.endL ? cw - c.cover : cw / 2 + lapB / 2) + (c.endR ? cw - c.cover : cw / 2 + lapB / 2);
      add('B1', 'سفلي رئيسي', bot.db, bot.n, R.barCut(bL, [c.endL ? hkB : null, c.endR ? hkB : null]), (c.endL || c.endR) ? 'مستقيم بعكفة 90°' : 'مستقيم');
      const t1 = (c.det.top1 || c.ln / 3) * 1000;
      const tL = t1 + (c.endL ? cw - c.cover : cw / 2), tR = t1 + (c.endR ? cw - c.cover : cw / 2);
      add('T1', 'علوي فوق المسند الأيسر', top.db, top.n, R.barCut(tL, [c.endL ? hkT : null]), c.endL ? 'عكفة 90°' : 'مستقيم');
      add('T2', 'علوي فوق المسند الأيمن', top.db, top.n, R.barCut(tR, [c.endR ? hkT : null]), c.endR ? 'عكفة 90°' : 'مستقيم');
      const stc = R.stirrupCut(c.b, c.h, c.cover, c.dt, 135), ns = Math.floor((ln - 100) / c.s) + 1;
      add('S1', 'كانة مغلقة', c.dt, ns, stc.L, stc.shape);
      if (lapT) rows.push({ note: `وصلة العلوي ${f0(lapT)} مم بمنتصف البحر إذا زاد الطول عن سيخ السوق (12 م).` });
    } else if (c.kind === 'column') {
      const rb = c.rb, lap = R.lapComp({ db: c.db, fc: c.fc, fy: c.fy }).lap;
      add('C1', 'طولي (طابق + وصلة)', c.db, rb.n, c.H * 1000 + lap, 'مستقيم بثني مائل 1:6 بالأعلى');
      const lo = rb.conf_len, Hc = (c.H - c.hb) * 1000, nConf = 2 * (Math.floor(lo / rb.tie_s_conf) + 1), nMid = Math.max(0, Math.floor((Hc - 2 * lo) / rb.tie_s));
      const tc = R.stirrupCut(c.b, c.h, c.cover, c.dt, 135);
      add('L1', 'أتاري بالعمود', c.dt, nConf + nMid, tc.L, tc.shape);
      add('L2', 'أتاري داخل العقدة', c.dt, Math.max(1, Math.floor(c.hb * 1000 / 150)), tc.L, tc.shape);
      if (rb.crossties) { const ct = R.hook(c.dt, 135, 'tie'), c90 = R.hook(c.dt, 90, 'tie'); add('X1', 'أتاري داخلي (Crosstie)', c.dt, rb.crossties * (nConf + nMid), c.h - 2 * c.cover + ct.added + c90.added, '135° بطرف و90° بالآخر'); }
      if (c.s === 1 && rb.dowels) add('D1', 'دولات للأساس', rb.dowels.db, rb.dowels.n, (rb.dowels.total_len || 0.8) * 1000, 'عكفة 90° بالأسفل');
    } else if (c.kind === 'footing') {
      const Bm = c.B * 1000, n = Math.floor((Bm - 2 * c.cover) / c.s) + 1;
      add('F1', 'سفلي — الاتجاه X', c.db, n, Bm - 2 * c.cover, 'مستقيم');
      add('F2', 'سفلي — الاتجاه Y', c.db, n, Bm - 2 * c.cover, 'مستقيم');
    } else {
      const me = c.me.short || c.me.bottom || {}; if (me.db) rows.push({ note: `شبكة ${me.label || ''} — العدد لكل البلاطة بجدول تقطيع الحديد الكامل (BBS).` });
    }
    return rows;
  }

  /* ============================ نصائح التنفيذ ============================ */
  const SITE = {
    beam: ['الوصلة السفلية تُعمل فوق المساند، والعلوية بمنتصف البحر — بالعكس تماماً من أماكن أقصى عزم.',
      'عكفات الكانات 135° وتتناوب جهتها من كانة لأخرى (25.7.1.6) حتى لا يصير الضعف بخط واحد.',
      'أول كانة على 50 مم من وجه العمود، والتكثيف على 2h من كل وجه.',
      'الحديد السفلي بالمسند الطرفي يدخل لب العمود وينثني 90° للأعلى خلف الحديد الطولي للعمود.',
      'بسكويت الغطاء 40 مم تحت الكانات لا تحت الحديد الرئيسي — الغطاء يُقاس للسيخ الأقرب للوجه.',
      'لا تقطع الحديد العلوي قبل الطول المرسوم: قطعه مبكراً يسبّب شقوقاً عرضية فوق المساند.'],
    column: ['الوصلة تُعمل فوق وجه البلاطة مباشرة، مع ثني مائل 1:6 للسيخ السفلي حتى يدخل داخل السيخ العلوي.',
      'أتاري إضافية عند الثنية المائلة تشيل 1.5 مرة المركبة الأفقية (10.7.4.1.3).',
      'الأتاري تستمر داخل العقدة (منطقة التقاء الجسور) — أكثر مكان يُنسى بالموقع.',
      'أول طوق على نصف تباعد التطويق من وجه البلاطة، والتطويق بطرفي العمود لا بنصفه.',
      'عكفات 135° تنغرز داخل اللب وتتبادل زواياها حول الأسياخ الركنية.'],
    footing: ['طبقة نظافة 50–75 مم تحت الأساس، والغطاء 75 مم فوقها.', 'الدولات تُربط بالشبكة السفلية وتُثبّت بأتاري حتى لا تتحرك وقت الصب.',
      'الشبكة بالاتجاهين؛ القصير تحت الطويل للأساس المستطيل (13.3.3).'],
    slab: ['كراسي الحديد العلوي كل 1 م تقريباً حتى لا ينزل تحت الأقدام.', 'الحديد العلوي فوق المساند يمتد L/3–L/4 من وجه المسند.', 'غطاء 20 مم للبلاطات الداخلية.']
  };

  /* ============================ «كيف حُسب؟» — طلبات calcdoc ============================ */
  function calcReq(c) {
    const W = WZg();
    if (c.kind === 'beam') {
      const dg = c.dg, fx = dg.flex, m = c.m, trib = m.sec.trib;
      const wu = 1.2 * (W.floor.D * trib + c.B.sw) + 1.6 * (W.floor.L * trib);
      const p = [{ what: 'beam_moment', w: wu, L: dg.L, ln: m.detail.ln, kind: c.nsp > 1 ? (c.endL || c.endR ? 'end_int' : 'interior') : 'simple', M: dg.Mpos, V: dg.Vu },
        { what: 'beam_steel', b: fx.b, bw: m.b, h: m.h, d: fx.d, Mu: fx.Mu, fc: fx.fc, fy: fx.fy, db: fx.bars.db, n_bars: fx.bars.n, As_used: fx.bars.As, cover: m.rebar.cover }];
      const sup = (c.B.supports || []).filter(s => s.flex).sort((a, b) => Math.abs(b.M) - Math.abs(a.M))[0];
      if (sup) p.push({ what: 'beam_steel', b: sup.flex.b, bw: m.b, h: m.h, d: sup.flex.d, Mu: sup.flex.Mu, fc: sup.flex.fc, fy: sup.flex.fy, db: sup.flex.bars.db, n_bars: sup.flex.bars.n, As_used: sup.flex.bars.As, cover: m.rebar.cover });
      return { p, note: `الحمل شريحة من البلاطة بعرض ${f2(trib)} م على البحر رقم ${c.idx + 1} من ${c.nsp} — والعزوم من تحليل الجائز المستمر، والمعاملات معروضة للمقارنة.`,
        sum: [['المقطع', `${c.b}×${c.h} مم`, 'ltr'], ['البحر', f2(dg.L) + ' م', 'ltr'], ['wu', f1(wu) + ' kN/م', 'ltr'], ['السفلي / العلوي', `${c.rb.bottom.n}Ø${c.rb.bottom.db} · ${c.rb.top.n}Ø${c.rb.top.db}`, 'ltr']] };
    }
    if (c.kind === 'column') {
      const rb = c.rb;
      return { note: `حمل هذا العمود بالطابق ${c.s} ≈ ${f0(c.Pu)} kN (من ${f0(c.PuBase)} kN عند القاعدة × الطوابق فوقه). المقطع نموذجي مصمَّم لأثقل عمود.`,
        sum: [['المقطع', `${c.b}×${c.h} مم`, 'ltr'], ['التسليح', rb.label, 'ltr'], ['Pu هنا', f0(c.Pu) + ' kN', 'ltr'], ['الأتاري', `Ø${rb.tie_db}@${rb.tie_s}`, 'ltr']],
        p: [{ what: 'col_long', b: c.b, h: c.h, db: rb.db, n_bars: rb.n, Ast: rb.Ast, fc: c.fc, fy: c.fy, cover: rb.cover, db_tie: rb.tie_db, Pu: c.Pu, Mu: W.col.Mu, phiPn: rb.phiPn_max, phiMn: rb.phiMn },
          { what: 'col_ties', H: c.H, b: c.b, h: c.h, db_long: rb.db, db_tie: rb.tie_db, s_mid: rb.tie_s, s_conf: rb.tie_s_conf, lo: rb.conf_len, ln: c.ln }] };
    }
    if (c.kind === 'footing' && typeof calcPayloads === 'function') return calcPayloads('fnd');
    if (typeof calcPayloads === 'function') return calcPayloads('slab');
    return null;
  }

  /* ============================ المختبر الحي على العنصر نفسه ============================ */
  // نفس مختبرات الفيزياء، مزروعة بأبعاد العنصر وحمله وحديده الحقيقية من نتيجة المعالج
  function labSeed(c) {
    const W = WZg(), r1 = x => Math.round(x * 10) / 10;
    if (c.kind === 'beam') {
      const rb = c.rb, bot = rb.bottom, top = rb.top, trib = c.m.sec.trib;
      const wu = 1.2 * (W.floor.D * trib + c.B.sw) + 1.6 * (W.floor.L * trib);
      const sup = c.nsp === 1 ? 'ss' : (c.endL || c.endR) ? 'fp' : 'ff';
      const n1 = Math.min(bot.n, bot.per_layer || bot.n), spc = n1 > 1 ? (c.b - 2 * c.cover - 2 * c.dt - bot.db) / (n1 - 1) : 100;
      const fx = c.dg.flex || {};
      return { labs: ['beam', 'section', 'rb_cut', 'rb_dev', 'rb_lap', 'rb_fit'],
        note: `المختبرات مزروعة بأرقام هذا الجسر: بحر ${f2(c.L)} م · حمل مصعّد ${f1(wu)} kN/م · مقطع ${c.b}×${c.h} · ${bot.label} سفلي و${top.n}Ø${top.db} علوي. الإسناد ${sup === 'ss' ? 'بسيط' : sup === 'fp' ? 'بحر طرفي (مثبّت + دحروج)' : 'بحر داخلي (مثبّت الطرفين)'} تقريباً للجائز المستمر.`,
        vals: {
          beam: { sup, L: r1(c.L), w: Math.round(wu), P: 0, a: r1(c.L / 2), b: c.b, h: c.h, fc: c.fc },
          section: { b: c.b, h: c.h, cov: Math.round(c.h - c.d), n: Math.min(10, bot.n), db: bot.db, np: 0, dbp: 12, fc: c.fc, fy: c.fy, st: 1 },
          rb_cut: { sup: sup === 'ss' ? 'ss' : 'ff', L: r1(c.L), w: Math.min(120, Math.round(wu)), n: Math.min(8, bot.n), cut: 0, db: bot.db, h: c.h, fc: c.fc },
          rb_dev: { db: top.db, fy: c.fy, fc: c.fc, cov: c.cover, sp: Math.round(Math.max(40, spc)), top: 'y', coat: 'none', tr: c.s <= 100 ? 't10b' : c.s <= 150 ? 't10a' : 'none', emb: Math.round(Math.min(2000, (c.det.top1 || c.ln / 3) * 1000)) },
          rb_lap: { mode: 't', db: bot.db, fc: c.fc, lap: Math.round(Math.min(2000, (c.det.lap_bottom || 0.6) * 1000)), ratioAs: r1(Math.max(1, Math.min(3, (bot.As || 1) / Math.max(1, fx.As_req || bot.As)))), pct: 100, top: 'n', pos: 0.08 },
          rb_fit: { b: c.b, n: Math.min(10, n1), db: bot.db, agg: 20, cov: c.cover, dt: c.dt }
        } };
    }
    if (c.kind === 'column') {
      const rb = c.rb, Po = (0.85 * c.fc * (c.b * c.h - rb.Ast) + c.fy * rb.Ast) / 1000;
      return { labs: ['column', 'rb_conf', 'rb_lap', 'rb_dev'],
        note: `المختبرات مزروعة بأرقام هذا العمود: ${c.b}×${c.h} مم · ${rb.label} · Pu ≈ ${f0(c.Pu)} kN بالطابق ${c.s} · طول حر ${f2(c.ln)} م · أطواق Ø${c.dt}@${rb.tie_s} وتطويق @${rb.tie_s_conf}.`,
        vals: {
          column: { bc: 'pp', L: r1(Math.max(2, c.ln)), b: Math.min(c.b, c.h), h: Math.max(c.b, c.h), fc: c.fc, rho: r1(Math.max(1, Math.min(4, rb.rho * 100))), P: Math.round(Math.min(8000, c.Pu)), frame: 'ns', m12: -1 },
          rb_conf: { b: Math.max(300, Math.round(Math.min(c.b, c.h) / 25) * 25), nb: Math.max(2, Math.min(6, rb.nb || 3)), db: c.db, dt: c.dt, s: Math.max(50, rb.tie_s_conf), cross: (rb.crossties || 0) > 0 ? 'y' : 'n', fc: c.fc, cov: c.cover, P: Math.round(Math.min(100, c.Pu / Po * 100)) },
          rb_lap: { mode: 'c', db: c.db, fc: c.fc, lap: Math.round(RB().lapComp({ db: c.db, fc: c.fc, fy: c.fy }).lap) },
          rb_dev: { db: c.db, fy: c.fy, fc: c.fc, cov: 75, sp: 150, top: 'n', coat: 'none', tr: 'none', emb: Math.round((rb.dowels && rb.dowels.embed) || 300) }
        } };
    }
    if (c.kind === 'footing') {
      const g = W.grid, kind = (c.sz && c.sz.kind) || '', pick = /ركني/.test(kind) ? 'k' : /طرفي/.test(kind) ? 'e' : 'c';
      const avail = (c.B * 1000 - Math.max(c.cx, c.cy)) / 2 - c.cover;
      return { labs: ['path', 'rb_dev'], note: `مسار حمل هذا الأساس (${kind || 'داخلي'}) من السقوف حتى التربة، ونشر حديده من وجه العمود.`,
        vals: { path: { Lx: r1(g.sx), Ly: r1(g.sy), q: r1(W.floor.D + W.floor.L), N: W.model.floors, qa: W.input.qa, pick },
          rb_dev: { db: c.db, fy: c.fy, fc: c.fc, cov: 75, sp: c.s, top: 'n', coat: 'none', tr: 'none', emb: Math.round(Math.max(100, Math.min(2000, avail))) } } };
    }
    const g = W.grid, gm = c.s.geom || {};
    return { labs: ['plate', 'path'], note: 'بلاطة بحر نموذجي من شبكة المشروع، بحمل الخدمة (ميت + حي).',
      vals: { plate: { a: r1(Math.min(g.sx, g.sy)), b: r1(Math.max(g.sx, g.sy)), h: Math.max(100, Math.min(300, gm.kind === 'hordi' || gm.kind === 'waffle' ? c.h * 0.7 : c.h)), q: r1(W.floor.D + W.floor.L), fc: c.fc, show: 'w' },
        path: { Lx: r1(g.sx), Ly: r1(g.sy), q: r1(W.floor.D + W.floor.L), N: W.model.floors, qa: W.input.qa, pick: 'c' } } };
  }
  let DOSN = 0;

  /* ============================ النافذة ============================ */
  const TABS = [['sum', '🧾 الملخص'], ['lab', '🔬 المختبر الحي'], ['calc', '🧮 كيف حُسب؟'], ['sec', '📐 المقطع'], ['elev', '📏 التفصيل الطولي'], ['chk', '✅ فحوص ACI'], ['bbs', '📊 جدول القطع'], ['site', '🛠️ التنفيذ']];
  let CUR = null, LAY = {};

  D.supports = u => !!u && ['beam', 'column', 'footing', 'slab'].includes(u.kind) && !!WZg() && !!window.REBAR;
  D.context = function (u) {
    if (!u) return null;
    return u.kind === 'beam' ? ctxBeam(u) : u.kind === 'column' ? ctxCol(u) : u.kind === 'footing' ? ctxFoot(u) : u.kind === 'slab' ? ctxSlab(u) : null;
  };
  D.checks = c => c.kind === 'beam' ? beamChecks(c) : c.kind === 'column' ? colChecks(c) : c.kind === 'footing' ? footChecks(c) : slabChecks(c);

  D.open = function (u) {
    const c = D.context(u);
    if (!c) { alert('ما قدرت أبني دليل هذا العنصر من نتيجة المعالج.'); return; }
    CUR = { u, c, checks: D.checks(c) };
    if (window.PHYSLAB) PHYSLAB.labs.forEach(l => { if (l._st) Object.keys(l._st).forEach(k => { if (k.startsWith('dos')) delete l._st[k]; }); });
    LAY = {}; (ELAY[c.kind] || []).forEach(l => { LAY[l[0]] = !!l[3]; });
    let ov = document.getElementById('dosOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'dosOv'; ov.className = 'dos-ov'; document.body.appendChild(ov); }
    const nOk = CUR.checks.filter(k => k.state === 'ok').length, nW = CUR.checks.filter(k => k.state === 'warn').length, nF = CUR.checks.filter(k => k.state === 'fail').length;
    const ic = { beam: '🟩', column: '🟫', footing: '🟦', slab: '🧱' }[c.kind];
    ov.innerHTML = `<div class="dos" role="dialog" aria-label="دليل العنصر">
      <div class="dos-h"><div><span class="dos-ic">${ic}</span><b>${esc(u.title)}</b>
        <div class="dos-badges"><span class="tag t-ok">${nOk} مطابق</span>${nW ? `<span class="tag t-warn">${nW} توصية</span>` : ''}${nF ? `<span class="tag t-bad">${nF} مخالف</span>` : ''}
        <span class="dos-code">ACI 318-19</span></div></div>
        <button class="dos-x" aria-label="إغلاق">✕</button></div>
      <div class="dos-tabs">${TABS.map((t, i) => `<button data-t="${t[0]}" class="${i ? '' : 'on'}">${t[1]}</button>`).join('')}</div>
      <div class="dos-b" id="dosB"></div></div>`;
    ov.style.display = 'flex';
    ov.onclick = e => {
      if (e.target === ov || e.target.closest('.dos-x')) { D.close(); return; }
      const b = e.target.closest('[data-t]'); if (b) { ov.querySelectorAll('.dos-tabs button').forEach(x => x.classList.toggle('on', x === b)); render(b.dataset.t); return; }
      const l = e.target.closest('[data-el]'); if (l) { LAY[l.dataset.el] = !LAY[l.dataset.el]; l.classList.toggle('on', LAY[l.dataset.el]); const cv = document.getElementById('dosCv'); if (cv) drawElev(cv, CUR.c, LAY); }
    };
    document.addEventListener('keydown', escKey);
    render('sum');
  };
  function escKey(e) { if (e.key === 'Escape') D.close(); }
  D.close = function () {
    const ov = document.getElementById('dosOv'); if (ov) ov.style.display = 'none';
    const b = document.getElementById('dosB'); if (b) b.innerHTML = '';          // يوقف حلقة رسم المختبر المزروع
    if (window.PHYSLAB && PHYSLAB.stop) PHYSLAB.stop();
    document.removeEventListener('keydown', escKey);
  };

  function render(tab) {
    const box = document.getElementById('dosB'); if (!box || !CUR) return;
    const { c, u, checks } = CUR;
    if (tab === 'sum') {
      const rows = (u.rows || []).map(r => `<tr><td>${esc(r[0])}</td><td><b>${esc(r[1])}</b></td></tr>`).join('');
      const worst = checks.filter(k => k.state !== 'ok' && k.state !== 'info');
      box.innerHTML = `<div class="dos-grid"><div>${secFor(c)}</div><div><table class="dos-t"><tbody>${rows}
        <tr><td>المواد</td><td><b>f'c = ${c.fc} MPa · fy = ${c.fy} MPa</b></td></tr></tbody></table>
        ${worst.length ? `<div class="note" style="margin-top:10px"><b>انتباه:</b><ul class="pl-ul">${worst.map(k => `<li>${esc(k.name)} — ${esc(k.why || k.lim)}</li>`).join('')}</ul></div>`
          : '<div class="dos-okbox">✓ كل فحوص التفصيل مطابقة لـ ACI 318-19.</div>'}
        <div class="hint">افتح «🧮 كيف حُسب؟» للاشتقاق خطوة بخطوة، و«📏 التفصيل الطولي» للرسم بطبقاته.</div></div></div>`;
    } else if (tab === 'lab') {
      if (!window.PHYSLAB) { box.innerHTML = '<div class="note">وحدة المختبر غير محمَّلة.</div>'; return; }
      const sd = labSeed(c), key = 'dos' + (CUR.n || (CUR.n = ++DOSN));
      box.innerHTML = `<div class="dos-labnote">🔬 ${esc(sd.note)} — غيّر أي قيمة وشوف التأثير لحظياً؛ أرقام المعالج نفسها ما تتغيّر.</div>` + PHYSLAB.html({ key, labs: sd.labs, vals: sd.vals });
      PHYSLAB.init();
    } else if (tab === 'calc') {
      const req = calcReq(c);
      if (!req || req.err || !window.CALCDOC) { box.innerHTML = `<div class="note">${esc((req && req.err) || 'الاشتقاق غير متاح لهذا العنصر.')}</div>`; return; }
      box.innerHTML = '<div id="dosCalc"><div class="hint">جارٍ اشتقاق الحساب…</div></div>';
      window.CALCDOC.into(document.getElementById('dosCalc'), req.p, { summary: req.sum, note: req.note });
    } else if (tab === 'sec') {
      box.innerHTML = `<div class="dos-grid"><div>${secFor(c)}</div><div>${secNotes(c)}</div></div>`;
    } else if (tab === 'elev') {
      const L = ELAY[c.kind];
      if (!L) { box.innerHTML = '<div class="note">لا يوجد تفصيل طولي لهذا العنصر — راجع المقطع وجدول القطع.</div>'; return; }
      box.innerHTML = `<div class="pl-layers">${L.map(l => `<button data-el="${l[0]}" class="${LAY[l[0]] ? 'on' : ''}"><i style="background:${l[2]}"></i>${l[1]}</button>`).join('')}</div>
        <canvas id="dosCv" class="dos-cv"></canvas><div class="hint">شغّل وأطفئ الطبقات فوق الرسم. الأطوال من نتيجة المعالج، والمطلوب من ACI 318-19.</div>`;
      requestAnimationFrame(() => drawElev(document.getElementById('dosCv'), c, LAY));
    } else if (tab === 'chk') {
      const icon = { ok: '✅', warn: '⚠️', fail: '❌', info: 'ℹ️' };
      box.innerHTML = `<div style="overflow-x:auto"><table class="dos-t dos-chk"><thead><tr><th></th><th>البند</th><th>المنفّذ</th><th>المطلوب</th><th>ACI 318-19</th></tr></thead><tbody>${
        checks.map(k => `<tr class="st-${k.state}"><td>${icon[k.state]}</td><td><b>${esc(k.name)}</b>${k.why ? `<div class="dos-why">${esc(k.why)}</div>` : ''}</td><td><span dir="ltr" class="dos-m">${esc(k.val)}</span></td><td><span dir="ltr" class="dos-m">${esc(k.lim)}</span></td><td class="ltr">§${esc(k.clause)}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'bbs') {
      const rows = bbs(c); let tot = 0;
      box.innerHTML = `<div style="overflow-x:auto"><table class="dos-t"><thead><tr><th>العلامة</th><th>الوصف</th><th>القطر</th><th>العدد</th><th>طول القطع (مم)</th><th>الشكل</th><th>الوزن (كغم)</th></tr></thead><tbody>${
        rows.map(r => { if (r.note) return `<tr><td colspan="7" class="hint">${esc(r.note)}</td></tr>`; tot += r.kg;
          return `<tr><td><b>${r.mark}</b></td><td>${esc(r.desc)}</td><td class="ltr">Ø${r.db}</td><td>${r.n}</td><td>${f0(r.L)}</td><td>${esc(r.shape)}</td><td>${f1(r.kg)}</td></tr>`; }).join('')}
        <tr><td colspan="6"><b>المجموع لهذا العنصر</b></td><td><b>${f1(tot)} كغم</b></td></tr></tbody></table></div>
        <div class="hint">طول القطع = المستقيم + (قوس الثنية على محور السيخ + الامتداد) لكل عكفة، والكانة = محيط المحور بزوايا مقوّسة + عكفتا 135° (MNL-66). الوزن 0.00617·db² كغم/م.</div>`;
    } else if (tab === 'site') {
      box.innerHTML = `<ol class="pl-ul dos-site">${(SITE[c.kind] || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
    }
  }

  function secNotes(c) {
    const R = RB();
    if (c.kind === 'beam') {
      const bot = c.rb.bottom, fit = R.fit(c.b, c.cover, c.dt, Math.min(bot.n, bot.per_layer || bot.n), bot.db, 20);
      return `<ul class="pl-ul"><li>العمق الفعّال <b>d = ${f0(c.d)} مم</b> = h − الغطاء − الكانة − نصف السيخ${bot.layers > 1 ? ' (لمركز الطبقتين)' : ''}.</li>
        <li>العرض المتاح داخل الكانة ${f0(fit.avail)} مم يستوعب <b>${fit.nMax}</b> أسياخ Ø${bot.db} بطبقة واحدة بالخلوص الأدنى ${f1(fit.need)} مم.</li>
        <li>قطر ثني الكانة الداخلي ${f0(R.bendDia(c.dt, 'tie'))} مم (${R.bendDia(c.dt, 'tie') / c.dt}db — جدول 25.3.2)، وقطر ثني السيخ الرئيسي ${f0(R.bendDia(bot.db))} مم (جدول 25.3.1).</li>
        <li>الأرجل: ${c.legs} — ${esc((c.m.btype || {}).legs_rule || '')}</li>
        ${(c.m.btype || {}).flange ? `<li>${esc(c.m.btype.flange.note)}</li>` : ''}</ul>`;
    }
    if (c.kind === 'column') {
      const rb = c.rb;
      return `<ul class="pl-ul"><li>${esc((rb.tie_rule || {}).note || '')} (25.7.2.1).</li><li>${esc((rb.support || {}).why || '')}</li>
        <li>عكفة الأتاري: ${esc((rb.tie_hook || {}).label || '')}.</li><li>${esc(rb.conf_label || '')}.</li></ul>`;
    }
    if (c.kind === 'footing') return `<ul class="pl-ul"><li>العمق الفعّال d = ${f0(c.d)} مم (h − 75 − db).</li><li>${esc((c.t.top || {}).why || '')}</li></ul>`;
    return '<ul class="pl-ul"><li>الشبكة السفلية بالاتجاه القصير تحت الطويل لأنها تشيل العزم الأكبر.</li></ul>';
  }
})();
