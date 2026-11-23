# Brief: the look of the plant's skin

Your folders are `src/plant/look/` and the top level files of `src/plant/surface/` (today `index.ts`). Not yours: `src/plant/surface/wet/` (rain), `src/plant/surface/frost/` and `src/plant/surface/dew/` (frost), and everything else in `src/plant/` (the plant owner, `/root/plant_builder`). Your branch is `agent/leaf-look`, your looks name is `leaf-look`.

## What it is

The fragment side of the hero plant: what colour a leaf is, what light it passes, how it shines.

- `src/plant/surface/index.ts` holds `tissueShade`, the light model of every thin part of the plant (leaf, seed leaf, bract, ray, floret, stalk, stem), with its constants (`TISSUE_THROUGH`, `TISSUE_SLATE`, `TISSUE_FUZZ`, `TISSUE_DOWN`, `TISSUE_LATE` and the rest) and `tissueEvening()`.
- `src/plant/look/leaf.ts` holds the leaf's own colours: albedo of the upper and the under side, veins, what the blade passes, wax, sheen. The plant owner is moving that text there from `src/plant/leaves/shaders.ts` without changing a pixel, and `src/plant/look/body.ts` (stalk and stem colours, from `plantColor` in `src/plant/index.ts`) if it can. Until `/root` sends you the hash of that move, read, render your baselines and edit nothing.
- The vertex shaders, every buffer and the processor cost of the plant belong to the plant owner, who is rebuilding how the plant is laid (keys and blends) while you work. The list of varyings and uniforms your fragment text reads is the contract between you two: it stands as the one comment at the top of `src/plant/look/leaf.ts`. Whoever needs to change it writes to the other first.

## The problem

Bar 29.7 (frame 1502): noon of a fair day in the climb, the sun 39 degrees up, ahead of the lens and a little to the left, so the plant is lit from behind. The key is `references/v2/keys/climb-fair.png`.

- The key: grown leaves a saturated mid green, lit through from behind, yellow green where the sun crosses a blade and its veins stand dark in the glow, deep green in their own shade, a soft sheen, fine veins. The stem is green with a lit rim.
- The film: the grown leaves read dark teal and matt with white ribs, and the stem nearly black.

The hero is in every frame and the fair days are most of the film's growing time, so this is the largest gap to the references left in the film.

Read from the code by `/root` (check each before you rely on it):

- A ripe upper side is `vec3(0.024, 0.068, 0.042)`: blue at 62 percent of green. A young blade is multiplied by `(1.0, 1.3, 0.52)`, a ripe one by 1, so the leaf turns teal as it ripens.
- `TISSUE_SLATE` (0.21) adds the high sky, times `(0.6, 0.85, 1.0)`, to every broad face with down on it. Under the deep blue of a fair noon that is a slate blue over the green.
- What a blade passes is at most `0.2 * TISSUE_THROUGH` (0.17), 3.4 percent in green. A living leaf passes roughly a tenth of green light. Doubling `TISSUE_THROUGH` alone changed 12 thousand of 518 thousand pixels at bar 29.7 and not the read.
- `wax` 0.45 with `rough` 0.82 on the upper side: in grazing back light every ridge between two side veins throws a pale highlight, which is the white ribs.
- `tissueEvening()` goes by the plant's clock (`uTime` from 52 to 55 s, which is bars 65 to 67 of this film). Version 1 had one evening. This film has a sunrise and a sunset in every day of the time lapse, and its last day is one long evening from bar 57 on.

## What to make

1. The fair day. Grown leaves green first and sheen second: a saturated mid green on a lit face, a yellow green glow with dark veins where the sun comes through a blade (most of all on an under side seen against the sun, some of it on an upper side whose blade stands between the sun and the lens), a deep but still green shade, and a soft broad sheen that is a paler green and never white or blue ribs. The stem and stalks green, with the down lit on the sun's side.
2. Every sunrise and sunset. A day of the time lapse is two bars long (3.4 s), six beats of day and two of night, and the sun is low twice in each. With a clear low sun the leaves take its colour: gold where it comes through, a warm rim. This goes by the light (`uSunDir.y`, `uSunColor`, `tissueClearSun()`), never by the plant's clock. If you need a number the shader does not have, ask `/root` for a shared uniform; the weights of the kinds of light (`weightsAt` in `src/v2/look.ts`) can be handed to you.
3. The last evening, bars 57 to 75 (keys `late.png` and `last.png`). From bar 65 the leaves read lime: they should take the low sun's colour at about half the brightness they have now. The step at bars 65 to 67, where the clock switches the evening on, must go: it is a change of look with no change of light.
4. Hero and neighbours agree. The near neighbours of the field are the same parts drawn with `PLANT_FIELD`; they must stay the same plant as the hero at bars 47.75, 61 and 69.
5. Not to change for the worse: the frost hold (bars 17 to 25, key `frost.png`), the storm hold (bars 33 to 41, keys `storm.png`, `storm-flash.png`, `break.png`) and the nights. The wet, frost and dew skins on top of yours are other owners'. If a change of yours shifts their look, send the pair to that owner (`/root/rain_builder`, `/root/frost_builder`) and to `/root`.

## Limits

- Fragment text only. No new texture, program, pass or buffer; nothing made after loading (`npm run bench -- --only all --count`); a frame stays a pure function of its number.
- The draw must not cost more: say what you added per pixel in your report (texture reads, branches).
- No clock in the look: nothing may depend on `uTime` except what already moves with the plant's growth (ripeness and the like, which come as varyings).

## What is judged

1. `npm run bench -- --only all --bars 27.75,29.12,29.7,45.15,45.75,46.42,47.75,52,61,66,69,73 --name day --cols 4 --tier draft`, and the same list at `--tier review` before your report. Bars 29.12 and 45.15 are sunrises, 46.42 is a sunset.
2. The guard: `--bars 3,13,21,23.5,35,37.02,41.25` and `--frames 2150-2190:10` before and after, side by side.
3. Pairs beside the keys at bars 29.7 (`climb-fair.png`), 47.75 (`late.png`), 69 and 73 (`last.png`), the plant cropped large.
4. `--count` prints what it printed before your change, and the line of `COMMON.md` prints nothing for your folders.

A first heartbeat with the pair at bar 29.7 within 40 minutes of your start. After that a heartbeat at most every 30 minutes, each with the pair and the guard. Your report goes to `/root` when the day reads as the key, or after 150 minutes, whichever is first.
