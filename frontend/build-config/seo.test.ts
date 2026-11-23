import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  siteUrlFromEnv,
  PAGES,
  headTags,
  robotsTxt,
  sitemapXml,
  appRoutePaths,
  redirectsFile,
  injectPage,
  seoBuildFiles,
  OG_IMAGE,
} from "./seo";

const SITE = "https://officialiq.example";

describe("siteUrlFromEnv", () => {
  it("is the origin of SITE_URL, without a trailing slash", () => {
    expect(siteUrlFromEnv({ SITE_URL: "https://officialiq.example/" })).toBe(SITE);
    expect(siteUrlFromEnv({ SITE_URL: "https://officialiq.example/some/path" })).toBe(SITE);
  });

  it("is empty when unset, so staging, local and PR builds stay out of search", () => {
    expect(siteUrlFromEnv({})).toBe("");
    expect(siteUrlFromEnv({ SITE_URL: "  " })).toBe("");
  });

  it("refuses anything that isn't https", () => {
    expect(() => siteUrlFromEnv({ SITE_URL: "http://officialiq.example" })).toThrow(/https/);
    expect(() => siteUrlFromEnv({ SITE_URL: "officialiq.example" })).toThrow();
  });
});

describe("headTags", () => {
  const landing = PAGES.find((p) => p.path === "/")!;
  const privacy = PAGES.find((p) => p.path === "/privacy")!;

  it("covers the landing page and both legal pages", () => {
    expect(PAGES.map((p) => p.path)).toEqual(["/", "/privacy", "/terms"]);
  });

  it("gives every page its own title and a description of a useful length", () => {
    const titles = new Set(PAGES.map((p) => p.title));
    expect(titles.size).toBe(PAGES.length);
    for (const p of PAGES) {
      expect(p.title).toMatch(/OfficialIQ/);
      expect(p.description.length).toBeGreaterThanOrEqual(70);
      expect(p.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("writes title, description, Open Graph and Twitter card tags", () => {
    const html = headTags(landing, SITE);
    expect(html).toContain(`<title>${landing.title}</title>`);
    expect(html).toContain(`<meta name="description" content="${landing.description}"`);
    expect(html).toContain(`<meta property="og:title" content="${landing.title}"`);
    expect(html).toContain(`<meta property="og:description" content="${landing.description}"`);
    expect(html).toContain('<meta property="og:type" content="website"');
    expect(html).toContain('<meta property="og:site_name" content="OfficialIQ"');
    expect(html).toContain(`<meta property="og:url" content="${SITE}/"`);
    expect(html).toContain(`<meta property="og:image" content="${SITE}/og-image.png"`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain(`<meta name="twitter:image" content="${SITE}/og-image.png"`);
  });

  it("points the canonical URL at the configured site", () => {
    expect(headTags(landing, SITE)).toContain(`<link rel="canonical" href="${SITE}/"`);
    expect(headTags(privacy, SITE)).toContain(`<link rel="canonical" href="${SITE}/privacy"`);
    expect(headTags(privacy, SITE)).not.toContain("noindex");
  });

  it("marks the page noindex, with no canonical, when no site URL is set", () => {
    const html = headTags(landing, "");
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).not.toContain("canonical");
    expect(html).not.toContain("og:url");
    // Relative image still gives link previews something to show.
    expect(html).toContain('<meta property="og:image" content="/og-image.png"');
  });

  it("escapes text that would break the attribute", () => {
    const html = headTags({ path: "/", title: 'A "B" & C', description: "<x>" }, SITE);
    expect(html).toContain("<title>A &quot;B&quot; &amp; C</title>");
    expect(html).toContain('content="&lt;x&gt;"');
  });
});

describe("robotsTxt", () => {
  it("allows crawling and names the sitemap on the configured site", () => {
    const txt = robotsTxt(SITE);
    expect(txt).toMatch(/^User-agent: \*$/m);
    expect(txt).toMatch(/^Allow: \/$/m);
    expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it("blocks everything when no site URL is set", () => {
    const txt = robotsTxt("");
    expect(txt).toMatch(/^Disallow: \/$/m);
    expect(txt).not.toContain("Sitemap");
  });
});

describe("sitemapXml", () => {
  it("lists every public page on the configured site", () => {
    const xml = sitemapXml(SITE);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/privacy</loc>`);
    expect(xml).toContain(`<loc>${SITE}/terms</loc>`);
    expect(xml).not.toContain("/home");
  });
});

describe("appRoutePaths", () => {
  const source = `
    if (location.pathname === "/native-callback") return x;
    if (location.pathname === "/privacy" || location.pathname === "/terms") {}
    <Route path="/home" element={<HomePage />} />
    <Route path="/u/:principal" element={<A />} />
    <Route path="/groups" element={<G />} />
    <Route path="/groups/:id" element={<G />} />
    <Route path="/association/:id/training/:member" element={<T />} />
    <Route path="*" element={<Navigate to="/home" replace />} />
  `;

  it("finds the first segment of every route the app handles itself", () => {
    expect(appRoutePaths(source)).toEqual(["/association", "/groups", "/home", "/native-callback", "/u"]);
  });

  it("leaves out the pages that are prerendered to their own files", () => {
    expect(appRoutePaths(source)).not.toContain("/privacy");
  });

  it("covers the real app's routes", () => {
    const app = readFileSync(path.resolve(__dirname, "../src/App.tsx"), "utf-8");
    const paths = appRoutePaths(app);
    for (const p of ["/home", "/study", "/exam", "/ranks", "/me", "/quiz", "/u", "/report", "/native-callback", "/upgrade"]) {
      expect(paths).toContain(p);
    }
  });
});

describe("redirectsFile", () => {
  const lines = redirectsFile(["/groups", "/home"]).split("\n").filter((l) => l && !l.startsWith("#"));
  const rules = lines.map((l) => l.trim().split(/\s+/));

  it("serves the landing page and the legal pages from their own files", () => {
    expect(rules[0]).toEqual(["/", "/index.html", "200"]);
    expect(rules).toContainEqual(["/privacy", "/privacy/index.html", "200"]);
    expect(rules).toContainEqual(["/terms", "/terms/index.html", "200"]);
  });

  it("sends every app route, and anything below it, to the app shell", () => {
    expect(rules).toContainEqual(["/home", "/app.html", "200"]);
    expect(rules).toContainEqual(["/home/*", "/app.html", "200"]);
    expect(rules).toContainEqual(["/groups/*", "/app.html", "200"]);
  });

  it("answers a real 404 for missing assets and for any other path, last", () => {
    expect(rules).toContainEqual(["/assets/*", "/404.html", "404"]);
    expect(rules[rules.length - 1]).toEqual(["/*", "/404.html", "404"]);
  });
});

describe("injectPage", () => {
  const template = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>OfficialIQ</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

  it("replaces the title with the page's head tags and fills the root", () => {
    const html = injectPage(template, { head: "<title>X</title>\n<meta name=\"a\" />", body: "<h1>Hi</h1>" });
    expect(html).toContain("<title>X</title>");
    expect(html).not.toContain("<title>OfficialIQ</title>");
    expect(html).toContain('<div id="root"><h1>Hi</h1></div>');
    expect(html).toContain('src="/assets/index-abc.js"');
  });

  it("refuses a template it can't place the page in", () => {
    expect(() => injectPage("<html></html>", { head: "", body: "" })).toThrow();
  });
});

describe("seoBuildFiles", () => {
  const built = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>OfficialIQ</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
  const render = (p: string) => `<main>page ${p}</main>`;
  const appSource = `<Route path="/home" element={<H />} />`;

  it("writes every prerendered page, the app shell and the crawler files", () => {
    const files = seoBuildFiles({ indexHtml: built, appSource, siteUrl: SITE, render });
    expect(Object.keys(files).sort()).toEqual([
      "_redirects", "app.html", "index.html", "privacy/index.html", "robots.txt", "sitemap.xml", "terms/index.html",
    ]);
    expect(files["index.html"]).toContain("<main>page /</main>");
    expect(files["index.html"]).toContain(`<link rel="canonical" href="${SITE}/"`);
    expect(files["privacy/index.html"]).toContain("<main>page /privacy</main>");
    expect(files["terms/index.html"]).toContain("<title>Terms of Service | OfficialIQ</title>");
    expect(files["_redirects"]).toMatch(/^\/home\s+\/app\.html\s+200$/m);
  });

  it("keeps the app shell empty and noindex, with the same scripts", () => {
    const { "app.html": app } = seoBuildFiles({ indexHtml: built, appSource, siteUrl: SITE, render });
    expect(app).toContain('<meta name="robots" content="noindex"');
    expect(app).toContain('<div id="root"></div>');
    expect(app).toContain('src="/assets/index-abc.js"');
  });
});

describe("index.html and public files", () => {
  const root = path.resolve(__dirname, "..");
  const index = readFileSync(path.join(root, "index.html"), "utf-8");

  it("declares the icon, the home-screen icon and the theme colour", () => {
    expect(index).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml"');
    expect(index).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(index).toContain('<meta name="theme-color" content="#0D1012"');
  });

  it("ships the icons and the link-preview image they point at", () => {
    const png = (f: string) => readFileSync(path.join(root, "public", f));
    const size = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];
    expect(readFileSync(path.join(root, "public/favicon.svg"), "utf-8")).toContain("<svg");
    expect(size(png("apple-touch-icon.png"))).toEqual([180, 180]);
    expect(size(png(OG_IMAGE.slice(1)))).toEqual([1200, 630]);
  });

  it("no longer keeps a hand-written _redirects (the build writes it)", () => {
    expect(() => readFileSync(path.join(root, "public/_redirects"))).toThrow();
  });
});

describe("_headers", () => {
  const headers = readFileSync(path.resolve(__dirname, "../public/_headers"), "utf-8");

  it("keeps the app shell out of search results and revalidated", () => {
    expect(headers).toMatch(/^\/app\.html\n  Cache-Control: no-cache, must-revalidate\n  X-Robots-Tag: noindex$/m);
  });

  it("revalidates every prerendered page", () => {
    for (const f of ["/index.html", "/privacy/index.html", "/terms/index.html"]) {
      expect(headers).toContain(`${f}\n  Cache-Control: no-cache, must-revalidate`);
    }
  });
});
