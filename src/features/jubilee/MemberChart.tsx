import { ProgressionChart } from '@/features/runner/ProgressionChart'
import { useT } from '@/i18n'
import { timeToSeconds } from '@/lib/results'
import { movingAverage } from '@/lib/runner'
import { hasTime, type ClubMember } from './jubileeSlice'

/** Finishes in the moving average: enough to smooth one bad year, few enough to follow real change. */
const AVERAGE_OF = 3

/** One club member's marathon times by year, with the best highlighted and a moving average. */
export function MemberChart({ member }: { member: ClubMember }) {
  const t = useT()
  const points = Object.entries(member.r)
    .filter(([, time]) => hasTime(time))
    .map(([year, time]) => ({ date: year, seconds: timeToSeconds(time), raceId: year, raceName: '' }))
    .sort((a, b) => Number(a.date) - Number(b.date))
  if (!points.length) return <p className="text-muted-foreground text-xs">{t.jubilee.noTimes}</p>

  const best = points.reduce((fastest, p) => (p.seconds < fastest.seconds ? p : fastest))
  const average = movingAverage(points.map((p) => p.seconds), AVERAGE_OF)
  const averageLabel = t.jubilee.averageLabel(AVERAGE_OF)
  return (
    <div className="flex flex-col gap-3">
      {/* two series: the legend carries identity */}
      {points.length >= AVERAGE_OF && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: 'var(--chart-series)' }} />
            {t.col.time}
          </li>
          <li className="flex items-center gap-1.5">
            <svg aria-hidden width={16} height={2}>
              <line x1={0} x2={16} y1={1} y2={1} stroke="var(--chart-context)" strokeWidth={2} strokeDasharray="5 4" />
            </svg>
            {averageLabel}
          </li>
        </ul>
      )}
      <ProgressionChart
        progression={{ points, best }}
        average={average}
        labels={{
          pb: t.runner.pb,
          faster: t.runner.faster,
          place: t.runner.placeN,
          ariaLabel: `${t.jubilee.showChart}: ${member.n}`,
          average: averageLabel,
        }}
      />
    </div>
  )
}
