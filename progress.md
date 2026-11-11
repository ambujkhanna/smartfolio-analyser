# Smartfolio Analyser — Progress Tracker

**Last updated:** 11 November 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Implementation branch:** `feat/reliable-pnl-foundation`  
**Documentation PR:** https://github.com/ambujkhanna/smartfolio-analyser/pull/1

> This file is updated after each implementation task. Status reflects verified repository state and checks actually run.

## Current status

**Current phase/task:** Implement automatic-first portfolio data acquisition and gap assessment, with persistent secure portfolio storage and scheduled broker sync explicitly recorded as a discussion/architecture decision to revisit before implementation. User requirement: do not require separate dividend, corporate-action, fee, or other reports when a connected broker/platform can supply the information; fetch and match available data automatically, then ask only for the specific missing source/value that cannot be obtained or reliably matched. The automatic-first acceptance criteria have been added to plan.md. The reconciliation UI and ISIN quantity aggregation are committed on `feat/reliable-pnl-foundation`; latest code CI/deployment is still pending. XLS/XLSX and PDF remain future parser tasks.  
**Architecture decision to revisit:** Discuss and decide on secure persistent per-user portfolio storage (private managed database, encryption/access controls, retention/deletion and backups) plus scheduled daily broker sync. Initial historical trades/holdings should establish a reconciled baseline once; subsequent authorised syncs should append/deduplicate new activity and snapshots so users do not repeatedly upload the same files. Track sync health and coverage, handle expired authorisation/API gaps, and never infer missing trades from holdings snapshots. This remains a discussion/planning item, not implemented.

**Overall status:** The app includes browser-side CSV preview, local FIFO/P&L calculation, instrument resolution, a protected quote endpoint, quote provenance UI, and a read-only Zerodha Kite Connect integration. The user verified that holdings, positions, current-day orders, and current-day trades return data in Preview. Holdings reconciliation compares current broker quantities with ledger open quantities by ISIN and does not turn snapshots into transactions. Product direction is now automatic-first: pull supported data from each connected platform, match and deduplicate it, report coverage, and request files only for specific material gaps not exposed by the platform APIs. This is specified in plan.md but the cross-provider orchestration and gap-request UI are not yet implemented. Upstox live quote/NAV calls remain separately unverified.  
**Last verified code checks (11 Nov 2026):** Latest code commit `9998f79` passed lint, tests and build in [run 40847362027](https://github.com/ambujkhanna/smartfolio-analyser/actions/runs/40847362027) (as did `dcdf903` and `6072b21`); `9998f79` and the latest docs commit `a1e6906` both report a successful Vercel deployment. Not yet re-verified in the app: the tradebook re-upload and the reconciliation re-run on the newest Preview.  
**Deployment caveats (11 Nov 2026):** The Preview branch alias was twice found serving the stale commit `390f26a`; the page footer and `/api/version` now show the deployed commit. The Production alias `smartfolio-analyser.vercel.app` is publicly reachable and still serves an early feature-branch build (no Zerodha routes); Preview deployments are behind Vercel authentication.  
**Lockfile:** `package-lock.json` is committed. The quality workflow uses `npm ci` when the lockfile exists. Documentation-only commits no longer trigger redundant CI runs.  
**Current market-data state:** The browser UI calls `/api/quotes` with the Smartfolio access key and recalculates valuations from returned quote results. The server route uses `SMARTFOLIO_ACCESS_KEY` and `UPSTOX_ANALYTICS_TOKEN`; AMFI NAV requests do not need the Upstox token. Live Zerodha account-data requests have been verified by the user in Preview. Live Upstox quote/NAV requests remain unverified.

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

- [ ] **Automatic-first data acquisition (product requirement):** Plan updated to retrieve all available broker data, deduplicate and reconcile it, assess coverage, and ask for user files only for specific gaps. The provider registry, cross-provider ingestion, coverage report, and targeted missing-data prompts are not implemented yet.

- [ ] **Zerodha holdings reconciliation:** UI now compares the current holdings snapshot with imported-ledger open quantities using exact ISINs. Validate lint, TypeScript, build, and edge cases in CI before treating this as complete.

- [ ] **Task 6.3:** Finish quality reporting and reconciliation states; broker holdings comparison and stale-quote display need live data wiring.
- [x] Add a trusted instrument-master parser/loader so imported ISIN/symbol references can resolve to provider keys without guessing.
- [x] Integrate safe instrument lookup into the import flow; live master download still needs verification.
- [x] Connect server-side quote/NAV fetching to the UI after adding bounded requests, caching, and access controls.

## Not yet implemented

- [x] Delimited text import: CSV/TXT with delimiter auto-detection and browser-only parsing; 5 MB limit and row-level provenance. XLS/XLSX and PDF remain explicitly unsupported until dedicated parsers and tests are added.
- [ ] Repeat-import idempotency across separately imported files and reconciliation. Zerodha Tradebook adapter code and sanitized fixtures have been added; verify CI before marking complete. Next: holdings snapshot reconciliation with explicit quantity/cost-basis limitations. PDF scans will need OCR (not assumed available) and tax reports must not be mistaken for transaction ledgers.
- [ ] Production instrument master data and symbol-change/alias coverage.
- [x] Protected server-side quote/NAV endpoint with cache, bounded request sizes, and access controls (best-effort in-memory limits; shared limits remain a production hardening item).
- [x] Live quote/NAV retrieval connected to the import-review dashboard; live provider verification remains outstanding.
- [ ] Broker transaction/history ingestion and opening-position import. Quantity reconciliation is implemented as a read-only comparison; do not convert a holdings snapshot into transactions because that would risk double counting. Build automatic-first acquisition before asking for separate reports.
- [ ] Persistent portfolio storage.
- [ ] UI component tests for import review and P&L preview.
- [ ] Final security review, deployment verification, and release PR.

## Blockers / decisions

- **Live equity/ETF data:** The Upstox adapter needs a securely configured server-side Analytics Token and verified provider instrument keys. Never paste credentials into chat or commit them.
- **Instrument identity:** A trusted instrument master is needed before mapping symbol/ISIN to provider keys.
- **Broker adapter:** Awaiting sanitized Zerodha Tradebook CSV and Holdings CSV samples. Do not invent broker-specific columns or commit raw account exports.
- **Security:** Do not expose a public open proxy backed by a provider token. Add caching, bounded requests, and access controls before exposing live quote endpoints.
- **Accounting scope:** FIFO is a portfolio-performance convention, not a tax-grade claim. Corporate actions and FX remain unsupported until explicitly modeled.

## Next single task

**Confirm the Preview alias serves the newest commit, then re-test (plan Task 3.5).** Check the footer/`/api/version` commit on the branch alias, re-upload the same Zerodha tradebook (expect all rows accepted), reconnect Zerodha and re-run holdings reconciliation, and record the new counts. In parallel, once the Upstox Analytics Token is configured, verify live quotes for a few NSE holdings and one AMFI NAV.

## Task history

| Date | Task | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | Repository inventory and task breakdown | Confirmed actual repository structure and decomposed work into small tasks | Git tree/package.json fetched |
| 2026-10-29 | App shell and import preview | Added truthful landing page and browser CSV preview | Build and lint pass in CI |
| 2026-10-29 | Domain/ledger/P&L foundation | Added quote and transaction validation, FIFO ledger, P&L/recovery calculations | Unit tests passed in CI |
| 2026-10-29 | Generic CSV and instrument resolver | Added row-preserving parser and exact resolution states | Unit tests passed in CI |
| 2026-10-29 | Market-data adapters | Added Upstox quote adapter, AMFI NAV parser/resolver, and Upstox instrument-master loader with fixtures | Latest run [40816690406](https://github.com/ambujkhanna/smartfolio-analyser/actions/runs/40816690406) passed clean npm ci, lint, 77 tests, and build; no live market request used |
| 2026-10-29 | P&L preview UI | Connected accepted rows to local P&L preview and incomplete-data messaging | Run 40816223371 passed clean npm ci, lint, tests, and build |
| 2026-10-29 | Instrument resolution flow | Added bounded public master lookup endpoint and UI resolution flow for ISIN/symbol references | Run [40817011727](https://github.com/ambujkhanna/smartfolio-analyser/actions/runs/40817011727) passed clean npm ci, lint, 77 tests, and build |
| 2026-10-29 | Protected quote endpoint | Added access-key-gated quote route, bounded batches, per-instance rate limiting/cache, quote provenance UI, quote-to-position adapter, and route guard tests | Run 40817556100 found a provider-key type issue; fixed in 7b8f105. Run 40817777618 passed lint and 84 tests but build found stale-quote UI reading a nonexistent `reason` property; fixed in a5a1ffd, rerun pending |

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


| 2026-10-29 | Tradebook CSV compatibility fix | Infer INR only when currency is blank/absent and exchange explicitly identifies NSE/BSE; added regression tests including no-guessing for unknown exchange | GitHub Actions run [40820712734](https://github.com/ambujkhanna/smartfolio-analyser/actions/runs/40820712734) passed lint, tests, and build; latest Vercel deployment was previously observed READY, but live quotes are not configured |
| 2026-10-29 | Sample-driven importer plan | Prioritize real Zerodha Tradebook CSV and Holdings CSV, then positions report, dividends, mutual-fund statement, and other broker formats; require sanitized fixtures and no raw exports in Git | Awaiting user-uploaded samples; no broker-specific adapter marked complete yet |


| 2026-10-29 | Full sample inventory review and multi-format ingestion request | Reviewed all attached CSV, XLSX, PDF and image samples; tradebook CSV has 13 fields and no charges, holdings workbook is a historical snapshot with detailed and summary sheets, MF capital-gains reports are reconciliation sources rather than complete transaction ledgers, and several P&L workbooks appear empty when read | Multi-format UI support is not implemented yet; existing upload accepts CSV only. Next task is safe parser boundary with tests and locked dependencies |


| 2026-10-29 | Delimited TXT support | Added delimiter auto-detection for comma/tab/semicolon/pipe, TXT upload selection, binary-content guard, and clearer unsupported-format messaging | Regression tests added for tab and semicolon; CI verification pending |


| 2026-10-29 | Zerodha Tradebook adapter and import UX fixes | Added schema detection and strict DD-MM-YYYY normalization for recognizable Zerodha Tradebook exports, with regression tests for valid, unrelated, and impossible-date inputs. Also corrected binary NUL detection and the landing-page status copy. | CI verification pending on the final branch commit; no raw account exports committed. |


| 2026-10-29 | Record persistent portfolio storage and daily-sync discussion | Added a follow-up architecture discussion: private per-user database, secure retention/deletion/backups, initial-history baseline, idempotent daily broker sync, sync health and explicit gap handling. Not implemented; revisit before selecting a database/scheduler or writing the pipeline. | Progress tracker updated on `feat/reliable-pnl-foundation` |

| 2026-11-11 | Phase 0 stabilisation (branch `claude/phase0-stabilise`) | Added build-commit display (page footer + `/api/version`, with unit tests) to expose stale Preview aliases. Recorded chat-only decisions in docs: Preview-only Kite variables and branch-alias redirect URL with troubleshooting (`ZERODHA_CONNECT.md`); paid Kite plan does not provide trade history, tradebook is a one-time baseline import, `average_price` fallback, why Zerodha is not the price source, Analytics Token vs daily login token, Upstox account costs (`MARKET_DATA_PROVIDER_REVIEW.md`); plan Task 3.5. Confirmed `9998f79` CI/Vercel success; found the public Production alias serving an early build. | Lint/tests/build not run locally (no Node in this environment); CI pending on push |
| 2026-11-11 | Phase 2/5 increments on `claude/phase0-stabilise` | Identical re-imported trades are now merged (counted once) instead of both being excluded; broker trade IDs are scoped as EXCHANGE:DATE:ID. Holdings reconciliation moved to `src/engine/reconcileHoldings.ts` (tested) and shows Zerodha `average_price` as a labelled broker cost (reference only, never realized P&L). New step-by-step progress guide on the import screen. Splits and bonus issues supported (`split`/`bonus` kinds with `ratio`; documented in ACCOUNTING_RULES.md). CI now runs on `claude/**` branches. Fixed a date-dependent AMFI route test that had started failing after 28 Oct. | GitHub Actions run #164 on `76aeeea` passed lint, all tests and build. Not yet checked in the browser by the user |
