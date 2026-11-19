import { lazy, Suspense, useEffect } from "react";
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
const RefresherPage = lazy(() => import("./pages/RefresherPage"));
const CrewPage = lazy(() => import("./pages/CrewPage"));
const CrewJoinPage = lazy(() => import("./pages/CrewPage").then(m => ({ default: m.CrewJoinPage })));

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
          <Route path="/audio" element={<AudioModePage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:id" element={<GroupDetailPage />} />
          <Route path="/exam-sim" element={<CertExamPage />} />
          <Route path="/commute" element={<CommuteModePage />} />
          <Route path="/mentor" element={<MentorPage />} />
          <Route path="/mentor/:token" element={<MentorReportPage />} />
          <Route path="/association" element={<AssociationPage />} />
          <Route path="/association/:id" element={<AssociationDetailPage />} />
          <Route path="/mechanics/:scenarioId" element={<MechanicsScenarioPage />} />
          <Route path="/submit-clip" element={<VideoSubmissionPage />} />
          <Route path="/moderation" element={<ModerationQueuePage />} />
          <Route path="/reports" element={<ReportCardPage />} />
          <Route path="/reports/shared" element={<SharedReportsPage />} />
          <Route path="/report/:id" element={<PublicReportPage />} />
          <Route path="/ask" element={<RuleAssistantPage />} />
          <Route path="/ai-drills" element={<AiDrillsPage />} />
          <Route path="/ai-scenarios" element={<ScenarioGeneratorPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/refresher/:gameId" element={<RefresherPage />} />
          <Route path="/crew/join/:code" element={<CrewJoinPage />} />
          <Route path="/crew/:id" element={<CrewPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/association/:id/analytics" element={<AssociationAnalyticsPage />} />
          <Route path="/quiz/share/:token" element={<QuizPage />} />
          <Route path="/quiz/:articleId" element={<QuizPage />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  useEffect(() => { registerOfflineSync(); registerNativePushListener(); }, []);
  const location = useLocation();
  const isLandingRoute = location.pathname === "/";

  // Outside the auth provider: nothing here needs a session.
  if (location.pathname === "/native-callback") return <NativeCallbackPage />;

  return (
    <AuthProvider>
      {isLandingRoute ? <LandingRoute /> : <AppShell />}
    </AuthProvider>
  );
}
