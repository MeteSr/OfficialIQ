import { registerPlugin } from "@capacitor/core";

// iOS only. Android and the web have no implementation: callers check
// Capacitor.isPluginAvailable("NativeAuth") and fall back to @capacitor/browser
// plus a verified App Link (see src/lib/nativeAuth.ts).
export const NativeAuth = registerPlugin("NativeAuth");
