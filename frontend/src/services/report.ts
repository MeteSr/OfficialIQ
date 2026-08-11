import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArticleStat = { articleId: string; title: string; masteryScore: bigint };

export type ReportSnapshot = {
  id:                  string;
  owner:               import("@icp-sdk/core/principal").Principal;
  displayName:         string;
  sport:               string;
  state:               string;
  generatedAt:         bigint;
  monthsActive:        bigint;
  examsCompleted:      bigint;
  avgScore:            bigint;
  accuracyTrend:       string;
  topStrongest:        ArticleStat[];
  topWeakest:          ArticleStat[];
  studyHoursEstimated: bigint;
  isPublic:            boolean;
};

export type SnapshotInput = {
  displayName:         string;
  sport:               string;
  state:               string;
  monthsActive:        number;
  examsCompleted:      number;
  avgScore:            number;
  accuracyTrend:       string;
  topStrongest:        ArticleStat[];
  topWeakest:          ArticleStat[];
  studyHoursEstimated: number;
};

export type ReportShare = {
  id:          string;
  reportId:    string;
  coordinator: import("@icp-sdk/core/principal").Principal;
  sharedAt:    bigint;
  seen:        boolean;
};

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Stat = I.Record({ articleId: I.Text, title: I.Text, masteryScore: I.Nat });
  const StatInput = I.Record({ articleId: I.Text, title: I.Text, masteryScore: I.Nat });
  const Snapshot = I.Record({
    id: I.Text, owner: I.Principal, displayName: I.Text, sport: I.Text, state: I.Text,
    generatedAt: I.Int, monthsActive: I.Nat, examsCompleted: I.Nat, avgScore: I.Nat,
    accuracyTrend: I.Text, topStrongest: I.Vec(Stat), topWeakest: I.Vec(Stat),
    studyHoursEstimated: I.Nat, isPublic: I.Bool,
  });
  const Input = I.Record({
    displayName: I.Text, sport: I.Text, state: I.Text,
    monthsActive: I.Nat, examsCompleted: I.Nat, avgScore: I.Nat, accuracyTrend: I.Text,
    topStrongest: I.Vec(StatInput), topWeakest: I.Vec(StatInput), studyHoursEstimated: I.Nat,
  });
  const Share = I.Record({
    id: I.Text, reportId: I.Text, coordinator: I.Principal, sharedAt: I.Int, seen: I.Bool,
  });
  const ResultSnapshot = I.Variant({ ok: Snapshot, err: I.Text });
  const ResultShare = I.Variant({ ok: Share, err: I.Text });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  return I.Service({
    generateReport:       I.Func([Input], [ResultSnapshot], []),
    setPublic:            I.Func([I.Text, I.Bool], [ResultSnapshot], []),
    shareWithCoordinator: I.Func([I.Text, I.Principal], [ResultShare], []),
    markShareSeen:        I.Func([I.Text], [ResultUnit], []),
    getReport:            I.Func([I.Text], [I.Opt(Snapshot)], ["query"]),
    getMyReports:         I.Func([], [I.Vec(Snapshot)], ["query"]),
    getSharedWithMe:      I.Func([], [I.Vec(Share)], ["query"]),
    getMyUnseenShareCount: I.Func([], [I.Nat], ["query"]),
    metrics:              I.Func([], [I.Record({ reportCount: I.Nat, shareCount: I.Nat })], ["query"]),
  });
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_REPORT !== "undefined" ? CANISTER_ID_REPORT : "";

function actor() {
  return createActor<{
    generateReport:       (input: any) => Promise<{ ok: ReportSnapshot } | { err: string }>;
    setPublic:            (id: string, isPublic: boolean) => Promise<{ ok: ReportSnapshot } | { err: string }>;
    shareWithCoordinator: (reportId: string, coordinator: any) => Promise<{ ok: ReportShare } | { err: string }>;
    markShareSeen:        (id: string) => Promise<{ ok: null } | { err: string }>;
    getReport:            (id: string) => Promise<[] | [ReportSnapshot]>;
    getMyReports:         () => Promise<ReportSnapshot[]>;
    getSharedWithMe:      () => Promise<ReportShare[]>;
    getMyUnseenShareCount: () => Promise<bigint>;
  }>(CANISTER_ID, idlFactory);
}

export const reportService = {
  async generateReport(input: SnapshotInput): Promise<ReportSnapshot> {
    if (!CANISTER_ID) throw new Error("Report canister not deployed");
    const res = await actor().generateReport({
      displayName: input.displayName, sport: input.sport, state: input.state,
      monthsActive: BigInt(input.monthsActive), examsCompleted: BigInt(input.examsCompleted),
      avgScore: BigInt(Math.round(input.avgScore)), accuracyTrend: input.accuracyTrend,
      topStrongest: input.topStrongest, topWeakest: input.topWeakest,
      studyHoursEstimated: BigInt(Math.round(input.studyHoursEstimated)),
    });
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async setPublic(id: string, isPublic: boolean): Promise<ReportSnapshot> {
    if (!CANISTER_ID) throw new Error("Report canister not deployed");
    const res = await actor().setPublic(id, isPublic);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async shareWithCoordinator(reportId: string, coordinator: any): Promise<ReportShare> {
    if (!CANISTER_ID) throw new Error("Report canister not deployed");
    const res = await actor().shareWithCoordinator(reportId, coordinator);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async markShareSeen(id: string): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().markShareSeen(id).catch(() => {});
  },

  async getReport(id: string): Promise<ReportSnapshot | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getReport(id);
    return res.length ? res[0] : null;
  },

  async getMyReports(): Promise<ReportSnapshot[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyReports();
  },

  async getSharedWithMe(): Promise<ReportShare[]> {
    if (!CANISTER_ID) return [];
    return actor().getSharedWithMe();
  },

  async getMyUnseenShareCount(): Promise<number> {
    if (!CANISTER_ID) return 0;
    return Number(await actor().getMyUnseenShareCount());
  },
};
