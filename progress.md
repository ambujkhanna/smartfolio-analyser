# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each small task. Status reflects only verified repository state and commands actually run.

## Current status

**Current phase/task:** Phase 1, Task 1.3 — Safe calculation boundary  
**Overall status:** The minimal app shell is implemented. Test/lint/CI configuration exists but has not been observed running. Quote and canonical transaction contracts plus validation tests have been added; the safe mark-to-market boundary is the next coding task.  
**Last verified repository state:** The branch contains app shell, ESLint/Vitest configuration, GitHub Actions workflow, money-formatting utility/tests, and quote validation/types/tests. Files are committed on this branch.  
**Checks actually run:** No local npm command has been run. The GitHub Actions API query returned zero workflow runs at the time checked; no pass/fail result is available.  
**Lockfile:** No package-lock.json is committed yet.  
**Financial-data integrity:** No accounting engine, transaction import, or provider is implemented. The landing page shows no fake holdings or prices.

## Completed

- [x] Confirmed repository and default branch; created non-main implementation branch `feat/reliable-pnl-foundation`.
- [x] Inspected the recursive Git tree and package scripts.
- [x] Decomposed the roadmap into small tasks with exit gates in plan.md.
- [x] **Task 0.2:** Added Next.js layout, landing page, global CSS, and .gitignore; read files back from GitHub.
- [x] **Task 0.3 (configuration portion):** Added ESLint config, Vitest config, a money-formatting utility/test, and GitHub Actions workflow.
- [x] **Task 1.1 (implementation portion):** Added the MarketQuote contract and validation states for available, unavailable, invalid, mismatched, and stale quotes.
- [x] Quote validation rejects non-positive/non-finite prices, instrument/currency mismatches, missing source, invalid quote type/time, future timestamps, and stale data.
- [x] Added quote validation tests covering normal, missing, invalid-price, identity/currency mismatch, stale, future-time, and malformed-date cases.
- [x] **Task 1.2 (implementation portion):** Added canonical transaction types for buy, sell, opening balance, fee, and dividend rows, including source file/row metadata.
- [x] Added runtime transaction validation with structured issues and tests for invalid fields, missing prices, incomplete opening cost basis, fees, dates, and source metadata.
- [x] Read the key changed source files back from GitHub after writes.

## In progress

- [ ] **Task 1.3:** Add pure mark-to-market calculation boundary using explicit validated quote results; no fake values for unavailable/stale quotes.
- [ ] Execute quote and transaction validation tests; no local/CI execution result is available yet.
- [ ] **Task 0.3 verification:** Obtain a real lint/test/build run and commit a package lockfile when a runtime is available.
- [ ] Run quote and formatting tests; no local/CI execution result is available yet.

## Not yet implemented

- [ ] Task 1.3: safe calculation boundary that receives validated quotes explicitly and never invents prices.
- [ ] Phase 2: accounting conventions, chronological ledger, realized/unrealized/economic P&L, lifecycle recovery, and deterministic edge-case tests.
- [ ] Phase 3: CSV validation, broker adapter, opening positions, and holdings reconciliation.
- [ ] Phase 4: instrument identity master/resolver and alias handling.
- [ ] Phase 5: provider evaluation, equity/ETF quotes, mutual-fund NAVs, cache, and provenance.
- [ ] Phase 6: import, holdings, P&L, and data-quality UI.
- [ ] Phase 7: security, acceptance verification, preview deployment, and release review.

## Blockers / decisions

- No local Node/npm runtime is available through the current GitHub editing workflow, and no Actions run has been observed; source tests are written but not verified as passing.
- No package-lock.json is committed.
- No representative broker export is present; do not guess broker-specific columns.
- Provider selection must follow official terms, coverage, quotas, freshness, and cost review.
- Opening cost basis, cost allocation, dividends, and fee allocation must be scoped before those metrics are exposed.

## Next single task

**Task 1.2 — Canonical transaction types and validation.** Define the supported transaction kinds, required fields, source row metadata, and explicit validation errors. Preserve opening balances with missing cost basis as an incomplete state rather than inventing a cost. Continue to track the test/CI verification blocker separately.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Task 0.1 — Repository inventory | Confirmed actual repository structure and package scripts | Recursive Git tree and package.json fetched from GitHub |
| 2026-10-29 | Task 0.2 — App shell | Added layout, landing page, styles, and ignore rules; no fake values | Files fetched back from GitHub; no build run |
| 2026-10-29 | Task 0.3 — Quality foundation (partial) | Added ESLint, Vitest, test utility, and CI workflow | Files exist on branch; no Actions run observed; no local commands run |
| 2026-10-29 | Task 1.1 — Quote contract | Added typed quote/provenance model, validation states, and regression tests | Source/test files fetched from GitHub; tests not executed |
| 2026-10-29 | Task 1.2 — Canonical transactions | Added transaction kinds, source metadata, validation boundary, and regression tests | Source/test files committed; tests not executed |
| 2026-10-29 | Plan breakdown | Converted broad roadmap into small tasks with exit gates | plan.md fetched after update |

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
