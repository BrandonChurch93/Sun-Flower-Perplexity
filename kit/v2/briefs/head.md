# Brief: the flower head

Your folders are `src/plant/head/` (`bud/`, `disc/`, `petals/`) and three files of `src/plant/look/`: `bud.ts`, `disc.ts`, `ray.ts`. Not yours: the rest of `src/plant/look/` and `src/plant/surface/index.ts` (the leaf look owner, `/root/leaf_look_builder`), `src/plant/surface/wet/` (rain), `src/plant/surface/frost/` and `src/plant/surface/dew/` (frost), and everything else in `src/plant/` (the plant owner, `/root/plant_builder`), which includes `growth.ts`, where the head's timing and facing live. Your branch is `agent/head`, your looks name is `head`.

## Why

The owner of the film asked for this, word for word: "on the scene before the last one, when the bloom happens, it would be awesome if the camera zooms in on the actual sunflower, showing the bloom happen, and then it will start backing out for the final shot, revealing the whole field". The camera now does that. From bar 55 it closes on the bud, it is half a meter from it at bar 57, the head opens in front of it over bars 57 to 61, the lens holds on the open flower to bar 65 and then cranes back over the field. For eight bars (14 seconds) the head fills more than half the frame's height. It was built to be seen from three meters.

## The shot

- Frames: bar 55 = 2804, 57 = 2906, 58 = 2958, 59 = 3009, 60 = 3060, 61 = 3112, 63 = 3215, 65 = 3318, 67 = 3421.
- Lens: 35 mm, f/2.8 from bar 57 to bar 65. Distance to the head 0.50 m at bar 57, 0.56 at 58, 0.67 at 59, 0.73 at 61, 0.80 at 65.
- Light: the last evening, the sun low behind the plant and left of it, a broken deck above. The face of the head looks at the lens and away from the sun, so it is lit by the sky and the rays are lit through from behind.
- The head's facing is being turned 15 degrees toward the lens by the plant owner (one line in `growth.ts`, the offset of `FACE_AZIMUTH` from 27 to 12). Until `/root` sends you the hash that holds it, make that one change in your working copy to render, and do not commit it.

## Keys

`references/v2/keys/bloom-close-opening.png` (bar 58 to 59) and `references/v2/keys/bloom-close.png` (bar 61 to 65). Version 1's `references/approved/bloom-opening.png` and `bloom-hero.png` show the same head from further off.

## What `/root` reads in the film today (frames attached to your first message)

1. Rays. The key has two overlapping rows of long rays, each narrow, pointed, with lengthwise furrows, and the low sun glows through them. The film has 34 rays and 13 late ones; they read broad, with blunt and wavy tips, and on the upper right a few lie across each other as dark orange slabs. The furrows and the light through them are there and are good.
2. Disc. The key has a ring of open florets at the rim, brown with pale yellow pollen points, and a tight green centre whose spirals read. The film has a red brown rim of beads and a flat dark centre with no pollen and little light in it.
3. The opening, bars 57 to 61. It must read as one unfolding: bracts fold back, rays lift from one side round to the other, the disc shows. No ray may appear, vanish or snap from one frame to the next. At bar 58 the film looks right in a still; it has not been judged in motion.
4. The bud at bars 55 to 57, half a meter from the lens: bracts, their hairs and edges.

## What to make

In this order, each judged beside its key at the frames above:

1. The open head at bars 61 and 65 reads as `bloom-close.png`: count, shape and lay of the rays, the ring of open florets with pollen, the centre.
2. The opening over bars 57 to 61 as one motion. Render every third frame from 2906 to 3112 and look at the strip; then every frame over the worst second.
3. The bud at 2804 to 2906.

## Limits

- Nothing made after loading: no texture, buffer, program or geometry created or resized once the film runs (`npm run bench -- --only all --count`). A frame stays a pure function of its number: no `Math.random`, `Date.now`, `performance.now`.
- The processor cost of the head per frame must not rise. Checks measured plant and companion together at 104 to 111 ms a frame over bars 57 and 67 in the software renderer against a limit of 5; the plant owner is moving the plant to keys to cure that. Write nothing per frame that you can write once, and say in each report what your parts upload per frame (`npm run checks -- writes`; `npm run checks` alone lists the commands and their options).
- The same parts draw the companion and the near neighbours of the field with other options (`detail`). They must still be the same flower at bars 61, 67 and 69.
- The contract with the plant owner stands as it is: `create(options): PlantPart` with `fill(slot, pose)`, `finish`, `meshes`, and what your parts import from `growth.ts`. If you need a new number from `growth.ts` (a later opening, another ray count), ask the plant owner and `/root`; `config/` is `/root`'s.
- Three colour lines of the leaf look owner are pending in `look/disc.ts` (`dark`, `pale` centre colours and `flower`). It will send them to you; apply or replace them as the key demands.
- Wet, frost and dew skins on top of yours are other owners'. The head never shows in the frost or the storm.

## What is judged

1. `npm run bench -- --only all --frames 2804,2906,2958,3009,3060,3112,3215,3318 --name head --cols 4 --tier draft`, and the same at `--tier review` before your report, the head cropped large beside the two keys.
2. The guard: frames 2700, 3421, 3524, 3729 before and after, side by side (the head from far, the companion, the field).
3. `--count` prints what it printed before your change.

A first heartbeat with the pair at 3112 within 40 minutes of your start. After that a heartbeat at most every 30 minutes, each with the pairs. Your report goes to `/root` when the head reads as the keys, or after 150 minutes, whichever is first.
