# Flows

What a visitor can do on the site, and what has to keep working when a page changes. The site is built by `npm run site` into `site/`.

## The first page

Source `web/index.html`, built to `site/index.html`.

1. A visitor arrives. The film starts by itself, muted, from its first frame, with the browser's own controls. A screen 900 px wide or less gets `film/sunflower-720.mp4`; a wider one gets `film/sunflower-1080.mp4`. Until the film has data the first frame shows as a picture.
2. A visitor whose system asks for less motion, or whose browser refuses to start a film unasked, sees the cover picture and "Play the film". The button starts the film.
3. The film ends. "Play it again" starts it from the first frame.
4. When the film files carry a sound track, the bar shows "Turn the sound on" and "Turn the sound off". It follows the browser's own volume control. When they carry none, the button is not there.
5. "Open the live version" goes to `live/index.html`.
6. "Source on GitHub" goes to the repository named in `config/showcase.json`.

The page never scrolls sideways. On a wide screen the film fills the space above the bar; on a narrow or upright screen the film sits at the top at 16 by 9 and the text and the links follow under it.

## The live version

Source `index.html` and `src/`, built to `site/live/`.

1. The page loads the film and says what it is doing. Then the desk shows three steps: load the film, drop the track, check and record.
2. "Choose the track", or a file dropped anywhere on the page, loads the track. The page says whether it is the file the film was built to. Without a track the film plays silent on the same clock.
3. Space plays and pauses. The arrows step a frame, with Shift a bar; `[` and `]` step a bar. Dragging on the picture swings the camera, the wheel moves it closer or farther, 0 or a double click puts it back.
4. "Check this machine" (C) plays twenty seconds of the hardest parts and says whether the machine keeps up.
5. "Record" (R) goes full screen: six seconds of dark, the film with the track, two seconds of dark. Escape stops it.
6. "Pacing report" (P) plays the whole film without sound and opens one page of numbers.
7. M opens and closes the menu. H hides the interface and shows it again.

## How to check

```
npm test
npm run site
npx vite preview --outDir site
```

`tests/site.test.ts` holds what the build promises: the page names film files that exist, no placeholder is left in it, and the sound button follows the film files.
