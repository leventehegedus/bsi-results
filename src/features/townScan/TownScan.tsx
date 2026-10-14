import { useEffect, useRef, useState } from 'react'
import { Database, Download, Loader2, Play, Square, X } from 'lucide-react'
import { cachedScanCount, clearScanCache } from '@/api/scanCache'
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
import { DISTANCE_CATEGORIES } from '@/lib/distance'
import { runnerKey, type RunnerBest, type ScanRow } from '@/lib/results'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { useT, type Messages } from '@/i18n'
import { RunnerLink } from '@/features/runner/RunnerLink'
import { FavouriteButton } from '@/features/favourites/FavouriteButton'
import { sameTown, toggleTown } from '@/features/favourites/favouritesSlice'
import { ShareLink } from '@/routing/ShareLink'
import {
  parseTowns,
  runTownScan,
  selectBestPerRunner,
  selectFinishes,
  setBestOnly,
  setExcludeVirtual,
  setMergeSubLists,
  setTownsInput,
  toggleCategory,
} from './townScanSlice'

export function TownScan() {
  const dispatch = useAppDispatch()
  const t = useT()
  const scan = useAppSelector((s) => s.townScan)
  const finishes = useAppSelector(selectFinishes)
  const best = useAppSelector(selectBestPerRunner)
  const running = scan.status === 'running'
  const promiseRef = useRef<{ abort: () => void } | null>(null)
  const towns = parseTowns(scan.townsInput)
  const saved = useAppSelector((s) => s.favourites.towns)
  const allSaved = towns.length > 0 && towns.every((t) => saved.some((s) => sameTown(s, t)))
  // how much of the scan can be answered without the network
  const [cached, setCached] = useState<number | null>(null)
  useEffect(() => {
    if (scan.status === 'running') return
    let live = true
    cachedScanCount().then((n) => live && setCached(n))
    return () => {
      live = false
    }
  }, [scan.status])

  const start = () => {
    promiseRef.current = dispatch(
      runTownScan({ towns, categories: scan.categories }),
    )
  }
  const stop = () => promiseRef.current?.abort()

  const runners = new Set(finishes.map((r) => runnerKey(r.name))).size
  const pct = scan.total ? Math.round((scan.done / scan.total) * 100) : 0

  const exportCsv = () => {
    const name = `${towns.map(slug).join('_') || 'towns'}_${scan.bestOnly ? 'best' : 'finishes'}.csv`
    const csv = scan.bestOnly
      ? toCsv(
          [t.col.name, t.col.town, t.col.bestTime, t.col.date, t.col.race, t.col.place, t.col.catPlace, t.col.finishes],
          best.map((r) => [r.name, r.town, r.time, r.date, r.raceName, r.place, r.categoryPlace, r.finishes]),
        )
      : toCsv(
          [t.col.date, t.col.race, t.col.name, t.col.town, t.col.category, t.col.place, t.col.catPlace, t.col.netTime, t.col.club, t.col.raceCode],
          finishes.map((r) => [r.date, r.raceName, r.name, r.town, r.category, r.place, r.categoryPlace, r.time, r.club, r.raceId]),
        )
    downloadCsv(name, csv)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.town.title}</CardTitle>
          <CardDescription>{t.town.description}</CardDescription>
          <CardAction className="flex items-center gap-1">
            <FavouriteButton
              active={allSaved}
              addLabel={t.favourites.addTown}
              removeLabel={t.favourites.removeTown}
              withText
              onToggle={() => towns.forEach((town) => dispatch(toggleTown(town)))}
            />
            <ShareLink />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="towns">{t.town.townsLabel}</Label>
              <Input
                id="towns"
                value={scan.townsInput}
                disabled={running}
                placeholder="Budapest, Szeged, Székesfehérvár"
                onChange={(e) => dispatch(setTownsInput(e.target.value))}
              />
            </div>
            <div className="flex items-end">
              {running ? (
                <Button key="stop" variant="outline" onClick={stop} className="w-full md:w-auto">
                  <Square /> {t.common.stop}
                </Button>
              ) : (
                <Button
                  key="start"
                  variant="brand"
                  onClick={start}
                  disabled={!towns.length || !scan.categories.length}
                  className="w-full md:w-auto"
                >
                  <Play /> {t.town.run}
                </Button>
              )}
            </div>
          </div>

          {saved.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">{t.favourites.towns}</span>
              {saved.map((town) => (
                <span key={town} className="bg-muted/60 flex items-center rounded-full border text-xs">
                  <button
                    type="button"
                    disabled={running}
                    title={t.favourites.useTown(town)}
                    className="hover:text-brand py-1 pr-1 pl-2.5 disabled:opacity-50"
                    onClick={() => dispatch(setTownsInput(town))}
                  >
                    {town}
                  </button>
                  <button
                    type="button"
                    aria-label={t.favourites.remove}
                    title={t.favourites.remove}
                    className="text-muted-foreground hover:text-foreground py-1 pr-2 pl-1"
                    onClick={() => dispatch(toggleTown(town))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t.town.racesToScan}</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {DISTANCE_CATEGORIES.map((c) => (
                <Toggle
                  key={c}
                  id={`cat-${c}`}
                  checked={scan.categories.includes(c)}
                  disabled={running}
                  onChange={() => dispatch(toggleCategory(c))}
                  label={t.distance[c]}
                />
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{t.town.racesHint}</p>
          </fieldset>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Toggle
              id="virtual"
              checked={scan.excludeVirtual}
              onChange={(v) => dispatch(setExcludeVirtual(v))}
              label={t.town.excludeVirtual}
            />
            <Toggle
              id="merge"
              checked={scan.mergeSubLists}
              onChange={(v) => dispatch(setMergeSubLists(v))}
              label={t.town.mergeSubLists}
            />
            <Toggle
              id="best"
              checked={scan.bestOnly}
              onChange={(v) => dispatch(setBestOnly(v))}
              label={t.town.bestOnly}
            />
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <Database className="size-3.5" />
            <span>{cached ? t.favourites.cacheSize(cached.toLocaleString('hu-HU')) : t.favourites.cacheEmpty}</span>
            {!!cached && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                disabled={running}
                onClick={() => clearScanCache().then(() => setCached(0))}
              >
                {t.favourites.clearCache}
              </Button>
            )}
          </div>

          {(running || scan.status === 'done' || scan.status === 'cancelled') && (
            <div className="grid gap-2">
              <Progress value={running ? pct : 100} />
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                {running && <Loader2 className="size-3.5 animate-spin" />}
                {running && scan.phase === 'resolving' && t.town.readingDistances(scan.done, scan.total || '?')}
                {running && scan.phase === 'scanning' && t.town.scanning(scan.done, scan.total)}
                {scan.status === 'done' && t.town.done(scan.racesScanned)}
                {scan.status === 'done' && scan.fromCache > 0 && ` · ${t.favourites.fromCache(scan.fromCache)}`}
                {scan.status === 'cancelled' && t.common.stopped}
              </div>
            </div>
          )}

          {scan.status === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>{t.town.failed}</AlertTitle>
              <AlertDescription>{scan.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {(finishes.length > 0 || scan.status === 'done') && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t.town.results}
              <Badge variant="brand">{t.town.finishes(finishes.length)}</Badge>
              <Badge>{t.town.runners(runners)}</Badge>
            </CardTitle>
            <CardDescription>{t.town.matchingNote}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!finishes.length}>
                <Download /> {t.common.downloadCsv}
              </Button>
            </div>
            <div className="rounded-md border">
              {scan.bestOnly ? <BestTable rows={best} t={t} /> : <FinishTable rows={finishes} t={t} />}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Toggle(props: {
  id: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={props.id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={(v) => props.onChange(v === true)}
      />
      <Label htmlFor={props.id} className="font-normal">
        {props.label}
      </Label>
    </div>
  )
}

function FinishTable({ rows, t }: { rows: ScanRow[]; t: Messages }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.col.date}</TableHead>
          <TableHead>{t.col.race}</TableHead>
          <TableHead>{t.col.name}</TableHead>
          <TableHead>{t.col.town}</TableHead>
          <TableHead>{t.col.cat}</TableHead>
          <TableHead className="text-right">{t.col.place}</TableHead>
          <TableHead>{t.col.catPlace}</TableHead>
          <TableHead>{t.col.netTime}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={`${r.raceId}-${r.name}-${i}`}>
            <TableCell className="tabular-nums">{r.date}</TableCell>
            <TableCell className="max-w-72 truncate" title={r.raceName}>
              {r.raceName}
            </TableCell>
            <TableCell>
              <RunnerLink name={r.name} raceId={r.raceId} raceName={r.raceName} place={r.place} bib={r.bib} />
            </TableCell>
            <TableCell>{r.town}</TableCell>
            <TableCell>{r.category}</TableCell>
            <TableCell className="text-right tabular-nums">{r.place}</TableCell>
            <TableCell className="tabular-nums">{r.categoryPlace}</TableCell>
            <TableCell className="tabular-nums">{r.time}</TableCell>
          </TableRow>
        ))}
        <EmptyRow show={!rows.length} cols={8} text={t.town.none} />
      </TableBody>
    </Table>
  )
}

function BestTable({ rows, t }: { rows: RunnerBest[]; t: Messages }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>{t.col.name}</TableHead>
          <TableHead>{t.col.town}</TableHead>
          <TableHead>{t.col.bestTime}</TableHead>
          <TableHead>{t.col.date}</TableHead>
          <TableHead>{t.col.race}</TableHead>
          <TableHead className="text-right">{t.col.place}</TableHead>
          <TableHead className="text-right">{t.col.finishes}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={`${r.name}-${i}`}>
            <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
            <TableCell>
              <RunnerLink name={r.name} raceId={r.raceId} raceName={r.raceName} place={r.place} bib={r.bib} />
            </TableCell>
            <TableCell>{r.town}</TableCell>
            <TableCell className="tabular-nums">{r.time}</TableCell>
            <TableCell className="tabular-nums">{r.date}</TableCell>
            <TableCell className="max-w-72 truncate" title={r.raceName}>
              {r.raceName}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.place}</TableCell>
            <TableCell className="text-right tabular-nums">{r.finishes}</TableCell>
          </TableRow>
        ))}
        <EmptyRow show={!rows.length} cols={8} text={t.town.none} />
      </TableBody>
    </Table>
  )
}

function EmptyRow({ show, cols, text }: { show: boolean; cols: number; text: string }) {
  if (!show) return null
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-muted-foreground py-10 text-center">
        {text}
      </TableCell>
    </TableRow>
  )
}
