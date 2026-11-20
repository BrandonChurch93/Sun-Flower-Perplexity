# 05 · Architecture

## Stack

- Vite, TypeScript strict, three.js on WebGL2, GSAP for easing.
- Vitest for unit tests.
- A headless browser driver for the harness. Use the one that works with the browser already in this workspace, and pin that browser's version.
- An MP4 muxer library for Export.
- `ffmpeg` and `ffprobe` for films and checks.
- Verify the current stable version of each from its own documentation in Phase 0. Pin the versions and record them in `kit/PROGRESS.md`.
- One render path: three.js `WebGLRenderer` on WebGL2, in every mode, on every machine. No WebGPU path and no path tracer. The critics judge frames rendered in software here, and the master is exported later on a GPU. Both must run the same shader code.

## Folders

```
config/showcase.json     every number, the worlds, the timeline, the keys
src/
  main.ts
  config.ts              typed import of the config, validated at startup
  core/                  renderer, accumulator, sampler, seeded random, tiers, asset loader
  director/              timeline, cuts, camera path, modes, menu
  plant/                 the sunflower as a function of time
    stem/  leaves/  seedling/  head/  hairs/  surface/
  ground/                soil, grass, dew, puddles, the emergence
  field/                 the neighbors, their kinds of detail, the far field
  weather/               shared rain, splash, mist, fog, frost, dust and wind code
  worlds/<id>/           one folder per world: its sky, light, air, ground state and weather settings
  units/<id>/            one folder per unit: its camera fit and anything only its frames need
  post/                  lens, tone curve, grade, bloom, grain, dither
  capture/               frame interface, Export
  diagnostics/           the views listed in kit/04-LOOK.md
public/assets/
  plant/                 the plant's maps, in web/ and full/
  ground/                the ground's maps, in web/ and full/
  worlds/<id>/           that world's sky and far background, in web/ and full/
  third-party/           every file the Builder neither made nor generated
assets-src/<owner>/      the recipe for every generated asset: RECIPE.md, text only
tools/                   harness scripts
tests/
references/              approved/, drafts/, BRIEF.md, BOARD.md. cache/ is ignored by git
scorecards/              one folder per round, text only
cut/                     SHOTS.md, CUES.md
out/                     stills/, clips/, preview.mp4, roughcut.mp4, committed through the harness. work/ holds every other harness output and is ignored by git
```

One owner per folder. `src/plant/` is split into its subfolders so several agents can work on the plant at once.

## The config

- `src/config.ts` imports `config/showcase.json`, validates it and exports it typed.
- No other file contains a number, an id, a time or an approved image path that the config holds.
- Startup fails loudly if a key is missing, if the segments do not start at 0, if they have gaps or overlaps, if any segment boundary or key time is not on a whole frame, if the last segment does not end at `film.durationSeconds`, if a key's time lies outside its unit's segment, if `budget.phaseHours` does not add up to `budget.runHours`, or if an approved image is missing.
- A cut is every segment boundary where the `world` changes. The list of cuts is computed, never typed.

## Determinism

A frame is a pure function of its frame index, the format, the tier, the asset set and the config.

- No `Math.random`, `Date.now` or `performance.now` in anything that affects a pixel.
- All randomness comes from one seeded generator built from `seed`, with a named stream per system.
- Time is the frame index divided by `film.fps`.
- The plant, the camera and every weather effect are closed-form functions of time. Nothing is stepped from an earlier frame.
- Rendering frame N after frame M gives the same image as rendering frame N on a fresh page load.
- This holds exactly on one machine. Software rendering can differ by a hair between machines with different processors. Before frames from two VMs are joined in one film, render the same frame on both and require a PSNR of at least `quality.crossMachineMinPsnr`.

## Samples

- A frame is the average of `tiers.<tier>.samplesPerFrame` samples. Each sample is jittered inside the pixel, placed at its own moment inside the shutter set by `film.shutterDegrees`, and placed at its own point on the lens opening.
- Accumulate in linear floating point. Run the lens and grade stage once, after accumulation.
- Sample sequences are low discrepancy and seeded, so a frame is the same every time.
- The world of a frame is chosen by the frame's own time. Every sample of that frame uses that world. The plant and the camera are evaluated at each sample's own moment. So a frame next to a cut is never a mix of two worlds.
- In the `night` world the stars are drawn at the middle of the shutter, so they stay points.

## Worlds and memory

- A world is one set of sky, far background, light, air and ground state. The plant, the ground and the field are shared by every world.
- In `capture` and `export`, everything a frame needs is in memory before it is rendered. The call resolves when the frame is done, however long loading took.
- All worlds are loaded before frame 0 when the total, with mipmaps, fits `assetSets.<set>.maxTextureMb`. If it does not fit in this workspace, the loader keeps the current world and the next one, frees a world after its last frame, and logs that it did.
- Once a texture is uploaded, its decoded source image is released.
- `autopilot`: if the next world is not ready when its first frame is due, the timeline waits on the last complete frame. It never shows a missing asset.
- A stand-in is never silent. Every system that is still a placeholder adds its name to the stand-in list in `info()`, with the units whose frames show it. A part finished with its fallback is not a stand-in. It is logged as an open item.

## The frame interface

The page exposes one object on `window`:

```ts
interface Showcase {
  ready: Promise<void>
  info(): { frameCount: number; fps: number; format: string; tier: string; assets: string; engineHash: string; unitHashes: Record<string, string>; standIns: { name: string; units: string[] }[]; textureMb: number; versions: Record<string, string> }
  state(frameIndex: number): { camera: number[]; plant: number[]; world: string }
  setFormat(id: string): Promise<void>
  setAssets(id: string): Promise<void>
  setDiagnostic(view: string): void
  renderFrame(frameIndex: number, tier: string): Promise<void>
}
```

- `renderFrame` loads what the frame needs, renders every sample the tier asks for, and leaves the finished frame on the canvas.
- `frameCount` is `film.fps` times `film.durationSeconds`. The film is frame indices 0 to `frameCount - 1`.
- `state` returns the numbers that place the camera and pose the plant at a frame, without rendering. The continuity check uses it.
- If one frame at the `final` tier does not fit in `sandbox.chunkBudgetMinutes` in this workspace, add calls that split a frame's samples across steps, and prove with `npm run determinism` that a split frame is pixel-identical to an unsplit one.

## Modes

Set by URL: `?mode=`, with `format`, `tier`, `assets`, `frame`, `first`, `last`, `unit` and `diag` as optional parameters.

| Mode | What it does |
| --- | --- |
| `live` | Brandon plays with it. Drag to orbit the plant. Scrub the timeline to grow it and shrink it. A menu on the `M` key jumps to any unit or key, holds any world at any age, and switches mode, format, tier, asset set and diagnostic |
| `autopilot` | Plays the film in real time with a clean frame, for a screen recording. `unit=<id>` plays only that unit's clip |
| `capture` | Renders nothing until asked through the frame interface. The harness uses this |
| `export` | Renders and encodes the film on this machine. See below |

- `live` is the default. It opens on the first frame.
- No interface pixel ever appears in `capture`, `autopilot` or `export` output.
- `assets` defaults to `web` in `live` and `autopilot`, and to `full` in `capture` and `export`.

## Hashes and records

- The engine hash covers everything under `src/` except `src/worlds/` and `src/units/`, everything under `public/assets/plant/`, `public/assets/ground/` and `public/assets/third-party/`, `config/`, and the package lock file.
- A unit's hash covers `src/units/<id>/`, the folder of its world under `src/worlds/`, and that world's folder under `public/assets/worlds/`.
- Every harness output has a record beside it: the engine hash, the hashes of the units it shows, the format, the tier, the asset set, the diagnostic, the browser version and the machine it was rendered on.
- A command reuses an existing output only when its record matches the current state. Otherwise it renders again.
- Commits that touch only logs, scorecards or kit files change no hash.
- `kit/07-QUALITY-BAR.md` says when an output has to be fresh.

## The harness

Scripts in `tools/`, run through npm.

| Command | Output |
| --- | --- |
| `npm run build` | The static site in `dist/` |
| `npm run caps` | The WebGL2 limits and extensions of this machine, written to `config/webgl-caps.json` |
| `npm run budget` | Seconds per sample and per frame at each format and tier on the current scene, and the time the whole film would take |
| `npm run clock` | The clock. See below |
| `npm run animatic` | The rough cut: `out/roughcut.mp4`. See below |
| `npm run still -- --frame N --tier T --format F --assets A --diag V` | One still in `out/work/stills/` |
| `npm run sheet -- --unit ID --tier T --format F` | A contact sheet of `critics.contactSheetFrames` frames across the unit's segment. `--film` gives sheets across the whole film. `--cut N` gives one sheet of consecutive frames across cut number N |
| `npm run seq -- --first N --last M --tier T` | Every frame from N to M as separate stills |
| `npm run crops -- --frame N --tier T --format F` | Grids of native-size crops, each grid with a long edge of at most `critics.maxImageLongEdgePx`, covering every surface and every area of interest in the frame |
| `npm run compare -- --key ID` | A comparison image named `compare-<key>.jpg`: the approved image beside the key frame at the same size, and under them matching native-size crops of each |
| `npm run film -- --tier T --format F --assets A` | The film as `out/work/film-F-T.mp4`, encoded at `previewFilm.bitrateMbps` in `formats.preview` and at `export.bitrateMbps` in any other format. Takes `--first` and `--last`. `--unit ID` renders one unit's chunk. `--join` joins the chunks that exist. `--from-master` makes the `formats.preview` film by scaling down a `formats.master` film of the same build |
| `npm run clip -- --unit ID --tier T` | That unit's clip in `formats.master` as `out/work/clips/<unit>.mp4`. It joins matching chunks if they exist and renders them if they do not |
| `npm run measure -- --unit ID` | The measures M1, M2 and M3 for that unit, as `kit/07-QUALITY-BAR.md` defines them |
| `npm run stress` | For each unit in `quality.stress.units`: `quality.stress.seconds` of film at `formats.master` and the `quality.stress.tier` tier, encoded at `export.bitrateMbps`, then encoded again at `quality.compressionStressMbps`, with stills from both |
| `npm run pack -- --phase N --round R --unit ID` | The critic packs for a round, as `kit/07-QUALITY-BAR.md` describes |
| `npm run look -- --add FILE --caption TEXT --by NAME` | Adds a picture to the look log. See "Looks and status" |
| `npm run status -- --phase N --unit ID` | The status pictures and the gallery. See "Looks and status" |
| `npm run keep` | Copies into `out/stills/` the judged stills, comparison images and contact sheets of the unit or phase just finished, and the newest `formats.preview` film whose record matches the current build to `out/preview.mp4`, each with its record. With `--clips` it also copies clips to `out/clips/<unit>.mp4` |
| `npm run review` | Builds the review page described under "Build output and publishing" |
| `npm run proof` | Drives `?mode=export` at `formats.preview` and the `draft` tier for `export.proofSeconds` seconds of film, saves the download as the file named in `export.files.preview` under `out/work/export/` with its record, and runs `ffprobe` on it. `--memory` runs the memory test instead |
| `npm run determinism` | Renders the same frames on fresh page loads and in a different order, and compares them |
| `npm run gate -- --phase N` | The machine checks, and the deliverable checks that phase names, with a pass or fail line for each |

Rules:

- The browser runs headless with software WebGL.
- Stills kept in `out/stills/` are stored in a compressed format at high quality, so the repo stays small.
- Judged stills and comparison images are rendered with the `full` asset set. If the `full` set cannot be loaded under software rendering, log it, render with the largest size that loads, and say so in the record.
- Any command that can exceed `sandbox.chunkBudgetMinutes` does its work in chunks and can be run again to continue.
- At most `sandbox.maxRenderProcesses` render processes run at once in one VM. Sandbox agents in their own VMs can each render a range of frames in parallel.
- The preview films of Phases 2 and 5 are rendered at the `draft` tier. The Phase 6 film is rendered at the highest tier whose wall-clock time, from the render budget with the units split across sandbox agents, fits in `sandbox.previewFilmMaxHours`, and never below `draft`.
- Every harness output is written under `out/work/`, which git ignores.

### Films, chunks and disk

- A film is rendered one unit at a time. Each unit's frames are encoded into a chunk with the film's final settings and a closed group of pictures, so chunks join into a film, or stand alone as a clip, without being encoded again.
- Frames are deleted as soon as their chunk is encoded. No command ever holds more than `sandbox.maxFramesOnDisk` frames on disk.
- Every render command checks free disk first. Under `sandbox.minFreeDiskGb` it deletes old output under `out/work/` and checks again before it refuses to start.
- A sandbox agent returns its chunks to the Builder as attachments. If attachments cannot carry video, the agent pushes its chunks, with their records, to its own branch under `out/chunks/`. The Builder fetches that branch and copies the chunks out without merging it. If neither works, the Builder renders the range itself.
- Every running long job is written under "Running jobs" in `kit/PROGRESS.md` when it starts: the command, the frame range, the log file, the VM and the time the render budget says it should take. It is removed when the job is done.

### The clock

`npm run clock` keeps `kit/CLOCK.json`. It is the first harness command built, and it is committed with every status.

- `npm run clock -- --start` marks the start of a task. It adds no time, and the next tick counts from it. A tick made on a different machine boot from the last one is treated the same way, so a forgotten `--start` cannot count the time between two tasks.
- `npm run clock -- --phase N` is a tick. It adds the whole time since the previous tick or start to phase N.
- `npm run clock -- --continue N` records continuation N. It gives each phase that is not `done` a new box: `budget.continueHours` split in proportion to those phases' boxes in `budget.phaseHours`. From then on the lines below are measured from the start of the continuation against the new boxes.
- `npm run clock -- --extension N` ticks an extension after completion. Its time is kept apart from the build's. It prints the time used in the extension out of `budget.extendHours`, and `extra rounds: yes` or `no`, which is no once those hours are used. It never prints `budget report: due`.
- A tick prints, in plain words:
  - Time used in this phase and by the whole build, and the time allowed: `budget.runHours`, or the continuation's hours.
  - `extra rounds: yes` or `no`. It is no once the whole build's time used has reached the sum of the boxes up to and including this phase.
  - `half point: reached` once this phase has itself used half of its own box.
  - `box end: reached` once this phase has itself used all of its own box.
  - `budget report: due` once the time used has reached the time allowed.
  - Minutes since the last status, and `status overdue` once that passes `budget.statusMaxGapMinutes`.
- The Builder reads those lines and follows the clock rules in `AGENTS.md`. The script decides nothing by itself.

### Looks and status

- A look is any picture someone rendered in order to look at it. `still`, `sheet`, `seq`, `crops` and `compare` each append a line to `out/work/looks/index.jsonl`: the file, a short caption, the time and who made it.
- A build or render agent pushes its newest looks to its looks branch, `agent/<folder>-looks`, with every heartbeat. That branch is fetched and never merged. A short-lived agent attaches its looks to its report. The Builder adds both to the log with `npm run look`.
- A long render job writes a finished frame as a look at least every `budget.statusMaxGapMinutes` of rendering, so a status has something new to show while the job runs.
- `npm run status -- --phase N --unit ID` does this:
  1. Runs a clock tick for phase N. With `--extension N` in place of `--phase N` it ticks that extension.
  2. Chooses up to `status.maxPictures` pictures. First, for the unit in hand, each of its key frames beside its approved image, reusing a still whose record matches the current build and otherwise rendering one at the `review` tier. Then the newest looks that are not already shown, the Builder's and the ones fetched from agent branches. With no `--unit` it uses the whole film sheets.
  - It never waits for the render slot. If a render job is running in this VM it renders nothing and uses the newest frames that job has written and the newest looks.
  - It never comes back empty. If no sheet, still or look exists yet, it uses `references/approved/contact-sheet.jpg`.
  3. Resizes each to at most `status.pictureLongEdgePx` on the long edge.
  4. Writes them to `out/stills/status/`, replacing the last set, with `STATUS.md` holding the captions and the time.
  5. Writes whatever file the inline display method from Phase 0 needs under `out/work/status/`.
  6. Prints the lines of the status message, including the time used out of the time allowed.
- The Builder then shows the gallery in the thread and posts the lines, as "Showing the work" in `AGENTS.md` says.

## The rough cut

`npm run animatic` exists so Brandon can judge pacing before the scene is built.

- It needs no 3D. It is made from the approved images with `ffmpeg` or a small script.
- It follows `segments` exactly, frame for frame, in `formats.preview`.
- Each segment shows the approved image of its key with a slow push that matches the direction of the camera move. A segment with two keys dissolves slowly from the first to the second between their times.
- Every cut is a hard cut on its exact frame.
- A small label in one corner names the current segment id. This is the only place in the project where text appears over the picture, and it exists only in the rough cut.

## Export

`?mode=export` is how the master is made, on a computer with a GPU.

- One page with three choices and a start button: the format (`formats.master` or `formats.uhd`), the range (the whole film, or one unit's clip), and the tier.
- Defaults: `formats.master`, the whole film, the `final` tier, the `full` asset set.
- Before the start button is enabled, the page renders one key frame, `bloom-hero`, on this machine and shows it beside the kept still of that frame. `npm run build` copies that still from `out/stills/` into `dist/`. If no kept still exists yet, the page says so and skips the comparison. Brandon sees at a glance whether this machine draws the film the way the critics saw it.
- Renders through the same code path as `renderFrame`.
- The `first` and `last` parameters limit the run to a range of frames. These exist for testing.
- Encodes with WebCodecs to `export.videoCodec` at `export.bitrateMbps`, muxes to `export.container`, and downloads the file named in `export.files`, with `{unit}` replaced by the unit id for a clip.
- The exact codec profile and level are chosen by asking the browser what it supports for the format, highest profile first.
- Shows frames done, elapsed time and time remaining.
- Yields between frames through a message channel or the encoder's own callbacks. It does not use timers or `requestAnimationFrame`.
- Requests a screen wake lock and carries on if the request is refused.
- If the WebGL context is lost it stops and says so in plain words. It never writes a file with missing frames.
- Before starting, the page checks two things and says in plain words if one fails: the browser can encode `export.videoCodec`, and the machine can load the chosen asset set, tested by loading it. If the `full` set does not load, it offers the `web` set.
- `formats.uhd` is offered as it is. Nothing in the kit is gated on it.
- Proof in this workspace, made by `npm run proof`: run Export end to end at `formats.preview` and the `draft` tier for `export.proofSeconds` seconds of film, and confirm the file with `ffprobe`. If this workspace's browser cannot encode `export.videoCodec`, prove the pipeline with a codec it has and log that `export.videoCodec` is unproven here.
- Memory test, made by `npm run proof -- --memory`: run Export at `formats.preview` and the `draft` tier across the first cut and `export.memoryTestSeconds` seconds each side of it. Log the page's memory and the loader's texture total at intervals. The total must stay at or under `assetSets.<set>.maxTextureMb`.

## Build output and publishing

- `npm run build` produces a static site in `dist/` with relative URLs. It works from any host at any base path.
- No server code. No runtime network calls except loading its own files.
- Publish `dist/` with the workspace's own app hosting so it opens at a URL. Use `slug` from the config for the address.
- Publish both asset sets if the hosting accepts the size. If it does not, publish the `web` set, log it, and write in `README.md` the exact steps to run Export from a local copy with the `full` set.
- If no hosting is available, log that and continue. It is not a blocker.

### The review page

Brandon reviews on a tablet. He needs one link where everything plays.

- `npm run review` writes `dist/review.html` and copies into `dist/review/` whatever exists of: the pictures in `out/stills/status/`, `out/roughcut.mp4`, `out/preview.mp4`, every clip in `out/work/clips/` and `out/clips/`, and every comparison image and contact sheet in `out/stills/`.
- The page has four parts, in this order: Latest (the newest status pictures with their captions and the time), Films, Clips, Comparisons.
- Each video plays in the page and each image is shown at full width. The page carries the date, the current phase and the time used from `kit/PROGRESS.md`.
- It is plain HTML with no framework. It is not part of the app and not part of any hash.
- Run it before every publish, so the review page is always at `<url>/review.html`.
- `out/work/` does not survive a new task. A finished unit's clip is therefore also kept with `npm run keep -- --clips` when the unit is finished.
- If the hosting does not accept the size, leave out the largest videos and say so on the page.

## Tests

- Config validation, including every failure case above.
- Seeded random: same seed, same stream, same values.
- Timeline: every segment boundary and key maps to the right frame, the list of cuts is right, and the judged frame list follows the rule in `kit/07-QUALITY-BAR.md`.
- The plant: height never falls across the film, every organ's growth curve starts at zero and is continuous, and the same time always gives the same plant.
- Continuity: across every cut, the camera and plant numbers from `state()` change by no more than they do between ordinary neighboring frames.
- The clock: `--start` adds nothing, a tick on a new machine boot adds nothing, every other gap is counted in full, `--continue` gives the unfinished phases new boxes, and each printed line switches at the right moment.
- Sampler: sequences are deterministic and cover the pixel, the shutter and the lens.
