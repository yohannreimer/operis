import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const STRUCTURAL_HOOK_MODULES = [
  '/src/features/today/use-today-workspace.ts'
];

export function forceFullReloadForStructuralHookChanges(): Plugin {
  return {
    name: 'force-full-reload-for-structural-hook-changes',
    handleHotUpdate({ file, modules, server, timestamp }) {
      const normalizedFile = file.replaceAll('\\', '/');
      if (!STRUCTURAL_HOOK_MODULES.some((modulePath) => normalizedFile.endsWith(modulePath))) {
        return undefined;
      }

      const invalidatedModules = new Set();
      for (const module of modules) {
        server.moduleGraph.invalidateModule(module, invalidatedModules, timestamp, true);
      }
      server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), '');
  const isDemo = env.VITE_DEMO_MODE === 'true';

  return {
    plugins: [forceFullReloadForStructuralHookChanges(), react()],
    envDir: '../../',
    server: {
      port: 5173
    },
    resolve: {
      alias: {
        '@excalidraw/excalidraw': path.resolve(
          __dirname,
          'node_modules/@excalidraw/excalidraw/dist/excalidraw.production.min.js'
        ),
        ...(isDemo ? { '@clerk/react': path.resolve(__dirname, 'src/demo/mock-clerk.tsx') } : {})
      }
    },
    optimizeDeps: {
      include: ['@excalidraw/excalidraw']
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
