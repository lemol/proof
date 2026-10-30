---
title: The chapter-end check compares millisecond cues with a float sum
tags: [flaky]
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
