# Zerodha Kite Connect (read-only)

## Scope
The first connector is read-only. It exposes holdings, positions, orders, and trade records available from the authenticated Kite Connect session. It does not place, modify, or cancel orders.

## Required server environment
Configure these in the Vercel project settings (never in browser variables and never commit real secrets):
- `KITE_API_KEY`
- `KITE_API_SECRET`
- `KITE_REDIRECT_URL`: the exact registered URL ending in `/api/zerodha/callback`
- `KITE_SESSION_ENCRYPTION_KEY`: base64-encoded random 32-byte key for AES-256-GCM encryption of the session token in an HttpOnly cookie.

Generate an encryption key locally with:
```sh
openssl rand -base64 32
```

## Setup sequence
1. Deploy this feature branch to a private preview.
2. Add a stable preview/custom domain or use the exact deployment URL that will be registered. Set `KITE_REDIRECT_URL` to `https://<host>/api/zerodha/callback`.
3. Create the Personal app in the Kite developer portal and register that exact redirect URL.
4. Add API key, API secret, redirect URL and encryption key to Vercel server environment variables, then redeploy.
5. Open `/api/zerodha/login`, authorize at Zerodha, and verify the redirect returns to Smartfolio.
6. Test `/api/zerodha/data?type=holdings`, `positions`, `orders`, and `trades` while signed in.

## Security and limitations
- API secret is used only in server routes; never expose it in client code.
- Session token is encrypted with AES-256-GCM and stored in an HttpOnly, SameSite=Lax cookie. The cookie is scoped to this browser and expires within 12 hours; Zerodha tokens themselves expire at 6 AM the next day.
- Do not use this single-user cookie pattern for a multi-user public product without user-bound storage, CSRF protection, access control, and a security review.
- Orders/trades endpoints may only return current-day records; they are not a full historical ledger. Keep historical CSV import available for backfill and reconciliation.
- The Personal (Free) plan excludes paid live quote and historical candle APIs. Holdings responses may contain broker-provided last price/P&L fields, but quote freshness and suitability must be validated before treating them as trusted market quotes.
- No secrets or personal financial exports belong in Git.
