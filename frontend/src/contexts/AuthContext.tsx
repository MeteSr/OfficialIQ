import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AuthClient } from "@icp-sdk/auth/client";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { initAgent, resetAgent } from "../services/actor";
import { userService, type UserProfile } from "../services/user";
import { useAuthStore } from "../store/authStore";
import { syncAllContent } from "../lib/offlineSync";
import { DEFAULT_SPORT_ID, DEFAULT_LEVEL_ID } from "../lib/sport";

type AuthContextValue = {
  login:    () => Promise<void>;
  devLogin: () => Promise<void>;
  logout:   () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Skill: always include /authorize — omitting it silently fails
const II_URL = import.meta.env.DEV
  ? "http://id.ai.localhost:8000/authorize"
  : "https://id.ai/authorize";

// Fixed-seed dev identity — survives hot-reloads without re-auth
const DEV_SEED = new Uint8Array(32).fill(0xab);

export function AuthProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<AuthClient | null>(null);
  const { setAuth, setLoading, clear } = useAuthStore();

  // Best-effort content sync-down for offline use — never blocks login.
  function completeAuth(principal: string, profile: UserProfile | null) {
    setAuth(principal, profile);
    syncAllContent(profile?.sport || DEFAULT_SPORT_ID, profile?.level || DEFAULT_LEVEL_ID).catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 7.x: pass identityProvider to constructor, not per-call
      const client = new AuthClient({ identityProvider: II_URL });
      clientRef.current = client;

      // 7.x: isAuthenticated() is synchronous
      if (client.isAuthenticated()) {
        // 7.x: getIdentity() is async
        const identity = await client.getIdentity();
        initAgent(identity);
        const principal = identity.getPrincipal().toText();
        const profile = await userService.getMyProfile();
        if (!cancelled) completeAuth(principal, profile);
      } else if (import.meta.env.DEV) {
        // Auto dev-login so the app is usable without II in development
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
    const client = clientRef.current ?? new AuthClient({ identityProvider: II_URL });
    clientRef.current = client;

    // 7.x: signIn() returns the identity directly, rejects on failure
    const identity = await client.signIn({
      maxTimeToLive: BigInt(8) * BigInt(3_600_000_000_000), // 8 hours
    });
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
    if (client) await client.signOut(); // 7.x: signOut() not logout()
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
