# Round 10 · Phase 4 · `rain` · floor round

Judged commit `0c3751f` (engine `1b119ecb00e043d9`, unit hash `0709fa6e53394e89`). Judged frame 420 (`rain`, 14.0 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Gemini, R3 Claude, R4 GPT. The jury was asked both images, five jurors each, one from each of five families (GPT, Gemini, Claude, GLM, Grok): the judged frame and the approved image of its key as the control.

## Result

Not a pass. This was the first of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 8 to 11) | | | |
| M1, M2, M3 | pass (M3 0.989 at `final`, 0.8 needed) | | | |
| R1 match (Gemini) | 3 | 5 | 4 | 0 |
| R2 jury | fails: 0 of 5 votes on the judged frame were (a), 3 of 5 on the control | | | |
| R3 surface and detail (Claude) | 4 | 1 | 8 | 3 |
| R4 motion (GPT) | 9 (a pass at this critic) | 0 | 1 | 0 |

Jury: three jurors called the judged frame (e), a real-time web 3D demo, with 88, 92 and 94, two (d), amateur generated art, with 60 and 78. What they name: the rain ("the repeated, uniformly angled rain streaks look like a real-time particle effect", "the uniformly straight, parallel rain streaks"), the leaves ("faceted polygonal leaf silhouettes", "stiff polygonal leaves"), the drops ("uniform sphere meshes attached along the cylindrical stem as raindrops", "identical beads lined up along the stem"), "the repeated background plants and puddle shader look stock". The control: three (a) with 88, 75 and 86, one (d) with 60, one (b) with 70.

## Open issues, in the critics' words

1. R1 severe (set-A-01-b.png, main plant lighting, foliage material, and shadow contrast). "the plant renders as opaque, cold blue-green CG geometry with crushed near-black upper shadows and zero backlit rim glow or warm subsurface scattering"
2. R1 severe (set-A-02.png, region 1, the head or bud). "the compact cluster of small unfolding crown leaves and central bud is missing, replaced by two oversized, stiff, dark V-shaped leaves with jagged polygonal teeth"
3. R1 severe (set-A-01-b.png, foreground soil and central water channel). "chunky wet mud clods with deep shadow pockets and crisp raindrop crown splashes are replaced by flat black grit covered in noisy white specular specks, a sharp-edged puddle with smooth sinusoidal CG ripples, and a blurry ghosted splash mesh, with no foreground bokeh or impact spray"
4. R1 severe (set-A-02.png, region 4, the field behind the plant). "the soft-focus green crop field and uneven dark mud mounds are replaced by a flat speckled black ground plane, sparse stiff grass blades, and flat grey horizontal puddle patches with almost no misty rain air"
5. R1 severe (set-A-03.png, region 6, the sky). "the storm clouds are smooth, blotchy, and overly cyan-blue without fine cloud texture or film grain, and the rain consists of sparse, uniform, ruler-straight CG line segments"
6. R3 severe (set-C-01.png, stem and petioles of the main plant, full height). "the water drops are evenly spaced, same-size white dots running in a neat line down the stem, like painted spots or a bead texture. They have no refraction or highlight variation, no running or merging, and on the lower stem they swell into pale flat blobs. They read as decals even at normal playback speed"
7. R1 major (set-A-02.png, region 2, the stem and its hairs). "the stem is smooth and completely hairless, lacking the dense backlit fuzz along its edges, and has large, evenly spaced spherical bead droplets stuck along its length"
8. R1 major (set-A-02.png, region 3, a leaf seen from the front). "the leaves have stiff angular planes, harsh sawtooth edges, and bright, sharp painted-looking pale vein lines instead of organic curvature and subtle natural venation"
9. R1 major (set-A-03.png, region 5, the far background at the skyline). "oversized dark blurred background plants tower across and above the horizon, and the soft wooded ridge is replaced by a bare, smooth, blocky hill with weak atmospheric haze"
10. R1 major (set-A-01-b.png, base of the main stem). "the lower stem is thick, tan, and covered in huge yellowish droplets, with two flat white-speckled cotyledons and a bright white split seed hull on the dirt beside it"
11. R3 major (set-C-02.png, crop 2 and crop 6, the small dark leaf at the stem base (left of stem)). "the leaf is covered in a uniform white polka-dot speckle. The dots are evenly spread and do not follow the leaf's tilt or curvature, so the leaf reads as a flat card with a dotted texture rather than a wet leaf"
12. R3 major (set-C-02.png, crops 1, 3 and 5, the upper leaves against the bright sky). "the leaves are lit from behind by a bright sky but show no light coming through. They are near-black, opaque, flat dark green, with no glow at the edges or through the vein network. The top leaves look like stiff cut-out cards with crisp knife edges"
13. R3 major (set-C-02.png, crop 4 (labelled leaf with the light behind it)). "no leaf in this crop is actually backlit. The leaves are front-lit or flat-lit against dark soil, so the backlit-leaf check cannot pass"
14. R3 major (set-C-02.png, crop 2, the stem). "no hairs are visible anywhere on the stem or petioles, even where the stem is silhouetted against the bright puddle and the sky. The stem is a smooth, waxy tube, pale tan near the base, with a hard boundary between the green and tan sections"
15. R3 major (set-C-02.png, crop 6, where the stem meets the soil). "the stem base looks planted on top of the soil, with no soil pushed up around it, no darkened wet ring and no real contact shadow. The bright tan base makes it look pasted in"
16. R3 major (set-C-02.png, crop 6, white object left of the stem base by the puddle). "a stray white object like a split shell, a petal or a crocus bud sits on the soil. It has no clear purpose, is the brightest thing in the lower frame and reads as a misplaced asset"
17. R3 major (set-C-01.png, whole frame, rain streaks). "the rain is a single overlay layer. The streaks are all the same brightness, length and angle whether they fall in front of the near soil or the far sky, they show no depth-of-field blur at near or far distances, and they do not get lighter or denser with distance. The rain sits on top of the picture, not inside it"
18. R3 major (set-C-03.png, crops 8 and 9, background plants). "the background seedlings are visibly the same model repeated, with the same leaf silhouette and posture copied across the rows"
19. R4 major (set-D-03.png, Upper leaf faces and margins, f0421–f0432 (14.03–14.40 s)). "Rain reads mostly as straight, translucent streaks crossing the leaves. The native-size sequence shows beads on the margins but little visible impact, breakup or runoff from the falling drops."

Minor issues: R1 0, R3 3, R4 0; they are in the cards.

## What was measured against the critics' words

- The pack's judged frame is the Builder's own frame: the pack was built on another agent's 4 core VM in a second worktree at the judged commit, and its `set-A-01-b.png` is the Builder's own `final` still of 420 from the measure, scaled the same way: 0 of its values differ.
- The rain streaks in the sky left of the plant at 420, `review` tier (box x 100, y 20, 545 x 355), counted by the agent that owns the rain, not yet by the Builder: at the judged commit 91 lines, length 25, 35 and 79 px at the 10th, 50th and 90th percentile, width 1.7, 2.6 and 3.7 px; the approved image 82 lines, 18, 37 and 71 px, 1.6, 2.7 and 3.9 px. So the count, length and width were already near; what differs is that every streak had one angle (15 degrees) and one brightness. Its fix (`0af600d`, on the line) gives each drop its own lean (about 9 to 21 degrees), brightness and softness.
- The same agent tried the far heavy drops (2 to 6 m) as streaks: at f/9 the lens blurs them to 9 to 13 px and they read as fat pale bars, so the depth the critics ask for behind the plant has to come from mist, which is its next piece.
- R4 gave 9 with one major (the rain does not visibly land on the leaves). The puddle's crowns are on the line (`bba71a6`); strikes on the leaves are ordered and not started.

Nothing is declined.

## What happens to the open issues

A fix pass on the four units of rounds 8 to 11 runs from 19:00 to 20:25 UTC (85 minutes, under the 90 of `budget.floorFixMinutes`). Each owning agent has the critics' and jurors' words on its part, word for word, and an order (`out/work/briefs/round-008-011-notes/`, and for the dawn `out/work/briefs/round-009-surface-notes/`). The finished bloom (frames 1200 to 1559) stays as it is: a fix acts before 36.5 s or is eased out by 40.0 s, with frames 1350 and 1515 shown byte identical by its author; the field is frozen for its own second round, so frame 1755 is shown byte identical too. The unit's second round is cut together with the other open units' at 20:30 UTC from the line `phase4/integrate`, if the count and the clock allow.
