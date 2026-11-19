import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/report";

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

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("report");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
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
