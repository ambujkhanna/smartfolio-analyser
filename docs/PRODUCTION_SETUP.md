# Production setup (one time, owner only, free plan)

Goal: one fixed address, **https://smartfolio-analyser.vercel.app**, configured once, so the
Zerodha redirect URL and tokens never need changing again.

The Vercel Hobby (free) plan does not put Vercel's login in front of the Production address, so the
app has its own free gate: set `APP_ACCESS_CODE` and every page asks for that code once per browser
(remembered for a year). Without `APP_ACCESS_CODE` the gate is off, which is fine for local
development and for Vercel-protected previews.

## Checklist

Do steps 1 and 2 **before** `main` is updated, so the first Production build already has them.

### 1. Vercel → Project → Settings → Environment Variables

| Variable | Environments | Value |
|---|---|---|
| `APP_ACCESS_CODE` | Production (Preview optional) | A long passphrase only you know (e.g. 4–5 random words). Changing it later signs every browser out |
| `KITE_REDIRECT_URL` | Production **and** Preview | `https://smartfolio-analyser.vercel.app/api/zerodha/callback` |
| `KITE_API_KEY`, `KITE_API_SECRET`, `KITE_SESSION_ENCRYPTION_KEY` | Production **and** Preview | Edit each existing variable and tick **Production** (values unchanged) |
| `UPSTOX_ANALYTICS_TOKEN` | Production and Preview | When you create it (valid about 1 year) |
| `SMARTFOLIO_ACCESS_KEY` | Optional | No longer needed in the browser once you have signed in with the access code |

Setting `KITE_REDIRECT_URL` to the Production address everywhere means any preview's Connect button
forwards to Production, so there is only ever one redirect URL.

### 2. Kite developer console (https://developers.kite.trade/)

Set the app's redirect URL to `https://smartfolio-analyser.vercel.app/api/zerodha/callback`. This is
the last time it needs changing.

### 3. Update `main`

Fast-forward `main` to the reviewed branch. Vercel builds Production from `main` automatically. Check
`https://smartfolio-analyser.vercel.app/api/version` (after entering the access code) shows the new commit.

## What still repeats (cannot be configured away)

- **Zerodha login once a day.** Zerodha (per exchange rules) expires every Kite session around 6 AM.
  You click Connect and log in on Zerodha's site; no settings change.
- **Upstox Analytics Token about once a year**, when it expires.

## Future (TODO): sharing with friends

Not in scope now. See plan.md Task 7.4. Needs per-user sign-in instead of one shared code, separate
data per user, and checking whether a Kite Connect Personal app may be used by other Zerodha accounts.
