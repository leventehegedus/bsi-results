import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RunnerLink } from '@/features/runner/RunnerLink'
import { useT } from '@/i18n'
import { formatSeconds, type BreakdownRow, type PlaceStat } from '@/lib/breakdown'

const TOP = 10

/** The ten biggest places with a bar each; counts and shares are printed, so no hover layer is needed. The table lists every place with its fastest man and woman. */
export function TopPlaces(props: {
  title: string
  placeCol: string
  places: PlaceStat[]
  total: number
  raceId: string
  raceName?: string
  onSelect: (index: number) => void
}) {
  const { title, placeCol, places, total, raceId, raceName, onSelect } = props
  const t = useT()
  const max = places[0]?.count ?? 0
  const hasMen = places.some((p) => p.bestMan)
  const hasWomen = places.some((p) => p.bestWoman)
  const bestCell = (r?: BreakdownRow) => (
    <TableCell>
      {r && (
        <>
          <RunnerLink name={r.name} raceId={raceId} raceName={raceName} place={r.place} bib={r.bib} />{' '}
          <span className="font-semibold tabular-nums">{formatSeconds(r.seconds)}</span>
        </>
      )}
    </TableCell>
  )
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-primary text-sm font-semibold">{title}</h3>
      <ol className="flex flex-col gap-1.5">
        {places.slice(0, TOP).map((p, i) => (
          <li key={p.name}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              className="hover:bg-accent focus-visible:outline-ring grid w-full cursor-pointer grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 rounded text-left text-xs focus-visible:outline-2"
            >
            <span className="truncate font-medium" title={p.name}>
              {p.name}
            </span>
            <span aria-hidden className="h-4">
              <span
                className="block h-full rounded-r"
                style={{ background: 'var(--chart-series)', width: `max(2px, ${(p.count / max) * 100}%)` }}
              />
            </span>
            <span className="tabular-nums">
              <span className="font-semibold">{p.count.toLocaleString('hu-HU')}</span>{' '}
              <span className="text-muted-foreground inline-block w-9 text-right">{share(p.count, total)}</span>
            </span>
            </button>
          </li>
        ))}
      </ol>
      <details className="text-sm">
        <summary className="text-primary w-fit cursor-pointer text-xs font-medium">{t.breakdown.showTable}</summary>
        <div className="mt-2 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{placeCol}</TableHead>
                <TableHead className="text-right">{t.breakdown.countCol}</TableHead>
                {hasMen && <TableHead>{t.breakdown.bestManCol}</TableHead>}
                {hasWomen && <TableHead>{t.breakdown.bestWomanCol}</TableHead>}
                {!hasMen && !hasWomen && <TableHead>{t.breakdown.bestRunnerCol}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {places.map((p) => (
                <TableRow key={p.name}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.count}</TableCell>
                  {hasMen && bestCell(p.bestMan)}
                  {hasWomen && bestCell(p.bestWoman)}
                  {!hasMen && !hasWomen && bestCell(p.best)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </section>
  )
}

/** Under 1 % would round to a misleading "0%". */
function share(count: number, total: number) {
  const percent = (count / total) * 100
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`
}
