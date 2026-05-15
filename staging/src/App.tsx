import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AboutPage } from "./components/AboutPage";
import { AppHeader } from "./components/AppHeader";
import { DetailPanel } from "./components/DetailPanel";
import { FiltersBar } from "./components/FiltersBar";
import { GradeInput } from "./components/GradeInput";
import { ResultsView } from "./components/ResultsView";
import { ShareView } from "./components/ShareView";
import { ShareButton } from "./components/ShareButton";
import { buildProgrammeResult, filterResults, sortResults, type Filters, type SortKey } from "./lib/results";
import { readHashState, sanitizeGrades, writeHashState } from "./lib/hashState";
import type { Profile, Programme, ProgrammeResult, StudentGrades } from "./types/jupas";

const DATA_URL = "/data/processed/JUPAS_2026_Unified_Data.json";

const DEFAULT_FILTERS: Filters = {
  query: "",
  institutions: [],
  eligibleOnly: false,
  band: "all",
};

const PRIORITY_SLOTS = ["A1", "A2", "A3", "B1", "B2", "B3"] as const;
const INITIAL_HASH_STATE = readHashState();
const HAS_HASH_STATE = INITIAL_HASH_STATE !== null;
const IS_SHARED_VIEW = INITIAL_HASH_STATE?.sharing === true && INITIAL_HASH_STATE.pickedCodes.length > 0;

type Theme = "light" | "dark";

function getRoute(): "home" | "about" {
  return window.location.hash === "#about" ? "about" : "home";
}

function App() {
  const [route, setRoute] = useState<"home" | "about">(() => getRoute());
  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "about") {
    return <AboutPage />;
  }

  return <CalculatorApp />;
}

function CalculatorApp() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId(profiles));
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  const grades = activeProfile.grades;
  const deferredGrades = useDeferredValue(grades);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [programmeFiltersOpen, setProgrammeFiltersOpen] = useState(!HAS_HASH_STATE);
  const [compactResults, setCompactResults] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("benchmark");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [pickedCodes, setPickedCodes] = useState<(string | null)[]>(() => loadInitialPickedCodes());
  const [activeCode, setActiveCode] = useState<string>();
  const [reviewRequest, setReviewRequest] = useState(HAS_HASH_STATE ? 1 : 0);
  const [loadError, setLoadError] = useState<string>();
  const [dataLoaded, setDataLoaded] = useState(false);

  const pickedCount = pickedCodes.filter((c) => c !== null).length;

  const [step, setStep] = useState<1 | 2 | 3>(() => {
    if (HAS_HASH_STATE && INITIAL_HASH_STATE) {
      if (INITIAL_HASH_STATE.pickedCodes.filter(Boolean).length > 0) return 3;
      if (Object.keys(INITIAL_HASH_STATE.grades).length > 0) return 2;
    }
    return 1;
  });

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
          setDataLoaded(true);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (IS_SHARED_VIEW) return;
    localStorage.setItem("jupas-staging-profiles", JSON.stringify(profiles));
    localStorage.setItem("jupas-staging-active-profile-id", activeProfileId);
    writeHashState(activeProfile.grades, pickedCodes);
  }, [profiles, activeProfileId, pickedCodes, activeProfile.grades]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("jupas-staging-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (pickedCodes.length === 0 && selectedOnly) setSelectedOnly(false);
  }, [pickedCodes.length, selectedOnly]);

  const institutions = useMemo(() => {
    const byInstitution = new Map<string, number>();
    for (const programme of programmes) {
      const numericCode = Number.parseInt(programme.jupas_code.replace(/\D/g, ""), 10);
      const current = byInstitution.get(programme.institution);
      if (current === undefined || numericCode < current) byInstitution.set(programme.institution, numericCode);
    }
    const sorted = [...byInstitution.entries()].sort((a, b) => a[1] - b[1]).map(([institution]) => institution);
    if (sorted.includes("HKMU") && sorted.includes("SSSDP")) {
      return sorted.filter((i) => i !== "SSSDP").flatMap((i) => i === "HKMU" ? [i, "SSSDP"] : [i]);
    }
    return sorted;
  }, [programmes]);

  const allResults = useMemo<ProgrammeResult[]>(() => {
    return programmes.map((programme) => buildProgrammeResult(programme, visibleGrades(deferredGrades)));
  }, [programmes, deferredGrades]);

  const filteredResults = useMemo(() => {
    const selectedSet = new Set(pickedCodes.filter((c): c is string => c !== null));
    const baseResults = selectedOnly
      ? allResults.filter((result) => selectedSet.has(result.programme.jupas_code))
      : filterResults(allResults, filters);
    if (selectedOnly && filters.query.trim()) {
      return sortResults(filterResults(baseResults, filters), sortKey, sortDirection);
    }
    if (selectedOnly && (filters.institutions.length > 0 || filters.eligibleOnly || filters.band !== "all")) {
      return sortResults(filterResults(baseResults, filters), sortKey, sortDirection);
    }
    return sortResults(baseResults, sortKey, sortDirection);
  }, [allResults, filters, pickedCodes, selectedOnly, sortDirection, sortKey]);

  const pickedResults = useMemo(() => {
    const byCode = new Map(allResults.map((r) => [r.programme.jupas_code, r]));
    return pickedCodes.map((code) => {
      if (code === null) return null;
      return byCode.get(code) || null;
    });
  }, [allResults, pickedCodes]);

  const activeResult = useMemo(() => {
    const firstNonNull = pickedResults.find((r): r is ProgrammeResult => r !== null);
    return pickedResults.find((r): r is ProgrammeResult => r !== null && r.programme.jupas_code === activeCode) || firstNonNull;
  }, [activeCode, pickedResults]);

  function setGrades(nextGrades: StudentGrades) {
    setProfiles((prev) =>
      prev.map((p) => (p.id === activeProfileId ? { ...p, grades: nextGrades } : p))
    );
  }

  function addProfile() {
    const id = `profile-${Date.now()}`;
    const newProfile: Profile = { id, name: `My Profile ${profiles.length + 1}`, grades: {} };
    setProfiles((prev) => [...prev, newProfile]);
    setActiveProfileId(id);
    setStep(1);
  }

  function renameProfile(id: string, name: string) {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function deleteProfile(id: string) {
    if (profiles.length <= 1) return;
    const nextProfiles = profiles.filter((p) => p.id !== id);
    setProfiles(nextProfiles);
    if (activeProfileId === id) setActiveProfileId(nextProfiles[0].id);
  }

  function reviewSelectedProgrammes() {
    const nonNullResults = pickedResults.filter((r): r is ProgrammeResult => r !== null);
    if (!nonNullResults.length) return;
    const firstCode = pickedCodes.find((c) => c !== null);
    if (firstCode) setActiveCode(firstCode);
    setProgrammeFiltersOpen(false);
    setStep(3);
    setReviewRequest((c) => c + 1);
  }

  function resetSelectedProgrammes() {
    setPickedCodes([]);
    setActiveCode(undefined);
    setSelectedOnly(false);
    setProgrammeFiltersOpen(true);
  }

  function pickProgramme(code: string) {
    setPickedCodes((current) => {
      if (current.includes(code)) return current;
      const firstNullIndex = current.indexOf(null);
      if (firstNullIndex !== -1) {
        const next = [...current];
        next[firstNullIndex] = code;
        return next;
      }
      return [...current, code];
    });
    setActiveCode(code);
  }

  function handleNext() {
    const nonNullCount = pickedCodes.filter((c) => c !== null).length;
    if (step === 2 && nonNullCount > 0) {
      reviewSelectedProgrammes();
    } else if (step < 3) {
      setStep((step + 1) as 2 | 3);
    }
  }

  const pickedResultsNonNull = useMemo(() => pickedResults.filter((r): r is ProgrammeResult => r !== null), [pickedResults]);

  if (IS_SHARED_VIEW && INITIAL_HASH_STATE && programmes.length > 0 && pickedCount > 0) {
    return <ShareView profileName={activeProfile.name} results={pickedResults} />;
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

  if (IS_SHARED_VIEW && !dataLoaded) {
    return (
      <main className="share-view">
        <AppHeader />
        <section className="panel share-profile-card">
          <div>
            <p className="eyebrow">Shared results</p>
            <strong>Loading profile...</strong>
          </div>
        </section>
      </main>
    );
  }

  const nextLabel =
    step === 1 ? "Compare Programmes" :
    step === 2 && pickedCount > 0 ? `Review ${pickedCount} selected` :
    "Programme Detail";

  const backLabel =
    step === 2 ? "Edit Grades" :
    step === 3 ? "Compare" :
    null;

  const showProgrammeLoading = step === 2 && !dataLoaded;
  const canShare = pickedCount > 0;
  const programmePicker = showProgrammeLoading ? (
    <section className="panel programme-loading-panel" aria-live="polite" aria-busy="true">
      <p className="eyebrow">Programme picker</p>
      <h2>Select Programme(s)</h2>
      <p>Loading programme data...</p>
      <div className="loading-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  ) : (
    <section className="panel step2-panel" aria-label="Programme comparison">
      <FiltersBar
        filters={filters}
        open={programmeFiltersOpen}
        institutions={institutions}
        total={allResults.length}
        shown={filteredResults.length}
        selectedCount={pickedCount}
        selectedOnly={selectedOnly}
        compactResults={compactResults}
        onFiltersChange={setFilters}
        onOpenChange={setProgrammeFiltersOpen}
        onSelectedOnlyChange={setSelectedOnly}
        onCompactResultsChange={setCompactResults}
        onReviewSelected={reviewSelectedProgrammes}
        onResetSelected={resetSelectedProgrammes}
        selectedOrder={
          <PreferencePlanner
            results={pickedResults}
            activeCode={activeResult?.programme.jupas_code}
            onActivate={setActiveCode}
          />
        }
      />
      <ResultsView
        results={filteredResults}
        selectedCodes={pickedCodes.filter((c): c is string => c !== null)}
        selectedResults={pickedResultsNonNull}
        activeCode={activeResult?.programme.jupas_code}
        reviewRequest={reviewRequest}
        compact={compactResults}
        onFocus={(code) => setActiveCode(code)}
        onPick={pickProgramme}
        onUnpick={(code) => {
          setPickedCodes((current) => {
            const index = current.indexOf(code);
            if (index === -1) return current;
            const next = [...current];
            next[index] = null;
            
            // Trim trailing nulls
            let lastNonNull = -1;
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i] !== null) {
                lastNonNull = i;
                break;
              }
            }
            return next.slice(0, lastNonNull + 1);
          });
          if (activeCode === code) {
            const nextVal = pickedCodes.filter(c => c !== null).find((item) => item !== code);
            setActiveCode(nextVal || undefined);
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
  );

  return (
    <main className="app-shell">
      <div className="glass-veil" aria-hidden="true" />
      <AppHeader
        theme={theme}
        onThemeChange={setTheme}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onProfileSelect={setActiveProfileId}
        onProfileAdd={addProfile}
        onProfileRename={renameProfile}
        onProfileDelete={deleteProfile}
      />

      <section className={pickedCount > 0 ? "desktop-workspace detail-open" : "desktop-workspace"} aria-label="Desktop JUPAS planner">
        <div className="desktop-grade-column">
          <GradeInput grades={grades} onChange={setGrades} onReset={() => setGrades({})} />
        </div>
        <div className="desktop-programme-column">
          {programmePicker}
        </div>
        <div className="desktop-detail-column" aria-hidden={pickedCount === 0}>
          {pickedCount > 0 ? (
            <DetailPanel
              results={pickedResults}
              activeCode={activeResult?.programme.jupas_code}
              reviewRequest={reviewRequest}
              onActiveCodeChange={setActiveCode}
              onRemove={(code) => {
                setPickedCodes((current) => {
                  const index = current.indexOf(code);
                  if (index === -1) return current;
                  const next = [...current];
                  next[index] = null;
                  
                  // Trim trailing nulls
                  let lastNonNull = -1;
                  for (let i = next.length - 1; i >= 0; i--) {
                    if (next[i] !== null) {
                      lastNonNull = i;
                      break;
                    }
                  }
                  return next.slice(0, lastNonNull + 1);
                });
                if (activeCode === code) {
                  const nextVal = pickedCodes.filter(c => c !== null).find((item) => item !== code);
                  setActiveCode(nextVal || undefined);
                }
              }}
            />
          ) : (
            <aside className="panel desktop-empty-detail">
              <p className="eyebrow">Comparison drawer</p>
              <h2>Pick programmes to compare</h2>
              <p>Use A1-A3 for dream, target, and safer choices. B1-B3 is useful for realistic backups and consultation.</p>
            </aside>
          )}
        </div>
      </section>

      <div className="desktop-share-bar">
        <span>{pickedResults.length ? `${pickedResults.length} programmes selected · first 6 map to A1-B3` : "Select programmes, then refine A1-B3 priority"}</span>
        {canShare ? <ShareButton grades={activeProfile.grades} pickedCodes={pickedCodes} /> : null}
      </div>

      <div className="mobile-stepper-flow">
        <StepperBar step={step} pickedCount={pickedResults.length} onStepChange={setStep} />

        <div className="stepper-content">
          <div className={step === 1 ? "stepper-panel active" : "stepper-panel"}>
            <GradeInput grades={grades} onChange={setGrades} onReset={() => setGrades({})} />
          </div>

          <div className={step === 2 ? "stepper-panel active" : "stepper-panel"}>
            {programmePicker}
          </div>

          <div className={step === 3 ? "stepper-panel active" : "stepper-panel"}>
            <DetailPanel
              results={pickedResults}
              activeCode={activeResult?.programme.jupas_code}
              reviewRequest={reviewRequest}
              onActiveCodeChange={setActiveCode}
              onRemove={(code) => {
                setPickedCodes((current) => {
                  const index = current.indexOf(code);
                  if (index === -1) return current;
                  const next = [...current];
                  next[index] = null;
                  
                  // Trim trailing nulls
                  let lastNonNull = -1;
                  for (let i = next.length - 1; i >= 0; i--) {
                    if (next[i] !== null) {
                      lastNonNull = i;
                      break;
                    }
                  }
                  return next.slice(0, lastNonNull + 1);
                });
                if (activeCode === code) {
                  const nextVal = pickedCodes.filter(c => c !== null).find((item) => item !== code);
                  setActiveCode(nextVal || undefined);
                }
              }}
            />
          </div>
        </div>

        <footer className="stepper-footer">
        <div className="stepper-footer-left">
          <button
            type="button"
            className="ghost-button"
            disabled={!backLabel}
            onClick={() => {
              if (backLabel) setStep((step - 1) as 1 | 2 | 3);
            }}
          >
            Back
          </button>
        </div>
        <div className="stepper-footer-right">
          <button
            type="button"
            className="ghost-button"
            disabled={
              (step === 1 && Object.keys(grades).length === 0) ||
              (step === 2 && pickedResults.length === 0) ||
              step === 3
            }
            onClick={() => {
              if (step === 1) setGrades({});
              if (step === 2) resetSelectedProgrammes();
            }}
          >
            Reset
          </button>
          {step < 3 ? (
            <button
              type="button"
              className="stepper-next-btn"
              onClick={handleNext}
              disabled={step === 2 && pickedResults.length === 0}
            >
              {nextLabel} <ArrowIcon direction="right" />
            </button>
          ) : pickedResults.length > 0 ? (
            <ShareButton grades={activeProfile.grades} pickedCodes={pickedCodes} />
          ) : null}
        </div>
        </footer>
      </div>
    </main>
  );
}

function PreferencePlanner({
  results,
  activeCode,
  onActivate,
}: {
  results: (ProgrammeResult | null)[];
  activeCode?: string;
  onActivate: (code: string) => void;
}) {
  const priorityResults = results.slice(0, PRIORITY_SLOTS.length);
  const extraCount = Math.max(0, results.length - PRIORITY_SLOTS.length);

  return (
    <section className="preference-planner" aria-label="A1 to B3 preference planner">
      <span className="preference-line-label">Selected</span>
      <div className="preference-line" aria-label="Selected programme order">
        {results.filter(Boolean).length === 0 ? <span className="preference-empty">None</span> : null}
        {priorityResults.map((result, index) => (
          <Fragment key={index}>
            {index > 0 ? <span className="preference-separator" aria-hidden="true">|</span> : null}
            {!result ? (
              <span className="preference-text">
                {PRIORITY_SLOTS[index]}·---
              </span>
            ) : (
              <button
                type="button"
                className={result.programme.jupas_code === activeCode ? "preference-text active" : "preference-text filled"}
                onClick={() => onActivate(result.programme.jupas_code)}
              >
                {PRIORITY_SLOTS[index]}·{result.programme.jupas_code}
              </button>
            )}
          </Fragment>
        ))}
        {extraCount ? <span className="preference-extra">| +{extraCount} more</span> : null}
      </div>
    </section>
  );
}

function StepperBar({
  step,
  pickedCount,
  onStepChange,
}: {
  step: 1 | 2 | 3;
  pickedCount: number;
  onStepChange: (step: 1 | 2 | 3) => void;
}) {
  const steps: Array<{ n: 1 | 2 | 3; label: string }> = [
    { n: 1, label: "Grades" },
    { n: 2, label: "Programme" },
    { n: 3, label: "Details" },
  ];

  return (
    <nav className="stepper-bar" aria-label="Progress">
      {steps.map((s, i) => (
        <Fragment key={s.n}>
          {i > 0 && <span className="stepper-connector" aria-hidden="true" />}
          <button
            type="button"
            className={[
              "stepper-step",
              step === s.n ? "active" : "",
              step > s.n ? "done" : "",
            ].filter(Boolean).join(" ")}
            disabled={s.n === 3 && pickedCount === 0}
            aria-current={step === s.n ? "step" : undefined}
            onClick={() => onStepChange(s.n)}
          >
            <span className="stepper-badge">
              {step > s.n ? (
                <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M1.5 5.5L5 9L11.5 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : s.n}
            </span>
            <span className="stepper-label">{s.label}</span>
          </button>
        </Fragment>
      ))}
    </nav>
  );
}

function loadTheme(): Theme {
  const saved = localStorage.getItem("jupas-staging-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function loadProfiles(): Profile[] {
  const hashState = readHashState();
  if (hashState && Object.keys(hashState.grades).length > 0) {
    return [{
      id: `shared-${Date.now()}`,
      name: "My Profile",
      grades: hashState.grades,
    }];
  }
  try {
    const saved = localStorage.getItem("jupas-staging-profiles");
    if (saved) {
      const profiles = sanitizeProfiles(JSON.parse(saved));
      if (profiles.length) return profiles;
    }
  } catch (e) {
    console.error("Failed to load profiles", e);
  }
  let grades: StudentGrades = {};
  try {
    const legacyGrades = localStorage.getItem("jupas-staging-grades");
    grades = legacyGrades ? sanitizeGrades(JSON.parse(legacyGrades)) : {};
  } catch (e) {
    console.error("Failed to load legacy grades", e);
  }
  return [{ id: "default", name: "My Profile", grades }];
}

function sanitizeProfiles(rawProfiles: unknown): Profile[] {
  if (!Array.isArray(rawProfiles)) return [];
  return rawProfiles.slice(0, 8).flatMap((profile, index) => {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return [];
    const candidate = profile as Partial<Profile>;
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `profile-${index + 1}`;
    const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 60) : `My Profile ${index + 1}`;
    return [{ id, name, grades: sanitizeGrades(candidate.grades) }];
  });
}

function loadInitialPickedCodes(): (string | null)[] {
  const hashState = readHashState();
  if (hashState && hashState.pickedCodes.length > 0) return hashState.pickedCodes;
  return [];
}

function loadActiveProfileId(profiles: Profile[]): string {
  if (profiles.length === 1 && profiles[0].id.startsWith("shared-")) return profiles[0].id;
  const saved = localStorage.getItem("jupas-staging-active-profile-id");
  if (saved && profiles.some((p) => p.id === saved)) return saved;
  return profiles[0].id;
}

function visibleGrades(grades: StudentGrades): StudentGrades {
  return Object.fromEntries(Object.entries(grades).filter(([key]) => !key.includes(":subject")));
}

function ArrowIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  const transform = direction === "left" ? "scale(-1,1)" : undefined;
  return (
    <svg
      width="18" height="14" viewBox="0 0 18 14"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle", transform }}
      aria-hidden="true"
    >
      <path
        d="M1 7H17M11 1L17 7L11 13"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default App;
