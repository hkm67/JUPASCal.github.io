import { AppHeader } from "./AppHeader";
import { buildEditUrlFromCurrentHash } from "../lib/hashState";
import { institutionLabel } from "../lib/institutions";
import { bandLabel, formatDelta, formatPercent } from "../lib/results";
import type { ProgrammeResult } from "../types/jupas";

type Props = {
  profileName: string;
  results: (ProgrammeResult | null)[];
};

export function ShareView({ profileName, results }: Props) {
  const topResults = results.slice(0, 6);
  const resultsNonNull = results.filter((r): r is ProgrammeResult => r !== null);
  const topResultsNonNull = topResults.filter((r): r is ProgrammeResult => r !== null);
  const eligibleCount = resultsNonNull.filter((result) => result.eligibility.eligible).length;
  const bestResult = [...resultsNonNull].sort((a, b) => b.calculation.totalScore - a.calculation.totalScore)[0];

  function handleEdit() {
    window.history.replaceState(null, "", buildEditUrlFromCurrentHash());
    window.location.reload();
  }

  function handleCreate() {
    window.location.href = window.location.origin + window.location.pathname;
  }

  return (
    <div className="share-view">
      <AppHeader />
      <div className="panel share-profile-card">
        <div>
          <p className="eyebrow">Shared JUPAS plan</p>
          <strong>{profileName}</strong>
          <span>{resultsNonNull.length} choices · {eligibleCount} currently eligible</span>
        </div>
        <button type="button" className="ghost-button" onClick={handleEdit}>
          Edit this profile
        </button>
      </div>

      <section className="share-section">
        <div className="share-section-heading">
          <p className="eyebrow">For Instagram / social</p>
          <h1>JUPAS Recap Card</h1>
        </div>
        <div className="recap-card" aria-label="Social sharing recap card">
          <div className="recap-card-top">
            <span>JUPAS Cal 2026</span>
            <b>A1-B3</b>
          </div>
          <div className="recap-hero">
            <p>{profileName}</p>
            <strong>{bestResult ? bestResult.calculation.totalScore.toFixed(2) : "-"}</strong>
            <span>{bestResult ? `${bestResult.programme.jupas_code} · strongest calculated score` : "No programme selected"}</span>
          </div>
          <div className="recap-slots">
            {["A1", "A2", "A3", "B1", "B2", "B3"].map((slot, index) => {
              const result = topResults[index];
              return (
                <div className={result ? "recap-slot filled" : "recap-slot"} key={slot}>
                  <span>{slot}</span>
                  {result ? (
                    <>
                      <strong>{result.programme.jupas_code}</strong>
                      <em>{institutionLabel(result.programme.institution)}</em>
                      <b>{result.calculation.totalScore.toFixed(1)}</b>
                    </>
                  ) : (
                    <em>Open</em>
                  )}
                </div>
              );
            })}
          </div>
          <p className="recap-footnote">Estimated score comparison only. Final admission depends on official requirements, ranking, interviews, places, and competition.</p>
        </div>
      </section>

      <section className="share-section advisor-section">
        <div className="share-section-heading">
          <p className="eyebrow">For teacher / youth worker consultation</p>
          <h1>Advisor Brief</h1>
        </div>
        <div className="advisor-summary">
          <div>
            <span>Total choices</span>
            <strong>{resultsNonNull.length}</strong>
          </div>
          <div>
            <span>Eligibility</span>
            <strong>{eligibleCount}/{resultsNonNull.length} pass listed requirements</strong>
          </div>
          <div>
            <span>Benchmark basis</span>
            <strong>2025 scores · 2026 requirements</strong>
          </div>
        </div>

        <div className="share-results-list">
          {results.map((result, index) => {
          if (!result) return null;
          const { programme, calculation, eligibility } = result;
          return (
            <div className="panel share-result-card" key={programme.jupas_code}>
              <div className="detail-header-main">
                <div className="detail-header-text">
                  <p className="eyebrow">{prioritySlot(index)} · {institutionLabel(programme.institution)} · {programme.jupas_code}</p>
                  <h2>{programme.name_en}</h2>
                  {programme.name_zh ? <p className="zh-name">{programme.name_zh}</p> : null}
                </div>
              </div>
              <div className="detail-badges">
                <span className={eligibility.eligible ? "status pass" : "status fail"}>
                  {eligibility.eligible ? "Eligible" : "Requirements not met"}
                </span>
                <span className={`band ${result.band}`}>{bandLabel(result.band)}</span>
              </div>

              <hr className="grade-section-divider" />

              <div className="score-hero">
                <span>Your calculated score</span>
                <strong>{calculation.totalScore.toFixed(2)}</strong>
                <small>Using {result.hasScoreData ? "2025 scoring logic for benchmark comparison" : "2026 scoring logic for new/no-score programmes"}</small>
              </div>

              <section>
                <h3>2025 Benchmark Comparison</h3>
                {result.comparisons.length > 0 ? (
                  <div className="share-list share-list--benchmark">
                    <div className="share-list-header">
                      <span>Benchmark</span>
                      <span>Score</span>
                      <span>Delta</span>
                      <span>%</span>
                    </div>
                    {result.comparisons.map((comparison) => (
                      <div className={`share-list-row ${comparison.delta >= 0 ? "positive" : "negative"}`} key={comparison.key}>
                        <span className="share-list-label">{comparison.label}</span>
                        <strong>{comparison.score}</strong>
                        <b>{formatDelta(comparison.delta)}</b>
                        <em>{formatPercent(comparison.percent)}</em>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No 2025 LQ/Median/UQ score data is available for this programme.</p>
                )}
              </section>

              <hr className="grade-section-divider" />

              <section>
                <h3>Eligibility Details</h3>
                <div className="share-list share-list--eligibility">
                  <div className="share-list-header">
                    <span>Subject</span>
                    <span>Grade</span>
                    <span>Requirement</span>
                  </div>
                  {eligibility.details.map((detail) => (
                    <div className={`share-list-row ${detail.pass ? "positive" : "negative"}`} key={detail.label}>
                      <span className="share-list-label">{detail.label}</span>
                      <strong>{detail.got || "N/A"}</strong>
                      <span className="share-list-requirement">
                        <em>Need {detail.need || "-"}</em>
                        {detail.note ? <small>{detail.note}</small> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          );
          })}
        </div>
      </section>

      <div className="share-cta">
        <p>Want to calculate your own JUPAS admission score?</p>
        <div className="share-cta-actions">
          <button type="button" className="ghost-button" onClick={handleEdit}>
            Edit shared profile
          </button>
          <button type="button" className="stepper-next-btn" onClick={handleCreate}>
            Start fresh
          </button>
        </div>
      </div>
    </div>
  );
}

function prioritySlot(index: number) {
  return ["A1", "A2", "A3", "B1", "B2", "B3"][index] || `Choice ${index + 1}`;
}
