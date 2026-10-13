import { useRef } from 'react'
import { Download, Loader2, Play, Square } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { downloadCsv, slug, toCsv } from '@/lib/csv'
import { runnerKey, type RunnerBest, type ScanRow } from '@/lib/results'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  parseTowns,
  runTownScan,
  selectBestPerRunner,
  selectFinishes,
  setBestOnly,
  setExcludeVirtual,
  setIncludeLegacy,
  setMergeSubLists,
  setScope,
  setTownsInput,
  type ScanScope,
} from './townScanSlice'

const SCOPES: { value: ScanScope; label: string; hint: string }[] = [
  { value: 'marathon', label: 'All marathons (42.195 km)', hint: '≈130 race lists' },
  { value: 'budapest', label: 'Budapest Marathon only', hint: 'one list per year' },
  { value: 'all', label: 'Every race', hint: '≈2 200 race lists — takes several minutes' },
]

export function TownScan() {
  const dispatch = useAppDispatch()
  const scan = useAppSelector((s) => s.townScan)
  const finishes = useAppSelector(selectFinishes)
  const best = useAppSelector(selectBestPerRunner)
  const running = scan.status === 'running'
  const promiseRef = useRef<{ abort: () => void } | null>(null)
  const towns = parseTowns(scan.townsInput)

  const start = () => {
    promiseRef.current = dispatch(
      runTownScan({ towns, scope: scan.scope, includeLegacy: scan.includeLegacy }),
    )
  }
  const stop = () => promiseRef.current?.abort()

  const runners = new Set(finishes.map((r) => runnerKey(r.name))).size
  const pct = scan.total ? Math.round((scan.done / scan.total) * 100) : 0

  const exportCsv = () => {
    const name = `${towns.map(slug).join('_') || 'towns'}_${scan.bestOnly ? 'best' : 'finishes'}.csv`
    const csv = scan.bestOnly
      ? toCsv(
          ['Name', 'Town', 'Best time', 'Date', 'Race', 'Place', 'Cat. place', 'Finishes'],
          best.map((r) => [r.name, r.town, r.time, r.date, r.raceName, r.place, r.categoryPlace, r.finishes]),
        )
      : toCsv(
          ['Date', 'Race', 'Name', 'Town', 'Category', 'Place', 'Cat. place', 'Net time', 'Club', 'Race code'],
          finishes.map((r) => [r.date, r.raceName, r.name, r.town, r.category, r.place, r.categoryPlace, r.time, r.club, r.raceId]),
        )
    downloadCsv(name, csv)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Find finishers by town</CardTitle>
          <CardDescription>
            Scans race lists and collects every finisher whose registered town matches exactly
            (e.g. “Makó”, not “mako”). Town data exists from 1996; earlier lists don't record it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-[1fr_18rem_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="towns">Towns (comma-separated)</Label>
              <Input
                id="towns"
                value={scan.townsInput}
                disabled={running}
                placeholder="Makó, Zsombó, Sándorfalva"
                onChange={(e) => dispatch(setTownsInput(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Races to scan</Label>
              <Select
                value={scan.scope}
                disabled={running}
                onValueChange={(v) => dispatch(setScope(v as ScanScope))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              {running ? (
                <Button variant="outline" onClick={stop} className="w-full md:w-auto">
                  <Square /> Stop
                </Button>
              ) : (
                <Button onClick={start} disabled={!towns.length} className="w-full md:w-auto">
                  <Play /> Run scan
                </Button>
              )}
            </div>
          </div>

          <p className="text-muted-foreground -mt-3 text-xs">
            {SCOPES.find((s) => s.value === scan.scope)?.hint}
          </p>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Toggle
              id="legacy"
              checked={scan.includeLegacy}
              disabled={running || scan.scope === 'all'}
              onChange={(v) => dispatch(setIncludeLegacy(v))}
              label="Include Budapest Marathons 1984–2017 missing from the race list"
            />
            <Toggle
              id="virtual"
              checked={scan.excludeVirtual}
              onChange={(v) => dispatch(setExcludeVirtual(v))}
              label="Exclude virtual races"
            />
            <Toggle
              id="merge"
              checked={scan.mergeSubLists}
              onChange={(v) => dispatch(setMergeSubLists(v))}
              label="Count a run once (merge amateur-cup / championship sub-lists)"
            />
            <Toggle
              id="best"
              checked={scan.bestOnly}
              onChange={(v) => dispatch(setBestOnly(v))}
              label="One row per runner (best time)"
            />
          </div>

          {(running || scan.status === 'done' || scan.status === 'cancelled') && (
            <div className="grid gap-2">
              <Progress value={running ? pct : 100} />
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                {running && <Loader2 className="size-3.5 animate-spin" />}
                {running && scan.phase === 'resolving' && `Finding races… ${scan.done}/${scan.total || '?'}`}
                {running && scan.phase === 'scanning' && `Scanning race lists… ${scan.done}/${scan.total}`}
                {scan.status === 'done' && `Done — scanned ${scan.racesScanned} races.`}
                {scan.status === 'cancelled' && 'Stopped. Showing what was found so far.'}
              </div>
            </div>
          )}

          {scan.status === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>Scan failed</AlertTitle>
              <AlertDescription>{scan.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {(finishes.length > 0 || scan.status === 'done') && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Results
              <Badge variant="secondary">{finishes.length} finishes</Badge>
              <Badge variant="secondary">{runners} runners</Badge>
            </CardTitle>
            <CardDescription>
              Names are matched loosely (case, accents, “dr.”) when counting runners; “ifj.” is kept
              apart.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!finishes.length}>
                <Download /> Download CSV
              </Button>
            </div>
            <div className="rounded-md border">
              {scan.bestOnly ? <BestTable rows={best} /> : <FinishTable rows={finishes} />}
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

function FinishTable({ rows }: { rows: ScanRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Race</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Town</TableHead>
          <TableHead>Cat.</TableHead>
          <TableHead className="text-right">Place</TableHead>
          <TableHead>Cat. place</TableHead>
          <TableHead>Net time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={`${r.raceId}-${r.name}-${i}`}>
            <TableCell className="tabular-nums">{r.date}</TableCell>
            <TableCell className="max-w-72 truncate" title={r.raceName}>
              {r.raceName}
            </TableCell>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>{r.town}</TableCell>
            <TableCell>{r.category}</TableCell>
            <TableCell className="text-right tabular-nums">{r.place}</TableCell>
            <TableCell className="tabular-nums">{r.categoryPlace}</TableCell>
            <TableCell className="tabular-nums">{r.time}</TableCell>
          </TableRow>
        ))}
        <EmptyRow show={!rows.length} cols={8} />
      </TableBody>
    </Table>
  )
}

function BestTable({ rows }: { rows: RunnerBest[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Town</TableHead>
          <TableHead>Best time</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Race</TableHead>
          <TableHead className="text-right">Place</TableHead>
          <TableHead className="text-right">Finishes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={`${r.name}-${i}`}>
            <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
            <TableCell className="font-medium">{r.name}</TableCell>
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
        <EmptyRow show={!rows.length} cols={8} />
      </TableBody>
    </Table>
  )
}

function EmptyRow({ show, cols }: { show: boolean; cols: number }) {
  if (!show) return null
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-muted-foreground py-10 text-center">
        No finishers found.
      </TableCell>
    </TableRow>
  )
}
