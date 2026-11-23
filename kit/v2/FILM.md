# The film, version 2

One sunflower, one place, one sky and one clock for 2:07.0 (3,810 frames at 30 frames a second), built to one track at 140 beats a minute. The plant grows in a time lapse while the sky runs through fifteen days. Twice the time lapse stops and the plant stands still in real time: once under frost, once in a storm. The film cuts four times, all of them inside the frost hold: to three close shots of the frozen seedling and back to the wide shot. Everywhere else the camera is one unbroken move.

Bar n begins at 0.883143 + (n - 1) x 1.714286 seconds. Every number here is read from `src/v2/clock.ts`, `src/v2/rig.ts`, `src/v2/cuts.ts` and `config/`; the cue sheet is `config/music/cues.json` and its compiled table is `kit/v2/CUES.md`.

## The eight parts

| Part | Bars | Seconds | The plant | The sky | The camera |
| --- | --- | --- | --- | --- | --- |
| Germination | 1 to 17 | 0.9 to 28.3 | From bare soil to a seedling of 17.5 cm with its first true leaves | Four days. Blue hour before the first frame, a sunrise on bars 1, 5, 9, 13 and 17 | Close to the soil, rising with the seedling |
| Freeze | 17 to 25 | 28.3 to 42.0 | Stands still. Frost grows on every leaf until bar 20.5, stands whole to bar 22.7, then thaws to beads; one drop falls from the tip of the lowest leaf on beat 3 of bar 24 | One cold morning in real time, the sun 2.4 degrees up rising to 6.5: a pale disc in the mist that comes through on the cut of bar 21 | The wide shot for bars 17 to 19: 7.5 cm above the soil, creeping in from 59 cm. Then three close shots of two bars each at 100 mm (the last at 85 mm) and f/8, 17 to 23 cm from the plant, cut on the downbeats of bars 19, 21 and 23: the edge of a leaf with the ice still growing, the growing tip against the sun, the lowest leaf in the thaw. The cut of bar 25 goes back to the wide shot at 54 cm |
| Climb | 25 to 33 | 42.0 to 55.7 | 17.5 cm to 61 cm | Fast time lapse: the rest of the frost day, two whole days, and a third on which the front closes from bar 32. Sunsets on beat 3 of bars 26, 28 and 30, sunrises on bars 27, 29 and 31 | Pulls back and rises with the plant |
| Storm | 33 to 41 | 55.7 to 69.5 | Stands still in wind and rain | Real time under a closed deck. Lightning on bars 33 and 37 | Low, 1.66 m back creeping to 1.48 m, 0.27 to 0.30 m up: the young plant fills the frame |
| Ascent | 41 to 57 | 69.5 to 96.9 | 61 cm to 1.71 m with a closed bud | The deck tears open on bar 41. Then fast time lapse: six whole days with sunrises on bars 43, 45, 47, 49, 51 and 53, and the last sunrise on bar 55; the time lapse slows from bar 56 | Closes to 0.75 m and rises to 1.56 m; from bar 55 it goes in on the bud |
| Flower | 57 to 65 | 96.9 to 110.6 | The bud opens; the flower is fully open on bar 61 | One golden evening in real time, the sun 8 degrees up sinking to 3 | Close on the head. The lens closes from 0.77 m to 0.50 m off the stem over bars 55 to 57, eases back as the head opens (0.67 m at bar 59, 0.73 m at 61) and stands at 0.80 m on bar 65. 35 mm at f/5.6, the sun in the left of the frame |
| Crane | 65 to 73 | 110.6 to 124.3 | The plant among its field | The sun sinks to the horizon | Pulls back from 0.80 m to 4.5 m and rises from 1.70 m to 2.46 m over bars 65 to 69, then drifts on to 5.1 m back and 2.74 m up at the end |
| Dusk | 73 to the end | 124.3 to 127.0 | The field | The sun touches the horizon on bar 73; afterglow | Still rising, slowly |

## Rules of the film

- The film cuts on frames 952, 1055, 1157 and 1260 and nowhere else. They are the frames that hold the downbeats of bars 19, 21, 23 and 25; a cut shows on the frame of the downbeat or the frame before it, never after. One frame of each close shot is drawn while the film warms, so a cut makes nothing and costs no long frame.
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
| 19 | No drums; a little louder than bars 18 and 20 | Cut to the edge of a leaf: the ice is still growing |
| 21 | A soft low hit, the only one of bars 18 to 26 | Cut to the growing tip: the mist thins and the sun comes through |
| 23 | No drums | Cut to the lowest leaf: the ice goes to water |
| 24, beat 3 | The quietest bar of the hold | The drop at the tip of the leaf lets go |
| 25 | A new phrase, as loud as bar 17 | Cut back to the wide shot; the plant grows again; the fast time lapse starts |
| 27, 29, 31 | Phrase pulse; a soft low hit on 29 | Sunrises |
| 33 | The loudest bar so far | Lightning to the left; the plant stops; the rain begins |
| 37 | Two kicks | Lightning to the right |
| 41 | The full entry of the track: kicks and hats from here on | The sun breaks through the deck; the plant grows again |
| 43 to 55, odd bars | Hats on the downbeats, kicks on 45 and 53 | Seven sunrises; on the last, bar 55, the camera starts in toward the bud |
| 57 | The loudest bar of the track | The camera is half a metre from the head; the bud begins to open |
| 61 | Hat on the downbeat | The flower is fully open |
| 65 | Kick | The camera starts to pull away over the field |
| 69 | Hat | The camera rises over the field |
| 73 | The drums drop out | The sun touches the horizon |

MEASURED: the cue sheet compiles against the map with 47 cues and 0 mismatches (`python3 tools/beat/cues.py config/music/cues.json config/music/map.json --fps 30`). MEASURED: every sunrise and every fast sunset crosses the horizon within 0.1 ms of its position (`out/work/tmp/cross.ts`).

STATED by the map: bar 41.1 is a kick with a thin margin (0.01 dB from the threshold). The break lands there because the bar is the track's full entry (the loudest so far), not because of that one detection.

STATED by the map: in bar 57 the detected kick is on the eighth note after the bar line (57.1+), 214 ms after it. The bud's opening is a slow start on the bar line, so nothing in the picture claims that hit.

UNKNOWN: whether the click track matches the track by ear, until a person listens to it; whether a recording made on Brandon's machine holds sync, until a take is measured with `tools/beat/check_recording.py`.

MEASURED from the map: bars 17 to 26 have no drums but the low hit on the downbeat of bar 21 (level by bar, in dB: 17 -14.9, 18 -21.1, 19 -18.9, 20 -21.5, 21 -15.6, 22 -20.1, 23 -19.2, 24 -22.4, 25 -14.8). The cuts sit on the odd bars, which are the louder ones; the drop falls in bar 24, the quietest.

UNKNOWN: how the three close shots and the move in on the bloom read in motion at the finished look, until the film is drawn whole and watched.
