# Brief: the sky

Three agents build this sky at the same time, each alone, from this one brief. The Builder and a blind jury compare the three on the same bench, and the best one becomes the sky of the film. Its author then carries on as the owner of the sky. So: looks first, then cost, and never a broken contract.

Your folder is `src/<your folder name>/` (`sky-a`, `sky-b` or `sky-c`, as your message says). It exports `make(): Sky` from `index.ts`. `src/sky-0/index.ts` is a stand-in that shows the whole contract in 160 lines: read it before anything else, and `src/v2/api.ts` (`Sky`, `SkyLight`, `Moment`, `Dials`, `CloudDrift`, `View`).

Test with `npm run bench -- --sky <your folder name>` (sky and ground only, the sixteen shots of `src/v2/shots.ts`).

## What the film needs from the sky

The film is a time lapse of fifteen days, seen mostly from a camera near the ground that looks at the horizon. The sky is in every frame, and in the time lapse it is the thing that moves. If the sky looks like a computer graphic, the film fails, whatever else is right.

What the lens sees, in order of screen time:

1. The lowest 20 degrees above the horizon, toward the rising sun (azimuth 175 to 187) and the setting sun (198 to 226). Rows of far cumulus stacked toward the horizon by perspective and the curve of the Earth, haze, the warm band, the sun's disc itself, cloud undersides lit from below at low sun. Every sunrise lands on a bar of the music: the low sun on cloud is the look this film lives on.
2. Clouds racing in time lapse: they travel, they boil and change shape, they form and dissolve, their shadows and their lit edges turn as the sun crosses in two to four seconds. No flicker, no popping, no swimming noise.
3. A storm: a closed, heavy, dark deck with structure in its underside (not a flat grey), rain veils hanging under it, lightning that lights the cloud from inside. Then the deck tears open round the sun.
4. A frost morning: a low sun as a soft disc in thick mist. The sky is almost featureless, the sun's glow is everything.
5. Quick nights of 0.83 to 0.97 seconds (in the fast time lapse from beat 3 of a bar to the next bar line): the sun goes 14 degrees under the horizon and no deeper, so a glow stays on the horizon all night and travels from where the sun set to where it will rise; stars that turn, the moon. Dusk and dawn each take about a quarter of a second: they must be a smooth dimming and brightening, never a step.
6. The end: a golden evening, the sun 8 degrees up sinking to the horizon over 27 seconds in real time, then afterglow.

The reference pictures for these: `references/v2/keys/open.png` (blue hour), `climb-fair.png` and `climb.png` (time lapse day), `storm.png`, `storm-flash.png`, `break.png`, `frost.png`, `late.png` and `last.png` (the evening), and `references/approved/` for the dawn and the bloom. The sky in those pictures is the target for mood, colour and cloud character.

## What to build

- Atmosphere. A physical model from small tables, in the manner of Hillaire's 2020 paper "A Scalable and Production Ready Sky and Atmosphere Rendering Technique": transmittance and multiple scattering made once in `load()`, the view of the sky for this instant made in `prepare()`. Rayleigh, Mie and ozone, so that the blue hour is blue, the low sun is red and the band opposite the sun at dusk is there. It must hold from a sun 60 degrees up to 18 degrees under the horizon without a seam, and the handover from dusk to night must be smooth: no jump when `lightKind` changes.
- The sun's disc: the colour of `direct` times at most 90 (so about 800 at noon and about 100 at 2 degrees up, in the units below), with limb darkening, flattened and reddened at the horizon by the air, hidden by cloud by what the cloud really lets through. The sample target is half float, and the lens bloom is tuned for a disc of that size.
- The moon (a lit disc, small, optional phase) and the stars: real magnitudes and colours are welcome, a faint Milky Way is welcome, both turn with `starTurn` about a pole that suits a field at about 45 degrees north. Stars are in view for under a second at a time, so they must read at once: bright, sharp, plenty of them, and they fade into the dusk by the sky's own brightness, never by a switch.
- Clouds: volumetric, marched once a frame in `prepare()` into something the per sample `render()` only looks up (a panorama of the sky, or the part of the sky the frame will see: you choose). Cumulus with flat bases and boiling tops at about 1.5 km, a higher thin layer of cirrus or altocumulus for the evening, and the storm deck. Lit by the sun with real self shadowing, a forward scattering silver lining toward the sun, powder darkening, ambient light from the sky above and the ground below, and the air between the lens and the cloud (far clouds fade into the haze and take the colour of the horizon).
- The time lapse shutter. A frame's exposure is long compared with how fast the clouds move in the time lapse: `cloud.speedX/Z` is in kilometres a second and reaches 0.78. Within one frame's shutter (`now` to `later`) the cloud travels up to 13 m: smear it along its travel, so that fast cloud streaks as it does in a real time lapse and never strobes. When the film exports with many samples a frame, your prepared sky is still made once: the smear is yours to make.
- Storm: `dials.overcast` makes the deck heavy and dark, `dials.cover` closes it. Under it: a dark, structured underside with lighter gaps toward the horizon, rain veils (`dials.rain`) as soft hanging curtains in the distance. `dials.flash` (0 to 1, a few frames long) lights the cloud from inside at the direction `flashAt`: a bright core spreading through the cloud's volume, not a white overlay. On `dials.burst` (bar 41) the deck tears open round the sun: a ragged gap with blazing edges, the sun in it, the rest of the deck still dark. The shafts of light below it are drawn by the lens and grade, not by you: you tear the gap.
- The sun and the dials agree: `dials.sunThrough` is the share of the direct sun that reaches the plant, and it is directed, so that the big moments land on the music. Whatever your clouds do by themselves, the cloud within about 6 degrees of the sun must let through about that share: thin there when it is 1, closed when it is 0. Do it with the density near the sun's direction, so that it looks like weather and not like a hole.
- Fog: `dials.fog` thickens the air. The shared fog at the end of your shader (the same lines as in `sky-0`) hides the low sky as it hides the far land. With `fog` at 0.8 the sun is a soft glowing disc with a wide halo and the sky has almost no detail.
- Below the horizon, return the colour of the fog and haze at the horizon, with no hard line: the land in front is drawn by others.

## The contract, point by point

- `load()` makes everything. `warm()` draws once with every program and target. After that nothing is created, at any quality level: `npm run bench -- --sky <name> --count` must print PASS.
- `prepare(renderer, now, later, view)` is called once a frame. `view.quality` is `film` (the export: spend what you like), `high` (live on a good card) or `low` (live on a weak card). All three levels must exist at load, and must look like the same sky.
- `render(...)` is called once a sample and must be cheap: a few texture reads a pixel. The ray of a pixel, the pixel angle and the uniforms are exactly as in `sky-0`.
- The lens. The sky is beyond focus, so it arrives blurred by the lens: write `min(uCocScale / uFocusM, 2048.0)` in alpha, and draw the sky itself blurred by that circle: its radius in radians is `0.5 * coc * uPixelAngle`, the same over the whole frame, anywhere from 0 (the wide shots at f/8) to about 5 degrees (the macro shots at the start). A mip chain of your prepared sky with a few taps does it. The sun's disc widens by the same circle and keeps its energy, as `sky-0` shows.
- `light(moment, out)` says what light your sky gives at any instant, from tables made at load on the processor. It may never read back from the graphics card and never depend on what was drawn. It is called for moments that are not being drawn. `direct` is the sun or the moon on a card that faces it, before `sunThrough`. `zenith`, `horizon` (away from the sun) and `horizonSun` (toward it) are the radiance of your sky there, cloud included (under the storm deck all three go grey and dark). The light on the plant, the fog's colour and the camera's exposure are made from these four, so they must match what your sky shows.
- Units: linear, open ended. A white card facing a clear noon sun reads 10 from the direct light alone: `direct` is about 8.8, 8.3, 7.2 with the sun 60 degrees up and about 1.1, 0.4, 0.03 at 2 degrees. Your sky's pixel values are radiance in the same units: about 0.3, 0.6, 1.45 overhead at noon, 2 to 3 near the horizon, about 0.03, 0.06, 0.15 overhead at dusk, about 0.002, 0.003, 0.006 on a moonlit night. The moon's `direct` is about 0.19, 0.2, 0.23: far brighter than the real moon, on purpose, so that the night reads. If your model gives other numbers, keep the model and tell the Builder the numbers.
- The diagnostic views (`uDiag` 4, 5, 6 and 7) behave as in `sky-0`.
- `megabytes()` is the texture memory you hold. Stay under 96 MB.
- Pure function of the instant: no accumulation over frames, no history, no temporal reprojection. Frame 2,000 drawn alone equals frame 2,000 drawn after 1,999. Noise patterns may change with the frame only in ways the eye cannot follow as a pattern.
- Cost: `prepare` at `high` should be no more than a march over about half a million pixels with about 48 steps and 4 to 6 light steps, and `low` a quarter of that. Say what you spend.

## What is judged

1. `npm run bench -- --sky <name> --shots all --format 16x9 --tier review`: the sixteen shots at 1920 x 1080. Shots 01, 02, 05, 08, 10, 12, 13, 14 and 15 weigh most.
2. Clips at 960 x 540 with one sample, which is what plays live: `--clip 43.5,50.5 --view wide` (two days of full time lapse) and `--clip 54,58 --view wide` (the front closing and the first lightning) and `--clip 68.5,72.5 --view wide` (the break). Watch them yourself for flicker, popping and swimming.
3. `--count` prints PASS.
4. The same shots at `--quality low`.

Order of work: get the atmosphere, the disc, the stars and a first cloud layer through all sixteen shots and pushed within the first 60 minutes, so that there is always a whole sky to judge. Then make it beautiful, starting with the low sun on cloud. Push your branch and your looks at least every 30 minutes. Send your report to `/root` 150 minutes after you start, or sooner if you are done, and attach the sheet of the sixteen shots and your four best single shots.

## Stretch, only when the rest is right

- `Sky` may also offer the shadow of its clouds on the land: a small texture of how much sun reaches the ground over the 40 km round the origin, updated in `prepare()`. Tell the Builder if you have it, and it will be wired into the ground and the far land, so that cloud shadows race over the field in the time lapse.
- Crepuscular rays in the sky itself at low sun, where towers of cloud stand before it.
