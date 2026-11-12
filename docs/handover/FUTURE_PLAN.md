# Future plan

Phases agreed on 11 Nov 2026 (Claude session), with status as of 12 Nov 2026.
✅ done · 🟡 partly done · ⬜ not started · 👤 needs the owner

## Phase 0 — Stabilise ✅
Build label, CI on work branches, test fixes, README quick reference, deployment checks.

## Phase 1 — Live market prices ✅
Upstox Analytics Token in Production (👤 done), AMFI NAVs, Zerodha last price on the home table.
Remaining: confirm "Fetch live quotes" on Production with real holdings.

## Phase 2 — Getting data in reliably ✅ (mostly)
- ✅ One-time history import, several yearly files at once, duplicates counted once
- ✅ Zerodha average cost shown as a labelled broker figure (never used for realized P&L)
- ✅ `.xlsx` tradebook import
- ⬜ PDF contract notes (text-based only) — low priority

## Phase 3 — Saving data and daily sync 🟡
- ✅ Decision: browser-only storage (IndexedDB) + backup/restore (👤 decided 12 Nov)
- ✅ Saved history loads on open; today's Zerodha trades saved when connected
- ⬜ Gap detection message: "Trades between DATE and DATE may be missing — upload that period's tradebook"
      (today the quantity check shows mismatched stocks, but not the date range)
- ⬜ "Last synced" reminder if the app wasn't opened on a trading day
- (Cloud DB + scheduled sync only if multi-device/friends — see OPEN_QUESTIONS Q6)

## Phase 4 — Automatic-first acquisition ⬜
Provider registry (Zerodha, Upstox, AMFI, later Groww), coverage report (what was fetched, from
which dates, what's missing), targeted prompts asking only for the specific file that's missing.
Groww/INDmoney: research only first.

## Phase 5 — Accounting completeness 🟡
- ✅ Splits/bonuses (detected from own data), demergers (verified list + manual), shares without a buy
- ⬜ Charges from the P&L statement (Q3), dividends, mergers, symbol changes/aliases

## Phase 6 — Hardening ⬜
UI tests in CI, security review (secrets server-side, rate limits, cookie/OAuth flow), simplify the
detailed trade-history view, refresh README/progress docs.

## Phase 6b — Multiple platforms ⬜ (owner will return to it — OPEN_QUESTIONS Q12)
Platform label per trade, combined + per-platform views, Coin MFs, INDmoney stocks, CAS for all MFs.

## Phase 7 — Sharing (future, deferred) ⬜
Friends/closed group: per-user sign-in and data, cloud DB, Kite terms check, hosting cost.

## Suggested next session
1. Owner uploads all yearly tradebooks and checks the lifecycle columns on real data.
2. Verify daily sync + later tradebook upload doesn't double count (Q4).
3. Then Phase 3 gap message → Phase 5 charges (Q3) → auto-resolve (Q5).
