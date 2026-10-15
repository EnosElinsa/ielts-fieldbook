import { PageLoadingState } from './components/AsyncState';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthGate } from './auth/AuthGate';
import { ThemeProvider, applyTheme, initialTheme } from './context/ThemeContext';
import * as Tooltip from '@radix-ui/react-tooltip';
import './styles/index.css';
import { startPerformanceTelemetry } from './lib/performanceTelemetry';
import { PageErrorBoundary } from './components/PageErrorBoundary';

const AppRoutes = lazy(() => import('./App').then(module => ({ default: module.AppRoutes })));

applyTheme(initialTheme());
startPerformanceTelemetry();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
    <Tooltip.Provider delayDuration={350}>
    <BrowserRouter>
      <PageErrorBoundary standalone>
      <AuthGate>
        <Suspense fallback={<main className="workspace-loading"><PageLoadingState variant="workbench" message="Opening your workspace…" /></main>}>
          <AppRoutes />
        </Suspense>
      </AuthGate>
      </PageErrorBoundary>
    </BrowserRouter>
    </Tooltip.Provider>
    </ThemeProvider>
  </StrictMode>,
);
