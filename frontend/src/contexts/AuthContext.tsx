import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AuthClient } from "@icp-sdk/auth/client";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { initAgent, resetAgent } from "../services/actor";
import { userService, type UserProfile } from "../services/user";
import { useAuthStore } from "../store/authStore";
import { syncAllContent } from "../lib/offlineSync";
import { DEFAULT_SPORT_ID, DEFAULT_LEVEL_ID } from "../lib/sport";
import { setLanguage } from "../i18n";

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

// Fixed-seed dev identity — survives hot-reloads without re-auth
const DEV_SEED = new Uint8Array(32).fill(0xab);

export function AuthProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<AuthClient | null>(null);
  const { setAuth, setLoading, clear } = useAuthStore();

  // Best-effort content sync-down for offline use — never blocks login.
  function completeAuth(principal: string, profile: UserProfile | null) {
    setAuth(principal, profile);
    syncAllContent(profile?.sport || DEFAULT_SPORT_ID, profile?.level || DEFAULT_LEVEL_ID).catch(() => {});
    if (profile?.preferredLanguage) setLanguage(profile.preferredLanguage);
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
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
        const identity = Ed25519KeyIdentity.generate(DEV_SEED);
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
    const identity = Ed25519KeyIdentity.generate(DEV_SEED);
    initAgent(identity);
    const principal = identity.getPrincipal().toText();
    const profile   = await userService.getMyProfile();
    completeAuth(principal, profile);
  }

  async function logout() {
    const client = clientRef.current;
    if (client) await client.signOut(); // ends the session in every tab
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
