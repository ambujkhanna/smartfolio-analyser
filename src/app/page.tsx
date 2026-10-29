import Link from "next/link";

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
            <strong>Analysis is not available yet</strong>
            <p>
              Transaction import, accounting calculations, and verified market
              data are still being implemented. No sample prices or placeholder
              portfolio values are shown.
            </p>
          </div>
        </div>
      </section>

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
