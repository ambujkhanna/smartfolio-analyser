# Decisions (settled — do not re-discuss unless the owner asks)

Each row: what was decided, why, and when. Newest context: 11–12 Nov 2026.

## Product and accounting

| # | Decision | Why | When |
|---|---|---|---|
| P1 | **Accuracy before completeness.** Never invent or guess a price, cost or quantity. Unknown values show "—" / "Unavailable" with a reason. | The original app used fake sample prices (₹100 fallback) and produced convincing wrong numbers. | Oct 2026 (ChatGPT era), reconfirmed |
| P2 | **FIFO** cost allocation (first bought, first sold). Not tax advice. | Standard, explainable, matches Indian capital-gains practice. | Oct 2026 |
| P3 | Show **both** Zerodha's average cost (labelled "Zerodha avg cost") and Smartfolio's **real average cost** from history. Zerodha's figure is never used for realized P&L. | Zerodha resets average cost after sell + re-buy; owner wants the real picture. | Oct–Nov 2026 |
| P4 | Lifecycle figures per stock, with these exact meanings (owner's worked example: buy 10 @100, sell 4 @120, sell 6 @70, re-buy 10 @60, price 60 → booked −100, to recover 100, break-even 70): **Profit booked** = gains from profitable sales; **Loss booked** = losses from losing sales; **Loss covered** = min(loss booked, max(0, profit booked + current P&L)); **Current P&L** = value of shares held − their FIFO cost; **Overall** = value of shares held − money still in the stock; **Money still in** = buys + opening cost + fees − sale proceeds − dividends; **To recover** = max(0, −overall); **Break-even price** = money still in ÷ shares held. | Owner's core question: "how much is still left to cover my principal?" | 12 Nov 2026 |
| P5 | Lifecycle figures are shown **only for stocks whose history is complete** (no sale without an earlier buy in the files, all costs known, quantity matches Zerodha). Others show "—". | Partial history gives wrong recovery numbers. | 12 Nov 2026 |
| P6 | Stock **splits and bonus issues** are supported as transactions with a ratio (units after ÷ units before); total cost unchanged. | Needed for correct quantities and per-share cost. | 11 Nov 2026 |
| P7 | Show stock **symbol/name**, not internal IDs, in tables (ISIN shown small underneath). | Readability. | 12 Nov 2026 |
| P8 | **Summary tiles** (definitions): *Whole portfolio, net* = booked on fully sold stocks + overall on current stocks; *Net on current stocks* = Σ overall; *Current P&L on holdings*; *Booked so far*; *Losing stocks still need* = Σ shortfall of losing stocks only (gains elsewhere NOT subtracted). | Owner found a large "still to recover" confusing; it is gross over losers, the net is shown separately. | 12 Nov 2026 |
| P9 | **Demergers** are recorded as a `demerger` event: each remaining buy lot of the parent passes the published cost share (and the ratio × shares) to each new company, keeping the original purchase dates; the parent keeps the rest. Totals across the companies are unchanged. | Tata Motors (TMPV/TMCV) and Vedanta showed wrong losses. | 12 Nov 2026 |
| P10 | **Corporate actions are never applied silently.** Splits/bonuses are detected from the owner's own trades + Zerodha holdings (ratio that makes quantities match exactly); known demergers come from a small verified list in code (`src/engine/corporateActions.ts`, with source notes); shares with no buy (IPO, transfer, before the files, gift, unknown demerger) are entered by the owner. Every item is confirmed in "Needs your confirmation" and can be undone. | Accuracy; nothing is guessed. | 12 Nov 2026 |
| P12 | Split/bonus suggestions need **evidence**: the event window lies between trading days (not inside one day), that day has no intraday buy+sell, and trade/Zerodha prices before vs after differ by about the ratio (÷1.6…×1.6). Otherwise show a neutral note, never an Apply button. | A CGPOWER false positive (12 Nov 2026). | 12 Nov 2026 |
| P14 | **Zerodha's average cost is the primary evidence for a bonus/split** on shares still held (Zerodha adjusts it): our average ÷ Zerodha's ≈ ratio (±12%). Price before/after is secondary (used for shares later sold). When several ratios fit, evidence picks one; otherwise nothing is suggested. | LICI false negative (12 Nov 2026). | 12 Nov 2026 |
| P15 | Wording: a sale with no purchase record is described as "you sold N shares on DATE but the files don't show when you bought them" (+ what happened after); a sale covered by a same-day buy-back is called **intraday**. | Owner found "without an earlier buy" misleading. | 12 Nov 2026 |
| P16 | **Verification uses Zerodha's own figures** as the reference: holdings (shares, average cost) and Console P&L statements (realized P&L per period; "Open Value" = Zerodha's cost of shares held, confirmed on the owner's sample). Tolerances: shares exact; average cost ±0.5% (min ₹0.05); money ±0.5% (min ₹2). Statements are used only to check, never as trades. | Owner wants to trust the app without manual validation. | 12 Nov 2026 |
| P17 | **Owner answers are data, stored once**: every explanation is saved as an ordinary entry (source "Your confirmation") in the browser store and backups; never asked again unless undone. A breakdown must account for the whole difference before it can be saved. "Transferred out / gifted" moves shares out at FIFO cost with no profit/loss. | Owner: "store it properly so I don't provide it again and again". | 12 Nov 2026 |
| P13 | Backups: changes are saved in the browser immediately; a banner and the browser's standard leave-page warning remind the owner while changes aren't in a downloaded backup. | Owner's request to avoid losing confirmations. | 12 Nov 2026 |
| P11 | **Do not scrape NSE/BSE** (bot-protected; scraping was blocked as bot-check circumvention, and Vercel would be blocked anyway). Use only the owner's data, official notices for the verified list, and owner input. | Compliance and reliability. | 12 Nov 2026 |

## Data sources

| # | Decision | Why | When |
|---|---|---|---|
| D1 | Zerodha via **Kite Connect Personal (free), read-only**: holdings, positions, today's orders/trades. | Free; read-only is enough. | Oct 2026 |
| D2 | **Do not buy** Kite's paid plan (₹500/month). | It adds market prices, not past trades; its data may not be shown on external platforms. | Oct–Nov 2026 |
| D3 | **Past trades** come from Zerodha **tradebook files** (Console → Reports → Tradebook, Equity, .xlsx/.csv), uploaded **once**; several yearly files can be selected together; overlapping trades count once. | No Zerodha API (free or paid) returns past trades. | 11–12 Nov 2026 |
| D4 | **New trades**: each time the app is open and Zerodha is connected, today's trades are fetched and saved, using the tradebook's ID scheme `EXCHANGE:YYYY-MM-DD:tradeId` (numeric IDs without leading zeros) so later tradebook uploads don't double-count. Gaps (days the app wasn't opened) are caught by the quantity check against Zerodha holdings and filled by uploading that period's tradebook. | Zerodha only exposes *today's* trades and only after the owner logs in that day; automated login is not allowed. | 12 Nov 2026 |
| D5 | Prices: **Zerodha last price** in the home table; **Upstox Analytics Token** (free API, valid ~1 year, read-only) for validated equity/ETF quotes; **AMFI** feed for mutual-fund NAVs. | Free, official sources. | Oct–Nov 2026 |
| D6 | Zerodha **daily login is unavoidable** (session ends ~6 AM). One click "Connect", no settings change. | Exchange/Zerodha rule. | 12 Nov 2026 |

## Hosting, access and security

| # | Decision | Why | When |
|---|---|---|---|
| H1 | **Personal use only** for now; the owner is the only developer. Friends sharing is a **future TODO** (plan Task 7.5), not to be built now. | Owner's choice. | 12 Nov 2026 |
| H2 | Host on **Vercel Hobby (free)**. Production = **https://smartfolio-analyser.vercel.app**, built from `main`. | Free; one fixed address. | 12 Nov 2026 |
| H3 | Protect Production with the app's own **access code** (`APP_ACCESS_CODE`; entered once per browser, remembered 1 year; HMAC cookie). Not Vercel's paid protection. | Vercel Hobby can't protect the Production domain for free. | 12 Nov 2026 |
| H4 | **One fixed Zerodha redirect URL**: `https://smartfolio-analyser.vercel.app/api/zerodha/callback`, in Kite console and `KITE_REDIRECT_URL`. Connect started on any other site is forwarded there. | Owner was tired of changing the redirect URL. | 12 Nov 2026 |
| H5 | Owner never changes tokens/config again except: Upstox token ~yearly; access code only if forgotten. | "Configure once." | 12 Nov 2026 |
| H6 | Secrets only in Vercel env vars (Production + Preview), set by the owner, never shared in chat or committed. | Security. | Oct–Nov 2026 |
| H7 | Never use another person's credentials or signed-in sessions (a shared browser was signed in to someone else's Vercel account). | Owner's explicit instruction. | 11–12 Nov 2026 |

## Storage and privacy

| # | Decision | Why | When |
|---|---|---|---|
| S1 | Trade history is saved **only in the owner's browser** (IndexedDB), with **Download backup / Restore backup / Delete saved data**. No cloud database for now. | Privacy; free; personal use on one computer. A cloud DB (e.g. Neon free Postgres) only if multi-device or friends sharing is wanted later. | 12 Nov 2026 |
| S2 | Tradebook files are read **in the browser**; only stock identifiers (ISIN/symbol) are sent to the server for matching/prices. Zerodha data passes through the Vercel function to the browser and is **not stored or logged**. | Privacy. | Nov 2026 |
| S3 | Personal sample files (tradebook, P&L statement) are used for local testing only and **never committed**. | Public repository. | 11 Nov 2026 |

## Way of working

| # | Decision | Why | When |
|---|---|---|---|
| W1 | Claude's work happens on branch **`claude/phase0-stabilise`** (cut from `feat/reliable-pnl-foundation`); `main` is fast-forwarded to it for Production deploys, with the owner's go-ahead. | Owner asked for a separate branch; then asked to deploy to Production. | 11–12 Nov 2026 |
| W2 | No extra-cost AI usage in Claude Code sessions (no API, sub-agents, workflows, cloud sessions, ultra review). | Owner's quota/cost concern. | 11 Nov 2026 |
| W3 | Every change: tests + lint + build locally, then push; CI (GitHub Actions) runs on `claude/**` and `main`. | Quality. | 11 Nov 2026 |
| W4 | Keep these handover files updated at the end of each working session. | Owner doesn't want to lose or repeat discussions. | 12 Nov 2026 |
