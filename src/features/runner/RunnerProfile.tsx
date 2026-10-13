import { useEffect, useState, type FormEvent } from 'react'
import { Download, Info, Loader2, Search, Square, UserRound } from 'lucide-react'
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
import { MARATHON_METRES } from '@/lib/results'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectRace } from '@/features/results/resultsSlice'
import { setTab } from '@/features/ui/uiSlice'
import { cancelRunner, searchRunner, writeHash } from './runnerActions'
import {
  selectPersonalBests,
  selectRunnerResults,
  setIncludeVirtual,
  setMergeSubLists,
} from './runnerSlice'

export function RunnerProfile() {
  const dispatch = useAppDispatch()
  const r = useAppSelector((s) => s.runner)
  const results = useAppSelector(selectRunnerResults)
  const pbs = useAppSelector(selectPersonalBests)
  const busy = r.status === 'resolving' || r.status === 'scanning'

  // Keep the URL shareable once we know who we're looking at.
  useEffect(() => {
    if (r.status === 'scanning' || r.status === 'done') writeHash(r.query)
  }, [r.status, r.query])

  const openRace = (raceId: string) => {
    dispatch(selectRace(raceId))
    dispatch(setTab('races'))
  }

  const exportCsv = () => {
    const csv = toCsv(
      ['Date', 'Race', 'Distance', 'Net time', 'Place', 'Category', 'Cat. place', 'Town', 'Club', 'Race code'],
      results.map((x) => [
        x.date,
        x.raceName,
        distanceLabel(x.distance),
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
  const years = results.map((x) => x.date.slice(0, 4)).sort()
  const towns = topValues(results.map((x) => x.town))
  const clubs = topValues(results.map((x) => x.club))

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Runner profile</CardTitle>
          <CardDescription>
            Click any runner's name in a results table, or search here. With a birth year, people who
            share a name are kept apart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* keyed so the fields follow the active profile but stay editable */}
          <SearchForm
            key={`${r.query?.name ?? ''}|${r.query?.yob ?? ''}`}
            initialName={r.query?.name ?? ''}
            initialYob={r.query?.yob ?? null}
            busy={busy}
          />
        </CardContent>
      </Card>

      {r.status === 'idle' && <EmptyState />}

      {r.status !== 'idle' && r.query && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full">
                  <UserRound className="size-6" />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <CardTitle className="text-xl">{r.query.name}</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    {r.status === 'resolving' ? (
                      <Badge variant="outline">
                        <Loader2 className="animate-spin" /> Looking up birth year…
                      </Badge>
                    ) : r.query.yob ? (
                      <Badge variant="secondary">Born {r.query.yob}</Badge>
                    ) : (
                      <Badge variant="outline">Birth year unknown</Badge>
                    )}
                    {towns.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                    {clubs.map((c) => (
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
              {r.status === 'cancelled' && (
                <p className="text-muted-foreground text-sm">Stopped. Showing what was found so far.</p>
              )}
              {!r.query.yob && r.status !== 'resolving' && (
                <Alert>
                  <Info />
                  <AlertTitle>No birth year</AlertTitle>
                  <AlertDescription>
                    Results of different people with the same name may be mixed. Add a birth year above
                    to narrow it down.
                  </AlertDescription>
                </Alert>
              )}

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Finishes" value={results.length} />
                <Stat label="Marathons" value={marathons} />
                <Stat label="First race" value={years[0] ?? '–'} />
                <Stat label="Latest race" value={years.at(-1) ?? '–'} />
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
                          <TableCell className="tabular-nums font-semibold">{pb.best.time}</TableCell>
                          <TableCell className="tabular-nums">{pb.best.date}</TableCell>
                          <TableCell className="max-w-72 truncate" title={pb.best.raceName}>
                            <RaceButton name={pb.best.raceName} onClick={() => openRace(pb.best.raceId)} />
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
                All results <Badge variant="secondary">{results.length}</Badge>
              </CardTitle>
              {r.status === 'done' && r.similarNames > 0 && (
                <CardDescription>
                  {r.similarNames} result{r.similarNames > 1 ? 's' : ''} for longer names containing “
                  {r.query.name}” were left out.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!results.length}>
                  <Download /> Download CSV
                </Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Race</TableHead>
                      <TableHead>Distance</TableHead>
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
                          <RaceButton name={x.raceName} onClick={() => openRace(x.raceId)} />
                          {x.virtual && (
                            <Badge variant="outline" className="ml-2">
                              virtual
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{distanceLabel(x.distance)}</TableCell>
                        <TableCell className="tabular-nums">{x.time}</TableCell>
                        <TableCell className="text-right tabular-nums">{x.place}</TableCell>
                        <TableCell className="tabular-nums">{x.categoryPlace}</TableCell>
                        <TableCell>{x.town}</TableCell>
                        <TableCell className="max-w-48 truncate" title={x.club}>
                          {x.club}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!results.length && !busy && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground py-10 text-center">
                          No results found.
                        </TableCell>
                      </TableRow>
                    )}
                    {!results.length && busy && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground py-10 text-center">
                          Searching…
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

function SearchForm(props: { initialName: string; initialYob: number | null; busy: boolean }) {
  const dispatch = useAppDispatch()
  const [name, setName] = useState(props.initialName)
  const [yob, setYob] = useState(props.initialYob ? String(props.initialYob) : '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const y = Number(yob)
    searchRunner(dispatch, { name: n, yob: Number.isInteger(y) && y > 1900 ? y : null })
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
      <div className="grid gap-1.5">
        <Label htmlFor="runner-name">Name</Label>
        <Input
          id="runner-name"
          value={name}
          placeholder="e.g. Hegedüs Levente"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="runner-yob">Birth year</Label>
        <Input
          id="runner-yob"
          inputMode="numeric"
          placeholder="optional"
          value={yob}
          onChange={(e) => setYob(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </div>
      <div className="flex items-end">
        {props.busy ? (
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={cancelRunner}>
            <Square /> Stop
          </Button>
        ) : (
          <Button type="submit" className="w-full sm:w-auto" disabled={!name.trim()}>
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

function RaceButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Open race results"
      className="cursor-pointer underline-offset-4 hover:underline"
    >
      {name}
    </button>
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
