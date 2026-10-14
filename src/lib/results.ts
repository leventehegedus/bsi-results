import type { ResultRow } from '@/api/types'

export const MARATHON_METRES = 42195

/** A finisher row enriched with the race it came from. */
export interface ScanRow {
  raceId: string
  raceName: string
  date: string
  town: string
  name: string
  category: string
  place: number | null
  categoryPlace: string
  time: string
  club: string
  bib: string
  virtual: boolean
}

/** "02:48:18.00" → "02:48:18" */
export function cleanTime(t?: string | null): string {
  return (t ?? '').replace(/\.0+$/, '').trim()
}

/** "02:48:18" → 10098; empty/invalid → Infinity so it sorts last. */
export function timeToSeconds(t: string): number {
  const parts = t.split(':').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return Number.POSITIVE_INFINITY
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

const VIRTUAL_RE = /virtu/i

export function toScanRow(
  row: ResultRow,
  race: { id: string; name: string; date: string },
  town: string,
): ScanRow {
  return {
    raceId: race.id,
    raceName: race.name.trim(),
    date: race.date.slice(0, 10),
    town: (row.varos as string) || town,
    name: (row.nev ?? '').trim(),
    category: (row.kategoria as string) ?? '',
    place: typeof row.hely === 'number' ? row.hely : row.hely ? Number(row.hely) : null,
    categoryPlace: (row.kat_hely as string) ?? '',
    time: cleanTime((row.netto as string) || (row.brutto as string)),
    club: (row.egyesulet as string) ?? '',
    bib: (row.rajtszam as string) ?? '',
    virtual: VIRTUAL_RE.test(race.name),
  }
}

/**
 * The words of a name, as compared between runners: lowercase, no accents, any
 * hyphen, dot or other non-letter separates words ("Nagy-György" = "Nagy György"),
 * and the "dr" / "dr." title is dropped. "ifj." / "id." stay: they are different people.
 */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w && w !== 'dr')
}

/**
 * Normalised runner identity (see nameWords), also ignoring word order
 * ("Surname, First"): "Nagy-György Péter dr." = "nagy gyorgy peter".
 */
export function runnerKey(name: string): string {
  return nameWords(name).sort().join(' ')
}

/** Free-text name search: every word of the query appears in the name, in any order. */
export function nameMatches(name: string, query: string): boolean {
  const q = nameWords(query)
  if (!q.length) return false
  const n = nameWords(name).join(' ')
  return q.every((w) => n.includes(w))
}

/**
 * What to send to the API's name filter. It's a substring match that treats
 * hyphens, spaces and "dr" literally, so a whole name would miss its other
 * spellings; the longest single word finds them all (a superset that
 * nameMatches / runnerKey then narrow down).
 */
export function apiNameTerm(query: string): string {
  const words = nameWords(query)
  const longest = words.reduce((a, w) => (w.length > a.length ? w : a), '')
  return longest.length >= 3 ? longest : words.join(' ') || query.trim()
}

/**
 * The same run often appears in several lists of one event (main race + amateur
 * cup, profession championships, …). Collapse rows with the same date, runner and
 * time, keeping the one with the highest overall place (that's the main list).
 */
export function mergeSubLists(rows: ScanRow[]): ScanRow[] {
  const byKey = new Map<string, ScanRow>()
  for (const r of rows) {
    const key = `${r.date}|${runnerKey(r.name)}|${r.time}`
    const cur = byKey.get(key)
    if (!cur || (r.place ?? 0) > (cur.place ?? 0)) byKey.set(key, r)
  }
  return [...byKey.values()]
}

export interface RunnerBest extends ScanRow {
  finishes: number
}

/** One row per runner: their fastest time plus the number of finishes. */
export function bestPerRunner(rows: ScanRow[]): RunnerBest[] {
  const groups = new Map<string, ScanRow[]>()
  for (const r of rows) {
    const k = runnerKey(r.name)
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups.values()]
    .map((g) => {
      const best = [...g].sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time))[0]
      return { ...best, finishes: g.length }
    })
    .sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time))
}

export function sortByDateDesc(rows: ScanRow[]): ScanRow[] {
  return [...rows].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.town.localeCompare(b.town, 'hu') ||
      (a.place ?? Infinity) - (b.place ?? Infinity),
  )
}
