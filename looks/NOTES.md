# Looks of checks

2026-11-23 04:21 UTC, at commit 459720a0 of agent/checks.

04:25, checks on v2 e5958d2. New check: script, the page's own script time in a frame by part, from the film's own laps, frames drawn in a row at 320 x 180 draft, limits in tools/checks/limits.json.

It FAILS in 12 of 13 windows (first 20 counted frames of each window so far). Mean 83.8 ms a frame over all of them against 16; the worst frame 265.5 ms at frame 3500 against 25. Only the frost hold passes: 5.9 ms mean, 10.4 worst.

By part: plant and companion 18 to 35 ms before the storm and 98 to 106 ms from bar 50 on (limit 5); field 22 to 28 ms wherever something grows (limit 3); puddles 26 to 31 ms in the storm (rain and puddles, limit 2); scene 16 to 23 ms from bar 50 on (limit 6).

Broken on purpose: the film with its sky alone passes at 1.4 ms; with 40 ms more in one frame the worst frame fails; with 4 ms more in the field's turn of every frame the field's share fails.

- `01-the-page-s-own-script-time-in-a-frame-by-window-.jpg`: The page's own script time in a frame by window, mean stacked by part, worst frame as a tick, against 16 and 25 ms
