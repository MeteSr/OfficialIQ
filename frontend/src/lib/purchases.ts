import { Capacitor } from "@capacitor/core";

/**
 * Whether this build may show prices, purchase links or pages that sell
 * something: the website only. The Android and iOS apps stay free and show
 * none of that, not even "buy on the web" (no in-app purchases; issues #78
 * and #80, App Store guideline 3.1.1).
 */
export function purchasesAllowed(): boolean {
  return !Capacitor.isNativePlatform();
}
