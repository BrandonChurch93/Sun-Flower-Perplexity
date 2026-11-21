# Round 12 · Phase 4 · `field` · extra round

Judged commit `921385e` (engine `6a3e309f0b524dd3`, unit hash `b11ff70827a3d146`). Judged frame 1755 (`field`, 58.5 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 GPT, R3 Gemini, R4 Claude. The jury was asked the judged frame, five jurors, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the votes on the control are round 7's, reused as the kit orders.

## Result

Not a pass. This was the second of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 12 to 16) | | | |
| M1, M2, M3 | pass (M3 1.134 at `final`, 0.8 needed) | | | |
| R1 match (GPT) | 5 | 2 | 3 | 0 |
| R2 jury | fails: 1 of 5 votes on the judged frame were (a), 4 of 5 on the control | | | |
| R3 surface and detail (Gemini) | 4 | 2 | 7 | 0 |
| R4 motion (Claude) | 4 | 2 | 2 | 2 |

Jury: four jurors called the judged frame (e), a real-time web 3D demo, with 92, 45, 85 and 78; one (a) with 78 ("the cinematic low-angle backlighting, with selective rim light separating the foreground sunflowers from the dark field"). What the four name: the copies ("it's thousands of copies of the same sunflower, all the same size and facing the same way", "The same sunflower models appear to repeat across the field"), the plants in front ("The two plants in front are simple and sparsely modeled, and the grass and sky look like a shader"), the leaves, rays and light ("Polygonal leaf edges, flat alpha-card petals, and screen-space god rays").

## Open issues, in the critics' words

1. R1 severe (set-A-03.png, Region 5, sun, clouds and air above the left field). "The white sun is larger and higher, with conspicuous evenly spaced rays across the sky and a fan of light over the field. In a, the sun is lower and veiled by broken clouds, and the warm haze spreads through the field in soft, irregular layers."
2. R1 severe (set-A-03.png, Regions 6 and 7, open field through the skyline). "The visible field has larger, more front-facing, saturated yellow heads and sharp olive foliage, then ends abruptly in a flat dark band and low clumps. The target has a denser receding layer of smaller, more varied rim-lit heads and broad, overlapping wooded ridges with haze between them."
3. R3 severe (set-C-03.png, crop 7 upper half, crop 8 left side, and crop 9 throughout (also across the field in set-C-01.png and set-C-02.png)). "all surrounding field sunflowers use simplified proxy geometry with single-tone flat-green heart-shaped card leaves, knife-sharp untoothed edges, no veins, and flat pitch-black disc centers, creating an abrupt detail jump directly behind the two hero plants"
4. R3 severe (set-C-01.png, upper-left sky and treeline around the sun (also crop 11 in set-C-03.png)). "alternating bright and dark radial streaks fan evenly across the clear upper sky like a 2D starburst filter sitting on top of the frame rather than light scattering inside ground mist"
5. R4 severe (set-D-01.png, hero sunflower and the tall left plant, f1560 to f1799). "there is no growth. Across 8 s the hero head is fully open from the first frame, and its petals, leaves and stem keep the same shape. The only change is that the camera pulls back and rises, so the unit reads as a crane shot over a mature plant, not a time-lapse"
6. R4 severe (set-D-02.png, all 12 tiles, f1647 to f1658). "in the stretch meant to change fastest, the plant does not change at all. Each step is an even 1 px framing drift (measured), with matching petal and leaf shapes. Nothing grows, and wind does not move any leaf on its own"
7. R1 major (set-A-02.png, Region 1, head of the central foreground sunflower). "The bloom is smaller and rounder, with shorter, more saturated and less distinctly layered petals. In a it fills more of the frame and has a darker, slightly oblique disk with long, thin petals glowing mainly along the left edge."
8. R1 major (set-A-02.png, Regions 2 and 3, central stalk and front-facing leaves). "The stalk reads as a straight bright stripe rather than a stem with individually resolved backlit hairs and branching petioles. The broad leaves make a heavier silhouette, with yellow-green patches and less readable vein, serration and curl detail than the darker target leaves."
9. R1 major (set-A-01-b.png, Foreground grass and soil around and to the right of the main plant). "The grass reads as a fairly uniform carpet with large ochre clumps and a conspicuously bright strip of exposed soil. In a, the verge is darker and more mottled, with smaller scattered grass glints and less exposed soil."
10. R3 major (set-C-03.png, crop 10, center and right skyline). "middle sections of the distant horizon silhouette have crisp, jagged staircase-aliased edges right next to heavily blurred treeline segments on the far right, with a dark horizontal blur halo behind them"
11. R3 major (set-C-03.png, crop 10, upper boundary of the sunflower field (also right half of set-C-01.png)). "the scattered sunflowers end along a straight horizontal line in the mid-distance, leaving a flat, featureless dark-brown strip before the skyline"
12. R3 major (set-C-03.png, crop 11, misty field directly below the sun, and out-of-focus sky in crops 10 and 11). "two straight horizontal seam lines cut across the glowing haze just above the distant flowers, and the out-of-focus sky and horizon show noticeable color grain"
13. R3 major (set-C-02.png, crops 3, 4, and 5, leaves on both foreground hero plants). "hero leaves have overly regular corrugated ribs with a waxy sheen on front surfaces, stiff polygonal edge teeth, and opaque dark shadow blocks with weak subsurface light transmission when backlit"
14. R3 major (set-C-02.png, crops 1, 3, and 6, both foreground hero stems from flower head to ground). "both hero stems are ruler-straight vertical cylinders rimmed by a uniform bright white band of backlit hairs, and the stems enter the soil abruptly without basal flare or clear contact shadow"
15. R3 major (set-C-02.png, crops 1, 2, 3, and 5, shadowed upper leaves of the left hero plant and dark flower center at lower left). "isolated bright yellow-white firefly specks pepper the dark shadowed hero leaves and form two symmetrical glowing eye-like dots inside the black disc of the lower-left neighbor sunflower"
16. R3 major (set-C-03.png, crop 7 foreground grass and set-C-02.png crop 6 sunlit dirt strip). "foreground grass is made of repetitive stiff V-shaped blade clumps, and the sunlit bare soil patch has a soft, blobby low-resolution displaced surface"
17. R4 major (set-D-01.png, camera speed, f1560 to f1799). "the pull-back is fast at the start (hero head goes from about 120 px to about 45 px wide by 54.9 s), then eases off hard. From f1756 to f1799 the framing barely changes, so the camera is close to stopping by the end of the segment"
18. R4 major (set-D-01.png, airborne motes over the field, f1582 to f1647 compared with f1690 onward). "a thick cloud of glowing particles fills the early frames, then thins out and is gone by about 56 s. It reads as an effect fading out, not as dust or pollen drifting out of frame"

Minor issues: R1 0, R3 0, R4 2; they are in the cards.

## What was measured against the critics' words

- The paired bright dots (R3 major: "isolated bright yellow-white firefly specks pepper the dark shadowed hero leaves and form two symmetrical glowing eye-like dots inside the black disc of the lower-left neighbor sunflower") are the pollen specks of the golden air close to the lens: the agent that owns the field rendered 1755 at `review` with them switched off, 4315 pixels differ, every paired dot is gone and nothing else moves. Each lens sample draws its own copy of a near speck, hence the pairs. The specks now thin from 55.0 to 58.0 s (`dd145bf`).
- The sun (R1 severe: "The white sun is larger and higher, with conspicuous evenly spaced rays across the sky and a fan of light over the field"). The fan is taken out of the lens (`93f69e8`), and from 52.0 to 55.0 s the sun loses its close glow and the disc's spill (`3ce57f9`): the pixels with blue 235 or more round the sun at 1755 fall from 4345 to 602, the approved image has 5. The sun is not moved: it is the bloom's sun, and lowering it by the 35 px the approved asks is left to Phase 5.
- The motion (R4 severe: "there is no growth. Across 8 s the hero head is fully open from the first frame, and its petals, leaves and stem keep the same shape"). From 53.55 s of a plant's own clock every ray draws out longer by 14 to 23 % and narrower by 10 to 42 %, each on its own start and pace (`7f31715`); after 52.0 s the plant's upper leaves fill out first; the leaves alone take a gain of 2.5 on the wind, eased in from 52.0 to 54.0 s. Tracked by the field's agent between frames 1640 and 1660: a leaf tip moves at most 3 px a frame, a slow lean and no flutter.
- The far edge of the field (the straight line and the flat dark strip under the hills) has its cause found and is not cured: four fixed strips of near land in the golden world (a bank at 75 m, the foot of the row at 77 m, 2.85 m high all round, tree rows at 79 and 84 m) stand in front of any row planted past 66 m. It goes to the open items with the tested patch for the rows past 66 m.
- The size of the heads: the open head measures about 200 px across at 1755 where the approved image shows about 300. `plant.headDiameterM` is a fixed fact of the kit, so only Brandon settles it; nothing was changed.

Nothing is declined.

## What happens to the open issues

The last fix pass ran from 21:34 to 23:25 UTC on the line `phase4/integrate`. Each owning agent had the critics' and jurors' words on its part, word for word, and an order ranked by severity (`out/work/briefs/round-012-016-notes/`). A piece went on the line only when its author's own still at `review` showed it right beside the approved image, with frames 1350, 1515 and 1559 of the finished bloom shown byte identical. For the field that was: the sun without its fan and with a small core, the specks that thin, rays and leaves that keep changing after 52.0 s, and the camera's end of the pull back. The unit's third and last round (`maxRoundsPerUnit` 3) is cut together with the other four open units' at 23:35 UTC from that line, if `npm run clock` then prints `extra rounds: yes`. What is still open after it goes under "Open items" in `kit/PROGRESS.md`.
