import { useState } from "react";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useAuth } from "../contexts/AuthContext";
import { setLanguage, SUPPORTED_LANGUAGES } from "../i18n";

// Unlike every other page, this one is NOT constrained to the app's
// 430px mobile-shell width (see App.tsx) — it's the one surface meant to
// be viewed on a real desktop browser by someone who hasn't signed in yet.
// Still mobile-optimized: fluid grid/typography handle small viewports
// without a separate mobile layout, plus real breakpoints (via the
// injected <style> block, same pattern already used for the print
// stylesheets in ReportCardPage/AssociationAnalyticsPage) for the layout
// decisions fluid CSS alone can't express.

// Illustrative-only figures — this page has no billing backend yet (see
// the canister map in CLAUDE.md), so every CTA below routes to the same
// Internet Identity sign-in, same as the rest of the marketing content.
const LAST_EXAM_BREAKDOWN = [
  { key: "art4", pct: 94 },
  { key: "art9", pct: 88 },
  { key: "art7", pct: 71 },
  { key: "art10", pct: 58 },
] as const;

// Names are sample data, not UI copy, so they stay untranslated.
const ROSTER_ROWS: { name: string; week: string; mastery: string; cert: "current" | "lapsed" }[] = [
  { name: "D. Whitfield", week: "10/10", mastery: "88%", cert: "current" },
  { name: "M. Alvarez", week: "10/10", mastery: "84%", cert: "current" },
  { name: "R. Okafor", week: "6/10", mastery: "71%", cert: "current" },
  { name: "J. Behrens", week: "0/10", mastery: "54%", cert: "lapsed" },
  { name: "T. Nakamura", week: "9/10", mastery: "80%", cert: "current" },
];

const MOCK_NAV = ["home", "study", "ranks", "exam", "me"] as const;

// Endonyms on purpose: a language picker should name each language in
// itself, so it reads the same whichever language is active (same as MePage).
const LANGUAGE_NAMES: Record<(typeof SUPPORTED_LANGUAGES)[number], string> = {
  en: "English",
  es: "Español",
};

function masteryBarColor(pct: number) {
  return pct >= 80 ? fill.accent : pct >= 60 ? fill.attention : fill.wrong;
}

// The shared T.faint (and T.muted in light mode) fall below WCAG AA 4.5:1
// for the small text this page uses them on (e.g. light faint is ~2.9:1 on
// T.bg). These page-local values keep the same visual hierarchy but pass AA
// on both T.bg and T.surface in each mode.
function landingTextTones() {
  return T.mode === "light"
    ? { muted: "rgba(18,21,23,0.68)", faint: "rgba(18,21,23,0.62)" }  // ≈6.0:1 / ≈4.9:1
    : { muted: T.muted, faint: "rgba(243,244,241,0.52)" };             // ≈5.7:1 / ≈5.2:1
}

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { login, devLogin } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { muted, faint } = landingTextTones();
  // Bright fills (fill.*) are for button/bar backgrounds; text in an accent
  // hue uses the mode-aware T.* variant so it stays readable on light bg.
  const accentText = T.accent;
  const attentionText = T.attention;

  async function handleSignIn() {
    setSigningIn(true);
    setError(null);
    try {
      await login();
    } catch {
      setError(t("landing.signInFailed"));
    } finally {
      setSigningIn(false);
    }
  }

  const sectionHeadingStyle = {
    margin: 0, fontFamily: T.fontCondensed, fontWeight: 700,
    fontSize: "clamp(28px, 3.6vw, 40px)", letterSpacing: "-0.008em", color: T.text,
  } as const;

  return (
    <div className="landing" style={{ background: T.bg, color: T.text, fontFamily: T.font, overflowX: "clip" }}>
      <style>{`
        .landing a:focus-visible, .landing button:focus-visible {
          outline: 2px solid ${T.accent}; outline-offset: 3px;
        }
        .landing section[id] { scroll-margin-top: 80px; }
        .landing-hero { display: flex; flex-direction: column; gap: 40px; }
        .landing-hero-visual { display: flex; justify-content: center; }
        .landing-nav-links { display: none; }
        .landing-2col { display: flex; flex-direction: column; gap: 40px; }
        .landing-grid-3 { display: grid; gap: 20px; grid-template-columns: 1fr; }
        .landing-roster th, .landing-roster td { padding: 12px 8px; text-align: left; }
        .landing-roster th:first-child, .landing-roster td:first-child { padding-left: 14px; }
        .landing-roster th:last-child, .landing-roster td:last-child { padding-right: 14px; }
        @media (min-width: 480px) {
          .landing-roster th, .landing-roster td { padding: 13px 12px; }
          .landing-roster th:first-child, .landing-roster td:first-child { padding-left: 18px; }
          .landing-roster th:last-child, .landing-roster td:last-child { padding-right: 18px; }
        }
        @media (min-width: 720px) {
          .landing-grid-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
        }
        @media (min-width: 900px) {
          .landing-nav-links { display: flex; align-items: center; gap: 28px; }
          .landing-hero { flex-direction: row; align-items: start; gap: 56px; }
          .landing-hero-copy { flex: 1; }
          .landing-hero-visual { flex: none; }
          .landing-2col { flex-direction: row; align-items: center; gap: 56px; }
          .landing-2col > * { flex: 1; min-width: 0; }
        }
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 10, background: T.bg, borderBottom: `1px solid ${T.hairline}` }}>
        <nav
          aria-label={t("landing.navLabel")}
          style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 24 }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginRight: "auto" }}>
            <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, letterSpacing: "0.02em", color: T.text }}>
              {t("landing.wordmark")}
            </span>
            <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9, letterSpacing: "0.14em", color: faint }}>
              {t("landing.betaTag")}
            </span>
          </div>
          <div className="landing-nav-links">
            <a href="#features" style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: muted }}>{t("landing.navHowItWorks")}</a>
            <a href="#associations" style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: muted }}>{t("landing.navAssociations")}</a>
            <a href="#pricing" style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: muted }}>{t("landing.navPricing")}</a>
            <button onClick={handleSignIn} disabled={signingIn} style={{ background: "transparent", border: 0, fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: muted, cursor: "pointer" }}>
              {t("landing.signIn")}
            </button>
          </div>
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            style={{ background: fill.accent, color: fill.onAccent, fontFamily: T.font, fontWeight: 600, fontSize: 13.5, padding: "11px 18px", borderRadius: 8, border: 0, cursor: "pointer", opacity: signingIn ? 0.7 : 1, flexShrink: 0 }}
          >
            {signingIn ? t("landing.signingIn") : t("landing.startFree")}
          </button>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section style={{ maxWidth: 1240, margin: "0 auto", padding: "48px 20px 0" }}>
          <div className="landing-hero">
            <div className="landing-hero-copy">
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 9,
                fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em",
                color: accentText, border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 13px",
              }}>
                <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 3, background: fill.accent }} />
                {t("landing.heroEyebrow")}
              </div>
              <h1 style={{
                margin: "22px 0 0", fontFamily: T.fontCondensed, fontWeight: 700,
                fontSize: "clamp(34px, 5.2vw, 64px)", lineHeight: 1, letterSpacing: "-0.01em",
                color: T.text, maxWidth: "14ch",
              }}>
                {t("landing.heroTitle")}
              </h1>
              <p style={{ margin: "20px 0 0", fontFamily: T.font, fontSize: "clamp(15px, 1.6vw, 18px)", lineHeight: 1.6, color: muted, maxWidth: 540 }}>
                {t("landing.heroSubtitle")}
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 28, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={handleSignIn}
                  disabled={signingIn}
                  style={{ background: fill.accent, color: fill.onAccent, fontFamily: T.font, fontWeight: 600, fontSize: 15, padding: "16px 26px", borderRadius: 9, border: 0, cursor: "pointer", opacity: signingIn ? 0.7 : 1 }}
                >
                  {signingIn ? t("landing.signingIn") : t("landing.startFree")}
                </button>
                <a href="#features" style={{ border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 15, padding: "15px 24px", borderRadius: 9 }}>
                  {t("landing.heroCtaSecondary")}
                </a>
              </div>
              <p style={{ fontFamily: T.font, fontSize: 13, color: faint, marginTop: 12 }}>
                {t("landing.heroCtaSub")}
              </p>
              {error && <div role="alert" style={{ fontFamily: T.font, fontSize: 13, color: T.wrong, marginTop: 10 }}>{error}</div>}

              <dl style={{ display: "flex", marginTop: 48, borderTop: `1px solid ${T.hairline}`, paddingTop: 20, maxWidth: 560 }}>
                {[
                  [t("landing.statOfficials"), t("landing.statOfficialsLabel"), T.text],
                  [t("landing.statAssociations"), t("landing.statAssociationsLabel"), accentText],
                  [t("landing.statSession"), t("landing.statSessionLabel"), T.text],
                ].map(([value, label, color], i) => (
                  <div key={label} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column-reverse", justifyContent: "flex-end", borderLeft: i > 0 ? `1px solid ${T.hairline}` : "none", paddingLeft: i > 0 ? 16 : 0, paddingRight: 8 }}>
                    {/* <dt> label first in the DOM so screen readers announce
                        "Associations: 31"; column-reverse keeps the number on top. */}
                    <dt style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.09em", color: faint, marginTop: 7 }}>{label}</dt>
                    <dd style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: "clamp(24px, 7vw, 30px)", color }}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Phone mockup — a static facsimile of the real /home screen,
                exposed to assistive tech as a single image with a text
                description; the fake UI inside is hidden from it. */}
            <div className="landing-hero-visual">
              <div
                role="img"
                aria-label={t("landing.mockAlt")}
                style={{ width: 300, maxWidth: "100%", borderRadius: 12, overflow: "hidden", background: T.bg, border: `1px solid ${T.border}`, boxShadow: T.mode === "light" ? "0 24px 48px rgba(18,21,23,0.12)" : "0 32px 64px rgba(0,0,0,0.35)" }}
              >
                <div aria-hidden="true">
                  <div style={{ background: T.panelAlt, color: T.text, padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: T.font, fontWeight: 500, fontSize: 11.5 }}>
                    <span style={{ color: attentionText, fontFamily: T.fontMono, fontWeight: 600, fontSize: 9, letterSpacing: "0.08em" }}>{t("landing.mockDay")}</span>
                    {t("landing.mockBanner")}
                  </div>
                  <div style={{ padding: "16px 18px 18px", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9, letterSpacing: "0.13em", textTransform: "uppercase", color: faint }}>{t("landing.mockWeek")}</div>
                    <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 24, color: T.text, marginTop: 7 }}>{t("landing.mockGreeting")}</div>
                    <div style={{ display: "flex", marginTop: 16, borderTop: `1px solid ${T.hairline}`, paddingTop: 13 }}>
                      {([
                        ["14", "landing.mockStreak", T.text],
                        ["#47", "landing.mockRank", accentText],
                        ["84%", "landing.mockAccuracy", T.text],
                      ] as const).map(([value, labelKey, color], i) => (
                        <div key={labelKey} style={{ flex: 1, minWidth: 0, borderLeft: i > 0 ? `1px solid ${T.hairline}` : "none", paddingLeft: i > 0 ? 13 : 0 }}>
                          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, color }}>{value}</div>
                          <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 8.5, letterSpacing: "0.08em", color: faint, marginTop: 5 }}>{t(labelKey)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: 13, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "10px 13px", borderBottom: `1px solid ${T.hairline}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: faint }}>{t("landing.mockDoNext")}</span>
                        <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 8.5, letterSpacing: "0.06em", color: T.wrong }}>{t("landing.mockOverdue")}</span>
                      </div>
                      <div style={{ padding: 13 }}>
                        <div style={{ fontFamily: T.fontCondensed, fontWeight: 600, fontSize: 15, color: T.text }}>{t("landing.mockArticle")}</div>
                        <div style={{ display: "flex", gap: 3, margin: "12px 0 0" }}>
                          <div style={{ flex: 1, height: 4, borderRadius: 2, background: fill.accent }} />
                          <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.border }} />
                        </div>
                        <div style={{ width: "100%", minHeight: 34, marginTop: 12, background: fill.accent, color: fill.onAccent, borderRadius: 7, fontFamily: T.font, fontWeight: 600, fontSize: 11.5, lineHeight: "34px", textAlign: "center" }}>{t("landing.mockDrillCta")}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", background: T.panel, borderTop: `1px solid ${T.border}`, marginTop: 2, borderRadius: 8, overflow: "hidden" }}>
                      {MOCK_NAV.map((key, i) => (
                        <div key={key} style={{ flex: 1, minWidth: 0, padding: "9px 0", textAlign: "center", borderTop: `2px solid ${i === 0 ? fill.accent : "transparent"}`, color: i === 0 ? T.text : faint, fontFamily: T.fontMono, fontWeight: i === 0 ? 600 : 500, fontSize: 7.5, letterSpacing: "0.08em" }}>{t(`landing.mockNav.${key}`)}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* A week in the app */}
        <section id="features" aria-labelledby="landing-features-title" style={{ maxWidth: 1240, margin: "0 auto", padding: "96px 20px 0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, paddingBottom: 20 }}>
            <h2 id="landing-features-title" style={sectionHeadingStyle}>
              {t("landing.featuresTitle")}
            </h2>
            <p style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13, color: muted, maxWidth: "38ch" }}>
              {t("landing.featuresSubtitle")}
            </p>
          </div>
          {/* gap:1 over a hairline background draws the 1px column dividers. */}
          <div className="landing-grid-3" style={{ gap: 1, background: T.hairline, borderBottom: `1px solid ${T.hairline}` }}>
            {(["monday", "midweek", "gameNight"] as const).map((key, i) => (
              <div key={key} style={{ background: T.bg, padding: "30px 26px 34px" }}>
                <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", color: i === 0 ? accentText : i === 1 ? attentionText : faint }}>
                  {t(`landing.feature.${key}.tag`)}
                </div>
                <h3 style={{ margin: "14px 0 0", fontFamily: T.fontCondensed, fontWeight: 600, fontSize: 21, color: T.text }}>
                  {t(`landing.feature.${key}.title`)}
                </h3>
                <p style={{ margin: "10px 0 0", fontFamily: T.font, fontSize: 13.5, lineHeight: 1.6, color: muted }}>
                  {t(`landing.feature.${key}.desc`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Exam simulator */}
        <section aria-labelledby="landing-exam-title" style={{ maxWidth: 1240, margin: "0 auto", padding: "88px 20px 0" }}>
          <div className="landing-2col">
            <div>
              <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", color: faint }}>{t("landing.examEyebrow")}</div>
              <h2 id="landing-exam-title" style={{ ...sectionHeadingStyle, margin: "16px 0 0", fontSize: "clamp(26px, 3.6vw, 40px)", maxWidth: "16ch" }}>
                {t("landing.examTitle")}
              </h2>
              <p style={{ margin: "16px 0 0", fontFamily: T.font, fontSize: 15.5, lineHeight: 1.65, color: muted, maxWidth: "50ch" }}>
                {t("landing.examDesc")}
              </p>
              <dl style={{ display: "flex", flexDirection: "column", marginTop: 28, maxWidth: 470 }}>
                {(["full", "breakdown", "threshold"] as const).map((key, i, arr) => (
                  <div key={key} style={{
                    display: "flex", flexWrap: "wrap", gap: "4px 16px", justifyContent: "space-between", alignItems: "baseline", padding: "14px 0",
                    borderTop: `1px solid ${T.border}`, borderBottom: i === arr.length - 1 ? `1px solid ${T.border}` : "none",
                  }}>
                    <dt style={{ fontFamily: T.font, fontWeight: 500, fontSize: 14, color: T.text }}>{t(`landing.examFeature.${key}.label`)}</dt>
                    <dd style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 12.5, color: key === "threshold" ? accentText : muted }}>{t(`landing.examFeature.${key}.value`)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <figure aria-label={t("landing.examCardLabel")} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "26px clamp(18px, 5vw, 26px) 30px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", color: faint }}>{t("landing.examCardEyebrow")}</span>
                <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, color: faint }}>{t("landing.examCardDate")}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 12px", marginTop: 16 }}>
                <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 52, color: accentText }}>86%</span>
                <span style={{ fontFamily: T.font, fontSize: 13.5, color: muted }}>{t("landing.examCardScoreDesc")}</span>
              </div>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 13, marginTop: 24 }}>
                {LAST_EXAM_BREAKDOWN.map(row => (
                  <li key={row.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: T.font, fontWeight: 500, fontSize: 12.5, color: T.text, marginBottom: 6 }}>
                      <span>{t(`landing.examBreakdown.${row.key}`)}</span>
                      <span style={{ fontFamily: T.fontMono, fontSize: 11.5, color: muted }}>{row.pct}%</span>
                    </div>
                    <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: T.border }}>
                      <div style={{ width: `${row.pct}%`, height: 6, borderRadius: 3, background: masteryBarColor(row.pct) }} />
                    </div>
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </section>

        {/* For associations */}
        <section id="associations" aria-labelledby="landing-associations-title" style={{ margin: "96px 0 0", padding: "64px 20px", background: T.panel, borderTop: `1px solid ${T.hairline}`, borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ maxWidth: 1240, margin: "0 auto" }}>
            <div className="landing-2col" style={{ alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", color: faint }}>{t("landing.associationsEyebrow")}</div>
                <h2 id="landing-associations-title" style={{ ...sectionHeadingStyle, margin: "16px 0 0", fontSize: "clamp(26px, 3.6vw, 40px)", maxWidth: "18ch" }}>
                  {t("landing.associationsTitle")}
                </h2>
                <p style={{ margin: "16px 0 0", fontFamily: T.font, fontSize: 15.5, lineHeight: 1.65, color: muted, maxWidth: "52ch" }}>
                  {t("landing.associationsDesc")}
                </p>
                {/* Was a dead href="#" link. Routes through sign-in like
                    every other CTA until there's a booking flow. */}
                <button
                  onClick={handleSignIn}
                  disabled={signingIn}
                  style={{ display: "inline-block", marginTop: 24, background: "transparent", border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 15, padding: "15px 24px", borderRadius: 9, cursor: "pointer", opacity: signingIn ? 0.7 : 1 }}
                >
                  {t("landing.associationsCta")}
                </button>
              </div>
              <div style={{ width: "100%", border: `1px solid ${T.border}`, borderRadius: 12, background: T.mode === "light" ? T.bg : T.surface, overflow: "hidden" }}>
                <table className="landing-roster" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
                    {t("landing.rosterCaption")}
                  </caption>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}`, fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.1em", color: faint }}>
                      <th scope="col" style={{ fontWeight: 600 }}>{t("landing.rosterOfficial")}</th>
                      <th scope="col" style={{ fontWeight: 600 }}>{t("landing.rosterWeek")}</th>
                      <th scope="col" style={{ fontWeight: 600 }}>{t("landing.rosterMastery")}</th>
                      <th scope="col" style={{ fontWeight: 600 }}>{t("landing.rosterCert")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROSTER_ROWS.map(r => (
                      <tr key={r.name} style={{ borderBottom: `1px solid ${T.hairline}` }}>
                        <th scope="row" style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13, color: T.text }}>{r.name}</th>
                        <td style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 12, color: r.week.startsWith("10") ? T.text : (r.cert === "lapsed" ? T.wrong : muted) }}>{r.week}</td>
                        <td style={{ fontFamily: T.fontCondensed, fontWeight: 600, fontSize: 14, color: T.text }}>{r.mastery}</td>
                        <td style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.06em", color: r.cert === "lapsed" ? T.wrong : faint }}>
                          {t(r.cert === "lapsed" ? "landing.rosterLapsed" : "landing.rosterCurrent")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: "12px 18px", fontFamily: T.fontMono, fontWeight: 500, fontSize: 11, letterSpacing: "0.06em", color: faint }}>
                  {t("landing.rosterMore", { count: 38 })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="landing-pricing-title" style={{ maxWidth: 1240, margin: "0 auto", padding: "88px 20px 0" }}>
          <h2 id="landing-pricing-title" style={sectionHeadingStyle}>
            {t("landing.pricingTitle")}
          </h2>
          <div className="landing-grid-3" style={{ marginTop: 28 }}>
            {(["rookie", "varsity", "association"] as const).map((tier) => {
              const featured = tier === "varsity";
              return (
                <div key={tier} style={{
                  border: `1px solid ${featured ? fill.accent : T.border}`, borderRadius: 12,
                  padding: "26px 24px 28px", display: "flex", flexDirection: "column", gap: 12,
                  background: featured ? T.surface : "transparent",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <h3 style={{ margin: 0, fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", color: featured ? accentText : faint }}>
                      {t(`landing.pricing.${tier}.tag`)}
                    </h3>
                    {featured && (
                      <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9, letterSpacing: "0.08em", color: fill.onAccent, background: fill.accent, padding: "5px 8px", borderRadius: 5 }}>
                        {t("landing.pricing.mostOfficials")}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                    <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 38, color: T.text }}>{t(`landing.pricing.${tier}.price`)}</span>
                    {tier === "varsity" && <span style={{ fontFamily: T.font, fontSize: 13, color: faint }}>{t("landing.pricing.perMonth")}</span>}
                  </div>
                  <p style={{ margin: 0, fontFamily: T.font, fontSize: 13.5, lineHeight: 1.6, color: muted }}>
                    {t(`landing.pricing.${tier}.desc`)}
                  </p>
                  <button
                    onClick={handleSignIn}
                    disabled={signingIn}
                    style={{
                      marginTop: "auto", textAlign: "center", border: featured ? 0 : `1px solid ${T.border}`,
                      background: featured ? fill.accent : "transparent", color: featured ? fill.onAccent : T.text,
                      fontFamily: T.font, fontWeight: 600, fontSize: 13.5, padding: "14px 0", borderRadius: 9,
                      cursor: "pointer", opacity: signingIn ? 0.7 : 1,
                    }}
                  >
                    {t(`landing.pricing.${tier}.cta`)}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="landing-cta-title" style={{ maxWidth: 1240, margin: "0 auto", padding: "96px 20px 88px" }}>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 40, display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-end", justifyContent: "space-between" }}>
            <h2 id="landing-cta-title" style={{ ...sectionHeadingStyle, fontSize: "clamp(28px, 4vw, 48px)", lineHeight: 1.05, letterSpacing: "-0.01em", maxWidth: "18ch" }}>
              {t("landing.ctaTitle")}
            </h2>
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              style={{ flexShrink: 0, background: fill.accent, color: fill.onAccent, fontFamily: T.font, fontWeight: 600, fontSize: 15.5, padding: "17px 28px", borderRadius: 9, border: 0, cursor: "pointer", opacity: signingIn ? 0.7 : 1 }}
            >
              {signingIn ? t("landing.signingIn") : t("landing.startFree")}
            </button>
          </div>
        </section>
      </main>

      <footer style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 20px 40px", borderTop: `1px solid ${T.hairline}`, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 24px" }}>
        <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 14, letterSpacing: "0.03em", color: muted, marginRight: "auto" }}>
          {t("landing.wordmark")}
        </span>
        {/* Signed-out visitors have no profile to pull a language from, so
            this is the only way to see the Spanish copy before signing in. */}
        <div role="group" aria-label={t("landing.languageLabel")} style={{ display: "flex", gap: 4 }}>
          {SUPPORTED_LANGUAGES.map(code => {
            const active = (i18n.resolvedLanguage ?? i18n.language) === code;
            return (
              <button
                key={code}
                lang={code}
                aria-pressed={active}
                onClick={() => setLanguage(code)}
                style={{ background: "transparent", border: `1px solid ${active ? T.border : "transparent"}`, borderRadius: 6, padding: "6px 9px", fontFamily: T.font, fontSize: 12.5, fontWeight: active ? 600 : 500, color: active ? T.text : faint, cursor: "pointer" }}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            );
          })}
        </div>
        <a href="/privacy" style={{ fontFamily: T.font, fontSize: 12.5, color: faint }}>{t("me.privacyPolicy")}</a>
        <a href="/terms" style={{ fontFamily: T.font, fontSize: 12.5, color: faint }}>{t("me.terms")}</a>
        <span style={{ fontFamily: T.font, fontSize: 12.5, color: faint }}>
          {t("landing.footerCopyright", { year: new Date().getFullYear() })}
        </span>
      </footer>

      {/* Dev-only escape hatch — AuthContext skips auto-login when the URL
          has ?skipDevAuth (that's the only way to ever see this page
          locally, since dev mode otherwise auto-signs-in before render).
          This gets you back into the app without a real Internet Identity
          flow. Never rendered in a production build. */}
      {import.meta.env.DEV && (
        <div style={{ padding: "0 20px 24px", textAlign: "center" }}>
          <button
            onClick={() => devLogin()}
            style={{ fontSize: 12, color: faint, background: "transparent", textDecoration: "underline" }}
          >
            [dev] Sign in with test identity
          </button>
        </div>
      )}
    </div>
  );
}
