# Progress

The Builder's memory. Read this first in every task. Update it before every commit.

## Status

- Build: in progress
- Current phase: 2 · Engine and blockout
- Current unit: none
- Current round: none
- Blocked: no
- Budget: running
- Continuations: 0
- Extensions: 0
- Extension step: none
- App URL: https://sunflower-film.pplx.app
- Last push: 2026-11-21 04:16 UTC · Phase 2: reference board, shot list, judged frames, frost and night stand-in fixes, the field draws only what the lens can see
- Last status: 10 · 2026-11-21 03:55 UTC · Phase 2

"Build" is one of `not started`, `in progress`, `complete` or `extension N in progress`. "Budget" is one of `running` or `reported`. `AGENTS.md` says what each means.

## Latest pictures

Newest first. Each line names the pictures of one status in `out/stills/status/`, with the time and the caption, so this page shows where the film is.

- 2026-11-21 03:55 UTC · status 10 · Phase 2 · `status-1.jpg`: Dawn sprout, dawn seedling, rain, night: approved image left, film frame right; `status-2.jpg`: Frost, bloom opening, bloom hero, field: approved image left, film frame right
- 2026-11-21 03:29 UTC · status 09 · Phase 2 · `status-1.jpg`: Keys 1 to 4, approved image left, film frame right: dawn-sprout, dawn-seedling, rain, night; `status-2.jpg`: Keys 5 to 8, approved image left, film frame right: frost, bloom-opening, bloom-hero, field
- 2026-11-21 03:07 UTC · status 08 · Phase 2 · `status-1.jpg`: Keys 1 to 4, approved image left, film frame right: dawn-sprout, dawn-seedling, rain, night; `status-2.jpg`: Keys 5 to 8, approved image left, film frame right: frost, bloom-opening, bloom-hero, field
- 2026-11-21 02:49 UTC · status 07 · Phase 2 · `status-1.jpg`: Golden hour: the approved bloom-hero image, and the same image with the plant and the companion's leaves painted out; `status-2.jpg`: Dawn and rain with the plant painted out; `status-3.jpg`: Night and frost with the plant painted out
- 2026-11-21 02:25 UTC · status 06 · Phase 2 · `status-1.jpg`: Frame 420 (14 s, rain world): the soil and the plant's shadow are drawn for the first time. Stand-in shapes; `status-2.jpg`: Frame 60 (2 s, dawn world), draft tier, with the ground; `status-3.jpg`: Frame 1755 (58.5 s): the high wide view. The field is not built yet; `status-4.jpg`: Texel view of frame 60: how many texture samples each pixel gets, used by a measure
- 2026-11-21 01:59 UTC · status 05 · Phase 1 · `status-1.jpg`: Rough cut, frame 420 (14 s, rain). Made from the approved still; `status-2.jpg`: Rough cut, frame 1515 (50.5 s, bloom). Made from the approved still; `status-3.jpg`: Rough cut check: one frame from every segment and the frame each side of every cut
- 2026-11-21 01:56 UTC · status 04 · Phase 0 · `status-1.jpg`: Spike frame 1350 (45 s, golden hour world) at the final tier, 48 samples. Stand-in plant with no head yet; `status-2.jpg`: Spike frame 420 (14 s, rain world) at the review tier. Focus sits on the growing tip; `status-3.jpg`: Spike frame 1080 (36 s, frost world) at the review tier
- 2026-11-21 01:38 UTC · status 03 · Phase 0 · `status-1.jpg`: First spike frame at 42 s (golden hour world), 8 samples, 1920 x 1080. Stand-in plant, ground and sky; `status-2.jpg`: Spike frame at 14 s (rain world). The lens is focused on the growing tip, the rest falls soft; `status-3.jpg`: Spike frame at 26 s (night world), 1 sample; `status-4.jpg`: Frame 1515 (50.5 s, bloom) at the review tier
- 2026-11-21 01:20 UTC · status 02 · Phase 0 · `status-1.jpg`: The numbered test chart every model family read, used to measure the image limit (1400 px arrives intact)
- 2026-11-21 01:00 UTC · status 01 · Phase 0 · `status-1.jpg`: The eight approved images, in film order

## Clock

Copied from the output of `npm run clock` at every status. Working time only.

| Phase | Planned box | Time used |
| --- | --- | --- |
| 0 | 1.50 h | 1.08 h |
| 1 | 0.50 h | 0.05 h |
| 2 | 3.50 h | 1.94 h |
| 3 | 9.00 h | 0.00 h |
| 4 | 8.50 h | 0.00 h |
| 5 | 3.00 h | 0.00 h |
| 6 | 4.00 h | 0.00 h |
| Whole build | 30.00 h | 3.07 h |

Continuations and extensions are listed under this table with their own hours.

## Phases

| Phase | State | Gate evidence | Commit |
| --- | --- | --- | --- |
| 0 · Ground truth | done | 2026-11-21 01:54 UTC: `npm run gate -- --phase 0` all green (G1 build clean, G2 48 of 48 tests, G3 frames 45, 780 and 1515 pixel identical across fresh page loads and in another order, G4 stills 1920 x 1080, 960 x 540 and 3840 x 2160 and `frameCount` 1800, G10 needs only EXT_color_buffer_float and sizes inside the record). Four pushes. Workspace record, tool record, pinned versions and render budget table are above. Inline display proven at status 01. Published 01:56 UTC at https://sunflower-film.pplx.app | `0cbd576` |
| 1 · Rough cut | done | 2026-11-21 02:01 UTC: `npm run gate -- --phase 1` green (D1: `out/roughcut.mp4` has 1800 frames at 960 x 540, 30 fps, 16.6 MB, h264 High, a keyframe on every cut). Order and timing checked on `out/work/roughcut/check-sheet.jpg`: one frame from each segment, the frames each side of cuts 240, 600, 900 and 1200, frame 0 and frame 1799, each showing the right approved still and the right label. On the review page under Films. Status 05 posted | `ada2748` |
| 2 · Engine and blockout | in progress | | |
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

Computed in Phase 2 by the rule in `kit/07-QUALITY-BAR.md`, from `judgedFrames()` in `src/director/timeline.ts`. Frames are added, never removed.

| Frame | Unit | Key | Why |
| --- | --- | --- | --- |
| 0 | `dawn` | none | The first frame |
| 45 | `dawn` | `dawn-sprout` | The key dawn-sprout |
| 60 | `dawn` | none | The frame at film.hookSeconds |
| 195 | `dawn` | `dawn-seedling` | The key dawn-seedling |
| 420 | `rain` | `rain` | The key rain |
| 780 | `night` | `night` | The key night |
| 1080 | `frost` | `frost` | The key frost |
| 1350 | `bloom` | `bloom-opening` | The key bloom-opening |
| 1515 | `bloom` | `bloom-hero` | The key bloom-hero |
| 1755 | `field` | `field` | The key field |

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
- 2026-11-21 · Phase 1 · The rough cut pushes each approved still by at most 10 percent about the point where the plant's stem stands in the frame (`frameX`, half height), in or out as the camera's focal length over distance changes across the segment. `dawn` and `bloom` have two keys each and dissolve from the first still to the second between the two key times on a smooth ramp. Between `bloom` and `field` the film has no cut, but the rough cut changes still there, because the two stills are different pictures.

- 2026-11-21 · Phase 2 · The page exposes two more calls for the measures: `check(frame)` (invalid values in the frame before lens and grade, where the growing tip lands and the blur circle there, for M1) and `texels(frame)` (texels per screen pixel over the textured pixels of the sharp zone, in the `texels` view at one sample, for M2).
- 2026-11-21 · Phase 2 · Found while testing the texel count: the ground had never been drawn. Its triangles faced down and were culled, so the soft backdrop showed where soil should be. The winding is fixed. Every Phase 0 spike frame was made without ground.
- 2026-11-21 · Phase 2 · Ownership for the two build agents is by file where a folder is shared: `export_builder` owns `src/capture/export.ts`, its style sheet and `tools/proof.ts`. `harness_builder` owns the rest of the missing commands under `tools/`. The Builder keeps `src/` and the gate, clock, status, push, review and budget tools.
- 2026-11-21 · Phase 2 · The reference board and the motion studies are gathered now by four scouts, as the build order allows, so the board is ready when Phase 3 opens. The Builder assembles `references/BOARD.md` from their notes.

- 2026-11-21 · Phase 2 · Backdrops. Each world's backdrop is its approved image with the plant painted out by an image model that was given that image as its only input: dawn from `dawn-seedling`, rain from `rain`, night from `night`, frost from `frost`, golden from `bloom-hero` (the companion's leaves painted out too, in a second step). Ten takes were made and one kept per world, two takes each and four for golden, of six allowed. A take was thrown out when anything but the plant had changed: a horizon that moved, a picture that shifted by 2 px, a recolored sky, grass or a plant that was added. The prompts and the checks are in each world's recipe.
- 2026-11-21 · Phase 2 · The backdrop is locked to the camera of its key: its center sits where that key's lens points and its width is that key's field of view, so at the key's time the backdrop lies exactly where the approved image has it. Past its edges the picture fades into its own edge color, so no second sun appears when the camera turns. The ground and the field cover everything below the horizon.
- 2026-11-21 · Phase 2 · The pose math moved to `src/director/pose.ts`, which does not load the registry, so harness scripts can project points without a browser. `film.view` holds the only changes the live mode may make to the picture: the camera turned about its aim point, its distance, and a world held at any time. With all of them at rest the film is unchanged.
- 2026-11-21 · Phase 2 · The modes went to a third build agent (`modes_builder`) so the plant, the field and the camera fit are not held up by the interface. It owns the mode files and builds against `film.view`.
- 2026-11-21 · Phase 2 · Field rows run at a right angle to the direction `field.companion.fromAzimuthDeg`, fixed in the ground, so the rows read as rows from the hero camera and the field key alike.
- 2026-11-21 · Phase 2 · Blockout pack: the key pairs are tiled three to an image with halves labeled `N-a` (the approved image) and `N-b` (the frame), so the pack is three film sheets, four cut sheets and three pair images: ten files, one message.
- 2026-11-21 · Phase 2 · Where a backdrop holds the sun, the light comes from where the sun sits in the picture (`backdrop.sunAt`), so shadows and rim light agree with the sky. The elevation read from the picture is held at 2° or more, so a sun on the horizon line still lights the plant. The drawn sun disc is switched off in those worlds (dawn, frost, golden), because the picture already has its sun.
- 2026-11-21 · Phase 2 · Stand-in backdrops are drawn with `blur: 0.25`: the approved images already carry the blur of their own lens, so the full blur of the film lens on top would double it. The real backdrops get their own value in their unit.
- 2026-11-21 · Phase 2 · Kept takes that sat a few pixels off their approved image were moved back before they were cut to size: frost up 4 px, golden up 2 px. Nothing else in them was changed.
- 2026-11-21 · Phase 2 · The stand-in ground no longer asks for 16 tap anisotropic filtering. Measured on this renderer it cost 0.4 s per sample at preview size, three times the rest of the frame together (draft frame 0.8 s to 0.4 s, review frame 4.9 s to 1.7 s). The real ground in Phase 3 gets a one tap filter that picks its detail level from the short side of the pixel footprint and lets the samples of the frame average the long side.
- 2026-11-21 · Phase 2 · `plant.heightM` is read as the height of the top of the whole plant: the arch of the hook, then the tips of the leaves, then the bracts, then the petals. The stem's own length is solved every frame so the highest point of the built plant stands at exactly that height (checked by a unit test on every seventh frame, to 0.02 mm).
- 2026-11-21 · Phase 2 · The plant is split in two files: `growth.ts` holds every stage as a function of time (hook, husk, seed leaves, leaves, bud, bracts, rays, the turn of the head) and `standin.ts` holds the stand-in shapes built from them. Phase 3 replaces the shapes and keeps the growth.
- 2026-11-21 · Phase 2 · The head faces 25° to the left of the direction the companion is seen from (`field.companion.fromAzimuthDeg`) once it is open, which is what the approved hero image shows. While it opens it is turned up to 42° further toward the evening sun and comes round as the rays unfold, as the approved bloom-opening image shows.
- 2026-11-21 · Phase 2 · Leaves keep their place near the head: a leaf's node rises with the plant for longer the later the leaf was born, so the last leaves stay just under the bud as the stem stretches. The stand-in has 21 bracts in three rings. Rays lie folded over the face and open by sector over about five seconds.
- 2026-11-21 · Phase 2 · `performance.now` is used in the `live` and `autopilot` modes only to choose which frame to draw next. No pixel depends on it: a frame is always drawn from its frame number alone.
- 2026-11-21 · Phase 2 · Camera fit. `tools/fit.ts` solves the camera at every key against measurements taken from that key's approved image: where the foot of the stem, the top of the plant or the middle of the head, the horizon and the sun land in the frame. It solves by least squares on the film's own projection and plant, a few times over because the keys that hold a backdrop also set the light, and the light leans the plant. Focal lengths and times were not touched. `camera.keys` changed from (time: distance, height, aim, frameX, azimuth) 0: 0.15, 0.022, 0.012, 0.6, 0; 1.5: 0.163, 0.023, 0.014, 0.61, 0.5; 6.5: 0.285, 0.049, 0.028, 0.6, 2; 14: 0.79, 0.095, 0.109, 0.62, 4; 26: 1.0, 0.5, 0.65, 0.58, 8; 36: 0.73, 1.21, 1.23, 0.55, 12; 45: 0.81, 1.57, 1.58, 0.61, 16; 50.5: 0.81, 1.625, 1.633, 0.62, 20; 52: 0.9, 1.66, 1.65, 0.61, 21; 58.5: 4.86, 2.63, 1.65, 0.49, 24; 60: 5.5, 2.85, 1.66, 0.49, 24.5 to 0 s: distance 0.1457, height 0.023, aim 0.0127, frameX 0.5905, azimuth 3.53; 1.5 s: distance 0.1583, height 0.024, aim 0.0148, frameX 0.6005, azimuth 3.18; 6.5 s: distance 0.2864, height 0.0463, aim 0.0287, frameX 0.6056, azimuth 2; 14 s: distance 0.8152, height 0.1095, aim 0.1095, frameX 0.62, azimuth 4; 26 s: distance 1, height 0.5187, aim 0.6466, frameX 0.6027, azimuth 8; 36 s: distance 0.73, height 1.1819, aim 1.2218, frameX 0.5293, azimuth 12; 45 s: distance 0.81, height 1.5625, aim 1.5487, frameX 0.6554, azimuth 17.36; 50.5 s: distance 0.8726, height 1.6586, aim 1.6436, frameX 0.6098, azimuth 20; 52 s: distance 0.9696, height 1.6943, aim 1.6607, frameX 0.5998, azimuth 21; 58.5 s: distance 4.6365, height 2.7804, aim 1.7101, frameX 0.5054, azimuth 23.14; 60 s: distance 5.2471, height 3.013, aim 1.7205, frameX 0.5054, azimuth 23.64. The keys at 0, 52 and 60 s are not on an approved image and keep their place relative to the key next to them. After the fit every fitted point lands within 0.001 of the frame of its measurement.
- 2026-11-21 · Phase 2 · The camera drifts about 1.5° one way through dawn and the other way from then on. The approved sprout image has the sun further right than the seedling image, and only a turn of the camera puts it there. The turn changes direction at the seedling key, at rest, not at a cut.
- 2026-11-21 · Phase 2 · Stand-in shapes were tuned to the approved images through the checks `tools/fit.ts` prints: the sprout leans away from its hook, the seed leaves stand steeper and longer, the bud is smaller at the frost key (0.034 m radius at 36 s) and larger as it opens, the bracts stay close to the head until the rays have started, the rays open over about seven seconds from one side, and the head is turned up to 30° toward the sun while it opens (was 42°).
- 2026-11-21 · Phase 2 · The field. 12,687 neighbors stand in rows `field.rowSpacingM` apart with a plant every `field.plantSpacingM`, out to 60 m, wider with distance, and past them one sheet of canopy runs to the horizon. Each is the plant's own code at the plant's own age, drawn at one of two levels of detail, with its own place, turn, size (0.80 to 0.93 of the plant, as the approved frost and bloom images show the neighbors standing lower than the plant), lean and tone. 8,914 of them are in view at the field key, counted by a unit test against `field.minPlantsInView`. Their own seeds and timing come in Phase 3.
- 2026-11-21 · Phase 2 · The companion. `field.companion.leftM` 0.65 to 0.7 and `towardCameraM` 0.3 to 0.05, and the companion is neighbor number 53. `tools/fit.ts --companion --scan` tried 90 neighbors at 52 places each against the rule in `kit/02-SUBJECT.md`: no part of it in the frame through dawn, rain and night and at the frost key (held by a unit test on every fifth frame), and its leaves inside the left edge of both bloom keys. With the first values it stayed out of both bloom frames. Now its leaves reach 0.08 of the width into both. The approved images show them reaching 0.2: that is Phase 3 work on the leaves of the golden world, with the first half of the rule always first.
- 2026-11-21 · Phase 2 · The lens is at f/2 in `bloom` (was f/4), which gives the field behind the head about the softness the approved bloom images have.
- 2026-11-21 · Phase 2 · The frost fog is `[0.46, 0.47, 0.49]` with a sun tint of `[0.3, 0.24, 0.18]`, down from `[0.82, 0.84, 0.86]` and `[0.5, 0.4, 0.3]`: the far field was fogged to a brighter grey than the painted sky behind it and stood in the frame as a pale wall. The frost sky ambient is 0.3. These are stand-in values, set again in Phase 4.
- 2026-11-21 · Phase 2 · The ground under the field takes less light once the neighbors have leaves (`uCover` in `src/ground/index.ts`, from the plant's height, starting 0.9 m behind the plant), so pale or frosted soil does not shine through the rows. The open strip the plant and the companion stand on keeps its full light.
- 2026-11-21 · Phase 2 · Night stand-in: the moon is `[0.24, 0.34, 0.56]` and the leaves hang less at night (4° to 13° instead of 6° to 18°, and less droop along the blade), because the hanging leaves read as wilted against the approved `night` image.
- 2026-11-21 · Phase 2 · Each frame the field draws only the neighbors that can be in the frame (`Field.look` in `src/field/index.ts`): any plant wholly to one side of the lens or behind it is left out before drawing. Checked on frames 45, 420, 1080, 1350 and 1755: the pictures are identical byte for byte with and without it. Measured where the time goes at 960 x 540: the far neighbors cost about 0.6 s per sample, the near ones 0.3 s and everything else 0.2 s. The field is the cost to bring down when it is built for real in Phase 4.
- 2026-11-21 · Phase 2 · The image viewer of this workspace shows the picture it first read at a path even after the file changes. From now on every still looked at is copied to a new name first. One frost fix was judged on a stale picture before this was found; it was judged again on fresh files.
- 2026-11-21 · Phase 2 · `references/BOARD.md` is assembled now from the scouts' notes, part by part in the order of the table in `kit/06-ASSETS.md`, with every source URL, the five observations per part and the four motion studies. The step is done once and is not repeated in Phase 3.

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

Finished in this task:

- `board_scout_a`, `board_scout_b`, `board_scout_c`, `motion_scout` · reported by 02:35 UTC · 90 photographs over 15 parts in `references/cache/board/<part>/` (six each, with `NOTES.md` and a contact sheet) and four motion studies in `references/cache/board/motion/`. Caveats they gave: many pictures are stock previews with a light watermark or under 900 px; no usable reference was found for a cracked hard soil crust, a macro of an adult stem at mid height, or dew on bare soil; in the stem study the weeks of leaf growth come from published descriptions, not from footage. The cache is never committed. The Builder writes `references/BOARD.md` from the notes.
- `harness_builder` · reported 03:10 UTC · branch `agent/tools` at `47395be`, merged into `main` at `9ae6135`. Commands: `sheet` (`--film`, `--cut N`, `--unit id`), `compare --key id`, `film` (chunks, resumable, `--first`, `--last`, `--unit`, `--format`, `--from-master`, `--join`, M1 on every frame), `measure --unit id` (M1 to M3), `pack --phase N --round R`, `keep` (`--clips`, `--unit`), `seq`, `crops --frame`, `clip --unit`, `stress --unit`. Its own test: a whole preview film at the draft tier, 1800 frames, 28.6 MB. The looks it made went to `agent/tools-looks`, which is never merged.
- `modes_builder` · reported 03:14 UTC · branch `agent/director` at `bf4642d`, merged into `main` at `7943dca` (checked by the Builder: build clean, 59 tests, G5 green). The `live` mode (drag to orbit, wheel or pinch to move in and out, `0` resets, a timeline bar, Space plays, arrows step), the menu on `M`, and `autopilot` (`hold=1`, `loop=1`, `unit=`, with `window.autopilot` reporting frame, playing, done and error). Not tested by it: the path where the asset set fails to load, a real GPU, Firefox, Safari. These go to the QA gauntlet.
- `export_builder` · reported 02:47 UTC · branch `agent/capture` at `640f955`, merged into `main` at `5e90a2c` (three files: `src/capture/export.ts`, `export.module.css`, `tools/proof.ts`). Its own test: 30 frames of h264 High at 960 x 540, frames 1500, 1515 and 1529 match capture stills at 40.0, 41.6 and 41.8 dB; memory test 240 frames across the cut at frame 240, textures at most 20.3 MB. The Builder runs both again on the final build of the phase. Its one request outside its files (open the Export page when loading fails, so the offer of the web set can be shown) is applied in `src/main.ts`.

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
- 2026-11-21 02:00 UTC · Phase 1 gate met: rough cut from the approved stills, status 05
- 2026-11-21 02:27 UTC · Phase 2: status 06, six agents logged, backdrop paint-out prompts
- 2026-11-21 02:53 UTC · Phase 2: status 07, `agent/capture` merged, pose math split from the registry, live view overrides
- 2026-11-21 03:07 UTC · Phase 2: status 08, backdrops painted out from the approved images and locked to the camera of their key, light from the sun in the picture, stand-in ground filter cost fixed
- 2026-11-21 03:29 UTC · Phase 2: status 09, the plant as a function of time (hook, husk, seed leaves, leaves, bud, bracts, rays, head turn), stem length solved to the film's height, harness and modes merged
- 2026-11-21 03:56 UTC · Phase 2: camera fit at every key, stand-in field and companion, status 10
- 2026-11-21 04:16 UTC · Phase 2: reference board, shot list, judged frames, frost and night stand-in fixes, the field draws only what the lens can see

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
- Status 05, 2026-11-21 01:59 UTC, Phase 1. Phase 1 gate met. The rough cut exists: the whole minute made from the eight approved stills, each with a slow push in the direction the camera moves, hard cuts on frames 240, 600, 900 and 1200, and a small label naming the segment. It is there so the pacing can be judged before the scene is built, and it plays on the review page under Films. The build is not waiting: it continues with the engine and the blockout. Next: Phase 2, the engine and the blockout: the plant growing through the whole film with stand-in worlds, the camera move through all eleven keys, the three modes and the rest of the harness. Time used: 1.1 h of 30 h.
  Pictures: Rough cut, frame 420 (14 s, rain). Made from the approved still; Rough cut, frame 1515 (50.5 s, bloom). Made from the approved still; Rough cut check: one frame from every segment and the frame each side of every cut.
- Status 06, 2026-11-21 02:25 UTC, Phase 2. Phase 2 has started. Six supporting agents are at work: three gather real photographs for the reference board, one studies real time-lapse footage, one builds the remaining harness commands and one builds the Export page. The page can now report where the growing tip lands and how sharp it is. A bug from the spike is fixed: the ground had never been drawn, because its triangles faced down. Backdrops with the plant painted out are being generated. Next: the plant as a function of time with its hook, husk, seed leaves, bud and opening head, then the painted-out backdrops, the field and the camera fit at every key. Time used: 1.6 h of 30 h.
  Pictures: Frame 420 (14 s, rain world): the soil and the plant's shadow are drawn for the first time. Stand-in shapes; Frame 60 (2 s, dawn world), draft tier, with the ground; Frame 1755 (58.5 s): the high wide view. The field is not built yet; Texel view of frame 60: how many texture samples each pixel gets, used by a measure.
- Status 07, 2026-11-21 02:49 UTC, Phase 2. All four scouts have reported: the reference board holds 90 real photographs across 15 parts of the plant and its weather, each part with five written observations, and four motion studies read from real time-lapse footage. The Export page and its proof command are built on their own branch and wait to be checked and merged. Each world now has a backdrop made from its approved image with the plant painted out; one take in ten was kept per world after checking that nothing else had moved. Next: lock each backdrop to the camera of its key, rebuild the plant as a function of time with hook, husk, seed leaves, bud and opening head, then the field. Time used: 2.0 h of 30 h.
  Pictures: Golden hour: the approved bloom-hero image, and the same image with the plant and the companion's leaves painted out; Dawn and rain with the plant painted out; Night and frost with the plant painted out.
- Status 08, 2026-11-21 03:07 UTC, Phase 2. Each world's backdrop now sits locked to the camera of its key, so the sky, the sun and the horizon land where the approved image has them (left of each pair: the approved image, right: the film frame). The plant and the ground are still stand-ins and the camera fit is not done. The ground was costing three times the rest of the frame in render time; fixed. Next: Stand-in plant that grows through every stage by time (hook, seed leaves, bud, head turning), the stand-in field and companion, then the camera fit at every key. Time used: 2.3 h of 30 h.
  Pictures: Keys 1 to 4, approved image left, film frame right: dawn-sprout, dawn-seedling, rain, night; Keys 5 to 8, approved image left, film frame right: frost, bloom-opening, bloom-hero, field.
- Status 09, 2026-11-21 03:29 UTC, Phase 2. The plant now grows through every stage by time alone: it comes up as a hooked arch carrying its seed husk, drops the husk, opens two seed leaves, puts out 24 leaves, forms a bud with spiky bracts, leans toward the evening sun and unfolds its rays one side first. Its top stands at exactly the height the film sets for each moment. The Live mode, the menu and Autopilot are merged, and so are the remaining harness commands. Shapes are stand-ins and the camera fit is not done. Next: The stand-in field and the companion plant, then the camera fit at every key against the approved images, then the first blockout round with an outside critic. Time used: 2.6 h of 30 h.
  Pictures: Keys 1 to 4, approved image left, film frame right: dawn-sprout, dawn-seedling, rain, night; Keys 5 to 8, approved image left, film frame right: frost, bloom-opening, bloom-hero, field.
- Status 10, 2026-11-21 03:55 UTC, Phase 2. The camera is now fitted at all eight keys by solving against measurements of the approved images, so the plant, the horizon and the sun land where each image has them (left of each pair: the approved image, right: the film frame). The field is in: 12,687 sunflowers of the same age as the plant, 8,914 of them in view in the last shot. The companion stands beside the plant, out of frame until the bloom, where its leaf tips enter at the left edge. Everything drawn is still a stand-in: shapes, colors and light are not the look yet. Next: Reference board, shot list and render budget, then the first whole-film draft and blockout round 1 with a fresh critic. Time used: 3.1 h of 30 h.
  Pictures: Dawn sprout, dawn seedling, rain, night: approved image left, film frame right; Frost, bloom opening, bloom hero, field: approved image left, film frame right.

