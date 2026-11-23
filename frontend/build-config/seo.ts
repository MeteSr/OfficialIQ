// Build-time only: imported by vite.config.ts (see wellKnown.ts).
//
// What search engines and link previews see. One setting decides it all:
// SITE_URL, the public origin of the website (a repository variable for the
// production deploy). Set, the build is indexable and every canonical URL,
// the sitemap and the preview image point there. Unset (local, PR, staging
// builds) the build tells crawlers to stay away, so a staging copy never
// competes with the real site. When the custom domain arrives, changing
// SITE_URL is the whole switch.
//
// Routing: the landing page and the legal pages are prerendered to their own
// files (src/prerender.tsx). Every route the app handles itself goes to
// app.html, the plain app shell, which is noindex. Anything else is a real
// 404, so a made-up URL doesn't look like a page.

export type SeoPage = { path: string; title: string; description: string };

export const PAGES: SeoPage[] = [
  {
    path: "/",
    title: "OfficialIQ | Rules study and exam prep for sports officials",
    description:
      "Ten minutes a day on the rulebook: weekly quizzes, spaced repetition on the calls you miss, and a full exam simulator before certification.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy | OfficialIQ",
    description:
      "What OfficialIQ stores about officials and associations, what it sends to other services, and how to delete your account.",
  },
  {
    path: "/terms",
    title: "Terms of Service | OfficialIQ",
    description:
      "The terms for using OfficialIQ, the rules study and exam prep app for sports officials and officiating associations.",
  },
];

export const OG_IMAGE = "/og-image.png";

export function siteUrlFromEnv(env: Record<string, string | undefined>): string {
  const raw = env.SITE_URL?.trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SITE_URL must be a full https URL, got "${raw}"`);
  }
  if (url.protocol !== "https:") throw new Error(`SITE_URL must use https, got "${raw}"`);
  return url.origin;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function headTags(page: SeoPage, siteUrl: string): string {
  const title = esc(page.title);
  const description = esc(page.description);
  const image = `${siteUrl}${OG_IMAGE}`;
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    siteUrl ? `<link rel="canonical" href="${siteUrl}${page.path}" />` : `<meta name="robots" content="noindex" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="OfficialIQ" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    ...(siteUrl ? [`<meta property="og:url" content="${siteUrl}${page.path}" />`] : []),
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];
  return tags.join("\n    ");
}

/** Head for app.html: the signed-in app, never a search result. */
export function appShellHeadTags(): string {
  return [`<title>OfficialIQ</title>`, `<meta name="robots" content="noindex" />`].join("\n    ");
}

export function robotsTxt(siteUrl: string): string {
  if (!siteUrl) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

export function sitemapXml(siteUrl: string): string {
  const urls = PAGES.map((p) => `  <url><loc>${siteUrl}${p.path}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * First path segments of every route App.tsx handles in the app shell, read
 * from its source so a new route can't be forgotten here and 404.
 */
export function appRoutePaths(appSource: string): string[] {
  const prerendered = new Set(PAGES.map((p) => p.path));
  const found = new Set<string>();
  const patterns = [/<Route\s+path="([^"]+)"/g, /location\.pathname\s*===\s*"([^"]+)"/g];
  for (const re of patterns) {
    for (const m of appSource.matchAll(re)) {
      if (!m[1].startsWith("/")) continue; // the "*" fallback inside the shell
      const segment = m[1].split("/").filter(Boolean)[0];
      if (segment && !prerendered.has(`/${segment}`)) found.add(`/${segment}`);
    }
  }
  return [...found].sort();
}

/** The certified-assets canister's _redirects (Netlify syntax, first match wins). */
export function redirectsFile(appPaths: string[]): string {
  const rows: [string, string, number][] = [
    ["/", "/index.html", 200],
    ["/assets/*", "/404.html", 404],
    ...PAGES.filter((p) => p.path !== "/").map((p): [string, string, number] => [p.path, `${p.path}/index.html`, 200]),
    ...appPaths.flatMap((p): [string, string, number][] => [[p, "/app.html", 200], [`${p}/*`, "/app.html", 200]]),
    ["/*", "/404.html", 404],
  ];
  const width = Math.max(...rows.map((r) => r[0].length)) + 2;
  return [
    "# Generated by frontend/build-config/seo.ts at build time; edit that, not this.",
    "# Real files win over these rules.",
    ...rows.map(([from, to, status]) => `${from.padEnd(width)}${to.padEnd(22)}${status}`),
    "",
  ].join("\n");
}

/** Puts a page's head tags and prerendered markup into the built index.html. */
export function injectPage(template: string, page: { head: string; body: string }): string {
  if (!/<title>[^<]*<\/title>/.test(template) || !template.includes('<div id="root"></div>')) {
    throw new Error("index.html needs a <title> and an empty <div id=\"root\"></div> to prerender into");
  }
  return template
    .replace(/<title>[^<]*<\/title>/, () => page.head)
    .replace('<div id="root"></div>', () => `<div id="root">${page.body}</div>`);
}

/**
 * Every file the SEO step adds to or replaces in the build, from the built
 * index.html (which already carries the hashed script tags).
 */
export function seoBuildFiles(opts: {
  indexHtml: string;
  appSource: string;
  siteUrl: string;
  render: (path: string) => string;
}): Record<string, string> {
  const { indexHtml, appSource, siteUrl, render } = opts;
  const files: Record<string, string> = {
    "app.html": injectPage(indexHtml, { head: appShellHeadTags(), body: "" }),
    "robots.txt": robotsTxt(siteUrl),
    "sitemap.xml": sitemapXml(siteUrl),
    "_redirects": redirectsFile(appRoutePaths(appSource)),
  };
  for (const page of PAGES) {
    const file = page.path === "/" ? "index.html" : `${page.path.slice(1)}/index.html`;
    files[file] = injectPage(indexHtml, { head: headTags(page, siteUrl), body: render(page.path) });
  }
  return files;
}
