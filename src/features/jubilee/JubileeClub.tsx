import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2, Medal, RefreshCw, Search, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadCsv, toCsv } from '@/lib/csv'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { ShareLink } from '@/routing/ShareLink'
import { searchRunner } from '@/features/runner/runnerActions'
import { setTab } from '@/features/ui/uiSlice'
import {
  loadBand,
  loadClub,
  MIN_FINISHES,
  MIN_QUERY_LENGTH,
  selectLoadedMembers,
  selectPageBands,
  selectPageCount,
  selectPageMembers,
  selectVisibleMembers,
  selectVisibleYears,
  setPage,
  PAGE_SIZE,
  setBand,
  setQuery,
  topUpFromApi,
} from './jubileeSlice'
import { hasTime } from './jubileeSlice'
import type { ClubMember } from './jubileeSlice'

/** TableCell's own horizontal padding (p-2 on each side). */
const CELL_PADDING = 16

/** "6-10" → "6–10", "31plus" → "31+". */
function bandLabel(id: string) {
  return id.replace('plus', '+').replace('-', '–')
}

/** Everyone who has finished the Budapest Marathon more than five times. */
export function JubileeClub() {
  const dispatch = useAppDispatch()
  const t = useT()
  const j = useAppSelector((s) => s.jubilee)
  const loadedMembers = useAppSelector(selectLoadedMembers)
  const allOnPage = useAppSelector(selectVisibleMembers)
  const members = useAppSelector(selectPageMembers)
  const pageCount = useAppSelector(selectPageCount)
  const page = Math.min(j.page, pageCount)
  const years = useAppSelector(selectVisibleYears)
  const bands = useAppSelector(selectPageBands)
  const searching = j.query.trim() !== ''
  // what's typed, which only becomes the search once it's submitted
  const [draft, setDraft] = useState(j.query)
  const canSearch = draft.trim().length >= MIN_QUERY_LENGTH && draft.trim() !== j.query
  // the name column is pinned where the index column ends, which depends on how many
  // members are listed ("1" vs "2219"), so it's measured rather than assumed
  const indexCell = useRef<HTMLTableCellElement>(null)
  const [indexWidth, setIndexWidth] = useState(48)

  useEffect(() => {
    const el = indexCell.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setIndexWidth(e.contentRect.width + CELL_PADDING))
    ro.observe(el)
    return () => ro.disconnect()
  }, [j.status])

  useEffect(() => {
    dispatch(loadClub())
  }, [dispatch])

  // whatever selected the band — a click, a shared link, the back button — its
  // runners are fetched here, once
  useEffect(() => {
    if (j.band && !j.loaded[j.band]) dispatch(loadBand(j.band))
  }, [j.band, j.loaded, dispatch])

  // a name is rarely in the band you happen to be on, so searching pulls in the rest
  useEffect(() => {
    if (!searching) return
    for (const band of j.bands) if (!j.loaded[band.id]) dispatch(loadBand(band.id))
  }, [searching, j.bands, j.loaded, dispatch])

  const exportCsv = () => {
    const csv = toCsv(
      [t.col.name, t.col.birthYear, t.col.club, t.col.town, t.jubilee.finishes, t.jubilee.best, ...years.map(String)],
      // the file covers the whole band or search, not just the page on screen
      allOnPage.map((m) => [m.n, m.y ?? '', m.c, m.t, m.finishes, m.best, ...years.map((y) => m.r[String(y)] ?? '')]),
    )
    downloadCsv(`jubileumi-futok-${searching ? 'kereses' : j.band}.csv`, csv)
  }

  /** Open this member's profile: the name and birth year are already known here. */
  const openRunner = (m: ClubMember) => {
    dispatch(setTab('runner'))
    searchRunner(dispatch, { name: m.n, yob: m.y, exact: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="text-brand size-5" /> {t.jubilee.title}
          </CardTitle>
          <CardDescription>{t.jubilee.description(MIN_FINISHES)}</CardDescription>
          <CardAction>
            <ShareLink />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            {/* searching pulls in every band, so it waits for a deliberate submit */}
            <form
              className="flex min-w-0 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (canSearch) dispatch(setQuery(draft.trim()))
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  className="pl-8"
                  aria-label={t.jubilee.search}
                  placeholder={t.jubilee.search}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                {searching && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2"
                    aria-label={t.jubilee.clearSearch}
                    onClick={() => {
                      setDraft('')
                      dispatch(setQuery(''))
                    }}
                  >
                    <X />
                  </Button>
                )}
              </div>
              <Button type="submit" variant="brand" size="sm" disabled={!canSearch}>
                <Search /> {t.jubilee.searchButton}
              </Button>
            </form>
            <Button
              variant="outline"
              size="sm"
              disabled={j.topUp === 'running' || j.topUp === 'done'}
              onClick={() => dispatch(topUpFromApi())}
            >
              {j.topUp === 'running' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {j.topUp === 'done' ? t.jubilee.upToDate : t.jubilee.addLatest}
            </Button>
          </div>

          {draft.trim().length > 0 && draft.trim().length < MIN_QUERY_LENGTH && (
            <p className="text-muted-foreground text-xs">{t.jubilee.minQuery(MIN_QUERY_LENGTH)}</p>
          )}

          {/* one page per band of finishes: only that page's file is downloaded */}
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">{t.jubilee.bandsLabel}</span>
            <div className="flex flex-wrap gap-1.5">
              {bands.map((band) => (
                <button
                  key={band.id}
                  type="button"
                  aria-pressed={!searching && band.id === j.band}
                  disabled={searching}
                  onClick={() => dispatch(setBand(band.id))}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors disabled:opacity-50',
                    !searching && band.id === j.band
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-accent',
                  )}
                >
                  {bandLabel(band.id)}
                  <span className={cn('text-xs', !searching && band.id === j.band ? 'opacity-80' : 'text-muted-foreground')}>
                    {band.runners}
                  </span>
                  {j.loadingBands.includes(band.id) && <Loader2 className="size-3 animate-spin" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="brand">{t.jubilee.shown(allOnPage.length)}</Badge>
            {searching && <Badge>{t.jubilee.searchedBands(loadedMembers.length)}</Badge>}
            {j.addedYears.length > 0 && (
              <Badge variant="secondary">{t.jubilee.addedYears(j.addedYears.join(', '))}</Badge>
            )}
            {j.topUp === 'running' && (
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Loader2 className="size-3.5 animate-spin" />
                {t.jubilee.reading(j.pendingYears.join(', '))}
              </span>
            )}
            <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={!members.length}>
              <Download /> {t.common.downloadCsv}
            </Button>
          </div>

          {j.status === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>{t.jubilee.failed}</AlertTitle>
              <AlertDescription>{j.error}</AlertDescription>
            </Alert>
          )}
          {j.topUp === 'failed' && j.status === 'ready' && (
            <Alert>
              <AlertTitle>{t.jubilee.topUpFailed}</AlertTitle>
              <AlertDescription>{t.jubilee.topUpFailedHint}</AlertDescription>
            </Alert>
          )}
          <p className="text-muted-foreground text-xs">
            {t.jubilee.sourceNote(j.source || 'BSI')} {t.jubilee.noTimeNote}
          </p>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardContent>
          {j.status === 'loading' && (
            <div className="flex flex-col gap-2 py-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}

          {j.status === 'ready' && (
            <>
              {/* the wide year grid is unusable on a phone: cards there instead */}
              <div className="hidden rounded-md border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead ref={indexCell} className="bg-table-head sticky left-0 z-20">
                        #
                      </TableHead>
                      <TableHead
                        className="bg-table-head sticky z-20 shadow-[1px_0_0_var(--border)]"
                        style={{ left: indexWidth }}
                      >
                        {t.col.name}
                      </TableHead>
                      <TableHead className="text-right">{t.jubilee.finishes}</TableHead>
                      <TableHead>{t.col.born}</TableHead>
                      <TableHead>{t.col.town}</TableHead>
                      <TableHead>{t.jubilee.best}</TableHead>
                      {years.map((y) => (
                        <TableHead key={y} className="text-center tabular-nums">
                          {y}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m, i) => (
                      <TableRow key={`${m.n}-${m.y ?? ''}-${i}`} className="group/row">
                        <TableCell className="text-muted-foreground bg-card group-hover/row:bg-table-row-hover sticky left-0 z-20 tabular-nums">
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell
                          className="bg-card group-hover/row:bg-table-row-hover sticky z-20 shadow-[1px_0_0_var(--border)]"
                          style={{ left: indexWidth }}
                        >
                          <button
                            type="button"
                            title={t.common.openRunner}
                            onClick={() => openRunner(m)}
                            className="text-primary decoration-brand cursor-pointer text-left font-medium decoration-2 underline-offset-4 hover:underline"
                          >
                            {m.n}
                          </button>
                          {m.c && <span className="text-muted-foreground block text-xs">{m.c}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="brand">{m.finishes}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{m.y ?? ''}</TableCell>
                        <TableCell>{m.t}</TableCell>
                        <TableCell className="tabular-nums">{m.best || '–'}</TableCell>
                        {years.map((y) => {
                          const time = m.r[String(y)]
                          return (
                            <TableCell
                              key={y}
                              className={cn(
                                'text-center text-xs tabular-nums',
                                !time && 'text-muted-foreground/40',
                                time && m.live.includes(y) && 'text-brand font-medium',
                              )}
                              title={time && m.live.includes(y) ? t.jubilee.fromApi : undefined}
                            >
                              {hasTime(time) ? time.slice(0, 5) : time ? '✓' : '·'}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="flex flex-col gap-2 sm:hidden">
                {members.map((m, i) => (
                  <li key={`${m.n}-${m.y ?? ''}-${i}`} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openRunner(m)}
                          className="text-primary decoration-brand text-left font-medium decoration-2 underline-offset-4"
                        >
                          {m.n}
                        </button>
                        <div className="text-muted-foreground mt-0.5 text-xs">
                          {[m.y ?? '', m.t, m.c].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge variant="brand">{t.jubilee.finishCount(m.finishes)}</Badge>
                        {m.best && (
                          <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                            {t.jubilee.bestShort(m.best)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(m.r)
                        .sort(([a], [b]) => Number(b) - Number(a))
                        .map(([year, time]) => (
                          <span
                            key={year}
                            className={cn(
                              'bg-muted/60 rounded px-1.5 py-0.5 text-xs tabular-nums',
                              m.live.includes(Number(year)) && 'text-brand',
                            )}
                          >
                            {year}{' '}
                            <span className="text-muted-foreground">{hasTime(time) ? time.slice(0, 5) : '✓'}</span>
                          </span>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>


          {pageCount > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm">
              <span className="text-muted-foreground">
                {t.jubilee.rangeOf(
                  (page - 1) * PAGE_SIZE + 1,
                  Math.min(page * PAGE_SIZE, allOnPage.length),
                  allOnPage.length,
                )}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={t.results.prevPage}
                  disabled={page <= 1}
                  onClick={() => dispatch(setPage(page - 1))}
                >
                  <ChevronLeft />
                </Button>
                <span className="whitespace-nowrap tabular-nums">
                  {page} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={t.results.nextPage}
                  disabled={page >= pageCount}
                  onClick={() => dispatch(setPage(page + 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}

              {!members.length && (
                <p className="text-muted-foreground py-10 text-center text-sm">{t.jubilee.none}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
