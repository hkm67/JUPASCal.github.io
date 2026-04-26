import type { BenchmarkBand } from "../types/jupas";
import type { Filters } from "../lib/results";
import { institutionLabel } from "../lib/institutions";

type Props = {
  filters: Filters;
  open: boolean;
  institutions: string[];
  total: number;
  shown: number;
  selectedCount: number;
  onFiltersChange: (filters: Filters) => void;
  onOpenChange: (open: boolean) => void;
  onReviewSelected: () => void;
  onResetSelected: () => void;
};

const bands: Array<BenchmarkBand | "all"> = ["all", "above-uq", "above-median", "above-lq", "below-lq", "no-score"];

export function FiltersBar({ filters, open, institutions, total, shown, selectedCount, onFiltersChange, onOpenChange, onReviewSelected, onResetSelected }: Props) {
  const activeFilterCount = filters.institutions.length + Number(filters.eligibleOnly) + Number(filters.band !== "all");

  return (
    <div className={open ? "filters-sticky-group filters-open" : "filters-sticky-group"}>
      <div className="filters-topline">
        <div className="filters-title">
          <p className="eyebrow">Step 2</p>
          <h2>Compare Programmes</h2>
          <p>{shown} of {total} programmes shown</p>
        </div>
        <div className="filters-controls">
          <label className="search-field">
            <span>Programme search</span>
            <input
              value={filters.query}
              placeholder="science, sci, business, JS1001..."
              onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
            />
          </label>
          <button
            className={open ? "filter-toggle active" : "filter-toggle"}
            type="button"
            aria-expanded={open}
            aria-controls="programme-filter-panel"
            onClick={() => onOpenChange(!open)}
          >
            Filters{activeFilterCount ? ` ${activeFilterCount}` : ""}
          </button>
          {selectedCount ? (
            <span className="selection-actions">
              <button className="reset-selected-button" type="button" onClick={onResetSelected}>
                Reset
              </button>
              <button className="review-selected-button" type="button" onClick={onReviewSelected}>
                Review {selectedCount}
              </button>
            </span>
          ) : null}
        </div>
      </div>

      <section
        id="programme-filter-panel"
        className={open ? "filters-panel" : "filters-panel mobile-closed"}
        aria-label="Programme filters"
      >
        <div className="institution-filter-group" aria-label="Institution filter">
          <button
            className={filters.institutions.length === 0 ? "pill institution-reset active" : "pill institution-reset"}
            type="button"
            onClick={() => onFiltersChange({ ...filters, institutions: [] })}
          >
            All institutions
          </button>
          <div className="institution-pills">
            {institutions.map((institution) => (
              <button
                key={institution}
                className={filters.institutions.includes(institution) ? "pill active" : "pill"}
                type="button"
                onClick={() => onFiltersChange({ ...filters, institutions: toggleInstitution(filters.institutions, institution) })}
              >
                {institutionLabel(institution)}
              </button>
            ))}
          </div>
        </div>

        <div className="advanced-filters">
          <label>
            <input
              type="checkbox"
              checked={filters.eligibleOnly}
              onChange={(event) => onFiltersChange({ ...filters, eligibleOnly: event.target.checked })}
            />
            Eligible only
          </label>
          <label>
            <span className="filter-label-text">Score range</span>
            <select value={filters.band} onChange={(event) => onFiltersChange({ ...filters, band: event.target.value as BenchmarkBand | "all" })}>
              {bands.map((band) => <option key={band} value={band}>{band === "all" ? "Any score range" : labelBand(band)}</option>)}
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}

function toggleInstitution(selected: string[], institution: string) {
  if (selected.includes(institution)) return selected.filter((item) => item !== institution);
  return [...selected, institution];
}

function labelBand(band: BenchmarkBand) {
  return {
    "above-uq": "Above UQ",
    "above-median": "Above median",
    "above-lq": "Above LQ",
    "below-lq": "Below LQ",
    "no-score": "No score data",
  }[band];
}
