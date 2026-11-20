# 09 · QA gauntlet

Run every item at the end of Phase 6. Record the evidence for each in `kit/PROGRESS.md`.

- If an item fails, fix it and run the gauntlet again, for at most `quality.gauntletMaxPasses` passes in all.
- An item that still fails after the last pass is listed under "Failed QA items" in `kit/PROGRESS.md` and in the `BUILD COMPLETE` block, with what was tried. The build then completes. It does not loop.
- An open item from a round limit does not fail the gauntlet. A missing record of it does.

## The film

| No. | Item | Evidence |
| --- | --- | --- |
| 1 | Frame 0 is a finished picture with no fade in, and the soil has visibly moved by frame 5 | The two stills |
| 2 | By the frame at `film.hookSeconds` the seedling has broken the surface | The still |
| 3 | Every segment in `segments` appears, in order, showing what `kit/01-FILM.md` lists for it | The whole film contact sheets |
| 4 | Each cut happens on its exact frame. The frame before is entirely the old world and the frame after is entirely the new one | The stills each side of every cut |
| 5 | The plant and the camera line up across every cut | The G12 result and an overlay of the two frames for each cut |
| 6 | No people, animals, insects, buildings, text, logo or interface in any frame | Contact sheets and the R3 results |
| 7 | The camera never stops and never jumps | A plot of camera speed over the film from `state()`, and the R4 results |
| 8 | The plant's height never falls, and it does not hold still before the bloom is complete | A plot of height over the film from `state()` |
| 9 | The last frame is a finished picture of the field with at least `field.minPlantsInView` plants in view | The still and the count reported by the field code |
| 10 | Each clip starts and ends on the frames of its segment | `ffprobe` frame counts against the counts computed from `segments` |

## The picture

| No. | Item | Evidence |
| --- | --- | --- |
| 11 | The record round ran the measures and every critic on the full judged list from the frozen build | The record round `SUMMARY.md` and the hashes |
| 12 | Every key has a comparison image from the final build | File list with records |
| 13 | No stand-in is left. `info().standIns` is empty on the frozen build, and the `standins` view of every judged frame shows none. If one is found, finish it with its fallback before going on | The output and the stills |
| 14 | Every judged still in the record round was rendered at the `final` tier | The records |
| 15 | Every open item is logged with its unit, its frame, the critic's words and what was tried | "Open items" in `kit/PROGRESS.md` |
| 16 | Every declined issue is logged with its reason, and every part finished with a fallback is listed | "Declined issues" and "Open items" in `kit/PROGRESS.md` |
| 17 | The stress encode was judged | The R7 result |

## The machine

| No. | Item | Evidence |
| --- | --- | --- |
| 18 | The machine checks and the deliverable checks D2 and D3 are green | `npm run gate -- --phase 6` output |
| 19 | A clean clone on the same machine builds and renders frame 0 identically | Hash of frame 0 from a fresh clone against the same frame from the working copy |
| 20 | `src/` takes frame rate, duration, formats, tiers, worlds, segments, keys, thresholds and names only from `src/config.ts` | Search of `src/` for those values, with every hit explained |
| 21 | No `Math.random`, `Date.now` or `performance.now` on any path that affects a pixel | Search output with each remaining use explained |
| 22 | The Export proof exists and `ffprobe` accepts the file | `ffprobe` output |
| 23 | `export` mode shows the check frame beside the kept still before it starts, shows progress and time remaining, and the memory test stayed at or under the limit | A still of the export page and the log of the memory test |
| 24 | `npm run build` output works from a subfolder path | A still rendered from `dist/` served under a subfolder |
| 25 | The app plays the film in `autopilot` and scrubs in `live`. Use the published URL. If its sign-in blocks the harness, use the same `dist/` served locally and say so | A still captured at three different times |

## The repo

| No. | Item | Evidence |
| --- | --- | --- |
| 26 | `ASSETS.md` lists every third-party file, and every generated asset has a recipe | G8 result |
| 27 | Nothing under `references/approved/` has changed | G9 result |
| 28 | `cut/SHOTS.md` and `cut/CUES.md` are committed and match the final timings | File list and a check against `segments` |
| 29 | `out/roughcut.mp4`, `out/preview.mp4`, six clips in `out/clips/` and `out/stills/` are committed | File list |
| 30 | Every round has a folder in `scorecards/` | File list |
| 31 | `README.md` has the app URL, how to play with it, how to export, and any credit the post must carry, with no em dashes and no model names | The file |
| 32 | `kit/CLOCK.json` is committed and `kit/PROGRESS.md` shows the time used in every phase | The files |
| 33 | Everything is pushed | `git status` and `git log origin/main -1` |
