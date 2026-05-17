import { memo, useEffect, useRef, useState } from "react";
import type { Profile } from "../types/jupas";

function RenameModal({ initialName, onSave, onClose }: { initialName: string; onSave: (name: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSave(trimmed);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="rename-modal-backdrop" onClick={handleBackdropClick}>
      <div className="rename-modal" role="dialog" aria-modal="true" aria-label="Rename profile">
        <h2 className="rename-modal-title">Rename Profile</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="rename-modal-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Profile name"
            autoComplete="off"
          />
          <div className="rename-modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="stepper-next-btn" disabled={!value.trim()}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type Props = {
  profiles: Profile[];
  activeProfileId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  // Clear all locally-saved profiles, picks, and grades; reloads to a
  // fresh first-visit state. Wired from App.tsx — keeps the wording
  // layman ("Start fresh") so non-technical users understand it.
  onResetAll?: () => void;
};

export const ProfileBar = memo(({ profiles, activeProfileId, onSelect, onAdd, onRename, onDelete, onResetAll }: Props) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  useEffect(() => {
    if (!moreOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [moreOpen]);

  function handleRename() {
    setMoreOpen(false);
    setRenaming(true);
  }

  function handleDelete() {
    setMoreOpen(false);
    if (confirm(`Delete "${activeProfile?.name}"?`)) onDelete(activeProfileId);
  }

  function handleResetAll() {
    setMoreOpen(false);
    if (!onResetAll) return;
    if (confirm("Start fresh? This deletes all your profiles, grades, and picks on this device. You can't undo this.")) {
      onResetAll();
    }
  }

  return (
    <>
    {renaming && activeProfile && (
      <RenameModal
        initialName={activeProfile.name}
        onSave={(name) => { onRename(activeProfileId, name); setRenaming(false); }}
        onClose={() => setRenaming(false)}
      />
    )}
    <div className="profile-bar">
      <div className="profile-bar-left">
        <select
          className="profile-bar-select"
          value={activeProfileId}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Select profile"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <button className="ghost-button" type="button" onClick={onAdd} title="Create new profile">
          + New
        </button>

        <div className="profile-more" ref={moreRef}>
          <button
            className={moreOpen ? "ghost-button profile-more-btn active" : "ghost-button profile-more-btn"}
            type="button"
            aria-label="More profile options"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((o) => !o)}
          >
            ···
          </button>

          {moreOpen && (
            <div className="profile-more-dropdown" role="menu">
              <button
                className="profile-more-item"
                type="button"
                role="menuitem"
                onClick={handleRename}
              >
                Rename
              </button>
              <button
                className="profile-more-item profile-more-item--danger"
                type="button"
                role="menuitem"
                disabled={profiles.length <= 1}
                onClick={handleDelete}
              >
                Delete
              </button>
              {onResetAll ? (
                <button
                  className="profile-more-item profile-more-item--danger"
                  type="button"
                  role="menuitem"
                  onClick={handleResetAll}
                  title="Wipe all locally-saved profiles, grades, and picks on this device"
                >
                  Start fresh (clear everything)
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

    </div>
    </>
  );
});

export const ProfileChip = memo(({ profiles, activeProfileId, onSelect, onAdd, onRename, onDelete, onResetAll }: Props) => {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = profiles.find((p) => p.id === activeProfileId);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
  }

  function handleAdd() {
    onAdd();
    setOpen(false);
  }

  function handleRename() {
    setOpen(false);
    setRenaming(true);
  }

  function handleDelete() {
    setOpen(false);
    if (confirm(`Delete "${active?.name}"?`)) onDelete(activeProfileId);
  }

  function handleResetAll() {
    setOpen(false);
    if (!onResetAll) return;
    if (confirm("Start fresh? This deletes all your profiles, grades, and picks on this device. You can't undo this.")) {
      onResetAll();
    }
  }

  return (
    <>
      {renaming && active && (
        <RenameModal
          initialName={active.name}
          onSave={(name) => { onRename(activeProfileId, name); setRenaming(false); }}
          onClose={() => setRenaming(false)}
        />
      )}
      <div className="profile-chip" ref={wrapRef}>
        <span className="profile-chip-sep" aria-hidden="true">·</span>
        <button
          type="button"
          className={open ? "profile-chip-button open" : "profile-chip-button"}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="profile-chip-name">{active?.name || "My Profile"}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div className="profile-chip-menu" role="menu">
            <p className="profile-chip-section-title">Scenarios</p>
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className={p.id === activeProfileId ? "profile-chip-item is-active" : "profile-chip-item"}
                onClick={() => handleSelect(p.id)}
              >
                <span>{p.name}</span>
                {p.id === activeProfileId ? (
                  <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
                    <path d="M1 5l3.5 3.5L11 1.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </button>
            ))}
            <hr className="profile-chip-divider" />
            <button type="button" role="menuitem" className="profile-chip-item" onClick={handleAdd}>
              + New scenario
            </button>
            <button type="button" role="menuitem" className="profile-chip-item" onClick={handleRename}>
              Rename current
            </button>
            <button
              type="button"
              role="menuitem"
              className="profile-chip-item is-danger"
              disabled={profiles.length <= 1}
              onClick={handleDelete}
            >
              Delete current
            </button>
            {onResetAll ? (
              <button
                type="button"
                role="menuitem"
                className="profile-chip-item is-danger"
                onClick={handleResetAll}
                title="Wipe all locally-saved profiles, grades, and picks on this device"
              >
                Start fresh (clear everything)
              </button>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
});
