# Round 15 · Phase 4 · `rain` · extra round

Judged commit `921385e` (engine `6a3e309f0b524dd3`, unit hash `144dfe3ec5e8ef7d`). Judged frame 420 (`rain`, 14.0 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 GPT, R3 Gemini, R4 Claude. The jury was asked the judged frame, five jurors, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the votes on the control are round 10's, reused as the kit orders.

## Result

Not a pass. This was the second of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 12 to 16) | | | |
| M1, M2, M3 | pass (M3 0.816 at `final`, 0.8 needed) | | | |
| R1 match (GPT) | 5 | 4 | 5 | 0 |
| R2 jury | fails: 1 of 5 votes on the judged frame were (a), 3 of 5 on the control | | | |
| R3 surface and detail (Gemini) | 4 | 2 | 10 | 0 |
| R4 motion (Claude) | 6 | 0 | 3 | 3 |

Jury: two jurors called the judged frame (e) with 88 and 86, two (d) with 45 and 74, one (a) with 78 ("the controlled storm backlighting that picks out fine droplets along the stem and leaf edges"). What the four name: the leaves and the grass ("the polygonal faceted edges on the leaves and flat ribbon geometry of the grass blades", "The plant's angular leaf silhouettes make it look like a low-poly 3D asset"), the plant's build ("a stiff, uniform stem, near-symmetric leaves, and a leaf near the base that seems to float, unattached to the stem"), the hairs and splashes ("uniform particle hairs and rigid splash meshes").

## Open issues, in the critics' words

1. R1 severe (set-A-01-b.png, whole plant silhouette, especially the crown and left half). "The plant is the right height and its stem is in roughly the right place, but the canopy sprawls much farther left, the branching is broad and rigid, and the top reads as a blunt upright stem between two separated leaves rather than a compact growing tip with a dominant pointed leaf rising to the right."
2. R1 severe (set-A-03.png, region 6 and the rainfall across the frame). "The rain is made of comparatively sparse, bold, isolated diagonal rods with similar opacity; the target has a denser curtain of much finer streaks with more variation in length, focus, and brightness."
3. R1 severe (set-A-01-b.png, foreground soil and central runoff). "The foreground is flatter and less wet, with dark matte mud and a broad silky runoff ribbon that bends left; the target has raised glossy clods framing a more central runnel, with small glints, capillary ripples, and many sharp impact splashes."
4. R1 severe (set-A-03.png, region 5, distant skyline and field separation). "A flat luminous cyan mist stripe separates the almost planar field from a smooth ridge with an exaggerated left hump; the target has a softer irregular treeline and rain haze that blends into leafy foreground and distance without a hard band."
5. R3 severe (set-C-01.png, rain streaks across the entire frame (also set-C-03.png crop 9 and crop 10)). "the falling rain consists of uniform, ruler-straight white lines with crisp edges and hard endpoints that sit on top of both sharp foreground and blurred sky rather than inside the scene's depth"
6. R3 severe (set-C-02.png, crop 3 and crop 4, true leaf blades and petioles (also set-C-01.png)). "the leaves have a waxy, molded-plastic sheen with painted-looking concentric green bands, and backlit leaves and petioles in crop 4 stay dark and opaque against the bright sky with almost no transmitted light"
7. R1 major (set-A-02.png, regions 1 and 3, front-facing leaf surfaces and margins). "Leaf faces have comparatively coarse mottling, shallow vein structure, and broad glossy streaks, and their wavy contours read like thin folded sheets. The target has finer reticulate veins, more distinct serrations and cupping, and beads that resolve individually at the rims."
8. R1 major (set-A-02.png, region 2, central stem and branch junctions). "The stem looks straighter and more cylindrical, with patchy bright hair clumps and conspicuous round marks. The target's stem and petioles taper more organically, and the hairs make a dense, fine, mostly backlit fringe."
9. R1 major (set-A-02.png, region 4, low field behind the plant). "Sparse blade-like tufts and sticks interrupt a dark, low-variation field; the target shows broad-leaf seedlings at several depths, with soft wet pinpoints that maintain a sense of rows and focus falloff."
10. R1 major (set-A-03.png, region 6 and the lower cloud opening). "The upper sky reads as a smooth blue-gray gradient with soft diffuse pale patches, while the lower opening is a broad near-white strip. The target has a more defined dark storm shelf, finer cloud texture, and a more localized, slightly warm opening behind the plant."
11. R1 major (set-A-01-b.png, plant and foreground lighting and grade). "Both frames are backlit, but in b the plant's faces receive flatter green fill and the cold blue-black foreground has few bright accents. In a the foliage is darker on the front, with selective warm-white rims and much stronger contrast from beads and wet-ground reflections."
12. R3 major (set-C-02.png, crop 1, top of the central stem). "the main stem terminates in a blunt, smooth, hairless cylindrical green stub with small leaves intersecting its sides instead of an apical bud"
13. R3 major (set-C-02.png, crop 2 and crop 4, lower pair of cotyledons on the stem). "both cotyledons look like smooth dark-green plastic paddles, with a single painted centerline on the left oval card and a thick grey-rimmed slab on the right intersecting directly into the cylindrical stem"
14. R3 major (set-C-02.png, crop 6, base of the stem where it meets the soil). "the cylindrical stem ends in an abrupt bright-rimmed cut against the dark soil with no contact shadow, root collar taper, or displaced mud"
15. R3 major (set-C-02.png, crop 1, crop 2, and crop 4, hairs along the stem, petioles, and leaf edges). "the hairs are thick, stiff, opaque bright-white cones clumped like frost spines, missing altogether on the top stem stub and changing across an abrupt horizontal boundary at the cotyledons"
16. R3 major (set-C-02.png, crop 1, crop 3, and crop 5, leaf margins and base of the middle-right leaf blade). "several leaf margins show paper-thin polygonal straight segments, and the base of the middle-right leaf blade twists into a dark, pinched self-intersecting mesh fold"
17. R3 major (set-C-02.png, crop 2, crop 4, and crop 6, water drops on the stem and leaves). "droplets on the vertical stem are cloudy, matte grey-green oval beads stuck symmetrically to the cylinder without clear refraction or runoff trails, while rain-pelted leaves remain mostly dry"
18. R3 major (set-C-01.png, water furrow at bottom left-center (and set-C-02.png crop 6 left)). "multiple repeated, rigid crown-splash meshes sit lined up along the narrow puddle with stiff glassy shading"
19. R3 major (set-C-03.png, crop 7 and crop 8, foreground grass clump and dark spiky ground plants (also set-C-02.png crop 6)). "grass blades are flat, knife-sharp ribbons in a single flat green with no veins, wetness, or contact shadow in the mud, beside jagged low-poly dark spiky plant meshes"
20. R3 major (set-C-03.png, crop 7 and crop 8, wet soil surface and foreground defocus (also set-C-02.png crop 6)). "rain splash spray across the mud appears as noisy, pixelated clusters of stippled dots, and out-of-focus foreground areas at the bottom of crop 7 show grainy blotches"
21. R3 major (set-C-03.png, crop 9, midground crop field and horizon skyline band). "repeated star-shaped grass tufts line the midground row, and a uniform pale-blue horizontal band separates the field from the dark ridge like a flat backdrop strip"
22. R4 major (set-D-01.png, the two cotyledons, f0273 (9.1 s) and f0305 (10.2 s)). "the seed leaves don't wilt, droop or yellow. They go see-through and ghostly while keeping their shape, so they fade out like a dissolve and don't age like real leaves"
23. R4 major (set-D-02.png, whole plant, all leaves, f0421–f0432). "in the stretch where growth should be fastest, the leaf shapes and angles are the same in all 12 frames. In set-D-03 the plant only slides sideways as one rigid block with the pan. Heavy rain is falling, but no leaf flutters, dips under a drop or moves on its own, so the plant reads as frozen"
24. R4 major (set-D-01.png, ground left of the stem, f0305 → f0338 (10.2–11.3 s), and f0436 → f0468 (14.5–15.6 s)). "the small round puddle becomes a long winding stream with new soil banks in about 1 s. The seed husk and the small sprout left of the stem disappear. Later the bare soil turns into a grass field. The terrain looks like it was swapped or morphed, not worn down over time"

Minor issues: R1 0, R3 0, R4 3; they are in the cards.

## What was measured against the critics' words

- The "jagged dark spiky plant meshes" at frame 420 were two black toothed splash cups on the near mound (found by the ground's agent, cured by the puddles' agent): a splash on mud is now a low ring, and crowns on water have 6 to 10 thin fingers (`e6a452a`).
- The "grainy blotches in the out-of-focus foreground at the bottom" are very likely a splash bead close to the lens, drawn out by the shutter and spread by the lens; a splash now shrinks to nothing as its landing comes within 0.30 to 0.15 m of the lens (`3e7aa7f`), which also took a white level rod out of frame 240.
- The level pale stripe between the field and the ridge was the far plain, not mist: a height set on it never reached its matrix and it stood 1.3 m up, 43 px above the horizon. It is set in the vertex shader now, and the near land follows the approved frame's line by bearing: the worst error of the land's top at 420 is 13 px over 17 columns where it was 46 px (`cfadc6e`).
- The rain and the sky: a dense curtain of thin dim streaks with tapered ends, a dark shelf of cloud with a small warm opening left of the stem (`2132c25`). The runnel's water gathers from 8.0 to 13.7 s instead of flooding the furrow in a few frames (`d29de07`).
- The motion critic reads the plant as still between its growth steps. The leaves alone take a gain of 2.5 on the wind in the rain; tracked by the puddles' agent on frames 400 to 428: a tip moves 1 to 9 px from where the steady wind had it and that offset changes by at most 1.5 px a frame.
- The leaves. Young blades are curved and hanging on the line (`90d11db`). By the builders' own stills of the line they are now the first thing wrong at 420: larger than the approved's, grey green, speckled and hanging where the approved's are lifted and clean. Open. The rain's M3 reads 0.924 at `review` on the line.

Nothing is declined.

## What happens to the open issues

The last fix pass ran from 21:34 to 23:25 UTC on the line `phase4/integrate`. Each owning agent had the critics' and jurors' words on its part, word for word, and an order ranked by severity (`out/work/briefs/round-012-016-notes/`). A piece went on the line only when its author's own still at `review` showed it right beside the approved image, with frames 1350, 1515 and 1559 of the finished bloom shown byte identical. For the rain that was: the streaks and the sky, the far land, the splashes and the runnel, the leaves' air, the collar of mud at the stem's foot. The unit's third and last round (`maxRoundsPerUnit` 3) is cut together with the other four open units' at 23:35 UTC from that line, if `npm run clock` then prints `extra rounds: yes`. What is still open after it goes under "Open items" in `kit/PROGRESS.md`.
