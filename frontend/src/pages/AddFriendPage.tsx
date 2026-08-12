import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Principal } from "@icp-sdk/core/principal";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useAuth } from "../contexts/AuthContext";
import { userService, type UserProfile } from "../services/user";
import { rankingService } from "../services/ranking";

export default function AddFriendPage() {
  const { principal: targetText } = useParams<{ principal: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, principal: myPrincipal } = useAuthStore();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [target,  setTarget]  = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [status,  setStatus]  = useState<"idle" | "adding" | "added" | "error">("idle");
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!targetText) { setInvalid(true); setLoading(false); return; }
    let target: Principal;
    try {
      target = Principal.fromText(targetText);
    } catch {
      setInvalid(true);
      setLoading(false);
      return;
    }
    userService.getProfile(target)
      .then(setTarget)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetText]);

  async function handleAdd() {
    if (!targetText) return;
    setStatus("adding");
    setError(null);
    try {
      await rankingService.addFriend(Principal.fromText(targetText));
      setStatus("added");
    } catch (e: any) {
      setStatus("error");
      setError(e.message ?? t("addFriend.addFailed"));
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>
        {t("common.loading")}
      </div>
    );
  }

  if (invalid) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
          {t("addFriend.badLink")}
        </div>
        <button
          onClick={() => navigate("/home")}
          style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
        >{t("addFriend.backToHome")}</button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          {t("addFriend.signInToAdd", { name: target?.displayName ?? t("addFriend.thisOfficial") })}
        </div>
        <button
          onClick={() => login()}
          style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, marginTop: 14 }}
        >{t("addFriend.signIn")}</button>
      </div>
    );
  }

  if (targetText === myPrincipal) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🙂</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{t("addFriend.ownLink")}</div>
        <button
          onClick={() => navigate("/me")}
          style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
        >{t("addFriend.goToProfile")}</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px", textAlign: "center", paddingTop: 80 }}>
      <div style={{
        width: 72, height: 72, borderRadius: "50%", margin: "0 auto 16px",
        background: T.red, color: T.white,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, fontWeight: 700,
      }}>
        {target?.displayName?.[0]?.toUpperCase() ?? "?"}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
        {target?.displayName ?? t("addFriend.unknownOfficial")}
      </div>
      {target && (
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          {target.level} · {target.state || "—"}
        </div>
      )}

      {status === "added" ? (
        <div style={{ color: T.correct, fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
          ✓ {t("addFriend.added")}
        </div>
      ) : (
        <button
          onClick={handleAdd}
          disabled={status === "adding"}
          style={{
            padding: "13px 32px", background: status === "adding" ? T.border : T.navy,
            color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, marginBottom: 16,
          }}
        >
          {status === "adding" ? t("addFriend.adding") : t("addFriend.addAsFriend")}
        </button>
      )}
      {error && <div style={{ color: T.wrong, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div>
        <button
          onClick={() => navigate("/me")}
          style={{ background: "transparent", color: T.navy, fontSize: 14, fontWeight: 600 }}
        >
          {t("addFriend.goToMyProfile")}
        </button>
      </div>
    </div>
  );
}
