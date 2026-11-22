# Status 86

2026-11-22 10:21 UTC

- Status 86 · Phase 6. QA gauntlet pass 1 of 2: 29 of the 33 items have their evidence and pass; the gate is all 15 green (13 machine checks, D2, D3); item 20 fails (config values copied as plain numbers in src/), its fix is being made in a side worktree and changes no number; items 23 to 25 (export page, subfolder, autopilot and live) are being captured now.
- Next: write the 33 lines under QA results, merge the item 20 fix once stills prove no pixel changed, then step 13: proof, memory test, final stills, record round run 2 of 2 and all 26 film parts on the fixed build, then gauntlet pass 2 and BUILD COMPLETE. Time used: 3.5 h of 10 h.
- Review page: https://sunflower-film.pplx.app/review.html

- `status-1.jpg`: QA item 1: frames 0 and 5, no fade in, the hook already moving
- `status-2.jpg`: QA item 4: both sides of each of the four cuts, each wholly its own world
- `status-3.jpg`: QA item 23: the export page before it starts, this machine's check frame beside the kept still
- `status-4.jpg`: QA item 24: frame 1515 drawn from the build served under a subfolder path
