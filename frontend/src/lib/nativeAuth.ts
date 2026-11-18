import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { NativeAuth } from "@officialiq/native-auth";
import type { SignIdentity } from "@icp-sdk/core/agent";
import type { DelegationChain } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import {
  IdbCredentialStorage,
  SessionGoneError,
  SessionIdentity,
  SessionMinter,
  requestSessionDelegation,
} from "@icp-sdk/auth/client";
import { NATIVE_WEB_ORIGIN } from "./icEnv";

// Internet Identity sign-in inside the Capacitor app.
//
// The web app signs in with AuthClient, which opens II in a pop-up and talks to
// it over postMessage (ICRC-29). A native web view has no pop-ups, so the app
// uses II's other transport, ICRC-167: the request travels in the URL fragment
// of id.ai/authorize, and II answers by navigating to an https callback on our
// web origin, with the response in that URL's fragment.
//
// The callback (`<web origin>/native-callback`) is a verified link: an iOS
// associated domain and an Android App Link, both proven by files the
// frontend canister serves under /.well-known (see vite.config.ts). ICRC-167
// forbids custom URL schemes because any app could claim one. On iOS 17.4+ the
// sheet is an ASWebAuthenticationSession that catches the https callback itself
// (plugins/native-auth); older iOS and Android open the system browser
// (SFSafariViewController / Custom Tabs) and the OS hands the link to the app.
//
// What II returns is a *session* delegation to a key generated on this device,
// restricted to the II canister — the same thing AuthClient receives. The app
// then mints short-lived app delegations from it with the SDK's own
// SessionMinter and SessionIdentity, exactly as AuthClient does on the web.
// The callback origin is the web app's origin, so a user gets the same
// principal in the app as on the website.
//
// The delegation is useless without the device key, which never leaves the
// device (a non-extractable WebCrypto key in IndexedDB), so a leaked callback
// URL grants nothing. The `state` check stops a callback from a sign-in this
// device didn't start from signing the user into someone else's account.

export const II_AUTHORIZE_URL = "https://id.ai/authorize";
export const II_CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai";
export const NATIVE_CALLBACK_PATH = "/native-callback";

/** How long a started sign-in may take before its callback is refused (ICRC-167's default flow timeout). */
const FLOW_TIMEOUT_MS = 10 * 60 * 1000;
const SESSION_SLOT = "officialiq-native-session";
const PENDING_SLOT = "officialiq-native-pending";
const APP_SLOT = "officialiq-native-app";
const PENDING_META_KEY = "officialiq.nativeAuth.pending";
const AGENT_OPTIONS = { host: "https://icp-api.io" };

export class NativeSignInCanceled extends Error {
  constructor() {
    super("Sign-in was canceled");
    this.name = "NativeSignInCanceled";
  }
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativeCallbackUrl(origin: string = NATIVE_WEB_ORIGIN): string {
  if (!origin) throw new Error("This build has no web origin for sign-in (NATIVE_WEB_ORIGIN)");
  return `${new URL(origin).origin}${NATIVE_CALLBACK_PATH}`;
}

// ── ICRC-167 encoding (pure, unit-tested) ────────────────────────────────────

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

export type PendingSignIn = { state: string; requestId: string; startedAt: number };

/** The id.ai URL that asks II for a session delegation to `sessionPublicKey`. */
export function buildAuthorizeUrl(opts: {
  sessionPublicKey: Uint8Array;
  callbackUrl: string;
  state: string;
  requestId: string;
  authorizeUrl?: string;
}): string {
  const message = JSON.stringify({
    jsonrpc: "2.0",
    id: opts.requestId,
    method: "ii_session_delegation",
    params: { sessionPublicKey: toBase64(opts.sessionPublicKey) },
  });
  const fragment = new URLSearchParams({ message, callback: opts.callbackUrl, state: opts.state });
  return `${opts.authorizeUrl ?? II_AUTHORIZE_URL}#${fragment.toString()}`;
}

/** True when `url` is this build's sign-in callback (with or without a fragment). */
export function isCallbackUrl(url: string, callbackUrl: string): boolean {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}` === callbackUrl;
  } catch {
    return false;
  }
}

/**
 * Reads II's JSON-RPC response from a callback URL, refusing one that isn't for
 * the sign-in this device started, or that arrives after the flow timed out.
 */
export function parseCallback(url: string, pending: PendingSignIn, now = Date.now()): unknown {
  const params = new URLSearchParams(new URL(url).hash.slice(1));
  const message = params.get("message");
  if (message === null) throw new Error("The sign-in callback carried no response");
  if (params.get("state") !== pending.state) throw new Error("The sign-in callback is not for this sign-in");
  if (now - pending.startedAt > FLOW_TIMEOUT_MS) throw new Error("The sign-in took too long; try again");
  const parsed: unknown = JSON.parse(message);
  const response = Array.isArray(parsed)
    ? parsed.find((r) => (r as { id?: unknown })?.id === pending.requestId)
    : parsed;
  if ((response as { id?: unknown } | undefined)?.id !== pending.requestId) {
    throw new Error("The sign-in callback answered a different request");
  }
  return response;
}

/** Turns II's response into the session chain, with the SDK's own validation. */
async function sessionChainFrom(response: unknown, key: SignIdentity): Promise<DelegationChain> {
  // requestSessionDelegation only calls signer.sendRequest; handing it the
  // response we already hold reuses its parsing and its InteractionRequiredError.
  const replay = { sendRequest: async () => response } as unknown as Parameters<typeof requestSessionDelegation>[0];
  const chain = await requestSessionDelegation(replay, { sessionPublicKey: key.getPublicKey().toDer() });
  const leaf = chain.delegations[chain.delegations.length - 1]?.delegation.pubkey;
  const mine = new Uint8Array(key.getPublicKey().toDer());
  if (!leaf || leaf.byteLength !== mine.length || !new Uint8Array(leaf).every((b, i) => b === mine[i])) {
    throw new Error("The session chain does not delegate to this device's key");
  }
  return chain;
}

// ── Session lifecycle ────────────────────────────────────────────────────────

let storage: IdbCredentialStorage | null = null;
const credentials = () => (storage ??= new IdbCredentialStorage());

let current: { identity: SessionIdentity; minter: SessionMinter } | null = null;

function earliestExpiryMs(chain: DelegationChain): number {
  const expirations = chain.delegations.map((d) => d.delegation.expiration);
  if (expirations.length === 0) return 0;
  return Number(expirations.reduce((a, b) => (a < b ? a : b)) / 1_000_000n);
}

async function openSession(key: SignIdentity, chain: DelegationChain, onSessionGone: () => void): Promise<SessionIdentity> {
  const minter = await SessionMinter.create({
    sessionKey: key,
    sessionChain: chain,
    canisterId: Principal.fromText(II_CANISTER_ID),
    agentOptions: AGENT_OPTIONS,
  });
  const identity = await SessionIdentity.create({
    sessionExpiresAtMs: earliestExpiryMs(chain),
    source: minter,
    storage: credentials(),
    slot: APP_SLOT,
    onSessionGone: () => {
      void clearSession().catch(() => undefined);
      onSessionGone();
    },
  });
  current?.identity.dispose();
  current = { identity, minter };
  return identity;
}

async function clearSession(): Promise<void> {
  current?.identity.dispose();
  current = null;
  const store = credentials();
  await Promise.all([store.remove(SESSION_SLOT), store.remove(APP_SLOT)]);
}

function readPending(): PendingSignIn | null {
  try {
    const raw = localStorage.getItem(PENDING_META_KEY);
    return raw ? (JSON.parse(raw) as PendingSignIn) : null;
  } catch {
    return null;
  }
}

/** The signed-in identity from an earlier launch, or null. */
export async function restoreNativeSession(onSessionGone: () => void): Promise<SessionIdentity | null> {
  const held = await credentials().get(SESSION_SLOT);
  if (!held?.chain) return null;
  if (earliestExpiryMs(held.chain) <= Date.now()) {
    await clearSession();
    return null;
  }
  try {
    return await openSession(held.identity, held.chain, onSessionGone);
  } catch (error) {
    if (error instanceof SessionGoneError) {
      await clearSession();
      return null;
    }
    throw error;
  }
}

/** Finishes a sign-in from II's callback URL. */
export async function completeNativeSignIn(url: string, onSessionGone: () => void): Promise<SessionIdentity> {
  const pending = readPending();
  const store = credentials();
  const held = await store.get(PENDING_SLOT);
  if (!pending || !held) throw new Error("No sign-in is in progress on this device");
  try {
    const response = parseCallback(url, pending);
    const chain = await sessionChainFrom(response, held.identity);
    const identity = await openSession(held.identity, chain, onSessionGone);
    await store.set(SESSION_SLOT, { identity: held.identity, chain });
    return identity;
  } finally {
    localStorage.removeItem(PENDING_META_KEY);
    await store.remove(PENDING_SLOT).catch(() => undefined);
  }
}

/**
 * The callback URL the app was cold-started with, if the OS relaunched it to
 * finish a sign-in (the app was killed while the browser was open).
 */
export async function pendingLaunchCallback(): Promise<string | null> {
  if (!readPending()) return null;
  const launch = await App.getLaunchUrl().catch(() => undefined);
  return launch?.url && isCallbackUrl(launch.url, nativeCallbackUrl()) ? launch.url : null;
}

/** Waits for the OS to hand the callback link to the app, after Browser.open. */
function waitForAppLink(callbackUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const handles: Promise<PluginListenerHandle>[] = [];
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      handles.forEach((h) => void h.then((x) => x.remove()));
      fn();
    };
    handles.push(App.addListener("appUrlOpen", ({ url }) => {
      if (!isCallbackUrl(url, callbackUrl)) return;
      void Browser.close().catch(() => undefined); // iOS: dismiss SFSafariViewController
      finish(() => resolve(url));
    }));
    // The user closed the browser. On Android the App Link can land a moment
    // after the tab reports closing, so give it a beat before calling it a cancel.
    handles.push(Browser.addListener("browserFinished", () => {
      setTimeout(() => finish(() => reject(new NativeSignInCanceled())), 1500);
    }));
  });
}

/** Signs in with Internet Identity outside the web view and returns the identity. */
export async function nativeSignIn(onSessionGone: () => void): Promise<SessionIdentity> {
  const callbackUrl = nativeCallbackUrl();
  const store = credentials();
  const key = await store.create();
  await store.set(PENDING_SLOT, { identity: key });
  const pending: PendingSignIn = { state: crypto.randomUUID(), requestId: crypto.randomUUID(), startedAt: Date.now() };
  localStorage.setItem(PENDING_META_KEY, JSON.stringify(pending));

  const url = buildAuthorizeUrl({
    sessionPublicKey: new Uint8Array(key.getPublicKey().toDer()),
    callbackUrl,
    state: pending.state,
    requestId: pending.requestId,
  });

  let returned: string;
  if (Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("NativeAuth")) {
    try {
      const callback = new URL(callbackUrl);
      returned = (await NativeAuth.authenticate({ url, callbackHost: callback.host, callbackPath: callback.pathname })).url;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "CANCELED") throw new NativeSignInCanceled();
      if (code !== "UNIMPLEMENTED" && code !== "UNAVAILABLE") throw error;
      // Before iOS 17.4: fall back to Safari and a universal link.
      const link = waitForAppLink(callbackUrl);
      await Browser.open({ url });
      returned = await link;
    }
  } else {
    const link = waitForAppLink(callbackUrl);
    await Browser.open({ url });
    returned = await link;
  }
  return completeNativeSignIn(returned, onSessionGone);
}

/** Ends the session at II (best effort) and forgets it on this device. */
export async function nativeSignOut(): Promise<void> {
  const minter = current?.minter;
  await minter?.revoke().catch(() => undefined);
  await clearSession();
}
