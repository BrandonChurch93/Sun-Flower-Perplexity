# The public review page

This folder is the source of the public page for Life of a Sunflower: the finished film at the top, then how it was made. It is a page of its own, with only what a visitor should see, and it is saved here so that it can be published again anywhere.

Address: https://www.perplexity.ai/computer/a/life-of-a-sunflower-review-0xhpZ5a_S3Kaj9U7He9UlQ

The page was published on 27 November 2026 and opens without signing in. The files here are the published ones, byte for byte. MEASURED on 27 November 2026:

- `publish.sh` puts together a folder of 42 files, and all 42 have the same bytes as the folder that was deployed.
- All 42 were then fetched from the public address in a browser that was not signed in. 41 came back with the same bytes. `index.html` came back with one script of the host's own added before `</body>`; with that script taken out, it has the same bytes as the file here.

## What is here

| Path | What it is |
| --- | --- |
| `index.html`, `review.css`, `review.js` | The page: its text, its look, and the script behind the film's controls and the short videos |
| `assets/media/` | 31 pictures and 2 short videos: stills of the film, the targets they were built to, the lighting studies, version 1, the card loop and a piece of the timing sketch |
| `assets/fonts/` | Fraunces for the headings and Work Sans for the text, each with its licence. Where they came from is in `ASSETS.md` at the top of the repository |
| `publish.sh` | Puts the page and the film together in one folder, ready to be deployed |
| `FLOWS.md` | What the page does, flow by flow, and which check walks each one |
| `checks/` | The checks, which `sh review/checks/run.sh` runs in one go, and two scripts that measure the known fault |

Nothing outside this folder reads it. The site build (`npm run site`) does not take it in, so a change here does not change the live site.

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

1. Run `sh review/publish.sh FOLDER`. The folder holds the page, the film and nothing else of this folder: no note, check or tool goes out with the page. It is plain files that name each other by relative paths, so any static host can serve it from any address.
2. Deploy that folder as a site with `index.html` as its entry point, to the library entry "Life of a Sunflower Review". STATED by the deploy tool, and not done yet for this page: a deploy to the same entry replaces the files and keeps the address.
3. A new entry starts private. Make it public, or the address shows a sign-in wall to everyone but the owner.
4. Open the address in a browser that is not signed in. The film has to play by itself, muted, and a click on the position line has to take the film there.

The host puts its own bar above the page. The page itself says nothing about where it is hosted.

## What the host does, and what the page does about it

The host hands out no part of a file. MEASURED on 27 November 2026 from the public page, not signed in, in Chrome: a request for bytes 1000 to 1999 of the 720p film came back with status 200 and without Accept-Ranges, Content-Range or Content-Length. As a plain file the film could be played from its start only.

So the page plays the plain file from its start. The first time a visitor asks for another place, it fetches the whole film in the background and shows a note with the place and a percentage. When the file is in, the film carries on from that place, and every later jump is immediate. MEASURED the same day on the public address: a jump to 1:41 landed after 6.1 seconds. That was from a cloud machine. A home connection is not measured.

On a host that hands out parts, the page jumps at once and fetches nothing extra (`film.cjs ranges`).

## Checks

```
npm ci
npx playwright-core install chromium
sh review/checks/run.sh
```

`run.sh` puts the page together with `publish.sh`, serves it twice on this machine, once the way the public host answers and once with byte ranges, and runs the checks in a Chromium without a window. MEASURED on 27 November 2026: every check passed, with 68 of 68 lines in the browser checks.

| Check | What it looks at |
| --- | --- |
| `publish.sh` | Both film files are the ones the public page plays |
| `files.py` | Every file the page names is in the folder, and the folder holds nothing else |
| `links.py` | The 7 links: 3 inside the page, 3 that leave it and open in a new tab, 1 to the film file |
| `copy.py` | The rules for the words: no em or en dash, no exclamation point, no word about who or what made the film, no address off a short list |
| `film.cjs stream` | 16 lines. The film starts by itself, muted, in 1080p; the page's own position line; a jump on a host without byte ranges; the Right key; sound; pause and play; the two short videos |
| `film.cjs phone` | 15 lines. The same at 375 px under a finger, in 720p |
| `film.cjs refused` | 6 lines. A browser that refuses the plain file gets the film whole |
| `film.cjs reduce` | 5 lines. With reduced motion the film waits, a jump lands and stays paused, and Play starts it |
| `film.cjs ranges` | 10 lines. On a host with byte ranges the film jumps without fetching the whole file |
| `text-size.cjs` | No text under 12 px and nothing wider than the window, at 1440 and at 375 px |
| `ruler.cjs` | The bar numbers of the music ruler at 375, 351 and 320 px. Their smallest gaps: 17.6, 15 and 11.6 px |
| `page.cjs` | Contrast of 4.5 to 1, or 3 to 1 for large text; a description on all 29 pictures and on every video; one main heading and no level skipped; buttons at least 44 px high; a focus ring on the first five stops of the Tab key |
| `hit-area.cjs` | The position line takes clicks over its own height, 24 px with a mouse and 40 px under a finger, and nowhere else |

What no script does is said flow by flow in `FLOWS.md`. Two rules for the words have to be read by eye: the page gives no family name of a reviewer, and it names no other film, game or product.

## Known fault

When a browser refuses the film file, the page should fetch the film whole at once. It can miss the refusal: the browser may report it before the page's script has begun to listen. The script then learns of it only from its fallback, which fetches the film 12 seconds after play was asked for. In every run that was watched to its end, the film played.

MEASURED on 27 November 2026 in Chromium, on a copy of the page served on the same machine:

- `node review/checks/race-trace.cjs URL 40` loads the page 40 times with the film refused: 2 of the 40 loads missed the refusal.
- `node review/checks/late-script.cjs URL` holds the script back by 0.8 seconds, so that the refusal always comes first: the page asked for the whole film after 12.9 seconds, and the film played after 19.8.
- `film.cjs refused` fails with one line of its six in a run that misses: 2 of 20 runs.

The two measuring scripts end with status 1 while the fault is there, so `run.sh` does not run them.

On the public host Chromium takes the file, so the fault needs a browser that refuses it. Whether Safari or an iPhone does is not known.

A fix exists in the branch `review-page-look`, with the proposed new look of the page. It is not on the public page.

## When the film changes

1. Replace `portfolio/sunflower-video.mp4` and `web/film/sunflower-720.mp4`. The page's two film files are made from them.
2. Run `sh review/publish.sh FOLDER`. It says that the film is no longer the published one, and prints the new SHA-256 of each file and the packet sums of the 720p file's picture and sound. Put the four values at the top of `publish.sh` and the two SHA-256 values in the table above.
3. In `index.html`, change the two `data-bytes` values on the film's source lines, and the size and SHA-256 of the film file under "How it was checked". If the length changes, change `max="127"` and `2:07` on the position line and `LENGTH` in `review.js`.
4. Replace every still in `assets/media/` that shows a moment that changed.
5. Run the checks, deploy the folder to the same library entry, and open the address signed out.

## Not known

- Safari, an iPhone, Firefox and any real phone. Every check ran in Chromium.
- The time of the first jump on a home connection.
