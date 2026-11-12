"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  reconcileHoldings,
  type KiteHolding,
  type PnlPosition,
  type ReconciledHolding,
} from "../engine/reconcileHoldings";

type ConnectionState =
  | { kind: "checking" }
  | { kind: "not-configured" }
  | { kind: "not-connected"; connectOrigin?: string | null }
  | { kind: "expired" }
  | { kind: "error"; message: string }
  | { kind: "connected"; holdings: KiteHolding[]; retrievedAt: string | null };

interface HoldingsPayload {
  data?: { data?: unknown };
  error?: string;
  reauthorize?: boolean;
  retrievedAt?: string;
  connectOrigin?: string | null;
}

const PLATFORMS = [
  { name: "Zerodha", available: true },
  { name: "Groww", available: false },
  { name: "INDmoney", available: false },
  { name: "Upstox", available: false },
];

export interface PortfolioHomeProps {
  /** Open positions from the imported trade history (empty when none imported). */
  positions: PnlPosition[];
  hasHistory: boolean;
  /** Instrument IDs whose sales exceeded imported buys (earlier history missing). */
  instrumentsMissingHistory: string[];
  onAddHistory: () => void;
}

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

function formatMoney(value: number | null): string {
  return value === null ? "—" : money.format(value);
}

function rowNote(row: ReconciledHolding, hasHistory: boolean): { text: string; tone: "ok" | "warn" | "muted" } {
  if (!hasHistory) return { text: "Add trade history", tone: "muted" };
  if (row.status === "matched" && row.ledgerAveragePrice !== null) return { text: "History complete", tone: "ok" };
  if (row.status === "matched") return { text: "Some buy costs unknown", tone: "warn" };
  if (row.status === "quantity-mismatch" && row.difference !== null) {
    return { text: `Earlier trades missing (${quantity.format(Math.abs(row.difference))} units differ)`, tone: "warn" };
  }
  return { text: "No buys found in history", tone: "warn" };
}

export default function PortfolioHome({ positions, hasHistory, instrumentsMissingHistory, onAddHistory }: PortfolioHomeProps) {
  const [state, setState] = useState<ConnectionState>({ kind: "checking" });
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "checking" });
    try {
      const response = await fetch("/api/zerodha/data?type=holdings", { cache: "no-store" });
      const payload = (await response.json()) as HoldingsPayload;
      if (response.status === 503) return setState({ kind: "not-configured" });
      if (response.status === 401) return setState({ kind: "not-connected", connectOrigin: payload.connectOrigin ?? null });
      if (payload.reauthorize || response.status === 403) return setState({ kind: "expired" });
      if (!response.ok) return setState({ kind: "error", message: payload.error ?? "Zerodha returned an error." });
      const holdings = payload.data?.data;
      if (!Array.isArray(holdings)) return setState({ kind: "error", message: "Zerodha returned an unexpected response." });
      setState({ kind: "connected", holdings: holdings as KiteHolding[], retrievedAt: payload.retrievedAt ?? null });
    } catch {
      setState({ kind: "error", message: "Could not reach Smartfolio. Check your connection and retry." });
    }
  }, []);

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("zerodha");
    if (outcome === "connected") setBanner("Zerodha connected. Loading your holdings…");
    if (outcome === "connection-failed") setBanner("Zerodha connection did not complete. Please try connecting again.");
    if (outcome) window.history.replaceState(null, "", window.location.pathname);
    void load();
  }, [load]);

  async function disconnect() {
    await fetch("/api/zerodha/logout", { method: "POST" }).catch(() => undefined);
    setBanner("Disconnected from Zerodha in this browser.");
    setState({ kind: "not-connected" });
  }

  const reconciliation = useMemo(
    () => (state.kind === "connected" ? reconcileHoldings(state.holdings, positions) : null),
    [state, positions],
  );
  const rows = reconciliation?.rows ?? [];
  const invested = rows.reduce((sum, row) => sum + (row.brokerCostBasis ?? 0), 0);
  const currentValue = rows.every((row) => row.brokerLastPrice !== null)
    ? rows.reduce((sum, row) => sum + (row.brokerLastPrice ?? 0) * row.brokerQuantity, 0)
    : null;
  const needsHistory = rows.filter((row) => hasHistory && row.status !== "matched");
  // Zerodha only returns to its registered site; connecting from any other site happens there.
  const connectElsewhere =
    state.kind === "not-connected" && state.connectOrigin && typeof window !== "undefined" && state.connectOrigin !== window.location.origin
      ? state.connectOrigin
      : null;

  return (
    <section className="home-panel" aria-labelledby="home-title">
      {banner ? <p className="home-banner" role="status">{banner}</p> : null}

      {state.kind === "checking" ? (
        <div className="home-card">
          <h2 id="home-title">Checking your account connection…</h2>
        </div>
      ) : null}

      {state.kind === "not-connected" || state.kind === "not-configured" ? (
        <div className="home-card">
          <p className="eyebrow">Step 1 · Connect</p>
          <h2 id="home-title">Connect your investment account</h2>
          <p className="home-lead">
            Smartfolio reads your holdings directly from your broker so you don&rsquo;t have to upload files every time.
            Access is <strong>read-only</strong>: Smartfolio can never place or cancel orders.
          </p>
          <div className="platform-grid">
            {PLATFORMS.map((platform) =>
              platform.available && state.kind === "not-connected" ? (
                <a key={platform.name} className="platform-tile is-available" href="/api/zerodha/login">
                  <strong>{platform.name}</strong>
                  <span>Connect →</span>
                </a>
              ) : (
                <div key={platform.name} className="platform-tile">
                  <strong>{platform.name}</strong>
                  <span>{platform.available ? "Not set up on this site" : "Coming soon"}</span>
                </div>
              ),
            )}
          </div>
          {state.kind === "not-connected" ? (
            <p className="home-note">
              Click <strong>Zerodha</strong> above to log in on Zerodha&rsquo;s site.
              {connectElsewhere ? (
                <> Zerodha sends you back to <strong>{new URL(connectElsewhere).host}</strong> (the site registered with Zerodha), and you will stay connected there, not on this page.</>
              ) : null}
            </p>
          ) : null}
          <details className="home-help">
            <summary>What happens when I connect?</summary>
            <ul>
              <li>You log in on Zerodha&rsquo;s own website; Smartfolio never sees your password or PIN.</li>
              <li>Smartfolio receives a read-only session for this browser. Zerodha ends it every morning around 6 AM, so you may need to reconnect each day.</li>
              <li>Only holdings, positions and today&rsquo;s trades are available from Zerodha. Your earlier trades come from a tradebook file you add once.</li>
            </ul>
          </details>
          {state.kind === "not-configured" ? (
            <p className="home-note">
              <strong>Zerodha can&rsquo;t be connected on this site yet.</strong> The Zerodha app keys (KITE_API_KEY, KITE_API_SECRET,
              KITE_REDIRECT_URL) are not set for this deployment in Vercel. Use the main preview site, or upload a tradebook below.
            </p>
          ) : null}
          <p className="home-note">
            Prefer not to connect? <button type="button" className="link-button" onClick={onAddHistory}>Upload a tradebook file instead</button>.
          </p>
        </div>
      ) : null}

      {state.kind === "expired" ? (
        <div className="home-card">
          <h2 id="home-title">Your Zerodha session has ended</h2>
          <p className="home-lead">Zerodha signs every connected app out daily (around 6 AM). Reconnect to refresh your holdings.</p>
          <a className="primary-link" href="/api/zerodha/login">Reconnect Zerodha →</a>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="home-card">
          <h2 id="home-title">We couldn&rsquo;t load your holdings</h2>
          <p className="home-lead">{state.message}</p>
          <button type="button" className="secondary-action-button" onClick={() => void load()}>Try again</button>
        </div>
      ) : null}

      {state.kind === "connected" ? (
        <div className="home-card">
          <div className="home-heading">
            <div>
              <p className="eyebrow">Connected · Zerodha · read-only</p>
              <h2 id="home-title">Your portfolio</h2>
              {state.retrievedAt ? <small>Updated {new Date(state.retrievedAt).toLocaleString()}</small> : null}
            </div>
            <div className="home-actions">
              <button type="button" className="secondary-action-button" onClick={() => void load()}>Refresh</button>
              <button type="button" className="link-button" onClick={() => void disconnect()}>Disconnect</button>
            </div>
          </div>

          <div className="pnl-stats home-stats">
            <div><strong>{rows.length}</strong><span>Holdings</span></div>
            <div><strong>{formatMoney(invested)}</strong><span>Invested (Zerodha avg cost)</span></div>
            <div><strong>{formatMoney(currentValue)}</strong><span>Current value (Zerodha last price)</span></div>
          </div>

          {!hasHistory ? (
            <div className="ask-card">
              <strong>One thing we need: your past trades (one-time)</strong>
              <p><b>What:</b> your Zerodha <em>Tradebook</em> for Equity, from your first trade until today.</p>
              <p><b>Why:</b> Zerodha only shares today&rsquo;s trades. Your <em>real</em> average cost and realized profit/loss across sells and re-buys can only be worked out from the full history. Until then we show Zerodha&rsquo;s average cost.</p>
              <p><b>How:</b> open <a href="https://console.zerodha.com/reports/tradebook" target="_blank" rel="noreferrer">Zerodha Console → Reports → Tradebook</a>, choose segment <em>Equity</em> and the full date range (download one file per year if the range is limited), click <em>Download XLSX</em>, then upload it here.</p>
              <button type="button" className="calculate-button" onClick={onAddHistory}>Upload tradebook</button>
            </div>
          ) : needsHistory.length > 0 || instrumentsMissingHistory.length > 0 ? (
            <div className="ask-card is-warning">
              <strong>Some holdings need earlier trades</strong>
              <p><b>What:</b> trades from before your uploaded tradebook starts, for {needsHistory.length || instrumentsMissingHistory.length} stock{(needsHistory.length || instrumentsMissingHistory.length) === 1 ? "" : "s"} ({needsHistory.slice(0, 5).map((row) => row.symbols[0] ?? row.isin).join(", ")}{needsHistory.length > 5 ? "…" : ""}).</p>
              <p><b>Why:</b> these shares were bought (or sold) outside the uploaded date range, so their real average cost can&rsquo;t be calculated yet.</p>
              <p><b>How:</b> download a tradebook covering the earlier dates from Zerodha Console and upload it too. Overlapping files are fine; duplicate trades are counted once.</p>
              <button type="button" className="secondary-action-button" onClick={onAddHistory}>Upload another tradebook</button>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="position-table-wrap">
              <table className="position-table">
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Qty</th>
                    <th title="Average buy price reported by Zerodha">Zerodha avg cost</th>
                    <th title="Smartfolio's FIFO average cost of your remaining shares, from your trade history">Your real avg cost</th>
                    <th title="Last price reported by Zerodha; may be delayed">Zerodha last price</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const note = rowNote(row, hasHistory);
                    return (
                      <tr key={row.isin}>
                        <td><strong>{row.symbols.join(", ") || row.isin}</strong><small className="position-reason">{row.isin}</small></td>
                        <td>{quantity.format(row.brokerQuantity)}</td>
                        <td>{formatMoney(row.brokerAveragePrice)}</td>
                        <td>{formatMoney(row.ledgerAveragePrice)}</td>
                        <td>{formatMoney(row.brokerLastPrice)}</td>
                        <td><span className={"note-pill is-" + note.tone}>{note.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="home-note">Zerodha returned no holdings for this account.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
