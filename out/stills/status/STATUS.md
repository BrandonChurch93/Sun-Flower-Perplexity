# Status 70

2026-11-22 04:31 UTC

- Status 70 · Phase 5. The final build failed one measure: at frame 1350 the growing tip read a blur circle of 1.59 px against the limit of 1.5 (the judged build read 1.44). Traced to one number of the last fix pass, the lift of the upper ray layer. That lift is taken out, nothing else, and no limit is touched. On the corrected build the frame reads 1.44 again. Frames 0, 15, 30, 45, 420 and 1080 are identical pixel for pixel to the build before, and the hero frame 1515 differs nowhere by more than 8 levels. Everything is being rendered again from the corrected build on twelve machines, and the machine checks are running on it.
- Next: Close the Phase 5 gate on the corrected build (machine checks, measures, preview film), publish, then freeze the build, run the record round and render the master film. Time used: 27.7 h of 30 h.
- Review page: https://sunflower-film.pplx.app/review.html

- `status-1.jpg`: Frame 1350, the opening head at twice size: the build that failed the focus check left, the corrected build right
- `status-2.jpg`: Frame 1350 from the corrected build, final tier
- `status-3.jpg`: Frame 1515 from the corrected build, final tier
- `status-4.jpg`: Frame 0 from the corrected build, final tier
