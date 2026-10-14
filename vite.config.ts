import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// results.futanet.hu sends no CORS headers, so the browser must never call it
// directly. In dev the Vite server proxies /api/futanet/* to it; in production
// vercel.json does the same with a rewrite.
const FUTANET_API = 'https://results.futanet.hu'
// Weather (Open-Meteo) goes through the same-origin proxy too, so it works the
// same in dev and on Vercel (see vercel.json) whatever the upstream CORS policy.
const OPEN_METEO = {
  '/api/weather/archive': 'https://archive-api.open-meteo.com',
  '/api/weather/forecast': 'https://api.open-meteo.com',
  '/api/geocode': 'https://geocoding-api.open-meteo.com',
}

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
      ...Object.fromEntries(
        Object.entries(OPEN_METEO).map(([prefix, target]) => [
          prefix,
          { target, changeOrigin: true, rewrite: (p: string) => p.replace(prefix, '/v1') },
        ]),
      ),
    },
  },
})
