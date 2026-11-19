import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { LEGAL, LEGAL_DRAFT, PRIVACY, TERMS } from "../legal";

/**
 * /privacy and /terms. Public (the store listings link here), full-width
 * reading layout, no sign-in.
 */
export default function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  const { t, i18n } = useTranslation();
  const content = doc === "privacy" ? PRIVACY : TERMS;
  const english = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("en");
  return (
    <div style={{ background: T.bg, minHeight: "100dvh", color: T.text, fontFamily: T.font }}>
      <article lang="en" style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 64px", lineHeight: 1.6, fontSize: 15 }}>
        <a href="/" style={{ fontSize: 13, color: T.muted }}>‹ OfficialIQ</a>
        {LEGAL_DRAFT && (
          <div role="note" style={{ marginTop: 16, padding: "10px 14px", border: `1px solid ${T.wrong}`, borderRadius: 8, color: T.wrong, fontSize: 13 }}>
            {t("legal.draft")}
          </div>
        )}
        {!english && (
          <div role="note" lang={i18n.language} style={{ marginTop: 16, padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, fontSize: 13 }}>
            {t("legal.englishOnly")}
          </div>
        )}
        <h1 style={{ fontFamily: T.fontCondensed, fontSize: 34, margin: "20px 0 4px" }}>{content.title}</h1>
        <div style={{ fontSize: 13, color: T.muted }}>Effective {LEGAL.effectiveDate}</div>
        {content.sections.map((s) => (
          <section key={s.heading}>
            <h2 style={{ fontSize: 18, margin: "28px 0 8px" }}>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i} style={{ margin: "0 0 10px" }}>{p}</p>)}
            {s.bullets && <ul style={{ margin: "0 0 10px", paddingLeft: 22 }}>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
          </section>
        ))}
        <nav style={{ marginTop: 32, fontSize: 13, display: "flex", gap: 16 }}>
          <a href="/privacy" style={{ color: T.muted }}>Privacy Policy</a>
          <a href="/terms" style={{ color: T.muted }}>Terms of Use</a>
        </nav>
      </article>
    </div>
  );
}
