import { useEffect, useState } from "react";
import { institutionLabel } from "../lib/institutions";
import { bandLabel, formatDelta, formatPercent } from "../lib/results";
import type { SortKey } from "../lib/results";
import type { BenchmarkKey, ProgrammeResult } from "../types/jupas";

type Props = {
  results: ProgrammeResult[];
  selectedCodes: string[];
  selectedResults: ProgrammeResult[];
  activeCode?: string;
  reviewRequest: number;
  sortKey: SortKey;
  sortDirection: "asc" | "desc";
  onFocus: (code: string) => void;
  onPick: (code: string) => void;
  onUnpick: (code: string) => void;
  onReviewSelected: () => void;
  onSortChange: (sortKey: SortKey) => void;
};

export function ResultsView({ results, selectedCodes, selectedResults, activeCode, reviewRequest, sortKey, sortDirection, onFocus, onPick, onUnpick, onReviewSelected, onSortChange }: Props) {
  const [mobileCollapsed, setMobileCollapsed] = useState(false);

  useEffect(() => {
    setMobileCollapsed(false);
  }, [results]);

  useEffect(() => {
    if (reviewRequest > 0 && selectedResults.length) {
      setMobileCollapsed(true);
    }
  }, [reviewRequest, selectedResults.length]);

  function togglePick(code: string) {
    if (selectedCodes.includes(code)) {
      onUnpick(code);
      return;
    }
    onPick(code);
  }

  function reviewSelected() {
    if (!selectedResults.length) return;
    onFocus(activeCode && selectedCodes.includes(activeCode) ? activeCode : selectedResults[0].programme.jupas_code);
    onReviewSelected();
    setMobileCollapsed(true);
  }

  return (
    <section className={mobileCollapsed && selectedResults.length ? "results-panel mobile-collapsed" : "results-panel"} aria-label="Programme results">
      <div className="table-shell">
        <table className="results-table">
          <thead>
            <tr>
              <SortableHeader label="Programme" column="code" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label="Institution" column="institution" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label="Status" column="eligibility" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label="Score" column="score" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label="Band" column="benchmark" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label="LQ" column="lq" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label="Median" column="median" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label="UQ" column="uq" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr
                key={result.programme.jupas_code}
                className={activeCode === result.programme.jupas_code ? "selected" : selectedCodes.includes(result.programme.jupas_code) ? "picked" : ""}
                onClick={() => onFocus(result.programme.jupas_code)}
              >
                <td>
                  <span className="programme-cell-head">
                    <strong>{result.programme.jupas_code}</strong>
                    <PickButton picked={selectedCodes.includes(result.programme.jupas_code)} onClick={() => togglePick(result.programme.jupas_code)} />
                  </span>
                  <span>{result.programme.name_en}</span>
                </td>
                <td>{institutionLabel(result.programme.institution)}</td>
                <td><StatusBadge pass={result.eligibility.eligible} /></td>
                <td>{result.calculation.totalScore.toFixed(2)}</td>
                <td><span className={`band ${result.band}`}>{bandLabel(result.band)}</span></td>
                <DeltaCell result={result} keyName="lq" />
                <DeltaCell result={result} keyName="median" />
                <DeltaCell result={result} keyName="uq" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedResults.length ? (
        <div className="selected-programme-summary">
          <div>
            <span className="card-kicker">{selectedResults.length} programme{selectedResults.length === 1 ? "" : "s"} selected</span>
            <div className="selected-programme-list">
              {selectedResults.map((result) => (
                <button
                  className={activeCode === result.programme.jupas_code ? "selected-programme-pill active" : "selected-programme-pill"}
                  key={result.programme.jupas_code}
                  type="button"
                  onClick={() => onFocus(result.programme.jupas_code)}
                >
                  <span>{institutionLabel(result.programme.institution)} · {result.programme.jupas_code}</span>
                  <strong>{result.programme.name_en}</strong>
                </button>
              ))}
            </div>
            <small>Swipe or use Prev/Next in Step 3 to compare details.</small>
          </div>
          <button className="ghost-button" type="button" onClick={() => setMobileCollapsed(false)}>Edit</button>
        </div>
      ) : null}

      {selectedResults.length ? (
        <div className="selection-tray">
          <div>
            <strong>{selectedResults.length} selected</strong>
            <span>{selectedResults.map((result) => result.programme.jupas_code).join(" · ")}</span>
          </div>
          <button type="button" onClick={reviewSelected}>Review selected</button>
        </div>
      ) : null}

      <div className="result-cards">
        {results.map((result) => (
          <div
            className={activeCode === result.programme.jupas_code ? "mobile-card selected" : selectedCodes.includes(result.programme.jupas_code) ? "mobile-card picked" : "mobile-card"}
            key={result.programme.jupas_code}
          >
            <span className="card-topline">
              <span className="card-focus-button">
                <span className="card-code">{result.programme.jupas_code}</span>
                <span>{institutionLabel(result.programme.institution)}</span>
              </span>
              <StatusBadge pass={result.eligibility.eligible} />
              <PickButton picked={selectedCodes.includes(result.programme.jupas_code)} onClick={() => togglePick(result.programme.jupas_code)} />
            </span>
            <div className="mobile-card-main">
              <strong>{result.programme.name_en}</strong>
              {result.programme.name_zh ? <small className="card-zh">{result.programme.name_zh}</small> : null}
            </div>
            <span className="card-score-row">
              <span>
                <em>Your score</em>
                <b>{result.calculation.totalScore.toFixed(2)}</b>
              </span>
              <span className={`band ${result.band}`}>{bandLabel(result.band)}</span>
            </span>
            <span className="card-benchmarks">
              <BenchmarkChip result={result} benchmarkKey="lq" label="LQ" />
              <BenchmarkChip result={result} benchmarkKey="median" label="Median" />
              <BenchmarkChip result={result} benchmarkKey="uq" label="UQ" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PickButton({ picked, onClick }: { picked: boolean; onClick: () => void }) {
  return (
    <button
      className={picked ? "pick-button picked" : "pick-button"}
      type="button"
      aria-label={picked ? "Remove from comparison" : "Add to comparison"}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {picked ? "✓" : ""}
    </button>
  );
}

function SortableHeader({
  label,
  column,
  sortKey,
  sortDirection,
  onSortChange,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDirection: "asc" | "desc";
  onSortChange: (sortKey: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th>
      <button className={active ? "sort-header active" : "sort-header"} type="button" onClick={() => onSortChange(column)}>
        {label}
        <span>{active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function DeltaCell({ result, keyName }: { result: ProgrammeResult; keyName: "lq" | "median" | "uq" }) {
  const comparison = result.comparisons.find((item) => item.key === keyName);
  const positive = comparison && comparison.delta >= 0;
  return (
    <td className={comparison ? (positive ? "positive" : "negative") : "muted"}>
      {comparison ? (
        <>
          <strong>{formatDelta(comparison.delta)}</strong>
          <span>{formatPercent(comparison.percent)}</span>
        </>
      ) : "-"}
    </td>
  );
}

function StatusBadge({ pass }: { pass: boolean }) {
  return <span className={pass ? "status pass" : "status fail"}>{pass ? "Eligible" : "Check req."}</span>;
}

function BenchmarkChip({ result, benchmarkKey, label }: { result: ProgrammeResult; benchmarkKey: BenchmarkKey; label: string }) {
  const comparison = result.comparisons.find((item) => item.key === benchmarkKey);
  const positive = comparison ? comparison.delta >= 0 : false;
  return (
    <span className={!comparison ? "benchmark-chip muted" : positive ? "benchmark-chip positive" : "benchmark-chip negative"}>
      <em>{label}</em>
      <strong>{comparison ? comparison.score.toFixed(2) : "-"}</strong>
      <b>{comparison ? formatDelta(comparison.delta) : "-"}</b>
    </span>
  );
}
