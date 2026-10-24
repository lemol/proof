---
title: The proof helper runs a project's scenarios on Playwright and writes manifest
  version 1
tags: [needs-review]
delivers: ../project1/product/projects/2026-10-23-a-run-shows-its-work
triage: '{"complexity": "complex", "risk": "medium", "workDomains": ["backend"], "areas": ["proof", "epic-step-1"], "uncertainty": [], "rationale": "Approved epic step 1: The proof helper runs a project''s scenarios on Playwright and writes manifest version 1. Owner reads under the approved review-tier rule.", "rubricVersion": 1}'
group: A run shows its work
completed_at: 2026-10-24T04:58:31Z
outcome: completed
---
Delivers [A run shows its work](../../../../project1/product/projects/2026-10-23-a-run-shows-its-work/README.md), [approved epic task plan, step 1](../../../../project1/product/projects/2026-10-23-a-run-shows-its-work/epic-task-plan.md), and [tech plan](../../../../project1/product/projects/2026-10-23-a-run-shows-its-work/tech-plan.md).

**Why.** [Tech plan](../../../../project1/product/projects/2026-10-23-a-run-shows-its-work/tech-plan.md) §3 *The contract* and *The helper*,
order step 1; [decision](../../../../project1/strategy/decisions/2026-10-23-a-proof-contract-and-an-open-playwright-helper.md).
The product's proof contract names no tool; this open helper is what
most projects use to meet it.

**What to build.** The repository's first package, `@lemol/proof`
(Bun, TypeScript, Playwright 1.59 or later as a peer). The README is
the manifest's specification, version 1, with one example manifest per
case (all passed, a failed step, a scenario with no video). A project
writes domain actions as functions of a page and scenarios as
sequences of actions; `run` takes a launch function, the scenario ids
from `NZILA_PROVE_SCENARIOS` and the directory from `NZILA_PROVE_DIR`,
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
README specifies manifest version 1 completely enough that nzila can
parse it without importing the package.

**Also.** The repository stands alone as the workspace's libraries do:
its own `bun.lock`, a CI running its check, the first release tagged
`proof@0.1.0`, and its place in the workspace's verification order
(after ui, before nzila).

**Out of scope.** Starting the app; retries or healing; pixel
comparison; publishing to a package registry.

**Review.** `needs-review`: it sets a public contract, the manifest.

**Docs.** Refine the owning repository's specification for this deliverable; it names the project with `delivers:` and agrees with the approved tech plan.

**Pairing.** No prerequisites; this starts the epic.

## Comments

### @codex at 2026-10-24 04:58:26 +00:00

Final verification is green in both the composed checkout and a standalone frozen installation: 36 unit tests + 9 browser/process tests, including the new regression preserving screenshots when renderer delivery fails. The matching Playwright 1.59 Chromium and system Chrome were both exercised. README manifest examples decode; package exports resolve independently; CI YAML parses and runs the full gate. Independent review reports no remaining Critical/Important findings.

Implementation commit: 7b73977. Local annotated release tag proof@0.1.0 points to that verified commit. Workspace verification-order commit: 396821a. No push or package registry publication. Task 1 is complete; branch integration remains the user's choice.

### @codex at 2026-10-24 04:57:09 +00:00

Implemented the approved Bun/Effect 4 + Playwright helper, standalone lockfile and CI, manifest v1 decoder and README specification with passed/failed/no-video JSON examples. The runner captures WebP screenshots, trace groups, video and WebVTT chapters, handles selection/environment input, deterministic browser defaults, system-browser discovery and scoped cleanup.

Verified standalone frozen installation and package exports; its full gate passes with Playwright 1.59 and the matching Chromium: 36 unit tests and 9 browser/process tests. Coverage includes repeated screenshot bytes, decoded video frame alignment, action failures, no video, browser absence, missing encoder, paused clocks, cleanup/capture errors, empty finalized video and retaining screenshots after renderer failure. Independent review has no remaining Critical/Important findings.

Workspace verification now runs proof after ui and before nzila; root TypeScript, 98 unit tests and composition checks pass. Coordinated workspace commit: 396821a. Finishing the composed checkout's final gate and local proof@0.1.0 release bookkeeping.
