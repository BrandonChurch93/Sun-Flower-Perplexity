# 00 · Read me first

Read `AGENTS.md` at the repo root before this file.

## Reading order

| File | What it settles |
| --- | --- |
| `config/showcase.json` | Every number, the worlds, the timeline, the key images |
| `kit/01-FILM.md` | What the video is, second by second, and the camera move |
| `kit/02-SUBJECT.md` | The sunflower at every age, and each of the five worlds |
| `kit/03-METHOD.md` | How each kind of picture is made, and its fallback |
| `kit/04-LOOK.md` | The bar, the lens, the grade, and the ladder of techniques to climb when a picture falls short |
| `kit/05-ARCHITECTURE.md` | Code structure, determinism, modes, the harness, the clock, status, Export |
| `kit/06-ASSETS.md` | The approved images, the reference board, generated assets, third-party sources |
| `kit/07-QUALITY-BAR.md` | Checks, critics, the pass bar, the table of limits |
| `kit/08-BUILD-ORDER.md` | The phases, the budget report, and what ends the build |
| `kit/09-QA-GAUNTLET.md` | The final acceptance list |
| `kit/10-KICKOFF.md` | For Brandon. Not instructions for the Builder |
| `kit/PROGRESS.md` | The Builder's memory |
| `kit/addenda/` | Numbered changes made after the kit was written |

## When files disagree

| Topic | What wins |
| --- | --- |
| Any number, any time, any file path of an approved image | `config/showcase.json` |
| Whether the camera move stays one smooth move, and whether the plant carries through a cut | `kit/01-FILM.md`. These two beat the exact framing of an approved image |
| How a picture should look | The approved image for that key, then `kit/04-LOOK.md` |
| What the plant is at an age, and what a world holds | `kit/02-SUBJECT.md` |
| How a picture is made | `kit/03-METHOD.md`, unless the ladder in `kit/04-LOOK.md` has moved you to another technique |
| Whether something passes, and how many rounds it gets | `kit/07-QUALITY-BAR.md` |
| Code structure and determinism | `kit/05-ARCHITECTURE.md` |
| When to stop, and how time is counted | `AGENTS.md` |

- An addendum beats every file above on its own topic. A higher number beats a lower one. A note from Brandon in the thread counts the same way.
- If a conflict is still open, pick the reading that gets the frame closer to its approved image and log the choice.

## Working protocol

1. Check stop condition 1 in `AGENTS.md`.
2. Read `kit/PROGRESS.md`, then every file in `kit/addenda/`.
3. Find the current phase in `kit/08-BUILD-ORDER.md`.
4. Re-read that phase's "Read first" files from disk.
5. Do the steps. Verify the gate with evidence, not with a feeling.
6. Log, commit, push, publish, post the status.
7. Go to the next phase without waiting, unless `AGENTS.md` says to stop.

## Vocabulary

| Word | Meaning |
| --- | --- |
| World | One of the five kinds of weather and light, from `worlds` in the config. A world is everything except the plant and the camera: sky, light, air, the state of the ground, weather |
| Cut | The frame where one world is replaced by the next. The plant and the camera do not change at a cut |
| Segment | One timed part of the film from `segments` in the config. Each segment plays in one world |
| Unit | The piece of the film that gets its own critic rounds. In this film a unit is a segment, and it has the same id |
| Key | One of the eight moments in `keys` in the config, each with a time and an approved image |
| Approved image | One of the eight images in `references/approved/`. Each is the target for the frame at its key's time |
| Key frame | The film frame at a key's time |
| The plant | The hero sunflower |
| Neighbor | Any other sunflower of the field |
| Growth | The state of the plant as a function of film time |
| Stand-in | A placeholder for something not built yet. Every system reports whether it is one |
| Fallback | The technique from `kit/03-METHOD.md` that always works for a kind of picture, used when the planned one has not produced a finished part in time |
| Frame | One output image of the film. Index 0 is the first |
| Tier | A quality level from `tiers` in the config |
| Sample | One jittered sub-render. A frame is the average of its samples |
| Asset set | A size class of textures from `assetSets` in the config: `web` or `full` |
| Still | A single frame rendered for review |
| Judged frame | A still on the fixed list the critics score |
| Look | Any picture someone rendered in order to look at it. The harness logs every one |
| Status | A short message with pictures in the task thread |
| Comparison image | A key frame beside its approved image, made by `npm run compare` |
| Machine check | An automated check on the code. Red means a bug |
| Measure | An automated number on the picture. Red means a severe issue for the round, not a blocker |
| Deliverable check | An automated check on a file that takes long to make, run only at the end of the phases that name it |
| Gate | What has to be true before a phase ends. Listed at the end of each phase in `kit/08-BUILD-ORDER.md` |
| Critic | A fresh agent that scores files against a rubric |
| Round | One pass of build, checks, pack, critics, fixes |
| Floor round | A round that always happens: the first round of each unit, one blockout round, one whole film round, the record round |
| Extra round | Any other round. It starts only while its count and the clock allow |
| Open item | An issue still unresolved when a limit was reached |
| Chunk | Part of the film encoded so chunks join without being encoded again |
| Harness | The scripts in `tools/` that render frames in a headless browser |
| Export | The in-browser mode that renders and encodes the film on a computer with a GPU |
