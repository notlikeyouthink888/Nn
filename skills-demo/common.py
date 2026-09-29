# -*- coding: utf-8 -*-
"""Shared helpers for the skill demos: data loading and Arabic text in matplotlib."""
import json
import os

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
except ImportError:                      # the figures still render, only unshaped
    arabic_reshaper = get_display = None

WHERE = dict(lib='مكتبة الأدراج (f1)', hosp='المستشفى', villa='الفيلا', blk4='Block_4')


def ar(s):
    """Shape and reorder Arabic so matplotlib (LTR, no shaping) draws it correctly."""
    s = str(s)
    if not arabic_reshaper or not any('؀' <= c <= 'ۿ' for c in s):
        return s
    return get_display(arabic_reshaper.reshape(s))


FONT_DIR = os.environ.get('AR_FONT_DIR', '/tmp/claude-0/fonts')   # Noto Sans Arabic / Amiri (OFL)


def style():
    from matplotlib import font_manager as fm
    fam = ['DejaVu Sans']
    if os.path.isdir(FONT_DIR):
        for fn in sorted(os.listdir(FONT_DIR)):
            if fn.lower().endswith(('.ttf', '.otf')):
                fm.fontManager.addfont(os.path.join(FONT_DIR, fn))
        names = {f.name for f in fm.fontManager.ttflist}
        fam = [n for n in ('Noto Sans Arabic', 'Amiri') if n in names][:1] + fam
    plt.rcParams.update({
        'font.family': fam, 'font.size': 9, 'axes.titlesize': 10,
        'axes.labelsize': 9, 'legend.fontsize': 8, 'axes.spines.top': False,
        'axes.spines.right': False, 'savefig.dpi': 200, 'savefig.bbox': 'tight',
        'figure.dpi': 110})


def load():
    return json.load(open(os.path.join(OUT, 'data.json')))


def save(fig, name):
    p = os.path.join(OUT, name)
    fig.savefig(p)
    plt.close(fig)
    print('wrote', p)
    return p
