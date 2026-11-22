# Status 85

2026-11-22 10:03 UTC

- Status 85 · Phase 6. Delivery steps 5 to 11 are done on the frozen build: master film joined, six clips and the preview film cut and kept, memory test and export proof passed, cut sheets and README final, review page rebuilt and the app republished. The QA gauntlet (33 items) runs, pass 1 of 2. So far: item 13 passes (stand-in view of all ten judged frames shows no flag colour, no stand-in declared), item 19 passes (frame 0 from a clean clone has the same hash as the working copy), items 7 and 8 pass (camera never stops or jumps, the plant never shrinks or holds still), item 21 passes. Item 20 fails: some config numbers (frame sizes, segment and key times) are copied as literals in src instead of read from config.
- Next: Finish pass 1 and collect every failure, then one fix batch (item 20 values read from config, pixels unchanged), then step 13: proof, judged stills, the record round again (run 2 of 2), film parts, clips, preview, review page, publish, and gauntlet pass 2. Time used: 3.2 h of 10 h.
- Review page: https://sunflower-film.pplx.app/review.html

- `status-1.jpg`: Film sheet 1 of 3, final build (0 to 20 s)
- `status-2.jpg`: Film sheet 2 of 3 (20 to 40 s)
- `status-3.jpg`: Film sheet 3 of 3 (40 to 60 s)
- `status-4.jpg`: QA item 13: stand-in view of the ten judged frames, no flag colour anywhere
