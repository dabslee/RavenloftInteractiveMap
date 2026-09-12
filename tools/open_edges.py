"""Decide which room-outline edges are open boundaries rather than walls.

A wall shows drawn stone on at least one side of the line: dark pixels in the
strip beside it. An edge that has pale floor on both sides and no dark stroke
under it is a boundary the mapper drew, not a wall, so sight should pass.
Anything in between is left exactly as it was.
"""
import json, math
from PIL import Image
import numpy as np

ROOT = '/mnt/user-data/uploads/Ravenloft/'
DATA = json.load(open('/home/claude/ravenloft-vtt/castle-data.json'))
IMG = {l['id']: l['dmMap'] for l in DATA['levels']}

_c = {}
def luma(lv):
    if lv not in _c:
        a = np.asarray(Image.open(ROOT + IMG[lv]).convert('RGB')).astype(np.float32)
        _c[lv] = 0.299*a[:,:,0] + 0.587*a[:,:,1] + 0.114*a[:,:,2]
    return _c[lv]

OFFS = (3, 5, 7, 9, 11, 13)

def profile(lv, a, b, n=48):
    y = luma(lv); H, W = y.shape
    L = math.hypot(b[0]-a[0], b[1]-a[1])
    if L < 2: return None
    nx, ny = -(b[1]-a[1])/L, (b[0]-a[0])/L
    n = max(10, min(n, int(L/4)))
    line, out, inn = [], [], []
    for i in range(n):
        t = (i+0.5)/n
        px, py = a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t
        def at(d):
            x = int(round(px+nx*d)); yy = int(round(py+ny*d))
            return float(y[yy, x]) if 0 <= x < W and 0 <= yy < H else 255.0
        line.append(min(at(d) for d in (-2.5, -1.5, 0, 1.5, 2.5)))
        out.append([at(d) for d in OFFS])
        inn.append([at(-d) for d in OFFS])
    line = np.array(line); out = np.array(out); inn = np.array(inn)
    return dict(L=L,
                darkline=float((line < 100).mean()),
                darkout=float((out < 100).mean()),
                darkin=float((inn < 100).mean()),
                mout=float(out.mean()), minn=float(inn.mean()))

def verdict(p):
    """1 wall, 0 open, None unclear."""
    if p is None: return None
    dark = max(p['darkout'], p['darkin'])
    pale = min(p['mout'], p['minn'])
    if dark <= 0.14 and pale >= 130 and p['darkline'] <= 0.35: return 0
    if dark >= 0.30 or p['darkline'] >= 0.55: return 1
    return None
