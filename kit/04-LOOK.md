# 04 · The look

## 1. The bar

- Every frame looks like a still from a top-budget film or a cinema nature documentary, shot on a real camera with a real lens.
- Hyper-realistic means the viewer believes they are looking at something real. It does not have to be ordinary. It has to be believed.
- Brandon's yardstick for everything he makes is a top-tier film or a AAA game cinematic. He named GTA 6 and Avengers: Doomsday.
- It does not look like a stock photograph, a seed catalog picture, a web 3D demo, a game from ten years ago or amateur generated art.
- It is never cartoon, painterly, stylized, flat, plastic or too clean.
- It is a complete scene. The plant stands in a real place with air, ground and distance round it.
- Beauty is pushed as far as it will go while still being believed: richer light, finer detail, a more perfect moment than a real camera would be lucky enough to catch.

The eight approved images in `references/approved/` are this bar made concrete. Brandon chose them. When words and an approved image disagree, the image wins.

## 2. What sells a living plant

These decide whether a viewer believes it. Check them on every round.

- Light passes through thin parts. Leaves and petals glow from behind.
- Edges are not clean. Fine hairs, fuzz, crumpled petals, a torn leaf.
- Nothing repeats. No two leaves, petals or neighbors are copies.
- Surfaces are not uniform. Color and roughness vary across every leaf.
- Things have thickness. A leaf edge is not a knife line.
- Contact is real. Where the stem enters the soil there are shadow, displaced crumbs and a little dirt on the stem.
- Small things have small shadows. Crumbs, hairs and droplets all cast them.

## 3. The lens

- A large-format cinema camera with spherical lenses. The focal length runs from a macro lens at the start to a wide lens at the end, as `camera.keys` gives it, for a gate `camera.gateWidthMm` millimeters wide. It changes slowly and only in one direction. It never reads as a zoom.
- Depth of field is real and shallow where the camera is close. In `dawn` only a thin slice is sharp. It deepens as the camera backs away. In `field` almost everything is sharp.
- Focus is on the growing tip at all times. It moves smoothly. It never hunts.
- Out of focus highlights are soft round discs with a slightly brighter edge. Dew, raindrops and distant flowers all become them.
- When a bright light is in or near frame there is a soft glow and a gentle flare. Strongest at golden hour.
- A gentle vignette on every frame.
- Raindrops never sit on the lens.

## 4. Exposure, tone and color

- The scene is rendered in high dynamic range and brought to the screen through a film-like tone curve. Highlights roll off. They do not clip to flat white.
- Blacks are deep but not crushed. Detail survives in every shadow.
- Each world has its own grade, matched to its approved images: warm gold and cool shadow at dawn, cold slate in the rain, deep blue at night, pale and drained in the frost, rich gold at golden hour.
- The five grades still read as one film shot on one camera.
- Greens are the hard part. Plant greens lean yellow and vary. A single flat saturated green is the mark of a fake.

## 5. Bloom and glow

- Bloom comes from real brightness: the sun, the moon's rim, glints on water and ice, backlit petals.
- It is wide and soft, never a hard halo.
- Nothing that is not bright blooms.

## 6. Grain and banding

- Very fine film grain on every frame, seeded per frame index.
- Night sky, fog and haze are slow gradients. They must not band. Render and grade at high precision and dither the final output.
- Grain and dither have to survive compression. The stress test in `kit/07-QUALITY-BAR.md` checks this.

## 7. Samples

- A frame is the average of `tiers.<tier>.samplesPerFrame` samples. Each sample is jittered inside the pixel, across the shutter set by `film.shutterDegrees`, and across the lens opening.
- That gives clean edges, real motion blur and real depth of field from one mechanism.
- If out of focus areas are still noisy at the `final` tier, raise `tiers.final.samplesPerFrame`, or add a blur guided by depth on top of the samples. It is never lowered.
- Fine things must not shimmer from frame to frame: hairs, grass, distant rows, stars.

## 8. Diagnostic views

Each is a `diag` value in the URL and in the harness.

| View | Shows |
| --- | --- |
| `beauty` | The finished frame |
| `ungraded` | The frame before lens and grade |
| `plant` | The plant alone on neutral grey in flat light |
| `backlight` | The plant alone with the light behind it |
| `texels` | A heat map of texture detail against screen pixels |
| `depth` | Depth from the camera |
| `focus` | What is inside the sharp zone |
| `standins` | Every stand-in in a flat warning color |

## 9. The ladder

When an issue survives `quality.plateauRounds` rounds, stop tuning and change technique. Move down the list for that problem and log which rung you are on. When a list has no rungs left, the issue becomes an open item and the build goes on.

### A key frame does not match its approved image

1. Fit the camera to the image again, then the direction and color of the main light.
2. Regenerate the sky and far background for that world with the approved image as the style input.
3. Compare region by region and correct the grade for that world.
4. Rebuild the part of the picture that differs most with its fallback from `kit/03-METHOD.md`.

### The plant looks plastic, or like a 3D model

1. Fix the light passing through leaves and petals, checked in the `backlight` view.
2. Add variation: color and roughness across each leaf, curl, damage, asymmetry.
3. Add or improve the hairs and the fuzz on edges against the light.
4. Soften and thicken edges. Add the small contact shadows.
5. Revisit the tone curve and the greens against the approved image.

### A leaf or petal looks like a flat card

1. Give it thickness at the edge and curvature in two directions.
2. Put the veins into the surface as relief.
3. Add a curl or a twist that differs from its neighbors.

### Growth looks like scaling

1. Make each organ unfold along its own path, with its own timing.
2. Add the slow circling of the tip and the lift and fall of the leaves.
3. Add the faint frame to frame liveliness of real time-lapse.
4. Study the real footage again and match one specific movement from it.

### The disc looks like a texture

1. Make every floret its own shape, placed by the spiral rule.
2. Give open and closed florets different shapes, and move the opening ring across the disc.
3. Add pollen as fine relief and loose grains on the nearest petals.

### Rain looks like lines drawn over the picture

1. Spread drops through real depth, so near ones are large and blurred by the lens.
2. Add what rain does when it lands: crowns, flying droplets, rings, dipping leaves.
3. Add the wet look to every surface and the veil of spray near the ground.
4. Light the rain from the bright horizon so streaks catch a rim.

### Fog looks like a flat grey wash

1. Make it thicker with distance and put the plant inside it.
2. Break it into drifting banks at several depths.
3. Let the sun glow through it and light it from that side.

### Frost looks like white paint

1. Grow crystals off edges and hairs as shapes with sharp glints.
2. Keep flat surfaces mostly green with a thin pale bloom.
3. Add sparkle that changes as the camera moves.

### The night looks fake

1. Draw more stars as points, with more variety in brightness and color.
2. Raise the exposure of the plant with the moon rim, not with flat fill.
3. Add the low mist and the dew glints.

### The field looks copy-pasted

1. Give every neighbor its own seed, height, lean and timing.
2. Break the rows: gaps, a plant out of line, different spacing.
3. Vary the light across the field with haze and long shadows.
4. Hide the change between kinds of neighbor with haze and depth of field.

### The background looks like a flat backdrop

1. Split it into more layers at different distances.
2. Add haze between the layers.
3. Rebuild the nearest layer in real 3D.

### A cut reads as a glitch

1. Check the plant and the camera line up across it, with the test in `kit/03-METHOD.md`.
2. Make the two worlds differ more in light and color, so the change is clearly meant.
3. Start the new world's motion at full strength on its first frame: rain already falling, fog already there.

### Out of focus areas are noisy or fake

1. Raise the sample count for the tier.
2. Add a blur guided by depth on top of the samples.
3. Shape the out of focus highlights as soft discs.

### Slow gradients band

1. Raise render and grade precision.
2. Add dither at output.
3. Raise the grain slightly.
