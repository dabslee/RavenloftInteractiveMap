# Castle Ravenloft VTT Mapper

A local tool for marking up the official Castle Ravenloft battlemaps: where each
area from chapter 4 of *Curse of Strahd* sits, what stands in it, and how you get
from it to the next one. Everything you mark is written to a JSON file in this
folder as you work, and can be exported as Universal VTT.

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
| `markers.js` | the data model, read by the editor and the reader both |
| `SCHEMA.md` | what a marker is and why, and the rules the code follows |
| `castle-data.json` | the 150 areas and their module text |
| `castle-ravenloft-annotations-v2.json` | your work: rewritten on every change |
| `migrate.py` | built the file above out of the old one; also validates it |
| `tools/smoke-*.js` | the checks each of those runs |
| `migration-review.md` | what the migration had to guess, and what it could not decide |
| `backups/` | a rolling copy of the annotations, one per minute of editing, last 40 kept |
| `exports/` | Universal VTT output |
| `tools/smoke.js` | runs the editor and the reader headlessly and checks them |
| `extract.py`, `curation.py` | how `castle-data.json` was built; history now |
| `tools/*.py` | the scripts that traced the first-pass outlines and seeded heights |

The battlemaps themselves live outside this folder, in
`References/img/map_packs/`, one folder per set. See [Map packs](#map-packs).

`castle-ravenloft-annotations.json`, without the `-v2`, is the old file this one
was made from. Nothing reads it any more. It is left on disk because it is the
only copy of the work as it stood before the migration; delete it once you are
happy.

## Two kinds of marker

Everything you draw is a **marker**, and there are two sorts.

An **object** is a thing in a place. It belongs to exactly one room, and it is a
room outline, a creature, an item, a trap, or a note. A room's own footprint is
simply an object of type *area* — a room drawn on four sheets has four of them.

A **portal** is a way through. It is not in a room: it **names the two places it
joins**, and it carries a name and a description *for each side*, because the
book describes a doorway twice and the two descriptions are not the same. From
K1 the main doors are "torch flames fluttering on each side of the keep's open
main doors"; from K7 they are the way back out into the rain.

That is the whole of the model, and it is what makes the rest simple. Because a
portal says what it joins, nothing has to work out what connects to what: a
room's ways in and out are a lookup, not a guess. The previous build had to pair
up doors by how close together they were drawn, let you correct the pairing, and
then work around the corrections everywhere — all of which is gone.

Every marker also carries:

- **shapes** — as many as it needs. Six torches are *one* object drawn six
  times, not six records. A marker with no shapes yet is a thing the book
  mentions that you have not placed; it sits in the list, greyed.
- **height** — feet above the main floor, which is 0. Blank means the floor of
  whichever sheet it is drawn on.
- **light** — feet of bright light and feet of dim light, if it shines.

A portal adds what sort of way it is:

| | |
|---|---|
| **open** | cannot be shut: an archway, a stair, a boundary where two areas run together |
| **door** | opens and shuts, and may be lockable |
| **barrier** | never opens: a window, an arrow slit, a grate |

plus **see-through** (does sight pass while it is shut — a portcullis yes, an
oak door no), **secret**, and the state it stands in at the table.

## What is in the data

150 areas: K1–K88, the eight cells each in K74 and K75, and all 40 catacomb
crypts, each with its full module text.

The things in them started as a pattern-matching pass over that text, which
produced plenty of duplicates and mistakes. Every room was then read
individually and corrected in `curation.py`, which recorded what was dropped and
why, what was renamed to what the module actually calls it, and what the pattern
matching missed. Three kinds of error came up again and again: the same object
described several times (K30's four chests were five entries), things that live
in another room (K10 "heard the portcullis clang shut" and got a portcullis,
which is at the gatehouse), and miscategorised ones (K59's "jack-o'-lantern" is
Pidlwick II's painted face, not a lamp).

All 416 of those survived into markers, and every one of them is placed. Each
carries a `seed` naming the entry it came from, so you can still trace a marker
back to the line of the book that produced it. `extract.py` and `curation.py`
are no longer part of the loop — the markers are the data now.

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

Map sheet 6 carries book maps 6 through 10, so every spires room is on it. There
is no separate sheet to switch to.

## Using it

Pick an area in the left column. The middle column fills with **what is in it**
and **the ways in and out**, and the module text sits underneath, collapsed.
Click a row to select that marker; the right-hand panel then edits it.

**One floor at a time.** The middle column shows what is on the sheet you are
looking at, not everything the room has anywhere. K20 is drawn on four sheets
and its staircase climbs past all of them; listing the lot at once would say the
tower roof is next door to the main floor. So on the main floor K20 shows the
stair going *up 50 feet*, on the Court it shows that same stair going back
*down* and the next flight going *up 40*, and on the Spires only the flight
down. **Also on**, under the room name, is how you move between them.

Nothing moves on its own: after a stroke the thing you just drew stays
selected, the view stays put, and the tool you picked stays active. Since the
tool stays live, a left-drag on the map redraws rather than pans — pan with
space-drag, right-drag or the middle button, and Ctrl+Z undoes a stroke you did
not mean.

**Mark room area** draws the room's outline on the sheet showing, making one if
it is not there yet. **+ Add** creates anything else: an item, a creature, a
trap, a note, or a way through. The **×** on a row deletes that marker outright;
**Delete** with a shape selected removes just that one drawing of it and leaves
the marker.

**One marker, as many drawings as it needs.** "Fluttering torches" is rarely one
torch and the text almost never says how many, so pick the marker once and keep
drawing: each click or drag adds another. The row shows the tally (`●6`). The
same goes for doors, stairs, traps and windows, so a hall with openings at both
ends can be one entry placed twice — or two portals, if the two openings lead
somewhere different, which is usually what you want.

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
| 1 / 2 / 3 | new drawing · add to it · subtract from it |
| F | fit the map to the window |
| G | toggle the grid |
| Delete | remove the selected drawing |
| Alt (hold) | snap off while held, back to your setting when you let go |
| Ctrl+Z | undo |
| Ctrl+Shift+Z or Ctrl+Y | redo |

Wheel zooms, space-drag or right-drag pans, Esc cancels whatever you are doing.

Every change — drawing, renaming, retyping, setting a portal's far end — is one
undo step and saves itself a moment later. The badge in the toolbar says whether
it has.

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

**Anything can be an area.** A rectangle, circle or polygon drawn for something other
than a room outline works the same way: a staircase, a pit, a pool of water or a heap of rubble
is an area you can add to and cut out of, with the same handles and the same merge into
one clean outline. The difference is the default. A room outline's edges start as
walls; everything else starts **open**, since saying where a staircase sits should not
by itself block sight. Switch any of them with the Walls tool if you do want a marker to block.

With **New** selected, each stroke starts another drawing of that marker, which is
how one entry covers six torches. With **+** or **−** — or Ctrl held down — the stroke
reshapes the drawing you have selected instead, so you can cut a bite out of one
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
going, and Shift keeps a run straight. A wall goes onto the room's own outline, which
is what a wall belongs to, so it needs no marker of its own and never shows up in the
room's list as a thing to place.

Walls that meet are joined into one polyline on export, so drawing a corner as two
drags gives a single continuous wall. Click one with the Select tool to pick it up,
drag its ends to adjust, Delete to remove it. Everything is undoable.


## Ways between rooms

A portal has two ends and you say what they are. There is nothing to derive and
nothing to correct.

Select a portal and the right-hand panel shows both its ends. Each is either an
area you have named or **not said yet**, and each carries its own name and
description — what the way is called from that side, and how it looks to
somebody standing there.

**Setting an end.** Press **set** (or **change**) beside it and the map arms.
Hover, and the thing you would take is picked out in white with its name beside
the cursor; click to take it. You can change sheets first, and for anything
vertical you must: the top of a stair is on another sheet than its foot, and
clicking up there is what joins the two floors. Esc stands it down.

Things sit on top of one another — a lamp inside a hall, a gate mechanism
inside a courtyard — so the picker offers **everything under the cursor**,
smallest first, and **Tab** steps through the stack. The rest of the stack is
outlined faintly while you choose, and the label says which one of how many you
are on. Any object can be an end, not only a room outline: a place the book
never gave a room of its own, like the inside of a gate tower, is often marked
as something else, and a door has to be able to lead there. The object already
on the portal's *other* side is held back, and the picker says so rather than
appearing to find nothing.

**An end may honestly be nothing.** The outer gate opens onto the road; the
arrow slits look out over the valley. Leave that side unset and the row reads
"far side not said" — which is also what an unfinished one looks like, so the
room list counts them: `12/14 ·2?` means two ways still want an end.

**A vertical passage is one portal per flight**, not one portal through the
whole castle. K20's spiral staircase is three: main to Court, Court to Weeping,
Weeping to Spires. That is what lets a room's list mean *where you can get to
from here in one move* rather than *everywhere this stair eventually reaches*.
Both ends of a flight naming the same room is normal — it is the same room on
two sheets — and the per-side names are what keep it readable.

**The rise is measured, not guessed.** Each end knows the floor it stands on, so
a row says "up 50 ft" because that is the difference between the two. The
previous build read direction words out of the label and got the awkward ones
wrong.

## The reader

`http://localhost:8731/browse`, or the **Reader** button in the editor's
toolbar. Same server, same file, no way to change anything: the page only ever
issues a GET, and it re-reads the file every few seconds, so anything you mark
in the editor shows up here without a refresh.

Three columns. On the left, the same room library the editor uses, grouped by
floor with each floor headed by its height. In the middle, the room: its name,
the floor and height, then the module's own text including any pictures printed
with it, then **also drawn on**, then **in this area**, then **ways in and
out**. On the right, the map, opened to the room you picked, with everything
outside it under a dark wash and everything inside carrying a badge. Hover a
badge for the name, the description, the height, and where it leads.

The middle column is scoped to the sheet you are on, exactly as the editor is
and for the same reason. Both pages get that from `markers.js`, so they cannot
disagree.

Moving between rooms on the same sheet glides the camera across rather than
cutting, so you keep your bearings; a room on another sheet cuts, because the
picture changes.

The reader has the same **Maps** picker as the editor and remembers your choice
alongside it: both pages read `cr.pack` out of the browser's local storage.
Middle-drag (or right-drag, or space-drag) always pans, whatever is under the
cursor, and clicking the room you are already reading does nothing rather than
following one of its doors.

Pictures come from `References/img`. The module's own illustrations are not part
of the map files, so where a file is missing the reader shows the caption and
says so; drop the image into that folder under the name the text uses and it
appears.

**Also drawn on** lists the other sheets the same room appears on, each with the
climb from where you are now and the floor it sits at. Click one to follow the
room onto that sheet.

**Ways in and out** says how each way is made rather than just that one exists —
a door, a secret door, a spiral stair, a trapdoor, a ladder, a portcullis, an
archway, or an open boundary where two areas simply run together — and whether
it stands open, shut or locked. Each row says where it comes out, the sheet at
the far end when that differs, and the rise in feet. Click a row, or the thing
itself on the map, and you are there.

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

## Map packs

The battlemaps are not referenced one by one any more. They live in

```
References/img/map_packs/
  default/     the sheets as published with Curse of Strahd
  dm_andy/     DM Andy's redraws
```

and `castle-data.json` names every sheet inside `map_packs/default`. The **Maps** picker
in the toolbar — in the editor and in the reader both — swaps that one path segment, so
choosing another pack redraws the same castle under the same marks. Nothing about your
annotations changes: marks are in map pixels, and a pack is expected to match the sheet
it replaces pixel for pixel. The reader routes the battlemap figures printed with the
module text through the picker too, so the sheet in the text matches the sheet on the
canvas.

**Adding a pack.** Make a folder next to the others and put any of the fourteen file
names from `default/` inside it. That is the whole of it: the server lists the folders on
disk, so it shows up in the picker the next time you load the page. A pack only has to
hold the sheets it actually redraws — anything it leaves out falls back to `default`,
which is what lets a pack replace a single floor.

An optional `pack.json` in the folder gives it a proper name in the picker:

```json
{ "name": "DM Andy", "note": "Redraws at the same pixel dimensions as the official sheets." }
```

Without one the folder name is used. Each sheet's pixel size is read off its header when
the list is built, and the picker says so if a sheet is not the size the grid for that
floor was measured against; it is drawn stretched to fit, which keeps the marks in place
but will look soft if the two really differ.

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

## Export

**Export VTT** writes one `.dd2vtt` per level into `exports/`, plus a
`-notes.json` carrying everything the format has nowhere to put.

Portals come straight off the model. Each one says what it is, so there are four
rules and no guesswork:

| | in the wall | in the VTT |
|---|---|---|
| **open** | cut away | nothing — it is a hole, not a door |
| **door** | cut | a door, shut unless it stands open |
| **barrier**, see-through | cut | a portal that never blocks sight |
| **barrier**, solid | left whole | nothing |

Only a portal drawn as a **line or a point** is an opening. One drawn as an area
is a footprint — a staircase, the mouth of a shaft — and cutting every wall it
overlapped would open the rooms it merely passes through.

- A door or slit marked as a **point** is fitted to the wall it sits against: it
  becomes a narrow portal lying along that wall, 5 feet for a door and 2.5 for a
  slit, with the matching gap cut out.
- Room outlines contribute their **wall** edges as line-of-sight; edges you
  marked open are left out. Adjacent wall edges are chained into one polyline.
  Walls drawn inside a room go in too.
- Anything with a **light** and a point drawn for it becomes a light: dim is the
  reach, bright sets how hard it burns.
- The notes file lists every marker with its height, every room with its floor
  and its ways out — each with the rise and the sheet it lands on — and every
  portal with both its ends by name, room and floor.
- The image comes from whichever map pack is showing, so you can export the same
  castle twice with two different sets of art and the geometry will be identical.
- The image is cropped to whole grid squares so the exported grid starts at 0,0
  and needs no nudging in Foundry, Arkenforge, or Fantasy Grounds.
- The grid dropdown defaults to splitting each drawn 10-foot square into 5-foot
  cells, which is what most VTTs expect.

Full resolution is the honest choice for a final map; quarter resolution is much
faster while you are testing the import.

What the current file produces, geometry only:

| sheet | squares | portals | sight lines | lights |
|---|---|---|---|---|
| Main Floor | 34 × 23 | 50 | 49 | 16 |
| Court of the Count | 34 × 23 | 26 | 34 | 7 |
| Rooms of Weeping | 34 × 24 | 35 | 40 | 7 |
| Spires of Ravenloft | 49 × 33 | 41 | 74 | 3 |
| Larders of Ill Omen | 23 × 16 | 19 | 17 | 9 |
| Dungeon and Catacombs | 30 × 30 | 81 | 75 | 6 |
| Walls of Ravenloft | 43 × 58 | 19 | 25 | 4 |

## Checking it

There is no browser here and no test framework. `tools/smoke.js` evaluates a
page in a VM with a stubbed DOM and then runs a script of checks in the same
context, so the checks call the page's own functions against the real file:

```
node tools/smoke.js . reader     rooms, sidebars, the one-floor-at-a-time rule
node tools/smoke.js . editor     drawing, portals, undo and redo
node tools/smoke.js . export     UVTT geometry and the notes file
node tools/smoke.js . picker     setting a portal's far end
```

The reader pass walks all 184 room/sheet pairs and asserts nothing off-sheet is
listed. The editor pass draws, combines areas, sets a portal's far end across
sheets, deletes an object and checks the portal survives with its wording, then
undoes every step back to the starting count and redoes them. The export pass
builds all seven sheets and checks the four portal rules hold.

`python migrate.py --validate castle-ravenloft-annotations-v2.json` checks the
file itself against the rules in `SCHEMA.md` — that every portal has two ends
pointing at real places, that an object's drawings are all on one floor, that a
lockable thing is a door, and so on.

## Where the old model went

The previous build stored a *mark* per room per thing, keyed like
`feat:K1::f1#2@walls`, and worked out the connections between rooms by pairing
marks that were drawn close together. `SCHEMA.md` explains what replaced it and
why, and `migration-review.md` lists what the conversion had to guess — 323
items, most of them cosmetic, but including 66 portals whose far side it could
not work out and 19 places where the same doorway looks to have been marked more
than twice. Those are the ones worth a look, and the editor's side picker is how
you settle them.
