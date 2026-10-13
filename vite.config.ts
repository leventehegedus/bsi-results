import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// results.futanet.hu sends no CORS headers, so the browser must never call it
// directly. In dev the Vite server proxies /api/futanet/* to it; in production
// vercel.json does the same with a rewrite.
const FUTANET_API = 'https://results.futanet.hu'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: {
      '/api/futanet': {
        target: FUTANET_API,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/futanet/, '/api'),
      },
    },
  },
})
