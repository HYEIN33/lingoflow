import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Toaster } from 'sonner';
import { initSentry } from './sentry';
import App, { ErrorBoundary } from './App.tsx';
import './index.css';

initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster
        position="top-center"
        richColors
        closeButton
        duration={4000}
      />
    </ErrorBoundary>
  </StrictMode>,
);
