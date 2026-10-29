# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each small task. Status reflects only verified repository state and commands actually run.

## Current status

**Current phase/task:** Phase 2, Task 2.2 — Implement chronological ledger and position lots  
**Overall status:** The initial Next.js shell, quote/transaction validation, safe mark-to-market boundary, and initial accounting specification are committed. Deterministic tests have been written, but none of the tests/build/lint commands has been observed running successfully yet; CI/runtime verification remains a high-priority parallel task.  
**Last verified repository state:** The implementation branch contains app shell, quality configuration, quote and transaction domain models/validators, and a pure position valuation function. Files were committed through GitHub and key sources fetched back for inspection.  
**Checks actually run:** No local npm commands have run. The Actions runs API query returned zero workflow runs at the last check; no passing/failing CI result is available.  
**Lockfile:** No package-lock.json is committed.  
**Financial-data integrity:** No quote provider or broker importer is implemented. The landing page does not show mock portfolio values.

## Completed

- [x] Confirmed repository and default branch; created non-main implementation branch `feat/reliable-pnl-foundation`.
- [x] Inspected the repository tree and package scripts; split the roadmap into small task IDs.
- [x] **Task 0.2:** Added Next.js layout, truthful landing page, global CSS, and .gitignore; files read back from GitHub.
- [x] **Task 0.3 (configuration portion):** Added ESLint config, Vitest config, formatting helper/test, and GitHub Actions workflow.
- [x] **Task 1.1:** Added MarketQuote/provenance type and validation states: available, unavailable, invalid, mismatched, stale.
- [x] Quote validation rejects invalid/non-positive/non-finite prices, identity/currency mismatch, missing source, invalid quote type/time, future timestamps, and stale data.
- [x] **Task 1.2:** Added canonical transaction types for buy, sell, opening balance, fee, and dividend, preserving source filename/row.
- [x] Transaction validation reports field-level issues and preserves opening balances with unknown cost basis without inventing one.
- [x] **Task 1.3 (implementation portion):** Added pure `valueOpenPosition` function that accepts explicit quote-validation state and never fetches or invents prices.
- [x] Valuation returns no current market value/P&L for unavailable or stale quotes; P&L remains unavailable when cost basis is unknown.
- [x] Added deterministic test files for money formatting, quote validation, transaction validation, and position valuation.
- [x] **Task 2.1:** Added docs/ACCOUNTING_RULES.md defining FIFO, fee/dividend treatment, economic P&L reconciliation, recovery price, incomplete-history handling, and four hand-calculated examples.
- [x] Updated plan.md and this tracker after implementation tasks.

## In progress

- [ ] **Task 2.2:** Implement deterministic chronological FIFO ledger, partial/full sells, re-entry, and structured oversell/incomplete-history warnings.
- [ ] **Task 0.3 verification:** Get a real lint/test/build run and commit a package lockfile when a runtime is available.
- [ ] Fix any test/type/lint/build failures once CI can execute.

## Not yet implemented

- [x] Accounting convention document and hand-calculated fixtures.
- [ ] Chronological ledger, lot/cost allocation, realized/unrealized/economic P&L, lifecycle recovery, fees, and oversell warnings.
- [ ] CSV validation, broker adapter, duplicate detection, opening positions, and holdings reconciliation.
- [ ] Instrument master/resolver and alias handling.
- [ ] Provider evaluation, equity/ETF quotes, mutual-fund NAVs, cache, and provenance integration.
- [ ] Import, holdings, P&L, and data-quality UI.
- [ ] Security review, acceptance verification, preview deployment, and release review.

## Blockers / decisions

- No local Node/npm runtime is available through the current GitHub editing workflow, and no Actions run has been observed; source tests are written but not verified as passing.
- No package-lock.json is committed.
- No representative broker export is present; do not guess broker-specific columns.
- Provider selection must follow official terms, coverage, quotas, freshness, and cost review.
- Cost-allocation method, treatment of charges/dividends, and incomplete opening history must be documented before claiming complete economic P&L.

## Next single task

**Task 2.1 — Document accounting conventions.** Define the initial cost allocation method, realized/unrealized/economic P&L, position break-even versus lifecycle recovery, fee/dividend scope, and incomplete-history behavior. Add hand-calculated fixtures before implementing ledger calculations. In parallel, continue to seek actual CI verification; never claim tests pass until results are observed.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Task 0.1 — Repository inventory | Confirmed repository structure and package scripts | Git tree and package.json fetched |
| 2026-10-29 | Task 0.2 — App shell | Added layout, landing page, styles, ignore rules; no fake values | Files fetched from GitHub; build not run |
| 2026-10-29 | Task 0.3 — Quality foundation (partial) | Added ESLint, Vitest, formatter test, and CI workflow | No workflow run observed; no local commands run |
| 2026-10-29 | Task 1.1 — Quote contract | Added quote/provenance model and validation/tests | Source fetched from GitHub; tests not executed |
| 2026-10-29 | Task 1.2 — Canonical transactions | Added transaction kinds, source metadata, validator, tests | Source fetched from GitHub; tests not executed |
| 2026-10-29 | Task 1.3 — Position valuation boundary | Added pure mark-to-market function and tests for missing/stale quotes and missing cost basis | Source fetched from GitHub; tests not executed |
| 2026-10-29 | Task 2.1 — Accounting conventions | Added docs/ACCOUNTING_RULES.md with initial FIFO and lifecycle accounting rules plus hand-calculated examples | File committed to GitHub; implementation tests not executed |

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
