"""First-pass room outlines for every sheet.

Pipeline: diff the DM and player maps to isolate the printed room labels, read
them with tesseract, then watershed the floor from those labels so that rooms
joined by open archways still separate. Each region is traced, simplified and
snapped to the half-grid so the outline has corners where the room turns and
nowhere else.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.segmentation import watershed
from skimage.measure import find_contours, approximate_polygon

Image.MAX_IMAGE_PIXELS = None
IMG = "/mnt/user-data/uploads/Ravenloft/References/img"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(HERE, "castle-data.json")))
LABELS = json.load(open(os.path.join(HERE, "tools", "labels.json")))
LEVELS = {l["id"]: l for l in DATA["levels"]}


def snap(v, step, off):
    return round((v - off) / step) * step + off


def clean_ring(pts, step, offx, offy, min_pts=3):
    out = []
    for x, y in pts:
        p = (snap(x, step, offx), snap(y, step, offy))
        if not out or (abs(p[0] - out[-1][0]) > 1e-6 or abs(p[1] - out[-1][1]) > 1e-6):
            out.append(p)
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < 1e-6 and abs(out[0][1] - out[-1][1]) < 1e-6:
        out.pop()
    # drop vertices that sit in the middle of a straight run
    keep = []
    n = len(out)
    for i in range(n):
        a, b, c = out[(i - 1) % n], out[i], out[(i + 1) % n]
        ax, ay = b[0] - a[0], b[1] - a[1]
        bx, by = c[0] - b[0], c[1] - b[1]
        if abs(ax * by - ay * bx) < 1e-9 and (ax * bx + ay * by) > 0:
            continue
        keep.append(b)
    return keep if len(keep) >= min_pts else None


def trace(level_id, verbose=True):
    lv = LEVELS[level_id]
    hits = LABELS.get(level_id, [])
    if not hits:
        return {}
    grey = np.asarray(Image.open(
        os.path.join(IMG, os.path.basename(lv["playerMap"]))).convert("L"))
    floor = grey > 118
    lab, _ = ndimage.label(floor)
    keep = {lab[int(h["y"]), int(h["x"])] for h in hits}
    keep.discard(0)
    inside = np.isin(lab, list(keep))

    markers = np.zeros(grey.shape, np.int32)
    for i, h in enumerate(hits, 1):
        y, x = int(h["y"]), int(h["x"])
        markers[max(0, y - 6):y + 7, max(0, x - 6):x + 7] = i
    ws = watershed(255 - grey.astype(np.int32), markers, mask=inside)

    g = lv["grid"]
    step = g["size"] / 2.0                      # half squares: 5 feet
    tol = g["size"] * 0.13
    px_per_sq = g["size"] ** 2
    out = {}
    for i, h in enumerate(hits, 1):
        region = ws == i
        n = int(region.sum())
        if n > px_per_sq * 70:                  # a leak into the open ground
            if verbose:
                print("    %-8s discarded, %.0f squares looks like a leak"
                      % (h["id"], n / px_per_sq))
            continue
        if n < px_per_sq * 0.25:                # smaller than a quarter square
            if verbose:
                print("    %-8s too small (%d px)" % (h["id"], n))
            continue
        region = ndimage.binary_closing(region, np.ones((5, 5)))
        padded = np.pad(region, 1)
        rings = []
        for c in find_contours(padded.astype(float), 0.5):
            poly = approximate_polygon(c, tol)
            pts = [(p[1] - 1, p[0] - 1) for p in poly]     # (row,col) -> (x,y)
            ring = clean_ring(pts, step, g["offsetX"] % step, g["offsetY"] % step)
            if ring and len(ring) >= 3:
                rings.append(ring)
        if not rings:
            continue
        rings.sort(key=lambda r: -_area(r))
        if len(rings[0]) > 40:                  # still fussy: simplify harder
            for harder in (tol * 2, tol * 3.5, tol * 6):
                alt = []
                for c in find_contours(padded.astype(float), 0.5):
                    poly = approximate_polygon(c, harder)
                    pts = [(p[1] - 1, p[0] - 1) for p in poly]
                    ring = clean_ring(pts, step, g["offsetX"] % step, g["offsetY"] % step)
                    if ring and len(ring) >= 3:
                        alt.append(ring)
                if alt:
                    alt.sort(key=lambda r: -_area(r))
                    rings = alt
                    if len(rings[0]) <= 40:
                        break
        parts = [{"op": "add", "ring": [[round(x, 1), round(y, 1)] for x, y in rings[0]],
                  "edges": [1] * len(rings[0])}]
        for r in rings[1:]:
            if _area(r) > px_per_sq * 0.5:      # a real hole, not noise
                parts.append({"op": "sub", "ring": [[round(x, 1), round(y, 1)] for x, y in r],
                              "edges": [1] * len(r)})
        out.setdefault(h["id"], []).append(
            {"parts": parts, "px": n, "squares": round(n / px_per_sq, 1)})
        if verbose:
            print("    %-8s %5.1f squares, %2d corners%s"
                  % (h["id"], n / px_per_sq, len(parts[0]["ring"]),
                     ", %d hole(s)" % (len(parts) - 1) if len(parts) > 1 else ""))
    return out


def _area(ring):
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


if __name__ == "__main__":
    result = {}
    for lv in DATA["levels"]:
        print(lv["id"])
        result[lv["id"]] = trace(lv["id"])
    json.dump(result, open(os.path.join(HERE, "tools", "traced.json"), "w"))
    total = sum(len(v) for v in result.values())
    print("\ntraced outlines for %d rooms" % total)
