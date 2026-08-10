import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";

// ─── Candid IDL ──────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Role        = I.Variant({ Official: I.Null, Assessor: I.Null, Admin: I.Null });
  const Profile     = I.Record({ principal: I.Principal, displayName: I.Text, role: Role, sport: I.Text, level: I.Text, state: I.Text, createdAt: I.Int });
  const ProfileUpd  = I.Record({ displayName: I.Text, sport: I.Text, level: I.Text, state: I.Text });
  const ResultP     = I.Variant({ ok: Profile, err: I.Text });
  return I.Service({
    createProfile: I.Func([ProfileUpd],       [ResultP],        []),
    updateProfile: I.Func([ProfileUpd],       [ResultP],        []),
    getMyProfile:  I.Func([],                 [I.Opt(Profile)], ["query"]),
    getProfile:    I.Func([I.Principal],      [I.Opt(Profile)], ["query"]),
    metrics:       I.Func([],                 [I.Record({ userCount: I.Nat })], ["query"]),
  });
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = { Official: null } | { Assessor: null } | { Admin: null };
export type UserProfile = {
  principal:   import("@icp-sdk/core/principal").Principal;
  displayName: string;
  role:        UserRole;
  sport:       string;
  level:       string;
  state:       string;
  createdAt:   bigint;
};
export type ProfileUpdate = { displayName: string; sport: string; level: string; state: string };

// ─── Mock ─────────────────────────────────────────────────────────────────────

const MOCK_PROFILE: UserProfile = {
  principal:   { toString: () => "2vxsx-fae" } as any,
  displayName: "Demo Official",
  role:        { Official: null },
  sport:       "ncaa_basketball",
  level:       "varsity",
  state:       "TX",
  createdAt:   BigInt(Date.now()) * BigInt(1_000_000),
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_USER !== "undefined" ? CANISTER_ID_USER : "";

function actor() {
  return createActor<{
    createProfile: (u: ProfileUpdate) => Promise<{ ok: UserProfile } | { err: string }>;
    updateProfile: (u: ProfileUpdate) => Promise<{ ok: UserProfile } | { err: string }>;
    getMyProfile:  ()                 => Promise<[] | [UserProfile]>;
    getProfile:    (p: any)           => Promise<[] | [UserProfile]>;
  }>(CANISTER_ID, idlFactory);
}

export const userService = {
  async getMyProfile(): Promise<UserProfile | null> {
    if (!CANISTER_ID) return MOCK_PROFILE;
    const res = await actor().getMyProfile();
    return res.length ? res[0] : null;
  },

  async getProfile(p: any): Promise<UserProfile | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getProfile(p);
    return res.length ? res[0] : null;
  },

  async createProfile(update: ProfileUpdate): Promise<UserProfile> {
    if (!CANISTER_ID) return { ...MOCK_PROFILE, ...update };
    const res = await actor().createProfile(update);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async updateProfile(update: ProfileUpdate): Promise<UserProfile> {
    if (!CANISTER_ID) return { ...MOCK_PROFILE, ...update };
    const res = await actor().updateProfile(update);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },
};
