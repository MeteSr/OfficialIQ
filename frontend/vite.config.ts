import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";

// Backend canisters the frontend calls (names as in icp.yaml).
const CANISTER_NAMES = [
  "user", "content", "question", "exam", "ranking",
  "challenge", "ai_proxy", "mentorship", "association", "report",
] as const;

const REPO_ROOT = path.resolve(__dirname, "..");
const ICP_ENVIRONMENT = process.env.ICP_ENVIRONMENT ?? process.env.ICP_CLI_ENVIRONMENT ?? "local";

function icp(args: string[]): string {
  return execFileSync("icp", [...args, "--project-root-override", REPO_ROOT], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// Build-time fallback canister IDs for clients without the `ic_env` cookie
// (the Capacitor Android app). icp.yaml's presync step exports
// ICP_CLI_CID_<NAME>; a standalone `ICP_ENVIRONMENT=ic npm run build` reads
// the committed .icp/data/mappings/<env>.ids.json instead.
function buildTimeCanisterIds(): Record<string, string> {
  const fromPresync = Object.fromEntries(
    CANISTER_NAMES
      .map((n) => [n, process.env[`ICP_CLI_CID_${n.toUpperCase()}`]])
      .filter((e): e is [string, string] => !!e[1]),
  );
  if (Object.keys(fromPresync).length > 0) return fromPresync;
  for (const dir of ["data", "cache"]) {
    const file = path.join(REPO_ROOT, ".icp", dir, "mappings", `${ICP_ENVIRONMENT}.ids.json`);
    if (existsSync(file)) {
      const all = JSON.parse(readFileSync(file, "utf-8")) as Record<string, string>;
      return Object.fromEntries(CANISTER_NAMES.filter((n) => all[n]).map((n) => [n, all[n]]));
    }
  }
  return {};
}

// `vite dev` stands in for the frontend canister: it sets the same `ic_env`
// cookie (canister IDs + root key) and proxies /api to the local network
// (icp-cli skill, references/dev-server.md). Needs `icp network start -d` and
// `icp deploy`; without a network the app runs on stub data.
function devServerConfig() {
  try {
    const status = JSON.parse(icp(["network", "status", "-e", ICP_ENVIRONMENT, "--json"]));
    const ids = CANISTER_NAMES.flatMap((name) => {
      try {
        return [`PUBLIC_CANISTER_ID:${name}=${icp(["canister", "status", name, "-e", ICP_ENVIRONMENT, "--id-only"])}`];
      } catch {
        return []; // not deployed yet — that service falls back to stub data
      }
    });
    return {
      headers: {
        "Set-Cookie": `ic_env=${encodeURIComponent(`${ids.join("&")}&ic_root_key=${status.root_key}`)}; SameSite=Lax;`,
      },
      proxy: { "/api": { target: status.api_url, changeOrigin: true } },
    };
  } catch {
    console.warn(`[vite] No icp network for environment "${ICP_ENVIRONMENT}" — running on stub data. Start one with \`icp network start -d && icp deploy\`.`);
    return {};
  }
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest (not the default generateSW) — issue #28 needs a
      // hand-written `push`/`notificationclick` handler in the service
      // worker itself, which generateSW's auto-built SW has no hook for.
      // src/sw.ts owns precaching (via the injected __WB_MANIFEST) plus
      // those two listeners.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Service worker is generated for production builds only (the
      // default); `vite dev` is unaffected, avoiding stale-cache dev friction.
      injectManifest: {
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
    __ICP_CANISTER_IDS__: JSON.stringify(command === "build" ? buildTimeCanisterIds() : {}),
    // VAPID public key is not secret (it's the whole point of VAPID — see
    // scripts/send-pending-push.mjs for the private key, which must never
    // be build-injected or committed).
    VITE_VAPID_PUBLIC_KEY: JSON.stringify(process.env.VAPID_PUBLIC_KEY      ?? ""),
  },
  server: {
    port: 5173,
    // Only for `vite dev`: `vite build` must not shell out to icp.
    ...(command === "serve" && !process.env.VITEST ? devServerConfig() : {}),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
}));
