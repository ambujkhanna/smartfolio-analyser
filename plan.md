# Smartfolio Analyser — Implementation Plan

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

This is an executable task plan. Complete one task at a time. After each task, update `progress.md`, commit the change on this branch, and verify what can actually be verified. Do not mark a task complete merely because files were written.

## Rules of execution

1. Never push implementation changes directly to `main`.
2. Correctness before feature breadth or visual polish.
3. Never fabricate a price, treat missing data as zero, or silently discard a transaction.
4. Keep accounting deterministic and independent from network/provider calls.
5. After every task: inspect the diff, run relevant tests, run a build when applicable, and update `progress.md`.
6. Clearly distinguish checks that passed, failed, or could not be run.
7. No paid provider becomes mandatory without explicit approval.
8. Do not claim tax-grade accuracy without a validated lot, charges, and corporate-action model.

## Phase 0 — Establish a runnable baseline

### Task 0.1 — Inventory the dedicated repository
- [x] Confirm repository, default branch, implementation branch, and top-level files.
- [x] Inspect package scripts and TypeScript configuration.
- [x] Record missing application source, lockfile, test configuration, and test files.
- [x] Record that the earlier source-code audit applies to the older repository snapshot and cannot be edited in this new repository.
- [x] Update `progress.md` with baseline facts.

**Exit gate:** We know what is actually present in this repository and do not assume old source files exist.

### Task 0.2 — Create the minimal Next.js app shell
- [ ] Add App Router root layout, global CSS, and a minimal landing page.
- [ ] Add the minimum Next.js configuration needed by the current package.
- [ ] Ensure the page states that analysis is not available until transaction import and verified data are implemented.
- [ ] Do not add fabricated portfolio values or sample market prices.
- [ ] Inspect changed files and run build/lint if a runtime is available.

**Exit gate:** A real application entry point exists; no mock financial results are shown.

### Task 0.3 — Establish automated test/build workflow
- [ ] Add a minimal deterministic unit test and verify the Vitest configuration.
- [ ] Add/verify ESLint configuration compatible with the installed ESLint 9 toolchain.
- [ ] Add a CI workflow for install, lint, test, and production build.
- [ ] Add a lockfile using the project's package manager when execution is available.
- [ ] Record exact command results; do not infer success from configuration alone.

**Exit gate:** Reproducible checks are defined and their actual status is recorded.

## Phase 1 — Financial-data integrity

### Task 1.1 — Define quote and availability types
- [ ] Define instrument identity fields needed by calculations.
- [ ] Define a quote type with price, currency, source, quote type, timestamp/valuation date, and provider instrument identity.
- [ ] Define explicit unavailable/invalid/stale quote states.
- [ ] Use finite positive numeric validation; reject NaN, Infinity, zero, and negative prices.
- [ ] Add tests for valid, missing, stale, mismatched, and invalid quotes.

### Task 1.2 — Define canonical transaction and result types
- [ ] Model buys, sells, fees/charges, dividends, and opening balances explicitly where supported.
- [ ] Preserve transaction date/time, stable ID when available, exchange, currency, and import source/row.
- [ ] Represent incomplete history and unresolved instruments with structured warnings.
- [ ] Make metrics dependent on unavailable inputs nullable or typed as unavailable.
- [ ] Add type-level and runtime validation tests.

### Task 1.3 — Implement a safe first calculation boundary
- [ ] Create a pure calculation API that receives normalized transactions and validated quotes as explicit inputs.
- [ ] Ensure no hard-coded price map, ₹100 fallback, or network request exists in the engine.
- [ ] Return unavailable current value/unrealized P&L if a quote is missing.
- [ ] Add regression tests proving unknown symbols cannot produce invented financial values.
- [ ] Add hand-calculated fixtures and reconciliation assertions.

**Exit gate:** No path in the calculation layer can fabricate a market price.

## Phase 2 — Accounting specification and engine

### Task 2.1 — Document accounting conventions
- [ ] Define realized P&L, unrealized P&L, economic P&L, position break-even, and lifecycle recovery price.
- [ ] Choose and label the initial cost-allocation method; document limitations.
- [ ] Define how brokerage/fees are allocated and prevent double counting.
- [ ] Explicitly scope dividends, taxes, opening balances, and incomplete history.
- [ ] Define behavior for zero quantity and closed lifecycle recovery.

### Task 2.2 — Implement chronological ledger and position lots
- [ ] Validate required transaction fields and stable ordering.
- [ ] Handle multiple buys, weighted/lot cost, partial sells, and full exits.
- [ ] Handle sell/re-buy cycles without erasing earlier lifecycle cash flows.
- [ ] Flag oversells, missing cost basis, and ambiguous ordering.
- [ ] Preserve traceability from every result back to source transactions.

### Task 2.3 — Implement P&L and recovery calculations
- [ ] Calculate realized and unrealized P&L separately.
- [ ] Calculate economic P&L from documented cash-flow components without double counting.
- [ ] Calculate position break-even and lifecycle recovery separately.
- [ ] Return warnings and completeness metadata alongside numeric results.
- [ ] Test buy-and-hold, averaging, partial sale, full close, re-entry, fees, missing history, and oversell cases.

**Exit gate:** Hand-calculated scenarios pass deterministic tests.

## Phase 3 — Import and reconciliation

### Task 3.1 — Build a safe generic CSV pipeline
- [ ] Parse without silently dropping rows.
- [ ] Preserve filename, row number, raw values, and parser errors.
- [ ] Validate dates, quantity, price, transaction type, currency, and instrument identity.
- [ ] Detect duplicate rows and provide a deterministic import identity.
- [ ] Add fixtures for malformed rows, delimiters, quoting, empty cells, and duplicates.

### Task 3.2 — Add the first broker adapter
- [ ] Select the first broker format from an actual sanitized sample export.
- [ ] Map the broker's real columns and transaction labels.
- [ ] Support fees/separate ledger rows only where the sample and specification justify it.
- [ ] Add import preview, row-level errors, and unsupported-row reporting.
- [ ] Do not invent a broker format if no representative sample is available.

### Task 3.3 — Add opening positions and reconciliation
- [ ] Model imported holdings/opening quantity and cost basis separately from trades.
- [ ] Reconstruct current quantity from the ledger.
- [ ] Compare reconstructed quantities with broker holdings.
- [ ] Report discrepancies without silently adjusting data.
- [ ] Explain which metrics are affected by missing historical transactions.

**Exit gate:** Supported files parse with visible errors and holdings discrepancies are explainable.

## Phase 4 — Instrument identity

### Task 4.1 — Create instrument identity model
- [ ] Support ISIN, exchange, symbol, provider key, asset type, and currency as available.
- [ ] Distinguish the same company listed on NSE and BSE where the quote source requires it.
- [ ] Avoid using display symbol alone as a universal identity.
- [ ] Add alias/symbol-change handling design.

### Task 4.2 — Add resolver and unresolved state
- [ ] Evaluate permitted instrument-master sources.
- [ ] Resolve only above a documented confidence threshold.
- [ ] Keep ambiguous/unresolved records for user review.
- [ ] Test aliases, duplicate symbols, renamed securities, and unknown instruments.

**Exit gate:** Instruments resolve deterministically or are explicitly unresolved.

## Phase 5 — Market data

### Task 5.1 — Evaluate provider options
- [ ] Review current official docs, terms, coverage, quotas, freshness, and costs.
- [ ] Evaluate Indian listed equity/ETF quotes separately from mutual-fund NAVs.
- [ ] Verify deployment constraints and secret handling.
- [ ] Recommend the free-first option with evidence; request approval before mandatory paid spend.

### Task 5.2 — Implement equity/ETF quote adapter
- [ ] Implement a provider interface and a single chosen adapter.
- [ ] Validate instrument match, currency, price, quote type, timestamp, and freshness.
- [ ] Add batching/cache/rate-limit behavior where permitted.
- [ ] Report provider failures and missing prices explicitly.
- [ ] Test using fixed provider-response fixtures, not live calls.

### Task 5.3 — Implement mutual-fund NAV adapter
- [ ] Resolve schemes using stable scheme identity, including plan/option variants.
- [ ] Treat NAV as date-based and show its valuation date.
- [ ] Validate scheme match, NAV, currency, and freshness.
- [ ] Keep missing/ambiguous schemes unavailable.

**Exit gate:** Every displayed price/NAV is traceable and validated.

## Phase 6 — UI and data-quality reporting

### Task 6.1 — Import review UI
- [ ] Upload supported CSV files.
- [ ] Show detected format, row counts, and validation errors before acceptance.
- [ ] Explain unsupported rows and duplicate handling.
- [ ] Keep parsing details out of presentation components.

### Task 6.2 — Holdings and P&L UI
- [ ] Show realized, unrealized, and economic P&L separately with definitions.
- [ ] Show position break-even separately from lifecycle recovery.
- [ ] Show quote/NAV source, quote type, timestamp/valuation date, and stale/unavailable state.
- [ ] Never render missing financial values as ₹0.
- [ ] Show when portfolio totals are incomplete.

### Task 6.3 — Warnings and reconciliation UI
- [ ] Show missing quotes, unresolved instruments, incomplete history, invalid rows, stale quotes, and quantity discrepancies.
- [ ] Prioritize actionable warnings.
- [ ] Keep charts secondary to numeric accuracy.
- [ ] Add UI tests for unavailable values and incomplete totals.

**Exit gate:** Users can tell what is known, unknown, and included in each metric.

## Phase 7 — Hardening and release

### Task 7.1 — Security and reliability review
- [ ] Keep API secrets server-side.
- [ ] Avoid logging sensitive tradebook contents.
- [ ] Check file-size/type limits and malformed input handling.
- [ ] Review provider terms and quotas.
- [ ] Check dependency and deployment compatibility.

### Task 7.2 — Acceptance verification
- [ ] Run lint, unit tests, and production build.
- [ ] Verify no fabricated price or silent-zero path remains.
- [ ] Verify representative import fixtures and accounting scenarios.
- [ ] Verify missing/stale quote UI and reconciliation warnings.
- [ ] Test preview deployment if credentials/access are available.
- [ ] Update README and `progress.md` with actual results.

### Task 7.3 — Review and merge
- [ ] Review final diff and task history.
- [ ] Update the pull request with implemented scope and known gaps.
- [ ] Merge only after review and checks; never claim merge/deployment without confirmation.

**Exit gate:** The release meets documented acceptance criteria and clearly discloses unsupported cases.

## Task completion template

For every task, update `progress.md` with:
- Task ID and goal
- Files changed
- What was implemented
- Tests/build/lint actually run and exact results
- What could not be verified
- Remaining risks/blockers
- Next single task
- Commit and PR links

Do not begin a dependent task until its prerequisite is complete or explicitly waived with a reason.
