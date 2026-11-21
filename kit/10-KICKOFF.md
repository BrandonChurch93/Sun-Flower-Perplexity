# 10 · Kickoff

For Brandon. The Builder does not act on this file.

There are two runs. The first makes eight pictures so you can see what the film will look like. The second builds the film, and only starts once you have approved the pictures.

## Run 1 · The reference images

1. In Computer, check that the GitHub plugin is still connected.
2. Start a new Computer task on your highest effort setting with Multiagent on.
3. Paste this prompt.

```
REFERENCE RUN.

Repo: https://github.com/BrandonChurch93/Sun-Flower-Perplexity

Clone the repo and read references/BRIEF.md. Do exactly what it says: make the eight reference images for the film and nothing else. This is not a build task. AGENTS.md and everything under kit/ do not apply to it.

Do not ask questions. Make the calls yourself and log them.

Show me every finished shot here in the thread as soon as it is done, displayed inline so I can see it without downloading a file. Do not wait for the whole set.

When every shot has its takes or its limit, or the time limit in the brief is up, push what exists and end with: REFERENCES READY
```

4. When it ends with `REFERENCES READY`, tell the planning chat. The images are pulled from the repo there and looked at with you.

## Between the runs · Approval

Done. You approved all eight on 2026-11-20, as the reference run chose them. They are in `references/approved/`, and the `README.md` in that folder lists the take each one came from. The build refuses to start without them.

Two things were settled with the approval:

- The pictures frame the plant closer than the plan did from the night onward. The pictures win, so the camera path in the config was measured again from them. In the frost the camera now drifts in toward the bud instead of only backing away.
- The two bloom close-ups have the leaves of a second sunflower at their left edge, and the wide field picture shows your flower standing alone. The film keeps the second sunflower, so it also stands a short step from yours in the last shot. This is recorded as a settled difference, so the critics do not ask for the picture on that point.

## Run 2 · The build

1. Start a new Computer task on your highest effort setting with Multiagent on.
2. Paste this prompt.

```
BUILD MODE.

Repo: https://github.com/BrandonChurch93/Sun-Flower-Perplexity

Clone the repo. Read AGENTS.md, then kit/00-README.md, then the kit in its reading order. Build the whole film from the kit: work every phase in kit/08-BUILD-ORDER.md in order, close every gate by passing it or by reaching its limit, run the critic rounds inside their limits and the clock, and log everything in kit/PROGRESS.md.

Run this as one continuous task. Do not ask me questions. Decide, log the decision and continue. Stop only at the budget report, BUILD COMPLETE or a blocker as AGENTS.md defines one.

Show your work as you go, as AGENTS.md says: statuses with pictures displayed inline in this thread at the rhythm it sets, so I can watch the film change without downloading anything. If I write in this thread, apply it and carry on.

Use supporting agents wherever the kit calls for them. Do not lower the bar to finish sooner.
```

## What you will see, in order

1. A first status showing your eight approved images, proving pictures show up inline.
2. A link to the app, and a review page at the same address under `review.html`. Everything the build shows you also plays there.
3. A status with pictures at least every half hour, and one at the end of every round and every finished unit. Each has a few lines on what changed and what is next, and the time used so far.
4. The rough cut: the whole minute made from your approved stills, so you can judge the pacing. The build does not wait for you.
5. The blockout: the whole film playing with placeholder shapes.
6. The bloom, finished first. Then the other five parts, each with a side by side against its approved image.
7. `BUILD COMPLETE`, or `BUDGET REPORT` if the time you allowed runs out first.

## Steering while it runs

- If a status shows something going the wrong way, say so in the Computer thread in plain words. The Builder applies it and carries on.
- For anything bigger, bring it to the planning chat. It goes into the repo as a numbered addendum, and the build picks it up at its next phase or its next push.
- If you want the film to differ from one of your approved pictures on purpose, bring that to the planning chat too. It is added as a settled difference, so the critics stop asking for the picture on that point.

## The limits you chose

| What | Value | Config key |
| --- | --- | --- |
| The most the build may run before it reports to you | 30 hours | `budget.runHours` |
| Extra time each time you say continue | 10 hours | `budget.continueHours` |
| Longest gap between statuses | 30 minutes | `budget.statusMaxGapMinutes` |
| Pictures per status | up to 4 | `status.maxPictures` |
| Rounds on the bloom | up to 4 | `quality.lookLockMaxRounds` |
| Rounds on each other part | up to 3 | `quality.maxRoundsPerUnit` |
| The score a part needs to pass | 9 out of 10 | `quality.passScore` |

- The time counted is working time. Time when no task is running is not counted.
- There is no review stop in this build. It runs start to finish and you steer from the statuses.

## If the build reports at the budget

`BUDGET REPORT` lists what is done, what is left and what the film looks like now. To carry on, start a new task with:

```
BUILD MODE.

Continue past the budget.

Clone https://github.com/BrandonChurch93/Sun-Flower-Perplexity and continue from kit/PROGRESS.md. Read AGENTS.md and kit/addenda/ first. Same rules.
```

## If a task ends early for any other reason

```
BUILD MODE.

Clone https://github.com/BrandonChurch93/Sun-Flower-Perplexity and continue from kit/PROGRESS.md. Read AGENTS.md and kit/addenda/ first. Same rules.
```

## To ask for a status at any time

```
Post a status now: the phase, the unit and the round, what changed, what is next, the time used, and the current pictures shown inline. Do not stop working.
```

## After BUILD COMPLETE

1. Open the Export link in Chrome on a computer with a real GPU. The page first shows one frame from your machine beside the frame the critics judged. If they match, pick the whole film and start. Keep the tab open and visible until the file downloads.
2. Export any single part the same way for a short clip.
3. For a screen recording, use the "Watch it" link. To play with it yourself, use the "Play with it" link: drag to orbit, scrub the timeline to grow the plant, press `M` for the menu.
4. Add sound in your editor, using `cut/CUES.md` for timing. Every cut lands on a bar line at 120 beats per minute.
5. X loops videos shorter than 60 seconds. This film is exactly 60, so trim a few frames from the end if you want it to loop.

## If you want more polish after it completes

Each of these buys one more bounded polish pass on the open items.

```
BUILD MODE.

Extension.

Clone https://github.com/BrandonChurch93/Sun-Flower-Perplexity. Read AGENTS.md, kit/PROGRESS.md and kit/addenda/. Run one extension as AGENTS.md and kit/08-BUILD-ORDER.md define it, and end with the BUILD COMPLETE block again.
```

## Review

- Bring stills, clips or your export back to the planning chat with what you dislike.
- Changes come back as a short fix prompt, or as a numbered file in `kit/addenda/` for anything larger.
