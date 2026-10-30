---
title: A recycled browser pid can make the cut-short release kill an unrelated
  process group
tags: [safety]
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
