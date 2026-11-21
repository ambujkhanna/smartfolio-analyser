"use client";

import { rebuyZeroLossPrice, type HeldRecoveryItem, type SoldLossItem } from "../engine/recovery";

/**
 * Recovery tracker — goal: every underperforming stock reaches at least zero loss.
 * Shows zero-loss prices and gaps. Facts and targets only; never a recommendation.
 */
export interface SoldPrice {
  price: number;
  /** True when the exchange is closed and this is the last traded price. */
  stale: boolean;
}

export interface RecoveryTrackerProps {
  held: HeldRecoveryItem[];
  sold: SoldLossItem[];
  prices: Record<string, SoldPrice | null>;
  loadingPrices: boolean;
  /** Kept for compatibility; prices are loaded when the Recovery tab opens. */
  onOpen?: () => void;
}

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const pct = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value * 10) / 10}%`;

export default function RecoveryTracker({ held, sold, prices, loadingPrices }: RecoveryTrackerProps) {
  if (held.length === 0 && sold.length === 0) {
    return (
      <section className="home-section recovery-panel">
        <div className="recovery-body">
          <h2>Recovery tracker</h2>
          <p className="home-note">No stock is below zero overall, and nothing was sold at a net loss (among stocks with complete history).</p>
        </div>
      </section>
    );
  }
  const heldTotal = held.reduce((sum, item) => sum + item.toRecover, 0);
  const soldTotal = sold.reduce((sum, item) => sum + item.netLoss, 0);
  return (
    <section className="home-section recovery-panel" aria-labelledby="recovery-title">
      <div className="recovery-body recovery-head">
        <h2 id="recovery-title">Recovery tracker</h2>
        <span>
          Goal: every stock at least zero loss · {held.length} held below zero ({money.format(heldTotal)} to go) · {sold.length} sold at a loss (
          {money.format(soldTotal)} booked)
        </span>
      </div>
      <div className="recovery-body">

      {held.length > 0 ? (
        <>
          <h3>Stocks you hold that are below zero overall</h3>
          <p className="home-note">Closest to zero loss first. Zero-loss price = your real break-even, including earlier profits and losses on the stock.</p>
          <div className="position-table-wrap">
            <table className="position-table">
              <thead>
                <tr><th>Stock</th><th>Shares</th><th>Price now</th><th>Zero-loss price</th><th>Needs</th><th>Still to recover</th></tr>
              </thead>
              <tbody>
                {held.map((item) => (
                  <tr key={item.instrumentId}>
                    <td><strong>{item.label}</strong></td>
                    <td>{item.quantity}</td>
                    <td>{money.format(item.price)}</td>
                    <td>{money.format(item.zeroLossPrice)}</td>
                    <td className={item.gapPercent <= 5 ? "is-gain" : ""}>{pct(item.gapPercent)}</td>
                    <td className="is-loss">{money.format(item.toRecover)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {sold.length > 0 ? (
        <>
          <h3>Stocks you sold at a net loss</h3>
          <p className="home-note">
            &ldquo;Re-buy check&rdquo; shows what would have to happen to get this stock back to zero overall if you bought the same number of
            shares at today&rsquo;s price. Today&rsquo;s prices come from Upstox (only the ISIN is sent).
            {loadingPrices ? " Loading prices…" : ""}
          </p>
          <div className="position-table-wrap">
            <table className="position-table">
              <thead>
                <tr>
                  <th>Stock</th><th>Booked loss</th><th>Sold</th><th>Your avg buy</th><th>Last sale</th><th>Price now</th><th>Since last sale</th><th>Re-buy check</th>
                </tr>
              </thead>
              <tbody>
                {sold.map((item) => {
                  const quote = prices[item.instrumentId];
                  const now = quote?.price ?? null;
                  const target = now !== null ? rebuyZeroLossPrice(now, item.netLoss, item.soldQuantity) : null;
                  return (
                    <tr key={item.instrumentId}>
                      <td><strong>{item.label}</strong></td>
                      <td className="is-loss">{money.format(-item.netLoss)}</td>
                      <td>{item.soldQuantity} @ {money.format(item.averageSalePrice)}</td>
                      <td>{money.format(item.averageBuyPrice)}</td>
                      <td>{money.format(item.lastSalePrice)}<small className="position-reason">{item.lastSaleDate}</small></td>
                      <td>
                        {now !== null ? money.format(now) : quote === null ? "unavailable" : "—"}
                        {quote?.stale ? <small className="position-reason">last traded price</small> : null}
                      </td>
                      <td className={now !== null && now < item.lastSalePrice ? "is-gain" : ""}>
                        {now !== null && item.lastSalePrice > 0 ? pct(((now - item.lastSalePrice) / item.lastSalePrice) * 100) : "—"}
                      </td>
                      <td>
                        {target !== null && now !== null ? (
                          <>
                            {item.soldQuantity} @ {money.format(now)} → zero loss at <b>{money.format(target)}</b> ({pct(((target - now) / now) * 100)})
                            {now >= item.averageBuyPrice ? <small className="position-reason">price is already above your original buy price</small> : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <p className="home-note">
        Facts and targets only — not a recommendation to buy or sell. Set an alert for any of these under &ldquo;Your alert rules&rdquo;.
      </p>
      </div>
    </section>
  );
}
