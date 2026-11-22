# Brief: the place

Your folder is `src/place/`. You build the far land of the film: everything from the edge of the sunflower field to the horizon. It is one place, the same in every frame, and only the light and the weather change on it. In version 1 each kind of weather had its own far land, and the critics caught it: "the low, rounded tree-lined hills ... have turned into a jagged rocky mountain ridge, so it reads as a different place". That is the defect you remove.

Your part enters the film as `src/place/onstage.ts`, exporting `make(): Part[]` (`src/v2/api.ts`). Test with `npm run bench -- --sky sky-0 --only sky,ground,place` and, for the whole picture, `--only all`.

## The place

Farmland in rolling country, as in the reference pictures (`references/approved/field.png`, `references/v2/keys/last.png`, `late.png`, `climb.png`, `climb-fair.png`, `storm.png`, `frost.png`, `open.png`): beyond the field, more fields in soft strips of different crops and tilled earth, hedgerows and lines of trees between them, a few lone trees and copses, then low rounded wooded hills, two or three ranges deep, fading into the haze. No buildings, no poles, no roads, no fences, no animals.

- The plant stands at the origin. The sunflower field (`src/field/`, another agent) lies behind it as the camera sees it and reaches to about 66 m (`fieldPicturesM` in `src/field/layout.ts`), with a last band to about 74 m. The ground mesh (`src/ground/`, another agent) is the soil round the plant. You own what lies beyond and round those, out to the horizon in every direction the camera can see, and you must leave no gap and no hard line where your land meets theirs: look at `--only all --view crane` at film seconds 110 to 127.
- The camera: for most of the film it is 5 cm to 1.7 m above the soil, and the far land is a thin strip at the horizon, often out of focus. Its silhouette against the low sun is what matters there: tree crowns and hill lines, soft and believable, with light coming through gaps. At the end the camera cranes up to 4 m and higher at 24 mm with deep focus and looks over the field toward the setting sun (azimuth 222 to 226): that is your hero shot, and every tree line and field strip is seen sharp. The fixed views `low`, `wide`, `west` and `crane` of `src/v2/shots.ts` are the cameras to test with, and `--view film` is the film's own.
- The sun rises at azimuth 175 to 187 and sets at 198 to 226. Compose the land for those directions: a notch or a low saddle in the hills where the sun comes up and where it goes down, so that the disc is seen to touch the land, and taller things to the sides to frame it. The land in the directions the camera never looks may be simpler, and it must still exist.

## The light on it

Every moment of fifteen days passes over this land in two minutes, so nothing about its light may be painted in.

- Lit by the shared light (`uSunDir`, `uSunColor`, `uSkyZenith`, `uSkyHorizon`, `uSkyHorizonSun`, `uGroundBounce`), with real normals, so that the hills model as the sun crosses and their shadowed sides fall dark at low sun. Tree lines need a lit side and a shaded side, and a rim of light when the sun is behind them.
- The air between the lens and the land: far things lose contrast and take the colour of the sky at the horizon, more toward the sun, as real haze does. Take those colours from `uSkyHorizon` and `uSkyHorizonSun` and the fog uniforms, never from constants, so that the land always dissolves into the sky that is really behind it, at noon, at dusk, in the storm and at night.
- In the frost hold (`dials.fog` 0.8, `dials.frost` 1, `dials.cold` 1): mist lies in the hollows and the far land is layers of soft grey shapes, each paler than the one before, with the sun's glow through them. Fields nearest the camera carry white frost.
- In the storm (`dials.overcast` 1, `dials.rain` 1): the land is dark and cold, the far ranges vanish in rain, and `dials.flash` lights the land for a few frames from the direction `now.flashAt`. With `dials.wet` the near strips darken.
- At night and in the blue hour: silhouettes against the last light, with the moon's light from `uSunColor` when `lightKind` is `moon`.
- In the time lapse the days fly: nothing on the land may flicker or crawl. Trees move a little in the wind on `uReal`, never on `uTime`.
- The lens: write the blur circle of each fragment in alpha exactly as the ground does (`src/ground/soil.ts` shows how), so the lens pass blurs the far land with the rest.

## What exists

Version 1 drew its far land in `src/worlds/*/layers.ts` (five versions of it), `src/weather/skyline.ts` (a skyline of hills and tree crowns) and `src/worlds/golden/air.ts`. Read them, keep what is good, and make one. `src/core/shading.ts` (`makeSurface`, `glslCommon`) is how every surface in the film is made: use it, so the fog, the diagnostic views and the blur circle work.

## What is judged

1. `--only all --view crane` at 1920 x 1080, 8 samples (`--format 16x9 --tier review`), shots 15 and 16: beside `references/v2/keys/last.png` and `references/approved/field.png`.
2. `--only sky,ground,place` with the views `low` and `wide` for shots 01, 02, 05, 07, 10, 11, 12 and 13: the silhouette against each sky.
3. A clip: `--clip 43.5,50.5 --view wide --only sky,ground,place`: two days pass over the land with no flicker.
4. `--count` prints PASS, and what your part costs.

Send your report to `/root` 120 minutes after you start, or sooner if you are done. Push your branch and your looks at least every 30 minutes. A whole place, however plain, must be pushed within your first 45 minutes.
