import axios from 'axios'

/**
 * All requests go through our own origin (`/api/futanet`), which is proxied to
 * https://results.futanet.hu/api by Vite (dev) and Vercel rewrites (prod),
 * because the upstream API does not send CORS headers.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? '/api/futanet',
  headers: { Accept: 'application/json' },
  timeout: 30_000,
})
