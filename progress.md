# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each small task. Status reflects only verified repository state and commands actually run.

## Current status

**Current phase/task:** Phase 0, Task 0.3 — Establish automated test/build workflow (partially implemented; verification outstanding)  
**Overall status:** Task 0.1 inventory and Task 0.2 app shell are complete. Task 0.3 now has test/lint/CI configuration and a first deterministic unit test, but has not passed an actual runtime/CI verification.  
**Last verified repository state:** The implementation branch contains the Next.js shell, `eslint.config.mjs`, `vitest.config.ts`, `src/lib/formatMoney.ts`, `src/lib/formatMoney.test.ts`, and `.github/workflows/quality.yml`.  
**Checks actually run:** No local `npm install`, lint, test, or build command has been run. GitHub Actions API query returned zero workflow runs at the time checked. This does not prove a CI run passed or failed.  
**Lockfile:** No `package-lock.json` exists yet. The workflow uses `npm install` to avoid falsely claiming `npm ci` works without a lockfile; reproducible dependency pinning remains outstanding.  
**Financial-data integrity:** The landing page does not show fake portfolio data. No accounting engine or market-data provider has been implemented yet.

## Completed

- [x] Confirmed repository is `ambujkhanna/smartfolio-analyser` and default branch is `main`.
- [x] Created non-main implementation branch `feat/reliable-pnl-foundation`.
- [x] Inspected the recursive Git tree and package scripts.
- [x] Broke the roadmap into small task IDs and explicit exit gates in plan.md.
- [x] **Task 0.2:** Added layout, landing page, global CSS, and `.gitignore`; read all files back from GitHub.
- [x] **Task 0.3 (configuration portion):** Added ESLint 9 flat config compatibility, Vitest config, a deterministic money-formatting helper/test, and a GitHub Actions workflow.
- [x] Test explicitly distinguishes true zero from missing values and rejects NaN/Infinity in the display helper.
- [x] Inspected workflow source and removed npm caching because there is no lockfile yet.

## In progress

- [ ] **Task 0.3:** Obtain an actual successful lint/test/build run and establish dependency lockfile.
- [ ] Verify whether GitHub Actions is enabled and workflow triggers for this repository.
- [ ] Fix any configuration or test failures revealed by a real run.

## Not yet implemented

- [ ] Phase 1: validated quote model, canonical transaction/result types, and safe calculation boundary with no fabricated prices.
- [ ] Phase 2: accounting conventions, chronological ledger, P&L, lifecycle recovery, and deterministic edge-case tests.
- [ ] Phase 3: CSV validation, broker adapter, opening positions, and holdings reconciliation.
- [ ] Phase 4: instrument identity and resolver.
- [ ] Phase 5: provider evaluation, equity/ETF quotes, mutual-fund NAVs, cache, and provenance.
- [ ] Phase 6: import, holdings, P&L, and data-quality UI.
- [ ] Phase 7: security, acceptance verification, preview deployment, and release review.

## Blockers / decisions

- This workflow currently has no available local Node.js/package-manager execution path; commands have not been run from this environment.
- GitHub Actions workflow was committed, but the Actions runs query returned zero runs. The workflow has not been observed executing yet.
- No package lockfile is committed. A lockfile should be generated and checked in once npm can run in a repository checkout.
- No representative broker export is present yet.
- Provider selection must follow current official terms, coverage, quotas, freshness, and cost review.
- Opening cost basis, cost-allocation method, dividends, and fee allocation must be explicitly scoped before those calculations are exposed.

## Next single task

**Finish Task 0.3 verification.** Check the workflow trigger/status in GitHub, obtain an npm lockfile in a real checkout, run lint/tests/build, and record exact results. If this environment cannot execute commands, continue implementation in small, test-first commits but do not claim verification until CI reports it.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Task 0.1 — Repository inventory and task breakdown | Confirmed actual repository state and decomposed roadmap into small tasks | Recursive Git tree and package.json fetched from GitHub |
| 2026-10-29 | Task 0.2 — Minimal Next.js shell | Added layout, landing page, global CSS, and .gitignore; no fake portfolio numbers shown | All files fetched back from GitHub; build/lint/test not run |
| 2026-10-29 | Task 0.3 — Test/lint/CI foundation (partial) | Added ESLint config, Vitest config, format utility and tests, GitHub Actions quality workflow | Files committed and source read back; no workflow runs observed; no local commands run |
| 2026-10-29 | Documentation and task-plan update | Rewrote plan into small task IDs and kept this tracker current | plan.md and progress.md committed on implementation branch |

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
