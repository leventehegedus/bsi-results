import type { PlaceCount } from '@/lib/breakdown'

/** A ranked list of places with a bar each; counts and shares are printed, so no hover layer or table is needed. */
export function TopPlaces(props: { title: string; places: PlaceCount[]; total: number; onSelect: (index: number) => void }) {
  const { title, places, total, onSelect } = props
  const max = places[0]?.count ?? 0
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-primary text-sm font-semibold">{title}</h3>
      <ol className="flex flex-col gap-1.5">
        {places.map((p, i) => (
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
    </section>
  )
}

/** Under 1 % would round to a misleading "0%". */
function share(count: number, total: number) {
  const percent = (count / total) * 100
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`
}
