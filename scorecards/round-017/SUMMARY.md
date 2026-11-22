# Round 17 · Phase 4 · `field` · extra round

Judged commit `47d93fd` (engine `b9de284219d214c9`, unit hash `c229e6a6f41a2960`). Judged frame 1755 (`field`, 58.5 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Claude, R3 GPT, R4 Gemini. The jury was asked the judged frame, five jurors, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the votes on the control are round 7's, reused as the kit orders.

## Result

Not a pass. This was the third of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 17 to 21) | | | |
| M1, M2, M3 | pass (M3 1.112 at `final`, 0.8 needed) | | | |
| R1 match (Claude) | 4 | 3 | 4 | 1 |
| R2 jury | fails: 1 of 5 votes on the judged frame was (a), a share of 0.20; 4 of 5 on the control, 0.80 | | | |
| R3 surface and detail (GPT) | 7 | 0 | 3 | 0 |
| R4 motion (Gemini) | 5 | 2 | 2 | 0 |

Jury: one juror called the judged frame (a) with 74 ("The convincing golden-hour backlighting, with rim-lit foreground stalks and haze across the field"); four (e) with 92, 55, 82 and 82, and all four name copies: "every sunflower head is a near-identical copy facing the camera, the stems are bare and thin, and the ground uses sparse grass cards", "The same angular sunflower models appear to repeat across the field", "sparse repeating grass cards, and the two sunflowers have card-like polygonal leaves". The unit's jury did not move in its three rounds: 0 of 5 in round 7, 1 of 5 in round 12, 1 of 5 here, against 4 of 5 on the approved image. The failed jury counts as one major issue.

## Open issues, in the critics' words

1. R1 severe (set-A-01-b.png, sun and sky round it, upper left (region 5)). "-a has a large blooming sun sitting on the treeline with wide flare rays, glowing broken cloud banks and a thick warm haze plume pouring over the left of the field; -b has a small tight sun disk floating above the treeline, thin streaky clouds, little bloom and almost no haze over the field"
2. R1 severe (set-A-01-b.png, whole frame, color and grade). "-a is a warm, filmic grade with lifted, slightly milky blacks, soft contrast and fine grain; -b is a cleaner, greener, more saturated CG look with crisper contrast and a cooler blue sky"
3. R1 severe (set-A-01-b.png, skyline and far background (region 7)). "-a has rolling hills and a dense dark treeline across the whole skyline, sitting lower in frame; -b has a flat, empty dark band of bare ground before a thin treeline with odd small bumps, and the horizon sits higher on the left and is flatter"
4. R4 severe (set-D-01.png, sky above the horizon between the left neighbor plant and the hero flower head in f1582 (52.7 s) through f1647 (54.9 s), clearest in f1582 and f1603). "drifting backlit pollen specks cut off along a razor-straight horizontal line in mid-air because the particle emitter is confined to a small hard-edged bounding box around the two foreground plants that slides down the sky as the camera cranes up"
5. R4 severe (set-D-03.png, backlit white hairs along both edges of the hero stem, right-side phyllary bract tips, and lower leaf margins across f1641 to f1652). "single-pixel specular rim hairs blink up and down by 30 to 180 luminance on alternating frames during the slow pullback, creating strong buzzing shimmer and crawling noise at normal playback speed"
6. R1 major (set-A-01-b.png, field behind the plant (region 6)). "-a field is backlit with heads mostly turned toward the sun, dim and soft with depth falling off into haze; -b heads face the camera brightly, leaves are large and glossy, and the field stays sharp and bright into the distance with little atmospheric falloff"
7. R1 major (set-A-02.png, foreground plant leaves (regions 2 and 3, tile b)). "-a leaves are thin, translucent and rim-lit with a warm edge glow; -b leaves are oversized, waxy and saturated yellow-green with hard yellow edge highlights"
8. R1 major (set-A-02.png, stem and its hairs (region 2, tile b)). "-a stem is bright and rim-lit with visible fine hairs; -b stem is dark and smooth with no visible hairs"
9. R1 major (set-A-01-b.png, foreground grass, bottom of frame). "-a has soft green grass with warm sunlit tufts; -b has dark ground with hard-edged straw patches and long shadow streaks running right"
10. R3 major (set-C-03.png, crops 10 and 11, the horizontal strip just beyond the last visible sunflower heads). "The densely textured flower field gives way along a conspicuously straight boundary to a nearly featureless dark strip. The break makes the distant landscape read as a separate flat layer."
11. R3 major (set-C-02.png, crop 4, the large front-facing leaves on the right-hand foreground stem). "Broad bright and dark bands stand in for vein detail on the leaf faces. The small veins and surface texture look smeared even though the rim and adjacent stem hairs are sharply defined, giving the leaves a molded appearance."
12. R3 major (set-C-03.png, crop 9, across the middle depth of the sunflower field). "Identical-looking dark disks with similar pointed petal rings recur across the field, especially among the front-facing heads, making the planting read as instances of a small asset set."
13. R4 major (set-D-01.png, distant dark hillside under the sun on the left half of the frame in f1777 (59.2 s) and f1799 (60.0 s)). "as the camera reaches peak crane height at the end of the move, a bright straight horizontal seam pops open across the dark hill silhouette from the left edge past the sun"
14. R4 major (set-D-03.png, ray petals around the hero flower head and surrounding background sunflower heads across f1641 to f1652 (and across set-D-01.png)). "all ray petals on the hero head and all background field heads remain completely rigid with zero flutter or nod while airborne pollen streaks past rapidly in the wind"

Minor issues: R1 1, R3 0, R4 0; they are in the cards.

## What was measured against the critics' words

- The far edge of the field (R1 severe, R3 major, R4 major: "a flat, empty dark band of bare ground before a thin treeline with odd small bumps", "gives way along a conspicuously straight boundary to a nearly featureless dark strip", "a bright straight horizontal seam pops open across the dark hill silhouette"). Round 12's surface critic named the same straight edge. The fix pass took a bright line off the far edge and gave land and strips one evening tone (`bb1ab83`); the bare strip stayed. A cure was built on `agent/field-far-edge` (`c85f03a`) after the joint cut and is not in the judged build. The seam at the top of the crane (frames 1777 and 1799) is new in this round and not traced yet.
- The sun (R1 severe: "a small tight sun disk floating above the treeline, thin streaky clouds, little bloom"). Round 12's match critic wrote of the same place "The white sun is larger and higher, with conspicuous evenly spaced rays", and its surface critic called the rays a filter, so the last fix pass eased the sun's close glow and the disc's spill from 52 s (`3ce57f9`: the clipped patch round the sun fell from 4345 to 602 pixels, the approved has 5) and took the ray fan out of the clear sky (`93f69e8`). This round's critic reads the approved as "a large blooming sun sitting on the treeline with wide flare rays". Measured by the Builder: the sun stands 35 px higher than in the approved. What both rounds agree on is the height, the broken lit cloud banks and the warm haze over the left of the field; the size of the glow is contested between the two rounds and is logged as that.
- Copies in the field (R3 major and four jurors: "Identical-looking dark disks with similar pointed petal rings recur across the field"). Every neighbor has its own seed, height, lean and timing, and the far field is pictures and a carpet; at 58.5 s the heads are all fully open and face the lens, so what differs between them is small. The match critic adds that the approved's heads are "mostly turned toward the sun, dim and soft with depth falling off into haze".
- The specks (R4 severe: "drifting backlit pollen specks cut off along a razor-straight horizontal line in mid-air"). Round 12's motion critic saw the specks thin out and vanish by 56 s, and the fix pass made them stay until 55.0 to 58.0 s. The volume they live in was not widened, and from the crane its upper face crosses the sky. Not seen by the Builder before the round: the stills looked at were 1755 and the cut, both outside 1582 to 1647.
- The rim hairs (R4 severe: "single-pixel specular rim hairs blink up and down by 30 to 180 luminance on alternating frames"). The motion critic of the rain (round 20) names the same kind of shimmer as minor. From the crane a hair is far under a pixel wide; `kit/03-METHOD.md` orders the hairs folded into the surface's shading where the camera is far, and that fold does not hold the rim still yet.
- Color and grade (R1 severe: "a cleaner, greener, more saturated CG look with crisper contrast and a cooler blue sky"). The grades were set per world in Phase 4 and are brought together in Phase 5, step 1; this issue goes there first.
- The head's size. No critic named it in this round (round 12's match critic did). Measured by the Builder: the open head is about 200 px across where the approved's is about 300, with `plant.headDiameterM` fixed by the kit; the key at 58.5 s is fitted to the plant's place and height.

Nothing is declined.

## What happens to the open issues

The unit's loop ends here at its count (`maxRoundsPerUnit` 3), not at a pass, and no fix pass follows an extra round. `field` is marked `finished` with `round limit` on `47d93fd`: the build of the last judged round, which holds every fix of the two fix passes with the machine checks and M1 to M3 green. Every severe and major issue above stands under "Open items" in `kit/PROGRESS.md` with what was tried and what to try next. Phase 5 takes the camera items in its smoothing pass; Phase 6 works the rest, worst first, inside `polishMaxRounds` and the clock.
