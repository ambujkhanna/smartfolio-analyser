# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each small task. Status reflects only verified repository state and commands actually run.

## Current status

**Current phase/task:** Phase 2, Task 2.3 — Implement P&L and recovery calculations  
**Overall status:** The app shell, data validation contracts, safe position valuation boundary, accounting rules, and a FIFO transaction ledger are implemented as code/documentation with deterministic tests. Runtime verification remains outstanding: no local npm commands or successful GitHub Actions run have been observed.  
**Last verified repository state:** The implementation branch contains Next.js app shell, quality configuration, quote and transaction validators, safe position valuation, FIFO ledger, accounting rules, and associated test files. Key files were fetched from GitHub after commits.  
**Checks actually run:** No local install/lint/test/build command has run. GitHub Actions runs query returned zero runs at last check; there is no pass/fail result.  
**Lockfile:** No package-lock.json is committed.  
**Data provider/import status:** No provider adapter or broker importer is implemented. No fake portfolio prices are displayed.

## Completed

- [x] Confirmed repository and default branch; created non-main implementation branch `feat/reliable-pnl-foundation`.
- [x] Inspected repository tree/package scripts and broke roadmap into task IDs.
- [x] **Task 0.2:** Added Next.js layout, truthful landing page, global CSS, and .gitignore.
- [x] **Task 0.3 (configuration portion):** Added ESLint config, Vitest config, formatting helper/test, and GitHub Actions workflow.
- [x] **Task 1.1:** Added quote/provenance type and validation for available, unavailable, invalid, mismatched, and stale quotes.
- [x] **Task 1.2:** Added canonical transaction model and field-level runtime validation for buy, sell, opening balance, fee, and dividend rows.
- [x] **Task 1.3:** Added pure position valuation boundary. Missing/stale quote never produces current value/P&L; missing cost basis leaves unrealized P&L unavailable.
- [x] **Task 2.1:** Added docs/ACCOUNTING_RULES.md specifying FIFO, fees, dividends, incomplete history, P&L/recovery formulas, and four hand-calculated examples.
- [x] **Task 2.2:** Added chronological FIFO ledger for buy/opening/sell/fee/dividend rows, including partial sells and re-entry.
- [x] Ledger reports invalid rows, duplicate transaction IDs, oversells, unknown opening basis, and ambiguous date-only ordering instead of silently treating them as valid.
- [x] Added deterministic test files for money formatting, quote validation, transaction validation, position valuation, and FIFO ledger edge cases.
- [x] Updated plan.md and this progress tracker after implementation tasks.

## In progress

- [ ] **Task 2.3:** Add realized/unrealized/economic P&L outputs and position/lifecycle recovery metrics with completeness metadata.
- [ ] **Task 0.3 verification:** Obtain an actual lint/test/build run and commit a package lockfile when a runtime is available.
- [ ] Fix any type/test/lint/build failures revealed by execution.

## Not yet implemented

- [ ] P&L/recovery aggregation and reconciliation.
- [ ] CSV validation, broker adapter, duplicate import detection, opening-position import, and holdings reconciliation.
- [ ] Instrument master/resolver and alias handling.
- [ ] Provider evaluation, equity/ETF quotes, mutual-fund NAVs, cache, and provenance integration.
- [ ] Import, holdings, P&L, and data-quality UI.
- [ ] Security review, acceptance verification, preview deployment, and release review.

## Blockers / decisions

- No local Node/npm runtime is available through this GitHub editing workflow; no successful Actions run has been observed. Tests are committed but not verified as passing.
- No package-lock.json is committed.
- No representative broker export is present; do not guess broker-specific columns.
- Provider selection must follow official terms, coverage, quotas, freshness, and cost review.
- Initial FIFO convention is a portfolio-performance convention, not a tax-grade claim. Corporate actions and FX remain out of scope until modeled explicitly.

## Next single task

**Task 2.3 — P&L and recovery calculations.** Add realized/unrealized/economic P&L aggregation and distinguish position break-even from lifecycle recovery. Use the hand-calculated examples in docs/ACCOUNTING_RULES.md as regression tests. Keep all totals explicitly incomplete when required history or quotes are missing. Continue to seek actual CI verification in parallel.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Task 0.1 — Repository inventory | Confirmed repository structure and package scripts | Git tree and package.json fetched |
| 2026-10-29 | Task 0.2 — App shell | Added layout, landing page, styles, ignore rules | Files fetched from GitHub; build not run |
| 2026-10-29 | Task 0.3 — Quality foundation (partial) | Added ESLint, Vitest, formatter test, CI workflow | No workflow run observed; no local commands run |
| 2026-10-29 | Task 1.1 — Quote contract | Added quote/provenance model and tests | Source fetched; tests not executed |
| 2026-10-29 | Task 1.2 — Canonical transactions | Added transaction model, validator, and tests | Source fetched; tests not executed |
| 2026-10-29 | Task 1.3 — Position valuation | Added pure mark-to-market function and tests | Source fetched; tests not executed |
| 2026-10-29 | Task 2.1 — Accounting rules | Added FIFO and lifecycle formulas plus hand-calculated examples | Document committed; no engine tests run |
| 2026-10-29 | Task 2.2 — FIFO ledger | Added chronological FIFO lots, partial/full sale, re-entry, charges, opening balance, and error/warning handling | Source/test files committed; tests not executed |

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
