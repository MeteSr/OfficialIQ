import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import i18n from "../i18n";
import en from "../i18n/en.json";
import es from "../i18n/es.json";
import LandingPage from "./LandingPage";

const login = vi.fn<() => Promise<void>>();
const devLogin = vi.fn();
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ login, devLogin }),
}));

type Dict = { [k: string]: string | Dict };
function flatten(o: Dict, prefix = ""): Record<string, string> {
  return Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === "string") acc[prefix + k] = v;
    else Object.assign(acc, flatten(v, `${prefix}${k}.`));
    return acc;
  }, {});
}

const enLanding = flatten((en as unknown as Dict).landing as Dict);
const esLanding = flatten((es as unknown as Dict).landing as Dict);

// Brand names, numbers and prices that legitimately read the same in both.
const SAME_IN_BOTH = new Set([
  "wordmark", "betaTag", "statAssociations", "statSession",
  "examFeature.threshold.value", "pricing.varsity.tag", "pricing.varsity.price",
  "footerCopyright",
]);

async function renderIn(lang: "en" | "es") {
  await act(async () => { await i18n.changeLanguage(lang); });
  return render(<LandingPage />);
}

beforeEach(() => {
  login.mockReset().mockResolvedValue(undefined);
  devLogin.mockReset();
});

afterEach(async () => {
  cleanup();
  await act(async () => { await i18n.changeLanguage("en"); });
});

describe("landing i18n", () => {
  it("has the same landing keys in en and es", () => {
    expect(Object.keys(esLanding).sort()).toEqual(Object.keys(enLanding).sort());
  });

  it("translates every es landing string that isn't a brand name or number", () => {
    const untranslated = Object.keys(enLanding).filter(
      k => !SAME_IN_BOTH.has(k) && enLanding[k] === esLanding[k],
    );
    expect(untranslated).toEqual([]);
  });

  it.each(["en", "es"] as const)("renders no raw translation keys in %s", async lang => {
    const { container } = await renderIn(lang);
    expect(container.textContent).not.toMatch(/landing\.[a-zA-Z]/);
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label")).not.toMatch(/landing\.[a-zA-Z]/);
    }
  });

  it("shows no English UI copy when rendered in Spanish", async () => {
    const { container } = await renderIn("es");
    const text = container.textContent ?? "";
    for (const english of [
      "Start free", "DAY STREAK", "STATE RANK", "ACCURACY", "OVERDUE",
      "Definitions", "Violations", "Fouls & penalties", "CURRENT", "LAPSED",
    ]) {
      expect(text).not.toContain(english);
    }
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(es.landing.heroTitle);
  });

  it("switches language from the footer and updates <html lang>", async () => {
    await renderIn("en");
    const group = screen.getByRole("group", { name: en.landing.languageLabel });
    const espanol = within(group).getByRole("button", { name: "Español" });
    expect(espanol).toHaveAttribute("aria-pressed", "false");

    await act(async () => { fireEvent.click(espanol); });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(es.landing.heroTitle);
    expect(within(group).getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.lang).toBe("es");
  });
});

describe("landing accessibility", () => {
  it("has one h1 and never skips a heading level", async () => {
    const { container } = await renderIn("en");
    const levels = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(h => Number(h.tagName[1]));
    expect(levels.filter(l => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level - levels[i - 1]).toBeLessThanOrEqual(1);
    });
  });

  it("uses header, nav, main and footer landmarks", async () => {
    await renderIn("en");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: en.landing.navLabel })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("exposes the phone mockup as one image with a text alternative", async () => {
    await renderIn("en");
    const img = screen.getByRole("img", { name: en.landing.mockAlt });
    // The fake UI inside the mockup must not be read out as real controls.
    expect(img.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the sample roster as a real table with column and row headers", async () => {
    await renderIn("en");
    const table = screen.getByRole("table", { name: en.landing.rosterCaption });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(table).getAllByRole("rowheader").map(c => c.textContent)).toContain("J. Behrens");
    expect(within(table).getByText(en.landing.rosterLapsed)).toBeInTheDocument();
  });

  it("has no dead '#' links and every in-page link has a target", async () => {
    const { container } = await renderIn("en");
    for (const a of container.querySelectorAll("a")) {
      const href = a.getAttribute("href") ?? "";
      expect(href).not.toBe("#");
      if (href.startsWith("#")) expect(container.querySelector(href)).not.toBeNull();
    }
  });

  it("gives every button an accessible name", async () => {
    await renderIn("en");
    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent?.trim() || button.getAttribute("aria-label")).toBeTruthy();
    }
  });
});

describe("landing sign-in", () => {
  it("routes every CTA through Internet Identity sign-in", async () => {
    await renderIn("en");
    const ctas = [
      ...screen.getAllByRole("button", { name: en.landing.startFree }),
      // Desktop-only nav link; the <900px media query hides it in jsdom.
      screen.getByRole("button", { name: en.landing.signIn, hidden: true }),
      screen.getByRole("button", { name: en.landing.associationsCta }),
      screen.getByRole("button", { name: en.landing.pricing.rookie.cta }),
      screen.getByRole("button", { name: en.landing.pricing.varsity.cta }),
      screen.getByRole("button", { name: en.landing.pricing.association.cta }),
    ];
    for (const cta of ctas) {
      await act(async () => { fireEvent.click(cta); });
    }
    expect(login).toHaveBeenCalledTimes(ctas.length);
  });

  it("disables the CTAs while sign-in is in flight", async () => {
    let resolve!: () => void;
    login.mockReturnValue(new Promise<void>(r => { resolve = r; }));
    await renderIn("en");

    fireEvent.click(screen.getAllByRole("button", { name: en.landing.startFree })[0]);

    const pending = await screen.findAllByRole("button", { name: en.landing.signingIn });
    pending.forEach(b => expect(b).toBeDisabled());
    await act(async () => { resolve(); });
    expect(screen.queryAllByRole("button", { name: en.landing.signingIn })).toHaveLength(0);
  });

  it("announces a failed sign-in", async () => {
    login.mockRejectedValue(new Error("popup closed"));
    await renderIn("en");

    fireEvent.click(screen.getAllByRole("button", { name: en.landing.startFree })[0]);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(en.landing.signInFailed));
  });
});
