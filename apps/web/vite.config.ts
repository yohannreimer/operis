import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), '');
  const isDemo = env.VITE_DEMO_MODE === 'true';

  return {
    plugins: [react()],
    envDir: '../../',
    server: {
      port: 5173
    },
    resolve: isDemo ? {
      alias: {
        '@clerk/clerk-react': path.resolve(__dirname, 'src/demo/mock-clerk.tsx'),
      }
    } : {},
    optimizeDeps: {
      include: ['@excalidraw/excalidraw']
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
