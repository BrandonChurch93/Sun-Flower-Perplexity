# The public review page

This folder is the source of the public page for Life of a Sunflower: the finished film at the top, then how it was made. It is a page of its own, with only what a visitor should see, and it is saved here so that it can be published again anywhere.

Address: https://www.perplexity.ai/computer/a/life-of-a-sunflower-review-0xhpZ5a_S3Kaj9U7He9UlQ

## Where it stands

The page was first published on 27 November 2026 with a plain look of its own, the one saved at commit `f676b48`. The same day, at about 5:37 PM Mountain Time, it was published again at the same address in the look of the film. That is the page in this folder. What changed and what stayed is in `restyle/README.md`.

MEASURED on 27 November 2026 between 5:52 and 6:05 PM Mountain Time, on the public address, in Chrome on a cloud machine that was not signed in:

- The page opens without signing in. The film starts by itself, muted, in 1080p.
- All 44 files of the page were fetched again and compared with the folder `publish.sh` puts together from this one. 43 came back with the same bytes. `index.html` came back with one script of the host's own added before `</body>`; with that script taken out, it has the same bytes as the file here.
- The page has 6 links and 30 pictures, and no picture is broken. No link leads to a live version of the film, and no words name one.
- A click on the position line near 1:42 took the film there after 5.0 seconds. The film played on meanwhile. A second jump took 0.2 seconds.
- In a window 390 px wide the page played the 720p file, nothing ran off the side, and a jump to 1:42 took 2.7 seconds.

## What is here

| Path | What it is |
| --- | --- |
| `index.html`, `review.css`, `review.js` | The page: its text, its look, and the script behind the film's controls and the short videos |
| `assets/media/` | 34 files. 32 pictures: stills of the film, the targets they were built to, the lighting studies, version 1, the film as one picture (`film-strip.webp`), and two posters that stand in for a video until it plays. 2 short videos: the card loop and a piece of the timing sketch |
| `assets/fonts/` | Fraunces, upright and italic, and Work Sans, with the licence of each. Where they came from is in `ASSETS.md` at the top of the repository |
| `publish.sh` | Puts the page and the film together in one folder, ready to be deployed |
| `tools/` | The two marks of the page, made from the film. `disc.py` draws the disc of the flower, and `disc.svg` is what it draws. `strip.py` makes the film into one picture, the position line |
| `FLOWS.md` | What the page does, flow by flow, and which check walks each one |
| `checks/` | The checks, which `sh review/checks/run.sh` runs in one go |
| `restyle/` | The record of the change of look: seven sheets with both looks, the script that wrote the new `index.html` from the first one, and the comparison of the two |

Nothing outside this folder reads it. The site build (`npm run site`) does not take it in, so a change here does not change the project's own site.

## The film is not in this folder

The page plays two film files. Both are made from files this repository already holds, so they are not stored a second time. `publish.sh` makes them and compares them with the published ones.

| File on the page | Bytes | Made from | SHA-256 |
| --- | --- | --- | --- |
| `assets/film/life-of-a-sunflower-1080p.mp4` | 98,989,933 | A copy of `portfolio/sunflower-video.mp4` | `3259d4024c46b2b7c68064463f931e4edc96c45d499e913983cf39eaa3c71c69` |
| `assets/film/life-of-a-sunflower-720p.mp4` | 49,140,328 | The picture of `web/film/sunflower-720.mp4` with the sound of `portfolio/sunflower-video.mp4`. Neither is encoded again | `6da9aa28dc13528d477f45e7f01ea148d1573d560d18e13859a0520828acec39` |

MEASURED on 27 November 2026 with ffmpeg 8.0.1: both files come out with the same bytes as the published ones. Another ffmpeg may write the 720p file with other bytes around the same picture and sound. The script then compares the picture and the sound by themselves, and says which of the two comparisons held.

## Look at it on your own machine

```
sh review/publish.sh /tmp/sunflower-review-page
node review/checks/serve.cjs /tmp/sunflower-review-page 8080
```

Then open http://127.0.0.1:8080/. The folder has to be outside the repository, so that 148 MB of film cannot end up in a commit. With `NORANGE=1` in front of the second line, the server answers the way the public host does.

## Publish it

1. Run `sh review/publish.sh FOLDER`. The folder holds the page, the film and nothing else of this folder: no note, check or tool goes out with the page.
2. Deploy that folder as a site with `index.html` as its entry point, to the library entry "Life of a Sunflower Review". MEASURED on 27 November 2026: a deploy to the same entry replaced the files, kept the address and kept the page public. In the workspace it was deployed from, the entry goes with the path of the folder, so the folder was put together again at the same path and deployed from there.
3. STATED by the deploy tool: a new entry starts private. Make it public, or the address shows a sign-in wall to everyone but the owner.
4. Open the address in a browser that is not signed in. The film has to play by itself, muted, and a click on the position line has to take the film there.

## Any other host

The folder `publish.sh` puts together is 44 plain files that name each other by relative paths, 157,763,587 bytes in all, of which the film in its two sizes is 148,130,261. The page loads nothing from any other address, so any static host can serve the folder from any address. On a host that hands out parts of a file the film jumps at once, and the whole file is never fetched (`film.cjs ranges`).

On 27 November 2026 the page is published at the one address above and nowhere else.

## What the host does, and what the page does about it

MEASURED on 27 November 2026 from the public page, not signed in, in Chrome:

- The host hands out no part of a file. A request for bytes 1000 to 1999 of the 1080p film came back with status 200 and without Accept-Ranges, Content-Range or Content-Length. As a plain file the film can be played from its start only.
- Every file came with `Cache-Control: no-store`, so a browser keeps nothing of the page from one visit to the next.
- The host adds one script of its own to `index.html`, 15,755 bytes, before `</body>`.
- The host puts a bar of its own above the page. It reads "Made with Perplexity Computer" and holds "Download", "Build your own" and "Copy Link". The page itself says nothing about where it is hosted or what made it, and on another host that bar would not be there.

So the page plays the plain file from its start. The first time a visitor asks for another place, it fetches the whole film in the background and shows a note with the place and a percentage, where the readout stood. The film plays on meanwhile. When the file is in, the film carries on from the place asked for, and every later jump is immediate. The times measured on the public address are at the top of this file. They were measured from a cloud machine. A home connection is not measured.

## Where the look comes from

Every part of the look is taken from the project. The lines named here are those of commit `d70d76f`.

| Part of the look | Where it comes from |
| --- | --- |
| Six colors: ground, panel, line, text, quiet and gold | The film's own page, `web/index.html` lines 17 to 22 |
| Three more: leaf `#b9d18b`, amber `#e8b77a` and rose `#e8a08c` | The live player, where they mark a result: `src/player/desk.module.css` lines 173, 177, 278, 282, 425, 426 and 430, `src/player/sheet.module.css` lines 58 and 62, `src/player/loading.module.css` line 94 |
| The buttons: a pill with a fine edge, gold on the leading one, 44 px high under a finger | `.pill` in `web/index.html`, from line 116. Its fill is line 123, the focus ring line 137 and the 44 px line 140 |
| The words on the buttons | `web/index.html`: "Play the film" lines 175 and 200, "Turn the sound on" and "Turn the sound off" lines 183 and 221, "Play it again" line 216. "Pause" is the live player's word, `src/director/live.ts` line 331 |
| The readout, as in "bar 61.3" and "before bar 1" | The live player writes the bar and the beat this way, `src/director/live.ts` line 322 |
| The eight parts and the bars they begin on | `config/showcase.json` lines 45 to 52 |
| The mark: the disc of the flower | `tools/disc.py` draws it by the film's own rule, 1,500 florets, each turned 137.508 degrees from the one before: `config/showcase.json` lines 287 and 288, `src/plant/head/disc/index.ts` lines 11, 12, 14, 98 and 99. The florets near the middle are drawn fainter, because in the film they stay closed: `src/plant/head/disc/opening.ts` lines 17 and 25 |
| The line: the film as one picture | `tools/strip.py` makes it from `portfolio/sunflower-video.mp4`, one column for each of the 3,810 frames |

Three tints are not the project's own. They were made for this page from its colors, and each is used once in `review.css`: `#d3cdbe`, the text color one step quieter for long reading text (line 40); `#f2cf73`, the gold one step lighter for a link under the pointer (line 73); `#4a4538`, the edge of a color sample in the design system (line 453). Black stands behind the film and the pictures.

The typefaces are a choice made for this page. The film's own page is set in the system's sans serif (`web/index.html` line 36). This page sets its headings and the film's own names in Fraunces, and its text in Work Sans.

## No way to a live version

On the owner's word of 27 November 2026 the page is where the film is watched. It has no link to a live version of the film and no words that name one. The link that stood under the film and in the footer is gone, and so is the note under the facts that led to it. `words.py`, `links.py` and `flows.cjs` fail if a way to one comes back.

Four sentences still speak of live play. They say how the film was made and measured, and they point nowhere: one in the first paragraph of the design system, the row "Script" in the table of checks, and "One sample a frame" and "Live play" under Known limits.

## Narrow windows

| Window | What changes |
| --- | --- |
| 1001 px and wider | The eight names stand under the position line. The bar under the film is 141 px high |
| 1000 px and narrower | The names are not shown, and the readout stands between the two times. The bar is 143 px high. Under 1000 px the 720p file is used |
| Under 440 px | The two buttons share the width. The label "720p" is kept for screen readers and not shown |
| Under 355 px | Each button takes a row of its own. The bar is 195 px high |

MEASURED by `widths.cjs` at 39 window sizes.

## Checks

```
npm ci
npx playwright-core install chromium
sh review/checks/run.sh
```

`run.sh` puts the page together with `publish.sh`, serves it twice on this machine, once the way the public host answers and once with byte ranges, and runs the checks in a Chromium without a window. It also needs python3 with numpy and Pillow, and ffmpeg with ffprobe. It takes about five and a half minutes. Five of its checks time the page, so it should run alone on the machine.

MEASURED on 27 November 2026 from 5:27 to 5:33 PM Mountain Time: every check passed. The run printed 145 lines that begin with PASS and none that begins with FAIL, in 325 seconds. The page that was published four minutes later has the same bytes as the one that was checked.

| Check | PASS lines | What it looks at |
| --- | --- | --- |
| `publish.sh` | | Both film files are the ones the public page plays. The folder holds 44 files |
| `files.py` | | Every file the page names is in the folder, and the folder holds nothing else: 39 files named, and the 2 licences |
| `links.py` | | The 6 links: 4 inside the page, 1 that leaves it and opens in a new tab, 1 to the film file |
| `words.py` | | The rules for the words: no em or en dash, no exclamation point, no word about who or what made the film, no address off a short list, no way to a live version |
| `marks.py` | 9 | The disc in the page is the one `tools/disc.py` draws, 1,500 dots, with the film's own count and angle. The line is the picture `tools/strip.py` makes again from the film with the same bytes, 3,810 columns for 3,810 frames |
| `film.cjs stream` | 31 | The film starts by itself, muted, in 1080p; the words on the buttons; the readout, the names under the line, the flower head and the lit part of the line against the film's time; a jump on a host without byte ranges; the Right key; sound; pause and play; the end of the film; the two short videos |
| `film.cjs phone` | 30 | The same at 375 px under a finger, in 720p |
| `film.cjs refused` | 6 | A browser that refuses the plain file gets the film whole |
| `film.cjs reduce` | 6 | With reduced motion the film waits, a jump lands and stays paused, and Play starts it |
| `film.cjs ranges` | 18 | On a host with byte ranges the film jumps without fetching the whole file |
| `text-size.cjs` | 2 | No text under 12 px and nothing wider than the window, at 1440 and at 375 px |
| `ruler.cjs` | 3 | The bar numbers of the music ruler at 375, 351 and 320 px. Their smallest gaps: 17, 14.4 and 11 px |
| `page.cjs` | 9 | Contrast of 4.5 to 1, or 3 to 1 for large text; a description on all 30 pictures and on every video; one main heading and no level skipped; buttons at least 44 px high; a focus ring on the first five stops of the Tab key |
| `hit-area.cjs` | 2 | The position line takes clicks over its own height, 49 px with a mouse and 47 px under a finger, and nowhere else |
| `flows.cjs` | 22 | The skip link; the eight keys on the line and what the line tells a screen reader; the readout at each of the seven turns, and on bar 17 while the film plays; no way to a live version; the links inside the page and the licence link; the short videos; less motion; a film that cannot be loaded at all |
| `widths.cjs` | 1 | 39 window sizes from 2560 x 1440 down to 320 x 640, and three phones on their side: nothing runs off the side, nothing in the bar touches or leaves it, the names stay apart, the title stays clear of the mark, and from 641 px the film and its bar fit in the window |
| `follow.cjs` | 1 | Every frame the browser draws for 8 seconds, 480 of them: none showed the beat before, the flower head was at most 0.53 px off the film and the lit edge at most 0.5 px |
| `cost.cjs` | 1 | What the page costs while the film plays and nobody touches it: 48.2 ms of work a second, under the limit of 150 |
| `race-trace.cjs` | 1 | 40 loads with the film refused: none missed the refusal |
| `late-script.cjs` | 1 | The script held back until after the refusal: it asked for the whole film 0.02 seconds after it started, and the film played 6.31 seconds after the page arrived |
| `false-alarm.cjs` | 2 | The script started before the browser had begun on the film, set up on purpose in 8 loads and left to chance in 40: the whole film was fetched in none |

What no script does is said flow by flow in `FLOWS.md`. Two rules for the words have to be read by eye: the page gives no family name of a reviewer, and it names no other film, game or product.

## Two faults in the script, both fixed

Both were in how the page tells that a browser has refused the film file. Both were measured in Chromium, on a copy of the page served on the same machine.

The first was on the page as it was first published. When a browser refuses the film file, the page should fetch the film whole at once. It could miss the refusal, because the browser may report it before the page's script has begun to listen. The script then learned of it only from its fallback, 12 seconds after play was asked for. MEASURED on that page: 2 of 40 loads missed the refusal, and with the script held back the page asked for the whole film after 12.9 seconds and the film played after 19.8. The script now reads the film's state once when it starts and once more when the page has loaded. MEASURED on the page as it is: 0 of 40 loads missed it, and the film played after 6.31 seconds.

The second never reached the public page. It came with the first fix and was found before the new look was published. A film the browser has not begun on yet reads the same as one whose files were all turned down: nothing loaded, and no file. A script that started in that moment took it for a refusal and fetched the whole film, although the plain file played. MEASURED on a copy with the first fix only: 1 of 150 loads, in each of two counts. The script now counts that reading only with one thing more: an error was just heard, or the browser names a file, or the page has finished loading. MEASURED on the page as it is: with the moment set up on purpose in 8 loads, the whole film was fetched in none. Left to chance, the moment came twice in 40 loads in one run and not at all in another, and the whole film was fetched in none.

On the public host Chromium takes the file, so the first fault needed a browser that refuses it. Whether Safari or an iPhone does is not known.

## When the film changes

1. Replace `portfolio/sunflower-video.mp4` and `web/film/sunflower-720.mp4`. The page's two film files are made from them.
2. Run `sh review/publish.sh FOLDER`. It says that the film is no longer the published one, and prints the new SHA-256 of each file and the packet sums of the 720p file's picture and sound. Put the four values at the top of `publish.sh` and the two SHA-256 values in the table above.
3. In `index.html`, change the two `data-bytes` values on the film's source lines, and the size and SHA-256 of the film file under "How it was checked". If the length changes, change `max="127"` and `2:07` on the position line and `LENGTH` in `review.js`.
4. Make the line again: `python3 review/tools/strip.py portfolio/sunflower-video.mp4 review/assets/media/film-strip.webp`. If the number of frames changes, change `3,810` where the page says it, and the size the page gives the picture.
5. Replace every still in `assets/media/` that shows a moment that changed.
6. Run the checks, deploy the folder to the same library entry, and open the address signed out.

## Not known

- Safari, an iPhone, Firefox and any real phone. Every check ran in Chromium, and the public page was opened in Chrome.
- The time of the first jump on a home connection.
- Whether the address stays up when the account that published it is closed or loses its access. STATED by the host's help pages, read on 27 November 2026: deleting an account deletes what it has shared ([Account Deletion](https://www.perplexity.ai/help-center/en/articles/10354879-account-deletion)); a member who is removed from an organization can no longer open what they made in it ([How do I delete my Enterprise organization?](https://www.perplexity.ai/help-center/en/articles/11773384-how-do-i-delete-my-enterprise-organization)); and an administrator can turn public sharing off for an organization ([What are Artifacts?](https://www.perplexity.ai/help-center/en/articles/2026102801-what-are-artifacts)). None of them says what then happens to a page that is already published. This folder is what keeps the page from depending on it: see "Any other host".
