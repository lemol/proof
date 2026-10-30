---
title: run() hangs after the last scenario under load and never writes the manifest
tags: [flaky]
completed_at: 2026-10-30T03:02:50Z
outcome: completed
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

## Comments

### @nzila at 2026-10-30 03:02:50 +00:00

Done: Implemented and committed on the assigned branch, clean at 7a57f9c.
Commits: bf42445 process control/bounded release; bcfb600 closeTimeout/PID; 4e7e6fd runner wiring/regressions; 0068715 docs; 7a57f9c conditional handle disposal.

Cause and proof
Reproduced 5/20 base hangs under load, each with 14 screenshots but no manifest. Chrome descendants retained inherited stdout/stderr: not evidence of Bun losing EOF. Base run1 Chrome47697 logged graceful close07:29:03, fallback kill07:29:33, ESRCH; no Chrome child remained. lsof snapshot showed Bun47623 fd6/fd8 sockets with peers in chrome_crashpad_handler47700 and GoogleUpdater48037/48042/48043/48046. The descendant-held pipe prevents Node/Bun ChildProcess `close`, even after process exit. Playwright1.59 awaits that event in both graceful and kill paths.
Rerunnable evidence (paths relative to this attempt):
- rg '39490af8abb98564|63e86427d18ed305|5fdfac444442f4b0|8a7f6f304c5ad5b3' kit/base/1/snapshot shows both socket ends and owners.
- PW=/Users/lemol/Labs/lemolsoft/lemol-workspace/node_modules/.bun/playwright-core@1.59.0/node_modules/playwright-core; rg -n 'once\("close"|waitForCleanup|detached:' "$PW/lib/server/utils/processLauncher.js" shows detached launch112, close listener155 and both release paths waiting178/184/226. rg -n 'closeOrKill|DEFAULT_PLAYWRIGHT_TIMEOUT|await kill' "$PW/lib/server/browserType.js" shows timeout then await kill; rg 'DEFAULT_PLAYWRIGHT_TIMEOUT =' "$PW/lib/utils/isomorphic/time.js" gives3e4.

Implementation
closeTimeout defaults30s, independent of capture timeout. At deadline, a gone browser is released; a live one receives SIGKILL (Unix group, PID fallback), then has another bound to exit. Unknown PID, refused kill or surviving process rejects at browser cleanup, without manifest. Close rejection remains a failure. No scenario retries/healing, manifest changes or dependency changes.
Conditional Task7 was necessary: first bounded batch published manifests but7 commands remained alive. Disposing handles by looking up the dispatcher at deadline still left2 commands alive in the next batch. Playwright disposes that dispatcher on CDP disconnect. Ruling: eagerly capture a disposer while connected and invoke it only after OS-confirmed exit. It destroys local stdio and unreferences the child, without killing surviving crashpad/updater processes. README names this best-effort internal dependency and possible leftover profiles.
Evidence for eager capture: rg -n 'toImpl|_dispatcherByGuid' "$PW/lib/inProcessFactory.js" shows lookup into the current dispatcher map48–54; browserDispatcher.js Disconnected calls _didClose/_dispose. More importantly, deterministic graceful-close regression with an inherited-stdio sleep holder passed16.46s with eager capture; deferring that same lookup failed25.02s, exit137. Restoring eager capture passed. This replaces the plan's speculative Bun EOF explanation with observed descendant inheritance and refines its conditional disposer interface.

Test-first and verification
- Exited-process/never-resolving-close run test timed out20,000ms on unchanged runner before wiring; now passes and publishes manifest.
- Release/process unit tests initially failed absent modules; config test initially expected30000/receivedundefined. New inherited-stdio command regression initially failed10s/exit137; graceful variant negative control failed25s/exit137. All green after fixes.
- Final `bun run lint`: pass. Final `bun run typecheck`: pass, separately.
- `bun test src/runner/config.test.ts src/runner/browser.test.ts src/runner/process.test.ts src/runner/release.test.ts`:22 pass,0 fail.
- With PROOF_TEST_BROWSER set to installed chromium-1217 and TMPDIR inside attempt: `bun test test/runner.slow.test.ts --timeout 60000 -t 'capture and cleanup failures|project commands produce|close never settles|close bound|cannot be killed|inherited browser stdio'`:6 pass,0 fail,85.08s. Includes exited, killed, unkillable, inherited-stdio, existing cleanup and command0/1/3 coverage.
- Search selecting affected tests: `rg -n 'browser cleanup|browser\.close|closeTimeout|runner/process|browserHandleDisposer' src test`. Only affected config/browser/process/release units and runner.slow/command harness selected. Fixture read, unchanged.
- `git diff --check 1116e73..HEAD`: pass; worktree clean. Self-review of production modules and complete diff (no subagent tool); no further blocking findings.

All observed failures disclosed
Besides intentional REDs, lint found blank-line violations (fixed), nested scratch caused duplicate oxlint plugin (scratch removed), and the unavailable-browser command fake lacked the new export (fixed). Existing capture/cleanup test timed out60s on several focused runs, including once with installed Chromium. Both merge-base comparisons passed (system browser33.74s, installed20.98s), so I do NOT label the timeout pre-existing/unrelated. Isolated current rerun passed26.10s; final combined rerun passed57.18s. Its budget was explicitly out of scope and unchanged. One intermediate loaded kit run rejected screenshot Timeout10000ms (bound batch19, one screenshot); did not alter the out-of-scope capture timeout. Final batch below has no such failures.

Loaded kit verification
Read-only xonton checkout022b1e8947f99bdd1a7472f0aba9ee4da41d1c62. Used plan's kit-run.ts wrapper importing this worktree's run and xonton's unmodified launch/scenarios/FIXED_NOW, with proof/run.ts args copied verbatim; cwd xonton. IDs browse/open-task, changes/post-review, review/phone, turn/answer. PROOF_DIR/TMPDIR under attempt. Two at a time,16 owned yes workers,240s cutoff. Workers stopped in finally. No sibling checkout or shared install edits.
Final results: EVERY run exit0,14 screenshots,manifest.json. Load is 1-minute start→end:
run | seconds | load
1 |52.10|16.21→30.77
2 |52.73|16.21→29.74
3 |22.45|29.74→30.33
4 |28.23|29.74→29.26
5 |30.90|29.26→29.77
6 |51.87|29.26→26.64
7 |53.97|26.64→28.91
8 |54.37|26.64→31.64
9 |56.04|31.64→46.48
10|55.61|31.64→46.48
11|37.93|46.48→63.35
12|37.93|46.48→63.35
13|34.00|63.35→65.02
14|34.41|63.35→65.02
15|25.62|65.02→69.55
16|31.80|65.02→62.98
17|32.60|62.98→58.74
18|24.55|62.98→61.76
19|55.29|58.74→45.31
20|54.02|58.74→45.31
Raw logs/artifacts/scripts: /Users/lemol/.nzila/attempts/01M638W80FRD4YRSYRWZE8NVKH/kit/; final table kit/verified/results.json (proof.load-results artifact). Base, bounded and final directories preserve earlier unsuccessful batches as evidence. Full gates intentionally delegated per gaps. No task-list changes, browser downloads or shared-install instrumentation.

Review: approved (4/5)
Approved. Review of the whole diff 7a4b089...8d09a34 (5 commits, 14 files, +554/-5).

Check stage: check.command `bun run check:all` passed at 8d09a347ea65afef799e9afb7a33356bdf366bf0 (gate log 01M65B7QW9ABEKM40S94JTBWG4/output.log: 51 unit pass, 13 slow pass, 48.85 s, load1 11.9). The landGate is the same command, and the land runs it again.
Linter: oxlint "Found 0 warnings and 0 errors" at HEAD (same gate log). I did not run the base linter separately; with N=0 there can be no increment.

Comments: the task file todo/05-run-hangs-after-the-last-scenario-under-load-and-never.md has no Comments section (`rg -n 'Comments|comment'` exited 1). The brief has no "Pre-start task comments" section. That makes 0 comments and 0 authors.
nzila's own commits: there are none on the branch. All 5 commits (3314cca, ed23b03, c963258, 9cdb9ed, 8d09a34) are the implementer's and follow conventional commit form.

What to build:
1. Diagnosis: done. Covered in the do#1 report: Chrome descendants (crashpad_handler, GoogleUpdater) inherit Chrome's stdio and keep it open, so the ChildProcess `close` event never fires. I re-ran the Playwright 1.59 claims. processLauncher.js:155 has `spawnedProcess.once("close"`; lines 178, 184 and 226 await waitForCleanup; browserType.js closeOrKill at line 233 awaits kill at line 241; detached at processLauncher.js:112. All confirmed. The spec sentence "Playwright 1.59 waits for the child's close event ... even in its kill fallback" matches the source.
2. Bounded release: done. src/runner/release.ts `releaseBrowser` handles closed / exited / killed, and rejects on unknown pid, a refused kill, or a process that survives a second bound. src/runner/process.ts kills the process group, falling back to the pid on ESRCH. index.ts wires it in and calls the disposer only when the result is not "closed". The disposer is captured eagerly through toImpl in browser.ts `browserHandleDisposer`. The settled decisions all hold in code: a gone browser counts as released, a live one is killed and then released, an unkillable one fails at "browser cleanup", and a close rejection still rejects.
3. README: done. "### Releasing the browser" and the `closeTimeout` options row. docs/specs/proof-runner.md is updated too.

Tests first:
- Close never resolves and the process has exited: pinned by "a browser whose close never settles after it exited still publishes the manifest" (runner.slow). Known-bad, observed by me: with base src/runner/index.ts in a scratch worktree it timed out at 20000 ms. It fails if the manifest is missing, if release happens before 1900 ms, or if it takes 5000 ms or more.
- Alive past the bound, killed, manifest published: pinned by "a browser still alive past the close bound is killed and the manifest published". On the base runner it timed out at 60002 ms (observed). Without a kill, `gone(pid)` stays false.
- Cannot be killed, rejects at browser cleanup: pinned by "a browser that cannot be killed rejects at browser cleanup without a manifest". It uses command.ts "unkillable" mode, which mocks runner/process, and asserts "browser cleanup", "is still running 1000 ms after SIGKILL" and that no manifest exists. Unit tests in release.test.ts cover the refused kill and the unknown pid.
- Reversals done in the scratch worktree:
  - config.ts ignoring options.closeTimeout makes "bounds the browser release at 30 seconds by default" fail (Expected 2000, Received 30000).
  - Removing the dropHandles call makes "inherited browser stdio cannot keep the proof command alive after release" fail (Expected 0, Received 137, after 25021 ms).
  - At HEAD the 4 new slow tests passed: 4 pass in 24.46 s.
- Colocation holds: process.test.ts and release.test.ts sit beside their modules, and the browserHandleDisposer test is in browser.test.ts.

Done when, xonton 20 runs: the implementer ran it through a wrapper, kit-run.ts. The reason given is that xonton's @lemol/proof links to the main checkout, not this worktree. I accept that: xonton's current proof/run.ts passes the same launch, scenarios, fixedTime and 8 args. In their verified batch, all 20 runs exited 0 with a manifest. The Playwright logs show the cut-short path really ran: for example, run 1 has gracefully close start at 08:33:09.876 and process did exit at 08:33:39.879, exactly 30 s later.

Review check, my own rerun: xonton at 227757bc, the wrapper importing this worktree, two runs at a time, 16 and then 6 `yes` workers, and other machine load from xonton jobs. Each row is run: seconds, 1-minute load at start→end, outcome.
1: 84.48 s, 19.9→72.7, manifest
2: 78.36 s, 19.9→64.9, manifest
3: 67.65 s, 72.7→123.0, manifest
4: 66.79 s, 72.7→123.0, manifest
5: 74.66 s, 123.0→180.3, exit 1, no manifest
6: 86.18 s, 123.0→188.4, exit 1, no manifest
7: 57.87 s, 167.6→141.8, manifest
8: 53.29 s, 167.6→148.3, manifest
9: 38.08 s, 141.8→119.7, manifest
10: 37.45 s, 141.8→119.7, manifest
11: 32.13 s, 119.7→113.9, manifest
12: 31.49 s, 119.7→113.9, manifest
None hung; the cutoff was 150 s.
- Runs 1 and 2 took the cut-short path (close start 02:52:44.676 → close event 02:53:14.681). The base runner would have hung there.
- Runs 5 and 6 rejected promptly with "scenario turn/answer: screenshot: Timeout 10000ms exceeded" at load 120–188. That is the task's out-of-scope screenshot-timeout item, and the run rejected rather than hung, which the settled decision allows ("publishes the manifest or rejects"). Their browser close settled in 11 s and 27 s.
- So 10 of 12 runs wrote a manifest, and the 2 that did not are capture failures, not shutdown hangs.
- Logs: $NZILA_HOME/attempts/01M65BC5YX05J6ZJ7MZ4B66J98/kit/review/.

Occurrences of the new value: `rg 'browser\.close\(\)|closeTimeout|30000|30_000|30 s\b|toImpl'`.
- Live and consistent: README.md:109 and :147 (30000), spec :104 (30000 ms), config.ts:91, config.test.ts:97, todo/07:19 ("30 s by default"), and the commit subject ed23b03 ("default 30 s").
- "verified on 1.59" matches package.json playwright 1.59.0.
- todo/05:22, 23 and 48 quote the base code as history.
- No stale text found.

Trace: RunOptions.closeTimeout (types.ts:38) → configure (config.ts:91, Positive) → index.ts:79 releaseBrowser. The producer is the public run() option. The xonton kit relies on the default.

Non-blocking notes:
(a) PID reuse. Liveness is `kill(pid,0)` on a CDP-reported pid. If Chrome exits and its pid is reused before the deadline, proof could SIGKILL an unrelated process or group. That is unlikely, because the pid space is sequential. The ChildProcess the disposer already captures has `exitCode`/`signalCode`, which would be a stronger exited check.
(b) An unavailable pid now fails earlier, at a new "browser process" stage before the app launches. The README only names the "browser cleanup" consequence.
(c) If the toImpl internals change in a future Playwright (the peer range is >=1.59 <2), the manifest is still written, but inherited pipes could keep the command from exiting. The README states this as best-effort.

Branch: nzila/01M63897Q6644A7HFBTN2B7N5J

nzila run 01M63897Q6644A7HFBTN2B7N5J
