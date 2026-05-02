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
};

export const ProfileBar = memo(({ profiles, activeProfileId, onSelect, onAdd, onRename, onDelete }: Props) => {
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
            </div>
          )}
        </div>
      </div>

    </div>
    </>
  );
});
