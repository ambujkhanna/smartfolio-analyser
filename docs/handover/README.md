# Handover — start here

**Last updated:** 12 Nov 2026 · **Owner:** the repository owner (single developer, personal use)

This folder lets any assistant (ChatGPT, Claude, Copilot, …) or a future you continue the
project **without re-discussing settled points**. Read in this order:

| # | File | What it gives you |
|---|---|---|
| 1 | [DECISIONS.md](DECISIONS.md) | Everything already decided, with the reason. **Do not reopen these unless the owner asks.** |
| 2 | [PROGRESS_AND_TODO.md](PROGRESS_AND_TODO.md) | What is built and live, what still needs checking, the TODO list |
| 3 | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | Points still to discuss or decide |
| 4 | [FUTURE_PLAN.md](FUTURE_PLAN.md) | Phased roadmap with status |
| 5 | [CONVERSATION_LOG.md](CONVERSATION_LOG.md) | What was discussed, in order, and what came out of it |
| 6 | [DEV_WORKFLOW.md](DEV_WORKFLOW.md) | How to make a change and ship it: checks → push → Preview → `main` → Production |

Older context: [../PROJECT_LOG.md](../PROJECT_LOG.md) (29 Oct 2026 specification, ChatGPT era),
[../../plan.md](../../plan.md) (task plan), [../../progress.md](../../progress.md) (verified status),
[../PRODUCTION_SETUP.md](../PRODUCTION_SETUP.md), [../ZERODHA_CONNECT.md](../ZERODHA_CONNECT.md),
[../ACCOUNTING_RULES.md](../ACCOUNTING_RULES.md), [../MARKET_DATA_PROVIDER_REVIEW.md](../MARKET_DATA_PROVIDER_REVIEW.md).

## The project in five lines

1. **Goal:** show an Indian investor's *real* cost and profit across every buy, sell and re-buy,
   which broker screens hide (Zerodha's average cost resets after a sell-and-re-buy).
2. **App:** Next.js 15 on Vercel (free Hobby plan), private to the owner via an access code.
   Live at https://smartfolio-analyser.vercel.app (built from `main`).
3. **Data in:** Zerodha holdings and today's trades (read-only Kite Connect, free plan), past trades
   from Zerodha tradebook files uploaded once; prices from Zerodha / Upstox / AMFI.
4. **Data kept:** only in the owner's browser (IndexedDB) with a backup file. No database.
5. **Rule above all:** never invent a price or cost. Unknown stays "—", with the reason.

## Rules for anyone continuing

- The repository is **public**. Never commit personal data (tradebooks, P&L files, amounts,
  screenshots), secrets, tokens, the access code or e-mail addresses.
- Secrets live only in Vercel environment variables, set by the owner. Never ask for them in chat.
- Use only the owner's own GitHub / Vercel / Zerodha / Upstox accounts. Never another person's
  credentials or signed-in sessions, even if a browser happens to be signed in to one.
- Explain things to the owner step by step in plain language (not a coding specialist for ops
  tasks such as Vercel settings).
- For Claude Code sessions: the owner wants **no extra paid usage** — no Claude API calls,
  sub-agents, multi-agent workflows, cloud sessions or "ultra" reviews. Work inline.
