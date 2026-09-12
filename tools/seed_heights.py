"""Seed mark heights from the module's own numbers.

Everything is in feet above the main floor, which is 0. The sheet's floor (or
the room's own elevation, for the tower rooms on the spires sheet) is the
default and is not written out; this fills in the extra the text gives us:

  * a room's ceiling, where the text states one
  * a handful of things the book measures end to end, such as the shafts

Anything seeded here is tagged "src": "module", and this tool only ever
overwrites its own seeds, so a height typed into the interface is never lost.
"""
import json

# room -> ceiling height above that room's own floor, from the module text
CEILING = {
    'K12': 30, 'K15': 90, 'K19': 20, 'K27': 20, 'K39': 20, 'K41': 40, 'K51': 10,
    'K54': 20, 'K60': 9, 'K61': 10, 'K62': 10, 'K67': 20, 'K69': 10,
    'K74': 8,      # "ceiling three feet above the water", water five feet deep
    'K75': 8,
    'K76': 20,     # "17 feet above the surface of the water", water three feet deep
    'K77': 10, 'K78': 20, 'K81': 6, 'K84': 20, 'K85': 30, 'K86': 30, 'K88': 30,
    'Crypt 14': 10, 'Crypt 30': 15,
}

# rooms the book measures as a span rather than a floor with a ceiling. The
# shafts and the two great staircases run through the whole castle, so they are
# given the range they actually cover rather than the floor of one sheet.
ROOM_SPAN = {
    'K53': (130, 150),    # the keep roof slopes up from the eaves to its end peaks
    'K52': (130, 160),    # the smokestack "rises thirty feet above the roof's peak"
    'K18': (-110, 340),   # the high tower staircase, catacombs to the tower peak
    'K18a': (-110, 340),  # the shaft it wraps: "descends 450 feet to the catacombs"
    'K20': (0, 250),      # the Heart of Sorrow tower, main floor to the top at K60
    'K31a': (-120, 50),   # "a 170-foot-deep shaft" below the K31 trapdoor
}

# things measured end to end, by feature id
FEATURE_SPAN = {
    'K18a::f1': (-110, 340),   # the high tower shaft, catacombs floor to K59
    'K31a::f1': (-120, 50),    # "a 170-foot-deep shaft" below the K31 trapdoor
    'K52::f1': (130, 160),     # the smokestack above the roof
}

def floor_of(room, level_base, level_id):
    if room and isinstance(room.get('elevationFeet'), (int, float)) and room['level'] == level_id:
        return room['elevationFeet']
    return level_base

def main():
    data = json.load(open('castle-data.json'))
    base = {l['id']: l.get('elevationFeet', 0) for l in data['levels']}
    rooms = {r['id']: r for r in data['rooms']}
    ann = json.load(open('castle-ravenloft-annotations.json'))
    marks = ann['marks']
    kept = written = 0
    for key, m in marks.items():
        h = m.get('height')
        if h and h.get('src') != 'module':
            kept += 1
            continue                       # set by hand: leave it alone
        if key.startswith('room:'):
            rid = key[5:key.rindex('@')]
        elif key.startswith('feat:'):
            rid = key[5:].split('::')[0]
        else:
            rid = None
        room = rooms.get(rid)
        fl = floor_of(room, base.get(m['levelId'], 0), m['levelId'])
        new = None
        if key.startswith('room:'):
            if rid in ROOM_SPAN:
                new = {'from': ROOM_SPAN[rid][0], 'to': ROOM_SPAN[rid][1]}
            elif rid in CEILING:
                new = {'from': fl, 'to': fl + CEILING[rid]}
        elif key.startswith('feat:'):
            fid = key[5:key.index('#')]
            if fid in FEATURE_SPAN:
                new = {'from': FEATURE_SPAN[fid][0], 'to': FEATURE_SPAN[fid][1]}
        if new:
            new['src'] = 'module'
            m['height'] = new
            written += 1
        elif h:
            del m['height']
    json.dump(ann, open('castle-ravenloft-annotations.json', 'w'), indent=1)
    print(f'{written} marks seeded from the module, {kept} hand-set heights left alone')

if __name__ == '__main__':
    main()
