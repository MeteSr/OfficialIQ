import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import LandingPage from "./LandingPage";

// "/" for a visitor: the landing page, which the build also prerenders into
// index.html for crawlers and link previews. It stays up while the session
// check runs, so that prerendered page isn't blanked out first; a signed-in
// official is then sent on to the home screen.
export default function LandingRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (!isLoading && isAuthenticated) return <Navigate to="/home" replace />;
  return <LandingPage />;
}
