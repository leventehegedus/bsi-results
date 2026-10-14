import type { FieldDef, ResultRow } from '@/api/types'
import { cleanTime, timeToSeconds } from './results'

/** Metres of the half-marathon split some races label "félmaraton". */
const HALF_MARATHON_METRES = 21097.5

/** One intermediate timing point of a race, as the API's field list describes it. */
export interface SplitPoint {
  /** the row key: "reszido_12" */
  key: string
  label: string
  /** distance from the start, in metres; null when the label doesn't say */
  metres: number | null
}

/**
 * The timing points of a race, in order. The API numbers them arbitrarily
 * ("reszido_12"), so the distance comes from the column header: "5 km",
 * "8.9 km", "Féltáv" (half of this race) or "félmaraton" (21.0975 km).
 */
export function splitPoints(fields: FieldDef[], raceMetres: number | null | undefined): SplitPoint[] {
  const points: SplitPoint[] = []
  for (const f of fields) {
    if (!/^reszido_/.test(f.mezo) || f.hide) continue
    const label = (f.header_hu || f.header_en || f.mezo).trim()
    points.push({ key: f.mezo, label, metres: splitMetres(label, raceMetres) })
  }
  return points.sort((a, b) => (a.metres ?? Infinity) - (b.metres ?? Infinity))
}

function splitMetres(label: string, raceMetres: number | null | undefined): number | null {
  const l = label.toLowerCase()
  if (/f[ée]lmaraton|half marathon/.test(l)) return HALF_MARATHON_METRES
  if (/f[ée]lt[áa]v|^half$/.test(l)) return raceMetres && raceMetres > 0 ? raceMetres / 2 : null
  const km = /(\d+([.,]\d+)?)\s*km/.exec(l)
  if (km) return Math.round(Number(km[1].replace(',', '.')) * 1000)
  const m = /(\d+)\s*m\b/.exec(l)
  if (m) return Number(m[1])
  return null
}

export interface Segment {
  from: number
  to: number
  seconds: number
  /** seconds per km over this segment */
  pace: number
}

/** One finisher's race, cut into segments by the timing points. */
export interface RunnerSplits {
  segments: Segment[]
  /** overall pace, seconds per km */
  pace: number
  finish: number
  /**
   * How much slower the last segment was than the first, as a share of the first
   * segment's pace: 0.08 = eight per cent slower (a positive split), −0.02 = two
   * per cent faster (a negative split). null when the race has only a finish time.
   */
  fade: number | null
}

/**
 * Cut one row into segments. Cumulative split times become durations, and each
 * duration becomes a pace using the distance between two timing points, so
 * segments of different length can be compared.
 */
export function runnerSplits(
  row: ResultRow,
  points: SplitPoint[],
  raceMetres: number | null | undefined,
): RunnerSplits | null {
  const finish = timeToSeconds(cleanTime(row.netto) || cleanTime(row.brutto))
  if (!Number.isFinite(finish) || finish <= 0 || !raceMetres || raceMetres <= 0) return null

  const marks: { metres: number; seconds: number }[] = []
  for (const p of points) {
    if (p.metres == null || p.metres <= 0 || p.metres >= raceMetres) continue
    const seconds = timeToSeconds(cleanTime(row[p.key] as string | null | undefined))
    // a missed timing mat leaves a blank or a zero
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= finish) continue
    marks.push({ metres: p.metres, seconds })
  }
  marks.sort((a, b) => a.metres - b.metres)
  // split times must grow with the distance; drop anything out of order (bad reads)
  const clean = marks.filter((m, i) => i === 0 || m.seconds > marks[i - 1].seconds)

  const bounds = [{ metres: 0, seconds: 0 }, ...clean, { metres: raceMetres, seconds: finish }]
  const segments: Segment[] = []
  for (let i = 1; i < bounds.length; i++) {
    const metres = bounds[i].metres - bounds[i - 1].metres
    const seconds = bounds[i].seconds - bounds[i - 1].seconds
    if (metres <= 0 || seconds <= 0) continue
    segments.push({ from: bounds[i - 1].metres, to: bounds[i].metres, seconds, pace: seconds / (metres / 1000) })
  }
  const pace = finish / (raceMetres / 1000)
  const first = segments[0]
  const last = segments[segments.length - 1]
  return {
    segments,
    pace,
    finish,
    fade: segments.length > 1 && first.pace > 0 ? last.pace / first.pace - 1 : null,
  }
}

/** −0.021 → "−2.1%" */
export function formatFade(fade: number | null): string {
  if (fade == null) return ''
  const pct = fade * 100
  const sign = pct > 0.05 ? '+' : pct < -0.05 ? '−' : '±'
  return `${sign}${Math.abs(pct).toFixed(1)}%`
}

export interface FadeGroup {
  /** "top 10%", by finishing time */
  percent: number
  from: number
  to: number
  count: number
  medianFade: number
  medianFinish: number
  /** share of the group that ran the second half faster than the first */
  negativeShare: number
}

export interface SplitStats {
  /** finishers that had usable splits */
  count: number
  medianFade: number
  negativeShare: number
  /** median pace of the first and the last segment, seconds per km */
  firstPace: number
  lastPace: number
  groups: FadeGroup[]
}

const GROUPS = 10

/**
 * The race's pacing as a whole, plus the same figures for ten equal groups of
 * finishers ordered by finishing time — slower runners usually fade more, and
 * that only shows once the field is split up.
 */
export function splitStats(runs: RunnerSplits[]): SplitStats | null {
  const usable = runs.filter((r) => r.fade != null).sort((a, b) => a.finish - b.finish)
  if (usable.length < GROUPS) return null

  const stats = (rows: RunnerSplits[]) => ({
    count: rows.length,
    medianFade: median(rows.map((r) => r.fade as number)),
    negativeShare: rows.filter((r) => (r.fade as number) < 0).length / rows.length,
    firstPace: median(rows.map((r) => r.segments[0].pace)),
    lastPace: median(rows.map((r) => r.segments[r.segments.length - 1].pace)),
  })

  const groups: FadeGroup[] = []
  const size = usable.length / GROUPS
  for (let i = 0; i < GROUPS; i++) {
    const rows = usable.slice(Math.round(i * size), Math.round((i + 1) * size))
    if (!rows.length) continue
    const s = stats(rows)
    groups.push({
      percent: (i + 1) * (100 / GROUPS),
      from: rows[0].finish,
      to: rows[rows.length - 1].finish,
      count: s.count,
      medianFade: s.medianFade,
      medianFinish: median(rows.map((r) => r.finish)),
      negativeShare: s.negativeShare,
    })
  }
  return { ...stats(usable), groups }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  if (!n) return 0
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
