import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
    DFX_NETWORK:           JSON.stringify(process.env.DFX_NETWORK           ?? "local"),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4943",
    },
  },
});
