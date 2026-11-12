# -*- coding: utf-8 -*-
"""
Skill: simpy (discrete-event simulation).

Construction cycle of the hospital superstructure, floor by floor, driven by the
quantities the project reader assembled (columns, beam length, slab area, stairs per
floor). Crews and the concrete pump are shared resources; durations are triangular
(optimistic / likely / pessimistic) around assumed productivities, and a pump breakdown
can delay a pour. 400 Monte Carlo replications give the P50/P80 duration, one
replication is drawn as a Gantt chart.

All productivities below are ASSUMPTIONS for illustration (typical Iraqi site rates);
edit them to your contractor's figures.
"""
import json
import os
import random

import matplotlib.pyplot as plt
import numpy as np
import simpy

from common import OUT, ar, load, save, style

PROD = dict(col_form=6.0,        # columns formed + rebar fixed per crew-day
            slab_form=60.0,      # m² slab+beam soffit formwork per crew-day
            beam_form=30.0,      # m of beam sides per crew-day
            rebar=3.0,           # tonnes fixed per rebar gang-day (≈8 fixers)
            pour=260.0,          # m³ per pump-day
            stair=1.0)           # days per stair flight pair (form + rebar)
KG_PER_M2 = 105.0                # kg rebar per m² floor (slab + beams + columns), assumed
CURE_STRIP = 7                   # days before the floor above can be loaded (props stay)
P_BREAK = 0.08                   # pump breakdown chance per pour
BREAK_DAYS = (1, 2, 4)


def tri(rng, m, lo=0.85, hi=1.35):
    return rng.triangular(m * lo, m, m * hi)


def run(floors, seed, log=None):
    rng = random.Random(seed)
    env = simpy.Environment()
    form = simpy.Resource(env, capacity=3)       # three formwork crews
    rebar = simpy.Resource(env, capacity=3)      # three rebar gangs
    pump = simpy.Resource(env, capacity=1)

    def task(name, fl, res, dur):
        with res.request() as rq:
            yield rq
            t0 = env.now
            yield env.timeout(dur)
            if log is not None:
                log.append((fl, name, t0, env.now))

    def floor_proc(i, F, prev_done):
        if prev_done is not None:
            yield prev_done                          # floor below cured enough to load
        area = F['slab_area'] or 1.0
        t_steel = area * KG_PER_M2 / 1000
        yield env.process(task('أعمدة', i, form, tri(rng, F['columns'] / PROD['col_form'] / 3)))
        yield env.process(task('صب الأعمدة', i, pump, tri(rng, 0.5)))
        f1 = env.process(task('قالب السقف والجسور', i, form,
                              tri(rng, area / PROD['slab_form'] / 3 + F['beam_len'] / PROD['beam_form'] / 3)))
        f2 = env.process(task('الأدراج', i, form, tri(rng, max(1, F['stairs']) * PROD['stair'] / 2)))
        yield f1 & f2
        yield env.process(task('حديد السقف', i, rebar, tri(rng, t_steel / PROD['rebar'] / 3)))
        vol = area * 0.2 + F['beam_len'] * 0.25 * 0.65
        dur = tri(rng, vol / PROD['pour'], 1.0, 1.2)
        if rng.random() < P_BREAK:
            dur += rng.choice(BREAK_DAYS)
        yield env.process(task('صب السقف', i, pump, dur))
        yield env.timeout(CURE_STRIP)
        if log is not None:
            log.append((i, 'معالجة', env.now - CURE_STRIP, env.now))

    prev = None
    for i, F in enumerate(floors):
        prev = env.process(floor_proc(i, F, prev))
    env.run()
    return env.now


def main():
    data = load()
    floors = [dict(f) for f in data['floors'] if f['where'] == 'hosp']
    n_st = {}
    for s in data['stairs']:
        if s['where'] == 'hosp':
            n_st[s['floor']] = n_st.get(s['floor'], 0) + 1
    for f in floors:
        f['stairs'] = n_st.get(f['name'], 0)
    durs = np.array([run(floors, s) for s in range(400)])
    p50, p80, p95 = np.percentile(durs, [50, 80, 95])
    log = []
    run(floors, 11, log)
    json.dump(dict(p50=round(p50, 1), p80=round(p80, 1), p95=round(p95, 1), mean=round(durs.mean(), 1),
                   floors=[dict(name=f['name'], area=f['slab_area'], cols=f['columns'], beam_len=f['beam_len'],
                                stairs=f['stairs']) for f in floors],
                   assumptions=dict(prod=PROD, kg_m2=KG_PER_M2, cure=CURE_STRIP, p_break=P_BREAK)),
              open(os.path.join(OUT, 's05.json'), 'w'), ensure_ascii=False, indent=1)
    print('duration days  P50=%.1f  P80=%.1f  P95=%.1f' % (p50, p80, p95))

    style()
    fig, (ax, ah) = plt.subplots(1, 2, figsize=(10.5, 4.0), gridspec_kw=dict(width_ratios=[2.2, 1]))
    acts = ['أعمدة', 'صب الأعمدة', 'قالب السقف والجسور', 'الأدراج', 'حديد السقف', 'صب السقف', 'معالجة']
    cols = dict(zip(acts, ['#8172B3', '#937860', '#4C72B0', '#DA8BC3', '#DD8452', '#C44E52', '#CCCCCC']))
    for fl, name, t0, t1 in log:
        lane = acts.index(name)
        y = fl * (len(acts) + 1) + lane
        ax.barh(y, t1 - t0, left=t0, height=0.85, color=cols[name], edgecolor='none')
    ax.set_yticks([i * (len(acts) + 1) + len(acts) / 2 for i in range(len(floors))],
                  [ar(f['name']) for f in floors])
    ax.invert_yaxis()
    ax.set_xlabel(ar('اليوم من بدء الهيكل'))
    ax.set_title(ar('مخطط جانت لتنفيذ هيكل المستشفى (محاكاة واحدة)'), loc='left')
    from matplotlib.patches import Patch
    ax.legend(handles=[Patch(color=cols[a], label=ar(a)) for a in acts], ncol=4, frameon=False,
              fontsize=7, loc='upper center', bbox_to_anchor=(0.5, -0.24))
    ah.hist(durs, bins=24, color='#4C72B0', alpha=0.85)
    for v, lab, ha in ((p50, 'P50', 'right'), (p80, 'P80', 'left')):
        ah.axvline(v, color='k', lw=1, ls='--')
        ah.text(v, ah.get_ylim()[1] * 0.97, ' %s=%.0f ' % (lab, v), fontsize=7.5, va='top', ha=ha,
                bbox=dict(fc='white', ec='none', pad=0.5))
    ah.set_xlabel(ar('المدة الكلية (يوم)'))
    ah.set_ylabel(ar('عدد المحاكاة من 400'))
    ah.set_title(ar('توزيع المدة (مونت كارلو)'), loc='left')
    fig.tight_layout()
    save(fig, 's05_schedule.png')


if __name__ == '__main__':
    main()
