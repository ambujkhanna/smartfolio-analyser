# Smartfolio Analyser --- Product, Accounting, Data, and Architecture Log

**Document status:** Consolidated working specification\
**Last updated:** 29 October 2026\
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser\
**Current deployment:** https://smartfolio-analyser.vercel.app/\
**Default branch known from audit:** `main`\
**Proposed working branch:** `feat/portfolio-data-architecture`

> **Purpose of this document:** Preserve the product objective,
> decisions, current implementation findings, accounting requirements,
> data-source strategy, architecture proposal, risks, and implementation
> plan in one durable Markdown file. This is a consolidated record based
> on the discussion and repository audit available at the time of
> writing. It is not a verbatim transcript of every chat message.
> Decisions and assumptions are labeled where appropriate.

------------------------------------------------------------------------

## 1. Executive summary

The Smartfolio Analyser should calculate a trustworthy view of the
portfolio's **real economic outcome**, not merely the profit or loss
visible in a broker's tradebook or a simple average-cost calculation.

The most important failure to eliminate is the use of invented current
market prices. The audited implementation contains hard-coded sample
prices and falls back to ₹100 for unknown symbols. That makes results
look complete even when they are not grounded in actual market data.
This behavior must be removed before expanding features.

The new implementation should:

1.  Import broker tradebooks and holdings files with clear format
    detection and validation.
2.  Normalize trades into a canonical transaction model.
3.  Reconstruct positions chronologically, while identifying incomplete
    history and opening balances.
4.  Separate realized P&L, unrealized P&L, cash flows/charges, and
    economic recovery/break-even analysis.
5.  Resolve instruments reliably, including NSE/BSE-listed equities,
    ETFs, and mutual funds.
6.  Fetch real market prices or NAVs from permitted providers, with
    source and timestamp attached to every quote.
7.  Display unresolved prices or instruments as **Unavailable / Needs
    attention**, never as a fabricated number.
8.  Reconcile calculated positions against broker holdings and explain
    differences.
9.  Test accounting edge cases before claiming tax-grade or broker-grade
    accuracy.
10. Prefer free or low-cost sources initially and notify the user before
    introducing a mandatory paid API or hosting cost.

The product can retain its Next.js/TypeScript/Vercel foundation if that
remains the simplest route. A separate Python/FastAPI service is an
option only if a concrete advantage justifies the added hosting,
deployment, authentication, and operational complexity.

------------------------------------------------------------------------

## 2. Product vision and objectives

### 2.1 Primary objective

Give an Indian investor one reliable view of portfolio performance
across the full transaction history and current holdings, including
cases where a position was sold and later bought again.

The product should answer questions such as:

-   How much money have I actually gained or lost overall?
-   What P&L has been realized through sales?
-   What is the current unrealized P&L on open positions?
-   What is the total economic P&L after considering charges and
    relevant cash flows?
-   What is the recovery or break-even price for an open position, based
    on a clearly stated definition?
-   How do the app's reconstructed holdings compare with the broker's
    current holdings?
-   Which results are complete, and which depend on missing history,
    unresolved symbols, or unavailable market data?

### 2.2 Product principles

-   **Correctness before visual completeness.** An unknown value must
    remain unknown rather than look authoritative.
-   **Maximum automation.** Import files, resolve instruments, and fetch
    prices automatically wherever reliable and permitted.
-   **Ask only for genuine blockers.** If a required fact cannot be
    inferred safely, ask the user for the smallest missing piece and
    explain why it is needed.
-   **Traceability.** Every quote and derived result should be
    explainable from source data.
-   **Explicit assumptions.** Methodology, data coverage, and
    limitations must be visible.
-   **Separation of concerns.** Trade parsing, accounting, instrument
    resolution, market data, and UI should not be entangled.
-   **Free-first.** Start with viable no-cost or low-cost sources;
    disclose costs before making paid services mandatory.
-   **No silent data substitution.** Never replace missing prices,
    missing transactions, or unresolved instruments with defaults.
-   **Security.** Do not ask for broker passwords, OTPs, or API secrets
    in uploaded files. If broker API integration is later considered,
    use an appropriate authorization and secret-management design.

### 2.3 Out of scope until separately designed

-   Providing investment recommendations or buy/sell instructions.
-   Claiming tax filing accuracy without a validated tax-lot and
    corporate-action model.
-   Automatically trading or placing orders.
-   Scraping data sources in violation of their terms.
-   Pretending to have live quotes when only delayed or end-of-day data
    is available.

------------------------------------------------------------------------

## 3. Important accounting concepts and definitions

The UI and documentation must distinguish these metrics instead of using
"P&L" as one ambiguous number.

### 3.1 Realized P&L

Profit or loss attributed to units that have been sold, using the
selected cost-allocation method. For example, FIFO or another explicitly
selected/defined method may be used for lot accounting.

Realized P&L is sensitive to the cost-allocation method. The app must
state the method used and should not claim tax-grade accuracy until the
method, fees, corporate actions, and source records have been validated
for the relevant use case.

### 3.2 Unrealized P&L

For the currently open quantity, the difference between the current
market value and the cost basis assigned to the remaining position,
adjusted according to the app's documented accounting convention.

If current market price is missing or stale beyond the configured
policy, unrealized P&L must be unavailable rather than computed from a
fake value.

### 3.3 Economic / net P&L

The user's intended "true overall" result should reconcile the cash
invested, cash received from sales, remaining position value, and
relevant charges. A useful high-level economic view is:

**Economic P&L = sale proceeds + current value of open positions −
purchase outflows − applicable charges and other explicitly included
cash costs**

This is a conceptual reconciliation formula, not a replacement for
transaction-level accounting. Dividends, corporate actions, taxes,
deposits/withdrawals, and other cash flows should be modeled explicitly
if included. Avoid double-counting realized P&L and open-position value.

The product should show a definition/help tooltip for the exact
calculation used. "Economic P&L" should not be presented as tax P&L.

### 3.4 Recovery / break-even price

A recovery price is not self-defining. The app should document whether
the metric means:

-   the price at which the **remaining open position** reaches zero P&L
    against its remaining cost basis; or
-   the price at which the **overall investment lifecycle** (including
    earlier realized losses/profits and charges) reaches zero economic
    P&L.

These can differ substantially after partial sells, full exits, and
re-entry. Prefer distinct labels such as **Position break-even** and
**Lifecycle recovery price** if both are supported. If the lifecycle
recovery calculation is not mathematically meaningful for a closed
position with zero remaining quantity, show "Not applicable" rather than
a misleading price.

### 3.5 Average cost versus FIFO

The existing code uses an average-cost approach. This may be useful for
a simple economic overview but does not necessarily match tax-lot
treatment or broker statements. The redesigned engine must:

-   define the intended cost-allocation method;
-   maintain lot-level transaction history where needed;
-   handle partial sells and multiple buy/sell cycles;
-   keep economic recovery analysis distinct from tax-lot calculations;
-   clearly label the method used in reports.

Do not silently mix average-cost and FIFO results.

### 3.6 Charges and taxes

Broker tradebooks may include brokerage, STT, exchange transaction
charges, GST, stamp duty, SEBI charges, DP charges, and other fees.
Charges may appear per trade, per order, or as separate ledger rows.

The import and accounting model should preserve available charges and
avoid double-counting. DP charges and other account-level fees may not
map cleanly to a single trade. If a charge cannot be allocated reliably,
show it as an unallocated portfolio cost rather than inventing an
allocation.

------------------------------------------------------------------------

## 4. Scenarios the product must handle

At minimum, design and test the following:

1.  Buy, then hold.
2.  Buy multiple times at different prices.
3.  Partial sell, then continue holding.
4.  Sell the entire position.
5.  Sell, then buy the same instrument again.
6.  Multiple complete buy/sell cycles for the same instrument.
7.  A tradebook that starts after the user already held shares.
8.  Opening holdings with no available original purchase price.
9.  Sell quantity greater than reconstructed available quantity.
10. Duplicate transaction rows from repeated imports.
11. Trades with same-day timestamps or incomplete time fields.
12. Corporate actions such as splits, bonuses, mergers, rights issues,
    and symbol changes.
13. Delisted, suspended, renamed, or unresolvable instruments.
14. NSE and BSE listings of the same company, with exchange-specific
    instrument identifiers.
15. ETFs, whose prices are traded market prices rather than mutual-fund
    NAVs.
16. Mutual funds, whose holdings/value should use scheme identifiers and
    date-aware NAV data.
17. Missing, stale, zero, negative, or mismatched-currency quotes.
18. A broker holdings file and tradebook that disagree.
19. Charges shown separately from trade rows.
20. Dividends or other corporate-action cash flows if included in the
    product scope.

If the history is incomplete, the app should continue where possible but
display a clear warning and indicate which metrics are affected.

------------------------------------------------------------------------

## 5. Current application and repository audit

### 5.1 Repository and deployment

-   GitHub repository: `ambujkhanna/smartfolio-analyser`
-   Public app URL: `https://smartfolio-analyser.vercel.app/`
-   Default branch observed during audit: `main`
-   Proposed feature branch: `feat/portfolio-data-architecture`

### 5.2 Current technology stack

The repository audit found:

-   Next.js 15
-   React 19
-   TypeScript
-   Tailwind CSS
-   PapaParse for CSV parsing
-   Recharts for charts
-   Vercel deployment
-   npm scripts observed: `dev`, `build`, and `start`

This is a reasonable starting point for a browser-based portfolio
analyzer. A separate backend is not automatically required for the first
reliable version.

### 5.3 Files inspected

The following files were inspected through the connected GitHub
integration:

-   `package.json`
-   `src/app/page.tsx`
-   `src/engine/calculatePnL.ts`
-   `src/utils/parseCsv.ts`
-   `src/types/trade.ts`
-   `src/components/HoldingsTable.tsx`
-   `src/components/CsvUploader.tsx`
-   `README.md`

The following findings reflect that audit snapshot and should be
rechecked against the current branch before implementation.

### 5.4 Current implementation behavior and defects

#### `src/engine/calculatePnL.ts`

-   Contains a `MOCK_CURRENT_PRICES` map with sample prices for symbols
    such as RELIANCE, TCS, INFY, and HDFCBANK.
-   Falls back to ₹100 for unknown symbols.
-   Uses an average-cost approach.
-   The fallback means unknown instruments can produce plausible-looking
    but false P&L.
-   This is the highest-priority correctness defect.

**Required change:** Remove mock prices and all implicit fallback
values. The calculation engine must receive validated market-price data
as an explicit input. If a quote is unavailable, affected current-value
and unrealized/net metrics must be nullable or represented as a typed
unavailable state.

#### `src/utils/parseCsv.ts`

-   Uses a simplistic generic CSV parser.
-   Expects common columns such as symbol/type/quantity/price/date with
    a limited number of casing variants.
-   May not correctly handle actual broker-specific exports, separate
    charge rows, opening balances, alternate column names, or
    mutual-fund statements.

**Required change:** Introduce broker/file-format adapters, column
mapping, validation errors, and import previews. Do not silently drop
unrecognized rows.

#### `src/types/trade.ts`

-   `Trade` currently contains basic fields such as symbol, type,
    quantity, price, and date.
-   `HoldingSummary` expects numeric current price, unrealized P&L, and
    net P&L.

**Required change:** Expand the canonical types to preserve instrument
identity, transaction identifiers, exchange, currency, charges, source
file/row, and quote provenance. Represent missing values explicitly
rather than forcing every field to be a number.

#### `src/components/HoldingsTable.tsx`

-   Assumes current price and P&L fields are numeric and displays rupee
    values.

**Required change:** Render unavailable states clearly, show source and
timestamp, and expose warnings without pretending missing data is zero.

#### `src/components/CsvUploader.tsx`

-   Supports CSV upload.

**Required change:** Improve upload validation and add a file-format
detection/import-review flow. Other file types should only be added
after requirements and parsing support are tested.

#### `src/app/page.tsx`

-   Client-side page parses CSV, calls `calculatePnL(trades)`, and
    renders results.

**Required change:** Keep UI orchestration separate from the accounting
engine. Pass normalized transactions and validated quotes explicitly
into calculation functions. Avoid hiding accounting or data-source
behavior inside UI components.

### 5.5 Existing limitations

-   No reliable live market-data integration was confirmed during the
    audit.
-   Current prices are mocked.
-   Unknown symbols receive a default price.
-   CSV support is generic rather than robustly broker-specific.
-   Current type design does not represent missing prices cleanly.
-   No confirmed comprehensive reconciliation workflow was found in the
    inspected files.
-   The audited calculation approach is not sufficient to claim
    tax-grade accounting.
-   No assumption should be made that all historical transactions or
    opening positions are present in a tradebook.

------------------------------------------------------------------------

## 6. Repository access and branch status

During the earlier implementation attempt:

-   The GitHub integration could list repositories and read repository
    files.
-   An attempt to create `feat/portfolio-data-architecture` through the
    integration failed with **403 Forbidden** at the GitHub refs
    endpoint.
-   The available integration did not expose a repository-creation
    action.
-   No changes were made to `main` during that attempt.
-   A manual branch creation in GitHub was proposed as the next step.

### Manual branch creation

1.  Open `https://github.com/ambujkhanna/smartfolio-analyser`.
2.  Open the branch selector currently showing `main`.
3.  Enter `feat/portfolio-data-architecture`.
4.  Create the branch from `main`.
5.  Confirm that the branch exists and tell the assistant the branch is
    ready.

If writes are still blocked after that, use a local patch/ZIP workflow
or provide complete files and exact replacement instructions. Never
assume a repository write succeeded without verifying it.

**Important:** An earlier attempt to produce a ZIP patch did not
complete successfully. Do not rely on any previously mentioned sandbox
ZIP path unless a new generation step confirms that the file exists.

------------------------------------------------------------------------

## 7. Target user experience

### 7.1 Import workflow

1.  User uploads a tradebook, holdings report, or other supported broker
    export.
2.  App identifies the likely broker and format from headers/content.
3.  App previews detected columns and row counts.
4.  App reports invalid, duplicate, unsupported, or ambiguous rows
    before final import.
5.  App normalizes transactions into a canonical model.
6.  App imports holdings/opening balances separately where available.
7.  App reconciles the reconstructed positions against broker holdings.
8.  App resolves instrument identities.
9.  App fetches quotes/NAVs from configured permitted sources.
10. App computes P&L and marks incomplete results.
11. User sees a portfolio dashboard plus a clear "needs attention" list
    only for genuine blockers.

### 7.2 Dashboard sections

Recommended initial dashboard:

-   Portfolio overview: market value, cost basis, realized P&L,
    unrealized P&L, economic P&L, and data completeness.
-   Holdings table: quantity, average/remaining cost basis, current
    price, current value, unrealized P&L, lifecycle result if supported,
    break-even/recovery metrics, price source, quote timestamp, and
    status.
-   Realized transactions / closed positions.
-   Reconciliation report: broker quantity versus reconstructed
    quantity.
-   Data-quality panel: missing prices, unresolved instruments, stale
    quotes, incomplete history, unsupported rows, and import errors.
-   Import history and source-file traceability.
-   Methodology/help panel explaining calculation definitions.

Avoid adding too many charts before the numbers and accounting are
validated.

### 7.3 Missing-data behavior

Examples of appropriate states:

-   `Price unavailable`
-   `Instrument needs confirmation`
-   `Quote stale — last updated ...`
-   `History incomplete — opening cost unknown`
-   `Position quantity mismatch`
-   `Unsupported transaction type`
-   `Corporate action may be missing`

Do not display a fake price, use zero as a substitute, or label an
incomplete result as final.

------------------------------------------------------------------------

## 8. Proposed architecture

### 8.1 Architecture principles

-   Domain/accounting engine must be pure and deterministic where
    possible.
-   Provider integrations must be behind adapters.
-   Import adapters should normalize source-specific formats into
    canonical records.
-   Market data should be cached and provenance-preserving.
-   Every transformation should retain enough source metadata for
    audit/debugging.
-   UI should consume typed results, including warnings and unavailable
    states.
-   Secrets must remain server-side if API credentials are used.
-   Provider failure must not cause fake fallback values.

### 8.2 High-level component diagram

``` text
User / Browser
    |
    v
Next.js UI (upload, preview, dashboard, reconciliation)
    |
    v
Application / Use-case layer
    |------------------------------|
    v                              v
Import adapters                Portfolio orchestration
    |                              |
    v                              v
Canonical transactions       Instrument resolver
                                   |
                                   v
                             Market-data adapters
                         (equity/ETF quotes, MF NAVs)
                                   |
                                   v
                            Quote cache + provenance
                                   |
                 ------------------|
                 v
           Accounting engine
       (lots, cash flows, charges,
        positions, P&L, warnings)
                 |
                 v
        Reconciliation / validation
                 |
                 v
     Typed results to UI + audit report
```

### 8.3 Suggested folder layout

``` text
src/
  app/
    page.tsx
    api/                         # Server-side endpoints only if needed
  components/
    CsvUploader.tsx
    ImportPreview.tsx
    HoldingsTable.tsx
    PortfolioSummary.tsx
    ReconciliationPanel.tsx
    DataQualityPanel.tsx
  domain/
    instruments.ts
    transactions.ts
    positions.ts
    money.ts
    accountingTypes.ts
  importers/
    common/
      detectFormat.ts
      normalize.ts
      validation.ts
    zerodha/
      tradebook.ts
      holdings.ts
    generic/
      csv.ts
  engine/
    buildLedger.ts
    calculateRealizedPnL.ts
    calculateUnrealizedPnL.ts
    calculateEconomicPnL.ts
    calculateBreakEven.ts
    corporateActions.ts
  instruments/
    resolver.ts
    instrumentMaster.ts
  market-data/
    types.ts
    quoteService.ts
    cache.ts
    providers/
      upstox.ts
      amfi.ts
      breeze.ts
      yahooBestEffort.ts
  reconciliation/
    compareHoldings.ts
  utils/
    dates.ts
    csv.ts
  tests/
    fixtures/
    importers/
    accounting/
    market-data/
docs/
  product-spec.md
  architecture.md
  accounting-methodology.md
  data-sources.md
  test-plan.md
```

This is a proposed organization, not a claim that these files already
exist. Keep the first implementation proportionate; folders can be
introduced incrementally.

### 8.4 Should the app use FastAPI?

**Initial recommendation:** Do not split to FastAPI by default. First
make the accounting engine and provider adapters modular within the
existing Next.js/TypeScript app.

Consider a Python/FastAPI service only if a concrete requirement
emerges, such as:

-   a Python-only finance library materially improves correctness or
    maintainability;
-   large batch imports need a separate worker;
-   scheduled data refresh requires a persistent service;
-   background processing or storage needs exceed Vercel's suitable
    limits;
-   the service can be hosted and secured within the cost budget.

A second service adds deployment, hosting, authentication, network,
monitoring, and secret-management work. Do not take on those costs just
for architectural fashion.

------------------------------------------------------------------------

## 9. Canonical data model

The exact schema should be finalized during implementation. The
following describes the required concepts.

### 9.1 Instrument

An instrument should have stable identity independent of display symbol:

-   internal instrument ID;
-   instrument type: equity, ETF, mutual fund, or other supported type;
-   exchange where applicable: NSE/BSE;
-   provider-specific instrument key(s);
-   symbol/trading symbol;
-   ISIN where available;
-   display name;
-   currency;
-   active/delisted/unknown status;
-   aliases and historical symbols;
-   resolver confidence and provenance.

Do not use the company name or symbol alone as a globally unique key.
NSE and BSE instruments and similarly named funds need stable
identifiers.

### 9.2 Transaction

Recommended transaction fields:

-   transaction ID or deterministic import fingerprint;
-   source file ID and source row number;
-   broker and account label, if supplied;
-   instrument ID, plus raw symbol/name as imported;
-   transaction type: buy, sell, dividend, split, bonus, merger, fee,
    deposit/withdrawal, or unsupported/unknown;
-   trade date and time, plus timezone/precision when known;
-   quantity;
-   unit price;
-   gross amount;
-   brokerage and other charges, each separately where available;
-   currency;
-   exchange;
-   order/trade reference;
-   import warnings;
-   raw source row or a safe representation of it for traceability.

Avoid storing sensitive broker credentials in the transaction model.

### 9.3 Position / lot

-   instrument ID;
-   quantity;
-   lot-level acquisition date and remaining quantity where applicable;
-   allocated cost basis;
-   source transactions;
-   realized P&L and allocation method;
-   flags for opening positions or incomplete history;
-   corporate-action adjustments;
-   reconciliation status.

### 9.4 Market price / NAV

A quote must include:

-   instrument ID;
-   price or NAV;
-   currency;
-   source/provider;
-   source instrument key;
-   timestamp or valuation date;
-   quote type: real-time, delayed, end-of-day, or NAV;
-   retrieval timestamp;
-   stale/unavailable/error status;
-   response metadata sufficient to troubleshoot provider mismatches.

For mutual funds, NAV is date-based and should not be presented as a
real-time exchange quote.

### 9.5 Computed metric

Each computed metric should be traceable to:

-   calculation version;
-   accounting method;
-   included transactions and charges;
-   price/NAV source and timestamp;
-   warnings or assumptions;
-   completeness status.

------------------------------------------------------------------------

## 10. Market-data and instrument-resolution strategy

### 10.1 Provider requirements

A provider is suitable only if it supports the needed instrument
universe, has permitted usage terms, and exposes sufficient provenance
and operational reliability.

Evaluation criteria:

-   NSE/BSE coverage;
-   equity and ETF coverage;
-   instrument identifiers and exchange disambiguation;
-   batch quote support;
-   authentication requirements;
-   request quotas and rate limits;
-   freshness and timestamp availability;
-   cost and free-tier limits;
-   redistribution/display terms;
-   service stability;
-   missing-symbol behavior.

### 10.2 Candidate sources discussed

These are candidates to evaluate, not claims of current verified
availability or guaranteed coverage. Recheck official documentation,
plan limits, pricing, and terms before implementation.

#### Upstox API --- candidate primary source for Indian listed securities

-   Candidate for Indian listed equity/ETF market quotes.
-   The prior discussion noted a batch quote endpoint reportedly
    supporting up to 500 instrument keys per request; verify the current
    official documentation, exact endpoint, permissions, limits, and
    coverage before coding.
-   Confirm whether required quotes are real-time, delayed, or otherwise
    constrained for the account/product.
-   Design around provider instrument keys and refresh-token/auth
    requirements where applicable.
-   Never assume every NSE/BSE symbol can be resolved automatically.

#### AMFI NAV data --- mutual funds

-   Candidate source for Indian mutual fund NAV data.
-   NAVs are date-aware and generally reflect published scheme NAVs, not
    real-time traded prices.
-   Resolve schemes using scheme identifiers and names; avoid relying
    only on a loosely matched fund name.
-   Preserve NAV date and retrieval timestamp.
-   Handle renamed, merged, discontinued, and multiple plan/option
    variants carefully.

#### ICICI Direct Breeze --- alternative candidate

-   Could be evaluated for supported Indian securities and use cases.
-   Verify current coverage, exchange support, authentication, quotas,
    and terms.
-   Do not treat it as universal coverage for every NSE/BSE instrument
    without testing.

#### Yahoo Finance / `yfinance` --- best-effort fallback only

-   Unofficial access can be unstable and may change without notice.
-   Coverage, symbol mapping, freshness, and terms must be reviewed.
-   It should not be the only production source for important P&L
    results.
-   If retained as a fallback, clearly label the provider and quote type
    and do not override a better verified source silently.

#### Sources not to rely on blindly

-   **Polygon:** removed from the shortlist for this project because
    Indian equities coverage does not meet the identified need.
-   **Alpha Vantage:** free quota may be low and Indian coverage must be
    tested before any commitment.
-   **`nsepython` / direct NSE scraping:** do not use as the production
    default without reviewing permitted access, terms, reliability, and
    restrictions. Do not bypass controls or scrape in violation of
    terms.

### 10.3 Recommended provider architecture

Define a provider-neutral contract, for example:

``` ts
export type QuoteType = "realtime" | "delayed" | "end_of_day" | "nav";

export interface MarketPrice {
  instrumentId: string;
  price: number;
  currency: string;
  source: string;
  sourceInstrumentKey?: string;
  timestamp: string;
  quoteType: QuoteType;
}

export interface QuoteProvider {
  getPrices(instruments: Instrument[]): Promise<QuoteResult[]>;
}
```

This is an illustrative contract; adapt it to the actual canonical
types. A result should also be able to represent provider errors or
unavailable prices rather than forcing every requested instrument to
return a price.

### 10.4 Price validation and fallback rules

For every returned price:

1.  Match the provider response to the requested stable instrument ID.
2.  Confirm expected currency.
3.  Confirm the value is finite and positive.
4.  Validate quote timestamp and freshness.
5.  Validate that the provider's instrument key corresponds to the
    intended exchange/security.
6.  Preserve the source and quote type.
7.  Cache according to provider limits and quote type.
8.  If validation fails, mark the quote unavailable and explain why.

A fallback provider may be tried if configured, but it must be explicit
and its source visible. Never substitute a static sample value, ₹100,
last-known price without a stale label, or a price for a similarly named
instrument.

### 10.5 Caching and rate limits

-   Batch requests where the provider supports them.
-   Cache quote results to avoid repeated calls and to stay within
    quotas.
-   Define freshness policies separately for intraday quotes and
    mutual-fund NAVs.
-   Store retrieval timestamps and provider source.
-   Do not imply a quote is current merely because it is cached.
-   Surface provider rate-limit errors and retry only with bounded,
    sensible backoff.
-   Consider persistent storage only if necessary; begin with the
    smallest architecture that meets the reliability requirement.

------------------------------------------------------------------------

## 11. Import and reconciliation strategy

### 11.1 Separate input types

Support different file roles rather than treating every file as a
tradebook:

-   Tradebook / executed transactions;
-   holdings report / current positions;
-   funds or ledger report;
-   mutual-fund transactions and holdings;
-   corporate-action or dividend records, if available.

A tradebook may not include the original acquisition of a position held
before the exported period. A holdings file gives current quantity but
may not provide original cost. The app must identify this gap.

### 11.2 Format detection and preview

-   Detect likely broker and document type from headers and file
    content.
-   Ask the user to confirm only when confidence is insufficient.
-   Show parsed row counts, date range, symbols, and invalid rows before
    final import.
-   Report ignored/unsupported rows explicitly.
-   Preserve raw values and source-row numbers for debugging.
-   Add duplicate detection using broker IDs where possible and
    deterministic fingerprints otherwise.
-   Make re-import idempotent: importing the same file twice should not
    double-count transactions.

### 11.3 Holdings reconciliation

Compare:

-   broker-reported current quantity;
-   reconstructed quantity from available transactions;
-   opening quantity, if explicitly supplied;
-   differences by instrument and overall.

Possible statuses:

-   reconciled;
-   quantity mismatch;
-   missing opening history;
-   unresolved instrument;
-   unsupported transaction;
-   corporate action suspected.

Do not "fix" a discrepancy silently. Allow a deliberate opening-balance
adjustment only with a clear source and impact statement.

------------------------------------------------------------------------

## 12. Accounting engine design

### 12.1 Responsibilities

The accounting engine should not fetch prices or parse CSV. It should
accept validated canonical transactions and, where needed, explicit
opening balances/corporate actions. Market price inputs should be
separate.

Responsibilities:

1.  Sort transactions deterministically by date/time and source ordering
    when timestamps tie.
2.  Validate transaction chronology and quantity availability.
3.  Build the position ledger.
4.  Apply the documented lot-allocation method.
5.  Calculate realized P&L and remaining cost basis.
6.  Calculate unrealized P&L only when a valid quote exists.
7.  Calculate economic P&L using a single documented reconciliation
    formula.
8.  Calculate break-even/recovery metrics according to explicitly named
    definitions.
9.  Report incomplete history, oversells, unsupported rows, and other
    anomalies.
10. Return structured results and warnings instead of silently guessing.

### 12.2 Deterministic results

For the same normalized transactions, configuration, corporate actions,
and quote snapshot, the engine should return the same result. This makes
it possible to test accounting logic independently from external data.

### 12.3 Negative and impossible states

-   Selling more units than available should create a validation error
    or explicit short-position state only if short selling is
    intentionally supported.
-   Do not clamp impossible quantities to zero without reporting it.
-   Missing acquisition cost should remain unknown.
-   Negative/zero prices should fail quote validation.
-   Unsupported transaction types should be preserved and flagged rather
    than dropped.
-   Same-day ordering ambiguity should be visible if it can change
    results.

------------------------------------------------------------------------

## 13. Implementation roadmap

Use small, reviewable stages on a feature branch. Do not combine
accounting changes, market-data integration, and UI redesign into one
untestable change.

### Phase 0 --- Protect production and establish baseline

-   [ ] Confirm the current repository state and deployed version.
-   [ ] Create `feat/portfolio-data-architecture` from `main`.
-   [ ] Verify the branch before any write.
-   [ ] Run the current app and build locally.
-   [ ] Capture current screenshots or baseline outputs if useful.
-   [ ] Record known defects and existing behavior.
-   [ ] Do not change `main` directly.

**Exit criteria:** A verified working branch and reproducible baseline.

### Phase 1 --- Eliminate fabricated prices

-   [ ] Remove `MOCK_CURRENT_PRICES`.
-   [ ] Remove the default ₹100 fallback.
-   [ ] Define explicit quote input types.
-   [ ] Allow `currentPrice`, `unrealizedPnL`, and dependent metrics to
    be unavailable.
-   [ ] Update holdings UI to render "Unavailable" and source/timestamp
    metadata.
-   [ ] Add regression tests proving an unknown symbol never receives a
    fabricated price.
-   [ ] Confirm the build passes.

**Exit criteria:** No path in the code silently invents a market price.

### Phase 2 --- Define canonical types and accounting contract

-   [ ] Define instrument, transaction, quote, lot, position, warning,
    and computed-result types.
-   [ ] Define exact realized, unrealized, economic, and recovery
    formulas.
-   [ ] Decide initial lot-allocation method and label it.
-   [ ] Decide how charges and opening balances are represented.
-   [ ] Document unsupported cases and incomplete-history behavior.

**Exit criteria:** Types and accounting definitions are reviewed before
the engine grows.

### Phase 3 --- Build accounting engine and tests

-   [ ] Separate ledger construction from quote fetching.
-   [ ] Implement deterministic chronology.
-   [ ] Handle multiple buys, partial sells, full sells, and re-entry
    cycles.
-   [ ] Implement explicit opening-balance handling.
-   [ ] Implement charge handling without double-counting.
-   [ ] Add corporate-action extension points.
-   [ ] Add tests for oversells, missing cost basis, duplicate
    transactions, and ambiguous ordering.
-   [ ] Verify all formulas using small hand-calculated examples.

**Exit criteria:** Accounting tests pass and output definitions are
documented.

### Phase 4 --- Robust broker imports

-   [ ] Inspect real sample tradebook and holdings exports with
    sensitive data removed.
-   [ ] Implement broker-specific adapters, starting with the user's
    actual primary broker format (Zerodha is a known candidate).
-   [ ] Add import preview and validation errors.
-   [ ] Add source row/file traceability.
-   [ ] Add duplicate/idempotent import behavior.
-   [ ] Add holdings reconciliation.
-   [ ] Preserve unknown rows and explain why they were not processed.

**Exit criteria:** Representative real files import without silent row
loss, and discrepancies are visible.

### Phase 5 --- Instrument master and resolver

-   [ ] Define canonical instrument identity.
-   [ ] Build or load a permitted instrument master.
-   [ ] Map symbols, exchange, ISIN, and provider IDs.
-   [ ] Support historical aliases where possible.
-   [ ] Add confidence scores and ambiguous-match handling.
-   [ ] Do not auto-select among ambiguous securities without a reliable
    identifier.

**Exit criteria:** Supported instruments resolve deterministically or
are explicitly marked unresolved.

### Phase 6 --- Market-data providers

-   [ ] Review official provider docs, current plan limits, pricing, and
    terms.
-   [ ] Implement the first approved Indian equity/ETF provider adapter.
-   [ ] Implement AMFI-based NAV resolution for mutual funds.
-   [ ] Add cache, batch requests, timestamp, quote type, and provider
    provenance.
-   [ ] Add freshness and price-validation rules.
-   [ ] Add rate-limit and provider-error handling.
-   [ ] Test missing symbols and provider mismatches.
-   [ ] Notify the user before a mandatory paid API or hosting plan is
    introduced.

**Exit criteria:** Each displayed quote has a valid instrument match,
source, quote type, and timestamp, or is clearly unavailable.

### Phase 7 --- Portfolio dashboard and data quality

-   [ ] Add portfolio-level totals with clear definitions.
-   [ ] Add realized and unrealized views.
-   [ ] Add position break-even and lifecycle recovery only after
    formula validation.
-   [ ] Add quote freshness/source display.
-   [ ] Add data-quality and reconciliation panels.
-   [ ] Show the impact of incomplete history.
-   [ ] Avoid presenting incomplete totals as complete.

**Exit criteria:** Users can understand both results and limitations
without reading source code.

### Phase 8 --- Deployment and operational hardening

-   [ ] Run tests and production build.
-   [ ] Verify environment variables are not exposed client-side.
-   [ ] Keep provider secrets server-side.
-   [ ] Verify Vercel limits and provider quotas.
-   [ ] Add safe error reporting and actionable messages.
-   [ ] Test a production deployment on the feature branch/preview.
-   [ ] Verify no fabricated prices appear in the deployed app.
-   [ ] Merge only after review and acceptance checks.

**Exit criteria:** Production deployment is reproducible, secure, and
shows truthful data states.

------------------------------------------------------------------------

## 14. Test strategy and acceptance criteria

### 14.1 Unit tests

Accounting tests should use small explicit transactions and
hand-calculated expected results. Include:

-   single buy;
-   multiple buys at different prices;
-   partial sale;
-   full sale;
-   sell and re-buy;
-   multiple cycles;
-   charges;
-   missing quote;
-   missing cost basis;
-   opening balance;
-   oversell;
-   duplicate row;
-   same-day transactions;
-   split/bonus adjustment where supported;
-   negative/invalid quote rejection;
-   quote with wrong exchange or currency.

### 14.2 Import tests

-   Known valid sample exports.
-   Header variations and casing.
-   Empty rows and malformed rows.
-   Decimal and date formats.
-   UTF-8/BOM issues if applicable.
-   Duplicate import.
-   Unsupported transaction types.
-   Separate fee/ledger rows.
-   Missing symbol or quantity.
-   A tradebook with only a recent date range.
-   A holdings file with no cost basis.

Use sanitized fixtures; do not commit personal financial files or
account identifiers.

### 14.3 Provider tests

-   Valid quote.
-   Missing quote.
-   Stale quote.
-   Provider rate-limit response.
-   Timeout/error.
-   Wrong symbol mapping.
-   Wrong exchange.
-   Invalid/zero/negative price.
-   Currency mismatch.
-   Mutual-fund NAV date mismatch.
-   Cache hit and cache expiration.

Use mocked provider responses for deterministic tests; reserve live
integration tests for controlled checks.

### 14.4 Acceptance criteria

The first reliable version is not complete until all of the following
are true:

-   [ ] No hard-coded market prices are used for production
    calculations.
-   [ ] No default price is assigned to unknown symbols.
-   [ ] Every displayed price has a source and timestamp/valuation date.
-   [ ] Every missing or stale quote is explicitly labeled.
-   [ ] Trade parsing does not silently discard unsupported rows.
-   [ ] Re-importing the same file does not duplicate transactions.
-   [ ] Accounting logic has tests for buy/sell/re-entry scenarios.
-   [ ] The selected cost-allocation method is disclosed.
-   [ ] Missing opening history is detected and explained.
-   [ ] Holdings mismatches are visible.
-   [ ] Mutual funds use a NAV-specific model.
-   [ ] Economic P&L is not double-counted with realized and unrealized
    components.
-   [ ] Build and tests pass.
-   [ ] Paid service requirements and expected costs are disclosed
    before adoption.

------------------------------------------------------------------------

## 15. Security, privacy, and operational safeguards

-   Do not request or store broker login passwords, OTPs, or unrelated
    personal information.
-   Sanitize sample exports before sharing or committing them.
-   Keep API keys and refresh tokens in server-side environment
    variables or a suitable secret manager.
-   Never expose private provider credentials in browser bundles or
    public source files.
-   Restrict logs from recording full transaction rows or sensitive
    account identifiers unless necessary and protected.
-   Treat uploaded files as untrusted input; validate file size, type,
    row count, and field values.
-   Use provider APIs only within their permitted terms and limits.
-   Do not bypass authentication, rate limits, or access restrictions.
-   Back up or retain source import metadata in a deliberate way if
    persistence is introduced.
-   Do not claim that browser-only storage is a durable backup unless
    that is actually implemented.

------------------------------------------------------------------------

## 16. Risks and mitigations

  -----------------------------------------------------------------------
  Risk                    Impact                  Mitigation
  ----------------------- ----------------------- -----------------------
  Fake/default prices     Incorrect P&L presented Remove fallback; typed
                          as fact                 unavailable state;
                                                  regression test

  Incomplete trade        Wrong cost basis and    Opening-balance
  history                 lifecycle result        support; reconciliation
                                                  warnings

  Incorrect instrument    Wrong security price    Stable identifiers,
  match                                           exchange-aware
                                                  resolver, confidence
                                                  threshold

  Provider coverage gaps  Missing or wrong prices Provider adapters,
                                                  explicit unavailable
                                                  state, tested fallback

  Stale quotes            Misleading market value Quote type, timestamp,
                                                  freshness policy

  Incorrect fee treatment P&L mismatch            Preserve individual
                                                  charges; documented
                                                  allocation policy

  Average-cost/FIFO       Different realized P&L  Explicit method
  mismatch                                        selection and labels

  Corporate actions       Incorrect quantity/cost Corporate-action model
  missing                 basis                   and warnings

  Re-import duplicates    Inflated trades and P&L Stable transaction
                                                  IDs/fingerprints and
                                                  idempotency

  Provider terms/quotas   Data outage or          Official-doc review,
  change                  unexpected cost         caching, usage
                                                  monitoring

  Second backend too      More complexity and     Keep Next.js initially;
  early                   cost                    split only with
                                                  evidence

  Branch/write            Risk of accidental      Feature branch, verify
  permissions fail        production edits        writes, use patch
                                                  workflow if blocked
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 17. Decisions and open questions

### 17.1 Decisions / direction agreed so far

-   Correctness is more important than a quick visual overhaul.
-   The product must calculate economic P&L across sell/rebuy cycles.
-   Fake market prices and the ₹100 unknown-symbol fallback are
    unacceptable.
-   Maximum automation is preferred, with user questions reserved for
    genuine blockers.
-   Every quote should include source and timestamp.
-   Stocks, ETFs, and mutual funds need support, but mutual funds use
    NAV data rather than the same quote model as exchange-traded
    securities.
-   Start free-first and disclose any mandatory paid service.
-   Do not scrape sources in violation of terms.
-   Audit the existing code before deciding whether to restart or
    re-architect.
-   Prefer a modular implementation and avoid a separate FastAPI service
    unless justified.
-   Do not modify `main` directly; use a feature branch.
-   Repository branch creation through the connected integration failed
    with 403 during the prior attempt; manual branch creation was
    suggested.

### 17.2 Open decisions to settle during implementation

1.  **Accounting method:** Should the default economic position view use
    average cost, FIFO, or show both? Tax-related reporting should be
    separately specified.
2.  **Economic P&L scope:** Include dividends and all ledger cash flows
    in the first release, or defer them with clear limitations?
3.  **Opening holdings:** Which import source should provide opening
    quantity and cost basis when trade history is incomplete?
4.  **Primary broker formats:** Confirm which broker exports to support
    first; Zerodha is a likely starting point.
5.  **Provider selection:** Confirm a market-data provider after
    checking current official terms, coverage, quotas, and costs.
6.  **Refresh behavior:** On-demand refresh only, scheduled refresh, or
    both?
7.  **Persistence:** Browser-only session, local file/database, or
    account-based cloud persistence? This affects privacy and
    architecture.
8.  **Multiple accounts:** Is multi-account aggregation required in the
    first release?
9.  **Corporate actions:** Which actions must be supported initially,
    and which should trigger a warning?
10. **Recovery-price definition:** Which lifecycle costs and realized
    results should the metric include?
11. **Quote freshness:** What is the acceptable age for intraday/equity
    prices, and how should market-closed periods be labeled?
12. **Deployment budget:** What recurring API/hosting cost, if any, is
    acceptable after free options are exhausted?

Do not block the immediate safety fix on all long-term questions. Remove
fabricated prices first, then implement the next stages behind clear
interfaces.

------------------------------------------------------------------------

## 18. Immediate next actions

1.  Create and verify branch `feat/portfolio-data-architecture` from
    `main` in GitHub.
2.  Re-open the current files on that branch to confirm the audit
    findings still apply.
3.  Add tests around the current P&L engine before changing its
    behavior.
4.  Remove mock/default prices and introduce explicit unavailable quote
    states.
5.  Update the holdings UI to display unavailable price/P&L states plus
    source and timestamp.
6.  Define and document the accounting formulas before implementing
    additional calculations.
7.  Inspect sanitized real broker exports and build the first robust
    importer.
8.  Evaluate current official market-data provider documentation and
    costs.
9.  Implement provider adapters and instrument resolution only after the
    canonical model is stable.
10. Continue with reconciliation, mutual-fund NAV support, and dashboard
    completeness.

------------------------------------------------------------------------

## 19. Implementation notes for future sessions

At the start of each new implementation session:

-   Read this document first.
-   Verify the current GitHub branch and working tree.
-   Do not assume earlier attempted writes or ZIP generation succeeded.
-   Reinspect current source files rather than relying only on this
    audit snapshot.
-   State which files will change and why before a large patch.
-   Make small changes, run tests/build, and report exact results.
-   Distinguish completed work from proposed work.
-   Never say a branch, commit, deployment, test, or file was created
    unless it has been verified.
-   If a required tool or provider is unavailable, explain the blocker
    and offer a safe alternative.
-   Preserve this document as the high-level project log; add separate
    focused documents for detailed accounting formulas, provider setup,
    and test cases as they become concrete.

------------------------------------------------------------------------

## 20. Glossary

-   **AMFI:** Association of Mutual Funds in India; a source for
    published mutual-fund NAV information.
-   **BSE / NSE:** Indian stock exchanges.
-   **CMP:** Current market price. Must include a source and
    timestamp/quote type.
-   **Cost basis:** Cost assigned to the remaining position or a
    specific lot.
-   **Economic P&L:** Portfolio lifecycle cash-flow result plus the
    value of open positions, under the documented scope.
-   **ETF:** Exchange-traded fund; market-traded price model.
-   **FIFO:** First in, first out; a lot-allocation method.
-   **ISIN:** International Securities Identification Number, useful for
    instrument identity.
-   **NAV:** Net asset value, used for mutual funds.
-   **Opening balance / opening position:** Units held at the start of
    available transaction history.
-   **Quote provenance:** Provider/source, timestamp, quote type, and
    instrument mapping behind a price.
-   **Realized P&L:** P&L allocated to units sold.
-   **Unrealized P&L:** P&L on units still held, dependent on a valid
    current price/NAV.
-   **Reconciliation:** Comparing the app's reconstructed position with
    the broker's reported position.

------------------------------------------------------------------------

## 21. Change log

  -----------------------------------------------------------------------
  Date                                Change
  ----------------------------------- -----------------------------------
  29 October 2026                     Consolidated project objectives,
                                      repository audit findings,
                                      accounting principles, provider
                                      candidates, proposed architecture,
                                      phased implementation plan, risks,
                                      and open questions into one working
                                      specification.

  Earlier audit session               Inspected current
                                      Next.js/TypeScript files; found
                                      mocked market prices and a ₹100
                                      fallback; noted simplistic CSV
                                      parsing and numeric-only price/P&L
                                      assumptions.

  Earlier repository-access attempt   Branch creation through the
                                      connected GitHub integration
                                      returned 403; no changes were made
                                      to `main`; manual feature-branch
                                      creation was recommended.
  -----------------------------------------------------------------------

**End of document.**