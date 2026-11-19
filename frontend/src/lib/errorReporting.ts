import { Capacitor } from "@capacitor/core";

// Sends crashes and failed loads to the user canister's error log
// (backend/user/main.mo, "App error log"), where admins read them on the
// moderation page. No third-party crash service, so no extra party sees
// users' data, and nothing identifying goes in a report: principals and
// email addresses are stripped from the text, ids and tokens from the route,
// and the canister doesn't store who sent it.

export type ErrorKind = "crash" | "unhandled" | "load";

const MAX_PER_PAGE_LOAD = 10;
const sent = new Set<string>();

// Textual principals and canister ids: groups of base32 separated by dashes
// (e.g. "rdmx6-jaaaa-aaaaa-aaadq-cai"; the anonymous one is "2vxsx-fae").
const PRINCIPAL_RE = /\b[a-z0-9]{5}(?:-[a-z0-9]{1,5}){1,10}\b/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** Removes principals and email addresses from error text. */
export function scrub(text: string): string {
  return text.replace(EMAIL_RE, "<email>").replace(PRINCIPAL_RE, "<principal>");
}

/**
 * The route without anything specific to one user: share tokens, report and
 * challenge ids, principals and article ids become ":x".
 */
export function routeShape(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) => (seg.length > 16 || /\d/.test(seg) ? ":x" : seg))
    .join("/");
}

function platform(): string {
  try { return Capacitor.getPlatform(); } catch { return "web"; }
}

export function reportError(kind: ErrorKind, error: unknown, extraStack = ""): void {
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return;
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error));
  const message = scrub(`${err.name}: ${err.message}`).slice(0, 500);
  const key = `${kind}|${message}`;
  if (sent.has(key) || sent.size >= MAX_PER_PAGE_LOAD) return;
  sent.add(key);
  const report = {
    kind,
    message,
    stack: scrub(`${err.stack ?? ""}${extraStack ? `\n${extraStack}` : ""}`).slice(0, 2000),
    route: routeShape(window.location.pathname),
    release: typeof __APP_RELEASE__ !== "undefined" ? __APP_RELEASE__ : "dev",
    platform: platform(),
  };
  // Loaded on first use so the user service isn't pulled into every chunk
  // that can report. A failed report is dropped, never reported.
  import("../services/user")
    .then(({ userService }) => userService.logClientError(report))
    .catch(() => {});
}

let installed = false;

/** Catches errors nothing else handled. Call once at app start. */
export function installErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => reportError("unhandled", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("unhandled", e.reason));
}

/** For tests. */
export function resetErrorReporting(): void {
  sent.clear();
}
