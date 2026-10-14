import { useEffect, useRef, useState } from 'react'
import { formatSeconds } from '@/lib/breakdown'
import { formatFade, type FadeGroup } from '@/lib/splits'

const HEIGHT = 260
const M = { top: 16, right: 16, bottom: 44, left: 52 }
const MAX_BAR = 44
const GAP = 2
const RADIUS = 4
/** candidate gridline steps, as a share (1 % … 20 %) */
const STEPS = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2]

export interface FadeLabels {
  /** "top 20% of the field" */
  group: (percent: number) => string
  finish: string
  runners: (n: number) => string
  negative: (percent: string) => string
  xAxis: string
  yAxis: string
  ariaLabel: string
}

/**
 * Median slowdown of the last segment against the first, for ten equal groups of
 * finishers ordered by finishing time. Bars grow from a zero line: up (orange)
 * is a positive split, down (blue) a negative one, so the usual "the slower you
 * finish, the more you fade" shows as a rising staircase.
 */
export function FadeChart({ groups, labels }: { groups: FadeGroup[]; labels: FadeLabels }) {
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

  if (!groups.length) return null

  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = HEIGHT - M.top - M.bottom
  const slot = plotW / groups.length
  const barW = Math.min(MAX_BAR, Math.max(2, slot - GAP * 2))

  const peak = Math.max(...groups.map((g) => Math.abs(g.medianFade)), 0.01)
  const step = STEPS.find((s) => peak / s <= 3) ?? STEPS[STEPS.length - 1]
  const lo = Math.min(0, Math.floor(Math.min(...groups.map((g) => g.medianFade)) / step) * step)
  const hi = Math.max(step, Math.ceil(Math.max(...groups.map((g) => g.medianFade)) / step) * step)
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Number(t.toFixed(4)))

  const y = (v: number) => M.top + plotH - ((v - lo) / (hi - lo)) * plotH
  const cx = (i: number) => M.left + slot * (i + 0.5)
  const zero = y(0)

  const nearest = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return null
    const i = Math.floor((clientX - box.left - M.left) / slot)
    return Math.min(groups.length - 1, Math.max(0, i))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(groups.length - 1, Math.max(0, (i ?? (d > 0 ? -1 : groups.length)) + d)))
    } else if (e.key === 'Escape') setActive(null)
  }

  const tipLeft = active !== null ? cx(active) : 0
  const tipOnLeft = tipLeft > width / 2

  return (
    <div className="relative w-full" ref={wrap} style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="group"
          aria-label={labels.ariaLabel}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setActive((i) => i ?? 0)}
          onBlur={() => setActive(null)}
          onPointerMove={(e) => setActive(nearest(e.clientX))}
          onPointerLeave={() => setActive(null)}
          className="focus-visible:outline-ring overflow-visible rounded-sm outline-offset-4 focus-visible:outline-2"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? 'var(--muted-foreground)' : 'var(--border)'}
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}

          {groups.map((g, i) => {
            const up = g.medianFade >= 0
            const top = up ? y(g.medianFade) : zero
            const h = Math.max(1, Math.abs(zero - y(g.medianFade)))
            return (
              <rect
                key={g.percent}
                x={cx(i) - barW / 2}
                y={top}
                width={barW}
                height={h}
                // rounded away from the zero line, like a bar growing off its baseline
                rx={RADIUS}
                ry={RADIUS}
                fill={up ? 'var(--chart-slower)' : 'var(--chart-faster)'}
                opacity={active === null || active === i ? 1 : 0.55}
                stroke="var(--card)"
                strokeWidth={GAP}
              />
            )
          })}

          {groups.map((g, i) => (
            <text
              key={g.percent}
              x={cx(i)}
              y={M.top + plotH + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {g.percent}%
            </text>
          ))}
          <text x={M.left + plotW / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {labels.xAxis}
          </text>
        </svg>
      )}

      {active !== null && (
        <div
          role="status"
          className="bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 min-w-44 rounded-md border px-3 py-2 text-xs shadow-md"
          style={tipOnLeft ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
        >
          <div className="text-muted-foreground mb-1">{labels.group(groups[active].percent)}</div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{
                background: groups[active].medianFade >= 0 ? 'var(--chart-slower)' : 'var(--chart-faster)',
              }}
            />
            <span className="font-semibold tabular-nums">{formatFade(groups[active].medianFade)}</span>
            <span className="text-muted-foreground">{labels.yAxis}</span>
          </div>
          <div className="text-muted-foreground mt-1 flex flex-col gap-0.5">
            <span>
              {labels.finish} <span className="tabular-nums">{formatSeconds(groups[active].medianFinish)}</span>
            </span>
            <span>{labels.negative(Math.round(groups[active].negativeShare * 100) + '%')}</span>
            <span>{labels.runners(groups[active].count)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
