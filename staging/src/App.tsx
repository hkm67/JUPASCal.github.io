import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { DetailPanel } from "./components/DetailPanel";
import { FiltersBar } from "./components/FiltersBar";
import { GradeInput } from "./components/GradeInput";
import { ResultsView } from "./components/ResultsView";
import { buildProgrammeResult, filterResults, sortResults, type Filters, type SortKey } from "./lib/results";
import type { Programme, ProgrammeResult, StudentGrades } from "./types/jupas";

const DATA_URL = "/data/processed/JUPAS_2026_Unified_Data.json";

const DEFAULT_FILTERS: Filters = {
  query: "",
  institutions: [],
  eligibleOnly: false,
  band: "all",
};

type Theme = "light" | "dark";

function App() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [grades, setGrades] = useState<StudentGrades>(() => loadGrades());
  const deferredGrades = useDeferredValue(grades);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [programmeFiltersOpen, setProgrammeFiltersOpen] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("benchmark");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [pickedCodes, setPickedCodes] = useState<string[]>([]);
  const [activeCode, setActiveCode] = useState<string>();
  const [reviewRequest, setReviewRequest] = useState(0);
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
        return response.json() as Promise<Programme[]>;
      })
      .then((data) => {
        if (!cancelled) {
          setProgrammes(data);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("jupas-staging-grades", JSON.stringify(grades));
  }, [grades]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("jupas-staging-theme", theme);
  }, [theme]);

  const institutions = useMemo(() => {
    const byInstitution = new Map<string, number>();
    for (const programme of programmes) {
      const numericCode = Number.parseInt(programme.jupas_code.replace(/\D/g, ""), 10);
      const current = byInstitution.get(programme.institution);
      if (current === undefined || numericCode < current) byInstitution.set(programme.institution, numericCode);
    }
    const sorted = [...byInstitution.entries()].sort((a, b) => a[1] - b[1]).map(([institution]) => institution);
    if (sorted.includes("HKMU") && sorted.includes("SSSDP")) {
      return sorted.filter((institution) => institution !== "SSSDP").flatMap((institution) => institution === "HKMU" ? [institution, "SSSDP"] : [institution]);
    }
    return sorted;
  }, [programmes]);

  const allResults = useMemo<ProgrammeResult[]>(() => {
    return programmes.map((programme) => buildProgrammeResult(programme, visibleGrades(deferredGrades)));
  }, [programmes, deferredGrades]);

  const filteredResults = useMemo(() => {
    return sortResults(filterResults(allResults, filters), sortKey, sortDirection);
  }, [allResults, filters, sortDirection, sortKey]);

  const pickedResults = useMemo(() => {
    const byCode = new Map(allResults.map((result) => [result.programme.jupas_code, result]));
    return pickedCodes.flatMap((code) => {
      const result = byCode.get(code);
      return result ? [result] : [];
    });
  }, [allResults, pickedCodes]);

  const activeResult = useMemo(() => {
    return pickedResults.find((result) => result.programme.jupas_code === activeCode) || pickedResults[0];
  }, [activeCode, pickedResults]);

  function applyProgrammeFilters(nextFilters: Filters) {
    if (window.matchMedia?.("(max-width: 920px)").matches) {
      const step2Panel = document.querySelector(".step2-panel");
      const panelTop = step2Panel?.getBoundingClientRect().top ?? 0;
      if (panelTop < -120) {
        step2Panel?.scrollIntoView({ block: "start", behavior: "auto" });
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => setFilters(nextFilters));
        });
        return;
      }
    }

    setFilters(nextFilters);
  }

  function reviewSelectedProgrammes() {
    if (!pickedResults.length) return;
    if (!activeCode || !pickedCodes.includes(activeCode)) {
      setActiveCode(pickedResults[0].programme.jupas_code);
    }

    const finishReview = () => {
      setProgrammeFiltersOpen(false);
      setReviewRequest((current) => current + 1);
    };

    if (window.matchMedia?.("(max-width: 920px)").matches) {
      document.querySelector(".step2-panel")?.scrollIntoView({ block: "start", behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(finishReview);
      });
      return;
    }

    finishReview();
  }

  function resetSelectedProgrammes() {
    setPickedCodes([]);
    setActiveCode(undefined);
    setProgrammeFiltersOpen(true);
  }

  if (loadError) {
    return (
      <main className="app-shell">
        <section className="panel error-panel">
          <h1>Could not load JUPAS data</h1>
          <p>{loadError}</p>
          <p>Expected dataset: <code>{DATA_URL}</code></p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Unofficial 2026 admissions score calculator</p>
          <h1>JUPAS Cal staging prototype</h1>
          <p>Enter DSE grades once, compare all programmes, then inspect eligibility, benchmark position, and the calculation audit trail.</p>
        </div>
        <div className="header-actions">
          <span>{programmes.length || "..."} programmes</span>
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <div className="left-rail">
          <GradeInput grades={grades} onChange={setGrades} />
        </div>
        <div className="main-column">
          <section className="panel step2-panel" aria-label="Programme comparison">
            <FiltersBar
              filters={filters}
              open={programmeFiltersOpen}
              institutions={institutions}
              total={allResults.length}
              shown={filteredResults.length}
              selectedCount={pickedResults.length}
              onFiltersChange={applyProgrammeFilters}
              onOpenChange={setProgrammeFiltersOpen}
              onReviewSelected={reviewSelectedProgrammes}
              onResetSelected={resetSelectedProgrammes}
            />
            <ResultsView
              results={filteredResults}
              selectedCodes={pickedCodes}
              selectedResults={pickedResults}
              activeCode={activeResult?.programme.jupas_code}
              reviewRequest={reviewRequest}
              onFocus={(code) => {
                setActiveCode(code);
              }}
              onPick={(code) => {
                setPickedCodes((current) => current.includes(code) ? current : [...current, code]);
                setActiveCode(code);
              }}
              onUnpick={(code) => {
                setPickedCodes((current) => current.filter((item) => item !== code));
                if (activeCode === code) {
                  setActiveCode(pickedCodes.find((item) => item !== code));
                }
              }}
              onReviewSelected={reviewSelectedProgrammes}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSortChange={(nextSortKey) => {
                if (nextSortKey === sortKey) {
                  setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                  return;
                }
                setSortKey(nextSortKey);
                setSortDirection(nextSortKey === "code" || nextSortKey === "institution" ? "asc" : "desc");
              }}
            />
          </section>
        </div>
        <DetailPanel
          results={pickedResults}
          activeCode={activeResult?.programme.jupas_code}
          reviewRequest={reviewRequest}
          onActiveCodeChange={setActiveCode}
          onRemove={(code) => {
            setPickedCodes((current) => current.filter((item) => item !== code));
            if (activeCode === code) {
              const next = pickedCodes.find((item) => item !== code);
              setActiveCode(next);
            }
          }}
        />
      </div>
    </main>
  );
}

function loadTheme(): Theme {
  const saved = localStorage.getItem("jupas-staging-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function loadGrades(): StudentGrades {
  try {
    return JSON.parse(localStorage.getItem("jupas-staging-grades") || "{}") as StudentGrades;
  } catch {
    return {};
  }
}

function visibleGrades(grades: StudentGrades): StudentGrades {
  return Object.fromEntries(Object.entries(grades).filter(([key]) => !key.includes(":subject")));
}

export default App;
