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

  const positions = useMemo(
    () =>
      (ledger?.instruments ?? []).map((instrument) => ({
        instrumentId: instrument.instrumentId,
        openQuantity: instrument.openQuantity,
        openCostBasisTotal: instrument.openCostBasisTotal,
      })),
    [ledger],
  );
  const instrumentsMissingHistory = useMemo(
    () => [...new Set((ledger?.errors ?? []).filter((issue) => issue.code === "OVERSELL" && issue.instrumentId).map((issue) => issue.instrumentId as string))],
    [ledger],
  );

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
