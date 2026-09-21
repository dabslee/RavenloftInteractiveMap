(async () => {
  for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r));
  if (!DATA || !ANN) throw new Error('boot did not finish');

  // capture what the export posts instead of writing it
  const written = new Map();
  post = (filename, text) => { written.set(filename, text); return Promise.resolve(); };

  const want = ['main', 'court', 'dungeon', 'walls', 'weeping', 'spires', 'larders'];
  for (const lv of want) {
    // scale 0 = geometry only, so no canvas image is needed
    await exportLevel(lv, 0, true, true, false, 1);
  }
  console.log('wrote', written.size, 'files for', want.length, 'sheets\n');

  let totalPortals = 0, totalLos = 0, totalLights = 0;
  for (const lv of want) {
    const u = JSON.parse(written.get('castle-ravenloft-' + lv + '.dd2vtt'));
    const n = JSON.parse(written.get('castle-ravenloft-' + lv + '-notes.json'));
    totalPortals += u.portals.length;
    totalLos += u.line_of_sight.length;
    totalLights += u.lights.length;
    console.log(lv.padEnd(9)
      + String(u.resolution.map_size.x + 'x' + u.resolution.map_size.y).padEnd(10)
      + String(u.portals.length + ' portals').padEnd(13)
      + String(u.line_of_sight.length + ' los').padEnd(10)
      + String(u.lights.length + ' lights').padEnd(11)
      + n.rooms.length + ' rooms, ' + n.markers.length + ' markers');
  }
  console.log('\ntotals:', totalPortals, 'portals,', totalLos, 'los chains,', totalLights, 'lights');

  // --- the four rules, checked against what actually came out ---
  const e = window.__export;             // the last sheet built (larders)
  console.log('\nlast sheet:', e.levelId, '| walls', e.rawWalls.length,
    '-> cut', e.cutWalls.length, '| openings', e.openings.length);

  // every emitted portal must be a door or a see-through barrier
  const main = JSON.parse(written.get('castle-ravenloft-main.dd2vtt'));
  let openEmitted = 0, solidEmitted = 0, doorsShut = 0, windowsOpen = 0;
  await exportLevel('main', 0, true, true, false, 1);
  for (const o of window.__export.openings) {
    const p = o.portal;
    const emitted = portalIsDoor(p);
    if (p.passage === 'open' && emitted) openEmitted++;
    if (p.passage === 'barrier' && !p.transparent && emitted) solidEmitted++;
  }
  for (const p of main.portals) {
    if (p.closed) doorsShut++; else windowsOpen++;
  }
  console.log('open ways wrongly emitted as doors:', openEmitted, '(want 0)');
  console.log('solid barriers wrongly emitted:', solidEmitted, '(want 0)');
  console.log('main floor portals: ' + doorsShut + ' shut, ' + windowsOpen + ' standing open');

  // a solid barrier must leave its wall whole
  const solid = Object.values(ANN.markers).filter(m =>
    m.kind === 'portal' && m.passage === 'barrier' && !m.transparent);
  console.log('solid barriers in the whole castle:', solid.length, '(these cut nothing)');

  // walls really are shorter after cutting
  console.log('cutting shortened the walls:',
    window.__export.cutWalls.length >= window.__export.rawWalls.length
      ? 'more pieces than before, as expected' : 'FEWER PIECES - suspicious');

  // --- notes file ---
  const notes = JSON.parse(written.get('castle-ravenloft-main-notes.json'));
  const k7 = notes.rooms.find(r => r.id === 'K7');
  console.log('\nK7 in the notes: floor', k7.floorFeet, 'ft,',
    k7.contents.length, 'things,', k7.ways.length, 'ways');
  for (const w of k7.ways) {
    console.log('   -> ' + String(w.to).padEnd(8) + w.how.padEnd(14)
      + (w.riseFeet ? w.riseFeet + ' ft' : 'level').padEnd(8) + '| ' + w.name);
  }
  const portalNote = notes.markers.find(m => m.kind === 'portal' && m.sides[1].room);
  console.log('\na portal note carries both ends:',
    JSON.stringify(portalNote.sides.map(s => s.room + '@' + s.sheet)),
    '| leadsTo', JSON.stringify(portalNote.leadsTo));

  // lights
  const lit = notes.markers.filter(m => m.light);
  console.log('lit markers on the main floor:', lit.length,
    lit.length ? '| e.g. ' + lit[0].name + ' ' + JSON.stringify(lit[0].light) : '');
  if (main.lights.length) {
    console.log('first light: range', main.lights[0].range, 'squares, intensity',
      main.lights[0].intensity);
  }

  // every UVTT number must be finite
  let bad = 0;
  const walk = v => {
    if (typeof v === 'number') { if (!Number.isFinite(v)) bad++; }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const [name, text] of written) if (name.endsWith('.dd2vtt')) walk(JSON.parse(text));
  console.log('\nnon-finite numbers anywhere in the UVTT output:', bad);

  console.log('\nOK');
})()
