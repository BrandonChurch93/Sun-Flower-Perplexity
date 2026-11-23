# The checks

Each check stands for one sentence of Brandon's. It is a command that prints what it measured and exits with 1 when the film breaks the rule.

| command | the sentence it stands for | draws | time on four cores without a graphics card |
| --- | --- | --- | --- |
| `npm run checks -- nights` | day and night pass while it grows, and no night lasts or flickers | reads `play` for the dusks | 5 s |
| `npm run checks -- holds` | in the frost and the storm the flower does not grow | 20 frames | 3 min |
| `npm run checks -- cues` | everything lands on the music | no | 1 s |
| `npm run checks -- play --stride 6` | draws the film small for `nights`, `cuts` and `made` | 1,432 frames | about 1 hour in three runs side by side |
| `npm run checks -- play` | the same, every frame | 3,810 frames | 2 to 3 hours |
| `npm run checks -- cuts` | no hard cuts | reads `play` | 1 min |
| `npm run checks -- made` | no frame rate drop at a scene change: nothing is made after loading, and a hold writes no more than 12 MB a frame | reads `play` | 1 s |
| `npm run checks -- writes` | what each owner writes to the graphics card a frame, at bars 21, 29, 35 and 61 | 8 frames | 4 min |
| `npm run checks -- pure` | any frame can be drawn alone and gives the same pixels | 42 frames | 5 min |
| `npm run checks -- all` | one line for each check | no, or `--draw` | 5 s |
| `npm run checks -- review` | the review page | `--draw` for the looks | 1 min |

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

A draft frame has one sample, so everything out of focus is blurred by the lens fill alone (`src/post/post.ts`), whose stipple follows the frame number: far things are a little sharper in some frames than in others. That is the draft, not the film, and each frame is still a function of its number (`pure` passes on them). It sets how fine these picture checks can be: `nights` allows a dusk to move 2 of 255 the wrong way (measured up to 1.5 on sky-0), and fails a step of more than 20 of 255 a frame (the steepest measured is 17.7).

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
| `made --hold-mb 40` against `made` | the limit itself: today's film writes 32 to 35 MB a frame in the holds |
| `play --break cut --at 1000 --from 984 --to 1016`, then `cuts --break cut --from 984 --to 1016` | the camera jumps to another place at frame 1000 |
| `play --break made --at 900 --from 890 --to 910`, then `made --break made --from 890 --to 910` | a texture and a program are made at frame 900 |
| `pure --break dice --frames 159,1429,2699,3651` | the camera turns by a throw of `Math.random` |
| `pure --break memory --frames 159,1429,2699,3651` | the camera turns by how many frames were drawn before |

## How the film is driven

`tools/checks/page/` is a page of its own that builds the real `Film` from `src/director/film.ts` at any size and reads `src/v2/counter.ts` round every frame. Nothing in it is a copy of the film. The faults live in that page and in `lib/film.ts`, never in `src/`.

For the picture proof of the holds the page turns on the film's own switch for the world at rest (`film.setStill`): no weather, no wind, one fixed sun. It draws the ground, the plant, the companion and the field from two fixed cameras and reads the numbers before the lens and the grain.

## The review page

`npm run checks -- review` writes `out/work/checks/review/index.html`: every look beside its reference, every section's clip, every check's result, and the whole film with a timeline in bars. It is built from what is in `out/` and says what is missing. It holds no audio. Its viewer picks the track from their own disk and the page plays it in step with the picture.
