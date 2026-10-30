---
title: The capture-and-cleanup slow test times out in the full slow tier
tags: [flaky]
---
#### Why

`bun run check:all` is the landGate, and it runs `test/runner.slow.test.ts`.
On 2026-10-25 "capture and cleanup failures reject without publishing a
completed manifest" timed out at its 60 s budget in three full runs of
`bun run test:slow`: once at fba9487 (the only failure, 8 pass, load averages
23–28) and twice at 7894647, whose change leaves a launch without `args` as
it was (load averages 25–54). It passed alone every time: with the
paused-clock test at fba9487 and at 7894647 (2 tests in 35–37 s), and by itself
at 7894647 in 41 s at load averages 66–93. So it uses most of its budget even
alone, and the tests before it in the file push it over. A landGate that fails
at random blocks lands and trains people to re-run it.

#### Settled decisions

- `bun run check` stays the gate and `bun run check:all` the landGate.
- The test keeps proving both modes: a capture failure (the action closes the
  page) and a cleanup failure (the app's `close` throws) each reject, close
  the app, and leave no `manifest.json`. Do not drop a mode, loosen an
  assertion, or add retries.
- proof never retries or heals a scenario (AGENTS.md). If the time goes to the
  runner waiting on something it could know is gone (a closed page or
  context, waited on for the 10 s default `timeout`), fix the runner, not the
  test.

#### What to build

Find where the test's time goes, mode by mode: browser launch, the action,
the failure screenshot on a closed page, context and browser cleanup, the
app's close. Then remove the wait that should not be there, or, if every step
is legitimate, say why and give the test a budget its measured worst case
fits in.

#### Tests first

Measure each mode's duration alone and under load, and reproduce the timeout
in the full file under load, before you change anything.

#### Done when

- `bun test test/runner.slow.test.ts --timeout 60000 -t "capture and cleanup failures" --rerun-each 5`
  passes under the load that made it fail before, and the report gives each
  run's duration against the budget.
- If the runner changed, the README still describes what it does on a failed
  capture and a failed cleanup.

#### Review check

The reviewer runs `bun run test:slow` once under load and this test passes.

#### Out of scope

- Task 02's video-frame check.
- "a paused application clock cannot hang capture or prevent cleanup", which
  failed once in a full run at a load average of about 54 ("capture hung on the
  application clock") and passed alone; file it on its own if it recurs.

## Comments

### @claude-dogfood at 2026-10-30 02:45:04 +00:00

After `0e8ba62` (task 06) this test takes 1.34 s alone (23.33 s before) and the
slow tier 52 s. `-t "capture and cleanup failures|empty finalized video"
--rerun-each 3` passed at load 38-57. Rerun this task's Done-when under load
before working on it; it may only need closing.

### @claude-dogfood at 2026-10-30 02:39:31 +00:00

Probable cause, measured 2026-10-29 (task 06): this test asserts with
`await expect(run(...)).rejects.toThrow()`, and wrapped that way each
Playwright call waits about a second. Alone on Playwright's Chromium at
load 2–3 it took 28.3 s that way and 13.7 s with the run awaited first.
Since `ae8a22b` the tier no longer runs on system Chrome, whose 5–25 s
closes pushed it past 60 s. Do 06 first, then re-measure what is left here
before changing the runner.
