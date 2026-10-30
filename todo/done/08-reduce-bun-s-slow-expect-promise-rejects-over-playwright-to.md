---
title: Reduce Bun's slow expect(promise).rejects over Playwright to a reproduction
tags: [upstream]
completed_at: 2026-10-30T06:54:08Z
outcome: completed
---
#### Why

Task 06 found that inside `await expect(run(...)).rejects`, Playwright's
calls finish on a one-second grid under Bun 1.4.4 (`newContext` 0.9 s,
`clock.setFixedTime` 1.0 s), while the same calls take 4–60 ms when the run
is awaited first. The slow tier works around it since 06's commit. What
triggers it is not known: a bare `cat` echo over fd 3/4 inside
`expect(...).rejects` slowed only from 7 ms to 23 ms for 10 round trips,
and a plain Playwright launch-and-close under `bun test` was fast. Without
a reproduction it cannot be reported upstream, and other suites that drive
a browser from `bun test` may be paying the same second per call.

#### What to build

1. Reduce it: start from one of the four 06 tests as it was before 06
   (`git show 7d785af:test/runner.slow.test.ts`), and remove proof piece by
   piece until the slowdown goes away. Measure with `DEBUG=pw:api` (median
   call, calls over 800 ms).
2. Say whether it is Bun's (`expect().rejects` / `.resolves` running a
   nested loop) or Playwright's, and write the reproduction as a single
   file an upstream issue can carry. Do not file the issue; the person does.
3. Search proof's own suites for `expect(` over a promise that drives a
   browser or a child process, and list them. proof is a public library:
   name no other repository in anything committed here.

#### Done when

- The report has the reproduction, its timings with and without the
  wrapper, and the list from item 3.
- No committed file names another repository.

#### Out of scope

- Changing other projects' tests.

## Comments

### @nzila at 2026-10-30 06:54:08 +00:00

Done: Reduced task 06's slowdown to a 78-line single-file reproduction and committed it with its report. Decision: the trigger is NOT proof/Effect/Playwright interplay — bisection eliminated Effect, sharp, local server, screenshots, tracing and the CDP stub one by one. The minimal trigger is one yielded timer turn (`await Bun.sleep(0)`) in the test body before creating the Playwright-driving promise, awaited via `expect().resolves`/`.rejects`.

What was built (commit a91f3f7, `docs: reproduce Bun matcher slowdown with Playwright`):
- `docs/reproductions/bun-playwright-matchers.test.ts`: four modes (await / resolves / reject-await / rejects) over launch→context→page→goto(about:blank)→close, no proof imports, resolves its own installed Chromium, never downloads.
- `docs/research/bun-playwright-matchers.md`: environment, original case, 19-step reduction ledger, complete embedded source (verified byte-identical), commands, measurements, attribution, suite inventory, limitations.

Timings (DEBUG=pw:api, 3 fresh processes/mode, median call of 6, count >800ms): await ~39–82ms/0, resolves ~615–999ms/2–4, reject-await ~36–39ms/0, rejects ~899–1050ms/3–4. Original renderer case: wrapper 11.4s/median 836ms (8/15) vs settle-first 0.956s/median 6.5ms (0/12). Negative ablation (preamble deleted): rejects/resolves fast (~40ms). Wrong-operation variant fails all 4 modes. SEND→RECV prompt, gaps sit RECV→SEND with the bun process idle (<2% CPU): client-side continuation scheduling under the matcher path.

Attribution: Bun's `expect().resolves`/`.rejects` matcher path (Bun 1.4.4); Playwright is victim, not cause. No nested-loop mechanism claimed (no Bun source evidence gathered). No issue filed. Inventory: nine live `.rejects` (browser.test 2 fs-only, release.test 4 fake-control, slow.test 3 prelaunch-only), zero live `.resolves` outside the new file, no active matcher over a browser/child-driving promise; known-bad count 10 rejected. No committed file names another repository.

Verified: 12 focused runs + 4 post-format runs (1 pass each), parser synthetic check (median 430, 1/4 over 800, zero unmatched), `bun run lint` exit 0, `bun run typecheck` exit 0, scratch-tsconfig typecheck of docs/ exit 0 (deliberate type error exits 1), `git diff --check` exit 0.

Deviations/notes: plan's Effect-AGENTS.md reading step was not done — Effect code existed only in deleted scratch bisection files, none committed. Fallback 06 cases unused (first case reproduced). Scratch tsconfig used the real walked-up node_modules (@types), not the plan's four-levels-up guess. Full `bun run check` / slow tier not run (check stage owns them). Scratch dir and probe links removed; worktree clean except the two committed files.

Review: approved (4/5)
Approved. One commit (a91f3f7) adds docs/reproductions/bun-playwright-matchers.test.ts (78 lines) and docs/research/bun-playwright-matchers.md (309 lines). Nothing in src/ or test/ changes.

Check: check.command `bun run check` passed on a91f3f7 (55 tests, 8 files). The landGate `bun run check:all` is not triggered, because the diff touches only docs/. The new file is outside every gate: test:unit is `bun test src test/boundaries.test.ts`.

What to build:
1. Reduce: done. The research doc has an "Original case" section on the 7d785af renderer case: wrapper median 836 ms, 8/15 calls over 800 ms; settle-first median 6.5 ms, 0/12. A 19-row reduction ledger follows, measured with DEBUG=pw:api.
2. Attribution and single file: done. The attribution names Bun's resolves/rejects matcher path, with Playwright as the victim. The report says the nested-loop mechanism is not claimed, and gives its reason (no Bun source evidence was gathered). No issue was filed.
3. Inventory: done, in the "Suite inventory" section. I re-ran `rg -n '\.rejects\b|\.resolves\b' --glob '!docs/**' .` and got exactly the nine live .rejects sites: browser.test.ts:28,29; release.test.ts:33,58,73,79; runner.slow.test.ts:566,569,571. There are no .resolves sites. The other hits are in todo/ prose and a comment at slow.test:223.
   - I read each site. release.test.ts:33 is a fake close that throws "pipe broke", with no real child.
   - slow.test 566–571 asserts `launched` is false.
   - The cited settled sites match: slow.test:165, 196, 203, 225, 502; process.test.ts:12; browser.test.ts:24–27.
   - The claim "no active matcher over a browser- or child-driving promise" holds.

Done when:
- The report has the reproduction, timings with and without the wrapper, and the list. Pinned in the research md. I checked that the embedded source is byte-identical: `diff <(sed -n '113,190p' doc) file` printed IDENTICAL. The 78-line count matches `wc -l`.
- No committed file names another repository. Search: `git diff base...HEAD | rg -in 'mionso|nzila|xonton|analytics|lemol-workspace|workspace|slash-usage|todo-md|framework|repos/|\.\./'` returned exit 1. To prove the pattern works, I fed it "nzila xonton" and it matched.

The reproduction is a diagnostic, not a gate test. Reversals I ran in a scratch worktree (now removed):
- My own run at HEAD: await 1.12 s, rejects 5.16 s, reject-await 0.64 s, resolves 6.17 s, each 1 pass. The rejects log shows context/page/close calls finishing about 1.0–1.1 s after they start. This matches the doc's table (await ~0.9–1.3 s, rejects/resolves 5.2–6.2 s).
- Ablation with `await Bun.sleep(0)` deleted: rejects 1.46 s and resolves 1.22 s. This confirms ledger row 18.
- With exercise() throwing "wrong operation", all four modes exit 1 with "1 fail". So the sentinel assertion cannot pass on an unrelated failure, matching the doc's claim.

Comments: the brief has no pre-start comments, and the task file has no Comments section (`grep -n Comments todo/08-*.md` exit 1). That makes 0 comments and no authors.

Implementer's gaps:
- Effect AGENTS.md reading: pushed back, which is fine. No Effect code was committed.
- Fallback 06 cases unused: fine. The first case reproduced.
- Full check and slow tier not run: closed by the check stage's `bun run check` pass on a91f3f7.

Lint: `bun run lint` exits 0; fmt reports "All matched files use the correct format" and oxlint printed no warning lines. I did not re-run the base separately, so I am not claiming a base count.

Quantities: I re-derived the medians from the doc's own lists. For example, rejects run 1 is [65,539,997,1102,1113,1773]: median (997+1102)/2 = 1049.5, which the doc rounds to 1050 ms, and 4 values are over 800. Await run 1 is [7,12,23,54,257,709]: median 38.5 ≈ 39, and 0 values are over 800.

Non-blocking notes, not findings:
- The inventory's line numbers say "at base" but name no commit hash.
- A bare `bun test` with no path would also pick up docs/reproductions/*.test.ts and launch Chromium. No project script does that.

Branch: nzila/01M65NXHSET95E8CGA4AVZMGNA

nzila run 01M65NXHSET95E8CGA4AVZMGNA
