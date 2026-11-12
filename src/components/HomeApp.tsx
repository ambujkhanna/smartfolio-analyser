"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { buildLedger, netInvestedFor, type LedgerResult } from "../engine/buildLedger";
import type { KiteHolding } from "../engine/reconcileHoldings";
import type { CanonicalTransaction } from "../domain/transaction";
import { KITE_TRADES_SOURCE, kiteTradesToTransactions } from "../importers/kiteTrades";
import {
  EMPTY_HISTORY,
  clearHistory,
  dateRange,
  fromBackup,
  loadHistory,
  mergeTransactions,
  needsBackup,
  removeTransactions,
  saveHistory,
  toBackup,
  type SavedHistory,
} from "../lib/tradeStore";
import ImportReview from "./ImportReview";
import CorporateActionsPanel from "./CorporateActionsPanel";
import { analyseCorporateActions, type HoldingQuantity } from "../engine/corporateActions";
import PortfolioHome from "./PortfolioHome";
import ZerodhaPanel from "./ZerodhaPanel";

/**
 * Page shell: portfolio first (auto-loaded from the connected broker), trade
 * history as a one-time add-on, raw broker data tucked away under "Advanced".
 */
export default function HomeApp() {
  const [saved, setSaved] = useState<SavedHistory>(EMPTY_HISTORY);
  const [storeStatus, setStoreStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [storeMessage, setStoreMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDetailsElement>(null);
  const portfolioRef = useRef<HTMLDivElement>(null);
  const connectedRef = useRef(false);
  const savedRef = useRef<SavedHistory>(EMPTY_HISTORY);
  const syncedHoldingsRef = useRef<unknown>(null);
  const [holdingQuantities, setHoldingQuantities] = useState<HoldingQuantity[] | null>(null);

  const persist = useCallback(async (next: SavedHistory) => {
    savedRef.current = next;
    setSaved(next);
    try {
      await saveHistory(next);
    } catch {
      setStoreMessage("Could not save in this browser (storage blocked or full). Download a backup.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadHistory()
      .then((history) => {
        if (cancelled) return;
        savedRef.current = history;
        setSaved(history);
        setStoreStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStoreStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Adds trades to the saved history (duplicates ignored) and persists it in this browser. */
  const addTrades = useCallback(async (incoming: CanonicalTransaction[], extra: Partial<SavedHistory> = {}) => {
    const { merged, added } = mergeTransactions(savedRef.current.transactions, incoming);
    const next: SavedHistory = {
      ...savedRef.current,
      ...extra,
      dismissed: savedRef.current.dismissed,
      names: savedRef.current.names,
      lastBackupAt: savedRef.current.lastBackupAt,
      transactions: merged,
      updatedAt: added > 0 ? new Date().toISOString() : savedRef.current.updatedAt,
    };
    savedRef.current = next;
    setSaved(next);
    try {
      await saveHistory(next);
    } catch {
      setStoreMessage("Could not save in this browser (storage blocked or full). Results stay until you close the page; download a backup.");
    }
    return added;
  }, []);

  const handleConnectedChange = useCallback((connected: boolean) => {
    connectedRef.current = connected;
  }, []);

  const handleTransactionsImported = useCallback(
    async (transactions: CanonicalTransaction[]) => {
      if (transactions.length === 0) return;
      const added = await addTrades(transactions);
      setStoreMessage(
        added > 0
          ? `Saved ${added} new trade${added === 1 ? "" : "s"} in this browser. You won't need to upload these again.`
          : "All trades in this file were already saved.",
      );
      // The useful result is the portfolio table (real cost, booked, to recover).
      if (connectedRef.current) {
        setHistoryOpen(false);
        requestAnimationFrame(() => portfolioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    },
    [addTrades],
  );

  /** After Zerodha holdings load: fetch today's trades and save them. */
  const handleHoldingsLoaded = useCallback(
    async (holdings: KiteHolding[]) => {
      if (syncedHoldingsRef.current === holdings) return;
      syncedHoldingsRef.current = holdings;
      setHoldingQuantities(
        holdings.flatMap((holding) =>
          typeof holding.isin === "string"
            ? [{
                isin: holding.isin.toUpperCase(),
                symbol: typeof holding.tradingsymbol === "string" ? holding.tradingsymbol : undefined,
                quantity: (typeof holding.quantity === "number" ? holding.quantity : 0) + (typeof holding.t1_quantity === "number" ? holding.t1_quantity : 0),
                ...(typeof holding.last_price === "number" && holding.last_price > 0 ? { lastPrice: holding.last_price } : {}),
                ...(typeof holding.average_price === "number" && holding.average_price > 0 ? { averagePrice: holding.average_price } : {}),
              }]
            : [],
        ),
      );
      try {
        const response = await fetch("/api/zerodha/data?type=trades", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { data?: { data?: unknown } };
        const trades = Array.isArray(payload.data?.data) ? (payload.data?.data as unknown[]) : [];

        const isinBySymbol = new Map<string, string>();
        for (const holding of holdings) {
          if (typeof holding.tradingsymbol === "string" && typeof holding.isin === "string") {
            isinBySymbol.set(holding.tradingsymbol.toUpperCase(), holding.isin.toUpperCase());
          }
        }
        // Symbols not in holdings (e.g. fully sold today) are matched against the public instrument master.
        let conversion = kiteTradesToTransactions(trades, isinBySymbol);
        if (conversion.unknownSymbols.length > 0) {
          const resolveResponse = await fetch("/api/instruments/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              references: conversion.unknownSymbols.slice(0, 100).map((item) => ({ symbol: item.symbol, exchange: item.exchange })),
            }),
          }).catch(() => null);
          if (resolveResponse?.ok) {
            const resolved = (await resolveResponse.json()) as {
              results?: Array<{ index: number; resolution: { status: string; instrument?: { isin?: string } } }>;
            };
            for (const item of resolved.results ?? []) {
              const symbol = conversion.unknownSymbols[item.index]?.symbol;
              const isin = item.resolution.status === "resolved" ? item.resolution.instrument?.isin : undefined;
              if (symbol && isin) isinBySymbol.set(symbol, isin.toUpperCase());
            }
            conversion = kiteTradesToTransactions(trades, isinBySymbol);
          }
        }
        const added = await addTrades(conversion.transactions, { lastZerodhaSyncAt: new Date().toISOString() });
        if (added > 0) setStoreMessage(`Added ${added} trade${added === 1 ? "" : "s"} from today's Zerodha activity.`);
        if (conversion.unknownSymbols.length > 0) {
          setStoreMessage(
            `Couldn't identify ${conversion.unknownSymbols.map((item) => item.symbol).join(", ")} from today's trades; upload this month's tradebook to include them.`,
          );
        }
      } catch {
        // Daily sync is best-effort; the quantity check shows any gap.
      }
    },
    [addTrades],
  );

  async function downloadBackup() {
    const blob = new Blob([toBackup(savedRef.current)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smartfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    await persist({ ...savedRef.current, lastBackupAt: new Date().toISOString() });
    setStoreMessage("Backup downloaded. Keep the file somewhere safe (e.g. a cloud drive).");
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed = fromBackup(await file.text());
    if (typeof parsed === "string") {
      setStoreMessage(parsed);
      return;
    }
    const added = await addTrades(parsed.transactions, {
      lastZerodhaSyncAt: savedRef.current.lastZerodhaSyncAt ?? parsed.lastZerodhaSyncAt,
    });
    await persist({
      ...savedRef.current,
      dismissed: [...new Set([...savedRef.current.dismissed, ...parsed.dismissed])],
      names: { ...parsed.names, ...savedRef.current.names },
    });
    setStoreMessage(`Restored backup: ${added} trade${added === 1 ? "" : "s"} added (${parsed.transactions.length - added} already saved).`);
  }

  async function deleteSaved() {
    if (!window.confirm("Delete all trades saved in this browser? Download a backup first if you may need them. This cannot be undone.")) return;
    try {
      await clearHistory();
    } catch {
      // Fall through: the in-memory copy is cleared either way.
    }
    savedRef.current = EMPTY_HISTORY;
    setSaved(EMPTY_HISTORY);
    setStoreMessage("Saved trades deleted from this browser.");
  }

  const ledger: LedgerResult | null = useMemo(
    () => (saved.transactions.length > 0 ? buildLedger(saved.transactions) : null),
    [saved.transactions],
  );
  const namesMap = useMemo(() => new Map(Object.entries(saved.names)), [saved.names]);
  const suggestions = useMemo(
    () =>
      saved.transactions.length > 0 || holdingQuantities
        ? analyseCorporateActions(saved.transactions, holdingQuantities, new Set(saved.dismissed), namesMap)
        : [],
    [saved.transactions, saved.dismissed, holdingQuantities, namesMap],
  );
  const adjustments = saved.transactions.filter((transaction) => transaction.source.fileName === "Your confirmation");
  const symbolOf = useMemo(() => {
    const map = new Map<string, string>(namesMap);
    for (const transaction of saved.transactions) {
      if (transaction.instrumentId && transaction.symbol) map.set(transaction.instrumentId, transaction.symbol);
      for (const child of transaction.demerger?.children ?? []) if (child.symbol && !map.has(child.instrumentId)) map.set(child.instrumentId, child.symbol);
    }
    for (const holding of holdingQuantities ?? []) if (holding.symbol) map.set(holding.isin, holding.symbol);
    return map;
  }, [saved.transactions, holdingQuantities, namesMap]);
  const labelOf = useCallback(
    (id: string) => {
      const known = symbolOf.get(id);
      if (known) return known;
      // No public name: rights entitlements / partly-paid shares (…20… ISINs), funds (INF…), others.
      if (/^INE[A-Z0-9]{9}$/.test(id) && id.slice(7, 9) === "20") return `Rights/partly-paid · ${id}`;
      if (id.startsWith("INF")) return `Fund/ETF · ${id}`;
      if (/^IN[A-Z0-9]{9}[0-9]$/.test(id)) return `Unnamed stock · ${id}`;
      return id;
    },
    [symbolOf],
  );
  const unbacked = storeStatus === "ready" && needsBackup(saved);
  useEffect(() => {
    if (!unbacked) return;
    // Browsers show their own standard "Leave site?" text; custom messages aren't allowed.
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unbacked]);

  // Stocks saved without a symbol and not in current holdings: look up the symbol by ISIN
  // (only the ISIN is sent) and remember it, so nothing is shown as a bare INE… code.
  const lookedUpRef = useRef(new Set<string>());
  useEffect(() => {
    if (storeStatus !== "ready") return;
    const missing = [...new Set(saved.transactions.map((transaction) => transaction.instrumentId ?? ""))].filter(
      (id) => /^IN[A-Z0-9]{9}[0-9]$/.test(id) && !symbolOf.has(id) && !lookedUpRef.current.has(id),
    );
    if (missing.length === 0) return;
    missing.forEach((id) => lookedUpRef.current.add(id));
    void (async () => {
      const found: Record<string, string> = {};
      for (let offset = 0; offset < missing.length; offset += 100) {
        const batch = missing.slice(offset, offset + 100);
        const response = await fetch("/api/instruments/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ references: batch.map((isin) => ({ isin })) }),
        }).catch(() => null);
        if (!response?.ok) continue;
        const payload = (await response.json().catch(() => null)) as {
          results?: Array<{ index: number; resolution: { status: string; instrument?: { symbol?: string; displayName?: string }; candidates?: Array<{ symbol?: string }> } }>;
        } | null;
        for (const item of payload?.results ?? []) {
          const isin = batch[item.index];
          const instrument = item.resolution.instrument ?? item.resolution.candidates?.[0];
          const name = instrument?.symbol ?? (item.resolution.instrument?.displayName);
          if (isin && name) found[isin] = name.toUpperCase();
        }
      }
      if (Object.keys(found).length > 0) {
        await persist({ ...savedRef.current, names: { ...savedRef.current.names, ...found } });
      }
    })();
  }, [storeStatus, saved.transactions, symbolOf, persist]);

  async function applyAdjustment(transaction: CanonicalTransaction) {
    const added = await addTrades([transaction]);
    setStoreMessage(added > 0 ? "Adjustment saved. Figures updated." : "That adjustment was already saved.");
  }
  async function undoAdjustment(transactionId: string) {
    await persist({ ...savedRef.current, transactions: removeTransactions(savedRef.current.transactions, new Set([transactionId])), updatedAt: new Date().toISOString() });
    setStoreMessage("Adjustment removed.");
  }
  async function dismissSuggestion(id: string) {
    await persist({ ...savedRef.current, dismissed: [...new Set([...savedRef.current.dismissed, id])], updatedAt: new Date().toISOString() });
  }

  const range = dateRange(saved.transactions);
  const fromZerodha = saved.transactions.filter((transaction) => transaction.source.fileName === KITE_TRADES_SOURCE).length;

  const instrumentsMissingHistory = useMemo(
    () => [...new Set((ledger?.errors ?? []).filter((issue) => issue.code === "OVERSELL" && issue.instrumentId).map((issue) => issue.instrumentId as string))],
    [ledger],
  );
  const { positions, booked } = useMemo(() => {
    const missing = new Set(instrumentsMissingHistory);
    let bookedTotal = 0;
    let bookedStocks = 0;
    let bookedSkipped = 0;
    let closedBooked = 0;
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
          if (instrument.openQuantity <= 1e-9) closedBooked += instrument.realizedPnl;
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
                netInvested: netInvestedFor(instrument),
              }
            : null,
      };
    });
    return { positions: list, booked: { total: bookedTotal, stocks: bookedStocks, skipped: bookedSkipped, closedTotal: closedBooked } };
  }, [ledger, instrumentsMissingHistory]);

  function openHistory() {
    setHistoryOpen(true);
    requestAnimationFrame(() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <>
      {unbacked ? (
        <div className="backup-banner" role="status">
          <span>
            <b>New changes aren&rsquo;t in a backup yet.</b> They are saved in this browser, but clearing browser data or
            switching computer would lose them.
          </span>
          <button type="button" className="secondary-action-button" onClick={() => void downloadBackup()}>
            Download backup
          </button>
        </div>
      ) : null}
      <div ref={portfolioRef}>
        <PortfolioHome
          positions={positions}
          hasHistory={Boolean(ledger)}
          instrumentsMissingHistory={instrumentsMissingHistory}
          booked={booked}
          onAddHistory={openHistory}
          onConnectedChange={handleConnectedChange}
          onHoldingsLoaded={handleHoldingsLoaded}
          confirmCount={suggestions.length}
        />
      </div>

      <CorporateActionsPanel
        suggestions={suggestions}
        adjustments={adjustments}
        instruments={(ledger?.instruments ?? []).map((instrument) => ({ instrumentId: instrument.instrumentId, label: labelOf(instrument.instrumentId) }))}
        labelOf={labelOf}
        onApply={(transaction) => void applyAdjustment(transaction)}
        onDismiss={(id) => void dismissSuggestion(id)}
        onUndo={(id) => void undoAdjustment(id)}
      />

      <section className="home-section saved-history" aria-label="Saved trade history">
        <div>
          <strong>Saved in this browser</strong>
          <span>
            {storeStatus === "loading"
              ? "Loading…"
              : storeStatus === "unavailable"
                ? "This browser can't save data (private window or storage blocked). Upload your tradebook each visit, or use a normal window."
                : saved.transactions.length === 0
                  ? "Nothing saved yet. Upload your tradebook files once; they are kept only on this computer."
                  : `${saved.transactions.length} trades${range ? ` · ${range.from} to ${range.to}` : ""}${fromZerodha ? ` · ${fromZerodha} added automatically from Zerodha` : ""}${saved.lastZerodhaSyncAt ? ` · last Zerodha check ${new Date(saved.lastZerodhaSyncAt).toLocaleString()}` : ""}`}
          </span>
          {storeMessage ? <small role="status">{storeMessage}</small> : null}
        </div>
        <div className="saved-history-actions">
          <button type="button" className="secondary-action-button" onClick={() => void downloadBackup()} disabled={saved.transactions.length === 0}>
            Download backup
          </button>
          <label className="secondary-action-button" htmlFor="restore-backup">
            Restore backup
            <input id="restore-backup" type="file" accept=".json,application/json" hidden onChange={(event) => void restoreBackup(event)} />
          </label>
          <button type="button" className="link-button" onClick={() => void deleteSaved()} disabled={saved.transactions.length === 0}>
            Delete saved data
          </button>
        </div>
      </section>

      <details
        ref={historyRef}
        className="home-section"
        open={historyOpen}
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary>
          <strong>Trade history</strong>
          <span>{ledger ? "Saved — results are in the portfolio table above. Open to add more files or see calculation details" : "Upload your tradebook once to calculate your real average cost"}</span>
        </summary>
        <ImportReview onTransactionsImported={handleTransactionsImported} />
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
