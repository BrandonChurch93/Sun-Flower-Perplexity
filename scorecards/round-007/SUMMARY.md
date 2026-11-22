# Round 7 · Phase 4 · `field` · floor round

Judged commit `566eb48` (engine `8624708e4ca1ecb4`, unit hash `6af746595ab9c64b`). Judged frame 1755 (`field`, 58.5 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Gemini, R3 Claude, R4 GPT. The jury was asked both images, five jurors each, one from each of five families (GPT, Gemini, Claude, GLM, Grok): the judged frame and the approved `field` image as the control.

## Result

Not a pass. This was the first of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (the determinism check on its second run, after the harness's own time limit cut the first) | | | |
| M1, M2, M3 | pass (M3 0.802 at `final`, 0.8 needed) | | | |
| R1 match (Gemini) | 3 | 5 | 4 | 0 |
| R2 jury | fails: 0 of 5 votes on the judged frame were (a), 4 of 5 on the control | | | |
| R3 surface and detail (Claude) | 4 | 0 | 6 | 3 |
| R4 motion (GPT) | 6 | 1 | 0 | 1 |

Jury: all five jurors called the judged frame (e), a real-time web 3D demo, with 87, 95, 45, 94 and 86. Four of the five name the same thing first, the crop as copies of one plant ("the near-identical sunflower meshes repeated across the field look like instanced assets in a real-time 3D scene"; "the same sunflower geometry appears visibly repeated across the field, like instanced 3D assets"). The others' words: "the abrupt LOD transition from uniform instanced meshes to billboarded background flowers", "visibly faceted low-polygon geometry on the two foreground sunflower stalks", "stiff low-poly leaves and card-like grass tufts on a flat ground", "weak contact shadows", "a sun glare that looks like a stock lens effect". The control: four (a) with 86, 82, 65 and 82, one (b) with 71.

## Top issues

1. The crop (R1 severe, R3 major twice, all five jurors). "The nearer field sunflowers all face flatly toward the camera with dark unlit centers, dull petals, and dark murky stems missing golden backlight and warm haze, and they end at an abrupt horizontal seam mid-field against a flat brown texture of tiny rings"; "the background heads are near-identical copies, all the same size, all facing the lens at the same angle in an even scatter, with the same leaf silhouette repeated down the rows"; "the field ends in a hard straight horizontal line against a featureless tan/brown band".
2. The sun (R1 severe, one juror). "A smooth, featureless white-yellow ball floating high above a flat, dark-outlined ramp with no cloud breakup or rays, whereas in -a it sits low on a wooded ridge behind broken warm clouds and casts diagonal golden sun rays and veiling flare across the left side."
3. The sky (R1 severe). "Covered by a heavy, blurry dark grey overcast cloud sheet instead of -a's clear deep slate-blue sky with small, crisp, warm-rimmed scattered clouds near the horizon."
4. The far skyline and the plain under it (R1 severe, R3 major twice). "Sharp-edged, smooth, scalloped dark blob silhouettes with no foliage texture or optical softness"; "a thin dark, jagged, aliased line runs along the top of the far plain like the edge of a cut-out card"; "a single flat near-black silhouette with a blobby, regular outline and no aerial-perspective layering".
5. The plant's leaves (R1 severe, R3 major). "Smaller, sparser, and curled with bare stem gaps, and their front faces have a cold, opaque bluish-grey sheen instead of -a's broad, lush overlapping warm-green leaves with golden subsurface translucency and bright rim highlights"; "they look like flat cards with a bright painted rim, and no light passes through them even with the sun behind".
6. Growth in motion (R4 severe). "Even in the designated fastest-growth stretch, the bloom stays fully open and its petals retain nearly the same shapes and overlaps. There is slight flex, but it reads as an already-grown flower swaying during the camera pullback, not as time-lapse growth."
7. The head (R1 major, R3 minor). "Smaller and flatter with sparser, stiffer petals that lack the tousled multi-layer fullness, bright golden translucency, and warm disc rim highlight of -a."
8. The stem and its hairs (R1 major, R3 major). "Thinner than in -a and its surface hairs are faint and dull rather than forming a bright golden-white backlit halo"; "smooth tubes with a single thin bright rim line; no hairs are seen against the backlight".
9. The ground (R1 major, R3 minor twice, one juror). "Uniform, evenly spaced cool-green grass separated from the field by a bare flat brown dirt strip, lacking -a's rough varied weeds and bright golden raking sunlight patches"; "dry tufts set out in regular diagonal bands"; "the stems vanish into the grass with no clear contact shadow or soil at the base".
10. Grain and focus (R1 major). "A clean, grainless render with pin-sharp horizon edges and crisp background flowers, lacking -a's smooth optical depth-of-field falloff and fine organic film grain."
11. Minor: the pullback "eases to a near-hold" over the last 0.8 s (R4).

## What was measured against the critics' words

- The pack's judged frame is the Builder's own frame: the pack was built on another agent's 4 core VM in a second worktree at `566eb48`, and its `set-A-01-b.png` matches the Builder's own `final` still of 1755, brought to the same size, with a largest difference of 0 in any byte.
- M3 reads 0.802 at `final` against 0.949 at `review` for the same frame on the unit's own branch: the 48 lens samples of `final` soften the frame more than the 8 of `review`. Anything that blurs the crop further (R1's own fix for the grain and focus issue) would turn M3 red, so the softening goes to the skyline only and the crop keeps its focus.
- The glare: the tallest unbroken run of white in the sun's column is 188 px at 1755 where the approved image has about 110 (measured by the agent that owns the lens, not yet by the Builder).
- The sun and the sky, as measured by the agent that owns the golden world: the sun stands 24 px higher than in the approved image, the sky's top left reads 201,172,142 against the approved 171,144,122.
- The grass in the bottom fifth of the frame: approved median 18,24,19 and ninth decile 34,35,27, ours 13,24,11 and 23,34,17 (measured by the agent that owns the crop): darker and with less blue and red, the opposite of "cool" in number, so the critic's "cool-green" is read as "no warm light on it".
- R4's near-hold: the camera's last key is at 60.0 s and its speed there is 0.38 m/s. The pullback does not stop, but it eases.

Nothing is declined.

## What happens to the open issues

A fix pass of at most 90 minutes (`budget.floorFixMinutes`) follows, from 17:37 UTC. Each owning agent has the critics' and jurors' words on its part. Frames before 52.0 s (the finished bloom, frames 1200 to 1559) stay as they are: every fix to the golden world, the crop and the plant acts from 52 s only, with a pixel difference of 0 at 1350 and 1515 shown by its author. The unit's second round runs after the other four units have had their floor rounds, if the count and the clock allow.
