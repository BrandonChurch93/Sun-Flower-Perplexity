# Shots

One camera move runs through the whole film. The camera never cuts: at each of the four cuts the world changes around a plant and a camera that carry straight on, so the plant sits at the same place and size on both sides of every cut. Between `bloom` and `field` the world stays the same, so there is no cut there. The numbers below are read from the frozen build with `state()` at the first and last frame of each segment and at each key (camera position, lens and aperture, the plant's base, tip and head projected into the frame), and the sun's place from the kept stills. Positions in the frame are fractions of the frame, x from the left and y from the top.

Lens: a 36 mm wide gate. Focus sits on the growing tip of the plant in every frame, and on the center of the head once there is a head. Shutter 180°. The aperture is keyed with the camera and eases from one value to the next; it does not jump at a cut.

| Segment | Time | Frames | Focal length | Aperture | Distance to the plant | Eye height | Plant height |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dawn` | 0 to 8 s | 0 to 239 | 60 to 54 mm | f/22 to f/10 | 0.15 to 0.35 m | 0.02 to 0.05 m | 0 to 0.07 m |
| `rain` | 8 to 20 s | 240 to 599 | 54 to 43 mm | f/10 to f/9 to f/10 | 0.35 to 0.90 m | 0.05 to 0.22 m | 0.07 to 0.47 m |
| `night` | 20 to 30 s | 600 to 899 | 43 to 39 mm | f/10 to f/11 to f/9.4 | 0.90 to 1.00 to 0.91 m | 0.22 to 0.73 m | 0.47 to 1.00 m |
| `frost` | 30 to 40 s | 900 to 1199 | 39 to 36 mm | f/9.4 to f/4.6 | 0.91 to 0.73 to 0.74 m | 0.73 to 1.40 m | 1.00 to 1.56 m |
| `bloom` | 40 to 52 s | 1200 to 1559 | 36 to 35 mm | f/4.6 to f/4 to f/4.2 | 0.74 to 1.01 m | 1.41 to 1.70 m | 1.56 to 1.83 m |
| `field` | 52 to 60 s | 1560 to 1799 | 35 to 24 mm | f/4.2 to f/8 | 1.02 to 5.81 m | 1.70 to 3.13 m | 1.83 to 1.85 m |

## `dawn` · 0 to 8 s

- Lens: 60 mm easing to 54 mm. The aperture holds f/22 for the first second and a half, then opens to f/11 at 6.5 s and f/10 at the cut. A macro view a hand's width from the soil.
- Move: the camera rests almost on the ground, 2 cm up, and backs away slowly from 0.15 m to 0.35 m while it rises 3 cm. It swings less than 1° around the plant.
- Start framing: soil with the place where the plant breaks through at (0.59, 0.79), the horizon a third of the way down the frame at y 0.33, the sun low on the right at x 0.81.
- Keys: at 1.5 s the hooked sprout stands from its base at (0.60, 0.77) up to the top of the hook at (0.645, 0.24), as `dawn-sprout` has it. At 6.5 s the seedling's stem ends at (0.61, 0.42) with the two seed leaves spread above it, as `dawn-seedling` has it.
- End framing: base at (0.61, 0.75), the stem's end at y 0.41, horizon at y 0.35.
- Focus: on the top of the hook, then on the point where the seed leaves meet.
- In frame: the plant, the soil around it with the dropped husk, blades of young grass with dew on both sides, the low sun on the right and its light on the soil, a band of mist over the far field under a line of low hills.

## `rain` · 8 to 20 s

- Lens: 54 mm easing to 43 mm, f/10 to f/9 at the key and back to f/10.
- Move: the camera keeps backing away, 0.35 m to 0.90 m, and starts to climb, 0.05 m to 0.22 m, more slowly than the plant grows. It swings 3° to the right around the plant and tilts from 3° down to 5° up.
- Start framing: the same frame the dawn ended on. Base at (0.61, 0.75), the stem's end at y 0.41.
- Key: at 14 s the whole young plant stands in the frame, base at (0.62, 0.805), tip at (0.62, 0.20), horizon across the middle at y 0.53, as `rain` has it.
- End framing: the plant has outgrown the frame. The base left through the bottom edge at 17.3 s, the tip is at (0.62, 0.23), horizon at y 0.70.
- Focus: on the growing tip.
- In frame: the plant from soil to tip until 17.3 s, then its upper part. Rain falling all through, wet soil with a runnel of water in the furrow beside the plant, the rows of young neighbors behind it, dark hills and storm cloud with a pale break above the horizon. One stroke of lightning lights the cloud from inside at 17.2 s.

## `night` · 20 to 30 s

- Lens: 43 mm easing to 39 mm, f/10 to f/11 at the key and f/9.4 at the cut.
- Move: the camera climbs with the plant, 0.22 m to 0.73 m, and tilts up toward the sky, 5° to 9°. Its distance holds near 1 m. It swings 4° further around the plant.
- Start framing: the same frame the rain ended on. Tip at (0.62, 0.23), horizon at y 0.70.
- Key: at 26 s the tip is at (0.56, 0.31) with the horizon low at y 0.84 and the Milky Way standing over the left of the frame, as `night` has it.
- End framing: tip at (0.555, 0.30), horizon at y 0.80.
- Focus: on the growing tip.
- In frame: the upper part of the plant against the sky, the dark field of neighbors along the bottom, a ridge of hills with mist lying in front of it, the stars and the Milky Way on the left. The bud shows at the tip in the last seconds.

## `frost` · 30 to 40 s

- Lens: 39 mm easing to 36 mm. The aperture opens from f/9.4 to f/5.6 at the key and f/4.6 at the cut.
- Move: the camera rises to the height of the bud, 0.73 m to 1.40 m, and drifts in from 0.91 m to 0.73 m, then holds. It levels off from 9° up to 1° up and swings 5° further around the plant.
- Start framing: the same frame the night ended on. Tip at (0.555, 0.30), horizon at y 0.80.
- Key: at 36 s the bud is at (0.565, 0.30) with the horizon at y 0.60 and the pale sun on the right at x 0.80, as `frost` has it.
- End framing: the bud at (0.60, 0.36), horizon at y 0.53.
- Focus: on the bud.
- In frame: the bud, the top of the stem and the upper leaves, rimed with frost. Behind them the neighbors with their own buds, fading into the fog, and the pale disc of the sun on the right.

## `bloom` · 40 to 52 s

- Lens: 36 mm easing to 35 mm, f/4.6 opening to f/4 by 44 s, held to 51 s and f/4.2 at the end of the segment.
- Move: the camera rises the last 0.3 m with the head, 1.41 m to 1.70 m, and eases back from 0.74 m to 1.01 m as the head opens. It swings 5° further around the plant. The head does not follow it: the bud points straight up at the cut and tips over toward the sun on the left as it opens. At 45 s its face still looks 35° above level; by 50.5 s it stands nearly upright, 30° to the left of the lens, and it never turns back.
- Start framing: the same frame the frost ended on. The bud at (0.60, 0.36).
- Keys: at 45 s the opening head is at (0.575, 0.41), its first rays out on the sun side and the rest still folded over the disc, with the sun on the left at x 0.18 and the horizon at y 0.48, as `bloom-opening` has it. At 50.5 s the open head is at (0.555, 0.42), turned 30° to the left of the lens, and its disc is a third of the frame's height across, as `bloom-hero` has it.
- End framing: the open head at (0.54, 0.44), horizon at y 0.42.
- Focus: on the center of the head.
- In frame: the head, the neck and the top leaves. Behind them the field in bloom, soft, the low sun under cloud on the left and dust in its light. The companion's leaves are at the left edge.

## `field` · 52 to 60 s

- Lens: 35 mm widening to 24 mm. The aperture closes from f/4.2 to f/8 by 59 s.
- Move: the crane. The camera has been easing away since 50.5 s; it pulls back from 1.02 m to 5.81 m and rises from 1.70 m to 3.13 m, looking down more and more, 3° to 13.5°, and swings 4° further around the plant.
- Start framing: the same frame the bloom ended on. The open head at (0.54, 0.44).
- Key: at 58.5 s the plant stands whole in the lower middle of the frame, base at (0.505, 0.90) and head at (0.495, 0.505), turned 34° to the left of the lens, with the horizon high at y 0.215 and the sun at x 0.21, as `field` has it.
- End framing: base at (0.50, 0.82), head at (0.50, 0.51), horizon at y 0.21. The film ends on this picture, with no fade.
- Focus: on the head of the plant. At f/8 and 24 mm the field is sharp far back.
- In frame: the plant and the companion, a taller stalk still in bud, a short step to its left on open ground in front of the first row. Behind them the whole field in bloom to the horizon, a line of hills and the sun under cloud at the upper left.
