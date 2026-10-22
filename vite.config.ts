import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import statusHandler from './api/opening/status.ts'
import setupHandler from './api/opening/setup.ts'
import verifyHandler from './api/opening/verify.ts'
import checkTokenHandler from './api/opening/check-token.ts'
import changeHandler from './api/opening/change.ts'

function openingApiPlugin() {
  return {
    name: 'opening-api-dev-server',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url || '';
        const cleanUrl = url.split('?')[0];
        if (!cleanUrl.startsWith('/api/opening/')) {
          return next();
        }

        const endpoint = cleanUrl.replace('/api/opening/', '');
        try {
          if (endpoint === 'status') {
            await statusHandler(req, res);
          } else if (endpoint === 'setup') {
            await setupHandler(req, res);
          } else if (endpoint === 'verify') {
            await verifyHandler(req, res);
          } else if (endpoint === 'check-token') {
            await checkTokenHandler(req, res);
          } else if (endpoint === 'change') {
            await changeHandler(req, res);
          } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify({ error: 'Endpoint not found' }));
          }
        } catch (err: any) {
          console.error('[Opening API Dev Server Error]', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), openingApiPlugin()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules/recharts')) return 'charts';
          if (id.includes('node_modules/jspdf')) return 'pdf';
          if (id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'vendor';
        },
      },
    },
  },
})
