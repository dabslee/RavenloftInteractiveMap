(async () => {
  for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r));
  if (!DATA || !ANN) throw new Error('boot did not finish');
  console.log('markers:', Object.keys(ANN.markers).length, ' items:', ITEMS.size);

  let rendered = 0, conns = 0, things = 0;
  const withWays = new Set();
  for (const r of DATA.rooms) {
    const sheets = sheetsOf(r.id);
    for (const lv of (sheets.length ? sheets : [r.level])) {
      S.levelId = lv; S.roomId = r.id;
      renderRoom();
      const c = connectionsOf(r.id), t = contentsOf(r.id);
      conns += c.length; things += t.length;
      if (c.length) withWays.add(r.id);
      rendered++;
      for (const it of itemsOnLevel(lv)) {
        markMeta(it.key); heightOf(it); tipFor(it.key); destinationOf(it.key);
        drawItem(it, 'feature');
      }
    }
  }
  console.log('rendered', rendered, 'room/sheet pairs without throwing');
  console.log('rows drawn:', conns, 'ways,', things, 'objects');
  console.log('rooms with at least one way out:', withWays.size, 'of', DATA.rooms.length);

  // nothing listed for a room may sit on another sheet
  let leaks = 0;
  for (const r of DATA.rooms) {
    for (const lv of sheetsOf(r.id)) {
      S.levelId = lv; S.roomId = r.id;
      for (const o of contentsOf(r.id)) {
        const m = marker(o.id);
        if ((m.shapes || []).length && !m.shapes.some(s => s.level === lv)) leaks++;
      }
      for (const c of connectionsOf(r.id)) {
        const p = marker(c.id);
        const ok = (p.sides || []).some(s => {
          const so = marker(s.marker);
          return so && so.room === r.id && (so.shapes || []).some(x => x.level === lv);
        });
        if (!ok) leaks++;
      }
    }
  }
  console.log('rows listed that are not on the sheet shown:', leaks);

  // the K20 staircase, which is the case the floor rule exists for
  for (const lv of ['main', 'court', 'weeping', 'spires']) {
    S.levelId = lv; S.roomId = 'K20';
    const rows = connectionsOf('K20');
    console.log('\nK20 on ' + LEVELS.get(lv).name + ' (' + levelElevation(lv) + ' ft) - '
      + rows.length + ' ways, ' + contentsOf('K20').length + ' objects');
    for (const c of rows) {
      console.log('   ' + String(c.to || 'outside').padEnd(9) + c.how.padEnd(15)
        + (c.go.dir ? c.go.dir + ' ' + Math.abs(c.go.rise) + ' ft' : 'level').padEnd(12)
        + '| ' + c.label);
    }
  }

  S.levelId = 'main'; S.roomId = 'K7';
  console.log('\nK7 on the main floor: ' + contentsOf('K7').length + ' objects, '
    + connectionsOf('K7').length + ' ways');

  FRAMES = null;
  renderFloors();
  console.log('\nfloor stack: ' + floorSlabs().length + ' slabs');
  console.log('\nOK');
})()
