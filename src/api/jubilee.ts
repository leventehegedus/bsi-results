import { getAllResults } from './futanet'
import type { RaceListItem, ResultRow } from './types'
import { runnerKey } from '@/lib/results'
import { runPool } from '@/lib/pool'
import { withRetry } from '@/lib/retry'

/** One member of the club, as the BSI spreadsheets list them. */
export interface JubileeRunner {
  /** name */
  n: string
  /** birth year */
  y: number | null
  /** club */
  c: string
  /** town */
  t: string
  /** permanent bib number, which club members keep from year to year */
  b: string
  /** the last marathon this record accounts for; later ones are read from the API */
  u: number
  /** finishing time by year: { "2015": "03:42:11" } */
  r: Record<string, string>
}

/** One page of the club: everyone whose finish count falls in this band. */
export interface BandInfo {
  id: string
  from: number
  /** null on the open-ended top band */
  to: number | null
  runners: number
  bytes: number
}

export interface JubileeIndex {
  source: string
  race: string
  years: number[]
  bands: BandInfo[]
}

/** Runners below the entry bar: a marathon the sheets don't cover can still lift them in. */
export const PENDING_BAND = 'pending'

/**
 * The club's lists, built from the spreadsheets by scripts/jfk_from_xlsx.py and
 * split per band so a visitor only downloads the page they're looking at.
 */
export async function loadJubileeIndex(signal?: AbortSignal): Promise<JubileeIndex> {
  const res = await fetch(`${import.meta.env.BASE_URL}jfk/index.json`, { signal })
  if (!res.ok) throw new Error(`jfk/index.json: ${res.status}`)
  return (await res.json()) as JubileeIndex
}

export async function loadJubileeBand(band: string, signal?: AbortSignal): Promise<JubileeRunner[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}jfk/${encodeURIComponent(band)}.json`, { signal })
  if (!res.ok) throw new Error(`jfk/${band}.json: ${res.status}`)
  const data = (await res.json()) as { runners: JubileeRunner[] }
  return data.runners
}

/** Budapest Marathon editions, newest first; the main list of each year only. */
export function marathonEditions(races: RaceListItem[]): { year: number; race: RaceListItem }[] {
  const byYear = new Map<number, RaceListItem>()
  for (const race of races) {
    if (!/budapest.*maraton|maraton.*budapest/i.test(race.name)) continue
    // the championship, pair, relay and wheelchair lists repeat the same people
    if (/bajnoks|HB és WC|páros|parban|stafét|váltó|trió|fut a |csapat|mini|családi|virtuális/i.test(race.name)) continue
    const year = Number(race.date.slice(0, 4))
    if (!Number.isInteger(year)) continue
    const seen = byYear.get(year)
    // the plain edition has the shortest name of its year ("41. SPAR Budapest Maraton®")
    if (!seen || race.name.length < seen.name.length) byYear.set(year, race)
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, race]) => ({ year, race }))
}

export interface YearResult {
  year: number
  /** finishing time by runner index in the dataset */
  times: Map<number, string>
  /** finishers the club's list couldn't be matched to, and matches that stayed ambiguous */
  unmatched: number
  ambiguous: number
}

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * Index the club's members for matching against a result list. The permanent bib
 * is the strongest key — members keep theirs — then the name, narrowed by town or
 * club when several members share one.
 */
function index(runners: JubileeRunner[]) {
  const byBib = new Map<string, number>()
  const byName = new Map<string, number[]>()
  runners.forEach((r, i) => {
    if (r.b) byBib.set(r.b.trim(), i)
    const key = runnerKey(r.n)
    byName.set(key, [...(byName.get(key) ?? []), i])
  })
  return { byBib, byName }
}

/**
 * Read one marathon and work out which club member each finisher is. Only rows
 * that can be pinned to exactly one member are used: a wrong match would invent
 * a finish for someone.
 */
export async function readEdition(
  edition: { year: number; race: RaceListItem },
  runners: JubileeRunner[],
  opts: { signal?: AbortSignal } = {},
): Promise<YearResult> {
  const rows = await withRetry(() => getAllResults(edition.race.id, {}, opts), { signal: opts.signal })
  const { byBib, byName } = index(runners)
  const times = new Map<number, string>()
  let unmatched = 0
  let ambiguous = 0

  for (const row of rows) {
    const time = finishTime(row)
    if (!time) continue
    const bib = (row.rajtszam ?? '').trim()
    let hit = bib ? byBib.get(bib) : undefined
    if (hit === undefined) {
      const candidates = byName.get(runnerKey(row.nev ?? '')) ?? []
      if (candidates.length === 1) hit = candidates[0]
      else if (candidates.length > 1) {
        const town = fold(String(row.varos ?? ''))
        const club = fold(String(row.egyesulet ?? ''))
        const narrowed = candidates.filter(
          (i) => (town && fold(runners[i].t) === town) || (club && fold(runners[i].c) === club),
        )
        if (narrowed.length === 1) hit = narrowed[0]
        else {
          ambiguous++
          continue
        }
      }
    }
    if (hit === undefined) {
      unmatched++
      continue
    }
    times.set(hit, time)
  }
  return { year: edition.year, times, unmatched, ambiguous }
}

/** Read every edition the spreadsheets don't already cover, a couple at a time. */
export function readEditions(
  editions: { year: number; race: RaceListItem }[],
  runners: JubileeRunner[],
  opts: { signal?: AbortSignal; onDone?: (year: number) => void } = {},
): Promise<YearResult[]> {
  return runPool(
    editions,
    2,
    async (edition) => {
      const result = await readEdition(edition, runners, { signal: opts.signal })
      opts.onDone?.(edition.year)
      return result
    },
    opts.signal,
  )
}

function finishTime(row: ResultRow): string | null {
  const raw = (row.netto as string) || (row.brutto as string) || ''
  const m = /^(\d{1,2}:\d{2}:\d{2})/.exec(raw.trim())
  return m ? m[1] : null
}
