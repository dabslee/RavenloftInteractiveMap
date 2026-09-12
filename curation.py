"""Room-by-room corrections to the extracted feature lists.

Keys are room ids. Within a room:
  drop     -- feature numbers ("3" = ::f3) to remove: duplicates of another
              entry, or things that are not objects to place
  relabel  -- feature number -> the name the module actually gives it
  retype   -- feature number -> a better category
  add      -- (type, label, note) for objects the text describes that the
              pattern matching missed

Feature numbers refer to the ids produced by extract.py and never change, so
markers already placed against them stay attached.
"""

CURATION = {
    # ---------------- Walls of Ravenloft (K1-K6) ----------------
    "K1": {
        # the round window over the doors is described three times
        "drop": ["5", "6", "9"],
        "relabel": {"8": "Drawbridge and portcullis mechanism"},
    },
    "K2": {"drop": ["1", "3"]},          # one pair of gates, described thrice
    "K3": {"drop": ["3"]},               # "stuck door" is the slender door again
    # the coach itself is the object here; Brandon already added it by hand, so
    # it is not re-added from the data side
    "K4": {"drop": ["2", "3"]},          # glass and lanterns belong to the coach
    "K6": {"drop": ["3"]},               # the platform is the overlook itself

    # ---------------- Main Floor (K7-K24) ----------------
    "K7": {
        "drop": ["3", "5"],              # sconces and torchlight are the torches
        "relabel": {"1": "Ornate outer doors (west, to the courtyard)",
                    "4": "Inner double doors (east, to K8)",
                    "6": "Four dragon statues (red dragon wyrmlings)"},
        "retype": {"6": "creature"},     # they animate and attack
    },
    "K8": {
        "drop": ["2", "7"],              # sconces and "feeble torches" are the torches
        "relabel": {"3": "Eight stone gargoyles on the dome rim",
                    "5": "Bronze double doors (east, and south to K9)",
                    "6": "Wide staircase up to K19 (north)"},
        "retype": {"3": "creature"},
        "add": [("item", "Stone columns",
                 "Columns supporting the vaulted ceiling; cobwebs stretch between them.")],
    },
    "K9": {
        "relabel": {"1": "Torches",
                    "2": "Spiral staircase, up to K30 and down to K61 (east)",
                    "3": "Suit of plate armour in a shallow alcove",
                    "4": "Large double doors to the dining hall (west)"},
    },
    "K10": {
        # the portcullis and drawbridge are the gatehouse's, only heard from here
        "drop": ["6", "7"],
        "relabel": {"1": "Crystal chandeliers (three)",
                    "2": "Long dining table",
                    "4": "Floor-to-ceiling mirrors flanking the organ",
                    "5": "Double doors to the guests' hall",
                    "8": "Secret door behind the organ, to K11"},
        "add": [("item", "Stone pillars",
                 "Pillars of stone stand against the marble walls, supporting the ceiling.")],
    },
    "K11": {
        "drop": ["4"],                   # the organ stands in K10
        "relabel": {"1": "Arrow slits (north and west walls)",
                    "2": "Framed mirrors (seventeen, leaning against the walls)",
                    "3": "Secret door in the east wall, behind the organ"},
    },
    "K12": {"relabel": {"1": "Ceiling frescoes"}},
    # K13 is a bare corridor: nothing to place
    "K14": {
        "relabel": {"1": "Life-sized knight statues lining both walls",
                    "2": "Double doors (one set at each end)"},
        "add": [("item", "Bronze sun symbol",
                 "Beaten bronze, like a rising or setting sun, hung above the doors to K15.")],
    },
    "K15": {
        "drop": ["2", "5"],              # the balcony is K28; the platform is the altar's
        "relabel": {"1": "Stained-glass windows, broken and boarded up",
                    "3": "Dust-covered benches in disarray",
                    "4": "Altar on its stone platform",
                    "6": "Icon of Ravenloft (silver statuette on the altar)",
                    "7": "Gustav's corpse: fur-lined cloak and chain mail",
                    "8": "Black mace (mace of terror) on the floor"},
    },
    "K16": {
        "drop": ["2"],                   # the alcoves are where the statues stand
        "relabel": {"1": "Stairs up to K29 (west)",
                    "3": "Knight statues in the north and south alcoves"},
    },
    "K17": {
        "drop": ["2"],
        "relabel": {"1": "Stair landing to K18 (west)",
                    "3": "Knight statues in the north and south alcoves"},
    },
    "K18": {
        "drop": ["2"],                   # the shaft is K18a
        "relabel": {"1": "Spiral staircase around the central shaft"},
        "add": [("wall", "Masonry wall blocking the stair",
                 "Recently built, 10 feet below the landing west of K17. A chink in it "
                 "lets gas, or a vampire in gaseous form, through."),
                ("item", "Crack through to the wine cellar",
                 "1/2 inch wide, 30 feet below the masonry wall; opens into K63.")],
    },
    "K18a": {
        "drop": ["2"],                   # those arrow slits are up in K59
        "relabel": {"1": "Shaft, 10 feet across and 390 feet tall"},
    },
    "K19": {
        "drop": ["3", "5"],              # the alcoves and the second entry are the trap
        "relabel": {"1": "Massive stairs down to K8",
                    "2": "Ceiling frescoes of mounted knights",
                    "4": "Animated armour trap in its alcove (one at each end)"},
        "add": [("stairs", "Staircases up to K25",
                 "One at each end of the south wall.")],
    },
    "K20": {
        "drop": ["5", "6"],              # the ladder is behind the secret door; K20a is its own area
        "relabel": {"1": "Mosaic floor",
                    "2": "Spiral staircase hugging the outer wall, no railing",
                    "3": "Open archway to K13 (first landing, 50 feet up)",
                    "4": "Secret door hiding a ladder down to K34"},
        "add": [("item", "Heart of Sorrow",
                 "A 10-foot-diameter red crystal heart floating near the top of the tower."),
                ("door", "Archways to K45 and K46",
                 "On the second landing, 40 feet above the first.")],
    },
    "K21": {
        "drop": ["3", "4"],              # sconces and "circling stairway" are the same stair
        "relabel": {"1": "Spiral staircase, K73 up to K47"},
    },
    "K23": {
        "drop": ["7"],                   # the north door is the broken door
        "relabel": {"1": "Dust-caked window (east wall)",
                    "2": "Broken north door to K24",
                    "3": "Large heavy table",
                    "4": "Desk with the guest register, inkwell and quill",
                    "5": "Staircase down to K62 (south wall)",
                    "6": "Swollen east door to the courtyard"},
        "add": [("item", "Mounted skeletons flanking the stair",
                 "Chain mail and rusty halberds, wired to frames and hung on pegs by "
                 "Cyrus Belview. Harmless.")],
    },
    "K24": {
        "relabel": {"1": "Dirt-caked windows (northeast corner)",
                    "2": "Narrow staircase up to K34, along the north wall"},
        "add": [("item", "Broken furniture and torn cloth")],
    },
    # ---------------- Court of the Count (K25-K34) ----------------
    "K25": {
        "drop": ["6", "7"],              # dais and "high-backed" are the one throne
        "relabel": {"1": "Large window, broken glass and iron latticework (west wall)",
                    "2": "Empty iron sconces",
                    "3": "Single door to K30 (east wall, southern)",
                    "4": "Staircases down to K19 (both ends of the north wall)",
                    "5": "Large wooden throne on a marble dais",
                    "8": "Secret door to K13 (south wall)",
                    "9": "Double doors to K26 (east wall)"},
        "retype": {"2": "item"},         # empty: they light nothing
    },
    "K26": {
        "relabel": {"1": "Double doors (two sets, ten feet apart)",
                    "2": "Secret door to K33, behind the north skeleton"},
        "add": [("item", "Hanging guard skeletons",
                 "One at each end, hung on pegs in rusted armour and tattered livery. "
                 "Wired together by Cyrus Belview and harmless.")],
    },
    "K27": {
        "relabel": {"1": "Narrow secret door to K31 (midway, south side)",
                    "2": "Double doors (west and east ends)",
                    "3": "Flight of the Vampire: mannequin on a ceiling pulley rope, "
                         "with its compartment above the west doors"},
    },
    "K28": {
        "relabel": {"1": "Sculpted stone railing around the balcony",
                    "2": "Two ornate thrones, Strahd zombies slouched on them",
                    "3": "Double doors onto the balcony",
                    "4": "Staircase down to K29 (north of the doors)"},
    },
    "K29": {"relabel": {"1": "Creaky wooden staircase, K16 up to K28"}},
    "K30": {
        "drop": ["4", "6", "8", "9", "10"],   # one desk, and four chests described five times
        "relabel": {"1": "Four heavy wooden chests with iron locks",
                    "2": "Western door to K25",
                    "3": "Great black desk, Lief chained to it",
                    "5": "Tasseled alarm rope, sounds a gong",
                    "7": "Eastern door to the K21 stair",
                    "11": "Dusty scrolls and tomes lining the walls and floor",
                    "12": "Manual of bodily health"},
        "add": [("creature", "Lief Lipsiege on his tall stool",
                 "Chained to the desk; pulls the alarm rope the instant he feels threatened.")],
    },
    "K31": {
        # the shaft, the elevator and the trap itself all live in K31a and K61
        "drop": ["2", "4", "5", "6", "7"],
        "relabel": {"1": "Door into the trapworks",
                    "3": "Iron lever on the west wall, raises the elevator",
                    "8": "Elevator machinery: stone gears, iron chains and pulleys",
                    "9": "Secret door to K27 (north wall)"},
        "retype": {"8": "item"},         # machinery in the room, not a trigger here
    },
    "K31a": {
        "drop": ["2"],                   # the trap is sprung in K61
        "relabel": {"1": "Elevator shaft, 170 feet tall",
                    "3": "Stone elevator compartment (west half) and its counterweight (east half)",
                    "4": "Stone trapdoor in the shaft roof, into K47"},
    },
    "K31b": {
        "drop": ["2"],                   # that trapdoor is 40 feet up, in the shaft roof
        "relabel": {"1": "Opening onto the elevator shaft (south)",
                    "3": "Door to K39 (north wall)"},
    },
    "K32": {
        "relabel": {"1": "Eight canopied beds with lace hangings",
                    "2": "Helga's gold necklace with a ruby pendant (750 gp)"},
        "add": [("light", "Oil lamps"),
                ("creature", "Helga Ruvak, vampire spawn",
                 "Poses as a kidnapped maid; attacks only when she sees an opening.")],
    },
    "K33": {
        "relabel": {"1": "Secret doors, one at each end of the hall",
                    "2": "Plain wooden door to K32 (west wall)",
                    "3": "Staircase up to K45 (north end of the west wall)"},
        "add": [("light", "Three unlit oil lamps",
                 "Mounted on the east wall above the panelling, ten feet apart.")],
    },
    "K34": {
        "drop": ["3", "4", "9"],         # the black doors and the coffin shape are the wardrobe
        "relabel": {"1": "Dirt-caked windows",
                    "2": "Broken bed frames and torn mattresses",
                    "5": "Two cracked full-length mirrors (south wall)",
                    "6": "Tall dusty wardrobe, coffin-shaped, painted with fey creatures",
                    "7": "Staircase down to K24 (north wall)",
                    "8": "Secret door behind the west mirror (south wall)",
                    "10": "Wooden ladder up 20 feet to K20"},
    },

    # ---------------- Court of the Count (K25-K34) ----------------
    "K25": {
        "drop": ["6", "7"],              # dais and "high-backed" are the one throne
        "relabel": {"1": "Large window, broken glass and iron latticework (west wall)",
                    "2": "Empty iron sconces",
                    "3": "Single door to K30 (east wall, southern)",
                    "4": "Staircases down to K19 (both ends of the north wall)",
                    "5": "Large wooden throne on a marble dais",
                    "8": "Secret door to K13 (south wall)",
                    "9": "Double doors to K26 (east wall)"},
        "retype": {"2": "item"},         # empty: they light nothing
    },
    "K26": {
        "relabel": {"1": "Double doors (two sets, ten feet apart)",
                    "2": "Secret door to K33, behind the north skeleton"},
        "add": [("item", "Hanging guard skeletons",
                 "One at each end, hung on pegs in rusted armour and tattered livery. "
                 "Wired together by Cyrus Belview and harmless.")],
    },
    "K27": {
        "relabel": {"1": "Narrow secret door to K31 (midway, south side)",
                    "2": "Double doors (west and east ends)",
                    "3": "Flight of the Vampire: mannequin on a ceiling pulley rope, "
                         "with its compartment above the west doors"},
    },
    "K28": {
        "relabel": {"1": "Sculpted stone railing around the balcony",
                    "2": "Two ornate thrones, Strahd zombies slouched on them",
                    "3": "Double doors onto the balcony",
                    "4": "Staircase down to K29 (north of the doors)"},
    },
    "K29": {"relabel": {"1": "Creaky wooden staircase, K16 up to K28"}},
    "K30": {
        "drop": ["4", "6", "8", "9", "10"],   # one desk, and four chests described five times
        "relabel": {"1": "Four heavy wooden chests with iron locks",
                    "2": "Western door to K25",
                    "3": "Great black desk, Lief chained to it",
                    "5": "Tasseled alarm rope, sounds a gong",
                    "7": "Eastern door to the K21 stair",
                    "11": "Dusty scrolls and tomes lining the walls and floor",
                    "12": "Manual of bodily health"},
        "add": [("creature", "Lief Lipsiege on his tall stool",
                 "Chained to the desk; pulls the alarm rope the instant he feels threatened.")],
    },
    "K31": {
        # the shaft, the elevator and the trap itself all live in K31a and K61
        "drop": ["2", "4", "5", "6", "7"],
        "relabel": {"1": "Door into the trapworks",
                    "3": "Iron lever on the west wall, raises the elevator",
                    "8": "Elevator machinery: stone gears, iron chains and pulleys",
                    "9": "Secret door to K27 (north wall)"},
        "retype": {"8": "item"},         # machinery in the room, not a trigger here
    },
    "K31a": {
        "drop": ["2"],                   # the trap is sprung in K61
        "relabel": {"1": "Elevator shaft, 170 feet tall",
                    "3": "Stone elevator compartment (west half) and its counterweight (east half)",
                    "4": "Stone trapdoor in the shaft roof, into K47"},
    },
    "K31b": {
        "drop": ["2"],                   # that trapdoor is 40 feet up, in the shaft roof
        "relabel": {"1": "Opening onto the elevator shaft (south)",
                    "3": "Door to K39 (north wall)"},
    },
    "K32": {
        "relabel": {"1": "Eight canopied beds with lace hangings",
                    "2": "Helga's gold necklace with a ruby pendant (750 gp)"},
        "add": [("light", "Oil lamps"),
                ("creature", "Helga Ruvak, vampire spawn",
                 "Poses as a kidnapped maid; attacks only when she sees an opening.")],
    },
    "K33": {
        "relabel": {"1": "Secret doors, one at each end of the hall",
                    "2": "Plain wooden door to K32 (west wall)",
                    "3": "Staircase up to K45 (north end of the west wall)"},
        "add": [("light", "Three unlit oil lamps",
                 "Mounted on the east wall above the panelling, ten feet apart.")],
    },
    "K34": {
        "drop": ["3", "4", "9"],         # the black doors and the coffin shape are the wardrobe
        "relabel": {"1": "Dirt-caked windows",
                    "2": "Broken bed frames and torn mattresses",
                    "5": "Two cracked full-length mirrors (south wall)",
                    "6": "Tall dusty wardrobe, coffin-shaped, painted with fey creatures",
                    "7": "Staircase down to K24 (north wall)",
                    "8": "Secret door behind the west mirror (south wall)",
                    "10": "Wooden ladder up 20 feet to K20"},
    },

    # ---------------- Rooms of Weeping (K35-K46) ----------------
    "K35": {
        "relabel": {"1": "Engraved steel door (west end)",
                    "2": "Shadowed alcoves flanking the door"},
        "add": [("creature", "Four swarms of rats, two per alcove",
                 "Piled into man-shaped figures; under Strahd's control.")],
    },
    "K36": {
        # f4 is the same window after the cake bursts; f7 and f8 come out of
        # Pidlwick's ghostly dialogue, not the room
        "drop": ["4", "7", "8", "9"],
        "relabel": {"1": "Long oak table, dusty china and silverware",
                    "2": "Web-shrouded iron chandelier",
                    "3": "Arched window with heavy curtains (south wall)",
                    "5": "Wooden doors (north and west walls)",
                    "6": "Ornate steel door to K35 (east wall)",
                    "10": "Dusty lute in a wooden stand by the window (a Doss lute)"},
        "add": [("item", "Tiered wedding cake with the bride figurine",
                 "Four centuries old and green with age; the groom figurine lies on the floor."),
                ("item", "Tall harp in the southwest corner",
                 "6 1/2 feet, close to 300 pounds, carved with harts and roses.")],
    },
    "K37": {
        "drop": ["3", "6"],              # one fireplace, one painting
        "relabel": {"1": "Blazing hearth, with the polished poker in its stand",
                    "2": "Large low table, polished to a mirror finish",
                    "4": "Overstuffed divans and couches",
                    "5": "Painting of Tatyana over the mantelpiece",
                    "7": "Large double doors (west wall)",
                    "8": "Secret door in the back of the fireplace, to K38; the poker opens it",
                    "9": "Strahd's library, over a thousand tomes (80,000 gp)"},
        "add": [("item", "Two burgundy chairs facing the hearth"),
                ("item", "Thick luxurious rug"),
                ("door", "Doors at each end of the north wall, and one to the south")],
    },
    "K38": {
        "drop": ["4", "5"],              # one chest; the empty sconce is one of the pair
        "relabel": {"1": "Trapped chest amid piles of coins; releases sleeping gas",
                    "2": "Matching torch in the skeleton's hand; returning it to the empty "
                         "sconce opens the east secret door",
                    "3": "Two torch sconces on the east wall, the north one empty",
                    "6": "Secret door west, into the K37 fireplace"},
        "add": [("item", "Skeleton in broken plate armour",
                 "An adventurer who did not make it out. Nothing of value."),
                ("secret-door", "Sealed secret door to K39",
                 "North end of the east wall; opens only while the torch sits in its sconce.")],
    },
    "K39": {
        "relabel": {"1": "Arched bronze doors to K40 (east end)",
                    "2": "Narrow secret door to K31b (west end of the south wall)"},
        "add": [("secret-door", "Secret door west to K38",
                 "Cannot be opened from this side except by magic."),
                ("trap", "Giant spider webs",
                 "Fill most of the hall; one clear path runs down the centre.")],
    },
    "K40": {
        "drop": ["2", "3"],              # the gong is the bell's sound; the belfry is the room
        "relabel": {"1": "Great bell in a wooden framework, 50 feet overhead",
                    "4": "Secret door to K41 (west end of the north wall)"},
        "add": [("item", "Bell rope hanging to the floor"),
                ("trap", "Giant spider webs", "One narrow path leads to the centre."),
                ("creature", "Five giant spiders", "Drop from the webs if the bell is sounded.")],
    },
    "K41": {
        "drop": ["10"],                  # the potions are what is in the coffer
        "relabel": {"1": "Arrow slits in the tower walls, all sides",
                    "2": "Glowing crystal stars set in the pitch-coated dome",
                    "3": "Adamantine trapdoor on the tower roof",
                    "4": "Sealed adamantine door, north side of the tower base",
                    "5": "Wooden coffer of four potions of greater healing (upper floor)",
                    "6": "Red velvet sack, ten pieces of jewellery (upper floor)",
                    "7": "Coin hoard and the +2 silver dragon shield (ground floor)"},
        "add": [("item", "Daern's instant fortress",
                 "The adamantine tower itself, 20 feet on a side and 30 feet high."),
                ("item", "Rod of the pact keeper, +1 (upper floor)")],
    },
    "K42": {
        "drop": ["7"],                   # that alcove is in K45
        "relabel": {"1": "Great arched window with red draperies (west wall)",
                    "2": "Small tables holding the candelabras",
                    "3": "Three candelabras of tall white candles",
                    "4": "Canopied bed with a carved Z on the headboard",
                    "5": "Arched double doors (south and east)",
                    "6": "Secret door beside the bed (north wall), to the hall through to K45"},
        "add": [("creature", "Gertruda, asleep on the bed",
                 "Charmed by Strahd, oblivious to her danger.")],
    },
    "K43": {
        "relabel": {"1": "Red satin curtained archways to K44 (both ends of the south wall)"},
        "add": [("item", "Ornate iron tub with clawed feet, full of blood",
                 "The blood is a manifestation of Varushka's tormented spirit.")],
    },
    "K44": {
        "relabel": {"1": "Two arched windows with heavy curtains (south wall)",
                    "2": "Red-draped archways to K43"},
        "add": [("item", "Iron hooks with 28 capes and 16 sets of fine clothes")],
    },
    "K45": {
        "drop": ["1", "3"],              # the alcoves hold the statues; one set of ten
        "relabel": {"2": "Ten life-sized statues of heroes, in the wall alcoves",
                    "4": "Stairs down 40 feet to K33 (west end)",
                    "5": "Open archway east onto the K20 tower landing"},
        "add": [("item", "Rubble from the fallen ceiling"),
                ("secret-door", "Secret door at the back of an alcove",
                 "Opens on the dusty hall through to K42.")],
    },
    "K46": {
        "drop": ["2"],                   # the parapets are this area
        "relabel": {"1": "Ten-foot-wide walkway around the keep",
                    "3": "Battlemented walkways out to the outer walls (north, south, east)",
                    "4": "Windows into the keep, shut and locked but easily broken"},
        "add": [("creature", "Strahd's animated armour on patrol",
                 "Walks the parapets and outer walls day and night.")],
    },

    # ---------------- Spires of Ravenloft (K47-K60a) ----------------
    "K47": {
        "drop": ["5", "6", "7"],         # one trapdoor; the elevator belongs to K61/K31a
        "relabel": {"1": "Spiral staircase (north end of the east wall)",
                    "2": "Wooden trapdoor in the floor, over the K31a shaft",
                    "3": "Ironbound wooden door (west wall)",
                    "4": "Framed portrait of Strahd, a guardian portrait"},
        "add": [("creature", "Ornate square rug (rug of smothering)",
                 "Covers the floor to the south and attacks anything living that crosses it."),
                ("stairs", "Stairs down, south")],
    },
    "K48": {"relabel": {"1": "Spiral staircase, K47 past K54 up to K57"}},
    "K49": {
        "drop": ["6", "7", "8", "9"],    # one set of couches, one bookcase, one set of
                                          # windows; the treasure is jewellery Escher wears
        "relabel": {"1": "Three ornate lanterns hanging from the beams",
                    "2": "Three leaded-glass windows in steel latticework (curved west wall)",
                    "3": "Two doors flanking the bookcase (east wall)",
                    "4": "Bookcase between the doors (east wall)",
                    "5": "Overstuffed chairs and couches"},
        "add": [("creature", "Escher, vampire spawn, lounging on a couch",
                 "Wears a platinum ring (150 gp) and a gold and ruby pendant (750 gp). "
                 "Dives out of the window onto K53 if attacked.")],
    },
    "K50": {
        "relabel": {"1": "Large four-poster bed with a black canopy",
                    "2": "Banded door (west wall)",
                    "3": "Smaller unbanded door (east wall)"},
        "add": [("item", "Comfortable divans")],
    },
    "K51": {
        "relabel": {"1": "Secret trapdoor in the ceiling, up to K55",
                    "2": "Door into the closet"},
        "add": [("item", "Iron hooks, one hung with a black cloak",
                 "Pulling down that hook unlocks the ceiling trapdoor; the witches left "
                 "the cloak as a marker.")],
    },
    "K52": {
        "add": [("item", "Smokestack",
                 "Five feet across at the top, rising 30 feet above the roof peak and "
                 "dropping 60 feet to the fireplace in K37.")],
    },
    "K53": {
        "drop": ["2"],                   # the parapet below is K46
        "relabel": {"1": "Gargoyles perched on the roof's end peaks"},
        "add": [("trap", "Loose roof tiles",
                 "DC 15 Dexterity (Acrobatics) to cross; a bad slip drops you 40 feet to K46.")],
    },
    "K54": {
        "relabel": {"1": "Torn and broken couches, deeply clawed"},
        "add": [("creature", "Three cats",
                 "Familiars of the witches in K56; they raise the alarm.")],
    },
    "K55": {
        "drop": ["1"],                   # one pair of windows, described twice
        "relabel": {"2": "Tables stacked with labelled jars and bottles",
                    "3": "Two leaded-glass windows, locked from the inside",
                    "4": "Easternmost door",
                    "5": "Secret trapdoor in the northeast corner, down to K51"},
        "add": [("note", "Drag trail in the dust",
                 "Runs from the northeast corner to the easternmost door.")],
    },
    "K56": {
        "relabel": {"1": "Door into the cauldron room",
                    "2": "Fat black cauldron (command word \"Gorah!\")",
                    "3": "Small table behind the cauldron",
                    "4": "Opened spellbook on the small table (the book is evil)"},
        "add": [("item", "Seven tall wooden stools around the cauldron"),
                ("creature", "Seven Barovian witches",
                 "Cast invisibility and wait in the corners if they know you are coming.")],
    },
    "K57": {
        "drop": ["2"],                   # the bridge is K58
        "relabel": {"1": "Battlements rimming the roof",
                    "3": "Stone spiral staircase down into the tower, inside a stone railing"},
    },
    "K58": {"relabel": {"1": "Slender stone bridge, its iron railings long rusted away"}},
    "K59": {
        "relabel": {"1": "Spiral staircase",
                    "2": "Five-foot-wide stone walkway circling the shaft",
                    "3": "Mouth of the shaft: a 15-foot hole dropping 450 feet to K84",
                    "4": "Arrow slits",
                    "5": "Pidlwick II, hiding in the rafters"},
        "retype": {"5": "creature"},     # the jack-o'-lantern is his painted face
        "add": [("window", "Gaping hole in the roof",
                 "A fallen beam took part of the cone roof with it; open to the sky.")],
    },
    "K60": {
        "drop": ["6"],                   # the treasure is what is in the chest
        "relabel": {"1": "Stairs up into the room",
                    "2": "Wood-framed bed with leather restraints",
                    "3": "Locked iron chest, a bejewelled gold crown inside "
                         "(key with Cyrus Belview in K62)",
                    "4": "Trapdoor in the ceiling, up to K60a",
                    "5": "Wooden ladder to the trapdoor"},
        "add": [("item", "Rusted manacles on the walls")],
    },
    "K60a": {
        "relabel": {"1": "Ring of stone battlements, 20 feet across"},
        "add": [("creature", "Ten swarms of bats",
                 "Pour from the storm three rounds after you step onto the roof.")],
    },

    # ---------------- Larders of Ill Omen (K61-K72) ----------------
    "K61": {
        "drop": ["3", "5", "7", "8"],    # one trap, described four ways; the shaft is K31a
        "relabel": {"1": "Web-filled stairway spiralling down (south)",
                    "2": "Wooden door at the north end",
                    "4": "Elevator trap: the middle ten-foot section of the hall",
                    "6": "Two steel portcullises that drop to seal the compartment",
                    "9": "Secret trapdoor in the elevator's ceiling"},
    },
    "K62": {
        # the elevator, its shaft and the K47 trapdoor are elsewhere, and the iron
        # chest Cyrus carries the key to is up in K60
        "drop": ["3", "4", "5", "6", "7"],
        "relabel": {"1": "Lantern on the floor",
                    "2": "South door to K61",
                    "8": "Stairs up to K23 (east end)",
                    "9": "Rusted iron portcullis barring the way to K63 (east wall)"},
        "add": [("creature", "Cyrus Belview",
                 "Mongrelfolk servant. Wears an iron key to the K60 chest and a hag eye "
                 "pendant that Morgantha uses to spy on Strahd.")],
    },
    "K63": {
        # twelve casks, described as one group and then again wall by wall
        "drop": ["1", "2", "3", "4", "8"],
        "relabel": {"5": "Northern casks: three, rotted and empty",
                    "6": "Eastern casks: six, the last lined with yellow mould",
                    "7": "Southern casks: three, the middle one home to a black pudding"},
        "add": [("item", "Crack through to K18",
                 "Half an inch wide, at the southern end of the west wall.")],
    },
    "K64": {"relabel": {"1": "Staircase, K68 up past K13 to K46"}},
    "K65": {
        "relabel": {"1": "Blazing fire pit in the centre of the room"},
        "add": [("item", "Huge bubbling pot over the fire",
                 "Three human zombies rise out of it if anyone looks inside."),
                ("item", "Pegs of large cooking implements along the far wall"),
                ("creature", "Three human zombies, boiling in the pot")],
    },
    "K66": {
        "relabel": {"1": "Huge faded tapestry of Castle Ravenloft",
                    "2": "Long sagging bed beneath the tapestry",
                    "3": "Dusty lanterns"},
        "add": [("item", "Piles of salvaged junk",
                 "Broken swords, crumpled shields and helmets, stripped from the dead.")],
    },
    "K67": {
        "drop": ["5", "6"],              # one bone table; the eastern doors are f4
        "relabel": {"1": "Scattered broken oak tables",
                    "2": "Chandelier of bones",
                    "3": "Long table of bones",
                    "4": "Steel-banded double doors (centre of the east wall)"},
        "add": [("item", "Four mounds of bones in the corners"),
                ("item", "Ten bone chairs around the table"),
                ("item", "Ornate bowl-shaped vessel of bone on the table"),
                ("item", "Argynvost's dragon skull, mounted above the east doors"),
                ("door", "Bone-sheathed doors, north and south")],
    },
    "K68": {
        "relabel": {"1": "Open archway to K69 (west wall)",
                    "2": "Door to K67 (north end)"},
    },
    "K69": {
        "relabel": {"1": "Ten-foot-square alcoves off both sides",
                    "2": "Rotting cots, rags and guards' skeletal remains"},
        "add": [("creature", "Ten human skeletons",
                 "Leap from the alcoves when anyone reaches the midpoint of the hall.")],
    },
    "K70": {
        "relabel": {"1": "Doors in the centre of the north and south walls",
                    "2": "Dark archway through the east wall"},
        "add": [("item", "Scattered furniture heaped near the walls"),
                ("item", "Broken bones amid crushed plate armour"),
                ("item", "Shields and swords driven into the walls")],
    },
    "K71": {
        "drop": ["6", "7"],              # the alcove and the treasure are the cubbyhole
        "relabel": {"1": "Archway west to K70",
                    "2": "Stone staircase east, up to K20 by way of K20a",
                    "3": "Four ten-foot-square alcoves (north and south)",
                    "4": "Rotting cots and dirty rags",
                    "5": "Loose flagstone in the southeast alcove, hiding a mouldy sack "
                         "of 150 ep"},
    },
    "K72": {
        "drop": ["3"],                   # that staircase is K79
        "relabel": {"1": "Great table with its chair, inkwell and quill",
                    "2": "Secret door to K79 (north end of the west wall)"},
        "add": [("item", "Lances, swords and shields of the Barovian crest, hung on the walls"),
                ("creature", "Rahadin",
                 "Waiting for the characters, if he has not been killed elsewhere."),
                ("creature", "Shadow demon",
                 "Leaps out from behind a round after Rahadin is engaged.")],
    },

    # ---------------- Dungeon and Catacombs (K73-K88) ----------------
    "K73": {
        "drop": ["2", "4", "6", "7"],    # one pair of iron doors; one trap, named thrice
        "relabel": {"1": "Staircase east, up to K21",
                    "3": "Iron doors in the arched doorways, north and south, part submerged",
                    "5": "Weight-sensitive trapdoors over teleport pits"},
        "retype": {"5": "trap"},
        "add": [("note", "Standing water, three feet deep",
                 "Opaque, so the trapdoors cannot be seen. The steps down to each iron "
                 "door drop another two feet.")],
    },
    "K74": {
        "drop": ["2", "3"],              # every cell already carries its own barred door
        "relabel": {"1": "Rusty iron door to K73, submerged in five feet of water"},
        "add": [("note", "Standing water, five feet deep, mould-covered ceiling three "
                 "feet above it")],
    },
    "K75": {
        "relabel": {"1": "Rusty iron door to K73, submerged in five feet of water"},
        "add": [("note", "Standing water, five feet deep, mould-covered ceiling three "
                 "feet above it")],
    },
    "K76": {
        "drop": ["1", "2"],              # the balcony and its thrones are K77
        "relabel": {"3": "Racks, iron maidens, stocks and other instruments of torture, "
                         "skeletons still in them"},
        "add": [("item", "Hanging chains across the ceiling"),
                ("creature", "Six Strahd zombies",
                 "Rise out of the water once anyone moves more than 10 feet into the room."),
                ("note", "Brackish water, three feet deep")],
    },
    "K77": {
        "drop": ["1"],                   # the balcony is this area
        "relabel": {"2": "Two large wooden thrones",
                    "3": "Door in the centre of the wall behind the curtain"},
        "add": [("item", "Red velvet curtain, thirty feet long, behind the thrones")],
    },
    "K78": {
        "drop": ["3", "4"],              # the alcoves hold the golems; the coffins are
                                          # in the hourglass verse, not the room
        "relabel": {"1": "Stone brazier, seven coloured crystal stones set in its rim",
                    "2": "Two iron golems: knights on horseback, in facing alcoves",
                    "5": "Doors, which slam and lock if the brazier, hourglass or golems "
                         "are attacked"},
        "retype": {"2": "creature"},
        "add": [("item", "Wood-framed hourglass on iron chains",
                 "Hangs ten feet above the brazier; a verse in glowing script on its base.")],
    },
    "K79": {
        "relabel": {"1": "Worn stone stairs up to K72, with a landing partway",
                    "2": "Secret door at the top, into K72"},
        "add": [("trap", "Glyph of warding on the landing",
                 "Hidden under years of dust; conjures an illusory Strahd.")],
    },
    "K80": {
        "relabel": {"1": "Door at the foot of the stairs, to K81",
                    "2": "Stone staircase between K78 and K81"},
    },
    "K81": {
        "relabel": {"1": "Stone door at the eastern end",
                    "2": "Hidden trapdoor over the K82 chute, opens under 100 pounds"},
        "retype": {"2": "trap"},
    },
    "K82": {
        "relabel": {"1": "One-way secret door into cell K74e, at the bottom"},
        "add": [("stairs", "Polished black marble chute",
                 "No handholds, too slippery to climb without magic.")],
    },
    "K83": {
        "relabel": {"1": "Door at the foot of the stair, from K78",
                    "2": "Dark spiral staircase, K78 up through K83a to K37"},
    },
    "K83a": {
        "drop": ["4"],                   # the treasure is the tapestry
        "relabel": {"1": "Spiral stairs down to K78 (north) and up to K37 (south)",
                    "2": "Ten-foot tapestry of King Barov's knights on an iron rod (750 gp)",
                    "3": "Doors at the head and foot of the stairs"},
    },

    "K84": {
        "drop": ["1", "5"],              # the walkways are the layout; the bier is
                                          # stated once for every crypt
        "relabel": {"2": "Barred archways: north to K85, south to K86, east to K87",
                    "3": "Door beside crypt 1, through to K81",
                    "4": "Invisible teleport traps ringing the way into K86"},
        "add": [("creature", "Tens of thousands of bats",
                 "Roost here by day. Attacking them raises 2d4 swarms.")],
    },
    "K85": {
        "drop": ["2", "3", "6", "9", "10"],   # one archway, one coffin, one set of alcoves
        "relabel": {"1": "Portcullis at the top of the stair",
                    "4": "White marble steps down into the tomb",
                    "5": "Sergei's inlaid coffin on its white marble slab",
                    "7": "Three carved statues in the north alcoves: Sergei flanked by angels",
                    "8": "Iron lever in the south wall, raises the portcullis",
                    "11": "+2 plate armour on Sergei's body"},
    },
    "K86": {
        "drop": ["2", "3", "8", "9", "10", "11", "12"],   # one coffin, three alcoves
        "relabel": {"1": "Heavy portcullis in the archway",
                    "4": "Black marble steps down into the tomb",
                    "5": "Strahd's black coffin, brass fitted, settled in the earth",
                    "6": "Three alcoves south of the coffin: west teleports to crypt 32, "
                         "east receives, centre inert",
                    "7": "Iron lever in the north wall, raises the portcullis",
                    "13": "The brides' jewellery: tiara, jewelled scarf, opal necklace, "
                          "platinum mask"},
        "add": [("creature", "Three vampire spawn brides",
                 "Lie under the earth near the east wall and rise when anyone nears "
                 "the coffin.")],
    },
    "K87": {
        "drop": ["1", "2", "4"],         # one flight, described from both ends
        "relabel": {"3": "Wide steps down to the landing, continuing beyond",
                    "5": "Bronze warrior statues with spears, the full 30-foot height"},
        "add": [("trap", "Curtain of blue light between the alcoves",
                 "Anything but a lawful good creature moving west to east is teleported "
                 "back to the top of the stairs.")],
    },
    "K88": {
        "drop": ["1", "6"],              # the tomb is the room; one south coffin
        "relabel": {"2": "Tall stained-glass windows (east wall), nearly opaque",
                    "3": "King Barov's coffin (north wall): wax effigy, bones beneath",
                    "4": "Gold mosaic inlaid in the vaulted ceiling",
                    "5": "Queen Ravenovia's coffin (south wall): her skeleton under a shroud"},
    },

    # ---------------- dungeon cells (K74a-h, K75a-h) ----------------
    "K74b": {"drop": ["2"],              # the rusted door is this cell's own barred door
             "relabel": {"1": "Barred iron cell door, hanging slightly open"},
             "add": [("item", "300 pp scattered across the flooded floor")]},
    "K74a": {"add": [("item", "3,000 ep scattered across the flooded floor")]},
    "K74c": {"add": [("item", "Rotting half-elf corpse on the bars",
                      "A sheathed longsword and two belt pouches on it.")]},
    "K74e": {"relabel": {"2": "Secret door 5 feet up the north wall, foot of the K82 chute"}},
    "K74g": {"add": [("creature", "Gray ooze on the cell floor",
                      "Effectively invisible underwater.")]},
    "K74h": {"add": [("item", "Sentient +1 shortsword, glowing underwater")]},
    "K75a": {"add": [("creature", "Emil Toranescu, a werewolf",
                      "Claims to be a villager chased here by dire wolves.")]},
    "K75b": {"add": [("item", "2,100 ep scattered across the flooded floor")]},
    "K75d": {"add": [("item", "Dwarf skeleton in rusted plate, battleaxe beside it")]},
    "K75f": {"add": [("item", "Wizard's corpse shackled to the back wall")]},
    "K75g": {"drop": ["2"],              # the rope is tied to this cell's own door
             "add": [("item", "Iron pulley and rope in the cell roof",
                      "A stout man hangs upside down from it, tied to the door crossbeam.")]},

    # ---------------- catacomb crypts ----------------
    "Crypt 1": {"drop": ["2"],
                "relabel": {"1": "Stone slab door, opening on the tunnel to K81"}},
    "Crypt 2": {"add": [("item", "Wooden box of paintbrushes and dried paint")]},
    "Crypt 3": {"drop": ["2", "3", "4"],  # all part of one heap of junk
                "relabel": {"5": "Old chandelier hanging from the domed ceiling"},
                "add": [("item", "Heaps of worthless antiques covering the floor")]},
    "Crypt 6": {"relabel": {"2": "Poison dart trap: pressure plate in the floor outside"},
                "retype": {"2": "trap"}},
    "Crypt 7": {"drop": ["2", "4"],
                "relabel": {"1": "Stone slab door, fallen flat on the floor",
                            "3": "Stone gargoyles, one at each end of the slab"}},
    "Crypt 10": {"add": [("item", "Bloodstained maul against the slab"),
                         ("item", "Jewellery draped over the oversized skeleton")]},
    "Crypt 12": {"drop": ["2"],
                 "relabel": {"3": "Weight-sensitive slab: lifting the helm releases poison gas"},
                 "retype": {"3": "trap"},
                 "add": [("item", "Three-faced steel helm on the slab")]},
    "Crypt 14": {"drop": ["4"],           # those teleport traps are out in K84
                 "relabel": {"2": "Ten-foot-square shaft plunging into darkness",
                             "3": "Stone coffins"},
                 "add": [("creature", "Wights", "The teleport traps in K84 swap intruders "
                          "with the wights kept here.")]},
    "Crypt 15": {"add": [("item", "Skull with black opal eyes and amber teeth")]},
    "Crypt 16": {"drop": ["4"],
                 "relabel": {"2": "Nine shallow alcoves carved into the walls",
                             "3": "Painted portrait at the back of each alcove"}},
    "Crypt 17": {"add": [("item", "Eleven-foot funeral barge, wedged in diagonally")]},
    "Crypt 18": {"drop": ["2"],
                 "relabel": {"1": "Stone slab door laid aside, freshly engraved "
                                  "\"Ireena Kolyana: Wife\""}},
    "Crypt 22": {"add": [("item", "Gold-dipped corpse on the slab")]},
    "Crypt 27": {"drop": ["1"],           # this crypt is missing its slab
                 "relabel": {"2": "Gaping doorway, the slab door gone"},
                 "add": [("creature", "Three giant wolf spiders")]},
    "Crypt 28": {"drop": ["2"],           # "sunken chest" is the skeleton's ribcage
                 "relabel": {"3": "Bell clutched by the skeleton; ringing it brings magic fire"},
                 "add": [("item", "Tall chef's hat fitted over the skull")]},
    "Crypt 30": {"add": [("item", "Golden holy symbol in the skeleton's hand")]},
    "Crypt 31": {"drop": ["3", "4"],      # rulebook cross-references, not objects
                 "relabel": {"2": "Floor is the lid of a 30-foot spiked pit, opens under 100 lb",
                             "5": "Shattered lantern at the bottom of the pit"},
                 "retype": {"2": "trap"}},
    "Crypt 32": {"relabel": {"2": "Eastern alcove: teleports to Strahd's tomb (K86)",
                             "3": "Western alcove: receives arrivals from K86"}},
    "Crypt 33": {"add": [("item", "Rusty plate armour with a longsword through the breastplate")]},
    "Crypt 34": {"relabel": {"2": "Seven-foot gilded sarcophagus, screaming king on the lid",
                             "3": "Pit fiend bound within the sarcophagus"},
                 "retype": {"3": "creature"},   # a pit fiend, not a pit
                 "add": [("item", "Stuffed owlbear looming behind the sarcophagus")]},
    "Crypt 35": {"relabel": {"2": "Illusory floor hiding a 20-foot pit with sheer sides"},
                 "retype": {"2": "trap"}},
    "Crypt 36": {"drop": ["2"]},          # that is this crypt's own slab
    "Crypt 37": {"relabel": {"2": "Wooden staff clutched to the corpse; its marble knob "
                                  "raises the slab"}},
    "Crypt 39": {"drop": ["2"],           # the shaft is K18a
                 "relabel": {"1": "Oversized stone slab door, 6 by 8 feet (DC 20 Strength)"},
                 "add": [("creature", "Beucephalus, Strahd's nightmare steed")]},
    "Crypt 40": {"drop": ["3"],           # the tomb is the crypt itself
                 "relabel": {"2": "Three unlit torches in iron brackets "
                                  "(north, east and south walls)"}},
}
