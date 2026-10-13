import { timeToSeconds, type ScanRow } from './results'

export interface RunnerResult extends ScanRow {
  /** race distance in metres, null if unknown */
  distance: number | null
}

const NAMED: Record<number, string> = {
  42195: 'Marathon',
  21097: 'Half marathon',
  21100: 'Half marathon',
  10000: '10 km',
  5000: '5 km',
}

export function distanceLabel(m: number | null): string {
  if (!m) return 'Unknown distance'
  if (NAMED[m]) return NAMED[m]
  const km = m / 1000
  return `${km.toLocaleString('hu-HU', { maximumFractionDigits: 3 })} km`
}

/** Group key so 21 097 m and 21 100 m half marathons count as one distance. */
function distanceKey(m: number | null): string {
  if (!m) return 'unknown'
  return NAMED[m] ?? String(m)
}

export interface PersonalBest {
  label: string
  distance: number | null
  best: RunnerResult
  count: number
}

/** Fastest real (non-virtual) result per distance, longest distance first. */
export function personalBests(rows: RunnerResult[]): PersonalBest[] {
  const groups = new Map<string, RunnerResult[]>()
  for (const r of rows) {
    if (r.virtual || !r.time) continue
    const k = distanceKey(r.distance)
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups.values()]
    .map((g) => {
      const best = [...g].sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time))[0]
      return { label: distanceLabel(best.distance), distance: best.distance, best, count: g.length }
    })
    .sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0))
}

/** Most frequent non-empty values, e.g. towns or clubs a runner registered with. */
export function topValues(values: string[], limit = 3): string[] {
  const counts = new Map<string, number>()
  for (const v of values.map((s) => s.trim()).filter(Boolean)) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v)
}
