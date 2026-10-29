# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each small task. Status reflects only verified repository state and commands actually run.

## Current status

**Current phase/task:** Phase 0, Task 0.2 — Create the minimal Next.js app shell  
**Overall status:** Task-level plan has been broken down. Repository inventory is complete. The application shell is the next implementation task.  
**Last verified repository state:** The implementation branch contains README.md, docs/PROJECT_LOG.md, plan.md, progress.md, package.json, and tsconfig.json. The recursive Git tree contains no `src/`, `app/`, `pages/`, test files, lockfile, ESLint config, or Vitest config.  
**Baseline build/test status:** Not run in this environment. The repository has no Next.js App Router page/layout or Pages Router entry point, so the existing `build` script is not yet a meaningful verified baseline. There is no lockfile or installed dependency tree available through the GitHub connector.  
**Source audit caveat:** The earlier audit of `calculatePnL.ts`, `parseCsv.ts`, and related UI files was from the older repository snapshot. Those source files are not present in this new dedicated repository; implementation must be built here rather than assuming they exist.

## Completed

- [x] Confirmed repository is `ambujkhanna/smartfolio-analyser` and default branch is `main`.
- [x] Created the non-main implementation branch `feat/reliable-pnl-foundation` from the documentation branch.
- [x] Inspected the complete recursive Git tree for the implementation branch.
- [x] Inspected package.json: Next.js 15, React 19, TypeScript 5.9, ESLint 9, and Vitest are declared; scripts include dev/build/start/lint/test.
- [x] Confirmed there is no source app entry point, no test file/config, no ESLint config, and no package lock in the current tree.
- [x] Broke the roadmap into small task IDs with explicit exit gates in plan.md.

## In progress

- [ ] **Task 0.2:** Add a minimal Next.js App Router shell without fake portfolio values.
- [ ] Ensure the landing page makes the current implementation status clear and does not imply analysis is already available.

## Not yet implemented

- [ ] Task 0.3: test, lint, lockfile, and CI foundation.
- [ ] Phase 1: validated quote model, canonical transaction/result types, and no-fabricated-price calculation boundary.
- [ ] Phase 2: accounting conventions, chronological ledger, P&L, lifecycle recovery, and deterministic edge-case tests.
- [ ] Phase 3: CSV validation, broker adapter, opening positions, and holdings reconciliation.
- [ ] Phase 4: instrument identity and resolver.
- [ ] Phase 5: provider evaluation, equity/ETF quotes, mutual-fund NAVs, cache, and provenance.
- [ ] Phase 6: import, holdings, P&L, and data-quality UI.
- [ ] Phase 7: security, acceptance verification, preview deployment, and release review.

## Blockers / decisions

- No representative broker export is present yet; choose the first broker adapter only after a sanitized sample is available.
- Market-data provider selection must follow current official terms, coverage, quotas, freshness, and cost review.
- Opening cost basis, cost-allocation method, dividends, and fee allocation must be explicitly scoped before those calculations are exposed.
- Build/test/lint commands have not been run in a local or CI runtime during this repository inventory.

## Next single task

**Task 0.2 — Create the minimal Next.js app shell.** Add root layout, global CSS, and a truthful landing page. Do not display mock prices, fake holdings, or sample P&L. Then update this tracker with the changed paths and verification status.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Documentation migration | README, project log, plan, and progress tracker exist on the dedicated repository's documentation branch | Files were fetched back from GitHub and content checked |
| 2026-10-29 | Task 0.1 — Repository inventory and task breakdown | Created `feat/reliable-pnl-foundation`; confirmed only docs/config files exist; broke implementation into small tasks | Recursive Git tree and package.json fetched from GitHub; build/test not run |

## Per-task update template

- **Task ID / goal:**
- **Files changed:**
- **Implementation:**
- **Tests / lint / build run:**
- **Results:**
- **Not verified:**
- **Known gaps / blockers:**
- **Next single task:**
- **Commit / PR:**
