---
title: In the slow tier, expect(run()).rejects makes each Playwright call wait about
  a second
tags: [flaky]
---
#### Why

The slow tier's two budget failures, capture-and-cleanup (task 04) and the
empty finalized video, both wrap `run()` in `await expect(...).rejects`.
Wrapped that way, Playwright's calls finish on a one-second grid instead of
when Chromium answers. Measured on 2026-10-29 at proof `1116e73`, Bun 1.4.4,
Playwright's installed Chromium, load 2–3, `DEBUG=pw:api`, one test per file
(supervisor of nzila run `01M63897Q6644A7HFBTN2B7N5J`, proof:05):

| test | `expect(run()).rejects` | `await run()` then `expect` |
| --- | --- | --- |
| empty finalized video | 44.8 s, median call 932 ms, 20 of 37 calls ≥ 800 ms | 17.5 s, median 9 ms, 5 of 35 |
| capture and cleanup (both modes) | 28.3 s, median 763 ms, 15 of 30 | 13.7 s, median 14 ms, 6 of 26 |

In the slow runs even calls that do no work (`newContext`, `newPage`,
`clock.setFixedTime`) took 0.8–1.0 s, and they finished at x.110, x+1.111,
x+2.111: something wakes the loop each second and Chromium's replies wait
for it. The same calls through `run()` from a plain script, or from a
`bun test` file that awaits `run()`, take 4–60 ms. With system Chrome on top
(its close takes 5–25 s), both tests go past 60 s; that was half of proof:05's
gate failure.

A bare probe, a `cat` echo over fd 3/4 inside `expect(...).rejects`, slowed
only from 7 ms to 23 ms for 10 round trips. So the trigger needs more than a
pipe; it is not reduced yet.

#### Settled decisions

- The tests keep their assertions: each run still rejects, and the same
  facts about the manifest and the app's close are checked. Settle the
  promise first (`run(...).then(() => undefined, (cause) => cause)`) and
  assert on what it settled to.
- No budget grows and no retries are added.

#### What to build

1. Rewrite every `expect(run(...)).rejects` / `.resolves` in
   `test/runner.slow.test.ts` that launches a browser to settle first and
   assert after. The ones at `1116e73`: "app errors mentioning a display",
   "capture and cleanup failures", "an empty finalized video", "a renderer
   failure". The configuration test's `.rejects` never launches a browser;
   leave it unless it measures slow too.
2. Reduce the trigger to a small reproduction without proof if you can, and
   say in the report whether it is Bun's (with the reproduction, for an
   upstream report) or Playwright's.
3. A short comment where the pattern is first used, saying why the tier
   does not use `.rejects` over a run.

#### Tests first

Measure each of the four tests alone, before and after, with
`DEBUG=pw:api`: the test's duration, the median Playwright call, and the
number of calls over 800 ms.

#### Done when

- `bun test test/runner.slow.test.ts --timeout 60000 -t "capture and cleanup failures|empty finalized video" --rerun-each 3`
  passes, and the report gives each run's duration and the measurements
  above, before and after.

#### Out of scope

- Task 04's remaining budget, if any is left after this; re-measure it here
  and report.
- The paused-clock watchdog (task 07).
