# Main flows: the Life of a Sunflower review page

What the page does, flow by flow, and which check walks each one. The checks are in `checks/` and `sh review/checks/run.sh` runs them all.

## The film starts by itself
- Start: index.html, wide window, motion allowed
- Steps: open the page
- Expect: the film plays muted; the play button reads "Pause"; the position line moves; the time at the left counts up; the label beside the buttons reads 1080p
- Checked by: `film.cjs stream`

## Play, pause, play again
- Start: index.html
- Steps: press the play button twice; let the film end
- Expect: the film pauses and plays; at the end the button reads "Play again"
- Checked by: `film.cjs stream` for pause and play. No script lets the film run to its end

## A click on the picture
- Start: index.html
- Steps: click the film picture
- Expect: the film pauses or plays, same as the button
- Checked by: `film.cjs stream`

## Sound
- Start: index.html
- Steps: press the sound button
- Expect: sound is on and the button reads "Sound on"; if the film was paused it starts
- Checked by: `film.cjs stream` and `film.cjs phone`

## Jump on the position line, on a host that hands out no part of a file
- Start: index.html served the way the public host serves it
- Steps: click the position line near 1:42
- Expect: a note "Loading the film to jump to" with the time asked for and a percentage; when the file is here the film continues from there, the picture never goes black, and later jumps are immediate. The whole film is fetched once
- Checked by: `film.cjs stream` and `film.cjs phone`. No script looks at the picture while the film changes over to the whole file

## Jump on the position line, on a host that hands out parts
- Start: index.html on a host that answers byte range requests
- Steps: click the position line near 1:42
- Expect: the film jumps at once and the whole file is not fetched
- Checked by: `film.cjs ranges`

## Keys on the position line
- Start: index.html, position line focused
- Steps: Right, Left, Page Up, Page Down, Home, End
- Expect: 5 s, 5 s, 15 s and 15 s steps, the start, the end
- Checked by: `film.cjs stream` for the Right key. No script presses the other five

## The readout
- Start: index.html while the film plays
- Expect: the name of the part and the bar change with the film: Germination from bar 1, Frost 17, First climb 25, Storm 33, The great climb 41, Bloom 57, Field 65, Last light 73
- Checked by: `film.cjs` at two places, bar 15 (Germination) and bar 59 (Bloom). No script reads it at each of the seven turns

## Narrow window
- Start: index.html at 375 px
- Expect: the 720p file is used and the label reads 720p; no sideways scroll; tables turn into stacked rows; the position line has a taller touch area under a finger
- Checked by: `film.cjs phone`, `text-size.cjs`, `ruler.cjs`, `hit-area.cjs`. For the tables they check that nothing is wider than the window, not how the rows are laid out

## Less motion
- Start: index.html with reduced motion
- Expect: the film does not start by itself; the short videos do not start by themselves; play starts the film
- Checked by: `film.cjs reduce` for the film. No script watches the short videos under reduced motion

## A browser that refuses the plain file
- Start: index.html where the plain file fails
- Expect: the film is fetched whole and plays; if that fails too the note reads "The film could not be loaded here."
- Checked by: `film.cjs refused` for the first half. On this page it fails in some runs: see "Known fault" in README.md. No script makes both loads fail

## Links
- The skip link "Skip to the process" moves focus to the process
- "Open the live version" under the film and in the footer opens https://sun-flower-perplexity.vercel.app/live/ in a new tab
- "How it was checked" and "Known limits" inside section 02 jump to sections 06 and 07
- "SIL Open Font License" in the footer opens https://openfontlicense.org/open-font-license-official-text/ in a new tab
- Checked by: `links.py` reads the targets from the file. No script presses them in a browser

## Short videos
- Start: scroll to section 01, then section 03
- Expect: the loop and the timing sketch load when they come into view, play muted and looped, and stop when they leave the window
- Checked by: `film.cjs` for loading and playing. No script watches them stop

## Content that must stay
- Seven sections with these headings, in this order: The still and the loop; Target and result; Iterations; Why it was made this way; Design system; How it was checked; Known limits
- 29 pictures, each with alt text; two short videos; the film in two sizes (1080p 98,989,933 bytes, 720p 49,140,328 bytes)
- Every number in the text
