# 07 · The quality bar

## The standard

Every key frame matches its approved image and reads as a frame from a top-budget film. The plant reads as alive at every age. Every cut reads as meant. The checks below test that from different sides.

Quality here is pursued hard and inside limits. Use every round a limit allows while something severe or major is open. When a limit is reached, log what is open and move on. `AGENTS.md` explains why.

## Three kinds of automated check

`npm run gate -- --phase N` runs what that phase needs and prints pass or fail for each. The kind of a check decides what a red result means.

### Machine checks

They test the code, not the picture. They are cheap and they run on the current build at the start of every round.

| Id | Check |
| --- | --- |
| G1 | `npm run build` exits clean with no type errors |
| G2 | Unit tests pass |
| G3 | `npm run determinism` passes: on one machine, a frame is pixel-identical across fresh page loads and when frames are rendered in a different order |
| G4 | Every still is exactly the size of its format. `info().frameCount` equals `film.fps` times `film.durationSeconds` |
| G5 | No interface element is visible in `capture`, `autopilot` or `export` output |
| G6 | The config passes startup validation, and every frame on the computed judged list is on the judged list in `kit/PROGRESS.md` |
| G7 | Platform fit. `formats.master` is within `platform.maxWidth` and `platform.maxHeight`. `film.fps` is within `platform.maxFps`. `export.bitrateMbps` is within `platform.maxBitrateMbps`. `film.durationSeconds` is within `platform.standardAccountMaxSeconds` |
| G8 | Every file under `public/assets/third-party/` has a row in `ASSETS.md`. Every generated file under `public/assets/` has a recipe in `assets-src/` |
| G9 | No tracked file is over `repo.maxFileMb` megabytes. The tracked files together are under `repo.maxTreeGb` gigabytes. No secret is tracked. `references/cache/` and `out/work/` are not tracked. Every file listed in `references/approved/MANIFEST.sha256` still has the hash listed there |
| G10 | The app requires no WebGL2 limit or extension outside the set recorded in Phase 0 |
| G11 | Memory. `info().textureMb` is at or under `assetSets.<set>.maxTextureMb` for both asset sets |
| G12 | Continuity. Across every cut, each camera and plant number from `state()` changes by no more than `continuity.maxStepRatio` times the larger of its changes over the frame before and the frame after |
| G13 | Stand-ins. No stand-in in `info().standIns` belongs to a unit that is marked `finished` in `kit/PROGRESS.md` |

- A red machine check is a bug. Fix it before critics see the round.
- If a machine check is still red after `quality.gateFixMaxAttempts` attempts in one round, or in one phase when no round is running, log it as a severe open item. A round goes on to the critics if frames can still be rendered, and ends there if they cannot. A phase goes on to its next step.
- G13 is the one exception. A stand-in is never logged away. A red G13 is fixed by finishing the part with its fallback from `kit/03-METHOD.md`, which always ends it.

### Measures

They put a number on the picture. They run in every round, for the unit that round is about.

| Id | Measure |
| --- | --- |
| M1 | Sanity. In each judged frame of the unit: the frame before lens and grade holds no invalid or infinite value, and from frame `film.hookSeconds` times `film.fps` onward the growing tip of the plant lies inside the frame, at least `detail.tipMarginFraction` of the frame from every edge, and inside the sharp zone |
| M2 | Texture detail. For each judged frame of the unit, in the `texels` view: among textured pixels inside the sharp zone, the share with fewer than `detail.minTexelsPerPixel` texels per screen pixel is at most `detail.maxSoftPixelFraction`. The sharp zone is where the blur circle is under `detail.focusCocPx` pixels. Not counted: the sky, and any surface drawn by a formula with no texture behind it. Measured in `formats.master` |
| M3 | Real sharpness. For each key frame of the unit: fine detail inside the sharp zone, measured as high frequency energy, is at least `detail.minSharpnessRatio` of the same measure on the sharpest matching region of the approved image at the same size |

- M2 counts texels, so a texture that was enlarged without gaining detail can pass it. M3 is there to catch that.
- A red measure is not a blocker. It is a severe issue in that round, beside the critics' issues, and it follows the same round limits.

### Deliverable checks

They test files that take long to make. They run only where `kit/08-BUILD-ORDER.md` names them, at the end of a phase.

| Id | Check | Checked at the end of |
| --- | --- | --- |
| D1 | `out/roughcut.mp4` exists with exactly `frameCount` frames at the `formats.preview` size | Phase 1 |
| D2 | `out/preview.mp4` exists and was rendered from the phase's final build. `ffprobe` reports `film.fps`, exactly `frameCount` frames and the `formats.preview` size. Its record holds the M1 result of every frame, and every frame that failed is logged as an open item. The file is under `repo.maxFileMb` megabytes | Phases 2, 5 and 6 |
| D3 | The Export proof exists from the phase's final build, as `kit/05-ARCHITECTURE.md` defines it, and its frames show no interface element | Phases 2 and 6 |

- A deliverable check that stays red after three tries is logged as a failed item and the phase goes on. In Phase 6 it is listed under "Failed QA items". It does not hold the build open.

## Freshness

- `kit/05-ARCHITECTURE.md` defines two hashes: one for the shared engine and one for each unit.
- In a round, the stills, sheets and measures for the unit being worked on come from the current build.
- When a unit is finished, its judged stills, comparison images and contact sheets are kept with their hashes. They are the unit's evidence. A later change to another unit does not make them stale.
- The plant, the ground and the field are shared, so a later change to them can change a finished unit. After such a change, render that unit's key stills again and look at them beside the kept ones. If they got worse, fix it. Do not run the unit's rounds again.
- Everything is rendered once more from the final build in Phase 6. The record round and the Phase 6 gate use only that.

## Judged frames

- The fixed list the critics score. It is computed, not chosen.
- The list: frame 0, the frame at `film.hookSeconds`, and the frame at the time of every key in `keys`.
- The list lives in `kit/PROGRESS.md` with the unit and the key of each frame.
- A unit's judged frames are the ones inside its segment.
- Judged stills are rendered at the `final` tier in `formats.master` with the `full` asset set.
- Frames can be added to the list. A frame is never removed.

## Packs

`npm run pack` builds what each critic receives.

- No image has a long edge over `critics.maxImageLongEdgePx`. A full frame is resized to fit. Fine detail is shown in native-size crops.
- A pack is never more than `critics.maxFilesPerMessage` files. Crops are tiled into labeled grids. A run of consecutive frames is one sheet. If a critic's material still does not fit, split it across two fresh critics with the same rubric and merge their answers.
- Same file format for every image. All metadata is stripped.
- Neutral file names, as `AGENTS.md` requires.
- Pack images are written under `out/work/`.
- A critic receives its files as attachments only. Never give a critic a path into the repo or the workspace.
- A key maps each neutral name to what it is. It is written outside every folder a critic can reach, and copied into the round folder only after every answer for the round is in.

## The critics

- Every critic is a fresh agent in every round.
- Each critic receives its pack, its own section of this file word for word, the severity scale below word for word, and the return format. Nothing else.
- R2 jurors receive only what their section says.
- Spread the critics and jurors across different model families. Rotate which family holds which role from round to round. If fewer families can see images than a role asks for, use every family there is, fill the rest with fresh agents on the same families, and log it.
- R1 and R3 to R7 each return one JSON object. The Builder writes the R2 scorecard from the jurors' answers.

```json
{
  "critic": "R3",
  "score": 7,
  "pass": false,
  "issues": [
    { "severity": "major", "file": "set-C-04.png", "where": "left edge of the upper leaf", "what": "the edge is a hard straight line with no thickness", "fix": "give the edge thickness and a slight curl" }
  ]
}
```

- `score` is 1 to 10. Issues are listed most severe first.

### The severity scale

Every critic uses this scale, so small things are not inflated.

- `severe`: a viewer would notice it in the playing video at normal speed.
- `major`: visible on a paused frame at delivery size. A native-size crop is delivery size.
- `minor`: visible only when zoomed past delivery size, or only by measuring against the target.

### R1 · Match

You are comparing pairs of images. In each pair, the file whose name ends in `-a` is the target. The file whose name ends in `-b` has to match it.

- Pack: for each key frame of the unit, the approved image as `-a` and the frame as `-b`, at the same size, plus a grid of matching native-size crops of each. If the key has lines under `settled` in the config, they are given with that pair, word for word, under the heading `Settled`.
- Compare region by region: what is in frame and how large, where the light comes from and its color, color and grade, contrast and depth of blacks, amount of fine detail, how out of focus areas look, the air between near and far, the sky and background.
- The plant in `-b` does not have to be leaf for leaf the plant in `-a`. A viewer shown both should call them the same plant in the same place, shot by the same camera a moment apart.
- A pair may come with lines headed `Settled`. Each names one difference between `-a` and `-b` that is intended. Do not list that difference as an issue and do not lower the score for it. Judge everything else in the pair as usual.
- List every region where `-b` falls short of `-a` as an issue. Say what is different and which way to move it.
- Score 10 when the pair is the same shot and `-b` has lost nothing.

### R2 · Film jury

One image per call, so no juror can compare images with each other.

- Judged images: the unit's judged frames. In the whole film rounds and the record round, every judged frame.
- Controls: the approved images of the same unit, resized, cropped and encoded exactly like the judged images.
- Each image goes to `quality.jury.jurors` jurors.
- A control's votes are collected once per unit and reused in later rounds of that unit. The whole film rounds and the record round reuse them too.
- Each call is a fresh agent that receives one image and exactly this text, nothing else:

> You will see one image. Which of these is it most likely to be? (a) a frame from a top-budget film, a AAA game cinematic or a cinema nature documentary, (b) a stock photograph, (c) a seed catalog or textbook picture, (d) amateur generated art, (e) a real-time web 3D demo. Answer with one letter, a confidence from 0 to 100, and the one thing that most influenced your answer.

Scoring:

- The control share is the share of all votes on the controls that were (a). The judged share is the same for the judged images.
- R2 passes when the judged share is no lower than the control share minus `quality.jury.maxShareGap`.
- The film is being held to the approved images, not to an absolute. If the jurors are hard on the controls, they will be as hard on the frames.
- A juror that does not answer is replaced once. If an image still has fewer than `quality.jury.jurors` minus one answers, R2 is logged as missing for that round and does not pass in it.
- What a juror wrote about a judged image is input for the next round. A failed R2 counts as one major issue.

### R3 · Surface and detail

You are told the images are computer generated.

- Pack: the unit's judged frames, and grids of native-size crops of every surface in them: leaves from the front and with light behind them, the stem and its hairs, the head or bud, petals, the soil, the grass, water or frost or dew where the unit has them, the near neighbors, the far background, the sky.
- Look for what gives a plant away as a model: plastic or waxy surfaces, a single flat green, leaves like flat cards, knife sharp edges, repeated leaves or petals, veins that are only painted on, no light passing through thin parts, missing hairs against the light, no contact shadow where the stem meets the soil.
- Look for what gives a scene away: soft or blurry areas inside the sharp zone, visible pixels, repeated patterns in soil or field, a visible line where detail changes, a background that reads as a flat picture, banding in gradients, halos round edges, jagged or shimmering edges, noisy out of focus areas, rain or fog that sits on top of the picture and not inside it.
- Look for anything that should not be there: text, a logo, a border, a person, an animal, an insect, a building, a stray object.
- Score 10 when every crop holds up at native size and nothing gives away how it was made.

### R4 · Motion

You are told the images are computer generated.

- Pack: one contact sheet across the unit's segment, one sheet of consecutive frames from a stretch where the plant changes fastest, and, where the unit begins with a cut, one sheet of consecutive frames across that cut. Sheets are rendered at the `review` tier or higher.
- Growth: it reads as real time-lapse. Leaves and petals unfold along their own paths. Nothing scales up from a point, fades in, pops or passes through anything. The plant is never perfectly still and never jittery.
- Camera: one smooth move with mass. No jump in position, direction, speed or lens. It never stops.
- Focus: it stays on the growing tip and never hunts.
- The cut: the plant, the grass and the horizon line up exactly across it. Only the world changes, and it changes completely in one frame.
- Weather: rain falls with weight and lands. Fog and mist drift. Wind moves each leaf on its own. Nothing loops visibly or freezes.
- Stability: no flicker, crawling noise or shimmer in fine things such as hairs, grass, far rows or stars.
- Score 10 when the unit reads as real footage of a growing plant.

### R4 blockout · Motion, Phase 2 only

You are told the images are an unfinished blockout with placeholder shapes and pictures.

- Pack: the whole film contact sheets made by `npm run sheet -- --film`, one sheet of consecutive frames across each cut, and each key frame beside its target image at the same size.
- Judge only: the camera move, what is in frame and how large at each key against its target, the pace of the growth, the rhythm of the cuts, and whether the plant and camera line up across each cut.
- Do not judge detail, materials, light or realism. None of it exists yet.
- Score 10 when the camera work and the timing could be finished as they are.

### R5 · The whole film

You are told nothing about how the images were made.

- Pack: the whole film contact sheets, and the key frames in order.
- Does it read as one film: one camera, one place, one plant?
- Does each world look clearly different from the one before it, so every cut lands?
- Is the plant the same plant from the first frame to the last, older each time?
- Does it build, does the bloom feel like the peak, and does the field land as the release?
- Score 10 when nothing breaks the feeling of one life in one move.

### R6 · Scroll stop

You are told nothing about how the images were made.

- Pack: frame 0 and frames across the first `film.hookSeconds` seconds, each resized to `critics.phonePreviewWidthPx` wide.
- Would this stop someone scrolling a feed with the sound off?
- Is it clear at this size what is happening in the first frame?
- Does something change inside the first `film.hookSeconds` seconds that rewards staying?
- Score 10 when the opening is striking at phone size with no sound and no caption.

### R7 · Compression

You are told the images are computer generated.

- Pack: stills taken from the stress encode beside the same frames before encoding, with grids of native-size crops.
- The stress encode is made by `npm run stress`, as `kit/05-ARCHITECTURE.md` describes.
- Look for banding in the night sky and the fog, blocks in haze and glow, rain that turns to noise, fine hairs and grass that turn to mush, and stars that vanish.
- Losing some of the finest grain is expected at this bitrate and is not an issue.
- Score 10 when the encoded frames show no banding or blocking and the surfaces still read as detailed.

## The pass bar

For a unit, all of these hold at once:

1. The machine checks are green.
2. The measures M1, M2 and M3 are green for the unit.
3. R1, R3 and R4 each score at least `quality.passScore`, with no severe or major issue open.
4. R2 passes.
5. Every judged still of the unit was rendered at the `final` tier.

For the blockout: R4 blockout scores at least `quality.blockoutPass` with no severe issue open. Framing and pace are settled for good later, with light and material.

For the whole film, in Phase 5:

1. The machine checks are green.
2. R5, R6 and R7 each score at least `quality.passScore`, with no severe or major issue open.
3. R2 passes on every judged frame.
4. R4, run on a pack of one sheet across each cut plus the whole film sheets, scores at least `quality.passScore` with no severe or major issue open.

## What to do with a critic's issues

- Fix causes, not symptoms. If a critic names an artifact, find what produces it.
- Never tune the picture to please one critic at the cost of another.
- The approved image and Brandon's stated choices outrank every critic. His choices are in `kit/01-FILM.md`: one smooth camera move, hard cuts, the plant never pausing, the order of the worlds, the field at the end. An issue that asks the film to move away from an approved image or from one of those is declined, with the reason, under "Declined issues" in `kit/PROGRESS.md`. So is an issue that only repeats a settled difference of that key: name the line. A settled line covers the one point it states and nothing near it. No other severe or major issue may be declined.
- If a fix would undo a change made for an earlier round, the issue is contested. Log it as an open item and do not change that thing again.
- Each phase judges only what that phase builds. If the blockout critic asks for detail, light or materials, log it as carried to the look lock and move on.

## Rounds and their limits

- One round: build, machine checks, measures, pack, critics, read every issue, fix, log, status, commit, push.
- A round is counted when it starts. Write its number and the commit it judges into `kit/PROGRESS.md` and push before doing anything else in it. Tick off each part of the round there as it finishes, and push each tick.
- `npm run pack` is deterministic: the same commit, round and unit always give the same files, the same neutral names and the same key. So a pack lost with `out/work/` is simply built again.
- Each critic's answer is written into `scorecards/round-NNN/` and pushed as soon as it arrives. The key is added there only after every answer for the round is in.
- A round that a task ending interrupted is carried on under the same number from the last part ticked off: the pack is rebuilt if it is gone, and only the critics whose answers are not in the repo are asked again. It is never counted twice and never started over.
- Each round writes `scorecards/round-NNN/`: the pack manifest, the key, the measures, each critic's JSON, the jurors' answers, and `SUMMARY.md` with the scores, the top issues and what changes next. Text files only.
- `kit/PROGRESS.md` gets one line per round.

| What | Limit | Key | Floor round |
| --- | --- | --- | --- |
| Blockout rounds in Phase 2 | per film | `quality.blockoutMaxRounds` | the first |
| Rounds on the look lock unit in Phase 3 | per unit | `quality.lookLockMaxRounds` | the first |
| Rounds on every other unit in Phase 4 | per unit | `quality.maxRoundsPerUnit` | the first |
| Rounds on a finished unit when an addendum or a note from Brandon asks for changes to it | per unit, per request | `quality.maxRoundsPerUnit` | none |
| Whole film rounds in Phase 5 | per film | `quality.wholeFilmMaxRounds` | the first |
| Polish rounds in Phase 6, and in each extension | per pass | `quality.polishMaxRounds` | none |
| Runs of the record round in Phase 6 | per film | `quality.recordRoundMaxRuns` | the first |
| Passes through the QA gauntlet in Phase 6 | per film | `quality.gauntletMaxPasses` | the first |
| Attempts to fix one machine check | per round, or per phase outside a round | `quality.gateFixMaxAttempts` | |
| Takes of one generated asset | per round, and per phase for assets made outside a round | `assets.maxTakesPerAsset` | |
| Photographs for one part of the reference board | once | `reference.photosPerPart` | |
| Searches for one part of the reference board | once | three | |
| Motion studies | once | `reference.motionStudies` | |
| Tries of a failing tool call | each time | `budget.toolRetryMax` | |
| Replacements of an agent that ran past its limit | per job | one | |
| Restarts of a job that ran past its limit | per job | one | |
| Replacements of a juror that did not answer | per image, per round | one | |
| Tries at a deliverable check | per phase | three | |

- A loop ends early only when its pass bar holds.
- An extra round starts only while its count and the clock allow, as `AGENTS.md` says.
- When a count or the clock ends a loop without a pass: keep the build from the unit's best judged round, plus later fixes only while the machine checks and measures stay green. Write every open severe and major issue under "Open items" in `kit/PROGRESS.md` with the frame, the critic's words, what was tried and what to try next. Mark the unit `finished` with the limit that ended it, and go on.
- Open items are worked again in Phase 6, worst first.
- Nothing in this kit loops without a limit in this table. If you find yourself repeating a step that is not in the table, stop after three tries, log it as an open item and go on.

## The plateau rule

- If the same issue survives `quality.plateauRounds` rounds in a row, change technique. Move to the next rung for that problem in the ladder in `kit/04-LOOK.md` and log which rung.
- When a problem's rungs are used up, it becomes an open item. It is never a blocker.

## The record round

- Run once in Phase 6, from the frozen build: the measures and every critic, R1 to R7, on the full judged list.
- Its scores are the final scores in `kit/PROGRESS.md` and in the `BUILD COMPLETE` block.
- It is a record. It is not followed by fixes. It runs again only when a QA gauntlet fix changed a pixel, and at most `quality.recordRoundMaxRuns` times in all.
