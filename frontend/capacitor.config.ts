import type { CapacitorConfig } from "@capacitor/core";

// See issue #31. This wraps the existing PWA build (frontend/dist) — there
// is no separate native codebase; all UI/logic lives in the same React app
// that already serves the browser/PWA experience.
const config: CapacitorConfig = {
  appId: "app.officialiq.study",
  appName: "OfficialIQ",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
