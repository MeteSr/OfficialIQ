import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import BottomNav from "./components/BottomNav";
import HomePage from "./pages/HomePage";
import StudyPage from "./pages/StudyPage";
import ExamPage from "./pages/ExamPage";
import RanksPage from "./pages/RanksPage";
import MePage from "./pages/MePage";
import QuizPage from "./pages/QuizPage";
import AddFriendPage from "./pages/AddFriendPage";

export default function App() {
  return (
    <AuthProvider>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", maxWidth: 430, margin: "0 auto" }}>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 64 }}>
          <Routes>
            <Route path="/"      element={<Navigate to="/home" replace />} />
            <Route path="/home"  element={<HomePage />} />
            <Route path="/study" element={<StudyPage />} />
            <Route path="/exam"  element={<ExamPage />} />
            <Route path="/ranks" element={<RanksPage />} />
            <Route path="/me"    element={<MePage />} />
            <Route path="/u/:principal" element={<AddFriendPage />} />
            <Route path="/quiz/share/:token" element={<QuizPage />} />
            <Route path="/quiz/:articleId" element={<QuizPage />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </AuthProvider>
  );
}
