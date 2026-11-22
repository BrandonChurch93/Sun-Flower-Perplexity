# Sunflower film, second version: plan for approval

22 November 2026. Plan only. Nothing in the repository or on the published site has changed (`main` is still `9325cc4`), and version 1 stays live until you approve a swap.

Labels used below: MEASURED means I ran it and a script printed the number. STATED means it comes from you, from a file in the kit or from a web page. UNKNOWN means not tested yet, with what would test it.

Attached with this plan: the timeline picture, a two-minute timing sketch with your track (flat shapes, timing only, not the look), a click track to check the beat grid by ear, and the raw map of the track.

## The recommendation in one paragraph

One place, one sky, one camera move, no cuts. The film is a time-lapse in which the sun keeps time with the music: every sunrise lands on a bar line, and the plant grows while the days fly past. Twice the time-lapse stops and we stay inside one moment, first a frost morning, then a thunderstorm. In those two holds the plant does not grow at all. Then the days start again. The last day slows down for the bloom and ends on the field at sunset. Length 2:07.0 at 30 frames a second, on your track from its first second to the point where it dies away.

## What you asked for, and where the plan answers it

| You said | In the plan |
|---|---|
| The flower should not grow in the rainy and frosty scenes | Growth has its own clock, and that clock stands still for the whole of both holds. Height change inside each hold in the timing model: 0 (MEASURED). A machine check fails the build if growth moves in a hold |
| A time-lapse, day to night again and again while it grows, no hard cuts | 15 days go by in three time-lapse sections. No cuts anywhere: the weather arrives and leaves inside the shot |
| Rain and frost come in between the grow cycles, we take them in, then they go | Two holds of 8 bars (13.7 s each): frost after the seedling stage, the storm half way up |
| No long night | The sun is below the horizon for about 1 s at a time in the first section and about 0.5 s later. Real darkness (sun more than 6 degrees down) never lasts longer than 0.8 s and adds up to 7.1 s of 127 (MEASURED from the model). The 10 second night scene of version 1 is gone |
| A new sky system | One sky run by a clock: sun, moon, stars, clouds, fog, storm, all lit by the same sun |
| Frame rate falls to 1 or 2 a second at scene changes | Cause found and measured, see below. Version 2 is built so that nothing is prepared during playback, and a machine check proves it on every build |
| Longer is fine | 2:07.0. It still fits a standard X account, which is limited to 140 seconds ([X help: longer videos](https://help.x.com/en/using-x/premium-longer-videos)) |
| Time the big moments to the track | The track is mapped: 140 BPM in 4/4. Every big moment sits on a bar line of the music |
| Quality first | See "Quality" |

## The film, section by section

Bar n of the track starts at 0.883 + (n - 1) x 1.714 seconds (MEASURED). Film time 0:00.0 is track time 0:00.0, so the track is laid at the very start with no offset.

| Bars | Time | Section | What you see | The plant | The music here (MEASURED) |
|---|---|---|---|---|---|
| lead-in | 0:00.0 to 0:00.9 | | Blue hour over bare soil. A finished picture from frame 0, no fade in | Seed under the soil | 0.88 s before bar 1 |
| 1 to 16 | 0:00.9 to 0:28.3 | Germination, time-lapse, a day every 4 bars | First light on bar 1, then a sunrise on each swell. The sun crosses the sky, stars blink past in the quiet bar before each swell | The hook breaks the soil by 0:02. Seed leaves open at bar 5, first true leaves at 9, second pair at 13. 0 to 18 cm | Four sparse swells at bars 1, 5, 9, 13, near silence in bars 4, 8, 12, 16 |
| 17 to 24 | 0:28.3 to 0:42.0 | Frost, hold | Frost forms in the last quick night. First light on the frost at bar 17, the sun clears the mist at 21, the melt begins at 23 | No growth. 18 cm | Running arpeggio from 0:28.7, medium level |
| 25 to 32 | 0:42.0 to 0:55.7 | First climb, time-lapse, a day every 2 bars | The thaw sweeps through on the boom at bar 25. Sunrises at 27, 29, 31. Storm clouds race in during bar 32 | 18 to 90 cm | Low boom at 25, riser through bar 32 |
| 33 to 40 | 0:55.7 to 1:09.5 | Storm, hold | Lightning and the first rain on bar 33, lightning again on 37. A puddle forms, the leaves nod under the drops. The rain thins and the clouds tear open during bar 40 | No growth. 90 cm | Boom and the first percussion at 33, accent at 37, riser through bar 40 |
| 41 to 56 | 1:09.5 to 1:36.9 | The great climb, time-lapse, a day every 2 bars | The sun breaks through on bar 41. Seven sunrises, at 43 to 55. The head follows the sun. Time slows through bar 56, into a low evening sun | 0.9 to 1.9 m. The bud forms from bar 49 | The full section starts at 41 (5 dB up), riser through bar 56 |
| 57 to 64 | 1:36.9 to 1:50.6 | Bloom | The petals break open on bar 57 and are fully open by 61. Low golden sun behind the flower | Full height, the flower opens | The loudest and brightest part starts at 57 |
| 65 to 72 | 1:50.6 to 2:04.3 | Field | One slow crane up from bar 65. The whole field by 69 | | Same level to the end of bar 72 |
| 73 | 2:04.3 to 2:07.0 | Last light | The sun touches the horizon as the music lets go. Afterglow. The last frame is a finished picture, no fade | | The full texture stops at 73, the last chord dies away to near silence at 2:07.0 (-51 dBFS) |

The track's outro (three slow swells from 2:07.7 to the end at 2:29.6) is left free. It would sit well under the end card your team adds in the edit.

How it works under the hood, in plain words:

- Two clocks. The world clock moves the sun, the stars and the clouds, and it speeds up and slows down smoothly. The growth clock moves the plant, and it is simply stopped during a hold. Rain, wind and frost glints always run in real time.
- Entering a hold, the racing clouds slow to a drift and the sun stops racing. Leaving it, they pick up speed again. That change of speed is what replaces the hard cuts.
- In a hold the plant can still move (it sways in the wind, leaves nod under raindrops). It does not get taller, add leaves or change shape. The field plants behind it follow the same rule.
- The camera makes one continuous move: it starts at soil level looking toward the sunrise, rises with the plant, turns slowly around it, and ends looking at the open flower with the setting sun behind it, then cranes up over the field. This matches the real plant: young sunflowers follow the sun from east to west each day and turn back overnight, and mature heads stay facing east ([Atamian et al., Science 2016](https://pubmed.ncbi.nlm.nih.gov/27493185/)). So the open flower faces the camera with the evening sun behind it, as in the approved bloom picture. The exact path is settled at the blockout.

Numbers from the timing model, the same one that drives the attached sketch (MEASURED): 15 sunrises, at bars 1, 5, 9, 13, 17, 27, 29, 31, 43, 45, 47, 49, 51, 53, 55, each within one frame of its bar line. Height at the section ends: 18 cm at bar 17, the same at bar 25, 90 cm at bar 33, the same at bar 41, 1.9 m at bar 55.5. On the last day the sun is 14 degrees up when the petals break open (bar 57), 10 degrees when the flower is fully open (61), 6 degrees when the crane starts (65), and on the horizon at bar 73.

## The frame rate drops: cause and fix

What I measured on version 1 (the published build, played in autopilot with a counter on the graphics calls):

| First frame drawn after | New shader programs built | Data sent to the graphics card |
|---|---|---|
| the cut to rain | 9 | 3.3 MB |
| the cut to night | 4 | 37.4 MB |
| the cut to frost | 6 | 1.2 MB |
| the cut to the golden evening | 10 | 3.1 MB |
| the start of the field | 1 | 0.8 MB |
| other frames sampled inside a scene | 0 | 0, except the field, which keeps uploading as it is revealed (0.4 MB at frame 1799) |

- Cause (MEASURED): version 1 prepares each new scene at the moment it first appears. It builds that scene's shader programs and uploads its geometry in the middle of playback, and the picture stands still while that happens. Nothing in the code prepares them ahead of time.
- It only happens the first time (MEASURED): with the film set to loop, the second and third passes build 0 programs and upload 0 data on every frame sampled.
- Your 1 to 2 frames a second at scene changes (STATED) fits this. How long each stall lasts on your machine is UNKNOWN from here, because this sandbox has no graphics card.
- A tip for version 1 today: open [the film with looping on](https://sunflower-film.pplx.app/?mode=autopilot&loop=1) and record the second pass. It should be clean (UNKNOWN on your machine until you try it).

How version 2 avoids it:

- One world for the whole film. Frost, rain, fog and storm are dials inside the same shaders, not separate scenes that get swapped in.
- Everything is prepared behind a loading screen: every shader program is built, every texture and all geometry is uploaded, and every weather state is drawn once off screen. Only then does "press a key to start" appear. three.js documents this kind of stall as shader compilation stutter and provides a way to compile ahead of time ([three.js docs](https://threejs.org/docs/pages/Renderer.html)), and browsers can do that work on background threads ([MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Compiling ahead is not enough by itself, because uploads of textures and geometry stall the first draw as well ([three.js forum](https://discourse.threejs.org/t/reduce-first-render-lag-renderer-compileasync-is-not-doing-anything/86191)), which is why every state is also drawn once before the start.
- Nothing is created while the film plays: no new programs, no new buffers, no new textures.
- A machine check on every build: the same counter I used on version 1 runs the whole film and fails the build if any frame after the loading screen builds a program or creates a buffer or a texture. This check is valid even in the sandbox, because it counts calls, not speed.
- On your machine: the page ends each run with a pacing report (frames shown, frames dropped, slowest frame, 99th percentile). A 20 second benchmark on the loading screen picks the best quality level that holds 30 frames a second at 1920x1080 on your graphics card. Real speed on your machine is UNKNOWN until that first run, which is why it is part of the first review.

## The music

What the map says (MEASURED):

- The file is 149.60 s, 44.1 kHz stereo. Tempo 140 BPM in 4/4, constant. A bar is 1.714 s, a beat 0.429 s, bar 1 starts at 0.883 s.
- The grid fits the sharpest onsets in the track to 2.7 ms RMS, 5.5 ms at worst, with 2.3 ms of drift from start to end.
- Independent check: at 17 of the 19 phrase starts (every 4 bars, bars 1 to 73) the strongest onset in the audio is within 30 ms of the grid line. Random points score 16 percent on the same test. The two others are bar 33, whose attack is spread over about 80 ms, and bar 73, where the music stops rather than hits.
- Structure: four sparse swells (bars 1 to 16), an arpeggio section (17 to 24), a boom at 25, a boom with the first percussion at 33 and an accent at 37, the full section from 41, the loudest and brightest part from 57, the stop at 73, then a quiet outro.

What is not settled:

- One check fails: two general beat trackers report about 90 BPM for this track, not 140. They are built for drums, and this is an orchestral piece with almost none. The two measurements above say 140. Please listen to the attached click track for a few seconds at the start, the middle and the end. If the clicks sit on the beat, it is settled (UNKNOWN until you listen).
- The mapping tool reads drums, so on this track it marks only some of the hits and its section names are of no use. The structure above comes from a bar by bar loudness table instead (MEASURED). One of its drum readings, at bar 41, was a near call. The cue there does not depend on it: the level rises 5 dB at bar 41.
- A few hits in this recording sit about 20 ms ahead of the grid line. At the blockout every cue is checked against the measured onset of its hit and moved by a frame where that reads better.

How the picture is tied to it:

- A cue sheet written in bars and beats, never in seconds. A linter checks it against the map on every build.
- Sharp events (lightning, the break-through of the sun, the first petal) start on the frame that contains the bar line, never the frame after. Lightning at bar 33 starts on frame 1672.
- Slow events are worked backwards, so that the moment that reads lands on the bar line: the sun's disc clears the horizon on the line with the glow building in the bar before, the flower is fully open on bar 61, the whole field is in view on bar 69.
- The strongest moments in the music get the biggest changes on screen: the full section at bar 41 gets the sun breaking through the storm, the loudest part at bar 57 gets the bloom. The quiet bars get the quick nights, and the stop at bar 73 gets the sunset.
- The track is never stretched and never bundled. The repository holds only the map, which carries the file's fingerprint.

How it stays in sync when you record:

- Recommended: the page plays your copy of the track. You pick the file from your disk once, the page checks its fingerprint, and nothing is uploaded. Film time is read from the audio clock on every frame, so a slow frame can never push the picture late: the next frame shows the right moment. You record the screen and the sound in one take.
- A short dark lead and tail carry a sync mark (a flash and a blip). A checker reads both marks in your recording and reports the offset at the start and at the end. A take passes within one frame at both ends. Your team trims the lead and tail in the edit, where the intro and the end card go anyway.
- Second route, kept from version 1: the frame by frame export. It renders every frame at full quality with no dropped frames possible, and you lay the track at 0:00.0 in the editor. It is slower to make and is the cleanest master.
- Your graphics card, screen and recorder are UNKNOWN to me. The benchmark and the first take measure what matters, so you do not need to look anything up.

## The sky

- One sky for the whole film, built into the existing engine. Everything follows the sun: sky colour, sun and moon, stars and the Milky Way, the light on the plant, the ground, the far hills and the clouds.
- Sky colour comes from a physical model of the atmosphere that works from small precomputed tables, so its cost does not grow with the picture size ([Hillaire 2020](https://onlinelibrary.wiley.com/doi/10.1111/cgf.14050)).
- Clouds are drawn once per frame into a panorama of the whole sky and lit by the same sun. Cover, thickness and speed are dials. The storm is the same clouds turned up, with lightning that lights them from inside. Fog is a dial for the frost morning. Light shafts for the break-through at bar 41 and for the bloom.
- A time-lapse shutter: in the fast sections each frame blends several moments of the world clock, so clouds and shadows streak smoothly instead of flickering.
- Why not a ready-made library: the best one for three.js lists its atmosphere and clouds as Beta and is rewriting its interface for WebGPU, with clouds still in progress ([three-geospatial](https://github.com/takram-design-engineering/three-geospatial)), and the other strong option needs the WebGPU renderer and leaves clouds out ([pmndrs/sky](https://github.com/pmndrs/sky)). The film's engine is WebGL2 (MEASURED). I will reuse their published methods, not their code.
- The risk: clouds are the hardest thing to make look real at speed. So the sky is the first thing built, alone: stills at dawn, noon, dusk, night, storm and fog, plus a 10 second time-lapse clip, shown to you before anything depends on it. Fallback: simpler layered clouds.

## Quality

Where version 1 ended (STATED, final scorecard): no scene reached the bar of 9. Match to the reference pictures scored 3 to 5, surface and detail 4 to 7, motion 4 to 8, the whole film 8, scroll stop 8, compression 6. The jury failed the opening frames (0 and 45) and the field (1755).

What the critics said, and what changes:

| Critics on version 1 | In version 2 |
|---|---|
| The place changes between scenes: "the low, rounded tree-lined hills ... have turned into a jagged rocky mountain ridge, so it reads as a different place" | One place and one light for every state. The same hills, the same field, the same sun |
| The hook "reads as an object scaling up in place, not tissue lengthening and lifting out of the ground" | The sprout is rebuilt to push up through the soil: the soil cracks and lifts, the stem lengthens from the base |
| "the rain sits on top of the picture rather than inside the depth of the scene" | Rain in depth: near and far drops with different sharpness and brightness, splashes, a growing puddle, wet surfaces, drops that move the leaves |
| "the thick white frost rim and the frost crystals ... are almost gone" | Frost gets a whole hold to itself, lit from behind by the low sun through mist |
| The bloom lacks the "broad sunburst: long god-rays fanning up into the sky" | Light shafts and backlit, translucent petals and leaves are part of the new sky and light |
| The plant's layout differs from the reference pictures | New reference pictures are painted over our own blockout frames, so place, camera and layout agree from the start |

Other levers:

- The eight approved pictures stay as the taste reference. The Milky Way night no longer has a scene of its own.
- The frames the jury failed (the opening and the field) get the first share of the look time.
- The critics judge the quality level that will actually be recorded. In version 1 they judged stills at the final level, while live playback runs at the draft level at 960x540 (MEASURED).
- Rules kept from the kit: frame 0 is a finished poster frame, the hook is up by 2 seconds, no fade in or out, no people, animals, insects, buildings or text, one continuous camera move.

## What is reused and what is new

- Reused: the plant model, the ground, the field, rain, frost and puddles, the finishing pass, the camera rig, the test harness, the export, the checking tools and the review page.
- New: the sky, the far horizon, the weather transitions and speed ramps, the growth schedule with its holds, the cue sheet in bars and beats, the loading screen that prepares everything with its machine check, the quality level for live playback, and the new reference pictures.
- Version 1 stays published and untouched. Version 2 lives on its own branch and its own address until you approve the swap.

## How the build would run

1. Approval of this plan. I log your note and the plan into the kit: a new film document, the config (127 s, 140 BPM, the timeline in bars), and new checks for no growth in holds, night length, no cuts, pacing and sync.
2. Sky spike and blockout with the music: the true camera, the true clocks and a first sky, in simple shapes, playing live with your track. Review stop 1. This is the cheap moment to change timing or structure, and where the pacing report from your machine comes in.
3. Look lock: the key frames of every section taken to final quality (opening, seedling, frost, storm, break-through, climb, bloom, field). Review stop 2.
4. The full build, with status pictures along the way and no further stops.
5. Proof: the pacing check, the sync check on a real take, the full quality round, then the final review.

Time: version 1 had a box of 30 hours and used 36.98 (STATED, `kit/PROGRESS.md`). I propose the same box of 30 hours. Whether version 2 fits it is UNKNOWN: the plant and the tools are reused, the sky and the live quality level are new.

## Decisions I need from you

Each has a default. Replying "approved" takes all the defaults.

| Decision | Default | Alternative |
|---|---|---|
| Length | 2:07.0, ending where the track dies away | The whole track, 2:29.6, with a quiet starlit ending over the outro. That is over the 140 second limit of a standard X account, so it needs Premium ([X help: longer videos](https://help.x.com/en/using-x/premium-longer-videos)) |
| Order of the two holds | Frost first, on the seedling, then the storm on the big hits at bars 33 and 37 | Storm first, frost second |
| How the final video is made | You record the page live while it plays your copy of the track. The export stays as a second master | Export only, with the track laid in your editor |
| Review stops | Two: the blockout with music, and the look lock | None: straight through, with status pictures |
| New reference pictures | Yes, painted over our own blockout frames | Keep only the eight from version 1 |

One thing to do when you have a minute: listen to the click track and tell me whether the clicks sit on the beat.
