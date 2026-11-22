# Status 89

2026-11-22 11:31 UTC

- Status 89 · Phase 6. Step 13 after the fix of QA item 20, on the corrected build (engine 96146165ee8a578d). All 26 parts of the master film are in from the twelve builders and the film was joined at 11:31: 1,800 frames, 1920 x 1080, 142.0 MB; the focus check M1 fails on the same 16 frames as on the frozen build (303 to 315 in rain, 1418 to 1420 in bloom). The memory test of the export runs since 10:49 (the first run took 36 minutes; this one shared the VM with two page probes). The cause of the one console line of QA pass 1 is found: the rain streaks geometry has a 2 number position attribute, the library reads 3 when it sorts the draw order; no pixel depends on it, it is recorded as an open item.
- Next: The memory test's result, then the measures and the pack of round 26, then the record round run 2 of 2: every critic R1 to R7 and fifty jurors on the corrected build. After it: clips, preview film, review page and publish, QA gauntlet pass 2 of 2, BUILD COMPLETE. Time used: 4.7 h of 10 h.
- Review page: https://sunflower-film.pplx.app/review.html

- `status-1.jpg`: Frame 300, rain, from the new master film (draft tier)
- `status-2.jpg`: Frame 1000, frost, from the new master film (draft tier)
- `status-3.jpg`: Frame 1300, bloom, from the new master film (draft tier)
- `status-4.jpg`: Frame 1740, field, from the new master film (draft tier)
