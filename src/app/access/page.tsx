import { safeNextPath } from "../../lib/siteAccess";

export const dynamic = "force-dynamic";

export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : "/");
  const failed = params.error === "1";
  return (
    <main className="page-shell">
      <section className="home-card access-card" aria-labelledby="access-title">
        <p className="eyebrow">Private app</p>
        <h1 id="access-title">Enter your access code</h1>
        <p className="home-lead">
          Smartfolio is private. Enter the access code once; this browser remembers it for a year.
        </p>
        <form method="post" action="/api/access" className="access-form">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="access-code">Access code</label>
          <input id="access-code" name="code" type="password" autoComplete="current-password" required autoFocus />
          {failed ? <p className="import-error" role="alert">That code didn&rsquo;t match. Try again.</p> : null}
          <button type="submit" className="calculate-button">Continue</button>
        </form>
      </section>
    </main>
  );
}
