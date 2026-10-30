---
title: The capture-and-cleanup slow test times out in the full slow tier
tags: [flaky]
completed_at: 2026-10-30T05:52:10Z
outcome: completed
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

### @nzila at 2026-10-30 05:52:10 +00:00

Done: Implemented proof:04 in commits 460b715 and 1f43def. Only test/runner.slow.test.ts changed (+8/-1): per-mode timing logs and a measured 150 s timeout for the existing two-mode test. Both capture/cleanup modes and rejection, app-closed, no-manifest assertions are unchanged; no retries. Runner, README, gate and landGate unchanged.

Investigation report: investigation.path artifact; raw scripts/logs: timing.logs artifact (this attempt's probe directory). Baseline alone five reruns passed in 2.216, 1.212, 1.368, 1.212, 1.253 s. Before changing the budget, eight-worker CPU pressure reproduced the full-file target timeout: capture=31.015 s, cleanup=31.430 s, >=62.445 s total against 60 s. An initial 32-worker experiment overshot historical load, also reproduced a focused timeout, and its enclosing 600 s tool command expired during the full file; no workers remained afterward.

Stage probes measured launch, action goto/page close, screenshot, renderer, tracing/context/browser release, and app stop. Closed-page screenshot rejects in 0–1 ms, so renderFrame is never reached in capture mode; tracing/context cleanup takes milliseconds and app.stop 0 ms. Browser.close reaches ~30 s per mode. Child-exit probing showed the actual browser remained alive until near close settlement (16.036 s to child exit, 16.050 s to close resolution). Executable confirmed bundled Chromium, args=[]. No known-closed-page timeout to remove. Existing browser-release policy deliberately grants each browser 30 s; two runs exceed a combined 60 s test budget. Ruling: no runner fix, and budget 150 s (>2x observed total), not shortened cleanup. Literal timeout retained instead of shared constant to avoid formatter reindenting the entire test. No empty Task 2 commit.

Done-when command verbatim under eight-worker load:
`bun test test/runner.slow.test.ts --timeout 60000 -t "capture and cleanup failures" --rerun-each 5`
5 pass/0 fail, load 57→84. Whole-test durations against the explicit 150 s per-test budget: 10.909, 13.757, 34.587, 62.777, 4.445 s. Capture/cleanup milliseconds per run: 3202/7628; 8776/4974; 5377/29205; 31593/31173; 3250/1186. Run 4 proves the old 60 s budget insufficient. Bun's per-test timeout overrides the CLI default.

Immediately following `bun run test:slow` under the same workers: target passed in 62.183 s (31041/31128 ms), load 84→104. Full file had the three failures recorded as gaps; failed-action evidence and renderer-failure evidence tests passed. Paused-clock did not recur. Focused command `bun test test/runner.slow.test.ts --timeout 60000 -t 'inherited browser stdio|real proofs repeat|project commands produce'` passed 3/3 on both this diff (40.11 s) and detached merge-base eddfa50 (80.51 s), under eight workers. Therefore no claim that those full-file failures are proven unrelated/pre-existing. Scratch worktree removed.

Final `bun run lint` and `bun run typecheck` passed separately. Initial final lint found formatting, recorded before fixing; formatted only this test file. Final focused target after formatting passed in 2.002 s. Value search: `rg -n 'capture and cleanup failures|proof-timing|150_000|60_000|closeTimeout|config.timeout' src/ test/`; no runner defaults or harness rules changed. Code-claim evidence commands and observed output are in the investigation report. `git diff --check` passed. Self-review performed (no subagent tool): modes/assertions preserved, timeout follows measurement, no production behavior change. No deferred code findings. Shared installs untouched; no scratch links, worktrees or workers remain; owning worktree clean.

Review: approved (4/5)
review#1: approve. Diff is test-only (2 commits, +8/-1 in test/runner.slow.test.ts); no runner, README, gate or landGate change. Both failure modes preserved, no retries, no loosened assertions. Budget 150s follows measured worst case (>2x 62.4s); no illegitimate closed-page wait exists to remove. check.command `bun run check:all` passed at 1f43def (13/13 slow + unit/lint/typecheck, 0 lint warnings). Own focused run passes in 63.9s (old 60s insufficient).

Required cases / Done-when:
- Done-when 1 `bun test test/runner.slow.test.ts --timeout 60000 -t "capture and cleanup failures" --rerun-each 5` under load with per-run durations: DONE. Pinned by existing test `capture and cleanup failures reject without publishing a completed manifest` (test/runner.slow.test.ts:582) as modified: per-mode `proof-timing mode=... ms=... budget=150000` log (:627) + per-test timeout `}, 150_000)` (:633). Evidence: probe/verified-load8.log (do attempt) 5 pass/0 fail at load 57->84, whole-test 10.909/13.757/34.587/62.777/4.445s with capture/cleanup ms 3202/7628, 8776/4974, 5377/29205, 31593/31173, 3250/1186 (run 4 exceeds old 60s). My own run (no synthetic workers, machine load 1-min ~130-200): 1 pass, whole 63.88s, capture 31991ms, cleanup 29666ms — independently confirms old budget insufficient and new budget fits. Diff adds no new assertion over an introduced literal (only timeout + log), so no scratch-reversal applies; existing assertions (toBeInstanceOf(Error), closed true, no manifest.json) unchanged.
- Done-when 2 (README if runner changed): DONE (vacuous). `git diff eddfa50...HEAD -- README.md src/` is empty (output `DIFF-EMPTY-IF-NONE`); README browser-release/cleanup sections (README.md:103,106-121,181) still describe unchanged behavior.
- Review check (full test:slow once under load, target passes): DONE by evidence, with method noted below. Probe verified-load8.log second command: target passed 62.183s (31041/31128ms) at load 84->104 inside a 10 pass/3 fail file; check stage `bun run check:all` at 1f43def passed 13/13 in 57.13s at load ~8. I did not re-run the full file under synthetic 8-worker load (would double-run the suite the check stage owns and spike an already loaded machine); I ran the focused target once (63.88s pass, above) plus read both probe logs in full.

What to build:
- (a) Find where time goes mode by mode (launch/action/closed-page screenshot/context+browser cleanup/app close): DONE. investigation.md + probe/load8.log stage table: launch ~0.4-1.3s, page ~0.3-1.0s, goto ~0.04-0.16s, closed-page screenshot 0-1ms rejected (so renderFrame at src/runner/capture.ts:121 unreachable in capture mode), tracing.stop/context.close ms, app.stop 0ms, browser.close up to 30.035s/30.029s per mode. Child-exit probe: browser alive until near close settlement (16.036s to exit vs 16.050s to close resolution in sample). Code confirms sequence: screenshot src/runner/capture.ts:106 before renderFrame :121; close races bound src/runner/release.ts:25-29 with bound src/runner/config.ts:91 (30_000) applied per run() at src/runner/index.ts:82-85; test runs run() twice, so 2x30s + overhead > 60s.
- (b) Remove the wait that should not be there, or if legitimate say why + budget from worst case: DONE. Ruling documented in report and code comment (:579-581): no known-closed-page timeout to remove; 30s close bound is deliberate release policy; budget 150s (>2x 62.445s) without shortening cleanup. Arithmetic re-derived: 31.015+31.430=62.445s; 2x=124.89<150; 150/62.445~=2.40x. Probe run4 whole 62.777 vs 31.593+31.173=62.766 (11ms harness overhead). My run 31.991+29.666=61.657 vs whole 63.88 (2.2s overhead). Consistent.
- Tests-first (measure alone + under load, reproduce full-file timeout before changing): DONE. probe/alone.log (5 reruns alone, totals ~1.2-2.2s, budget=60000 logs) predates budget change; probe/load8.log reproduces full-file target timeout (60002.59ms, capture 31015/cleanup 31430 after timeout) before budget change. Commit order respects this (460b715 timing, then 1f43def budget).

Comments — read both the brief Pre-start section and the task file Comments section at review time (todo/04-...md:67+): 2 comments, both by @claude-dogfood (2026-10-30 02:39:31 probable-cause; 02:45:04 post-06 re-measure). No other authors; "none else" is a checked claim.
- Comment 1 (expect().rejects ~1s/call, system-Chrome 5-25s closes, do 06 first then re-measure): DONE. Task 06 in tree (rejection helper test/runner.slow.test.ts:225-231, comment cites task 06); re-measured alone 1.2-2.2s (probe/alone.log) and under load browser.close dominates (probe/load8.log). No runner wait on closed page remains (screenshot rejects 0-1ms).
- Comment 2 (post-0e8ba62: 1.34s alone, tier 52s; rerun Done-when under load, may only need closing): DONE. Reran verbatim under 8-worker load (probe/verified-load8.log 5/5 pass, run4 62.7s) — not closable, budget needed; my natural-load run (63.88s) agrees.

Implementer's stated gaps:
- Full slow tier under load 10 pass/3 fail, target 62.183s pass: target part DONE (probe log + my focused pass + check 13/13); file-not-green part PUSHED BACK (see next three bullets).
- `inherited browser stdio ... holder-still-alive` fails in full file under synthetic load; focused 3/3 passes on both diff and base: PUSHED BACK — out of this task's scope (task is only capture/cleanup; out-of-scope list names video-frame + paused-clock, and these three are likewise untouched by this diff which changes no src/). Passes without synthetic load (check 13/13 at 1f43def) and passes focused under 8 workers on both trees (probe/base-comparison.log 40.11s vs 80.51s); synthetic load reached 84->104, exceeding the historical 23-54 that motivated the task, so full-file failures under that pressure do not block this budget fix. No claim of pre-existing made.
- `real proofs repeat ...` 60s timeout in full file under synthetic load; focused passes both trees: PUSHED BACK for same reason (untouched by diff, green in check, synthetic load extreme).
- `project commands produce ...` 60s timeout in full file under synthetic load; focused passes both trees: PUSHED BACK for same reason.
- `check, check:all, full unit tier intentionally not run by hand; check stage owns them`: DISCHARGED by check pass — check.command `bun run check:all` passed at commit 1f43def (gate.output, 13 slow + 55 unit, lint+typecheck clean). Never held open; next attempt must not re-run the gate. Note brief's check.command (`bun run check:all`) differs from project-notes gate (`bun run check`); the one that ran is check:all (the landGate), which subsumes the gate.

Commits vs rule: 460b715 (test: report per-mode durations, +4) and 1f43def (test: budget from measured shutdown cost, +5/-2) are both test-only, in-scope, no empty Task-2 commit, no src/README/package change. No commit outside the task.

Decisions: (1) gate stays `bun run check`, landGate `bun run check:all` — holds (package.json:14-15,19-21 unchanged; check ran check:all). (2) both modes/reject/app-closed/no-manifest, no dropped mode/loosened assertion/retries — holds (diff keeps `for (const mode of ["capture","cleanup"])`, rejection(), closed, manifest checks; `rg -n retry` has no hit in diff). (3) never retry/heal; fix runner not test if wait on known-gone — holds (no retry added; runner correctly not changed per stage evidence above).

Look-fors: fixture does not encode the bug (no hardcoded totals asserted; only timeout/log added). No constraint dropped (both modes + 3 assertions per mode intact vs base sed 570-640). Cost at scale measured (above; my command + output is the measurement, not a quote). Spec/README still match code (runner unchanged). Nothing read twice across crash (diff reads performance.now() once per mode). No migration/backfill. No new predicate/matcher/guard. External event (browser.close slowness) read from real records: probe/load8.log, verified-load8.log, and my own `bun test ... -t "capture and cleanup failures"` (1 pass, 63.88s, capture 31991/cleanup 29666). No new module/directory (colocation N/A). No screenshots (no UI surface changed; fit N/A — reviewer has no images to judge and none are needed).

Absence/value evidence (searches run, whole repo): `rg -n "150_000|proof-timing|budget=150000" test/ src/` hits only test/runner.slow.test.ts:627,:633 (both live, state current value). `rg -n "60_000" test/runner.slow.test.ts` hits 10 remaining tests (:107,:128,:185,:351,:374,:466,:548,:674,:705,:744) — all live, correctly unchanged. `rg -n "closeTimeout" src/ test/` shows default src/runner/config.ts:91 30_000 (live, unchanged) + tests. `rg -n "capture and cleanup failures" test/ src/ docs/ README.md todo/` hits test :582 (live), task file, and done/05,06 history (dated, correctly untouched) — proves search works (finds the known holder test/runner.slow.test.ts:582). No stale 60s copy for this test remains.

Linter: check output `bun fmt --check && oxlint` → `Found 0 warnings and 0 errors` (gate.output:9); base lint not separately measured, but diff is formatting-clean (`git diff --check` ok) and the recorded check passed post-format, so no increment attributable to this diff.

Quantity-note: code comment (:579) cites 31.015+31.430=62.445s without naming the measuring commit; the numbers are derivable from recorded probe/load8.log + investigation.md (base eddfa50, timing at 460b715 state) rather than an undocumented claim, so not held as a finding.

Worktree clean (`git status --porcelain` empty), no node_modules/shared-install touched, no scratch worktree left.


Citations that do not open (the verdict stands; a finding may still be right):
- `todo/04-...md:67` path does not exist
Branch: nzila/01M65JTWH0BF5K3JXB59BV9G85

nzila run 01M65JTWH0BF5K3JXB59BV9G85

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
