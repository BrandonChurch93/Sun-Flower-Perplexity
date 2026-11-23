# Rules for every agent on version 2

You are one of several agents building parts of one film. Read this file, then your own brief in this folder, then `kit/v2/NOTES-FROM-BRANDON.md` and `kit/v2/PLAN.md`. The Builder is the agent `/root`. You report to it and to nobody else.

## The film

- One sunflower, from a seed in bare soil to a field in bloom, in one take with no cut: 2:07.0 at 30 frames a second (3,810 frames), made to be recorded live from a web page at 1920 x 1080 while Brandon's music track plays.
- It is a time lapse. The sun keeps time with the music: every sunrise lands on a bar line (140 BPM, bar n starts at 0.883143 + (n - 1) x 1.714286 s). Fifteen days fly past while the plant grows.
- Twice the time lapse stops and we stay inside one moment: a frost morning (bars 17 to 25) and a thunderstorm (bars 33 to 41). In those two holds the plant does not grow at all. It may sway, nod under drops, carry frost. Then the days start again.
- The last day slows down for the bloom (bar 57, fully open at 61), the camera cranes up over the field (65 to 69) and the sun sets on bar 73.
- The bar: a viewer believes they are watching real footage from a cinema nature documentary. Version 1 is the floor: nothing may look worse than it did. Its pictures are `out/stills/film-1-preview-review.jpg`, `film-2-...` and `film-3-...`.
- The targets: the eight approved pictures in `references/approved/` (never edit that folder) and nine more for the new states in `references/v2/keys/`. Look at them before you write anything. `references/v2/NOTES.md` says what each one is for.
- No people, animals, insects, buildings, text or interface in any film frame. No fade in and no fade out: frame 0 and the last frame are finished pictures.

## One instant

Everything in a frame is a pure function of the film second. Read `src/v2/api.ts` first: it is short and it is the contract.

- `Moment` (`src/v2/now.ts`, `momentAt(seconds)`): the film second `t`, the bar, the plant's clock `tau`, the world clock, where the sun and the moon are, the one light of the scene, how far the clouds have travelled, and the `dials`.
- `Dials`: fifteen numbers from 0 to 1 that say what the weather is doing. They are the only way weather arrives or leaves. Nothing is switched on or off by a cut: every part is always in the scene and follows its dials. A part whose dial is 0 hides its objects and costs nothing.
- Three clocks reach every shader: `uTime` is the plant's clock (it stands still in a hold, so nothing may grow on any other clock), `uReal` is the film second (wind, rain, ripples, glints and drifting mist run on it, so they keep moving in a hold), `uWorldTime` is the day count.
- `npm run filmclock` writes every frame's instant to `out/work/filmclock.csv`. The table at the end of this file is a digest of it.
- Any frame can be drawn alone, in any order, and gives the same pixels. So: no state carried from one frame to the next, no accumulation over frames, no `Math.random`, `Date.now` or `performance.now` in anything that can change a pixel. Seeded hashes of position, frame and index only (`src/core/random.ts`).

## How a frame is drawn

`src/director/film.ts`, method `draw`, is the one draw path. In short: `setNow(frame)`, the sky says what light it gives (`Sky.light`), `src/v2/look.ts` turns that and the dials into the frame's light, fog and grade, every `Part` and the sky are prepared once, and then each sample of the frame draws the sky behind everything and the scene on top, into a half float target. The lens and grade (`src/post/`) finish the frame.

- A frame is 1 sample when the film plays live (`draft` tier) and 8 or 48 when it is exported (`review`, `final`). With more than one sample each sample has its own moment inside the shutter, its own point on the lens and its own subpixel: that is how motion blur and depth of field are made. At one sample the lens pass blurs by the circle each pixel carries in alpha. Your part has to look right in both.
- Light arrives in shared uniforms (`src/core/shading.ts`): `uSunDir`, `uSunColor` (the direct light on a surface that faces it, already cut by cloud and mist), `uSkyZenith`, `uSkyHorizon`, `uSkyHorizonSun` (the sky low toward the sun), `uGroundBounce`, `uSkyEven`, the fog (`uFogColor`, `uFogSunTint`, `uFogDensity`, `uFogFalloff`). Never keep a colour of the light in your own code: take it from these, so that the plant, the ground, the far land and the sky always agree at every moment of every day.
- Units are linear and open ended. A white card that faces a clear noon sun reads 10. The noon sky reads about 0.3, 0.6, 1.45 overhead and 2 to 3 near the horizon. At night everything is hundreds of times darker and the look raises the exposure, as a camera would.
- A thing that is not the sky or a `Part` (the ground, the plant, the field) is prepared by `film.ts` itself. If your brief gives you one of those folders, keep the way `film.ts` calls it, or tell the Builder exactly which call must change.
- A new part of the place is a file `src/<your folder>/onstage.ts` that exports `make(): Part[]`. `film.ts` finds it by that name, adds its objects to the scene and calls it every frame. `npm run bench -- --only sky,ground,<folder name>` draws it alone with the sky and the ground.

## Nothing is made after loading

Version 1 fell to one or two frames a second at every change of scene, because shader programs were built and textures were sent to the graphics card at the first frame that needed them. Brandon saw it and it must not happen again.

- Everything is made in `load()`: every texture, buffer, render target and program, at its final size. `warm()` then draws once with every program and every variant of it, so the graphics card has really built them.
- After that, nothing is created: no `new` of a texture, target, geometry or material, no change of a `#define`, no resize of a buffer, no `needsUpdate` on a texture. Updating the contents of a buffer that already exists, at the same size, is allowed.
- `npm run bench -- --sky sky-0 --only <what you draw> --count` plays 200 frames across the film and prints PASS or FAIL. FAIL is a defect, however good the picture is.
- Cost matters as much as looks: the film has to hold 30 frames a second at 1920 x 1080 on Brandon's graphics card, which we cannot measure from here. Every frame draws the whole scene once. So: few passes over the whole screen, no loop in a fragment shader longer than it has to be, work that does not depend on the pixel moved to the vertex shader or to `prepare`. Where a choice trades cost for looks, make it follow `view.quality`: `film` is the export, where cost does not matter, `high` is live playback on a good card, `low` is live playback on a weak one. Say in your report what each level costs you: passes, draw calls, texture megabytes.
- The only speed you can measure here is the software renderer: `npm run bench` prints seconds a frame. Use it to compare your own changes with each other, and with the same shot drawn without your part.

## Setting up

```
git clone --depth 1 --branch v2 https://github.com/BrandonChurch93/Sun-Flower-Perplexity.git
cd Sun-Flower-Perplexity
git config user.name "Brandon Church"
git config user.email "200545962+BrandonChurch93@users.noreply.github.com"
git checkout -b agent/<your folder name>
npm ci
npx playwright-core install chromium
npm run bench -- --sky sky-0 --shots 02,05
```

The last line must print two shots and write a sheet under `out/work/bench/sky-0/`. On a sandbox whose system the browser installer does not know, set `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` for the install and for every bench run. If the clone, the install or the push fails twice, tell `/root` at once with the exact error.

- `npm run bench -- --sky sky-0 --shots all` draws the sixteen moments of `src/v2/shots.ts` at 960 x 540 with one sample. `--format 16x9` is 1920 x 1080. `--tier review` is 8 samples. `--only all` draws the whole scene, `--only sky,ground,plant` names what is drawn. `--view film` is the film's own camera, and `low`, `up`, `wide`, `west` and `crane` are fixed ones. `--clip 73,85 --view wide` makes a clip of those film seconds. The top of `tools/bench.ts` lists it all.
- Open every picture you render and look at it at full size, beside the reference pictures. A report that says a thing looks right without a picture you looked at is not accepted.
- `npm run build` runs the type check. `npm test` runs the tests. Both pass before every push.
- The steps of this sandbox time out after ten minutes: start anything longer in the background, write its output to a file, and poll it.

## Your folder, your branch

- You own the folder or folders your brief names, and nothing else. Do not edit a file outside them, not even to fix it. If you need a change outside (a shared uniform, a call in `film.ts`, a number in `config/showcase.json`), send `/root` a message that says exactly which line you need and why, and carry on with a stand-in on your side meanwhile.
- Work on the branch `agent/<your folder name>` that you made from `v2`. Never force push. Never rebase. When `/root` tells you `v2` has moved, `git fetch origin v2` and merge it.
- Heartbeat: at least every 30 minutes, commit and push your branch, and push your newest pictures with `npm run looks -- --agent <your folder name> "caption=file" ...` (1 to 12 pictures or short clips, with captions that say what each shows and what is still wrong with it). The Builder shows those pictures to Brandon. Push pictures however unfinished they look: a bad picture seen early is the point. An agent that has pushed nothing for 45 minutes is replaced.
- Every commit message ends with this trailer, once: `Co-authored-by: Perplexity <noreply@perplexity.ai>`
- You may not start agents of your own.

## The house rules

- TypeScript, strict. three.js 0.187 with raw GLSL ES 3.00 shaders, WebGL2 only. No new dependency without asking.
- Every number the film is timed by lives in `config/showcase.json` or `src/v2/clock.ts`. Import it, never type it again.
- Almost no comments in code: a comment only where the reason for a line cannot be read from it. Plain names.
- No em dashes and no exclamation points in any copy, comment or file name. No model names or version strings anywhere. No file from the internet without telling `/root` its source and license, for `ASSETS.md`. Every generated asset has its recipe beside it.
- Never commit an audio file. Never touch `references/approved/`.

## Your report

When your brief's work is done, or at the time your brief gives, send one message to `/root`: your branch and its last commit, what you built, how you tested each part and what the test printed, what `--count` printed, the cost at each quality level, what is unfinished or worse than the references and why, what you assumed, and every change you need outside your folder. Attach your best pictures. Then stay available: the Builder will send you what it and the critics see, and you fix it.

## The film second by second

From `out/work/filmclock.csv`. Sun height and compass direction in degrees. The camera looks toward about 186 at the start, 193 in the storm hold, 206 at the bloom and 204 at the end of the crane, so the sun rises right of centre and sets left of centre, in the left third of the frame at the bloom. A larger azimuth lies further left in the frame. In the fast time lapse (bars 25 to 33 and 41 to 57) the sun sets on beat 3 of every second bar and rises on the next bar line: every night of the film lasts 0.83 to 0.97 s, the sun goes 14 degrees under the horizon and no deeper, and a glow stays on the horizon all night.

| Bar | Second | Plant clock | Sun height | Sun azimuth | What is happening | Dials that are not at rest |
| --- | --- | --- | --- | --- | --- | --- |
| lead-in | 0.0 | 0 | -5 | 175 | blue hour over bare soil | dew 1, cover 0.1 |
| 1 | 0.88 | 0.6 | 0 | 175 | the first sunrise, slow | dew 1 |
| 3 | 4.3 | 3.4 | 61 | 185 | noon of day 1 | lapse 0.6 |
| 4.3 | 6.5 | 5.2 | 6 | 196 | the first sunset | |
| 4.7 | 7.3 | 5.7 | -14 | | the first night: the moon, stars, 0.9 s with the sun down | |
| 5, 9, 13 | 7.7, 14.6, 21.5 | 6, 8.8, 10.5 | 0 | 176 | sunrises, a day every 4 bars | cover 0.14 to 0.26, lapse 0.5 |
| 16.7 | 27.8 | 12 | -14 | | the frost night | cold 0.5, frost 0.5, fog 0.28, all rising from bar 16.4 |
| 17 | 28.3 | 12 | -0.7 | 177 | FROST HOLD begins: first light on frost | fog 0.8, frost 1, cold 1, sunThrough 0.2, lapse 0.02 |
| 21 | 35.2 | 12 | 5.5 | 178 | the sun stands in the mist | the same |
| 23 | 38.6 | 12 | 6.7 | 179 | the sun clears the mist; the frost has been melting since bar 22.5 | fog 0.57, sunThrough 0.54, frost 0.91 |
| 25 | 42.0 | 12 | 9 | 179 | the thaw: the hold ends, the days start | fog 0.35, frost 0.15 (gone at bar 25.4), dew 1, wet 0.45 |
| 26 | 43.7 | 13.2 | 42 | 193 | full time lapse, a day every 2 bars | lapse 1 |
| 26.5, 28.5, 30.5 | 44.6, 48.0, 51.4 | 14 to 20.1 | 0 | 200 to 202 | sunsets on beat 3, then a night of two beats | |
| 27, 29, 31 | 45.5, 48.9, 52.3 | 14.8 to 20.8 | 0 | 178 to 180 | sunrises | cover 0.2 to 0.42 |
| 32 | 54.0 | 22.3 | 56 | 194 | the storm front races in | cover 0.68, overcast 0.23, wind 0.26 |
| 32.5 | 54.9 | 22.8 | 30 | 198 | the deck closes | cover 0.92, overcast 0.77, sunThrough 0.13 |
| 33 | 55.7 | 23 | 16 | 200 | STORM HOLD begins: lightning | cover 1, overcast 1, sunThrough 0, flash 1, wind 0.54 |
| 34 | 57.5 | 23 | 15.4 | 200 | the rain is down: it rose smoothly from the lightning at bar 33 | rain 1, wet 0.26, puddle 0.1 |
| 36 | 60.9 | 23 | 14.3 | 200 | everything wet, the puddle full | wet 1, puddle 0.93 |
| 37 | 62.6 | 23 | 13.7 | 200 | lightning again | flash 0.82 |
| 40 | 67.7 | 23 | 12 | 200 | the rain thins from bar 39.5 | rain 0.85, then 0.74 at bar 40.25 |
| 41 | 69.5 | 23 | 11.5 | 201 | THE BREAK: the sun tears through the last rain | burst 1, sunThrough 0.41, cover 0.91, overcast 0.74, rain 0.45 (0.18 at bar 41.4, 0 at 41.8) |
| 42 | 71.2 | 23.8 | 9.3 | 201 | the deck is gone, the days start | burst 0.41, cover 0.4, wet 0.8 |
| 42.5 | 72.0 | 24.6 | -2 | 203 | the first sunset after the storm, a night of 0.9 s | wet 0.62, puddle 0.69 |
| 43 to 55, odd | 72.9 to 93.5 | 30 to 43.4 | 0 | 181 to 187 | seven sunrises, a day every 2 bars; sunsets at 44.5 to 54.5 | lapse 1, cover 0.2 to 0.37 |
| 56 | 95.2 | 43.5 | 52 | 212 | the last day slows down | evening 0.5 |
| 57 | 96.9 | 43.5 | 8 | 223 | THE BLOOM begins, low gold sun ahead | evening 1, lapse 0.02 |
| 61 | 103.7 | 51 | 5 | 224 | the flower is fully open | wind 0.48 |
| 65 | 110.6 | 52 | 3 | 225 | the crane up begins | |
| 69 | 117.5 | 58.5 | 1.5 | 226 | the whole field | |
| 73 | 124.3 | 59.9 | 0 | 226 | the sun touches the horizon | |
| end | 127.0 | 60 | -5 | 226 | afterglow, the last frame | |

## What version 1 left behind

The code of version 1 is still in the repository and most of it is good: the plant, the soil, the field, the rain, the frost, the lens. Version 2 keeps it and changes how it is driven.

- Version 1 was six scenes with hard cuts, each with its own weather, sky and far land, and many things were switched by the scene: `config.segments`, `config.keys`, `config.worlds`, `segmentById`, `segmentStart`, `worldOf`, `src/director/growthline.ts`, `src/director/registry.ts`, `src/director/inputs.ts`, everything under `src/worlds/` and `src/units/`. All of that is dead. The version 1 scene times (rain from 8 to 20 seconds, night from 20, frost from 30, bloom from 40, field from 52) mean nothing now. When your work is done, this prints nothing for your folders: `rg -n "segmentById|segmentStart|config\.segments|config\.keys|config\.worlds|worldOf|growthline|director/registry|director/inputs|worlds/|units/" src/<your folder>`
- What replaces them: the plant's clock `tau` for everything that grows (`shared.uTime`, and the marks in `config.growth`: the frost hold stands at tau 12, the storm hold at 23, the bud at 43.5, the flower is open at 51, the crane starts at 52), and the dials for everything the weather does. The instant of the frame being drawn is `now`, and the close of its shutter `later`, both exported by `src/v2/now.ts`: `film.ts` sets them before it calls anything, so any module may read `now.dials.rain`, `now.night`, `now.sun`.
- Version 1 hid changes behind its cuts: a set of clods swapped for another, grass that appeared, a field that jumped in age. There is no cut to hide behind now. Nothing may pop: whatever changes does so over time, or where the lens cannot see it.
- Version 1 knew where the sun was in each scene and some code leans on that (a fixed sun direction, a fixed side the light comes from). The sun now crosses the whole sky fifteen times. Nothing may assume where it is.
- What version 1's critics said, in their words, is in `scorecards/round-026/SUMMARY.md`. Read the part about your subject: those defects are yours to remove.
