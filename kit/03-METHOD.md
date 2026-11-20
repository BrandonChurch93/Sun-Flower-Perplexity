# 03 · How each picture is made

The plant is true 3D, grown by code. The world round it is a mix: real 3D near the camera, layered pictures far from it. The approved images are the target for both.

Use the simplest technique that gets a key frame to match its approved image. This file gives the starting technique for each kind of picture, a test for it, and a fallback. The ladder in `kit/04-LOOK.md` says what to try when a picture falls short.

A fallback is a technique that always works. It is used only by clock rule 4 in `AGENTS.md`: when the planned technique has not produced a finished part by the end of the phase's planned box. A part finished with its fallback is logged as an open item.

## 1. The plant

### One function of time

- The whole plant is a pure function of film time. Given a time, the code returns the complete plant: every stem section, leaf, bract, petal and floret, in its pose at that moment.
- Nothing is simulated step by step. Any frame can be rendered alone, in any order.
- Each organ has its own birth time and its own growth curve, taken from `plant.stages` and `plant.heightM`. An organ starts small and folded at the tip and unfolds along its own path.
- The same code, given a different seed and a small time offset, makes every neighbor.

### Structure

- Stem: a tube swept along a curve. Its length follows `plant.heightM`. It thickens with age, has fine ridges, and bends at the neck under the weight of the head.
- Leaves: each is a curved surface built from a real leaf outline, with a toothed edge, real thickness at the edge and a stalk. Veins are in the surface as relief, not only as color. Each leaf has its own size, curl, droop and damage.
- Where leaves sit: the first pairs opposite, later ones spiralling round the stem at `plant.goldenAngleDeg`.
- Hairs: short stiff hairs on the stem, the leaf stalks, the bracts and the back of the head. They matter most where the camera is close and the light is behind. Draw them as many small instanced shapes where the camera is near, and fold them into the shading of the surface where it is far.
- Seed leaves and husk: their own shapes, with the husk gripping, loosening and falling.
- Bud: overlapping bracts placed on the same spiral as the florets.
- Head: every disc floret is its own small shape, placed by the spiral rule: floret number n sits at angle n times `plant.goldenAngleDeg`, at a distance that grows with the square root of n. That rule alone produces the crossing spirals. Do not paint the spiral as a texture.
- Florets open in rings from the rim inward. An opening floret lifts and shows a tuft of pollen.
- Petals: each is its own curved strip with veins, slight crumpling and its own twist. They unfurl from folded and upright to open.

### Surface and light

- Leaves, seed leaves, bracts and petals let light through. Seen from the side away from the light they glow, and the veins show darker. This one effect does more for realism than any other. Get it right first.
- Leaf tops are matte and slightly fuzzy. Undersides are paler.
- Wet state, for `rain`: a glossy film, beads of water that sit, join, run and fall. The beads are shapes with real highlights, not dots in a texture.
- Frost state, for `frost`: crystals that stand off the edges and hairs as small shapes with sharp glints, and a thin pale bloom on flat surfaces.
- Dew state, for `dawn` and `night`: small clear beads on hairs and edges.
- These states are inputs the world sets. The plant does not know which world it is in.

### Textures

- Leaf, petal, bract, stem, husk and floret surfaces need color, relief and translucency maps.
- Make them with the image tools, with the approved image for the nearest key as the style input and the reference board in `kit/06-ASSETS.md` as the source of truth for what the part really looks like.
- Sizes come from `assetSets` in the config.

### Movement

- Everything in "How it moves" in `kit/02-SUBJECT.md`, as closed-form functions of time.
- Study real time-lapse footage of sunflowers before animating growth. `kit/06-ASSETS.md` says how many studies to make and what to record from them.

### The test for the plant

- Render the plant alone at ten ages across the film, in flat light and in back light. At every age it reads as a real sunflower of that age.
- Step through any two seconds frame by frame. Nothing pops into existence, nothing scales from a point, nothing passes through anything else.
- Render the `bloom-hero` key frame and run `npm run compare`. Beside the approved image, a viewer calls them the same flower in the same light.

### Fallback for a plant part

- A leaf, bract or petal: a bent card with thickness, carrying color, relief and translucency maps made by the image tool from the approved image.
- The disc: a shallow dome carrying a generated color and relief map of the spiral, with the outer two rings of florets as real shapes.
- Hairs: folded into the shading of the surface.

## 2. The ground

- The near ground, about a meter round the plant, is real geometry: a soil surface with real height, loose crumbs and small stones as separate shapes, and blades of grass and a few small weeds as separate shapes.
- Soil textures come from scanned, freely licensed materials. `kit/06-ASSETS.md` lists where to look.
- The emergence is animated geometry: the surface lifts, cracks along lines that spread from the stem, and crumbs tip and roll.
- Grass blades let light through and carry dew.
- The ground has states the world sets: dry, dewy, soaked with puddles, frosted.
- Puddles are real water surfaces in the furrows, with rings where drops land.
- Further out, the ground is simpler and textured, and beyond the near rows it becomes part of the far background.

### The test for the ground

- Render the `dawn-sprout` key frame and run `npm run compare`. At this distance the soil has to hold up as a photograph: crumbs with real shadows, no flat texture, no repeating pattern.

### Fallback for the ground

- The ground of the approved image for that key, cut out and laid on a surface with height estimated from the image, with the real plant standing in it.

## 3. The field

- Neighbors are instances of the plant code with their own seeds.
- Near rows are full plants. Further rows are simpler versions. The furthest are flat pictures of plants that always face the camera. The change from one kind to the next is never visible.
- Beyond the last real row the field continues in the far background picture.
- In `field` the wind moves through the rows as a slow wave.

### The test for the field

- Render the `field` key frame and run `npm run compare`.
- No two neighbors near the camera are the same. No grid, no tiling and no line where the detail changes is visible.

### Fallback for the field

- The approved `field` image, with the foreground plants cut out, as the far background, and three rows of real plants in front of it.

## 4. The sky and the far background

- Each world has its own sky and far background, made with the image tools in the style of its approved images, at `assetSets.full.skyWidth` wide.
- The far background is in layers at different distances, so it shifts correctly as the camera rises: far hills, the tree line, the far field.
- The sun and the moon are lights in the scene with a real glare, not painted discs. A painted sky may hold their glow.
- In the `night` world the stars are points drawn in code over a painted glow, so they stay sharp. A painted star turns into a blob.
- Everything in the far background is beyond the range where the camera's movement would show it as flat. If the crane in `field` shows it as flat, add layers.

### Fallback for the sky and far background

- The sky and background of the approved image for that key, with the plant painted out, on a curved backdrop.

## 5. The weather

Every weather effect is a closed-form function of time, so any frame can be rendered alone.

- Rain: each drop is a streak of real geometry whose length comes from its fall speed and the shutter time. Drops are spread through the depth of the scene, so near ones are large and out of focus and far ones are fine. Each drop has a landing place and time.
- Splashes: where a drop lands on soil, a crown rises and falls and droplets fly. Where it lands in a puddle, rings spread. Where it lands on a leaf, the leaf dips and a bead is left.
- Mist and fog: layered soft volumes that drift, thicker with distance, lit by the world's main light. The plant has to sit inside the fog, not in front of a grey wall.
- Dew: beads placed on edges and hairs. Out of focus beads become bright discs through the lens, not painted circles.
- Frost: crystals grown along edges, hairs and the soil crust.
- Pollen and dust: sparse points drifting in the light at golden hour, bright only where the sun catches them.
- Wind: a field of gentle movement that every leaf and every neighbor samples at its own place.

### Fallback for a weather effect

- Flat pictures of the effect that always face the camera, placed in depth, moving along the same paths.

## 6. The cuts

- The film holds the worlds as separate sets of sky, light, air and ground state.
- At a cut the director swaps the set between one frame and the next. Nothing is blended.
- The plant and the camera are evaluated from film time alone and do not know a cut happened.
- Anything that reacts to weather starts from rest at the cut.

### The test for a cut

- Render the frame before and the frame after each cut. Lay one over the other. The plant, the grass and the horizon line up. Only the light, the sky, the air and the ground state differ.

## 7. The camera

- One path, a smooth function of time through `camera.keys`.
- Fit the path to the approved images: at each key's time, adjust the camera so the plant sits in the frame as it does in the image. Then smooth the whole path again and check every key.
- Depth of field is real: it comes from the lens, the focus distance and the aperture. `kit/04-LOOK.md` has the rules.

## 8. The reveal

- `field` is the same move carrying on: the camera rises and backs away on one eased curve.
- The plant stays in frame the whole way. It ends in the lower middle of the frame, still sharp, with the field round and behind it.
- The far background has to hold up from the high angle. Check it early, in the blockout.
