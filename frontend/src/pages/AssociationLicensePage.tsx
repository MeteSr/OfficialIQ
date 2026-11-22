import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Principal } from "@icp-sdk/core/principal";
import { T, fill } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import { associationService, LicenseFailed, type AssociationRec } from "../services/association";
import { userService } from "../services/user";
import { features } from "../lib/features";
import { clampSeats, licenseClaimErrorKey, licenseStatus, yearlyTotal, MIN_SEATS, PRICE_PER_SEAT, type LicenseView } from "../lib/license";

type Loaded = { assoc: AssociationRec; members: Principal[]; names: Record<string, string>; view: LicenseView | null };

const card = { padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 } as const;

/**
 * An association's seat license (issue #78), for its coordinator, on the
 * website only (App.tsx gates the route; the apps sell nothing, #80). Shows
 * the license and who holds its seats, moves a seat, and buys seats through
 * Stripe Checkout, which sends the coordinator back here with ?session_id=
 * for the association canister to check with Stripe itself.
 */
export default function AssociationLicensePage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session_id");
  const { t } = useTranslation();
  const { isAuthenticated, principal } = useAuthStore();

  const q = useCanisterQuery<Loaded | null>(async () => {
    if (!id) return null;
    const assoc = await associationService.getAssociation(id);
    if (!assoc) return null;
    const [members, view] = await Promise.all([associationService.getAssociationMembers(id), associationService.getLicense(id)]);
    const profiles = await Promise.all(members.map((p: Principal) => userService.getPublicProfile(p).catch(() => null)));
    const names = Object.fromEntries(members.map((p: Principal, i: number) => [p.toText(), profiles[i]?.displayName ?? t("assocDetail.unnamedOfficial")]));
    return { assoc, members, names, view };
  }, [isAuthenticated, id]);

  // A newer view than the query's, after a move, claim or refresh.
  const [updated, setUpdated] = useState<LicenseView | null>(null);
  const [seats, setSeats] = useState(String(MIN_SEATS));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const claimed = useRef<string | null>(null);

  useEffect(() => {
    if (!id || !sessionId || !q.data || claimed.current === sessionId) return;
    claimed.current = sessionId;
    setBusy(true);
    associationService.claimLicense(id, sessionId).then(
      (v) => { setUpdated(v); setMessage({ ok: true, text: t("license.claimed") }); setParams({}, { replace: true }); },
      (e) => setMessage({ ok: false, text: t(e instanceof LicenseFailed ? licenseClaimErrorKey(e.reason) : "license.errTryAgain") }),
    ).finally(() => setBusy(false));
  }, [id, sessionId, q.data, setParams, t]);

  if (!isAuthenticated) return <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>{t("assocDetail.signInPrompt")}</div>;
  if (q.loading) return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  if (q.error) return <LoadError onRetry={q.reload} />;
  if (!q.data) return <div style={{ padding: 24, textAlign: "center", color: T.wrong, paddingTop: 80 }}>{t("assocAnalytics.notFound")}</div>;

  const { assoc, members, names } = q.data;
  const view = updated ?? q.data.view;
  if (assoc.coordinator.toText() !== principal || !view) {
    return <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>{t("assocAnalytics.coordinatorsOnly")}</div>;
  }

  const lic = view.license[0];
  const status = licenseStatus(view);
  const holders = view.holders.map(p => p.toText());
  const unseated = members.filter(p => !holders.includes(p.toText()));
  const seatCount = lic ? Number(lic.seats) : 0;
  const until = lic ? new Date(Number(lic.expiresAt / 1_000_000n)).toLocaleDateString() : "";
  const picked = clampSeats(seats);
  const stripe = !!lic && "stripe" in lic.source;
  const nameOf = (p: string) => p === assoc.coordinator.toText() ? t("license.you") : names[p] ?? t("assocDetail.unnamedOfficial");

  async function act(f: () => Promise<LicenseView | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const v = await f();
      if (v) setUpdated(v);
    } catch (e) {
      setMessage({ ok: false, text: t(e instanceof LicenseFailed ? licenseClaimErrorKey(e.reason) : "license.errTryAgain") });
    } finally {
      setBusy(false);
    }
  }

  const move = (from: string, to: string) =>
    act(() => associationService.moveSeat(assoc.id, Principal.fromText(from), Principal.fromText(to)));

  const buy = () => act(async () => {
    window.location.assign(await associationService.startLicenseCheckout(assoc.id, picked));
  });

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{t("license.title")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{assoc.name}</div>
      </div>

      <div style={{ padding: 16 }}>
        {message && (
          <div role={message.ok ? "status" : "alert"} style={{ ...card, color: message.ok ? T.correct : T.wrong, fontSize: 13 }}>{message.text}</div>
        )}

        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{t(`license.status_${status}`, { date: until })}</div>
          {lic && <div style={{ fontSize: 22, fontWeight: 700, color: T.navy }}>{t("license.seatsUsed", { used: holders.length, seats: seatCount })}</div>}
          {!view.paywallOn && <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>{t("license.paywallOff")}</div>}
          <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>{t("license.unlocks")}</div>
        </div>

        {lic && (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("license.seatHolders")}</div>
            {holders.length === 0 && <div style={{ fontSize: 12, color: T.muted }}>{t("license.noHolders")}</div>}
            {holders.map(h => (
              <div key={h} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{nameOf(h)}</span>
                {unseated.length > 0 && (
                  <select
                    aria-label={t("license.moveSeatOf", { name: nameOf(h) })}
                    value="" disabled={busy}
                    onChange={e => { if (e.target.value) move(h, e.target.value); }}
                    style={{ maxWidth: 160, padding: 6, border: `1px solid ${T.border}`, borderRadius: 8, background: T.bg, color: T.text, fontSize: 12 }}
                  >
                    <option value="">{t("license.moveTo")}</option>
                    {unseated.map(p => <option key={p.toText()} value={p.toText()}>{nameOf(p.toText())}</option>)}
                  </select>
                )}
              </div>
            ))}
            {unseated.filter(p => p.toText() !== assoc.coordinator.toText()).map(p => (
              <div key={p.toText()} style={{ fontSize: 12, color: T.muted, padding: "6px 0" }}>{t("license.noSeat", { name: nameOf(p.toText()) })}</div>
            ))}
          </div>
        )}

        {view.checkoutReady && (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{stripe ? t("license.buyMoreTitle") : t("license.buyTitle")}</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{t("license.pricing", { price: PRICE_PER_SEAT, min: MIN_SEATS })}</div>
            {stripe ? (
              <>
                {features.checkout.portal && (
                  <a href={features.checkout.portal} style={{ display: "block", padding: "10px 0", textAlign: "center", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none", marginBottom: 8 }}>
                    {t("license.manage")}
                  </a>
                )}
                <button onClick={() => act(() => associationService.refreshLicense(assoc.id))} disabled={busy}
                  style={{ width: "100%", padding: "10px 0", background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
                  {t("license.refresh")}
                </button>
              </>
            ) : (
              <>
                <label htmlFor="license-seats" style={{ display: "block", fontSize: 12, color: T.muted, marginBottom: 4 }}>{t("license.seatsLabel")}</label>
                <input
                  id="license-seats" type="number" inputMode="numeric" min={MIN_SEATS} step={1} value={seats}
                  onChange={e => setSeats(e.target.value)}
                  onBlur={() => setSeats(String(clampSeats(seats)))}
                  style={{ width: "100%", padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, background: T.bg, color: T.text, marginBottom: 8, boxSizing: "border-box" }}
                />
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{t("license.total", { total: yearlyTotal(picked).toLocaleString("en-US"), seats: picked })}</div>
                <button onClick={buy} disabled={busy}
                  style={{ width: "100%", padding: "12px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 14, fontWeight: 700 }}>
                  {busy ? t("license.working") : t("license.buy", { seats: picked })}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
