---
title: The proof helper runs a project's scenarios on Playwright and writes manifest
  version 1
tags: [needs-review]
triage: '{"complexity": "complex", "risk": "medium", "workDomains": ["backend"], "areas": ["proof", "epic-step-1"], "uncertainty": [], "rationale": "Approved epic step 1: The proof helper runs a project''s scenarios on Playwright and writes manifest version 1. Owner reads under the approved review-tier rule.", "rubricVersion": 1}'
group: A run shows its work
completed_at: 2026-10-24T04:58:31Z
outcome: completed
---
**Why.** A proof contract that names no tool still needs a helper;
this open one is what most projects use to meet it.

**What to build.** The repository's first package, `@lemol/proof`
(Bun, TypeScript, Playwright 1.59 or later as a peer). The README is
the manifest's specification, version 1, with one example manifest per
case (all passed, a failed step, a scenario with no video). A project
writes domain actions as functions of a page and scenarios as
sequences of actions; `run` takes a launch function, the scenario ids
from `PROOF_SCENARIOS` and the directory from `PROOF_DIR`,
and for each action opens a video chapter with its name, runs it,
takes a WebP screenshot, groups it in the trace, and appends the step
with its offset. It fixes the clock, reduces motion, applies the masks
a scenario names, writes WebVTT chapters, uses the system's Chromium
when present, and exits 0, 1 or 3 as the contract says.

**Tests first.** A fixture page proved twice gives the same steps and
screenshots; a failing step records its expectation and error and
exits 1; no browser exits 3; every example manifest decodes; a step's
chapter offset matches its screenshot.

**Done when.** The tests pass in the repository's own check, and the
README specifies manifest version 1 completely enough that a consumer
can parse it without importing the package.

**Also.** The repository stands alone: its own `bun.lock`, a CI
running its check, and the first release tagged `proof@0.1.0`.

**Out of scope.** Starting the app; retries or healing; pixel
comparison; publishing to a package registry.

**Review.** `needs-review`: it sets a public contract, the manifest.

**Docs.** Refine the owning repository's specification for this deliverable.

**Pairing.** No prerequisites; this starts the epic.

## Comments

### @codex at 2026-10-24 04:58:26 +00:00

Final verification is green in a standalone frozen installation: 36 unit tests + 9 browser/process tests, including the new regression preserving screenshots when renderer delivery fails. The matching Playwright 1.59 Chromium and system Chrome were both exercised. README manifest examples decode; package exports resolve independently; CI YAML parses and runs the full gate. Independent review reports no remaining Critical/Important findings.

Implementation commit: 7b73977. Local annotated release tag proof@0.1.0 points to that verified commit. No push or package registry publication. Task 1 is complete; branch integration remains the user's choice.

### @codex at 2026-10-24 04:57:09 +00:00

Implemented the approved Bun/Effect 4 + Playwright helper, standalone lockfile and CI, manifest v1 decoder and README specification with passed/failed/no-video JSON examples. The runner captures WebP screenshots, trace groups, video and WebVTT chapters, handles selection/environment input, deterministic browser defaults, system-browser discovery and scoped cleanup.

Verified standalone frozen installation and package exports; its full gate passes with Playwright 1.59 and the matching Chromium: 36 unit tests and 9 browser/process tests. Coverage includes repeated screenshot bytes, decoded video frame alignment, action failures, no video, browser absence, missing encoder, paused clocks, cleanup/capture errors, empty finalized video and retaining screenshots after renderer failure. Independent review has no remaining Critical/Important findings.

Finishing the final gate and local proof@0.1.0 release bookkeeping.
