---
title: Reduce Bun's slow expect(promise).rejects over Playwright to a reproduction
tags: [upstream]
---
#### Why

Task 06 found that inside `await expect(run(...)).rejects`, Playwright's
calls finish on a one-second grid under Bun 1.4.4 (`newContext` 0.9 s,
`clock.setFixedTime` 1.0 s), while the same calls take 4–60 ms when the run
is awaited first. The slow tier works around it since 06's commit. What
triggers it is not known: a bare `cat` echo over fd 3/4 inside
`expect(...).rejects` slowed only from 7 ms to 23 ms for 10 round trips,
and a plain Playwright launch-and-close under `bun test` was fast. Without
a reproduction it cannot be reported upstream, and other suites (xonton's
kit tests, nzila's) may be paying the same second per call.

#### What to build

1. Reduce it: start from one of the four 06 tests as it was before 06
   (`git show 7d785af:test/runner.slow.test.ts`), and remove proof piece by
   piece until the slowdown goes away. Measure with `DEBUG=pw:api` (median
   call, calls over 800 ms).
2. Say whether it is Bun's (`expect().rejects` / `.resolves` running a
   nested loop) or Playwright's, and write the reproduction as a single
   file an upstream issue can carry. Do not file the issue; the person does.
3. Search the workspace's other suites for `expect(` over a promise that
   drives a browser or a child process, and list them.

#### Done when

- The report has the reproduction, its timings with and without the
  wrapper, and the list from item 3.

#### Out of scope

- Changing other projects' tests.
