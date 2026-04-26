import { memo } from "react";
import type { Profile } from "../types/jupas";

type Props = {
  profiles: Profile[];
  activeProfileId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

export const ProfileSwitcher = memo(({ profiles, activeProfileId, onSelect, onAdd, onRename, onDelete }: Props) => {
  return (
    <div className="profile-action-row">
      <div className="profile-switcher">
        <select
          value={activeProfileId}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Select profile"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="ghost-button" type="button" onClick={onAdd} title="Add new profile">
          + New
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={() => {
            const profile = profiles.find((p) => p.id === activeProfileId);
            if (profile) {
              const newName = prompt("Enter new profile name:", profile.name);
              if (newName) onRename(activeProfileId, newName);
            }
          }}
          title="Rename current profile"
        >
          Rename
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={profiles.length <= 1}
          onClick={() => {
            if (confirm("Delete this profile?")) {
              onDelete(activeProfileId);
            }
          }}
          title="Delete current profile"
        >
          Delete
        </button>
      </div>
    </div>
  );
});
