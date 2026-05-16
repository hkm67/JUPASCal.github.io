import type { ProgrammeResult } from "../types/jupas";

type Props = {
  results: ProgrammeResult[];
};

export function StrategySummary({ results }: Props) {
  if (results.length === 0) return null;

  const eligibleCount = results.filter((r) => r.eligibility.eligible).length;
  const ineligibleCount = results.length - eligibleCount;
  const aboveMedianCount = results.filter((r) => r.band === "above-uq" || r.band === "above-median").length;
  const belowLqCount = results.filter((r) => r.band === "below-lq").length;
  const noScoreCount = results.filter((r) => r.band === "no-score").length;
  const bBandResults = results.slice(3, 6).filter((r): r is ProgrammeResult => !!r);
  const hasSafety = bBandResults.some((r) => r.band === "above-uq" || r.band === "above-median");

  const signals: Array<{ key: string; label: string; value: string; tone: "good" | "warn" | "neutral" }> = [
    {
      key: "eligibility",
      label: "Eligibility",
      value: `${eligibleCount}/${results.length} pass requirements`,
      tone: ineligibleCount === 0 ? "good" : ineligibleCount >= results.length / 2 ? "warn" : "neutral",
    },
    {
      key: "above-median",
      label: "Above 2025 median",
      value: `${aboveMedianCount}/${results.length} choices`,
      tone: aboveMedianCount === 0 ? "warn" : "neutral",
    },
    {
      key: "below-lq",
      label: "Far below 2025 LQ",
      value: `${belowLqCount} likely overshoot`,
      tone: belowLqCount === 0 ? "good" : belowLqCount >= 2 ? "warn" : "neutral",
    },
    {
      key: "safety",
      label: "B-band safety",
      value: hasSafety
        ? "Has a realistic safer choice"
        : bBandResults.length === 0
          ? "B-band still empty"
          : "No realistic B-band safety",
      tone: hasSafety ? "good" : "warn",
    },
  ];

  return (
    <section className="panel strategy-summary" aria-label="Strategy summary">
      <div className="strategy-heading">
        <p className="eyebrow">Advisor read</p>
        <h2>Strategy snapshot</h2>
      </div>
      <ul className="strategy-grid">
        {signals.map((signal) => (
          <li key={signal.key} className={`strategy-cell tone-${signal.tone}`}>
            <span className="strategy-label">{signal.label}</span>
            <strong className="strategy-value">{signal.value}</strong>
          </li>
        ))}
      </ul>
      {noScoreCount > 0 ? (
        <p className="strategy-footnote">
          {noScoreCount} pick{noScoreCount === 1 ? "" : "s"} use 2026 logic only — no 2025 benchmark available.
        </p>
      ) : null}
    </section>
  );
}
