import { configDefaults, defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { wellKnownFiles } from "./build-config/wellKnown";
import { featuresFromEnv } from "./build-config/features";
import { seoBuildFiles, siteUrlFromEnv } from "./build-config/seo";

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

// The frontend canister's ID, for the native app's sign-in origin below.
function frontendCanisterId(): string | undefined {
  if (process.env.ICP_CLI_CID_FRONTEND) return process.env.ICP_CLI_CID_FRONTEND;
  for (const dir of ["data", "cache"]) {
    const file = path.join(REPO_ROOT, ".icp", dir, "mappings", `${ICP_ENVIRONMENT}.ids.json`);
    if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf-8")) as Record<string, string>).frontend;
  }
  return undefined;
}

// The origin the website is served on, which native sign-in returns to
// (src/lib/nativeAuth.ts). NATIVE_WEB_ORIGIN overrides it, e.g. for a custom
// domain; otherwise it's the frontend canister's icp0.io address. Local builds
// have none, and the app then can't sign in natively.
function nativeWebOrigin(): string {
  if (process.env.NATIVE_WEB_ORIGIN) return new URL(process.env.NATIVE_WEB_ORIGIN).origin;
  if (ICP_ENVIRONMENT === "local") return "";
  const id = frontendCanisterId();
  return id ? `https://${id}.icp0.io` : "";
}

function wellKnownPlugin(origin: string): Plugin {
  return {
    name: "officialiq-well-known",
    apply: "build",
    generateBundle() {
      for (const [name, source] of Object.entries(wellKnownFiles(process.env, origin))) {
        this.emitFile({ type: "asset", fileName: `.well-known/${name}`, source });
      }
    },
  };
}

// Prerendered pages, robots.txt, sitemap.xml and _redirects
// (build-config/seo.ts). Runs after Vite has written the hashed script tags
// into index.html and before the service worker's precache list is built, so
// the precache revisions match the files that ship. The pages are rendered by
// src/prerender.tsx through Vite's SSR loader, with the build's own defines.
function seoPlugin(siteUrl: string, define: Record<string, string>): Plugin {
  return {
    name: "officialiq-seo",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") return;
      const { createServer } = await import("vite");
      const server = await createServer({
        configFile: false,
        root: __dirname,
        mode: "production",
        logLevel: "error",
        appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false },
        plugins: [react()],
        resolve: { alias: { "@": path.resolve(__dirname, "src") } },
        define,
      });
      try {
        const { renderPage } = (await server.ssrLoadModule("/src/prerender.tsx")) as { renderPage: (p: string) => string };
        const files = seoBuildFiles({
          indexHtml: String(index.source),
          appSource: readFileSync(path.resolve(__dirname, "src/App.tsx"), "utf-8"),
          siteUrl,
          render: renderPage,
        });
        for (const [fileName, source] of Object.entries(files)) {
          if (fileName === "index.html") index.source = source;
          else this.emitFile({ type: "asset", fileName, source });
        }
      } finally {
        await server.close();
      }
    },
  };
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

export default defineConfig(({ command }) => {
  const webOrigin = command === "build" ? nativeWebOrigin() : "";
  const define = {
    __ICP_CANISTER_IDS__: JSON.stringify(command === "build" ? buildTimeCanisterIds() : {}),
    __NATIVE_WEB_ORIGIN__: JSON.stringify(webOrigin),
    // VAPID public key is not secret (it's the whole point of VAPID — see
    // scripts/send-pending-push.mjs for the private key, which must never
    // be build-injected or committed).
    VITE_VAPID_PUBLIC_KEY: JSON.stringify(process.env.VAPID_PUBLIC_KEY      ?? ""),
    // Builds only: `vite dev` and tests leave every feature on (src/lib/features.ts),
    // unless FEATURES_FROM_ENV=1 asks for a build's switches (the billing
    // end-to-end tests run a dev server with the paywall on).
    ...(command === "build" || process.env.FEATURES_FROM_ENV === "1"
      ? { __FEATURES__: JSON.stringify(featuresFromEnv(process.env)) }
      : {}),
    __APP_RELEASE__: JSON.stringify(process.env.APP_RELEASE ?? process.env.GITHUB_SHA?.slice(0, 7) ?? "dev"),
  };
  return {
  plugins: [
    react(),
    wellKnownPlugin(webOrigin),
    // The public origin for canonical URLs and the sitemap; unset, the build is noindex.
    seoPlugin(siteUrlFromEnv(process.env), define),
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
  define,
  server: {
    port: 5173,
    // Only for `vite dev`: `vite build` must not shell out to icp.
    ...(command === "serve" && !process.env.VITEST ? devServerConfig() : {}),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Browser end-to-end tests run under Playwright (playwright.config.ts).
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
};
});
