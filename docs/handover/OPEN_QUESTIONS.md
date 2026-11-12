# Open questions and discussion points

Not decided yet. Each has a suggested answer; the owner decides.

| # | Question | Context | Suggested answer |
|---|---|---|---|
| Q1 | Retire `feat/reliable-pnl-foundation`, or merge `main` back into it? | `main` (= `claude/phase0-stabilise`) is ahead and is what Production runs. The old Preview alias and its Zerodha redirect are no longer used. | Retire it (keep the branch, stop using it); continue on `claude/*` branches → `main`. |
| Q2 | Close PR #1 (`docs/project-plan-and-progress`)? | Superseded by docs now in `main`. | Close it with a note. |
| Q3 | Include brokerage, STT and other charges in P&L? | Tradebook has no charges, so all P&L is **before charges**. Zerodha's P&L statement (`pnl-*.xlsx`) has a charges summary (owner shared one for local testing). | Import the P&L statement's charges as fee rows per period; show P&L before and after charges. |
| Q4 | Does Kite's `trade_id` exactly equal the tradebook's `trade_id`? | The daily sync relies on it to avoid double counting. Leading zeros are already ignored. | Verify with one real trade (see PROGRESS "Needs checking"). If they differ, add a fallback match (date + stock + side + qty + price). |
| Q5 | Run "Resolve instruments" automatically after upload? | Only gives full company names and a listing check; P&L and prices work without it. | Yes, run it automatically; keep the button for retries. |
| Q6 | Cloud database later? | Browser-only storage chosen now (S1). Needed only for phone + laptop, or friends sharing. | Revisit with friends sharing (Neon free Postgres; encrypted; per-user). |
| Q7 | Friends sharing details | Deferred (H1). Kite Personal app may be limited to the developer's own account; Vercel Hobby is non-commercial. | Research when the owner restarts this. |
| Q8 | ~~Splits/bonus entry UX~~ | **Done 12 Nov:** "Needs your confirmation" panel. | — |
| Q9 | Mutual funds and other segments (F&O, commodities) | Only NSE/BSE equity is synced; MF NAV pricing exists. | Equity first; MF via Zerodha Coin holdings later. |
| Q10 | Should the ChatGPT conversation export be committed? | A full copy exists only in the Claude session folder (`chatgpt-history-smartfolio.md`), not in the repo. Repo is public. | Keep it private (owner's own storage), or commit a redacted summary only — `docs/PROJECT_LOG.md` already summarises it. |
| Q12 | **Multiple platforms in one place** (Zerodha, Coin, INDmoney, smallcase) — *owner will come back to this* | smallcase via Zerodha = already in Zerodha holdings/tradebook. Coin MFs = Zerodha tradebook segment MF + AMFI NAV (Kite API may also list MF holdings — check free plan). INDmoney Indian stocks = its trade report (need a sample). All MFs across platforms = CAMS/KFintech CAS. INDmoney US stocks = over-engineering for now. FIFO per account, then combined; NSDL/CDSL CAS for cross-demat holdings check. | Step 1: platform label on each trade + combined/per-platform view. Then Coin MF, INDmoney stocks (sample needed), CAS. Owner to say what is held where and share sample files (local only). |
| Q13 | Which other demergers/splits does the owner remember? | Verified list has Tata Motors 2025 and Vedanta 2026. | Owner names them; each gets verified against the company's cost notice before adding. |
| Q14 | ~~Trust without manual checking~~ **Built 12 Nov** (see PROGRESS). Remaining: owner to download P&L statements for each year and review mismatches. | | |
| Q14-old | Trust without manual checking: verify every stock automatically? | Owner spends effort validating. Tradebooks lack IPOs, corporate actions, transfers; the app can only ask. Zerodha's P&L / Tax P&L statements (Console → Reports) contain Zerodha's own realized P&L per stock, including IPO and corporate-action adjustments. | Build: import Zerodha P&L statement → compare per stock with the app → mark each stock Verified / Needs one answer / Mismatch; a health summary ("92 of 110 verified"). Monthly top-up: new tradebook + P&L statement. |
| Q11 | Custom domain? | Production uses `smartfolio-analyser.vercel.app`. A custom domain would need the Kite redirect URL changed once more. | Not needed for personal use. |
