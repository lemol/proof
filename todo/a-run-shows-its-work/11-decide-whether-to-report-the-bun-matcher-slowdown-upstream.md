---
title: Decide whether to report the Bun matcher slowdown upstream
tags: [upstream, needs-person]
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
