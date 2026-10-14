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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cleanTime } from '@/lib/results'
import { downloadCsv, toCsv } from '@/lib/csv'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchResults, loadRace, setFilters } from './resultsSlice'
import { RunnerLink } from '@/features/runner/RunnerLink'

const ANY = '__any__'
/** Wait for a pause in typing before querying the API. */
const TYPE_DELAY_MS = 300
const FALLBACK_COLUMNS = ['hely', 'nev', 'kategoria', 'kat_hely', 'netto', 'brutto', 'varos', 'egyesulet', 'rajtszam']
const FALLBACK_HEADERS: Record<string, string> = {
  hely: 'Rank',
  nev: 'Name',
  kategoria: 'Category',
  kat_hely: 'Cat. rank',
  netto: 'Net time',
  brutto: 'Gun time',
  varos: 'Town',
  egyesulet: 'Club',
  rajtszam: 'Bib',
  orszag: 'Country',
}

export function ResultsPanel() {
  const dispatch = useAppDispatch()
  const r = useAppSelector((s) => s.results)
  const [form, setForm] = useState<ResultFilters>({})
  const [exporting, setExporting] = useState(false)
  /** the in-flight results request, aborted when a newer filter replaces it */
  const pending = useRef<{ abort: () => void } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!r.raceId) return
    setForm({})
    const a = dispatch(loadRace(r.raceId))
    pending.current = dispatch(fetchResults(1))
    return () => {
      window.clearTimeout(timer.current)
      a.abort()
      pending.current?.abort()
    }
  }, [dispatch, r.raceId])

  if (!r.raceId) {
    return (
      <Card className="text-muted-foreground min-w-0 items-center justify-center px-6 py-24 text-center text-sm">
        Pick a race on the left to see its results.
      </Card>
    )
  }

  const columns = r.fields.length
    ? r.fields.map((f) => ({ key: f.mezo, label: f.header_en || f.header_hu }))
    : (r.rows[0] ? Object.keys(r.rows[0]).filter((k) => k !== 'race') : FALLBACK_COLUMNS).map((k) => ({
        key: k,
        label: FALLBACK_HEADERS[k] ?? k,
      }))

  /** Update the filters and reload page 1, right away or after `delay` ms. */
  const apply = (next: ResultFilters, delay = 0) => {
    setForm(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      pending.current?.abort()
      dispatch(setFilters(next))
      pending.current = dispatch(fetchResults(1))
    }, delay)
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
        rows.map((row) => columns.map((c) => display(row, c.key))),
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
        aria-label={`Clear ${label.toLowerCase()} filter`}
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
        {textInput(minKey, `${label} from`, minHint, numeric)}
        {textInput(maxKey, `${label} to`, maxHint, numeric)}
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
            <SelectItem value={ANY}>Any</SelectItem>
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
            aria-label={`Clear ${label.toLowerCase()} filter`}
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
          {!!r.meta?.tav && <Badge variant="secondary">{(r.meta.tav / 1000).toLocaleString('hu-HU')} km</Badge>}
          {r.meta && <Badge variant="secondary">{r.meta.meret.toLocaleString('hu-HU')} finishers</Badge>}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          {field('name', 'Name')}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {field('town', 'Town', 'exact, e.g. Budapest')}
            {field('club', 'Club')}
            {field('bib', 'Bib')}
            {select(
              'category',
              'Category',
              r.categories.map((c) => ({ value: c, label: c })),
            )}
            {/* the API's codes: F = férfi, N = nő */}
            {select('sex', 'Gender', [
              { value: 'F', label: 'Men' },
              { value: 'N', label: 'Women' },
            ])}
            {select(
              'country',
              'Country',
              r.countries.map((c) => ({ value: c.value, label: `${c.text} (${c.value})` })),
            )}
            {range('Net time (mm:ss or h:mm:ss)', ['minNetTime', 'maxNetTime'], ['from', 'to'], false)}
            {range('Birth year', ['minYob', 'maxYob'], ['from', 'to'])}
            {range('Place', ['minPlace', 'maxPlace'], ['from', 'to'])}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" disabled={!hasFilters} onClick={() => apply({})}>
              <X />
              Clear all filters
            </Button>
          </div>
        </div>

        {r.status === 'failed' && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load results</AlertTitle>
            <AlertDescription>{r.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {r.status === 'loading' ? 'Loading…' : `${r.total.toLocaleString('hu-HU')} results`}
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
              aria-label="Previous page"
              disabled={r.page <= 1 || r.status === 'loading'}
              onClick={() => dispatch(fetchResults(r.page - 1))}
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
              aria-label="Next page"
              disabled={r.page >= r.lastPage || r.status === 'loading'}
              onClick={() => dispatch(fetchResults(r.page + 1))}
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
                              title="Show only this town"
                              className="hover:bg-accent -mx-1.5 cursor-pointer rounded px-1.5 py-0.5 underline decoration-dotted underline-offset-4"
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
                            display(row, c.key)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              {r.status === 'succeeded' && r.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-muted-foreground py-10 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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

function isNumericCol(key: string) {
  return key === 'hely' || key === 'netto' || key === 'brutto' || key.startsWith('reszido')
}
