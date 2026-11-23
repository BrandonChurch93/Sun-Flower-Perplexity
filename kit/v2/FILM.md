# The film, version 2

One sunflower, one place, one unbroken take of 2:07.0 (3,810 frames at 30 frames a second), built to one track at 140 beats a minute. The plant grows in a time lapse while the sky runs through fifteen days. Twice the time lapse stops and the plant stands still in real time: once under frost, once in a storm. There is no cut anywhere.

Bar n begins at 0.883143 + (n - 1) x 1.714286 seconds. Every number here is read from `src/v2/clock.ts`, `src/v2/rig.ts` and `config/`; the cue sheet is `config/music/cues.json` and its compiled table is `kit/v2/CUES.md`.

## The eight parts

| Part | Bars | Seconds | The plant | The sky | The camera |
| --- | --- | --- | --- | --- | --- |
| Germination | 1 to 17 | 0.9 to 28.3 | From bare soil to a seedling of 17.5 cm with its first true leaves | Four days. Blue hour before the first frame, a sunrise on bars 1, 5, 9, 13 and 17 | Close to the soil, rising with the seedling |
| Freeze | 17 to 25 | 28.3 to 42.0 | Stands still. Frost on every leaf, then the thaw from bar 22.5 | One cold morning in real time: a low sun as a soft disc in mist | 7.5 cm above the soil, creeping in from 59 cm to 54 cm |
| Climb | 25 to 33 | 42.0 to 55.7 | 17.5 cm to 61 cm | Fast time lapse: the rest of the frost day, two whole days, and a third on which the front closes from bar 32. Sunsets on beat 3 of bars 26, 28 and 30, sunrises on bars 27, 29 and 31 | Pulls back and rises with the plant |
| Storm | 33 to 41 | 55.7 to 69.5 | Stands still in wind and rain | Real time under a closed deck. Lightning on bars 33 and 37 | Low, 1.66 m back creeping to 1.48 m, 0.27 to 0.30 m up: the young plant fills the frame |
| Ascent | 41 to 57 | 69.5 to 96.9 | 61 cm to 1.71 m with a closed bud | The deck tears open on bar 41. Then fast time lapse: six whole days with sunrises on bars 43, 45, 47, 49, 51 and 53, and the last sunrise on bar 55; the time lapse slows from bar 56 | Closes to 0.75 m and rises to 1.56 m |
| Flower | 57 to 65 | 96.9 to 110.6 | The bud opens; the flower is fully open on bar 61 | One golden evening in real time, the sun 8 degrees up sinking to 3 | At the flower's height, the sun in the left third |
| Crane | 65 to 73 | 110.6 to 124.3 | The plant among its field | The sun sinks to the horizon | Pulls back from 1.0 m to 4.6 m over bars 65 to 69, then cranes on to 7.1 m back and 4.0 m up at the end |
| Dusk | 73 to the end | 124.3 to 127.0 | The field | The sun touches the horizon on bar 73; afterglow | Still rising, slowly |

## Rules of the film

- The plant grows only in the time lapse. While `frost` or `rain` is 0.2 or more its clock stands, to the frame: frames 849 to 1259 and 1672 to 2082.
- The frost and the rain arrive and leave inside their holds, so the time lapse never shows them.
- Every sunrise crosses the horizon on a bar line. In the fast time lapse every sunset crosses it on beat 3 of the bar before.
- Every night lasts 0.83 to 0.97 seconds and the sun goes no deeper than 14 degrees, so a glow stays on the horizon. There are fourteen nights; the sun is more than 6 degrees under the horizon for 9.2 seconds of the film in all, and never for longer than 0.70 seconds at a time.
- Nothing is made after loading. Every program, texture and buffer of the film exists before frame 0, and a counter fails the build if a frame makes one.
- Every frame is a pure function of its number.

## What lands on the music

| Bar | What the music does (from the map) | What the picture does |
| --- | --- | --- |
| 1 | The first phrase begins | The first sunrise |
| 5, 9, 13 | Phrase starts; kicks on 5 and 13 | Sunrises of days 2, 3 and 4 |
| 17 | The loudest bar so far | Sunrise into mist; the plant stops; frost |
| 21 | A soft low hit | The camera is half way in; the sun's disc sharpens |
| 25 | A new phrase | The plant grows again; the fast time lapse starts |
| 27, 29, 31 | Phrase pulse; a soft low hit on 29 | Sunrises |
| 33 | The loudest bar so far | Lightning to the left; the plant stops; the rain begins |
| 37 | Two kicks | Lightning to the right |
| 41 | The full entry of the track: kicks and hats from here on | The sun breaks through the deck; the plant grows again |
| 43 to 55, odd bars | Hats on the downbeats, kicks on 45 and 53 | Seven sunrises |
| 57 | The loudest bar of the track | The bud begins to open |
| 61 | Hat on the downbeat | The flower is fully open |
| 65 | Kick | The camera starts to pull away |
| 69 | Hat | The camera rises over the field |
| 73 | The drums drop out | The sun touches the horizon |

MEASURED: the cue sheet compiles against the map with 43 cues and 0 mismatches (`python3 tools/beat/cues.py config/music/cues.json config/music/map.json --fps 30`). MEASURED: every sunrise and every fast sunset crosses the horizon within 0.1 ms of its position (`out/work/tmp/cross.ts`).

STATED by the map: bar 41.1 is a kick with a thin margin (0.01 dB from the threshold). The break lands there because the bar is the track's full entry (the loudest so far), not because of that one detection.

STATED by the map: in bar 57 the detected kick is on the eighth note after the bar line (57.1+), 214 ms after it. The bud's opening is a slow start on the bar line, so nothing in the picture claims that hit.

UNKNOWN: whether the click track matches the track by ear, until a person listens to it; whether a recording made on Brandon's machine holds sync, until a take is measured with `tools/beat/check_recording.py`.
