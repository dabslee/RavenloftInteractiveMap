#!/usr/bin/env python3
"""Migrate the v1 annotations to the marker model in SCHEMA.md.

Reads castle-ravenloft-annotations.json and castle-data.json, writes
castle-ravenloft-annotations-v2.json and migration-review.md. The v1 file is
never touched.

    python migrate.py                      migrate, validate, write the review
    python migrate.py --validate FILE      validate an existing v2 file

Ids are minted from a hash of what the marker came from, so running this twice
over the same input gives the same ids and the diff is empty.
"""

import argparse
import collections
import hashlib
import json
import os
import re
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
V1 = os.path.join(HERE, "castle-ravenloft-annotations.json")
V2 = os.path.join(HERE, "castle-ravenloft-annotations-v2.json")
DATA = os.path.join(HERE, "castle-data.json")
REVIEW = os.path.join(HERE, "migration-review.md")

WALL, OPEN = 1, 0
PASSAGE_TYPES = {"door", "secret-door", "window", "stairs"}

# A passage type's default portal settings. These are defaults, not readings of
# the text: every portal that gets them is listed in the review file.
PASSAGE_DEFAULTS = {
    "door":        dict(passage="door",    transparent=False, secret=False, state="closed"),
    "secret-door": dict(passage="door",    transparent=False, secret=True,  state="closed"),
    "window":      dict(passage="barrier", transparent=True,  secret=False, state="closed"),
    "stairs":      dict(passage="open",    transparent=True,  secret=False, state="open"),
}
# which type wins when one opening was marked as two different things
TYPE_RANK = {"secret-door": 3, "door": 2, "stairs": 1, "window": 0}

TORCH = {"bright": 20, "dim": 40}          # what a light-type feature becomes
LOCK_RE = re.compile(r"lock", re.I)        # a door the text says has a lock
# a door you can see through while it is shut: a portcullis, a barred cell
# door, a grate, a glazed door. Vision passing a closed door is the exception,
# so this only ever switches transparency on.
SEE_RE = re.compile(r"portcullis|barred|\bbars\b|grate|grating|lattice|glass", re.I)

B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


class Review:
    """Everything the migration had to guess, grouped for the review file."""

    def __init__(self):
        self.items = collections.defaultdict(list)

    def add(self, section, text):
        self.items[section].append(text)

    def count(self):
        return sum(len(v) for v in self.items.values())


def mint(prefix, seed, used):
    """A stable id: the same input always gives the same id."""
    h = int(hashlib.md5(seed.encode("utf-8")).hexdigest(), 16)
    out = ""
    for _ in range(10):
        h, r = divmod(h, 36)
        out += B36[r]
    ident = prefix + "_" + out
    if ident in used and used[ident] != seed:
        raise SystemExit("id collision on " + seed)
    used[ident] = seed
    return ident


def split_key(key):
    """v1 mark key -> kind, id, placement number, level."""
    head, _, level = key.rpartition("@")
    kind, _, rest = head.partition(":")
    ident, _, inst = rest.partition("#")
    return kind, ident, int(inst or 1), level


def clean_height(h):
    if not h:
        return None
    if "from" in h or "to" in h:
        return {"from": h.get("from", h.get("to")), "to": h.get("to", h.get("from"))}
    if "at" in h:
        return {"at": h["at"]}
    return None


def shape_v2(shape, level, wall=False):
    """A v1 shape plus the level it sits on."""
    t = shape.get("type")
    if t == "area":
        return {
            "type": "area", "level": level,
            "parts": [{"op": p.get("op", "add"), "ring": p["ring"], "edges": p["edges"]}
                      for p in shape["parts"]],
        }
    if t == "seg":
        return {"type": "line", "level": level, "x1": shape["x1"], "y1": shape["y1"],
                "x2": shape["x2"], "y2": shape["y2"], "wall": bool(wall)}
    if t == "point":
        return {"type": "point", "level": level, "x": shape["x"], "y": shape["y"]}
    raise SystemExit("unknown v1 shape type: " + str(t))


def ring_to_lines(shape, level):
    """An area used as a wall becomes one line shape per edge."""
    out = []
    for part in shape["parts"]:
        ring = part["ring"]
        for i, a in enumerate(ring):
            b = ring[(i + 1) % len(ring)]
            out.append({"type": "line", "level": level, "x1": a[0], "y1": a[1],
                        "x2": b[0], "y2": b[1], "wall": True})
    return out


# ------------------------------------------------------------------ migration

def migrate(ann, data, rev):
    used_ids = {}
    markers = {}

    levels = {lv["id"]: lv for lv in data["levels"]}
    rooms = {r["id"]: r for r in data["rooms"]}
    elev = {i: (lv.get("elevationFeet") or 0) for i, lv in levels.items()}

    # ---- the feature table the v1 file patched three ways -------------------
    feats = {}
    for r in data["rooms"]:
        for f in r.get("features", []):
            feats[f["id"]] = dict(f, room=r["id"])
    for room_id, lst in ann.get("customFeatures", {}).items():
        for f in lst:
            feats[f["id"]] = dict(f, room=room_id)

    hidden = set(ann.get("hiddenFeatures", []))
    stale = sorted(h for h in hidden if h not in feats)
    for h in stale:
        rev.add("Dropped", "`%s` was hidden but no longer exists in castle-data.json" % h)
    for fid, label in ann.get("renames", {}).items():
        if fid in feats:
            feats[fid]["label"] = label

    marks = ann["marks"]

    def ftype(fid):
        return feats[fid]["type"] if fid in feats else "note"

    # ---- 1. area objects, one per room outline ------------------------------
    area_of = {}                                    # (room, level) -> object id
    for key, m in sorted(marks.items()):
        kind, room_id, _, level = split_key(key)
        if kind != "room":
            continue
        oid = mint("o", "area|%s|%s" % (room_id, level), used_ids)
        room = rooms.get(room_id)
        markers[oid] = {
            "id": oid, "kind": "object", "objectType": "area", "room": room_id,
            "name": (room or {}).get("name", room_id), "description": "",
            "shapes": [shape_v2(m["shape"], level)],
            "height": clean_height(m.get("height")), "light": None, "seed": None,
        }
        area_of[(room_id, level)] = oid

    def area_levels(room_id):
        """The levels a room is drawn on, low to high."""
        got = [lv for (r, lv) in area_of if r == room_id]
        return sorted(set(got), key=lambda l: elev.get(l, 0))

    def area_for(room_id, prefer=None):
        """A room's area object: on the level asked for, else nearest to it."""
        if prefer and (room_id, prefer) in area_of:
            return area_of[(room_id, prefer)], prefer
        got = area_levels(room_id)
        if not got:
            return None, None
        if prefer:
            got = sorted(got, key=lambda l: abs(elev.get(l, 0) - elev.get(prefer, 0)))
        elif rooms.get(room_id, {}).get("level") in got:
            return area_of[(room_id, rooms[room_id]["level"])], rooms[room_id]["level"]
        return area_of[(room_id, got[0])], got[0]

    # ---- 2. interior walls fold into the room's area object -----------------
    for key, m in sorted(marks.items()):
        kind, ident, _, level = split_key(key)
        if kind != "iwall":
            continue
        room_id = ident.split("~")[0]
        oid = area_of.get((room_id, level))
        if not oid:
            rev.add("Dropped", "interior wall `%s` has no %s outline on %s" % (key, room_id, level))
            continue
        markers[oid]["shapes"].append(shape_v2(m["shape"], level, wall=True))

    # ---- 3. feature marks, gathered by feature ------------------------------
    by_feature = collections.defaultdict(list)
    for key, m in sorted(marks.items()):
        kind, fid, _, level = split_key(key)
        if kind == "feat":
            by_feature[fid].append((key, m, level))

    passage_marks = {}                              # key -> (fid, mark, level)
    for fid, placements in sorted(by_feature.items()):
        f = feats.get(fid)
        if not f:
            rev.add("Dropped", "`%s` has marks but no feature entry" % fid)
            continue
        t = f["type"]
        if t in PASSAGE_TYPES:
            for key, m, level in placements:
                passage_marks[key] = (fid, m, level)
            continue

        # a wall drawn as a shape belongs to the room's outline, not to a marker
        if t == "wall":
            for key, m, level in placements:
                oid = area_of.get((f["room"], level))
                if not oid:
                    rev.add("Dropped", "wall `%s` has no %s outline on %s" % (key, f["room"], level))
                    continue
                if m["shape"]["type"] == "area":
                    markers[oid]["shapes"].extend(ring_to_lines(m["shape"], level))
                    rev.add("Folded in", "`%s` (%s) became %d wall lines on %s's outline"
                            % (fid, f["label"], len(m["shape"]["parts"][0]["ring"]), f["room"]))
                else:
                    markers[oid]["shapes"].append(shape_v2(m["shape"], level, wall=True))
            continue

        # everything else is an object, one per level it is drawn on
        otype = "item" if t == "light" else t
        if otype not in ("creature", "item", "trap", "note"):
            otype = "item"
        per_level = collections.defaultdict(list)
        for key, m, level in placements:
            per_level[level].append((key, m))
        heights = {json.dumps(clean_height(m.get("height")), sort_keys=True)
                   for _, m, _ in placements}
        if len(heights) > 1:
            rev.add("Heights", "`%s` (%s) had different heights on its placements; kept the first"
                    % (fid, f["label"]))
        for level, group in sorted(per_level.items()):
            oid = mint("o", "feat|%s|%s" % (fid, level), used_ids)
            markers[oid] = {
                "id": oid, "kind": "object", "objectType": otype, "room": f["room"],
                "name": f["label"], "description": f.get("note") or "",
                "shapes": [shape_v2(m["shape"], level) for _, m in group],
                "height": clean_height(group[0][1].get("height")),
                "light": dict(TORCH) if t == "light" else None,
                "seed": fid,
            }
            if t == "light":
                rev.add("Guessed light", "`%s` (%s) became an item lit 20/40 ft" % (fid, f["label"]))

    # ---- 4. portals ---------------------------------------------------------
    # a stair drawn on several sheets is one flight per pair of adjacent sheets
    flight_keys = set()
    for fid, placements in sorted(by_feature.items()):
        f = feats.get(fid)
        if not f or f["type"] != "stairs":
            continue
        lv = sorted({l for _, _, l in placements}, key=lambda l: elev.get(l, 0))
        if len(lv) < 2:
            continue
        if not all((f["room"], l) in area_of for l in lv):
            rev.add("Stairs", "`%s` (%s) is drawn on %s but %s has no outline on all of them"
                    % (fid, f["label"], ", ".join(lv), f["room"]))
            continue
        for key, _, _ in placements:
            flight_keys.add(key)
        shapes_on = collections.defaultdict(list)
        for key, m, level in placements:
            shapes_on[level].append(shape_v2(m["shape"], level))
        for i in range(len(lv) - 1):
            lo, hi = lv[i], lv[i + 1]
            pid = mint("p", "flight|%s|%s|%s" % (fid, lo, hi), used_ids)
            shapes = list(shapes_on[lo])
            if i == len(lv) - 2:
                shapes += shapes_on[hi]
            markers[pid] = {
                "id": pid, "kind": "portal", "passage": "open", "lockable": False,
                "transparent": True, "secret": False, "state": "open",
                "sides": [
                    {"marker": area_of[(f["room"], lo)], "name": f["label"],
                     "description": f.get("note") or ""},
                    {"marker": area_of[(f["room"], hi)], "name": f["label"],
                     "description": f.get("note") or ""},
                ],
                "shapes": shapes, "height": None, "light": None, "seeds": [fid],
            }
        rev.add("Stairs", "`%s` (%s) became %d flights: %s"
                % (fid, f["label"], len(lv) - 1, " -> ".join(lv)))

    # the rest: one portal per group of marks already called the same thing
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        x, y = find(x), find(y)
        if x != y:
            parent[x] = y

    pool = {k: v for k, v in passage_marks.items() if k not in flight_keys}
    for key in pool:
        find(key)
        for twin in marks[key].get("links", {}).get("same", []):
            if twin in pool:
                union(key, twin)
    groups = collections.defaultdict(list)
    for key in sorted(pool):
        groups[find(key)].append(key)

    for _, keys in sorted(groups.items(), key=lambda kv: sorted(kv[1])):
        placements = [(k, pool[k][0], pool[k][1], pool[k][2]) for k in sorted(keys)]
        types = [ftype(fid) for _, fid, _, _ in placements]
        base = max(types, key=lambda t: TYPE_RANK.get(t, 0))
        label_of = {}                               # room -> (label, note, fid)
        order = []
        for _, fid, _, _ in placements:
            room_id = feats[fid]["room"]
            if room_id not in label_of:
                label_of[room_id] = (feats[fid]["label"], feats[fid].get("note") or "", fid)
                order.append(room_id)
        level_of = {}
        for _, fid, _, level in placements:
            level_of.setdefault(feats[fid]["room"], level)

        reach = set()
        for k, _, _, _ in placements:
            reach.update(marks[k].get("links", {}).get("reach", []))

        first = order[0]
        flags = []
        if len(order) >= 2:
            second = order[1]
            if len(order) > 2:
                flags.append("marked from %d rooms (%s); kept the first two"
                             % (len(order), ", ".join(order)))
        else:
            others = sorted(reach - {first})
            if len(others) == 1:
                second = others[0]
            else:
                second = None
                if len(others) > 1:
                    flags.append("reaches %s; could not tell which side it opens on"
                                 % ", ".join(others))
                else:
                    flags.append("no far side found")

        a_obj, a_level = area_for(first, level_of.get(first))
        if a_obj is None:
            rev.add("Dropped", "portal from `%s` has no outline for %s"
                    % (placements[0][1], first))
            continue
        side_a = {"marker": a_obj, "name": label_of[first][0], "description": label_of[first][1]}
        if second:
            b_obj, b_level = area_for(second, level_of.get(second, a_level))
            if b_obj is None:
                second, b_obj, b_level = None, None, None
                flags.append("far side named a room with no outline")
        if second:
            if second in label_of:
                name, note = label_of[second][0], label_of[second][1]
            else:
                name, note = label_of[first][0], label_of[first][1]
                flags.append("the far side's name was copied from this side")
            side_b = {"marker": b_obj, "name": name, "description": note}
        else:
            side_b = {"marker": None, "name": "", "description": ""}
            b_level = None

        defaults = dict(PASSAGE_DEFAULTS[base])
        text = " ".join(label_of[r][0] + " " + label_of[r][1] for r in order)
        lockable = defaults["passage"] == "door" and bool(LOCK_RE.search(text))
        see_through = (defaults["passage"] == "door" and not defaults["transparent"]
                       and bool(SEE_RE.search(text)))
        if see_through:
            defaults["transparent"] = True
        shapes = [shape_v2(m["shape"], level) for _, _, m, level in placements]
        stray = sorted({s["level"] for s in shapes} - {l for l in (a_level, b_level) if l})
        if stray:
            flags.append("drawn on %s, which is neither side's floor" % ", ".join(stray))
        heights = [clean_height(m.get("height")) for _, _, m, _ in placements]
        heights = [h for h in heights if h]

        pid = mint("p", "portal|" + "|".join(sorted(keys)), used_ids)
        markers[pid] = {
            "id": pid, "kind": "portal", "passage": defaults["passage"],
            "lockable": lockable, "transparent": defaults["transparent"],
            "secret": defaults["secret"], "state": defaults["state"],
            "sides": [side_a, side_b], "shapes": shapes,
            "height": heights[0] if heights else None, "light": None,
            "seeds": sorted({fid for _, fid, _, _ in placements}),
        }
        who = "`%s` %s" % (pid, label_of[first][0])
        if lockable:
            rev.add("Guessed lock", who + " - the text mentions a lock, so lockable is on")
        if see_through:
            rev.add("Guessed transparency",
                    who + " - reads as something you can see through while it is shut")
        if len(set(types)) > 1:
            rev.add("Type", who + " was marked as %s; took %s" % (", ".join(sorted(set(types))), base))
        for fl in flags:
            rev.add("Needs a far side" if second is None else "Check", who + " - " + fl)

    # stairs left with a null side: pair them across adjacent floors
    open_ends = [m for m in markers.values()
                 if m["kind"] == "portal" and m["sides"][1]["marker"] is None
                 and m["passage"] == "open"]
    by_room_level = collections.defaultdict(list)
    for p in open_ends:
        a = markers[p["sides"][0]["marker"]]
        lv = a["shapes"][0]["level"] if a["shapes"] else None
        by_room_level[(a["room"], lv)].append(p)
    paired = set()
    for p in open_ends:
        if p["id"] in paired:
            continue
        a = markers[p["sides"][0]["marker"]]
        lv = a["shapes"][0]["level"] if a["shapes"] else None
        ladder = area_levels(a["room"])
        if lv not in ladder:
            continue
        i = ladder.index(lv)
        cands = []
        for nb in (ladder[i - 1] if i else None, ladder[i + 1] if i + 1 < len(ladder) else None):
            if not nb:
                continue
            cands += [q for q in by_room_level.get((a["room"], nb), [])
                      if q["id"] != p["id"] and q["id"] not in paired]
        if len(cands) != 1:
            continue
        q = cands[0]
        p["sides"][1] = {"marker": q["sides"][0]["marker"],
                         "name": q["sides"][0]["name"],
                         "description": q["sides"][0]["description"]}
        p["shapes"] += q["shapes"]
        p["seeds"] = sorted(set(p["seeds"]) | set(q["seeds"]))
        paired.add(p["id"])
        paired.add(q["id"])
        del markers[q["id"]]
        rev.add("Stairs", "`%s` %s was joined to the %s on the next floor"
                % (p["id"], p["sides"][0]["name"], q["sides"][0]["name"]))

    # ---- 5. two outlines that run together is a portal too ------------------
    seen = set()
    for key, m in sorted(marks.items()):
        kind, room_id, _, level = split_key(key)
        if kind != "room":
            continue
        for way in (m.get("links") or {}).get("ways", []):
            if way.get("how") != "open":
                continue
            other = way["to"]
            pair = (min(room_id, other), max(room_id, other), level)
            if pair in seen or other not in rooms:
                continue
            seen.add(pair)
            a = area_of.get((pair[0], level))
            b = area_of.get((pair[1], level))
            if not a or not b:
                continue
            pid = mint("p", "open|%s|%s|%s" % pair, used_ids)
            markers[pid] = {
                "id": pid, "kind": "portal", "passage": "open", "lockable": False,
                "transparent": True, "secret": False, "state": "open",
                "sides": [
                    {"marker": a, "name": "Open to " + pair[1], "description":
                     "The two areas run together here; there is nothing in the way."},
                    {"marker": b, "name": "Open to " + pair[0], "description":
                     "The two areas run together here; there is nothing in the way."},
                ],
                "shapes": [], "height": None, "light": None, "seeds": [],
            }

    # ---- 6. two last things worth a human eye ------------------------------
    # several portals between the same pair of places. Sometimes right (K47
    # really has two doors to K48) and sometimes the same doorway marked more
    # than twice, so they are listed rather than merged.
    pairs = collections.defaultdict(list)
    for ident, m in markers.items():
        if m["kind"] != "portal":
            continue
        a, b = (s.get("marker") for s in m["sides"])
        if a and b:
            pairs[(min(a, b), max(a, b))].append(ident)
    for (a, _b), idents in sorted(pairs.items()):
        if len(idents) < 2:
            continue
        rooms_named = " and ".join(sorted({markers[s["marker"]]["room"]
                                           for i in idents for s in markers[i]["sides"]
                                           if s["marker"]}))
        names = sorted({markers[i]["sides"][0]["name"] for i in idents})
        rev.add("Duplicates", "%d portals join %s: %s"
                % (len(idents), rooms_named, "; ".join(names[:3])))

    # a room nothing leads to or from is either sealed or unfinished
    reached = set()
    for m in markers.values():
        if m["kind"] != "portal":
            continue
        for s in m["sides"]:
            o = markers.get(s["marker"] or "")
            if o:
                reached.add(o["room"])
    for room_id in sorted(r["id"] for r in data["rooms"]):
        if room_id not in reached:
            rev.add("No way in", "`%s` %s has no portal on either side of it"
                    % (room_id, rooms[room_id]["name"]))

    doc = {
        "version": 2,
        "updated": datetime.now().replace(microsecond=0).isoformat(),
        "grids": ann.get("grids", {}),
        "markers": markers,
        "roomNotes": ann.get("roomNotes", {}),
    }
    return doc


# ------------------------------------------------------------------ validator

def validate(doc, data):
    """The twelve rules in SCHEMA.md. Returns (errors, warnings)."""
    errs, warns = [], []
    rooms = {r["id"] for r in data["rooms"]}
    levels = {lv["id"]: (lv.get("elevationFeet") or 0) for lv in data["levels"]}
    # floors are ranked by height, not by how many sheets there are: the walls
    # sheet and the main floor are both at 0 ft and are one floor apart from
    # the court above and the larders below, not two
    steps = sorted(set(levels.values()))
    rank = {l: steps.index(ft) for l, ft in levels.items()}
    markers = doc["markers"]

    def bad(ident, msg):
        errs.append("%s: %s" % (ident, msg))

    def warn(ident, msg):
        warns.append("%s: %s" % (ident, msg))

    def shape_levels(m):
        return {s.get("level") for s in m.get("shapes", [])}

    for ident, m in sorted(markers.items()):
        if m.get("id") != ident:
            bad(ident, "id field does not match its key")
        kind = m.get("kind")
        if kind not in ("object", "portal"):
            bad(ident, "kind is %r" % kind)
            continue
        # 1
        if kind == "object" and "passage" in m:
            bad(ident, "an object may not have passage")
        if kind == "portal" and "objectType" in m:
            bad(ident, "a portal may not have objectType")
        # 11
        for s in m.get("shapes", []):
            if s.get("level") not in levels:
                bad(ident, "shape on unknown level %r" % s.get("level"))
            if s["type"] == "area":
                for part in s["parts"]:
                    if len(part["ring"]) < 3:
                        bad(ident, "area ring with %d points" % len(part["ring"]))
                    if len(part["edges"]) != len(part["ring"]):
                        bad(ident, "area has %d edges for %d points"
                            % (len(part["edges"]), len(part["ring"])))
        # 10
        h = m.get("height")
        if h and "from" in h and h["from"] > h["to"]:
            bad(ident, "height from %s to %s" % (h["from"], h["to"]))
        lt = m.get("light")
        if lt and lt["bright"] > lt["dim"]:
            bad(ident, "bright light %s reaches past dim %s" % (lt["bright"], lt["dim"]))

        if kind == "object":
            # 2
            if m.get("room") not in rooms:
                bad(ident, "room %r is not in castle-data.json" % m.get("room"))
            if m.get("objectType") not in ("area", "creature", "item", "trap", "note"):
                bad(ident, "objectType is %r" % m.get("objectType"))
            # 3
            if len(shape_levels(m)) > 1:
                bad(ident, "shapes on %d levels: %s"
                    % (len(shape_levels(m)), ", ".join(sorted(shape_levels(m)))))
            continue

        # 4
        sides = m.get("sides") or []
        if len(sides) != 2:
            bad(ident, "%d sides" % len(sides))
            continue
        for s in sides:
            t = s.get("marker")
            if t is not None and (t not in markers or markers[t]["kind"] != "object"):
                bad(ident, "side points at %r, which is not an object" % t)
        if sides[0].get("marker") and sides[0]["marker"] == sides[1].get("marker"):
            bad(ident, "both sides are the same object")
        live = [markers[s["marker"]] for s in sides
                if s.get("marker") in markers and markers[s["marker"]]["kind"] == "object"]
        side_levels = set()
        for o in live:
            side_levels |= shape_levels(o)
        # 5
        if not live and m.get("shapes"):
            bad(ident, "has shapes but neither side is a place")
        stray = shape_levels(m) - side_levels
        if live and stray:
            # only an error once both sides are settled: a shape cannot be on
            # the floor of a side that has not been named yet
            say = bad if len(live) == 2 else warn
            say(ident, "drawn on %s, which is neither side's floor" % ", ".join(sorted(stray)))
        # 6
        if len(live) == 2:
            la = sorted(shape_levels(live[0]))
            lb = sorted(shape_levels(live[1]))
            if la and lb and min(abs(rank[x] - rank[y]) for x in la for y in lb) > 1:
                warn(ident, "joins %s to %s, which are not adjacent floors"
                     % (", ".join(la), ", ".join(lb)))
        # 7, 8, 9
        passage, state = m.get("passage"), m.get("state")
        if passage not in ("open", "door", "barrier"):
            bad(ident, "passage is %r" % passage)
        if m.get("lockable") and passage != "door":
            bad(ident, "lockable but passage is %r" % passage)
        if state == "locked" and not m.get("lockable"):
            bad(ident, "locked but not lockable")
        if state != "open" and passage == "open":
            bad(ident, "state %r on a passage that cannot close" % state)
        if passage == "barrier" and state != "closed":
            bad(ident, "a barrier with state %r" % state)
        if state not in ("open", "closed", "locked"):
            bad(ident, "state is %r" % state)

    # 12
    by_pair = collections.defaultdict(list)
    for ident, m in markers.items():
        if m["kind"] != "portal":
            continue
        a, b = (s.get("marker") for s in m["sides"])
        if a and b:
            by_pair[(min(a, b), max(a, b))].append(ident)
    for pair, idents in sorted(by_pair.items()):
        if len(idents) > 1:
            warn(", ".join(sorted(idents)),
                 "%d portals join the same two places" % len(idents))
    return errs, warns


# ------------------------------------------------------------------ reporting

SECTIONS = [
    ("Needs a far side", "One side is still null. Open each and say where it comes out, "
                         "or leave it if it opens onto the outside."),
    ("Check", "Migration picked a side but was not certain."),
    ("No way in", "No portal touches this room at all, so nothing leads to it and it "
                  "leads nowhere. Either it really is sealed, or a way was never drawn."),
    ("Duplicates", "Several portals join the same two places. Two doors between two rooms "
                   "is sometimes right; more often it is one doorway marked several times "
                   "and never tied together."),
    ("Stairs", "Flights built across floors, and the pairs that were joined."),
    ("Type", "One opening marked as two different kinds of thing."),
    ("Guessed light", "A light-type feature became an item lit 20 ft bright, 40 ft dim. "
                      "The module rarely says, so check the ones that matter."),
    ("Guessed lock", "The text mentions a lock, so lockable was switched on."),
    ("Guessed transparency", "A door that reads as see-through - a portcullis, a barred cell "
                             "door, a grate - so vision passes it while it is shut."),
    ("Folded in", "Marks that became part of something else."),
    ("Heights", "Placements of one thing that disagreed about their height."),
    ("Dropped", "Nothing was written for these."),
]


def write_review(rev, doc, errs, warns):
    markers = doc["markers"]
    objs = [m for m in markers.values() if m["kind"] == "object"]
    ports = [m for m in markers.values() if m["kind"] == "portal"]
    nulls = [p for p in ports if any(s["marker"] is None for s in p["sides"])]

    out = ["# Migration review", "",
           "Written by `migrate.py`. Everything below is a guess it made or a "
           "thing it could not decide; the numbers are what came out.", ""]
    out += ["## What was written", "",
            "| | count |", "|---|---|",
            "| objects | %d |" % len(objs),
            "| - room outlines | %d |" % len([o for o in objs if o["objectType"] == "area"]),
            "| - items, creatures, traps, notes | %d |"
            % len([o for o in objs if o["objectType"] != "area"]),
            "| portals | %d |" % len(ports),
            "| - with both sides resolved | %d |" % (len(ports) - len(nulls)),
            "| - with a null side | %d |" % len(nulls),
            "| shapes | %d |" % sum(len(m["shapes"]) for m in markers.values()),
            "", "Validator: **%d errors, %d warnings**." % (len(errs), len(warns)), ""]
    if errs:
        out += ["### Errors", ""] + ["- " + e for e in errs] + [""]
    if warns:
        out += ["### Warnings", ""] + ["- " + w for w in warns] + [""]

    out += ["## Things to look at", "",
            "%d in all." % rev.count(), ""]
    for name, blurb in SECTIONS:
        items = rev.items.get(name)
        if not items:
            continue
        out += ["### %s (%d)" % (name, len(items)), "", blurb, ""]
        out += ["- " + i for i in sorted(items)] + [""]
    left = set(rev.items) - {n for n, _ in SECTIONS}
    for name in sorted(left):
        out += ["### %s (%d)" % (name, len(rev.items[name])), ""]
        out += ["- " + i for i in sorted(rev.items[name])] + [""]
    with open(REVIEW, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--validate", metavar="FILE", help="validate a v2 file and stop")
    ap.add_argument("--force", action="store_true",
                    help="overwrite the v2 file even though it already exists")
    args = ap.parse_args()

    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)

    if args.validate:
        with open(args.validate, encoding="utf-8") as fh:
            doc = json.load(fh)
        errs, warns = validate(doc, data)
        for e in errs:
            print("error   " + e)
        for w in warns:
            print("warning " + w)
        print("%d errors, %d warnings, %d markers" % (len(errs), len(warns), len(doc["markers"])))
        return 1 if errs else 0

    # Migration is a one-way door. Once the editor has been used, the v2 file
    # is the work and this script would throw it away, so it refuses unless
    # told plainly to.
    if os.path.exists(V2) and not args.force:
        raise SystemExit(
            "%s already exists and this would overwrite it.\n"
            "It is the live file: the editor reads and writes it, so anything\n"
            "marked since the migration is only in there. Back it up first,\n"
            "then pass --force if you really mean to start over."
            % os.path.basename(V2))

    with open(V1, encoding="utf-8") as fh:
        ann = json.load(fh)
    if ann.get("version") != 1:
        raise SystemExit("expected a version 1 annotations file")

    rev = Review()
    doc = migrate(ann, data, rev)
    errs, warns = validate(doc, data)
    with open(V2, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1)
    write_review(rev, doc, errs, warns)

    objs = sum(1 for m in doc["markers"].values() if m["kind"] == "object")
    ports = sum(1 for m in doc["markers"].values() if m["kind"] == "portal")
    print("wrote %s: %d objects, %d portals" % (os.path.basename(V2), objs, ports))
    print("wrote %s: %d things to look at" % (os.path.basename(REVIEW), rev.count()))
    print("%d errors, %d warnings" % (len(errs), len(warns)))
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
