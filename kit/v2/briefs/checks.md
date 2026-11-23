# Brief: the checks

Your folder is `tools/checks/` (new). Your branch is `agent/checks`, your looks name is `checks`. Tell `/root` which lines you need in `package.json`.

Version 2 was asked for in a few plain sentences, and each of them can be checked by a machine. You write those checks, each a command that prints what it measured and exits with 1 when it fails, and a page that shows the film for review. Run them on `v2` as it is now (it has a stand-in sky and the plant, soil and field of version 1) and again whenever `/root` says `v2` has moved.

## Brandon's sentences and their checks

1. "for the rainy, frosty scenes the flower should not be growing". `holds`: across each hold (bars 17 to 25 and 33 to 41, from `config.sections`, kind `hold`) nothing grows. Prove it two ways. By the clock: `tauAt` is the same number on every frame of a hold. By the picture: draw the plant, the field and the ground in flat light from a fixed camera at the first, middle and last frame of each hold with the wind at rest and no weather, and show the three are the same picture, to the pixel or within a stated noise floor. Tell `/root` what switch on `Film` you need for "wind at rest and no weather"; until it exists use the clock proof and say so.
2. "we shouldn't have a super long night stage either because it looks weird that the sunflower is growing at night". `nights`: from `momentAt` over every frame, list every night (from the sun going under the horizon to its coming up), its length in film seconds and how much the plant's clock moves in it. Fail when a night outside a hold is longer than 1.2 seconds. Print the table.
3. "It goes from day to night in the sky repeatedly while it's actually growing, no more hard cuts." `cuts`: draw every frame of the film small (320 x 180, one sample, `--only all`) and measure the change from each frame to the next (mean absolute difference of luminance, and of a blurred copy). A hard cut is a spike many times its neighbours. Fail on one, print the ten largest steps with their film seconds, and save a strip of frames round each for a person to look at. Lightning (bars 33 and 37) is meant to spike: name those as expected.
4. "whenever there's a scene change we have a huge frame rate drop ... we need to make sure that doesn't happen". `made`: `npm run bench -- --count` plays 200 frames and counts what was made after loading (programs, textures, buffers, targets). Do the same over all 3,810 frames at a small size, after `film.warm()`, and fail if anything at all is made. `src/v2/counter.ts` is the counter. Print which frame made what.
5. "time up the impactful moments of the video with the audio clip". `cues`: the film's cue sheet will be `config/music/cues.json`, written in bars and beats by `/root` (`tools/beat/cues.template.json` is the format, `tools/beat/cues.py` compiles and lints it against `config/music/map.json`). Wrap it: lint, then check each cue against the film itself (the sunrise cues against `momentAt`: the sun crosses the horizon within one frame of the bar line; the holds begin and end on their bar lines; the flash peaks on its bar line). Until `/root` writes the sheet, write the checks against `config.sections` and `src/v2/clock.ts`.
6. `pure`: any frame drawn twice, in any order, gives the same pixels. Draw 12 frames spread over the film, then again in reverse order after drawing others in between, and compare byte for byte. And a search of `src/` for `Math.random`, `Date.now` and `performance.now`, with a list of what it found and whether each can reach a pixel.

`tools/determinism.ts`, `tools/gate.ts`, `tools/lib/browser.ts`, `tools/lib/render.ts` and `tools/bench.ts` show how version 1 drove the film in the headless browser. Reuse what helps. The steps of a sandbox time out after ten minutes and the software renderer is slow: every long check runs in the background, writes its progress to a file, can be resumed, and can be given a range of frames so `/root` can split it.

## The review page

`tools/review.ts` built version 1's review page: stills beside the approved pictures and clips, one section a scene. Build version 2's under `tools/checks/review/`: one static page that shows, for each look in `config.looks`, the film's frame beside its reference picture; for each section in `config.sections` its clip; the results of the checks above; and the whole film as one video with a timeline in bars. It reads what is in `out/` and builds without what is missing. Dark, plain, fast. No audio file is ever copied into it: the film's video is silent, and the page can play a track the viewer picks from disk in step with it. Follow the house rules of `COMMON.md` for every word on it. Load the `website-building` skill first if you have it.

## What is judged

Each check's output on today's `v2`, in your report, with what it found. A check that passes on a film that breaks its rule is worse than no check: for each one, break the rule on purpose (a hold that grows, a night of three seconds, a cut, a texture made at frame 900) and show that the check fails.

A first heartbeat within 30 minutes. Your report goes to `/root` 120 minutes after you start, or sooner if you are done.
