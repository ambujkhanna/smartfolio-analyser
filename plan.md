# Smartfolio Analyser — Implementation Plan

**Status:** Active plan  
**Last updated:** 29 October 2026  
**Working branch:** `docs/project-plan-and-progress`  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Related PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

This plan is the actionable companion to [PROJECT_LOG.md](docs/PROJECT_LOG.md). It describes the order of implementation, stage gates, and definition of done. Roadmap items are not complete until verified in code and tests.

## Guiding rules

1. Do not push application changes directly to `main`.
2. Never use fabricated/default market prices.
3. Never silently discard transactions or infer unknown cost basis.
4. Keep accounting calculations deterministic and testable without network calls.
5. Make one coherent change per stage; run tests/build and update `progress.md` before starting the next stage.
6. State clearly which checks ran and which did not.
7. Check provider terms, coverage, quotas, and cost before selecting a data source.
8. Do not claim tax-grade accuracy without explicit validation.

## Stage 0 — Documentation and baseline

- [x] Expand README with project purpose, known limitations, architecture direction, and roadmap (committed on documentation branch).
- [x] Consolidate project discussions and audit findings into the project log.
- [x] Create this implementation plan and the progress tracker.
- [ ] Recheck the current repository and branch state.
- [ ] Run the existing build and record baseline test/build status.
- [ ] Confirm branch/PR state before code changes.

**Exit gate:** Source state is verified, the baseline is recorded, and the implementation branch is known. No application behavior changes are included in this documentation stage.

## Stage 1 — Remove fabricated prices (highest priority)

- [ ] Inspect the current `calculatePnL.ts`, types, and holdings UI on the implementation branch.
- [ ] Add or confirm regression tests for known and unknown instruments.
- [ ] Remove `MOCK_CURRENT_PRICES` and the ₹100 fallback.
- [ ] Make missing quote state explicit in types and calculation results.
- [ ] Render unavailable market value/P&L instead of fake numbers or zero.
- [ ] Preserve source, timestamp, currency, and quote type for valid prices.
- [ ] Run tests and production build.

**Exit gate:** No calculation path fabricates a price; missing quotes remain visibly unavailable.

## Stage 2 — Canonical model and accounting specification

- [ ] Define canonical instrument, transaction, quote, lot, position, warning, and calculation-result types.
- [ ] Specify realized P&L, unrealized P&L, economic P&L, position break-even, and lifecycle recovery formulas.
- [ ] Decide initial lot/cost allocation approach and label it.
- [ ] Define treatment of charges, dividends, opening balances, and incomplete history.
- [ ] Document unsupported transaction types and ambiguity handling.
- [ ] Add hand-calculated example fixtures.

**Exit gate:** Accounting definitions and types are explicit and covered by test examples.

## Stage 3 — Accounting engine

- [ ] Separate ledger construction from quote fetching and CSV parsing.
- [ ] Implement deterministic ordering and validation.
- [ ] Handle multiple buys, partial sells, full exits, and sell/re-buy cycles.
- [ ] Support explicit opening positions where available.
- [ ] Handle charges without double counting.
- [ ] Flag oversells, missing acquisition costs, and ambiguous same-day ordering.
- [ ] Add corporate-action extension points and tests for each supported action.
- [ ] Verify economic P&L reconciliation and avoid double counting realized/unrealized components.

**Exit gate:** Deterministic accounting tests pass for the documented supported scenarios.

## Stage 4 — Broker import and reconciliation

- [ ] Obtain sanitized representative exports for the first broker format.
- [ ] Build format detection and broker-specific import adapter(s).
- [ ] Add import preview, row-level errors, and unsupported-row reporting.
- [ ] Preserve source filename and row number.
- [ ] Make repeated import idempotent.
- [ ] Import holdings/opening positions where available.
- [ ] Reconcile reconstructed quantities with broker holdings.
- [ ] Explain differences without silently adjusting positions.

**Exit gate:** Test exports parse without silent row loss and reconciliation discrepancies are visible.

## Stage 5 — Instrument resolution

- [ ] Define stable instrument identity using available identifiers such as ISIN, exchange, and provider instrument key.
- [ ] Build/load an instrument master from a permitted source.
- [ ] Handle aliases, symbol changes, and NSE/BSE distinctions.
- [ ] Add confidence thresholds and ambiguity states.
- [ ] Preserve unresolved instruments for user review.

**Exit gate:** Instruments resolve deterministically or are explicitly marked unresolved.

## Stage 6 — Market-data adapters

- [ ] Evaluate current official documentation, terms, coverage, quotas, and cost for candidate providers.
- [ ] Choose an Indian equities/ETF quote provider based on evidence.
- [ ] Implement provider adapter and batch/cache behavior.
- [ ] Implement mutual-fund NAV resolution with scheme identity and NAV date.
- [ ] Validate instrument match, currency, positive finite price, quote type, and freshness.
- [ ] Preserve source and timestamp/valuation date.
- [ ] Handle rate limits, provider errors, and unavailable instruments.
- [ ] Ask for approval before introducing a mandatory paid service.

**Exit gate:** Each displayed quote/NAV is traceable and validated, or the app clearly reports it as unavailable.

## Stage 7 — Dashboard and quality reporting

- [ ] Show realized, unrealized, and economic P&L with definitions.
- [ ] Distinguish position break-even from lifecycle recovery price.
- [ ] Show quote source, quote type, and timestamp.
- [ ] Add import warnings, missing data, stale quote, and reconciliation panels.
- [ ] Clearly mark incomplete totals and unsupported cases.
- [ ] Keep visualizations secondary to numerical correctness.

**Exit gate:** Users can understand both results and limitations from the UI.

## Stage 8 — Deployment hardening

- [ ] Run automated tests and production build.
- [ ] Check secret handling and server/client boundaries.
- [ ] Verify provider quotas and deployment limits.
- [ ] Test a preview deployment.
- [ ] Confirm no fake prices are present in production paths.
- [ ] Update README and `progress.md` with verified outcomes.
- [ ] Open/update a PR and merge only after review.

**Exit gate:** Deployment is reproducible, secrets are protected, and acceptance criteria pass.

## Definition of done for each stage

Before starting the next stage:

- Code changes are committed on a non-main branch.
- Relevant tests have been run and their result recorded.
- Production build has been run when applicable.
- `progress.md` has been updated with completed work, outstanding work, blockers, and the single recommended next step.
- Documentation does not describe planned work as implemented.
