# Progress and TODO

**As of 12 Nov 2026.** Live: https://smartfolio-analyser.vercel.app (branch `main`, same code as
`claude/phase0-stabilise`). Check the deployed commit at `/api/version` or the page footer.

## Built and live

### Data in
- [x] Zerodha read-only connection (Kite Connect Personal): holdings auto-load on open; connect card
      with platform tiles (Groww / INDmoney / Upstox shown as "Coming soon").
- [x] Connect always runs on the registered redirect site, so one fixed redirect URL works.
- [x] Tradebook import: Zerodha `.xlsx` and `.csv` (also generic CSV/TXT); legacy `.xls` and PDF get a clear message.
- [x] **Several tradebook files at once** (yearly files); overlapping trades counted once.
- [x] Broker trade IDs scoped by exchange and date; identical re-imported trades merged.
- [x] Execution time used to order same-day trades.
- [x] Splits and bonus issues (ratio) in the ledger.
- [x] **Saved history in this browser** (IndexedDB): loaded automatically on open; download/restore
      backup; delete saved data.
- [x] **Today's Zerodha trades saved automatically** whenever holdings load (NSE/BSE equity only).

### Calculations and screens
- [x] FIFO ledger, realized/unrealized/economic P&L, position break-even, lifecycle recovery (per stock).
- [x] Home table: Stock · Qty · Zerodha avg cost · Your real avg cost · Zerodha last price ·
      Profit booked · Loss booked · Loss covered · Current P&L · Overall · To recover · Break-even · Notes.
- [x] Totals: profit booked so far (incl. fully sold stocks), current P&L, overall, still to recover.
- [x] Sticky table header, tooltip on every column header (hover or tap), stock/ISIN search.
- [x] "Where each stock stands overall" diverging bar chart (loss left, gain right; biggest 12 by default).
- [x] Plain-language list of "sales without an earlier buy in your files" with the fix.
- [x] After uploading while connected, the page returns to the portfolio table.
- [x] Live quotes via Upstox (equity/ETF) and AMFI (mutual funds) in the detailed view.
- [x] Clearer summary tiles: whole portfolio net, net on current stocks, current P&L, booked so far,
      losing stocks still need (see DECISIONS P8).
- [x] **Needs your confirmation** panel: detected splits/bonuses (from own data), verified demergers
      (Tata Motors 2025: TMPV 68.85% / TMCV 31.15%; Vedanta 2026: 52.34 / 21.49 / 12.23 / 7.15 / 6.79%),
      shares without a buy (IPO / transfer / before files / gift / other demerger); confirm, dismiss, undo.
- [x] Demerger accounting in the engine; trades now remember their stock symbol.
- [x] Demerger matching lists every stock (new companies topped up with buys included); Vedanta children
      mapped to VOGL / VEDPOWER / VAML / VISL; missing stock names looked up by ISIN and saved in the browser.
- [x] Auto-matching by ISIN / symbol / share count with a confirm-only summary; cards refresh when holdings load.
- [x] Stricter split/bonus detection (DECISIONS P12); neutral note for unexplained quantities.
- [x] Backup reminder banner + leave-page warning; backups now also carry dismissed items and looked-up names.
- [x] **Verification against Zerodha**: P&L statement import; per-stock status badge + "Checked against Zerodha"
      panel (verified / needs answer / doesn't match / not checked) using holdings (shares, average cost) and P&L
      statements (booked P&L per period, shares and cost at period end). Statements saved in browser and backups.
- [x] "Explain the difference" breakdown form on every quantity card (in and out reasons, multi-line, balanced
      before saving); new `transfer-out` entry; answers saved permanently and listed with Undo.
- [x] Build label (commit + environment) in the footer and `/api/version`.

### Hosting and security
- [x] Production on Vercel Hobby (free), from `main`; owner-only access-code gate (`APP_ACCESS_CODE`).
- [x] Access code check tolerant of pasted spaces/newlines/quotes.
- [x] Production env vars set by owner: `APP_ACCESS_CODE`, `KITE_API_KEY`, `KITE_API_SECRET`,
      `KITE_REDIRECT_URL`, `KITE_SESSION_ENCRYPTION_KEY`, `SMARTFOLIO_ACCESS_KEY`, `UPSTOX_ANALYTICS_TOKEN`.
- [x] Kite console redirect URL changed to the Production callback.
- [x] CI: lint, tests, build on `claude/**` and `main` (GitHub Actions).

## Needs checking on the owner's real data (built, not yet confirmed)

- [ ] Lifecycle columns and totals look right once **all** yearly tradebooks are uploaded.
- [ ] Daily Zerodha trade sync: confirm a trade made today appears once, and is **not duplicated**
      when that month's tradebook is uploaded later (relies on Kite `trade_id` = tradebook `trade_id`).
- [ ] Saved history survives closing and reopening the browser; backup/restore round trip.
- [ ] Sticky header / tooltips / search / chart on the owner's screen sizes (desktop + phone).
- [ ] "Fetch live quotes" on Production with the Upstox token (leave the access-key box empty).
- [ ] Apply the Tata Motors and Vedanta demerger cards on real data; check TMPV/TMCV and the Vedanta
      companies' figures, and that the Vedanta child stocks were matched to the right holdings.
- [ ] Review the "Losing stocks still need" vs "Whole portfolio, net" figures after confirmations.
- [ ] Re-upload tradebooks once so older saved trades also learn their stock symbols (helps matching).

## TODO (agreed, not started)

- [ ] **Friends sharing** (plan Task 7.5): per-user sign-in, separate data per user, check Kite
      Personal app terms for other people's accounts, hosting/cost. *Deferred by owner.*
- [ ] Optionally auto-run "Resolve instruments" after upload (offered; owner hasn't asked yet).
- [ ] Brokerage/STT/charges: the tradebook has none, so P&L is before charges. Consider importing
      Zerodha's P&L statement (charges summary) — see OPEN_QUESTIONS.
- [ ] Add more verified demergers to the list as they come up (owner to name the ones they remember).
- [ ] Mergers / amalgamations and symbol changes (not handled yet).
- [ ] **Intraday trades** (sell before buy on the same day, MIS/BTST): match same-day buys and sells with each
      other first, then FIFO for the net (today a same-day sell-first shows as "quantities don't add up").
- [ ] Dividends (from broker data where available, otherwise flagged).
- [ ] Other brokers (Groww, INDmoney, Upstox) — research whether their APIs give past trades for free.
- [ ] Simplify the detailed "Trade history" view (still technical: resolve/calculate/reconcile/quotes panels).
- [ ] Update README "status" paragraphs and `progress.md` to the current state (some text still describes
      the earlier CSV-only preview).
- [ ] Pre-existing type error in `src/engine/quoteValuations.test.ts` (test file only; build unaffected).

## Housekeeping

- `feat/reliable-pnl-foundation` is now **behind** `main`; decide whether to retire it (OPEN_QUESTIONS).
- PR #1 (`docs/project-plan-and-progress`) is superseded by docs on the implementation branch.
