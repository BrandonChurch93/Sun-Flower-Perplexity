# Brief: the player

Your files are `src/main.ts`, `index.html`, `src/director/live.ts`, `src/director/autopilot.ts`, `src/director/modes.ts`, `src/director/menu.ts` with their style sheets, and the folder `src/capture/`. Your branch is `agent/player`, your looks name is `player`. Before you write any interface, load the `website-building` skill if you have it.

## What it is for

Brandon will open this page on his own computer, pick his music file from his disk, press a key, and record his screen while the film plays with the music. The recording is the film. So the page has one job above all: play 2:07.0 of film at 1920 x 1080, in step with the track to the frame, without one stall.

His words about version 1: "whenever there's a scene change we have a huge frame rate drop. It will go down to like one or two frames a second when it switches the backgrounds or scenes and then it comes back and runs pretty well we need to make sure that doesn't happen in the second iteration." And: "I've attached the music track. This music track will be the one I use when I actually record the video. You don't have to bundle it in with the output".

## What to build

1. Loading. A quiet loading screen with real progress while `film.load()` and then `film.warm('draft', onStep)` run (`src/director/film.ts`): `warm` draws the film's own moments so every program is built and every texture is with the graphics card before the first frame. Nothing may be made after it. When it is done the page says it is ready and shows frame 0 as a finished picture. Do not start the film on its own.
2. The track. The audio file is never bundled, never committed and never fetched: Brandon picks it from his disk (a file button and drag and drop). Read it into memory, compute its SHA-256 (`crypto.subtle`) and compare with `config.music.sha256`. A match says so. Another file is allowed, with a plain warning that the film was timed to a different file. Without a track the film can still play, silent, on the same clock.
3. The clock. Film time comes from the audio clock, never from frame counting or the wall clock: `tools/beat/sync-mark.js` is that clock (`createFilmClock`, started by a key, `time()` read every animation frame). Each animation frame draws the film frame `floor(time * 30)` if it is not already on screen. If the machine is late it skips frames and never falls behind the music. An offset in milliseconds (`?av=`) moves the picture against the sound for a recorder that delays one of them.
4. Recording mode. One key (and one button) goes full screen, hides the cursor and every bit of interface, waits a two second dark lead, plays the film from frame 0 to the last frame, holds a two second dark tail and comes back. Nothing but the film is on screen in between: no text, no logo, no progress bar, no cursor. With `?marks=1` the lead and the tail carry the sync mark (a white flash and a blip) that `tools/beat/check_recording.py` measures in a recording; without it they are black.
5. The picture is 1920 x 1080 exactly when the screen allows it (the canvas's drawing size is the film's, whatever the window's size; in full screen on a 1920 x 1080 screen that is pixel for pixel), fitted without stretching otherwise, on black.
6. A check before recording. A button plays ten seconds spread over the film's hardest moments (the storm, the bloom, the crane) with the sound off and reports what this machine does: frames drawn, frames skipped, the longest gap, the 99th percentile frame time. From that it suggests `high` or `low` (`FilmOptions.quality`) and says plainly whether this machine will hold 30 frames a second. Nothing else changes the picture: no resolution scaling without saying so.
7. A report after every run, kept on the page and downloadable as a file: for each frame presented its film time, the audio clock at that moment and the time since the last one; totals of frames skipped; every gap over 50 ms with its film second; the largest and mean difference between the film time on screen and the audio clock. This is how we prove there was no stall, and how Brandon tells us if there was one.
8. Scrub and look. Outside recording mode: play and pause, a timeline with the sections of `config.sections` and bar numbers, stepping by frame and by bar, and the orbit of the camera that `live.ts` has now. Plain, dark, out of the way. The words on it follow the house rules of `COMMON.md`.
9. Export. `src/capture/` draws every frame at the `final` tier and encodes a file in the browser. Make it work with the version 2 film (3,810 frames, any range of frames, resumable, since a full export takes hours). It is the second master, for when the recording stalls. If a track was picked and matches, offer to put it into the exported file, and never write it anywhere else.

## What exists

`src/director/live.ts`, `modes.ts`, `menu.ts`, `autopilot.ts`, `src/main.ts` and `src/capture/` are version 1's page: it worked, and it lists six scenes, plays from the wall clock and has no track. `tools/beat/beatmap.js` reads the track's map (`config/music/map.json`) for bar and beat times; `src/v2/clock.ts` has the same grid (`barTime`, `barAt`) for the film's own use. `Film` gives you `load`, `warm`, `renderFrame(frame, tier)`, `setFormat`, `state(frame)`, `view`, `quality`.

## What is judged

1. Screenshots of every state at 1920 x 1080: loading, ready, track picked (match and no match), the check's result, the report, scrubbing, export. And one of recording mode in the middle of the film, which must show the film and nothing else.
2. A run in the headless browser of this sandbox with a test tone as the track (make one with `ffmpeg`, never commit it): the report must show film time following the audio clock, and frames skipped rather than time lost, since the software renderer here cannot draw 30 frames a second.
3. `npm run build` and `npm test` pass. The line of `COMMON.md` prints nothing for your files.
4. Real speed cannot be measured here and nobody may claim it. Say what you measured and what you could not.

A first heartbeat with pictures within 30 minutes. Your report goes to `/root` 150 minutes after you start, or sooner if you are done.
