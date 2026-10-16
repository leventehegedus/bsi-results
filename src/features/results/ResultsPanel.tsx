import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CornerDownLeft, Download, FileDown, Loader2, X } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { certificateUrl, getAllResults } from '@/api/futanet'
import type { ResultFilters, ResultRow } from '@/api/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cleanTime } from '@/lib/results'
import { cn } from '@/lib/utils'
import { formatPace, pacePerKm } from '@/lib/pace'
import { formatFade, runnerSplits, splitPoints, type SplitPoint } from '@/lib/splits'
import { downloadCsv, toCsv } from '@/lib/csv'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setFilters, setPage, setView } from './resultsSlice'
import { skipToken } from '@reduxjs/toolkit/query'
import { useRaceDetailsQuery, useRaceQuery, useResultPageQuery } from '@/api/futanetApi'
import { RunnerLink } from '@/features/runner/RunnerLink'
import { FavouriteButton } from '@/features/favourites/FavouriteButton'
import { toggleRace } from '@/features/favourites/favouritesSlice'
import { ShareLink } from '@/routing/ShareLink'
import { RaceBreakdown } from './RaceBreakdown'
import { RaceSplits } from './RaceSplits'
import { RaceWeather } from '@/features/weather/RaceWeather'
import { useLang, useT, type Messages } from '@/i18n'

const ANY = '__any__'
/** Wait for a pause in typing before querying the API. */
const TYPE_DELAY_MS = 300
const FALLBACK_COLUMNS = ['hely', 'nev', 'kategoria', 'kat_hely', 'netto', 'brutto', 'varos', 'egyesulet', 'rajtszam']
/** Headers for when the API's field list is missing. */
const fallbackHeaders = (t: Messages): Record<string, string> => ({
  hely: t.col.rank,
  nev: t.col.name,
  kategoria: t.col.category,
  kat_hely: t.col.catRank,
  netto: t.col.netTime,
  brutto: t.col.gunTime,
  varos: t.col.town,
  egyesulet: t.col.club,
  rajtszam: t.col.bib,
  orszag: t.col.country,
})

export function ResultsPanel() {
  const dispatch = useAppDispatch()
  const t = useT()
  const lang = useLang()
  const { raceId, filters, page, view } = useAppSelector((s) => s.results)
  const favouriteRace = useAppSelector((s) => s.favourites.races.some((r) => r.id === raceId))
  // Cached per race / per (race, page, filters): going back to a race or page is instant,
  // and a newer filter simply switches to another cache entry.
  const metaQuery = useRaceQuery(raceId ?? skipToken)
  const detailsQuery = useRaceDetailsQuery(raceId ?? skipToken)
  const pageQuery = useResultPageQuery(raceId ? { raceId, page, filters } : skipToken)
  // The panel is keyed by race, so the form starts over for every race — from the
  // filters in the URL when a shared link brought us here, otherwise empty.
  const [form, setForm] = useState<ResultFilters>(filters)
  const [exporting, setExporting] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // the place a jump asked for: its row is highlighted and scrolled to once the page is in
  const [targetPlace, setTargetPlace] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const r = {
    raceId,
    filters,
    page,
    meta: metaQuery.data ?? null,
    metaStatus: metaQuery.isLoading ? 'loading' : metaQuery.isError ? 'failed' : 'succeeded',
    fields: detailsQuery.data?.fields ?? [],
    categories: detailsQuery.data?.categories ?? [],
    countries: detailsQuery.data?.countries ?? [],
    // while a new page/filter loads, the previous rows stay visible (dimmed)
    rows: pageQuery.data?.data ?? [],
    total: pageQuery.data?.meta.total ?? 0,
    lastPage: pageQuery.data?.meta.last_page ?? 1,
    perPage: pageQuery.data?.meta.per_page || 40,
    view,
    status: pageQuery.isError ? 'failed' : pageQuery.isFetching ? 'loading' : pageQuery.isSuccess ? 'succeeded' : 'idle',
    error: pageQuery.error && 'message' in pageQuery.error ? pageQuery.error.message : null,
  }

  if (!r.raceId) {
    return (
      <Card className="text-muted-foreground min-w-0 items-center justify-center px-6 py-24 text-center text-sm">
        {t.results.pickRace}
      </Card>
    )
  }

  const columns = r.fields.length
    ? r.fields.map((f) => ({
        key: f.mezo,
        label: (lang === 'hu' ? f.header_hu || f.header_en : f.header_en || f.header_hu) || f.mezo,
      }))
    : (r.rows[0] ? Object.keys(r.rows[0]).filter((k) => k !== 'race') : FALLBACK_COLUMNS).map((k) => ({
        key: k,
        label: fallbackHeaders(t)[k] ?? k,
      }))
  // Pace (from the net time and the race distance) goes right after the net time.
  const distance = r.meta?.tav ?? 0
  const netIndex = columns.findIndex((c) => c.key === 'netto')
  if (distance > 0 && netIndex >= 0) columns.splice(netIndex + 1, 0, { key: PACE_KEY, label: t.col.pace })
  // Intermediate times let every row show how much it slowed down after the first segment.
  const points = splitPoints(r.fields, distance)
  const hasSplits = points.length > 0 && distance > 0
  const fadeIndex = columns.findIndex((c) => c.key === PACE_KEY)
  if (hasSplits && fadeIndex >= 0) columns.splice(fadeIndex + 1, 0, { key: FADE_KEY, label: t.splits.fade })
  // The API only has certificates for races with a template, and only per bib number.
  if (r.meta?.oklevel) columns.push({ key: CERT_KEY, label: t.col.certificate })
  /** A cell's text, for the table and the CSV. */
  const cellText = (row: ResultRow, key: string) =>
    key === PACE_KEY
      ? formatPace(pacePerKm(row.netto, distance))
      : key === FADE_KEY
        ? formatFade(runnerSplits(row, points, distance)?.fade ?? null)
        : display(row, key)

  // the card headline already carries these
  const CARD_HEADLINE = new Set(['hely', 'nev', 'netto', 'brutto', 'kategoria', 'rajtszam'])
  const cardFields = columns.filter((c) => !CARD_HEADLINE.has(c.key))

  /** A cell's contents: plain text, or the links and buttons some columns carry. */
  const cellContent = (row: ResultRow, key: string) => {
    if (key === FADE_KEY) return <FadeCell row={row} points={points} distance={distance} hint={t.splits.rowHint} />
    if (key === CERT_KEY)
      return <CertificateLink raceId={r.raceId!} bib={row.rajtszam ?? null} name={display(row, 'nev')} t={t} />
    if (key === 'varos' && row.varos)
      return (
        <button
          type="button"
          title={t.common.showOnlyTown}
          className="hover:bg-accent decoration-brand -mx-1.5 cursor-pointer rounded px-1.5 py-0.5 underline decoration-dotted decoration-2 underline-offset-4"
          onClick={() => filterTown(String(row.varos))}
        >
          {display(row, 'varos')}
        </button>
      )
    if (key === 'nev')
      return (
        <RunnerLink
          name={display(row, 'nev')}
          raceId={r.raceId!}
          raceName={r.meta?.nev}
          place={typeof row.hely === 'number' ? row.hely : null}
          bib={row.rajtszam ?? null}
        />
      )
    return cellText(row, key)
  }

  /** Jump straight to a page, clamped to the ones that exist. */
  const goToPage = (page: number) => {
    setTargetPlace(null)
    dispatch(setPage(Math.min(r.lastPage, Math.max(1, page))))
  }

  /**
   * Jump to the page a finishing place sits on. Only exact while the list is in
   * place order, which is how the API returns it; the row is then highlighted.
   */
  const goToPlace = (place: number) => {
    setTargetPlace(place)
    dispatch(setPage(Math.min(r.lastPage, Math.max(1, Math.ceil(place / r.perPage)))))
  }

  /** Update the filters (back to page 1), right away or after `delay` ms. */
  const apply = (next: ResultFilters, delay = 0) => {
    setForm(next)
    setTargetPlace(null)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => dispatch(setFilters(next)), delay)
  }
  const setFilter = (key: keyof ResultFilters, value: string | undefined, delay = 0) =>
    apply({ ...form, [key]: value || undefined }, delay)
  const filterTown = (town: string) => setFilter('town', town)
  const hasFilters = Object.values(form).some((v) => v != null && v.trim() !== '')
  // what the collapsed panel hides, for the count on its button
  const activeExtraFilters = Object.entries(form).filter(
    ([k, v]) => k !== 'name' && v != null && v.trim() !== '',
  ).length

  const exportCsv = async () => {
    if (!r.raceId) return
    setExporting(true)
    try {
      const rows = await getAllResults(r.raceId, r.filters)
      // the certificate column is a download link, not data
      const csvColumns = columns.filter((c) => c.key !== CERT_KEY)
      const csv = toCsv(
        csvColumns.map((c) => c.label),
        rows.map((row) => csvColumns.map((c) => cellText(row, c.key))),
      )
      downloadCsv(`${r.raceId}.csv`, csv)
    } finally {
      setExporting(false)
    }
  }

  const clearButton = (key: keyof ResultFilters, label: string) =>
    form[key] ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2"
        onClick={() => setFilter(key, undefined)}
        aria-label={t.results.clearFilter(label)}
      >
        <X />
      </Button>
    ) : null

  const textInput = (key: keyof ResultFilters, label: string, placeholder?: string, numeric = false) => (
    <div className="relative">
      <Input
        id={`f-${key}`}
        aria-label={label}
        placeholder={placeholder}
        inputMode={numeric ? 'numeric' : undefined}
        className="pr-9"
        value={form[key] ?? ''}
        onChange={(e) => setFilter(key, e.target.value, TYPE_DELAY_MS)}
      />
      {clearButton(key, label)}
    </div>
  )

  const field = (key: keyof ResultFilters, label: string, placeholder?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${key}`}>{label}</Label>
      {textInput(key, label, placeholder)}
    </div>
  )

  /** A from–to pair, e.g. birth year 1980–1989. */
  const range = (
    label: string,
    [minKey, maxKey]: [keyof ResultFilters, keyof ResultFilters],
    [minHint, maxHint]: [string, string],
    numeric = true,
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${minKey}`}>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        {textInput(minKey, t.results.rangeFrom(label), minHint, numeric)}
        {textInput(maxKey, t.results.rangeTo(label), maxHint, numeric)}
      </div>
    </div>
  )

  const select = (key: keyof ResultFilters, label: string, options: { value: string; label: string }[]) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Select value={form[key] ?? ANY} onValueChange={(v) => setFilter(key, v === ANY ? undefined : v)}>
          <SelectTrigger className={form[key] ? 'w-full pr-14' : 'w-full'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t.common.any}</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form[key] && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground absolute top-1/2 right-7 size-7 -translate-y-1/2"
            onClick={() => setFilter(key, undefined)}
            aria-label={t.results.clearFilter(label)}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <Card className="min-w-0">
      <CardHeader>
        {r.metaStatus === 'loading' && !r.meta ? (
          <Skeleton className="h-6 w-2/3" />
        ) : (
          <CardTitle className="text-lg">{r.meta?.nev ?? r.raceId}</CardTitle>
        )}
        <CardAction className="flex items-center gap-1">
          <FavouriteButton
            active={favouriteRace}
            addLabel={t.favourites.addRace}
            removeLabel={t.favourites.removeRace}
            onToggle={() =>
              dispatch(
                toggleRace({
                  id: r.raceId!,
                  name: r.meta?.nev ?? r.raceId!,
                  date: (r.meta?.datum ?? '').slice(0, 10),
                }),
              )
            }
          />
          <ShareLink />
        </CardAction>
        <CardDescription className="flex flex-wrap items-center gap-2">
          {r.meta?.datum && <Badge variant="secondary">{r.meta.datum.slice(0, 10)}</Badge>}
          {!!r.meta?.tav && <Badge>{(r.meta.tav / 1000).toLocaleString('hu-HU')} km</Badge>}
          {r.meta && <Badge variant="brand">{t.results.finishers(r.meta.meret.toLocaleString('hu-HU'))}</Badge>}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs value={r.view} onValueChange={(v) => dispatch(setView(v as typeof r.view))} className="gap-5">
          <TabsList>
            <TabsTrigger value="results">{t.breakdown.views.results}</TabsTrigger>
            <TabsTrigger value="breakdown">{t.breakdown.views.breakdown}</TabsTrigger>
            {/* also when a shared link opens the splits of a race without them, so the active tab shows */}
            {(hasSplits || r.view === 'splits') && <TabsTrigger value="splits">{t.breakdown.views.splits}</TabsTrigger>}
            <TabsTrigger value="weather">{t.breakdown.views.weather}</TabsTrigger>
          </TabsList>
          {/* keyed by race so start-time / place corrections are re-read per race */}
          <TabsContent value="weather">
            {raceId && r.meta && <RaceWeather key={raceId} raceId={raceId} meta={r.meta} />}
          </TabsContent>
          {/* the breakdown loads every finisher, so it's only mounted (and fetched) when opened */}
          <TabsContent value="breakdown">{raceId && <RaceBreakdown raceId={raceId} />}</TabsContent>
          {/* also loads every finisher, so it only mounts when opened */}
          <TabsContent value="splits">{raceId && <RaceSplits raceId={raceId} />}</TabsContent>
          <TabsContent value="results" className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              {field('name', t.col.name)}
              {/* On a phone the other nine fields push the results off the screen, so they fold away. */}
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="hover:bg-accent group -mx-2 flex w-[calc(100%+1rem)] items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors sm:hidden"
                  >
                    <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                    <span className="font-medium">{t.results.moreFilters}</span>
                    {activeExtraFilters > 0 && <Badge variant="brand">{activeExtraFilters}</Badge>}
                  </button>
                </CollapsibleTrigger>
                {/* from sm up the fields are always shown; only the phone layout collapses */}
                <CollapsibleContent className="data-[state=closed]:hidden sm:!block" forceMount>
                  <div className="grid gap-3 pt-3 sm:grid-cols-2 sm:pt-0 lg:grid-cols-3">
                {field('town', t.col.town, t.results.townHint)}
                {field('club', t.col.club)}
                {field('bib', t.col.bib)}
                {select(
                  'category',
                  t.col.category,
                  r.categories.map((c) => ({ value: c, label: c })),
                )}
                {/* the API's codes: F = férfi, N = nő */}
                {select('sex', t.results.gender, [
                  { value: 'F', label: t.results.men },
                  { value: 'N', label: t.results.women },
                ])}
                {select(
                  'country',
                  t.col.country,
                  r.countries.map((c) => ({ value: c.value, label: `${c.text} (${c.value})` })),
                )}
                {range(t.results.netTimeRange, ['minNetTime', 'maxNetTime'], [t.common.from, t.common.to], false)}
                {range(t.col.birthYear, ['minYob', 'maxYob'], [t.common.from, t.common.to])}
                {range(t.col.place, ['minPlace', 'maxPlace'], [t.common.from, t.common.to])}
                  </div>
                </CollapsibleContent>
              </Collapsible>
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" disabled={!hasFilters} onClick={() => apply({})}>
                  <X />
                  {t.results.clearAll}
                </Button>
              </div>
            </div>

            {r.status === 'failed' && (
              <Alert variant="destructive">
                <AlertTitle>{t.results.loadFailed}</AlertTitle>
                <AlertDescription>{r.error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {r.status === 'loading' ? t.results.loading : t.results.count(r.total.toLocaleString('hu-HU'))}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {r.lastPage > 1 && (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const place = Number(new FormData(e.currentTarget).get('place'))
                      if (Number.isInteger(place) && place > 0) goToPlace(place)
                    }}
                  >
                    <Label htmlFor="jump-place" className="text-muted-foreground text-xs font-normal">
                      {t.results.jumpToPlace}
                    </Label>
                    <Input
                      id="jump-place"
                      name="place"
                      inputMode="numeric"
                      className="h-8 w-20"
                      placeholder={t.results.placePlaceholder}
                    />
                    <Button type="submit" variant="outline" size="icon" className="size-8" aria-label={t.results.go}>
                      <CornerDownLeft />
                    </Button>
                  </form>
                )}
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || !r.total}>
                  {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={t.results.prevPage}
                  disabled={r.page <= 1 || r.status === 'loading'}
                  onClick={() => dispatch(setPage(r.page - 1))}
                >
                  <ChevronLeft />
                </Button>
                <span className="flex items-center gap-1 tabular-nums">
                  <PageInput page={r.page} lastPage={r.lastPage} label={t.results.pageNumber} onGo={goToPage} />
                  <span className="text-muted-foreground">/ {r.lastPage}</span>
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={t.results.nextPage}
                  disabled={r.page >= r.lastPage || r.status === 'loading'}
                  onClick={() => dispatch(setPage(r.page + 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            {/* phones get the cards below instead: 10+ columns can't be read sideways */}
            <div className="hidden rounded-md border sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => (
                      <TableHead key={c.key} className={cn(headClass(c.key), stickyClass(c.key))}>
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.status === 'loading' && r.rows.length === 0
                    ? Array.from({ length: 8 }, (_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={columns.length}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    : r.rows.map((row, i) => (
                        <TableRow
                          key={`${row.rajtszam ?? ''}-${i}`}
                          ref={row.hely === targetPlace ? scrollIntoView : undefined}
                          className={cn(
                            'group/row',
                            r.status === 'loading' && 'opacity-50',
                            row.hely === targetPlace && 'outline-brand bg-brand/10 outline-2 -outline-offset-2',
                          )}
                        >
                          {columns.map((c) => (
                            <TableCell
                              key={c.key}
                              className={cn(
                                isNumericCol(c.key) ? 'tabular-nums' : c.key === CERT_KEY ? 'text-center' : '',
                                stickyClass(c.key),
                                // the sticky cells need their own background, and the row's hover colour
                                stickyClass(c.key) && 'bg-card group-hover/row:bg-muted/50',
                              )}
                            >
                              {cellContent(row, c.key)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  {r.status === 'succeeded' && r.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-muted-foreground py-10 text-center">
                        {t.results.none}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <ul className="flex flex-col gap-2 sm:hidden">
              {r.status === 'loading' && r.rows.length === 0
                ? Array.from({ length: 6 }, (_, i) => (
                    <li key={i} className="rounded-md border p-3">
                      <Skeleton className="h-12 w-full" />
                    </li>
                  ))
                : r.rows.map((row, i) => (
                    <li
                      key={`${row.rajtszam ?? ''}-${i}`}
                      className={cn('rounded-md border p-3', r.status === 'loading' && 'opacity-50')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium break-words">{cellContent(row, 'nev')}</div>
                          <div className="text-muted-foreground mt-0.5 text-xs">
                            {[display(row, 'kategoria'), row.rajtszam ? `#${row.rajtszam}` : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-lg leading-none font-semibold tabular-nums">
                            {cellText(row, 'netto') || cellText(row, 'brutto')}
                          </div>
                          {row.hely != null && (
                            <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                              {t.results.placeShort(String(row.hely))}
                            </div>
                          )}
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        {cardFields.map((c) => {
                          const value = cellContent(row, c.key)
                          if (value === '' || value == null) return null
                          return (
                            <div key={c.key} className="flex min-w-0 items-baseline gap-1.5">
                              <dt className="text-muted-foreground shrink-0">{c.label}</dt>
                              <dd className={cn('min-w-0 truncate', isNumericCol(c.key) && 'tabular-nums')}>{value}</dd>
                            </div>
                          )
                        })}
                      </dl>
                    </li>
                  ))}
              {r.status === 'succeeded' && r.rows.length === 0 && (
                <li className="text-muted-foreground rounded-md border py-10 text-center text-sm">
                  {t.results.none}
                </li>
              )}
            </ul>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function display(row: ResultRow, key: string) {
  const v = row[key]
  if (v == null) return ''
  if (typeof v === 'string' && /^\d{2}:\d{2}:\d{2}\.\d+$/.test(v)) return cleanTime(v)
  return String(v)
}

/** Rank and name stay put while the rest of a wide table scrolls sideways. */
function stickyClass(key: string) {
  if (key === 'hely') return 'sticky left-0 z-20 w-16'
  if (key === 'nev') return 'sticky left-16 z-20 shadow-[1px_0_0_var(--border)]'
  return ''
}

function headClass(key: string) {
  return cn(key === CERT_KEY && 'text-center', stickyClass(key) && 'bg-table-head')
}

/** Brings the row a jump asked for into view. */
function scrollIntoView(el: HTMLTableRowElement | null) {
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/** The page number, typed straight in. Commits on Enter or when it loses focus. */
function PageInput(props: { page: number; lastPage: number; label: string; onGo: (page: number) => void }) {
  const [draft, setDraft] = useState(String(props.page))
  const [shownFor, setShownFor] = useState(props.page)
  // follow the page when something else changes it (the arrows, a new filter)
  if (shownFor !== props.page) {
    setShownFor(props.page)
    setDraft(String(props.page))
  }
  const commit = () => {
    const n = Number(draft)
    if (Number.isInteger(n) && n > 0) props.onGo(n)
    else setDraft(String(props.page))
  }
  return (
    <input
      aria-label={props.label}
      inputMode="numeric"
      value={draft}
      size={Math.max(2, String(props.lastPage).length)}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      className="border-input focus-visible:ring-ring h-8 rounded-md border bg-transparent px-2 text-center tabular-nums focus-visible:ring-2 focus-visible:outline-none"
    />
  )
}

/** Computed columns: not fields of the API's rows. */
const PACE_KEY = '__pace'
const FADE_KEY = '__fade'
const CERT_KEY = '__certificate'

/** How much this finisher slowed down after the first segment; blank without split times. */
function FadeCell(props: { row: ResultRow; points: SplitPoint[]; distance: number; hint: string }) {
  const fade = runnerSplits(props.row, props.points, props.distance)?.fade ?? null
  if (fade === null) return <span className="text-muted-foreground">–</span>
  return (
    <span
      title={props.hint}
      className="font-medium"
      style={{ color: fade >= 0 ? 'var(--chart-slower)' : 'var(--chart-faster)' }}
    >
      {formatFade(fade)}
    </span>
  )
}

/** Downloads the finisher's certificate; needs a bib number, which a few rows lack. */
function CertificateLink(props: { raceId: string; bib: string | null; name: string; t: Messages }) {
  const { bib, t } = props
  if (!bib) return <span className="text-muted-foreground">–</span>
  return (
    <a
      href={certificateUrl(props.raceId, bib)}
      download={`oklevel-${props.raceId}-${bib}.pdf`}
      target="_blank"
      rel="noopener"
      title={t.results.certificateFor(props.name)}
      aria-label={t.results.certificateFor(props.name)}
      className="hover:bg-accent text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded transition-colors"
    >
      <FileDown className="size-4" />
    </a>
  )
}

function isNumericCol(key: string) {
  return (
    key === 'hely' ||
    key === 'netto' ||
    key === 'brutto' ||
    key === PACE_KEY ||
    key === FADE_KEY ||
    key.startsWith('reszido')
  )
}
