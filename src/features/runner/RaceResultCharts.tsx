import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useRaceBreakdownQuery } from '@/api/futanetApi'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { DistributionChart } from '@/features/results/DistributionChart'
import { PercentileChart } from '@/features/results/PercentileChart'
import { useT } from '@/i18n'
import { formatSeconds, groupStats, HALF_HOUR, histogram, percentileOf } from '@/lib/breakdown'
import { timeToSeconds } from '@/lib/results'
import type { RunnerResult } from '@/lib/runner'

/** One result of a runner against the whole race and their category; fetched when opened. */
export function RaceResultCharts({ result }: { result: RunnerResult }) {
  const t = useT()
  const { data, error } = useRaceBreakdownQuery(result.raceId)

  const stats = useMemo(() => {
    if (!data) return null
    const category = result.category.trim()
    return {
      cutoffs: groupStats(data.all).cutoffs,
      bins: histogram(data.all, data.men, data.women),
      minuteBins: histogram(data.all, data.men, data.women, 60),
      categoryRows: category ? data.all.filter((r) => r.category === category) : [],
      genderCount: data.men.length + data.women.length,
    }
  }, [data, result.category])

  if (!stats) {
    return error ? (
      <Alert variant="destructive">
        <AlertTitle>{t.breakdown.failed}</AlertTitle>
        {'message' in error && <AlertDescription>{error.message}</AlertDescription>}
      </Alert>
    ) : (
      <p className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
        <Loader2 className="size-4 animate-spin" /> {t.breakdown.loading}
      </p>
    )
  }
  if (!stats.bins.length) return <p className="text-muted-foreground py-4 text-sm">{t.breakdown.empty}</p>

  // no time (DNF, DSQ…): the charts still show the race, just without the runner
  const seconds = timeToSeconds(result.time)
  const known = Number.isFinite(seconds)
  const marker = known ? { seconds, label: `${result.name} ${formatSeconds(seconds)}` } : undefined
  const stacked = stats.genderCount > 0 && stats.bins.every((b) => b.men + b.women === b.total)
  const distLabels = {
    men: t.breakdown.men,
    women: t.breakdown.women,
    finishers: t.breakdown.finishers,
    finishedBy: t.breakdown.finishedBy,
    xAxis: t.breakdown.timeAxis,
  }

  const category = result.category.trim()
  const categoryStats = groupStats(stats.categoryRows)
  const percent = known && stats.categoryRows.length ? percentileOf(stats.categoryRows, seconds) : null
  const decilesTitle = t.runner.categoryDeciles(category)
  const byTime = [...stats.categoryRows].sort((a, b) => a.seconds - b.seconds)
  const faster = byTime.filter((r) => r.seconds < seconds).length
  // the official place if the row has one; the line runs from the winner at 0 % to the last at 100 %
  const categoryPlace = Number.parseInt(result.categoryPlace) || faster + 1
  const line = [
    { percent: 0, rank: 1, seconds: categoryStats.fastest },
    ...categoryStats.cutoffs,
  ]

  return (
    <div className="flex flex-col gap-6 py-2">
      <section className="flex flex-col gap-2">
        <h3 className="text-primary text-sm font-semibold">{t.breakdown.distTitle}</h3>
        <DistributionChart
          bins={stats.bins}
          cutoffs={stats.cutoffs}
          stacked={stacked}
          marker={marker}
          labels={{ ...distLabels, ariaLabel: t.breakdown.distTitle }}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-primary text-sm font-semibold">{t.breakdown.minuteTitle}</h3>
        <DistributionChart
          bins={stats.minuteBins}
          cutoffs={[]}
          stacked={stacked}
          gridStep={HALF_HOUR}
          marker={marker}
          labels={{ ...distLabels, ariaLabel: t.breakdown.minuteTitle }}
        />
      </section>

      {categoryStats.count > 0 && (
        <section className="flex flex-col gap-2">
          <div>
            <h3 className="text-primary text-sm font-semibold">
              {decilesTitle} <span className="text-muted-foreground font-normal">· {categoryStats.count} {t.breakdown.finishers}</span>
            </h3>
            {percent !== null && (
              <p className="text-muted-foreground text-xs">{t.runner.categoryPosition(result.name, Math.ceil(percent))}</p>
            )}
          </div>
          <PercentileChart
            series={[{ key: 'category', label: category, color: 'var(--chart-series)', cutoffs: line }]}
            marker={
              marker && percent !== null
                ? { ...marker, percent: byTime.length > 1 ? (faster / (byTime.length - 1)) * 100 : 0, detail: t.runner.categoryPlace(categoryPlace) }
                : undefined
            }
            topLabel={(p) =>
              p === 0
                ? t.runner.categoryFirst(byTime[0].name)
                : p === 100
                  ? t.runner.categoryLast
                  : t.breakdown.top(p)
            }
            placeLabel={t.breakdown.place}
            xAxisLabel={t.breakdown.xAxis}
            ariaLabel={decilesTitle}
          />
        </section>
      )}
    </div>
  )
}
