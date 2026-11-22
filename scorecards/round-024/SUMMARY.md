# Round 24 · Phase 6 · polish round 2 of 2 · the whole film after its fix batch

Judged commit `7928ed4` (engine `a4c82933ba906236`). The pack: the ten judged frames and the six frames of the hook at the `final` tier in 16x9, the three whole film sheets, the four cut sheets and six run sheets of fastest growth at the `review` tier in the preview format, and the four stress pairs; every picture was rendered from the judged commit on a builder's machine (three of the run sheets were cut on the Builder's machine from stills that builders rendered) and taken in only with a record that carries the engine. The jury was asked about frames 420, 780 and 1755, the same three as in round 23. The key names `7928ed4`, the commit at which the last pack was built; its source is that of `5506686`, the merge of the batch, and only the log and the status pictures differ between the two. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R5.json`, `R6.json`, `R7.json`, `R4.json`, `R2.json` with `R2-JURORS.md`; the manifests, the key and the measures are beside them.

Families: R6 Gemini, R5 Claude, R7 Grok, R4 in two parts as the kit orders for a pack over `critics.maxFilesPerMessage`: part 1 (the ten sheets of consecutive frames) GPT, part 2 (the three whole film sheets) GLM, merged with the lower score. None of these families judged the same rubric in round 23. The jury: three images, five jurors each, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the controls' votes are those of the unit rounds.

## Result

**Not a pass.** One critic is at the bar: compression 10 with no issue (was 7). Motion 7 (was 4): the rays crossing, the blinking soil highlights, the field's plants in one pose, the husk's smear, the crawling stars, the bract hairs in dots and the surging pull are not named again; its one severe issue is the skyline across cut 2, which waits for Brandon, and three of its six major issues are about the split of its pack. The whole film 7 (was 8, from another family): it names the two plants at the end as severe. The hook 6 (was 7, from another family): it sees the arch in the first frame now and calls it too small to read, and names for the first time that the sprout nearly stands still between 1.5 and 2.0 s. The jury passes frame 420 at the edge of the gap (2 of 5, was 4 of 5) and frame 780 (4 of 5, was 3 of 5) and fails frame 1755 again (0 of 5, was 1 of 5). The batch stays whole: the machine checks and the measures are green on it, and each of its pictures was looked at before its merge and again on the merged build. The rain piece was weighed once more after the jury's words on frame 420 and kept.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | all 13 green (07:53 to 08:24 UTC) | | | |
| M1, M2, M3 | green for the six units (08:24 to 08:30 UTC) | | | |
| R5 the whole film (Claude) | 7 | 1 | 4 | 2 |
| R6 scroll stop (Gemini) | 6 | 2 | 1 | 0 |
| R7 compression (Grok) | 10 (a pass at this critic) | 0 | 0 | 0 |
| R4 motion, on the cuts (GPT and GLM, merged) | 7 | 1 | 6 | 0 |
| R2 jury | FAIL: 6 of 15 votes for (a) against the controls' 24 of 40; failing frames 1755 | | | |

Jury, by frame: 420 2 of 5 against 3 of 5; 780 4 of 5 against 4 of 5; 1755 0 of 5 against 4 of 5 (fails).

## Open issues, in the critics' words

1. R5 severe (set-E-03.png, field section, f1645 54.8 s through f1799 60.0 s (also set-E-05.png f1755 58.5 s)). "The hero's identity breaks. Once the camera pulls back, a second tall plant with a closed bud (the left foreground plant from the bloom shots) stands beside the open flower at the same scale. In the last frames the two read as a pair, and a viewer can't tell which one is the plant we have followed. The hero also ends small, dim and in shadow on bare grass in front of the field, not part of it, so the release feels like losing the plant instead of it joining the field."
2. R6 severe (set-F-01.png, bottom-center soil mound). "at 0.00 s the pale stem arch is barely peeking out flush with dark rim-lit dirt clods, so at 400 px phone width it is unclear what is happening in the first frame and it reads as an empty sunrise landscape"
3. R6 severe (set-F-09.png, central seedling hook across 1.50 s to 2.00 s (set-F-07.png through set-F-09.png)). "after rising briskly during the first second, the seedling decelerates to a near standstill for the final 0.5 s while the seed hull, grass, and camera remain static, stalling momentum inside the 2-second hook"
4. R4 severe (set-D-05.png, f0599 to f0600, left skyline and field behind the stem at the 20.00 s cut). "The stem registers, but the low rain skyline jumps upward into a different left-side ridge and the field boundary shifts with it. The cut reads as a background jump as well as a change in weather and light."
5. R5 major (set-E-02.png, cut from rain f0565 18.8 s (set-E-01.png) to night f0617 20.6 s). "The place changes at the cut. In rain the plant stands in open soil with short grass and a rivulet. Two seconds later at night it is surrounded by a dense crop of large-leaved plants, and the camera now sits higher with no soil in frame, so it reads as a different location instead of the same spot later."
6. R5 major (set-E-03.png, cut from bloom f1542 51.4 s to field f1593 53.1 s and on). "The bloom-to-field cut lands weakly. The light, haze and colour are almost the same as bloom, but the sun jumps from the frame's left edge to the centre horizon. The cut reads as a camera move with a lighting error, not a new world."
7. R5 major (set-E-02.png, frost section f0925 30.8 s to f1182 39.4 s (set-E-05.png f1080 36.0 s)). "Frost reads as grey fog. No frost crystals, rime or white edges are visible on the leaves or bud, so the world is hard to tell apart from a hazy morning."
8. R5 major (set-E-02.png, hero foliage between night f0874 29.1 s and frost f0925 30.8 s). "The leaves change character across the cut. At night they are broad and serrated; in frost they are long, narrow and drooping, with a different count and arrangement. The plant looks swapped, not just older."
9. R6 major (set-F-06.png, striped seed hull at center against midground soil). "the dark striped seed head hangs below the horizon line against dark brown out-of-focus dirt while the bright sun flare pulls attention to empty space on the right, weakening subject contrast at phone size"
10. R4 major (set-D-01.png, f0000–f0011, soil clods at the base of the emerging hook and beside the seed coat). "The hook and seed coat rise between the same intact clods without a visible contact response, so the seedling looks like it is coming through a rigid opening."
11. R4 major (set-D-04.png, f0290–f0301, rain around the upper leaves and growing tip). "The passing streaks are clear, but the wet leaf surfaces do not show a corresponding sequence of strikes, beading or runoff. The rain looks separate from the plant."
12. R4 major (set-D-02.png, f0120–f0131, right cotyledon and detached seed coat). "The right cotyledon opens mostly as a stiff blade rotating at the stem, and the detached seed coat reaches the ground with little visible change in pitch or recoil."
13. R4 major (set-D-01.png, supplied motion-review pack, across the unit). "The delivered set has consecutive growth and cut sheets but no whole-segment contact sheet, so the intervening camera, focus and motion continuity cannot be checked."
14. R4 major (set-D-12.png, night-to-frost boundary, f0874 to f0925 (29.1–30.8 s); the other world changes are likewise only sparsely sampled). "No consecutive cut coverage is supplied. The 51-frame gap cannot show whether the plant, grass, and horizon register on the actual cut or the world changes in exactly one frame."
15. R4 major (set-D-13.png, rapid bud opening and petal release, f1285 to f1491 (42.8–49.7 s)). "The sampled poses read as a plausible bloom, but there is no consecutive fast-growth sheet. Frames roughly 1.7 seconds apart cannot distinguish continuous unfolding from a pop or intersection, or reveal brief jitter, focus hunting, or shimmer."

Minor issues: R5 2, R6 0, R7 0, R4 0; they are in the cards.

## The fix batch that was judged

Opened 06:29 UTC and merged by 07:52 UTC in three passes; the source judged is that of `5506686` (engine `a4c82933ba906236`). A piece was merged only after the Builder looked at its pictures. Merged, fourteen pieces, each named by its last commit:

- `04c3a4c` the companion's held leaves are held in place before the bloom begins, for cut 4.
- `db0c683` the bracts peel back ahead of their rays.
- `d0a0b91` the field at the end: nine in ten heads of the middle and far rows come round to the lens's side, lift from their hang and fill out; three in ten hang far over; every neighbor stands off plumb and leans and comes back on its own period; a gust crosses the rows between 53.4 and 57.5 s.
- `22d04fa` the pull at the end: the head's rate only falls after its peak and the horizon never turns back.
- `7412ece` the dawn's highlights: the soft blade before the lens carries no dew, thin cloud holds the sun's core at half in the first frame and clears evenly, the crumbs' small highlights are held to more than one pixel.
- `7d5ee72` the leaves in the field's air move on their own, lift and swing wider.
- `6524865` the rain lands on the plant: the streaks end on the leaves and are fewer, longer and wider.
- `e70dd94` the sprout has a head start of five frames, so a pale arch stands in the cleft at frame 0 (gone by 1.4 s); the husk loses its speed over thirteen frames and lies still.
- `7befcc7` the dawn cleft opens evenly with a narrow reach and a clear lane for the seed coat.
- `ec15c1c` a dry hair too thin for a ribbon is a soft whole stroke, and a short one stays in its body's shade.
- `fe0447e` the field's foot: tufts lean, vary and lie flat, dry tufts are held down, mown green in the turf.
- `3b587cb` the night's stars have a core the pixel grid can carry, and the faintest are lifted to survive an encode.
- `e1c2cff` one face at the end: the companion's head is kept young.
- `d1f39da` rays that have not begun to lift by the bloom-opening key open in turn round the rim. By the crossing test on the merged build no ray cuts a bract (0 of 64 and 0 of 55 frames); rays still cross rays on the meshes in every frame of both windows.
- Not merged: `465fee1` (lanes for the shut straps) and `5362206` (the rows' leaves shaded leaf by leaf, which failed its shimmer check three times).

## What stays open

- frames 0 to 38, the hook: the arch in the first frame is too small to read at phone size and the seed coat hangs under the horizon against dark soil (severe and major); frames 45 to 60: the sprout nearly stands still (severe, first named in this round).
- frames 599 to 600: the skyline and the place jump across cut 2 (severe and major, two critics). The worlds follow the approved images and the cuts are hard by a ruling; this is a call for Brandon.
- frames 1645 to 1799: two plants stand together at the end and the hero ends small and dim before the field (severe, CONTESTED, waits for Brandon); frames 1542 to 1593: the sun crosses the frame during the pull while the light stays the same (major).
- frame 1755: the jury fails it, 0 of 5 against 4 of 5; the jurors name repeated plant models, faceted leaves, flat grass and heads lit from the front with the sun behind.
- frames 0 to 11 (no crumb answers the hook), 120 to 131 (the seed leaf opens as a stiff blade, the husk lands without a tumble), 290 to 301 (no strike, bead or runoff on the leaves): one major each on the run sheets.
- the frost reads as grey fog at the size of a sheet, and the leaves read as other leaves across cut 3 (two major, the whole film critic).
- frame 420: the jury passes it at the edge, 2 of 5; two jurors read the rain's streaks as a particle effect.
- three major issues of the motion critics are about the split of their pack, not about the film.
- on the meshes rays still cross rays in every frame of the opening, by the crossing test; no critic names it in this round.
- Every one of these is an entry under "Open items" in `kit/PROGRESS.md` with what was tried and what to try next; the round 23 entries carry a note of what this round did to each.

## What happens next

Polish ends here at its limit of two rounds (`quality.polishMaxRounds`), not at a pass. The source that is kept is that of `5506686`. Next comes the floor of Phase 6: the freeze, the judged stills and comparison images from the frozen build, the record round, the master film, the clips and the preview from it, the proof, the cue sheet, the README and the QA gauntlet.
