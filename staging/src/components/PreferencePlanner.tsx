import { useMemo, useState, type ReactNode } from "react";
import { institutionLabel } from "../lib/institutions";
import { formatPercent } from "../lib/results";
import type { Programme, ProgrammeResult } from "../types/jupas";

const PRIORITY_SLOTS = ["A1", "A2", "A3", "B1", "B2", "B3"] as const;
const MIN_VISIBLE = 3;

type Props = {
  results: (ProgrammeResult | null)[];
  activeCode?: string;
  onActivate: (code: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (code: string) => void;
  onSetSlotCode?: (slotIndex: number, code: string) => void;
  programmes?: Programme[];
  shareSlot?: ReactNode;
};

export function PreferencePlanner({ results, activeCode, onActivate, onReorder, onRemove, onSetSlotCode, programmes, shareSlot }: Props) {
  const slotResults = Array.from({ length: PRIORITY_SLOTS.length }, (_, i) => results[i] ?? null);
  const extraCount = Math.max(0, results.length - PRIORITY_SLOTS.length);
  const filledCount = results.filter((r): r is ProgrammeResult => r !== null).length;

  const lastFilledIndex = slotResults.reduce(
    (acc, r, i) => (r ? Math.max(acc, i) : acc),
    -1,
  );
  const [extraSlots, setExtraSlots] = useState(0);
  const expandedTarget = Math.min(PRIORITY_SLOTS.length, MIN_VISIBLE + extraSlots);
  const visibleSlotCount = Math.max(
    expandedTarget,
    lastFilledIndex + 1,
    MIN_VISIBLE,
  );
  const visibleSlots = slotResults.slice(0, visibleSlotCount);
  const canAddMore = visibleSlotCount < PRIORITY_SLOTS.length;

  const knownCodes = useMemo(() => new Set((programmes || []).map((p) => p.jupas_code)), [programmes]);
  const programmeByCode = useMemo(() => {
    const m = new Map<string, Programme>();
    for (const p of programmes || []) m.set(p.jupas_code, p);
    return m;
  }, [programmes]);

  const takenCodes = useMemo(
    () => new Set(results.filter((r): r is ProgrammeResult => r !== null).map((r) => r.programme.jupas_code)),
    [results],
  );

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= PRIORITY_SLOTS.length) return;
    onReorder(index, target);
  }

  return (
    <section className="panel preference-planner-panel planner-table-panel" aria-label="A1 to B3 preference planner">
      <div className="planner-heading">
        <p className="eyebrow">Your plan</p>
        <h2>Priority A1–B3</h2>
        <p className="planner-subtitle">
          {filledCount === 0
            ? "Enter JUPAS codes directly, or pick from the programme list below."
            : `${filledCount} / ${visibleSlotCount} priority slot${visibleSlotCount === 1 ? "" : "s"} filled${extraCount ? ` · +${extraCount} below B3` : ""}`}
        </p>
      </div>

      <div className="planner-table-scroll">
        <div className="planner-table" role="table" aria-label="Preference slots">
          <div className="planner-row planner-row-head" role="row">
            <span role="columnheader" className="cell-slot" />
            <span role="columnheader" className="cell-code">Code</span>
            <span role="columnheader" className="cell-inst">Inst</span>
            <span role="columnheader" className="cell-programme">Programme</span>
            <span role="columnheader" className="cell-formula">Method</span>
            <span role="columnheader" className="cell-bench">UQ</span>
            <span role="columnheader" className="cell-bench">Median</span>
            <span role="columnheader" className="cell-bench">LQ</span>
            <span role="columnheader" className="cell-score">Score</span>
            <span role="columnheader" className="cell-quota">Quota</span>
            <span role="columnheader" className="cell-elig">Elig</span>
            <span role="columnheader" className="cell-actions" />
          </div>

          {visibleSlots.map((result, index) => {
            const slot = PRIORITY_SLOTS[index];
            const isActive = !!result && result.programme.jupas_code === activeCode;
            const rowClass = [
              "planner-row",
              result ? "filled" : "empty",
              isActive ? "active" : "",
              result ? `band-${result.band}` : "",
            ].filter(Boolean).join(" ");

            return (
              <div key={slot} className={rowClass} role="row">
                <span className="cell-slot" role="cell">{slot}</span>
                {result ? (
                  <FilledRow result={result} onActivate={onActivate} isActive={isActive} />
                ) : (
                  <EmptyRow
                    slotIndex={index}
                    onSetSlotCode={onSetSlotCode}
                    knownCodes={knownCodes}
                    programmeByCode={programmeByCode}
                    takenCodes={takenCodes}
                  />
                )}
                <span className="cell-actions" role="cell">
                  <button
                    type="button"
                    className="planner-icon-btn"
                    aria-label={`Move ${slot} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >▲</button>
                  <button
                    type="button"
                    className="planner-icon-btn"
                    aria-label={`Move ${slot} down`}
                    disabled={index === visibleSlotCount - 1}
                    onClick={() => move(index, 1)}
                  >▼</button>
                  {result ? (
                    <button
                      type="button"
                      className="planner-icon-btn planner-remove"
                      aria-label={`Remove ${result.programme.jupas_code} from ${slot}`}
                      onClick={() => onRemove(result.programme.jupas_code)}
                    >✕</button>
                  ) : index === visibleSlotCount - 1 && index >= MIN_VISIBLE ? (
                    <button
                      type="button"
                      className="planner-icon-btn planner-remove"
                      aria-label={`Remove empty ${slot} slot`}
                      title={`Remove empty ${slot} slot`}
                      onClick={() => setExtraSlots((n) => Math.max(0, n - 1))}
                    >✕</button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {canAddMore ? (
        <button
          type="button"
          className="planner-add-slot"
          onClick={() => setExtraSlots((n) => n + 1)}
        >
          + Add new selection
        </button>
      ) : null}

      {shareSlot ? <div className="planner-share">{shareSlot}</div> : null}
    </section>
  );
}

function FilledRow({
  result,
  onActivate,
  isActive,
}: {
  result: ProgrammeResult;
  onActivate: (code: string) => void;
  isActive: boolean;
}) {
  const { programme, calculation, eligibility, comparisons } = result;
  const formula =
    (programme.formula_2025 || programme.formula_2026 || "—")
      .replace(/\bsubjects?\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  const byKey = new Map(comparisons.map((c) => [c.key, c]));

  return (
    <>
      <button
        type="button"
        className={"cell-code cell-code-link" + (isActive ? " active" : "")}
        onClick={() => onActivate(programme.jupas_code)}
        aria-pressed={isActive}
        title={`Focus ${programme.jupas_code} in detail panel`}
      >
        {programme.jupas_code}
      </button>
      <span className="cell-inst" role="cell">{institutionLabel(programme.institution)}</span>
      <span className="cell-programme" role="cell" title={programme.name_en}>
        {programme.name_en}
      </span>
      <span className="cell-formula" role="cell" title={programme.formula_2025 || programme.formula_2026 || ""}>
        {formula || "—"}
      </span>
      <BenchCell c={byKey.get("uq")} />
      <BenchCell c={byKey.get("median")} />
      <BenchCell c={byKey.get("lq")} />
      <span className="cell-score" role="cell"><b>{calculation.totalScore.toFixed(2)}</b></span>
      <span className="cell-quota" role="cell">{programme.quota ?? "—"}</span>
      <span className={"cell-elig " + (eligibility.eligible ? "pass" : "fail")} role="cell" title={eligibility.eligible ? "Meets requirements" : "Does not meet requirements"}>
        {eligibility.eligible ? "✓" : "✕"}
      </span>
    </>
  );
}

function BenchCell({ c }: { c?: { score: number; delta: number; percent: number } }) {
  if (!c) return <span className="cell-bench" role="cell">—</span>;
  const cls = c.delta >= 0 ? "delta pos" : "delta neg";
  return (
    <span className="cell-bench" role="cell">
      <b>{c.score.toFixed(1)}</b>
      <small className={cls}>{formatPercent(c.percent)}</small>
    </span>
  );
}

function EmptyRow({
  slotIndex,
  onSetSlotCode,
  knownCodes,
  programmeByCode,
  takenCodes,
}: {
  slotIndex: number;
  onSetSlotCode?: (slotIndex: number, code: string) => void;
  knownCodes: Set<string>;
  programmeByCode: Map<string, Programme>;
  takenCodes: Set<string>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim().toUpperCase();
  const matched = trimmed && knownCodes.has(trimmed) && !takenCodes.has(trimmed) ? programmeByCode.get(trimmed) : undefined;

  function commit() {
    if (!onSetSlotCode || !trimmed) return;
    if (!knownCodes.has(trimmed)) { setError(`No programme ${trimmed}`); return; }
    if (takenCodes.has(trimmed)) { setError(`${trimmed} already added`); return; }
    setError(null);
    setValue("");
    onSetSlotCode(slotIndex, trimmed);
  }

  return (
    <>
      <span className="cell-code" role="cell">
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={8}
          placeholder="JS####"
          className={"slot-input" + (error ? " has-error" : "")}
          value={value}
          onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          aria-label="JUPAS code"
        />
      </span>
      <span className="cell-inst" role="cell">—</span>
      <span className="cell-programme" role="cell">
        {matched ? (
          <span className="empty-row-preview">{matched.name_en} · {matched.institution}</span>
        ) : error ? (
          <span className="empty-row-error">{error}</span>
        ) : (
          <span className="empty-row-hint">Type a JUPAS code, or pick from the list below</span>
        )}
      </span>
      <span className="cell-formula" role="cell">—</span>
      <span className="cell-bench" role="cell">—</span>
      <span className="cell-bench" role="cell">—</span>
      <span className="cell-bench" role="cell">—</span>
      <span className="cell-score" role="cell">—</span>
      <span className="cell-quota" role="cell">—</span>
      <span className="cell-elig" role="cell">
        {matched ? (
          <button type="button" className="slot-input-btn-inline" onClick={commit}>Add</button>
        ) : "—"}
      </span>
    </>
  );
}
