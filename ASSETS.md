# Assets ledger

One row per third-party file that the app ships or that fed a generated asset. The rules are in `AGENTS.md` and `kit/06-ASSETS.md`.

| File | What it is | Source URL | License | Credit line | Date fetched |
| --- | --- | --- | --- | --- | --- |
| `public/assets/ground/{full,web}/soil-color.jpg`, `public/assets/ground/{full,web}/soil-data.png` | Dry brown soil scan, cut and packed by `assets-src/ground/RECIPE.md`: color; normal, roughness and height | https://polyhaven.com/a/brown_mud_dry | CC0 1.0 | Brown Mud Dry by Rob Tuytel, Poly Haven | 2026-11-21 |
| `tools/beat/beatmap.js`, `tools/beat/beatmap.d.ts`, `tools/beat/sync-mark.js`, `tools/beat/cues.template.json`, `tools/beat/cues.py`, `tools/beat/bslib.py`, `tools/beat/check_recording.py`, `tools/beat/make_sync_test.py` | The film clock read from the audio clock, the loader of the track map, the cue sheet compiler and linter, and the recording check. Copied unchanged from Brandon's own `beat-sync` skill, which was written for him in this project's thread | Brandon's skill library, `beat-sync` | Brandon's own | none | 2026-11-22 |
