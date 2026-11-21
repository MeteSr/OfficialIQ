import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import { associationService, SetRequirementFailed, type AssociationRec, type TrainingRequirement } from "../services/association";
import { examService } from "../services/exam";
import { userService } from "../services/user";
import { toCsv } from "../lib/csv";
import { LicenseRequired } from "../lib/license";
import LicensePrompt from "../components/LicensePrompt";
import {
  buildEntries, formatDuration, hours, parseRequirementInput, requirementErrorKey, requirementStatus, seasonWindow, totalIn,
} from "../lib/transcript";

const DEFAULT_SEASON_START = 8;

type MemberRow = { principal: string; displayName: string; seasonSec: number; met: boolean | null; failed: boolean; licenseRequired?: boolean };
type Loaded = { assoc: AssociationRec; requirement: TrainingRequirement | null; rows: MemberRow[]; licenseNeeded?: boolean };

/**
 * Coordinator view of an association's training hours (issue #67): set the
 * hours-per-season requirement and see whether each member meets it, with a
 * link to their full transcript.
 */
export default function AssociationTrainingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, principal } = useAuthStore();

  const q = useCanisterQuery<Loaded | null>(async () => {
    if (!id) return null;
    const assoc = await associationService.getAssociation(id);
    if (!assoc) return null;
    if (assoc.coordinator.toString() !== principal) return { assoc, requirement: null, rows: [] };
    const [requirement, members] = await Promise.all([
      associationService.getTrainingRequirement(id),
      associationService.getAssociationMembers(id),
    ]);
    const now = Date.now();
    const season = seasonWindow(now, requirement ? Number(requirement.seasonStartMonth) : DEFAULT_SEASON_START);
    const rows = await Promise.all(members.map(async (p): Promise<MemberRow> => {
      const pub = await userService.getPublicProfile(p).catch(() => null);
      const displayName = pub?.displayName ?? t("assocDetail.unnamedOfficial");
      try {
        const [sessions, activity] = await Promise.all([examService.getMemberTraining(p), userService.getMemberTrainingActivity(p)]);
        const entries = buildEntries(sessions, activity);
        return {
          principal: p.toString(), displayName, failed: false,
          seasonSec: totalIn(entries, season.from, season.to).seconds,
          met: requirement ? requirementStatus(entries, { hoursPerSeason: Number(requirement.hoursPerSeason), seasonStartMonth: Number(requirement.seasonStartMonth) }, now).met : null,
        };
      } catch (e) {
        return { principal: p.toString(), displayName, seasonSec: 0, met: null, failed: true, licenseRequired: e instanceof LicenseRequired };
      }
    }));
    return { assoc, requirement, rows: rows.sort((a, b) => a.seasonSec - b.seasonSec), licenseNeeded: rows.some(r => r.licenseRequired) };
  }, [isAuthenticated, id, principal]);

  const [hoursInput, setHoursInput] = useState("");
  const [monthInput, setMonthInput] = useState(DEFAULT_SEASON_START);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNeedsLicense, setSaveNeedsLicense] = useState(false);

  useEffect(() => {
    const r = q.data?.requirement;
    if (r) { setHoursInput(String(Number(r.hoursPerSeason))); setMonthInput(Number(r.seasonStartMonth)); }
  }, [q.data?.requirement]);

  if (!isAuthenticated) return <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>{t("transcript.signIn")}</div>;
  if (q.loading) return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  if (q.error) return <LoadError onRetry={q.reload} />;
  if (!q.data) return <div style={{ padding: 24, textAlign: "center", color: T.wrong, paddingTop: 80 }}>{t("assocAnalytics.notFound")}</div>;

  const { assoc, requirement, rows } = q.data;
  if (assoc.coordinator.toString() !== principal) {
    return <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>{t("assocTraining.coordinatorsOnly")}</div>;
  }

  async function save() {
    const parsed = parseRequirementInput(hoursInput, monthInput);
    if ("error" in parsed) { setSaveError(t(parsed.error)); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await associationService.setTrainingRequirement(assoc.id, parsed.ok);
      q.reload();
    } catch (e) {
      if (e instanceof SetRequirementFailed && "licenseRequired" in e.reason) { setSaveNeedsLicense(true); return; }
      setSaveError(e instanceof SetRequirementFailed ? t(requirementErrorKey(e.reason)) : t("assocTraining.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const csv = toCsv([
      [t("assocDetail.csvOfficial"), t("assocTraining.csvSeasonHours"), t("assocTraining.csvRequired"), t("assocTraining.csvMeets")],
      ...rows.map(r => [
        r.displayName, r.failed ? "" : hours(r.seasonSec),
        requirement ? Number(requirement.hoursPerSeason) : "",
        r.met === null ? "" : r.met ? t("assocTraining.yes") : t("assocTraining.no"),
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${assoc.name.replace(/[^a-z0-9]+/gi, "_")}_training_hours.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: "long" });
  const metCount = rows.filter(r => r.met).length;

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{t("assocTraining.title")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{assoc.name}</div>
      </div>

      <div style={{ padding: 16 }}>
        {(q.data.licenseNeeded || saveNeedsLicense) && <LicensePrompt associationId={assoc.id} />}
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("assocTraining.requirementTitle")}</div>
          <label style={{ display: "block", fontSize: 12, color: T.muted, marginBottom: 4 }}>{t("assocTraining.hoursLabel")}</label>
          <input
            type="number" min={0} step={1} inputMode="numeric" value={hoursInput}
            onChange={e => setHoursInput(e.target.value)}
            style={{ width: "100%", padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, background: T.bg, color: T.text, marginBottom: 10 }}
          />
          <label style={{ display: "block", fontSize: 12, color: T.muted, marginBottom: 4 }}>{t("assocTraining.seasonStartLabel")}</label>
          <select
            value={monthInput} onChange={e => setMonthInput(Number(e.target.value))}
            style={{ width: "100%", padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, background: T.bg, color: T.text, marginBottom: 10 }}
          >
            {months.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>{t("assocTraining.zeroClears")}</div>
          {saveError && <div style={{ fontSize: 12, color: T.wrong, marginBottom: 8 }}>{saveError}</div>}
          <button onClick={save} disabled={saving} style={{ width: "100%", padding: "12px 14px", background: T.red, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
            {saving ? t("assocTraining.saving") : t("assocTraining.save")}
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {requirement
              ? t("assocTraining.metSummary", { met: metCount, count: rows.length })
              : t("assocDetail.membersCount", { count: rows.length })}
          </div>
          <button onClick={exportCsv} style={{ padding: "6px 12px", background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
            {t("transcript.exportCsv")}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(r => (
            <button
              key={r.principal}
              onClick={() => navigate(`/association/${assoc.id}/training/${r.principal}`)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, textAlign: "left" }}
            >
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.displayName}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{r.failed ? t("assocTraining.unavailable") : formatDuration(r.seasonSec)}</span>
              {r.met !== null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: r.met ? T.correct : T.wrong, minWidth: 64, textAlign: "right" }}>
                  {r.met ? t("transcript.requirementMet") : t("transcript.requirementNotMet")}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
