/* Castle Ravenloft VTT mapper
 * Mark rooms, doors, and items on the official battlemaps; everything you do
 * is written straight back to castle-ravenloft-annotations.json. */
'use strict';

// ------------------------------------------------------------------ types
const TYPES = {
  room:          { label: 'Room',        ico: '▢', color: '#8b6fe0', shape: 'rect'  },
  door:          { label: 'Door',        ico: '🚪', color: '#d9913f', shape: 'seg'   },
  'secret-door': { label: 'Secret door', ico: '◈',  color: '#d64fb0', shape: 'seg'   },
  stairs:        { label: 'Stairs',      ico: '≣',  color: '#4aa3e0', shape: 'rect'  },
  trap:          { label: 'Trap',        ico: '⚠',  color: '#e0553f', shape: 'rect'  },
  window:        { label: 'Window',      ico: '▤',  color: '#49c7c2', shape: 'seg'   },
  light:         { label: 'Light',       ico: '✦',  color: '#e7c453', shape: 'point' },
  item:          { label: 'Item',        ico: '◆',  color: '#63c07e', shape: 'point' },
  creature:      { label: 'Creature',    ico: '☠',  color: '#c2453f', shape: 'point' },
  wall:          { label: 'Wall',        ico: '▬',  color: '#b9b2cc', shape: 'seg'   },
  note:          { label: 'Note',        ico: '✎',  color: '#9a93b0', shape: 'point' },
};
const TYPE_KEYS = Object.keys(TYPES).filter(k => k !== 'room');

// ------------------------------------------------------------------ state
let DATA = null;                       // castle-data.json
let ANN = null;                        // annotations
const ROOMS = new Map();               // id -> room
const LEVELS = new Map();              // id -> level

const S = {
  levelId: null,
  roomId: null,
  target: null,                        // {kind:'room'|'feat', id}
  tool: 'select',
  snap: 'corner',
  showGrid: true,
  playerMap: false,
  typeFilter: new Set(),
  search: '',
  onlyUnmarked: false,
  hideSubs: false,
  view: { scale: 1, tx: 0, ty: 0 },
  draft: null,                         // in-progress shape
  drag: null,
  calibrating: false,
  sel: null,                           // selected markId
  hover: null,
  hoverEdge: null,
  snapSuspended: false,   // Alt held: snap off until it is let go
  boolMode: 'new',       // new | add | sub, for area drawing
};

const imgCache = new Map();
let img = null;                        // currently displayed HTMLImageElement
let needsDraw = true;

// ------------------------------------------------------------------ dom
const $ = s => document.querySelector(s);
const canvas = $('#canvas');
canvas.tabIndex = 0;
const ctx = canvas.getContext('2d');

// ==================================================================
//  boot
// ==================================================================
(async function boot() {
  const [d, a] = await Promise.all([
    fetch('/castle-data.json').then(r => r.json()),
    fetch('/api/annotations').then(r => r.json()),
  ]);
  DATA = d; ANN = a;
  ANN.grids ||= {}; ANN.marks ||= {}; ANN.customFeatures ||= {};
  ANN.hiddenFeatures ||= []; ANN.roomStatus ||= {}; ANN.roomNotes ||= {};
  ANN.renames ||= {};
  ANN.hiddenFeatures = [...new Set(ANN.hiddenFeatures)];
  // marks used to be keyed without a level; move them onto their own level
  for (const [k, m] of Object.entries(ANN.marks)) {
    if (!k.includes('@') && m && m.levelId) {
      ANN.marks[k + '@' + m.levelId] = m;
      delete ANN.marks[k];
    }
  }

  // outlines used to be a bare rect or polygon; give them edges so they can be
  // cut about. Rooms get walls, markers get open boundaries.
  for (const [k, m] of Object.entries(ANN.marks)) {
    if (m.shape && (m.shape.type === 'rect' || m.shape.type === 'poly')) {
      m.shape = makeArea(m.shape, k.startsWith('room:') ? WALL : OPEN);
    }
    if (m.shape && m.shape.type === 'area' && m.shape.parts.length > 1) {
      geomVersion++; normalizeArea(m.shape);
    }
  }

  // features used to hold a single placement; number them so more can be added
  for (const [k, m] of Object.entries(ANN.marks)) {
    if (k.startsWith('feat:') && !k.slice(0, k.lastIndexOf('@')).includes('#')) {
      const at = k.lastIndexOf('@');
      ANN.marks[k.slice(0, at) + '#1' + k.slice(at)] = m;
      delete ANN.marks[k];
    }
  }

  DATA.levels.forEach(l => LEVELS.set(l.id, l));
  DATA.rooms.forEach(r => ROOMS.set(r.id, r));

  relink();
  buildLevelSelect();
  buildTypeFilters();
  buildAddTypes();
  wire();
  await setLevel(localStorage.getItem('cr.level') || DATA.levels[1].id, true);
  renderRooms();
  renderFeatures();
  loop();
  if (!Object.keys(ANN.marks).length) {
    hint('<b>Pick a room on the left</b>, then drag a box over it on the map. '
       + 'Its doors and items appear in the middle column: click one and place it. '
       + 'Keys: <b>V</b> select · <b>R</b> rect · <b>P</b> poly · <b>D</b> door · <b>T</b> point · <b>F</b> fit · space-drag pans.');
  }
})();

// ==================================================================
//  annotations helpers
// ==================================================================
// A mark is scoped to a level: K18, K20 and K21 are drawn on several map
// sheets, so each can carry its own outline per floor.
const mid = (kind, id, levelId) => kind + ':' + id + '@' + (levelId || S.levelId);
const getMark = k => ANN.marks[k] || null;

// A feature can be placed as many times as it needs to be: "Fluttering torches"
// is six points, "Double doors" may be two openings. Each placement is its own
// mark, numbered after a #, so it selects, moves, deletes and undoes on its own.
const featKey = (fid, n, levelId) =>
  'feat:' + fid + '#' + n + '@' + (levelId || S.levelId);

const splitKey = k => {
  const at = k.lastIndexOf('@');
  const head = at < 0 ? k : k.slice(0, at);
  const c = head.indexOf(':');
  let id = head.slice(c + 1), inst = 1;
  const h = id.lastIndexOf('#');
  if (h > 0) { inst = +id.slice(h + 1) || 1; id = id.slice(0, h); }
  return { kind: head.slice(0, c), id, inst,
           levelId: at < 0 ? (ANN.marks[k] || {}).levelId : k.slice(at + 1) };
};

/** Every mark belonging to this room or feature, across levels and placements. */
function marksOf(kind, id) {
  const exact = kind + ':' + id + '@';
  const numbered = kind + ':' + id + '#';
  return Object.entries(ANN.marks)
    .filter(([k]) => k.startsWith(exact) || k.startsWith(numbered));
}
const hasMark = (kind, id) => marksOf(kind, id).length > 0;

/** Placements of one feature on one level, in order. */
function placementsOf(fid, levelId = S.levelId) {
  return marksOf('feat', fid)
    .filter(([k]) => splitKey(k).levelId === levelId)
    .sort((a, b) => splitKey(a[0]).inst - splitKey(b[0]).inst);
}

function nextFeatKey(fid) {
  let n = 1;
  while (ANN.marks[featKey(fid, n)]) n++;
  return featKey(fid, n);
}

// ------------------------------------------------------------------ undo
// Snapshots of everything the UI can change. Marks, the feature list edits and
// the grid all ride on one stack, so ctrl+Z walks back through your actions in
// the order you took them whatever kind they were.
const HISTORY = { undo: [], redo: [], limit: 150, lastTag: null, lastAt: 0 };

const snapshot = () => JSON.stringify({
  marks: ANN.marks, customFeatures: ANN.customFeatures,
  hiddenFeatures: ANN.hiddenFeatures, grids: ANN.grids, renames: ANN.renames,
});

/** Record the state as it is now, before a change. `tag` coalesces a burst of
 *  the same kind of edit (dragging a grid offset) into one undo step. */
function pushHistory(label, tag) {
  const now = Date.now();
  if (tag && HISTORY.lastTag === tag && now - HISTORY.lastAt < 900) {
    HISTORY.lastAt = now;
    return;                                  // same burst, already recorded
  }
  HISTORY.undo.push({ state: snapshot(), label: label || 'change' });
  if (HISTORY.undo.length > HISTORY.limit) HISTORY.undo.shift();
  HISTORY.redo.length = 0;
  HISTORY.lastTag = tag || null;
  HISTORY.lastAt = now;
  updateHistoryUI();
}

function applySnapshot(json) {
  const o = JSON.parse(json);
  geomVersion++;
  ANN.marks = o.marks;
  ANN.customFeatures = o.customFeatures;
  ANN.hiddenFeatures = o.hiddenFeatures;
  ANN.grids = o.grids;
  ANN.renames = o.renames || {};
  if (S.sel && !ANN.marks[S.sel]) S.sel = null;
  S.draft = null; S.drag = null;
  save();
  syncGridDialog();
  renderRooms(); renderFeatures();
  needsDraw = true;
}

function undo() {
  if (!HISTORY.undo.length) { hint('Nothing left to undo.'); return; }
  const entry = HISTORY.undo.pop();
  HISTORY.redo.push({ state: snapshot(), label: entry.label });
  HISTORY.lastTag = null;
  applySnapshot(entry.state);
  hint('Undid: ' + esc(entry.label) + '. <b>Ctrl+Shift+Z</b> to redo.');
  updateHistoryUI();
}

function redo() {
  if (!HISTORY.redo.length) { hint('Nothing left to redo.'); return; }
  const entry = HISTORY.redo.pop();
  HISTORY.undo.push({ state: snapshot(), label: entry.label });
  HISTORY.lastTag = null;
  applySnapshot(entry.state);
  hint('Redid: ' + esc(entry.label) + '.');
  updateHistoryUI();
}

function updateHistoryUI() {
  const u = $('#undoBtn'), r = $('#redoBtn');
  if (!u) return;
  u.disabled = !HISTORY.undo.length;
  r.disabled = !HISTORY.redo.length;
  u.title = HISTORY.undo.length
    ? 'Undo ' + HISTORY.undo[HISTORY.undo.length - 1].label + ' (Ctrl+Z)'
    : 'Nothing to undo (Ctrl+Z)';
  r.title = HISTORY.redo.length
    ? 'Redo ' + HISTORY.redo[HISTORY.redo.length - 1].label + ' (Ctrl+Shift+Z)'
    : 'Nothing to redo (Ctrl+Shift+Z)';
}

function setMark(k, mark) {
  if (mark) ANN.marks[k] = mark; else delete ANN.marks[k];
  save();
  renderRooms(); renderFeatures(); needsDraw = true;
}

function grid(levelId = S.levelId) {
  const lv = LEVELS.get(levelId);
  if (!ANN.grids[levelId]) ANN.grids[levelId] = Object.assign({}, lv.grid);
  const g = ANN.grids[levelId];
  g.size = +g.size || lv.grid.size;
  g.offsetX = +g.offsetX || 0;
  g.offsetY = +g.offsetY || 0;
  g.feetPerSquare = +g.feetPerSquare || 10;
  return g;
}

// features of a room = auto ones minus hidden, plus custom
function featuresOf(roomId) {
  const r = ROOMS.get(roomId);
  if (!r) return [];
  const hidden = new Set(ANN.hiddenFeatures);
  const auto = (r.features || []).filter(f => !hidden.has(f.id));
  const custom = ANN.customFeatures[roomId] || [];
  return auto.concat(custom).map(f => {
    const renamed = ANN.renames[f.id];
    return renamed ? Object.assign({}, f, { label: renamed, renamed: true }) : f;
  });
}

function renameFeature(fid, label) {
  const f = featuresOf(fid.split('::')[0]).find(x => x.id === fid);
  if (!f) return;
  label = label.trim();
  if (!label || label === f.label) return;
  pushHistory('rename "' + f.label + '"');
  const custom = (ANN.customFeatures[fid.split('::')[0]] || []).find(x => x.id === fid);
  if (custom) delete ANN.renames[fid];        // edit a custom entry in place
  if (custom) custom.label = label; else ANN.renames[fid] = label;
  save(); renderFeatures(); needsDraw = true;
}

function roomProgress(roomId) {
  const feats = featuresOf(roomId);
  const placed = feats.filter(f => hasMark('feat', f.id)).length;
  const area = hasMark('room', roomId);
  return { placed, total: feats.length, area };
}

/** Interior walls belonging to a room, on the level showing now. */
function wallsOf(roomId, levelId = S.levelId) {
  return Object.entries(ANN.marks)
    .filter(([k]) => k.startsWith('iwall:' + roomId + '~') && k.endsWith('@' + levelId));
}

function nextWallKey(roomId) {
  let n = 1;
  while (ANN.marks['iwall:' + roomId + '~' + n + '@' + S.levelId]) n++;
  return 'iwall:' + roomId + '~' + n + '@' + S.levelId;
}

// ------------------------------------------------------------------ save
let saveTimer = null, savePending = false;
function save() {
  setSaveState('dirty', 'unsaved');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { relink(); flush(); }, 500);
}
async function flush() {
  if (savePending) { save(); return; }
  savePending = true;
  setSaveState('saving', 'saving…');
  try {
    const res = await fetch('/api/annotations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ANN),
    });
    if (!res.ok) throw new Error(await res.text());
    setSaveState('ok', 'saved');
  } catch (e) {
    setSaveState('err', 'save failed');
    console.error(e);
  } finally { savePending = false; }
}
function setSaveState(cls, txt) {
  const el = $('#saveState');
  el.className = 'save ' + cls;
  el.textContent = txt;
}
window.addEventListener('beforeunload', e => {
  if ($('#saveState').classList.contains('dirty')) { flush(); e.preventDefault(); e.returnValue = ''; }
});

// ==================================================================
//  level / image
// ==================================================================
function buildLevelSelect() {
  $('#levelSelect').innerHTML = DATA.levels
    .map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}

function mapUrl(level, player) {
  const p = player && level.playerMap ? level.playerMap : level.dmMap;
  return '/maps/' + p.split('/').map(encodeURIComponent).join('/');
}

function loadImage(url) {
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('could not load ' + url));
    im.src = url;
  });
  imgCache.set(url, p);
  return p;
}

async function setLevel(id, fit) {
  if (!LEVELS.has(id)) id = DATA.levels[1].id;
  S.levelId = id;
  localStorage.setItem('cr.level', id);
  $('#levelSelect').value = id;
  const lv = LEVELS.get(id);
  hint('Loading ' + lv.name + '…');
  try {
    img = await loadImage(mapUrl(lv, S.playerMap));
    hint('');
  } catch (e) {
    img = null;
    hint('<b>Map image not found.</b> Expected <code>' + lv.dmMap + '</code> under your Ravenloft folder.');
  }
  if (fit) fitView();
  if (!grid(id).calibrated) {
    hint('<b>Grid not calibrated for this map yet.</b> Open <b>Grid setup</b> and drag a line '
       + 'across a run of squares so snapping lines up. You can mark rooms without it.');
  }
  needsDraw = true;
}

// ==================================================================
//  view transform
// ==================================================================
function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  needsDraw = true;
}
const cw = () => canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
const chh = () => canvas.height / (Math.min(window.devicePixelRatio || 1, 2));

function fitView() {
  const lv = LEVELS.get(S.levelId);
  const w = lv.width, h = lv.height;
  const s = Math.min(cw() / w, chh() / h) * 0.96;
  S.view.scale = s;
  S.view.tx = (cw() - w * s) / 2;
  S.view.ty = (chh() - h * s) / 2;
  needsDraw = true;
}
function zoomAt(sx, sy, factor) {
  const v = S.view;
  const ns = Math.max(0.02, Math.min(12, v.scale * factor));
  const k = ns / v.scale;
  v.tx = sx - (sx - v.tx) * k;
  v.ty = sy - (sy - v.ty) * k;
  v.scale = ns;
  needsDraw = true;
}
const toWorld = (sx, sy) => ({ x: (sx - S.view.tx) / S.view.scale, y: (sy - S.view.ty) / S.view.scale });
const toScreen = (wx, wy) => ({ x: wx * S.view.scale + S.view.tx, y: wy * S.view.scale + S.view.ty });

function evPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ------------------------------------------------------------------ snap
function snap(p) {
  if (S.snap === 'off' || S.snapSuspended) return p;
  const g = grid();
  let step = g.size, shift = 0;
  if (S.snap === 'center') shift = g.size / 2;
  if (S.snap === 'half') step = g.size / 2;
  const f = (v, off) => Math.round((v - off - shift) / step) * step + off + shift;
  return { x: f(p.x, g.offsetX), y: f(p.y, g.offsetY) };
}

/**
 * With snap on, a circle works better if the radius steps rather than the rim
 * point: snapping the rim to a grid corner makes small circles collapse to
 * nothing and pulls every other one off centre. Corners step by the square,
 * the finer modes by the half square.
 */
function snapRadius(r) {
  if (S.snap === 'off' || S.snapSuspended) return r;
  const step = S.snap === 'corner' ? grid().size : grid().size / 2;
  return Math.max(step, Math.round(r / step) * step);
}

// ==================================================================
//  rendering
// ==================================================================
function loop() { if (needsDraw) { draw(); needsDraw = false; } requestAnimationFrame(loop); }

function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw(), chh());
  ctx.fillStyle = '#0c0b10';
  ctx.fillRect(0, 0, cw(), chh());

  const v = S.view;
  ctx.save();
  ctx.translate(v.tx, v.ty);
  ctx.scale(v.scale, v.scale);

  const lv = LEVELS.get(S.levelId);
  if (img) {
    ctx.imageSmoothingEnabled = v.scale < 2;
    ctx.drawImage(img, 0, 0, lv.width, lv.height);
  } else {
    ctx.fillStyle = '#1a1822';
    ctx.fillRect(0, 0, lv.width, lv.height);
  }
  if (S.showGrid) drawGrid(lv);
  drawMarks(lv);
  drawDraft();
  ctx.restore();
}

function drawGrid(lv) {
  const g = grid();
  const step = g.size;
  if (step * S.view.scale < 4) return;
  ctx.lineWidth = 1 / S.view.scale;
  ctx.strokeStyle = 'rgba(120,190,255,.34)';
  ctx.beginPath();
  for (let x = g.offsetX % step; x <= lv.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, lv.height); }
  for (let y = g.offsetY % step; y <= lv.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(lv.width, y); }
  ctx.stroke();
}

function marksOnLevel() {
  const out = [];
  for (const [k, m] of Object.entries(ANN.marks)) {
    if (m && m.levelId === S.levelId) out.push([k, m]);
  }
  return out;
}

function markMeta(key) {
  const { kind, id } = splitKey(key);
  if (kind === 'iwall') {
    const roomId = id.split('~')[0];
    return { type: 'wall', label: '', sub: roomId, roomId };
  }
  if (kind === 'room') {
    const r = ROOMS.get(id);
    return { type: 'room', label: id, sub: r ? r.name : '', roomId: id };
  }
  const fid = id;
  const roomId = fid.split('::')[0];
  const f = featuresOf(roomId).find(x => x.id === fid)
        || (ROOMS.get(roomId)?.features || []).find(x => x.id === fid);
  return { type: f ? f.type : 'note', label: f ? f.label : fid, sub: roomId, roomId };
}

function drawMarks(lv) {
  const sc = S.view.scale;
  const entries = marksOnLevel();
  // rooms under features
  entries.sort((a, b) => (a[0].startsWith('room:') ? 0 : 1) - (b[0].startsWith('room:') ? 0 : 1));
  for (const [key, m] of entries) {
    const meta = markMeta(key);
    const sk = splitKey(key);
    const quiet = sk.kind === 'feat' && sk.inst > 1 && key !== S.sel;
    const t = TYPES[meta.type] || TYPES.note;
    const isTarget = S.target && key === mid(S.target.kind, S.target.id);
    const isSel = key === S.sel;
    const dim = S.roomId && meta.roomId !== S.roomId;
    ctx.globalAlpha = dim && !isSel ? 0.42 : 1;
    drawShape(m.shape, t.color, isSel || isTarget, sc, quiet ? null : meta, m);
    ctx.globalAlpha = 1;
  }
}

// one reusable layer, used to punch subtract parts out of add parts exactly
const layer = document.createElement('canvas');
const lctx = layer.getContext('2d');

function fillArea(sh, color, strong) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bb = areaBBox(sh);
  const tl = toScreen(bb.x0, bb.y0), br = toScreen(bb.x1, bb.y1);
  const pad = 4;
  const x = Math.floor(tl.x) - pad, y = Math.floor(tl.y) - pad;
  const w = Math.ceil(br.x - tl.x) + pad * 2, h = Math.ceil(br.y - tl.y) + pad * 2;
  if (w <= 0 || h <= 0 || w > 8000 || h > 8000) return;
  if (layer.width < w * dpr || layer.height < h * dpr) {
    layer.width = Math.ceil(w * dpr); layer.height = Math.ceil(h * dpr);
  }
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lctx.clearRect(0, 0, layer.width, layer.height);
  lctx.save();
  lctx.translate(-x, -y);
  lctx.translate(S.view.tx, S.view.ty);
  lctx.scale(S.view.scale, S.view.scale);
  for (const part of sh.parts) {
    lctx.globalCompositeOperation = part.op === 'sub' ? 'destination-out' : 'source-over';
    lctx.fillStyle = part.op === 'sub' ? '#000' : color;
    lctx.beginPath();
    part.ring.forEach((p, i) => i ? lctx.lineTo(p[0], p[1]) : lctx.moveTo(p[0], p[1]));
    lctx.closePath(); lctx.fill();
  }
  lctx.restore();
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = strong ? 0.30 : 0.17;
  ctx.drawImage(layer, 0, 0, Math.ceil(w * dpr), Math.ceil(h * dpr), x, y, w, h);
  ctx.restore();
}

function drawArea(sh, color, strong, sc, meta) {
  fillArea(sh, color, strong);
  const editing = S.tool === 'edges' && strong;
  // faint guide for the parts, then the real outline on top
  if (meta && meta.type !== 'room') {          // markers read better filled in
    ctx.save();
    ctx.beginPath();
    for (const part of sh.parts) {
      part.ring.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
    }
    ctx.fillStyle = color + (strong ? '44' : '28');
    ctx.fill('evenodd');
    ctx.restore();
  }

  ctx.save();
  ctx.lineWidth = 1 / sc;
  ctx.strokeStyle = color + '33';
  ctx.setLineDash([3 / sc, 4 / sc]);
  for (const part of sh.parts) {
    ctx.beginPath();
    part.ring.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();

  for (const seg of areaBoundary(sh)) {
    const hot = editing && S.hoverEdge &&
                S.hoverEdge.pi === seg.pi && S.hoverEdge.i === seg.i;
    ctx.lineCap = 'round';
    ctx.setLineDash(seg.wall ? [] : [9 / sc, 7 / sc]);
    ctx.lineWidth = (seg.wall ? (strong ? 4 : 3) : (strong ? 2.2 : 1.8)) / sc;
    ctx.strokeStyle = hot ? '#ffffff' : (seg.wall ? color : color + '88');
    ctx.beginPath();
    ctx.moveTo(seg.a[0], seg.a[1]); ctx.lineTo(seg.b[0], seg.b[1]);
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.lineCap = 'butt';

  if (editing) {                       // click targets, one per part edge
    for (const e of areaEdges(sh)) {
      const m = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
      const hot = S.hoverEdge && S.hoverEdge.pi === e.pi && S.hoverEdge.i === e.i;
      ctx.beginPath(); ctx.arc(m[0], m[1], (hot ? 7 : 5) / sc, 0, 7);
      ctx.fillStyle = hot ? '#fff' : (e.wall ? color : '#15121c');
      ctx.fill();
      ctx.lineWidth = 2 / sc; ctx.strokeStyle = e.wall ? '#15121c' : color;
      ctx.stroke();
    }
  }
  const c = centroid(shapePoints(sh));
  label(meta, c[0], c[1], sc, color, strong);
}

function drawShape(sh, color, strong, sc, meta, m) {
  if (!sh) return;
  if (sh.type === 'area') {
    drawArea(sh, color, strong, sc, meta);
    if (strong && S.tool !== 'edges') drawHandles(sh, sc);
    return;
  }
  const lw = (strong ? 3 : 2) / sc;
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.fillStyle = color + (strong ? '44' : '28');
  ctx.setLineDash(m && m.secret ? [8 / sc, 6 / sc] : []);

  if (sh.type === 'rect') {
    ctx.beginPath(); ctx.rect(sh.x, sh.y, sh.w, sh.h); ctx.fill(); ctx.stroke();
    label(meta, sh.x + sh.w / 2, sh.y + sh.h / 2, sc, color, strong);
  } else if (sh.type === 'poly') {
    if (sh.pts.length < 2) return;
    ctx.beginPath();
    sh.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const c = centroid(sh.pts);
    label(meta, c[0], c[1], sc, color, strong);
  } else if (sh.type === 'seg') {
    ctx.lineWidth = (strong ? 9 : 7) / sc;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sh.x1, sh.y1); ctx.lineTo(sh.x2, sh.y2); ctx.stroke();
    ctx.lineCap = 'butt';
    label(meta, (sh.x1 + sh.x2) / 2, (sh.y1 + sh.y2) / 2, sc, color, strong, true);
  } else if (sh.type === 'point') {
    const r = 11 / sc;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, r, 0, 7);
    ctx.fillStyle = color + 'cc'; ctx.fill();
    ctx.lineWidth = 2.5 / sc; ctx.strokeStyle = '#15121c'; ctx.stroke();
    label(meta, sh.x, sh.y - r - 4 / sc, sc, color, strong, true);
  }
  ctx.setLineDash([]);
  if (strong) drawHandles(sh, sc);
}

function label(meta, x, y, sc, color, strong, small) {
  if (!meta) return;
  // declutter: feature labels only once you are zoomed in enough to read them
  if (meta.type !== 'room' && !strong && sc < 0.28) return;
  const px = (small ? 12 : 15) / sc;
  if (px * sc < 8) return;
  ctx.font = (strong ? '700 ' : '600 ') + px + 'px Inter, Segoe UI, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const txt = meta.type === 'room' ? meta.label : meta.label;
  ctx.lineWidth = 3.5 / sc; ctx.strokeStyle = 'rgba(10,9,14,.92)';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = strong ? '#fff' : '#f2eefb';
  ctx.fillText(txt, x, y);
}

function drawHandles(sh, sc) {
  const pts = shapePoints(sh);
  const r = 5 / sc;
  for (const p of pts) {
    ctx.beginPath(); ctx.rect(p[0] - r, p[1] - r, r * 2, r * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1.5 / sc; ctx.strokeStyle = '#15121c'; ctx.stroke();
  }
}

function drawDraft() {
  const d = S.draft;
  if (!d) return;
  const sc = S.view.scale;
  ctx.save();
  ctx.setLineDash([6 / sc, 5 / sc]);
  ctx.lineWidth = 2 / sc;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  if (d.type === 'rect') { ctx.beginPath(); ctx.rect(d.x, d.y, d.w, d.h); ctx.fill(); ctx.stroke(); }
  else if (d.type === 'circle') {
    const ring = circleRing(d.cx, d.cy, d.r, grid().size);
    ctx.beginPath();
    ring.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(d.cx, d.cy, 3 / sc, 0, 7);
    ctx.fillStyle = '#fff'; ctx.fill();
    const g = grid();
    const across = 2 * d.r / g.size;
    ctx.font = (13 / sc) + 'px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3.5 / sc; ctx.strokeStyle = 'rgba(10,9,14,.92)';
    const cap = `${(across * g.feetPerSquare).toFixed(0)} ft across · ${ring.length} points`;
    ctx.strokeText(cap, d.cx, d.cy - d.r - 6 / sc);
    ctx.fillStyle = '#fff';
    ctx.fillText(cap, d.cx, d.cy - d.r - 6 / sc);
  }
  else if (d.type === 'seg') {
    ctx.lineWidth = (d.wall ? 9 : 7) / sc; ctx.lineCap = 'round';
    if (d.wall) ctx.strokeStyle = TYPES.wall.color;
    ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
    ctx.lineCap = 'butt';
  } else if (d.type === 'poly') {
    ctx.beginPath();
    d.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    if (d.cursor) ctx.lineTo(d.cursor[0], d.cursor[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of d.pts) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 4 / sc, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill();
    }
  } else if (d.type === 'cal') {
    ctx.lineWidth = 2 / sc; ctx.strokeStyle = '#e7c453';
    ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
  }
  ctx.restore();
}


// ==================================================================
//  areas: composite shapes with per-edge wall / open boundaries
// ==================================================================
// A room area is a sequence of parts, each an "add" or a "subtract" ring,
// applied in order like brush strokes. A point is inside the area when the
// last part containing it is an add. That keeps subtraction exact with no
// polygon clipping, which matters here because everything snaps to the same
// grid, so shared vertices and collinear overlapping edges are the norm --
// precisely the cases naive clippers get wrong.
//
// Each ring carries one flag per edge: 1 = solid wall, 0 = open boundary.
// Only wall edges become line-of-sight in the VTT export.

const WALL = 1, OPEN = 0;
let geomVersion = 1;                        // bumped on every shape change
const segCache = new WeakMap();

/**
 * A circle as a polygon. The vertex count follows the size, four per grid
 * square of diameter, so a 3-square tower comes out a clean dodecagon and a
 * wide one still reads as round without burying the outline in handles.
 * Only the centre and the rim point are snapped; the vertices in between are
 * left where the circle puts them, otherwise it would come out lumpy.
 */
function circleRing(cx, cy, r, gridSize) {
  const across = (2 * r) / (gridSize || 1);
  const n = Math.max(8, Math.min(128, Math.round(across * 4)));
  const step = (Math.PI * 2) / n;
  const start = -Math.PI / 2 + step / 2;      // flat top, like the turrets
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = start + i * step;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function ringFromRect(r) {
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
}

/**
 * Wrap a freshly drawn rect/poly as a one-part area. Room outlines are walls
 * by default; an area drawn for a marker (a staircase, a pit, a pool of light)
 * is an open boundary, since marking where a thing sits should not by itself
 * block line of sight.
 */
function areaFromShape(sh, op = 'add', dflt = WALL) {
  const ring = sh.type === 'rect' ? ringFromRect(sh) : sh.pts.map(p => [p[0], p[1]]);
  return { op, ring, edges: new Array(ring.length).fill(dflt) };
}
const makeArea = (sh, dflt = WALL) => ({ type: 'area', parts: [areaFromShape(sh, 'add', dflt)] });

const isArea = sh => sh && sh.type === 'area';

/** Every edge of every part, flattened, with a stable index. */
function areaEdges(sh) {
  const out = [];
  sh.parts.forEach((part, pi) => {
    const n = part.ring.length;
    for (let i = 0; i < n; i++) {
      out.push({ pi, i, a: part.ring[i], b: part.ring[(i + 1) % n],
                 wall: part.edges[i] !== OPEN, op: part.op });
    }
  });
  return out;
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

/** Inside = the last part covering this point is an add. */
function insideArea(sh, pt) {
  let inside = false;
  for (const part of sh.parts) {
    if (pointInRing(pt, part.ring)) inside = (part.op === 'add');
  }
  return inside;
}

function segCross(p, q, a, b) {
  const r = [q[0] - p[0], q[1] - p[1]], s = [b[0] - a[0], b[1] - a[1]];
  const d = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(d) < 1e-12) return null;                 // parallel or collinear
  const t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / d;
  const u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / d;
  return (u >= -1e-9 && u <= 1 + 1e-9) ? t : null;
}

const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/**
 * The real outline of the composite area.
 *
 * Each part edge is split at its crossings with every other part, then each
 * piece is kept only if it actually separates inside from outside: sample a
 * point a hair to either side of the piece's midpoint and compare. That is an
 * exact test built solely on point-in-polygon, so it copes with diagonals,
 * overlaps and edges lying exactly on top of one another.
 */
function areaBoundary(sh) {
  const hit = segCache.get(sh);
  if (hit && hit.v === geomVersion) return hit.segs;

  const edges = areaEdges(sh);
  const segs = [];
  const seen = new Set();
  for (const e of edges) {
    const { a: p, b: q } = e;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1e-6) continue;
    const ts = [0, 1];
    for (const o of edges) {
      if (o.pi === e.pi) continue;                      // same ring: skip
      const t = segCross(p, q, o.a, o.b);
      if (t !== null && t > 1e-9 && t < 1 - 1e-9) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    const eps = Math.min(0.25, Math.max(0.02, L * 1e-3));
    const nx = -(q[1] - p[1]) / L * eps, ny = (q[0] - p[0]) / L * eps;
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 < 1e-7) continue;
      const m = lerp(p, q, (t0 + t1) / 2);
      const sideA = insideArea(sh, [m[0] + nx, m[1] + ny]);
      const sideB = insideArea(sh, [m[0] - nx, m[1] - ny]);
      if (sideA === sideB) continue;                    // not on the outline
      const A = lerp(p, q, t0), B = lerp(p, q, t1);
      const key = [A, B].map(z => z.map(v => Math.round(v * 100)).join(',')).sort().join('|');
      if (seen.has(key)) continue;                      // two rings share this edge
      seen.add(key);
      segs.push({ a: A, b: B, wall: e.wall, pi: e.pi, i: e.i });
    }
  }
  segCache.set(sh, { v: geomVersion, segs });
  return segs;
}

const PKEY = p => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100);

/** Chain boundary pieces into closed rings, carrying each piece's wall flag. */
function traceRings(segs) {
  const at = new Map();                       // point key -> [segment index]
  segs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = PKEY(p);
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(i);
    }
  });
  const used = new Array(segs.length).fill(false);
  const rings = [];
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const ring = [segs[start].a, segs[start].b];
    const flags = [segs[start].wall ? WALL : OPEN];
    for (;;) {
      const tail = ring[ring.length - 1];
      const cand = (at.get(PKEY(tail)) || []).filter(i => !used[i]);
      if (!cand.length) break;
      const i = cand[0];
      used[i] = true;
      const s = segs[i];
      const next = PKEY(s.a) === PKEY(tail) ? s.b : s.a;
      flags.push(s.wall ? WALL : OPEN);
      if (PKEY(next) === PKEY(ring[0])) break;   // closed
      ring.push(next);
    }
    // an unclosed chain: the segment that closes the ring was never part of the
    // traced boundary, so it is a bookkeeping edge, not a wall
    while (flags.length < ring.length) flags.push(OPEN);
    if (ring.length >= 3) rings.push({ ring, flags });
  }
  return rings.map(simplifyRing).filter(r => r.ring.length >= 3);
}

/** Drop vertices that sit mid-way along a straight run of the same kind. */
function simplifyRing({ ring, flags }) {
  const n = ring.length;
  const keepPt = [], keepFlag = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n], cur = ring[i], next = ring[(i + 1) % n];
    const fIn = flags[(i - 1 + n) % n], fOut = flags[i];
    const ax = cur[0] - prev[0], ay = cur[1] - prev[1];
    const bx = next[0] - cur[0], by = next[1] - cur[1];
    const cross = ax * by - ay * bx;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const straight = la > 1e-9 && lb > 1e-9 &&
                     Math.abs(cross) / (la * lb) < 1e-6 && (ax * bx + ay * by) > 0;
    if (straight && fIn === fOut) continue;    // nothing changes here: drop it
    keepPt.push(cur); keepFlag.push(fOut);
  }
  return { ring: keepPt, flags: keepFlag };
}

/** A point strictly inside a ring, for nesting tests. */
function interiorPoint(ring) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const e = Math.min(0.5, L * 0.01);
    const nx = -(b[1] - a[1]) / L * e, ny = (b[0] - a[0]) / L * e;
    if (pointInRing([m[0] + nx, m[1] + ny], ring)) return [m[0] + nx, m[1] + ny];
    if (pointInRing([m[0] - nx, m[1] - ny], ring)) return [m[0] - nx, m[1] - ny];
  }
  return ring[0];
}

/**
 * Rewrite a composite area as its plain outline: one ring per loop, holes as
 * subtract rings, and no leftover vertices from the shapes that were combined.
 * Wall / open flags ride along on the edges they came from.
 */
function normalizeArea(sh) {
  const segs = areaBoundary(sh);
  if (!segs.length) return sh;
  const traced = traceRings(segs);
  if (!traced.length) return sh;
  const pts = traced.map(t => interiorPoint(t.ring));
  const parts = traced.map((t, i) => {
    let depth = 0;
    traced.forEach((o, j) => { if (j !== i && pointInRing(pts[i], o.ring)) depth++; });
    return { op: depth % 2 ? 'sub' : 'add', ring: t.ring, edges: t.flags, _d: depth };
  });
  parts.sort((a, b) => a._d - b._d);
  parts.forEach(p => delete p._d);
  sh.parts = parts;
  geomVersion++;
  return sh;
}

/** Nearest part edge to a world point, for the edge-toggling tool. */
function nearestAreaEdge(sh, pt, tol) {
  let best = null;
  for (const e of areaEdges(sh)) {
    const d = distToSeg({ x: pt.x, y: pt.y }, e.a[0], e.a[1], e.b[0], e.b[1]);
    if (d <= tol && (!best || d < best.d)) best = { d, pi: e.pi, i: e.i };
  }
  return best;
}

function areaBBox(sh) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const part of sh.parts) for (const p of part.ring) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}

/** Add or subtract a freshly drawn shape, keeping open edges where they lay. */
function applyAreaOp(sh, drawn, op, dflt = WALL) {
  const part = areaFromShape(drawn, op, dflt);
  const before = areaEdges(sh);
  sh.parts.push(part);
  // a new edge running along a previously open boundary stays open
  part.edges = part.ring.map((p, i) => {
    const q = part.ring[(i + 1) % part.ring.length];
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const on = before.find(e => !e.wall &&
      distToSeg({ x: m[0], y: m[1] }, e.a[0], e.a[1], e.b[0], e.b[1]) < 1.5);
    return on ? OPEN : dflt;
  });
  return sh;
}

// ------------------------------------------------------------------ geometry
function shapePoints(sh) {
  if (!sh) return [];
  if (sh.type === 'area') return [].concat(...sh.parts.map(p => p.ring.map(q => [q[0], q[1]])));
  if (sh.type === 'rect') return [[sh.x, sh.y], [sh.x + sh.w, sh.y], [sh.x + sh.w, sh.y + sh.h], [sh.x, sh.y + sh.h]];
  if (sh.type === 'poly') return sh.pts.map(p => [p[0], p[1]]);
  if (sh.type === 'seg') return [[sh.x1, sh.y1], [sh.x2, sh.y2]];
  if (sh.type === 'point') return [[sh.x, sh.y]];
  return [];
}
function setShapePoint(sh, i, x, y) {
  if (sh.type === 'area') {
    for (const part of sh.parts) {
      if (i < part.ring.length) { part.ring[i] = [x, y]; return; }
      i -= part.ring.length;
    }
    return;
  }
  if (sh.type === 'rect') {
    const p = shapePoints(sh);
    const opp = p[(i + 2) % 4];
    sh.x = Math.min(x, opp[0]); sh.y = Math.min(y, opp[1]);
    sh.w = Math.abs(x - opp[0]); sh.h = Math.abs(y - opp[1]);
  } else if (sh.type === 'poly') { sh.pts[i] = [x, y]; }
  else if (sh.type === 'seg') { if (i === 0) { sh.x1 = x; sh.y1 = y; } else { sh.x2 = x; sh.y2 = y; } }
  else if (sh.type === 'point') { sh.x = x; sh.y = y; }
}
function moveShape(sh, dx, dy) {
  if (sh.type === 'area') {
    for (const part of sh.parts) part.ring = part.ring.map(p => [p[0] + dx, p[1] + dy]);
    return;
  }
  if (sh.type === 'rect') { sh.x += dx; sh.y += dy; }
  else if (sh.type === 'poly') sh.pts = sh.pts.map(p => [p[0] + dx, p[1] + dy]);
  else if (sh.type === 'seg') { sh.x1 += dx; sh.y1 += dy; sh.x2 += dx; sh.y2 += dy; }
  else if (sh.type === 'point') { sh.x += dx; sh.y += dy; }
}
function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}
function hitShape(sh, p, tol) {
  if (!sh) return false;
  if (sh.type === 'area') {
    return insideArea(sh, [p.x, p.y]) ||
      areaEdges(sh).some(e => distToSeg(p, e.a[0], e.a[1], e.b[0], e.b[1]) <= tol + 4 / S.view.scale);
  }
  if (sh.type === 'rect') return p.x >= sh.x - tol && p.x <= sh.x + sh.w + tol && p.y >= sh.y - tol && p.y <= sh.y + sh.h + tol;
  if (sh.type === 'point') return Math.hypot(p.x - sh.x, p.y - sh.y) <= 13 / S.view.scale + tol;
  if (sh.type === 'seg') return distToSeg(p, sh.x1, sh.y1, sh.x2, sh.y2) <= 8 / S.view.scale + tol;
  if (sh.type === 'poly') return pointInPoly(p, sh.pts) || sh.pts.some((q, i) => {
    const r = sh.pts[(i + 1) % sh.pts.length];
    return distToSeg(p, q[0], q[1], r[0], r[1]) <= tol + 4 / S.view.scale;
  });
  return false;
}
function distToSeg(p, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - x1) * dx + (p.y - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}
function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ==================================================================
//  heights: everything measured in feet from the main floor
// ==================================================================
// A mark carries height as { at } for a single elevation or { from, to } for
// something with a span: a room from its floor to its ceiling, a shaft from
// top to bottom, a torch at one height on the wall. Nothing set means the mark
// simply sits on its sheet's floor.

function levelElevation(levelId) {
  const l = LEVELS.get(levelId);
  return (l && typeof l.elevationFeet === 'number') ? l.elevationFeet : 0;
}

/**
 * The floor a mark sits on. The sheet's own elevation, unless the room it
 * belongs to is one the book measures directly: the spires sheet carries book
 * maps 6 to 10, and the tower rooms on it stand well above the roof level.
 */
function floorUnder(key, m) {
  const meta = markMeta(key);
  const r = ROOMS.get(meta.roomId);
  if (r && typeof r.elevationFeet === 'number' && r.level === m.levelId) return r.elevationFeet;
  return levelElevation(m.levelId);
}

/** The height to use for a mark: what was typed in, else the sheet's floor. */
function heightOf(key, m) {
  m = m || ANN.marks[key];
  if (!m) return null;
  if (m.height && (typeof m.height.at === 'number'
                   || typeof m.height.from === 'number' || typeof m.height.to === 'number')) {
    return m.height;
  }
  return { at: floorUnder(key, m), assumed: true };
}

function heightText(h) {
  if (!h) return '';
  const f = n => (Math.round(n * 10) / 10) + ' ft';
  if (typeof h.from === 'number' || typeof h.to === 'number') {
    return f(h.from ?? 0) + ' to ' + f(h.to ?? 0);
  }
  return f(h.at ?? 0);
}

/** Fill the height row from whatever is selected. */
function renderHeight() {
  const box = $('#heightTools');
  if (!box) return;
  const key = S.sel && ANN.marks[S.sel] ? S.sel : null;
  if (!key) { box.style.display = 'none'; return; }
  box.style.display = 'flex';
  const meta = markMeta(key);
  const h = heightOf(key);
  const assumed = !!h.assumed;
  $('#heightWho').textContent = (meta.label || meta.type) + ':';
  const f = $('#hFrom'), t = $('#hTo');
  if (document.activeElement !== f && document.activeElement !== t) {
    f.value = assumed ? '' : (typeof h.at === 'number' ? h.at : h.from ?? '');
    t.value = (assumed || typeof h.at === 'number') ? '' : (h.to ?? '');
  }
  f.placeholder = String(floorUnder(key, ANN.marks[key]));
  f.classList.toggle('assumed', assumed);
}

function setHeight(key, from, to) {
  const m = ANN.marks[key];
  if (!m) return;
  const next = (from === null && to === null) ? null
             : (to === null || to === from) ? { at: from }
             : { from: Math.min(from, to), to: Math.max(from, to) };
  if (JSON.stringify(m.height || null) === JSON.stringify(next)) return;   // nothing changed
  pushHistory('height of ' + markMeta(key).label);
  if (next) m.height = next; else delete m.height;
  save(); renderFeatures(); needsDraw = true;
}

// ==================================================================
//  links: the same thing marked twice, and what leads where
// ==================================================================
// Three kinds of link, all derived rather than typed in:
//   same   other placements of the same physical thing, usually because a door
//          between two rooms is on both rooms' checklists
//   rooms  the areas the thing actually touches on this sheet
//   to     rooms named in its own label ("south to K9", "up to K47")
//   levels the other map sheets this same entry is marked on
const LINKS = new Map();

// Only a thing you can pass through joins two rooms. A statue that straddles a
// boundary touches both rooms, but it is not a way between them.
const PASSAGE_TYPES = new Set(['door', 'secret-door', 'stairs', 'window']);
const PASSAGE_WORDS =
  /trapdoor|trap door|ladder|chute|shaft|bridge|archway|portcullis|stair|steps|elevator|walkway|balcony|opening|doorway|hatch|teleport/i;
const isPassage = meta =>
  PASSAGE_TYPES.has(meta.type) || PASSAGE_WORDS.test(meta.label || '');

const ROOM_RE = /\bK\d{1,2}[a-z]?\b/g;
const CRYPT_RE = /\bcrypt\s*(\d{1,2})\b/gi;
const CELL_RE = /\bcell\s*(K7[45][a-h])\b/gi;

/** Room ids named in a piece of text, minus the room it belongs to. */
function textTargets(label, selfRoom) {
  const out = new Set();
  for (const m of (label || '').matchAll(ROOM_RE)) if (ROOMS.has(m[0])) out.add(m[0]);
  for (const m of (label || '').matchAll(CRYPT_RE)) {
    const id = 'Crypt ' + Number(m[1]);
    if (ROOMS.has(id)) out.add(id);
  }
  for (const m of (label || '').matchAll(CELL_RE)) if (ROOMS.has(m[1])) out.add(m[1]);
  out.delete(selfRoom);
  return [...out];
}

function shapeCenter(sh) {
  const pts = shapePoints(sh);
  if (!pts.length) return null;
  return centroid(pts);
}

/** A line-ish mark reduced to centre, direction and length. */
function segLike(sh) {
  if (!sh) return null;
  if (sh.type === 'seg') {
    return { c: [(sh.x1 + sh.x2) / 2, (sh.y1 + sh.y2) / 2],
             a: Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1),
             len: Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1) };
  }
  return null;
}

const angClose = (a, b) => {
  let d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d) < 0.35;         // 20 degrees, direction-blind
};

/** Two marks that are really the same physical thing on the map. */
function sameSpot(m1, m2, g) {
  const s1 = m1.shape, s2 = m2.shape;
  if (!s1 || !s2) return false;
  const l1 = segLike(s1), l2 = segLike(s2);
  if (l1 && l2) {
    return Math.hypot(l1.c[0] - l2.c[0], l1.c[1] - l2.c[1]) < g * 0.45 && angClose(l1.a, l2.a);
  }
  if (s1.type === 'point' && s2.type === 'point') {
    return Math.hypot(s1.x - s2.x, s1.y - s2.y) < g * 0.35;
  }
  if ((s1.type === 'point' && l2) || (s2.type === 'point' && l1)) {
    const p = s1.type === 'point' ? s1 : s2, l = l1 || l2;
    return distToSeg({ x: p.x, y: p.y },
      l.c[0] - Math.cos(l.a) * l.len / 2, l.c[1] - Math.sin(l.a) * l.len / 2,
      l.c[0] + Math.cos(l.a) * l.len / 2, l.c[1] + Math.sin(l.a) * l.len / 2) < g * 0.35;
  }
  if (isArea(s1) && isArea(s2)) {
    const c1 = shapeCenter(s1), c2 = shapeCenter(s2);
    return c1 && c2 && Math.hypot(c1[0] - c2[0], c1[1] - c2[1]) < g * 0.4;
  }
  return false;
}

/** Every room outline on this level that covers a point. */
function roomsAtPoint(levelId, pt, index) {
  const out = [];
  for (const e of index) {
    const bb = e.bb;
    if (pt[0] < bb.x0 || pt[0] > bb.x1 || pt[1] < bb.y0 || pt[1] > bb.y1) continue;
    if (insideArea(e.shape, pt)) out.push(e.id);
  }
  return out;
}

/** The rooms a mark sits in or between. */
function roomsTouching(m, index, g) {
  const found = new Set();
  const l = segLike(m.shape);
  if (l) {                                         // step off both faces of the line
    const nx = -Math.sin(l.a), ny = Math.cos(l.a);
    for (const t of [-0.7, -0.45, 0.45, 0.7]) {
      for (const u of [-0.3, 0, 0.3]) {            // and along it, for doors at a corner
        const px = l.c[0] + nx * g * t + Math.cos(l.a) * l.len * u;
        const py = l.c[1] + ny * g * t + Math.sin(l.a) * l.len * u;
        roomsAtPoint(m.levelId, [px, py], index).forEach(r => found.add(r));
      }
    }
  } else if (m.shape && m.shape.type === 'point') {
    for (const [dx, dy] of [[0,0],[0.5,0],[-0.5,0],[0,0.5],[0,-0.5]]) {
      roomsAtPoint(m.levelId, [m.shape.x + dx*g, m.shape.y + dy*g], index).forEach(r => found.add(r));
    }
  } else if (m.shape) {
    const c = shapeCenter(m.shape);
    if (c) roomsAtPoint(m.levelId, c, index).forEach(r => found.add(r));
  }
  return [...found];
}

/** Recompute every link. Cheap enough to run after any edit. */
function relink() {
  LINKS.clear();
  const byLevel = new Map();
  for (const [k, m] of Object.entries(ANN.marks)) {
    if (!m || !m.shape) continue;
    if (!byLevel.has(m.levelId)) byLevel.set(m.levelId, []);
    byLevel.get(m.levelId).push([k, m]);
  }
  for (const [levelId, entries] of byLevel) {
    const g = (LEVELS.get(levelId)?.grid?.size) || 90;
    const index = entries.filter(([k, m]) => k.startsWith('room:') && isArea(m.shape))
                         .map(([k, m]) => ({ id: splitKey(k).id, shape: m.shape, bb: areaBBox(m.shape) }));
    const feats = entries.filter(([k]) => k.startsWith('feat:'));
    // buckets a grid square wide, so a mark only meets its neighbours
    const bucket = new Map();
    const cellOf = pt => Math.round(pt[0] / g) + ':' + Math.round(pt[1] / g);
    const anchorOf = m => {
      const l = segLike(m.shape);
      if (l) return l.c;
      if (m.shape && m.shape.type === 'point') return [m.shape.x, m.shape.y];
      return shapeCenter(m.shape);
    };
    for (const [k, m] of feats) {
      const a = anchorOf(m);
      if (!a) continue;
      const key = cellOf(a);
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key).push([k, m]);
    }
    const nearby = m => {
      const a = anchorOf(m);
      if (!a) return [];
      const cx = Math.round(a[0] / g), cy = Math.round(a[1] / g);
      const out = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const b = bucket.get((cx + dx) + ':' + (cy + dy));
        if (b) out.push(...b);
      }
      return out;
    };
    for (const [k, m] of entries) {
      const sk = splitKey(k);
      const meta = markMeta(k);
      const rec = { same: [], rooms: [], to: [], levels: [] };
      if (sk.kind === 'feat') {
        rec.rooms = roomsTouching(m, index, g).sort();
        rec.to = textTargets(meta.label, meta.roomId);
        for (const [k2, m2] of nearby(m)) {
          if (k2 === k) continue;
          if (splitKey(k2).id === sk.id) continue;          // another placement of itself
          if (markMeta(k2).type !== meta.type) continue;    // a door pairs with a door
          if (sameSpot(m, m2, g)) rec.same.push(k2);
        }
        rec.same.sort();
      } else if (sk.kind === 'room') {
        rec.rooms = [sk.id];
      }
      LINKS.set(k, rec);
    }
    // a room leads wherever its own doors and stairs lead
    const leads = new Map();                    // room id -> set of room ids
    const add = (from, to) => {
      if (!leads.has(from)) leads.set(from, new Set());
      to.forEach(x => leads.get(from).add(x));
    };
    for (const [k2] of feats) {
      const r2 = LINKS.get(k2);
      if (!r2) continue;
      const meta2 = markMeta(k2);
      if (!isPassage(meta2)) continue;
      const touched = new Set([...r2.rooms, ...r2.to, meta2.roomId].filter(Boolean));
      for (const home of touched) add(home, touched);
    }
    // an edge marked open is a way through as much as a door is
    for (const [k, m] of entries) {
      if (splitKey(k).kind !== 'room' || !isArea(m.shape)) continue;
      const me = splitKey(k).id;
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
            for (const rid of roomsAtPoint(levelId, [mx + nx * g * d, my + ny * g * d], index)) {
              if (rid !== me) { add(me, [rid]); add(rid, [me]); }
            }
          }
        }
      }
    }
    for (const [k] of entries) {
      const sk = splitKey(k);
      if (sk.kind !== 'room') continue;
      const out = new Set(leads.get(sk.id) || []);
      out.delete(sk.id);
      LINKS.get(k).to = [...out].sort();
    }
  }
  // which sheets each entry is marked on
  const sheets = new Map();
  for (const k of Object.keys(ANN.marks)) {
    const sk = splitKey(k);
    const id = sk.kind + ':' + sk.id;
    if (!sheets.has(id)) sheets.set(id, new Set());
    sheets.get(id).add(sk.levelId);
  }
  for (const [k, rec] of LINKS) {
    const sk = splitKey(k);
    rec.levels = [...(sheets.get(sk.kind + ':' + sk.id) || [])].filter(l => l !== sk.levelId).sort();
    const m = ANN.marks[k];
    if (m) {
      const any = rec.same.length || rec.rooms.length || rec.to.length || rec.levels.length;
      if (any) m.links = rec; else delete m.links;
    }
  }
  return LINKS;
}

/** Everything this mark is tied to, as one flat list of room ids. */
function linkedRooms(key) {
  const rec = LINKS.get(key);
  if (!rec) return [];
  const out = new Set([...rec.rooms, ...rec.to]);
  for (const k of rec.same) out.add(markMeta(k).roomId);
  out.delete(markMeta(key).roomId);
  return [...out];
}

// ==================================================================
//  sidebars
// ==================================================================
function renderRooms() {
  const list = $('#roomList');
  const q = S.search.trim().toLowerCase();
  let html = '', shown = 0;
  let doneCount = 0, totalRooms = 0;

  for (const lv of DATA.levels) {
    const rooms = lv.rooms.map(id => ROOMS.get(id)).filter(Boolean);
    let rows = '';
    for (const r of rooms) {
      totalRooms++;
      const pr = roomProgress(r.id);
      const complete = pr.area && pr.placed === pr.total;
      if (complete) doneCount++;
      if (S.onlyUnmarked && complete) continue;
      if (S.hideSubs && r.parent && !(q && r.id.toLowerCase().includes(q))) continue;
      if (q && !(r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
                 || (r.text || '').toLowerCase().includes(q))) continue;
      shown++;
      const cls = 'dot ' + (complete ? 'done' : (pr.area || pr.placed ? 'part' : ''));
      rows += `<div class="roomRow${r.parent ? ' sub' : ''}${r.id === S.roomId ? ' sel' : ''}" data-room="${esc(r.id)}">
        <span class="${cls}"></span>
        <span class="rid">${esc(r.id)}</span>
        <span class="rname">${esc(r.name)}</span>
        <span class="rcount">${pr.placed}/${pr.total}</span></div>`;
    }
    if (rows) html += `<div class="levelHead">${esc(lv.name)}</div>` + rows;
  }
  list.innerHTML = html || '<div class="emptyNote">Nothing matches that search.</div>';
  const pct = totalRooms ? Math.round(doneCount / totalRooms * 100) : 0;
  $('#roomProgress').style.width = pct + '%';
  $('#roomProgressText').textContent = `${doneCount} of ${totalRooms} areas fully marked · ${shown} shown`;
}

function buildTypeFilters() {
  $('#typeFilters').innerHTML = TYPE_KEYS
    .map(k => `<button data-type="${k}">${TYPES[k].ico} ${TYPES[k].label}</button>`).join('');
}

function renderFeatures() {
  const titleEl = $('#featureTitle');
  const listEl = $('#featureList');
  const r = ROOMS.get(S.roomId);
  if (!r) {
    titleEl.textContent = 'No room selected';
    listEl.innerHTML = '<div class="emptyNote">Pick a room on the left to see its doors and items.</div>';
    $('#roomText').innerHTML = '';
    return;
  }
  const pr = roomProgress(r.id);
  titleEl.innerHTML = `${esc(r.id)}. ${esc(r.name)}<small>${esc(LEVELS.get(r.level)?.name || '')}
    · ${pr.placed}/${pr.total} placed${pr.area ? ' · area marked' : ''}</small>`;
  $('#markRoomBtn').textContent =
    getMark(mid('room', r.id)) ? 'Re-mark on this map' : 'Mark room area';
  const et = edgeTarget();
  const ed = et ? areaEdges(et.shape) : [];
  const iw = wallsOf(r.id).length;
  $('#edgeTools').style.display = (ed.length || iw) ? 'flex' : 'none';
  const bits = [];
  if (ed.length) {
    const walls = ed.filter(x => x.wall).length;
    const who = et === getMark(mid('room', r.id)) ? 'outline' : (markMeta(S.sel)?.label || 'marker');
    bits.push(`${who}: ${walls} wall${walls === 1 ? '' : 's'}, ${ed.length - walls} open`);
  }
  if (iw) bits.push(`${iw} inside`);
  $('#edgeCount').textContent = bits.join(' · ');
  const on = marksOf('room', r.id).map(([k]) => splitKey(k).levelId);
  const also = [...new Set([...(r.alsoOn || []), ...on])].filter(l => l !== r.level);
  const leads = [...new Set(marksOf('room', r.id).flatMap(([k]) => (LINKS.get(k)?.to) || []))].sort();
  $('#alsoOn').innerHTML =
    (also.length
      ? 'Also on: ' + also.map(l => `<button data-golevel="${l}"${on.includes(l) ? ' class="on"' : ''}>${
          esc(LEVELS.get(l)?.name || l)}</button>`).join('')
      : '')
    + (leads.length
      ? `<span class="leadsTo">Leads to: ${leads.slice(0, 10).map(x =>
          `<button class="linkChip" data-goroom="${esc(x)}">${esc(x)}</button>`).join('')}${
          leads.length > 10 ? ` +${leads.length - 10}` : ''}</span>`
      : '');

  const feats = featuresOf(r.id);
  const filt = S.typeFilter;
  let html = '';
  for (const f of feats) {
    if (filt.size && !filt.has(f.type)) continue;
    const t = TYPES[f.type] || TYPES.note;
    const all = marksOf('feat', f.id);
    const m = all.length;
    const here = placementsOf(f.id).length;
    const byLevel = [...new Set(all.map(([k]) => splitKey(k).levelId))]
      .map(l => LEVELS.get(l)?.name || l).join(', ');
    const isTarget = S.target && S.target.kind === 'feat' && S.target.id === f.id;
    const ln = new Set();
    all.forEach(([k]) => linkedRooms(k).forEach(x => ln.add(x)));
    textTargets(f.label, r.id).forEach(x => ln.add(x));
    const twin = all.some(([k]) => (LINKS.get(k)?.same || []).length);
    const chips = [...ln].slice(0, 4).map(x =>
      `<button class="linkChip" data-goroom="${esc(x)}" title="${esc(ROOMS.get(x)?.name || x)}">${esc(x)}</button>`).join('');
    const hset = all.map(([k, mm]) => mm.height).find(h => h);
    const hchip = hset ? `<span class="hChip" title="feet above the main floor">${esc(heightText(hset))}</span>` : '';
    html += `<div class="featRow${isTarget ? ' sel' : ''}" data-feat="${esc(f.id)}">
      <span class="ico" style="color:${t.color}">${t.ico}</span>
      <span class="body"><span class="flabel">${esc(f.label)}</span>
        ${f.note ? `<span class="fnote">${esc(f.note)}</span>` : ''}
        ${chips || twin || hchip ? `<span class="flinks">${twin ? '<span class="twin" title="also marked on another room&#39;s list, at the same spot">⇄</span>' : ''}${chips}${hchip}</span>` : ''}</span>
      <span class="fside">${m ? `<span class="placed" title="${m} placed on ${byLevel}">●${
        m > 1 ? '<b>' + (here || m) + '</b>' : ''}</span>` : ''}
        <button class="ren" data-ren="${esc(f.id)}" title="Rename (or click the name again)">✎</button>
        <button class="x" data-del="${esc(f.id)}" title="Remove from list">×</button></span></div>`;
  }
  listEl.innerHTML = html || '<div class="emptyNote">No entries match the type filter. Use <b>+ Add</b> to create one.</div>';
  $('#roomText').innerHTML = mdToHtml(r.text || '');
  renderHeight();
}

async function selectRoom(id) {
  S.roomId = id;
  const r = ROOMS.get(id);
  S.target = { kind: 'room', id };
  const existing = marksOf('room', id);
  // prefer a mark on the level already showing, else follow the first one
  let go = existing.find(([k]) => splitKey(k).levelId === S.levelId);
  if (!go && existing.length) {
    await setLevel(splitKey(existing[0][0]).levelId);
    go = existing[0];
  } else if (!existing.length && r.level !== S.levelId) {
    await setLevel(r.level);
  }
  S.sel = mid('room', id);
  renderRooms(); renderFeatures();
  if (go) { centerOn(go[1].shape); hint(''); }   // leave the current tool alone
  else {
    setTool(TYPES.room.shape);
    hint(`<b>${esc(id)}. ${esc(r.name)}</b> — drag a rectangle over the room, or press <b>P</b> for a polygon.`);
  }
  needsDraw = true;
}

async function selectFeature(fid) {
  const roomId = fid.split('::')[0];
  if (roomId !== S.roomId) S.roomId = roomId;
  const f = featuresOf(roomId).find(x => x.id === fid);
  S.target = { kind: 'feat', id: fid };
  const existing = marksOf('feat', fid);
  let here = placementsOf(fid);
  if (!here.length && existing.length) {
    await setLevel(splitKey(existing[0][0]).levelId);
    here = placementsOf(fid);
  }
  const t = TYPES[f?.type] || TYPES.note;
  setTool(t.shape);                               // ready to add another
  S.sel = here.length ? here[0][0] : null;
  if (here.length) {
    centerOn(here[0][1].shape);
    hint(`<b>${esc(f.label)}</b> &mdash; ${here.length} placed. `
       + 'Draw again to add another; Select then Delete removes one.');
  } else {
    hint(t.shape === 'seg'
      ? `<b>${esc(f.label)}</b> — drag across the opening. Draw again for a second one.`
      : t.shape === 'point'
        ? `<b>${esc(f.label)}</b> — click each spot; place as many as you like.`
        : `<b>${esc(f.label)}</b> — drag a box around it.`);
  }
  renderRooms(); renderFeatures(); needsDraw = true;
}

/** Swap a row's label for an input, in place. */
function startRename(fid) {
  const rows = [...document.querySelectorAll(".featRow")];
  const row = rows.find(r => r.dataset.feat === fid);
  if (!row) return;
  const span = row.querySelector('.flabel');
  const old = span.textContent;
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'renameBox'; input.value = old;
  span.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = commit => {
    if (done) return;
    done = true;
    const v = input.value;
    if (commit) renameFeature(fid, v); else renderFeatures();
  };
  input.onkeydown = ev => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
  };
  input.onblur = () => finish(true);
  input.onclick = ev => ev.stopPropagation();
}

/** The area the edge tools act on: whatever is selected, else the room. */
function edgeTarget() {
  const sel = S.sel && getMark(S.sel);
  if (sel && isArea(sel.shape)) return sel;
  const rm = S.roomId && getMark(mid('room', S.roomId));
  return rm && isArea(rm.shape) ? rm : null;
}

function setAllEdges(v) {
  const m = edgeTarget();
  if (!m) { hint('Mark an area first, then set its edges.'); return; }
  pushHistory(v === WALL ? 'all edges to wall' : 'all edges to open');
  for (const part of m.shape.parts) part.edges = part.edges.map(() => v);
  geomVersion++; save(); renderFeatures(); needsDraw = true;
  hint(v === WALL ? 'Every edge of this outline is now a wall.'
                  : 'Every edge of this outline is now an open boundary.');
}

function centerOn(sh) {
  const pts = shapePoints(sh);
  if (!pts.length) return;
  const c = centroid(pts);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const w = Math.max(40, Math.max(...xs) - Math.min(...xs));
  const h = Math.max(40, Math.max(...ys) - Math.min(...ys));
  const want = Math.min(cw() / (w * 3), chh() / (h * 3));
  if (S.view.scale < want * 0.35 || S.view.scale > want * 6) S.view.scale = Math.min(3, want);
  S.view.tx = cw() / 2 - c[0] * S.view.scale;
  S.view.ty = chh() / 2 - c[1] * S.view.scale;
  needsDraw = true;
}

// ==================================================================
//  tools + pointer
// ==================================================================
function setTool(t) {
  S.tool = t;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  canvas.classList.toggle('drawing', t !== 'select');
  canvas.classList.toggle('edging', t === 'edges');
  if (t !== 'edges') S.hoverEdge = null;
  if (t === 'circle') {
    hint('<b>Circle.</b> Drag from the centre out to the rim. With snap on, the radius steps by '
       + 'the square; hold <b>Alt</b> for any size. Four points per square of diameter.');
  }
  if (t === 'wallseg' && S.roomId) {
    const n = wallsOf(S.roomId).length;
    hint('<b>Wall tool.</b> Drag across the room to lay a wall; Shift keeps it straight. '
       + 'Walls that meet are joined on export.' + (n ? ` ${n} already in ${esc(S.roomId)}.` : ''));
  }
  const shapey = t === 'rect' || t === 'poly' || t === 'circle';
  $('#boolMode').classList.toggle('dim', !shapey);
  needsDraw = true;
}

function setBool(mode) {
  S.boolMode = mode;
  if (mode !== 'new' && !['rect', 'poly', 'circle'].includes(S.tool)) setTool('rect');
  document.querySelectorAll('#boolMode button')
    .forEach(b => b.classList.toggle('active', b.dataset.bool === mode));
  if (mode !== 'new') {
    hint(mode === 'sub'
      ? 'Draw a shape to <b>cut it out</b> of the selected area, room or marker.'
      : 'Draw a shape to <b>add it to</b> the selected area, room or marker.');
  }
  needsDraw = true;
}

/** A wall drawn inside a room: its own object, not a checklist entry. */
function commitWall(shape) {
  if (!S.roomId) { hint('Pick a room first, then draw walls inside it.'); return; }
  const key = nextWallKey(S.roomId);
  pushHistory('draw wall in ' + S.roomId);
  setMark(key, { levelId: S.levelId, shape, kind: 'iwall' });
  S.sel = key;
  renderHeight();
  const n = wallsOf(S.roomId).length;
  hint(`Wall added to <b>${esc(S.roomId)}</b> (${n} here). Keep drawing, or press <b>V</b> to stop.`);
}

/**
 * Which mark a stroke belongs to. Rooms have one outline. A marker can have
 * any number of placements: normally a stroke starts a new one, but in add or
 * subtract mode it reshapes the placement already selected instead, so a
 * staircase or a pit can be cut about the same way a room can.
 */
function draftTargetKey(shape) {
  if (S.target.kind !== 'feat') return mid(S.target.kind, S.target.id);
  const shapey = shape.type === 'rect' || shape.type === 'poly';
  if (shapey && S.boolMode !== 'new') {
    const places = placementsOf(S.target.id);
    const sel = places.find(([k]) => k === S.sel && isArea(getMark(k).shape));
    if (sel) return sel[0];
    const last = [...places].reverse().find(([, m]) => isArea(m.shape));
    if (last) return last[0];
  }
  return nextFeatKey(S.target.id);          // each stroke is a new placement
}

function commitDraft(shape) {
  if (!S.target) { hint('Pick a room or a marker on the left first, then draw.'); return; }
  if (S.momentaryBool) { S.boolModeSaved = S.boolMode; S.boolMode = S.momentaryBool; }
  const key = draftTargetKey(shape);
  const prev = getMark(key) || {};
  const meta = markMeta(key);
  const dflt = S.target.kind === 'room' ? WALL : OPEN;
  const shapey = shape.type === 'rect' || shape.type === 'poly';
  const combining = shapey && isArea(prev.shape) && S.boolMode !== 'new';
  pushHistory((combining ? (S.boolMode === 'sub' ? 'subtract from ' : 'add to ')
                         : prev.shape ? 'redraw ' : 'place ') + meta.label);
  let finalShape;
  if (combining) {
    finalShape = prev.shape;
    applyAreaOp(finalShape, shape, S.boolMode === 'sub' ? 'sub' : 'add', dflt);
    geomVersion++;
    normalizeArea(finalShape);
  } else if (shapey) {
    finalShape = makeArea(shape, dflt);
  } else {
    finalShape = shape;
  }
  geomVersion++;
  setMark(key, Object.assign({}, prev, {
    levelId: S.levelId, shape: finalShape,
    secret: meta.type === 'secret-door',
  }));
  if (S.momentaryBool) { S.boolMode = S.boolModeSaved; S.momentaryBool = null; }
  // Stay exactly as the user left things: same target, same tool, same view.
  // Nothing here switches on its own.
  S.sel = key;
  renderHeight();
  if (S.target.kind === 'feat') {
    const n = placementsOf(S.target.id).length;
    hint(combining
      ? `<b>${esc(meta.label)}</b> &mdash; ${S.boolMode === 'sub' ? 'cut out of' : 'added to'} `
        + 'this placement. Switch back to <b>New</b> to start another one.'
      : `<b>${esc(meta.label)}</b> &mdash; ${n} placed. Draw again to add another, `
        + 'or pick the next entry on the left.');
  } else {
    const left = featuresOf(S.roomId).filter(f => !hasMark('feat', f.id)).length;
    hint(`Placed <b>${esc(meta.label)}</b>.` + (left ? ` ${left} still to place in ${esc(S.roomId)}.` : ''));
  }
}

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
  canvas.focus();
  setSnapSuspended(e.altKey);
  const sp = evPos(e);
  const wp = toWorld(sp.x, sp.y);

  // pan: middle button, right button, space held, or select tool on empty space
  const panBtn = e.button === 1 || e.button === 2 || keys.has(' ');
  if (panBtn) {
    S.drag = { mode: 'pan', sx: sp.x, sy: sp.y, tx: S.view.tx, ty: S.view.ty };
    canvas.classList.add('panning');
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;

  if (S.calibrating) {
    const p = wp;
    S.draft = { type: 'cal', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    S.drag = { mode: 'cal' };
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  if (S.tool === 'edges') {
    const tol = 12 / S.view.scale;
    let target = S.sel && getMark(S.sel);
    let hit = target && isArea(target.shape) ? nearestAreaEdge(target.shape, wp, tol) : null;
    if (!hit) {                                   // fall back to any area under the cursor
      for (const [k, mm] of marksOnLevel()) {
        if (!isArea(mm.shape)) continue;
        const h = nearestAreaEdge(mm.shape, wp, tol);
        if (h) { target = mm; S.sel = k; hit = h; break; }
      }
    }
    if (!hit) {                                   // nothing under the cursor: pan instead
      hint('Click an outline edge to switch it between wall and open.');
      S.drag = { mode: 'pan', sx: sp.x, sy: sp.y, tx: S.view.tx, ty: S.view.ty };
      canvas.classList.add('panning');
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const part = target.shape.parts[hit.pi];
    pushHistory((part.edges[hit.i] === OPEN ? 'wall edge' : 'open edge'));
    part.edges[hit.i] = part.edges[hit.i] === OPEN ? WALL : OPEN;
    geomVersion++; save(); renderFeatures(); needsDraw = true;
    hint(part.edges[hit.i] === WALL
      ? 'Edge set to <b>wall</b>: it will block line of sight.'
      : 'Edge set to <b>open</b>: it marks the area but blocks nothing.');
    return;
  }

  const sp2 = snap(wp);

  if ((e.ctrlKey || e.metaKey) &&
      (S.tool === 'rect' || S.tool === 'poly' || S.tool === 'circle'))
    S.momentaryBool = 'sub';
  if (S.tool === 'rect') {
    S.draft = { type: 'rect', x: sp2.x, y: sp2.y, w: 0, h: 0, ox: sp2.x, oy: sp2.y };
    S.drag = { mode: 'rect' }; canvas.setPointerCapture(e.pointerId); return;
  }
  if (S.tool === 'circle') {
    S.draft = { type: 'circle', cx: sp2.x, cy: sp2.y, r: 0, raw: 0 };
    S.drag = { mode: 'circle' }; canvas.setPointerCapture(e.pointerId); return;
  }
  if (S.tool === 'seg' || S.tool === 'wallseg') {
    S.draft = { type: 'seg', x1: sp2.x, y1: sp2.y, x2: sp2.x, y2: sp2.y,
                wall: S.tool === 'wallseg' };
    S.drag = { mode: 'seg' }; canvas.setPointerCapture(e.pointerId); return;
  }
  if (S.tool === 'point') {
    commitDraft({ type: 'point', x: sp2.x, y: sp2.y });
    return;
  }
  if (S.tool === 'poly') {
    if (!S.draft || S.draft.type !== 'poly') S.draft = { type: 'poly', pts: [] };
    const first = S.draft.pts[0];
    if (first && S.draft.pts.length > 2 && Math.hypot(sp2.x - first[0], sp2.y - first[1]) < 12 / S.view.scale) {
      finishPoly(); return;
    }
    S.draft.pts.push([sp2.x, sp2.y]);
    needsDraw = true; return;
  }

  // select tool -------------------------------------------------
  const tol = 6 / S.view.scale;
  // 1. handle of the selected mark
  const selMark = S.sel && getMark(S.sel);
  if (selMark) {
    const pts = shapePoints(selMark.shape);
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(wp.x - pts[i][0], wp.y - pts[i][1]) <= 8 / S.view.scale) {
        S.drag = { mode: 'handle', key: S.sel, i, pending: 'reshape ' + markMeta(S.sel).label };
        canvas.setPointerCapture(e.pointerId); return;
      }
    }
  }
  // 2. any mark body (features before rooms so small things win)
  const entries = marksOnLevel().sort((a, b) => (a[0].startsWith('room:') ? 1 : 0) - (b[0].startsWith('room:') ? 1 : 0));
  for (const [key, m] of entries) {
    if (hitShape(m.shape, wp, tol)) {
      S.sel = key;
      const meta0 = markMeta(key);
      const sk = splitKey(key);
      if (sk.kind === 'room') { S.roomId = sk.id; S.target = { kind: 'room', id: sk.id }; }
      else { S.roomId = sk.id.split('::')[0]; S.target = { kind: 'feat', id: sk.id }; }
      renderRooms(); renderFeatures();
      S.drag = { mode: 'move', key, lx: wp.x, ly: wp.y, pending: 'move ' + meta0.label };
      canvas.setPointerCapture(e.pointerId);
      needsDraw = true; return;
    }
  }
  // 3. empty space -> pan
  S.drag = { mode: 'pan', sx: sp.x, sy: sp.y, tx: S.view.tx, ty: S.view.ty };
  canvas.classList.add('panning');
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  setSnapSuspended(e.altKey);
  const sp = evPos(e);
  const wp = toWorld(sp.x, sp.y);
  const g = grid();
  $('#coords').textContent =
    `${Math.round(wp.x)}, ${Math.round(wp.y)} px · col ${Math.floor((wp.x - g.offsetX) / g.size)}, row ${Math.floor((wp.y - g.offsetY) / g.size)}`;

  const d = S.drag;
  if (!d) {
    if (S.draft && S.draft.type === 'poly') { S.draft.cursor = [snap(wp).x, snap(wp).y]; needsDraw = true; }
    if (S.tool === 'edges') {
      const m = S.sel && getMark(S.sel);
      const h = m && isArea(m.shape) ? nearestAreaEdge(m.shape, wp, 12 / S.view.scale) : null;
      const changed = JSON.stringify(h) !== JSON.stringify(S.hoverEdge);
      S.hoverEdge = h;
      if (changed) needsDraw = true;
    } else if (S.hoverEdge) { S.hoverEdge = null; needsDraw = true; }
    return;
  }
  if (d.mode === 'pan') {
    S.view.tx = d.tx + (sp.x - d.sx);
    S.view.ty = d.ty + (sp.y - d.sy);
    needsDraw = true; return;
  }
  const s = snap(wp);
  if (d.mode === 'rect') {
    const dr = S.draft;
    dr.x = Math.min(dr.ox, s.x); dr.y = Math.min(dr.oy, s.y);
    dr.w = Math.abs(s.x - dr.ox); dr.h = Math.abs(s.y - dr.oy);
    needsDraw = true;
  } else if (d.mode === 'circle') {
    const dr = S.draft;
    dr.raw = Math.hypot(wp.x - dr.cx, wp.y - dr.cy);
    dr.r = snapRadius(dr.raw);
    needsDraw = true;
  } else if (d.mode === 'seg') {
    let p = s;
    if (keys.has('Shift')) {
      const dx = Math.abs(p.x - S.draft.x1), dy = Math.abs(p.y - S.draft.y1);
      p = dx > dy ? { x: p.x, y: S.draft.y1 } : { x: S.draft.x1, y: p.y };
    }
    S.draft.x2 = p.x; S.draft.y2 = p.y; needsDraw = true;
  } else if (d.mode === 'cal') {
    S.draft.x2 = wp.x; S.draft.y2 = wp.y; needsDraw = true;
  } else if (d.mode === 'handle') {
    const m = getMark(d.key);
    if (d.pending) { pushHistory(d.pending); d.pending = null; }
    setShapePoint(m.shape, d.i, s.x, s.y);
    geomVersion++; needsDraw = true; save();
  } else if (d.mode === 'move') {
    const m = getMark(d.key);
    if (Math.abs(wp.x - d.lx) < 1e-9 && Math.abs(wp.y - d.ly) < 1e-9) return;
    if (d.pending) { pushHistory(d.pending); d.pending = null; }
    moveShape(m.shape, wp.x - d.lx, wp.y - d.ly);
    d.lx = wp.x; d.ly = wp.y;
    geomVersion++; needsDraw = true; save();
  }
});

canvas.addEventListener('pointerup', e => {
  const d = S.drag;
  canvas.classList.remove('panning');
  S.drag = null;
  if (!d) return;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  if (d.mode === 'rect') {
    const dr = S.draft; S.draft = null;
    if (dr.w > 2 && dr.h > 2) commitDraft({ type: 'rect', x: dr.x, y: dr.y, w: dr.w, h: dr.h });
    needsDraw = true;
  } else if (d.mode === 'circle') {
    const dr = S.draft; S.draft = null;
    if (dr.raw > 2 && dr.r > 2) {
      commitDraft({ type: 'poly', pts: circleRing(dr.cx, dr.cy, dr.r, grid().size) });
    }
    needsDraw = true;
  } else if (d.mode === 'seg') {
    const dr = S.draft; S.draft = null;
    const shape = { type: 'seg', x1: dr.x1, y1: dr.y1, x2: dr.x2, y2: dr.y2 };
    if (Math.hypot(dr.x2 - dr.x1, dr.y2 - dr.y1) > 2) {
      if (dr.wall) commitWall(shape); else commitDraft(shape);
    }
    needsDraw = true;
  } else if (d.mode === 'cal') {
    const dr = S.draft; S.draft = null;
    finishCalibrate(dr);
  }
});

canvas.addEventListener('dblclick', () => { if (S.draft && S.draft.type === 'poly') finishPoly(); });

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const sp = evPos(e);
  zoomAt(sp.x, sp.y, Math.pow(0.9988, e.deltaY * (e.deltaMode === 1 ? 16 : 1)));
}, { passive: false });

function finishPoly() {
  const d = S.draft; S.draft = null;
  if (d && d.pts.length >= 3) commitDraft({ type: 'poly', pts: d.pts });
  needsDraw = true;
}

// ------------------------------------------------------------------ keys
const keys = new Set();

function setSnapSuspended(on) {
  if (S.snapSuspended === on) return;
  S.snapSuspended = on;
  $('#snapMode').classList.toggle('suspended', on);
  $('#snapHint').textContent = on ? 'off while Alt is held' : '';
  needsDraw = true;
}

window.addEventListener('keyup', e => {
  keys.delete(e.key);
  if (e.key === 'Alt' || !e.altKey) setSnapSuspended(false);
});
// if focus leaves mid-press the keyup never arrives, so drop the hold
window.addEventListener('blur', () => setSnapSuspended(false));
window.addEventListener('keydown', e => {
  keys.add(e.key);
  if (e.key === 'Alt') {
    e.preventDefault();          // stop Alt reaching the browser menu bar
    setSnapSuspended(true);
  }
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  // Ctrl/Cmd+Z anywhere except a text field, where the browser's own undo wins
  if ((e.ctrlKey || e.metaKey) && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (k === 'y') { e.preventDefault(); redo(); return; }
  }
  if (typing) return;
  if (e.key === ' ') { e.preventDefault(); return; }

  if ($('#gridDialog').open && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    pushHistory('grid nudge', 'grid:' + S.levelId);
    const g = grid();
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft') g.offsetX -= step;
    if (e.key === 'ArrowRight') g.offsetX += step;
    if (e.key === 'ArrowUp') g.offsetY -= step;
    if (e.key === 'ArrowDown') g.offsetY += step;
    syncGridDialog(); save(); needsDraw = true; return;
  }

  const map = { v: 'select', r: 'rect', c: 'circle', p: 'poly', d: 'seg',
                t: 'point', e: 'edges', w: 'wallseg' };
  if (map[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) { setTool(map[e.key.toLowerCase()]); return; }
  if (e.key === 'Escape') { S.draft = null; S.calibrating = false; hint(''); needsDraw = true; return; }
  if (e.key === 'Enter' && S.draft && S.draft.type === 'poly') { finishPoly(); return; }
  if (e.key === 'Backspace' && S.draft && S.draft.type === 'poly') { S.draft.pts.pop(); needsDraw = true; return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) {
    e.preventDefault();
    pushHistory('delete ' + markMeta(S.sel).label);
    setMark(S.sel, null);
    return;
  }
  if (e.key === 'g') { S.showGrid = !S.showGrid; $('#showGrid').checked = S.showGrid; needsDraw = true; }
  if (e.key === '1') setBool('new');
  if (e.key === '2') setBool('add');
  if (e.key === '3') setBool('sub');
  if (e.key === 'f') fitView();
});

// ==================================================================
//  grid calibration
// ==================================================================
function finishCalibrate(d) {
  S.calibrating = false;
  canvas.classList.remove('drawing');
  if (!d) return;
  const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
  if (len < 10) { hint('Calibration line was too short.'); return; }
  const n = prompt('How many grid squares did that line cross?', '5');
  const count = parseFloat(n);
  if (!count || count <= 0) return;
  pushHistory('grid calibration');
  const g = grid();
  g.size = +(len / count).toFixed(3);
  // align the grid to the start of the line
  g.offsetX = +(((d.x1 % g.size) + g.size) % g.size).toFixed(2);
  g.offsetY = +(((d.y1 % g.size) + g.size) % g.size).toFixed(2);
  g.calibrated = true;
  syncGridDialog(); save(); needsDraw = true;
  hint(`Grid set to <b>${g.size} px</b> per square. Nudge the offsets with the arrow keys if the lines sit slightly off.`);
}

function syncGridDialog() {
  if (!$('#gridSize')) return;
  const g = grid();
  $('#gridSize').value = g.size;
  $('#gridFeet').value = g.feetPerSquare;
  $('#gridOffX').value = +g.offsetX.toFixed(2);
  $('#gridOffY').value = +g.offsetY.toFixed(2);
  $('#gridLevelName').textContent = '· ' + LEVELS.get(S.levelId).name;
}

// ==================================================================
//  export
// ==================================================================
// ---- portals, and the holes they leave in the walls ----------------------

const PORTAL_RANK = { 'secret-door': 3, door: 2, window: 1 };
// A portal starts open only when the text says there is nothing in the opening.
const NO_LEAF = /gaping|door gone|no door|doorless|hanging open/i;
const ARCH = /archway|arched opening|open arch/i;
const HAS_LEAF = /doors? in|iron doors?|wooden doors?|slab door|oak door|double doors?|portcullis/i;
const opensClear = label =>
  NO_LEAF.test(label) || (ARCH.test(label) && !HAS_LEAF.test(label));

/** Do two door marks describe the same opening? */
function portalsOverlap(k, c, ppg) {
  const pa = k.fromPoint ? k.at : [(k.a[0]+k.b[0])/2, (k.a[1]+k.b[1])/2];
  const pb = c.fromPoint ? c.at : [(c.a[0]+c.b[0])/2, (c.a[1]+c.b[1])/2];
  const gap = Math.hypot(pa[0]-pb[0], pa[1]-pb[1]);
  if (gap > ppg * 0.5) return false;
  if (gap < ppg * 0.15) return true;              // right on top of each other
  const sameAngle = () => {
    if (k.fromPoint || c.fromPoint) return true;          // a point beside a line
    const ang = s => Math.atan2(s.b[1]-s.a[1], s.b[0]-s.a[0]);
    const d = Math.abs(ang(k) - ang(c)) % Math.PI;
    return Math.min(d, Math.PI - d) < 0.35;
  };
  if (!sameAngle()) return false;
  if (k.meta.type === c.meta.type) return true;
  // a door and a window drawn on the very same line are one opening described
  // twice, from either side; further apart they are two different things
  return gap < ppg * 0.15;
}

/** Fold a duplicate into the portal already found, keeping the longer span. */
function mergePortal(k, c) {
  k.keys.push(...c.keys);
  if (!c.fromPoint) {
    const lk = k.a ? Math.hypot(k.b[0]-k.a[0], k.b[1]-k.a[1]) : 0;
    const lc = Math.hypot(c.b[0]-c.a[0], c.b[1]-c.a[1]);
    if (lc > lk || k.fromPoint) { k.a = c.a; k.b = c.b; k.fromPoint = false; }
  }
  if ((PORTAL_RANK[c.meta.type] || 0) > (PORTAL_RANK[k.meta.type] || 0)) k.meta = c.meta;
}

/** The wall a loose point belongs to, with the foot of the perpendicular. */
function nearestWallTo(walls, pt, tol) {
  let best = null;
  for (const w of walls) {
    const dx = w.b[0]-w.a[0], dy = w.b[1]-w.a[1];
    const L2 = dx*dx + dy*dy;
    if (L2 < 1) continue;
    let t = ((pt[0]-w.a[0])*dx + (pt[1]-w.a[1])*dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const fx = w.a[0] + dx*t, fy = w.a[1] + dy*t;
    const d = Math.hypot(pt[0]-fx, pt[1]-fy);
    if (d <= tol && (!best || d < best.d)) {
      const L = Math.sqrt(L2);
      best = { d, wall: w, foot: [fx, fy], ux: dx/L, uy: dy/L };
    }
  }
  return best;
}

/**
 * Break each wall where a portal crosses it, so a door is a real gap in the
 * line of sight rather than a door drawn on top of a solid wall.
 */
function openWallsAtPortals(walls, portals, ppg) {
  const out = [];
  const near = ppg * 0.30;                 // how far off the line a door may sit
  const pad = ppg * 0.04;                  // a hair either side, so no sliver is left
  for (const w of walls) {
    const dx = w.b[0]-w.a[0], dy = w.b[1]-w.a[1];
    const L = Math.hypot(dx, dy);
    if (L < 0.5) continue;
    const ux = dx/L, uy = dy/L;
    const cuts = [];
    for (const p of portals) {
      if (!p.a || !p.b) continue;
      const pang = Math.atan2(p.b[1]-p.a[1], p.b[0]-p.a[0]);
      const wang = Math.atan2(dy, dx);
      let da = Math.abs(pang - wang) % Math.PI;
      if (Math.min(da, Math.PI - da) > 0.45) continue;     // crossing, not lying along
      const ts = [];
      let far = false;
      for (const q of [p.a, p.b]) {
        const t = ((q[0]-w.a[0])*ux + (q[1]-w.a[1])*uy);
        const perp = Math.abs(-(q[0]-w.a[0])*uy + (q[1]-w.a[1])*ux);
        if (perp > near) far = true;
        ts.push(t);
      }
      if (far) continue;
      let t0 = Math.min(ts[0], ts[1]) - pad, t1 = Math.max(ts[0], ts[1]) + pad;
      if (t1 <= 0 || t0 >= L) continue;
      cuts.push([Math.max(0, t0), Math.min(L, t1)]);
    }
    if (!cuts.length) { out.push(w); continue; }
    cuts.sort((a, b) => a[0] - b[0]);
    let at = 0;
    const keep = [];
    for (const [c0, c1] of cuts) {
      if (c0 > at) keep.push([at, c0]);
      at = Math.max(at, c1);
    }
    if (at < L) keep.push([at, L]);
    for (const [s0, s1] of keep) {
      if (s1 - s0 < 1.5) continue;
      out.push({ a: [w.a[0]+ux*s0, w.a[1]+uy*s0], b: [w.a[0]+ux*s1, w.a[1]+uy*s1], src: w.src });
    }
  }
  return out;
}

async function runExport() {
  const status = $('#expStatus');
  const which = $('#expLevel').value;
  const scale = parseFloat($('#expScale').value);
  const wantLos = $('#expLos').checked;
  const wantLights = $('#expLights').checked;
  const player = $('#expPlayer').checked;
  const sub = parseInt($('#expGrid').value, 10) || 1;

  const ids = which === '*'
    ? DATA.levels.filter(l => Object.values(ANN.marks).some(m => m.levelId === l.id)).map(l => l.id)
    : [which];
  if (!ids.length) { status.textContent = 'Nothing marked yet.'; return; }

  $('#expRun').disabled = true;
  for (const id of ids) {
    status.textContent = 'Building ' + LEVELS.get(id).name + '…';
    try { await exportLevel(id, scale, wantLos, wantLights, player, sub); }
    catch (err) { status.textContent = 'Failed on ' + id + ': ' + err.message; $('#expRun').disabled = false; return; }
  }
  status.textContent = `Wrote ${ids.length} file${ids.length > 1 ? 's' : ''} to the exports folder.`;
  $('#expRun').disabled = false;
}

async function exportLevel(levelId, scale, wantLos, wantLights, player, sub) {
  const lv = LEVELS.get(levelId);
  const g = grid(levelId);
  const ppg = g.size;
  sub = sub || 1;                       // 2 splits each 10 ft square into 5 ft cells
  const unit = ppg / sub;

  // crop to whole squares so the exported grid starts at 0,0
  const cx = ((g.offsetX % ppg) + ppg) % ppg;
  const cy = ((g.offsetY % ppg) + ppg) % ppg;
  const cols = Math.floor((lv.width - cx) / ppg) * sub;
  const rows = Math.floor((lv.height - cy) / ppg) * sub;
  const cwpx = cols * unit, chpx = rows * unit;

  const W = x => (x - cx) / unit;
  const H = y => (y - cy) / unit;

  const marks = Object.entries(ANN.marks).filter(([, m]) => m.levelId === levelId);
  const PORTAL_KINDS = ['door', 'secret-door', 'window'];

  // ---------------------------------------------------------------- portals
  // A door between two rooms is usually on both rooms' checklists, so the same
  // doorway is marked twice. Cluster the marks that sit on top of one another
  // and export one portal for each real opening.
  const cand = [];
  for (const [key, m] of marks) {
    const meta = markMeta(key);
    if (!PORTAL_KINDS.includes(meta.type)) continue;
    const sh = m.shape;
    if (!sh) continue;
    if (sh.type === 'seg') {
      cand.push({ keys: [key], meta, a: [sh.x1, sh.y1], b: [sh.x2, sh.y2], fromPoint: false });
    } else if (sh.type === 'point') {
      cand.push({ keys: [key], meta, at: [sh.x, sh.y], fromPoint: true });
    } else if (isArea(sh) || sh.type === 'poly' || sh.type === 'rect') {
      const pts = shapePoints(sh);
      let best = null;                    // the longest span across the shape
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (!best || d > best.d) best = { d, a: pts[i], b: pts[j] };
      }
      if (best) cand.push({ keys: [key], meta, a: best.a, b: best.b, fromPoint: false });
    }
  }
  const clusters = [];
  for (const c of cand) {
    const hit = clusters.find(k => portalsOverlap(k, c, ppg));
    if (hit) mergePortal(hit, c); else clusters.push(c);
  }

  // ------------------------------------------------------------------ walls
  // every stretch of outline flagged as a wall, plus the walls drawn inside
  const rawWalls = [];
  if (wantLos) {
    for (const [key, m] of marks) {
      const meta = markMeta(key);
      if (isArea(m.shape)) {
        for (const sg of areaBoundary(m.shape)) {
          if (sg.wall) rawWalls.push({ a: sg.a, b: sg.b, src: key });
        }
      } else if (meta.type === 'wall' && m.shape.type === 'seg') {
        rawWalls.push({ a: [m.shape.x1, m.shape.y1], b: [m.shape.x2, m.shape.y2], src: key });
      }
    }
  }

  // a point marked as a door, window or arrow slit belongs to the wall it sits
  // against: give it a narrow opening there, lined up with that wall
  for (const c of clusters) {
    if (!c.fromPoint) continue;
    const host = nearestWallTo(rawWalls, c.at, ppg * 0.9);
    const w = c.meta.type === 'door' ? ppg * 0.5 : ppg * 0.25;   // 5 ft, or 2.5 ft for a slit
    if (host) {
      const [hx, hy] = host.foot;
      c.a = [hx - host.ux * w / 2, hy - host.uy * w / 2];
      c.b = [hx + host.ux * w / 2, hy + host.uy * w / 2];
      c.onWall = true;
    } else {                                   // nothing to sit in: keep it square on
      c.a = [c.at[0] - w / 2, c.at[1]];
      c.b = [c.at[0] + w / 2, c.at[1]];
    }
  }

  // walls give way where a portal crosses them
  const cutWalls = wantLos ? openWallsAtPortals(rawWalls, clusters, ppg) : [];

  window.__export = { levelId, ppg, clusters, rawWalls, cutWalls };   // for tests
  const portals = clusters.map(c => {
    const a = { x: +W(c.a[0]).toFixed(4), y: +H(c.a[1]).toFixed(4) };
    const b = { x: +W(c.b[0]).toFixed(4), y: +H(c.b[1]).toFixed(4) };
    return {
      position: { x: +((a.x + b.x) / 2).toFixed(4), y: +((a.y + b.y) / 2).toFixed(4) },
      bounds: [a, b],
      rotation: +Math.atan2(b.y - a.y, b.x - a.x).toFixed(5),
      // an archway or a doorway with the door gone is a hole in the wall, so it
      // starts open; a window is see-through either way
      closed: c.meta.type !== 'window' && !opensClear(c.meta.label || ''),
      freestanding: false,
    };
  });

  const los = [];
  if (wantLos) {
    los.push(...chainSegments(cutWalls.map(w => [
      { x: +W(w.a[0]).toFixed(4), y: +H(w.a[1]).toFixed(4) },
      { x: +W(w.b[0]).toFixed(4), y: +H(w.b[1]).toFixed(4) }])));
  }

  // ------------------------------------------------------------------ notes
  const lights = [], notes = [];
  for (const [key, m] of marks) {
    const meta = markMeta(key);
    const pts = shapePoints(m.shape).map(p => ({ x: +W(p[0]).toFixed(4), y: +H(p[1]).toFixed(4) }));
    const rec = LINKS.get(key);
    const ci = clusters.findIndex(c => c.keys.includes(key));
    const note = {
      id: key, kind: meta.type, label: meta.label, room: meta.roomId,
      roomName: ROOMS.get(meta.roomId)?.name || null,
      shape: m.shape.type, points: pts,
      height: heightOf(key, m),
      links: rec ? {
        sameAs: rec.same, rooms: rec.rooms, leadsTo: rec.to, alsoOnSheets: rec.levels,
      } : undefined,
      portal: ci >= 0 ? ci : undefined,
    };
    if (isArea(m.shape)) {
      note.parts = m.shape.parts.map(part => ({
        op: part.op,
        ring: part.ring.map(p => ({ x: +W(p[0]).toFixed(4), y: +H(p[1]).toFixed(4) })),
        edges: part.edges.map(v => (v === OPEN ? 'open' : 'wall')),
      }));
      note.boundary = areaBoundary(m.shape).map(sg => ({
        wall: !!sg.wall,
        a: { x: +W(sg.a[0]).toFixed(4), y: +H(sg.a[1]).toFixed(4) },
        b: { x: +W(sg.b[0]).toFixed(4), y: +H(sg.b[1]).toFixed(4) },
      }));
    }
    notes.push(note);
    if (wantLights && meta.type === 'light' && m.shape.type === 'point') {
      lights.push({ position: pts[0], range: 4, intensity: 1, color: 'ffd89b', shadows: true });
    }
  }
  const portalNotes = clusters.map((c, i) => ({
    index: i, kind: c.meta.type, label: c.meta.label,
    fromMarks: c.keys,
    rooms: [...new Set(c.keys.flatMap(k => (LINKS.get(k)?.rooms || [])))].sort(),
    leadsTo: [...new Set(c.keys.flatMap(k => (LINKS.get(k)?.to || [])))].sort(),
    height: c.keys.map(k => heightOf(k, ANN.marks[k])).find(h => h) || null,
    narrow: !!c.fromPoint,
    bounds: [{ x: +W(c.a[0]).toFixed(4), y: +H(c.a[1]).toFixed(4) },
             { x: +W(c.b[0]).toFixed(4), y: +H(c.b[1]).toFixed(4) }],
  }));

  const ppgOut = scale > 0 ? Math.max(8, Math.round(unit * scale)) : Math.round(unit);
  let image = '';
  if (scale > 0) {
    const src = await loadImage(mapUrl(lv, player));
    const off = document.createElement('canvas');
    off.width = cols * ppgOut;
    off.height = rows * ppgOut;
    const c = off.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(src, cx, cy, cwpx, chpx, 0, 0, off.width, off.height);
    image = off.toDataURL('image/png').split(',')[1];
  }

  const uvtt = {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: cols, y: rows },
      pixels_per_grid: ppgOut,
    },
    line_of_sight: los,
    objects_line_of_sight: [],
    portals,
    environment: { baked_lighting: true, ambient_light: 'ffffffff' },
    lights,
    image,
  };

  const base = 'castle-ravenloft-' + levelId + (sub > 1 ? '-5ft' : '') + (player ? '-player' : '');
  await post(base + '.dd2vtt', JSON.stringify(uvtt));
  await post(base + '-notes.json', JSON.stringify({
    level: lv.name, levelId,
    feetPerSquare: g.feetPerSquare / sub,
    sourcePixelsPerDrawnSquare: ppg, exportPixelsPerCell: unit,
    cropX: cx, cropY: cy, columns: cols, rows,
    groundElevationFeet: 0, levelElevationFeet: levelElevation(levelId),
    markers: notes, portals: portalNotes,
  }, null, 1));
}

/** Join segments that share an endpoint into longer polylines. */
function chainSegments(segs) {
  const key = p => p.x.toFixed(4) + ',' + p.y.toFixed(4);
  const left = segs.slice();
  const out = [];
  while (left.length) {
    const line = left.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        const head = key(line[0]), tail = key(line[line.length - 1]);
        if (key(s[0]) === tail) { line.push(s[1]); }
        else if (key(s[1]) === tail) { line.push(s[0]); }
        else if (key(s[1]) === head) { line.unshift(s[0]); }
        else if (key(s[0]) === head) { line.unshift(s[1]); }
        else continue;
        left.splice(i, 1); grew = true; break;
      }
    }
    out.push(line);
  }
  return out;
}

function post(filename, text) {
  return fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, text }),
  }).then(r => { if (!r.ok) throw new Error('server refused ' + filename); });
}

// ==================================================================
//  wiring
// ==================================================================
function wire() {
  new ResizeObserver(resize).observe(canvas);
  resize();

  $('#levelSelect').onchange = e => { setLevel(e.target.value, true); };
  $('#playerMap').onchange = e => { S.playerMap = e.target.checked; setLevel(S.levelId); };
  $('#showGrid').onchange = e => { S.showGrid = e.target.checked; needsDraw = true; };
  $('#snapMode').onchange = e => { S.snap = e.target.value; };

  document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  document.querySelectorAll('#boolMode button')
    .forEach(b => b.onclick = () => setBool(b.dataset.bool));
  const readH = () => {
    const key = S.sel && ANN.marks[S.sel] ? S.sel : null;
    if (!key) return;
    const fv = $('#hFrom').value.trim(), tv = $('#hTo').value.trim();
    if (fv === '' && tv === '') { setHeight(key, null, null); return; }
    const a = fv === '' ? floorUnder(key, ANN.marks[key]) : Number(fv);
    const b = tv === '' ? null : Number(tv);
    if (Number.isNaN(a) || (b !== null && Number.isNaN(b))) return;
    setHeight(key, a, b);
  };
  $('#hFrom').onchange = readH;
  $('#hTo').onchange = readH;
  $('#hFrom').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); };
  $('#hTo').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); };
  $('#hClear').onclick = () => {
    const key = S.sel && ANN.marks[S.sel] ? S.sel : null;
    if (key) { $('#hFrom').value = ''; $('#hTo').value = ''; setHeight(key, null, null); }
  };
  // ---- panes you can drag wider ----
  const WIDTHS = { rooms: '--w-rooms', feats: '--w-feats' };
  const LIMITS = { rooms: [170, 520], feats: [220, 720] };
  const layout = $('#layout');
  for (const [name, v] of Object.entries(WIDTHS)) {
    const saved = localStorage.getItem('cr.w.' + name);
    if (saved) layout.style.setProperty(v, saved + 'px');
  }
  layout.querySelectorAll('.splitter').forEach(sp => {
    sp.addEventListener('pointerdown', e => {
      const name = sp.dataset.grip;
      const v = WIDTHS[name], [lo, hi] = LIMITS[name];
      const start = e.clientX;
      const from = parseFloat(getComputedStyle(layout).getPropertyValue(v));
      sp.classList.add('on');
      document.body.classList.add('resizing');
      sp.setPointerCapture(e.pointerId);
      const move = ev => {
        const w = Math.max(lo, Math.min(hi, from + (ev.clientX - start)));
        layout.style.setProperty(v, w + 'px');
        localStorage.setItem('cr.w.' + name, Math.round(w));
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
      layout.style.removeProperty(WIDTHS[sp.dataset.grip]);
      localStorage.removeItem('cr.w.' + sp.dataset.grip);
      resize();
    });
  });
  new ResizeObserver(() => resize()).observe($('#mapPane'));

  $('#allWalls').onclick = () => setAllEdges(WALL);
  $('#allOpen').onclick = () => setAllEdges(OPEN);

  $('#roomSearch').oninput = e => { S.search = e.target.value; renderRooms(); };
  $('#onlyUnmarked').onchange = e => { S.onlyUnmarked = e.target.checked; renderRooms(); };
  $('#hideSubs').onchange = e => { S.hideSubs = e.target.checked; renderRooms(); };

  $('#roomList').onclick = e => {
    const row = e.target.closest('[data-room]');
    if (row) selectRoom(row.dataset.room);
  };

  let lastClick = { id: null, at: 0 };

  $('#alsoOn').onclick = e => {
    const go = e.target.closest('[data-goroom]');
    if (go) { selectRoom(go.dataset.goroom); return; }
    const b = e.target.closest('[data-golevel]');
    if (b) setLevel(b.dataset.golevel).then(() => { renderFeatures(); needsDraw = true; });
  };

  $('#featureList').onclick = e => {
    const go = e.target.closest('[data-goroom]');
    if (go) { e.stopPropagation(); selectRoom(go.dataset.goroom); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const fid = del.dataset.del;
      const gone = featuresOf(S.roomId).find(f => f.id === fid);
      pushHistory('remove "' + (gone ? gone.label : fid) + '"');
      const custom = ANN.customFeatures[S.roomId] || [];
      const ci = custom.findIndex(f => f.id === fid);
      if (ci >= 0) custom.splice(ci, 1);
      else if (!ANN.hiddenFeatures.includes(fid)) ANN.hiddenFeatures.push(fid);
      marksOf('feat', fid).forEach(([k]) => delete ANN.marks[k]);
      save(); renderFeatures(); renderRooms(); needsDraw = true;
      return;
    }
    const ren = e.target.closest('[data-ren]');
    if (ren) { e.stopPropagation(); startRename(ren.dataset.ren); return; }
    const row = e.target.closest('[data-feat]');
    if (!row) return;
    const now = Date.now();
    if (lastClick.id === row.dataset.feat && now - lastClick.at < 450) {
      lastClick = { id: null, at: 0 };
      startRename(row.dataset.feat);
      return;
    }
    lastClick = { id: row.dataset.feat, at: now };
    selectFeature(row.dataset.feat);
  };
  // The first click re-renders the list, so the row the browser would fire
  // dblclick on is already detached; the click handler above pairs them by hand.

  $('#typeFilters').onclick = e => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    const t = b.dataset.type;
    S.typeFilter.has(t) ? S.typeFilter.delete(t) : S.typeFilter.add(t);
    b.classList.toggle('on');
    renderFeatures();
  };

  $('#markRoomBtn').onclick = () => {
    if (!S.roomId) return;
    S.target = { kind: 'room', id: S.roomId };
    S.sel = mid('room', S.roomId);
    setTool('rect');
    hint(`<b>${esc(S.roomId)}</b> — drag a rectangle over the room, or press <b>P</b> to trace a polygon.`);
    renderFeatures();
  };

  $('#textToggle').onclick = () => $('.textSplit').classList.toggle('open');

  // add-feature dialog
  $('#addFeatureBtn').onclick = () => {
    if (!S.roomId) return;
    $('#addRoomName').textContent = S.roomId;
    $('#addLabel').value = ''; $('#addNote').value = '';
    $('#addDialog').showModal();
    $('#addLabel').focus();
  };
  $('#addCancel').onclick = () => $('#addDialog').close();
  $('#addSave').onclick = () => {
    const label = $('#addLabel').value.trim();
    if (!label) { $('#addLabel').focus(); return; }
    pushHistory('add "' + label + '"');
    const list = ANN.customFeatures[S.roomId] ||= [];
    const f = {
      id: `${S.roomId}::c${Date.now().toString(36)}`,
      type: $('#addType').value, label, note: $('#addNote').value.trim(), auto: false,
    };
    list.push(f);
    save(); renderFeatures(); renderRooms();
    $('#addDialog').close();
    selectFeature(f.id);
  };

  // grid dialog
  $('#gridBtn').onclick = () => {
    syncGridDialog();
    $('#gridDialog').show();
    // the dialog autofocuses its first number field, which would swallow the
    // arrow keys that are meant to nudge the grid
    if (document.activeElement) document.activeElement.blur();
    canvas.focus();
  };
  $('#gridClose').onclick = () => $('#gridDialog').close();
  for (const [sel, key] of [['#gridSize', 'size'], ['#gridFeet', 'feetPerSquare'], ['#gridOffX', 'offsetX'], ['#gridOffY', 'offsetY']]) {
    $(sel).oninput = e => {
      const v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      pushHistory('grid change', 'grid:' + S.levelId);
      grid()[key] = v; save(); needsDraw = true;
    };
  }
  $('#calibrateBtn').onclick = () => {
    S.calibrating = true;
    canvas.classList.add('drawing');
    hint('<b>Calibrating:</b> drag a line along a straight run of grid squares, then say how many you crossed. Esc cancels.');
  };

  // export dialog
  $('#exportBtn').onclick = () => {
    const sel = $('#expLevel');
    sel.innerHTML = '<option value="*">All levels with markers</option>' +
      DATA.levels.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    $('#expStatus').textContent = '';
    $('#exportDialog').showModal();
  };
  $('#expCancel').onclick = () => $('#exportDialog').close();
  $('#expRun').onclick = runExport;

  $('#undoBtn').onclick = undo;
  $('#redoBtn').onclick = redo;
  updateHistoryUI();

  $('#zoomIn').onclick = () => zoomAt(cw() / 2, chh() / 2, 1.25);
  $('#zoomOut').onclick = () => zoomAt(cw() / 2, chh() / 2, 0.8);
  $('#zoomFit').onclick = fitView;
  setInterval(() => { $('#zoomLabel').textContent = Math.round(S.view.scale * 100) + '%'; }, 120);
}

function buildAddTypes() {
  $('#addType').innerHTML = TYPE_KEYS.map(k => `<option value="${k}">${TYPES[k].label}</option>`).join('');
}

function hint(html) { $('#hint').innerHTML = html; }

// ==================================================================
//  markdown-ish renderer for the module text
// ==================================================================
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mdToHtml(md) {
  const out = [];
  let readBuf = [];
  const flushRead = () => {
    if (readBuf.length) { out.push('<div class="read">' + readBuf.join(' ') + '</div>'); readBuf = []; }
  };
  for (let raw of md.split('\n')) {
    let line = raw.trim();
    if (!line) { flushRead(); continue; }
    if (line.startsWith('!')) continue;
    if (line.startsWith('>>')) {
      const t = line.replace(/^>+/, '').trim();
      if (t) readBuf.push(inline(t));
      continue;
    }
    flushRead();
    if (/^\*\*.+\*\*$/.test(line)) { out.push('<h4>' + inline(line.slice(2, -2)) + '</h4>'); continue; }
    if (/^[*\-] /.test(line)) { out.push('<ul><li>' + inline(line.slice(2)) + '</li></ul>'); continue; }
    if (/^\|/.test(line)) { out.push('<p>' + inline(line) + '</p>'); continue; }
    out.push('<p>' + inline(line) + '</p>');
  }
  flushRead();
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
