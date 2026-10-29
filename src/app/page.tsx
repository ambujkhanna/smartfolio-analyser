import Link from "next/link";
import ImportReview from "../components/ImportReview";
import ZerodhaPanel from "../components/ZerodhaPanel";

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Smartfolio Analyser home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Smartfolio <span className="brand-muted">Analyser</span></span>
        </Link>
        <span className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          Foundation in progress
        </span>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Portfolio clarity starts with trustworthy data</p>
        <h1 id="page-title">
          Understand your portfolio.
          <span> Know what the numbers mean.</span>
        </h1>
        <p className="hero-copy">
          Smartfolio Analyser is being built to explain realized and unrealized
          profit and loss across your complete investment history, including
          partial sales and later re-entry into the same stock.
        </p>
        <div className="notice" role="status">
          <span className="notice-icon" aria-hidden="true">i</span>
          <div>
            <strong>Portfolio calculation preview is available</strong>
            <p>
              You can preview CSV or delimited TXT files, review validation issues, and calculate P&amp;L from accepted rows. Live market values require verified quotes; spreadsheet and PDF imports are not enabled yet. No sample prices or placeholder P&amp;L are displayed.
            </p>
          </div>
        </div>
      </section>

      <section className="principles" aria-labelledby="zerodha-title">
        <div className="section-heading">
          <p className="eyebrow">Broker connection · read-only</p>
          <h2 id="zerodha-title">Connect your Zerodha account</h2>
          <p>Authorize through Zerodha to retrieve available holdings, positions, orders, and trade records. Smartfolio will not place trades.</p>
          <p><Link className="brand" href="/api/zerodha/login">Connect Zerodha securely →</Link></p>
          <p className="hero-copy">Requires server-side Kite Connect credentials and a registered callback URL. The free Personal plan does not include the paid live market-data APIs.</p>
        </div>
      </section>

      <ZerodhaPanel />

      <ImportReview />

      <section className="principles" aria-labelledby="principles-title">
        <div className="section-heading">
          <p className="eyebrow">Built around financial correctness</p>
          <h2 id="principles-title">Clarity over guesswork</h2>
        </div>
        <div className="principle-grid">
          <article className="principle-card">
            <span className="card-index">01</span>
            <h3>No invented prices</h3>
            <p>Missing or invalid market data must stay unavailable, never become a guessed number.</p>
          </article>
          <article className="principle-card">
            <span className="card-index">02</span>
            <h3>Full lifecycle view</h3>
            <p>Earlier realized gains and losses matter even when a position is later reopened.</p>
          </article>
          <article className="principle-card">
            <span className="card-index">03</span>
            <h3>Traceable results</h3>
            <p>Calculations will disclose their method, data source, and any known limitations.</p>
          </article>
        </div>
      </section>

      <footer className="site-footer">
        <span>Smartfolio Analyser</span>
        <span>Accuracy before completeness</span>
      </footer>
    </main>
  );
}
