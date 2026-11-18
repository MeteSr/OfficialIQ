/// <reference types="vite/client" />

// Globals injected by vite.config.ts define block.
// Build-time fallback canister IDs (see src/lib/icEnv.ts); the `ic_env`
// cookie takes precedence whenever the page is served with one.
declare const __ICP_CANISTER_IDS__: Partial<Record<import("./lib/icEnv").CanisterName, string>>;
declare const VITE_VAPID_PUBLIC_KEY: string;
