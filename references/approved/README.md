# Approved images

Brandon approved these eight images on 2026-11-20. Each is the target for the film frame at its key's time.

| Key | File | Copied from |
| --- | --- | --- |
| `dawn-sprout` | `dawn-sprout.png` | `references/drafts/dawn-sprout-take3.png` |
| `dawn-seedling` | `dawn-seedling.png` | `references/drafts/dawn-seedling-take3.png` |
| `rain` | `rain.png` | `references/drafts/rain-take4.png` |
| `night` | `night.png` | `references/drafts/night-take4.png` |
| `frost` | `frost.png` | `references/drafts/frost-take1.png` |
| `bloom-opening` | `bloom-opening.png` | `references/drafts/bloom-opening-take4.png` |
| `bloom-hero` | `bloom-hero.png` | `references/drafts/bloom-hero-take4.png` |
| `field` | `field.png` | `references/drafts/field-take4.png` |

- Each file is a byte for byte copy of its take. These are the takes the reference run chose as best.
- `MANIFEST.sha256` has one line per image: the SHA-256 hash, two spaces, the file name.
- `contact-sheet.jpg` shows all eight in film order.
- `references/drafts/NOTES.md` records the model, the prompt and the inputs of every take, and the faults the run saw in each best take.
- Nothing in this folder is ever edited, replaced or regenerated.

## What was decided when they were approved

- Framing. From `night` onward the images frame the plant closer than the brief asked. The images win. `camera.keys`, `plant.heightM` and `plant.stages` in the config were set again from the images.
- The companion. The two bloom images have the leaves of a second sunflower at their left edge. The `field` image shows the plant standing alone. The film keeps the second sunflower in every world, out of frame until late in the frost, so it also stands a short step from the plant in the last shot. This is the one settled difference. It is listed for the `field` key in the config.
- The golden hour sky. The two bloom images have a heavier cloud layer than the `field` image. `kit/02-SUBJECT.md` describes one sky that matches both, so nothing had to be settled.
- Small points where the image wins over the brief: the split husk resting beside the seedling, and eight or nine leaves on the plant in the rain.
