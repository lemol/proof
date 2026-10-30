# @lemol/proof

Replay project-owned Playwright scenarios and leave named screenshots, a video,
WebVTT chapters, a trace and `manifest.json`. MIT licensed. Bun + TypeScript;
no dependency on any other lemol package.

The project owns starting and seeding its app and writing its actions. Proof
owns browser capture and the manifest. It does not retry, heal, compare pixels,
provision an app or download browsers while running a proof.

## Install and prepare

Source releases use `proof@<version>` tags, starting with `proof@0.1.0`.
There is no package registry publication. Install a released tag with Bun:

```sh
bun add 'git+https://github.com/lemol/proof.git#proof@0.1.0'
bun add effect@4.0.0 playwright@1.59.0
```

Requires Bun ≥1.4.2, Effect exactly 4.0.0 and Playwright ≥1.59.0, <2.
Playwright is a peer; projects use their own installed version. Screenshot
conversion uses sharp's native binaries on its supported platforms.

Install browser/video prerequisites once, separately from proving:

```sh
bunx playwright install chromium ffmpeg
```

A system Chromium/Chrome may replace the browser install. Discovery prefers an
explicit `executablePath`, then system Chromium/Chrome in standard locations,
then Playwright's installed Chromium. An invalid explicit path rejects;
it does not fall back. Video requires Playwright's installed FFmpeg even when
the browser comes from the system. `video: false` does not require FFmpeg.
Linux browser libraries can be provisioned with Playwright's `--with-deps`.

## Write a project kit

Domain actions are ordinary async functions of a Playwright page, wrapped in
objects with explicit names. Assertions throw to fail a step; `expected` is
its optional explanation for a reviewer, not an automatically checked assertion.

```ts
import { run, type Action, type Scenario } from "@lemol/proof"

const openBrowse: Action = {
  name: "openBrowse",
  expected: "The task list is visible",
  run: async (page) => {
    await page.goto("/browse")
    await page.getByRole("heading", { name: "Tasks" }).waitFor()
  },
}

const openTask: Action = {
  name: "openTask",
  expected: "The selected task is open",
  run: async (page) => {
    await page.getByRole("link", { name: "Example task", exact: true }).click()
    await page.getByRole("heading", { name: "Example task" }).waitFor()
  },
}

const browse: Scenario = {
  id: "browse/open-task",
  actions: [openBrowse, openTask],
  masks: ["[data-proof-dynamic]"],
}

const result = await run({
  // A kit may start/seed its app here and return the matching cleanup.
  // This example uses an app the project already started.
  launch: async () => ({
    baseURL: "http://127.0.0.1:3000",
    close: async () => {},
  }),
  scenarios: [browse],
})

if (result.outcome === "skipped") console.error(result.reason)
process.exitCode = result.exitCode
```

Run the kit against an existing empty directory:

```sh
mkdir proof-output
PROOF_DIR="$PWD/proof-output" \
PROOF_SCENARIOS='browse/open-task' bun proof/run.ts
```

Scenario ids correspond to project scenario file paths without their extension;
the project registers them explicitly. The helper does not scan files or infer
function names. Repeated action names are allowed. Duplicate scenario ids,
empty action lists, blank names, unknown selected ids and empty selection reject
before app launch. Selection order is preserved; duplicate selected ids and
blank lines are ignored. Each scenario gets a fresh context/page. An action
failure stops that scenario; the remaining selected scenarios still run.

`launch` is called once after configuration, output and browser checks. Its
`baseURL` must be HTTP(S); `close` releases project-owned resources. The helper
closes acquired resources on success and failure, including when capture fails.
A callback that fails before returning its resources must clean them up itself.

## Options and environment

`run(options)` returns a Promise. `launch` and `scenarios` are required.
The package root and `@lemol/proof/runner` export the same authoring API.
`@lemol/proof/manifest` exports `ManifestSchema`, `decodeManifest`, `Manifest`,
`ScenarioProof` and `StepProof`. Consumers can implement the JSON contract below
without importing any of these exports.

| Input | Meaning |
| --- | --- |
| `PROOF_DIR` | Existing empty directory for all artifacts |
| `PROOF_SCENARIOS` | Scenario ids, one per line; no selection is an error |
| `directory`, `scenarioIds` options | Explicit directory and array of ids override those environment variables |
| `PROOF_HEAD` | Caller-owned commit identity; not included in manifest v1 |
| `PROOF_CACHE` | Available to project provisioning; the helper never reads or writes it |
| `executablePath`, `headless` | Explicit browser executable, optional; headless defaults to `true` |
| `args` | Extra Chromium command-line switches, passed to the launch as given; default none |
| `viewport` | Defaults to `{ width: 1280, height: 800 }`; a scenario may override it |
| `fixedTime` | Fixed browser date, default `2026-01-01T00:00:00.000Z`; timers keep running |
| `locale`, `timezoneId` | Defaults `en-US`, `UTC` |
| `deviceScaleFactor`, `colorScheme` | Defaults `1`, `light` |
| `timeout` | Playwright operation/navigation timeout in milliseconds, default `10000` |
| `pace` | Recording pace in milliseconds, so a person can follow the video: `chapter` shows the action's name and `expected` before it runs, `action` highlights each click, fill or key press and pauses before it lands, `hold` keeps each step's captured state on screen. Defaults `{ chapter: 1500, action: 1000, hold: 1500 }`; `0` turns a part off. Scenarios without video are not paced |
| Scenario `masks` | CSS selectors masked in screenshots |
| Scenario `video` | Defaults to `true`; `false` omits video and chapters |

Screenshots disable animations, hide carets and use CSS pixel resolution. Actions
own readiness waits and fixture data; fixed browser time cannot make a live server,
random data, network responses or different fonts deterministic. Video and elapsed
offsets are real time and may differ across runs even when screenshots match.
`timeout` bounds browser operations; it cannot cancel an arbitrary project Promise.

Masks cover screenshots only. Videos and trace DOM/network snapshots may contain
unmasked content. Use seeded, nonsecret data for the whole scenario.

## Result and command exit codes

| Code | Result | Manifest |
| --- | --- | --- |
| `0` | `{ outcome: "passed", exitCode: 0, manifest }`; all scenarios passed | Required |
| `1` | `{ outcome: "failed", exitCode: 1, manifest }`; an action failed | Required, including failure screenshot |
| `3` | `{ outcome: "skipped", exitCode: 3, reason }`; no browser/display available | Absent; print the reason |

The library never exits the process. The project script assigns the returned
exit code. Invalid configuration, app startup errors, browser crashes, missing
video encoder, capture/write errors and cleanup failures reject. Partial files
may remain, but no completed manifest is published. `ProofError` carries a
`stage`, `message` and original `cause`; combined cleanup failures are retained.

An uncaught rejection commonly exits Bun with `1`, which overlaps the completed
failure code. Readers must require a valid manifest on exits `0` and `1`;
missing/invalid manifest means a crash. A project may catch infrastructure errors
and exit with another code, such as `2`. Exit `3` is reserved for browser/display
absence, never app or encoder failures.

## Manifest specification: version 1

`manifest.json` is a UTF-8 JSON object, published last by an atomic rename after
capture, finalization, cleanup, validation and existence checks on all referenced
files. Artifacts are relative to its containing directory. JSON examples below
specify the format; their referenced media are illustrative, not bundled fixtures.

| Field | Required | Type and meaning |
| --- | --- | --- |
| `version` | Yes | Integer literal `1`; unknown versions are rejected |
| `scenarios` | Yes | Nonempty array of scenario objects, in requested order |
| Scenario `id` | Yes | Nonblank string, unique in the manifest |
| Scenario `outcome` | Yes | `passed` or `failed` |
| Scenario `steps` | Yes | Nonempty array of executed steps, in action order |
| Scenario `video` | No | Relative path to the scenario's WebM recording |
| Scenario `chapters` | No | Relative path to its UTF-8 WebVTT chapters |
| Scenario `trace` | No | Relative path to a trace ZIP; this helper always writes one |
| Step `action` | Yes | Nonblank domain action name; repeats are allowed |
| Step `outcome` | Yes | `passed` or `failed` |
| Step `expected` | No | Nonblank human-readable expectation supplied by the action |
| Step `error` | On failure | Nonblank diagnostic; required for failed steps, absent on passed steps |
| Step `screenshot` | Yes | Relative path to the post-action WebP screenshot, including on failure |
| Step `at` | Yes | Finite, nonnegative number of seconds at the post-action screenshot |

Paths are nonempty relative POSIX paths. Reject absolute paths, backslashes,
colons, ASCII control characters (including DEL), empty segments, `.` and `..`
segments. All references must name files under the proof directory; readers
serving files must also enforce containment after filesystem/symlink resolution.
The helper uses ordinal directories and step filenames, never scenario ids in
artifact paths. It refuses nonempty output directories.

Offsets are nondecreasing within a scenario. With video, they are relative to
its first recorded frame, calibrated from its first delivered screencast frame
and rounded to milliseconds. Video is sampled/encoded at frame precision, not
millisecond precision. Without video, they are elapsed scenario seconds with
the same rounding. `video` and `chapters` are either both present or both absent.

Each chapter is named after an action. Its cue starts where the previous one
ends (zero for the first) and ends after this step's `pace.hold`: it spans the
chapter card, the action and its captured state held on screen, and this step's
`at` falls within it. WebVTT text escapes `&`, `<` and `>` and flattens
line breaks. Cue durations are at least one millisecond; coincident boundaries
are advanced by one millisecond in the chapter file to retain valid cue ordering.
The manifest retains its measured offsets.

A failed scenario has exactly one failed step, at the end; unexecuted later
actions are absent. A passed scenario has only passed steps. A scenario's outcome
must agree with its steps. Unknown additional object fields may be ignored;
unknown versions, outcomes and malformed required fields must be rejected.

### All passed

```json
{
  "version": 1,
  "scenarios": [
    {
      "id": "browse/open-task",
      "outcome": "passed",
      "steps": [
        {
          "action": "openBrowse",
          "outcome": "passed",
          "expected": "The task list is visible",
          "screenshot": "scenario-001/step-001.webp",
          "at": 1.25
        },
        {
          "action": "openTask",
          "outcome": "passed",
          "screenshot": "scenario-001/step-002.webp",
          "at": 2.5
        }
      ],
      "video": "scenario-001/video.webm",
      "chapters": "scenario-001/chapters.vtt",
      "trace": "scenario-001/trace.zip"
    }
  ]
}
```

### Failed step

```json
{
  "version": 1,
  "scenarios": [
    {
      "id": "review/post",
      "outcome": "failed",
      "steps": [
        {
          "action": "postReview",
          "outcome": "failed",
          "expected": "The review appears in the run",
          "error": "Expected review to be visible",
          "screenshot": "scenario-001/step-001.webp",
          "at": 1.5
        }
      ],
      "video": "scenario-001/video.webm",
      "chapters": "scenario-001/chapters.vtt",
      "trace": "scenario-001/trace.zip"
    }
  ]
}
```

### No video

```json
{
  "version": 1,
  "scenarios": [
    {
      "id": "browse/no-video",
      "outcome": "passed",
      "steps": [
        {
          "action": "openBrowse",
          "outcome": "passed",
          "screenshot": "scenario-001/step-001.webp",
          "at": 0.125
        }
      ],
      "trace": "scenario-001/trace.zip"
    }
  ]
}
```

## Development

```sh
bun install --frozen-lockfile
bun run check       # lint, typecheck, unit tests
bun run check:all   # also real-browser and process tests
bun run fix         # oxlint fixes and bun fmt
```

The browser tier requires a browser, Playwright FFmpeg, system `ffmpeg` for frame
extraction, and `unzip` for inspecting trace groups. It fails when these are
missing. The tier runs on Playwright's installed Chromium, not a system Chrome
(`test/browser.ts`); `PROOF_TEST_BROWSER` selects another executable. CI
provisions these explicitly and checks the oldest supported Playwright version.
The standalone lockfile installs from a lone clone; workspace installs belong
to the workspace root.

The approved implementation design is in [docs/specs/proof-runner.md](docs/specs/proof-runner.md).
