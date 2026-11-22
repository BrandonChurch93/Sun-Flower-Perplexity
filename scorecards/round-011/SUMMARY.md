# Round 11 · Phase 4 · `night` · floor round

Judged commit `0c3751f` (engine `1b119ecb00e043d9`, unit hash `7fcfe88ccc4c04c8`). Judged frame 780 (`night`, 26.0 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Claude, R3 GPT, R4 Gemini. The jury was asked both images, five jurors each, one from each of five families (GPT, Gemini, Claude, GLM, Grok): the judged frame and the approved image of its key as the control.

## Result

Not a pass. This was the first of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 8 to 11) | | | |
| M1, M2, M3 | pass (M3 0.954 at `final`, 0.8 needed) | | | |
| R1 match (Claude) | 3 | 4 | 4 | 1 |
| R2 jury | fails: 0 of 5 votes on the judged frame were (a), 4 of 5 on the control | | | |
| R3 surface and detail (GPT) | 7 | 0 | 3 | 0 |
| R4 motion (Gemini) | 4 | 3 | 3 | 0 |

Jury: three jurors called the judged frame (e), a real-time web 3D demo, with 89, 92 and 84, two (d), amateur generated art, with 55 and 74. What they name: the neighbors ("the field repeats nearly identical plant silhouettes, like instanced 3D meshes", "the background plants look like repeated instances of the same 3D model", "cloned, low-detail background plants"), the leaves ("low-poly faceted 3D leaf geometry"), the seam between ground and sky ("a flat gradient fog band and a mountain silhouette that looks pasted onto a stock Milky Way photo", "a mismatched night-sky plate, with a visible horizon seam"). The control: four (a) with 83, 82, 50 and 83, one (b) with 82.

## Open issues, in the critics' words

1. R1 severe (set-A-01-b.png, whole plant: leaf count, size and arrangement). "b is a different plant: about 5 large leaves widely spaced on a long bare stem, versus a's dense stack of 8-10 leaves crowding up the stem to a tight bud; the head sits higher (top near y≈180 vs y≈210) and the top leaves spread wider, flat to camera"
2. R1 severe (set-A-01-b.png, skyline and horizon band (region 4)). "a has a soft, out-of-focus tree line on low rolling hills with fog lying low in the field; b has a hard-edged, jagged mountain silhouette sitting on a flat, even grey-white fog band that looks pasted in, with no depth of field and no air between layers"
3. R1 severe (set-A-01-b.png, background field of plants (lower third)). "in a the background plants are dark, defocused and fall off into fog; in b they are sharp, evenly lit, grey-silver flat shapes, as bright as the foreground and cut out against the fog, with no depth of field"
4. R1 severe (set-A-01-b.png, leaf lighting on the main plant (regions 1-3)). "a's leaves are near-silhouettes lit only by a thin cool rim along edges and hairs; b's leaves glow bright green as if lit from behind, with visible veins, and the lower leaf on the right and the leaf in the lower middle get a flat grey-white sheen like a plastic mold"
5. R4 severe (set-D-04.png, foreground grass, middle-ground field rows, and left/right horizon ridge across f0599 to f0600 (19.97 s to 20.00 s)). "only the hero plant aligns across the cut: dense foreground grass and puddles vanish into bare dirt with sparse tufts, the crop canopy drops and changes layout, and distant mountain ridges appear on the left and right horizon where f0599 was flat"
6. R4 severe (set-D-03.png, central stem apex and emerging bud in f0756-f0759 (25.20 s-25.30 s, also visible in set-D-02.png)). "the stem terminates in a bare smooth rounded capsule and spiky involucral bracts plus detached floating hairs pop abruptly outward through the capsule wall over two frames while intersecting the adjacent upper petiole"
7. R4 severe (set-D-04.png, main stem below the upper petioles in rain frames f0594-f0599 (19.80 s-19.97 s)). "bright specular water droplets on the stem jump to uncorrelated random positions every frame, creating a 30 Hz flicker along the stem"
8. R1 major (set-A-03.png, upper sky around the top of the Milky Way). "b has vertical streaks/smears and blocky soft patches in the Milky Way's upper end, with the cloud fading into a vertical smear; a shows a continuous textured dust band with fine stars"
9. R1 major (set-A-01-b.png, Milky Way position and shape). "b's band is shifted slightly and is softer and less contrasty; the bright core near x≈350,y≈380 has less dust-lane detail than a"
10. R1 major (set-A-02.png, stem and its hairs (region 2)). "b's stem is thicker, darker and straight with sparse coarse hairs; a's stem is thinner with dense fine silvery rim-lit hairs"
11. R1 major (set-A-01-b.png, left edge of the sky and the glow at the horizon). "a has a strong bluish airglow at the lower left rising off the horizon; in b it is weaker and the stars at the lower left look larger and brighter"
12. R3 major (set-C-02.png, crop 5, left skyline behind the neighboring plants). "The star field stops at a ruler-straight line that abruptly joins the hills, and the smooth gray strip below makes the background look like a flat cutout."
13. R3 major (set-C-02.png, crops 2 and 4, raised folds of the large leaf at lower left). "Broad silver highlights roll over the folds without fine surface texture, making the leaf read as molded plastic beside the more convincing translucent green areas."
14. R3 major (set-C-02.png, crops 5 and 6, neighboring plants across the middle distance). "Several neighboring plants repeat the same upright stem and paired drooping leaf silhouette at similar heights, exposing the instancing."
15. R4 major (set-D-01.png, developing flower head at the stem apex in f0845-f0899 (28.2 s-30.0 s)). "between f0845 and f0872 a large dark bract or leaf lobe swells across and engulfs the right two-thirds of the spiky flower bud before flattening into a cap in f0899, passing through the head instead of unfolding away from it"
16. R4 major (set-D-04.png, foreground puddles and broad upper leaves in rain frames f0594-f0599 (19.80 s-19.97 s)). "rain streaks pass over the image without landing: puddles remain completely flat motionless grey shapes with no ripples or splashes and leaves show no droplet impacts"
17. R4 major (set-D-01.png, horizon mist band along the base of the mountains across f0600-f0899 (20.0 s-30.0 s, and set-D-02.png f0748-f0759)). "the fog and mist lumps stay completely frozen relative to the mountain silhouette across the entire 10-second time-lapse while stars and plant growth move rapidly"

Minor issues: R1 1, R3 0, R4 0; they are in the cards.

## What was measured against the critics' words

- The pack's judged frame is the Builder's own frame: the pack was built on another agent's 4 core VM in a second worktree at the judged commit, and its `set-A-01-b.png` is the Builder's own `final` still of 780 from the measure, scaled the same way: 0 of its values differ.
- The lens at the night key is f/16, so the neighbors behind the plant stand sharp (R1 severe: "no depth of field"). A strip of frame 780 at f/16, f/8, f/5.6 and f/4 is being rendered by the agent that owns the crop (asked 19:19 UTC); the Builder chooses from the pictures and the measure lines.
- The ruler-straight line where the stars stop (R3 major) is the foot of the far row in `src/weather/skyline.ts` (bank 2.85 m at a radius of 77 m), found in the code by the Builder; the agent that owns the night world breaks it with the tree line or buries it in low fog.
- The dark lobe that swells across the bud between 28.2 and 29.1 s (R4 major) is a leaf, not a bract: the agent that owns the bud rendered frame 863 with leaf 18's length forced to 0 and the lobe was gone; with leaf 19 forced to 0 it stayed. Leaf 18 is 110 to 133 mm long there while the bud is about 30 mm across. The request went to the leaves' owner word for word; a young leaf near the tip is already smaller on the line (`d1103f6`).
- The cut at 20.00 s (R4 severe) has four owners: the ground (the rain's dense foreground grass against bare dirt), the puddles, the rain's far land and the night's ridge. Each is ordered to make frame 599 and frame 600 one place and to send both frames side by side.

Nothing is declined.

## What happens to the open issues

A fix pass on the four units of rounds 8 to 11 runs from 19:00 to 20:25 UTC (85 minutes, under the 90 of `budget.floorFixMinutes`). Each owning agent has the critics' and jurors' words on its part, word for word, and an order (`out/work/briefs/round-008-011-notes/`, and for the dawn `out/work/briefs/round-009-surface-notes/`). The finished bloom (frames 1200 to 1559) stays as it is: a fix acts before 36.5 s or is eased out by 40.0 s, with frames 1350 and 1515 shown byte identical by its author; the field is frozen for its own second round, so frame 1755 is shown byte identical too. The unit's second round is cut together with the other open units' at 20:30 UTC from the line `phase4/integrate`, if the count and the clock allow.
