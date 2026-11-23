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
| `npm run checks -- made` | no frame rate drop at a scene change: nothing is made after loading; what a hold writes is reported against a goal of 12 MB a frame | reads `play` | 2 s |
| `npm run checks -- writes` | what each owner writes to the graphics card a frame, at bars 21, 29, 35 and 61 | 8 frames | 4 min |
| `npm run checks -- pure` | any frame can be drawn alone and gives the same pixels | 42 frames | 10 to 12 min |
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
| `nights --break picture-quick` | every dusk and dawn three times as fast |
| `nights --break picture-bounce` | two frames of each dusk the wrong way round |
| `nights --break picture-blink` | eight parts in the middle of the frame at half their light for one frame of each night: the whole frame passes, the part fails |
| `made --strict` | the goal for the holds as a rule: a film that writes more than 12 MB a frame in a hold fails |
| `play --break cut --at 1000 --from 984 --to 1016`, then `cuts --break cut --from 984 --to 1016` | the camera jumps to another place at frame 1000 |
| `play --break made --at 900 --from 890 --to 910`, then `made --break made --from 890 --to 910` | a texture and a program are made at frame 900 |
| `pure --break dice --frames 159,1429,2699,3651` | the camera turns by a throw of `Math.random` |
| `pure --break memory --frames 159,1429,2699,3651` | the camera turns by how many frames were drawn before |

## How the film is driven

`tools/checks/page/` is a page of its own that builds the real `Film` from `src/director/film.ts` at any size and reads `src/v2/counter.ts` round every frame. Nothing in it is a copy of the film. The faults live in that page and in `lib/film.ts`, never in `src/`.

For the picture proof of the holds the page turns on the film's own switch for the world at rest (`film.setStill`): no weather, no wind, one fixed sun. It draws the ground, the plant, the companion and the field from two fixed cameras and reads the numbers before the lens and the grain.

## The review page

`npm run checks -- review` writes `out/work/checks/review/index.html`: every look beside its reference, every section's clip, every check's result, and the whole film with a timeline in bars. It is built from what is in `out/` and says what is missing. It holds no audio. Its viewer picks the track from their own disk and the page plays it in step with the picture.

## What a cut is

`cuts` does not read brightness. It reads where the edges of the picture lie: the slopes of the luminance on a grid of 80 x 45, with the brightest 2 percent of the frame held down so that a sun's disc is not an edge, in the upper half of the frame and in the lower half apart. Between two frames the edges of a half move 0 when they lie where they lay and about 1 when the two have nothing in common. A step is a hard cut when either half moves more than 0.5 and more than 4 times the median of the 12 steps round it. A half without edges (a clear night sky) has no say, and the frames of a stroke of lightning, which the film's own clock names, are listed and not judged.

Measured: a camera put elsewhere at frame 1000 moves both halves 1.0 (50 times the steps round it). The rising sun behind the plant's top leaf for two frames (frames 1372 and 1373 of the film at b587656), which took 26 of 255 off the whole frame, moves the sky half 0.20 and the land half 0.08: not a cut. A whole frame shifted sideways by 8 of 320 pixels moves the land half 0.6 to 1.0, by 4 pixels 0.3 to 0.6, so a jump of the camera under about 2 percent of the frame's width is not caught. In the film the largest step measured so far outside a fault is 0.33.

The step of the brightness is listed beside it and judges nothing in `cuts`. `nights` holds every dusk and dawn to a step of the frame's mean of at most 14 of 255 a frame and to no more than 2 of 255 the wrong way (`--step` for another limit). It also cuts the frame into 16 by 9 parts and lists the largest move the wrong way in any one part, and how many parts move the wrong way in one frame: the mean of the whole frame hides a plant that goes dark between the sun's light and the night's while the sky round it fades as it should. A part may move the wrong way by at most 8 of 255 a frame: wider than the limit for the whole frame, because a plant that grows across a part moves it too.
