import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import { contentService } from "../services/content";

// Fallback used before a profile exists (onboarding, logged-out browsing)
// or if a profile predates the sport registry. Adding a new sport is meant
// to be pure content-seeding (see backend/content/main.mo's Sport type) —
// nothing in the app should hardcode a sport id beyond this one fallback.
export const DEFAULT_SPORT_ID = "ncaa_basketball";
export const DEFAULT_LEVEL_ID = "varsity";

/** The signed-in official's sport + level, falling back to the platform default. */
export function useSport(): { sportId: string; levelId: string } {
  const profile = useAuthStore(s => s.profile);
  return {
    sportId: profile?.sport || DEFAULT_SPORT_ID,
    levelId: profile?.level || DEFAULT_LEVEL_ID,
  };
}

function titleCase(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Display name for the current sport (e.g. "NCAA Men's Basketball"), looked up from the registry. */
export function useSportDisplayName(): string {
  const { sportId } = useSport();
  useTranslation(); // re-render on language change
  const [name, setName] = useState(titleCase(sportId));
  useEffect(() => {
    setName(titleCase(sportId));
    contentService.listSports().then((sports) => {
      const match = sports.find(s => s.id === sportId);
      if (match) setName(match.displayName);
    }).catch(() => {});
  }, [sportId]);
  return sportLabel(sportId, name);
}

// Registry display names are English content data; these give the UI a
// translated label when one exists and fall back to the registry's own name
// (so a newly seeded sport or level still shows something sensible).
export function sportLabel(id: string, registryName: string): string {
  return i18n.t(`sports.${id}`, { defaultValue: registryName });
}

export function levelLabel(id: string, registryName?: string): string {
  return i18n.t(`levels.${id}`, { defaultValue: registryName ?? titleCase(id) });
}
