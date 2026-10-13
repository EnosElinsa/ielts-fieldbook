import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, useEffect } from 'react';
import { FieldbookProvider } from './context/FieldbookContext';
import { Shell } from './components/Shell';
import { preloadRoute } from './routePreload';
const TodayPage = lazy(() => import('./features/today/TodayPage').then(module => ({ default: module.TodayPage })));
const WritingBankPage = lazy(() => import('./features/writing/WritingBankPage').then(module => ({ default: module.WritingBankPage })));
const WritingDeskPage = lazy(() => import('./features/writing/WritingDeskPage').then(module => ({ default: module.WritingDeskPage })));
const ReviewPage = lazy(() => import('./features/review/ReviewPage').then(module => ({ default: module.ReviewPage })));
const AssessmentDetailPage = lazy(() => import('./features/review/AssessmentDetailPage').then(module => ({ default: module.AssessmentDetailPage })));
const SpeakingBankPage = lazy(() => import('./features/speaking/SpeakingBankPage').then(module => ({ default: module.SpeakingBankPage })));
const SpeakingTopicPage = lazy(() => import('./features/speaking/SpeakingTopicPage').then(module => ({ default: module.SpeakingTopicPage })));
const StoriesPage = lazy(() => import('./features/speaking/StoriesPage').then(module => ({ default: module.StoriesPage })));
const AccountPage = lazy(() => import('./features/account/AccountPage').then(module => ({ default: module.AccountPage })));
const ProgressPage = lazy(() => import('./features/progress/ProgressPage').then((module) => ({ default: module.ProgressPage })));
const SpeakingDeskPage = lazy(() => import('./features/speaking/SpeakingDeskPage').then((module) => ({ default: module.SpeakingDeskPage })));
const VocabularyPage = lazy(() => import('./features/vocabulary/VocabularyPages').then(module => ({ default: module.VocabularyPage })));
const VocabularyWordsPage = lazy(() => import('./features/vocabulary/VocabularyPages').then(module => ({ default: module.VocabularyWordsPage })));
const VocabularyWordbooksPage = lazy(() => import('./features/vocabulary/VocabularyPages').then(module => ({ default: module.VocabularyWordbooksPage })));
const VocabularyHistoryPage = lazy(() => import('./features/vocabulary/VocabularyPages').then(module => ({ default: module.VocabularyHistoryPage })));
const VocabularyEntryPage = lazy(() => import('./features/vocabulary/VocabularyPages').then(module => ({ default: module.VocabularyEntryPage })));
const VocabularyGroupWordsPage = lazy(() => import('./features/vocabulary/VocabularyGroupWordsPage').then(module => ({ default: module.VocabularyGroupWordsPage })));
const VocabularyGroupLearnPage = lazy(() => import('./features/vocabulary/VocabularyGroupLearnPage').then(module => ({ default: module.VocabularyGroupLearnPage })));
const VocabularyReviewPage = lazy(() => import('./features/vocabulary/VocabularyPracticePage').then(module => ({ default: module.VocabularyPracticePage })));
const ExamBankPage = lazy(() => import('./features/exam/ExamBankPage').then(module => ({default:module.ExamBankPage})));
const ExamPracticePage = lazy(() => import('./features/exam/ExamPracticePage').then(module => ({default:module.ExamPracticePage})));
const ExamReviewPage = lazy(() => import('./features/exam/ExamReviewPage').then(module => ({default:module.ExamReviewPage})));
const IntensiveWorkbenchPage = lazy(() => import('./features/exam/IntensiveWorkbenchPage').then(module => ({default:module.IntensiveWorkbenchPage})));
const ExamReviewQueuePage = lazy(() => import('./features/exam/ExamReviewQueuePage').then(module => ({default:module.ExamReviewQueuePage})));

function LegacyWrongWordsRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('wrongOnly', 'true');
  params.set('dueOnly', 'false');
  params.delete('unitId');
  return <Navigate to={`/vocabulary/review?${params}`} replace />;
}

export function AppRoutes() {
  const {pathname} = useLocation();
  useEffect(() => { void preloadRoute(pathname).catch(() => {}); }, [pathname]);
  return (
    <FieldbookProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<TodayPage />} />
          {(['reading','listening'] as const).map(skill => <Route key={skill}>
            <Route path={skill} element={<ExamBankPage skill={skill}/>} />
            <Route path={`${skill}/review`} element={<ExamReviewQueuePage skill={skill}/>} />
            <Route path={`${skill}/review/:attemptId`} element={<ExamReviewPage skill={skill}/>} />
            <Route path={`${skill}/mock/:paperId`} element={<ExamPracticePage skill={skill}/>} />
            <Route path={`${skill}/:sectionId`} element={<ExamPracticePage skill={skill}/>} />
          </Route>)}
          <Route path="listening/intensive/:sectionId" element={<IntensiveWorkbenchPage/>}/>
          <Route path="write/questions" element={<WritingBankPage />} />
          <Route path="write" element={<WritingDeskPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="review/:id" element={<AssessmentDetailPage />} />
          <Route path="vocabulary" element={<VocabularyPage />} />
          <Route path="vocabulary/words" element={<VocabularyWordsPage />} />
          <Route path="vocabulary/wordbooks" element={<VocabularyWordbooksPage />} />
          <Route path="vocabulary/wordbooks/:bookId" element={<VocabularyWordbooksPage />} />
          <Route path="vocabulary/wordbooks/:bookId/groups/:unitId/words" element={<VocabularyGroupWordsPage />} />
          <Route path="vocabulary/wordbooks/:bookId/groups/:unitId/learn" element={<VocabularyGroupLearnPage />} />
          <Route path="vocabulary/history" element={<VocabularyHistoryPage />} />
          <Route path="vocabulary/history/:sessionId" element={<VocabularyReviewPage />} />
          <Route path="vocabulary/entry/:id" element={<VocabularyEntryPage />} />
          <Route path="vocabulary/review" element={<VocabularyReviewPage />} />
          <Route path="vocabulary/study" element={<VocabularyReviewPage />} />
          <Route path="vocabulary/wrong" element={<LegacyWrongWordsRedirect />} />
          <Route path="vocabulary/progress" element={<Navigate to="/progress?category=vocabulary" replace />} />
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
