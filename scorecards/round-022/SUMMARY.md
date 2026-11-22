# Round 22 · Phase 5 · the whole film · floor round

Judged commit `4676c5d` (engine `305e9520118781cf`); the pack was built with `main` at `4cb7706`, which differs from it only in `kit/PROGRESS.md`. The pack: the ten judged frames and the six frames of the hook at the `final` tier in 16x9, the three whole film sheets and the four cut sheets at the `review` tier in the preview format, and the four stress pairs. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R5.json`, `R6.json`, `R7.json`, `R4.json`, `R2.json` with `R2-JURORS.md`; the manifests, the key and the measures are beside them.

Families: R5 Claude, R6 Grok, R7 Gemini, R4 GPT. The jury: ten images, five jurors each, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the controls' votes are those of the unit rounds.

## Result

Not a pass. This was the one whole film round the clock allowed, a floor round. The bar is 9 from each of R5, R6 and R7 with no severe or major issue open, R2 passing on every judged frame, R4 at 9 on the cuts, the machine checks and the measures green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | all 13 green (01:54 to 02:20 UTC) | | | |
| M1, M2, M3 | green for the six units (02:21 to 02:27 UTC) | | | |
| R5 the whole film (Claude) | 7 | 0 | 4 | 3 |
| R6 scroll stop (Grok) | 6 | 1 | 1 | 0 |
| R7 compression (Gemini) | 6 | 0 | 4 | 2 |
| R4 motion, on the cuts (GPT) | 8 | 0 | 1 | 0 |
| R2 jury | FAIL: 29 of 50 votes for (a) against the controls' 24 of 40; failing frames 420, 780, 1755 | | | |

Jury, by frame: 0 4 of 5 against 5 of 10; 45 4 of 5 against 5 of 10; 60 4 of 5 against 5 of 10; 195 2 of 5 against 5 of 10; 420 1 of 5 against 3 of 5 (fails); 780 2 of 5 against 4 of 5 (fails); 1080 4 of 5 against 2 of 5; 1350 4 of 5 against 6 of 10; 1515 3 of 5 against 6 of 10; 1755 1 of 5 against 4 of 5 (fails).

## Open issues, in the critics' words

1. R6 severe (set-F-01.png, full frame, foreground soil). "With the sound off and no caption, the first frame is a dark field and a bright sun. Nothing says a seed is about to sprout, so it would not stop a scroll."
2. R5 major (set-E-03.png, f1593 to f1799 (field), foreground plants). "When the camera pulls back, a second sunflower stalk comes in at left (f1593), and by f1645 to f1799 two similar plants stand together. The left one is as tall as or taller than the hero, and both heads shrink to small discs, so the viewer loses track of which plant is the one we followed. That weakens the ending."
3. R5 major (set-E-05.png, 58.5 s frame, hero plant). "The hero's stalk looks thinner and its head much smaller than at 50.5 s. Some of that comes from the wider framing, but it also lacks the heavy stem and big leaves it had at the bloom, so it reads as a different, younger plant."
4. R5 major (set-E-02.png, f0617 to f0874 (night), background). "Rain ends on bare soil with small sprouts, but night cuts to a dense field of near-mature plants as tall as the hero. The surrounding field jumps ahead of the hero, so it no longer feels like the same place growing with it."
5. R5 major (set-E-02.png, f0617 vs f0668 vs f0771, lower leaves of the hero). "Within the night world the hero's lower leaves change size and arrangement from frame to frame: big leaves at lower left in f0617, one large leaf at centre-left in f0668, a different layout in f0771. The plant seems to re-form rather than grow."
6. R6 major (set-F-02.png, lower center of the soil mound). "The first change is a small pale bump. At this size it is easy to miss against the sun, so the first quarter-second still does not read as germination."
7. R7 major (set-G-04.png, Place 1, Place 2, and Place 3, diagonal rain streaks across the sky, plant, and far ground). "crisp 1-2 px rain streaks break into stepped, blotchy, noisy fragments with mosquito ringing around brighter streaks, while thinner streaks vanish into blurry smudges"
8. R7 major (set-G-08.png, Place 2, central sunflower disk florets, shadowed green leaves, and stem hairs). "the spiral florets in the dark brown flower center smear into a nearly featureless muddy patch, shadowed crumpled leaves turn waxy and blotchy with lost venation, and fine stem and bract hairs soften into mush"
9. R7 major (set-G-04.png, Place 2, upper leaf surfaces, leaf margins, and wet stem round the growing tip). "bitrate starvation from full-frame rain smears dark leaf venation into soft blotches, blurs away small water droplets on the stalk, and clumps fine backlit hairs along the leaf edges and petiole"
10. R7 major (set-G-08.png, Place 1 and Place 3, airborne motes above the sun glow and distant sunflowers in the far field). "most of the small backlit airborne specks in the sky above the sun vanish or smear into faint smudges, and dense distant sunflowers and stems in the golden haze clump into soft blotchy mush"
11. R4 major (set-D-05.png, set-D-06.png, set-D-07.png, Review pack: fastest growth intervals, including early emergence and petal release around 44.5–48.0 s). "The growth sheets sample roughly every 1.7 s, and all four consecutive-frame sheets are centered on world cuts. None shows the fastest growth at frame cadence, so the apparent unfolding cannot be checked for pops, intersections, or brief stalls."

Minor issues: R5 3, R6 0, R7 2, R4 0; they are in the cards.

## The fix pass

Opened 02:34 UTC with 90 minutes at most (`quality.floorFixMinutes`). Each change was read, its pictures were looked at by the Builder, and it was merged only where the picture was better; a number was never bought with a worse picture. Merged, in the order they came in:

- `adaf813` the night's far land is one land from its first frame to its last.
- `3b11fdb` the shut rays stand in two clear layers once the face shows, and open rays flutter in the field's livelier air.
- `f9c85b1` golden air: the sun no longer sinks in view, the coarse specks keep low over the horizon and are a third as many.
- `08b2907` half again as many spans along the margin of the plant's blades and the neighbour's upper blades.
- `5772154` far hairs are soft even strokes in the wide shot.
- `e7ccd80` rain streaks under the encoder: no strip finer than two pixels, a soft edge, fewer of the finest drops, gusts lean the rain in sheets.
- `5681c16` dawn's own blades and heave stay in the dawn.
- `0a974b6` the rise past the field's last rows stands for the whole of the last world, from its first frame, so no land grows in view.
- `04a9059` the shadow map's grid moves by part of a texel per sample: the stepped dark line along the nearest night blade is all but gone.
- `e0c44a6` the husk slides clear, tumbles down over twelve frames and rocks once, instead of a pop in two frames.

## What stays open

- frames 0 to 15 (the first half second at phone size), the dark ground and the first sign of the seed.
- frames 1593 to 1799, two plants standing together at the end (CONTESTED).
- frame 1755 (58.5 s) against frame 1515 (50.5 s), the hero reads as a thinner, younger plant in the wide shot.
- frames 600 to 874 (the night), the rows behind the hero stand as tall as it early in the night.
- frames 617, 668 and 771, the hero's lower leaves change their layout inside the night.
- frame 419 under the encoder (the rain), rain streaks, leaf veins, drops and hairs under the 5 Mbit/s encode.
- frame 1679 under the encoder (the field at 55.97 s), the hero's disc florets, shadowed leaves and fine hairs smear.
- frame 1679 under the encoder (the field at 55.97 s), airborne specks above the sun and the far rows in the haze smear.
- frames 3 to 14, 102 to 125, 1338 to 1421, the review pack did not show the fastest growth at frame cadence.
- frame 420, the realism jury failed the rain frame, 1 of 5 against 3 of 5 for the controls.
- frame 780, the realism jury failed the night frame, 2 of 5 against 4 of 5 for the controls.
- frame 1755, the realism jury failed the field frame, 1 of 5 against 4 of 5 for the controls.

## What happens next

The whole film loop ends here at its limit (one floor round and one fix pass, `quality.floorFixMinutes`), not at a pass: no critic was at the bar and the jury failed three of ten frames. The build that is kept is `41ab097`, the judged build plus the ten fixes of the pass, kept only while the machine checks and the six measures stay green on it; both run on it again and their results are logged under "Running jobs" in `kit/PROGRESS.md`. Every severe and major issue that is not cured stands under "Open items" there. Next: the preview film of the kept build, the comparison images, the review page, the Phase 5 gate, then Phase 6, where the record round judges the frozen build once and is not followed by fixes.
