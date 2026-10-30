---
title: A bare bun test also runs the docs reproduction and launches Chromium
group: A run shows its work
completed_at: 2026-10-30T20:11:34Z
outcome: completed
---
#### Why

Task 08's review noted that `docs/reproductions/bun-playwright-matchers.test.ts`
matches Bun's default test glob. A bare `bun test` with no path collects it.
Through `bunfig.toml`'s preload, it then launches Chromium and runs four
multi-second browser cases. No script does this today: `test:unit` names
`src test/boundaries.test.ts`, and `test:slow` names the slow file. But a
contributor who types `bun test` gets a slow browser run they did not ask
for, and it fails where no Chromium is installed.

#### What to build

Keep the reproduction out of the default collection without changing its
contents: an upstream issue carries it verbatim. For example, set
`[test] root` in `bunfig.toml`, or document the exact command next to the
file. Keep the research doc's commands accurate.

#### Done when

- A bare `bun test` from the repository root collects only proof's own
  suites. The reproduction still runs with the command its research doc
  gives.
