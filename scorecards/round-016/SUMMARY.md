# Round 16 · Phase 4 · `night` · extra round

Judged commit `921385e` (engine `6a3e309f0b524dd3`, unit hash `4de8199e57bacb0b`). Judged frame 780 (`night`, 26.0 s) at the `final` tier. Every critic and juror was a fresh agent that saw only its pack files and its own section of `kit/07-QUALITY-BAR.md`. The answers are in this folder word for word: `R1.json`, `R3.json`, `R4.json`, `R2-JURORS.md` with the tally in `R2.json`. `MANIFEST-R1.md` to `MANIFEST-R4.md` are what each critic was told about its files, `MEASURES.json` holds M1 to M3, and `KEY.json`, which says which file was which, was added after the last answer.

Families: R1 Gemini, R3 Claude, R4 GPT. The jury was asked the judged frame, five jurors, one from each of five families (GPT, Gemini, Claude, GLM, Grok); the votes on the control are round 11's, reused as the kit orders.

## Result

Not a pass. This was the second of at most three rounds of the unit's loop (`maxRoundsPerUnit` 3). The bar is 9 from each of R1, R3 and R4 with no severe or major issue open, R2 passing, the machine checks and M1 to M3 green.

| Check | Result | Severe | Major | Minor |
| --- | --- | --- | --- | --- |
| Machine checks | 13 of 13 green (one run on the judged commit for rounds 12 to 16) | | | |
| M1, M2, M3 | M1 and M2 pass, M3 red: 0.797 at `final`, 0.8 needed. A red measure is a severe issue of the round, beside the critics' issues | | | |
| R1 match (Gemini) | 4 | 3 | 3 | 0 |
| R2 jury | passes exactly on the edge: 3 of 5 votes on the judged frame were (a), a share of 0.60; 4 of 5 on the control, 0.80; the rule asks for no less than the control share minus 0.20 | | | |
| R3 surface and detail (Claude) | 6 | 0 | 4 | 3 |
| R4 motion (GPT) | 7 | 0 | 3 | 0 |

Jury: three jurors called the judged frame (a) with 81, 60 and 76, each naming the rim light on the stem's hairs ("The finely controlled rim lighting picks out individual hairs on the stem against the night sky"); one (e) with 82 ("the faceted low-poly leaf and field silhouettes combined with a Fresnel rim-light shader and procedural Milky Way skybox"), one (b) with 76 ("isolated rim-lit plant composited on a Milky Way plate in a commercial postcard frame").

## Open issues, in the critics' words

1. R1 severe (set-A-02.png, region 4 and lower third across the field in set-A-01-b.png). "the three distinct neighbor sunflower stalks on the left and the structured midground plants across the field are missing, replaced by a low, blurry black silhouette mass with no discernible buds, leaves, green color, or rim light"
2. R1 severe (set-A-03.png, region 5 and full horizon skyline in set-A-01-b.png). "the wooded hills on both the left and right are much lower and flatter than in -a, a bright uniform fog band extends all the way across the right horizon where -a is dark, and a broad washed-out glow brightens the sky above the left hills"
3. R1 severe (set-A-01-b.png, main foreground plant and bud (regions 1 to 3 in set-A-02.png)). "the hero plant does not read as the same plant: the stem is too thin and bare along the upper-left side, the large lower leaves at the bottom of the frame and front-facing heart-shaped upper leaf are missing, and the bud is a small spiky black ball lacking its wide collar of pointed bracts"
4. R1 major (set-A-02.png, region 2 · the stem and its hairs). "the stem body is crushed to flat black while spiky white hairs are rim-lit along both left and right edges, whereas -a has directional cool light from the left illuminating the left side of the green stem cylinder and softer fine hairs"
5. R1 major (set-A-02.png, regions 1 and 3 leaf surfaces, and upper-left leaf tip in set-A-03.png region 5). "leaves lack surface veining, wet sheen, and edge dew droplets (including the hanging water drop in region 5), and most leaves are opaque black silhouettes except for one isolated bright translucent green patch on a mid-left leaf"
6. R1 major (set-A-03.png, region 6 · the sky and mid-left sky in set-A-02.png region 2). "stars are sparser, dimmer, and softer than in -a, the Milky Way dust clouds lose fine granular stellar detail, and the mid-left sky shifts slightly brighter and more teal"
7. R3 major (set-C-02.png, crops 2, 5 and 6, the star field against the treeline and the field). "the depth of field does not add up. The stars are pin sharp, but the treeline and the mist band nearer the lens are heavily blurred. Stars are at infinity and should be at least as soft as the treeline, so the sky reads as a sharp photo pasted behind a blurred plate"
8. R3 major (set-C-02.png, crops 2 and 4, the lower left leaf pair). "the two lower left leaves merge into one pinched hourglass shape with no clear petiole or join, and a green glow sits only at its lower left with no light source to account for it. At native size it reads as a broken mesh or bad compositing"
9. R3 major (set-C-02.png, crop 4, the leaves with the light behind them). "the backlit leaves are solid, opaque dark shapes. No light passes through the blades, and the veins and margins do not glow, so the leaves read as thick cards"
10. R3 major (set-C-02.png, crops 1, 2 and 4, the hairs along the stem, petioles and leaf edges). "the rim hairs are uniformly bright white and evenly spaced, at the same length and brightness all round the silhouette, including the side away from any light. They read as a procedural fringe or an edge glow, and in a night scene with no visible moon they are too bright for their light source"
11. R4 major (set-D-03.png, stem tip, f0750–f0759 (25.00–25.30 s)). "The bud swells out of the tip as a single rounded cap. Its individual points do not visibly separate until after the cap has formed."
12. R4 major (set-D-04.png, broad leaves and nearby grass, f0594–f0599 (19.80–19.97 s)). "Rain streaks cross the leaf faces and foreground grass without discernible impacts, runoff, or small leaf responses where they meet."
13. R4 major (set-D-03.png, backlit rim at the stem tip, f0750–f0754 (25.00–25.13 s)). "A short row of bright points snaps on along the tip rim, then dims within a few frames, making the fine edge shimmer at native size."

Minor issues: R1 0, R3 3, R4 0; they are in the cards.

## What was measured against the critics' words

- The red M3. Between rounds 11 and 16 the night's lens opened from f/16 to f/8 and the night's light changed. A strip of frame 780 at f/8, f/11 and f/16 read 0.999, 1.025 and 1.040 at `review`; the Builder chose f/11, where the single plants behind the hero and the softness of the rows are nearest the approved. On the line's head `43a42f6` the measure at `final` is green: M3 0.828, read by the night world's agent, the same frame 0.935 at `review` (so `review` reads about 1.13 times `final` here, not the fifth noted at 21:05 UTC). The margin is thin. Grain was measured against the approved in six flat boxes and is already level with it or above, so none was added to lift the number.
- The hills. Round 11's match critic asked for low soft tree covered hills, round 16's says "the wooded hills on both the left and right are much lower and flatter than in -a". The approved image decided: the top of the wooded hills is read from the night's take in every column and lies within 7 px of the approved's at ten columns (`f354e70`); the hills keep their height and only their tone meets the two cuts (`6e1fbbc`).
- The stars against the tree line (R3: "Stars are at infinity and should be at least as soft as the treeline"). The tree line is drawn no more blurred than the sky, since the approved image shows the tree tops as clear shapes under sharp stars.
- The bud. The plant alone carries a shut bud on the tip from 20.5 to 24.2 s, each bract lets go at its own moment into a wide crown by 26 s, and no ring of bright points snaps on at frames 750 to 754 (`2d0362b`); the single tall point at the bud's middle was one long leafy bract and is shortened (`83f7e0e`).
- The crop. In the night's own frames the rows keep a third of the moon and of the sky (`1c5400b`): the box x 1400 to 1900, y 840 to 900 falls from a median of 15,28,25 to 12,22,21 against the approved's 7,13,16. Still lighter than the approved, with tops near the hill line.
- The skin. A dewed blade at night passes the even sky and no direct moon, so no black cards and no patch with a shadow edge (`aeaccc7`). By the builders' own stills at 780 the plant stands closer than the approved (the kit sets that), the bud is small, and the leaves are lit green across their faces where the approved's are near black with a cold rim: open.

Nothing is declined.

## What happens to the open issues

The last fix pass ran from 21:34 to 23:25 UTC on the line `phase4/integrate`. Each owning agent had the critics' and jurors' words on its part, word for word, and an order ranked by severity (`out/work/briefs/round-012-016-notes/`). A piece went on the line only when its author's own still at `review` showed it right beside the approved image, with frames 1350, 1515 and 1559 of the finished bloom shown byte identical. For the night that was: the lens at f/11, the sky and its hills, the moon, the bud, the leaves under the bud, the dark crop. The unit's third and last round (`maxRoundsPerUnit` 3) is cut together with the other four open units' at 23:35 UTC from that line, if `npm run clock` then prints `extra rounds: yes`. What is still open after it goes under "Open items" in `kit/PROGRESS.md`.
