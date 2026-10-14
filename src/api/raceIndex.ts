import { LEGACY_RACES } from './legacyRaces'
import { getRaceCached } from './runner'
import type { RaceListItem } from './types'
import { runPool } from '@/lib/pool'

/** What we need to know about a race to decide whether to scan it. */
export interface RaceFacts {
  /** distance in metres (0 = unknown) */
  tav: number
  /** the result list is empty ("ures") */
  empty: boolean
}

const STORAGE_KEY = 'bsi:raceFacts:v1'
/** Results of recent races can still change; only cache races older than this. */
const FINAL_AFTER_DAYS = 14

type Stored = Record<string, [number, 0 | 1]>

function load(): Stored {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Stored
  } catch {
    return {}
  }
}

function save(data: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage full or blocked: the index just won't persist
  }
}

const legacyTav = new Map(LEGACY_RACES.map((r) => [r.id, r.tav]))

/**
 * Distance + empty flag for every race. Legacy races come from the static list;
 * the rest are read from /race/{id} once and cached in localStorage, so only the
 * first scan pays for ~2 300 metadata requests.
 */
export async function getRaceFacts(
  races: RaceListItem[],
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<Map<string, RaceFacts>> {
  const stored = load()
  const facts = new Map<string, RaceFacts>()
  const missing: RaceListItem[] = []
  for (const r of races) {
    if (legacyTav.has(r.id)) facts.set(r.id, { tav: legacyTav.get(r.id)!, empty: false })
    else if (stored[r.id]) facts.set(r.id, { tav: stored[r.id][0], empty: stored[r.id][1] === 1 })
    else missing.push(r)
  }

  const cutoff = Date.now() - FINAL_AFTER_DAYS * 86_400_000
  let done = 0
  onProgress?.(0, missing.length)
  try {
    await runPool(
    missing,
    12,
    async (r) => {
      const meta = await getRaceCached(r.id, { signal })
      const f: RaceFacts = { tav: meta?.tav ?? 0, empty: meta?.statusz === 'ures' }
      facts.set(r.id, f)
      if (meta && Date.parse(r.date) < cutoff) stored[r.id] = [f.tav, f.empty ? 1 : 0]
      done++
      if (done % 25 === 0 || done === missing.length) onProgress?.(done, missing.length)
    },
    signal,
    )
  } finally {
    // keep what we learned even if the scan was stopped half-way
    if (missing.length) save(stored)
  }
  return facts
}
