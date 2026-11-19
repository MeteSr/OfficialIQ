import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/user";
import { disablePush } from "../lib/pushNotifications";
import { getPendingActions, removePendingAction } from "../lib/offlineDb";
import { usePlanStore } from "../store/planStore";
import { hasActiveSubscription } from "../lib/plan";
import { features } from "../lib/features";

// In-app account deletion: App Store guideline 5.1.1(v) and Google Play's
// account deletion policy. It works on the website too, which is the web
// link Play asks for. The canisters do the deleting (user canister's
// deleteAccount); this page also clears what this device kept for the
// official, then signs them out.

// localStorage keys that belong to the signed-in official rather than the device.
const PERSONAL_KEYS = ["officialiq_streak_milestone_seen"];

async function clearThisDevice() {
  await disablePush().catch(() => {});
  try {
    for (const a of await getPendingActions()) await removePendingAction(a.id);
  } catch { /* nothing queued, or no IndexedDB */ }
  for (const k of PERSONAL_KEYS) {
    try { localStorage.removeItem(k); } catch { /* storage blocked */ }
  }
}

export default function DeleteAccountPage() {
  const mine = usePlanStore(s => s.mine);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { logout } = useAuth();
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "deleting" | "done" | "error">("idle");

  const confirmWord = t("deleteAccount.confirmWord");
  const confirmed = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  async function handleDelete() {
    if (!confirmed) return;
    setState("deleting");
    try {
      // The device first, while the official is still signed in: turning
      // push off also unsubscribes this browser or phone from the push service.
      await clearThisDevice();
      await userService.deleteAccount();
      setState("done");
      await logout().catch(() => {});
    } catch {
      setState("error");
    }
  }

  const page = { padding: "52px 20px 32px", fontFamily: T.font, color: T.text, background: T.bg, minHeight: "100dvh" } as const;
  const heading = { fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28 } as const;

  if (state === "done") {
    return (
      <div style={page} role="status">
        <div style={heading}>{t("deleteAccount.doneTitle")}</div>
        <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.5 }}>{t("deleteAccount.doneBody")}</p>
        <button onClick={() => navigate("/")} style={{ width: "100%", minHeight: 48, marginTop: 12, border: 0, borderRadius: 8, background: fill.accent, color: fill.onAccent, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          {t("common.goHome")}
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={page}>
        <div style={heading}>{t("deleteAccount.title")}</div>
        <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.5 }}>{t("deleteAccount.signInFirst")}</p>
        <button onClick={() => navigate("/me")} style={{ width: "100%", minHeight: 48, marginTop: 12, border: 0, borderRadius: 8, background: fill.accent, color: fill.onAccent, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          {t("sharedReports.goToSignIn")}
        </button>
      </div>
    );
  }

  return (
    <div style={page}>
      <button onClick={() => navigate("/me")} style={{ minHeight: 44, padding: 0, background: "transparent", border: 0, color: T.muted, fontSize: 13, cursor: "pointer" }}>
        ‹ {t("common.back")}
      </button>
      <div style={heading}>{t("deleteAccount.title")}</div>
      <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.5 }}>{t("deleteAccount.intro")}</p>
      {/* Deleting the account drops the entitlement but can't cancel a
          Stripe or store subscription (issue #71). */}
      {mine && hasActiveSubscription(mine.entitlements, Date.now()) && (
        <p role="note" style={{ fontSize: 14, color: T.wrong, lineHeight: 1.5, fontWeight: 600 }}>
          {t("plan.deleteSubscriptionNote")}
          {features.checkout.portal && (
            <> <a href={features.checkout.portal} style={{ color: fill.accent }}>{t("plan.manage")}</a></>
          )}
        </p>
      )}
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20, margin: "8px 0 16px" }}>
        <li>{t("deleteAccount.itemProfile")}</li>
        <li>{t("deleteAccount.itemResults")}</li>
        <li>{t("deleteAccount.itemSocial")}</li>
        <li>{t("deleteAccount.itemOwned")}</li>
        <li>{t("deleteAccount.itemShared")}</li>
      </ul>
      <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{t("deleteAccount.kept")}</p>
      <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{t("deleteAccount.identity")}</p>

      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 20 }}>
        {t("deleteAccount.typeToConfirm", { word: confirmWord })}
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          style={{ display: "block", width: "100%", marginTop: 8, padding: "12px", fontSize: 15, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, boxSizing: "border-box" }}
        />
      </label>
      {state === "error" && <div role="alert" style={{ fontSize: 13, color: T.wrong, marginTop: 10 }}>{t("deleteAccount.failed")}</div>}
      <button
        onClick={handleDelete}
        disabled={!confirmed || state === "deleting"}
        style={{ width: "100%", minHeight: 48, marginTop: 16, border: 0, borderRadius: 8, background: confirmed ? T.wrong : T.border, color: T.white, fontWeight: 700, fontSize: 15, cursor: confirmed ? "pointer" : "default" }}
      >
        {state === "deleting" ? t("deleteAccount.deleting") : t("deleteAccount.confirm")}
      </button>
    </div>
  );
}
