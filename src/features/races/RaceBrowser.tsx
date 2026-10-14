import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { ResultsPanel } from '@/features/results/ResultsPanel'
import { selectRace } from '@/features/results/resultsSlice'
import { fetchRaces, selectEventsByYear, setQuery, type VisibleEvent, type YearGroup } from './racesSlice'
import { getRaceCached } from '@/api/runner'
import type { RaceListItem, RaceMeta } from '@/api/types'
import { runPool } from '@/lib/pool'

const MAX_VISIBLE = 150
const CODE_RE = /^\d{4}[a-z0-9_]+$/i

export function RaceBrowser() {
  const dispatch = useAppDispatch()
  const { status, error, query } = useAppSelector((s) => s.races)
  const years = useAppSelector(selectEventsByYear)
  const selectedId = useAppSelector((s) => s.results.raceId)
  // explicit open/closed choices; otherwise groups open when searching or holding the selected race
  const [openState, setOpenState] = useState<Record<string, boolean>>({})
  const searching = query.trim() !== ''
  const eventCount = years.reduce((n, y) => n + y.events.length, 0)
  const raceCount = years.reduce((n, y) => n + y.raceCount, 0)
  const currentYear = String(new Date().getFullYear())
  // while searching, only years with matches are listed
  const shownYears = searching ? years.filter((y) => y.events.length) : years

  useEffect(() => {
    if (status === 'idle') dispatch(fetchRaces())
  }, [dispatch, status])

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Card className="min-w-0 gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start">
        <CardHeader>
          <CardTitle>Races</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-col gap-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              className="pl-8"
              placeholder="Search races…"
              value={query}
              onChange={(e) => dispatch(setQuery(e.target.value))}
            />
          </div>

          {status === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>Couldn't load races</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="text-muted-foreground text-xs">
            {status === 'succeeded' &&
              `${eventCount.toLocaleString('hu-HU')} events · ${raceCount.toLocaleString('hu-HU')} result lists`}
          </div>

          <ul className="-mx-2 max-h-[60svh] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            {status === 'loading' &&
              Array.from({ length: 10 }, (_, i) => (
                <li key={i} className="px-2 py-1.5">
                  <Skeleton className="h-9 w-full" />
                </li>
              ))}
            {status === 'succeeded' &&
              shownYears.map((y) => {
                const key = `year:${y.year}`
                return (
                  <YearSection
                    key={y.year}
                    group={y}
                    open={
                      openState[key] ??
                      (searching ||
                        y.year === currentYear ||
                        y.events.some((e) => e.races.some((r) => r.id === selectedId)))
                    }
                    onOpenChange={(o) => setOpenState((m) => ({ ...m, [key]: o }))}
                    isOpen={(ev) => openState[ev.key] ?? (ev.partial || ev.races.some((r) => r.id === selectedId))}
                    onEventOpenChange={(ev, o) => setOpenState((m) => ({ ...m, [ev.key]: o }))}
                    selectedId={selectedId}
                    onSelect={(id) => dispatch(selectRace(id))}
                  />
                )
              })}
            {status === 'succeeded' && eventCount === 0 && CODE_RE.test(query.trim()) && (
              <li className="px-2 py-2">
                <button
                  type="button"
                  className="text-sm underline underline-offset-4"
                  onClick={() => dispatch(selectRace(query.trim()))}
                >
                  Open race code <span className="font-mono">{query.trim()}</span>
                </button>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* keyed so the filter form resets when another race is picked */}
      <ResultsPanel key={selectedId ?? 'none'} />
    </div>
  )
}

/** One year of events; its contents are only rendered (and fetched) while open. */
function YearSection(props: {
  group: YearGroup
  open: boolean
  onOpenChange: (open: boolean) => void
  isOpen: (ev: VisibleEvent) => boolean
  onEventOpenChange: (ev: VisibleEvent, open: boolean) => void
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { group: g } = props
  return (
    <li>
      <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="hover:bg-accent group bg-card sticky top-0 z-10 flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left transition-colors"
          >
            <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            <span className="flex-1 text-sm font-semibold">{g.year}</span>
            <span className="text-muted-foreground text-xs">
              {g.events.length ? `${plural(g.events.length, 'event')} · ${plural(g.raceCount, 'list')}` : 'no races'}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="ml-2">
            {g.events.slice(0, MAX_VISIBLE).map((ev) =>
              ev.races.length === 1 ? (
                <li key={ev.key}>
                  <RaceItem
                    race={ev.races[0]}
                    selected={props.selectedId === ev.races[0].id}
                    onSelect={props.onSelect}
                  />
                </li>
              ) : (
                <EventGroup
                  key={ev.key}
                  event={ev}
                  open={props.isOpen(ev)}
                  onOpenChange={(o) => props.onEventOpenChange(ev, o)}
                  selectedId={props.selectedId}
                  onSelect={props.onSelect}
                />
              ),
            )}
            {g.events.length > MAX_VISIBLE && (
              <li className="text-muted-foreground px-2 py-2 text-xs">
                Showing the first {MAX_VISIBLE} events. Narrow the search to see more.
              </li>
            )}
            {!g.events.length && (
              <li className="text-muted-foreground px-2 py-2 text-xs">No result lists for this year.</li>
            )}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function EventGroup(props: {
  event: VisibleEvent
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { event: ev } = props
  const metas = useDuplicateMetas(ev.races, props.open)
  const dates = ev.from === ev.to ? ev.from : `${ev.from} – ${ev.to.slice(5)}`
  return (
    <li>
      <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="hover:bg-accent group flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors"
          >
            <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" title={ev.label}>
                {/* the year is already on the year group */}
                {ev.label.replace(new RegExp(`\\s+${ev.from.slice(0, 4)}$`), '')}
              </span>
              <span className="text-muted-foreground block font-mono text-xs">{dates}</span>
            </span>
            <Badge variant="secondary" className="mt-0.5">
              {ev.races.length}
            </Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="border-border ml-4 border-l pl-2">
            {ev.races.map((r) => (
              <li key={r.id}>
                <RaceItem
                  race={r}
                  meta={metas[r.id]}
                  selected={props.selectedId === r.id}
                  onSelect={props.onSelect}
                />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/**
 * Several lists of an event often share a short name ("5 km", "Fut a cég"); their full
 * names ("LED's Run - 5 km - 20:00") only come with the race metadata. Loads it for
 * those lists once the event is opened.
 */
function useDuplicateMetas(races: RaceListItem[], open: boolean) {
  const [metas, setMetas] = useState<Record<string, RaceMeta>>({})
  const ids = useMemo(() => {
    const count = new Map<string, number>()
    for (const r of races) count.set(r.name, (count.get(r.name) ?? 0) + 1)
    return races.filter((r) => count.get(r.name)! > 1).map((r) => r.id)
  }, [races])

  useEffect(() => {
    if (!open || !ids.length) return
    let live = true
    // no abort signal: getRaceCached would cache the aborted request as "not found"
    void runPool(ids, 6, async (id) => {
      const meta = await getRaceCached(id)
      if (live && meta) setMetas((m) => ({ ...m, [id]: meta }))
    })
    return () => {
      live = false
    }
  }, [open, ids])

  return metas
}

function RaceItem(props: {
  race: RaceListItem
  /** set when the short name isn't unique within the event */
  meta?: RaceMeta
  selected: boolean
  onSelect: (id: string) => void
}) {
  const r = props.race
  const name = props.meta?.nev || r.name
  return (
    <button
      type="button"
      onClick={() => props.onSelect(r.id)}
      className={cn(
        'hover:bg-accent w-full rounded-md px-2 py-1.5 text-left transition-colors',
        props.selected && 'bg-accent',
      )}
    >
      <div className="text-sm font-medium break-words">{name}</div>
      <div className="text-muted-foreground font-mono text-xs">
        {r.date}
        {props.meta?.meret === 0 && ' · no results'}
      </div>
    </button>
  )
}

function plural(n: number, word: string) {
  return `${n.toLocaleString('hu-HU')} ${word}${n === 1 ? '' : 's'}`
}
