---
title: The paused-clock test's watchdog also times the browser's close
tags: [flaky]
---
#### Why

"a paused application clock cannot hang capture or prevent cleanup" fails
with "capture hung on the application clock" when capture did not hang. Its
5 s watchdog races the whole `run()`, browser close included. In proof:05's
do#2 trace at `7a57f9c` (nzila attempt `01M63DR62ETMHGXQ35PRA9F9XC`, its
`diagnosis/head.log`), the clock paused at 22.772, the screenshot was done at
22.797, the context closed at 22.887, and the system Chrome's graceful close
ran from 22.888 to 28.070: the watchdog fired in the close. The base
`1116e73` showed the same pattern, and main's tier failed this test the same
way at load 3 on 2026-10-29. It recurred, as task 04's out-of-scope asked to
watch for.

Since `ae8a22b` the tier runs on Playwright's Chromium, whose close is quick,
so the test passes. But proof:05 bounds the close at 30 s by default
(`closeTimeout`), and any close slower than about 5 s fails this test again.

#### Settled decisions

- The test keeps proving both claims: a paused clock cannot hang capture,
  and cleanup still runs (the app's `close` is called).
- The watchdog covers capture only: from the pause until the app's `close`
  is called (capture is over by then). The test's own timeout covers the
  rest of the run.

#### What to build

Make the watchdog end when capture ends, not when `run()` settles, then
await the run and check its outcome and the close.

#### Tests first

Show the false positive first: with a browser whose close is held for 6 s
(a wrapped `close`, as the unkillable mode in `test/command.ts` does), the
current test fails with "capture hung on the application clock". After the
change it passes, and it still fails when capture really hangs (for
example, an action that waits on a paused-clock timer, or a short
`timeout`).

#### Done when

- `bun test test/runner.slow.test.ts --timeout 60000 -t "paused application clock" --rerun-each 5`
  passes.

#### Out of scope

- The browser's release itself (proof:05).
