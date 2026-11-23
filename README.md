# Sunflower

A 60 second film: the life of one sunflower in one continuous camera move, from the seedling breaking the soil to full bloom and a field to the horizon. The plant never stops growing. The world cuts round it four times: dawn, rain, night, frost, then one golden evening for the bloom and the field. Built as a web scene that draws every frame itself, and delivered as a video.

## Watch it

- The app: https://sunflower-film.pplx.app
- The film playing by itself: https://sunflower-film.pplx.app?mode=autopilot
- The review page, with every kept picture beside its approved image: https://sunflower-film.pplx.app/review.html
- The preview film in this repo: `out/preview.mp4` (960 by 540, the whole 60 seconds, scaled down from the 1920 by 1080 render)
- The six clips, one per segment, 1920 by 1080, cut from the same frames as the film: `out/clips/`
- The kept stills of the judged frames, the contact sheets and the comparison images: `out/stills/`

The film has no sound. `cut/CUES.md` has the timings for the edit: every cut lands on a bar line at 120 beats a minute.

## Play with it

Open the app. It starts in `live` mode, where the film is yours to scrub.

| Do this | What happens |
| --- | --- |
| Space | Play or pause |
| Left and right arrows | Step one frame back or on. Hold Shift for steps of ten frames |
| Drag the bar at the bottom | Scrub to any moment of the 60 seconds |
| Drag on the picture | Swing the camera round the plant and tilt it |
| Scroll, or pinch on a touch screen | Move the camera closer or farther |
| 0, or a double click on the picture | Put the camera back on the film's own path |
| M | Open the menu: jump to a segment or to a key frame, hold one world for the whole film, change the mode, the format, the tier, the asset set, or switch to one of the diagnostic views the build was checked with |
| Escape | Close the menu |

The address carries the same choices, so a view can be shared as a link: `?mode=autopilot` plays the film by itself, `?frame=1515` opens on a frame, `?tier=review` draws more samples per frame, `?world=night` holds the night for the whole film.

## Export the film

In the browser, on your own machine: open https://sunflower-film.pplx.app?mode=export. The page first draws the bloom frame and shows it beside the kept still, so you can see that your machine draws the same picture. Choose the format (Master is 1920 by 1080, UHD is 3840 by 2160), the range and the tier, then press "Start the export". Every frame is drawn and encoded on your machine and saved as one MP4 file; nothing is uploaded. The page shows the progress and the time remaining.

The tier sets the samples drawn for each frame: `draft` 1, `review` 8, `final` 48. More samples mean smoother motion blur, focus blur and edges, and a longer wait. The film and the clips in this repo were rendered at `draft` in 1920 by 1080, which is what fitted the build's render time; an export at `review` or `final` on a machine with a graphics card looks cleaner.

A check for the export page only: `&soundlate=37` feeds the sound encoder 37 ms early, as an encoder that delays the sound would. The page must find it, encode the sound again and print 0.0 ms against the track. It is not in the menu and no film is made with it.

From this repo, with Node, npm and ffmpeg installed (the versions the build used are under "Workspace record" in `kit/PROGRESS.md`):

```
npm ci
npx playwright-core install chromium
npm run build
npm run film -- --tier review --format 16x9
```

That renders the six segments one after another in a browser without a window and joins them to `out/work/film-16x9-review.mp4`. `--format preview` renders at 960 by 540. The harness draws with a software renderer, so it needs no graphics card and it is slow: on the small machine this was built on, the whole film in 1920 by 1080 takes about 3 hours at `draft` and about a day at `review`.

## Export a single clip

In the browser: in `export` mode choose one segment as the range.

From this repo:

```
npm run clip -- --unit bloom --tier review
```

The file lands in `out/work/clips/`. The segments are `dawn`, `rain`, `night`, `frost`, `bloom` and `field`. A clip starts on its segment's first frame and ends on its last, and is cut from the same frames as the film.

## How it was judged

- Comparison images, each kept still beside its approved image: `out/stills/compare-<key>.jpg`, one for each of the eight keys, and on the review page.
- The approved images the build aimed at: `references/approved/`.
- The scorecards of every round, with the critics' answers word for word, the measures and a summary: `scorecards/round-NNN/`. The last round, `scorecards/round-026/`, judged the build as delivered; its scores are under "Final scores" in `kit/PROGRESS.md`. It is the second run of the record round: `scorecards/round-025/` judged the same pictures before a fix in the source that changed none of them.
- The evidence of the last checks: `scorecards/qa/` and "QA results" in `kit/PROGRESS.md`.
- The whole history, every decision and every open item: `kit/PROGRESS.md`.
- The shot list and the sound cues: `cut/SHOTS.md` and `cut/CUES.md`.

No unit of this film and not the film as a whole reached the pass bar: every loop ended at its round limit. What is still wrong is written under "Open items" in `kit/PROGRESS.md`, with the frame, the critic's words and what was tried.

## What is here

| Path | What it is |
| --- | --- |
| `AGENTS.md` | Rules for the Builder |
| `kit/` | The build kit. Start at `kit/00-README.md` |
| `config/showcase.json` | Every number, the worlds, the timeline and the keys |
| `src/` | The scene: the plant, the six worlds, the camera, the lens and the export |
| `tools/` | The commands behind `npm run`: stills, sheets, film, clips, measures, packs, gates |
| `references/` | The brief, the eight approved images and every draft of the reference run |
| `scorecards/` | One folder per round, and `qa/` |
| `cut/` | The shot list and the sound cues |
| `out/` | The preview film, the rough cut, the six clips and the kept stills |
| `assets-src/` | The recipe of every generated map and sky the app ships |
| `ASSETS.md` | The ledger of third-party files |

## For Brandon

Every prompt and what to expect are in `kit/10-KICKOFF.md`.

## Credits the post must carry

None are required. The one third-party file is a soil scan under CC0 1.0, which asks for no credit: Brown Mud Dry by Rob Tuytel, Poly Haven (https://polyhaven.com/a/brown_mud_dry). Everything else in the picture is drawn by the code in this repo or read from maps and skies generated for this film, each with its recipe in `assets-src/`.
