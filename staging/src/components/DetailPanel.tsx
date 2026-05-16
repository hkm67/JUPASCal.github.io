import { Fragment, useEffect, useRef, useState } from "react";
import { institutionLabel } from "../lib/institutions";
import { bandLabel, formatDelta, formatPercent } from "../lib/results";
import { shortSubjectName } from "../lib/subjects";
import type { CandidateScore, EligibilityDetail, OfferStatistic, Programme, ProgrammeResult } from "../types/jupas";

type Props = {
  results: (ProgrammeResult | null)[];
  activeCode?: string;
  reviewRequest: number;
  onActiveCodeChange: (code: string) => void;
  onRemove: (code: string) => void;
};

export function DetailPanel({ results, activeCode, reviewRequest, onActiveCodeChange, onRemove }: Props) {
  const [auditOpen, setAuditOpen] = useState(false);
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [showPassedReqs, setShowPassedReqs] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const resultsNonNull = results.filter((r): r is ProgrammeResult => r !== null);
  const result = resultsNonNull.find((item) => item.programme.jupas_code === activeCode) || resultsNonNull[0];

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
  const activeIndex = result ? resultsNonNull.findIndex((item) => item.programme.jupas_code === result.programme.jupas_code) : -1;

  useEffect(() => {
    setAuditOpen(false);
  }, [result?.programme.jupas_code]);

  useEffect(() => {
    setEligibilityOpen(result ? !result.eligibility.eligible : false);
    setShowPassedReqs(false);
  }, [result?.eligibility.eligible, result?.programme.jupas_code]);

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
    if (resultsNonNull.length <= 1 || activeIndex < 0) return;
    const nextIndex = (activeIndex + direction + resultsNonNull.length) % resultsNonNull.length;
    onActiveCodeChange(resultsNonNull[nextIndex].programme.jupas_code);
  }

  return (
    <div className="detail-layout">
      <nav className="programme-menu" aria-label="Selected programmes">
        <p className="programme-menu-heading">Programme List ({resultsNonNull.length})</p>
        {results.map((r, i) => (
          <Fragment key={i}>
            {i > 0 && <hr className="programme-menu-divider" />}
            {!r ? (
              <div className="programme-menu-item empty-slot" data-code={`empty-${i}`}>
                <span className="programme-menu-code"><span className="selected-slot-badge">{prioritySlot(i)}</span>---</span>
                <span className="programme-menu-name muted">Empty Slot</span>
              </div>
            ) : (
              <button
                type="button"
                data-code={r.programme.jupas_code}
                className={r.programme.jupas_code === result.programme.jupas_code ? "programme-menu-item active" : "programme-menu-item"}
                onClick={() => onActiveCodeChange(r.programme.jupas_code)}
              >
                <span className="programme-menu-code"><span className="selected-slot-badge">{prioritySlot(i)}</span>{r.programme.jupas_code}</span>
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
            )}
          </Fragment>
        ))}
      </nav>

      <aside
        ref={panelRef}
        className="panel detail-panel"
      >
        {resultsNonNull.length > 1 ? (
          <>
            <button
              type="button"
              className="detail-edge-tap detail-edge-tap-prev"
              onClick={() => moveActive(-1)}
              aria-label="Previous programme"
            >
              <svg width="14" height="22" viewBox="0 0 14 22" fill="none" aria-hidden="true">
                <polyline points="10,3 2,11 10,19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              type="button"
              className="detail-edge-tap detail-edge-tap-next"
              onClick={() => moveActive(1)}
              aria-label="Next programme"
            >
              <svg width="14" height="22" viewBox="0 0 14 22" fill="none" aria-hidden="true">
                <polyline points="4,3 12,11 4,19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </>
        ) : null}
        <div className="detail-picker">
          <button className="ghost-button" type="button" disabled={results.length <= 1} onClick={() => moveActive(-1)} aria-label="Previous">
            <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="20" y1="7" x2="2" y2="7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <polyline points="8,1 2,7 8,13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span><em>{prioritySlot(activeIndex)}</em>{activeIndex + 1} / {results.length}</span>
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
              <p className="eyebrow">{prioritySlot(activeIndex)} · {institutionLabel(programme.institution)} · {programme.jupas_code}</p>
              <h2 title={programme.name_en}>{programme.name_en}</h2>
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
            {isNewProgramme(result) ? (
              <span className="status new">2026 new programme</span>
            ) : (
              <span className={`band ${result.band}`}>{bandLabel(result.band)}</span>
            )}
            {programme.quota ? (
              <span className="status neutral">Quota: {programme.quota}</span>
            ) : null}
            {programme.scores_2025?.score_type === "estimated" ? <span className="status warn">Estimated benchmark</span> : null}
          </div>
        </div>

        <section className={`score-context band-${result.band}`}>
          <div
            className={"score-context-header" + (auditOpen ? " expanded" : "")}
            role="button"
            tabIndex={0}
            aria-expanded={auditOpen}
            aria-label={auditOpen ? "Hide subject breakdown" : "Show subject breakdown"}
            onClick={() => setAuditOpen(!auditOpen)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setAuditOpen((v) => !v);
              }
            }}
          >
            <div className="score-context-line">
              <div className="score-context-score">
                <em>Your score</em>
                <strong>{calculation.totalScore.toFixed(2)}</strong>
              </div>
              <span className={`band ${result.band}`}>{bandLabel(result.band)}</span>
            </div>
            <p className="score-context-note">
              {isNewProgramme(result)
                ? null
                : result.hasScoreData
                  ? "Compared against 2025 admission scores"
                  : "No 2025 admission data — comparing against 2026 logic only"}
              <span className="score-context-tap">
                {auditOpen ? "Hide" : "Tap to see"} subject breakdown
                <svg className={"collapsible-chevron" + (auditOpen ? " open" : "")} width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <polyline points="3,5 8,11 13,5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </p>
            {auditOpen ? (
              <AuditRows
                candidates={calculation.allCandidates}
                formula={programme.formula_2025 || programme.formula_2026 || null}
              />
            ) : null}
          </div>
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

        <EligibilityBlock
          eligible={eligibility.eligible}
          details={eligibility.details}
          desktopOpen={eligibilityOpen}
          showPassed={showPassedReqs}
          onToggleDesktopOpen={() => setEligibilityOpen(!eligibilityOpen)}
          onTogglePassed={() => setShowPassedReqs((v) => !v)}
        />

        <hr className="grade-section-divider" />

        <section>
          <div className="formula-year-grid">
            {isNewProgramme(result) ? null : (
              <FormulaBlock
                label="2025 comparison logic"
                note="Used to compare your score against 2025 admission benchmarks."
                formula={programme.formula_2025}
                weights={programme.subject_weights_2025 || {}}
                pools={programme.best_of_weights_2025 || []}
              />
            )}
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

        <OffersBlock programme={programme} />

        <ProgrammeExtraInfoCard programme={programme} />

        <OfficialLinksCard programme={programme} />
      </aside>
    </div>
  );
}

function ProgrammeExtraInfoCard({ programme }: { programme: Programme }) {
  const [open, setOpen] = useState(false);
  const desc = programme.short_description?.trim() || "";
  const tuition = (programme.tuition_fee_first_year || "").trim();
  const tuitionFull = (programme.tuition_fee_full_text || "").trim();
  const contacts = (programme.contacts_text || "").trim();
  const studyLevel = (programme.study_level || "").trim();
  const remarks = (programme.remarks || "").trim();

  const sections: Array<{ key: string; label: string; value: string; multiline?: boolean }> = [];
  if (desc) sections.push({ key: "desc", label: "Overview", value: desc, multiline: true });
  if (studyLevel) sections.push({ key: "level", label: "Study level", value: studyLevel });
  if (tuition) {
    const extra = tuitionFull && tuitionFull !== tuition ? tuitionFull : "";
    sections.push({ key: "fee", label: "First year tuition", value: tuition + (extra ? `\n${extra}` : ""), multiline: !!extra });
  }
  if (contacts) sections.push({ key: "contacts", label: "Contacts", value: contacts, multiline: true });
  if (remarks && remarks !== "--") sections.push({ key: "remarks", label: "Remarks", value: remarks, multiline: true });

  if (sections.length === 0) return null;

  return (
    <section className="extra-info-card formula-card">
      <div className="extra-info-eyebrow">
        <span>More information</span>
        <b className="extra-info-tally">{sections.length} section{sections.length === 1 ? "" : "s"}</b>
      </div>

      <hr className="weight-divider" />
      <button
        type="button"
        className={"weight-toggle" + (open ? " open" : "")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide" : "Show"} programme details
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <polyline points="3,5 8,11 13,5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open ? (
        <div className="extra-info-body">
          {sections.map((s) => (
            <div key={s.key} className="extra-info-row">
              <em>{s.label}</em>
              <span className={s.multiline ? "extra-info-value multiline" : "extra-info-value"}>
                {s.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OfficialLinksCard({ programme }: { programme: Programme }) {
  const instSite = (programme.programme_websites || []).find(Boolean) || null;
  const jupasUrl = programme.jupas_url || `https://www.jupas.edu.hk/en/programme/${programme.institution.toLowerCase()}/${programme.jupas_code}`;

  return (
    <section className="formula-card official-card">
      <span>Official Pages</span>
      <div className="official-links">
        <a
          className="official-link"
          href={jupasUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <strong>Official JUPAS page</strong>
          <em>{programme.jupas_code} · {institutionLabel(programme.institution)}</em>
        </a>
        {instSite ? (
          <a
            className="official-link"
            href={instSite}
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>Programme website</strong>
            <em>{shortenUrl(instSite)}</em>
          </a>
        ) : (
          <span className="official-link disabled" title="No institution programme page on record">
            <strong>Programme website</strong>
            <em>Not on record</em>
          </span>
        )}
      </div>
    </section>
  );
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname : "");
  } catch {
    return url;
  }
}

function AuditRows({ candidates, formula }: { candidates: CandidateScore[]; formula?: string | null }) {
  const sorted = [...candidates].sort(
    (a, b) => Number(b.used) - Number(a.used) || b.weightedScore - a.weightedScore
  );
  const used = sorted.filter((c) => c.used);

  return (
    <div className="score-audit" onClick={(event) => event.stopPropagation()}>
      <p className="score-audit-method">
        <em>Method</em>
        <span>{formula || "Best subjects"}</span>
        <b>{used.length} of {sorted.length} counted</b>
      </p>
      <ol className="audit-rows" aria-label="Subject score breakdown">
        {sorted.map((candidate) => {
            const tag = candidate.isCompulsory
              ? "Compulsory"
              : candidate.isBonus
                ? candidate.bonusValue || "Bonus"
                : candidate.isBestOfPool
                  ? "Best-of pool"
                  : candidate.used
                    ? "Selected"
                    : "Not counted";
            const weightLabel =
              candidate.isBonus && candidate.bonusValue?.includes("%")
                ? candidate.bonusValue
                : `× ${candidate.multiplier}`;
            return (
              <li
                key={`${candidate.subject}-${candidate.grade}-${candidate.weightedScore}`}
                className={"audit-cell " + (candidate.used ? "used" : "unused")}
              >
                <span className="audit-cell-subject">
                  <strong>{shortSubjectName(candidate.subject)}</strong>
                  <small>{tag}</small>
                </span>
                <span className="audit-cell-grade">
                  <em>Grade</em>
                  <b>{candidate.grade}</b>
                </span>
                <span className="audit-cell-calc">
                  <em>Weight</em>
                  <b>{candidate.basePoints.toFixed(1)} {weightLabel}</b>
                </span>
                <span className="audit-cell-score">
                  <em>Score</em>
                  <b>{candidate.weightedScore.toFixed(2)}</b>
                </span>
              </li>
            );
          })}
        </ol>
    </div>
  );
}

function OffersBlock({ programme }: { programme: Programme }) {
  const [open, setOpen] = useState(false);
  const stats = programme.offer_statistics || [];

  const appsByYear = new Map<number, OfferStatistic>();
  const offersByYear = new Map<number, OfferStatistic>();
  for (const row of stats) {
    if (!row.Year || row.Year === 0) continue;
    if (row.Type === "Application") appsByYear.set(row.Year, row);
    else if (row.Type === "Offer") offersByYear.set(row.Year, row);
  }
  const years = Array.from(new Set([...offersByYear.keys(), ...appsByYear.keys()])).sort((a, b) => b - a);
  if (years.length === 0) return null;

  const latestYear = years[0];
  const latestApps = (appsByYear.get(latestYear)?.["Band A"] as number | undefined) ?? 0;
  const latestOffers = (offersByYear.get(latestYear)?.["Band A"] as number | undefined) ?? 0;
  const latestRate = latestApps > 0 ? (latestOffers / latestApps) * 100 : null;

  let competition: string | null = null;
  if (latestOffers > 0 && latestApps > 0) {
    const ratio = latestApps / latestOffers;
    if (ratio >= 1.5) {
      competition = `≈ ${ratio.toFixed(1)} Band A applicants competing for each offer`;
    } else if (ratio >= 0.9) {
      competition = "Roughly one Band A applicant per offer — admissions reach Band B and below";
    } else {
      competition = "Fewer Band A applicants than offers — admissions draw from lower bands";
    }
  } else if (latestOffers === 0 && latestApps > 0) {
    competition = `No Band A offers in ${latestYear} — all offers went to lower bands`;
  }

  return (
    <section className="offers-card formula-card">
      <div className="offers-card-eyebrow">
        <span>Band A offers · {latestYear}</span>
        {latestRate !== null ? (
          <b className="offers-tally">{latestRate.toFixed(1)}% rate</b>
        ) : null}
      </div>
      <p className="formula-text">
        {latestOffers} of {latestApps.toLocaleString()} Band A applicants got offers
      </p>
      {competition ? <small>{competition}</small> : null}

      <hr className="weight-divider" />
      <button
        type="button"
        className={"weight-toggle" + (open ? " open" : "")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide" : "Show"} {years.length}-year history
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <polyline points="3,5 8,11 13,5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open ? (
        <div className="offers-body">
          <div className="offers-table" role="table" aria-label="Band A offer history by year">
            <div className="offers-table-head" role="row">
              <span role="columnheader">Year</span>
              <span role="columnheader">Band A apps</span>
              <span role="columnheader">Offers</span>
              <span role="columnheader">Rate</span>
            </div>
            {years.map((year) => {
              const appN = (appsByYear.get(year)?.["Band A"] as number | undefined) ?? 0;
              const offerN = (offersByYear.get(year)?.["Band A"] as number | undefined) ?? 0;
              const rate = appN > 0 ? (offerN / appN) * 100 : null;
              return (
                <div className="offers-table-row" role="row" key={year}>
                  <span role="cell" className="offers-table-year">{year}</span>
                  <span role="cell" className="offers-table-cell"><b>{appN}</b></span>
                  <span role="cell" className="offers-table-cell"><b>{offerN}</b></span>
                  <span role="cell" className="offers-table-cell accent">
                    <b>{rate !== null ? `${rate.toFixed(1)}%` : "—"}</b>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EligibilityBlock({
  eligible,
  details,
  desktopOpen,
  showPassed,
  onToggleDesktopOpen,
  onTogglePassed,
}: {
  eligible: boolean;
  details: EligibilityDetail[];
  desktopOpen: boolean;
  showPassed: boolean;
  onToggleDesktopOpen: () => void;
  onTogglePassed: () => void;
}) {
  const failed = details.filter((d) => !d.pass);
  const passed = details.filter((d) => d.pass);
  const sorted = [...failed, ...passed];
  const visibleRows = eligible || showPassed ? sorted : failed;

  const toggleLabel = eligible
    ? `${desktopOpen ? "Hide" : "Show"} ${details.length} requirement checks`
    : `${desktopOpen ? "Hide" : "Show"} ${visibleRows.length} unmet item${visibleRows.length === 1 ? "" : "s"}`;

  return (
    <section
      className={"eligibility-card formula-card" + (eligible ? " all-passed" : " has-unmet")}
      data-all-passed={eligible ? "true" : "false"}
    >
      <div className="eligibility-card-eyebrow">
        <span>Eligibility</span>
        <b className={"eligibility-block-tally " + (eligible ? "good" : "bad")}>
          {eligible
            ? `${details.length}/${details.length} pass`
            : `${failed.length}/${details.length} unmet`}
        </b>
      </div>

      <hr className="weight-divider" />
      <button
        type="button"
        className={"weight-toggle" + (desktopOpen ? " open" : "")}
        aria-expanded={desktopOpen}
        onClick={onToggleDesktopOpen}
      >
        {toggleLabel}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <polyline points="3,5 8,11 13,5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className={"eligibility-body" + (desktopOpen ? " desktop-open" : "")}>
        <ol className="eligibility-rows" aria-label="Admission requirement checks">
          {visibleRows.map((detail) => (
            <li key={detail.label} className={"eligibility-cell " + (detail.pass ? "pass" : "fail")}>
              <span className="eligibility-cell-mark" aria-hidden="true">
                {detail.pass ? "✓" : "✕"}
              </span>
              <span className="eligibility-cell-subject">{detail.label}</span>
              <span className="eligibility-cell-have">
                {detail.got?.toLowerCase() === "none" ? null : <em>Have</em>}
                <b>{detail.got || "N/A"}</b>
              </span>
              <span className="eligibility-cell-need">
                <em>Need</em>
                <b>{detail.need || "—"}</b>
              </span>
              {detail.note ? <span className="eligibility-cell-note">{detail.note}</span> : null}
            </li>
          ))}
        </ol>

        {!eligible && passed.length > 0 ? (
          <button type="button" className="eligibility-passed-toggle" onClick={onTogglePassed}>
            {showPassed
              ? `Hide ${passed.length} passed requirement${passed.length === 1 ? "" : "s"}`
              : `Show ${passed.length} passed requirement${passed.length === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function isNewProgramme(result: ProgrammeResult): boolean {
  // A programme is "new for 2026" when JUPAS has published it but has no
  // 2025 admissions data on record yet: no Application/Offer rows in
  // offer_statistics, AND no 2025 score figures.
  const stats = result.programme.offer_statistics || [];
  const hasHistorical = stats.some((s) => s.Type === "Application" || s.Type === "Offer");
  if (hasHistorical) return false;
  const s = result.programme.scores_2025 || {};
  const anyScore =
    (s as { median?: number | null }).median != null ||
    (s as { lq?: number | null }).lq != null ||
    (s as { uq?: number | null }).uq != null ||
    (s as { mean?: number | null }).mean != null;
  return !anyScore;
}

function prioritySlot(index: number) {
  if (index < 3) return `A${index + 1}`;
  if (index < 6) return `B${index - 2}`;
  if (index < 10) return `C${index - 5}`;
  if (index < 15) return `D${index - 9}`;
  if (index < 20) return `E${index - 14}`;
  return `Choice ${index + 1}`;
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
