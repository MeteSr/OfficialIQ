import { useEffect } from "react";
import { userService } from "../services/user";
import { useAuthStore } from "../store/authStore";

const BEAT_MS = 60_000;

/**
 * Counts study time toward the training transcript (issue #67) while
 * `active`: sends the user canister a heartbeat now and every minute, and the
 * canister credits the time between beats. Beats stop while the page is
 * hidden unless `inBackground` (audio that keeps playing with the screen off).
 */
export function useStudyTimer(active: boolean, { inBackground = false }: { inBackground?: boolean } = {}) {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!active || !isAuthenticated) return;
    const beat = () => {
      if (!inBackground && document.visibilityState === "hidden") return;
      userService.recordStudyBeat().catch(() => { /* a missed beat only loses that minute */ });
    };
    beat();
    const id = window.setInterval(beat, BEAT_MS);
    // Coming back to the page starts a new stretch straight away.
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, isAuthenticated, inBackground]);
}
