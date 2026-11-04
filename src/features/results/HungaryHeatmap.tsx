import { useEffect, useMemo, useRef, useState } from 'react'
import { useHungaryMapQuery } from '@/api/futanetApi'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useT } from '@/i18n'
import type { BreakdownRow } from '@/lib/breakdown'
import { hungaryHeat } from '@/lib/hungaryHeat'

/** square size in map units: about 17 km */
const CELL = 21
const MIN_MIX = 15
/** a few names to find your way around the map */
const LANDMARKS = ['Budapest', 'Debrecen', 'Szeged', 'Pécs', 'Győr', 'Miskolc']

/** the country is white in both themes, so what's drawn on it uses fixed colours too */
const COUNTRY = '#ffffff'
const INK = '#1c1c1a'

const fill = (percent: number) => `color-mix(in oklab, var(--header) ${percent}%, ${COUNTRY})`

/**
 * Where a race's Hungarian finishers live: a grid of squares over the country,
 * one hue on a log scale so Budapest doesn't wash out everywhere else.
 * Hover or arrow keys (busiest square first) show a square's towns; a click or
 * Enter opens the results filtered to the town, asking which if there are several.
 */
export function HungaryHeatmap({ rows, onShowTown }: { rows: BreakdownRow[]; onShowTown: (town: string) => void }) {
  const t = useT()
  const { data: map } = useHungaryMapQuery()
  const [active, setActive] = useState<number | null>(null)
  /** the square whose town list is open for choosing */
  const [pinned, setPinned] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const heat = useMemo(() => (map ? hungaryHeat(rows, map, CELL) : null), [rows, map])

  // a click anywhere else closes the list (on another square, its click then opens that one)
  useEffect(() => {
    if (pinned === null) return
    const close = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) setPinned(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [pinned])

  if (!map || !heat?.cells.length) return null

  const max = heat.cells[0].count
  // 1 finisher gets exactly the legend's lightest colour, the busiest square the darkest
  const mix = (count: number) => (max > 1 ? MIN_MIX + ((100 - MIN_MIX) * Math.log(count)) / Math.log(max) : 100)
  const landmarks = LANDMARKS.flatMap((name) => map.towns.filter((town) => town[0] === name).slice(0, 1))

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(heat.cells.length - 1, Math.max(0, (i ?? (d > 0 ? -1 : heat.cells.length)) + d)))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (active !== null) pick(active)
    } else if (e.key === 'Escape') setActive(null)
  }

  /** One town: straight to its runners. Several: ask which. */
  const pick = (i: number) => {
    const { towns } = heat.cells[i]
    if (towns.length === 1) onShowTown(towns[0].name)
    else setPinned(i)
  }

  const picking = pinned !== null
  const shown = pinned ?? active
  const cell = shown !== null ? heat.cells[shown] : null
  const tipOnLeft = cell !== null && cell.x > map.width / 2
  const tipOnTop = cell !== null && cell.y > map.height / 2

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-primary text-sm font-semibold">{t.breakdown.heatTitle}</h3>
        <p className="text-muted-foreground text-xs">{t.breakdown.heatDescription(Math.round(CELL * map.kmPerUnit))}</p>
      </div>

      <div className="relative w-full max-w-2xl">
        <svg
          ref={svg}
          viewBox={`0 0 ${map.width} ${map.height}`}
          role="group"
          aria-label={t.breakdown.heatTitle}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setActive((i) => i ?? 0)}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="focus-visible:outline-ring block h-auto w-full overflow-visible rounded-sm outline-offset-4 focus-visible:outline-2"
        >
          <path d={map.outline} fill={COUNTRY} stroke="var(--muted-foreground)" strokeWidth={1} strokeLinejoin="round" />
          {heat.cells.map((c, i) => (
            <rect
              key={`${c.x},${c.y}`}
              x={c.x}
              y={c.y}
              width={CELL - 1}
              height={CELL - 1}
              rx={2}
              fill={fill(mix(c.count))}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
              className="cursor-pointer"
            />
          ))}
          {cell && <rect x={cell.x} y={cell.y} width={CELL - 1} height={CELL - 1} rx={2} fill="none" stroke={INK} strokeWidth={2} className="pointer-events-none" />}
          {landmarks.map(([name, x, y]) => (
            <text
              key={name}
              x={x}
              y={y - CELL}
              textAnchor="middle"
              fill={INK}
              stroke={COUNTRY}
              strokeWidth={3}
              paintOrder="stroke"
              // map units, scaled with the map: on a phone it's about half size
              className="pointer-events-none text-[22px] font-medium sm:text-[11px]"
            >
              {name}
            </text>
          ))}
        </svg>

        {cell && (
          <div
            ref={panel}
            role={picking ? 'dialog' : 'status'}
            aria-label={picking ? t.breakdown.heatPick : undefined}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              setPinned(null)
              svg.current?.focus()
            }}
            className={`bg-popover text-popover-foreground absolute z-10 w-max max-w-56 rounded-md border px-3 py-2 text-xs shadow-md ${picking ? '' : 'pointer-events-none'}`}
            style={{
              ...(tipOnLeft ? { right: `${100 - (cell.x / map.width) * 100 + 2}%` } : { left: `${((cell.x + CELL) / map.width) * 100 + 2}%` }),
              ...(tipOnTop ? { bottom: `${100 - ((cell.y + CELL) / map.height) * 100}%` } : { top: `${(cell.y / map.height) * 100}%` }),
            }}
          >
            {picking && <div className="mb-1 font-semibold">{t.breakdown.heatPick}</div>}
            <div className="mb-1">
              <span className="font-semibold tabular-nums">{cell.count.toLocaleString('hu-HU')}</span>{' '}
              <span className="text-muted-foreground">{t.breakdown.finishers}</span>
            </div>
            <ul className={picking ? 'flex max-h-64 flex-col gap-0.5 overflow-y-auto' : 'flex flex-col gap-0.5'}>
              {cell.towns.map((town, i) =>
                picking ? (
                  <li key={town.name}>
                    <button
                      type="button"
                      autoFocus={i === 0}
                      onClick={() => onShowTown(town.name)}
                      className="hover:bg-accent focus-visible:outline-ring flex w-full cursor-pointer justify-between gap-3 rounded px-1.5 py-0.5 text-left focus-visible:outline-2"
                    >
                      <span>{town.name}</span>
                      <span className="tabular-nums">{town.count.toLocaleString('hu-HU')}</span>
                    </button>
                  </li>
                ) : (
                  <li key={town.name} className="flex justify-between gap-3">
                    <span>{town.name}</span>
                    <span className="tabular-nums">{town.count.toLocaleString('hu-HU')}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
        <span>1</span>
        <span aria-hidden className="h-2.5 w-24 rounded-[2px]" style={{ background: `linear-gradient(to right, ${fill(MIN_MIX)}, ${fill(100)})` }} />
        <span>{max.toLocaleString('hu-HU')}</span>
      </div>

      <p className="text-muted-foreground text-xs">
        {t.breakdown.heatPlaced(heat.placed, heat.total)} {t.breakdown.heatSource}
      </p>

      {/* the map's values as a table */}
      <details className="text-sm">
        <summary className="text-primary w-fit cursor-pointer text-xs font-medium">{t.breakdown.showTable}</summary>
        <div className="mt-2 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.col.town}</TableHead>
                <TableHead className="text-right">{t.breakdown.countCol}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {heat.towns.map((town) => (
                <TableRow key={town.name}>
                  <TableCell>{town.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{town.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </section>
  )
}
