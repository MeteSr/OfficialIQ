import { useState, type SVGProps, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuth } from "../contexts/AuthContext";

// Unlike every other page, this one is NOT constrained to the app's
// 430px mobile-shell width (see App.tsx) — it's the one surface meant to
// be viewed on a real desktop browser by someone who hasn't signed in yet.
// Still mobile-optimized: fluid grid/typography handle small viewports
// without a separate mobile layout, plus a couple of real breakpoints
// (via the injected <style> block, same pattern already used for the
// print stylesheets in ReportCardPage/AssociationAnalyticsPage) for the
// handful of layout decisions fluid CSS alone can't express.

// Hand-drawn line icons (no icon-library dependency, matching the rest of
// the app's "no external UI framework" convention) — emoji read fine as
// chrome inside the app itself, but too playful for a first-impression
// marketing page. Same stroke style throughout: 24x24, currentColor,
// 1.75px rounded strokes, built from plain primitives (rect/circle/line)
// to keep them easy to hand-verify.
function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props} />
  );
}
const ICONS: Record<string, (props: SVGProps<SVGSVGElement>) => ReactElement> = {
  study: (p) => (
    <IconBase {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </IconBase>
  ),
  practice: (p) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </IconBase>
  ),
  exam: (p) => (
    <IconBase {...p}>
      <circle cx="12" cy="13" r="8" />
      <line x1="12" y1="13" x2="12" y2="8.5" />
      <line x1="12" y1="13" x2="15" y2="15" />
      <line x1="9.5" y1="2" x2="14.5" y2="2" />
    </IconBase>
  ),
  rank: (p) => (
    <IconBase {...p}>
      <line x1="4" y1="21" x2="20" y2="21" />
      <rect x="6" y="14" width="3.2" height="7" />
      <rect x="10.4" y="9" width="3.2" height="12" />
      <rect x="14.8" y="5" width="3.2" height="16" />
    </IconBase>
  ),
  mentor: (p) => (
    <IconBase {...p}>
      <rect x="3" y="5" width="18" height="11" rx="2.5" />
      <polygon points="8,16 8,20 12,16" fill="none" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="12.3" x2="14" y2="12.3" />
    </IconBase>
  ),
  anywhere: (p) => (
    <IconBase {...p}>
      <path d="M4 14a8 8 0 0 1 16 0" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </IconBase>
  ),
};

const FEATURES = [
  { key: "study" },
  { key: "practice" },
  { key: "exam" },
  { key: "rank" },
  { key: "mentor" },
  { key: "anywhere" },
] as const;

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
        .landing-hero { display: flex; flex-direction: column; gap: 32px; }
        .landing-hero-visual { display: none; }
        @media (min-width: 860px) {
          .landing-hero { flex-direction: row; align-items: center; gap: 48px; }
          .landing-hero-copy { flex: 1; }
          .landing-hero-visual { display: flex; flex: 1; justify-content: center; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        background: T.navy, color: T.white,
        padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: `2px solid ${T.red}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>🛡</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>OfficialIQ</span>
        </div>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          style={{
            padding: "9px 18px", background: T.red, color: T.white,
            borderRadius: 8, fontSize: 14, fontWeight: 700,
            opacity: signingIn ? 0.7 : 1,
          }}
        >
          {signingIn ? t("landing.signingIn") : t("landing.signIn")}
        </button>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 20px 40px" }}>
        <div className="landing-hero">
          <div className="landing-hero-copy">
            <h1 style={{
              fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 700, lineHeight: 1.15,
              marginBottom: 16, color: T.navy,
            }}>
              {t("landing.heroTitle")}
            </h1>
            <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: T.muted, lineHeight: 1.6, marginBottom: 28, maxWidth: 520 }}>
              {t("landing.heroSubtitle")}
            </p>
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              style={{
                padding: "15px 32px", background: T.red, color: T.white,
                borderRadius: 10, fontSize: 16, fontWeight: 700,
                opacity: signingIn ? 0.7 : 1,
              }}
            >
              {signingIn ? t("landing.signingIn") : t("landing.heroCta")}
            </button>
            <div style={{ fontSize: 13, color: T.faint, marginTop: 12 }}>
              {t("landing.heroCtaSub")}
            </div>
            {error && <div style={{ fontSize: 13, color: T.wrong, marginTop: 10 }}>{error}</div>}
          </div>

          {/* Decorative phone mockup — CSS only, no image assets */}
          <div className="landing-hero-visual">
            <div style={{
              width: 220, borderRadius: 28, background: T.navy,
              padding: "14px 10px", boxShadow: "0 24px 48px rgba(29,66,138,0.25)",
            }}>
              <div style={{ background: T.bg, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ background: T.navy, padding: "20px 14px 14px", color: T.white }}>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>{t("landing.mockGreeting")}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{t("landing.mockStreak")}</div>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{
                      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
                      padding: "10px 12px", fontSize: 11, color: T.muted,
                    }}>
                      {t("landing.mockArticle", { number: i })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 56px" }}>
        <div style={{
          display: "grid", gap: 20,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}>
          {FEATURES.map(f => (
            <div key={f.key} style={{
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
              padding: "22px 20px",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, marginBottom: 14,
                background: T.bg, color: T.navy,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {ICONS[f.key]({})}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                {t(`landing.feature.${f.key}.title`)}
              </div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
                {t(`landing.feature.${f.key}.desc`)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sports strip */}
      <section style={{ background: T.navy, color: T.white, padding: "40px 20px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>
            {t("landing.sportsEyebrow")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            <span style={{ padding: "8px 16px", background: T.red, borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
              🏀 {t("landing.sportNcaa")}
            </span>
            {["🏀 FIBA Basketball", "⚽ FIFA Football", "🏉 World Rugby"].map(s => (
              <span key={s} style={{
                padding: "8px 16px", background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)", borderRadius: 20, fontSize: 13, fontWeight: 600,
              }}>
                {s} · {t("landing.sportComingSoon")}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: "56px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 700, marginBottom: 12, color: T.navy }}>
          {t("landing.ctaTitle")}
        </div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 24 }}>
          {t("landing.ctaSubtitle")}
        </div>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          style={{
            padding: "15px 36px", background: T.red, color: T.white,
            borderRadius: 10, fontSize: 16, fontWeight: 700,
            opacity: signingIn ? 0.7 : 1,
          }}
        >
          {signingIn ? t("landing.signingIn") : t("landing.heroCta")}
        </button>
      </section>

      <footer style={{
        padding: "20px 20px 32px", textAlign: "center",
        fontSize: 12, color: T.faint,
      }}>
        {t("landing.footerCopyright", { year: new Date().getFullYear() })}
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
