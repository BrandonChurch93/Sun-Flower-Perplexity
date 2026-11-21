# Round 4 · Phase 3 · `bloom` · extra round

Judged commit `e099145` (engine `255dacf4303c4105`). Judged frames 1350 (`bloom-opening`, 45.0 s) and 1515 (`bloom-hero`, 50.5 s), both at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json` (which file was which) went into the folder after the last answer.

The families rotated against round 3: R1 Gemini, R3 Claude, R4 GPT. The jury's controls were not asked again: the approved pair's 6 of 10 votes from round 3 stand for the unit.

## Result

Not a pass. The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (G3, red in round 3, is green) | | | |
| M1, M2 | pass on both frames | | | |
| M3 | fails at 1350 (sharpness ratio 0.722 of 0.8), passes at 1515 (0.849) | | | |
| R1 match (Gemini) | 4 | 4 | 5 | 0 |
| R2 jury | passes at the edge of the allowed gap: 4 of 10 votes on the judged frames were (a), 6 of 10 on the controls; needed at least 0.6 minus 0.2 | | | |
| R3 surface and detail (Claude) | 5 | 0 | 5 | 3 |
| R4 motion (GPT) | 6 | 2 | 1 | 0 |

Jury by image, in the order GPT, Gemini, Claude, GLM, Grok: frame 1515 e e a a b, frame 1350 a e a e b. In round 3 the same two frames had 7 of 10 (a). Four jurors chose (e), a real-time web 3D demo, and named why: polygon outlines on the foreground leaves (three), rim hairs of one length and spacing (three), ribbon like petals (two), copies of one flower in the field (three). Three jurors named the same rim hairs as what makes the frame read as film.

Against round 3: R1 5 to 4 (another family; 6 severe and 10 major then, 4 severe and 5 major now), R3 4 to 5, R4 4 to 6, the jury 7 to 4 of 10, M3 at 1350 0.659 to 0.722, G3 red to green.

## Top issues

1. The bud at 45 s (R1 severe, R3 major three times, R4 major, two jurors). The near rim of the disc lies bare as a dark ring; the shut rays are stiff straps of one width and spacing; too few bracts; a pixel checker and vertical streaks on the bract faces; lit hairs float beside the bract edges with a gap; from 44.37 to 44.73 s narrow green and yellow strips pass through each other. Second round for the head at 45 s.
2. The open head at 50.5 s (R1 severe). It reads front on: rays lie flat all round where the approved's right side rays still point at the lens with the bract cup behind them; even orange stripes on the rays (also R3 minor); the disc flat and dark. Second round.
3. The sun (R1 severe). A wide featureless wash without shafts or motes; at 50.5 s the neighbor's leaf stands too high to cover it. Second round. The judged tree did not yet hold the lens's eighth pass or the neighbor's new fit.
4. The field (R1 severe, R3 minor, three jurors). Low and sparse, heads as flat orange rings of one facing under a smooth blur; fine vertical striping and noise in the lifted shadows. Second round.
5. The near neighbor at the left edge (R1 major, R3 major and minor, three jurors). Sparse cut out leaves with polygon outlines, a straight even stalk with a bright line on it, one flat green, the upper leaf in two different places at the two keys. Second round.
6. The hairs (R1 major, R3 major, three jurors). An even comb of bright dashes round every edge, coarse tufts on the stem, no continuous lit line on its shaded edge. Second round.
7. The hero's leaves (R1 major). Attached lower than in the approved, no olive gold light through them, thorny margins, a blotchy brown patch on the right leaf. Second round.
8. Skyline and sky (R1 major twice). A ruled dark band with a parallel stripe under it; a smooth sky without grain, flat cloud, no shafts on the upper left; shadows in the foliage muddy olive brown. Second round.
9. The opening as motion (R4 severe). A block of shut rays stays over the right of the disc while the left opens, then peels off sector by sector.
10. The cut at 40.00 s (R4 severe). The bud and stem hold, the horizon steps up and the field's silhouettes lose their registration. Second round; measured, the plant and the camera are continuous, so what steps is how the two worlds draw the far edge.

## What was measured against the critics' words

- R1 asks to turn the head three quarters left at 50.5 s. Measured at native size, the facing matches: the disc is an ellipse 0.84 as wide as tall in the approved and 0.87 in ours, and the head's axis stands 33.5 degrees left of the view line. What differs is what the critic describes next: in the approved the right side rays are still cupped forward and the bracts spread behind them. The issue stands; the fix goes into the rays' schedule and the bracts, not the facing.
- R1 asks to slim the stem. Measured, both stems are 62 to 64 px wide at 1920. The approved stem is a dark silhouette with a thin lit line on each outline; ours has a lit face, which reads wider. The issue stands; the fix is the tone of the face and the lit line, not the width.
- The jury's two (b) votes (a stock photograph) count as not (a), like any other letter.

Nothing is declined.

## What changes next

Every issue marked second round has survived `quality.plateauRounds` rounds, so by the ladder in `kit/04-LOOK.md` section 9 its technique changes; the rungs are logged under "Decisions" in `kit/PROGRESS.md`.

1. The rays' opening gets its own owner (`opening_builder`, `src/plant/growth.ts`, only `rayOpen` and `rayAngle`): 45.0 s unchanged; beyond 95 degrees from the first rays the starts come sooner, each ray takes longer and has its own offset, so no block waits; a ray that has just opened stays cupped forward and flattens over the next seconds, so at 50.5 s the right side rays point at the lens and the bract cup shows.
2. Bud: the near lower bracts stay up over the ray feet until about 46 s, broad dark overlapping bracts, a taller crown, the checker found and removed, the bract surface from maps made from the approved image if the drawn one keeps streaking. Petals: a dome that is low at the lens side shoulder and high in the middle, each shut ray pleated into slender ridges of its own length and twist, veins as relief.
3. Hairs: a dense short velvet as one soft lit line on both outlines, over it fewer, finer, uneven long hairs rooted at the skin; fuzz on bract and leaf margins. Stem: a dark face.
4. Leaves and the neighbor: smooth uneven outlines on large leaves, curved tapered stalks, the neighbor's leaves fitted again to the approved's places and tones.
5. Field: ends about 66 m out on a straight edge, a closed dark leafy crop with deep gaps and separate lit things, heads of different facing, nod and size. Golden: a row of trees of uneven height behind the field edge, cloud texture, motes, the skyline kept in one module the frost world can draw. Lens: out of focus highlights as discs, grain like the approved's without a pattern, what is added to black found and taken down.
6. M3 at 1350: `skin_builder` maps where detail is lost against the approved at the `review` tier.
7. The cut at 40.00 s stays open with two owners: the golden world's skyline module now, the `frost` unit in Phase 4.
