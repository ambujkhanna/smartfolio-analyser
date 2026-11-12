"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { LedgerResult } from "../engine/buildLedger";
import ImportReview from "./ImportReview";
import PortfolioHome from "./PortfolioHome";
import ZerodhaPanel from "./ZerodhaPanel";

/**
 * Page shell: portfolio first (auto-loaded from the connected broker), trade
 * history as a one-time add-on, raw broker data tucked away under "Advanced".
 */
export default function HomeApp() {
  const [ledger, setLedger] = useState<LedgerResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDetailsElement>(null);

  const handleLedgerChange = useCallback((next: LedgerResult | null) => setLedger(next), []);

  const instrumentsMissingHistory = useMemo(
    () => [...new Set((ledger?.errors ?? []).filter((issue) => issue.code === "OVERSELL" && issue.instrumentId).map((issue) => issue.instrumentId as string))],
    [ledger],
  );
  const { positions, booked } = useMemo(() => {
    const missing = new Set(instrumentsMissingHistory);
    let bookedTotal = 0;
    let bookedStocks = 0;
    let bookedSkipped = 0;
    const list = (ledger?.instruments ?? []).map((instrument) => {
      // Lifecycle figures are only trustworthy when this stock's history is complete.
      const complete =
        !missing.has(instrument.instrumentId) &&
        instrument.realizedPnlComplete &&
        instrument.realizedPnl !== null &&
        !instrument.hasUnknownOpeningBasis;
      if (complete && instrument.realizedPnl !== null) {
        if (instrument.netSaleProceeds > 0) {
          bookedTotal += instrument.realizedPnl;
          bookedStocks += 1;
        }
      } else if (instrument.netSaleProceeds > 0 || missing.has(instrument.instrumentId)) {
        bookedSkipped += 1;
      }
      return {
        instrumentId: instrument.instrumentId,
        openQuantity: instrument.openQuantity,
        openCostBasisTotal: instrument.openCostBasisTotal,
        lifecycle:
          complete && instrument.openCostBasisTotal !== null && instrument.realizedPnl !== null
            ? {
                realizedPnl: instrument.realizedPnl,
                realizedGains: instrument.realizedGains,
                realizedLosses: instrument.realizedLosses,
                netInvested:
                  instrument.buyOutflows +
                  instrument.knownOpeningBasis +
                  instrument.standaloneFees -
                  instrument.netSaleProceeds -
                  instrument.dividends,
              }
            : null,
      };
    });
    return { positions: list, booked: { total: bookedTotal, stocks: bookedStocks, skipped: bookedSkipped } };
  }, [ledger, instrumentsMissingHistory]);

  function openHistory() {
    setHistoryOpen(true);
    requestAnimationFrame(() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <>
      <PortfolioHome
        positions={positions}
        hasHistory={Boolean(ledger)}
        instrumentsMissingHistory={instrumentsMissingHistory}
        booked={booked}
        onAddHistory={openHistory}
      />

      <details
        ref={historyRef}
        className="home-section"
        open={historyOpen}
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary>
          <strong>Trade history</strong>
          <span>{ledger ? "Added — open to review or add another file" : "Upload your tradebook once to calculate your real average cost"}</span>
        </summary>
        <ImportReview onLedgerChange={handleLedgerChange} />
      </details>

      <details className="home-section">
        <summary>
          <strong>Advanced</strong>
          <span>Raw Zerodha data (holdings, positions, today&rsquo;s orders and trades)</span>
        </summary>
        <ZerodhaPanel />
      </details>
    </>
  );
}
