/* Castle Ravenloft VTT mapper
 *
 * Mark rooms, the things in them, and the ways between them on the official
 * battlemaps. The model is the one in SCHEMA.md and it is read through
 * markers.js, which the reader loads too, so the two cannot disagree.
 *
 * Two things are worth knowing before reading on:
 *
 *   A marker holds a list of shapes. Six torches are one object drawn six
 *   times, not six records. So the thing you pick on the left (S.markerId) and
 *   the shape you have hold of on the map (S.sel, an item key) are different
 *   selections, and both matter.
 *
 *   A room is edited one floor at a time. What the middle column lists is what
 *   is on the sheet in front of you; the rest of the room is reached through
 *   "Also on". markers.js decides that for both pages.
 */
'use strict';

// ------------------------------------------------------------------ state
let DATA = null;                       // castle-data.json
let ANN = null;                        // the annotations, v2
let PACKS = { base: 'References/img/map_packs', default: 'default', packs: [] };
const ROOMS = new Map();               // id -> room
const LEVELS = new Map();              // id -> level

const S = {
  levelId: null,
  roomId: null,
  mapPack: 'default',
  markerId: null,                      // what drawing goes into
  sel: null,                           // "<markerId>#<n>": the shape in hand
  tool: 'select',
  snap: 'corner',
  showGrid: true,
  playerMap: false,
  typeFilter: new Set(),
  search: '',
  onlyUnmarked: false,
  hideSubs: false,
  view: { scale: 1, tx: 0, ty: 0 },
  draft: null,
  drag: null,
  calibrating: false,
  hoverEdge: null,
  snapSuspended: false,
  boolMode: 'new',
  momentaryBool: null,
  sideTarget: null,                    // {portalId, i} while the map is armed
  pick: null,                          // what is under the cursor while it is
};

const imgCache = new Map();
let img = null;
let needsDraw = true;

// ------------------------------------------------------------------ dom
const $ = s => document.querySelector(s);
const canvas = $('#canvas');
canvas.tabIndex = 0;
const ctx = canvas.getContext('2d');

// ==================================================================
//  loading
// ==================================================================
(async function boot() {
  const [d, a, packs] = await Promise.all([
    fetch('/castle-data.json').then(r => r.json()),
    fetch('/api/annotations-v2').then(r => r.json()),
    fetch('/api/map-packs').then(r => r.json()).catch(() => null),
  ]);
  DATA = d; ANN = a;
  if (packs && packs.packs) PACKS = packs;
  ANN.markers ||= {};
  ANN.grids ||= {};
  ANN.roomNotes ||= {};
  DATA.levels.forEach(l => LEVELS.set(l.id, l));
  DATA.rooms.forEach(r => ROOMS.set(r.id, r));
  for (const l of DATA.levels) ANN.grids[l.id] ||= Object.assign({}, l.grid);
  reindex();

  buildLevelSelect();
  buildPackSelect();
  buildTypeFilters();
  buildAddTypes();
  wire();
  renderRooms();

  const lv = localStorage.getItem('cr.level');
  await setLevel(LEVELS.has(lv) ? lv : DATA.levels[1].id, true);
  const room = localStorage.getItem('cr.room');
  if (room && ROOMS.has(room)) selectRoom(room, { keepView: true });
  else renderRoomPanel();
  loop();
})();

// ==================================================================
//  changing markers
// ==================================================================
// Everything that writes goes through here, so undo and save are in one place
// and no part of the app has to remember to call them.

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
function mintId(prefix) {
  let id;
  do {
    id = prefix + '_';
    for (let i = 0; i < 10; i++) id += B36[Math.floor(Math.random() * 36)];
  } while (ANN.markers[id]);
  return id;
}

/** Make a change, with one undo step and one save around it. */
function edit(label, fn) {
  pushHistory(label);
  fn();
  reindex();
  save();
  needsDraw = true;
}

function newObject(roomId, objectType, name, description) {
  const id = mintId('o');
  ANN.markers[id] = {
    id, kind: 'object', objectType, room: roomId,
    name: name || TYPES[objectType].label, description: description || '',
    shapes: [], height: null, light: null, seed: null,
  };
  return id;
}

function newPortal(roomId, passage, name, description) {
  const id = mintId('p');
  // one side is where you are; the other is for you to say
  const home = areaObjectOf(roomId, S.levelId) || areaObjectOf(roomId, homeSheet(roomId));
  ANN.markers[id] = {
    id, kind: 'portal', passage,
    lockable: false, transparent: passage === 'barrier', secret: false,
    state: passage === 'open' ? 'open' : 'closed',
    sides: [
      { marker: home, name: name || '', description: description || '' },
      { marker: null, name: '', description: '' },
    ],
    shapes: [], height: null, light: null, seeds: [],
  };
  return id;
}

/** The object that is a room's outline on a sheet, if it has one. */
function areaObjectOf(roomId, levelId) {
  for (const id of objectsOfRoom(roomId)) {
    const m = marker(id);
    if (m.objectType === 'area' && (m.shapes || []).some(s => s.level === levelId)) return id;
  }
  return null;
}

/** The room's outline on this sheet, made if it is not there yet. */
function ensureArea(roomId, levelId) {
  const got = areaObjectOf(roomId, levelId);
  if (got) return got;
  // an outline with no shapes yet may be waiting to be drawn somewhere
  const blank = objectsOfRoom(roomId).find(id => {
    const m = marker(id);
    return m.objectType === 'area' && !(m.shapes || []).length;
  });
  if (blank) return blank;
  const r = ROOMS.get(roomId);
  return newObject(roomId, 'area', (r && r.name) || roomId, '');
}

/** Drop a marker, and let go of anything pointing at it. */
function deleteMarker(id) {
  const m = marker(id);
  if (!m) return;
  edit('delete ' + (nameOf(m, S.roomId) || 'marker'), () => {
    if (m.kind === 'object') {
      for (const other of Object.values(ANN.markers)) {
        if (other.kind !== 'portal') continue;
        for (const side of other.sides) {
          // the wording stays: it still describes the way, whoever it leads to
          if (side.marker === id) side.marker = null;
        }
      }
    }
    delete ANN.markers[id];
  });
  if (S.markerId === id) S.markerId = null;
  if (S.sel && S.sel.startsWith(id + '#')) S.sel = null;
  renderRooms(); renderRoomPanel();
}

/** Drop one shape of a marker, leaving the marker itself. */
function deleteShape(key) {
  const it = ITEMS.get(key);
  if (!it) return;
  edit('remove one drawing of ' + (nameOf(it.marker, S.roomId) || 'marker'), () => {
    it.marker.shapes.splice(it.i, 1);
  });
  S.sel = null;
  renderRoomPanel();
}

function setField(id, path, value, label) {
  const m = marker(id);
  if (!m) return;
  const keys = path.split('.');
  let node = m;
  for (const k of keys.slice(0, -1)) node = node[k];
  if (node[keys[keys.length - 1]] === value) return;
  edit(label || 'edit ' + path, () => { node[keys[keys.length - 1]] = value; });
  renderRooms(); renderRoomPanel();
}

// ------------------------------------------------------------------ undo
const HISTORY = { undo: [], redo: [], limit: 150, lastTag: null, lastAt: 0 };
const snapshot = () => JSON.stringify({ markers: ANN.markers, grids: ANN.grids,
                                        roomNotes: ANN.roomNotes });

function pushHistory(label, tag) {
  const now = Date.now();
  // a run of nudges on the same thing is one step, not forty
  if (tag && tag === HISTORY.lastTag && now - HISTORY.lastAt < 900) {
    HISTORY.lastAt = now;
    return;
  }
  HISTORY.undo.push({ label, json: snapshot() });
  if (HISTORY.undo.length > HISTORY.limit) HISTORY.undo.shift();
  HISTORY.redo.length = 0;
  HISTORY.lastTag = tag || null;
  HISTORY.lastAt = now;
  updateHistoryUI();
}

function applySnapshot(json) {
  const d = JSON.parse(json);
  ANN.markers = d.markers;
  ANN.grids = d.grids;
  ANN.roomNotes = d.roomNotes || {};
  if (S.sel && !ITEMS.has(S.sel)) S.sel = null;
  if (S.markerId && !ANN.markers[S.markerId]) S.markerId = null;
  reindex();
  save();
  renderRooms(); renderRoomPanel();
  needsDraw = true;
}

function undo() {
  const step = HISTORY.undo.pop();
  if (!step) return;
  HISTORY.redo.push({ label: step.label, json: snapshot() });
  HISTORY.lastTag = null;
  applySnapshot(step.json);
  hint('Undid ' + esc(step.label) + '.');
  updateHistoryUI();
}

function redo() {
  const step = HISTORY.redo.pop();
  if (!step) return;
  HISTORY.undo.push({ label: step.label, json: snapshot() });
  HISTORY.lastTag = null;
  applySnapshot(step.json);
  hint('Redid ' + esc(step.label) + '.');
  updateHistoryUI();
}

function updateHistoryUI() {
  const u = $('#undoBtn'), r = $('#redoBtn');
  u.disabled = !HISTORY.undo.length;
  r.disabled = !HISTORY.redo.length;
  const last = HISTORY.undo[HISTORY.undo.length - 1];
  u.title = last ? 'Undo ' + last.label + ' (Ctrl+Z)' : 'Nothing to undo';
  const next = HISTORY.redo[HISTORY.redo.length - 1];
  r.title = next ? 'Redo ' + next.label + ' (Ctrl+Shift+Z)' : 'Nothing to redo';
}

// ------------------------------------------------------------------ save
let saveTimer = null, savePending = false;

function save() {
  setSaveState('dirty', 'unsaved');
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 450);
}

async function flush() {
  if (!savePending) return;
  savePending = false;
  setSaveState('saving', 'saving…');
  try {
    const res = await fetch('/api/annotations-v2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ANN),
    });
    if (!res.ok) throw new Error(await res.text());
    setSaveState('idle', 'saved');
  } catch (err) {
    savePending = true;
    setSaveState('error', 'not saved');
    console.error(err);
  }
}

function setSaveState(cls, txt) {
  const el = $('#saveState');
  el.className = 'save ' + cls;
  el.textContent = txt;
}

window.addEventListener('beforeunload', e => {
  if (savePending) { flush(); e.preventDefault(); e.returnValue = ''; }
});

function buildLevelSelect() {
  $('#levelSelect').innerHTML = DATA.levels
    .map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}

// ------------------------------------------------------------------ map packs
// A pack is a folder of battlemap sheets that stands in for the published set.
// castle-data.json names every sheet inside map_packs/default, so swapping packs
// is a matter of swapping that one path segment. A pack only has to hold the
// sheets it actually redraws: anything it leaves out falls back to default, which
// is what lets a pack replace a single floor. Marks are not touched by any of
// this -- they are in map pixels, and a pack is expected to match the sheet it
// replaces pixel for pixel. When one does not, the sheet is drawn stretched to
// the measured size and the picker says so.
const PACK_SEG = /(References\/img\/map_packs\/)[^/]+\//;

const packById = id => (PACKS.packs || []).find(p => p.id === id) || null;
const sheetFile = (level, player) =>
  ((player && level.playerMap) ? level.playerMap : level.dmMap).split('/').pop();
const packFile = (id, file) => (packById(id)?.files || {})[file] || null;

/** A pack id that exists, falling back to the default set. */
function pickPack(id) {
  if (id && packById(id)) return id;
  const dflt = PACKS.default || 'default';
  return packById(dflt) ? dflt : (PACKS.packs?.[0]?.id || dflt);
}

/** Which pack actually supplies a level's sheet: the chosen one, or default. */
function packFor(level, player, want = S.mapPack) {
  const file = sheetFile(level, player);
  if (packFile(want, file)) return want;
  return PACKS.default || 'default';
}

/** The on-disk path of a level's sheet under the pack showing now. */
function sheetPath(level, player, want = S.mapPack) {
  const base = (player && level.playerMap) ? level.playerMap : level.dmMap;
  const use = packFor(level, player, want);
  return PACK_SEG.test(base) ? base.replace(PACK_SEG, '$1' + use + '/') : base;
}

function mapUrl(level, player, want = S.mapPack) {
  return '/maps/' + sheetPath(level, player, want).split('/').map(encodeURIComponent).join('/');
}

/** '', or a warning that this pack's sheet is not the size the grid was measured on. */
function packSizeNote(level, player, want = S.mapPack) {
  const f = packFile(packFor(level, player, want), sheetFile(level, player));
  if (!f || !f.w || !f.h) return '';
  if (f.w === level.width && f.h === level.height) return '';
  return `${f.w}×${f.h}, not the ${level.width}×${level.height} this sheet was measured at`;
}

function buildPackSelect() {
  const sel = $('#packSelect');
  if (!sel) return;
  sel.innerHTML = (PACKS.packs || [])
    .map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')
    || '<option value="default">default</option>';
  sel.value = S.mapPack;
  const p = packById(S.mapPack);
  sel.title = p && p.note ? p.note : 'Which folder of battlemap sheets to draw';
}

/** Swap the sheets under the marks. Nothing about the annotations changes. */
async function setPack(id) {
  const next = pickPack(id);
  if (next === S.mapPack) return;
  S.mapPack = next;
  localStorage.setItem('cr.pack', next);
  buildPackSelect();
  await setLevel(S.levelId);
  const lv = LEVELS.get(S.levelId);
  const p = packById(next);
  const from = packFor(lv, S.playerMap);
  const warn = packSizeNote(lv, S.playerMap);
  hint(`Sheets from <b>${esc(p ? p.name : next)}</b>.`
    + (from !== next ? ' This floor is not in that pack, so the default sheet is showing.' : '')
    + (warn ? ` <b>Heads up:</b> that sheet is ${esc(warn)}, so it is drawn stretched to fit.` : '')
    + ' Your marks are untouched.');
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

// ==================================================================
//  rendering
// ==================================================================
function loop() { if (needsDraw) { draw(); needsDraw = false; } requestAnimationFrame(loop); }

function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw(), chh());
  ctx.fillStyle = '#0e0d13';
  ctx.fillRect(0, 0, cw(), chh());
  if (!S.levelId) return;
  const lv = LEVELS.get(S.levelId);

  ctx.save();
  ctx.translate(S.view.tx, S.view.ty);
  ctx.scale(S.view.scale, S.view.scale);
  if (img) ctx.drawImage(img, 0, 0, lv.width, lv.height);
  if (S.showGrid) drawGrid(lv);
  drawItems();
  drawSides();
  drawDraft();
  drawPick();
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

/** What an item is, for drawing: colour, label, and whether it is an outline. */
function itemMeta(key) {
  const meta = markMeta(key);
  const it = ITEMS.get(key);
  return Object.assign(meta, {
    isArea: !!it && it.marker.kind === 'object' && it.marker.objectType === 'area',
  });
}

function drawItems() {
  const sc = S.view.scale;
  const items = itemsOnLevel();
  // outlines first, so the things standing in them read on top
  items.sort((a, b) => (a.marker.objectType === 'area' ? 0 : 1)
                     - (b.marker.objectType === 'area' ? 0 : 1));
  const mine = new Set(itemsForRoom(S.roomId, S.levelId).map(it => it.key));
  for (const it of items) {
    const meta = itemMeta(it.key);
    const t = TYPES[meta.type] || TYPES.note;
    const selected = it.key === S.sel;
    const targeted = it.id === S.markerId;
    const dim = S.roomId && !mine.has(it.key);
    ctx.globalAlpha = dim && !selected && !targeted ? 0.4 : 1;
    drawShape(it.shape, t.color, selected || targeted, sc, meta, it.marker);
    ctx.globalAlpha = 1;
  }
}

/**
 * While a portal is selected, a thread to each end it names. A portal is the
 * one thing here whose meaning is not where it sits but what it joins, so the
 * join is worth being able to see rather than only read.
 */
function drawSides() {
  const it = S.sel && ITEMS.get(S.sel);
  const m = it ? it.marker : marker(S.markerId);
  if (!m || m.kind !== 'portal') return;
  const from = it ? centroid(shapePoints(it.shape)) : null;
  const sc = S.view.scale;
  ctx.save();
  ctx.setLineDash([7 / sc, 6 / sc]);
  ctx.lineWidth = 1.6 / sc;
  for (const side of m.sides) {
    const o = marker(side.marker);
    if (!o) continue;
    const there = (o.shapes || []).find(s => s.level === S.levelId);
    if (!there) continue;
    const c = centroid(shapePoints(there));
    ctx.strokeStyle = '#8b6fe0cc';
    ctx.beginPath();
    if (from) { ctx.moveTo(from[0], from[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(c[0], c[1], 7 / sc, 0, 7);
    ctx.fillStyle = '#8b6fe055'; ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

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
  ctx.lineWidth = (strong ? 3 : 2) / sc;
  ctx.strokeStyle = color;
  ctx.fillStyle = color + (strong ? '44' : '28');
  ctx.setLineDash(m && m.secret ? [8 / sc, 6 / sc] : []);

  if (sh.type === 'line') {
    // a wall drawn inside a room is scenery: thin, grey, and left unlabelled
    const wall = !!sh.wall && m && m.kind === 'object';
    ctx.lineWidth = (wall ? 4 : (strong ? 9 : 7)) / sc;
    if (wall) ctx.strokeStyle = '#b9b2cc';
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sh.x1, sh.y1); ctx.lineTo(sh.x2, sh.y2); ctx.stroke();
    ctx.lineCap = 'butt';
    if (!wall) label(meta, (sh.x1 + sh.x2) / 2, (sh.y1 + sh.y2) / 2, sc, color, strong, true);
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
  if (!meta || !meta.label) return;
  // declutter: labels on the small things only once they can be read
  if (!meta.isArea && !strong && sc < 0.28) return;
  const px = (small ? 12 : 15) / sc;
  if (px * sc < 8) return;
  ctx.font = (strong ? '700 ' : '600 ') + px + 'px Inter, Segoe UI, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5 / sc; ctx.strokeStyle = 'rgba(10,9,14,.92)';
  ctx.strokeText(meta.label, x, y);
  ctx.fillStyle = strong ? '#fff' : '#f2eefb';
  ctx.fillText(meta.label, x, y);
}

function drawHandles(sh, sc) {
  const r = 5 / sc;
  for (const p of shapePoints(sh)) {
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
    if (d.wall) ctx.strokeStyle = '#b9b2cc';       // the grey a laid wall draws in
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
  if (sh.type === 'line') return [[sh.x1, sh.y1], [sh.x2, sh.y2]];
  if (sh.type === 'point') return [[sh.x, sh.y]];
  return [];
}

function setShapePoint(sh, i, x, y) {
  if (sh.type === 'area') {
    let n = i;
    for (const part of sh.parts) {
      if (n < part.ring.length) { part.ring[n] = [x, y]; return; }
      n -= part.ring.length;
    }
  } else if (sh.type === 'line') {
    if (i === 0) { sh.x1 = x; sh.y1 = y; } else { sh.x2 = x; sh.y2 = y; }
  } else if (sh.type === 'point') { sh.x = x; sh.y = y; }
}

function moveShape(sh, dx, dy) {
  if (sh.type === 'area') {
    for (const part of sh.parts) part.ring = part.ring.map(p => [p[0] + dx, p[1] + dy]);
  } else if (sh.type === 'line') {
    sh.x1 += dx; sh.y1 += dy; sh.x2 += dx; sh.y2 += dy;
  } else if (sh.type === 'point') { sh.x += dx; sh.y += dy; }
}

function centroid(pts) {
  if (!pts.length) return [0, 0];
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
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
      return distToSeg(p, a[0], a[1], b[0], b[1]) <= tol + 3 / S.view.scale;
    }))) return true;
    return insideArea(sh, [p.x, p.y]);
  }
  if (sh.type === 'line') return distToSeg(p, sh.x1, sh.y1, sh.x2, sh.y2) <= 9 / S.view.scale + tol;
  if (sh.type === 'point') return Math.hypot(p.x - sh.x, p.y - sh.y) <= 13 / S.view.scale + tol;
  return false;
}

// ==================================================================
//  heights
// ==================================================================
function setHeight(id, from, to) {
  const m = marker(id);
  if (!m) return;
  const next = (from === null && to === null) ? null
             : (to === null || to === from) ? { at: from }
             : { from: Math.min(from, to), to: Math.max(from, to) };
  if (JSON.stringify(m.height || null) === JSON.stringify(next)) return;
  edit('height of ' + (nameOf(m, S.roomId) || 'marker'), () => { m.height = next; });
  renderRoomPanel();
}

function renderHeight() {
  const box = $('#heightTools');
  const m = marker(S.markerId);
  if (!m) { box.style.display = 'none'; return; }
  box.style.display = 'flex';
  const it = S.sel && ITEMS.get(S.sel) ? ITEMS.get(S.sel) : firstItemOn(S.markerId, S.levelId);
  const h = it ? heightOf(it) : (m.height || { at: levelElevation(S.levelId), assumed: true });
  const assumed = !!h.assumed;
  $('#heightWho').textContent = (nameOf(m, S.roomId) || 'marker') + ':';
  const f = $('#hFrom'), t = $('#hTo');
  if (document.activeElement !== f && document.activeElement !== t) {
    f.value = assumed ? '' : (typeof h.at === 'number' ? h.at : h.from ?? '');
    t.value = (assumed || typeof h.at === 'number') ? '' : (h.to ?? '');
  }
  f.placeholder = String(it ? floorUnder(it) : levelElevation(S.levelId));
  f.classList.toggle('assumed', assumed);
}

// ==================================================================
//  the room list
// ==================================================================
/** How far along a room is, counted over every sheet it is drawn on. */
function roomProgress(roomId) {
  const objs = objectsOfRoom(roomId).map(id => marker(id));
  const placed = objs.filter(m => (m.shapes || []).length).length;
  const area = objs.some(m => m.objectType === 'area' && (m.shapes || []).length);
  const loose = portalsOfRoom(roomId)
    .filter(id => marker(id).sides.some(s => !s.marker)).length;
  return { placed, total: objs.length, area, loose };
}

function renderRooms() {
  const list = $('#roomList');
  const q = S.search.trim().toLowerCase();
  let html = '', shown = 0, done = 0, total = 0;

  for (const lv of DATA.levels) {
    const rooms = (lv.rooms || []).map(id => ROOMS.get(id)).filter(Boolean);
    let rows = '';
    for (const r of rooms) {
      total++;
      const pr = roomProgress(r.id);
      const complete = pr.area && pr.placed === pr.total && !pr.loose;
      if (complete) done++;
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
        <span class="rcount"${pr.loose ? ' title="ways with one end still unsaid"' : ''}>${
          pr.placed}/${pr.total}${pr.loose ? ' ·' + pr.loose + '?' : ''}</span></div>`;
    }
    if (rows) html += `<div class="levelHead">${esc(lv.name)}</div>` + rows;
  }
  list.innerHTML = html || '<div class="emptyNote">Nothing matches that search.</div>';
  $('#roomProgress').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  $('#roomProgressText').textContent =
    `${done} of ${total} areas finished · ${shown} shown`;
}

// ==================================================================
//  the room panel: what is on this sheet, and the ways off it
// ==================================================================
function buildTypeFilters() {
  const keys = ['area', 'creature', 'item', 'trap', 'note', 'open', 'door', 'secret', 'barrier'];
  $('#typeFilters').innerHTML = keys
    .map(k => `<button data-type="${k}" title="${esc(TYPES[k].label)}">${TYPES[k].ico}</button>`).join('');
}

function renderRoomPanel() {
  const titleEl = $('#featureTitle');
  const listEl = $('#featureList');
  const r = ROOMS.get(S.roomId);
  if (!r) {
    titleEl.textContent = 'No room selected';
    listEl.innerHTML = '<div class="emptyNote">Pick a room on the left.</div>';
    $('#roomText').innerHTML = '';
    $('#alsoOn').innerHTML = '';
    renderProps();
    return;
  }
  const pr = roomProgress(r.id);
  const lvName = (LEVELS.get(S.levelId) || {}).name || S.levelId;
  titleEl.innerHTML = `${esc(r.id)}. ${esc(r.name)}<small>${esc(lvName)}
    · ${pr.placed}/${pr.total} drawn${pr.area ? '' : ' · no outline yet'}${
    pr.loose ? ' · ' + pr.loose + ' way' + (pr.loose > 1 ? 's' : '') + ' unfinished' : ''}</small>`;
  $('#markRoomBtn').textContent =
    areaObjectOf(r.id, S.levelId) ? 'Redraw room area' : 'Mark room area';

  // edges of whatever is selected
  const et = edgeTarget();
  const ed = et ? areaEdges(et.shape) : [];
  $('#edgeTools').style.display = ed.length ? 'flex' : 'none';
  if (ed.length) {
    const walls = ed.filter(x => x.wall).length;
    $('#edgeCount').textContent = `${walls} wall${walls === 1 ? '' : 's'}, ${ed.length - walls} open`;
  }

  // the other sheets this room is drawn on
  const sheets = sheetsOf(r.id).filter(l => l !== S.levelId);
  $('#alsoOn').innerHTML = sheets.length
    ? 'Also on: ' + sheets
        .sort((a, b) => levelElevation(b) - levelElevation(a))
        .map(l => `<button data-golevel="${esc(l)}">${esc((LEVELS.get(l) || {}).name || l)}</button>`)
        .join('')
    : '';

  const filt = S.typeFilter;
  let html = '';

  const things = contentsOf(r.id, S.levelId);
  const rows = things.filter(o => !filt.size || filt.has(o.type));
  html += `<div class="groupHead">In this area <em>on ${esc(lvName)}</em></div>`;
  html += rows.length ? rows.map(o => objectRow(o)).join('')
        : '<div class="emptyNote sm">Nothing here yet. <b>+ Add</b> makes one.</div>';

  const ways = connectionsOf(r.id, S.levelId).filter(c => !filt.size || filt.has(c.type));
  html += `<div class="groupHead">Ways in and out <em>of ${esc(lvName)}</em></div>`;
  html += ways.length ? ways.map(c => portalRow(c, r.id)).join('')
        : '<div class="emptyNote sm">No way off this sheet yet.</div>';

  listEl.innerHTML = html;
  $('#roomText').innerHTML = mdToHtml(r.text || '');
  renderHeight();
  renderProps();
}

function objectRow(o) {
  const t = TYPES[o.type] || TYPES.note;
  const bits = [];
  if (o.height && !o.height.assumed) bits.push(heightText(o.height));
  if (o.light) bits.push(`${o.light.bright}/${o.light.dim} ft`);
  if (o.count > 1) bits.push('●' + o.count);
  if (!o.placed) bits.push('not drawn');
  return `<div class="featRow${o.id === S.markerId ? ' sel' : ''}${o.placed ? '' : ' faint'}"
      data-marker="${esc(o.id)}">
    <span class="ico" style="color:${t.color}">${t.ico}</span>
    <span class="body"><span class="flabel">${esc(o.name)}</span>
      ${o.description ? `<span class="fnote">${esc(o.description)}</span>` : ''}</span>
    <span class="fside"><span class="placed">${esc(bits.join(' · '))}</span>
      <button class="x" data-delmarker="${esc(o.id)}" title="Delete this marker">×</button></span></div>`;
}

function portalRow(c, roomId) {
  const t = TYPES[c.type] || TYPES.note;
  const room = ROOMS.get(c.to);
  const g = c.go || {};
  const arrow = g.dir === 'up' ? '↑' : g.dir === 'down' ? '↓' : '→';
  const rise = g.dir && Math.abs(g.rise) >= 5 ? `${g.dir} ${Math.abs(g.rise)} ft` : '';
  const where = c.to
    ? `<button class="linkChip" data-goroom="${esc(c.to)}" title="${esc((room && room.name) || '')}">${esc(c.to)}</button>`
    : '<span class="unsaid">far side not said</span>';
  return `<div class="featRow${c.id === S.markerId ? ' sel' : ''}${c.to ? '' : ' warn'}"
      data-marker="${esc(c.id)}">
    <span class="ico" style="color:${t.color}">${t.ico}</span>
    <span class="body"><span class="flabel">${esc(c.label || t.label)}</span>
      <span class="fnote">${esc(c.how)}${c.state ? ' · ' + esc(c.state) : ''}${
        c.unmarked ? ' · not drawn' : ''}</span>
      <span class="flinks">${arrow} ${where}${rise ? `<span class="hChip">${esc(rise)}</span>` : ''}</span></span>
    <span class="fside"><button class="x" data-delmarker="${esc(c.id)}" title="Delete this way">×</button></span></div>`;
}

// ==================================================================
//  the properties panel
// ==================================================================
// What the old build called Links. A portal's two ends are the thing most
// worth being able to correct, so they sit here with everything else the
// selected marker owns.
function renderProps() {
  const box = $('#linkPanel');
  const m = marker(S.markerId);
  $('#linkCount').textContent = '';
  if (!m) {
    box.innerHTML = '<div class="emptyNote sm">Pick something in the middle column, '
      + 'or click it on the map, to edit it here.</div>';
    return;
  }
  const isPort = m.kind === 'portal';
  $('#linkCount').textContent = isPort ? 'portal' : (m.objectType || '');
  const shapesHere = (m.shapes || []).filter(s => s.level === S.levelId).length;
  const shapesElse = (m.shapes || []).length - shapesHere;

  let html = `<div class="propHead">${esc(nameOf(m, S.roomId) || '(unnamed)')}</div>`;
  html += `<div class="propNote">${shapesHere} drawn on this sheet${
    shapesElse ? `, ${shapesElse} on another` : ''}.</div>`;

  if (!isPort) {
    html += field('Name', 'text', 'name', m.name || '');
    html += field('Description', 'area', 'description', m.description || '');
    html += `<label class="propRow">Kind<select data-prop="objectType">${
      ['area', 'creature', 'item', 'trap', 'note']
        .map(k => `<option value="${k}"${m.objectType === k ? ' selected' : ''}>${TYPES[k].label}</option>`)
        .join('')}</select></label>`;
    html += `<label class="propRow">Room<select data-prop="room">${
      [...ROOMS.keys()].map(id =>
        `<option value="${esc(id)}"${m.room === id ? ' selected' : ''}>${esc(id)} ${esc(ROOMS.get(id).name)}</option>`)
        .join('')}</select></label>`;
  } else {
    html += `<label class="propRow">Passage<select data-prop="passage">${
      [['open', 'Open — cannot be shut'], ['door', 'Door — opens and shuts'],
       ['barrier', 'Barrier — never opens']]
        .map(([k, t]) => `<option value="${k}"${m.passage === k ? ' selected' : ''}>${t}</option>`)
        .join('')}</select></label>`;
    html += `<label class="propRow">State<select data-prop="state">${
      ['open', 'closed', 'locked']
        .map(k => `<option value="${k}"${m.state === k ? ' selected' : ''}${
          (k !== 'open' && m.passage === 'open') || (k === 'locked' && !m.lockable) ? ' disabled' : ''
        }>${k}</option>`).join('')}</select></label>`;
    html += `<div class="propRow flags">
      <label class="chk"><input type="checkbox" data-prop="lockable"${m.lockable ? ' checked' : ''}${
        m.passage !== 'door' ? ' disabled' : ''}> lockable</label>
      <label class="chk"><input type="checkbox" data-prop="transparent"${m.transparent ? ' checked' : ''}> see-through</label>
      <label class="chk"><input type="checkbox" data-prop="secret"${m.secret ? ' checked' : ''}> secret</label>
    </div>`;
    html += '<div class="propHead sub">The two ends</div>';
    m.sides.forEach((side, i) => {
      const o = marker(side.marker);
      const room = o ? ROOMS.get(o.room) : null;
      html += `<div class="sideBox${o ? '' : ' warn'}">
        <div class="sideWho">${o
          ? `<b>${esc(o.room)}</b> ${esc((room && room.name) || '')}
             <small>${esc((LEVELS.get(objectLevel(o)) || {}).name || 'not drawn')}</small>`
          : '<b>Not said yet</b> <small>outside, or still to name</small>'}
          <button class="ghost xs" data-pickside="${i}">${o ? 'change' : 'set'}</button>
          ${o ? `<button class="ghost xs" data-clearside="${i}">clear</button>` : ''}</div>
        <input class="sideName" data-side="${i}" data-sidefield="name"
               value="${esc(side.name || '')}" placeholder="What it is called from this side">
        <textarea class="sideNote" rows="2" data-side="${i}" data-sidefield="description"
               placeholder="How it looks from this side">${esc(side.description || '')}</textarea>
      </div>`;
    });
  }

  html += `<div class="propRow lightRow">Light
    <input type="number" data-prop="light.bright" step="5" placeholder="bright"
           value="${m.light ? m.light.bright : ''}" style="width:68px">
    <input type="number" data-prop="light.dim" step="5" placeholder="dim"
           value="${m.light ? m.light.dim : ''}" style="width:68px"> ft</div>`;
  box.innerHTML = html;
}

const field = (label, kind, prop, value) => kind === 'area'
  ? `<label class="propRow col">${label}<textarea rows="2" data-prop="${prop}">${esc(value)}</textarea></label>`
  : `<label class="propRow">${label}<input type="text" data-prop="${prop}" value="${esc(value)}"></label>`;

// ==================================================================
//  selection
// ==================================================================
function selectRoom(id, opts) {
  if (!ROOMS.has(id)) return;
  S.roomId = id;
  localStorage.setItem('cr.room', id);
  // follow the room to a sheet it is actually drawn on
  const sheets = sheetsOf(id);
  const go = sheets.includes(S.levelId) ? S.levelId : (homeSheet(id) || ROOMS.get(id).level);
  const after = () => {
    S.markerId = areaObjectOf(id, S.levelId) || null;
    S.sel = null;
    renderRooms(); renderRoomPanel();
    if (!opts || !opts.keepView) centerOnRoom(id);
    needsDraw = true;
  };
  if (go !== S.levelId) setLevel(go).then(after); else after();
}

function selectMarker(id, opts) {
  const m = marker(id);
  if (!m) return;
  S.markerId = id;
  const rooms = roomsOf(m);
  if (rooms.length && !rooms.includes(S.roomId)) {
    S.roomId = rooms[0];
    localStorage.setItem('cr.room', S.roomId);
    renderRooms();
  }
  const it = firstItemOn(id, S.levelId);
  S.sel = it ? it.key : null;
  setToolFor(m);
  renderRoomPanel();
  if (opts && opts.center && it) centerOn(it.shape);
  needsDraw = true;
}

/** Picking a thing sets the tool its shape is usually drawn with. */
function setToolFor(m) {
  if (S.tool === 'edges' || S.tool === 'select') return;
  const want = m.kind === 'portal'
    ? (m.passage === 'open' ? 'rect' : 'seg')
    : (m.objectType === 'area' ? 'rect' : 'point');
  setTool(want);
}

function centerOn(sh) {
  const pts = shapePoints(sh);
  if (!pts.length) return;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  S.view.tx = cw() / 2 - cx * S.view.scale;
  S.view.ty = chh() / 2 - cy * S.view.scale;
  needsDraw = true;
}

function centerOnRoom(id) {
  const it = firstItemOn(areaObjectOf(id, S.levelId), S.levelId);
  if (it) centerOn(it.shape);
}

// ------------------------------------------------------------------ sides
// Setting a portal's far end means picking one thing out of a map where
// things sit on top of one another: a door is inside a room, which is beside
// another room, and the gate mechanism is inside the courtyard. So the picker
// does not guess. It gathers everything under the cursor, smallest first,
// shows you which one it is about to take and what the others are, and lets
// you step through them with Tab before you commit.
//
// Any object may be an end, not only a room outline. A place the book never
// gave a room of its own -- the inside of a gate tower, say -- is often
// marked as an item, and a door has to be able to lead there.

/**
 * Everything under the cursor that could be an end, nearest thing first.
 *
 * The far end of a way cannot be the near end, so the object already on the
 * other side is held back -- but it is reported rather than dropped, because
 * hovering the one thing you cannot pick and being told "nothing here" is
 * how you end up thinking the picker is broken.
 */
function pickCandidates(wp) {
  const tol = 6 / S.view.scale;
  const p = marker((S.sideTarget || {}).portalId);
  const taken = p ? p.sides[1 - S.sideTarget.i].marker : null;
  const out = [], blocked = [];
  const seen = new Set();
  for (const it of itemsOnLevel()) {
    if (it.marker.kind !== 'object') continue;      // a portal is not a place
    if (!hitShape(it.shape, wp, tol)) continue;
    if (seen.has(it.id)) continue;                  // one entry per marker
    seen.add(it.id);
    if (it.id === taken) { blocked.push(it); continue; }
    const pts = shapePoints(it.shape);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const size = pts.length < 2 ? 0
      : (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    out.push({ it, id: it.id, size });
  }
  // smallest first, so a lamp inside a hall wins over the hall
  out.sort((a, b) => a.size - b.size);
  out.blocked = blocked;
  return out;
}

/** Arm the map: the next thing clicked becomes that end of the portal. */
function startPickSide(portalId, i) {
  S.sideTarget = { portalId, i };
  S.pick = null;
  canvas.classList.add('picking');
  hint('Hover the map to see what you would pick; <b>Tab</b> steps through '
     + 'anything stacked under the cursor. You can change sheets first. <b>Esc</b> stops.');
  needsDraw = true;
}

function cancelPickSide(quiet) {
  S.sideTarget = null;
  S.pick = null;
  canvas.classList.remove('picking');
  if (!quiet) hint('');
  needsDraw = true;
}

/** Keep the picker's list current as the cursor moves. */
function updatePick(wp) {
  const was = S.pick && S.pick.list[S.pick.i];
  const list = pickCandidates(wp);
  // hold on to whatever was already under the cursor, so stepping through a
  // stack with Tab is not undone by a one-pixel wobble of the mouse
  let i = 0;
  if (was) {
    const still = list.findIndex(c => c.id === was.id);
    if (still >= 0) i = still;
  }
  S.pick = { list, i, at: [wp.x, wp.y] };
  const cur = list[i];
  if (!cur && list.blocked && list.blocked.length) {
    hint(`<b>${esc(list.blocked[0].marker.name || 'That')}</b> is already the other `
       + 'end of this way. Hover something else, or <b>Esc</b> to stop.');
  } else if (!cur) {
    hint('Nothing here. Move over an area or a marker, or <b>Esc</b> to stop.');
  } else {
    const room = ROOMS.get(cur.it.marker.room);
    hint(`Set this end to <b>${esc(cur.it.marker.name || '(unnamed)')}</b> `
       + `&mdash; ${esc(cur.it.marker.room)}${room ? ' ' + esc(room.name) : ''}`
       + (list.length > 1
          ? ` &middot; ${i + 1} of ${list.length} here, <b>Tab</b> for the next`
          : ''));
  }
  needsDraw = true;
}

function cyclePick() {
  if (!S.pick || S.pick.list.length < 2) return;
  S.pick.i = (S.pick.i + 1) % S.pick.list.length;
  updatePick({ x: S.pick.at[0], y: S.pick.at[1] });
}

/** Take whatever the picker is pointing at. */
function takePick() {
  const cur = S.pick && S.pick.list[S.pick.i];
  if (!cur) {
    hint('Nothing here to pick. Move over an area or a marker, or <b>Esc</b> to stop.');
    return true;
  }
  const { portalId, i } = S.sideTarget;
  const p = marker(portalId);
  if (!p) { cancelPickSide(); return true; }
  edit('set an end of ' + (nameOf(p, S.roomId) || 'a way'), () => {
    p.sides[i].marker = cur.id;
  });
  cancelPickSide(true);
  const room = ROOMS.get(cur.it.marker.room);
  hint(`This way now comes out at <b>${esc(cur.it.marker.name || cur.it.marker.room)}</b>`
     + `${room ? ' in ' + esc(cur.it.marker.room) + ' ' + esc(room.name) : ''}.`);
  renderRooms(); renderRoomPanel();
  return true;
}

/**
 * What the picker is about to take, drawn on the map: the thing itself picked
 * out in white, the rest of the stack under the cursor outlined faintly, and
 * the name written beside the cursor so the choice is visible where you are
 * looking rather than only in the hint bar.
 */
function drawPick() {
  if (!S.sideTarget || !S.pick) return;
  const sc = S.view.scale;
  const { list, i, at } = S.pick;
  ctx.save();
  list.forEach((c, n) => {
    const on = n === i;
    const pts = shapePoints(c.it.shape);
    if (!pts.length) return;
    ctx.setLineDash(on ? [] : [6 / sc, 5 / sc]);
    ctx.lineWidth = (on ? 4 : 1.6) / sc;
    ctx.strokeStyle = on ? '#ffffff' : '#ffffff66';
    if (c.it.shape.type === 'point') {
      ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], (on ? 15 : 12) / sc, 0, 7);
      if (on) { ctx.fillStyle = '#ffffff33'; ctx.fill(); }
      ctx.stroke();
    } else if (c.it.shape.type === 'line') {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      ctx.beginPath();
      for (const part of c.it.shape.parts) {
        part.ring.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
        ctx.closePath();
      }
      if (on) { ctx.fillStyle = '#ffffff22'; ctx.fill('evenodd'); }
      ctx.stroke();
    }
  });
  ctx.setLineDash([]);

  const cur = list[i];
  if (cur) {
    const name = cur.it.marker.name || '(unnamed)';
    const room = cur.it.marker.room;
    const line1 = name;
    const line2 = room + (list.length > 1 ? `  ·  ${i + 1}/${list.length}, Tab` : '');
    const px = 13 / sc;
    ctx.font = '600 ' + px + 'px Inter, Segoe UI, sans-serif';
    const w = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 14 / sc;
    const h = 34 / sc;
    let x = at[0] + 16 / sc, y = at[1] + 16 / sc;
    ctx.fillStyle = 'rgba(16,14,22,.94)';
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1 / sc;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 5 / sc); else ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line1, x + 7 / sc, y + 5 / sc);
    ctx.font = (11 / sc) + 'px Inter, Segoe UI, sans-serif';
    ctx.fillStyle = '#b9b2cc';
    ctx.fillText(line2, x + 7 / sc, y + 19 / sc);
  }
  ctx.restore();
}

// ==================================================================
//  tools
// ==================================================================
function setTool(t) {
  S.tool = t;
  document.querySelectorAll('[data-tool]').forEach(b =>
    b.classList.toggle('active', b.dataset.tool === t));
  canvas.classList.toggle('drawing', t !== 'select');
  if (t !== 'poly') S.draft = null;
  $('#boolMode').classList.toggle('dim', !['rect', 'circle', 'poly'].includes(t));
  needsDraw = true;
}

function setBool(mode) {
  S.boolMode = mode;
  document.querySelectorAll('#boolMode button').forEach(b =>
    b.classList.toggle('active', b.dataset.bool === mode));
}

/** The area the Edges tool works on: whatever is selected, if it is an area. */
function edgeTarget() {
  const it = S.sel && ITEMS.get(S.sel);
  return it && isArea(it.shape) ? it : null;
}

function setAllEdges(v) {
  const et = edgeTarget();
  if (!et) return;
  edit(v === WALL ? 'all edges wall' : 'all edges open', () => {
    for (const part of et.shape.parts) part.edges = part.edges.map(() => v);
    geomVersion++;
  });
  renderRoomPanel();
}

/**
 * Put a drawn shape into the marker being worked on.
 *
 * With New selected each stroke adds another shape, which is how one entry
 * covers six torches. With + or - the stroke reshapes the shape in hand
 * instead, so an alcove can be cut out of one staircase without starting a
 * second.
 */
function commitDraft(shape) {
  const m = marker(S.markerId);
  if (!m) { hint('Pick something in the middle column first, then draw.'); return; }
  if (S.momentaryBool) { S.boolModeSaved = S.boolMode; S.boolMode = S.momentaryBool; }

  const areaish = shape.type === 'rect' || shape.type === 'poly';
  const held = S.sel && ITEMS.get(S.sel);
  const combining = areaish && S.boolMode !== 'new'
                 && held && held.id === S.markerId && isArea(held.shape);
  const dflt = m.kind === 'object' && m.objectType === 'area' ? WALL : OPEN;
  const label = combining ? (S.boolMode === 'sub' ? 'subtract from ' : 'add to ')
              : 'draw ';

  let where = null;
  edit(label + (nameOf(m, S.roomId) || 'marker'), () => {
    if (combining) {
      applyAreaOp(held.shape, shape, S.boolMode === 'sub' ? 'sub' : 'add', dflt);
      geomVersion++;
      normalizeArea(held.shape);
      where = held.i;
    } else {
      const final = areaish ? makeArea(shape, dflt) : shape;
      final.level = S.levelId;
      m.shapes.push(final);
      where = m.shapes.length - 1;
      geomVersion++;
    }
  });
  if (S.momentaryBool) { S.boolMode = S.boolModeSaved; S.momentaryBool = null; }

  // stay exactly as the user left things: same target, same tool, same view
  S.sel = S.markerId + '#' + where;
  const here = (m.shapes || []).filter(s => s.level === S.levelId).length;
  hint(combining
    ? `<b>${esc(nameOf(m, S.roomId))}</b> &mdash; ${S.boolMode === 'sub' ? 'cut out of' : 'added to'}`
      + ' this drawing. Back to <b>New</b> to start another.'
    : `<b>${esc(nameOf(m, S.roomId))}</b> &mdash; ${here} on this sheet. Draw again to add another.`);
  renderRoomPanel();
}

/** A wall line goes on the room's own outline, which is what a wall belongs to. */
function commitWall(shape) {
  const id = ensureArea(S.roomId, S.levelId);
  const m = marker(id);
  edit('wall inside ' + S.roomId, () => {
    m.shapes.push(Object.assign({ type: 'line', level: S.levelId, wall: true },
                                { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2 }));
  });
  hint(`Wall laid inside <b>${esc(S.roomId)}</b>. It blocks sight; the Walls tool stays on.`);
  renderRoomPanel();
}

// ==================================================================
//  the map: pointer
// ==================================================================
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
  canvas.focus();
  setSnapSuspended(e.altKey);
  const sp = evPos(e);
  const wp = toWorld(sp.x, sp.y);

  const panBtn = e.button === 1 || e.button === 2 || keys.has(' ');
  if (panBtn) {
    S.drag = { mode: 'pan', sx: sp.x, sy: sp.y, tx: S.view.tx, ty: S.view.ty };
    canvas.classList.add('panning');
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;

  if (S.sideTarget) { updatePick(wp); if (takePick()) return; }

  if (S.calibrating) {
    S.draft = { type: 'cal', x1: wp.x, y1: wp.y, x2: wp.x, y2: wp.y };
    S.drag = { mode: 'cal' };
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  if (S.tool === 'edges') {
    const tol = 12 / S.view.scale;
    let target = edgeTarget();
    let hit = target ? nearestAreaEdge(target.shape, wp, tol) : null;
    if (!hit) {
      for (const it of itemsOnLevel()) {
        if (!isArea(it.shape)) continue;
        const h = nearestAreaEdge(it.shape, wp, tol);
        if (h) { target = it; S.sel = it.key; S.markerId = it.id; hit = h; break; }
      }
    }
    if (!hit) {
      hint('Click an outline edge to switch it between wall and open.');
      S.drag = { mode: 'pan', sx: sp.x, sy: sp.y, tx: S.view.tx, ty: S.view.ty };
      canvas.classList.add('panning');
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const part = target.shape.parts[hit.pi];
    edit(part.edges[hit.i] === OPEN ? 'wall edge' : 'open edge', () => {
      part.edges[hit.i] = part.edges[hit.i] === OPEN ? WALL : OPEN;
      geomVersion++;
    });
    renderRoomPanel();
    hint(part.edges[hit.i] === WALL
      ? 'Edge set to <b>wall</b>: it will block line of sight.'
      : 'Edge set to <b>open</b>: it marks the area but blocks nothing.');
    return;
  }

  const sp2 = snap(wp);

  if ((e.ctrlKey || e.metaKey) && ['rect', 'poly', 'circle'].includes(S.tool)) {
    S.momentaryBool = 'sub';
  }
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
    if (first && S.draft.pts.length > 2
        && Math.hypot(sp2.x - first[0], sp2.y - first[1]) < 12 / S.view.scale) {
      finishPoly(); return;
    }
    S.draft.pts.push([sp2.x, sp2.y]);
    needsDraw = true; return;
  }

  // ---- select tool ----
  const tol = 6 / S.view.scale;
  const held = S.sel && ITEMS.get(S.sel);
  if (held) {
    const pts = shapePoints(held.shape);
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(wp.x - pts[i][0], wp.y - pts[i][1]) <= 8 / S.view.scale) {
        S.drag = { mode: 'handle', key: S.sel, i,
                   pending: 'reshape ' + (nameOf(held.marker, S.roomId) || 'marker') };
        canvas.setPointerCapture(e.pointerId); return;
      }
    }
  }
  // small things before outlines, so a door on a wall wins over the room
  const pool = itemsOnLevel().slice().sort((a, b) =>
    (a.marker.objectType === 'area' ? 1 : 0) - (b.marker.objectType === 'area' ? 1 : 0));
  for (const it of pool) {
    if (!hitShape(it.shape, wp, tol)) continue;
    S.sel = it.key;
    selectMarker(it.id);
    S.sel = it.key;                       // selectMarker picks the first on this sheet
    S.drag = { mode: 'move', key: it.key, lx: wp.x, ly: wp.y,
               pending: 'move ' + (nameOf(it.marker, S.roomId) || 'marker') };
    canvas.setPointerCapture(e.pointerId);
    needsDraw = true; return;
  }
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

  if (S.sideTarget) { updatePick(wp); return; }

  const d = S.drag;
  if (!d) {
    if (S.draft && S.draft.type === 'poly') { S.draft.cursor = [snap(wp).x, snap(wp).y]; needsDraw = true; }
    if (S.tool === 'edges') {
      const et = edgeTarget();
      const h = et ? nearestAreaEdge(et.shape, wp, 12 / S.view.scale) : null;
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
    const it = ITEMS.get(d.key);
    if (!it) return;
    if (d.pending) { pushHistory(d.pending); d.pending = null; }
    setShapePoint(it.shape, d.i, s.x, s.y);
    geomVersion++; needsDraw = true; save();
  } else if (d.mode === 'move') {
    const it = ITEMS.get(d.key);
    if (!it) return;
    if (Math.abs(wp.x - d.lx) < 1e-9 && Math.abs(wp.y - d.ly) < 1e-9) return;
    if (d.pending) { pushHistory(d.pending); d.pending = null; }
    moveShape(it.shape, wp.x - d.lx, wp.y - d.ly);
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
    if (Math.hypot(dr.x2 - dr.x1, dr.y2 - dr.y1) > 2) {
      const shape = { type: 'line', x1: dr.x1, y1: dr.y1, x2: dr.x2, y2: dr.y2, wall: false };
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
window.addEventListener('blur', () => setSnapSuspended(false));

window.addEventListener('keydown', e => {
  keys.add(e.key);
  if (e.key === 'Alt') { e.preventDefault(); setSnapSuspended(true); }
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
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

  if (e.key === 'Tab' && S.sideTarget) { e.preventDefault(); cyclePick(); return; }

  const map = { v: 'select', r: 'rect', c: 'circle', p: 'poly', d: 'seg',
                t: 'point', e: 'edges', w: 'wallseg' };
  const low = e.key.toLowerCase();
  if (map[low] && !e.ctrlKey && !e.metaKey) { setTool(map[low]); return; }
  if (e.key === 'Escape') {
    if (S.sideTarget) { cancelPickSide(); return; }
    S.draft = null; S.calibrating = false; hint(''); needsDraw = true; return;
  }
  if (e.key === 'Enter' && S.draft && S.draft.type === 'poly') { finishPoly(); return; }
  if (e.key === 'Backspace' && S.draft && S.draft.type === 'poly') {
    S.draft.pts.pop(); needsDraw = true; return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) {
    e.preventDefault();
    deleteShape(S.sel);
    return;
  }
  if (low === 'g') { S.showGrid = !S.showGrid; $('#showGrid').checked = S.showGrid; needsDraw = true; }
  if (e.key === '1') setBool('new');
  if (e.key === '2') setBool('add');
  if (e.key === '3') setBool('sub');
  if (low === 'f') fitView();
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
// Universal VTT, one file per sheet, plus a companion notes file carrying
// everything the format has nowhere to put.
//
// This is where the model earns its keep. The old export had to find its
// portals by clustering marks that sat on top of one another, because a door
// was two records and only geometry could say they were one. A portal is one
// record now, and it says what it is, so the whole of that is gone and what
// is left is four rules:
//
//   open                 a hole: cut the wall, emit no portal
//   door                 cut the wall, emit a portal, shut unless it stands open
//   barrier, see-through cut the wall, emit a portal that never blocks sight
//   barrier, solid       leave the wall alone and emit nothing
//
// with one qualification the table in SCHEMA.md does not make: only a portal
// drawn as a line or a point is an opening in a wall. A portal drawn as an
// area is a footprint -- a staircase, the mouth of a shaft -- and cutting
// every wall it overlapped would open the rooms it merely passes through. An
// open boundary needs no cut in any case: the outline's own edge flags
// already leave it open.

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

/** The openings a portal makes in the walls of one sheet. */
function openingsOf(p, levelId) {
  const out = [];
  for (const sh of p.shapes || []) {
    if (sh.level !== levelId) continue;
    if (sh.type === 'line') {
      out.push({ portal: p, a: [sh.x1, sh.y1], b: [sh.x2, sh.y2], fromPoint: false });
    } else if (sh.type === 'point') {
      out.push({ portal: p, at: [sh.x, sh.y], fromPoint: true });
    }
    // an area is a footprint, not a doorway: see the note above
  }
  return out;
}

/** Does this portal let anything through the wall it sits in? */
const portalOpensWall = p =>
  p.passage === 'open' || p.passage === 'door' || (p.passage === 'barrier' && p.transparent);

/** Does the VTT need a door object here, or is it simply a gap? */
const portalIsDoor = p => p.passage === 'door'
  || (p.passage === 'barrier' && p.transparent);

async function runExport() {
  const status = $('#expStatus');
  const which = $('#expLevel').value;
  const scale = parseFloat($('#expScale').value);
  const wantLos = $('#expLos').checked;
  const wantLights = $('#expLights').checked;
  const player = $('#expPlayer').checked;
  const sub = parseInt($('#expGrid').value, 10) || 1;

  const drawn = new Set();
  for (const m of Object.values(ANN.markers)) {
    for (const sh of m.shapes || []) drawn.add(sh.level);
  }
  const ids = which === '*' ? DATA.levels.filter(l => drawn.has(l.id)).map(l => l.id) : [which];
  if (!ids.length) { status.textContent = 'Nothing drawn yet.'; return; }

  $('#expRun').disabled = true;
  for (const id of ids) {
    status.textContent = 'Building ' + LEVELS.get(id).name + '…';
    try {
      await exportLevel(id, scale, wantLos, wantLights, player, sub);
    } catch (err) {
      status.textContent = 'Failed on ' + id + ': ' + err.message;
      $('#expRun').disabled = false;
      console.error(err);
      return;
    }
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

  const here = itemsOnLevel(levelId);

  // ---------------------------------------------------------------- portals
  const openings = [];
  for (const m of Object.values(ANN.markers)) {
    if (m.kind !== 'portal') continue;
    for (const o of openingsOf(m, levelId)) openings.push(o);
  }

  // ------------------------------------------------------------------ walls
  // every stretch of outline flagged as a wall, plus the walls drawn inside
  const rawWalls = [];
  if (wantLos) {
    for (const it of here) {
      if (isArea(it.shape)) {
        for (const sg of areaBoundary(it.shape)) {
          if (sg.wall) rawWalls.push({ a: sg.a, b: sg.b, src: it.key });
        }
      } else if (it.shape.type === 'line' && it.shape.wall) {
        rawWalls.push({ a: [it.shape.x1, it.shape.y1], b: [it.shape.x2, it.shape.y2], src: it.key });
      }
    }
  }

  // a portal marked as a point belongs to the wall it sits against: give it a
  // narrow opening there, lined up with that wall
  for (const o of openings) {
    if (!o.fromPoint) continue;
    const host = nearestWallTo(rawWalls, o.at, ppg * 0.9);
    const w = o.portal.passage === 'barrier' ? ppg * 0.25 : ppg * 0.5;  // 2.5 ft slit, else 5 ft
    if (host) {
      const [hx, hy] = host.foot;
      o.a = [hx - host.ux * w / 2, hy - host.uy * w / 2];
      o.b = [hx + host.ux * w / 2, hy + host.uy * w / 2];
      o.onWall = true;
    } else {                                   // nothing to sit in: keep it square on
      o.a = [o.at[0] - w / 2, o.at[1]];
      o.b = [o.at[0] + w / 2, o.at[1]];
    }
  }

  // walls give way only where something can actually pass or be seen through
  const cutting = openings.filter(o => portalOpensWall(o.portal));
  const cutWalls = wantLos ? openWallsAtPortals(rawWalls, cutting, ppg) : [];

  window.__export = { levelId, ppg, openings, rawWalls, cutWalls };   // for tests

  const portals = openings.filter(o => portalIsDoor(o.portal)).map(o => {
    const p = o.portal;
    const a = { x: +W(o.a[0]).toFixed(4), y: +H(o.a[1]).toFixed(4) };
    const b = { x: +W(o.b[0]).toFixed(4), y: +H(o.b[1]).toFixed(4) };
    return {
      position: { x: +((a.x + b.x) / 2).toFixed(4), y: +((a.y + b.y) / 2).toFixed(4) },
      bounds: [a, b],
      rotation: +Math.atan2(b.y - a.y, b.x - a.x).toFixed(5),
      // a see-through barrier is a window: it stands shut but sight goes by,
      // which the format spells "not closed"
      closed: p.passage === 'door' && p.state !== 'open',
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
  const seen = new Set();
  for (const it of here) {
    const m = it.marker;
    const pts = shapePoints(it.shape).map(p => ({ x: +W(p[0]).toFixed(4), y: +H(p[1]).toFixed(4) }));
    const note = {
      id: it.key, marker: it.id, kind: m.kind,
      shape: it.shape.type, points: pts,
      height: heightOf(it),
    };
    if (m.kind === 'object') {
      note.type = m.objectType;
      note.name = m.name;
      note.description = m.description || undefined;
      note.room = m.room;
      note.roomName = (ROOMS.get(m.room) || {}).name || null;
    } else {
      note.passage = m.passage;
      note.state = m.state;
      note.secret = m.secret || undefined;
      note.lockable = m.lockable || undefined;
      note.transparent = m.transparent || undefined;
      note.sides = m.sides.map(s => {
        const o = marker(s.marker);
        return {
          name: s.name || undefined,
          description: s.description || undefined,
          room: o ? o.room : null,
          roomName: o ? ((ROOMS.get(o.room) || {}).name || null) : null,
          sheet: o ? objectLevel(o) : null,
          floorFeet: o ? objectFloor(o) : null,
        };
      });
      const [a, b] = note.sides;
      note.leadsTo = [a.room, b.room].filter(Boolean);
      if (a.floorFeet !== null && b.floorFeet !== null) {
        note.riseFeet = b.floorFeet - a.floorFeet;
      }
    }
    if (m.light) note.light = m.light;
    if (isArea(it.shape)) {
      note.parts = it.shape.parts.map(part => ({
        op: part.op,
        ring: part.ring.map(p => ({ x: +W(p[0]).toFixed(4), y: +H(p[1]).toFixed(4) })),
        edges: part.edges.map(v => (v === OPEN ? 'open' : 'wall')),
      }));
      note.boundary = areaBoundary(it.shape).map(sg => ({
        wall: !!sg.wall,
        a: { x: +W(sg.a[0]).toFixed(4), y: +H(sg.a[1]).toFixed(4) },
        b: { x: +W(sg.b[0]).toFixed(4), y: +H(sg.b[1]).toFixed(4) },
      }));
    }
    notes.push(note);

    // the format carries one radius, so dim is the reach and bright sets how
    // hard it burns; anything lit that is drawn as a point becomes a light
    if (wantLights && m.light && it.shape.type === 'point' && !seen.has(it.key)) {
      seen.add(it.key);
      const dim = Math.max(m.light.dim || 0, m.light.bright || 0);
      lights.push({
        position: pts[0],
        range: +(dim / (g.feetPerSquare || 10)).toFixed(3),
        intensity: +Math.min(1, Math.max(0.15, (m.light.bright || 0) / (dim || 1))).toFixed(3),
        color: 'ffd89b', shadows: true,
      });
    }
  }

  // and every room on this sheet, with the ways off it, worked out once
  const roomNotes = [];
  for (const r of DATA.rooms) {
    const area = areaObjectOf(r.id, levelId);
    if (!area) continue;
    roomNotes.push({
      id: r.id, name: r.name, outline: area,
      floorFeet: objectFloor(marker(area)),
      contents: contentsOf(r.id, levelId).map(o => ({ id: o.id, type: o.type, name: o.name })),
      ways: connectionsOf(r.id, levelId).map(c => ({
        portal: c.id, to: c.to, how: c.how, state: c.state || undefined,
        name: c.label, riseFeet: c.go ? c.go.rise : null,
        toSheet: c.go ? c.go.sheet : null,
      })),
    });
  }

  const ppgOut = scale > 0 ? Math.max(8, Math.round(unit * scale)) : Math.round(unit);
  let image = '';
  if (scale > 0) {
    const src = await loadImage(mapUrl(lv, player));
    const off = document.createElement('canvas');
    off.width = cols * ppgOut;
    off.height = rows * ppgOut;
    const c = off.getContext('2d');
    c.imageSmoothingQuality = 'high';
    // the crop is in measured-map pixels; a pack sheet at another resolution is
    // read at its own scale so the same patch of castle comes out
    const kx = (src.naturalWidth || lv.width) / lv.width;
    const ky = (src.naturalHeight || lv.height) / lv.height;
    c.drawImage(src, cx * kx, cy * ky, cwpx * kx, chpx * ky, 0, 0, off.width, off.height);
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
    rooms: roomNotes, markers: notes,
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

  $('#levelSelect').onchange = e => setLevel(e.target.value, true).then(renderRoomPanel);
  $('#packSelect').onchange = e => setPack(e.target.value);
  $('#playerMap').onchange = e => { S.playerMap = e.target.checked; setLevel(S.levelId); };
  $('#showGrid').onchange = e => { S.showGrid = e.target.checked; needsDraw = true; };
  $('#snapMode').onchange = e => { S.snap = e.target.value; };

  document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  document.querySelectorAll('#boolMode button')
    .forEach(b => b.onclick = () => setBool(b.dataset.bool));

  const readH = () => {
    if (!S.markerId) return;
    const fv = $('#hFrom').value.trim(), tv = $('#hTo').value.trim();
    if (fv === '' && tv === '') { setHeight(S.markerId, null, null); return; }
    const it = S.sel && ITEMS.get(S.sel);
    const a = fv === '' ? (it ? floorUnder(it) : levelElevation(S.levelId)) : Number(fv);
    const b = tv === '' ? null : Number(tv);
    if (Number.isNaN(a) || (b !== null && Number.isNaN(b))) return;
    setHeight(S.markerId, a, b);
  };
  $('#hFrom').onchange = readH;
  $('#hTo').onchange = readH;
  $('#hFrom').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); };
  $('#hTo').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); };
  $('#hClear').onclick = () => {
    if (!S.markerId) return;
    $('#hFrom').value = ''; $('#hTo').value = '';
    setHeight(S.markerId, null, null);
  };

  // ---- panes you can drag wider ----
  const WIDTHS = { rooms: '--w-rooms', feats: '--w-feats', props: '--w-props' };
  const LIMITS = { rooms: [170, 520], feats: [220, 720], props: [220, 560] };
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

  $('#alsoOn').onclick = e => {
    const b = e.target.closest('[data-golevel]');
    if (b) setLevel(b.dataset.golevel).then(() => {
      S.markerId = areaObjectOf(S.roomId, S.levelId) || null;
      S.sel = null;
      renderRoomPanel(); centerOnRoom(S.roomId); needsDraw = true;
    });
  };

  $('#featureList').onclick = e => {
    const go = e.target.closest('[data-goroom]');
    if (go) { e.stopPropagation(); selectRoom(go.dataset.goroom); return; }
    const del = e.target.closest('[data-delmarker]');
    if (del) { e.stopPropagation(); deleteMarker(del.dataset.delmarker); return; }
    const row = e.target.closest('[data-marker]');
    if (row) selectMarker(row.dataset.marker, { center: true });
  };

  $('#typeFilters').onclick = e => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    const t = b.dataset.type;
    S.typeFilter.has(t) ? S.typeFilter.delete(t) : S.typeFilter.add(t);
    b.classList.toggle('on');
    renderRoomPanel();
  };

  $('#markRoomBtn').onclick = () => {
    if (!S.roomId) return;
    const id = ensureArea(S.roomId, S.levelId);
    reindex();
    S.markerId = id;
    S.sel = (firstItemOn(id, S.levelId) || {}).key || null;
    setTool('rect');
    renderRooms(); renderRoomPanel();
    hint(`<b>${esc(S.roomId)}</b> &mdash; drag a rectangle over the room, or <b>P</b> to trace it.`);
  };

  $('#textToggle').onclick = () => $('.textSplit').classList.toggle('open');

  // ---- the properties panel ----
  const panel = $('#linkPanel');
  panel.onclick = e => {
    const pick = e.target.closest('[data-pickside]');
    if (pick) { startPickSide(S.markerId, +pick.dataset.pickside); return; }
    const clear = e.target.closest('[data-clearside]');
    if (clear) {
      const m = marker(S.markerId);
      const i = +clear.dataset.clearside;
      edit('clear an end of ' + (nameOf(m, S.roomId) || 'a way'), () => { m.sides[i].marker = null; });
      renderRooms(); renderRoomPanel();
    }
  };
  panel.onchange = e => {
    const t = e.target;
    const m = marker(S.markerId);
    if (!m) return;
    if (t.dataset.sidefield) {
      const i = +t.dataset.side;
      edit('rename a side', () => { m.sides[i][t.dataset.sidefield] = t.value; });
      renderRoomPanel();
      return;
    }
    const prop = t.dataset.prop;
    if (!prop) return;
    if (prop.startsWith('light.')) {
      const bright = Number($('[data-prop="light.bright"]').value) || 0;
      const dim = Number($('[data-prop="light.dim"]').value) || 0;
      edit('light of ' + (nameOf(m, S.roomId) || 'marker'), () => {
        m.light = (bright || dim) ? { bright, dim: Math.max(bright, dim) } : null;
      });
      renderRoomPanel();
      return;
    }
    const value = t.type === 'checkbox' ? t.checked : t.value;
    setField(S.markerId, prop, value, 'set ' + prop);
    // the three portal flags constrain one another, so settle them together
    if (prop === 'passage' || prop === 'lockable') {
      const p = marker(S.markerId);
      edit('tidy ' + prop, () => {
        if (p.passage !== 'door') p.lockable = false;
        if (p.passage === 'open') p.state = 'open';
        else if (p.passage === 'barrier') p.state = 'closed';
        if (p.state === 'locked' && !p.lockable) p.state = 'closed';
      });
      renderRoomPanel();
    }
  };
  panel.oninput = e => { if (e.target.dataset.sidefield) return; };
  panel.onkeydown = e => e.stopPropagation();

  // ---- add a marker ----
  $('#addFeatureBtn').onclick = () => {
    if (!S.roomId) return;
    $('#addRoomName').textContent = S.roomId + ' · ' + ((LEVELS.get(S.levelId) || {}).name || '');
    $('#addLabel').value = ''; $('#addNote').value = '';
    $('#addDialog').showModal();
    $('#addLabel').focus();
  };
  $('#addCancel').onclick = () => $('#addDialog').close();
  $('#addSave').onclick = () => {
    const name = $('#addLabel').value.trim();
    const kind = $('#addType').value;
    const note = $('#addNote').value.trim();
    if (!name) { $('#addLabel').focus(); return; }
    let id;
    edit('add "' + name + '"', () => {
      id = kind.startsWith('portal:')
        ? newPortal(S.roomId, kind.slice(7), name, note)
        : newObject(S.roomId, kind, name, note);
    });
    $('#addDialog').close();
    renderRooms();
    selectMarker(id);
    hint(`<b>${esc(name)}</b> added. Draw it on the map`
      + (kind.startsWith('portal:') ? ', then set where it comes out.' : '.'));
  };

  // grid dialog
  $('#gridBtn').onclick = () => {
    syncGridDialog();
    $('#gridDialog').show();
    if (document.activeElement) document.activeElement.blur();
    canvas.focus();
  };
  $('#gridClose').onclick = () => $('#gridDialog').close();
  for (const [sel, key] of [['#gridSize', 'size'], ['#gridFeet', 'feetPerSquare'],
                            ['#gridOffX', 'offsetX'], ['#gridOffY', 'offsetY']]) {
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
  $('#addType').innerHTML =
    '<optgroup label="A thing in the room">'
    + ['item', 'creature', 'trap', 'note', 'area']
        .map(k => `<option value="${k}">${TYPES[k].label}</option>`).join('')
    + '</optgroup><optgroup label="A way through">'
    + [['portal:door', 'Door — opens and shuts'],
       ['portal:open', 'Open way — archway, stair, boundary'],
       ['portal:barrier', 'Barrier — window, slit, grate']]
        .map(([v, t]) => `<option value="${v}">${t}</option>`).join('')
    + '</optgroup>';
}

function hint(html) { $('#hint').innerHTML = html; }

// ==================================================================
//  markdown-ish renderer for the module text
// ==================================================================
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function mdToHtml(md) {
  const out = [];
  let read = [];
  const flush = () => {
    if (read.length) { out.push('<blockquote>' + read.join(' ') + '</blockquote>'); read = []; }
  };
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
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
