import { useState, type FormEvent } from 'react'
import { Download, Info, Loader2, MapPin, Search, Square, UserRound, Users, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useT, type Messages } from '@/i18n'
import { selectRace } from '@/features/results/resultsSlice'
import { setTab } from '@/features/ui/uiSlice'
import { cancelRunner, searchRunner } from './runnerActions'
import { FavouriteButton } from '@/features/favourites/FavouriteButton'
import { sameRunner, toggleRunner } from '@/features/favourites/favouritesSlice'
import { ShareLink } from '@/routing/ShareLink'
import { RunnerLink } from './RunnerLink'
import { ProgressionChart } from './ProgressionChart'
import {
  MIN_QUERY_LENGTH,
  selectAllRunnerResults,
  selectPeople,
  selectPersonalBests,
  selectProgressions,
  selectRunnerResults,
  setFilterTown,
  setFilterYob,
  setIncludeVirtual,
  setMergeSubLists,
  type RunnerQuery,
} from './runnerSlice'

export function RunnerProfile() {
  const dispatch = useAppDispatch()
  const t = useT()
  const r = useAppSelector((s) => s.runner)
  const all = useAppSelector(selectAllRunnerResults)
  const results = useAppSelector(selectRunnerResults)
  const people = useAppSelector(selectPeople)
  const pbs = useAppSelector(selectPersonalBests)
  const progress = useAppSelector(selectProgressions)
  const busy = r.status === 'resolving' || r.status === 'scanning'
  const savedRunners = useAppSelector((s) => s.favourites.runners)
  const current = r.query ? { name: r.query.name, yob: r.query.yob ?? singleYobOf(all) } : null
  const savedCurrent = !!current && savedRunners.some((x) => sameRunner(x, current))

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
      [t.col.date, t.col.race, t.col.distance, t.col.name, t.col.birthYear, t.col.netTime, t.col.place, t.col.category, t.col.catPlace, t.col.town, t.col.club, t.col.raceCode],
      results.map((x) => [
        x.date,
        x.raceName,
        distanceLabel(x.distance, t.distance),
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
          <CardTitle>{t.runner.title}</CardTitle>
          <CardDescription>{t.runner.description(MIN_QUERY_LENGTH)}</CardDescription>
          {current && (
            <CardAction className="flex items-center gap-1">
              <FavouriteButton
                active={savedCurrent}
                addLabel={t.favourites.addRunner}
                removeLabel={t.favourites.removeRunner}
                withText
                onToggle={() => dispatch(toggleRunner(current))}
              />
              <ShareLink />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {savedRunners.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">{t.favourites.runners}</span>
              {savedRunners.map((x) => (
                <span key={`${x.name}-${x.yob ?? ''}`} className="bg-muted/60 flex items-center rounded-full border text-xs">
                  <button
                    type="button"
                    disabled={busy}
                    title={t.favourites.openRunner(x.name)}
                    className="hover:text-brand py-1 pr-1 pl-2.5 disabled:opacity-50"
                    onClick={() => searchRunner(dispatch, { name: x.name, yob: x.yob, exact: true })}
                  >
                    {x.name}
                    {x.yob ? <span className="text-muted-foreground"> · {x.yob}</span> : null}
                  </button>
                  <button
                    type="button"
                    aria-label={t.favourites.remove}
                    title={t.favourites.remove}
                    className="text-muted-foreground hover:text-foreground py-1 pr-2 pl-1"
                    onClick={() => dispatch(toggleRunner(x))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
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
            <p className="text-muted-foreground max-w-sm">{t.runner.linkIntro}</p>
            <Button variant="brand" onClick={runDraft} disabled={!draftQuery}>
              <Search />
              {draftQuery
                ? t.runner.searchAll(draftQuery.name, queryDetails(draftQuery, t))
                : t.runner.typeAtLeastName(MIN_QUERY_LENGTH)}
            </Button>
          </Card>
        ) : (
          <EmptyState text={t.runner.empty} />
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
                    {r.query.exact ? r.query.name : t.runner.resultsFor(r.query.name)}
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    {r.query.town && (
                      <Badge variant="secondary">
                        <MapPin /> {t.runner.onlyTown(r.query.town)}
                      </Badge>
                    )}
                    {r.status === 'resolving' ? (
                      <Badge variant="outline">
                        <Loader2 className="animate-spin" /> {t.runner.lookingUp}
                      </Badge>
                    ) : people > 1 ? (
                      <Badge variant="secondary">{t.runner.people(people)}</Badge>
                    ) : singleYob ? (
                      <Badge variant="secondary">{t.runner.born(singleYob)}</Badge>
                    ) : r.query.yob ? (
                      <Badge variant="secondary">{t.runner.born(r.query.yob)}</Badge>
                    ) : (
                      <Badge variant="outline">{t.runner.yobUnknown}</Badge>
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
                    <CardDescription>{t.runner.fromSource(r.source)}</CardDescription>
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
                      ? t.runner.workingOut
                      : t.runner.searching(r.done.toLocaleString('hu-HU'), r.total.toLocaleString('hu-HU'))}
                  </div>
                </div>
              )}

              {r.status === 'failed' && (
                <Alert variant="destructive">
                  <AlertTitle>{t.runner.failed}</AlertTitle>
                  <AlertDescription>{r.error}</AlertDescription>
                </Alert>
              )}
              {r.failedRaces.length > 0 && !busy && (
                <Alert>
                  <Info />
                  <AlertTitle>{t.runner.racesFailed(r.failedRaces.length)}</AlertTitle>
                  <AlertDescription className="gap-2">
                    <p>
                      {t.runner.racesFailedText(
                        r.failedRaces
                          .slice(0, 3)
                          .map((x) => `${x.name} (${x.date.slice(0, 4)})`)
                          .join(', '),
                        r.failedRaces.length - 3,
                      )}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-foreground w-fit"
                      onClick={() => r.query && searchRunner(dispatch, r.query, r.failedRaces)}
                    >
                      {t.runner.retry(r.failedRaces.length)}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {r.status === 'cancelled' && (
                <p className="text-muted-foreground text-sm">{t.common.stopped}</p>
              )}
              {people > 1 && !busy && (
                <Alert>
                  <Info />
                  <AlertTitle>{t.runner.severalTitle}</AlertTitle>
                  <AlertDescription className="gap-2">
                    <p>{t.runner.severalText}</p>
                    {yobOptions.length > 1 && (
                      <QuickFilters
                        label={t.col.birthYear}
                        options={yobOptions.map(([v, n]) => ({ key: v, label: v === 'unknown' ? t.runner.unknown : v, count: n }))}
                        onPick={(v) => dispatch(setFilterYob(v === 'unknown' ? 'unknown' : Number(v)))}
                      />
                    )}
                    {townOptions.length > 1 && (
                      <QuickFilters
                        label={t.col.town}
                        options={townOptions.map(([v, n]) => ({ key: v, label: v || t.runner.noTown, count: n }))}
                        onPick={(v) => dispatch(setFilterTown(v))}
                      />
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t.runner.statFinishes} value={results.length} />
                <Stat label={t.runner.statMarathons} value={marathons} />
                <Stat label={t.runner.statFirst} value={yearsRun[0] ?? '–'} />
                <Stat label={t.runner.statLatest} value={yearsRun.at(-1) ?? '–'} />
              </dl>

              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <Toggle
                  id="r-merge"
                  checked={r.mergeSubLists}
                  onChange={(v) => dispatch(setMergeSubLists(v))}
                  label={t.runner.mergeSubLists}
                />
                <Toggle
                  id="r-virtual"
                  checked={r.includeVirtual}
                  onChange={(v) => dispatch(setIncludeVirtual(v))}
                  label={t.runner.includeVirtual}
                />
              </div>
            </CardContent>
          </Card>

          {pbs.length > 0 && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>{t.runner.pbTitle}</CardTitle>
                <CardDescription>{t.runner.pbDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.col.distance}</TableHead>
                        <TableHead>{t.col.time}</TableHead>
                        <TableHead>{t.col.date}</TableHead>
                        <TableHead>{t.col.race}</TableHead>
                        <TableHead className="text-right">{t.col.place}</TableHead>
                        <TableHead className="text-right">{t.col.runs}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pbs.map((pb) => (
                        <TableRow key={pb.label}>
                          <TableCell className="font-medium">{distanceLabel(pb.distance, t.distance)}</TableCell>
                          <TableCell className="font-semibold tabular-nums">{pb.best.time}</TableCell>
                          <TableCell className="tabular-nums">{pb.best.date}</TableCell>
                          <TableCell className="max-w-72 truncate" title={pb.best.raceName}>
                            <LinkButton title={t.common.openRace} onClick={() => openRace(pb.best.raceId)}>{pb.best.raceName}</LinkButton>
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

          {progress.length > 0 && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>{t.runner.progressTitle}</CardTitle>
                <CardDescription>{t.runner.progressDescription}</CardDescription>
              </CardHeader>
              {/* two charts per row on wide screens; a lone chart gets the full width */}
              <CardContent className={progress.length > 1 ? 'grid gap-6 lg:grid-cols-2' : 'grid gap-6'}>
                {progress.map((p) => {
                  const label = distanceLabel(p.distance, t.distance)
                  return (
                    <section key={p.key} className="flex min-w-0 flex-col gap-2">
                      <h3 className="text-primary text-sm font-semibold">
                        {label} <span className="text-muted-foreground font-normal">· {t.runner.races(p.points.length)}</span>
                      </h3>
                      <ProgressionChart
                        progression={p}
                        labels={{
                          pb: t.runner.pb,
                          faster: t.runner.faster,
                          place: t.runner.placeN,
                          ariaLabel: `${t.runner.progressTitle}: ${label}`,
                        }}
                      />
                    </section>
                  )
                })}
              </CardContent>
            </Card>
          )}

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t.runner.results} <Badge variant="brand">{results.length}</Badge>
              </CardTitle>
              {r.status === 'done' && r.similarNames > 0 && (
                <CardDescription>{t.runner.similarLeftOut(r.similarNames, r.query.name)}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!results.length}>
                  <Download /> {t.common.downloadCsv}
                </Button>
                {r.query.town && (
                  <FilterChip
                    onClear={() => r.query && searchRunner(dispatch, { ...r.query, town: null })}
                    clearLabel={t.runner.searchWithoutTown}
                  >
                    <MapPin /> {t.runner.townChip(r.query.town)}
                  </FilterChip>
                )}
                {r.filterYob !== null && (
                  <FilterChip onClear={() => dispatch(setFilterYob(null))} clearLabel={t.common.removeFilter}>
                    {t.runner.born(r.filterYob === 'unknown' ? t.runner.unknown : r.filterYob)}
                  </FilterChip>
                )}
                {r.filterTown !== null && (
                  <FilterChip onClear={() => dispatch(setFilterTown(null))} clearLabel={t.common.removeFilter}>
                    {r.filterTown || t.runner.noTownChip}
                  </FilterChip>
                )}
                {filtered && (
                  <span className="text-muted-foreground text-xs">
                    {t.runner.shown(results.length, all.length)}
                  </span>
                )}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.col.date}</TableHead>
                      <TableHead>{t.col.race}</TableHead>
                      <TableHead>{t.col.distance}</TableHead>
                      {showName && <TableHead>{t.col.name}</TableHead>}
                      {showYob && <TableHead>{t.col.born}</TableHead>}
                      <TableHead>{t.col.netTime}</TableHead>
                      <TableHead className="text-right">{t.col.place}</TableHead>
                      <TableHead>{t.col.catPlace}</TableHead>
                      <TableHead>{t.col.town}</TableHead>
                      <TableHead>{t.col.club}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((x, i) => (
                      <TableRow key={`${x.raceId}-${i}`}>
                        <TableCell className="tabular-nums">{x.date}</TableCell>
                        <TableCell className="max-w-72 truncate" title={x.raceName}>
                          <LinkButton title={t.common.openRace} onClick={() => openRace(x.raceId)}>{x.raceName}</LinkButton>
                          {x.virtual && (
                            <Badge variant="outline" className="ml-2">
                              {t.runner.virtual}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{distanceLabel(x.distance, t.distance)}</TableCell>
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
                              title={t.runner.showOnlyYob}
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
                              title={t.common.showOnlyTown}
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
                          {busy ? t.runner.searchingShort : t.runner.noneFound}
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
  const t = useT()
  const tooShort = !props.canSubmit

  const submit = (e: FormEvent) => {
    e.preventDefault()
    props.onSubmit()
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_9rem_11rem_auto]">
      <div className="grid gap-1.5">
        <Label htmlFor="runner-name">{t.col.name}</Label>
        <Input
          id="runner-name"
          value={name}
          placeholder={t.runner.namePlaceholder}
          aria-describedby="runner-name-hint"
          onChange={(e) => props.onChange({ name: e.target.value })}
        />
        <p id="runner-name-hint" className="text-muted-foreground text-xs">
          {name.trim() && tooShort
            ? t.runner.typeAtLeast(MIN_QUERY_LENGTH)
            : t.runner.nameHint}
        </p>
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="runner-yob">{t.col.birthYear}</Label>
        <Input
          id="runner-yob"
          inputMode="numeric"
          placeholder={t.runner.optional}
          value={yob}
          onChange={(e) => props.onChange({ yob: e.target.value.replace(/\D/g, '').slice(0, 4) })}
        />
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="runner-town">{t.col.town}</Label>
        <Input
          id="runner-town"
          placeholder={t.runner.townPlaceholder}
          aria-describedby="runner-town-hint"
          value={town}
          onChange={(e) => props.onChange({ town: e.target.value })}
        />
        <p id="runner-town-hint" className="text-muted-foreground text-xs">
          {t.runner.townHint}
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
            <Square /> {t.common.stop}
          </Button>
        ) : (
          <Button key="submit" type="submit" variant="brand" className="w-full sm:w-auto" disabled={tooShort}>
            <Search /> {t.runner.find}
          </Button>
        )}
      </div>
    </form>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="text-muted-foreground items-center justify-center py-20 text-center text-sm">
      <UserRound className="size-8 opacity-50" />
      <p className="max-w-sm">{text}</p>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-primary text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function LinkButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-primary decoration-brand cursor-pointer decoration-2 underline-offset-4 hover:underline"
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
      className="hover:bg-accent aria-pressed:bg-secondary decoration-brand -mx-1.5 cursor-pointer rounded px-1.5 py-0.5 underline decoration-dotted decoration-2 underline-offset-4"
    >
      {props.children}
    </button>
  )
}

const MAX_TOWN_OPTIONS = 8

/** " (born 1992, Zsombó)" for the optional parts of a query, or "". */
function queryDetails(q: { yob: number | null; town?: string | null }, t: Messages) {
  const parts = [q.yob ? t.runner.bornDetail(q.yob) : null, q.town || null].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

/** [value, count] pairs, most frequent first. */
/** The one birth year behind the current results, when they're all the same person. */
function singleYobOf(rows: { yob: number | null }[]): number | null {
  const years = new Set(rows.map((x) => x.yob))
  return years.size === 1 ? ([...years][0] ?? null) : null
}

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
  clearLabel,
}: {
  children: React.ReactNode
  onClear: () => void
  clearLabel: string
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
