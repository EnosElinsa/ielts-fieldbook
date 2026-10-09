import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthGate } from './auth/AuthGate';
import { AppRoutes } from './App';
import { ThemeProvider, applyTheme, initialTheme } from './context/ThemeContext';
import * as Tooltip from '@radix-ui/react-tooltip';
import './styles/index.css';

applyTheme(initialTheme());
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
    <Tooltip.Provider delayDuration={350}>
    <BrowserRouter>
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </BrowserRouter>
    </Tooltip.Provider>
    </ThemeProvider>
  </StrictMode>,
);
