import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const port = Number.parseInt(env.VITE_PORT || '5173', 10);
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:4000';
  const wsTarget = env.VITE_WS_TARGET || 'ws://localhost:4000';

  const sslKeyPath = env.VITE_SSL_KEY;
  const sslCertPath = env.VITE_SSL_CERT;

  const httpsConfig =
    sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)
      ? {
          key: fs.readFileSync(sslKeyPath),
          cert: fs.readFileSync(sslCertPath),
        }
      : undefined;

  return {
    plugins: [tanstackRouter(), react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@ghostcast/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      host: '0.0.0.0',
      port,
      https: httpsConfig,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
        },
      },
    },
  };
});
