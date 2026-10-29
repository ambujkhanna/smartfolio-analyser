# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each small task. Status reflects only verified repository state and commands actually run.

## Current status

**Current phase/task:** Phase 3, Task 3.1 — Build a safe generic CSV pipeline  
**Overall status:** Core domain and accounting foundations are now present in source: quote validation, transaction validation, position valuation, FIFO ledger, and portfolio P&L/recovery calculations. The work is test-first in source, but runtime verification remains outstanding; do not treat the implementation as validated until CI succeeds.  
**Last verified repository state:** The implementation branch includes the Next.js shell, lint/test/CI configuration, quote and transaction domain models, valuation engine, FIFO ledger, P&L aggregation, accounting rules, and deterministic tests. Source files have been read back from GitHub after commits.  
**Checks actually run:** GitHub Actions workflow runs have started, but recent runs were pending/cancelled due to rapid successive pushes; no successful full run is confirmed. No local npm command has run.  
**Lockfile:** No package-lock.json is committed.  
**Data provider/import status:** No real provider or broker-specific importer is implemented. No fake market prices are displayed.

## Completed

- [x] Repository inventory and small-task plan.
- [x] **Task 0.2:** Added truthful Next.js app shell.
- [x] **Task 0.3 (configuration portion):** Added ESLint config, Vitest config, formatter tests, and GitHub Actions workflow.
- [x] **Task 1.1:** Added quote/provenance type and validation for missing, invalid, stale, mismatched, and available quote states.
- [x] **Task 1.2:** Added canonical transaction types and field-level runtime validation for buy, sell, opening balance, fee, and dividend rows.
- [x] **Task 1.3:** Added pure position valuation using explicit quote results; missing/stale quote does not become zero; missing cost basis leaves unrealized P&L unavailable.
- [x] **Task 2.1:** Added docs/ACCOUNTING_RULES.md with FIFO, fee/dividend scope, lifecycle formulas, incomplete-history behavior, and hand-calculated examples.
- [x] **Task 2.2:** Added chronological FIFO ledger with partial/full sales, sell/re-buy cycles, opening positions, charges, standalone fees/dividends, duplicate-ID rejection, oversell errors, and ambiguity warnings.
- [x] **Task 2.3 (implementation portion):** Added portfolio P&L aggregation for realized/unrealized P&L, market value, economic P&L, position break-even, and lifecycle recovery.
- [x] Portfolio calculations require validated valuations and keep dependent metrics unavailable when quotes, cost basis, or complete history are missing.
- [x] Added tests for quote validation, transaction validation, position valuation, FIFO lots, sell/re-buy, lifecycle reconciliation, missing quote, and unknown opening basis.
- [x] Added overflow guards to portfolio market value and unrealized P&L aggregation.
- [x] Updated plan.md and this progress tracker.

## In progress

- [ ] **Task 3.1:** Build generic CSV parsing/validation that preserves every row and reports malformed/unsupported records.
- [ ] **Task 0.3 verification:** Obtain a successful full CI run and commit a package lockfile.
- [ ] Expand accounting tests after a real run exposes any type/test/lint issues.

## Not yet implemented

- [ ] Generic CSV import preview and row-level diagnostics.
- [ ] Broker-specific adapters, duplicate-import identity, holdings/opening-position import, and reconciliation.
- [ ] Instrument master/resolver and alias handling.
- [ ] Provider evaluation, equity/ETF quotes, mutual-fund NAVs, cache, and provenance integration.
- [ ] Connect import and calculation engine to the UI; show holdings and data-quality warnings.
- [ ] Security review, acceptance verification, preview deployment, and release review.

## Blockers / decisions

- GitHub Actions has produced pending/cancelled runs during rapid commits, but no successful full quality run is confirmed. Wait for a run on the latest branch head and fix reported issues.
- No package-lock.json is committed; dependency pinning remains outstanding.
- No representative broker export is present. Build generic CSV validation first; do not invent broker-specific formats.
- Provider selection must follow official terms, coverage, quotas, freshness, and cost review.
- Initial FIFO is a transparent portfolio-performance convention, not a tax-grade claim. Corporate actions and FX remain unsupported until separately designed.

## Next single task

**Task 3.1 — Safe generic CSV pipeline.** Parse all rows without silent loss, preserve filename/row number/raw values, validate required fields, and report unsupported rows. Keep it independent of the FIFO engine; only validated canonical transactions should reach calculations. In parallel, obtain a successful CI run and address any failures before calling the implementation verified.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Task 0.1 — Repository inventory | Confirmed repository structure and package scripts | Git tree/package.json fetched |
| 2026-10-29 | Task 0.2 — App shell | Added layout, landing page, styles, ignore rules | Files fetched; build not run |
| 2026-10-29 | Task 0.3 — Quality foundation (partial) | Added ESLint, Vitest, formatter test, CI workflow | Runs pending/cancelled during rapid pushes; no pass confirmed |
| 2026-10-29 | Task 1.1 — Quote contract | Added quote/provenance model and validation tests | Files fetched; tests not executed locally |
| 2026-10-29 | Task 1.2 — Canonical transactions | Added transaction model, validator, and tests | Files fetched; tests not executed locally |
| 2026-10-29 | Task 1.3 — Position valuation | Added pure mark-to-market boundary and tests | Files fetched; tests not executed locally |
| 2026-10-29 | Task 2.1 — Accounting rules | Added FIFO and lifecycle formulas plus hand-calculated examples | Document committed |
| 2026-10-29 | Task 2.2 — FIFO ledger | Added FIFO lot processing, cash-flow tracking, and structured errors/warnings | Source/test files committed; tests not yet verified |
| 2026-10-29 | Task 2.3 — P&L and recovery | Added P&L aggregation, economic reconciliation, and break-even/recovery metrics | Source/test files committed; tests not yet verified |

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
