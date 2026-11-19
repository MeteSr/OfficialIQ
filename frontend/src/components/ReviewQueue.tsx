import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { userService, type CallLogEntry } from "../services/user";

/**
 * The official's review queue on Study (issue #66): post-game calls with an
 * accepted rule, not yet reviewed. While a call is queued its rule's
 * questions lead the adaptive quizzes; "Mark reviewed" ends that.
 * Renders nothing when the queue is empty or doesn't load.
 */
export default function ReviewQueue() {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<CallLogEntry[]>([]);

  useEffect(() => {
    userService.getMyReviewQueue().then(setQueue).catch(() => setQueue([]));
  }, []);

  async function reviewed(id: string) {
    await userService.markCallReviewed(id).catch(() => {});
    setQueue(q => q.filter(c => c.id !== id));
  }

  if (queue.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
        {t("callLog.queueTitle")}
      </div>
      {queue.map(c => {
        const m = c.match[0];
        return (
          <div key={c.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.35 }}>{c.note}</div>
            {m && <div style={{ fontSize: 12, color: T.muted, marginTop: 4, fontWeight: 600 }}>{m.citation}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {m && (
                <Link to={`/quiz/${m.articleId}?adaptive=1`} style={{ minHeight: 36, padding: "0 12px", display: "inline-flex", alignItems: "center", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  {t("callLog.quizRule")}
                </Link>
              )}
              <button onClick={() => reviewed(c.id)} style={{ minHeight: 36, padding: "0 12px", background: "transparent", color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                {t("callLog.markReviewed")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
