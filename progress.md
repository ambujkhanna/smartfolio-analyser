# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each implementation task. Status reflects verified repository state and checks actually run.

## Current status

**Current phase/task:** Phase 5, Task 5.4 — Secure quote endpoint and live-data wiring  
**Overall status:** The app now includes browser-side CSV preview, local P&L calculation preview, a public instrument-master resolver endpoint, and row-level instrument-resolution UI. The quote/NAV adapters are implemented and tested, but live quotes are not yet connected to the UI; the next step is to add a protected quote endpoint and cache.  
**Last verified code checks:** GitHub Actions run [40817011727](https://github.com/ambujkhanna/smartfolio-analyser/actions/runs/40817011727) succeeded on the latest implementation code: clean `npm ci`, ESLint, 77 unit tests across 11 files, and production build all passed.  
**Lockfile:** `package-lock.json` is committed. The quality workflow uses `npm ci` when the lockfile exists. Documentation-only commits no longer trigger redundant CI runs.  
**Current market-data state:** Provider adapters have fixture-based tests, but no live quote/NAV request is connected to the browser UI. No provider token has been configured in the deployment environment.

## Completed

- [x] Confirmed the dedicated repository and created the non-main implementation branch `feat/reliable-pnl-foundation`.
- [x] Broke the implementation roadmap into small tasks with explicit exit gates in plan.md.
- [x] **Task 0.2:** Added Next.js layout, truthful landing page, and global styles; no fabricated prices or sample portfolio values.
- [x] **Task 0.3:** Added ESLint 9 configuration, Vitest configuration, GitHub Actions, and package-lock.json. CI passes clean install, lint, tests, and build.
- [x] **Task 1.1:** Added quote model/provenance and validation for available, unavailable, invalid, mismatched, stale, and future-dated quote states.
- [x] **Task 1.2:** Added canonical transaction types and runtime validation for buys, sells, opening balances, fees, and dividends. Ambiguous locale dates are rejected.
- [x] **Task 1.3:** Added pure position valuation. Missing/stale quotes do not become zero; unknown cost basis leaves unrealized P&L unavailable.
- [x] **Task 2.1:** Added docs/ACCOUNTING_RULES.md with initial FIFO conventions, fee/dividend scope, economic P&L/recovery formulas, and hand-calculated examples.
- [x] **Task 2.2:** Added chronological FIFO ledger for partial/full sales, sell/re-buy cycles, opening positions, charges, standalone fees/dividends, duplicate IDs, oversells, and ambiguous ordering.
- [x] **Task 2.3:** Added realized/unrealized/economic P&L, market value, position break-even, lifecycle recovery, and completeness metadata.
- [x] **Task 3.1:** Added generic CSV parser with PapaParse, raw row preservation, row-level issues, duplicate-header handling, deterministic generated IDs, and unresolved symbol-only rows.
- [x] **Task 4.1/4.2:** Added canonical instrument model and deterministic resolver with confidence states; ambiguous NSE/BSE and ISIN matches remain unresolved.
- [x] **Task 4.3:** Added official Upstox JSON BOD instrument-master parser/loader, exchange-specific provider keys, duplicate/incomplete-row warnings, and a best-effort six-hour cache.
- [x] **Instrument resolution UI/API:** Added a bounded POST endpoint for up to 100 identifier references and connected the import review UI to resolve symbols/ISINs. Symbol-only candidate rows are accepted only after a deterministic match; ambiguous NSE/BSE identities remain unresolved.
- [x] **Task 5.1:** Reviewed official Upstox and AMFI documentation and recorded the free-first source decision in docs/MARKET_DATA_PROVIDER_REVIEW.md.
- [x] **Task 5.2 (adapter code):** Added Upstox Market Quote V3 adapter with server-supplied credentials, 500-key batches, exact provider-key matching, timestamps, and unavailable/error states.
- [x] **Task 5.3 (parser/resolver code):** Added AMFI NAV parsing for current 8-column data and legacy fixtures, exact scheme resolution, NAV date provenance, and validation.
- [x] **Task 6.1:** Added browser-side CSV preview with a 5 MB limit, accepted/rejected counts, raw row details, and issue reporting.
- [x] **Task 6.3 (initial):** Displayed resolved, ambiguous, and unresolved instrument states; import issues and ledger warnings/errors remain visible.
- [x] **Task 6.2 (initial implementation):** Added local calculation preview from accepted rows, including realized/unrealized/economic P&L, market value, remaining cost basis, position break-even, lifecycle recovery, and incomplete-data warnings.
- [x] Updated README.md to describe the actual implementation and current limitations.
- [x] **Quality verification:** Clean npm install via committed lockfile, lint, 77 tests across 11 files, and production build passed in GitHub Actions.

## In progress

- [ ] **Task 6.3:** Finish quality reporting and reconciliation states; broker holdings comparison and stale-quote display need live data wiring.
- [x] Add a trusted instrument-master parser/loader so imported ISIN/symbol references can resolve to provider keys without guessing.
- [x] Integrate safe instrument lookup into the import flow; live master download still needs verification.
- [ ] Connect server-side quote/NAV fetching to the UI only after caching and access controls are in place.

## Not yet implemented

- [ ] Broker-specific CSV adapters and repeat-import idempotency based on a real sanitized broker sample.
- [ ] Production instrument master data and symbol-change/alias coverage.
- [ ] Protected server-side quote/NAV endpoint with cache, bounded request sizes, and access controls.
- [ ] Live quote/NAV retrieval connected to the dashboard; the current UI deliberately does not invent prices.
- [ ] Broker holdings/opening-position import and quantity reconciliation.
- [ ] Persistent portfolio storage.
- [ ] UI component tests for import review and P&L preview.
- [ ] Final security review, deployment verification, and release PR.

## Blockers / decisions

- **Live equity/ETF data:** The Upstox adapter needs a securely configured server-side Analytics Token and verified provider instrument keys. Never paste credentials into chat or commit them.
- **Instrument identity:** A trusted instrument master is needed before mapping symbol/ISIN to provider keys.
- **Broker adapter:** No sanitized tradebook/holdings sample is present. Do not invent a broker-specific format.
- **Security:** Do not expose a public open proxy backed by a provider token. Add caching, bounded requests, and access controls before exposing live quote endpoints.
- **Accounting scope:** FIFO is a portfolio-performance convention, not a tax-grade claim. Corporate actions and FX remain unsupported until explicitly modeled.

## Next single task

**Add a trusted instrument-master loader for Upstox.** Inspect the official instrument-master format, parse ISIN/symbol/exchange/provider key into the canonical instrument model, and test duplicates/ambiguity without network-dependent unit tests. This enables safe provider-key resolution before wiring live quotes. Keep the UI explicit that market values are unavailable until a valid quote is supplied.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Repository inventory and task breakdown | Confirmed actual repository structure and decomposed work into small tasks | Git tree/package.json fetched |
| 2026-10-29 | App shell and import preview | Added truthful landing page and browser CSV preview | Build and lint pass in CI |
| 2026-10-29 | Domain/ledger/P&L foundation | Added quote and transaction validation, FIFO ledger, P&L/recovery calculations | Unit tests passed in CI |
| 2026-10-29 | Generic CSV and instrument resolver | Added row-preserving parser and exact resolution states | Unit tests passed in CI |
| 2026-10-29 | Market-data adapters | Added Upstox quote adapter, AMFI NAV parser/resolver, and Upstox instrument-master loader with fixtures | Latest run [40816690406](https://github.com/ambujkhanna/smartfolio-analyser/actions/runs/40816690406) passed clean npm ci, lint, 77 tests, and build; no live market request used |
| 2026-10-29 | P&L preview UI | Connected accepted rows to local P&L preview and incomplete-data messaging | Run 40816223371 passed clean npm ci, lint, tests, and build |
| 2026-10-29 | Instrument resolution flow | Added bounded public master lookup endpoint and UI resolution flow for ISIN/symbol references | Latest run [40817011727](https://github.com/ambujkhanna/smartfolio-analyser/actions/runs/40817011727) passed clean npm ci, lint, 77 tests, and build |

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
