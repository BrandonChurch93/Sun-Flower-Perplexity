# Progress

The Builder's memory. Read this first in every task. Update it before every commit.

## Status

- Build: not started
- Current phase: none
- Current unit: none
- Current round: none
- Blocked: no
- Budget: running
- Continuations: 0
- Extensions: 0
- App URL: not published yet
- Last push: none
- Last status: none

"Build" is one of `not started`, `in progress` or `complete`. "Budget" is one of `running` or `reported`. `AGENTS.md` says what each means.

## Latest pictures

Newest first. Each line names the pictures of one status in `out/stills/status/`, with the time and the caption, so this page shows where the film is.

None yet.

## Clock

Copied from the output of `npm run clock` at every status. Working time only.

| Phase | Planned box | Time used |
| --- | --- | --- |
| 0 | `budget.phaseHours.0` | |
| 1 | `budget.phaseHours.1` | |
| 2 | `budget.phaseHours.2` | |
| 3 | `budget.phaseHours.3` | |
| 4 | `budget.phaseHours.4` | |
| 5 | `budget.phaseHours.5` | |
| 6 | `budget.phaseHours.6` | |
| Whole build | `budget.runHours` | |

## Phases

| Phase | State | Gate evidence | Commit |
| --- | --- | --- | --- |
| 0 · Ground truth | not started | | |
| 1 · Rough cut | not started | | |
| 2 · Engine and blockout | not started | | |
| 3 · The look lock | not started | | |
| 4 · The other units | not started | | |
| 5 · The whole film | not started | | |
| 6 · Polish and deliver | not started | | |

State is one of `not started`, `in progress` or `done`.

## Units

State is one of `not started`, `stand-in`, `in progress` or `finished`. A finished unit names the commit it was finished on and what ended its loop: `passed`, `round limit`, `clock` or `budget`.

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

Not recorded yet.

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

None yet.

## Notes from Brandon

Anything Brandon wrote in the task thread, in his words, with the time and what was done about it.

None yet.

## Declined issues

One entry per severe or major issue that was declined: the round, the critic and its words, and which approved image or which of Brandon's choices it went against.

None yet.

## Open items

One entry per issue left open by a limit: the unit, the frame, the critic and its words, what was tried, what to try next. Parts finished with a fallback are listed here too, marked `fallback`. Issues carried from the blockout are marked with the phase that will settle them.

None yet.

## Running jobs

One entry per long job while it runs: the command, the frame range, the log file, the VM, when it started and the time the render budget says it should take.

None.

## Rounds

One line per round, written when the round starts: number, phase, unit, and whether it is a floor round or an extra round. Scores and what changes next are added when it ends.

None yet.

## Final scores

Written by the record round in Phase 6.

Not reached yet.

## QA results

One line per item of `kit/09-QA-GAUNTLET.md`: the number, pass or fail, and the evidence.

Not reached yet.

## Failed QA items

None.

## Push log

One line per push: the date, the commit and what it carried. A failed push is logged here too.

None yet.

## Session log

One entry per task: when it started, the prompt it was started with, what it did, where it stopped. Every status is also written here as two lines, in case the thread did not show it.

None yet.
