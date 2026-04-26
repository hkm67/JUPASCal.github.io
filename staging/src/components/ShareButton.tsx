import { memo, useState } from "react";

export const ShareButton = memo(() => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL: ", err);
      alert("Failed to copy URL to clipboard.");
    }
  };

  return (
    <button
      className={copied ? "ghost-button share-button copied" : "ghost-button share-button"}
      type="button"
      onClick={handleShare}
      title="Copy shareable link to clipboard"
    >
      {copied ? "Copied!" : "Share Link"}
    </button>
  );
});
