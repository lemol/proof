# Task 1: proof runner and manifest version 1

Status: approved; implemented.
Delivers: task 01, `A run shows its work`.

The package must replay project-owned scenarios, preserve what happened,
and leave a format any consumer can parse independently. It does not
start the app, retry actions, compare pixels or publish packages.

## Package choices

Use Bun and strict TypeScript with the sibling libraries' compiler flags,
oxlint, `bun fmt` and local blank-line rule. Copy the small lint configuration
into this repo so a lone clone works. Use `bun:test`.

| Package | Role |
| --- | --- |
| `effect`, exact `4.0.0`, peer + dev | Manifest schemas, typed infrastructure failures, scoped cleanup |
| `playwright`, peer `>=1.59.0 <2`, exact `1.59.0` dev | Browser library, tracing, screencast and chapter overlays |
| `sharp`, runtime dependency | Masked PNG capture to lossless WebP on Playwright 1.59 |
| `@types/bun`, TypeScript, oxlint, `@stylistic/eslint-plugin`, dev | Same tooling family as the sibling libraries |

Pin installed versions in this repository's own lockfile. Match sibling
tooling versions where available. No platform package is needed merely to
wrap browser promises; add `@effect/platform-bun` only if an actual runtime
API requires it. No dependency on another lemol package is required.

Alternatives considered: a Promise-only implementation reduces dependencies
but adds bespoke decoding and cleanup conventions; Effect-native project
actions match internal composition but burden authors with a second API.
Recommendation: Effect internals with ordinary async project actions.

Playwright 1.59's published types expose screenshot `png | jpeg`, while
`page.screencast.showChapter` is available. Conversion preserves the agreed
minimum instead of assuming a newer screenshot API. `sharp` supports
lossless WebP. Verify against the installed 1.59 types and a real browser.

## Modules and API

- `src/manifest`: pure v1 schema, inferred types, decoding and semantic
  checks. Imports only `effect`. Exports `@lemol/proof/manifest`.
- `src/runner`: action/scenario definitions, browser discovery, capture,
  chapters, output and orchestration. Imports `manifest`, Effect,
  Playwright, sharp and Bun/Node primitives. Exports
  `@lemol/proof/runner`; the package root re-exports the authoring API.
- `test/`: module-boundary checks and real-browser integration tests.
- `examples/manifests/v1/`: passed, failed and no-video JSON fixtures.

Explicit action names are data, never inferred from JavaScript function
names. An action is `{ name, expected?, run: (page: Page) => Promise<void> }`.
A scenario is `{ id, actions, masks?, viewport?, video? }`; masks are CSS
selectors applied by the capture adapter. Duplicate ids, empty scenarios,
empty action names and unknown selected ids are configuration errors.
Repeated action names are allowed; array order identifies a step.

`run({ launch, scenarios, ...options })` returns a Promise of a discriminated
result with exit code `0 | 1 | 3`; infrastructure errors reject. The project
script awaits it and assigns `process.exitCode`. The library never calls
`process.exit`. A separate Effect entry point is unnecessary for v1.

`launch` means the project's app launch callback: it returns a base URL
and an async cleanup function. Proof owns browser launch and contexts;
the project owns starting and seeding its app. Invoke the callback only
after selection, configuration and browser availability checks pass,
and always clean it up after a successful acquisition. The callback may
return the URL of an app already running with a no-op cleanup function.

Each scenario gets a fresh browser context and page. Actions navigate and
assert using normal Playwright APIs; assertions throw on failure. Scenarios
run sequentially in requested order. Stop a scenario at its first failure,
then run the remaining selected scenarios in fresh contexts.

## Inputs and deterministic capture

Default inputs are `PROOF_DIR` and newline-separated
`PROOF_SCENARIOS`; explicit options may override them for local use
and tests. Ignore blank selection lines, deduplicate ids in first-seen
order, and reject an empty selection. Never silently run every scenario.
Validate the entire selection before launching anything.

Require an existing empty output directory. Artifact names use scenario
and step ordinals, not untrusted ids. Never overwrite an earlier proof.
`PROOF_HEAD` belongs to the caller's record, not manifest v1;
`PROOF_CACHE` is available to the project's launch/provisioning code,
but the helper does not interpret or populate it.

Use fixed defaults for viewport (1280×800), locale (`en-US`), timezone
(`UTC`), device scale (1), color scheme (`light`), reduced motion, and
browser date (`2026-01-01T00:00:00.000Z`); allow explicit overrides.
Set the date before the app loads, keeping timers running so waits work.
Disable animations and hide carets for screenshots. Project actions own
readiness waits and seeded app data; no arbitrary settling sleeps.

Prefer an explicitly supplied executable, then installed system Chromium
or Chrome, then an already installed Playwright Chromium. Do not download
anything. An invalid explicit executable is a configuration error.
Missing browser/display is exit 3 with a diagnostic. Browser crashes,
missing encoding tools, app startup errors and artifact-write failures
are infrastructure failures, not a claim that nothing can be proved.

Before each action, open a trace group and show its chapter title when
video is enabled. After it resolves or throws, remove chapter overlays,
capture the masked screenshot and record its position in the video.
Close trace groups even after failure. Finalize video and trace before
publishing a manifest.

Masks apply to screenshots. They are not a promise of redaction in video
or trace DOM/network snapshots; document this limit explicitly in the
public README. Scenarios must use seeded nonsecret fixture data.

## Manifest v1 semantics

Preserve the approved shape:

```text
{ version: 1, scenarios: [{ id, outcome: "passed" | "failed",
  steps: [{ action, outcome: "passed" | "failed", expected?, error?,
            screenshot, at }], video?, chapters?, trace? }] }
```

File paths are nonempty relative POSIX paths under the output directory:
no absolute paths, backslashes, `.` or `..` segments. Referenced files
must exist when the helper publishes the manifest. JSON examples are
format fixtures, not bundles of referenced media.

`expected` is the action's optional human-readable expectation; `error`
is a nonempty diagnostic required on a failed step and absent on passed
steps. An action rejection is normalized to a string without assuming it
is an Error. Infrastructure failures do not masquerade as action failures.

`at` is a finite nonnegative number of seconds from the start of the
scenario recording to the post-action screenshot, rounded to milliseconds.
Offsets are nondecreasing. With no video, `at` is elapsed scenario time
with the same units, and `video` and `chapters` are both absent.

WebVTT chapter cues use action names in order. Each cue spans the preceding
capture boundary (zero for the first) through this step's capture offset;
the screenshot is the state at that chapter's end. Escape cue text, use
valid positive cue durations, and preserve ordering for very fast actions.
Calibrate offsets to the recording's first frame, not the browser's fixed
wall clock. Integration tests must check actual recording alignment;
subtracting two arbitrary host timestamps is insufficient proof.

A scenario is failed exactly when a recorded step failed. Its final step
is the only failed one; later actions are absent. All scenarios have at
least one step, and ids are unique. Exit 0 means every scenario passed;
exit 1 means one or more failed. Exit 3 has a diagnostic and no manifest.
Infrastructure failures reject. An uncaught rejection may also exit Bun with 1;
readers distinguish it from a completed scenario failure by requiring a valid
manifest. A project script may catch infrastructure errors and exit 2.

Write `manifest.json` last, using a temporary file and rename, after
decoding the assembled manifest and checking referenced artifacts. A
failure to capture a failed step's screenshot leaves an infrastructure
failure and partial artifacts, rather than an invalid completed manifest.

The README will contain every field, unit, invariant, omission rule, exit
code and the three full examples. A consumer must be able to implement a
decoder from that document alone. Unknown versions are rejected; additive
unknown object fields may be ignored by readers.

## Verification and delivery

Unit tests cover schemas and every example, invalid paths and semantic
inconsistencies, selection, chapter formatting, and browser-discovery
classification. Boundary checks keep Playwright and filesystem imports out
of `manifest`.

Real-browser tests serve an isolated fixture and prove it twice: identical
action order and WebP bytes with fixed data/time and masks. They also
verify a failed action's expectation/error/screenshot, a no-video scenario,
readable trace groups, chapter alignment with captured states, and cleanup
on success and failure. A process test verifies exit 0/1/3 and that an
infrastructure failure does not return one of those successful outcomes.

`check` runs lint, typecheck and unit tests. `check:all` adds browser and
process tests. CI installs an explicit Chromium and the required video
encoder, then runs `check:all`; browser absence fails this test tier.

Validate installation and the full gate in an isolated standalone copy
with its own lockfile.

Release scope is a local `proof@0.1.0` tag after the full gate and contract
review; no registry publication. Do not mark task 1 done before that proof
and its public contract review are complete.

## API references checked

- [Playwright 1.59 types](https://raw.githubusercontent.com/microsoft/playwright/v1.59.0/packages/playwright-core/types/types.d.ts)
- [Screencast and chapter overlays](https://playwright.dev/docs/api/class-screencast)
- [Trace groups](https://playwright.dev/docs/api/class-tracing#tracing-group)
- [Fixed date with running timers](https://playwright.dev/docs/api/class-clock#clock-set-fixed-time)
- [sharp WebP output](https://sharp.pixelplumbing.com/api-output/#webp)
