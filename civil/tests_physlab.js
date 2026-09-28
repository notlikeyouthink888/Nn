// اختبارات فيزياء المختبر ضد الحلول المغلقة — node civil/tests_physlab.js
global.window = global; global.document = undefined;
require('./static/physlab.js'); require('./static/physlab_mech.js');
try { require('./static/physlab_dyn.js'); } catch (e) { if (!/Cannot find module/.test(e.message)) throw e; }
const PL = window.PHYSLAB, C = PL.calc;
let fails = 0;
const near = (a, b, tol, msg) => { const ok = Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  console.log((ok ? '✓ ' : '✗ ') + msg + ': ' + a.toFixed(5) + ' vs ' + b.toFixed(5)); if (!ok) fails++; };
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
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
