---
title: The paused-clock test's watchdog also times the browser's close
tags: [flaky]
completed_at: 2026-10-30T03:15:10Z
outcome: completed
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

## Comments

### @nzila at 2026-10-30 03:15:10 +00:00

Done: Diagnosis of check#1 failure on b9cf18b (`bun run check:all`): unrelated to this diff; no code change made; recommend unchanged retry.

What failed: `test/runner.slow.test.ts:295` in "real proofs repeat the same steps and masked WebP screenshots" — `expect(ends[1]!).toBeGreaterThanOrEqual(change!.at + pace.hold / 1000)` with Expected >= 3.0100000000000002, Received 3.01. The rest of the gate passed, including the modified paused-clock test (pass, 6557 ms). 12 pass, 1 fail.

Observed evidence:
- `ends[1]` (3.01 exactly) is parsed from a WebVTT chapter timestamp with millisecond precision (the `-->` regex at lines 287-291); `change.at + pace.hold/1000` (3.0100000000000002) is a floating-point sum. The actual chapter end landed on the exact millisecond boundary, so truncation put the received value ~2e-16 below the float bound. A timing-boundary float flake in an assertion this diff never touched.
- The diff (`git diff --stat`: only test/runner.slow.test.ts, only the paused-clock hunk at lines 362+) touches neither the failing test (lines 232-360) nor any src/ file it exercises. Bun runs file order, and the gate log shows the failing test ran before the modified paused-clock test, so the held browser.close could not have affected it.
- Focused runs: `bun test test/runner.slow.test.ts --timeout 60000 -t "real proofs repeat the same steps" --rerun-each 3` at head (b9cf18b): 3 pass, 0 fail, 87 expect() calls. Same command in a detached probe worktree at merge-base c106c8e (added then removed with `git worktree remove --force`): 3 pass, 0 fail. Worktree is clean at b9cf18b; probe removed.

Suspected cause (not proven): machine-load timing placed the ffmpeg chapter boundary exactly on the millisecond, exposing the float-vs-truncated-ms comparison. Passing in isolation at both head and base does not prove contention, only that the failure is intermittent and not pinned to this diff.

No change justified: fixing the float comparison (e.g. epsilon tolerance) belongs to a separate task owning that test, not proof:07, whose scope is the paused-clock watchdog. Commands above support one unchanged retry of `bun run check:all` on b9cf18b.

Review: approved (5/5)
Approved. Whole change c106c8e...b9cf18b: test/runner.slow.test.ts only (+24 -2), one commit "fix(test): the paused-clock watchdog ends when capture does, not after the browser's close", in the owning repo with a conventional subject; no src/, docs or README change, and none needed (nothing user-facing moved).

Check: check#2 passed `bun run check:all` (the brief's check.command, which is also the landGate) on b9cf18b, 13 tests. check#1's failure (float boundary at test/runner.slow.test.ts:295 in "real proofs repeat the same steps and masked WebP screenshots") is in a test this diff does not touch; do#2's diagnosis holds and check#2 passed unchanged.

What to build (one item): watchdog ends when capture ends, then await the run and check outcome and close. Done: the race is now [appClosing, proof, 5 s timer], appClosing signalled in the wrapped app `close`; then clearTimeout, `const result = await proof`, expect outcome "passed" and closed true; test timeout 15_000 -> 60_000.
Ordering claim checked in src/runner/index.ts: browser acquireRelease at :77, app at :87, context at :102 (released :114) -> release order is context, app, browser, so app close comes after capture and context close and before `releaseBrowser(() => browser.close(), ...)` (:79). That call reads `browser.close` at release time, so the test's instance patch is the one the runner calls.

Settled decisions: both claims still proved (outcome passed + `closed` true); watchdog covers pause -> app close only, test timeout covers the rest. Code matches both.

Tests first / Done when:
- Done-when `bun test test/runner.slow.test.ts --timeout 60000 -t "paused application clock" --rerun-each 5`: ran it at HEAD: 5 pass, 0 fail, 10 expect() calls, 33.35 s. Not the gate, so run here.
- False positive pinned: permanent 6 s held `browser.close` in the test ("a paused application clock cannot hang capture or prevent cleanup"). Reversal in a scratch worktree (removed appClosing from the race): fails with "error: capture hung on the application clock" in 6.6 s. So the committed test fails on the old watchdog.
- Real hang still caught: scratch with `await current.evaluate(() => new Promise((r) => setTimeout(r, 100)))` after signalPaused: fails "capture hung on the application clock", 5.6 s. Not a committed test, but the brief asks only to show it, and I did.
- Outcome assertion reversal (toBe("failed")): fails, Received "passed". `closed` is set only by the app wrapper the runner calls, so it fails if cleanup is skipped.
Scratch worktree removed; worktree clean.

Quantities: 6 s hold < 30 s default closeTimeout so release still returns "closed"; 60 s test timeout >> observed ~6.6 s run. `grep -rn "capture hung\|15_000\|watchdog"` over test src docs README todo: only this test's lines 390/431/436, test/command.ts:29 (unrelated closeTimeout 15_000, live and untouched), and the task file itself. No stale copy.

Comments: task file todo/07-... has no Comments section (grep -i comment: no hits), brief carries no pre-start comments: 0 comments, no authors. Implementer's stated gaps: none (do#1 reports lint and typecheck run). Lint: `bun run lint` clean, formatting OK on 33 files, no warnings printed; base the same. Class checks: no predicate/parser added. No new module, config field or UI; no proof screenshots apply.

Branch: nzila/01M65C7FE9TGRDZZ2RJM2H0B4C

nzila run 01M65C7FE9TGRDZZ2RJM2H0B4C
