// اختبارات كتاب قواعد الحديد ضد دوال الخادم (Python) والحسابات اليدوية — node civil/tests_rebar.js
global.window = global;
const R = require('./static/rebarkb.js');
let fails = 0;
const near = (a, b, tol, msg) => { const ok = Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  console.log((ok ? '✓ ' : '✗ ') + msg + ': ' + (+a).toFixed(3) + ' vs ' + (+b).toFixed(3)); if (!ok) fails++; };
// مطابقة engine.dev_length / rebar.hook_full / engine.lap_length
near(R.ld({ db: 16, fc: 31, fy: 420, top: true, cover: 40 }).ld, 456.4456490198998, 1e-9, 'ld Ø16 علوي = Python');
near(R.ld({ db: 16, fc: 31, fy: 420, cover: 40 }).ld, 351.11203770761523, 1e-9, 'ld Ø16 سفلي = Python');
near(R.ld({ db: 25, fc: 25, fy: 420, cover: 40 }).ld, 909.090909090909, 1e-9, 'ld Ø25 = Python');
near(R.ld({ db: 20, fc: 28, fy: 420, cover: 40, coat: 'epoxy' }).ld, 865.8822472575024, 1e-9, 'ld Ø20 إيبوكسي = Python');
near(R.hook(10, 135, 'tie').added, 133.90486225480862, 1e-9, 'عكفة أتاري Ø10 135° = Python');
near(R.hook(16, 90, 'bar').added, 279.9645943005142, 1e-9, 'عكفة Ø16 90° = Python');
near(R.bendDia(28), 224, 1e-9, 'قطر ثني Ø28 = 8db');
near(R.bendDia(10, 'tie'), 40, 1e-9, 'قطر ثني أتاري Ø10 = 4db');
near(R.lapTension({ db: 16, fc: 31, fy: 420, cover: 40 }).lap, 456.4456490198998, 1e-9, 'وصلة صنف B Ø16 = Python lap_length');
near(R.lapComp({ db: 16, fc: 31, fy: 420 }).lap, 477.12, 1e-9, 'وصلة انضغاط Ø16 = 0.071·fy·db');
near(R.ldc({ db: 16, fc: 31, fy: 420 }).ldc, 289.6674311087826, 1e-9, 'ldc Ø16 = Python (الدولات)');
// يدوي: ldh Ø20، f'c=28، بلا تطويق وخارج اللب: (420·1·1.6·1.25·(28/105+0.6)/(23·√28))·20^1.5
const pc = 28 / 105 + 0.6, hand = 420 * 1.6 * 1.25 * pc / (23 * Math.sqrt(28)) * Math.pow(20, 1.5);
near(R.ldh({ db: 20, fc: 28, fy: 420 }).ldh, hand, 1e-12, 'ldh Ø20 (25.4.3.1)');
near(R.ldh({ db: 12, fc: 40, fy: 420, confined: true, inCore: true }).ldh, 150, 1e-9, 'ldh ≥ 150 مم');
// المسافات والتشقق
near(R.clearMin(20, 20), 26.667, 1e-3, 'الخلوص = 4/3 الركام');
near(R.sMaxCrack(420, 50), 255, 1e-9, 'تباعد التشقق fs=280، cc=50 ⇒ 255');
near(R.asMinBeam(25, 420, 300, 540), 1.4 / 420 * 300 * 540, 1e-9, 'As,min = 1.4/fy·b·d (f\'c 25)');
near(R.tieS(16, 10, 300, 400).s, 256, 1e-9, 'تباعد الأتاري = 16db');
near(R.seisBeam({ sys: 'smf', d: 540, h: 600, dbL: 20, dt: 10 }).s, 120, 1e-9, 'كانات SMF = 6db');
near(R.seisCol({ sys: 'smf', b: 400, h: 400, ln: 3000, dbL: 20, dt: 10, hx: 200 }).so, 100, 1e-9, 'so عمود SMF = b/4');
near(R.spiralRho(Math.PI * 200 ** 2, Math.PI * 160 ** 2, 28, 420), 0.45 * (400 ** 2 / 320 ** 2 - 1) * 28 / 420, 1e-12, 'ρs الحلزون');
const st = R.stirrupCut(300, 600, 40, 10, 135);
near(st.a, 210, 1e-9, 'بُعد الكانة على المحور');
// ملصق الطباعة: كل رقم = قيمة الكتاب مقرّبة للأعلى لأقرب 10 مم
const PS = require('./static/rebarposter.js'), rows = PS.rows(28, 420, 40);
rows.forEach(x => { const ld = R.ld({ db: x.db, fc: 28, fy: 420, cover: 40 }).ld, lp = R.lapTension({ db: x.db, fc: 28, fy: 420, cover: 40 }).lap;
  near(Math.max(0, x.ld - ld), 5, 1, 'ملصق ld Ø' + x.db + ' ضمن [ld ، ld+10)'); near(Math.max(0, x.lapB - lp), 5, 1, 'ملصق وصلة Ø' + x.db + ' ضمن [lap ، lap+10)'); });
near(/NaN|undefined/.test(PS.html(30, 520)) ? 1 : 0, 0, 0, 'ملصق fy 520 بلا NaN');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
