# Castle Ravenloft VTT Mapper

A local tool for marking up the official Castle Ravenloft battlemaps: where each
area from chapter 4 of *Curse of Strahd* sits, where its doors are, and where the
items and features the text calls out go. Everything you mark is written to a JSON
file in this folder as you work, and can be exported as Universal VTT.

## Running it

From this folder:

```
python serve.py
```

On Windows, `py serve.py` also works, or just double-click `run.bat`. It opens
http://localhost:8731/ in your browser, with the read-only reader at
http://localhost:8731/browse. Stop it with Ctrl+C.

It expects to live inside your Ravenloft folder, alongside `References/`, so the
maps load off your disk at full resolution. If you move it, point it back with
`python serve.py --root "C:\path\to\Ravenloft"`.

Nothing is uploaded and nothing is installed: Python standard library only.

## Files

| file | what it is |
|---|---|
| `serve.py` | the local server |
| `index.html`, `app.js`, `app.css` | the editor |
| `browse.html`, `browse.js`, `browse.css` | the read-only reader at `/browse` |
| `castle-data.json` | 150 areas with their module text and 498 extracted features |
| `castle-ravenloft-annotations.json` | your work: created on first edit, rewritten on every change |
| `backups/` | a rolling copy of the annotations file, one per minute of editing, last 40 kept |
| `exports/` | Universal VTT output |
| `extract.py` | regenerates `castle-data.json` from `References/Curse of Strahd.md` |
| `curation.py` | the room-by-room corrections applied on top of the text extraction |
| `tools/` | the scripts that traced the first-pass outlines, classified open edges, and seeded heights |

## What is in the data

150 areas: K1-K88, the eight cells each in K74 and K75, and all 40 catacomb crypts,
each with its full module text, and 463 features sorted into the vocabulary the printed
map key uses: door, secret door, stairs, trap, window, light, item, plus creature, wall
and note.

The features started as a pattern-matching pass over the text, which produced plenty of
duplicates and mistakes. Every room has since been read individually and corrected in
`curation.py`, which records, per room, what was dropped and why, what was renamed to
what the module actually calls it, what was re-typed, and what the pattern matching
missed. Three kinds of error came up again and again:

- **The same object described several times.** K30's four chests were five entries;
  K85's coffin was three; K86's three alcoves were five.
- **Things that live in another room.** K10 "heard the portcullis clang shut" and got a
  portcullis, which is at the gatehouse. K11 got the organ, which stands in K10.
- **Miscategorised.** K59's "jack-o'-lantern" is Pidlwick II's painted face, not a lamp.
  Crypt 34's "pit" is a pit fiend. K65's "fire pit" is a hearth, not a hazard.

`curation.py` is keyed on the feature ids, which never change, so markers you have
already placed stay attached to what you placed them on. Only K13 has no features, and
it describes nothing to place.

The seven map sheets:

| level | battlemap | pixels | px per 10 ft square |
|---|---|---|---|
| Walls of Ravenloft | map-4.02-walls | 3840 × 5211 | 87.37 |
| Main Floor | map-4.03-main-floor | 3000 × 2072 | 86.51 |
| Court of the Count | map-4.04-court-revised | 5560 × 3840 | 160.46 |
| Rooms of Weeping | map-4.05-weeping | 3000 × 2072 | 85.83 |
| Spires of Ravenloft | map-4.06-spires12 | 5000 × 3372 | 101.00 |
| Larders of Ill Omen | map-4.08-larders | 3000 × 2175 | 122.71 |
| Dungeon and Catacombs | map-4.09-dungeons-and-catacombs | 3000 × 2929 | 94.87 |

Map sheet 6 carries book maps 6 through 10, so every spires room is on it. There is
no separate sheet to switch to.

## Using it

Pick an area in the left column. Its doors and items fill the middle column, and the
module text sits underneath, collapsed. Drag a box over the room on the map to record
its area, then click each door or item in turn and place it. Nothing moves on its own:
after a placement the thing you just drew stays selected, the view stays put, and the
tool you picked stays active. Clicking the next entry in the list sets the right tool
for its type. Since the tool stays live, a left-drag on the map redraws the selected
marker rather than panning: pan with space-drag, right-drag or the middle button, and
Ctrl+Z undoes a redraw you did not mean.

The middle column is editable: `+ Add` creates a marker the extraction missed, the `×` on
any row drops one you do not want, and the pencil (or a second click on the name)
renames one in place. Renames are kept in the annotations file under your own name for
the entry, so regenerating `castle-data.json` never overwrites them.

**One entry, as many placements as it needs.** "Fluttering torches" is rarely one
torch and the text almost never says how many, so every entry holds any number of
placements. Pick it once and keep drawing: each click or drag adds another. The same
goes for doors, stairs, traps, windows and the rest, so a hall with openings at both
ends is one "Double doors" entry placed twice. The row shows the tally next to its dot
(`●6`), and the entry counts as done once at least one is down, so the room's n/m
total still reads as a checklist. Click any single placement with the Select tool to
move or delete just that one; removing the row with `×` clears them all.

**Rooms on more than one sheet.** K18, K20, K21 and the shafts are drawn on several
floors, so a mark belongs to a room *and* a map. Mark K18 on the main floor, switch to
the dungeon sheet, press **Mark room area** again, and both are kept. The **Also on**
chips under the room name show where else it appears and where you have already
marked it, and jump you there.

**Tools**

| key | tool |
|---|---|
| V | select, move, and reshape by dragging the white handles |
| R | rectangle |
| C | circle: drag from the centre out to the rim |
| P | polygon: click points, Enter or double-click to close, Backspace undoes a point |
| D | door: drag across the doorway, Shift keeps it straight |
| T | point |
| W | wall: drag to lay a wall inside a room |
| E | edges: click an outline edge to switch it between wall and open |
| 1 / 2 / 3 | new area · add to it · subtract from it |
| F | fit the map to the window |
| G | toggle the grid |
| Delete | remove the selected marker |
| Alt (hold) | snap off while held, back to your setting when you let go |
| Ctrl+Z | undo |
| Ctrl+Shift+Z or Ctrl+Y | redo |

Wheel zooms, space-drag or right-drag pans, Esc cancels whatever you are drawing.

## Room outlines: walls, open boundaries, and subtraction

A room's outline is rarely all wall. Where it meets a corridor through an open archway,
or where you simply decided the area stops, the line is a boundary but not something
that blocks sight. The two are marked separately.

Every edge starts as a **wall**, drawn solid. Press **E** for the Walls tool and click
an edge to switch it to **open**, drawn dashed. **All walls** and **All open** in the
room panel do the whole outline at once, and the counter next to them reads e.g.
"7 walls, 1 open". Only wall edges become line-of-sight in the export; open ones are
recorded in the annotations and the notes file but block nothing.

**Round rooms.** **C** draws a circle: press, drag from the centre out to the rim, and
let go. It is stored as a polygon whose vertex count follows its size, four points per
square of diameter, so a 20-foot turret comes out an octagon, a 30-foot one a
dodecagon, and a big rotunda still reads as round without burying the outline in
handles. The readout while you drag shows the diameter in feet and how many points you
will get. The centre snaps like any other point and, with snap on, the radius steps by
the square (by the half square in the finer snap modes); the vertices in between sit
where the circle puts them, or the shape would come out lumpy. Hold Alt for a centre
and a radius of any size. Circles add and subtract like any other shape, so a round
tower with a stair core is a circle with a smaller circle cut out of it.

Rooms are rarely plain rectangles either. The **New / + / −** control next to the tool
buttons says how the next shape you draw combines with the area already there:
replace it, add to it, or cut it out of it. Holding **Ctrl** while you drag subtracts
for that one stroke without changing the setting. Cut a stair block out of a hall,
carve an alcove, punch a hole around a pillar, or build an L out of two rectangles.
Diagonals work as well as right angles, so the octagonal turrets are no problem.

Each time you add or subtract, the result is merged into one clean outline. You get
corner points only where the shape actually turns, not a scatter of leftovers from the
rectangles you combined, and dragging a handle moves a real corner. Two rectangles
butted together become one; a cut that splits a room in half becomes two outlines; a
hole punched in the middle stays a hole. Wall and open edges are carried through the
merge, and a vertex is kept wherever a wall meets an open stretch.

**Markers have areas too.** A rectangle, circle or polygon drawn for a marker rather
than a room works the same way: a staircase, a pit, a pool of water or a heap of rubble
is an area you can add to and cut out of, with the same handles and the same merge into
one clean outline. The difference is the default. A room's edges start as walls; a
marker's start as **open**, since saying where a staircase sits should not by itself
block sight. Switch any of them with the Walls tool if you do want a marker to block.

With **New** selected, each stroke starts another placement of that marker, which is
how one entry covers six torches. With **+** or **−** — or Ctrl held down — the stroke
reshapes the placement you have selected instead, so you can cut a bite out of one
staircase without starting a second.

**Which edges are open already.** Every outline was compared against the sheet it sits
on: an edge with drawn stone under it or beside it stays a wall, and an edge with pale
floor on both sides and nothing drawn across it was switched to open. Fifty-one edges
came out open, each one checked by eye afterwards, and they are the boundaries you would
expect: the two halves of the front courtyard, the archway between K8 and K9, the mouths
of the K12 turrets, the junctions where the K46 walkway meets the towers, the rim of the
K18a shaft, and the lines where one corridor was split into two areas. Everything else
was left as it was, including doorways: a door in a wall stays a wall here, and the
export punches the hole (see below).

**Walls inside a room.** The outline handles the shell; for everything within it —
partitions, railings, the backs of fireplaces, the columns down the middle of a hall —
press **W** and drag. Each drag lays one wall, the tool stays live so you can keep
going, and Shift keeps a run straight. They belong to whichever room is selected and
are counted in the room panel ("3 inside"), but they stay out of the doors-and-items
checklist so they never affect its tally.

Walls that meet are joined into one polyline on export, so drawing a corner as two
drags gives a single continuous wall. Click one with the Select tool to pick it up,
drag its ends to adjust, Delete to remove it. Everything is undoable.

There is also a **Wall** entry under **+ Add** if you want a named one that appears in
the checklist.

## What is tied to what

Doors get marked twice: once on each room's checklist, because the module describes the
same doorway from both sides. Rather than make you deduplicate by hand, the interface
works out the connections itself and keeps them current as you draw.

- **⇄ next to an entry** means another room's checklist has a marker at the same spot,
  so the two entries are the same physical thing.
- **The room chips** next to an entry are the rooms it touches on the map, plus any room
  its own label names ("south to K9", "up to K47"). Click one to jump there.
- **Leads to** in the room header lists everywhere that room's doors and stairs go.
- Marks also record the other sheets the same entry appears on, which is how K18, K20
  and K21 keep track of themselves across four maps.

All of it is derived from the marks and the module text, so nothing to maintain: move a
door and the links follow. Each mark carries its own copy in the annotations file under
`links`, and the export writes them into the notes file as `sameAs`, `rooms`,
`leadsTo` and `alsoOnSheets`.

## Heights

Everything is measured in feet from the main floor, which is 0. The spine comes from
the one passage that measures the whole castle, the K20 spiral staircase: it "climbs 50
feet to a landing (shown on map 4)", then "ascend[s] another 40 feet to another landing
(shown on map 5), and then climb[s] another 100 feet to a landing beneath the tower's
heart (shown on map 8)". K57 confirms the far end from the other direction: "the
courtyard is 190 feet below".

| sheet | feet | where that comes from |
|---|---|---|
| Walls of Ravenloft | 0 | the courtyard is the same ground as the main floor |
| Main Floor | 0 | the anchor |
| Court of the Count | +50 | first landing on the K20 stair |
| Rooms of Weeping | +90 | "another 40 feet to another landing (shown on map 5)" |
| Spires of Ravenloft | +130 | map 6, the roof level: the sheet is labelled "Down 40 Feet To Map 5" |
| Larders of Ill Omen | −40 | "Down 40 Feet To Map 11" |
| Dungeon and Catacombs | −110 | "Up 70 Feet To Map 11" from the dungeon stairs |

The spires sheet carries book maps 6 through 10, and maps 7 to 10 are the towers, which
stand well above the roof level, so those rooms carry their own elevation rather than
the sheet's:

| room | feet | where that comes from |
|---|---|---|
| K53 Rooftop | 130 to 150 | "the courtyard some one hundred thirty feet below", sloping up to the end peaks |
| K52 Smokestack | 130 to 160 | "rises thirty feet above the roof's peak" |
| K54, K55, K56 (map 7) | 160 | the K48 stair "rises from area K47, past area K54, to area K57", so between 130 and 190 |
| K57 Tower Roof (map 8) | 190 | "The courtyard is 190 feet below" |
| K58 Bridge | 190 | it leaves K57; a fall from it drops "60 feet onto the roof of the keep" |
| K60 North Tower Peak (map 9) | 250 to 259 | a 9-foot ceiling with K60a's trapdoor above it |
| K60a North Tower Rooftop | 260 | "The courtyard lies 260 feet below" |
| K59 High Tower Peak (map 10) | 340 | the K18a shaft "descends 450 feet to the castle catacombs" |

The shafts and the two great staircases run through the whole castle, so they hold the
range they actually cover rather than one sheet's floor: K18 and K18a from the
catacombs at −110 to the high tower peak at 340, K20 from the main floor to the top of
its tower at 250, K31a the elevator shaft from −120 to the K31 trapdoor at 50.

The book argues with itself by ten or twenty feet in a few places, and where it does the
table above follows the statement that is about the room in question, with the dissenting
figure recorded next to the number in `castle-data.json` and `extract.py`. The loudest
example: K18a calls its shaft 390 feet tall while K59 says the same shaft descends 450
feet, which is the difference between putting the high tower peak at 280 and at 340.

Select anything and the **h / to** boxes under the room header set its height: one number
for something at a single elevation (a torch bracket seven feet up), two for a span (a
room from floor to ceiling, a shaft from top to bottom). Leave them empty and the mark
simply sits on its sheet's floor, which the greyed placeholder shows. Forty-eight marks
are already filled in from heights the module states: the chapel's ninety-foot dome, the
six-foot ceiling in the catacomb tunnel, the tower rooms above, and so on. Those are
tagged `"src": "module"` in the file, and `tools/seed_heights.py` only ever overwrites
its own seeds, so anything you type is safe from a re-run. The
height rides along in the export for every marker and every portal.

**Undo.** Ctrl+Z steps back through everything the interface can change: placing,
moving, reshaping and deleting markers, adding a custom row, removing a row from the
list, and grid edits. The two arrows next to the tool buttons do the same and their
tooltips name what they will undo. A run of arrow-key grid nudges collapses into one
step rather than one per keypress. Inside a text box Ctrl+Z is left to the browser, so
it edits your text as usual.

The history lives in the page, so reloading clears it. What survives a reload instead
is `backups/`, which keeps a copy of the annotations file for each minute you edited in,
last 40 kept: close the server, copy one back over
`castle-ravenloft-annotations.json`, and start it again.

**The grid.** All seven maps are drawn at 1 square = 10 feet and all seven are already
measured and aligned, so snapping works out of the box. The pitch was derived three
independent ways and cross-checked against stated room dimensions: K12 is described as
a thirty-foot room and spans exactly three cells on both the main floor and the court
sheet. If you ever want to change it, **Grid setup** has numeric fields, arrow-key
nudging, and a calibrate tool: drag a line along a run of squares and say how many you
crossed. Snap to grid corners for 10-foot placement or half squares for 5-foot. Hold **Alt** to
suspend snapping for as long as you hold it: the dropdown greys out while it is off and
your setting comes straight back when you let go, which is the quick way to put one
marker exactly where it sits on the art rather than on the nearest line.

## The reader

`http://localhost:8731/browse`, or the **Reader** button in the editor's toolbar. Same
server, same annotations file, no way to change anything: the page only ever issues a
GET, and it re-reads the file every few seconds, so anything you mark in the editor
shows up here without a refresh.

Three columns. On the left, the same condensed room library the editor uses, grouped by
floor with each floor headed by its height, minus the editing progress marks. In the
middle, the room itself: its name, the floor it is on and its height, then the module's
own text for the room including any pictures printed with it, then **also drawn on**,
then **ways in and out**. On the right, the map, opened to the room you picked, with
everything outside the room under a dark wash and every marked thing inside it carrying a
badge. Hover a badge and you get the marker's label, its type, the module's note about
it, its height, and where it leads.

Moving between rooms on the same sheet glides the camera across rather than cutting, so
you keep your bearings; a room on another sheet cuts, because the picture changes.
Middle-drag (or right-drag, or space-drag) always pans, whatever is under the cursor,
and clicking the room you are already reading does nothing rather than following one of
its doors.

Pictures come from `References/img`. The module's own illustrations are not part of the
map files, so where a file is missing the reader shows the caption and says so; drop the
image into that folder under the name the text uses and it appears.

Also drawn on lists the other sheets the same room appears on, each with the climb from
where you are now (up 240 ft, down 80 ft) and the floor it sits at. Click one to follow
the room onto that sheet.

Ways in and out is built from the same link data the editor derives, and it says how
each connection is made rather than just that one exists: a door, a secret door, a
spiral stair, a trapdoor, a ladder, a chute, a portcullis, an archway, a teleport, or an
open boundary where two areas simply run together. Each row also says where it comes
out: the floor at the far end when it is a different sheet, and for anything with a rise,
whether it goes up or down and by how many feet, measured from the room as drawn on the
sheet you are looking at. The book's own wording wins over the measurement when the two
disagree, and where one label covers two directions ("up to K30 and down to K61") each
row takes the direction word nearest its own destination. and a rise the sheets cannot measure shows as a plain
"up" or "down". Click a row and you are in that room.
Click a door or a stair on the map and you go the same way. Rows the module describes but
nothing has been marked for yet are listed too, greyed, so the list is as complete as the
book rather than as complete as the marking.

**The castle, floor by floor**, on the right, stacks every sheet as an isometric
silhouette at its own height, against a scale in feet. The slab you are on is lit, the
room you are reading is picked out in gold on it, and clicking a slab takes you to that
sheet. The sheets line themselves up through the rooms they share: K18, K20, K21 and the
shafts are marked on several, so the offset between any two sheets is the difference
between the same room's position on each, and where a room is drawn more than once on a
sheet the alignment that makes the two silhouettes overlap best is the one taken. The
walls sheet shares no room with the keep, so it is placed by its front courtyard, which
abuts the keep's front wall.

The spires sheet carries the roof and four tower drawings printed off to one side, so
each drawing is found as its own cluster, given the height of the rooms the book
measures in it, and moved over the tower it belongs to: by a room it shares with the
floors below where there is one (the shafts, the heart tower), and otherwise by
whatever it connects to. The towers therefore stack up the castle rather than lying
beside it: the roof at 130, the witches' rooms at 160, the tower roof and bridge at 190,
the north tower at 250 and 260, and the high tower peak at 340.

The scale on the left is true to the foot, but the gaps between the drawings are not:
each layer is placed far enough above the one below to be seen whole, and any spare room
is then handed out in proportion to the real climb, so the stack still hints at the
distances. A dashed leader joins each mark on the scale to the layer it belongs to. The
whole thing stretches to the height the panel has and shrinks to fit when there is less.
Changing floor always cuts rather than gliding; moving between rooms on one floor still
glides. **Vertical minimap** in the toolbar, or **S**, hides and shows the panel.

Every pane can be dragged wider by the handle between it and its neighbour, in the
reader and in the editor both; double-click a handle to put it back. The widths are
remembered per browser.

Press **F** to fit the room, **A** for the whole floor, **/** to jump to the search box.
Drag to pan, wheel to zoom, and the URL carries the room, so a link to
`/browse?room=K59` opens on the High Tower Peak.

## Export

**Export VTT** writes one `.dd2vtt` per level into `exports/`, plus a `-notes.json`
listing every marker with its room, label, and grid coordinates.

- Door, secret door, and window markers become portals, **one portal per real opening**:
  a door marked from both rooms is exported once, and the notes file records which marks
  it came from. Two markers of different kinds drawn on the very same line (a door on one
  list, an archway on the other) also count as one.
- **Walls give way where a portal sits.** A door drawn on top of a wall leaves a real gap
  in the line of sight rather than a door stuck behind a solid wall, so the opening works
  the moment the map is imported.
- A door, window or arrow slit marked as a **point** rather than a line is fitted to the
  wall it sits against: it becomes a narrow portal lying along that wall, 2.5 feet for a
  window or slit and 5 feet for a door, with the matching gap cut out of the wall.
- A portal starts **open** when the text says there is nothing in the opening (an archway,
  a doorway with the door gone) and closed otherwise; windows are see-through either way.
- Room outlines contribute their **wall** edges as line-of-sight; edges you marked open
  are left out. Adjacent wall edges are chained into one polyline rather than exported
  one segment at a time.
- Standalone **Wall** markers become line-of-sight too.
- Light markers become lights.
- Every marker in the notes file carries its **height** and its **links**, and the file
  also lists the portals with the marks behind each one.
- The image is cropped to whole grid squares so the exported grid starts at 0,0 and
  needs no nudging in Foundry, Arkenforge, or Fantasy Grounds.
- The grid dropdown defaults to splitting each drawn 10-foot square into 5-foot cells,
  which is what most VTTs expect. Switch it to 10-foot cells to keep the squares as
  they are printed.

Full resolution is the honest choice for a final map; quarter resolution is much faster
while you are testing the import.
