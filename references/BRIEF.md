# Reference run brief

This file is for a task whose prompt starts with `REFERENCE RUN`. That task makes eight reference images and nothing else. `AGENTS.md` and everything under `kit/` are for the build that comes later. They do not apply to this task. Do not act on them.

## What these images are for

A 60 second film: the life of one sunflower in one continuous camera move, from the seedling breaking the soil to full bloom and a pull back over a whole field. The plant never stops growing. The world cuts round it: five kinds of weather arrive as hard cuts while the plant and the camera carry straight on.

Brandon will look at these eight images and decide whether this is the film he wants. The ones he approves become the target every frame of the build is matched against. So each image has to be the film at its best at that moment.

## The bar

- Each image looks like a frame from a top-budget film or a cinema nature documentary, shot on a large-format cinema camera with a real lens. A viewer believes it was photographed.
- It does not look like a stock photograph, a seed catalog picture, a 3D render or generated art.
- Beauty is pushed as far as it will go while still being believed: the light is richer, the detail finer and the moment more perfect than a real camera would be lucky enough to catch.
- Real lens behavior: shallow depth of field where the camera is close, soft round out of focus highlights, a gentle flare when a bright light is in or near frame, fine film grain.
- Real plant detail: light glowing through leaves and petals, veins, fine stiff hairs on the stem that catch the light, petals that are slightly crumpled and uneven, leaves that are not perfect.
- 16:9 landscape, at the highest resolution the model offers.
- Nothing in any image except the place and its plants: no people, animals, birds, insects, buildings, roads, fences, poles, wires, machines, text, labels, borders or watermarks.

## One place, one plant

All eight images show the same plant in the same place, at different ages and in different weather.

- The place: the near edge of a sunflower field in open farmland. The plant stands in the front row. Between it and the camera is a strip of grass and bare soil. Rows of other sunflowers of the same age run away behind it. Low rolling hills and a line of trees close the horizon.
- The plant: a common sunflower, the classic tall kind with one large head, about 1.85 m tall when full grown.
- The camera: one continuous move across the whole film, backing away and rising as the plant grows. Each shot below gives where the camera is at that moment. Keep to those positions, so the eight images read as eight moments of one move.

## The shots

Make them in this order. The first is the style anchor for all the others.

| Order | Id | Film time | What it shows |
| --- | --- | --- | --- |
| 1 | `bloom-hero` | 50.5 s | Golden hour. A medium close-up of the fully open head. The head is about 40 percent of the frame height, a little right of center, turned slightly toward the camera. The sun is low at the left edge of frame, partly behind the plant: the petals on that side glow with light passing through them, the hairs on the stem and the back of the head carry a bright rim, and a soft warm flare crosses the frame. Every floret of the disc is sharp: the crossing spirals, the outer rings open with yellow pollen, the center still tight and green brown. The top of the stem and two upper leaves are in frame, with veins and fine fuzz. Behind: the field out of focus as soft round discs of gold and green, hills on the horizon, haze lit gold, a few motes of pollen in the air. Camera at the height of the head, about 1.3 m from it, a 35 mm lens |
| 2 | `field` | 58.5 s | Golden hour, the same light. The camera has craned up and back: about 4.5 m above the ground and 8 m from the plant, a 24 mm lens, looking down a little. The same flower stands in the lower middle of the frame, sharp, the whole plant visible down to the soil and the strip of grass. Round and behind it thousands of sunflowers in rows run to the horizon, all turned the same way toward the low sun at the left. Gold haze over the field, long shadows between the rows, low hills and a line of trees at the horizon, a few high thin clouds lit pink and gold |
| 3 | `bloom-opening` | 45 s | Golden hour, the same light and almost the same camera as `bloom-hero`, a little lower. The same head half open: green pointed bracts folding back, the first yellow petals unfurling unevenly, some still creased and standing upright, the disc mostly covered |
| 4 | `frost` | 36 s | A cold foggy dawn. The same plant about 1.4 m tall with a tight green bud at its tip. Camera about 1.35 m from it and 1.2 m above the ground, looking slightly up, a 38 mm lens, showing the upper two thirds of the plant. Thick pale fog. The sun is a soft white disc low at the right. Color is almost drained, with a faint peach warmth round the sun. White hoarfrost crystals stand along every leaf edge, on the stem hairs and on the tips of the bracts. Frozen beads of dew. The other plants of the field are pale shapes fading into the fog |
| 5 | `night` | 26 s | A clear night. The same plant about 0.75 m tall, its leaves lowered a little. Camera about 1.0 m from it and 0.5 m above the ground, looking up a little so the sky fills the top two thirds of the frame, a 40 mm lens. The Milky Way arches across the sky with thousands of sharp stars. A moon out of frame to the left gives a cold silver rim on the leaves and the stem hairs. Thin mist lies low over the field. Dew on the leaves. Exposed like a professional night photograph: the plant clearly readable, the sky rich, nothing crushed to black |
| 6 | `rain` | 14 s | A downpour. The same plant young, about 0.22 m tall with four to six leaves, the whole plant in frame. Camera about 0.5 m from it and 0.15 m above the soil, a 48 mm lens. Dense rain, each streak blurred by its own speed. Splash crowns and flying mud on black soaked soil. Puddles filling the furrow, covered in overlapping rings. Water beading on the leaves and running off their tips. The leaves bent under the drops. A low slate grey sky, cool flat light, and a pale band of brightness along the horizon that puts a thin wet rim on every edge |
| 7 | `dawn-seedling` | 6.5 s | Sunrise. Macro. The seedling about 5 cm tall, standing straight, two thick oval seed leaves open, a tiny pair of true leaves starting between them. The grey and white striped seed husk lies on the soil beside it. Camera 0.25 m from it and 4 cm above the soil, a 55 mm macro lens, very shallow focus. The sun is at the right edge of frame behind blades of grass: the seed leaves glow with light passing through them, dew on the grass and the soil turns into soft bright discs, thin mist glows just above the ground |
| 8 | `dawn-sprout` | 1.5 s | Sunrise, the same light. Extreme macro at soil level. Dark moist crumbs of soil heave and crack. A pale green stem bent over in a hook pushes through, with the striped seed husk still clamped over the folded seed leaves and crumbs of soil sliding off it. Lens 2 cm above the ground and 14 cm from the stem, a 60 mm macro lens. Blades of grass out of focus in front and behind. The low sun rakes warm light across the crumbs. A bead of dew on everything. This is the first frame of the film and it has to stop someone scrolling |

## Method

1. Before generating, look up real photographs of each thing these shots show: a sunflower seedling breaking the soil, seed leaves, a young plant, a bud, a head half open, an open head face on, a backlit head at golden hour, a sunflower field at golden hour, hoarfrost on leaves, a plant in heavy rain. Use `search_images`. At most six per subject. Pass the best to the generator as reference images, so each part of the plant is true to life. Save them under `references/cache/`, which git ignores. Do not commit them.
2. Choose the image model on the first shot. Make one take of `bloom-hero` on each of the two most photographic models available. In an earlier run those were `seedream_5` and `nano_banana_pro`. Pick the one that looks more like a photographed film frame, say which in the thread, and use it for everything else. Use the other only for a shot the chosen one cannot get right.
3. `bloom-hero` comes first. Its best take is the style anchor. Pass it as a reference image into every later generation, together with the best take of the shot before, so all eight show one plant in one place through one camera.
4. Make two takes of each shot. A shot gets at most four takes in all, retries included. At the limit, keep the best take and move on. Do not spend the run on one image.
5. One fresh agent that has not seen this brief judges each take blind. It receives the image and exactly this text: "You will see one image. Which of these is it most likely to be? (a) a frame from a top-budget film or a cinema nature documentary, (b) a stock photograph, (c) a seed catalog or textbook picture, (d) amateur generated art, (e) a 3D render. Answer with one letter and name its weakest part." Only (a) passes. A take that fails is made again, inside the limit of four.
6. Reject and remake, inside the limit, any take with: a person, animal, insect, building or text in it, a plant that is not a sunflower of the right age, a second sun, or a camera position far from the one its row gives.
7. As soon as a shot has its best take, show it in the task thread, displayed inline so Brandon sees it without opening or downloading a file. If attaching is the only thing that works, attach it and say so. Do not wait for the whole set.
8. Save every take as `references/drafts/<id>-take<N>.png` and push after every finished shot.
9. If a tool or an agent fails three times, skip it, note it and move on.

## When the set is done

1. Make `references/drafts/contact-sheet.jpg`: the best take of each shot, in film order (`dawn-sprout`, `dawn-seedling`, `rain`, `night`, `frost`, `bloom-opening`, `bloom-hero`, `field`), each labeled with its id. Show it inline in the thread.
2. Write `references/drafts/NOTES.md`: the model chosen and why, and for every take its file, the model, the exact prompt, the reference images passed in, the judge's answer and whether it is the best take of its shot. Also write down exactly how you displayed pictures inline in the thread, so the build can do the same.
3. Push.
4. End the task with exactly: `REFERENCES READY`

## Limits

- At most four takes per shot.
- At most six looked-up photographs per subject.
- Three tries at anything that fails.
- At most three hours for the whole run. When the time is up, do steps 1 to 4 above with whatever exists.
