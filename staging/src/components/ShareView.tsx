import { useRef, useState, useEffect } from "react";
import { toPng } from "html-to-image";
import { AppHeader } from "./AppHeader";
import { buildEditUrlFromCurrentHash, readHashState, setShowScoresInHash } from "../lib/hashState";
import { institutionLabel } from "../lib/institutions";
import { bandLabel, formatDelta, formatPercent } from "../lib/results";
import type { Profile, ProgrammeResult } from "../types/jupas";

type Props = {
  profileName: string;
  results: (ProgrammeResult | null)[];
  profiles?: Profile[];
  activeProfileId?: string;
  onProfileChange?: (id: string) => void;
};

const PRIORITY_SLOTS = ["A1", "A2", "A3", "B1", "B2", "B3"];

export function ShareView({ profileName, results, profiles, activeProfileId, onProfileChange }: Props) {
  const resultsNonNull = results.filter((r): r is ProgrammeResult => r !== null);
  const eligibleCount = resultsNonNull.filter((r) => r.eligibility.eligible).length;
  const aboveMedianCount = resultsNonNull.filter(
    (r) => r.band === "above-uq" || r.band === "above-median"
  ).length;
  const belowLqCount = resultsNonNull.filter((r) => r.band === "below-lq").length;

  const recapRef = useRef<HTMLDivElement | null>(null);
  const [downloadState, setDownloadState] = useState<"idle" | "rendering" | "done" | "error">("idle");

  async function handleEdit() {
    const editUrl = await buildEditUrlFromCurrentHash();
    window.history.replaceState(null, "", editUrl);
    window.location.reload();
  }

  function handleCreate() {
    window.location.href = window.location.origin + window.location.pathname;
  }

  const safeFileName = (profileName.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 32) || "jupas-plan");

  async function renderRecapPng(): Promise<string | null> {
    if (!recapRef.current) return null;
    // No backgroundColor → PNG keeps transparent pixels outside the card's
    // rounded corners, so the saved image doesn't show a black/white frame.
    return toPng(recapRef.current, {
      pixelRatio: 2,
      cacheBust: true,
    });
  }

  async function handleDownload() {
    setDownloadState("rendering");
    try {
      const dataUrl = await renderRecapPng();
      if (!dataUrl) throw new Error("recap card not mounted");
      const link = document.createElement("a");
      link.download = `${safeFileName}-jupas-recap.png`;
      link.href = dataUrl;
      link.click();
      setDownloadState("done");
      window.setTimeout(() => setDownloadState("idle"), 1800);
    } catch (error) {
      console.error("Failed to render recap image", error);
      setDownloadState("error");
      window.setTimeout(() => setDownloadState("idle"), 2400);
    }
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${profileName}'s JUPAS 2026 plan · ${resultsNonNull.length} programme${resultsNonNull.length === 1 ? "" : "s"}`;

  const [shareState, setShareState] = useState<"idle" | "sharing" | "done" | "error">("idle");
  const [copyState, setCopyState] = useState<"idle" | "done">("idle");
  const [toast, setToast] = useState<{ text: string; tone: "info" | "success" | "error" } | null>(null);

  function showToast(text: string, tone: "info" | "success" | "error" = "success", ms = 2200) {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), ms);
  }

  async function handleNativeShare() {
    setShareState("sharing");
    try {
      const dataUrl = await renderRecapPng();
      if (dataUrl && navigator.canShare) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `${safeFileName}-jupas-recap.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${profileName} · JUPAS 2026 plan`,
            text: `${shareText}\n${shareUrl}`,
            files: [file],
          });
          setShareState("done");
          showToast("Share sheet opened", "success");
          window.setTimeout(() => setShareState("idle"), 1500);
          return;
        }
      }
      // Fallback A: share text + URL only (no file support).
      if (navigator.share) {
        await navigator.share({
          title: `${profileName} · JUPAS 2026 plan`,
          text: shareText,
          url: shareUrl,
        });
        setShareState("done");
        showToast("Share sheet opened", "success");
        window.setTimeout(() => setShareState("idle"), 1500);
        return;
      }
      // Fallback B: download the recap PNG so the user can post it manually,
      // and copy the link so paste works in the target app.
      if (dataUrl) {
        const link = document.createElement("a");
        link.download = `${safeFileName}-jupas-recap.png`;
        link.href = dataUrl;
        link.click();
      }
      try { await navigator.clipboard.writeText(shareUrl); } catch { /* ignore */ }
      showToast(
        "Image saved + link copied. Open your target app and attach the image.",
        "info",
        3600,
      );
      setShareState("done");
      window.setTimeout(() => setShareState("idle"), 1500);
    } catch (error) {
      // User cancelled the share sheet — treat as silent abort.
      if ((error as Error)?.name === "AbortError") {
        setShareState("idle");
        return;
      }
      console.error("Failed to share recap", error);
      setShareState("error");
      showToast("Couldn't share — try again", "error");
      window.setTimeout(() => setShareState("idle"), 2400);
    }
  }

  function openIntent(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function isMobileLike(): boolean {
    if (typeof navigator === "undefined") return false;
    return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  }

  function isIOS(): boolean {
    if (typeof navigator === "undefined") return false;
    // iPadOS 13+ reports as "MacIntel" with maxTouchPoints > 1, so we
    // sniff that case too.
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  async function copyImageToClipboard(blob: Blob): Promise<boolean> {
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch {
      return false;
    }
  }

  // navigator.share() field-strip workaround for iOS Safari. WebKit has a
  // long-standing bug (3+ yrs, surfaced on Apple Dev Forums for FB / WhatsApp
  // / IG) where combining `files` with `title`/`text`/`url` strips the file
  // and shares only the text. On iOS we MUST pass files alone.
  async function shareFilesSafely(file: File, fallbackText: string): Promise<"shared" | "aborted" | "unsupported"> {
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
      return "unsupported";
    }
    const payload: ShareData = isIOS() ? { files: [file] } : { files: [file], text: fallbackText };
    try {
      await navigator.share(payload);
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "aborted";
      return "unsupported";
    }
  }

  // Instagram Stories: only Web Share API can deliver the image
  // pre-attached on web — IG's direct-prefill (UIPasteboard with custom
  // UTType identifiers) is reachable only from native apps. So we use
  // Web Share with iOS field-strip, and fall back to deep link + clipboard
  // copy when Web Share isn't available (e.g. desktop).
  async function handleInstagramShare() {
    setShareState("sharing");
    try {
      const dataUrl = await renderRecapPng();
      if (!dataUrl) throw new Error("recap card not mounted");
      const blob = await (await fetch(dataUrl)).blob();
      // Filename doubles as the prompt — iOS shows it at the top of the
      // share sheet, so we name it after the destination app so the user
      // immediately knows which icon to tap.
      const file = new File([blob], `Share-to-Instagram-${safeFileName}.png`, { type: "image/png" });

      // Show the prompt BEFORE invoking the share sheet — the sheet covers
      // most of the screen, and once `await navigator.share()` resolves
      // (after the user picks an app or dismisses), the user has already
      // left the page. A pre-share toast at the top stays visible behind
      // the sheet, where the user can actually read it.
      const willShowSheet = navigator.canShare && navigator.canShare({ files: [file] });
      if (willShowSheet && isMobileLike()) {
        showToast("Pick Instagram in the share sheet — scroll right if needed", "success", 30000);
      }

      const result = await shareFilesSafely(file, `${shareText}\n${shareUrl}`);
      if (result === "shared") {
        setToast(null);
        setShareState("done");
        window.setTimeout(() => setShareState("idle"), 1500);
        return;
      }
      if (result === "aborted") {
        setToast(null);
        setShareState("idle");
        return;
      }

      // Web Share unsupported — copy the image to clipboard and open
      // Instagram. (Skip the <a download> on mobile: iOS Safari treats
      // it as a navigation to the data URL and replaces the page, which
      // blocks the deep link from running.)
      const copied = await copyImageToClipboard(blob);
      if (!copied && !isMobileLike()) {
        const a = document.createElement("a");
        a.download = `Share-to-Instagram-${safeFileName}.png`;
        a.href = dataUrl;
        a.click();
      }

      if (isMobileLike()) {
        showToast(
          copied
            ? "Opening Instagram — pick the recap image from your Photos."
            : "Opening Instagram — pick the recap image from your Photos.",
          "info",
          4400,
        );
        window.location.href = "instagram-stories://share";
      } else {
        showToast(
          copied
            ? "Image copied. Open Instagram on your phone to post it."
            : "Image saved. Open Instagram on your phone to post it.",
          "info",
          4200,
        );
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      }
      setShareState("done");
      window.setTimeout(() => setShareState("idle"), 1500);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        setShareState("idle");
        return;
      }
      console.error("Failed to share to Instagram", error);
      setShareState("error");
      showToast("Couldn't share — try again", "error");
      window.setTimeout(() => setShareState("idle"), 2400);
    }
  }

  // Threads: Web Share API path is the cleanest — picking Threads from the
  // iOS share sheet delivers the image natively attached to a new post.
  // (Pre-fix the share sheet appeared to work but was stripping the file
  // due to the iOS Safari files+text WebKit bug.) Fallback uses the
  // threads.net/intent/post universal link with clipboard image.
  async function handleThreadsShare() {
    setShareState("sharing");
    try {
      const dataUrl = await renderRecapPng();
      if (!dataUrl) throw new Error("recap card not mounted");
      const blob = await (await fetch(dataUrl)).blob();
      // Filename doubles as the prompt — iOS shows it at the top of the
      // share sheet, so we name it after the destination app.
      const file = new File([blob], `Share-to-Threads-${safeFileName}.png`, { type: "image/png" });

      // Show the prompt BEFORE invoking the share sheet so it stays
      // visible at the top of the screen while the sheet is open.
      const willShowSheet = navigator.canShare && navigator.canShare({ files: [file] });
      if (willShowSheet && isMobileLike()) {
        showToast("Pick Threads in the share sheet — scroll right if needed", "success", 30000);
      }

      const result = await shareFilesSafely(file, `${shareText}\n${shareUrl}`);
      if (result === "shared") {
        setToast(null);
        setShareState("done");
        window.setTimeout(() => setShareState("idle"), 1500);
        return;
      }
      if (result === "aborted") {
        setToast(null);
        setShareState("idle");
        return;
      }

      const copied = await copyImageToClipboard(blob);
      if (!copied && !isMobileLike()) {
        const a = document.createElement("a");
        a.download = `Share-to-Threads-${safeFileName}.png`;
        a.href = dataUrl;
        a.click();
      }
      const intentUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
      window.open(intentUrl, "_blank", "noopener,noreferrer");
      showToast(
        copied
          ? "Threads opened — long-press in the post to paste the image."
          : "Threads opened — attach the saved image to your post.",
        "info",
        4000,
      );
      setShareState("done");
      window.setTimeout(() => setShareState("idle"), 1500);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        setShareState("idle");
        return;
      }
      console.error("Failed to share to Threads", error);
      setShareState("error");
      showToast("Couldn't share — try again", "error");
      window.setTimeout(() => setShareState("idle"), 2400);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("done");
      showToast("Link copied to clipboard", "success");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("idle");
      showToast("Couldn't copy — your browser blocked the clipboard.", "error");
    }
  }

  const supportsNativeShare = typeof navigator !== "undefined" && (typeof navigator.share === "function");
  const [showScores, setShowScores] = useState<boolean>(() => readHashState()?.showScores === true);

  useEffect(() => {
    setShowScoresInHash(showScores);
  }, [showScores]);
  const total = resultsNonNull.length;
  const downloadLabel =
    downloadState === "rendering"
      ? "Rendering…"
      : downloadState === "done"
        ? "Saved!"
        : downloadState === "error"
          ? "Failed — try again"
          : "Download image";

  return (
    <div className="share-view">
      <AppHeader />

      <header className="share-header">
        <div className="share-header-text">
          <p className="eyebrow">Shared JUPAS plan · 2026</p>
          <h1>{profileName}</h1>
          <p className="share-header-stats">
            {total
              ? `${total} choices · ${eligibleCount} eligible · ${aboveMedianCount} above 2025 median${belowLqCount ? ` · ${belowLqCount} below LQ` : ""}`
              : "No programmes selected yet"}
          </p>
        </div>
        <div className="share-header-actions">
          {profiles && profiles.length > 1 && onProfileChange ? (
            <label className="share-profile-switch">
              <span>Profile</span>
              <select
                value={activeProfileId || ""}
                onChange={(event) => onProfileChange(event.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className="ghost-button" onClick={handleEdit}>
            Edit this profile
          </button>
        </div>
      </header>

      <section className="share-recap-section">
        <div className="recap-card" ref={recapRef} aria-label="JUPAS recap card">
          <div className="recap-card-top">
            <span>JUPAS Cal · 2026</span>
            <b>{profileName}</b>
          </div>

          {/* Mascot placeholder — drop final artwork into .recap-mascot later. */}
          <div className="recap-mascot" aria-hidden="true">
            <div className="recap-mascot-circle">
              <span className="recap-mascot-emoji" role="img" aria-hidden="true">🎓</span>
            </div>
          </div>

          <div className="recap-bars">
            {["A1", "A2", "A3"].map((slot, index) => {
              const result = results[index] ?? null;
              return (
                <div
                  key={slot}
                  className={result ? `recap-bar filled band-${result.band}` : "recap-bar empty"}
                >
                  {result ? (
                    <>
                      <div className="recap-bar-headline">
                        <span className="recap-bar-slot">{slot}</span>
                        <strong>{result.programme.jupas_code}</strong>
                        <span className="recap-bar-inst">{institutionLabel(result.programme.institution)}</span>
                        <em className="recap-bar-name">
                          <span className="recap-bar-name-en">{shortenProgrammeName(result.programme.name_en)}</span>
                          {result.programme.name_zh ? (
                            <span className="recap-bar-name-zh">{shortenProgrammeName(result.programme.name_zh)}</span>
                          ) : null}
                        </em>
                      </div>
                      <div className="recap-bar-benchline">
                        <BenchTrack result={result} showScore={showScores} />
                        <b className={`band ${result.band}`}>{bandLabel(result.band)}</b>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="recap-bar-slot">{slot}</span>
                      <span className="recap-bar-open">Open slot</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="recap-footnote">jupascal.com · unofficial JUPAS calculator · for reference only</p>
        </div>

        <label className="recap-toggle">
          <input
            type="checkbox"
            checked={showScores}
            onChange={(event) => setShowScores(event.target.checked)}
          />
          <span>Show my calculated scores on the card</span>
        </label>

        <div className="share-action-row" aria-label="Share this plan">
          <button
            type="button"
            className="share-action icon-only primary"
            onClick={() => handleNativeShare()}
            disabled={shareState === "sharing"}
            aria-label={supportsNativeShare ? "Share via…" : "Copy link to share"}
            title={shareState === "sharing" ? "Opening…" : shareState === "done" ? "Shared!" : "Share via…"}
          >
            <ShareIcon />
          </button>
          <button
            type="button"
            className="share-action icon-only whatsapp"
            onClick={() => openIntent(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`)}
            aria-label="Share on WhatsApp"
            title="WhatsApp"
          >
            <WhatsAppIcon />
          </button>
          <button
            type="button"
            className="share-action icon-only threads"
            onClick={handleThreadsShare}
            aria-label="Share on Threads"
            title="Threads (opens the Threads composer with the recap image)"
          >
            <ThreadsIcon />
          </button>
          <button
            type="button"
            className="share-action icon-only instagram"
            onClick={handleInstagramShare}
            aria-label="Share on Instagram"
            title="Instagram (opens Instagram Stories on mobile, with the image ready to attach)"
          >
            <InstagramIcon />
          </button>
          <button
            type="button"
            className="share-action icon-only download"
            onClick={handleDownload}
            disabled={downloadState === "rendering"}
            aria-label={downloadLabel}
            title={downloadLabel}
          >
            <DownloadIcon />
          </button>
          <button
            type="button"
            className="share-action icon-only link"
            onClick={handleCopyLink}
            aria-label={copyState === "done" ? "Link copied" : "Copy link"}
            title={copyState === "done" ? "Link copied!" : "Copy link"}
          >
            <LinkIcon />
          </button>
        </div>
      </section>

      <section className="share-plan-section">
        <div className="share-section-bar">
          <div>
            <p className="eyebrow">Full plan</p>
            <h2>All 6 priority slots</h2>
          </div>
        </div>

        <ol className="plan-table" aria-label="Six priority programmes">
          <li className="plan-row plan-row-header" aria-hidden="true">
            <span>Slot</span>
            <span>Programme</span>
            <span>Score</span>
            <span>Band</span>
            <span>Eligible</span>
            <span className="plan-row-chevron-col" />
          </li>
          {PRIORITY_SLOTS.map((slot, index) => (
            <PlanRow
              key={slot}
              slot={slot}
              result={results[index] ?? null}
            />
          ))}
        </ol>
      </section>

      <p className="share-disclaimer">
        Scores are estimated using 2025 admission data and 2026 weightings. Final admission depends on JUPAS ranking, places, interviews, and competition.
      </p>

      <footer className="share-footer">
        <p className="muted">Curious about your own JUPAS positioning?</p>
        <button type="button" className="ghost-button" onClick={handleCreate}>
          Calculate your own
        </button>
      </footer>

      {toast ? (
        <div className={`share-toast share-toast-${toast.tone}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function shortenProgrammeName(raw: string | undefined | null): string {
  if (!raw) return "";
  // Drop anything after the first parenthetical / colon — JUPAS programme
  // names commonly tail with "(Features: …)", "(Streams: …)" or
  // "(Subject to approval)" which is noise on a recap card.
  const cut = raw.split(/\s*[(（:：]/)[0];
  return cut.trim();
}

function BenchTrack({ result, showScore }: { result: ProgrammeResult; showScore: boolean }) {
  const scores = result.programme.scores_2025 || {};
  const lq = scores.lq;
  const median = scores.median;
  const uq = scores.uq;
  const total = result.calculation.totalScore;

  // Programme with no historical benchmarks — render a dashed placeholder.
  if (!lq && !median && !uq) {
    return (
      <div className="recap-bar-track no-score" role="img" aria-label="No 2025 admission data">
        <span className="recap-bar-no-data">No 2025 data</span>
      </div>
    );
  }

  // Piecewise-linear placement that works for ANY subset of {LQ, Median, UQ}
  // present in the data. Anchors are fixed at 20% / 50% / 80% on the track;
  // beyond the extremes we extrapolate using the nearest local span.
  function position(score: number): number {
    const points: Array<[number, number]> = [];
    if (lq != null) points.push([lq, 20]);
    if (median != null) points.push([median, 50]);
    if (uq != null) points.push([uq, 80]);
    if (points.length === 0) return 50;
    points.sort((a, b) => a[0] - b[0]);

    // Single anchor — nudge marker left/right of the anchor proportionally.
    if (points.length === 1) {
      const [anchorScore, anchorPct] = points[0];
      const offset = Math.min(16, Math.abs(score - anchorScore) * 3);
      const dir = score < anchorScore ? -1 : score > anchorScore ? 1 : 0;
      return Math.max(4, Math.min(96, anchorPct + dir * offset));
    }

    // Below the lowest anchor — extrapolate using the next-segment slope.
    if (score <= points[0][0]) {
      const [s0, p0] = points[0];
      const [s1] = points[1];
      const span = Math.max(1e-6, s1 - s0);
      const fraction = (s0 - score) / span;
      return Math.max(4, p0 - fraction * Math.min(16, p0 - 4));
    }
    // Above the highest anchor — extrapolate using the prev-segment slope.
    const lastIdx = points.length - 1;
    if (score >= points[lastIdx][0]) {
      const [sN, pN] = points[lastIdx];
      const [sP] = points[lastIdx - 1];
      const span = Math.max(1e-6, sN - sP);
      const fraction = (score - sN) / span;
      return Math.min(96, pN + fraction * Math.min(16, 96 - pN));
    }
    // Between two adjacent anchors — straight linear interpolation.
    for (let i = 0; i < lastIdx; i++) {
      const [s1, p1] = points[i];
      const [s2, p2] = points[i + 1];
      if (score >= s1 && score <= s2) {
        return p1 + ((score - s1) / Math.max(1e-6, s2 - s1)) * (p2 - p1);
      }
    }
    return 50;
  }

  const pct = position(total);
  const ticks: Array<{ at: number; label: string; value: number }> = [];
  if (lq != null) ticks.push({ at: 20, label: "LQ", value: lq });
  if (median != null) ticks.push({ at: 50, label: "Med", value: median });
  if (uq != null) ticks.push({ at: 80, label: "UQ", value: uq });

  function fmt(n: number) {
    return Number.isInteger(n) ? n.toString() : n.toFixed(1);
  }

  // Hide a tick's value label when the student marker is within 7 percentage
  // points of it, so the two numbers don't stack on top of each other.
  const tooCloseToMarker = (tickPct: number) => showScore && Math.abs(pct - tickPct) < 7;

  return (
    <div
      className="recap-bar-track"
      role="img"
      aria-label={`Your score ${total.toFixed(2)} relative to LQ ${lq ?? "—"}, Median ${median ?? "—"}, UQ ${uq ?? "—"}`}
    >
      {ticks.map((tick) => (
        <span key={tick.label} className="recap-bar-tick" style={{ left: `${tick.at}%` }}>
          {showScore && !tooCloseToMarker(tick.at) ? (
            <span className="recap-bar-tick-value">{fmt(tick.value)}</span>
          ) : null}
          <span className="recap-bar-tick-label">{tick.label}</span>
        </span>
      ))}
      {showScore ? (
        <span className="recap-bar-marker-value" style={{ left: `${pct}%` }}>{total.toFixed(2)}</span>
      ) : null}
      <span className={`recap-bar-marker band-${result.band}`} style={{ left: `${pct}%` }} />
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5v9M4.5 5l3.5-3.5L11.5 5M2 11v3h12v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5v9M4 7l4 4 4-4M2 14h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9 4l2-2a2.5 2.5 0 0 1 3.5 3.5L12 8M7 12l-2 2a2.5 2.5 0 0 1-3.5-3.5L4 8M6 10l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.2-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.5-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.1.2 2.1 3.3 5.2 4.6.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.2-.3-.3-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3C4.4 14.9 4 13.5 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8z"/>
    </svg>
  );
}

function ThreadsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.2 11.3c-.1 0-.2-.1-.3-.1-.2-3-1.8-4.7-4.5-4.7-1.6 0-2.9.7-3.7 2l1.4 1c.6-.9 1.4-1.4 2.3-1.4 1.6 0 2.5 1 2.7 2.9-.7-.2-1.4-.3-2.2-.3-2.4 0-3.9 1.1-4.1 2.7-.1.9.3 1.8 1 2.4.7.6 1.6.9 2.6.9 1.4 0 2.5-.5 3.3-1.5.5-.6.8-1.3 1-2.2.7.4 1.2 1 1.4 1.7.4 1-.1 2.5-1.7 3.4-1.4.8-3.7 1.3-6 .1-2.6-1.4-4.1-3.9-4.1-7.3 0-4.6 2.4-7.6 6.1-7.6 4 0 5.7 2.4 6.2 3.9l1.5-.7c-.7-2-2.9-4.8-7.7-4.8C5 1.8 1.8 5.5 1.8 11c0 4.1 1.9 7.4 5.3 9.1 1.5.8 3.2 1.1 4.7 1.1 2 0 3.7-.5 5-1.5 2-1.4 3-3.7 2.4-5.6-.4-1.4-1.4-2.4-2.9-3zm-4.3 3.3c-1.2.1-2.3-.4-2.4-1.2-.1-.6.4-1.3 2.1-1.4h.5c.6 0 1.2.1 1.7.2-.2 1.7-1.1 2.3-1.9 2.4z"/>
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/>
    </svg>
  );
}

function PlanRow({ slot, result }: { slot: string; result: ProgrammeResult | null }) {
  const [open, setOpen] = useState(false);

  if (!result) {
    return (
      <li className="plan-row plan-row-empty" aria-label={`${slot} empty`}>
        <span className="plan-row-slot">{slot}</span>
        <span className="plan-row-name plan-row-empty-label">Empty slot</span>
        <span />
        <span />
        <span />
        <span className="plan-row-chevron-col" />
      </li>
    );
  }

  const { programme, calculation, eligibility, band } = result;
  const failedReqs = eligibility.details.filter((d) => !d.pass);

  return (
    <>
      <li
        className={`plan-row plan-row-filled band-${band}${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <span className="plan-row-slot">{slot}</span>
        <span className="plan-row-name">
          <strong>{programme.jupas_code}</strong>
          <em>{programme.name_en}</em>
          <small>{institutionLabel(programme.institution)}</small>
        </span>
        <span className="plan-row-score">{calculation.totalScore.toFixed(1)}</span>
        <span className={`plan-row-band band ${band}`}>{bandLabel(band)}</span>
        <span className={eligibility.eligible ? "plan-row-elig pass" : "plan-row-elig fail"}>
          {eligibility.eligible ? "✓" : "✕"}
        </span>
        <span className="plan-row-chevron-col" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <polyline points="3,5 8,11 13,5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </li>
      {open ? (
        <li className="plan-row-expanded">
          <div className="plan-row-expanded-inner">
            <section className="plan-detail-section">
              <h3>2025 benchmark comparison</h3>
              {result.comparisons.length > 0 ? (
                <ol className="plan-benchmarks">
                  {result.comparisons.map((comparison) => (
                    <li
                      key={comparison.key}
                      className={comparison.delta >= 0 ? "plan-benchmark positive" : "plan-benchmark negative"}
                    >
                      <span>{comparison.label}</span>
                      <strong>{comparison.score}</strong>
                      <b>{formatDelta(comparison.delta)}</b>
                      <em>{formatPercent(comparison.percent)}</em>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">No 2025 LQ/Median/UQ data available.</p>
              )}
            </section>

            {failedReqs.length > 0 ? (
              <section className="plan-detail-section">
                <h3>{failedReqs.length} requirement{failedReqs.length === 1 ? "" : "s"} not yet met</h3>
                <ul className="plan-failed-reqs">
                  {failedReqs.map((detail) => (
                    <li key={detail.label}>
                      <strong>{detail.label}:</strong> have <b>{detail.got || "N/A"}</b>, need <b>{detail.need || "—"}</b>
                      {detail.note ? <span> — {detail.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </li>
      ) : null}
    </>
  );
}
