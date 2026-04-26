import { useEffect, useRef, useState } from "react";
import { institutionLabel } from "../lib/institutions";
import { bandLabel, formatDelta, formatPercent } from "../lib/results";
import { shortSubjectName } from "../lib/subjects";
import type { ProgrammeResult } from "../types/jupas";

type Props = {
  results: ProgrammeResult[];
  activeCode?: string;
  reviewRequest: number;
  onActiveCodeChange: (code: string) => void;
  onRemove: (code: string) => void;
};

export function DetailPanel({ results, activeCode, reviewRequest, onActiveCodeChange, onRemove }: Props) {
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const result = results.find((item) => item.programme.jupas_code === activeCode) || results[0];
  const activeIndex = result ? results.findIndex((item) => item.programme.jupas_code === result.programme.jupas_code) : -1;

  useEffect(() => {
    setEligibilityOpen(Boolean(result && !result.eligibility.eligible));
    setAuditOpen(false);
  }, [result?.programme.jupas_code, result?.eligibility.eligible]);

  useEffect(() => {
    if (!reviewRequest || !result) return;
    const timer = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [reviewRequest, result]);

  if (!result) {
    return (
      <aside className="panel detail-panel empty" ref={panelRef}>
        <p className="eyebrow">Step 3</p>
        <h2>Select a programme</h2>
        <p>Choose one or more programmes to compare details, eligibility, score construction, and 2025 benchmark deltas.</p>
      </aside>
    );
  }

  const { programme, calculation, eligibility } = result;

  return (
    <aside
      ref={panelRef}
      className="panel detail-panel"
      onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        if (touchStartX === null) return;
        const delta = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) > 45) {
          moveActive(delta < 0 ? 1 : -1);
        }
        setTouchStartX(null);
      }}
    >
      <div className="detail-header">
        <p className="eyebrow">{institutionLabel(programme.institution)} · {programme.jupas_code}</p>
        <h2>{programme.name_en}</h2>
        {programme.name_zh ? <p className="zh-name">{programme.name_zh}</p> : null}
        <div className="detail-picker">
          <button className="ghost-button" type="button" disabled={results.length <= 1} onClick={() => moveActive(-1)}>Prev</button>
          <span>
            {activeIndex + 1} / {results.length} picked
            {results.length > 1 ? <em>Swipe left/right to compare</em> : null}
          </span>
          <button className="ghost-button" type="button" disabled={results.length <= 1} onClick={() => moveActive(1)}>Next</button>
          <button className="ghost-button" type="button" onClick={() => onRemove(programme.jupas_code)}>Remove</button>
        </div>
        <div className="detail-badges">
          <span className={eligibility.eligible ? "status pass" : "status fail"}>{eligibility.eligible ? "Eligible" : "Requirements not met"}</span>
          <span className={`band ${result.band}`}>{bandLabel(result.band)}</span>
          {programme.scores_2025?.score_type === "estimated" ? <span className="status warn">Estimated benchmark</span> : null}
        </div>
      </div>

      <div className="score-hero">
        <span>Your calculated score</span>
        <strong>{calculation.totalScore.toFixed(2)}</strong>
        <small>Using {result.hasScoreData ? "2025 scoring logic for benchmark comparison" : "2026 scoring logic for new/no-score programmes"}</small>
      </div>

      <section>
        <h3>2025 Benchmark Comparison</h3>
        {result.comparisons.length ? (
          <div className="benchmark-grid">
            {result.comparisons.map((comparison) => (
              <div className={comparison.delta >= 0 ? "benchmark-card positive-card" : "benchmark-card negative-card"} key={comparison.key}>
                <span>{comparison.label}</span>
                <strong>{comparison.score}</strong>
                <small>
                  <b>{formatDelta(comparison.delta)}</b>
                  <em>{formatPercent(comparison.percent)}</em>
                </small>
              </div>
            ))}
          </div>
        ) : <p className="muted">No 2025 LQ/Median/UQ score data is available for this programme.</p>}
      </section>

      <section>
        <h3>Formula & Weighting</h3>
        <div className="formula-year-grid">
          <FormulaBlock
            label="2025 comparison logic"
            note="Used to compare your score against 2025 admission benchmarks."
            formula={programme.formula_2025}
            weights={programme.subject_weights_2025 || {}}
            pools={programme.best_of_weights_2025 || []}
          />
          <FormulaBlock
            label="2026 applicant reference"
            note="Current-year formula/weighting may differ; check this when making choices."
            formula={programme.formula_2026}
            weights={programme.subject_weights_2026 || {}}
            pools={programme.best_of_weights_2026 || []}
          />
        </div>
        {programme.scores_2025?.score_type === "estimated" ? (
          <p className="warning">HKBU median and LQ scores are estimated from subject grade breakdowns and may be slightly conservative.</p>
        ) : null}
      </section>

      <section className={eligibilityOpen ? "collapsible-section open" : "collapsible-section"}>
        <button className="collapsible-trigger" type="button" onClick={() => setEligibilityOpen(!eligibilityOpen)}>
          <span>Eligibility Details</span>
          <strong>{eligibility.eligible ? "Passed" : "Action needed"}</strong>
          <em>{eligibilityOpen ? "Hide" : "Show"}</em>
        </button>
        <div className="collapsible-body">
          <div className="eligibility-grid">
            {eligibility.details.map((detail) => (
              <div className={detail.pass ? "eligibility-tile pass" : "eligibility-tile fail"} key={detail.label}>
                <span>{detail.label}</span>
                <strong>{detail.got || "N/A"}</strong>
                <small>Need {detail.need || "-"}</small>
                {detail.note ? <em>{detail.note}</em> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={auditOpen ? "collapsible-section open" : "collapsible-section"}>
        <button className="collapsible-trigger" type="button" onClick={() => setAuditOpen(!auditOpen)}>
          <span>Calculation Details</span>
          <em>{auditOpen ? "Hide" : "Show"}</em>
        </button>
        <div className="collapsible-body">
          <div className="audit-list">
            {[...calculation.allCandidates].sort((a, b) => Number(b.used) - Number(a.used) || b.weightedScore - a.weightedScore).map((candidate) => (
              <div className={candidate.used ? "audit-row used" : "audit-row"} key={`${candidate.subject}-${candidate.grade}-${candidate.weightedScore}`}>
                <span className="audit-subject">
                  <strong>{shortSubjectName(candidate.subject)}</strong>
                  <small>{candidate.isCompulsory ? "Compulsory" : candidate.isBonus ? candidate.bonusValue || "Bonus" : candidate.isBestOfPool ? "Best-of pool" : candidate.used ? "Selected" : "Not counted"}</small>
                </span>
                <span className="audit-metric"><em>Grade</em><b>{candidate.grade}</b></span>
                <span className="audit-metric"><em>Base</em><b>{candidate.basePoints.toFixed(1)}</b></span>
                <span className="audit-metric"><em>Weight</em><b>{candidate.isBonus && candidate.bonusValue?.includes("%") ? candidate.bonusValue : `x${candidate.multiplier}`}</b></span>
                <span className="audit-total"><em>Score</em><b>{candidate.weightedScore.toFixed(2)}</b></span>
              </div>
            ))}
          </div>
        </div>
      </section>

    </aside>
  );

  function moveActive(direction: 1 | -1) {
    if (results.length <= 1 || activeIndex < 0) return;
    const nextIndex = (activeIndex + direction + results.length) % results.length;
    onActiveCodeChange(results[nextIndex].programme.jupas_code);
  }
}

function FormulaBlock({
  label,
  note,
  formula,
  weights,
  pools,
}: {
  label: string;
  note: string;
  formula?: string | null;
  weights: Record<string, number>;
  pools: Array<{ count: number; subjects: string[]; weight: number }>;
}) {
  const hasWeights = Object.keys(weights).length > 0 || pools.length > 0;
  const [weightsOpen, setWeightsOpen] = useState(false);
  const weightCount = Object.keys(weights).length + pools.length;

  return (
    <div className="formula-card">
      <span>{label}</span>
      <p className="formula-text">{formula || "Formula not available"}</p>
      <small>{note}</small>
      {hasWeights ? (
        <>
          <button className="weight-toggle" type="button" onClick={() => setWeightsOpen(!weightsOpen)}>
            {weightsOpen ? "Hide weighting details" : `Show ${weightCount} weighting ${weightCount === 1 ? "item" : "items"}`}
          </button>
          <div className={weightsOpen ? "weight-cloud" : "weight-cloud collapsed"}>
            {Object.entries(weights).map(([subject, weight]) => <span key={subject}>{shortSubjectName(subject)} x{weight}</span>)}
            {pools.map((pool, index) => <span key={index}>Best {pool.count}: {pool.subjects.map(shortSubjectName).join("/")} x{pool.weight}</span>)}
          </div>
        </>
      ) : <em className="muted">No special subject weighting parsed.</em>}
    </div>
  );
}
