# Sunflower

One sunflower, from bare soil to full bloom and a field to the horizon, in 2 minutes 7 seconds. The plant grows in a time lapse while the sky runs through fifteen days. Twice the time lapse stops and the plant stands still in real time: once under frost, once in a storm. The film is built to one music track at 140 beats a minute, so every sunrise lands on a bar line and the bud opens on the loudest bar. It is a web scene that draws every frame itself, and it is delivered as a site that plays the film.

This is version 2. Version 1, the 60 second film, is kept under the tag `v1`.

## Watch it

- The site. Its first page plays the film by itself, muted, with the browser's own controls. "Open the live version" leads to the app that draws the film live.
- The film files the site plays: `web/film/sunflower-1080.mp4` (1920 by 1080, 30 frames a second, 127 seconds) and `web/film/sunflower-720.mp4` (1280 by 720, for small screens). Neither has a sound track.
- What happens in the film, bar by bar: `kit/v2/FILM.md`.

## Host it on Vercel

1. In Vercel choose "Add New", then "Project", and import this repository.
2. Change nothing. `vercel.json` names the install command (`npm ci`), the build command (`npm run site`) and the output folder (`site`).
3. Press "Deploy".

The build writes three things to `site/`: `index.html`, the page that plays the film; `film/`, the two film files, the first frame and a cover picture; and `live/`, the app. On the machine this was built on, a fresh clone builds in about ten seconds under Node 22, 24 and 26.

The same site on your own machine:

```
npm ci
npm run site
npx vite preview --outDir site
```

To put the film on the site with sound, replace `web/film/sunflower-1080.mp4` and `web/film/sunflower-720.mp4` with files that carry a sound track, under the same names, and deploy again. The build sees the sound track and the page shows a sound button. The film still starts muted, because a browser does not let a page start sound by itself. Keep each file under 95 MB: GitHub refuses a file over 100 MB.

A visitor whose system asks for less motion gets the cover picture and a "Play the film" button in place of a film that starts by itself. So does a visitor whose browser refuses to start a film unasked.

## Play with it

Open the live version. It loads the film and says what it is doing, then shows a desk with three steps: load the film, drop the track, check and record.

The track is not in this repository as a file of its own: it is only heard inside `portfolio/sunflower-video.mp4`. Press "Choose the track" or drop your copy anywhere on the page, and the page says whether it is the file the film was built to. Without the track the film plays silent.

| Do this | What happens |
| --- | --- |
| Space | Play or pause |
| Left and right arrows | One frame back or on. With Shift, one bar |
| `[` and `]` | One bar back or on |
| Drag on the picture | Swing the camera round the plant and tilt it |
| Scroll | Move the camera closer or farther |
| 0, or a double click on the picture | Put the camera back on the film's own path |
| M | Open or close the menu |
| H | Hide the interface, and show it again |
| C | "Check this machine": twenty seconds of the hardest parts of the film, without sound. It says whether this machine keeps up |
| R | "Record": start a screen recorder first. The page goes full screen and plays six seconds of dark, the film with the track, and two seconds of dark |
| P | "Pacing report": the whole film without sound, then one page of numbers to copy and send |
| Escape | Stop a check or a recording, or close the menu |

"More settings" on the desk holds the quality of live play (High or Low), a test take with a white flash and a beep in the dark before and after the film, and a field that shows the picture later by a number of milliseconds, for a recorder that delays the sound.

A recording can be checked against the track: `python3 tools/beat/check_recording.py <the recording>` reads the flash and the beep of a test take and prints how far the picture is from the sound.

## Draw the film yourself

With Node 22 or newer, npm and ffmpeg:

```
npm ci
npx playwright-core install chromium
npm run part -- --from 0 --to 3809 --format 16x9 --tier draft
npm run join -- --name film --format 16x9 --tier draft
```

The film lands in `out/work/film-16x9-draft.mp4`. A part that stops carries on where it stopped. Every frame is drawn in a browser without a window by a software renderer, so it needs no graphics card and it is slow: 36 to 58 seconds a frame at 1920 by 1080 on a machine with four cores. The film in this repository was drawn that way by twelve such machines side by side in about two and a half hours.

The tier sets the samples drawn for each frame: `draft` 1, `review` 8, `final` 48. More samples mean smoother motion blur, focus blur and edges, and a longer wait: a frame at `final` takes about 700 seconds on the same machines.

Every frame is a pure function of its number, so a part can be drawn anywhere and joined: `--from` and `--to` take any range.

## How it was checked and judged

- The film's own rules are checked by commands: `npm run checks -- all`. Nothing grows in the two holds, no night is longer than 1.2 seconds, every sunrise and both holds sit on their bar lines, the film cuts only on its four frames, nothing is made on the graphics card after loading, and a frame drawn twice gives the same pixels. `tools/checks/README.md` lists them.
- The cue sheet against the map of the track: `python3 tools/beat/cues.py config/music/cues.json config/music/map.json --fps 30`. 47 cues, 0 mismatches.
- The scorecards of the last round, with the critics' answers word for word: `scorecards/round-027/`.
- The whole history, every decision and every open item: `kit/v2/PROGRESS.md`.

No look of this film and not the film as a whole reached the pass bar of 9 out of 10 with the critics. What is still wrong is written under "Open items" in `kit/v2/PROGRESS.md`. Brandon watched the film with the track and signed it off on 23 November 2026.

Live play has one open item of its own. On the machine this was built on, which has four cores and no graphics card, the page's own script is over its time limit in 11 of 16 measured stretches of the film. What that is on a machine with a graphics card is not measured: "Check this machine" says it for the machine it runs on.

## What is here

| Path | What it is |
| --- | --- |
| `web/` | The page that plays the film, and the film files |
| `vercel.json` | The build command and the output folder for Vercel |
| `src/` | The scene: the plant, the place, the sky, the weather, the camera, the lens and the player |
| `src/v2/` | The film's clock, its camera path, its cuts and its sun |
| `config/showcase.json` | Every number of the build |
| `config/music/` | The map of the track and the cue sheet. The track itself is not here |
| `kit/v2/` | The plan, the film bar by bar, the cue table, Brandon's notes and the progress log of version 2 |
| `kit/` | The build kit. Start at `kit/00-README.md` |
| `tools/` | The commands behind `npm run`: parts, joins, checks, stills, the site |
| `tools/beat/` | The track map loader, the cue sheet compiler and the recording check |
| `tests/` | The tests: `npm test` |
| `scorecards/` | One folder per round |
| `references/` | The brief, the approved images and the drafts of the reference run |
| `assets-src/` | The recipe of every generated map and sky the app ships |
| `ASSETS.md` | The ledger of third party files |
| `out/` | The kept stills and the status pictures. `out/preview.mp4`, `out/roughcut.mp4` and `out/clips/` are version 1's |
| `out/card/` | The still and the loop for a project card: the bud right before it opens, and 8.5 s in which it opens and closes again. `tools/card.py` cuts and checks them |
| `portfolio/` | The files for a portfolio page: the film with its music, the card picture and its loop, a poster, five stills and the words in `SUNFLOWER-ENTRY.md` |
| `review/` | The public review page: its source, the script that puts it together with the film, and its checks. Start at `review/README.md` |
| `cut/` | Version 1's shot list and sound cues |
| `AGENTS.md` | Rules for the Builder |

## Version 1

The 60 second film is at the tag `v1`, with its own README, and is still published at https://sunflower-film.pplx.app.

## Credits the post must carry

For the picture, none are required. The one third party file in it is a soil scan under CC0 1.0, which asks for no credit: Brown Mud Dry by Rob Tuytel, Poly Haven (https://polyhaven.com/a/brown_mud_dry). Everything else in the picture is drawn by the code in this repository or read from maps and skies generated for this film, each with its recipe in `assets-src/`.

The music track is Brandon's own choice. It is in this repository only as the sound of `portfolio/sunflower-video.mp4`, never as a file of its own, and its row is in `ASSETS.md`. Whoever posts the film with it follows the licence the track came with.
