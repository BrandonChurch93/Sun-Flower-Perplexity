# 02 · The sunflower and its worlds

Two things are on screen: one plant, and whatever world it is standing in. This file describes both. The approved images show them. Where words and an approved image disagree, the image wins.

## The place

- The near edge of a sunflower field, in open farmland.
- The plant stands in the front row. Between it and the camera is a strip of grass and bare soil.
- Rows of other sunflowers run away from the camera behind it. They are the same age as the plant at every moment of the film.
- Low rolling hills and a line of trees close the horizon.
- It is the same place in every world. Only the weather changes.

## The plant

A common sunflower, the classic tall kind with one large head.

### Fixed facts

| Fact | Config key |
| --- | --- |
| Height when full grown | `plant.fullHeightM` |
| Width of the open head across the petals | `plant.headDiameterM` |
| Width of the disc of florets | `plant.discDiameterM` |
| Number of leaves when full grown | `plant.leafCount` |
| Number of petals round the head | `plant.rayFlorets` |
| Number of florets in the disc | `plant.discFlorets` |
| The angle between one floret and the next in the spiral | `plant.goldenAngleDeg` |
| Height at each moment of the film | `plant.heightM` |
| When each stage starts and ends | `plant.stages` |

### Stage by stage

| Stage | What is seen |
| --- | --- |
| `emerge` | The soil lifts and cracks. A pale green stem, bent over in a hook, pushes through. The grey and white striped seed husk is still clamped over the folded seed leaves. Crumbs of soil slide off as it rises. The hook straightens |
| `seedLeaves` | The husk loosens and falls to the soil. Two thick oval seed leaves open flat, one each side. A tiny pair of true leaves shows between them |
| `leaves` | The stem lengthens and thickens. New leaves appear at the tip, small and folded, and open out as the stem carries them up. The first pairs sit opposite each other. Later leaves spiral round the stem. Lower leaves are the largest. The stem and the leaf stalks are covered in short stiff hairs |
| `bud` | The tip tightens into a bud wrapped in pointed green bracts, a star when seen from above. It swells. It leans toward the light |
| `bloom` | The bracts fold back. Yellow petals unfurl from the rim, a few first, creased and upright, then all of them, flattening out. The disc opens from the rim inward: ring after ring of florets lifts yellow pollen, while the center stays tight and green brown |

### What every part looks like up close

- Seed husk: hard, glossy, striped grey and off white, with fine ridges along its length.
- Seed leaves: thick, smooth, slightly waxy, a clear spring green. Light glows through them.
- Stem: pale green at first, later a strong green with fine ridges and faint purple brown flecks. Covered in short stiff white hairs that catch light on the rim.
- Leaves: heart shaped with a pointed tip and a toothed edge. A strong central vein with branching side veins, pressed into the surface. A rough, matte, slightly fuzzy top. A paler underside with raised veins. Light passing through a leaf shows every vein. No two leaves are the same: some curl, some are torn or nibbled at an edge, one has a dry brown tip.
- Bud and bracts: overlapping pointed green scales, each with a soft fuzzy edge.
- Petals: long, a little crumpled, with fine lengthwise veins. Deep yellow, glowing orange gold where light passes through. They do not all point the same way. A few bend back or twist.
- Disc: hundreds of tiny florets packed in two sets of crossing spirals. Unopened ones are dark green brown pegs. Open ones are small tubes with a yellow tuft of pollen. The spirals have to be exact. This is the detail people know.
- Back of the head: green bracts and a thick, hairy neck where the stem bends.

### How it moves

Two kinds of movement lie on top of each other.

Growth, in time-lapse:

- Height follows `plant.heightM`. It is smooth and never runs backward.
- The tip does not rise in a straight line. It traces a slow small circle as it climbs, as real stems do in time-lapse. The circle shrinks as the stem stiffens.
- Each leaf unfolds along its own path and at its own time. Nothing appears by fading in or scaling up from a point.
- The leaves lift toward the light by day and lower in the `night` world.
- The young stem and the bud lean toward the main light of the current world. After a cut the plant eases toward the new light over `plant.leanEaseSeconds`. It never snaps.
- There is a faint liveliness from frame to frame, the way real time-lapse plants never sit perfectly still. It is seeded and it is subtle.

The weather, in real time:

- Rain: a leaf dips when a drop hits it and springs back. The whole plant bows a little under the heaviest bursts.
- Wind: a gentle sway at golden hour, with each leaf moving on its own.
- Cold: in the `frost` world the leaves are stiffer and hang slightly.

### The neighbors

- Every other sunflower in the field is the same kind of plant at the same age, with its own small differences in height, lean, leaf angles and timing.
- In the early worlds they are soft shapes in the background. They are never in focus before `field`.
- In `field` they are the picture: at least `field.minPlantsInView` of them in view at the last key, in rows `field.rowSpacingM` apart with a plant every `field.plantSpacingM`, all turned the same way toward the low sun, none identical to its neighbor.

## The worlds

Each world replaces the sky, the light, the air and the state of the ground. The ground, the grass and the plants are the same objects in every world, in a different state.

### `dawn` · Dawn with dew

- Sky: a clear sunrise. Pale gold at the horizon rising to soft blue.
- Light: the sun low at the right edge of frame, in or just out of shot, shining toward the camera through the grass. Warm gold light against cool blue shadow.
- Air: thin mist lying just above the ground, glowing where the sun passes through it.
- Ground: dark, moist, crumbly soil. A bead of dew on every crumb, every blade of grass and every hair. Out of focus drops turn into soft bright discs.
- Motion: mist drifts. Dew glints as the camera moves. A drop runs down a blade of grass and falls.
- Key images: `dawn-sprout`, `dawn-seedling`.

### `rain` · Downpour

- Sky: low, dark, slate grey cloud. A pale band of brightness along the horizon.
- Light: flat and cool from above. The bright horizon gives every wet edge a thin rim.
- Air: dense rain, falling almost straight, each streak blurred by its own speed. A veil of spray near the ground.
- Ground: soaked black soil. Splash crowns and flying mud where drops land. Puddles spreading along the furrows, covered in overlapping rings. Rivulets finding their way between crumbs.
- On the plant: water beads on the leaves, joins, runs to the tip and falls. Everything is glossy.
- Motion: constant. Once, deep inside the cloud, a soft flicker of lightning brightens the sky for a few frames. It is a glow, not a flash, and it happens once.
- Key image: `rain`.

### `night` · Night under stars

- Sky: clear and deep blue black. The Milky Way arching across. Thousands of stars, sharp points of different brightness and color.
- Light: a moon out of frame to the left. A cold silver rim on the leaves, the stem hairs and the grass. Soft moon shadows.
- Air: still. A thin layer of mist low over the field.
- Ground: dry at the surface, cool, with dew beginning to form.
- Motion: the stars drift slowly across the sky, the way they do in a night time-lapse. Mist creeps. One faint meteor may cross the sky.
- Exposure: like a professional night photograph. The plant is clearly readable and the sky is rich. Nothing is crushed to black.
- Key image: `night`.

### `frost` · Cold fog and frost

- Sky: none to speak of. Thick pale fog. The sun is a soft white disc low on the right.
- Light: diffuse and nearly colorless, with a faint peach warmth round the sun.
- Air: fog in slow drifting banks. The far rows fade into it completely.
- Ground: a pale crust of frost on the soil and the grass.
- On the plant: white hoarfrost crystals along every leaf edge, on the stem hairs and on the tips of the bracts. Frozen beads of dew. Crystals sparkle as the camera moves.
- Motion: fog drifts. Toward the end the frost on the upper leaves starts to give way and a drop or two falls.
- Key image: `frost`.

### `golden` · Golden hour

Used by `bloom` and `field`.

- Sky: clear, deep blue overhead fading to gold at the horizon. A few high thin clouds lit pink and gold.
- Light: the sun low on the left, partly behind the plant. Petals and leaves on the sun side glow with light passing through them. Hairs and edges carry a bright rim. A soft warm flare crosses the lens.
- Air: gold haze. Pollen and fine dust drifting in the light.
- Ground: warm, dry, long shadows between the rows.
- Motion: a light wind. Slow waves cross the field. The haze drifts.
- Key images: `bloom-opening`, `bloom-hero`, `field`.

## The key moments

| Key | Time | What the frame shows |
| --- | --- | --- |
| `dawn-sprout` | In the hook | Extreme macro. The hooked stem with its husk has just broken the soil. Grass out of focus in front and behind. Low sun raking across the crumbs |
| `dawn-seedling` | Late in `dawn` | Macro. The seedling upright with both seed leaves open and glowing. The husk lies beside it. Dew as soft bright discs |
| `rain` | Mid `rain` | The whole young plant with four to six leaves, bent under a downpour. Splashes and puddles |
| `night` | Mid `night` | The plant against the Milky Way, rimmed in moonlight |
| `frost` | Mid `frost` | The upper plant and its green bud, edged in hoarfrost, in fog |
| `bloom-opening` | Early `bloom` | The head half open: bracts folding back, petals unfurling unevenly |
| `bloom-hero` | Late `bloom` | The fully open head, turned toward us, backlit at golden hour. The frame the whole film has been waiting for |
| `field` | Near the end | High and wide. The plant in the foreground, thousands more to the horizon |

The exact times are in `keys` in the config.
