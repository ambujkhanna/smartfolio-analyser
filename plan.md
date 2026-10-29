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
- [x] Add App Router root layout, global CSS, and a minimal landing page.
- [x] Add the minimum app entry files needed by the current package (no extra Next.js config was required for the files created).
- [x] Ensure the page states that analysis is not available until transaction import and verified data are implemented.
- [x] Do not add fabricated portfolio values or sample market prices.
- [x] Fetch the changed files back from GitHub and inspect them.
- [ ] Run build/lint in a runtime; this has not been available during this task.

**Exit gate:** App entry files exist and no mock financial results are shown. Build/lint verification remains outstanding.

### Task 0.3 — Establish automated test/build workflow
- [x] Add a deterministic unit test for money formatting and missing/non-finite values.
- [x] Add Vitest configuration.
- [x] Add an ESLint 9 flat-config bridge for the Next.js rules.
- [x] Add a GitHub Actions workflow for dependency install, lint, tests, and production build.
- [ ] Add a committed npm lockfile when a package-manager runtime is available.
- [ ] Observe a successful CI run and fix any issues it reports.
- [ ] Record exact command results; do not infer success from configuration alone.

**Exit gate:** Test/lint/build configuration exists. Task remains open until a committed lockfile and an observed successful CI run confirm reproducibility.

## Phase 1 — Financial-data integrity

### Task 1.1 — Define quote and availability types
- [ ] Define instrument identity fields needed by calculations.
- [x] Define a quote type with price, currency, source, quote type, timestamp/valuation date, and provider instrument identity.
- [x] Define explicit unavailable/invalid/stale/mismatched quote states.
- [x] Validate finite positive prices, instrument identity, currency, source, quote type, and timestamp; reject future or stale quotes.
- [x] Add tests for valid, missing, stale, mismatched, and invalid quotes.
- [ ] Execute quote tests in CI/local runtime and fix any failures.

### Task 1.2 — Define canonical transaction and result types
- [x] Model buys, sells, fees/charges, dividends, and opening balances explicitly in the canonical transaction type.
- [x] Preserve transaction date/time, transaction ID, instrument identity, currency, and import source/row.
- [x] Allow opening balances with missing original cost basis so incompleteness can be represented without guessing.
- [x] Add runtime validation that returns structured field-level issues rather than dropping malformed rows.
- [x] Add tests for valid trades, malformed inputs, quantities/prices, opening cost basis, fees, dates, and source metadata.
- [ ] Execute transaction validation tests in CI/local runtime and fix any failures.

### Task 1.3 — Implement a safe first calculation boundary
- [x] Create a pure position valuation function that receives position data and an explicit quote-validation result.
- [x] Keep the valuation function independent of network calls and default/fallback prices.
- [x] Return unavailable market value and unrealized P&L for missing, stale, invalid, or mismatched quotes.
- [x] Keep unrealized P&L unavailable when cost basis is missing, while allowing validated market value to be shown.
- [x] Add deterministic tests for valid valuation, unavailable/stale quote, missing cost basis, and invalid position inputs.
- [ ] Execute the calculation tests in CI/local runtime and fix any failures.

**Exit gate:** No path in the calculation layer can fabricate a market price.

## Phase 2 — Accounting specification and engine

### Task 2.1 — Document accounting conventions
- [x] Define realized P&L, unrealized P&L, economic P&L, position break-even, and lifecycle recovery price.
- [x] Choose and label FIFO as the initial lot-allocation method; document that this is not tax-grade reporting.
- [x] Define trade-level versus standalone fees and prevent double counting.
- [x] Scope dividends, taxes, opening balances, and incomplete history.
- [x] Define behavior for zero quantity and closed lifecycle recovery.
- [x] Add hand-calculated sell/re-buy, FIFO partial sale, missing quote, and unknown opening-cost examples.

### Task 2.2 — Implement chronological ledger and position lots
- [ ] Validate required transaction fields and stable ordering.
- [ ] Handle multiple buys, weighted/lot cost, partial sells, and full exits.
- [ ] Handle sell/re-buy cycles without erasing earlier lifecycle cash flows.
- [ ] Flag oversells, missing cost basis, and ambiguous ordering.
- [ ] Preserve traceability from every result back to source transactions.

### Task 2.3 — Implement P&L and recovery calculations
- [x] Calculate realized and unrealized P&L separately.
- [x] Calculate economic P&L from documented cash-flow components without double counting.
- [x] Calculate position break-even and lifecycle recovery separately.
- [x] Return warnings and completeness metadata alongside numeric results.
- [x] Add regression tests for sell/re-buy, FIFO partial sale, missing quote, and unknown opening cost.
- [ ] Expand tests to cover buy-and-hold, full close, fee/dividend allocation, duplicate import, and oversell interactions.
- [ ] Execute all tests in CI/local runtime and fix any failures.

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
