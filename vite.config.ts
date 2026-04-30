import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // VITE_DEPLOYMENT_REGION 由 src/config/environment.ts 读取，决定走海外
  // 还是国内栈。默认 global，避免 CI 误打包成国内版。
  // 显式构建国内版：VITE_DEPLOYMENT_REGION=cn npm run build
  const region = env.VITE_DEPLOYMENT_REGION === 'cn' ? 'cn' : 'global';
  // eslint-disable-next-line no-console
  console.log(`[vite] Building for region: ${region}`);
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(mode === 'development' ? (env.GEMINI_API_KEY || '') : ''),
      // 编译时把 region 注入，environment.ts 通过 import.meta.env 读取
      'import.meta.env.VITE_DEPLOYMENT_REGION': JSON.stringify(region),
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
