# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each small task. Status reflects only verified repository state and commands actually run.

## Current status

**Current phase/task:** Phase 5, Task 5.1 — Evaluate market-data providers  
**Overall status:** App shell, domain validation, FIFO ledger, P&L/recovery calculations, accounting rules, and generic CSV parsing are implemented as source code with tests. Runtime verification is still pending; no passing lint/test/build run has been confirmed.  
**Last verified repository state:** Branch includes `src/importers/genericCsv.ts` and tests, PapaParse dependency declaration, FIFO ledger, P&L engine, domain validators, and documentation. New source files have been committed and fetched back from GitHub.  
**Checks actually run:** GitHub Actions runs are being triggered by pushes, but rapid commits have caused earlier runs to be cancelled. The latest complete lint/test/build result is not yet confirmed. No local npm commands have run.  
**Lockfile:** No package-lock.json is committed.  
**Provider status:** No live quote/NAV provider has been selected or implemented. No real portfolio values are shown in the UI.

## Completed

- [x] Repository inventory and task-level implementation plan.
- [x] **Task 0.2:** Added truthful Next.js app shell; no fake holdings or prices.
- [x] **Task 0.3 (configuration portion):** Added ESLint config, Vitest config, formatter tests, and GitHub Actions workflow.
- [x] **Task 1.1:** Added quote/provenance model and validation for missing, invalid, stale, mismatched, and available quote states.
- [x] **Task 1.2:** Added canonical transaction model and runtime validation for buy, sell, opening balance, fee, and dividend rows.
- [x] **Task 1.3:** Added pure position valuation; missing/stale quote does not become zero, and unknown cost basis keeps unrealized P&L unavailable.
- [x] **Task 2.1:** Added docs/ACCOUNTING_RULES.md defining initial FIFO conventions, fee/dividend scope, economic P&L, break-even/recovery, and hand-calculated examples.
- [x] **Task 2.2:** Added FIFO ledger for buy/opening/sell/fee/dividend rows, partial sells and re-entry; duplicate IDs and oversells are reported, unknown cost basis remains unknown.
- [x] **Task 2.3 (implementation portion):** Added portfolio P&L aggregation, economic P&L reconciliation, position break-even, and lifecycle recovery price.
- [x] **Task 3.1 (implementation portion):** Added generic CSV parsing using PapaParse. Raw rows, row numbers, parse errors, invalid fields, unsupported transaction types, duplicate headers, and unresolved symbol-only instruments remain visible.
- [x] **Task 6.1 (implementation portion):** Added browser-side CSV preview UI with client-side file-size/type checks, row status, validation details, and explicit no-upload/no-P&L messaging.
- [x] **Task 4.1/4.2 (initial resolver):** Added stable instrument record/reference types and exact resolver states. Explicit IDs and exchange-qualified matches take precedence; ambiguous NSE/BSE matches remain unresolved; no fuzzy matching or unsafe fallback.
- [x] **Task 5.1:** Reviewed official Upstox Market Quote V3/Analytics Token docs and AMFI NAV download docs; added docs/MARKET_DATA_PROVIDER_REVIEW.md with a free-first recommendation and freshness/credential constraints.
- [x] **Task 5.2 (adapter implementation):** Added Upstox Market Quote V3 adapter with server-supplied token, 500-key batching, exact provider-key matching, last-trade freshness validation, timestamp provenance, and explicit unavailable/error states.
- [x] **Task 5.3 (parser/resolver implementation):** Added AMFI NAV parser for current 8-column records and legacy fixture format; resolves scheme code/ISIN conservatively and preserves NAV date.
- [x] CSV import only emits canonical transactions for rows that pass validation and have a stable instrument identity.
- [x] Added deterministic test files for money formatting, quote validation, transaction validation, valuation, FIFO ledger, P&L reconciliation, and generic CSV edge cases.
- [x] Updated plan.md and progress.md after the implementation increments.
- [x] Rewrote README.md to reflect the actual dedicated repository state, distinguish implemented code from unconnected modules, document current limitations, and link the accounting/provider plans.

## In progress

- [x] **Task 3.1 (implementation portion):** Generic CSV parser and row-preserving validation added; tests written.
- [ ] **Task 3.2:** Broker-specific adapter. This requires a sanitized representative broker export; no sample is present in the repository, so no broker format is guessed.
- [ ] **Quality verification:** Observe a successful lint/test/build run on the latest branch head and fix failures.
- [ ] Commit an npm lockfile from a real package-manager environment.

## Not yet implemented

- [ ] Broker-specific mapping, idempotent repeat import across renamed files, opening-position import, and holdings reconciliation.
- [ ] Instrument master/resolver, alias/symbol-change handling, and NSE/BSE quote identity.
- [ ] Provider evaluation, equity/ETF quote adapter, mutual-fund NAV adapter, cache, and quote freshness/provenance integration.
- [x] Connected generic CSV parsing to a browser-side import preview with a 5 MB limit, accepted/rejected counts, raw row details, and validation issues.
- [ ] Connect calculation modules to holdings/P&L UI and add portfolio completeness/data-quality panels.
- [ ] Security review, acceptance verification, preview deployment, and release review.

## Blockers / decisions

- **Broker sample:** A sanitized tradebook/holdings export is needed before implementing an accurate broker-specific adapter. Do not upload credentials, OTPs, account numbers, or other secrets.
- **CI/runtime:** Recent GitHub Actions runs were pending/cancelled during rapid pushes; no successful full run is confirmed. Let the latest run finish and fix any issues.
- **Lockfile:** No package-lock.json is committed.
- **Market data:** Provider choice must follow current official terms, coverage, quotas, freshness, and cost review.
- **Scope:** Initial FIFO is a portfolio-performance convention, not a tax-grade claim. Corporate actions and FX remain unsupported until separately designed.

## Next single task

**Task 3.2 — Broker adapter decision.** Do not invent a broker-specific CSV schema. If a sanitized sample export becomes available in the repo, implement its adapter and fixtures. Until then, continue provider/instrument research and improve generic importer tests. In parallel, obtain a successful CI run before treating current code as verified.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Task 0.1 — Repository inventory | Confirmed repository structure and package scripts | Git tree/package.json fetched |
| 2026-10-29 | Task 0.2 — App shell | Added layout, landing page, styles, ignore rules | Files fetched; build not run |
| 2026-10-29 | Task 0.3 — Quality foundation (partial) | Added ESLint, Vitest, formatter test, CI workflow | Workflow runs triggered; no successful run confirmed |
| 2026-10-29 | Task 1.1 — Quote contract | Added quote/provenance model and tests | Files fetched; tests not locally executed |
| 2026-10-29 | Task 1.2 — Canonical transactions | Added transaction model, validator, and tests | Files fetched; tests not locally executed |
| 2026-10-29 | Task 1.3 — Position valuation | Added pure valuation boundary and tests | Files fetched; tests not locally executed |
| 2026-10-29 | Task 2.1 — Accounting rules | Added FIFO/lifecycle formulas and hand-calculated examples | Document committed |
| 2026-10-29 | Task 2.2 — FIFO ledger | Added lot processing, re-entry, cash flows, and warnings/errors | Source/test files committed; tests not yet verified |
| 2026-10-29 | Task 2.3 — P&L/recovery | Added portfolio metrics and reconciliation tests | Source/test files committed; tests not yet verified |
| 2026-10-29 | Task 3.1 — Generic CSV | Added PapaParse pipeline, row-preserving validation, unresolved symbol state, and edge-case tests | Source/test files committed; tests not yet verified |
| 2026-10-29 | Task 4.1/4.2 — Instrument resolver | Added canonical instrument model, exact match rules, confidence levels, ambiguity states, and tests | Source/test files committed; tests not yet verified |
| 2026-10-29 | Task 5.1 — Provider review | Reviewed official Upstox and AMFI documentation; documented free-first source split | Official docs reviewed; no live API calls made |
| 2026-10-29 | Task 5.2 — Upstox adapter | Added quote adapter, freshness/provenance handling, and fixed-response tests | Source/test committed; live token not configured; CI verification pending |
| 2026-10-29 | Task 5.3 — AMFI NAV parser/resolver | Added current-format parser, scheme resolution, valuation-date provenance, and tests | Source/test committed; current live feed not fetched; CI verification pending |
| 2026-10-29 | Task 6.1 — Import preview UI | Added browser-side CSV preview, row diagnostics, raw-cell details, and file guardrails | Files committed; lint/test/build verification pending |
| 2026-10-29 | README refresh | Updated repository README to describe current implementation and limitations accurately | README fetched after commit; full CI verification pending |

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
