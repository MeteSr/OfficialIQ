/// <reference types="vite/client" />

// Globals injected by vite.config.ts define block.
// Build-time fallback canister IDs (see src/lib/icEnv.ts); the `ic_env`
// cookie takes precedence whenever the page is served with one.
declare const __ICP_CANISTER_IDS__: Partial<Record<import("./lib/icEnv").CanisterName, string>>;
declare const VITE_VAPID_PUBLIC_KEY: string;
// The web origin native sign-in returns to (src/lib/nativeAuth.ts).
declare const __NATIVE_WEB_ORIGIN__: string;
// What this build switches on (src/lib/features.ts). Same shape as
// build-config/features.ts's Features, which produces it; repeated here
// because the app's tsconfig can't import from build-config.
declare const __FEATURES__: {
  sports: string[];
  audio: boolean;
  clipSubmissions: boolean;
  ai: boolean;
  webPush: boolean;
  nativePush: boolean;
  paywall: boolean;
  checkout: { monthly: string; yearly: string; portal: string };
};
// Release tag sent with error reports (src/lib/errorReporting.ts).
declare const __APP_RELEASE__: string;
