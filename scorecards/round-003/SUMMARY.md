# Round 3 · Phase 3 · `bloom` · floor round

Judged commit `3e10245` (the packs were built on `9a15c97`, which changed no pixel). Judged frames 1350 (`bloom-opening`, 45.0 s) and 1515 (`bloom-hero`, 50.5 s), both at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` (the Builder's tally is `R2.json`). `KEY.json` was copied in after the last answer.

## Result

Not a pass. The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 12 of 13 green, G3 red (frame 1515 differs in 2 pixels by 1 step between two renders at `review`) | | | |
| M1, M2 | pass on both frames | | | |
| M3 | fails at 1350 (sharpness ratio 0.659 of 0.8), passes at 1515 (0.881) | | | |
| R1 match (GPT) | 5 | 6 | 10 | 0 |
| R2 jury | passes: 7 of 10 votes on the judged frames were (a), 6 of 10 on the controls; needed at least 0.6 minus 0.2 | | | |
| R3 surface and detail (Gemini) | 4 | 1 | 6 | 1 |
| R4 motion (Claude) | 4 | 1 | 3 | 2 |

Jury by image, in the order GPT, Gemini, Claude, GLM, Grok: approved hero a a d a b, approved opening a a d a b, frame 1350 a e d a a, frame 1515 a a a a d. The controls' votes are kept for the unit's later rounds.

## Top issues

1. The head at 45 s (R1 severe, R3 severe and major, R4 major, two jurors). It sits lower and further left than the approved bud, reads as a folded fan seen from the side, its shut rays are flat ribbons that cut through each other, its bracts are smooth dark shells, and through 42.7 to 43.0 s the rays lie across the disc and redraw from frame to frame.
2. The sun (R1 severe twice, R3 major). Thin straight star spikes and a lemon core where the approved has a broad soft bloom and amber shafts; at 50.5 s the light pinches to a small star at the leaf's edge.
3. The near neighbor at the left edge (R1 severe twice). Large blurred dark shapes where the approved has a pointed leaf reaching over the sun and a layered sweep of smaller lit leaves.
4. The field behind the flower (R1 severe at 50.5 s, major at 45 s; R4 minor). Many small sharp yellow rings of one size and brightness in a band; at 45 s a flat olive texture with yellow points. Every head in the field opens in step with the hero.
5. Bracts showing through the front rays at 50.5 s as hard dark triangles (R3 major, one juror).
6. The stem (R1 major twice, R3 major). A ribbed column with two bright rails and too little fringe, narrower than the approved; the leaf stalk plugs into it without a node.
7. The hero's leaves (R1 major twice, R3 major). They hang lower and darker or stand edge on; thin lit edges break into steps and bright dots.
8. Ridge and sky (R1 major four times, R3 major). The ridge rides higher as a flat dark cutout with a scalloped line; the cloud shelf has separate dark lobes over a pale gap; motes are too large and sit over dark things.
9. The open head at 50.5 s (R1 major). Reads more frontal and splayed; the rays on the far side should still fold over the disc; rays too pale and yellow on the left.
10. The cut at 40.00 s (R4 severe and two majors). The critic reads a different plant, a horizon step and a change of camera speed. Measured, the plant and the camera are continuous (see the decision of 10:35 UTC in `kit/PROGRESS.md`); what differs is how the two worlds show them. Not declined. Open with two owners: this unit's first frames, and the `frost` unit in Phase 4.

## What changes next

The fix pass runs for at most 90 minutes from the end of this round. Already merged for round 4 before the last answer came in: the growth change for 45 s, the lens without star spikes, the leaves' thick stalks, the bud's bracts wrapped over the shut rays, the shut rays as ridged straps, the skin without its bright outline, the field's larger and more varied heads, the golden world's lower tree line. Next, in this order:

1. Growth, by the Builder: the head more upright at 45 s so that it stands higher and nearer the stem; rays that open over about three seconds each, so the first are half lifted and narrow at 45 s and the last still fold over the disc at 50.5 s; rays fully grown inside the bud before it opens, so nothing sweeps over the disc.
2. Bud and petals: more and smaller bracts with a taller crown and lit margins, no bract through a ray, the half lifted ray as a narrow pleated strap with a hooked tip, no bare wedge of disc.
3. The near neighbor moved to the hero's depth and fitted to the approved silhouettes at both keys.
4. Hairs with the limit that counts cover (the fringe on both outlines), the stem wider, a node where a stalk leaves it.
5. Lens pass 5 (shafts with a floor, grain by tone), the field's band and softness, the ridge line and the cloud shelf.
6. The determinism hunt goes on until G3 is green; M3 at 1350 is measured again once the head and the fringe are in.
