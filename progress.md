# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each small task. Status reflects only verified repository state and commands actually run.

## Current status

**Current phase/task:** Phase 0, Task 0.3 — Establish automated test/build workflow  
**Overall status:** Task 0.1 repository inventory and task breakdown are complete. Task 0.2 app shell is implemented and verified by reading the files back from GitHub.  
**Last verified repository state:** The implementation branch now contains `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, and `.gitignore`, in addition to docs and package configuration.  
**Build/test status:** Build, lint, and tests have **not** been run. The GitHub integration can write/read repository files but does not provide a local Node.js runtime in this workflow. There is no lockfile or installed dependency tree in the repository.  
**Financial-data integrity:** The landing page explicitly says analysis is not available yet and does not display mock holdings, prices, or P&L. The accounting engine is not implemented yet.

## Completed

- [x] Confirmed repository is `ambujkhanna/smartfolio-analyser` and default branch is `main`.
- [x] Created non-main implementation branch `feat/reliable-pnl-foundation` from the documentation branch.
- [x] Inspected the complete recursive Git tree.
- [x] Inspected package.json: Next.js 15, React 19, TypeScript 5.9, ESLint 9, and Vitest are declared; scripts include dev/build/start/lint/test.
- [x] Confirmed the new repository initially had no source app entry point, tests, test config, ESLint config, or lockfile.
- [x] Broke the implementation roadmap into small task IDs and explicit exit gates in plan.md.
- [x] **Task 0.2:** Added `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, and `.gitignore`.
- [x] Made the landing page clearly disclose that transaction import, calculations, and verified market data are not available yet.
- [x] Verified the four Task 0.2 files by fetching them back from GitHub and checked that they contain no hard-coded sample price/fallback pattern.

## In progress

- [ ] **Task 0.3:** Establish test/lint/build configuration and CI checks.
- [ ] Add a minimal deterministic test and ensure the declared `test` command has a real test to run.
- [ ] Add ESLint 9 configuration and a CI workflow.
- [ ] Establish a reproducible lockfile using the package manager when a runtime is available.

## Not yet implemented

- [ ] Phase 1: validated quote model, canonical transaction/result types, and safe calculation boundary with no fabricated prices.
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
- Build/test/lint commands have not been run because this workflow currently has no local Node.js runtime. Do not describe the app as build-verified until CI or a runtime run proves it.

## Next single task

**Task 0.3 — Establish automated test/build workflow.** Add compatible ESLint/Vitest configuration, one meaningful deterministic unit test, and a GitHub Actions workflow for install, lint, test, and build. Then update this tracker with exact results; configuration alone is not proof that checks pass.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Task 0.1 — Repository inventory and task breakdown | Confirmed actual repository state and decomposed roadmap into small tasks | Recursive Git tree and package.json fetched from GitHub |
| 2026-10-29 | Task 0.2 — Minimal Next.js shell | Added layout, landing page, global CSS, and .gitignore; no fake portfolio numbers shown | All four files fetched back from GitHub; no build/lint/test run |
| 2026-10-29 | Documentation migration | README, project log, plan, and progress tracker exist on the dedicated repository's documentation branch | Files fetched back from GitHub and content checked |

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
