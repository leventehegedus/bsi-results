import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n'
import { distanceLabel, type CalendarMonth, type CalendarYear } from '@/lib/runner'

/** the lightest filled month still has to stand out from an empty one */
const MIN_MIX = 30
const ROW = 'grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))_3.5rem] items-center gap-0.5'
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

const formatKm = (km: number) => km.toLocaleString('hu-HU', { maximumFractionDigits: 1 })
const fill = (percent: number) => `color-mix(in oklab, var(--chart-series) ${percent}%, var(--card))`

/**
 * A runner's kilometres per month: one row per year, darker is more. Hover or
 * focus shows a month's races; a click opens the race, asking which if there are
 * several. The results table below carries the same values.
 */
export function RaceCalendar({ years, onOpenRace }: { years: CalendarYear[]; onOpenRace: (raceId: string) => void }) {
  const t = useT()
  const [active, setActive] = useState<string | null>(null)
  /** the month whose race list is open for choosing */
  const [pinned, setPinned] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)

  // a click anywhere else closes the list (on another month, its click then opens that one)
  useEffect(() => {
    if (pinned === null) return
    const close = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) setPinned(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [pinned])

  const max = Math.max(...years.flatMap((y) => y.months.map((m) => m?.km ?? 0)))
  const mix = (km: number) => (max > 0 ? MIN_MIX + ((100 - MIN_MIX) * km) / max : MIN_MIX)
  const shown = pinned ?? active

  /** One race: straight to it. Several: ask which. */
  const pick = (m: CalendarMonth, button: HTMLButtonElement) => {
    if (m.races.length === 1) return onOpenRace(m.races[0].raceId)
    trigger.current = button
    setPinned(m.month)
  }

  const details = (m: CalendarMonth, index: number) => {
    const picking = pinned === m.month
    return (
      <div
        ref={panel}
        role={picking ? 'dialog' : 'status'}
        aria-label={picking ? t.runner.calendarPick : undefined}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          setPinned(null)
          trigger.current?.focus()
        }}
        className={`bg-popover text-popover-foreground absolute top-full z-30 mt-1 w-max max-w-64 rounded-md border px-3 py-2 text-xs shadow-md ${index < 6 ? 'left-0' : 'right-0'} ${picking ? '' : 'pointer-events-none'}`}
      >
        {picking && <div className="mb-1 font-semibold">{t.runner.calendarPick}</div>}
        <div className="mb-1">
          <span className="tabular-nums">{m.month}</span> · <span className="font-semibold tabular-nums">{formatKm(m.km)} km</span>
        </div>
        <ul className={picking ? 'flex max-h-64 flex-col gap-0.5 overflow-y-auto' : 'flex flex-col gap-1'}>
          {m.races.map((race, i) => {
            const text = (
              <>
                <span className="block">{race.raceName}</span>
                <span className="text-muted-foreground block tabular-nums">
                  {distanceLabel(race.distance, t.distance)}
                  {race.time && ` · ${race.time}`}
                </span>
              </>
            )
            return picking ? (
              <li key={`${race.raceId}-${i}`}>
                <button
                  type="button"
                  autoFocus={i === 0}
                  onClick={() => onOpenRace(race.raceId)}
                  className="hover:bg-accent focus-visible:outline-ring w-full cursor-pointer rounded px-1.5 py-0.5 text-left focus-visible:outline-2"
                >
                  {text}
                </button>
              </li>
            ) : (
              <li key={`${race.raceId}-${i}`}>{text}</li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-0.5" onPointerLeave={() => setActive(null)}>
        <div className={`${ROW} text-muted-foreground text-[11px] tabular-nums`}>
          <span />
          {MONTHS.map((month) => (
            <span key={month} className="text-center">
              {month}
            </span>
          ))}
          <span className="text-right">km</span>
        </div>
        {years.map((y) => {
          const openIndex = y.months.findIndex((m) => m?.month === shown)
          return (
            <div key={y.year} className={`${ROW} relative`}>
              <span className="text-muted-foreground text-xs tabular-nums">{y.year}</span>
              {y.months.map((m, i) =>
                m ? (
                  <button
                    key={m.month}
                    type="button"
                    aria-label={`${m.month}: ${formatKm(m.km)} km, ${t.runner.races(m.races.length)}`}
                    onClick={(e) => pick(m, e.currentTarget)}
                    onPointerEnter={() => setActive(m.month)}
                    onFocus={() => setActive(m.month)}
                    onBlur={() => setActive(null)}
                    style={{ background: fill(mix(m.km)) }}
                    className={`focus-visible:outline-ring h-6 cursor-pointer rounded-sm focus-visible:outline-2 ${shown === m.month ? 'outline-foreground outline-2' : ''}`}
                  />
                ) : (
                  <span key={i} className="bg-muted/50 h-6 rounded-sm" />
                ),
              )}
              <span className="text-right text-xs font-semibold tabular-nums">{Math.round(y.km).toLocaleString('hu-HU')}</span>
              {openIndex >= 0 && details(y.months[openIndex]!, openIndex)}
            </div>
          )
        })}
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
        <span>0 km</span>
        <span aria-hidden className="h-2.5 w-24 rounded-[2px]" style={{ background: `linear-gradient(to right, ${fill(MIN_MIX)}, ${fill(100)})` }} />
        <span>{formatKm(max)} km</span>
      </div>
    </div>
  )
}
