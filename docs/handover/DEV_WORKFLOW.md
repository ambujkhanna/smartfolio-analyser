# How to make a change and ship it (end to end)

For the owner and for any assistant working on this repo. Production is
**https://smartfolio-analyser.vercel.app**, built automatically from the `main` branch.

## The short version

```
edit code → run checks locally → commit on a work branch → push
→ CI + Vercel Preview build → check the Preview → put it on main → Vercel Production build → check Production
```

## 1. Before you start

- Get the latest code: `git fetch origin` then `git switch claude/phase0-stabilise` (or create a new
  branch from `main`: `git switch -c claude/<short-topic> origin/main`).
- Node.js 20 or newer must be installed. First time only: `npm install`.
- For local Zerodha testing you'd need a `.env.local` (copy `.env.example`), but most work does not
  need it: the app runs locally without keys and simply shows "not set up" for Zerodha.

## 2. Make the change and check it locally

Run these in the repo folder:

```bash
npm test          # all unit tests (Vitest)
npm run lint      # code style / mistakes (ESLint) — can take a few minutes on Windows
npm run build     # the same production build Vercel runs; must end with "Generating static pages"
```

To look at it in a browser: `npm run build` then `npx next start -p 3123` and open
http://localhost:3123. Data saved in your browser on localhost is separate from Production.

**Never commit:** tradebooks, P&L files, screenshots with amounts, `.env.local`, tokens, the access code.
The repository is public.

## 3. Commit and push to a work branch

```bash
git add -A
git status                     # check nothing personal is listed
git commit -m "What changed and why"
git push origin HEAD
```

What happens automatically after a push:

| Service | What it does | Where to see it |
|---|---|---|
| GitHub Actions ("quality") | lint + tests + build (branches `claude/**`, `main`) | https://github.com/ambujkhanna/smartfolio-analyser/actions |
| Vercel Preview | builds a private preview of the branch (behind Vercel login) | Vercel project → Deployments, or the ✓/✗ next to the commit on GitHub |

The branch Preview address is shown in the commit's Vercel check on GitHub (Vercel shortens long branch
names). Zerodha login on a Preview forwards to Production (one fixed redirect URL), so test Zerodha on
Production itself.

## 4. Put it live (Production)

Only when the checks are green and you're happy with it:

```bash
git fetch origin
git push origin HEAD:main      # fast-forward main to your branch
```

If git refuses ("non-fast-forward"), someone changed `main`: merge it first
(`git merge origin/main`), run the checks again, then push.

Vercel builds Production from `main` automatically (about 1–2 minutes). Then check:

1. Open https://smartfolio-analyser.vercel.app → it asks for the access code (if a new browser).
2. The page footer shows `Build <commit> · production`; it must match your latest commit
   (also at `/api/version` after signing in).
3. Click through the part you changed.

If the footer shows an older commit: Vercel → project → Deployments → open the newest one → **Promote**
(never "Redeploy" an old entry — that is how the preview once got stuck on an old commit).

## 5. When settings (environment variables) change

Settings live only in Vercel → Project → Settings → Environment Variables (never in the code or chat).
After adding or changing one, it only takes effect after a new deployment: Vercel → Deployments →
newest Production deployment → **⋯ → Redeploy**, or push any commit to `main`.

| Setting | Changes how often |
|---|---|
| `UPSTOX_ANALYTICS_TOKEN` | about once a year (token expires) |
| `APP_ACCESS_CODE` | only if forgotten or leaked (changing it signs every browser out) |
| `KITE_*` | normally never (redirect URL is fixed to Production) |

## 6. Undo a bad release

```bash
git revert <bad-commit>        # creates a new commit that undoes it
git push origin HEAD:main
```

or, faster for an emergency: Vercel → Deployments → the last good Production deployment → **Promote**.

## 7. After each working session

Update `docs/handover/` (PROGRESS_AND_TODO, DECISIONS, OPEN_QUESTIONS, CONVERSATION_LOG) so the next
person or assistant doesn't re-discuss settled points.
