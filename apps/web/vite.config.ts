import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same-origin /api in development so the refresh cookie (SameSite=Strict, Path=/api/auth) works.
    proxy: { '/api': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000' } },
  },
});
