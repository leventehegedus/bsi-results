/**
 * Run `worker` over `items` with at most `concurrency` in flight.
 * Rejects as soon as the signal is aborted or a worker throws; the other lanes
 * then stop picking up new items instead of running on unseen.
 */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let failed = false
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length && !failed) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const i = next++
      try {
        results[i] = await worker(items[i], i)
      } catch (e) {
        failed = true
        throw e
      }
    }
  })
  await Promise.all(lanes)
  return results
}
