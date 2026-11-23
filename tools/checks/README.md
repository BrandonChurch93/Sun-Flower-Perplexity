# The checks

Each check stands for one sentence of Brandon's. It is a command that prints what it measured and exits with 1 when the film breaks the rule.

| command | the sentence it stands for | draws | time on four cores without a graphics card |
| --- | --- | --- | --- |
| `npm run checks -- nights` | day and night pass while it grows, and no night lasts or flickers | reads `play` for the dusks | 5 s |
| `npm run checks -- holds` | in the frost and the storm the flower does not grow | 20 frames | 4 to 6 min |
| `npm run checks -- cues` | everything lands on the music | no | 1 s |
| `npm run checks -- play --stride 6` | draws the film small for `nights`, `cuts` and `made` | 1,432 frames | about 1 hour in three runs side by side |
| `npm run checks -- play` | the same, every frame | 3,810 frames | 2 to 3 hours |
| `npm run checks -- cuts` | no hard cuts: the edges of the picture stay where they are from one frame to the next | reads `play` | 10 to 40 s |
| `npm run checks -- made` | no frame rate drop at a scene change: nothing is made after loading, a vertex array included, which is made when something is drawn for the first time; each frame that made something is listed with what it made by the counter's own names, and for a vertex array or a program `tools/made-where.mts` draws the first six such frames again and names the program and the first draw (`--no-where` leaves that out); what a hold writes is reported against a goal of 12 MB a frame | reads `play` | 2 s, some minutes more when something was made |
| `npm run checks -- script` | no frame rate drop: the page's own script time in a frame, by part, inside the limits of `tools/checks/limits.json` | 13 windows of frames in a row, about 490 frames | about 30 min, 17 min with --frames 20; run it alone |
| `npm run checks -- film` | the whole film small in one go: `play` on three pages, then `nights`, `cuts` and `made` in one table | 1,432 frames | 80 to 100 min |
| `npm run checks -- writes` | what each owner writes to the graphics card a frame, at bars 21, 29, 35 and 61 | 8 frames | 4 min |
| `npm run checks -- pure` | any frame can be drawn alone and gives the same pixels: drawn in order, again backwards, and on a fresh page that has warmed as the film does before it plays (the first page draws without warming, so the warming may leave nothing behind that changes a pixel) | 42 frames and the warming | 12 to 15 min |
| `npm run checks -- all` | one line for each check | no, or `--draw` | 5 s |
| `npm run checks -- review` | the review page | `--draw` for the looks | 1 min |

`npm run checks` alone, or `npm run -s checks -- --help`, prints this table with what each check needs.

Results go to `out/work/checks/<check>.json`, pictures beside them, and the review page reads both.

## The long one

`play` draws frames at 320 x 180 with one sample, after loading and warming as the film does, and keeps each picture and what each frame made on the graphics card. It runs in the background, writes its progress to `out/work/checks/play/film/progress-<from>-<to>.txt`, and carries on where it stopped. A change of the film throws its frames away.

```
npm run checks -- play --stride 6 --from 0 --to 1269
npm run checks -- play --stride 6 --from 1270 --to 2539
npm run checks -- play --stride 6 --from 2540 --to 3809
```

`--stride 6` is the review round, 1,432 of the 3,810 frames: first every frame of each dusk, night and dawn (735), then every sixth frame (512), then every frame within 12 of a bar line that carries a cue (185): a section's first bar, a stroke of lightning, a sunrise. Without `--stride` every frame is drawn. Each range loads and warms by itself, so a frame that makes anything is still caught. `--minutes 8` stops a run after eight minutes.

`cuts --stride 6` and `made --stride 6` judge that round and say PASS SO FAR while frames are missing. Where every frame is drawn a cut is found between neighbours. On the stride it is found between frames six apart, so a jump smaller than about four times what the film moves in six frames is not caught there: the every frame zones round the cues are where a cut is expected, and the full drawing is the proof for the rest.

A draft frame has one sample, so everything out of focus is blurred by the lens fill alone (`src/post/post.ts`), whose stipple follows the frame number: far things are a little sharper in some frames than in others. That is the draft, not the film, and each frame is still a function of its number (`pure` passes on them). It sets how fine these picture checks can be: `nights` allows a dusk to move 2 of 255 the wrong way (measured up to 1.5 on sky-0), and fails a step of more than 14 of 255 a frame (the Builder's limit; before the sun was slowed at the horizon the steepest measured was 17.7 on sky-0 and 27.6 on sky-b).

## The page's own time

`script` draws frames in a row, as the film plays them, and reads after each one the film's own laps (`film.cost`, the same numbers `window.showcase.cost()` gives): the milliseconds of script by part, with the time the drawing itself takes left out. The first frame of a window comes after a jump and is not counted. The limits are in `tools/checks/limits.json` and nowhere else: the mean of a window, the worst frame, a mean for each named group of parts, one mean for every other part, the windows, and how long a window is with `--all`. Change a number there and run `npm run checks -- script --table`: nothing is drawn again.

A window that is measured is kept in `out/work/checks/script/film/` until the film changes, so the check runs in parts: `--window 2070-2110`, `--frames 8` for the first 8 counted frames of each window (a quick look, marked "not whole"), `--all` for the whole film in windows drawn one after the other without a jump, `--again` to measure again. It prints one row a window (mean, worst, the worst frame, the three largest parts there, what is over its limit, PASS or FAIL), writes `out/work/checks/script.json` and exits with 1 on FAIL.

The numbers are wall time on this machine, so the check has to run alone: another page drawing or a build beside it makes every number larger. It says so in its first line, counts the browsers that are already drawing when a run begins, marks what it measures beside them "not alone" and is then not complete.

Besides the level it names every hitch: a frame over 25 ms that is also over three times the median of the sixteen frames around it, with its parts. That is the stutter a viewer sees whatever the level, and the rule is the one of `tools/costs.ts`.

The film waits for the drawing at the end of every frame (`stage.finish()`, the lap `wait`, which is not in the number), and the check starts the next frame only after that. The browser still shows the canvas afterwards, and on a machine that draws on the processor the first call of the next frame that needs room can wait for it, in whichever lap issues that call. So a frame over ten times the frames around it, in which nothing was made, is drawn once more after a pause, in a row with the two frames before it. Slow again, it is the film's and stays a hitch. Else the second number is judged, the first is kept beside it in the window's file (`first`, `firstLap`), and the frame is listed under "the graphics process was behind".

The windows under `first` in the limit file (840-880, 1250-1290, 1660-1700, 2070-2110) hold the frames where a hold starts or ends, the worst frames found so far (860, 1260, 1665, 2083, where the boom of the music lands). They are measured whole in every run, whatever `--window` or `--frames` says, and printed first.

## The whole film in one go

`film` draws what a round of stride 6 still needs on three pages side by side (`--pages`), then runs `nights`, `cuts --stride 6` and `made --stride 6` and prints one table: a row for every night and a row for every day between two nights, with the frames drawn, the largest fall and rise of the frame's mean, the mean and the part that move the wrong way, the largest move of the edges, the hard cuts, the frames that made something, and a verdict. It carries on where it stopped, so it can be started again after a stop. `--stride 1` draws and judges every frame. `--no-draw` prints the table of what is there. Start it in the background and send its output to a file: it runs longer than a sandbox step.

## The plant alone, and what may brighten it

`nights --plant` knows three kinds of frame, by the film's dials. Dry (frost and wet under 0.02): the plant's mean may not rise by more than 0.5 of 255 between drawn frames on the way to midnight, and its mean and 90th percentile at midnight may not be above the handover's. Wet (the wet dial, which is how wet the plant is, at 0.02 or more): from one frame to the next the mean may rise by at most 1.5 of 255 and the 90th percentile by at most 2, and every frame of such a dusk or dawn is drawn. Under rime (the frost dial at 0.02 or more): left out, rime may brighten the plant. The table has a column for the frames left out and two for the wet ones, and a dusk or dawn with nothing left to judge reads "left out", not "ok".

## The holds, to the frame

A hold begins on the frame that holds its first bar line and growth resumes on the frame that holds its last, so the last still frame is the one before it: Frost 849 to 1259, Storm 1672 to 2082. A frame is still when the plant's clock reads the hold's value at the open shutter and at its close. `holds` and `cues` fail a hold that is a frame short or a frame long.

## Breaking the film on purpose

A check that passes on a film that breaks its rule is worse than no check. `--break <name>` puts a broken film in the film's place. Each of these has to print FAIL and exit with 1. Its result is written beside the real one, never over it. `npm run checks -- proof` runs the quick ones, reads the last run of the ones that draw, and prints which were caught.

| command | what is broken |
| --- | --- |
| `nights --break long-night` | one night of nearly four seconds outside the holds |
| `holds --break hold-grows` | the plant's clock runs on through the storm hold |
| `holds --break hold-creeps` | the plant's clock creeps a little every frame of the frost hold |
| `holds --break picture-grows` | the clock reads still and the plant grows all the same |
| `cues --break late` | every sunrise two frames late |
| `cues --break flash-late` | the lightning a beat late |
| `cues --break hold-short` | the frost hold ends half a bar early |
| `cues --break hold-early` | the frost hold ends one frame early |
| `cues --break hold-late` | the frost hold ends one frame late |
| `cues --break cut-late` | the first cut the film means listed one frame after its downbeat |
| `nights --break picture-quick` | every dusk and dawn three times as fast |
| `nights --break picture-bounce` | two frames of each dusk the wrong way round |
| `nights --break picture-blink` | eight parts in the middle of the frame at half their light for one frame of each night: the whole frame passes, the part fails |
| `nights --break moon-blink` | the moon's disc at the level of the sky round it for the one frame where it stands highest in each night |
| `nights --plant --break plant-moon --night 6,7` | the moon 2.4 times as strong, so the plant alone brightens toward midnight |
| `nights --plant --break plant-wet --night 9` | the moon steps up to 2.4 times as strong half way from the handover to midnight in the wet dusk of night 9, when the dusk's own fall no longer hides it: over the limit for a wet plant |
| `script --break slow-frame` | the film with its sky alone, which passes; then one frame whose field takes 40 ms longer: the worst frame fails, the mean of the sum passes |
| `script --break slow-part` | the same film with 4 ms more in the field's turn of every frame: the field's share fails, the sum and the worst frame pass |
| `made --strict` | the goal for the holds as a rule: a film that writes more than 12 MB a frame in a hold fails |
| `play --break cut --at 1000 --from 984 --to 1016`, then `cuts --break cut --from 984 --to 1016` | the camera jumps to another place at frame 1000 |
| `cuts --break cut --from 984 --to 1016 --meant 1001` | the same broken film with a cut listed one frame beside its jump: the listed frame is left out and the jump at 1000 is still a hard cut. With `--meant 1000` it is left out, and said so. With `--meant 990` the list names a frame where the film does not cut: that fails too |
| `play --break made --at 900 --from 890 --to 910`, then `made --break made --from 890 --to 910` | a texture and a program are made at frame 900 |
| `play --break first-draw --at 900 --from 890 --to 910`, then `made --break first-draw --from 890 --to 910` | a mesh is drawn for the first time at frame 900, its geometry and material already drawn on others: only a vertex array is made |
| `pure --break dice --frames 159,1429,2699,3651` | the camera turns by a throw of `Math.random` |
| `pure --break memory --frames 159,1429,2699,3651` | the camera turns by how many frames were drawn before |

## How the film is driven

`tools/checks/page/` is a page of its own that builds the real `Film` from `src/director/film.ts` at any size and reads `src/v2/counter.ts` round every frame. Nothing in it is a copy of the film. The faults live in that page and in `lib/film.ts`, never in `src/`.

For the picture proof of the holds the page turns on the film's own switch for the world at rest (`film.setStill`): no weather, no wind, one fixed sun. It draws the ground, the plant, the companion and the field from two fixed cameras and reads the numbers before the lens and the grain.

## The review page

`npm run checks -- review` writes `out/work/checks/review/index.html`: every look beside its reference, every section's clip, every check's result, and the whole film with a timeline in bars. It is built from what is in `out/` and says what is missing. It holds no audio. Its viewer picks the track from their own disk and the page plays it in step with the picture.

In a round of stride 6 most frames are not drawn, and the film on the page stands the last drawn frame in for them. The line under the film names the picture: `frame 1728` when that frame is drawn, `frame 1728 is not drawn: the picture is frame 1547` when it is not. Stretches of more than half a second without a drawn frame are hatched on the timeline.

## What a cut is

`cuts` does not read brightness. It reads where the edges of the picture lie: the slopes of the luminance on a grid of 80 x 45, with the brightest 2 percent of the frame held down so that a sun's disc is not an edge, in the upper half of the frame and in the lower half apart. Between two frames the edges of a half move 0 when they lie where they lay and about 1 when the two have nothing in common. A step is a hard cut when either half moves more than 0.5 and more than 4 times the median of the 12 steps round it. A half without edges (a clear night sky) has no say, and the frames of a stroke of lightning, which the film's own clock names, are listed and not judged.

Measured: a camera put elsewhere at frame 1000 moves both halves 1.0 (50 times the steps round it). The rising sun behind the plant's top leaf for two frames (frames 1372 and 1373 of the film at b587656), which took 26 of 255 off the whole frame, moves the sky half 0.20 and the land half 0.08: not a cut. A whole frame shifted sideways by 8 of 320 pixels moves the land half 0.6 to 1.0, by 4 pixels 0.3 to 0.6, so a jump of the camera under about 2 percent of the frame's width is not caught. In the film the largest step measured so far outside a fault is 0.33.

The step of the brightness is listed beside it and judges nothing in `cuts`. `nights` holds every dusk and dawn to a step of the frame's mean of at most 14 of 255 a frame and to no more than 2 of 255 the wrong way (`--step` for another limit). It also cuts the frame into 16 by 9 parts and lists the largest move the wrong way in any one part, and how many parts move the wrong way in one frame: the mean of the whole frame hides a plant that goes dark between the sun's light and the night's while the sky round it fades as it should. A part may move the wrong way by at most 8 of 255 a frame: wider than the limit for the whole frame, because a plant that grows across a part moves it too.

The moon may not blink. `nights` works out where the film's camera puts the moon in each frame of a night (`lib/moon.ts`, as the film works out its camera, nothing drawn), takes the mean of the nine brightest pixels within four pixels of that place as the disc and the median of a ring six to ten pixels out as the sky round it, and judges the disc less the ring. Between the first and the last frame at which that level is at half its peak, the disc and its level may not both fall and come back by more than 12 of 255 inside any five frames: the smaller of the two falls is the one judged. The dusk fading, or a veil that lifts disc and sky alike, moves the disc and not its level. A sky that brightens for a frame behind a steady disc moves the level and not the disc: it is listed under the moon as not the moon's blink, and the parts of the frame judge it (measured on the film at c6b1997, night 13: the level fell 22.5 at frame 2581 with the disc rising from 178 to 217 and the sky round it going 40, 98, 78). A cloud's edge that takes the disc alone out of the picture does, and counts: beside every fail stands how far the ring moved in the same frame, so the reader sees whether the disc changed alone or something crossed disc and sky. On a steady moon the measure itself moves by 4 to 6 of 255 from frame to frame (the disc is four pixels across at 320 wide). A night in which the disc never stands 20 over its ring is listed as not judged: the moon is out of the frame or behind cloud all night.

`nights --plant` draws the plant with nothing else in the frame, from the frame where the sun hands the light over to the moon (the sun 5 degrees under) to midnight, on both sides of each night, at 640 x 360, every second frame (`--every 1` for every frame, `--night 6,7` for some nights). It measures the mean and the 90th percentile of the luminance over the pixels the plant covers. Toward midnight the mean may not rise by more than half a level of 255 between drawn frames, and at midnight neither the mean nor the 90th percentile may be above the handover's. `nights` without `--plant` reads the last drawing and says when it is from an older film.

## The cuts the film means

The film may cut hard on the frames the Builder lists in `tools/checks/limits.json` under `cuts`, and nowhere else. The list is not read from the film, so the film cannot excuse a cut of its own. Exactly those frames are left out, each printed with what was measured there:

- `cuts` does not judge the step into a listed frame and does not count it among the steps round its neighbours. It prints how far the edges moved there.
- `nights` does not judge the step into a listed frame by the step of the frame's mean nor by its direction.
- `cuts` fails when the film does not cut on a listed frame: a list the film does not follow hides nothing, and a cut one frame beside a listed one is a hard cut.
- `cues` holds each listed frame to the frame that holds a downbeat (`hitFrame` of a whole bar), and a cue of the sheet that says cut to a listed frame. `cues --break cut-late` lists the first cut one frame late and must fail.
- `play --stride 6` and `film` draw every frame within 12 of a listed frame, as round every cue.
- `script` measures a window of 10 frames either side of each listed frame whole in every run, and fails when the cut's own frame is a long frame or makes anything: a cut must cost nothing. The hitch rule leaves no frame out.
