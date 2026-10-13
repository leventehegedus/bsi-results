import { getRace, getRaceList, getResultPage } from './futanet'
import { LEGACY_BUDAPEST_MARATHON_CODES } from './legacyRaces'
import type { RaceListItem, RaceMeta, ResultFilters } from './types'
import { runPool } from '@/lib/pool'

type Opts = { signal?: AbortSignal }

const MIN_YEAR = 1900
const MAX_YEAR = new Date().getFullYear()

/**
 * Result rows don't include the birth year, but the resultList endpoint can
 * filter by it (minYob/maxYob). Pin one row (name + place, or name + bib) and
 * binary-search the year range: ~8 requests. Returns null when the row can't
 * be pinned or the race has no birth-year data.
 */
export async function findBirthYear(
  raceId: string,
  name: string,
  pin: { place?: number | null; bib?: string | null },
  { signal }: Opts = {},
): Promise<number | null> {
  const base: ResultFilters = { name }
  if (pin.place != null) {
    base.minPlace = String(pin.place)
    base.maxPlace = String(pin.place)
  } else if (pin.bib) {
    base.bib = pin.bib
  } else {
    return null
  }
  const hits = async (lo: number, hi: number) =>
    (await getResultPage(raceId, 1, { ...base, minYob: String(lo), maxYob: String(hi) }, { signal })).meta
      .total > 0

  let lo = MIN_YEAR
  let hi = MAX_YEAR
  if (!(await hits(lo, hi))) return null
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (await hits(lo, mid)) hi = mid
    else lo = mid + 1
  }
  return lo
}

const metaCache = new Map<string, RaceMeta | null>()

/** Race metadata with an in-memory cache (distance, name, date rarely change). */
export async function getRaceCached(code: string, opts: Opts = {}): Promise<RaceMeta | null> {
  if (metaCache.has(code)) return metaCache.get(code)!
  const meta = await getRace(code, opts).catch(() => null)
  metaCache.set(code, meta)
  return meta
}

let catalogue: Promise<RaceListItem[]> | null = null

/**
 * Every race we know about: /raceList plus the older Budapest Marathon editions
 * that exist in the API but aren't listed. Cached for the session.
 */
export function getRaceCatalogue({ signal }: Opts = {}): Promise<RaceListItem[]> {
  catalogue ??= (async () => {
    const list = await getRaceList({ signal })
    const have = new Set(list.map((r) => r.id))
    const missing = LEGACY_BUDAPEST_MARATHON_CODES.filter((c) => !have.has(c))
    const metas = await runPool(missing, 6, (c) => getRaceCached(c, { signal }))
    metas.forEach((m, i) => {
      if (m) {
        list.push({
          id: missing[i],
          name: m.nev.replace(/^[\d. ]+-\s*/, '').trim(),
          date: m.datum.slice(0, 10),
        })
      }
    })
    return list
  })().catch((e) => {
    catalogue = null
    throw e
  })
  return catalogue
}
