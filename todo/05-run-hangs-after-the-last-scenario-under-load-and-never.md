---
title: run() hangs after the last scenario under load and never writes the manifest
tags: [flaky]
---
#### Why

A run whose scenarios all finished can hang during shutdown and never
publish `manifest.json`. Found in xonton:258's review-fix#4 (nzila attempt
`01M5T72GWZ62J7KY7QCNMYCFTF`, xonton commit `9519759d`, proof at `7894647`):

- `bun proof/run.ts` in xonton hung after the last scenario in 9 of 28 runs at
  load averages 15–125, two kits in parallel. It also hung in 2 of 6 runs
  without that commit's change. Each hung run had written all 14 screenshots
  and the traces, but no manifest. The batch script and its output are
  `ab.sh` and `ab.out` in that attempt's directory: complete runs took
  19–52 s, and hung runs were killed at 240 s (exit 124).
- With the kit's `close` instrumented, all four runs that hung logged that the
  app's server stop, dispose and assets close had returned. One hung process
  was caught live (pid 30457): no Chrome child left, one unix socket open, and
  an idle event loop (`sample`: `kevent64` / `__ulock_wait`).
- `src/runner/index.ts` releases the app, then the browser
  (`release("browser cleanup", () => browser.close())`), and writes the
  manifest after both. So the stall is in `browser.close()` or just after it.
  Chromium is the system `/Applications/Google Chrome.app`.
- At load averages 2–6 on 8 cores, the same kit at the same commit gave 0 hangs
  in 13 runs, one at a time (11–14 s each; supervisor rerun on 2026-10-25). So
  the hang depends on load or on parallel runs.
- What a hang costs: nzila runs the proof command under `prove.timeoutMs`
  (default 1,800,000 ms). A hang becomes "the proof command did not finish
  within … ms" after that wait: a plain check failure with no proof attached.

#### Settled decisions

- A run never hangs on shutdown. Once capture is over, it either publishes the
  manifest or rejects, and both happen within a bounded time.
- The fix is the helper's. The project's `close` returned in every hung run,
  so a kit cannot work around it.
- proof never retries or heals a scenario (AGENTS.md). This is about releasing
  the browser, not about capture.
- The README's contract stays: a cleanup failure rejects and publishes no
  completed manifest. A browser that is gone when its close is cut short is
  released, not a failure. A browser process still alive after the bound is
  killed. If it then exits, it is released; if it cannot be killed, it is a
  cleanup failure.

#### What to build

1. Find why `browser.close()` does not resolve once Chromium has exited, under
   Bun and Playwright's launch transport. Say in the report what you found and
   how you proved it.
2. If the cause is in proof, fix it. If it is outside proof, or cannot be fixed
   there, bound the browser's release: after a deadline, check the browser
   process. Count it released if it has exited; otherwise kill it and count it
   released once it exits. Then go on to the manifest.
3. The README says how a run releases the browser and what happens when that
   release is cut short.

#### Tests first

- A browser whose close never resolves while its process has exited: `run()`
  still publishes the manifest and returns its outcome, within the bound.
- A browser whose process is still alive past the bound: it is killed. The run
  publishes the manifest once the process has exited, and rejects with a
  `browser cleanup` stage when it cannot be killed.
- Get the first test to fail (hang) on the current runner before you change
  it. Add a seam for the browser only if the test needs one.

#### Done when

- The tests above pass.
- xonton's kit (`bun proof/run.ts` in `repos/xonton`, with `PROOF_DIR` and
  `PROOF_SCENARIOS` set, two at a time, at a load average above 15) completes
  20 runs, and every one writes `manifest.json`. The report gives each run's
  duration and the load.
- The README describes the release and the bound.

#### Review check

The reviewer reruns xonton's kit under load (two at a time, at least 10 runs)
and none ends without a manifest.

#### Out of scope

- The 10 s default screenshot timeout failing steps above a load of about 60
  (3 of the same 28 runs): file it on its own if it matters.
- Task 04's capture-and-cleanup test budget. Both tasks touch
  `src/runner/index.ts`, so don't run them in parallel.
