import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useRaceBreakdownQuery } from '@/api/futanetApi'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useT } from '@/i18n'
import { categoryStats, formatSeconds, groupStats, histogram, PERCENTS, type GroupStats } from '@/lib/breakdown'
import { DistributionChart } from './DistributionChart'
import { PercentileChart, type PercentileSeries } from './PercentileChart'

/** Time cut-offs (top 10 %, 20 % …) of a whole race: all finishers, men, women and age categories. */
export function RaceBreakdown({ raceId }: { raceId: string }) {
  const t = useT()
  const { data, isFetching, error } = useRaceBreakdownQuery(raceId)

  const stats = useMemo(() => {
    if (!data) return null
    return {
      all: groupStats(data.all),
      men: groupStats(data.men),
      women: groupStats(data.women),
      categories: categoryStats(data.all),
      bins: histogram(data.all, data.men, data.women),
    }
  }, [data])

  if (!stats) {
    return error ? (
      <Alert variant="destructive">
        <AlertTitle>{t.breakdown.failed}</AlertTitle>
        {'message' in error && <AlertDescription>{error.message}</AlertDescription>}
      </Alert>
    ) : (
      <p className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> {t.breakdown.loading}
      </p>
    )
  }
  if (!stats.all.count) return <p className="text-muted-foreground py-10 text-sm">{t.breakdown.empty}</p>

  const hasGender = stats.men.count + stats.women.count > 0
  // stack men + women only when they add up to every finisher in each slot
  const stacked = hasGender && stats.bins.every((b) => b.men + b.women === b.total)
  const groups: { key: string; label: string; color: string; stats: GroupStats }[] = [
    { key: 'all', label: t.breakdown.all, color: 'var(--chart-context)', stats: stats.all },
    ...(hasGender
      ? [
          { key: 'men', label: t.breakdown.men, color: 'var(--chart-men)', stats: stats.men },
          { key: 'women', label: t.breakdown.women, color: 'var(--chart-women)', stats: stats.women },
        ]
      : []),
  ].filter((g) => g.stats.count > 0)
  // The chart stops at 90 %: the 100 % point is the single slowest finisher, an outlier that
  // would squash the rest of the scale. It stays in the figures and the tables.
  const series: PercentileSeries[] = groups.map((g) => ({
    key: g.key,
    label: g.label,
    color: g.color,
    cutoffs: g.stats.cutoffs.filter((c) => c.percent < 100),
  }))

  return (
    <div className={isFetching ? 'flex flex-col gap-6 opacity-60' : 'flex flex-col gap-6'}>
      <p className="text-muted-foreground text-xs">{t.breakdown.wholeRace}</p>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label={t.breakdown.finishers} value={stats.all.count.toLocaleString('hu-HU')} />
        <Figure label={t.breakdown.fastest} value={formatSeconds(stats.all.fastest)} />
        <Figure label={t.breakdown.median} value={formatSeconds(stats.all.median)} />
        <Figure label={t.breakdown.slowest} value={formatSeconds(stats.all.slowest)} />
      </dl>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-primary text-sm font-semibold">{t.breakdown.chartTitle}</h3>
          <p className="text-muted-foreground text-xs">{t.breakdown.chartDescription}</p>
          {!hasGender && <p className="text-muted-foreground mt-1 text-xs">{t.breakdown.noGender}</p>}
        </div>
        <PercentileChart
          series={series}
          topLabel={t.breakdown.top}
          placeLabel={t.breakdown.place}
          xAxisLabel={t.breakdown.xAxis}
          ariaLabel={t.breakdown.chartTitle}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-primary text-sm font-semibold">{t.breakdown.distTitle}</h3>
          <p className="text-muted-foreground text-xs">{t.breakdown.distDescription}</p>
        </div>
        <DistributionChart
          bins={stats.bins}
          cutoffs={stats.all.cutoffs}
          stacked={stacked}
          labels={{
            men: t.breakdown.men,
            women: t.breakdown.women,
            finishers: t.breakdown.finishers,
            finishedBy: t.breakdown.finishedBy,
            xAxis: t.breakdown.timeAxis,
            ariaLabel: t.breakdown.distTitle,
          }}
        />
        {/* the bar chart's values as a table */}
        <details className="text-sm">
          <summary className="text-primary w-fit cursor-pointer text-xs font-medium">{t.breakdown.showTable}</summary>
          <div className="mt-2 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.breakdown.timeSlot}</TableHead>
                  {stacked && <TableHead className="text-right">{t.breakdown.men}</TableHead>}
                  {stacked && <TableHead className="text-right">{t.breakdown.women}</TableHead>}
                  <TableHead className="text-right">{t.breakdown.total}</TableHead>
                  <TableHead className="text-right">{t.breakdown.finishedByCol}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.bins.map((b) => (
                  <TableRow key={b.from} className={b.total ? undefined : 'text-muted-foreground'}>
                    <TableCell className="tabular-nums">
                      {formatSeconds(b.from)} – {formatSeconds(b.to)}
                    </TableCell>
                    {stacked && <TableCell className="text-right tabular-nums">{b.men}</TableCell>}
                    {stacked && <TableCell className="text-right tabular-nums">{b.women}</TableCell>}
                    <TableCell className="text-right tabular-nums">{b.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(b.cumulative)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      </section>

      {/* the line chart's values as a table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.breakdown.topCol}</TableHead>
              {groups.map((g) => (
                <TableHead key={g.key}>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: g.color }} />
                    {g.label} <span className="text-muted-foreground font-normal">({g.stats.count})</span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERCENTS.map((p, i) => (
              <TableRow key={p}>
                <TableCell className="font-medium tabular-nums">{p}%</TableCell>
                {groups.map((g) => {
                  const c = g.stats.cutoffs[i]
                  return (
                    <TableCell key={g.key} className="tabular-nums">
                      <span className="font-semibold">{formatSeconds(c.seconds)}</span>{' '}
                      <span className="text-muted-foreground text-xs">{t.breakdown.place(c.rank)}</span>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {stats.categories.length > 1 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-primary text-sm font-semibold">{t.breakdown.categories}</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.breakdown.categoryCol}</TableHead>
                  <TableHead className="text-right">{t.breakdown.countCol}</TableHead>
                  {PERCENTS.map((p) => (
                    <TableHead key={p} className="text-right">
                      {p}%
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.categories.map(({ category, stats: s }) => (
                  // percentages of a handful of runners say little: shown, but quieter
                  <TableRow key={category} className={s.count < SMALL_GROUP ? 'text-muted-foreground' : undefined}>
                    <TableCell className="font-medium">{category}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                    {s.cutoffs.map((c) => (
                      <TableCell key={c.percent} className="text-right tabular-nums" title={t.breakdown.place(c.rank)}>
                        {formatSeconds(c.seconds)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  )
}

const SMALL_GROUP = 10

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      {/* proportional figures for standalone numbers */}
      <dd className="text-primary text-2xl font-semibold">{value}</dd>
    </div>
  )
}
