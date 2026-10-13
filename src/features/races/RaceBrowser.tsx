import { useEffect } from 'react'
import { Search } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  selectFilteredRaces,
  selectRaceYears,
  setQuery,
  setYear,
} from './racesSlice'

const MAX_VISIBLE = 300
const CODE_RE = /^\d{4}[a-z0-9_]+$/i

export function RaceBrowser() {
  const dispatch = useAppDispatch()
  const { status, error, query, year } = useAppSelector((s) => s.races)
  const years = useAppSelector(selectRaceYears)
  const races = useAppSelector(selectFilteredRaces)
  const selectedId = useAppSelector((s) => s.results.raceId)

  useEffect(() => {
    if (status === 'idle') dispatch(fetchRaces())
  }, [dispatch, status])

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Card className="gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start">
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
            {status === 'succeeded' && `${races.length.toLocaleString('hu-HU')} races`}
          </div>

          <ul className="-mx-2 max-h-[60svh] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            {status === 'loading' &&
              Array.from({ length: 10 }, (_, i) => (
                <li key={i} className="px-2 py-1.5">
                  <Skeleton className="h-9 w-full" />
                </li>
              ))}
            {races.slice(0, MAX_VISIBLE).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => dispatch(selectRace(r.id))}
                  className={cn(
                    'hover:bg-accent w-full rounded-md px-2 py-1.5 text-left transition-colors',
                    selectedId === r.id && 'bg-accent',
                  )}
                >
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {r.date} · {r.id}
                  </div>
                </button>
              </li>
            ))}
            {status === 'succeeded' && races.length === 0 && CODE_RE.test(query.trim()) && (
              <li className="px-2 py-2">
                <button
                  type="button"
                  className="text-sm underline underline-offset-4"
                  onClick={() => dispatch(selectRace(query.trim()))}
                >
                  Open race code <span className="font-mono">{query.trim()}</span>
                </button>
                <p className="text-muted-foreground mt-1 text-xs">
                  Older races (e.g. <span className="font-mono">2015_spar_e</span>,{' '}
                  <span className="font-mono">1999_kaiser</span>) exist but aren't in the list.
                </p>
              </li>
            )}
            {races.length > MAX_VISIBLE && (
              <li className="text-muted-foreground px-2 py-2 text-xs">
                Showing the first {MAX_VISIBLE}. Narrow the search to see more.
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
