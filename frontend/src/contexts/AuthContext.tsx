import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AuthClient } from "@icp-sdk/auth/client";
import { devIdentity } from "../lib/devIdentity";
import { initAgent, resetAgent } from "../services/actor";
import { userService, type UserProfile } from "../services/user";
import { useAuthStore } from "../store/authStore";
import { usePlanStore } from "../store/planStore";
import { syncAllContent } from "../lib/offlineSync";
import { DEFAULT_SPORT_ID, DEFAULT_LEVEL_ID } from "../lib/sport";
import { setLanguage } from "../i18n";
import {
  completeNativeSignIn,
  isNativeApp,
  nativeSignIn,
  nativeSignOut,
  pendingLaunchCallback,
  restoreNativeSession,
} from "../lib/nativeAuth";

type AuthContextValue = {
  login:    () => Promise<void>;
  devLogin: () => Promise<void>;
  logout:   () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Internet Identity: @icp-sdk/auth 11 defaults to mainnet II (https://id.ai),
// which is also what the user-sign-in skill recommends for local development —
// icp-cli's local network trusts mainnet II delegations — so no
// identityProvider is configured here.
//
// The Capacitor app can't open II's pop-up, so it signs in through the system
// browser instead (src/lib/nativeAuth.ts); everything after the identity is
// the same.

export function AuthProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<AuthClient | null>(null);
  const { setAuth, setLoading, clear } = useAuthStore();

  // Best-effort content sync-down for offline use — never blocks login.
  function completeAuth(principal: string, profile: UserProfile | null) {
    setAuth(principal, profile);
    syncAllContent(profile?.sport || DEFAULT_SPORT_ID, profile?.level || DEFAULT_LEVEL_ID).catch(() => {});
    if (profile?.preferredLanguage) setLanguage(profile.preferredLanguage);
    usePlanStore.getState().refresh().catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;

    // The native session ended under us (expired or revoked at II).
    const onNativeSessionGone = () => { resetAgent(); clear(); };

    async function initNative() {
      // Relaunched by the OS to finish a sign-in after the app was killed
      // while the browser was open.
      const callback = await pendingLaunchCallback();
      const identity = callback
        ? await completeNativeSignIn(callback, onNativeSessionGone)
        : await restoreNativeSession(onNativeSessionGone);
      if (!identity) {
        if (!cancelled) setLoading(false);
        return;
      }
      initAgent(identity);
      const profile = await userService.getMyProfile();
      if (!cancelled) completeAuth(identity.getPrincipal().toText(), profile);
    }

    async function init() {
      if (isNativeApp()) return initNative();
      const client = new AuthClient();
      clientRef.current = client;

      // isAuthenticated() is synchronous
      if (client.isAuthenticated()) {
        // getIdentity() is async
        const identity = await client.getIdentity();
        initAgent(identity);
        const principal = identity.getPrincipal().toText();
        const profile = await userService.getMyProfile();
        if (!cancelled) completeAuth(principal, profile);
      } else if (import.meta.env.DEV && !new URLSearchParams(window.location.search).has("skipDevAuth")) {
        // Auto dev-login so the app is usable without II in development.
        // Append ?skipDevAuth to preview signed-out UI (e.g. LandingPage)
        // locally — otherwise this fires before you'd ever see it. Use
        // devLogin() (e.g. via the landing page's dev-only button) to get
        // back into the app afterward without a full Internet Identity flow.
        const identity = devIdentity();
        initAgent(identity);
        const principal = identity.getPrincipal().toText();
        const profile = await userService.getMyProfile();
        if (!cancelled) completeAuth(principal, profile);
      } else {
        if (!cancelled) setLoading(false);
      }
    }

    init().catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  async function login() {
    if (isNativeApp()) {
      // Rejects with NativeSignInCanceled when the user closes the browser (callers catch).
      const identity = await nativeSignIn(() => { resetAgent(); clear(); });
      initAgent(identity);
      completeAuth(identity.getPrincipal().toText(), await userService.getMyProfile());
      return;
    }
    const client = clientRef.current ?? new AuthClient();
    clientRef.current = client;

    // signIn() returns the identity directly and rejects if the user closes
    // the II window or authentication fails (callers catch). Session length
    // is left to II's defaults (7 days idle / 30 days total) — maxTimeToLive
    // bounds the II session, not the signing key (user-sign-in skill).
    const identity = await client.signIn();
    initAgent(identity);
    const principal = identity.getPrincipal().toText();
    const profile   = await userService.getMyProfile();
    completeAuth(principal, profile);
  }

  async function devLogin() {
    if (!import.meta.env.DEV) return;
    const identity = devIdentity();
    initAgent(identity);
    const principal = identity.getPrincipal().toText();
    const profile   = await userService.getMyProfile();
    completeAuth(principal, profile);
  }

  async function logout() {
    const client = clientRef.current;
    if (isNativeApp()) await nativeSignOut();
    else if (client) await client.signOut(); // ends the session in every tab
    resetAgent();
    clear();
  }

  return (
    <AuthContext.Provider value={{ login, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
