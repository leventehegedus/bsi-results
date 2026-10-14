import { isAxiosError } from 'axios'

/** Server hiccups worth another try: no response, 5xx (e.g. Cloudflare 525) or 429. */
function isTransient(e: unknown) {
  if (!isAxiosError(e) || e.code === 'ERR_CANCELED') return false
  const status = e.response?.status
  return status === undefined || status >= 500 || status === 429
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

/** Run `fn`, retrying transient failures after each of `delays` (ms). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { signal, delays = [1000, 3000] }: { signal?: AbortSignal; delays?: number[] } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (signal?.aborted || attempt >= delays.length || !isTransient(e)) throw e
      await wait(delays[attempt], signal)
    }
  }
}
