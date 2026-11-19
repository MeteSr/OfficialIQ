import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuthStore } from "./store/authStore";
import { registerOfflineSync } from "./lib/offlineSync";
import { registerNativePushListener } from "./lib/pushNotifications";
import BottomNav from "./components/BottomNav";
import ErrorBoundary from "./components/ErrorBoundary";
import LandingPage from "./pages/LandingPage";
import NativeCallbackPage from "./pages/NativeCallbackPage";
import HomePage from "./pages/HomePage";
import StudyPage from "./pages/StudyPage";
import ExamPage from "./pages/ExamPage";
import RanksPage from "./pages/RanksPage";
import MePage from "./pages/MePage";
import { features } from "./lib/features";
import { installErrorReporting } from "./lib/errorReporting";

// The bottom-nav tabs ship in the main bundle; every other page is its own
// chunk, loaded when first opened. The service worker precaches all chunks
// (vite.config.ts globPatterns), so they still open offline.
const QuizPage = lazy(() => import("./pages/QuizPage"));
const AddFriendPage = lazy(() => import("./pages/AddFriendPage"));
const ChallengePage = lazy(() => import("./pages/ChallengePage"));
const WeeklyQuizPage = lazy(() => import("./pages/WeeklyQuizPage"));
const MonthlyQuizPage = lazy(() => import("./pages/MonthlyQuizPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const AudioModePage = lazy(() => import("./pages/AudioModePage"));
const GroupsPage = lazy(() => import("./pages/GroupsPage"));
const GroupDetailPage = lazy(() => import("./pages/GroupDetailPage"));
const CertExamPage = lazy(() => import("./pages/CertExamPage"));
const CommuteModePage = lazy(() => import("./pages/CommuteModePage"));
const MentorPage = lazy(() => import("./pages/MentorPage"));
const MentorReportPage = lazy(() => import("./pages/MentorReportPage"));
const AssociationPage = lazy(() => import("./pages/AssociationPage"));
const AssociationDetailPage = lazy(() => import("./pages/AssociationDetailPage"));
const MechanicsScenarioPage = lazy(() => import("./pages/MechanicsScenarioPage"));
const VideoSubmissionPage = lazy(() => import("./pages/VideoSubmissionPage"));
const ModerationQueuePage = lazy(() => import("./pages/ModerationQueuePage"));
const ReportCardPage = lazy(() => import("./pages/ReportCardPage"));
const PublicReportPage = lazy(() => import("./pages/PublicReportPage"));
const SharedReportsPage = lazy(() => import("./pages/SharedReportsPage"));
const RuleAssistantPage = lazy(() => import("./pages/RuleAssistantPage"));
const AiDrillsPage = lazy(() => import("./pages/AiDrillsPage"));
const ScenarioGeneratorPage = lazy(() => import("./pages/ScenarioGeneratorPage"));
const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const AssociationAnalyticsPage = lazy(() => import("./pages/AssociationAnalyticsPage"));
const DeleteAccountPage = lazy(() => import("./pages/DeleteAccountPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const UpgradeReturnPage = lazy(() => import("./pages/UpgradeReturnPage"));
const RuleChangesPage = lazy(() => import("./pages/RuleChangesPage"));
const TranscriptPage = lazy(() => import("./pages/TranscriptPage"));
const AssociationTrainingPage = lazy(() => import("./pages/AssociationTrainingPage"));

// A feature this build has switched off (src/lib/features.ts) sends its
// route home, so an old link or bookmark can't open an empty screen.
function Gate({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <>{children}</> : <Navigate to="/home" replace />;
}

// The landing page is the one route that isn't part of the mobile app
// shell below — a signed-out visitor at "/" should see a real, full-width
// desktop-capable page, not the 430px-capped app frame. Everything else
// stays inside the mobile shell as before.
function LandingRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/home" replace />;
  return <LandingPage />;
}

function PageLoading() {
  return <div role="status" aria-label="Loading" style={{ padding: 24 }} />;
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 64 }}>
        <ErrorBoundary key={location.pathname} onGoHome={() => navigate("/home")}>
        <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/home"  element={<HomePage />} />
          <Route path="/study" element={<StudyPage />} />
          <Route path="/exam"  element={<ExamPage />} />
          <Route path="/ranks" element={<RanksPage />} />
          <Route path="/me"    element={<MePage />} />
          <Route path="/u/:principal" element={<AddFriendPage />} />
          <Route path="/challenge/:id" element={<ChallengePage />} />
          <Route path="/weekly-quiz" element={<WeeklyQuizPage />} />
          <Route path="/monthly-quiz" element={<MonthlyQuizPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/audio" element={<Gate on={features.audio}><AudioModePage /></Gate>} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:id" element={<GroupDetailPage />} />
          <Route path="/exam-sim" element={<CertExamPage />} />
          <Route path="/commute" element={<CommuteModePage />} />
          <Route path="/mentor" element={<MentorPage />} />
          <Route path="/mentor/:token" element={<MentorReportPage />} />
          <Route path="/association" element={<AssociationPage />} />
          <Route path="/association/:id" element={<AssociationDetailPage />} />
          <Route path="/mechanics/:scenarioId" element={<MechanicsScenarioPage />} />
          <Route path="/submit-clip" element={<Gate on={features.clipSubmissions}><VideoSubmissionPage /></Gate>} />
          <Route path="/moderation" element={<ModerationQueuePage />} />
          <Route path="/reports" element={<ReportCardPage />} />
          <Route path="/reports/shared" element={<SharedReportsPage />} />
          <Route path="/report/:id" element={<PublicReportPage />} />
          <Route path="/ask" element={<Gate on={features.ai}><RuleAssistantPage /></Gate>} />
          <Route path="/ai-drills" element={<Gate on={features.ai}><AiDrillsPage /></Gate>} />
          <Route path="/ai-scenarios" element={<Gate on={features.ai}><ScenarioGeneratorPage /></Gate>} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/association/:id/analytics" element={<AssociationAnalyticsPage />} />
          <Route path="/association/:id/training" element={<AssociationTrainingPage />} />
          <Route path="/association/:id/training/:member" element={<TranscriptPage />} />
          <Route path="/transcript" element={<TranscriptPage />} />
          <Route path="/quiz/share/:token" element={<QuizPage />} />
          <Route path="/quiz/:articleId" element={<QuizPage />} />
          <Route path="/account/delete" element={<DeleteAccountPage />} />
          <Route path="/upgrade/return" element={<UpgradeReturnPage />} />
          <Route path="/rule-changes" element={<RuleChangesPage />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  useEffect(() => {
    installErrorReporting();
    registerOfflineSync();
    registerNativePushListener((path) => navigate(path));
  }, [navigate]);
  const location = useLocation();
  const isLandingRoute = location.pathname === "/";

  // Outside the auth provider: nothing here needs a session.
  if (location.pathname === "/native-callback") return <NativeCallbackPage />;
  // Public: the stores link here, and visitors read them before signing in.
  if (location.pathname === "/privacy" || location.pathname === "/terms") {
    return (
      <Suspense fallback={<PageLoading />}>
        <LegalPage doc={location.pathname === "/privacy" ? "privacy" : "terms"} />
      </Suspense>
    );
  }

  return (
    <AuthProvider>
      {isLandingRoute ? <LandingRoute /> : <AppShell />}
    </AuthProvider>
  );
}
