# Market-Data Provider Review

**Review date:** 29 October 2026  
**Decision status:** Recommended free-first sources; live integration still needs implementation and verification.

## Recommendation

Use two separate source adapters rather than one source for every asset class:

1. **Listed equities and ETFs:** Upstox Market Quote V3 as the first provider candidate.
2. **Indian mutual-fund NAVs:** AMFI's official NAV download/history data.

Do not treat these as interchangeable: an exchange quote is a market price; a mutual-fund NAV is a scheme valuation for a specific valuation date.

## Listed equities and ETFs — Upstox

Official references:
- Analytics Token: https://upstox.com/developer/api-documentation/analytics-token/
- Full Market Quotes V3: https://upstox.com/developer/api-documentation/get-full-market-quote-v3/
- Rate limits: https://upstox.com/developer/api-documentation/rate-limiting/
- Instruments: https://upstox.com/developer/api-documentation/instruments/

Findings from official documentation checked on the review date:

- The Analytics Token is documented as free, read-only, valid for one year, and usable for market-data APIs without a static-IP whitelist.
- The token is a sensitive credential and must remain server-side. Never put it in client-side JavaScript, a public repository, a CSV, or a log.
- Full Market Quotes V3 supports up to 500 instrument keys in one request.
- The response includes the instrument token, last traded price, last-trade time, and an ISO timestamp for when the response was generated.
- The API snapshot is obtained from exchanges at request time, but a last-traded price can still be old for a security that has not traded recently. Use last-trade time for freshness checks; do not assume the response timestamp proves the last price itself is fresh.
- Provider instrument keys must come from a trusted Upstox instrument master or explicit resolver mapping. Never manufacture a provider key from a display symbol.

### Implementation policy

- Use Market Quote V3 with a server-side environment variable such as `UPSTOX_ANALYTICS_TOKEN`.
- Missing token means quote status is unavailable with a clear configuration message; never use a fallback price.
- Validate HTTP status, provider status, requested instrument key, finite positive last price, currency, and last-trade timestamp.
- Preserve the provider response timestamp separately from the last-trade timestamp when both are available.
- Batch up to the documented instrument-key limit; use conservative caching and respect current provider limits.
- Do not request account holdings or trading APIs for the first implementation; this project only needs market-data quotes.
- Do not ship an unauthenticated public proxy that allows arbitrary callers to spend the token's rate budget. Before wiring a public endpoint, add appropriate request validation, bounded batch size, caching, and access/rate controls.

## Mutual funds — AMFI

Official references:
- NAV download: https://www.amfiindia.com/net-asset-value/nav-download
- AMFI downloads: https://www.amfiindia.com/distributor-quick-access/downloads

Findings from the official NAV page checked on the review date:

- AMFI publishes downloadable NAV reports in text format and provides NAV history.
- The page says the older NAV download format has been discontinued; implementation must use the current format rather than an old hard-coded parser.
- The page states that historical NAV requests are limited to a maximum period of 90 days at a time.
- NAV records must be resolved to the exact scheme, including plan/option variants. Do not match by a shortened fund name alone.

### Implementation policy

- Treat NAV as date-based, not as a live quote.
- Preserve scheme code/ISIN where supplied, scheme name, NAV, valuation date, source, and retrieval time.
- Validate positive finite NAV, exact scheme identity, and parseable valuation date.
- Show the NAV date prominently; do not label it live.
- Keep ambiguous scheme matches unresolved.
- Use the current AMFI text format and add captured, sanitized fixtures before relying on the parser.

## Cost, access, and remaining risks

- Upstox documents the Analytics Token and its APIs as free; no mandatory paid market-data subscription is currently recommended.
- A user must generate their own token in the Upstox Developer Apps page and add it to the hosting environment. Do not request the token in chat or commit it to GitHub.
- Provider coverage and symbol-to-instrument mapping still need fixture-based validation for equities and ETFs.
- AMFI data is the chosen first NAV source, but the current file format and exact download endpoint must be confirmed while implementing the adapter.
- Neither provider selection removes the need for stale-data handling, quote provenance, instrument identity, and missing-data states.

## Decision gate

Proceed with the adapter behind interfaces and test fixtures. Do not enable live quote fetching in the deployed UI until the secret is configured securely and the route cannot be abused as an open proxy. Do not claim live data until an authenticated response has been tested and validated.
