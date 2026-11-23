# Round 27 · R2 jury · supplement at the final tier · the jurors' answers, word for word

This is not the record. The record is `R2.json` and `R2-JURORS.md`, which judged the film as it was drawn, with one sample a frame. Here seventy fresh agents each received one image and the question, and nothing else: the same fourteen frames of the same frozen commit, drawn at the final tier with 48 samples a frame, which is what the export draws. The question:

> You will see one image. Which of these is it most likely to be? (a) a frame from a top-budget film, a AAA game cinematic or a cinema nature documentary, (b) a stock photograph, (c) a seed catalog or textbook picture, (d) amateur generated art, (e) a real-time web 3D demo. Answer with one letter, a confidence from 0 to 100, and the one thing that most influenced your answer.

Which file is which frame is in `R2-SUPPLEMENT.json`.

## set-H-01.png

- `reviewer_636` (GPT): a, 78, The dramatic sunset backlighting makes the foreground petals glow translucently.
- `reviewer_637` (Gemini): e, 88 — The visibly low-poly, straight-edged polygonal silhouettes on the leaves (especially along the left foreground and beneath the flower head), paired with mathematically instanced 3D florets and real-time depth-of-field post-processing, indicate a real-time 3D scene rather than a photograph, generated image, or pre-rendered cinematic.
- `reviewer_638` (Claude): a, 55, Polished path-traced CG look in a cinematic widescreen frame (procedural phyllotaxis seed head, shallow DOF bokeh field, graded sunset sky), though the flower is front-lit against a backlit sun, which hints at CG.
- `reviewer_639` (GLM): a, 82/100. The finely textured petals glow translucently in the backlight, giving the close-up a cinematic finish.
- `reviewer_640` (Grok): b 64 The image is a photoreal golden-hour hero shot of a sunflower, composed like a commercial stock photograph rather than a film frame, catalog plate, or real-time render.

## set-H-02.png

- `reviewer_641` (GPT): a, 72/100, the convincing interaction of rain with the reflective, rippling puddles.
- `reviewer_642` (Gemini): e, 92, the low-poly faceted plant geometry set in procedurally displaced mud intersected by a flat water plane with a synthetic concentric ripple.
- `reviewer_643` (Claude): Answer: (d) amateur generated art. Confidence: 45. Most influential: it is clearly a CG render (procedural-looking clumpy soil, uniform plastic-ish leaves, repeated background plants) with cinematic lighting, but not photoreal enough for a top-budget production; it reads like a hobbyist Blender-style showcase render.
- `reviewer_644` (GLM): e, 76/100. The repeated seedling geometry across the field looks like instanced 3D meshes.
- `reviewer_645` (Grok): e 74 Screen-space rain streaks and faceted leaf edges that read as a real-time 3D shader, not a photographed or cinema-grade frame.

## set-H-03.png

- `reviewer_646` (GPT): e, 82, The evenly repeated seedlings in the background look like copies of the same 3D model.
- `reviewer_647` (Gemini): e, 88 — Visibly faceted low-polygon leaf silhouettes on the hero foreground plant paired with real-time 3D shader effects (approximated leaf translucency, displaced dirt mesh, and procedural sky).
- `reviewer_648` (Claude): e, 45 — It is clearly a CG render, not a photo. What decided it: the background seedlings are low-detail, the soil texture repeats and the leaves are simple shapes, which points to a real-time engine. The rim-lit translucent leaves and fuzzy stem hairs over an HDRI-style sky are polished, but they are not film-grade.
- `reviewer_649` (GLM): e, 83/100. The background rows look like repetitions of the same 3D seedling model.
- `reviewer_650` (Grok): e, 82, heightmap soil with texture stretch, repeated plant instances, and a simple post bloom instead of real lens optics

## set-H-04.png

- `reviewer_651` (GPT): e, 85/100. The grass blades have uniformly smooth, tapered curves that look like repeated 3D meshes.
- `reviewer_652` (Gemini): (e) | Confidence: 92 | The scene is built from lightweight procedural 3D primitives rather than real photography or film-grade assets, most visibly the simple cylindrical stem with an abrupt mesh seam where the two leaf meshes plug into its top.
- `reviewer_653` (Claude): b, 45, The clichéd 'seedling at golden-hour sunset with bokeh' composition is a classic stock-image concept (polished, generic, likely a 3D render made for stock), rather than a narrative film frame.
- `reviewer_654` (GLM): a, 72, The carefully controlled sunset rim lighting on the seedling gives it the look of a cinematic macro shot.
- `reviewer_655` (Grok): a 78 Path-traced cinematic lighting and shader-clean plant geometry, with no photographic lens artifacts, labels, or real-time demo tells.

## set-H-05.png

- `reviewer_656` (GPT): e, 72, The bud’s bracts have uniformly bright, angular outlines that look like rendered geometry.
- `reviewer_657` (Gemini): (e), confidence: 92. What most influenced my answer is the low-poly faceted bract geometry on the flower bud, which shows straight polygonal silhouettes, mathematically instanced phyllotaxis meshes, and aliased 1-pixel white alpha-cutout fringes characteristic of real-time WebGL rasterization.
- `reviewer_658` (Claude): a, 55, Cinematic dusk lighting with fine rim-lit stem hairs and shallow depth of field on a 16:9 frame: it looks like a high-end offline CG render or film frame, not a catalog or stock shot.
- `reviewer_659` (GLM): e, 69, The bud’s repeated, razor-edged bracts look like duplicated 3D geometry.
- `reviewer_660` (Grok): b, 74, the flawless sunflower bud staged as a generic twilight hero shot reads as a commercial stock photograph, not a labeled plate, game render, or documentary frame.

## set-H-06.png

- `reviewer_661` (GPT): a, 83/100. The precisely controlled sunset rim light tracing the seedling’s fine hairs.
- `reviewer_662` (Gemini): d, 78 — Despite cinematic lighting and shallow depth of field, the hero sprout's crude 3D geometry gives it away: a smooth cylindrical stem pokes directly into a hollow, visibly faceted seed hull with no cotyledons inside.
- `reviewer_663` (Claude): a, 55 — cinematic widescreen composition with filmic rim/backlighting, shallow depth of field and fine stem hairs, which looks like a high-end CG nature-documentary frame rather than a stock photo or catalog picture.
- `reviewer_664` (GLM): e, 76/100, the repeated, uniformly shaped grass blades make the scene look like a real-time 3D render.
- `reviewer_665` (Grok): d, 66. The soil is a uniform procedural displacement plane with instanced dirt flecks and no photographic grain, which reads as a hobbyist 3D render rather than a film frame, stock photo, catalog plate, or web demo.

## set-H-07.png

- `reviewer_666` (GPT): e, 79/100. The frost needles look like repeated geometry scattered along the leaf outlines.
- `reviewer_667` (Gemini): e (confidence: 92) — Low-poly, zero-thickness leaf meshes with rigid instanced frost spikes clipping straight through the cylindrical stems and midribs.
- `reviewer_668` (Claude): d, 50 — It is clearly a 3D CG render (particle-hair frost spikes, a paper-thin leaf shell edge, a soft HDRI sun and bokeh), but the uniform, stiff hair strands and simple geometry look like a hobbyist Blender-style render, not polished film or AAA work.
- `reviewer_669` (GLM): e, 85/100. The frost looks like repeated needle geometry scattered along the leaf edges.
- `reviewer_670` (Grok): d, 72, the right leaf’s hard straight edge and repeated frost spikes clipping through it, which read as a hobby 3D render rather than a photo, film frame, or web demo.

## set-H-08.png

- `reviewer_671` (GPT): a, 77/100: The finely resolved backlighting on the wet leaves and tiny stem hairs looks like a polished cinematic render.
- `reviewer_672` (Gemini): e, 92, the polygonal leaf edges and flat water plane clipping into procedural noise-displaced terrain with shader-generated ripples and billboarded rain streaks typical of real-time WebGL rendering.
- `reviewer_673` (Claude): d, 55 — Clearly a CG render (blobby uniform soil clumps, repeated cloned plants, stretched rain streaks), polished like an offline Blender-style render but lacking the detail and realism of a top-budget production.
- `reviewer_674` (GLM): e, 76/100. The evenly repeated ripple rings across the puddles look like a real-time shader effect.
- `reviewer_675` (Grok): e, 78, Uniform linear rain streaks, procedural wet-soil shading, and repeated instanced plants read as a real-time engine demo, not a photograph or a film-quality offline render.

## set-H-09.png

- `reviewer_676` (GPT): e, 73, the bud’s bracts repeat in unusually regular, sharply outlined shapes that look like 3D geometry.
- `reviewer_677` (Gemini): e, 88, real-time 3D rendering cues—specifically the unshadowed white marginal hair primitives glowing along dark front-facing bract edges, subtle polygonal leaf silhouettes, and a procedural sky and screen-space depth-of-field shader.
- `reviewer_678` (Claude): d, 50, The sunflower bud looks like a CG render: its bracts are too regular, its surfaces look plasticky and the rim-lit hairs look procedural. It reads as a polished hobbyist or portfolio render rather than real footage or a production frame.
- `reviewer_679` (GLM): e, 73/100: The bud’s sharply outlined, uniformly rim-lit bracts look like modeled geometry.
- `reviewer_680` (Grok): b, 68, A generic backlit farm sunflower bud sits right of center with empty space on the left and no narrative event, which is how commercial stock is composed.

## set-H-10.png

- `reviewer_681` (GPT): e, 87/100. The same sunflower shapes repeat across the field like instanced 3D models.
- `reviewer_682` (Gemini): e, 92 — The repeated instanced low-poly 3D sunflower meshes paired with a simple procedural noise sky and cloud shader clearly indicate real-time web 3D rendering.
- `reviewer_683` (Claude): d, 55 — clearly a CG render (instanced, cloned sunflowers all facing the camera while backlit by the sun, simple painted-looking sky and flat hills), polished enough to be an offline hobbyist render but lacking film-grade art direction and detail.
- `reviewer_684` (GLM): e, 88/100. The field looks like it was populated by repeating a small set of sunflower models.
- `reviewer_685` (Grok): e, 82, visible polygon faceting, instanced flower meshes, and flat billboard grass that read as a real-time engine demo rather than a film frame or photograph

## set-H-11.png

- `reviewer_686` (GPT): e, 72, The backlit bracts have unusually angular, mesh-like silhouettes.
- `reviewer_687` (Gemini): e, 88, Procedural 3D geometry and real-time rendering artifacts—specifically the mathematically uniform Vogel-spiral florets, faceted polygon edges on the green bracts, and screen-space depth-of-field haloing against a procedural sky shader.
- `reviewer_688` (Claude): a, 60, Cinematic widescreen CG render with high-end detail (procedural seed spiral, backlit rim-lit leaf hairs, filmic depth of field and sun glow) — looks like a production-quality cinematic frame rather than a photo, catalog image, or real-time web demo.
- `reviewer_689` (GLM): a, 76/100. The delicate cinematic backlighting on the translucent petals and fine leaf hairs most influenced my choice.
- `reviewer_690` (Grok): a 80 Uniformly groomed, evenly spaced rim-lit bract hairs that read as a high-end cinematic 3D strand groom, not a photograph, catalog plate, amateur generation, or web demo.

## set-H-12.png

- `reviewer_691` (GPT): e, 84/100. The unnaturally smooth, uniformly rounded seedling looks like simple 3D geometry.
- `reviewer_692` (Gemini): d Confidence: 85 Most influential factor: The central sprout is a smooth, untextured 3D green cylinder with a few low-poly dirt clumps perched on top and a faceted black seed mesh underneath, marking it as an amateur path-traced 3D render rather than a real photograph or top-budget studio work.
- `reviewer_693` (Claude): a, 55 — Cinematic widescreen framing with shallow depth of field, dusk grading and a carefully lit CG seedling hook emerging from soil reads as a polished film or cinematic frame, not a stock photo or textbook shot.
- `reviewer_694` (GLM): e, 84/100. The repeated grass blades carry nearly identical crescent-shaped droplets, a strong sign of reused 3D assets.
- `reviewer_695` (Grok): d, 78, The rubber-smooth seedling and idealized dew drops mark mid-tier computer-generated art, not a film frame, photograph, catalog plate, or real-time demo.

## set-H-13.png

- `reviewer_696` (GPT): e, 84/100. The sunflower heads repeat with the regularity of instanced 3D assets.
- `reviewer_697` (Gemini): (e) Confidence: 88 Most influential factor: The procedural sky/cloud shader paired with thousands of sharply rasterized, low-poly instanced 3D sunflowers and grass clumps lit uniformly without depth-of-field, characteristic of a real-time WebGL/WebGPU 3D scene rather than photography, offline cinema rendering, or 2D generative art.
- `reviewer_698` (Claude): d, 55. The image is clearly CG, not a photo: the sunflowers are identical copies repeated across the field, and they face the camera fully lit even though the sun is behind them. That looks like a hobbyist 3D render, not film-grade or stock work.
- `reviewer_699` (GLM): e, 81/100: The same sunflower shapes repeat across the field at different scales and angles, a telltale sign of instanced 3D models.
- `reviewer_700` (Grok): e, 80, repeated jagged alpha-cutout grass and flat petal cards with no photographic or path-traced noise

## set-H-14.png

- `reviewer_701` (GPT): e, 87/100. The same leaf shapes repeat across the field, suggesting instanced 3D plant models.
- `reviewer_702` (Gemini): e, 88 — Polygonal leaf silhouettes and a flat water plane intersecting procedural displaced soil geometry, paired with screen-space god rays and instanced background plants typical of a real-time WebGL/Three.js scene.
- `reviewer_703` (Claude): d — confidence 55 — Polished-but-hobbyist CG look: blobby, plasticky soil and a repetitive, low-detail background field next to a carefully lit hero plant suggest a single-artist offline render (e.g. Blender), not top-budget film quality or a real-time web demo.
- `reviewer_704` (GLM): e, 86/100. The same leaf-and-stem geometry repeats across the field like a single instanced 3D model.
- `reviewer_705` (Grok): d 74 cloned background plants and plastic procedural wet soil, not a photograph or film-quality render
