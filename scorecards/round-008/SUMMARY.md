# Round 8 · Phase 4 · `frost` · floor round

Judged commit `0c3751f` (engine `1b119ecb00e043d9`, unit hash `0700abdea97005f6`). Judged frame 1080 (`frost`, 36.0 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Claude, R3 GPT, R4 Gemini. The jury was asked both images, five jurors each, one from each of five families (GPT, Gemini, Claude, GLM, Grok): the judged frame and the approved image of its key as the control.

## Result

Not a pass. This was the first of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 8 to 11) | | | |
| M1, M2, M3 | pass (M3 1.101 at `final`, 0.8 needed) | | | |
| R1 match (Claude) | 3 | 3 | 4 | 2 |
| R2 jury | fails: 0 of 5 votes on the judged frame were (a), 2 of 5 on the control | | | |
| R3 surface and detail (GPT) | 6 | 0 | 4 | 0 |
| R4 motion (Gemini) | 9 (a pass at this critic) | 0 | 0 | 2 |

Jury: four jurors called the judged frame (e), a real-time web 3D demo, with 86, 92, 93 and 76, and one (d), amateur generated art, with 45. All five name the field behind the plant as copies of one model ("The field repeats the same angular sunflower silhouettes like instanced low-poly models."; "The same angular bud silhouette repeats across the background, suggesting an instanced 3D mesh."; "identical low-poly plants fading through flat depth fog with no ground plane or lens blur"); two add the plant itself ("angular polygonal leaf edges and procedural frost geometry on the foreground stem", "the leaves look flat"). The control: two (a) with 82 and 86, two (d) with 90 and 55, one (b) with 68.

## Open issues, in the critics' words

1. R1 severe (set-A-01-b.png, field behind the plant, both sides and middle distance). "background plants are in sharp focus and render as near-black flat silhouettes with hard edges; in -a they are soft, heavily defocused and veiled in blue-grey fog, so the shallow depth of field and separation of the hero plant are lost"
2. R1 severe (set-A-01-b.png, air between the hero plant and the far field). "aerial perspective is wrong: near-background plants are dark and contrasty, then the field jumps to a pale grey band at the horizon; -a has a smooth, gradual falloff into dense fog with no visible horizon line"
3. R1 severe (set-A-01-b.png, leaves of the hero plant). "leaf arrangement and shape differ: -a has narrow pointed lance leaves angled upward in pairs with a big frosted leaf lower left and right; -b has broad heart-shaped flat leaves held horizontally, a large leaf covering the lower stem, and different positions, so it does not read as the same plant"
4. R1 major (set-A-02.png, region 2/3, leaf edges). "frost on leaf edges is a thick, uniform white fringe that looks like an outline or cutout halo, hanging below the leaf; -a has fine crystalline frost needles along the edge and a granular frost dusting across the leaf surface"
5. R1 major (set-A-02.png, region 1, the bud). "bud is darker and flatter in tone, with bracts reading near-black and outlined by a hard white rim; -a bud is mid green with visible tonal modeling, rim light from the backlit sun, and frost tips on bract points"
6. R1 major (set-A-01-b.png, overall grade). "-b is colder and more neutral grey with crushed blacks in foliage; -a has a soft teal-green foliage cast with raised, milky blacks from the fog"
7. R1 major (set-A-02.png, region 4, the sun). "sun disc is larger and harder-edged with a weaker warm halo; -a sun is smaller, diffused by fog, with a broad warm pink-orange glow around it"
8. R3 major (set-C-03.png, crops 7 and 8, the mid-field leaves and crowns along the skyline). "The same flat triangular leaves and shallow spiked bud silhouettes recur across the rows. Even through the defocus, the field reads as copies of a small set of plant models."
9. R3 major (set-C-02.png, crop 5, lower and left edge of the broad foreground leaf). "The frost runs as a broad soft white strip with combed, nearly parallel streaks reaching onto the blade. It reads more like a brushed fringe than separate ice crystals attached to the leaf."
10. R3 major (set-C-02.png, crop 4, broad backlit leaf in the center). "The blade stays a dense dark green almost to its edge; the pale rim comes from frost, while the thin tissue between veins shows little visible transmission. The veins read mostly as pale surface lines."
11. R3 major (set-C-02.png, crop 1, front and middle rows of bud bracts). "Several adjacent bracts repeat the same pointed, hooked profile, and the similarly bright frost tracing each lip makes those copies easy to pick out."

Minor issues: R1 2, R3 0, R4 2; they are in the cards.

## What was measured against the critics' words

- The pack's judged frame is the Builder's own frame: the pack was built on another agent's 4 core VM in a second worktree at the judged commit, and its `set-A-01-b.png` matches the Builder's own `final` still of 1080 from the measure, brought to the same size, with a largest difference of 0 over 1400 x 788.
- The lens. The frame was judged at f/11, the Builder's choice of 17:05 UTC from a strip at f/5.6, f/8 and f/11, made so that the nearest buds read as buds. R1's first severe issue and all five jurors read the rows as sharp copies of one model, and the pack's own crops (`out/work/packs/round-008/R1/set-A-03.png`) show the approved rows far softer than ours. The choice is taken back: the frost is at f/5.6 at its key again on the line since 18:27 UTC (`90709bb`).
- The white band on the leaf margin (R1 major, R3 major). The agent that owns the skin rendered frame 1080 with the skin's own crust at the margin switched off: the wide band stays, so it is the leaves' crystal fringe with the hairs' rime on it. The part that was the skin's, a thin closed grey line behind the ice, is a broken line of grains now (`1e45383`, on the line). Not checked by the Builder's own still yet.
- R4's second minor, the cut at 30.00 s: the critic itself found the night's ridge at the same pixel height on both sides when the contrast was stretched; the fog hides it at 30.00 s.

Nothing is declined.

## What happens to the open issues

A fix pass on the four units of rounds 8 to 11 runs from 19:00 to 20:25 UTC (85 minutes, under the 90 of `budget.floorFixMinutes`). Each owning agent has the critics' and jurors' words on its part, word for word, and an order (`out/work/briefs/round-008-011-notes/`, and for the dawn `out/work/briefs/round-009-surface-notes/`). The finished bloom (frames 1200 to 1559) stays as it is: a fix acts before 36.5 s or is eased out by 40.0 s, with frames 1350 and 1515 shown byte identical by its author; the field is frozen for its own second round, so frame 1755 is shown byte identical too. The unit's second round is cut together with the other open units' at 20:30 UTC from the line `phase4/integrate`, if the count and the clock allow.
