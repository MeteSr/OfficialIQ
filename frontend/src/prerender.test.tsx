import { describe, it, expect } from "vitest";
import en from "./i18n/en.json";
import { PRIVACY, TERMS } from "./legal";
import { renderPage } from "./prerender";

describe("renderPage", () => {
  it("renders the landing page's real content for crawlers", () => {
    const html = renderPage("/");
    expect(html).toContain(en.landing.heroTitle);
    expect(html).toContain("<h1");
    expect(html).toContain('href="/privacy"');
  });

  it("renders the privacy policy and the terms", () => {
    expect(renderPage("/privacy")).toContain(PRIVACY.title);
    expect(renderPage("/terms")).toContain(TERMS.title);
  });

  it("refuses a page that isn't prerendered", () => {
    expect(() => renderPage("/home")).toThrow();
  });
});
