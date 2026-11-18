import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";

// Canister IDs and the network root key, per the icp-cli / user-sign-in
// skills: the frontend canister (and `vite dev`, see vite.config.ts) sets an
// `ic_env` cookie carrying `PUBLIC_CANISTER_ID:<name>` for every canister plus
// `IC_ROOT_KEY`, so the same build works locally, on staging and on mainnet.
//
// Clients that never receive that cookie — the Capacitor Android app serves
// the bundle from its own origin — fall back to the IDs baked in at build
// time (`__ICP_CANISTER_IDS__`, from icp.yaml's presync step) and the agent's
// built-in mainnet root key.

export type CanisterName =
  | "user" | "content" | "question" | "exam" | "ranking"
  | "challenge" | "ai_proxy" | "mentorship" | "association" | "report";

const cookieEnv = safeGetCanisterEnv<Record<string, string>>();

/** True when the page was served with an `ic_env` cookie (frontend canister or `vite dev`). */
export const HAS_IC_ENV = cookieEnv !== undefined;

/** Root key of the network serving the page; undefined means "use the mainnet key". */
export const IC_ROOT_KEY: Uint8Array | undefined = cookieEnv?.IC_ROOT_KEY;

/**
 * Agent host. With the cookie, leave it unset so the agent resolves the
 * page's own gateway (local network, ic0.app/icp0.io/icp.net) or icp-api.io
 * on custom domains. Without it (native app), talk to mainnet explicitly —
 * the agent would otherwise call the app's own `https://localhost` origin.
 */
export const IC_HOST: string | undefined = HAS_IC_ENV ? undefined : "https://icp-api.io";

const BUILD_TIME_IDS: Partial<Record<CanisterName, string>> =
  typeof __ICP_CANISTER_IDS__ !== "undefined" ? __ICP_CANISTER_IDS__ : {};

/** ID of a backend canister, or "" if it isn't deployed (services then fall back to stub data). */
export function canisterId(name: CanisterName): string {
  return cookieEnv?.[`PUBLIC_CANISTER_ID:${name}`] ?? BUILD_TIME_IDS[name] ?? "";
}

/**
 * The web app's origin, baked in at build time for the native app's sign-in:
 * Internet Identity returns to `<origin>/native-callback`, and that origin is
 * what a user's principal is derived from, so it must be the same one the
 * website is served on (src/lib/nativeAuth.ts). Empty in dev builds.
 */
export const NATIVE_WEB_ORIGIN: string =
  typeof __NATIVE_WEB_ORIGIN__ !== "undefined" ? __NATIVE_WEB_ORIGIN__ : "";
