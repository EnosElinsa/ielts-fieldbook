import { PageLoadingState } from './components/AsyncState';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthGate } from './auth/AuthGate';
import { ThemeProvider, applyTheme, initialTheme } from './context/ThemeContext';
import './styles/index.css';
import { startPerformanceTelemetry } from './lib/performanceTelemetry';
import { StandaloneErrorBoundary } from './components/StandaloneErrorBoundary';
import { installPageLoadRecovery } from './lib/pageLoadRecovery';
import { startDiagnostics } from './lib/diagnostics';

const AppRoutes = lazy(() => import('./App').then(module => ({ default: module.AppRoutes })));

applyTheme(initialTheme());
installPageLoadRecovery();
startPerformanceTelemetry();
startDiagnostics();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
    <BrowserRouter>
      <StandaloneErrorBoundary standalone>
      <AuthGate>
        <Suspense fallback={<main className="workspace-loading"><PageLoadingState variant="workbench" message="Opening your workspace…" /></main>}>
          <AppRoutes />
        </Suspense>
      </AuthGate>
      </StandaloneErrorBoundary>
    </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
