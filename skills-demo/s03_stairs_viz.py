# -*- coding: utf-8 -*-
"""
Skills: matplotlib + seaborn + scientific-visualization + exploratory-data-analysis
        + statistical-analysis.

Every stair the reader found (sections and plans, four real files) on one comfort chart,
the pass rate of every code check with a Wilson 95% interval, and a descriptive table.
"""
import json
import os
from collections import defaultdict

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from statsmodels.stats.proportion import proportion_confint

from common import OUT, WHERE, ar, load, save, style


def frame(data):
    rows = []
    for s in data['stairs']:
        if not (s['R'] and s['T']):
            continue
        n_ok = sum(c['ok'] for c in s['checks'])
        rows.append(dict(where=WHERE.get(s['where'], s['where']), R=s['R'] * 1000, T=s['T'] * 1000,
                         blondel=2 * s['R'] * 1000 + s['T'] * 1000, H=s['H'], N=s['N'],
                         waist=s['waist'], Mu=s['Mu'], spiral=s['spiral'],
                         checks=len(s['checks']), ok=n_ok))
    return pd.DataFrame(rows)


def check_rates(data):
    agg = defaultdict(lambda: [0, 0, 0])
    for s in data['stairs']:
        for c in s['checks']:
            name = c['name'].split(' (')[0]
            agg[name][0] += c['ok']
            agg[name][1] += 1
            agg[name][2] += (not c['ok']) and c['warn']      # a warning, not a failure
    out = []
    for k, (ok, n, wn) in agg.items():
        if n < 3:
            continue
        if wn and wn == n - ok:
            k += ' (تنبيه فقط)'
        lo, hi = proportion_confint(ok, n, alpha=0.05, method='wilson')
        out.append(dict(check=k, ok=ok, n=n, rate=ok / n, lo=lo, hi=hi))
    return pd.DataFrame(out).sort_values('rate')


def main():
    data = load()
    df = frame(data)
    style()
    pal = dict(zip(df['where'].unique(), sns.color_palette('colorblind', df['where'].nunique())))

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4), gridspec_kw=dict(width_ratios=[1, 1.15]))
    # ---- A: comfort chart
    T = np.linspace(230, 340, 50)
    a1.fill_between(T, (600 - T) / 2, (650 - T) / 2, color='#55A868', alpha=0.15, lw=0,
                    label=ar('نطاق بلوندل 600 ≤ 2R+T ≤ 650'))
    a1.axhline(190, color='#C44E52', lw=1, ls='--')
    a1.text(335, 191.5, ar('حد القائمة 190 مم'), ha='right', va='bottom', color='#C44E52', fontsize=7.5)
    a1.axvline(250, color='#C44E52', lw=1, ls=':')
    a1.text(251, 198, ar('أقل نائمة 250'), rotation=90, color='#C44E52', fontsize=7.5, va='top')
    rng = np.random.default_rng(0)
    for w, g in df.groupby('where'):
        jx = rng.uniform(-2.5, 2.5, len(g))          # jitter: many stairs share R/T exactly
        jy = rng.uniform(-1.2, 1.2, len(g))
        a1.scatter(g['T'] + jx, g['R'] + jy, s=np.where(g['spiral'], 70, 26),
                   marker='o', color=pal[w], edgecolor='k', lw=0.3, alpha=0.85, label=ar(w))
    sp = df[df['spiral']]
    if len(sp):
        a1.scatter(sp['T'], sp['R'], s=150, facecolor='none', edgecolor='k', lw=1, label=ar('حلزوني (عند خط المشي)'))
    a1.set_xlim(230, 340)
    a1.set_ylim(120, 200)
    a1.set_xlabel(ar('النائمة T (مم)'))
    a1.set_ylabel(ar('القائمة R (مم)'))
    a1.set_title(ar('A — راحة الدرج: %d درجاً من 4 ملفات حقيقية' % len(df)), loc='left')
    a1.legend(loc='lower left', frameon=False, fontsize=7)

    # ---- B: pass rate of each check
    cr = check_rates(data)
    y = np.arange(len(cr))
    col = ['#CCB974' if 'تنبيه' in c else '#55A868' if r >= 0.9 else '#DD8452' if r >= 0.6 else '#C44E52'
           for c, r in zip(cr['check'], cr['rate'])]
    a2.barh(y, cr['rate'] * 100, color=col, height=0.62)
    a2.errorbar(cr['rate'] * 100, y, xerr=[((cr['rate'] - cr['lo']) * 100).clip(lower=0), ((cr['hi'] - cr['rate']) * 100).clip(lower=0)],
                fmt='none', ecolor='k', lw=0.8, capsize=2)
    a2.set_yticks(y, [ar(c) for c in cr['check']], fontsize=7.5)
    for yi, (ok, n) in enumerate(zip(cr['ok'], cr['n'])):
        a2.text(101, yi, '%d/%d' % (ok, n), va='center', fontsize=7)
    a2.set_xlim(0, 112)
    a2.set_xlabel(ar('نسبة النجاح % (فاصل ويلسون 95%)'))
    a2.set_title(ar('B — نجاح فحوص الكود لكل الأدراج'), loc='left')
    fig.tight_layout()
    save(fig, 's03_stairs.png')

    desc = df.groupby('where')[['R', 'T', 'blondel', 'H', 'N', 'waist', 'Mu']].agg(['count', 'mean', 'min', 'max']).round(1)
    comfort = df.assign(inband=df['blondel'].between(600, 650)).groupby('where')['inband'].mean().round(3)
    res = dict(n=len(df), by_source=df['where'].value_counts().to_dict(),
               blondel_in_band=comfort.to_dict(),
               checks=cr.round(3).to_dict('records'),
               describe=json.loads(desc.to_json()))
    json.dump(res, open(os.path.join(OUT, 's03.json'), 'w'), ensure_ascii=False, indent=1)
    print(df['where'].value_counts().to_dict())
    print('Blondel in band:', comfort.to_dict())
    print(cr[['check', 'ok', 'n']].to_string(index=False))


if __name__ == '__main__':
    main()
