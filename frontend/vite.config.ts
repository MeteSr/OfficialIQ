import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Service worker is generated for production builds only (the
      // default); `vite dev` is unaffected, avoiding stale-cache dev friction.
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg}"],
        // Article/question/casebook reads go through IndexedDB (see
        // src/lib/offlineDb.ts), not the Cache API, so no runtimeCaching
        // rules are needed here for canister calls.
      },
      manifest: {
        name: "OfficialIQ",
        short_name: "OfficialIQ",
        description: "Study and certify for sports officiating exams offline or online.",
        start_url: "/",
        display: "standalone",
        background_color: "#F4F5F7",
        theme_color: "#1D428A",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    // Canister IDs injected by deploy.sh via .env
    CANISTER_ID_USER:      JSON.stringify(process.env.CANISTER_ID_USER      ?? ""),
    CANISTER_ID_CONTENT:   JSON.stringify(process.env.CANISTER_ID_CONTENT   ?? ""),
    CANISTER_ID_QUESTION:  JSON.stringify(process.env.CANISTER_ID_QUESTION  ?? ""),
    CANISTER_ID_EXAM:      JSON.stringify(process.env.CANISTER_ID_EXAM      ?? ""),
    CANISTER_ID_RANKING:   JSON.stringify(process.env.CANISTER_ID_RANKING   ?? ""),
    CANISTER_ID_CHALLENGE: JSON.stringify(process.env.CANISTER_ID_CHALLENGE ?? ""),
    CANISTER_ID_MENTORSHIP: JSON.stringify(process.env.CANISTER_ID_MENTORSHIP ?? ""),
    CANISTER_ID_ASSOCIATION: JSON.stringify(process.env.CANISTER_ID_ASSOCIATION ?? ""),
    CANISTER_ID_REPORT:    JSON.stringify(process.env.CANISTER_ID_REPORT    ?? ""),
    DFX_NETWORK:           JSON.stringify(process.env.DFX_NETWORK           ?? "local"),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4943",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
