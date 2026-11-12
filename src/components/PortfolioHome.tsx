"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  /** Profit/loss booked by sales across all stocks with complete history (including fully sold ones). */
  booked?: { total: number; stocks: number; skipped: number; closedTotal: number };
  /** Number of corporate-action / missing-buy items waiting for the owner's confirmation. */
  confirmCount?: number;
  onAddHistory: () => void;
  /** Told whether Zerodha holdings are loaded, so the page can return here after an upload. */
  onConnectedChange?: (connected: boolean) => void;
  /** Told each time holdings load, so today's trades can be synced. */
  onHoldingsLoaded?: (holdings: KiteHolding[]) => void;
}

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

function formatMoney(value: number | null): string {
  return value === null ? "—" : money.format(value);
}

const COLUMN_TIPS: Record<string, string> = {
  stock: "Stock symbol from Zerodha, with its ISIN (the unique ID of the share) below.",
  qty: "Shares you hold now, as reported by Zerodha.",
  zerodhaAvg: "Average buy price Zerodha shows. It can reset after you sell and re-buy, so it may hide earlier losses.",
  realAvg: "Smartfolio's average cost of the shares you still hold, from your own trade history (first bought, first sold).",
  lastPrice: "Latest price from Zerodha (may be a few minutes delayed).",
  profitBooked: "Profit already locked in by sales that made money.",
  lossBooked: "Loss already locked in by sales that lost money.",
  lossCovered: "How much of the booked loss has been made back by booked profits plus today's gain on the shares you hold.",
  currentPnl: "Gain or loss on the shares you still hold, today, against your real average cost.",
  overall: "Everything together for this stock: today's value of your shares minus all the money still in it.",
  toRecover: "How much this stock still has to make up so you get back all the money you put in. 'Recovered' means you are in profit overall.",
  breakEven: "The share price at which selling everything you hold returns all your money, after earlier gains and losses.",
  notes: "Whether your uploaded trade history fully explains this holding.",
};

/** Column header with a tooltip that also works on tap/keyboard focus. */
function Th({ tip, align, children }: { tip: string; align?: "end"; children: ReactNode }) {
  return (
    <th>
      <span className={"th-tip" + (align === "end" ? " is-end" : "")} tabIndex={0} data-tip={tip} aria-label={`${typeof children === "string" ? children : ""}: ${tip}`}>
        {children}
      </span>
    </th>
  );
}

/**
 * Diverging bars: overall profit/loss per stock (booked + current). Loss extends left of
 * the zero line, gain right, each with a signed label, so it reads without colour.
 */
function OverallChart({ rows }: { rows: ReconciledHolding[] }) {
  const [showAll, setShowAll] = useState(false);
  const data = rows
    .filter((row) => row.lifecycle !== null)
    .map((row) => ({ row, value: row.lifecycle!.overallPnl }))
    .sort((a, b) => a.value - b.value);
  if (data.length === 0) return null;
  const limit = 12;
  // Default view: the biggest losses and gains, the stocks that matter most for recovery.
  const visible = showAll || data.length <= limit
    ? data
    : [...data.slice(0, limit / 2), ...data.slice(-limit / 2)].filter((item, index, list) => list.indexOf(item) === index);
  const max = Math.max(...visible.map((item) => Math.abs(item.value)), 1);
  return (
    <figure className="overall-chart">
      <figcaption>
        <strong>Where each stock stands overall</strong>
        <span>Booked + current profit/loss per stock, using Zerodha&rsquo;s last price. Hover or tap a bar for details.</span>
      </figcaption>
      <div className="overall-axis" aria-hidden="true"><span>◀ Loss</span><span>Gain ▶</span></div>
      <ul>
        {visible.map(({ row, value }) => {
          const life = row.lifecycle!;
          const width = (Math.abs(value) / max) * 50;
          const name = row.symbols[0] ?? row.isin;
          const tip = `${name}: overall ${(value >= 0 ? "+" : "") + money.format(value)} · booked ${money.format(life.realizedPnl)} · current ${money.format(life.unrealizedPnl)} · ${life.toRecover > 0 ? "to recover " + money.format(life.toRecover) : "recovered"} · break-even ${money.format(life.breakEvenPrice)}`;
          return (
            <li key={row.isin} tabIndex={0} data-tip={tip} aria-label={tip}>
              <span className="overall-name">{name}</span>
              <span className="overall-track">
                <span
                  className={"overall-bar " + (value < 0 ? "is-loss-bar" : "is-gain-bar")}
                  style={value < 0 ? { right: "50%", width: width + "%" } : { left: "50%", width: width + "%" }}
                />
              </span>
              <span className="overall-value">{(value > 0 ? "+" : "") + money.format(value)}</span>
            </li>
          );
        })}
      </ul>
      {data.length > limit ? (
        <button type="button" className="link-button" onClick={() => setShowAll((current) => !current)}>
          {showAll ? "Show biggest losses and gains only" : `Show all ${data.length} stocks`}
        </button>
      ) : null}
    </figure>
  );
}

/** Signed amount with gain/loss colour; "—" when unknown. */
function Signed({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <>—</>;
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  const tone = rounded > 0 ? "is-gain" : rounded < 0 ? "is-loss" : "";
  return <span className={tone}>{(rounded > 0 ? "+" : "") + money.format(rounded)}</span>;
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

export default function PortfolioHome({ positions, hasHistory, instrumentsMissingHistory, booked, onAddHistory, onConnectedChange, onHoldingsLoaded, confirmCount = 0 }: PortfolioHomeProps) {
  const [state, setState] = useState<ConnectionState>({ kind: "checking" });
  const [banner, setBanner] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  useEffect(() => {
    onConnectedChange?.(state.kind === "connected");
  }, [state.kind, onConnectedChange]);
  useEffect(() => {
    if (state.kind === "connected") onHoldingsLoaded?.(state.holdings);
  }, [state, onHoldingsLoaded]);

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
  const withLifecycle = rows.filter((row) => row.lifecycle !== null);
  const query = search.trim().toUpperCase();
  const visibleRows = query
    ? rows.filter((row) => row.isin.includes(query) || row.symbols.some((symbol) => symbol.toUpperCase().includes(query)))
    : rows;
  const lifecycleTotals = withLifecycle.reduce(
    (sum, row) => ({
      unrealized: sum.unrealized + (row.lifecycle?.unrealizedPnl ?? 0),
      overall: sum.overall + (row.lifecycle?.overallPnl ?? 0),
      toRecover: sum.toRecover + (row.lifecycle?.toRecover ?? 0),
    }),
    { unrealized: 0, overall: 0, toRecover: 0 },
  );
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

          {hasHistory ? (
            <>
              {confirmCount > 0 ? (
                <a className="home-banner confirm-banner" href="#needs-confirmation">
                  {confirmCount} item{confirmCount === 1 ? "" : "s"} need your confirmation (splits, bonuses, demergers or shares
                  without a buy). They can change the figures below — review them ↓
                </a>
              ) : null}
              <div className="pnl-stats home-stats">
                <div>
                  <strong><Signed value={(booked?.closedTotal ?? 0) + lifecycleTotals.overall} /></strong>
                  <span className="th-tip" tabIndex={0} data-tip="Your net result: profit/loss booked on stocks you've fully sold, plus the overall result on stocks you still hold (booked + current). Gains and losses offset each other here.">
                    Whole portfolio, net
                  </span>
                </div>
                <div>
                  <strong><Signed value={lifecycleTotals.overall} /></strong>
                  <span className="th-tip" tabIndex={0} data-tip="For stocks you still hold: today's value minus the money still in them. Gains on one stock offset losses on another.">
                    Net on current stocks
                  </span>
                </div>
                <div>
                  <strong><Signed value={lifecycleTotals.unrealized} /></strong>
                  <span className="th-tip" tabIndex={0} data-tip="Gain/loss on the shares you still hold, against your real average cost (excludes profit/loss already booked).">
                    Current P&amp;L on holdings
                  </span>
                </div>
                <div>
                  <strong><Signed value={booked?.total ?? 0} /></strong>
                  <span className="th-tip" tabIndex={0} data-tip="Profit/loss already locked in by selling, across every stock with complete history, including stocks you no longer hold.">
                    Booked so far ({booked?.stocks ?? 0} stock{booked?.stocks === 1 ? "" : "s"})
                  </span>
                </div>
                <div>
                  <strong className={lifecycleTotals.toRecover > 0 ? "is-loss" : ""}>{formatMoney(lifecycleTotals.toRecover)}</strong>
                  <span className="th-tip" tabIndex={0} data-tip="Added up only over stocks that are down: how much those stocks must rise to return all the money you put in them. Gains on other stocks are NOT subtracted here — see the net figures for that.">
                    Losing stocks still need
                  </span>
                </div>
              </div>
              <p className="home-note">
                Covers {withLifecycle.length} of {rows.length} holdings with complete trade history
                {booked && booked.skipped > 0 ? `; ${booked.skipped} stock${booked.skipped === 1 ? "" : "s"} with missing earlier trades are left out rather than guessed` : ""}.
                Uses Zerodha&rsquo;s last price.
              </p>
            </>
          ) : null}

          {!hasHistory ? (
            <div className="ask-card">
              <strong>One thing we need: your past trades (one-time)</strong>
              <p><b>What:</b> your Zerodha <em>Tradebook</em> for Equity, from your first trade until today.</p>
              <p><b>Why:</b> Zerodha only shares today&rsquo;s trades. Your <em>real</em> average cost and realized profit/loss across sells and re-buys can only be worked out from the full history. Until then we show Zerodha&rsquo;s average cost.</p>
              <p><b>How:</b> open <a href="https://console.zerodha.com/reports/tradebook" target="_blank" rel="noreferrer">Zerodha Console → Reports → Tradebook</a>, choose segment <em>Equity</em> and the full date range (download one file per year if the range is limited), click <em>Download XLSX</em>, then select all the files here together.</p>
              <button type="button" className="calculate-button" onClick={onAddHistory}>Upload tradebook</button>
            </div>
          ) : needsHistory.length > 0 || instrumentsMissingHistory.length > 0 ? (
            <div className="ask-card is-warning">
              <strong>Some holdings need earlier trades</strong>
              <p><b>What:</b> trades from before your uploaded tradebook starts, for {needsHistory.length || instrumentsMissingHistory.length} stock{(needsHistory.length || instrumentsMissingHistory.length) === 1 ? "" : "s"} {needsHistory.length > 0 ? ` (${needsHistory.slice(0, 5).map((row) => row.symbols[0] ?? row.isin).join(", ")}${needsHistory.length > 5 ? "…" : ""})` : ""}.{confirmCount > 0 ? " First check “Needs your confirmation” below: a split, bonus, demerger or IPO may explain it without another file." : ""}</p>
              <p><b>Why:</b> these shares were bought (or sold) outside the uploaded date range, so their real average cost can&rsquo;t be calculated yet.</p>
              <p><b>How:</b> download the tradebooks for the earlier years from Zerodha Console, then click below and select <b>all</b> your tradebook files together (Ctrl-click). Overlapping dates are fine; each trade is counted once.</p>
              <button type="button" className="secondary-action-button" onClick={onAddHistory}>Upload another tradebook</button>
            </div>
          ) : null}

          {hasHistory ? <OverallChart rows={rows} /> : null}

          {rows.length > 0 ? (
            <>
            <div className="table-toolbar">
              <label htmlFor="holding-search" className="visually-hidden">Search stocks</label>
              <input
                id="holding-search"
                type="search"
                placeholder="Search stock or ISIN…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <span>
                {visibleRows.length === rows.length ? `${rows.length} stocks` : `${visibleRows.length} of ${rows.length} stocks`}
              </span>
            </div>
            <div className="position-table-wrap is-sticky">
              <table className="position-table">
                <thead>
                  <tr>
                    <Th tip={COLUMN_TIPS.stock!}>Stock</Th>
                    <Th tip={COLUMN_TIPS.qty!}>Qty</Th>
                    <Th tip={COLUMN_TIPS.zerodhaAvg!}>Zerodha avg cost</Th>
                    <Th tip={COLUMN_TIPS.realAvg!} align="end">Your real avg cost</Th>
                    <Th tip={COLUMN_TIPS.lastPrice!} align="end">Zerodha last price</Th>
                    {hasHistory ? (
                      <>
                        <Th tip={COLUMN_TIPS.profitBooked!} align="end">Profit booked</Th>
                        <Th tip={COLUMN_TIPS.lossBooked!} align="end">Loss booked</Th>
                        <Th tip={COLUMN_TIPS.lossCovered!} align="end">Loss covered</Th>
                        <Th tip={COLUMN_TIPS.currentPnl!} align="end">Current P&amp;L</Th>
                        <Th tip={COLUMN_TIPS.overall!} align="end">Overall</Th>
                        <Th tip={COLUMN_TIPS.toRecover!} align="end">To recover</Th>
                        <Th tip={COLUMN_TIPS.breakEven!} align="end">Break-even price</Th>
                      </>
                    ) : null}
                    <Th tip={COLUMN_TIPS.notes!} align="end">Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr><td colSpan={13}>No stock matches &ldquo;{search}&rdquo;.</td></tr>
                  ) : null}
                  {visibleRows.map((row) => {
                    const note = rowNote(row, hasHistory);
                    return (
                      <tr key={row.isin}>
                        <td><strong>{row.symbols.join(", ") || row.isin}</strong><small className="position-reason">{row.isin}</small></td>
                        <td>{quantity.format(row.brokerQuantity)}</td>
                        <td>{formatMoney(row.brokerAveragePrice)}</td>
                        <td>{formatMoney(row.ledgerAveragePrice)}</td>
                        <td>{formatMoney(row.brokerLastPrice)}</td>
                        {hasHistory ? (
                          <>
                            <td><Signed value={row.lifecycle?.profitBooked} /></td>
                            <td>{row.lifecycle ? <span className={row.lifecycle.lossBooked > 0.005 ? "is-loss" : ""}>{formatMoney(row.lifecycle.lossBooked > 0.005 ? -row.lifecycle.lossBooked : 0)}</span> : "—"}</td>
                            <td>{row.lifecycle ? (row.lifecycle.lossBooked > 0.005 ? formatMoney(row.lifecycle.lossCovered) : "No loss") : "—"}</td>
                            <td><Signed value={row.lifecycle?.unrealizedPnl} /></td>
                            <td><Signed value={row.lifecycle?.overallPnl} /></td>
                            <td>
                              {row.lifecycle ? (
                                row.lifecycle.toRecover > 0 ? (
                                  <span className="is-loss">{formatMoney(row.lifecycle.toRecover)}</span>
                                ) : (
                                  <span className="is-gain">Recovered</span>
                                )
                              ) : "—"}
                            </td>
                            <td>{row.lifecycle ? formatMoney(row.lifecycle.breakEvenPrice) : "—"}</td>
                          </>
                        ) : null}
                        <td><span className={"note-pill is-" + note.tone}>{note.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <p className="home-note">Zerodha returned no holdings for this account.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
