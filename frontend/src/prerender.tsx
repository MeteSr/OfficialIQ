// Build-time only: vite.config.ts loads this through Vite's SSR loader and
// writes each page's markup into its HTML file, so crawlers and link previews
// that don't run JavaScript see the real page. The browser app then renders
// over it as usual (createRoot, not hydration).
import { renderToString } from "react-dom/server";
import "./i18n";
import { AuthProvider } from "./contexts/AuthContext";
import LandingPage from "./pages/LandingPage";
import LegalPage from "./pages/LegalPage";

export function renderPage(path: string): string {
  switch (path) {
    case "/":
      // Effects don't run here, so the provider only supplies the context.
      return renderToString(<AuthProvider><LandingPage /></AuthProvider>);
    case "/privacy":
      return renderToString(<LegalPage doc="privacy" />);
    case "/terms":
      return renderToString(<LegalPage doc="terms" />);
    default:
      throw new Error(`${path} isn't a prerendered page`);
  }
}
