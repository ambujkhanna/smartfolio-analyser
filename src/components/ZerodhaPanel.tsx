"use client";

import { useState } from "react";

type DataType = "holdings" | "positions" | "orders" | "trades";

interface Result {
  source?: string;
  type?: DataType;
  retrievedAt?: string;
  data?: unknown;
  error?: string;
  reauthorize?: boolean;
}

const options: { type: DataType; label: string }[] = [
  { type: "holdings", label: "Holdings" },
  { type: "positions", label: "Positions" },
  { type: "orders", label: "Orders (today)" },
  { type: "trades", label: "Trades (today)" },
];

export default function ZerodhaPanel() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState<DataType | "disconnect" | null>(null);

  async function load(type: DataType) {
    setLoading(type);
    setResult(null);
    try {
      const response = await fetch(`/api/zerodha/data?type=${type}`, { cache: "no-store" });
      const payload = (await response.json()) as Result;
      setResult(payload);
    } catch {
      setResult({ error: "Unable to reach Smartfolio. Please retry." });
    } finally {
      setLoading(null);
    }
  }

  async function disconnect() {
    setLoading("disconnect");
    try {
      await fetch("/api/zerodha/logout", { method: "POST" });
      setResult({ error: "Zerodha session disconnected from this browser." });
    } catch {
      setResult({ error: "Unable to clear the local session. Please retry." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="principles" aria-labelledby="zerodha-data-title">
      <div className="section-heading">
        <p className="eyebrow">Read-only broker data</p>
        <h2 id="zerodha-data-title">Fetch Zerodha account data</h2>
        <p>Connect first, then request the available data. Orders and trades are current-day endpoints, not a complete historical ledger.</p>
      </div>
      <div className="principle-grid">
        {options.map((option) => (
          <article className="principle-card" key={option.type}>
            <h3>{option.label}</h3>
            <button type="button" onClick={() => void load(option.type)} disabled={loading !== null}>
              {loading === option.type ? "Fetching…" : `Fetch ${option.label}`}
            </button>
          </article>
        ))}
      </div>
      <p><button type="button" onClick={() => void disconnect()} disabled={loading !== null}>{loading === "disconnect" ? "Disconnecting…" : "Disconnect this browser session"}</button></p>
      {result && (
        <div className="notice" role="status" aria-live="polite">
          {result.error ? <p>{result.error}{result.reauthorize ? " Please reconnect to Zerodha." : ""}</p> : (
            <>
              <strong>{result.type} response</strong>
              {result.retrievedAt && <p>Retrieved at {new Date(result.retrievedAt).toLocaleString()}</p>}
              <pre style={{ overflowX: "auto", maxHeight: "28rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result.data, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </section>
  );
}
