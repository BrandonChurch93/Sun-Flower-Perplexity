# Progress

The Builder's memory. Read this first in every task. Update it before every commit.

## Status

- Build: in progress
- Current phase: 0 · Ground truth (step 1)
- Current unit: none
- Current round: none
- Blocked: no
- Budget: running
- Continuations: 0
- Extensions: 0
- Extension step: none
- App URL: not published yet
- Last push: 2026-11-21 01:00 UTC · Phase 0: package, clock, look log, status tool, inline display proof, status 01
- Last status: 01 · 2026-11-21 01:00 UTC · Phase 0

"Build" is one of `not started`, `in progress`, `complete` or `extension N in progress`. "Budget" is one of `running` or `reported`. `AGENTS.md` says what each means.

## Latest pictures

Newest first. Each line names the pictures of one status in `out/stills/status/`, with the time and the caption, so this page shows where the film is.

- 2026-11-21 01:00 UTC · status 01 · Phase 0 · `status-1.jpg`: The eight approved images, in film order

## Clock

Copied from the output of `npm run clock` at every status. Working time only.

| Phase | Planned box | Time used |
| --- | --- | --- |
| 0 | 1.50 h | 0.14 h |
| 1 | 0.50 h | 0.00 h |
| 2 | 3.50 h | 0.00 h |
| 3 | 9.00 h | 0.00 h |
| 4 | 8.50 h | 0.00 h |
| 5 | 3.00 h | 0.00 h |
| 6 | 4.00 h | 0.00 h |
| Whole build | 30.00 h | 0.14 h |

Continuations and extensions are listed under this table with their own hours.

## Phases

| Phase | State | Gate evidence | Commit |
| --- | --- | --- | --- |
| 0 · Ground truth | in progress | | |
| 1 · Rough cut | not started | | |
| 2 · Engine and blockout | not started | | |
| 3 · The look lock | not started | | |
| 4 · The other units | not started | | |
| 5 · The whole film | not started | | |
| 6 · Polish and deliver | not started | | |

State is one of `not started`, `in progress` or `done`.

## Units

State is one of `not started`, `stand-in`, `in progress` or `finished`. A finished unit names the commit it was finished on and what ended its loop: `passed`, `round limit` or `clock`. A unit is never marked finished because of a budget report. It stays `in progress`.

| Unit | State | Rounds run | R1 | R2 | R3 | R4 | Ended by | Commit | Open items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dawn | not started | 0 | | | | | | | |
| rain | not started | 0 | | | | | | | |
| night | not started | 0 | | | | | | | |
| frost | not started | 0 | | | | | | | |
| bloom | not started | 0 | | | | | | | |
| field | not started | 0 | | | | | | | |

## Workspace record

Measured in Phase 0. These replace the numbers in `AGENTS.md`.

Not measured yet.

## Tool record

What this workspace can call, measured in Phase 0. It includes the exact method that displays a picture inline in the task thread.

### Inline display method (proven 2026-11-21 01:00 UTC with `references/approved/contact-sheet.jpg`)

1. `npm run status` writes `out/work/status/status.json`: `{"pics":[{"label","w","h","src"}],"lines":[...]}`. Each picture is a JPEG of at most `status.pictureLongEdgePx` on the long edge, stored as a base64 data URL. `npm run inline -- --name X "caption=file"` writes the same kind of file for any other picture.
2. The Builder calls the inline visualization tool with `sources = {"pics": {"workspace_path": "<absolute path of that json>", "format": "json"}}` and the widget code kept in `tools/status-widget.html`, word for word.
3. The widget reads `window.visualization.sources.pics.data`, writes the status lines above the pictures and sets each `img.src` from the data URL in a script placed after the markup. One picture fills the width. Two to four form a grid with a caption under each.
- What does not work in the widget: external URLs and workspace paths as `img.src` (blocked by its content policy). A file attachment alone does not display inline.
- The widget is about 720 px wide and its visible height is capped near 640 px, so four 16:9 pictures in a 2 by 2 grid fit.
- Fallback if the tool ever fails: attach the pictures as files at the same rhythm and publish with every status.

## Pinned versions

| Package | Version | Use |
| --- | --- | --- |

## Render budget

Seconds per sample and per frame at each format and tier, the time for one judged still at the `final` tier, the time for the whole film at each tier, and the texture memory. Measured in Phases 0, 2, 3 and 5.

Not measured yet.

## Judged frames

Computed in Phase 2 by the rule in `kit/07-QUALITY-BAR.md`. Frames are added, never removed.

| Frame | Unit | Key | Why |
| --- | --- | --- | --- |

## Look lock

Written at the end of Phase 3: every locked setting, each technique that worked and each that did not.

Not reached yet.

## Decisions made by the Builder

One line each: the date, the phase, the decision and why.

- 2026-11-21 · Phase 0 · The clock was started at the task start (00:51:51 UTC) with `--start --at`, not at the minute the script first ran, so the reading time before the clock existed is counted as working time.
- 2026-11-21 · Phase 0 · Harness scripts are TypeScript run with `tsx`, so they import `src/config.ts` and the timeline directly and no number is typed twice.
- 2026-11-21 · Phase 0 · `.npmrc` sets `legacy-peer-deps=true`: `npm install` crashed inside its peer dependency resolver (`Cannot read properties of null (reading 'edgesOut')`) on the current test runner's peer list. With the flag the same pinned versions install cleanly.
- 2026-11-21 · Phase 0 · Added two helper commands that the kit does not list: `npm run push` (fetch, merge, commit with the trailer, push, log the push) and `npm run inline` (pack any picture for the inline display).
- 2026-11-21 · Phase 0 · MP4 muxing for Export uses `mp4-muxer` pinned at its last release. Its author now points to a larger successor library. The small one does exactly what Export needs and its interface is known, so it is the lower risk.

## Notes from Brandon

Anything Brandon wrote in the task thread, in his words, with the time and what was done about it.

None yet.

## Declined issues

One entry per severe or major issue that was declined: the round, the critic and its words, and which approved image, which settled difference or which of Brandon's choices it went against.

None yet.

## Open items

One entry per issue left open by a limit: the unit, the frame, the critic and its words, what was tried, what to try next. Parts finished with a fallback are listed here too, marked `fallback`. Issues carried from the blockout are marked with the phase that will settle them.

None yet.

## Running jobs

One entry per long job while it runs: the command, the frame range, the log file, the VM, when it started and the time the render budget says it should take.

None.

## Running agents

One entry per supporting agent while it runs: its name, the folder it owns, its branch, its brief in one line, when it started, and its limit or the time of its last push.

None.

## Rounds

One entry per round, written and pushed when the round starts: number, phase, unit, the commit it judges, and whether it is a floor round or an extra round. Each part is ticked off as it finishes: checks, measures, pack, each critic, fixes. Scores and what changes next are added when it ends.

None yet.

## Final scores

Written by the record round in Phase 6.

Not reached yet.

## QA results

One line per item of `kit/09-QA-GAUNTLET.md`: the number, pass or fail, and the evidence.

Not reached yet.

## Failed QA items

None.

## Last report block

The last `BUDGET REPORT` or `BUILD COMPLETE` block, word for word as it was posted, so a later task can print it again.

None yet.

## Push log

One line per push: the date, the commit and what it carried. A failed push is logged here too.
- 2026-11-21 01:00 UTC · Phase 0: package, clock, look log, status tool, inline display proof, status 01

## Session log

One entry per task: when it started, the prompt it was started with, what it did, where it stopped. Every status is also written here as two lines, in case the thread did not show it.

### Task 1 · started 2026-11-21 00:51:51 UTC

- Prompt: `BUILD MODE.` (the build prompt from `kit/10-KICKOFF.md`, run 2).
- Stop condition 1 checked at 00:53 UTC: `references/approved/MANIFEST.sha256` exists, all eight key images exist, all eight hashes match. Not blocked.
- Fetched and merged `main` at `593fb73`. No addenda. Read `AGENTS.md` and the kit in its reading order. "Build" was `not started`, so the build starts at Phase 0, step 1.
- Status 01, 2026-11-21 01:00 UTC, Phase 0. The build has started: kit read, clock running, first push done. The inline display is proven with the approved contact sheet. Next: measure the workspace, scaffold the app, render a spike scene. Time used: 0.1 h of 30 h.
  Pictures: The eight approved images, in film order.

