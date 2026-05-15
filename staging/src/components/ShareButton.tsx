import { memo, useState } from "react";
import { buildShareUrl } from "../lib/hashState";
import type { StudentGrades } from "../types/jupas";

type Props = {
  grades: StudentGrades;
  pickedCodes: (string | null)[];
};

export const ShareButton = memo(({ grades, pickedCodes }: Props) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = buildShareUrl(grades, pickedCodes);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL: ", err);
    }
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      className="stepper-next-btn"
      type="button"
      onClick={handleShare}
      title="Copy share page link and open the share view"
    >
      {copied ? "Link copied" : "Share"}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 6 }}>
        <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="16 6 12 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </button>
  );
});
