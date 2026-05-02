import { Fragment, useEffect, useRef, useState } from "react";
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
  const [auditOpen, setAuditOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const result = results.find((item) => item.programme.jupas_code === activeCode) || results[0];

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const update = () => {
      // Desktop: panel scrolls internally
      if (panel.scrollTop > 0) { setIsStuck(true); return; }
      // Mobile: page scrolls — use -8px tolerance so scrollIntoView (which lands at 0)
      // doesn't prematurely trigger the minimal header state
      setIsStuck(panel.getBoundingClientRect().top < -8);
    };
    panel.addEventListener("scroll", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      panel.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update);
    };
  }, []);
  const activeIndex = result ? results.findIndex((item) => item.programme.jupas_code === result.programme.jupas_code) : -1;

  useEffect(() => {
    setAuditOpen(false);
  }, [result?.programme.jupas_code]);

  const prevReviewRequest = useRef(0);

  useEffect(() => {
    if (reviewRequest > prevReviewRequest.current) {
      prevReviewRequest.current = reviewRequest;
      if (result) {
        const timer = window.setTimeout(() => {
          panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
        }, 320);
        return () => window.clearTimeout(timer);
      }
    }
  }, [reviewRequest, result]);

  if (!result) {
    return (
      <aside className="panel detail-panel empty" ref={panelRef}>
        <div className="panel-heading">
          <div className="step-title-content">
            <p className="eyebrow">Step 3</p>
            <h2>Select a programme</h2>
          </div>
        </div>
        <p>Choose one or more programmes to compare details, eligibility, score construction, and 2025 benchmark deltas.</p>
      </aside>
    );
  }

  const { programme, calculation, eligibility } = result;

  function moveActive(direction: 1 | -1) {
    if (results.length <= 1 || activeIndex < 0) return;
    const nextIndex = (activeIndex + direction + results.length) % results.length;
    onActiveCodeChange(results[nextIndex].programme.jupas_code);
  }

  return (
    <div className="detail-layout">
      <nav className="programme-menu" aria-label="Selected programmes">
        <p className="programme-menu-heading">Programme List ({results.length})</p>
        {results.map((r, i) => (
          <Fragment key={r.programme.jupas_code}>
            {i > 0 && <hr className="programme-menu-divider" />}
            <button
              type="button"
              className={r.programme.jupas_code === result.programme.jupas_code ? "programme-menu-item active" : "programme-menu-item"}
              onClick={() => onActiveCodeChange(r.programme.jupas_code)}
            >
              <span className="programme-menu-code">{r.programme.jupas_code}</span>
              <span className="programme-menu-name">{r.programme.name_en}</span>
              <span className="programme-menu-bottom">
                <b className="programme-menu-score-value">{r.calculation.totalScore.toFixed(2)}</b>
                <span className="programme-menu-tags">
                  <span className={r.eligibility.eligible ? "status pass mini" : "status fail mini"}>
                    {r.eligibility.eligible ? "Eligible" : "Ineligible"}
                  </span>
                  <span className={`band mini ${r.band}`}>{bandLabel(r.band)}</span>
                </span>
              </span>
            </button>
          </Fragment>
        ))}
      </nav>

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
        <div className="detail-picker">
          <button className="ghost-button" type="button" disabled={results.length <= 1} onClick={() => moveActive(-1)} aria-label="Previous">
            <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="20" y1="7" x2="2" y2="7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <polyline points="8,1 2,7 8,13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span>{activeIndex + 1} / {results.length}</span>
          <button className="ghost-button" type="button" disabled={results.length <= 1} onClick={() => moveActive(1)} aria-label="Next">
            <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="2" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <polyline points="14,1 20,7 14,13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className={isStuck ? "detail-header is-stuck" : "detail-header"}>
          <div className="detail-header-main">
            <div className="detail-header-text">
              <p className="eyebrow">{institutionLabel(programme.institution)} · {programme.jupas_code}</p>
              <h2>{programme.name_en}</h2>
              {programme.name_zh ? <p className="zh-name">{programme.name_zh}</p> : null}
            </div>
            <button className="remove-button" type="button" onClick={() => onRemove(programme.jupas_code)} aria-label="Remove programme">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19,6l-1,14H6L5,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10,11v6M14,11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M9,6V4h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
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

        <hr className="grade-section-divider" />

        <section>
          <h3>Eligibility Details</h3>
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
        </section>

        <hr className="grade-section-divider" />

        <section>
          <h3>Formula & Weighting</h3>

          <section className={auditOpen ? "collapsible-section open" : "collapsible-section"}>
            <button className="collapsible-trigger" type="button" onClick={() => setAuditOpen(!auditOpen)}>
              <span className="collapsible-title-group">
                <span>Calculation Details</span>
              </span>
              <svg className="collapsible-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="3,5 8,11 13,5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="collapsible-body">
              <div className="audit-list">
                {[...calculation.allCandidates].sort((a, b) => Number(b.used) - Number(a.used) || b.weightedScore - a.weightedScore).map((candidate) => (
                  <div className={candidate.used ? "audit-row used" : "audit-row"} key={`${candidate.subject}-${candidate.grade}-${candidate.weightedScore}`}>
                    <div className="audit-row-top">
                      <span className="audit-subject">
                        <strong>{shortSubjectName(candidate.subject)}</strong>
                        <small>{candidate.isCompulsory ? "Compulsory" : candidate.isBonus ? candidate.bonusValue || "Bonus" : candidate.isBestOfPool ? "Best-of pool" : candidate.used ? "Selected" : "Not counted"}</small>
                      </span>
                      <span className="audit-total"><em>Score</em><b>{candidate.weightedScore.toFixed(2)}</b></span>
                    </div>
                    <div className="audit-row-bottom">
                      <span className="audit-metric"><em>Grade</em><b>{candidate.grade}</b></span>
                      <span className="audit-metric"><em>Base</em><b>{candidate.basePoints.toFixed(1)}</b></span>
                      <span className="audit-metric"><em>Weight</em><b>{candidate.isBonus && candidate.bonusValue?.includes("%") ? candidate.bonusValue : `x${candidate.multiplier}`}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

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
      </aside>
    </div>
  );
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
          <hr className="weight-divider" />
          <button className={weightsOpen ? "weight-toggle open" : "weight-toggle"} type="button" onClick={() => setWeightsOpen(!weightsOpen)}>
            Weighting details
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polyline points="3,5 8,11 13,5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className={weightsOpen ? "weight-cloud" : "weight-cloud collapsed"}>
            {Object.entries(weights).map(([subject, weight]) => (
              <span key={subject} className="weight-item">
                <span>{shortSubjectName(subject)}</span>
                <span>x{weight}</span>
              </span>
            ))}
            {pools.map((pool, index) => (
              <span key={index} className="weight-item">
                <span>Best {pool.count}: {pool.subjects.map(shortSubjectName).join("/")}</span>
                <span>x{pool.weight}</span>
              </span>
            ))}
          </div>
        </>
      ) : <em className="muted">No special subject weighting parsed.</em>}
    </div>
  );
}
