import { getAllResults, getRace, getRaceList, getResultPage } from './futanet'
import { LEGACY_RACES } from './legacyRaces'
import type { RaceListItem, RaceMeta, ResultFilters, ResultRow } from './types'

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

/** Identifies a row within one race list. */
export const rowKey = (r: ResultRow) => `${r.hely ?? ''}|${r.nev ?? ''}|${r.rajtszam ?? ''}`

/**
 * Birth year for every row matching `filters` in one race, by recursively
 * halving the year range and counting matches (~7 requests per distinct birth
 * year). Rows the API has no birth year for stay absent from the map.
 */
export async function annotateBirthYears(
  raceId: string,
  filters: ResultFilters,
  { signal }: Opts = {},
): Promise<Map<string, number>> {
  const years = new Map<string, number>()
  const count = async (lo: number, hi: number) =>
    (await getResultPage(raceId, 1, { ...filters, minYob: String(lo), maxYob: String(hi) }, { signal })).meta
      .total

  const walk = async (lo: number, hi: number, n: number): Promise<void> => {
    if (lo === hi) {
      const rows = await getAllResults(raceId, { ...filters, minYob: String(lo), maxYob: String(lo) }, { signal })
      for (const r of rows) years.set(rowKey(r), lo)
      return
    }
    const mid = Math.floor((lo + hi) / 2)
    const left = await count(lo, mid)
    if (left > 0) await walk(lo, mid, left)
    if (n - left > 0) await walk(mid + 1, hi, n - left)
  }

  const total = await count(MIN_YEAR, MAX_YEAR)
  if (total > 0) await walk(MIN_YEAR, MAX_YEAR, total)
  return years
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
 * Every race we know about: /raceList plus the older races that exist in the API
 * but aren't listed (see legacyRaces.ts). Cached for the session.
 */
export function getRaceCatalogue({ signal }: Opts = {}): Promise<RaceListItem[]> {
  catalogue ??= (async () => {
    const list = await getRaceList({ signal })
    const have = new Set(list.map((r) => r.id))
    for (const r of LEGACY_RACES) {
      if (!have.has(r.id)) list.push({ id: r.id, name: r.name, date: r.date })
    }
    return list.sort((a, b) => b.date.localeCompare(a.date))
  })().catch((e) => {
    catalogue = null
    throw e
  })
  return catalogue
}
