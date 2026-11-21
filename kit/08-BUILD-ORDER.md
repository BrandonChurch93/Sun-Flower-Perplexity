# 08 · Build order

Work the phases in order. A phase ends when every line of its gate is met and logged with evidence. Then commit, push, publish, post the status and start the next phase without waiting.

How a gate line is met:

- A line that asks for something to be published or pushed is met when it was done, or when the failure is logged. After Phase 0 neither one holds the build.
- A line that names a loop is met when its pass bar holds or its limit was reached. Reaching a limit means logging what is open.
- A line that names a machine check is met when the check is green, or when it has been logged as a severe open item after `quality.gateFixMaxAttempts` attempts. G13 is the exception: it is met only when it is green. A stand-in is ended with its fallback, as `kit/07-QUALITY-BAR.md` says, never logged.
- A line that names a deliverable check is met when it is green, or when it has been logged as a failed item after three tries.

Every loop below has a limit in `kit/07-QUALITY-BAR.md`. The clock rules and the budget report are in `AGENTS.md`. Post a status at least every `budget.statusMaxGapMinutes`, whatever step you are in.

## Before Phase 0, in every task

1. Check stop condition 1 in `AGENTS.md`: the reference images are approved.
2. Read `AGENTS.md` and `kit/00-README.md`.
3. Fetch and merge `repo.branch`. Read `kit/PROGRESS.md` and every file in `kit/addenda/`.
4. If `npm run clock` exists, run `npm run clock -- --start`.
5. Look at "Build" and "Budget" in `kit/PROGRESS.md`, in this order:
   - "Build" says `complete`: follow stop condition 4 in `AGENTS.md`.
   - "Build" says `extension N in progress`: carry that extension on from the step after "Extension step", as "Extensions" below describes. Skip the rest of this list.
   - "Budget" says `reported`: follow "The budget report" in `AGENTS.md`.
   - Otherwise tick the clock for the current phase. If it prints `budget report: due`, go straight to "The budget report" in `AGENTS.md`. Start nothing first.
6. Post the status that opens the task.
7. If a phase is already in progress, continue it. Never redo a phase marked `done`. Check "Rounds" for a round that was interrupted, "Running jobs" for jobs to pick up or restart, and "Running agents" for branches to fetch and work to hand to new agents.

## Phase 0 · Ground truth

Read first: `AGENTS.md`, `kit/00-README.md`, `kit/05-ARCHITECTURE.md`, `kit/06-ASSETS.md`, `config/showcase.json`.

Steps:

1. Write `in progress` under "Build" in `kit/PROGRESS.md` and push it to `repo.url`. If the push fails, retry once. If it still fails, stop as `AGENTS.md` says.
2. Create `package.json` at the repo root before installing anything.
3. Build `npm run clock` and `npm run look`. Run `npm run clock -- --start` and tick. From here on, every status and every poll ticks the clock.
4. Prove the inline display. Show `references/approved/contact-sheet.jpg` in the task thread so that it is visible without opening or downloading a file. `references/drafts/NOTES.md` says how the reference run did it. Record the method under "Tool record". If no method works, record that and follow the fallback rule in "Showing the work" in `AGENTS.md`. Post this as the first status.
5. Record the workspace: OS, cores, memory, disk, Node and npm versions, the browser and its exact version, the WebGL2 limits and extensions under software rendering, and which codec strings the browser can encode for `export.videoCodec`. Write the limits to `config/webgl-caps.json`.
6. Confirm `ffmpeg` and `ffprobe` run. If either is missing, install a static build through npm.
7. Test whether a detached process outlives a scripted step. Test whether a sandbox agent gets its own VM, can clone the repo, can return a video file as an attachment and can push a branch.
8. Measure the image limit: view a test image with fine numbered marks and find the longest edge that arrives without being downscaled. If it is smaller than `critics.maxImageLongEdgePx`, lower that key.
9. Record what you can call: the image models, the largest size each returns and how many reference images each accepts, any tool that turns a still into video, app hosting and the largest site it accepts, and the model families available for supporting agents and which of them can see images.
10. Verify current stable versions of the stack from each project's own documentation. Pin them.
11. Scaffold the app: config import and validation, seeded random, sampler, accumulator, the timeline with every segment and cut, the asset loader, the frame interface with `state()` and the stand-in list, `capture` mode.
12. Build the harness commands `still`, `determinism`, `gate`, `caps`, `budget`, `status` and `review`.
13. Build a spike scene: a simple plant with a stem and a few leaves that let light through, standing on textured ground under one sky, with bloom, depth of field from the lens samples, and accumulation at every tier.
14. Measure seconds per sample at each format, the fixed cost of starting a render, and the texture memory. Write the render budget table: the time for one judged still at the `final` tier, and the time for the whole film at each tier and format.
15. Publish the spike build with its review page. Record the URL in `kit/PROGRESS.md` and `README.md`.
16. Post a status with the spike still shown inline.

Statuses are due from step 4 on, at the rhythm in `AGENTS.md`, whatever step you are in.

Gate:

- A push has succeeded.
- G1, G2, G3, G4 and G10 are met on the spike.
- The workspace record, the tool record, the pinned versions and the render budget table are in `kit/PROGRESS.md`.
- The inline display method is recorded, or the log says none exists.
- The clock has ticks, and statuses have been posted since step 4.
- The app is published, or the log says why it could not be.

## Phase 1 · Rough cut

Read first: `kit/01-FILM.md`, the rough cut section of `kit/05-ARCHITECTURE.md`, `config/showcase.json`.

Steps:

1. Build `npm run animatic`.
2. Make `out/roughcut.mp4`.
3. Look at one frame from every segment and the frame each side of every cut. Confirm the order and the timing against `segments`.
4. Commit and push.
5. Run `npm run review` and publish, so the rough cut plays at `<url>/review.html`.
6. Post a status with two frames of it shown inline and the review page link. Say that the rough cut is made from the approved stills, that it exists so Brandon can judge the pacing, and that the build is continuing.
7. Continue without waiting. Pacing changes, if any, arrive later as an addendum or a note in the thread.

Gate:

- D1 is met.
- The rough cut is pushed, on the review page, and a status was posted.

## Phase 2 · Engine and blockout

Read first: `kit/01-FILM.md`, `kit/02-SUBJECT.md`, sections 6 to 8 of `kit/03-METHOD.md`, sections 3, 7 and 8 of `kit/04-LOOK.md`, `kit/05-ARCHITECTURE.md`, and the checks, judged frames, packs and R4 blockout sections of `kit/07-QUALITY-BAR.md`.

The whole film plays from first frame to last before anything is finished. Everything in this phase is a stand-in except the timing, the camera and the cuts.

Steps:

1. Build the shared engine: the director with the timeline and the cuts, the camera path through `camera.keys`, the lens with focus on the growing tip, the sampler, the lens and grade chain.
2. Build the stand-in plant as a real function of time that follows `plant.heightM` and `plant.stages`: a stem, simple leaves that appear in the right order, a simple bud and a head that opens. The shapes are simple. The timing is real.
3. Give every world a stand-in: a backdrop made from its approved image with the plant and any leaves of the companion painted out, a main light of the right color on the right side, and plain ground. No weather yet beyond a tint.
4. Build the stand-in field: simple plants in rows, the plant standing out in front of them, and the companion placed from `field.companion`.
5. Animate the whole film. At each key's time, frame the plant as its approved image does.
6. Build the `live`, `autopilot` and `export` modes and the menu.
7. Build the diagnostic views in `kit/04-LOOK.md` and the remaining harness commands.
8. Measure the render budget again on this scene and update the table.
9. Write `cut/SHOTS.md`: for every segment, the lens, the move, the start and end framing, where focus sits and what is in frame.
10. Write the judged frame list into `kit/PROGRESS.md`.
11. Run the first blockout round: machine checks, then R4 blockout. It is a floor round. If its pass bar does not hold, fix what it raised. Run a second round only if the count and the clock allow, up to `quality.blockoutMaxRounds`.
12. From the final build of this phase: render the blockout preview film at the `draft` tier, run `npm run proof`, run `npm run proof -- --memory`, then run `npm run keep`.
13. Publish and post the status with the whole film sheets.

While this phase runs, supporting agents may start gathering the reference board and the motion studies from `kit/06-ASSETS.md`.

Gate:

- G1 to G12 are met.
- R4 blockout scores at least `quality.blockoutPass` with no severe issue open, or its limit was reached.
- Every issue the blockout critic raised that is still open is under "Open items", marked as carried to the phase that will settle it.
- The judged frame list is in `kit/PROGRESS.md`.
- D2 and D3 are met. `out/preview.mp4` is committed.
- The app plays the whole film in `autopilot`, from the published URL, or from a local copy if publishing is not available here.

## Phase 3 · The look lock

Read first: `kit/02-SUBJECT.md`, `kit/03-METHOD.md`, `kit/04-LOOK.md`, `kit/06-ASSETS.md`, `kit/07-QUALITY-BAR.md`, `references/BRIEF.md`.

Prove every technique on one unit before spreading it across the film. The unit is `lookLockUnit` in the config: `bloom`. It shows more of the plant than any other, and its last key is the frame the film exists for.

Steps:

1. Finish the reference board and the motion studies, as `kit/06-ASSETS.md` describes. Supporting agents gather the parts in parallel. This is done once.
2. Build the plant at final quality, with agents working in parallel on the subfolders of `src/plant/`: stem, leaves, hairs, bud and bracts, the head with every floret, the petals, and the surface with light passing through. Growth works from the first frame of the film to the last. Everything the `bloom` frames show is finished. The seedling stages may stay simple here. The `dawn` unit finishes them.
3. Build the `golden` world: the sky, the far background in layers, the sun and its flare, haze, pollen, wind, and the near neighbors out of focus. That includes the companion, with its leaves at the left edge of the two `bloom` key frames.
4. Fit the camera at the two `bloom` keys to their approved images and smooth the path.
5. Set the lens, tone curve, grade, bloom and grain against the `bloom-hero` image. These become the film's defaults.
6. Measure the render budget and the texture memory and update the table.
7. Send `bloom` to its first round as soon as nothing its frames show is a stand-in. Then run rounds with the measures and R1, R2, R3 and R4 on its judged frames until the pass bar holds, `quality.lookLockMaxRounds` is reached, or the clock ends the loop.
8. From the final build of this phase: `npm run clip -- --unit bloom --tier review`, `npm run compare` for both keys, then `npm run keep -- --clips`.
9. Write "Look lock" in `kit/PROGRESS.md`: every locked setting, each technique that worked and each that did not, so the other five units start from what `bloom` taught.
10. Run `npm run review` and publish.
11. Run `npm run gate -- --phase 3`, check every line of the gate below and log the evidence. Mark `bloom` `finished` in the "Units" table with the commit and what ended its loop, mark Phase 3 `done`, push, and post the status with both comparison images.

Gate:

- The machine checks are met, with G13 covering `bloom`.
- The pass bar holds for `bloom`, or its limit was reached.
- `out/stills/compare-bloom-opening.jpg` and `out/stills/compare-bloom-hero.jpg` are committed.
- The `bloom` clip is under `out/clips/`, and on the review page if publishing is available here.

## Phase 4 · The other units

Read first: `kit/02-SUBJECT.md`, `kit/03-METHOD.md`, `kit/04-LOOK.md`, `kit/06-ASSETS.md`, `kit/07-QUALITY-BAR.md`, the "Look lock" section of `kit/PROGRESS.md`, and every file in `kit/addenda/`.

Finish the units in the order of `buildOrderAfterLookLock` in the config. Start them all at once with supporting agents. You integrate each unit, run its checks and its critics, and decide when it is finished.

Each agent owns these folders and nothing else. Everything not listed belongs to you. Change the split if the work calls for it, and log it.

| Unit | Its agent owns |
| --- | --- |
| `dawn` | `src/units/dawn/`, `src/worlds/dawn/`, `src/plant/seedling/`, `src/ground/` except its `puddles/` and `frost/` subfolders, `src/weather/mist/`, `src/plant/surface/dew/` |
| `field` | `src/units/field/`, `src/field/` |
| `rain` | `src/units/rain/`, `src/worlds/rain/`, `src/weather/rain/`, `src/ground/puddles/`, `src/plant/surface/wet/` |
| `night` | `src/units/night/`, `src/worlds/night/` |
| `frost` | `src/units/frost/`, `src/worlds/frost/`, `src/weather/fog/`, `src/weather/frost/`, `src/ground/frost/`, `src/plant/surface/frost/` |

Each agent also owns the matching folders under `public/assets/` and `assets-src/`.

For each unit:

1. Finish its world: sky, far background, light, air, the state of the ground, and its weather.
2. Finish everything its frames show of the plant, the ground and the field.
3. Fit the camera at its keys to the approved images, keeping the whole path smooth.
4. Send it to its first round as soon as nothing its frames show is a stand-in. Then run rounds with the measures and R1, R2, R3 and R4 on its judged frames until the pass bar holds, `quality.maxRoundsPerUnit` is reached, or the clock ends the loop.
5. From the unit's final build: `npm run clip -- --unit <id> --tier review`, `npm run compare` for each of its keys, `npm run keep -- --clips`.
6. Mark the unit `finished` in the "Units" table of `kit/PROGRESS.md` with the commit and what ended its loop.
7. Commit, push, run `npm run review`, publish and post the status for that unit with its comparison images.

Clock rules 3 and 4 in `AGENTS.md` apply to every unit here. Once the clock prints `half point: reached`, a unit with no stand-in left goes to its round at once. Once it prints `box end: reached`, whatever is still a stand-in is finished with its fallback and its unit goes to its round.

Gate:

- The machine checks are met, with G13 covering all six units.
- Every unit is marked `finished`: its pass bar held, or its limit was reached.
- Eight comparison images are committed, one per key, each from the build its unit was finished on.
- Every unit's clip is under `out/clips/`, and on the review page if publishing is available here.

## Phase 5 · The whole film

Read first: the cuts, camera and light sections of `kit/01-FILM.md`, sections 6 to 8 of `kit/03-METHOD.md`, `kit/04-LOOK.md`, `kit/07-QUALITY-BAR.md`.

Steps:

1. Watch the whole film contact sheets. Bring the five grades into one film without flattening the differences that make each cut land.
2. Check every cut with the test in section 6 of `kit/03-METHOD.md` and fix any that does not line up.
3. Check that the plant is one plant from the first frame to the last. After any change to shared code, check each finished unit as "Freshness" in `kit/07-QUALITY-BAR.md` says.
4. Give the camera path one last smoothing pass across the whole film, then check every key still frames its approved image.
5. Build `npm run stress` if it is not built, and run it.
6. Measure the render budget again and update the table.
7. Run the first whole film round: R5, R6 and R7, R2 on every judged frame, and R4 on the cuts pack. It is a floor round. Run more only while the count and the clock allow, up to `quality.wholeFilmMaxRounds`.
8. From the final build of this phase: render the preview film at the `draft` tier with the units split across sandbox agents, run `npm run keep`, run `npm run review`, publish and post the status.

Gate:

- The machine checks are met.
- The whole film pass bar holds, or its limit was reached.
- D2 is met. `out/preview.mp4` is committed.

## Phase 6 · Polish and deliver

Read first: "Open items" in `kit/PROGRESS.md`, `kit/05-ARCHITECTURE.md`, `kit/07-QUALITY-BAR.md`, `kit/09-QA-GAUNTLET.md`.

Steps:

1. Work the open items, worst first, for up to `quality.polishMaxRounds` rounds. Every polish round is an extra round: start one only while the clock allows. In each round fix a batch, then run the measures and the critics that raised those issues on the frames they touch, and R4 on any segment whose motion changed.
2. Freeze the build. From here on, nothing under `src/`, `public/` or `config/` changes except to fix a machine check or a failed QA item.
3. Render every judged still and every comparison image from the frozen build.
4. Run the record round, as `kit/07-QUALITY-BAR.md` defines it. Write the scores into `kit/PROGRESS.md` as the final scores.
5. Render the film once in `formats.master`, one chunk per unit, with the units split across sandbox agents, at the highest tier whose wall-clock time the render budget says fits in `sandbox.previewFilmMaxHours`, and never below `draft`. If even `draft` does not fit in `formats.master`, render in `formats.preview` at `draft` and log it.
6. Cut the six clips from those chunks with `npm run clip`. Make `out/preview.mp4` with `npm run film -- --format preview --from-master`. If `deliver.sandboxMaster` is true, also join the chunks into the master file and share it in the final message.
7. Run `npm run keep -- --clips`.
8. Run `npm run proof` and `npm run proof -- --memory` on the frozen build.
9. Write `cut/CUES.md`.
10. Write `README.md`: what this is, the app URL, how to play with it, how to export the film and a single clip, where the comparison images and scorecards are, and any credit the post must carry.
11. Run `npm run review` and publish the final build.
12. Run every item in `kit/09-QA-GAUNTLET.md` and record the evidence. If an item fails, fix it, do step 13, and only then run the gauntlet again, for at most `quality.gauntletMaxPasses` passes in all.
13. If a fix in step 12 changed anything under `src/`, `public/` or `config/`: run `npm run proof` again, render the judged stills of the units it touched again, run `npm run compare` for their keys, run `npm run keep`, and run the record round again, for at most `quality.recordRoundMaxRuns` runs in all. If the fix changed what the film shows, render the affected chunks again, once, remake the affected clips and the preview film from them, then run `npm run keep -- --clips`, `npm run review` and publish.
14. Write `complete` under "Build" and the filled-in `BUILD COMPLETE` block under "Last report block" in `kit/PROGRESS.md`. Commit and push.

Gate:

- The machine checks are met.
- D2 and D3 are met.
- Every item in `kit/09-QA-GAUNTLET.md` has its evidence in `kit/PROGRESS.md`. An item that still fails after the last pass is listed under "Failed QA items" with what was tried.

## BUILD COMPLETE

When the Phase 6 gate is met, end the task with exactly this block, filled in, and show the `bloom-hero` and `field` comparison images inline above it:

```
BUILD COMPLETE
Review page: <url>/review.html
Watch it: <url>?mode=autopilot
Play with it: <url>
Export: <url>?mode=export
Preview film: out/preview.mp4
Clips: out/clips/
Side by side: out/stills/
Scorecards: scorecards/
Time used: <hours> of <hours allowed>
Rounds run: <number>
Units: <for each of the six: passed, or the limit that ended it>
Final scores: R1 <lowest key and its score>, R2 <pass or fail>, R3 <lowest>, R4 <lowest>, R5 <n>, R6 <n>, R7 <n>
Open items: <list with the unit and frame of each, or "none">
Declined issues: <list with the reason for each, or "none">
Failed QA items: <list, or "none">
Parts finished with a fallback: <list, or "none">
What I would improve next: <one to three lines>
```

## BUDGET REPORT

When "The budget report" in `AGENTS.md` applies, end the task with exactly this block, filled in, and show up to `status.maxPictures` pictures of the current film inline above it: the whole film sheets, and the newest comparison image.

```
BUDGET REPORT
Time used: <hours> of <hours allowed>
Review page: <url>/review.html
Watch what exists: <url>?mode=autopilot
Phase: <current phase and step>
Phases done: <list>
Units: <for each of the six: finished and how, in progress and its last scores, or not started>
Still to do: <every remaining phase and step, in order, with the floor work marked>
Open items so far: <count, and the worst three>
Credits used so far: <the figure, if this workspace shows one, or "not shown here">
What I would do next: <one to three lines>
To continue: send the continue prompt from kit/10-KICKOFF.md
```

## Extensions

An extension is one more polish pass Brandon asks for after completion. It starts when a task's prompt contains the line `Extension.` and "Build" says `complete`. It carries on when a task starts and "Build" says `extension N in progress`.

After each step below, write its number under "Extension step" in `kit/PROGRESS.md` and push. A task that carries an extension on starts at the step after that number and never repeats a finished one.

1. Write `extension N in progress` under "Build" in `kit/PROGRESS.md`, where N is one more than "Extensions", and push. Tick the clock with `--extension N`. Statuses in an extension tick with `--extension N` too.
2. Unfreeze. Run up to `quality.polishMaxRounds` polish rounds, worst open item first, as Phase 6 step 1 describes. Start a round only while the extension's clock prints `extra rounds: yes`.
3. Freeze the build.
4. Render every judged still and every comparison image from the frozen build.
5. Run the record round once.
6. Do Phase 6 steps 5 to 11 once: the film, the clips, the proofs, the cues, the README, the review page and the publish.
7. Run the QA gauntlet once. An item that fails is fixed if the fix changes no pixel. Otherwise it is listed under "Failed QA items". There is no second pass and no second record round in an extension.
8. Add one to "Extensions", clear "Extension step", write `complete` under "Build" and the new block under "Last report block", commit, push, and end with the `BUILD COMPLETE` block.

An extension has no budget report. When its clock prints `extra rounds: no`, finish the one fix in hand and go to step 3.
