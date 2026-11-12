import Link from "next/link";
import HomeApp from "../components/HomeApp";
import { getBuildInfo } from "../lib/buildInfo";

export default function HomePage() {
  const build = getBuildInfo();
  return (
    <main className="page-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Smartfolio Analyser home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Smartfolio <span className="brand-muted">Analyser</span></span>
        </Link>
        <span className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          Personal preview
        </span>
      </header>

      <section className="hero hero-compact" aria-labelledby="page-title">
        <h1 id="page-title">
          Your real cost and profit,
          <span> across every buy, sell and re-buy.</span>
        </h1>
        <p className="hero-copy">
          Connect your broker to see your holdings, then add your trade history once to see your true average cost.
          Smartfolio never invents prices: anything it can&rsquo;t verify is shown as unavailable.
        </p>
      </section>

      <HomeApp />

      <details className="home-section">
        <summary>
          <strong>How Smartfolio calculates</strong>
          <span>No invented prices · full lifecycle view · traceable results</span>
        </summary>
        <div className="principle-grid">
          <article className="principle-card">
            <span className="card-index">01</span>
            <h3>No invented prices</h3>
            <p>Missing or invalid market data stays unavailable; it never becomes a guessed number.</p>
          </article>
          <article className="principle-card">
            <span className="card-index">02</span>
            <h3>Full lifecycle view</h3>
            <p>Earlier realized gains and losses still count when a position is later reopened.</p>
          </article>
          <article className="principle-card">
            <span className="card-index">03</span>
            <h3>Traceable results</h3>
            <p>Every figure says where it came from: Zerodha, your trade history, or a verified quote.</p>
          </article>
        </div>
      </details>

      <footer className="site-footer">
        <span>Smartfolio Analyser</span>
        <span>Accuracy before completeness</span>
        <span title={build.branch ? `Branch: ${build.branch}` : undefined}>
          Build <code>{build.shortCommit}</code> · {build.environment}
        </span>
      </footer>
    </main>
  );
}
