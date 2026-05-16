/// <reference types="vite/client" />

// Injected at build time via vite.config.ts → define.__APP_VERSION__
// Single source of truth: staging/package.json "version".
declare const __APP_VERSION__: string;
