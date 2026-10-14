import { useEffect, useRef, useState } from 'react'
import { formatSeconds, type Cutoff } from '@/lib/breakdown'

export interface PercentileSeries {
  key: string
  label: string
  /** CSS colour, e.g. var(--chart-men) */
  color: string
  cutoffs: Cutoff[]
}

const HEIGHT = 260
const M = { top: 12, bottom: 36, left: 56 }
/** right margin with / without direct end labels */
const RIGHT_LABELS = 112
const RIGHT_BARE = 16
/** end labels are 11px text: closer than this they'd touch */
const LABEL_GAP = 12
/** below this width the end labels would take too much of the plot; the legend carries identity */
const MIN_WIDTH_FOR_END_LABELS = 480
/** room an x label ("90%") needs so neighbours don't run together */
const MIN_X_LABEL_SPACING = 36
/** Candidate tick steps in seconds: 30 s … 2 h. */
const STEPS = [30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 5400, 7200]

/**
 * Finish time needed for the top 10 %, 20 % … 100 % of each group, one line per
 * group. A crosshair snaps to the nearest percentile (pointer or arrow keys) and
 * one tooltip lists every series; the table next to it carries the same values.
 */
export function PercentileChart(props: {
  series: PercentileSeries[]
  topLabel: (percent: number) => string
  placeLabel: (rank: number) => string
  xAxisLabel: string
  ariaLabel: string
}) {
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

  const series = props.series.filter((s) => s.cutoffs.length)
  const percents = series[0]?.cutoffs.map((c) => c.percent) ?? []
  const plotH = HEIGHT - M.top - M.bottom

  const all = series.flatMap((s) => s.cutoffs.map((c) => c.seconds))
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const step = STEPS.find((s) => (hi - lo) / s <= 5) ?? STEPS[STEPS.length - 1]
  const y0 = Math.floor(lo / step) * step
  const y1 = Math.max(y0 + step, Math.ceil(hi / step) * step)
  const ticks = Array.from({ length: Math.round((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step)

  const y = (sec: number) => M.top + plotH - ((sec - y0) / (y1 - y0)) * plotH

  // End labels only when they don't collide; otherwise the legend and tooltip carry identity
  // (and the room kept for them goes to the plot).
  const ends = series
    .map((s) => ({ s, y: y(s.cutoffs[s.cutoffs.length - 1].seconds) }))
    .sort((a, b) => a.y - b.y)
  const endLabels =
    width >= MIN_WIDTH_FOR_END_LABELS && ends.every((e, i) => i === 0 || e.y - ends[i - 1].y >= LABEL_GAP)
  const plotW = Math.max(0, width - M.left - (endLabels ? RIGHT_LABELS : RIGHT_BARE))
  const first = percents[0] ?? 0
  const last = percents[percents.length - 1] ?? 100
  const x = (percent: number) => M.left + ((percent - first) / (last - first || 1)) * plotW
  // on narrow screens label every 2nd / 3rd percentile (always including the first)
  const labelEvery = Math.max(1, Math.ceil(MIN_X_LABEL_SPACING / (plotW / Math.max(1, percents.length - 1))))

  const nearest = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box || !percents.length) return null
    const px = clientX - box.left
    let best = 0
    percents.forEach((p, i) => {
      if (Math.abs(x(p) - px) < Math.abs(x(percents[best]) - px)) best = i
    })
    return best
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!percents.length) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(percents.length - 1, Math.max(0, (i ?? (d > 0 ? -1 : percents.length)) + d)))
    } else if (e.key === 'Escape') setActive(null)
  }

  const tipLeft = active !== null ? x(percents[active]) : 0
  const tipOnLeft = tipLeft > width / 2

  return (
    <div className="flex flex-col gap-3">
      {/* legend: always present for 2+ series */}
      {series.length > 1 && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div ref={wrap} className="relative w-full" style={{ height: HEIGHT }}>
        {width > 0 && percents.length > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="group"
            aria-label={props.ariaLabel}
            tabIndex={0}
            onKeyDown={onKey}
            onFocus={() => setActive((i) => i ?? 0)}
            onBlur={() => setActive(null)}
            onPointerMove={(e) => setActive(nearest(e.clientX))}
            onPointerLeave={() => setActive(null)}
            className="focus-visible:outline-ring overflow-visible rounded-sm outline-offset-4 focus-visible:outline-2"
          >
            {/* gridlines + y ticks */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text
                  x={M.left - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {formatSeconds(t)}
                </text>
              </g>
            ))}
            {/* x ticks */}
            {percents.filter((_, i) => i % labelEvery === 0).map((p) => (
              <text
                key={p}
                x={x(p)}
                y={M.top + plotH + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {p}%
              </text>
            ))}
            <text
              x={M.left + plotW / 2}
              y={HEIGHT - 2}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {props.xAxisLabel}
            </text>

            {/* crosshair */}
            {active !== null && (
              <line
                x1={x(percents[active])}
                x2={x(percents[active])}
                y1={M.top}
                y2={M.top + plotH}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
              />
            )}

            {series.map((s) => (
              <g key={s.key}>
                <polyline
                  points={s.cutoffs.map((c) => `${x(c.percent)},${y(c.seconds)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.cutoffs.map((c, i) => (
                  <circle
                    key={c.percent}
                    cx={x(c.percent)}
                    cy={y(c.seconds)}
                    r={active === i ? 5 : 4}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ))}

            {endLabels &&
              ends.map(({ s, y: ey }) => (
                <g key={s.key}>
                  <line x1={M.left + plotW + 10} x2={M.left + plotW + 22} y1={ey} y2={ey} stroke={s.color} strokeWidth={2} />
                  <text x={M.left + plotW + 26} y={ey} dy="0.32em" className="fill-foreground text-[11px]">
                    {s.label}
                  </text>
                </g>
              ))}
          </svg>
        )}

        {active !== null && (
          <div
            role="status"
            className="bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border px-3 py-2 text-xs shadow-md"
            style={tipOnLeft ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
          >
            <div className="text-muted-foreground mb-1">{props.topLabel(percents[active])}</div>
            <ul className="flex flex-col gap-1">
              {series.map((s) => {
                const c = s.cutoffs[active]
                return (
                  <li key={s.key} className="flex items-center gap-2">
                    <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="font-semibold tabular-nums">{formatSeconds(c.seconds)}</span>
                    <span className="text-muted-foreground">
                      {s.label} · {props.placeLabel(c.rank)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
