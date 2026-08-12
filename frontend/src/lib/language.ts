import { useAuthStore } from "../store/authStore";

/**
 * The signed-in official's content language (for contentService.listArticles),
 * falling back to English. Distinct from i18n's UI language (see
 * src/i18n/index.ts) — this one selects which Article rows to fetch, not
 * which translation file the UI chrome reads from, though in practice both
 * are driven by the same profile.preferredLanguage value.
 */
export function useContentLanguage(): string {
  const profile = useAuthStore(s => s.profile);
  return profile?.preferredLanguage || "en";
}
