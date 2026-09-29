# -*- coding: utf-8 -*-
"""
Skill: pymoo (NSGA-II, constrained multi-objective).

The hospital dog-leg stair (floor height 4.20 m, flight width 1.11 m, two flights with a
half landing) is re-designed as an optimisation problem. The structural design of every
candidate is done by the project's own civil/stairs.flight() (imported, not changed), so
the Pareto front is ACI 318-19 compliant by construction.

Variables : n  = number of risers per floor (integer, 20..30)
            T  = tread (m, 0.25..0.33)
            t  = waist thickness (mm, 120..300, rounded to 10)
Objectives: cost of one floor of stair (concrete + steel, IQD — assumed unit prices)
            discomfort = |2R + T − 630 mm|  (Blondel, the ideal pace)
Constraints (g ≤ 0):
            R ≤ 190 mm, T ≥ 250 mm (IBC 1011.5.2); 600 ≤ 2R+T ≤ 650;
            t ≥ ℓ/20 (ACI 318-19 Table 7.3.1.1); Vu ≤ φVc (22.5.5.1);
            εt ≥ 0.004 (7.3.3.1); going of one flight ≤ 3.30 m (fits the drawn opening).
"""
import json
import math
import os
import sys

import matplotlib.pyplot as plt
import numpy as np
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.core.problem import ElementwiseProblem
from pymoo.optimize import minimize
from pymoo.termination import get_termination

from common import HERE, OUT, ar, save, style

sys.path.insert(0, os.path.join(HERE, '..', 'civil'))
import stairs as ST  # noqa: E402
import engine as EN  # noqa: E402

H, W, LAND, FC, FY = 4.20, 1.11, 1.11, 25.0, 420.0
P_CONC = 125_000      # IQD per m³ ready-mix incl. placing  (assumed, editable)
P_STEEL = 1_150_000   # IQD per tonne fixed rebar            (assumed, editable)
P_FORM = 18_000       # IQD per m² soffit formwork           (assumed, editable)
MAX_GOING = 3.30


def design(n, T, t):
    R = H / n
    per = n // 2                                    # risers per flight (dog-leg)
    d = ST.flight(dict(steps=max(2, per - 1), tread=T, rise=R, width=W, fc=FC, fy=FY,
                       landing=LAND, waist=t))
    th = math.atan2(R, T)
    going = (per - 1) * T
    slope_len = going / math.cos(th)
    # concrete for two flights + one half landing + steps
    v_waist = 2 * slope_len * W * t / 1000
    v_steps = 2 * per * 0.5 * R * T * W
    v_land = LAND * (2 * W + 0.1) * t / 1000
    vol = v_waist + v_steps + v_land
    # steel: main + distribution over the sloped length, +10 % laps and bends
    As_main, As_dist = d['main']['As'], d['dist']['As']
    L = 2 * (slope_len + LAND)
    kg = 1.10 * 7850e-6 * (As_main * W * L + As_dist * L * W)
    form = 2 * slope_len * W + LAND * (2 * W + 0.1)
    cost = vol * P_CONC + kg / 1000 * P_STEEL + form * P_FORM
    fl = EN.flexure(d['Mu'], 1000.0, d['d'], FC, FY, t, min_rule='slab')
    return dict(n=n, R=R, T=T, t=t, going=going, vol=vol, kg=kg, cost=cost, Mu=d['Mu'],
                As=d['As'], main=d['main']['label'], span=d['span'], Vu=d['Vu'], phiVc=d['phiVc'],
                et=fl.get('et', 1.0), blondel=(2 * R + T) * 1000)


class StairProblem(ElementwiseProblem):
    def __init__(self):
        super().__init__(n_var=3, n_obj=2, n_ieq_constr=8,
                         xl=np.array([20, 0.25, 120]), xu=np.array([30.999, 0.33, 300]))

    def _evaluate(self, x, out, *a, **k):
        n, T, t = int(x[0]) // 2 * 2, round(x[1], 3), round(x[2] / 10) * 10
        r = design(n, T, t)
        out['F'] = [r['cost'], abs(r['blondel'] - 630)]
        out['G'] = [r['R'] * 1000 - 190, 250 - r['T'] * 1000,
                    600 - r['blondel'], r['blondel'] - 650,
                    r['span'] * 1000 / 20 - t, r['Vu'] - r['phiVc'],
                    0.004 - r['et'], r['going'] - MAX_GOING]


def main():
    res = minimize(StairProblem(), NSGA2(pop_size=80), get_termination('n_gen', 120), seed=7, verbose=False)
    sols = []
    for x in res.X:
        n, T, t = int(x[0]) // 2 * 2, round(x[1], 3), round(x[2] / 10) * 10
        sols.append(design(n, T, t))
    # de-duplicate after rounding
    uniq = {}
    for s in sols:
        uniq[(s['n'], round(s['T'], 2), s['t'])] = s
    front = sorted(uniq.values(), key=lambda s: s['cost'])
    cur = design(24, 0.28, 210)                     # what the project built for the hospital
    json.dump(dict(front=front, current=cur, prices=dict(conc=P_CONC, steel=P_STEEL, form=P_FORM)),
              open(os.path.join(OUT, 's04.json'), 'w'), ensure_ascii=False, indent=1)
    print('current  : n=%d R=%.0f T=%.0f t=%d cost=%.0f dev=%.0f' % (cur['n'], cur['R'] * 1000, cur['T'] * 1000, cur['t'], cur['cost'], abs(cur['blondel'] - 630)))
    for s in front:
        print('pareto   : n=%d R=%.1f T=%.0f t=%d cost=%.0f dev=%.1f main=%s' % (s['n'], s['R'] * 1000, s['T'] * 1000, s['t'], s['cost'], abs(s['blondel'] - 630), s['main']))

    style()
    fig, ax = plt.subplots(figsize=(6.6, 4.2))
    # the whole feasible design space as background
    grid = []
    for n in range(20, 31, 2):
        for T in np.arange(0.25, 0.331, 0.01):
            for t in range(120, 301, 10):
                r = design(n, T, t)
                ok = (r['R'] <= 0.19 and 600 <= r['blondel'] <= 650 and t >= r['span'] * 50 - 1e-6
                      and r['Vu'] <= r['phiVc'] and r['et'] >= 0.004 and r['going'] <= MAX_GOING)
                grid.append((r['cost'], abs(r['blondel'] - 630), ok))
    g = np.array(grid, dtype=float)
    ax.scatter(g[g[:, 2] == 1, 0] / 1e6, g[g[:, 2] == 1, 1], s=6, color='#bbbbbb', label=ar('تصاميم مسموحة (بحث شامل)'))
    fx = [s['cost'] / 1e6 for s in front]
    fy = [abs(s['blondel'] - 630) for s in front]
    ax.plot(fx, fy, '-o', color='#4C72B0', ms=5, lw=1.4, label=ar('جبهة باريتو (NSGA-II)'))
    ax.scatter(cur['cost'] / 1e6, abs(cur['blondel'] - 630), marker='*', s=220, color='#C44E52', zorder=5,
               label=ar('تصميم المشروع الحالي 24×175/280، سماكة 210'))
    for s in (front[0], front[len(front) // 2], front[-1]):
        ax.annotate('%d×%.0f/%.0f  t=%d' % (s['n'], s['R'] * 1000, s['T'] * 1000, s['t']),
                    (s['cost'] / 1e6, abs(s['blondel'] - 630)), textcoords='offset points', xytext=(6, 6), fontsize=7)
    ax.set_xlabel(ar('كلفة درج طابق واحد (مليون دينار — أسعار مفترضة)'))
    ax.set_ylabel(ar('البعد عن الخطوة المثالية |2R+T − 630| مم'))
    ax.set_title(ar('درج المستشفى: الكلفة مقابل الراحة ضمن قيود ACI 318-19'), loc='left')
    ax.legend(frameon=False, fontsize=7.5)
    save(fig, 's04_pareto.png')


if __name__ == '__main__':
    main()
