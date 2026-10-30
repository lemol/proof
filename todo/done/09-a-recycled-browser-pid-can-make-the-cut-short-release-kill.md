---
title: A recycled browser pid can make the cut-short release kill an unrelated
  process group
tags: [safety]
completed_at: 2026-10-30T03:24:26Z
outcome: completed
---
#### Why

proof:05 (landed at `0271ffd`) bounds the browser's release. When
`browser.close()` has not settled within `closeTimeout`,
`src/runner/release.ts` decides whether the browser has gone with
`process.kill(pid, 0)` on the pid that CDP reported at launch
(`browserProcessId` in `src/runner/browser.ts`). If the browser is still there
it sends SIGKILL to `-pid`, the whole process group (`src/runner/process.ts`).

Nothing checks that the pid still belongs to the browser. If Chromium exits
during the bound and the OS gives its pid to another process before the
deadline, `alive(pid)` returns true and proof SIGKILLs that process, or its
group if it leads one. Sequential pid allocation makes this unlikely, but
the bound is 30 s by default and the failure is a kill of something proof
does not own. proof:05's reviewer raised it as non-blocking note (a).

The same review, note (b): a run whose browser pid cannot be read now fails
at a new `browser process` stage, before the app launches. The README does
not name that stage.

#### Settled decisions

- proof:05's contract stays. A browser that has gone is released. A live one
  is killed and released once it exits. One that cannot be killed fails at
  `browser cleanup`.
- proof kills only a process it launched. If it cannot tell whether the
  process is still the browser, it must not kill it. That case is a
  `browser cleanup` failure, not a kill.

#### What to build

1. Tell whether the browser exited from the child process Playwright
   launched (`exitCode` / `signalCode`, or its `exit` event), captured while
   connected the way `browserHandleDisposer` already is. Fall back to the
   pid probe only when that handle is unavailable, and say in the README
   what that fallback risks.
2. Before the group kill, check that the browser has not exited. Do not kill
   a pid whose child has already reported its exit.
3. The README names the `browser process` stage and when a run fails there.

#### Tests first

- In `release.test.ts`, a process control whose child has reported its exit
  but whose pid still probes alive (a recycled pid). It fails on the current
  `releaseBrowser`, because kill is called. After the change the release
  counts as `exited` and kill is never called.
- The existing exited, killed and unkillable tests in
  `test/runner.slow.test.ts` still pass.

#### Done when

- The tests above pass, and `bun run check:all` passes.
- The README describes the exit check and the `browser process` stage.

#### Out of scope

- The 30 s default and the shape of the bound (proof:05).
- Playwright's own close behaviour.

## Comments

### @nzila at 2026-10-30 03:24:26 +00:00

Done: Cut-short browser release now trusts the launched child's exit state before the pid.

- `src/runner/browser.ts`: new `browserExitProbe(browser)` returns a probe over the Playwright-launched child (`exitCode`/`signalCode`), captured while connected. It returns undefined when the handle is unavailable. The child lookup is shared with `browserHandleDisposer` (`launchedChild`).
- `src/runner/release.ts`: `ProcessControl.exited?` is checked before the pid-unknown check, before the group kill, and in the post-kill wait loop. A child that has reported its exit is `exited` and is never killed. Without a probe, the old pid probe is the fallback.
- `src/runner/index.ts` passes `{alive, kill, exited}`.
- README: describes the exit check, the pid-fallback risk (an unrelated process that gets the recycled pid may be SIGKILLed) and the `browser process` stage.
- Tests: three new `release.test.ts` tests: recycled pid with exited child → `exited`, kill never called; child exits after kill → `killed`; child not exited → killed via pid. Plus a `browserExitProbe` test in `browser.test.ts`.
- `test/command.ts` needed two edits. The `unavailable` browser mock gains `browserExitProbe`. The `unkillable` mock now forces `browserExitProbe` to never report exit, because the fixture's real `close()` really exits the child, which would otherwise count as released. The slow test body is unchanged.

Verification:
- `bun run lint` and `bun run typecheck` pass.
- `bun test src/runner` passes (31 tests).
- `test/runner.slow.test.ts` passes (13/13).
- I did not run `bun run check:all` or `bun run check` in full; the check stage owns them.
- I did not run the recycled-pid release test against the pre-change `releaseBrowser`. It would call kill, since the old code never reads `exited`.
- Searched `src` and `test` for `browserHandleDisposer` and `releaseBrowser` mocks to find the fixtures that needed `browserExitProbe`.

Review: approved (4/5)
Approved. I reviewed the whole diff, 749e44c...158612a, which is one commit.

Check: the `check` stage ran `bun run check:all` (check.command) on 158612a. That is HEAD, and it passed. The land gate runs it again.

Task comments: todo/09-a-recycled-browser-pid-can-make-the-cut-short-release-kill.md has no Comments section and the brief has no pre-start comments. Count 0, so there are no authors to list. `grep -n -i "comment\|author"` on the task file found nothing.

What to build
1. Done. Exit is read from the launched child, with the pid as fallback. `browserExitProbe` in src/runner/browser.ts reads `exitCode !== null || signalCode !== null` on the child that `launchedChild` captures while connected (shared with `browserHandleDisposer`). It returns undefined when the handle is unavailable. src/runner/index.ts captures it next to `dropHandles` and passes `{alive, kill, exited}`. README lines 110-116 state the fallback's risk: it "may `SIGKILL` that process or its group".
   - Real-browser probe: a scratch script launched chromium on Playwright 1.59.0 / Bun 1.4.4 and called `browserExitProbe`. It printed `probe defined: true exited before: false`, then after `kill(-pid)`: `exited after kill: true`. So the toImpl path is live in production, not only the fallback, and README's "verified on 1.59" holds.
2. Done. In release.ts, `if (control.exited?.()) return "exited"` runs before the pid-unknown check and the group kill. The post-kill loop is `while (!control.exited?.() && control.alive(pid))`.
3. Done. README lines 123-125: "A run whose browser reports none fails at the `browser process` stage, with no app launched and no manifest published." This matches `attempt("browser process", () => browserProcessId(browser))` in index.ts:97.

Tests first / Done when
- Recycled pid: pinned in release.test.ts by "a child that reported its exit is released even when its pid probes alive". It fails if kill is called or the result is not `exited`. I copied the new release.test.ts into a scratch worktree at the base and ran it. It failed with `Expected: "exited" Received: "killed"`. "a child that exits after the kill releases despite a recycled pid" also fails at the base: `Browser process 4242 is still running 200 ms after SIGKILL`. "a child that has not exited is killed through the pid" pins that the kill still happens.
- browser.test.ts, "the exit probe reads the launched child's exit state": this fails if `signalCode` is ignored (the second expect flips on signalCode alone), or if the `toImpl` shape is not read (`probe?.()` would be undefined, not false).
- The exited, killed and unkillable slow tests: these pass in check#1 (13 tests, 1 file). The unkillable fixture in test/command.ts now forces `browserExitProbe` to never report an exit. That is justified: the fixture's real `close()` exits the child, which correctly counts as released, so the fixture has to simulate a child that never exits. The slow test body and its assertion "is still running 1000 ms after SIGKILL" are unchanged.
- `bun test src/runner`: 31 pass, 0 fail (I ran it). Lint: `bun run lint` formatting is clean, and oxlint exits 0 with no output, so 0 warnings. The base also has 0.

Implementer's stated gaps
- Did not run check:all or check: discharged by check#1 on 158612a.
- Did not run the recycled test against the base: closed. I ran it, and it failed as quoted above.

Race / class check
- After the deadline, `exited()` → `alive()` → `kill()` runs synchronously. On Bun 1.4.4/macOS, I spawned `sleep 0.05` and busy-waited 500 ms without yielding. It printed `alive true exitCode null`, then after one loop turn `alive false exitCode 0`. So the child stays an unreaped zombie, and its pid cannot be recycled, until the JS-visible exit state is set. There is no window where the pid is reaped but `exited()` is still false.
- Inputs I covered: `exitCode` set, `signalCode` set, neither set, no handle, child exits after the kill, and the pid-unknown case with an exited child (returns `exited` before the throw).
- Not checked: Linux. Bun may reap on a waiter thread there, which could open a small window. I can't read that on this machine, so it remains an open question, not a finding.

Brief Decision: "If it cannot tell whether the process is still the browser, it must not kill it." This is in tension with What-to-build 1, which asks for the pid fallback. The code follows item 1 and the README states the risk. With the handle present, the code can always tell.

Non-blocking notes
- docs/specs/proof-runner.md:111 "Process liveness, rather than that event, decides a cut-short release." This is still broadly true, because the `exit` state is process liveness, but the spec does not mention the child exit check or the pid fallback. A one-sentence spec update would keep the spec in line with the README.
- The README sentence at lines 110-116 is long, and "An exited browser counts as released" now comes after the fallback caveat. Readability only.

No new modules or directories. All tests are colocated. Scratch worktrees are removed.

Branch: nzila/01M65CX53WYZZ4B9YMHPRYHWNV

nzila run 01M65CX53WYZZ4B9YMHPRYHWNV
