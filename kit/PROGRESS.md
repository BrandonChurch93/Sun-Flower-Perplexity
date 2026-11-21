# Progress

The Builder's memory. Read this first in every task. Update it before every commit.

## Status

- Build: in progress
- Current phase: 1 · Rough cut
- Current unit: none
- Current round: none
- Blocked: no
- Budget: running
- Continuations: 0
- Extensions: 0
- Extension step: none
- App URL: https://sunflower-film.pplx.app
- Last push: 2026-11-21 01:57 UTC · Phase 0 gate met: harness, budget, review page, app published
- Last status: 04 · 2026-11-21 01:56 UTC · Phase 0

"Build" is one of `not started`, `in progress`, `complete` or `extension N in progress`. "Budget" is one of `running` or `reported`. `AGENTS.md` says what each means.

## Latest pictures

Newest first. Each line names the pictures of one status in `out/stills/status/`, with the time and the caption, so this page shows where the film is.

- 2026-11-21 01:56 UTC · status 04 · Phase 0 · `status-1.jpg`: Spike frame 1350 (45 s, golden hour world) at the final tier, 48 samples. Stand-in plant with no head yet; `status-2.jpg`: Spike frame 420 (14 s, rain world) at the review tier. Focus sits on the growing tip; `status-3.jpg`: Spike frame 1080 (36 s, frost world) at the review tier
- 2026-11-21 01:38 UTC · status 03 · Phase 0 · `status-1.jpg`: First spike frame at 42 s (golden hour world), 8 samples, 1920 x 1080. Stand-in plant, ground and sky; `status-2.jpg`: Spike frame at 14 s (rain world). The lens is focused on the growing tip, the rest falls soft; `status-3.jpg`: Spike frame at 26 s (night world), 1 sample; `status-4.jpg`: Frame 1515 (50.5 s, bloom) at the review tier
- 2026-11-21 01:20 UTC · status 02 · Phase 0 · `status-1.jpg`: The numbered test chart every model family read, used to measure the image limit (1400 px arrives intact)
- 2026-11-21 01:00 UTC · status 01 · Phase 0 · `status-1.jpg`: The eight approved images, in film order

## Clock

Copied from the output of `npm run clock` at every status. Working time only.

| Phase | Planned box | Time used |
| --- | --- | --- |
| 0 | 1.50 h | 1.08 h |
| 1 | 0.50 h | 0.00 h |
| 2 | 3.50 h | 0.00 h |
| 3 | 9.00 h | 0.00 h |
| 4 | 8.50 h | 0.00 h |
| 5 | 3.00 h | 0.00 h |
| 6 | 4.00 h | 0.00 h |
| Whole build | 30.00 h | 1.08 h |

Continuations and extensions are listed under this table with their own hours.

## Phases

| Phase | State | Gate evidence | Commit |
| --- | --- | --- | --- |
| 0 · Ground truth | done | 2026-11-21 01:54 UTC: `npm run gate -- --phase 0` all green (G1 build clean, G2 48 of 48 tests, G3 frames 45, 780 and 1515 pixel identical across fresh page loads and in another order, G4 stills 1920 x 1080, 960 x 540 and 3840 x 2160 and `frameCount` 1800, G10 needs only EXT_color_buffer_float and sizes inside the record). Four pushes. Workspace record, tool record, pinned versions and render budget table are above. Inline display proven at status 01. Published 01:56 UTC at https://sunflower-film.pplx.app | the status 04 push |
| 1 · Rough cut | in progress | | |
| 2 · Engine and blockout | not started | | |
| 3 · The look lock | not started | | |
| 4 · The other units | not started | | |
| 5 · The whole film | not started | | |
| 6 · Polish and deliver | not started | | |

State is one of `not started`, `in progress` or `done`.

## Units

State is one of `not started`, `stand-in`, `in progress` or `finished`. A finished unit names the commit it was finished on and what ended its loop: `passed`, `round limit` or `clock`. A unit is never marked finished because of a budget report. It stays `in progress`.

| Unit | State | Rounds run | R1 | R2 | R3 | R4 | Ended by | Commit | Open items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dawn | not started | 0 | | | | | | | |
| rain | not started | 0 | | | | | | | |
| night | not started | 0 | | | | | | | |
| frost | not started | 0 | | | | | | | |
| bloom | not started | 0 | | | | | | | |
| field | not started | 0 | | | | | | | |

## Workspace record

Measured in Phase 0. These replace the numbers in `AGENTS.md`.

Measured 2026-11-21 01:06 to 01:14 UTC on the Builder's VM (boot `6211bae4`).

| What | Measured |
| --- | --- |
| OS | Ubuntu 26.04.1 LTS, kernel 6.1.155 |
| CPU cores | 2 |
| Memory | 7957 MB |
| Disk | 20 GB, 13 GB free at the start |
| Node, npm | v20.20.2, 10.8.2 |
| Browser | Chrome for Testing 147.0.7727.15 at `~/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`, driven by `playwright-core` |
| Launch flags | `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` |
| WebGL2 renderer | ANGLE, Vulkan 1.3, SwiftShader (software) |
| WebGL2 limits | MAX_TEXTURE_SIZE 8192, MAX_RENDERBUFFER_SIZE 8192, MAX_VIEWPORT_DIMS 8192 x 8192, MAX_SAMPLES 4, MAX_DRAW_BUFFERS 6, MAX_VERTEX_ATTRIBS 16, anisotropy 16. The full list is in `config/webgl-caps.json` |
| Extensions | 30, including EXT_color_buffer_float, EXT_color_buffer_half_float, EXT_float_blend, OES_texture_float_linear, EXT_texture_filter_anisotropic. Full list in `config/webgl-caps.json` |
| Float render targets | RGBA16F, RGBA32F and R11F_G11F_B10F all complete |
| `VideoEncoder` | Present. `localhost` is a secure context |
| Encode strings for `export.videoCodec` (h264) | At the master and preview sizes: `avc1.64` (High), `avc1.4D40` (Main) and `avc1.4200` (Baseline), each at levels 34, 33, 32, 2A, 29, 28. At the uhd size only levels 34 and 33 of each profile. Export asks High first |
| ffmpeg, ffprobe | 8.0.1 with libx264, both run |
| Detached process | Works. A process started with `(set -m; cmd >log 2>&1 &)` kept writing after the step that started it ended |
| Sandbox agent | Own VM (its own boot id), 4 cores, 7957 MB, 25 GB disk with 18 GB free, same OS, Node, Chrome and ffmpeg. Shallow clone worked, `npm install` took 3.6 s, WebGL2 works under the same flags, a branch push worked (`agent/probe`), and it returned an mp4 as an attachment |
| Attachments | Files sent to an agent arrive under `/home/user/.perplexity/attachments/<id>/<file>`, not in its working directory. Files an agent returns arrive the same way on the Builder's VM |
| Image limit | 1400 px on the long edge arrives intact: all six viewer families and the Builder read the 1 px marks. 2000 px is downscaled (to about 1430 px). `critics.maxImageLongEdgePx` stays 1400 |

## Tool record

What this workspace can call, measured in Phase 0. It includes the exact method that displays a picture inline in the task thread.

### Inline display method (proven 2026-11-21 01:00 UTC with `references/approved/contact-sheet.jpg`)

1. `npm run status` writes `out/work/status/status.json`: `{"pics":[{"label","w","h","src"}],"lines":[...]}`. Each picture is a JPEG of at most `status.pictureLongEdgePx` on the long edge, stored as a base64 data URL. `npm run inline -- --name X "caption=file"` writes the same kind of file for any other picture.
2. The Builder calls the inline visualization tool with `sources = {"pics": {"workspace_path": "<absolute path of that json>", "format": "json"}}` and the widget code kept in `tools/status-widget.html`, word for word.
3. The widget reads `window.visualization.sources.pics.data`, writes the status lines above the pictures and sets each `img.src` from the data URL in a script placed after the markup. One picture fills the width. Two to four form a grid with a caption under each.
- What does not work in the widget: external URLs and workspace paths as `img.src` (blocked by its content policy). A file attachment alone does not display inline.
- The widget is about 720 px wide and its visible height is capped near 640 px, so four 16:9 pictures in a 2 by 2 grid fit.
- Fallback if the tool ever fails: attach the pictures as files at the same rhythm and publish with every status.

### What this workspace can call (recorded 2026-11-21 01:14 UTC)

- Image generation. Models: `seedream_5` (up to 10 reference images, about 2K, the one the reference run found best for this look), `nano_banana_pro` (14 references, 2K), `nano_banana_2_1` (14 references), `gpt_image_2_6_flare` and `gpt_image_2_6_sunburst` (5 references, transparent backgrounds, they ignore the aspect ratio setting). Aspect ratios 1:1, 3:4, 4:3, 9:16, 16:9. The largest result seen in the reference run was about 2816 x 1584.
- Still to video generation exists. Not used so far.
- Image search and image fetch exist.
- App hosting: deploy a static folder, then publish it at a slug. An earlier build measured about 500 MB per site. Organization-only sites ask for a sign-in, so the harness cannot read them back.
- Publishing, as done on 2026-11-21 01:56 UTC: `npm run review`, then deploy the folder `dist/` under the site name `Sunflower`, then publish it. The first publish used the address `sunflower-film` (`slug` in the config). Every later publish updates site id `547457d5-7066-4871-b762-1715efa50d06` (app id `21dfc1c9-6bc5-4694-8885-f131c248f57f`). The site's visibility is Organization, so it asks for a sign-in and the harness tests the same `dist/` served locally.
- Inline visualization: the method above.
- A text-only model tool that cannot see images, so every critic is a spawned agent.
- Supporting agents, in this VM or in their own sandbox VM. At most `sandbox.maxAgents` at once.

### Model families for supporting agents (measured 2026-11-21 01:01 to 01:06 UTC)

Each family was sent the same three numbered test charts (1400 px and 2000 px) and asked to read the marks. All six read every row they could resolve correctly, with no wrong numbers.

| Family id | Sees images | Note |
| --- | --- | --- |
| `gpt_6_2_sol` | yes | read every row |
| `gemini_4_carbon` | yes | read every row |
| `claude_opus_5_5` | yes | read every row |
| `pplx_computer_glm_5_3_1009` | yes | read every row |
| `grok_4_7` | yes | read every row |
| `kimi_k3` | yes | could not read the smallest (7 px) row at any size. The weakest for fine detail |

Other ids that exist and were not tested: `gpt_6_2_astra`, `gemini_neon`, `claude_fable_5_2`, `claude_opus_5_5_fast`, `claude_sonnet_5_5`. `deepseek_v4_pro_0813` is not available.

## Pinned versions

Checked against the npm registry and each project's own release notes on 2026-11-21. Exact versions, no ranges, in `package.json` and the lock file.

| Package | Version | Use |
| --- | --- | --- |
| three | 0.187.0 | The one render path, WebGL2. Latest stable |
| gsap | 3.15.1 | Easing. Latest stable |
| mp4-muxer | 5.2.2 | MP4 muxing for Export. Its last release |
| vite | 8.3.8 | Build. Latest stable |
| typescript | 7.0.2 | Strict type check. Latest stable |
| vitest | 4.1.12 | Unit tests. The latest line that supports Node 20. The 5.x line needs Node 22: its failure report crashed here on `Map.groupBy` |
| tsx | 4.23.15 | Runs the harness scripts. Latest stable |
| sharp | 0.35.5 | Image work in the harness. Latest stable |
| playwright-core | 1.59.1 | Headless browser driver. Not the latest (1.65.1): this is the release that matches the browser already in the workspace |
| @types/three | 0.187.0 | Types |
| @types/node | 20.19.43 | Types, matching Node 20 |
| Chrome for Testing | 147.0.7727.15 | The pinned browser (`chromium-1217`), software WebGL2 |
| Node, npm | 20.20.2, 10.8.2 | As found in the workspace |
| ffmpeg, ffprobe | 8.0.1 | Films and checks, as found in the workspace |

## Render budget

Seconds per sample and per frame at each format and tier, the time for one judged still at the `final` tier, the time for the whole film at each tier, and the texture memory. Measured in Phases 0, 2, 3 and 5.

### Phase 0 spike scene (stand-in plant, ground and sky)

Measured 2026-11-21 01:51 UTC on the Builder's VM (2 cores, software WebGL2). One sample is one full render of the scene. A frame costs a fixed part (building the plant, the lens and grade stage) plus its samples.

| Format | Size | Seconds per sample | Fixed seconds per frame | Frame at `draft` (1) | Frame at `review` (8) | Frame at `final` (48) | Start-up | First frame extra |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 16x9 | 1920 x 1080 | 0.339 (0.247 to 0.419) | 0.92 | 1.3 s | 3.7 s | 17.6 s | 1.3 s | 0.5 s |
| preview | 960 x 540 | 0.100 (0.088 to 0.123) | 0.22 | 0.3 s | 1.0 s | 5.1 s | 1.2 s | 0.6 s |
| uhd | 3840 x 2160 | 1.215 (1.009 to 1.481) | 4.11 | 5.3 s | 13.9 s | 63.3 s | 1.2 s | 1.2 s |

| Whole film (1800 frames) | `draft` | `review` | `final` |
| --- | --- | --- | --- |
| 16x9, one VM | 38 min | 1.8 h | 8.8 h |
| preview, one VM | 10 min | 31 min | 2.5 h |
| uhd, one VM | 2.6 h | 7.0 h | 31.6 h |

| Per unit in 16x9 | Frames | `draft` | `review` | `final` |
| --- | --- | --- | --- | --- |
| dawn | 240 | 7 min | 14 min | 53 min |
| rain | 360 | 8 min | 24 min | 2.0 h |
| night | 300 | 6 min | 18 min | 1.4 h |
| frost | 300 | 6 min | 18 min | 1.4 h |
| bloom | 360 | 8 min | 25 min | 2.1 h |
| field | 240 | 3 min | 12 min | 1.0 h |

- One judged still at the `final` tier in 16x9: 21 s from the per sample numbers, 16 s measured, plus 2 s to start. It fits in `sandbox.chunkBudgetMinutes` (7 min).
- The whole film at `final` in 16x9 with the units split across sandbox agents ends when the longest unit ends: about 2.1 h on a VM of this speed.
- Texture memory, as the loader counts it with mipmaps: `full` 20.3 MB of 2400 MB, `web` 5.1 MB of 800 MB. Render targets on top of that: 16x9 about 141 MB, preview about 35 MB, uhd about 563 MB.

## Judged frames

Computed in Phase 2 by the rule in `kit/07-QUALITY-BAR.md`. Frames are added, never removed.

| Frame | Unit | Key | Why |
| --- | --- | --- | --- |

## Look lock

Written at the end of Phase 3: every locked setting, each technique that worked and each that did not.

Not reached yet.

## Decisions made by the Builder

One line each: the date, the phase, the decision and why.

- 2026-11-21 · Phase 0 · The clock was started at the task start (00:51:51 UTC) with `--start --at`, not at the minute the script first ran, so the reading time before the clock existed is counted as working time.
- 2026-11-21 · Phase 0 · Harness scripts are TypeScript run with `tsx`, so they import `src/config.ts` and the timeline directly and no number is typed twice.
- 2026-11-21 · Phase 0 · `.npmrc` sets `legacy-peer-deps=true`: `npm install` crashed inside its peer dependency resolver (`Cannot read properties of null (reading 'edgesOut')`) on the current test runner's peer list. With the flag the same pinned versions install cleanly.
- 2026-11-21 · Phase 0 · Added two helper commands that the kit does not list: `npm run push` (fetch, merge, commit with the trailer, push, log the push) and `npm run inline` (pack any picture for the inline display).
- 2026-11-21 · Phase 0 · MP4 muxing for Export uses `mp4-muxer` pinned at its last release. Its author now points to a larger successor library. The small one does exactly what Export needs and its interface is known, so it is the lower risk.
- 2026-11-21 · Phase 0 · Render path: three.js `WebGLRenderer` on WebGL2 with `antialias: false`, pixel ratio 1 and custom GLSL3 materials that share one set of uniforms. Each sample is rendered to an RGBA16F target with depth and added into an RGBA32F ping-pong accumulator. Lens and grade run once after accumulation. One pixel is read back before any timer stops.
- 2026-11-21 · Phase 0 · Motion inside the shutter: the plant is built on the CPU at shutter open and shutter close and the vertex shader mixes the two by the sample's shutter position. The camera is evaluated exactly at each sample's own time. The shutter opens at the frame's time and lasts `film.shutterDegrees / 360` of a frame.
- 2026-11-21 · Phase 0 · The alpha channel of a sample carries the blur circle in pixels, so the accumulated frame knows how soft each pixel is. A blur guided by it fills the gaps between lens samples (radius = blur circle / sqrt(samples)), and the far backdrop is blurred analytically. Both are allowed by `kit/04-LOOK.md` section 7.
- 2026-11-21 · Phase 0 · Camera convention: plant foot at the origin, y up, camera at `(d sin az, h, d cos az)`. `frameX` is reached by turning the lens only. The pan is solved so the point of the plant axis at `aimHeightM` lands exactly at `frameX` and at half height. No roll. Focus distance is the depth of the growing tip. The f-number is not in the config, so it lives in the units' camera fit.
- 2026-11-21 · Phase 0 · G10: the page exposes one extra call, `requirements()`, that lists the WebGL2 extensions and limits the app needs. The gate compares it with `config/webgl-caps.json`.
- 2026-11-21 · Phase 0 · The harness serves the built `dist/` from a local server on `localhost` and rebuilds when the hashes of the source differ from the build. Engine and unit hashes come from one shared library and are injected at build time.
- 2026-11-21 · Phase 0 · Stand-in systems live in the real folders and register themselves with `declareStandIn`, so `info().standIns` is always the truth.
- 2026-11-21 · Phase 0 · World settings live in `src/worlds/<id>/index.ts` and each unit's camera fit in `src/units/<id>/index.ts` (the f-number of each key, in the order of the config), so a unit's hash changes only when its own look changes. Shared sky and weather code lives in `src/weather/`, inside the engine hash.
- 2026-11-21 · Phase 0 · `index.html` and `config/webgl-caps.json` are counted in the engine hash, because both change what a frame can be.
- 2026-11-21 · Phase 0 · The sky and the far backdrop are drawn per sample from the pixel's central ray and blurred by formula from the blur circle at infinity (a wider sun disc, a lower mip of the backdrop). The stand-in backdrop of each world is a blurred copy of its approved image made by `tools/standin-backdrops.ts`, mirrored sideways so it has no edge. Phase 2 replaces it with the painted-out backdrop the build order asks for.
- 2026-11-21 · Phase 0 · Lens and grade order, once per frame after accumulation: gap fill blur guided by the blur circle, bloom from a soft knee, exposure, color gain, vignette, a filmic curve with a toe and a shoulder, saturation, lift, grain, dither, sRGB.
- 2026-11-21 · Phase 0 · The sampler was changed after its unit test showed that 8 samples could leave one side of the lens empty. The lens and the soft light now each use a rotated Hammersley set in their own shuffled order. The pixel keeps a rotated Halton set, the shutter one sample per slot.
- 2026-11-21 · Phase 0 · `npm run determinism` renders three judged frames (the second, the middle and the second to last of the list) in the master format at the `review` tier on one fresh page, renders them in reverse order on a second fresh page, renders one of them twice on a third, and compares every pixel. `--frames`, `--tier` and `--format` change the set.
- 2026-11-21 · Phase 0 · `npm run gate -- --phase N` runs these checks: Phase 0 G1, G2, G3, G4, G10. Phase 1 D1. Phase 2 G1 to G12, D2, D3. Phases 3 and 4 G1 to G13. Phase 5 G1 to G13 and D2. Phase 6 G1 to G13, D2, D3. `--machine` runs the machine checks alone, for the start of a round.
- 2026-11-21 · Phase 0 · G8 reads a generated file as covered when `assets-src/<owner>/RECIPE.md` exists and names the file. The owner is `plant`, `ground` or `worlds/<id>`.
- 2026-11-21 · Phase 0 · The review page keeps the whole site under 450 MB (the hosting took about 500 MB in an earlier build). If the videos do not fit, the largest are left out and the page says so.
- 2026-11-21 · Phase 0 · The app was published at the address `sunflower-film` without asking first. The reasons: the build prompt orders the whole kit and says not to ask questions, `kit/05-ARCHITECTURE.md` says to publish `dist/` with the workspace's own app hosting at `slug` from the config, and the site's visibility is Organization, so only people signed in to the organization can open it.

## Notes from Brandon

Anything Brandon wrote in the task thread, in his words, with the time and what was done about it.

None yet.

## Declined issues

One entry per severe or major issue that was declined: the round, the critic and its words, and which approved image, which settled difference or which of Brandon's choices it went against.

None yet.

## Open items

One entry per issue left open by a limit: the unit, the frame, the critic and its words, what was tried, what to try next. Parts finished with a fallback are listed here too, marked `fallback`. Issues carried from the blockout are marked with the phase that will settle them.

None yet.

## Running jobs

One entry per long job while it runs: the command, the frame range, the log file, the VM, when it started and the time the render budget says it should take.

None.

## Running agents

One entry per supporting agent while it runs: its name, the folder it owns, its branch, its brief in one line, when it started, and its limit or the time of its last push.

None.

## Rounds

One entry per round, written and pushed when the round starts: number, phase, unit, the commit it judges, and whether it is a floor round or an extra round. Each part is ticked off as it finishes: checks, measures, pack, each critic, fixes. Scores and what changes next are added when it ends.

None yet.

## Final scores

Written by the record round in Phase 6.

Not reached yet.

## QA results

One line per item of `kit/09-QA-GAUNTLET.md`: the number, pass or fail, and the evidence.

Not reached yet.

## Failed QA items

None.

## Last report block

The last `BUDGET REPORT` or `BUILD COMPLETE` block, word for word as it was posted, so a later task can print it again.

None yet.

## Push log

One line per push: the date, the commit and what it carried. A failed push is logged here too.
- 2026-11-21 01:00 UTC · Phase 0: package, clock, look log, status tool, inline display proof, status 01
- 2026-11-21 01:20 UTC · Phase 0: workspace record, tool record, caps tool, engine core modules, status 02
- 2026-11-21 01:39 UTC · Phase 0: app scaffold renders its first spike frames; still command and render session
- 2026-11-21 01:57 UTC · Phase 0 gate met: harness, budget, review page, app published

## Session log

One entry per task: when it started, the prompt it was started with, what it did, where it stopped. Every status is also written here as two lines, in case the thread did not show it.

### Task 1 · started 2026-11-21 00:51:51 UTC

- Prompt: `BUILD MODE.` (the build prompt from `kit/10-KICKOFF.md`, run 2).
- Stop condition 1 checked at 00:53 UTC: `references/approved/MANIFEST.sha256` exists, all eight key images exist, all eight hashes match. Not blocked.
- Fetched and merged `main` at `593fb73`. No addenda. Read `AGENTS.md` and the kit in its reading order. "Build" was `not started`, so the build starts at Phase 0, step 1.
- Status 01, 2026-11-21 01:00 UTC, Phase 0. The build has started: kit read, clock running, first push done. The inline display is proven with the approved contact sheet. Next: measure the workspace, scaffold the app, render a spike scene. Time used: 0.1 h of 30 h.
  Pictures: The eight approved images, in film order.
- Status 02, 2026-11-21 01:20 UTC, Phase 0. Workspace, tools, agents and the image limit are measured and logged: software WebGL2 works, six model families see images, a sandbox agent has its own 4 core VM and can return video. The engine core (sampler, accumulator, timeline, lens) is written. Next: finish the scaffold and the harness, then render the first spike frames. Time used: 0.5 h of 30 h.
  Pictures: The numbered test chart every model family read, used to measure the image limit (1400 px arrives intact).
- Status 03, 2026-11-21 01:38 UTC, Phase 0. The app scaffold renders its first frames in the headless browser: a stand-in plant that grows with time, soft sun shadows, light through the leaves, depth of field from lens samples, bloom, a film tone curve and grain, all accumulated from samples. Everything in these pictures is a stand-in. Next: the harness commands (determinism, gate, budget, review), the unit tests, the render budget table, then publishing the spike Time used: 0.8 h of 30 h.
  Pictures: First spike frame at 42 s (golden hour world), 8 samples, 1920 x 1080. Stand-in plant, ground and sky; Spike frame at 14 s (rain world). The lens is focused on the growing tip, the rest falls soft; Spike frame at 26 s (night world), 1 sample; Frame 1515 (50.5 s, bloom) at the review tier.
- Status 04, 2026-11-21 01:56 UTC, Phase 0. Phase 0 gate met. The harness is complete for this phase: determinism, gate, budget and review commands, 48 unit tests, and the five machine checks of the phase are green. The render budget is measured (one 1920 x 1080 sample takes about 0.34 s here, a final tier still 17 s). The app and its review page are published. These are spike frames: every part is a stand-in. Next: Phase 1, the rough cut made from the approved stills, then the engine and the blockout of the whole film. Time used: 1.1 h of 30 h.
  Pictures: Spike frame 1350 (45 s, golden hour world) at the final tier, 48 samples. Stand-in plant with no head yet; Spike frame 420 (14 s, rain world) at the review tier. Focus sits on the growing tip; Spike frame 1080 (36 s, frost world) at the review tier.

