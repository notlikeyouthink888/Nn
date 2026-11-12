# -*- coding: utf-8 -*-
"""
Extract the numbers the skill demos need from the project's own reader.

Read-only: imports civil/cadread.py and calls read_set(); nothing in civil/ is changed.
The DWG-derived JSON fixtures are proprietary, so they are read from env vars
(same names as civil/tests_cad.py) and the output goes to skills-demo/out/ (git-ignored).

    CAD_FIXTURE=blk4.json HOSP_FIXTURE=hosp.json VILLA_FIXTURE=villa.json \
    LIB_FIXTURE=f1.json python3 skills-demo/extract.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'civil'))
import cadread  # noqa: E402

OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

SRC = dict(blk4='CAD_FIXTURE', hosp='HOSP_FIXTURE', villa='VILLA_FIXTURE', lib='LIB_FIXTURE')


def stair_row(s, where, floor=None):
    d = s.get('design') or {}
    chk = s.get('checks') or []
    return dict(where=where, floor=floor, title=s.get('title'), src=s.get('src') or s.get('H_src'),
                H=s.get('H'), N=s.get('N') or s.get('n_risers'), R=s.get('R'), T=s.get('T'),
                width=s.get('width'), waist=d.get('waist'), span=d.get('span'), wu=d.get('wu'),
                Mu=d.get('Mu'), As=d.get('As'), main=d.get('main'), dist=d.get('dist'),
                reaction=d.get('reaction'), spiral='حلزوني' in str(s.get('src') or ''),
                connect=s.get('connect'),
                checks=[dict(name=c.get('name'), ok=bool(c.get('ok')), warn=bool(c.get('warn')),
                             val=c.get('val'), lim=c.get('lim'), clause=c.get('clause')) for c in chk])


def slab_area(slab):
    a = 0.0
    for r in (slab or {}).get('rects') or []:
        try:
            x1, y1, x2, y2 = r[:4] if isinstance(r, (list, tuple)) else (r['x1'], r['y1'], r['x2'], r['y2'])
            a += abs(x2 - x1) * abs(y2 - y1)
        except Exception:
            pass
    return round(a, 1)


def main():
    data = dict(stairs=[], floors=[], frame=None, materials={})
    for key, env in SRC.items():
        path = os.environ.get(env)
        if not path or not os.path.exists(path):
            print('skip', key, '(%s not set)' % env)
            continue
        R = cadread.read_set(json.load(open(path)))
        data['materials'][key] = R.get('materials') or {}
        for s in R.get('stairs') or []:
            data['stairs'].append(stair_row(s, key, s.get('floor')))
        for bi, B in enumerate(R['buildings']):
            for F in B['floors']:
                for s in F.get('stairs') or []:
                    data['stairs'].append(stair_row(s, key, F['name']))
                data['floors'].append(dict(where=key, building=bi, name=F['name'], h=F.get('h'),
                                           columns=len(F.get('columns') or []),
                                           beams=len(F.get('beams') or []),
                                           beam_len=round(sum(b.get('span') or 0 for b in F.get('beams') or []), 1),
                                           walls=len(F.get('walls') or []),
                                           slab_t=(F.get('slab') or {}).get('t'),
                                           slab_area=slab_area(F.get('slab'))))
            if key == 'blk4' and bi == 0:
                F = B['floors'][0]
                data['frame'] = dict(
                    floor=F['name'],
                    columns=[dict(x=c['x'], y=c['y'], b=c.get('b'), h=c.get('h'), mark=c.get('mark'))
                             for c in F.get('columns') or []],
                    beams=[dict(x1=b['x1'], y1=b['y1'], x2=b['x2'], y2=b['y2'], b=b.get('b'),
                                h=b.get('h'), mark=b.get('mark'), guess=bool(b.get('guess')))
                           for b in F.get('beams') or []])
        print(key, 'ok')
    json.dump(data, open(os.path.join(OUT, 'data.json'), 'w'), ensure_ascii=False, indent=1, default=str)
    print('stairs', len(data['stairs']), 'floors', len(data['floors']))


if __name__ == '__main__':
    main()
