# Recipe · world frost

## No files

- This world ships no file of its own. Its stand-in backdrop (the approved image with the plant painted out, `backdrop.jpg` in two sizes) was removed with its entry in `tools/standin-backdrops.ts` once the sky was computed; `backdrop.file` is `null` in `src/worlds/frost/index.ts`.

## The sky (no file)

- Decision: the frost sky is not a painting. It is fog and nothing else, a smooth grey with a wide glow round the sun, and an 8 bit picture of so smooth a field bands when the grade stretches it. The golden recipe (paint the approved sky with the plant out) is right for a sky with clouds in it and wrong for this one.
- What draws it: `src/worlds/frost/sky.ts`, a full screen pass that reads `fogLight(direction)` from `src/weather/fog/index.ts`: the fog's color at eye level (`fog.color`), its color overhead (`FOG_HIGH` in `src/worlds/frost/index.ts`), the sun's light through it (`fog.sunTint`) and the glow round the sun (`sky.glow`), plus the white disc (`sky.disc`) and slow high banks of 3.5 percent either way.
- How the numbers were found: a least squares fit of those four colors to the approved image `references/approved/frost.png`, scaled to 1920 x 1080 and taken back through the grade to scene values, over the sky above y 560 with the plant masked out. The far shapes, the banks and the neighbors fade toward the same `fogLight`, so a thing that is gone in the fog is exactly the sky behind it.
- Checks: the tones of named boxes of the sky beside the approved at 1920 x 1080 are in the reports of `agent/frost-world`.

## Decisions (no file)

- Air: the air of the frost is the fog and its seven drifting sheets (`src/weather/fog/`), at 3.8, 5, 7, 10, 15, 24 and 42 m. The even part of the fog is thin (`fog.density` 0.012) so the nearest rows, 2.9 m from the lens, keep their darks. The sheets carry the fog from there on: a low fog that lies in the field to about 1.9 m, half of each sheet solid and half the drifting banks, each sheet denser than the one before, so every row behind is paler and the far rows are gone. Ice specks in the air were tried and dropped: at the size the lens gives them they read as dust on the glass.
- Ground: no frame of the unit shows the ground. Draft stills of frames 900 to 1170 every 30 frames and 1199, and the `depth` view of frame 900, show the neighbors' leaves over every pixel under the horizon. So no crystals are placed on the grass and `src/ground/frost/` holds nothing. The pale crust on the soil and the grass is the ground's own frost state (`ground.frost: 1`). Open: if a later camera or a thinner field shows the ground in this unit, crystals from `src/weather/frost/` go on the grass blades.
- Far shapes: the nine layers of the shared skyline, drawn from `skylineRing` so they follow the film's one easing; their top edge is the shared one, so nothing steps at the cut to the golden hour. The far land under them lies at the height the shared skyline gives it for the time, under the eye while the plant is young, and is seen as faintly as the hills on it (`LAND_SEE` in `src/worlds/frost/layers.ts`), so no line of bare fog lies between the field's far edge and the ridge. A fade of the hills' feet into the fog was tried and dropped: it made that line.
- The far shapes through the unit: they stand faint over the low fog and come out as the fog thins between 36.5 and 39 s (`fogFarAt`, `SEE_FAINT` to `SEE_GAIN`), so the last second before the cut shows the ridge. The three far sheets stand lower (1.65 m) than the near four (1.9 m) so the ridge is seen over them. Open: on the side away from the sun the ridge at the cut is still about half as strong as the cut was fitted with.
- `standIn` is `false` from this point: the sky, the far layers, the air, the state of the ground and the weather are all drawn by the parts above.
