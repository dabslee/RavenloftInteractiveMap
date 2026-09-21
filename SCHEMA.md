# Markers: the data model

This replaces the room / feature / mark / link system described in
[README.md](README.md), which is now out of date and describes the old model
throughout.

It was written as a specification, before any of it was built. All of it is
built now — `migrate.py`, `markers.js`, the reader, the editor and the export —
so read it as both: the rules the code follows, and the argument for why.

The change in one sentence: **a physical thing is one record, and a passage
names its own two ends**, instead of a thing being an entry on a room's
checklist that the app has to guess is the same as an entry on another room's
checklist.

Everything that follows is a consequence of that.

## Why

The old model made a door two records, one per room, because the book describes
every doorway twice. So the app had to work out that they were the same door
(`sameSpot`), let you correct it when it was wrong (`linkEdits`, four lists of
pairs), dedupe the corrected guesses when listing a room's exits (`buildWays`),
cluster them all over again at export time (`portalsOverlap`), cache the answer
onto every mark (`links.ways`, `links.reach`), and warn the reader when the
cache was stale.

None of that is needed once a door has two sides. "What connects to what" stops
being a derivation and becomes a lookup.

---

## The three things

| | lives in | edited on the map | has a room |
|---|---|---|---|
| **Room** | `castle-data.json` | no | is one |
| **Object marker** | annotations | yes | yes, exactly one |
| **Portal marker** | annotations | yes | no — reached through its sides |

### Room

Reference data from the module. The app reads it and never writes it.

```json
{
  "id": "K20",
  "name": "Heart of Sorrow",
  "level": "main",
  "parent": null,
  "kind": "room",
  "alsoOn": ["court", "weeping", "spires"],
  "elevationFeet": 130,
  "elevationNote": "...",
  "text": "...the module text, markdown..."
}
```

`kind` is `room`, `subarea` or `crypt`, as now.

A Room is a name and a piece of book text. It has no geometry of its own: where
K20 *is* on a map is an Object marker with `objectType: "area"` and
`room: "K20"`. A room drawn on four sheets has four such objects.

The `features` array in `castle-data.json` is **no longer read by the app**
after migration. It stays in the file as the provenance of the seeded markers
and as the input to any future re-seed (see
[Seeding](#seeding-and-the-to-do-list)).

### Marker: what both kinds share

```json
{
  "kind": "object",
  "shapes": [],
  "height": { "at": 0 },
  "light": { "bright": 20, "dim": 40 }
}
```

- **`kind`** is `object` or `portal`.
- **`shapes`** — zero or more. Zero is legal and meaningful: a thing the book
  describes that you have not drawn yet.
- **`height`** — feet above the main floor, which is 0, as today. Either
  `{ "at": n }` or `{ "from": a, "to": b }` for something with a span, or
  `null`. Null means *use the floor underneath*: the sheet's `elevationFeet`,
  or the room's own `elevationFeet` where the book measures the room directly
  (the spires sheet carries book maps 6 to 10, and the towers on it stand well
  above the roof level).
- **`light`** — feet of bright light and feet of dim light, measured from the
  marker. Null means the thing does not shine. Dim is measured from the marker,
  not from the edge of bright, so a torch is
  `{ "bright": 20, "dim": 40 }`.

### Shapes

```json
{ "type": "area",  "level": "main", "parts": [ { "op": "add",
                                                 "ring":  [[0, 0]],
                                                 "edges": [1] } ] }
{ "type": "line",  "level": "main", "x1": 0, "y1": 0, "x2": 0, "y2": 0, "wall": true }
{ "type": "point", "level": "main", "x": 0, "y": 0 }
```

Coordinates are pixels on the measured sheet, as now. `op` is `add` or `sub`.
`edges[i]` is the edge from `ring[i]` to `ring[i+1]`: **1 = wall, 0 = open**,
unchanged from today.

Rectangle and circle are *drawing tools*, not stored types — both produce an
`area`, a circle as a polygon whose vertex count follows its diameter. There is
one polygon representation, with boolean add/subtract parts and per-edge wall
flags, and it is the one already implemented.

Defaults when a shape is drawn: an `area` on an object with
`objectType: "area"` starts all wall; every other area starts all open; a
`line` starts `wall: true` when drawn with the wall tool and `wall: false`
otherwise.

**Which levels a marker's shapes may sit on**

- An **Object**'s shapes must all name the same `level`.
- A **Portal**'s shapes must each name the level of one of its two sides, so at
  most two levels, and a vertical passage is normally drawn once on each — the
  stair's footprint below, the landing above.

This is the one place the "all shapes on one floor" rule is relaxed, and only
because a stair between two sheets is genuinely drawn on both.

### Object marker

```json
{
  "kind": "object",
  "objectType": "area",
  "room": "K7",
  "name": "Bronze double doors to the east",
  "description": "...",
  "shapes": [],
  "height": null,
  "light": null,
  "seed": "K7::f3"
}
```

- **`room`** is required and is exactly one room id. It is what the sidebar
  groups by and what a portal side resolves to.
- **`objectType`** is `area`, `creature`, `item`, `trap` or `note`, and drives
  colour only. `area` is the room's own footprint; `note` is a remark pinned to
  a spot, of which there are five.
- **`seed`** is the `castle-data.json` feature id this came from, or null for
  one you made. It is provenance, never read for behaviour.

The old `light` and `wall` feature types are gone: a lamp is any object with
`light` set, and a wall is a `line` shape with `wall: true` on whatever object
it belongs to — normally the room's own area object, which is where the 44
`iwall:` marks land.

### Portal marker

```json
{
  "kind": "portal",
  "passage": "door",
  "lockable": true,
  "transparent": false,
  "secret": false,
  "state": "closed",
  "sides": [
    { "marker": "o_7fk2p10q4c", "name": "Main doors",
      "description": "Torch flames flutter on each side of the open main doors." },
    { "marker": "o_b1d9xx02mm", "name": "Doors to the courtyard",
      "description": "The way you came in." }
  ],
  "shapes": [],
  "height": null,
  "light": null,
  "seeds": ["K1::f1", "K7::f1"]
}
```

**`passage`** replaces *openable* and *closable*. Those two booleans have four
combinations and one of them — neither — is a wall, not a portal. The three
that mean something each get a name:

| openable | closable | `passage` | what it is |
|---|---|---|---|
| yes | yes | `door` | a door, gate, portcullis, trapdoor, hatch |
| yes | no | `open` | an archway, a stair mouth, an open boundary, a gaping doorway |
| no | yes | `barrier` | a window, an arrow slit, a grate, a barred opening |
| no | no | — | not a portal; draw a wall |

**`transparent`** means vision passes *while the portal is shut*. A portcullis
is transparent, an oak door is not, a curtained archway is `open` and opaque.

**`state`** is the default at the table, one of `open`, `closed` or `locked`,
and it replaces the two default-status booleans. Locked implies closed, so one
field with three values has no invalid combination to guard against.

**`secret`** is a flag, not a type. The old `secret-door` type could only ever
be a door; a secret passage is now any portal with `secret: true`, which also
covers the secret archway and the concealed grate.

**`sides`** is exactly two entries, in no particular order. Each has:

- **`marker`** — the id of an **Object** marker, or null. Null means the far
  side is not a mapped place: the outer gate opens onto the road, the arrow
  slits look out over the valley. Around 60 of the current marks are like this.
  Null is also the honest state for a passage you have drawn from one side and
  not yet resolved.
- **`name`** and **`description`** — how the portal looks *to someone standing
  on that side*. This is the point of per-side text: K1 sees the keep's open
  main doors, K7 sees the way back out into the rain.

**Every portal is one step of travel.** A passage that runs through four floors
is not one portal with many ends; it is one portal per flight, each joining
objects on the same or adjacent floors. This is what makes a room's sidebar
mean *directly reachable* rather than *eventually reachable*. K20's spiral
staircase:

| portal | side A | side B | `passage` |
|---|---|---|---|
| flight 1 | K20 area @ main (0 ft) | K20 area @ court (50 ft) | `open` |
| flight 2 | K20 area @ court | K20 area @ weeping (90 ft) | `open` |
| flight 3 | K20 area @ weeping | K20 area @ spires (190 ft) | `open` |
| archway | K20 area @ court | K13 area @ court | `open` |
| secret door | K20 area @ court | K34 area @ larders | `door`, secret |

Both sides naming objects of the *same* room is normal and correct; the
per-side names are what keep it readable ("up the spiral staircase to the K13
landing" rather than "leads to K20").

---

## Identifiers

Every marker has an `id`: the letter `o` or `p`, an underscore, and ten
characters of base36, minted once and never reused.

**Nothing may parse an id.** Not the room, not the level, not the kind beyond
the leading letter, not a placement number. The old keys encoded all four
(`feat:K1::f1#2@walls`), which is why moving a door between rooms, renaming a
feature and drawing a second instance each needed their own machinery. Every
question an id used to answer is now a field you read.

Deleting an object sets any portal side pointing at it back to null, keeping
that side's name and description. A portal is never deleted as a side effect.

---

## The annotations file

```json
{
  "version": 2,
  "updated": "2026-09-19T10:04:11",
  "grids": { "main": { "size": 86.51, "offsetX": 0, "calibrated": true } },
  "markers": {
    "o_7fk2p10q4c": { "kind": "object" },
    "p_0c9wq44m1n": { "kind": "portal" }
  },
  "roomNotes": { "K7": "...your own notes on this room..." }
}
```

Gone, and not replaced: `marks`, `customFeatures`, `hiddenFeatures`, `renames`,
`linkEdits`, `roomStatus`.

Each of those existed to patch a list the app could not edit directly. With
markers as plain records, hiding a feature is deleting a marker, adding one is
adding a marker, renaming is editing `name`, and a link correction is editing a
side. `grids` and `roomNotes` are unchanged.

### Nothing derived is stored

The old file carried `links` on every mark — `same`, `rooms`, `to`, `levels`,
`reach`, `ways` — because deriving it was expensive and the reader could not do
it. All of it goes. The three indexes the UI needs are built at load in one
pass over the markers and held in memory only:

```
objectsOfRoom   roomId  -> [objectId]    group by object.room
portalsOfRoom   roomId  -> [portalId]    for each side, the room of side.marker
markersOnLevel  levelId -> [markerId]    from each shape's level
```

There is no stale-cache case, so the reader's "open the editor once and let it
save" warning goes too.

All of it lives in **`markers.js`**, a plain script loaded before `app.js` and
`browse.js`. The editor and the reader read the model through it and neither
works anything out for itself, which is the same discipline `links.ways` was
reaching for in the old model and never quite got: one place to be wrong.

---

## Seeding and the to-do list

The room list stays as it is: every room, grouped by floor, with a progress
count — because the 416 curated feature entries are worth keeping as a
checklist of what the book says is in each room.

They become markers with **no shapes**. "Unplaced" is then an empty `shapes`
list and needs no special case anywhere: it draws nothing, it shows greyed in
the sidebar, and it counts against the room's total.

A room's progress is:

- **area** — does the room have an `area` object with at least one shape?
- **placed / total** — objects of this room with shapes, over all objects of
  this room.
- **loose ends** — portals of this room with a null side, shown separately,
  because a null side is sometimes the right answer.

An unplaced *passage* seeds as a portal with side A set to the room's area
object and side B null, so it appears in that room's sidebar as a to-do and the
reader can still say the module describes this and nothing is drawn yet.

---

## What a room's sidebar shows

Identical in the editor and the reader; the editor adds controls, not content.
Both read it out of `markers.js`, which is the only place any of it is worked
out, so the two cannot drift apart.

**A room is looked at one floor at a time.** The lists below hold what is on
the sheet in front of you, not everything the room has anywhere. K20 is drawn
on four sheets and its staircase climbs past all of them; showing all of it at
once says the tower roof is next to the main floor. So:

- an **object** is listed when it belongs to the room *and its shapes are on
  the sheet being shown*;
- a **portal** is listed when the side that lands in this room is an object on
  the sheet being shown. That is what puts a flight of stairs on both floors it
  joins — its two ends are the same room on two sheets, so one end matches
  below and the other above, and each floor sees it going the other way;
- something **not drawn yet** has no floor to sit on, so it is listed on the
  room's home sheet — its own sheet from the book if it is drawn there, else
  the lowest sheet it is drawn on — and a room drawn nowhere shows its undrawn
  things wherever you are, since no other sheet would.

"Also drawn on" is how you reach the room's other floors.

1. **The room** — id, name, floor, height, parent, and the other sheets its
   area objects appear on, with the rise to each.
2. **The book** — `room.text`, rendered as markdown.
3. **Objects** — the room's objects on this sheet. Area first, then creature,
   item, trap, note; within a type, drawn before undrawn. Each row: colour dot,
   name, description, height if set, light if set, and a count of shapes on
   this sheet where it is more than one.
4. **Portals** — the room's ways in and out on this sheet. Each row shows:
   - the **near** side's name and description — the side whose object is in
     this room;
   - where it comes out: the far side's room and its name, or "outside" when
     the far side is null;
   - the rise, from the two sides' objects' heights, with an up, down or level
     arrow;
   - what kind of way it is, from `passage` plus `secret` and `state`.

   Sorted: portals that go somewhere before ones that do not, then by
   `passage`, then by the far room's id.

A portal whose two sides are both in this room (a stair flight between two of
K20's own area objects) is listed once, with the near side being the one on the
sheet currently displayed.

---

## Export

Unchanged in outline; the rules get shorter because the data now says what the
old code had to infer from labels.

**Line of sight** — every `wall: true` edge of every area shape, plus every
`line` shape with `wall: true`. Joined into polylines as now.

**Portals**

| `passage` | in the wall | UVTT |
|---|---|---|
| `open` | cut the wall away | nothing emitted — it is a hole, not a door |
| `door` | cut the wall | a portal, closed unless `state` is `open` |
| `barrier`, transparent | cut the wall | a portal, `closed: false`, so vision passes |
| `barrier`, opaque | leave the wall | nothing emitted |

**Only a portal drawn as a line or a point is an opening.** A portal drawn as
an *area* is a footprint — a staircase, the mouth of a shaft — and cutting
every wall it overlapped would open the rooms it merely passes through. An
open boundary needs no cut in any case: the outline's own edge flags already
leave it open. On the main floor that is 11 area-shaped portals which rightly
punch nothing.

This replaces `opensClear()` and its three regexes over the label (`NO_LEAF`,
`ARCH`, `HAS_LEAF`), and the whole of `portalsOverlap` / `mergePortal` — there
is nothing left to deduplicate, because a portal was never two records.

What comes out of the current file, geometry only:

| sheet | squares | portals | LoS chains | lights |
|---|---|---|---|---|
| Main Floor | 34 × 23 | 50 | 49 | 16 |
| Court of the Count | 34 × 23 | 26 | 34 | 7 |
| Rooms of Weeping | 34 × 24 | 35 | 40 | 7 |
| Spires of Ravenloft | 49 × 33 | 41 | 74 | 3 |
| Larders of Ill Omen | 23 × 16 | 19 | 17 | 9 |
| Dungeon and Catacombs | 30 × 30 | 81 | 75 | 6 |
| Walls of Ravenloft | 43 × 58 | 19 | 25 | 4 |

The main floor's 50 are 12 doors, which export shut, and 38 see-through
barriers, which export standing open so sight passes them. UVTT has no way to
say "blocks a body, not an eye", so that is the honest mapping and it is the
one the old build made too.

**Point-drawn portals** keep the current behaviour: a portal whose only shape
is a point snaps to the nearest wall within 0.9 grid squares and opens a gap
along it, 5 ft for a `door`, 2.5 ft for a `barrier`. 55 of the current marks
are drawn this way and they are not a mistake — a door *is* a point on a wall.

**Lights** — every marker with `light` set and a point shape. `range` is `dim`,
`intensity` scaled from bright over dim, as the format allows only one radius.

**Notes file** — markers as stored, with `room` resolved to its name, plus for
each portal the two sides' rooms, names and heights. The `sameAs`, `rooms`,
`leadsTo` and `alsoOnSheets` fields disappear; `sides` says all of it.

---

## Validation

A file that breaks any of these is a bug in whatever wrote it. The validator
runs after migration and in the editor's save path.

1. `objectType` requires an object; `passage` requires a portal.
2. An object's `room` names a room in `castle-data.json`.
3. An object's shapes all name the same `level`.
4. A portal has exactly two sides. Each `marker` is null or the id of an
   existing **object**, and the two are not the same object.
5. A portal's shapes name only levels belonging to its sides' objects — an
   error once both sides are resolved, a warning while one is still null,
   since a shape cannot be checked against a side nobody has named yet. A
   portal with no non-null side may have no shapes.
6. The two sides' levels are the same or adjacent in the floor order. Floors
   are ranked by **height, not by sheet**: the walls sheet and the main floor
   are both at 0 ft and so are one floor, one step from the court above and
   the larders below. *Warning, not an error: the K18a shaft drops 450 feet
   past everything.*
7. `lockable` requires `passage` to be `door`.
8. `state` of `locked` requires `lockable`; any `state` but `open` requires
   `passage` not to be `open`.
9. `passage` of `barrier` requires `state` to be `closed`.
10. `height.from` is at most `height.to`; `light.bright` is at most `light.dim`.
11. Area rings have at least three points, and as many `edges` as ring points.
12. No two portals share the same pair of non-null sides *and* overlapping
    shapes. *Warning: K47 really does have two doors to K48.*

---

## Migration

`migrate.py` reads the v1 annotations plus `castle-data.json` and writes
`castle-ravenloft-annotations-v2.json` and `migration-review.md`. It never
edits in place; the v1 file is left alone. Ids are minted from a hash of what
the marker came from, so running it twice gives the same ids and an empty diff.

`python migrate.py --validate FILE` runs the rules above on their own.

### What came out

Measured on the current annotations file, not estimated:

| | count |
|---|---|
| objects | 388 |
| - room outlines | 184 |
| - items, creatures, traps, notes | 204 |
| portals | 289 |
| - doors | 143 |
| - barriers (windows, slits, grates) | 81 |
| - open (archways, stair flights, boundaries) | 65 |
| - with both sides resolved | 224 |
| - with one side still null | 65 |
| shapes | 1011 |

1004 v1 marks became 1011 shapes. The seven extra are the one wall-type
feature, an octagon of masonry blocking the K18 stair, which becomes eight
wall lines on K18's outline. Every other mark is accounted for one to one.

Nothing was lost: all 416 placed features appear in some marker's `seed` or
`seeds`, all 21 secret doors carry `secret: true`, all 150 rooms still have an
outline, and all 14 open-boundary room pairs became portals. The validator
reports **0 errors and 22 warnings**, of which 19 are rule 12 — two portals
between the same pair of places, which is sometimes right.

### How the pieces map

| from | to | count |
|---|---|---|
| `room:*` marks | area objects | 184 |
| `iwall:*` marks | `line` shapes, `wall: true`, on the room's outline | 44 |
| non-passage `feat:*` marks | objects, placements merged into `shapes` | 454 |
| `customFeatures` | objects with no seed | 6 |
| `renames` | applied to `name` | 2 |
| stale `hiddenFeatures` ids | dropped, listed in the review | 9 of 62 |
| `how: "open"` ways | portals, `passage: "open"`, no shapes | 24 |

**Placements collapse into shapes.** Six torches were six marks of one feature
and become one object with six point shapes. That is what `shapes` being a list
is for, and what the old `#n` suffix meant.

**Open boundaries need no shape.** The gap is already in the outline, as edges
flagged open, and `passage: "open"` cuts nothing at export. v1 stored its ways
list on *every* sheet a room is drawn on, so 42 (room, room, level) triples
reduce to 24 real portals over 14 room pairs; the rest named a floor the far
room is not drawn on.

**Passages.** Placements are grouped by v1's `same` links — which already
include the links made by hand — and each group becomes one portal. A group
marked from two rooms gives both sides directly. A group from one room takes
its far side from `links.reach` when that names exactly one room, and is left
null otherwise.

**Stairs drawn on several sheets become flights**, one per pair of adjacent
floors, before anything else runs. `K18::f1` becomes 5 flights from the
dungeon up to the spires; `K20::f2` becomes 3. Each flight takes the shapes
drawn on its lower floor, and the topmost flight also takes the shapes on the
floor above, so every shape is used exactly once.

The pass that pairs a leftover stair with one on the adjacent floor found
nothing to do: `links.reach` had already resolved the far side of every stair
but thirteen, and those thirteen have no candidate to pair with.

### Type mapping

| v1 type | v2 |
|---|---|
| `door` | portal, `passage: "door"` |
| `secret-door` | portal, `passage: "door"`, `secret: true` |
| `window` | portal, `passage: "barrier"`, `transparent: true` |
| `stairs` | portal, `passage: "open"` |
| `light` | object, `objectType: "item"`, `light: { "bright": 20, "dim": 40 }` |
| `wall` | `line` shapes, `wall: true`, on the room's area object |
| `item`, `creature`, `trap`, `note` | object, the same `objectType` |

Where one opening was marked as two different types from its two sides, the
stronger one wins: secret door over door over stairs over window.

Two things are read out of the text rather than defaulted, and both only ever
switch a flag **on**:

- a door whose text mentions a **lock** gets `lockable: true` — 26 of them,
  mostly the K74 and K75 cell doors;
- a door that reads as **see-through** — portcullis, barred, grate, grating,
  lattice, glass — gets `transparent: true`, which is 32 doors.

Everything else is a type default. An archway is `open`, a gaping doorway is
`open`, a curtained way is `open` and opaque.

### The review file

`migration-review.md` lists all 302 judgement calls, worst first:

| section | count | what it is |
|---|---|---|
| Needs a far side | 66 | one side still null: 41 barriers (mostly slits and windows onto the outside, where null is right), 13 open, 11 doors, and one portal drawn on a floor neither side stands on |
| Check | 145 | 143 where the far side's name was copied from the near side because only one side was ever labelled, plus 2 openings marked from three rooms where the third was dropped |
| Stairs | 2 | the flights built across floors |
| Guessed transparency | 32 | see-through doors |
| Guessed lock | 26 | doors the text says lock |
| Guessed light | 21 | light features given a 20/40 ft torch, which the module almost never states |
| Folded in | 1 | the masonry wall that became part of K18's outline |
| Dropped | 9 | stale hidden-feature ids |

None of it blocks: a portal with a null side is a valid state that saves, draws
and exports. The 143 copied names are cosmetic — the portal is right, only its
far-side wording is borrowed — so the real work is the 66 far sides and the 19
duplicate pairs the validator warns about.

## What is not changing

Undo and the snapshot stack, the one-file-per-minute backups, grid calibration,
map packs, the export crop and UVTT writing, the reader's isometric floors view
(which needs only the area objects per level), and `serve.py`'s four endpoints.

## Order of work

1. **Done.** `migrate.py` and the validator, run against the real file until
   the review list is understood. Nothing in the app changed.
2. **Done.** The reader. It only reads, and porting it first proved the sidebar
   contract above on real data before any editing code was written. It is on
   `/api/annotations-v2`; the editor is still on `/api/annotations`, so the two
   endpoints stay separate until step 3 lands.
3. **Done.** The editor's data layer and selection model. The data layer came
   out of the reader into `markers.js`, which both pages load. `app.js` is
   rewritten on it: `S.markerId` is what drawing goes into, `S.sel` is the one
   shape in hand, and every write goes through `edit()` so undo and save are in
   one place instead of at forty call sites.
4. **Done.** The editor's tools: drawing appends shapes, the boolean modes
   combine into the shape in hand, walls land on the room's own outline, and a
   portal's two ends are set by arming the map and clicking an outline — on
   another sheet if that is where the far end is.
5. **Done.** Export. Portals come straight off the model instead of being
   clustered out of overlapping marks, and the notes file now carries each
   room's ways with their rise, and each portal's two ends by name.
6. Delete `sameSpot`, `roomsTouching`, `textTargets`, `buildWays`,
   `buildReach`, `applySameEdits`, `portalsOverlap`, `mergePortal`,
   `opensClear`, `splitKey` and the links panel. **Done** — they went with the
   rewrite rather than after it. `app.js` is 2618 lines against 3546.

## Checking it

There is no browser and no test framework. `tools/smoke.js` evaluates a page
in a VM with a stubbed DOM and then runs a script of checks *in the same
context*, so the checks call the page's own functions against the real
annotations file:

```
node tools/smoke.js . reader     rooms, sidebars, the floor rule
node tools/smoke.js . editor     drawing, portals, undo and redo
node tools/smoke.js . export     UVTT geometry and the notes file
```

The reader pass walks all 184 room/sheet pairs and asserts nothing off-sheet
is listed; the editor pass draws, combines areas, sets a portal's far end
across sheets, deletes an object and checks the portal survives with its
wording, then undoes every step back to the starting marker count and redoes
them; the export pass builds all seven sheets and checks the four portal rules
hold and that no number in the output is non-finite. Between them they caught
four real bugs during the port.
6. Delete `sameSpot`, `roomsTouching`, `textTargets`, `buildWays`, `buildReach`,
   `applySameEdits`, `portalsOverlap`, `mergePortal`, `opensClear`, `splitKey`
   and the links panel — roughly a third of `app.js`.
