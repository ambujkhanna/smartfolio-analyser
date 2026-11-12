# Conversation log

A record of what was discussed and what came out of it, so nothing has to be asked again.
Not a verbatim transcript; personal data (amounts, codes, e-mails) deliberately left out.

## Before 11 Nov 2026 — ChatGPT sessions (summary)

Recorded in detail in [../PROJECT_LOG.md](../PROJECT_LOG.md). Key outcomes: remove invented prices;
FIFO lifecycle accounting; Zerodha Kite Connect Personal (free, read-only) connector; tradebook as
history source; Upstox Analytics Token + AMFI for prices; Vercel Preview deployment with the redirect
registered on the `feat/reliable-pnl-foundation` branch alias; owner verified holdings, positions,
orders and trades in Preview; recurring problem of the branch alias serving a stale commit.

## 11 Nov 2026 — Claude Code session (part 1)

1. **Review.** Scanned both branches and PRs; read the owner's ChatGPT history to compare what was
   discussed with what was in the repo. Wrote a status table (objective, done, left) and a Phase 0–6 plan.
2. **Constraint set by owner:** no extra-cost AI usage (see DECISIONS W2).
3. **Branch:** `claude/phase0-stabilise` created from `feat/reliable-pnl-foundation` (W1).
4. **Phase 0:** build label + `/api/version`; CI on `claude/**`; fixed two failing tests; README quick
   reference (links, env vars without values, accounts/costs, branches).
5. **Engine/import work:** duplicate trades merged and broker IDs scoped; labelled broker average cost;
   splits/bonus; import progress steps; `.xlsx` tradebook import; execution-time ordering.
6. **Owner's feedback on usability:** connect option hard to find, raw Zerodha panel too big, upload
   shouldn't be needed when connected, and ask for missing info explaining what/why/how.
   → **Home redesigned**: portfolio first, connect card, "ask" cards, raw data under "Advanced".
7. **Local testing** with the owner's sample tradebook and P&L statement (never committed). One month of
   data produced many "sale without earlier buy" errors — expected.
8. Owner instruction: never use another person's credentials (H7). Confirmed only the owner's account was used.

## 12 Nov 2026 — Claude Code session (part 2)

9. README updated with the branch's Preview link.
10. **Owner:** tables showed instrument IDs → now show stock symbols/names.
11. **Owner:** "says not connected but no way to connect". Found a real bug: connect only worked on the
    registered redirect site. Fixed by forwarding to it.
12. **Owner's questions answered:** Upstox token — never share, add in Vercel; database — free and easy
    preferred; Production — free on Hobby but public; merge — not yet.
13. **Owner:** tired of changing the redirect URL; wants to configure once, personal use only,
    friends later. → **Owner-only Production** (H2–H5): access-code gate, one fixed redirect URL,
    `main` fast-forwarded and deployed (owner: "if it's free to deploy on production then do it").
14. Step-by-step Vercel guidance; owner added the Production env vars, changed the Kite redirect,
    redeployed. Access code "didn't match" → made the check ignore pasted spaces/quotes.
15. Owner signed in on Production and connected Zerodha successfully; holdings with Zerodha avg cost
    and real avg cost visible. Upstox token added for Production; redeployed. Build warnings explained (harmless).
16. **Owner asked** whether "Resolve instruments" is needed → no; calculation is automatic.
17. **Owner's main request:** show real loss, profit booked, and how much is left to cover the principal
    (worked example in DECISIONS P4); then asked for profit booked / loss covered / current loss columns.
    → Lifecycle columns + totals built, tested with the owner's example.
18. **Owner asked if personal data goes to the cloud** → explained (DECISIONS S2), including that
    screenshots shared in chat went to the AI provider.
19. Owner saw only the detailed view after upload and many "sale exceeds open quantity" errors →
    explained (older tradebooks needed); added multi-file upload, plain-language missing-buy list,
    return-to-portfolio, per-stock recovery.
20. **Owner asked** whether the tradebook must be uploaded every time, and shared the plan "upload past
    trades once, pick future trades from the platform automatically". Discussed limits (today's trades
    only, daily login, gaps caught by quantity check). **Owner chose browser-only storage** (S1).
    → Built IndexedDB storage, backup/restore/delete, automatic saving of today's Zerodha trades.
21. **Owner asked** for a sticky table header, tooltips on column headers, stock search, and a helpful
    chart → built (diverging "where each stock stands overall" bars).
22. **Owner asked** for these handover files so no discussion is lost or repeated, and to push everything.
23. **Owner asked** to combine Zerodha, Coin, INDmoney and smallcase in one place ("stop me if over-engineering").
    Answer: not over-engineering if file-first; smallcase already included; plan in OPEN_QUESTIONS Q12.
    **Owner will come back to this topic later.**
24. **Owner reported** wrong values for demerged stocks (TMPV −₹18k because of the TMPV/TMCV demerger; Vedanta
    split into five). Explained why (all original cost stayed on the parent) and proposed a demerger event.
25. **Owner asked** whether the app can fetch such events itself, and why "Still to recover" showed about ₹1.23 lakh.
    Answers: splits/bonuses can be detected; demerger cost splits need the company's notice; NSE/BSE scraping is
    not allowed (bot protection) → use own data + verified list + owner confirmation. "Still to recover" was a
    gross figure over losing stocks only (gains elsewhere not subtracted) → tiles relabelled, net figures added.
26. **Owner approved all four steps** → built clearer tiles, demerger accounting, detection of splits/bonuses,
    verified Tata Motors and Vedanta demergers, and the shares-without-a-buy helper ("Needs your confirmation").
27. **Owner asked** for an end-to-end "change → push → deploy" guide → DEV_WORKFLOW.md.
28. **Owner reported** the Vedanta card could not pick VOGL (received in the demerger, then topped up with buys) and some
    stocks showed only an ISIN. Fixed: dropdown lists all stocks (likely matches first); Vedanta list uses the listed
    symbols VOGL / VEDPOWER / VAML / VISL; names for ISIN-only stocks are looked up (ISIN only sent) and remembered.
29. **Owner asked** that the app pick matches itself and only ask for confirmation → matches by ISIN, symbol, or
    share count; when all are matched the card shows a summary with "Confirm and apply" ("Change matches" optional).
    Found and fixed: cards kept choices made before Zerodha holdings loaded (why VAML seemed missing).
30. **Owner asked** whether confirmations must be redone after refresh/new tab → no, saved in the browser; other
    browsers/devices need backup → restore. **Owner asked** for a reminder to download a backup → banner when changes
    aren't in a backup + the browser's standard "Leave site?" warning while that is true.
31. **Owner reported** a CGPOWER "1:2 bonus" suggestion that didn't match reality (window inside one day). It was a
    false positive. Detection now requires: window between trading days, no intraday buy+sell that day, and the
    price drop a split/bonus causes (prices before vs after ≈ ratio). Otherwise a neutral "quantities don't add up"
    note with no Apply button. Owner advised to click "Not this" on the old CGPOWER card. Intraday (sell-then-buy
    same day) handling in the ledger is a TODO.
32. **Owner reported** LICI (never sold) showing "quantities don't add up" / "Earlier trades missing (45 units
    differ)", and that LIC gave a 1:1 bonus in 2026. Cause: the price check compared the purchase price with
    today's price. Fix: Zerodha's **average cost is adjusted for bonuses/splits**, so "your average cost ÷ Zerodha's
    ≈ ratio" is now the main evidence (and picks the right answer when several ratios fit the quantities).
    Table note now says "Quantity differs by N — see Needs your confirmation".
33. **Owner found** "ALIVUS: 10 shares without an earlier buy" confusing (people sell first, then buy again).
    Reworded: "You sold 10 ALIVUS shares on DATE, but your files don't show when you bought them… Afterwards you
    bought N again". A sale covered by a buy-back the same day is labelled **intraday**, not missing history.
34. **Owner found** the ALIVUS/SULA cards still confusing (3 vs 45 vs 10). Replaced with a share-count table:
    bought (files) / sold (files) / held now (Zerodha) / no purchase record = sold + held − bought, plus "usually IPO
    allotments (never in a tradebook), shares bought before your oldest file (date shown), transfers, bonus/demerger".
    "IPO allotment" is the default choice when the files start before the first sale.
35. **Owner asked** how to trust the app without validating every stock by hand → proposal: automatic cross-check
    against Zerodha's own P&L statement + a per-stock "verified" status (see OPEN_QUESTIONS Q14).

## Where things stand at the end of 12 Nov (updated after item 27)

Everything above is pushed to `claude/phase0-stabilise` and `main` (Production). See
PROGRESS_AND_TODO.md for what still needs checking on real data, and OPEN_QUESTIONS.md for pending choices.
