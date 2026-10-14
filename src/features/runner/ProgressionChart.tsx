import { useEffect, useRef, useState } from 'react'
import { formatSeconds } from '@/lib/breakdown'
import type { Progression } from '@/lib/runner'

const HEIGHT = 220
const M = { top: 24, right: 16, bottom: 28, left: 56 }
/** Candidate time tick steps in seconds: 10 s … 1 h. */
const TIME_STEPS = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
const DAY = 86_400_000
/** a year label ("2021") / a month label ("2021-03") needs this much room */
const MIN_YEAR_SPACING = 40
const MIN_MONTH_SPACING = 60

export interface ProgressionLabels {
  /** "PB" */
  pb: string
  /** "faster ↑" axis hint */
  faster: string
  place: (n: number) => string
  ariaLabel: string
}

/**
 * One runner's net times at one distance over time. Faster is higher (the time
 * axis is inverted), the personal best is highlighted and labelled; hover or
 * arrow keys show a race. The profile's results table carries the same values.
 */
export function ProgressionChart({ progression, labels }: { progression: Progression; labels: ProgressionLabels }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { points, best } = progression
  const dates = points.map((p) => Date.parse(p.date))
  let d0 = Math.min(...dates)
  let d1 = Math.max(...dates)
  // a little room on both sides so the first / last points aren't on the frame
  const pad = Math.max((d1 - d0) * 0.04, 30 * DAY)
  d0 -= pad
  d1 += pad

  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = HEIGHT - M.top - M.bottom
  const x = (ms: number) => M.left + ((ms - d0) / (d1 - d0)) * plotW

  const secs = points.map((p) => p.seconds)
  const lo = Math.min(...secs)
  const hi = Math.max(...secs)
  const step = TIME_STEPS.find((s) => (hi - lo) / s <= 4) ?? 3600
  const t0 = Math.floor(lo / step) * step
  const t1 = Math.max(t0 + step, Math.ceil(hi / step) * step)
  const tTicks = Array.from({ length: Math.round((t1 - t0) / step) + 1 }, (_, i) => t0 + i * step)
  // inverted: faster (smaller) times at the top
  const y = (sec: number) => M.top + ((sec - t0) / (t1 - t0)) * plotH

  const xTicks = dateTicks(d0, d1, plotW)

  const nearest = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return null
    const px = clientX - box.left
    return dates.reduce((bestI, d, i) => (Math.abs(x(d) - px) < Math.abs(x(dates[bestI]) - px) ? i : bestI), 0)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? (d > 0 ? -1 : points.length)) + d)))
    } else if (e.key === 'Escape') setActive(null)
  }

  const bestIndex = points.indexOf(best)
  const bx = x(dates[bestIndex])
  const pbLabel = `${labels.pb} ${formatSeconds(best.seconds)}`
  // keep the PB label inside the plot near the right edge
  const pbAnchor = bx > M.left + plotW - 60 ? 'end' : bx < M.left + 60 ? 'start' : 'middle'

  const a = active !== null ? points[active] : null
  const tipX = active !== null ? x(dates[active]) : 0

  return (
    <div ref={wrap} className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="group"
          aria-label={labels.ariaLabel}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setActive((i) => i ?? bestIndex)}
          onBlur={() => setActive(null)}
          onPointerMove={(e) => setActive(nearest(e.clientX))}
          onPointerLeave={() => setActive(null)}
          className="focus-visible:outline-ring overflow-visible rounded-sm outline-offset-4 focus-visible:outline-2"
        >
          {tTicks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {formatSeconds(t)}
              </text>
            </g>
          ))}
          <text x={M.left - 8} y={M.top - 12} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {labels.faster}
          </text>
          {xTicks.map((tk) => (
            <text
              key={tk.ms}
              x={x(tk.ms)}
              y={M.top + plotH + 18}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {tk.label}
            </text>
          ))}

          {active !== null && (
            <line x1={tipX} x2={tipX} y1={M.top} y2={M.top + plotH} stroke="var(--muted-foreground)" strokeWidth={1} />
          )}

          <polyline
            points={points.map((p, i) => `${x(dates[i])},${y(p.seconds)}`).join(' ')}
            fill="none"
            stroke="var(--chart-series)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => {
            const isBest = i === bestIndex
            return (
              <circle
                key={`${p.raceId}-${i}`}
                cx={x(dates[i])}
                cy={y(p.seconds)}
                r={active === i || isBest ? 5 : 4}
                fill={isBest ? 'var(--chart-highlight)' : 'var(--chart-series)'}
                stroke="var(--card)"
                strokeWidth={2}
              />
            )
          })}
          {/* direct label on the one point the chart is about */}
          <text x={bx} y={y(best.seconds) - 10} textAnchor={pbAnchor} className="fill-foreground text-[11px] font-semibold tabular-nums">
            {pbLabel}
          </text>
        </svg>
      )}

      {a && (
        <div
          role="status"
          className="bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 max-w-64 min-w-40 rounded-md border px-3 py-2 text-xs shadow-md"
          style={tipX > width / 2 ? { right: width - tipX + 12 } : { left: tipX + 12 }}
        >
          <div className="text-muted-foreground tabular-nums">{a.date}</div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tabular-nums">{formatSeconds(a.seconds)}</span>
            {a === best && <span className="text-muted-foreground">{labels.pb}</span>}
          </div>
          <div className="truncate">{a.raceName}</div>
          {a.place != null && <div className="text-muted-foreground">{labels.place(a.place)}</div>}
        </div>
      )}
    </div>
  )
}

/** Year ticks for long spans, month ticks for short ones; thinned to fit the width. */
function dateTicks(d0: number, d1: number, plotW: number): { ms: number; label: string }[] {
  const start = new Date(d0)
  const end = new Date(d1)
  const years = end.getUTCFullYear() - start.getUTCFullYear()
  if (years >= 2) {
    const all: number[] = []
    for (let yr = start.getUTCFullYear() + 1; yr <= end.getUTCFullYear(); yr++) all.push(yr)
    const every = Math.max(1, Math.ceil(MIN_YEAR_SPACING / (plotW / ((d1 - d0) / (365.25 * DAY)))))
    return all.filter((yr) => yr % every === 0).map((yr) => ({ ms: Date.UTC(yr, 0, 1), label: String(yr) }))
  }
  const months: { ms: number; label: string }[] = []
  for (let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); m.getTime() <= d1; m.setUTCMonth(m.getUTCMonth() + 1)) {
    months.push({ ms: m.getTime(), label: `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}` })
  }
  const every = Math.max(1, Math.ceil(MIN_MONTH_SPACING / (plotW / ((d1 - d0) / (30.44 * DAY)))))
  return months.filter((_, i) => i % every === 0)
}
