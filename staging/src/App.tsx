import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "./lib/useMediaQuery";
import { AboutPage } from "./components/AboutPage";
import { AppHeader } from "./components/AppHeader";
import { DetailPanel } from "./components/DetailPanel";
import { FiltersBar } from "./components/FiltersBar";
import { GradeInput } from "./components/GradeInput";
import { ResultsView } from "./components/ResultsView";
import { ShareView } from "./components/ShareView";
import { ShareButton } from "./components/ShareButton";
import { PreferencePlanner } from "./components/PreferencePlanner";
import { AdvisorEmptyState } from "./components/AdvisorEmptyState";
import { StrategySummary } from "./components/StrategySummary";
import { buildProgrammeResult, filterResults, sortResults, type Filters, type SortKey } from "./lib/results";
import { buildShareUrl, readHashState, sanitizeGrades, writeHashState } from "./lib/hashState";
import type { Profile, Programme, ProgrammeResult, StudentGrades } from "./types/jupas";

const DATA_URL = "/data/processed/JUPAS_2026_Unified_Data.json";
const VERSION_URL = "/data/processed/JUPAS_2026_Unified_Data.version";

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
  // Profiles & local-storage state. Note `loadProfiles()` no longer appends
  // a synthetic "Shared profile" — the recipient preview is a separate
  // transient state (below) so the user's localStorage isn't mutated by
  // just opening someone else's share link.
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId(profiles));
  // Recipient mode: a transient preview profile sourced from a sharing URL.
  // Lives only in React state. Not persisted to localStorage until the user
  // hits "Save as my profile". When non-null AND shareViewMode is true, the
  // ShareView renders this instead of any local profile.
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(() => {
    if (!IS_SHARED_VIEW || !INITIAL_HASH_STATE) return null;
    return {
      id: "__preview__",
      name: "Shared plan",
      grades: INITIAL_HASH_STATE.grades,
      pickedCodes: INITIAL_HASH_STATE.pickedCodes,
    };
  });
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  // Picks live on the active profile (or the preview profile when viewing
  // a received share). Undefined on legacy profiles → treat as [].
  const sharedViewActive = !!previewProfile;
  const displayProfile = sharedViewActive ? previewProfile! : activeProfile;
  const grades = displayProfile.grades;
  const deferredGrades = useDeferredValue(grades);
  const pickedCodes = displayProfile.pickedCodes ?? [];

  function setPickedCodes(
    updater: (string | null)[] | ((current: (string | null)[]) => (string | null)[]),
  ) {
    // Edits to picks while viewing a received share apply to that preview
    // profile only (and never leak into localStorage). Otherwise they
    // update the active local profile.
    if (sharedViewActive && previewProfile) {
      setPreviewProfile((prev) => {
        if (!prev) return prev;
        const current = prev.pickedCodes ?? [];
        const next = typeof updater === "function" ? updater(current) : updater;
        return { ...prev, pickedCodes: next };
      });
      return;
    }
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== activeProfileId) return p;
        const current = p.pickedCodes ?? [];
        const next = typeof updater === "function" ? updater(current) : updater;
        return { ...p, pickedCodes: next };
      }),
    );
  }

  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [programmeFiltersOpen, setProgrammeFiltersOpen] = useState(!HAS_HASH_STATE);
  const [compactResults, setCompactResults] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("benchmark");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [activeCode, setActiveCode] = useState<string>();
  const [reviewRequest, setReviewRequest] = useState(HAS_HASH_STATE ? 1 : 0);
  const [loadError, setLoadError] = useState<string>();
  const [dataLoaded, setDataLoaded] = useState(false);
  // Share view is a soft view-switch (no page reload). Initialised true if
  // the URL arrived with `sharing=true`. Toggles via Share/Edit buttons.
  const [shareViewMode, setShareViewMode] = useState<boolean>(IS_SHARED_VIEW);

  // Watch the URL hash for runtime changes — user pasting a different URL
  // into the address bar (fires `hashchange`) or hitting the back/forward
  // buttons (`popstate`). Each external URL change creates a TRANSIENT
  // preview profile so the DOM matches the URL, without ever mutating the
  // user's local profiles. To keep / edit the preview the user must hit
  // "Save as profile" in the banner / share view; to drop it they hit
  // "Discard". Our own writes use replaceState / pushState which do NOT
  // fire `hashchange`, so this listener never reacts to internally-driven
  // URL updates.
  useEffect(() => {
    const onUrlChange = () => {
      const state = readHashState();
      const hasContent = !!state && (
        Object.keys(state.grades).length > 0 || state.pickedCodes.length > 0
      );
      if (!hasContent) {
        // Empty hash → drop any preview, exit share view.
        setPreviewProfile(null);
        setShareViewMode(false);
        return;
      }
      setPreviewProfile({
        id: "__preview__",
        name: state!.sharing ? "Shared plan" : "URL preview",
        grades: state!.grades,
        pickedCodes: state!.pickedCodes,
      });
      setShareViewMode(state!.sharing === true);
    };
    window.addEventListener("hashchange", onUrlChange);
    window.addEventListener("popstate", onUrlChange);
    return () => {
      window.removeEventListener("hashchange", onUrlChange);
      window.removeEventListener("popstate", onUrlChange);
    };
  }, []);

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

    // localStorage keys. Bump CACHE_KEY when the unified-data SHAPE changes
    // (so old structures don't haunt us); the VERSION_KEY tracks the
    // *content* hash so we can skip the heavy fetch when nothing changed.
    const CACHE_KEY = "jupas-programmes-cache-v2";
    const VERSION_KEY = "jupas-programmes-version-v2";

    // 1. Instant first render from localStorage, if present.
    let cachedVersion: string | null = null;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      cachedVersion = localStorage.getItem(VERSION_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Programme[];
        if (Array.isArray(parsed) && parsed.length > 0 && !cancelled) {
          setProgrammes(parsed);
          setDataLoaded(true);
        }
      }
    } catch {
      // Cache corrupt or quota issue — fall through to network.
    }

    // 2. Fetch the tiny version sidecar first. If it matches what we already
    //    have cached, we're done — skip the heavy JSON download entirely.
    fetch(VERSION_URL)
      .then((response) => (response.ok ? response.text() : Promise.resolve("")))
      .then((serverVersion) => {
        const trimmed = (serverVersion || "").trim();
        if (cancelled) return;
        if (trimmed && cachedVersion && trimmed === cachedVersion) {
          // Cache is current — nothing more to do.
          return;
        }
        return fetch(DATA_URL)
          .then((response) => {
            if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
            return response.text();
          })
          .then((rawText) => {
            if (cancelled) return;
            const data = JSON.parse(rawText) as Programme[];
            setProgrammes(data);
            setDataLoaded(true);
            try {
              localStorage.setItem(CACHE_KEY, rawText);
              if (trimmed) localStorage.setItem(VERSION_KEY, trimmed);
            } catch {
              // Quota exceeded; skip caching this round.
            }
          });
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Recipient (preview) mode: don't touch localStorage or URL. The URL
    // is a received share that shouldn't be rewritten, and the local
    // profile list shouldn't be mutated by just viewing a share.
    if (sharedViewActive) return;
    localStorage.setItem("jupas-staging-profiles", JSON.stringify(profiles));
    localStorage.setItem("jupas-staging-active-profile-id", activeProfileId);
    if (shareViewMode) {
      // Own-share view: keep the URL pointed at the *currently displayed*
      // profile's share URL so switching profiles via the switcher keeps
      // the URL in sync with what's on screen.
      buildShareUrl(activeProfile.grades, activeProfile.pickedCodes ?? []).then((url) => {
        window.history.replaceState(null, "", url);
      });
    } else {
      writeHashState(activeProfile.grades, activeProfile.pickedCodes ?? []);
    }
  }, [profiles, activeProfileId, shareViewMode, sharedViewActive, activeProfile]);

  async function enterShareMode(): Promise<string> {
    // Always shares the active local profile (not the preview — exiting
    // and re-entering preview is a re-share of the original URL).
    const url = await buildShareUrl(activeProfile.grades, activeProfile.pickedCodes ?? []);
    window.history.pushState(null, "", url);
    setShareViewMode(true);
    return url;
  }

  function exitShareMode() {
    setShareViewMode(false);
    // Drop the preview profile so subsequent renders use the local active
    // profile. The localStorage effect will run on the next render and
    // rewrite the URL to the active profile's calc URL.
    setPreviewProfile(null);
  }

  function savePreviewAsProfile() {
    // Promote the preview into a real profile. Works for both received
    // shares (sharing=true URL) and pasted deep-link URLs (no flag).
    if (!previewProfile) return;
    const newId = `profile-${Date.now()}`;
    const newName = uniqueProfileName("Imported plan");
    const newProfile: Profile = {
      id: newId,
      name: newName,
      grades: previewProfile.grades,
      pickedCodes: previewProfile.pickedCodes,
    };
    setProfiles((prev) => [...prev, newProfile]);
    setActiveProfileId(newId);
    setPreviewProfile(null);
    setShareViewMode(false);
  }

  function discardPreview() {
    // Throw away the pasted URL state and return to the user's saved
    // active profile. The localStorage effect will rewrite the URL to
    // the active profile's calc URL on the next render.
    setPreviewProfile(null);
    setShareViewMode(false);
  }

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
    if (sharedViewActive) {
      setPreviewProfile((prev) => (prev ? { ...prev, grades: nextGrades } : prev));
      return;
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === activeProfileId ? { ...p, grades: nextGrades } : p))
    );
  }

  function uniqueProfileName(desired: string, ignoreId?: string): string {
    const taken = new Set(
      profiles.filter((p) => p.id !== ignoreId).map((p) => p.name.trim().toLowerCase()),
    );
    const base = desired.trim();
    if (!taken.has(base.toLowerCase())) return base;
    let n = 2;
    while (taken.has(`${base} (${n})`.toLowerCase())) n++;
    return `${base} (${n})`;
  }

  function addProfile() {
    const defaultName = uniqueProfileName(`My Profile ${profiles.length + 1}`);
    const entered = window.prompt("Name this profile (e.g. student name or scenario)", defaultName);
    if (entered === null) return; // User cancelled — abort.
    const name = uniqueProfileName(entered.trim() || defaultName);
    const id = `profile-${Date.now()}`;
    const newProfile: Profile = { id, name, grades: {}, pickedCodes: [] };
    setProfiles((prev) => [...prev, newProfile]);
    setActiveProfileId(id);
    setStep(1);
  }

  function renameProfile(id: string, name: string) {
    const cleaned = name.trim();
    if (!cleaned) return; // Reject empty rename — preserves existing name.
    const unique = uniqueProfileName(cleaned, id);
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, name: unique } : p)));
  }

  function deleteProfile(id: string) {
    if (profiles.length <= 1) return;
    const nextProfiles = profiles.filter((p) => p.id !== id);
    setProfiles(nextProfiles);
    if (activeProfileId === id) setActiveProfileId(nextProfiles[0].id);
  }

  function resetAllData() {
    // Wipe everything user-personal. Keep the programmes-cache + theme
    // since those aren't profile data and re-downloading the JSON is
    // wasteful. Reload to a clean app state.
    localStorage.removeItem("jupas-staging-profiles");
    localStorage.removeItem("jupas-staging-active-profile-id");
    localStorage.removeItem("jupas-staging-grades"); // legacy pre-multi-profile key
    window.location.href = window.location.origin + window.location.pathname;
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

  function setSlotCode(slotIndex: number, code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setPickedCodes((current) => {
      // If this code is already in another slot, do nothing (avoid duplicates).
      const existingIndex = current.indexOf(trimmed);
      if (existingIndex !== -1 && existingIndex !== slotIndex) return current;
      const next = [...current];
      while (next.length <= slotIndex) next.push(null);
      next[slotIndex] = trimmed;
      return next;
    });
    setActiveCode(trimmed);
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

  const isDesktop = useMediaQuery("(min-width: 921px)");

  function reorderPickedCodes(fromIndex: number, toIndex: number) {
    setPickedCodes((current) => {
      const padded = [...current];
      const maxIndex = Math.max(fromIndex, toIndex);
      while (padded.length <= maxIndex) padded.push(null);
      const [moved] = padded.splice(fromIndex, 1);
      padded.splice(toIndex, 0, moved ?? null);
      let lastNonNull = -1;
      for (let i = padded.length - 1; i >= 0; i--) {
        if (padded[i] !== null) {
          lastNonNull = i;
          break;
        }
      }
      return padded.slice(0, lastNonNull + 1);
    });
  }

  function removePickedCode(code: string) {
    setPickedCodes((current) => {
      const index = current.indexOf(code);
      if (index === -1) return current;
      const next = [...current];
      next[index] = null;
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
      const nextVal = pickedCodes.filter((c) => c !== null).find((item) => item !== code);
      setActiveCode(nextVal || undefined);
    }
  }

  if (shareViewMode && programmes.length > 0 && pickedCount > 0) {
    return (
      <ShareView
        profileName={displayProfile.name}
        results={pickedResults}
        profiles={sharedViewActive ? undefined : profiles}
        activeProfileId={sharedViewActive ? undefined : activeProfileId}
        onProfileChange={sharedViewActive ? undefined : setActiveProfileId}
        onExitShareMode={exitShareMode}
        isReceivedShare={sharedViewActive}
        onSaveAsProfile={sharedViewActive ? savePreviewAsProfile : undefined}
      />
    );
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

  if (shareViewMode && !dataLoaded) {
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

  const desktopPlannerNode = (
    <PreferencePlanner
      results={pickedResults}
      activeCode={activeResult?.programme.jupas_code}
      onActivate={setActiveCode}
      onReorder={reorderPickedCodes}
      onRemove={removePickedCode}
      onSetSlotCode={setSlotCode}
      programmes={programmes}
      shareSlot={canShare ? <ShareButton onShare={enterShareMode} /> : null}
    />
  );

  const mobilePlannerNode = (
    <PreferenceLine
      results={pickedResults}
      activeCode={activeResult?.programme.jupas_code}
      onActivate={setActiveCode}
    />
  );

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
        showStepEyebrow={!isDesktop}
        onFiltersChange={setFilters}
        onOpenChange={setProgrammeFiltersOpen}
        onSelectedOnlyChange={setSelectedOnly}
        onCompactResultsChange={setCompactResults}
        onReviewSelected={reviewSelectedProgrammes}
        onResetSelected={resetSelectedProgrammes}
        selectedOrder={isDesktop ? undefined : mobilePlannerNode}
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

  const header = (
    <AppHeader
      theme={theme}
      onThemeChange={setTheme}
      profiles={profiles}
      activeProfileId={activeProfileId}
      onProfileSelect={setActiveProfileId}
      onProfileAdd={addProfile}
      onProfileRename={renameProfile}
      onProfileDelete={deleteProfile}
      onResetAll={resetAllData}
    />
  );

  const detailPanelNode = pickedCount > 0 ? (
    <DetailPanel
      results={pickedResults}
      activeCode={activeResult?.programme.jupas_code}
      reviewRequest={reviewRequest}
      onActiveCodeChange={setActiveCode}
      onRemove={removePickedCode}
    />
  ) : null;

  const mobileDetailNode = detailPanelNode ?? (
    <aside className="panel desktop-empty-detail">
      <p className="eyebrow">Comparison drawer</p>
      <h2>Pick programmes to compare</h2>
      <p>Use A1-A3 for dream, target, and safer choices. B1-B3 is useful for realistic backups and consultation.</p>
    </aside>
  );

  const desktopRightColumn = pickedCount > 0 ? (
    <>
      <StrategySummary results={pickedResultsNonNull} />
      {detailPanelNode}
    </>
  ) : (
    <AdvisorEmptyState />
  );

  const previewBanner = sharedViewActive && !shareViewMode ? (
    <div className="preview-banner" role="status" aria-live="polite">
      <div className="preview-banner-text">
        <strong>Viewing the URL you pasted</strong>
        <span>
          Your saved profiles aren't touched. Save this as a new profile to keep it, or discard it to return to your data.
        </span>
      </div>
      <div className="preview-banner-actions">
        <button type="button" className="ghost-button" onClick={savePreviewAsProfile}>
          Save as profile
        </button>
        <button type="button" className="ghost-button" onClick={discardPreview}>
          Discard
        </button>
      </div>
    </div>
  ) : null;

  if (isDesktop) {
    return (
      <main className="app-shell layout-desktop">
        <div className="glass-veil" aria-hidden="true" />
        {header}
        {previewBanner}

        <section className="desktop-workspace" aria-label="Desktop JUPAS planner">
          <div className="desktop-grade-column">
            <GradeInput grades={grades} onChange={setGrades} onReset={() => setGrades({})} />
          </div>
          <div className="desktop-programme-column">
            <div className="desktop-planner-wrap">
              {desktopPlannerNode}
            </div>
            {programmePicker}
          </div>
          <div className="desktop-detail-column">
            {desktopRightColumn}
          </div>
        </section>

      </main>
    );
  }

  return (
    <main className="app-shell layout-mobile">
      <div className="glass-veil" aria-hidden="true" />
      {header}
      {previewBanner}

      <div className="mobile-stepper-flow">
        <StepperBar step={step} pickedCount={pickedCount} onStepChange={setStep} />

        <div className="stepper-content">
          <div className={step === 1 ? "stepper-panel active" : "stepper-panel"}>
            <GradeInput grades={grades} onChange={setGrades} onReset={() => setGrades({})} />
          </div>

          <div className={step === 2 ? "stepper-panel active" : "stepper-panel"}>
            {programmePicker}
          </div>

          <div className={step === 3 ? "stepper-panel active" : "stepper-panel"}>
            {mobileDetailNode}
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
                (step === 2 && pickedCount === 0) ||
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
                disabled={step === 2 && pickedCount === 0}
              >
                {nextLabel} <ArrowIcon direction="right" />
              </button>
            ) : pickedCount > 0 ? (
              <ShareButton onShare={enterShareMode} />
            ) : null}
          </div>
        </footer>
      </div>
    </main>
  );
}

function PreferenceLine({
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
  // localStorage is the sole source of profiles. Received-share URL state
  // is kept in a separate `previewProfile` and is NEVER persisted unless
  // the user explicitly clicks "Save as my profile" in ShareView.
  const local = loadLocalProfiles();
  if (local.length > 0) return local;

  // No local profiles yet. If this is a fresh visit with a non-sharing
  // deep-link URL (e.g. user bookmarked their own calc URL), seed a
  // default profile from the URL state so they don't lose it.
  const hash = readHashState();
  if (hash && !hash.sharing && (Object.keys(hash.grades).length > 0 || hash.pickedCodes.length > 0)) {
    return [{ id: "default", name: "My Profile", grades: hash.grades, pickedCodes: hash.pickedCodes }];
  }
  return [{ id: "default", name: "My Profile", grades: {}, pickedCodes: [] }];
}

function loadLocalProfiles(): Profile[] {
  try {
    const saved = localStorage.getItem("jupas-staging-profiles");
    if (saved) {
      const profiles = sanitizeProfiles(JSON.parse(saved));
      if (profiles.length) return profiles;
    }
  } catch (e) {
    console.error("Failed to load profiles", e);
  }
  // Legacy migration: pre-multi-profile localStorage stored grades on a
  // top-level "jupas-staging-grades" key. Pull those into a default profile.
  let grades: StudentGrades = {};
  try {
    const legacyGrades = localStorage.getItem("jupas-staging-grades");
    grades = legacyGrades ? sanitizeGrades(JSON.parse(legacyGrades)) : {};
  } catch (e) {
    console.error("Failed to load legacy grades", e);
  }
  if (Object.keys(grades).length > 0) {
    return [{ id: "default", name: "My Profile", grades, pickedCodes: [] }];
  }
  return [];
}

function sanitizeProfiles(rawProfiles: unknown): Profile[] {
  if (!Array.isArray(rawProfiles)) return [];
  return rawProfiles.slice(0, 8).flatMap((profile, index) => {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return [];
    const candidate = profile as Partial<Profile>;
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `profile-${index + 1}`;
    const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 60) : `My Profile ${index + 1}`;
    const picks = Array.isArray(candidate.pickedCodes) ? sanitizeStoredPickedCodes(candidate.pickedCodes) : [];
    return [{ id, name, grades: sanitizeGrades(candidate.grades), pickedCodes: picks }];
  });
}

function sanitizeStoredPickedCodes(raw: unknown[]): (string | null)[] {
  const PROGRAMME_CODE = /^JS\d{4}$/;
  const cleaned = raw.slice(0, 20).map((code) => {
    if (typeof code !== "string") return null;
    const trimmed = code.trim().toUpperCase();
    return PROGRAMME_CODE.test(trimmed) ? trimmed : null;
  });
  // Trim trailing nulls (keep sparse internals).
  let lastNonNull = -1;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    if (cleaned[i] !== null) { lastNonNull = i; break; }
  }
  return cleaned.slice(0, lastNonNull + 1);
}

function loadActiveProfileId(profiles: Profile[]): string {
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
