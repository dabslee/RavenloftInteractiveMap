#!/usr/bin/env python3
"""Parse Chapter 4 (Castle Ravenloft) of the Curse of Strahd markdown into
structured room / feature data for the VTT mapping tool.

Usage:  python extract.py [path/to/Curse of Strahd.md] [out.json]
"""
import json, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = os.path.join(os.path.dirname(HERE), "References", "Curse of Strahd.md")
SRC = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "castle-data.json")

text = open(SRC, encoding="utf-8").read()
lines = text.split("\n")

# ---- levels -----------------------------------------------------------
# Grid pitch and offset were measured off each battlemap three ways and
# cross-checked: a Fourier comb on the floor texture, the width of the brown
# door glyphs (a door leaf is 0.485 of a square), and the phase of the castle's
# wall edges. Maps 3, 4 and 5 show the same castle footprint and independently
# come out at ~34.8 x 24.0 squares, which is the strongest confirmation.
# Every sheet prints "1 SQUARE = 10 FEET".
# Every map-4.xx file is the official battlemap for that section. Map sheet 6
# (map-4.06) carries book maps 6 through 10, so all of K47-K60a live on it.
# Heights are measured in feet from the main floor, which is 0. The book's own
# stair labels disagree by ten feet here and there; these follow the majority.
ELEV_NOTE = {
    "walls": "courtyard and outer walls, same ground as the main floor",
    "main": "ground: everything else is measured from this floor",
    "court": "the spiral staircase climbs 50 feet from the main floor to this landing",
    "weeping": 'the K20 stairs "ascend another 40 feet to another landing (shown on map 5)"',
    "spires": 'map 6, the roof level: the sheet is labelled "Down 40 Feet To Map 5". '
              "Maps 7 to 10 on this sheet are the towers and stand higher, so those "
              "rooms carry their own elevation",
    "larders": '"Down 40 feet to map 11" from the main floor',
    "dungeon": '"Up 70 feet to map 11" from the dungeon stairs; the K21 spiral is labelled 80',
}

# Rooms the book places at a definite height, in feet above the main floor.
# The spine comes from the K20 spiral staircase, which is the one passage that
# measures the whole castle: main 0, +50 to the map 4 landing, +40 to the map 5
# landing, +100 to the landing beneath the tower's heart on map 8 (190). K57
# confirms that last one from the other end: "the courtyard is 190 feet below".
ROOM_ELEV = {
    # map 7, the witches' rooms: the K48 stair "rises from area K47, past area
    # K54, to area K57", so they sit between map 6 (130) and map 8 (190)
    "K54": (160, 'between map 6 and map 8 on the K48 stair ("from K47, past K54, to K57")'),
    "K55": (160, "same landing as K54; its own text puts K51 below it"),
    "K56": (160, "same landing as K54"),
    # map 8
    "K57": (190, '"The courtyard is 190 feet below"'),
    "K58": (190, 'the bridge leaves K57; a fall from it drops "60 feet onto the roof of the keep" (130)'),
    # map 9, the north tower peak
    "K60": (250, "9-foot ceiling with the K60a trapdoor above it, so 10 feet under 260"),
    "K60a": (260, '"The courtyard lies 260 feet below"'),
    # map 10, the high tower peak
    "K59": (340, 'the K18a shaft "descends 450 feet to the castle catacombs" (-110). '
                 "K18a's own text says 390 feet, which would put this at 280"),
    # the keep roof, on map 6
    "K53": (130, '"the courtyard some one hundred thirty feet below", and 40 feet above '
                 "the K46 parapets; K57 calls it 80 below itself, which would be 110"),
}

LEVELS = [
    dict(id="walls", name="Walls of Ravenloft", heading="Walls of Ravenloft",
         dm="References/img/map-4.02-walls.webp",
         player="References/img/map-4.02-walls-player.webp",
         w=3840, h=5211, grid=87.37, offx=1.59, offy=77.97, elev=0),
    dict(id="main", name="Main Floor", heading="Main Floor",
         dm="References/img/map-4.03-main-floor.webp",
         player="References/img/map-4.03-main-floor-player.webp",
         w=3000, h=2072, grid=86.51, offx=32.16, offy=1.53, elev=0),
    dict(id="court", name="Court of the Count", heading="Court of the Count",
         dm="References/img/map-4.04-court-revised.webp",
         player="References/img/map-4.04-court-player-revised.webp",
         w=5560, h=3840, grid=160.46, offx=55.89, offy=1.2, elev=50),
    dict(id="weeping", name="Rooms of Weeping", heading="Rooms of Weeping",
         dm="References/img/map-4.05-weeping.webp",
         player="References/img/map-4.05-weeping-player.webp",
         w=3000, h=2072, grid=85.83, offx=42.64, offy=8.73, elev=90),
    dict(id="spires", name="Spires of Ravenloft", heading="Spires of Ravenloft",
         dm="References/img/map-4.06-spires12.webp",
         player="References/img/map-4.06-spires12-player.webp",
         w=5000, h=3372, grid=101.0, offx=0.57, offy=23.38, elev=130),
    dict(id="larders", name="Larders of Ill Omen", heading="Larders of Ill Omen",
         dm="References/img/map-4.08-larders.webp",
         player="References/img/map-4.08-larders-player.webp",
         w=3000, h=2175, grid=122.71, offx=93.2, offy=89.97, elev=-40),
    dict(id="dungeon", name="Dungeon and Catacombs", heading="Dungeon and Catacombs",
         dm="References/img/map-4.09-dungeons-and-catacombs.webp",
         player="References/img/map-4.09-dungeons-and-catacombs-player.webp",
         w=3000, h=2929, grid=94.87, offx=70.5, offy=0.32, elev=-110),
]
LEVEL_BY_HEADING = {l["heading"]: l["id"] for l in LEVELS}

# Rooms drawn on more than one map sheet (towers, shafts, stairs between floors).
# The app can hold one mark per room per level; this is just a hint for the UI.
ALSO_ON = {
    "K18": ["main", "spires", "dungeon"], "K18a": ["main", "spires", "dungeon"],
    "K20": ["main", "court", "spires"], "K20a": ["main", "larders"],
    "K21": ["main", "court", "larders", "dungeon"],
    "K31a": ["court", "larders"], "K31b": ["court", "larders"],
    "K83": ["dungeon"], "K83a": ["dungeon"],
}

# ---- split chapter into level sections and rooms ----------------------
start = next(i for i, l in enumerate(lines) if l.startswith("# Chapter 4"))
end = next(i for i, l in enumerate(lines) if i > start and l.startswith("# Chapter 5"))
ch = lines[start:end]

ROOM_RE = re.compile(r"^### (K\d+[a-z]?)\.\s+(.*)$")
SUB_RE = re.compile(r"^#### (K\d+[a-z])\.\s+(.*)$")
CRYPT_RE = re.compile(r"^#### Crypt (\d+)\s*$")

rooms, cur, cur_level = [], None, None


def flush():
    global cur
    if cur:
        cur["text"] = "\n".join(cur["_lines"]).strip()
        del cur["_lines"]
        rooms.append(cur)
        cur = None


for line in ch:
    if line.startswith("## "):
        h = line[3:].strip()
        if h in LEVEL_BY_HEADING:
            flush()
            cur_level = LEVEL_BY_HEADING[h]
        continue
    m = ROOM_RE.match(line)
    if m:
        flush()
        cur = dict(id=m.group(1), name=m.group(2).strip(), level=cur_level,
                   parent=None, kind="room", _lines=[])
        continue
    m = SUB_RE.match(line)
    if m and cur:
        parent, lvl = cur["parent"] or cur["id"], cur["level"]
        flush()
        cur = dict(id=m.group(1), name=m.group(2).strip(), level=lvl,
                   parent=parent, kind="subarea", _lines=[])
        continue
    m = CRYPT_RE.match(line)
    if m and cur:
        lvl = cur["level"]
        flush()
        cur = dict(id="Crypt %s" % m.group(1), name="Crypt %s" % m.group(1),
                   level=lvl, parent="K84", kind="crypt", _lines=[])
        continue
    if line.startswith("#### ") and cur:
        cur["_lines"].append("\n**" + line[5:].strip() + "**")
        continue
    if cur is not None:
        cur["_lines"].append(line)
flush()

# =======================================================================
#  feature extraction
# =======================================================================
# The key printed on the battlemaps uses exactly these symbols:
#   Door · Double Doors · Standard Door and Secret Door · Secret Door ·
#   One-way Secret Door · Teleport Trap · Trapdoor in Floor ·
#   Trapdoor in Ceiling · Window · Arrow Slit · Portcullis · Trap
# The lexicon mirrors that vocabulary and adds the furnishings and treasure
# the text calls out. Order matters: specific phrases precede generic ones.
LEXICON = [
    # --- openings -----------------------------------------------------
    ("secret-door", r"one-way secret doors?|secret doors?|hidden doors?|concealed doors?"),
    ("door",        r"trapdoors?|trap doors?"),
    ("door",        r"portcullis(?:es)?|drawbridges?"),
    ("door",        r"double doors?|sets? of doors?|pair of doors?"),
    ("door",        r"(?:iron|ironbound|wooden|oaken|bronze|stone|oak|brass|carved|ornate"
                    r"|outer|inner|secret) doors?"),
    ("door",        r"iron gates?|gates?"),
    ("door",        r"archways?|doorways?"),
    ("door",        r"doors?"),
    # --- vertical circulation ----------------------------------------
    ("stairs",      r"spiral stair(?:case|way|well)s?|spiral stairs|winding stair(?:case|way|well)s?|winding stairs"),
    ("stairs",      r"stair(?:case|way|well)s?|stairs"),
    ("stairs",      r"elevator(?: compartments?| traps?)?s?|dumbwaiters?"),
    ("stairs",      r"ladders?|ramps?|shafts?|bridges?|catwalks?|walkways?"),
    ("stairs",      r"steps"),
    # --- hazards ------------------------------------------------------
    ("light",       r"fire pits?|firepits?"),
    ("trap",        r"teleport traps?|scything blades?|poison(?:ed)? needles?"),
    ("trap",        r"spiked pits?|pit traps?"),
    ("trap",        r"traps?"),
    ("trap",        r"pits?"),
    # --- apertures ----------------------------------------------------
    ("window",      r"arrow slits?|murder holes?"),
    ("window",      r"stained[- ]glass windows?|windows?|balcon(?:y|ies)"
                    r"|parapets?|battlements?"),
    # --- light --------------------------------------------------------
    ("light",       r"fireplaces?|hearths?|forges?|braziers?"),
    ("light",       r"chandeliers?|candelabra|torchlight|torch(?:es)?|sconces?|lanterns?|candles?"),
    # --- furnishings and set pieces -----------------------------------
    ("item",        r"sarcophag(?:us|i)|coffins?|caskets?|biers?|catafalques?"),
    ("item",        r"altars?|shrines?|thrones?|lecterns?|pulpits?"),
    ("item",        r"pipe organs?|organs?|harpsichords?|spinning wheels?"),
    ("item",        r"chests?|coffers?|strongbox(?:es)?|footlockers?|trunks?"),
    ("item",        r"levers?|switch(?:es)?|buttons?|pull chains?|winch(?:es)?|cranks?"),
    ("item",        r"mirrors?|portraits?|paintings?|tapestr(?:y|ies)|frescoes?|mosaics?"),
    ("item",        r"statues?|busts?|gargoyles?|idols?|effigies?"),
    ("item",        r"fountains?|cisterns?|cauldrons?|vats?"),
    ("item",        r"bookcases?|bookshel(?:f|ves)|wardrobes?|armoires?|cabinets?|desks?"),
    ("item",        r"beds?|tables?|benches?|pews?|couch(?:es)?"),
    ("item",        r"bells?|belfr(?:y|ies)"),
    ("item",        r"barrels?|casks?|crates?|sacks?|urns?"),
    ("item",        r"stoves?|ovens?|kilns?"),
    ("item",        r"alcoves?|niches?|pedestals?|dais(?:es)?|platforms?"),
    ("item",        r"cots?|racks?|shelves|shelf|cages?|gongs?|anvils?|looms?"),
    ("item",        r"tombs?"),
]
LEX = [(k, re.compile(r"\b(?:" + p + r")\b", re.I)) for k, p in LEXICON]

DIRECTION = re.compile(
    r"^[^.;,]{0,16}?\b((?:to|in|on|along|behind|above|below|beneath|at|against) the "
    r"(?:north(?:east|west)?|south(?:east|west)?|east|west|far|near|opposite|"
    r"outer|inner|left|right|top|bottom|center|centre)"
    r"(?: (?:wall|side|corner|end|walls|sides))?"
    r"(?: of the (?:room|hall|floor|chamber|ceiling|tower|stair|landing))?)", re.I)

# spans that never describe a physical feature standing in this room
CROSSREF = re.compile(r"\(areas? K\d|\bsee (?:area|appendix|chapter|map)\b|\bmap \d\b", re.I)
WELL_GUARD = re.compile(
    r"\b(?:as well as|as well\b|well[- ](?:cared|oiled|dressed|polished|hidden|kept|"
    r"preserved|made|over|enough|maintained|off|known|lit)|wishes them well|does well|"
    r"playing well)", re.I)
NEG_PREFIX = re.compile(r"\b(?:no|without|nor|neither)\s+(?:\w+\s+){0,2}$", re.I)

STOP_MODS = {
    # determiners, prepositions, conjunctions
    "the", "a", "an", "this", "that", "these", "those", "its", "his", "her",
    "their", "and", "or", "of", "with", "from", "into", "onto", "at", "by",
    "through", "behind", "beyond", "toward", "towards", "other", "each", "off",
    "all", "both", "another", "such", "same", "one", "two", "more", "any",
    "to", "for", "as", "than", "then", "also", "not", "only", "up", "down",
    # verbs that sit immediately before a noun and are not descriptive
    "is", "are", "was", "were", "be", "been", "being", "has", "have", "had",
    "see", "sees", "seen", "hear", "hears", "heard", "reveal", "reveals",
    "find", "finds", "spot", "spots", "notice", "notices", "opens", "open",
    "close", "closes", "pull", "pulls", "push", "pushes", "contain", "contains",
    "hold", "holds", "block", "blocks", "lead", "leads", "show", "shows",
    "smell", "smells", "bear", "bears", "carry", "carries", "make", "makes",
    "take", "takes", "give", "gives", "place", "places", "put", "puts",
    "use", "uses", "enter", "enters", "leave", "leaves", "sit", "sits",
    "stand", "stands", "lie", "lies", "hang", "hangs", "swing", "swings",
    "slam", "slams", "become", "becomes", "reach", "reaches", "move", "moves",
    "know", "knows", "want", "wants", "like", "likes", "call", "calls",
    "toward", "beside", "between", "under", "over", "near", "past", "within",
    "per", "following", "illuminate", "illuminates", "adorn", "adorns",
    "cover", "covers", "fill", "fills", "line", "lines", "flank", "flanks",
    "support", "supports", "surround", "surrounds", "depict", "depicts",
    "reveal", "conceal", "conceals", "connect", "connects", "descend",
    "descends", "ascend", "ascends", "climb", "climbs", "rise", "rises",
    "attack", "attacks", "resembles", "resemble", "includes", "include",
}

# a "table" that you roll on is not furniture
DICE_TABLE = re.compile(r"\b(?:the following table|roll(?:s|ed)? (?:a|on|for)|d100|d20|d12|d10|d8|d6|"
                        r"table below|on the table)\b", re.I)


def sentences(t):
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
    t = re.sub(r"\{@\w+ ([^|}]+)(\|[^}]*)?\}", r"\1", t)
    t = re.sub(r"^\s*\|.*$", " ", t, flags=re.M)      # markdown tables
    t = t.replace(">>", " ")
    t = re.sub(r"\s+", " ", t)
    out = []
    for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"*(])", t):
        s = s.strip()
        if len(s) > 12:
            out.append(s)
    return out


def clean(s, n=170):
    s = re.sub(r"\*+", "", re.sub(r"\s+", " ", s)).strip()
    return s if len(s) <= n else s[:n - 1].rstrip(" ,;") + "…"


def make_label(sent, m):
    """Build labels like 'Ornate outer doors, to the east'."""
    head = m.group(0).strip()
    pre = sent[:m.start()]
    w = re.search(r"([A-Za-z][a-z\-']+)\s*$", pre)
    if w and w.group(1).lower() not in STOP_MODS and len(w.group(1)) > 2:
        head = w.group(1) + " " + head
    d = DIRECTION.match(sent[m.end():])
    label = head[0].upper() + head[1:]
    if d:
        label += ", " + d.group(1).strip().lower()
    label = re.sub(r"\s+", " ", label).replace("- ", "-").strip(" -,")
    if label.isupper():
        label = label.capitalize()
    return label[:64]


def extract(room, synthetic=None):
    feats, seen = list(synthetic or []), set()
    tomb_ok = room["id"] in ("K85", "K86", "K88") or room["kind"] == "crypt"
    for sent in sentences(room["text"]):
        if CROSSREF.search(sent) and len(sent) < 90:
            continue                                  # pure cross-reference line
        taken = []                 # character spans already claimed in this sentence
        for kind, rx in LEX:
            for m in rx.finditer(sent):
                if any(m.start() < b and a < m.end() for a, b in taken):
                    continue       # an earlier, more specific pattern owns this span
                word = m.group(0).lower()
                around = sent[max(0, m.start() - 14):m.end() + 14]
                if word.startswith("tomb") and not tomb_ok:
                    continue
                if word.startswith("shaft") and "of light" in sent[m.end():m.end() + 22]:
                    continue
                if word.startswith("table") and DICE_TABLE.search(sent):
                    continue
                if word.endswith("organ") and re.search(
                        r"organ (?:music|tones|notes|melody)", around, re.I):
                    continue
                if NEG_PREFIX.search(sent[:m.start()]):
                    continue
                if re.match(r"\s*\(areas? K", sent[m.end():m.end() + 10], re.I):
                    continue
                if WELL_GUARD.search(around) and word.startswith("well"):
                    continue
                # "the pipe organ in area K10" lives elsewhere; "the door to area
                # K10" is a door standing right here.
                if re.match(r"\s+in areas? K\d", sent[m.end():m.end() + 14], re.I):
                    continue
                taken.append((m.start(), m.end()))
                label = make_label(sent, m)
                key = (kind, re.sub(r"[^a-z ]", "", label.lower()))
                if key in seen:
                    continue
                seen.add(key)
                feats.append(dict(type=kind, label=label, note=clean(sent)))

    # --- treasure ------------------------------------------------------
    tm = re.search(r"\*\*Treasure\*\*\n(.*?)(?=\n\*\*|\Z)", room["text"], re.S)
    if tm:
        body = tm.group(1)
        feats.append(dict(type="item", label="Treasure", note=clean(body, 320)))
        names = [] if re.search(r"spellbook|spell list|following spells", body, re.I) \
            else dict.fromkeys(re.findall(r"\*([a-z][a-z' \-\+0-9]{3,44})\*", body))
        for name in list(names)[:8]:
            key = ("item", name.lower())
            if key in seen:
                continue
            seen.add(key)
            feats.append(dict(type="item", label=name[0].upper() + name[1:],
                              note="Magic item listed under Treasure"))

    feats = merge_suffixes(feats)
    for i, f in enumerate(feats):
        f["id"] = "%s::f%d" % (room["id"], i + 1)
        f["auto"] = True
    return feats


SYNONYM = {"staircase": "stair", "stairway": "stair", "stairwell": "stair",
           "stairs": "stair", "step": "stair", "steps": "stair",
           "doorway": "door", "double": "", "set": "", "pair": ""}


def _norm(label):
    """Normalise to comparable word stems, ignoring anything after a comma."""
    base = label.split(",")[0]
    w = re.sub(r"[^a-z ]", " ", base.lower()).split()
    out = []
    for x in w:
        x = SYNONYM.get(x, x)
        if not x:
            continue
        if len(x) > 3 and x.endswith("s") and not x.endswith("ss"):
            x = x[:-1]
        out.append(SYNONYM.get(x, x))
    return out or [base.lower()]


def merge_suffixes(feats):
    """'Door' and 'Wooden door' describe the same thing; keep the specific one."""
    keep = []
    for f in feats:
        nf = _norm(f["label"])
        absorbed = False
        for g in keep:
            if g["type"] != f["type"]:
                continue
            ng = _norm(g["label"])
            if ng[-len(nf):] == nf and len(nf) < len(ng):
                absorbed = True            # f is the vaguer of the two
                break
            if nf[-len(ng):] == ng and len(ng) < len(nf):
                g["label"] = f["label"]
                absorbed = True
                break
            if nf == ng:                     # same thing, one may carry a direction
                if "," in f["label"] and "," not in g["label"]:
                    g["label"] = f["label"]
                absorbed = True
                break
        if not absorbed:
            keep.append(f)
    return keep


CELL_DOOR = ("Barred iron cell door",
             "A hinged door of 1-inch-thick rusted iron bars, fitted with an iron lock. "
             "DC 20 Dexterity with thieves' tools to pick, DC 25 Strength to force. (K74/K75)")
CRYPT_DOOR = ("Stone slab door",
              "A tight-fitting chiselled stone slab, 3 feet wide, 5 feet tall and 3 inches "
              "thick. Removing or resetting it takes an action and a DC 15 Strength check. (K84)")

# =======================================================================
#  hand curation
# =======================================================================
# The lexicon pass is a first draft. CURATION is the read-it-yourself pass over
# each room: it drops entries that duplicate another, or that describe something
# that is not a placeable object; relabels the ones the text describes better;
# and adds what the pattern matching missed.
#
# It is keyed on the auto-generated feature ids, which therefore stay stable, so
# placements already made against them are never orphaned.
try:
    from curation import CURATION
except ImportError:
    CURATION = {}


def curate(room):
    c = CURATION.get(room["id"])
    if not c:
        return room["features"]
    drop = set(c.get("drop", []))
    rel = c.get("relabel", {})
    ret = c.get("retype", {})
    out = []
    for f in room["features"]:
        n = f["id"].rsplit("f", 1)[-1]
        if n in drop or f["id"] in drop:
            continue
        if n in rel:
            f["label"] = rel[n]
        elif f["id"] in rel:
            f["label"] = rel[f["id"]]
        if n in ret:
            f["type"] = ret[n]
        elif f["id"] in ret:
            f["type"] = ret[f["id"]]
        out.append(f)
    for i, extra in enumerate(c.get("add", [])):
        out.append(dict(type=extra[0], label=extra[1],
                        note=extra[2] if len(extra) > 2 else "",
                        id="%s::x%d" % (room["id"], i + 1), auto=False))
    return out


for r in rooms:
    # Every crypt is sealed by a stone slab and every dungeon cell by a barred
    # iron door. The module states each once, for the whole set, so inject them.
    extra = None
    if r["kind"] == "crypt":
        extra = CRYPT_DOOR
    elif r["parent"] in ("K74", "K75"):
        extra = CELL_DOOR
    syn = [dict(type="door", label=extra[0], note=extra[1])] if extra else None
    r["features"] = extract(r, syn)
    r["features"] = curate(r)

# ---- assemble ---------------------------------------------------------
by_level = {}
for r in rooms:
    by_level.setdefault(r["level"], []).append(r["id"])

levels = [dict(id=l["id"], name=l["name"], dmMap=l["dm"], playerMap=l["player"],
               width=l["w"], height=l["h"],
               grid=dict(size=l["grid"], offsetX=l["offx"], offsetY=l["offy"],
                         feetPerSquare=10, calibrated=True),
               elevationFeet=l["elev"], elevationNote=ELEV_NOTE[l["id"]],
               rooms=by_level.get(l["id"], []))
          for l in LEVELS]

out_rooms = []
for r in rooms:
    d = {k: r[k] for k in ("id", "name", "level", "parent", "kind", "text", "features")}
    d["alsoOn"] = ALSO_ON.get(r["id"], [])
    if r["id"] in ROOM_ELEV:
        d["elevationFeet"], d["elevationNote"] = ROOM_ELEV[r["id"]]
    out_rooms.append(d)

data = dict(title="Castle Ravenloft", source="Curse of Strahd, chapter 4",
            levels=levels, rooms=out_rooms)
json.dump(data, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

print("rooms: %d   features: %d" % (len(rooms), sum(len(r["features"]) for r in rooms)))
for l in levels:
    print("  %-10s %3d rooms" % (l["id"], len(l["rooms"])))
miss = [r["id"] for r in rooms if not r["level"]]
if miss:
    print("NO LEVEL:", miss)
