import { create } from "zustand";
import type { UserProfile } from "../services/user";

type AuthState = {
  isAuthenticated: boolean;
  principal:       string | null;
  profile:         UserProfile | null;
  isLoading:       boolean;

  setAuth:    (principal: string, profile: UserProfile | null) => void;
  setProfile: (profile: UserProfile) => void;
  setLoading: (v: boolean) => void;
  clear:      () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  principal:       null,
  profile:         null,
  isLoading:       true,

  setAuth:    (principal, profile) => set({ isAuthenticated: true, principal, profile, isLoading: false }),
  setProfile: (profile)            => set({ profile }),
  setLoading: (isLoading)          => set({ isLoading }),
  clear:      ()                   => set({ isAuthenticated: false, principal: null, profile: null, isLoading: false }),
}));
