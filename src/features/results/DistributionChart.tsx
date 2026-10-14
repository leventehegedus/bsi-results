import { useEffect, useRef, useState } from 'react'
import { formatSeconds, type Bin, type Cutoff } from '@/lib/breakdown'

const HEIGHT = 260
const M = { top: 22, right: 16, bottom: 36, left: 48 }
const MAX_BAR = 24
const GAP = 2
const RADIUS = 4
/** cut-off labels closer than this would collide: the line stays, the label is dropped */
const LABEL_SPACING = 30
const TICK_STEPS = [60, 120, 300, 600, 900, 1200, 1800, 3600, 5400, 7200]
/** room a time label ("1:00:00", 11px) needs so neighbours don't run together */
const MIN_X_LABEL_SPACING = 56

export interface DistributionLabels {
  men: string
  women: string
  finishers: string
  /** "62% finished by then" */
  finishedBy: (percent: number) => string
  xAxis: string
  ariaLabel: string
}

/**
 * Finishers per time slot (a histogram: the bell curve of the race), men and
 * women stacked when the race has gender data. Thin lines mark the time needed
 * for the top 10 %, 20 % … of all finishers. Hover or arrow keys show one slot.
 */
export function DistributionChart(props: { bins: Bin[]; cutoffs: Cutoff[]; stacked: boolean; labels: DistributionLabels }) {
  const { bins, cutoffs, stacked, labels } = props
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

  if (!bins.length) return null

  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = HEIGHT - M.top - M.bottom
  const t0 = bins[0].from
  const t1 = bins[bins.length - 1].to
  const x = (sec: number) => M.left + ((sec - t0) / (t1 - t0)) * plotW
  const slotW = plotW / bins.length
  const barW = Math.max(1, Math.min(MAX_BAR, slotW - GAP))

  const maxCount = Math.max(...bins.map((b) => b.total))
  const yStep = niceStep(maxCount / 4)
  const yMax = Math.max(yStep, Math.ceil(maxCount / yStep) * yStep)
  const yTicks = Array.from({ length: yMax / yStep + 1 }, (_, i) => i * yStep)
  const y = (n: number) => M.top + plotH - (n / yMax) * plotH

  // at most ~8 time labels, and never closer than a label is wide ("1:00:00")
  const xStep = TICK_STEPS.find((s) => (t1 - t0) / s <= 8 && (s / (t1 - t0)) * plotW >= MIN_X_LABEL_SPACING) ?? 3600
  const xTicks: number[] = []
  for (let s = Math.ceil(t0 / xStep) * xStep; s <= t1; s += xStep) xTicks.push(s)

  // cut-off lines: every one drawn, labels only where they have room
  const marks = spaceLabels(cutoffs.filter((c) => c.percent < 100).map((c) => ({ ...c, cx: x(c.seconds) })))

  // the whole slot column is the hit target, not just the painted bar
  const slotAt = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box || slotW <= 0) return null
    const i = Math.floor((clientX - box.left - M.left) / slotW)
    return i >= 0 && i < bins.length ? i : null
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(bins.length - 1, Math.max(0, (i ?? (d > 0 ? -1 : bins.length)) + d)))
    } else if (e.key === 'Escape') setActive(null)
  }

  const activeBin = active !== null ? bins[active] : null
  const tipX = active !== null ? M.left + (active + 0.5) * slotW : 0
  const tipOnLeft = tipX > width / 2

  return (
    <div className="flex flex-col gap-3">
      {stacked && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <LegendItem color="var(--chart-men)" label={labels.men} />
          <LegendItem color="var(--chart-women)" label={labels.women} />
        </ul>
      )}

      <div ref={wrap} className="relative w-full" style={{ height: HEIGHT }}>
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
            onPointerMove={(e) => setActive(slotAt(e.clientX))}
            onPointerLeave={() => setActive(null)}
            className="focus-visible:outline-ring overflow-visible rounded-sm outline-offset-4 focus-visible:outline-2"
          >
            {yTicks.map((n) => (
              <g key={n}>
                <line x1={M.left} x2={M.left + plotW} y1={y(n)} y2={y(n)} stroke="var(--border)" strokeWidth={1} />
                <text x={M.left - 8} y={y(n)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {compact(n)}
                </text>
              </g>
            ))}
            {xTicks.map((s) => (
              <text
                key={s}
                x={x(s)}
                y={M.top + plotH + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {formatSeconds(s)}
              </text>
            ))}
            <text x={M.left + plotW / 2} y={HEIGHT - 2} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {labels.xAxis}
            </text>

            {/* top-N % cut-offs */}
            {marks.map((m) => (
              <g key={m.percent}>
                <line x1={m.cx} x2={m.cx} y1={M.top} y2={M.top + plotH} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.45} />
                {m.showLabel && (
                  <text x={m.cx} y={M.top - 8} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                    {m.percent}%
                  </text>
                )}
              </g>
            ))}

            {bins.map((b, i) => {
              const bx = M.left + i * slotW + (slotW - barW) / 2
              const dim = active !== null && active !== i ? 0.45 : 1
              const segments = stacked
                ? [
                    { n: b.men, color: 'var(--chart-men)' },
                    { n: b.women, color: 'var(--chart-women)' },
                  ].filter((s) => s.n > 0)
                : b.total > 0
                  ? [{ n: b.total, color: 'var(--chart-men)' }]
                  : []
              let base = 0
              return (
                <g key={b.from} opacity={dim}>
                  {segments.map((s, k) => {
                    const top = y(base + s.n)
                    // a 2px surface gap between stacked segments
                    const bottom = y(base) - (k > 0 ? GAP : 0)
                    base += s.n
                    const h = Math.max(0, bottom - top)
                    const last = k === segments.length - 1
                    return <path key={k} d={bar(bx, top, barW, h, last ? Math.min(RADIUS, h, barW / 2) : 0)} fill={s.color} />
                  })}
                </g>
              )
            })}
            <line x1={M.left} x2={M.left + plotW} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth={1} />
          </svg>
        )}

        {activeBin && (
          <div
            role="status"
            className="bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border px-3 py-2 text-xs shadow-md"
            style={tipOnLeft ? { right: width - tipX + 12 } : { left: tipX + 12 }}
          >
            <div className="text-muted-foreground mb-1 tabular-nums">
              {formatSeconds(activeBin.from)} – {formatSeconds(activeBin.to)}
            </div>
            <ul className="flex flex-col gap-1">
              {stacked && (
                <>
                  <TipRow color="var(--chart-men)" value={activeBin.men} label={labels.men} />
                  <TipRow color="var(--chart-women)" value={activeBin.women} label={labels.women} />
                </>
              )}
              <TipRow value={activeBin.total} label={labels.finishers} />
            </ul>
            <div className="text-muted-foreground mt-1">{labels.finishedBy(Math.round(activeBin.cumulative))}</div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Marks a label as shown when it's at least LABEL_SPACING px from the previous shown one. */
function spaceLabels<T extends { cx: number }>(marks: T[]): (T & { showLabel: boolean })[] {
  return marks.reduce<(T & { showLabel: boolean })[]>((out, m) => {
    const prev = out.findLast((o) => o.showLabel)
    return [...out, { ...m, showLabel: !prev || m.cx - prev.cx >= LABEL_SPACING }]
  }, [])
}

/** A bar with rounded top corners and a square foot on the baseline. */
function bar(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return ''
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/** 1, 2, 5, 10, 20, 50 … at or above `raw`. */
function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(1, raw)))
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
}

/** 1200 → 1.2K for the count axis. */
function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toLocaleString('en', { maximumFractionDigits: 1 })}K` : String(n)
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {/* legend mirrors the mark: a rect for bars */}
      <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: color }} />
      {label}
    </li>
  )
}

function TipRow({ color, value, label }: { color?: string; value: number; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color ?? 'transparent' }} />
      <span className="font-semibold tabular-nums">{value.toLocaleString('hu-HU')}</span>
      <span className="text-muted-foreground">{label}</span>
    </li>
  )
}
