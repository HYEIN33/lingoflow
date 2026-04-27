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
      {/* Sonner toaster — themed to MemeFlow's white-blue liquid-glass
          ambient (PR #7 — 2026-04-27). All variants (default / success /
          info / warning / error) share the glass shell defined in
          `.toast-glass-base` (see index.css). richColors removed — we
          paint the accent ourselves via per-variant classes so error
          stays red and warning stays amber, but in muted glass tones
          instead of the saturated solid fills sonner ships by default. */}
      <Toaster
        position="top-center"
        closeButton
        duration={4000}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast: 'toast-glass-base',
            success: 'toast-glass-success',
            info: 'toast-glass-info',
            warning: 'toast-glass-warning',
            error: 'toast-glass-error',
            title: 'toast-glass-title',
            description: 'toast-glass-description',
            actionButton: 'toast-glass-action',
            cancelButton: 'toast-glass-cancel',
            closeButton: 'toast-glass-close',
          },
        }}
      />
    </ErrorBoundary>
  </StrictMode>,
);
