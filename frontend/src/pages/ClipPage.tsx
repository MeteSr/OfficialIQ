import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import ClipPlayer from "../components/ClipPlayer";
import { clipService } from "../services/clips";

/** One game clip, played from the signed link the content canister gives a viewer it has checked. */
export default function ClipPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const q = useCanisterQuery(() => clipService.playback(id), [id]);
  const clip = q.data?.clip;

  return (
    <div style={{ padding: "52px 16px 32px", fontFamily: T.font, color: T.text, display: "flex", flexDirection: "column", gap: 12 }}>
      {q.loading && <div style={{ color: T.muted }}>{t("common.loading")}</div>}
      {q.error && <LoadError onRetry={q.reload} />}
      {q.data && clip && (
        <>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>{clip.title}</div>
          {clip.description && <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.45 }}>{clip.description}</div>}
          <ClipPlayer
            src={q.data.url}
            callAtSec={clip.callAtSec.length ? Number(clip.callAtSec[0]) : null}
            question={clip.question[0] ?? null}
          />
        </>
      )}
    </div>
  );
}
