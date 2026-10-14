import { useEffect, useState, type FormEvent } from 'react'
import { Download, Info, Loader2, MapPin, Search, Square, UserRound, Users, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { downloadCsv, slug, toCsv } from '@/lib/csv'
import { distanceLabel, topValues } from '@/lib/runner'
import { MARATHON_METRES, runnerKey } from '@/lib/results'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectRace } from '@/features/results/resultsSlice'
import { setTab } from '@/features/ui/uiSlice'
import { cancelRunner, searchRunner, writeHash } from './runnerActions'
import { RunnerLink } from './RunnerLink'
import {
  MIN_QUERY_LENGTH,
  selectAllRunnerResults,
  selectPeople,
  selectPersonalBests,
  selectRunnerResults,
  setFilterTown,
  setFilterYob,
  setIncludeVirtual,
  setMergeSubLists,
  type RunnerQuery,
} from './runnerSlice'

export function RunnerProfile() {
  const dispatch = useAppDispatch()
  const r = useAppSelector((s) => s.runner)
  const all = useAppSelector(selectAllRunnerResults)
  const results = useAppSelector(selectRunnerResults)
  const people = useAppSelector(selectPeople)
  const pbs = useAppSelector(selectPersonalBests)
  const busy = r.status === 'resolving' || r.status === 'scanning'

  // The search fields; they follow the active profile (or a shared link) but stay editable,
  // and both "Find results" and the link's "Search all races" button use them.
  const queryKey = JSON.stringify(r.query)
  const [draft, setDraft] = useState(() => draftFrom(r.query))
  const [draftFor, setDraftFor] = useState(queryKey)
  if (draftFor !== queryKey) {
    setDraftFor(queryKey)
    setDraft(draftFrom(r.query))
  }
  const draftQuery = queryFromDraft(draft, r.query)
  const runDraft = () => draftQuery && searchRunner(dispatch, draftQuery)

  // Keep the URL shareable once we know who we're looking at.
  useEffect(() => {
    if (r.status === 'scanning' || r.status === 'done') writeHash(r.query)
  }, [r.status, r.query])

  const openRace = (raceId: string) => {
    dispatch(selectRace(raceId))
    dispatch(setTab('races'))
  }

  // Columns that only matter when the results mix several names / birth years.
  const names = new Set(all.map((x) => runnerKey(x.name)))
  const years = new Set(all.map((x) => x.yob))
  const showName = names.size > 1
  const showYob = years.size > 1
  const filtered = r.filterYob !== null || r.filterTown !== null

  const exportCsv = () => {
    const csv = toCsv(
      ['Date', 'Race', 'Distance', 'Name', 'Birth year', 'Net time', 'Place', 'Category', 'Cat. place', 'Town', 'Club', 'Race code'],
      results.map((x) => [
        x.date,
        x.raceName,
        distanceLabel(x.distance),
        x.name,
        x.yob,
        x.time,
        x.place,
        x.category,
        x.categoryPlace,
        x.town,
        x.club,
        x.raceId,
      ]),
    )
    downloadCsv(`${slug(r.query?.name ?? 'runner')}${r.query?.yob ? '-' + r.query.yob : ''}.csv`, csv)
  }

  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0
  const marathons = results.filter((x) => x.distance === MARATHON_METRES).length
  const yearsRun = results.map((x) => x.date.slice(0, 4)).sort()
  const towns = topValues(results.map((x) => x.town))
  const clubs = topValues(results.map((x) => x.club))
  const singleYob = people === 1 ? (results[0]?.yob ?? null) : null
  // quick filters for the "several people" notice, most results first
  const yobOptions = countBy(results.map((x) => (x.yob === null ? 'unknown' : String(x.yob))))
  const townOptions = countBy(results.map((x) => x.town)).slice(0, MAX_TOWN_OPTIONS)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Runner profile</CardTitle>
          <CardDescription>
            Click any runner's name in a results table, or search here by part of a name (at least{' '}
            {MIN_QUERY_LENGTH} characters). A birth year keeps people who share a name apart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SearchForm
            draft={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            onSubmit={runDraft}
            canSubmit={draftQuery !== null}
            busy={busy}
          />
        </CardContent>
      </Card>

      {r.status === 'idle' &&
        (r.query ? (
          <Card className="items-center justify-center gap-3 py-12 text-center text-sm">
            <UserRound className="text-muted-foreground size-8 opacity-50" />
            <p className="text-muted-foreground max-w-sm">
              Searching every race takes a little while, so it only starts when you ask.
            </p>
            <Button onClick={runDraft} disabled={!draftQuery}>
              <Search />
              {draftQuery
                ? `Search all races for “${draftQuery.name}”${queryDetails(draftQuery)}`
                : `Type at least ${MIN_QUERY_LENGTH} characters of a name`}
            </Button>
          </Card>
        ) : (
          <EmptyState />
        ))}

      {r.status !== 'idle' && r.query && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full">
                  {people > 1 ? <Users className="size-6" /> : <UserRound className="size-6" />}
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <CardTitle className="text-xl">
                    {r.query.exact ? r.query.name : `Results for “${r.query.name}”`}
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    {r.query.town && (
                      <Badge variant="secondary">
                        <MapPin /> Only {r.query.town}
                      </Badge>
                    )}
                    {r.status === 'resolving' ? (
                      <Badge variant="outline">
                        <Loader2 className="animate-spin" /> Looking up birth year…
                      </Badge>
                    ) : people > 1 ? (
                      <Badge variant="secondary">{people} people</Badge>
                    ) : singleYob ? (
                      <Badge variant="secondary">Born {singleYob}</Badge>
                    ) : r.query.yob ? (
                      <Badge variant="secondary">Born {r.query.yob}</Badge>
                    ) : (
                      <Badge variant="outline">Birth year unknown</Badge>
                    )}
                    {people === 1 &&
                      towns.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    {people === 1 &&
                      clubs.map((c) => (
                        <Badge key={c} variant="outline">
                          {c}
                        </Badge>
                      ))}
                  </div>
                  {r.source && r.status === 'resolving' && (
                    <CardDescription>from {r.source}</CardDescription>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {busy && (
                <div className="grid gap-2">
                  <Progress value={r.status === 'resolving' ? 0 : pct} />
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Loader2 className="size-3.5 animate-spin" />
                    {r.status === 'resolving'
                      ? 'Working out the birth year from the result you clicked…'
                      : `Searching all races… ${r.done.toLocaleString('hu-HU')}/${r.total.toLocaleString('hu-HU')}`}
                  </div>
                </div>
              )}

              {r.status === 'failed' && (
                <Alert variant="destructive">
                  <AlertTitle>Search failed</AlertTitle>
                  <AlertDescription>{r.error}</AlertDescription>
                </Alert>
              )}
              {r.failedRaces.length > 0 && !busy && (
                <Alert>
                  <Info />
                  <AlertTitle>
                    {r.failedRaces.length === 1
                      ? "1 race couldn't be searched"
                      : `${r.failedRaces.length} races couldn't be searched`}
                  </AlertTitle>
                  <AlertDescription className="gap-2">
                    <p>
                      results.futanet.hu returned errors even after retrying:{' '}
                      {r.failedRaces
                        .slice(0, 3)
                        .map((x) => `${x.name} (${x.date.slice(0, 4)})`)
                        .join(', ')}
                      {r.failedRaces.length > 3 && ` and ${r.failedRaces.length - 3} more`}. The results below may
                      be incomplete.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-foreground w-fit"
                      onClick={() => r.query && searchRunner(dispatch, r.query, r.failedRaces)}
                    >
                      Retry {r.failedRaces.length === 1 ? 'it' : `these ${r.failedRaces.length}`}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {r.status === 'cancelled' && (
                <p className="text-muted-foreground text-sm">Stopped. Showing what was found so far.</p>
              )}
              {people > 1 && !busy && (
                <Alert>
                  <Info />
                  <AlertTitle>Several people match</AlertTitle>
                  <AlertDescription className="gap-2">
                    <p>
                      Pick a birth year or town to narrow the results (also clickable in the table), or a
                      name to open that person's profile.
                    </p>
                    {yobOptions.length > 1 && (
                      <QuickFilters
                        label="Birth year"
                        options={yobOptions.map(([v, n]) => ({ key: v, label: v === 'unknown' ? 'unknown' : v, count: n }))}
                        onPick={(v) => dispatch(setFilterYob(v === 'unknown' ? 'unknown' : Number(v)))}
                      />
                    )}
                    {townOptions.length > 1 && (
                      <QuickFilters
                        label="Town"
                        options={townOptions.map(([v, n]) => ({ key: v, label: v || 'no town', count: n }))}
                        onPick={(v) => dispatch(setFilterTown(v))}
                      />
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Finishes" value={results.length} />
                <Stat label="Marathons" value={marathons} />
                <Stat label="First race" value={yearsRun[0] ?? '–'} />
                <Stat label="Latest race" value={yearsRun.at(-1) ?? '–'} />
              </dl>

              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <Toggle
                  id="r-merge"
                  checked={r.mergeSubLists}
                  onChange={(v) => dispatch(setMergeSubLists(v))}
                  label="Count a run once (merge sub-lists)"
                />
                <Toggle
                  id="r-virtual"
                  checked={r.includeVirtual}
                  onChange={(v) => dispatch(setIncludeVirtual(v))}
                  label="Include virtual races"
                />
              </div>
            </CardContent>
          </Card>

          {pbs.length > 0 && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Personal bests</CardTitle>
                <CardDescription>Fastest net time per distance (virtual races excluded).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Distance</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Race</TableHead>
                        <TableHead className="text-right">Place</TableHead>
                        <TableHead className="text-right">Runs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pbs.map((pb) => (
                        <TableRow key={pb.label}>
                          <TableCell className="font-medium">{pb.label}</TableCell>
                          <TableCell className="font-semibold tabular-nums">{pb.best.time}</TableCell>
                          <TableCell className="tabular-nums">{pb.best.date}</TableCell>
                          <TableCell className="max-w-72 truncate" title={pb.best.raceName}>
                            <LinkButton onClick={() => openRace(pb.best.raceId)}>{pb.best.raceName}</LinkButton>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{pb.best.place}</TableCell>
                          <TableCell className="text-right tabular-nums">{pb.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Results <Badge variant="secondary">{results.length}</Badge>
              </CardTitle>
              {r.status === 'done' && r.similarNames > 0 && (
                <CardDescription>
                  {r.similarNames} result{r.similarNames > 1 ? 's' : ''} for longer names containing “
                  {r.query.name}” were left out.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!results.length}>
                  <Download /> Download CSV
                </Button>
                {r.query.town && (
                  <FilterChip
                    onClear={() => r.query && searchRunner(dispatch, { ...r.query, town: null })}
                    clearLabel="Search again without the town filter"
                  >
                    <MapPin /> Town: {r.query.town}
                  </FilterChip>
                )}
                {r.filterYob !== null && (
                  <FilterChip onClear={() => dispatch(setFilterYob(null))}>
                    Born {r.filterYob === 'unknown' ? 'unknown' : r.filterYob}
                  </FilterChip>
                )}
                {r.filterTown !== null && (
                  <FilterChip onClear={() => dispatch(setFilterTown(null))}>{r.filterTown || 'No town'}</FilterChip>
                )}
                {filtered && (
                  <span className="text-muted-foreground text-xs">
                    {results.length} of {all.length} shown
                  </span>
                )}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Race</TableHead>
                      <TableHead>Distance</TableHead>
                      {showName && <TableHead>Name</TableHead>}
                      {showYob && <TableHead>Born</TableHead>}
                      <TableHead>Net time</TableHead>
                      <TableHead className="text-right">Place</TableHead>
                      <TableHead>Cat. place</TableHead>
                      <TableHead>Town</TableHead>
                      <TableHead>Club</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((x, i) => (
                      <TableRow key={`${x.raceId}-${i}`}>
                        <TableCell className="tabular-nums">{x.date}</TableCell>
                        <TableCell className="max-w-72 truncate" title={x.raceName}>
                          <LinkButton onClick={() => openRace(x.raceId)}>{x.raceName}</LinkButton>
                          {x.virtual && (
                            <Badge variant="outline" className="ml-2">
                              virtual
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{distanceLabel(x.distance)}</TableCell>
                        {showName && (
                          <TableCell>
                            <RunnerLink
                              name={x.name}
                              raceId={x.raceId}
                              raceName={x.raceName}
                              place={x.place}
                              bib={x.bib}
                              yob={x.yob}
                            />
                          </TableCell>
                        )}
                        {showYob && (
                          <TableCell className="tabular-nums">
                            <FilterButton
                              active={r.filterYob === (x.yob ?? 'unknown')}
                              onClick={() => dispatch(setFilterYob(x.yob ?? 'unknown'))}
                              title="Show only this birth year"
                            >
                              {x.yob ?? '?'}
                            </FilterButton>
                          </TableCell>
                        )}
                        <TableCell className="tabular-nums">{x.time}</TableCell>
                        <TableCell className="text-right tabular-nums">{x.place}</TableCell>
                        <TableCell className="tabular-nums">{x.categoryPlace}</TableCell>
                        <TableCell>
                          {x.town ? (
                            <FilterButton
                              active={r.filterTown === x.town}
                              onClick={() => dispatch(setFilterTown(x.town))}
                              title="Show only this town"
                            >
                              {x.town}
                            </FilterButton>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-48 truncate" title={x.club}>
                          {x.club}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!results.length && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-muted-foreground py-10 text-center">
                          {busy ? 'Searching…' : 'No results found.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

interface Draft {
  name: string
  yob: string
  town: string
}

function draftFrom(q: RunnerQuery | null): Draft {
  return { name: q?.name ?? '', yob: q?.yob ? String(q.yob) : '', town: q?.town ?? '' }
}

/**
 * The query the fields describe, or null while the name is too short. A profile's
 * exact-name match (opened from a result row or a shared link) is kept as long as
 * the name isn't changed.
 */
function queryFromDraft(d: Draft, current: RunnerQuery | null): RunnerQuery | null {
  const name = d.name.trim()
  if (name.length < MIN_QUERY_LENGTH) return null
  const y = Number(d.yob)
  return {
    name,
    yob: Number.isInteger(y) && y > 1900 ? y : null,
    exact: !!current?.exact && name === current.name,
    town: d.town.trim() || null,
  }
}

function SearchForm(props: {
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  onSubmit: () => void
  canSubmit: boolean
  busy: boolean
}) {
  const { name, yob, town } = props.draft
  const tooShort = !props.canSubmit

  const submit = (e: FormEvent) => {
    e.preventDefault()
    props.onSubmit()
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_9rem_11rem_auto]">
      <div className="grid gap-1.5">
        <Label htmlFor="runner-name">Name</Label>
        <Input
          id="runner-name"
          value={name}
          placeholder="e.g. Hegedüs Levente, or just “Hegedüs”"
          aria-describedby="runner-name-hint"
          onChange={(e) => props.onChange({ name: e.target.value })}
        />
        <p id="runner-name-hint" className="text-muted-foreground text-xs">
          {name.trim() && tooShort
            ? `Type at least ${MIN_QUERY_LENGTH} characters.`
            : 'Matches any name containing this text (accents ignored).'}
        </p>
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="runner-yob">Birth year</Label>
        <Input
          id="runner-yob"
          inputMode="numeric"
          placeholder="optional"
          value={yob}
          onChange={(e) => props.onChange({ yob: e.target.value.replace(/\D/g, '').slice(0, 4) })}
        />
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="runner-town">Town</Label>
        <Input
          id="runner-town"
          placeholder="optional, e.g. Makó"
          aria-describedby="runner-town-hint"
          value={town}
          onChange={(e) => props.onChange({ town: e.target.value })}
        />
        <p id="runner-town-hint" className="text-muted-foreground text-xs">
          Whole town name.
        </p>
      </div>
      <div className="flex items-start sm:pt-[1.375rem]">
        {/* Distinct keys: otherwise React reuses the same <button> and flips it to
            type="submit" while the Stop click is still being handled, which
            submits the form and restarts the search. */}
        {props.busy ? (
          <Button
            key="stop"
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={(e) => {
              e.preventDefault()
              cancelRunner()
            }}
          >
            <Square /> Stop
          </Button>
        ) : (
          <Button key="submit" type="submit" className="w-full sm:w-auto" disabled={tooShort}>
            <Search /> Find results
          </Button>
        )}
      </div>
    </form>
  )
}

function EmptyState() {
  return (
    <Card className="text-muted-foreground items-center justify-center py-20 text-center text-sm">
      <UserRound className="size-8 opacity-50" />
      <p className="max-w-sm">
        Open a profile by clicking a runner's name in the Race browser or Town search results.
      </p>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function LinkButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Open race results"
      className="cursor-pointer underline-offset-4 hover:underline"
    >
      {children}
    </button>
  )
}

/** A table value that filters the results to rows with the same value. */
function FilterButton(props: { children: React.ReactNode; onClick: () => void; active: boolean; title: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      aria-pressed={props.active}
      className="hover:bg-accent aria-pressed:bg-secondary -mx-1.5 cursor-pointer rounded px-1.5 py-0.5 underline decoration-dotted underline-offset-4"
    >
      {props.children}
    </button>
  )
}

const MAX_TOWN_OPTIONS = 8

/** " (born 1992, Zsombó)" for the optional parts of a query, or "". */
function queryDetails(q: { yob: number | null; town?: string | null }) {
  const parts = [q.yob ? `born ${q.yob}` : null, q.town || null].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

/** [value, count] pairs, most frequent first. */
function countBy<T>(values: T[]): [T, number][] {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function QuickFilters(props: {
  label: string
  options: { key: string; label: string; count: number }[]
  onPick: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground mr-1 text-xs">{props.label}:</span>
      {props.options.map((o) => (
        <Button key={o.key} variant="outline" size="sm" className="text-foreground h-7 px-2" onClick={() => props.onPick(o.key)}>
          {o.label}
          <span className="text-muted-foreground tabular-nums">{o.count}</span>
        </Button>
      ))}
    </div>
  )
}

function FilterChip({
  children,
  onClear,
  clearLabel = 'Remove filter',
}: {
  children: React.ReactNode
  onClear: () => void
  clearLabel?: string
}) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        title={clearLabel}
        className="hover:bg-background/60 rounded-sm p-0.5"
      >
        <X className="size-3" />
      </button>
    </Badge>
  )
}

function Toggle(props: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={props.id} checked={props.checked} onCheckedChange={(v) => props.onChange(v === true)} />
      <Label htmlFor={props.id} className="font-normal">
        {props.label}
      </Label>
    </div>
  )
}
