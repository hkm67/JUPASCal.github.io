import { useEffect, useState } from "react";
import type { Profile } from "../types/jupas";
import { ProfileChip } from "./ProfileSwitcher";

type Lang = "en" | "zh";

function loadLang(): Lang {
  const saved = localStorage.getItem("jupas-staging-lang");
  return saved === "zh" ? "zh" : "en";
}

type Theme = "light" | "dark";

type Props = {
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  profiles?: Profile[];
  activeProfileId?: string;
  onProfileSelect?: (id: string) => void;
  onProfileAdd?: () => void;
  onProfileRename?: (id: string, name: string) => void;
  onProfileDelete?: (id: string) => void;
};

export function AppHeader({
  theme,
  onThemeChange,
  profiles,
  activeProfileId,
  onProfileSelect,
  onProfileAdd,
  onProfileRename,
  onProfileDelete,
}: Props) {
  const canToggleTheme = theme !== undefined && onThemeChange !== undefined;
  const isDark = theme === "dark";
  const [lang, setLang] = useState<Lang>(() => loadLang());

  useEffect(() => {
    localStorage.setItem("jupas-staging-lang", lang);
  }, [lang]);
  const showProfileChip =
    profiles &&
    activeProfileId !== undefined &&
    onProfileSelect &&
    onProfileAdd &&
    onProfileRename &&
    onProfileDelete;

  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        <a className="app-brand" href="./" aria-label="JUPASCal 2026 — home">
          <span className="app-brand-name">
            JUPASCal <span className="app-brand-year">2026</span>
          </span>
        </a>
      </div>

      <nav className="app-topbar-actions" aria-label="Primary">
        {showProfileChip ? (
          <ProfileChip
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSelect={onProfileSelect}
            onAdd={onProfileAdd}
            onRename={onProfileRename}
            onDelete={onProfileDelete}
          />
        ) : null}

        <a
          className="topbar-icon"
          href="#about"
          aria-label="About JUPAS Cal"
          title="About"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
            <path d="M12 11v6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </a>

        <button
          type="button"
          className="topbar-icon lang-toggle"
          aria-label={`Language: ${lang === "en" ? "English" : "Chinese"}. Click to switch.`}
          title="Language (placeholder — translation coming soon)"
          onClick={() => setLang(lang === "en" ? "zh" : "en")}
        >
          <span className="lang-toggle-current">{lang === "en" ? "EN" : "中"}</span>
          <svg className="lang-toggle-swap" viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
            <path d="M2 4h7l-1.6-1.6M10 8H3l1.6 1.6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {canToggleTheme ? (
          <button
            type="button"
            className="topbar-icon theme-icon"
            aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
            aria-pressed={isDark}
            onClick={() => onThemeChange?.(isDark ? "light" : "dark")}
          >
            {isDark ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M5.2 18.8l1.9-1.9M16.9 7.1l1.9-1.9" />
                </g>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M20.5 14.6A8.4 8.4 0 0 1 9.4 3.5a.7.7 0 0 0-.92-.86A9.8 9.8 0 1 0 21.36 15.5a.7.7 0 0 0-.86-.9Z"
                />
              </svg>
            )}
          </button>
        ) : null}
      </nav>
    </header>
  );
}
