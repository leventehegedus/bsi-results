/**
 * Run `worker` over `items` with at most `concurrency` in flight.
 * Rejects as soon as the signal is aborted.
 */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const i = next++
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(lanes)
  return results
}
