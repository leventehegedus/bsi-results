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
 * Normalised runner identity: case/diacritic-insensitive, ignores "dr" titles
 * and "Surname, First" ordering, but keeps "ifj."/"id." (they are different people).
 */
export function runnerKey(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bdr\b\.?/g, ' ')
    .replace(/[^a-z\s.]/g, ' ')
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return base.sort().join(' ')
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
