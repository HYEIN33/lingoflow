import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(mode === 'development' ? (env.GEMINI_API_KEY || '') : ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            'firebase-auth': ['firebase/auth'],
            'firebase-firestore': ['firebase/firestore'],
            'firebase-storage': ['firebase/storage'],
            'firebase-analytics': ['firebase/analytics'],
            'firebase-app': ['firebase/app'],
            'vendor-react': ['react', 'react-dom'],
            'vendor-motion': ['motion', 'motion/react'],
            'vendor-markdown': ['react-markdown'],
            'vendor-sentry': ['@sentry/react'],
            'vendor-genai': ['@google/genai'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': 'http://localhost:3100',
      },
    },
  };
});
