# The checks

Each check stands for one sentence of Brandon's. It is a command that prints what it measured and exits with 1 when the film breaks the rule.

`package.json` needs one line in `scripts`, which only the Builder may add:

```
"checks": "tsx tools/checks/run.ts"
```

Until it is there, `npx tsx tools/checks/run.ts <name>` is the same command.

| command | the sentence it stands for | draws | time on four cores without a graphics card |
| --- | --- | --- | --- |
| `npm run checks -- nights` | day and night pass while it grows, and no night lasts | no | 1 s |
| `npm run checks -- holds` | in the frost and the storm the flower does not grow | 20 frames | 3 min |
| `npm run checks -- cues` | everything lands on the music | no | 1 s |
| `npm run checks -- play` | draws the film small for `cuts` and `made` | 3,810 frames | 2 to 3 hours |
| `npm run checks -- cuts` | no hard cuts | reads `play` | 1 min |
| `npm run checks -- made` | no frame rate drop at a scene change: nothing is made after loading | reads `play` | 1 s |
| `npm run checks -- pure` | any frame can be drawn alone and gives the same pixels | 42 frames | 5 min |
| `npm run checks -- all` | one line for each check | no, or `--draw` | 5 s |
| `npm run checks -- review` | the review page | `--draw` for the looks | 1 min |

Results go to `out/work/checks/<check>.json`, pictures beside them, and the review page reads both.

## The long one

`play` draws every frame at 320 x 180 with one sample, after loading and warming as the film does, and keeps each picture and what each frame made on the graphics card. It runs in the background, writes its progress to `out/work/checks/play/film/progress-<from>-<to>.txt`, and carries on where it stopped. A change of the film throws its frames away.

```
npm run checks -- play --from 0 --to 1269 --first 4
npm run checks -- play --from 1270 --to 2539 --first 4
npm run checks -- play --from 2540 --to 3809 --first 4
```

`--first 4` draws every fourth frame first, then the frames round each section's first frame and each stroke of lightning, then the rest. So `cuts --every 4` and `made` have the whole film to judge after a quarter of the time. Each range loads and warms by itself, so a frame that makes anything is still caught. `--minutes 8` stops a run after eight minutes.

`cuts` and `made` take `--from` and `--to` as well and say PASS SO FAR while frames are missing.

## Breaking the film on purpose

A check that passes on a film that breaks its rule is worse than no check. `--break <name>` puts a broken film in the film's place. Each of these has to print FAIL and exit with 1. Its result is written beside the real one, never over it.

| command | what is broken |
| --- | --- |
| `nights --break long-night` | one night of nearly four seconds outside the holds |
| `holds --break hold-grows` | the plant's clock runs on through the frost hold |
| `holds --break hold-creeps` | the plant's clock creeps by a millionth a frame in the storm hold |
| `holds --break picture-grows` | the clock reads still and the plant grows all the same |
| `cues --break late` | every sunrise two frames late |
| `cues --break flash-late` | the lightning a beat late |
| `cues --break hold-short` | the frost hold ends a bar early |
| `play --break cut --at 1000 --from 970 --to 1030`, then `cuts --break cut --from 970 --to 1030` | the camera jumps to another place at frame 1000 |
| `play --break made --at 900 --from 880 --to 920`, then `made --break made --from 880 --to 920` | a texture and a program are made at frame 900 |
| `pure --break dice` | the camera turns by a throw of `Math.random` |
| `pure --break memory` | the camera turns by how many frames were drawn before |

## How the film is driven

`tools/checks/page/` is a page of its own that builds the real `Film` from `src/director/film.ts` at any size and reads `src/v2/counter.ts` round every frame. Nothing in it is a copy of the film. The faults live in that page and in `lib/film.ts`, never in `src/`.

For the picture proof of the holds the page pins the film's `now` and `later` so that the wind is at rest, no weather shows, and the sun and the clouds stand still. That is a stand-in for a switch on `Film`.

## The review page

`npm run checks -- review` writes `out/work/checks/review/index.html`: every look beside its reference, every section's clip, every check's result, and the whole film with a timeline in bars. It is built from what is in `out/` and says what is missing. It holds no audio. Its viewer picks the track from their own disk and the page plays it in step with the picture.
