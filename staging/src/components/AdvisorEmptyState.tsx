export function AdvisorEmptyState() {
  return (
    <aside className="panel advisor-empty" aria-label="Advisor guidance">
      <p className="eyebrow">Advisor analysis</p>
      <h2>Pick programmes to start analysing</h2>
      <p className="advisor-empty-lede">
        Drop the student's 2026 JUPAS choices into the A1–B3 slots on the left. This panel will
        score the strategy and surface anything worth a closer look.
      </p>

      <h3 className="advisor-empty-heading">What we'll check automatically</h3>
      <ul className="advisor-empty-list">
        <li>Whether each pick passes its 2026 admission requirements at the student's current grades.</li>
        <li>How the calculated 2025-logic score compares against the 2025 LQ / median / UQ benchmarks.</li>
        <li>Whether the A-band leans dream / B-band leans safer, and if a realistic safety choice exists.</li>
        <li>Programmes where the calculated score is far below the 2025 LQ — likely overshoot.</li>
      </ul>

      <p className="advisor-empty-footnote">
        Scores are estimates based on 2025 admission data and 2026 weightings. Final admission depends
        on JUPAS ranking, places, interviews, and competition.
      </p>
    </aside>
  );
}
