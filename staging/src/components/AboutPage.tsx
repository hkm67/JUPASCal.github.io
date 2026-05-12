export function AboutPage() {
  return (
    <main className="about-page">
      <header className="about-page-topbar">
        <a className="about-page-back" href="./">
          ← Back to calculator
        </a>
        <a className="about-page-brand" href="./" aria-label="JUPASCal — home">
          <span className="app-brand-name">JUPASCal <span className="app-brand-year">2026</span></span>
        </a>
      </header>

      <article className="about-page-body">
        <p className="eyebrow">About</p>
        <h1>JUPAS Cal</h1>
        <p className="about-lede">
          An unofficial DSE admissions score calculator for comparing programmes
          and historical score benchmarks across Hong Kong universities.
        </p>

        <section className="about-section">
          <h2>How scores work</h2>
          <p>
            JUPAS Cal applies the 2025 scoring logic where available so your
            calculated scores are directly comparable to the most recent
            admission-score baselines. Eligibility checks use 2026 entrance
            requirements published by each institution.
          </p>
        </section>

        <section className="about-section">
          <h2>Disclaimer</h2>
          <p>
            For reference only. Always verify final admission requirements with
            official university and JUPAS sources before making decisions.
          </p>
        </section>

        <section className="about-section">
          <h2>Source &amp; contributions</h2>
          <p>
            JUPASCal is open source. View the code, file an issue, or contribute on{" "}
            <a className="about-link" href="https://github.com/JUPASCal/JUPASCal.github.io" target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            .
          </p>
        </section>

        <section className="about-section">
          <h2>More to come</h2>
          <p>
            This page is a placeholder. Methodology notes, data sources,
            credits and contact details will be added here.
          </p>
        </section>
      </article>
    </main>
  );
}
