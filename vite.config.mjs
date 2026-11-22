// Web app build. The source is in client/, the build goes to dist/ (served by Vercel).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const tailwindConfig = createRequire(import.meta.url)('./tailwind.config.cjs');

export default defineConfig({
  root: here('./client'),
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: { outDir: here('./dist'), emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
