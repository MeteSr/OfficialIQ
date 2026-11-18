// Build-time only: imported by vite.config.ts, never by the app (so it lives
// outside src/ and is type-checked with tsconfig.node.json).

export const APP_ID = "app.officialiq.study"; // capacitor.config.ts

// Files under /.well-known that let Internet Identity and the phone's OS trust
// the native sign-in callback (`<origin>/native-callback`, src/lib/nativeAuth.ts):
//   ii-auth-callbacks            II's ICRC-167 allow-list of callback URLs
//   apple-app-site-association   iOS associated domains (needs APPLE_TEAM_ID)
//   assetlinks.json              Android App Links (needs ANDROID_CERT_SHA256,
//                                comma-separated: Play's app signing key, and
//                                the upload key for sideloaded test builds)
// The static-site canister serves .well-known/ as-is; public/_headers sets the
// content type and CORS.
export function wellKnownFiles(env: Record<string, string | undefined>, origin: string): Record<string, string> {
  if (!origin) return {};
  const files: Record<string, string> = {
    "ii-auth-callbacks": JSON.stringify({ callbacks: [`${origin}/native-callback`] }),
  };
  const teamId = env.APPLE_TEAM_ID?.trim();
  if (teamId) {
    const appId = `${teamId}.${APP_ID}`;
    files["apple-app-site-association"] = JSON.stringify({
      applinks: { details: [{ appIDs: [appId], components: [{ "/": "/native-callback", comment: "Internet Identity sign-in" }] }] },
      webcredentials: { apps: [appId] },
    });
  }
  const fingerprints = (env.ANDROID_CERT_SHA256 ?? "").split(",").map((f) => f.trim().toUpperCase()).filter(Boolean);
  if (fingerprints.length > 0) {
    files["assetlinks.json"] = JSON.stringify([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: APP_ID, sha256_cert_fingerprints: fingerprints },
    }]);
  }
  return files;
}

