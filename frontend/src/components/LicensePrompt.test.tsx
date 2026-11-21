import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../i18n";

const allowed = vi.fn(() => true);
vi.mock("../lib/purchases", () => ({ purchasesAllowed: () => allowed() }));

import LicensePrompt from "./LicensePrompt";

function show() {
  render(<MemoryRouter><LicensePrompt associationId="asc7" /></MemoryRouter>);
}

describe("LicensePrompt", () => {
  afterEach(() => { cleanup(); allowed.mockReset(); });

  it("links a coordinator on the website to the license page", () => {
    allowed.mockReturnValue(true);
    show();
    expect(screen.getByText(/needs an association license/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /license/i })).toHaveAttribute("href", "/association/asc7/license");
  });

  it("shows no purchase link or price in the apps", () => {
    allowed.mockReturnValue(false);
    show();
    expect(screen.getByText(/needs an association license/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.queryByText(/web/i)).toBeNull();
  });
});
