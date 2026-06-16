import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Toaster } from 'sonner';
import { MotionConfig } from 'motion/react';
import { initSentry } from './sentry';
import App, { ErrorBoundary } from './App.tsx';
import './index.css';

initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* reducedMotion="user"：用户系统开了"减少动态效果"时，全站 motion
          动画自动降级（保留透明度淡入、去掉位移/缩放）。无障碍及格线。
          GSAP 不归它管 —— GSAP 调用处用 prefersReducedMotion() 手动守卫。 */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
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
