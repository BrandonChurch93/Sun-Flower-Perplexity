# Looks of checks

2026-11-23 02:56 UTC, at commit a5fa7913 of agent/checks.

## The checks on v2 aa7c0b7 with sky-b, 02:57 UTC

Correction to the note on 812fc88: the ten time lapse nights are 430 frames, not 432.

`nights` now cuts the frame into 16 by 9 parts and lists the largest move the wrong way in any one part. On aa7c0b7 the whole frame passes (largest step 13.5 of 255 against 14, wrong way 0.24 against 2) and a part does not: 18.9 of 255 the wrong way into frame 1462 (a lit leaf: 51.6, 48.9, 35.2, 16.4, 27.1, 37.4, 47.1 on frames 1459 to 1465), 17.1 into frame 1359, and 6.9 to 11.0 in every later night; up to 28 of 144 parts move more than 2 the wrong way in one frame. Listed, not judged, until it has a limit.

The frames after the sun passes behind the top leaf: the frame's mean moves +2.5, -2.7, +2.1, +7.1 into frames 1371 to 1374; the edges move 0.04 of 1 at the most, no cut.

## Writes a frame by owner, true bytes

**the frost hold, bar 21.00, frame 1055**: 103 writes into what exists, 7.58 MB. By owner: plant casters 4.46 MB (0 texture writes 0.000 MB, 21 buffer writes 4.46 MB); plant leaves 2.39 MB (47 texture writes 2.37 MB, 5 buffer writes 0.020 MB); plant stem 0.61 MB (6 texture writes 0.60 MB, 5 buffer writes 0.007 MB); plant seedling 0.13 MB (0 texture writes 0.000 MB, 9 buffer writes 0.13 MB); field 0.001 MB (0 texture writes 0.000 MB, 10 buffer writes 0.001 MB).
**the fast time lapse, bar 28.99, frame 1466**: 361 writes into what exists, 7.32 MB. By owner: plant casters 4.46 MB (0 texture writes 0.000 MB, 21 buffer writes 4.46 MB); plant leaves 1.68 MB (1 texture writes 1.66 MB, 5 buffer writes 0.020 MB); field 0.65 MB (0 texture writes 0.000 MB, 318 buffer writes 0.65 MB); plant stem 0.41 MB (2 texture writes 0.41 MB, 5 buffer writes 0.007 MB); plant seedling 0.13 MB (0 texture writes 0.000 MB, 9 buffer writes 0.13 MB).
**the storm hold, bar 35.00, frame 1775**: 151 writes into what exists, 19.93 MB. By owner: plant casters 5.44 MB (0 texture writes 0.000 MB, 24 buffer writes 5.44 MB); companion casters 3.31 MB (0 texture writes 0.000 MB, 24 buffer writes 3.31 MB); plant bud 3.28 MB (4 texture writes 3.28 MB, 0 buffer writes 0.000 MB); plant leaves 2.93 MB (2 texture writes 2.91 MB, 5 buffer writes 0.020 MB); plant stem 2.05 MB (6 texture writes 2.04 MB, 5 buffer writes 0.007 MB); companion bud 0.91 MB (4 texture writes 0.91 MB, 0 buffer writes 0.000 MB); companion leaves 0.84 MB (2 texture writes 0.84 MB, 5 buffer writes 0.007 MB); companion stem 0.68 MB (6 texture writes 0.68 MB, 5 buffer writes 0.002 MB); field 0.20 MB (0 texture writes 0.000 MB, 38 buffer writes 0.20 MB); plant seedling 0.13 MB (0 texture writes 0.000 MB, 9 buffer writes 0.13 MB); parts[puddles] 0.081 MB (0 texture writes 0.000 MB, 2 buffer writes 0.081 MB); companion seedling 0.047 MB (0 texture writes 0.000 MB, 9 buffer writes 0.047 MB); parts[rain] 0.034 MB (0 texture writes 0.000 MB, 1 buffer writes 0.034 MB).
**the bloom, bar 61.00, frame 3112**: 387 writes into what exists, 18.68 MB. By owner: plant bud 6.00 MB (2 texture writes 6.00 MB, 0 buffer writes 0.000 MB); plant casters 4.45 MB (0 texture writes 0.000 MB, 21 buffer writes 4.45 MB); companion casters 3.55 MB (0 texture writes 0.000 MB, 21 buffer writes 3.55 MB); plant stem 2.94 MB (2 texture writes 2.94 MB, 5 buffer writes 0.007 MB); plant leaves 0.71 MB (1 texture writes 0.69 MB, 5 buffer writes 0.020 MB); field 0.67 MB (0 texture writes 0.000 MB, 318 buffer writes 0.67 MB); companion leaves 0.23 MB (1 texture writes 0.22 MB, 5 buffer writes 0.007 MB); plant petals 0.13 MB (1 texture writes 0.13 MB, 0 buffer writes 0.000 MB); companion stem 0.002 MB (0 texture writes 0.000 MB, 5 buffer writes 0.002 MB).

- `01-aa7c0b7-sky-b-the-part-of-the-frame-that-moves-m.jpg`: aa7c0b7 sky-b, the part of the frame that moves most the wrong way: a leaf lit in the night goes dark at frame 1462 before the sun's light reaches it; the frame's mean hides it
