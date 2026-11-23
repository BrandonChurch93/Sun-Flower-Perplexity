# Looks of checks

2026-11-23 02:42 UTC, at commit 87ce6289 of agent/checks.

## The checks on v2 aa7c0b7 with sky-b, 02:45 UTC

Every sunset and sunrise of the time lapse from bar 26.5 to bar 55 is drawn frame by frame (ten nights, 432 frames, 320 x 180, draft). The frame's mean luminance only falls through each dusk and only rises through each dawn. Largest step 13.5 of 255 into frame 1464 (sunrise of bar 29) against the limit of 14; largest move the wrong way 0.24 against 2. The sunset step into frame 1339 is 4.5 now (was 27.6 on b587656).

Found by eye on the night sheets, and not caught by the frame mean: the leaves of the plant blink dark at every dusk and dawn. The leaves are lit warm in the night, and for one or two frames between the sun's light and the night's light they have neither. Night of bar 28.5: leaves 40.9, 31.7, 35.7, 40.6, 42.1 of 255 on frames 1444 to 1448 (darkest at the handover, brighter again in the night), and 40.0, 34.8, 30.4, 39.3, 48.2 on frames 1460 to 1464. Night of bar 26.5: 42.3, 37.8, 37.9, 34.2, 34.0, then 43.6 at midnight; dawn 35.4, 32.0, 27.6, 33.5. Measured on the pixels that are leaf in the midnight frame.

The sun passing behind the top leaf at frames 1371 and 1372 is not read as a cut: `cuts` now reads where the edges of the picture lie in the sky half and the land half, with the brightest 2 percent held down. 496 steps measured, largest 0.36 of 1 (stars moving in the night sky), limit 0.5 and 4 times the steps round it.

Holds by the picture: frames 849, 850, 1054, 1259 and 1672, 1673, 1877, 2082 are the same in every one of 691,200 numbers from two cameras. With the film broken on purpose (the plant drawn at the film second in place of its clock) the same check fails: 39,295 to 177,410 numbers differ in the Frost hold.

`pure`: frames 400, 1054, 1372, 1466, 1877, 2500, 3112, 3500, 3780 at 960 x 540 give the same bytes drawn again backwards and on a fresh page: 18 comparisons, 0 differ.

Writes a frame with true bytes (a part of a texture counts its rectangle): frost hold frame 1055 103 writes, 7.58 MB; time lapse frame 1466 361 writes, 7.32 MB; storm hold frame 1775 151 writes, 19.93 MB (hair textures 9.94 MB written whole, plant and companion mesh buffers 8.75 MB); bloom frame 3112 387 writes, 18.68 MB (hair textures 9.97 MB).

Not drawn yet at this hour: the nights of bars 1 to 17 and the ending.

- `01-aa7c0b7-sky-b-the-plant-alone-at-the-dusk-and-da.jpg`: aa7c0b7 sky-b, the plant alone at the dusk and dawn of bar 28.5: the leaves go dark for one or two frames between the sun's light and the night's light (frames 1445 and 1462), then are lit again in the night
- `02-aa7c0b7-sky-b-the-night-of-bar-28-5-every-second.jpg`: aa7c0b7 sky-b, the night of bar 28.5, every second frame: the largest step of the frame's mean in the ten time lapse nights, 13.5 of 255 into frame 1464, limit 14
- `03-aa7c0b7-sky-b-frames-1365-to-1372-at-the-sunrise.jpg`: aa7c0b7 sky-b, frames 1365 to 1372 at the sunrise of bar 27: the sun passes behind the top leaf, the cut check reads no cut
- `04-aa7c0b7-sky-b-dawn-of-bar-29-frames-1461-to-1466.jpg`: aa7c0b7 sky-b, dawn of bar 29, frames 1461 to 1466 as drawn
- `05-aa7c0b7-sky-b-the-cut-check-s-strip-at-the-large.jpg`: aa7c0b7 sky-b, the cut check's strip at the largest brightness step, into frame 1464: edges move 0.05 of 1, no cut
- `06-aa7c0b7-sky-b-the-frost-hold-from-the-low-camera.jpg`: aa7c0b7 sky-b, the Frost hold from the low camera, frames 849, 850, 1054, 1259 identical and 1304 after it
- `07-aa7c0b7-sky-b-the-storm-hold-from-the-wide-camer.jpg`: aa7c0b7 sky-b, the Storm hold from the wide camera, frames 1672, 1673, 1877, 2082 identical and 2127 after it
- `08-film-broken-on-purpose-picture-grows-the-frost-h.jpg`: film broken on purpose (picture-grows): the Frost hold from the low camera, the check fails on it
- `09-the-review-page-the-checks-built-02-41-from-aa7c.jpg`: the review page, the checks, built 02:41 from aa7c0b7
- `10-the-review-page-the-film-player-at-bar-34-in-the.jpg`: the review page, the film player at bar 34 in the Storm hold
