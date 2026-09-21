(async () => {
  for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r));
  if (!DATA || !ANN) throw new Error('boot did not finish');
  const before = Object.keys(ANN.markers).length;
  console.log('booted:', before, 'markers,', ITEMS.size, 'items');

  // 1. walk every room on every sheet through the real render path
  let pairs = 0;
  for (const r of DATA.rooms) {
    for (const lv of (sheetsOf(r.id).length ? sheetsOf(r.id) : [r.level])) {
      S.levelId = lv; S.roomId = r.id;
      S.markerId = areaObjectOf(r.id, lv);
      S.sel = S.markerId ? (firstItemOn(S.markerId, lv) || {}).key || null : null;
      renderRoomPanel();
      renderProps();
      renderHeight();
      draw();
      pairs++;
    }
  }
  console.log('rendered', pairs, 'room/sheet pairs, and drew each');

  // 2. select every marker in turn, as clicking each row would
  let n = 0;
  for (const id of Object.keys(ANN.markers)) { selectMarker(id); renderProps(); n++; }
  console.log('selected all', n, 'markers, including every portal');

  // 3. draw something: a new item in K7, placed twice
  S.levelId = 'main'; S.roomId = 'K7';
  renderRoomPanel();
  let newId;
  edit('test add', () => { newId = newObject('K7', 'item', 'Test crate', 'A crate.'); });
  S.markerId = newId; S.sel = null;
  commitDraft({ type: 'point', x: 1000, y: 1000 });
  commitDraft({ type: 'point', x: 1040, y: 1040 });
  console.log('drew a new item twice ->', marker(newId).shapes.length, 'shapes,',
    'levels', JSON.stringify(marker(newId).shapes.map(s => s.level)));

  // 4. an area, then add to it and cut out of it
  let areaId;
  edit('test area', () => { areaId = newObject('K7', 'trap', 'Test pit', ''); });
  S.markerId = areaId; S.sel = null; S.boolMode = 'new';
  commitDraft({ type: 'rect', x: 500, y: 500, w: 200, h: 200 });
  const ring0 = marker(areaId).shapes[0].parts[0].ring.length;
  S.boolMode = 'add';
  commitDraft({ type: 'rect', x: 700, y: 500, w: 200, h: 200 });
  S.boolMode = 'sub';
  commitDraft({ type: 'rect', x: 560, y: 560, w: 80, h: 80 });
  const sh = marker(areaId).shapes[0];
  console.log('area: 1 shape?', marker(areaId).shapes.length === 1,
    '| parts', sh.parts.length, '| first ring', ring0, '->', sh.parts[0].ring.length,
    '| edges match', sh.parts.every(p => p.edges.length === p.ring.length));

  // 5. a portal, its two ends, and the floor rule
  let portId;
  edit('test portal', () => { portId = newPortal('K7', 'door', 'Test door', 'Oak.'); });
  S.markerId = portId;
  commitDraft({ type: 'line', x1: 900, y1: 900, x2: 960, y2: 900, wall: false });
  const k1walls = areaObjectOf('K1', 'walls');
  edit('test side', () => { marker(portId).sides[1].marker = k1walls; });
  S.roomId = 'K7'; S.levelId = 'main';
  const rows = connectionsOf('K7', 'main').filter(c => c.id === portId);
  console.log('portal listed in K7 on main?', rows.length === 1,
    '| leads to', rows[0] && rows[0].to, '| rise', rows[0] && rows[0].go.rise);
  S.roomId = 'K1'; S.levelId = 'walls';
  const back = connectionsOf('K1', 'walls').filter(c => c.id === portId);
  console.log('and from the far side in K1 on walls?', back.length === 1,
    '| leads to', back[0] && back[0].to);
  S.levelId = 'court';
  console.log('not listed on a sheet it does not touch?',
    connectionsOf('K1', 'court').filter(c => c.id === portId).length === 0);

  // 6. portal flag tidying
  setField(portId, 'passage', 'open', 'test');
  const p = marker(portId);
  edit('tidy', () => {
    if (p.passage !== 'door') p.lockable = false;
    if (p.passage === 'open') p.state = 'open';
  });
  console.log('open portal is not lockable and is open?', !p.lockable && p.state === 'open');

  // 7. deleting an object clears the sides pointing at it, and keeps the portal
  const portalsBefore = Object.values(ANN.markers).filter(m => m.kind === 'portal').length;
  deleteMarker(k1walls);
  console.log('side cleared on delete?', marker(portId).sides[1].marker === null,
    '| portal kept?',
    Object.values(ANN.markers).filter(m => m.kind === 'portal').length === portalsBefore,
    '| name kept?', marker(portId).sides[1].name !== undefined);

  // 8. undo all the way back
  const steps = HISTORY.undo.length;
  for (let i = 0; i < steps; i++) undo();
  console.log('undid', steps, 'steps -> back to', Object.keys(ANN.markers).length,
    'markers (started at ' + before + ')', Object.keys(ANN.markers).length === before ? 'OK' : 'MISMATCH');

  // 9. and redo forwards again
  let redone = 0;
  while (HISTORY.redo.length) { redo(); redone++; }
  console.log('redid', redone, 'steps ->', Object.keys(ANN.markers).length, 'markers');

  console.log('\nsaved payload would be', JSON.stringify(ANN).length, 'bytes');
  console.log('\nOK');
})()
