import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { preloadHashState } from "./lib/hashState";
import "./styles.css";

// Dynamic-import App AFTER the hash cache is hydrated. App.tsx has
// module-level constants (`INITIAL_HASH_STATE` etc.) that call
// readHashState() at evaluation time — if App were statically imported,
// those constants would run before preloadHashState resolved, missing
// the state for compressed URLs (which can only be decoded async via
// CompressionStream).
preloadHashState().finally(async () => {
  const { default: App } = await import("./App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
