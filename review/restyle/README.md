# The change of look

The page was first published on 27 November 2026 with a plain look of its own. The same day it was given the look of the film: the project's colors, the film page's buttons and their words, the film itself as the position line, and the disc of the flower as the page's mark. It was published in that look at about 5:37 PM Mountain Time, at the same address. This folder is the record of that change.

Nothing in this folder goes out with the page. `publish.sh` takes `index.html`, `review.css`, `review.js` and `assets/`, and nothing else.

## The two looks

| Look | Where it is |
| --- | --- |
| The first look | `review/` at commit `f676b48`, the commit that first saved the page in this repository. It is in this branch's history. If a clone does not have it, `git fetch origin pull/4/head` brings it |
| The film's own look, the one on the public page | `review/`, beside this folder |

Where each part of the new look comes from in the project is in `review/README.md`, under "Where the look comes from".

## The sheets

`sheets/` holds seven pictures. They are the proposal as the owner saw it on 27 November 2026, before the new look was published. Each shows the first look above and the proposed look below. The labels NOW and PROPOSED in them are of that moment: NOW, "The public page as it is today", stands over the first look, and PROPOSED, "The new look, not published", over the look that has since been published.

| File | What it shows |
| --- | --- |
| `look-1-film-and-controls.jpg` | The top of the page: the film and the bar under it |
| `look-2-controls-up-close.jpg` | The bar by itself: paused, playing with the sound on, at the end of the film, and while the film loads before a jump |
| `look-3-title.jpg` | The title, and the mark beside it |
| `look-4-music.jpg` | The film laid on its music: the ruler and the eight parts |
| `look-5-design-system.jpg` | The design system: the colors, the typefaces and the two marks |
| `look-6-end-of-page.jpg` | The end of the page |
| `look-7-phone.jpg` | Four views on a phone 390 px wide |

The sheets were made once, from stills taken in Chromium at 1440 x 900 and at 390 x 844. No script in this repository makes them again. Both pages were served from the same machine, so the bar the public host puts above the page is not in them.

## What the sheets show that the page no longer has

The owner approved the look from the sheets and asked for one thing to go: the way to a live version of the film. So the lower stills show these, and the public page does not:

- "Open the live version" at the right of the bar under the film, in sheets 1, 2 and 7.
- On a phone, in sheet 7, the row of the bar the link stood in, with the label "720p" beside it. That row is gone with the link. Under 440 px the label is now kept for screen readers and not shown.
- The note under the facts, which began "The live version draws the film in your browser as it plays", in sheet 3.
- "Open the live version" in the footer, and the heading "The live version." under Known limits, in sheets 6 and 7. That limit is still on the page, headed "Live play."

`as-shown.patch` turns the three page files into the ones the lower stills were taken from. At the commit that added this folder, from the top of the repository:

```
git apply review/restyle/as-shown.patch
```

Besides the link and the note, the patch takes back three sentences that were worded again, the layout of the bar on a phone, and the second fix to the script, which came after the stills. The second fix is told in `review/README.md`, under "Two faults in the script, both fixed".

MEASURED on 27 November 2026, so that the sheets can be trusted to show these two looks:

- The folder the upper stills were taken from has the same bytes, in all 42 files, as the folder `publish.sh` puts together at commit `f676b48`.
- The folder the lower stills were taken from holds 44 files. 41 have the same bytes as the files of the public page. The other three are the page files the patch gives:

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `index.html` | 62,733 | `86d1ae00bd4652c24ee0f39729cbe4b6bd7d84acb1810bf47ec5d62bda86a2aa` |
| `review.css` | 33,178 | `77554266fb6913c93eda2ef26dc5cfc2bd1d42ecfa8e2c1de8539fdc839e16c2` |
| `review.js` | 20,007 | `4cd3f57d5be6b22c9f5d677ce8f64a3cbbcf90cfebb25bb2e58204651088a383` |

## What changed in the page's text and structure

`restyle.py` writes the new `index.html` from the first one. Every change in it is an exact replacement that has to match once, so whatever it does not name is carried over byte for byte. It does not write `review.css` or `review.js`, which were changed by hand.

```
git show f676b48:review/index.html > /tmp/first.html
python3 review/restyle/restyle.py /tmp/first.html review/tools/disc.svg /tmp/restyled.html
cmp /tmp/restyled.html review/index.html
```

MEASURED on 27 November 2026: the file it writes has the same bytes as `review/index.html`, 62,242 of them. The last line stops holding as soon as `index.html` is changed by hand.

## What stayed

`compare.py` reads two folders that `publish.sh` has put together, one for each look, and fails if anything that had to stay has changed. Its output says "first" for the first look and "new" for the one in this folder's parent.

```
git worktree add /tmp/first-look f676b48
sh /tmp/first-look/review/publish.sh /tmp/page-first
sh review/publish.sh /tmp/page-new
python3 review/restyle/compare.py /tmp/page-first /tmp/page-new
```

MEASURED on 27 November 2026: "nothing that must stay has changed".

| What | Result |
| --- | --- |
| Headings, with their levels, ids and order | The same 18 |
| Sections and their order | The same 7 |
| The film in its two sizes and the two short videos | The same sources, types and byte counts, and the same files byte for byte |
| Links | The first page had 7 and the new one has 6. The 2 that led to the live version left on the owner's word. The other 5 are there with the same targets. 1 is new: "The film laid on its music", inside the page |
| Pictures | All 29 are there with the same file, description and size. 1 is new: the film as one picture |
| Files both pages name | 36, each with the same bytes |
| New files | 3: `Fraunces-roman.woff2`, `Fraunces-italic.woff2` and `film-strip.webp`. The page no longer names `Fraunces-latin.woff2`, which held the upright letters only |
| Numbers in the text | All 216 are there at least as often. 6 stand more often or are new: 1,500, 137.508, 3,810 and the three color values `#b9d18b`, `#e8b77a` and `#e8a08c`. The note that left held 11 and 16. Both still stand in the table of checks and under Known limits, and `compare.py` does not look for them a second time |
| Text | 264 pieces before and 282 after. 18 left and 36 came. `compare.py` prints each of them |

The text that left or changed, all of it:

- The buttons under the film read "Play" and "Sound off". They now read "Play the film" and "Turn the sound on", the words of the film's own page.
- "Open the live version" left with its arrow, in the bar under the film and in the footer. The note under the facts left with it. Both on the owner's word of 27 November 2026.
- The first paragraph of the design system was written again, to describe the look as it is now. It names the live player once, as the place three of the colors come from.
- In the table of checks, the row "Script" read "the page's own script". On a page that names no other page, that would mean this one. It now reads "the script that draws each frame".
- The last of the Known limits was headed "The live version." It is now headed "Live play." and begins "When the film is drawn as it plays".
- The name in the footer is set the way the title is, so "Sunflower" is a piece of text of its own.
- In the ruler, seven of the eight names stood in colored blocks, and the last part was too short for its name. Each name now stands under the bar its part begins on, and bar 73 has "Last light".

`compare.py` reads `index.html` only. The words the script writes changed the same way, and `review.js` has them:

- At the end of the film the button read "Play again". It now reads "Play it again". "Pause" stayed.
- With the sound on, the button read "Sound on". It now reads "Turn the sound off".
- The readout beside the buttons read "Bar 61 · Bloom". It now gives the part in its own name, then the bar and the beat the way the live player writes them: "Bloom bar 61.1".
