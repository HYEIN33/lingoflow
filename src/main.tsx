import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { initSentry } from './sentry';
import App, { ErrorBoundary } from './App.tsx';
import './index.css';

initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
