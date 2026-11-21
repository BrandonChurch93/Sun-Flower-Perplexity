# Round 2 · Phase 2 · blockout · extra round

Judged commit `9c0c8bb` (the pack was built on `075b000`, which changed no pixel). One critic, R4 blockout, a fresh agent of the Gemini family that saw only the ten pack images, its section of `kit/07-QUALITY-BAR.md`, the severity scale, the return format and the manifest. Its answer is `R4-blockout.json`, word for word. A blockout round has no measures.

## Score

| Critic | Score | Pass | Severe | Major |
| --- | --- | --- | --- | --- |
| R4 blockout | 6 | no | 1 | 5 |

The bar for the blockout is 7 with no severe issue open. The score is 6 and one severe issue was open, so the round did not pass.

## Top issues

1. Severe. Frames 1234 to 1542 (41.1 to 51.4 s): the bud bent about 80° to the left toward the sun, then reversed about 75° to face flat into the camera.
2. Major. Pair 6 and pair 7, left edge: in the approved images a close plant fills the whole left margin with a leaf across the sun; the film has one small leaf tip low at the edge.
3. Major. Pair 6, `bloom-opening`: the stem too far right (65.5% against 61%), the head near side profile and about 20% shorter.
4. Major. Pair 7, `bloom-hero`: the head flat to the camera, the stem a little right (64.5% against 61%), the blooms behind nearly twice the approved size.
5. Major. Pair 8, `field`: the hero's head about 35% too small and flat front-on, the field's blooms in a high band above the hero's head instead of round it.

None was declined: none asks the film to move away from an approved image, a settled line or a choice of Brandon's. Nothing the critic raised was about detail, light or materials.

## What changed in the fix pass

One pass, 05:50 to 06:05 UTC, 15 minutes.

1. The head holds one facing from the bud to the end, a third of the way round from the lens toward the sun on the left: 39.9° left of the lens at the opening key, 35.0° at the hero key, 33.1° at the field key. It never turns back. Checked on frames 1234, 1285, 1336, 1388, 1439, 1491, 1542, 1593, 1696 and 1755.
2. The camera keys of the bloom and the field were fitted again. The stem crosses the lower frame at x 0.632 at the opening key (approved 0.625) and at x 0.607 at the hero key (approved 0.615).
3. Neighbors are 0.70 to 0.85 of the plant's height, measured on the approved `field` image. Their heads stand lower behind the hero and reach down to the level of the hero's head at the field key.

Still open after the pass, each under "Open items" in `kit/PROGRESS.md` with the phase that settles it:

- The foliage at the left edge of the two bloom frames (Phase 3). The companion must stay out of the early frames, which is the rule in `kit/02-SUBJECT.md`.
- The size of the heads behind the hero at the hero key (Phase 3). The first row's distance and the lens are fixed.
- The size of the hero's head and the band of field heads at the field key (Phase 4, unit `field`). The head's width and the plant's height are fixed facts.

## What changes next

Nothing more in the blockout: round 2 was the last round the limit allows (`rounds.blockout` is 2). The loop closes as a limit reached, not as a pass. The build that goes on is the round 1 build with every later fix, machine checks green. The fixes of this pass were checked by the Builder on frames and were not judged by a critic. Phase 2 ends with its final build and its gate, then Phase 3 starts the look lock on `bloom`.
