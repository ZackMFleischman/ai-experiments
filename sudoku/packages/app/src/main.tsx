// modeled on lex/packages/app/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProviders, AppRoutes } from './App';
import { BrandErrorBoundary } from '@parlor/brand';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <BrandErrorBoundary reassurance="Your puzzle is saved — reloading picks up where you left off.">
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProviders>
          <AppRoutes />
        </AppProviders>
      </BrowserRouter>
    </BrandErrorBoundary>
  </StrictMode>,
);
