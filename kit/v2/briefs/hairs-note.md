# Hairs and stem: design note for their new owner

From plant, 23 Nov. Start from `agent/plant` at `f111a454` (holds v2 `a0e376a`).
You own `src/plant/hairs/` and `src/plant/stem/` and nothing else in `src/plant/`.

## Why

The plant and the companion together may cost 5 ms a frame in the mean and 10 ms on the worst frame (everything: 16 and 25).
Measured on `e9b0742c` with every part laid on every frame, node, frames 2900 to 2906: both plants 201.9 ms a frame, of which
hero stem 55.5, hero leaves 52.3, hero bud 24.3, hero petals 11.4, companion stem 15.1, leaves 18.3, bud 13.5.
Checks measured in the browser on `de7042a`: plant and companion 111.0 ms at 2900 to 2912, 103.8 at 3414 to 3424, plant 48.8 at 1250 to 1290.
The stem is the largest single part, and the hairs are the reason its roots must be laid on the processor at all.

## What exists

`stem/index.ts` `create(options): PlantPart`. The hero's tube is 176 rings of 41 vertices (companion 105 of 25), laid on the processor
in `fill(slot, pose)` for two slots a frame (open and close of the shutter): `position`, `positionB`, `normal`, `aCoord`, `aSkin`, `aSkin2`, `aSkin3` and their `B` twins.
The same fill lays, from the same rings: the roots and leans of three hair coats (`stem hairs` 34000 a square meter weighted, `stem down` 12 times that, `sprout hairs` 5200; companion 8500 and 1500),
the frost's crystal roots (`createCrystals`, 3200, hero only), my bristle roots (`createBristles`, one for each crystal) and the dew's bead seats (`createBeads`, 90).
`stem/shape.ts` (anchors, ribs, girth) and `stem/maps.ts` (skin and rib maps) are read by the leaves and the head: their exports stay as they are.

`hairs/index.ts` `HairSet`. A wearer writes `root(slot)` and `lean(slot)` (four floats a hair, both slots) and calls `finish(shown)`.
On draw `choose()` picks what is seen: `gather()` walks every root on the processor, projects it, thins the crowd by a screen grid, and writes the `uHairs` texture and the `uPicks` texture.
Wearers: the stem (yours), the leaves (`leaves/index.ts`, mine), the bud and the petals (`head/bud/`, `head/petals/`, the head owner's). The seedling wears none.

Hold state, done and measured (do not undo): in a hold (`stands.held >= 1 && held.lens >= 0`, `src/v2/held.ts`) `choose()` reads `held` and nothing of the camera,
keeps one gathered set for each held lens in its own textures (`lenses[0..4]`, at most 57 MB all five), and writes 0 bytes into `uHairs` and `uPicks`
on every frame of a hold but its first (`npm run checks -- writes --frames ...`, frames 951 to 953, 1054 to 1056, 1156 to 1158, 1249 to 1251, 1687 to 1690, 1738, 1742, 1824, 1825, 2068 all 0).
Not yet measured by me: the whole ranges 849 to 1262 and 1672 to 2085 in one run, and `checks -- pure` and `bench --count` on the new hair code. Run those three first.

## What to build

1. The stem's spine as a small texture in two keys. One row for each plant and key: for each of N spine points (64 is plenty; measure) the centre (xyz), the radius,
   the frame (tangent and one side vector) and the label (meters up the grown stem, the number the skin and the ribs are read by). Two keys = the two slots today;
   later the key spacing of `src/plant/index.ts` (`keyFrames`, `KEY_EVERY`, the per part switch `keyed.stem`) with the mix done in the shader.
   The spine alone costs microseconds on the processor: it is `Anchors` and `stemBend` at N points.
2. The tube built in the vertex shader from that texture: the vertex carries (ring share, angle), the shader reads the spine, adds the rib profile (`ribMap`, already a texture) and writes position and normal.
   No per vertex array is written after loading. The fragment text of the stem (`src/plant/look/stem.ts`, leaf look's) reads the same varyings as today: do not change the list, write to leaf look first if you must.
3. Hair roots from the same texture: a hair carries (label, angle, salt) fixed at load; the hair vertex shader places its root and lean on the tube the same way the tube is built.
   Then the stem's fill writes nothing for hairs, and `gather()` no longer needs a processor copy of the roots each frame.
4. Gathering rare while growing. Today the growing plant gathers on every frame because roots move. With roots placed in the shader, thinning can be decided from fixed numbers
   (label, angle, salt, the lens's pixels a meter) and the pick set changed only when the lens steps, spread over frames the same way keys are.
   Nothing may pop: a hair fades in or out by its own salt, never the whole coat at once.
5. The same road for the hairs of the leaves and petals is NOT yours to walk alone: their roots come from `leaves/`, `head/bud/` and `head/petals/`. Keep `root(slot)`, `lean(slot)`, `finish(shown)` working for them.
   If the shader road needs a second way to hand roots in (a texture written by the wearer at a key), add it beside the old one and tell me and head.

## What must not change

- `create(options): PlantPart` of the stem (`fill`, `finish`, `meshes`, `casters`, `settle`), `createHairs(options, count, name, color?, widthM?)`, `HairSet.root`, `lean`, `finish`, `meshes`, `count`, `HAIR_ORDER`, `ball`.
- Every export of `stem/shape.ts` and `stem/maps.ts`.
- The varyings and uniforms the hair fragment and the stem fragment read (the contract with leaf look, `src/plant/look/`).
- The crystal roots, bristle roots and bead seats the stem lays for frost, me and the dew: same numbers, same order (`crystals.root(slot)`, `bristles.root(slot)`, `dew.seat(slot)`); a stem root's `place()` stays as frost reads it.
- 0 bytes written in both holds, wind 0 in the frost hold, the plant standing still there.
- Nothing created on the graphics card after loading (`bench --only all --count` prints PASS); every frame a pure function of the film second.
- Do not thin hairs or down that are under a pixel in every wide shot away; fade by footprint instead (see leaf look's ask below).
- Not yours: `src/plant/index.ts`, `part.ts`, `standin.ts`, `growth.ts`, `leaves/`, `seedling/`, `bristles/`, `head/`, `look/`, `surface/`, `src/v2/inputs.ts`. Ask me for a line there.

## Targets

- Browser script time, plant and companion, stem and its hairs alone: under 1 ms a frame at 1268 to 1282, 2300 to 2320, 2900 to 2920, 3330 to 3350 (`bench --cost`, frames in a row, `--only all`).
- `checks -- writes`: 0 bytes in `uHairs`, `uPicks` and every stem buffer over 850 to 1259 and 1673 to 2082; while growing, the stem writes two spine rows a key and no vertex buffer.
- Pop: no vertex of the stem moves against the true shape by more than one pixel at 1080 lines in one frame at the film's own lens. My measure: `npx tsx src/plant/keyerror.ts` and `src/plant/pops.ts`.
  With straight mixes of keys 8 apart I measured a turn at a key of 2.29 px (1272), 4.36 px (1466), 3.75 px (2912): so either keys 4 apart there or a curved mix (three keys). The spine makes a curved mix cheap.
- Pictures: the stem and its hairs at 1106 (the close lens on the stem, `tip`), 1208, 1300, 2300, 2910 must not differ from `f111a454` by more than rounding. Compare pairs before you push.

## Open asks that go with the folder

- Leaf look: the backlit rim hairs of the bracts sparkle from frame to frame at 2910 to 2925 (strands under a pixel wide). It asks: fade strands thinner than a pixel by their footprint
  (coverage times width in pixels, kept steady as they move).
- Leaf look's call site, from `agent/leaf-look` `519acf7`: `import { hairToneGlsl } from '../look/hair.ts'`, `${hairToneGlsl}` on the line before `Strand strandAt(float t) {`,
  and `  hairTone(t, uPlantFrost, hairRoot.w * plantSize() / s.pixel, vSun, vSky);` as the last line of `strandAt` before `return s;`.
- Known faults of mine left in the folder: margin hairs of kind 0 point inward on the left side of a leaf; white specks on the stem at 1300 when the stem is keyed (`keyed.stem` on).
- After stage 2 the stem at 1106 wears more rime needles than before (the crowd grid now sits where the held lens looks). Root has seen the pair and let it stand.

## How I work here, for what it saves you

Worktree build and checks before a push: `npx tsc --noEmit -p .`, `npm run build`, `npm test`. `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` on every bench.
`npm run bench -- --only all --view film --frames a,b --name NAME [--cost] [--count] [--format master]`, `npm run checks -- writes --frames a,b,c` (about 5 s a frame).
