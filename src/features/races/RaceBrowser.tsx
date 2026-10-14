import { useEffect, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { ResultsPanel } from '@/features/results/ResultsPanel'
import { selectRace } from '@/features/results/resultsSlice'
import {
  fetchRaces,
  selectRaceYears,
  selectVisibleEvents,
  setQuery,
  setYear,
  type VisibleEvent,
} from './racesSlice'
import type { RaceListItem } from '@/api/types'

const MAX_VISIBLE = 150
const CODE_RE = /^\d{4}[a-z0-9_]+$/i

export function RaceBrowser() {
  const dispatch = useAppDispatch()
  const { status, error, query, year } = useAppSelector((s) => s.races)
  const years = useAppSelector(selectRaceYears)
  const events = useAppSelector(selectVisibleEvents)
  const selectedId = useAppSelector((s) => s.results.raceId)
  // explicit open/closed choices; otherwise groups open when searching or holding the selected race
  const [openState, setOpenState] = useState<Record<string, boolean>>({})
  const raceCount = events.reduce((n, e) => n + e.races.length, 0)

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
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                className="pl-8"
                placeholder="Search races…"
                value={query}
                onChange={(e) => dispatch(setQuery(e.target.value))}
              />
            </div>
            <Select value={year} onValueChange={(v) => dispatch(setYear(v))}>
              <SelectTrigger className="w-24" aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {status === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>Couldn't load races</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="text-muted-foreground text-xs">
            {status === 'succeeded' &&
              `${events.length.toLocaleString('hu-HU')} events · ${raceCount.toLocaleString('hu-HU')} result lists`}
          </div>

          <ul className="-mx-2 max-h-[60svh] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            {status === 'loading' &&
              Array.from({ length: 10 }, (_, i) => (
                <li key={i} className="px-2 py-1.5">
                  <Skeleton className="h-9 w-full" />
                </li>
              ))}
            {events.slice(0, MAX_VISIBLE).map((ev) =>
              ev.races.length === 1 ? (
                <li key={ev.key}>
                  <RaceItem race={ev.races[0]} selected={selectedId === ev.races[0].id} onSelect={(id) => dispatch(selectRace(id))} />
                </li>
              ) : (
                <EventGroup
                  key={ev.key}
                  event={ev}
                  open={openState[ev.key] ?? (ev.partial || ev.races.some((r) => r.id === selectedId))}
                  onOpenChange={(o) => setOpenState((m) => ({ ...m, [ev.key]: o }))}
                  selectedId={selectedId}
                  onSelect={(id) => dispatch(selectRace(id))}
                />
              ),
            )}
            {status === 'succeeded' && events.length === 0 && CODE_RE.test(query.trim()) && (
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
            {events.length > MAX_VISIBLE && (
              <li className="text-muted-foreground px-2 py-2 text-xs">
                Showing the first {MAX_VISIBLE} events. Narrow the search or pick a year to see more.
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

function EventGroup(props: {
  event: VisibleEvent
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { event: ev } = props
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
              <span className="block truncate text-sm font-medium">{ev.label}</span>
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
                <RaceItem race={r} selected={props.selectedId === r.id} onSelect={props.onSelect} />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function RaceItem(props: { race: RaceListItem; selected: boolean; onSelect: (id: string) => void }) {
  const r = props.race
  return (
    <button
      type="button"
      onClick={() => props.onSelect(r.id)}
      className={cn(
        'hover:bg-accent w-full rounded-md px-2 py-1.5 text-left transition-colors',
        props.selected && 'bg-accent',
      )}
    >
      <div className="truncate text-sm font-medium">{r.name}</div>
      <div className="text-muted-foreground font-mono text-xs">
        {r.date} · {r.id}
      </div>
    </button>
  )
}
