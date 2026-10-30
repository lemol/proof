---
title: The chapter-end check compares millisecond cues with a float sum
tags: [flaky]
completed_at: 2026-10-30T03:28:57Z
outcome: completed
---
#### Why

proof:07's check#1 (`bun run check:all` on `b9cf18b`, run
`01M65C7FE9TGRDZZ2RJM2H0B4C`) failed in "real proofs repeat the same steps
and masked WebP screenshots" at `test/runner.slow.test.ts:295`:

```
expect(ends[1]!).toBeGreaterThanOrEqual(change!.at + pace.hold / 1000)
Expected: >= 3.0100000000000002
Received: 3.01
```

`at` is rounded to whole milliseconds (`src/runner/capture.ts:125`), chapter
ends are written as whole milliseconds (`src/runner/chapters.ts`), and the
test parses them back as seconds. When the chapter ends exactly `hold` ms
after `at`, the runner kept its promise, but the float sum `2.01 + 1` is
above `3.01` and the assertion fails. It passed on retry; a flaky landGate
blocks lands at random.

#### Settled decisions

- The test keeps proving that each chapter holds its result for at least
  `pace.hold` after the screenshot. Do not loosen it beyond the
  millisecond the format carries, and do not add retries.
- Compare in integer milliseconds (or with a sub-millisecond tolerance,
  documented), on all the chapter/`at` comparisons in that test that add
  or subtract seconds, not only line 295.

#### Tests first

Show the false failure without the browser: the same comparison with
`at = 2.01`, `hold = 1000` and a parsed end of `3.01` fails as written and
passes after the change.

#### Done when

- `bun test test/runner.slow.test.ts --timeout 60000 -t "masked WebP" --rerun-each 5`
  passes, and `bun run check:all` passes.

#### Out of scope

- Task 02's video-frame pixel check in the same test.

## Comments

### @nzila at 2026-10-30 03:28:57 +00:00

Done: Added test/milliseconds.ts (`milliseconds(seconds)` = Math.round(seconds*1000)) and made the chapter/`at` comparisons in test/runner.slow.test.ts (lines ~282-296) compare in integer ms: open.at vs pace.chapter, change.at - open.at vs hold+chapter+action, ends[0]/ends[1] vs at + hold, ends[0] <= change.at. The chapter-end parser now yields ms. No retries or loosening: still >= at + hold exactly.

Test first: test/milliseconds.test.ts shows the false failure without the browser. The task's literal values (2.01, 1000, 3.01) don't overshoot on this runtime (2.01 + 1 === 3.01), so I searched for a real instance: at=1.006, hold=1000, end=2.006 has at + hold/1000 = 2.0060000000000002 > 2.006, so the old comparison fails and the ms one passes. A second case checks one ms short still fails. I first saw the test fail without the helper (module missing) and the old-form assertion fail on the float sum.

Verified: bun test test/milliseconds.test.ts (2 pass); lint and typecheck each clean; `bun test test/runner.slow.test.ts --timeout 60000 -t "masked WebP" --rerun-each 5` -> 5 pass, 0 fail. Searched the test file for `/ 1000`, `.at` and `ends[` to find all float-sum comparisons. Task 02's video-frame check untouched.

Process note: I committed once with a broken test (a failed sed), fixed in the next commit; the branch has 2 commits. I also ran a git stash push/drop on my own uncommitted edit by mistake and redid it; nothing outside this worktree was touched beyond the shared stash stack (my entry only, dropped).

Review: approved (5/5)
Approved. The whole diff from 79a857a: test/milliseconds.ts (new), test/milliseconds.test.ts (new), test/runner.slow.test.ts (+8 -7).

Task brief requirements
- Settled decision, comparisons in integer ms on every chapter/`at` comparison that adds or subtracts seconds: done. `rg "/ 1000|\.at\b|ends\[|toBeCloseTo" test/runner.slow.test.ts` finds only lines 283, 284/285, 295, 296 and 297, all now in `milliseconds(...)`, plus 311, which is `String(step.at)` (a string, not a comparison). The parser at :292 now yields ms. capture.ts:122-125 rounds `at` to whole ms and chapters.ts writes whole ms, so Math.round(s*1000) recovers each value exactly and nothing is loosened. Each check is still `>= at + hold`, with no tolerance and no retries.
- Tests first, the false failure without the browser: pinned by test/milliseconds.test.ts "a chapter ending exactly `hold` after `at` keeps its promise". The task's literal 2.01+1 gives exactly 3.01 on this Bun (probe: `bun -e` printed `3.01 2.0060000000000002 false true`), so the implementer used 1.006/2.006, which does overshoot. The test asserts that the old form fails (`end < at + hold/1000`) and that the ms form passes. I pushed the reversal back to the implementer's stated reason, which is valid. Reversal in a scratch worktree: dropping Math.round (`seconds * 1000`) makes it fail ("Expected: >= 2006, Received: 2005.9999999999998"), and an identity helper fails as well. A second test, "one millisecond short still fails", pins that the helper does not round 2.005 up past the bound.
- Done when, `bun test test/runner.slow.test.ts --timeout 60000 -t "masked WebP" --rerun-each 5`: I ran it myself and got 5 pass, 0 fail, 145 expect() calls, in 38.20 s.
- Done when, `bun run check:all`: this is the landGate. The check stage ran check.command `bun run check:all` on a5f7ff1 and it passed (check.passed=a5f7ff1). The land runs it again.
- Out of scope, Task 02's video-frame check (around line 326 `.extract({ left: 1000, ...`): untouched.

Implementer's stated gap
- check:all was not run by do: discharged by check#1's pass of `bun run check:all` at a5f7ff1, and the land gate runs it again.

Comments: I read todo/10-*.md. It has no Comments section (`grep -n Comments` returns nothing, and the count of `### @` is 0), and the brief lists no pre-start comments. That makes 0 comments and no authors.

Commits: db03f08 and a5f7ff1 are both fix(test) and both carry a Co-Authored-By trailer. The broken intermediate commit that do#1 reported is fixed by a5f7ff1, and the branch lands together. Lint (`bun fmt --check && oxlint`) is clean: no warnings line, 0 warnings.

Colocation: test/milliseconds.ts has its test beside it in test/milliseconds.test.ts. There is no new src module, so no spec or README change is needed.

Branch: nzila/01M65DDJFXHKVTR0TJRGM9SC4Y

nzila run 01M65DDJFXHKVTR0TJRGM9SC4Y
