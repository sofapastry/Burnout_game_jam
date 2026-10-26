import { defineConfig } from 'vite';

// base './' so the build runs from any itch.io subfolder
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
