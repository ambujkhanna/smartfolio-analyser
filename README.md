# Smartfolio Analyser

A portfolio-analysis application for Indian investors who want to understand their overall economic profit and loss across complete buy/sell cycles, including partial exits, realized losses, and later re-entry into the same stock.

- Live app: https://smartfolio-analyser.vercel.app/
- Repository: https://github.com/ambujkhanna/smartfolio-analyser
- Author: Ambuj Khanna

> **Important accuracy notice:** This project is under active development. The audited implementation contains hard-coded sample market prices and a fallback price for unknown symbols. Until these are removed and the accounting and data sources are validated, do not rely on displayed market values or P&L for financial, tax, or trading decisions. Planned capabilities below are not represented as already implemented.

## Contents

- [Why this project exists](#why-this-project-exists)
- [Example: lifecycle P&L](#example-lifecycle-pl)
- [Goals and definitions](#goals-and-definitions)
- [Current implementation](#current-implementation)
- [Known limitations](#known-limitations)
- [Target architecture](#target-architecture)
- [Market-data strategy](#market-data-strategy)
- [Import and reconciliation](#import-and-reconciliation)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)
- [Local development](#local-development)
- [Sample CSV](#sample-csv)
- [Testing and acceptance criteria](#testing-and-acceptance-criteria)
- [Security and data handling](#security-and-data-handling)

## Why this project exists

Broker portfolio screens often emphasize average cost and unrealized P&L for the shares currently held. That view may not communicate the full economic result when an investor has sold shares at a loss and later bought them again, taken partial exits, closed and reopened positions, averaged at different prices, paid transaction charges, or held shares before the exported tradebook period.

The goal is to bring transaction history, open positions, and reliable market data together so investors can see what is known, what is missing, and how each result was calculated.

## Example: lifecycle P&L

Consider a simplified example, excluding charges:

1. Buy 10 shares at ₹100 each: purchase outflow ₹1,000.
2. Sell 10 shares at ₹60 each: proceeds ₹600 and realized loss ₹400.
3. Buy 10 shares again at ₹65 each: purchase outflow ₹650.
4. Current market price is ₹75: current position value ₹750.

| Component | Amount |
|---|---:|
| Earlier realized loss | -₹400 |
| Unrealized gain on current 10 shares: (₹75 − ₹65) × 10 | +₹100 |
| Lifecycle economic P&L: ₹600 + ₹750 − ₹1,000 − ₹650 | -₹300 |

The current holding is up ₹100 against its latest purchase cost, but the lifecycle result is still a ₹300 loss before charges.

In this simplified example, the lifecycle recovery price is:

    (Original purchase outflow + latest purchase outflow − earlier sale proceeds) / remaining quantity
    (₹1,000 + ₹650 − ₹600) / 10 = ₹105 per share

This lifecycle recovery price differs from the current-position break-even price of ₹65. They answer different questions and should be named separately in the application. Real calculations must also define how charges, dividends, corporate actions, incomplete history, and the selected cost-allocation method are handled.

## Goals and definitions

- **Realized P&L:** Profit or loss allocated to units sold, according to the documented lot/cost method.
- **Unrealized P&L:** Profit or loss on units still held, requiring a valid current market price or NAV.
- **Economic P&L:** A documented lifecycle cash-flow reconciliation including sale proceeds and current open-position value, less purchase outflows and applicable included costs. Dividends and other cash flows must be explicitly included or excluded.
- **Position break-even:** The price at which the remaining position reaches break-even under the selected cost-basis definition.
- **Lifecycle recovery price:** The price at which the overall investment lifecycle would reach break-even, when mathematically applicable.
- **Reconciliation:** Comparison of reconstructed positions with the broker's reported holdings.
- **Data completeness:** Whether transaction history, instrument identity, charges, corporate actions, and price data are sufficient for a metric.

Realized P&L, tax-lot P&L, and lifecycle economic P&L are related but not interchangeable. The app must disclose its calculation method and must not claim tax-grade accuracy until appropriately validated.

## Current implementation

The repository audit found the following technology and behavior:

- Next.js 15, React 19, and TypeScript.
- Tailwind CSS.
- PapaParse for CSV parsing.
- Recharts for charts.
- Vercel deployment.
- A CSV upload flow, a P&L calculation engine, a basic holdings table, and a portfolio summary.

The audit inspected src/app/page.tsx, src/engine/calculatePnL.ts, src/utils/parseCsv.ts, src/types/trade.ts, src/components/HoldingsTable.tsx, src/components/CsvUploader.tsx, package.json, and README.md.

This is a snapshot of the last inspected code; recheck the current branch before relying on it.

## Known limitations

1. **Mock prices:** The existing P&L engine contains hard-coded sample prices for several symbols.
2. **Unknown-symbol fallback:** Unknown symbols can fall back to ₹100, producing fabricated P&L. This must be removed.
3. **Generic CSV parsing:** The parser handles a limited set of generic column names and may not support all broker exports, fee rows, or opening balances.
4. **Limited transaction model:** The current trade model contains basic fields such as symbol, type, quantity, price, and date.
5. **Missing-price representation:** Current result types assume numeric prices and P&L rather than representing missing quotes explicitly.
6. **Incomplete-history risk:** A tradebook may omit older purchases or other transactions needed to reconstruct cost basis.
7. **Accounting validation:** Average-cost calculations may not match FIFO/tax-lot treatment or broker reports.
8. **Charges and corporate actions:** Full support for fees, dividends, splits, bonuses, mergers, and symbol changes has not been established.
9. **Market data:** A reliable, verified production quote/NAV integration was not confirmed in the audited code.

**Required behavior:** Never invent a price or silently treat missing data as zero. Show an explicit unavailable or needs-attention state. When a price exists, show its source and timestamp or valuation date.

## Target architecture

The implementation should be modular so accounting can be tested independently of file parsing, UI rendering, and external providers.

    User / Browser
        |
        v
    Next.js UI: upload, preview, dashboard, data-quality messages
        |
        v
    Application / portfolio orchestration
        |--------------------------------|
        v                                v
    Broker import adapters           Instrument resolver
        |                                |
        v                                v
    Canonical transactions           Instrument master
                                         |
                                   Market-data adapters
                                   (equity/ETF quotes, MF NAVs)
                                         |
                                   Quote cache and provenance
        |--------------------------------|
        v
    Accounting engine
    (ledger, lots, charges, positions, realized/unrealized/economic P&L)
        |
        v
    Reconciliation and validation
        |
        v
    Results, warnings, and source metadata

### Design principles

- Keep the accounting engine deterministic and independent from quote fetching.
- Normalize broker-specific files into a canonical transaction model.
- Identify instruments using stable identifiers such as ISIN and provider instrument keys, with exchange information where applicable. Do not rely on display symbols alone.
- Keep providers behind adapter interfaces.
- Attach source, quote type, currency, and timestamp or valuation date to every price.
- Cache and batch requests where provider terms permit.
- Preserve source file and row metadata for traceability.
- Return structured warnings for missing history, invalid transactions, stale prices, and reconciliation differences.
- Keep API secrets server-side if authenticated providers are used.
- Avoid a separate Python/FastAPI service unless a concrete requirement justifies the extra hosting and operational complexity. The current Next.js stack is the simplest starting point.

### Suggested future modules

These are architectural targets, not a claim that all these files currently exist:

- Importers: broker format detection, parsing, normalization, and validation.
- Domain: canonical instruments, transactions, lots, positions, and accounting types.
- Engine: ledger construction and P&L/recovery calculations.
- Instruments: instrument master and identity resolution.
- Market-data providers: adapters for quotes and NAVs.
- Reconciliation: compare calculated holdings against broker holdings.
- Tests: accounting fixtures, importer fixtures, and provider-response tests.
- Docs: accounting methodology, data-source policy, architecture, and test plan.

## Market-data strategy

The project should be free-first where practical, but data quality and permitted usage matter more than apparent convenience. Check current official documentation, provider coverage, plan limits, prices, and terms before implementation.

Potential sources to evaluate:

- **Upstox API:** Candidate for Indian listed equity/ETF quotes. Verify current coverage, authentication, endpoint limits, quote freshness, and plan terms.
- **AMFI NAV data:** Candidate for Indian mutual-fund NAVs. NAV is date-based, not a live exchange quote. Resolve schemes carefully, including plan and option variants.
- **ICICI Direct Breeze:** Possible alternative for supported Indian securities; verify exchange coverage and current terms.
- **Yahoo Finance / yfinance:** Best-effort only. Coverage, symbol mapping, stability, freshness, and terms must be reviewed; it should not be the sole source of important portfolio values.

Polygon was removed from the shortlist because its Indian-equity coverage did not match the identified need. Alpha Vantage's free quota and Indian coverage require testing before adoption. Direct NSE scraping or packages built around it must not be used in production without reviewing terms and access restrictions.

### Price integrity rules

Validate every quote for correct instrument and exchange, expected currency, finite positive price, timestamp and freshness, quote type, provider source, and provider instrument key. Quote types should distinguish real-time, delayed, end-of-day, and NAV.

If validation fails or no price is available, mark the quote unavailable. A fallback provider may be used only through an explicit policy, and the actual source must remain visible. A stale cached price must be labeled stale. Never substitute a static sample value or a price from a similarly named security.

## Import and reconciliation

The target workflow is:

1. Upload a supported tradebook, holdings report, or other documented broker export.
2. Detect the likely broker/file format and preview parsed columns and rows.
3. Show malformed, duplicate, unsupported, or ambiguous rows before final import.
4. Normalize supported records into the canonical transaction model.
5. Resolve instrument identity.
6. Reconstruct positions from transactions and explicit opening balances.
7. Compare calculated quantities against broker-reported holdings.
8. Fetch verified prices or NAVs.
9. Calculate P&L and display completeness warnings.

Tradebooks and holdings reports serve different purposes. A tradebook may omit opening purchases; a holdings report may show quantity without original cost basis. The app must not infer missing cost basis without telling the user.

Re-importing the same file should be idempotent and must not double-count transactions. Unsupported rows should be preserved or reported, not silently dropped.

### Instrument types

- **Equities:** Exchange-listed shares, with exchange-aware instrument identity.
- **ETFs:** Exchange-traded market prices.
- **Mutual funds:** Scheme-specific, date-aware NAVs and transaction history.

These asset types should not be forced into one identical price-resolution model.

## Technology stack

| Layer | Current or planned technology |
|---|---|
| UI framework | Next.js |
| UI library | React |
| Language | TypeScript |
| Styling | Tailwind CSS |
| CSV parsing | PapaParse |
| Charts | Recharts |
| Deployment | Vercel |
| Market data | Provider adapters to be evaluated |
| Mutual-fund NAV | AMFI-based source to be evaluated |
| Accounting | Modular, testable domain engine |
| Persistence | Not yet decided; select based on requirements and privacy needs |

## Project structure

Current high-level structure observed during audit:

    src/
      app/
      components/
      engine/
      types/
      utils/

An expanded structure is described in the target architecture. Refactor incrementally; do not create modules solely for appearance.

## Roadmap

### Phase 0 — Establish a safe baseline

- [ ] Verify current source and deployed version.
- [ ] Work on a feature branch rather than changing main directly.
- [ ] Run the existing app and build.
- [ ] Record known defects and add baseline tests.

### Phase 1 — Remove fabricated prices

- [ ] Remove hard-coded mock prices.
- [ ] Remove the ₹100 unknown-symbol fallback.
- [ ] Represent missing prices and dependent metrics explicitly.
- [ ] Display unavailable values without treating them as zero.
- [ ] Show price source and timestamp when a quote is available.
- [ ] Add regression tests for unknown and missing instruments.

### Phase 2 — Define accounting semantics

- [ ] Document formulas for realized, unrealized, and economic P&L.
- [ ] Decide and disclose the initial cost-allocation method.
- [ ] Separate current-position break-even from lifecycle recovery price.
- [ ] Define treatment of charges, dividends, opening balances, and incomplete history.
- [ ] Add deterministic tests for buy/sell/re-entry cycles.

### Phase 3 — Improve imports and reconciliation

- [ ] Start with the actual broker export format used by the project owner.
- [ ] Add format detection, import preview, validation, and row-level errors.
- [ ] Add duplicate detection and idempotent re-imports.
- [ ] Support opening-position handling.
- [ ] Reconcile reconstructed quantities against broker holdings.
- [ ] Flag unsupported transactions and suspected corporate actions.

### Phase 4 — Instrument resolution and real market data

- [ ] Build or load a permitted instrument master.
- [ ] Resolve symbols with stable identifiers and exchange information.
- [ ] Evaluate official provider documentation, coverage, pricing, quotas, and terms.
- [ ] Implement quote/NAV adapters, caching, batching, and freshness checks.
- [ ] Show source, timestamp/valuation date, quote type, and failure reasons.
- [ ] Disclose any mandatory paid service before adopting it.

### Phase 5 — Dashboard and operational hardening

- [ ] Display portfolio totals with explicit definitions.
- [ ] Add data-quality and reconciliation panels.
- [ ] Support mutual-fund NAVs with scheme/date-aware identity.
- [ ] Add corporate-action handling in validated stages.
- [ ] Run tests and production builds.
- [ ] Verify secrets remain server-side.
- [ ] Test a preview deployment before merging.

### Future possibilities

Only after the accounting and data foundations are reliable: more broker-specific formats, portfolio charts and historical analytics, tax-harvesting analysis with explicit limitations, authentication and persistent multi-device portfolios, scheduled refresh or broker integrations subject to security and provider terms, and further mobile usability improvements.

## Local development

### Prerequisites

- Node.js compatible with the package configuration.
- npm.
- Git.

### Setup

    git clone https://github.com/ambujkhanna/smartfolio-analyser.git
    cd smartfolio-analyser
    npm install
    npm run dev

Open http://localhost:3000.

### Available scripts

The repository audit observed these scripts in package.json:

    npm run dev
    npm run build
    npm run start

Run the production build before considering a change ready for deployment. Test scripts should be added or confirmed as the automated test suite is introduced.

## Sample CSV

The current generic parser expects a format similar to this example:

    symbol,type,quantity,price,date
    RELIANCE,BUY,10,2500,2025-01-01
    RELIANCE,SELL,10,2300,2025-01-05
    RELIANCE,BUY,10,2400,2025-02-01
    TCS,BUY,5,3900,2025-01-10

This is an illustrative generic format, not a guarantee that every broker export is supported. Real broker files may use different headers, include additional fields, or place fees and corporate actions in separate records. Review import warnings.

## Testing and acceptance criteria

Accounting tests should cover single and multiple buys, partial sales, full exits, sell/re-buy cycles, multiple cycles, transaction charges, separately reported fees, missing opening history or cost basis, oversells, ambiguous chronology, duplicate imports, supported corporate actions, missing/stale/invalid quotes, wrong instrument or exchange mappings, and mutual-fund NAV date/scheme matching.

### Minimum acceptance criteria for trustworthy results

- No hard-coded sample price is used for production calculations.
- No unknown symbol receives a fabricated default price.
- Every displayed price has a source and timestamp or valuation date.
- Missing and stale prices are visibly labeled.
- Unsupported rows are reported instead of silently discarded.
- Re-importing a file does not double-count transactions.
- Accounting formulas and cost-allocation method are documented.
- Incomplete history and holdings mismatches are visible.
- Economic P&L does not double-count realized and unrealized components.
- Tests and production build pass.
- Mandatory service costs are disclosed before adoption.

## Security and data handling

- Never include broker passwords, OTPs, or API secrets in uploaded files, issues, or commits.
- Sanitize sample financial files before adding them to the repository.
- Keep provider secrets server-side.
- Validate uploaded file type, size, row count, and values.
- Avoid logging complete transaction rows or account identifiers unnecessarily.
- Use data providers only within their permitted terms and limits.
- Do not claim browser-only data is backed up or persisted unless that capability is implemented.

## Development principles

This project prioritizes correctness, transparency, and explainability over superficial completeness.

1. Make small, reviewable changes on a feature branch.
2. Add tests for accounting changes and data edge cases.
3. Keep UI, import parsing, accounting, and provider code separate.
4. Never add static market-price fallbacks.
5. Never silently guess instrument identity or cost basis.
6. Label assumptions and incomplete results.
7. Verify branch, commit, tests, and deployment status before reporting completion.
8. Prefer free-first solutions, without compromising data integrity or violating provider terms.

## Author

**Ambuj Khanna**

GitHub: https://github.com/ambujkhanna

---

This README documents the known project state and intended direction. Roadmap items are planned work, not claims that those capabilities are already implemented.
