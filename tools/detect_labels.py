"""Locate the printed room labels on each DM battlemap.

The DM and player versions of every sheet are pixel-aligned, so the difference
between them is exactly the DM-only annotation layer: room labels, callouts and
arrows. Each label is then read with tesseract and matched against the rooms the
module places on that sheet.
"""
import json, os, sys, re
import numpy as np
from PIL import Image
from scipy import ndimage
import pytesseract

Image.MAX_IMAGE_PIXELS = None
IMG = "/mnt/user-data/uploads/Ravenloft/References/img"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(HERE, "castle-data.json")))


def valid_ids(level_id):
    ids = set()
    for r in DATA["rooms"]:
        if r["level"] == level_id and r["kind"] in ("room", "subarea"):
            ids.add(r["id"])
        if level_id in (r.get("alsoOn") or []):
            ids.add(r["id"])
    return ids


CONF = str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "S": "5", "B": "8", "Z": "2"})


def best_match(txt, ids):
    t = txt.translate(CONF).replace(" ", "")
    if t in ids:
        return t, 0
    best, bd = None, 99
    for cand in ids:
        d = _lev(t, cand)
        if d < bd:
            best, bd = cand, d
    # only accept what tesseract actually read: a near-miss here would attach a
    # room outline to the wrong room, which is worse than leaving it unmarked
    return (None, bd)


def _lev(a, b):
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def detect(level):
    dm_p = os.path.join(IMG, os.path.basename(level["dmMap"]))
    pl_p = os.path.join(IMG, os.path.basename(level["playerMap"]))
    dm = np.asarray(Image.open(dm_p).convert("RGB"), dtype=np.int16)
    pl = np.asarray(Image.open(pl_p).convert("RGB"), dtype=np.int16)
    if dm.shape != pl.shape:
        return []
    grey = np.asarray(Image.open(dm_p).convert("L"))
    mask = np.abs(dm - pl).sum(axis=2) > 40
    mask = ndimage.binary_dilation(mask, np.ones((5, 15)))
    lab, n = ndimage.label(mask)
    ids = valid_ids(level["id"])
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        area = (lab[sl] == i + 1).sum()
        if not (16 <= h <= 150 and 20 <= w <= 460 and area >= 180):
            continue
        if w / h > 9 or h / w > 4:         # arrows and tall thin slivers
            continue
        pad = 10
        y0, y1 = max(0, sl[0].start - pad), min(grey.shape[0], sl[0].stop + pad)
        x0, x1 = max(0, sl[1].start - pad), min(grey.shape[1], sl[1].stop + pad)
        crop = grey[y0:y1, x0:x1]
        im = Image.fromarray(crop).resize(((x1 - x0) * 4, (y1 - y0) * 4), Image.LANCZOS)
        votes = []
        for psm in ("7", "8", "13"):
            txt = pytesseract.image_to_string(
                im, config="--psm %s -c tessedit_char_whitelist=Kab0123456789" % psm).strip()
            txt = re.sub(r"\s+", "", txt)
            if not txt.startswith("K") or len(txt) < 2:
                continue
            rid, d = best_match(txt, ids)
            if rid:
                votes.append(rid)
        if votes and len(set(votes)) == 1:      # every pass agreed
            out.append(dict(id=votes[0], reads=len(votes),
                            x=(x0 + x1) / 2, y=(y0 + y1) / 2,
                            box=[x0, y0, x1, y1]))
    return out


if __name__ == "__main__":
    res = {}
    for lv in DATA["levels"]:
        hits = detect(lv)
        res[lv["id"]] = hits
        want = sorted(r["id"] for r in DATA["rooms"]
                      if r["level"] == lv["id"] and r["kind"] in ("room", "subarea"))
        got = sorted({h["id"] for h in hits})
        missing = [w for w in want if w not in got]
        print("%-9s %2d labels, %2d distinct   missing: %s"
              % (lv["id"], len(hits), len(got), ",".join(missing) or "-"))
    json.dump(res, open(os.path.join(HERE, "tools", "labels.json"), "w"), indent=1)
