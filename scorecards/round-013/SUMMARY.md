# Round 13 · Phase 4 · `frost` · extra round

Judged commit `921385e` (engine `6a3e309f0b524dd3`, unit hash `c907d8f7394a61b3`). Judged frame 1080 (`frost`, 36.0 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Gemini, R3 Claude, R4 GPT. The jury was asked the judged frame, five jurors, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the votes on the control are round 8's, reused as the kit orders.

## Result

Not a pass. This was the second of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 12 to 16) | | | |
| M1, M2, M3 | pass (M3 1.020 at `final`, 0.8 needed) | | | |
| R1 match (Gemini) | 4 | 4 | 3 | 1 |
| R2 jury | passes: 2 of 5 votes on the judged frame were (a), 2 of 5 on the control | | | |
| R3 surface and detail (Claude) | 6 | 0 | 3 | 2 |
| R4 motion (GPT) | 8 | 0 | 1 | 1 |

Jury: two jurors called the judged frame (a) with 72 and 55 ("The fog-filtered sunrise creates a deliberately cinematic depth separation around the foreground bud", "the fine backlit hairs along the stems and leaf edges, the volumetric fog with depth falloff, and the hazy sun all look like an offline, film-grade render"), two (e) with 82 and 76 ("faceted leaf silhouettes, simple tubular stem/petiole meshes, and instanced low-poly background stalks", "The repeated, nearly identical plant silhouettes in the background look like instanced 3D assets"), one (b) with 74.

## Open issues, in the critics' words

1. R1 severe (set-A-01-b.png, hero plant leaf arrangement and silhouette). "two tiny flat horizontal stub leaves sit beneath the bud above a bare straight stem gap, the larger leaves have deeply notched ragged cutouts, and the lower stem at the bottom edge is bare instead of having full arching ovate leaves framing the bud and filling the lower stem"
2. R1 severe (set-A-02.png, region 3 · a leaf seen from the front and hero leaf surfaces). "the leaves have flat dark matte-green tops with a harsh white cutout border, lacking powdery bluish-white surface frost, frosted venation, tip droplets, and warm backlit green translucency on the sun-facing side"
3. R1 severe (set-A-02.png, region 2 · the stem and its hairs). "the stem and petioles are rigid smooth-edged cylinders with faint surface speckles and no rim glow, missing the natural stem curve and dense protruding hairs and frost needles catching bright sunlight"
4. R1 severe (set-A-03.png, region 6 · the far background at the skyline). "the background plants are spindly thin stalks topped with tiny flat dark blobs, clustered too high on the right and too sparse and small on the left in a slightly purplish-grey haze, instead of recognizable mid- and far-ground sunflower buds and drooping leaves"
5. R1 major (set-A-02.png, region 1 · the head or bud). "the bud is flatter and uniformly dark green with crushed inner shadows, needle-thin dark bract tips, a flared stem pedestal, and almost no frost or warm sun rim on the right side"
6. R1 major (set-A-03.png, region 5 · the field behind the plant). "the mid-ground field is a murky, desaturated olive-grey mix of flat dark leaf cutouts with weak contrast, missing dense heart-shaped leaves, deep cool teal-black shadow pockets, silvery-blue frosted leaf-top highlights, and creamy lens bokeh"
7. R1 major (set-A-02.png, region 4 · the sun and the sky round it). "the sun glow and surrounding sky form a smooth, grainless synthetic wash of pale peach that spreads too broadly and flatly, lacking fine film grain and subtle misty cloud mottling"
8. R3 major (set-C-02.png, crop 4, the backlit leaves on the right of the stem). "the sun is behind the leaves, but the blades stay an opaque, even dark green. No light comes through the thin tissue and the veins do not glow, so they look like painted cards"
9. R3 major (set-C-02.png, crops 2, 4 and 5, the edges of every leaf). "the frost and hair fringe is a white band of the same width that follows every serration on every leaf. It reads as a rim-light or outline effect, not frost crystals or hairs"
10. R3 major (set-C-02.png, crops 3 to 5, the leaf faces). "each leaf is one flat green with white specks spread evenly across it. There is no change in tone across the blade and no visible thickness at the edges, so the leaves look waxy and card-flat"
11. R4 major (set-D-04.png, f0899 to f0900, lower-right leaf beside the stem). "The stem and distant ridge mostly register, but the lower-right leaf changes silhouette at the cut: its narrow, downturned outer edge becomes broader and more scalloped in the first frost frame."

Minor issues: R1 1, R3 2, R4 1; they are in the cards.

## What was measured against the critics' words

- The bud. In the frost the shut bud's outer bracts curl up as claws with a fuller rime line (`1450dee`), then the bud is rounder with no needle tips and a wider band of rime on the lips (`f2f5855`); the frost's M3 read 1.052 at `review` with it. Still wrong by its agent's own list at 1080: the lights sit low with no warm rim on the right, the lighter olive inner bracts do not show, the bracts are more and smaller than the approved's, the points are straight.
- The world. The sun's halo is tighter and amber and shaped by the drifting fog, the near fog sheets are thinner so the rows keep their darks (`a5484c4`), the halo keeps a faint peach skirt (`ab73383`), a first fog sheet stands between the plant and the first row and is gone by 39 s (`577063f`). Measured on the line's head `43a42f6` at `review` by the frost world's agent: the sky boxes lie within 2 levels of the approved's, the near rows' darks are still 12 to 15 levels lighter than the approved's on both sides.
- The bare stem under the bud (the match critic names it where the approved shows the youngest leaves crowded round the bud). The joints of the leaves near the tip ride close under it from 20 to 40 s (`9880078`, with a test); the two youngest leaves now stand right under the bud, the approved's crown of four is still fuller.
- The far plain keeps its height. The dead call that leaves it 1.3 m up was found in the rain world's pass; taking the fix in the frost alone would step the horizon 14 px at the cut at 30.0 s, and no critic of rounds 8, 11, 13 or 16 names a stripe there.
- On the line's head `43a42f6` the frost's measures at `review` are green (M3 1.086), with a smaller sharp zone than before (123069 sharp pixels against 201744) because the plant's leaves are narrower. By the builders' own stills the leaves at 1080 are thin with little white on them against the approved's broad rimed ones: open.

Nothing is declined.

## What happens to the open issues

The last fix pass ran from 21:34 to 23:25 UTC on the line `phase4/integrate`. Each owning agent had the critics' and jurors' words on its part, word for word, and an order ranked by severity (`out/work/briefs/round-012-016-notes/`). A piece went on the line only when its author's own still at `review` showed it right beside the approved image, with frames 1350, 1515 and 1559 of the finished bloom shown byte identical. For the frost that was: the bud, the halo and the fog, the leaves under the bud, the skin's frozen dew. The unit's third and last round (`maxRoundsPerUnit` 3) is cut together with the other four open units' at 23:35 UTC from that line, if `npm run clock` then prints `extra rounds: yes`. What is still open after it goes under "Open items" in `kit/PROGRESS.md`.
