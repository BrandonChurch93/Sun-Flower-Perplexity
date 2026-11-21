# Round 5 · Phase 3 · `bloom` · extra round

Judged commit `11207fd` (engine `9abe7932d26f097e`). Judged frames 1350 (`bloom-opening`, 45.0 s) and 1515 (`bloom-hero`, 50.5 s), both at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json` says which file was which.

A slip, written down as it happened: `KEY.json` was pushed at 14:16 UTC in `ff80076`, before the motion critic R4 had answered (14:27 UTC). The kit says the key goes in after the last answer. R4 is a fresh agent on its own machine that got four attachments and its rubric and nothing else, it was never given the repository or the film's name, and its part of the key lists only which of our own frames stand on each sheet. R1, R3 and every juror had answered before the push. The helper that writes the jury's card now copies the key only when all three critics' cards exist.

The families rotated against rounds 3 and 4: R1 Claude, R3 GPT, R4 Gemini. The jury's controls were not asked again: the approved pair's 6 of 10 votes from round 3 stand for the unit.

## Result

Not a pass. The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green | | | |
| M1, M2 | pass on both frames | | | |
| M3 | fails at both: 0.672 at 1350 and 0.786 at 1515 (0.8 needed) | | | |
| R1 match (Claude) | 4 | 3 | 5 | 1 |
| R2 jury | passes: 7 of 10 votes on the judged frames were (a), 6 of 10 on the controls | | | |
| R3 surface and detail (GPT) | 7 | 0 | 4 | 0 |
| R4 motion (Gemini) | 5 | 2 | 1 | 0 |

Jury: frame 1350 four of five (a), one (e); frame 1515 three of five (a), two (d). Four of the seven (a) votes gave the lit hairs on the stem as their reason. Both (d) votes named the middle of the disc ("a swirling vortex of fibrous green AI-diffusion strands instead of discrete florets", "a painted vortex rather than real florets"). The (e) vote named the straight pieces of the right leaf's stalk, faceted leaf outlines, the ribbon rays across the bud and the radial shafts.

Against round 4: R1 4 to 4 (another family; 4 severe and 5 major then, 3 severe and 5 major now), R3 5 to 7, R4 6 to 5, the jury 4 to 7 of 10, M3 at `final` 0.722 to 0.672 at 1350 and 0.849 to 0.786 at 1515. The fall in M3 is real and was traced before round 6: the round 5 tree softened the bud's and the leaves' faces, and the approved's window grew richer when the companion's leaves left the sharp zone.

## Top issues

1. The leaves (R1 severe). They glow a flat yellow green over the whole face where the approved's are dark blue green near silhouettes with a thin lit rim and a few patches of light through them.
2. The sun (R1 severe, R3 major, one juror). A small hard white point with a crisp star and ruled spokes across the upper left sky that run on below the horizon, where the approved has a large soft warm bloom in golden haze with faint broad rays. Third round for the sun.
3. The field (R1 severe, R3 major). Too sharp: heads crisply readable, stems in straight rows, stalks and rings that look interchangeable, no glowing out of focus highlights, no motes, no warm haze; it ends at one nearly solid dark band. Third round.
4. The cut at 40.00 s (R4 severe). "The horizon jumps upward by about 34 native pixels as isolated frost-scene trees are replaced by a higher continuous dark ridge, and the background stalks in the field snap to different positions and spacing." Third round.
5. The camera from 45.4 s to 52.0 s (R4 severe). It "stops and reverses direction around 45.4-46.5 s, nearly stalls from 48.7 s to 50.9 s, and then abruptly pulls back and tilts down".
6. Single frame jumps of the far skyline (R4 major). "The distant horizon and sky jump upward by about 3 to 5 native pixels on f1333 and snap back down on f1334."
7. Grade and blacks (R1 major). Lifted greener shadows, flatter contrast, no grain, detail in the lower field that the approved lets go to black.
8. The skyline (R1 major). A hard flat dark tree line with almost no glow of air in front of it.
9. The plant's build (R1 major). A thicker straighter stem; a large flat leaf far out right, a leaf close under the head and a cupped leaf at the bottom where the approved has a drooping curled leaf upper right and a spreading leaf lower left.
10. The bud at 45 s (R1 major, the (e) juror). Turned more to the lens with yellow showing, fewer and shorter bracts on top, a weaker spiky crown. Third round for the bud.
11. The open head at 50.5 s (R1 major, R3 major twice, two jurors). Saturated orange rays with a sharp sheen and evenly spaced grooves like molded ribbons; at 3 o'clock the ray feet cut an angular notch into the disc; the middle of the disc reads as painted strands.

## What was measured against the critics' words

- R4's single frame jumps are real: on the pack's own frames the far skyline reads 464.9, 462.4, 465.0 px at frames 1332 to 1334 and 463.7, 464.8, 463.3 at 1339 to 1341. The cause is not the camera, whose direction is a smooth function of time. The eight lens samples of a `review` frame leaned to one side of the opening, a different way each frame (weighted middle at -0.070, 0.161, -0.106 of the opening's radius in height at frames 1332 to 1334), and everything out of focus moves with that lean, about 10 px per unit here. At `final`, with 48 samples, the lean is under 0.02.
- R4's reversal is real: between the two fitted keys, which share one view of the far background, each camera channel ran on its own curve, so the far background drifted 11.5 px right by 46.5 s and came back by 50 s, and the horizon sank 7.6 px by 48.5 s and rose again.
- R4's cut: `field_builder` checked that the neighbors stand at the same places with the same parts at frames 1199 and 1200 (nothing in `src/field/` reads the world; the three nearest stalks right of the plant sit at the same x in both frames). What differs is what the frost stand-in's fog lets through and how it ends the land: a bare horizon with single trees, where golden has the shared skyline about 34 px higher.
- R1 asks for a slimmer stem. Measured in round 4, both stems are 62 to 64 px wide at 1920; the approved's is a dark silhouette with thin lit lines. The issue stands as tone, not width.

Nothing is declined.

## What changes next

Round 6 is the last round the look lock allows. Issues that have survived `quality.plateauRounds` rounds change technique by the ladder in `kit/04-LOOK.md` section 9; the rungs are logged under "Decisions" in `kit/PROGRESS.md`.

1. Leaves (`agent/leaves` `38a3fe6`): the detail map at its true size, cooler darker faces, light through only in thin patches, 54000 hairs, the right leaf hangs; the upper leaf's node moves up to the approved's place at 45 s.
2. Sun and sky (`agent/post` `30bfd36`, `agent/golden` `1882795`): a wider white core and warm halo, the lens's thin rays turned down, three broad broken shafts instead of ruled spokes, a deeper toe, motes in the air, banks of shaded evening air over the far field, a bluer softer skyline.
3. Bud and rays (`agent/bud` `ea8fb07`, `agent/petals` `31a7534`): 63 broad pointed bracts with a lit crown, a cap of broad folded straps instead of the comb, uneven veins as ribs, cupped rays that stand on the rim.
4. Disc (`agent/disc` `26ea309`): the whole disc as separate buds on the spiral, no strands; the rays as a light for the ring.
5. Field, stem, hairs, skin, companion (`agent/field` `0a57b22`, `aa2d32c`, `fd9af39`, `agent/surface-b` `065a651`, `agent/companion` `710b364`).
6. The camera: seven keys between 45 s and 50.5 s hold the view of the far background while the camera pulls back; the key at 52 s takes 0.6 of its step so the crane starts more gently. The two fitted keys are unchanged.
7. The lens samples of every frame are centered, so nothing out of focus shifts from frame to frame.
8. The cut at 40.00 s: the ladder's first rung, the test for a cut. The frost world is asked to draw the shared skyline through its fog at the same height; it goes into round 6 only if it is tested in time, and leads the `frost` unit in Phase 4 otherwise.
