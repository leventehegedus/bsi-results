import { idbClear, idbCount, idbGet, idbPut } from '@/lib/idb'
import type { ScanRow } from '@/lib/results'

const STORE = 'townResults'
/** Results of recent races can still be corrected; only finished ones are kept. */
const FINAL_AFTER_DAYS = 14
/** Drop entries older than this, so corrections and new fields do come through eventually. */
const MAX_AGE_DAYS = 180

interface Entry {
  rows: ScanRow[]
  at: number
}

/** One cached answer: everybody from `town` in `raceId`. */
const key = (raceId: string, town: string) =>
  `${raceId}|${town.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()}`

export function isFinal(raceDate: string): boolean {
  const t = Date.parse(raceDate)
  return Number.isFinite(t) && t < Date.now() - FINAL_AFTER_DAYS * 86_400_000
}

export async function getCachedTownRows(raceId: string, town: string): Promise<ScanRow[] | null> {
  const hit = await idbGet<Entry>(STORE, key(raceId, town))
  if (!hit || !Array.isArray(hit.rows)) return null
  if (Date.now() - hit.at > MAX_AGE_DAYS * 86_400_000) return null
  return hit.rows
}

export function putCachedTownRows(raceId: string, town: string, rows: ScanRow[]): Promise<unknown> {
  return idbPut(STORE, key(raceId, town), { rows, at: Date.now() } satisfies Entry)
}

/** How many race + town answers are stored (for the "clear" button). */
export const cachedScanCount = () => idbCount(STORE).then((n) => n ?? 0)
export const clearScanCache = () => idbClear(STORE)
