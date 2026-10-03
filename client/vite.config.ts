import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', sourcemap: false },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
});
