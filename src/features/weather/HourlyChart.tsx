import { useEffect, useRef, useState } from 'react'
import type { WeatherHour } from '@/api/weather'

export interface HourlySeries {
  key: string
  label: string
  /** CSS colour (a validated --chart-* token) */
  color: string
  value: (h: WeatherHour) => number | null
}

export interface HourlyChartLabels {
  ariaLabel: string
  /** "Start" */
  start: string
  /** "Race window" (shaded) */
  window: string
  format: (v: number) => string
  /** extra tooltip line, e.g. the wind direction */
  extra?: (h: WeatherHour) => string
}

const ROW = 20 // room for the wind-direction arrows above the start label
const M = { top: 28, right: 52, bottom: 28, left: 44 }
const MIN_ARROW_SPACING = 22
const MIN_HOUR_LABEL_SPACING = 40

/**
 * One measure over the hours of race day (one y-axis). The race window is
 * shaded, the start is marked and its value labelled; hover or arrow keys show
 * each hour. With `arrows`, a row above the plot shows where the wind blows.
 */
export function HourlyChart(props: {
  hours: WeatherHour[]
  series: HourlySeries[]
  /** first / last hour shown */
  from: number
  to: number
  start: number
  windowHours: number
  /** start the y-axis at zero (wind speeds) */
  zero?: boolean
  arrows?: boolean
  labels: HourlyChartLabels
  height?: number
}) {
  const { series, labels, arrows } = props
  const height = props.height ?? 220
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

  const hours = props.hours.filter((h) => h.hour >= props.from && h.hour <= props.to)
  const top = M.top + (arrows ? ROW : 0)
  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = height - top - M.bottom
  const x = (hr: number) => M.left + ((hr - props.from) / Math.max(1, props.to - props.from)) * plotW

  const values = hours.flatMap((h) => series.map((s) => s.value(h))).filter((v): v is number => v != null)
  const { ticks, lo, hi } = niceScale(props.zero ? 0 : Math.min(...values), Math.max(...values))
  const y = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH

  const main = series[0]
  const startValue = valueAt(hours, props.start, main.value)
  // put the value label on the side the line isn't heading to, so it doesn't sit on the line
  const after = valueAt(hours, props.start + 0.5, main.value)
  const rising = startValue != null && after != null && after > startValue
  const sx = x(props.start)
  const wx1 = x(Math.min(props.to, props.start + props.windowHours))

  const hourEvery = Math.max(1, Math.ceil(MIN_HOUR_LABEL_SPACING / (plotW / Math.max(1, props.to - props.from))))
  const hourTicks = hours.filter((h) => Number.isInteger(h.hour) && h.hour % hourEvery === 0)
  const arrowEvery = Math.max(1, Math.ceil(MIN_ARROW_SPACING / (plotW / Math.max(1, props.to - props.from))))

  const nearest = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box || !hours.length) return null
    const px = clientX - box.left
    return hours.reduce((b, h, i) => (Math.abs(x(h.hour) - px) < Math.abs(x(hours[b].hour) - px) ? i : b), 0)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(hours.length - 1, Math.max(0, (i ?? (d > 0 ? -1 : hours.length)) + d)))
    } else if (e.key === 'Escape') setActive(null)
  }
  const startIndex = hours.findIndex((h) => h.hour >= Math.floor(props.start))

  const a = active !== null ? hours[active] : null
  const tipX = a ? x(a.hour) : 0
  // keep the start label inside the plot
  const startAnchor = sx > M.left + plotW - 50 ? 'end' : sx < M.left + 50 ? 'start' : 'middle'
  const labelLeft = startAnchor === 'end' || (rising && startAnchor !== 'start')

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={wrap} className="relative w-full" style={{ height }}>
        {width > 0 && hours.length > 1 && (
          <svg
            width={width}
            height={height}
            role="group"
            aria-label={labels.ariaLabel}
            tabIndex={0}
            onKeyDown={onKey}
            onFocus={() => setActive((i) => i ?? Math.max(0, startIndex))}
            onBlur={() => setActive(null)}
            onPointerMove={(e) => setActive(nearest(e.clientX))}
            onPointerLeave={() => setActive(null)}
            className="focus-visible:outline-ring overflow-visible rounded-sm outline-offset-4 focus-visible:outline-2"
          >
            {/* race window */}
            <rect x={sx} y={top} width={Math.max(0, wx1 - sx)} height={plotH} fill="var(--muted)" />
            <text x={(sx + wx1) / 2} y={top + plotH - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {wx1 - sx > 70 ? labels.window : ''}
            </text>

            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {labels.format(t)}
                </text>
              </g>
            ))}
            {hourTicks.map((h) => (
              <text key={h.time} x={x(h.hour)} y={top + plotH + 18} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                {h.time}
              </text>
            ))}

            {arrows &&
              hours
                .filter((h) => Number.isInteger(h.hour) && h.hour % arrowEvery === 0)
                .map((h) => (
                  // drawn pointing north, turned to where the wind blows (from dir + 180°)
                  <g key={h.time} transform={`translate(${x(h.hour)} 10) rotate(${h.dir + 180})`}>
                    <path d="M0 -6 L4 3 L0 1 L-4 3 Z" className="fill-muted-foreground" />
                  </g>
                ))}

            {/* start marker */}
            <line x1={sx} x2={sx} y1={top} y2={top + plotH} stroke="var(--chart-highlight)" strokeWidth={2} />
            <text x={sx} y={top - 6} textAnchor={startAnchor} className="fill-foreground text-[11px] font-semibold">
              {labels.start}
            </text>

            {a && <line x1={tipX} x2={tipX} y1={top} y2={top + plotH} stroke="var(--muted-foreground)" strokeWidth={1} />}

            {series.map((s) => {
              const pts = hours
                .map((h) => [h.hour, s.value(h)] as const)
                .filter((p): p is readonly [number, number] => p[1] != null)
              const last = pts[pts.length - 1]
              return (
                <g key={s.key}>
                  <polyline
                    points={pts.map(([hr, v]) => `${x(hr)},${y(v)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* direct label at the line end when there's more than one line */}
                  {series.length > 1 && last && (
                    <text x={x(last[0]) + 6} y={y(last[1])} dy="0.32em" className="fill-muted-foreground text-[10px]">
                      {s.label}
                    </text>
                  )}
                  {a && s.value(a) != null && (
                    <circle cx={tipX} cy={y(s.value(a)!)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                  )}
                </g>
              )
            })}

            {startValue != null && (
              <>
                <circle cx={sx} cy={y(startValue)} r={5} fill="var(--chart-highlight)" stroke="var(--card)" strokeWidth={2} />
                <text
                  x={sx + (labelLeft ? -9 : 9)}
                  y={y(startValue) - 9}
                  textAnchor={labelLeft ? 'end' : 'start'}
                  className="fill-foreground text-[11px] font-semibold tabular-nums"
                >
                  {labels.format(startValue)}
                </text>
              </>
            )}
          </svg>
        )}

        {a && (
          <div
            role="status"
            className="bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 min-w-32 rounded-md border px-3 py-2 text-xs shadow-md"
            style={tipX > width / 2 ? { right: width - tipX + 12 } : { left: tipX + 12 }}
          >
            <div className="text-muted-foreground tabular-nums">{a.time}</div>
            {series.map((s) => {
              const v = s.value(a)
              return v == null ? null : (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="ml-auto font-semibold tabular-nums">{labels.format(v)}</span>
                </div>
              )
            })}
            {labels.extra && <div className="text-muted-foreground mt-0.5">{labels.extra(a)}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function valueAt(hours: WeatherHour[], hour: number, pick: (h: WeatherHour) => number | null): number | null {
  const i = hours.findIndex((h) => h.hour >= hour)
  if (i === -1) return null
  if (i === 0 || hours[i].hour === hour) return pick(hours[i])
  const a = pick(hours[i - 1])
  const b = pick(hours[i])
  if (a == null || b == null) return a ?? b
  return a + ((b - a) * (hour - hours[i - 1].hour)) / (hours[i].hour - hours[i - 1].hour)
}

/** Round axis bounds and 3–6 ticks with a 1/2/5 × 10ⁿ step. */
function niceScale(min: number, max: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], lo: 0, hi: 1 }
  if (max - min < 1) {
    min -= 1
    max += 1
  }
  const raw = (max - min) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => raw <= s) ?? 10 * pow
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => +(lo + i * step).toFixed(6))
  return { ticks, lo, hi }
}
