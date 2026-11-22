# Round 20 · Phase 4 · `rain` · extra round

Judged commit `47d93fd` (engine `b9de284219d214c9`, unit hash `cdb9bfbbb4e44942`). Judged frame 420 (`rain`, 14.0 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Claude, R3 GPT, R4 Gemini. The jury was asked the judged frame, five jurors, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the votes on the control are round 10's, reused as the kit orders.

## Result

Not a pass. This was the third of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 17 to 21) | | | |
| M1, M2, M3 | pass, the third narrowly (M3 0.809 at `final`, 0.8 needed) | | | |
| R1 match (Claude) | 3 | 3 | 4 | 1 |
| R2 jury | passes on the edge: 2 of 5 votes on the judged frame were (a), a share of 0.40; 3 of 5 on the control, 0.60, and the gap of 0.20 is the largest the kit allows | | | |
| R3 surface and detail (GPT) | 6 | 0 | 4 | 0 |
| R4 motion (Gemini) | 9 (a pass at this critic) | 0 | 0 | 3 |

Jury: two jurors called the judged frame (a) with 50 and 76 ("cinematic production polish: fine backlit trichomes, volumetric rain, and controlled rim lighting"); three (e) with 67, 92 and 78, and all three name the grass: "The scattered grass tufts look like repeated low-poly meshes", "The angular, sparsely instanced grass tufts look like low-poly real-time props". The unit's jury over its three rounds: 0 of 5 in round 10, 1 of 5 in round 15, 2 of 5 here, against 3 of 5 on the approved image.

## Open issues, in the critics' words

1. R1 severe (set-A-01-b.png, whole plant). "different plant structure: a has a compact bushy crown of many broad leaves on short petioles with a curved, slender stem; b has a tall, straight, thick stem with fewer, sparser, droopier leaves arranged in widely spaced pairs and a narrow pointed apex reaching near the top frame edge. A viewer would not call them the same plant"
2. R1 severe (set-A-01-b.png, field behind the plant (left and right midground)). "a has dense rows of seedling plants filling the midground on both sides, glistening wet; b has mostly bare dark soil with a few sparse grass tufts and blurred tall plants only near the horizon"
3. R1 severe (set-A-01-b.png, foreground soil and water channel). "a has very dark, wet, clumpy tilled soil with specular highlights and a broad puddle with splashing droplets catching light at bottom center; b's soil is a smoother, lighter, dry-looking matte surface and the water is a narrow winding stream with no splashes"
4. R1 major (set-A-01-b.png, backlight / leaf edges (set-A-02 regions 1-3)). "a's leaves are rim-lit with a warm, soft glow from the bright horizon and show translucency; b has a cold, hard white fringe of hairs outlining every edge and the stem looks like a fuzzy, CG-shaded tube; leaf surfaces are flatter grey-green"
5. R1 major (set-A-01-b.png, horizon / far background (set-A-03 region 5)). "a has a visible tree line and rolling hills under a bright glowing cloud band, with clear atmospheric haze; b's horizon band is dimmer and narrower, the hills are a faint dark smear, and the bright glow sits lower and smaller behind the plant"
6. R1 major (set-A-01-b.png, sky (set-A-03 region 6)). "a's sky is a smooth, heavy, dark teal overcast with dense fine rain streaks; b's sky has distinct puffy, mottled cloud shapes with more blue-grey contrast and rain streaks that are larger, sparser, and more uniform"
7. R1 major (set-A-01-b.png, overall grade). "b is cooler and more desaturated blue-grey with lifted shadows in the soil; a has deeper blacks in the soil and a slight warm cast at the horizon"
8. R3 major (set-C-01.png, rain across the sky and field, especially the left half and the skyline). "The nearly parallel white streaks have a similar look in front of both the sky and the field, so much of the rain reads as a layer over the image rather than as depth in the scene."
9. R3 major (set-C-03.png, crops 7–8, large grass tuft at the left and smaller tufts behind it). "The grass blades are smooth, straight tapered strips with little surface detail, and the same upright fan shape recurs in the field."
10. R3 major (set-C-02.png, crop 6, where the main stem meets the soil). "The stem reads as a blunt cylinder set on top of a dark patch of mud. The soil does not visibly wrap around or obscure its lower edge."
11. R3 major (set-C-02.png, crops 3–4, front and backlit leaf margins). "Some margins have thick-looking triangular sawteeth, while the thin areas between veins stay dark and opaque even against the bright sky."

Minor issues: R1 1, R3 0, R4 3; they are in the cards.

## What was measured against the critics' words

- The motion critic gave 9 with no severe or major issue, the only critic of rounds 17 to 21 at the pass score (rounds 10 and 15 had 9 and 6 from theirs). Its three minor issues: dew glints on the dawn's grass that flip in the six frames before the cut (logged with the dawn's grass), rim hairs that shimmer by a pixel as the stem sways (logged with the field's rim hairs, where the same thing is severe), and a crop window of the pack that cuts the top leaf's tip, which is the harness's fixed window and not the film. One critic's 9 does not pass the unit: the match critic gave 3 and the surface critic 6.
- The plant's shape (R1 severe: "a has a compact bushy crown of many broad leaves on short petioles with a curved, slender stem; b has a tall, straight, thick stem with fewer, sparser, droopier leaves"). The fix passes moved the camera nearer and lower at 14 s so that the plant fills the approved's share of the frame (`d584dcb`) and let the leaves hang from shorter stalks (`90d11db`). The plant at 14.0 s is the film's plant at that age and its height is the kit's (`plant.heightM`); what can still move is where the leaves sit and how broad they are.
- The middle ground (R1 severe: "mostly bare dark soil with a few sparse grass tufts and blurred tall plants only near the horizon"). The rain's rows stand as low broad bushes under the horizon (`d562ab7`) with seedlings before them (`2468a86`); the approved has dense rows of young plants on both sides of the plant.
- The soil and the water (R1 severe: "b's soil is a smoother, lighter, dry-looking matte surface and the water is a narrow winding stream with no splashes"). The runnel gathers over 5.7 s (`dd127b9`) and the splashes were rebuilt twice (`4ae1105`, `c71eb8a`). A ruling of the fix pass keeps full splashes 0.3 m and more from the lens (`3e7aa7f`), so none stands at the bottom middle where the approved has one. The soil's wet tone was not darkened.
- The rain (R3 major: "much of the rain reads as a layer over the image rather than as depth in the scene"). Rounds 10 and 15 found the same in other words. The streaks were made thin, dim and tapered (`2132c25`) and the heavy near drops fade out past twice the focus distance (`e669a27`); the lens stays at f/9 by a ruling. Lighting the streaks from the bright band, the last rung of the ladder in `kit/04-LOOK.md` for this, was not built.
- The grass tufts (R3 major and three of five jurors). They are the one thing every (e) vote names. The tufts were darkened in the rain (`12adb0b`) and are otherwise the dawn's blades.

Nothing is declined.

## What happens to the open issues

The unit's loop ends here at its count (`maxRoundsPerUnit` 3), not at a pass, and no fix pass follows an extra round. `rain` is marked `finished` with `round limit` on `47d93fd`: the build of the last judged round, which holds every fix of the two fix passes with the machine checks and M1 to M3 green. Every severe and major issue above stands under "Open items" in `kit/PROGRESS.md` with what was tried and what to try next. Phase 5 takes the camera items in its smoothing pass; Phase 6 works the rest, worst first, inside `polishMaxRounds` and the clock.
