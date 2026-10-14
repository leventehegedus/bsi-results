import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react'
import { getAllResults } from '@/api/futanet'
import type { ResultFilters, ResultRow } from '@/api/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { formatPace, pacePerKm } from '@/lib/pace'
import { downloadCsv, toCsv } from '@/lib/csv'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setFilters, setPage } from './resultsSlice'
import { skipToken } from '@reduxjs/toolkit/query'
import { useRaceDetailsQuery, useRaceQuery, useResultPageQuery } from '@/api/futanetApi'
import { RunnerLink } from '@/features/runner/RunnerLink'
import { RaceBreakdown } from './RaceBreakdown'
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
  const { raceId, filters, page } = useAppSelector((s) => s.results)
  // Cached per race / per (race, page, filters): going back to a race or page is instant,
  // and a newer filter simply switches to another cache entry.
  const metaQuery = useRaceQuery(raceId ?? skipToken)
  const detailsQuery = useRaceDetailsQuery(raceId ?? skipToken)
  const pageQuery = useResultPageQuery(raceId ? { raceId, page, filters } : skipToken)
  // the panel is keyed by race, so the form starts empty for every race
  const [form, setForm] = useState<ResultFilters>({})
  const [exporting, setExporting] = useState(false)
  const [view, setView] = useState<'results' | 'breakdown' | 'weather'>('results')
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
  /** A cell's text, for the table and the CSV. */
  const cellText = (row: ResultRow, key: string) =>
    key === PACE_KEY ? formatPace(pacePerKm(row.netto, distance)) : display(row, key)

  /** Update the filters (back to page 1), right away or after `delay` ms. */
  const apply = (next: ResultFilters, delay = 0) => {
    setForm(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => dispatch(setFilters(next)), delay)
  }
  const setFilter = (key: keyof ResultFilters, value: string | undefined, delay = 0) =>
    apply({ ...form, [key]: value || undefined }, delay)
  const filterTown = (town: string) => setFilter('town', town)
  const hasFilters = Object.values(form).some((v) => v != null && v.trim() !== '')

  const exportCsv = async () => {
    if (!r.raceId) return
    setExporting(true)
    try {
      const rows = await getAllResults(r.raceId, r.filters)
      const csv = toCsv(
        columns.map((c) => c.label),
        rows.map((row) => columns.map((c) => cellText(row, c.key))),
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
        <CardDescription className="flex flex-wrap items-center gap-2">
          {r.meta?.datum && <Badge variant="secondary">{r.meta.datum.slice(0, 10)}</Badge>}
          {!!r.meta?.tav && <Badge>{(r.meta.tav / 1000).toLocaleString('hu-HU')} km</Badge>}
          {r.meta && <Badge variant="brand">{t.results.finishers(r.meta.meret.toLocaleString('hu-HU'))}</Badge>}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="gap-5">
          <TabsList>
            <TabsTrigger value="results">{t.breakdown.views.results}</TabsTrigger>
            <TabsTrigger value="breakdown">{t.breakdown.views.breakdown}</TabsTrigger>
            <TabsTrigger value="weather">{t.breakdown.views.weather}</TabsTrigger>
          </TabsList>
          {/* keyed by race so start-time / place corrections are re-read per race */}
          <TabsContent value="weather">
            {raceId && r.meta && <RaceWeather key={raceId} raceId={raceId} meta={r.meta} />}
          </TabsContent>
          {/* the breakdown loads every finisher, so it's only mounted (and fetched) when opened */}
          <TabsContent value="breakdown">{raceId && <RaceBreakdown raceId={raceId} />}</TabsContent>
          <TabsContent value="results" className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              {field('name', t.col.name)}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="flex items-center gap-2">
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
                <span className="tabular-nums">
                  {r.page} / {r.lastPage}
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

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
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
                        <TableRow key={`${row.rajtszam ?? ''}-${i}`} className={r.status === 'loading' ? 'opacity-50' : ''}>
                          {columns.map((c) => (
                            <TableCell key={c.key} className={isNumericCol(c.key) ? 'tabular-nums' : ''}>
                              {c.key === 'varos' && row.varos ? (
                                <button
                                  type="button"
                                  title={t.common.showOnlyTown}
                                  className="hover:bg-accent decoration-brand -mx-1.5 cursor-pointer rounded px-1.5 py-0.5 underline decoration-dotted decoration-2 underline-offset-4"
                                  onClick={() => filterTown(String(row.varos))}
                                >
                                  {display(row, 'varos')}
                                </button>
                              ) : c.key === 'nev' ? (
                                <RunnerLink
                                  name={display(row, 'nev')}
                                  raceId={r.raceId!}
                                  raceName={r.meta?.nev}
                                  place={typeof row.hely === 'number' ? row.hely : null}
                                  bib={row.rajtszam ?? null}
                                />
                              ) : (
                                cellText(row, c.key)
                              )}
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

/** Computed column: not a field of the API's rows. */
const PACE_KEY = '__pace'

function isNumericCol(key: string) {
  return key === 'hely' || key === 'netto' || key === 'brutto' || key === PACE_KEY || key.startsWith('reszido')
}
