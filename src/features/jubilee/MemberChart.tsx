import { ProgressionChart } from '@/features/runner/ProgressionChart'
import { useT } from '@/i18n'
import { timeToSeconds } from '@/lib/results'
import { movingAverage } from '@/lib/runner'
import { hasTime, type ClubMember } from './jubileeSlice'

/** Finishes per moving average: 3 smooths one bad year, 6 shows the long trend. */
const AVERAGES = [
  { size: 3, color: 'var(--chart-context)', dash: '5 4' },
  { size: 6, color: 'var(--foreground)', dash: '2 3' },
]

/** One club member's marathon times by year, with the best highlighted and a moving average. */
export function MemberChart({ member }: { member: ClubMember }) {
  const t = useT()
  const points = Object.entries(member.r)
    .filter(([, time]) => hasTime(time))
    .map(([year, time]) => ({ date: year, seconds: timeToSeconds(time), raceId: year, raceName: '' }))
    .sort((a, b) => Number(a.date) - Number(b.date))
  if (!points.length) return <p className="text-muted-foreground text-xs">{t.jubilee.noTimes}</p>

  const best = points.reduce((fastest, p) => (p.seconds < fastest.seconds ? p : fastest))
  const times = points.map((p) => p.seconds)
  // only with enough finishes for at least one point of the average
  const averages = AVERAGES.filter((a) => times.length >= a.size).map((a) => ({
    label: t.jubilee.averageLabel(a.size),
    seconds: movingAverage(times, a.size),
    color: a.color,
    dash: a.dash,
  }))
  return (
    <div className="flex flex-col gap-3">
      {/* several series: the legend carries identity */}
      {averages.length > 0 && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: 'var(--chart-series)' }} />
            {t.col.time}
          </li>
          {averages.map((a) => (
            <li key={a.label} className="flex items-center gap-1.5">
              <svg aria-hidden width={16} height={2}>
                <line x1={0} x2={16} y1={1} y2={1} stroke={a.color} strokeWidth={2} strokeDasharray={a.dash} />
              </svg>
              {a.label}
            </li>
          ))}
        </ul>
      )}
      <ProgressionChart
        progression={{ points, best }}
        averages={averages}
        labels={{
          pb: t.runner.pb,
          faster: t.runner.faster,
          place: t.runner.placeN,
          ariaLabel: `${t.jubilee.showChart}: ${member.n}`,
        }}
      />
    </div>
  )
}
