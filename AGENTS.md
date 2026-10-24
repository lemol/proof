# AGENTS.md

proof is an open Bun + TypeScript helper for replaying a project's scenarios
on Playwright and writing a versioned proof manifest. It ships as one
standalone package, `@lemol/proof`.

## Read first

- [README.md](README.md) is the public entry point. Task 1 makes it the
  complete specification of manifest version 1, with JSON examples.
- [Task 1 design](docs/specs/proof-runner.md)
  records the approved package choices, API and module boundaries.
  Do not describe planned behavior as shipped before implementation.
- Work lives in [todo/TODO.md](todo/TODO.md). Use the `todo` CLI for task
  changes; run `todo --help` to discover its commands.

## Rules

- **Standalone library.** No `workspace:*` dependencies, sibling imports,
  or dependency on nzila or xonton. Keep a standalone `bun.lock` and CI.
  Workspace composition belongs to the workspace repository.
- **Tool-independent manifest.** The JSON contract must be implementable
  and parseable without importing this package, Effect or Playwright.
  Update the README, decoder and example manifests together.
- **Small boundaries.** The proposed `manifest` module is pure and imports
  only `effect`; `runner` owns browser capture and filesystem effects and
  imports `manifest`. Internal imports use relative paths. No event store,
  service framework or CLI command tree is needed for task 1.
- **The project owns its app.** Never start it implicitly, provision it,
  retry or heal its scenarios, or download a browser during a proof.
- **Preserve failure evidence.** A failed action still gets a screenshot
  when capture is possible. Capture and cleanup errors must not silently
  turn an incomplete proof into a passing or skipped one.
- **Tests are colocated.** `foo.test.ts` lives beside `foo.ts`; module fakes
  live in `testing.ts` when needed. Cross-module suites go under `test/`.
  Give browser tests isolated temporary directories and fixture servers.
- **Style follows the sibling libraries.** Strict TypeScript, oxlint and
  oxfmt; separate control flow and returns with blank lines. Carry the
  lint configuration with this repository, never import a sibling's file.
- **Verification.** Task 1 must add `bun run check` for lint, typecheck and
  unit tests, and `bun run check:all` including real-browser tests. CI runs
  the full gate; missing browsers cannot silently skip that tier.
- **Effect version.** Use an exact `effect` peer and development dependency
  matching the lemol libraries (currently `4.0.0`). Change it deliberately
  with its consumers, never select `latest` independently.
- **Design docs.** Keep durable specs in `docs/specs/` with descriptive,
  undated filenames. Do not Git-track `docs/superpowers/` artifacts.
- **Docs stay local.** Keep module details with the module. Do not copy
  nzila's event-sourcing, adapter graph or surface-parity rules here.

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required. When the
workspace install resolves it elsewhere, locate that package's AGENTS.md.

For APIs and concepts the guide does not cover, search the installed
`effect/src` source.
