import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useT } from '@/i18n'
import { formatSeconds, type AgeBand, type GroupStats } from '@/lib/breakdown'

/** room for a median beside a full-length bar ("4:07:12", 12px) */
const LABEL_ROOM = '4rem'
/** a median of a handful of runners says little: shown, but quieter */
const SMALL_GROUP = 10

/**
 * Age pyramid: finishers per age band as bars, men growing left and women right
 * on one scale, with each side's median finish time beside its bar.
 */
export function AgePyramid({ bands }: { bands: AgeBand[] }) {
  const t = useT()
  const max = Math.max(...bands.flatMap((b) => [b.men.count, b.women.count]))

  const side = (band: AgeBand, stats: GroupStats, label: string, color: string, flip: boolean) =>
    stats.count > 0 ? (
      <div
        role="img"
        tabIndex={0}
        aria-label={`${label}, ${band.label}: ${formatSeconds(stats.median)}, ${stats.count} ${t.breakdown.finishers}`}
        className={`group focus-visible:outline-ring relative flex items-center gap-2 rounded-sm focus-visible:outline-2 ${flip ? 'flex-row-reverse' : ''}`}
      >
        <span
          aria-hidden
          className={`h-6 shrink-0 ${flip ? 'rounded-l' : 'rounded-r'}`}
          style={{ background: color, width: `max(2px, calc((100% - ${LABEL_ROOM}) * ${stats.count / max}))` }}
        />
        <span aria-hidden className={`text-xs font-medium tabular-nums ${stats.count < SMALL_GROUP ? 'text-muted-foreground' : ''}`}>
          {formatSeconds(stats.median)}
        </span>
        <div
          aria-hidden
          className={`bg-popover text-popover-foreground pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-md border px-3 py-2 text-xs shadow-md group-hover:block group-focus:block ${flip ? 'right-0' : 'left-0'}`}
        >
          <div className="text-muted-foreground mb-1">
            {label}, {band.label}
          </div>
          <div>
            <span className="font-semibold tabular-nums">{stats.count.toLocaleString('hu-HU')}</span>{' '}
            <span className="text-muted-foreground">{t.breakdown.finishers}</span>
          </div>
          <div>
            <span className="font-semibold tabular-nums">{formatSeconds(stats.median)}</span>{' '}
            <span className="text-muted-foreground">{t.breakdown.median}</span>
          </div>
        </div>
      </div>
    ) : (
      <div />
    )

  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1">
        <span className="flex items-center justify-end gap-1.5 text-xs font-medium">
          {t.breakdown.men}
          <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: 'var(--chart-men)' }} />
        </span>
        <span />
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: 'var(--chart-women)' }} />
          {t.breakdown.women}
        </span>
        {bands.map((b) => (
          <div key={b.age} className="contents">
            {side(b, b.men, t.breakdown.men, 'var(--chart-men)', true)}
            <span className="text-center text-xs font-medium tabular-nums">{b.label}</span>
            {side(b, b.women, t.breakdown.women, 'var(--chart-women)', false)}
          </div>
        ))}
      </div>
      {/* the pyramid's values as a table */}
      <details className="text-sm">
        <summary className="text-primary w-fit cursor-pointer text-xs font-medium">{t.breakdown.showTable}</summary>
        <div className="mt-2 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.breakdown.ageCol}</TableHead>
                <TableHead className="text-right">{t.breakdown.men}</TableHead>
                <TableHead className="text-right">{t.breakdown.median}</TableHead>
                <TableHead className="text-right">{t.breakdown.women}</TableHead>
                <TableHead className="text-right">{t.breakdown.median}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bands.map((b) => (
                <TableRow key={b.age}>
                  <TableCell className="font-medium tabular-nums">{b.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.men.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.men.count ? formatSeconds(b.men.median) : '–'}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.women.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.women.count ? formatSeconds(b.women.median) : '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </>
  )
}
