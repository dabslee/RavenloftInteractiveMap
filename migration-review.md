# Migration review

Written by `migrate.py`. Everything below is a guess it made or a thing it could not decide; the numbers are what came out.

## What was written

| | count |
|---|---|
| objects | 388 |
| - room outlines | 184 |
| - items, creatures, traps, notes | 204 |
| portals | 289 |
| - with both sides resolved | 224 |
| - with a null side | 65 |
| shapes | 1011 |

Validator: **0 errors, 22 warnings**.

### Warnings

- p_1xd6o40fe2: drawn on weeping, which is neither side's floor
- p_l9s5thr188: joins walls to dungeon, which are not adjacent floors
- p_o59kbttcyh: joins weeping to larders, which are not adjacent floors
- p_6nyl9v1neq, p_ma883829rh, p_tcmqctvk3l, p_u88udaf6k0: 4 portals join the same two places
- p_dte0snm42q, p_hvqtmhgj41, p_zj6uvdx0eh: 3 portals join the same two places
- p_qj33906web, p_vklqfw7whx: 2 portals join the same two places
- p_4hjv027lxo, p_gcqa98g36a: 2 portals join the same two places
- p_3dobq7yz4s, p_tr3da0pohi: 2 portals join the same two places
- p_cax477f10p, p_gekcuqmny3: 2 portals join the same two places
- p_55qi835q5v, p_ujoimxfghh: 2 portals join the same two places
- p_3ont72frov, p_gxbh8a0k9w: 2 portals join the same two places
- p_0dxv0h56eh, p_rutz6x9nc0: 2 portals join the same two places
- p_2qp4acj65j, p_i2cuinojex: 2 portals join the same two places
- p_20qvoowxxi, p_5pa4egjs9h, p_qutoiqy1h7: 3 portals join the same two places
- p_amjf5bd480, p_r1ragjzkia: 2 portals join the same two places
- p_g0bx26y73l, p_hpfaxar5w4, p_rcm2yyaglf: 3 portals join the same two places
- p_4c8p7yxy20, p_llbpn8wc2i: 2 portals join the same two places
- p_8s5ioc8pjw, p_o0ane0ofoy, p_oq68yvdtfy, p_zhlnmk4tlk: 4 portals join the same two places
- p_2wstmtvzlu, p_ihsptgj2vp, p_kt00bpgzym, p_s2a8u8ktv7: 4 portals join the same two places
- p_8v0vglkppv, p_9qqvan8p6w: 2 portals join the same two places
- p_0dezuz10xr, p_0wfwbg7hhm, p_14kxubnnjw, p_2vwo4374wr, p_4vshfg1nyw, p_5rqfu7cskm, p_6jt7e40t5t, p_8msei92la3, p_c9ixh8b438, p_fhubomhupn, p_hs4jdgk819, p_il677gpo1t, p_lnur9tzkzx, p_pas3fwtpjl, p_shri5xo02h, p_t6qesd8y15, p_uc19duvdjb, p_ugwny3zjco, p_uxdoq859w0, p_wc6o19jp56, p_z3fap39oyt: 21 portals join the same two places
- p_4cf7gcgbpd, p_w3ugpzvno4: 2 portals join the same two places

## Things to look at

323 in all.

### Needs a far side (66)

One side is still null. Open each and say where it comes out, or leave it if it opens onto the outside.

- `p_0uuzlnokh2` Battlemented walkways out to the outer walls (north, south, east) - no far side found
- `p_0yk128plz7` Drawbridge and portcullis mechanism - no far side found
- `p_1m1ydlgty2` Thin arrow slits - no far side found
- `p_1xd6o40fe2` Secret trapdoor in the elevator's ceiling - drawn on weeping, which is neither side's floor
- `p_1xd6o40fe2` Secret trapdoor in the elevator's ceiling - reaches K21, K31a; could not tell which side it opens on
- `p_1z7zl3gl3z` Stained-glass windows, broken and boarded up - no far side found
- `p_268ypioyro` Two leaded-glass windows, locked from the inside - no far side found
- `p_2bo9hdln7f` Tall stained-glass windows (east wall), nearly opaque - no far side found
- `p_38lss54ue5` Archways to K45 and K46 - reaches K45, K46; could not tell which side it opens on
- `p_3abxvybfpl` Stone spiral staircase down into the tower, inside a stone railing - no far side found
- `p_3wgrvjtjbf` Barred archways: north to K85, south to K86, east to K87 - reaches K85, K86, K87; could not tell which side it opens on
- `p_68bjofys7b` Stained-glass windows, broken and boarded up - no far side found
- `p_6qpqt9fqpb` Thin arrow slits - no far side found
- `p_81l32vbq3a` Dirt-caked windows (northeast corner) - no far side found
- `p_9qinh1m0yl` Thin arrow slits - no far side found
- `p_ady7l8ezyi` Thin arrow slits - no far side found
- `p_bh1lyex8j6` Thin arrow slits - no far side found
- `p_cnd5wdix5p` Thin arrow slits - no far side found
- `p_dv2kiu2og2` Spiral staircase - reaches K18, K84; could not tell which side it opens on
- `p_eaw3y5hz2b` Ironbound door - no far side found
- `p_enrg9xqex0` Arrow slits - no far side found
- `p_evqc1arawr` Two steel portcullises that drop to seal the compartment - no far side found
- `p_f5s474p8a8` Dust-caked window (east wall) - no far side found
- `p_fbvisp3u22` Two leaded-glass windows, locked from the inside - no far side found
- `p_fh0faoqwyg` Wooden trapdoor in the floor, over the K31a shaft - reaches K31a, K48; could not tell which side it opens on
- `p_ggt94rv3z5` Thin arrow slits - no far side found
- `p_gjl8t6228q` Stained-glass windows, broken and boarded up - no far side found
- `p_h7v1x5row4` Stained-glass windows, broken and boarded up - no far side found
- `p_hofkthaw1j` Thin arrow slits - no far side found
- `p_hsam7ni5pw` Drawbridge and portcullis mechanism - no far side found
- `p_ibb6p4u27d` Stairs up into the room - no far side found
- `p_ico3rgd612` Stone staircase east, up to K20 by way of K20a - reaches K20, K20a; could not tell which side it opens on
- `p_ivvtbgcx8i` Dirt-caked windows - no far side found
- `p_jh03gryh48` Windows into the keep, shut and locked but easily broken - reaches K43, K44; could not tell which side it opens on
- `p_l7qtuyghkk` Black marble steps down into the tomb - no far side found
- `p_ln0amy9zli` Thin arrow slits - no far side found
- `p_m9kuj3v90d` Dirt-caked windows (northeast corner) - no far side found
- `p_n7dauj9mb8` Thin arrow slits - no far side found
- `p_occywgyd3c` Ironbound door - no far side found
- `p_oyg85417dq` Wide steps down to the landing, continuing beyond - no far side found
- `p_pwpw4brjok` Stained-glass windows, broken and boarded up - no far side found
- `p_qog2nq396z` Stained-glass windows, broken and boarded up - no far side found
- `p_qvuml7kgjt` Outer gate - no far side found
- `p_ryk62yz2fj` Thin arrow slits - no far side found
- `p_s02gzfcsr1` Balcony - no far side found
- `p_t79bzp8f9l` Wooden ladder to the trapdoor - no far side found
- `p_t7fta5xb4u` Thin arrow slits - no far side found
- `p_t8xisqrfpp` Arrow slits (north and west walls) - no far side found
- `p_tyd7blblg7` White marble steps down into the tomb - no far side found
- `p_uv06f6amc3` Stained-glass windows, broken and boarded up - no far side found
- `p_uxuwml240e` Thin arrow slits - no far side found
- `p_uyw8mhszlx` Windows into the keep, shut and locked but easily broken - reaches K43, K44; could not tell which side it opens on
- `p_v04xb3ymi4` Stair landing to K18 (west) - reaches K18, K18a; could not tell which side it opens on
- `p_v61aw0ysn8` Stained-glass windows, broken and boarded up - no far side found
- `p_v8k5h4s7xr` Spiral stairs down to K78 (north) and up to K37 (south) - reaches K37, K78, K83; could not tell which side it opens on
- `p_vk0tlfoak4` Thin arrow slits - no far side found
- `p_vzc4t8plqq` Battlemented walkways out to the outer walls (north, south, east) - no far side found
- `p_w5920gasin` Arrow slits (north and west walls) - no far side found
- `p_wrykxxazar` Thin arrow slits - no far side found
- `p_xx2nlp4u64` Thin arrow slits - no far side found
- `p_xxn6gnnrp6` Tall stained-glass windows (east wall), nearly opaque - no far side found
- `p_y1h2mdlxdl` Stained-glass windows, broken and boarded up - no far side found
- `p_y7noywk10k` Battlemented walkways out to the outer walls (north, south, east) - no far side found
- `p_yn7zfp2wh6` Thin arrow slits - no far side found
- `p_zhudbyzb14` Arrow slits - no far side found
- `p_zzczfnqk6t` Stone trapdoor in the shaft roof, into K47 - reaches K21, K47; could not tell which side it opens on

### Check (145)

Migration picked a side but was not certain.

- `p_0dezuz10xr` Arrow slits - the far side's name was copied from this side
- `p_0dxv0h56eh` Door to K39 (north wall) - the far side's name was copied from this side
- `p_0gu5mf6g2t` Spiral staircase, up to K30 and down to K61 (east) - the far side's name was copied from this side
- `p_0joaldi673` Stone slab door - the far side's name was copied from this side
- `p_0wfwbg7hhm` Arrow slits - the far side's name was copied from this side
- `p_14kxubnnjw` Arrow slits - the far side's name was copied from this side
- `p_1f8eko6r26` Stone slab door - the far side's name was copied from this side
- `p_1oxmz1cg88` Stone slab door - the far side's name was copied from this side
- `p_21y6ysn1ce` Thin arrow slits - the far side's name was copied from this side
- `p_22mchc0wjo` Stone slab door - the far side's name was copied from this side
- `p_2qp4acj65j` Staircase down to K62 (south wall) - the far side's name was copied from this side
- `p_2v46lpa0b5` Arched double doors (south and east) - the far side's name was copied from this side
- `p_2vwo4374wr` Arrow slits - the far side's name was copied from this side
- `p_2wxlns6w1e` Inner double doors (east, to K8) - the far side's name was copied from this side
- `p_3dobq7yz4s` Iron portcullis - the far side's name was copied from this side
- `p_3ibgy5mr7s` Stone slab door - the far side's name was copied from this side
- `p_3ont72frov` Narrow staircase up to K34, along the north wall - the far side's name was copied from this side
- `p_3sdcjn5pxx` Gaping doorway, the slab door gone - the far side's name was copied from this side
- `p_4c8p7yxy20` Open archway to K13 (first landing, 50 feet up) - the far side's name was copied from this side
- `p_4cf7gcgbpd` Stone slab door - the far side's name was copied from this side
- `p_4hjv027lxo` Other doors - the far side's name was copied from this side
- `p_4vshfg1nyw` Arrow slits - the far side's name was copied from this side
- `p_4z4hehpg4l` Trapdoor in the ceiling, up to K60a - the far side's name was copied from this side
- `p_51mkdckqck` Stairs down, south - the far side's name was copied from this side
- `p_55qi835q5v` Secret door beside the bed (north wall), to the hall through to K45 - the far side's name was copied from this side
- `p_59opcresr3` Stone slab door - the far side's name was copied from this side
- `p_5pa4egjs9h` Secret door hiding a ladder down to K34 - the far side's name was copied from this side
- `p_5rqfu7cskm` Arrow slits - the far side's name was copied from this side
- `p_6jt7e40t5t` Arrow slits - the far side's name was copied from this side
- `p_6nyl9v1neq` Red satin curtained archways to K44 (both ends of the south wall) - the far side's name was copied from this side
- `p_6x48yqm6ry` Stone slab door - the far side's name was copied from this side
- `p_6xo3sgo15z` Stone slab door - the far side's name was copied from this side
- `p_85tyf5208q` Large iron gates - the far side's name was copied from this side
- `p_88bs2kwmrl` Barred iron cell door - the far side's name was copied from this side
- `p_8bvcoxgu43` Barred iron cell door - the far side's name was copied from this side
- `p_8msei92la3` Arrow slits - the far side's name was copied from this side
- `p_8mwu1mstn6` Eastern door to the K21 stair - the far side's name was copied from this side
- `p_8s5ioc8pjw` Staircases down to K19 (both ends of the north wall) - the far side's name was copied from this side
- `p_8v0vglkppv` Boarded-up stained-glass windows - the far side's name was copied from this side
- `p_9gnhxhs5e9` Stone slab door - the far side's name was copied from this side
- `p_9qqvan8p6w` Boarded-up stained-glass windows - the far side's name was copied from this side
- `p_a45cq4vsxq` Barred iron cell door - the far side's name was copied from this side
- `p_a4xzjj04q8` Stone slab door - the far side's name was copied from this side
- `p_amjf5bd480` Secret trapdoor in the ceiling, up to K55 - the far side's name was copied from this side
- `p_b9bduhr6n7` Rusted iron portcullis barring the way to K63 (east wall) - the far side's name was copied from this side
- `p_bbr96w5oi6` Stone slab door - the far side's name was copied from this side
- `p_bysxtyw1iy` Stone slab door - the far side's name was copied from this side
- `p_c8qoetrnqe` Arched bronze doors to K40 (east end) - the far side's name was copied from this side
- `p_c9ixh8b438` Arrow slits - the far side's name was copied from this side
- `p_cax477f10p` Stairs down 40 feet to K33 (west end) - the far side's name was copied from this side
- `p_cw9yjazxgu` Barred iron cell door - the far side's name was copied from this side
- `p_cwx9tq46rd` Stone slab door - the far side's name was copied from this side
- `p_cyilncu6ia` Stone slab door, fallen flat on the floor - the far side's name was copied from this side
- `p_d0amz2ut77` Staircase east, up to K21 - the far side's name was copied from this side
- `p_d36npytubw` Barred iron cell door - the far side's name was copied from this side
- `p_dbfz18va8h` Stone slab door - the far side's name was copied from this side
- `p_dte0snm42q` Three leaded-glass windows in steel latticework (curved west wall) - the far side's name was copied from this side
- `p_e7rjlh4tsp` Barred iron cell door - the far side's name was copied from this side
- `p_e9wntbriqz` Stone slab door - the far side's name was copied from this side
- `p_fhubomhupn` Gaping hole in the roof - the far side's name was copied from this side
- `p_g0bx26y73l` Sculpted stone railing around the balcony - the far side's name was copied from this side
- `p_gcqa98g36a` Other doors - the far side's name was copied from this side
- `p_gekcuqmny3` Staircase up to K45 (north end of the west wall) - the far side's name was copied from this side
- `p_gmrz54jgkv` Stone slab door - the far side's name was copied from this side
- `p_gxbh8a0k9w` Staircase down to K24 (north wall) - the far side's name was copied from this side
- `p_hd8whase9h` Open archway to K69 (west wall) - the far side's name was copied from this side
- `p_he6wabffnq` Stone slab door - the far side's name was copied from this side
- `p_hpfaxar5w4` Sculpted stone railing around the balcony - the far side's name was copied from this side
- `p_hs4jdgk819` Arrow slits - the far side's name was copied from this side
- `p_hvqtmhgj41` Three leaded-glass windows in steel latticework (curved west wall) - the far side's name was copied from this side
- `p_i2cuinojex` Stairs up to K23 (east end) - the far side's name was copied from this side
- `p_i3immf7v15` Stone slab door - the far side's name was copied from this side
- `p_igs1elw8oa` Secret doors, one at each end of the hall - the far side's name was copied from this side
- `p_il677gpo1t` Arrow slits - the far side's name was copied from this side
- `p_io4rxo735z` Barred iron cell door, hanging slightly open - the far side's name was copied from this side
- `p_ist9ehrl7n` Doors at each end of the north wall, and one to the south - the far side's name was copied from this side
- `p_js2i6j2qxq` Secret door to K13 (south wall) - the far side's name was copied from this side
- `p_jxp93wvo8a` Barred iron cell door - the far side's name was copied from this side
- `p_k3vqhzkayr` Stone slab door - the far side's name was copied from this side
- `p_kf0flopil2` Doors, which slam and lock if the brazier, hourglass or golems are attacked - marked from 3 rooms (K78, K83, K83a); kept the first two
- `p_l0kjqozsah` Stone slab door, opening on the tunnel to K81 - marked from 3 rooms (Crypt 1, K81, K84); kept the first two
- `p_l1hlytwhf9` Barred iron cell door - the far side's name was copied from this side
- `p_lhfo2svlif` Barred iron cell door - the far side's name was copied from this side
- `p_llrezhnpgz` Stone slab door - the far side's name was copied from this side
- `p_lnur9tzkzx` Arrow slits - the far side's name was copied from this side
- `p_m15yhtlc13` Opening onto the elevator shaft (south) - the far side's name was copied from this side
- `p_ma883829rh` Two arched windows with heavy curtains (south wall) - the far side's name was copied from this side
- `p_my1d29x580` Barred iron cell door - the far side's name was copied from this side
- `p_n6n567i0gj` Double doors (one set at each end) - the far side's name was copied from this side
- `p_ndl5te56hr` Broken north door to K24 - the far side's name was copied from this side
- `p_ndlhtvoi70` Oversized stone slab door, 6 by 8 feet (DC 20 Strength) - the far side's name was copied from this side
- `p_ngk2qq1ktk` Other doors - the far side's name was copied from this side
- `p_nujohif846` Stone slab door laid aside, freshly engraved "Ireena Kolyana: Wife" - the far side's name was copied from this side
- `p_o0ane0ofoy` Staircases up to K25 - the far side's name was copied from this side
- `p_obbe4cz2v2` Secret door at the top, into K72 - the far side's name was copied from this side
- `p_oq68yvdtfy` Staircases down to K19 (both ends of the north wall) - the far side's name was copied from this side
- `p_ovr30yaqa8` Stone slab door - the far side's name was copied from this side
- `p_pas3fwtpjl` Arrow slits - the far side's name was copied from this side
- `p_plg00pxvwn` Stone slab door - the far side's name was copied from this side
- `p_pqnsu1gfqm` Stone slab door - the far side's name was copied from this side
- `p_qdur03kfmz` Stone slab door - the far side's name was copied from this side
- `p_qj1p2jcwxj` Stone slab door - the far side's name was copied from this side
- `p_qj33906web` Two steel portcullises that drop to seal the compartment - the far side's name was copied from this side
- `p_qlwt61mwor` Staircase down to K29 (north of the doors) - the far side's name was copied from this side
- `p_qutoiqy1h7` Secret door hiding a ladder down to K34 - the far side's name was copied from this side
- `p_qzcoecwn7x` Stone slab door - the far side's name was copied from this side
- `p_r1ragjzkia` Secret trapdoor in the northeast corner, down to K51 - the far side's name was copied from this side
- `p_rcm2yyaglf` Sculpted stone railing around the balcony - the far side's name was copied from this side
- `p_re5v9dj07m` Stone slab door - the far side's name was copied from this side
- `p_rutz6x9nc0` Narrow secret door to K31b (west end of the south wall) - the far side's name was copied from this side
- `p_rzu0w29732` Wooden doors (north and west walls) - the far side's name was copied from this side
- `p_s00n7elerl` Barred iron cell door - the far side's name was copied from this side
- `p_shj59v4kos` Doors in the centre of the north and south walls - the far side's name was copied from this side
- `p_shri5xo02h` Arrow slits - the far side's name was copied from this side
- `p_syl94b4pwp` Barred iron cell door - the far side's name was copied from this side
- `p_t6qesd8y15` Arrow slits - the far side's name was copied from this side
- `p_t9vj57uosl` Stone slab door - the far side's name was copied from this side
- `p_tcmqctvk3l` Red satin curtained archways to K44 (both ends of the south wall) - the far side's name was copied from this side
- `p_tr3da0pohi` Iron portcullis - the far side's name was copied from this side
- `p_trm1bzq5ir` Barred iron cell door - the far side's name was copied from this side
- `p_u2z9wcgkf6` Stone slab door - the far side's name was copied from this side
- `p_u88udaf6k0` Two arched windows with heavy curtains (south wall) - the far side's name was copied from this side
- `p_uc19duvdjb` Arrow slits - the far side's name was copied from this side
- `p_ugwny3zjco` Arrow slits - the far side's name was copied from this side
- `p_ujoimxfghh` Secret door at the back of an alcove - the far side's name was copied from this side
- `p_uxdoq859w0` Arrow slits - the far side's name was copied from this side
- `p_vee2ooio3i` Secret door to K79 (north end of the west wall) - the far side's name was copied from this side
- `p_vklqfw7whx` Web-filled stairway spiralling down (south) - the far side's name was copied from this side
- `p_vl6jy8stzj` Stone slab door - the far side's name was copied from this side
- `p_vozkqxfm63` Stone slab door - the far side's name was copied from this side
- `p_w2nx6jw45n` Stone slab door - the far side's name was copied from this side
- `p_w3ugpzvno4` Ten-foot-square shaft plunging into darkness - the far side's name was copied from this side
- `p_wc1hg5jysl` Stone slab door - the far side's name was copied from this side
- `p_wc6o19jp56` Arrow slits - the far side's name was copied from this side
- `p_wpqdvwvlyl` Stone slab door - the far side's name was copied from this side
- `p_ww26hvdmg0` Doors - the far side's name was copied from this side
- `p_x0ovljux84` Doors, which slam and lock if the brazier, hourglass or golems are attacked - the far side's name was copied from this side
- `p_xr9jgpdtkp` Barred iron cell door - the far side's name was copied from this side
- `p_xrdcf3eyrb` Stairs up to K29 (west) - the far side's name was copied from this side
- `p_y1imugdq93` Barred iron cell door - the far side's name was copied from this side
- `p_z3fap39oyt` Arrow slits - the far side's name was copied from this side
- `p_z86ca4xalv` Secret door to K41 (west end of the north wall) - the far side's name was copied from this side
- `p_zhlnmk4tlk` Staircases up to K25 - the far side's name was copied from this side
- `p_zj6uvdx0eh` Three leaded-glass windows in steel latticework (curved west wall) - the far side's name was copied from this side
- `p_zkaikdg27v` Spiral staircase (north end of the east wall) - the far side's name was copied from this side

### No way in (2)

No portal touches this room at all, so nothing leads to it and it leads nowhere. Either it really is sealed, or a way was never drawn.

- `K20a` Tower Hall Stair has no portal on either side of it
- `K52` Smokestack has no portal on either side of it

### Duplicates (19)

Several portals join the same two places. Two doors between two rooms is sometimes right; more often it is one doorway marked several times and never tied together.

- 2 portals join Crypt 14 and K84: Stone slab door; Ten-foot-square shaft plunging into darkness
- 2 portals join K13 and K20: Open archway to K13 (first landing, 50 feet up); Open to K20
- 2 portals join K2 and K3: Iron portcullis
- 2 portals join K21 and K61: Two steel portcullises that drop to seal the compartment; Web-filled stairway spiralling down (south)
- 2 portals join K23 and K62: Staircase down to K62 (south wall); Stairs up to K23 (east end)
- 2 portals join K24 and K34: Narrow staircase up to K34, along the north wall; Staircase down to K24 (north wall)
- 2 portals join K3 and K5: Boarded-up stained-glass windows
- 2 portals join K31b and K39: Door to K39 (north wall); Narrow secret door to K31b (west end of the south wall)
- 2 portals join K33 and K45: Staircase up to K45 (north end of the west wall); Stairs down 40 feet to K33 (west end)
- 2 portals join K42 and K45: Secret door at the back of an alcove; Secret door beside the bed (north wall), to the hall through to K45
- 2 portals join K51 and K55: Secret trapdoor in the ceiling, up to K55; Secret trapdoor in the northeast corner, down to K51
- 2 portals join K62 and K65: Other doors
- 21 portals join K18 and K59: Arrow slits; Gaping hole in the roof
- 3 portals join K15 and K28: Sculpted stone railing around the balcony
- 3 portals join K20 and K34: Secret door hiding a ladder down to K34
- 3 portals join K49 and K53: Three leaded-glass windows in steel latticework (curved west wall)
- 4 portals join K15 and K5: Stained-glass windows, broken and boarded up
- 4 portals join K19 and K25: Staircases down to K19 (both ends of the north wall); Staircases up to K25
- 4 portals join K43 and K44: Red satin curtained archways to K44 (both ends of the south wall); Two arched windows with heavy curtains (south wall)

### Stairs (2)

Flights built across floors, and the pairs that were joined.

- `K18::f1` (Spiral staircase around the central shaft) became 5 flights: dungeon -> larders -> main -> court -> weeping -> spires
- `K20::f2` (Spiral staircase hugging the outer wall, no railing) became 3 flights: main -> court -> weeping -> spires

### Guessed light (21)

A light-type feature became an item lit 20 ft bright, 40 ft dim. The module rarely says, so check the ones that matter.

- `Crypt 31::f5` (Shattered lantern at the bottom of the pit) became an item lit 20/40 ft
- `Crypt 3::f5` (Old chandelier hanging from the domed ceiling) became an item lit 20/40 ft
- `Crypt 40::f2` (Three unlit torches in iron brackets (north, east and south walls)) became an item lit 20/40 ft
- `K10::f1` (Crystal chandeliers (three)) became an item lit 20/40 ft
- `K1::f2` (Torch) became an item lit 20/40 ft
- `K21::f2` (Fluttering torches) became an item lit 20/40 ft
- `K32::x1` (Oil lamps) became an item lit 20/40 ft
- `K33::x1` (Three unlit oil lamps) became an item lit 20/40 ft
- `K36::f2` (Web-shrouded iron chandelier) became an item lit 20/40 ft
- `K37::f1` (Blazing hearth, with the polished poker in its stand) became an item lit 20/40 ft
- `K38::f3` (Two torch sconces on the east wall, the north one empty) became an item lit 20/40 ft
- `K42::f3` (Three candelabras of tall white candles) became an item lit 20/40 ft
- `K49::f1` (Three ornate lanterns hanging from the beams) became an item lit 20/40 ft
- `K62::f1` (Lantern on the floor) became an item lit 20/40 ft
- `K65::f1` (Blazing fire pit in the centre of the room) became an item lit 20/40 ft
- `K66::f3` (Dusty lanterns) became an item lit 20/40 ft
- `K67::f2` (Chandelier of bones) became an item lit 20/40 ft
- `K78::f1` (Stone brazier, seven coloured crystal stones set in its rim) became an item lit 20/40 ft
- `K7::f2` (Fluttering torches) became an item lit 20/40 ft
- `K8::f1` (Sputtering torches) became an item lit 20/40 ft
- `K9::f1` (Torches) became an item lit 20/40 ft

### Guessed lock (26)

The text mentions a lock, so lockable was switched on.

- `p_2qtel3sp07` Door in the centre of the wall behind the curtain - the text mentions a lock, so lockable is on
- `p_3dobq7yz4s` Iron portcullis - the text mentions a lock, so lockable is on
- `p_4n4vt1l5ov` Doors, which slam and lock if the brazier, hourglass or golems are attacked - the text mentions a lock, so lockable is on
- `p_85tyf5208q` Large iron gates - the text mentions a lock, so lockable is on
- `p_88bs2kwmrl` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_8bvcoxgu43` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_a45cq4vsxq` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_cw9yjazxgu` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_d36npytubw` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_e7rjlh4tsp` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_eaw3y5hz2b` Ironbound door - the text mentions a lock, so lockable is on
- `p_io4rxo735z` Barred iron cell door, hanging slightly open - the text mentions a lock, so lockable is on
- `p_jxp93wvo8a` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_kf0flopil2` Doors, which slam and lock if the brazier, hourglass or golems are attacked - the text mentions a lock, so lockable is on
- `p_l1hlytwhf9` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_lhfo2svlif` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_my1d29x580` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_occywgyd3c` Ironbound door - the text mentions a lock, so lockable is on
- `p_rte963hdqh` Smaller unbanded door (east wall) - the text mentions a lock, so lockable is on
- `p_s00n7elerl` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_syl94b4pwp` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_tr3da0pohi` Iron portcullis - the text mentions a lock, so lockable is on
- `p_trm1bzq5ir` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_x0ovljux84` Doors, which slam and lock if the brazier, hourglass or golems are attacked - the text mentions a lock, so lockable is on
- `p_xr9jgpdtkp` Barred iron cell door - the text mentions a lock, so lockable is on
- `p_y1imugdq93` Barred iron cell door - the text mentions a lock, so lockable is on

### Guessed transparency (32)

A door that reads as see-through - a portcullis, a barred cell door, a grate - so vision passes it while it is shut.

- `p_0yk128plz7` Drawbridge and portcullis mechanism - reads as something you can see through while it is shut
- `p_2hirjhmxrs` Barred archways: north to K85, south to K86, east to K87 - reads as something you can see through while it is shut
- `p_2qtel3sp07` Door in the centre of the wall behind the curtain - reads as something you can see through while it is shut
- `p_3dobq7yz4s` Iron portcullis - reads as something you can see through while it is shut
- `p_3wgrvjtjbf` Barred archways: north to K85, south to K86, east to K87 - reads as something you can see through while it is shut
- `p_43wvmcza6c` Barred archways: north to K85, south to K86, east to K87 - reads as something you can see through while it is shut
- `p_4n4vt1l5ov` Doors, which slam and lock if the brazier, hourglass or golems are attacked - reads as something you can see through while it is shut
- `p_88bs2kwmrl` Barred iron cell door - reads as something you can see through while it is shut
- `p_8bvcoxgu43` Barred iron cell door - reads as something you can see through while it is shut
- `p_a45cq4vsxq` Barred iron cell door - reads as something you can see through while it is shut
- `p_b9bduhr6n7` Rusted iron portcullis barring the way to K63 (east wall) - reads as something you can see through while it is shut
- `p_cw9yjazxgu` Barred iron cell door - reads as something you can see through while it is shut
- `p_d36npytubw` Barred iron cell door - reads as something you can see through while it is shut
- `p_e7rjlh4tsp` Barred iron cell door - reads as something you can see through while it is shut
- `p_evqc1arawr` Two steel portcullises that drop to seal the compartment - reads as something you can see through while it is shut
- `p_hois4pldlg` Hinged wooden doors - reads as something you can see through while it is shut
- `p_hsam7ni5pw` Drawbridge and portcullis mechanism - reads as something you can see through while it is shut
- `p_io4rxo735z` Barred iron cell door, hanging slightly open - reads as something you can see through while it is shut
- `p_jxp93wvo8a` Barred iron cell door - reads as something you can see through while it is shut
- `p_kf0flopil2` Doors, which slam and lock if the brazier, hourglass or golems are attacked - reads as something you can see through while it is shut
- `p_l0kjqozsah` Stone slab door, opening on the tunnel to K81 - reads as something you can see through while it is shut
- `p_l1hlytwhf9` Barred iron cell door - reads as something you can see through while it is shut
- `p_lhfo2svlif` Barred iron cell door - reads as something you can see through while it is shut
- `p_my1d29x580` Barred iron cell door - reads as something you can see through while it is shut
- `p_qj33906web` Two steel portcullises that drop to seal the compartment - reads as something you can see through while it is shut
- `p_s00n7elerl` Barred iron cell door - reads as something you can see through while it is shut
- `p_syl94b4pwp` Barred iron cell door - reads as something you can see through while it is shut
- `p_tr3da0pohi` Iron portcullis - reads as something you can see through while it is shut
- `p_trm1bzq5ir` Barred iron cell door - reads as something you can see through while it is shut
- `p_x0ovljux84` Doors, which slam and lock if the brazier, hourglass or golems are attacked - reads as something you can see through while it is shut
- `p_xr9jgpdtkp` Barred iron cell door - reads as something you can see through while it is shut
- `p_y1imugdq93` Barred iron cell door - reads as something you can see through while it is shut

### Folded in (1)

Marks that became part of something else.

- `K18::x1` (Masonry wall blocking the stair) became 8 wall lines on K18's outline

### Dropped (9)

Nothing was written for these.

- `K1::f5` was hidden but no longer exists in castle-data.json
- `K1::f6` was hidden but no longer exists in castle-data.json
- `K1::f9` was hidden but no longer exists in castle-data.json
- `K2::f1` was hidden but no longer exists in castle-data.json
- `K2::f3` was hidden but no longer exists in castle-data.json
- `K3::f3` was hidden but no longer exists in castle-data.json
- `K4::f2` was hidden but no longer exists in castle-data.json
- `K4::f3` was hidden but no longer exists in castle-data.json
- `K6::f3` was hidden but no longer exists in castle-data.json
