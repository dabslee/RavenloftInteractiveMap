/* ==================================================================
   Markers: the shared data layer

   The model in SCHEMA.md, read the same way by the editor and the reader so
   the two cannot disagree about what a room contains or where it leads. This
   is a plain script, loaded before app.js and browse.js; it reads the ANN,
   ROOMS, LEVELS and S that the page around it declares, and writes nothing.

   The one rule worth stating twice: a room is looked at one floor at a time.
   Its things and its ways are those on the sheet in front of you, and a
   passage between two floors belongs to both of them.
   ================================================================== */
// Colour and icon per kind of marker. An object is coloured by its
// objectType; a portal by what sort of way it is, except that a secret one is
// marked as secret whatever its passage.
const TYPES = {
  area:     { label: 'Area',       ico: '▢', color: '#8b6fe0' },
  creature: { label: 'Creature',   ico: '☠',  color: '#c2453f' },
  item:     { label: 'Item',       ico: '◆',  color: '#63c07e' },
  trap:     { label: 'Trap',       ico: '⚠',  color: '#e0553f' },
  note:     { label: 'Note',       ico: '✎',  color: '#9a93b0' },
  door:     { label: 'Door',       ico: '🚪', color: '#d9913f' },
  secret:   { label: 'Secret way', ico: '◈',  color: '#d64fb0' },
  barrier:  { label: 'Window',     ico: '▤',  color: '#49c7c2' },
  open:     { label: 'Open way',   ico: '≣',  color: '#4aa3e0' },
};

// Markers as SCHEMA.md describes them: an object belongs to one room, a
// portal names the two places it joins. A marker holds any number of shapes,
// so everything that draws or hit-tests works on an ITEM -- one shape of one
// marker, keyed "<markerId>#<n>", which is the key passed around below.
//
// Three indexes are built once at load and held in memory. Nothing derived is
// stored in the file and nothing is worked out twice, so there is no cache to
// go stale and no warning to print when it has.

const ITEMS = new Map();            // key -> { key, id, i, shape, level, marker }
const OBJECTS_OF_ROOM = new Map();  // roomId  -> [objectId]
const PORTALS_OF_ROOM = new Map();  // roomId  -> [portalId]
const ITEMS_ON_LEVEL = new Map();   // levelId -> [key]

const marker = id => (id && ANN.markers[id]) || null;
const isObject = m => !!m && m.kind === 'object';
const isPortal = m => !!m && m.kind === 'portal';

const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };

function reindex() {
  ITEMS.clear(); OBJECTS_OF_ROOM.clear(); PORTALS_OF_ROOM.clear(); ITEMS_ON_LEVEL.clear();
  for (const [id, m] of Object.entries(ANN.markers)) {
    (m.shapes || []).forEach((shape, i) => {
      const key = id + '#' + i;
      ITEMS.set(key, { key, id, i, shape, level: shape.level, marker: m });
      push(ITEMS_ON_LEVEL, shape.level, key);
    });
    if (isObject(m)) push(OBJECTS_OF_ROOM, m.room, id);
  }
  // a portal belongs to a room when either place it joins is in that room
  for (const [id, m] of Object.entries(ANN.markers)) {
    if (!isPortal(m)) continue;
    const seen = new Set();
    for (const side of m.sides || []) {
      const o = marker(side.marker);
      if (isObject(o) && !seen.has(o.room)) { seen.add(o.room); push(PORTALS_OF_ROOM, o.room, id); }
    }
  }
}

const objectsOfRoom = roomId => OBJECTS_OF_ROOM.get(roomId) || [];
const portalsOfRoom = roomId => PORTALS_OF_ROOM.get(roomId) || [];
const itemsOf = id => ((marker(id) || {}).shapes || []).map((_, i) => ITEMS.get(id + '#' + i));
const itemsOnLevel = levelId =>
  (ITEMS_ON_LEVEL.get(levelId || S.levelId) || []).map(k => ITEMS.get(k));

/** Every room a marker touches: its own for an object, both sides for a portal. */
function roomsOf(m) {
  if (isObject(m)) return [m.room];
  const out = [];
  for (const s of (m.sides || [])) {
    const o = marker(s.marker);
    if (isObject(o) && !out.includes(o.room)) out.push(o.room);
  }
  return out;
}

/** Which entry in TYPES draws this marker. */
const typeOf = m => isObject(m) ? (m.objectType || 'note')
                  : (m.secret ? 'secret' : m.passage);

/** The side of a portal you are standing on, and the one across it. */
function nearSide(p, roomId) {
  const sides = (p.sides || []).map(s => ({ s, o: marker(s.marker) }));
  const mine = sides.filter(x => isObject(x.o) && x.o.room === roomId);
  if (!mine.length) return p.sides[0];
  // both sides in the same room is a stair between two drawings of it: take
  // the one on the sheet being shown
  const here = mine.find(x => ((x.o.shapes || [])[0] || {}).level === S.levelId);
  return (here || mine[0]).s;
}
const farSide = (p, roomId) => {
  const near = nearSide(p, roomId);
  return p.sides[0] === near ? p.sides[1] : p.sides[0];
};

const nameOf = (m, fromRoom) => isObject(m) ? (m.name || '')
  : ((nearSide(m, fromRoom) || {}).name || '');
const noteOf = (m, fromRoom) => isObject(m) ? (m.description || '')
  : ((nearSide(m, fromRoom) || {}).description || '');

/** What an item is, said from the room being read. */
function markMeta(key) {
  const it = ITEMS.get(key);
  if (!it) return { type: 'note', label: '', note: '', roomId: null };
  const rooms = roomsOf(it.marker);
  const home = rooms.includes(S.roomId) ? S.roomId : rooms[0];
  return { type: typeOf(it.marker), label: nameOf(it.marker, home),
           note: noteOf(it.marker, home), roomId: home, marker: it.marker, item: it };
}

const grid = levelId => ANN.grids[levelId || S.levelId]
  || LEVELS.get(levelId || S.levelId).grid;

function levelElevation(levelId) {
  const l = LEVELS.get(levelId);
  return (l && typeof l.elevationFeet === 'number') ? l.elevationFeet : 0;
}

/** The floor an item stands on: its room's own elevation, else its sheet's. */
function floorUnder(it) {
  for (const id of roomsOf(it.marker)) {
    const r = ROOMS.get(id);
    if (r && typeof r.elevationFeet === 'number' && r.level === it.level) return r.elevationFeet;
  }
  return levelElevation(it.level);
}

function heightOf(key) {
  const it = typeof key === 'string' ? ITEMS.get(key) : key;
  if (!it) return null;
  const h = it.marker.height;
  if (h && (typeof h.at === 'number' || typeof h.from === 'number' || typeof h.to === 'number')) {
    return h;
  }
  return { at: floorUnder(it), assumed: true };
}

const ft = n => (Math.round(n * 10) / 10) + ' ft';
function heightText(h) {
  if (!h) return '';
  if (typeof h.from === 'number' || typeof h.to === 'number') {
    return ft(h.from ?? 0) + ' to ' + ft(h.to ?? 0);
  }
  return ft(h.at ?? 0);
}

/**
 * The floor an object stands on, for working out the rise through a portal.
 *
 * A height with a span is the thing's extent, not the floor it rests on, and
 * for a room drawn on several sheets the two are nothing alike: K20's outline
 * carries 0 to 250 ft on every one of its four sheets, because that is how far
 * the tower reaches. Taking `from` would put all four on the ground and read
 * every flight of its staircase as level. So a span is ignored here and the
 * sheet says where the floor is, which is also the right answer for an
 * ordinary room whose span starts at its own floor.
 */
function objectFloor(o) {
  if (!isObject(o)) return null;
  const h = o.height;
  if (h && typeof h.at === 'number') return h.at;
  const lv = ((o.shapes || [])[0] || {}).level;
  const r = ROOMS.get(o.room);
  if (r && typeof r.elevationFeet === 'number' && r.level === lv) return r.elevationFeet;
  return levelElevation(lv);
}

const objectLevel = o => (((o || {}).shapes || [])[0] || {}).level || null;

/** Everything drawn for a room on a sheet: its own objects and its portals. */
function itemsForRoom(roomId, levelId) {
  const out = [];
  for (const id of objectsOfRoom(roomId).concat(portalsOfRoom(roomId))) {
    for (const it of itemsOf(id)) {
      if (it && (!levelId || it.level === levelId)) out.push(it);
    }
  }
  return out;
}

/** The room's own outline on a sheet, if it is drawn there. */
const areaItemOf = (roomId, levelId) =>
  itemsOf(objectsOfRoom(roomId).find(id => marker(id).objectType === 'area'
    && marker(id).shapes.some(s => s.level === levelId)))
    .find(it => it && it.level === levelId) || null;

/** Which sheets a room is drawn on. */
const sheetsOf = roomId => [...new Set(objectsOfRoom(roomId)
  .map(id => marker(id))
  .filter(m => m.objectType === 'area')
  .flatMap(m => (m.shapes || []).map(s => s.level)))];

/**
 * The sheet a room answers to when something of its own has not been drawn
 * yet and so has no floor to sit on. Its own sheet from the book, if it is
 * drawn there; failing that the lowest sheet it is drawn on. A room drawn
 * nowhere has no home, and its undrawn things show wherever you are, since
 * no other sheet would ever show them.
 */
function homeSheet(roomId) {
  const drawn = sheetsOf(roomId);
  const own = (ROOMS.get(roomId) || {}).level;
  if (drawn.includes(own)) return own;
  if (drawn.length) {
    return drawn.slice().sort((a, b) => levelElevation(a) - levelElevation(b))[0];
  }
  return null;
}

/** Is this thing of the room's on the sheet being looked at? */
const objectIsOn = (m, levelId, roomId) => (m.shapes || []).length
  ? (m.shapes || []).some(s => s.level === levelId)
  : (homeSheet(roomId) || levelId) === levelId;

/**
 * The side of a portal that lands in this room on this sheet. A portal is
 * shown with a room only when the end you would actually be standing on is
 * drawn on the sheet in front of you, which is what puts a flight of stairs
 * on both floors it joins: its two ends are the same room on two sheets, so
 * one end matches below and the other above.
 */
function sideOn(p, roomId, levelId) {
  for (const s of (p.sides || [])) {
    const o = marker(s.marker);
    if (!isObject(o) || o.room !== roomId) continue;
    if (objectIsOn(o, levelId, roomId)) return s;
  }
  return null;
}

// ==================================================================
//  what connects to what
// ==================================================================
// Nothing is worked out here and nothing was worked out anywhere else either:
// a portal names the two places it joins, so a room's ways in and out are a
// lookup. What is left to do is put it into words.

// The book's own word for a way, taken from what the portal is called on the
// side you are standing on. This is wording, not data: when nothing matches,
// the portal's own passage says what it is.
const WORDS = [
  [/portcullis/i, 'portcullis'], [/trapdoor|trap door/i, 'trapdoor'],
  [/ladder/i, 'ladder'], [/chute/i, 'chute'], [/bridge/i, 'bridge'],
  [/spiral stair/i, 'spiral stair'], [/stair|steps/i, 'stairs'],
  [/archway|arch\b/i, 'archway'], [/gaping|doorway/i, 'open doorway'],
  [/shaft/i, 'shaft'], [/curtain/i, 'curtained way'],
  [/window/i, 'window'], [/arrow slit/i, 'arrow slit'],
  [/barred|bars/i, 'barred way'], [/grate|grating/i, 'grate'],
  [/elevator/i, 'elevator'], [/double doors?/i, 'double doors'], [/door/i, 'door'],
];

function howWord(p, label) {
  for (const [re, word] of WORDS) if (re.test(label || '')) return word;
  if (p.passage === 'open') return 'open way';
  if (p.passage === 'barrier') return p.transparent ? 'window' : 'grate';
  return 'door';
}

/** How a portal stands right now, said in a couple of words. */
function stateWords(p) {
  const bits = [];
  if (p.secret) bits.push('secret');
  if (p.passage === 'door') bits.push(p.state === 'locked' ? 'locked' : p.state);
  else if (p.passage === 'barrier') bits.push(p.transparent ? 'see-through' : 'solid');
  if (p.lockable && p.state !== 'locked') bits.push('lockable');
  return bits.join(', ');
}

/**
 * Where a way takes you: the sheet at the far end, and the rise, measured
 * from the two places the portal joins. The module's own direction words are
 * not consulted any more -- the two ends know their own heights.
 */
function travel(a, b) {
  if (!isObject(a) || !isObject(b)) return { rise: 0, dir: '', sameSheet: true };
  const rise = objectFloor(b) - objectFloor(a);
  const lb = objectLevel(b);
  return { rise, dir: rise > 4 ? 'up' : rise < -4 ? 'down' : '',
           sheet: lb, sheetName: (LEVELS.get(lb) || {}).name || lb,
           sameSheet: objectLevel(a) === lb };
}

const firstItemOn = (id, levelId) => itemsOf(id).find(it => it && it.level === levelId)
  || itemsOf(id)[0] || null;

/** Every way in and out of a room on the sheet being looked at. */
function connectionsOf(roomId, levelId = S.levelId) {
  const rows = [];
  for (const pid of portalsOfRoom(roomId)) {
    const p = marker(pid);
    const mine = sideOn(p, roomId, levelId);
    if (!mine) continue;              // its end in this room is on another sheet
    const near = mine, far = p.sides[0] === mine ? p.sides[1] : p.sides[0];
    const nearObj = marker(near.marker), farObj = marker(far.marker);
    const it = firstItemOn(pid, S.levelId);
    rows.push({
      id: pid, to: isObject(farObj) ? farObj.room : null,
      key: it ? it.key : null,
      label: near.name || far.name || '',
      description: near.description || '',
      farName: far.name || '',
      type: typeOf(p),
      how: howWord(p, near.name || far.name),
      state: stateWords(p),
      height: it ? heightOf(it) : null,
      unmarked: !(p.shapes || []).length,
      go: travel(nearObj, farObj),
    });
  }
  const order = { open: 0, door: 1, secret: 2, barrier: 3 };
  rows.sort((a, b) => (a.to ? 0 : 1) - (b.to ? 0 : 1)
                   || (order[a.type] ?? 9) - (order[b.type] ?? 9)
                   || String(a.to).localeCompare(String(b.to), undefined, { numeric: true }));
  return rows;
}

/** A room's own things on the sheet being looked at, area first, undrawn last. */
function contentsOf(roomId, levelId = S.levelId) {
  const rank = { area: 0, creature: 1, item: 2, trap: 3, note: 4 };
  return objectsOfRoom(roomId)
    .filter(id => objectIsOn(marker(id), levelId, roomId))
    .map(id => {
      const m = marker(id);
      const it = firstItemOn(id, levelId);
      const shapes = (m.shapes || []).filter(s => s.level === levelId);
      return { id, marker: m, type: m.objectType, name: m.name, description: m.description,
               key: it ? it.key : null, placed: !!(m.shapes || []).length,
               count: shapes.length,
               height: it ? heightOf(it) : null, light: m.light };
    }).sort((a, b) => (a.placed ? 0 : 1) - (b.placed ? 0 : 1)
                   || (rank[a.type] ?? 9) - (rank[b.type] ?? 9)
                   || String(a.name).localeCompare(String(b.name)));
}
