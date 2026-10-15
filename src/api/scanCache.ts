import { idbClear, idbCount, idbGet, idbPut, STORES } from '@/lib/idb'
import { runnerKey, type ScanRow } from '@/lib/results'
import type { RunnerResult } from '@/lib/runner'

const STORE = 'townResults'
const RUNNER_STORE = 'runnerResults'
/** Results of recent races can still be corrected; only finished ones are kept. */
const FINAL_AFTER_DAYS = 14
/** Drop entries older than this, so corrections and new fields do come through eventually. */
const MAX_AGE_DAYS = 180

interface Entry {
  rows: ScanRow[]
  at: number
}

/** What one race contributed to a runner's profile. */
interface RunnerEntry {
  rows: RunnerResult[]
  /** rows the API's substring match returned for other people with a similar name */
  similar: number
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

/**
 * A runner lookup in one race. Everything that changes the answer is in the key:
 * the person (however their name was typed), the birth year and town filters, and
 * whether only exact name matches count.
 */
const runnerCacheKey = (raceId: string, q: { name: string; yob: number | null; exact: boolean; town?: string | null }) =>
  [raceId, runnerKey(q.name), q.yob ?? '', q.exact ? 'exact' : 'loose', q.town?.toLowerCase().trim() ?? ''].join('|')

export async function getCachedRunnerRows(
  raceId: string,
  q: { name: string; yob: number | null; exact: boolean; town?: string | null },
): Promise<{ rows: RunnerResult[]; similar: number } | null> {
  const hit = await idbGet<RunnerEntry>(RUNNER_STORE, runnerCacheKey(raceId, q))
  if (!hit || !Array.isArray(hit.rows)) return null
  if (Date.now() - hit.at > MAX_AGE_DAYS * 86_400_000) return null
  return { rows: hit.rows, similar: hit.similar ?? 0 }
}

export function putCachedRunnerRows(
  raceId: string,
  q: { name: string; yob: number | null; exact: boolean; town?: string | null },
  value: { rows: RunnerResult[]; similar: number },
): Promise<unknown> {
  return idbPut(RUNNER_STORE, runnerCacheKey(raceId, q), { ...value, at: Date.now() } satisfies RunnerEntry)
}

/** How many answers are stored across both scans (for the "clear" button). */
export async function cachedScanCount(): Promise<number> {
  const counts = await Promise.all(STORES.map((s) => idbCount(s)))
  return counts.reduce((n: number, c) => n + (c ?? 0), 0)
}

export async function clearScanCache(): Promise<void> {
  await Promise.all(STORES.map((s) => idbClear(s)))
}
