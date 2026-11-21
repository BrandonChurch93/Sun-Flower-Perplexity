# Shots

One camera move runs through the whole film. The camera never cuts: at each of the four cuts the world changes around a plant and a camera that carry straight on, so the plant sits at the same place and size on both sides of every cut. Between `bloom` and `field` the world stays the same, so there is no cut there. The numbers below come from `camera.keys` in `config/showcase.json` and from `src/units/<id>/index.ts`, read at the first and last frame of each segment. Positions in the frame are fractions of the frame, x from the left and y from the top.

Lens: a 36 mm wide gate. Focus sits on the growing tip of the plant in every frame, and on the center of the head once there is a head. Shutter 180°.

| Segment | Time | Frames | Focal length | Aperture | Distance to the plant | Eye height | Plant height |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dawn` | 0 to 8 s | 0 to 239 | 60 to 54 mm | f/9 | 0.15 to 0.37 m | 0.02 to 0.06 m | 0 to 0.07 m |
| `rain` | 8 to 20 s | 240 to 599 | 54 to 43 mm | f/5.6 | 0.37 to 0.95 m | 0.06 to 0.26 m | 0.07 to 0.47 m |
| `night` | 20 to 30 s | 600 to 899 | 43 to 39 mm | f/2.8 | 0.95 to 1.00 to 0.91 m | 0.26 to 0.76 m | 0.47 to 1.00 m |
| `frost` | 30 to 40 s | 900 to 1199 | 39 to 36 mm | f/4 | 0.90 to 0.73 to 0.74 m | 0.76 to 1.41 m | 1.00 to 1.56 m |
| `bloom` | 40 to 52 s | 1200 to 1559 | 36 to 35 mm | f/2 | 0.74 to 0.97 m | 1.41 to 1.69 m | 1.56 to 1.83 m |
| `field` | 52 to 60 s | 1560 to 1799 | 35 to 24 mm | f/8 | 0.97 to 5.24 m | 1.69 to 3.01 m | 1.83 to 1.85 m |

## `dawn` · 0 to 8 s

- Lens: 60 mm easing to 54 mm, f/9. A macro view a hand's width from the soil.
- Move: the camera rests almost on the ground, 2 cm up, and backs away slowly from 0.15 m to 0.37 m while it rises 3 cm. It swings less than 2° around the plant.
- Start framing: bare soil, the place where the plant will break through at (0.59, 0.76), the horizon a third of the way down the frame at y 0.29, the sun low on the right at x 0.84.
- Keys: at 1.5 s the hooked sprout stands from y 0.77 up to y 0.22, as `dawn-sprout` has it. At 6.5 s the seedling's stem ends at y 0.42 with the two seed leaves spread above it, as `dawn-seedling` has it.
- End framing: base at (0.61, 0.77), the seed leaves reaching y 0.26, horizon at y 0.37.
- Focus: on the top of the hook, then on the point where the seed leaves meet.
- In frame: the plant, the soil around it with the dropped husk, the low sun and its path of light on the soil, mist over the far field. The neighbors are sprouts of the same age, lost in the blur. The companion is outside the left edge.

## `rain` · 8 to 20 s

- Lens: 54 mm easing to 43 mm, f/5.6.
- Move: the camera keeps backing away, 0.37 m to 0.95 m, and starts to climb, 0.06 m to 0.26 m, more slowly than the plant grows. It swings 4° to the right around the plant.
- Start framing: the same frame the dawn ended on. Base at (0.61, 0.77), top at y 0.26.
- Key: at 14 s the whole young plant stands in the frame, base at (0.62, 0.80), top leaf at y 0.12, horizon across the middle at y 0.50, as `rain` has it.
- End framing: the plant has outgrown the frame. The base has left through the bottom edge, the tip is at (0.63, 0.24) under its top leaves at y 0.18, horizon at y 0.64.
- Focus: on the growing tip.
- In frame: the plant from soil to tip until about 16 s, then its upper two thirds. Wet soil and the rows of young neighbors behind it, dark hills and storm cloud. The companion is outside the left edge.

## `night` · 20 to 30 s

- Lens: 43 mm easing to 39 mm, f/2.8.
- Move: the camera climbs with the plant, 0.26 m to 0.76 m, and tilts up toward the sky. Its distance holds near 1 m. It swings 4° further around the plant.
- Start framing: the same frame the rain ended on. Tip at (0.63, 0.24), top leaves at y 0.18, horizon at y 0.64.
- Key: at 26 s the tip is at (0.575, 0.30) with the horizon low at y 0.76 and the Milky Way standing over the left of the frame, as `night` has it.
- End framing: tip at (0.56, 0.30), top leaves at y 0.23, horizon at y 0.74.
- Focus: on the growing tip.
- In frame: the upper half of the plant against the sky, the dark field of neighbors along the bottom, the tree line and mist on the horizon, the stars. The companion is outside the left edge.

## `frost` · 30 to 40 s

- Lens: 39 mm easing to 36 mm, f/4.
- Move: the camera rises to the height of the bud, 0.76 m to 1.41 m, and drifts in from 0.90 m to 0.73 m, then holds. It swings 4° further around the plant.
- Start framing: the same frame the night ended on. Tip at (0.56, 0.30), horizon at y 0.74.
- Key: at 36 s the bud is at (0.535, 0.30), a fifth of the frame wide, with the horizon at y 0.60 and the pale sun on the right, as `frost` has it.
- End framing: the bud at (0.58, 0.30) with its bracts reaching y 0.17, horizon at y 0.52.
- Focus: on the bud.
- In frame: the bud, the top of the stem and the upper leaves. Behind them the neighbors with their own buds, fading into the fog. The companion is outside the left edge at the key. Its leaf tips may come in at the left edge in the last seconds.

## `bloom` · 40 to 52 s

- Lens: 36 mm easing to 35 mm, f/2.
- Move: the camera rises the last 0.3 m with the head, 1.41 m to 1.69 m, and eases back from 0.74 m to 0.97 m as the head opens and turns toward it. It swings 7° further around the plant, toward the side the head faces.
- Start framing: the same frame the frost ended on. The bud at (0.58, 0.30).
- Keys: at 45 s the opening head is at (0.565, 0.345), its first petals out on the sun side and the rest still folded over the disc, with the sun on the left at x 0.15 and the horizon at y 0.47, as `bloom-opening` has it. At 50.5 s the open head faces the lens at (0.545, 0.42) and fills 0.63 of the frame's height, as `bloom-hero` has it.
- End framing: the open head at (0.52, 0.45), its top petals at y 0.18, horizon at y 0.44.
- Focus: on the center of the head.
- In frame: the head, the neck and the top leaves. Behind them the field in bloom, soft, and the low sun under cloud on the left. The companion's nearest leaves are at the left edge.

## `field` · 52 to 60 s

- Lens: 35 mm widening to 24 mm, f/8.
- Move: the crane. The camera pulls straight back from 0.97 m to 5.24 m and rises from 1.69 m to 3.01 m, looking down more and more, and swings 3° further around the plant.
- Start framing: the same frame the bloom ended on. The open head at (0.52, 0.45).
- Key: at 58.5 s the plant stands whole in the lower middle of the frame, base at (0.505, 0.90) and head at y 0.505, with the horizon high at y 0.215 and the sun at x 0.20, as `field` has it.
- End framing: base at (0.51, 0.84), head at (0.50, 0.51), horizon at y 0.21. The film ends on this picture, with no fade.
- Focus: on the head of the plant. At f/8 and 24 mm the field is sharp far back.
- In frame: the plant and the companion a short step to its left, each with its shadow on the open soil in front of the first row. Behind them the whole field in bloom to the horizon, heads toward the camera, a tree line and the sun under cloud.
