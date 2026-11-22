# Status 87

2026-11-22 10:44 UTC

- Status 87 · Phase 6. QA gauntlet pass 1 is written: 31 of 33 items pass, items 20 (values copied from config into src) and 25 (autopilot evidence) fail. The item 20 fix is merged (engine 96146165ee8a578d): 18 frames rendered from both builds are the same by pixel hash, and the first nine final stills from the builders are byte for byte those of round 25. Step 13 runs: proof and memory test on this VM, all 55 pack files and 26 film parts with the 12 builders.
- Next: Take in the pack files, run measure, compare and keep, run record round 26 (24 critics, 50 jurors, run 2 of 2), join the film again, publish, then gauntlet pass 2 with a new autopilot capture. Time used: 3.9 h of 10 h.
- Review page: https://sunflower-film.pplx.app/review.html

- `status-1.jpg`: QA item 23, the export page while it runs: frames done, elapsed, remaining
- `status-2.jpg`: QA items 24 and 25, live scrubbed to three times (top) and autopilot (bottom); the autopilot pictures came back late, so item 25 fails on evidence
- `status-3.jpg`: QA item 3, the plant's height over the film, never falling
- `status-4.jpg`: Frame 1755 at the final tier from the fixed build, byte for byte the picture of the frozen build
