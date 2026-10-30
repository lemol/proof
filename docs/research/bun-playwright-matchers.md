# Bun `expect().resolves`/`.rejects` slows Playwright calls to a ~1 s grid

Single-file upstream reproduction: `docs/reproductions/bun-playwright-matchers.test.ts`.
This report holds its complete source, the reduction ledger, paired timings,
the attribution with its evidence, and proof's own matcher inventory.

## Environment

- `bun --version`: `1.4.4` (repo `engines` requires `>=1.4.4`).
- `playwright`: `1.59.0` (devDependency); installed Chromium present
  (`chromium.executablePath()` exists). No browser was downloaded; the file
  fails when no installed executable exists and never provisions one.
- Machine: macOS arm64. Shared dev machine: load averages swung between ~4
  and ~17 during the experiments. Every pairing below ran back-to-back
  (often interleaved round-robin), and the final file ran 12 fresh processes
  plus side-by-side scratch-vs-final runs, so the split is per-file, not load.
- In-repo runs go through `bunfig.toml`'s preload (`test/browser.ts`), which
  only sets `PROOF_TEST_BROWSER` to the installed executable. The
  reproduction resolves its own executable, so it behaves the same copied
  alone; the preload does not change the result.

## Original case

Starting point: the renderer-failure case as it was before task 06
(`git show 7d785af:test/runner.slow.test.ts`), which drove proof's `run()`
through the original wrapper `await expect(run(...)).rejects`, versus the
settle-first control of the same `run()` call.

- Original wrapper: 11.4 s wall; `DEBUG=pw:api` median call 836 ms,
  8 of 15 completed calls strictly over 800 ms
  (durations 0, 99, 173, 329, 382, 515, 564, 836, 898, 899, 1000, 1101,
  1110, 1166, 1190 ms).
- Settle-first control: 0.956 s wall; median 6.5 ms, 0 of 12 over 800 ms
  (durations 0, 0, 1, 1, 3, 4, 9, 13, 25, 37, 213, 301 ms).

Historical context (task 06's commit, not re-measured here): empty-video
932 ms vs 9 ms, capture/cleanup 763 ms vs 14 ms per call.

## Reduction ledger

Each row is a scratch experiment (kept outside the worktree, in the attempt
directory). `rejects` means the driving promise awaited through
`expect().rejects`; `settle` means awaited first, asserted after.

1. Pure Playwright launch/context/page/`goto(about:blank)`/close in four
   modes: all fast (0.7–1.8 s). Plain launch-and-close is fast, as task 06
   noted.
2. Added one dimension at a time under `rejects`: local-server goto, CDP
   session, screenshot, ten sequential gotos, fixed clock, tracing,
   Effect-wrapped drive. Every variant fast (~1 s).
3. Direct-reject promise (no `.then` chain between creation and `expect`):
   fast. Wrapper shape is not the trigger.
4. Concurrent control (live `rejects` on a gate promise while Playwright
   drives separately): fast (2 s, median 97 ms). A pending matcher alone
   does not stall the loop.
5. Full capture mimic (server, fixed clock, tracing, goto, screenshot,
   sharp-to-disk, tracing stop) with direct `rejects`: fast (1 s,
   median ~30 ms). Capture calls without Effect do not trigger.
6. Timer/pipe controls: 10x `Bun.sleep(50)`, `setTimeout(50)`, or
   `Bun.spawn(echo)` round trips under `rejects` vs settle: identical
   (~510 ms timers, ~23–59 ms pipes). Timers and child pipes are not slowed.
7. Renderer scenario with vs without the `newCDPSession` stub: both slow
   (stub 13 s, median 880 ms; plain failing action 15 s wall with 20 calls
   at median 890 ms — the plain variant fulfills `run()`, so its
   `.rejects` assertion correctly failed while still showing the slowdown).
   The stub is not the trigger.
8. Effect-scoped capture mimic under `rejects` vs settle: 9 s (median
   719 ms, 4/10 over 800) vs 2 s (median 93 ms). First reduced positive —
   but Effect alone was a false lead (next row).
9. Effect × {scoped+acquires, gen-only, raw promises, single boundary}
   driving trivial Playwright: all fast (1–2 s). Effect is not required.
10. Adding server/tracing/screenshot/sharp back to the Effect shape: slow
    again (6–11 s) — including a near-trivial variant, which contradicted
    the previous row and forced a file-level A/B.
11. Interleaved A/B of the two near-identical files, 3 rounds: 1–3 s vs
    5–7 s every round. Real per-file difference, not load.
12. Single-edit mutations: removing a `sharp` import flipped one file fast;
    adding it to the other did nothing. Import red herring — the actual
    switch was a preamble line (next row).
13. Preamble sweep (identical program, only the line before `expect`
    changes): none 2 s; `await mkdir(...)` 6 s; `await Bun.sleep(0)` 6 s;
    `await Promise.resolve()` 2 s; `await Bun.file(...).exists()` 2 s.
    A yielded **timer/macrotask turn** before promise creation triggers;
    a microtask-only await does not.
14. Matrix: sleep+Effect slow, sleep+plain-async slow, sleep-inside-program
    fast, mkdir+plain slow. **Effect is irrelevant.**
15. Sleep position: no sleep 1–2 s; sleep before promise creation 5–6 s;
    sleep between creation and `expect` 5–6 s. Loop state, not the promise.
16. `DEBUG=pw:protocol` on a slow run: every SEND→RECV fast (e.g. 4 ms);
    the gaps sit RECV→SEND (400–1000 ms): the client processes each
    response promptly but issues the next request a second later. The
    `bun test` process sat at 0.5–1.9% CPU (idle, not busy-polling).
17. Final shape, four modes × three fresh processes: `await` and
    `reject-await` ~1 s / median ~40 ms; `resolves` and `rejects` ~5–6 s /
    median ~900 ms (full table under Measurements).
18. Negative ablation: deleting the single `await Bun.sleep(0)` line makes
    `rejects`/`resolves` fast (1 s, median ~40 ms, 0 over 800).
19. Placement: sleep in the test body + existence check after it still slow
    (7 s); the same sleep moved to the top of `exercise()` fast (1 s).
    The turn must be yielded before the driving promise is created.

Retained positive: one `await Bun.sleep(0)` in the test body before
creating the driving promise. Retained negative: the same file without that
line. Everything else (Effect, sharp, server, screenshot, tracing,
CDP stub) removed without losing the effect.

## Single-file reproduction

`docs/reproductions/bun-playwright-matchers.test.ts` (78 lines, imports
only `bun:test` and `playwright`, no proof imports):

```ts
import { expect, test } from "bun:test"
import { chromium } from "playwright"

// Upstream reproduction: one yielded timer turn before driving Playwright
// makes every subsequent Playwright call settle about a second late when the
// driving promise is awaited through Bun's resolves/rejects matchers, while
// the same calls under a plain await settle in milliseconds.
//
// Copy this file alone next to an installed `playwright` dependency and run:
//   DEBUG=pw:api bun test bun-playwright-matchers.test.ts --timeout 60000 -t '^await$'
//   DEBUG=pw:api bun test bun-playwright-matchers.test.ts --timeout 60000 -t '^resolves$'
//   DEBUG=pw:api bun test bun-playwright-matchers.test.ts --timeout 60000 -t '^reject-await$'
//   DEBUG=pw:api bun test bun-playwright-matchers.test.ts --timeout 60000 -t '^rejects$'
// or set PROOF_TEST_BROWSER to an installed Chromium executable.

const resolveExecutable = async (): Promise<string> => {
  if (process.env.PROOF_TEST_BROWSER) return process.env.PROOF_TEST_BROWSER

  const path = chromium.executablePath()

  if (!(await Bun.file(path).exists())) {
    throw new Error(`No installed Chromium browser is available at ${path}`)
  }

  return path
}

async function exercise(): Promise<"complete"> {
  const browser = await chromium.launch({ executablePath: await resolveExecutable() })

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("about:blank")
    await context.close()

    return "complete" as const
  } finally {
    await browser.close()
  }
}

for (const mode of ["await", "resolves", "reject-await", "rejects"] as const) {
  test(
    mode,
    async () => {
      // The trigger: yield one timer turn before creating the driving promise.
      // Removing this line makes every mode fast; keeping it slows only the
      // resolves/rejects matchers. Yielding the same turn from inside
      // exercise() does not reproduce.
      await Bun.sleep(0)

      if (mode === "await") {
        expect(await exercise()).toBe("complete")
      } else if (mode === "resolves") {
        await expect(exercise()).resolves.toBe("complete")
      } else {
        const promise = exercise().then(() => {
          throw new Error("reproduction sentinel")
        })

        if (mode === "rejects") {
          await expect(promise).rejects.toThrow("reproduction sentinel")
        } else {
          const error = await promise.then(
            () => null,
            (cause: unknown) => cause,
          )

          expect(error).toBeInstanceOf(Error)
          expect((error as Error).message).toBe("reproduction sentinel")
        }
      }
    },
    60000,
  )
}
```

## Commands

From the repository root (`TMP` redirected so browser artifacts never touch
the OS default temp; logs land in the attempt directory):

```sh
scratch=<attempt-tmp>; mkdir -p "$scratch"
for mode in await resolves reject-await rejects; do
  DEBUG=pw:api TMPDIR="$scratch" TMP="$scratch" TEMP="$scratch" \
    bun test docs/reproductions/bun-playwright-matchers.test.ts \
    --timeout 60000 -t "^${mode}\$"
done
```

Each selected run must report exactly `1 pass`, `0 fail`. A scratch copy
whose exercise throws `wrong operation` instead must report `1 fail` with a
nonzero exit in every mode (verified: all four fail; an unrelated
Playwright failure can never satisfy the sentinel assertion).

## Measurements

Final file, three fresh processes per mode, interleaved. Per completed
`pw:api` call (median; count strictly over 800 ms of 6 calls; wall is the
test runner's reported time):

| mode         | run 1 wall / median / >800 | run 2 wall / median / >800 | run 3 wall / median / >800 |
| ------------ | -------------------------- | -------------------------- | -------------------------- |
| await        | 1.3 s / 39 ms / 0          | 0.9 s / 82 ms / 0          | 0.9 s / 41 ms / 0          |
| resolves     | 6.2 s / 908 ms / 4         | 5.2 s / 615 ms / 2         | 5.2 s / 999 ms / 4         |
| reject-await | 0.7 s / 36 ms / 0          | 0.7 s / 37 ms / 0          | 0.7 s / 39 ms / 0          |
| rejects      | 5.2 s / 1050 ms / 4        | 6.2 s / 899 ms / 3         | 5.2 s / 936 ms / 4         |

Full duration lists (ms): await [7,12,23,54,257,709],
[6,17,24,140,225,323], [6,16,29,52,261,354]; resolves [94,562,818,997,1051,
1102], [76,316,541,688,1000,1984], [59,536,999,999,1005,1985]; reject-await
[5,10,25,46,185,278], [5,8,19,54,177,273], [7,13,26,52,176,293]; rejects
[65,539,997,1102,1113,1773], [80,556,797,1001,1005,1188],
[55,547,875,997,1000,1111]. Parser self-check on synthetic durations
4, 60, 800, 1000 ms: median 430, 1/4 over 800; zero unmatched
starts/endings on every final log.

## Attribution

**Bun's `expect().resolves` / `.rejects` async matcher path (Bun 1.4.4),
not Playwright.** Evidence, all observed on this tree:

- The identical driving promise is fast under plain `await`
  (`await`/`reject-await` medians ~40 ms) and slow only through the two
  matchers (`resolves`/`rejects` medians ~900 ms).
- Protocol timing shows Playwright traffic itself healthy: each SEND is
  answered within milliseconds; the ~1 s gaps sit between processing a
  response and issuing the next request (client-side continuation
  scheduling), while the test process idles at under 2% CPU.
- Timer, pipe, and concurrent-Playwright controls are unaffected, so this
  is not a global event-loop stall: only continuations awaited through the
  matcher path after a prior timer turn are delayed.
- No Playwright feature is implicated: default launch, one context, one
  `about:blank` navigation. Effect, sharp, the local server, screenshots,
  tracing, and the CDP stub were each removed without losing the effect.

This report does not establish the mechanism inside Bun from its source. The
open upstream reports do; see "Upstream status". No new issue was filed,
because this one is already reported.

## Upstream status

Already reported. Searched 2026-10-30; filing again would be a duplicate.

- [oven-sh/bun#45629](https://github.com/oven-sh/bun/issues/45629) is this
  bug. It names Playwright's in-process connection as a victim and gives
  the same settle-first workaround as task 06.
- [oven-sh/bun#45020](https://github.com/oven-sh/bun/issues/45020) reports
  the same stall with a dependency-free reproduction, and its test B has
  the same trigger as ours: an `await` before the matcher.
- Open fixes, none merged on that date:
  [#45923](https://github.com/oven-sh/bun/pull/45923) closes both issues;
  [#45029](https://github.com/oven-sh/bun/pull/45029) closes #45020.
  [#33289](https://github.com/oven-sh/bun/pull/33289) removes the blocking
  matcher wait altogether.

Why it is the same bug:

- `playwright-core` 1.59.0 `lib/inProcessFactory.js:46-47` passes every
  protocol message between client and dispatcher through `setImmediate`,
  which is the path both issues stall. This also explains the RECV→SEND
  gaps in ledger row 16.
- The stall follows the 1 s GC timer that #45020 names as the waker. Two
  fresh processes per setting on Bun 1.4.4, wall time:

| setting                     | await       | resolves    | rejects     |
| --------------------------- | ----------- | ----------- | ----------- |
| default (1 s timer)         | 0.7–1.8 s   | 5.2–6.2 s   | 5.2 s       |
| `BUN_GC_TIMER_INTERVAL=200` | 0.6–1.4 s   | 2.2–2.3 s   | 2.2–2.3 s   |
| `BUN_GC_TIMER_DISABLE=1`    | 0.6–0.8 s   | 8.2 s       | 8.2 s       |

With the timer disabled, #45020's reproduction hangs to the test timeout.
Ours only gets slower, so something else also wakes the loop here.

Cross-version rerun, three fresh processes per mode, all `1 pass`, wall time:

| Bun                      | await       | reject-await | resolves    | rejects     |
| ------------------------ | ----------- | ------------ | ----------- | ----------- |
| 1.3.14                   | 0.7–0.9 s   | 0.7–0.8 s    | 1.0 s       | 1.0 s       |
| 1.4.4                    | 0.7–1.8 s   | 0.6–0.7 s    | 5.2–6.2 s   | 5.2 s       |
| 1.4.4-canary.1+da867c60b | 0.6–0.8 s   | 0.6–0.7 s    | 5.2 s       | 5.2 s       |

1.4.4 was the latest stable release on that date. On 1.3.14 this reproduction
is fast, which fits #45020's history: the structure predates 1.4, and the
stall became about a second long there.

## Suite inventory

Searches rerun at base plus the new file (`rg -n '\)\.rejects\b'`,
`'\)\.resolves\b'`, `'expect\(await'`, multiline `expect\(` tails, and
`expect(<identifier>)` over promises). Nine live `.rejects` wrappers, none
of which drives a browser or child process:

- Filesystem-only executable validation, `src/runner/browser.test.ts:28–29`
  (2): `resolveExecutable` against absent/non-file paths.
- Fake release control, `src/runner/release.test.ts:33,58,73,79` (4):
  `releaseBrowser` with stubbed process control (`never` settles, refused
  kill, recycled pid).
- Prelaunch configuration refusals, `test/runner.slow.test.ts:566,569,571`
  (3): missing scenario id, bad executable path, nonempty output
  directory — all reject before the app (and any browser) launches.

No live `.resolves` outside the new diagnostic file. Settled-then-asserted
sites (the task-06 workaround shape — promise awaited first, value asserted
after, unaffected by this bug):

- `test/runner.slow.test.ts:357–358,605,681,727` via the `rejection()`
  helper (line 225), plus value assertions on `result`/`child` fields
  throughout the slow tier (e.g. lines 84, 121–123, 458, 524–525, 652).
- `expect(await child.exited)` (line 165) and scenario-action assertions
  on awaited locator text/cookies (lines 196, 203, 502): the matcher
  receives resolved values, never a pending browser-driving promise.
- `src/runner/process.test.ts:12` (`expect(await exited)` on a real child
  exit) and `release.test.ts` value assertions: same settled-value shape.
- `src/runner/browser.test.ts:24–27`: `resolveExecutable` success paths.

Conclusion: no active matcher in proof's suites wraps a browser- or
child-process-driving promise. The only deliberate in-matcher browser use
is the new diagnostic file, which lives under `docs/` outside every gate
(`test:unit` runs `bun test src test/boundaries.test.ts`; `typecheck`
covers `src`/`test` only).

## Limitations

- Upstream issue: [oven-sh/bun#45629](https://github.com/oven-sh/bun/issues/45629),
  open on 2026-10-30. See "Upstream status". These results were
  [added there](https://github.com/oven-sh/bun/issues/45629#issuecomment-6532429811).
- One machine and one OS (macOS arm64), with Playwright 1.59.0. Bun 1.3.14
  and a 1.4.4 canary were rerun; no other platform was.
- Shared-machine load varied during bisection; every load-bearing contrast
  was interleaved back-to-back, and the final 12 runs are stable, but
  absolute wall times will differ elsewhere. Median call time and the
  over-800 count travel better than walls.
- `DEBUG=pw:api`/`pw:protocol` timestamps are client-log times; the
  browser-side vs scheduler-side split rests on SEND/RECV gap placement
  plus an idle client CPU, not on browser tracing.
- The other three task-06 cases were not reduced: the first starting point
  (renderer failure) reproduced, so the fallbacks were never needed.
- The full gate (`bun run check`, slow tier) was deliberately not run here;
  the `check` stage owns it. Focused runs, lint, typecheck, and the
  scratch-tsconfig typecheck below are the verification for this change.
