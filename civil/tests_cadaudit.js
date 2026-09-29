// اختبارات فحص الحديد ولوحة الملخص ودليل عناصر الأوتوكاد — node civil/tests_cadaudit.js
// مبنى صناعي صغير (لا يعتمد على ملفات المستخدم): طابقان، جسور وأعمدة من جداول، بلاطة، أساسات مصمَّمة.
global.window = global; global.document = undefined;
require('./static/rebarkb.js'); require('./static/cadaudit.js');
const A = window.CADAUDIT;
let fails = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fails++; };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${(+a).toFixed(3)} vs ${(+b).toFixed(3)}`);

const bar = (n, d) => ({ n, d }), tie = (d, s, sets) => ({ d, s, sets: sets || null });
const S = {
  beams: {
    B1: { mark: 'B1', b: 300, h: 600, bot: { cont: bar(3, 20), extra: bar(2, 20) }, top: { cont: bar(2, 20), sup: bar(2, 20) }, stir: { end: tie(10, 100), mid: tie(10, 200) }, side: null },
    B2: { mark: 'B2', b: 250, h: 500, bot: { cont: bar(3, 25), extra: null }, top: { cont: bar(3, 25), sup: bar(3, 25) }, stir: { end: tie(10, 150), mid: tie(10, 250) }, side: null },
    B3: { mark: 'B3', b: 400, h: 1000, bot: { cont: bar(4, 25), extra: null }, top: { cont: bar(4, 25), sup: null }, stir: { end: tie(10, 150), mid: tie(10, 200) }, side: null }
  },
  columns: {
    C1: { ground: { main: bar(14, 32), ties: tie(10, 250, 3) }, first: { main: bar(12, 25), ties: null } },
    C2: { ground: { main: bar(4, 16), ties: tie(8, 300, 1) }, first: { main: bar(4, 16), ties: tie(8, 300, 1) } }
  }
};
const col = (x, y, mark, b, h, fk) => ({ x, y, b, h, shape: 'rect', mark, ax: String(x), ay: String(y), rebar: S.columns[mark][fk] });
const beam = (x1, y1, x2, y2, mark, o) => { const s = S.beams[mark]; return { x1, y1, x2, y2, b: s.b, h: s.h, mark, axis: 'A', o, span: Math.hypot(x2 - x1, y2 - y1), cant: false,
  rebar: { bot: s.bot, top: s.top, stir: s.stir, side: s.side }, guess: false }; };
const floor = (key, name, level) => ({ key, name, level, h: 3.5, slab: { t: 180, rects: [[0, 0, 12, 6]], openings: [], mesh: { bot: tie(12, 200), top: tie(10, 200) }, ribs: null, drops: [], beamless: false },
  columns: [col(0, 0, 'C1', 600, 300, key), col(6, 0, 'C1', 600, 300, key), col(12, 0, 'C2', 300, 300, key), col(0, 6, 'C2', 300, 300, key), col(6, 6, 'C2', 300, 300, key), col(12, 6, 'C2', 300, 300, key)],
  beams: [beam(0, 0, 6, 0, 'B1', 'h'), beam(6, 0, 12, 0, 'B1', 'h'), beam(0, 6, 6, 6, 'B2', 'h'), beam(6, 6, 12, 6, 'B2', 'h'), beam(0, 0, 0, 6, 'B3', 'v'), beam(12, 0, 12, 6, 'B3', 'v')] });
const B = { name: 'T', grid: { x: [{ name: '1', pos: 0 }, { name: '2', pos: 6 }, { name: '3', pos: 12 }], y: [{ name: 'A', pos: 0 }, { name: 'B', pos: 6 }] },
  floors: [floor('ground', 'الأرضي', 0), floor('first', 'الأول', 3.5)],
  footings: [{ x: 0, y: 0, col: 'C1', B: 2.2, h: 500, PD: 600, PL: 200, Pu: 1040, db: 16, s: 200, ok: true, designed: true },
             { x: 12, y: 6, col: 'C2', B: 1.4, h: 400, PD: 200, PL: 60, Pu: 336, db: 12, s: 200, ok: true, designed: true }], strips: [], height: 7, size: [12, 6] };
const RES = { schedules: S, materials: { fc: 28 }, buildings: [B] };

// ١) المقاومات المغلقة
const fx = A._t.flex(1473, 300, 540, 28, 420), a = 1473 * 420 / (0.85 * 28 * 300);
near(fx.a, a, 1e-9, 'Whitney a = As·fy/(0.85·fc·b)');
near(fx.phiMn, 0.9 * 1473 * 420 * (540 - a / 2) / 1e6, 1e-9, 'φMn tension-controlled = 0.9·As·fy·(d − a/2)');
const sh = A._t.shear(300, 540, 28, 157, 150);
near(sh.Vc, 0.17 * Math.sqrt(28) * 300 * 540 / 1000, 1e-9, 'Vc = 0.17√fc·b·d');
near(sh.Vs, 157 * 420 * 540 / 150 / 1000, 1e-9, 'Vs = Av·fy·d/s');

// ٢) توزيع أسياخ العمود يختار أوسع خلوص (14Ø32 في 600×300)
const F = A._t.faces(14, 600, 300, 32, 50);
ok(F.nx === 6 && F.ny === 3, 'faces 14Ø32/600×300 → 6 × 3 (best clear spacing)');
near(F.m, 52, 1e-9, 'min clear spacing on best distribution');

// ٣) التدقيق
const au = A.audit(RES, B, { LL: 3 });
const it = k => au.items.find(x => x.key === k), st = (k, name) => (it(k).checks.find(c => c.name.startsWith(name)) || {}).state;
ok(au.items.filter(x => x.kind === 'beam').length === 3, 'three beam marks audited');
ok(st('beam|B1', 'أقل حديد سفلي') === 'ok', 'B1 minimum steel ok');
ok(st('beam|B2', 'أقصى تباعد للكانات بالمنتصف') === 'fail', 'B2 stirrups @250 > d/2 → fail (9.7.6.2.2)');
ok(st('beam|B2', 'أقصى حديد') === 'fail', 'B2 6Ø25 top in 250 wide → over max steel (9.3.3.1)');
ok(st('beam|B3', 'حديد جانبي') === 'fail', 'B3 h = 1000 without skin steel → fail (9.7.2.3)');
ok(st('col|C1|ground', 'الخلوص بين الأسياخ') === 'ok', 'C1 ground 14Ø32 fits with best face distribution');
ok(st('col|C1|first', 'الأتاري بهذا الطابق') === 'warn', 'C1 first: empty tie cell inherits from ground with warning');
ok(st('col|C2|ground', 'قطر الأتاري') === 'fail', 'C2 Ø8 ties < Ø10 → fail (25.7.2.2)');
ok(st('col|C2|ground', 'نسبة التسليح') === 'fail', 'C2 4Ø16 in 300×300: ρ = 0.89% < 1% → fail (10.6.1.1)');
ok(au.items.some(x => x.kind === 'slab') && au.items.some(x => x.kind === 'footing'), 'slab and footing items present');
ok(au.items.filter(x => x.c).every(x => !!A.ctxFromKey(x.key, B, RES, {})), 'every audit row opens a dossier context');

// ٤) الكميات
const Q = A.qty(RES, B, { LL: 3 });
const colConc = 2 * (2 * 0.6 * 0.3 + 4 * 0.3 * 0.3) * (3.5 - 0.18);
near(Q.tot.col[0], colConc, 1e-9, 'column concrete = Σ b·h·(H − t)');
near(Q.tot.slab[0], 2 * 12 * 6 * 0.18, 1e-9, 'slab concrete = area × t');
near(Q.tot.foot[0], 2.2 * 2.2 * 0.5 + 1.4 * 1.4 * 0.4, 1e-9, 'footing concrete = B²·h');
ok(Q.steel > 0 && isFinite(Q.steel) && Object.keys(Q.byD).length >= 4, 'steel by diameter computed');
near(Object.values(Q.byD).reduce((x, y) => x + y, 0), Q.steel, 1e-9, 'Σ by-diameter = total steel');

// ٥) السياق من المجسم + جدول القطع + المختبر المزروع
const u = Object.assign({ kind: 'beam', fkey: 'ground', floor: 'الأرضي', rebar: B.floors[0].beams[0].rebar, mark: 'B1' }, B.floors[0].beams[0]);
const c = A.ctxFromPick(u, B, RES, { LL: 3 });
ok(c && c.geo && c.geo.kind === 'end', 'B1 first span is an end span (neighbour on the right)');
near(c.geo.trib, 3, 1e-9, 'edge beam tributary = half the 6 m bay');
const rows = A._t.bbs(c);
ok(rows.some(r => r.mark === 'S1') && rows.every(r => r.kg > 0 && isFinite(r.L)), 'beam BBS rows valid');
const sd = A._t.labSeed(c, B, { LL: 3 });
ok(sd.labs.includes('beam') && sd.vals.beam.sup === 'fp' && sd.vals.section.b === 300, 'beam lab seeded with element data (fp, b = 300)');
const cc = A.ctxFromPick({ kind: 'col', fkey: 'ground', b: 600, h: 300, x: 0, y: 0, rebar: S.columns.C1.ground, mark: 'C1' }, B, RES, {});
near(cc.geo.Pu, 1040, 1e-9, 'ground column Pu = footing Pu (all floors above)');
const cf = A.ctxFromPick({ kind: 'col', fkey: 'first', b: 600, h: 300, x: 0, y: 0, rebar: S.columns.C1.first, mark: 'C1' }, B, RES, {});
near(cf.geo.Pu, 520, 1e-9, 'first-floor column Pu = ½ of base (1 of 2 floors)');

// ٦) الواجهات بلا انهيار ولا NaN
const H = A.dashHtml(RES, B, { LL: 3 }) + A.auditHtml(RES, B, { LL: 3 });
ok(!/NaN|undefined/.test(H), 'dashboard + audit HTML without NaN/undefined');
ok(A.dashHtml({}, null).length > 0 && A.auditHtml({}, { floors: [] }).length > 0, 'empty inputs render politely');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
