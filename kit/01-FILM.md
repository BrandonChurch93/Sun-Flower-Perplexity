# 01 · The film

## What it is

- Working title: `name` in the config.
- The life of one sunflower, from the seedling breaking the soil to full bloom, in one continuous camera move.
- Length `film.durationSeconds` seconds at `film.fps` frames per second. It never pauses. Something is always growing and the camera is always moving.
- Five worlds, in the order of `worlds` in the config. Six segments, in `segments`.
- No people, no animals, no insects, no buildings, no machines. No titles, labels, captions or logos in the picture.
- Sound is added later in the edit. The film is built and judged silent.

## The idea

The plant never stops. The world cuts around it.

- The sunflower grows in time-lapse, smoothly, from the first frame to the last.
- The camera makes one unbroken move, rising with the plant and ending high above it and far back.
- The weather plays at its natural speed: rain falls like rain, fog drifts like fog.
- Five times the world is replaced in a single frame: the sky, the light, the air and the state of the ground all change at once. The plant and the camera do not notice. They are in exactly the place the last frame left them.
- That contrast is the whole film. A calm living thing, and a world that keeps changing behind it.

## Where it runs

- `platform.name`. Video starts playing muted in the timeline.
- The master is `formats.master`. There is no vertical version.
- The platform loops videos shorter than `platform.loopsUnderSeconds` seconds. This film is exactly that long and is not built to loop. It ends on a finished picture, not a fade.
- The post will say this was built with Perplexity Computer. The film has to make that hard to believe.

## The viewer

- Someone scrolling who has seen time-lapse flowers before and scrolls past them.
- They stop because the first frame is the ground itself, huge and close, already moving.
- They stay because the world keeps snapping to something new while the plant carries on, and they want to see what it becomes.
- They finish because the bloom is the most beautiful sunflower they have seen, and then the camera rises and there are thousands.

## Rules for the opening

- Frame 0 is the poster frame. No fade in. The first frame is already a finished picture: dark crumbs of soil, heaving, with low sun raking across them and dew on every blade of grass.
- Something visibly moves from the first frame: the soil is already lifting.
- By `film.hookSeconds` seconds the pale hook of the seedling has broken the surface. This has to work muted, on a phone, at a glance.

## Second by second

Times are in `segments` and `plant.stages` in the config. This table says what happens.

| Segment | World | The plant | The world | The camera |
| --- | --- | --- | --- | --- |
| `dawn` | Dawn with dew | The soil cracks. A pale hooked stem pushes up with the striped seed husk still clamped on. It straightens, the husk falls, two seed leaves open | Sunrise, low and warm from the right. Dew on grass and soil. Thin glowing mist | A macro lens a finger's width above the soil, drifting back and lifting slightly |
| `rain` | Downpour | The stem thickens and climbs. Pairs of true leaves unfold one after another | Hard cut to a dark downpour. Splashes, puddles, water running off the leaves | Still backing away and rising. The whole young plant is in frame |
| `night` | Night under stars | It keeps climbing. Leaves lower a little, the way they do at night. In its last seconds the tip tightens into a bud | Hard cut to a clear night. The Milky Way, a cold rim of moonlight, low mist | Rising, tilting up a little so the sky opens behind the plant |
| `frost` | Cold fog and frost | Taller still. The bud swells inside its green bracts | Hard cut to thick pale fog and hoarfrost on every edge. A white sun low on the right | Rising to the height of the bud and drifting in, close enough to see the frost crystals |
| `bloom` | Golden hour | The bud leans to the sun. The bracts fold back, the petals unfurl, the disc opens ring by ring, and the head turns to face us | Hard cut to golden hour. Low sun at the left, haze lit gold, pollen in the air | Level with the head, easing back a little as it opens and arcing slowly round it |
| `field` | Golden hour | Fully open, swaying gently | No cut. The same golden light | Cranes up and back. First the whole plant, then the field: thousands of sunflowers to the horizon |

## The cuts

- A cut happens at every segment boundary where the world changes. Between `bloom` and `field` the world is the same, so there is no cut there.
- A cut takes no time. One frame is entirely the old world and the next frame is entirely the new one. No dissolve, no flash, no wipe.
- Every cut lands on a bar line at 120 beats per minute, so music can hit it.
- Across a cut the plant's shape and the camera's position, direction and lens are continuous. `kit/07-QUALITY-BAR.md` has a machine check for this.
- What reacts to the weather reacts after the cut, never before it. Leaves start to bounce in the first frames of the rain. The plant eases toward the new light over `plant.leanEaseSeconds`.
- A frame never mixes two worlds. The world is chosen by the frame's own time. Every sample of that frame uses that world.

## The camera

- One continuous move for the whole film. No cut, no jump, no stop. The camera is always travelling, even when it is slow.
- The starting path is `camera.keys` in the config. At each listed time it gives the distance from the plant, the lens height, the height it aims at, where the foot of the plant's stem sits across the frame (`frameX`: 0 is the left edge, 1 is the right edge), the angle round the plant (it grows as the camera moves to its own right) and the focal length. Eight of the times are the times of the approved images, and the values at those times were measured from the images. The path between the keys is smooth.
- The camera rises with the plant the whole way. It backs away as the plant grows, with one exception: through `frost` it drifts in toward the bud, slowly, and it eases back out as the head opens. That drift is part of the one move. It is never a stop or a turn.
- Through `dawn` and the first part of `rain` the whole plant is in frame. After that the frame follows the growing tip, and the lower stem leaves the bottom of the frame. `field` shows the whole plant again, and then everything.
- Focus follows the growing tip all the way: the hook, the seed leaves, the newest leaf, the bud, the face of the flower.
- The camera has mass. Every change of speed is eased.
- A small seeded drift sits on top of the move, like a stabilized camera on a slider. It is never a visible shake.
- The camera never passes through a leaf, a blade of grass or a neighbor, and never shows the edge of anything: no end of the ground, no back of a backdrop.
- At each key's time the frame matches its approved image: what is in frame, how large the plant is, where it sits, where the light comes from. The one exception is a difference listed under `settled` for that key in the config. `kit/06-ASSETS.md` explains those.
- The smooth move comes first. If two approved images cannot both be matched exactly without a jerk between them, keep the move smooth and match each image's subject, size and light as closely as the path allows. Log it.
- Lens rules are in `kit/04-LOOK.md`.

## Light across the film

- Each world has one main light and its own sky. `kit/02-SUBJECT.md` gives each one.
- The side the light comes from alternates, so every cut changes the picture as much as it can: right at dawn, flat from above in the rain, a cold rim from the left at night, a pale disc on the right in the frost, low on the left at golden hour.
- Exposure is set per world so the plant is always readable. The night is exposed like a professional night photograph, not left dark.
- Inside a world the light may move a little, the way real light does in a few seconds. It never fades toward the next world.

## Clips

- Each segment is also delivered as its own clip, cut from the same frames as the film. Nothing is rendered differently for a clip.
- A clip starts on its segment's first frame and ends on its last.

## Sound hand-off

The Builder writes `cut/CUES.md`:

- A timecode for every cut.
- Timecodes for the moments that want a sound: the soil cracking, the husk falling, the first raindrops, the thunder flicker, the first petal, the head turning, the start of the crane.
- A note on where music should build and where it should land. The cuts are the beats. The bloom is the peak. The field is the release.

## Not in this film

- People, animals, birds, insects. No bee on the flower.
- Buildings, roads, fences, poles, wires, machines, aircraft.
- Text of any kind.
- A fade in or a fade out.
- Time-lapse flicker in the light. The light is steady inside a world.
- An intro of someone typing a prompt, and an end card. The team adds those in the edit with its own tools.

## What the Builder may tune

- The values in `camera.keys`, to match the approved images and to keep the move smooth. The times of the keys stay.
- The values in `plant.heightM` and `plant.stages`, to match the approved images. The plant is always growing: its height never falls and never holds still before the bloom is complete.
- `plant.leanEaseSeconds`.
- `field.plantAheadOfRowM` and the values in `field.companion`, to match the approved images.
- Every change is made in the config and logged.

The Builder does not change the segment times, the order of the worlds, the number of cuts or the length of the film. If Brandon asks for timing changes they arrive as an addendum or as a note in the thread.
