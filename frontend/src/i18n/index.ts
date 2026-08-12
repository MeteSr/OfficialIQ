import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import es from "./es.json";

// Only languages with real, reviewed translations belong here — an entry
// with no resources would silently fall back to English keys per-string,
// which reads as a broken half-translated app rather than "not available
// yet". See the filed follow-up issue for French/Portuguese.
export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "officialiq_language";

function initialLanguage(): SupportedLanguage {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(stored ?? "") ? (stored as SupportedLanguage) : "en";
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes
});

// Persisted locally for instant load next visit, ahead of the on-chain
// profile.preferredLanguage fetch (which is the durable, cross-device
// source of truth — see AuthContext's post-login sync).
export function setLanguage(lang: string) {
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) return;
  i18n.changeLanguage(lang);
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* best-effort */ }
}

export default i18n;
