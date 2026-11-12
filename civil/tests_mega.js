// اختبارات قسم «المشاريع الكبيرة» — node civil/tests_mega.js
// · البيانات: كل عنصر يجاوب الأسئلة الثلاثة، وكل مصدر مذكور موجود بقائمة المصادر، والجولة تشير لعناصر حقيقية.
// · الأرقام المنشورة ثابتة (828 م، 163 طابق، 194 ركيزة…): أي تغيير عليها لازم يكون مقصوداً.
// · المجسم: يُبنى بسياق وهمي (بلا متصفح) ونتأكد من الهندسة الأساسية — ارتفاعات، عدد الركائز، شكل Y، القشرة.
global.window = global;
require('./static/megaprojects.js');
require('./static/megaprojects2.js');
const R = window.MEGAPROJ, B = R._burj, H = R._heydar, G = R._capitalgate, M = R._mbs, K = R._crescent;
let fails = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fails++; };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg + ': ' + (+a).toFixed(3) + ' ≈ ' + b);
const LABS = ['beam', 'column', 'section', 'quake', 'path', 'truss', 'plate', 'wind', 'age'];
const FIGS = ['web', 'cant', 'truss', 'vortex', 'outr', 'lean', 'hang', 'tie'];

// سياق بناء وهمي: يعدّ القطع ويحفظ حدودها
function stub() {
  const S = { n: {}, box: {}, inst: {}, labels: [], lines: {}, surf: {} };
  const grow = (el, x, y, z) => { const b = S.box[el] || (S.box[el] = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]); b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], x); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], z); };
  const cnt = el => { S.n[el] = (S.n[el] || 0) + 1; };
  const bad = (...a) => a.some(v => typeof v !== 'number' || !isFinite(v));
  return { S,
    geo: (pos, idx) => ({ pos, idx }),
    use(el) {
      const api = {
        geom(g) { cnt(el); for (let i = 0; i < g.pos.length; i += 3) grow(el, g.pos[i], g.pos[i + 1], g.pos[i + 2]); return api; },
        box(len, th, y0, y1, x, z, a) { if (bad(len, th, y0, y1, x, z, a || 0) || y1 <= y0) throw new Error(el + ': صندوق غير صالح ' + [len, th, y0, y1, x, z]); cnt(el); grow(el, x, y0, z); grow(el, x, y1, z); return api; },
        cyl(rt, rb, y0, y1, x, z) { if (bad(rt, rb, y0, y1, x, z) || y1 <= y0) throw new Error(el + ': أسطوانة غير صالحة'); cnt(el); grow(el, x, y0, z); grow(el, x, y1, z); return api; },
        strut(p0, p1, r) { if (bad(...p0, ...p1, r)) throw new Error(el + ': عضو غير صالح'); cnt(el); grow(el, ...p0); grow(el, ...p1); return api; },
        prism(pts, y0, y1) { if (pts.length < 3 || pts.some(p => bad(p[0], p[1])) || y1 <= y0) throw new Error(el + ': منشور غير صالح'); cnt(el); pts.forEach(p => { grow(el, p[0], y0, p[1]); grow(el, p[0], y1, p[1]); }); return api; },
        taper(a, b) { if (bad(...a, ...b)) throw new Error(el + ': جسر غير صالح'); cnt(el); grow(el, ...a); grow(el, ...b); return api; },
        tube(pts, r) { if (pts.some(p => bad(...p)) || bad(r)) throw new Error(el + ': أنبوب غير صالح'); cnt(el); pts.forEach(p => grow(el, ...p)); return api; }
      };
      return api;
    },
    inst(el, key, opt, shape, at) { S.inst[el] = (S.inst[el] || []).concat(at); (S.shape = S.shape || {})[el] = shape; cnt(el); at.forEach(p => { grow(el, p[0], p[1] - shape[3] / 2, p[2]); grow(el, p[0], p[1] + shape[3] / 2, p[2]); }); },
    surface(el, key, opt, pos, idx) { if (pos.some(v => !isFinite(v))) throw new Error(el + ': سطح بيه NaN'); S.surf[el] = { v: pos.length / 3, t: idx.length / 3 }; cnt(el); for (let i = 0; i < pos.length; i += 3) grow(el, pos[i], pos[i + 1], pos[i + 2]); },
    lines(el, arr) { if (arr.some(v => !isFinite(v))) throw new Error(el + ': خطوط بيها NaN'); S.lines[el] = (S.lines[el] || 0) + arr.length / 6; cnt(el); for (let i = 0; i < arr.length; i += 3) grow(el, arr[i], arr[i + 1], arr[i + 2]); },
    points(el, arr) { cnt(el); },
    label(t, p, cls, el) { S.labels.push([t, p, el]); },
    ground(el) { cnt(el); },
    pit(el, R, yb, bands, gR, gC, cx, cz) { if ([R, yb].some(v => !isFinite(v)) || yb >= 0) throw new Error(el + ': حفرة غير صالحة'); cnt(el); grow(el, cx || 0, yb, cz || 0); }
  };
}

// ---------------------------------------------------------------- البيانات
ok(R.order.join() === 'burj,heydar,capitalgate,mbs,crescent', 'خمس مشاريع: برج خليفة، حيدر علييف، كابيتال جيت، مارينا باي ساندز، فندق الهلال');
for (const id of R.order) {
  const P = R[id], srcIds = P.sources.map(s => s[0]);
  ok(P.name && P.en && P.place && P.tag && P.idea.length >= 2 && P.note.includes('تعليمي'), id + ': تعريف المشروع وملاحظة إنه مجسم تعليمي');
  ok(P.sources.length >= 4 && P.sources.every(s => s[1] && (s[2] === '' || /^https:\/\//.test(s[2]))), id + ': مصادر بروابط https');
  let bad = [];
  for (const [el, e] of Object.entries(P.els)) {
    if (!(e.name && e.en && e.what && e.why && e.load)) bad.push(el + ':نص');
    if (!e.src || !e.src.length || e.src.some(i => !srcIds.includes(i))) bad.push(el + ':مصدر');
    if (e.lab && !LABS.includes(e.lab)) bad.push(el + ':مختبر');
    if (e.fig && !FIGS.includes(e.fig)) bad.push(el + ':رسم');
    if ((e.with || []).some(w => !P.els[w])) bad.push(el + ':with');
    if (!e.dir || e.dir.length !== 3) bad.push(el + ':dir');
  }
  ok(!bad.length, id + ': كل عنصر يجاوب شنو/ليش/شلون وله مصدر' + (bad.length ? ' ← ' + bad.join(' ') : ' (' + Object.keys(P.els).length + ' عنصر)'));
  ok(P.layers.every(l => P.els[l[0]]) && Object.keys(P.els).every(el => P.layers.some(l => l[0] === el)), id + ': كل طبقة لها عنصر وكل عنصر له طبقة');
  ok(P.facts.every(f => f.length === 3 && (f[2].match(/\[(\d)\]/g) || []).every(m => srcIds.includes(+m[1]))), id + ': كل رقم منشور يشير لمصدر موجود');
  const refs = el => !el || P.els[el];
  ok(P.tour.length >= 6 && P.tour.every(t => t.t && t.x && refs(t.el) && (t.also || []).every(refs) && (t.on || []).every(refs) && (t.off || []).every(refs) &&
    (!t.mode || P.modes.some(m => m[0] === t.mode))), id + ': الجولة المشروحة تشير لعناصر وأوضاع موجودة');
  ok(P.lessons.length >= 3 && P.modes[0][0] === 'struct', id + ': دروس + وضع الهيكل أولاً');
  ok(typeof P.cutText(P.view.ymax - 1) === 'string' && P.cutText(P.view.ymax + 5) === 'كامل الارتفاع', id + ': نص القطع الأفقي');
}
// ---------------------------------------------------------------- أرقام منشورة ثابتة
const fact = (P, k) => (P.facts.find(f => f[0] === k) || [])[1];
ok(fact(R.burj, 'الارتفاع') === '828 م' && fact(R.burj, 'الطوابق') === '163', 'برج خليفة: 828 م و 163 طابق');
ok(fact(R.burj, 'اللبشة') === '3.7 م' && fact(R.burj, 'الركائز') === '194 × Ø1.5 م' && fact(R.burj, 'زمن الاهتزاز الأول') === '11.3 ث', 'برج خليفة: لبشة 3.7 م، 194 ركيزة، T₁ = 11.3 ث');
ok(R.burj.els.core.nums.some(n => n[1] === 'ACI 318-02') && R.burj.els.core.nums.some(n => n[1].includes('43,800')), 'برج خليفة: ACI 318-02 و Ec = 43,800 MPa');
ok(fact(R.heydar, 'الارتفاع') === '74 م' && fact(R.heydar, 'الطوابق') === '8' && fact(R.heydar, 'مساحة الطوابق') === '101,801 م²', 'حيدر علييف: 74 م، 8 طوابق، 101,801 م²');
ok(R.heydar.els.frame.nums[0][1].includes('12,569') && R.heydar.els.frame.nums[1][1].includes('17,269'), 'حيدر علييف: أعضاء الهيكل الفراغي');

// ---------------------------------------------------------------- هندسة برج خليفة
near(B.zL(0), 0, 1e-9, 'منسوب الأرض'); near(B.zL(124), 452, 1e-6, 'الطابق 124 عند 452 م'); near(B.zL(148), 555, 1e-6, 'الطابق 148 عند 555 م'); near(B.zL(156), 585, 1e-6, 'نهاية الخرسانة 585 م');
let mono = true; for (let l = 1; l <= 163; l++) if (B.zL(l) <= B.zL(l - 1)) mono = false;
ok(mono, 'المناسيب تصاعدية لكل الطوابق'); near(B.lvAt(452), 124, 0.01, 'عكس المنسوب: 452 م ← الطابق 124');
ok(B.SB.length === 26 && B.SB.every((s, i) => s.wing === i % 3 && (i === 0 || s.lv > B.SB[i - 1].lv)), '26 تراجعاً تدور حلزونياً على الأجنحة الثلاثة');
ok(B.lens(0).every(l => l === B.L0) && B.lens(156).every(l => l < 18 && l > 8), 'الأجنحة كاملة بالقاعدة وتنتهي عند اللب بالأعلى');
let shrink = true; for (let l = 1; l <= 156; l++) for (let k = 0; k < 3; k++) if (B.lenAt(k, l) > B.lenAt(k, l - 1)) shrink = false;
ok(shrink, 'كل جناح يقصر فقط كلما نصعد');
const o = B.outline(B.lens(0), B.W, B.NOSE, 9), rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
ok(o.every(p => o.some(q => { const r = rot(p, 2 * Math.PI / 3); return Math.hypot(r[0] - q[0], r[1] - q[1]) < 1e-6; })), 'مسقط القاعدة متناظر بدوران 120° (حرف Y)');
ok(R.burj.windD(70) > R.burj.windD(230) && R.burj.windD(230) > R.burj.windD(400) && R.burj.windD(400) > R.burj.windD(545), 'عرض البرج يقل بالارتفاع (أساس «تلخبط الريح»)');
ok(R.burj.cutText(452).includes('الطابق 124') && R.burj.cutText(280).includes('سكني') && R.burj.cutText(-20).includes('الركائز') && R.burj.cutText(700).includes('الفولاذي'), 'نص القطع يعرف استعمال الطابق');
let c = stub(); R.burj.build(c); let S = c.S;
ok(S.inst.piles.length === 194, 'المجسم: 194 ركيزة بالضبط');
const pd = S.inst.piles.map(p => Math.hypot(p[0], p[2])), minGap = Math.min(...S.inst.piles.map((p, i) => Math.min(...S.inst.piles.filter((q, j) => j !== i).map(q => Math.hypot(p[0] - q[0], p[2] - q[2])))));
ok(Math.max(...pd) < B.L0 + B.NOSE + 4 && minGap > 2.5 * 1.5, 'الركائز داخل حدود اللبشة وبتباعد أكبر من 2.5 قطر (' + minGap.toFixed(2) + ' م)');
near(S.box.piles[4] - S.box.piles[1], 43, 1e-6, 'طول الركيزة 43 م'); near(S.box.raft[4] - S.box.raft[1], 3.7, 1e-6, 'سمك اللبشة 3.7 م');
near(S.box.piles[4], S.box.raft[1], 1e-6, 'راس الركيزة عند أسفل اللبشة'); near(S.box.spire[4], 828, 1e-6, 'القمة عند 828 م'); near(S.box.core[4], 585, 1e-6, 'اللب ينتهي عند 585 م');
ok(S.box.spire[1] >= 584.9 && S.box.slab[4] <= 585 && S.box.clad[4] <= 585.01, 'الفولاذ يبدأ وين ما الخرسانة تخلص');
ok(['core', 'corridor', 'hammer', 'pcol', 'outrigger', 'slab', 'clad', 'spire', 'raft', 'piles', 'soil', 'compare'].every(el => S.n[el] > 0), 'كل عناصر البرج انبنت');
ok(S.labels.some(l => l[0].includes('828')) && S.labels.some(l => l[0].includes('330')), 'ملصقات الارتفاع والمقارنة');
let paths = R.burj.paths();
ok(paths.length >= 8 && paths.every(p => p.pts.length >= 3 && p.pts.every(q => q.every(isFinite)) && p.n > 0 && p.sp > 0), 'مسارات الحمل صالحة');
ok(paths.filter(p => p.c === 0xfbbf24).every(p => p.pts[p.pts.length - 1][1] < p.pts[0][1] && p.pts[p.pts.length - 1][1] < -50), 'مسار الوزن ينزل دائماً وينتهي بنهاية الركائز');

// ---------------------------------------------------------------- هندسة مركز حيدر علييف
let peak = 0, pu = 0; for (let u = 0; u <= 1.0001; u += 0.002) { const h = H.h(u); if (h > peak) { peak = h; pu = u; } }
near(peak, 74, 0.05, 'أعلى نقطة بالقشرة 74 م'); ok(Math.abs(H.h(0)) < 1e-9 && Math.abs(H.h(1)) < 1e-9, 'القشرة تنزل للأرض بالطرفين');
let surfOk = true, eaveMax = 0;
for (let u = 0; u <= 1.0001; u += 0.02) { for (let v = -1; v <= 1.0001; v += 0.05) { const p = H.S(u, v), n = H.N(u, v); if (p.some(x => !isFinite(x)) || p[1] < -1e-9 || p[1] > 74.01 || Math.abs(Math.hypot(...n) - 1) > 1e-6 || n[1] < 0) surfOk = false; }
  eaveMax = Math.max(eaveMax, H.S(u, H.vmax(u))[1]); }
ok(surfOk, 'سطح القشرة محدود (0 إلى 74 م) والعمودي عليه للأعلى');
ok(Math.abs(H.S(0.5, -1)[1]) < 1e-9 && H.vmax(0.05) === 1 && H.vmax(0.45) < 0.7, 'الجهة الخلفية تلمس الأرض والحافة الأمامية مرفوعة');
ok(eaveMax > 12 && eaveMax < 0.75 * 74, 'الحافة المرفوعة أوطأ من القمة (' + eaveMax.toFixed(1) + ' م)');
c = stub(); R.heydar.build(c); S = c.S;
ok(S.surf.skin.v === 133 * 45 && S.surf.skin.t === 132 * 44 * 2, 'شبكة القشرة كاملة');
ok(S.lines.frame > 8000, 'الهيكل الفراغي: ' + Math.round(S.lines.frame) + ' عضو بالمجسم');
ok(['skin', 'frame', 'conc', 'floors', 'boot', 'dovetail', 'glass', 'plaza', 'prog'].every(el => S.n[el] > 0), 'كل عناصر المركز انبنت');
ok(S.n.dovetail >= 15 && S.n.boot >= 6, 'جسور كابولية (' + S.n.dovetail + ') وأعمدة جزمة (' + S.n.boot + ')');
ok(S.box.floors[4] <= 42.01 && S.box.conc[4] < 74 && S.box.frame[4] < 74 && S.box.frame[4] > 68, 'الخرسانة والهيكل الفراغي تحت القشرة');
ok(S.box.skin[3] - S.box.skin[0] > 180 && S.box.skin[4] <= 74.13, 'أبعاد القشرة (فواصل الألواح مرفوعة 0.12 م فوق السطح)');
paths = R.heydar.paths();
ok(paths.length >= 8 && paths.every(p => p.pts.every(q => q.every(isFinite)) && p.pts[p.pts.length - 1][1] < 0), 'مسارات الحمل تنتهي بالأساس');

// ---------------------------------------------------------------- كابيتال جيت
ok(fact(R.capitalgate, 'الميلان') === '18° غرباً' && fact(R.capitalgate, 'الارتفاع') === '160 م' && fact(R.capitalgate, 'الأساس') === '490 ركيزة', 'كابيتال جيت: 18°، 160 م، 490 ركيزة');
near(G.y(G.NF), 160, 1e-9, 'آخر طابق عند 160 م'); near(G.off(G.LV0), 0, 1e-9, 'لا إزاحة قبل الطابق 12');
near(Math.atan2(G.off(G.LV0) - G.off(G.NF), G.y(G.NF) - G.y(G.LV0)) * 180 / Math.PI, 18, 1e-9, 'زاوية الميلان 18°');
let coreIn = true; for (let lv = 0; lv <= G.NF; lv++) { const ox = G.off(lv); for (const x of [G.XC - G.CW / 2, G.XC + G.CW / 2]) for (const z of [-G.CD / 2, G.CD / 2]) if (((x - ox) / G.A) ** 2 + (z / G.B) ** 2 > 1) coreIn = false; }
ok(coreIn, 'اللب العمودي يبقى داخل كل الطوابق المنزاحة');
c = stub(); R.capitalgate.build(c); S = c.S;
ok(S.inst.piles && G.nPiles === 490, 'المجسم: 490 ركيزة بالضبط');
ok(['core', 'pt', 'camber', 'slabs', 'beams', 'diagrid', 'pins', 'glass', 'splash', 'pool', 'raft', 'piles', 'soil', 'context'].every(el => S.n[el] > 0), 'كل عناصر كابيتال جيت انبنت');
ok(S.n.pins >= 8, 'وصلات المفصل (8)');
ok(S.box.pool[0] > G.off(19), 'المسبح بالجهة الشرقية (عكس الميلان)');
ok(S.box.glass[4] <= 161 && S.box.glass[0] < -55, 'الزجاج يلحق الطوابق المنزاحة لحد 160 م');
paths = R.capitalgate.paths(); ok(paths.some(p => p.c === 0xf87171) && paths.every(p => p.pts.every(q => q.every(isFinite))), 'مسار الحمل: وزن + شد');
// ---------------------------------------------------------------- مارينا باي ساندز
ok(fact(R.mbs, 'السكاي بارك') === '340 م' && fact(R.mbs, 'الكابولي') === '67 م' && fact(R.mbs, 'المسبح') === '146 م', 'مارينا باي ساندز: 340 م، كابولي 67 م، مسبح 146 م');
c = stub(); R.mbs.build(c); S = c.S;
near(M.LEN - M.CANT, 67, 1e-9, 'طول الكابولي بالمجسم 67 م'); near(M.LEN, 340, 1e-9, 'طول السكاي بارك 340 م'); ok(S.box.cant[3] >= M.LEN - 2.1 && S.box.skypark[0] <= 2.1, 'الصناديق تغطي الطول كله');
near(S.box.pool[3] - S.box.pool[0] - 2 * 2, 146, 1e-6, 'المسبح 146 م');
ok(M.zoff(M.y23) === 0 && M.zoff(0) === M.SPL && M.zoff(40) > 0, 'الساق المنحنية تلتقي بالعمودية عند الطابق 23');
ok(M.hull(M.CANT + 1) > 9 && M.hull(M.LEN - 2) === 3.5, 'عمق الكابولي ≈ 10 م عند البرج و3.5 م بالطرف');
ok(['eastleg', 'westleg', 'facade', 'atrium', 'truss23', 'tie', 'skypark', 'cant', 'pool', 'garden', 'podium', 'bay', 'piles', 'soil'].every(el => S.n[el] > 0), 'كل عناصر مارينا باي ساندز انبنت');
ok(S.box.westleg[5] > S.box.eastleg[5] + 30, 'قدم الساق المنحنية بعيدة عن الشرقية');
// ---------------------------------------------------------------- فندق الهلال
ok(fact(R.crescent, 'الارتفاع') === '166 م' && fact(R.crescent, 'القوس') === '≈ 90 م بحر' && R.crescent.idea[0].includes('مو بتركيا'), 'فندق الهلال: 166 م، قوس 90 م، وتوضيح الموقع');
near(K.xo(0), K.Ro, 1e-9, 'قاعدة الهلال'); near(K.xi(0) * 2, 90, 1e-9, 'فراغ البوابة 90 م'); ok(K.xo(166) === 0 && K.xi(K.Hi) === 0, 'الهلال ينغلق بالأعلى');
let coresIn = true; for (let y = 0; y <= 128; y += 2) if (K.CX - K.CW / 2 < K.xi(y) || K.CX + K.CW / 2 > K.xo(y)) coresIn = false;
ok(coresIn, 'الألباب تبقى داخل البرجين لحد ارتفاعها');
c = stub(); R.crescent.build(c); S = c.S;
ok(['cores', 'slabs', 'edgecols', 'hung', 'hangers', 'truss', 'arch', 'facade', 'crown', 'podium', 'island', 'bridge', 'sea', 'piles', 'soil'].every(el => S.n[el] > 0), 'كل عناصر فندق الهلال انبنت');
near(S.shape.piles[3], 76, 1e-9, 'طول الركيزة 76 م'); near(S.box.piles[1], -79, 1e-6, 'نهاية الركائز ≈ 79 م تحت السطح');
const hungLv = []; for (let lv = 0; lv <= K.NF; lv++) { const y = lv * K.fh; if (y >= K.HUNG[0] && y < K.HUNG[1] + 0.1) hungLv.push(lv); }
ok(hungLv.length === 5, 'خمس طوابق معلّقة بالضبط (' + hungLv.length + ')');
ok(S.box.arch[3] - S.box.arch[0] >= 89.9 && S.box.facade[4] <= 166.01, 'القوس يعبر 90 م والهلال 166 م');
paths = R.crescent.paths(); ok(paths.some(p => p.c === 0x34d399 && p.pts[1][1] > p.pts[0][1]), 'مسار الحمل: العلّاقات تشد لفوق');

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
process.exit(fails ? 1 : 0);
