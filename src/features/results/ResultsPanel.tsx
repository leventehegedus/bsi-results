import { useEffect, useState, type FormEvent } from 'react'
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

  useEffect(() => {
    if (!r.raceId) return
    const a = dispatch(loadRace(r.raceId))
    const b = dispatch(fetchResults(1))
    return () => {
      a.abort()
      b.abort()
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

  const submit = (e: FormEvent) => {
    e.preventDefault()
    dispatch(setFilters(form))
    dispatch(fetchResults(1))
  }
  const filterTown = (town: string) => {
    const next = { ...form, town }
    setForm(next)
    dispatch(setFilters(next))
    dispatch(fetchResults(1))
  }
  const clear = () => {
    setForm({})
    dispatch(setFilters({}))
    dispatch(fetchResults(1))
  }

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

  const field = (key: keyof ResultFilters, label: string, placeholder?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${key}`}>{label}</Label>
      <Input
        id={`f-${key}`}
        placeholder={placeholder}
        value={form[key] ?? ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
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
          <Badge variant="outline" className="font-mono">
            {r.raceId}
          </Badge>
          {r.meta?.datum && <Badge variant="secondary">{r.meta.datum.slice(0, 10)}</Badge>}
          {!!r.meta?.tav && <Badge variant="secondary">{(r.meta.tav / 1000).toLocaleString('hu-HU')} km</Badge>}
          {r.meta && <Badge variant="secondary">{r.meta.meret.toLocaleString('hu-HU')} finishers</Badge>}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {field('name', 'Name')}
          {field('town', 'Town', 'exact, e.g. Makó')}
          {field('club', 'Club')}
          {field('bib', 'Bib')}
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select
              value={form.category ?? ANY}
              onValueChange={(v) => setForm({ ...form, category: v === ANY ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {r.categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" className="flex-1">
              Filter
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={clear} aria-label="Clear filters">
              <X />
            </Button>
          </div>
        </form>

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
