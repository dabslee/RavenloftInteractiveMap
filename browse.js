/* ==================================================================
   Castle Ravenloft reader

   A read-only view of the same annotations file the mapper writes. Pick a
   room on the left, read what the book says about it in the middle, and see
   it on the map with every marked thing in it labelled. Nothing here writes:
   the only request it makes is a GET.
   ================================================================== */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TYPES = {
  room:          { label: 'Room',        ico: '▢', color: '#8b6fe0' },
  door:          { label: 'Door',        ico: '🚪', color: '#d9913f' },
  'secret-door': { label: 'Secret door', ico: '◈',  color: '#d64fb0' },
  stairs:        { label: 'Stairs',      ico: '≣',  color: '#4aa3e0' },
  trap:          { label: 'Trap',        ico: '⚠',  color: '#e0553f' },
  window:        { label: 'Window',      ico: '▤',  color: '#49c7c2' },
  light:         { label: 'Light',       ico: '✦',  color: '#e7c453' },
  item:          { label: 'Item',        ico: '◆',  color: '#63c07e' },
  creature:      { label: 'Creature',    ico: '☠',  color: '#c2453f' },
  wall:          { label: 'Wall',        ico: '▬',  color: '#b9b2cc' },
  note:          { label: 'Note',        ico: '✎',  color: '#9a93b0' },
};
const OPEN = 0;

let DATA = null, ANN = null;
const LEVELS = new Map(), ROOMS = new Map();

const S = {
  levelId: null, roomId: null, search: '',
  playerMap: false, showGrid: false,
  view: { scale: 1, tx: 0, ty: 0 },
  hover: null, drag: null,
};

const keys = new Set();
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
let img = null, needsDraw = true;

// ==================================================================
//  loading
// ==================================================================
(async function boot() {
  const [d, a] = await Promise.all([
    fetch('/castle-data.json').then(r => r.json()),
    fetch('/api/annotations').then(r => r.json()),
  ]);
  DATA = d; ANN = a;
  ANN.marks ||= {}; ANN.customFeatures ||= {}; ANN.hiddenFeatures ||= []; ANN.renames ||= {};
  ANN.grids ||= {};
  DATA.levels.forEach(l => LEVELS.set(l.id, l));
  DATA.rooms.forEach(r => ROOMS.set(r.id, r));

  wire();
  renderLibrary();
  loop();

  const want = new URLSearchParams(location.search).get('room')
            || localStorage.getItem('cr.read.room');
  if (want && ROOMS.has(want)) await selectRoom(want);
  else await setLevel(DATA.levels[1].id);
})();

// ==================================================================
//  the data, read the same way the editor writes it
// ==================================================================
const splitKey = k => {
  const at = k.lastIndexOf('@');
  const head = at < 0 ? k : k.slice(0, at);
  const c = head.indexOf(':');
  let id = head.slice(c + 1), inst = 1;
  const h = id.lastIndexOf('#');
  if (h > 0) { inst = +id.slice(h + 1) || 1; id = id.slice(0, h); }
  return { kind: head.slice(0, c), id, inst, levelId: at < 0 ? null : k.slice(at + 1) };
};

function featuresOf(roomId) {
  const r = ROOMS.get(roomId);
  if (!r) return [];
  const hidden = new Set(ANN.hiddenFeatures);
  const auto = (r.features || []).filter(f => !hidden.has(f.id));
  const custom = ANN.customFeatures[roomId] || [];
  return auto.concat(custom).map(f => {
    const renamed = ANN.renames[f.id];
    return renamed ? Object.assign({}, f, { label: renamed }) : f;
  });
}

function markMeta(key) {
  const { kind, id } = splitKey(key);
  if (kind === 'iwall') {
    const roomId = id.split('~')[0];
    return { type: 'wall', label: 'Wall inside ' + roomId, roomId };
  }
  if (kind === 'room') {
    const r = ROOMS.get(id);
    return { type: 'room', label: id + '. ' + (r ? r.name : ''), roomId: id };
  }
  const roomId = id.split('::')[0];
  const f = featuresOf(roomId).find(x => x.id === id)
        || (ROOMS.get(roomId)?.features || []).find(x => x.id === id);
  return { type: f ? f.type : 'note', label: f ? f.label : id, note: f ? f.note : '', roomId };
}

const grid = levelId => ANN.grids[levelId || S.levelId]
  || LEVELS.get(levelId || S.levelId).grid;

function levelElevation(levelId) {
  const l = LEVELS.get(levelId);
  return (l && typeof l.elevationFeet === 'number') ? l.elevationFeet : 0;
}

/** The floor a mark stands on: its room's own elevation, else its sheet's. */
function floorUnder(key, m) {
  const r = ROOMS.get(markMeta(key).roomId);
  if (r && typeof r.elevationFeet === 'number' && r.level === m.levelId) return r.elevationFeet;
  return levelElevation(m.levelId);
}

function heightOf(key, m) {
  m = m || ANN.marks[key];
  if (!m) return null;
  const h = m.height;
  if (h && (typeof h.at === 'number' || typeof h.from === 'number' || typeof h.to === 'number')) {
    return h;
  }
  return { at: floorUnder(key, m), assumed: true };
}

const ft = n => (Math.round(n * 10) / 10) + ' ft';
function heightText(h) {
  if (!h) return '';
  if (typeof h.from === 'number' || typeof h.to === 'number') {
    return ft(h.from ?? 0) + ' to ' + ft(h.to ?? 0);
  }
  return ft(h.at ?? 0);
}

const marksOnLevel = levelId =>
  Object.entries(ANN.marks).filter(([, m]) => m && m.levelId === (levelId || S.levelId));

/** Every mark for a room: its outline, its own markers, its inside walls. */
function marksForRoom(roomId, levelId) {
  const out = [];
  for (const [k, m] of Object.entries(ANN.marks)) {
    if (levelId && m.levelId !== levelId) continue;
    const sk = splitKey(k);
    if (sk.kind === 'room' && sk.id === roomId) out.push([k, m]);
    else if (sk.kind === 'feat' && sk.id.split('::')[0] === roomId) out.push([k, m]);
    else if (sk.kind === 'iwall' && sk.id.split('~')[0] === roomId) out.push([k, m]);
  }
  return out;
}

/** Which sheets a room is drawn on. */
const sheetsOf = roomId => [...new Set(
  Object.entries(ANN.marks)
    .filter(([k]) => k.startsWith('room:') && splitKey(k).id === roomId)
    .map(([, m]) => m.levelId))];

// ==================================================================
//  what connects to what
// ==================================================================
// The editor works this out and writes it onto each mark as `links`. The
// reader just reads it, and describes the connection in plain words using the
// marker's own type and label: a stair is a stair, a trapdoor says trapdoor.

const PASSAGE_TYPES = new Set(['door', 'secret-door', 'stairs', 'window']);
const PASSAGE_WORDS =
  /trapdoor|trap door|ladder|chute|shaft|bridge|archway|portcullis|stair|steps|elevator|walkway|balcony|opening|doorway|hatch|teleport/i;

const WORDS = [
  [/portcullis/i, 'portcullis'], [/trapdoor|trap door/i, 'trapdoor'],
  [/ladder/i, 'ladder'], [/chute/i, 'chute'], [/bridge/i, 'bridge'],
  [/spiral stair/i, 'spiral stair'], [/stair|steps/i, 'stairs'],
  [/archway|arch\b/i, 'archway'], [/gaping|doorway/i, 'open doorway'],
  [/shaft/i, 'shaft'], [/curtain/i, 'curtained way'],
  [/secret door/i, 'secret door'], [/window/i, 'window'],
  [/arrow slit/i, 'arrow slit'], [/barred|bars/i, 'barred way'],
  [/elevator/i, 'elevator'], [/double doors?/i, 'double doors'], [/door/i, 'door'],
];

function howWord(meta) {
  for (const [re, word] of WORDS) if (re.test(meta.label || '')) return word;
  return (TYPES[meta.type] || TYPES.note).label.toLowerCase();
}

/**
 * The floor a room stands on, in feet, measured on a particular sheet. K18,
 * K20 and K21 are drawn on several, and each drawing is at a different height.
 */
function roomFloor(roomId, levelId) {
  const r = ROOMS.get(roomId);
  if (!r) return { feet: 0, level: levelId || null };
  const sheets = sheetsOf(roomId);
  const level = (levelId && (sheets.includes(levelId) || r.level === levelId))
    ? levelId : (r.level || sheets[0]);
  const feet = (typeof r.elevationFeet === 'number' && r.level === level)
    ? r.elevationFeet : levelElevation(level);
  return { feet, level };
}

/**
 * Where a way out takes you: the sheet at the far end, and for anything with a
 * rise, whether it goes up or down and by how much. The label wins when it says
 * so itself, since the book knows about stairs that double back.
 */
function whereTo(fromId, toId, label, onLevel) {
  const a = roomFloor(fromId, onLevel);
  // the far end is on this sheet if it is drawn here, otherwise on its own
  const b = roomFloor(toId, sheetsOf(toId).includes(onLevel) ? onLevel : null);
  const out = { sheet: b.level, sheetName: LEVELS.get(b.level)?.name || b.level,
                sameSheet: a.level === b.level, rise: b.feet - a.feet, dir: '' };
  // "up to K30 and down to K61" means different things for K30 and for K61, so
  // look for a direction word attached to this destination before anything else
  const txt = label || '';
  const esc_ = toId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const DIRW = '(?:up|above|ascend\\w*|down|below|descend\\w*)';
  // the nearest direction word before the room, with no other one in between
  const near = new RegExp('\\b(' + DIRW + ')\\b(?:(?!\\b' + DIRW + '\\b)[^.;]){0,24}?\\b' + esc_ + '\\b', 'i');
  const hit = near.exec(txt);
  const word = w => /^(up|above|ascend)/i.test(w) ? 'up' : /^(down|below|descend)/i.test(w) ? 'down' : '';
  const says = hit ? word(hit[1])
             : /\b(up|above|ascend)\b/i.test(txt) && /\b(down|below|descend)\b/i.test(txt) ? ''
             : /\b(up|above|ascend)\b/i.test(txt) ? 'up'
             : /\b(down|below|descend)\b/i.test(txt) ? 'down' : '';
  const measured = out.rise > 4 ? 'up' : out.rise < -4 ? 'down' : '';
  out.dir = says || measured;
  if (says && measured && says !== measured) out.rise = 0;   // the book knows better
  return out;
}

/**
 * Every way out of a room: one row per marker that touches both this room and
 * somewhere else, plus the vertical links its label names.
 */
function connectionsOf(roomId) {
  const rows = [];
  const seen = new Set();
  for (const [k, m] of Object.entries(ANN.marks)) {
    const sk = splitKey(k);
    if (sk.kind !== 'feat') continue;
    const meta = markMeta(k);
    // a statue that happens to straddle two rooms is not a way between them
    if (!PASSAGE_TYPES.has(meta.type) && !PASSAGE_WORDS.test(meta.label || '')) continue;
    const links = m.links || {};
    const touches = (links.rooms || []).includes(roomId) || meta.roomId === roomId;
    if (!touches) continue;
    const others = new Set([...(links.rooms || []), ...(links.to || [])]);
    others.delete(roomId);
    if (meta.roomId !== roomId) others.add(meta.roomId);   // the far room's own entry
    for (const other of others) {
      if (!ROOMS.has(other)) continue;
      const sig = other + '|' + howWord(meta);      // one row per way, not per marker
      if (seen.has(sig)) continue;
      seen.add(sig);
      rows.push({
        to: other, key: k, levelId: m.levelId,
        type: meta.type, label: meta.label,
        how: howWord(meta),
        height: heightOf(k, m),
        go: whereTo(roomId, other, meta.label, S.levelId),
      });
    }
  }
  // an edge marked open is a way through as much as a door is
  for (const [k, m] of Object.entries(ANN.marks)) {
    const sk = splitKey(k);
    if (sk.kind !== 'room' || sk.id !== roomId || m.shape.type !== 'area') continue;
    const g = grid(m.levelId).size;
    const index = roomIndex(m.levelId);
    for (const part of m.shape.parts) {
      const r = part.ring;
      for (let i = 0; i < r.length; i++) {
        if (part.edges[i] !== OPEN) continue;
        const a = r[i], b = r[(i + 1) % r.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1) continue;
        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        for (const d of [-0.35, 0.35]) {
          for (const other of roomsAtPoint([mx + nx * g * d, my + ny * g * d], index)) {
            if (other === roomId) continue;
            const sig = other + '|open';
            if (seen.has(sig)) continue;
            seen.add(sig);
            rows.push({ to: other, key: k, levelId: m.levelId, type: 'room',
                        label: 'The two areas run together here', how: 'open boundary',
                        height: heightOf(k, m), go: whereTo(roomId, other, '', S.levelId) });
          }
        }
      }
    }
  }

  // finally, what the book says even where nothing is marked yet
  for (const f of featuresOf(roomId)) {
    const meta = { type: f.type, label: f.label };
    if (!PASSAGE_TYPES.has(f.type) && !PASSAGE_WORDS.test(f.label || '')) continue;
    const placed = Object.keys(ANN.marks).some(k =>
      splitKey(k).kind === 'feat' && splitKey(k).id === f.id);
    for (const other of textTargets(f.label, roomId)) {
      const sig = other + '|' + howWord(meta);
      if (seen.has(sig)) continue;
      seen.add(sig);
      rows.push({ to: other, key: null, levelId: null, type: f.type, label: f.label,
                  how: howWord(meta), unmarked: !placed, height: null,
                  go: whereTo(roomId, other, f.label, S.levelId) });
    }
  }

  const order = { stairs: 0, door: 1, 'secret-door': 2, room: 3, window: 4 };
  rows.sort((a, b) => (a.unmarked ? 1 : 0) - (b.unmarked ? 1 : 0)
                   || (order[a.type] ?? 9) - (order[b.type] ?? 9)
                   || a.to.localeCompare(b.to, undefined, { numeric: true }));
  return rows;
}

const ROOM_RE = /\bK\d{1,2}[a-z]?\b/g;
const CRYPT_RE = /\bcrypt\s*(\d{1,2})\b/gi;

/** Room ids named in a piece of text. */
function textTargets(label, selfRoom) {
  const out = new Set();
  for (const m of (label || '').matchAll(ROOM_RE)) if (ROOMS.has(m[0])) out.add(m[0]);
  for (const m of (label || '').matchAll(CRYPT_RE)) {
    const id = 'Crypt ' + Number(m[1]);
    if (ROOMS.has(id)) out.add(id);
  }
  out.delete(selfRoom);
  return [...out];
}

const _idx = new Map();
function roomIndex(levelId) {
  if (!_idx.has(levelId)) {
    _idx.set(levelId, Object.entries(ANN.marks)
      .filter(([k, m]) => k.startsWith('room:') && m.levelId === levelId && m.shape.type === 'area')
      .map(([k, m]) => ({ id: splitKey(k).id, shape: m.shape, bb: bboxOf(m.shape) })));
  }
  return _idx.get(levelId);
}

function bboxOf(sh) {
  const pts = shapePoints(sh);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function roomsAtPoint(pt, index) {
  const out = [];
  for (const e of index) {
    if (pt[0] < e.bb.x0 || pt[0] > e.bb.x1 || pt[1] < e.bb.y0 || pt[1] > e.bb.y1) continue;
    if (insideArea(e.shape, pt)) out.push(e.id);
  }
  return out;
}

// ==================================================================
//  library
// ==================================================================
// which floors and which parent groups (K84's crypts, K74/K75's cells) are
// collapsed, remembered across visits
let COLLAPSED = { levels: new Set(), parents: new Set() };
try {
  const raw = JSON.parse(localStorage.getItem('cr.read.collapsed') || '{}');
  COLLAPSED = { levels: new Set(raw.levels || []), parents: new Set(raw.parents || []) };
} catch (_) {}
const saveCollapsed = () => localStorage.setItem('cr.read.collapsed', JSON.stringify(
  { levels: [...COLLAPSED.levels], parents: [...COLLAPSED.parents] }));

function roomRow(r, kidCount, closed) {
  const placed = sheetsOf(r.id).length > 0;
  return `<div class="roomRow${r.parent ? ' sub' : ''}${r.id === S.roomId ? ' sel' : ''}${
    placed ? '' : ' unplaced'}" data-room="${esc(r.id)}"${
    placed ? '' : ' title="not marked on any sheet yet"'}>${
    kidCount ? `<span class="disc" data-toggle="${esc(r.id)}">${closed ? '▸' : '▾'}</span>` : ''}
    <span class="rid">${esc(r.id)}</span>
    <span class="rname">${esc(r.name === r.id ? '' : r.name)}</span>${
    kidCount ? `<span class="kidCount">${kidCount}</span>` : ''}</div>`;
}

function renderLibrary() {
  const q = S.search.trim().toLowerCase();
  let html = '';
  for (const lv of DATA.levels) {
    const rooms = (lv.rooms || []).map(id => ROOMS.get(id)).filter(Boolean)
      .filter(r => !q || (r.id + ' ' + r.name + ' ' + (r.text || '')).toLowerCase().includes(q));
    if (!rooms.length) continue;
    const el = levelElevation(lv.id);
    const lvClosed = !q && COLLAPSED.levels.has(lv.id);
    html += `<div class="levelHead${lvClosed ? ' closed' : ''}" data-level="${esc(lv.id)}">
      <span class="disc">${lvClosed ? '▸' : '▾'}</span>
      <span class="lname">${esc(lv.name)}</span><em>${
      el === 0 ? 'ground' : (el > 0 ? '+' : '') + el + ' ft'}</em></div>`;
    if (lvClosed) continue;
    // while searching, show a flat matching list rather than nested groups
    for (const r of rooms) {
      if (r.parent && !q) continue;                    // drawn nested under its parent
      const kids = q ? [] : rooms.filter(x => x.parent === r.id);
      const pClosed = kids.length > 0 && COLLAPSED.parents.has(r.id);
      html += roomRow(r, kids.length, pClosed);
      if (kids.length && !pClosed) for (const k of kids) html += roomRow(k, 0, false);
    }
  }
  $('#library').innerHTML = html || '<div class="emptyNote">Nothing matches that search.</div>';
}

// ==================================================================
//  the room panel
// ==================================================================
function renderRoom() {
  const r = ROOMS.get(S.roomId);
  if (!r) {
    $('#roomHead').innerHTML = '';
    $('#roomBody').innerHTML = '<div class="emptyNote">Pick a room on the left.</div>';
    return;
  }
  const here = marksForRoom(r.id, S.levelId);
  const outline = here.find(([k]) => k.startsWith('room:'));
  const h = outline ? heightOf(outline[0], outline[1]) : null;
  const sheets = sheetsOf(r.id);
  const lv = LEVELS.get(S.levelId);

  const pills = [];
  pills.push(`<span class="pill">Floor <b>${esc(lv ? lv.name : S.levelId)}</b></span>`);
  if (h) {
    pills.push(`<span class="pill" title="${h.assumed
      ? 'this sheet&rsquo;s floor, no height set for the room itself'
      : 'set from the module text'}">Height <b>${esc(heightText(h))}</b>${
      h.assumed ? ' <em>(floor)</em>' : ''}</span>`);
  }
  if (r.parent) pills.push(`<span class="pill">Part of <b>${esc(r.parent)}</b></span>`);
  if (!outline) pills.push('<span class="pill">Not marked on this sheet</span>');

  const title = r.name === r.id ? '' : r.name;      // the crypts are named by number
  $('#roomHead').innerHTML = `<h1><b>${esc(r.id)}</b>${esc(title)}</h1>
    <div class="meta">${pills.join('')}</div>`;

  const conns = connectionsOf(r.id);
  const hereFeet = roomFloor(r.id, S.levelId).feet;
  const also = sheets.filter(x => x !== S.levelId)
    .map(x => {
      const feet = roomFloor(r.id, x).feet;
      const rise = feet - hereFeet;
      return { sheet: x, name: LEVELS.get(x)?.name || x, feet, rise,
               dir: rise > 4 ? 'up' : rise < -4 ? 'down' : '' };
    })
    .sort((a, b) => b.feet - a.feet);

  let html = '';
  html += `<div class="sect"><h2>The module</h2><div class="prose">${mdToHtml(r.text || '')}</div></div>`;

  if (also.length) {
    html += `<div class="sect"><h2>Also drawn on</h2>${also.map(a => {
      const arrow = a.dir === 'up' ? '↑' : a.dir === 'down' ? '↓' : '→';
      const rise = a.dir ? `${a.dir} ${Math.abs(a.rise)} ft` : 'same height';
      return `<button class="conn" data-sheet="${esc(a.sheet)}">
        <span class="ico" style="color:${TYPES.room.color}">${TYPES.room.ico}</span>
        <span class="where">
          <span class="to">${esc(a.name)}</span>
          <span class="trip${a.dir ? ' ' + a.dir : ''}">${esc(rise)}</span>
          <span class="how">floor at ${esc(ft(a.feet))}</span>
        </span>
        <span class="arrow">${arrow}</span></button>`;
    }).join('')}</div>`;
  }
  html += `<div class="sect"><h2>Ways in and out</h2>${
    conns.length ? conns.map(c => {
      const t = TYPES[c.type] || TYPES.note;
      const room = ROOMS.get(c.to);
      const g = c.go || {};
      const arrow = g.dir === 'up' ? '↑' : g.dir === 'down' ? '↓' : '→';
      const rise = g.dir && Math.abs(g.rise) >= 5 ? `${g.dir} ${Math.abs(g.rise)} ft` : g.dir;
      const trip = [rise, g.sameSheet ? '' : g.sheetName].filter(Boolean).join(' · ');
      return `<button class="conn${c.unmarked ? ' faint' : ''}" data-goroom="${esc(c.to)}"${
        c.key ? ` data-key="${esc(c.key)}"` : ''}>
        <span class="ico" style="color:${t.color}">${t.ico}</span>
        <span class="where">
          <span class="to">${esc(c.to)} <em>${esc(room && room.name !== c.to ? room.name : '')}</em>
            <span class="kind">${esc(c.how)}</span></span>
          ${trip ? `<span class="trip${g.dir ? ' ' + g.dir : ''}">${esc(trip)}</span>` : ''}
          <span class="how">${esc(c.label)}${
            c.unmarked ? ' <em class="um">(from the text, not marked on a map)</em>' : ''}</span>
        </span>
        <span class="arrow">${arrow}</span></button>`;
    }).join('') : '<div class="emptyNote" style="padding:2px">Nothing marked yet.</div>'}</div>`;

  $('#roomBody').innerHTML = html;
  $('#roomBody').scrollTop = 0;
  renderFloors();
  $('#crumb').textContent = r.name === r.id ? r.id : `${r.id} · ${r.name}`;
}

const IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** A picture printed with this room in the book, if the file is on disk. */
function figure(alt, src) {
  if (/player version/i.test(alt)) return '';         // a duplicate of the one above it
  const url = /^(https?:)?\//.test(src) ? src : '/maps/References/' + src.replace(/^\.?\//, '');
  const cap = inline(alt.replace(/\{@\w+ ([^|}]+)(\|[^}]*)?\}/g, '$1'));
  return `<figure class="fig">
    <a href="${esc(url)}" target="_blank" rel="noopener">
      <img src="${esc(url)}" alt="${esc(alt)}" loading="lazy"
           onload="this.closest('.fig').classList.add('ok')"
           onerror="this.closest('.fig').classList.add('missing')"></a>
    <figcaption>${cap || 'Illustration from the book'}</figcaption></figure>`;
}

function mdToHtml(md) {
  const out = [];
  let read = [];
  const flush = () => { if (read.length) { out.push('<blockquote>' + read.join(' ') + '</blockquote>'); read = []; } };
  for (const raw of md.split('\n')) {
    let line = raw.trim();
    if (!line) { flush(); continue; }
    if (IMG_RE.test(line)) {                          // a picture, alone or inline
      IMG_RE.lastIndex = 0;
      const figs = [];
      line = line.replace(IMG_RE, (_, alt, src) => { figs.push(figure(alt, src)); return ''; }).trim();
      flush();
      out.push(figs.join(''));
      if (!line) continue;
    }
    if (line.startsWith('!')) continue;
    if (line.startsWith('>>')) {
      const t = line.replace(/^>+/, '').trim();
      if (t) read.push(inline(t));
      continue;
    }
    flush();
    if (/^\*\*.+\*\*$/.test(line)) { out.push('<h4>' + inline(line.slice(2, -2)) + '</h4>'); continue; }
    if (/^[*\-] /.test(line)) { out.push('<ul><li>' + inline(line.slice(2)) + '</li></ul>'); continue; }
    out.push('<p>' + inline(line) + '</p>');
  }
  flush();
  return out.join('').replace(/<\/ul><ul>/g, '');
}

function inline(t) {
  t = t.replace(/\{@\w+ ([^|}]+)(\|[^}]*)?\}/g, '$1');
  t = esc(t);
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return t;
}

// ==================================================================
//  the castle, floor by floor
// ==================================================================
// Every sheet drawn as the silhouette of its rooms, projected isometrically
// and stacked at its own height. The sheets line up with one another through
// the rooms they share: K18, K20, K21 and the shafts are marked on several,
// so the offset between any two sheets is the difference between the same
// room's centre on each. The walls sheet shares no room with the keep, so it
// can't be lined up that way; it's instead rotated 90 degrees clockwise (it's
// drawn portrait in the book, turned relative to the other floor plans) and
// centred directly over the main floor, stacked in the vertical rather than
// offset sideways.

const ISO_COS = Math.cos(Math.PI / 6), ISO_SIN = Math.sin(Math.PI / 6);
let FRAMES = null;

/** Room outlines of a sheet, in grid squares. */
function ringsInSquares(levelId) {
  const g = grid(levelId);
  const out = [];
  for (const [k, m] of Object.entries(ANN.marks)) {
    if (!k.startsWith('room:') || m.levelId !== levelId || m.shape.type !== 'area') continue;
    for (const part of m.shape.parts) {
      out.push({ id: splitKey(k).id,
                 ring: part.ring.map(p => [(p[0] - g.offsetX) / g.size, (p[1] - g.offsetY) / g.size]) });
    }
  }
  // the walls-of-Ravenloft sheet is drawn portrait in the book, turned relative
  // to every other floor plan, so its outlines are rotated to match before
  // they're used for alignment or drawing
  if (levelId === 'walls') rotateRings90cw(out);
  return out;
}

/** Rotate a sheet's rings 90 degrees clockwise about their own centre, in place. */
function rotateRings90cw(rr) {
  if (!rr.length) return;
  const b = bboxOfRings(rr);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  for (const r of rr) {
    r.ring = r.ring.map(([u, v]) => {
      const du = u - cx, dv = v - cy;
      return [cx - dv, cy + du];
    });
  }
}

function bboxOfRings(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r.ring) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}

/** Where each sheet sits relative to the main floor, in grid squares. */
function sheetFrames() {
  if (FRAMES) return FRAMES;
  const rings = new Map();
  const centres = new Map();               // room -> level -> centre in squares
  for (const l of DATA.levels) {
    const r = ringsInSquares(l.id);
    rings.set(l.id, r);
    for (const { id, ring } of r) {
      const c = [ring.reduce((a, p) => a + p[0], 0) / ring.length,
                 ring.reduce((a, p) => a + p[1], 0) / ring.length];
      if (!centres.has(id)) centres.set(id, new Map());
      const by = centres.get(id);
      if (!by.has(l.id)) by.set(l.id, []);
      // one centre per part: the spires sheet draws K18 and K20 once per tower,
      // so a room can have several positions on the same sheet
      by.get(l.id).push(c);
    }
  }
  const frames = new Map([['main', { dx: 0, dy: 0 }]]);
  /** The cells a sheet's rooms cover, one per grid square, for overlap tests. */
  const cellsOf = (rr, dx, dy) => {
    const set = new Set();
    for (const r of rr) {
      const xs = r.ring.map(p => p[0]), ys = r.ring.map(p => p[1]);
      const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
      const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
      for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) {
        if (pointInRing([x + 0.5, y + 0.5], r.ring)) {
          set.add(Math.round(x + dx) + ',' + Math.round(y + dy));
        }
      }
    }
    return set;
  };

  /**
   * How to line sheet b up with sheet a. Each room drawn on both sheets offers
   * a shift, and a room drawn several times on one sheet (the spires sheet
   * draws K18 and K20 once per tower) offers one per copy, so the candidates
   * are clustered and the cluster whose silhouettes actually overlap best is
   * the one taken. Voting on room count alone cannot tell the tower insets
   * apart, since each inset holds the same three rooms.
   */
  const bestShift = (a, b) => {
    const cand = [];
    for (const [id, by] of centres) {
      if (!by.has(a) || !by.has(b)) continue;
      for (const ca of by.get(a)) for (const cb of by.get(b)) {
        cand.push({ d: [ca[0] - cb[0], ca[1] - cb[1]], id });
      }
    }
    if (!cand.length) return null;
    const clusters = [];
    for (const c of cand) {
      if (clusters.some(k => Math.hypot(k.d[0] - c.d[0], k.d[1] - c.d[1]) < 2.5)) continue;
      const near = cand.filter(o => Math.hypot(o.d[0] - c.d[0], o.d[1] - c.d[1]) < 2.5);
      const med = i => {
        const v = near.map(o => o.d[i]).sort((x, y) => x - y);
        return v[(v.length - 1) >> 1];
      };
      clusters.push({ d: [med(0), med(1)], rooms: new Set(near.map(o => o.id)).size });
    }
    if (clusters.length === 1) return clusters[0];
    const av = cellsOf(rings.get(a) || [], 0, 0);
    let best = null;
    for (const k of clusters) {
      const bv = cellsOf(rings.get(b) || [], k.d[0], k.d[1]);
      let hit = 0;
      for (const key of bv) if (av.has(key)) hit++;
      const score = hit / Math.max(1, Math.min(av.size, bv.size));
      if (!best || score > best.score) best = Object.assign({ score }, k);
    }
    return best;
  };

  for (;;) {
    let pick = null;
    for (const l of DATA.levels) {
      if (frames.has(l.id)) continue;
      for (const from of frames.keys()) {
        const sh = bestShift(from, l.id);
        if (sh && (!pick || sh.rooms > pick.sh.rooms)) pick = { id: l.id, from, sh };
      }
    }
    if (!pick) break;
    const base = frames.get(pick.from);
    frames.set(pick.id, { dx: base.dx + pick.sh.d[0], dy: base.dy + pick.sh.d[1] });
  }

  // the walls sheet: no shared room with the keep, so line the two up by
  // centring one over the other, and stack them there rather than offset
  for (const l of DATA.levels) {
    if (frames.has(l.id) || l.id !== 'walls') continue;
    const w = rings.get(l.id), keep = rings.get('main');
    if (w.length && keep.length) {
      const wb = bboxOfRings(w), k = bboxOfRings(keep);
      frames.set(l.id, { dx: (k.x0 + k.x1) / 2 - (wb.x0 + wb.x1) / 2,
                          dy: (k.y0 + k.y1) / 2 - (wb.y0 + wb.y1) / 2 });
    } else {
      frames.set(l.id, { dx: 0, dy: 0 });
    }
  }

  // the grounds: put the keep's front wall on the front courtyard's north edge
  for (const l of DATA.levels) {
    if (frames.has(l.id)) continue;
    const yard = rings.get(l.id).filter(r => r.id === 'K1');
    const keep = rings.get('main');
    if (yard.length && keep.length) {
      const y = bboxOfRings(yard), k = bboxOfRings(keep);
      frames.set(l.id, { dx: (k.x0 + k.x1) / 2 - (y.x0 + y.x1) / 2, dy: k.y1 - y.y0 });
    } else {
      frames.set(l.id, { dx: 0, dy: 0 });
    }
  }
  FRAMES = { frames, rings };
  return FRAMES;
}

/** Rings that sit near one another, as separate drawings on the same sheet. */
function clusterRings(rr, gap) {
  const bb = rr.map(r => {
    const xs = r.ring.map(p => p[0]), ys = r.ring.map(p => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const parent = rr.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const near = (a, b) =>
    a.x0 - b.x1 < gap && b.x0 - a.x1 < gap && a.y0 - b.y1 < gap && b.y0 - a.y1 < gap;
  for (let i = 0; i < rr.length; i++) {
    for (let j = i + 1; j < rr.length; j++) {
      if (near(bb[i], bb[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  rr.forEach((r, i) => {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  return [...groups.values()];
}

const ringCentre = ring => [
  ring.reduce((a, p) => a + p[0], 0) / ring.length,
  ring.reduce((a, p) => a + p[1], 0) / ring.length,
];
const median = v => { const a = [...v].sort((x, y) => x - y); return a[(a.length - 1) >> 1]; };

/**
 * The slabs the stack is drawn from. A sheet is one slab, unless it prints
 * several drawings: the spires sheet carries the roof and four tower insets,
 * each at its own height. An inset is moved over the tower it belongs to by
 * landing a room it shares with the main floor (the shafts, the heart tower)
 * on that room's position there, so the towers stack up the castle rather
 * than lying beside it where the book prints them.
 */
function floorSlabs() {
  const { frames, rings } = sheetFrames();
  // where each room sits once every sheet is in the main floor's frame; the
  // main floor wins where a room is drawn on several sheets
  const ref = new Map();
  for (const id of ['main', ...DATA.levels.map(l => l.id)]) {
    const fr = frames.get(id) || { dx: 0, dy: 0 };
    for (const r of rings.get(id) || []) {
      if (ref.has(r.id)) continue;
      const c = ringCentre(r.ring);
      ref.set(r.id, { p: [c[0] + fr.dx, c[1] + fr.dy], from: id });
    }
  }

  const slabs = [];
  for (const l of DATA.levels) {
    const rr = rings.get(l.id) || [];
    if (!rr.length) continue;
    const sheetFrame = frames.get(l.id) || { dx: 0, dy: 0 };
    const clusters = clusterRings(rr, 2).sort((a, b) => b.length - a.length);
    clusters.forEach((cl, ci) => {
      const overs = cl.map(r => ROOMS.get(r.id))
        .filter(x => x && typeof x.elevationFeet === 'number' && x.level === l.id)
        .map(x => x.elevationFeet);
      const clusterFeet = overs.length ? median(overs) : levelElevation(l.id);

      let frame = sheetFrame;
      if (ci > 0) {                                  // an inset, not the main drawing
        // only rooms placed by another sheet can say where this drawing goes
        const anchors = cl.filter(r => ref.has(r.id) && ref.get(r.id).from !== l.id);
        if (anchors.length) {
          // the same room drawn in both places: line them up exactly
          const shifts = anchors.map(r => {
            const c = ringCentre(r.ring), t = ref.get(r.id).p;
            return [t[0] - c[0], t[1] - c[1]];
          });
          frame = { dx: median(shifts.map(s => s[0])), dy: median(shifts.map(s => s[1])) };
        } else {
          // a tower peak with nothing in common with the floors below: put it
          // over whatever it connects to, which is the tower it caps
          const ids = new Set(cl.map(r => r.id));
          let target = null;
          for (const [k, m] of Object.entries(ANN.marks)) {
            const sk = splitKey(k);
            if (sk.kind !== 'feat') continue;
            const owner = sk.id.split('::')[0];
            const links = m.links || {};
            const touches = ids.has(owner) || (links.rooms || []).some(x => ids.has(x));
            if (!touches) continue;
            const out = [...(links.rooms || []), ...(links.to || []), owner]
              .find(x => ref.has(x) && !ids.has(x) && ref.get(x).from !== l.id);
            if (out) { target = out; break; }
          }
          if (target) {
            const cs = cl.map(r => ringCentre(r.ring));
            const c = [median(cs.map(p => p[0])), median(cs.map(p => p[1]))];
            const t = ref.get(target).p;
            frame = { dx: t[0] - c[0], dy: t[1] - c[1] };
          }
        }
      }
      // one slab per height inside the drawing, so a tower's rooms stack
      const byFeet = new Map();
      for (const r of cl) {
        const room = ROOMS.get(r.id);
        const feet = (room && typeof room.elevationFeet === 'number' && room.level === l.id)
          ? room.elevationFeet : clusterFeet;
        if (!byFeet.has(feet)) byFeet.set(feet, []);
        byFeet.get(feet).push(r);
      }
      for (const [feet, group] of byFeet) {
        const ids = [...new Set(group.map(g => g.id))];
        const base = ci === 0 && feet === levelElevation(l.id);
        // name an inset after the rooms the book measures at that height, since
        // the shafts and the stair are drawn in every one of them
        const named = ids.filter(x => {
          const room = ROOMS.get(x);
          return room && room.elevationFeet === feet && room.level === l.id;
        });
        const pick = named.length ? named : ids;
        slabs.push({
          id: l.id, feet, frame, rings: group,
          name: base ? l.name : (pick.length <= 3 ? pick.join(', ') : l.name + ' tower'),
        });
      }
    });
  }
  return slabs.sort((a, b) => a.feet - b.feet);
}

let floorResizeObserver = null;

function renderFloors() {
  const box = $('#floors');
  if (!box || $('#layout').classList.contains('noFloors')) return;

  // Enforce flex container styling so #floors tracks parent pane resizes accurately
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.height = '100%';
  box.style.overflow = 'hidden';

  // Attach a single ResizeObserver to dynamically catch UI splitter drags
  if (!floorResizeObserver && typeof ResizeObserver !== 'undefined') {
    floorResizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(renderFloors);
    });
    floorResizeObserver.observe(box);
  }

  const { frames, rings } = sheetFrames();
  const levels = floorSlabs();
  
  if (!levels.length) {
    box.innerHTML = '<div class="flNote">Nothing marked yet.</div>';
    return;
  }

  const K = 4.2;                                   // pixels per grid square
  const THICK = 5;                                 // how deep a slab looks
  const BASE_GAP = 12;                             // base clear air between two slabs

  const isMainOrWalls = id => id === 'main' || id === 'walls';
  const P0 = (u, v) => [(u - v) * ISO_COS * K, (u + v) * ISO_SIN * K];

  let x0 = Infinity, x1 = -Infinity;
  const slabs = levels.map(l => {
    let d = '', roomD = '';
    let lo = Infinity, hi = -Infinity, anchor = null;
    for (const r of l.rings) {
      let sub = '';
      for (let i = 0; i < r.ring.length; i++) {
        const p = P0(r.ring[i][0] + l.frame.dx, r.ring[i][1] + l.frame.dy);
        if (p[0] < x0) x0 = p[0];
        if (p[0] > x1) x1 = p[0];
        if (p[1] < lo) lo = p[1];
        if (p[1] > hi) hi = p[1];
        sub += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
        if (!anchor || p[0] < anchor[0] || (p[0] === anchor[0] && p[1] < anchor[1])) anchor = p;
      }
      sub += 'Z';
      d += sub;
      if (r.id === S.roomId) roomD += sub;
    }
    return { l, d, roomD, anchor, lo, hi: hi + THICK };
  });

  slabs.sort((a, b) => a.l.feet - b.l.feet);

  const basePadL = 72, padR = 14, padT = 16, padB = 16;
  const slabW = x1 - x0;

  // Pass 1: compute natural height using BASE_GAP with main/walls exemption
  const offsBase = new Array(slabs.length).fill(0);
  const exemptFlags = new Array(slabs.length).fill(false);
  let adjustableGapsCount = 0;

  for (let i = 1; i < slabs.length; i++) {
    const prev = slabs[i - 1];
    const curr = slabs[i];
    const exempt = isMainOrWalls(prev.l.id) && isMainOrWalls(curr.l.id);
    exemptFlags[i] = exempt;
    if (!exempt) adjustableGapsCount++;
    const need = exempt ? 0 : (prev.lo - curr.hi - BASE_GAP);
    offsBase[i] = offsBase[i - 1] + need;
  }

  const naturalTop = offsBase[slabs.length - 1] + slabs[slabs.length - 1].lo;
  const naturalBot = offsBase[0] + slabs[0].hi;
  const slabNaturalH = naturalBot - naturalTop;

  // Measure DOM container to determine limiting dimension
  const existingNote = box.querySelector('.flNote');
  const actualNoteH = existingNote ? existingNote.getBoundingClientRect().height : 32;
  const panelW = Math.max(1, box.clientWidth);
  const panelH = Math.max(200, box.clientHeight - actualNoteH - 12);

  const minW = slabW + basePadL + padR;
  const minH = slabNaturalH + padT + padB;

  // Find the exact SVG dimensions needed to perfectly match the DOM container's aspect ratio
  const scale = Math.min(panelW / minW, panelH / minH);
  const targetW = panelW / scale;
  const targetH = panelH / scale;

  // Allocate extra space: extra width goes to left padding, extra height to vertical gaps
  const extraW = Math.max(0, targetW - minW);
  const extraH = Math.max(0, targetH - minH);

  const padL = basePadL + extraW;
  const extraPerGap = adjustableGapsCount > 0 ? extraH / adjustableGapsCount : 0;
  const finalGap = BASE_GAP + extraPerGap;

  // Pass 2: compute final offsets with expanded gaps
  const offs = new Array(slabs.length).fill(0);
  for (let i = 1; i < slabs.length; i++) {
    const prev = slabs[i - 1];
    const curr = slabs[i];
    const exempt = exemptFlags[i];
    const need = exempt ? 0 : (prev.lo - curr.hi - finalGap);
    offs[i] = offs[i - 1] + need;
  }

  const yTop = offs[slabs.length - 1] + slabs[slabs.length - 1].lo;
  
  const W = targetW;
  const H = targetH;
  const X = x => x - x0 + padL, Y = y => y - yTop + padT;
  const axisX = 52;

  let svg = `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" role="img"
    style="width:100%; height:100%; display:block; flex:1 1 auto; min-height:0;"
    aria-label="The floors of Castle Ravenloft stacked">`;
  
  svg += `<line class="flAxis" x1="${axisX}" y1="${(padT - 8).toFixed(1)}"
            x2="${axisX}" y2="${(H - padB + 8).toFixed(1)}"/>`;

  slabs.forEach((sl, i) => {
    const yAt = Y(offs[i] + (sl.lo + sl.hi) / 2);
    const ground = sl.l.feet === 0;

    if (sl.anchor) {
      svg += `<line class="flLead" x1="${axisX + 6}" y1="${yAt.toFixed(1)}"
                x2="${(X(sl.anchor[0]) - 5).toFixed(1)}"
                y2="${Y(sl.anchor[1] + offs[i]).toFixed(1)}"/>`;
    }

    svg += `<line class="flTick${ground ? ' ground' : ''}" x1="${axisX - 5}" y1="${yAt.toFixed(1)}"
              x2="${axisX + 5}" y2="${yAt.toFixed(1)}"/>`;

    svg += `<text class="flLabel${ground ? ' ground' : ''}" x="${axisX - 9}"
              y="${(yAt + 3.2).toFixed(1)}" text-anchor="end">${
              sl.l.feet > 0 ? '+' : ''}${sl.l.feet} ft</text>`;
  });

  svg += `<g transform="translate(${(padL - x0).toFixed(1)} ${(padT - yTop).toFixed(1)})">`;
  slabs.forEach((sl, i) => {
    const here = sl.l.id === S.levelId;
    svg += `<g class="flFloor${here ? ' on' : ''}" data-sheet="${esc(sl.l.id)}"
              transform="translate(0 ${offs[i].toFixed(1)})">
      <title>${esc(sl.l.name)} &mdash; ${sl.l.feet > 0 ? '+' : ''}${sl.l.feet} ft</title>
      <path class="side" d="${sl.d}" transform="translate(0 ${THICK})"/>
      <path class="body" d="${sl.d}"/>
      ${sl.roomD ? `<path class="flRoom" d="${sl.roomD}"/>` : ''}
    </g>`;
  });
  svg += '</g>';

  let lastY = -99;
  for (const sl of [...slabs].reverse()) {
    const i = slabs.indexOf(sl);
    const yAt = Y(offs[i] + (sl.lo + sl.hi) / 2);
    let y = yAt;
    if (y - lastY < 14) y = lastY + 14;
    lastY = y;

    svg += `<text class="flName${sl.l.id === S.levelId ? ' on' : ''}"
      x="${axisX + 8}" y="${(y + 3.2).toFixed(1)}"
      data-sheet="${esc(sl.l.id)}">${esc(sl.l.name)}</text>`;
  }

  svg += `</svg>`;

  const r = ROOMS.get(S.roomId);
  box.innerHTML = svg + `<div class="flNote" style="flex:0 0 auto;">${
    r ? `<b style="color:var(--accent2)">${esc(S.roomId)}</b> is picked out in gold on its floor. ` : ''
    }Click a floor to go there. Heights are feet above the main floor.</div>`;
}

// ==================================================================
//  navigation
// ==================================================================
async function setLevel(levelId, keepView) {
  if (!LEVELS.get(levelId)) return;
  S.levelId = levelId;
  const lv = LEVELS.get(levelId);
  img = await loadImage(mapUrl(lv, S.playerMap));
  if (!keepView) fitAll(0);
  needsDraw = true;
  renderFloors();
}

const mapUrl = (lv, player) =>
  '/maps/' + (player && lv.playerMap ? lv.playerMap : lv.dmMap).replace(/^\/+/, '');

const imgCache = new Map();
function loadImage(url) {
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise(res => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = url;
  });
  imgCache.set(url, p);
  return p;
}

async function selectRoom(id, fromLevel, opts) {
  const r = ROOMS.get(id);
  if (!r) return;
  S.roomId = id;
  localStorage.setItem('cr.read.room', id);
  const sheets = sheetsOf(id);
  const go = fromLevel && sheets.includes(fromLevel) ? fromLevel
           : (sheets.includes(S.levelId) ? S.levelId : (sheets[0] || r.level));
  const sameSheet = go === S.levelId;
  if (!sameSheet) await setLevel(go, true);
  if (COLLAPSED.levels.delete(go) | (r.parent && COLLAPSED.parents.delete(r.parent))) saveCollapsed();
  renderLibrary(); renderRoom();
  fitRoom(sameSheet ? 520 : 0);
  history.replaceState(null, '', '?room=' + encodeURIComponent(id));
  if (!opts || opts.record !== false) recordVisit(id, go);
  updateNavButtons();
}

// ---- back/forward through the rooms visited, like browser history ----
const VISITS = [];
let VISIT_I = -1;
function recordVisit(id, level) {
  if (VISIT_I >= 0 && VISITS[VISIT_I].id === id) { VISITS[VISIT_I].level = level; return; }
  VISITS.length = VISIT_I + 1;              // a fresh move drops any forward branch
  VISITS.push({ id, level });
  VISIT_I = VISITS.length - 1;
}
function updateNavButtons() {
  const b = $('#navBack'), f = $('#navForward');
  if (b) b.disabled = VISIT_I <= 0;
  if (f) f.disabled = VISIT_I >= VISITS.length - 1;
}
function goBack() {
  if (VISIT_I <= 0) return;
  const v = VISITS[--VISIT_I];
  selectRoom(v.id, v.level, { record: false });
}
function goForward() {
  if (VISIT_I >= VISITS.length - 1) return;
  const v = VISITS[++VISIT_I];
  selectRoom(v.id, v.level, { record: false });
}

// ==================================================================
//  view
// ==================================================================
const cw = () => canvas.clientWidth, chh = () => canvas.clientHeight;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw() * dpr);
  canvas.height = Math.round(chh() * dpr);
  needsDraw = true;
}
window.addEventListener('resize', resize);

const toScreen = (x, y) => ({ x: x * S.view.scale + S.view.tx, y: y * S.view.scale + S.view.ty });
const toWorld = (x, y) => ({ x: (x - S.view.tx) / S.view.scale, y: (y - S.view.ty) / S.view.scale });

function fitAll(ms) {
  const lv = LEVELS.get(S.levelId);
  if (!lv) return;
  const s = Math.min(cw() / lv.width, chh() / lv.height) * 0.96;
  glideTo(s, (cw() - lv.width * s) / 2, (chh() - lv.height * s) / 2, ms);
}

/** Ease the camera to a new scale and offset instead of jumping. */
let camAnim = null;
function glideTo(scale, tx, ty, ms = 480) {
  const from = { scale: S.view.scale, tx: S.view.tx, ty: S.view.ty };
  if (!ms || Math.abs(from.scale - scale) < 1e-4
      && Math.abs(from.tx - tx) < 1 && Math.abs(from.ty - ty) < 1) {
    S.view.scale = scale; S.view.tx = tx; S.view.ty = ty; needsDraw = true;
    return;
  }
  const t0 = performance.now();
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const id = {};
  camAnim = id;
  const step = now => {
    if (camAnim !== id) return;                       // something else took the wheel
    const t = Math.min(1, (now - t0) / ms);
    const e = ease(t);
    S.view.scale = from.scale + (scale - from.scale) * e;
    S.view.tx = from.tx + (tx - from.tx) * e;
    S.view.ty = from.ty + (ty - from.ty) * e;
    needsDraw = true;
    if (t < 1) requestAnimationFrame(step); else camAnim = null;
  };
  requestAnimationFrame(step);
}
const stopGlide = () => { camAnim = null; };

function fitRoom(ms) {
  const here = marksForRoom(S.roomId, S.levelId);
  const pts = [].concat(...here.map(([, m]) => shapePoints(m.shape)));
  if (!pts.length) { fitAll(); return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = grid().size * 1.6;
  const s = Math.min(cw() / (x1 - x0 + pad * 2), chh() / (y1 - y0 + pad * 2), 1.4);
  glideTo(s, cw() / 2 - ((x0 + x1) / 2) * s, chh() / 2 - ((y0 + y1) / 2) * s, ms);
}

function zoomBy(f, cx, cy) {
  stopGlide();
  cx = cx ?? cw() / 2; cy = cy ?? chh() / 2;
  const before = toWorld(cx, cy);
  S.view.scale = Math.max(0.03, Math.min(6, S.view.scale * f));
  const after = toWorld(cx, cy);
  S.view.tx += (after.x - before.x) * S.view.scale;
  S.view.ty += (after.y - before.y) * S.view.scale;
  needsDraw = true;
}

// ==================================================================
//  shapes
// ==================================================================
function shapePoints(sh) {
  if (!sh) return [];
  if (sh.type === 'area') return [].concat(...sh.parts.map(p => p.ring.map(q => [q[0], q[1]])));
  if (sh.type === 'rect') return [[sh.x, sh.y], [sh.x + sh.w, sh.y], [sh.x + sh.w, sh.y + sh.h], [sh.x, sh.y + sh.h]];
  if (sh.type === 'poly') return sh.pts.map(p => [p[0], p[1]]);
  if (sh.type === 'seg') return [[sh.x1, sh.y1], [sh.x2, sh.y2]];
  if (sh.type === 'point') return [[sh.x, sh.y]];
  return [];
}

function centroid(pts) {
  if (!pts.length) return [0, 0];
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideArea(sh, pt) {
  let inside = false;
  for (const part of sh.parts) if (pointInRing(pt, part.ring)) inside = (part.op === 'add');
  return inside;
}

function distToSeg(p, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return Math.hypot(p.x - x1, p.y - y1);
  let t = ((p.x - x1) * dx + (p.y - y1) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (x1 + dx * t), p.y - (y1 + dy * t));
}

function hitShape(sh, p, tol) {
  if (!sh) return false;
  if (sh.type === 'area') {
    if (sh.parts.some(part => part.ring.some((a, i) => {
      const b = part.ring[(i + 1) % part.ring.length];
      return distToSeg(p, a[0], a[1], b[0], b[1]) <= tol;
    }))) return true;
    return insideArea(sh, [p.x, p.y]);
  }
  if (sh.type === 'point') return Math.hypot(p.x - sh.x, p.y - sh.y) <= 13 / S.view.scale + tol;
  if (sh.type === 'seg') return distToSeg(p, sh.x1, sh.y1, sh.x2, sh.y2) <= 9 / S.view.scale + tol;
  if (sh.type === 'rect') return p.x >= sh.x - tol && p.x <= sh.x + sh.w + tol
                            && p.y >= sh.y - tol && p.y <= sh.y + sh.h + tol;
  if (sh.type === 'poly') return pointInRing([p.x, p.y], sh.pts);
  return false;
}

// ==================================================================
//  drawing
// ==================================================================
function loop() { if (needsDraw) { draw(); needsDraw = false; } requestAnimationFrame(loop); }

function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw(), chh());
  ctx.fillStyle = '#0c0b10';
  ctx.fillRect(0, 0, cw(), chh());
  if (!S.levelId) return;

  ctx.save();
  ctx.translate(S.view.tx, S.view.ty);
  ctx.scale(S.view.scale, S.view.scale);
  const lv = LEVELS.get(S.levelId);
  if (img) ctx.drawImage(img, 0, 0, lv.width, lv.height);

  // everything outside the room goes under a dark wash, and the room itself is
  // painted back in on top of it
  const outline = marksForRoom(S.roomId, S.levelId).find(([k]) => k.startsWith('room:'));
  if (outline && img) {
    ctx.fillStyle = 'rgba(8,7,12,.72)';
    ctx.fillRect(0, 0, lv.width, lv.height);
    ctx.save();
    ctx.beginPath();
    for (const part of outline[1].shape.parts) {
      part.ring.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
    }
    ctx.clip('evenodd');
    ctx.drawImage(img, 0, 0, lv.width, lv.height);
    ctx.restore();
  }
  if (S.showGrid) drawGrid(lv);

  const here = new Set(marksForRoom(S.roomId, S.levelId).map(([k]) => k));

  // everything else on this sheet, quietly
  for (const [k, m] of marksOnLevel()) {
    if (here.has(k)) continue;
    drawMark(k, m, 'quiet');
  }
  // the room, with its own markers on top
  for (const [k, m] of marksOnLevel()) {
    if (!here.has(k) || !k.startsWith('room:')) continue;
    drawMark(k, m, 'room');
  }
  for (const [k, m] of marksOnLevel()) {
    if (!here.has(k) || k.startsWith('room:')) continue;
    drawMark(k, m, 'feature');
  }
  if (S.hover && ANN.marks[S.hover]) drawMark(S.hover, ANN.marks[S.hover], 'hover');
  ctx.restore();
}

function drawGrid(lv) {
  const g = grid();
  ctx.save();
  ctx.lineWidth = 1 / S.view.scale;
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.beginPath();
  for (let x = g.offsetX % g.size; x < lv.width; x += g.size) { ctx.moveTo(x, 0); ctx.lineTo(x, lv.height); }
  for (let y = g.offsetY % g.size; y < lv.height; y += g.size) { ctx.moveTo(0, y); ctx.lineTo(lv.width, y); }
  ctx.stroke();
  ctx.restore();
}

function drawMark(key, m, mode) {
  const meta = markMeta(key);
  const t = TYPES[meta.type] || TYPES.note;
  const sc = S.view.scale;
  const sh = m.shape;
  if (!sh) return;
  const quiet = mode === 'quiet';
  const hot = mode === 'hover';
  ctx.globalAlpha = quiet ? 0.3 : 1;
  const color = hot ? '#ffffff' : t.color;

  if (sh.type === 'area') {
    if (meta.type !== 'room') {
      ctx.beginPath();
      for (const part of sh.parts) {
        part.ring.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath();
      }
      ctx.fillStyle = color + (hot ? '55' : '33');
      ctx.fill('evenodd');
    } else if (!quiet) {
      ctx.beginPath();
      for (const part of sh.parts) {
        part.ring.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath();
      }
      ctx.fillStyle = t.color + '1c';
      ctx.fill('evenodd');
    }
    for (const part of sh.parts) {
      const r = part.ring;
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const open = part.edges[i] === OPEN;
        ctx.setLineDash(open ? [9 / sc, 7 / sc] : []);
        ctx.lineWidth = (open ? 1.8 : (quiet ? 2 : 3.4)) / sc;
        ctx.strokeStyle = open ? color + '88' : color;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  } else if (sh.type === 'seg') {
    ctx.lineCap = 'round';
    ctx.lineWidth = (hot ? 12 : 9) / sc;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(sh.x1, sh.y1); ctx.lineTo(sh.x2, sh.y2); ctx.stroke();
    ctx.lineCap = 'butt';
  } else if (sh.type === 'point') {
    const r = (hot ? 14 : 11) / sc;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, r, 0, 7);
    ctx.fillStyle = color + 'dd'; ctx.fill();
    ctx.lineWidth = 2.5 / sc; ctx.strokeStyle = '#15121c'; ctx.stroke();
  } else if (sh.type === 'rect' || sh.type === 'poly') {
    const pts = shapePoints(sh);
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath();
    ctx.fillStyle = color + '33'; ctx.fill();
    ctx.lineWidth = 2.5 / sc; ctx.strokeStyle = color; ctx.stroke();
  }

  // a badge on each marker, so the map reads as a set of things to hover
  if (!quiet && meta.type !== 'room' && meta.type !== 'wall') {
    const c = centroid(shapePoints(sh));
    const r = (hot ? 13 : 10) / sc;
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7);
    ctx.fillStyle = hot ? '#ffffff' : '#15121cdd';
    ctx.fill();
    ctx.lineWidth = 2 / sc; ctx.strokeStyle = t.color; ctx.stroke();
    ctx.fillStyle = hot ? '#15121c' : t.color;
    ctx.font = (13 / sc) + 'px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.ico, c[0], c[1] + 0.5 / sc);
  }

  if (meta.type === 'room' && !quiet) {
    const c = centroid(shapePoints(sh));
    const px = 17 / sc;
    ctx.font = '700 ' + px + 'px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4 / sc; ctx.strokeStyle = 'rgba(10,9,14,.92)';
    ctx.strokeText(splitKey(key).id, c[0], c[1]);
    ctx.fillStyle = '#fff';
    ctx.fillText(splitKey(key).id, c[0], c[1]);
  }
  ctx.globalAlpha = 1;
}

// ==================================================================
//  hovering and clicking the map
// ==================================================================
function markAt(wp) {
  const tol = 6 / S.view.scale;
  const here = marksForRoom(S.roomId, S.levelId);
  const pool = here.concat(marksOnLevel().filter(([k]) => !here.some(([j]) => j === k)));
  // small things first, rooms last, and the selected room's own markers ahead
  const score = ([k]) => (k.startsWith('room:') ? 2 : 0) + (here.some(([j]) => j === k) ? 0 : 1);
  pool.sort((a, b) => score(a) - score(b));
  for (const [k, m] of pool) if (hitShape(m.shape, wp, tol)) return k;
  return null;
}

function tipFor(key) {
  const m = ANN.marks[key];
  const meta = markMeta(key);
  const t = TYPES[meta.type] || TYPES.note;
  const h = heightOf(key, m);
  const links = m.links || {};
  const dest = destinationOf(key);
  const goes = dest ? [...new Set([...(links.rooms || []), ...(links.to || [])])]
    .filter(x => x !== meta.roomId && ROOMS.has(x)) : [];
  const room = ROOMS.get(meta.roomId);
  const inst = splitKey(key).inst;
  const count = Object.keys(ANN.marks).filter(k =>
    splitKey(k).kind === 'feat' && splitKey(k).id === splitKey(key).id
    && ANN.marks[k].levelId === m.levelId).length;
  return `<div class="t"><span class="ico" style="color:${t.color}">${t.ico}</span>${esc(meta.label)}</div>
    <div class="k">${esc(t.label)}${count > 1 ? ` · ${inst} of ${count} here` : ''} ·
      ${esc(meta.roomId)}${room ? ' ' + esc(room.name) : ''}</div>
    ${meta.note ? `<div class="n">${esc(meta.note)}</div>` : ''}
    <div class="f">${esc(heightText(h))}${h.assumed ? ' (floor of this sheet)' : ''}</div>
    ${goes.length ? `<div class="go">Goes to ${esc(goes.join(', '))} &mdash; click to follow</div>` : ''}`;
}

function showTip(key, sx, sy) {
  const tip = $('#tip');
  tip.innerHTML = tipFor(key);
  tip.hidden = false;
  const pad = 14;
  const r = tip.getBoundingClientRect();
  const box = $('#mapPane').getBoundingClientRect();
  let x = sx + pad, y = sy + pad;
  if (x + r.width > box.width - 8) x = sx - r.width - pad;
  if (y + r.height > box.height - 8) y = sy - r.height - pad;
  tip.style.left = Math.max(6, x) + 'px';
  tip.style.top = Math.max(6, y) + 'px';
}

/**
 * Where clicking this mark should take you, if anywhere. A room takes you to
 * itself, and only when it is not the room you are already reading: clicking
 * about inside the room you are on should never move you somewhere else. A
 * door or a stair takes you through.
 */
function destinationOf(key) {
  const m = ANN.marks[key];
  if (!m) return null;
  const sk = splitKey(key);
  const meta = markMeta(key);
  if (sk.kind === 'room') return sk.id === S.roomId ? null : sk.id;
  if (sk.kind === 'iwall') return null;
  if (!PASSAGE_TYPES.has(meta.type) && !PASSAGE_WORDS.test(meta.label || '')) {
    return meta.roomId !== S.roomId ? meta.roomId : null;   // a thing in another room
  }
  const links = m.links || {};
  const others = [...new Set([...(links.rooms || []), ...(links.to || [])])]
    .filter(x => ROOMS.has(x) && x !== S.roomId);
  if (meta.roomId !== S.roomId && ROOMS.has(meta.roomId)) others.unshift(meta.roomId);
  return others[0] || null;
}

// ==================================================================
//  wiring
// ==================================================================
function wire() {
  $('#search').oninput = e => { S.search = e.target.value; renderLibrary(); };
  $('#navBack').onclick = goBack;
  $('#navForward').onclick = goForward;

  $('#library').onclick = e => {
    const lvHead = e.target.closest('[data-level]');
    if (lvHead) {
      const id = lvHead.dataset.level;
      COLLAPSED.levels.has(id) ? COLLAPSED.levels.delete(id) : COLLAPSED.levels.add(id);
      saveCollapsed(); renderLibrary();
      return;
    }
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      COLLAPSED.parents.has(id) ? COLLAPSED.parents.delete(id) : COLLAPSED.parents.add(id);
      saveCollapsed(); renderLibrary();
      return;
    }
    const row = e.target.closest('[data-room]');
    if (row) selectRoom(row.dataset.room);
  };

  $('#roomHead').onclick = e => {
    const s = e.target.closest('[data-sheet]');
    if (s) setLevel(s.dataset.sheet, true).then(() => { renderRoom(); fitRoom(0); });
  };

  $('#roomBody').onclick = e => {
    const c = e.target.closest('[data-goroom]');
    if (c) { selectRoom(c.dataset.goroom, ANN.marks[c.dataset.key]?.levelId); return; }
    const sheet = e.target.closest('[data-sheet]');
    if (sheet) {
      setLevel(sheet.dataset.sheet, true).then(() => { renderRoom(); fitRoom(0); });
    }
  };
  $('#roomBody').onmouseover = e => {
    const row = e.target.closest('[data-key]');
    if (row && ANN.marks[row.dataset.key]) { S.hover = row.dataset.key; needsDraw = true; }
  };
  $('#roomBody').onmouseout = e => {
    if (e.target.closest('[data-key]')) { S.hover = null; needsDraw = true; }
  };

  $('#playerMap').onchange = e => {
    S.playerMap = e.target.checked;
    setLevel(S.levelId, true);
  };
  $('#showGrid').onchange = e => { S.showGrid = e.target.checked; needsDraw = true; };

  $('#zoomIn').onclick = () => zoomBy(1.25);
  $('#zoomOut').onclick = () => zoomBy(1 / 1.25);
  $('#zoomFit').onclick = () => fitRoom();
  $('#zoomAll').onclick = () => fitAll();

  canvas.addEventListener('pointerdown', e => {
    const panOnly = e.button === 1 || e.button === 2 || keys.has(' ');
    if (e.button === 1) e.preventDefault();           // no autoscroll cursor
    const key = panOnly ? null : markAt(toWorld(...evPos(e)));
    if (key && e.button === 0) {
      const to = destinationOf(key);
      if (to) { selectRoom(to, ANN.marks[key].levelId); return; }
    }
    if (e.button !== 0 && !panOnly) return;
    stopGlide();
    S.drag = { x: e.clientX, y: e.clientY, tx: S.view.tx, ty: S.view.ty };
    canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (S.drag) {
      S.view.tx = S.drag.tx + (e.clientX - S.drag.x);
      S.view.ty = S.drag.ty + (e.clientY - S.drag.y);
      needsDraw = true;
      return;
    }
    const [sx, sy] = evPos(e);
    const key = markAt(toWorld(sx, sy));
    canvas.classList.toggle('pointing', !!(key && destinationOf(key)));
    if (key !== S.hover) { S.hover = key; needsDraw = true; }
    if (key) showTip(key, sx, sy); else $('#tip').hidden = true;
  });

  const endDrag = e => {
    if (!S.drag) return;
    S.drag = null;
    canvas.classList.remove('dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { S.hover = null; $('#tip').hidden = true; needsDraw = true; });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [sx, sy] = evPos(e);
    zoomBy(Math.exp(-e.deltaY * 0.0016), sx, sy);
  }, { passive: false });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  window.addEventListener('keyup', e => keys.delete(e.key));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('keydown', e => {
    if ((e.target.tagName || '').toLowerCase() === 'input') return;
    keys.add(e.key);
    if (e.key === ' ') e.preventDefault();
    if (e.key === 'f') fitRoom();
    if (e.key === 'a') fitAll();
    if (e.key === 's') $('#floorsBtn').click();
    if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
    if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); goBack(); }
    if (e.key === 'ArrowRight' && e.altKey) { e.preventDefault(); goForward(); }
  });

  // ---- the floor stack ----
  const setFloors = on => {
    $('#layout').classList.toggle('noFloors', !on);
    localStorage.setItem('cr.read.floors', on ? '1' : '0');
    $('#floorsBtn').classList.toggle('on', on);
    if (on) renderFloors();
    resize();
  };
  setFloors(localStorage.getItem('cr.read.floors') !== '0');
  $('#floorsBtn').onclick = () => setFloors($('#layout').classList.contains('noFloors'));
  $('#floorsClose').onclick = () => setFloors(false);
  $('#floors').onclick = e => {
    const g = e.target.closest('[data-sheet]');
    if (!g) return;
    setLevel(g.dataset.sheet, true).then(() => {
      renderRoom();
      const mine = marksForRoom(S.roomId, S.levelId).length;
      mine ? fitRoom(0) : fitAll(0);                 // a new floor cuts, never glides
      renderFloors();
    });
  };

  // ---- panes you can drag wider ----
  const WIDTHS = { lib: '--w-lib', room: '--w-room', floors: '--w-floors' };
  const LIMITS = { lib: [150, 520], room: [240, 760], floors: [180, 640] };
  const layout = $('#layout');
  for (const [name, v] of Object.entries(WIDTHS)) {
    const saved = localStorage.getItem('cr.read.w.' + name);
    if (saved) layout.style.setProperty(v, saved + 'px');
  }
  layout.querySelectorAll('.splitter').forEach(sp => {
    sp.addEventListener('pointerdown', e => {
      const name = sp.dataset.grip;
      const v = WIDTHS[name], [lo, hi] = LIMITS[name];
      const start = e.clientX;
      const from = parseFloat(getComputedStyle(layout).getPropertyValue(v));
      const dir = name === 'floors' ? -1 : 1;      // the right pane grows leftwards
      sp.classList.add('on');
      document.body.classList.add('resizing');
      sp.setPointerCapture(e.pointerId);
      const move = ev => {
        const w = Math.max(lo, Math.min(hi, from + (ev.clientX - start) * dir));
        layout.style.setProperty(v, w + 'px');
        localStorage.setItem('cr.read.w.' + name, Math.round(w));
        resize();
      };
      const up = ev => {
        sp.classList.remove('on');
        document.body.classList.remove('resizing');
        sp.removeEventListener('pointermove', move);
        sp.removeEventListener('pointerup', up);
        try { sp.releasePointerCapture(ev.pointerId); } catch (_) {}
      };
      sp.addEventListener('pointermove', move);
      sp.addEventListener('pointerup', up);
      e.preventDefault();
    });
    sp.addEventListener('dblclick', () => {
      const name = sp.dataset.grip;
      layout.style.removeProperty(WIDTHS[name]);
      localStorage.removeItem('cr.read.w.' + name);
      resize();
    });
  });
  new ResizeObserver(() => resize()).observe($('#mapPane'));
  let floorsTimer = null;
  new ResizeObserver(() => {
    clearTimeout(floorsTimer);
    floorsTimer = setTimeout(renderFloors, 60);      // refit the stack to the panel
  }).observe($('#floorsPane'));

  $('#legend').innerHTML = ['door', 'secret-door', 'stairs', 'window', 'trap', 'light', 'item', 'creature']
    .map(k => `<span><b style="color:${TYPES[k].color}">${TYPES[k].ico}</b> ${TYPES[k].label}</span>`)
    .join('') + '<span>solid outline: wall &middot; dashed: open</span>';

  resize();
}

function evPos(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function zoomLabel() { $('#zoomLabel').textContent = Math.round(S.view.scale * 100) + '%'; }
setInterval(zoomLabel, 200);

// The editor writes the same file; pick up its changes without a refresh.
setInterval(async () => {
  if (document.hidden) return;
  try {
    const fresh = await fetch('/api/annotations', { cache: 'no-store' }).then(r => r.json());
    if (!fresh || fresh.updated === ANN.updated) return;
    ANN = fresh;
    ANN.marks ||= {}; ANN.customFeatures ||= {}; ANN.hiddenFeatures ||= [];
    ANN.renames ||= {}; ANN.grids ||= {};
    _idx.clear(); FRAMES = null;
    renderLibrary(); renderRoom(); needsDraw = true;
  } catch (_) { /* the server went away; keep showing what we have */ }
}, 4000);
