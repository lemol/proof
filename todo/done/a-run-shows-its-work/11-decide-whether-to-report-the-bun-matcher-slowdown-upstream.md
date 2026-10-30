---
title: Decide whether to report the Bun matcher slowdown upstream
tags: [upstream, needs-person]
group: A run shows its work
completed_at: 2026-10-30T20:07:06Z
outcome: completed
---
#### Why

Task 08 reduced the slow `expect(promise).rejects` / `.resolves` over
Playwright to a single-file reproduction,
`docs/reproductions/bun-playwright-matchers.test.ts`, and attributed it to
Bun 1.4.4's matcher path, with Playwright as the victim. Its notes are in
`docs/research/bun-playwright-matchers.md`. Task 08 said explicitly that
the person files the issue, not a run. No issue has been filed.

#### Decide

- Whether to file it with Bun, and under whose account.
- Whether to re-run the reproduction on a newer Bun first. The research
  doc pins 1.4.4.
- The reproduction is the issue body's code. Its research doc does not
  claim a mechanism, because no Bun source evidence was gathered.

#### Done when

- An issue link is recorded in the research doc's limitations section,
  or this task is cancelled with the reason.

## Comments

### @lemol at 2026-10-30 20:07:06 +00:00

Decision: no new issue. Bun already tracks this as oven-sh/bun#45629 (names Playwright) and #45020, with fix PR #45923 open. Evidence and the link are in the research doc's "Upstream status" and limitations sections. Rerun: slow on 1.4.4 and 1.4.4-canary.1+da867c60b, fast on 1.3.14; the stall follows the GC timer. Results added to #45629 under the person's account: https://github.com/oven-sh/bun/issues/45629#issuecomment-6532429811
