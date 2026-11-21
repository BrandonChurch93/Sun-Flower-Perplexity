# Round 14 · Phase 4 · `dawn` · extra round

Judged commit `921385e` (engine `6a3e309f0b524dd3`, unit hash `e9892f9e201e23b7`). Judged frames 0, 45, 60 and 195 (`dawn`, 0.0 s, 1.5 s, 2.0 s and 6.5 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3-1.json` and `R3-2.json` with the merged `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md`, `MANIFEST-R2.md`, `MANIFEST-R3-1.md`, `MANIFEST-R3-2.md` and `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Claude, R3 GPT (two critics, because the surface set is over the 10 files one message may carry), R4 Gemini. The jury was asked the four judged frames, five jurors each, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the votes on the two controls are round 9's, reused as the kit orders.

## Result

Not a pass. This was the second of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 12 to 16) | | | |
| M1, M2, M3 | pass (M3 0.842 at frame 45, 0.954 at frame 195 at `final`, 0.8 needed) | | | |
| R1 match (Claude) | 4 | 5 | 8 | 2 |
| R2 jury | passes: 13 of 20 votes on the judged frames were (a), a share of 0.65; 5 of 10 on the controls, 0.50 | | | |
| R3 surface and detail (GPT) | 7 | 0 | 8 | 0 |
| R4 motion (Gemini) | 4 | 4 | 3 | 1 |

Jury: by frame: 0 with 4 of 5 (a), 45 with 4 of 5, 60 with 2 of 5, 195 with 3 of 5. What the others name at frame 60: "the visibly faceted, angular polygon geometry of the displaced soil mesh right in the sharp focal plane where the smooth cylindrical stem intersects it", "The striped seed shell is too clean, the soil is chunky and procedural-looking, and the bokeh and sun glow look like stock render effects". Those who said (a) name the light, as at frame 45: "the precise sunset rim lighting that picks out the tiny hairs on the sprout".

## Open issues, in the critics' words

1. R1 severe (set-A-01-b.png, whole frame, soil and plant surfaces). "b reads as a CG render, not the same photographic camera: soil is a uniform sparkly gray-blue granular mesh with crisp low-contrast clumps instead of a's moist, dark brown-black clods with wet specular glints; plant surfaces are smooth and plasticky"
2. R1 severe (set-A-04-b.png, whole frame, soil and plant surfaces). "same CG look as 01-b: grainy gray-blue gravel soil, matte low-contrast blacks, clean rendered leaves; a is a photographic shot with wet dark soil and glints"
3. R1 severe (set-A-01-b.png, sun and sky at right / region 4 (set-A-02.png)). "a has a strong backlit sun with starburst rays, warm flare and haze spilling into the field; b's sun is a soft disc with no rays, flare or haze bloom, so the backlight barely glows into the scene"
4. R1 severe (set-A-04-b.png, sun at right / region 4 (set-A-05.png)). "a's sun sits lower behind the skyline with starburst rays and strong rim-lit haze; b's sun is a diffuse disc, no rays, flatter haze"
5. R1 severe (set-A-04-b.png, right-side grass clump and left foreground). "a has a dense dewy grass tuft with sparkling backlit droplets at right and small sprouts scattered in the midground; b has a sparse, clean, smooth-bladed clump with no dew glints, and a new tall in-focus-ish grass blade at left-center not in a"
6. R4 severe (set-D-03.png, soil surface around the emerging hypocotyl hook and striped seed coat (f0004-f0011)). "the stem, attached dirt lumps, and seed hull push upward at ~18 px/frame straight through completely static, rigid soil clods with zero soil displacement or cracking"
7. R4 severe (set-D-01.png, left grass blades (f0022-f0239), right grass tuft (f0130-f0239), seedling leaves, and distant valley mist (f0000-f0239)). "the left grass blades stay completely frozen for all 8.0 s, the right grass tuft freezes into a rigid statue after f0130 (4.3-8.0 s), the seedling shows no time-lapse nutation or wind micro-motion, and the background mist never drifts"
8. R4 severe (set-D-01.png, seed hull and cotyledon tips from f0087 (2.9 s) through f0130 (4.3 s)). "the seed hull pops from a closed black shell (f0087) into a wide-open pale clamshell hanging mid-air with slow real-time fall blur (f0109) inside a multi-day time-lapse while the cotyledons snap straight without sliding out of the hull, then perches rigidly on edge on the soil through f0239"
9. R4 severe (set-D-01.png, central true-leaf bud (f0174-f0239) and cotyledons (f0109-f0174)). "the first pair of true leaves scales up uniformly from the cotyledon node as a single rigid closed spear mesh without separating or unfolding, and the cotyledons hinge outward like flat rigid paddles while scaling larger"
10. R1 major (set-A-01-b.png, left foreground grass). "a has one or two broad blades at the far left edge, rising to the top; b has a tall cluster of thin blades with bright bokeh dots/dew balls that are not in a"
11. R1 major (set-A-01-b.png, seed head / regions 1-3 (set-A-02.png)). "seed coat in a is crusted with soil specks and has white-cream stripes with a pale green tip; b's coat is clean gray with smooth wavy dark stripes, more open with a bright lime cotyledon showing along its length, and hangs more to the right/lower; soil particles on stem are large discrete black cubes rather than fine crumbs"
12. R1 major (set-A-01-b.png, stem / region 2 (set-A-02.png)). "a's stem is thicker, with a strong magenta-red base and dense backlit hairs; b's stem is thinner, paler pink, hook narrower"
13. R1 major (set-A-04-b.png, cotyledons and stem / regions 1-3 (set-A-05.png)). "a's leaves are warm yellow-green, translucent and strongly rim-lit with fine edge hairs and small dew; b's are cool blue-green, opaque and flat with large evenly spaced bead droplets, and the stem is covered in regularly spaced dots; the central bud in b is a sharp serrated leaf rather than a's small soft bud"
14. R1 major (set-A-04-b.png, seed husk / region 2 (set-A-05.png)). "a's husk is two upright gray striped halves standing to the left of the stem; b's husk is smaller, whiter, lying lower and further left"
15. R1 major (set-A-01-b.png, far background at skyline / region 6 (set-A-03.png)). "a's skyline is a soft misty line of trees and fog; b shows a distinct dark hill/mountain shape at upper left and a flat band below, plus an orange bokeh blob not in a"
16. R1 major (set-A-04-b.png, far background / region 6 (set-A-06.png)). "a's skyline is a ridge of trees with mist rolling over the field; b has a smooth single hill and a flat gray water-like band, no mist layer, no tree texture"
17. R1 major (set-A-01-b.png, midground field / region 5 (set-A-03.png)). "a's field is dark soil with green sprout and warm glint bokeh; b's has a warm orange band of bokeh and larger out-of-focus grass in front; depth falloff is flatter"
18. R3 major (set-C-05.png, Crops 1–2, the stem hook and straight stalk at 1.5 s; also visible in set-C-08.png). "The stalk is a near-constant-width band with little shading across its face. The hairs are present, but they mostly read as a bright, fairly even fringe on the two edges, which makes the stalk look like a flat ribbon."
19. R3 major (set-C-08.png, Crops 1 and 3, the split seed coat and green tissue inside it at 2.0 s; also visible in set-C-05.png). "The split coat has blunt, angular lips and uniformly ordered ridges, while the exposed green tissue is a smooth strip with little internal structure. Together they look like a molded shell and insert."
20. R3 major (set-C-08.png, Crop 5, the in-focus clods flanking the stem at 2.0 s; also visible in set-C-02.png and set-C-05.png). "The dark clods have broad slick facets and hard amber glints, with little loose grit between them. They read more like broken shiny rock than soil crumbs."
21. R3 major (set-C-08.png, Crop 4, the two adjacent droplets on the front of the stem bend at 2.0 s). "The two face-on beads look like flat translucent disks against the stalk, unlike the more dimensional glints at the silhouette."
22. R3 major (set-C-11.png, crop 2, the main stem and both rim-lit edges). "the stem reads as a smooth, nearly constant-width olive tube, and its hairs merge into two nearly continuous bright fringes"
23. R3 major (set-C-11.png, crop 4, dew down the front of the stem). "several beads read as flat, pale circular spots rather than curved droplets attached to the stem"
24. R3 major (set-C-11.png, crop 3, the broad left seed leaf and its lower margin). "the smooth face, faint texture-like veins and long uniform rim give the leaf a molded, waxy appearance"
25. R3 major (set-C-12.png, crop 9, the droplet at the tip of the grass blade to the right of the sun). "the bead appears separated from the tip by a sliver of sky"
26. R4 major (set-D-01.png, empty space below the seed hull (f0043-f0087) and along the hypocotyl stem (f0022-f0152)). "an orphan dirt crumb floats disconnected in mid-air below the seed coat from f0043 to f0087, while other dirt pellets stay glued to fixed stem UVs before shrinking in place to zero (f0109-f0152) as static UV-pinned dew drops fade in"
27. R4 major (set-D-01.png, horizon line and sun across f0000-f0239). "camera vertical pitch reverses direction twice while tracking the plant top - the horizon moves down ~16 px (f0000-f0087), reverses upward ~6 px (f0087-f0152), then reverses downward ~14 px (f0152-f0239) - and horizontal sun drift stalls after f0196"
28. R4 major (set-D-03.png, backlit trichomes on the upper rim and inner arch of the hypocotyl (f0005-f0011)). "fine stem hairs smear into an artificial sharp parallel line separated from the stem skin along the upper rim and break into noisy crawling clumps under the arch"

Minor issues: R1 2, R3 0, R4 1; they are in the cards.

## What was measured against the critics' words

- The camera's tilt (the motion critic: the pitch reverses twice). Measured by the Builder: the horizon straight ahead stood at 313.6, 356.6, 369.0, 346.3, 356.0 and 401.1 px at frames 0, 45, 80, 160, 195 and 240, because distance, height and aim height each ran evenly between two keys while the tilt they give together did not. The tilt each key gives is now carried on one monotone track up to the rain key (`8a4471a`, with a test): 351.0, 356.9, 356.8, 356.2, 356.0 and 374.2 px at the same frames.
- The hull. It stays pinched on the tips, is pushed along them until frame 108, falls in frames 109 to 111 and stands as two halves in the crumbs beside the stem as the approved 195 shows (`491a897`, `fe198e1`). The approved's husk at 195 is 212 px long and ours was 140; it is 1.3 times as long once it is free, still smaller and paler than the approved's.
- The double rim on the hook (the motion critic: "fine stem hairs smear into an artificial sharp parallel line separated from the stem skin along the upper rim"). By the hairs' agent's test the two dotted lines are not the hairs; the sprout's short coat of 5200 hairs now comes out from 0.3 s, and frame 8 of the line shows one clean rim.
- The skyline and the air. The tree line runs across the frame with the sun in a gap (`d0f4614`), rendered by the Builder at 45, 195, 420 and 540 before it was taken. A third mist rolls over the field and the near mist is thinner and warmer, so the flat blue grey band that read as water is gone (`dd145bf`); the far trees now read paler than the approved's dark line (87,93,94 against 25,49,54 at 195), which is an open item.
- The star at the sun. The approved shows rays there; the lens's agent showed thin ruled spokes first, and the order was broad soft uneven wedges that live to the cut or no star at all. It stays faint (0.025) on the line.
- The motion critic's minor issue about the 12 frame window starting on empty soil is about the pack: the harness chooses the window from the frames that change fastest, as the kit orders, and the rule is not touched.
- At the cut at 8.0 s the seed leaf's and the stem's beads now turn from dew to rain over 1.5 s (`6547d93`); the seed leaf itself still turns grey with dark veins in one frame, which is the rain's light on its wet skin.

Nothing is declined.

## What happens to the open issues

The last fix pass ran from 21:34 to 23:25 UTC on the line `phase4/integrate`. Each owning agent had the critics' and jurors' words on its part, word for word, and an order ranked by severity (`out/work/briefs/round-012-016-notes/`). A piece went on the line only when its author's own still at `review` showed it right beside the approved image, with frames 1350, 1515 and 1559 of the finished bloom shown byte identical. For the dawn that was: the camera's tilt, the hull, the sprout's girth and coat, the ground's lumps and tufts, the tree line and the mist. The unit's third and last round (`maxRoundsPerUnit` 3) is cut together with the other four open units' at 23:35 UTC from that line, if `npm run clock` then prints `extra rounds: yes`. What is still open after it goes under "Open items" in `kit/PROGRESS.md`.
