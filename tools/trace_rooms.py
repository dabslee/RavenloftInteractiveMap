"""Trace each room's floor area from its label position.

Rooms on these sheets are bounded by heavy dark walls, so a flood fill over the
light floor pixels, started at the printed label, recovers the room. The fill is
run on the player version, which carries no labels or callouts to leak through.
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
IMG = "/mnt/user-data/uploads/Ravenloft/References/img"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def floor_mask(path):
    """Light, walkable pixels: floors are pale, walls and voids are dark."""
    im = Image.open(path).convert("L")
    a = np.asarray(im)
    return a > 118


def fill_from(mask, seed, limit):
    """Flood fill bounded by walls, capped so a leak cannot swallow the map."""
    lab, n = ndimage.label(mask)
    sy, sx = seed
    if not (0 <= sy < mask.shape[0] and 0 <= sx < mask.shape[1]):
        return None
    comp = lab[sy, sx]
    if comp == 0:
        # the label sits on ink; look nearby for floor
        for r in (6, 12, 20, 30, 45):
            ys, xs = np.ogrid[-r:r + 1, -r:r + 1]
            for dy, dx in zip(*np.where(ys ** 2 + xs ** 2 <= r * r)):
                y, x = sy + dy - r, sx + dx - r
                if 0 <= y < mask.shape[0] and 0 <= x < mask.shape[1] and lab[y, x]:
                    comp = lab[y, x]
                    break
            if comp:
                break
    if not comp:
        return None
    region = lab == comp
    if region.sum() > limit:
        return None                        # leaked into the rest of the floor
    return region
