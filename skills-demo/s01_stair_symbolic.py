# -*- coding: utf-8 -*-
"""
Skills: sympy + uncertainty-and-units (pint, uncertainties).

1. Re-derive the waist-slab flight design of civil/stairs.flight() symbolically and
   check it, independently, against the numbers the project printed for each stair.
2. Carry units with pint through the load chain, so a dimension slip would raise.
3. Propagate the reading uncertainty of the drawing (waist, span, finish) to Mu by the
   GUM framework (uncertainties) and by Monte Carlo, with the JCGM 101 clause 8 test.
"""
import json
import os

import numpy as np
import pint
import sympy as sp
from uncertainties import ufloat

from common import OUT, load

# ---- 1. symbolic model -------------------------------------------------------
t, R, T, l, f, L, gc, gm = sp.symbols('t R T ell f L gamma_c gamma_m', positive=True)
cos_t = T / sp.sqrt(R ** 2 + T ** 2)
wD = t * gc / cos_t + sp.Rational(1, 2) * R * gm + f            # kN/m² on plan
wu = sp.Rational(6, 5) * wD + sp.Rational(8, 5) * L             # ACI 318-19 5.3.1b
Mu = wu * l ** 2 / 8                                             # simply supported strip

As, fc, fy, b, d, phi = sp.symbols('A_s f_c f_y b d phi', positive=True)
# Mu = φ As fy (d − a/2), a = As fy / (0.85 fc b)  (ACI 22.2, rectangular block)
Mn_eq = sp.Eq(sp.Symbol('M'), phi * As * fy * (d - As * fy / (2 * sp.Rational(85, 100) * fc * b)))
As_roots = sp.solve(Mn_eq, As)
As_expr = min(As_roots, key=lambda e: e.subs({sp.Symbol('M'): 1, phi: 0.9, fy: 420, fc: 25,
                                               b: 1000, d: 100}))
dMu = {s: sp.simplify(sp.diff(Mu, s)) for s in (t, l, f)}

CONST = {f: 1.2, L: 3.0, gc: 24.0, gm: 27.0}
Mu_f = sp.lambdify((t, R, T, l), Mu.subs(CONST), 'math')
wu_f = sp.lambdify((t, R, T), wu.subs(CONST), 'math')
As_f = sp.lambdify((sp.Symbol('M'), d, fc), As_expr.subs({phi: 0.9, fy: 420, b: 1000}), 'math')

# ---- 2. units ----------------------------------------------------------------
ureg = pint.UnitRegistry()
Q = ureg.Quantity


def mu_with_units(waist_mm, Rm, Tm, span_m):
    th = np.arctan2(Rm, Tm)
    w_waist = Q(waist_mm, 'mm') * Q(24, 'kN/m**3') / np.cos(th)
    w_steps = 0.5 * Q(Rm, 'm') * Q(27, 'kN/m**3')
    wd = w_waist + w_steps + Q(1.2, 'kN/m**2')
    wu_q = 1.2 * wd + 1.6 * Q(3.0, 'kN/m**2')
    mu = wu_q * Q(span_m, 'm') ** 2 / 8                          # per metre width
    return wu_q.to('kN/m**2'), mu.to('kN*m/m')


# ---- 3. uncertainty ----------------------------------------------------------
def gum_and_mc(waist, Rm, Tm, span, n=200_000, seed=1):
    # reading uncertainty of a scanned/scaled drawing: rectangular half-widths
    u_t, u_l, u_f = 5 / np.sqrt(3), 0.05 / np.sqrt(3), 0.3 / np.sqrt(3)
    tt, ll, ff = ufloat(waist, u_t, 'waist'), ufloat(span, u_l, 'span'), ufloat(1.2, u_f, 'finish')
    th = np.arctan2(Rm, Tm)
    wu_u = 1.2 * (tt / 1000 * 24 / np.cos(th) + 0.5 * Rm * 27 + ff) + 1.6 * 3.0
    mu_u = wu_u * ll ** 2 / 8
    rng = np.random.default_rng(seed)
    ts = rng.uniform(waist - 5, waist + 5, n)
    ls = rng.uniform(span - 0.05, span + 0.05, n)
    fs = rng.uniform(0.9, 1.5, n)
    mc = (1.2 * (ts / 1000 * 24 / np.cos(th) + 0.5 * Rm * 27 + fs) + 1.6 * 3.0) * ls ** 2 / 8
    lo, hi = np.percentile(mc, [2.5, 97.5])
    U = 1.96 * mu_u.std_dev
    delta = 0.5 * 10 ** (np.floor(np.log10(mu_u.std_dev)) - 1)     # half the last digit
    ok = abs(mu_u.nominal_value - U - lo) <= delta and abs(mu_u.nominal_value + U - hi) <= delta
    return mu_u, (lo, hi, mc.std(ddof=1)), ok


def main():
    data = load()
    rows = []
    for s in data['stairs']:
        if s['spiral'] or not (s['waist'] and s['span'] and s['R'] and s['T'] and s['Mu']):
            continue
        waist, Rm, Tm, span = float(s['waist']), float(s['R']), float(s['T']), float(s['span'])
        mu_sym = Mu_f(waist / 1000, Rm, Tm, span)
        wu_sym = wu_f(waist / 1000, Rm, Tm)
        wu_q, mu_q = mu_with_units(waist, Rm, Tm, span)
        dd = waist - 20 - 6
        fcv = float((data.get('materials', {}).get(s['where']) or {}).get('fc') or 25.0)
        As_calc = max(As_f(mu_sym * 1e6, dd, fcv), 0.0018 * 1000 * waist)
        b1 = min(0.85, max(0.65, 0.85 - 0.05 * (fcv - 28) / 7))       # ACI 22.2.2.4.3
        c = As_calc * 420 / (0.85 * fcv * 1000) / b1
        et = 0.003 * (dd - c) / c                                     # strain compatibility
        rows.append(dict(et=round(et, 4), et_ok=bool(et >= 0.004),where=s['where'], floor=s['floor'], title=s['title'],
                         R=Rm, T=Tm, waist=waist, span=span, fc=fcv,
                         wu_proj=s['wu'], wu_sym=round(wu_sym, 2), wu_pint=round(wu_q.m, 2),
                         Mu_proj=s['Mu'], Mu_sym=round(mu_sym, 2), Mu_pint=round(mu_q.m, 2),
                         As_proj=s['As'], As_sym=round(As_calc, 0),
                         dMu=round(abs(mu_sym - s['Mu']), 2)))
    # uncertainty on three representative stairs
    unc = []
    for key in ('hosp', 'villa', 'lib'):
        s = next((r for r in rows if r['where'] == key), None)
        if not s:
            continue
        mu_u, (lo, hi, sd), ok = gum_and_mc(s['waist'], s['R'], s['T'], s['span'])
        unc.append(dict(where=key, Mu=round(mu_u.nominal_value, 2), u=round(mu_u.std_dev, 2),
                        U95=round(1.96 * mu_u.std_dev, 2), mc_lo=round(lo, 2), mc_hi=round(hi, 2),
                        mc_sd=round(sd, 2), clause8=bool(ok),
                        budget={k.tag or '?': round(abs(v), 3) for k, v in mu_u.error_components().items()}))
    sym = dict(wD=sp.latex(wD), wu=sp.latex(wu), Mu=sp.latex(Mu),
               As=sp.latex(sp.simplify(As_expr)),
               dMu_dt=sp.latex(dMu[t]), dMu_dl=sp.latex(dMu[l]), dMu_df=sp.latex(dMu[f]),
               Mu_pretty=sp.pretty(Mu, use_unicode=True), As_pretty=sp.pretty(As_expr, use_unicode=True))
    json.dump(dict(rows=rows, unc=unc, sym=sym), open(os.path.join(OUT, 's01.json'), 'w'),
              ensure_ascii=False, indent=1)
    worst = max(rows, key=lambda r: r['dMu'])
    print('checked', len(rows), 'flights; worst |ΔMu| =', worst['dMu'], 'kN·m/m at', worst['where'], worst['title'])
    print('εt < 0.004 (ACI 318-19 7.3.3.1):', [(r['where'], r['waist'], r['Mu_proj'], r['et']) for r in rows if not r['et_ok']])
    print('As agreement (|Δ|≤2 mm²):', sum(abs(r['As_sym'] - r['As_proj']) <= 2 for r in rows), '/', len(rows))
    for u in unc:
        print(u)
    print(sym['Mu_pretty'])


if __name__ == '__main__':
    main()
