---
title: Stabilise the video-frame check in the slow runner test
tags: [onboarding]
findings: [agent:slow-video-frame-flake]
completed_at: 2026-10-30T04:59:06Z
outcome: completed
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

### @nzila at 2026-10-30 04:59:06 +00:00

Done: Addressed R1 in cd1e830 (test: correct video sampling rationale). Only test/runner.slow.test.ts comments changed: removed the false keyframe-seeking explanation and described the recording potentially lagging wall-clock at. Sampler, +0.3s offset, pixel assertions, runner and README remain unchanged. No review notes rejected. The plan's claim that moving -ss makes decoding accurate was incorrect; retained the harmless existing argument order without that claim. No history rewrite.

Verified R1 independently using a worktree-local generated VP8 WebM: ffprobe -show_entries frame=key_frame -of csv counted exactly one keyframe. Decoding one rgb24 frame with ffmpeg -ss T -i clip and ffmpeg -i clip -ss T returned identical samples at 1.56 (fc0000), 1.6/1.64/1.8 (007f00). Removed probe afterward. This demonstrates input seeking is not keyframe-only here.

Comment-claim evidence: rg -n -A27 -B8 'const at = Math.max' src/runner/capture.ts showed renderFrame before performance.now()-origin and pace.hold timeout after at; rg -n -A4 'const pace' test/runner.slow.test.ts showed hold=600ms. Search rg -n 'keyframe|SAMPLE_OFFSET|sampleAt|\.at\b' src test found this sole video sampler plus chapter/order assertions and manifest validation. No changed behavior needs a new failing test.

Fresh verification:
- bun run lint: exit 0, formatting correct, no lint warnings.
- bun run typecheck: exit 0.
- bun test test/runner.slow.test.ts --timeout 60000 -t "masked WebP" --rerun-each 10: 10 pass, 0 fail, 290 assertions, 91.52s under eight yes processes; load average 8.47 to 23.97. All owned load processes stopped; pgrep -l yes returned none.
- git diff --check: clean. Worktree clean after commit.

Full check/check:all deliberately not run per step instructions; check stage owns the full gate. Original pre-fix reproduction remains the explicitly recorded, review-accepted gap; no claim of a reproduced failure. No other unmet Done-when item. No shared install changed and no unrelated checkout written.

Review: approved (4/5)
review#2 of proof:02, whole diff 0a2079e...cd1e830: two commits, test/runner.slow.test.ts only (+15/-2). Verdict: approved. R1 is fixed in the live tree; no new findings.

R1 (review#1): fixed. The false "(frame-precision encoding, keyframe seeking)" claim is gone from live code. `rg -n "keyframe" .` → exit 1 (no matches); `rg -n -i "accurate.seek" .` → exit 1; `rg -n "frame-precision encoding" .` → exit 1. Search proven working: `git show 36e372c:test/runner.slow.test.ts | grep -n keyframe` → line 308 held the old phrase. New comment test/runner.slow.test.ts:305-308 states the accepted cause verbatim: "The recording may lag the wall-clock `at` under load, so sampling exactly there can still show the previous paint." No live file justifies `-ss` position; sampler at :319-326 keeps `-ss` after `-i` with no claim, which R1 allowed ("keep -ss where it is with no claim about why"). Historic subject of 36e372c still reads "with accurate seek" but that is dated history; do#2 stated no history rewrite and the live tree repeats the claim nowhere (searches above). Not held as a finding.

What to build:
- Find runner vs test bug: done. Runner records `at` after screenshot+renderFrame (src/runner/capture.ts:123-126 `const at = Math.max(`) and holds pace.hold after (capture.ts:141-143); README:213 defines `at` as "seconds at the post-action screenshot" and README:224 "Video is sampled/encoded at frame precision". Runner unchanged (`git diff base...HEAD -- src/ README.md package.json` empty), so README still matches. Shrinking-margin mechanism (paint 0.1-0.2s before `at` unloaded, <0.1s under load) stands from do#1; review#1 accepted it.
- Fix the wrong side: done in test. test/runner.slow.test.ts:310 `SAMPLE_OFFSET = 0.3`, :314-317 `sampleAt = min(at+0.3, next.at-0.05 / Infinity last)`, :319-334 ffmpeg decode + sharp pixel at (1000,50), :344-345 pixel assertions byte-identical to base.

Settled decisions: gate/landGate unchanged (package.json:14-15 `check`/`check:all` untouched; diff name-only = test/runner.slow.test.ts). Assertions byte-identical. No retries: `rg -n -i "retry|rerun-each|heal" test/runner.slow.test.ts src/runner/capture.ts` → exit 1. No runner healing.

Tests / Done when:
- "Tests first: get it to fail first": missing, pushed back (same reason review#1 accepted). do#1 ran 24x under load with no failure; review#1 ran base 10x under 8x yes (load 22→36) 10 pass. Flake never reproduced here; mechanism + offset fix (a task-offered option) stands. Not held open.
- Done-when `bun test test/runner.slow.test.ts --timeout 60000 -t "masked WebP" --rerun-each 10` under load: done on current HEAD by do#2: 10 pass, 0 fail, 290 assertions, 91.52s under 8x yes, load 8.47→23.97, load procs cleaned (`pgrep -l yes` now exit 1). Sampler identical between 36e372c and cd1e830 (`git diff 36e372c..cd1e830` = comment-only 3-line change), so review#1's independent 10-pass run (load 6.5→18) and reversal still apply to this sampler. Reversal: SAMPLE_OFFSET=-0.4 → `Expected: < 50 Received: 253` at runner.slow.test.ts:345, 0 pass 1 fail — test still catches a frame not showing the step's state. Tolerates state appearing up to 0.3s after `at`, which the task allows ("small, documented offset").
- "README still matches if runner changed": runner unchanged, met trivially.
- landGate discharged by check#2: `bun run check:all` at cd1e830, "Ran 13 tests across 1 file. [54.64s]". Brief's check.command is `bun run check:all`; that is the pass named, not the Done-when rerun command.

Comments: read todo/02-stabilise-the-video-frame-check-in-the-slow-runner-test.md (no Comments section, `grep -c '^### @'` = 0) and brief Pre-start (none). 0 comments, no authors; nothing to walk.

nzila commits: 36e372c + cd1e830, both test-only, answer the task rule; no branch hygiene issue. Base 0a2079e outside diff.

Quantities re-derived from repo, not summary: pace test/runner.slow.test.ts:210 `{ chapter: 300, action: 300, hold: 600 }`; gap assertion :284-285 `>= hold+chapter+action` = 1200ms = 1.2s; SAMPLE_OFFSET 0.3 + clamp 0.05 = 0.35 < 1.2 so clamp never bites here; last step uses Infinity with >=0.6s held tail (capture hold + :295-296 chapter ends >= at+hold). Comment :309 documents both bounds.

Other checks: no fixture encodes the bug (pixel thresholds unchanged); no constraint dropped; no new cost (same 2 ffmpeg decodes, new arithmetic only); no migration; no text predicate added (Math.min clamp classes: gap<0.35 would clamp, gap>=0.35 samples at+0.3; current generator cannot produce gap<1.2 per :284-285, so clamp is future-proofing, last-step Infinity covered); reads-once per step, no cross-crash state; colocated test in test/; no new UI/screenshots. `bun run lint` exit 0 ("All matched files use correct format", 35 files, 0 warnings; base 0); `bun run typecheck` exit 0; `git diff --check` exit 0; worktree clean; no scratch worktree or load procs left.

Scores: correctness 5 (test-side sampling inside held interval, edge cases clamped), scope 5 (exactly the test, nothing else), tests 4 (Done-when passes + reversal pins, but pre-fix repro never achieved), quality 5 (comment now accurate, no stale claims).

Branch: nzila/01M65DNX7A8XPYDJ7XTD9E94BC

nzila run 01M65DNX7A8XPYDJ7XTD9E94BC
