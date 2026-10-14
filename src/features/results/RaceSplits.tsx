import { Loader2 } from 'lucide-react'
import { useRaceSplitsQuery } from '@/api/futanetApi'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useT } from '@/i18n'
import { formatSeconds } from '@/lib/breakdown'
import { formatPace } from '@/lib/pace'
import { formatFade } from '@/lib/splits'
import { FadeChart } from './FadeChart'

/** How the field paced the race: first segment against last, for the whole race and by finishing group. */
export function RaceSplits({ raceId }: { raceId: string }) {
  const t = useT()
  const { data, isFetching, error } = useRaceSplitsQuery(raceId)

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.splits.failed}</AlertTitle>
        {'message' in error && <AlertDescription>{error.message}</AlertDescription>}
      </Alert>
    )
  }
  if (isFetching || !data) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> {t.splits.loading}
      </p>
    )
  }
  if (!data.points.length) return <p className="text-muted-foreground py-10 text-sm">{t.splits.noPoints}</p>
  if (!data.stats) return <p className="text-muted-foreground py-10 text-sm">{t.splits.tooFew}</p>

  const s = data.stats
  const faded = s.medianFade >= 0

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        {t.splits.description(data.points.map((p) => p.label).join(' · '), s.count.toLocaleString('hu-HU'))}
      </p>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={t.splits.medianFade}
          value={formatFade(s.medianFade)}
          color={faded ? 'var(--chart-slower)' : 'var(--chart-faster)'}
          note={faded ? t.splits.slowerNote : t.splits.fasterNote}
        />
        <Tile
          label={t.splits.negativeSplits}
          value={`${Math.round(s.negativeShare * 100)}%`}
          note={t.splits.negativeNote}
        />
        <Tile label={t.splits.firstPace} value={formatPace(s.firstPace)} note={t.splits.perKm} />
        <Tile label={t.splits.lastPace} value={formatPace(s.lastPace)} note={t.splits.perKm} />
      </dl>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t.splits.chartTitle}</h3>
        <FadeChart
          groups={s.groups}
          labels={{
            group: t.splits.groupLabel,
            finish: t.splits.medianFinish,
            runners: t.splits.runners,
            negative: t.splits.negativeOfGroup,
            xAxis: t.splits.xAxis,
            yAxis: t.splits.yAxis,
            ariaLabel: t.splits.chartAria,
          }}
        />
      </section>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.splits.group}</TableHead>
              <TableHead>{t.splits.medianFinish}</TableHead>
              <TableHead className="text-right">{t.splits.fade}</TableHead>
              <TableHead className="text-right">{t.splits.negativeSplits}</TableHead>
              <TableHead className="text-right">{t.splits.runnersCol}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.groups.map((g) => (
              <TableRow key={g.percent}>
                <TableCell>{t.splits.groupLabel(g.percent)}</TableCell>
                <TableCell className="tabular-nums">{formatSeconds(g.medianFinish)}</TableCell>
                <TableCell
                  className="text-right font-medium tabular-nums"
                  style={{ color: g.medianFade >= 0 ? 'var(--chart-slower)' : 'var(--chart-faster)' }}
                >
                  {formatFade(g.medianFade)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{Math.round(g.negativeShare * 100)}%</TableCell>
                <TableCell className="text-right tabular-nums">{g.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Tile(props: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="bg-muted/40 rounded-md border px-4 py-3">
      <dt className="text-muted-foreground text-xs">{props.label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums" style={props.color ? { color: props.color } : undefined}>
        {props.value}
      </dd>
      <p className="text-muted-foreground mt-0.5 text-xs">{props.note}</p>
    </div>
  )
}
