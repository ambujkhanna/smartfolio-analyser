# Smartfolio Analyser

Smartfolio Analyser is being built to help Indian investors understand portfolio performance across complete investment lifecycles—including partial sales, closed positions, and later re-entry into the same instrument. The current branch supports browser-side CSV/TXT preview, calculation preview, market-data adapter code, a read-only Zerodha Kite Connect integration, and a holdings-to-ledger quantity reconciliation preview. The user verified that the Preview app successfully retrieves holdings, positions, current-day orders, and current-day trades.

- Repository: https://github.com/ambujkhanna/smartfolio-analyser
- Implementation branch: `feat/reliable-pnl-foundation`
- Implementation plan: [plan.md](plan.md)
- Live progress: [progress.md](progress.md)
- Accounting rules: [docs/ACCOUNTING_RULES.md](docs/ACCOUNTING_RULES.md)
- Market-data provider review: [docs/MARKET_DATA_PROVIDER_REVIEW.md](docs/MARKET_DATA_PROVIDER_REVIEW.md)

> **Status and accuracy notice:** The application provides browser-side CSV preview and a calculation preview using accepted rows. Live quotes are not connected, so open-position market value and dependent P&L can remain unavailable. The product is still under development; do not use it for financial, tax, or trading decisions. No sample market prices or fallback prices are used by the current code.

## Product goal

A broker screen may show the current position's unrealized P&L but fail to communicate the full lifecycle result after earlier realized losses/profits, partial sales, fees, or re-entry. The app aims to combine normalized transaction history, opening positions, and traceable quotes/NAVs to show:

- Realized trading P&L for sold units.
- Unrealized P&L for open positions with known cost basis and a valid quote.
- Lifecycle economic P&L reconciled from cash flows and current open-position value.
- Position break-even separately from lifecycle recovery price.
- Data completeness, unresolved instruments, missing prices, and holdings discrepancies.

These metrics are not interchangeable. The selected cost method and all limitations must be disclosed. The initial FIFO model is a portfolio-performance convention, not a claim of tax-grade accuracy.

## Current implementation

The current branch contains these modules:

- **Next.js app shell:** Landing page and application status notice.
- **File preview (current):** Client-side CSV parsing with row preservation, accepted/rejected counts, source row details, and validation issues. The current UI accepts CSV only, with a 5 MB limit; the selected file is parsed in the browser and is not uploaded to a server by this step. Multi-format ingestion for TXT, XLS/XLSX, and text-based PDF is planned but is not implemented yet.
- **P&L calculation preview:** Calculate accepted transaction rows locally and display realized P&L, open quantity, remaining cost basis, position break-even, and lifecycle recovery. Missing live quotes leave market value, unrealized P&L, and dependent economic P&L unavailable.
- **Canonical transaction validation:** Buy, sell, opening balance, fee, and dividend types, with field-level validation and source filename/row metadata.
- **Quote validation:** Explicit available, unavailable, invalid, mismatched, and stale states; validates positive finite price, currency, instrument identity, source, and timestamps.
- **Instrument resolution:** Exact canonical-ID, ISIN, exchange, and symbol matching. Ambiguous matches remain unresolved; no fuzzy matching.
- **Instrument master and resolver:** Parses the official Upstox JSON BOD master for NSE/BSE cash-equity records, retaining exchange-specific provider keys and reporting duplicates/incomplete rows. A bounded server endpoint resolves up to 100 identifiers per request; the CSV preview can display resolved, ambiguous, and unresolved states.
- **FIFO ledger:** Buy lots, partial/full sales, sell/re-buy cycles, opening positions, trade-level charges, standalone fees/dividends, and structured errors/warnings.
- **P&L calculations:** Realized/unrealized/economic P&L, market value, position break-even, and lifecycle recovery with completeness metadata.
- **Market-data adapters:** Upstox Market Quote V3 adapter and AMFI NAV parsing/resolution code with fixed-response test fixtures.
- **Quality tooling:** ESLint, Vitest, and a GitHub Actions lint/test/build workflow.

**Important gaps:** The calculation preview is not a complete portfolio dashboard. The read-only Zerodha connector provides login/callback routes and endpoints for holdings, positions, orders, and trades; the user verified all four responses in the Preview app. A holdings reconciliation panel compares imported-ledger open quantities against the current broker snapshot by exact ISIN without importing the snapshot as transactions. Orders/trades are current-day endpoints, not full historical ledgers. Live quote provider credentials and end-to-end reconciliation edge cases still require verification. XLS/XLSX and PDF import are not implemented. The AMFI parser has not yet been verified against a captured current live feed. See [progress.md](progress.md) for the latest verified status.

## Accounting rules

The initial accounting specification is documented in [docs/ACCOUNTING_RULES.md](docs/ACCOUNTING_RULES.md). Key principles:

- FIFO lot allocation for realized P&L, clearly labeled.
- Buy-side charges increase acquisition cost; sell-side charges reduce proceeds.
- Standalone fees and dividends are cash flows and must not be double counted.
- Opening balances with unknown cost basis remain incomplete.
- Missing or stale quotes never become zero or a guessed price.
- Economic P&L is calculated from cash flows and current value; realized P&L is not added a second time.
- Oversells, ambiguous chronology, duplicate transaction IDs, and unsupported records are reported rather than silently ignored.

## Market-data strategy

The free-first source recommendation is documented in [docs/MARKET_DATA_PROVIDER_REVIEW.md](docs/MARKET_DATA_PROVIDER_REVIEW.md):

- **Listed equities and ETFs:** Upstox Market Quote V3, using verified provider instrument keys and a server-side Analytics Token. The adapter returns unavailable states when credentials or valid quote data are missing.
- **Mutual funds:** AMFI NAV data, treated as date-based NAV rather than a live exchange quote. Scheme identity and valuation date are retained.

A provider response timestamp does not prove the last traded price is fresh. Quote freshness must be checked using the actual last-trade time. Do not expose provider credentials in browser code, public repositories, chat messages, or logs. Before wiring a public quote endpoint, implement caching, bounded requests, and abuse controls. No mandatory paid service is currently recommended.

## Local development

### Prerequisites

- Node.js 20 or a compatible supported Node.js release.
- npm.
- Git.

### Setup

```bash
git clone https://github.com/ambujkhanna/smartfolio-analyser.git
cd smartfolio-analyser
npm install
npm run dev
```

Open http://localhost:3000.

### Quality commands

```bash
npm run lint
npm test
npm run build
```

The GitHub Actions workflow runs the same checks. The latest run passed a clean `npm ci`, lint, all 84 unit tests, and the production build. See the latest run linked in [progress.md](progress.md).

## Planned multi-format imports

The intended upload experience is to accept `.csv`, `.txt`, `.xls`, `.xlsx`, and text-based `.pdf` files, then route each file through a format-specific parser into the same row-preserving validation and review pipeline. Support will be explicit and tested per format:

- **CSV/TXT:** delimited text with detected or selected delimiter and header validation.
- **XLS/XLSX:** workbook sheet selection, visible header/row preservation, and clear warnings for empty or unsupported sheets.
- **PDF:** text-layer extraction for tabular reports with page provenance. Scanned/image-only PDFs will be reported as requiring OCR; they will not be silently treated as empty transaction files.
- **Other formats:** rejected with a clear supported-format message until a parser is implemented.

A file extension alone does not make a document a valid transaction source. Tax summaries, capital-gains reports, holdings snapshots and transaction ledgers have different meanings and must be classified separately. File size, page/row count and parsing resource limits will be enforced. The intended default remains local/browser parsing; raw exports must not be committed as fixtures. This is a roadmap, not a claim that these formats are already supported.

## Generic CSV preview format

The generic importer accepts a header row similar to this:

```csv
transactionId,kind,ISIN,date,currency,quantity,price,charges
T-1,buy,INE002A01018,2026-10-01,INR,10,125.50,0
T-2,sell,INE002A01018,2026-10-03,INR,4,130.00,0
T-3,buy,INE002A01018,2026-10-05,INR,4,128.00,0
```

Supported header aliases are intentionally generic and do not guarantee compatibility with a specific broker export. The date must be ISO `YYYY-MM-DD` or a timezone-qualified ISO timestamp; ambiguous locale dates are rejected rather than guessed. Trades need a stable identity such as an ISIN or canonical instrument ID. A symbol-only row remains in a needs-resolution state until matched against a trusted instrument master.

For a fee row, provide a transaction kind such as `fee`, date, currency, and amount. A dividend row uses `dividend` and amount. Opening-balance rows can omit unit cost, but any cost-dependent metric will remain incomplete. Unsupported transaction types and invalid rows remain visible in the preview and are not sent to the ledger.

This is a generic development format, not a claim that a specific broker's CSV is supported. A sanitized representative export is needed before building a broker-specific adapter.

## Project roadmap

The detailed task breakdown and exit gates are maintained in [plan.md](plan.md). The current sequence is:

1. Establish a runnable app and automated checks.
2. Define quote, transaction, and instrument models.
3. Build and test a deterministic FIFO ledger and P&L calculations.
4. Add safe CSV parsing and instrument resolution.
5. Integrate free-first market-data sources behind adapters.
6. Connect import preview, portfolio metrics, and data-quality reporting to the UI.
7. Verify tests/build, security, deployment, and release readiness.

Each task is tracked in [progress.md](progress.md). Tasks are only complete when their code and verification status have been recorded. A file being committed is not proof that its tests pass.

## Security and data handling

- Never include broker passwords, OTPs, account numbers, or API secrets in source files, sample exports, issues, or chat.
- Sanitize any sample financial file before committing it.
- Keep provider credentials server-side.
- Validate file type, size, row count, and transaction values.
- Do not log complete trade rows or account identifiers unnecessarily.
- Use providers only within their permitted terms and limits.
- Do not claim data is saved or backed up until persistence is implemented.
- Do not claim tax-grade accuracy or investment advice.

## Development principles

1. Correctness before visual completeness.
2. No fabricated prices or silent zero defaults.
3. No silent row loss or guessed instrument identity.
4. Deterministic calculations independent of network calls.
5. Clear provenance for every price/NAV.
6. Small feature-branch changes, regression tests, and progress updates after each task.
7. Honest reporting of tests, builds, limitations, and deployment status.

---

Maintainer: Ambuj Khanna  
GitHub: https://github.com/ambujkhanna
