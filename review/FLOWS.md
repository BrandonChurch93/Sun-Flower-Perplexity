# Main flows: the Life of a Sunflower review page

What the page does, flow by flow, and which check walks each one. The checks are in `checks/` and `sh review/checks/run.sh` runs them all. Every check runs in Chromium. Where no script walks a step, the flow says so.

## The film starts by itself
- Start: index.html, wide window, motion allowed
- Steps: open the page
- Expect: the film plays muted; the play button reads "Pause" and the sound button "Turn the sound on"; the time at the left counts up; the label beside the buttons reads 1080p; the readout names the part of the film, the bar and the beat
- Checked by: `film.cjs stream`

## Play, pause, play again
- Start: index.html
- Steps: press the play button twice; let the film end; press the button once more
- Expect: the film pauses and the button reads "Play the film"; it plays and the button reads "Pause"; at the end the button reads "Play it again", the readout stands in Last light and the line is lit whole; the last press starts the film from the beginning
- Checked by: `film.cjs stream` and `film.cjs phone`. They reach the end by a jump to 0.6 seconds before it. No script lets the film run from its start to its end

## A click on the picture
- Start: index.html
- Steps: click the film picture
- Expect: the film pauses or plays, same as the button
- Checked by: `film.cjs stream` and `film.cjs phone`

## Sound
- Start: index.html
- Steps: press "Turn the sound on", then press it again
- Expect: the sound is on and the button reads "Turn the sound off"; if the film was paused it starts; the second press turns the sound off again
- Checked by: `film.cjs stream` and `film.cjs phone`. They read whether the film is muted. No script listens to the sound

## The line follows the film
- Start: index.html while the film plays
- Expect: the position line is the film as one picture. A small flower head stands where the film is, and the picture is lit up to that place. Both stay within one screen pixel of the film's time
- Checked by: `follow.cjs` on every frame the browser draws for 8 seconds, and `film.cjs` for 4 seconds in its stream, phone and ranges runs

## The readout
- Start: index.html while the film plays
- Expect: the name of the part, then the bar and the beat, written "Bloom bar 61.3"; before the first bar it reads "before bar 1". The parts begin on these bars: Germination 1, Frost 17, First climb 25, Storm 33, The great climb 41, Bloom 57, Field 65, Last light 73. The beat turns over on the beat, and the name turns on the bar line
- Checked by: `flows.cjs` at each of the seven turns with the film paused, and at the turn on bar 17 while the film plays; `follow.cjs` and `film.cjs` for the beat

## The names under the line
- Start: index.html at 1001 px and wider
- Expect: the eight names stand under the line, each where its part begins, and the name of the part the film is in is marked. At 1000 px and narrower the names are not shown, and the readout stands between the two times
- Checked by: `film.cjs stream` and `film.cjs phone`, and `widths.cjs` for the widths on both sides of the change

## Jump on the position line, on a host that hands out no part of a file
- Start: index.html served the way the public host serves it
- Steps: click the position line near 1:42
- Expect: a note "Loading the film to jump to" with the time asked for and a percentage. The note stands where the readout stood and the bar keeps its height. The flower head, the time and the names go to the place asked for, and the film plays on meanwhile. When the file is here the film continues from that place and the readout comes back. Later jumps are immediate. The whole film is fetched once
- Checked by: `film.cjs stream` and `film.cjs phone`. No script looks at the picture while the film changes over to the whole file

## Jump on the position line, on a host that hands out parts
- Start: index.html on a host that answers byte range requests
- Steps: click the position line near 1:42
- Expect: the film jumps at once and the whole file is not fetched
- Checked by: `film.cjs ranges`

## Keys on the position line
- Start: index.html, position line focused, film paused
- Steps: Right, Left, Page Up, Page Down, Up, Down, Home, End
- Expect: steps of 5, 5, 15, 15, 5 and 5 seconds, then the start and the end. The readout follows, and the line tells a screen reader the time and the part, as in "2:06 of 2:07, Last light"
- Checked by: `flows.cjs` for all eight keys, and `film.cjs stream` for the Right key while the film plays

## Narrow window
- Start: index.html at 375 px
- Expect: the 720p file is used; no sideways scroll; tables turn into stacked rows; the position line takes a finger over its whole height and nowhere else. Under 440 px the two buttons share the width, and the label "720p" is kept for screen readers and not shown. Under 355 px each button takes a row of its own
- Checked by: `film.cjs phone`, `text-size.cjs`, `ruler.cjs`, `hit-area.cjs`, and `widths.cjs` at 39 window sizes from 2560 x 1440 down to 320 x 640. For the tables they check that nothing is wider than the window, not how the rows are laid out

## Less motion
- Start: index.html with reduced motion
- Expect: the film does not start by itself; a jump lands and the film stays paused; "Play the film" starts it. The two short videos do not start by themselves, and each keeps its controls
- Checked by: `film.cjs reduce` for the film, `flows.cjs` for the short videos

## A browser that refuses the plain file
- Start: index.html where the plain file fails
- Expect: the note "Loading the film"; the film is fetched whole at once and plays. If that fails too, the note reads "The film could not be loaded here." in the bar, where the readout stood
- Checked by: `film.cjs refused`; `race-trace.cjs` over 40 loads, where no load may miss the refusal; `late-script.cjs` with the script held back until after the refusal; `flows.cjs` for a film that cannot be loaded at all

## A browser that has not begun on the film yet
- Start: index.html, where the script starts before the browser has begun on the film
- Expect: the page waits. It does not take that moment for a refusal, fetches nothing extra, and the plain file plays
- Checked by: `false-alarm.cjs`, with that moment set up on purpose in 8 loads and then left to chance in 40

## Links
- The skip link "Skip to the process" is the first stop of the Tab key and moves the focus to the process
- "How it was checked" and "Known limits" inside section 02 jump to sections 06 and 07
- "The film laid on its music" inside section 05 jumps to that heading in section 04
- "SIL Open Font License" in the footer opens https://openfontlicense.org/open-font-license-official-text/ in a new tab
- "Open the film file (1080p, MP4)" stands inside the film itself, where only a browser that cannot play video shows it
- No link leads to a live version of the film, and no words name one. The page is where the film is watched
- Checked by: `links.py` reads the six targets from the file; `flows.cjs` presses the four links inside the page and reads where the license link leads; `words.py`, `links.py` and `flows.cjs` fail if a way to a live version comes back. No script opens the page in a browser that cannot play video

## Short videos
- Start: scroll to section 01, then section 03
- Expect: the loop and the timing sketch are not touched until they come into view. Then they play muted, begin again at their end, and stop when they leave the window
- Checked by: `flows.cjs`, and `film.cjs` for loading and playing

## The two marks
- Expect: the disc by the title, in the design system and in the footer is the one `tools/disc.py` draws by the film's own rule, 1,500 dots. The line is the picture `tools/strip.py` makes from the film, one column for each of its 3,810 frames
- Checked by: `marks.py`

## Content that must stay
- Seven sections with these headings, in this order: The still and the loop; Target and result; Iterations; Why it was made this way; Design system; How it was checked; Known limits
- 30 pictures, each with alt text; two short videos; the film in two sizes (1080p 98,989,933 bytes, 720p 49,140,328 bytes)
- Every number in the text
- Checked by: `restyle/compare.py` against the page as it was first published, and `page.cjs` for the alt text
