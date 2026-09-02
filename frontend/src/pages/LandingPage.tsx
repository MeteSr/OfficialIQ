import { useState } from "react";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useAuth } from "../contexts/AuthContext";

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
  { label: "Art. 4 — Definitions", pct: 94 },
  { label: "Art. 9 — Violations", pct: 88 },
  { label: "Art. 7 — Timing", pct: 71 },
  { label: "Art. 10 — Fouls & penalties", pct: 58 },
];

const ROSTER_ROWS: { name: string; week: string; mastery: string; cert: "CURRENT" | "LAPSED" }[] = [
  { name: "D. Whitfield", week: "10/10", mastery: "88%", cert: "CURRENT" },
  { name: "M. Alvarez", week: "10/10", mastery: "84%", cert: "CURRENT" },
  { name: "R. Okafor", week: "6/10", mastery: "71%", cert: "CURRENT" },
  { name: "J. Behrens", week: "0/10", mastery: "54%", cert: "LAPSED" },
  { name: "T. Nakamura", week: "9/10", mastery: "80%", cert: "CURRENT" },
];

function masteryBarColor(pct: number) {
  return pct >= 80 ? fill.accent : pct >= 60 ? fill.attention : fill.wrong;
}

export default function LandingPage() {
  const { t } = useTranslation();
  const { login, devLogin } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: T.font }}>
      <style>{`
        .landing-hero { display: flex; flex-direction: column; gap: 40px; }
        .landing-hero-visual { display: flex; justify-content: center; }
        .landing-nav-links { display: none; }
        .landing-2col { display: flex; flex-direction: column; gap: 40px; }
        .landing-grid-3 { display: grid; gap: 20px; grid-template-columns: 1fr; }
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

      {/* Nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 10,
        background: T.bg, borderBottom: `1px solid ${T.hairline}`,
        padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 24,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginRight: "auto" }}>
          <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, letterSpacing: "0.02em", color: T.text }}>
            {t("landing.wordmark")}
          </span>
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9, letterSpacing: "0.14em", color: T.faint }}>
            {t("landing.betaTag")}
          </span>
        </div>
        <div className="landing-nav-links">
          <a href="#features" style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: T.muted }}>{t("landing.navHowItWorks")}</a>
          <a href="#associations" style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: T.muted }}>{t("landing.navAssociations")}</a>
          <a href="#pricing" style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: T.muted }}>{t("landing.navPricing")}</a>
          <button onClick={handleSignIn} disabled={signingIn} style={{ background: "transparent", border: 0, fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: T.muted, cursor: "pointer" }}>
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

      {/* Hero */}
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "48px 20px 0" }}>
        <div className="landing-hero">
          <div className="landing-hero-copy">
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 9,
              fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em",
              color: fill.accent, border: `1px solid ${T.border}`, borderRadius: 100, padding: "8px 13px",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 3, background: fill.accent }} />
              {t("landing.heroEyebrow")}
            </div>
            <h1 style={{
              margin: "22px 0 0", fontFamily: T.fontCondensed, fontWeight: 700,
              fontSize: "clamp(34px, 5.2vw, 64px)", lineHeight: 1, letterSpacing: "-0.01em",
              color: T.text, maxWidth: "14ch",
            }}>
              {t("landing.heroTitle")}
            </h1>
            <p style={{ margin: "20px 0 0", fontFamily: T.font, fontSize: "clamp(15px, 1.6vw, 18px)", lineHeight: 1.6, color: T.muted, maxWidth: 540 }}>
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
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.faint, marginTop: 12 }}>
              {t("landing.heroCtaSub")}
            </div>
            {error && <div style={{ fontFamily: T.font, fontSize: 13, color: T.wrong, marginTop: 10 }}>{error}</div>}

            <div style={{ display: "flex", marginTop: 48, borderTop: `1px solid ${T.hairline}`, paddingTop: 20, maxWidth: 560 }}>
              {[
                [t("landing.statOfficials"), t("landing.statOfficialsLabel"), T.text],
                [t("landing.statAssociations"), t("landing.statAssociationsLabel"), fill.accent],
                [t("landing.statSession"), t("landing.statSessionLabel"), T.text],
              ].map(([value, label, color], i) => (
                <div key={label} style={{ flex: 1, borderLeft: i > 0 ? `1px solid ${T.hairline}` : "none", paddingLeft: i > 0 ? 20 : 0 }}>
                  <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 30, color }}>{value}</div>
                  <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.09em", color: T.faint, marginTop: 7 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Decorative phone mockup — a static facsimile of the real /home
              screen. No image assets; hardcoded illustrative data only. */}
          <div className="landing-hero-visual">
            <div style={{ width: 300, borderRadius: 28, overflow: "hidden", background: T.bg, border: `1px solid ${T.border}`, boxShadow: "0 32px 64px rgba(0,0,0,0.35)" }}>
              <div style={{ background: T.panelAlt, color: T.text, padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: T.font, fontWeight: 500, fontSize: 11.5 }}>
                <span style={{ color: fill.attention, fontFamily: T.fontMono, fontWeight: 600, fontSize: 9, letterSpacing: "0.08em" }}>FRI</span>
                {t("landing.mockBanner")}
              </div>
              <div style={{ padding: "16px 18px 18px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9, letterSpacing: "0.13em", textTransform: "uppercase", color: T.faint }}>{t("landing.mockWeek")}</div>
                <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 24, color: T.text, marginTop: 7 }}>{t("landing.mockGreeting")}</div>
                <div style={{ display: "flex", marginTop: 16, borderTop: `1px solid ${T.hairline}`, paddingTop: 13 }}>
                  <div style={{ flex: 1 }}><div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, color: T.text }}>14</div><div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 8.5, letterSpacing: "0.08em", color: T.faint, marginTop: 5 }}>DAY STREAK</div></div>
                  <div style={{ flex: 1, borderLeft: `1px solid ${T.hairline}`, paddingLeft: 13 }}><div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, color: fill.accent }}>#47</div><div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 8.5, letterSpacing: "0.08em", color: T.faint, marginTop: 5 }}>STATE RANK</div></div>
                  <div style={{ flex: 1, borderLeft: `1px solid ${T.hairline}`, paddingLeft: 13 }}><div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, color: T.text }}>84%</div><div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 8.5, letterSpacing: "0.08em", color: T.faint, marginTop: 5 }}>ACCURACY</div></div>
                </div>
              </div>
              <div style={{ padding: 13, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 13px", borderBottom: `1px solid ${T.hairline}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: T.faint }}>{t("landing.mockDoNext")}</span>
                    <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 8.5, letterSpacing: "0.06em", color: T.wrong }}>1 OVERDUE</span>
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
                  {["HOME", "STUDY", "RANKS", "EXAM", "ME"].map((label, i) => (
                    <div key={label} style={{ flex: 1, padding: "9px 0", textAlign: "center", borderTop: `2px solid ${i === 0 ? fill.accent : "transparent"}`, color: i === 0 ? T.text : T.faint, fontFamily: T.fontMono, fontWeight: i === 0 ? 600 : 500, fontSize: 7.5, letterSpacing: "0.08em" }}>{label}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* A week in the app */}
      <section id="features" style={{ maxWidth: 1240, margin: "0 auto", padding: "96px 20px 0" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, paddingBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: T.fontCondensed, fontWeight: 700, fontSize: "clamp(28px, 3.6vw, 40px)", letterSpacing: "-0.008em", color: T.text }}>
            {t("landing.featuresTitle")}
          </h2>
          <span style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13, color: T.muted, maxWidth: "38ch" }}>
            {t("landing.featuresSubtitle")}
          </span>
        </div>
        <div className="landing-grid-3" style={{ marginTop: 1, background: T.hairline, borderBottom: `1px solid ${T.hairline}` }}>
          {(["monday", "midweek", "gameNight"] as const).map((key, i) => (
            <div key={key} style={{ background: T.bg, padding: "30px 26px 34px" }}>
              <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", color: i === 0 ? fill.accent : i === 1 ? fill.attention : T.faint }}>
                {t(`landing.feature.${key}.tag`)}
              </div>
              <h3 style={{ margin: "14px 0 0", fontFamily: T.fontCondensed, fontWeight: 600, fontSize: 21, color: T.text }}>
                {t(`landing.feature.${key}.title`)}
              </h3>
              <p style={{ margin: "10px 0 0", fontFamily: T.font, fontSize: 13.5, lineHeight: 1.6, color: T.muted }}>
                {t(`landing.feature.${key}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Exam simulator */}
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "88px 20px 0" }}>
        <div className="landing-2col">
          <div>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", color: T.faint }}>{t("landing.examEyebrow")}</div>
            <h2 style={{ margin: "16px 0 0", fontFamily: T.fontCondensed, fontWeight: 700, fontSize: "clamp(26px, 3.6vw, 40px)", letterSpacing: "-0.008em", color: T.text, maxWidth: "16ch" }}>
              {t("landing.examTitle")}
            </h2>
            <p style={{ margin: "16px 0 0", fontFamily: T.font, fontSize: 15.5, lineHeight: 1.65, color: T.muted, maxWidth: "50ch" }}>
              {t("landing.examDesc")}
            </p>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 28, maxWidth: 470 }}>
              {(["full", "breakdown", "threshold"] as const).map((key, i, arr) => (
                <div key={key} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "14px 0",
                  borderTop: `1px solid ${T.border}`, borderBottom: i === arr.length - 1 ? `1px solid ${T.border}` : "none",
                }}>
                  <span style={{ fontFamily: T.font, fontWeight: 500, fontSize: 14, color: T.text }}>{t(`landing.examFeature.${key}.label`)}</span>
                  <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 12.5, color: key === "threshold" ? fill.accent : T.muted }}>{t(`landing.examFeature.${key}.value`)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "26px 26px 30px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", color: T.faint }}>{t("landing.examCardEyebrow")}</span>
              <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, color: T.faint }}>{t("landing.examCardDate")}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 16 }}>
              <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 52, color: fill.accent }}>86%</span>
              <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.muted }}>{t("landing.examCardScoreDesc")}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 24 }}>
              {LAST_EXAM_BREAKDOWN.map(row => (
                <div key={row.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.font, fontWeight: 500, fontSize: 12.5, color: T.text, marginBottom: 6 }}>
                    <span>{row.label}</span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 11.5, color: T.muted }}>{row.pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: T.border }}>
                    <div style={{ width: `${row.pct}%`, height: 6, borderRadius: 3, background: masteryBarColor(row.pct) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* For associations */}
      <section id="associations" style={{ margin: "96px 0 0", padding: "64px 20px", background: T.panel, borderTop: `1px solid ${T.hairline}`, borderBottom: `1px solid ${T.hairline}` }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          <div className="landing-2col" style={{ alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", color: T.faint }}>{t("landing.associationsEyebrow")}</div>
              <h2 style={{ margin: "16px 0 0", fontFamily: T.fontCondensed, fontWeight: 700, fontSize: "clamp(26px, 3.6vw, 40px)", letterSpacing: "-0.008em", color: T.text, maxWidth: "18ch" }}>
                {t("landing.associationsTitle")}
              </h2>
              <p style={{ margin: "16px 0 0", fontFamily: T.font, fontSize: 15.5, lineHeight: 1.65, color: T.muted, maxWidth: "52ch" }}>
                {t("landing.associationsDesc")}
              </p>
              <a href="#" style={{ display: "inline-block", marginTop: 24, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 15, padding: "15px 24px", borderRadius: 9 }}>
                {t("landing.associationsCta")}
              </a>
            </div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, background: T.surface, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", padding: "12px 18px", borderBottom: `1px solid ${T.border}`, fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.1em", color: T.faint }}>
                <span>{t("landing.rosterOfficial")}</span><span>{t("landing.rosterWeek")}</span><span>{t("landing.rosterMastery")}</span><span>{t("landing.rosterCert")}</span>
              </div>
              {ROSTER_ROWS.map(r => (
                <div key={r.name} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", alignItems: "center", padding: "13px 18px", borderBottom: `1px solid ${T.hairline}` }}>
                  <span style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13, color: T.text }}>{r.name}</span>
                  <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 12, color: r.week.startsWith("10") ? T.text : (r.cert === "LAPSED" ? T.wrong : T.muted) }}>{r.week}</span>
                  <span style={{ fontFamily: T.fontCondensed, fontWeight: 600, fontSize: 14, color: T.text }}>{r.mastery}</span>
                  <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.06em", color: r.cert === "LAPSED" ? T.wrong : T.faint }}>{r.cert}</span>
                </div>
              ))}
              <div style={{ padding: "12px 18px", fontFamily: T.fontMono, fontWeight: 500, fontSize: 11, letterSpacing: "0.06em", color: T.faint }}>
                {t("landing.rosterMore", { count: 38 })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: 1240, margin: "0 auto", padding: "88px 20px 0" }}>
        <h2 style={{ margin: 0, fontFamily: T.fontCondensed, fontWeight: 700, fontSize: "clamp(28px, 3.6vw, 40px)", letterSpacing: "-0.008em", color: T.text }}>
          {t("landing.pricingTitle")}
        </h2>
        <div className="landing-grid-3" style={{ marginTop: 28 }}>
          {(["rookie", "varsity", "association"] as const).map((tier) => {
            const featured = tier === "varsity";
            return (
              <div key={tier} style={{
                border: `1px solid ${featured ? fill.accent : T.border}`, borderRadius: 14,
                padding: "26px 24px 28px", display: "flex", flexDirection: "column", gap: 12,
                background: featured ? T.surface : "transparent",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", color: featured ? fill.accent : T.faint }}>
                    {t(`landing.pricing.${tier}.tag`)}
                  </span>
                  {featured && (
                    <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9, letterSpacing: "0.08em", color: fill.onAccent, background: fill.accent, padding: "5px 8px", borderRadius: 5 }}>
                      {t("landing.pricing.mostOfficials")}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 38, color: T.text }}>{t(`landing.pricing.${tier}.price`)}</span>
                  {tier === "varsity" && <span style={{ fontFamily: T.font, fontSize: 13, color: T.faint }}>{t("landing.pricing.perMonth")}</span>}
                </div>
                <p style={{ margin: 0, fontFamily: T.font, fontSize: 13.5, lineHeight: 1.6, color: T.muted }}>
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
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "96px 20px 88px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 40, display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-end", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontFamily: T.fontCondensed, fontWeight: 700, fontSize: "clamp(28px, 4vw, 48px)", lineHeight: 1.05, letterSpacing: "-0.01em", color: T.text, maxWidth: "18ch" }}>
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

      <footer style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 20px 40px", borderTop: `1px solid ${T.hairline}`, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
        <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 14, letterSpacing: "0.03em", color: T.muted, marginRight: "auto" }}>
          {t("landing.wordmark")}
        </span>
        <a href="#" style={{ fontFamily: T.font, fontSize: 12.5, color: T.faint }}>{t("landing.footerPrivacy")}</a>
        <a href="#" style={{ fontFamily: T.font, fontSize: 12.5, color: T.faint }}>{t("landing.footerTerms")}</a>
        <a href="#" style={{ fontFamily: T.font, fontSize: 12.5, color: T.faint }}>{t("landing.footerSupport")}</a>
        <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.faint }}>
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
            style={{ fontSize: 12, color: T.faint, background: "transparent", textDecoration: "underline" }}
          >
            [dev] Sign in with test identity
          </button>
        </div>
      )}
    </div>
  );
}
