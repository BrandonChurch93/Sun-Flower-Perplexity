# Sunflower

The words and the files for a portfolio page about the film. Every number here is listed at the end with the file it comes from.

## Card

- Name: Sunflower
- Kind: Procedural short film
- Year: 2026
- Tags: WebGL, Time lapse, Music sync

Card description:

> A two minute film of one sunflower, from bare soil to open bloom, while fifteen days cross the sky. Nothing is filmed: each of its 3,810 frames is computed from its frame number, and every sunrise lands on a bar line of the music.

Line under the name:

> One sunflower and fifteen days of sky, drawn frame by frame to one piece of music.

## Figures

| Number | Label | File |
| --- | --- | --- |
| 3,810 | frames, each computed from its number | `kit/v2/FILM.md` |
| 15 | days of sky over one plant | `kit/v2/FILM.md` |
| 47 | cues placed on the music | `kit/v2/CUES.md` |
| 1,500 | disc florets in the flower head | `config/showcase.json` |

## The problem

A time lapse and a piece of music keep different time. A sunflower needs a season and the film has two minutes, yet the picture only works when its events land where the music does: a sunrise on a bar line, the bud opening on the loudest bar. No camera in a field can be asked for that.

The film also has to stop. When the frost comes and when the storm breaks, the time lapse gives way to real time and the plant must not grow at all, then carry on as if nothing had paused. All of it has to hold without a cut between the days, without nights long enough to lose the picture, and with each frame coming out the same every time it is drawn.

## What was built

Sunflower is a film of 2 minutes 7 seconds at 1920 x 1080 and 30 frames a second. One sunflower grows from bare soil to an open flower while the sky runs through fifteen days. Twice the time lapse stops and the plant stands still in real time, once under frost and once in a storm, and the film ends above a field at sunset.

None of it is footage. A web scene draws every frame: a plant grown along a skeleton, with its stem, 24 leaves, hairs, a bud, 34 ray florets and 1,500 disc florets set out by the golden angle; soil, a field of sunflowers and the far land; a sky whose sun, moon, stars and clouds all follow one clock; rain, mist and frost; and a lens with focus, glare and a grade. Apart from one soil scan, everything in the picture is drawn by the code or read from maps made for the film.

The music sets the time. The track is mapped to bars and beats, and each event of the film is written as a bar and a beat in a cue sheet that is compiled against that map. The plant has a clock of its own, which stands still in the two holds while the sky runs on. The frames are drawn one by one in a browser without a window, joined into the film and set to the track. The same scene also plays live on a web page, where the camera can be swung round the plant.

## Decisions

1. **Bars and beats, not seconds.** Every event is placed as a bar and a beat of the track, at 140 beats a minute, and compiled to frames. All 15 sunrises cross the horizon on a bar line, and the bud begins to open on bar 57, the loudest bar of the track.
2. **Growth stops in the weather.** In the frost and in the storm, 8 bars each, the plant's clock stands still to the frame. Frost and rain arrive and leave inside their holds, so the time lapse never shows them.
3. **One camera move, four cuts.** The film cuts four times, on the downbeats of bars 19, 21, 23 and 25, to three close shots of the frozen seedling and back. Everywhere else the camera is one unbroken move, from the soil to above the field.
4. **Nights shorter than a second.** Each of the 14 nights lasts 0.86 to 0.96 seconds and the sun goes no deeper than 14 degrees, so a glow always stays on the horizon.
5. **A frame is a function of its number.** Any frame can be drawn alone and gives the same pixels, so the film was drawn in parts on 12 machines side by side and joined. Nothing is made after loading: every program, texture and buffer exists before frame 0.
6. **Rules as commands.** Each rule of the film is a command that measures the film and fails when the rule is broken: nothing grows in a hold, no night runs long, every sunrise sits on its bar line, the film cuts only on its four frames.

## Built with

| Group | Built with |
| --- | --- |
| Scene | TypeScript, three.js, WebGL 2, GLSL shaders |
| Time and music | A map of the track in bars and beats, a cue sheet compiled against it, Python with NumPy and SciPy |
| Drawing the frames | Node.js, Playwright, Chromium without a window, a software renderer in place of a graphics card |
| Film and pictures | ffmpeg, H.264, AAC, WebP |
| Site | Vite, plain HTML and CSS |
| Checks | Vitest, and the film's own rule checks in `tools/checks/` |

## Pictures and videos

| File | Alt text | Caption |
| --- | --- | --- |
| `sunflower-video.mp4` | A film of 2 minutes 7 seconds in which one sunflower grows from bare soil to an open flower, through frost and a storm, and ends above a field at sunset, with music. | The whole film with its music, from soil to field. |
| `sunflower-card.webp` | A closed sunflower bud ringed by pointed green bracts stands against a low, hazy sun and a blurred field. | The closed bud on the last frame before it opens. |
| `sunflower-loop.mp4` | The closed bud opens into a sunflower in evening light and folds back into the bud, in a silent loop of 8.5 seconds. | The bud opens, then closes again, in a seamless loop. |
| `sunflower-poster.webp` | An open sunflower faces the camera in golden evening light, with the low sun half behind a leaf and a field of sunflowers blurred behind it. | The open flower as the camera begins to pull away. |
| `sunflower-1.webp` | A sunflower seedling with two seed leaves stands beside its split seed husk on dark, crumbly soil under a low sun. | The seedling at sunrise, beside the husk it left behind. |
| `sunflower-2.webp` | Frost crystals cover the tip and the leaves of the young plant, seen close against a pale sun in the mist. | The frost hold: ice on the growing tip, sun behind. |
| `sunflower-3.webp` | The young sunflower stands in a puddle on wet soil while heavy rain falls from a dark sky, lit for a moment by lightning. | The storm hold: the plant stands still in the rain. |
| `sunflower-4.webp` | The sunflower is fully open and faces the camera, its petals lit from behind by a low sun, with a field of sunflowers out of focus behind it. | The flower fully open in the light of the evening. |
| `sunflower-5.webp` | Seen from above, a field of sunflowers runs to a ridge on the horizon where the sun is setting, with the film's own plant in front. | The field at sunset as the camera rises over it. |

## Addresses

- Live: https://sun-flower-perplexity.vercel.app
- Repository: https://github.com/BrandonChurch93/Sun-Flower-Perplexity

The live page plays the film without sound. The film with its music is `sunflower-video.mp4` in this folder.

## Where each number comes from

| Number | File |
| --- | --- |
| The year 2026 | `README.md`, "How it was checked and judged" |
| 3,810 frames | `kit/v2/FILM.md`, first paragraph |
| Two minutes; 2 minutes 7 seconds | `kit/v2/FILM.md`, first paragraph; `config/showcase.json`, `film.durationSeconds` |
| Fifteen days of sky | `kit/v2/FILM.md`, first paragraph |
| 47 cues | `kit/v2/CUES.md`, first paragraph |
| 1,500 disc florets, 34 ray florets, 24 leaves, the golden angle | `config/showcase.json`, `plant`; read by `src/plant/head/disc/index.ts` and `src/plant/growth.ts` |
| 1920 x 1080 | `config/showcase.json`, `formats.master` |
| 30 frames a second | `config/showcase.json`, `film.fps` |
| 140 beats a minute | `config/showcase.json`, `music.bpm` |
| 15 sunrises, each on a bar line | `kit/v2/FILM.md`, "The eight parts" and "Rules of the film" |
| Bar 57, the loudest bar | `kit/v2/FILM.md`, "What lands on the music" |
| Two holds of 8 bars | `kit/v2/FILM.md`, "The eight parts": bars 17 to 25 and 33 to 41 |
| Four cuts on bars 19, 21, 23 and 25; three close shots | `kit/v2/FILM.md`, "Rules of the film" |
| 14 nights of 0.86 to 0.96 seconds; 14 degrees | `kit/v2/FILM.md`, "Rules of the film" |
| 12 machines | `README.md`, "Draw the film yourself" |
| Frame 0 | `kit/v2/FILM.md`, "Rules of the film" |
| One soil scan | `ASSETS.md` |
| 8.5 seconds, the loop | `sunflower-loop.mp4` in this folder; the same cut is in `out/card/card-proof.json` |
