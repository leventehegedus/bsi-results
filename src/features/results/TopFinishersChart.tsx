import { useEffect, useRef, useState } from 'react'
import { formatSeconds, type BreakdownRow } from '@/lib/breakdown'

const ROW_H = 60
const M = { top: 4, right: 24, bottom: 36, left: 24 }
const DOT_R = 8
/** how far from a dot the pointer still picks it: the hit target is bigger than the mark */
const HIT_RADIUS = 24
const TICK_STEPS = [30, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200]
const MAX_TICK_GAPS = 6
/** room a time label ("1:00:00", 11px) needs so neighbours don't run together */
const MIN_X_LABEL_SPACING = 56

export interface TopFinishersRow {
  key: string
  label: string
  color: string
  /** fastest first */
  runners: BreakdownRow[]
}

/**
 * One row of dots per group on a shared time axis, one dot per runner. Hover or
 * arrow keys show the name and exact time, runners on the same time listed together;
 * a click or Enter opens the runner.
 */
export function TopFinishersChart(props: {
  rows: TopFinishersRow[]
  xAxis: string
  ariaLabel: string
  onSelect: (runner: BreakdownRow) => void
}) {
  const { rows, xAxis, ariaLabel, onSelect } = props
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

  const times = rows.flatMap((r) => r.runners.map((runner) => runner.seconds))
  if (!times.length) return null

  const height = M.top + rows.length * ROW_H + M.bottom
  const plotW = Math.max(0, width - M.left - M.right)
  const lo = Math.min(...times)
  const hi = Math.max(...times)
  const domain = (step: number) => {
    const from = Math.floor(lo / step) * step
    return [from, Math.max(Math.ceil(hi / step) * step, from + step)]
  }
  const xStep =
    TICK_STEPS.find((s) => {
      const [from, to] = domain(s)
      const gaps = (to - from) / s
      return gaps <= MAX_TICK_GAPS && plotW / gaps >= MIN_X_LABEL_SPACING
    }) ?? TICK_STEPS[TICK_STEPS.length - 1]
  const [t0, t1] = domain(xStep)
  const x = (sec: number) => M.left + ((sec - t0) / (t1 - t0)) * plotW
  const rowY = (i: number) => M.top + (i + 0.5) * ROW_H + 8
  const xTicks: number[] = []
  for (let s = t0; s <= t1; s += xStep) xTicks.push(s)

  const points = rows.flatMap((row, i) =>
    row.runners.map((runner, k) => ({ key: `${row.key}-${k}`, row: i, rank: k + 1, runner, color: row.color, cx: x(runner.seconds), cy: rowY(i) })),
  )

  const nearest = (clientX: number, clientY: number) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return null
    let best: number | null = null
    let bestDist = HIT_RADIUS
    points.forEach((p, i) => {
      const dist = Math.hypot(clientX - box.left - p.cx, clientY - box.top - p.cy)
      if (dist < bestDist) {
        best = i
        bestDist = dist
      }
    })
    return best
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? (d > 0 ? -1 : points.length)) + d)))
    } else if ((e.key === 'Enter' || e.key === ' ') && active !== null) {
      e.preventDefault()
      onSelect(points[active].runner)
    } else if (e.key === 'Escape') setActive(null)
  }

  const activePoint = active !== null ? points[active] : null
  const tied = activePoint ? points.filter((p) => p.row === activePoint.row && p.runner.seconds === activePoint.runner.seconds) : []
  const tipOnLeft = activePoint !== null && activePoint.cx > width / 2

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="group"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setActive((i) => i ?? 0)}
          onBlur={() => setActive(null)}
          onPointerMove={(e) => setActive(nearest(e.clientX, e.clientY))}
          onPointerLeave={() => setActive(null)}
          onClick={(e) => {
            const i = nearest(e.clientX, e.clientY)
            if (i !== null) onSelect(points[i].runner)
          }}
          className={`focus-visible:outline-ring overflow-visible rounded-sm outline-offset-4 focus-visible:outline-2 ${activePoint ? 'cursor-pointer' : ''}`}
        >
          {rows.map((row, i) => (
            <g key={row.key}>
              <text x={M.left} y={rowY(i) - DOT_R - 8} className="fill-foreground text-xs font-medium">
                {row.label}
              </text>
              <line x1={M.left} x2={M.left + plotW} y1={rowY(i)} y2={rowY(i)} stroke="var(--border)" strokeWidth={1} />
            </g>
          ))}
          {xTicks.map((s) => (
            <text key={s} x={x(s)} y={height - M.bottom + 16} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
              {formatSeconds(s)}
            </text>
          ))}
          <text x={M.left + plotW / 2} y={height - 2} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {xAxis}
          </text>

          {/* see-through with a surface ring, so bunched-up runners still read as separate dots */}
          {points.map((p) => (
            <circle key={p.key} cx={p.cx} cy={p.cy} r={DOT_R} fill={p.color} fillOpacity={0.75} stroke="var(--card)" strokeWidth={2} />
          ))}
          {activePoint && <circle cx={activePoint.cx} cy={activePoint.cy} r={DOT_R} fill={activePoint.color} stroke="var(--foreground)" strokeWidth={2} />}
        </svg>
      )}

      {activePoint && (
        <div
          role="status"
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 w-max max-w-64 rounded-md border px-3 py-2 text-xs shadow-md"
          style={{ top: activePoint.cy + DOT_R + 6, ...(tipOnLeft ? { right: width - activePoint.cx - DOT_R } : { left: activePoint.cx - DOT_R }) }}
        >
          <ul className="flex flex-col gap-1">
            {tied.map((p) => (
              <li key={p.key} className="flex items-baseline gap-2">
                <span className="text-muted-foreground tabular-nums">{p.rank}.</span>
                <span className="font-medium">{p.runner.name}</span>
                <span className="ml-auto pl-2 font-semibold tabular-nums">{formatSeconds(p.runner.seconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
