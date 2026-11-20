// Build-time only: imported by vite.config.ts (see wellKnown.ts).
//
// Which parts of the app are switched on in a build. Anything that needs
// content, an account or a key that isn't in place yet stays off, so nobody
// opens an empty or broken screen: App Store review rejects apps with those
// (guideline 2.1), and users don't come back to them. Each switch is an
// environment variable, set as a GitHub repository variable for the deploy
// and mobile release workflows, so turning a feature on needs no code change.

export type Features = {
  /** Sport ids offered in the app. Others in the content canister stay hidden. */
  sports: string[];
  /** Narrated rule articles (needs the ElevenLabs audio to be generated). */
  audio: boolean;
  /**
   * Game clips (issue #29): the film room, uploads and "you make the call".
   * Needs video hosting set up (scripts/set-video-config.mjs). The
   * variable keeps its old name, FEATURE_CLIP_SUBMISSIONS.
   */
  clipSubmissions: boolean;
  /** Rule assistant, AI drills and the scenario generator (needs the Anthropic key). */
  ai: boolean;
  /** Streak push notifications on the website (needs the VAPID key pair). */
  webPush: boolean;
  /** Streak push notifications in the Android and iOS apps (needs Firebase and an APNs key). */
  nativePush: boolean;
  /**
   * The Pro tier (issue #71): upgrade prompts, the plan row and checkout.
   * Off, everyone is treated as Pro, as before billing existed. Needs at
   * least one Stripe Payment Link, so it can't be on with nothing to buy.
   */
  paywall: boolean;
  /** Stripe Payment Links for Pro, and the customer portal login link. */
  checkout: { monthly: string; yearly: string; portal: string };
};

export const DEFAULT_SPORTS = ["ncaa_basketball"];

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
}

export function featuresFromEnv(env: Record<string, string | undefined>): Features {
  const sports = (env.LAUNCH_SPORTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const checkout = {
    monthly: env.STRIPE_LINK_MONTHLY?.trim() ?? "",
    yearly: env.STRIPE_LINK_YEARLY?.trim() ?? "",
    portal: env.STRIPE_PORTAL_URL?.trim() ?? "",
  };
  return {
    sports: sports.length > 0 ? sports : DEFAULT_SPORTS,
    audio: flag(env.FEATURE_AUDIO, false),
    clipSubmissions: flag(env.FEATURE_CLIP_SUBMISSIONS, false),
    ai: flag(env.FEATURE_AI, true),
    // On by default once the public key is there, since that's the only
    // thing the website needs.
    webPush: flag(env.FEATURE_WEB_PUSH, !!env.VAPID_PUBLIC_KEY?.trim()),
    nativePush: flag(env.FEATURE_NATIVE_PUSH, false),
    paywall: flag(env.FEATURE_PAYWALL, false) && !!(checkout.monthly || checkout.yearly),
    checkout,
  };
}
