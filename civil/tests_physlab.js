// اختبارات فيزياء المختبر ضد الحلول المغلقة — node civil/tests_physlab.js
global.window = global; global.document = undefined;
require('./static/physlab.js'); require('./static/physlab_mech.js');
for (const f of ['physlab_dyn', 'rebarkb', 'physlab_rebar', 'physlab_more', 'physlab_more2']) { try { require('./static/' + f + '.js'); } catch (e) { if (!/Cannot find module/.test(e.message)) throw e; } }
const PL = window.PHYSLAB, C = PL.calc;
let fails = 0;
const near = (a, b, tol, msg) => { const ok = Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  console.log((ok ? '✓ ' : '✗ ') + msg + ': ' + a.toFixed(5) + ' vs ' + b.toFixed(5)); if (!ok) fails++; };
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fails++; };
const E = 25e6, I = 0.3 * 0.6 ** 3 / 12, L = 6, w = 20, P = 60;
let r = C.beam({ L, sup: 'ss', w, P: 0, a: 0, E, I });
near(r.Mmax, w * L * L / 8, 1e-3, 'SS UDL Mmax = wL²/8');
near(r.dmax, 5 * w * L ** 4 / (384 * E * I), 1e-4, 'SS UDL δ = 5wL⁴/384EI');
near(r.Vmax, w * L / 2, 1e-6, 'SS UDL Vmax = wL/2');
r = C.beam({ L, sup: 'cant', w: 0, P, a: L, E, I });
near(r.Mmin, -P * L, 1e-6, 'Cantilever tip P: M = −PL');
near(r.dmax, P * L ** 3 / (3 * E * I), 1e-4, 'Cantilever δ = PL³/3EI');
r = C.beam({ L, sup: 'ff', w, P: 0, a: 0, E, I });
near(r.Mmin, -w * L * L / 12, 1e-3, 'Fixed-fixed end M = −wL²/12');
near(r.Mmax, w * L * L / 24, 1e-3, 'Fixed-fixed mid M = wL²/24');
near(r.dmax, w * L ** 4 / (384 * E * I), 1e-4, 'Fixed-fixed δ = wL⁴/384EI');
r = C.beam({ L, sup: 'fp', w, P: 0, a: 0, E, I });
near(r.Mmin, -w * L * L / 8, 1e-3, 'Propped cantilever M = −wL²/8');
near(r.Rr, 3 * w * L / 8, 1e-4, 'Propped R = 3wL/8');
r = C.beam({ L, sup: 'ss', w: 0, P, a: 2, E, I });
near(r.Mmax, P * 2 * 4 / 6, 1e-3, 'SS point load M = Pab/L');
// العمود
let c = C.column({ bc: 'pp', L: 6, b: 300, h: 300, fc: 25, rho: 1.5, P: 0, frame: 'ns', m12: -1 });
const Ec = 4700 * 5, Ig = 300 ** 4 / 12;
near(c.Pcr, Math.PI ** 2 * Ec * Ig / 6000 ** 2 / 1000, 1e-9, 'Euler Pcr pinned');
const c2 = C.column({ bc: 'ff', L: 6, b: 300, h: 300, fc: 25, rho: 1.5, P: 0, frame: 'ns', m12: -1 });
near(c2.Pcr / c.Pcr, 4, 1e-9, 'Fixed-fixed = 4× pinned');
near(c.limit, 22, 1e-9, 'Slenderness limit single curvature = 22');
// شكل الانبعاج fp: y(0)=0, y(1)=0
near(C.bucklingShape('fp', 1), 0, 1e-5, 'fp mode y(L)=0');
// ويتني
const W = C.whitney({ b: 300, h: 600, d: 540, As: 942.48, dp: 60, Asp: 0, fc: 25, fy: 420 });
const a = 942.48 * 420 / (0.85 * 25 * 300);
near(W.a, a, 1e-4, 'Whitney a = As fy/(0.85 fc b)');
near(W.Mn, 942.48 * 420 * (540 - a / 2) / 1e6, 1e-4, 'Whitney Mn');
near(W.phi, 0.9, 1e-9, 'φ tension-controlled');
const s = C.section({ b: 300, h: 600, d: 540, As: 942.48, dp: 60, Asp: 0, fc: 25, fy: 420 }, 0.003, true);
near(s.M, W.Mn, 0.03, 'Fiber analysis at 0.003 ≈ Whitney (±3%)');
if (C.shear) {
  // مبنى طابق واحد: T = 2π√(m/k)
  const d = C.shear({ N: 1, m: 100, k: 40000 });
  near(d.T[0], 2 * Math.PI * Math.sqrt(100 / 40000), 1e-6, 'SDOF period');
  const d2 = C.shear({ N: 2, m: 1, k: 1 });
  near(d2.w[0], Math.sqrt((3 - Math.sqrt(5)) / 2), 1e-6, '2-DOF ω1');
}
if (C.boussinesq) {
  near(C.boussinesq(1, 1, 1, 0, 0, 1), 0.3361, 5e-3, 'Square footing centre z=B: Δσ/q ≈ 0.336');
}
if (C.stair) {
  const q = C.stair({ H: 3.2, N: 20, T: 0.28, t: 180, land: 1.2, width: 1.2, fc: 25 });
  near(q.R, 0.16, 1e-9, 'Stair R = H/N');
  near(q.Mu, q.wu * q.span ** 2 / 8, 1e-9, 'Stair Mu = wu ℓ²/8');
}
if (C.truss) {
  const t = C.truss({ type: 'pratt', n: 4, L: 12, h: 3, P: 0, k: 2, q: 10 });
  near(t.R[1] + t.R[2], 30, 1e-9, 'Truss ΣR = ΣP');
  const top = t.mem.filter(m => m[2] === 'top').map(m => m.N);
  near(Math.min(...top), -20, 1e-6, 'Pratt top chord = −M/h = −60/3');
  const w = C.truss({ type: 'warren', n: 6, L: 18, h: 3, P: 0, k: 3, q: 10 });
  near(w.R[1], 25, 1e-6, 'Warren R = 5·10/2');
}
if (C.navier) { const D = 1, q = 1, a = 1, c = C.navier({ a, b: 1, q, nu: 0.3, D }, .5, .5, 41);
  near(c.w * D / (q * a ** 4), 0.00406, 3e-3, 'Navier square α = 0.00406');
  near(c.mx / (q * a * a), 0.0479, 5e-3, 'Navier square Mx = 0.0479qa² (ν = 0.3)'); }
if (C.mohr) { const m = C.mohr(0, 0, 2, 0); near(m.s1, 2, 1e-12, 'Mohr pure shear σ1 = τ'); near(m.tp * 180 / Math.PI, 45, 1e-9, 'Mohr θp = 45°'); }
if (C.tmd) { let pk = 0; for (let i = 0; i <= 2000; i++) { const w = 0.7 + 0.6 * i / 2000; pk = Math.max(pk, C.tmd({ mu: 0.05, f: 1 / 1.05, z1: 0, z2: Math.sqrt(3 * 0.05 / (8 * 1.05 ** 3)), on: true }, w)); }
  near(pk, Math.sqrt(1 + 2 / 0.05), 0.08, 'TMD Den Hartog peak ≈ √(1 + 2/μ)'); }
if (C.consol) { near(C.consol.U(0.197), 0.5, 1e-2, 'Terzaghi U(0.197) = 50%'); near(C.consol.U(0.848), 0.9, 1e-2, 'Terzaghi U(0.848) = 90%'); }
if (C.retain) { const r = C.retain({ H: 4, tb: 0.5, B: 2.8, toe: 0.25, tb2: 0.35, phi: 30, q: 0, qa: 200 }); near(r.Ka, 1 / 3, 1e-9, 'Rankine Ka(30°) = 1/3'); near(r.Pa, 0.5 * r.Ka * 18 * 4.5 ** 2, 1e-9, 'Pa = ½Kaγ H²');
  const d = C.retain({ H: 4, tb: 0.5, B: 3, toe: 0.25, tb2: 0.35, key: 0.7, phi: 30, q: 10, qa: 200 });
  ok(d.FSo >= 2 && d.FSs >= 1.5 && d.inKern && d.qmax <= 200, 'retain default design passes OT/slide/kern/bearing');
  ok(C.retain({ H: 4, tb: 0.5, B: 1.6, toe: 0.25, tb2: 0.35, key: 0.7, phi: 30, q: 10 }).over, 'retain short base overturns (resultant outside base)'); }
if (C.kz) near(C.kz(10, 'C'), 1.00, 0.01, 'ASCE 7 Kz(10 m, C) ≈ 1.00');
if (C.age) near(C.age({ cem: 'I', T: 20 }, 28).f, 28 / (4 + 0.85 * 28), 1e-12, 'ACI 209 f(28)');
if (C.formP) near(C.formP({ el: 'col', h: 4, R: 2, T: 20, cc: '1', w: 2400, ts: 0.6 }).ccp, 7.2 + 785 * 2 / 37.8, 1e-9, 'ACI 347 CCP (R = 2، T = 20)');
if (C.mander) { const a = C.mander({ b: 500, cover: 40, nb: 4, db: 20, dt: 10, s: 150, cross: true, fc: 28, fyh: 420 }), b = C.mander({ b: 500, cover: 40, nb: 4, db: 20, dt: 10, s: 150, cross: false, fc: 28, fyh: 420 });
  near(+(a.ke > b.ke && a.fcc > b.fcc && a.fcc > 28), 1, 0, 'Mander: crossties raise ke and f\'cc'); }
if (C.devlab) { const d = C.devlab({ db: 16, fy: 420, fc: 31, cov: 40, sp: 200, top: 'y', coat: 'none', tr: 'none', emb: 500 }); near(d.d.ld, 456.4456490198998, 1e-9, 'Dev lab ld = engine.dev_length'); }
if (C.il) { near(C.il({ sup: 'ss', L: 10, x0: 5, q: 'M' }, 5), 2.5, 1e-12, 'IL M midspan = L/4'); near(C.il({ sup: 'ff', L: 10, x0: 5, q: 'M' }, 5), 10 / 8, 1e-3, 'IL fixed-fixed M mid = PL/8'); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
