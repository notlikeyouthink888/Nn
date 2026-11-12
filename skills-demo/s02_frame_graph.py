# -*- coding: utf-8 -*-
"""
Skill: networkx.

The ground floor of Block_4, as the project reader assembled it, becomes a graph:
columns are nodes, beams are edges between the supports at their two ends
(a column, or another beam the end frames into). Graph measures then answer
structural-sanity questions the 3D view only shows visually:

* connected components  -> separate frames that should be one building;
* unsupported beam ends -> a beam end that lands on neither a column nor a beam;
* columns without beams -> isolated columns (flat-slab area or a reading gap);
* bridges               -> single beams whose loss splits the frame (no redundancy);
* load path length      -> hops from each beam end to the nearest column.
"""
import json
import math
import os

import matplotlib.pyplot as plt
import networkx as nx

from common import OUT, ar, load, save, style

TOL_COL = 0.9     # m: beam end within this of a column centre = supported by it
TOL_BEAM = 0.35   # m: beam end within this of another beam's axis = framed into it


def seg_dist(px, py, b):
    x1, y1, x2, y2 = b['x1'], b['y1'], b['x2'], b['y2']
    dx, dy = x2 - x1, y2 - y1
    L2 = dx * dx + dy * dy or 1e-9
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / L2))
    return math.hypot(px - x1 - t * dx, py - y1 - t * dy), t


def build(frame):
    cols, beams = frame['columns'], frame['beams']
    G = nx.Graph()
    for i, c in enumerate(cols):
        G.add_node(('C', i), kind='col', x=c['x'], y=c['y'])
    unsupported = []
    for j, b in enumerate(beams):
        ends = []
        for (px, py) in ((b['x1'], b['y1']), (b['x2'], b['y2'])):
            best = min(((math.hypot(px - c['x'], py - c['y']), i) for i, c in enumerate(cols)),
                       default=(9e9, None))
            if best[0] <= TOL_COL:
                ends.append(('C', best[1]))
                continue
            # framed into another beam (girder): a node on that beam at the junction
            hit = None
            for k, o in enumerate(beams):
                if k == j:
                    continue
                dd, t = seg_dist(px, py, o)
                if dd <= TOL_BEAM:
                    hit = (k, t)
                    break
            if hit:
                n = ('J', j, len(ends))
                G.add_node(n, kind='joint', x=px, y=py)
                G.add_edge(n, ('B', hit[0]), kind='frames-into')
                ends.append(n)
            else:
                n = ('F', j, len(ends))
                G.add_node(n, kind='free', x=px, y=py)
                unsupported.append(dict(beam=j, x=round(px, 2), y=round(py, 2), mark=b.get('mark')))
                ends.append(n)
        # every beam is also a node so that other beams can frame into its span
        G.add_node(('B', j), kind='beam', x=(b['x1'] + b['x2']) / 2, y=(b['y1'] + b['y2']) / 2)
        for e in ends:
            G.add_edge(('B', j), e, kind='end', span=math.hypot(b['x2'] - b['x1'], b['y2'] - b['y1']))
    return G, unsupported


def main():
    data = load()
    fr = data['frame']
    G, unsupported = build(fr)
    comps = sorted(nx.connected_components(G), key=len, reverse=True)
    cols = [n for n, a in G.nodes(data=True) if a['kind'] == 'col']
    beams = [n for n, a in G.nodes(data=True) if a['kind'] == 'beam']
    iso_cols = [n for n in cols if G.degree(n) == 0]
    # bridges that are beam-to-column edges inside the main frame = no alternative load path
    main_c = G.subgraph(comps[0]).copy()
    bridges = [e for e in nx.bridges(main_c) if any(n[0] == 'C' for n in e)]
    col_set = set(cols)
    hops = {}
    for bnode in beams:
        if bnode not in main_c:
            continue
        lengths = nx.single_source_shortest_path_length(main_c, bnode, cutoff=12)
        d = min((v for n, v in lengths.items() if n in col_set), default=None)
        hops[bnode] = d
    deg = {n: G.degree(n) for n in cols}
    res = dict(columns=len(cols), beams=len(beams), components=len(comps),
               comp_sizes=[len(c) for c in comps[:6]],
               comp_cols=[sum(1 for n in c if n[0] == 'C') for c in comps[:6]],
               isolated_columns=len(iso_cols), unsupported_ends=unsupported,
               bridges=len(bridges),
               max_hops=max((v for v in hops.values() if v is not None), default=None),
               hops_hist={str(k): sum(1 for v in hops.values() if v == k) for k in sorted(set(hops.values()), key=lambda v: (v is None, v))},
               col_degree_hist={str(k): sum(1 for v in deg.values() if v == k) for k in sorted(set(deg.values()))},
               avg_clustering=round(nx.average_clustering(G), 3))
    json.dump(res, open(os.path.join(OUT, 's02.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != 'unsupported_ends'}, ensure_ascii=False))
    print('unsupported ends:', len(unsupported))

    # ---- figure ----
    style()
    fig, ax = plt.subplots(figsize=(7.2, 6.0))
    pos = {n: (a['x'], a['y']) for n, a in G.nodes(data=True)}
    comp_of = {}
    for ci, c in enumerate(comps):
        for n in c:
            comp_of[n] = ci
    for j, b in enumerate(fr['beams']):
        ci = comp_of.get(('B', j), 0)
        ax.plot([b['x1'], b['x2']], [b['y1'], b['y2']], lw=1.6 if ci == 0 else 2.4,
                color='#4C72B0' if ci == 0 else '#DD8452', ls='--' if b.get('guess') else '-', zorder=1)
    cx = [pos[n][0] for n in cols]
    cy = [pos[n][1] for n in cols]
    cc = [deg[n] for n in cols]
    sc = ax.scatter(cx, cy, c=cc, cmap='viridis', s=34, edgecolor='k', lw=0.4, zorder=3)
    for u in unsupported:
        ax.scatter(u['x'], u['y'], marker='x', s=60, color='#C44E52', lw=2, zorder=4)
    for n in iso_cols:
        ax.scatter(*pos[n], s=120, facecolor='none', edgecolor='#C44E52', lw=1.5, zorder=4)
    cb = fig.colorbar(sc, ax=ax, shrink=0.7)
    cb.set_label(ar('عدد الجسور الواصلة للعمود'))
    ax.set_aspect('equal')
    ax.set_xlabel('x (m)')
    ax.set_ylabel('y (m)')
    ax.set_title(ar('Block_4 — %s: مخطط الإطار كشبكة (%d عمود، %d جسر، %d مكوّن متصل)'
                    % (fr['floor'], len(cols), len(beams), len(comps))))
    from matplotlib.lines import Line2D
    h = [Line2D([], [], color='#4C72B0', lw=1.6, label=ar('جسر بالإطار الرئيسي')),
         Line2D([], [], color='#4C72B0', lw=1.6, ls='--', label=ar('جسر مفترض')),
         Line2D([], [], color='#DD8452', lw=2.4, label=ar('إطار منفصل')),
         Line2D([], [], marker='x', color='#C44E52', lw=0, label=ar('طرف جسر بلا ركيزة')),
         Line2D([], [], marker='o', mfc='none', mec='#C44E52', lw=0, ms=9, label=ar('عمود بلا جسور'))]
    ax.legend(handles=h, loc='upper left', bbox_to_anchor=(1.18, 1.0), frameon=False)
    save(fig, 's02_frame_graph.png')


if __name__ == '__main__':
    main()
