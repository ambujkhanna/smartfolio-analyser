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
- [x] Run lint, tests, and production build in GitHub Actions; the later full run passed.

**Exit gate:** App entry files exist and no mock financial results are shown. Build/lint verification remains outstanding.

### Task 0.3 — Establish automated test/build workflow
- [x] Add a deterministic unit test for money formatting and missing/non-finite values.
- [x] Add Vitest configuration.
- [x] Add an ESLint 9 flat-config bridge for the Next.js rules.
- [x] Add a GitHub Actions workflow for dependency install, lint, tests, and production build.
- [x] Generate and commit package-lock.json using npm in GitHub Actions.
- [x] Observe successful lint/test/build and clean npm ci runs; fix the issues those runs reported.
- [x] Record exact results in progress.md; do not infer success from configuration alone.

**Exit gate:** Passed. The committed lockfile was used by a clean npm ci run; lint, tests, and production build passed.

## Phase 1 — Financial-data integrity

### Task 1.1 — Define quote and availability types
- [x] Define canonical instrument identity fields for ID, ISIN, exchange, symbol, asset type, currency, and provider keys.
- [x] Define a quote type with price, currency, source, quote type, timestamp/valuation date, and provider instrument identity.
- [x] Define explicit unavailable/invalid/stale/mismatched quote states.
- [x] Validate finite positive prices, instrument identity, currency, source, quote type, and timestamp; reject future or stale quotes.
- [x] Add tests for valid, missing, stale, mismatched, and invalid quotes.
- [x] Execute quote tests in CI; all tests passed in the verified run.

### Task 1.2 — Define canonical transaction and result types
- [x] Model buys, sells, fees/charges, dividends, and opening balances explicitly in the canonical transaction type.
- [x] Preserve transaction date/time, transaction ID, instrument identity, currency, and import source/row.
- [x] Allow opening balances with missing original cost basis so incompleteness can be represented without guessing.
- [x] Add runtime validation that returns structured field-level issues rather than dropping malformed rows.
- [x] Add tests for valid trades, malformed inputs, quantities/prices, opening cost basis, fees, dates, and source metadata.
- [x] Execute transaction validation tests in CI; all tests passed in the verified run.

### Task 1.3 — Implement a safe first calculation boundary
- [x] Create a pure position valuation function that receives position data and an explicit quote-validation result.
- [x] Keep the valuation function independent of network calls and default/fallback prices.
- [x] Return unavailable market value and unrealized P&L for missing, stale, invalid, or mismatched quotes.
- [x] Keep unrealized P&L unavailable when cost basis is missing, while allowing validated market value to be shown.
- [x] Add deterministic tests for valid valuation, unavailable/stale quote, missing cost basis, and invalid position inputs.
- [x] Execute valuation, ledger, and P&L tests in CI; all tests passed in the verified run.

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
- [x] Parse CSV records using PapaParse without silently dropping malformed/unsupported rows.
- [x] Preserve filename, logical row number, raw values, and parser errors for preview.
- [x] Validate dates, quantity, price, transaction type, currency, and stable instrument identity before accepting canonical transactions.
- [x] Keep symbol-only security rows in a needs-resolution state instead of guessing identity.
- [x] Generate deterministic per-file/per-row IDs when the source has no transaction ID.
- [x] Add fixtures for quoted commas/newlines, invalid numbers, duplicate normalized headers, unsupported kinds, and missing instrument identity.
- [x] Execute generic CSV importer tests in CI; all tests passed in the verified run.

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

### Task 3.4 — Automatic-first broker data acquisition (product requirement)

- [ ] Treat broker connections as the default data source; a user must not be forced to upload separate dividend, corporate-action, charge, or opening-balance reports when an authorised platform API or already-imported source can supply the needed records.
- [ ] Add a provider capability registry by broker, asset class, data type, historical coverage, and authentication state. Never infer that an endpoint exists just because another broker has it.
- [ ] Fetch all available read-only sources from each connected broker and preserve provider, retrieval time, coverage period, source IDs, and raw-record provenance.
- [ ] Normalize and deduplicate records across connected providers using stable provider IDs first, then conservative composite keys; never silently merge uncertain matches.
- [ ] Build a data-completeness assessment after automatic sync: compare trades, positions, holdings, charges, dividends, corporate actions, mutual funds, and cash flows only where relevant data is available.
- [ ] Ask for a user file/value only when the required data is not exposed by the connected platform, the user has not connected that source, or a record cannot be reliably matched. Explain the exact gap, why it changes a metric, and the smallest useful report/date range to supply.
- [ ] Keep unsupported/unavailable sources optional. Missing data should mark affected metrics incomplete; it must not block the entire analysis or force irrelevant report uploads.
- [ ] Keep data read-only; no order placement or account mutation. Do not create transactions from holdings snapshots. Use snapshots for reconciliation/opening-balance evidence only.
- [ ] Add fixtures/tests for duplicate records across providers, missing history, partial API coverage, ambiguous corporate actions, missing charges, and a fully auto-resolved portfolio that requires no uploads.
- [ ] Verify each provider's current official API capabilities and commercial limits before implementation. Zerodha's current Kite Connect endpoints include holdings and positions, while its standard orders/trades endpoints are current-day; Groww documents portfolio/order/trade APIs but access and pricing must be checked. Dividend/corporate-action history must not be presumed available from either API without an explicit supported endpoint.

### Task 3.5 — Stabilise deployment and re-verify imports (added 11 Nov 2026)

- [x] Show the deployed commit in the page footer and at `/api/version`, so a stale branch alias (seen twice with `390f26a`) is visible immediately.
- [ ] Confirm the Preview branch alias serves the newest commit; promote the newest deployment if not (never Redeploy an older entry).
- [ ] Re-upload the same Zerodha tradebook on the current Preview; all rows must be accepted with dates, quantities, prices and trade IDs intact.
- [ ] Re-run holdings reconciliation after the ISIN fixes (`dcdf903`, `9998f79`) and record the new counts; classify remaining mismatches as missing history vs. bug.
- [ ] Decide on the public Production alias `smartfolio-analyser.vercel.app`, which still serves an early feature-branch build: protect it, or relabel the README "Live app" link until release.
- [ ] Treat the tradebook upload as a one-time historical baseline import in the UI; daily sync (Phase 3 storage) keeps it current afterwards.
- [ ] Show Zerodha holdings `average_price` as a labelled broker cost basis where history is missing (unrealized P&L only).

**Acceptance criteria:** Users can connect supported platforms and receive a coverage report without uploading one file per transaction category. The app only asks for additional input to resolve a specific, material data gap; every request explains why it is needed. No missing data is fabricated and no report is mandatory merely because its category exists.

## Phase 4 — Instrument identity

### Task 4.1 — Create instrument identity model
- [x] Support canonical ID, ISIN, exchange, symbol, provider key, asset type, and currency.
- [x] Distinguish exchange-specific NSE/BSE listings.
- [x] Avoid using display symbol alone as a universal identity.
- [ ] Add full alias/symbol-change history design.

### Task 4.2 — Add resolver and unresolved state
- [x] Resolve exact canonical/provider IDs and ISIN+exchange matches.
- [x] Resolve unique ISIN/symbol matches at medium confidence; keep ambiguous matches unresolved.
- [x] Add tests for NSE/BSE ambiguity, explicit ID mismatch, raw ISINs, provider keys, unique symbols, and unknown instruments.
- [ ] Test aliases and renamed securities once instrument-master history is available.

### Task 4.3 — Load a trusted instrument master
- [x] Parse the official Upstox JSON BOD master for supported NSE/BSE cash-equity records.
- [x] Preserve exchange-specific provider keys and report duplicate/incomplete records.
- [x] Add a best-effort six-hour cache and fixture-based loader tests.
- [x] Add a bounded public instrument-resolution endpoint and connect it to the CSV preview UI.
- [ ] Verify the current live master download and broaden coverage for symbol changes and mutual funds.

**Exit gate:** Instrument identity resolves deterministically or is visibly ambiguous/unresolved. The live master download and historical alias coverage remain to be verified.

## Phase 5 — Market data

### Task 5.1 — Evaluate provider options
- [x] Review official Upstox Analytics Token and Market Quote V3 docs, including cost, authentication, freshness fields, and batch limit.
- [x] Review AMFI official NAV download/history notices and history-window limit.
- [x] Document deployment constraints and server-side credential handling.
- [x] Recommend Upstox for listed equity/ETF quotes and AMFI for mutual-fund NAVs as free-first sources.

### Task 5.2 — Implement equity/ETF quote adapter
- [x] Implement the Upstox Market Quote V3 adapter behind a typed interface.
- [x] Validate instrument identity, currency, finite positive price, quote type, timestamps, and freshness.
- [x] Add batches capped at 500 keys and explicit unavailable/error states.
- [x] Test valid/stale/invalid/missing-key/missing-token/auth/rate-limit responses using fixtures.
- [ ] Add endpoint cache and secure access controls before exposing live quotes to the UI.

### Task 5.3 — Implement mutual-fund NAV adapter
- [x] Parse current 8-column AMFI NAV records and retain legacy 6-column support for old fixtures.
- [x] Resolve NAV by explicit AMFI scheme code or unambiguous ISIN; preserve plan/option and valuation date.
- [x] Validate positive finite NAV, currency, and freshness using the shared quote validator.
- [x] Test current/legacy formats, invalid rows/dates, ambiguous ISINs, and non-MF instruments.
- [ ] Fetch/cache the current AMFI feed server-side and verify against a captured live response.

### Task 5.4 — Secure live quote wiring
- [x] Define the access-control model: server-side Upstox token plus a separate Smartfolio access key.
- [x] Add a bounded quote API (maximum 50 references per request) that resolves only against the trusted instrument master.
- [x] Add a 60-second per-instance quote cache, request-size limits, and best-effort per-IP rate limiting.
- [x] Keep provider credentials server-side and disable live requests when required configuration is missing.
- [x] Connect quote provenance, quote age, and stale/unavailable states to the P&L UI.
- [x] Add tests for missing configuration, invalid access key, malformed body, and quote-to-position valuation mapping.
- [ ] Configure the two secrets in the deployment environment and verify a real authenticated response.
- [ ] Replace best-effort in-memory rate limits/cache with hosting-level/shared controls before broad public use.

**Exit gate:** Endpoint implementation and CI checks pass. Live market data is not considered enabled until secrets are configured and a real provider response is verified. No unauthenticated open proxy backed by a provider token.

## Phase 6 — UI and data-quality reporting

### Task 6.1 — Import review UI
- [x] Upload CSV files up to a 5 MB client-side limit.
- [x] Show row counts, accepted/rejected counts, and validation issues before acceptance.
- [x] Explain unsupported rows and unresolved instrument identity; preserve raw cells including duplicate headers.
- [x] Keep parsing in the importer module and UI orchestration in a client component.
- [ ] Add automated component tests once a UI test library is selected.

### Task 6.2 — Holdings and P&L UI
- [x] Show realized, unrealized, market value, and economic P&L separately; label the FIFO preview and partial status.
- [x] Show position break-even separately from lifecycle recovery price.
- [ ] Show quote/NAV source, quote type, timestamp/valuation date, and stale/unavailable state once live quotes are connected.
- [x] Render missing financial values as Unavailable, never as ₹0.
- [x] Show a partial/incomplete status when import issues, missing quotes, or ledger warnings exist.

### Task 6.3 — Warnings and reconciliation UI
- [x] Show invalid/unresolved import rows, missing quote warnings, ledger errors, and incomplete-history warnings; full stale-quote and broker-quantity reconciliation UI remains pending.
- [x] Surface import issues and ledger errors/warnings alongside the affected calculation preview.
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

### Task 7.4 — Owner-only Production (added 12 Nov 2026)
- [x] Free access-code gate (`APP_ACCESS_CODE`, middleware, 1-year cookie) because Vercel Hobby does not protect the Production domain.
- [x] Zerodha login always runs on the registered redirect site, so one fixed redirect URL works from any deployment.
- [ ] Owner sets Production env vars and the Kite redirect once, then `main` is updated (see docs/PRODUCTION_SETUP.md).

### Task 7.5 — TODO (future): share with a closed group of friends
- [ ] Per-user sign-in instead of one shared access code.
- [ ] Separate stored data per user (depends on the Phase 3 database).
- [ ] Confirm whether a Kite Connect Personal (free) app may be used by other people's Zerodha accounts; otherwise each friend uses their own Kite app or a paid plan.
- [ ] Decide hosting/cost (Vercel Hobby is for personal, non-commercial use).

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
