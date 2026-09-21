/* The side picker, driven the way a hand would drive it: arm it, hover, step
 * through whatever is stacked under the cursor, and take one. */
const mid = sh => {
  // a point inside the shape -- for an area, inside its FIRST part, since a
  // shape drawn in two pieces has its overall centre in the gap between them
  const ring = sh.type === 'area' ? sh.parts[0].ring : shapePoints(sh);
  return { x: ring.reduce((a, p) => a + p[0], 0) / ring.length,
           y: ring.reduce((a, p) => a + p[1], 0) / ring.length };
};

(async () => {
  for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r));
  if (!DATA || !ANN) throw new Error('boot did not finish');

  S.levelId = 'walls'; S.roomId = 'K1';
  renderRoomPanel();

  const inK1 = objectsOfRoom('K1').map(marker).filter(o => (o.shapes[0] || {}).level === 'walls');
  console.log('objects in K1 on the walls sheet:');
  for (const o of inK1) console.log('   ' + o.objectType.padEnd(9) + o.name);

  const mech = inK1.find(o => /drawbridge and portcullis/i.test(o.name));
  const torch = inK1.find(o => o.objectType !== 'area');
  const court = inK1.find(o => o.objectType === 'area' && o !== mech);
  if (!mech) throw new Error('the mechanism object is missing');

  const door = Object.values(ANN.markers).find(m =>
    m.kind === 'portal' && m.sides.some(s => /ironbound/i.test(s.name || '')));
  console.log('\nportal under test:', door.sides.map(s => s.name || '(unnamed)').join(' | '));
  console.log('its near end is:', marker(door.sides[0].marker).name);

  // ---- 1. the case this was written for ----------------------------------
  console.log('\n-- picking the mechanism, which is what would not work before --');
  console.log('it is drawn in ' + mech.shapes[0].parts.length
    + ' parts, one gate tower each side of the tunnel');
  startPickSide(door.id, 1);
  updatePick(mid(mech.shapes[0]));
  const offered = S.pick.list.map(c => marker(c.id).name);
  console.log('offered under the cursor:', JSON.stringify(offered));
  if (!offered.includes(mech.name)) throw new Error('the mechanism was not offered');
  while (marker(S.pick.list[S.pick.i].id) !== mech) cyclePick();
  takePick();
  console.log('took:', marker(door.sides[1].marker).name);
  console.log('picker stood down:', S.sideTarget === null && S.pick === null);

  const row = connectionsOf('K1', 'walls').find(c => c.id === door.id);
  console.log('now listed in K1:', !!row, '| far side:', row && row.farName || '(unnamed)');

  // ---- 2. a real stack, and stepping through it --------------------------
  console.log('\n-- stepping through things that overlap --');
  // set the NEAR end this time, so the courtyard is not the one held back
  startPickSide(door.id, 0);
  updatePick(mid(torch.shapes[0]));          // a torch stands inside the courtyard
  console.log('under the cursor at the ' + torch.name + ', smallest first:');
  S.pick.list.forEach((c, n) =>
    console.log('   ' + (n === S.pick.i ? '> ' : '  ')
      + marker(c.id).objectType.padEnd(9) + marker(c.id).name));
  if (S.pick.list.length < 2) throw new Error('expected a stack here');
  console.log('the small thing is offered first:',
    marker(S.pick.list[0].id).objectType !== 'area');

  const first = S.pick.list[S.pick.i].id;
  cyclePick();
  const second = S.pick.list[S.pick.i].id;
  console.log('Tab moved the choice:', first !== second);
  updatePick({ x: mid(torch.shapes[0]).x + 0.4, y: mid(torch.shapes[0]).y + 0.4 });
  console.log('a mouse wobble does not undo the Tab:', S.pick.list[S.pick.i].id === second);
  cancelPickSide(true);

  // ---- 3. the end already in use is held back, and said so ---------------
  console.log('\n-- the end already in use --');
  startPickSide(door.id, 1);                 // side 0 is the courtyard
  S.sideTarget = { portalId: door.id, i: 1 };
  const inCourtOnly = mid(court.shapes[0]);
  updatePick(inCourtOnly);
  const blocked = (S.pick.list.blocked || []).map(b => marker(b.id).name);
  console.log('held back at that point:', JSON.stringify(blocked));
  console.log('selectable there:', S.pick.list.length);
  if (!S.pick.list.length && !blocked.length) throw new Error('nothing reported at all');
  cancelPickSide(true);

  // ---- 4. only objects are ever offered ----------------------------------
  startPickSide(door.id, 1);
  updatePick(mid(torch.shapes[0]));
  console.log('\nonly objects are offered:',
    S.pick.list.every(c => marker(c.id).kind === 'object'));
  cancelPickSide(true);

  // ---- 5. the highlight draws at any zoom --------------------------------
  for (const sc of [0.05, 0.5, 3]) {
    S.view.scale = sc;
    startPickSide(door.id, 0);
    updatePick(mid(torch.shapes[0]));
    draw();
    cancelPickSide(true);
  }
  console.log('highlight drew at every zoom');

  // ---- 6. and it is one undo step ----------------------------------------
  undo();
  console.log('undone:', marker(door.id).sides[1].marker !== mech.id);
  console.log('\nOK');
})()
