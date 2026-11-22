# Round 6 · Phase 3 · `bloom` · extra round, the last of the look lock

Judged commit `cd262c1` (engine `5ac2814e4342d561`, unit hash `a3c4425208d2ca9c`). Judged frames 1350 (`bloom-opening`, 45.0 s) and 1515 (`bloom-hero`, 50.5 s), both at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

The families rotated against rounds 3 to 5: R1 GPT, R3 Gemini, R4 Claude. The jury's controls were not asked again: the approved pair's 6 of 10 votes from round 3 stand for the unit.

## Result

Not a pass, and the loop is over: `quality.lookLockMaxRounds` allows four rounds (3 to 6) and this was the fourth. The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green | | | |
| M1, M2, M3 | pass on both frames, for the first time in the loop (M3 0.860 at 1350 and 0.944 at 1515, 0.8 needed) | | | |
| R1 match (GPT) | 5 | 4 | 12 | 0 |
| R2 jury | passes: 7 of 10 votes on the judged frames were (a), 6 of 10 on the controls (round 3) | | | |
| R3 surface and detail (Gemini) | 4 | 2 | 4 | 1 |
| R4 motion (Claude) | 5 | 1 | 2 | 2 |

Jury: frame 1350 four of five (a), one (e) with 92; frame 1515 three of five (a), one (e) with 82 and one (d) with 60. All seven (a) votes name the lit hairs on the stem ("the finely resolved golden rim light on the sunflower's tiny stem hairs made the shot look like a high-end cinematic close-up"). Both (e) votes come from one family and name straight segments in the leaves' outlines ("visibly faceted low-poly silhouettes on the foreground leaves (especially along the left edge)", "the straight-segmented polygonal leaf silhouettes and hard geometric cylinder intersection where the lower petiole meets the stem"). The (d) vote: "a noise-free cinematic beauty shot whose sun glow never clips, which reads as generated art rather than a camera frame, catalog plate, or web demo".

Against round 5: R1 4 to 5 (another family; 3 severe and 5 major then, 4 severe and 12 major now, where each of eight regions is named once for each frame), R3 7 to 4 (GPT then, Gemini now), R4 5 to 5 (2 severe then, 1 now), the jury 7 to 7 of 10, M3 at `final` 0.672 to 0.860 at 1350 and 0.786 to 0.944 at 1515.

No round of the loop came near the bar. By round, R1, R3, R4, the jury's (a) votes on the judged frames, M3 at the two frames: round 3 `3e10245` 5, 4, 4, 7 of 10, 0.659 at 1350; round 4 `e099145` 4, 5, 6, 4 of 10, 0.722 and 0.849; round 5 `11207fd` 4, 7, 5, 7 of 10, 0.672 and 0.786; round 6 `cd262c1` 5, 4, 5, 7 of 10, 0.860 and 0.944.

## The best judged round

Round 6, and its build `cd262c1` is the one that is kept. It is the only round in which the machine checks and all three measures are green, which is what `kit/07-QUALITY-BAR.md` asks of anything kept after a limit. On the critics' numbers alone it is not ahead of round 5 (5, 4, 5 against 4, 7, 5; seven severe issues against five), and that is said here rather than left out. What decides it: round 5's build fails M3 at both frames, and round 6's build holds the fixes for three things that round 5's motion critic named and round 6's no longer does (the horizon's step across the cut at 40.00 s, the single frame jumps of the far skyline, the camera's reversal).

## Top issues

1. The sun (R1 severe at both frames). "A large round white bloom and broad yellow wash swallow the leaf edge and nearby horizon. The target has a much smaller hot spot just under the leaf, with directional rays and visible sky and ridge around it." Fourth round for the sun: rounds 3 to 5 named a hard point with a star and ruled spokes, round 6 its opposite.
2. The near neighbor at the left edge (R1 severe at both frames, R3 severe, both (e) jurors). "Large blue-green blades project much farther into the lower left, and the broad upper leaf sits higher and intersects the sun differently"; "flat, single-tone slate-blue waxy cards with crude, sharp geometric V-shaped sawtooth cutouts and zero lamina thickness"; "visibly faceted low-poly silhouettes on the foreground leaves (especially along the left edge)".
3. The camera (R4 severe). "The camera stops. The horizon falls 117→113→109→107 px across the first four tiles, then holds at 106 px for about 7.5 s with the sun fixed at the same spot, and only moves again at 52.0 s." This is the hold that round 5's fix for the reversal put in.
4. The bud at 45 s (R3 severe, R1 major). "Dark bracts in deep shadow have bright white jagged sawtooth outlines where no rim light can reach, and the unopened inner petals are smooth plastic-like straps that crisscross and interpenetrate across the face of the bud." Fourth round for the bud.
5. The petals in motion (R4 major twice). "A pale yellow-green petal appears between two consecutive frames left of the disc. It does not unfold into place, it pops in" (frames 1339 to 1340); "the inner petal pattern rearranges from frame to frame ... Petals boil and re-form instead of each one following a steady unfolding path."
6. The open head at 50.5 s (R1 major, R3 major). Broader and more front-facing with "thicker curled, orange-striped petals"; "heavy painted-on brown stripes, razor-sharp 1-pixel dark outlines along backlit edges, angular low-poly bract facets visible between petal bases, and a stray bright floret fragment sitting on the lower-left backlit petal at 8 o'clock".
7. The hero's leaves (R1 major at both frames, R3 major). The right leaf "a broad, scimitar-shaped sheet with mottled yellow highlights instead of a compact drooping folded leaf with a dark shriveled tip"; "blurry opaque dark-painted vein bands instead of raised translucent veins; the curled right leaf has hard polygonal creases, paper-thin edges, beaded rim-pixel aliasing, and loses its arching stem petiole at 50.5 s; and lower petioles meet the stem in straight unblended cuts with no clasping node".
8. The stem and its hairs (R1 major at both frames). "Thicker and more columnar ... the strongest rim resolves to a bright line with larger sparse tufts instead of fine, closely spaced hairs."
9. The field and the air in front of it (R1 major at both frames, R3 major). "Several background flowers are bold, dark-centered orange rings on tall uniform stems"; "oversized round floating highlights"; "blurred midground leaves on the left have pale glowing halo rings around flat dark-green centers".
10. The far skyline (R1 major at both frames). "A level dark band with a blurred, uniform edge; the target has more rolling contours and visible warm atmospheric separation at its base."
11. The upper sky (R1 major at both frames, R3 major). Smoother and greyer cloud at left, more uniformly blue teal at right; "a sharp, ruler-straight horizontal brightness step cuts across the sky from the sun toward the flower head".
12. Minor: the middle of the disc as "overly uniform, smooth green bead-like spheres" (R3); a faint crawl in the lit rims of bracts and hairs, and the crop's brightness falling from 59 to 54 levels in 0.4 s (R4).

## What was measured against the critics' words

- R4's hold is real and was put there on purpose: seven keys between 45.25 s and 50.25 s keep the far background where it is within 0.1 px while the camera pulls back, because the two approved images share one view of it. The critic's reading of it as a stop stands.
- The jury's reasons repeat round 5's: all seven (a) votes name the lit hairs on the stem. Both (e) votes come from one family (Gemini) and name the same thing, straight segments in the leaves' outlines, which R3 (the same family) also calls severe on the neighbor's leaves.
- The line that Phase 4 builds on (`phase4/integrate` at `5a144fa`) was rendered by the Builder at frames 1350 and 1515 at `review` and laid over the judged build's frames out of the kept clip: mean difference 2.7 and 3.9 levels, most of it video compression; the plant is the same, and what differs is the far neighbors' heads behind it.

Nothing is declined.

## What happens to the open issues

The loop is closed, so there is no fix pass inside it. Every severe and major issue above is written under "Open items" in `kit/PROGRESS.md` with the frame, the critic's words, what was tried and what to try next. They are worked again in Phase 6, and earlier where a Phase 4 unit shares the part: the sun and the sky with `field`, the near neighbor's leaves with `field`, the camera's hold in Phase 5's smoothing pass, the bud with `night` and `frost`.
