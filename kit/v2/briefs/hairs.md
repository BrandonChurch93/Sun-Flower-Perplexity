# Brief: stem and hairs

Your folders are `src/plant/hairs/` and `src/plant/stem/`, and nothing else in `src/plant/`. Your branch is `agent/hairs`, your looks name is `hairs`. The plant owner (`/root/plant_builder`) built both folders and is your adviser: its design note is `kit/v2/briefs/hairs-note.md`. Read the note first; where the note names a start hash, start from the `v2` hash `/root` names in your first message instead.

## Why

The film must run without a long frame on the owner's machine. The limit for the script of one frame is 16 ms in the mean and 25 on the worst frame; the plant and its companion together may take 5. The checks measured them at 104 to 111 ms a frame while the plant grows (bars 57 and 67, software renderer). The stem is the largest single part of that, and the hairs are the reason the stem's roots are laid on the processor at all. The plant owner is moving the leaves and the plant's switches to keys; the stem and the hairs are yours.

## What to make, in this order

1. A small job first, to learn the folder. Close shot 1 of the frost (frames 952 to 1054, 100 mm, 20 cm from leaf 3): about twenty rimed picks lie on the leaf's upper face as pale slivers, too few to read as a coat and too large to read as hairs. The frost owner's grains now stand for the rimed hairs of the face. Under a held close lens drop the rimed picks of a leaf's face and keep the margin's. Judge at 952, 1003, 1054 beside the frames before; nothing else in the film may change (guard frames 1106, 1208, 1300).
2. The road of the note: the stem's spine as a small texture in two keys, the tube built in the vertex shader from it, the hair roots placed by the hair's own vertex shader from the same texture, gathering made rare while the plant grows.
3. The two asks of the leaf look owner that go with the folder (the note's last section): strands thinner than a pixel fade by their footprint and do not sparkle (frames 2910 to 2925), and the `hairTone` call site.

## What must not change

Everything the note lists under that heading. In short: `create(options): PlantPart` with `fill(slot, pose)`, `finish`, `meshes`, `casters`, `settle`; `createHairs`, `HairSet.root`, `lean`, `finish`, `meshes`, `count`, `HAIR_ORDER`, `ball`, for wearers that hand roots in the old way (leaves, bud, petals); every export of `stem/shape.ts` and `stem/maps.ts`; the varyings and uniforms the hair and stem fragments read (`vSun`, `vSky`, `vWorld`, `vDepth` among them); the crystal roots, bristle roots and bead seats the stem lays for other owners, same numbers and same order; 0 bytes written in both holds; nothing created on the graphics card after loading; a frame is a pure function of its number.

Not yours, ask for a line: `src/plant/index.ts`, `part.ts`, `standin.ts`, `growth.ts`, `leaves/`, `seedling/`, `bristles/`, `head/` (the head owner, `/root/sky_c_builder`), `look/` and `surface/index.ts` (the leaf look owner), `surface/frost/` and `surface/dew/` (frost), `surface/wet/` (rain), `src/v2/inputs.ts` (plant).

## Targets

- Script time of the stem and its hairs alone, hero and companion together: under 1 ms a frame at 1268 to 1282, 2300 to 2320, 2900 to 2920, 3330 to 3350 (`npm run bench -- --only all --cost`, frames in a row).
- `npm run checks -- writes`: 0 bytes in `uHairs`, `uPicks` and every stem buffer over 850 to 1259 and 1673 to 2082; while the plant grows the stem writes its spine rows and no vertex buffer.
- No pop: no vertex of the stem moves against the true shape by more than one pixel at 1080 lines in one frame at the film's own lens (the note names the plant owner's two measures).
- Pictures: the stem and its hairs at 1106, 1208, 1300, 2300, 2910, 3112, 3729 differ from the start hash by no more than rounding, shown as pairs. Step 1 is the one meant difference.

## What is judged

1. The pairs above at draft tier, and 1106 and 2910 at review tier.
2. `npm run bench -- --only all --count` prints PASS.
3. The numbers of the targets, each with the command that gave it, and what you did not measure.

A first heartbeat within 40 minutes of your start with step 1 as a pair. After that a heartbeat at most every 30 minutes. Send each stage to `/root` when it holds its guards; do not wait for the whole road.
