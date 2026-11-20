# 06 · Assets

Four kinds of material go into this film: the approved images, the reference board, assets generated in the build, and third-party files.

## The approved images

- `references/approved/` holds eight images, one per key. Their paths are in `keys` in the config. `MANIFEST.sha256` lists a hash for each. `contact-sheet.jpg` shows all eight.
- `references/drafts/` holds every take from the reference run, with `NOTES.md` giving the model, the prompt and the inputs of each.
- `references/BRIEF.md` is the brief the reference run worked from. It describes each key in words.
- Brandon approved these eight. Each is the target for the film frame at its key's time.
- They may be used in the build: as the style input for every generated asset, as the source for a sky or a far background, and in a fallback.
- Never edit, replace or regenerate a file in `references/approved/`. Work on copies under `out/work/` or in an asset folder.
- The other takes in `references/drafts/` may be used as extra style inputs. They are never a target.

## The reference board

The approved images set the look. They are generated, so they cannot be trusted for what a sunflower really is. The reference board is where that comes from.

- For each part in the table below, find `reference.photosPerPart` real photographs with `search_images`. If three searches do not find that many good ones, keep what was found and move on.
- Save them under `references/cache/board/<part>/`. They are never committed and never appear in the film.
- Write `references/BOARD.md`: for each part, the source URL of each photograph and five plain observations about what the part really looks like. Shape, edge, surface, how light behaves, what a model usually gets wrong.
- Supporting agents gather the parts in parallel. This step is done once, in Phase 3, and is not repeated.

| Part | What to look for |
| --- | --- |
| Seedling breaking the soil | The hook, the husk, how the soil cracks |
| Seed leaves open | Thickness, sheen, the first true leaves between them |
| Young plant | How the first pairs of leaves sit |
| Stem and leaf stalk, close | Hairs, ridges, flecks of color |
| Leaf top, close | Veins as relief, fuzz, the toothed edge |
| Leaf with light behind it | How it glows, how the veins show |
| Bud in its bracts | The overlapping scales, the star shape |
| Head half open | Which petals lift first, how creased they are |
| Open head, face on | The crossing spirals, open and closed florets, pollen |
| Petals with light behind them | Color, veins, crumpling |
| Back of the head | Bracts, the hairy neck, the bend |
| Field at golden hour | How rows read, which way heads face, haze |
| Leaves and soil in heavy rain | Beads, runoff, splash crowns, puddles |
| Hoarfrost on leaves and stems | Where crystals grow and how they catch light |
| Dew on grass and soil at sunrise | Bead size, where they sit, how they blur |

### Motion studies

- Find `reference.motionStudies` pieces of real time-lapse footage: a seedling emerging, a stem growing, leaves through day and night, and a head opening.
- If this workspace can look at frames of a video, sample frames from each. If it cannot, use sequences of stills and written botanical descriptions.
- For each, write into `references/BOARD.md` what moves, in what order, how far and how unevenly.
- The footage is studied, never copied and never shown.

## Generated assets

Made with the workspace's image tools: the plant's color, relief and translucency maps, the ground maps, each world's sky and far background, and anything a fallback needs.

### Rules

- The approved image for the nearest key is always one of the inputs, as the style to match. The reference board is the check on whether the result is true to a real plant.
- Say what must not change. An image tool asked to add resolution or to remove a plant from a background must leave everything else where it was.
- Check that it obeyed: scale the result back to the size of its input and compare.
- No text, watermark, border, logo, person, animal, insect or stray object in any asset. Look for them at native size.
- A map that will be lit by the scene must not carry baked light: no highlight, no cast shadow, no glow.
- At most `assets.maxTakesPerAsset` takes per asset in one round, and the same number per phase for an asset made outside a round. Keep the best and move on. A better take can be made in a later round if a critic asks for it.
- Rejected takes stay under `out/work/`. Only the chosen take is committed, once, at the end of the round.
- `references/drafts/NOTES.md` names the image model the reference run found best for this look. Start there, and use another model when a job needs something that one does badly, such as keeping a layout exactly.

### Sizes and formats

- Sizes come from `assetSets` in the config. Build the `full` set first and derive the `web` set from it.
- Those sizes are for the color maps the camera gets close to. Masks, height and normal maps can be half that size or less.
- Everything a frame needs has to fit in `assetSets.<set>.maxTextureMb`. Measure it in Phase 0 and again at the look lock, and size the maps so it does.
- Color maps in a compressed format that shows no blocking at native size.
- Height and depth need more than 8 bits. A browser may quietly reduce a 16 bit image to 8 when it decodes it, so ship these as raw numbers loaded straight into a data texture, and check that the values arrive intact.
- No file over `repo.maxFileMb`. Split a map into tiles if it would be.

### Recipes

Every generated asset has its recipe in `assets-src/<owner>/RECIPE.md`, text only:

- The output file.
- The tool and the model.
- The input files, by path.
- The exact prompt.
- Which take was kept and why.
- The checks it passed.

A recipe is complete enough that a fresh agent could make the asset again.

## Third-party files

Scanned materials and data, used where they are better than anything generated.

### Where to look

Check the license on each asset's own page when you download it. These are starting points, not guarantees.

| Need | Source to try first |
| --- | --- |
| Soil, mud, gravel and grass materials with height | Poly Haven and ambientCG, which publish under CC0 |
| A sky to light a world before its own sky exists | Poly Haven skies |
| Star positions for the night, if the seeded generator is not used | A public domain bright star catalog |
| The glow of the Milky Way | NASA Scientific Visualization Studio, Deep Star Maps 2020. Take a version no larger than the sky needs |

### Rules

- The rules on what is allowed are in `AGENTS.md`.
- Every third-party file the app ships lives under `public/assets/third-party/`. One that is only an input lives under `references/cache/`.
- `ASSETS.md` at the repo root is the ledger. One row per third-party file that the app ships or that fed a generated asset: file, what it is, source URL, license, credit line, date fetched.
- A credit line in the ledger is a record. It never appears in the film. If a source requires credit, also list it under "Credits the post must carry" in `README.md`.
- No agency logo, insignia or name appears in the film, the interface or the README outside those credit lines.

## What is committed

- Everything under `public/assets/` and `assets-src/`, `references/BOARD.md`, and the status pictures and kept stills under `out/`.
- Not the takes that were rejected, not photographs from the web, not downloads that are only inputs, not frame dumps. Those stay under `out/work/` and `references/cache/`.
