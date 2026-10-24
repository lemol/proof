---
title: Stabilise the video-frame check in the slow runner test
tags: [onboarding]
findings: [agent:slow-video-frame-flake]
---
#### Why

The landGate the person chose, `bun run check:all`, runs
`test/runner.slow.test.ts`. On the onboarding base (161dc9e), one of two full
runs of `bun run test:slow` failed in "real proofs repeat the same steps and
masked WebP screenshots" at `test/runner.slow.test.ts:125`:

```
expect(pixel[index === 0 ? 0 : 1]!).toBeGreaterThan(170)
Expected: > 170
Received: 19
```

The same test passed alone (`-t "masked WebP"`) and in the second full run
(load average 4–8). It extracts a video frame with ffmpeg at `step.at` and
expects the pixel at (1000, 50) to show the colour that step painted. When the
machine is loaded, the frame at `step.at` can still show the previous paint, so
the check depends on timing. A flaky landGate blocks lands at random and trains
people to re-run it.

#### Settled decisions

- `bun run check` stays the gate; `bun run check:all` is the landGate. This task
  does not change either.
- The test keeps proving that each step's `at` offset points into the video at
  that step's visible state. Do not delete the assertion, loosen it to "any
  frame", or add retries.
- proof never retries or heals a scenario (AGENTS.md). If the fault is in how
  `src/runner` records `at`, fix the runner, not the test.

#### What to build

Find out whether `at` is recorded before the step's paint reaches the video
(a runner bug) or whether the test samples a frame too close to a transition
(a test bug). Then fix the one that is wrong. For example, record `at` after
the action settles, or sample the frame a small, documented offset inside the
step's interval (`at` to the next step's `at`, or the end of the video).

#### Tests first

Reproduce the failure under load first: run the test with `--rerun-each 10`,
alongside a CPU-heavy process if needed. Get it to fail before you change
anything.

#### Done when

- `bun test test/runner.slow.test.ts --timeout 60000 -t "masked WebP" --rerun-each 10`
  passes under the same load that made it fail before the fix.
- If the runner changed, the README's description of `at` still matches what
  the runner does.

#### Out of scope

- The other slow tests, the CI workflow, and browser provisioning.

onboard:01M5QH93J6G5Q4KYV4BP26TC57:tasks/slow-video-frame-flake.md

## Comments

### @nzila at 2026-10-24 19:37:15 +00:00

Abandoned by api: flow route gate-unrelated.abandon

nzila run 01M5QJ2YGZKB1KK3Z8FP9N90HH
