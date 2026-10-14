import { cleanTime, timeToSeconds } from './results'
import type { ResultRow } from '@/api/types'

/** One finisher, reduced to what the breakdown needs. */
export interface BreakdownRow {
  /** net time (gun time if there's no net time), in seconds */
  seconds: number
  category: string
  /** the API's codes: F = férfi (men), N = nő (women); null when the race has no gender data */
  sex: 'F' | 'N' | null
}

export const PERCENTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const

export interface Cutoff {
  /** "top N %" */
  percent: number
  /** the place you needed to be in this group to make it */
  rank: number
  seconds: number
}

export interface GroupStats {
  count: number
  fastest: number
  median: number
  slowest: number
  /** one per PERCENTS entry; empty when the group has no finishers */
  cutoffs: Cutoff[]
}

export function toBreakdownRow(r: ResultRow, sex: 'F' | 'N' | null): BreakdownRow | null {
  const seconds = timeToSeconds(cleanTime(r.netto) || cleanTime(r.brutto))
  if (!Number.isFinite(seconds) || seconds <= 0) return null // no time (DNF, DSQ…)
  return { seconds, category: (r.kategoria ?? '').trim(), sex }
}

/**
 * Time needed to be in the top N % of a group: the time of the finisher at
 * place ceil(N % of the group) when sorted by time. 100 % is the slowest finisher.
 */
export function groupStats(rows: BreakdownRow[]): GroupStats {
  const times = rows.map((r) => r.seconds).sort((a, b) => a - b)
  const n = times.length
  if (!n) return { count: 0, fastest: 0, median: 0, slowest: 0, cutoffs: [] }
  const at = (rank: number) => times[Math.min(n, Math.max(1, rank)) - 1]
  return {
    count: n,
    fastest: times[0],
    median: n % 2 ? times[(n - 1) / 2] : Math.round((times[n / 2 - 1] + times[n / 2]) / 2),
    slowest: times[n - 1],
    cutoffs: PERCENTS.map((percent) => {
      const rank = Math.ceil((percent / 100) * n)
      return { percent, rank, seconds: at(rank) }
    }),
  }
}

/** Age categories in a natural order ("M9" before "M10"), each with its stats. */
export function categoryStats(rows: BreakdownRow[]): { category: string; stats: GroupStats }[] {
  const byCat = new Map<string, BreakdownRow[]>()
  for (const r of rows) {
    if (!r.category) continue
    byCat.set(r.category, [...(byCat.get(r.category) ?? []), r])
  }
  return [...byCat]
    .sort(([a], [b]) => a.localeCompare(b, 'hu', { numeric: true }))
    .map(([category, list]) => ({ category, stats: groupStats(list) }))
}

/** 3725 → "1:02:05", 1263 → "21:03". */
export function formatSeconds(total: number): string {
  const s = Math.round(total)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
