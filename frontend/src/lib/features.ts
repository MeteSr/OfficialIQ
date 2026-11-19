export type Features = typeof __FEATURES__;

// What this build has switched on (build-config/features.ts sets it). Tests and
// `vite dev` without the define get everything on, so nothing is hidden
// while developing.
// The paywall stays off there, since switching it on hides things.
const ALL_ON: Features = {
  sports: [], audio: true, clipSubmissions: true, ai: true, webPush: true, nativePush: true,
  paywall: false, checkout: { monthly: "", yearly: "", portal: "" },
};

export const features: Features = typeof __FEATURES__ !== "undefined" ? __FEATURES__ : ALL_ON;

/** Whether a sport is offered in this build. An empty list offers every sport. */
export function sportOffered(sportId: string): boolean {
  return features.sports.length === 0 || features.sports.includes(sportId);
}
