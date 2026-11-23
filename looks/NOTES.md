# Looks of checks

2026-11-23 01:46 UTC, at commit 0cbfcfc3 of agent/checks.

## Found on v2 b587656 with sky-b, 01:47 UTC

The sun goes out for two frames just after the sunrise of bar 27: frames 1372 and 1373 (45.733 and 45.767 s) have no sun disc, no glow and no warm light, frame 1374 has it back. Mean luminance 119.7, 93.9, 95.9, 117.0 of 255. Frame 1372 gives the same bytes on a fresh page, so it is the film and not the order of drawing. `cuts` calls it a hard cut (25.95 of 255, 6.2 times its neighbours). The dusk before it falls 27.6 of 255 into frame 1339 (the ground goes from sunlit to dark in one frame), over the limit of 20 measured on sky-0.

This replaces the caption on 53b0045 that said the lead-in frames differ by "one point of the lens": they differ by the stipple of the lens fill, which follows the frame number.

## Writes to the graphics card, a frame, by owner

Measured by `npm run checks -- writes --sky sky-0` (v2 at cfebbd6, 320 x 180, draft, the frame drawn after its neighbour) and `npm run checks -- writes --root ../main --seconds 4,14,25,35,46,56` (v1, origin/main 9325cc4, 960 x 540 preview, draft). Every call of bufferSubData, bufferData, texSubImage and texImage is noted with its size and traced to the array it was given, and the array to the object of the film that holds it.

What it says: the 25 to 35 MB a frame is not buffers. 19 to 25 MB of it is data textures written whole every frame (`uHairs` on five plant meshes: 8.56, 3.44, 3.31, 2.56, 0.72 MB; on the companion 2.16 MB and smaller; `uCrystals` 5.25 + 0.56 MB in the frost hold). Buffers are 6.3 MB (plant 5.47, field 0.85) and 10.1 MB once the companion stands (3.81). Ground and sky write nothing. The mesh numbers are places in `plant.meshes`; the part names follow in the next push.

### v2, four places

**the frost hold, bar 21.00, frame 1055**: 381 writes into what exists, 31.65 MB. By owner: plant 30.80 MB (16 texture writes 25.33 MB, 47 buffer writes 5.47 MB); field 0.85 MB (0 texture writes 0.000 MB, 318 buffer writes 0.85 MB).

| whose, and what is written | writes | MB a frame | largest MB | which |
| --- | ---: | ---: | ---: | --- |
| plant.meshes[9], texture uHairs | 1 | 8.56 | 8.56 | uHairs |
| plant.meshes[34], texture uCrystals | 1 | 5.25 | 5.25 | uCrystals |
| plant.meshes[48], texture uHairs | 1 | 3.44 | 3.44 | uHairs |
| plant.meshes[26], texture uHairs | 1 | 3.31 | 3.31 | uHairs |
| plant.meshes[41], texture uHairs | 1 | 2.56 | 2.56 | uHairs |
| plant.meshes[24], buffers | 3 | 1.96 | 0.65 | position positionB normal |
| plant.meshes[40], buffers | 3 | 0.98 | 0.33 | position positionB normal |
| plant.meshes[38], buffers | 3 | 0.76 | 0.25 | position positionB normal |
| plant.meshes[2], texture uHairs | 1 | 0.72 | 0.72 | uHairs |
| the other 121 | 366 | 4.10 | 0.56 | |

**the fast time lapse, bar 28.99, frame 1466**: 372 writes into what exists, 25.38 MB. By owner: plant 24.54 MB (7 texture writes 19.06 MB, 47 buffer writes 5.47 MB); field 0.85 MB (0 texture writes 0.000 MB, 318 buffer writes 0.85 MB).

| whose, and what is written | writes | MB a frame | largest MB | which |
| --- | ---: | ---: | ---: | --- |
| plant.meshes[9], texture uHairs | 1 | 8.56 | 8.56 | uHairs |
| plant.meshes[48], texture uHairs | 1 | 3.44 | 3.44 | uHairs |
| plant.meshes[26], texture uHairs | 1 | 3.31 | 3.31 | uHairs |
| plant.meshes[41], texture uHairs | 1 | 2.56 | 2.56 | uHairs |
| plant.meshes[24], buffers | 3 | 1.96 | 0.65 | position positionB normal |
| plant.meshes[40], buffers | 3 | 0.98 | 0.33 | position positionB normal |
| plant.meshes[38], buffers | 3 | 0.76 | 0.25 | position positionB normal |
| plant.meshes[2], texture uHairs | 1 | 0.72 | 0.72 | uHairs |
| plant.meshes[1], buffers | 7 | 0.66 | 0.11 | aSkin aSkin2 aSkin3 position positionB |
| the other 112 | 351 | 2.43 | 0.34 | |

**the storm hold, bar 35.00, frame 1775**: 440 writes into what exists, 34.77 MB. By owner: plant 24.99 MB (14 texture writes 19.52 MB, 47 buffer writes 5.47 MB); companion 8.93 MB (14 texture writes 5.13 MB, 47 buffer writes 3.81 MB); field 0.85 MB (0 texture writes 0.000 MB, 318 buffer writes 0.85 MB).

| whose, and what is written | writes | MB a frame | largest MB | which |
| --- | ---: | ---: | ---: | --- |
| plant.meshes[9], texture uHairs | 1 | 8.56 | 8.56 | uHairs |
| plant.meshes[48], texture uHairs | 1 | 3.44 | 3.44 | uHairs |
| plant.meshes[26], texture uHairs | 1 | 3.31 | 3.31 | uHairs |
| plant.meshes[41], texture uHairs | 1 | 2.56 | 2.56 | uHairs |
| companion.meshes[9], texture uHairs | 1 | 2.16 | 2.16 | uHairs |
| plant.meshes[24], buffers | 3 | 1.96 | 0.65 | position positionB normal |
| companion.meshes[24], buffers | 3 | 1.48 | 0.49 | position positionB normal |
| companion.meshes[40], buffers | 3 | 0.98 | 0.33 | position positionB normal |
| plant.meshes[40], buffers | 3 | 0.98 | 0.33 | position positionB normal |
| the other 144 | 423 | 9.34 | 0.88 | |

**the bloom, bar 61.00, frame 3112**: 426 writes into what exists, 34.03 MB. By owner: plant 24.54 MB (7 texture writes 19.06 MB, 47 buffer writes 5.47 MB); companion 8.65 MB (7 texture writes 4.84 MB, 47 buffer writes 3.81 MB); field 0.85 MB (0 texture writes 0.000 MB, 318 buffer writes 0.85 MB).

| whose, and what is written | writes | MB a frame | largest MB | which |
| --- | ---: | ---: | ---: | --- |
| plant.meshes[9], texture uHairs | 1 | 8.56 | 8.56 | uHairs |
| plant.meshes[48], texture uHairs | 1 | 3.44 | 3.44 | uHairs |
| plant.meshes[26], texture uHairs | 1 | 3.31 | 3.31 | uHairs |
| plant.meshes[41], texture uHairs | 1 | 2.56 | 2.56 | uHairs |
| companion.meshes[9], texture uHairs | 1 | 2.16 | 2.16 | uHairs |
| plant.meshes[24], buffers | 3 | 1.96 | 0.65 | position positionB normal |
| companion.meshes[24], buffers | 3 | 1.48 | 0.49 | position positionB normal |
| companion.meshes[40], buffers | 3 | 0.98 | 0.33 | position positionB normal |
| plant.meshes[40], buffers | 3 | 0.98 | 0.33 | position positionB normal |
| the other 130 | 409 | 8.60 | 0.88 | |


### v1 (main), the baseline: a scene change against the frame after it

v1 is a 60 s film of six scenes with cuts, so its places are the middle of each scene. "First frame drawn there" stands for the scene change: what the card is given when a scene is first shown.

| v1 place | frame | writes into what exists | MB | objects given NEW storage | MB new | drawn in s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dawn, 4 s, the first frame drawn there | 120 | 16 | 25.33 | 933 | 314.70 | 27.5 |
| dawn, 4 s, the frame after | 121 | 379 | 25.84 | 1 | 1.98 | 14.9 |
| rain, 14 s, the first frame drawn there | 420 | 379 | 25.84 | 70 | 19.13 | 19.4 |
| rain, 14 s, the frame after | 421 | 401 | 28.60 | 0 | 0.00 | 15.0 |
| night, 25 s, the first frame drawn there | 750 | 398 | 32.68 | 213 | 35.71 | 14.2 |
| night, 25 s, the frame after | 751 | 442 | 34.89 | 0 | 0.00 | 12.0 |
| frost, 35 s, the first frame drawn there | 1050 | 444 | 42.08 | 65 | 1.19 | 10.4 |
| frost, 35 s, the frame after | 1051 | 444 | 42.08 | 0 | 0.00 | 9.0 |
| bloom, 46 s, the first frame drawn there | 1380 | 426 | 34.03 | 103 | 2.92 | 12.5 |
| bloom, 46 s, the frame after | 1381 | 426 | 34.03 | 0 | 0.00 | 13.0 |
| field, 56 s, the first frame drawn there | 1680 | 426 | 34.03 | 136 | 0.75 | 17.3 |
| field, 56 s, the frame after | 1681 | 426 | 34.03 | 0 | 0.00 | 15.9 |

v1 writes the same hair textures whole every frame (2048 x 274, 2048 x 110, 2048 x 106, 2048 x 82 of four floats: 8.56, 3.44, 3.31, 2.56 MB), so the steady 25 to 42 MB a frame is not new in v2 and is not what dropped frames at the scene changes. What v1 does at a scene change and v2 does not is give objects new storage: 933 objects and 315 MB at the first frame the page draws at all, 70 objects and 19 MB entering the rain, 213 objects and 36 MB entering the night, 65 to 136 objects after. On v2 `made` finds no frame of the film that gives anything new storage.

- `01-b587656-sky-b-frames-1370-to-1376-the-sun-goes-o.jpg`: b587656 sky-b frames 1370 to 1376 the sun goes out in 1372 and 1373 and is back in 1374
- `02-b587656-sky-b-night-6-every-second-frame-the-dus.jpg`: b587656 sky-b night 6 every second frame the dusk falls 27.6 of 255 into frame 1339
- `03-cuts-on-b587656-sky-b-the-step-into-frame-1372.jpg`: cuts on b587656 sky-b the step into frame 1372
- `04-cuts-on-b587656-sky-b-the-step-into-frame-1339-a.jpg`: cuts on b587656 sky-b the step into frame 1339 at sunset
- `05-holds-on-b587656-sky-b-frost-hold-wide-camera-fo.jpg`: holds on b587656 sky-b frost hold wide camera four frames identical and the control after
- `06-holds-on-b587656-sky-b-storm-hold-low-camera-fou.jpg`: holds on b587656 sky-b storm hold low camera four frames identical and the control after
- `07-review-page-the-checks-with-their-broken-films.jpg`: review page the checks with their broken films
- `08-review-page-the-film-player-212-frames-drawn.jpg`: review page the film player 212 frames drawn
- `09-review-page-the-sections.jpg`: review page the sections
