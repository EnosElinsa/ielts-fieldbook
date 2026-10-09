import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy } from 'react';
import { FieldbookProvider } from './context/FieldbookContext';
import { Shell } from './components/Shell';
import { TodayPage } from './features/today/TodayPage';
import { WritingBankPage } from './features/writing/WritingBankPage';
import { WritingDeskPage } from './features/writing/WritingDeskPage';
import { ReviewPage } from './features/review/ReviewPage';
import { AssessmentDetailPage } from './features/review/AssessmentDetailPage';
import { LexiconPage } from './features/lexicon/LexiconPage';
import { SpeakingBankPage } from './features/speaking/SpeakingBankPage';
import { SpeakingTopicPage } from './features/speaking/SpeakingTopicPage';
import { StoriesPage } from './features/speaking/StoriesPage';
import { AccountPage } from './features/account/AccountPage';
const ProgressPage = lazy(() => import('./features/progress/ProgressPage').then((module) => ({ default: module.ProgressPage })));
const SpeakingDeskPage = lazy(() => import('./features/speaking/SpeakingDeskPage').then((module) => ({ default: module.SpeakingDeskPage })));

export function AppRoutes() {
  return (
    <FieldbookProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<TodayPage />} />
          <Route path="write/questions" element={<WritingBankPage />} />
          <Route path="write" element={<WritingDeskPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="review/:id" element={<AssessmentDetailPage />} />
          <Route path="phrases" element={<LexiconPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="speak" element={<SpeakingDeskPage />} />
          <Route path="speak/questions" element={<SpeakingBankPage />} />
          <Route path="speak/topics/:id" element={<SpeakingTopicPage />} />
          <Route path="stories" element={<StoriesPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </FieldbookProvider>
  );
}

export default function App() {
  return <AppRoutes />;
}
