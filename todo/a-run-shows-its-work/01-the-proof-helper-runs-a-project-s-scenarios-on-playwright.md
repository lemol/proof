---
title: The proof helper runs a project's scenarios on Playwright and writes manifest
  version 1
tags: [needs-review]
delivers: ../project1/product/projects/2026-10-23-a-run-shows-its-work
triage: '{"complexity": "complex", "risk": "medium", "workDomains": ["backend"], "areas": ["proof", "epic-step-1"], "uncertainty": [], "rationale": "Approved epic step 1: The proof helper runs a project''s scenarios on Playwright and writes manifest version 1. Owner reads under the approved review-tier rule.", "rubricVersion": 1}'
---
Delivers [A run shows its work](../../../project1/product/projects/2026-10-23-a-run-shows-its-work/README.md), [approved epic task plan, step 1](../../../project1/product/projects/2026-10-23-a-run-shows-its-work/epic-task-plan.md), and [tech plan](../../../project1/product/projects/2026-10-23-a-run-shows-its-work/tech-plan.md).

**Why.** [Tech plan](../../../project1/product/projects/2026-10-23-a-run-shows-its-work/tech-plan.md) §3 *The contract* and *The helper*,
order step 1; [decision](../../../project1/strategy/decisions/2026-10-23-a-proof-contract-and-an-open-playwright-helper.md).
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
